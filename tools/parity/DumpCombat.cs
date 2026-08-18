// Harness: runs a scripted sequence of combat resolutions off a seeded
// mulberry32 and dumps every outcome, for diffing against the TypeScript.
//
// The point is DRAW ORDER as much as arithmetic. Both sides pull from the same
// generator, so if either takes a roll the other skips -- an accuracy draw on a
// guaranteed special, a quantity draw for a tertiary that did not hit, the
// second draw that picks which affix -- every later result diverges and the diff
// says exactly where. That is a class of bug no range assertion can see.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Isoperia.Core.Combat;
using Isoperia.Core.Data;
using Isoperia.Core.Sim;

public static class DumpCombat
{
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    private static WeaponDef W(string id, int ticks, int maxHit, int accuracy) => new WeaponDef
    {
        Id = id, Name = id, Kind = id == "shortbow" ? "ranged" : "melee",
        Ticks = ticks, ItemId = id, MaxHit = maxHit, Accuracy = accuracy, RequiredAttack = 1,
    };

    /// <summary>The shipped weapon table, inlined so both sides use identical inputs.</summary>
    private static readonly List<WeaponDef> Weapons = new List<WeaponDef>
    {
        W("fists", 2, 1, 2),
        W("dagger", 3, 4, 8),
        W("sword", 4, 6, 12),
        W("sword2h", 6, 10, 16),
        W("shortbow", 3, 5, 14),
        W("iron_sword", 4, 9, 20),
        W("steel_sword", 4, 13, 28),
    };

    private static MonsterDef Monster(
        string id, int hp, int maxHit, int attackTick, int attackRoll, int defenseRoll,
        int aggro, bool boss = false, double slamChance = 0, int slamDmg = 0)
    {
        return new MonsterDef
        {
            Id = id, Name = id, Level = 1, Hp = hp, MaxHit = maxHit, AttackTick = attackTick,
            AttackRoll = attackRoll, DefenseRoll = defenseRoll, AggroRange = aggro,
            Boss = boss, SlamChance = slamChance, SlamDmg = slamDmg,
            Xp = new MonsterXp { Attack = 4, Strength = 2, Defense = 2, Hitpoints = 1 },
            Main =
            {
                new DropEntry("raw_rat_meat", 50, 1, 1),
                new DropEntry("coins", 180, 1, 6),
                new DropEntry("bones", 60, 1, 2),
            },
            Tertiary =
            {
                new ChanceDrop("rat_bone", 0.02),
                new ChanceDrop("clue_simple", 0.30, 1, 3),
            },
            PetTable = { new ChanceDrop("pet_rat", 0.25) },
            RespawnMs = 20000,
        };
    }

    private static readonly List<MonsterDef> Monsters = new List<MonsterDef>
    {
        Monster("giant_rat", 8, 1, 4, 4, 2, 3),
        Monster("goblin", 14, 3, 4, 6, 4, 4),
        Monster("skeleton", 26, 5, 4, 12, 10, 4),
        Monster("forest_ogre", 110, 10, 5, 24, 20, 5, boss: true, slamChance: 0.2),
        Monster("cave_brute", 90, 9, 5, 22, 18, 5, boss: true, slamChance: 0.25, slamDmg: 14),
    };

    private static string F(double d) => d.ToString("F9", Inv);

    public static void Main()
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        var sb = new StringBuilder();

        // ---- deterministic tables, no randomness -------------------------
        sb.Append("HIT_CHANCE\n");
        for (int a = 0; a <= 40; a += 2)
            for (int d = 0; d <= 40; d += 2)
                sb.Append(a).Append(',').Append(d).Append('=').Append(F(CombatMath.HitChance(a, d))).Append('\n');

        sb.Append("MAX_HIT\n");
        foreach (var w in Weapons)
            foreach (string styleId in new[] { "accurate", "aggressive", "defensive" })
                foreach (string buffId in new[] { "none", "precision", "power", "warden" })
                    foreach (int str in new[] { 1, 3, 4, 7, 40, 99 })
                    {
                        BuffDef buff = buffId == "none" ? CombatRules.NoBuff : CombatRules.Buff(buffId);
                        var gear = new GearBonuses { Attack = 3, Strength = 5, Defense = 2 };

                        sb.Append(w.Id).Append('|').Append(styleId).Append('|').Append(buffId).Append('|').Append(str)
                          .Append("=mh:").Append(CombatMath.PlayerBaseMaxHit(w, str, gear, CombatRules.Style(styleId), buff))
                          .Append(",ar:").Append(CombatMath.PlayerAttackRoll(w, str, gear, CombatRules.Style(styleId), buff))
                          .Append('\n');
                    }

        sb.Append("AFFIX_APPLY\n");
        foreach (var m in Monsters)
            foreach (string affix in CombatRules.AffixIds)
            {
                MonsterDef a = CombatMath.ApplyAffix(m, affix);
                sb.Append(m.Id).Append('|').Append(affix).Append('=')
                  .Append("hp:").Append(a.Hp)
                  .Append(",mh:").Append(a.MaxHit)
                  .Append(",def:").Append(a.DefenseRoll)
                  .Append(",tick:").Append(a.AttackTick)
                  .Append(",aggro:").Append(a.AggroRange)
                  .Append(",name:").Append(a.Name);

                foreach (var d in a.Main) sb.Append(",m[").Append(d.ItemId).Append("]:").Append(d.Min).Append('-').Append(d.Max);
                foreach (var t in a.Tertiary) sb.Append(",t[").Append(t.ItemId).Append("]:").Append(F(t.Chance));
                sb.Append('\n');
            }

