using System;
using System.Collections.Generic;
using NUnit.Framework;
using Isoperia.Core.Content;
using Isoperia.Core.Save;
using Isoperia.Core.Sim;
using Isoperia.Core.State;
using Isoperia.Core.Systems;
using Isoperia.Core.World;

namespace Isoperia.Core.Tests
{
    [TestFixture]
    public class ClueSystemTests
    {
        private sealed class ScriptedRandom : IRandom
        {
            private readonly double[] _v;
            public int Draws;
            public ScriptedRandom(params double[] v) { _v = v; }
            public double Next() { double d = _v[Math.Min(Draws, _v.Length - 1)]; Draws++; return d; }
        }

        private GameState _state;
        private ContentDatabase _content;
        private Grid _grid;
        private uint _seed = 12345;

        private ClueSystem Make()
        {
            _content = TestContent.Real();
            _state = GameState.CreateFresh(nowMs: 1787000000000);
            _state.Player.Inventory.SetCatalog(new ContentItemCatalog(_content));
            _grid = new Grid();
            return new ClueSystem(_state, _grid, _content, () => _seed);
        }

        private JsonValue SimpleTier() => _content.Table("clues", "CLUE_TIERS")["simple"];

        // -- reading --------------------------------------------------------

        [Test]
        public void ReadingANonScrollFails()
        {
            ClueSystem clue = Make();
            Assert.IsFalse(clue.TryRead("normal_log", out _, out ClueReadFailure why));
            Assert.AreEqual(ClueReadFailure.NotAClue, why);
        }

        [Test]
        public void ReadingAScrollYouDoNotCarryFails()
        {
            ClueSystem clue = Make();
            Assert.IsFalse(clue.TryRead("clue_simple", out _, out ClueReadFailure why));
            Assert.AreEqual(ClueReadFailure.NoneCarried, why);
        }

        [Test]
        public void ReadingConsumesTheScrollAndStartsTheHunt()
        {
            ClueSystem clue = Make();
            _state.Player.Inventory.Add("clue_simple", 2);

            Assert.IsTrue(clue.TryRead("clue_simple", out string hint, out _));

            Assert.AreEqual(1, _state.Player.Inventory.Count("clue_simple"));
            Assert.IsNotNull(_state.Player.Clue);
            Assert.AreEqual("simple", _state.Player.Clue.Tier);
            Assert.AreEqual(0, _state.Player.Clue.Step);
            Assert.IsNotNull(hint);
            StringAssert.StartsWith("Dig ", hint);
        }

        /// <summary>One hunt at a time — the map holds a single marker.</summary>
        [Test]
        public void CannotStartASecondHunt()
        {
            ClueSystem clue = Make();
            _state.Player.Inventory.Add("clue_simple", 2);
            clue.TryRead("clue_simple", out _, out _);

            Assert.IsFalse(clue.TryRead("clue_simple", out _, out ClueReadFailure why));
            Assert.AreEqual(ClueReadFailure.AlreadyActive, why);
            Assert.AreEqual(1, _state.Player.Inventory.Count("clue_simple"), "the second scroll survives");
        }

        // -- site selection is reproducible from the seed --------------------

        /// <summary>
        /// The seed is STORED in the save, so the same seed must always produce
        /// the same holes. If this drifts, a hunt in progress moves its dig sites
        /// out from under the player on reload.
        /// </summary>
        [Test]
        public void TheSameSeedAlwaysChoosesTheSameSites()
        {
            ClueSystem clue = Make();

            List<(int X, int Y)> a = clue.ChooseSites(SimpleTier(), 999, _grid.Width);
            List<(int X, int Y)> b = clue.ChooseSites(SimpleTier(), 999, _grid.Width);

            Assert.AreEqual(a.Count, b.Count);
            for (int i = 0; i < a.Count; i++)
            {
                Assert.AreEqual(a[i].X, b[i].X);
                Assert.AreEqual(a[i].Y, b[i].Y);
            }
        }

        /// <summary>
        /// GOLDEN SITES. The seed is stored in the save and a hunt survives a
        /// reload, so the exact coordinates a seed produces are a contract with
        /// every save in the wild — not merely an internal detail.
        ///
        /// "The same seed gives the same sites" is NOT enough on its own: it
        /// stays true if the draw order changes, because both sides of that
        /// comparison move together. A mutation proved exactly that — swapping
        /// the `along` and `side` draws passed every other test here while
        /// relocating every dig site. These literals are what makes the draw
        /// order load-bearing.
        ///
        /// If this fails, in-progress hunts in existing saves have moved. Do not
        /// update the numbers to match; work out what changed the stream.
        /// </summary>
        [Test]
        public void SiteSelectionMatchesItsGoldenCoordinates()
        {
            ClueSystem clue = Make();
            Assert.AreEqual(126, _grid.Width, "these coordinates are for the 126x126 mainland");

            var expected = new[] { (88, 53), (53, 30) };
            List<(int X, int Y)> actual = clue.ChooseSites(SimpleTier(), 999, _grid.Width);

            Assert.AreEqual(expected.Length, actual.Count);
            for (int i = 0; i < expected.Length; i++)
            {
                Assert.AreEqual(expected[i].Item1, actual[i].X, $"site {i} x");
                Assert.AreEqual(expected[i].Item2, actual[i].Y, $"site {i} y");
            }

            // A second seed, so a single lucky coincidence cannot carry the test.
            var expected2 = new[] { (32, 90), (48, 94) };
            List<(int X, int Y)> actual2 = clue.ChooseSites(SimpleTier(), 4242, _grid.Width);

            for (int i = 0; i < expected2.Length; i++)
            {
                Assert.AreEqual(expected2[i].Item1, actual2[i].X, $"seed 4242 site {i} x");
                Assert.AreEqual(expected2[i].Item2, actual2[i].Y, $"seed 4242 site {i} y");
            }
        }

