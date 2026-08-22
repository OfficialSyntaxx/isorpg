using System.Collections.Generic;
using Isoperia.Core.World;
using UnityEngine;
using UnityEngine.Rendering;

namespace Isoperia.Unity
{
    [RequireComponent(typeof(MeshFilter))]
    [RequireComponent(typeof(MeshRenderer))]
    public sealed class WorldEnvironmentView : MonoBehaviour
    {
        private const int TerrainCount = 6;

        private Mesh runtimeMesh;
        private Material[] runtimeMaterials;

        private void Awake()
        {
            Rebuild();
        }

        private void OnDestroy()
        {
            DestroyRuntimeAssets();
        }

        public void Rebuild()
        {
            DestroyRuntimeAssets();

            var grid = new Isoperia.Core.World.Grid();
            var vertices = new List<Vector3>(grid.Width * grid.Height * 4);
            var submeshTriangles = new List<int>[TerrainCount];

            for (int i = 0; i < TerrainCount; i++)
            {
                submeshTriangles[i] = new List<int>(grid.Width * grid.Height * 6);
            }

            for (int y = 0; y < grid.Height; y++)
            {
                for (int x = 0; x < grid.Width; x++)
                {
                    Tile tile = grid.Tiles[y][x];
                    float elevation = tile.TerrainType == TerrainType.Water
                        ? 0.02f
                        : 0.04f + (float)tile.Elevation;

                    int vertexStart = vertices.Count;
                    vertices.Add(new Vector3(tile.X, elevation, tile.Y));
                    vertices.Add(new Vector3(tile.X + 1, elevation, tile.Y));
                    vertices.Add(new Vector3(tile.X + 1, elevation, tile.Y + 1));
                    vertices.Add(new Vector3(tile.X, elevation, tile.Y + 1));

                    List<int> triangles = submeshTriangles[(int)tile.TerrainType];
                    triangles.Add(vertexStart);
                    triangles.Add(vertexStart + 2);
                    triangles.Add(vertexStart + 1);
                    triangles.Add(vertexStart);
                    triangles.Add(vertexStart + 3);
                    triangles.Add(vertexStart + 2);
                }
            }

            runtimeMesh = new Mesh
            {
                name = "WorldEnvironmentView_RuntimeMesh",
                indexFormat = IndexFormat.UInt32,
                subMeshCount = TerrainCount
            };
            runtimeMesh.SetVertices(vertices);

            for (int i = 0; i < TerrainCount; i++)
            {
                runtimeMesh.SetTriangles(submeshTriangles[i], i, false);
            }

            runtimeMesh.RecalculateNormals();
            runtimeMesh.RecalculateBounds();
            runtimeMesh.UploadMeshData(false);

            runtimeMaterials = CreateRuntimeMaterials();

            GetComponent<MeshFilter>().sharedMesh = runtimeMesh;
            GetComponent<MeshRenderer>().sharedMaterials = runtimeMaterials;
        }

        private static Material[] CreateRuntimeMaterials()
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null)
            {
                shader = Shader.Find("Standard");
            }

            var materials = new Material[TerrainCount];
            Color[] colors =
            {
                new Color(0.30f, 0.40f, 0.24f, 1f),
                new Color(0.13f, 0.33f, 0.45f, 1f),
                new Color(0.34f, 0.34f, 0.34f, 1f),
                new Color(0.40f, 0.26f, 0.16f, 1f),
                new Color(0.65f, 0.56f, 0.34f, 1f),
                new Color(0.45f, 0.38f, 0.25f, 1f)
            };

            for (int i = 0; i < TerrainCount; i++)
            {
                materials[i] = new Material(shader)
                {
                    name = "WorldEnvironmentView_RuntimeMaterial_" + i,
                    color = colors[i]
                };
            }

            return materials;
        }

        private void DestroyRuntimeAssets()
        {
            if (runtimeMesh != null)
            {
                if (Application.isPlaying)
                {
                    Destroy(runtimeMesh);
                }
                else
                {
                    DestroyImmediate(runtimeMesh);
                }

                runtimeMesh = null;
            }

            if (runtimeMaterials == null)
            {
                return;
            }

            for (int i = 0; i < runtimeMaterials.Length; i++)
            {
                if (runtimeMaterials[i] == null)
                {
                    continue;
                }

                if (Application.isPlaying)
                {
                    Destroy(runtimeMaterials[i]);
                }
                else
                {
                    DestroyImmediate(runtimeMaterials[i]);
                }
            }

            runtimeMaterials = null;
        }
    }
}
