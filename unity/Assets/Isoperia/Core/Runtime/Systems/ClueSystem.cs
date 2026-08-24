using System;
using System.Collections.Generic;
using Isoperia.Core.Components;
using Isoperia.Core.Content;
using Isoperia.Core.Save;
using Isoperia.Core.Sim;
using Isoperia.Core.State;
using Isoperia.Core.World;

namespace Isoperia.Core.Systems
{
    public enum ClueReadFailure { None, NotAClue, NoneCarried, AlreadyActive, NoSites }

    public enum ClueDigFailure { None, NoClue, WrongTile }

    public sealed class ClueReward
    {
        public int Coins;
        public List<KeyValuePair<string, int>> Items = new List<KeyValuePair<string, int>>();
        public string Unique;
    }

    public sealed class DigOutcome
    {
        public bool Ok;
        public ClueDigFailure Reason;
        public bool Done;
        public int Step;
        public int Total;
        public ClueReward Reward;
    }

    /// <summary>
    /// Clue scroll hunts. Port of <c>src/systems/ClueSystem.ts</c>.
    ///
    /// One hunt at a time. An inventory stack holds only an id and a count, so a
    /// scroll cannot carry which-tile-and-which-step on itself — reading it
    /// consumes the scroll and writes the hunt onto the player instead. That is
    /// also what keeps the map to a single marker, which is the difference
    /// between a treasure hunt and a to-do list.
    /// </summary>
    public sealed class ClueSystem
    {
        /// <summary>Dig sites are never packed closer than this, in Manhattan tiles.</summary>
        public const int MinApart = 4;

        /// <summary>Give up placing sites after this many tries rather than looping forever.</summary>
        public const int MaxAttempts = 6000;

        private readonly GameState _state;
        private readonly Grid _grid;
        private readonly ContentDatabase _content;
        private readonly Func<uint> _seedSource;

        /// <param name="seedSource">
        /// Supplies the hunt seed. Injected because the TypeScript mixes the
        /// clock with Math.random, which cannot be reproduced in a test — and
        /// because the seed is STORED, so a hunt must replay identically from a
        /// save however it was first chosen.
        /// </param>
        public ClueSystem(GameState state, Grid grid, ContentDatabase content, Func<uint> seedSource)
        {
            _state = state ?? throw new ArgumentNullException(nameof(state));
            _grid = grid ?? throw new ArgumentNullException(nameof(grid));
            _content = content ?? throw new ArgumentNullException(nameof(content));
            _seedSource = seedSource ?? throw new ArgumentNullException(nameof(seedSource));
        }

        public ActiveClue Active => _state.Player.Clue;

        private JsonValue Tier(string tier)
        {
            JsonValue t = _content.Table("clues", "CLUE_TIERS")[tier];
            return t.IsNull ? null : t;
        }

        /// <summary>The tier a scroll item starts, or null if it is not a scroll.</summary>
        public JsonValue TierForItem(string itemId)
        {
            JsonValue list = _content.Table("clues", "CLUE_TIER_LIST");

            for (int i = 0; i < list.Count; i++)
            {
                JsonValue entry = list[i];

                // CLUE_TIER_LIST may hold tier ids or whole definitions
                // depending on how the data is authored; accept both rather than
                // depending on which.
                JsonValue def = entry.Kind == JsonKind.String ? Tier(entry.AsString("")) : entry;
                if (def == null || def.IsNull) continue;

                if (def["itemId"].AsString(null) == itemId) return def;
            }

            return null;
        }

        /// <summary>The tile to dig right now, or null when no hunt is running.</summary>
        public (int X, int Y)? CurrentSite()
        {
            ActiveClue c = Active;
            if (c == null || c.Step < 0 || c.Step >= c.Sites.Count) return null;
            return c.Sites[c.Step];
        }

        /// <summary>
        /// A tile can hold a dig site if you can stand on it and it is not the
        /// town centre. Digging up the market square would be a poor clue.
        /// </summary>
        private bool IsCandidate(int x, int y)
        {
            Tile t = _grid.At(x, y);
            if (t == null) return false;
            return _grid.IsWalkable(x, y) && t.ZoneId != ZoneIds.TownCenter;
        }

