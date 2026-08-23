using UnityEngine;
using CoreGrid = Isoperia.Core.World.Grid;

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
            Landmark("Frostwatch", PrimitiveType.Capsule, 32, 8, new Vector3(.75f, 1.9f, .75f), snow);
            Landmark("Miregate", PrimitiveType.Cylinder, 8, 33, new Vector3(1.05f, 1.1f, 1.05f), swamp);
            Landmark("Wildwood", PrimitiveType.Cylinder, 8, 10, new Vector3(1.1f, 2.4f, 1.1f), forest);
        }

        private void Landmark(string name, PrimitiveType shape, int x, int z, Vector3 scale, Material material)
        {
            CoreGrid grid = WorldRuntime.Instance == null ? new CoreGrid() : WorldRuntime.Instance.Grid;
            var tile = grid.At(x, z);
            float ground = tile == null ? .04f : .04f + (float)tile.Elevation;
            GameObject marker = GameObject.CreatePrimitive(shape);
            marker.name = "BiomeLandmark_" + name;
            marker.transform.SetParent(transform, false);
            marker.transform.position = new Vector3(x + .5f, ground + scale.y, z + .5f);
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
