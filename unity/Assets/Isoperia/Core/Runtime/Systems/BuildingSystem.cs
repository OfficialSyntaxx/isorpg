using System;
using Isoperia.Core.Content;
using Isoperia.Core.Save;
using Isoperia.Core.State;
using Isoperia.Core.World;

namespace Isoperia.Core.Systems
{
    public enum BuildDenyReason { None, UnknownType, Level, MaxCount, Materials, TileInvalid }

    /// <summary>Core placement rules for exported town buildings.</summary>
    public sealed class BuildingSystem
    {
        private readonly Grid grid;
        private readonly GameState state;
        private readonly ContentDatabase content;

        public BuildingSystem(Grid grid, GameState state, ContentDatabase content)
        {
            this.grid = grid ?? throw new ArgumentNullException(nameof(grid));
            this.state = state ?? throw new ArgumentNullException(nameof(state));
            this.content = content ?? throw new ArgumentNullException(nameof(content));
        }

        public void Rehydrate()
        {
            foreach (TownBuilding building in state.Town.Buildings)
                grid.SetOccupant(building.X, building.Y, Occupant.Building, building.Id);
        }

        public BuildDenyReason CanPlace(string type, int x, int y)
        {
            JsonValue def = content.Buildings[type];
            if (def.IsNull) return BuildDenyReason.UnknownType;
            if (state.Player.Skills.LevelOf("construction") < (int)def["levelReq"].AsNumber()) return BuildDenyReason.Level;
            int count = 0;
            foreach (TownBuilding building in state.Town.Buildings) if (building.Type == type) count++;
            if (count >= (int)def["maxCount"].AsNumber(1)) return BuildDenyReason.MaxCount;
            foreach (JsonValue cost in def["baseCost"].Items)
                if (state.Player.Inventory.Count(cost["itemId"].AsString()) < (int)cost["qty"].AsNumber()) return BuildDenyReason.Materials;
            Tile tile = grid.At(x, y);
            if (tile == null || !grid.IsRegionUnlocked(x, y) || !tile.Buildable || tile.Occupant != Occupant.None ||
                (tile.ZoneId != ZoneIds.TownCenter && tile.ZoneId != ZoneIds.Settlement)) return BuildDenyReason.TileInvalid;
            return BuildDenyReason.None;
        }

        public bool TryPlace(string type, int x, int y, out TownBuilding placed, out BuildDenyReason reason)
        {
            placed = null;
            reason = CanPlace(type, x, y);
            if (reason != BuildDenyReason.None) return false;
            JsonValue def = content.Buildings[type];
            foreach (JsonValue cost in def["baseCost"].Items)
                state.Player.Inventory.Remove(cost["itemId"].AsString(), (int)cost["qty"].AsNumber());
            placed = new TownBuilding { Id = type.ToLowerInvariant() + "_" + x + "_" + y, Type = type, X = x, Y = y, Level = 1 };
            state.Town.Buildings.Add(placed);
            grid.SetOccupant(x, y, Occupant.Building, placed.Id);
            state.Player.Skills.AddXp("construction", def["buildXp"].AsNumber());
            return true;
        }
    }
}
