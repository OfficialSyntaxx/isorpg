using System.Collections.Generic;
using NUnit.Framework;
using Isoperia.Core.Combat;
using Isoperia.Core.Data;
using Isoperia.Core.Sim;

namespace Isoperia.Core.Tests
{
    /// <summary>
    /// Combat resolution. Every expected number comes from the TypeScript at tag
    /// <c>web-final</c>, so a failure means the port drifted rather than that the
    /// balance changed.
    ///
    /// A large share of these assert DRAW ORDER rather than arithmetic. Two
    /// implementations can agree on every formula and still produce different
    /// fights from the same seed if one takes its accuracy roll where the other
    /// skips it — and that class of bug is invisible to a test that only checks
    /// "damage was between 1 and max".
    /// </summary>
    public class CombatMathTests
    {
        private static WeaponDef Sword() => new WeaponDef
        {
            Id = "sword", Name = "Bronze Sword", Kind = "melee",
            Ticks = 4, ItemId = "bronze_sword", MaxHit = 6, Accuracy = 12, RequiredAttack = 1,
        };

        private static MonsterDef Rat() => new MonsterDef
        {
            Id = "giant_rat", Name = "Giant Rat", Level = 1, Hp = 8, MaxHit = 1,
            AttackTick = 4, AttackRoll = 4, DefenseRoll = 2, AggroRange = 3,
            Xp = new MonsterXp { Attack = 4, Strength = 2, Defense = 2, Hitpoints = 1 },
            Main =
            {
                new DropEntry("raw_rat_meat", 50, 1, 1),
                new DropEntry("coins", 180, 1, 6),
                new DropEntry("bones", 60, 1, 1),
            },
            Tertiary = { new ChanceDrop("rat_bone", 0.02) },
            PetTable = { new ChanceDrop("pet_rat", 0.0004) },
            RespawnMs = 20000,
        };

        private static AttackStyleDef Style(string id) => CombatRules.Style(id);
        private static GearBonuses NoGear() => new GearBonuses();

        // ===================================================================
        // Hit chance
        // ===================================================================

        [Test]
        public void HitChanceUsesTheHighRollBranchWhenAttackExceedsDefense()
        {
            // 1 - (2 + 2) / (2 * (12 + 1)) = 1 - 4/26
            Assert.AreEqual(1.0 - 4.0 / 26.0, CombatMath.HitChance(12, 2), 1e-12);
        }

        [Test]
        public void HitChanceUsesTheLowRollBranchOtherwise()
        {
            // 4 / (2 * (20 + 1))
            Assert.AreEqual(4.0 / 42.0, CombatMath.HitChance(4, 20), 1e-12);
        }

        /// <summary>
        /// The two branches meet exactly at equal rolls, so the comparison
        /// direction does not matter there:
        ///
        ///   high, at a == d:  1 - (a+2)/(2(a+1))  =  (2a+2-a-2)/(2a+2)  =  a/(2a+2)
        ///   low,  at a == d:  a/(2(a+1))                                =  a/(2a+2)
        ///
        /// Worth pinning rather than assuming. Mutating `>` to `>=` produces an
        /// identical build, which looked at first like a hole in the parity
        /// harness and is in fact a property of the formula. Anyone later
        /// "tightening" this comparison should know it is a no-op, and anyone
        /// changing the formula should know this continuity is what makes an
        /// evenly matched fight behave sensibly instead of stepping.
        /// </summary>
        [Test]
        public void TheTwoBranchesMeetAtEqualRolls()
        {
            for (int n = 0; n <= 40; n++)
            {
                double high = 1.0 - (n + 2.0) / (2.0 * (n + 1.0));
                double low = n / (2.0 * (n + 1.0));

                Assert.AreEqual(low, high, 1e-15, $"branches disagree at roll {n}");
                Assert.AreEqual(low, CombatMath.HitChance(n, n), 1e-15, $"at roll {n}");
            }

            Assert.AreEqual(10.0 / 22.0, CombatMath.HitChance(10, 10), 1e-12);
            Assert.Less(CombatMath.HitChance(10, 10), 0.5, "an even match still favours the defender");
        }

