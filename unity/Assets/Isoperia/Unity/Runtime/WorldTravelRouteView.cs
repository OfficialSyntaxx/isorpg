using System.Collections.Generic;
using Isoperia.Core.World;
using UnityEngine;
using UnityEngine.Rendering;
using CoreGrid = Isoperia.Core.World.Grid;

namespace Isoperia.Unity
{
    /// <summary>
    /// Builds presentation-only road ribbons between the mainland's authored
    /// destinations. Core coordinates, movement, combat, and save data remain
    /// tile-based; these routes simply make the open world legible from a
    /// third-person camera.
    /// </summary>
    [RequireComponent(typeof(MeshFilter), typeof(MeshRenderer))]
    public sealed class WorldTravelRouteView : MonoBehaviour
    {
        private const float RouteWidth = 1.15f;
        private const float SegmentLength = 1.25f;
        private Mesh routeMesh;
        private Material routeMaterial;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Create()
        {
            if (M0InspectionStartup.IsInspectionScene()) return;
            if (Object.FindAnyObjectByType<WorldTravelRouteView>() == null)
                new GameObject(nameof(WorldTravelRouteView)).AddComponent<WorldTravelRouteView>();
        }

        private void Awake()
        {
            BuildRoutes();
        }

        private void BuildRoutes()
        {
            CoreGrid grid = WorldRuntime.Instance == null ? new CoreGrid() : WorldRuntime.Instance.Grid;
            var vertices = new List<Vector3>();
            var triangles = new List<int>();

            // Hearthvale is deliberately the hub. Each route passes through a
            // nearby approach point so destinations read as roads, not rays.
            AddRoute(grid, vertices, triangles, new[]
            {
                new Vector2(63.5f, 63.5f), new Vector2(63.5f, 74f), new Vector2(63.5f, 91.5f)
            });
            AddRoute(grid, vertices, triangles, new[]
            {
                new Vector2(63.5f, 63.5f), new Vector2(72f, 63.5f), new Vector2(82.5f, 63.5f)
            });
            AddRoute(grid, vertices, triangles, new[]
            {
                new Vector2(63.5f, 63.5f), new Vector2(52f, 55f), new Vector2(28.5f, 32.5f)
            });
            AddRoute(grid, vertices, triangles, new[]
            {
                new Vector2(63.5f, 63.5f), new Vector2(76f, 53f), new Vector2(96.5f, 28.5f)
            });
            AddRoute(grid, vertices, triangles, new[]
            {
                new Vector2(63.5f, 63.5f), new Vector2(48f, 76f), new Vector2(28.5f, 98.5f)
            });

            routeMesh = new Mesh
            {
                name = "Isoperia_MainlandTravelRoutes",
                indexFormat = IndexFormat.UInt32
            };
            routeMesh.SetVertices(vertices);
            routeMesh.SetTriangles(triangles, 0);
            routeMesh.RecalculateNormals();
            routeMesh.RecalculateBounds();
            routeMesh.UploadMeshData(false);

            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            routeMaterial = new Material(shader) { color = new Color(.28f, .16f, .075f, 1f) };
            routeMaterial.enableInstancing = true;
            GetComponent<MeshFilter>().sharedMesh = routeMesh;
            GetComponent<MeshRenderer>().sharedMaterial = routeMaterial;
        }

        private static void AddRoute(CoreGrid grid, List<Vector3> vertices, List<int> triangles, Vector2[] points)
        {
            for (int point = 0; point < points.Length - 1; point++)
            {
                Vector2 from = points[point];
                Vector2 to = points[point + 1];
                float distance = Vector2.Distance(from, to);
                int steps = Mathf.Max(1, Mathf.CeilToInt(distance / SegmentLength));
                Vector2 direction = (to - from).normalized;
                Vector2 right = new Vector2(-direction.y, direction.x) * (RouteWidth * .5f);
                for (int step = 0; step < steps; step++)
                {
                    Vector2 a = Vector2.Lerp(from, to, step / (float)steps);
                    Vector2 b = Vector2.Lerp(from, to, (step + 1) / (float)steps);
                    int start = vertices.Count;
                    vertices.Add(Grounded(grid, a - right));
                    vertices.Add(Grounded(grid, a + right));
                    vertices.Add(Grounded(grid, b - right));
                    vertices.Add(Grounded(grid, b + right));
                    triangles.Add(start); triangles.Add(start + 2); triangles.Add(start + 1);
                    triangles.Add(start + 1); triangles.Add(start + 2); triangles.Add(start + 3);
                }
            }
        }

        private static Vector3 Grounded(CoreGrid grid, Vector2 point)
        {
            int x = Mathf.Clamp(Mathf.FloorToInt(point.x), 0, grid.Width - 1);
            int z = Mathf.Clamp(Mathf.FloorToInt(point.y), 0, grid.Height - 1);
            Tile tile = grid.At(x, z);
            return new Vector3(point.x, OpenWorldTerrainView.SurfaceHeight(tile, point.x, point.y) + .018f, point.y);
        }

        private void OnDestroy()
        {
            if (routeMesh != null) Destroy(routeMesh);
            if (routeMaterial != null) Destroy(routeMaterial);
        }
    }
}
