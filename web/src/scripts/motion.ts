/**
 * The shared motion layer (blueprint Phase 5, §6).
 *
 * WHY THERE IS NO ANIMATION LIBRARY
 * §6.4 specifies GSAP + ScrollTrigger for the set pieces. Working through them
 * one at a time, only M3 (pinned horizontal scroll) genuinely wanted it, and
 * even that is `position: sticky` plus a scroll-progress calculation — about
 * thirty lines. Everything else is better served natively:
 *
 *   M1 hero rise      canvas; a library cannot animate tiles I have to draw
 *                     myself anyway, so it would add weight and no capability
 *   M2 parallax       one transform per frame
 *   M4/M5 path draw   stroke-dashoffset + a CSS transition, triggered by
 *                     IntersectionObserver
 *   M6 reveals        IntersectionObserver + the CSS primitive from Phase 2
 *   M7 press/hover    CSS, shipped in Phase 2
 *   M8 exit wipe      one CSS transition and a click handler
 *   M9 page change    the native CSS View Transition, zero JS
 *
 * So GSAP would have been ~30 KB gzipped to do what ~4 KB of native code does,
 * on a page whose entire first load is currently 15 KB. Not a close call. If a
 * later set piece needs real timeline orchestration, import it dynamically
 * there and nowhere else.
 *
 * REDUCED MOTION
 * Every function below returns early under `prefers-reduced-motion: reduce`,
 * leaving the element in its FINAL state — visible, drawn, untransformed. That
 * is the §6.1.5 rule: reduced motion is a designed state, not a kill switch,
 * and nothing may become invisible or unreachable because motion was declined.
 */

const REDUCED = "(prefers-reduced-motion: reduce)";

function prefersReduced(): boolean {
  return window.matchMedia(REDUCED).matches;
}

/** Save-Data means "don't spend my bytes or battery on decoration". */
function saveData(): boolean {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  return nav.connection?.saveData === true;
}

// ---------------------------------------------------------------------------
// M6 — section reveals
// ---------------------------------------------------------------------------
/**
 * Fades and lifts `[data-reveal]` elements as they enter view, staggered within
 * their group.
 *
 * The CSS primitive defaults to the OFFSET state, so if this never runs the
 * content would stay invisible — which is why the reduced-motion path and the
 * no-IntersectionObserver path both explicitly reveal everything rather than
 * simply doing nothing.
 */
export function initReveals(): void {
  const items = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
  if (items.length === 0) return;

  const revealAll = () => items.forEach((el) => el.classList.add("is-revealed"));

  if (prefersReduced() || !("IntersectionObserver" in window)) {
    revealAll();
    return;
  }

  // Stagger index is per-group, so two adjacent groups don't inherit each
  // other's delay and leave the second one waiting a second to appear.
  const groups = new Map<Element, number>();
  for (const el of items) {
    const parent = el.parentElement ?? document.body;
    const n = groups.get(parent) ?? 0;
    el.style.setProperty("--reveal-index", String(n));
    groups.set(parent, n + 1);
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-revealed");
        io.unobserve(entry.target);
      }
    },
    // Fire slightly before the element is fully on screen so the motion reads
    // as arrival rather than as a delayed correction.
    { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
  );

  items.forEach((el) => io.observe(el));
}

// ---------------------------------------------------------------------------
// M4 / M5 / M10 — self-drawing SVG paths
// ---------------------------------------------------------------------------
/**
 * Draws `[data-draw]` SVG paths on first view, using stroke-dashoffset.
 *
 * The dash length is measured from the path itself rather than guessed, so this
 * works for the map's straight routes and the XP curve's long polyline alike.
 */