        [Test]
        public void DifferentSeedsChooseDifferentSites()
        {
            ClueSystem clue = Make();

            List<(int X, int Y)> a = clue.ChooseSites(SimpleTier(), 1, _grid.Width);
            List<(int X, int Y)> b = clue.ChooseSites(SimpleTier(), 2, _grid.Width);

            bool differ = a.Count != b.Count;
            for (int i = 0; i < Math.Min(a.Count, b.Count) && !differ; i++)
                if (a[i].X != b[i].X || a[i].Y != b[i].Y) differ = true;

            Assert.IsTrue(differ);
        }

        [Test]
        public void SitesAreWalkableAndNeverInTheTownCentre()
        {
            ClueSystem clue = Make();

            for (uint seed = 1; seed <= 20; seed++)
                foreach ((int X, int Y) s in clue.ChooseSites(SimpleTier(), seed, _grid.Width))
                {
                    Assert.IsTrue(_grid.IsWalkable(s.X, s.Y), $"({s.X},{s.Y}) must be standable");
                    Assert.AreNotEqual(ZoneIds.TownCenter, _grid.At(s.X, s.Y).ZoneId,
                        "digging up the market square would be a poor clue");
                }
        }

        [Test]
        public void SitesAreNeverPackedTogether()
        {
            ClueSystem clue = Make();

            for (uint seed = 1; seed <= 20; seed++)
            {
                List<(int X, int Y)> sites = clue.ChooseSites(SimpleTier(), seed, _grid.Width);
                for (int i = 0; i < sites.Count; i++)
                    for (int j = i + 1; j < sites.Count; j++)
                        Assert.GreaterOrEqual(
                            Math.Abs(sites[i].X - sites[j].X) + Math.Abs(sites[i].Y - sites[j].Y),
                            ClueSystem.MinApart);
            }
        }

        [Test]
        public void AHuntGetsAsManySitesAsItsTierAsks()
        {
            ClueSystem clue = Make();
            int steps = (int)SimpleTier()["steps"].AsNumber(0);

            Assert.AreEqual(steps, clue.ChooseSites(SimpleTier(), 7, _grid.Width).Count);
        }

        // -- digging --------------------------------------------------------

        [Test]
        public void DiggingTheWrongTileDoesNothing()
        {
            ClueSystem clue = Make();
            _state.Player.Inventory.Add("clue_simple", 1);
            clue.TryRead("clue_simple", out _, out _);

            (int X, int Y) site = clue.CurrentSite().Value;
            DigOutcome r = clue.Dig(site.X + 5, site.Y + 5, new ScriptedRandom(0.5));

            Assert.IsFalse(r.Ok);
            Assert.AreEqual(ClueDigFailure.WrongTile, r.Reason);
            Assert.AreEqual(0, _state.Player.Clue.Step, "the hunt does not advance");
        }

        [Test]
        public void DiggingWithNoHuntFails()
        {
            ClueSystem clue = Make();
            Assert.AreEqual(ClueDigFailure.NoClue, clue.Dig(5, 5, new ScriptedRandom(0.5)).Reason);
        }

        [Test]
        public void DiggingEachSiteAdvancesThenFinishes()
        {
            ClueSystem clue = Make();
            _state.Player.Inventory.Add("clue_simple", 1);
            clue.TryRead("clue_simple", out _, out _);

            int total = _state.Player.Clue.Sites.Count;

            for (int i = 0; i < total - 1; i++)
            {
                (int X, int Y) s = clue.CurrentSite().Value;
                DigOutcome mid = clue.Dig(s.X, s.Y, new ScriptedRandom(0.5));
                Assert.IsTrue(mid.Ok);
                Assert.IsFalse(mid.Done);
            }

            (int X, int Y) last = clue.CurrentSite().Value;
            DigOutcome end = clue.Dig(last.X, last.Y, new ScriptedRandom(0.5));

            Assert.IsTrue(end.Done);
            Assert.IsNotNull(end.Reward);
            Assert.IsNull(_state.Player.Clue, "the hunt is over");
            Assert.AreEqual(1, _state.Player.MetaCounters["clues_done"], 1e-9);
        }

        // -- the payout -----------------------------------------------------

