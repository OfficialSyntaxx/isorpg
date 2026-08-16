// Standard OSRS-style XP curve, max level 99.
// XP required to REACH level L = sum_{n=1..L-1} floor(n + 300 * 2^(n/7)) / 4

const MAX_LEVEL = 99;

function buildXpTable(): number[] {
  // cumulative[level] = total xp required to reach `level`.
  const cumulative: number[] = [0]; // level 0 = 0 xp
  let total = 0;
  // Runs to n === MAX_LEVEL so cumulative[99] is written. Stopping at n < 99
  // left the top threshold undefined, which capped every skill at 98 and made
  // levelProgress() divide by undefined at level 98 (NaN width on the XP bar).
  for (let n = 1; n <= MAX_LEVEL; n++) {
    // GDD formula: sum floor(n + 300·2^(n/7)) over n, THEN divide by 4 once.
    // To reach level L we sum terms n = 1..L-1, so record the threshold
    // from the accumulated terms BEFORE adding term n.
    cumulative[n] = Math.floor(total / 4);
    total += Math.floor(n + 300 * Math.pow(2, n / 7));
  }
  return cumulative;
}

export const XP_TABLE = buildXpTable();

export function levelFromXp(xp: number): number {
  for (let lvl = MAX_LEVEL; lvl >= 1; lvl--) {
    if (xp >= XP_TABLE[lvl]) return lvl;
  }
  return 1;
}

/** Fractional progress (0..1) within the current level, for the XP bar. */
export function levelProgress(xp: number): { level: number; into: number } {
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) return { level, into: 1 };
  const cur = XP_TABLE[level];
  const next = XP_TABLE[level + 1];
  // Belt-and-braces: this value is written straight into a CSS width, and a
  // NaN there is silently dropped by the browser, freezing the bar.
  const into = (xp - cur) / (next - cur);
  return { level, into: Number.isFinite(into) ? Math.max(0, Math.min(1, into)) : 0 };
}

export function xpToNext(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return XP_TABLE[level + 1] - XP_TABLE[level];
}