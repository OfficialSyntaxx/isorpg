using NUnit.Framework;
using Isoperia.Core.AI;
using Isoperia.Core.World;

namespace Isoperia.Core.Tests
{
    /// <summary>
    /// Mainland generation invariants. The prototype-island parity fixture no
    /// longer applies after the approved 126×126 conversion; these tests protect
    /// deterministic generation, region topology, and safe world boundaries.
    /// </summary>
    public class GridGenerationTests
    {
        private Grid _grid;

        [SetUp]
        public void SetUp() => _grid = new Grid();

        [Test]
        public void HasProductionDimensions()
        {
            Assert.AreEqual(126, _grid.Width);
            Assert.AreEqual(126, _grid.Height);
            Assert.AreEqual(126, Grid.WorldSize);
            Assert.AreEqual(18, Grid.GridChunk);
        }

        [Test]
        public void TerrainDistributionContainsEveryMainlandSurface()
        {
            var counts = new System.Collections.Generic.Dictionary<TerrainType, int>();
            for (int y = 0; y < _grid.Height; y++)
                for (int x = 0; x < _grid.Width; x++)
                {
                    var t = _grid.At(x, y).TerrainType;
                    counts.TryGetValue(t, out int n);
                    counts[t] = n + 1;
                }

            Assert.Greater(counts[TerrainType.Grass], 0, "grass tiles");
            Assert.Greater(counts[TerrainType.Water], 0, "water tiles");
            Assert.Greater(counts[TerrainType.Dirt], 0, "dirt tiles");
            Assert.Greater(counts[TerrainType.Sand], 0, "sand tiles");
            Assert.Greater(counts[TerrainType.Rock], 0, "rock tiles");
        }

        [Test]
        public void MainlandHasSubstantialWalkableTravelSpace()
        {
            int walkable = 0;
            for (int y = 0; y < _grid.Height; y++)
                for (int x = 0; x < _grid.Width; x++)
                    if (_grid.At(x, y).Walkable) walkable++;

            Assert.Greater(walkable, Grid.WorldSize * Grid.WorldSize / 2);
        }

        /// <summary>
        /// The authored Unity landmarks are deliberately presentation-only, but
        /// their destinations still need a real terrain route from Hearthvale.
        /// This catches a future terrain/coast change that leaves a district
        /// visible on the map but impossible to reach through the Core grid.
        /// Resources may occupy the exact destination at runtime, so the
        /// pathfinder uses its standard adjacent-goal behaviour.
        /// </summary>
        [Test]
        public void EveryMainlandDistrictHasAWalkableApproachFromHearthvale()
        {
            var destinations = new[]
            {
                (Name: "Wildwood shrine", X: 28, Y: 32),
                (Name: "Frostwatch mine", X: 96, Y: 28),
                (Name: "Sunmere waystone", X: 63, Y: 91),
                (Name: "Miregate ruin", X: 28, Y: 98),
                (Name: "Ember Road waystone", X: 82, Y: 63),
            };

            foreach (var destination in destinations)
            {
                var path = AStar.FindPath(_grid, Grid.TownCenter, Grid.TownCenter,
                    destination.X, destination.Y, allowAdjacentIfBlocked: true);
                Assert.IsNotNull(path, destination.Name + " has no terrain route from Hearthvale");
                Assert.Greater(path.Count, 0, destination.Name + " should be outside the town centre");
                var finalStep = path[path.Count - 1];
                Assert.LessOrEqual(System.Math.Max(System.Math.Abs(finalStep.X - destination.X),
                    System.Math.Abs(finalStep.Y - destination.Y)), 1, destination.Name + " approach distance");
            }
        }

        [Test]
        public void ZoneBandsMatchTypeScript()
        {
            var counts = new System.Collections.Generic.Dictionary<string, int>();
            for (int y = 0; y < _grid.Height; y++)
                for (int x = 0; x < _grid.Width; x++)
                {
                    string z = _grid.At(x, y).ZoneId;
                    counts.TryGetValue(z, out int n);
                    counts[z] = n + 1;
                }

            // One 18x18 centre chunk, then concentric seven-by-seven rings.
            Assert.AreEqual(324, counts[ZoneIds.TownCenter]);
            Assert.AreEqual(2592, counts[ZoneIds.Settlement]);
            Assert.AreEqual(5184, counts[ZoneIds.WildernessLvl1]);
            Assert.AreEqual(7776, counts[ZoneIds.WildernessLvl2]);
        }

        [Test]
        public void BiomeDistributionMatchesTypeScript()
        {
            var counts = new System.Collections.Generic.Dictionary<Biome, int>();
            for (int y = 0; y < _grid.Height; y++)
                for (int x = 0; x < _grid.Width; x++)
                {
                    var b = _grid.At(x, y).Biome;
                    counts.TryGetValue(b, out int n);
                    counts[b] = n + 1;
                }

            Assert.AreEqual(2916, counts[Biome.Meadow]);
            Assert.AreEqual(6480, counts[Biome.Forest]);
            Assert.AreEqual(3240, counts[Biome.Snow]);
            Assert.AreEqual(3240, counts[Biome.Swamp]);
        }

