using System;
using System.Collections.Generic;
using Isoperia.Core.Components;
using Isoperia.Core.Sim;
using Isoperia.Core.State;

namespace Isoperia.Core.Save
{
    /// <summary>
    /// Where saves are written. Abstracted so Core stays free of platform code
    /// and so the load path (primary, then backup, then fresh) is testable with
    /// an in-memory store.
    /// </summary>
    public interface ISaveStore
    {
        bool WritePrimary(string payload);
        string ReadPrimary();

        bool WriteBackup(string payload);
        string ReadLatestBackup();

        /// <summary>
        /// Force writes through to durable storage.
        ///
        /// On every native platform this is a no-op: the write already hit the
        /// disk. On **WebGL it is mandatory**. Unity maps
        /// <c>Application.persistentDataPath</c> to an in-memory Emscripten
        /// filesystem backed by IndexedDB, and nothing reaches IndexedDB until
        /// <c>FS.syncfs</c> runs — so a save that is written and not flushed is
        /// silently lost the moment the tab closes. This is the single most
        /// likely data-loss bug in the whole port.
        /// </summary>
        /// <returns>False if the flush could not be started.</returns>
        bool Flush();
    }

    /// <summary>In-memory store, for tests and for a headless run.</summary>
    public sealed class MemorySaveStore : ISaveStore
    {
        public string Primary;
        public string Backup;
        public int FlushCount;

        /// <summary>Set to simulate a storage failure (quota exceeded, disk full).</summary>
        public bool FailWrites;

        public bool WritePrimary(string payload)
        {
            if (FailWrites) return false;
            Primary = payload;
            return true;
        }

        public string ReadPrimary() => Primary;

        public bool WriteBackup(string payload)
        {
            if (FailWrites) return false;
            Backup = payload;
            return true;
        }

        public string ReadLatestBackup() => Backup;

        public bool Flush()
        {
            FlushCount++;
            return true;
        }
    }

    public sealed class OfflineSummary
    {
        public bool CapApplied;
        public long AwaySeconds;
        public List<string> Lines = new List<string>();
        public double XpEarned;
    }

    public enum LoadOutcome { Primary, Backup, Fresh }

    public sealed class LoadResult
    {
        public LoadOutcome RecoveredFrom;
        public OfflineSummary Summary;
    }

    /// <summary>
    /// Persistence: autosave, sanitized load with backup fallback, JSON
    /// import/export, and offline progression. Port of
    /// <c>src/systems/SaveSystem.ts</c>.
    /// </summary>
    public sealed class SaveSystem
    {
        /// <summary>Autosave cadence in ticks — 20 ticks is about 12 seconds.</summary>
        public const int AutosaveEveryTicks = 20;

        /// <summary>Default offline cap. The Town Hall extends it to 12h.</summary>
        public const int DefaultOfflineCapSeconds = 8 * 3600;

        private readonly GameState _state;
        private readonly ISaveStore _store;

        /// <summary>Injected rather than read from the system clock, so offline
        /// progression is testable without waiting eight hours.</summary>
        private readonly Func<long> _now;

        private int _tickCount;

        /// <summary>Supplied by the Build system once it exists; the Town Hall
        /// raises the ceiling.</summary>
        public Func<double> OfflineCapHoursProvider =
            () => DefaultOfflineCapSeconds / 3600.0;

        /// <summary>
        /// The content tables. Optional: when unset, offline progression pays the
        /// Town Hall tax and villager labour but NO per-skill gathering, which is
        /// how this behaved for the whole of Phase 2b.
        ///
        /// Set rather than constructor-injected so every existing caller and test
        /// keeps working unchanged, and so a save can still be loaded and
        /// recovered when content is unavailable — losing a few hours of idle
        /// gathering is recoverable, refusing to load a save is not.
        /// </summary>
        public Content.ContentDatabase Content;

        public SaveSystem(GameState state, ISaveStore store, Func<long> nowMsProvider)
        {
            _state = state ?? throw new ArgumentNullException(nameof(state));
            _store = store ?? throw new ArgumentNullException(nameof(store));
            _now = nowMsProvider ?? throw new ArgumentNullException(nameof(nowMsProvider));
        }

        /// <summary>
        /// Offline Town Hall tax: 2 coins per hall level per ~6 second idle cycle.
        /// </summary>
        public static long OfflineTaxFor(int hallLevel, long awaySeconds)
        {
            if (hallLevel <= 0 || awaySeconds <= 0) return 0;
            long cycles = awaySeconds / 6;
            return hallLevel * 2L * Math.Max(0, cycles);
        }

