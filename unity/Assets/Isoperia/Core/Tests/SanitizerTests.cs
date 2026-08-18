using NUnit.Framework;
using Isoperia.Core.Save;
using Isoperia.Core.State;

namespace Isoperia.Core.Tests
{
    /// <summary>
    /// The anti-corruption guard.
    ///
    /// Its input is a file that may have been truncated by a browser crash,
    /// hand-edited, or written by a future build, and its contract is to never
    /// throw — a corrupt save must degrade into a playable one, or be rejected
    /// cleanly so the load path can fall through to the backup.
    ///
    /// It is also the single most drift-prone part of the port: dozens of
    /// independent coercion rules, each individually plausible-looking if got
    /// wrong. Writing this file already caught a real bug — the accepted building
    /// list had been written from memory, inventing MARKET and SMITHY while
    /// omitting STORAGE_BIN and FARM_PLOT, which would have silently deleted every
    /// storage bin and farm plot a player had built.
    /// </summary>
    public class SanitizerTests
    {
        private const long Now = 1_787_000_000_000;

        private static SanitizeResult San(string json) =>
            Sanitizer.Sanitize(JsonValue.Parse(json), Now);

        // ---- rejection -------------------------------------------------------

        [Test]
        public void RejectsNonObjects()
        {
            Assert.IsFalse(Sanitizer.Sanitize(JsonValue.Parse("[]"), Now).Ok);
            Assert.IsFalse(Sanitizer.Sanitize(JsonValue.Parse("null"), Now).Ok);
            Assert.IsFalse(Sanitizer.Sanitize(JsonValue.Parse("42"), Now).Ok);
            Assert.IsFalse(Sanitizer.Sanitize(JsonValue.Parse("\"str\""), Now).Ok);
            Assert.IsFalse(Sanitizer.Sanitize(null, Now).Ok, "a failed parse must not crash the sanitizer");
        }

        [Test]
        public void RejectsASaveWithNoPlayer()
        {
            SanitizeResult r = San("{\"version\":\"1.1.0\"}");
            Assert.IsFalse(r.Ok);
            Assert.IsNotNull(r.Reason);
        }

        /// <summary>
        /// The contract that makes the backup fallback work: an empty-but-shaped
        /// save must survive with defaults rather than throw.
        /// </summary>
        [Test]
        public void ATruncatedSaveSurvivesWithDefaults()
        {
            SanitizeResult r = San("{\"player\":{}}");

            Assert.IsTrue(r.Ok, "a save with an empty player object should still load");
            Assert.AreEqual(GameState.DefaultHeroName, r.State["player"]["name"].AsString());
            Assert.AreEqual(10, r.State["player"]["position"]["x"].AsNumber(), "default spawn x");
            Assert.AreEqual(10, r.State["player"]["position"]["y"].AsNumber(), "default spawn y");
            Assert.AreEqual(100, r.State["player"]["stats"]["maxHp"].AsNumber());
            Assert.AreEqual(100, r.State["player"]["stats"]["hp"].AsNumber());
            Assert.AreEqual(GameState.ResolveMax, r.State["player"]["resolve"].AsNumber());
            Assert.AreEqual(GameState.SpecialMax, r.State["player"]["specialEnergy"].AsNumber());
            Assert.AreEqual(GameState.DefaultAutoEatPct, r.State["settings"]["autoEatPct"].AsNumber());
            Assert.AreEqual(GameState.DefaultAttackStyle, r.State["settings"]["attackStyle"].AsString());
            Assert.AreEqual(GameState.DayStartMinute, r.State["clock"]["minute"].AsNumber());
            Assert.AreEqual(1, r.State["clock"]["day"].AsNumber());
        }

        // ---- the 1.1.0 mastery migration --------------------------------------

        [Test]
        public void VersionCompareOrdersDottedVersions()
        {
            Assert.IsTrue(Sanitizer.OlderThan("1.0.0", "1.1.0"));
            Assert.IsTrue(Sanitizer.OlderThan("1.0.9", "1.1.0"));
            Assert.IsFalse(Sanitizer.OlderThan("1.1.0", "1.1.0"));
            Assert.IsFalse(Sanitizer.OlderThan("1.2.0", "1.1.0"));
            Assert.IsFalse(Sanitizer.OlderThan("2.0.0", "1.1.0"));
            Assert.IsTrue(Sanitizer.OlderThan("1.1", "1.1.1"), "missing components count as zero");
        }

