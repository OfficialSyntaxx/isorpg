using System.Collections.Generic;
using Isoperia.Core.World;
using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>Minimal low-poly combat silhouettes for the live expedition registry.</summary>
    public sealed class WorldCombatView : MonoBehaviour
    {
        private const string OgreAsset = "Art/OwnedModels/monster_forest_ogre";
        private const string WolfAsset = "Art/OwnedModels/cinder_hound_animated";
        private const string RatAsset = "Art/OwnedModels/monster_rat";
        private const string CinderHoundController = "Art/CinderHoundController";
        private readonly Dictionary<WorldEnemyNode, GameObject> views = new Dictionary<WorldEnemyNode, GameObject>();
        private Material ratMaterial;
        private Material goblinMaterial;
        private Material wolfMaterial;
        private readonly Dictionary<WorldEnemyNode, float> hitUntil = new Dictionary<WorldEnemyNode, float>();
        private readonly Dictionary<WorldEnemyNode, Vector3> basePositions = new Dictionary<WorldEnemyNode, Vector3>();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void CreateView()
        {
            if (M0InspectionStartup.IsInspectionScene()) return;
            if (Object.FindAnyObjectByType<WorldCombatView>() != null) return;
            new GameObject(nameof(WorldCombatView)).AddComponent<WorldCombatView>();
        }

        private void Start()
        {
            if (SaveDriver.Instance?.Combat == null) return;
            SaveDriver.Instance.Combat.EnemyChanged += OnEnemyChanged;
            SaveDriver.Instance.Combat.PlayerAttacked += OnPlayerAttacked;
            foreach (WorldEnemyNode enemy in SaveDriver.Instance.Combat.Enemies) Create(enemy);
        }

        private void Update()
        {
            foreach (KeyValuePair<WorldEnemyNode, GameObject> pair in views)
            {
                if (pair.Value == null) continue;
                pair.Value.SetActive(pair.Key.Alive);
                if (!pair.Key.Alive) continue;
                float bob = Mathf.Sin(Time.time * 3f + pair.Key.X) * .012f;
                float hit = hitUntil.TryGetValue(pair.Key, out float until) && Time.time < until
                    ? 1f + Mathf.Sin(Time.time * 26f) * .12f
                    : 1f;
                if (!basePositions.TryGetValue(pair.Key, out Vector3 basePosition))
                    basePosition = pair.Value.transform.localPosition;
                // Presentation-only clearing movement. The Core node remains
                // tile-authoritative, while this small loop prevents enemies
                // from reading as static placement markers in a 3D world.
                float pace = Time.time * .72f + pair.Key.X * .31f + pair.Key.Y * .17f;
                Vector3 wander = new Vector3(Mathf.Sin(pace) * .16f, 0f, Mathf.Cos(pace * .83f) * .10f);
                pair.Value.transform.localPosition = basePosition + wander + Vector3.up * bob;
                pair.Value.transform.localRotation = Quaternion.Euler(0f, Mathf.Sin(pace * .48f) * 24f, 0f);
                pair.Value.transform.localScale = Vector3.one * hit;
                Animator animator = pair.Value.GetComponentInChildren<Animator>();
                if (animator != null) animator.SetFloat("Speed", wander.sqrMagnitude > .002f ? 1f : 0f);
            }
        }

        private void Create(WorldEnemyNode enemy)
        {
            Tile tile = WorldRuntime.Instance.Grid.At(enemy.X, enemy.Y);
            float ground = OpenWorldTerrainView.SurfaceHeight(tile, enemy.X + .5f, enemy.Y + .5f);
            GameObject root = CreateBody(enemy);
            root.name = "Enemy_" + enemy.Name.Replace(" ", "");
            root.transform.SetParent(transform, false);
            root.transform.position = new Vector3(enemy.X + .5f, ground + .28f, enemy.Y + .5f);
            if (root.GetComponent<Collider>() == null)
            {
                CapsuleCollider collider = root.AddComponent<CapsuleCollider>();
                collider.radius = enemy.Id == "dire_wolf" ? .42f : .30f;
                collider.height = enemy.Id == "dire_wolf" ? .72f : .95f;
                collider.center = new Vector3(0f, collider.height * .5f, 0f);
            }
            root.GetComponent<WorldInteractionTarget>()?.SetEnemy(enemy);
            if (root.GetComponent<WorldInteractionTarget>() == null) root.AddComponent<WorldInteractionTarget>().SetEnemy(enemy);
            views[enemy] = root;
            basePositions[enemy] = root.transform.localPosition;
        }

        private GameObject CreateBody(WorldEnemyNode enemy)
        {
            string asset = enemy.Id == "dire_wolf" ? WolfAsset : enemy.Id == "giant_rat" ? RatAsset : enemy.Id == "goblin" ? OgreAsset : null;
            GameObject prefab = asset == null ? null : Resources.Load<GameObject>(asset);
            GameObject root = new GameObject();
            if (prefab != null)
            {
                GameObject model = Instantiate(prefab, root.transform);
                model.transform.localScale = Vector3.one;
                OwnedModelPresentation.FitToHeight(model, enemy.Id == "dire_wolf" ? .95f : 1.75f);
                if (enemy.Id == "dire_wolf")
                {
                    Animator animator = model.GetComponentInChildren<Animator>();
                    if (animator == null) animator = model.AddComponent<Animator>();
                    animator.runtimeAnimatorController = Resources.Load<RuntimeAnimatorController>(CinderHoundController);
                    animator.applyRootMotion = false;
                }
                return root;
            }

            GameObject fallback = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            fallback.transform.SetParent(root.transform, false);
            fallback.transform.localScale = enemy.Id == "dire_wolf"
                ? new Vector3(.42f, .30f, .65f)
                : new Vector3(.30f, .38f, .30f);
            fallback.GetComponent<Renderer>().sharedMaterial = MaterialFor(enemy.Id);
            Destroy(fallback.GetComponent<Collider>());
            return root;
        }

        private Material MaterialFor(string id)
        {
            if (id == "giant_rat") return ratMaterial ?? (ratMaterial = Material(new Color(.48f, .35f, .30f, 1f)));
            if (id == "dire_wolf") return wolfMaterial ?? (wolfMaterial = Material(new Color(.27f, .30f, .34f, 1f)));
            return goblinMaterial ?? (goblinMaterial = Material(new Color(.26f, .52f, .28f, 1f)));
        }

        private static Material Material(Color color)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            return new Material(shader) { color = color };
        }

        private void OnEnemyChanged(WorldEnemyNode enemy)
        {
            if (!views.TryGetValue(enemy, out GameObject view)) Create(enemy);
            else if (view != null) view.SetActive(enemy.Alive);
        }

        private void OnPlayerAttacked(WorldEnemyNode enemy)
        {
            if (enemy != null) hitUntil[enemy] = Time.time + .20f;
        }

        private void OnDestroy()
        {
            if (SaveDriver.Instance?.Combat != null) SaveDriver.Instance.Combat.EnemyChanged -= OnEnemyChanged;
            if (SaveDriver.Instance?.Combat != null) SaveDriver.Instance.Combat.PlayerAttacked -= OnPlayerAttacked;
            if (ratMaterial != null) Destroy(ratMaterial);
            if (goblinMaterial != null) Destroy(goblinMaterial);
            if (wolfMaterial != null) Destroy(wolfMaterial);
        }
    }
}