        // ------------------------------------------------------------------
        // Serialization
        // ------------------------------------------------------------------

        /// <summary>Serialize to exactly the documented save schema.</summary>
        public JsonValue Serialize()
        {
            PlayerState p = _state.Player;

            var skills = JsonValue.Object();
            foreach (string id in Data.Skills.All)
            {
                SkillState s = p.Skills.Get(id);

                var mastery = JsonValue.Object();
                foreach (var kv in s.Mastery) mastery.Set(kv.Key, JsonValue.Number(kv.Value));

                var entry = JsonValue.Object();
                entry.Set("xp", JsonValue.Number(s.Xp));
                entry.Set("mastery", mastery);
                skills.Set(id, entry);
            }

            var inventory = JsonValue.Array();
            foreach (ItemStack st in p.Inventory.Items)
            {
                var o = JsonValue.Object();
                o.Set("id", JsonValue.String(st.Id));
                o.Set("amount", JsonValue.Number(st.Amount));
                inventory.Add(o);
            }

            var equipped = JsonValue.Object();
            foreach (var kv in p.Equipped) equipped.Set(kv.Key, JsonValue.String(kv.Value));

            var position = JsonValue.Object();
            position.Set("x", JsonValue.Number(p.Pos.Gx));
            position.Set("y", JsonValue.Number(p.Pos.Gy));

            var stats = JsonValue.Object();
            stats.Set("hp", JsonValue.Number(p.Health.Hp));
            stats.Set("maxHp", JsonValue.Number(p.Health.MaxHp));

            var meta = JsonValue.Object();
            meta.Set("kills", NumObject(p.MetaKills));
            meta.Set("achievements", StrArray(p.MetaAchievements));
            meta.Set("counters", NumObject(p.MetaCounters));

            JsonValue clue = JsonValue.Null;
            if (p.Clue != null)
            {
                var sites = JsonValue.Array();
                foreach (var s in p.Clue.Sites)
                {
                    var so = JsonValue.Object();
                    so.Set("x", JsonValue.Number(s.X));
                    so.Set("y", JsonValue.Number(s.Y));
                    sites.Add(so);
                }

                clue = JsonValue.Object();
                clue.Set("tier", JsonValue.String(p.Clue.Tier));
                clue.Set("seed", JsonValue.Number(p.Clue.Seed));
                clue.Set("step", JsonValue.Number(p.Clue.Step));
                clue.Set("sites", sites);
            }

            var player = JsonValue.Object();
            player.Set("name", JsonValue.String(p.Name));
            player.Set("position", position);
            player.Set("stats", stats);
            player.Set("skills", skills);
            player.Set("inventory", inventory);
            player.Set("equipped", equipped);
            player.Set("journal", StrArray(p.Journal));
            player.Set("meta", meta);
            player.Set("clue", clue);
            player.Set("resolve", JsonValue.Number(p.Resolve));
            player.Set("activeBuff", p.ActiveBuff == null ? JsonValue.Null : JsonValue.String(p.ActiveBuff));
            player.Set("specialEnergy", JsonValue.Number(p.SpecialEnergy));

            var buildings = JsonValue.Array();
            foreach (TownBuilding b in _state.Town.Buildings)
            {
                var o = JsonValue.Object();
                o.Set("id", JsonValue.String(b.Id));
                o.Set("type", JsonValue.String(b.Type));
                o.Set("x", JsonValue.Number(b.X));
                o.Set("y", JsonValue.Number(b.Y));
                o.Set("level", JsonValue.Number(b.Level));
                buildings.Add(o);
            }

            var labour = JsonValue.Object();
            labour.Set("assignments", StrObject(_state.Town.Labour.Assignments));
            labour.Set("stock", NumObject(_state.Town.Labour.Stock));
            labour.Set("acc", NumObject(_state.Town.Labour.Acc));
            labour.Set("worked", NumObject(_state.Town.Labour.Worked));

            var market = JsonValue.Object();
            market.Set("supply", NumObject(_state.Town.MarketSupply));
            market.Set("demand", NumObject(_state.Town.MarketDemand));

            var plots = JsonValue.Array();
            foreach (FarmPlot plot in _state.Town.FarmPlots)
            {
                if (plot == null) { plots.Add(JsonValue.Null); continue; }
                var o = JsonValue.Object();
                o.Set("seedId", JsonValue.String(plot.SeedId));
                o.Set("plantedAt", JsonValue.Number(plot.PlantedAt));
                plots.Add(o);
            }

            var farm = JsonValue.Object();
            farm.Set("plots", plots);

            var town = JsonValue.Object();
            town.Set("buildings", buildings);
            town.Set("labour", labour);
            town.Set("market", market);
            town.Set("farm", farm);

            var log = JsonValue.Object();
            var unlocked = JsonValue.Array();
            foreach (string s in _state.CollectionLog) unlocked.Add(JsonValue.String(s));
            log.Set("unlocked", unlocked);

            var settings = JsonValue.Object();
            settings.Set("autoEatPct", JsonValue.Number(_state.Settings.AutoEatPct));
            settings.Set("attackStyle", JsonValue.String(_state.Settings.AttackStyle));

            var clock = JsonValue.Object();
            clock.Set("minute", JsonValue.Number(_state.ClockMinute));
            clock.Set("day", JsonValue.Number(_state.ClockDay));

            var map = JsonValue.Object();
            map.Set("discovered", StrArray(p.MapDiscovered));
            map.Set("fastTravel", JsonValue.Bool(p.MapFastTravel));
            map.Set("explored", NumArray(p.MapExplored));

            var resources = JsonValue.Array();
            foreach (var pair in _state.ResourceNodes)
            {
                var node = JsonValue.Object();
                node.Set("id", JsonValue.String(pair.Key));
                node.Set("remaining", JsonValue.Number(pair.Value.Remaining));
                node.Set("respawnAt", JsonValue.Number(pair.Value.RespawnAt));
                resources.Add(node);
            }

            var root = JsonValue.Object();
            root.Set("version", JsonValue.String(_state.Version));
            root.Set("timestamp", JsonValue.Number(_now()));
            root.Set("player", player);
            root.Set("town", town);
            root.Set("collectionLog", log);
            root.Set("settings", settings);
            root.Set("clock", clock);
            root.Set("map", map);
            root.Set("resources", resources);

            return root;
        }