        /// <summary>
        /// Pick the hunt's dig sites from a seed.
        ///
        /// DRAW ORDER IS THE CONTRACT — four draws per attempt, always in this
        /// order: ring, radius, position along the side, then which side. An
        /// attempt that is rejected still consumed all four. Reordering them, or
        /// skipping the remaining draws on an early reject, produces a different
        /// hunt from the same seed, and the seed is stored in the save.
        /// </summary>
        public List<(int X, int Y)> ChooseSites(JsonValue def, uint seed, int size)
        {
            var rnd = new Mulberry32((int)seed);

            int centre = size / 2;
            int chunk = Math.Max(1, size / 7);        // matches the world's ring bands
            int steps = (int)def["steps"].AsNumber(1);
            int minRing = (int)def["minRing"].AsNumber(1);
            int maxRing = (int)def["maxRing"].AsNumber(1);

            var sites = new List<(int X, int Y)>();

            for (int attempt = 0; attempt < MaxAttempts && sites.Count < steps; attempt++)
            {
                int ring = minRing + (int)Math.Floor(rnd.Next() * (maxRing - minRing + 1));
                int r = ring * chunk - (int)Math.Floor(rnd.Next() * chunk);
                int along = (int)Math.Floor(rnd.Next() * (2 * r + 1)) - r;
                int side = (int)Math.Floor(rnd.Next() * 4);

                int x = centre + (side == 0 || side == 1 ? along : side == 2 ? -r : r);
                int y = centre + (side == 0 ? -r : side == 1 ? r : along);

                if (x < 1 || y < 1 || x >= size - 1 || y >= size - 1) continue;
                if (!IsCandidate(x, y)) continue;

                bool tooClose = false;
                foreach ((int X, int Y) s in sites)
                    if (Math.Abs(s.X - x) + Math.Abs(s.Y - y) < MinApart) { tooClose = true; break; }
                if (tooClose) continue;

                sites.Add((x, y));
            }

            return sites;
        }

        public bool TryRead(string itemId, out string hint, out ClueReadFailure reason)
        {
            hint = null;

            JsonValue def = TierForItem(itemId);
            if (def == null) { reason = ClueReadFailure.NotAClue; return false; }
            if (Active != null) { reason = ClueReadFailure.AlreadyActive; return false; }
            if (_state.Player.Inventory.Count(itemId) < 1) { reason = ClueReadFailure.NoneCarried; return false; }

            uint seed = _seedSource();
            List<(int X, int Y)> sites = ChooseSites(def, seed, _grid.Width);

            // Not enough room on this map for a hunt of this tier. The scroll is
            // NOT consumed — failing to place sites is the game's problem, not
            // the player's.
            if (sites.Count < (int)def["steps"].AsNumber(1)) { reason = ClueReadFailure.NoSites; return false; }

            _state.Player.Inventory.Remove(itemId, 1);
            _state.Player.Clue = new ActiveClue
            {
                Tier = def["tier"].AsString(null),
                Seed = seed,
                Step = 0,
                Sites = sites,
            };

            hint = Hint();
            reason = ClueReadFailure.None;
            return true;
        }

        /// <summary>A written hint for the current step, or null.</summary>
        public string Hint()
        {
            (int X, int Y)? site = CurrentSite();
            if (!site.HasValue) return null;

            Tile t = _grid.At(site.Value.X, site.Value.Y);
            return HintFor(site.Value.X, site.Value.Y, _grid.Width, t?.Biome);
        }

        /// <summary>
        /// Turns a location into prose. Pure, so it is ported rather than left to
        /// the UI: the wording is part of the puzzle's difficulty.
        /// </summary>
        public static string HintFor(int x, int y, int size, Biome? biome)
        {
            int centre = size / 2;
            int dx = x - centre;
            int dy = y - centre;

            string ns = dy < -2 ? "north" : dy > 2 ? "south" : "";
            string ew = dx > 2 ? "east" : dx < -2 ? "west" : "";
            string dir = ns + (ns.Length > 0 && ew.Length > 0 ? "-" : "") + ew;

            int dist = Math.Max(Math.Abs(dx), Math.Abs(dy));
            string far = dist > size / 3.0 ? "far out in"
                       : dist > size / 5.0 ? "well into"
                       : "just outside";

            string where = dir.Length > 0 ? $"{far} the {dir} reaches" : "in the heart of the settlement";

            string soil = "";
            if (biome.HasValue)
            {
                switch (biome.Value)
                {
                    case Biome.Meadow: soil = ", where the grass grows even"; break;
                    case Biome.Forest: soil = ", beneath the close-standing trees"; break;
                    case Biome.Snow: soil = ", where the ground stays hard and cold"; break;
                    case Biome.Swamp: soil = ", on the soft, wet ground"; break;
                }
            }

            return $"Dig {where}{soil}.";
        }

