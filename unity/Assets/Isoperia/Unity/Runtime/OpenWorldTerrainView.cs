using System.Collections.Generic;
using Isoperia.Core.World;
using UnityEngine;
using CoreGrid = Isoperia.Core.World.Grid;

namespace Isoperia.Unity
{
    /// <summary>Continuous low-poly terrain for the 3D traversal experience.</summary>
    [RequireComponent(typeof(MeshFilter), typeof(MeshRenderer), typeof(MeshCollider))]
    public sealed class OpenWorldTerrainView : MonoBehaviour
    {
        private Mesh terrainMesh;
        private Material[] terrainMaterials;

        private void Awake()
        {
            CoreGrid grid = WorldRuntime.Instance == null ? new CoreGrid() : WorldRuntime.Instance.Grid;
            int width = grid.Width, height = grid.Height;
            var vertices = new List<Vector3>((width + 1) * (height + 1));
            var colors = new List<Color>((width + 1) * (height + 1));
            var triangles = new List<int>[] { new List<int>(), new List<int>(), new List<int>(), new List<int>() };
            for (int z = 0; z <= height; z++)
            for (int x = 0; x <= width; x++)
            {
                Tile tile = grid.At(Mathf.Min(x, width - 1), Mathf.Min(z, height - 1));
                float heightValue = SurfaceHeight(tile, x, z);
                vertices.Add(new Vector3(x, heightValue, z));
                colors.Add(ColorFor(tile.Biome, tile.TerrainType));
            }
            for (int z = 0; z < height; z++)
            for (int x = 0; x < width; x++)
            {
                int a = z * (width + 1) + x, b = a + 1, c = a + width + 1, d = c + 1;
                int submesh = BiomeIndex(grid.At(x, z).Biome);
                triangles[submesh].Add(a); triangles[submesh].Add(c); triangles[submesh].Add(b);
                triangles[submesh].Add(b); triangles[submesh].Add(c); triangles[submesh].Add(d);
            }
            terrainMesh = new Mesh { name = "Isoperia_OpenWorldTerrain" };
            terrainMesh.SetVertices(vertices); terrainMesh.SetColors(colors); terrainMesh.subMeshCount = triangles.Length;
            for (int i = 0; i < triangles.Length; i++) terrainMesh.SetTriangles(triangles[i], i);
            terrainMesh.RecalculateNormals(); terrainMesh.RecalculateBounds();
            GetComponent<MeshFilter>().sharedMesh = terrainMesh;
            GetComponent<MeshCollider>().sharedMesh = terrainMesh;
            Color[] palette = { new Color(.30f, .48f, .25f), new Color(.18f, .34f, .19f), new Color(.50f, .62f, .66f), new Color(.22f, .31f, .18f) };
            terrainMaterials = new Material[palette.Length];
            for (int i = 0; i < palette.Length; i++)
            {
                terrainMaterials[i] = new Material(Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard"));
                terrainMaterials[i].enableInstancing = true;
                terrainMaterials[i].color = palette[i];
            }
            GetComponent<MeshRenderer>().sharedMaterials = terrainMaterials;
        }

        private static Color ColorFor(Biome biome, TerrainType terrain)
        {
            if (terrain == TerrainType.Water) return new Color(.05f, .18f, .24f);
            if (biome == Biome.Snow) return new Color(.52f, .62f, .66f);
            if (biome == Biome.Swamp) return new Color(.18f, .28f, .18f);
            if (biome == Biome.Forest) return new Color(.20f, .36f, .20f);
            return new Color(.28f, .43f, .23f);
        }

        private static int BiomeIndex(Biome biome)
        {
            if (biome == Biome.Forest) return 1;
            if (biome == Biome.Snow) return 2;
            if (biome == Biome.Swamp) return 3;
            return 0;
        }

        /// <summary>
        /// Presentation terrain is deliberately broader than the Core tile
        /// elevation. It gives the mainland readable ridges and basins while
        /// keeping Core movement, resources and save coordinates tile-based.
        /// All visible world objects sample this surface at their placement.
        /// </summary>
        public static float SurfaceHeight(Tile tile, float worldX, float worldZ)
        {
            if (tile == null || tile.TerrainType == TerrainType.Water) return -.12f;

            float baseHeight = .04f + (float)tile.Elevation;
            float meadow = SmoothPlateau(worldX, 48f, 78f, 4f) * SmoothPlateau(worldZ, 48f, 78f, 4f);
            float rolling = Mathf.Sin(worldX * .105f + worldZ * .035f) * .075f
                          + Mathf.Cos(worldZ * .12f - worldX * .025f) * .05f;

            float height = baseHeight + rolling;
            if (tile.Biome == Biome.Forest)
                height += .10f + Mathf.Sin(worldX * .18f) * Mathf.Cos(worldZ * .14f) * .09f;
            else if (tile.Biome == Biome.Snow)
            {
                float highland = SmoothBand(worldX, 72f, 106f) * SmoothBand(54f - worldZ, 0f, 24f);
                height += .14f + highland * (.62f + Mathf.Sin(worldX * .16f) * .10f);
            }
            else if (tile.Biome == Biome.Swamp)
                height -= .035f;

            // The settlement remains level enough for authored streets,
            // building colliders and a dependable spawn/return point.
            return Mathf.Lerp(height, .18f, meadow);
        }

        private static float SmoothBand(float value, float min, float max)
        {
            return Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(min, max, value));
        }

        private static float SmoothPlateau(float value, float min, float max, float feather)
        {
            float enter = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(min, min + feather, value));
            float leave = 1f - Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(max - feather, max, value));
            return enter * leave;
        }

        private void OnDestroy()
        {
            if (terrainMesh != null) Destroy(terrainMesh);
            if (terrainMaterials == null) return;
            for (int i = 0; i < terrainMaterials.Length; i++) if (terrainMaterials[i] != null) Destroy(terrainMaterials[i]);
        }
    }
}
