using System;
using System.Collections.Generic;
using Isoperia.Core.AI;
using Isoperia.Core.Sim;
using Isoperia.Core.World;

namespace Isoperia.Core.Systems
{
    /// <summary>Optional run mutators. None preserves the shipped baseline run.</summary>
    public enum DungeonModifier { None, Horde, Scarcity }

    /// <summary>One monster the dungeon asked for, at a tile.</summary>
    public sealed class DungeonSpawn
    {
        public string MonsterId;
        public int X;
        public int Y;
    }

    /// <summary>
    /// The dungeon. Port of the simulation half of
    /// <c>src/systems/DungeonSystem.ts</c>; the meshes, portal rings and floor
    /// lighting stay on the Unity side.
    ///
    /// THE LAYOUT IS FIXED, NOT GENERATED. Five hand-placed rooms joined by
    /// carved corridors, identical on every run and every floor. That is
    /// deliberate: the Caves quest routes the player key -> door -> brute, and a
    /// procedural layout would have to guarantee that ordering anyway. What
    /// changes between floors is the monster pool and the chest, not the map.
    ///
    /// Spawning is handled by returning WHAT to spawn rather than by calling a
    /// combat system. The TypeScript reaches into CombatSystem to add and remove
    /// monsters; keeping that out means the dungeon can be tested without one,
    /// and the caller decides how a monster becomes an actor.
    /// </summary>
    public sealed class DungeonSystem : IGridLike
    {
        public const int W = 17;
        public const int H = 20;

        public const char Floor = '.';
        public const char Wall = '#';

        public const int MaxFloor = 3;

        private readonly char[,] _tiles = new char[H, W];

        public (int X, int Y) Entrance { get; private set; }
        public (int X, int Y) Spawn { get; private set; }
        public (int X, int Y) Chest { get; private set; }
        public (int X, int Y) Exit { get; private set; }
        public (int X, int Y) Door { get; private set; }
        public (int X, int Y) Key { get; private set; }
        public (int X, int Y) Brute { get; private set; }

        /// <summary>The retreat tile on deeper floors that leads back up.</summary>
        public (int X, int Y) Upstairs { get; private set; } = (2, 2);

        public bool KeyTaken { get; private set; }
        public bool DoorOpened { get; private set; }
        public bool OpenedChest { get; set; }
        public bool Active { get; private set; }
        public int CurrentFloor { get; private set; } = 1;

        public DungeonModifier Modifier { get; set; } = DungeonModifier.None;

        public int Width => W;
        public int Height => H;

        public DungeonSystem(IGridLike surface, int worldSize)
        {
            FindEntrance(surface, worldSize);
            Generate();
        }

        /// <summary>
        /// The surface tile the stairs sit on: the far corner of the world,
        /// searched inward, so the dungeon is a journey rather than next door.
        /// Falls back to any walkable tile, then to a fixed offset.
        /// </summary>
        private void FindEntrance(IGridLike surface, int s)
        {
            for (int gy = s - 2; gy >= 2; gy--)
                for (int gx = s - 2; gx >= 2; gx--)
                    if (gx >= s - 12 && gy >= s - 12 && surface.IsWalkable(gx, gy)) { Entrance = (gx, gy); return; }

            for (int gy = s - 2; gy >= 2; gy--)
                for (int gx = s - 2; gx >= 2; gx--)
                    if (surface.IsWalkable(gx, gy)) { Entrance = (gx, gy); return; }

            Entrance = (s - 8, s - 8);
        }

        private struct Rect
        {
            public int X, Y, W, H;
            public Rect(int x, int y, int w, int h) { X = x; Y = y; W = w; H = h; }
            public (int X, int Y) Centre => (X + W / 2, Y + H / 2);
        }

        private void Generate()
        {
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++) _tiles[y, x] = Wall;

            var rooms = new[]
            {
                new Rect(2, 2, 5, 4),
                new Rect(10, 2, 4, 5),
                new Rect(3, 12, 5, 4),
                new Rect(10, 10, 5, 5),
                new Rect(5, 17, 4, 3),   // exit: isolated corner, a single seam
            };

            foreach (Rect r in rooms)
                for (int y = r.Y; y < r.Y + r.H; y++)
                    for (int x = r.X; x < r.X + r.W; x++) _tiles[y, x] = Floor;

            // Corridors: horizontal from the previous room's centre, then
            // vertical. The order matters — it decides which side of the elbow
            // the seam lands on, and the door search below depends on it.
            for (int i = 1; i < rooms.Length; i++)
            {
                (int X, int Y) a = rooms[i - 1].Centre;
                (int X, int Y) b = rooms[i].Centre;

                CarveH(a.X > b.X ? -1 : 1, a.X, b.X, a.Y);
                CarveV(a.Y > b.Y ? -1 : 1, a.Y, b.Y, b.X);
            }

            Spawn = rooms[0].Centre;
            Chest = rooms[2].Centre;
            Exit = rooms[rooms.Length - 1].Centre;
            Key = rooms[3].Centre;

            // The door is the corridor tile just outside the exit room, nearest
            // the room before it — the single seam that makes the exit sealable.
            Rect exr = rooms[rooms.Length - 1];
            (int X, int Y) pc = rooms[rooms.Length - 2].Centre;

