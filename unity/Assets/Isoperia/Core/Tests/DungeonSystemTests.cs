using System;
using System.Collections.Generic;
using NUnit.Framework;
using Isoperia.Core.AI;
using Isoperia.Core.Sim;
using Isoperia.Core.Systems;

namespace Isoperia.Core.Tests
{
    [TestFixture]
    public class DungeonSystemTests
    {
        private sealed class ScriptedRandom : IRandom
        {
            private readonly double[] _v;
            public int Draws;
            public ScriptedRandom(params double[] v) { _v = v; }
            public double Next() { double d = _v[Math.Min(Draws, _v.Length - 1)]; Draws++; return d; }
        }

        /// <summary>A surface grid whose walkability is decided by a predicate.</summary>
        private sealed class FakeSurface : IGridLike
        {
            private readonly Func<int, int, bool> _walk;
            private readonly int _size;

            public FakeSurface(int size, Func<int, int, bool> walk) { _size = size; _walk = walk; }

            public int Width => _size;
            public int Height => _size;
            public bool IsWalkable(int x, int y) =>
                x >= 0 && y >= 0 && x < _size && y < _size && _walk(x, y);
        }

        private const int Size = 42;

        private static DungeonSystem Make() =>
            new DungeonSystem(new FakeSurface(Size, (x, y) => true), Size);

        // -- the entrance ----------------------------------------------------

        [Test]
        public void EntranceIsTheFarCornerWhenTheCornerIsWalkable()
        {
            DungeonSystem d = Make();
            Assert.AreEqual((Size - 2, Size - 2), d.Entrance);
        }

        [Test]
        public void EntranceSearchesInwardFromTheFarCorner()
        {
            // Only one tile in the far-corner window is walkable, so the search
            // must actually scan rather than take the first tile it looks at.
            var surface = new FakeSurface(Size, (x, y) => x == Size - 5 && y == Size - 4);
            var d = new DungeonSystem(surface, Size);

            Assert.AreEqual((Size - 5, Size - 4), d.Entrance);
        }

        [Test]
        public void EntrancePrefersTheCornerWindowOverANearerTileInScanOrder()
        {
            // (5, 39) is reached FIRST by the row-major sweep but lies outside
            // the 12-tile corner window; (35, 35) is inside it. The window must
            // win, or the dungeon opens next door to the village instead of at
            // the far edge of the world.
            var surface = new FakeSurface(Size, (x, y) => (x == 5 && y == 39) || (x == 35 && y == 35));
            var d = new DungeonSystem(surface, Size);

            Assert.AreEqual((35, 35), d.Entrance);
        }

        [Test]
        public void EntranceFallsBackOutsideTheCornerWindowWhenItIsAllBlocked()
        {
            // Walkable only well away from the corner: the 12-tile window finds
            // nothing, and the second, unrestricted sweep has to supply the tile.
            var surface = new FakeSurface(Size, (x, y) => x == 4 && y == 5);
            var d = new DungeonSystem(surface, Size);

            Assert.AreEqual((4, 5), d.Entrance);
        }

        [Test]
        public void EntranceFallsBackToAFixedOffsetWhenNothingIsWalkable()
        {
            var surface = new FakeSurface(Size, (x, y) => false);
            var d = new DungeonSystem(surface, Size);

            Assert.AreEqual((Size - 8, Size - 8), d.Entrance);
        }

        // -- the layout ------------------------------------------------------

        [Test]
        public void TheLayoutIsIdenticalOnEveryConstruction()
        {
            DungeonSystem a = Make();
            DungeonSystem b = Make();

            var differing = new List<string>();
            for (int y = 0; y < DungeonSystem.H; y++)
                for (int x = 0; x < DungeonSystem.W; x++)
                    if (a.TileAt(x, y) != b.TileAt(x, y)) differing.Add(x + "," + y);

            Assert.IsEmpty(differing, "the dungeon layout must be fixed, not generated");
            Assert.AreEqual(a.Spawn, b.Spawn);
            Assert.AreEqual(a.Key, b.Key);
            Assert.AreEqual(a.Door, b.Door);
            Assert.AreEqual(a.Brute, b.Brute);
        }

