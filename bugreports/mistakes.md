# mistakes.md — running categorized issue log

Convention: append every defect here with a one-line category tag, plus a
details file `//bugreports/<date>_<slug>.md` for anything non-trivial.

## QC sprint 2026-08-16
- **[save] Import sanitizer dropped P6–P8 fields** — `Sanitizer.ts` whitelisted
  only buildings; `player.journal/meta`, `town.labour/market`, and `map` were
  erased on import / load-from-backup. Fixed by extending the sanitizer with
  `strList/numList/numMap/strMap` coercion. Caught by `tests/qc.test.ts`
  ("apply restores the full economy state"). **Lesson: any new persisted field
  needs its sanitizer pass-through in the same change.**

## QC sprint 2026-08-16 (audit pass)
- **[boot] The game did not boot at all from P6.3 to P8.3** — `cb2dcfb` added
  `this.ui.attachQuestJournal(...)` near the top of `Game.boot()`, ~60 lines
  before `this.ui = new UI(...)`. Every launch threw
  `Cannot read properties of undefined`, aborting `boot()` before
  `engine.start()`, so the render loop never started and the canvas stayed empty.
  Two things disguised it: the HUD is static markup in `index.html`, so the page
  still *looked* like a running game; and `guarded("main", …)` swallowed the
  throw into a toast instead of failing loudly. Five phases of features were
  built, tested and shipped on top of a game that never rendered.
  **Lesson: `npm test` green is not "the game runs". Unit suites construct
  systems directly and never execute `boot()`, so no amount of them can catch a
  wiring-order defect. Every release needs one real page load asserting a
  non-blank canvas and a clean console.**
  **Second lesson: an error boundary around boot converts a loud failure into a
  quiet one. `guarded()` should re-throw (or hard-fail visibly) during boot —
  recovery only makes sense once the app is actually running.**
- **[save] Offline progression measured from boot, not from the save** —
  `SaveSystem.apply()` restored every persisted field except `timestamp`, so
  `computeOffline()` computed `now - state.timestamp` against the value
  `createFreshState()` had just stamped. A 6h-old save reported `awaySeconds: 0`
  and paid nothing; the idle pillar was dead for every returning player. Missed
  because the suite exercised `accrueLabourOffline(state, hours, cap)` directly
  with explicit hours and never ran `load() → apply() → computeOffline()`.
  **Lesson: when a unit test supplies the input a bug would corrupt, it cannot
  see that bug — cover at least one end-to-end path per pillar.**
- **[save] `boot()` called `save.load()` twice** — the second call re-applied the
  payload over live state, discarding the first load's offline gains. Harmless-
  looking duplication that silently made load order significant.
  **Lesson: `load()` mutates; treat it as non-idempotent and call it once.**
- **[data] XP table stopped one level short** — `for (n = 1; n < MAX_LEVEL)` left
  `XP_TABLE[99]` undefined, capping every skill at 98 and producing
  `width: NaN%` on the XP bar at 98 (an invalid declaration browsers drop, so the
  bar froze rather than erroring). **Lesson: pin curve endpoints, not just the
  midpoints — the anchors at levels 2 and 50 both passed while the top was broken.**
- **[combat] Main drop tables discarded min/max** — `rollWeighted()` returned only
  an item id and the caller hardcoded qty 1, so a Zombie's "10–40 coins" paid 1.
  The tertiary path rolled its range correctly, so the two disagreed.
  **Lesson: when two code paths consume the same data shape, they should share
  one roll helper.**
- **[combat] Player attack had no range gate** — `monsterCanHit()` gated the
  monster's swing; the hero's was gated only by the weapon cooldown, so a target
  could be hit from anywhere on the map. **Lesson: symmetric mechanics need a
  shared predicate, not two independent ones.**

## Open threads (not yet filed as bugs)
- **[save] Offline storage cap is per-skill, not global** — `computeOffline()`
  caps each skill at `Math.min(actions * yield, storageCap)` independently, so
  three gathering skills can each fill the whole cap (observed: 500 oak + 500
  copper + 500 shrimp against a 500 cap). `addItem()` never enforces the cap
  itself. Worth making the cap an invariant inside `addItem()`.
- Offline **coin tax** (Town Hall) only accrues online, unlike labour — by
  design vs bug, decide next sprint.
- Market panel shows live prices but no trend arrows yet (cosmetic).