using System;
using System.Collections.Generic;
using Isoperia.Core.Content;
using Isoperia.Core.Save;
using Isoperia.Core.Sim;
using Isoperia.Core.Systems;
using Isoperia.Core.State;
using Isoperia.Core.World;

namespace Isoperia.Unity
{
    /// <summary>
    /// Session-owned, deterministic resource population for the Core grid. This
    /// is the Unity counterpart of the web WorldSystem resource registry: it
    /// owns mutable uses/depletion while the grid remains generated data.
    /// </summary>
    public sealed class WorldResourceRegistry
    {
        public const int RespawnTicks = 50;

        private readonly Grid grid;
        private readonly ContentDatabase content;
        private readonly GameState state;
        private readonly Func<long> nowMs;
        private readonly List<WorldResourceNode> nodes = new List<WorldResourceNode>();
        private readonly Dictionary<long, WorldResourceNode> byTile = new Dictionary<long, WorldResourceNode>();

        public event Action<WorldResourceNode> NodeChanged;
        public IReadOnlyList<WorldResourceNode> Nodes => nodes;

        public WorldResourceRegistry(Grid grid, GameState state, ContentDatabase content, Func<long> nowMs)
        {
            this.grid = grid ?? throw new ArgumentNullException(nameof(grid));
            this.state = state ?? throw new ArgumentNullException(nameof(state));
            this.content = content ?? throw new ArgumentNullException(nameof(content));
            this.nowMs = nowMs ?? throw new ArgumentNullException(nameof(nowMs));
            Populate();
        }

        public WorldResourceNode NodeAt(int x, int y)
        {
            byTile.TryGetValue(Key(x, y), out WorldResourceNode node);
            return node;
        }

        public int Consume(IResourceNode resource)
        {
            var node = resource as WorldResourceNode;
            if (node == null) throw new ArgumentException("Node does not belong to this world.", nameof(resource));
            if (!node.Depletes) return -1;

            node.Remaining = Math.Max(0, node.Remaining - 1);
            if (node.Remaining == 0)
            {
                node.Depleted = true;
                node.RespawnAt = nowMs() + RespawnTicks * (long)TickRunner.TickMs;
                state.ResourceNodes[node.Id] = new ResourceNodeState
                {
                    Remaining = node.Remaining,
                    RespawnAt = node.RespawnAt,
                };
            }

            if (!node.Depleted)
                state.ResourceNodes[node.Id] = new ResourceNodeState { Remaining = node.Remaining, RespawnAt = 0 };

            NodeChanged?.Invoke(node);
            return node.Remaining;
        }

        public void Tick(long _)
        {
            long now = nowMs();
            for (int i = 0; i < nodes.Count; i++)
            {
                WorldResourceNode node = nodes[i];
                if (!node.Depleted || now < node.RespawnAt) continue;

                node.Depleted = false;
                node.Remaining = node.MaxUses;
                node.RespawnAt = 0;
                state.ResourceNodes.Remove(node.Id);
                NodeChanged?.Invoke(node);
            }
        }

        private void Populate()
        {
            var trees = new List<Candidate>();
            var rocks = new List<Candidate>();
            var fish = new List<Candidate>();

            for (int y = 1; y < grid.Height - 1; y++)
            {
                for (int x = 1; x < grid.Width - 1; x++)
                {
                    Tile tile = grid.At(x, y);
                    if (tile.TerrainType == TerrainType.Water)
                    {
                        fish.Add(new Candidate(x, y, tile.Biome));
                        continue;
                    }

                    if (!tile.Walkable || tile.Occupant != Occupant.None) continue;
                    double roll = new Mulberry32(tile.Seed).Next();
                    bool canTree = tile.ZoneId != ZoneIds.TownCenter && tile.Biome != Biome.Snow;
                    double dense = tile.Biome == Biome.Forest ? 0.30 : 0.16;
                    if (canTree && roll < dense) trees.Add(new Candidate(x, y, tile.Biome));
                    else if ((tile.TerrainType == TerrainType.Dirt || tile.TerrainType == TerrainType.Grass) &&
                             roll < dense + (tile.Biome == Biome.Snow ? 0.50 : 0.14))
                        rocks.Add(new Candidate(x, y, tile.Biome));
                }
            }

            Shuffle(trees, 8311);
            Shuffle(rocks, 5279);
            Shuffle(fish, 6173);

            // Preserve the prototype's rough node density across the nine-times
            // larger mainland without allocating one node per tile.
            AddCandidates(trees, 765, "TREE");
            AddCandidates(rocks, 495, "ROCK");
            AddCandidates(fish, 126, "WATER");
        }

