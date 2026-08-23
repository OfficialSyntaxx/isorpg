using System;
using System.Collections.Generic;
using Isoperia.Core.Components;
using Isoperia.Core.State;
using Isoperia.Core.World;

namespace Isoperia.Core.Save
{
    public sealed class SanitizeResult
    {
        public bool Ok;
        public JsonValue State;
        public string Reason;

        public static SanitizeResult Fail(string reason) =>
            new SanitizeResult { Ok = false, State = null, Reason = reason };
    }

    /// <summary>
    /// Anti-corruption guard. Coerces an arbitrary parsed payload into a valid
    /// save shape, dropping anything unrecognised. Port of
    /// <c>src/utils/Sanitizer.ts</c>.
    ///
    /// The contract is: **never throw**. Its input is a file that may have been
    /// truncated by a browser crash, hand-edited, or written by a future build.
    /// It is what makes a corrupt save degrade into a playable one instead of a
    /// stack trace, and it is why the load path can fall through to a backup.
    ///
    /// Anything the sanitizer cannot make sense of becomes a documented default,
    /// never a null that surfaces three systems later.
    /// </summary>
    public static class Sanitizer
    {
        /// <summary>
        /// Building types accepted on load. Anything else is dropped, so this
        /// list must match <c>BUILDING_TYPES</c> in <c>src/data/Buildings.ts</c>
        /// exactly — a type missing from here is a building silently deleted from
        /// the player's town on the next load.
        ///
        /// Settable, because Phase 2d loads the real building table from JSON and
        /// will supply it rather than duplicating it.
        /// </summary>
        public static string[] KnownBuildingTypes =
        {
            "STORAGE_BIN", "CAMPFIRE", "TOWN_HALL", "STOREHOUSE",
            "SAWMILL", "SMELTER", "GRANARY", "FARM_PLOT",
        };

        public static string[] KnownAttackStyles = { "accurate", "aggressive", "defensive" };
        public static string[] KnownBuffs = { "precision", "power", "warden" };

        private const int WorldSize = Grid.WorldSize;
        private const int LegacyWorldCenter = Grid.LegacyWorldSize / 2;
        private const int MaxFarmPlots = 32;
        private const int MaxClueSites = 8;
        private const int MaxNameLength = 24;
        private const int MaxResourceNodes = 1000;

        /// <summary>True when a save predates the mastery curve change.</summary>
        public static bool NeedsMasteryRescale(string version) => OlderThan(version, "1.1.0");

        /// <summary>
        /// World-bound positions and node ids from the prototype island cannot be
        /// safely interpreted on the mainland. Progress is retained, but those
        /// coordinates are relocated or regenerated during the 2.0 migration.
        /// </summary>
        public static bool NeedsMainlandMigration(string version) => OlderThan(version, "2.2.0");

        /// <summary>Dotted version compare; true when <paramref name="a"/> is older.</summary>
        internal static bool OlderThan(string a, string b)
        {
            string[] pa = (a ?? "").Split('.');
            string[] pb = (b ?? "").Split('.');
            int n = Math.Max(pa.Length, pb.Length);

            for (int i = 0; i < n; i++)
            {
                int va = i < pa.Length ? ParseIntOrZero(pa[i]) : 0;
                int vb = i < pb.Length ? ParseIntOrZero(pb[i]) : 0;
                if (va != vb) return va < vb;
            }
            return false;
        }

        private static int ParseIntOrZero(string s) =>
            int.TryParse(s, out int v) ? v : 0;

        /// <summary>Non-negative rounded integer, or the fallback.</summary>
        private static long ClampNonNeg(JsonValue v, long fallback)
        {
            if (!v.IsFiniteNumber) return fallback;
            double d = v.AsNumber();
            return d >= 0 ? (long)Math.Round(d, MidpointRounding.AwayFromZero) : fallback;
        }

        private static List<string> StrList(JsonValue v)
        {
            var outp = new List<string>();
            if (v.Kind != JsonKind.Array) return outp;
            foreach (var e in v.Items) if (e.Kind == JsonKind.String) outp.Add(e.AsString());
            return outp;
        }

        private static List<double> NumList(JsonValue v)
        {
            var outp = new List<double>();
            if (v.Kind != JsonKind.Array) return outp;
            foreach (var e in v.Items) if (e.IsFiniteNumber) outp.Add(e.AsNumber());
            return outp;
        }

