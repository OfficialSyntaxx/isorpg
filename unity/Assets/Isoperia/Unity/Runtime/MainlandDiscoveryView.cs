using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>
    /// Saves first visits to mainland districts. This is presentation-facing
    /// exploration state; Core player position remains the authoritative source.
    /// </summary>
    public sealed class MainlandDiscoveryView : MonoBehaviour
    {
        private Transform player;
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Create()
        {
            if (Object.FindAnyObjectByType<MainlandDiscoveryView>() == null)
                new GameObject(nameof(MainlandDiscoveryView)).AddComponent<MainlandDiscoveryView>();
        }

        private void Update()
        {
            if (player == null)
                player = GameObject.Find(WorldPlayerAvatarView.AvatarName)?.transform;
            if (player == null || SaveDriver.Instance?.State?.Player == null) return;
            string district = DistrictAt(Mathf.FloorToInt(player.position.x), Mathf.FloorToInt(player.position.z));
            if (SaveDriver.Instance.State.Player.MapDiscovered.Contains(district)) return;

            SaveDriver.Instance.State.Player.MapDiscovered.Add(district);
            SaveDriver.Instance.ShowStatus("Discovered · " + DisplayName(district));
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
