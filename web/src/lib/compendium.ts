/**
 * The compendium: every item in the game, and everything that touches it.
 *
 * WHY THIS EXISTS AS ITS OWN MODULE
 * gamedata.ts answers questions a page asks about one system — what monsters
 * are there, what nodes exist, what does the XP table say. This answers the
 * question a PLAYER asks, which cuts across all of them: "where does this come
 * from, and what is it for?"
 *
 * That question has no home in the game's exports. Every content file points
 * one way — a monster names the items it drops, a recipe names its inputs, a
 * quest names its reward — and nothing points back. An item does not know it is
 * dropped by anything. So the index is built here, once, at build time, by
 * walking every file that mentions an item and inverting it.
 *
 * WHAT THIS SURFACES THAT THE SITE HAS NEVER SHOWN
 * Audited before writing: of thirteen content exports the game ships, four were
 * referenced by no page at all — quests, shop stock, clue scrolls and critters —
 * and farming appeared once, as a word. Those are real, shipped systems with
 * real data, invisible to anyone who did not have the repository. They are the
 * "content nobody else has", and they were already in the build.
 *
 * EVERY EDGE IS DERIVED, NEVER TYPED
 * There is no hand-written mapping in this file. If a recipe changes its
 * inputs, the item page changes with it, because the page is a view over the
 * export rather than a copy of it. That is the same contract /bestiary and
 * /wiki already keep, and it is the only reason a wiki this size is
 * maintainable by one person.
 */
import fs from "node:fs";
import path from "node:path";

