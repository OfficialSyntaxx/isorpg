using UnityEngine;
using CoreGrid = Isoperia.Core.World.Grid;

namespace Isoperia.Unity
{
    /// <summary>Travel-scale silhouettes that make the deterministic biome quadrants readable in 3D.</summary>
    public sealed class WorldBiomeLandmarkView : MonoBehaviour
    {
        private const string AssetRoot = "Art/KenneyFantasyTown/";
        private const string WayfinderAsset = "Art/OwnedModels/wayfinder_sign";
        private const string WildwoodShrineAsset = "Art/OwnedModels/wildwood_shrine";
        private const string FrostwatchMineAsset = "Art/OwnedModels/frostwatch_mine";
        private Material snow;
        private readonly System.Collections.Generic.List<Material> runtimeMaterials = new System.Collections.Generic.List<Material>();
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
            BuildSunmere();
            BuildEmberRoad();
        }

        private void BuildFrostwatch()
        {
            Vector3 origin = Grounded(96, 28);
            PlaceFrostwatchMine(origin);
            Place("rock-small", "BiomeLandmark_Frostwatch_StoneA", origin + new Vector3(-1.8f, 0f, .9f), Vector3.one * 1.15f, -28f);
            Place("rock-small", "BiomeLandmark_Frostwatch_StoneB", origin + new Vector3(1.6f, 0f, -.7f), Vector3.one * 1.05f, 42f);
            CreateSnowBeacon(origin + new Vector3(0f, 3.2f, 0f));
        }

        private void PlaceFrostwatchMine(Vector3 position)
        {
            GameObject prefab = Resources.Load<GameObject>(FrostwatchMineAsset);
            if (prefab == null)
            {
                Place("rock-large", "BiomeLandmark_Frostwatch_Crag", position, new Vector3(2.15f, 2.7f, 1.75f), 14f);
                return;
            }
            GameObject instance = Instantiate(prefab, position, Quaternion.identity, transform);
            instance.name = "BiomeLandmark_FrostwatchMine";
            ApplyOwnedPalette(instance, "Mine", new Color(.23f, .28f, .33f), new Color(.19f, .09f, .03f), new Color(.92f, .62f, .16f));
            instances.Add(instance);
        }

