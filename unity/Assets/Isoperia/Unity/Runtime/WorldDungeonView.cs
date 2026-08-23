using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>Visual landmark and safe-light islands for the first eastern dungeon route.</summary>
    public sealed class WorldDungeonView : MonoBehaviour
    {
        private readonly Vector3[] pools = { new Vector3(30.5f, .22f, 20.5f), new Vector3(34.5f, .22f, 20.5f), new Vector3(36.5f, .22f, 24.5f) };
        private Material glow;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void CreateView()
        {
            if (Object.FindAnyObjectByType<WorldDungeonView>() != null) return;
            new GameObject(nameof(WorldDungeonView)).AddComponent<WorldDungeonView>();
        }

        private void Start()
        {
            glow = new Material(Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard")) { color = new Color(1f, .55f, .15f, 1f) };
            foreach (Vector3 point in pools) CreatePool(point);
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

            var lightRoot = new GameObject("LanternLight");
            lightRoot.transform.SetParent(transform, false);
            lightRoot.transform.position = point + Vector3.up * 1.7f;
            Light light = lightRoot.AddComponent<Light>();
            light.type = LightType.Point; light.color = new Color(1f, .56f, .23f); light.range = 5f; light.intensity = 4f;
        }

        private void CreateEntrance()
        {
            GameObject gate = GameObject.CreatePrimitive(PrimitiveType.Cube);
            gate.name = "CinderHollow_Entrance";
            gate.transform.SetParent(transform, false);
            gate.transform.position = new Vector3(38.5f, .8f, 24.5f);
            gate.transform.localScale = new Vector3(1.7f, 1.6f, .45f);
            gate.GetComponent<Renderer>().sharedMaterial = glow;
            Destroy(gate.GetComponent<Collider>());
        }

        private void OnDestroy() { if (glow != null) Destroy(glow); }
    }
}
