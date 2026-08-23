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
        private const float VisibleRadius = 28f;
        private const int RebuildDistance = 10;
        private readonly System.Collections.Generic.List<GameObject> instances =
            new System.Collections.Generic.List<GameObject>();
        private Material waterMarkerMaterial;
        private Transform player;
        private int lastAnchorX = int.MinValue;
        private int lastAnchorZ = int.MinValue;

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

        private void Update()
        {
            if (player == null)
                player = GameObject.Find(WorldPlayerAvatarView.AvatarName)?.transform;
            if (player == null) return;

            int x = Mathf.FloorToInt(player.position.x);
            int z = Mathf.FloorToInt(player.position.z);
            if (Mathf.Abs(x - lastAnchorX) < RebuildDistance && Mathf.Abs(z - lastAnchorZ) < RebuildDistance) return;
            Rebuild();
        }

        public void Rebuild()
        {
            DestroyRuntimeAssets();

            CoreGrid grid = WorldRuntime.Instance == null ? new CoreGrid() : WorldRuntime.Instance.Grid;
            WorldResourceRegistry resources = SaveDriver.Instance?.Resources;
            if (player == null)
                player = GameObject.Find(WorldPlayerAvatarView.AvatarName)?.transform;
            int anchorX = player == null ? grid.Width / 2 : Mathf.FloorToInt(player.position.x);
            int anchorZ = player == null ? grid.Height / 2 : Mathf.FloorToInt(player.position.z);
            lastAnchorX = anchorX;
            lastAnchorZ = anchorZ;
            if (resources != null)
            {
                for (int i = 0; i < resources.Nodes.Count; i++)
                {
                    WorldResourceNode node = resources.Nodes[i];
                    if (node.Depleted) continue;
                    float dx = node.X - anchorX;
                    float dz = node.Y - anchorZ;
                    if (dx * dx + dz * dz > VisibleRadius * VisibleRadius) continue;

                    Tile tile = grid.At(node.X, node.Y);
                    float ground = OpenWorldTerrainView.SurfaceHeight(tile, node.X + .5f, node.Y + .5f);
                    float offsetX = 0.3f + ((tile.Seed % 31) / 100f);
                    float offsetZ = 0.3f + (((tile.Seed / 31) % 31) / 100f);
                    var basePosition = new Vector3(tile.X + offsetX, ground, tile.Y + offsetZ);
                    float yaw = (tile.Seed % 8) * 45f;

                    if (node.Type == "TREE")
                    {
                        Place(tile.Seed % 3 == 0 ? "tree-high" : "tree", basePosition, 4.35f, yaw, node);
                    }
                    else if (node.Type == "ROCK")
                    {
                        Place(tile.Seed % 2 == 0 ? "rock-large" : "rock-small", basePosition, 1.05f, yaw, node);
                    }
                    else
                    {
                        CreateWaterMarker(basePosition, yaw, node);
                    }
                }
            }
        }

        private void Place(string assetName, Vector3 position, float targetHeight, float yaw, WorldResourceNode node)
        {
            GameObject prefab = Resources.Load<GameObject>(AssetRoot + assetName);
            if (prefab == null) return;

            GameObject instance = Instantiate(prefab, position, Quaternion.Euler(0f, yaw, 0f), transform);
            instance.name = "Resource_" + assetName;
            // Community assets use different authoring units. Normalize every
            // streamed prop by bounds so a tree cannot fill the entire camera.
            OwnedModelPresentation.FitToHeight(instance, targetHeight);
            instance.AddComponent<SphereCollider>().radius = .7f;
            instance.AddComponent<WorldInteractionTarget>().SetResource(node);
            instances.Add(instance);
        }

        private void CreateWaterMarker(Vector3 position, float yaw, WorldResourceNode node)
        {
            GameObject marker = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            marker.name = "Resource_FishingSpot";
            marker.transform.SetParent(transform, false);
            marker.transform.position = position + new Vector3(0f, .05f, 0f);
            marker.transform.rotation = Quaternion.Euler(0f, yaw, 0f);
            marker.transform.localScale = new Vector3(.26f, .04f, .26f);
            marker.GetComponent<Renderer>().sharedMaterial = WaterMarkerMaterial();
            marker.AddComponent<WorldInteractionTarget>().SetResource(node);
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
