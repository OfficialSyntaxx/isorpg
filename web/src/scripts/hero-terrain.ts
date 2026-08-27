/**
 * Generates the hero's isometric terrain in the browser.
 *
 * This is a deliberate echo of how the game itself works — src/generators/ and
 * src/world/Grid.ts build every mesh and texture at runtime from primitives and
 * a seeded value noise, with zero external assets. The landing page makes the
 * same claim, so it generates rather than shipping a picture of generation.
 *
 * It is NOT a port of the game's generator and does not pretend to be: this
 * draws 2D isometric diamonds on a canvas, where the game builds a 3D scene.
 * What is shared is the approach and the palette.
 *
 * DESIGN CONSTRAINTS
 *   - Paints exactly one frame. No animation loop, no rAF, nothing running
 *     after the hero leaves the viewport. Blueprint Phase 5 (M1) owns motion.
 *   - Reads its colours from the live CSS custom properties, so it follows the
 *     theme and the Phase 2 contrast audit rather than hardcoding hexes.
 *   - Bails out — leaving the authored gradient fallback visible — on reduced
 *     motion, save-data, or no 2D context.
 *   - Caps the pixel ratio at 2. A 3x backing store on a phone is a lot of
 *     fill for a decorative layer.
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

interface Band {
  /** Upper bound of the noise value this terrain occupies. */
  limit: number;
  color: string;
  /** Extra height in tile units, so land reads above water. */
  lift: number;
}

export function paintTerrain(canvas: HTMLCanvasElement): void {
  // Respect the viewer before doing any work.
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  const saveData = nav.connection?.saveData === true;
  if (reduced || saveData) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const root = document.documentElement;

  const draw = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW === 0 || cssH === 0) return;

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // Palette from the live tokens, so this follows the theme and inherits the
    // audited colours instead of duplicating them.
    const bands: Band[] = [
      { limit: 0.34, color: cssVar(root, "--mark-miregate", "#3FA89A"), lift: 0 },
      { limit: 0.42, color: cssVar(root, "--mark-gold", "#FFD479"), lift: 0.1 },
      { limit: 0.68, color: cssVar(root, "--mark-wildwood", "#4F9D5A"), lift: 0.35 },
      { limit: 0.82, color: cssVar(root, "--success", "#2E612B"), lift: 0.6 },
      { limit: 1.01, color: cssVar(root, "--mark-rock", "#5C5E61"), lift: 0.95 },
    ];

    // Tile size scales with the viewport so the composition holds from 360px to
    // ultrawide, rather than becoming a mosaic on one and four tiles on another.
    const tileW = Math.max(38, Math.min(84, cssW / 16));
    const tileH = tileW / 2;

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

    const noise = makeNoise(20260827);
    const lift = tileH * 0.9;

    ctx.globalAlpha = 1;

    // Painter's order: back to front so nearer tiles overlap correctly. Depth
    // in this projection is gx + gy, and iterating gy then gx gives that.
    for (let gy = gyMin; gy <= gyMax; gy++) {
      for (let gx = gxMin; gx <= gxMax; gx++) {
        const n = noise(gx * 0.16 + 8, gy * 0.16 + 8);
        const band = bands.find((b) => n < b.limit) ?? (bands[bands.length - 1] as Band);

        const x = originX + (gx - gy) * (tileW / 2);
        const y = originY + (gx + gy) * (tileH / 2) - band.lift * lift;

        // Cheap cull. Without it a wide viewport draws thousands of invisible
        // diamonds and the paint cost shows up in LCP.
        if (x < -tileW * 2 || x > cssW + tileW * 2) continue;
        if (y < -tileH * 4 || y > cssH + tileH * 6) continue;

        // Top face.
        ctx.fillStyle = band.color;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + tileW / 2, y + tileH / 2);
        ctx.lineTo(x, y + tileH);
        ctx.lineTo(x - tileW / 2, y + tileH / 2);
        ctx.closePath();
        ctx.fill();

        // Two side faces, darkened, so the grid reads as volume rather than a
        // flat tiling. Drawn only for lifted land — water has no visible sides.
        if (band.lift > 0) {
          const side = band.lift * lift + tileH * 0.35;

          ctx.fillStyle = "rgba(0,0,0,0.22)";
          ctx.beginPath();
          ctx.moveTo(x - tileW / 2, y + tileH / 2);
          ctx.lineTo(x, y + tileH);
          ctx.lineTo(x, y + tileH + side);
          ctx.lineTo(x - tileW / 2, y + tileH / 2 + side);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = "rgba(0,0,0,0.34)";
          ctx.beginPath();
          ctx.moveTo(x + tileW / 2, y + tileH / 2);
          ctx.lineTo(x, y + tileH);
          ctx.lineTo(x, y + tileH + side);
          ctx.lineTo(x + tileW / 2, y + tileH / 2 + side);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    canvas.setAttribute("data-painted", "");
  };

  draw();

  // Repaint on resize and on a theme change, both debounced. Neither is an
  // animation: each settles to one static frame.
  let timer: number | undefined;
  const schedule = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(draw, 180);
  };

  window.addEventListener("resize", schedule);
  new MutationObserver(schedule).observe(root, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", schedule);
}