        [Test]
        public void HitChanceIsAlwaysAProbability()
        {
            for (int a = 0; a <= 60; a += 3)
                for (int d = 0; d <= 60; d += 3)
                {
                    double p = CombatMath.HitChance(a, d);
                    Assert.GreaterOrEqual(p, 0.0, $"attack {a} vs defense {d}");
                    Assert.LessOrEqual(p, 1.0, $"attack {a} vs defense {d}");
                }
        }

        [Test]
        public void HitChanceRisesWithAccuracyAndFallsWithDefense()
        {
            Assert.Greater(CombatMath.HitChance(30, 10), CombatMath.HitChance(20, 10));
            Assert.Less(CombatMath.HitChance(20, 30), CombatMath.HitChance(20, 10));
        }

        // ===================================================================
        // Rolls
        // ===================================================================

        [Test]
        public void AttackRollSumsWeaponLevelGearStyleAndBuff()
        {
            var gear = new GearBonuses { Attack = 5 };
            int roll = CombatMath.PlayerAttackRoll(
                Sword(), 20, gear, Style(CombatRules.StyleAccurate), CombatRules.Buff(CombatRules.BuffPrecision));

            Assert.AreEqual(12 + 20 + 5 + 3 + 6, roll);
        }

        /// <summary>Strength contributes one point per four levels, floored.</summary>
        [Test]
        public void MaxHitTakesOnePointPerFourStrengthLevels()
        {
            var none = CombatRules.NoBuff;
            var acc = Style(CombatRules.StyleAccurate);

            Assert.AreEqual(6 + 0, CombatMath.PlayerBaseMaxHit(Sword(), 3, NoGear(), acc, none), "3/4 = 0");
            Assert.AreEqual(6 + 1, CombatMath.PlayerBaseMaxHit(Sword(), 4, NoGear(), acc, none));
            Assert.AreEqual(6 + 1, CombatMath.PlayerBaseMaxHit(Sword(), 7, NoGear(), acc, none), "7/4 = 1");
            Assert.AreEqual(6 + 24, CombatMath.PlayerBaseMaxHit(Sword(), 99, NoGear(), acc, none), "99/4 = 24");
        }

        [Test]
        public void StylesShiftExactlyOneStatEach()
        {
            var none = CombatRules.NoBuff;

            Assert.AreEqual(3, Style(CombatRules.StyleAccurate).AccuracyBonus);
            Assert.AreEqual(0, Style(CombatRules.StyleAccurate).MaxHitBonus);
            Assert.AreEqual(Skills.Attack, Style(CombatRules.StyleAccurate).Trains);

            Assert.AreEqual(3, Style(CombatRules.StyleAggressive).MaxHitBonus);
            Assert.AreEqual(Skills.Strength, Style(CombatRules.StyleAggressive).Trains);

            Assert.AreEqual(3, Style(CombatRules.StyleDefensive).DefenseBonus);
            Assert.AreEqual(Skills.Defense, Style(CombatRules.StyleDefensive).Trains);

            Assert.AreEqual(6 + 3, CombatMath.PlayerBaseMaxHit(
                Sword(), 0, NoGear(), Style(CombatRules.StyleAggressive), none));
        }

        [Test]
        public void AnUnknownStyleOrBuffDegradesToTheDefault()
        {
            Assert.AreEqual(CombatRules.StyleAccurate, CombatRules.Style("berserk").Id);
            Assert.AreEqual(CombatRules.StyleAccurate, CombatRules.Style(null).Id);

            Assert.AreEqual(0, CombatRules.Buff("godmode").AccuracyBonus);
            Assert.AreEqual(0, CombatRules.Buff(null).MaxHitBonus);
        }

        // ===================================================================
        // Damage
        // ===================================================================

