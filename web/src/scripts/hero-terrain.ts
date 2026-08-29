/**
 * Generates the hero's isometric world in the browser, and then keeps it alive.
 *
 * This is a deliberate echo of how the game itself works — every mesh and
 * texture is produced at runtime from primitives and a seeded value noise, with
 * zero external assets. The landing page makes that claim, so it generates
 * rather than shipping a picture of generation.
 *
 * It is NOT a port of the game's generator and does not pretend to be: this
 * draws 2D isometric diamonds on a canvas, where the game builds a 3D scene.
 * What is shared is the approach and the palette.
 *
 * WHY IT MOVES NOW
 * The first version painted one frame and stopped. It was defensible — no
 * permanent animation loop, nothing running after load — and it was also a
 * still photograph of a world, which is a strange thing to put at the top of a
 * page selling a world you walk through. It read as a background texture rather
 * than as a place.
 *
 * So the terrain is now a living scene: sunlight travels across it, cloud
 * shadows drift over it, the water moves, the settlement's windows are lit and
 * flicker, and birds cross it. All of it is generated, none of it is a video.
 *
 * HOW IT STAYS CHEAP, which is the whole design
 * The terrain is painted ONCE into an offscreen canvas and blitted with a
 * single drawImage each frame. Only the moving parts are redrawn — a light
 * sweep, three cloud shadows, a bounded set of water tiles, a dozen window
 * glows and a few birds. That is roughly 150 draw calls a frame instead of the
 * ~1500 a full terrain repaint would cost, and it is what makes a
 * continuously-animated hero affordable on a mid-range phone rather than a
 * battery complaint.
 *
 * On top of that:
 *   - The loop stops entirely when the hero scrolls out of view, and when the
 *     tab is hidden. A hero animating to nobody is pure waste.
 *   - Frame cost is measured. If frames are consistently slow the moving
 *     detail is shed, worst first, rather than letting the whole page judder.
 *   - The pixel ratio is capped at 2. A 3x backing store on a phone is a lot of
 *     fill for a decorative layer.
 *
 * REDUCED MOTION IS A DESIGNED STATE
 * It used to bail out completely, leaving the authored gradient. That obeyed
 * the setting and threw away the artwork with it. Now the world is still
 * generated and painted in full — it simply does not move. Someone who has
 * asked for less motion gets the same composition, held still, which is what
 * the setting actually asks for. Save-Data is treated the same way: painting a
 * still frame costs no bytes and almost no battery, so it keeps the picture and
 * loses the loop.
 */

/** Deterministic PRNG (mulberry32). A fixed seed means the art-directed frame
 *  is the same for everyone, which is reviewable; Math.random is not. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise over a lattice, enough for readable terrain bands. */
function makeNoise(seed: number): (x: number, y: number) => number {
  const rand = rng(seed);
  const size = 64;
  const lattice = new Float32Array(size * size);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();

  const at = (x: number, y: number) =>
    lattice[(((y % size) + size) % size) * size + (((x % size) + size) % size)] as number;

  const smooth = (t: number) => t * t * (3 - 2 * t);

  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = smooth(x - xi);
    const ty = smooth(y - yi);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
}

function cssVar(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v.length > 0 ? v : fallback;
}

/**
 * Parses a CSS colour to rgb components by asking the canvas to do it.
 *
 * The tokens are hex today, but they are authored in a stylesheet and could
 * become any CSS colour at any time. Doing this by hand would mean a colour
 * function silently producing black; letting the 2D context resolve it means
 * whatever the browser accepts as a colour, this accepts too.
 */
function toRgb(ctx: CanvasRenderingContext2D, color: string): [number, number, number] {
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillStyle = color;
  const resolved = ctx.fillStyle as string;
  ctx.restore();

  if (resolved.startsWith("#")) {
    const hex = resolved.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }
  const m = /rgba?\(([^)]+)\)/.exec(resolved);
  if (m) {
    const parts = (m[1] as string)
      .split(/[,\s/]+/)
      .filter(Boolean)
      .map(Number);
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  }
  return [0, 0, 0];
}

interface Band {
  /** Upper bound of the noise value this terrain occupies. */
  limit: number;
  color: string;
  /** Extra height in tile units, so land reads above water. */
  lift: number;
}

interface Tile {
  x: number;
  y: number;
  color: string;
  lift: number;
  /** Painter depth, gx + gy. Also drives the entrance stagger. */
  depth: number;
  /** Index into `bands`. Water is 0; the settlement sits on the middle bands. */
  band: number;
  gx: number;
  gy: number;
}

/** A lit window in the settlement. */
interface Light {
  x: number;
  y: number;
  /** Phase offset so they do not all pulse together. */
  phase: number;
  size: number;
}

/** A house in the settlement, drawn into the static terrain. */
interface House {
  /** Centre of the tile it stands on. */
  x: number;
  y: number;
  scale: number;
  height: number;
  /**
   * Painter depth (gx + gy) of the tile it stands on.
   *
   * Nothing needed this while the settlement was scenery. It matters now that
   * people walk through it: depth is the only thing that says whether a house
   * is in front of a villager or behind them.
   */
  depth: number;
}

/**
 * Someone walking between two houses.
 *
 * Position is DERIVED FROM `time` and nothing is stored between frames. That is
 * not a style preference — every animated thing in this file is time-pure, and
 * three separate mechanisms depend on it: `settle()` renders the still frame by
 * calling the draw functions at time 0, the loop stops entirely when the hero
 * scrolls out of view or the tab hides and must resume without teleporting, and
 * `?world=` promises a reproducible world. An integrator satisfies none of them.
 */
interface Villager {
  /** Index into `routes`. */
  route: number;
  /** How many tile-steps the route is worth. The walk is quantised to these. */
  stations: number;
  /** Milliseconds of head start, so they are not all on one doorstep at t=0. */
  offset: number;
  scale: number;
  /** Cloak colour. Fixed hex for the same reason the house colours are: the
   *  design tokens are text-contrast colours and read wrong as pigment. */
  tint: string;
}

/** A chimney mouth. Puffs are derived from `time`, never stored. */
interface Smoke {
  x: number;
  y: number;
  /** Puffs per second, and a phase so no two plumes are synchronised. */
  rate: number;
  phase: number;
  scale: number;
}

/** A deer at the treeline. Shuffles along a short beat and grazes. */
interface Grazer {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  scale: number;
  period: number;
  phase: number;
}

/**
 * A footpath between two houses, as screen-space waypoints.
 *
 * WHY THIS IS NOT GRID COORDINATES, AND NOT A PROJECTION FUNCTION EITHER
 *
 * Every `Tile` already carries its final projected `x`/`y` INCLUDING its band
 * lift. So a waypoint is just a tile centre — the same expression the houses
 * are placed with — and no projection arithmetic has to escape `build()` or be
 * written a second time. The frame loop never projects anything.
 *
 * A route also stays on ONE terrain band. The bands lift by 0, 0.1, 0.35, 0.6
 * and 0.95 tile units, so a path crossing a boundary would step vertically by
 * several pixels and the walker would float or sink. One band makes the surface
 * flat by construction, which is also what makes straight-line interpolation
 * between waypoints exactly correct rather than approximately.
 */
interface Route {
  /** Screen-space waypoints: two for a straight run, three for a dog-leg. */
  px: number[];
  py: number[];
  /** Painter depth at each waypoint, so a walker's depth can be interpolated
   *  for occlusion without any inverse projection. */
  pd: number[];
  /** Cumulative screen distance; the last entry is the total length. */
  cum: number[];
}

