using System.Collections.Generic;
using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>Bounded, persistent presentation of the authoritative gathering nodes.</summary>
    public sealed class WorldDecorationView : MonoBehaviour
    {
        private const string AssetRoot = "Art/KenneyFantasyTown/";
        private const float RebuildDistance = 2f;
        private readonly Dictionary<string, GameObject> instances = new Dictionary<string, GameObject>();
        private readonly Dictionary<string, GameObject> prefabs = new Dictionary<string, GameObject>();
        private readonly List<WorldResourceNode> nearbyNodes = new List<WorldResourceNode>();
        private readonly HashSet<string> wanted = new HashSet<string>();
        private readonly List<string> retired = new List<string>();
        private WorldResourceRegistry resources;
        private Transform player;
        private Vector3 lastAnchor;
        private bool dirty = true;

        public int VisibleCount => instances.Count;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void CreateDecorationView()
        {
            if (M0InspectionStartup.IsInspectionScene()) return;
            if (Object.FindAnyObjectByType<WorldDecorationView>() != null) return;
            new GameObject(nameof(WorldDecorationView)).AddComponent<WorldDecorationView>();
        }

        private void OnEnable() { dirty = true; }

        private void Update()
        {
            // Scene-load callbacks can run before the save owner has created
            // its registry. Retry binding instead of leaving an empty world.
            WorldResourceRegistry current = SaveDriver.Instance?.Resources;
            if (current != resources)
            {
                Unsubscribe();
                ClearInstances();
                resources = current;
                if (resources != null) resources.NodeChanged += OnNodeChanged;
                dirty = true;
            }
            if (resources == null) return;
            if (player == null) player = GameObject.Find(WorldPlayerAvatarView.AvatarName)?.transform;
            if (player == null) return;
            Vector3 delta = player.position - lastAnchor;
            if (dirty || delta.x * delta.x + delta.z * delta.z >= RebuildDistance * RebuildDistance)
                Rebuild();
        }

        public void Rebuild()
        {
            if (resources == null || player == null || WorldRuntime.Instance == null) return;
            lastAnchor = player.position;
            dirty = false;
            WorldResourceSelection.Select(resources.Nodes, Mathf.FloorToInt(lastAnchor.x),
                Mathf.FloorToInt(lastAnchor.z), nearbyNodes);
            wanted.Clear();
            foreach (WorldResourceNode node in nearbyNodes) wanted.Add(node.Id);
            retired.Clear();
            foreach (var pair in instances)
                if (!wanted.Contains(pair.Key)) retired.Add(pair.Key);
            foreach (string id in retired)
            {
                // Destroy is deferred; disable now so stale colliders cannot
                // intercept another interaction during this frame.
                instances[id].SetActive(false);
                Destroy(instances[id]);
                instances.Remove(id);
            }
            foreach (WorldResourceNode node in nearbyNodes)
            {
                if (instances.ContainsKey(node.Id)) continue;
                GameObject instance = CreateNode(node);
                if (instance != null) instances.Add(node.Id, instance);
            }
        }

        private GameObject CreateNode(WorldResourceNode node)
        {
            var tile = WorldRuntime.Instance.Grid.At(node.X, node.Y);
            float x = node.X + .5f, z = node.Y + .5f;
            float ground = OpenWorldTerrainView.SurfaceHeight(tile, x, z);
            GameObject root = new GameObject("Resource_" + node.Id);
            root.transform.SetParent(transform, false);
            root.transform.position = new Vector3(x, ground, z);
            root.AddComponent<WorldInteractionTarget>().SetResource(node);
            if (node.Type == "WATER")
            {
                CreateFishingSpot(root);
                return root;
            }

            string asset = node.Type == "TREE"
                ? (tile.Seed % 3 == 0 ? "tree-high" : "tree")
                : (node.X % 2 == 0 ? "rock-large" : "rock-small");
            GameObject prefab = LoadApproved(asset);
            if (prefab == null)
            {
                Destroy(root);
                return null;
            }
            GameObject model = Instantiate(prefab, root.transform);
            model.transform.localRotation = Quaternion.Euler(0f, (tile.Seed % 8) * 45f, 0f);
            float height = node.Type == "TREE" ? 4.35f : 1.05f;
            OwnedModelPresentation.FitToHeight(model, height, ground);
            foreach (Collider imported in model.GetComponentsInChildren<Collider>(true))
                imported.enabled = false;
            // Keep interaction dimensions on an unscaled parent. A collider on
            // the normalized imported mesh inherits arbitrary authoring units.
            CapsuleCollider hitbox = root.AddComponent<CapsuleCollider>();
            hitbox.radius = node.Type == "TREE" ? .42f : .58f;
            hitbox.height = node.Type == "TREE" ? 1.9f : 1.16f;
            hitbox.center = Vector3.up * (hitbox.height * .5f);
            return root;
        }

        private GameObject LoadApproved(string name)
        {
            string path = AssetRoot + name;
            if (!WorldAssetAdmission.IsApproved(path)) return null;
            if (prefabs.TryGetValue(path, out GameObject prefab)) return prefab;
            prefab = Resources.Load<GameObject>(path);
            prefabs.Add(path, prefab);
            if (prefab == null) Debug.LogError("[Isoperia] Missing approved resource model: " + path, this);
            return prefab;
        }

        private static void CreateFishingSpot(GameObject root)
        {
            // A shallow ring marks the existing fishing node without importing
            // an unreviewed model or creating a new material for each spot.
            LineRenderer ripple = root.AddComponent<LineRenderer>();
            ripple.useWorldSpace = false;
            ripple.loop = true;
            ripple.positionCount = 24;
            ripple.widthMultiplier = .035f;
            ripple.sharedMaterial = WorldMaterialCache.Lit("FishingRipple", new Color(.35f, .78f, .86f));
            for (int i = 0; i < ripple.positionCount; i++)
            {
                float angle = i * Mathf.PI * 2f / ripple.positionCount;
                ripple.SetPosition(i, new Vector3(Mathf.Cos(angle) * .48f, .07f, Mathf.Sin(angle) * .48f));
            }
            BoxCollider hitbox = root.AddComponent<BoxCollider>();
            hitbox.center = new Vector3(0f, .08f, 0f);
            hitbox.size = new Vector3(1.05f, .16f, 1.05f);
        }

        private void OnNodeChanged(WorldResourceNode node)
        {
            // Ordinary harvests change remaining uses, not geometry. Only a
            // depletion/respawn can change membership in the visible set.
            if (node.Depleted && instances.TryGetValue(node.Id, out GameObject instance))
            {
                instance.SetActive(false);
                Destroy(instance);
                instances.Remove(node.Id);
                dirty = true;
            }
            else if (!node.Depleted && !instances.ContainsKey(node.Id)) dirty = true;
        }

        private void Unsubscribe()
        {
            if (resources != null) resources.NodeChanged -= OnNodeChanged;
            resources = null;
        }

        private void ClearInstances()
        {
            foreach (GameObject instance in instances.Values)
                if (instance != null) { instance.SetActive(false); Destroy(instance); }
            instances.Clear();
        }

        private void OnDisable()
        {
            Unsubscribe();
            ClearInstances();
        }
    }
}