        [Test]
        public void NeedsMasteryRescaleOnlyBelowOnePointOne()
        {
            Assert.IsTrue(Sanitizer.NeedsMasteryRescale("1.0.0"));
            Assert.IsFalse(Sanitizer.NeedsMasteryRescale("1.1.0"));
            Assert.IsFalse(Sanitizer.NeedsMasteryRescale("1.2.0"));
        }

        /// <summary>
        /// Pre-1.1.0 saves stored mastery at 4 XP per action on the skill curve;
        /// 1.1.0 stores 1 per action on mastery's own curve. Dividing by 4 recovers
        /// the actions actually performed. Reading the old number as-is would hand
        /// out near-max mastery instantly.
        /// </summary>
        [Test]
        public void OldSavesHaveMasteryDividedByFour()
        {
            SanitizeResult r = San(
                "{\"version\":\"1.0.0\",\"player\":{\"skills\":{" +
                "\"woodcutting\":{\"xp\":5000,\"mastery\":{\"logs\":400,\"oak_logs\":7}}}}}");

            Assert.IsTrue(r.Ok);
            JsonValue m = r.State["player"]["skills"]["woodcutting"]["mastery"];
            Assert.AreEqual(100, m["logs"].AsNumber(), "400 / 4");
            Assert.AreEqual(1, m["oak_logs"].AsNumber(), "floor(7 / 4)");
            Assert.AreEqual(5000, r.State["player"]["skills"]["woodcutting"]["xp"].AsNumber(),
                "skill XP is not rescaled, only mastery");
        }

        [Test]
        public void CurrentSavesKeepMasteryUnchanged()
        {
            SanitizeResult r = San(
                "{\"version\":\"1.1.0\",\"player\":{\"skills\":{" +
                "\"woodcutting\":{\"xp\":5000,\"mastery\":{\"logs\":400}}}}}");

            Assert.AreEqual(400, r.State["player"]["skills"]["woodcutting"]["mastery"]["logs"].AsNumber());
        }

        /// <summary>
        /// The output always carries the CURRENT version. Without that, sanitizing
        /// an already-sanitized payload would run the migration a second time and
        /// divide mastery by 16.
        /// </summary>
        [Test]
        public void SanitizingIsIdempotent()
        {
            SanitizeResult first = San(
                "{\"version\":\"1.0.0\",\"player\":{\"skills\":{" +
                "\"mining\":{\"xp\":100,\"mastery\":{\"iron_ore\":800}}}}}");

            Assert.AreEqual(GameState.SaveVersion, first.State["version"].AsString());
            Assert.AreEqual(200, first.State["player"]["skills"]["mining"]["mastery"]["iron_ore"].AsNumber());

            SanitizeResult second = Sanitizer.Sanitize(first.State, Now);
            Assert.AreEqual(200, second.State["player"]["skills"]["mining"]["mastery"]["iron_ore"].AsNumber(),
                "re-sanitizing must not migrate a second time");
        }

        // ---- buildings ---------------------------------------------------------

        /// <summary>
        /// Regression: this list is what decides whether a player keeps their town.
        /// It must match BUILDING_TYPES in src/data/Buildings.ts exactly.
        /// </summary>
        [Test]
        public void EveryRealBuildingTypeIsAccepted()
        {
            string[] real =
            {
                "STORAGE_BIN", "CAMPFIRE", "TOWN_HALL", "STOREHOUSE",
                "SAWMILL", "SMELTER", "GRANARY", "FARM_PLOT",
            };

            foreach (string type in real)
            {
                SanitizeResult r = San(
                    "{\"player\":{},\"town\":{\"buildings\":[" +
                    "{\"id\":\"b1\",\"type\":\"" + type + "\",\"x\":5,\"y\":5,\"level\":1}]}}");

                Assert.AreEqual(1, r.State["town"]["buildings"].Count,
                    $"{type} is a real building type and must survive a load");
            }
        }