interface Bird {
  /** Start position and velocity in screen space, px and px/second. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  scale: number;
  phase: number;
}

/**
 * A2 — one world per visitor, reproducible on request.
 *
 * The generator was seeded with three hardcoded constants (20260827 for the
 * terrain noise, 4242 for the settlement, 99 for the birds) and a comment
 * explaining that a fixed seed is reviewable where Math.random is not. That
 * reasoning still holds — it is why this returns a NUMBER that gets written to
 * the page and accepted back through the URL, rather than calling Math.random
 * and forgetting what it rolled.
 *
 * `?world=` wins when present, which is what makes a world shareable, a press
 * screenshot repeatable, and a check pinnable. Anything unparseable falls back
 * to the original constant, so a mangled link shows the art-directed world
 * rather than an error.
 */
const DEFAULT_WORLD = 20260827;

/**
 * The engine's tick, in milliseconds, and the reason the villagers step.
 *
 * Restated here rather than imported: `gamedata.ts` owns the real constant but
 * reads JSON off disk, so it is a build-time module and this one runs in the
 * browser. `--dur-tick` in tokens.css carries the same number for CSS.
 *
 * The villagers move on THIS, one tile at a time, with a pause before the next
 * step. That is the whole idea of the phase. A settlement whose people drift
 * smoothly across it is a screensaver; people who step on a visible cadence are
 * a simulation running, and the cadence is the game's own.
 */
const TICK_MS = 600;

function resolveWorld(): number {
  let raw: string | null = null;
  try {
    raw = new URL(window.location.href).searchParams.get("world");
  } catch {
    /* An exotic or opaque location. Fall through to a fresh world. */
  }

  if (raw) {
    // Base 36 keeps the shared link short and case-insensitive.
    //
    // THE RANGE CHECK IS THE POINT, AND IT USED TO BE `parsed >>> 0`.
    //
    // A world is a 32-bit seed, and `>>> 0` on an out-of-range parse does not
    // reject it — it silently keeps the low 32 bits. So `?world=isoperia`
    // parsed to 2.4e12, truncated to 993,363,834, and the page then labelled
    // itself `#1w4vzya`. Copying that link back produced a DIFFERENT world from
    // the one just visited, which breaks the two things the seed exists for: a
    // shareable link and a repeatable press screenshot.
    //
    // The bound is NUMERIC, not a length, and that distinction matters: the
    // largest 32-bit seed is `1z141z3`, which is SEVEN characters, and the site
    // generates seven-character labels routinely — `#1wa8r07` came out of a
    // normal page load while this was being reviewed. An earlier draft of this
    // comment claimed six was the maximum, which would have invited someone to
    // "simplify" the check into `raw.length <= 6` and reject most of the worlds
    // the page hands out. Anything genuinely out of range falls back to the
    // art-directed world rather than to a world nobody can link to.
    const parsed = Number.parseInt(raw, 36);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 0xffffffff) return parsed;
    return DEFAULT_WORLD;
  }

  // A fresh world per visit. crypto is used where available because a
  // Date.now()-derived seed gives near-identical worlds to everyone who arrives
  // in the same second, which defeats the point.
  try {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    if (buf[0]) return buf[0] >>> 0;
  } catch {
    /* No crypto. The fallback below is still a different world per load. */
  }
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0 || DEFAULT_WORLD;
}

/** The shareable form: short, lowercase, URL-safe. */
export function worldLabel(seed: number): string {
  return seed.toString(36);
}

