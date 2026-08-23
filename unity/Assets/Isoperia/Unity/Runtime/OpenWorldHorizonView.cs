using System.Collections.Generic;
using UnityEngine;
using CoreGrid = Isoperia.Core.World.Grid;

namespace Isoperia.Unity
{
    /// <summary>
    /// Presentation-only coastal surround for the deterministic 42x42 gameplay
    /// grid. It gives the playable slice a mainland horizon without changing
    /// navigation, saves, or the Core world's fixed generation contract.
    /// </summary>
    public sealed class OpenWorldHorizonView : MonoBehaviour
    {
        private const float WorldMin = 0f;
        private const float HorizonExtent = 150f;
        private const float CoastDepth = 18f;
        private readonly List<Material> materials = new List<Material>();
        private Mesh oceanMesh;
        private Mesh coastMesh;
        private bool priorFog;
        private Color priorFogColor;
        private float priorFogDensity;
        private Color priorAmbient;

        private static float WorldMax => CoreGrid.WorldSize;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Create()
        {
            if (Object.FindAnyObjectByType<OpenWorldHorizonView>() != null) return;
            new GameObject(nameof(OpenWorldHorizonView)).AddComponent<OpenWorldHorizonView>();
        }

        private void Awake()
        {
            priorFog = RenderSettings.fog;
            priorFogColor = RenderSettings.fogColor;
            priorFogDensity = RenderSettings.fogDensity;
            priorAmbient = RenderSettings.ambientLight;
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = new Color(.30f, .42f, .49f);
            RenderSettings.fogDensity = .0085f;
            RenderSettings.ambientLight = new Color(.48f, .55f, .59f);

            CreateOcean();
            CreateCoast();
        }

        private void CreateOcean()
        {
            GameObject ocean = new GameObject("DistantOcean");
            ocean.transform.SetParent(transform, false);
            var filter = ocean.AddComponent<MeshFilter>();
            var renderer = ocean.AddComponent<MeshRenderer>();
            oceanMesh = new Mesh { name = "Isoperia_DistantOcean" };
            float e = HorizonExtent;
            oceanMesh.vertices = new[]
            {
                new Vector3(-e, -.68f, -e), new Vector3(e, -.68f, -e),
                new Vector3(-e, -.68f, e), new Vector3(e, -.68f, e)
            };
            oceanMesh.triangles = new[] { 0, 2, 1, 1, 2, 3 };
            oceanMesh.uv = new[] { Vector2.zero, Vector2.right * 80f, Vector2.up * 80f, Vector2.one * 80f };
            oceanMesh.RecalculateNormals();
            oceanMesh.RecalculateBounds();
            filter.sharedMesh = oceanMesh;
            renderer.sharedMaterial = CreateMaterial(new Color(.035f, .13f, .18f), .32f, .72f);
        }

        private void CreateCoast()
        {
            GameObject coast = new GameObject("MainlandHorizon");
            coast.transform.SetParent(transform, false);
            var filter = coast.AddComponent<MeshFilter>();
            var renderer = coast.AddComponent<MeshRenderer>();
            coastMesh = BuildCoastMesh();
            filter.sharedMesh = coastMesh;
            renderer.sharedMaterial = CreateMaterial(new Color(.19f, .33f, .16f), 0f, .18f);
        }

        private static Mesh BuildCoastMesh()
        {
            // Four continuous strips meet just outside the playable coastline.
            // Their irregular outer edge avoids a visible rectangular world cap.
            const int segments = 30;
            var vertices = new List<Vector3>((segments + 1) * 8);
            var triangles = new List<int>(segments * 24);
            AddStrip(vertices, triangles, segments, true, false);
            AddStrip(vertices, triangles, segments, true, true);
            AddStrip(vertices, triangles, segments, false, false);
            AddStrip(vertices, triangles, segments, false, true);
            var mesh = new Mesh { name = "Isoperia_MainlandHorizon" };
            mesh.SetVertices(vertices);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        private static void AddStrip(List<Vector3> vertices, List<int> triangles, int segments, bool horizontal, bool farSide)
        {
            int start = vertices.Count;
            for (int i = 0; i <= segments; i++)
            {
                float t = i / (float)segments;
                float along = Mathf.Lerp(WorldMin - CoastDepth, WorldMax + CoastDepth, t);
                float jitter = Mathf.Sin(i * 1.73f) * 2.1f + Mathf.Sin(i * .47f) * 3.2f;
                float inner = farSide ? WorldMax + .25f : WorldMin - .25f;
                float outer = farSide ? WorldMax + CoastDepth + jitter : WorldMin - CoastDepth - jitter;
                float innerHeight = -.22f;
                float outerHeight = -.32f + Mathf.Max(0f, Mathf.Sin(i * .79f)) * .85f;
                vertices.Add(horizontal ? new Vector3(along, innerHeight, inner) : new Vector3(inner, innerHeight, along));
                vertices.Add(horizontal ? new Vector3(along, outerHeight, outer) : new Vector3(outer, outerHeight, along));
            }
            for (int i = 0; i < segments; i++)
            {
                int a = start + i * 2;
                triangles.Add(a); triangles.Add(a + 1); triangles.Add(a + 2);
                triangles.Add(a + 1); triangles.Add(a + 3); triangles.Add(a + 2);
            }
        }

        private Material CreateMaterial(Color color, float metallic, float smoothness)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            var material = new Material(shader)
            {
                color = color,
                enableInstancing = true
            };
            material.SetFloat("_Metallic", metallic);
            material.SetFloat("_Smoothness", smoothness);
            materials.Add(material);
            return material;
        }

        private void OnDestroy()
        {
            RenderSettings.fog = priorFog;
            RenderSettings.fogColor = priorFogColor;
            RenderSettings.fogDensity = priorFogDensity;
            RenderSettings.ambientLight = priorAmbient;
            if (oceanMesh != null) Destroy(oceanMesh);
            if (coastMesh != null) Destroy(coastMesh);
            for (int i = 0; i < materials.Count; i++) if (materials[i] != null) Destroy(materials[i]);
        }
    }
}
