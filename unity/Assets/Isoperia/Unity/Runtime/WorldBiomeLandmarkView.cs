using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>Travel-scale silhouettes that make the deterministic biome quadrants readable in 3D.</summary>
    public sealed class WorldBiomeLandmarkView : MonoBehaviour
    {
        private Material snow, swamp, forest;

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
            swamp = new Material(shader) { color = new Color(.20f, .29f, .16f) };
            forest = new Material(shader) { color = new Color(.12f, .28f, .14f) };
            Landmark("Frostwatch", new Vector3(32.5f, 1.5f, 8.5f), new Vector3(1.2f, 3f, 1.2f), snow);
            Landmark("Miregate", new Vector3(8.5f, 1.1f, 33.5f), new Vector3(1.6f, 2.2f, 1.6f), swamp);
            Landmark("Wildwood", new Vector3(8.5f, 2f, 10.5f), new Vector3(2f, 4f, 2f), forest);
        }

        private void Landmark(string name, Vector3 position, Vector3 scale, Material material)
        {
            GameObject marker = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            marker.name = "BiomeLandmark_" + name;
            marker.transform.SetParent(transform, false);
            marker.transform.position = position;
            marker.transform.localScale = scale;
            marker.GetComponent<Renderer>().sharedMaterial = material;
            Destroy(marker.GetComponent<Collider>());
        }

        private void OnDestroy()
        {
            if (snow != null) Destroy(snow);
            if (swamp != null) Destroy(swamp);
            if (forest != null) Destroy(forest);
        }
    }
}