        [Test]
        public void TheLayoutIsNotEntirelyWallsNorEntirelyFloor()
        {
            DungeonSystem d = Make();

            int floors = 0;
            for (int y = 0; y < DungeonSystem.H; y++)
                for (int x = 0; x < DungeonSystem.W; x++)
                    if (d.TileAt(x, y) == DungeonSystem.Floor) floors++;

            int total = DungeonSystem.W * DungeonSystem.H;
            Assert.Greater(floors, 60, "a dungeon with almost no floor is not walkable");
            Assert.Less(floors, total / 2, "carving should leave the map mostly wall");
        }

        [Test]
        public void EveryLandmarkExceptTheSealedDoorIsStandable()
        {
            DungeonSystem d = Make();

            Assert.IsTrue(d.IsWalkable(d.Spawn.X, d.Spawn.Y), "spawn");
            Assert.IsTrue(d.IsWalkable(d.Chest.X, d.Chest.Y), "chest");
            Assert.IsTrue(d.IsWalkable(d.Exit.X, d.Exit.Y), "exit");
            Assert.IsTrue(d.IsWalkable(d.Key.X, d.Key.Y), "key");
            Assert.IsTrue(d.IsWalkable(d.Brute.X, d.Brute.Y), "brute");

            Assert.IsFalse(d.IsWalkable(d.Door.X, d.Door.Y), "the door starts sealed");
        }

        [Test]
        public void LandmarksAreDistinctTiles()
        {
            DungeonSystem d = Make();

            var seen = new HashSet<string>();
            foreach ((int X, int Y) p in new[] { d.Spawn, d.Chest, d.Exit, d.Key, d.Brute })
                Assert.IsTrue(seen.Add(p.X + "," + p.Y), "two landmarks share a tile: " + p.X + "," + p.Y);
        }

        [Test]
        public void EverythingOutsideTheGridReadsAsWall()
        {
            DungeonSystem d = Make();

            Assert.AreEqual(DungeonSystem.Wall, d.TileAt(-1, 0));
            Assert.AreEqual(DungeonSystem.Wall, d.TileAt(0, -1));
            Assert.AreEqual(DungeonSystem.Wall, d.TileAt(DungeonSystem.W, 0));
            Assert.AreEqual(DungeonSystem.Wall, d.TileAt(0, DungeonSystem.H));

            Assert.IsFalse(d.IsWalkable(-1, 0));
            Assert.IsFalse(d.IsWalkable(DungeonSystem.W, DungeonSystem.H));
        }

        // -- the quest route: key -> door -> exit ----------------------------

        [Test]
        public void TheKeyAndTheChestAreReachableFromSpawnWithTheDoorStillSealed()
        {
            DungeonSystem d = Make();

            Assert.IsNotNull(
                AStar.FindPath(d, d.Spawn.X, d.Spawn.Y, d.Key.X, d.Key.Y),
                "the key must be reachable before the door opens, or the quest deadlocks");
            Assert.IsNotNull(
                AStar.FindPath(d, d.Spawn.X, d.Spawn.Y, d.Chest.X, d.Chest.Y),
                "the chest must be reachable without the key");
        }

        [Test]
        public void TheExitIsSealedUntilTheKeyTurnsAndOpenAfterwards()
        {
            DungeonSystem d = Make();

            Assert.IsNull(
                AStar.FindPath(d, d.Spawn.X, d.Spawn.Y, d.Exit.X, d.Exit.Y),
                "the door is the single seam: the exit must be unreachable while it is sealed");

            d.Unlock();

            Assert.IsTrue(d.DoorOpened);
            Assert.IsTrue(d.IsWalkable(d.Door.X, d.Door.Y));
            Assert.IsNotNull(
                AStar.FindPath(d, d.Spawn.X, d.Spawn.Y, d.Exit.X, d.Exit.Y),
                "unlocking must actually open the route to the exit");
        }

