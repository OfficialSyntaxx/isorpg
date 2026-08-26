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
        private const string VillagerAsset = "Art/OwnedModels/villager";
        private const string OwnedNpcRoot = "Art/OwnedModels/npc_";
        private const string CampfireAsset = "Art/OwnedModels/campfire";
        private const string ForgeAsset = "Art/OwnedModels/hearthvale_forge";
        private const string LocalPropTrialAsset = "Art/OwnedModels/local_prop_trial";
        private const string PlazaFountainAsset = "Art/OwnedModels/hearthvale_plaza_fountain";
        private const string MarketCanopyAsset = "Art/OwnedModels/hearthvale_market_canopy";
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

            PlaceOwnedLandmark(PlazaFountainAsset, "Town_HearthvalePlazaFountain", center + new Vector3(0f, .02f, 0f), 2.0f, 0f,
                () => Place("fountain-round", center + new Vector3(0f, .02f, 0f), Vector3.one * 1.35f));
            PlaceOwnedLandmark(MarketCanopyAsset, "Town_HearthvaleMarketCanopy", center + new Vector3(-3.5f, 0f, 2.4f), 1.75f, 180f,
                () => Place("stall-red", center + new Vector3(-3.5f, 0f, 2.4f), Vector3.one * 1.25f, 180f));
            Place("stall-green", center + new Vector3(3.5f, 0f, -2.4f), Vector3.one * 1.25f);
            Place("lantern", center + new Vector3(-2.2f, 0f, -2.2f), Vector3.one * 1.1f);
            Place("lantern", center + new Vector3(2.2f, 0f, 2.2f), Vector3.one * 1.1f, 180f);
            CreateNpc("Forester Elowen", "Gather 15 logs and return to the plaza.", center + new Vector3(-2.8f, .7f, 1.2f), new Color(.31f, .55f, .28f));
            CreateNpc("Cook Bram", "Cook a shrimp at your campfire.", center + new Vector3(2.8f, .7f, -1.2f), new Color(.73f, .39f, .22f));
            CreateJourneyNpc("Wayfinder Nahl", "Lantern Road accepted · follow the eastern lights to Cinder Hollow, then return.",
                center + new Vector3(6.8f, .7f, .7f), new Color(.82f, .66f, .22f));

            // Four readable, larger homes establish a proper residential ring.
            // The former procedural lanes overlapped the plaza sightlines and
            // turned each home into three tiny disconnected mesh fragments.
            CreateHouse(center + new Vector3(-8.5f, 0f, -6.8f), 90f, 1.62f);
            CreateHouse(center + new Vector3(8.5f, 0f, -6.8f), -90f, 1.62f);
            CreateHouse(center + new Vector3(-8.5f, 0f, 7.2f), 90f, 1.46f);
            CreateHouse(center + new Vector3(8.5f, 0f, 7.2f), -90f, 1.46f);

            // The north-west yard anchors the forest route with storage and a
            // working watermill, instead of ending the town in loose props.
            CreateWorkshop(center + new Vector3(-14f, 0f, -1.5f), 90f);
            Place("fence", center + new Vector3(-10.5f, 0f, -3.8f), Vector3.one * 1.3f, 90f);
            Place("fence", center + new Vector3(-13.5f, 0f, .9f), Vector3.one * 1.3f);

            // Farms sit to the south-east, outside the market traffic.
            for (int x = 0; x < 4; x++)
            {
                Place("fence", center + new Vector3(8f + x * 1.4f, 0f, 9.4f), Vector3.one * 1.2f);
                Place("fence", center + new Vector3(8f + x * 1.4f, 0f, 13.3f), Vector3.one * 1.2f, 180f);
            }
            Place("windmill", center + new Vector3(12.5f, 0f, 13.5f), Vector3.one * 1.7f, -25f);
            CreateField(center + new Vector3(9.8f, 0f, 17f));
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
            // The previous forge export reads as a huge siege engine at the
            // town camera distance. Keep this edge space clear until its
            // replacement is modeled to the settlement scale.
            Place("fence", origin + new Vector3(1.8f, 0f, 2.2f), Vector3.one * 1.35f, yaw);
            Place("rock-small", origin + new Vector3(-2.0f, 0f, -1.7f), Vector3.one * .95f, 27f);
        }

        private void PlaceForge(Vector3 position, float yaw)
        {
            GameObject prefab = Resources.Load<GameObject>(ForgeAsset);
            if (prefab == null)
            {
                CreateHouse(position, yaw, 1.35f);
                Place("watermill", position + new Vector3(-2.2f, 0f, 1.8f), Vector3.one * 1.05f, yaw);
                return;
            }

            GameObject instance = Instantiate(prefab, position, Quaternion.Euler(0f, yaw, 0f), transform);
            instance.name = "Town_HearthvaleForge";
            ApplyForgePalette(instance);
            instances.Add(instance);
        }

        private void PlaceOwnedLandmark(string assetPath, string instanceName, Vector3 position, float height, float yaw, System.Action fallback)
        {
            GameObject prefab = Resources.Load<GameObject>(assetPath);
            if (prefab == null)
            {
                fallback();
                return;
            }

            GameObject instance = Instantiate(prefab, position, Quaternion.Euler(0f, yaw, 0f), transform);
            instance.name = instanceName;
            OwnedModelPresentation.FitToHeight(instance, height);
            ApplyOwnedLandmarkPalette(instance);
            instances.Add(instance);
        }

        private static void ApplyOwnedLandmarkPalette(GameObject instance)
        {
            foreach (Renderer renderer in instance.GetComponentsInChildren<Renderer>(true))
            {
                Material[] source = renderer.sharedMaterials;
                Material[] palette = new Material[source.Length];
                for (int i = 0; i < source.Length; i++)
                {
                    string name = source[i] == null ? string.Empty : source[i].name;
                    bool glow = name.Contains("Glow") || name.Contains("Rune") || name.Contains("Lantern");
                    Color color = name.Contains("Water") ? new Color(.04f, .30f, .48f) :
                        name.Contains("Cloth") ? new Color(.15f, .30f, .48f) :
                        name.Contains("Wood") ? new Color(.19f, .07f, .025f) :
                        name.Contains("Trim") ? new Color(.38f, .25f, .11f) :
                        glow ? new Color(.14f, .72f, .92f) : new Color(.18f, .22f, .26f);
                    palette[i] = WorldMaterialCache.Lit("Phase4_" + name, color, glow);
                }
                renderer.sharedMaterials = palette;
            }
        }

        private void ApplyForgePalette(GameObject instance)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            foreach (Renderer renderer in instance.GetComponentsInChildren<Renderer>(true))
            {
                Material[] source = renderer.sharedMaterials;
                Material[] palette = new Material[source.Length];
                for (int i = 0; i < source.Length; i++)
                {
                    string name = source[i] == null ? string.Empty : source[i].name;
                    Color color = name.Contains("Timber") ? new Color(.16f, .065f, .022f) :
                        name.Contains("Plaster") ? new Color(.56f, .44f, .28f) :
                        name.Contains("Roof") ? new Color(.12f, .16f, .20f) :
                        name.Contains("Iron") ? new Color(.12f, .15f, .18f) :
                        name.Contains("Ember") ? new Color(1f, .20f, .025f) : new Color(.20f, .22f, .25f);
                    palette[i] = WorldMaterialCache.Lit("Forge_" + name, color, name.Contains("Ember"));
                }
                renderer.sharedMaterials = palette;
            }
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
            GameObject npc = CreateNpcBody(name, position, color);
            npc.AddComponent<WorldInteractionTarget>().SetNpc(name, hint);
            npc.AddComponent<WorldNpcAmbientView>();
            instances.Add(npc);
        }

        private void CreateJourneyNpc(string name, string hint, Vector3 position, Color color)
        {
            GameObject npc = CreateNpcBody(name, position, color);
            WorldInteractionTarget target = npc.AddComponent<WorldInteractionTarget>();
            target.SetNpc(name, hint);
            target.SetJourney(LightPoolExpeditionSystem.AcceptedJournalId);
            npc.AddComponent<WorldNpcAmbientView>();
            instances.Add(npc);
        }

        private GameObject CreateNpcBody(string name, Vector3 position, Color fallbackColor)
        {
            // The available NPC source meshes are raw production studies with
            // inconsistent origins and scale. A deliberately simple, grounded
            // town-contact silhouette is clearer and safer until the shared
            // rigged NPC set is finished.
            GameObject fallback = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            fallback.name = "NPC_" + name.Replace(" ", string.Empty);
            fallback.transform.SetParent(transform, false);
            fallback.transform.position = position;
            fallback.transform.localScale = new Vector3(.34f, .65f, .34f);
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            Material material = new Material(shader) { color = fallbackColor };
            runtimeMaterials.Add(material);
            fallback.GetComponent<Renderer>().sharedMaterial = material;
            GameObject head = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            head.name = "Head";
            head.transform.SetParent(fallback.transform, false);
            head.transform.localPosition = new Vector3(0f, 1.02f, 0f);
            head.transform.localScale = Vector3.one * .72f;
            Material skinMaterial = new Material(shader) { color = new Color(.72f, .48f, .31f) };
            head.GetComponent<Renderer>().sharedMaterial = skinMaterial;
            runtimeMaterials.Add(skinMaterial);
            Destroy(head.GetComponent<Collider>());
            return fallback;
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

        private void PlaceCampfire(Vector3 position)
        {
            GameObject prefab = Resources.Load<GameObject>(CampfireAsset);
            if (prefab == null) return;
            GameObject instance = Instantiate(prefab, position, Quaternion.identity, transform);
            instance.name = "Town_HearthvaleCampfire";
            OwnedModelPresentation.FitToHeight(instance, .9f);
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            foreach (Renderer renderer in instance.GetComponentsInChildren<Renderer>(true))
            {
                Material[] source = renderer.sharedMaterials;
                Material[] palette = new Material[source.Length];
                for (int i = 0; i < source.Length; i++)
                {
                    string name = source[i] == null ? string.Empty : source[i].name;
                    Color color = name.Contains("Stone") ? new Color(.20f, .22f, .24f) :
                        name.Contains("Wood") ? new Color(.20f, .07f, .02f) :
                        name.Contains("Ember") ? new Color(.88f, .18f, .025f) : new Color(1f, .46f, .04f);
                    palette[i] = WorldMaterialCache.Lit("Campfire_" + name, color, !name.Contains("Stone") && !name.Contains("Wood"));
                }
                renderer.sharedMaterials = palette;
            }
            instances.Add(instance);
        }

        private void PlaceLocalPropTrial(Vector3 position, float scale, float yaw)
        {
            GameObject prefab = Resources.Load<GameObject>(LocalPropTrialAsset);
            if (prefab == null) return;

            GameObject instance = Instantiate(prefab, position, Quaternion.Euler(0f, yaw, 0f), transform);
            instance.name = "Town_EastRoadLanternAndCrate";
            instance.transform.localScale = Vector3.one * scale;
            ApplyLocalPropTrialPalette(instance);
            instances.Add(instance);
        }

        private static void ApplyLocalPropTrialPalette(GameObject instance)
        {
            foreach (Renderer renderer in instance.GetComponentsInChildren<Renderer>(true))
            {
                Material[] source = renderer.sharedMaterials;
                Material[] palette = new Material[source.Length];
                for (int i = 0; i < source.Length; i++)
                {
                    string name = source[i] == null ? string.Empty : source[i].name;
                    Color color = name.Contains("WarmWood") ? new Color(.25f, .10f, .035f) :
                        name.Contains("DarkIron") ? new Color(.045f, .055f, .07f) :
                        name.Contains("AmberGlass") ? new Color(1f, .22f, .025f) : new Color(.18f, .20f, .22f);
                    palette[i] = WorldMaterialCache.Lit("LocalTrial_" + name, color, name.Contains("AmberGlass"));
                }
                renderer.sharedMaterials = palette;
            }
        }
    }
}
