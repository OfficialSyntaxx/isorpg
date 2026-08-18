using System;
using System.Collections.Generic;
using Isoperia.Core.Data;
using Isoperia.Core.Sim;

namespace Isoperia.Core.Combat
{
    /// <summary>Aggregate bonuses from worn equipment, passed in rather than
    /// recomputed here so this stays free of inventory concerns.</summary>
    public struct GearBonuses
    {
        public int Attack;
        public int Strength;
        public int Defense;
        public int MaxHp;
    }

    /// <summary>The outcome of one swing.</summary>
    public struct AttackResult
    {
        /// <summary>False means a splash: the tick was consumed, no damage dealt.</summary>
        public bool Hit;

        /// <summary>Damage dealt. Always at least 1 on a hit, never above the max hit.</summary>
        public int Damage;

        /// <summary>The max hit this swing rolled against, after every modifier.</summary>
        public int MaxHit;

        /// <summary>True when an execute special applied its larger multiplier.</summary>
        public bool Executed;
    }

    /// <summary>One item awarded by a kill.</summary>
    public struct DropAward
    {
        public string ItemId;
        public int Quantity;

        /// <summary>True for a pet, which is announced and logged differently.</summary>
        public bool IsPet;

        public DropAward(string itemId, int quantity, bool isPet = false)
        {
            ItemId = itemId; Quantity = quantity; IsPet = isPet;
        }
    }

    /// <summary>
    /// The combat rules, as pure functions over an injected random source.
    ///
    /// Port of the resolution half of <c>src/systems/CombatSystem.ts</c> and
    /// <c>src/data/Combat.ts</c>, pinned by <c>docs/PORTING_SPEC.md</c> §6.
    ///
    /// **Draw order is part of the contract.** Every method that takes an
    /// <see cref="IRandom"/> documents how many values it consumes and in what
    /// order, because two implementations can agree on every formula and still
    /// produce different fights from the same seed if they draw in a different
    /// sequence. <c>scripts/verify-combat-parity.cjs</c> checks this by running
    /// both implementations off the same generator and comparing roll for roll.
    ///
    /// What is deliberately NOT here: chase AI, actor animation, callbacks, and
    /// respawn scheduling. Those are coupled to the world and to presentation and
    /// land with the systems phase; this file is the part that decides outcomes.
    /// </summary>
    public static class CombatMath
    {
        // ===================================================================
        // Accuracy
        // ===================================================================

        /// <summary>
        /// Probability that an attack roll beats a defense roll. Deterministic —
        /// consumes no randomness.
        /// </summary>
        public static double HitChance(double attackRoll, double defenseRoll)
        {
            if (attackRoll > defenseRoll)
                return 1.0 - (defenseRoll + 2.0) / (2.0 * (attackRoll + 1.0));

            return attackRoll / (2.0 * (defenseRoll + 1.0));
        }

        /// <summary>The player's attack roll, before it is compared to defense.</summary>
        public static int PlayerAttackRoll(
            WeaponDef weapon, int attackLevel, GearBonuses gear,
            AttackStyleDef style, BuffDef buff) =>
            weapon.Accuracy + attackLevel + gear.Attack + style.AccuracyBonus + buff.AccuracyBonus;

        /// <summary>
        /// The player's effective defense roll. Note the monster's hit chance is
        /// computed against <c>2 + this</c>, not against this directly.
        /// </summary>
        public static int PlayerDefenseRoll(
            int defenseLevel, GearBonuses gear, AttackStyleDef style, BuffDef buff) =>
            defenseLevel + gear.Defense + style.DefenseBonus + buff.DefenseBonus;

        /// <summary>
        /// The player's max hit before any special multiplier. Strength
        /// contributes one point per four levels, floored.
        /// </summary>
        public static int PlayerBaseMaxHit(
            WeaponDef weapon, int strengthLevel, GearBonuses gear,
            AttackStyleDef style, BuffDef buff) =>
            weapon.MaxHit + strengthLevel / 4 + gear.Strength + style.MaxHitBonus + buff.MaxHitBonus;

        // ===================================================================
        // Swings
        // ===================================================================

