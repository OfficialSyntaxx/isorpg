using System.Collections.Generic;
using Isoperia.Core.State;
using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>Presentation for player-built Core structures using the CC0 town kit.</summary>
    public sealed class WorldBuildingView : MonoBehaviour
    {
        private const string AssetRoot = "Art/KenneyFantasyTown/";
        private const string CampfireAsset = "Art/OwnedModels/campfire";
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
            switch (building.Type)
            {
                case "CAMPFIRE":
                    CreateCampfire(root.transform);
                    break;
                case "SMELTER":
                    Place(root.transform, "rock-large", new Vector3(0f, .1f, 0f), .65f, 25f);
                    AddCube(root.transform, new Vector3(0, .62f, 0), new Vector3(.23f, .45f, .23f), fire);
                    break;
                case "SAWMILL":
                    Place(root.transform, "windmill", Vector3.zero, .72f, 0f);
                    break;
                case "FARM_PLOT":
                    CreateFarmPlot(root.transform);
                    break;
                case "STORAGE_BIN":
                    CreateStorehouse(root.transform, .5f);
                    break;
                default:
                    CreateStorehouse(root.transform, .72f);
                    break;
            }
        }

        private void CreateCampfire(Transform parent)
        {
            GameObject prefab = Resources.Load<GameObject>(CampfireAsset);
            if (prefab != null)
            {
                GameObject campfire = Instantiate(prefab, parent);
                campfire.name = "BuildingModel_Campfire";
                campfire.transform.localPosition = Vector3.zero;
                campfire.transform.localRotation = Quaternion.identity;
                OwnedModelPresentation.FitToHeight(campfire, .9f);
                return;
            }
            AddCube(parent, new Vector3(-.18f, .12f, 0f), new Vector3(.68f, .12f, .16f), wood, 35f);
            AddCube(parent, new Vector3(.18f, .12f, 0f), new Vector3(.68f, .12f, .16f), wood, -35f);
            AddCube(parent, new Vector3(0f, .34f, 0f), new Vector3(.22f, .42f, .22f), fire);
        }

        private void CreateFarmPlot(Transform parent)
        {
            for (int i = -1; i <= 1; i++)
                Place(parent, "fence", new Vector3(i * .32f, 0f, .34f), .45f, 0f);
            Place(parent, "fence", new Vector3(-.48f, 0f, 0f), .45f, 90f);
            Place(parent, "fence", new Vector3(.48f, 0f, 0f), .45f, 90f);
        }

        private void CreateStorehouse(Transform parent, float scale)
        {
            Place(parent, "wall-wood-door", Vector3.zero, scale, 0f);
            Place(parent, "roof-gable", new Vector3(0f, scale * .8f, 0f), scale * 1.08f, 0f);
        }

        private void Place(Transform parent, string assetName, Vector3 localPosition, float scale, float yaw)
        {
            GameObject prefab = Resources.Load<GameObject>(AssetRoot + assetName);
            if (prefab == null) return;
            GameObject instance = Instantiate(prefab, parent);
            instance.name = "BuildingModel_" + assetName;
            instance.transform.localPosition = localPosition;
            instance.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
            instance.transform.localScale = Vector3.one * scale;
        }

        private static void AddCube(Transform parent, Vector3 localPosition, Vector3 scale, Material material, float yaw = 0f)
        {
            GameObject cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
            cube.transform.SetParent(parent, false);
            cube.transform.localPosition = localPosition;
            cube.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
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
