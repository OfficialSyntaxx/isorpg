using UnityEngine;
using UnityEngine.UIElements;
using Isoperia.Core.Components;
using Isoperia.Core.Data;
using Isoperia.Core.Save;
using Isoperia.Core.State;
using Isoperia.Core.Systems;
using Isoperia.Core.World;

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
        private const string ThemeResource = "UI/IsoperiaRuntimeTheme";

        private UIDocument document;
        private PanelSettings panelSettings;
        private VisualElement panel;
        private Label panelTitle;
        private VisualElement panelBody;
        private Button closePanel;
        private Button inventoryButton;
        private Button skillsButton;
        private Button craftButton;
        private Button buildButton;
        private Button mapButton;
        private Button questButton;
        private Button settingsButton;
        private Label worldStatus;
        private Label combatStatus;
        private Label hintBody;
        private string displayedGatheringStatus;

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
            panelSettings.themeStyleSheet = Resources.Load<ThemeStyleSheet>(ThemeResource);
            if (panelSettings.themeStyleSheet == null)
            {
                Debug.LogError(
                    "Isoperia HUD cannot find its runtime UI theme. " +
                    "Run Isoperia/Create runtime UI theme before entering Play Mode.", this);
            }
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
            panelBody = root.Q<VisualElement>("panel-body");
            closePanel = root.Q<Button>("close-panel");
            inventoryButton = root.Q<Button>("inventory-button");
            skillsButton = root.Q<Button>("skills-button");
            craftButton = root.Q<Button>("craft-button");
            buildButton = root.Q<Button>("build-button");
            mapButton = root.Q<Button>("map-button");
            questButton = root.Q<Button>("quest-button");
            settingsButton = root.Q<Button>("settings-button");
            worldStatus = root.Q<Label>("world-status");
            combatStatus = root.Q<Label>("combat-status");
            hintBody = root.Q<Label>("hint-body");

            closePanel.clicked += ClosePanel;
            inventoryButton.clicked += OpenInventory;
            skillsButton.clicked += OpenSkills;
            craftButton.clicked += OpenCraft;
            buildButton.clicked += OpenBuild;
            mapButton.clicked += OpenMap;
            questButton.clicked += OpenQuests;
            settingsButton.clicked += OpenSettings;
        }

        private void Update()
        {
            UpdateCombatStatus();
            string status = SaveDriver.Instance?.GatheringStatus;
            if (string.IsNullOrEmpty(status) || status == displayedGatheringStatus) return;

            displayedGatheringStatus = status;
            if (worldStatus != null) worldStatus.text = status.ToUpperInvariant();
            if (hintBody != null) hintBody.text = status;
        }

        private void UpdateCombatStatus()
        {
            if (combatStatus == null) return;
            var player = SaveDriver.Instance?.State?.Player;
            if (player == null || player.Health == null) return;
            WorldEnemyNode target = SaveDriver.Instance?.Combat?.Target;
            combatStatus.text = target == null
                ? "HP " + player.Health.Hp + "/" + player.Health.MaxHp + " · No target"
                : "HP " + player.Health.Hp + "/" + player.Health.MaxHp + " · " + target.Name + " " + target.Hp + "/" + target.Definition.Hp;
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

            WorldRuntime world = WorldRuntime.Instance;
            if (world == null || world.Grid == null)
            {
                AddPanelMessage("World map is loading.");
                return;
            }

            int playerX = SaveDriver.Instance?.State?.Player?.Pos?.Gx ?? -1;
            int playerY = SaveDriver.Instance?.State?.Player?.Pos?.Gy ?? -1;
            const int chunkSize = Isoperia.Core.World.Grid.GridChunk;
            int columns = Mathf.CeilToInt(world.Grid.Width / (float)chunkSize);
            int rows = Mathf.CeilToInt(world.Grid.Height / (float)chunkSize);
            AddPanelMessage($"{world.Grid.Width} × {world.Grid.Height} mainland survey · gold marks your position · dark areas remain uncharted.");

            var map = new VisualElement();
            map.AddToClassList("map-grid");
            map.style.position = Position.Relative;

            for (int chunkY = 0; chunkY < rows; chunkY++)
            {
                for (int chunkX = 0; chunkX < columns; chunkX++)
                {
                    var cell = new VisualElement();
                    cell.AddToClassList("map-cell");
                    int minX = chunkX * chunkSize;
                    int minY = chunkY * chunkSize;
                    int maxX = Mathf.Min(world.Grid.Width, minX + chunkSize);
                    int maxY = Mathf.Min(world.Grid.Height, minY + chunkSize);
                    bool containsPlayer = playerX >= minX && playerX < maxX && playerY >= minY && playerY < maxY;
                    bool explored = ContainsExploredTile(SaveDriver.Instance?.State?.Player?.MapExplored, world.Grid.Width, minX, minY, maxX, maxY);
                    cell.style.backgroundColor = explored || containsPlayer
                        ? ChunkTerrainColor(world.Grid, minX, minY, maxX, maxY)
                        : new Color(.055f, .07f, .08f, 1f);

                    if (containsPlayer)
                    {
                        cell.AddToClassList("map-player");
                        cell.style.backgroundColor = new Color(0.96f, 0.77f, 0.36f, 1f);
                    }

                    map.Add(cell);
                }
            }

            AddDistrictMarker(map, "Hearthvale", "hearthvale", 63, 63);
            AddDistrictMarker(map, "Wildwood", "wildwood", 33, 36);
            AddDistrictMarker(map, "Frostwatch", "frostwatch", 92, 35);
            AddDistrictMarker(map, "Ember Road", "ember_road", 93, 63);
            AddDistrictMarker(map, "Sunmere", "sunmere", 93, 93);
            AddDistrictMarker(map, "Miregate", "miregate", 34, 92);
            panelBody.Add(map);

            SaveDriver save = SaveDriver.Instance;
            if (save?.State?.Player?.MapFastTravel == true)
            {
                AddSettingButton("Return to Hearthvale", ReturnToHearthvale);
            }
            else
            {
                AddPanelMessage("Attune an outer-route waystone to unlock a safe return to Hearthvale.");
            }
        }

        private void AddDistrictMarker(VisualElement map, string label, string districtId, int x, int y)
        {
            var discovered = SaveDriver.Instance?.State?.Player?.MapDiscovered;
            if (discovered == null || !discovered.Contains(districtId)) return;

            const float mapSize = 294f;
            const float mainlandSize = Isoperia.Core.World.Grid.WorldSize;
            var marker = new Label(label);
            marker.AddToClassList("map-district-marker");
            marker.style.left = Mathf.Clamp((x / mainlandSize) * mapSize - 31f, 2f, mapSize - 64f);
            marker.style.top = Mathf.Clamp((y / mainlandSize) * mapSize - 10f, 2f, mapSize - 22f);
            map.Add(marker);
        }

        private void ReturnToHearthvale()
        {
            OpenWorldPlayerController controller = GameObject.Find(WorldPlayerAvatarView.AvatarName)
                ?.GetComponent<OpenWorldPlayerController>();
            if (controller == null || !controller.TryTeleportTo(Isoperia.Core.World.Grid.TownCenter, Isoperia.Core.World.Grid.TownCenter))
            {
                AddPanelMessage("Hearthvale return is unavailable right now.");
                return;
            }

            SaveDriver.Instance?.ShowStatus("Returned to Hearthvale");
            SaveDriver.Instance?.Save?.ForceSave();
            ClosePanel();
        }

        private static bool ContainsExploredTile(System.Collections.Generic.List<double> explored, int width,
            int minX, int minY, int maxX, int maxY)
        {
            if (explored == null || explored.Count == 0) return false;
            // A mainland chunk is only 18×18; this scan runs when the player opens
            // the map, never during the frame loop. It avoids allocating a second
            // dense 126×126 presentation cache just for a panel.
            foreach (double savedIndex in explored)
            {
                int index = (int)savedIndex;
                int x = index % width;
                int y = index / width;
                if (x >= minX && x < maxX && y >= minY && y < maxY) return true;
            }
            return false;
        }

        private static Color ChunkTerrainColor(Isoperia.Core.World.Grid grid, int minX, int minY, int maxX, int maxY)
        {
            int[] counts = new int[6];
            for (int y = minY; y < maxY; y++)
                for (int x = minX; x < maxX; x++)
                    counts[(int)grid.Tiles[y][x].TerrainType]++;

            int dominant = 0;
            for (int i = 1; i < counts.Length; i++) if (counts[i] > counts[dominant]) dominant = i;
            return TerrainColor((TerrainType)dominant);
        }

        private void OpenSkills()
        {
            OpenPanel("Skills");

            SaveDriver saveDriver = SaveDriver.Instance;
            if (saveDriver == null || saveDriver.State == null || saveDriver.Content == null)
            {
                AddPanelMessage("Skills are loading.");
                return;
            }

            foreach (string id in Skills.All)
            {
                SkillState skill = saveDriver.State.Player.Skills.Get(id);
                int level;
                double progress;
                XpTable.LevelProgress(skill.Xp, out level, out progress);
                string name = saveDriver.Content.Skills[id]["name"].AsString(id);
                AddSkillRow(name, level, skill.Xp, progress, skill.Mastery.Count);
            }
        }

        private void OpenQuests()
        {
            OpenPanel("Quests");

            SaveDriver saveDriver = SaveDriver.Instance;
            if (saveDriver == null || saveDriver.State == null || saveDriver.Content == null)
            {
                AddPanelMessage("Quest journal is loading.");
                return;
            }

            foreach (JsonValue quest in saveDriver.Content.Quests.Items)
            {
                string id = quest["id"].AsString("");
                bool completed = saveDriver.State.Player.Journal.Contains(id);
                string title = quest["title"].AsString(id);
                string summary = completed
                    ? quest["doneText"].AsString("Completed")
                    : quest["summary"].AsString("No summary available.");
                AddQuestRow(title, summary, completed);
            }
        }

        private void OpenCraft()
        {
            OpenPanel("Craft");
            SaveDriver save = SaveDriver.Instance;
            if (save == null || save.Crafting == null) { AddPanelMessage("Crafting is loading."); return; }
            foreach (JsonValue recipe in save.Content.Recipes.Items)
            {
                CraftEndReason? reason = save.Crafting.CanStart(recipe);
                string output = save.Content.ItemName(recipe["output"]["itemId"].AsString());
                string label = recipe["name"].AsString("Recipe") + " → " + output;
                if (reason.HasValue) label += " · " + reason.Value;
                AddSettingButton(label, () => { save.Gathering?.Interrupt(); save.Crafting.Start(recipe); OpenCraft(); });
            }
        }

        private void OpenBuild()
        {
            OpenPanel("Build");
            SaveDriver save = SaveDriver.Instance;
            if (save == null || save.Buildings == null) { AddPanelMessage("Building is loading."); return; }
            AddPanelMessage("Choose a structure, then tap an open town or settlement tile.");
            foreach (var pair in save.Content.Buildings.Members)
            {
                string type = pair.Key;
                JsonValue def = pair.Value;
                BuildDenyReason reason = save.Buildings.CanPlace(type, -1, -1);
                if (reason == BuildDenyReason.TileInvalid) reason = BuildDenyReason.None;
                string label = def["icon"].AsString("▣") + " " + def["name"].AsString(type);
                if (reason != BuildDenyReason.None) label += " · " + reason;
                AddSettingButton(label, () => { save.BeginBuildingPlacement(type); ClosePanel(); });
            }
        }

        private void OpenSettings()
        {
            OpenPanel("Settings");

            SaveDriver saveDriver = SaveDriver.Instance;
            if (saveDriver == null || saveDriver.State == null)
            {
                AddPanelMessage("Settings are loading.");
                return;
            }

            AddPanelMessage("Input: tap-to-move · drag-pan · pinch/wheel zoom.");
            AddSettingButton(
                "Auto-eat: " + FormatAutoEat(saveDriver.State.Settings.AutoEatPct),
                CycleAutoEat);
            AddSettingButton(
                "Fight style: " + CombatRules.Style(saveDriver.State.Settings.AttackStyle).Name,
                CycleAttackStyle);
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

        private void AddQuestRow(string title, string summary, bool completed)
        {
            var row = new VisualElement();
            row.AddToClassList("quest-row");

            var titleLabel = new Label((completed ? "✓ " : "○ ") + title);
            titleLabel.AddToClassList(completed ? "quest-complete" : "quest-title");
            var summaryLabel = new Label(summary);
            summaryLabel.AddToClassList("quest-summary");

            row.Add(titleLabel);
            row.Add(summaryLabel);
            panelBody.Add(row);
        }

        private void AddSkillRow(string name, int level, double xp, double progress, int masteryCount)
        {
            var row = new VisualElement();
            row.AddToClassList("skill-row");

            var title = new Label(name + "  ·  Lv " + level);
            title.AddToClassList("skill-title");
            var details = new Label(string.Format("{0:N0} XP  ·  {1:P0} to next  ·  {2} mastery", xp, progress, masteryCount));
            details.AddToClassList("skill-details");
            row.Add(title);
            row.Add(details);
            panelBody.Add(row);
        }

        private void AddSettingButton(string text, System.Action action)
        {
            var button = new Button(action) { text = text };
            button.AddToClassList("setting-button");
            panelBody.Add(button);
        }

        private void CycleAutoEat()
        {
            SaveDriver saveDriver = SaveDriver.Instance;
            if (saveDriver == null) return;

            int[] steps = GameState.AutoEatSteps;
            int currentIndex = System.Array.IndexOf(steps, saveDriver.State.Settings.AutoEatPct);
            int nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % steps.Length;
            saveDriver.State.Settings.AutoEatPct = steps[nextIndex];
            saveDriver.Save.ForceSave();
            OpenSettings();
        }

        private void CycleAttackStyle()
        {
            SaveDriver saveDriver = SaveDriver.Instance;
            if (saveDriver == null) return;

            string[] styles =
            {
                CombatRules.StyleAccurate,
                CombatRules.StyleAggressive,
                CombatRules.StyleDefensive,
            };
            int currentIndex = System.Array.IndexOf(styles, saveDriver.State.Settings.AttackStyle);
            int nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % styles.Length;
            saveDriver.State.Settings.AttackStyle = styles[nextIndex];
            saveDriver.Save.ForceSave();
            OpenSettings();
        }

        private static string FormatAutoEat(int percent) =>
            percent <= 0 ? "Off" : percent + "% HP";

        private static Color TerrainColor(TerrainType terrain)
        {
            switch (terrain)
            {
                case TerrainType.Water: return new Color(0.13f, 0.33f, 0.45f, 1f);
                case TerrainType.Rock: return new Color(0.34f, 0.34f, 0.34f, 1f);
                case TerrainType.Dirt: return new Color(0.40f, 0.26f, 0.16f, 1f);
                case TerrainType.Sand: return new Color(0.65f, 0.56f, 0.34f, 1f);
                case TerrainType.Road: return new Color(0.45f, 0.38f, 0.25f, 1f);
                default: return new Color(0.30f, 0.40f, 0.24f, 1f);
            }
        }

        private void ClosePanel()
        {
            if (panel != null) panel.style.display = DisplayStyle.None;
        }

        private void OnDestroy()
        {
            if (closePanel != null) closePanel.clicked -= ClosePanel;
            if (inventoryButton != null) inventoryButton.clicked -= OpenInventory;
            if (skillsButton != null) skillsButton.clicked -= OpenSkills;
            if (craftButton != null) craftButton.clicked -= OpenCraft;
            if (buildButton != null) buildButton.clicked -= OpenBuild;
            if (mapButton != null) mapButton.clicked -= OpenMap;
            if (questButton != null) questButton.clicked -= OpenQuests;
            if (settingsButton != null) settingsButton.clicked -= OpenSettings;

            if (panelSettings != null) Destroy(panelSettings);
        }
    }
}