            (int X, int Y)? bestDoor = null;
            int bestD = int.MaxValue;

            for (int y = exr.Y - 1; y <= exr.Y + exr.H; y++)
            {
                for (int x = exr.X - 1; x <= exr.X + exr.W; x++)
                {
                    if (InsideAnyRoom(rooms, x, y)) continue;
                    if (y < 0 || y >= H || x < 0 || x >= W) continue;
                    if (_tiles[y, x] != Floor) continue;

                    int d = Math.Abs(x - pc.X) + Math.Abs(y - pc.Y);
                    if (d >= bestD) continue;

                    bestD = d;
                    bestDoor = (x, y);
                }
            }

            Door = bestDoor ?? Exit;
            _tiles[Door.Y, Door.X] = Wall;             // sealed until the key turns

            Brute = (Door.X, Math.Min(Door.Y + 1, H - 2));

            // Everything the quest needs to reach must be standable.
            _tiles[Brute.Y, Brute.X] = Floor;
            _tiles[Key.Y, Key.X] = Floor;
            _tiles[Spawn.Y, Spawn.X] = Floor;
            _tiles[Chest.Y, Chest.X] = Floor;
            _tiles[Exit.Y, Exit.X] = Floor;
        }

        private static bool InsideAnyRoom(Rect[] rooms, int x, int y)
        {
            foreach (Rect r in rooms)
                if (x >= r.X && x < r.X + r.W && y >= r.Y && y < r.Y + r.H) return true;
            return false;
        }

        private void CarveH(int dir, int ax, int bx, int y)
        {
            if (y < 0 || y >= H) return;
            for (int x = ax; x != bx + dir; x += dir)
                if (x >= 0 && x < W && _tiles[y, x] == Wall) _tiles[y, x] = Floor;
        }

        private void CarveV(int dir, int ay, int by, int x)
        {
            if (x < 0 || x >= W) return;
            for (int y = ay; y != by + dir; y += dir)
                if (y >= 0 && y < H && _tiles[y, x] == Wall) _tiles[y, x] = Floor;
        }

        // -- IGridLike, so A* can path inside the dungeon --------------------

        public bool IsWalkable(int x, int y) =>
            x >= 0 && y >= 0 && x < W && y < H && _tiles[y, x] == Floor;

        public bool IsRegionUnlocked(int x, int y) => true;

        public char TileAt(int x, int y) =>
            x >= 0 && y >= 0 && x < W && y < H ? _tiles[y, x] : Wall;

        // -- the run ---------------------------------------------------------

        /// <summary>Enter at floor 1. Returns the monsters to spawn.</summary>
        public List<DungeonSpawn> Enter()
        {
            Active = true;
            CurrentFloor = 1;
            ResetStory();

            var spawns = new List<DungeonSpawn> { new DungeonSpawn { MonsterId = "cave_brute", X = Brute.X, Y = Brute.Y } };
            spawns.AddRange(PoolFor(1));
            return spawns;
        }

        /// <summary>
        /// Descend. The story gates RESET on every floor — a new floor is a new
        /// sealed door and a new key, not a continuation.
        /// </summary>
        public List<DungeonSpawn> Descend()
        {
            if (CurrentFloor >= MaxFloor) return new List<DungeonSpawn>();

            CurrentFloor += 1;
            ResetStory();
            return PoolFor(CurrentFloor);
        }

        /// <summary>Climb back. Floor 1 gets its brute again.</summary>
        public List<DungeonSpawn> Ascend()
        {
            if (CurrentFloor <= 1) return new List<DungeonSpawn>();

            CurrentFloor -= 1;
            ResetStory();

            var spawns = new List<DungeonSpawn>();
            if (CurrentFloor == 1)
                spawns.Add(new DungeonSpawn { MonsterId = "cave_brute", X = Brute.X, Y = Brute.Y });

            spawns.AddRange(PoolFor(CurrentFloor));
            return spawns;
        }

        public void Leave() => Active = false;

        private void ResetStory()
        {
            OpenedChest = false;
            KeyTaken = false;
            DoorOpened = false;
            _tiles[Door.Y, Door.X] = Wall;
        }

        /// <summary>The Iron Key turns: the sealed door becomes floor.</summary>
        public void Unlock()
        {
            DoorOpened = true;
            _tiles[Door.Y, Door.X] = Floor;
        }

        public void TakeKey() => KeyTaken = true;

        // -- monster pools ----------------------------------------------------

        /// <summary>
        /// Where the pool may stand: floor tiles at least six tiles from the
        /// player's arrival, and never on a landmark.
        ///
        /// The six-tile gap is what stops a run opening with a monster already
        /// in melee before the player has moved.
        /// </summary>
        private List<(int X, int Y)> SpawnSpots()
        {
            var spots = new List<(int X, int Y)>();

            for (int y = 1; y < H - 1; y++)
            {
                for (int x = 1; x < W - 1; x++)
                {
                    if (_tiles[y, x] != Floor) continue;
                    if (Math.Abs(x - Spawn.X) + Math.Abs(y - Spawn.Y) < 6) continue;

                    if ((x == Chest.X && y == Chest.Y) ||
                        (x == Exit.X && y == Exit.Y) ||
                        (x == Door.X && y == Door.Y) ||
                        (x == Key.X && y == Key.Y) ||
                        (x == Brute.X && y == Brute.Y)) continue;

                    spots.Add((x, y));
                }
            }

            return spots;
        }

