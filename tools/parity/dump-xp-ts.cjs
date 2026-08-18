// Dumps the XP curve from the ORIGINAL TypeScript, in the format DumpXpTable.cs
// emits, so the two can be diffed byte for byte.
const path = require("path");
const { XP_TABLE, levelFromXp } = require(path.join(__dirname, "..", "..", ".qc-emit", "src", "data", "XPTable.js"));

const out = [];
out.push("THRESHOLDS");
for (let lvl = 0; lvl <= 99; lvl++) out.push(`${lvl}=${lvl <= 1 ? 0 : XP_TABLE[lvl]}`);

out.push("LEVEL_FROM_XP");
const probes = [
  0, 1, 82, 83, 84, 173, 174, 1153, 1154,
  101332, 101333, 273742, 737627, 1986068, 5346332,
  11805606, 13034430, 13034431, 20000000,
];
for (const xp of probes) out.push(`${xp}->${levelFromXp(xp)}`);

process.stdout.write(out.join("\n") + "\n");