        private void AddCandidates(List<Candidate> candidates, int cap, string type)
        {
            int count = Math.Min(cap, candidates.Count);
            for (int i = 0; i < count; i++)
            {
                Candidate candidate = candidates[i];
                Tile tile = grid.At(candidate.X, candidate.Y);
                if (tile.Occupant != Occupant.None) continue;

                string id = type == "TREE"
                    ? PickTree(candidate)
                    : type == "ROCK" ? PickRock(candidate) : PickFish(candidate);
                JsonValue def = content.Resources[id];
                if (def.IsNull) throw new ContentException("Missing resource definition: " + id);

                var node = new WorldResourceNode(type, candidate.X, candidate.Y, def);
                Restore(node);
                nodes.Add(node);
                byTile[Key(candidate.X, candidate.Y)] = node;
                tile.Occupant = Occupant.ResourceNode;
                tile.OccupantId = node.Id;
            }
        }

        private void Restore(WorldResourceNode node)
        {
            if (!state.ResourceNodes.TryGetValue(node.Id, out ResourceNodeState saved)) return;
            if (!node.Depletes)
            {
                state.ResourceNodes.Remove(node.Id);
                return;
            }

            node.Remaining = Math.Max(0, Math.Min(node.MaxUses, saved.Remaining));
            node.RespawnAt = Math.Max(0, saved.RespawnAt);
            node.Depleted = node.Remaining == 0 && node.RespawnAt > nowMs();
            if (!node.Depleted && node.Remaining == 0)
            {
                node.Remaining = node.MaxUses;
                state.ResourceNodes.Remove(node.Id);
            }
        }

        private string PickTree(Candidate c)
        {
            int cx = grid.Width / 2, cy = grid.Height / 2;
            if (Math.Max(Math.Abs(c.X - cx), Math.Abs(c.Y - cy)) <= 5) return "tree_normal";
            if (c.Biome == Biome.Swamp) return new Mulberry32(c.X * 13 + c.Y * 17 + 41).Next() < 0.7 ? "tree_willow" : "tree_oak";

            double roll = new Mulberry32(c.X * 3 + c.Y * 3 + 1).Next();
            return roll < 0.55 ? "tree_normal" : roll < 0.80 ? "tree_oak" : "tree_willow";
        }

        private static string PickRock(Candidate c)
        {
            double roll = new Mulberry32(c.X * 5 + c.Y * 5 + 2).Next();
            if (c.Biome == Biome.Snow)
                return roll < 0.12 ? "rock_copper" : roll < 0.40 ? "rock_tin" : roll < 0.80 ? "rock_iron" : "rock_coal";
            return roll < 0.40 ? "rock_copper" : roll < 0.75 ? "rock_tin" : roll < 0.90 ? "rock_iron" : "rock_coal";
        }

        private static string PickFish(Candidate c) =>
            new Mulberry32(c.X * 7 + c.Y * 7 + 3).Next() < 0.5 ? "water_shrimp" : "water_trout";

        private static void Shuffle(List<Candidate> list, int seed)
        {
            var random = new Mulberry32(seed);
            for (int i = list.Count - 1; i > 0; i--)
            {
                int j = (int)Math.Floor(random.Next() * (i + 1));
                Candidate swap = list[i];
                list[i] = list[j];
                list[j] = swap;
            }
        }

        private static long Key(int x, int y) => ((long)x << 32) ^ (uint)y;

        private readonly struct Candidate
        {
            public readonly int X;
            public readonly int Y;
            public readonly Biome Biome;

            public Candidate(int x, int y, Biome biome)
            {
                X = x;
                Y = y;
                Biome = biome;
            }
        }
    }

    /// <summary>One resource node's mutable state; rules remain in Core SkillSystem.</summary>
    public sealed class WorldResourceNode : IResourceNode
    {
        public string Id { get; }
        public string Type { get; }
        public int X { get; }
        public int Y { get; }
        public JsonValue Def { get; }
        public int MaxUses { get; }
        public int Remaining { get; set; }
        public bool Depleted { get; set; }
        public long RespawnAt { get; set; }
        public bool Depletes => Def["depletes"].AsBool(false);

        public WorldResourceNode(string type, int x, int y, JsonValue def)
        {
            Type = type;
            X = x;
            Y = y;
            Def = def;
            Id = type + "_" + x + "_" + y;
            MaxUses = Depletes ? (int)def["maxUses"].AsNumber(5) : -1;
            Remaining = MaxUses;
        }
    }
}
