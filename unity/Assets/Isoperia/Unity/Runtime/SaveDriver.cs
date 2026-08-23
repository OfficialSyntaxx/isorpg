using System;
using System.Runtime.InteropServices;
using UnityEngine;
using Isoperia.Core.Components;
using Isoperia.Core.Content;
using Isoperia.Core.Save;
using Isoperia.Core.State;
using Isoperia.Core.Sim;
using Isoperia.Core.Systems;

namespace Isoperia.Unity
{
    /// <summary>
    /// Drives <see cref="SaveSystem"/> from Unity's lifecycle, and makes sure a
    /// save is flushed before the player can lose it.
    ///
    /// On WebGL the ways a session ends are all abrupt: the tab is closed, the
    /// browser is backgrounded and later reclaimed, or iOS kills the tab for
    /// memory. None of them run a tidy shutdown, and `OnApplicationQuit` is not
    /// reliably delivered in a browser at all — which is why the page installs
    /// pagehide/visibilitychange handlers that call back in here.
    /// </summary>
    [DefaultExecutionOrder(-500)]
    public sealed class SaveDriver : MonoBehaviour
    {
        /// <summary>Must match the GameObject name, since the JS side addresses it by name.</summary>
        public const string GameObjectName = "SaveDriver";

        private const string LifecycleMethod = nameof(OnPageHiding);

        public static SaveDriver Instance { get; private set; }

        public SaveSystem Save { get; private set; }
        public GameState State { get; private set; }
        public ContentDatabase Content { get; private set; }
        public WorldResourceRegistry Resources { get; private set; }
        public SkillSystem Gathering { get; private set; }
        public CraftingSystem Crafting { get; private set; }
        public string GatheringStatus { get; private set; }

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void IsoperiaInstallLifecycleHooks(string goName, string method);
#endif

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;

            // The JS bridge sends messages to this object by name.
            if (gameObject.name != GameObjectName) gameObject.name = GameObjectName;
            DontDestroyOnLoad(gameObject);

            Content = UnityContentDatabase.Load();
            var catalog = new ContentItemCatalog(Content);
            State = GameState.CreateFresh(catalog: catalog, nowMs: NowMs());
            Save = new SaveSystem(State, new FileSaveStore(), NowMs);
            Save.Content = Content;

            LoadResult result = Save.Load();
            State.Player.Inventory.SetCatalog(catalog);
            GrantStarterItems(result.RecoveredFrom);
            Resources = new WorldResourceRegistry(WorldRuntime.Instance.Grid, State, Content, NowMs);
            Gathering = new SkillSystem(
                State,
                Content,
                new Mulberry32Random(unchecked((int)NowMs())),
                Resources.Consume);
            Gathering.ActionStarted += OnGatheringStarted;
            Gathering.Gathered += OnGathered;
            Gathering.ActionEnded += OnGatheringEnded;
            Crafting = new CraftingSystem(State, Content, new Mulberry32Random(unchecked((int)(NowMs() ^ 0x51f15e))), HasBuilding);
            Debug.Log($"[Isoperia] save loaded from: {result.RecoveredFrom}");

            if (result.Summary != null && result.Summary.AwaySeconds > 0)
            {
                Debug.Log($"[Isoperia] away {result.Summary.AwaySeconds}s" +
                          (result.Summary.CapApplied ? " (capped)" : ""));
            }

#if UNITY_WEBGL && !UNITY_EDITOR
            IsoperiaInstallLifecycleHooks(GameObjectName, LifecycleMethod);
#endif
        }

        private void GrantStarterItems(LoadOutcome outcome)
        {
            InventoryComponent inventory = State.Player.Inventory;
            if (outcome == LoadOutcome.Fresh)
            {
                inventory.Add("normal_log", 5);
                inventory.Add("raw_shrimp", 2);
                inventory.Add("coins", 5);
            }

            GrantToolIfMissing(inventory, "woodcutting", "bronze_axe");
            GrantToolIfMissing(inventory, "mining", "bronze_pickaxe");
            GrantToolIfMissing(inventory, "fishing", "small_net");
        }

