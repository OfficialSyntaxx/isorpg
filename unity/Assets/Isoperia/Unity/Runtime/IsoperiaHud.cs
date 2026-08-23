using UnityEngine;
using UnityEngine.UIElements;
using Isoperia.Core.Components;
using Isoperia.Core.Save;

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
        private VisualElement panelBody;
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

        private void OpenInventory()
        {
            OpenPanel("Inventory");

            SaveDriver saveDriver = SaveDriver.Instance;
            if (saveDriver == null || saveDriver.State == null || saveDriver.Content == null)
            {
                AddPanelMessage("Inventory is loading.");
                return;
            }

            InventoryComponent inventory = saveDriver.State.Player.Inventory;
            AddPanelMessage($"Stored {inventory.StoredAmount():N0} / {inventory.StorageCap:N0}");

            foreach (ItemStack stack in inventory.Items)
            {
                string icon = saveDriver.Content.File("items")["ITEM_ICONS"][stack.Id].AsString("•");
                string itemName = saveDriver.Content.ItemName(stack.Id);
                AddInventoryRow(icon, itemName, stack.Amount);
            }
        }

        private void OpenMap()
        {
            OpenPanel("Map");
            AddPanelMessage("42 × 42 world · four biome bands · deterministic terrain.");
        }

        private void OpenQuests()
        {
            OpenPanel("Quests");
            AddPanelMessage("Quest data is ready in the Core content database.");
        }

        private void OpenSettings()
        {
            OpenPanel("Settings");
            AddPanelMessage("Input: tap-to-move · drag-pan · pinch/wheel zoom.");
        }

        private void OpenPanel(string title)
        {
            if (panel == null) return;

            panelTitle.text = title;
            panelBody.Clear();
            panel.style.display = DisplayStyle.Flex;
        }

        private void AddPanelMessage(string message)
        {
            var label = new Label(message);
            label.AddToClassList("panel-message");
            panelBody.Add(label);
        }

        private void AddInventoryRow(string icon, string itemName, int amount)
        {
            var row = new VisualElement();
            row.AddToClassList("inventory-row");

            var item = new Label(icon + "  " + itemName);
            item.AddToClassList("inventory-item");
            var count = new Label("×" + amount.ToString("N0"));
            count.AddToClassList("inventory-count");

            row.Add(item);
            row.Add(count);
            panelBody.Add(row);
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
