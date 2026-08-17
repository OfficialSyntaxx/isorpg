// State rollback & anti-corruption guard (GDD §6.B).
// Sanitizes an arbitrary parsed payload into a valid SaveState, returning
// { ok, state, reason }. Never throws on malformed input.
import { BUILDING_TYPES } from "../data/Buildings";
import { WORLD_SIZE } from "../world/Grid";
import { AUTO_EAT_STEPS, DAY_START_MINUTE, DEFAULT_AUTO_EAT_PCT, DEFAULT_HERO_NAME, SAVE_VERSION } from "../state/GameState";
import { ATTACK_STYLES, BUFFS, DEFAULT_ATTACK_STYLE, RESOLVE_MAX, type AttackStyle, type BuffId } from "../data/Combat";

export interface Sanitized<T> {
  ok: boolean;
  state: T | null;
  reason?: string;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function clampNonNeg(v: unknown, fallback: number): number {
  return isFiniteNumber(v) && v >= 0 ? Math.round(v) : fallback;
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function numList(v: unknown): number[] {
  return Array.isArray(v) ? v.filter(isFiniteNumber) : [];
}
function numMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === "object") for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (isFiniteNumber(val)) out[k] = val;
  return out;
}
function strMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (v && typeof v === "object") for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (typeof val === "string") out[k] = val;
  return out;
}

/** Compare dotted version strings; true when `a` is older than `b`. */
function olderThan(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0;
  }
  return false;
}

/**
 * Snap a stored auto-eat threshold to a selectable step.
 *
 * Anything outside the offered set — a hand-edited save, a value from a future
 * build, a NaN — becomes the default rather than a threshold the UI cannot
 * represent and the player cannot change back.
 */
function nearestAutoEatStep(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_AUTO_EAT_PCT;
  return AUTO_EAT_STEPS.reduce((best, step) =>
    Math.abs(step - v) < Math.abs(best - v) ? step : best, DEFAULT_AUTO_EAT_PCT as number);
}

/** F.1: an unrecognised or missing stance falls back to Accurate, never crashes. */
function coerceAttackStyle(v: unknown): AttackStyle {
  return typeof v === "string" && v in ATTACK_STYLES ? (v as AttackStyle) : DEFAULT_ATTACK_STYLE;
}

/** F.2: resolve is clamped into range; an unrecognised buff id is dropped, not kept active. */
function clampResolve(v: unknown): number {
  return isFiniteNumber(v) ? Math.max(0, Math.min(RESOLVE_MAX, Math.round(v))) : RESOLVE_MAX;
}
function coerceBuff(v: unknown): BuffId | null {
  return typeof v === "string" && v in BUFFS ? (v as BuffId) : null;
}

export function needsMasteryRescale(version: string): boolean {
  return olderThan(version, "1.1.0");
}

