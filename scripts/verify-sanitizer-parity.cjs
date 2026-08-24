#!/usr/bin/env node
/**
 * QC: checks the C# save sanitizer against the TypeScript one it was ported from.
 *
 * This is the most valuable check in Phase 2b. The sanitizer is dozens of
 * independent coercion rules over untrusted input — every one individually
 * plausible if got wrong, and none of them with a natural oracle. Hand-written
 * assertions only test the cases somebody thought of; running both
 * implementations over the same adversarial corpus tests the ones nobody did.
 *
 * It has already earned that description. Writing it exposed that the C# accepted
 * building-type list had been written from memory — inventing MARKET and SMITHY
 * while omitting STORAGE_BIN and FARM_PLOT — which would have silently deleted
 * every storage bin and farm plot from a loaded save.
 *
 * Method: feed both implementations the same documents with a FIXED "now" (so
 * time-dependent rules are deterministic), then compare the sanitized output
 * key for key. Differences are reported as a path into the document rather than
 * a wall of JSON.
 *
 * Skips (does not fail) when no C# toolchain is installed.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, ".parity");
const CORE = path.join(ROOT, "unity/Assets/Isoperia/Core/Runtime");

/** Must match Now in tools/parity/SanitizeRoundTrip.cs. */
const NOW = 1787000000000;

function have(cmd) {
  return spawnSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8" }).status === 0;
}

