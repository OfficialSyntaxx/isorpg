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

        // BeforeSceneLoad has no loaded runtime scene to query. The M0 proof is
        // editor-only authoring validation, so use the editor's selected scene
        // during that phase rather than deferring normal runtime construction.
        public static bool IsInspectionPlayModeStart()
        {
#if UNITY_EDITOR
            return UnityEditor.SceneManagement.EditorSceneManager.GetActiveScene().path == ScenePath;
#else
            return false;
#endif
        }

        public static bool IsInspectionScene(Scene scene)
        {
            return scene.path == ScenePath;
        }
    }
}
