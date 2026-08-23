using System;
using Isoperia.Core.Components;
using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>Links a visible 3D world object to the authoritative Core interaction record.</summary>
    public sealed class WorldInteractionTarget : MonoBehaviour
    {
        public static event Action<WorldInteractionTarget> InteractionStarted;

        private WorldResourceNode resource;
        private WorldEnemyNode enemy;
        private string npcName;
        private string npcHint;

        public void SetResource(WorldResourceNode node) => resource = node;
        public void SetEnemy(WorldEnemyNode node) => enemy = node;
        public void SetNpc(string name, string hint) { npcName = name; npcHint = hint; }

        public bool IsResource => resource != null;
        public bool IsEnemy => enemy != null;
        public bool IsNpc => !string.IsNullOrEmpty(npcName);

        public bool TryInteract(PositionComponent player)
        {
            if (player == null) return false;
            if (resource != null && !resource.Depleted)
            {
                if (!InRange(player, resource.X, resource.Y)) return false;
                SaveDriver.Instance?.Gathering?.Interrupt();
                SaveDriver.Instance?.Gathering?.StartGathering(resource);
                InteractionStarted?.Invoke(this);
                return true;
            }

            if (enemy != null && enemy.Alive)
            {
                if (!InRange(player, enemy.X, enemy.Y)) return false;
                SaveDriver.Instance?.Gathering?.Interrupt();
                SaveDriver.Instance?.Combat?.TryTarget(enemy, player);
                InteractionStarted?.Invoke(this);
                return true;
            }

            if (!string.IsNullOrEmpty(npcName))
            {
                SaveDriver.Instance?.ShowStatus(npcName + " · " + npcHint);
                InteractionStarted?.Invoke(this);
                return true;
            }

            return false;
        }

        private static bool InRange(PositionComponent player, int x, int y)
        {
            return Mathf.Max(Mathf.Abs(player.Gx - x), Mathf.Abs(player.Gy - y)) <= 2;
        }
    }
}
