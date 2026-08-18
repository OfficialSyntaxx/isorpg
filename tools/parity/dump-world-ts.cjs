// Dumps the world from the ORIGINAL TypeScript implementation, in exactly the
// format tools/parity/DumpWorld.cs emits, so the two can be diffed byte for
// byte. Driven by scripts/verify-core-parity.cjs; requires `.qc-emit` to have
// been produced by `npx tsc -p tests/tsconfig.json` first.
const path = require("path");
const { Grid } = require(path.join(__dirname, "..", "..", ".qc-emit", "src", "world", "Grid.js"));
const { findPath } = require(path.join(__dirname, "..", "..", ".qc-emit", "src", "ai", "AStar.js"));

const T = { GRASS: "G", WATER: "W", ROCK: "R", DIRT: "D", SAND: "S", ROAD: "O" };
const B = { MEADOW: "M", FOREST: "F", SNOW: "N", SWAMP: "P" };

const g = new Grid();
const out = [];

out.push(`SIZE ${g.width}x${g.height}`);

out.push("TERRAIN");
for (let y = 0; y < g.height; y++) {
  let row = "";
  for (let x = 0; x < g.width; x++) row += T[g.at(x, y).terrainType];
  out.push(row);
}

out.push("BIOME");
for (let y = 0; y < g.height; y++) {
  let row = "";
  for (let x = 0; x < g.width; x++) row += B[g.at(x, y).biome];
  out.push(row);
}

out.push("ZONE");
for (let y = 0; y < g.height; y++)
  for (let x = 0; x < g.width; x++) out.push(g.at(x, y).zoneId);

out.push("SEED");
for (let y = 0; y < g.height; y++)
  for (let x = 0; x < g.width; x++) out.push(String(g.at(x, y).seed));

out.push("ELEVATION");
for (let y = 0; y < g.height; y++)
  for (let x = 0; x < g.width; x++) out.push(g.at(x, y).elevation.toFixed(12));

out.push("WALKABLE");
for (let y = 0; y < g.height; y++) {
  let row = "";
  for (let x = 0; x < g.width; x++) row += g.at(x, y).walkable ? "1" : "0";
  out.push(row);
}

// See DumpWorld.cs for why exact path equality is the assertion.
for (let y = 0; y < g.height; y++)
  for (let x = 0; x < g.width; x++)
    if ((x * 7 + y * 13) % 23 === 0 && g.at(x, y).walkable)
      g.at(x, y).occupant = "RESOURCE_NODE";

out.push("PATHS");
const cases = [
  [10, 10, 20, 20, 0],
  [10, 10, 20, 20, 1],
  [8, 8, 33, 33, 0],
  [33, 33, 8, 8, 0],
  [10, 10, 10, 11, 0],
  [10, 10, 0, 0, 0],
  [10, 10, 0, 0, 1],
  [20, 20, 21, 21, 1],
  [5, 20, 36, 21, 0],
  [20, 5, 21, 36, 1],
];
for (const [sx, sy, gx, gy, adj] of cases) {
  const p = findPath(g, sx, sy, gx, gy, adj === 1);
  const head = `${sx},${sy}->${gx},${gy} ${adj}: `;
  if (p === null) { out.push(head + "null"); continue; }
  // Cost, endpoints and length -- not the tile sequence. See AStar.cs.
  let cost = 0, px = sx, py = sy;
  for (const [x, y] of p) { cost += (x !== px && y !== py) ? Math.SQRT2 : 1; px = x; py = y; }
  const last = p[p.length - 1];
  out.push(head + `steps=${p.length} end=${last[0]},${last[1]} cost=${cost.toFixed(9)}`);
}

process.stdout.write(out.join("\n") + "\n");
