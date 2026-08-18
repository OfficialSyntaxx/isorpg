// Dumps combat outcomes from the ORIGINAL TypeScript rules, in the format
// tools/parity/DumpCombat.cs emits, so the two can be diffed byte for byte.
//
// The TypeScript combat system calls Math.random() directly and is tangled with
// world state, actors and callbacks, so it cannot simply be instantiated here.
// What IS pinned down is the arithmetic and the draw order, and those are
// reproduced below verbatim from src/data/Combat.ts and
// src/systems/CombatSystem.ts, with Math.random replaced by the same mulberry32
// stream the C# side uses.
//
// That verbatim copy is the point rather than a shortcut: if the C# port and a
// faithful transcription of the original disagree on any roll, the port is
// wrong. The transcription is short enough to review against the source.
const path = require("path");

// --- the shared generator, byte-identical to Isoperia.Core.Sim.Mulberry32 ----
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- verbatim from src/data/Combat.ts ----------------------------------------
const ATTACK_STYLES = {
  accurate: { id: "accurate", accuracyBonus: 3, maxHitBonus: 0, defenseBonus: 0, trains: "attack" },
  aggressive: { id: "aggressive", accuracyBonus: 0, maxHitBonus: 3, defenseBonus: 0, trains: "strength" },
  defensive: { id: "defensive", accuracyBonus: 0, maxHitBonus: 0, defenseBonus: 3, trains: "defense" },
};

const BUFFS = {
  precision: { id: "precision", accuracyBonus: 6, maxHitBonus: 0, defenseBonus: 0, costPerTick: 2 },
  power: { id: "power", accuracyBonus: 0, maxHitBonus: 4, defenseBonus: 0, costPerTick: 2 },
  warden: { id: "warden", accuracyBonus: 0, maxHitBonus: 0, defenseBonus: 6, costPerTick: 2 },
};
const NO_BUFF = { accuracyBonus: 0, maxHitBonus: 0, defenseBonus: 0, costPerTick: 0 };
const RESOLVE_MAX = 100;
const RESOLVE_REGEN_PER_TICK = 3;

const WEAPON_SPECIALS = {
  dagger: { name: "Puncture", cost: 25, damageMult: 1.2, guaranteedHit: true },
  sword: { name: "Riposte", cost: 40, damageMult: 1.3, guaranteedHit: false },
  sword2h: { name: "Cleave", cost: 100, damageMult: 1.8, guaranteedHit: false },
  shortbow: { name: "Piercing Shot", cost: 50, damageMult: 1.4, guaranteedHit: true },
  iron_sword: { name: "Execute", cost: 60, damageMult: 1.2, guaranteedHit: false, executeMult: 2.2 },
  steel_sword: { name: "Onslaught", cost: 80, damageMult: 1.9, guaranteedHit: false },
};
const SPECIAL_MAX = 100;
const SPECIAL_REGEN_PER_TICK = 1;

const AFFIXES = { hardened: { label: "Hardened" }, swift: { label: "Swift" }, rich: { label: "Rich" } };
const AFFIX_CHANCE = 0.12;

function rollAffix(rnd) {
  if (rnd() >= AFFIX_CHANCE) return null;
  const ids = Object.keys(AFFIXES);
  return ids[Math.floor(rnd() * ids.length)];
}

function applyAffix(def, affix) {
  const named = { ...def, name: `${AFFIXES[affix].label} ${def.name}`, affix };
  switch (affix) {
    case "hardened":
      return { ...named, hp: Math.round(def.hp * 1.5), maxHit: Math.round(def.maxHit * 1.3), defenseRoll: Math.round(def.defenseRoll * 1.3) };
    case "swift":
      return { ...named, attackTick: Math.max(1, Math.round(def.attackTick * 0.6)), aggroRange: def.aggroRange + 2 };
    case "rich":
      return {
        ...named,
        main: def.main.map((d) => (d.itemId === "coins" ? { ...d, min: d.min * 2, max: d.max * 2 } : d)),
        tertiary: def.tertiary?.map((t) => ({ ...t, chance: Math.min(1, t.chance * 2) })),
      };
  }
}

// --- verbatim from src/systems/CombatSystem.ts -------------------------------
function hitChance(attackRoll, defenseRoll) {
  if (attackRoll > defenseRoll) return 1 - (defenseRoll + 2) / (2 * (attackRoll + 1));
  return attackRoll / (2 * (defenseRoll + 1));
}

function rollWeighted(entries) {
  if (!entries.length) return null;
  const total = entries.reduce((a, e) => a + e.weight, 0);
  let r = RND() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return entries[entries.length - 1];
}

function rand(min, max) {
  return min + Math.floor(RND() * (max - min + 1));
}

