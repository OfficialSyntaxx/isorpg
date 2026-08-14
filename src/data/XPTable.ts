// Standard OSRS-style XP curve, max level 99.
// XP required to REACH level L = sum_{n=1..L-1} floor(n + 300 * 2^(n/7)) / 4

const MAX_LEVEL = 99;

function buildXpTable(): number[] {
  // cumulative[level] = total xp required to reach `level`.
  const cumulative: number[] = [0]; // level 0 = 0 xp
  let total = 0;
  for (let n = 1; n < MAX_LEVEL; n++) {
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
  return { level, into: (xp - cur) / (next - cur) };
}

export function xpToNext(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return XP_TABLE[level + 1] - XP_TABLE[level];
}