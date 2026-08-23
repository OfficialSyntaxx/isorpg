using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>Visual landmark and safe-light islands for the first eastern dungeon route.</summary>
    public sealed class WorldDungeonView : MonoBehaviour
    {
        private const string AssetRoot = "Art/KenneyFantasyTown/";
        private readonly Vector3[] pools = { new Vector3(30.5f, .22f, 20.5f), new Vector3(34.5f, .22f, 20.5f), new Vector3(36.5f, .22f, 24.5f) };
        private Material glow;
        private Material basalt;
        private Material ash;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void CreateView()
        {
            if (Object.FindAnyObjectByType<WorldDungeonView>() != null) return;
            new GameObject(nameof(WorldDungeonView)).AddComponent<WorldDungeonView>();
        }

        private void Start()
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            glow = new Material(shader) { color = new Color(1f, .34f, .06f, 1f) };
            glow.EnableKeyword("_EMISSION");
            glow.SetColor("_EmissionColor", new Color(1f, .08f, .01f) * 2.4f);
            basalt = new Material(shader) { color = new Color(.10f, .075f, .09f, 1f) };
            ash = new Material(shader) { color = new Color(.22f, .14f, .12f, 1f) };
            foreach (Vector3 point in pools) CreatePool(point);
            CreateRouteMarkers();
            CreateEntrance();
        }

        private void CreatePool(Vector3 point)
        {
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
            Vector3 entrance = new Vector3(38.5f, .9f, 24.5f);
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

        private void CreateRouteMarkers()
        {
            Vector3[] rocks = { new Vector3(28.4f, .45f, 18.2f), new Vector3(31.8f, .45f, 17.6f), new Vector3(33.1f, .45f, 22.4f), new Vector3(35.1f, .45f, 23.0f), new Vector3(37.6f, .45f, 25.8f) };
            for (int i = 0; i < rocks.Length; i++) CreateRock("CinderHollow_Basalt_" + i, rocks[i], new Vector3(.75f, .9f + (i % 2) * .25f, .62f));
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
            if (glow != null) Destroy(glow);
            if (basalt != null) Destroy(basalt);
            if (ash != null) Destroy(ash);
        }
    }
}
