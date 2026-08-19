using System;
using Isoperia.Core.Components;
using Isoperia.Core.Content;
using Isoperia.Core.Data;
using Isoperia.Core.Save;
using Isoperia.Core.Sim;
using Isoperia.Core.State;

namespace Isoperia.Core.Systems
{
    /// <summary>Why a gathering action stopped.</summary>
    public enum ActionEndReason
    {
        Done,
        Interrupted,
        LevelShortfall,
        ToolShortfall,
        InventoryFull,
    }

    /// <summary>A harvestable node: its RESOURCES definition plus remaining uses.</summary>
    public interface IResourceNode
    {
        /// <summary>The entry from the RESOURCES content table.</summary>
        JsonValue Def { get; }
    }

    public sealed class GatherEvent
    {
        public IResourceNode Node;
        public string ItemId;
        public int Amount;
        public int XpGained;
        public int MasteryGained;
        public bool Doubled;
    }

    /// <summary>
    /// The gathering loop: woodcutting, mining, fishing. Port of
    /// <c>src/systems/SkillSystem.ts</c>.
    ///
    /// <para>
    /// RANDOMNESS IS INJECTED, and DRAW ORDER IS PART OF THE CONTRACT — the same
    /// rule the combat port established, for the same reason: it is what makes
    /// roll-for-roll parity against the TypeScript checkable at all. Per gather:
    /// </para>
    /// <list type="number">
    ///   <item>the double-yield roll, ALWAYS, even when the node has no drops;</item>
    ///   <item>the drop roll, ONLY when the drop table is non-empty.</item>
    /// </list>
    /// <para>
    /// Reordering those leaves every formula correct and produces a different
    /// game from the same seed.
    /// </para>
    /// </summary>
    public sealed class SkillSystem
    {
        private readonly GameState _state;
        private readonly ContentDatabase _content;
        private readonly IRandom _rng;

        /// <summary>Consumes one use of the node; returns uses remaining.</summary>
        private readonly Func<IResourceNode, int> _consume;

        private IResourceNode _active;
        private double _tickAccMs;
        private int _ticksNeeded;

        public SkillSystem(GameState state, ContentDatabase content, IRandom rng,
                           Func<IResourceNode, int> consume)
        {
            _state = state ?? throw new ArgumentNullException(nameof(state));
            _content = content ?? throw new ArgumentNullException(nameof(content));
            _rng = rng ?? throw new ArgumentNullException(nameof(rng));
            _consume = consume ?? throw new ArgumentNullException(nameof(consume));
        }

        public event Action<GatherEvent> Gathered;
        public event Action<IResourceNode> ActionStarted;
        public event Action<IResourceNode, ActionEndReason> ActionEnded;

        public IResourceNode ActiveNode => _active;
        public bool HasActive => _active != null;
        public bool IsLevelShortfall { get; private set; }

        public double Progress =>
            _active == null ? 0 : Math.Min(1, _tickAccMs / (_ticksNeeded * TickRunner.TickMs));

        public int RequiredLevel =>
            _active == null ? 1 : (int)_active.Def["levelReq"].AsNumber(1);

        /// <summary>Begins gathering. False when gated by level or tool.</summary>
        public bool StartGathering(IResourceNode node)
        {
            if (node == null) throw new ArgumentNullException(nameof(node));

            JsonValue def = node.Def;
            string skill = def["skill"].AsString(null);
            if (skill == null) throw new ContentException("resource node has no skill.");

            if (_state.Player.Skills.LevelOf(skill) < (int)def["levelReq"].AsNumber(1))
            {
                IsLevelShortfall = true;
                ActionEnded?.Invoke(node, ActionEndReason.LevelShortfall);
                return false;
            }

            // Tool gating. `toolTier ?? 1` in the TypeScript — a node with no
            // stated tier still needs a tier-1 tool, so bare hands never work.
            int needTier = def["toolTier"].IsNull ? 1 : (int)def["toolTier"].AsNumber(1);
            if (ItemTools.BestTier(_content, _state.Player.Inventory, skill) < needTier)
            {
                IsLevelShortfall = false;
                ActionEnded?.Invoke(node, ActionEndReason.ToolShortfall);
                return false;
            }

            IsLevelShortfall = false;
            _active = node;
            _tickAccMs = 0;
            _ticksNeeded = ActionTicks(def, skill);
            ActionStarted?.Invoke(node);
            return true;
        }