        [Test]
        public void DamageIsAtLeastOneAndNeverExceedsMaxHit()
        {
            Assert.AreEqual(1, CombatMath.RollDamage(new ScriptedRandom(0.0), 10), "the floor is 1, never 0");
            Assert.AreEqual(10, CombatMath.RollDamage(new ScriptedRandom(0.999999), 10));

            var rng = new Mulberry32Random(99);
            for (int i = 0; i < 5000; i++)
            {
                int d = CombatMath.RollDamage(rng, 7);
                Assert.GreaterOrEqual(d, 1);
                Assert.LessOrEqual(d, 7);
            }
        }

        /// <summary>A max hit of zero still deals 1, because of the max(1, …) guard.</summary>
        [Test]
        public void AZeroMaxHitStillDealsOne()
        {
            Assert.AreEqual(1, CombatMath.RollDamage(new ScriptedRandom(0.999999), 0));
        }

        // ===================================================================
        // Player swings — draw order
        // ===================================================================

        [Test]
        public void AMissConsumesOnlyTheAccuracyDraw()
        {
            var rng = new ScriptedRandom(0.99, 0.5);   // 0.99 misses against a rat

            AttackResult r = CombatMath.ResolvePlayerAttack(
                rng, Sword(), 1, 1, NoGear(), Style(CombatRules.StyleAccurate), CombatRules.NoBuff,
                null, targetDefenseRoll: 2, targetHp: 8, targetMaxHp: 8);

            Assert.IsFalse(r.Hit, "0.99 should splash");
            Assert.AreEqual(0, r.Damage);
            Assert.AreEqual(1, rng.DrawCount, "a splash must not consume the damage draw");
        }

        [Test]
        public void AHitConsumesAccuracyThenDamageInThatOrder()
        {
            var rng = new ScriptedRandom(0.0, 0.999999);

            AttackResult r = CombatMath.ResolvePlayerAttack(
                rng, Sword(), 1, 1, NoGear(), Style(CombatRules.StyleAccurate), CombatRules.NoBuff,
                null, targetDefenseRoll: 2, targetHp: 8, targetMaxHp: 8);

            Assert.IsTrue(r.Hit);
            Assert.AreEqual(6, r.MaxHit);
            Assert.AreEqual(6, r.Damage, "the second draw is the damage roll");
            Assert.AreEqual(2, rng.DrawCount);
        }

        /// <summary>
        /// A guaranteed special SKIPS the accuracy draw entirely. Taking it anyway
        /// and ignoring the result would shift every later roll in the fight.
        /// </summary>
        [Test]
        public void AGuaranteedSpecialSkipsTheAccuracyDraw()
        {
            var rng = new ScriptedRandom(0.999999);
            SpecialDef puncture = CombatRules.SpecialFor("dagger");

            Assert.IsTrue(puncture.GuaranteedHit);

            AttackResult r = CombatMath.ResolvePlayerAttack(
                rng, Sword(), 1, 1, NoGear(), Style(CombatRules.StyleAccurate), CombatRules.NoBuff,
                puncture, targetDefenseRoll: 9999, targetHp: 8, targetMaxHp: 8);

            Assert.IsTrue(r.Hit, "it must land even against an impossible defense roll");
            Assert.AreEqual(1, rng.DrawCount, "only the damage draw is taken");
        }

        [Test]
        public void SpecialsMultiplyTheMaxHit()
        {
            // Base 6, Cleave is 1.8x -> round(10.8) = 11
            var rng = new ScriptedRandom(0.0, 0.999999);
            AttackResult r = CombatMath.ResolvePlayerAttack(
                rng, Sword(), 1, 1, NoGear(), Style(CombatRules.StyleAccurate), CombatRules.NoBuff,
                CombatRules.SpecialFor("sword2h"), 2, 8, 8);

            Assert.AreEqual(11, r.MaxHit);
        }

