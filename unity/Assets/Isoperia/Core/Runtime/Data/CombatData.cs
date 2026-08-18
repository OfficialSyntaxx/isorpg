using System;
using System.Collections.Generic;

namespace Isoperia.Core.Data
{
    // =======================================================================
    // Attack styles
    // =======================================================================

    /// <summary>
    /// A fight stance. Shifts the accuracy/max-hit/defense split and decides
    /// which skill trains — before styles existed every hit trained attack,
    /// strength and hitpoints at once, so there was no way to specialise.
    /// </summary>
    public sealed class AttackStyleDef
    {
        public string Id;
        public string Name;
        public string Description;
        public int AccuracyBonus;
        public int MaxHitBonus;
        public int DefenseBonus;

        /// <summary>The skill this stance trains, on top of the constant
        /// hitpoints trickle.</summary>
        public string Trains;
    }

    // =======================================================================
    // Resolve buffs
    // =======================================================================

    /// <summary>
    /// A short combat buff paid for out of Resolve, which is restored by resting
    /// at a Campfire. This gives food a rival for bag space: a buff costs nothing
    /// to carry but runs out mid-fight if it is not managed.
    /// </summary>
    public sealed class BuffDef
    {
        public string Id;
        public string Name;
        public string Description;
        public int AccuracyBonus;
        public int MaxHitBonus;
        public int DefenseBonus;

        /// <summary>Resolve spent per 600 ms combat tick while active.</summary>
        public int CostPerTick;
    }

    // =======================================================================
    // Weapon specials
    // =======================================================================

    /// <summary>
    /// A charge-based special per weapon, so weapon choice survives past a
    /// max-hit comparison. The 2H already had a slow/heavy identity from its tick
    /// rate; everything else swung the same way with a different number on it.
    /// </summary>
    public sealed class SpecialDef
    {
        public string Name;
        public string Description;

        /// <summary>Percent of a full bar this costs; the bar is 0..100.</summary>
        public int Cost;

        /// <summary>Multiplies the normal max-hit roll.</summary>
        public double DamageMult;

        /// <summary>Bypasses the accuracy roll entirely — the hit always lands.</summary>
        public bool GuaranteedHit;

        /// <summary>Replaces <see cref="DamageMult"/> when the target is under
        /// 25% HP. Zero means the special has no execute behaviour.</summary>
        public double ExecuteMult;

        public bool HasExecute => ExecuteMult > 0;
    }

    // =======================================================================
    // Affixes
    // =======================================================================

    /// <summary>
    /// An occasional prefix on a common spawn — cheap variety across every
    /// non-boss monster without new content. Bosses keep their fixed identity;
    /// they already have slam and enrage mechanics doing this job.
    /// </summary>
    public sealed class AffixDef
    {
        public string Id;
        public string Label;
        public string Description;

        /// <summary>Emissive tint applied to the monster's idle materials, as the
        /// visual tell that it is affixed.</summary>
        public string Tint;
    }

    // =======================================================================
    // Weapons and monsters
    // =======================================================================

    public sealed class WeaponDef
    {
        public string Id;
        public string Name;

        /// <summary>"melee" or "ranged".</summary>
        public string Kind;

        /// <summary>600 ms ticks between attacks. Shortbow 3 (1.8 s), 2H 6 (3.6 s).</summary>
        public int Ticks;

        /// <summary>Inventory item that grants this weapon; null means fists.</summary>
        public string ItemId;

        public int MaxHit;
        public int Accuracy;
        public int RequiredAttack;
    }

    public sealed class DropEntry
    {
        public string ItemId;
        public int Weight;
        public int Min = 1;
        public int Max = 1;

        public DropEntry() { }

        public DropEntry(string itemId, int weight, int min, int max)
        {
            ItemId = itemId; Weight = weight; Min = min; Max = max;
        }

        public DropEntry Clone() => new DropEntry(ItemId, Weight, Min, Max);
    }

    /// <summary>An independent roll, separate from the weighted main table.</summary>
    public sealed class ChanceDrop
    {
        public string ItemId;
        public double Chance;
        public int Min = 1;
        public int Max = 1;

        public ChanceDrop() { }

        public ChanceDrop(string itemId, double chance, int min = 1, int max = 1)
        {
            ItemId = itemId; Chance = chance; Min = min; Max = max;
        }

        public ChanceDrop Clone() => new ChanceDrop(ItemId, Chance, Min, Max);
    }

    public sealed class MonsterXp
    {
        public double Attack;
        public double Strength;
        public double Defense;
        public double Hitpoints;

        public double For(string skill)
        {
            switch (skill)
            {
                case Skills.Attack: return Attack;
                case Skills.Strength: return Strength;
                case Skills.Defense: return Defense;
                case Skills.Hitpoints: return Hitpoints;
                default: return 0;
            }
        }
    }

    public sealed class MonsterDef
    {
        public string Id;
        public string Name;
        public int Level;
        public int Hp;
        public int MaxHit;
        public int AttackTick;
        public int AttackRoll;
        public int DefenseRoll;
        public bool Ranged;