        /// <summary>Pretty-printed save, for the player's export file.</summary>
        public string ExportJson() => JsonValue.Write(Serialize(), indented: true);

        // ------------------------------------------------------------------
        // Loading
        // ------------------------------------------------------------------

        /// <summary>Apply a payload onto live state, after sanitizing it.</summary>
        public bool Apply(JsonValue raw)
        {
            SanitizeResult res = Sanitizer.Sanitize(raw, _now());
            if (!res.Ok) return false;

            JsonValue s = res.State;
            PlayerState p = _state.Player;

            // The saved timestamp is what "how long were you away" is measured
            // from. Without carrying it across, offline progression measured from
            // process start — always ~0 — and silently paid out nothing.
            _state.Timestamp = (long)s["timestamp"].AsNumber();
            _state.Version = s["version"].AsString() ?? GameState.SaveVersion;

            p.Name = s["player"]["name"].AsString() ?? GameState.DefaultHeroName;
            p.Pos.Gx = (int)s["player"]["position"]["x"].AsNumber();
            p.Pos.Gy = (int)s["player"]["position"]["y"].AsNumber();
            p.Pos.Wx = p.Pos.Gx;
            p.Pos.Wz = p.Pos.Gy;

            p.Health.MaxHp = (int)s["player"]["stats"]["maxHp"].AsNumber();
            p.Health.Hp = (int)s["player"]["stats"]["hp"].AsNumber();

            foreach (string id in Data.Skills.All)
            {
                JsonValue sv = s["player"]["skills"][id];
                if (sv.IsNull) continue;

                SkillState target = p.Skills.Get(id);
                target.Xp = sv["xp"].AsNumber();
                target.Mastery = new Dictionary<string, double>();
                foreach (var kv in sv["mastery"].Members) target.Mastery[kv.Key] = kv.Value.AsNumber();
            }

            p.Inventory.Items = new List<ItemStack>();
            foreach (var e in s["player"]["inventory"].Items)
                p.Inventory.Items.Add(new ItemStack(e["id"].AsString(), (int)e["amount"].AsNumber()));

            p.Equipped = new Dictionary<string, string>();
            foreach (var kv in s["player"]["equipped"].Members) p.Equipped[kv.Key] = kv.Value.AsString();

            p.Journal = ReadStrList(s["player"]["journal"]);

            p.MetaKills = ReadNumMap(s["player"]["meta"]["kills"]);
            p.MetaAchievements = ReadStrList(s["player"]["meta"]["achievements"]);
            p.MetaCounters = ReadNumMap(s["player"]["meta"]["counters"]);

            JsonValue clue = s["player"]["clue"];
            if (clue.IsNull)
            {
                p.Clue = null;
            }
            else
            {
                p.Clue = new ActiveClue
                {
                    Tier = clue["tier"].AsString(),
                    Seed = clue["seed"].AsNumber(),
                    Step = (int)clue["step"].AsNumber(),
                    Sites = new List<(int, int)>(),
                };
                foreach (var site in clue["sites"].Items)
                    p.Clue.Sites.Add(((int)site["x"].AsNumber(), (int)site["y"].AsNumber()));
            }

            p.Resolve = (int)s["player"]["resolve"].AsNumber();
            p.ActiveBuff = s["player"]["activeBuff"].AsString();
            p.SpecialEnergy = (int)s["player"]["specialEnergy"].AsNumber();

            _state.Town.Buildings = new List<TownBuilding>();
            foreach (var b in s["town"]["buildings"].Items)
                _state.Town.Buildings.Add(new TownBuilding
                {
                    Id = b["id"].AsString(),
                    Type = b["type"].AsString(),
                    X = (int)b["x"].AsNumber(),
                    Y = (int)b["y"].AsNumber(),
                    Level = (int)b["level"].AsNumber(),
                });

            _state.Town.Labour.Assignments = ReadStrMap(s["town"]["labour"]["assignments"]);
            _state.Town.Labour.Stock = ReadNumMap(s["town"]["labour"]["stock"]);
            _state.Town.Labour.Acc = ReadNumMap(s["town"]["labour"]["acc"]);
            _state.Town.Labour.Worked = ReadNumMap(s["town"]["labour"]["worked"]);

            _state.Town.MarketSupply = ReadNumMap(s["town"]["market"]["supply"]);
            _state.Town.MarketDemand = ReadNumMap(s["town"]["market"]["demand"]);

            _state.Town.FarmPlots = new List<FarmPlot>();
            foreach (var plot in s["town"]["farm"]["plots"].Items)
                _state.Town.FarmPlots.Add(plot.IsNull ? null : new FarmPlot
                {
                    SeedId = plot["seedId"].AsString(),
                    PlantedAt = (long)plot["plantedAt"].AsNumber(),
                });

            _state.CollectionLog = new HashSet<string>(ReadStrList(s["collectionLog"]["unlocked"]));

            _state.Settings.AutoEatPct = (int)s["settings"]["autoEatPct"].AsNumber();
            _state.Settings.AttackStyle = s["settings"]["attackStyle"].AsString();

            _state.ClockMinute = (int)s["clock"]["minute"].AsNumber();
            _state.ClockDay = (int)s["clock"]["day"].AsNumber();

            p.MapDiscovered = ReadStrList(s["map"]["discovered"]);
            p.MapFastTravel = s["map"]["fastTravel"].AsBool();
            p.MapExplored = ReadNumList(s["map"]["explored"]);

            _state.ResourceNodes = new Dictionary<string, ResourceNodeState>();
            foreach (JsonValue node in s["resources"].Items)
            {
                _state.ResourceNodes[node["id"].AsString()] = new ResourceNodeState
                {
                    Remaining = (int)node["remaining"].AsNumber(),
                    RespawnAt = (long)node["respawnAt"].AsNumber(),
                };
            }

            return true;
        }