        /// <summary>
        /// The town core is the build area. Rock and dirt there made the spawn
        /// look like a quarry, and an interior lake silently removed ~17% of the
        /// buildable tiles — which is why generation forces it to open ground.
        /// </summary>
        [Test]
        public void TownCentreIsAlwaysBuildableGround()
        {
            for (int y = 0; y < _grid.Height; y++)
                for (int x = 0; x < _grid.Width; x++)
                {
                    Tile t = _grid.At(x, y);
                    if (t.ZoneId != ZoneIds.TownCenter) continue;

                    Assert.IsTrue(t.TerrainType == TerrainType.Grass || t.TerrainType == TerrainType.Road,
                        $"town tile ({x},{y}) is {t.TerrainType}");
                    Assert.IsTrue(t.Buildable, $"town tile ({x},{y}) is not buildable");
                }
        }

        [Test]
        public void MapIsBoundedByWater()
        {
            for (int x = 0; x < _grid.Width; x++)
            {
                Assert.AreEqual(TerrainType.Water, _grid.At(x, 0).TerrainType);
                Assert.AreEqual(TerrainType.Water, _grid.At(x, _grid.Height - 1).TerrainType);
            }
            for (int y = 0; y < _grid.Height; y++)
            {
                Assert.AreEqual(TerrainType.Water, _grid.At(0, y).TerrainType);
                Assert.AreEqual(TerrainType.Water, _grid.At(_grid.Width - 1, y).TerrainType);
            }
        }

        /// <summary>
        /// Seed selection is stable for the same mainland coordinate and differs
        /// between edge and interior draw paths.
        /// </summary>
        [Test]
        public void DecorationSeedsAreStableAtRepresentativeCoordinates()
        {
            Assert.AreEqual(184411, _grid.At(0, 0).Seed, "edge tile: first draw");
            Assert.AreEqual(336863, _grid.At(1, 1).Seed, "coast tile: first draw");
            Assert.AreNotEqual(_grid.At(20, 20).Seed, _grid.At(20, 21).Seed, "interior seeds vary by coordinate");
            Assert.AreEqual(_grid.At(125, 125).Seed, new Grid().At(125, 125).Seed, "far corner is deterministic");
        }

        [Test]
        public void GenerationIsRepeatable()
        {
            var a = new Grid();
            var b = new Grid();
            for (int y = 0; y < a.Height; y++)
                for (int x = 0; x < a.Width; x++)
                {
                    Assert.AreEqual(a.At(x, y).TerrainType, b.At(x, y).TerrainType, $"terrain ({x},{y})");
                    Assert.AreEqual(a.At(x, y).Seed, b.At(x, y).Seed, $"seed ({x},{y})");
                    Assert.AreEqual(a.At(x, y).Elevation, b.At(x, y).Elevation, $"elevation ({x},{y})");
                }
        }

        [Test]
        public void ElevationStaysInRange()
        {
            for (int y = 0; y < _grid.Height; y++)
                for (int x = 0; x < _grid.Width; x++)
                {
                    Tile t = _grid.At(x, y);
                    if (t.TerrainType == TerrainType.Water)
                        Assert.AreEqual(-0.25, t.Elevation, $"water ({x},{y})");
                    else
                    {
                        Assert.GreaterOrEqual(t.Elevation, 0.0, $"({x},{y})");
                        Assert.LessOrEqual(t.Elevation, 0.22, $"({x},{y})");
                    }
                }
        }

        [Test]
        public void OnlyCentreChunkStartsUnlocked()
        {
            int unlocked = 0;
            for (int r = 0; r < _grid.RegionUnlocked.Length; r++)
                for (int c = 0; c < _grid.RegionUnlocked[r].Length; c++)
                    if (_grid.RegionUnlocked[r][c]) unlocked++;

            Assert.AreEqual(1, unlocked);
            Assert.IsTrue(_grid.RegionUnlocked[3][3], "centre chunk of a 7x7 mainland layout");
        }

        [Test]
        public void OccupiedTilesBlockMovement()
        {
            // Find any walkable tile and prove occupancy closes it.
            Tile t = null;
            for (int y = 0; y < _grid.Height && t == null; y++)
                for (int x = 0; x < _grid.Width && t == null; x++)
                    if (_grid.At(x, y).Walkable) t = _grid.At(x, y);

            Assert.IsNotNull(t);
            Assert.IsTrue(_grid.IsWalkable(t.X, t.Y));

            t.Occupant = Occupant.ResourceNode;
            Assert.IsFalse(_grid.IsWalkable(t.X, t.Y),
                "a resource node must block pathing: the player walks adjacent, then harvests");
        }

        [Test]
        public void OutOfBoundsIsNeitherAtNorWalkable()
        {
            Assert.IsNull(_grid.At(-1, 0));
            Assert.IsNull(_grid.At(0, -1));
            Assert.IsNull(_grid.At(_grid.Width, 0));
            Assert.IsNull(_grid.At(0, _grid.Height));

            Assert.IsFalse(_grid.IsWalkable(-1, 0));
            Assert.IsFalse(_grid.IsWalkable(_grid.Width, _grid.Height));
        }
    }
}