        [Test]
        public void TheBruteStandsOnTheDoorwaySideOfTheSeal()
        {
            DungeonSystem d = Make();

            Assert.AreEqual(d.Door.X, d.Brute.X, "the brute guards the door column");
            Assert.AreEqual(d.Door.Y + 1, d.Brute.Y, "the brute stands one tile past the door");
        }

        [Test]
        public void TakingTheKeyIsRecordedAndDoesNotOpenTheDoor()
        {
            DungeonSystem d = Make();
            d.TakeKey();

            Assert.IsTrue(d.KeyTaken);
            Assert.IsFalse(d.DoorOpened, "picking the key up is not the same as turning it");
            Assert.IsFalse(d.IsWalkable(d.Door.X, d.Door.Y));
        }

        // -- the run ---------------------------------------------------------

        [Test]
        public void EnteringStartsFloorOneActiveWithAFreshStory()
        {
            DungeonSystem d = Make();
            d.Unlock();
            d.TakeKey();
            d.OpenedChest = true;

            List<DungeonSpawn> spawns = d.Enter();

            Assert.IsTrue(d.Active);
            Assert.AreEqual(1, d.CurrentFloor);
            Assert.IsFalse(d.KeyTaken);
            Assert.IsFalse(d.DoorOpened);
            Assert.IsFalse(d.OpenedChest);
            Assert.IsFalse(d.IsWalkable(d.Door.X, d.Door.Y), "entering reseals the door");

            Assert.AreEqual("cave_brute", spawns[0].MonsterId, "the floor-1 brute leads the list");
            Assert.AreEqual(d.Brute, (spawns[0].X, spawns[0].Y));
            Assert.AreEqual(1 + 4 + 2, spawns.Count);
        }

        [Test]
        public void DescendingAdvancesTheFloorAndResealsTheDoor()
        {
            DungeonSystem d = Make();
            d.Enter();
            d.Unlock();
            d.TakeKey();

            List<DungeonSpawn> two = d.Descend();

            Assert.AreEqual(2, d.CurrentFloor);
            Assert.IsFalse(d.DoorOpened, "a new floor is a new sealed door");
            Assert.IsFalse(d.KeyTaken);
            Assert.IsFalse(d.IsWalkable(d.Door.X, d.Door.Y));

            Assert.AreEqual(6 + 2, two.Count);
            foreach (DungeonSpawn s in two)
                Assert.AreNotEqual("cave_bat", s.MonsterId, "bats are a floor-1 monster");
        }

        [Test]
        public void DescendingStopsAtTheDeepestFloor()
        {
            DungeonSystem d = Make();
            d.Enter();
            d.Descend();
            d.Descend();

            Assert.AreEqual(DungeonSystem.MaxFloor, d.CurrentFloor);

            List<DungeonSpawn> none = d.Descend();

            Assert.IsEmpty(none, "there is no floor 4, and asking for one must spawn nothing");
            Assert.AreEqual(DungeonSystem.MaxFloor, d.CurrentFloor);
        }

        [Test]
        public void AscendingBackToFloorOneRestoresTheBrute()
        {
            DungeonSystem d = Make();
            d.Enter();
            d.Descend();

            List<DungeonSpawn> up = d.Ascend();

            Assert.AreEqual(1, d.CurrentFloor);
            Assert.AreEqual("cave_brute", up[0].MonsterId);
            Assert.AreEqual(d.Brute, (up[0].X, up[0].Y));
            Assert.AreEqual(1 + 4 + 2, up.Count);
        }

        [Test]
        public void AscendingFromDeepFloorsDoesNotAddABrute()
        {
            DungeonSystem d = Make();
            d.Enter();
            d.Descend();
            d.Descend();

            List<DungeonSpawn> up = d.Ascend();

            Assert.AreEqual(2, d.CurrentFloor);
            Assert.AreEqual(6 + 2, up.Count, "floor 2 gets its pool and nothing else");
            Assert.AreEqual(d.Brute, (d.Brute.X, d.Brute.Y));
        }