        private void ApplyOwnedPalette(GameObject root, string prefix, Color stone, Color wood, Color glow)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            foreach (Renderer renderer in root.GetComponentsInChildren<Renderer>(true))
            {
                Material[] source = renderer.sharedMaterials;
                Material[] palette = new Material[source.Length];
                for (int i = 0; i < source.Length; i++)
                {
                    string name = source[i] == null ? string.Empty : source[i].name;
                    Color color = name.Contains("Timber") ? wood : name.Contains("Lantern") ? glow : stone;
                    Material material = new Material(shader) { color = color };
                    if (name.Contains("Lantern")) { material.EnableKeyword("_EMISSION"); material.SetColor("_EmissionColor", color * 1.5f); }
                    runtimeMaterials.Add(material);
                    palette[i] = material;
                }
                renderer.sharedMaterials = palette;
            }
        }

        private void BuildMiregate()
        {
            Vector3 origin = Grounded(28, 98);
            Place("watermill", "BiomeLandmark_Miregate_Mill", origin, new Vector3(1.25f, 1.25f, 1.25f), 90f);
            Place("fence", "BiomeLandmark_Miregate_FenceA", origin + new Vector3(-2.0f, 0f, 1.5f), Vector3.one * 1.3f, 35f);
            Place("fence", "BiomeLandmark_Miregate_FenceB", origin + new Vector3(1.8f, 0f, 1.3f), Vector3.one * 1.3f, -38f);
            Place("rock-large", "BiomeLandmark_Miregate_Rock", origin + new Vector3(1.5f, 0f, -1.7f), Vector3.one * 1.05f, 12f);
        }

        private void BuildWildwood()
        {
            Vector3 origin = Grounded(28, 32);
            PlaceWildwoodShrine(origin);
            Place("tree", "BiomeLandmark_Wildwood_TreeA", origin + new Vector3(-1.9f, 0f, 1.1f), Vector3.one * 1.45f, -25f);
            Place("tree", "BiomeLandmark_Wildwood_TreeB", origin + new Vector3(1.7f, 0f, .9f), Vector3.one * 1.35f, 32f);
            Place("rock-small", "BiomeLandmark_Wildwood_RootStone", origin + new Vector3(.5f, 0f, -1.7f), Vector3.one * 1.15f, -16f);
        }

        private void PlaceWildwoodShrine(Vector3 position)
        {
            GameObject prefab = Resources.Load<GameObject>(WildwoodShrineAsset);
            if (prefab == null)
            {
                Place("tree-high", "BiomeLandmark_Wildwood_Ancient", position, Vector3.one * 2.3f, 8f);
                return;
            }

            GameObject instance = Instantiate(prefab, position, Quaternion.identity, transform);
            instance.name = "BiomeLandmark_WildwoodShrine";
            ApplyWildwoodShrinePalette(instance);
            instances.Add(instance);
        }

        private void ApplyWildwoodShrinePalette(GameObject shrine)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            foreach (Renderer renderer in shrine.GetComponentsInChildren<Renderer>(true))
            {
                Material[] source = renderer.sharedMaterials;
                Material[] palette = new Material[source.Length];
                for (int i = 0; i < source.Length; i++)
                {
                    string name = source[i] == null ? string.Empty : source[i].name;
                    Color color = name.Contains("Moss") ? new Color(.18f, .25f, .20f) :
                        name.Contains("Old") ? new Color(.31f, .34f, .32f) :
                        name.Contains("Timber") ? new Color(.15f, .07f, .025f) : new Color(.18f, .72f, .48f);
                    Material material = new Material(shader) { color = color };
                    if (name.Contains("Rune"))
                    {
                        material.EnableKeyword("_EMISSION");
                        material.SetColor("_EmissionColor", color * 1.4f);
                    }
                    runtimeMaterials.Add(material);
                    palette[i] = material;
                }
                renderer.sharedMaterials = palette;
            }
        }

        private void BuildSunmere()
        {
            // A working agricultural silhouette on the southern approach: the
            // mill is visible from the town road, while the low fence mass
            // makes the fields read as a destination rather than open grass.
            Vector3 origin = Grounded(63, 91);
            Place("windmill", "BiomeLandmark_Sunmere_Mill", origin, Vector3.one * 1.35f, 0f);
            for (int i = -2; i <= 2; i++)
            {
                Place("fence", "BiomeLandmark_Sunmere_FieldFence_" + i,
                    origin + new Vector3(i * .85f, 0f, 2.0f), Vector3.one * .9f, 0f);
            }
            Place("lantern", "BiomeLandmark_Sunmere_RoadLantern", origin + new Vector3(-2.4f, 0f, -.7f), Vector3.one * 1.1f, 0f);
            PlaceWayfinder("BiomeLandmark_Sunmere_Wayfinder", origin + new Vector3(-3.25f, 0f, -1.4f), 180f,
                "sunmere", 63, 91);
        }

        private void BuildEmberRoad()
        {
            // The eastern route needs a strong transition before the existing
            // Cinder Hollow light pools. A compact stone-and-lantern gate gives
            // the player a visible forward cue and a memorable return point.
            Vector3 origin = Grounded(82, 63);
            Place("rock-large", "BiomeLandmark_EmberRoad_GateLeft", origin + new Vector3(-1.1f, 0f, 0f), new Vector3(.78f, 1.35f, .72f), -10f);
            Place("rock-large", "BiomeLandmark_EmberRoad_GateRight", origin + new Vector3(1.1f, 0f, 0f), new Vector3(.78f, 1.35f, .72f), 10f);
            Place("lantern", "BiomeLandmark_EmberRoad_LanternLeft", origin + new Vector3(-1.55f, 0f, .45f), Vector3.one * 1.18f, 0f);
            Place("lantern", "BiomeLandmark_EmberRoad_LanternRight", origin + new Vector3(1.55f, 0f, .45f), Vector3.one * 1.18f, 0f);
            Place("road-bend", "BiomeLandmark_EmberRoad_Approach", origin + new Vector3(0f, .01f, -1.2f), Vector3.one * 1.05f, 0f);
            PlaceWayfinder("BiomeLandmark_EmberRoad_Wayfinder", origin + new Vector3(0f, 0f, -2.45f), 0f,
                "ember_road", 82, 63);
        }

        private Vector3 Grounded(int x, int z)
        {
            CoreGrid grid = WorldRuntime.Instance == null ? new CoreGrid() : WorldRuntime.Instance.Grid;
            var tile = grid.At(x, z);
            float ground = OpenWorldTerrainView.SurfaceHeight(tile, x + .5f, z + .5f);
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

        private void PlaceWayfinder(string instanceName, Vector3 position, float yaw, string waystoneId, int tileX, int tileY)
        {
            GameObject prefab = Resources.Load<GameObject>(WayfinderAsset);
            if (prefab == null)
            {
                Debug.LogWarning("[Isoperia] Missing owned wayfinder model.");
                return;
            }
            GameObject instance = Instantiate(prefab, position, Quaternion.Euler(0f, yaw, 0f), transform);
            instance.name = instanceName;
            OwnedModelPresentation.FitToHeight(instance, 2.15f);
            instance.AddComponent<BoxCollider>().size = new Vector3(1.2f, 2.1f, .75f);
            instance.AddComponent<WorldInteractionTarget>().SetWaystone(waystoneId, tileX, tileY);
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
            for (int i = 0; i < runtimeMaterials.Count; i++)
                if (runtimeMaterials[i] != null) Destroy(runtimeMaterials[i]);
            for (int i = 0; i < instances.Count; i++)
            {
                if (instances[i] != null) Destroy(instances[i]);
            }
        }
    }
}
