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
    // Six base-36 characters is the most that fits (`zzzzzz` is 2,176,782,335;
    // `100000` more is not), so anything longer falls back to the art-directed
    // world rather than to a world nobody can link to. The label then always
    // re-parses to the seed that produced it.
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
    if (candidates.length > 0) {
      const anchor = candidates[Math.floor(lightRand() * candidates.length)] as Tile;
      // A tight cluster. Wider than about four tiles and it stops being one
      // settlement and becomes buildings dotted across a valley.
      const near = candidates.filter(
        (t) => Math.abs(t.gx - anchor.gx) <= 4 && Math.abs(t.gy - anchor.gy) <= 4,
      );
      const pool = near.length >= 5 ? near : candidates;

      // Painter's order again: a house behind must be drawn before the house in
      // front of it, or the roofs stack wrongly.
      const chosen = pool
        .filter((_t, i) => i % Math.max(1, Math.floor(pool.length / 11)) === 0)
        .slice(0, 11)
        .sort((a, b) => a.depth - b.depth);

      for (const t of chosen) {
        const scale = 0.82 + lightRand() * 0.36;
        const cx = t.x;
        const cy = t.y + tileH / 2;
        const height = tileH * 0.5 * scale;
        houses.push({ x: cx, y: cy, scale, height });
        lights.push({
          // On the right-hand wall, two thirds up: where a window goes.
          x: cx + tileW * 0.17 * scale,
          y: cy - tileH * 0.34 * scale - height * 0.4,
          phase: lightRand() * Math.PI * 2,
          size: tileW * 0.1 * scale,
        });
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
   *   2 — everything
   *   1 — no birds, fewer shimmering tiles
   *   0 — light sweep and cloud shadows only
   */
  let detail = 2;

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
    drawLights(time);
    if (detail >= 2) drawBirds(time);
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

  /** The still frame: the world, painted, not moving. */
  const settle = (): void => {
    paintTerrainLayer();
    lifeCtx.clearRect(0, 0, cssW, cssH);
    // Time zero, so the still frame is a composed moment rather than the
    // terrain with its lighting missing.
    drawWater(0);
    drawLights(0);
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