        /// <summary>
        /// Load: primary, then backup, then fresh. A save that parses but fails
        /// sanitizing is treated as absent so the backup still gets its chance —
        /// which is the entire point of keeping one.
        /// </summary>
        public LoadResult Load()
        {
            string primary = _store.ReadPrimary();
            if (primary != null)
            {
                JsonValue parsed = JsonValue.Parse(primary);
                if (parsed != null && Apply(parsed))
                    return new LoadResult { RecoveredFrom = LoadOutcome.Primary, Summary = ComputeOffline() };
            }

            string backup = _store.ReadLatestBackup();
            if (backup != null)
            {
                JsonValue parsed = JsonValue.Parse(backup);
                if (parsed != null && Apply(parsed))
                    return new LoadResult { RecoveredFrom = LoadOutcome.Backup, Summary = ComputeOffline() };
            }

            return new LoadResult { RecoveredFrom = LoadOutcome.Fresh };
        }

        // ------------------------------------------------------------------
        // Saving
        // ------------------------------------------------------------------

        /// <summary>Call once per simulation tick. Autosaves on cadence.</summary>
        public void OnTick(long tickIndex)
        {
            _tickCount++;
            if (_tickCount % AutosaveEveryTicks != 0) return;
            ForceSave();
        }

        /// <summary>
        /// Write immediately and flush. Returns false if the write failed.
        ///
        /// The flush is not optional on WebGL — see <see cref="ISaveStore.Flush"/>.
        /// A save is not durable until it has happened, so this is also what
        /// should run on pagehide, on visibilitychange, and before scene teardown.
        /// </summary>
        public bool ForceSave()
        {
            _state.Timestamp = _now();

            string payload = JsonValue.Write(Serialize());
            if (!_store.WritePrimary(payload)) return false;

            _store.WriteBackup(payload);
            _store.Flush();
            return true;
        }

