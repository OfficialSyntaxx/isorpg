using Isoperia.Core.World;
using UnityEngine;
using CoreGrid = Isoperia.Core.World.Grid;

namespace Isoperia.Unity
{
    /// <summary>
    /// Owns the deterministic surface world for Unity presentation systems.
    /// The grid is generated once and shared by terrain, input, and UI instead
    /// of each consumer constructing an indistinguishable private copy.
    /// </summary>
    [DefaultExecutionOrder(-750)]
    public sealed class WorldRuntime : MonoBehaviour
    {
        public static WorldRuntime Instance { get; private set; }

        public CoreGrid Grid { get; private set; }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void CreateRuntime()
        {
            if (Instance != null) return;

            var runtime = new GameObject(nameof(WorldRuntime));
            runtime.AddComponent<WorldRuntime>();
        }

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);
            Grid = new CoreGrid();
        }

        private void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }
    }
}
