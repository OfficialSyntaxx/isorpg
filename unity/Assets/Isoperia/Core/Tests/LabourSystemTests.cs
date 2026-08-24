using System.Collections.Generic;
using NUnit.Framework;
using Isoperia.Core.Components;
using Isoperia.Core.Content;
using Isoperia.Core.Save;
using Isoperia.Core.State;
using Isoperia.Core.Systems;

namespace Isoperia.Core.Tests
{
    [TestFixture]
    public class LabourSystemTests
    {
        private static ContentDatabase Content() => TestContent.Real();

        private static GameState Fresh(ContentDatabase c)
        {
            GameState st = GameState.CreateFresh(nowMs: 0);
            st.Player.Inventory.SetCatalog(new ContentItemCatalog(c));
            return st;
        }

        // -- deterministic output ------------------------------------------

        /// <summary>
        /// A villager must keep producing the SAME ore across sessions, and
        /// nothing persists the choice — it is recomputed from the id every
        /// time. If this hash drifts, every miner in every existing save
        /// silently switches ore.
        /// </summary>
        [Test]
        public void OreChoiceIsStableForAnId()
        {
            string first = Labour.ItemFor("bram", Labour.JobMining);
            for (int i = 0; i < 5; i++)
                Assert.AreEqual(first, Labour.ItemFor("bram", Labour.JobMining));

            Assert.IsTrue(first == "copper_ore" || first == "tin_ore");
        }

        [Test]
        public void WoodcuttingAlwaysProducesLogs()
        {
            Assert.AreEqual("normal_log", Labour.ItemFor("bram", Labour.JobWoodcutting));
            Assert.AreEqual("normal_log", Labour.ItemFor("anyone_at_all", Labour.JobWoodcutting));
        }

        /// <summary>The hash is a sum of code units, so it splits ids both ways.</summary>
        [Test]
        public void OreChoiceSplitsAcrossIds()
        {
            var seen = new HashSet<string>();
            foreach (string id in new[] { "a", "b", "c", "bram", "wilda", "odo", "nessa", "tam" })
                seen.Add(Labour.ItemFor(id, Labour.JobMining));

            Assert.AreEqual(2, seen.Count, "some villagers should mine copper and some tin");
        }

        // -- veteran tiers --------------------------------------------------

        [Test]
        public void VeteranTierRisesWithHoursWorked()
        {
            ContentDatabase c = Content();

            Labour.TierFor(c, 0, out string l0, out int m0);
            Labour.TierFor(c, 7200000, out _, out int m1);
            Labour.TierFor(c, 28800000, out _, out int m2);
            Labour.TierFor(c, 72000000, out _, out int m3);

            Assert.AreEqual("New hand", l0);
            Assert.AreEqual(1, m0);
            Assert.AreEqual(2, m1);
            Assert.AreEqual(3, m2);
            Assert.AreEqual(4, m3);
        }

        [Test]
        public void JustBelowAThresholdKeepsTheLowerTier()
        {
            ContentDatabase c = Content();
            Labour.TierFor(c, 7199999, out _, out int mult);
            Assert.AreEqual(1, mult);
        }

        // -- offline accrual ------------------------------------------------

        [Test]
        public void OfflineProducesForAssignedVillagersOnly()
        {
            ContentDatabase c = Content();
            GameState st = Fresh(c);

            st.Town.Labour.Assignments["bram"] = Labour.JobWoodcutting;

            List<string> lines = Labour.AccrueOffline(st, c, 60000, 60000);

            // 60s / 20s = 3 logs at tier 1.
            Assert.AreEqual(3, st.Town.Labour.Stock["normal_log"], 1e-9);
            Assert.Greater(lines.Count, 0);
        }

        [Test]
        public void OfflineIsCappedByTheOfflineCap()
        {
            ContentDatabase c = Content();
            GameState st = Fresh(c);
            st.Town.Labour.Assignments["odo"] = Labour.JobWoodcutting;

            // Away a full day, cap of one minute.
            Labour.AccrueOffline(st, c, 86400000, 60000);

            Assert.AreEqual(3, st.Town.Labour.Stock["normal_log"], 1e-9);
        }

        [Test]
        public void NoAssignmentsProducesNothing()
        {
            ContentDatabase c = Content();
            GameState st = Fresh(c);

            Labour.AccrueOffline(st, c, 86400000, 86400000);

            Assert.AreEqual(0, st.Town.Labour.Stock.Count);
        }

        /// <summary>
        /// Worked time accrues the FULL elapsed window, not just the part that
        /// produced output. A villager banks veteran hours for the remainder too.
        /// </summary>
        [Test]
        public void WorkedTimeCountsTheWholeWindowNotJustCompletedUnits()
        {
            ContentDatabase c = Content();
            GameState st = Fresh(c);
            st.Town.Labour.Assignments["odo"] = Labour.JobWoodcutting;

            // 50s: two logs complete (40s), 10s remainder.
            Labour.AccrueOffline(st, c, 50000, 50000);

            Assert.AreEqual(50000, st.Town.Labour.Worked["odo"], 1e-9);
            Assert.AreEqual(2, st.Town.Labour.Stock["normal_log"], 1e-9);
        }