export function initPathDraw(): void {
  const paths = Array.from(document.querySelectorAll<SVGGeometryElement>("[data-draw]"));
  if (paths.length === 0) return;

  if (prefersReduced() || !("IntersectionObserver" in window)) {
    // Already drawn: the markup carries no dash offset until this runs.
    return;
  }

  const prepared = paths.filter((p) => {
    // getTotalLength throws on a detached or degenerate path in some engines.
    let len: number;
    try {
      len = p.getTotalLength();
    } catch {
      return false;
    }
    if (!Number.isFinite(len) || len === 0) return false;
    p.style.strokeDasharray = String(len);
    p.style.strokeDashoffset = String(len);
    return true;
  });

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as SVGGeometryElement;
        const delay = Number(el.dataset.drawDelay ?? 0);
        const dur = Number(el.dataset.drawDuration ?? 900);
        el.style.transition = `stroke-dashoffset ${dur}ms cubic-bezier(0.65, 0, 0.35, 1) ${delay}ms`;
        el.style.strokeDashoffset = "0";
        io.unobserve(el);
      }
    },
    { threshold: 0.15 },
  );

  prepared.forEach((p) => io.observe(p));
}

// ---------------------------------------------------------------------------
// M2 — scroll parallax
// ---------------------------------------------------------------------------
/**
 * Moves `[data-parallax]` layers against the scroll, capped hard.
 *
 * §6.2 caps displacement at 40px. Restraint is the whole difference between
 * this reading as depth and reading as a template: large parallax on a
 * marketing page is the single most common tell.
 */
