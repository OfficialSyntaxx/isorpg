using System.Collections.Generic;
using Isoperia.Core.State;
using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>Low-poly presentation for Core town buildings until authored meshes arrive.</summary>
    public sealed class WorldBuildingView : MonoBehaviour
    {
        private readonly List<GameObject> instances = new List<GameObject>();
        private int renderedCount = -1;
        private Material wood;
        private Material stone;
        private Material fire;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Create()
        {
            if (Object.FindAnyObjectByType<WorldBuildingView>() != null) return;
            new GameObject(nameof(WorldBuildingView)).AddComponent<WorldBuildingView>();
        }

        private void Start()
        {
            wood = MaterialFor(new Color(.35f, .20f, .10f, 1));
            stone = MaterialFor(new Color(.34f, .35f, .37f, 1));
            fire = MaterialFor(new Color(.92f, .38f, .08f, 1));
            Rebuild();
        }

        private void Update()
        {
            int count = SaveDriver.Instance?.State?.Town?.Buildings?.Count ?? 0;
            if (count != renderedCount) Rebuild();
        }

        private void Rebuild()
        {
            foreach (GameObject instance in instances) Destroy(instance);
            instances.Clear();
            var buildings = SaveDriver.Instance?.State?.Town?.Buildings;
            renderedCount = buildings?.Count ?? 0;
            if (buildings == null) return;
            foreach (TownBuilding building in buildings) CreatePrototype(building);
        }

        private void CreatePrototype(TownBuilding building)
        {
            float elevation = (float)(WorldRuntime.Instance?.Grid.At(building.X, building.Y)?.Elevation ?? 0) + .04f;
            var root = new GameObject("Building_" + building.Id);
            root.transform.SetParent(transform, false);
            root.transform.position = new Vector3(building.X + .5f, elevation, building.Y + .5f);
            instances.Add(root);
            bool furnace = building.Type == "SMELTER";
            bool campfire = building.Type == "CAMPFIRE";
            AddCube(root.transform, new Vector3(0, .25f, 0), campfire ? new Vector3(.65f, .18f, .65f) : new Vector3(.76f, .5f, .76f), furnace ? stone : wood);
            if (campfire) AddCube(root.transform, new Vector3(0, .53f, 0), new Vector3(.22f, .42f, .22f), fire);
            else AddCube(root.transform, new Vector3(0, .67f, 0), new Vector3(.86f, .34f, .86f), furnace ? stone : wood);
        }

        private static void AddCube(Transform parent, Vector3 localPosition, Vector3 scale, Material material)
        {
            GameObject cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
            cube.transform.SetParent(parent, false);
            cube.transform.localPosition = localPosition;
            cube.transform.localScale = scale;
            cube.GetComponent<Renderer>().sharedMaterial = material;
            Object.Destroy(cube.GetComponent<Collider>());
        }

        private static Material MaterialFor(Color color)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            return new Material(shader) { color = color };
        }

        private void OnDestroy()
        {
            if (wood != null) Destroy(wood);
            if (stone != null) Destroy(stone);
            if (fire != null) Destroy(fire);
        }
    }
}
