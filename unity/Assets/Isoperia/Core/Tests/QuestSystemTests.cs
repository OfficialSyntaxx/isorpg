using System;
using System.Collections.Generic;
using NUnit.Framework;
using Isoperia.Core.Content;
using Isoperia.Core.Save;
using Isoperia.Core.Sim;
using Isoperia.Core.State;
using Isoperia.Core.Systems;

namespace Isoperia.Core.Tests
{
    [TestFixture]
    public class QuestSystemTests
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

        private QuestSystem Make(IRandom rng = null)
        {
            _content = TestContent.Real();
            _state = GameState.CreateFresh(nowMs: 1787000000000);
            _state.Player.Inventory.SetCatalog(new ContentItemCatalog(_content));
            return new QuestSystem(_state, _content, rng ?? new ScriptedRandom(0.0));
        }

        // -- the Caves stage machine ----------------------------------------

        [Test]
        public void TheCavesQuestStartsAtIntro()
        {
            QuestSystem q = Make();
            Assert.AreEqual(QuestStage.Intro, q.Stage);
            Assert.IsFalse(q.CavesDone);
        }

        [Test]
        public void TalkingToTheGuideStartsTheHunt()
        {
            QuestSystem q = Make();

            Assert.IsTrue(q.TalkToGuide());
            Assert.AreEqual(QuestStage.FindKey, q.Stage);

            Assert.IsFalse(q.TalkToGuide(), "talking again only repeats the hint");
            Assert.AreEqual(QuestStage.FindKey, q.Stage);
        }

        [Test]
        public void TheStagesAdvanceInOrder()
        {
            QuestSystem q = Make();

            q.TalkToGuide();
            Assert.IsTrue(q.NotifyKeyFound());
            Assert.AreEqual(QuestStage.OpenDoor, q.Stage);

            Assert.IsTrue(q.NotifyDoorOpened());
            Assert.AreEqual(QuestStage.DefeatBrute, q.Stage);

            Assert.IsTrue(q.NotifyBruteDown(_state.Player.Inventory));
            Assert.AreEqual(QuestStage.Done, q.Stage);
            Assert.IsTrue(q.CavesDone);
        }

        /// <summary>
        /// Each notification comes from a different part of the world and any of
        /// them can fire twice or out of order. Requiring the exact predecessor
        /// is what stops a player skipping a step or re-collecting the reward.
        /// </summary>
        [Test]
        public void AStepCannotBeSkipped()
        {
            QuestSystem q = Make();

            Assert.IsFalse(q.NotifyDoorOpened(), "no door before the key");
            Assert.IsFalse(q.NotifyBruteDown(_state.Player.Inventory), "no brute before the door");
            Assert.AreEqual(QuestStage.Intro, q.Stage, "nothing moved");
            Assert.IsFalse(q.CavesDone);
        }

        [Test]
        public void FindingTheKeyTwiceDoesNotAdvanceTwice()
        {
            QuestSystem q = Make();
            q.TalkToGuide();

            Assert.IsTrue(q.NotifyKeyFound());
            Assert.IsFalse(q.NotifyKeyFound());
            Assert.AreEqual(QuestStage.OpenDoor, q.Stage);
        }

        [Test]
        public void TheCavesRewardIsPaidExactlyOnce()
        {
            QuestSystem q = Make();
            q.TalkToGuide();
            q.NotifyKeyFound();
            q.NotifyDoorOpened();

            Assert.IsTrue(q.NotifyBruteDown(_state.Player.Inventory));
            int coins = _state.Player.Inventory.Count("coins");
            Assert.Greater(coins, 0);

            Assert.IsFalse(q.NotifyBruteDown(_state.Player.Inventory), "the brute can be killed again");
            Assert.AreEqual(coins, _state.Player.Inventory.Count("coins"), "but pays nothing more");
        }

        /// <summary>
        /// The stage lives in MetaCounters, which is persisted and sanitized, so
        /// a hunt survives a reload without a new save field or a migration.
        /// </summary>
        [Test]
        public void TheStageSurvivesAReload()
        {
            QuestSystem first = Make();
            first.TalkToGuide();
            first.NotifyKeyFound();

            var reloaded = new QuestSystem(_state, _content, new ScriptedRandom(0.0));
            Assert.AreEqual(QuestStage.OpenDoor, reloaded.Stage);
        }

        [Test]
        public void ACompletedCavesQuestReadsDoneEvenWithoutTheCounter()
        {
            QuestSystem q = Make();
            _state.Player.Journal.Add(QuestSystem.CavesId);
            _state.Player.MetaCounters.Remove(QuestSystem.CavesStageKey);

            Assert.AreEqual(QuestStage.Done, q.Stage, "the journal is the authority once done");
        }

        // -- the ogre errand -------------------------------------------------

