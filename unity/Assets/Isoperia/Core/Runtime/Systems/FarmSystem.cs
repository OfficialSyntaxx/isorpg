using System;
using System.Collections.Generic;
using Isoperia.Core.Components;
using Isoperia.Core.Content;
using Isoperia.Core.Data;
using Isoperia.Core.Save;
using Isoperia.Core.Sim;
using Isoperia.Core.State;

namespace Isoperia.Core.Systems
{
    public enum PlantFailure { None, UnknownSeed, Level, NoSeed, NoBed }

    public enum HarvestFailure { None, Empty, Unripe, InventoryFull }

    public sealed class HarvestResult
    {
        public bool Ok;
        public HarvestFailure Reason;
        public string ItemId;
        public int Amount;
        public int Xp;
    }

    /// <summary>
    /// Farming. Port of <c>src/systems/FarmSystem.ts</c>.
    ///
    /// CROPS GROW ON WALL-CLOCK TIME, stored as a plant timestamp. That is the
    /// whole design, and it is why this system needs no offline pass: a bed sown
    /// before the tab closed is simply ripe when the clock says so. Every other
    /// production system needed an explicit offline calculation and could be
    /// double-paid; this one cannot. Do not "improve" it into a tick accumulator.
    ///
    /// The clock is injected rather than read from the system, so growth can be
    /// tested without waiting five minutes.
    /// </summary>
    public sealed class FarmSystem
    {
        private readonly GameState _state;
        private readonly ContentDatabase _content;
        private readonly IRandom _rng;
        private readonly Func<long> _now;
        private readonly Func<int> _beds;

        public FarmSystem(GameState state, ContentDatabase content, IRandom rng,
                          Func<long> nowMsProvider, Func<int> bedProvider)
        {
            _state = state ?? throw new ArgumentNullException(nameof(state));
            _content = content ?? throw new ArgumentNullException(nameof(content));
            _rng = rng ?? throw new ArgumentNullException(nameof(rng));
            _now = nowMsProvider ?? throw new ArgumentNullException(nameof(nowMsProvider));
            _beds = bedProvider ?? throw new ArgumentNullException(nameof(bedProvider));
        }

        /// <summary>
        /// Beds available = total FARM_PLOT *levels*, not the number of plots.
        /// Every passive effect scales on levels, so a level-3 plot gives three
        /// beds; the alternative made upgrading cost 2x then 3x the materials and
        /// buy nothing.
        /// </summary>
        public static int BedsFrom(GameState state)
        {
            int n = 0;
            foreach (TownBuilding b in state.Town.Buildings)
                if (b.Type == "FARM_PLOT") n += Math.Max(1, b.Level);
            return n;
        }

        public int BedCount => Math.Max(0, _beds());

        public int Level => _state.Player.Skills.LevelOf(Skills.Farming);

        private List<FarmPlot> Plots => _state.Town.FarmPlots;

        /// <summary>
        /// Match the bed array to the buildings.
        ///
        /// Only EMPTY TRAILING beds are removed. Shrinking past a growing crop
        /// would silently bin it, and a demolished plot must not destroy what is
        /// already in the ground.
        /// </summary>
        private void Sync()
        {
            int want = BedCount;
            List<FarmPlot> p = Plots;

            while (p.Count < want) p.Add(null);
            while (p.Count > want && p.Count > 0 && p[p.Count - 1] == null) p.RemoveAt(p.Count - 1);
        }

        private JsonValue Seed(string id)
        {
            JsonValue s = _content.Seeds[id];
            return s.IsNull ? null : s;
        }

        /// <summary>0..1, clamped. 1 means ripe.</summary>
        public double GrowthAt(FarmPlot plot, long now)
        {
            if (plot == null) return 0;

            JsonValue def = Seed(plot.SeedId);
            double grow = def == null ? 0 : def["growMs"].AsNumber(0);
            if (def == null || grow <= 0) return 1;

            return Math.Max(0, Math.Min(1, (now - plot.PlantedAt) / grow));
        }

        public bool IsRipe(FarmPlot plot, long now) => GrowthAt(plot, now) >= 1;

        public string GrowthLabel(FarmPlot plot, long now)
        {
            JsonValue def = plot == null ? null : Seed(plot.SeedId);
            if (def == null) return "—";

            double leftMs = def["growMs"].AsNumber(0) - (now - plot.PlantedAt);
            if (leftMs <= 0) return "Ripe";

            long mins = (long)Math.Ceiling(leftMs / 60000.0);
            return mins >= 60 ? $"{mins / 60}h {mins % 60}m left" : $"{mins}m left";
        }

