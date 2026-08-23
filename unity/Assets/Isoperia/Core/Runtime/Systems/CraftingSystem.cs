using System;
using Isoperia.Core.Components;
using Isoperia.Core.Content;
using Isoperia.Core.Data;
using Isoperia.Core.Save;
using Isoperia.Core.Sim;
using Isoperia.Core.State;

namespace Isoperia.Core.Systems
{
    public enum CraftEndReason { Stopped, LevelShortfall, MissingMaterials, MissingBuilding, InventoryFull }

    public sealed class CraftEvent
    {
        public JsonValue Recipe;
        public int Amount;
        public int XpGained;
        public bool Preserved;
        public bool Burned;
    }

    /// <summary>Core tick-driven recipe loop, ported from the web CraftingSystem.</summary>
    public sealed class CraftingSystem
    {
        private readonly GameState state;
        private readonly ContentDatabase content;
        private readonly IRandom random;
        private readonly Func<string, bool> hasBuilding;
        private JsonValue active;
        private double elapsed;
        private int ticksNeeded;

        public event Action<JsonValue> Started;
        public event Action<CraftEvent> Crafted;
        public event Action<JsonValue, CraftEndReason> Ended;
        public JsonValue ActiveRecipe => active;

        public CraftingSystem(GameState state, ContentDatabase content, IRandom random, Func<string, bool> hasBuilding)
        {
            this.state = state ?? throw new ArgumentNullException(nameof(state));
            this.content = content ?? throw new ArgumentNullException(nameof(content));
            this.random = random ?? throw new ArgumentNullException(nameof(random));
            this.hasBuilding = hasBuilding ?? throw new ArgumentNullException(nameof(hasBuilding));
        }

        public CraftEndReason? CanStart(JsonValue recipe)
        {
            string skill = recipe["skill"].AsString();
            if (state.Player.Skills.LevelOf(skill) < (int)recipe["levelReq"].AsNumber(1)) return CraftEndReason.LevelShortfall;
            string building = recipe["requiresBuilding"].AsString();
            if (!string.IsNullOrEmpty(building) && !hasBuilding(building)) return CraftEndReason.MissingBuilding;
            foreach (JsonValue input in recipe["inputs"].Items)
                if (state.Player.Inventory.Count(input["itemId"].AsString()) < (int)input["qty"].AsNumber()) return CraftEndReason.MissingMaterials;
            return null;
        }

        public bool Start(JsonValue recipe)
        {
            CraftEndReason? reason = CanStart(recipe);
            if (reason.HasValue) { Ended?.Invoke(recipe, reason.Value); return false; }
            active = recipe;
            elapsed = 0;
            ticksNeeded = ActionTicks(recipe);
            Started?.Invoke(recipe);
            return true;
        }

        public void Stop(CraftEndReason reason = CraftEndReason.Stopped)
        {
            JsonValue recipe = active;
            active = null;
            if (recipe != null) Ended?.Invoke(recipe, reason);
        }

        public void Tick(double dtMs)
        {
            if (active == null) return;
            elapsed += dtMs;
            if (elapsed < ticksNeeded * TickRunner.TickMs) return;
            elapsed = 0;
            Perform(active);
        }

        private int ActionTicks(JsonValue recipe)
        {
            string skill = recipe["skill"].AsString();
            state.Player.Skills.Get(skill).Mastery.TryGetValue(recipe["id"].AsString(), out double mastery);
            int masteryLevel = MasteryTable.LevelFromXp(mastery);
            double baseTicks = recipe["ticks"].AsNumber(1);
            int ticks = (int)Math.Max(Math.Max(2, Math.Ceiling(baseTicks * .6)), Math.Round(baseTicks * (1 - Math.Min(1, masteryLevel / 99d) * .33)));
            return skill == Skills.Cooking && hasBuilding("CAMPFIRE") ? Math.Max(2, (int)Math.Round(ticks * .75)) : ticks;
        }

        private void Perform(JsonValue recipe)
        {
            CraftEndReason? gate = CanStart(recipe);
            if (gate.HasValue) { Stop(gate.Value); return; }
            string skill = recipe["skill"].AsString();
            state.Player.Skills.Get(skill).Mastery.TryGetValue(recipe["id"].AsString(), out double mastery);
            int masteryLevel = MasteryTable.LevelFromXp(mastery);
            bool preserved = random.Next() < Math.Min(.15, masteryLevel / 99d * .15);
            bool burned = recipe["burnable"].AsBool(false) && random.Next() < Math.Max(0, .35 - Math.Max(0, state.Player.Skills.LevelOf(skill) - (int)recipe["levelReq"].AsNumber()) * .02 - masteryLevel / 99d * .1);
            if (!preserved) foreach (JsonValue input in recipe["inputs"].Items) state.Player.Inventory.Remove(input["itemId"].AsString(), (int)input["qty"].AsNumber());
            string output = recipe["output"]["itemId"].AsString();
            int amount = (int)recipe["output"]["qty"].AsNumber(1);
            if (!burned && state.Player.Inventory.IsBulkItem(output) && state.Player.Inventory.StoredAmount() + amount > state.Player.Inventory.StorageCap) { Stop(CraftEndReason.InventoryFull); return; }
            int xp = burned ? (int)Math.Round(recipe["xp"].AsNumber() * .2) : (int)recipe["xp"].AsNumber();
            if (!burned) { state.Player.Inventory.Add(output, amount); state.CollectionLog.Add(output); } else amount = 0;
            state.Player.Skills.AddXp(skill, xp);
            state.Player.Skills.AddMasteryXp(skill, recipe["id"].AsString(), Math.Max(1, (int)recipe["output"]["qty"].AsNumber(1)));
            Crafted?.Invoke(new CraftEvent { Recipe = recipe, Amount = amount, XpGained = xp, Preserved = preserved, Burned = burned });
            CraftEndReason? next = CanStart(recipe);
            if (next.HasValue) Stop(next.Value);
        }
    }
}