        [Test]
        public void UnknownBuildingTypesAreDropped()
        {
            SanitizeResult r = San(
                "{\"player\":{},\"town\":{\"buildings\":[" +
                "{\"id\":\"b1\",\"type\":\"CAMPFIRE\",\"x\":5,\"y\":5,\"level\":1}," +
                "{\"id\":\"b2\",\"type\":\"WIZARD_TOWER\",\"x\":6,\"y\":6,\"level\":1}," +
                "{\"id\":\"b3\",\"type\":\"\",\"x\":7,\"y\":7,\"level\":1}]}}");

            Assert.AreEqual(1, r.State["town"]["buildings"].Count);
            Assert.AreEqual("CAMPFIRE", r.State["town"]["buildings"][0]["type"].AsString());
        }

        [Test]
        public void OutOfBoundsBuildingsAreDropped()
        {
            SanitizeResult r = San(
                "{\"player\":{},\"town\":{\"buildings\":[" +
                "{\"id\":\"b1\",\"type\":\"CAMPFIRE\",\"x\":500,\"y\":5,\"level\":1}," +
                "{\"id\":\"b2\",\"type\":\"CAMPFIRE\",\"x\":5,\"y\":9999,\"level\":1}]}}");

            Assert.AreEqual(0, r.State["town"]["buildings"].Count);
        }

        [Test]
        public void BuildingLevelIsAtLeastOne()
        {
            SanitizeResult r = San(
                "{\"player\":{},\"town\":{\"buildings\":[" +
                "{\"id\":\"b1\",\"type\":\"CAMPFIRE\",\"x\":5,\"y\":5,\"level\":0}," +
                "{\"id\":\"b2\",\"type\":\"SAWMILL\",\"x\":6,\"y\":6}]}}");

            Assert.AreEqual(1, r.State["town"]["buildings"][0]["level"].AsNumber());
            Assert.AreEqual(1, r.State["town"]["buildings"][1]["level"].AsNumber(), "missing level defaults to 1");
        }

        /// <summary>
        /// The TypeScript filled a missing id from Math.random(), so re-loading the
        /// same corrupt save produced a different id every time and broke anything
        /// keyed on it. The replacement is deterministic.
        /// </summary>
        [Test]
        public void ARecoveredBuildingIdIsDeterministic()
        {
            const string save =
                "{\"player\":{},\"town\":{\"buildings\":[" +
                "{\"type\":\"CAMPFIRE\",\"x\":5,\"y\":5,\"level\":1}]}}";

            string a = San(save).State["town"]["buildings"][0]["id"].AsString();
            string b = San(save).State["town"]["buildings"][0]["id"].AsString();

            Assert.IsNotNull(a);
            Assert.AreEqual(a, b, "the same corrupt save must recover to the same id");
        }

        // ---- clue hunts --------------------------------------------------------

        /// <summary>
        /// A step past the end of the site list would park the player on a hunt
        /// with no reachable tile and no way to finish it.
        /// </summary>
        [Test]
        public void ClueStepIsClampedIntoTheSiteList()
        {
            SanitizeResult r = San(
                "{\"player\":{\"clue\":{\"tier\":\"simple\",\"seed\":7,\"step\":99," +
                "\"sites\":[{\"x\":1,\"y\":1},{\"x\":2,\"y\":2}]}}}");

            Assert.AreEqual(1, r.State["player"]["clue"]["step"].AsNumber(), "clamped to sites.length - 1");
        }

        [Test]
        public void ClueSitesOutsideTheWorldAreDropped()
        {
            SanitizeResult r = San(
                "{\"player\":{\"clue\":{\"tier\":\"hard\",\"seed\":1,\"step\":0," +
                "\"sites\":[{\"x\":1,\"y\":1},{\"x\":99,\"y\":5},{\"x\":5,\"y\":99}]}}}");

            Assert.AreEqual(1, r.State["player"]["clue"]["sites"].Count);
        }

