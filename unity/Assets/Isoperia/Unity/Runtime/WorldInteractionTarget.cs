using Isoperia.Core.Components;
using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>Links a visible 3D world object to the authoritative Core interaction record.</summary>
    public sealed class WorldInteractionTarget : MonoBehaviour
    {
        private WorldResourceNode resource;
        private WorldEnemyNode enemy;
        private string npcName;
        private string npcHint;

        public void SetResource(WorldResourceNode node) => resource = node;
        public void SetEnemy(WorldEnemyNode node) => enemy = node;
        public void SetNpc(string name, string hint) { npcName = name; npcHint = hint; }

        public bool TryInteract(PositionComponent player)
        {
            if (player == null) return false;
            if (resource != null && !resource.Depleted)
            {
                if (!InRange(player, resource.X, resource.Y)) return false;
                SaveDriver.Instance?.Gathering?.Interrupt();
                SaveDriver.Instance?.Gathering?.StartGathering(resource);
                return true;
            }

            if (enemy != null && enemy.Alive)
            {
                if (!InRange(player, enemy.X, enemy.Y)) return false;
                SaveDriver.Instance?.Gathering?.Interrupt();
                SaveDriver.Instance?.Combat?.TryTarget(enemy, player);
                return true;
            }

            if (!string.IsNullOrEmpty(npcName))
            {
                SaveDriver.Instance?.ShowStatus(npcName + " · " + npcHint);
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
