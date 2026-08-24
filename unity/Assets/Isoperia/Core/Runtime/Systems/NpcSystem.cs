using System;
using System.Collections.Generic;
using Isoperia.Core.AI;
using Isoperia.Core.Content;
using Isoperia.Core.Save;
using Isoperia.Core.Sim;
using Isoperia.Core.State;
using Isoperia.Core.World;

namespace Isoperia.Core.Systems
{
    /// <summary>What a villager is currently doing.</summary>
    public enum NpcTask { Wander, ToFire, AtFire, ToBuilding, Inspecting }

    /// <summary>One villager or critter. Presentation holds no state of its own.</summary>
    public sealed class NpcEntity
    {
        public string Id;
        public string Name;
        public string Kind;              // "villager" | "critter"
        public int HomeX;
        public int HomeY;
        public int Radius;

        public int X;
        public int Y;

        public bool HasTarget;
        public int TargetX;
        public int TargetY;

        public int StepAcc;
        public int IdleAcc;

        public NpcTask Task = NpcTask.Wander;
        public int TaskAcc;

        public List<PathStep> Path;
        public int PathIndex;

        public string BuildingType;

        /// <summary>Type most recently inspected, and the tick it stops being topical.</summary>
        public string LastInspectType;
        public int LastInspectUntil;

        /// <summary>Round-robin index into the NPC's own idle lines.</summary>
        public int TalkIndex;

        public bool IsVillager => Kind == "villager";
    }

    /// <summary>
    /// Villagers and critters. Port of the simulation half of
    /// <c>src/systems/NpcSystem.ts</c>; the meshes, the idle bob and the rigged
    /// actor loading stay on the Unity side.
    ///
    /// Everything here runs on the 600 ms tick, never on frame time, so a
    /// villager walks at the same speed whatever the frame rate — the same rule
    /// the rest of the simulation follows.
    /// </summary>
    public sealed class NpcSystem
    {
        /// <summary>One tile every three ticks, roughly 1.8 s.</summary>
        public const int TicksPerStep = 3;

        public const int IdleBeforeNewTarget = 4;
        public const int FireEvery = 45;
        public const int AtFireTicks = 16;
        public const int VisitEvery = 75;
        public const int InspectTicks = 8;

        /// <summary>How long a placement stays worth commenting on, in ticks.</summary>
        public const int InspectTopicalTicks = 40;

        private readonly Grid _grid;
        private readonly ContentDatabase _content;
        private readonly IRandom _rng;
        private readonly Func<List<TownBuilding>> _buildings;

        public readonly List<NpcEntity> Entities = new List<NpcEntity>();

        private int _tickCount;

        /// <summary>Counters the tests use to prove the schedules actually fire.</summary>
        public int FireVisits { get; private set; }
        public int StorageVisits { get; private set; }

        public NpcSystem(Grid grid, ContentDatabase content, IRandom rng,
                         Func<List<TownBuilding>> buildings = null)
        {
            _grid = grid ?? throw new ArgumentNullException(nameof(grid));
            _content = content ?? throw new ArgumentNullException(nameof(content));
            _rng = rng ?? throw new ArgumentNullException(nameof(rng));
            _buildings = buildings ?? (() => new List<TownBuilding>());

            Spawn(_content.Table("npcs", "VILLAGERS"), "villager");
            Spawn(_content.Table("npcs", "CRITTERS"), "critter");
        }

        /// <summary>
        /// VILLAGERS and CRITTERS are ARRAYS of definitions, not maps keyed by
        /// id — unlike RESOURCES, SEEDS or BUILDINGS, which are maps. Assuming
        /// the wrong shape here spawns nobody at all, silently: Members on an
        /// array yields nothing, so the village would simply be empty.
        ///
        /// Array order is also the roster order, and it is stable across
        /// machines by construction — which matters because it decides who is
        /// "nearest" when two villagers are equidistant from a new building.
        /// </summary>
        private void Spawn(JsonValue table, string kind)
        {
            if (table.Kind != JsonKind.Array)
            {
                throw new ContentException(
                    $"npcs.{kind} table is {table.Kind}, expected Array. Nobody would spawn.");
            }

            for (int i = 0; i < table.Count; i++)
            {
                JsonValue def = table[i];
                JsonValue home = def["home"];

                int hx = (int)home["x"].AsNumber(0);
                int hy = (int)home["y"].AsNumber(0);

                (int X, int Y) start = FindStart(hx, hy);

                Entities.Add(new NpcEntity
                {
                    Id = def["id"].AsString("npc" + i),
                    Name = def["name"].AsString("npc" + i),
                    Kind = def["kind"].AsString(kind),
                    HomeX = hx, HomeY = hy,
                    Radius = (int)def["radius"].AsNumber(3),
                    X = start.X, Y = start.Y,
                });
            }
        }

