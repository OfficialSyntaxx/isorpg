using System.Collections.Generic;
using UnityEngine;
using CoreGrid = Isoperia.Core.World.Grid;

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
        private readonly List<Material> runtimeMaterials = new List<Material>();

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
            for (int i = 0; i < runtimeMaterials.Count; i++)
                if (runtimeMaterials[i] != null) Destroy(runtimeMaterials[i]);
        }

        private void BuildSettlement()
        {
            // Hearthvale sits in the mainland's central 18x18 district. The
            // composition is relative to the authoritative center, never a
            // retired prototype-island coordinate.
            const float ground = .18f;
            Vector3 center = new Vector3(CoreGrid.TownCenter + .5f, ground, CoreGrid.TownCenter + .5f);

            // Main street through the plaza.
            for (int z = 10; z <= 33; z += 2)
                Place("road", center + new Vector3(0f, 0f, z - 21.5f), new Vector3(2f, 1f, 2f));
            for (int x = 10; x <= 33; x += 2)
                Place("road", center + new Vector3(x - 21.5f, .01f, 0f), new Vector3(2f, 1f, 2f), 90f);

            Place("fountain-round", center + new Vector3(0f, .02f, 0f), Vector3.one * 1.35f);
            Place("stall-red", center + new Vector3(-3.5f, 0f, 2.4f), Vector3.one * 1.25f, 180f);
            Place("stall-green", center + new Vector3(3.5f, 0f, -2.4f), Vector3.one * 1.25f);
            Place("lantern", center + new Vector3(-2.2f, 0f, -2.2f), Vector3.one * 1.1f);
            Place("lantern", center + new Vector3(2.2f, 0f, 2.2f), Vector3.one * 1.1f, 180f);
            CreateNpc("Forester Elowen", "Gather 15 logs and return to the plaza.", center + new Vector3(-2.8f, .7f, 1.2f), new Color(.31f, .55f, .28f));
            CreateNpc("Cook Bram", "Cook a shrimp at your campfire.", center + new Vector3(2.8f, .7f, -1.2f), new Color(.73f, .39f, .22f));
            CreateJourneyNpc("Wayfinder Nahl", "Lantern Road accepted · follow the eastern lights to Cinder Hollow, then return.",
                center + new Vector3(6.8f, .7f, .7f), new Color(.82f, .66f, .22f));

            CreateHouse(center + new Vector3(-6f, 0f, -5f), 90f, 1.25f);
            CreateHouse(center + new Vector3(6f, 0f, -5f), -90f, 1.25f);
            CreateHouse(center + new Vector3(-6f, 0f, 5f), 90f, 1.1f);
            CreateHouse(center + new Vector3(6f, 0f, 5f), -90f, 1.1f);
            CreateResidentialLane(center + new Vector3(-10.5f, 0f, -7.8f), 90f, 3);
            CreateResidentialLane(center + new Vector3(10.5f, 0f, -7.8f), -90f, 3);
            CreateResidentialLane(center + new Vector3(-10.5f, 0f, 7.8f), 90f, 2);
            CreateResidentialLane(center + new Vector3(10.5f, 0f, 7.8f), -90f, 2);

            // The north-west yard anchors the forest route with storage and a
            // working watermill, instead of ending the town in loose props.
            CreateWorkshop(center + new Vector3(-12f, 0f, -1.5f), 90f);
            Place("fence", center + new Vector3(-10.5f, 0f, -3.8f), Vector3.one * 1.3f, 90f);
            Place("fence", center + new Vector3(-13.5f, 0f, .9f), Vector3.one * 1.3f);

            // Farms sit to the south-east, outside the market traffic.
            for (int x = 0; x < 4; x++)
            {
                Place("fence", center + new Vector3(8f + x * 1.4f, 0f, 9.4f), Vector3.one * 1.2f);
                Place("fence", center + new Vector3(8f + x * 1.4f, 0f, 13.3f), Vector3.one * 1.2f, 180f);
            }
            Place("windmill", center + new Vector3(10f, 0f, 11f), Vector3.one * 1.45f, -25f);
            CreateField(center + new Vector3(8.5f, 0f, 14.5f));
            CreateField(center + new Vector3(13.2f, 0f, 14.5f));
            CreateNpc("Scout Tamsin", "Defeat a Giant Rat on the eastern route.", center + new Vector3(8f, .7f, 7f), new Color(.28f, .40f, .70f));
            Place("watermill", center + new Vector3(-11f, 0f, 8f), Vector3.one * 1.25f, 90f);

            // Trees and stones define the settlement edge instead of blocking paths.
            Place("tree-high", center + new Vector3(-13f, 0f, -10f), Vector3.one * 1.7f);
            Place("tree", center + new Vector3(-12f, 0f, -7f), Vector3.one * 1.35f, 35f);
            Place("tree", center + new Vector3(13f, 0f, -10f), Vector3.one * 1.35f, -20f);
            Place("rock-large", center + new Vector3(-13.5f, 0f, 10f), Vector3.one * 1.3f, 28f);
            Place("rock-small", center + new Vector3(13.5f, 0f, 9f), Vector3.one * 1.2f, -18f);
        }

        private void CreateResidentialLane(Vector3 origin, float yaw, int homes)
        {
            for (int i = 0; i < homes; i++)
            {
                float scale = i == 0 ? 1.18f : 1.02f;
                CreateHouse(origin + new Vector3(0f, 0f, i * 3.7f), yaw, scale);
                Place("fence", origin + new Vector3(yaw > 0f ? -1.9f : 1.9f, 0f, i * 3.7f + 1.3f),
                    Vector3.one * 1.1f, yaw);
            }
        }

        private void CreateWorkshop(Vector3 origin, float yaw)
        {
            CreateHouse(origin, yaw, 1.35f);
            Place("watermill", origin + new Vector3(-2.2f, 0f, 1.8f), Vector3.one * 1.05f, yaw);
            Place("fence", origin + new Vector3(1.8f, 0f, 2.2f), Vector3.one * 1.35f, yaw);
            Place("rock-small", origin + new Vector3(-2.0f, 0f, -1.7f), Vector3.one * .95f, 27f);
        }

        private void CreateField(Vector3 origin)
        {
            for (int z = 0; z < 3; z++)
            for (int x = 0; x < 3; x++)
            {
                Place("fence", origin + new Vector3(x * 1.2f, 0f, z * 1.2f), Vector3.one * .72f,
                    (x + z) % 2 == 0 ? 0f : 90f);
            }
        }

        private void CreateHouse(Vector3 position, float yaw, float scale)
        {
            Quaternion rotation = Quaternion.Euler(0f, yaw, 0f);
            Vector3 bodyScale = new Vector3(scale * 1.75f, scale * 1.15f, scale * 1.45f);
            Place("wall-wood-door", position, bodyScale, yaw);
            Place("roof-gable", position + new Vector3(0f, scale * .95f, 0f), new Vector3(scale * 1.9f, scale * 1.3f, scale * 1.6f), yaw);
            Place("wall-wood-window-shutters", position + rotation * new Vector3(0f, 0f, scale * .85f), new Vector3(scale * 1.7f, scale, scale), yaw);
        }

        private void CreateNpc(string name, string hint, Vector3 position, Color color)
        {
            GameObject npc = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            npc.name = "NPC_" + name.Replace(" ", string.Empty);
            npc.transform.SetParent(transform, false);
            npc.transform.position = position;
            npc.transform.localScale = new Vector3(.34f, .65f, .34f);
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            Material material = new Material(shader) { color = color };
            runtimeMaterials.Add(material);
            npc.GetComponent<Renderer>().sharedMaterial = material;
            npc.AddComponent<WorldInteractionTarget>().SetNpc(name, hint);
            instances.Add(npc);
        }

        private void CreateJourneyNpc(string name, string hint, Vector3 position, Color color)
        {
            GameObject npc = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            npc.name = "NPC_" + name.Replace(" ", string.Empty);
            npc.transform.SetParent(transform, false);
            npc.transform.position = position;
            npc.transform.localScale = new Vector3(.36f, .70f, .36f);
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            Material material = new Material(shader) { color = color };
            runtimeMaterials.Add(material);
            npc.GetComponent<Renderer>().sharedMaterial = material;
            WorldInteractionTarget target = npc.AddComponent<WorldInteractionTarget>();
            target.SetNpc(name, hint);
            target.SetJourney(LightPoolExpeditionSystem.AcceptedJournalId);
            instances.Add(npc);
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