        // ------------------------------------------------------------------
        // Offline progression
        // ------------------------------------------------------------------

        /// <summary>
        /// Fast-forward the capped idle window.
        ///
        /// The cap is a design decision, not a safety valve: 8 hours, or 12 with a
        /// Town Hall. Farming is excluded by construction — a bed stores only its
        /// sow time, so it ripens on the wall clock with nothing to catch up and
        /// no way to double-pay.
        ///
        /// NOTE (Phase 2d): per-skill idle gathering is not implemented here yet.
        /// It needs the RESOURCES and ITEMS tables, which are ported with the rest
        /// of the content data. The cap, the Town Hall tax, and the
        /// consume-the-window rule below are complete and correct; the gathering
        /// payout is the one piece still to land, and it slots into the marked
        /// gap without changing anything around it.
        /// </summary>
        public OfflineSummary ComputeOffline()
        {
            long now = _now();
            long awayMs = now - (_state.Timestamp == 0 ? now : _state.Timestamp);
            long awayS = Math.Max(0, (long)Math.Round(awayMs / 1000.0, MidpointRounding.AwayFromZero));

            double capSeconds = OfflineCapHoursProvider() * 3600.0;
            bool capApplied = awayS > capSeconds;
            long capS = (long)Math.Min(awayS, capSeconds);

            var summary = new OfflineSummary { CapApplied = capApplied, AwaySeconds = awayS };

            int capHours = (int)Math.Round(capSeconds / 3600.0, MidpointRounding.AwayFromZero);
            if (capHours > 8) summary.Lines.Add($"Town Hall: offline cap raised to {capHours}h");

            // Per-skill idle gathering. Each skill idles on the best resource it
            // can currently use, at the resource's base speed.
            //
            // Base speed DELIBERATELY: no tool bonus and no mastery discount,
            // unlike the online loop in SkillSystem.ActionTicks. That is what the
            // TypeScript does and it is the conservative direction — offline
            // should not out-earn playing.
            AccrueOfflineGathering(capS, summary);

            // The Town Hall keeps taxing while you are away.
            int hallLevel = 0;
            foreach (TownBuilding b in _state.Town.Buildings)
                if (b.Type == "TOWN_HALL") hallLevel += Math.Max(1, b.Level);

            long tax = OfflineTaxFor(hallLevel, capS);
            if (tax > 0)
            {
                int given = _state.Player.Inventory.Add("coins", (int)Math.Min(int.MaxValue, tax));
                if (given > 0) summary.Lines.Add($"Town Hall tax: {given} coins");
            }

            // Consume the elapsed window, so a repeat load cannot pay it twice.
            _state.Timestamp = now;

            return summary;
        }

        // ---- small helpers ---------------------------------------------------

        private static JsonValue StrArray(List<string> xs)
        {
            var a = JsonValue.Array();
            foreach (string s in xs) a.Add(JsonValue.String(s));
            return a;
        }

        private static JsonValue NumArray(List<double> xs)
        {
            var a = JsonValue.Array();
            foreach (double d in xs) a.Add(JsonValue.Number(d));
            return a;
        }

        private static JsonValue NumObject(Dictionary<string, double> m)
        {
            var o = JsonValue.Object();
            foreach (var kv in m) o.Set(kv.Key, JsonValue.Number(kv.Value));
            return o;
        }

        private static JsonValue StrObject(Dictionary<string, string> m)
        {
            var o = JsonValue.Object();
            foreach (var kv in m) o.Set(kv.Key, JsonValue.String(kv.Value));
            return o;
        }

        private static List<string> ReadStrList(JsonValue v)
        {
            var outp = new List<string>();
            foreach (var e in v.Items) if (e.Kind == JsonKind.String) outp.Add(e.AsString());
            return outp;
        }

