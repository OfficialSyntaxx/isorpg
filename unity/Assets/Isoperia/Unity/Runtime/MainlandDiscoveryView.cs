using UnityEngine;
using System.Collections.Generic;

namespace Isoperia.Unity
{
    /// <summary>
    /// Saves first visits to mainland districts. This is presentation-facing
    /// exploration state; Core player position remains the authoritative source.
    /// </summary>
    public sealed class MainlandDiscoveryView : MonoBehaviour
    {
        private Transform player;
        private int lastExploredX = -1;
        private int lastExploredY = -1;
        private List<double> exploredOwner;
        private readonly HashSet<int> exploredIndices = new HashSet<int>();
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Create()
        {
            if (M0InspectionStartup.IsInspectionScene()) return;
            if (Object.FindAnyObjectByType<MainlandDiscoveryView>() == null)
                new GameObject(nameof(MainlandDiscoveryView)).AddComponent<MainlandDiscoveryView>();
        }

        private void Update()
        {
            if (player == null)
                player = GameObject.Find(WorldPlayerAvatarView.AvatarName)?.transform;
            if (player == null || SaveDriver.Instance?.State?.Player == null) return;
            int x = Mathf.FloorToInt(player.position.x);
            int y = Mathf.FloorToInt(player.position.z);
            RecordExploration(x, y);
            string district = DistrictAt(x, y);
            if (SaveDriver.Instance.State.Player.MapDiscovered.Contains(district)) return;

            SaveDriver.Instance.State.Player.MapDiscovered.Add(district);
            SaveDriver.Instance.ShowStatus("Discovered · " + DisplayName(district));
        }

        private void RecordExploration(int x, int y)
        {
            if (x == lastExploredX && y == lastExploredY) return;
            lastExploredX = x;
            lastExploredY = y;

            var state = SaveDriver.Instance.State.Player;
            int width = WorldRuntime.Instance?.Grid?.Width ?? 0;
            int height = WorldRuntime.Instance?.Grid?.Height ?? 0;
            if (width <= 0 || height <= 0) return;

            EnsureExplorationCache(state.MapExplored);

            RecordTile(state.MapExplored, width, height, x, y);
            RecordTile(state.MapExplored, width, height, x + 1, y);
            RecordTile(state.MapExplored, width, height, x - 1, y);
            RecordTile(state.MapExplored, width, height, x, y + 1);
            RecordTile(state.MapExplored, width, height, x, y - 1);
        }

        private void EnsureExplorationCache(List<double> explored)
        {
            if (ReferenceEquals(exploredOwner, explored)) return;
            exploredOwner = explored;
            exploredIndices.Clear();
            if (explored == null) return;
            for (int i = 0; i < explored.Count; i++) exploredIndices.Add((int)explored[i]);
        }

        private void RecordTile(List<double> explored, int width, int height, int x, int y)
        {
            if (x < 0 || y < 0 || x >= width || y >= height) return;
            int index = y * width + x;
            if (exploredIndices.Add(index)) explored.Add(index);
        }

        private static string DistrictAt(int x, int y)
        {
            if (x >= 78 && y >= 54 && y <= 75) return "ember_road";
            if (x >= 72 && y < 54) return "frostwatch";
            if (x < 54 && y < 54) return "wildwood";
            if (x < 54 && y >= 72) return "miregate";
            if (x >= 72 && y >= 72) return "sunmere";
            return "hearthvale";
        }

        private static string DisplayName(string id)
        {
            switch (id)
            {
                case "ember_road": return "Ember Road";
                case "frostwatch": return "Frostwatch Highlands";
                case "wildwood": return "Wildwood";
                case "miregate": return "Miregate Fen";
                case "sunmere": return "Sunmere Fields";
                default: return "Hearthvale";
            }
        }
    }
}