        public bool IsDigTile(int x, int y)
        {
            (int X, int Y)? s = CurrentSite();
            return s.HasValue && s.Value.X == x && s.Value.Y == y;
        }

        /// <summary>
        /// Dig. Advances the hunt, or finishes it and pays out.
        ///
        /// THE REWARD IS ROLLED HERE, NEVER ON READ. A player who reloads before
        /// the last dig gets a different roll — the same deal every drop table in
        /// the game offers. Rolling at read would make the prize a property of
        /// the save file instead.
        /// </summary>
        public DigOutcome Dig(int x, int y, IRandom rng)
        {
            ActiveClue c = Active;
            if (c == null) return new DigOutcome { Reason = ClueDigFailure.NoClue };
            if (!IsDigTile(x, y)) return new DigOutcome { Reason = ClueDigFailure.WrongTile };

            JsonValue def = Tier(c.Tier);
            c.Step += 1;

            if (c.Step < c.Sites.Count)
            {
                return new DigOutcome
                {
                    Ok = true, Done = false, Reason = ClueDigFailure.None,
                    Step = c.Step, Total = c.Sites.Count,
                };
            }

            _state.Player.Clue = null;

            _state.Player.MetaCounters.TryGetValue("clues_done", out double done);
            _state.Player.MetaCounters["clues_done"] = done + 1;

            return new DigOutcome
            {
                Ok = true, Done = true, Reason = ClueDigFailure.None,
                Step = c.Step, Total = c.Sites.Count,
                Reward = Payout(def, rng),
            };
        }

        /// <summary>Abandon the hunt. The scroll is gone — it was read.</summary>
        public bool Abandon()
        {
            if (Active == null) return false;
            _state.Player.Clue = null;
            return true;
        }

        /// <summary>
        /// DRAW ORDER: coins first, then one draw per loot row in table order,
        /// then the unique check last — always, and always exactly once each.
        /// </summary>
        private ClueReward Payout(JsonValue def, IRandom rng)
        {
            InventoryComponent inv = _state.Player.Inventory;
            var reward = new ClueReward();

            JsonValue coins = def["coins"];
            reward.Coins = Roll(rng, (int)coins["min"].AsNumber(0), (int)coins["max"].AsNumber(0));
            inv.Add(ShopSystem.Coins, reward.Coins);

            JsonValue loot = def["loot"];
            for (int i = 0; i < loot.Count; i++)
            {
                JsonValue l = loot[i];
                int amount = Roll(rng, (int)l["min"].AsNumber(0), (int)l["max"].AsNumber(0));

                string itemId = l["itemId"].AsString(null);
                if (itemId == null) continue;

                // Add clamps to the storage cap, so report what actually landed
                // rather than what was rolled.
                int stored = inv.Add(itemId, amount);
                if (stored <= 0) continue;

                reward.Items.Add(new KeyValuePair<string, int>(itemId, stored));
                _state.CollectionLog.Add(itemId);
            }

            JsonValue unique = def["unique"];
            if (rng.Next() < unique["chance"].AsNumber(0))
            {
                // Uniques are non-stacking gear and exempt from the bulk cap, so
                // they always fit.
                string id = unique["itemId"].AsString(null);
                if (id != null)
                {
                    inv.Add(id, 1);
                    _state.CollectionLog.Add(id);
                    reward.Unique = id;
                }
            }

            return reward;
        }

        private static int Roll(IRandom rng, int min, int max) =>
            min + (int)Math.Floor(rng.Next() * (max - min + 1));
    }
}
