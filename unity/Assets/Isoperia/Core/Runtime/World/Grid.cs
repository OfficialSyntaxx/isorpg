using System;
using Isoperia.Core.AI;
using Isoperia.Core.Sim;

namespace Isoperia.Core.World
{
    /// <summary>
    /// The 2D tilemap: data, occupancy, and the A* adapter.
    ///
    /// Port of <c>src/world/Grid.ts</c>. The generation half is a bit-exact port
    /// and must stay that way — see <c>docs/PORTING_SPEC.md</c> §3. The grid is
    /// never serialized: it is a pure function of the seed, which is why saves
    /// are small. Only mutable state (occupancy, nodes) persists.
    /// </summary>
    public sealed class Grid : IGridLike
    {
        /// <summary>Chunk edge length. A 42x42 map yields 7x7 chunks, i.e. four
        /// concentric bands: town, settlement, wilderness, deep wilds.</summary>
        public const int GridChunk = 6;

        /// <summary>Production world size.</summary>
        public const int WorldSize = 42;

        public int Width { get; }
        public int Height { get; }

        public Tile[][] Tiles;

        /// <summary>Per-chunk unlock flags, indexed [row][col].</summary>
        public bool[][] RegionUnlocked;

        public Grid(int width = WorldSize, int height = WorldSize)
        {
            Width = width;
            Height = height;
            RegionUnlocked = InitRegions(width, height);
            Generate();
        }

        private static bool[][] InitRegions(int width, int height)
        {
            int cols = Math.Max(1, (int)Math.Ceiling(width / (double)GridChunk));
            int rows = Math.Max(1, (int)Math.Ceiling(height / (double)GridChunk));

            var grid = new bool[rows][];
            for (int r = 0; r < rows; r++) grid[r] = new bool[cols];

            // Only the centre chunk starts unlocked.
            int cr = rows / 2;
            int cc = cols / 2;
            if (cr < rows && cc < cols) grid[cr][cc] = true;

            return grid;
        }

        private void Generate()
        {
            int w = Width;
            int h = Height;

            int cols = (int)Math.Ceiling(w / (double)GridChunk);
            int rows = (int)Math.Ceiling(h / (double)GridChunk);

            Tiles = new Tile[h][];

            for (int y = 0; y < h; y++)
            {
                var row = new Tile[w];

                for (int x = 0; x < w; x++)
                {
                    // One generator per tile, seeded by position. Note this is
                    // STATEFUL across the calls below — see RollTerrain.
                    var rnd = new Mulberry32(x * 31 + y * 57 + 1337);

                    TerrainType terrain = RollTerrain(x, y, rnd);
                    string zoneId = ZoneAt(x, y, rows, cols);

                    // The town core is the build area, so keep it open ground.
                    // Rock and dirt made the spawn look like a quarry, and an
                    // interior lake silently removed ~17% of the buildable tiles.
                    TerrainType zoned =
                        zoneId == ZoneIds.TownCenter && terrain != TerrainType.Road
                            ? TerrainType.Grass
                            : terrain;

                    bool passable = zoned != TerrainType.Water && zoned != TerrainType.Rock;

                    row[x] = new Tile
                    {
                        X = x,
                        Y = y,
                        Elevation = zoned == TerrainType.Water ? -0.25 : RollElevation(x, y),
                        TerrainType = zoned,
                        Walkable = passable,
                        Buildable = passable,
                        Occupant = Occupant.None,
                        OccupantId = null,
                        ZoneId = zoneId,
                        Biome = BiomeAt(x, y, zoneId, rows, cols),

                        // Draw order matters: this is the SECOND draw for interior
                        // tiles and the FIRST for edge/coast tiles, because
                        // RollTerrain returns early for those. See RollTerrain.
                        Seed = (int)Math.Floor(rnd.Next() * 1e6),
                    };
                }

                Tiles[y] = row;
            }
        }

        /// <summary>Four concentric bands by Chebyshev chunk distance from centre.</summary>
        private static string ZoneAt(int x, int y, int rows, int cols)
        {
            int r = y / GridChunk, c = x / GridChunk;
            int cr = rows / 2, cc = cols / 2;
            int d = Math.Max(Math.Abs(r - cr), Math.Abs(c - cc));

            if (d == 0) return ZoneIds.TownCenter;
            if (d == 1) return ZoneIds.Settlement;
            if (d == 2) return ZoneIds.WildernessLvl1;
            return ZoneIds.WildernessLvl2;
        }

        /// <summary>
        /// Biome by chunk quadrant: north-east snows, south-west marshes, the rest
        /// deep woodland. The settled centre stays meadow.
        /// </summary>
        private static Biome BiomeAt(int x, int y, string zoneId, int rows, int cols)
        {
            if (zoneId == ZoneIds.TownCenter || zoneId == ZoneIds.Settlement) return Biome.Meadow;

            int r = y / GridChunk, c = x / GridChunk;
            int cr = rows / 2, cc = cols / 2;

            if (r < cr && c >= cc) return Biome.Snow;
            if (r >= cr && c < cc) return Biome.Swamp;
            return Biome.Forest;
        }

