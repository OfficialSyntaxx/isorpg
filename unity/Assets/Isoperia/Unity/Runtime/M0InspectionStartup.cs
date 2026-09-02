using UnityEngine;
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
#if ISOPERIA_M0_INSPECTION
            // M0 proof players are built through M0InspectionBuild with this
            // define. This keeps the exclusion explicit and cannot affect a
            // normal player build.
            return true;
#elif UNITY_EDITOR
            return SceneManager.GetActiveScene().path == ScenePath;
#else
            return false;
#endif
        }

        public static bool IsInspectionScene(Scene scene)
        {
            return scene.path == ScenePath;
        }

#if ISOPERIA_M0_INSPECTION
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void LogInspectionPlayerState()
        {
            GameObject player = GameObject.Find("Inspection Player");
            GameObject camera = GameObject.Find("Inspection Camera");
            GameObject terrain = GameObject.Find("Shorelands Terrain");
            bool world = Object.FindAnyObjectByType<WorldRuntime>() != null;
            bool save = Object.FindAnyObjectByType<SaveDriver>() != null;
            bool motor = player != null && player.GetComponent<M0.M0InspectionMotor>() != null;
            bool controller = player != null && player.GetComponent<CharacterController>() != null;
            bool orbit = camera != null && camera.GetComponent<M0.M0InspectionCamera>() != null;
            bool collider = terrain != null && terrain.GetComponent<TerrainCollider>() != null;
            Debug.Log("M0_INSPECTION_PLAYER world=" + world + " save=" + save + " motor=" + motor + " controller=" + controller + " orbit=" + orbit + " collider=" + collider);
        }
#endif
    }
}