        [Test]
        public void AscendingFromTheFirstFloorIsRefused()
        {
            DungeonSystem d = Make();
            d.Enter();

            List<DungeonSpawn> none = d.Ascend();

            Assert.IsEmpty(none);
            Assert.AreEqual(1, d.CurrentFloor);
        }

        [Test]
        public void LeavingClearsActiveWithoutTouchingTheFloor()
        {
            DungeonSystem d = Make();
            d.Enter();
            d.Descend();
            d.Leave();

            Assert.IsFalse(d.Active);
            Assert.AreEqual(2, d.CurrentFloor, "leaving is not the same as resetting the run");
        }

        // -- monster pools ---------------------------------------------------

        [Test]
        public void PoolCompositionIsFixedPerFloor()
        {
            DungeonSystem d = Make();

            Assert.AreEqual("cave_bat:4,cave_slasher:2", Composition(d.PoolFor(1)));
            Assert.AreEqual("cave_slasher:6,cave_brute:2", Composition(d.PoolFor(2)));
            Assert.AreEqual("cave_slasher:8,cave_brute:3", Composition(d.PoolFor(3)));
        }

        [Test]
        public void FloorZeroAndBelowUseTheFirstFloorPool()
        {
            DungeonSystem d = Make();
            Assert.AreEqual(Composition(d.PoolFor(1)), Composition(d.PoolFor(0)));
        }

        [Test]
        public void FloorsBeyondTheDeepestUseTheDeepestPool()
        {
            DungeonSystem d = Make();
            Assert.AreEqual(Composition(d.PoolFor(3)), Composition(d.PoolFor(9)));
        }

        [Test]
        public void PlacementIsDeterministicAcrossInstances()
        {
            DungeonSystem a = Make();
            DungeonSystem b = Make();

            Assert.AreEqual(Dump(a.PoolFor(2)), Dump(b.PoolFor(2)));
            Assert.AreEqual(Dump(a.PoolFor(2)), Dump(a.PoolFor(2)), "and stable when asked twice");
        }

        [Test]
        public void PlacementStridesRatherThanStacking()
        {
            // The prime stride exists so monsters do not pile onto one tile. If
            // it were replaced by, say, n % count the spawns would still be
            // legal — so this pins spread, not just legality.
            DungeonSystem d = Make();
            List<DungeonSpawn> pool = d.PoolFor(3);

            var tiles = new HashSet<string>();
            foreach (DungeonSpawn s in pool) tiles.Add(s.X + "," + s.Y);

            Assert.AreEqual(pool.Count, tiles.Count, "no two monsters may share a tile");

            // The exact placement, pinned. Distinctness alone does not pin the
            // prime stride — a stride of 1 also gives distinct tiles, it just
            // walks them consecutively. This golden is what actually holds the
            // layout still, so a changed stride shows up here as a diff.
            Assert.AreEqual(
                "cave_slasher@13,5,cave_slasher@12,11,cave_slasher@4,13,cave_slasher@10,14,"
              + "cave_slasher@8,18,cave_slasher@12,5,cave_slasher@11,11,cave_slasher@3,13,"
              + "cave_brute@9,14,cave_brute@6,18,cave_brute@11,5",
                Dump(pool));
        }

        [Test]
        public void EveryMonsterStandsOnFloorAwayFromSpawnAndOffEveryLandmark()
        {
            DungeonSystem d = Make();

            foreach (DungeonSpawn s in d.PoolFor(3))
            {
                Assert.IsTrue(d.IsWalkable(s.X, s.Y), "spawned into a wall at " + s.X + "," + s.Y);

                int gap = Math.Abs(s.X - d.Spawn.X) + Math.Abs(s.Y - d.Spawn.Y);
                Assert.GreaterOrEqual(gap, 6, "a monster started in melee range of the arrival tile");

                Assert.AreNotEqual((d.Chest.X, d.Chest.Y), (s.X, s.Y));
                Assert.AreNotEqual((d.Exit.X, d.Exit.Y), (s.X, s.Y));
                Assert.AreNotEqual((d.Door.X, d.Door.Y), (s.X, s.Y));
                Assert.AreNotEqual((d.Key.X, d.Key.Y), (s.X, s.Y));
                Assert.AreNotEqual((d.Brute.X, d.Brute.Y), (s.X, s.Y));
            }
        }

