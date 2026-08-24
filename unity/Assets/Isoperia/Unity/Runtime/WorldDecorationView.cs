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
        private const string OreVeinAsset = "Art/OwnedModels/ore_vein";
        private const float VisibleRadius = 28f;
        private const int RebuildDistance = 10;
        private const int MaxVisibleTrees = 32;
        private const int MaxVisibleOreVeins = 24;
        private const int MaxVisibleFishingSpots = 8;
        private readonly System.Collections.Generic.List<GameObject> instances =
            new System.Collections.Generic.List<GameObject>();
        private readonly System.Collections.Generic.List<WorldResourceNode> nearbyNodes =
            new System.Collections.Generic.List<WorldResourceNode>();
        private Material waterMarkerMaterial;
        private Material oreStoneMaterial;
        private Material copperMaterial;
        private Material tinMaterial;
        private Material ironMaterial;
        private Material coalMaterial;
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
                nearbyNodes.Clear();
                for (int i = 0; i < resources.Nodes.Count; i++)
                {
                    WorldResourceNode node = resources.Nodes[i];
                    if (node.Depleted) continue;
                    float dx = node.X - anchorX;
                    float dz = node.Y - anchorZ;
                    if (dx * dx + dz * dz > VisibleRadius * VisibleRadius) continue;
                    nearbyNodes.Add(node);
                }

                // Show the closest, distinct interactables first. The Core still
                // owns every node and direct tile interaction; this only keeps a
                // streamed 3D view from turning into a wall of duplicate props.
                nearbyNodes.Sort((left, right) =>
                {
                    float leftDistance = (left.X - anchorX) * (left.X - anchorX) + (left.Y - anchorZ) * (left.Y - anchorZ);
                    float rightDistance = (right.X - anchorX) * (right.X - anchorX) + (right.Y - anchorZ) * (right.Y - anchorZ);
                    return leftDistance.CompareTo(rightDistance);
                });
                int trees = 0;
                int oreVeins = 0;
                int fishingSpots = 0;
                for (int i = 0; i < nearbyNodes.Count; i++)
                {
                    WorldResourceNode node = nearbyNodes[i];
                    if (node.Type == "TREE" && trees >= MaxVisibleTrees) continue;
                    if (node.Type == "ROCK" && oreVeins >= MaxVisibleOreVeins) continue;
                    if (node.Type != "TREE" && node.Type != "ROCK" && fishingSpots >= MaxVisibleFishingSpots) continue;

                    Tile tile = grid.At(node.X, node.Y);
                    float ground = OpenWorldTerrainView.SurfaceHeight(tile, node.X + .5f, node.Y + .5f);
                    float offsetX = 0.3f + ((tile.Seed % 31) / 100f);
                    float offsetZ = 0.3f + (((tile.Seed / 31) % 31) / 100f);
                    var basePosition = new Vector3(tile.X + offsetX, ground, tile.Y + offsetZ);
                    float yaw = (tile.Seed % 8) * 45f;

                    if (node.Type == "TREE")
                    {
                        Place(tile.Seed % 3 == 0 ? "tree-high" : "tree", basePosition, 4.35f, yaw, node);
                        trees++;
                    }
                    else if (node.Type == "ROCK")
                    {
                        PlaceOreVein(basePosition, yaw, node);
                        oreVeins++;
                    }
                    else
                    {
                        CreateWaterMarker(basePosition, yaw, node);
                        fishingSpots++;
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

        private void PlaceOreVein(Vector3 position, float yaw, WorldResourceNode node)
        {
            GameObject prefab = Resources.Load<GameObject>(OreVeinAsset);
            if (prefab == null)
            {
                Place(node.X % 2 == 0 ? "rock-large" : "rock-small", position, 1.05f, yaw, node);
                return;
            }

            GameObject instance = Instantiate(prefab, position, Quaternion.Euler(0f, yaw, 0f), transform);
            instance.name = "Resource_OreVein_" + node.Def["masteryKey"].AsString("ore");
            OwnedModelPresentation.FitToHeight(instance, 1.28f);
            ApplyOrePalette(instance, node.Def["masteryKey"].AsString("copper"));
            instance.AddComponent<SphereCollider>().radius = .72f;
            instance.AddComponent<WorldInteractionTarget>().SetResource(node);
            instances.Add(instance);
        }

        private void ApplyOrePalette(GameObject oreVein, string type)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            if (oreStoneMaterial == null) oreStoneMaterial = new Material(shader) { color = new Color(.18f, .22f, .27f) };
            if (copperMaterial == null) copperMaterial = CreateMineralMaterial(shader, new Color(.76f, .28f, .07f));
            if (tinMaterial == null) tinMaterial = CreateMineralMaterial(shader, new Color(.53f, .72f, .79f));
            if (ironMaterial == null) ironMaterial = CreateMineralMaterial(shader, new Color(.45f, .49f, .55f));
            if (coalMaterial == null) coalMaterial = new Material(shader) { color = new Color(.06f, .07f, .09f) };
            Material mineral = type == "tin" ? tinMaterial : type == "iron" ? ironMaterial : type == "coal" ? coalMaterial : copperMaterial;

            foreach (Renderer renderer in oreVein.GetComponentsInChildren<Renderer>(true))
            {
                Material[] source = renderer.sharedMaterials;
                Material[] palette = new Material[source.Length];
                for (int i = 0; i < source.Length; i++)
                {
                    string name = source[i] == null ? string.Empty : source[i].name;
                    palette[i] = name.Contains("Mineral") ? mineral : oreStoneMaterial;
                }
                renderer.sharedMaterials = palette;
            }
        }

        private static Material CreateMineralMaterial(Shader shader, Color color)
        {
            var material = new Material(shader) { color = color };
            material.EnableKeyword("_EMISSION");
            material.SetColor("_EmissionColor", color * .20f);
            return material;
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
            if (oreStoneMaterial != null) Destroy(oreStoneMaterial);
            if (copperMaterial != null) Destroy(copperMaterial);
            if (tinMaterial != null) Destroy(tinMaterial);
            if (ironMaterial != null) Destroy(ironMaterial);
            if (coalMaterial != null) Destroy(coalMaterial);
            waterMarkerMaterial = null;
            oreStoneMaterial = null;
            copperMaterial = null;
            tinMaterial = null;
            ironMaterial = null;
            coalMaterial = null;
        }
    }
}