        /// <summary>
        /// Resolve one player swing.
        ///
        /// Draws, in order:
        ///   1. accuracy — SKIPPED entirely when the special guarantees the hit
        ///   2. damage   — only when the swing lands
        ///
        /// The skipped accuracy draw on a guaranteed special is not an
        /// optimisation, it is the behaviour: taking it anyway would shift every
        /// subsequent roll in the fight.
        /// </summary>
        public static AttackResult ResolvePlayerAttack(
            IRandom rng,
            WeaponDef weapon,
            int attackLevel,
            int strengthLevel,
            GearBonuses gear,
            AttackStyleDef style,
            BuffDef buff,
            SpecialDef special,
            int targetDefenseRoll,
            int targetHp,
            int targetMaxHp)
        {
            var result = new AttackResult();

            int roll = PlayerAttackRoll(weapon, attackLevel, gear, style, buff);

            bool guaranteed = special != null && special.GuaranteedHit;
            if (!guaranteed && rng.Next() > HitChance(roll, targetDefenseRoll))
                return result;   // splash: Hit stays false, Damage stays 0

            result.Hit = true;

            int maxHit = PlayerBaseMaxHit(weapon, strengthLevel, gear, style, buff);

            if (special != null)
            {
                bool executing = special.HasExecute
                    && targetMaxHp > 0
                    && (double)targetHp / targetMaxHp < CombatRules.ExecuteThreshold;

                double mult = executing ? special.ExecuteMult : special.DamageMult;
                maxHit = (int)Math.Round(maxHit * mult, MidpointRounding.AwayFromZero);
                result.Executed = executing;
            }

            result.MaxHit = maxHit;
            result.Damage = RollDamage(rng, maxHit);
            return result;
        }

        /// <summary>
        /// Resolve one monster swing.
        ///
        /// Draws, in order: accuracy, then damage only when it lands.
        /// </summary>
        public static AttackResult ResolveMonsterAttack(
            IRandom rng,
            MonsterDef monster,
            bool enraged,
            int playerDefenseRoll)
        {
            var result = new AttackResult();

            // The +2 floor keeps an unarmoured level-1 player from being hit
            // essentially every swing.
            if (rng.Next() > HitChance(monster.AttackRoll, 2 + playerDefenseRoll))
                return result;   // dodge

            result.Hit = true;
            result.MaxHit = monster.MaxHit + (enraged ? CombatRules.EnrageMaxHitBonus : 0);
            result.Damage = RollDamage(rng, result.MaxHit);
            return result;
        }

        /// <summary>
        /// Damage from a max hit: <c>1 + floor(rand * max(1, maxHit))</c>.
        ///
        /// So a landed hit is always at least 1 and never exceeds the max hit.
        /// Consumes exactly one draw.
        /// </summary>
        public static int RollDamage(IRandom rng, int maxHit) =>
            1 + (int)Math.Floor(rng.Next() * Math.Max(1, maxHit));

        // ===================================================================
        // Drops
        // ===================================================================

        /// <summary>
        /// Inclusive integer in [min, max]. Consumes exactly one draw.
        /// </summary>
        public static int Rand(IRandom rng, int min, int max) =>
            min + (int)Math.Floor(rng.Next() * (max - min + 1));

        /// <summary>
        /// One weighted pick. Consumes exactly one draw; returns null for an
        /// empty table.
        ///
        /// The fall-through to the last entry is deliberate: floating-point drift
        /// in the running subtraction can leave the accumulator marginally above
        /// zero after the final weight, and returning null there would silently
        /// drop a drop.
        /// </summary>
        public static DropEntry RollWeighted(IRandom rng, List<DropEntry> entries)
        {
            if (entries == null || entries.Count == 0) return null;

            double total = 0;
            foreach (var e in entries) total += e.Weight;

            double r = rng.Next() * total;
            foreach (var e in entries)
            {
                r -= e.Weight;
                if (r <= 0) return e;
            }

            return entries[entries.Count - 1];
        }

        /// <summary>
        /// Everything a kill awards.
        ///
        /// Draws, in order:
        ///   1. the weighted main pick, then its quantity  (2 draws, if the table is non-empty)
        ///   2. per tertiary entry: a chance roll, then a quantity roll only if it hits
        ///   3. per pet entry: a chance roll (pets are always quantity 1)
        ///
        /// The main table's quantity roll is easy to lose: an early version of
        /// the original discarded min/max and paid exactly 1 of everything, so a
        /// Zombie's "10–40 coins" paid a single coin.
        /// </summary>
        public static List<DropAward> RollDrops(IRandom rng, MonsterDef monster)
        {
            var awards = new List<DropAward>();

            DropEntry main = RollWeighted(rng, monster.Main);
            if (main != null)
                awards.Add(new DropAward(main.ItemId, Rand(rng, main.Min, main.Max)));

            if (monster.Tertiary != null)
            {
                foreach (var t in monster.Tertiary)
                {
                    if (rng.Next() >= t.Chance) continue;
                    awards.Add(new DropAward(t.ItemId, Rand(rng, t.Min, t.Max)));
                }
            }

            if (monster.PetTable != null)
            {
                foreach (var p in monster.PetTable)
                {
                    if (rng.Next() >= p.Chance) continue;
                    awards.Add(new DropAward(p.ItemId, 1, isPet: true));
                }
            }

            return awards;
        }

        // ===================================================================
        // Affixes
        // ===================================================================