        /// <summary>Execute applies only below 25% HP, and only for a special that has it.</summary>
        [Test]
        public void ExecuteAppliesOnlyBelowTheThreshold()
        {
            SpecialDef execute = CombatRules.SpecialFor("iron_sword");
            Assert.IsTrue(execute.HasExecute);

            // 3/8 = 37.5%, above the threshold -> the normal 1.2x -> round(7.2) = 7
            AttackResult high = CombatMath.ResolvePlayerAttack(
                new ScriptedRandom(0.0, 0.999999), Sword(), 1, 1, NoGear(),
                Style(CombatRules.StyleAccurate), CombatRules.NoBuff, execute, 2, 3, 8);

            Assert.IsFalse(high.Executed);
            Assert.AreEqual(7, high.MaxHit);

            // 1/8 = 12.5%, below the threshold -> 2.2x -> round(13.2) = 13
            AttackResult low = CombatMath.ResolvePlayerAttack(
                new ScriptedRandom(0.0, 0.999999), Sword(), 1, 1, NoGear(),
                Style(CombatRules.StyleAccurate), CombatRules.NoBuff, execute, 2, 1, 8);

            Assert.IsTrue(low.Executed);
            Assert.AreEqual(13, low.MaxHit);
        }

        [Test]
        public void ExactlyAtTheThresholdDoesNotExecute()
        {
            // 2/8 = 25%, and the comparison is strictly less-than.
            AttackResult r = CombatMath.ResolvePlayerAttack(
                new ScriptedRandom(0.0, 0.5), Sword(), 1, 1, NoGear(),
                Style(CombatRules.StyleAccurate), CombatRules.NoBuff,
                CombatRules.SpecialFor("iron_sword"), 2, 2, 8);

            Assert.IsFalse(r.Executed);
        }

        [Test]
        public void ASpecialWithoutExecuteNeverExecutes()
        {
            AttackResult r = CombatMath.ResolvePlayerAttack(
                new ScriptedRandom(0.0, 0.5), Sword(), 1, 1, NoGear(),
                Style(CombatRules.StyleAccurate), CombatRules.NoBuff,
                CombatRules.SpecialFor("sword"), 2, 1, 8);

            Assert.IsFalse(r.Executed, "Riposte has no execute multiplier");
        }

        [Test]
        public void EverySpecialMatchesTheShippedNumbers()
        {
            Assert.AreEqual(100, CombatRules.SpecialMax);

            var expected = new Dictionary<string, (int cost, double mult, bool guaranteed)>
            {
                ["dagger"] = (25, 1.2, true),
                ["sword"] = (40, 1.3, false),
                ["sword2h"] = (100, 1.8, false),
                ["shortbow"] = (50, 1.4, true),
                ["iron_sword"] = (60, 1.2, false),
                ["steel_sword"] = (80, 1.9, false),
            };

            Assert.AreEqual(expected.Count, CombatRules.WeaponSpecials.Count, "special count");

            foreach (var kv in expected)
            {
                SpecialDef s = CombatRules.SpecialFor(kv.Key);
                Assert.IsNotNull(s, kv.Key);
                Assert.AreEqual(kv.Value.cost, s.Cost, kv.Key + " cost");
                Assert.AreEqual(kv.Value.mult, s.DamageMult, 1e-9, kv.Key + " multiplier");
                Assert.AreEqual(kv.Value.guaranteed, s.GuaranteedHit, kv.Key + " guaranteed hit");
            }

            Assert.AreEqual(2.2, CombatRules.SpecialFor("iron_sword").ExecuteMult, 1e-9);
        }

        // ===================================================================
        // Monster swings
        // ===================================================================

        [Test]
        public void MonsterAccuracyIsMeasuredAgainstTwoPlusPlayerDefense()
        {
            MonsterDef rat = Rat();

            // Defense 8 -> the roll is against 10, so hitChance(4, 10) = 4/22.
            double expected = CombatMath.HitChance(4, 10);
            var rng = new ScriptedRandom(expected + 0.001);

            AttackResult miss = CombatMath.ResolveMonsterAttack(rng, rat, false, 8);
            Assert.IsFalse(miss.Hit, "just above the threshold should dodge");
            Assert.AreEqual(1, rng.DrawCount, "a dodge consumes only the accuracy draw");
        }

