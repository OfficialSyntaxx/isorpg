using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>Visual landmark and safe-light islands for the first eastern dungeon route.</summary>
    public sealed class WorldDungeonView : MonoBehaviour
    {
        private const string AssetRoot = "Art/KenneyFantasyTown/";
        private const string CinderGateAsset = "Art/OwnedModels/cinder_gate";
        private readonly Vector3[] pools = { new Vector3(82.5f, .22f, 62.5f), new Vector3(94.5f, .22f, 62.5f), new Vector3(105.5f, .22f, 68.5f) };
        private Material glow;
        private Material basalt;
        private Material ash;
        private Material gateBasalt;
        private Material gateRune;
        private Material gateDarkness;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void CreateView()
        {
            if (Object.FindAnyObjectByType<WorldDungeonView>() != null) return;
            new GameObject(nameof(WorldDungeonView)).AddComponent<WorldDungeonView>();
        }

        private void Start()
        {
            glow = WorldMaterialCache.Lit("CinderPoolGlow", new Color(1f, .34f, .06f, 1f), true);
            basalt = WorldMaterialCache.Lit("CinderBasalt", new Color(.10f, .075f, .09f, 1f));
            ash = WorldMaterialCache.Lit("CinderAsh", new Color(.22f, .14f, .12f, 1f));
            foreach (Vector3 point in pools) CreatePool(point);
            CreateRouteMarkers();
            CreateEntrance();
        }

        private void CreatePool(Vector3 point)
        {
            point = Grounded(point);
            GameObject ring = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            ring.name = "CinderHollow_LanternPool";
            ring.transform.SetParent(transform, false);
            ring.transform.position = point;
            ring.transform.localScale = new Vector3(2.4f, .035f, 2.4f);
            ring.GetComponent<Renderer>().sharedMaterial = glow;
            Destroy(ring.GetComponent<Collider>());

            PlaceProp("lantern", "CinderHollow_Lantern", point + new Vector3(0f, .03f, 0f), Vector3.one * 1.25f, 0f);

            var lightRoot = new GameObject("LanternLight");
            lightRoot.transform.SetParent(transform, false);
            lightRoot.transform.position = point + Vector3.up * 1.7f;
            Light light = lightRoot.AddComponent<Light>();
            light.type = LightType.Point; light.color = new Color(1f, .56f, .23f); light.range = 5f; light.intensity = 4f;
        }

        private void CreateEntrance()
        {
            Vector3 entrance = Grounded(new Vector3(113.5f, 0f, 69.5f));
            GameObject prefab = Resources.Load<GameObject>(CinderGateAsset);
            if (prefab != null)
            {
                GameObject gate = Instantiate(prefab, entrance, Quaternion.Euler(0f, 20f, 0f), transform);
                gate.name = "CinderHollow_EntranceGate";
                OwnedModelPresentation.FitToHeight(gate, 2.65f);
                ApplyGatePalette(gate);
                return;
            }
            CreateRock("CinderHollow_EntranceLeft", entrance + Vector3.left * 1.2f, new Vector3(.9f, 1.5f, .7f));
            CreateRock("CinderHollow_EntranceRight", entrance + Vector3.right * 1.2f, new Vector3(.9f, 1.5f, .7f));
            GameObject lintel = GameObject.CreatePrimitive(PrimitiveType.Cube);
            lintel.name = "CinderHollow_EntranceArch";
            lintel.transform.SetParent(transform, false);
            lintel.transform.position = entrance + Vector3.up * 1.2f;
            lintel.transform.localScale = new Vector3(2.9f, .45f, .7f);
            lintel.GetComponent<Renderer>().sharedMaterial = basalt;
            Destroy(lintel.GetComponent<Collider>());
        }

        private void ApplyGatePalette(GameObject gate)
        {
            gateBasalt = WorldMaterialCache.Lit("CinderGateBasalt", new Color(.17f, .095f, .15f));
            gateDarkness = WorldMaterialCache.Lit("CinderGateDarkness", new Color(.012f, .010f, .018f));
            gateRune = WorldMaterialCache.Lit("CinderGateRune", new Color(1f, .20f, .025f), true);
            foreach (Renderer renderer in gate.GetComponentsInChildren<Renderer>(true))
            {
                Material[] source = renderer.sharedMaterials;
                Material[] palette = new Material[source.Length];
                for (int i = 0; i < source.Length; i++)
                {
                    string name = source[i] == null ? string.Empty : source[i].name;
                    palette[i] = name.Contains("Rune") ? gateRune : name.Contains("Darkness") ? gateDarkness : gateBasalt;
                }
                renderer.sharedMaterials = palette;
            }
        }

        private void CreateRouteMarkers()
        {
            Vector3[] rocks = { new Vector3(76.4f, .45f, 58.2f), new Vector3(85.8f, .45f, 58.6f), new Vector3(94.1f, .45f, 62.4f), new Vector3(103.1f, .45f, 66.0f), new Vector3(111.6f, .45f, 70.8f) };
            for (int i = 0; i < rocks.Length; i++) CreateRock("CinderHollow_Basalt_" + i, Grounded(rocks[i]), new Vector3(.75f, .9f + (i % 2) * .25f, .62f));
        }

        private static Vector3 Grounded(Vector3 point)
        {
            var grid = WorldRuntime.Instance == null ? new Isoperia.Core.World.Grid() : WorldRuntime.Instance.Grid;
            var tile = grid.At(Mathf.FloorToInt(point.x), Mathf.FloorToInt(point.z));
            point.y = OpenWorldTerrainView.SurfaceHeight(tile, point.x, point.z);
            return point;
        }

        private void CreateRock(string name, Vector3 position, Vector3 scale)
        {
            string assetName = scale.y > 1.1f ? "rock-large" : "rock-small";
            PlaceProp(assetName, name, position, scale, 17f);
        }

        private void PlaceProp(string assetName, string instanceName, Vector3 position, Vector3 scale, float yaw)
        {
            GameObject prefab = Resources.Load<GameObject>(AssetRoot + assetName);
            if (prefab == null)
            {
                Debug.LogWarning("[Isoperia] Missing Cinder Hollow asset: " + assetName);
                return;
            }

            GameObject prop = Instantiate(prefab, position, Quaternion.Euler(0f, yaw, 0f), transform);
            prop.name = instanceName;
            prop.transform.localScale = scale;
        }

        private void OnDestroy()
        {
            // Shared palette materials are owned by WorldMaterialCache.
        }
    }
}
