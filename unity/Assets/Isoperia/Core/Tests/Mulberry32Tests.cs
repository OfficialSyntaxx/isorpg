using NUnit.Framework;
using Isoperia.Core.Sim;

namespace Isoperia.Core.Tests
{
    /// <summary>
    /// The whole world is a pure function of this generator, so these vectors are
    /// the foundation every other determinism guarantee rests on.
    ///
    /// Every expected value was captured by executing the original TypeScript
    /// implementation (<c>src/world/Grid.ts</c>, tag <c>web-final</c>). If one of
    /// these fails, the C# port is wrong — not the vector.
    /// </summary>
    public class Mulberry32Tests
    {
        private static void AssertStream(int seed, double[] expected)
        {
            var rng = new Mulberry32(seed);
            for (int i = 0; i < expected.Length; i++)
            {
                double actual = rng.Next();
                // Exact equality is the right assertion: these are the same IEEE
                // 754 operations in the same order, so any difference at all
                // means a wrong shift or a missing wrap, not rounding.
                Assert.AreEqual(expected[i], actual,
                    $"seed {seed}, draw {i}: expected {expected[i]:R}, got {actual:R}");
            }
        }

        [Test]
        public void MatchesTypeScript_BaseWorldSeed()
        {
            AssertStream(1337, new[]
            {
                0.1844118325971067,
                0.18998925131745636,
                0.8104719922412187,
                0.6437488221563399,
                0.430774615611881,
                0.381045897025615,
            });
        }

        [Test]
        public void MatchesTypeScript_ZeroSeed()
        {
            AssertStream(0, new[]
            {
                0.26642920868471265,
                0.0003297457005828619,
                0.2232720274478197,
                0.1462021479383111,
                0.46732782293111086,
                0.5450490827206522,
            });
        }

        /// <summary>
        /// Negative state is the case that separates a correct port from one that
        /// used C#'s sign-propagating <c>&gt;&gt;</c> where JavaScript uses the
        /// logical <c>&gt;&gt;&gt;</c>. A naive port passes every positive-seed
        /// test and fails here.
        /// </summary>
        [Test]
        public void MatchesTypeScript_NegativeSeed()
        {
            AssertStream(-1, new[]
            {
                0.8964226141106337,
                0.189478256739676,
                0.7156526781618595,
                0.9440599093213677,
                0.8452364315744489,
                0.5391399988438934,
            });
        }

        [Test]
        public void MatchesTypeScript_IntBoundarySeeds()
        {
            AssertStream(int.MaxValue, new[]
            {
                0.4290980885270983,
                0.12713524978607893,
                0.3852774982806295,
                0.39639189024455845,
            });

            AssertStream(int.MinValue, new[]
            {
                0.8205775609239936,
                0.4481089550536126,
                0.7836112855002284,
                0.5120457962621003,
            });
        }

        /// <summary>
        /// The exact per-tile seeding Grid.Generate uses: <c>x*31 + y*57 + 1337</c>.
        /// Two draws each, because interior tiles consume one draw inside
        /// RollTerrain before the decoration seed is read.
        /// </summary>
        [Test]
        public void MatchesTypeScript_PerTileSeeding()
        {
            AssertStream(0 * 31 + 0 * 57 + 1337, new[] { 0.1844118325971067, 0.18998925131745636 });
            AssertStream(5 * 31 + 7 * 57 + 1337, new[] { 0.531131848692894, 0.6300947370473295 });
            AssertStream(41 * 31 + 41 * 57 + 1337, new[] { 0.9166818005032837, 0.8703689584508538 });
            AssertStream(20 * 31 + 20 * 57 + 1337, new[] { 0.6368482527323067, 0.17048872192390263 });
        }

        [Test]
        public void StaysInUnitInterval()
        {
            foreach (int seed in new[] { 1337, 0, -1, int.MaxValue, int.MinValue, 987654321 })
            {
                var rng = new Mulberry32(seed);
                for (int i = 0; i < 20000; i++)
                {
                    double v = rng.Next();
                    Assert.GreaterOrEqual(v, 0.0, $"seed {seed} draw {i} went below 0");
                    Assert.Less(v, 1.0, $"seed {seed} draw {i} reached 1");
                }
            }
        }

        [Test]
        public void IsRepeatableForAGivenSeed()
        {
            var a = new Mulberry32(4242);
            var b = new Mulberry32(4242);
            for (int i = 0; i < 1000; i++)
                Assert.AreEqual(a.Next(), b.Next(), $"streams diverged at draw {i}");
        }
    }
}