        /// <summary>
        /// Action duration in ticks — faster with mastery AND a better tool.
        ///
        /// Mastery is looked up for THIS resource specifically. It once summed
        /// every mastery in the skill, so chopping normal logs sped up willow the
        /// player had never touched, and the summed total inflated the level far
        /// past any single resource's real mastery. Do not "simplify" this back.
        /// </summary>
        private int ActionTicks(JsonValue def, string skill)
        {
            double baseTicks = def["ticksPerAction"].AsNumber(1);
            string masteryKey = def["masteryKey"].AsString("");

            _state.Player.Skills.Get(skill).Mastery.TryGetValue(masteryKey, out double mXp);
            int m = MasteryTable.LevelFromXp(mXp);

            double frac = Math.Min(1, m / 99.0);
            double floor = Math.Max(4, Math.Ceiling(baseTicks * 0.6));

            double speed = ItemTools.TryGetBest(_content, _state.Player.Inventory, skill, out _, out double pct)
                ? pct : 0;

            double ticks = Math.Round(baseTicks * (1 - frac * 0.33) * (1 - speed / 100),
                                      MidpointRounding.AwayFromZero);
            return (int)Math.Max(floor, ticks);
        }

        /// <summary>
        /// Early-game XP momentum: +50% at level 1, tapering to +0% by level 16,
        /// so the 1-15 band feels quick while the OSRS curve still holds after.
        /// </summary>
        private double EarlyBonus(string skill)
        {
            int lvl = _state.Player.Skills.LevelOf(skill);
            if (lvl >= 16) return 1;
            return 1 + 0.5 * (1 - (lvl - 1) / 15.0);
        }

        public void Tick(double dtMs)
        {
            if (_active == null) return;

            _tickAccMs += dtMs;
            if (_tickAccMs < _ticksNeeded * TickRunner.TickMs) return;

            _tickAccMs = 0;
            PerformGather(_active);
        }

        private void PerformGather(IResourceNode node)
        {
            JsonValue def = node.Def;
            string skill = def["skill"].AsString(null);
            string masteryKey = def["masteryKey"].AsString("");

            _state.Player.Skills.Get(skill).Mastery.TryGetValue(masteryKey, out double mXp);
            int mLevel = MasteryTable.LevelFromXp(mXp);

            // DRAW 1 of 2 — always taken, before the drop roll.
            double doubleChance = Math.Min(0.2, mLevel / 99.0 * 0.2);
            bool doubled = _rng.Next() < doubleChance;

            // DRAW 2 of 2 — only when there is a drop table to roll on.
            string itemId = RollDrop(def["drops"]);
            if (itemId == null)
            {
                StopGathering(node, ActionEndReason.Done);
                return;
            }

            int amount = (int)def["yield"].AsNumber(1);
            if (doubled) amount *= 2;

            InventoryComponent inv = _state.Player.Inventory;

            // The cap is checked BEFORE adding, and only for bulk items, matching
            // the TypeScript. Inventory.Add also enforces it, but stopping the
            // action is the behaviour that differs: silently storing less would
            // leave the player mining into a full bag forever.
            if (inv.IsBulkItem(itemId) && inv.StoredAmount() + amount > inv.StorageCap)
            {
                StopGathering(node, ActionEndReason.InventoryFull);
                return;
            }

            inv.Add(itemId, amount);

            // Per-skill XP from the item, defaulting to 5 when the item states
            // none for this skill — matching `ITEMS[itemId]?.xp?.[skill] ?? 5`.
            JsonValue item = _content.Item(itemId);
            double baseXp = 5;
            if (item != null)
            {
                JsonValue xp = item["xp"];
                if (!xp.IsNull && !xp[skill].IsNull) baseXp = xp[skill].AsNumber(5);
            }

            int xpGained = (int)Math.Round(baseXp * (doubled ? 2 : 1) * EarlyBonus(skill),
                                           MidpointRounding.AwayFromZero);
            int masteryGained = (int)def["yield"].AsNumber(1);

            _state.Player.Skills.AddXp(skill, xpGained);
            _state.Player.Skills.AddMasteryXp(skill, masteryKey, masteryGained);
            _state.CollectionLog.Add(itemId);

            Gathered?.Invoke(new GatherEvent
            {
                Node = node, ItemId = itemId, Amount = amount,
                XpGained = xpGained, MasteryGained = masteryGained, Doubled = doubled,
            });

            if (_consume(node) == 0) StopGathering(node, ActionEndReason.Done);
        }

        /// <summary>
        /// Weighted drop roll. Returns null only for an EMPTY table, and takes no
        /// draw in that case — which is why the double-yield roll above happens
        /// first and unconditionally.
        /// </summary>
        private string RollDrop(JsonValue drops)
        {
            if (drops.IsNull || drops.Count == 0) return null;

            double total = 0;
            for (int i = 0; i < drops.Count; i++) total += drops[i]["weight"].AsNumber(0);

            double r = _rng.Next() * total;
            for (int i = 0; i < drops.Count; i++)
            {
                r -= drops[i]["weight"].AsNumber(0);
                if (r <= 0) return drops[i]["itemId"].AsString(null);
            }

            // Float error only. The TypeScript falls back to the first entry.
            return drops[0]["itemId"].AsString(null);
        }

        public void StopGathering(IResourceNode node, ActionEndReason reason)
        {
            if (ReferenceEquals(_active, node)) _active = null;
            ActionEnded?.Invoke(node, reason);
        }

        public void Interrupt()
        {
            if (_active != null) StopGathering(_active, ActionEndReason.Interrupted);
        }
    }
}
