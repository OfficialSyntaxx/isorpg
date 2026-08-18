// Harness: dumps every XP threshold and a set of level lookups, for diffing
// against the TypeScript. The curve's construction has two details that are easy
// to get subtly wrong while still producing a plausible-looking curve, and being
// wrong here silently rebalances every skill in the game.
using System;
using System.Text;
using Isoperia.Core.Data;

public static class DumpXpTable
{
    public static void Main()
    {
        var sb = new StringBuilder();

        sb.Append("THRESHOLDS\n");
        for (int lvl = 0; lvl <= XpTable.MaxLevel; lvl++)
            sb.Append(lvl).Append('=').Append(XpTable.XpForLevel(lvl)).Append('\n');

        sb.Append("LEVEL_FROM_XP\n");
        int[] probes =
        {
            0, 1, 82, 83, 84, 173, 174, 1153, 1154,
            101332, 101333, 273742, 737627, 1986068, 5346332,
            11805606, 13034430, 13034431, 20000000,
        };
        foreach (int xp in probes)
            sb.Append(xp).Append("->").Append(XpTable.LevelFromXp(xp)).Append('\n');

        Console.Out.Write(sb.ToString());
    }
}
