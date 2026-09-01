using System;
using System.Collections.Generic;

namespace Isoperia.Unity
{
    /// <summary>Pure selection rules shared by the resource view and its tests.</summary>
    public static class WorldResourceSelection
    {
        public const int Radius = 28;
        public const int MaxTrees = 32;
        public const int MaxRocks = 24;
        public const int MaxFishingSpots = 8;

        public static void Select(IReadOnlyList<WorldResourceNode> nodes, int x, int y,
            List<WorldResourceNode> result)
        {
            result.Clear();
            for (int i = 0; i < nodes.Count; i++)
            {
                WorldResourceNode node = nodes[i];
                if (node.Depleted || Distance(node, x, y) > Radius * Radius) continue;
                if (node.Type != "TREE" && node.Type != "ROCK" && node.Type != "WATER") continue;
                result.Add(node);
            }
            result.Sort((left, right) =>
            {
                int order = Distance(left, x, y).CompareTo(Distance(right, x, y));
                return order != 0 ? order : string.Compare(left.Id, right.Id, StringComparison.Ordinal);
            });
            int trees = 0, rocks = 0, water = 0, retained = 0;
            for (int i = 0; i < result.Count; i++)
            {
                WorldResourceNode node = result[i];
                if (node.Type == "TREE") { if (trees++ >= MaxTrees) continue; }
                else if (node.Type == "ROCK") { if (rocks++ >= MaxRocks) continue; }
                else { if (water++ >= MaxFishingSpots) continue; }
                result[retained++] = node;
            }
            result.RemoveRange(retained, result.Count - retained);
        }

        private static int Distance(WorldResourceNode node, int x, int y)
        {
            int dx = node.X - x, dy = node.Y - y;
            return dx * dx + dy * dy;
        }
    }
}