if (!have("mcs") || !have("mono")) {
  console.log("SKIP  sanitizer parity: no C# toolchain (mcs/mono) installed (optional).");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Corpus: a realistic save, then everything that could be wrong with one.
// ---------------------------------------------------------------------------
const realistic = {
  version: "1.1.0",
  timestamp: NOW - 3600_000,
  player: {
    name: "Corvin",
    position: { x: 10, y: 10 },
    stats: { hp: 87, maxHp: 100 },
    skills: {
      attack: { xp: 1543, mastery: {} },
      woodcutting: { xp: 22011, mastery: { logs: 412, oak_logs: 88 } },
      mining: { xp: 500, mastery: { iron_ore: 3 } },
    },
    inventory: [
      { id: "coins", amount: 1240 },
      { id: "logs", amount: 63 },
      { id: "iron_ore", amount: 12 },
    ],
    equipped: { weapon: "iron_sword", body: "iron_plate" },
    journal: ["q_intro", "q_second"],
    meta: {
      kills: { giant_rat: 41, goblin: 7 },
      achievements: ["first_blood"],
      counters: { logs_chopped: 402 },
    },
    clue: { tier: "simple", seed: 99, step: 1, sites: [{ x: 3, y: 4 }, { x: 20, y: 21 }] },
    resolve: 74,
    activeBuff: "power",
    specialEnergy: 55,
  },
  town: {
    buildings: [
      { id: "b_1", type: "CAMPFIRE", x: 20, y: 21, level: 2 },
      { id: "b_2", type: "STORAGE_BIN", x: 21, y: 21, level: 1 },
      { id: "b_3", type: "FARM_PLOT", x: 22, y: 21, level: 1 },
      { id: "b_4", type: "TOWN_HALL", x: 19, y: 21, level: 3 },
    ],
    labour: {
      assignments: { bram: "mining", wren: "woodcutting" },
      stock: { iron_ore: 12, logs: 40 },
      acc: { bram: 1200 },
      worked: { bram: 900000 },
    },
    market: { supply: { logs: 30 }, demand: { coins: 5 } },
    farm: { plots: [null, { seedId: "potato_seed", plantedAt: NOW - 60_000 }, null] },
  },
  collectionLog: { unlocked: ["logs", "coins", "iron_ore"] },
  settings: { autoEatPct: 40, attackStyle: "accurate" },
  clock: { minute: 600, day: 3 },
  map: { discovered: ["poi_a", "poi_b"], fastTravel: true, explored: [1, 2, 3] },
};

/** Deep clone then mutate, so each case differs from the realistic save in one way. */
function variant(mutate) {
  const c = JSON.parse(JSON.stringify(realistic));
  mutate(c);
  return c;
}

const cases = [
  ["realistic", realistic],

  // --- shape / rejection ---------------------------------------------------
  ["not an object (array)", []],
  ["not an object (number)", 42],
  ["not an object (string)", "save"],
  ["null", null],
  ["empty object", {}],
  ["no player", { version: "1.1.0", timestamp: NOW }],
  ["player is not an object", { player: "corvin" }],
  ["player is null", { player: null }],
  ["empty player", { player: {} }],

  // --- version migration ---------------------------------------------------
  ["v1.0.0 mastery rescale", variant((s) => { s.version = "1.0.0"; })],
  ["v0.9.0 mastery rescale", variant((s) => { s.version = "0.9.0"; })],
  ["v1.1.0 no rescale", variant((s) => { s.version = "1.1.0"; })],
  ["v2.0.0 future save", variant((s) => { s.version = "2.0.0"; })],
  ["missing version", variant((s) => { delete s.version; })],
  ["version not a string", variant((s) => { s.version = 110; })],
  ["odd mastery values", variant((s) => {
    s.version = "1.0.0";
    s.player.skills.woodcutting.mastery = { logs: 7, oak: 3, willow: 1, elm: 0 };
  })],

  // --- position / stats ----------------------------------------------------
  ["negative position", variant((s) => { s.player.position = { x: -5, y: -9 }; })],
  ["fractional position", variant((s) => { s.player.position = { x: 10.6, y: 3.4 }; })],
  ["missing position", variant((s) => { delete s.player.position; })],
  ["position wrong type", variant((s) => { s.player.position = { x: "ten", y: null }; })],
  ["hp above maxHp", variant((s) => { s.player.stats = { hp: 9999, maxHp: 100 }; })],
  ["negative hp", variant((s) => { s.player.stats = { hp: -50, maxHp: 100 }; })],
  ["missing stats", variant((s) => { delete s.player.stats; })],

  // --- name ----------------------------------------------------------------
  ["long name", variant((s) => { s.player.name = "x".repeat(200); })],
  ["empty name", variant((s) => { s.player.name = ""; })],
  ["name not a string", variant((s) => { s.player.name = 12345; })],
  ["unicode name", variant((s) => { s.player.name = "Corvin中文😀"; })],

  // --- inventory -----------------------------------------------------------
  ["zero and negative stacks", variant((s) => {
    s.player.inventory = [
      { id: "logs", amount: 5 },
      { id: "ore", amount: 0 },
      { id: "coal", amount: -3 },
      { amount: 9 },
      { id: 42, amount: 9 },
      { id: "gold", amount: 2.7 },
    ];
  })],
  ["inventory not an array", variant((s) => { s.player.inventory = { logs: 5 }; })],
  ["missing inventory", variant((s) => { delete s.player.inventory; })],

  // --- equipment -----------------------------------------------------------
  ["bogus equip slots", variant((s) => {
    s.player.equipped = { weapon: "iron_sword", hat: "nope", body: "", cape: "x" };
  })],
  ["equipped not an object", variant((s) => { s.player.equipped = ["iron_sword"]; })],

  // --- buildings -----------------------------------------------------------
  ["unknown building types", variant((s) => {
    s.town.buildings = [
      { id: "b1", type: "CAMPFIRE", x: 5, y: 5, level: 1 },
      { id: "b2", type: "WIZARD_TOWER", x: 6, y: 6, level: 1 },
      { id: "b3", type: "MARKET", x: 7, y: 7, level: 1 },
      { id: "b4", type: "SMITHY", x: 8, y: 8, level: 1 },
      { id: "b5", type: "", x: 9, y: 9, level: 1 },
    ];
  })],
  ["every real building type", variant((s) => {
    s.town.buildings = ["STORAGE_BIN", "CAMPFIRE", "TOWN_HALL", "STOREHOUSE",
      "SAWMILL", "SMELTER", "GRANARY", "FARM_PLOT"]
      .map((t, i) => ({ id: "b" + i, type: t, x: i, y: i, level: 1 }));
  })],
  ["out of bounds buildings", variant((s) => {
    s.town.buildings = [
      { id: "b1", type: "CAMPFIRE", x: 500, y: 5, level: 1 },
      { id: "b2", type: "CAMPFIRE", x: 5, y: 9999, level: 1 },
      { id: "b3", type: "CAMPFIRE", x: 199, y: 199, level: 1 },
    ];
  })],
  ["building level zero and negative", variant((s) => {
    s.town.buildings = [
      { id: "b1", type: "CAMPFIRE", x: 5, y: 5, level: 0 },
      { id: "b2", type: "SAWMILL", x: 6, y: 6, level: -4 },
      { id: "b3", type: "GRANARY", x: 7, y: 7 },
    ];
  })],
  ["buildings not an array", variant((s) => { s.town.buildings = {}; })],
  ["missing town", variant((s) => { delete s.town; })],

  // --- clue hunts ----------------------------------------------------------
  ["clue step past end", variant((s) => { s.player.clue.step = 99; })],
  ["clue step negative", variant((s) => { s.player.clue.step = -4; })],
  ["clue sites out of world", variant((s) => {
    s.player.clue.sites = [{ x: 1, y: 1 }, { x: 99, y: 5 }, { x: 5, y: 99 }, { x: 41, y: 41 }];
  })],
  ["clue with no valid sites", variant((s) => { s.player.clue.sites = [{ x: 99, y: 99 }]; })],
  ["clue with empty sites", variant((s) => { s.player.clue.sites = []; })],
  ["clue unknown tier", variant((s) => { s.player.clue.tier = "legendary"; })],
  ["clue is null", variant((s) => { s.player.clue = null; })],
  ["clue missing", variant((s) => { delete s.player.clue; })],
  ["clue over eight sites", variant((s) => {
    s.player.clue.sites = Array.from({ length: 20 }, (_, i) => ({ x: i, y: i }));
  })],

  // --- farming -------------------------------------------------------------
  ["future plantedAt", variant((s) => {
    s.town.farm.plots = [{ seedId: "potato_seed", plantedAt: NOW + 999_999_999 }];
  })],
  ["plot missing seedId", variant((s) => {
    s.town.farm.plots = [{ plantedAt: NOW - 1000 }, { seedId: "x", plantedAt: NOW - 500 }];
  })],
  ["plot missing plantedAt", variant((s) => {
    s.town.farm.plots = [{ seedId: "cabbage_seed" }];
  })],
  ["over 32 plots", variant((s) => {
    s.town.farm.plots = Array.from({ length: 50 }, (_, i) => ({ seedId: "s" + i, plantedAt: NOW - 1 }));
  })],

  // --- clamped scalars ------------------------------------------------------
  ["resolve and special out of range", variant((s) => {
    s.player.resolve = 500;
    s.player.specialEnergy = -40;
  })],
  ["resolve fractional", variant((s) => { s.player.resolve = 33.7; })],
  ["unknown buff", variant((s) => { s.player.activeBuff = "godmode"; })],
  ["buff is null", variant((s) => { s.player.activeBuff = null; })],
  ["each real buff", variant((s) => { s.player.activeBuff = "warden"; })],
  ["unknown attack style", variant((s) => { s.settings.attackStyle = "berserk"; })],
  ["each real attack style", variant((s) => { s.settings.attackStyle = "defensive"; })],
  ["autoEat off-step", variant((s) => { s.settings.autoEatPct = 31; })],
  ["autoEat huge", variant((s) => { s.settings.autoEatPct = 999; })],
  ["autoEat negative", variant((s) => { s.settings.autoEatPct = -5; })],
  ["autoEat non-numeric", variant((s) => { s.settings.autoEatPct = "forty"; })],
  ["missing settings", variant((s) => { delete s.settings; })],

  // --- clock and map --------------------------------------------------------
  ["clock beyond a day", variant((s) => { s.clock = { minute: 99999, day: 3 }; })],
  ["clock day zero", variant((s) => { s.clock = { minute: 60, day: 0 }; })],
  ["missing clock", variant((s) => { delete s.clock; })],
  ["map mixed types", variant((s) => {
    s.map = { discovered: ["a", 1, "b", null], fastTravel: "yes", explored: [1, "x", 3, null] };
  })],
  ["fastTravel actually true", variant((s) => { s.map.fastTravel = true; })],
  ["missing map", variant((s) => { delete s.map; })],

  // --- collection log -------------------------------------------------------
  ["collectionLog bare array", variant((s) => { s.collectionLog = ["logs", "coins"]; })],
  ["collectionLog mixed types", variant((s) => { s.collectionLog = { unlocked: ["a", 1, null, "b"] }; })],
  ["missing collectionLog", variant((s) => { delete s.collectionLog; })],

  // --- timestamp -------------------------------------------------------------
  ["missing timestamp", variant((s) => { delete s.timestamp; })],
  ["negative timestamp", variant((s) => { s.timestamp = -5000; })],
  ["timestamp not a number", variant((s) => { s.timestamp = "yesterday"; })],

  // --- meta / journal --------------------------------------------------------
  ["meta mixed types", variant((s) => {
    s.player.meta = {
      kills: { giant_rat: 41, goblin: "many", bat: null },
      achievements: ["a", 1, null, "b"],
      counters: { x: 1.5, y: "no" },
    };
  })],
  ["missing meta", variant((s) => { delete s.player.meta; })],
  ["journal mixed types", variant((s) => { s.player.journal = ["q1", 2, null, "q2"]; })],

  // --- labour / market --------------------------------------------------------
  ["labour mixed types", variant((s) => {
    s.town.labour = {
      assignments: { bram: "mining", wren: 5, tobias: null },
      stock: { logs: 40, ore: "lots" },
      acc: { bram: 1200 },
      worked: {},
    };
  })],
  ["missing labour", variant((s) => { delete s.town.labour; })],
  ["missing market", variant((s) => { delete s.town.market; })],

  // --- skills ------------------------------------------------------------------
  ["skills with junk", variant((s) => {
    s.player.skills = {
      attack: { xp: 100, mastery: {} },
      not_a_skill: { xp: 500, mastery: { x: 4 } },
      woodcutting: { xp: -50, mastery: { logs: "many" } },
      mining: "nope",
    };
  })],
  ["missing skills", variant((s) => { delete s.player.skills; })],
];

// ---------------------------------------------------------------------------
// Build the C# side
// ---------------------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });
const exe = path.join(OUT, "sanitize.exe");

// Compile the WHOLE Core runtime, not a hand-listed subset.
//
// This used to name five files explicitly. That list rotted silently the moment
// GameState gained a reference to Isoperia.Core.World: the harness stopped
// compiling, printed "did not compile", and — because a non-compiling harness
// still exits non-zero in a CI that was already red — nobody noticed that
// sanitizer parity had not been checked at all for days.
//
// Core is noEngineReferences, so compiling all of it costs about a second and
// cannot rot this way again.
function collect(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return collect(p);
    return e.name.endsWith(".cs") ? [p] : [];
  });
}