        [Test]
        public void TheOgreErrandCompletesOnceAndPaysOnce()
        {
            QuestSystem q = Make();

            Assert.IsTrue(q.NotifyOgreSlain(_state.Player.Inventory));
            Assert.Contains(QuestSystem.OgreId, _state.Player.Journal);

            int coins = _state.Player.Inventory.Count("coins");
            Assert.IsFalse(q.NotifyOgreSlain(_state.Player.Inventory));
            Assert.AreEqual(coins, _state.Player.Inventory.Count("coins"));
        }

        // -- data-driven tasks -----------------------------------------------

        /// <summary>
        /// THE GAP THIS PORT CLOSED. caves and ogre have no starterType, so the
        /// data-driven pass must leave them alone — and before this system
        /// existed, nothing else advanced them either, which meant neither quest
        /// could ever complete in the Unity build.
        /// </summary>
        [Test]
        public void TheDataDrivenPassIgnoresStageDrivenQuests()
        {
            QuestSystem q = Make();

            for (int i = 0; i < 5; i++) q.Tick();

            Assert.IsFalse(_state.Player.Journal.Contains(QuestSystem.CavesId));
            Assert.IsFalse(_state.Player.Journal.Contains(QuestSystem.OgreId));
        }

        [Test]
        public void AnInventoryTaskCompletesWhenTheItemsAreCarried()
        {
            QuestSystem q = Make();

            var done = new List<string>();
            q.Completed += (id, title) => done.Add(id);

            q.Tick();
            Assert.IsFalse(_state.Player.Journal.Contains("starter_gather"));

            _state.Player.Inventory.Add("normal_log", 15);
            q.Tick();

            Assert.Contains("starter_gather", done);
            Assert.Contains("starter_gather", _state.Player.Journal);
        }

        [Test]
        public void AKillTaskCompletesOnTheKillCount()
        {
            QuestSystem q = Make();

            _state.Player.MetaKills["giant_rat"] = 1;
            q.Tick();

            Assert.Contains("starter_combat", _state.Player.Journal);
        }

        [Test]
        public void AJournalTaskWaitsForItsPrerequisite()
        {
            QuestSystem q = Make();

            q.Tick();
            Assert.IsFalse(_state.Player.Journal.Contains("cinder_hollow_route"));

            _state.Player.Journal.Add("cinder_hollow_returned");
            q.Tick();

            Assert.Contains("cinder_hollow_route", _state.Player.Journal);
        }

        [Test]
        public void TickIsSafeToCallRepeatedlyAndPaysOnce()
        {
            QuestSystem q = Make();
            _state.Player.Inventory.Add("normal_log", 15);

            q.Tick();

            // Assert on the REWARD, not the input items. The first version of
            // this test compared the normal_log count, which starter_gather
            // never pays — so a build that re-paid every reward on every tick
            // passed it. A mutation proved that; the reward is 12 coins.
            int coins = _state.Player.Inventory.Count("coins");
            Assert.AreEqual(12, coins, "starter_gather pays 12 coins");

            for (int i = 0; i < 10; i++) q.Tick();

            Assert.AreEqual(coins, _state.Player.Inventory.Count("coins"),
                "ten more ticks must not pay the reward again");
            Assert.AreEqual(1, CountOf(_state.Player.Journal, "starter_gather"));
        }

        private static int CountOf(List<string> list, string v)
        {
            int n = 0;
            foreach (string s in list) if (s == v) n++;
            return n;
        }

        /// <summary>
        /// An unrecognised starterType is fatal rather than a quest that quietly
        /// never completes — the same rule the achievement conditions follow.
        /// </summary>
        [Test]
        public void AnUnknownStarterTypeIsFatal()
        {
            _content = TestContent.Real();
            _state = GameState.CreateFresh(nowMs: 1787000000000);

            // Every shipped quest must use a type this system implements.
            var known = new HashSet<string> { "inventory", "kills", "journal" };
            JsonValue quests = _content.Quests;

            for (int i = 0; i < quests.Count; i++)
            {
                string type = quests[i]["starterType"].AsString(null);
                if (string.IsNullOrEmpty(type)) continue;

                Assert.IsTrue(known.Contains(type),
                    $"quest \"{quests[i]["id"].AsString("?")}\" uses starterType \"{type}\", " +
                    "which QuestSystem does not implement — it could never complete");
            }
        }

        // -- objectives -------------------------------------------------------

        [Test]
        public void TheObjectiveFollowsTheStageThenReadsDone()
        {
            QuestSystem q = Make();

            string intro = q.ObjectiveFor(QuestSystem.CavesId);
            q.TalkToGuide();
            string findKey = q.ObjectiveFor(QuestSystem.CavesId);

            Assert.AreNotEqual(intro, findKey, "the objective tracks the stage");

            q.NotifyKeyFound();
            q.NotifyDoorOpened();
            q.NotifyBruteDown(_state.Player.Inventory);

            StringAssert.Contains("claimed", q.ObjectiveFor(QuestSystem.CavesId));
        }

        [Test]
        public void AnUnknownQuestHasNoObjective()
        {
            QuestSystem q = Make();
            Assert.AreEqual("", q.ObjectiveFor("no_such_quest"));
        }
    }
}
