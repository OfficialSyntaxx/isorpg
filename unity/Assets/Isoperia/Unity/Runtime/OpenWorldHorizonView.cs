using System.Collections.Generic;
using UnityEngine;
using CoreGrid = Isoperia.Core.World.Grid;

namespace Isoperia.Unity
{
    /// <summary>
    /// Presentation-only coastal surround for the deterministic mainland grid.
    /// It gives the playable slice an ocean buffer and distant mainland horizon without changing
    /// navigation, saves, or the Core world's fixed generation contract.
    /// </summary>
    public sealed class OpenWorldHorizonView : MonoBehaviour
    {
        private const float WorldMin = 0f;
        private const float HorizonExtent = 220f;
        private const float CoastStart = 22f;
        private const float CoastDepth = 44f;
        // Keep the surround close to the low-water level of the runtime terrain.
        // The old ocean sat noticeably below the terrain edge, making the mainland
        // read as a square, floating game board when viewed from Hearthvale.
        private const float OceanHeight = -.06f;
        private readonly List<Material> materials = new List<Material>();
        private Mesh oceanMesh;
        private Mesh shorelineMesh;
        private Mesh coastMesh;
        private bool priorFog;
        private Color priorFogColor;
        private float priorFogDensity;
        private Color priorAmbient;

        private static float WorldMax => CoreGrid.WorldSize;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Create()
        {
            if (M0InspectionStartup.IsInspectionScene()) return;
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
            RenderSettings.fogDensity = .016f;
            RenderSettings.ambientLight = new Color(.48f, .55f, .59f);

            CreateOcean();
            CreateShoreline();
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
                new Vector3(-e, OceanHeight, -e), new Vector3(e, OceanHeight, -e),
                new Vector3(-e, OceanHeight, e), new Vector3(e, OceanHeight, e)
            };
            oceanMesh.triangles = new[] { 0, 2, 1, 1, 2, 3 };
            oceanMesh.uv = new[] { Vector2.zero, Vector2.right * 80f, Vector2.up * 80f, Vector2.one * 80f };
            oceanMesh.RecalculateNormals();
            oceanMesh.RecalculateBounds();
            filter.sharedMesh = oceanMesh;
            renderer.sharedMaterial = CreateMaterial(new Color(.025f, .115f, .17f), .24f, .82f);
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

        private void CreateShoreline()
        {
            GameObject shore = new GameObject("MainlandShoreline");
            shore.transform.SetParent(transform, false);
            var filter = shore.AddComponent<MeshFilter>();
            var renderer = shore.AddComponent<MeshRenderer>();
            shorelineMesh = BuildShorelineMesh();
            filter.sharedMesh = shorelineMesh;
            renderer.sharedMaterial = CreateMaterial(new Color(.18f, .29f, .16f), 0f, .08f);
        }

        private static Mesh BuildCoastMesh()
        {
            // Four distant shore strips leave a broad water buffer around the
            // playable coast. This avoids a sheer island edge while retaining
            // an irregular, finite backdrop that fog can soften at distance.
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

        private static Mesh BuildShorelineMesh()
        {
            // A shallow, irregular apron visually carries the playable terrain
            // into the ocean. It is presentation-only: no colliders, no Core
            // tiles, and no change to the world's navigation contract.
            const int segments = 42;
            const float apronDepth = 18f;
            var vertices = new List<Vector3>((segments + 1) * 8);
            var triangles = new List<int>(segments * 24);
            AddShoreStrip(vertices, triangles, segments, true, false, apronDepth);
            AddShoreStrip(vertices, triangles, segments, true, true, apronDepth);
            AddShoreStrip(vertices, triangles, segments, false, false, apronDepth);
            AddShoreStrip(vertices, triangles, segments, false, true, apronDepth);
            var mesh = new Mesh { name = "Isoperia_MainlandShoreline" };
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
                float along = Mathf.Lerp(WorldMin - CoastStart - CoastDepth, WorldMax + CoastStart + CoastDepth, t);
                float jitter = Mathf.Sin(i * 1.73f) * 2.1f + Mathf.Sin(i * .47f) * 3.2f;
                float inner = farSide ? WorldMax + CoastStart : WorldMin - CoastStart;
                float outer = farSide ? WorldMax + CoastStart + CoastDepth + jitter : WorldMin - CoastStart - CoastDepth - jitter;
                float innerHeight = OceanHeight + .01f;
                float outerHeight = OceanHeight + .12f + Mathf.Max(0f, Mathf.Sin(i * .79f)) * .85f;
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

        private static void AddShoreStrip(List<Vector3> vertices, List<int> triangles, int segments,
            bool horizontal, bool farSide, float depth)
        {
            int start = vertices.Count;
            for (int i = 0; i <= segments; i++)
            {
                float t = i / (float)segments;
                float along = Mathf.Lerp(WorldMin, WorldMax, t);
                float ripple = Mathf.Sin(i * 1.37f) * 1.7f + Mathf.Sin(i * .43f) * 1.1f;
                float inner = farSide ? WorldMax : WorldMin;
                float outer = farSide ? WorldMax + depth + ripple : WorldMin - depth - ripple;
                // A small vertical lip prevents a visible crack on flat edge
                // tiles while the outer shore falls softly toward ocean level.
                float innerHeight = .075f + Mathf.Max(0f, Mathf.Sin(i * .71f)) * .025f;
                float outerHeight = OceanHeight + .008f;
                vertices.Add(horizontal ? new Vector3(along, innerHeight, inner) : new Vector3(inner, innerHeight, along));
                vertices.Add(horizontal ? new Vector3(along, outerHeight, outer) : new Vector3(outer, outerHeight, along));
            }
            for (int i = 0; i < segments; i++)
            {
                int a = start + i * 2;
                triangles.Add(a); triangles.Add(a + 2); triangles.Add(a + 1);
                triangles.Add(a + 1); triangles.Add(a + 2); triangles.Add(a + 3);
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
            if (shorelineMesh != null) Destroy(shorelineMesh);
            if (coastMesh != null) Destroy(coastMesh);
            for (int i = 0; i < materials.Count; i++) if (materials[i] != null) Destroy(materials[i]);
        }
    }
}
