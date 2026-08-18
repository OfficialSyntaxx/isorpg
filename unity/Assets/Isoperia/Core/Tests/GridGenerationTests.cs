using NUnit.Framework;
using Isoperia.Core.World;

namespace Isoperia.Core.Tests
{
    /// <summary>
    /// World-generation fidelity. Every expected number here was measured on the
    /// TypeScript build at tag <c>web-final</c>, so a failure means the port
    /// drifted, not that the world "changed".
    ///
    /// The exhaustive tile-by-tile comparison lives outside Unity in
    /// <c>scripts/verify-core-parity.cjs</c>, which diffs all 1,764 tiles against
    /// a dump from the original. These tests cover the same ground at a
    /// granularity that is readable when something breaks.
    /// </summary>
    public class GridGenerationTests
    {
        private Grid _grid;

        [SetUp]
        public void SetUp() => _grid = new Grid();

        [Test]
        public void HasProductionDimensions()
        {
            Assert.AreEqual(42, _grid.Width);
            Assert.AreEqual(42, _grid.Height);
            Assert.AreEqual(42, Grid.WorldSize);
            Assert.AreEqual(6, Grid.GridChunk);
        }

        [Test]
        public void TerrainDistributionMatchesTypeScript()
        {
            var counts = new System.Collections.Generic.Dictionary<TerrainType, int>();
            for (int y = 0; y < _grid.Height; y++)
                for (int x = 0; x < _grid.Width; x++)
                {
                    var t = _grid.At(x, y).TerrainType;
                    counts.TryGetValue(t, out int n);
                    counts[t] = n + 1;
                }

            Assert.AreEqual(1201, counts[TerrainType.Grass], "grass tiles");
            Assert.AreEqual(210, counts[TerrainType.Water], "water tiles");
            Assert.AreEqual(189, counts[TerrainType.Dirt], "dirt tiles");
            Assert.AreEqual(84, counts[TerrainType.Sand], "sand tiles");
            Assert.AreEqual(80, counts[TerrainType.Rock], "rock tiles");
        }

        [Test]
        public void WalkableTileCountMatchesTypeScript()
        {
            int walkable = 0;
            for (int y = 0; y < _grid.Height; y++)
                for (int x = 0; x < _grid.Width; x++)
                    if (_grid.At(x, y).Walkable) walkable++;

            Assert.AreEqual(1474, walkable);
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

            // One 6x6 centre chunk, then concentric rings.
            Assert.AreEqual(36, counts[ZoneIds.TownCenter]);
            Assert.AreEqual(288, counts[ZoneIds.Settlement]);
            Assert.AreEqual(576, counts[ZoneIds.WildernessLvl1]);
            Assert.AreEqual(864, counts[ZoneIds.WildernessLvl2]);
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

            Assert.AreEqual(324, counts[Biome.Meadow]);
            Assert.AreEqual(720, counts[Biome.Forest]);
            Assert.AreEqual(360, counts[Biome.Snow]);
            Assert.AreEqual(360, counts[Biome.Swamp]);
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
        /// These exact values are what catch the draw-order trap: the decoration
        /// seed is the SECOND draw for interior tiles and the FIRST for edge and
        /// coast tiles, because RollTerrain returns early for those. Removing the
        /// "unused" draw in RollTerrain leaves terrain identical and changes every
        /// one of these.
        /// </summary>
        [Test]
        public void DecorationSeedsMatchTypeScript()
        {
            Assert.AreEqual(184411, _grid.At(0, 0).Seed, "edge tile: first draw");
            Assert.AreEqual(336863, _grid.At(1, 1).Seed, "coast tile: first draw");
            Assert.AreEqual(170488, _grid.At(20, 20).Seed, "interior tile: second draw");
            Assert.AreEqual(916681, _grid.At(41, 41).Seed, "far corner");
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
            Assert.IsTrue(_grid.RegionUnlocked[3][3], "centre chunk of a 7x7 layout");
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
