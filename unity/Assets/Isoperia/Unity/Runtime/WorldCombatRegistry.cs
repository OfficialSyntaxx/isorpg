using System;
using System.Collections.Generic;
using Isoperia.Core.Combat;
using Isoperia.Core.Components;
using Isoperia.Core.Content;
using Isoperia.Core.Data;
using Isoperia.Core.Save;
using Isoperia.Core.Sim;
using Isoperia.Core.State;
using Isoperia.Core.World;
using UnityEngine;
using CoreGrid = Isoperia.Core.World.Grid;

namespace Isoperia.Unity
{
    /// <summary>
    /// Session combat authority for the small Bootstrap expedition. The combat
    /// formulas and player state are Core-owned; this registry owns only live
    /// world instances, their spawn positions, and their Unity-facing events.
    /// </summary>
    public sealed class WorldCombatRegistry
    {
        private readonly GameState state;
        private readonly IRandom random;
        private readonly List<WorldEnemyNode> enemies = new List<WorldEnemyNode>();
        private readonly Dictionary<long, WorldEnemyNode> byTile = new Dictionary<long, WorldEnemyNode>();
        private WorldEnemyNode target;
        private int playerCooldown;
        private int enemyCooldown;

        public event Action<WorldEnemyNode> EnemyChanged;
        public event Action<string> StatusChanged;
        public IReadOnlyList<WorldEnemyNode> Enemies => enemies;
        public WorldEnemyNode Target => target;

        public WorldCombatRegistry(CoreGrid grid, GameState state, ContentDatabase content, int seed)
        {
            this.state = state ?? throw new ArgumentNullException(nameof(state));
            if (content == null) throw new ArgumentNullException(nameof(content));
            random = new Mulberry32Random(seed);
            // A first mainland encounter pass: one approachable clearing on the
            // east road, then escalating clusters in each authored district.
            AddNear(grid, content, "giant_rat", 78, 65);
            AddNear(grid, content, "giant_rat", 35, 36);
            AddNear(grid, content, "goblin", 40, 31);
            AddNear(grid, content, "dire_wolf", 46, 42);
            AddNear(grid, content, "goblin", 92, 34);
            AddNear(grid, content, "dire_wolf", 101, 28);
            AddNear(grid, content, "giant_rat", 31, 91);
            AddNear(grid, content, "goblin", 38, 102);
            AddNear(grid, content, "dire_wolf", 103, 67);
            AddNear(grid, content, "goblin", 109, 73);
        }

        public WorldEnemyNode EnemyAt(int x, int y)
        {
            byTile.TryGetValue(Key(x, y), out WorldEnemyNode enemy);
            return enemy != null && enemy.Alive ? enemy : null;
        }

        public bool TryTarget(WorldEnemyNode enemy, PositionComponent playerPosition)
        {
            if (enemy == null || !enemy.Alive || playerPosition == null) return false;
            target = enemy;
            playerCooldown = 0;
            enemyCooldown = 0;
            StatusChanged?.Invoke("Targeted " + enemy.Name + " · move within 1 tile to attack");
            EnemyChanged?.Invoke(enemy);
            return true;
        }

        public void Tick(long _)
        {
            TickRespawns();
            if (target == null) return;
            if (!target.Alive) { target = null; return; }

            PositionComponent playerPosition = state.Player.Pos;
            int distance = Math.Max(Math.Abs(playerPosition.Gx - target.X), Math.Abs(playerPosition.Gy - target.Y));
            if (distance > 1)
            {
                StatusChanged?.Invoke("Targeted " + target.Name + " · move within 1 tile");
                return;
            }

            if (playerCooldown-- <= 0)
            {
                var weapon = new WeaponDef { Id = "starter_sword", Name = "Starter sword", MaxHit = 4, Accuracy = 8, Ticks = 2 };
                AttackResult hit = CombatMath.ResolvePlayerAttack(random, weapon, 1, 1,
                    new GearBonuses(), CombatRules.Style(CombatRules.StyleAccurate), CombatRules.NoBuff,
                    null, target.Definition.DefenseRoll, target.Hp, target.Definition.Hp);
                playerCooldown = weapon.Ticks - 1;
                if (hit.Hit)
                {
                    target.Hp = Math.Max(0, target.Hp - hit.Damage);
                    StatusChanged?.Invoke("Hit " + target.Name + " for " + hit.Damage);
                    EnemyChanged?.Invoke(target);
                    if (target.Hp == 0) DefeatTarget();
                }
                else StatusChanged?.Invoke("" + target.Name + " evaded your attack");
            }

            if (target == null) return;
            if (enemyCooldown-- > 0) return;
            AttackResult strike = CombatMath.ResolveMonsterAttack(random, target.Definition, false, 0);
            enemyCooldown = target.Definition.AttackTick - 1;
            if (!strike.Hit) return;

            HealthComponent health = state.Player.Health;
            health.Hp = Math.Max(0, health.Hp - strike.Damage);
            if (health.Hp > 0)
            {
                StatusChanged?.Invoke(target.Name + " hit you for " + strike.Damage + " · " + health.Hp + "/" + health.MaxHp + " HP");
                return;
            }

            health.Hp = health.MaxHp;
            state.Player.Pos.Gx = state.Player.Pos.Gy = CoreGrid.TownCenter;
            state.Player.Pos.Wx = state.Player.Pos.Gx;
            state.Player.Pos.Wz = state.Player.Pos.Gy;
            StatusChanged?.Invoke("You were defeated · returned safely to settlement");
            target = null;
        }

