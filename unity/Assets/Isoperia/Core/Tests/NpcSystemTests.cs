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
    public class NpcSystemTests
    {
        /// <summary>Cycles its values forever, so a long tick loop never runs dry.</summary>
        private sealed class CyclingRandom : IRandom
        {
            private readonly double[] _v;
            private int _i;
            public int Draws;
            public CyclingRandom(params double[] v) { _v = v.Length > 0 ? v : new[] { 0.5 }; }
            public double Next() { Draws++; return _v[_i++ % _v.Length]; }
        }

        private Grid _grid;
        private ContentDatabase _content;
        private List<TownBuilding> _buildings;

        private NpcSystem Make(IRandom rng = null)
        {
            _content = TestContent.Real();
            _grid = new Grid();
            _buildings = new List<TownBuilding>();
            return new NpcSystem(_grid, _content, rng ?? new CyclingRandom(0.5), () => _buildings);
        }

        /// <summary>
        /// VILLAGERS is an ARRAY, not a map keyed by id. Indexing it with a
        /// string silently yields Null, which is how the first version of these
        /// tests scanned an empty line list and "found no match".
        /// </summary>
        private JsonValue VillagerDef(string id)
        {
            JsonValue list = _content.Table("npcs", "VILLAGERS");
            for (int i = 0; i < list.Count; i++)
                if (list[i]["id"].AsString(null) == id) return list[i];

            throw new Exception("no villager " + id);
        }

        private NpcEntity FirstVillager(NpcSystem sys)
        {
            foreach (NpcEntity e in sys.Entities) if (e.IsVillager) return e;
            throw new Exception("no villagers in the content");
        }

        // -- spawning --------------------------------------------------------

        [Test]
        public void EveryVillagerAndCritterSpawns()
        {
            NpcSystem sys = Make();

            int villagers = 0, critters = 0;
            foreach (NpcEntity e in sys.Entities) { if (e.IsVillager) villagers++; else critters++; }

            Assert.AreEqual(3, villagers);
            Assert.AreEqual(2, critters);
        }

        /// <summary>
        /// The roster order must not depend on dictionary iteration order: it is
        /// the same on every machine, and it decides which villager is "nearest"
        /// when two are equidistant from a new building.
        /// </summary>
        [Test]
        public void TheRosterOrderIsStable()
        {
            var a = new List<string>();
            foreach (NpcEntity e in Make().Entities) a.Add(e.Id);

            var b = new List<string>();
            foreach (NpcEntity e in Make().Entities) b.Add(e.Id);

            Assert.AreEqual(string.Join(",", a.ToArray()), string.Join(",", b.ToArray()));
        }

        [Test]
        public void EveryoneSpawnsSomewhereStandable()
        {
            NpcSystem sys = Make();
            foreach (NpcEntity e in sys.Entities)
                Assert.IsTrue(_grid.IsWalkable(e.X, e.Y), $"{e.Id} spawned on an unwalkable tile");
        }

        // -- wandering -------------------------------------------------------

        [Test]
        public void NobodyMovesForTheFirstFewTicks()
        {
            NpcSystem sys = Make();
            NpcEntity e = FirstVillager(sys);
            int x = e.X, y = e.Y;

            // Idle for IdleBeforeNewTarget ticks, then TicksPerStep to move.
            for (int i = 0; i < NpcSystem.IdleBeforeNewTarget - 1; i++) sys.Tick();

            Assert.AreEqual(x, e.X);
            Assert.AreEqual(y, e.Y);
        }

        [Test]
        public void VillagersMoveOneTileAtMostEveryThreeTicks()
        {
            NpcSystem sys = Make(new CyclingRandom(0.9, 0.1, 0.33, 0.77, 0.05, 0.61));
            NpcEntity e = FirstVillager(sys);

            // Long enough that the difference is unmissable. Over 60 ticks a
            // villager that moves every tick still spends most of them idle
            // between targets, so the totals overlap and the mutant survives —
            // which is exactly what happened to the first version of this test.
            const int ticks = 600;

            int moves = 0;
            int px = e.X, py = e.Y;

            for (int i = 0; i < ticks; i++)
            {
                sys.Tick();
                if (e.X != px || e.Y != py) moves++;
                px = e.X; py = e.Y;
            }

            Assert.Greater(moves, 0, "the villager never moved at all");
            Assert.LessOrEqual(moves, ticks / NpcSystem.TicksPerStep,
                "a villager cannot outrun one tile per three ticks");
        }

        [Test]
        public void WanderersStayNearHome()
        {
            // Many distinct values, so the twelve target attempts explore the
            // whole allowed offset range. Too few values and the same handful of
            // offsets repeat, most land on water, every attempt is rejected and
            // nobody moves — which makes the test pass for the wrong reason.
            NpcSystem sys = Make(new CyclingRandom(
                0.05, 0.95, 0.5, 0.2, 0.8, 0.37, 0.63, 0.12, 0.88, 0.44, 0.71, 0.29));

            for (int i = 0; i < 600; i++) sys.Tick();

            foreach (NpcEntity e in sys.Entities)
            {
                int d = Math.Max(Math.Abs(e.X - e.HomeX), Math.Abs(e.Y - e.HomeY));
                Assert.LessOrEqual(d, e.Radius + 2, $"{e.Id} wandered {d} from home (radius {e.Radius})");
            }
        }

        [Test]
        public void NobodyWalksOntoAnUnwalkableTile()
        {
            NpcSystem sys = Make(new CyclingRandom(0.1, 0.7, 0.3, 0.9));

            for (int i = 0; i < 300; i++)
            {
                sys.Tick();
                foreach (NpcEntity e in sys.Entities)
                    Assert.IsTrue(_grid.IsWalkable(e.X, e.Y), $"{e.Id} stepped onto ({e.X},{e.Y})");
            }
        }

        // -- errands ---------------------------------------------------------

        /// <summary>
        /// With a campfire in town, villagers visit it on the schedule. Without
        /// one they never do — the errand needs somewhere to go.
        /// </summary>
        [Test]
        public void VillagersVisitACampfireOnceOneExists()
        {
            NpcSystem sys = Make();

            for (int i = 0; i < NpcSystem.FireEvery * 3; i++) sys.Tick();
            Assert.AreEqual(0, sys.FireVisits, "no campfire, no trips");

            NpcEntity e = FirstVillager(sys);
            _buildings.Add(new TownBuilding { Id = "f1", Type = "CAMPFIRE", Level = 1, X = e.X + 2, Y = e.Y });

            for (int i = 0; i < NpcSystem.FireEvery * 4; i++) sys.Tick();
            Assert.Greater(sys.FireVisits, 0);
        }

        [Test]
        public void VillagersVisitStorage()
        {
            NpcSystem sys = Make();
            NpcEntity e = FirstVillager(sys);

            _buildings.Add(new TownBuilding { Id = "s1", Type = "STOREHOUSE", Level = 1, X = e.X + 2, Y = e.Y });

            for (int i = 0; i < NpcSystem.VisitEvery * 4; i++) sys.Tick();
            Assert.Greater(sys.StorageVisits, 0);
        }

        /// <summary>
        /// A villager on an errand eventually returns to wandering rather than
        /// standing at the fire forever.
        /// </summary>
        [Test]
        public void AnErrandAlwaysEnds()
        {
            NpcSystem sys = Make();
            NpcEntity e = FirstVillager(sys);

            _buildings.Add(new TownBuilding { Id = "f1", Type = "CAMPFIRE", Level = 1, X = e.X + 2, Y = e.Y });

            // Watch for a villager who sits down AND later gets up. Asserting on
            // the task at an arbitrary final tick is wrong: villagers visit the
            // fire repeatedly, so someone being there at tick 600 is correct
            // behaviour, not a stuck state — which is exactly how the first
            // version of this test failed against working code.
            bool satDown = false;
            bool gotUp = false;

            for (int i = 0; i < 600; i++)
            {
                sys.Tick();

                if (e.Task == NpcTask.AtFire) satDown = true;
                else if (satDown) gotUp = true;
            }

            Assert.IsTrue(satDown, $"{e.Id} never reached the fire");
            Assert.IsTrue(gotUp, $"{e.Id} sat at the fire and never left");
        }

        // -- reacting to building placement ----------------------------------

        [Test]
        public void TheNearestVillagerCommentsOnANewBuilding()
        {
            NpcSystem sys = Make();
            NpcEntity e = FirstVillager(sys);

            string said = sys.OnBuildingPlaced("CAMPFIRE", e.X, e.Y + 1);

            Assert.IsNotEmpty(said);
            StringAssert.Contains(":", said);   // prefixed with who said it
        }

        [Test]
        public void PlacingABuildingSendsSomeoneToInspectIt()
        {
            NpcSystem sys = Make();
            NpcEntity e = FirstVillager(sys);

            sys.OnBuildingPlaced("CAMPFIRE", e.X + 3, e.Y);

            bool inspecting = false;
            foreach (NpcEntity n in sys.Entities)
                if (n.Task == NpcTask.ToBuilding) inspecting = true;

            Assert.IsTrue(inspecting);
        }

        // -- talking ---------------------------------------------------------

        /// <summary>
        /// Priority is deliberate: a specific remark always beats a generic one,
        /// so a villager standing at a fire never says something that ignores it.
        /// </summary>
        [Test]
        public void StandingByAFireGetsAFireLine()
        {
            NpcSystem sys = Make();
            NpcEntity e = FirstVillager(sys);

            string generic = sys.Talk(e);

            _buildings.Add(new TownBuilding { Id = "f1", Type = "CAMPFIRE", Level = 1, X = e.X, Y = e.Y });
            string byFire = sys.Talk(e);

            Assert.AreNotEqual(generic, byFire);

            JsonValue lines = VillagerDef(e.Id)["lines"]["nearCampfire"];
            bool matched = false;
            for (int i = 0; i < lines.Count; i++) if (lines[i].AsString("") == byFire) matched = true;

            Assert.IsTrue(matched, "the line came from nearCampfire");
        }

        /// <summary>
        /// Idle lines CYCLE rather than being drawn, so an NPC tapped twice never
        /// repeats itself immediately.
        /// </summary>
        [Test]
        public void IdleLinesCycleRatherThanRepeat()
        {
            NpcSystem sys = Make();

            // A villager with no buildings around falls through to its idle
            // list, which is where cycling is observable — critters ship one
            // line each, so they cannot show it.
            NpcEntity e = FirstVillager(sys);

            JsonValue talk = VillagerDef(e.Id)["talk"];
            Assert.GreaterOrEqual(talk.Count, 2,
                "cycling can only be observed with two or more lines — content changed");

            string first = sys.Talk(e);
            string second = sys.Talk(e);

            Assert.AreNotEqual(first, second);
        }

        [Test]
        public void TalkingNeverReturnsNull()
        {
            NpcSystem sys = Make();
            foreach (NpcEntity e in sys.Entities)
                for (int i = 0; i < 5; i++)
                    Assert.IsNotNull(sys.Talk(e), $"{e.Id} returned null");
        }
    }
}