        [Test]
        public void AClueWithNoValidSitesBecomesNull()
        {
            SanitizeResult r = San(
                "{\"player\":{\"clue\":{\"tier\":\"simple\",\"seed\":1,\"step\":0," +
                "\"sites\":[{\"x\":99,\"y\":99}]}}}");

            Assert.IsTrue(r.State["player"]["clue"].IsNull, "an unfinishable hunt must be cleared");
        }

        [Test]
        public void AnUnknownClueTierIsRejected()
        {
            SanitizeResult r = San(
                "{\"player\":{\"clue\":{\"tier\":\"legendary\",\"seed\":1,\"step\":0," +
                "\"sites\":[{\"x\":1,\"y\":1}]}}}");

            Assert.IsTrue(r.State["player"]["clue"].IsNull);
        }

        // ---- farming -----------------------------------------------------------

        /// <summary>A sow time in the future leaves a crop permanently unripe.</summary>
        [Test]
        public void AFuturePlantedAtIsClampedToNow()
        {
            SanitizeResult r = San(
                "{\"player\":{},\"town\":{\"farm\":{\"plots\":[" +
                "{\"seedId\":\"potato_seed\",\"plantedAt\":" + (Now + 999_999_999L) + "}]}}}");

            Assert.AreEqual(Now, r.State["town"]["farm"]["plots"][0]["plantedAt"].AsNumber());
        }

        [Test]
        public void EmptyBedsSurviveAsNulls()
        {
            SanitizeResult r = San(
                "{\"player\":{},\"town\":{\"farm\":{\"plots\":[" +
                "null,{\"seedId\":\"cabbage_seed\",\"plantedAt\":1000},null]}}}");

            Assert.AreEqual(3, r.State["town"]["farm"]["plots"].Count, "bed indices must be preserved");
            Assert.IsTrue(r.State["town"]["farm"]["plots"][0].IsNull);
            Assert.AreEqual("cabbage_seed", r.State["town"]["farm"]["plots"][1]["seedId"].AsString());
            Assert.IsTrue(r.State["town"]["farm"]["plots"][2].IsNull);
        }

        // ---- clamped scalars ---------------------------------------------------

        [Test]
        public void ResolveAndSpecialAreClampedIntoRange()
        {
            SanitizeResult r = San("{\"player\":{\"resolve\":500,\"specialEnergy\":-40}}");

            Assert.AreEqual(GameState.ResolveMax, r.State["player"]["resolve"].AsNumber());
            Assert.AreEqual(0, r.State["player"]["specialEnergy"].AsNumber());
        }

        [Test]
        public void AnUnrecognisedBuffIsDroppedRatherThanLeftActive()
        {
            Assert.IsTrue(San("{\"player\":{\"activeBuff\":\"godmode\"}}").State["player"]["activeBuff"].IsNull);
            Assert.AreEqual("power", San("{\"player\":{\"activeBuff\":\"power\"}}").State["player"]["activeBuff"].AsString());
        }

        [Test]
        public void AnUnknownAttackStyleFallsBackToAccurate()
        {
            Assert.AreEqual("accurate",
                San("{\"player\":{},\"settings\":{\"attackStyle\":\"berserk\"}}").State["settings"]["attackStyle"].AsString());
            Assert.AreEqual("defensive",
                San("{\"player\":{},\"settings\":{\"attackStyle\":\"defensive\"}}").State["settings"]["attackStyle"].AsString());
        }

        /// <summary>
        /// A value outside the offered set becomes the default rather than a
        /// threshold the UI cannot display and the player cannot change back.
        /// </summary>
        [Test]
        public void AutoEatSnapsToTheNearestOfferedStep()
        {
            Assert.AreEqual(30, San("{\"player\":{},\"settings\":{\"autoEatPct\":31}}").State["settings"]["autoEatPct"].AsNumber());
            Assert.AreEqual(75, San("{\"player\":{},\"settings\":{\"autoEatPct\":999}}").State["settings"]["autoEatPct"].AsNumber());
            Assert.AreEqual(0, San("{\"player\":{},\"settings\":{\"autoEatPct\":-5}}").State["settings"]["autoEatPct"].AsNumber());
            Assert.AreEqual(GameState.DefaultAutoEatPct,
                San("{\"player\":{},\"settings\":{\"autoEatPct\":\"forty\"}}").State["settings"]["autoEatPct"].AsNumber(),
                "a non-numeric value falls back to the default");
        }

