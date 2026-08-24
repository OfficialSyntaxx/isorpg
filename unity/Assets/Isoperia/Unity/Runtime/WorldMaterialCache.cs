using System.Collections.Generic;
using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>Owns shared runtime palette materials for world presentation.</summary>
    public static class WorldMaterialCache
    {
        private static readonly Dictionary<string, Material> Materials = new Dictionary<string, Material>();

        public static Material Lit(string key, Color color, bool emission = false)
        {
            if (Materials.TryGetValue(key, out Material material) && material != null) return material;
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            material = new Material(shader) { color = color, name = "Isoperia_" + key };
            if (emission)
            {
                material.EnableKeyword("_EMISSION");
                material.SetColor("_EmissionColor", color * 1.5f);
            }
            Materials[key] = material;
            return material;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void Reset()
        {
            foreach (Material material in Materials.Values) if (material != null) Object.Destroy(material);
            Materials.Clear();
        }
    }
}