function findContentDir(): string {
  const rel = "unity/Assets/Isoperia/Resources/Content";
  let dir = process.cwd();
  for (;;) {
    const candidate = path.join(dir, rel);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not find ${rel} walking up from ${process.cwd()}.`);
}

const DIR = findContentDir();
const load = <T>(name: string): T =>
  JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), "utf8")) as T;

/* --------------------------------------------------------------------------
 * Raw shapes. Only the fields this module reads are declared; the exports
 * carry more, and declaring fields nobody uses invites them to drift.
 * ----------------------------------------------------------------------- */

export interface RawItem {
  id: string;
  name: string;
  desc?: string;
  type?: string;
  value?: number;
  stack?: boolean;
  levelReq?: number;
  equip?: Record<string, unknown>;
  tool?: Record<string, unknown>;
  xp?: Record<string, number>;
}

interface RawRecipe {
  id: string;
  name: string;
  skill: string;
  levelReq: number;
  ticks: number;
  xp: number;
  inputs: { itemId: string; qty: number }[];
  output: { itemId: string; qty: number };
}

/* Quests come in FOUR shapes and the differences are load-bearing.
 *
 * `starterType` decides what `target` means:
 *   inventory — an ITEM id. Bring this many.
 *   kills     — a MONSTER id. Kill this many.
 *   journal   — a progress flag. Neither an item nor a monster.
 *   absent    — no target at all; the quest is completed elsewhere.
 *
 * Treating all four as item ids (the first version of this) produced links to
 * /items/giant_rat/ and /items/cinder_hollow_returned/, neither of which is an
 * item and neither of which is a page. Rendered, they read as real items with
 * real pages, and both 404ed.
 *
 * Rewards carry EITHER `qty` OR a `min`/`max` range, never both. Reading only
 * `qty` printed "× Coins" with the number missing on two of the six quests.
 */
type StarterType = "inventory" | "kills" | "journal";

interface RawReward {
  itemId: string;
  qty?: number;
  min?: number;
  max?: number;
}

interface RawQuest {
  id: string;
  title: string;
  summary: string;
  doneText?: string;
  starterType?: StarterType;
  target?: string;
  count?: number;
  rewards?: RawReward[];
}

/** "12", or "4–8". One place, because three call sites need it. */
function amount(r: RawReward): string {
  if (typeof r.qty === "number") return String(r.qty);
  if (typeof r.min === "number" && typeof r.max === "number")
    return r.min === r.max ? String(r.min) : `${r.min}–${r.max}`;
  return "?";
}

interface RawSeed {
  id: string;
  name: string;
  levelReq: number;
  xp: number;
  growMs: number;
  produce: { itemId: string; min: number; max: number };
}

interface RawClue {
  tier: string;
  name: string;
  itemId: string;
  steps: number;
  coins: { min: number; max: number };
  loot: { itemId: string; min: number; max: number }[];
  unique?: { itemId: string; chance: number };
}

interface RawNode {
  skill: string;
  levelReq: number;
  ticksPerAction: number;
  drops?: { itemId: string; weight: number }[];
}

const items = load<{ ITEMS: Record<string, RawItem> }>("items").ITEMS;
const recipes = load<{ RECIPES: Record<string, RawRecipe> }>("recipes").RECIPES;
const quests = load<{ QUESTS: Record<string, RawQuest> }>("quests").QUESTS;
const shop = load<{ STOCK: { itemId: string; price: number }[] }>("shop").STOCK;
const seeds = load<{ SEEDS: Record<string, RawSeed> }>("farming").SEEDS;
const clues = load<{ CLUE_TIERS: Record<string, RawClue> }>("clues").CLUE_TIERS;
const nodes = load<{ RESOURCES: Record<string, RawNode> }>("skills").RESOURCES;
const monsters = load<{
  MONSTERS: Record<
    string,
    {
      name: string;
      /* The field is `main`, NOT `drops`.
       *
       * The first version of this index read `m.drops`, which does not exist on
       * any monster. It threw no error and produced no warning — it simply
       * indexed zero drops, and the result still looked healthy at 58 of 62
       * items connected, because gathering, crafting and the shop cover most of
       * them. It was caught by checking one fact known to be true from the
       * bestiary page: bones drop from Giant Rats. They did not appear.
       *
       * gamedata.ts:293 has always had the right names. Matching them here is
       * the point; two readers of the same export must not disagree about what
       * it is called. */
      main?: { itemId: string; weight?: number; min?: number; max?: number }[];
      tertiary?: { itemId: string; chance: number; min?: number; max?: number }[];
      petTable?: { itemId: string; chance: number }[];
    }
  >;
}>("combat").MONSTERS;

/* --------------------------------------------------------------------------
 * The graph
 * ----------------------------------------------------------------------- */

/** One way an item enters a player's inventory. */
export interface Source {
  kind: "drop" | "gather" | "craft" | "farm" | "shop" | "clue" | "quest";
  /** Human label for the thing that provides it. */
  label: string;
  /** Route to the provider, when one exists. */
  href?: string;
  /** Free-text qualifier: a chance, a price, a quantity range. */
  detail?: string;
}

/** One thing an item is consumed by or counts towards. */
export interface Use {
  kind: "craft" | "quest";
  label: string;
  href?: string;
  detail?: string;
}

export interface Item extends RawItem {
  sources: Source[];
  uses: Use[];
}

const title = (s: string): string =>
  s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const itemName = (id: string): string => items[id]?.name ?? title(id);

let built: Map<string, Item> | null = null;

function build(): Map<string, Item> {
  if (built) return built;

  const map = new Map<string, Item>();
  for (const [id, raw] of Object.entries(items)) {
    map.set(id, { ...raw, id, sources: [], uses: [] });
  }
  /** Push only for items that exist; a dangling id is a data bug, not a page. */
  const addSource = (id: string, s: Source): void => {
    map.get(id)?.sources.push(s);
  };
  const addUse = (id: string, u: Use): void => {
    map.get(id)?.uses.push(u);
  };

  // --- monsters ------------------------------------------------------------
  for (const [mid, m] of Object.entries(monsters)) {
    const href = `/bestiary/#${mid}`;
    const main = m.main ?? [];
    const total = main.reduce((sum, d) => sum + (d.weight ?? 0), 0);
    for (const d of main) {
      const pct = total > 0 ? ((d.weight ?? 0) / total) * 100 : 0;
      addSource(d.itemId, {
        kind: "drop",
        label: m.name,
        href,
        detail: `${pct >= 1 ? Math.round(pct) : pct.toFixed(1)}%`,
      });
    }
    for (const d of m.tertiary ?? [])
      addSource(d.itemId, {
        kind: "drop",
        label: m.name,
        href,
        detail: `${(d.chance * 100).toFixed(1)}% rare`,
      });
    for (const d of m.petTable ?? [])
      addSource(d.itemId, { kind: "drop", label: m.name, href, detail: "pet" });
  }

  // --- gathering nodes -----------------------------------------------------
  for (const [nid, n] of Object.entries(nodes)) {
    for (const d of n.drops ?? []) {
      addSource(d.itemId, {
        kind: "gather",
        label: title(nid),
        detail: `${title(n.skill)} lv ${n.levelReq}`,
      });
    }
  }

  // --- recipes, both directions -------------------------------------------
  for (const r of Object.values(recipes)) {
    // What a recipe CONSUMES belongs on the "made by" line: knowing bronze bars
    // come from a smelter is useless without knowing what goes in it.
    const from = r.inputs.map((i) => `${i.qty}x ${itemName(i.itemId)}`).join(" + ");
    addSource(r.output.itemId, {
      kind: "craft",
      label: r.name,
      detail: `${from} · ${title(r.skill)} lv ${r.levelReq}`,
    });
    for (const i of r.inputs) {
      // Linked to the OUTPUT item, not left as bare text. The entire value of
      // this index is that one page reaches the next; a recipe name that goes
      // nowhere is a dead end in the middle of the graph.
      addUse(i.itemId, {
        kind: "craft",
        label: r.name,
        href: `/items/${r.output.itemId}/`,
        detail: `${i.qty}x → ${r.output.qty}x ${itemName(r.output.itemId)}`,
      });
    }
  }

  // --- farming -------------------------------------------------------------
  for (const s of Object.values(seeds)) {
    addSource(s.produce.itemId, {
      kind: "farm",
      label: s.name,
      href: "/quests/#farming",
      detail: `${s.produce.min}–${s.produce.max} per crop`,
    });
  }

  // --- the shop ------------------------------------------------------------
  for (const s of shop) {
    addSource(s.itemId, {
      kind: "shop",
      label: "General store",
      detail: `${s.price} coins`,
    });
  }

  // --- clue scrolls --------------------------------------------------------
  for (const c of Object.values(clues)) {
    for (const l of c.loot) {
      addSource(l.itemId, {
        kind: "clue",
        label: c.name,
        href: "/quests/#clues",
        detail: `${l.min}–${l.max}`,
      });
    }
    if (c.unique) {
      addSource(c.unique.itemId, {
        kind: "clue",
        label: c.name,
        href: "/quests/#clues",
        detail: `${Math.round(c.unique.chance * 100)}% unique`,
      });
    }
  }

  // --- quests --------------------------------------------------------------
  for (const q of Object.values(quests)) {
    for (const r of q.rewards ?? []) {
      addSource(r.itemId, {
        kind: "quest",
        label: q.title,
        href: `/quests/#${q.id}`,
        detail: `${amount(r)}x reward`,
      });
    }
    // ONLY an inventory target is an item. A kills target is a monster and a
    // journal target is a flag; adding either here would attach a use to an
    // item that does not exist.
    if (q.target && q.starterType === "inventory") {
      addUse(q.target, {
        kind: "quest",
        label: q.title,
        href: `/quests/#${q.id}`,
        detail: q.count ? `${q.count} needed` : undefined,
      });
    }
  }

  built = map;
  return map;
}

