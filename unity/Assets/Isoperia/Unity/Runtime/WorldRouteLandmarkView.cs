using System.Collections.Generic;
using UnityEngine;
using CoreGrid = Isoperia.Core.World.Grid;

namespace Isoperia.Unity
{
    /// <summary>Small, authored-looking route anchors for the first playable mainland paths.</summary>
    public sealed class WorldRouteLandmarkView : MonoBehaviour
    {
        private readonly List<Material> materials = new List<Material>();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Create()
        {
            if (Object.FindAnyObjectByType<WorldRouteLandmarkView>() == null)
                new GameObject(nameof(WorldRouteLandmarkView)).AddComponent<WorldRouteLandmarkView>();
        }

        private void Start()
        {
            Material timber = MakeMaterial(new Color(.16f, .075f, .028f));
            Material stone = MakeMaterial(new Color(.25f, .28f, .29f));
            Material glow = MakeMaterial(new Color(.95f, .46f, .12f), true);
            CreateLamp(70, 63, timber, glow);
            CreateLamp(77, 63, timber, glow);
            CreateWaystone(82, 63, stone, glow);
            CreateLamp(63, 77, timber, glow);
            CreateWaystone(63, 91, stone, glow);
            CreateDistrictMarker(32, 36, new Color(.20f, .58f, .28f), timber, stone, "WildwoodShrine");
            CreateDistrictMarker(92, 35, new Color(.42f, .72f, .94f), timber, stone, "FrostwatchBeacon");
            CreateDistrictMarker(34, 92, new Color(.32f, .74f, .55f), timber, stone, "MiregateMarker");
            CreateDistrictMarker(102, 69, new Color(1f, .24f, .06f), timber, stone, "CinderSignal");
        }

        private void CreateLamp(int x, int z, Material timber, Material glow)
        {
            GameObject root = new GameObject("RouteLamp");
            root.transform.SetParent(transform, false);
            root.transform.position = Grounded(x, z);
            Block(root.transform, new Vector3(0f, .9f, 0f), new Vector3(.10f, 1.8f, .10f), timber);
            Block(root.transform, new Vector3(.22f, 1.62f, 0f), new Vector3(.42f, .07f, .07f), timber);
            Sphere(root.transform, new Vector3(.42f, 1.42f, 0f), .18f, glow);
            Light light = root.AddComponent<Light>();
            light.type = LightType.Point; light.color = new Color(1f, .42f, .15f); light.range = 4f; light.shadows = LightShadows.None;
            root.AddComponent<WorldLocalLightPool>();
        }

        private void CreateWaystone(int x, int z, Material stone, Material glow)
        {
            GameObject root = new GameObject("RouteWaystone");
            root.transform.SetParent(transform, false);
            root.transform.position = Grounded(x, z);
            Block(root.transform, new Vector3(0f, .55f, 0f), new Vector3(.48f, 1.1f, .38f), stone);
            Sphere(root.transform, new Vector3(0f, 1.18f, 0f), .20f, glow);
            Light light = root.AddComponent<Light>();
            light.type = LightType.Point; light.color = new Color(.35f, .8f, 1f); light.range = 3.2f; light.shadows = LightShadows.None;
            root.AddComponent<WorldLocalLightPool>();
        }

        private void CreateDistrictMarker(int x, int z, Color color, Material timber, Material stone, string name)
        {
            GameObject root = new GameObject(name);
            root.transform.SetParent(transform, false);
            root.transform.position = Grounded(x, z);
            Block(root.transform, new Vector3(0f, .55f, 0f), new Vector3(.75f, 1.1f, .58f), stone);
            Block(root.transform, new Vector3(0f, 1.5f, 0f), new Vector3(.12f, .9f, .12f), timber);
            Material glow = MakeMaterial(color, true);
            Sphere(root.transform, new Vector3(0f, 2.05f, 0f), .28f, glow);
            Light light = root.AddComponent<Light>();
            light.type = LightType.Point; light.color = color; light.range = 5f; light.shadows = LightShadows.None;
            root.AddComponent<WorldLocalLightPool>();
        }

        private static Vector3 Grounded(int x, int z)
        {
            CoreGrid grid = WorldRuntime.Instance == null ? new CoreGrid() : WorldRuntime.Instance.Grid;
            return new Vector3(x + .5f, OpenWorldTerrainView.SurfaceHeight(grid.At(x, z), x + .5f, z + .5f), z + .5f);
        }

        private Material MakeMaterial(Color color, bool emission = false)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            Material material = new Material(shader) { color = color };
            if (emission) { material.EnableKeyword("_EMISSION"); material.SetColor("_EmissionColor", color * .7f); }
            materials.Add(material); return material;
        }

        private static void Block(Transform parent, Vector3 position, Vector3 scale, Material material)
        {
            GameObject part = GameObject.CreatePrimitive(PrimitiveType.Cube);
            part.transform.SetParent(parent, false); part.transform.localPosition = position; part.transform.localScale = scale;
            part.GetComponent<Renderer>().sharedMaterial = material; Destroy(part.GetComponent<Collider>());
        }

        private static void Sphere(Transform parent, Vector3 position, float scale, Material material)
        {
            GameObject part = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            part.transform.SetParent(parent, false); part.transform.localPosition = position; part.transform.localScale = Vector3.one * scale;
            part.GetComponent<Renderer>().sharedMaterial = material; Destroy(part.GetComponent<Collider>());
        }

        private void OnDestroy()
        {
            foreach (Material material in materials) if (material != null) Destroy(material);
        }
    }
}