        [Test]
        public void AnEnragedBossHitsHarder()
        {
            MonsterDef boss = Rat();
            boss.Boss = true;
            boss.MaxHit = 10;

            AttackResult calm = CombatMath.ResolveMonsterAttack(
                new ScriptedRandom(0.0, 0.999999), boss, false, 0);
            AttackResult angry = CombatMath.ResolveMonsterAttack(
                new ScriptedRandom(0.0, 0.999999), boss, true, 0);

            Assert.AreEqual(10, calm.MaxHit);
            Assert.AreEqual(12, angry.MaxHit, "enrage adds 2");
        }

        // ===================================================================
        // Drops
        // ===================================================================

        [Test]
        public void WeightedRollPicksByCumulativeWeight()
        {
            var table = new List<DropEntry>
            {
                new DropEntry("a", 50, 1, 1),
                new DropEntry("b", 180, 1, 1),
                new DropEntry("c", 60, 1, 1),
            };
            // total 290

            Assert.AreEqual("a", CombatMath.RollWeighted(new ScriptedRandom(0.0), table).ItemId);
            Assert.AreEqual("b", CombatMath.RollWeighted(new ScriptedRandom(60.0 / 290), table).ItemId);
            Assert.AreEqual("c", CombatMath.RollWeighted(new ScriptedRandom(260.0 / 290), table).ItemId);
        }

        /// <summary>
        /// The fall-through matters: floating-point drift in the running
        /// subtraction can leave the accumulator marginally positive after the
        /// last weight, and returning null there would silently drop a drop.
        /// </summary>
        [Test]
        public void WeightedRollFallsThroughToTheLastEntry()
        {
            var table = new List<DropEntry> { new DropEntry("a", 1, 1, 1), new DropEntry("b", 1, 1, 1) };
            Assert.AreEqual("b", CombatMath.RollWeighted(new ScriptedRandom(0.9999999999), table).ItemId);
        }

        [Test]
        public void WeightedRollOnAnEmptyTableIsNull()
        {
            Assert.IsNull(CombatMath.RollWeighted(new ScriptedRandom(0.5), new List<DropEntry>()));
            Assert.IsNull(CombatMath.RollWeighted(new ScriptedRandom(0.5), null));
        }

        [Test]
        public void RandIsInclusiveAtBothEnds()
        {
            Assert.AreEqual(1, CombatMath.Rand(new ScriptedRandom(0.0), 1, 6));
            Assert.AreEqual(6, CombatMath.Rand(new ScriptedRandom(0.999999), 1, 6));
            Assert.AreEqual(4, CombatMath.Rand(new ScriptedRandom(0.5), 4, 4), "a degenerate range");
        }

        /// <summary>
        /// The main table's quantity roll is easy to lose. An early version of the
        /// original discarded min/max and paid exactly 1 of everything, so a
        /// Zombie's "10–40 coins" paid a single coin.
        /// </summary>
        [Test]
        public void TheMainDropRollsItsQuantity()
        {
            MonsterDef rat = Rat();
            // Draw 1 picks coins (weight 180 of 290, so 0.5 lands inside it);
            // draw 2 is the 1..6 quantity.
            var rng = new ScriptedRandom(0.5, 0.999999, 1.0, 1.0);

            List<DropAward> awards = CombatMath.RollDrops(rng, rat);

            Assert.AreEqual("coins", awards[0].ItemId);
            Assert.AreEqual(6, awards[0].Quantity, "the quantity must be rolled, not defaulted to 1");
        }

        [Test]
        public void DropDrawOrderIsMainThenTertiaryThenPets()
        {
            MonsterDef rat = Rat();

            // main pick, main quantity, tertiary chance (hits), tertiary quantity, pet chance (hits)
            var rng = new ScriptedRandom(0.0, 0.0, 0.0, 0.0, 0.0);
            List<DropAward> awards = CombatMath.RollDrops(rng, rat);

            Assert.AreEqual(3, awards.Count);
            Assert.AreEqual("raw_rat_meat", awards[0].ItemId, "main first");
            Assert.AreEqual("rat_bone", awards[1].ItemId, "then tertiary");
            Assert.AreEqual("pet_rat", awards[2].ItemId, "then pets");
            Assert.IsTrue(awards[2].IsPet);
            Assert.AreEqual(5, rng.DrawCount);
        }

