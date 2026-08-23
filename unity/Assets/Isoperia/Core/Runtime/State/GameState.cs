using System.Collections.Generic;
using Isoperia.Core.Components;

namespace Isoperia.Core.State
{
    public sealed class TownBuilding
    {
        public string Id;
        public string Type;
        public int X;
        public int Y;
        public int Level = 1;
    }

    /// <summary>
    /// A farming bed stores ONLY the seed and the epoch millisecond it was sown.
    /// Growth is therefore a function of the current time: there is no
    /// accumulated progress to persist, and consequently no offline catch-up pass
    /// that could pay the same growth out twice. Do not "improve" this into a
    /// tick-accumulated system.
    /// </summary>
    public sealed class FarmPlot
    {
        public string SeedId;
        public long PlantedAt;
    }

    public sealed class ActiveClue
    {
        public string Tier;           // "simple" | "hard"
        public double Seed;
        public int Step;
        public List<(int X, int Y)> Sites = new List<(int, int)>();
    }

    public sealed class PlayerState
    {
        public string Name;
        public PositionComponent Pos;
        public HealthComponent Health;
        public SkillComponent Skills;
        public InventoryComponent Inventory;

        /// <summary>Item id per equip slot. Absent key means the slot is empty.</summary>
        public Dictionary<string, string> Equipped = new Dictionary<string, string>();

        public List<string> MapDiscovered = new List<string>();
        public bool MapFastTravel;
        public List<double> MapExplored = new List<double>();

        /// <summary>Ids of completed quests.</summary>
        public List<string> Journal = new List<string>();

        /// <summary>The one clue hunt in progress, or null.</summary>
        public ActiveClue Clue;

        /// <summary>Spent on a combat buff, restored by resting at a Campfire.</summary>
        public int Resolve = GameState.ResolveMax;

        /// <summary>The buff currently drawing from Resolve, or null.</summary>
        public string ActiveBuff;

        /// <summary>Weapon special bar, 0..100. Regenerates anywhere.</summary>
        public int SpecialEnergy = GameState.SpecialMax;

        public Dictionary<string, double> MetaKills = new Dictionary<string, double>();
        public List<string> MetaAchievements = new List<string>();
        public Dictionary<string, double> MetaCounters = new Dictionary<string, double>();
    }

    public sealed class LabourState
    {
        public Dictionary<string, string> Assignments = new Dictionary<string, string>();
        public Dictionary<string, double> Stock = new Dictionary<string, double>();

        /// <summary>Milliseconds accrued per villager since last output.</summary>
        public Dictionary<string, double> Acc = new Dictionary<string, double>();

        /// <summary>Milliseconds each villager has worked; drives veteran yield tiers.</summary>
        public Dictionary<string, double> Worked = new Dictionary<string, double>();
    }

    public sealed class TownState
    {
        public List<TownBuilding> Buildings = new List<TownBuilding>();
        public LabourState Labour = new LabourState();
        public Dictionary<string, double> MarketSupply = new Dictionary<string, double>();
        public Dictionary<string, double> MarketDemand = new Dictionary<string, double>();
        public List<FarmPlot> FarmPlots = new List<FarmPlot>();
    }

    public sealed class SettingsState
    {
        /// <summary>
        /// Auto-eat trigger, as a percentage of max HP; 0 disables. Was a
        /// hardcoded 40%, which is too eager for a player stretching food across
        /// a long trip and too late for one fighting something that two-shots
        /// them.
        /// </summary>
        public int AutoEatPct = GameState.DefaultAutoEatPct;

        /// <summary>Fight stance: shifts accuracy/max-hit/defense and which skill trains.</summary>
        public string AttackStyle = GameState.DefaultAttackStyle;
    }

    /// <summary>Mutable state for one deterministic resource-node id.</summary>
    public sealed class ResourceNodeState
    {
        public int Remaining;
        public long RespawnAt;
    }

    /// <summary>
    /// The central mutable state. Components carry data; systems read and write
    /// it. Port of <c>src/state/GameState.ts</c>.
    ///
    /// Note what is NOT here: the world grid. It is a pure function of the seed
    /// and is regenerated on load rather than stored, which is why saves stay
    /// small. Only mutable world state (occupancy, resource nodes) persists.
    /// </summary>
    public sealed class GameState
    {
        /// <summary>
        /// Bump when a field CHANGES MEANING, not merely when one is added. The
        /// sanitizer migrates by version, and a value silently reinterpreted on a
        /// new scale is worse than a missing one.
        ///
        /// 1.1.0 — mastery XP moved off the OSRS skill curve onto its own
        ///         triangular curve at 1 XP per unit (was 4).
        /// </summary>
        public const string SaveVersion = "1.1.0";

        /// <summary>
        /// A new hero opens in clear mid-morning light. The day curve ramps
        /// 06:30 to 12:30, so 08:00 is only 0.25 daylight and still reads as
        /// gloomy; 10:00 gives 0.58, which is daytime without pinning the clock
        /// at noon.
        /// </summary>
        public const int DayStartMinute = 10 * 60;

        /// <summary>
        /// The player character: a young mystic apprentice. Named to sit
        /// alongside the settlement's cast — Bram, Wren, Tobias, Eldric — and
        /// after the corvid its plum-black robe echoes.
        /// </summary>
        public const string DefaultHeroName = "Corvin";

        public const int ResolveMax = 100;
        public const int SpecialMax = 100;
        public const int DefaultAutoEatPct = 40;
        public const string DefaultAttackStyle = "accurate";

        /// <summary>Selectable auto-eat thresholds, percent of max HP. 0 disables.</summary>
        public static readonly int[] AutoEatSteps = { 0, 20, 30, 40, 50, 60, 75 };

        public string Version = SaveVersion;

        /// <summary>
        /// Epoch milliseconds of the last save. This is what "how long were you
        /// away" is measured from — when it was left unset on load, offline
        /// progression measured from process start, was always ~0, and silently
        /// paid out nothing.
        /// </summary>
        public long Timestamp;

        public PlayerState Player = new PlayerState();
        public TownState Town = new TownState();
        public SettingsState Settings = new SettingsState();

        /// <summary>In-game clock. Persisted so time of day survives a reload.</summary>
        public int ClockMinute = DayStartMinute;
        public int ClockDay = 1;

        /// <summary>
        /// Only changed node state is stored. Node placement and definitions are
        /// regenerated from the Core grid and content tables on every load.
        /// </summary>
        public Dictionary<string, ResourceNodeState> ResourceNodes =
            new Dictionary<string, ResourceNodeState>();

        public HashSet<string> CollectionLog = new HashSet<string>();

        public static GameState CreateFresh(
            string name = DefaultHeroName,
            int startX = 10,
            int startY = 10,
            IItemCatalog catalog = null,
            long nowMs = 0)
        {
            var s = new GameState
            {
                Version = SaveVersion,
                Timestamp = nowMs,
                ClockMinute = DayStartMinute,
                ClockDay = 1,
            };

            s.Player.Name = name;
            s.Player.Pos = PositionComponent.Create(startX, startY);
            s.Player.Health = HealthComponent.Create(100);
            s.Player.Skills = SkillComponent.Create();
            s.Player.Inventory = InventoryComponent.Create(catalog);
            s.Player.Resolve = ResolveMax;
            s.Player.SpecialEnergy = SpecialMax;

            return s;
        }
    }
}
