using NUnit.Framework;
using Isoperia.Core.Data;

namespace Isoperia.Core.Tests
{
    /// <summary>
    /// The experience curve. Every expected value was read out of the TypeScript
    /// implementation at tag <c>web-final</c>, so a failure means the port drifted.
    ///
    /// This matters more than its size suggests: the curve's construction has two
    /// details that are easy to get subtly wrong — the threshold for level n is
    /// recorded from the terms accumulated BEFORE adding term n, and the division
    /// by 4 happens once at read time rather than per term. Getting either wrong
    /// still produces a smooth, plausible-looking curve, and silently rebalances
    /// every skill in the game.
    /// </summary>
    public class XpTableTests
    {
        [Test]
        public void MaxLevelIsNinetyNine()
        {
            Assert.AreEqual(99, XpTable.MaxLevel);
        }

        [Test]
        public void ThresholdsMatchTypeScript()
        {
            Assert.AreEqual(0, XpTable.XpForLevel(1), "level 1");
            Assert.AreEqual(83, XpTable.XpForLevel(2), "level 2");
            Assert.AreEqual(174, XpTable.XpForLevel(3), "level 3");
            Assert.AreEqual(1154, XpTable.XpForLevel(10), "level 10");
            Assert.AreEqual(101333, XpTable.XpForLevel(50), "level 50");
            Assert.AreEqual(273742, XpTable.XpForLevel(60), "level 60");
            Assert.AreEqual(737627, XpTable.XpForLevel(70), "level 70");
            Assert.AreEqual(1986068, XpTable.XpForLevel(80), "level 80");
            Assert.AreEqual(5346332, XpTable.XpForLevel(90), "level 90");
            Assert.AreEqual(11805606, XpTable.XpForLevel(98), "level 98");
            Assert.AreEqual(13034431, XpTable.XpForLevel(99), "level 99");
        }

        /// <summary>
        /// Checks all 99 entries at once rather than only the eleven spot values
        /// above. A port that got the term ordering wrong could still match a few
        /// sampled levels; it cannot match the sum.
        /// </summary>
        public void FullTableSumMatchesTypeScript()
        {
            long sum = 0;
            for (int l = 0; l <= XpTable.MaxLevel; l++) sum += XpTable.XpForLevel(l);
            Assert.AreEqual(138206875L, sum);
        }

        [Test]
        public void SumOfAllThresholdsMatchesTypeScript()
        {
            FullTableSumMatchesTypeScript();
        }

        [Test]
        public void LevelFromXpMatchesTypeScript()
        {
            Assert.AreEqual(1, XpTable.LevelFromXp(0));
            Assert.AreEqual(1, XpTable.LevelFromXp(82), "one XP short of level 2");
            Assert.AreEqual(2, XpTable.LevelFromXp(83), "exactly the level 2 threshold");
            Assert.AreEqual(98, XpTable.LevelFromXp(13034430), "one short of 99");
            Assert.AreEqual(99, XpTable.LevelFromXp(13034431));
            Assert.AreEqual(99, XpTable.LevelFromXp(99999999), "capped at 99");
        }

        /// <summary>Every threshold must be the exact boundary: one below is the previous level.</summary>
        [Test]
        public void EveryThresholdIsAnExactBoundary()
        {
            for (int lvl = 2; lvl <= XpTable.MaxLevel; lvl++)
            {
                int at = XpTable.XpForLevel(lvl);
                Assert.AreEqual(lvl, XpTable.LevelFromXp(at), $"at the level {lvl} threshold");
                Assert.AreEqual(lvl - 1, XpTable.LevelFromXp(at - 1), $"one XP below level {lvl}");
            }
        }

        [Test]
        public void CurveIsStrictlyIncreasing()
        {
            for (int lvl = 2; lvl <= XpTable.MaxLevel; lvl++)
                Assert.Greater(XpTable.XpForLevel(lvl), XpTable.XpForLevel(lvl - 1),
                    $"level {lvl} threshold is not above level {lvl - 1}");
        }

        [Test]
        public void LevelProgressIsFractionalWithinTheLevel()
        {
            XpTable.LevelProgress(83, out int level, out double into);
            Assert.AreEqual(2, level);
            Assert.AreEqual(0.0, into, 1e-9, "exactly at the threshold is 0% into the level");

            int lo = XpTable.XpForLevel(2), hi = XpTable.XpForLevel(3);
            XpTable.LevelProgress((lo + hi) / 2, out level, out into);
            Assert.AreEqual(2, level);
            Assert.AreEqual(0.5, into, 0.01, "halfway between thresholds");
        }

        /// <summary>
        /// The web build wrote this straight into a CSS width, where a NaN was
        /// silently dropped and froze the XP bar. The guard is kept.
        /// </summary>
        [Test]
        public void LevelProgressAtMaxLevelIsFull()
        {
            XpTable.LevelProgress(13034431, out int level, out double into);
            Assert.AreEqual(99, level);
            Assert.AreEqual(1.0, into, 1e-9);

            XpTable.LevelProgress(999999999, out level, out into);
            Assert.AreEqual(99, level);
            Assert.AreEqual(1.0, into, 1e-9);
        }

        [Test]
        public void LevelProgressIsAlwaysInUnitInterval()
        {
            for (int xp = 0; xp < 20000; xp += 37)
            {
                XpTable.LevelProgress(xp, out _, out double into);
                Assert.GreaterOrEqual(into, 0.0, $"xp {xp}");
                Assert.LessOrEqual(into, 1.0, $"xp {xp}");
            }
        }

        // ---- mastery -------------------------------------------------------

        /// <summary>
        /// Mastery deliberately does NOT reuse the skill curve. It did once, and
        /// was wrong by a factor of thousands: that curve spans a whole skill's
        /// lifetime while mastery is tracked per item, so mastery 99 on normal
        /// logs worked out at roughly 8,146 hours of chopping and the speed bonus
        /// it feeds did nothing in practice. Save version 1.1.0 exists because of
        /// this change.
        /// </summary>
        [Test]
        public void MasteryUsesItsOwnTriangularCurve()
        {
            Assert.AreEqual(0, MasteryTable.XpForLevel(1));
            Assert.AreEqual(1, MasteryTable.XpForLevel(2));
            Assert.AreEqual(3, MasteryTable.XpForLevel(3));
            Assert.AreEqual(45, MasteryTable.XpForLevel(10));
            Assert.AreEqual(4851, MasteryTable.XpForLevel(99));

            Assert.AreNotEqual(XpTable.XpForLevel(99), MasteryTable.XpForLevel(99),
                "mastery must not share the skill curve");
        }

        [Test]
        public void MasteryLevelFromXpIsTheInverse()
        {
            for (int lvl = 2; lvl <= MasteryTable.MaxLevel; lvl++)
            {
                int at = MasteryTable.XpForLevel(lvl);
                Assert.AreEqual(lvl, MasteryTable.LevelFromXp(at), $"at mastery {lvl}");
                Assert.AreEqual(lvl - 1, MasteryTable.LevelFromXp(at - 1), $"one below mastery {lvl}");
            }
        }

        /// <summary>
        /// Mastery 99 must be reachable in a plausible number of actions — this is
        /// the property whose absence made the old curve useless. At 1 XP per unit
        /// gathered, 4,851 units is a long grind but a finite one.
        /// </summary>
        [Test]
        public void MasteryMaxIsReachableInAPlausibleNumberOfActions()
        {
            Assert.Less(MasteryTable.XpForLevel(99), 10000,
                "mastery 99 should be thousands of actions, not millions");
        }
    }
}
