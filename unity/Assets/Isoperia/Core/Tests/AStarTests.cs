using System.Collections.Generic;
using NUnit.Framework;
using Isoperia.Core.AI;

namespace Isoperia.Core.Tests
{
    /// <summary>
    /// Pathfinding behaviour, on hand-built fixtures rather than the generated
    /// world, so a failure points at the algorithm instead of at the map.
    ///
    /// Paths are asserted by cost and endpoints, not by tile sequence: A* may
    /// return any route among equal-cost ones. See the remarks on
    /// <see cref="AStar"/> for why the port does not attempt sequence parity with
    /// the TypeScript.
    /// </summary>
    public class AStarTests
    {
        /// <summary>Rectangular grid from an ASCII map. '#' blocks, anything else is open.</summary>
        private sealed class MapGrid : IGridLike
        {
            private readonly string[] _rows;
            public MapGrid(params string[] rows) { _rows = rows; }
            public int Width => _rows[0].Length;
            public int Height => _rows.Length;
            public bool IsWalkable(int x, int y)
            {
                if (x < 0 || y < 0 || x >= Width || y >= Height) return false;
                return _rows[y][x] != '#';
            }
        }

        private static double Cost(IReadOnlyList<PathStep> path, int startX, int startY)
        {
            double c = 0;
            int px = startX, py = startY;
            foreach (var s in path)
            {
                c += (s.X != px && s.Y != py) ? System.Math.Sqrt(2.0) : 1.0;
                px = s.X; py = s.Y;
            }
            return c;
        }

        [Test]
        public void ExcludesTheStartTileAndEndsOnTheGoal()
        {
            var g = new MapGrid(".....", ".....", ".....");
            var p = AStar.FindPath(g, 0, 0, 3, 0);

            Assert.IsNotNull(p);
            Assert.AreEqual(3, p.Count, "three steps for three tiles of travel");
            Assert.AreEqual(1, p[0].X, "first step is adjacent to the start, not the start itself");
            Assert.AreEqual(3, p[p.Count - 1].X);
            Assert.AreEqual(0, p[p.Count - 1].Y);
        }

        [Test]
        public void UsesDiagonalsAtRootTwoCost()
        {
            var g = new MapGrid(".....", ".....", ".....", ".....", ".....");
            var p = AStar.FindPath(g, 0, 0, 4, 4);

            Assert.IsNotNull(p);
            Assert.AreEqual(4, p.Count, "a pure diagonal is four steps, not eight");
            Assert.AreEqual(4 * System.Math.Sqrt(2.0), Cost(p, 0, 0), 1e-9);
        }

        /// <summary>
        /// Without the corner rule a character cuts through the join of two walls,
        /// clipping visibly through geometry.
        /// </summary>
        [Test]
        public void DoesNotCutCorners()
        {
            //  . #
            //  # .      going (0,0) -> (1,1) diagonally would slice the corner
            var g = new MapGrid(".#", "#.");
            var p = AStar.FindPath(g, 0, 0, 1, 1);
            Assert.IsNull(p, "the diagonal is the only route and it must be refused");
        }

        [Test]
        public void RoutesAroundAWall()
        {
            var g = new MapGrid(
                ".....",
                ".###.",
                ".....");

            var p = AStar.FindPath(g, 0, 1, 4, 1);
            Assert.IsNotNull(p);
            Assert.AreEqual(4, p[p.Count - 1].X);
            Assert.AreEqual(1, p[p.Count - 1].Y);

            foreach (var s in p)
                Assert.IsTrue(g.IsWalkable(s.X, s.Y), $"stepped onto a blocked tile at ({s.X},{s.Y})");
        }

        [Test]
        public void ReturnsNullWhenUnreachable()
        {
            var g = new MapGrid(
                "..#..",
                "..#..",
                "..#..");

            Assert.IsNull(AStar.FindPath(g, 0, 0, 4, 0));
        }

        [Test]
        public void ReturnsNullWhenTheStartIsBlocked()
        {
            var g = new MapGrid("#....", ".....");
            Assert.IsNull(AStar.FindPath(g, 0, 0, 4, 1));
        }

        [Test]
        public void RefusesABlockedGoalUnlessAdjacentIsAllowed()
        {
            var g = new MapGrid(".....", "..#..", ".....");

            Assert.IsNull(AStar.FindPath(g, 0, 0, 2, 1),
                "a blocked goal is unreachable by default");

            var p = AStar.FindPath(g, 0, 0, 2, 1, allowAdjacentIfBlocked: true);
            Assert.IsNotNull(p, "with the flag it should stop beside the goal");

            var last = p[p.Count - 1];
            Assert.IsFalse(last.X == 2 && last.Y == 1, "must not stand on the blocked tile");

            int dx = System.Math.Abs(last.X - 2), dy = System.Math.Abs(last.Y - 1);
            Assert.LessOrEqual(System.Math.Max(dx, dy), 1,
                $"ended at ({last.X},{last.Y}), which is not adjacent to the goal");
        }

        /// <summary>This is what makes "tap a tree to go chop it" work.</summary>
        [Test]
        public void AdjacentFallbackIsHowHarvestingWorks()
        {
            var g = new MapGrid(
                ".....",
                ".....",
                "..#..");

            var p = AStar.FindPath(g, 0, 0, 2, 2, allowAdjacentIfBlocked: true);
            Assert.IsNotNull(p);
            var last = p[p.Count - 1];
            Assert.IsTrue(g.IsWalkable(last.X, last.Y));
        }

        [Test]
        public void GoalEqualToStartYieldsAnEmptyPath()
        {
            var g = new MapGrid(".....", ".....");
            var p = AStar.FindPath(g, 2, 1, 2, 1);

            Assert.IsNotNull(p, "the start is reachable from itself");
            Assert.AreEqual(0, p.Count, "no steps are needed, and the start is never included");
        }

        [Test]
        public void FindsTheOptimalCostThroughAMaze()
        {
            var g = new MapGrid(
                "..........",
                ".########.",
                ".#......#.",
                ".#.####.#.",
                ".#.#....#.",
                ".#.######.",
                ".#.......#",
                ".#########",
                "..........");

            var p = AStar.FindPath(g, 0, 0, 9, 8);
            Assert.IsNotNull(p);
            foreach (var s in p)
                Assert.IsTrue(g.IsWalkable(s.X, s.Y), $"stepped into a wall at ({s.X},{s.Y})");
            Assert.AreEqual(9, p[p.Count - 1].X);
            Assert.AreEqual(8, p[p.Count - 1].Y);
        }

        /// <summary>
        /// Two runs must agree. The heap orders equal-f nodes by insertion
        /// sequence precisely so this holds — without it, clients could disagree
        /// about which of several optimal routes a character walks.
        /// </summary>
        [Test]
        public void IsDeterministicAcrossRuns()
        {
            var g = new MapGrid(
                "..........",
                "..####....",
                "..........",
                "....####..",
                "..........");

            var a = AStar.FindPath(g, 0, 0, 9, 4);
            var b = AStar.FindPath(g, 0, 0, 9, 4);

            Assert.IsNotNull(a);
            Assert.AreEqual(a.Count, b.Count);
            for (int i = 0; i < a.Count; i++)
            {
                Assert.AreEqual(a[i].X, b[i].X, $"step {i} x");
                Assert.AreEqual(a[i].Y, b[i].Y, $"step {i} y");
            }
        }
    }
}
