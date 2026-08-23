using Isoperia.Core.World;
using UnityEngine;
using CoreGrid = Isoperia.Core.World.Grid;

namespace Isoperia.Unity
{
    /// <summary>
    /// Presentation for Core resource nodes. Gameplay still selects and depletes
    /// the registry nodes; this view turns them into the imported CC0 town-kit
    /// models so the playable world does not read as a field of debug cubes.
    /// </summary>
    [RequireComponent(typeof(MeshFilter))]
    [RequireComponent(typeof(MeshRenderer))]
    public sealed class WorldDecorationView : MonoBehaviour
    {
        private const string AssetRoot = "Art/KenneyFantasyTown/";
        private readonly System.Collections.Generic.List<GameObject> instances =
            new System.Collections.Generic.List<GameObject>();
        private Material waterMarkerMaterial;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void CreateDecorationView()
        {
            if (Object.FindAnyObjectByType<WorldDecorationView>() != null) return;

            var root = new GameObject(nameof(WorldDecorationView));
            root.AddComponent<WorldDecorationView>();
        }

        private void Start()
        {
            Rebuild();
            if (SaveDriver.Instance?.Resources != null)
                SaveDriver.Instance.Resources.NodeChanged += OnNodeChanged;
        }

        public void Rebuild()
        {
            DestroyRuntimeAssets();

            CoreGrid grid = WorldRuntime.Instance == null ? new CoreGrid() : WorldRuntime.Instance.Grid;
            WorldResourceRegistry resources = SaveDriver.Instance?.Resources;
            if (resources != null)
            {
                for (int i = 0; i < resources.Nodes.Count; i++)
                {
                    WorldResourceNode node = resources.Nodes[i];
                    if (node.Depleted) continue;

                    Tile tile = grid.At(node.X, node.Y);
                    float ground = tile.TerrainType == TerrainType.Water
                        ? 0.02f
                        : 0.04f + (float)tile.Elevation;
                    float offsetX = 0.3f + ((tile.Seed % 31) / 100f);
                    float offsetZ = 0.3f + (((tile.Seed / 31) % 31) / 100f);
                    var basePosition = new Vector3(tile.X + offsetX, ground, tile.Y + offsetZ);
                    float yaw = (tile.Seed % 8) * 45f;

                    if (node.Type == "TREE")
                    {
                        Place(tile.Seed % 3 == 0 ? "tree-high" : "tree", basePosition, .72f, yaw);
                    }
                    else if (node.Type == "ROCK")
                    {
                        Place(tile.Seed % 2 == 0 ? "rock-large" : "rock-small", basePosition, .75f, yaw);
                    }
                    else
                    {
                        CreateWaterMarker(basePosition, yaw);
                    }
                }
            }
        }

        private void Place(string assetName, Vector3 position, float scale, float yaw)
        {
            GameObject prefab = Resources.Load<GameObject>(AssetRoot + assetName);
            if (prefab == null) return;

            GameObject instance = Instantiate(prefab, position, Quaternion.Euler(0f, yaw, 0f), transform);
            instance.name = "Resource_" + assetName;
            instance.transform.localScale = Vector3.one * scale;
            instances.Add(instance);
        }

        private void CreateWaterMarker(Vector3 position, float yaw)
        {
            GameObject marker = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            marker.name = "Resource_FishingSpot";
            marker.transform.SetParent(transform, false);
            marker.transform.position = position + new Vector3(0f, .05f, 0f);
            marker.transform.rotation = Quaternion.Euler(0f, yaw, 0f);
            marker.transform.localScale = new Vector3(.26f, .04f, .26f);
            marker.GetComponent<Renderer>().sharedMaterial = WaterMarkerMaterial();
            Destroy(marker.GetComponent<Collider>());
            instances.Add(marker);
        }

        private Material WaterMarkerMaterial()
        {
            if (waterMarkerMaterial != null) return waterMarkerMaterial;
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            waterMarkerMaterial = new Material(shader) { color = new Color(.18f, .63f, .78f, 1f) };
            return waterMarkerMaterial;
        }

        private void OnDestroy()
        {
            if (SaveDriver.Instance?.Resources != null)
                SaveDriver.Instance.Resources.NodeChanged -= OnNodeChanged;
            DestroyRuntimeAssets();
        }

        private void OnNodeChanged(WorldResourceNode _)
        {
            Rebuild();
        }

        private void DestroyRuntimeAssets()
        {
            for (int i = 0; i < instances.Count; i++)
                if (instances[i] != null) Destroy(instances[i]);
            instances.Clear();
            if (waterMarkerMaterial != null) Destroy(waterMarkerMaterial);
            waterMarkerMaterial = null;
        }
    }
}