        /// <summary>
        /// The multiplier is read AFTER worked time is added, so a villager who
        /// crosses a veteran threshold while away is paid at the new rate for
        /// the whole period. Reproduced from the TypeScript deliberately.
        /// </summary>
        [Test]
        public void CrossingAVeteranThresholdWhileAwayPaysTheNewRateThroughout()
        {
            ContentDatabase c = Content();
            GameState st = Fresh(c);

            st.Town.Labour.Assignments["odo"] = Labour.JobWoodcutting;
            st.Town.Labour.Worked["odo"] = 7100000;          // just under Veteran

            // 200s of work crosses 7,200,000 and produces 10 logs.
            Labour.AccrueOffline(st, c, 200000, 200000);

            Assert.AreEqual(20, st.Town.Labour.Stock["normal_log"], 1e-9,
                "10 logs at the NEW x2 rate, not the rate held when the window opened");
        }

        // -- claiming -------------------------------------------------------

        [Test]
        public void ClaimMovesStockIntoTheBagAndClearsIt()
        {
            ContentDatabase c = Content();
            GameState st = Fresh(c);
            st.Town.Labour.Stock["normal_log"] = 12;

            var sys = new LabourSystem(st, c);
            sys.Claim(st.Player.Inventory, out List<KeyValuePair<string, int>> lost);

            Assert.AreEqual(12, st.Player.Inventory.Count("normal_log"));
            Assert.AreEqual(0, st.Town.Labour.Stock.Count);
            Assert.AreEqual(0, lost.Count);
        }

        /// <summary>
        /// Claiming into a full bag destroys the overflow — the stock is cleared
        /// unconditionally while Add respects the cap. That is the TypeScript's
        /// behaviour and is reproduced, but the loss is now REPORTED so a caller
        /// can warn instead of silently binning a night's production.
        /// </summary>
        [Test]
        public void ClaimReportsWhatTheBagCouldNotHold()
        {
            ContentDatabase c = Content();
            GameState st = Fresh(c);

            st.Player.Inventory.StorageCap = 5;
            st.Town.Labour.Stock["normal_log"] = 12;

            var sys = new LabourSystem(st, c);
            sys.Claim(st.Player.Inventory, out List<KeyValuePair<string, int>> lost);

            Assert.AreEqual(5, st.Player.Inventory.Count("normal_log"));
            Assert.AreEqual(1, lost.Count);
            Assert.AreEqual("normal_log", lost[0].Key);
            Assert.AreEqual(7, lost[0].Value);
            Assert.AreEqual(0, st.Town.Labour.Stock.Count, "stock is cleared regardless");
        }

        // -- the live tick --------------------------------------------------

        [Test]
        public void TheFirstTickOnlyEstablishesTheBaseline()
        {
            ContentDatabase c = Content();
            GameState st = Fresh(c);
            st.Town.Labour.Assignments["odo"] = Labour.JobWoodcutting;

            var sys = new LabourSystem(st, c);

            // A huge wall-clock value must not be credited as elapsed time.
            sys.Tick(1787000000000);
            Assert.AreEqual(0, st.Town.Labour.Stock.Count);
        }

        [Test]
        public void TickAccruesAndProduces()
        {
            ContentDatabase c = Content();
            GameState st = Fresh(c);
            st.Town.Labour.Assignments["odo"] = Labour.JobWoodcutting;

            var sys = new LabourSystem(st, c);
            sys.Tick(0);
            sys.Tick(40000);   // two logs

            Assert.AreEqual(2, st.Town.Labour.Stock["normal_log"], 1e-9);
        }

        /// <summary>
        /// A single tick is capped at 60 s so a stalled or backgrounded tab does
        /// not pay a burst that the offline path has already paid for.
        /// </summary>
        [Test]
        public void ASingleTickIsCappedAtOneMinute()
        {
            ContentDatabase c = Content();
            GameState st = Fresh(c);
            st.Town.Labour.Assignments["odo"] = Labour.JobWoodcutting;

            var sys = new LabourSystem(st, c);
            sys.Tick(0);
            sys.Tick(86400000);   // a day in one step

            Assert.AreEqual(3, st.Town.Labour.Stock["normal_log"], 1e-9,
                "capped at 60s = 3 logs, not a day's worth");
        }

        [Test]
        public void ReassigningResetsAccrual()
        {
            ContentDatabase c = Content();
            GameState st = Fresh(c);

            var sys = new LabourSystem(st, c);
            sys.Assign("odo", Labour.JobWoodcutting);
            sys.Tick(0);
            sys.Tick(19000);              // nearly a log

            sys.Assign("odo", Labour.JobMining);
            Assert.AreEqual(0, st.Town.Labour.Acc["odo"], 1e-9);

            sys.Tick(38000);              // 19s more, would have completed a log
            Assert.IsFalse(st.Town.Labour.Stock.ContainsKey("normal_log"));
        }

        [Test]
        public void AssigningIdleUnassigns()
        {
            ContentDatabase c = Content();
            GameState st = Fresh(c);

            var sys = new LabourSystem(st, c);
            sys.Assign("odo", Labour.JobWoodcutting);
            Assert.AreEqual(Labour.JobWoodcutting, sys.JobOf("odo"));

            sys.Assign("odo", "idle");
            Assert.IsNull(sys.JobOf("odo"));
        }
    }
}