        private void GrantToolIfMissing(InventoryComponent inventory, string skill, string itemId)
        {
            if (!ItemTools.TryGetBest(Content, inventory, skill, out _, out _)) inventory.Add(itemId, 1);
        }

        private void Start()
        {
            // Both clock advancement and autosave ride the simulation tick rather
            // than a wall-clock timer. Register the clock first so a save made on
            // this tick contains the newly advanced in-game minute.
            if (GameLoop.Instance == null)
            {
                Debug.LogError(
                    "[Isoperia] SaveDriver found no GameLoop in the scene, so autosave is NOT " +
                    "running. Add a GameObject with the GameLoop component, or rebuild the " +
                    "scene with Isoperia > Create bootstrap scene.");
                return;
            }

            GameLoop.Instance.Tick.OnTick(AdvanceClock);
            GameLoop.Instance.Tick.OnTick(Resources.Tick);
            GameLoop.Instance.Tick.OnTick(TickGathering);
            GameLoop.Instance.Tick.OnTick(TickCrafting);
            GameLoop.Instance.Tick.OnTick(Save.OnTick);
        }

        private void TickGathering(long _)
        {
            Gathering?.Tick(TickRunner.TickMs);
        }

        private void TickCrafting(long _)
        {
            Crafting?.Tick(TickRunner.TickMs);
        }

        private bool HasBuilding(string type)
        {
            foreach (TownBuilding building in State.Town.Buildings)
                if (building.Type == type) return true;
            return false;
        }

        private void OnGatheringStarted(IResourceNode node)
        {
            GatheringStatus = "Gathering " + node.Def["masteryKey"].AsString("resource") + "…";
        }

        private void OnGathered(GatherEvent gathered)
        {
            GatheringStatus = "+" + gathered.Amount + " " + Content.ItemName(gathered.ItemId) +
                              " · " + gathered.XpGained + " XP";
        }

        private void OnGatheringEnded(IResourceNode node, ActionEndReason reason)
        {
            if (reason == ActionEndReason.Done) GatheringStatus = "Resource depleted · respawning soon";
            else if (reason == ActionEndReason.InventoryFull) GatheringStatus = "Inventory full";
            else if (reason == ActionEndReason.LevelShortfall) GatheringStatus = "Level requirement not met";
            else if (reason == ActionEndReason.ToolShortfall) GatheringStatus = "Required gathering tool missing";
        }

        private void AdvanceClock(long _)
        {
            State.ClockMinute++;
            if (State.ClockMinute < 1440) return;

            State.ClockMinute = 0;
            State.ClockDay++;
        }

        /// <summary>Epoch milliseconds. The single source of "now" for saves.</summary>
        public static long NowMs() =>
            (long)DateTime.UtcNow.Subtract(new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;

        /// <summary>Called from JavaScript on pagehide, blur, and hidden visibility.</summary>
        public void OnPageHiding()
        {
            if (Save == null) return;
            if (!Save.ForceSave()) Debug.LogWarning("[Isoperia] save on page-hide failed");
        }

        private void OnApplicationPause(bool paused)
        {
            // Native platforms' equivalent of the page hiding. Harmless on WebGL,
            // where the JS hooks do the real work.
            if (paused) Save?.ForceSave();
        }

        private void OnApplicationFocus(bool focused)
        {
            if (!focused) Save?.ForceSave();
        }

        private void OnApplicationQuit()
        {
            Save?.ForceSave();
        }

        private void OnDestroy()
        {
            if (GameLoop.Instance != null && GameLoop.Instance.Tick != null)
            {
                GameLoop.Instance.Tick.RemoveHandler(AdvanceClock);
                GameLoop.Instance.Tick.RemoveHandler(Resources.Tick);
                GameLoop.Instance.Tick.RemoveHandler(TickGathering);
                GameLoop.Instance.Tick.RemoveHandler(TickCrafting);
                GameLoop.Instance.Tick.RemoveHandler(Save.OnTick);
            }

            if (Gathering != null)
            {
                Gathering.ActionStarted -= OnGatheringStarted;
                Gathering.Gathered -= OnGathered;
                Gathering.ActionEnded -= OnGatheringEnded;
            }

            if (Instance == this) Instance = null;
        }
    }
}