        [Test]
        public void AFailedTertiaryConsumesOnlyItsChanceDraw()
        {
            MonsterDef rat = Rat();
            // main pick, main quantity, tertiary chance (fails), pet chance (fails)
            var rng = new ScriptedRandom(0.0, 0.0, 0.9, 0.9);

            List<DropAward> awards = CombatMath.RollDrops(rng, rat);

            Assert.AreEqual(1, awards.Count, "only the main drop");
            Assert.AreEqual(4, rng.DrawCount, "no quantity draw for a tertiary that did not hit");
        }

        // ===================================================================
        // Affixes
        // ===================================================================

        [Test]
        public void AffixChanceAndRollOrder()
        {
            Assert.AreEqual(0.12, CombatRules.AffixChance, 1e-9);

            // A draw at or above the chance means no affix, and takes one draw.
            var none = new ScriptedRandom(0.12);
            Assert.IsNull(CombatMath.RollAffix(none));
            Assert.AreEqual(1, none.DrawCount);

            // Below it, a second draw picks which.
            var hardened = new ScriptedRandom(0.0, 0.0);
            Assert.AreEqual(CombatRules.AffixHardened, CombatMath.RollAffix(hardened));
            Assert.AreEqual(2, hardened.DrawCount);

            Assert.AreEqual(CombatRules.AffixSwift, CombatMath.RollAffix(new ScriptedRandom(0.0, 0.4)));
            Assert.AreEqual(CombatRules.AffixRich, CombatMath.RollAffix(new ScriptedRandom(0.0, 0.9)));
        }

        [Test]
        public void HardenedScalesTheRightThreeStats()
        {
            MonsterDef rat = Rat();
            rat.MaxHit = 10;
            rat.DefenseRoll = 10;

            MonsterDef m = CombatMath.ApplyAffix(rat, CombatRules.AffixHardened);

            Assert.AreEqual(12, m.Hp, "8 * 1.5");
            Assert.AreEqual(13, m.MaxHit, "10 * 1.3");
            Assert.AreEqual(13, m.DefenseRoll, "10 * 1.3");
            Assert.AreEqual("Hardened Giant Rat", m.Name);
            Assert.AreEqual(CombatRules.AffixHardened, m.Affix);
        }

        [Test]
        public void SwiftSpeedsAttacksAndWidensAggro()
        {
            MonsterDef m = CombatMath.ApplyAffix(Rat(), CombatRules.AffixSwift);

            Assert.AreEqual(2, m.AttackTick, "round(4 * 0.6) = 2");
            Assert.AreEqual(5, m.AggroRange, "3 + 2");
        }

        [Test]
        public void SwiftNeverDropsBelowOneTick()
        {
            MonsterDef fast = Rat();
            fast.AttackTick = 1;

            Assert.AreEqual(1, CombatMath.ApplyAffix(fast, CombatRules.AffixSwift).AttackTick,
                "a zero tick would mean an attack every frame");
        }

        [Test]
        public void RichDoublesCoinsAndTertiaryChances()
        {
            MonsterDef m = CombatMath.ApplyAffix(Rat(), CombatRules.AffixRich);

            DropEntry coins = m.Main.Find(d => d.ItemId == "coins");
            Assert.AreEqual(2, coins.Min, "1 * 2");
            Assert.AreEqual(12, coins.Max, "6 * 2");

            DropEntry meat = m.Main.Find(d => d.ItemId == "raw_rat_meat");
            Assert.AreEqual(1, meat.Min, "non-coin drops are untouched");
            Assert.AreEqual(1, meat.Max);

            Assert.AreEqual(0.04, m.Tertiary[0].Chance, 1e-9, "0.02 * 2");
        }