export function initParallax(): void {
  const layers = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));
  if (layers.length === 0) return;
  if (prefersReduced() || saveData()) return;

  const MAX = 40;
  let queued = false;

  const apply = () => {
    queued = false;
    const vh = window.innerHeight;
    for (const el of layers) {
      const rect = el.getBoundingClientRect();
      // -1 above the viewport, +1 below it.
      const centre = (rect.top + rect.height / 2 - vh / 2) / vh;
      const strength = Number(el.dataset.parallax || 0.3);
      const offset = Math.max(-MAX, Math.min(MAX, -centre * strength * MAX));
      el.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`;
    }
  };

  const onScroll = () => {
    // One write per frame. Reading layout in the scroll handler and writing
    // immediately is what turns parallax into jank.
    if (queued) return;
    queued = true;
    requestAnimationFrame(apply);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  apply();
}

// ---------------------------------------------------------------------------
// M3 — the pillars as a horizontal sequence
// ---------------------------------------------------------------------------
/**
 * Turns `[data-hscroll]` into a sticky horizontal run driven by vertical scroll.
 *
 * WHY NOT SCROLL-JACKING
 * The page never intercepts or re-times the scroll: the section is simply tall,
 * its inner track is `position: sticky`, and the track's horizontal offset is a
 * pure function of how far through the section the viewer has scrolled. Flicking
 * fast, dragging the scrollbar, and Page Down all behave exactly as they
 * normally would, which is not true of libraries that hijack wheel events.
 *
 * Desktop only. On a narrow screen the same markup stays a native
 * scroll-snap row, which is what a thumb actually wants.
 */
export function initHorizontalScroll(): void {
  const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-hscroll]"));
  if (sections.length === 0) return;

  const wide = window.matchMedia("(min-width: 64rem)");

  for (const section of sections) {
    const track = section.querySelector<HTMLElement>("[data-hscroll-track]");
    if (!track) continue;

    let queued = false;

    const reset = () => {
      section.style.removeProperty("height");
      track.style.removeProperty("transform");
      section.removeAttribute("data-hscroll-active");
    };

    const apply = () => {
      queued = false;
      const distance = track.scrollWidth - window.innerWidth;
      if (distance <= 0) {
        reset();
        return;
      }
      const rect = section.getBoundingClientRect();
      const total = section.offsetHeight - window.innerHeight;
      if (total <= 0) return;
      const progress = Math.max(0, Math.min(1, -rect.top / total));
      track.style.transform = `translate3d(${(-progress * distance).toFixed(2)}px, 0, 0)`;
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(apply);
    };

    const enable = () => {
      const distance = track.scrollWidth - window.innerWidth;
      if (distance <= 0) {
        reset();
        return;
      }
      // Section height sets how much scrolling the run consumes. One viewport
      // of vertical travel per viewport of horizontal travel keeps the mapping
      // roughly 1:1 so it does not feel sticky or rushed.
      section.style.height = `${window.innerHeight + distance}px`;
      section.setAttribute("data-hscroll-active", "");
      apply();
      window.addEventListener("scroll", onScroll, { passive: true });
    };

    const disable = () => {
      window.removeEventListener("scroll", onScroll);
      reset();
    };

    const sync = () => {
      // Under reduced motion the run becomes an ordinary scroll-snap row: still
      // horizontal, still complete, just not tied to vertical scroll.
      if (wide.matches && !prefersReduced()) enable();
      else disable();
    };

    sync();
    wide.addEventListener("change", sync);
    window.matchMedia(REDUCED).addEventListener("change", sync);
    window.addEventListener("resize", () => {
      disable();
      sync();
    });
  }
}

// ---------------------------------------------------------------------------
// M8 — hand-off into the game
// ---------------------------------------------------------------------------
/**
 * Wipes an ink layer over the page before navigating to the game.
 *
 * This is not decoration: the Unity loader's first frame is a blank canvas, and
 * covering the gap makes the hand-off feel like entering the world rather than
 * like the page breaking. The navigation happens on a timer AND on
 * transitionend, whichever first, so a dropped transition event can never
 * strand someone behind an opaque overlay.
 */
export function initExitTransition(): void {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-exit]"));
  if (links.length === 0) return;
  if (prefersReduced()) return;

  let overlay: HTMLElement | null = null;

  for (const link of links) {
    link.addEventListener("click", (e) => {
      // Never swallow a modified click: new tab, new window, download.
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (link.target && link.target !== "_self") return;

      const href = link.getAttribute("href");
      if (!href) return;

      e.preventDefault();

      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "exit-wipe";
        overlay.setAttribute("aria-hidden", "true");
        document.body.appendChild(overlay);
      }

      let navigated = false;
      const go = () => {
        if (navigated) return;
        navigated = true;
        window.location.href = href;
      };

      // Force a frame so the transition has a start state to animate from.
      requestAnimationFrame(() => {
        overlay!.classList.add("is-on");
        overlay!.addEventListener("transitionend", go, { once: true });
        // Belt and braces: a missed transitionend must not trap the viewer.
        window.setTimeout(go, 700);
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Region ambience
// ---------------------------------------------------------------------------
/**
 * Crossfades the page's ambient tint to match whichever `[data-region]` section
 * is currently dominant on screen.
 *
 * Each section already carries its district colour locally; this is the part
 * that makes moving between them feel continuous rather than like stepping
 * between panels.
 *
 * It runs even under reduced motion — the tint is colour, not movement, and
 * removing it would drop a layer of the design rather than calm it. What
 * reduced motion turns off is the 900ms crossfade, handled in CSS, so the
 * change becomes instant instead of animated.
 */
export function initRegionAmbience(): void {
  const layers = new Map<string, HTMLElement>();
  document.querySelectorAll<HTMLElement>("[data-ambient]").forEach((el) => {
    const key = el.dataset.ambient;
    if (key) layers.set(key, el);
  });
  if (layers.size === 0) return;

  const sections = Array.from(
    document.querySelectorAll<HTMLElement>("main [data-region]"),
  );
  if (sections.length === 0) return;

  let current = "";
  const show = (key: string): void => {
    if (key === current) return;
    current = key;
    for (const [name, el] of layers) {
      if (name === key) el.setAttribute("data-on", "");
      else el.removeAttribute("data-on");
    }
  };

  if (!("IntersectionObserver" in window)) {
    show(sections[0]?.dataset.region ?? "hearth");
    return;
  }

  // Track how much SCREEN each section covers and light the winner, rather
  // than reacting to whichever crossed a line most recently — that flickers
  // between neighbours on a fast scroll.
  //
  // The metric is intersectionRect.height, not intersectionRatio. Ratio is the
  // fraction of the ELEMENT that is visible, so a short section fully on screen
  // (ratio 1) beats a tall section half on screen (ratio 0.5) even though the
  // tall one fills far more of the view. That produced a measurable wrong
  // answer: standing in the devlog section lit the CTA's colour.
  const visible = new Map<Element, number>();

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        visible.set(entry.target, entry.intersectionRect.height);

      let best: string | null = null;
      let bestArea = 0;
      for (const section of sections) {
        const area = visible.get(section) ?? 0;
        if (area > bestArea) {
          bestArea = area;
          best = section.dataset.region ?? null;
        }
      }
      if (best) show(best);
    },
    // Dense thresholds so a tall section keeps re-reporting its visible
    // height as it passes, rather than only at a few crossings.
    { threshold: [0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] },
  );

  sections.forEach((s) => io.observe(s));
  show(sections[0]?.dataset.region ?? "hearth");
}

// ---------------------------------------------------------------------------
// Header — condense on scroll
// ---------------------------------------------------------------------------
/**
 * Shrinks the sticky header once the reader has scrolled, and on phones
 * collapses its nav row when scrolling down.
 *
 * WHY THIS EARNS ITS PLACE
 * The header is sticky on every page. On a phone it cost 208px — a quarter of
 * the viewport — before the layout was fixed, and even corrected it is chrome
 * that is present for the entire visit. Condensing gives the content back
 * roughly 30px, and hiding the nav row while scrolling down gives back another
 * 40px, which on a 844px screen is worth having.
 *
 * The nav is never unreachable: it returns on any upward scroll, and it is
 * always fully present at the top of the page and on wide screens.
 */
export function initHeader(): void {
  const header = document.querySelector<HTMLElement>("[data-header]");
  if (!header) return;

  const CONDENSE_AT = 64;
  // Enough that a small thumb wobble does not toggle the nav row.
  const DIRECTION_THRESHOLD = 12;

  let lastY = window.scrollY;
  let queued = false;

  const apply = (): void => {
    queued = false;
    const y = window.scrollY;

    if (y > CONDENSE_AT) header.setAttribute("data-condensed", "");
    else header.removeAttribute("data-condensed");

    const delta = y - lastY;
    if (Math.abs(delta) > DIRECTION_THRESHOLD) {
      // Never hide while near the top: the first thing a reader sees should be
      // the complete header.
      if (delta > 0 && y > CONDENSE_AT * 2) header.setAttribute("data-hidden-nav", "");
      else header.removeAttribute("data-hidden-nav");
      lastY = y;
    }
  };

  const onScroll = (): void => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(apply);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  apply();
}

// ---------------------------------------------------------------------------
// Count-up numbers
// ---------------------------------------------------------------------------
/**
 * Counts `[data-count]` figures up to their real value when they come into
 * view.
 *
 * The final number is ALREADY in the markup — this only animates from a lower
 * value up to it. So with no JavaScript, no IntersectionObserver, or reduced
 * motion, the correct figure is simply there. A counter that starts at zero in
 * the HTML and depends on script to become true is a page that lies when the
 * script fails.
 */
export function initCounters(): void {
  const els = Array.from(document.querySelectorAll<HTMLElement>("[data-count]"));
  if (els.length === 0) return;
  if (prefersReduced() || !("IntersectionObserver" in window)) return;

  const DURATION = 900;
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

  const run = (el: HTMLElement): void => {
    const target = Number(el.dataset.count);
    if (!Number.isFinite(target) || target <= 0) return;
    const start = performance.now();

    const frame = (now: number): void => {
      const t = Math.min(1, (now - start) / DURATION);
      el.textContent = String(Math.round(easeOut(t) * target));
      if (t < 1) requestAnimationFrame(frame);
      else el.textContent = String(target);
    };
    requestAnimationFrame(frame);
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        run(entry.target as HTMLElement);
        io.unobserve(entry.target);
      }
    },
    { threshold: 0.5 },
  );

  els.forEach((el) => io.observe(el));
}

// ---------------------------------------------------------------------------
export function initMotion(): void {
  initCounters();
  initHeader();
  initRegionAmbience();
  initReveals();
  initPathDraw();
  initParallax();
  initHorizontalScroll();
  initExitTransition();
}