const build = spawnSync("mcs", [
  "-out:" + exe, "-optimize+", "-langversion:latest",
  ...collect(CORE),
  path.join(ROOT, "tools/parity/SanitizeRoundTrip.cs"),
], { cwd: ROOT, encoding: "utf8" });

if (build.status !== 0) {
  console.log("FAIL  sanitizer parity: did not compile\n");
  console.log((build.stdout || "") + (build.stderr || ""));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Run both sides
// ---------------------------------------------------------------------------
const docs = cases.map(([, doc]) => JSON.stringify(doc));
const stdin = docs.map((d) => Buffer.from(d, "utf8").toString("base64")).join("\n") + "\n";

const run = spawnSync("mono", [exe], { cwd: ROOT, input: stdin, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (run.status !== 0) {
  console.log("FAIL  sanitizer parity: harness crashed");
  console.log(run.stderr || "");
  process.exit(1);
}

const csLines = run.stdout.split("\n");
if (csLines.length && csLines[csLines.length - 1] === "") csLines.pop();

// The TypeScript sanitizer reads Date.now() for its own "now"; pin it so the
// time-dependent rules match the fixed value the C# side was given.
const realNow = Date.now;
Date.now = () => NOW;
let sanitizeSave;
try {
  ({ sanitizeSave } = require(path.join(ROOT, ".qc-emit", "src", "utils", "Sanitizer.js")));
} catch (e) {
  Date.now = realNow;
  console.log("FAIL  sanitizer parity: could not load the TypeScript sanitizer.");
  console.log("      Run `npx tsc -p tests/tsconfig.json` first.");
  console.log("      " + e.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Deliberate divergences.
//
// The port is not required to reproduce the TypeScript bug-for-bug. Unity starts
// with fresh saves and never reads a save the web build wrote, so exact parity on
// malformed input is a correctness proxy, not a compatibility requirement — and
// in a handful of cases the original's behaviour is actively worse.
//
// Every one of those is listed here with its reason. The list is enforced in both
// directions: an unlisted divergence fails the run, and a listed one that STOPS
// diverging also fails, so this cannot quietly go stale.
// ---------------------------------------------------------------------------
const expectedDivergences = {
  // A case may instead declare `csDiffersAt`: a regex of paths where this ONE
  // case is allowed to differ in value. Narrower than MIGRATION_REWRITES, which
  // applies to every case — used where the divergence is a property of the
  // input, not of the migration in general.
  "out of bounds buildings": {
    csDiffersAt: /^town\.buildings$/,
    why: "TS DROPS a building outside the 42x42 map, keeping 1 of 3. Under the " +
         "mainland migration C# instead CLAMPS it through MainlandTownCoordinate " +
         "into the new town (centre +/- 8), keeping all 3. Relocating a player's " +
         "buildings is better than deleting them, and the coordinates were going " +
         "to be rewritten by the migration regardless. Note the `else if` in " +
         "Sanitizer: a save already at 2.2.0 still has out-of-bounds buildings " +
         "dropped, so this leniency applies only to the one-time migration.",
  },
  "not an object (array)": {
    csRejects: true,
    why: "typeof [] === 'object' in JavaScript, so the TS type guard lets an array " +
         "through and it yields a default profile. An array is not a save; rejecting " +
         "lets Load() fall through to the backup.",
  },
  "empty object": {
    csRejects: true,
    why: "TS treats a missing player as {} and hands back a brand-new character. " +
         "That is the worst outcome: the player appears to have lost everything, and " +
         "the next autosave overwrites the backup that still held their real save. " +
         "Rejecting routes Load() to that backup instead.",
  },
  "no player": {
    csRejects: true,
    why: "Same as 'empty object' -- a save with no player key is structurally broken, " +
         "not a new game.",
  },
  "player is null": {
    csRejects: true,
    why: "Same as 'empty object'. TS's `player ?? {}` turns an explicit null into a " +
         "default character.",
  },
  "empty name": {
    path: "player.name",
    why: "TS keeps \"\" because an empty string is still a string, which renders as a " +
         "blank name everywhere in the UI. C# substitutes the default hero name.",
  },
};

let pass = 0, fail = 0;
const failures = [];
const divergedAsExpected = new Set();

/** Reports the first differing path rather than dumping two documents. */
/**
 * Set by firstDifference when a csDiffersAt rule actually suppressed a real
 * difference. Without this a stale rule would look like a passing case: the
 * suppression is invisible, so the divergence could silently stop happening and
 * nobody would learn that the behaviour changed.
 */
let csDiffersAtFired = false;

function firstDifference(a, b, pathStr = "", csDiffersAt = null) {
  if (pathStr && isMigrationRewrite(pathStr)) return null;
  if (pathStr && csDiffersAt && csDiffersAt.test(pathStr)) {
    // Only counts as fired if the values genuinely differ.
    if (JSON.stringify(a) !== JSON.stringify(b)) csDiffersAtFired = true;
    return null;
  }

  const ta = a === null ? "null" : Array.isArray(a) ? "array" : typeof a;
  const tb = b === null ? "null" : Array.isArray(b) ? "array" : typeof b;

  if (ta !== tb) return `${pathStr || "(root)"}: type ${ta} vs ${tb}`;

  if (ta === "array") {
    if (a.length !== b.length) return `${pathStr}: length ${a.length} vs ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDifference(a[i], b[i], `${pathStr}[${i}]`, csDiffersAt);
      if (d) return d;
    }
    return null;
  }

  if (ta === "object") {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    const onlyA = ka.filter((k) => !kb.includes(k));
    const onlyB = kb.filter((k) => !ka.includes(k) && !csOnlyKeyAllowed(pathStr, k));
    if (onlyA.length) return `${pathStr}: only in TS: ${onlyA.join(", ")}`;
    if (onlyB.length) return `${pathStr}: only in C#: ${onlyB.join(", ")}`;
    for (const k of ka) {
      const d = firstDifference(a[k], b[k], pathStr ? `${pathStr}.${k}` : k, csDiffersAt);
      if (d) return d;
    }
    return null;
  }

  if (a !== b) return `${pathStr}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
  return null;
}

/**
 * Save keys the C# writes that the TypeScript never will.
 *
 * These are NOT behavioural divergences on malformed input — those go in
 * expectedDivergences above, case by case. These are whole fields belonging to
 * features that exist only in the Unity game: the web build was frozen at
 * Phase 0 and will never grow them.
 *
 * Keyed by the object path they appear at, so an unexpected key ANYWHERE ELSE
 * still fails. That distinction matters: a stray key at the root is new content,
 * a stray key inside `player` is probably a port bug.
 */
const CS_ONLY_KEYS = {
  // Resource node depletion state, persisted so a chopped tree stays chopped
  // across a reload. Added by "feat: persist unity resource node state"; the
  // web build has no equivalent because its nodes reset on load.
  "(root)": ["resources"],
};

function csOnlyKeyAllowed(pathStr, key) {
  const allowed = CS_ONLY_KEYS[pathStr || "(root)"];
  return Array.isArray(allowed) && allowed.includes(key);
}

/**
 * Paths the MAINLAND MIGRATION deliberately rewrites, plus the version stamp.
 *
 * The world moved from 42x42 to 126x126 ("feat: migrate to 126x126 mainland
 * world"). Sanitizer.NeedsMainlandMigration fires for any save older than
 * 2.2.0 and then, on purpose:
 *
 *   - moves the player to the new town centre (63,63), because their old
 *     coordinates address a map that no longer exists;
 *   - remaps building coordinates through MainlandTownCoordinate;
 *   - clears the active clue, whose target tiles are unreachable on the new map;
 *   - clears map.discovered, which describes the old world's tiles.
 *
 * The TypeScript reference is the frozen web build. It predates the mainland and
 * will never do any of this, so on these paths the two are SUPPOSED to differ.
 * Every corpus case is older than 2.2.0, so migration fires for all of them.
 *
 * Scoped to exact paths rather than switched off wholesale: everything the
 * migration does not touch — inventory, skills, equip slots, name clamping,
 * building type filtering, settings — is still compared strictly, which is where
 * the remaining value of this harness is.
 */
const MIGRATION_REWRITES = [
  /^player\.position\.[xy]$/,
  /^player\.clue$/,
  /^map\.discovered$/,
  /^map\.explored$/,
  /^map\.fastTravel$/,
  /^town\.buildings\[\d+\]\.[xy]$/,

  // Not a migration rewrite but the same kind of permanent, intended
  // difference: the sanitizer stamps the CURRENT save version on its output
  // (2.2.0), while the frozen web build stamps its own (1.1.0). These can never
  // agree and should not.
  /^version$/,
];

function isMigrationRewrite(pathStr) {
  return MIGRATION_REWRITES.some((re) => re.test(pathStr));
}

try {
  cases.forEach(([name, doc], i) => {
    const csRaw = csLines[i];

    if (csRaw === undefined) {
      fail++; failures.push(`${name}: no C# output (harness returned ${csLines.length} of ${cases.length})`);
      return;
    }
    if (csRaw.startsWith("THREW:")) {
      fail++; failures.push(`${name}: the sanitizer THREW, which it must never do -- ${csRaw}`);
      return;
    }

    const expected = expectedDivergences[name];
    const ts = sanitizeSave(doc);

    if (!ts.ok) {
      if (csRaw === "REJECTED") pass++;
      else { fail++; failures.push(`${name}: TS rejected ("${ts.reason}") but C# accepted`); }
      return;
    }

    if (csRaw === "REJECTED") {
      if (expected && expected.csRejects) {
        divergedAsExpected.add(name);
        pass++;
      } else {
        fail++;
        failures.push(`${name}: TS accepted but C# rejected, and that is not a listed divergence`);
      }
      return;
    }

    if (expected && expected.csRejects) {
      fail++;
      failures.push(`${name}: listed as a deliberate rejection, but C# accepted it -- ` +
                    `update expectedDivergences`);
      return;
    }

    let cs;
    try {
      cs = JSON.parse(csRaw);
    } catch {
      fail++; failures.push(`${name}: C# output is not valid JSON: ${csRaw.slice(0, 120)}`);
      return;
    }

    csDiffersAtFired = false;
    const diff = firstDifference(ts.state, cs, "", expected && expected.csDiffersAt);

    if (!diff) {
      if (expected && expected.csDiffersAt) {
        // Suppressed by a per-case rule. Enforced in both directions like every
        // other listed divergence: if it no longer differs, the rule is stale.
        if (csDiffersAtFired) {
          divergedAsExpected.add(name);
          pass++;
        } else {
          fail++;
          failures.push(`${name}: listed as diverging at ${expected.csDiffersAt}, but the ` +
                        `two now agree -- remove it from expectedDivergences`);
        }
      } else if (expected) {
        fail++;
        failures.push(`${name}: listed as diverging at ${expected.path}, but the two now ` +
                      `agree -- remove it from expectedDivergences`);
      } else {
        pass++;
      }
      return;
    }

    if (expected && expected.path && diff.startsWith(expected.path + ":")) {
      divergedAsExpected.add(name);
      pass++;
      return;
    }

    fail++;
    failures.push(`${name}: ${diff}`);
  });
} finally {
  Date.now = realNow;
}

for (const f of failures) console.log("FAIL  " + f);

// A listed divergence that never fired means the corpus no longer exercises it.
const unfired = Object.keys(expectedDivergences).filter((n) => !divergedAsExpected.has(n));
if (unfired.length) {
  console.log("FAIL  listed divergences that never occurred (stale list or missing case): " +
              unfired.join(", "));
  fail += unfired.length;
}

if (divergedAsExpected.size) {
  console.log(`\n${divergedAsExpected.size} deliberate divergences from the TypeScript, all on ` +
              `structurally broken input where the original silently hands back a fresh ` +
              `character:`);
  for (const n of divergedAsExpected) {
    console.log(`  - ${n}: ${expectedDivergences[n].why}`);
  }
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