        private static Dictionary<string, double> NumMap(JsonValue v)
        {
            var outp = new Dictionary<string, double>();
            if (v.Kind != JsonKind.Object) return outp;
            foreach (var kv in v.Members) if (kv.Value.IsFiniteNumber) outp[kv.Key] = kv.Value.AsNumber();
            return outp;
        }

        private static Dictionary<string, string> StrMap(JsonValue v)
        {
            var outp = new Dictionary<string, string>();
            if (v.Kind != JsonKind.Object) return outp;
            foreach (var kv in v.Members) if (kv.Value.Kind == JsonKind.String) outp[kv.Key] = kv.Value.AsString();
            return outp;
        }

        /// <summary>
        /// Snap a stored auto-eat threshold to a selectable step. A value from a
        /// hand-edited save, a future build, or a NaN becomes the default rather
        /// than a threshold the UI cannot display and the player cannot change
        /// back.
        /// </summary>
        internal static int NearestAutoEatStep(JsonValue v)
        {
            if (!v.IsFiniteNumber) return GameState.DefaultAutoEatPct;

            double target = v.AsNumber();
            int best = GameState.DefaultAutoEatPct;

            foreach (int step in GameState.AutoEatSteps)
                if (Math.Abs(step - target) < Math.Abs(best - target)) best = step;

            return best;
        }

        private static string CoerceAttackStyle(JsonValue v)
        {
            string s = v.AsString();
            return s != null && Array.IndexOf(KnownAttackStyles, s) >= 0 ? s : GameState.DefaultAttackStyle;
        }

        /// <summary>An unrecognised buff id is dropped, not left active.</summary>
        private static JsonValue CoerceBuff(JsonValue v)
        {
            string s = v.AsString();
            return s != null && Array.IndexOf(KnownBuffs, s) >= 0 ? JsonValue.String(s) : JsonValue.Null;
        }

        private static int ClampToRange(JsonValue v, int max, int fallback)
        {
            if (!v.IsFiniteNumber) return fallback;
            long r = (long)Math.Round(v.AsNumber(), MidpointRounding.AwayFromZero);
            return (int)Math.Max(0, Math.Min(max, r));
        }

        private static bool IsResourceNodeId(string id)
        {
            if (string.IsNullOrEmpty(id)) return false;
            string[] parts = id.Split('_');
            if (parts.Length != 3 || (parts[0] != "TREE" && parts[0] != "ROCK" && parts[0] != "WATER")) return false;
            return int.TryParse(parts[1], out int x) && int.TryParse(parts[2], out int y) &&
                   x >= 0 && x < WorldSize && y >= 0 && y < WorldSize;
        }

        private static int MainlandTownCoordinate(long legacyCoordinate)
        {
            long offset = legacyCoordinate - LegacyWorldCenter;
            return (int)Math.Max(Grid.TownCenter - 8, Math.Min(Grid.TownCenter + 8, Grid.TownCenter + offset));
        }

