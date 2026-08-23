using UnityEngine;
using UnityEngine.UIElements;

namespace Isoperia.Unity
{
    /// <summary>
    /// Bootstrap UI Toolkit shell for the Unity migration.
    /// The view owns only presentation and navigation state; gameplay remains in
    /// Isoperia.Core and the world input components.
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public sealed class IsoperiaHud : MonoBehaviour
    {
        private const string HudName = "IsoperiaHUD";
        private const string DocumentResource = "UI/IsoperiaHUD";
        private const string StyleResource = "UI/IsoperiaHUD";

        private UIDocument document;
        private PanelSettings panelSettings;
        private VisualElement panel;
        private Label panelTitle;
        private Label panelBody;
        private Button closePanel;
        private Button inventoryButton;
        private Button mapButton;
        private Button questButton;
        private Button settingsButton;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void CreateBootstrapHud()
        {
            if (GameObject.Find(HudName) != null) return;

            var hud = new GameObject(HudName);
            hud.AddComponent<IsoperiaHud>();
        }

        private void Awake()
        {
            gameObject.name = HudName;
            document = GetComponent<UIDocument>();
            document.visualTreeAsset = Resources.Load<VisualTreeAsset>(DocumentResource);

            panelSettings = ScriptableObject.CreateInstance<PanelSettings>();
            panelSettings.scaleMode = PanelScaleMode.ScaleWithScreenSize;
            panelSettings.referenceResolution = new Vector2Int(1080, 1920);
            panelSettings.screenMatchMode = PanelScreenMatchMode.MatchWidthOrHeight;
            panelSettings.match = 0.5f;
            document.panelSettings = panelSettings;
        }

        private void Start()
        {
            VisualElement root = document.rootVisualElement;
            if (root == null)
            {
                Debug.LogError("Isoperia HUD could not create its UI Toolkit root.", this);
                return;
            }

            StyleSheet style = Resources.Load<StyleSheet>(StyleResource);
            if (style != null) root.styleSheets.Add(style);

            panel = root.Q<VisualElement>("panel");
            panelTitle = root.Q<Label>("panel-title");
            panelBody = root.Q<Label>("panel-body");
            closePanel = root.Q<Button>("close-panel");
            inventoryButton = root.Q<Button>("inventory-button");
            mapButton = root.Q<Button>("map-button");
            questButton = root.Q<Button>("quest-button");
            settingsButton = root.Q<Button>("settings-button");

            closePanel.clicked += ClosePanel;
            inventoryButton.clicked += OpenInventory;
            mapButton.clicked += OpenMap;
            questButton.clicked += OpenQuests;
            settingsButton.clicked += OpenSettings;
        }

        private void OpenInventory() => OpenPanel("Inventory", "The Core inventory panel is next in the Phase 3 migration.");

        private void OpenMap() => OpenPanel("Map", "42 × 42 world · four biome bands · deterministic terrain.");

        private void OpenQuests() => OpenPanel("Quests", "Quest data is already available through the Core content database.");

        private void OpenSettings() => OpenPanel("Settings", "Input: tap-to-move · drag-pan · pinch/wheel zoom.");

        private void OpenPanel(string title, string body)
        {
            if (panel == null) return;

            panelTitle.text = title;
            panelBody.text = body;
            panel.style.display = DisplayStyle.Flex;
        }

        private void ClosePanel()
        {
            if (panel != null) panel.style.display = DisplayStyle.None;
        }

        private void OnDestroy()
        {
            if (closePanel != null) closePanel.clicked -= ClosePanel;
            if (inventoryButton != null) inventoryButton.clicked -= OpenInventory;
            if (mapButton != null) mapButton.clicked -= OpenMap;
            if (questButton != null) questButton.clicked -= OpenQuests;
            if (settingsButton != null) settingsButton.clicked -= OpenSettings;

            if (panelSettings != null) Destroy(panelSettings);
        }
    }
}
