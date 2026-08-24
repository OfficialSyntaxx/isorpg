using System.Collections.Generic;
using NUnit.Framework;
using Isoperia.Core.Content;
using Isoperia.Core.Data;
using Isoperia.Core.Save;
using Isoperia.Core.State;
using Isoperia.Core.Systems;
using Isoperia.Core.World;

namespace Isoperia.Core.Tests
{
    [TestFixture]
    public class MetaSystemTests
    {
        private GameState _state;
        private ContentDatabase _content;

        private MetaSystem Make()
        {
            _content = TestContent.Real();
            _state = GameState.CreateFresh(nowMs: 1787000000000);
            return new MetaSystem(_state, _content);
        }

        /// <summary>
        /// THE GUARD THAT MATTERS. Achievement ids/names/descriptions come from
        /// content; the conditions are C#. An achievement added to the content
        /// with no condition here would never unlock — silently, forever, with
        /// nothing to notice. Evaluate throws instead, and this proves every
        /// shipped achievement is covered.
        /// </summary>
        [Test]
        public void EveryAchievementInContentHasACondition()
        {
            Make();
            JsonValue list = _content.Table("achievements", "ACHIEVEMENTS");

            var missing = new List<string>();
            for (int i = 0; i < list.Count; i++)
            {
                string id = list[i]["id"].AsString(null);
                if (id == null) continue;

                bool known = false;
                foreach (string k in Achievements.KnownIds) if (k == id) { known = true; break; }
                if (!known) missing.Add(id);
            }

            Assert.AreEqual(0, missing.Count,
                "achievements with no condition would never unlock: " + string.Join(", ", missing.ToArray()));
        }

        /// <summary>And the reverse: a condition for an achievement nobody ships.</summary>
        [Test]
        public void EveryConditionMatchesAShippedAchievement()
        {
            Make();
            JsonValue list = _content.Table("achievements", "ACHIEVEMENTS");

            var shipped = new HashSet<string>();
            for (int i = 0; i < list.Count; i++) shipped.Add(list[i]["id"].AsString(""));

            foreach (string id in Achievements.KnownIds)
                Assert.IsTrue(shipped.Contains(id), $"condition \"{id}\" has no achievement in content");
        }

        [Test]
        public void AnUnknownAchievementIsFatalRatherThanSilentlyNeverUnlocking()
        {
            Make();
            Assert.Throws<ContentException>(() => Achievements.IsMet("no_such_achievement", _state));
        }

        // -- unlocking ------------------------------------------------------

        [Test]
        public void AFreshCharacterHasUnlockedNothing()
        {
            MetaSystem meta = Make();
            meta.Evaluate();
            Assert.AreEqual(0, meta.UnlockedCount);
        }

        [Test]
        public void FirstKillUnlocksOnTheFirstKill()
        {
            MetaSystem meta = Make();

            var fired = new List<string>();
            meta.Unlocked += (id, name, desc) => fired.Add(id);

            _state.Player.MetaKills["giant_rat"] = 1;
            meta.Evaluate();

            Assert.Contains("first_kill", fired);
            Assert.Contains("first_kill", _state.Player.MetaAchievements);
        }

        [Test]
        public void AnAchievementFiresOnlyOnce()
        {
            MetaSystem meta = Make();

            int fires = 0;
            meta.Unlocked += (id, name, desc) => fires++;

            _state.Player.MetaKills["giant_rat"] = 10;
            meta.Evaluate();
            int first = fires;

            meta.Evaluate();
            meta.Evaluate();

            Assert.AreEqual(first, fires, "re-evaluating must not re-fire");
        }

        /// <summary>
        /// Achievements record having DONE a thing, not currently satisfying it.
        /// Spending the coins or selling the items must not revoke one.
        /// </summary>
        [Test]
        public void AnUnlockedAchievementSurvivesTheStateRegressing()
        {
            MetaSystem meta = Make();

            _state.Player.MetaCounters["shop_sold_value"] = 5000;
            meta.Evaluate();
            Assert.Contains("mogul", _state.Player.MetaAchievements);

            _state.Player.MetaCounters["shop_sold_value"] = 0;
            meta.Evaluate();

            Assert.Contains("mogul", _state.Player.MetaAchievements, "still earned");
        }

        // -- individual conditions -----------------------------------------

        [Test]
        public void BossSlayerCountsEitherBoss()
        {
            Make();

            _state.Player.MetaKills["cave_brute"] = 1;
            Assert.IsTrue(Achievements.IsMet("boss_slayer", _state));

            _state.Player.MetaKills.Clear();
            _state.Player.MetaKills["forest_ogre"] = 1;
            Assert.IsTrue(Achievements.IsMet("boss_slayer", _state));
        }

        [Test]
        public void SkillerChecksAnySkillNotATotal()
        {
            Make();

            // Spread across skills: no single one reaches 10.
            foreach (string id in new[] { Skills.Attack, Skills.Woodcutting, Skills.Mining })
                _state.Player.Skills.AddXp(id, 200);
            Assert.IsFalse(Achievements.IsMet("skiller_10", _state));

            _state.Player.Skills.AddXp(Skills.Woodcutting, 5000);
            Assert.IsTrue(Achievements.IsMet("skiller_10", _state));
        }

        [Test]
        public void FlooderChecksAnySingleItemNotTheTotal()
        {
            Make();

            _state.Town.MarketSupply["normal_log"] = 60;
            _state.Town.MarketSupply["copper_ore"] = 60;
            Assert.IsFalse(Achievements.IsMet("flooder", _state), "120 across two items is not flooding one");

            _state.Town.MarketSupply["normal_log"] = 100;
            Assert.IsTrue(Achievements.IsMet("flooder", _state));
        }

        /// <summary>
        /// explorer_25 is a fraction of WORLD_SIZE squared, so the 126x126
        /// mainland migration made it about nine times harder: a quarter of the
        /// world went from 441 tiles to 3,969. Pinned so the change is visible
        /// rather than a surprise.
        /// </summary>
        [Test]
        public void ExplorerScalesWithTheCurrentWorldSize()
        {
            Make();

            int quarter = Grid.WorldSize * Grid.WorldSize / 4;

            for (int i = 0; i < quarter - 1; i++) _state.Player.MapExplored.Add(i);
            Assert.IsFalse(Achievements.IsMet("explorer_25", _state));

            _state.Player.MapExplored.Add(quarter);
            Assert.IsTrue(Achievements.IsMet("explorer_25", _state));

            Assert.AreEqual(3969, quarter, "126x126 world — was 441 on the 42x42 map");
        }

        [Test]
        public void RegularNeedsTenPurchasesAndMerchantNeedsOne()
        {
            Make();

            _state.Player.MetaCounters["shop_bought"] = 1;
            Assert.IsTrue(Achievements.IsMet("merchant", _state));
            Assert.IsFalse(Achievements.IsMet("regular", _state));

            _state.Player.MetaCounters["shop_bought"] = 10;
            Assert.IsTrue(Achievements.IsMet("regular", _state));
        }

        // -- counters -------------------------------------------------------

        [Test]
        public void BumpAccumulates()
        {
            MetaSystem meta = Make();

            meta.Bump("shop_sold");
            meta.Bump("shop_sold", 4);

            Assert.AreEqual(5, _state.Player.MetaCounters["shop_sold"], 1e-9);
        }

        [Test]
        public void TotalKillsSumsEveryMonster()
        {
            MetaSystem meta = Make();

            _state.Player.MetaKills["giant_rat"] = 7;
            _state.Player.MetaKills["dire_wolf"] = 3;

            Assert.AreEqual(10, meta.TotalKills());
        }
    }
}