/** The active generator. Swapped per seed; rollWeighted/rand read it. */
let RND = Math.random;

// --- fixtures, identical to the C# side --------------------------------------
const W = (id, ticks, maxHit, accuracy) => ({ id, name: id, ticks, maxHit, accuracy });
const WEAPONS = [
  W("fists", 2, 1, 2), W("dagger", 3, 4, 8), W("sword", 4, 6, 12), W("sword2h", 6, 10, 16),
  W("shortbow", 3, 5, 14), W("iron_sword", 4, 9, 20), W("steel_sword", 4, 13, 28),
];

const M = (id, hp, maxHit, attackTick, attackRoll, defenseRoll, aggroRange, boss = false, slamChance = 0, slamDmg = 0) => ({
  id, name: id, hp, maxHit, attackTick, attackRoll, defenseRoll, aggroRange, boss, slamChance, slamDmg,
  main: [
    { itemId: "raw_rat_meat", weight: 50, min: 1, max: 1 },
    { itemId: "coins", weight: 180, min: 1, max: 6 },
    { itemId: "bones", weight: 60, min: 1, max: 2 },
  ],
  tertiary: [
    { itemId: "rat_bone", chance: 0.02, min: 1, max: 1 },
    { itemId: "clue_simple", chance: 0.30, min: 1, max: 3 },
  ],
  petTable: [{ itemId: "pet_rat", chance: 0.25 }],
});

const MONSTERS = [
  M("giant_rat", 8, 1, 4, 4, 2, 3),
  M("goblin", 14, 3, 4, 6, 4, 4),
  M("skeleton", 26, 5, 4, 12, 10, 4),
  M("forest_ogre", 110, 10, 5, 24, 20, 5, true, 0.2),
  M("cave_brute", 90, 9, 5, 22, 18, 5, true, 0.25, 14),
];

const F = (d) => d.toFixed(9);
const out = [];

// ---- deterministic tables ----------------------------------------------------
out.push("HIT_CHANCE");
for (let a = 0; a <= 40; a += 2)
  for (let d = 0; d <= 40; d += 2) out.push(`${a},${d}=${F(hitChance(a, d))}`);

out.push("MAX_HIT");
const gearFull = { attack: 3, strength: 5, defense: 2 };
for (const w of WEAPONS)
  for (const styleId of ["accurate", "aggressive", "defensive"])
    for (const buffId of ["none", "precision", "power", "warden"])
      for (const str of [1, 3, 4, 7, 40, 99]) {
        const style = ATTACK_STYLES[styleId];
        const buff = buffId === "none" ? NO_BUFF : BUFFS[buffId];
        const mh = w.maxHit + Math.floor(str / 4) + gearFull.strength + style.maxHitBonus + buff.maxHitBonus;
        const ar = w.accuracy + str + gearFull.attack + style.accuracyBonus + buff.accuracyBonus;
        out.push(`${w.id}|${styleId}|${buffId}|${str}=mh:${mh},ar:${ar}`);
      }

out.push("AFFIX_APPLY");
for (const m of MONSTERS)
  for (const affix of ["hardened", "swift", "rich"]) {
    const a = applyAffix(m, affix);
    let line = `${m.id}|${affix}=hp:${a.hp},mh:${a.maxHit},def:${a.defenseRoll},tick:${a.attackTick},aggro:${a.aggroRange},name:${a.name}`;
    for (const d of a.main) line += `,m[${d.itemId}]:${d.min}-${d.max}`;
    for (const t of a.tertiary) line += `,t[${t.itemId}]:${F(t.chance)}`;
    out.push(line);
  }

out.push("UPKEEP");
for (const r of [0, 1, 2, 3, 50, 98, 99, 100])
  for (const b of ["none", "precision", "power", "warden"])
    for (const fire of [false, true]) {
      let resolve = r;
      let buff = b === "none" ? null : b;
      // verbatim updateResolve()
      if (buff) {
        resolve = Math.max(0, resolve - BUFFS[buff].costPerTick);
        if (resolve <= 0) buff = null;
      } else if (resolve < RESOLVE_MAX && fire) {
        resolve = Math.min(RESOLVE_MAX, resolve + RESOLVE_REGEN_PER_TICK);
      }
      out.push(`${r}|${b}|${fire ? 1 : 0}=r:${resolve},buff:${buff ?? "null"}`);
    }

for (const e of [0, 50, 99, 100])
  out.push(`spec|${e}=${e < SPECIAL_MAX ? Math.min(SPECIAL_MAX, e + SPECIAL_REGEN_PER_TICK) : SPECIAL_MAX}`);

out.push("ENRAGE");
for (const m of MONSTERS)
  for (const hp of [0, 1, 5, 10, 55, 56, 110]) {
    const en = !!m.boss && hp > 0 && hp <= m.hp / 2;
    const tick = m.boss && en ? 2 : m.attackTick;
    out.push(`${m.id}|${hp}=en:${en ? 1 : 0},tick:${tick}`);
  }

