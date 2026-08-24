using System;
using System.Collections.Generic;
using NUnit.Framework;
using Isoperia.Core.Components;
using Isoperia.Core.Content;
using Isoperia.Core.Save;
using Isoperia.Core.Sim;
using Isoperia.Core.State;
using Isoperia.Core.Systems;

namespace Isoperia.Core.Tests
{
    [TestFixture]
    public class SkillSystemTests
    {
        /// <summary>Returns the values it is given, in order, then repeats the last.</summary>
        private sealed class ScriptedRandom : IRandom
        {
            private readonly double[] _values;
            public int Draws;

            public ScriptedRandom(params double[] values) { _values = values; }

            public double Next()
            {
                double v = _values[Math.Min(Draws, _values.Length - 1)];
                Draws++;
                return v;
            }
        }

        private sealed class Node : IResourceNode
        {
            public JsonValue Def { get; set; }
        }

        private static ContentDatabase Content(string itemsJson = null, string resourcesJson = null)
        {
            string items = itemsJson ?? @"{
                ""ITEMS"":{
                  ""normal_log"":{""id"":""normal_log"",""name"":""Logs"",""type"":""LOG"",""value"":3,""stack"":true,""xp"":{""woodcutting"":25}},
                  ""bird_nest"":{""id"":""bird_nest"",""name"":""Nest"",""type"":""MISC"",""value"":50,""stack"":true},
                  ""bronze_axe"":{""id"":""bronze_axe"",""name"":""Bronze Axe"",""type"":""TOOL"",""value"":7,
                                  ""tool"":{""skill"":""woodcutting"",""tier"":1,""speedPct"":0}},
                  ""steel_axe"":{""id"":""steel_axe"",""name"":""Steel Axe"",""type"":""TOOL"",""value"":70,
                                 ""tool"":{""skill"":""woodcutting"",""tier"":3,""speedPct"":20}}
                },
                ""ITEM_ICONS"":{""normal_log"":""L""},""ITEM_ICON_IMAGE_IDS"":[""normal_log""]}";

            string resources = resourcesJson ?? @"{
                ""SKILLS"":{""woodcutting"":{""id"":""woodcutting""}},""SKILL_IDS"":[""woodcutting""],
                ""CRAFT_SKILLS"":[""smithing""],""COMBAT_SKILLS"":[""attack""],
                ""RESOURCES"":{""tree"":{""skill"":""woodcutting""}}}";