        private static List<double> ReadNumList(JsonValue v)
        {
            var outp = new List<double>();
            foreach (var e in v.Items) if (e.IsFiniteNumber) outp.Add(e.AsNumber());
            return outp;
        }

        private static Dictionary<string, double> ReadNumMap(JsonValue v)
        {
            var outp = new Dictionary<string, double>();
            foreach (var kv in v.Members) outp[kv.Key] = kv.Value.AsNumber();
            return outp;
        }

        private static Dictionary<string, string> ReadStrMap(JsonValue v)
        {
            var outp = new Dictionary<string, string>();
            foreach (var kv in v.Members) outp[kv.Key] = kv.Value.AsString();
            return outp;
        }
        /// <summary>
        /// Fast-forwards idle gathering for the capped away-time.
        ///
        /// THE STORAGE CAP IS SHARED ACROSS EVERY SKILL, and that is the whole
        /// difficulty. An earlier version clamped each skill independently, so
        /// three gathering skills banked three times the cap. The fix is to ask
        /// for the full haul and let <see cref="InventoryComponent.Add"/> report
        /// what actually fit, then credit XP only for the actions whose drops
        /// were stored — which is why <c>done</c> is derived from <c>gained</c>
        /// rather than counted up front.
        /// </summary>
        private void AccrueOfflineGathering(long capS, OfflineSummary summary)
        {
            if (Content == null) return;

            JsonValue skillIds = Content.Table("skills", "SKILL_IDS");
            JsonValue resources = Content.Resources;

            for (int i = 0; i < skillIds.Count; i++)
            {
                string skill = skillIds[i].AsString(null);
                if (skill == null) continue;

                int level = _state.Player.Skills.LevelOf(skill);

                JsonValue best = BestResource(resources, skill, level);
                if (best == null) continue;

                double ticksPerAction = best["ticksPerAction"].AsNumber(0);
                if (ticksPerAction <= 0) continue;

                long actions = (long)Math.Floor(capS / (ticksPerAction * TickRunner.TickMs / 1000.0));
                if (actions <= 0) continue;

                JsonValue drops = best["drops"];
                if (drops.IsNull || drops.Count == 0) continue;

                // The FIRST drop, not a weighted roll. Offline progression is
                // deterministic on purpose: it must pay the same for a given
                // away-time regardless of when the player happens to return.
                string itemId = drops[0]["itemId"].AsString(null);
                if (itemId == null) continue;

                int yield = (int)best["yield"].AsNumber(1);
                long wanted = actions * yield;
                if (wanted <= 0) continue;

                int gained = _state.Player.Inventory.Add(itemId, (int)Math.Min(wanted, int.MaxValue));
                if (gained <= 0) continue;

                long done = (long)Math.Ceiling(actions * ((double)gained / wanted));

                double baseXp = 5;
                JsonValue item = Content.Item(itemId);
                if (item != null)
                {
                    JsonValue xp = item["xp"];
                    if (!xp.IsNull && !xp[skill].IsNull) baseXp = xp[skill].AsNumber(5);
                }

                double earned = baseXp * done;
                _state.Player.Skills.AddXp(skill, earned);
                _state.CollectionLog.Add(itemId);

                summary.Lines.Add($"{gained} x {Content.ItemName(itemId)}");
            }
        }

        /// <summary>
        /// The highest-requirement resource for a skill that the player can use.
        ///
        /// TIES MATTER AND ARE NOT HYPOTHETICAL: rock_copper and rock_tin are
        /// both levelReq 1, so what a level-1 miner earns overnight is decided
        /// entirely here. The TypeScript iterates RESOURCES in declaration order
        /// and replaces only on a strict &gt;, so it keeps the first declared —
        /// rock_copper. This iterates in sorted id order, which is deterministic
        /// (a Dictionary's order is not something to rely on) and happens to
        /// agree. Pinned by OfflineGatheringPicksCopperOverTin so a data change
        /// that breaks the agreement is caught rather than silently repaying
        /// every returning miner in tin.
        /// </summary>
        private static JsonValue BestResource(JsonValue resources, string skill, int level)
        {
            var ids = new List<string>(resources.Members.Keys);
            ids.Sort(StringComparer.Ordinal);

            JsonValue best = null;
            int bestReq = -1;

            foreach (string id in ids)
            {
                JsonValue def = resources[id];
                if (def["skill"].AsString(null) != skill) continue;

                int req = (int)def["levelReq"].AsNumber(1);
                if (req > level) continue;
                if (best != null && req <= bestReq) continue;

                best = def;
                bestReq = req;
            }

            return best;
        }

    }
}