// ---- stochastic --------------------------------------------------------------
out.push("FIGHTS");
for (const seed of [1, 7, 1337, 424242, -99]) {
  RND = mulberry32(seed);

  for (const monster of MONSTERS) {
    let def = monster;

    const affix = rollAffix(RND);
    if (affix) def = applyAffix(def, affix);

    let hp = def.hp;
    const maxHp = def.hp;
    let resolve = 100;
    let special = 100;
    let buff = "power";

    out.push(`seed:${seed}|${monster.id}|affix:${affix ?? "null"}`);

    for (let tick = 0; tick < 24 && hp > 0; tick++) {
      // updateResolve()
      if (buff) {
        resolve = Math.max(0, resolve - BUFFS[buff].costPerTick);
        if (resolve <= 0) buff = null;
      } else if (resolve < RESOLVE_MAX && tick % 5 === 0) {
        resolve = Math.min(RESOLVE_MAX, resolve + RESOLVE_REGEN_PER_TICK);
      }
      // updateSpecialEnergy()
      if (special < SPECIAL_MAX) special = Math.min(SPECIAL_MAX, special + SPECIAL_REGEN_PER_TICK);

      const enraged = !!def.boss && hp > 0 && hp <= maxHp / 2;

      // boss slam telegraph
      if (def.boss) {
        const chance = enraged ? 0.15 : (def.slamChance ?? 0);
        if (RND() < chance) {
          const slam = def.slamDmg ? def.slamDmg : 6 + Math.floor(RND() * 5);
          out.push(`  t${tick} slam:${slam}`);
        }
      }

      const weapon = WEAPONS[tick % WEAPONS.length];
      const spec = tick % 3 === 0 ? (WEAPON_SPECIALS[weapon.id] ?? null) : null;

      const gear = { attack: 2, strength: 3, defense: 1 };
      const style = ATTACK_STYLES[tick % 3 === 0 ? "accurate" : tick % 3 === 1 ? "aggressive" : "defensive"];
      const bd = buff ? BUFFS[buff] : NO_BUFF;

      // tryPlayerAttack()
      let pHit = false, pDamage = 0, pMaxHit = 0, pExecuted = false;
      const roll = weapon.accuracy + 20 + gear.attack + style.accuracyBonus + bd.accuracyBonus;

      if (spec?.guaranteedHit || !(RND() > hitChance(roll, def.defenseRoll))) {
        pHit = true;
        let maxHit = weapon.maxHit + Math.floor(20 / 4) + gear.strength + style.maxHitBonus + bd.maxHitBonus;
        if (spec) {
          const executing = !!spec.executeMult && hp / maxHp < 0.25;
          maxHit = Math.round(maxHit * (executing ? spec.executeMult : spec.damageMult));
          pExecuted = executing;
        }
        pMaxHit = maxHit;
        pDamage = 1 + Math.floor(RND() * Math.max(1, maxHit));
      }

      hp = Math.max(0, hp - pDamage);

      let line = `  t${tick} p:${pHit ? 1 : 0}/${pDamage}/${pMaxHit}/${pExecuted ? 1 : 0} hp:${hp}`;

      if (hp > 0) {
        // tryMonsterAttack()
        const pDef = 20 + gear.defense + style.defenseBonus + bd.defenseBonus;
        let mHit = false, mDamage = 0, mMaxHit = 0;
        if (!(RND() > hitChance(def.attackRoll, 2 + pDef))) {
          mHit = true;
          mMaxHit = def.maxHit + (enraged ? 2 : 0);
          mDamage = 1 + Math.floor(RND() * Math.max(1, mMaxHit));
        }
        line += ` m:${mHit ? 1 : 0}/${mDamage}/${mMaxHit}`;
      }

      line += ` r:${resolve},s:${special},b:${buff ?? "null"}`;
      out.push(line);
    }

    if (hp <= 0) {
      // onKill()
      const drops = [];
      const main = rollWeighted(def.main);
      if (main) drops.push(`${main.itemId}x${rand(main.min ?? 1, main.max ?? 1)}`);

      if (def.tertiary) {
        for (const t of def.tertiary) {
          if (RND() < t.chance) drops.push(`${t.itemId}x${rand(t.min, t.max)}`);
        }
      }
      if (def.petTable) {
        for (const p of def.petTable) {
          if (RND() < p.chance) drops.push(`${p.itemId}x1(pet)`);
        }
      }
      out.push(`  drops: ${drops.join(" ")}`.replace(/ $/, ""));
    }
  }
}

process.stdout.write(out.join("\n") + "\n");