        /// <summary>
        /// DRAW ORDER: coins, then one draw per loot row, then the unique check
        /// last. Reordering leaves every formula correct and pays a different
        /// prize from the same stream.
        /// </summary>
        [Test]
        public void PayoutDrawsCoinsThenLootThenTheUnique()
        {
            ClueSystem clue = Make();
            _state.Player.Inventory.Add("clue_simple", 1);
            clue.TryRead("clue_simple", out _, out _);

            JsonValue tier = SimpleTier();
            int lootRows = tier["loot"].Count;

            // DISCRIMINATING sequence: minimums for coins and every loot row,
            // then 0.99 for the unique, which is above any tier's chance so the
            // unique must FAIL.
            //
            // A draw COUNT would not prove anything here — the total is the same
            // whatever order they happen in. This works because moving the
            // unique roll earlier would hand it a 0.0 and drop the unique, so
            // Unique being null is what pins the order.
            var draws = new List<double>();
            draws.Add(0.0);                                   // coins
            for (int i = 0; i < lootRows; i++) draws.Add(0.0); // loot
            draws.Add(0.99);                                  // unique, must fail
            var rng = new ScriptedRandom(draws.ToArray());

            while (_state.Player.Clue != null)
            {
                (int X, int Y) s = clue.CurrentSite().Value;
                DigOutcome r = clue.Dig(s.X, s.Y, rng);

                if (!r.Done) continue;

                Assert.AreEqual(1 + lootRows + 1, rng.Draws, "coins + one per loot row + unique");
                Assert.AreEqual((int)tier["coins"]["min"].AsNumber(0), r.Reward.Coins,
                    "draw 0.0 takes the minimum of the coin range");
                Assert.IsNull(r.Reward.Unique,
                    "the unique is the LAST draw — rolled earlier it would have taken a 0.0 and dropped");
            }
        }

        [Test]
        public void AFailedUniqueRollStillPaysCoinsAndLoot()
        {
            ClueSystem clue = Make();
            _state.Player.Inventory.Add("clue_simple", 1);
            clue.TryRead("clue_simple", out _, out _);

            // 0.99 is above any unique chance in the table.
            var rng = new ScriptedRandom(0.99);

            ClueReward reward = null;
            while (_state.Player.Clue != null)
            {
                (int X, int Y) s = clue.CurrentSite().Value;
                DigOutcome r = clue.Dig(s.X, s.Y, rng);
                if (r.Done) reward = r.Reward;
            }

            Assert.IsNotNull(reward);
            Assert.IsNull(reward.Unique);
            Assert.Greater(reward.Coins, 0);
            Assert.Greater(reward.Items.Count, 0);
        }

        [Test]
        public void TheRewardLandsInTheBagAndTheCollectionLog()
        {
            ClueSystem clue = Make();
            _state.Player.Inventory.Add("clue_simple", 1);
            clue.TryRead("clue_simple", out _, out _);

            var rng = new ScriptedRandom(0.0);
            ClueReward reward = null;
            while (_state.Player.Clue != null)
            {
                (int X, int Y) s = clue.CurrentSite().Value;
                DigOutcome r = clue.Dig(s.X, s.Y, rng);
                if (r.Done) reward = r.Reward;
            }

            Assert.AreEqual(reward.Coins, _state.Player.Inventory.Count("coins"));
            foreach (KeyValuePair<string, int> item in reward.Items)
            {
                Assert.GreaterOrEqual(_state.Player.Inventory.Count(item.Key), item.Value);
                Assert.IsTrue(_state.CollectionLog.Contains(item.Key));
            }
        }

        // -- abandoning -----------------------------------------------------

        [Test]
        public void AbandoningEndsTheHuntAndTheScrollIsGone()
        {
            ClueSystem clue = Make();
            _state.Player.Inventory.Add("clue_simple", 1);
            clue.TryRead("clue_simple", out _, out _);

            Assert.IsTrue(clue.Abandon());
            Assert.IsNull(_state.Player.Clue);
            Assert.AreEqual(0, _state.Player.Inventory.Count("clue_simple"), "it was read, not returned");
            Assert.IsFalse(clue.Abandon(), "nothing to abandon twice");
        }

        // -- hints ----------------------------------------------------------

        [Test]
        public void HintsNameADirectionAwayFromTheCentre()
        {
            int size = 126;
            int c = size / 2;

            StringAssert.Contains("north", ClueSystem.HintFor(c, c - 30, size, null));
            StringAssert.Contains("south", ClueSystem.HintFor(c, c + 30, size, null));
            StringAssert.Contains("east", ClueSystem.HintFor(c + 30, c, size, null));
            StringAssert.Contains("west", ClueSystem.HintFor(c - 30, c, size, null));
        }

        [Test]
        public void AHintAtTheCentreDescribesTheSettlement()
        {
            int size = 126;
            StringAssert.Contains("heart of the settlement", ClueSystem.HintFor(size / 2, size / 2, size, null));
        }

        [Test]
        public void HintsMentionTheGround()
        {
            int size = 126;
            StringAssert.Contains("close-standing trees", ClueSystem.HintFor(size / 2, 5, size, Biome.Forest));
            StringAssert.Contains("hard and cold", ClueSystem.HintFor(size / 2, 5, size, Biome.Snow));
        }
    }
}
