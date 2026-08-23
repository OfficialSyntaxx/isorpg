using UnityEngine;
using CoreGrid = Isoperia.Core.World.Grid;

namespace Isoperia.Unity
{
    /// <summary>Travel-scale silhouettes that make the deterministic biome quadrants readable in 3D.</summary>
    public sealed class WorldBiomeLandmarkView : MonoBehaviour
    {
        private const string AssetRoot = "Art/KenneyFantasyTown/";
        private Material snow;
        private readonly System.Collections.Generic.List<GameObject> instances = new System.Collections.Generic.List<GameObject>();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Create()
        {
            if (Object.FindAnyObjectByType<WorldBiomeLandmarkView>() == null)
                new GameObject(nameof(WorldBiomeLandmarkView)).AddComponent<WorldBiomeLandmarkView>();
        }

        private void Start()
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            snow = new Material(shader) { color = new Color(.68f, .78f, .82f) };
            BuildFrostwatch();
            BuildMiregate();
            BuildWildwood();
        }

        private void BuildFrostwatch()
        {
            Vector3 origin = Grounded(32, 8);
            Place("rock-large", "BiomeLandmark_Frostwatch_Crag", origin, new Vector3(2.15f, 2.7f, 1.75f), 14f);
            Place("rock-small", "BiomeLandmark_Frostwatch_StoneA", origin + new Vector3(-1.8f, 0f, .9f), Vector3.one * 1.15f, -28f);
            Place("rock-small", "BiomeLandmark_Frostwatch_StoneB", origin + new Vector3(1.6f, 0f, -.7f), Vector3.one * 1.05f, 42f);
            CreateSnowBeacon(origin + new Vector3(0f, 3.2f, 0f));
        }

        private void BuildMiregate()
        {
            Vector3 origin = Grounded(8, 33);
            Place("watermill", "BiomeLandmark_Miregate_Mill", origin, new Vector3(1.25f, 1.25f, 1.25f), 90f);
            Place("fence", "BiomeLandmark_Miregate_FenceA", origin + new Vector3(-2.0f, 0f, 1.5f), Vector3.one * 1.3f, 35f);
            Place("fence", "BiomeLandmark_Miregate_FenceB", origin + new Vector3(1.8f, 0f, 1.3f), Vector3.one * 1.3f, -38f);
            Place("rock-large", "BiomeLandmark_Miregate_Rock", origin + new Vector3(1.5f, 0f, -1.7f), Vector3.one * 1.05f, 12f);
        }

        private void BuildWildwood()
        {
            Vector3 origin = Grounded(8, 10);
            Place("tree-high", "BiomeLandmark_Wildwood_Ancient", origin, Vector3.one * 2.3f, 8f);
            Place("tree", "BiomeLandmark_Wildwood_TreeA", origin + new Vector3(-1.9f, 0f, 1.1f), Vector3.one * 1.45f, -25f);
            Place("tree", "BiomeLandmark_Wildwood_TreeB", origin + new Vector3(1.7f, 0f, .9f), Vector3.one * 1.35f, 32f);
            Place("rock-small", "BiomeLandmark_Wildwood_RootStone", origin + new Vector3(.5f, 0f, -1.7f), Vector3.one * 1.15f, -16f);
        }

        private Vector3 Grounded(int x, int z)
        {
            CoreGrid grid = WorldRuntime.Instance == null ? new CoreGrid() : WorldRuntime.Instance.Grid;
            var tile = grid.At(x, z);
            float ground = tile == null ? .04f : .04f + (float)tile.Elevation;
            return new Vector3(x + .5f, ground, z + .5f);
        }

        private void Place(string assetName, string instanceName, Vector3 position, Vector3 scale, float yaw)
        {
            GameObject prefab = Resources.Load<GameObject>(AssetRoot + assetName);
            if (prefab == null)
            {
                Debug.LogWarning("[Isoperia] Missing landmark asset: " + assetName);
                return;
            }

            GameObject instance = Instantiate(prefab, position, Quaternion.Euler(0f, yaw, 0f), transform);
            instance.name = instanceName;
            instance.transform.localScale = scale;
            instances.Add(instance);
        }

        private void CreateSnowBeacon(Vector3 position)
        {
            GameObject beacon = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            beacon.name = "BiomeLandmark_Frostwatch_Beacon";
            beacon.transform.SetParent(transform, false);
            beacon.transform.position = position;
            beacon.transform.localScale = new Vector3(.42f, .3f, .42f);
            beacon.GetComponent<Renderer>().sharedMaterial = snow;
            Destroy(beacon.GetComponent<Collider>());
            instances.Add(beacon);
        }

        private void OnDestroy()
        {
            if (snow != null) Destroy(snow);
            for (int i = 0; i < instances.Count; i++)
            {
                if (instances[i] != null) Destroy(instances[i]);
            }
        }
    }
}
