using System.Collections.Generic;
using Isoperia.Core.World;
using UnityEngine;
using UnityEngine.Rendering;
using CoreGrid = Isoperia.Core.World.Grid;

namespace Isoperia.Unity
{
    /// <summary>
    /// Deterministic low-poly scatter for the prototype world. It turns each
    /// tile's existing Core seed into a stable tree or rock decision and packs
    /// the result into one mesh, avoiding a GameObject/draw-call per decoration.
    /// </summary>
    [RequireComponent(typeof(MeshFilter))]
    [RequireComponent(typeof(MeshRenderer))]
    public sealed class WorldDecorationView : MonoBehaviour
    {
        private const int FoliageMaterial = 0;
        private const int TrunkMaterial = 1;
        private const int RockMaterial = 2;
        private const int MaterialCount = 3;
        private static readonly int[] BoxFaces =
        {
            0, 2, 1, 0, 3, 2,
            4, 5, 6, 4, 6, 7,
            0, 1, 5, 0, 5, 4,
            1, 2, 6, 1, 6, 5,
            2, 3, 7, 2, 7, 6,
            3, 0, 4, 3, 4, 7,
        };

        private Mesh runtimeMesh;
        private Material[] runtimeMaterials;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void CreateDecorationView()
        {
            if (Object.FindAnyObjectByType<WorldDecorationView>() != null) return;

            var root = new GameObject(nameof(WorldDecorationView));
            root.AddComponent<WorldDecorationView>();
        }

        private void Awake()
        {
            Rebuild();
        }

        public void Rebuild()
        {
            DestroyRuntimeAssets();

            CoreGrid grid = WorldRuntime.Instance == null ? new CoreGrid() : WorldRuntime.Instance.Grid;
            var vertices = new List<Vector3>(512);
            var triangles = new List<int>[MaterialCount];
            for (int i = 0; i < MaterialCount; i++) triangles[i] = new List<int>(512);

            for (int y = 0; y < grid.Height; y++)
            {
                for (int x = 0; x < grid.Width; x++)
                {
                    Tile tile = grid.Tiles[y][x];
                    float ground = tile.TerrainType == TerrainType.Water
                        ? 0.02f
                        : 0.04f + (float)tile.Elevation;
                    float offsetX = 0.25f + ((tile.Seed % 37) / 100f);
                    float offsetZ = 0.25f + (((tile.Seed / 37) % 37) / 100f);
                    var basePosition = new Vector3(tile.X + offsetX, ground, tile.Y + offsetZ);

                    if (tile.TerrainType == TerrainType.Grass && tile.ZoneId != ZoneIds.TownCenter && tile.Seed % 100 < 10)
                    {
                        AddBox(vertices, triangles, basePosition + new Vector3(0f, 0.42f, 0f), new Vector3(0.14f, 0.84f, 0.14f), TrunkMaterial);
                        AddBox(vertices, triangles, basePosition + new Vector3(0f, 1.03f, 0f), new Vector3(0.68f, 0.58f, 0.68f), FoliageMaterial);
                    }
                    else if ((tile.TerrainType == TerrainType.Rock || tile.TerrainType == TerrainType.Dirt) && tile.Seed % 100 < 24)
                    {
                        float scale = 0.22f + ((tile.Seed % 13) / 100f);
                        AddBox(vertices, triangles, basePosition + new Vector3(0f, scale * 0.55f, 0f), new Vector3(scale, scale * 1.1f, scale * 0.8f), RockMaterial);
                    }
                }
            }

            runtimeMesh = new Mesh
            {
                name = "WorldDecorationView_RuntimeMesh",
                indexFormat = IndexFormat.UInt32,
                subMeshCount = MaterialCount,
            };
            runtimeMesh.SetVertices(vertices);
            for (int i = 0; i < MaterialCount; i++) runtimeMesh.SetTriangles(triangles[i], i, false);
            runtimeMesh.RecalculateNormals();
            runtimeMesh.RecalculateBounds();
            runtimeMesh.UploadMeshData(false);

            runtimeMaterials = CreateMaterials();
            GetComponent<MeshFilter>().sharedMesh = runtimeMesh;
            GetComponent<MeshRenderer>().sharedMaterials = runtimeMaterials;
        }

        private static void AddBox(List<Vector3> vertices, List<int>[] triangles, Vector3 center, Vector3 size, int material)
        {
            int start = vertices.Count;
            Vector3 half = size * 0.5f;
            vertices.Add(center + new Vector3(-half.x, -half.y, -half.z));
            vertices.Add(center + new Vector3( half.x, -half.y, -half.z));
            vertices.Add(center + new Vector3( half.x, -half.y,  half.z));
            vertices.Add(center + new Vector3(-half.x, -half.y,  half.z));
            vertices.Add(center + new Vector3(-half.x,  half.y, -half.z));
            vertices.Add(center + new Vector3( half.x,  half.y, -half.z));
            vertices.Add(center + new Vector3( half.x,  half.y,  half.z));
            vertices.Add(center + new Vector3(-half.x,  half.y,  half.z));

            for (int i = 0; i < BoxFaces.Length; i++) triangles[material].Add(start + BoxFaces[i]);
        }

        private static Material[] CreateMaterials()
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            Color[] colors =
            {
                new Color(0.18f, 0.38f, 0.17f, 1f),
                new Color(0.27f, 0.16f, 0.08f, 1f),
                new Color(0.36f, 0.37f, 0.38f, 1f),
            };
            var materials = new Material[MaterialCount];
            for (int i = 0; i < MaterialCount; i++)
            {
                materials[i] = new Material(shader)
                {
                    name = "WorldDecorationView_RuntimeMaterial_" + i,
                    color = colors[i],
                };
            }

            return materials;
        }

        private void OnDestroy()
        {
            DestroyRuntimeAssets();
        }

        private void DestroyRuntimeAssets()
        {
            if (runtimeMesh != null)
            {
                if (Application.isPlaying) Destroy(runtimeMesh);
                else DestroyImmediate(runtimeMesh);
                runtimeMesh = null;
            }

            if (runtimeMaterials == null) return;
            for (int i = 0; i < runtimeMaterials.Length; i++)
            {
                if (runtimeMaterials[i] == null) continue;
                if (Application.isPlaying) Destroy(runtimeMaterials[i]);
                else DestroyImmediate(runtimeMaterials[i]);
            }

            runtimeMaterials = null;
        }
    }
}