        [Test]
        public void ClockMinuteIsClampedToADay()
        {
            Assert.AreEqual(1439, San("{\"player\":{},\"clock\":{\"minute\":99999,\"day\":3}}").State["clock"]["minute"].AsNumber());
            Assert.AreEqual(1, San("{\"player\":{},\"clock\":{\"minute\":60,\"day\":0}}").State["clock"]["day"].AsNumber(),
                "day is at least 1");
        }

        [Test]
        public void ALongNameIsTruncated()
        {
            SanitizeResult r = San("{\"player\":{\"name\":\"" + new string('x', 200) + "\"}}");
            Assert.AreEqual(24, r.State["player"]["name"].AsString().Length);
        }

        // ---- inventory and equipment -------------------------------------------

        [Test]
        public void ZeroAndNegativeStacksAreDropped()
        {
            SanitizeResult r = San(
                "{\"player\":{\"inventory\":[" +
                "{\"id\":\"logs\",\"amount\":5}," +
                "{\"id\":\"ore\",\"amount\":0}," +
                "{\"id\":\"coal\",\"amount\":-3}," +
                "{\"amount\":9}]}}");

            Assert.AreEqual(1, r.State["player"]["inventory"].Count, "only the real stack survives");
            Assert.AreEqual("logs", r.State["player"]["inventory"][0]["id"].AsString());
        }

        [Test]
        public void OnlyRealEquipSlotsSurvive()
        {
            SanitizeResult r = San(
                "{\"player\":{\"equipped\":{\"weapon\":\"iron_sword\",\"hat\":\"nope\",\"body\":\"\"}}}");

            JsonValue eq = r.State["player"]["equipped"];
            Assert.AreEqual("iron_sword", eq["weapon"].AsString());
            Assert.IsTrue(eq["hat"].IsNull, "an invented slot must be dropped");
            Assert.IsTrue(eq["body"].IsNull, "an empty item id is not an equipped item");
        }

        // ---- misc ---------------------------------------------------------------

        [Test]
        public void CollectionLogAcceptsBothTheOldAndNewShapes()
        {
            Assert.AreEqual(2,
                San("{\"player\":{},\"collectionLog\":{\"unlocked\":[\"logs\",\"coins\"]}}")
                    .State["collectionLog"]["unlocked"].Count);

            Assert.AreEqual(2,
                San("{\"player\":{},\"collectionLog\":[\"logs\",\"coins\"]}")
                    .State["collectionLog"]["unlocked"].Count,
                "an older build wrote a bare array");
        }

        [Test]
        public void NonFiniteNumbersFallBackRatherThanPropagate()
        {
            // JSON has no NaN literal, so the realistic corruption is a wrong type.
            SanitizeResult r = San("{\"player\":{\"stats\":{\"hp\":\"lots\",\"maxHp\":null}}}");

            Assert.AreEqual(100, r.State["player"]["stats"]["maxHp"].AsNumber());
            Assert.AreEqual(100, r.State["player"]["stats"]["hp"].AsNumber(), "hp falls back to maxHp");
        }

        [Test]
        public void MapFlagsAreCoercedStrictly()
        {
            SanitizeResult r = San(
                "{\"player\":{},\"map\":{\"discovered\":[\"a\",1,\"b\"],\"fastTravel\":\"yes\",\"explored\":[1,\"x\",3]}}");

            Assert.AreEqual(2, r.State["map"]["discovered"].Count, "non-strings are dropped");
            Assert.IsFalse(r.State["map"]["fastTravel"].AsBool(), "only a real boolean true unlocks fast travel");
            Assert.AreEqual(2, r.State["map"]["explored"].Count, "non-numbers are dropped");
        }

        [Test]
        public void ATimestampIsPreservedAndDefaultsToNow()
        {
            Assert.AreEqual(12345, San("{\"player\":{},\"timestamp\":12345}").State["timestamp"].AsNumber());
            Assert.AreEqual(Now, San("{\"player\":{}}").State["timestamp"].AsNumber(),
                "a missing timestamp must default to now, not zero");
        }
    }
}
