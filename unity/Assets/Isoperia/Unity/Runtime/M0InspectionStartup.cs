using UnityEngine.SceneManagement;

namespace Isoperia.Unity
{
    /// <summary>Identifies the self-contained M0 proof scene before legacy presentation auto-starts run.</summary>
    public static class M0InspectionStartup
    {
        public const string ScenePath = "Assets/Isoperia/Scenes/ShorelandsM0.unity";

        public static bool IsInspectionScene()
        {
            return SceneManager.GetActiveScene().path == ScenePath;
        }

        public static bool IsInspectionScene(Scene scene)
        {
            return scene.path == ScenePath;
        }
    }
}
