using System.Collections.Generic;
using UnityEngine;
using CoreGrid = Isoperia.Core.World.Grid;

namespace Isoperia.Unity
{
    /// <summary>
    /// Composes authored, owned assets into readable district landmarks. This is
    /// presentation only: Core terrain, navigation, combat, and saves remain
    /// authoritative. Keep entries sparse so routes and interactions stay clear.
    /// </summary>
    public sealed class WorldOwnedAssetLibraryView : MonoBehaviour
    {
        private const string AssetRoot = "Art/OwnedModels/";
        private readonly List<GameObject> instances = new List<GameObject>();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Create()
        {
            if (Object.FindAnyObjectByType<WorldOwnedAssetLibraryView>() != null) return;
            new GameObject(nameof(WorldOwnedAssetLibraryView)).AddComponent<WorldOwnedAssetLibraryView>();
        }

        private void Start()
        {
            BuildHearthvale();
            BuildRoutes();
            BuildDistricts();
            BuildAmbientLife();
        }

        private void BuildHearthvale()
        {
            Vector3 town = Grounded(CoreGrid.TownCenter, CoreGrid.TownCenter);
            Place("hearthvale_produce_crate", town + new Vector3(-4.4f, 0f, 2.8f), 1f, 15f, false);
            Place("hearthvale_fish_rack", town + new Vector3(4.6f, 0f, -2.7f), 1f, -18f, false);
            Place("hearthvale_awning", town + new Vector3(-4.5f, 0f, 4.1f), 1.1f, 0f, false);
            Place("hearthvale_noticeboard", town + new Vector3(5.8f, 0f, 1.8f), 1f, 90f, true);
            Place("hearthvale_bench", town + new Vector3(-1.8f, 0f, -5.2f), 1f, 0f, true);
            Place("hearthvale_hanging_sign", town + new Vector3(3.9f, 0f, 4.0f), 1f, 90f, false);
            Place("hearthvale_anvil", town + new Vector3(-12f, 0f, -2.5f), 1f, 0f, true);
            Place("hearthvale_tool_rack", town + new Vector3(-13.4f, 0f, -1.7f), 1f, 90f, true);
            Place("farm_crop_rows", town + new Vector3(10.6f, 0f, 14.5f), 1.15f, 0f, false);
            Place("farm_water_trough", town + new Vector3(13.4f, 0f, 11.5f), 1f, 90f, true);
            Place("farm_chicken_coop", town + new Vector3(14.5f, 0f, 15.5f), 1f, -10f, true);
            Place("friendly_chicken", town + new Vector3(13.0f, 0f, 15.2f), .62f, 35f, false, true);
            Place("friendly_sheep", town + new Vector3(16.1f, 0f, 13.2f), .75f, -20f, false, true);
        }

        private void BuildRoutes()
        {
            PlaceAt("route_milestone", 74, 63, 1.1f, 90f, true);
            PlaceAt("route_road_lantern", 78, 62, 1.15f, 0f, true);
            PlaceAt("route_road_brazier", 84, 64, 1.1f, 0f, true);
            PlaceAt("route_ruined_cart", 88, 66, 1.1f, -18f, true);
            PlaceAt("route_wood_bridge", 47, 77, 1.35f, 90f, true);
            PlaceAt("wild_boulder_cluster", 44, 72, 1.25f, 15f, false);
            PlaceAt("wild_fern_cluster", 48, 73, 1.1f, 0f, false);
            PlaceAt("wild_shoreline_debris", 59, 94, 1.1f, 25f, false);
        }

        private void BuildDistricts()
        {
            // Wildwood's labour camp and shrine form a route-side clearing.
            PlaceAt("wildwood_log_stack", 35, 44, 1.2f, 0f, true);
            PlaceAt("wildwood_sawhorse", 37, 43, 1.1f, 18f, true);
            PlaceAt("wildwood_tent", 34, 47, 1.1f, 0f, true);
            PlaceAt("wildwood_shrine_fragments", 29, 39, 1.25f, 0f, true);
            PlaceAt("wildwood_rope_coil", 36, 46, 1f, 0f, false);
            // Frostwatch's mine reads from the approach without sealing the path.
            PlaceAt("frostwatch_mine_support", 36, 90, 1.35f, 90f, true);
            PlaceAt("frostwatch_ore_cart", 39, 89, 1.15f, 0f, true);
            PlaceAt("frostwatch_winch", 34, 88, 1.1f, 0f, true);
            PlaceAt("frostwatch_supply_tent", 39, 93, 1.1f, 0f, true);
            PlaceAt("frostwatch_crystal_cluster", 32, 92, 1.25f, 0f, false);
            // Sunmere's dock side sits beside water-facing terrain at the south edge.
            PlaceAt("sunmere_fishing_dock", 64, 100, 1.35f, 90f, true);
            PlaceAt("sunmere_rowboat", 67, 98, 1.15f, 90f, false);
            PlaceAt("sunmere_net_rack", 61, 97, 1.1f, 0f, true);
            PlaceAt("sunmere_buoy", 68, 102, 1.1f, 0f, false);
            PlaceAt("sunmere_lake_shrine", 59, 100, 1.2f, 0f, true);
            PlaceAt("friendly_fishing_bird", 62, 101, .85f, 25f, false, true);
            // Miregate and Cinder Hollow use obstruction-sized colliders only on landmarks.
            PlaceAt("miregate_broken_gate", 96, 38, 1.3f, 0f, true);
            PlaceAt("miregate_boardwalk", 93, 42, 1.3f, 90f, true);
            PlaceAt("miregate_watchtower", 98, 43, 1.25f, 0f, true);
            PlaceAt("miregate_bone_totem", 92, 36, 1.15f, 0f, true);
            PlaceAt("cinder_lava_rock", 102, 68, 1.3f, 0f, true);
            PlaceAt("cinder_ash_tree", 99, 72, 1.25f, 0f, true);
            PlaceAt("cinder_barricade", 105, 71, 1.2f, 90f, true);
            PlaceAt("cinder_furnace_ruins", 103, 75, 1.25f, 0f, true);
        }