        /// <summary>Tiles. Zero is passive — it attacks only when hit.</summary>
        public int AggroRange;

        /// <summary>Bosses enrage below half HP and telegraph slams.</summary>
        public bool Boss;

        /// <summary>Per-tick chance a boss telegraphs a slam even at full HP.</summary>
        public double SlamChance;

        /// <summary>Fixed slam damage; zero means roll the default 6–10.</summary>
        public int SlamDmg;

        /// <summary>Which affix scaled THIS INSTANCE, or null. The shared table
        /// entry is never mutated — see <see cref="CombatMath.ApplyAffix"/>.</summary>
        public string Affix;

        public MonsterXp Xp = new MonsterXp();
        public List<DropEntry> Main = new List<DropEntry>();
        public List<ChanceDrop> Tertiary = new List<ChanceDrop>();
        public List<ChanceDrop> PetTable = new List<ChanceDrop>();
        public int RespawnMs;

        /// <summary>
        /// A deep-enough copy that an affixed instance can be scaled without
        /// touching the shared definition. The drop lists are cloned because
        /// the "rich" affix rewrites their quantities and chances.
        /// </summary>
        public MonsterDef Clone()
        {
            var c = (MonsterDef)MemberwiseClone();
            c.Xp = new MonsterXp { Attack = Xp.Attack, Strength = Xp.Strength, Defense = Xp.Defense, Hitpoints = Xp.Hitpoints };
            c.Main = new List<DropEntry>();
            foreach (var d in Main) c.Main.Add(d.Clone());
            c.Tertiary = new List<ChanceDrop>();
            foreach (var t in Tertiary) c.Tertiary.Add(t.Clone());
            c.PetTable = new List<ChanceDrop>();
            foreach (var p in PetTable) c.PetTable.Add(p.Clone());
            return c;
        }
    }

    // =======================================================================
    // The rule tables
    //
    // These are small, fixed and referenced directly by the combat math, so they
    // live here as constants. The larger content tables -- WEAPONS and MONSTERS
    // -- are loaded from JSON in Phase 2d instead.
    // =======================================================================

    public static class CombatRules
    {
        // ---- attack styles -------------------------------------------------

        public const string StyleAccurate = "accurate";
        public const string StyleAggressive = "aggressive";
        public const string StyleDefensive = "defensive";
        public const string DefaultAttackStyle = StyleAccurate;

        public static readonly Dictionary<string, AttackStyleDef> AttackStyles =
            new Dictionary<string, AttackStyleDef>
            {
                [StyleAccurate] = new AttackStyleDef
                {
                    Id = StyleAccurate, Name = "Accurate", Description = "+3 accuracy · trains Attack",
                    AccuracyBonus = 3, MaxHitBonus = 0, DefenseBonus = 0, Trains = Skills.Attack,
                },
                [StyleAggressive] = new AttackStyleDef
                {
                    Id = StyleAggressive, Name = "Aggressive", Description = "+3 max hit · trains Strength",
                    AccuracyBonus = 0, MaxHitBonus = 3, DefenseBonus = 0, Trains = Skills.Strength,
                },
                [StyleDefensive] = new AttackStyleDef
                {
                    Id = StyleDefensive, Name = "Defensive", Description = "+3 defense · trains Defense",
                    AccuracyBonus = 0, MaxHitBonus = 0, DefenseBonus = 3, Trains = Skills.Defense,
                },
            };

        /// <summary>An unrecognised style falls back to Accurate rather than throwing.</summary>
        public static AttackStyleDef Style(string id) =>
            id != null && AttackStyles.TryGetValue(id, out AttackStyleDef s) ? s : AttackStyles[DefaultAttackStyle];

        // ---- Resolve -------------------------------------------------------

        public const int ResolveMax = 100;

        /// <summary>Resolve regained per tick while resting near a Campfire.</summary>
        public const int ResolveRegenPerTick = 3;

        /// <summary>Chebyshev distance from a Campfire that still counts as resting.</summary>
        public const int ResolveRegenRange = 2;

        public const string BuffPrecision = "precision";
        public const string BuffPower = "power";
        public const string BuffWarden = "warden";

        public static readonly Dictionary<string, BuffDef> Buffs =
            new Dictionary<string, BuffDef>
            {
                [BuffPrecision] = new BuffDef
                {
                    Id = BuffPrecision, Name = "Precision", Description = "+6 accuracy while active",
                    AccuracyBonus = 6, MaxHitBonus = 0, DefenseBonus = 0, CostPerTick = 2,
                },
                [BuffPower] = new BuffDef
                {
                    Id = BuffPower, Name = "Power", Description = "+4 max hit while active",
                    AccuracyBonus = 0, MaxHitBonus = 4, DefenseBonus = 0, CostPerTick = 2,
                },
                [BuffWarden] = new BuffDef
                {
                    Id = BuffWarden, Name = "Warden", Description = "+6 defense while active",
                    AccuracyBonus = 0, MaxHitBonus = 0, DefenseBonus = 6, CostPerTick = 2,
                },
            };

