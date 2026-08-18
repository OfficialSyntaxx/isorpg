namespace Isoperia.Core.World
{
    /// <summary>Terrain kinds. Mirrors the TS union in <c>src/world/Grid.ts</c>.</summary>
    public enum TerrainType
    {
        Grass,
        Water,
        Rock,
        Dirt,
        Sand,
        Road,
    }

    /// <summary>What is standing on a tile. Anything but None blocks pathing.</summary>
    public enum Occupant
    {
        None,
        Building,
        ResourceNode,
        Monster,
        Npc,
    }

    /// <summary>Broad region flavours layered over the threat bands.</summary>
    public enum Biome
    {
        Meadow,
        Forest,
        Snow,
        Swamp,
    }

    /// <summary>
    /// Zone ids stay strings to match the save schema and the TS source exactly.
    /// An enum would be tidier but would change what lands in the save file.
    /// </summary>
    public static class ZoneIds
    {
        public const string TownCenter = "TOWN_CENTER";
        public const string Settlement = "SETTLEMENT";
        public const string WildernessLvl1 = "WILDERNESS_LVL1";
        public const string WildernessLvl2 = "WILDERNESS_LVL2";
    }

    /// <summary>
    /// One map tile. A plain mutable class, matching the TS object: systems read
    /// and write these directly, and the grid owns them.
    /// </summary>
    public sealed class Tile
    {
        public int X;
        public int Y;
        public double Elevation;
        public TerrainType TerrainType;
        public bool Walkable;
        public bool Buildable;
        public Occupant Occupant;
        public string OccupantId;
        public string ZoneId;
        public Biome Biome;

        /// <summary>
        /// Permanent per-tile decoration seed. Every piece of visual scatter —
        /// grass tufts, pebbles, flowers — must derive from this rather than from
        /// a fresh random, so the world looks identical across sessions and
        /// machines. This is what makes it read as a place rather than a re-roll.
        /// </summary>
        public int Seed;
    }
}