            var files = new Dictionary<string, string>
            {
                ["items"] = items,
                ["skills"] = resources,
                ["combat"] = @"{""ATTACK_STYLES"":{""a"":{}},""BUFFS"":{""b"":{}},""WEAPON_SPECIALS"":{""s"":{}},
                                ""AFFIXES"":{""a"":{}},""WEAPONS"":{""w"":{}},""MONSTERS"":{""m"":{}},""FOODS"":{""f"":{}}}",
                ["recipes"] = @"{""RECIPES"":[{""id"":""r""}]}",
                ["buildings"] = @"{""BUILDINGS"":{""CAMPFIRE"":{}},""BUILDING_TYPES"":[""CAMPFIRE""],""MAX_BUILD_LEVEL"":3}",
                ["achievements"] = @"{""ACHIEVEMENTS"":{""a"":{}}}",
                ["xp"] = @"{""XP_TABLE"":[0,83]}",
                ["npcs"] = @"{""VILLAGERS"":{""v"":{}},""CRITTERS"":{""c"":{}},""VETERAN_TIERS"":[{}],""VILLAGER_SPECS"":{""s"":{}}}",
                ["quests"] = @"{""QUESTS"":[{""id"":""q""}]}",
                ["farming"] = @"{""SEEDS"":{""s"":{}},""SEED_IDS"":[""s""]}",
                ["clues"] = @"{""CLUE_TIERS"":{""easy"":{}},""CLUE_TIER_LIST"":[""easy""]}",
                ["shop"] = @"{""STOCK"":[{""itemId"":""potato_seed"",""price"":10}]}",
            };

            return ContentDatabase.Load(n => files.TryGetValue(n, out string v) ? v : null);
        }

        private static Node Tree(int levelReq = 1, int toolTier = 1, int ticks = 10, int yield = 1,
                                 string drops = @"[{""itemId"":""normal_log"",""weight"":1,""min"":1,""max"":1}]")
        {
            return new Node
            {
                Def = JsonValue.Parse($@"{{""skill"":""woodcutting"",""levelReq"":{levelReq},
                    ""toolTier"":{toolTier},""ticksPerAction"":{ticks},""yield"":{yield},
                    ""masteryKey"":""normal_log"",""drops"":{drops}}}"),
            };
        }

        private static GameState StateWith(ContentDatabase c, params string[] tools)
        {
            GameState st = GameState.CreateFresh(nowMs: 0);
            st.Player.Inventory.SetCatalog(new ContentItemCatalog(c));
            foreach (string t in tools) st.Player.Inventory.Add(t, 1);
            return st;
        }

        private static SkillSystem Sys(GameState st, ContentDatabase c, IRandom rng, int uses = 99)
        {
            int left = uses;
            return new SkillSystem(st, c, rng, _ => --left);
        }

        // -- gating ---------------------------------------------------------

        [Test]
        public void RefusesWhenTheLevelIsTooLow()
        {
            ContentDatabase c = Content();
            GameState st = StateWith(c, "bronze_axe");
            SkillSystem sys = Sys(st, c, new ScriptedRandom(0.5));

            ActionEndReason? reason = null;
            sys.ActionEnded += (n, r) => reason = r;

            Assert.IsFalse(sys.StartGathering(Tree(levelReq: 50)));
            Assert.AreEqual(ActionEndReason.LevelShortfall, reason);
            Assert.IsTrue(sys.IsLevelShortfall);
            Assert.IsFalse(sys.HasActive);
        }

        [Test]
        public void RefusesWithoutAGoodEnoughTool()
        {
            ContentDatabase c = Content();
            GameState st = StateWith(c, "bronze_axe");   // tier 1, node wants 3
            SkillSystem sys = Sys(st, c, new ScriptedRandom(0.5));

            ActionEndReason? reason = null;
            sys.ActionEnded += (n, r) => reason = r;

            Assert.IsFalse(sys.StartGathering(Tree(toolTier: 3)));
            Assert.AreEqual(ActionEndReason.ToolShortfall, reason);
            Assert.IsFalse(sys.IsLevelShortfall, "a tool shortfall is not a level shortfall");
        }

        /// <summary>
        /// A node stating no toolTier still requires tier 1, so bare hands never
        /// work. The TypeScript writes `def.toolTier ?? 1`, and a port reading a
        /// missing field as 0 would quietly make every node hand-gatherable.
        /// </summary>
        [Test]
        public void AMissingToolTierStillMeansTierOne()
        {
            ContentDatabase c = Content();
            GameState st = StateWith(c);   // no tools at all
            SkillSystem sys = Sys(st, c, new ScriptedRandom(0.5));

            var node = new Node
            {
                Def = JsonValue.Parse(@"{""skill"":""woodcutting"",""levelReq"":1,""ticksPerAction"":10,
                    ""yield"":1,""masteryKey"":""normal_log"",
                    ""drops"":[{""itemId"":""normal_log"",""weight"":1,""min"":1,""max"":1}]}"),
            };

            ActionEndReason? reason = null;
            sys.ActionEnded += (n, r) => reason = r;

            Assert.IsFalse(sys.StartGathering(node));
            Assert.AreEqual(ActionEndReason.ToolShortfall, reason);
        }

        // -- the gathering loop ---------------------------------------------

        [Test]
        public void GathersAfterTheRequiredTicksAndAwardsXp()
        {
            ContentDatabase c = Content();
            GameState st = StateWith(c, "bronze_axe");
            var rng = new ScriptedRandom(0.99, 0.5);   // no double, first drop
            SkillSystem sys = Sys(st, c, rng);

            GatherEvent got = null;
            sys.Gathered += e => got = e;

            Assert.IsTrue(sys.StartGathering(Tree(ticks: 10)));

            sys.Tick(9 * 600);
            Assert.IsNull(got, "must not fire before the full action time");

            sys.Tick(600);
            Assert.IsNotNull(got);
            Assert.AreEqual("normal_log", got.ItemId);
            Assert.AreEqual(1, got.Amount);
            Assert.IsFalse(got.Doubled);
            Assert.AreEqual(1, st.Player.Inventory.Count("normal_log"));

            // 25 base xp, x1.5 early bonus at level 1 = 37.5 -> 38
            Assert.AreEqual(38, got.XpGained);
            Assert.AreEqual(38, st.Player.Skills.Get("woodcutting").Xp, 1e-9);
        }

        /// <summary>
        /// DRAW ORDER IS THE CONTRACT. Per gather: the double roll first, ALWAYS,
        /// then the drop roll. Swapping them leaves both formulas correct and
        /// produces a different game from the same seed.
        /// </summary>
        [Test]
        public void TakesTheDoubleRollBeforeTheDropRoll()
        {
            ContentDatabase c = Content();
            GameState st = StateWith(c, "bronze_axe");

            // Max mastery, so the double chance is 0.2 and the two draws are
            // DISCRIMINATING rather than merely counted:
            //   draw 1 = 0.0  -> 0.0 < 0.2, doubles
            //   draw 2 = 0.5  -> selects the only drop
            // Swap the order and 0.0 goes to the drop roll while 0.5 goes to the
            // double check, which then fails. So Doubled is what proves order;
            // a draw COUNT would pass either way.
            st.Player.Skills.AddMasteryXp("woodcutting", "normal_log", 4851);   // level 99

            var rng = new ScriptedRandom(0.0, 0.5);
            SkillSystem sys = Sys(st, c, rng);

            GatherEvent got = null;
            sys.Gathered += e => got = e;

            sys.StartGathering(Tree());
            sys.Tick(10 * 600);

            Assert.AreEqual(2, rng.Draws, "exactly two draws: double, then drop");
            Assert.IsNotNull(got);
            Assert.IsTrue(got.Doubled, "the FIRST draw must be the double roll");
            Assert.AreEqual(2, got.Amount, "a doubled yield of 1 is 2");
        }

        /// <summary>
        /// An empty drop table takes the double roll and NO drop roll. That
        /// asymmetry is why the double roll is unconditional and first.
        /// </summary>
        [Test]
        public void AnEmptyDropTableTakesOnlyTheDoubleDraw()
        {
            ContentDatabase c = Content();
            GameState st = StateWith(c, "bronze_axe");
            var rng = new ScriptedRandom(0.5);
            SkillSystem sys = Sys(st, c, rng);

            ActionEndReason? reason = null;
            sys.ActionEnded += (n, r) => reason = r;

            sys.StartGathering(Tree(drops: "[]"));
            sys.Tick(10 * 600);

            Assert.AreEqual(1, rng.Draws);
            Assert.AreEqual(ActionEndReason.Done, reason);
        }

        [Test]
        public void StopsWhenABulkItemWouldOverflowTheBag()
        {
            ContentDatabase c = Content();
            GameState st = StateWith(c, "bronze_axe");
            st.Player.Inventory.StorageCap = 10;
            st.Player.Inventory.Add("normal_log", 10);

            SkillSystem sys = Sys(st, c, new ScriptedRandom(0.99, 0.5));

            ActionEndReason? reason = null;
            sys.ActionEnded += (n, r) => reason = r;

            sys.StartGathering(Tree());
            sys.Tick(10 * 600);

            Assert.AreEqual(ActionEndReason.InventoryFull, reason);
            Assert.AreEqual(10, st.Player.Inventory.Count("normal_log"), "nothing was stored");
        }

        /// <summary>
        /// The bag cap applies to BULK only. A non-bulk drop into a full bag must
        /// still be collected — this is the rule whose earlier violation clamped
        /// an offline payout of 2,400 coins to 500.
        /// </summary>
        [Test]
        public void ANonBulkDropIsCollectedEvenWithAFullBag()
        {
            ContentDatabase c = Content();
            GameState st = StateWith(c, "bronze_axe");
            st.Player.Inventory.StorageCap = 10;
            st.Player.Inventory.Add("normal_log", 10);

            SkillSystem sys = Sys(st, c, new ScriptedRandom(0.99, 0.5));

            sys.StartGathering(Tree(drops: @"[{""itemId"":""bird_nest"",""weight"":1,""min"":1,""max"":1}]"));
            sys.Tick(10 * 600);

            Assert.AreEqual(1, st.Player.Inventory.Count("bird_nest"));
        }

        [Test]
        public void ABetterToolShortensTheAction()
        {
            ContentDatabase c = Content();

            GameState slow = StateWith(c, "bronze_axe");     // speedPct 0
            GameState fast = StateWith(c, "steel_axe");      // speedPct 20

            var a = Sys(slow, c, new ScriptedRandom(0.99, 0.5));
            var b = Sys(fast, c, new ScriptedRandom(0.99, 0.5));

            a.StartGathering(Tree(ticks: 20));
            b.StartGathering(Tree(ticks: 20));

            // 20 ticks vs 20 * 0.8 = 16.
            a.Tick(16 * 600);
            b.Tick(16 * 600);

            Assert.IsFalse(slow.CollectionLog.Contains("normal_log"), "bronze should still be working");
            Assert.IsTrue(fast.CollectionLog.Contains("normal_log"), "steel should have finished");
        }

        [Test]
        public void InterruptEndsTheActionWithoutGathering()
        {
            ContentDatabase c = Content();
            GameState st = StateWith(c, "bronze_axe");
            SkillSystem sys = Sys(st, c, new ScriptedRandom(0.99, 0.5));

            ActionEndReason? reason = null;
            sys.ActionEnded += (n, r) => reason = r;

            sys.StartGathering(Tree());
            sys.Tick(5 * 600);
            sys.Interrupt();

            Assert.AreEqual(ActionEndReason.Interrupted, reason);
            Assert.IsFalse(sys.HasActive);

            sys.Tick(100 * 600);
            Assert.AreEqual(0, st.Player.Inventory.Count("normal_log"));
        }

        [Test]
        public void ADepletedNodeEndsTheAction()
        {
            ContentDatabase c = Content();
            GameState st = StateWith(c, "bronze_axe");
            SkillSystem sys = Sys(st, c, new ScriptedRandom(0.99, 0.5), uses: 1);

            ActionEndReason? reason = null;
            sys.ActionEnded += (n, r) => reason = r;

            sys.StartGathering(Tree());
            sys.Tick(10 * 600);

            Assert.AreEqual(ActionEndReason.Done, reason);
            Assert.IsFalse(sys.HasActive);
            Assert.AreEqual(1, st.Player.Inventory.Count("normal_log"), "the last use still paid out");
        }

        [Test]
        public void GatheringRecordsTheItemInTheCollectionLog()
        {
            ContentDatabase c = Content();
            GameState st = StateWith(c, "bronze_axe");
            SkillSystem sys = Sys(st, c, new ScriptedRandom(0.99, 0.5));

            sys.StartGathering(Tree());
            sys.Tick(10 * 600);

            Assert.IsTrue(st.CollectionLog.Contains("normal_log"));
        }
    }
}