        /// <summary>The zero buff, so callers never branch on null.</summary>
        public static readonly BuffDef NoBuff = new BuffDef
        {
            Id = null, Name = "None", AccuracyBonus = 0, MaxHitBonus = 0, DefenseBonus = 0, CostPerTick = 0,
        };

        /// <summary>An unrecognised buff id contributes nothing, rather than throwing.</summary>
        public static BuffDef Buff(string id) =>
            id != null && Buffs.TryGetValue(id, out BuffDef b) ? b : NoBuff;

        // ---- specials ------------------------------------------------------

        public const int SpecialMax = 100;

        /// <summary>Regained anywhere, unlike Resolve, which needs a Campfire.</summary>
        public const int SpecialRegenPerTick = 1;

        public static readonly Dictionary<string, SpecialDef> WeaponSpecials =
            new Dictionary<string, SpecialDef>
            {
                ["dagger"] = new SpecialDef
                {
                    Name = "Puncture", Description = "Always hits · 1.2× damage · 25% bar",
                    Cost = 25, DamageMult = 1.2, GuaranteedHit = true,
                },
                ["sword"] = new SpecialDef
                {
                    Name = "Riposte", Description = "1.3× damage · 40% bar",
                    Cost = 40, DamageMult = 1.3, GuaranteedHit = false,
                },
                ["sword2h"] = new SpecialDef
                {
                    Name = "Cleave", Description = "1.8× damage · 100% bar",
                    Cost = 100, DamageMult = 1.8, GuaranteedHit = false,
                },
                ["shortbow"] = new SpecialDef
                {
                    Name = "Piercing Shot", Description = "Always hits · 1.4× damage · 50% bar",
                    Cost = 50, DamageMult = 1.4, GuaranteedHit = true,
                },
                ["iron_sword"] = new SpecialDef
                {
                    Name = "Execute", Description = "1.2× damage (2.2× under 25% HP) · 60% bar",
                    Cost = 60, DamageMult = 1.2, GuaranteedHit = false, ExecuteMult = 2.2,
                },
                ["steel_sword"] = new SpecialDef
                {
                    Name = "Onslaught", Description = "1.9× damage · 80% bar",
                    Cost = 80, DamageMult = 1.9, GuaranteedHit = false,
                },
            };

        public static SpecialDef SpecialFor(string weaponId) =>
            weaponId != null && WeaponSpecials.TryGetValue(weaponId, out SpecialDef s) ? s : null;

        /// <summary>Below this fraction of max HP, an execute special applies its
        /// bigger multiplier.</summary>
        public const double ExecuteThreshold = 0.25;

        // ---- affixes -------------------------------------------------------

        public const string AffixHardened = "hardened";
        public const string AffixSwift = "swift";
        public const string AffixRich = "rich";

        public const double AffixChance = 0.12;

        /// <summary>
        /// Insertion order matters: <see cref="CombatMath.RollAffix"/> indexes
        /// this array with a random draw, so reordering it changes which affix a
        /// given seed produces.
        /// </summary>
        public static readonly string[] AffixIds = { AffixHardened, AffixSwift, AffixRich };

        public static readonly Dictionary<string, AffixDef> Affixes =
            new Dictionary<string, AffixDef>
            {
                [AffixHardened] = new AffixDef
                {
                    Id = AffixHardened, Label = "Hardened",
                    Description = "+50% HP, +30% max hit, +30% defense", Tint = "#ff5a3a",
                },
                [AffixSwift] = new AffixDef
                {
                    Id = AffixSwift, Label = "Swift",
                    Description = "~40% faster attacks, wider aggro range", Tint = "#55d6ff",
                },
                [AffixRich] = new AffixDef
                {
                    Id = AffixRich, Label = "Rich",
                    Description = "Double coin drops, doubled tertiary chance", Tint = "#ffd75a",
                },
            };

        // ---- boss behaviour ------------------------------------------------

        /// <summary>Bosses enrage at or below this fraction of max HP.</summary>
        public const double EnrageThreshold = 0.5;

        /// <summary>Extra max hit while enraged.</summary>
        public const int EnrageMaxHitBonus = 2;

        /// <summary>An enraged boss attacks on this tick rate regardless of its own.</summary>
        public const int EnragedAttackTick = 2;

        /// <summary>Per-tick slam chance once enraged.</summary>
        public const double EnragedSlamChance = 0.15;

        /// <summary>A telegraphed slam lands this long after it is announced.</summary>
        public const int SlamDelayMs = 1600;

        /// <summary>Default slam damage is 6 + floor(rand * 5), i.e. 6..10.</summary>
        public const int SlamBaseDamage = 6;
        public const int SlamDamageSpread = 5;

        /// <summary>The currency id, doubled by the "rich" affix.</summary>
        public const string CoinsItemId = "coins";
    }
}