        sb.Append("UPKEEP\n");
        foreach (int r in new[] { 0, 1, 2, 3, 50, 98, 99, 100 })
            foreach (string b in new[] { "none", "precision", "power", "warden" })
                foreach (bool fire in new[] { false, true })
                {
                    string buff = b == "none" ? null : b;
                    int outR = CombatMath.TickResolve(r, ref buff, fire);
                    sb.Append(r).Append('|').Append(b).Append('|').Append(fire ? 1 : 0)
                      .Append("=r:").Append(outR).Append(",buff:").Append(buff ?? "null").Append('\n');
                }

        foreach (int e in new[] { 0, 50, 99, 100 })
            sb.Append("spec|").Append(e).Append('=').Append(CombatMath.TickSpecialEnergy(e)).Append('\n');

        sb.Append("ENRAGE\n");
        foreach (var m in Monsters)
            foreach (int hp in new[] { 0, 1, 5, 10, 55, 56, 110 })
            {
                bool en = CombatMath.IsEnraged(m, hp, m.Hp);
                sb.Append(m.Id).Append('|').Append(hp).Append("=en:").Append(en ? 1 : 0)
                  .Append(",tick:").Append(CombatMath.EffectiveAttackTick(m, en)).Append('\n');
            }

        // ---- stochastic: one shared stream, order is the assertion --------
        sb.Append("FIGHTS\n");
        foreach (int seed in new[] { 1, 7, 1337, 424242, -99 })
        {
            IRandom rng = new Mulberry32Random(seed);

            foreach (var monster in Monsters)
            {
                MonsterDef def = monster;

                // An affix roll first, exactly as a fresh spawn does.
                string affix = CombatMath.RollAffix(rng);
                if (affix != null) def = CombatMath.ApplyAffix(def, affix);

                int hp = def.Hp;
                int maxHp = def.Hp;
                int resolve = 100;
                int special = 100;
                string buff = "power";

                sb.Append("seed:").Append(seed).Append('|').Append(monster.Id)
                  .Append("|affix:").Append(affix ?? "null").Append('\n');

                for (int tick = 0; tick < 24 && hp > 0; tick++)
                {
                    resolve = CombatMath.TickResolve(resolve, ref buff, nearCampfire: tick % 5 == 0);
                    special = CombatMath.TickSpecialEnergy(special);

                    bool enraged = CombatMath.IsEnraged(def, hp, maxHp);

                    // A boss may telegraph a slam.
                    if (CombatMath.TryStartSlam(rng, def, enraged, out int slam))
                        sb.Append("  t").Append(tick).Append(" slam:").Append(slam).Append('\n');

                    // Rotate the weapon and fire a special every third tick, so
                    // the guaranteed-hit and execute paths are both exercised.
                    WeaponDef weapon = Weapons[tick % Weapons.Count];
                    SpecialDef spec = tick % 3 == 0 ? CombatRules.SpecialFor(weapon.Id) : null;

                    var gear = new GearBonuses { Attack = 2, Strength = 3, Defense = 1 };
                    AttackStyleDef style = CombatRules.Style(
                        tick % 3 == 0 ? "accurate" : tick % 3 == 1 ? "aggressive" : "defensive");

                    AttackResult pa = CombatMath.ResolvePlayerAttack(
                        rng, weapon, 20, 20, gear, style, CombatRules.Buff(buff), spec,
                        def.DefenseRoll, hp, maxHp);

                    hp = Math.Max(0, hp - pa.Damage);

                    sb.Append("  t").Append(tick)
                      .Append(" p:").Append(pa.Hit ? 1 : 0)
                      .Append('/').Append(pa.Damage)
                      .Append('/').Append(pa.MaxHit)
                      .Append('/').Append(pa.Executed ? 1 : 0)
                      .Append(" hp:").Append(hp);

                    if (hp > 0)
                    {
                        int pDef = CombatMath.PlayerDefenseRoll(20, gear, style, CombatRules.Buff(buff));
                        AttackResult ma = CombatMath.ResolveMonsterAttack(rng, def, enraged, pDef);
                        sb.Append(" m:").Append(ma.Hit ? 1 : 0).Append('/').Append(ma.Damage).Append('/').Append(ma.MaxHit);
                    }

                    sb.Append(" r:").Append(resolve).Append(",s:").Append(special)
                      .Append(",b:").Append(buff ?? "null").Append('\n');
                }

                if (hp <= 0)
                {
                    List<DropAward> drops = CombatMath.RollDrops(rng, def);
                    sb.Append("  drops:");
                    foreach (var d in drops)
                        sb.Append(' ').Append(d.ItemId).Append('x').Append(d.Quantity).Append(d.IsPet ? "(pet)" : "");
                    sb.Append('\n');
                }
            }
        }

        Console.Out.Write(sb.ToString());
    }
}