        /// <summary>Nearest standable tile to a home, searched outward.</summary>
        private (int X, int Y) FindStart(int hx, int hy)
        {
            if (_grid.IsWalkable(hx, hy)) return (hx, hy);

            for (int r = 1; r <= 4; r++)
                for (int dy = -r; dy <= r; dy++)
                    for (int dx = -r; dx <= r; dx++)
                        if (_grid.IsWalkable(hx + dx, hy + dy)) return (hx + dx, hy + dy);

            return (hx, hy);
        }

        private List<TownBuilding> Buildings() => _buildings() ?? new List<TownBuilding>();

        private List<TownBuilding> BuildingsOf(params string[] types)
        {
            var found = new List<TownBuilding>();
            foreach (TownBuilding b in Buildings())
                foreach (string t in types)
                    if (b.Type == t) { found.Add(b); break; }
            return found;
        }

        // -- the tick --------------------------------------------------------

        /// <summary>One 600 ms tick of village life.</summary>
        public void Tick()
        {
            _tickCount++;

            foreach (NpcEntity e in Entities)
            {
                if (!e.IsVillager) { WanderTick(e); continue; }

                switch (e.Task)
                {
                    case NpcTask.Wander:
                        e.TaskAcc++;

                        // The campfire trip is offered BEFORE the storage trip,
                        // and both are modulo checks against the same counter, so
                        // on a tick divisible by both the fire wins. Reordering
                        // these silently changes where villagers spend their day.
                        if (e.TaskAcc % FireEvery == 0)
                        {
                            TownBuilding fire = PickNearest(e, BuildingsOf("CAMPFIRE"));
                            if (fire != null && StartTask(e, fire)) break;
                        }

                        if (e.TaskAcc % VisitEvery == 0)
                        {
                            TownBuilding store = PickNearest(e, BuildingsOf("STORAGE_BIN", "STOREHOUSE"));
                            if (store != null && StartTask(e, store)) break;
                        }

                        WanderTick(e);
                        break;

                    case NpcTask.ToFire:
                    case NpcTask.ToBuilding:
                        if (FollowPath(e))
                        {
                            if (e.Task == NpcTask.ToFire) { e.Task = NpcTask.AtFire; FireVisits++; }
                            else { e.Task = NpcTask.Inspecting; StorageVisits++; }
                            e.TaskAcc = 0;
                        }
                        break;

                    case NpcTask.AtFire:
                    case NpcTask.Inspecting:
                        e.TaskAcc++;

                        int stay = e.Task == NpcTask.AtFire ? AtFireTicks : InspectTicks;

                        // One draw per tick spent waiting, matching the
                        // TypeScript: the threshold is re-rolled every tick
                        // rather than once on arrival, so the stay is a
                        // distribution, not a fixed span.
                        if (e.TaskAcc >= stay + (int)Math.Floor(_rng.Next() * 10))
                        {
                            e.Task = NpcTask.Wander;
                            e.TaskAcc = 0;
                            e.Path = null;
                            e.BuildingType = null;
                        }
                        break;
                }
            }
        }

        // -- wandering -------------------------------------------------------

        private void WanderTick(NpcEntity e)
        {
            if (!e.HasTarget)
            {
                e.IdleAcc++;
                if (e.IdleAcc < IdleBeforeNewTarget) return;

                e.IdleAcc = 0;
                PickTarget(e);
                return;
            }

            e.StepAcc++;
            if (e.StepAcc < TicksPerStep) return;
            e.StepAcc = 0;

            if (!StepToward(e)) { e.HasTarget = false; return; }

            if (e.X == e.TargetX && e.Y == e.TargetY)
            {
                e.HasTarget = false;
                e.IdleAcc = 0;
            }
        }

