using System.Collections.Generic;
using Isoperia.Core.World;
using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>Minimal low-poly combat silhouettes for the live expedition registry.</summary>
    public sealed class WorldCombatView : MonoBehaviour
    {
        private const string OgreAsset = "Art/OwnedModels/forest_ogre";
        private const string WolfAsset = "Art/OwnedModels/dire_wolf";
        private readonly Dictionary<WorldEnemyNode, GameObject> views = new Dictionary<WorldEnemyNode, GameObject>();
        private Material ratMaterial;
        private Material goblinMaterial;
        private Material wolfMaterial;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void CreateView()
        {
            if (Object.FindAnyObjectByType<WorldCombatView>() != null) return;
            new GameObject(nameof(WorldCombatView)).AddComponent<WorldCombatView>();
        }

        private void Start()
        {
            if (SaveDriver.Instance?.Combat == null) return;
            SaveDriver.Instance.Combat.EnemyChanged += OnEnemyChanged;
            foreach (WorldEnemyNode enemy in SaveDriver.Instance.Combat.Enemies) Create(enemy);
        }

        private void Update()
        {
            foreach (KeyValuePair<WorldEnemyNode, GameObject> pair in views)
            {
                if (pair.Value == null) continue;
                pair.Value.SetActive(pair.Key.Alive);
                if (pair.Key.Alive) pair.Value.transform.localPosition += Vector3.up * (Mathf.Sin(Time.time * 3f + pair.Key.X) * .0008f);
            }
        }

        private void Create(WorldEnemyNode enemy)
        {
            Tile tile = WorldRuntime.Instance.Grid.At(enemy.X, enemy.Y);
            float ground = .04f + (float)tile.Elevation;
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
        }

        private GameObject CreateBody(WorldEnemyNode enemy)
        {
            string asset = enemy.Id == "dire_wolf" ? WolfAsset : enemy.Id == "goblin" ? OgreAsset : null;
            GameObject prefab = asset == null ? null : Resources.Load<GameObject>(asset);
            if (prefab != null)
            {
                GameObject model = Instantiate(prefab);
                model.transform.localScale = enemy.Id == "dire_wolf"
                    ? new Vector3(.52f, .36f, .62f)
                    : Vector3.one * .58f;
                return model;
            }

            GameObject fallback = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            fallback.transform.localScale = enemy.Id == "dire_wolf"
                ? new Vector3(.42f, .30f, .65f)
                : new Vector3(.30f, .38f, .30f);
            fallback.GetComponent<Renderer>().sharedMaterial = MaterialFor(enemy.Id);
            return fallback;
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

        private void OnDestroy()
        {
            if (SaveDriver.Instance?.Combat != null) SaveDriver.Instance.Combat.EnemyChanged -= OnEnemyChanged;
            if (ratMaterial != null) Destroy(ratMaterial);
            if (goblinMaterial != null) Destroy(goblinMaterial);
            if (wolfMaterial != null) Destroy(wolfMaterial);
        }
    }
}