        /// <summary>
        /// Validate and coerce save JSON into a safe shape. Unrecognised fields
        /// are dropped.
        /// </summary>
        /// <param name="nowMs">
        /// Current epoch milliseconds, injected rather than read from the clock so
        /// the sanitizer stays a pure function and its time-dependent rules (a
        /// future <c>plantedAt</c>, a missing timestamp) are testable.
        /// </param>
        public static SanitizeResult Sanitize(JsonValue raw, long nowMs)
        {
            if (raw == null || raw.Kind != JsonKind.Object)
                return SanitizeResult.Fail("Not an object");

            string version = raw["version"].AsString() ?? "1.0.0";
            bool mainlandMigration = NeedsMainlandMigration(version);
            long timestamp = ClampNonNeg(raw["timestamp"], nowMs);

            JsonValue p = raw["player"];
            if (p.Kind != JsonKind.Object) return SanitizeResult.Fail("Invalid player");

            long gx = ClampNonNeg(p["position"]["x"], Grid.TownCenter);
            long gy = ClampNonNeg(p["position"]["y"], Grid.TownCenter);
            if (mainlandMigration)
            {
                gx = Grid.TownCenter;
                gy = Grid.TownCenter;
            }
            else
            {
                gx = Math.Min(WorldSize - 1, gx);
                gy = Math.Min(WorldSize - 1, gy);
            }

            long maxHp = ClampNonNeg(p["stats"]["maxHp"], 100);
            long hp = ClampNonNeg(p["stats"]["hp"], maxHp);

            // --- skills, with the 1.1.0 mastery migration ----------------------
            //
            // Pre-1.1.0 saves stored mastery XP at 4 per action on the OSRS skill
            // curve; 1.1.0 stores 1 per action on mastery's own curve. Both are
            // "actions performed x a constant", so dividing by 4 recovers the
            // actions the player really did — read on the new curve those actions
            // simply count for much more, which is the point of the retune.
            // Reading the old number as-is would hand out near-max mastery
            // instantly.
            int masteryDivisor = NeedsMasteryRescale(version) ? 4 : 1;

            var skills = JsonValue.Object();
            foreach (var kv in p["skills"].Members)
            {
                var mastery = JsonValue.Object();
                foreach (var mkv in kv.Value["mastery"].Members)
                    if (mkv.Value.IsFiniteNumber)
                        mastery.Set(mkv.Key, JsonValue.Number(Math.Floor(mkv.Value.AsNumber() / masteryDivisor)));

                var entry = JsonValue.Object();
                entry.Set("xp", JsonValue.Number(ClampNonNeg(kv.Value["xp"], 0)));
                entry.Set("mastery", mastery);
                skills.Set(kv.Key, entry);
            }

            // --- inventory ------------------------------------------------------
            var inventory = JsonValue.Array();
            foreach (var e in p["inventory"].Items)
            {
                string id = e["id"].AsString();
                if (id == null) continue;

                long amount = ClampNonNeg(e["amount"], 0);
                if (amount <= 0) continue;   // a zero stack is not a stack

                var stack = JsonValue.Object();
                stack.Set("id", JsonValue.String(id));
                stack.Set("amount", JsonValue.Number(amount));
                inventory.Add(stack);
            }

            // --- equipment ------------------------------------------------------
            var equipped = JsonValue.Object();
            foreach (string slot in EquipSlots.All)
            {
                string v = p["equipped"][slot].AsString();
                if (!string.IsNullOrEmpty(v)) equipped.Set(slot, JsonValue.String(v));
            }

            // --- town buildings -------------------------------------------------
            // Only known types with in-bounds coordinates survive; an unknown type
            // would otherwise sit on a tile forever with no renderer and no way to
            // demolish it.
            JsonValue town = raw["town"];
            var buildings = JsonValue.Array();
            int anonymous = 0;

            foreach (var b in town["buildings"].Items)
            {
                string type = b["type"].AsString() ?? "";
                if (Array.IndexOf(KnownBuildingTypes, type) < 0) continue;

                long bx = ClampNonNeg(b["x"], 0);
                long by = ClampNonNeg(b["y"], 0);
                if (mainlandMigration)
                {
                    bx = MainlandTownCoordinate(bx);
                    by = MainlandTownCoordinate(by);
                }
                else if (bx >= WorldSize || by >= WorldSize) continue;

                // A missing id is replaced deterministically. The TS used
                // Math.random(), which meant re-loading the same corrupt save
                // produced a different id each time and broke anything keyed on it.
                string id = b["id"].AsString() ?? ("b_recovered_" + anonymous++);

                var bo = JsonValue.Object();
                bo.Set("id", JsonValue.String(id));
                bo.Set("type", JsonValue.String(type));
                bo.Set("x", JsonValue.Number(bx));
                bo.Set("y", JsonValue.Number(by));
                bo.Set("level", JsonValue.Number(Math.Max(1, ClampNonNeg(b["level"], 1))));
                buildings.Add(bo);
            }

            // --- clue hunt ------------------------------------------------------
            // Sites must be in bounds and the step must index into the site list,
            // or a hand-edited save parks the player on a hunt with no reachable
            // tile and no way to finish it.
            JsonValue rawClue = p["clue"];
            JsonValue clue = JsonValue.Null;
            string tier = rawClue["tier"].AsString();

            if (!mainlandMigration && (tier == "simple" || tier == "hard") && rawClue["sites"].Kind == JsonKind.Array)
            {
                var sites = JsonValue.Array();
                foreach (var s in rawClue["sites"].Items)
                {
                    if (sites.Count >= MaxClueSites) break;
                    if (!s["x"].IsFiniteNumber || !s["y"].IsFiniteNumber) continue;

                    long sx = ClampNonNeg(s["x"], 0);
                    long sy = ClampNonNeg(s["y"], 0);
                    if (sx >= WorldSize || sy >= WorldSize) continue;

                    var site = JsonValue.Object();
                    site.Set("x", JsonValue.Number(sx));
                    site.Set("y", JsonValue.Number(sy));
                    sites.Add(site);
                }

                if (sites.Count > 0)
                {
                    long step = rawClue["step"].IsFiniteNumber
                        ? (long)Math.Max(0, Math.Min(sites.Count - 1, Math.Floor(rawClue["step"].AsNumber())))
                        : 0;

                    clue = JsonValue.Object();
                    clue.Set("tier", JsonValue.String(tier));
                    clue.Set("seed", JsonValue.Number(rawClue["seed"].IsFiniteNumber ? rawClue["seed"].AsNumber() : 0));
                    clue.Set("step", JsonValue.Number(step));
                    clue.Set("sites", sites);
                }
            }

            // --- farm beds ------------------------------------------------------
            // A plantedAt in the future would leave a crop permanently unripe, so
            // it is clamped to now.
            var farmPlots = JsonValue.Array();
            foreach (var plot in town["farm"]["plots"].Items)
            {
                if (farmPlots.Count >= MaxFarmPlots) break;

                string seedId = plot["seedId"].AsString();
                if (seedId == null) { farmPlots.Add(JsonValue.Null); continue; }

                double at = plot["plantedAt"].IsFiniteNumber
                    ? Math.Min(plot["plantedAt"].AsNumber(), nowMs)
                    : nowMs;

                var po = JsonValue.Object();
                po.Set("seedId", JsonValue.String(seedId));
                po.Set("plantedAt", JsonValue.Number(at));
                farmPlots.Add(po);
            }

            // --- collection log -------------------------------------------------
            // Accepts both the current {unlocked: [...]} shape and the bare array
            // an older build wrote.
            JsonValue rawLog = raw["collectionLog"];
            var collectionLog = JsonValue.Array();
            foreach (string s in StrList(rawLog.Kind == JsonKind.Array ? rawLog : rawLog["unlocked"]))
                collectionLog.Add(JsonValue.String(s));

            // --- assemble --------------------------------------------------------
            var outPlayer = JsonValue.Object();
            string name = p["name"].AsString();
            outPlayer.Set("name", JsonValue.String(
                string.IsNullOrEmpty(name) ? GameState.DefaultHeroName
                    : name.Substring(0, Math.Min(MaxNameLength, name.Length))));

            var position = JsonValue.Object();
            position.Set("x", JsonValue.Number(gx));
            position.Set("y", JsonValue.Number(gy));
            outPlayer.Set("position", position);

            var stats = JsonValue.Object();
            stats.Set("hp", JsonValue.Number(hp));
            stats.Set("maxHp", JsonValue.Number(maxHp));
            outPlayer.Set("stats", stats);

            outPlayer.Set("skills", skills);
            outPlayer.Set("inventory", inventory);
            outPlayer.Set("equipped", equipped);
            outPlayer.Set("journal", ToStrArray(StrList(p["journal"])));

            var meta = JsonValue.Object();
            meta.Set("kills", ToNumObject(NumMap(p["meta"]["kills"])));
            meta.Set("achievements", ToStrArray(StrList(p["meta"]["achievements"])));
            meta.Set("counters", ToNumObject(NumMap(p["meta"]["counters"])));
            outPlayer.Set("meta", meta);

            outPlayer.Set("clue", clue);
            outPlayer.Set("resolve", JsonValue.Number(ClampToRange(p["resolve"], GameState.ResolveMax, GameState.ResolveMax)));
            outPlayer.Set("activeBuff", CoerceBuff(p["activeBuff"]));
            outPlayer.Set("specialEnergy", JsonValue.Number(ClampToRange(p["specialEnergy"], GameState.SpecialMax, GameState.SpecialMax)));

            var outLabour = JsonValue.Object();
            outLabour.Set("assignments", ToStrObject(StrMap(town["labour"]["assignments"])));
            outLabour.Set("stock", ToNumObject(NumMap(town["labour"]["stock"])));
            outLabour.Set("acc", ToNumObject(NumMap(town["labour"]["acc"])));
            outLabour.Set("worked", ToNumObject(NumMap(town["labour"]["worked"])));

            var outMarket = JsonValue.Object();
            outMarket.Set("supply", ToNumObject(NumMap(town["market"]["supply"])));
            outMarket.Set("demand", ToNumObject(NumMap(town["market"]["demand"])));

            var outFarm = JsonValue.Object();
            outFarm.Set("plots", farmPlots);

            var outTown = JsonValue.Object();
            outTown.Set("buildings", buildings);
            outTown.Set("labour", outLabour);
            outTown.Set("market", outMarket);
            outTown.Set("farm", outFarm);

            var outLog = JsonValue.Object();
            outLog.Set("unlocked", collectionLog);

            var outSettings = JsonValue.Object();
            outSettings.Set("autoEatPct", JsonValue.Number(NearestAutoEatStep(raw["settings"]["autoEatPct"])));
            outSettings.Set("attackStyle", JsonValue.String(CoerceAttackStyle(raw["settings"]["attackStyle"])));

            var outMap = JsonValue.Object();
            outMap.Set("discovered", mainlandMigration ? JsonValue.Array() : ToStrArray(StrList(raw["map"]["discovered"])));
            outMap.Set("fastTravel", JsonValue.Bool(!mainlandMigration && raw["map"]["fastTravel"].AsBool()));
            outMap.Set("explored", mainlandMigration ? JsonValue.Array() : ToNumArray(NumList(raw["map"]["explored"])));

            var resources = JsonValue.Array();
            var seenResourceIds = new HashSet<string>();
            foreach (JsonValue node in mainlandMigration ? JsonValue.Array().Items : raw["resources"].Items)
            {
                if (resources.Count >= MaxResourceNodes) break;
                string id = node["id"].AsString();
                if (!IsResourceNodeId(id) || !seenResourceIds.Add(id)) continue;

                long remaining = ClampNonNeg(node["remaining"], 0);
                long respawnAt = ClampNonNeg(node["respawnAt"], 0);
                var clean = JsonValue.Object();
                clean.Set("id", JsonValue.String(id));
                clean.Set("remaining", JsonValue.Number(Math.Min(99, remaining)));
                clean.Set("respawnAt", JsonValue.Number(respawnAt));
                resources.Add(clean);
            }

            var outClock = JsonValue.Object();
            outClock.Set("minute", JsonValue.Number(Math.Min(1439, ClampNonNeg(raw["clock"]["minute"], GameState.DayStartMinute))));
            outClock.Set("day", JsonValue.Number(Math.Max(1, ClampNonNeg(raw["clock"]["day"], 1))));

            var state = JsonValue.Object();
            // The output always carries the CURRENT version: a sanitized payload
            // has already been migrated, so re-running the migration on it would
            // divide mastery by 4 a second time.
            state.Set("version", JsonValue.String(GameState.SaveVersion));
            state.Set("timestamp", JsonValue.Number(timestamp));
            state.Set("player", outPlayer);
            state.Set("town", outTown);
            state.Set("collectionLog", outLog);
            state.Set("settings", outSettings);
            state.Set("map", outMap);
            state.Set("clock", outClock);
            state.Set("resources", resources);

            return new SanitizeResult { Ok = true, State = state };
        }

        private static JsonValue ToStrArray(List<string> xs)
        {
            var a = JsonValue.Array();
            foreach (string s in xs) a.Add(JsonValue.String(s));
            return a;
        }

        private static JsonValue ToNumArray(List<double> xs)
        {
            var a = JsonValue.Array();
            foreach (double d in xs) a.Add(JsonValue.Number(d));
            return a;
        }

        private static JsonValue ToNumObject(Dictionary<string, double> m)
        {
            var o = JsonValue.Object();
            foreach (var kv in m) o.Set(kv.Key, JsonValue.Number(kv.Value));
            return o;
        }

        private static JsonValue ToStrObject(Dictionary<string, string> m)
        {
            var o = JsonValue.Object();
            foreach (var kv in m) o.Set(kv.Key, JsonValue.String(kv.Value));
            return o;
        }
    }
}
