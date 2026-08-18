// Standalone harness: dumps the generated world so it can be diffed against the
// TypeScript original. Compiled with plain mcs, NOT Unity — which is only
// possible because Isoperia.Core has noEngineReferences.
using System;
using System.Text;
using Isoperia.Core.World;
using Isoperia.Core.AI;

public static class DumpWorld
{
    private static char TerrainChar(TerrainType t)
    {
        switch (t)
        {
            case TerrainType.Grass: return 'G';
            case TerrainType.Water: return 'W';
            case TerrainType.Rock:  return 'R';
            case TerrainType.Dirt:  return 'D';
            case TerrainType.Sand:  return 'S';
            case TerrainType.Road:  return 'O';
            default: return '?';
        }
    }

    private static char BiomeChar(Biome b)
    {
        switch (b)
        {
            case Biome.Meadow: return 'M';
            case Biome.Forest: return 'F';
            case Biome.Snow:   return 'N';
            case Biome.Swamp:  return 'P';
            default: return '?';
        }
    }

    public static void Main()
    {
        var grid = new Grid();
        var sb = new StringBuilder();

        sb.Append("SIZE ").Append(grid.Width).Append('x').Append(grid.Height).Append('\n');

        sb.Append("TERRAIN\n");
        for (int y = 0; y < grid.Height; y++)
        {
            for (int x = 0; x < grid.Width; x++) sb.Append(TerrainChar(grid.At(x, y).TerrainType));
            sb.Append('\n');
        }

        sb.Append("BIOME\n");
        for (int y = 0; y < grid.Height; y++)
        {
            for (int x = 0; x < grid.Width; x++) sb.Append(BiomeChar(grid.At(x, y).Biome));
            sb.Append('\n');
        }

        sb.Append("ZONE\n");
        for (int y = 0; y < grid.Height; y++)
            for (int x = 0; x < grid.Width; x++)
                sb.Append(grid.At(x, y).ZoneId).Append('\n');

        // The decoration seed is the value most sensitive to PRNG draw ordering.
        sb.Append("SEED\n");
        for (int y = 0; y < grid.Height; y++)
            for (int x = 0; x < grid.Width; x++)
                sb.Append(grid.At(x, y).Seed).Append('\n');

        // Elevation to 12 decimals: enough to catch a real divergence, loose
        // enough not to trip on the last-bit noise of printing a double.
        sb.Append("ELEVATION\n");
        for (int y = 0; y < grid.Height; y++)
            for (int x = 0; x < grid.Width; x++)
                sb.Append(grid.At(x, y).Elevation.ToString("F12",
                    System.Globalization.CultureInfo.InvariantCulture)).Append('\n');

        sb.Append("WALKABLE\n");
        for (int y = 0; y < grid.Height; y++)
        {
            for (int x = 0; x < grid.Width; x++) sb.Append(grid.At(x, y).Walkable ? '1' : '0');
            sb.Append('\n');
        }

        // ------------------------------------------------------------------
        // Pathfinding. Run against the SAME generated grid, with a deterministic
        // scatter of blocking occupants so the dynamic-obstacle path is covered
        // too. Exact path equality (not just equal length) is the assertion,
        // because equal-cost paths that differ would mean the two builds disagree
        // about how a character walks.
        // ------------------------------------------------------------------
        for (int y = 0; y < grid.Height; y++)
            for (int x = 0; x < grid.Width; x++)
                if ((x * 7 + y * 13) % 23 == 0 && grid.At(x, y).Walkable)
                    grid.At(x, y).Occupant = Occupant.ResourceNode;

        sb.Append("PATHS\n");
        int[][] cases =
        {
            //  sx, sy, gx, gy, allowAdjacentIfBlocked
            new[] { 10, 10, 20, 20, 0 },
            new[] { 10, 10, 20, 20, 1 },
            new[] {  8,  8, 33, 33, 0 },
            new[] { 33, 33,  8,  8, 0 },
            new[] { 10, 10, 10, 11, 0 },
            new[] { 10, 10,  0,  0, 0 },   // goal is bounding water: unreachable
            new[] { 10, 10,  0,  0, 1 },   // ...unless we accept an adjacent tile
            new[] { 20, 20, 21, 21, 1 },
            new[] {  5, 20, 36, 21, 0 },
            new[] { 20,  5, 21, 36, 1 },
        };

        foreach (var c in cases)
        {
            var path = AStar.FindPath(grid, c[0], c[1], c[2], c[3], c[4] == 1);
            sb.Append(c[0]).Append(',').Append(c[1]).Append("->")
              .Append(c[2]).Append(',').Append(c[3]).Append(' ').Append(c[4]).Append(": ");

            if (path == null)
            {
                sb.Append("null");
            }
            else
            {
                // Cost, endpoints and length -- not the tile sequence. Among
                // equal-cost routes A* may pick either; see AStar's remarks.
                double cost = 0;
                int px = c[0], py = c[1];
                foreach (var s in path)
                {
                    cost += (s.X != px && s.Y != py) ? Math.Sqrt(2.0) : 1.0;
                    px = s.X; py = s.Y;
                }
                var last = path[path.Count - 1];
                sb.Append("steps=").Append(path.Count)
                  .Append(" end=").Append(last.X).Append(',').Append(last.Y)
                  .Append(" cost=").Append(cost.ToString("F9",
                      System.Globalization.CultureInfo.InvariantCulture));
            }
            sb.Append('\n');
        }

        Console.Out.Write(sb.ToString());
    }
}
