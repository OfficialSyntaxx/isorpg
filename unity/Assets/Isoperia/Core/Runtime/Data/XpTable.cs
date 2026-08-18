using System;

namespace Isoperia.Core.Data
{
    /// <summary>
    /// The OSRS-style experience curve, max level 99. Port of
    /// <c>src/data/XPTable.ts</c>.
    /// </summary>
    public static class XpTable
    {
        public const int MaxLevel = 99;

        /// <summary>Cumulative XP required to REACH each level. Index 0 is unused.</summary>
        private static readonly int[] Cumulative = Build();

        private static int[] Build()
        {
            // The ordering here is the whole thing, and it is easy to get subtly
            // wrong in a way that still looks like a plausible curve:
            //
            //   - the threshold for level n is recorded from the terms
            //     accumulated BEFORE adding term n, and
            //   - the division by 4 happens once at read time, not per term.
            //
            // Swapping either produces a table that is wrong at every level.
            var cumulative = new int[MaxLevel + 1];
            double total = 0;

            for (int n = 1; n <= MaxLevel; n++)
            {
                cumulative[n] = (int)Math.Floor(total / 4.0);
                total += Math.Floor(n + 300.0 * Math.Pow(2.0, n / 7.0));
            }

            return cumulative;
        }

        /// <summary>Total XP needed to reach <paramref name="level"/>.</summary>
        public static int XpForLevel(int level)
        {
            if (level <= 1) return 0;
            if (level > MaxLevel) level = MaxLevel;
            return Cumulative[level];
        }

        /// <summary>Highest level whose threshold <paramref name="xp"/> meets. Floor is 1.</summary>
        public static int LevelFromXp(double xp)
        {
            for (int lvl = MaxLevel; lvl >= 1; lvl--)
                if (xp >= Cumulative[lvl]) return lvl;
            return 1;
        }

        /// <summary>Fractional progress through the current level, for the XP bar.</summary>
        public static void LevelProgress(double xp, out int level, out double into)
        {
            level = LevelFromXp(xp);

            if (level >= MaxLevel)
            {
                into = 1.0;
                return;
            }

            double cur = Cumulative[level];
            double next = Cumulative[level + 1];
            double t = (xp - cur) / (next - cur);

            // The web build wrote this straight into a CSS width, where a NaN was
            // silently dropped and froze the bar. Same guard, same reason.
            into = double.IsNaN(t) || double.IsInfinity(t) ? 0.0 : Math.Max(0.0, Math.Min(1.0, t));
        }
    }

    /// <summary>
    /// Mastery is tracked per ITEM within a skill, on its own triangular curve at
    /// 1 XP per unit gathered or crafted — deliberately NOT the skill curve.
    ///
    /// Mastery originally reused the skill curve, which was wrong by a factor of
    /// thousands: that curve spans a whole skill's lifetime, while mastery is
    /// per item, so mastery 99 on normal logs worked out at ~8,146 hours of
    /// chopping and the speed bonus (which scales with level/99) did nothing in
    /// practice. Save version 1.1.0 exists because of this change; do not
    /// "simplify" it back.
    /// </summary>
    public static class MasteryTable
    {
        public const int MaxLevel = 99;

        /// <summary>Triangular: reaching level n costs n(n-1)/2 units.</summary>
        public static int XpForLevel(int level)
        {
            if (level <= 1) return 0;
            if (level > MaxLevel) level = MaxLevel;
            return level * (level - 1) / 2;
        }

        public static int LevelFromXp(double xp)
        {
            for (int lvl = MaxLevel; lvl >= 1; lvl--)
                if (xp >= XpForLevel(lvl)) return lvl;
            return 1;
        }
    }

    /// <summary>The twelve skills, in the order the UI presents them.</summary>
    public static class Skills
    {
        public const string Attack = "attack";
        public const string Strength = "strength";
        public const string Defense = "defense";
        public const string Hitpoints = "hitpoints";
        public const string Cooking = "cooking";
        public const string Smithing = "smithing";
        public const string Carpentry = "carpentry";
        public const string Construction = "construction";
        public const string Farming = "farming";
        public const string Woodcutting = "woodcutting";
        public const string Mining = "mining";
        public const string Fishing = "fishing";

        public static readonly string[] All =
        {
            Attack, Strength, Defense, Hitpoints,
            Cooking, Smithing, Carpentry, Construction,
            Farming, Woodcutting, Mining, Fishing,
        };

        public static readonly string[] Combat = { Attack, Strength, Defense, Hitpoints };

        /// <summary>Craftable via the Craft panel; construction uses the Build panel.</summary>
        public static readonly string[] Craft = { Cooking, Smithing, Carpentry };

        public static bool IsSkill(string id) => Array.IndexOf(All, id) >= 0;
    }
}