        /// <summary>
        /// Roll an affix for a fresh spawn, or null.
        ///
        /// Draws ONE value when no affix is rolled and TWO when one is — the
        /// second picks which. That asymmetry is load-bearing for seed parity.
        /// </summary>
        public static string RollAffix(IRandom rng)
        {
            if (rng.Next() >= CombatRules.AffixChance) return null;

            int i = (int)Math.Floor(rng.Next() * CombatRules.AffixIds.Length);
            if (i >= CombatRules.AffixIds.Length) i = CombatRules.AffixIds.Length - 1;   // guard rand()==1
            return CombatRules.AffixIds[i];
        }

        /// <summary>
        /// Scale a definition for one affix, returning a fresh per-instance copy.
        ///
        /// **The shared table entry is never mutated.** An affixed spawn that
        /// wrote back to the shared definition would permanently buff every other
        /// monster of that type for the rest of the session, compounding on each
        /// new spawn. Consumes no randomness.
        /// </summary>
        public static MonsterDef ApplyAffix(MonsterDef def, string affix)
        {
            if (affix == null || !CombatRules.Affixes.ContainsKey(affix)) return def;

            MonsterDef m = def.Clone();
            m.Affix = affix;
            m.Name = CombatRules.Affixes[affix].Label + " " + def.Name;

            switch (affix)
            {
                case CombatRules.AffixHardened:
                    m.Hp = RoundHalfUp(def.Hp * 1.5);
                    m.MaxHit = RoundHalfUp(def.MaxHit * 1.3);
                    m.DefenseRoll = RoundHalfUp(def.DefenseRoll * 1.3);
                    break;

                case CombatRules.AffixSwift:
                    m.AttackTick = Math.Max(1, RoundHalfUp(def.AttackTick * 0.6));
                    m.AggroRange = def.AggroRange + 2;
                    break;

                case CombatRules.AffixRich:
                    foreach (var d in m.Main)
                    {
                        if (d.ItemId != CombatRules.CoinsItemId) continue;
                        d.Min *= 2;
                        d.Max *= 2;
                    }
                    foreach (var t in m.Tertiary) t.Chance = Math.Min(1.0, t.Chance * 2.0);
                    break;
            }

            return m;
        }

        /// <summary>
        /// JavaScript's <c>Math.round</c>: halves go toward positive infinity, not
        /// away from zero. Every value it is applied to here is positive, so the
        /// two agree — but the affix multipliers are the one place a negative
        /// would silently diverge, so the intent is stated rather than assumed.
        /// </summary>
        private static int RoundHalfUp(double v) => (int)Math.Floor(v + 0.5);

        // ===================================================================
        // Per-tick upkeep
        // ===================================================================

        /// <summary>
        /// Resolve upkeep for one tick: the active buff drains, and resting near a
        /// Campfire regenerates. Returns the new Resolve value, and clears the
        /// buff through <paramref name="activeBuff"/> when it can no longer be
        /// paid for.
        /// </summary>
        public static int TickResolve(int resolve, ref string activeBuff, bool nearCampfire)
        {
            if (activeBuff != null)
            {
                BuffDef b = CombatRules.Buff(activeBuff);
                resolve -= b.CostPerTick;

                if (resolve <= 0)
                {
                    resolve = 0;
                    activeBuff = null;   // it lapses rather than going into debt
                }
            }
            else if (nearCampfire && resolve < CombatRules.ResolveMax)
            {
                resolve = Math.Min(CombatRules.ResolveMax, resolve + CombatRules.ResolveRegenPerTick);
            }

            return resolve;
        }

        /// <summary>The special bar regains anywhere, unlike Resolve.</summary>
        public static int TickSpecialEnergy(int energy) =>
            energy >= CombatRules.SpecialMax
                ? CombatRules.SpecialMax
                : Math.Min(CombatRules.SpecialMax, energy + CombatRules.SpecialRegenPerTick);

        /// <summary>Bosses enrage at or below half HP.</summary>
        public static bool IsEnraged(MonsterDef def, int hp, int maxHp) =>
            def.Boss && hp > 0 && hp <= maxHp * CombatRules.EnrageThreshold;

        /// <summary>An enraged boss swings on a fixed faster tick.</summary>
        public static int EffectiveAttackTick(MonsterDef def, bool enraged) =>
            def.Boss && enraged ? CombatRules.EnragedAttackTick : def.AttackTick;

        /// <summary>
        /// Whether a boss telegraphs a slam this tick, and for how much.
        ///
        /// Draws one value for the chance; a second only when a slam starts AND
        /// the monster has no fixed <c>SlamDmg</c>.
        /// </summary>
        public static bool TryStartSlam(IRandom rng, MonsterDef def, bool enraged, out int damage)
        {
            damage = 0;
            if (!def.Boss) return false;

            double chance = enraged ? CombatRules.EnragedSlamChance : def.SlamChance;
            if (rng.Next() >= chance) return false;

            damage = def.SlamDmg > 0
                ? def.SlamDmg
                : CombatRules.SlamBaseDamage + (int)Math.Floor(rng.Next() * CombatRules.SlamDamageSpread);

            return true;
        }
    }
}