/** Validate + coerce save JSON into a safe shape. Fields we don't recognize are dropped. */
export function sanitizeSave(raw: unknown): { ok: boolean; state: unknown; reason?: string } {
  if (raw === null || typeof raw !== "object") return { ok: false, state: null, reason: "Not an object" };
  const r = raw as Record<string, unknown>;

  const version = typeof r.version === "string" ? r.version : "1.0.0";
  const timestamp = clampNonNeg(r.timestamp, Date.now());
  const p = (r.player ?? {}) as Record<string, unknown>;
  if (typeof p !== "object" || p === null) return { ok: false, state: null, reason: "Invalid player" };

  const pos = (p.position ?? {}) as Record<string, unknown>;
  const gx = clampNonNeg(pos.x, 10);
  const gy = clampNonNeg(pos.y, 10);

  const stats = (p.stats ?? {}) as Record<string, unknown>;
  const maxHp = clampNonNeg(stats.maxHp, 100);
  const hp = clampNonNeg(stats.hp, maxHp);

  // skills -> Record<skillId, {xp, mastery}>
  //
  // Pre-1.1.0 saves stored mastery XP at 4 per action on the OSRS skill curve;
  // 1.1.0 stores 1 per action on mastery's own curve. Both scales are
  // "actions performed x a constant", so dividing by 4 recovers the actions the
  // player really did — read on the new curve those actions simply count for
  // much more, which is the point of the retune. Reading the old number as-is
  // would hand out near-max mastery instantly.
  const masteryDivisor = needsMasteryRescale(version) ? 4 : 1;
  const skills: Record<string, { xp: number; mastery: Record<string, number> }> = {};
  const rawSkills = (p.skills ?? {}) as Record<string, unknown>;
  for (const [id, v] of Object.entries(rawSkills)) {
    const sv = (v ?? {}) as Record<string, unknown>;
    const mastery: Record<string, number> = {};
    const rawM = (sv.mastery ?? {}) as Record<string, unknown>;
    for (const [k, mv] of Object.entries(rawM)) if (isFiniteNumber(mv)) mastery[k] = Math.floor(mv / masteryDivisor);
    skills[id] = { xp: clampNonNeg(sv.xp, 0), mastery };
  }

  // inventory -> safe stacks
  const rawInv = Array.isArray(p.inventory) ? p.inventory : [];
  const inventory: { id: string; amount: number }[] = [];
  for (const e of rawInv) {
    const ee = (e ?? {}) as Record<string, unknown>;
    if (typeof ee.id === "string") {
      const amount = clampNonNeg(ee.amount, 0);
      if (amount > 0) inventory.push({ id: ee.id, amount });
    }
  }

  // equipped -> safe slot map (P2 equipment)
  const EQUIP_SLOTS = ["weapon", "offhand", "head", "body", "legs"];
  const rawEq = (p.equipped ?? {}) as Record<string, unknown>;
  const equipped: Record<string, string> = {};
  for (const slot of EQUIP_SLOTS) {
    const v = rawEq[slot];
    if (typeof v === "string" && v) equipped[slot] = v;
  }

  // town buildings — only known building types with in-bounds coordinates survive
  const town = (r.town ?? {}) as Record<string, unknown>;
  const rawBuildings = Array.isArray(town.buildings) ? town.buildings : [];
  const buildings = rawBuildings
    .map((b) => {
      const bb = (b ?? {}) as Record<string, unknown>;
      return {
        id: typeof bb.id === "string" ? bb.id : "b_" + Math.random().toString(36).slice(2, 8),
        type: typeof bb.type === "string" ? bb.type : "",
        x: clampNonNeg(bb.x, 0),
        y: clampNonNeg(bb.y, 0),
        level: Math.max(1, clampNonNeg(bb.level, 1)),
      };
    })
    .filter((b) => (BUILDING_TYPES as string[]).includes(b.type) && b.x < 200 && b.y < 200);

  // collection log
  // An active clue hunt. Sites must be in bounds and the step must point inside
  // the site list, or a hand-edited save could park the player on a hunt with no
  // reachable tile and no way to finish it.
  const rawClue = (p.clue ?? null) as Record<string, unknown> | null;
  let clue: { tier: string; seed: number; step: number; sites: { x: number; y: number }[] } | null = null;
  if (rawClue && (rawClue.tier === "simple" || rawClue.tier === "hard") && Array.isArray(rawClue.sites)) {
    const sites = rawClue.sites
      .map((v) => (v ?? {}) as Record<string, unknown>)
      .filter((v) => isFiniteNumber(v.x) && isFiniteNumber(v.y))
      .map((v) => ({ x: clampNonNeg(v.x, 0), y: clampNonNeg(v.y, 0) }))
      .filter((v) => v.x < WORLD_SIZE && v.y < WORLD_SIZE)
      .slice(0, 8);
    if (sites.length) {
      const step = isFiniteNumber(rawClue.step) ? Math.max(0, Math.min(sites.length - 1, Math.floor(rawClue.step))) : 0;
      clue = { tier: rawClue.tier, seed: isFiniteNumber(rawClue.seed) ? rawClue.seed : 0, step, sites };
    }
  }

  // Farming beds: a bed is {seedId, plantedAt} or null. A future plantedAt would
  // leave a crop permanently unripe, so it is clamped to now.
  const rawPlots = Array.isArray((r.town as any)?.farm?.plots) ? (r.town as any).farm.plots : [];
  const now = Date.now();
  const farmPlots = rawPlots.slice(0, 32).map((p: unknown) => {
    const pp = (p ?? null) as Record<string, unknown> | null;
    if (!pp || typeof pp.seedId !== "string") return null;
    const at = isFiniteNumber(pp.plantedAt) ? Math.min(pp.plantedAt, now) : now;
    return { seedId: pp.seedId, plantedAt: at };
  });

  const rawLog = Array.isArray(r.collectionLog) ? r.collectionLog : (r as any).collectionLog?.unlocked ?? [];
  const collectionLog = Array.isArray(rawLog) ? rawLog.filter((x) => typeof x === "string") : [];

  // P6–P8 metadata: journal, meta counters/kills, labour, market, map
  const journal = strList(p.journal);
  const meta = (p.meta ?? {}) as Record<string, unknown>;
  const metaSafe = { kills: numMap(meta.kills), achievements: strList(meta.achievements), counters: numMap(meta.counters) };
  const labour = (town.labour ?? {}) as Record<string, unknown>;
  const labourSafe = { assignments: strMap(labour.assignments), stock: numMap(labour.stock), acc: numMap(labour.acc), worked: numMap(labour.worked) };
  const market = (town.market ?? {}) as Record<string, unknown>;
  const marketSafe = { supply: numMap(market.supply), demand: numMap(market.demand) };
  const rawClock = (r.clock ?? {}) as Record<string, unknown>;
  const clockSafe = {
    minute: Math.min(1439, clampNonNeg(rawClock.minute, DAY_START_MINUTE)),
    day: Math.max(1, clampNonNeg(rawClock.day, 1)),
  };
  const rawMap = (r.map ?? {}) as Record<string, unknown>;
  const mapSafe = { discovered: strList(rawMap.discovered), fastTravel: rawMap.fastTravel === true, explored: numList(rawMap.explored) };

  return {
    ok: true,
    state: {
      version: SAVE_VERSION,
      timestamp,
      player: { name: typeof p.name === "string" ? p.name.slice(0, 24) : DEFAULT_HERO_NAME, position: { x: gx, y: gy }, stats: { hp, maxHp }, skills, inventory, equipped, journal, meta: metaSafe, clue, resolve: clampResolve(p.resolve), activeBuff: coerceBuff(p.activeBuff) },
      town: { buildings, labour: labourSafe, market: marketSafe, farm: { plots: farmPlots } },
      collectionLog: { unlocked: collectionLog },
      settings: {
        autoEatPct: nearestAutoEatStep((r as any).settings?.autoEatPct),
        attackStyle: coerceAttackStyle((r as any).settings?.attackStyle),
      },
      map: mapSafe,
      clock: clockSafe,
    },
  };
}