export function paintTerrain(
  canvas: HTMLCanvasElement,
  lifeCanvas: HTMLCanvasElement,
): number | null {
  const ctx = canvas.getContext("2d");
  const lifeCtx = lifeCanvas.getContext("2d");
  // null, not a seed: nothing was painted, so there is no world to name.
  if (!ctx || !lifeCtx) return null;

  const root = document.documentElement;
  const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };

  /** Whether the scene may move. Re-read rather than cached: someone can change
   *  the setting while the page is open, and the honest response is to stop. */
  const mayAnimate = (): boolean =>
    !reducedQuery.matches && nav.connection?.saveData !== true;

  /** This visitor's world. Resolved once: a resize must rebuild the SAME one. */
  const world = resolveWorld();

  let tiles: Tile[] = [];
  let waterTiles: Tile[] = [];
  let lights: Light[] = [];
  let houses: House[] = [];
  let birds: Bird[] = [];
  let routes: Route[] = [];
  let villagers: Villager[] = [];
  let smoke: Smoke[] = [];
  let grazer: Grazer | null = null;
  let puff: HTMLCanvasElement | null = null;
  let tileW = 0;
  let tileH = 0;
  let liftUnit = 0;
  let cssW = 0;
  let cssH = 0;
  let dpr = 1;

  /** Colours resolved once per build, so the frame loop never touches CSSOM. */
  let waterRgb: [number, number, number] = [63, 168, 154];
  let warmRgb: [number, number, number] = [255, 212, 121];

  /**
   * The life layer renders at device-pixel-ratio 1 regardless of the screen.
   *
   * It carries water highlights, window glows and birds — soft, low-frequency
   * shapes with no edges anyone can focus on and no text. Rendering them at 2x
   * quadruples the pixels for a difference nobody can see, and pixel count is
   * the entire cost of this layer. The terrain underneath keeps the full ratio,
   * so the crisp thing stays crisp.
   */
  const LIFE_DPR = 1;

  // -------------------------------------------------------------------------
  // Terrain
  // -------------------------------------------------------------------------
  const paintTile = (
    target: CanvasRenderingContext2D,
    t: Tile,
    progress: number,
    yOffset = 0,
  ): void => {
    // progress 0..1 — the tile falls into place from above and fades in.
    const rise = (1 - progress) * tileH * 3;
    const x = t.x;
    const y = t.y + rise + yOffset;

    target.globalAlpha = progress;

    target.fillStyle = t.color;
    target.beginPath();
    target.moveTo(x, y);
    target.lineTo(x + tileW / 2, y + tileH / 2);
    target.lineTo(x, y + tileH);
    target.lineTo(x - tileW / 2, y + tileH / 2);
    target.closePath();
    target.fill();

    if (t.lift > 0) {
      const side = t.lift * liftUnit + tileH * 0.35;

      target.fillStyle = "rgba(0,0,0,0.22)";
      target.beginPath();
      target.moveTo(x - tileW / 2, y + tileH / 2);
      target.lineTo(x, y + tileH);
      target.lineTo(x, y + tileH + side);
      target.lineTo(x - tileW / 2, y + tileH / 2 + side);
      target.closePath();
      target.fill();

      target.fillStyle = "rgba(0,0,0,0.34)";
      target.beginPath();
      target.moveTo(x + tileW / 2, y + tileH / 2);
      target.lineTo(x, y + tileH);
      target.lineTo(x, y + tileH + side);
      target.lineTo(x + tileW / 2, y + tileH / 2 + side);
      target.closePath();
      target.fill();
    }

    target.globalAlpha = 1;
  };

  /**
   * One house: an isometric box with a roof, in the same projection as the
   * terrain under it.
   *
   * Colours are fixed rather than tokenised, unlike everything else here. The
   * tokens are surface and text colours audited for text contrast; a roof is
   * neither, and borrowing one produced a building the same value as the grass
   * it stood on. These are chosen to read as timber and thatch against every
   * terrain band in both themes.
   */
  /**
   * Where a house's chimney is, in screen space.
   *
   * Shared by `paintHouse`, which draws it, and `build()`, which hangs a smoke
   * plume off its mouth. Two copies of this arithmetic would drift apart and
   * put smoke beside a chimney instead of above it.
   */
  const chimneyOf = (
    h: House,
  ): { cx: number; cy: number; cw: number; ch: number; mouthY: number } => {
    const hw = tileW * 0.34 * h.scale;
    const hh = tileH * 0.34 * h.scale;
    const topY = h.y - hh - h.height;
    const ew = hw * 1.28;
    const eh = hh * 1.28;
    const eaveY = topY + hh * 0.2;
    const apexY = eaveY - eh - h.height * 1.15;
    // Partway down the lit south-east roof face, so the stack reads as sitting
    // ON the roof rather than balanced on its ridge.
    const cx = h.x + ew * 0.4;
    const cy = apexY + (eaveY - apexY) * 0.4;
    // Squat and wide: a cottage stack. The first pass used 0.2 and 1.5, which
    // at hero scale drew a 29px x 5px spire — a mill chimney on a cottage,
    // clearly wrong once looked at rather than measured.
    const cw = hw * 0.26;
    const ch = hh * 0.85 + h.height * 0.25;
    return { cx, cy, cw, ch, mouthY: cy - ch };
  };

  const paintHouse = (target: CanvasRenderingContext2D, h: House): void => {
    const hw = tileW * 0.34 * h.scale;
    const hh = tileH * 0.34 * h.scale;
    const { x, y } = h;

    // The box. Its base diamond is centred at (x, y - hh) with its south vertex
    // at (x, y), so the building stands ON the tile rather than floating over
    // its top corner. `topY` is the centre of the top face.
    const topY = y - hh - h.height;

    const tri = (
      color: string,
      ax: number,
      ay: number,
      bx: number,
      by: number,
      cx2: number,
      cy2: number,
    ): void => {
      target.fillStyle = color;
      target.beginPath();
      target.moveTo(ax, ay);
      target.lineTo(bx, by);
      target.lineTo(cx2, cy2);
      target.closePath();
      target.fill();
    };

    // Left wall — the shaded side, matching the tile sides' own lighting.
    target.fillStyle = "#4A3B2E";
    target.beginPath();
    target.moveTo(x - hw, y - hh);
    target.lineTo(x, y);
    target.lineTo(x, topY + hh);
    target.lineTo(x - hw, topY);
    target.closePath();
    target.fill();

    // Right wall — the lit side.
    target.fillStyle = "#6B563F";
    target.beginPath();
    target.moveTo(x + hw, y - hh);
    target.lineTo(x, y);
    target.lineTo(x, topY + hh);
    target.lineTo(x + hw, topY);
    target.closePath();
    target.fill();

    // A hipped roof: four triangles meeting at an apex above the top face,
    // sitting on eaves that oversail the walls.
    //
    // The first attempt drew two quads between the top face and a raised ridge
    // line, which is not a roof — it produced a thin detached chevron floating
    // above the box, clearly visible at hero size. A roof is a solid that meets
    // its walls, so it is built from the four faces it actually has.
    const ew = hw * 1.28; // eaves overhang
    const eh = hh * 1.28;
    const eaveY = topY + hh * 0.2; // centre of the eave diamond
    // A deep roof relative to a low wall: the silhouette of a cottage rather
    // than of a tower. An earlier pass had tall walls under a shallow roof and
    // the settlement read as a row of chess pieces.
    const apexY = eaveY - eh - h.height * 1.15;

    // North face first, then the two visible southern ones, so the front
    // overlaps the back exactly as the geometry says it should.
    tri("#733E29", x, apexY, x, eaveY - eh, x - ew, eaveY);
    tri("#733E29", x, apexY, x, eaveY - eh, x + ew, eaveY);
    tri("#8A4B32", x, apexY, x - ew, eaveY, x, eaveY + eh);
    tri("#A65C3C", x, apexY, x + ew, eaveY, x, eaveY + eh);

    // The chimney. Two faces, in the same vocabulary as the walls above.
    //
    // It is drawn HERE, into the static terrain bitmap, and therefore costs
    // nothing per frame — 22 extra fills once per build. Drawing it from the
    // loop instead would repaint the terrain canvas, which is the one thing
    // verify-hero.cjs asserts never happens.
    const c = chimneyOf(h);
    target.fillStyle = "#4A3B2E";
    target.beginPath();
    target.moveTo(c.cx - c.cw, c.cy - c.cw * 0.5);
    target.lineTo(c.cx, c.cy);
    target.lineTo(c.cx, c.cy - c.ch);
    target.lineTo(c.cx - c.cw, c.cy - c.cw * 0.5 - c.ch);
    target.closePath();
    target.fill();
    target.fillStyle = "#63503B";
    target.beginPath();
    target.moveTo(c.cx + c.cw, c.cy - c.cw * 0.5);
    target.lineTo(c.cx, c.cy);
    target.lineTo(c.cx, c.cy - c.ch);
    target.lineTo(c.cx + c.cw, c.cy - c.cw * 0.5 - c.ch);
    target.closePath();
    target.fill();
    // The cap. Without it the two faces meet in a notch and the stack reads as
    // a pair of horns rather than as a chimney — visible at hero size.
    target.fillStyle = "#7A6449";
    target.beginPath();
    target.moveTo(c.cx, c.mouthY - c.cw * 0.5);
    target.lineTo(c.cx + c.cw, c.mouthY - c.cw * 0.5 + c.cw * 0.5);
    target.lineTo(c.cx, c.mouthY - c.cw * 0.5 + c.cw);
    target.lineTo(c.cx - c.cw, c.mouthY - c.cw * 0.5 + c.cw * 0.5);
    target.closePath();
    target.fill();
  };

  /**
   * Paints the terrain onto its own canvas.
   *
   * Called once per build and never per frame. The terrain canvas is never
   * cleared during the animation loop — that is the point of it being separate.
   */
  const paintTerrainLayer = (): void => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    for (const t of tiles) paintTile(ctx, t, 1);
    // After the terrain, so the town sits on the land rather than under it.
    for (const h of houses) paintHouse(ctx, h);
  };

  /**
   * Builds the scene: terrain, and the moving things that sit on it.
   *
   * Everything positional is computed here and never in the frame loop, so a
   * frame is arithmetic and draw calls rather than noise sampling.
   */
  const build = (): void => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = canvas.clientWidth;
    cssH = canvas.clientHeight;
    if (cssW === 0 || cssH === 0) return;

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    lifeCanvas.width = Math.round(cssW * LIFE_DPR);
    lifeCanvas.height = Math.round(cssH * LIFE_DPR);
    lifeCtx.setTransform(LIFE_DPR, 0, 0, LIFE_DPR, 0, 0);
    lifeCtx.clearRect(0, 0, cssW, cssH);

    // Palette from the live tokens, so this follows the theme and inherits the
    // audited colours instead of duplicating them.
    const bands: Band[] = [
      { limit: 0.34, color: cssVar(root, "--mark-miregate", "#3FA89A"), lift: 0 },
      { limit: 0.42, color: cssVar(root, "--mark-gold", "#FFD479"), lift: 0.1 },
      { limit: 0.68, color: cssVar(root, "--mark-wildwood", "#4F9D5A"), lift: 0.35 },
      { limit: 0.82, color: cssVar(root, "--success", "#2E612B"), lift: 0.6 },
      { limit: 1.01, color: cssVar(root, "--mark-rock", "#5C5E61"), lift: 0.95 },
    ];

    waterRgb = toRgb(ctx, bands[0]!.color);
    warmRgb = toRgb(ctx, cssVar(root, "--mark-gold", "#FFD479"));

    // Tile size scales with the viewport so the composition holds from 360px to
    // ultrawide, rather than becoming a mosaic on one and four tiles on another.
    tileW = Math.max(38, Math.min(84, cssW / 16));
    tileH = tileW / 2;
    liftUnit = tileH * 0.9;

    // Anchored right-of-centre: the scrim keeps the left readable for the
    // headline, so the terrain's interest belongs on the right.
    const originX = cssW * 0.62;
    const originY = -tileH * 6;

    // Which grid coordinates cover the viewport.
    //
    // Iterating a rectangle of grid coordinates is the obvious approach and it
    // is wrong: the isometric projection maps a grid rectangle to a screen
    // DIAMOND, so the screen's corners are never drawn and the hero ends up
    // with a band of terrain and two empty triangles. Instead, project each
    // screen corner back into grid space and iterate that bounding box.
    //
    //   sx = originX + (gx - gy) * tileW/2   ->  u = gx - gy
    //   sy = originY + (gx + gy) * tileH/2   ->  v = gx + gy
    const toGrid = (sx: number, sy: number): { gx: number; gy: number } => {
      const u = (sx - originX) / (tileW / 2);
      const v = (sy - originY) / (tileH / 2);
      return { gx: (u + v) / 2, gy: (v - u) / 2 };
    };

    const corners = [toGrid(0, 0), toGrid(cssW, 0), toGrid(0, cssH), toGrid(cssW, cssH)];

    // Pad generously: tiles are lifted upward by up to one `lift`, so a tile
    // whose base is below the viewport can still have a visible top face.
    const PAD_TILES = 8;
    const gxMin = Math.floor(Math.min(...corners.map((c) => c.gx))) - PAD_TILES;
    const gxMax = Math.ceil(Math.max(...corners.map((c) => c.gx))) + PAD_TILES;
    const gyMin = Math.floor(Math.min(...corners.map((c) => c.gy))) - PAD_TILES;
    const gyMax = Math.ceil(Math.max(...corners.map((c) => c.gy))) + PAD_TILES;

    const noise = makeNoise(world);
    const collected: Tile[] = [];

    for (let gy = gyMin; gy <= gyMax; gy++) {
      for (let gx = gxMin; gx <= gxMax; gx++) {
        const n = noise(gx * 0.16 + 8, gy * 0.16 + 8);
        let bandIndex = bands.findIndex((b) => n < b.limit);
        if (bandIndex < 0) bandIndex = bands.length - 1;
        const band = bands[bandIndex] as Band;

        const x = originX + (gx - gy) * (tileW / 2);
        const y = originY + (gx + gy) * (tileH / 2) - band.lift * liftUnit;

        // Cheap cull. Without it a wide viewport builds thousands of invisible
        // tiles and the cost shows up in LCP.
        if (x < -tileW * 2 || x > cssW + tileW * 2) continue;
        if (y < -tileH * 4 || y > cssH + tileH * 6) continue;

        collected.push({
          x,
          y,
          color: band.color,
          lift: band.lift,
          depth: gx + gy,
          band: bandIndex,
          gx,
          gy,
        });
      }
    }

    // Painter's order: back to front, so nearer tiles overlap correctly.
    collected.sort((a, b) => a.depth - b.depth);
    tiles = collected;

    // A grid lookup, built once.
    //
    // This is the piece that did not exist, and everything walkable depends on
    // it. There is no adjacency data anywhere in the generator — a tile knows
    // its own band and nothing about its neighbours — so asking "is the tile
    // next door walkable?" meant a linear scan.
    //
    // It MUST be a map. The same question asked with `tiles.find(...)` inside a
    // `tiles.filter(...)` is quadratic: on a wide viewport that is millions of
    // comparisons in one synchronous pass, which is this file's original
    // failure mode moved out of the frame loop and into the build, where it
    // lands on LCP instead. gx/gy are small signed integers here, so a shifted
    // integer key costs less than a string one.
    const KEY = (gx: number, gy: number): number => ((gx + 4096) << 13) | (gy + 4096);
    const tileAt = new Map<number, Tile>();
    for (const t of collected) tileAt.set(KEY(t.gx, t.gy), t);

    // --- the moving cast -----------------------------------------------------

    // Water that is actually on screen, nearest the centre of interest first.
    // Bounded hard: a 4K viewport must not animate two thousand diamonds.
    const focusX = cssW * 0.62;
    const focusY = cssH * 0.5;
    waterTiles = tiles
      .filter(
        (t) =>
          t.band === 0 &&
          t.x > -tileW &&
          t.x < cssW + tileW &&
          t.y > -tileH * 2 &&
          t.y < cssH + tileH * 2,
      )
      .sort(
        (a, b) =>
          (a.x - focusX) ** 2 +
          (a.y - focusY) ** 2 -
          ((b.x - focusX) ** 2 + (b.y - focusY) ** 2),
      )
      .slice(0, 160);

    // The settlement.
    //
    // The first version placed lit windows on the terrain with nothing under
    // them, and a dozen warm dots floating on a green hillside reads as
    // fireflies, not as a town. So the town is built: each light gets a house,
    // the houses go into the static terrain bitmap, and the light is placed on
    // the house's wall where a window would be.
    //
    // Clustered on high ground right of centre, which is where the composition
    // already puts its interest — the scrim keeps the left readable.
    const lightRand = rng(world ^ 0x9e3779b9);
    const candidates = tiles.filter(
      (t) =>
        (t.band === 2 || t.band === 3) &&
        t.x > cssW * 0.42 &&
        t.x < cssW + tileW &&
        t.y > cssH * 0.1 &&
        t.y < cssH * 0.9,
    );
    lights = [];
    houses = [];
    // Hoisted out of the branch below: the walkable routes and the treeline
    // both need to know where the settlement ended up.
    let anchor: Tile | null = null;
    let chosen: Tile[] = [];
    if (candidates.length > 0) {
      const at = candidates[Math.floor(lightRand() * candidates.length)] as Tile;
      anchor = at;
      // A tight cluster. Wider than about four tiles and it stops being one
      // settlement and becomes buildings dotted across a valley.
      const near = candidates.filter(
        (t) => Math.abs(t.gx - at.gx) <= 4 && Math.abs(t.gy - at.gy) <= 4,
      );
      const pool = near.length >= 5 ? near : candidates;

      // Painter's order again: a house behind must be drawn before the house in
      // front of it, or the roofs stack wrongly.
      chosen = pool
        .filter((_t, i) => i % Math.max(1, Math.floor(pool.length / 11)) === 0)
        .slice(0, 11)
        .sort((a, b) => a.depth - b.depth);

      for (const t of chosen) {
        const scale = 0.82 + lightRand() * 0.36;
        const cx = t.x;
        const cy = t.y + tileH / 2;
        const height = tileH * 0.5 * scale;
        houses.push({ x: cx, y: cy, scale, height, depth: t.depth });
        lights.push({
          // On the right-hand wall, two thirds up: where a window goes.
          x: cx + tileW * 0.17 * scale,
          y: cy - tileH * 0.34 * scale - height * 0.4,
          phase: lightRand() * Math.PI * 2,
          size: tileW * 0.1 * scale,
        });
      }
    }

    // --- the footpaths, and the people on them -------------------------------
    //
    // The settlement now has people in it, and this is where they get somewhere
    // to walk. No road data is invented: a route runs from one house's frontage
    // to its neighbour's, which is what a path between neighbours is.

    routes = [];
    villagers = [];
    smoke = [];
    grazer = null;

    /** A route from tile centres — the same expression the houses use. */
    const makeRoute = (pts: Tile[]): Route => {
      const px = pts.map((t) => t.x);
      const py = pts.map((t) => t.y + tileH / 2);
      const pd = pts.map((t) => t.depth);
      const cum = [0];
      for (let i = 1; i < px.length; i++) {
        cum.push(
          (cum[i - 1] as number) +
            Math.hypot(
              (px[i] as number) - (px[i - 1] as number),
              (py[i] as number) - (py[i - 1] as number),
            ),
        );
      }
      return { px, py, pd, cum };
    };

    if (chosen.length >= 2) {
      const found: Route[] = [];

      /*
       * Routes are searched PER BAND, and this is not an optimisation.
       *
       * The settlement is allowed to straddle two terrain bands (the candidate
       * filter takes band 2 and band 3), and the bands sit at different lifts —
       * 0.35 and 0.6 tile units. A path crossing between them would step
       * vertically by several pixels and the walker would visibly float. So a
       * route stays on one band, which also makes straight-line interpolation
       * between its waypoints exactly right instead of approximately.
       *
       * The first version of this pinned the band to the anchor's and searched
       * only CONSECUTIVE houses in depth order. That found nothing in four of
       * twelve viewport-and-seed combinations tested — every house on the other
       * band was unreachable by construction, and depth order is not spatial
       * order, so "consecutive" houses were often opposite corners of the
       * cluster. Measured, not guessed.
       */
      const bandsPresent = Array.from(new Set(chosen.map((t) => t.band)));
      const occupied = new Set(chosen.map((t) => KEY(t.gx, t.gy)));
      /** Fallbacks: paths that lead out of the village rather than across it. */
      const strolls: Route[] = [];

      for (const walkBand of bandsPresent) {
        const walkable = (gx: number, gy: number): Tile | null => {
          const t = tileAt.get(KEY(gx, gy));
          if (!t || t.band !== walkBand) return null;
          if (occupied.has(KEY(gx, gy))) return null;
          return t;
        };

        // Screen y grows with gx + gy, so (gx+1, gy+1) is directly below on
        // screen — the ground in front of the door. The rest are shoulders and
        // the back, tried in order of how much they read as a doorstep.
        const frontage = (t: Tile): Tile | null =>
          walkable(t.gx + 1, t.gy + 1) ??
          walkable(t.gx + 1, t.gy) ??
          walkable(t.gx, t.gy + 1) ??
          walkable(t.gx + 2, t.gy + 1) ??
          walkable(t.gx + 1, t.gy + 2) ??
          walkable(t.gx - 1, t.gy) ??
          walkable(t.gx, t.gy - 1);

        const clear = (a: Tile, b: Tile): boolean => {
          const steps = Math.max(Math.abs(b.gx - a.gx), Math.abs(b.gy - a.gy));
          // Adjacent doorsteps are not a walk. The far bound keeps the search
          // cheap and keeps a "path" from spanning the whole viewport.
          if (steps < 2 || steps > 12) return false;
          for (let i = 1; i < steps; i++) {
            const gx = Math.round(a.gx + ((b.gx - a.gx) * i) / steps);
            const gy = Math.round(a.gy + ((b.gy - a.gy) * i) / steps);
            if (!walkable(gx, gy)) return false;
          }
          return true;
        };

        const doors = chosen
          .filter((t) => t.band === walkBand)
          .map(frontage)
          .filter((t): t is Tile => t !== null);

        // Every pair, not just neighbours in a list. Eleven houses is at most
        // 55 pairs of a twelve-step walk — a few hundred map lookups, once.
        for (let a = 0; a < doors.length; a++) {
          for (let b = a + 1; b < doors.length; b++) {
            const p = doors[a] as Tile;
            const q = doors[b] as Tile;
            if (clear(p, q)) {
              found.push(makeRoute([p, q]));
            } else {
              // One dog-leg attempt via the corner. An L through the village
              // reads as a path around someone's garden, which is what it is.
              const c = walkable(q.gx, p.gy) ?? walkable(p.gx, q.gy);
              if (c && clear(p, c) && clear(c, q)) found.push(makeRoute([p, c, q]));
            }
          }
        }

        /*
         * A village can be genuinely hemmed in. At 360px, one seed in the
         * sample produced nine houses packed so tightly that no two doorsteps
         * had a clear line between them — every path blocked by another house
         * or by the forest.
         *
         * Rather than let that visitor get the old empty landscape, someone
         * walks OUT of the village instead of across it: from a doorstep, the
         * longest clear run in any one direction. It is still a real path over
         * real walkable ground; it just leads somewhere off-screen, which is
         * what a track out of a hamlet does.
         */
        for (const d of doors) {
          let best: Tile | null = null;
          for (const [dx, dy] of [
            [1, 1],
            [1, 0],
            [0, 1],
            [1, -1],
            [-1, -1],
            [-1, 0],
            [0, -1],
          ] as [number, number][]) {
            for (let k = 6; k >= 2; k--) {
              const t = walkable(d.gx + dx * k, d.gy + dy * k);
              if (t && clear(d, t)) {
                if (!best || k > Math.abs(best.gx - d.gx) + Math.abs(best.gy - d.gy))
                  best = t;
                break;
              }
            }
          }
          if (best) strolls.push(makeRoute([d, best]));
        }
      }

      // Only when there is nothing better. A path between two homes is a
      // village going about its business; a path out of one is a consolation.
      if (found.length === 0) found.push(...strolls);

      // A path off the edge of the canvas is work nobody sees. The stroll
      // fallback in particular can head straight out of frame — measured at
      // 360px, one seed put its walker at x=359 on a 360px canvas.
      const visible = (r: Route): boolean =>
        r.px.every((x, i) => {
          const y = r.py[i] as number;
          return x > tileW * 0.5 && x < cssW - tileW * 0.5 && y > 0 && y < cssH;
        });
      const onScreen = found.filter(visible);
      if (onScreen.length > 0) {
        found.length = 0;
        found.push(...onScreen);
      }

      // Prefer streets that run in FRONT of every house: a walker there can
      // never be behind a roof, so the occlusion problem does not arise for
      // them at all. Longer routes next, because a longer walk is a better one.
      const maxHouseDepth = houses.reduce((m, h) => Math.max(m, h.depth), -Infinity);
      found.sort((a, b) => {
        const af = Math.min(...a.pd) > maxHouseDepth ? 1 : 0;
        const bf = Math.min(...b.pd) > maxHouseDepth ? 1 : 0;
        if (af !== bf) return bf - af;
        return (b.cum[b.cum.length - 1] as number) - (a.cum[a.cum.length - 1] as number);
      });
      routes = found.slice(0, 3);

      const folk = rng(world ^ 0xc2b2ae35);
      const TINTS = ["#3C4C6B", "#6B3C42", "#4B5A3C", "#5A4468"];
      const n = Math.min(4, routes.length * 2);
      for (let i = 0; i < n; i++) {
        const r = routes[i % routes.length] as Route;
        const len = r.cum[r.cum.length - 1] as number;
        // Roughly one tile per step, and never fewer than two stations or the
        // walk has nowhere to go.
        const stations = Math.max(2, Math.round(len / (tileW * 0.55)) + 1);
        villagers.push({
          route: i % routes.length,
          stations,
          // A seeded head start, in WHOLE TICKS.
          //
          // Whole ticks matter twice. Aesthetically, the settlement then steps
          // together on one beat — everyone moves, everyone pauses — which is
          // what a tick-based engine looks like from outside and is far more
          // striking than four people ambling out of phase. And it is what
          // makes the cadence measurable at all: with fractional offsets the
          // pauses smear across each other and the walk is indistinguishable
          // from a drift, which is exactly how a negative control that should
          // have failed slipped through.
          //
          // The head start still varies, so the still frame is a composed
          // moment rather than four people on one doorstep.
          offset: Math.floor(folk() * stations * 2) * TICK_MS,
          scale: 0.85 + folk() * 0.3,
          tint: TINTS[Math.floor(folk() * TINTS.length)] as string,
        });
      }
    }

    // Chimney smoke, on the nearest and largest houses only. Eleven plumes is
    // a factory; three is a village at supper.
    const plumeRand = rng(world ^ 0x27d4eb2f);
    smoke = houses
      .filter((h) => h.scale > 0.9)
      .sort((a, b) => b.depth - a.depth)
      .slice(0, 3)
      .map((h) => {
        const c = chimneyOf(h);
        return {
          x: c.cx,
          y: c.mouthY,
          rate: 0.45 + plumeRand() * 0.25,
          phase: plumeRand(),
          scale: h.scale,
        };
      });

    // One deer at the treeline.
    //
    // It stands on grass with forest BEHIND it, not in the forest: a small tan
    // shape on dark green is invisible, and an animal you cannot see is three
    // draw calls spent on nothing. `tileAt.get` here is O(1) — a `tiles.find`
    // inside this filter would be the quadratic pass warned about above.
    // Captured into a const: `anchor` is a `let`, so its narrowing does not
    // survive into a callback.
    const hub = anchor;
    const edge = tiles.filter(
      (t) =>
        t.band === 2 &&
        (tileAt.get(KEY(t.gx - 1, t.gy))?.band === 3 ||
          tileAt.get(KEY(t.gx, t.gy - 1))?.band === 3) &&
        t.x > tileW &&
        t.x < cssW - tileW &&
        t.y > cssH * 0.15 &&
        t.y < cssH * 0.85 &&
        (!hub || Math.abs(t.gx - hub.gx) + Math.abs(t.gy - hub.gy) > 7),
    );
    if (edge.length > 0) {
      const deerRand = rng(world ^ 0x165667b1);
      const home = edge[Math.floor(deerRand() * edge.length)] as Tile;
      const away = tileAt.get(KEY(home.gx + 1, home.gy)) ?? home;
      grazer = {
        x0: home.x,
        y0: home.y + tileH / 2,
        x1: away.x,
        y1: away.y + tileH / 2,
        scale: 0.9 + deerRand() * 0.3,
        // A long beat with a long dwell at each end. A short one is a
        // metronome; an animal mostly stands still and occasionally moves.
        period: 14000 + deerRand() * 8000,
        phase: deerRand(),
      };
    }

    // The smoke puff, drawn once into a detached canvas and blitted thereafter.
    //
    // NOT a radial gradient per puff per frame. `createRadialGradient` in the
    // frame loop is this file's named sin — the comment on the loop records
    // Lighthouse attributing 6.9 seconds of main-thread time to exactly that.
    // This canvas is never appended to the document, so it costs no layout and
    // cannot contribute to CLS.
    if (!puff) {
      const c = document.createElement("canvas");
      c.width = 32;
      c.height = 32;
      const g = c.getContext("2d");
      if (g) {
        const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
        rg.addColorStop(0, "rgba(228,226,220,0.85)");
        rg.addColorStop(0.55, "rgba(216,214,208,0.4)");
        rg.addColorStop(1, "rgba(210,208,202,0)");
        g.fillStyle = rg;
        g.fillRect(0, 0, 32, 32);
        puff = c;
      }
    }

    // Birds. Four is enough to read as life and few enough to cost nothing.
    const birdRand = rng(world ^ 0x85ebca6b);
    birds = Array.from({ length: 4 }, () => ({
      x: birdRand() * cssW,
      y: cssH * (0.08 + birdRand() * 0.35),
      vx: 14 + birdRand() * 18,
      vy: (birdRand() - 0.5) * 3,
      scale: 0.7 + birdRand() * 0.6,
      phase: birdRand() * Math.PI * 2,
    }));

    paintTerrainLayer();
    canvas.setAttribute("data-painted", "");
  };

  // -------------------------------------------------------------------------
  // The animated layers
  // -------------------------------------------------------------------------

  /**
   * Detail level, shed under load.
   *   3 — everything: full water, birds, the deer, four villagers, three plumes
   *   2 — no birds, no deer. Full water, four villagers, two plumes
   *   1 — reduced water, two villagers. No smoke
   *   0 — reduced water, the window lights, and still two villagers
   *
   * The old version of this comment said level 0 was "light sweep and cloud
   * shadows only", which had been false since those were deleted — level 0 has
   * drawn water and lights for a long time. Fixed here rather than left.
   *
   * VILLAGERS ARE NEVER SHED, AND THAT IS DELIBERATE. Everything else drops,
   * smallest-and-furthest first. If the subject of the scene went with it, a
   * device in trouble would fall back to exactly the lifeless hero this phase
   * exists to replace — and a device in trouble is precisely what Lighthouse
   * mobile emulates, so the work would be invisible in the one place it is
   * graded. Two walkers still read as a settlement.
   *
   * They can afford to stay. Level 0 is reached on a 2560-wide viewport in a
   * CPU-constrained environment (measured, and the code BEFORE this phase sheds
   * to 0 there too — it is not a regression introduced here). At that size the
   * per-frame cost is dominated by clearing a 2560x918 canvas, some 2.35M
   * pixels; two villagers are twelve small fills against it, which is noise.
   */
  let detail = 3;

  /*
   * THE SUN SWEEP AND CLOUD SHADOWS USED TO BE DRAWN HERE, AND ARE NOT ANY MORE.
   *
   * They were two full-canvas fills per frame under `screen` and `multiply`
   * compositing — per-pixel blend passes over the whole hero, thirty times a
   * second. Profiled on a 390x844 viewport at device-pixel-ratio 2 with 4x CPU
   * throttling, the loop was consuming 2825ms of every 3000ms: a 62ms long task
   * per frame, 94% of the main thread, for a decorative background.
   *
   * The hero already had drifting cloud shadows and a warm sun wash in CSS
   * (.hero__sky and .hero__wash), which the compositor animates off the main
   * thread for nothing. The canvas versions were a second implementation of the
   * same idea, paid for in the most expensive way available. They are gone; the
   * CSS ones remain and are what you see.
   */

  /**
   * Water. Each tile's top face gets a travelling highlight whose phase depends
   * on its grid position, so the light moves ACROSS the water as a wave rather
   * than every tile blinking in unison.
   */
  const drawWater = (time: number): void => {
    const limit = detail >= 2 ? waterTiles.length : Math.min(60, waterTiles.length);
    lifeCtx.globalCompositeOperation = "screen";
    for (let i = 0; i < limit; i++) {
      const t = waterTiles[i] as Tile;
      const wave = Math.sin(time / 1400 + (t.gx - t.gy) * 0.55 + t.gy * 0.18);
      const a = 0.05 + Math.max(0, wave) * 0.16;
      // A slight vertical bob, well under a pixel of visual drift at small
      // sizes, which is what stops the surface looking like a printed pattern.
      const bob = Math.sin(time / 1100 + t.gx * 0.4) * tileH * 0.045;

      lifeCtx.globalAlpha = a;
      lifeCtx.fillStyle = `rgb(${Math.min(255, waterRgb[0] + 70)},${Math.min(
        255,
        waterRgb[1] + 70,
      )},${Math.min(255, waterRgb[2] + 60)})`;
      const x = t.x;
      const y = t.y + bob;
      lifeCtx.beginPath();
      lifeCtx.moveTo(x, y);
      lifeCtx.lineTo(x + tileW / 2, y + tileH / 2);
      lifeCtx.lineTo(x, y + tileH);
      lifeCtx.lineTo(x - tileW / 2, y + tileH / 2);
      lifeCtx.closePath();
      lifeCtx.fill();
    }
    lifeCtx.globalAlpha = 1;
    lifeCtx.globalCompositeOperation = "source-over";
  };

  /** The settlement's windows, each on its own slow flicker. */
  const drawLights = (time: number): void => {
    lifeCtx.globalCompositeOperation = "screen";
    for (const l of lights) {
      const pulse = 0.55 + 0.45 * Math.sin(time / 2200 + l.phase);
      // A second, faster and much smaller term: a steady sine reads as a
      // breathing dot, and a lit window does not breathe.
      const flicker = 0.92 + 0.08 * Math.sin(time / 190 + l.phase * 3);
      const r = l.size * (1.6 + pulse * 0.5);

      const g = lifeCtx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
      g.addColorStop(
        0,
        `rgba(${warmRgb[0]},${warmRgb[1]},${warmRgb[2]},${0.5 * pulse * flicker})`,
      );
      g.addColorStop(1, `rgba(${warmRgb[0]},${warmRgb[1]},${warmRgb[2]},0)`);
      lifeCtx.fillStyle = g;
      lifeCtx.beginPath();
      lifeCtx.arc(l.x, l.y, r, 0, Math.PI * 2);
      lifeCtx.fill();

      lifeCtx.fillStyle = `rgba(${warmRgb[0]},${warmRgb[1]},${warmRgb[2]},${0.75 * flicker})`;
      lifeCtx.fillRect(
        l.x - l.size * 0.18,
        l.y - l.size * 0.18,
        l.size * 0.36,
        l.size * 0.36,
      );
    }
    lifeCtx.globalCompositeOperation = "source-over";
  };

  /** Where a route is at `u` in 0..1, plus the painter depth there. */
  const along = (r: Route, u: number): { x: number; y: number; d: number } => {
    const total = r.cum[r.cum.length - 1] as number;
    const target = u * total;
    let i = 1;
    while (i < r.cum.length - 1 && (r.cum[i] as number) < target) i++;
    const a = r.cum[i - 1] as number;
    const b = r.cum[i] as number;
    const f = b > a ? (target - a) / (b - a) : 0;
    const lerp = (arr: number[]): number =>
      (arr[i - 1] as number) + ((arr[i] as number) - (arr[i - 1] as number)) * f;
    return { x: lerp(r.px), y: lerp(r.py), d: lerp(r.pd) };
  };

  /**
   * The villagers. Three fills each, and the whole point of the phase.
   *
   * A walker is quantised to `stations` along its route and takes one station
   * per 600ms tick, easing across the first ~72% of the tick and standing still
   * for the rest. That pause is what separates a footstep landing from a slide,
   * and it is why this reads as a tick-based game rather than as ambience.
   *
   * OCCLUSION IS DONE WITH ALPHA, NOT BY REDRAWING HOUSES.
   *
   * The obvious fix for a walker crossing behind a roof is to repaint the
   * offending house onto this canvas afterwards, and `animateIn()` shows it can
   * be done. It must not be done here. The life canvas renders at LIFE_DPR 1
   * deliberately — see the note on that constant — because it carries soft
   * shapes with no edges anyone can focus on. A house is nothing BUT edges, so
   * a half-resolution copy over its own crisp 2x self is a permanent soft ghost
   * with a halo on every roof line, shimmering as the two rasterisations
   * disagree. animateIn gets away with it only because those houses fade out
   * over 275ms and are thrown away.
   *
   * So: prefer routes that run in front of everything (done in `build()`), and
   * where that is impossible, fade the walker out over the depth boundary. It
   * costs zero draw calls, and its worst artifact is someone fading at a corner
   * rather than a ghosted roofline on every frame of every visit.
   */
  const drawVillagers = (time: number): void => {
    const limit = detail >= 2 ? villagers.length : Math.min(2, villagers.length);
    for (let i = 0; i < limit; i++) {
      const v = villagers[i] as Villager;
      const r = routes[v.route];
      if (!r) continue;

      const ticks = (time + v.offset) / TICK_MS;
      const k = Math.floor(ticks);
      const f = ticks - k;
      // Move, then stand. `1 - (1-x)^2` decelerates into the step.
      const g = f < 0.72 ? 1 - (1 - f / 0.72) ** 2 : 1;

      // Ping-pong across the stations without storing a direction.
      const span = Math.max(1, (v.stations - 1) * 2);
      const tri = (n: number): number =>
        v.stations - 1 - Math.abs((((n % span) + span) % span) - (v.stations - 1));
      const p = tri(k) + (tri(k + 1) - tri(k)) * g;
      const { x, y, d } = along(r, p / Math.max(1, v.stations - 1));

      let alpha = 1;
      for (const h of houses) {
        // A house with GREATER depth is painted later, so it is in front.
        if (h.depth <= d) continue;
        const dx = Math.abs(x - h.x);
        const dy = y - h.y;
        // The house's TRUE silhouette, derived from the same numbers
        // paintHouse builds it out of rather than approximated.
        //
        // The first version used a half-width of 0.34*tileW and a height of
        // 2.2*h.height, which covered the walls and the bottom of the roof and
        // stopped there — a cottage stands about 75px tall at hero scale and
        // the box reached 44px. Walkers crossing the upper roof of a house in
        // front of them stayed fully opaque; measured at 21% of villager pixels
        // landing on roof colour for one seed. These are the eave overhang
        // (0.34 * 1.28) and the apex (hh*2.08 + height*2.15), from the geometry
        // above.
        const hh = tileH * 0.34 * h.scale;
        if (
          dx < h.scale * tileW * 0.435 &&
          dy > -(hh * 2.08 + h.height * 2.15) &&
          dy < tileH * 0.5
        ) {
          alpha = Math.min(alpha, 1 - Math.min(1, (h.depth - d) * 2.2));
        }
      }
      if (alpha <= 0.02) continue;

      // Sized against the tile, with a floor. At 0.055 the whole figure was
      // about four pixels tall on a 360px screen — technically present, and
      // invisible. A person reads at roughly a third of a tile height.
      const sc = Math.max(4, v.scale * tileW * 0.105);
      // One bob per tick, in step with the walk rather than on its own clock.
      const bob = Math.abs(Math.sin(ticks * Math.PI)) * sc * 0.25;
      const fy = y - bob;

      lifeCtx.globalAlpha = alpha * 0.2;
      lifeCtx.fillStyle = "#101418";
      lifeCtx.beginPath();
      lifeCtx.ellipse(x, y + sc * 0.1, sc * 0.75, sc * 0.32, 0, 0, Math.PI * 2);
      lifeCtx.fill();

      // A tapered body. At eight pixels tall legs are noise; the bob is the
      // walk, and the silhouette is what makes it a person.
      lifeCtx.globalAlpha = alpha;
      lifeCtx.fillStyle = v.tint;
      lifeCtx.beginPath();
      lifeCtx.moveTo(x - sc * 0.42, fy - sc * 1.5);
      lifeCtx.lineTo(x + sc * 0.42, fy - sc * 1.5);
      lifeCtx.lineTo(x + sc * 0.3, fy);
      lifeCtx.lineTo(x - sc * 0.3, fy);
      lifeCtx.closePath();
      lifeCtx.fill();

      lifeCtx.fillStyle = "#C8A98A";
      lifeCtx.beginPath();
      lifeCtx.arc(x, fy - sc * 1.78, sc * 0.36, 0, Math.PI * 2);
      lifeCtx.fill();
    }
    lifeCtx.globalAlpha = 1;
  };

  /** Chimney smoke: one blit per puff, never a gradient. */
  const drawSmoke = (time: number): void => {
    if (!puff) return;
    const PUFFS = 4;
    const limit = detail >= 3 ? smoke.length : Math.min(2, smoke.length);
    const seconds = time / 1000;
    for (let i = 0; i < limit; i++) {
      const p = smoke[i] as Smoke;
      for (let k = 0; k < PUFFS; k++) {
        // Spreading the ages by k/PUFFS means a full column already exists at
        // time zero, which is what lets the still frame show a lit hearth.
        const age = (((seconds * p.rate + p.phase + k / PUFFS) % 1) + 1) % 1;
        const size = (0.4 + age * 1.6) * tileW * 0.3 * p.scale;
        const x = p.x + Math.sin(age * 3 + p.phase * 6) * tileW * 0.13;
        const y = p.y - age * tileH * 3.4;
        lifeCtx.globalAlpha = (1 - age) * 0.6;
        lifeCtx.drawImage(puff, x - size / 2, y - size / 2, size, size);
      }
    }
    // Reset, or the next function — and drawWater's first tile on the NEXT
    // frame — inherits this alpha.
    lifeCtx.globalAlpha = 1;
  };

  /** A deer at the treeline. Three fills, mostly standing still. */
  const drawGrazer = (time: number): void => {
    if (!grazer) return;
    const g = grazer;
    const t = (((time / g.period + g.phase) % 1) + 1) % 1;
    // Ping-pong with a long dwell at each end: an animal moves in bursts.
    const raw = t < 0.5 ? t * 2 : 2 - t * 2;
    const u = raw < 0.25 ? 0 : raw > 0.75 ? 1 : (raw - 0.25) * 2;
    const x = g.x0 + (g.x1 - g.x0) * u;
    const y = g.y0 + (g.y1 - g.y0) * u;
    const sc = g.scale * tileW * 0.05;
    // Head dips to graze while it is standing still, not while it walks.
    const graze = raw < 0.25 || raw > 0.75 ? 0.5 + 0.5 * Math.sin(time / 2400) : 0;

    lifeCtx.globalAlpha = 0.2;
    lifeCtx.fillStyle = "#101418";
    lifeCtx.beginPath();
    lifeCtx.ellipse(x, y, sc * 1.1, sc * 0.4, 0, 0, Math.PI * 2);
    lifeCtx.fill();

    // Warm tan, against the dark forest behind it, for the reason the house
    // colours are hardcoded: the tokens are text-contrast colours.
    lifeCtx.globalAlpha = 1;
    lifeCtx.fillStyle = "#B9895A";
    lifeCtx.beginPath();
    lifeCtx.ellipse(x, y - sc * 0.85, sc * 0.95, sc * 0.5, 0, 0, Math.PI * 2);
    lifeCtx.fill();

    lifeCtx.beginPath();
    lifeCtx.moveTo(x + sc * 0.6, y - sc * 1.1);
    lifeCtx.lineTo(x + sc * 1.35, y - sc * (1.75 - graze * 1.5));
    lifeCtx.lineTo(x + sc * 1.0, y - sc * (1.6 - graze * 1.5));
    lifeCtx.closePath();
    lifeCtx.fill();
  };

  /** Birds, as two small strokes each. They wrap rather than respawn. */
  const drawBirds = (time: number): void => {
    const seconds = time / 1000;
    lifeCtx.strokeStyle = "rgba(28,32,44,0.38)";
    lifeCtx.lineCap = "round";
    for (const b of birds) {
      const span = cssW + 80;
      const x = (((b.x + b.vx * seconds) % span) + span) % span;
      const y = b.y + Math.sin(seconds * 0.5 + b.phase) * 8 + b.vy * 0;
      const s = 5 * b.scale;
      // Wingbeat: the V opens and closes.
      const beat = 0.45 + 0.35 * Math.abs(Math.sin(seconds * 4 + b.phase));

      lifeCtx.lineWidth = 1.4 * b.scale;
      lifeCtx.beginPath();
      lifeCtx.moveTo(x - s, y - s * beat);
      lifeCtx.lineTo(x, y);
      lifeCtx.lineTo(x + s, y - s * beat);
      lifeCtx.stroke();
    }
  };

  // -------------------------------------------------------------------------
  // The loop
  // -------------------------------------------------------------------------
  let rafId = 0;
  let running = false;
  let onScreen = true;
  let slowFrames = 0;
  let lastFrame = 0;
  let lastPaint = 0;
  /** ~30fps. See the note in `loop`. */
  const FRAME_MS = 32;

  const renderFrame = (time: number): void => {
    // Only the life layer is cleared. The terrain beneath it is untouched,
    // which is the whole reason there are two canvases.
    lifeCtx.clearRect(0, 0, cssW, cssH);
    drawWater(time);
    // Order is composition, not habit. Villagers go before drawLights because
    // that pass composites with `screen`, so someone passing a lit window is
    // warmed by it for free — the difference between a figure pasted on and a
    // person in a place. Smoke goes after it, so the plume is not tinted.
    drawVillagers(time);
    if (detail >= 3) drawGrazer(time);
    drawLights(time);
    if (detail >= 2) drawSmoke(time);
    if (detail >= 3) drawBirds(time);
  };

  const loop = (now: number): void => {
    if (!running) return;
    rafId = requestAnimationFrame(loop);

    // Paced to ~30fps rather than driven at the display's rate.
    //
    // Everything here drifts: sunlight over 24 seconds, clouds over minutes,
    // water on a slow wave. None of it is any smoother at 60fps, and a frame is
    // a full-canvas blit plus ~150 fills — at device-pixel-ratio 2 that blit
    // alone is four million pixels. Halving the rate halves the whole cost and
    // is invisible. Lighthouse attributed 6.9 SECONDS of main-thread time to
    // this script before the loop was paced and its gradients were cached.
    if (now - lastPaint < FRAME_MS) return;
    lastPaint = now;

    // Shed detail rather than judder. Four consecutive frames over 26ms is a
    // device telling us it cannot afford this, and the right response is to ask
    // for less — not to keep asking and blame the phone.
    if (lastFrame > 0) {
      const delta = now - lastFrame;
      if (delta > FRAME_MS + 20) {
        slowFrames++;
        if (slowFrames >= 4 && detail > 0) {
          detail--;
          slowFrames = 0;
        }
      } else if (slowFrames > 0) {
        slowFrames--;
      }
    }
    lastFrame = now;

    canvas.setAttribute("data-probe", String(detail));
    renderFrame(now);
  };

  const start = (): void => {
    if (running || !mayAnimate() || !onScreen || document.hidden) return;
    running = true;
    lastFrame = 0;
    lastPaint = 0;
    rafId = requestAnimationFrame(loop);
  };

  const stop = (): void => {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  };

  /**
   * The still frame: the world, painted, not moving.
   *
   * This used to hand-pick a subset — water and lights — and had already
   * drifted: the animated sky has four birds in it and the reduced-motion sky
   * was empty, because nobody updated this when birds were added. A settlement
   * with nobody in it would have been the same bug again, and a worse one, so
   * the subset is gone. One frame of the real scene at time zero is by
   * definition the same composition, held still.
   *
   * It works only because every entity here is a pure function of time and
   * poses sensibly at zero: villagers carry a seeded head start so they are not
   * all on one doorstep, smoke spreads its puff ages so a full column exists,
   * the deer starts mid-beat, birds are spread by their seeded positions.
   */
  const settle = (): void => {
    paintTerrainLayer();
    renderFrame(0);
  };

  /**
   * M1 — the tiles rise into place, back to front, then the world starts.
   *
   * Runs exactly once, on first layout. A resize or a theme change repaints
   * instantly instead of replaying the entrance: re-animating every time
   * someone drags a window edge would be noise, and re-animating on a theme
   * toggle would punish the person who just used the toggle.
   *
   * Duration is capped rather than per-tile, so a 4K viewport with three
   * thousand tiles finishes in the same ~1.1s as a phone with two hundred.
   */
  const animateIn = (): void => {
    const DURATION = 1100;
    // Fraction of DURATION spent handing out start times.
    //
    // This was 0.55, which meant a tile's own flight took 45% of the duration
    // and roughly four fifths of the terrain was mid-flight on any given frame
    // — so "staggered" still redrew almost everything, sixty times a second,
    // during the exact window the browser is trying to render the page. At 0.86
    // the in-flight window is about a sixth of the tiles, and the entrance
    // reads more like a sweep across the land than a general fade-in.
    const STAGGER_SPAN = 0.86;

    const depths = tiles.map((t) => t.depth);
    const minDepth = Math.min(...depths);
    const maxDepth = Math.max(...depths);
    const span = Math.max(1, maxDepth - minDepth);

    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    const began = performance.now();

    let settledUpto = 0;
    // The terrain canvas starts empty and is only ever added to.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const frame = (now: number): void => {
      const elapsed = now - began;
      const t = Math.min(1, elapsed / DURATION);

      // Tiles that have landed are painted ONCE onto the terrain canvas and
      // never touched again. Only the tiles still in the air are redrawn, and
      // they go on the life layer, which is the only thing cleared per frame.
      //
      // This is correct rather than merely cheap: the entrance runs back to
      // front by depth, so every settled tile is behind every in-flight one,
      // and terrain-then-life is the same painter's order the static scene
      // uses. The previous version cleared and repainted every tile in the
      // scene on every frame, during page load.
      while (settledUpto < tiles.length) {
        const tile = tiles[settledUpto] as Tile;
        const offset = ((tile.depth - minDepth) / span) * STAGGER_SPAN;
        const local = (t - offset) / (1 - STAGGER_SPAN);
        if (local < 1) break;
        paintTile(ctx, tile, 1);
        settledUpto++;
      }

      lifeCtx.clearRect(0, 0, cssW, cssH);
      for (let i = settledUpto; i < tiles.length; i++) {
        const tile = tiles[i] as Tile;
        const offset = ((tile.depth - minDepth) / span) * STAGGER_SPAN;
        const local = (t - offset) / (1 - STAGGER_SPAN);
        if (local <= 0) break;
        paintTile(lifeCtx, tile, easeOut(Math.min(1, local)));
      }

      // The settlement arrives last, over the final quarter. Building the land
      // and then the town on it is the truer order, and without the ramp the
      // houses simply exist on the first frame after the entrance.
      if (t > 0.75 && houses.length > 0) {
        lifeCtx.globalAlpha = easeOut((t - 0.75) / 0.25);
        for (const h of houses) paintHouse(lifeCtx, h);
        lifeCtx.globalAlpha = 1;
      }

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        // Land the final state on the canvases that own it.
        paintTerrainLayer();
        lifeCtx.clearRect(0, 0, cssW, cssH);
        start();
      }
    };

    requestAnimationFrame(frame);
  };

  build();
  if (tiles.length === 0) return null;

  if (mayAnimate()) animateIn();
  else settle();

  // Stop when nobody is looking. A hero animating below the fold, or in a
  // background tab, is spending a phone's battery on nothing.
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((e) => e.isIntersecting);
        if (onScreen) start();
        else stop();
      },
      { threshold: 0 },
    );
    io.observe(canvas);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  // Someone turning reduced motion on mid-session gets it honoured immediately,
  // and turning it off gets the world back.
  reducedQuery.addEventListener("change", () => {
    if (mayAnimate()) start();
    else {
      stop();
      settle();
    }
  });

  // Repaint on resize and on a theme change, both debounced. Neither replays
  // the entrance: each rebuilds and settles straight to a composed frame.
  let timer: number | undefined;
  const schedule = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const wasRunning = running;
      stop();
      build();
      if (wasRunning && mayAnimate()) start();
      else settle();
    }, 180);
  };

  window.addEventListener("resize", schedule);
  new MutationObserver(schedule).observe(root, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", schedule);

  return world;
}