        /// <summary>
        /// Choose somewhere to wander to, within the NPC's radius of home.
        ///
        /// TWO DRAWS PER ATTEMPT, up to twelve attempts, and a rejected attempt
        /// still consumed both. A target closer than two tiles is rejected so
        /// villagers do not shuffle on the spot.
        /// </summary>
        private void PickTarget(NpcEntity e)
        {
            for (int tries = 0; tries < 12; tries++)
            {
                int dx = (int)Math.Floor(_rng.Next() * (e.Radius * 2 + 1)) - e.Radius;
                int dy = (int)Math.Floor(_rng.Next() * (e.Radius * 2 + 1)) - e.Radius;

                int x = e.HomeX + dx;
                int y = e.HomeY + dy;

                if (!_grid.IsWalkable(x, y)) continue;
                if (Math.Abs(x - e.X) + Math.Abs(y - e.Y) < 2) continue;

                e.TargetX = x;
                e.TargetY = y;
                e.HasTarget = true;
                return;
            }
        }

        /// <summary>
        /// One greedy step toward the target: diagonal first, then each axis,
        /// then any direction at all. No pathfinding — wandering is allowed to
        /// get stuck against a wall and give up, which is what makes it look
        /// like idling rather than commuting.
        /// </summary>
        private bool StepToward(NpcEntity e)
        {
            int sx = Math.Sign(e.TargetX - e.X);
            int sy = Math.Sign(e.TargetY - e.Y);

            var dirs = new (int X, int Y)[]
            {
                (sx, sy), (sx, 0), (0, sy),
                (1, 0), (-1, 0), (0, 1), (0, -1),
            };

            foreach ((int X, int Y) d in dirs)
            {
                int nx = e.X + d.X;
                int ny = e.Y + d.Y;

                if (nx == e.X && ny == e.Y) continue;
                if (nx < 1 || ny < 1 || nx >= _grid.Width - 1 || ny >= _grid.Height - 1) continue;
                if (!_grid.IsWalkable(nx, ny)) continue;

                e.X = nx;
                e.Y = ny;
                return true;
            }

            return false;
        }

        // -- errands ----------------------------------------------------------

        private TownBuilding PickNearest(NpcEntity e, List<TownBuilding> list)
        {
            TownBuilding best = null;
            int bestD = int.MaxValue;

            foreach (TownBuilding b in list)
            {
                if (!NearestWalkableAdjacent(b.X, b.Y).HasValue) continue;

                int d = Math.Max(Math.Abs(b.X - e.X), Math.Abs(b.Y - e.Y));
                if (d >= bestD) continue;

                bestD = d;
                best = b;
            }

            return best;
        }

        private bool StartTask(NpcEntity e, TownBuilding b)
        {
            (int X, int Y)? adj = NearestWalkableAdjacent(b.X, b.Y);
            if (!adj.HasValue) return false;

            List<PathStep> path = AStar.FindPath(_grid, e.X, e.Y, adj.Value.X, adj.Value.Y);
            if (path == null) return false;

            e.Path = path;
            e.PathIndex = 0;
            e.StepAcc = 0;
            e.Task = b.Type == "CAMPFIRE" ? NpcTask.ToFire : NpcTask.ToBuilding;
            e.BuildingType = b.Type;
            e.TargetX = adj.Value.X;
            e.TargetY = adj.Value.Y;
            e.HasTarget = true;

            return true;
        }

        /// <summary>Walk the path. True when the destination is reached or lost.</summary>
        private bool FollowPath(NpcEntity e)
        {
            if (e.Path == null || e.Path.Count == 0) return true;

            e.StepAcc++;
            if (e.StepAcc < TicksPerStep) return false;
            e.StepAcc = 0;

            if (e.PathIndex >= e.Path.Count) return true;

            PathStep step = e.Path[e.PathIndex];

            // The world can change under a walking villager — a building placed
            // across the route. Abandon rather than walking through it.
            if (!_grid.IsWalkable(step.X, step.Y)) { e.Path = null; return true; }

            e.X = step.X;
            e.Y = step.Y;
            e.PathIndex++;

            return e.PathIndex >= e.Path.Count;
        }

        private (int X, int Y)? NearestWalkableAdjacent(int x, int y)
        {
            var dirs = new (int X, int Y)[] { (1, 0), (-1, 0), (0, 1), (0, -1) };

            foreach ((int X, int Y) d in dirs)
                if (_grid.IsWalkable(x + d.X, y + d.Y)) return (x + d.X, y + d.Y);

            if (_grid.IsWalkable(x, y)) return (x, y);
            return null;
        }

