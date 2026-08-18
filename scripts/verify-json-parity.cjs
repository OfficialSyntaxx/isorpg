#!/usr/bin/env node
/**
 * QC: checks Isoperia.Core's JSON parser and writer against Node's.
 *
 * Core carries its own JSON implementation so that it can stay dependency-free
 * and testable outside Unity (see Save/Json.cs for the full reasoning). That is
 * a deliberate trade, but a hand-rolled parser is exactly the kind of thing that
 * looks fine and corrupts a save six months later — so it is checked against the
 * reference implementation the save format came from, rather than trusted.
 *
 * Method: feed both implementations the same documents, round-trip each
 * (parse then re-serialize), and compare the output. Documents cover the real
 * save shape plus the cases that break naive parsers: escapes, unicode and
 * surrogate pairs, deep nesting, empty containers, awkward numbers, duplicate
 * keys, and malformed input that must be rejected rather than half-accepted.
 *
 * Skips (does not fail) when no C# toolchain is installed.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, ".parity");
const CORE = path.join(ROOT, "unity/Assets/Isoperia/Core/Runtime");

function have(cmd) {
  return spawnSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8" }).status === 0;
}

if (!have("mcs") || !have("mono")) {
  console.log("SKIP  json parity: no C# toolchain (mcs/mono) installed (optional).");
  process.exit(0);
}

// --- the corpus -------------------------------------------------------------
const valid = [
  // scalars
  "null", "true", "false", "0", "-0", "1", "-1", "3.5", "-3.5",
  "1e3", "1E3", "1e-3", "-2.5e-8", "0.1", "123456789012", "1.7976931348623157e308",
  '""', '"hello"', '"with space"',

  // escapes
  '"quote:\\""', '"backslash:\\\\"', '"slash:\\/"',
  '"tab:\\t"', '"newline:\\n"', '"cr:\\r"', '"bs:\\b"', '"ff:\\f"',
  '"unicode:\\u00e9"', '"unicode:\\u4e2d\\u6587"', '"control:\\u0001"',
  '"surrogate:\\ud83d\\ude00"',            // emoji as a surrogate pair
  '"mixed: a\\tb\\\\c\\"d"',

  // containers
  "[]", "{}", "[1,2,3]", '["a","b"]', "[[[]]]", "[null,true,false]",
  '{"a":1}', '{"a":{"b":{"c":[1,2,{"d":null}]}}}',
  '{"empty_obj":{},"empty_arr":[]}',
  '{"dup":1,"dup":2}',                      // last wins, as in JavaScript

  // whitespace
  ' { "a" : [ 1 , 2 ] } ', "\t{\n\"a\"\t:\t1\n}\n",

  // the actual save shape
  JSON.stringify({
    version: "1.1.0",
    timestamp: 1787012241061,
    player: {
      name: "Corvin",
      position: { x: 10, y: 10 },
      stats: { hp: 87, maxHp: 100 },
      skills: {
        attack: { xp: 1543, mastery: {} },
        woodcutting: { xp: 22011, mastery: { logs: 412, oak_logs: 88 } },
      },
      inventory: [{ id: "coins", amount: 1240 }, { id: "logs", amount: 63 }],
      equipped: { weapon: "iron_sword", body: "iron_plate" },
      journal: ["q_intro"],
      meta: { kills: { giant_rat: 41 }, achievements: ["first_blood"], counters: {} },
      clue: null,
      resolve: 100,
      activeBuff: null,
      specialEnergy: 100,
    },
    town: {
      buildings: [{ id: "b_1", type: "CAMPFIRE", x: 20, y: 21, level: 2 }],
      labour: { assignments: { bram: "mining" }, stock: { iron_ore: 12 }, acc: {}, worked: {} },
      market: { supply: {}, demand: {} },
      farm: { plots: [null, { seedId: "potato_seed", plantedAt: 1787000000000 }] },
    },
    collectionLog: { unlocked: ["logs", "coins"] },
    settings: { autoEatPct: 40, attackStyle: "accurate" },
    clock: { minute: 600, day: 3 },
    map: { discovered: ["poi_a"], fastTravel: true, explored: [1, 2, 3] },
  }),
];

// Must be REJECTED. A parser that accepts these will also accept a corrupt save
// and hand the sanitizer something it was never designed to see.
const invalid = [
  "", "  ", "{", "}", "[", "]", "[1,", '{"a"}', '{"a":}', '{a:1}',
  "'single'", "tru", "nul", "[1,2,]", '{"a":1,}', "01", "+1", ".5", "1.",
  '"unterminated', '"bad\\escape"', "[1][2]", "{} {}", "undefined", "NaN", "Infinity",
];

// --- build the C# side ------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });
const exe = path.join(OUT, "jsonround.exe");

const build = spawnSync("mcs", [
  "-out:" + exe, "-optimize+", "-langversion:latest",
  path.join(CORE, "Save/Json.cs"),
  path.join(ROOT, "tools/parity/JsonRoundTrip.cs"),
], { cwd: ROOT, encoding: "utf8" });

if (build.status !== 0) {
  console.log("FAIL  json parity: did not compile\n");
  console.log((build.stdout || "") + (build.stderr || ""));
  process.exit(1);
}

const all = [...valid, ...invalid];
// Base64 framing: documents may be empty or contain newlines, and line framing
// silently drops the empty one -- which shifts every later result by one and
// presents as a screenful of unrelated parser failures.
const stdin = all.map((d) => Buffer.from(d, "utf8").toString("base64")).join("\n") + "\n";

const run = spawnSync("mono", [exe], { cwd: ROOT, input: stdin, encoding: "utf8" });
if (run.status !== 0) {
  console.log("FAIL  json parity: harness crashed");
  console.log(run.stderr || "");
  process.exit(1);
}

// Keep every line: a result may legitimately be an empty string, and dropping
// blanks would reintroduce the very misalignment base64 framing exists to avoid.
const got = run.stdout.split("\n");
if (got.length && got[got.length - 1] === "") got.pop();

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
};

ok(`harness returned ${all.length} results`, got.length === all.length,
   `got ${got.length}`);

// Valid documents: both sides must round-trip to the same string.
valid.forEach((doc, i) => {
  const expected = JSON.stringify(JSON.parse(doc));
  const actual = got[i];
  ok(
    `round-trip: ${doc.length > 60 ? doc.slice(0, 57) + "..." : doc}`,
    actual === expected,
    `expected ${expected}\n        actual   ${actual}`
  );
});

// Invalid documents: Node throws, so we must report PARSE_ERROR.
invalid.forEach((doc, i) => {
  const actual = got[valid.length + i];
  let nodeAccepts = true;
  try { JSON.parse(doc); } catch { nodeAccepts = false; }

  ok(
    `rejects: ${JSON.stringify(doc)}`,
    !nodeAccepts && actual === "PARSE_ERROR",
    nodeAccepts ? "Node accepted this; the corpus is wrong" : `got ${actual}, expected PARSE_ERROR`
  );
});

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
