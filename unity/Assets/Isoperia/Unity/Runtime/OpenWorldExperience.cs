using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>Bootstraps the perspective 3D prototype without rewriting the Bootstrap scene.</summary>
    [DefaultExecutionOrder(-900)]
    public sealed class OpenWorldExperience : MonoBehaviour
    {
        private int prototypeSuppressionFrames = 3;
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Create()
        {
            if (Object.FindAnyObjectByType<OpenWorldExperience>() != null) return;
            new GameObject(nameof(OpenWorldExperience)).AddComponent<OpenWorldExperience>();
        }

        private void Awake()
        {
            Camera camera = Camera.main;
            if (camera == null) return;
            var iso = camera.GetComponent<IsometricCamera>();
            if (iso != null) iso.enabled = false;
            var isoInput = camera.GetComponent<IsometricCameraInput>();
            if (isoInput != null) isoInput.enabled = false;
            WorldEnvironmentView tileTerrain = Object.FindAnyObjectByType<WorldEnvironmentView>();
            if (tileTerrain != null) tileTerrain.gameObject.SetActive(false);
            if (Object.FindAnyObjectByType<OpenWorldTerrainView>() == null)
                new GameObject(nameof(OpenWorldTerrainView)).AddComponent<OpenWorldTerrainView>();

            WorldPlayerController gridController = Object.FindAnyObjectByType<WorldPlayerController>();
            if (gridController != null) gridController.enabled = false;

            GameObject player = GameObject.Find(WorldPlayerAvatarView.AvatarName);
            if (player == null) player = WorldPlayerAvatarView.Create().gameObject;
            if (player.GetComponent<CharacterController>() == null) player.AddComponent<CharacterController>();
            if (player.GetComponent<OpenWorldPlayerController>() == null) player.AddComponent<OpenWorldPlayerController>();
            if (player.GetComponent<WorldMobileControlHint>() == null) player.AddComponent<WorldMobileControlHint>();
            if (player.GetComponent<WorldInteractionController>() == null) player.AddComponent<WorldInteractionController>();
            if (camera.GetComponent<OpenWorldCameraController>() == null) camera.gameObject.AddComponent<OpenWorldCameraController>();
            if (camera.GetComponent<AudioListener>() == null) camera.gameObject.AddComponent<AudioListener>();
            SuppressPrototypeViews();
        }

        private void LateUpdate()
        {
            // RuntimeInitialize callbacks have no ordering guarantee. Repeat the
            // suppression for the first frames so a legacy renderer created
            // after this bootstrap cannot add its retired test geometry beside
            // the authored open-world pass.
            if (prototypeSuppressionFrames-- > 0) SuppressPrototypeViews();
        }

        private static void SuppressPrototypeViews()
        {
            Disable<WorldBuildingView>();
            Disable<WorldBiomeLandmarkView>();
            Disable<WorldDecorationView>();
            Disable<WorldDungeonView>();
            Disable<WorldOwnedAssetLibraryView>();
            Disable<WorldCombatView>();
        }

        private static void Disable<T>() where T : Behaviour
        {
            foreach (T view in Object.FindObjectsByType<T>(FindObjectsSortMode.None))
                view.gameObject.SetActive(false);
        }
    }
}