        [Test]
        public void HordeMultipliesCountsAndRoundsUp()
        {
            DungeonSystem d = Make();
            d.Modifier = DungeonModifier.Horde;

            // 4 * 1.5 = 6 exactly; 2 * 1.5 = 3 exactly.
            Assert.AreEqual("cave_bat:6,cave_slasher:3", Composition(d.PoolFor(1)));
            // 3 * 1.5 = 4.5, which must round UP to 5, not down to 4.
            Assert.AreEqual("cave_slasher:12,cave_brute:5", Composition(d.PoolFor(3)));
        }

        [Test]
        public void ScarcityDoesNotChangeTheMonsterPool()
        {
            DungeonSystem plain = Make();
            DungeonSystem scarce = Make();
            scarce.Modifier = DungeonModifier.Scarcity;

            Assert.AreEqual(Dump(plain.PoolFor(2)), Dump(scarce.PoolFor(2)),
                "scarcity is a loot modifier, not a difficulty one");
        }

        // -- the chest -------------------------------------------------------

        [Test]
        public void FirstFloorChestHasThreeStacksAndItsOwnRanges()
        {
            DungeonSystem d = Make();
            d.Enter();

            var low = new ScriptedRandom(0.0);
            List<KeyValuePair<string, int>> min = d.ChestLoot(low);

            Assert.AreEqual("coins:15,iron_ore:2,cooked_trout:1,iron_sword:1", Dump(min),
                "at roll 0 every stack sits on its floor and the sword drops");

            var high = new ScriptedRandom(0.999);
            List<KeyValuePair<string, int>> max = d.ChestLoot(high);

            Assert.AreEqual("coins:40,iron_ore:4,cooked_trout:2", Dump(max),
                "at roll 0.999 the stacks cap and both weapon rolls miss");
        }

        [Test]
        public void SecondAndThirdFloorChestsAddCoalAndPayMore()
        {
            DungeonSystem d = Make();
            d.Enter();
            d.Descend();

            Assert.AreEqual("coins:40,iron_ore:3,coal:2,cooked_trout:2,iron_sword:1",
                Dump(d.ChestLoot(new ScriptedRandom(0.0))));

            d.Descend();

            Assert.AreEqual("coins:90,iron_ore:5,coal:4,cooked_trout:3,iron_sword:1",
                Dump(d.ChestLoot(new ScriptedRandom(0.0))));
        }

        [Test]
        public void TheSwordAndTheBowAreMutuallyExclusiveAndTheBowRollIsSkipped()
        {
            DungeonSystem d = Make();
            d.Enter();

            // Three stack draws, then 0.05 — under the 0.12 sword chance.
            var swordRng = new ScriptedRandom(0.5, 0.5, 0.5, 0.05, 0.0);
            List<KeyValuePair<string, int>> sword = d.ChestLoot(swordRng);

            Assert.IsTrue(Dump(sword).Contains("iron_sword:1"));
            Assert.IsFalse(Dump(sword).Contains("shortbow"));
            Assert.AreEqual(4, swordRng.Draws,
                "the bow roll must be skipped entirely when the sword drops");

            // 0.5 misses the sword, then 0.05 is under the 0.08 bow chance.
            var bowRng = new ScriptedRandom(0.5, 0.5, 0.5, 0.5, 0.05);
            List<KeyValuePair<string, int>> bow = d.ChestLoot(bowRng);

            Assert.IsTrue(Dump(bow).Contains("shortbow:1"));
            Assert.IsFalse(Dump(bow).Contains("iron_sword"));
            Assert.AreEqual(5, bowRng.Draws, "a missed sword costs one extra draw, not zero");
        }