        // -- talking ----------------------------------------------------------

        /// <summary>
        /// A villager reacts to a newly placed building: the NEAREST one comments
        /// and walks over to inspect it. Returns the line, or empty.
        /// </summary>
        public string OnBuildingPlaced(string type, int x, int y)
        {
            NpcEntity nearest = null;
            int best = int.MaxValue;

            foreach (NpcEntity e in Entities)
            {
                if (!e.IsVillager) continue;

                int d = Math.Abs(e.X - x) + Math.Abs(e.Y - y);
                if (d >= best) continue;

                best = d;
                nearest = e;
            }

            if (nearest == null) return "";

            JsonValue onPlaced = DefOf(nearest)["lines"]["onPlaced"];
            JsonValue lines = onPlaced[type];
            if (lines.IsNull || lines.Count == 0) lines = onPlaced["default"];
            if (lines.IsNull || lines.Count == 0) return "";

            string line = Pick(lines);

            nearest.LastInspectType = type;
            nearest.LastInspectUntil = _tickCount + InspectTopicalTicks;

            (int X, int Y)? adj = NearestWalkableAdjacent(x, y);
            if (adj.HasValue)
            {
                List<PathStep> path = AStar.FindPath(_grid, nearest.X, nearest.Y, adj.Value.X, adj.Value.Y);
                if (path != null)
                {
                    nearest.Path = path;
                    nearest.PathIndex = 0;
                    nearest.Task = NpcTask.ToBuilding;
                    nearest.BuildingType = type;
                    nearest.StepAcc = 0;
                }
            }

            return $"{nearest.Name}: {line}";
        }

        /// <summary>
        /// What this NPC says when tapped.
        ///
        /// PRIORITY ORDER, and it is deliberate: standing by a campfire beats
        /// standing by storage, which beats a recent placement, which beats a
        /// generic town line, which beats the NPC's own idle list. The specific
        /// remark always wins over the generic one, so a villager next to a fire
        /// never says something that ignores the fire.
        /// </summary>
        public string Talk(NpcEntity e)
        {
            JsonValue def = DefOf(e);

            if (!e.IsVillager) return NextIdleLine(e, def);

            JsonValue lines = def["lines"];
            string near = NearbyBuildingType(e, 3);

            if (near == "CAMPFIRE" && lines["nearCampfire"].Count > 0) return Pick(lines["nearCampfire"]);

            if ((near == "STORAGE_BIN" || near == "STOREHOUSE") && lines["nearStorage"].Count > 0)
                return Pick(lines["nearStorage"]);

            if (e.LastInspectType != null && _tickCount < e.LastInspectUntil)
            {
                JsonValue placed = lines["onPlaced"][e.LastInspectType];
                if (!placed.IsNull && placed.Count > 0) return Pick(placed);
            }

            if (Buildings().Count > 0 && lines["town"].Count > 0) return Pick(lines["town"]);

            return NextIdleLine(e, def);
        }

        /// <summary>Idle lines cycle in order — no draw, so they never repeat twice running.</summary>
        private static string NextIdleLine(NpcEntity e, JsonValue def)
        {
            JsonValue talk = def["talk"];
            if (talk.IsNull || talk.Count == 0) return "";

            string line = talk[e.TalkIndex % talk.Count].AsString("");
            e.TalkIndex++;
            return line;
        }

        private string NearbyBuildingType(NpcEntity e, int dist)
        {
            foreach (TownBuilding b in Buildings())
                if (Math.Max(Math.Abs(b.X - e.X), Math.Abs(b.Y - e.Y)) <= dist) return b.Type;
            return null;
        }

        /// <summary>Find a definition by id in either array.</summary>
        private JsonValue DefOf(NpcEntity e)
        {
            foreach (string table in new[] { "VILLAGERS", "CRITTERS" })
            {
                JsonValue list = _content.Table("npcs", table);
                for (int i = 0; i < list.Count; i++)
                    if (list[i]["id"].AsString(null) == e.Id) return list[i];
            }

            throw new ContentException($"npc \"{e.Id}\" spawned but has no definition.");
        }

        private string Pick(JsonValue arr) =>
            arr[(int)Math.Floor(_rng.Next() * arr.Count)].AsString("");
    }
}
