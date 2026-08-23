using System.Collections.Generic;
using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>
    /// Builds the first authored settlement district from the imported CC0 town kit.
    /// The layout deliberately creates a market/plaza at the travel crossroads, with
    /// homes behind it and production buildings at the town edge.
    /// </summary>
    public sealed class WorldTownView : MonoBehaviour
    {
        private const string AssetRoot = "Art/KenneyFantasyTown/";
        private readonly List<GameObject> instances = new List<GameObject>();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void CreateTownView()
        {
            if (Object.FindAnyObjectByType<WorldTownView>() != null) return;
            new GameObject(nameof(WorldTownView)).AddComponent<WorldTownView>();
        }

        private void Start()
        {
            BuildSettlement();
        }

        private void OnDestroy()
        {
            for (int i = 0; i < instances.Count; i++)
            {
                if (instances[i] != null) Destroy(instances[i]);
            }
        }

        private void BuildSettlement()
        {
            // The grid is 42x42. The civic core sits on the central high ground,
            // leaving the western forest and the south-east farms accessible.
            const float ground = .18f;
            Vector3 center = new Vector3(21.5f, ground, 21.5f);

            // Main street through the plaza.
            for (int z = 15; z <= 28; z += 2)
                Place("road", center + new Vector3(0f, 0f, z - 21.5f), new Vector3(2f, 1f, 2f));
            for (int x = 15; x <= 28; x += 2)
                Place("road", center + new Vector3(x - 21.5f, .01f, 0f), new Vector3(2f, 1f, 2f), 90f);

            Place("fountain-round", center + new Vector3(0f, .02f, 0f), Vector3.one * 1.35f);
            Place("stall-red", center + new Vector3(-3.5f, 0f, 2.4f), Vector3.one * 1.25f, 180f);
            Place("stall-green", center + new Vector3(3.5f, 0f, -2.4f), Vector3.one * 1.25f);
            Place("lantern", center + new Vector3(-2.2f, 0f, -2.2f), Vector3.one * 1.1f);
            Place("lantern", center + new Vector3(2.2f, 0f, 2.2f), Vector3.one * 1.1f, 180f);

            CreateHouse(center + new Vector3(-6f, 0f, -5f), 90f, 1.25f);
            CreateHouse(center + new Vector3(6f, 0f, -5f), -90f, 1.25f);
            CreateHouse(center + new Vector3(-6f, 0f, 5f), 90f, 1.1f);
            CreateHouse(center + new Vector3(6f, 0f, 5f), -90f, 1.1f);

            // Farms sit to the south-east, outside the market traffic.
            for (int x = 0; x < 4; x++)
            {
                Place("fence", center + new Vector3(8f + x * 1.4f, 0f, 9.4f), Vector3.one * 1.2f);
                Place("fence", center + new Vector3(8f + x * 1.4f, 0f, 13.3f), Vector3.one * 1.2f, 180f);
            }
            Place("windmill", center + new Vector3(10f, 0f, 11f), Vector3.one * 1.45f, -25f);
            Place("watermill", center + new Vector3(-11f, 0f, 8f), Vector3.one * 1.25f, 90f);

            // Trees and stones define the settlement edge instead of blocking paths.
            Place("tree-high", center + new Vector3(-13f, 0f, -10f), Vector3.one * 1.7f);
            Place("tree", center + new Vector3(-12f, 0f, -7f), Vector3.one * 1.35f, 35f);
            Place("tree", center + new Vector3(13f, 0f, -10f), Vector3.one * 1.35f, -20f);
            Place("rock-large", center + new Vector3(-13.5f, 0f, 10f), Vector3.one * 1.3f, 28f);
            Place("rock-small", center + new Vector3(13.5f, 0f, 9f), Vector3.one * 1.2f, -18f);
        }

        private void CreateHouse(Vector3 position, float yaw, float scale)
        {
            Quaternion rotation = Quaternion.Euler(0f, yaw, 0f);
            Vector3 bodyScale = new Vector3(scale * 1.75f, scale * 1.15f, scale * 1.45f);
            Place("wall-wood-door", position, bodyScale, yaw);
            Place("roof-gable", position + new Vector3(0f, scale * .95f, 0f), new Vector3(scale * 1.9f, scale * 1.3f, scale * 1.6f), yaw);
            Place("wall-wood-window-shutters", position + rotation * new Vector3(0f, 0f, scale * .85f), new Vector3(scale * 1.7f, scale, scale), yaw);
        }

        private void Place(string assetName, Vector3 position, Vector3 scale, float yaw = 0f)
        {
            GameObject prefab = Resources.Load<GameObject>(AssetRoot + assetName);
            if (prefab == null) return;

            GameObject instance = Instantiate(prefab, position, Quaternion.Euler(0f, yaw, 0f), transform);
            instance.name = "Town_" + assetName;
            instance.transform.localScale = scale;
            instances.Add(instance);
        }
    }
}