/** Every item, alphabetical by name. */
export function allItems(): Item[] {
  return [...build().values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function item(id: string): Item | null {
  return build().get(id) ?? null;
}

/** The item ids that have at least one source or use — i.e. a page worth reading. */
export function connectedItems(): Item[] {
  return allItems().filter((i) => i.sources.length > 0 || i.uses.length > 0);
}

/* --------------------------------------------------------------------------
 * The systems that had no page at all
 * ----------------------------------------------------------------------- */

export interface QuestTarget {
  kind: StarterType;
  id: string;
  name: string;
  count: number;
  /** Only an inventory target has an item page; a kills target has a bestiary
   *  anchor; a journal flag has nowhere to go and must not pretend otherwise. */
  href?: string;
  /** Whether an item icon exists for it. Only true for inventory targets. */
  icon: boolean;
}

export interface QuestRow {
  id: string;
  title: string;
  summary: string;
  doneText?: string;
  target?: QuestTarget;
  rewards: { id: string; name: string; amount: string }[];
}

export function questRows(): QuestRow[] {
  return Object.values(quests).map((q) => {
    let target: QuestTarget | undefined;
    if (q.target && q.starterType) {
      const count = q.count ?? 1;
      if (q.starterType === "inventory") {
        target = {
          kind: "inventory",
          id: q.target,
          name: itemName(q.target),
          count,
          href: `/items/${q.target}/`,
          icon: true,
        };
      } else if (q.starterType === "kills") {
        target = {
          kind: "kills",
          id: q.target,
          name: monsters[q.target]?.name ?? title(q.target),
          count,
          href: `/bestiary/#${q.target}`,
          icon: false,
        };
      } else {
        target = {
          kind: "journal",
          id: q.target,
          name: title(q.target),
          count,
          icon: false,
        };
      }
    }
    return {
      id: q.id,
      title: q.title,
      summary: q.summary,
      doneText: q.doneText,
      target,
      rewards: (q.rewards ?? []).map((r) => ({
        id: r.itemId,
        name: itemName(r.itemId),
        amount: amount(r),
      })),
    };
  });
}

export interface ClueRow {
  tier: string;
  name: string;
  steps: number;
  coins: { min: number; max: number };
  loot: { id: string; name: string; min: number; max: number }[];
  unique?: { id: string; name: string; chance: number };
}

export function clueRows(): ClueRow[] {
  return Object.values(clues)
    .map((c) => ({
      tier: c.tier,
      name: c.name,
      steps: c.steps,
      coins: c.coins,
      loot: c.loot.map((l) => ({ id: l.itemId, name: itemName(l.itemId), ...l })),
      unique: c.unique
        ? {
            id: c.unique.itemId,
            name: itemName(c.unique.itemId),
            chance: c.unique.chance,
          }
        : undefined,
    }))
    .sort((a, b) => a.steps - b.steps);
}

export interface SeedRow {
  id: string;
  name: string;
  levelReq: number;
  xp: number;
  minutes: number;
  produce: { id: string; name: string; min: number; max: number };
}

export function seedRows(): SeedRow[] {
  return Object.values(seeds)
    .map((s) => ({
      id: s.id,
      name: s.name,
      levelReq: s.levelReq,
      xp: s.xp,
      minutes: Math.round(s.growMs / 60000),
      produce: { id: s.produce.itemId, name: itemName(s.produce.itemId), ...s.produce },
    }))
    .sort((a, b) => a.levelReq - b.levelReq);
}

export interface ShopRow {
  id: string;
  name: string;
  price: number;
  type?: string;
}

export function shopRows(): ShopRow[] {
  return shop
    .map((s) => ({
      id: s.itemId,
      name: itemName(s.itemId),
      price: s.price,
      type: items[s.itemId]?.type,
    }))
    .sort((a, b) => a.price - b.price);
}

/** A compact index for client-side search. Kept small: it ships to the browser. */
export function searchIndex(): { i: string; n: string; t: string }[] {
  return connectedItems().map((x) => ({ i: x.id, n: x.name, t: x.type ?? "" }));
}
