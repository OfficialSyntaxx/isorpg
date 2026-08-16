// State rollback & anti-corruption guard (GDD §6.B).
// Sanitizes an arbitrary parsed payload into a valid SaveState, returning
// { ok, state, reason }. Never throws on malformed input.
import { BUILDING_TYPES } from "../data/Buildings";
import { DAY_START_MINUTE } from "../state/GameState";

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
  const skills: Record<string, { xp: number; mastery: Record<string, number> }> = {};
  const rawSkills = (p.skills ?? {}) as Record<string, unknown>;
  for (const [id, v] of Object.entries(rawSkills)) {
    const sv = (v ?? {}) as Record<string, unknown>;
    const mastery: Record<string, number> = {};
    const rawM = (sv.mastery ?? {}) as Record<string, unknown>;
    for (const [k, mv] of Object.entries(rawM)) if (isFiniteNumber(mv)) mastery[k] = mv;
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
      version,
      timestamp,
      player: { name: typeof p.name === "string" ? p.name.slice(0, 24) : "Hero", position: { x: gx, y: gy }, stats: { hp, maxHp }, skills, inventory, equipped, journal, meta: metaSafe },
      town: { buildings, labour: labourSafe, market: marketSafe },
      collectionLog: { unlocked: collectionLog },
      map: mapSafe,
      clock: clockSafe,
    },
  };
}

export function validateLegacy(raw: string): unknown {
  try {
    const parsed = JSON.parse(raw);
    const res = sanitizeSave(parsed);
    if (!res.ok) throw new Error(`Sanitize failed: ${res.reason ?? "unknown"}`);
    return res.state;
  } catch (e) {
    throw e; // caller routes to backup / fresh profile
  }
}