        [Test]
        public void WeaponChancesRiseWithDepth()
        {
            DungeonSystem d = Make();
            d.Enter();

            // 0.3 misses on floor 1 (0.12) and floor 2 (0.25) but hits on 3 (0.35).
            Assert.IsFalse(Dump(d.ChestLoot(new ScriptedRandom(0.5, 0.5, 0.5, 0.3, 0.5))).Contains("iron_sword"));

            d.Descend();
            Assert.IsFalse(Dump(d.ChestLoot(new ScriptedRandom(0.5, 0.5, 0.5, 0.5, 0.3, 0.5))).Contains("iron_sword"));

            d.Descend();
            Assert.IsTrue(Dump(d.ChestLoot(new ScriptedRandom(0.5, 0.5, 0.5, 0.5, 0.3))).Contains("iron_sword"));
        }

        [Test]
        public void StackDrawOrderIsCoinsOreThenFood()
        {
            DungeonSystem d = Make();
            d.Enter();

            // A different value per draw, so a reordering shows up as wrong
            // quantities rather than as an identical list.
            var rng = new ScriptedRandom(0.0, 0.999, 0.5, 0.9);
            Assert.AreEqual("coins:15,iron_ore:4,cooked_trout:2", Dump(d.ChestLoot(rng)));
        }

        [Test]
        public void ScarcityTakesFortyPercentOffEveryStack()
        {
            DungeonSystem d = Make();
            d.Enter();
            d.Descend();
            d.Descend();
            d.Modifier = DungeonModifier.Scarcity;

            // Full: coins 90, iron_ore 5, coal 4, cooked_trout 3, iron_sword 1.
            Assert.AreEqual("coins:54,iron_ore:3,coal:2,cooked_trout:1,iron_sword:1",
                Dump(d.ChestLoot(new ScriptedRandom(0.0))));
        }

        [Test]
        public void ScarcityNeverEmptiesAStack()
        {
            DungeonSystem d = Make();
            d.Enter();
            d.Modifier = DungeonModifier.Scarcity;

            // cooked_trout is 1 at roll 0; floor(1 * 0.6) is 0, which the floor
            // of 1 must rescue.
            List<KeyValuePair<string, int>> drops = d.ChestLoot(new ScriptedRandom(0.0));

            foreach (KeyValuePair<string, int> drop in drops)
                Assert.GreaterOrEqual(drop.Value, 1, drop.Key + " was reduced to nothing");

            Assert.IsTrue(Dump(drops).Contains("cooked_trout:1"));
        }

        [Test]
        public void ScarcityDoesNotApplyWithoutTheModifier()
        {
            DungeonSystem d = Make();
            d.Enter();

            Assert.AreEqual(DungeonModifier.None, d.Modifier, "runs are unmodified by default");
            Assert.IsTrue(Dump(d.ChestLoot(new ScriptedRandom(0.0))).Contains("coins:15"));
        }

        // -- helpers ---------------------------------------------------------

        private static string Dump(List<KeyValuePair<string, int>> drops)
        {
            var parts = new List<string>();
            foreach (KeyValuePair<string, int> d in drops) parts.Add(d.Key + ":" + d.Value);
            return string.Join(",", parts.ToArray());
        }

        private static string Dump(List<DungeonSpawn> spawns)
        {
            var parts = new List<string>();
            foreach (DungeonSpawn s in spawns) parts.Add(s.MonsterId + "@" + s.X + "," + s.Y);
            return string.Join(",", parts.ToArray());
        }

        /// <summary>Monster ids and counts, in first-seen order.</summary>
        private static string Composition(List<DungeonSpawn> spawns)
        {
            var order = new List<string>();
            var counts = new Dictionary<string, int>();

            foreach (DungeonSpawn s in spawns)
            {
                if (!counts.ContainsKey(s.MonsterId)) { counts[s.MonsterId] = 0; order.Add(s.MonsterId); }
                counts[s.MonsterId] += 1;
            }

            var parts = new List<string>();
            foreach (string id in order) parts.Add(id + ":" + counts[id]);
            return string.Join(",", parts.ToArray());
        }
    }
}