        /// <summary>Index of the first free bed, or -1.</summary>
        private int FreeBed()
        {
            Sync();
            for (int i = 0; i < Plots.Count; i++) if (Plots[i] == null) return i;
            return -1;
        }

        public bool TryPlant(string seedId, out int bed, out PlantFailure reason)
        {
            bed = -1;

            JsonValue def = Seed(seedId);
            if (def == null) { reason = PlantFailure.UnknownSeed; return false; }

            if (Level < (int)def["levelReq"].AsNumber(1)) { reason = PlantFailure.Level; return false; }
            if (_state.Player.Inventory.Count(seedId) < 1) { reason = PlantFailure.NoSeed; return false; }

            int free = FreeBed();
            if (free < 0) { reason = PlantFailure.NoBed; return false; }

            _state.Player.Inventory.Remove(seedId, 1);
            Plots[free] = new FarmPlot { SeedId = seedId, PlantedAt = _now() };

            bed = free;
            reason = PlantFailure.None;
            return true;
        }

        /// <summary>
        /// Harvest one bed.
        ///
        /// Takes exactly ONE random draw, and only once every gate has passed —
        /// so a failed harvest does not advance the stream. Callers that harvest
        /// several beds therefore consume one draw per SUCCESSFUL bed.
        /// </summary>
        public HarvestResult Harvest(int bed)
        {
            Sync();

            if (bed < 0 || bed >= Plots.Count || Plots[bed] == null)
                return new HarvestResult { Reason = HarvestFailure.Empty };

            FarmPlot plot = Plots[bed];
            long now = _now();

            if (!IsRipe(plot, now))
                return new HarvestResult { Reason = HarvestFailure.Unripe };

            JsonValue def = Seed(plot.SeedId);
            if (def == null)
            {
                // The seed left the content tables while a crop was in the
                // ground. Clear the bed rather than stranding it forever.
                Plots[bed] = null;
                return new HarvestResult { Reason = HarvestFailure.Empty };
            }

            string masteryKey = def["masteryKey"].AsString("");
            JsonValue produce = def["produce"];
            string itemId = produce["itemId"].AsString(null);
            int min = (int)produce["min"].AsNumber(1);
            int max = (int)produce["max"].AsNumber(1);

            // Mastery raises the yield FLOOR rather than adding a bonus roll: at
            // mastery 1 the harvest spans the crop's full range, at 99 it is
            // always the maximum. One knob, and the range printed in the wiki
            // stays literally true.
            _state.Player.Skills.Get(Skills.Farming).Mastery.TryGetValue(masteryKey, out double mXp);
            int m = MasteryTable.LevelFromXp(mXp);

            int span = max - min;
            int lo = min + (int)Math.Floor(span * ((m - 1) / 98.0));
            int yielded = lo + (int)Math.Floor(_rng.Next() * (max - lo + 1));

            InventoryComponent inv = _state.Player.Inventory;

            // Checked BEFORE the bed is cleared, so a full bag leaves the crop in
            // the ground rather than destroying it. (LabourSystem.Claim does the
            // opposite and loses the overflow — that asymmetry is in the
            // TypeScript too.)
            if (inv.IsBulkItem(itemId) && inv.StoredAmount() + yielded > inv.StorageCap)
                return new HarvestResult { Reason = HarvestFailure.InventoryFull };

            Plots[bed] = null;
            inv.Add(itemId, yielded);

            int xp = (int)def["xp"].AsNumber(0);
            _state.Player.Skills.AddXp(Skills.Farming, xp);
            _state.Player.Skills.AddMasteryXp(Skills.Farming, masteryKey, yielded);
            _state.CollectionLog.Add(itemId);

            return new HarvestResult
            {
                Ok = true, Reason = HarvestFailure.None,
                ItemId = itemId, Amount = yielded, Xp = xp,
            };
        }

        /// <summary>Harvest every ripe bed, totalled per item for one summary.</summary>
        public List<KeyValuePair<string, int>> HarvestAll()
        {
            Sync();

            var got = new List<KeyValuePair<string, int>>();

            for (int i = 0; i < Plots.Count; i++)
            {
                HarvestResult r = Harvest(i);
                if (!r.Ok) continue;

                int at = got.FindIndex(g => g.Key == r.ItemId);
                if (at >= 0) got[at] = new KeyValuePair<string, int>(r.ItemId, got[at].Value + r.Amount);
                else got.Add(new KeyValuePair<string, int>(r.ItemId, r.Amount));
            }

            return got;
        }

        /// <summary>Beds ready right now — drives the Village button's badge.</summary>
        public int RipeCount()
        {
            Sync();
            long now = _now();

            int n = 0;
            foreach (FarmPlot p in Plots) if (p != null && IsRipe(p, now)) n++;
            return n;
        }
    }
}