        [Test]
        public void RichCapsATertiaryChanceAtCertainty()
        {
            MonsterDef rat = Rat();
            rat.Tertiary[0].Chance = 0.8;

            Assert.AreEqual(1.0, CombatMath.ApplyAffix(rat, CombatRules.AffixRich).Tertiary[0].Chance, 1e-9);
        }

        /// <summary>
        /// The load-bearing invariant. An affixed spawn that wrote back to the
        /// shared definition would permanently buff every other monster of that
        /// type for the rest of the session, compounding on each new spawn.
        /// </summary>
        [Test]
        public void ApplyAffixNeverMutatesTheSharedDefinition()
        {
            MonsterDef shared = Rat();
            int hp = shared.Hp, maxHit = shared.MaxHit, tick = shared.AttackTick, aggro = shared.AggroRange;
            int coinMin = shared.Main.Find(d => d.ItemId == "coins").Min;
            int coinMax = shared.Main.Find(d => d.ItemId == "coins").Max;
            double tert = shared.Tertiary[0].Chance;
            string name = shared.Name;

            CombatMath.ApplyAffix(shared, CombatRules.AffixHardened);
            CombatMath.ApplyAffix(shared, CombatRules.AffixSwift);
            CombatMath.ApplyAffix(shared, CombatRules.AffixRich);

            Assert.AreEqual(hp, shared.Hp);
            Assert.AreEqual(maxHit, shared.MaxHit);
            Assert.AreEqual(tick, shared.AttackTick);
            Assert.AreEqual(aggro, shared.AggroRange);
            Assert.AreEqual(coinMin, shared.Main.Find(d => d.ItemId == "coins").Min,
                "the rich affix must clone the drop table, not rewrite it");
            Assert.AreEqual(coinMax, shared.Main.Find(d => d.ItemId == "coins").Max);
            Assert.AreEqual(tert, shared.Tertiary[0].Chance, 1e-12);
            Assert.AreEqual(name, shared.Name);
            Assert.IsNull(shared.Affix);
        }

        [Test]
        public void AnUnknownAffixLeavesTheDefinitionAlone()
        {
            MonsterDef rat = Rat();
            Assert.AreSame(rat, CombatMath.ApplyAffix(rat, "cursed"));
            Assert.AreSame(rat, CombatMath.ApplyAffix(rat, null));
        }

        // ===================================================================
        // Per-tick upkeep
        // ===================================================================

        [Test]
        public void AnActiveBuffDrainsResolveEachTick()
        {
            string buff = CombatRules.BuffPower;
            int resolve = CombatMath.TickResolve(100, ref buff, nearCampfire: false);

            Assert.AreEqual(98, resolve, "power costs 2 per tick");
            Assert.AreEqual(CombatRules.BuffPower, buff, "still affordable, so still active");
        }

        [Test]
        public void ABuffLapsesWhenResolveRunsOut()
        {
            string buff = CombatRules.BuffPrecision;
            int resolve = CombatMath.TickResolve(2, ref buff, nearCampfire: false);

            Assert.AreEqual(0, resolve);
            Assert.IsNull(buff, "the buff must lapse rather than go into debt");
        }

        [Test]
        public void ResolveRegeneratesOnlyAtACampfireAndOnlyWithNoBuff()
        {
            string none = null;
            Assert.AreEqual(53, CombatMath.TickResolve(50, ref none, nearCampfire: true), "+3 per tick");
            Assert.AreEqual(50, CombatMath.TickResolve(50, ref none, nearCampfire: false), "no campfire, no regen");

            string buff = CombatRules.BuffPower;
            Assert.AreEqual(98, CombatMath.TickResolve(100, ref buff, nearCampfire: true),
                "an active buff drains even beside a campfire");
        }

        [Test]
        public void ResolveIsCappedAtMax()
        {
            string none = null;
            Assert.AreEqual(100, CombatMath.TickResolve(99, ref none, nearCampfire: true));
            Assert.AreEqual(100, CombatMath.TickResolve(100, ref none, nearCampfire: true));
        }

