/**
 * The XP curve, ported from src/data/XPTable.ts.
 *
 * WHY PORTED RATHER THAN IMPORTED
 * The game's module lives outside web/ and is compiled by a different
 * toolchain against different tsconfig settings. Importing across that
 * boundary would couple the website build to the game build for one array of
 * numbers.
 *
 * The formula is duplicated, so it can drift — which is why
 * scripts/verify-xp-parity.cjs asserts this table equals the game's, element
 * for element, in CI. A chart of made-up numbers would be worse than no chart:
 * the whole point of §5.5 is that the curve on the page is the real one.
 */

const MAX_LEVEL = 99;

function buildXpTable(): number[] {
  const cumulative: number[] = [0];
  let total = 0;
  for (let n = 1; n <= MAX_LEVEL; n++) {
    cumulative[n] = Math.floor(total / 4);
    total += Math.floor(n + 300 * Math.pow(2, n / 7));
  }
  return cumulative;
}

export const XP_TABLE: readonly number[] = buildXpTable();
export const MAX = MAX_LEVEL;

export interface CurvePoint {
  level: number;
  xp: number;
}

/** Every level from 1 to 99 with the cumulative XP needed to reach it. */
export function curve(): CurvePoint[] {
  const out: CurvePoint[] = [];
  for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
    out.push({ level: lvl, xp: XP_TABLE[lvl] as number });
  }
  return out;
}

/**
 * The levels worth labelling.
 *
 * Chosen to tell the curve's actual story rather than to decorate it: the first
 * three are how quickly early levels arrive, and the last three are how much of
 * the total sits in the final stretch. Selective labels, never one per point.
 */
export const MILESTONES = [10, 30, 50, 70, 92, 99] as const;

/** Human-readable XP: 13,034,431 is unreadable at chart-label size. */
export function shortXp(xp: number): string {
  if (xp >= 1_000_000) return `${(xp / 1_000_000).toFixed(xp >= 10_000_000 ? 0 : 1)}M`;
  if (xp >= 1_000) return `${Math.round(xp / 1_000)}k`;
  return String(xp);
}

/** Full XP with thousands separators, for tooltips and the table view. */
export function fullXp(xp: number): string {
  return xp.toLocaleString("en-US");
}

/**
 * The level a cumulative experience total buys, 1–99.
 *
 * The game's own `levelFromXp` walks the same table. Duplicated here for the
 * same reason the table itself is — the game's module is compiled by a
 * different toolchain — and covered by the same parity check.
 */
export function levelFromXp(xp: number): number {
  let level = 1;
  for (let n = 1; n <= MAX_LEVEL; n++) {
    if (xp >= (XP_TABLE[n] as number)) level = n;
    else break;
  }
  return level;
}