        private TerrainType RollTerrain(int x, int y, Mulberry32 rnd)
        {
            // A ring of deep water bounds the map.
            bool edge = x == 0 || y == 0 || x == Width - 1 || y == Height - 1;
            if (edge) return TerrainType.Water;                 // 0 draws consumed
            if (IsCoast(x, y, Width, Height)) return TerrainType.Sand; // 0 draws consumed

            // ---------------------------------------------------------------
            // LOAD-BEARING DEAD CODE. This draw is unused for terrain selection
            // — smooth patch noise replaced the old per-tile coin flip — but it
            // still ADVANCES THE STREAM. The tile's decoration Seed is read from
            // the next draw, so deleting this line would silently reshuffle the
            // decoration of every interior tile while leaving terrain identical.
            // Covered by the world-gen determinism test. Do not remove.
            // ---------------------------------------------------------------
            rnd.Next();

            if (x > 3 && y > 3 && x < Width - 4 && y < Height - 4)
            {
                // Blobby interior lakes from low-frequency noise.
                double n = Math.Sin(x * 0.9) + Math.Cos(y * 0.6) + Math.Sin((x + y) * 0.45);
                if (n > 2.15) return TerrainType.Water;
            }

            // Rock and dirt come from low-frequency noise, not a per-tile coin
            // flip. The original random scatter read as confetti sprinkled over
            // the grass; sampling smooth noise makes them clump into outcrops and
            // worn earth that follow the same contours as the lakes. Thresholds
            // preserve the original ~6% rock / ~14% dirt share of the map.
            double p = TerrainPatchNoise(x, y);
            if (p > 1.66) return TerrainType.Rock;
            if (p > 0.93) return TerrainType.Dirt;
            return TerrainType.Grass;
        }

        /// <summary>
        /// Smooth deterministic patch noise, so DIRT/ROCK form contiguous regions
        /// instead of isolated tiles.
        /// </summary>
        private static double TerrainPatchNoise(int x, int y)
        {
            return Math.Sin(x * 0.31) * Math.Cos(y * 0.27)
                 + Math.Sin((x + y) * 0.17) * 0.8
                 + Math.Cos((x - y) * 0.23) * 0.6;
        }

        /// <summary>
        /// Uses its OWN generator (seed offset 2401), one fresh instance per call,
        /// so it never perturbs the per-tile stream.
        /// </summary>
        private static bool IsCoast(int x, int y, int w, int h)
        {
            bool nearEdge = x <= 1 || y <= 1 || x >= w - 2 || y >= h - 2;
            if (!nearEdge) return false;   // matches JS && short-circuit
            var rnd = new Mulberry32(x * 31 + y * 57 + 2401);
            return rnd.Next() < 0.5;
        }

        /// <summary>Subtle large-scale rolling so the ground isn't dead flat.</summary>
        private static double RollElevation(int x, int y)
        {
            double v = 0.05
                     + Math.Sin(x * 0.55) * Math.Cos(y * 0.5) * 0.09
                     + Math.Sin((x + y) * 0.37) * 0.05;
            return Math.Max(0, Math.Min(0.22, v));
        }

        public Tile At(int x, int y)
        {
            if (x < 0 || y < 0 || x >= Width || y >= Height) return null;
            return Tiles[y][x];
        }

        /// <summary>Whether the tile's six-by-six exploration region is open.</summary>
        public bool IsRegionUnlocked(int x, int y)
        {
            if (x < 0 || y < 0 || x >= Width || y >= Height) return false;
            return RegionUnlocked[y / GridChunk][x / GridChunk];
        }

        /// <summary>
        /// Applies the authoritative occupant for an in-bounds tile. Systems use
        /// this rather than mutating fields independently so pathing always sees
        /// the same occupancy that a save/renderer describes.
        /// </summary>
        public bool SetOccupant(int x, int y, Occupant occupant, string occupantId)
        {
            Tile tile = At(x, y);
            if (tile == null) return false;
            tile.Occupant = occupant;
            tile.OccupantId = occupant == Occupant.None ? null : occupantId;
            return true;
        }

        /// <summary>
        /// Note that resource nodes block movement: the player paths to an
        /// adjacent tile and then harvests, which is what
        /// <c>allowAdjacentIfBlocked</c> in the pathfinder exists for.
        /// </summary>
        public bool IsWalkable(int x, int y)
        {
            Tile t = At(x, y);
            if (t == null) return false;
            if (!t.Walkable) return false;
            if (t.Occupant != Occupant.None) return false;
            return true;
        }
    }
}