        [Test]
        public void SpecialEnergyRegeneratesAnywhereAndCaps()
        {
            Assert.AreEqual(51, CombatMath.TickSpecialEnergy(50));
            Assert.AreEqual(100, CombatMath.TickSpecialEnergy(99));
            Assert.AreEqual(100, CombatMath.TickSpecialEnergy(100));
            Assert.AreEqual(1, CombatRules.SpecialRegenPerTick);
        }

        // ===================================================================
        // Boss behaviour
        // ===================================================================

        [Test]
        public void OnlyBossesEnrageAndOnlyAtOrBelowHalfHealth()
        {
            MonsterDef boss = Rat();
            boss.Boss = true;

            Assert.IsFalse(CombatMath.IsEnraged(boss, 6, 10), "60%");
            Assert.IsTrue(CombatMath.IsEnraged(boss, 5, 10), "exactly half enrages");
            Assert.IsTrue(CombatMath.IsEnraged(boss, 1, 10));
            Assert.IsFalse(CombatMath.IsEnraged(boss, 0, 10), "a dead boss is not enraged");

            Assert.IsFalse(CombatMath.IsEnraged(Rat(), 1, 10), "ordinary monsters never enrage");
        }

        [Test]
        public void AnEnragedBossSwingsOnTheFasterFixedTick()
        {
            MonsterDef boss = Rat();
            boss.Boss = true;
            boss.AttackTick = 5;

            Assert.AreEqual(5, CombatMath.EffectiveAttackTick(boss, false));
            Assert.AreEqual(2, CombatMath.EffectiveAttackTick(boss, true));
            Assert.AreEqual(4, CombatMath.EffectiveAttackTick(Rat(), true), "not a boss, so unchanged");
        }

        [Test]
        public void SlamRollsDefaultDamageWhenNoneIsFixed()
        {
            MonsterDef boss = Rat();
            boss.Boss = true;

            var rng = new ScriptedRandom(0.0, 0.999999);
            Assert.IsTrue(CombatMath.TryStartSlam(rng, boss, enraged: true, out int dmg));
            Assert.AreEqual(10, dmg, "6 + floor(rand * 5) tops out at 10");
            Assert.AreEqual(2, rng.DrawCount);

            var rng2 = new ScriptedRandom(0.0, 0.0);
            CombatMath.TryStartSlam(rng2, boss, true, out int low);
            Assert.AreEqual(6, low);
        }

        [Test]
        public void AFixedSlamDamageSkipsTheDamageDraw()
        {
            MonsterDef boss = Rat();
            boss.Boss = true;
            boss.SlamDmg = 25;

            var rng = new ScriptedRandom(0.0);
            Assert.IsTrue(CombatMath.TryStartSlam(rng, boss, true, out int dmg));
            Assert.AreEqual(25, dmg);
            Assert.AreEqual(1, rng.DrawCount, "a fixed slam must not consume a damage draw");
        }

        [Test]
        public void ANonBossNeverSlams()
        {
            var rng = new ScriptedRandom(0.0);
            Assert.IsFalse(CombatMath.TryStartSlam(rng, Rat(), true, out _));
            Assert.AreEqual(0, rng.DrawCount, "and must not consume a draw deciding that");
        }

        [Test]
        public void ACalmBossUsesItsOwnSlamChance()
        {
            MonsterDef boss = Rat();
            boss.Boss = true;
            boss.SlamChance = 0.0;

            Assert.IsFalse(CombatMath.TryStartSlam(new ScriptedRandom(0.0), boss, false, out _),
                "a zero chance can never fire, even on a zero roll");

            boss.SlamChance = 0.3;
            Assert.IsTrue(CombatMath.TryStartSlam(new ScriptedRandom(0.29, 0.0), boss, false, out _));
            Assert.IsFalse(CombatMath.TryStartSlam(new ScriptedRandom(0.31), boss, false, out _));
        }
    }
}