        private void BuildAmbientLife()
        {
            Vector3 town = Grounded(CoreGrid.TownCenter + 9, CoreGrid.TownCenter + 8);
            Place("friendly_mule", town, .82f, 0f, false, true);
            PlaceAt("npc_guard", 73, 65, .88f, 180f, false, true);
            PlaceAt("npc_merchant", 62, 62, .88f, 0f, false, true);
            PlaceAt("npc_elder", 59, 66, .88f, 20f, false, true);
            PlaceAt("npc_questgiver", 30, 40, .90f, 0f, false, true);
        }

        private void PlaceAt(string asset, int x, int z, float scale, float yaw, bool collider, bool ambient = false)
        {
            Place(asset, Grounded(x, z), scale, yaw, collider, ambient);
        }

        private void Place(string asset, Vector3 position, float scale, float yaw, bool collider, bool ambient = false)
        {
            GameObject prefab = Resources.Load<GameObject>(AssetRoot + asset);
            if (prefab == null) return;
            GameObject instance = Instantiate(prefab, position, Quaternion.Euler(0f, yaw, 0f), transform);
            instance.name = "Owned_" + asset;
            OwnedModelPresentation.FitToHeight(instance, Mathf.Max(.45f, scale));
            ApplyPalette(instance);
            if (collider) AddBoundsCollider(instance);
            if (ambient) instance.AddComponent<WorldNpcAmbientView>();
            instances.Add(instance);
        }

        private static Vector3 Grounded(int x, int z)
        {
            CoreGrid grid = WorldRuntime.Instance == null ? new CoreGrid() : WorldRuntime.Instance.Grid;
            var tile = grid.At(x, z);
            return new Vector3(x + .5f, OpenWorldTerrainView.SurfaceHeight(tile, x + .5f, z + .5f), z + .5f);
        }

        private static void AddBoundsCollider(GameObject instance)
        {
            Renderer[] renderers = instance.GetComponentsInChildren<Renderer>(true);
            if (renderers.Length == 0) return;
            Bounds bounds = renderers[0].bounds;
            for (int i = 1; i < renderers.Length; i++) bounds.Encapsulate(renderers[i].bounds);
            BoxCollider collider = instance.AddComponent<BoxCollider>();
            collider.center = instance.transform.InverseTransformPoint(bounds.center);
            Vector3 localSize = instance.transform.InverseTransformVector(bounds.size);
            // Some Blender exports contain a mirrored child transform. Physics
            // rejects a negative BoxCollider extent even though the render is
            // valid, so normalize only the generated presentation collider.
            collider.size = new Vector3(Mathf.Abs(localSize.x), Mathf.Abs(localSize.y), Mathf.Abs(localSize.z));
        }

        private static void ApplyPalette(GameObject instance)
        {
            foreach (Renderer renderer in instance.GetComponentsInChildren<Renderer>(true))
            {
                Material[] source = renderer.sharedMaterials;
                Material[] palette = new Material[source.Length];
                for (int i = 0; i < source.Length; i++)
                {
                    string name = source[i] == null ? string.Empty : source[i].name;
                    bool glow = name.Contains("Glow") || name.Contains("Ember") || name.Contains("Lava") || name.Contains("Crystal") || name.Contains("Rune");
                    Color color = glow ? new Color(.9f, .22f, .04f) : name.Contains("Leaf") || name.Contains("Moss") || name.Contains("Plant") ? new Color(.11f, .29f, .12f) : name.Contains("Ice") ? new Color(.32f, .58f, .72f) : name.Contains("Stone") || name.Contains("Rock") ? new Color(.22f, .25f, .27f) : new Color(.28f, .14f, .06f);
                    palette[i] = WorldMaterialCache.Lit("Owned_" + name, color, glow);
                }
                renderer.sharedMaterials = palette;
            }
        }

        private void OnDestroy()
        {
            for (int i = 0; i < instances.Count; i++) if (instances[i] != null) Destroy(instances[i]);
        }
    }
}