        private void DefeatTarget()
        {
            target.Alive = false;
            target.RespawnAtTick = 16;
            state.Player.Inventory.Add("coins", target.CoinDrop);
            state.Player.MetaKills.TryGetValue(target.Id, out double kills);
            state.Player.MetaKills[target.Id] = kills + 1;
            state.Player.Skills.AddXp(Skills.Attack, target.Xp);
            StatusChanged?.Invoke("Defeated " + target.Name + " · +" + target.CoinDrop + " coins · +" + target.Xp + " combat XP");
            EnemyChanged?.Invoke(target);
            target = null;

        }

        private void TickRespawns()
        {
            for (int i = 0; i < enemies.Count; i++)
            {
                WorldEnemyNode enemy = enemies[i];
                if (enemy.Alive || enemy.RespawnAtTick <= 0) continue;
                enemy.RespawnAtTick--;
                if (enemy.RespawnAtTick != 0) continue;
                enemy.Alive = true;
                enemy.Hp = enemy.Definition.Hp;
                EnemyChanged?.Invoke(enemy);
            }
        }

        private void AddNear(CoreGrid grid, ContentDatabase content, string id, int wantedX, int wantedY)
        {
            int x = wantedX;
            int y = wantedY;
            if (!FindWalkableTile(grid, wantedX, wantedY, out x, out y)) return;
            Tile tile = grid.At(x, y);
            if (tile == null || !tile.Walkable || tile.Occupant != Occupant.None) return;
            JsonValue data = content.Monsters[id];
            if (data.IsNull) throw new ContentException("Missing monster definition: " + id);
            var def = new MonsterDef
            {
                Id = id,
                Name = data["name"].AsString(id),
                Hp = (int)data["hp"].AsNumber(1),
                MaxHit = (int)data["maxHit"].AsNumber(1),
                AttackRoll = (int)data["attackRoll"].AsNumber(1),
                DefenseRoll = (int)data["defenseRoll"].AsNumber(1),
                AttackTick = Math.Max(1, (int)data["attackTick"].AsNumber(1)),
                AggroRange = (int)data["aggroRange"].AsNumber(0)
            };
            int coins = id == "giant_rat" ? 3 : id == "goblin" ? 7 : 8;
            int xp = Math.Max(1, (int)data["xp"]["attack"].AsNumber(4));
            var enemy = new WorldEnemyNode(id, def.Name, x, y, def, coins, xp);
            enemies.Add(enemy);
            byTile[Key(x, y)] = enemy;
        }

        private static bool FindWalkableTile(CoreGrid grid, int wantedX, int wantedY, out int x, out int y)
        {
            for (int radius = 0; radius <= 8; radius++)
            for (int dy = -radius; dy <= radius; dy++)
            for (int dx = -radius; dx <= radius; dx++)
            {
                if (Math.Max(Math.Abs(dx), Math.Abs(dy)) != radius) continue;
                Tile candidate = grid.At(wantedX + dx, wantedY + dy);
                if (candidate == null || !candidate.Walkable || candidate.Occupant != Occupant.None) continue;
                x = candidate.X;
                y = candidate.Y;
                return true;
            }

            x = y = 0;
            return false;
        }

        private static long Key(int x, int y) => ((long)x << 32) ^ (uint)y;
    }

    public sealed class WorldEnemyNode
    {
        public readonly string Id;
        public readonly string Name;
        public readonly int X;
        public readonly int Y;
        public readonly MonsterDef Definition;
        public readonly int CoinDrop;
        public readonly int Xp;
        public int Hp;
        public bool Alive = true;
        public int RespawnAtTick;

        public WorldEnemyNode(string id, string name, int x, int y, MonsterDef definition, int coinDrop, int xp)
        { Id = id; Name = name; X = x; Y = y; Definition = definition; CoinDrop = coinDrop; Xp = xp; Hp = definition.Hp; }
    }
}
