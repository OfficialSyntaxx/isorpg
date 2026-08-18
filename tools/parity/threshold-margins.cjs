// How close does world generation ever come to flipping a threshold?
//
// The C#/TS dumps agree byte-for-byte, but that compares Mono against V8. The
// shipped WebGL build goes through IL2CPP + emscripten's libm, where sin/cos may
// differ in the last ULP. This measures the smallest margin any tile has against
// any decision threshold. If that margin is many orders of magnitude larger than
// double precision (~2.2e-16 relative), a last-ULP difference cannot flip a tile
// and world-gen is portable across every runtime we care about.
const W = 42, H = 42;

function patchNoise(x, y) {
  return Math.sin(x * 0.31) * Math.cos(y * 0.27)
       + Math.sin((x + y) * 0.17) * 0.8
       + Math.cos((x - y) * 0.23) * 0.6;
}
function lakeNoise(x, y) {
  return Math.sin(x * 0.9) + Math.cos(y * 0.6) + Math.sin((x + y) * 0.45);
}

const checks = [
  { name: "lake      n > 2.15 ", thr: 2.15, f: lakeNoise,
    inRange: (x, y) => x > 3 && y > 3 && x < W - 4 && y < H - 4 },
  { name: "rock      p > 1.66 ", thr: 1.66, f: patchNoise, inRange: () => true },
  { name: "dirt      p > 0.93 ", thr: 0.93, f: patchNoise, inRange: () => true },
];

let worst = Infinity, worstWhere = null;

for (const c of checks) {
  let min = Infinity, at = null;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!c.inRange(x, y)) continue;
      const d = Math.abs(c.f(x, y) - c.thr);
      if (d < min) { min = d; at = [x, y]; }
    }
  }
  console.log(`${c.name}  closest approach: ${min.toExponential(3)}  at (${at})`);
  if (min < worst) { worst = min; worstWhere = [c.name.trim(), at]; }
}

// The coast/edge rolls compare a PRNG output against 0.5. That path is integer
// arithmetic only -- no transcendentals -- so it is exact on every runtime and
// is not at risk. Reported for completeness.
console.log("");
console.log(`tightest margin anywhere: ${worst.toExponential(3)}  (${worstWhere[0]} at ${worstWhere[1]})`);
console.log(`double epsilon (relative): ~2.220e-16`);
console.log(`margin is ~${(worst / 2.22e-16).toExponential(1)}x larger than one ULP`);