        /// <summary>One row of a floor's monster pool: what, and how many.</summary>
        private struct MonsterRow
        {
            public readonly string Id;
            public readonly int Count;

            public MonsterRow(string id, int count) { Id = id; Count = count; }
        }

        /// <summary>
        /// The pool for a floor.
        ///
        /// Placement is DETERMINISTIC, not random: the nth monster goes to spot
        /// <c>(n * 7919) % spots.Count</c>. 7919 is prime, so it strides the list
        /// instead of clustering. Every run of a floor is laid out identically,
        /// which is what makes the dungeon learnable — and it is why this needs
        /// no IRandom at all.
        /// </summary>
        public List<DungeonSpawn> PoolFor(int floor)
        {
            // MonsterRow rather than a (string, int) tuple: mcs rejects a ternary
            // over named-tuple arrays with a CS0029 that names the same type on
            // both sides. A named struct sidesteps the compiler bug entirely.
            MonsterRow[] layout =
                floor <= 1 ? new[] { new MonsterRow("cave_bat", 4), new MonsterRow("cave_slasher", 2) }
              : floor == 2 ? new[] { new MonsterRow("cave_slasher", 6), new MonsterRow("cave_brute", 2) }
              :              new[] { new MonsterRow("cave_slasher", 8), new MonsterRow("cave_brute", 3) };

            List<(int X, int Y)> spots = SpawnSpots();
            var spawns = new List<DungeonSpawn>();
            if (spots.Count == 0) return spawns;

            double multiplier = Modifier == DungeonModifier.Horde ? 1.5 : 1;
            int n = 1;

            foreach (MonsterRow row in layout)
            {
                int want = (int)Math.Ceiling(row.Count * multiplier);

                for (int i = 0; i < want; i++)
                {
                    (int X, int Y) s = spots[(int)((long)n * 7919 % spots.Count)];
                    n++;

                    spawns.Add(new DungeonSpawn { MonsterId = row.Id, X = s.X, Y = s.Y });
                }
            }

            return spawns;
        }

        // -- the chest ---------------------------------------------------------

        /// <summary>
        /// Chest contents for the current floor.
        ///
        /// DRAW ORDER: one draw per stack in table order, then the iron sword
        /// check, then — ONLY IF THE SWORD MISSED — the shortbow check. The
        /// shortbow roll is skipped entirely when the sword drops, so the two are
        /// mutually exclusive and the second draw does not always happen.
        /// </summary>
        public List<KeyValuePair<string, int>> ChestLoot(IRandom rng)
        {
            bool f2 = CurrentFloor == 2;
            bool f3 = CurrentFloor >= 3;

            var drops = new List<KeyValuePair<string, int>>();

            if (f3)
            {
                drops.Add(Pair("coins", 90 + Roll(rng, 61)));
                drops.Add(Pair("iron_ore", 5 + Roll(rng, 5)));
                drops.Add(Pair("coal", 4 + Roll(rng, 4)));
                drops.Add(Pair("cooked_trout", 3 + Roll(rng, 3)));
            }
            else if (f2)
            {
                drops.Add(Pair("coins", 40 + Roll(rng, 51)));
                drops.Add(Pair("iron_ore", 3 + Roll(rng, 4)));
                drops.Add(Pair("coal", 2 + Roll(rng, 3)));
                drops.Add(Pair("cooked_trout", 2 + Roll(rng, 2)));
            }
            else
            {
                drops.Add(Pair("coins", 15 + Roll(rng, 26)));
                drops.Add(Pair("iron_ore", 2 + Roll(rng, 3)));
                drops.Add(Pair("cooked_trout", 1 + Roll(rng, 2)));
            }

            if (rng.Next() < (f3 ? 0.35 : f2 ? 0.25 : 0.12))
            {
                drops.Add(Pair("iron_sword", 1));
            }
            else if (rng.Next() < (f3 ? 0.2 : f2 ? 0.15 : 0.08))
            {
                drops.Add(Pair("shortbow", 1));
            }

            if (Modifier != DungeonModifier.Scarcity) return drops;

            // Scarcity trades reward for a cleaner challenge. Floored at 1 so a
            // stack never vanishes entirely — an empty chest reads as a bug.
            var reduced = new List<KeyValuePair<string, int>>();
            foreach (KeyValuePair<string, int> d in drops)
                reduced.Add(new KeyValuePair<string, int>(d.Key, Math.Max(1, (int)Math.Floor(d.Value * 0.6))));

            return reduced;
        }

        private static KeyValuePair<string, int> Pair(string id, int qty) =>
            new KeyValuePair<string, int>(id, qty);

        private static int Roll(IRandom rng, int span) => (int)Math.Floor(rng.Next() * span);
    }
}
