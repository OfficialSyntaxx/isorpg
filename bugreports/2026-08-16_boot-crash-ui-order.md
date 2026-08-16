# 2026-08-16 · [boot] `boot()` threw on every launch — the game never rendered

**Severity:** P0 — the game was unplayable.
**Introduced:** `cb2dcfb` (P6.3, quest journal).
**Detected:** 2026-08-16, audit pass, headless-browser boot.
**Fixed:** this sprint — UI constructed before the systems that attach to it.
**Shipped broken through:** P6.3 → P6.4 → P7.1–P7.9 → P8.1–P8.3.

---

## Symptom

Loading the app produced a page that looked almost right: topbar chip, HP bar,
day chip and the full ten-button bottom bar, all rendered. Behind them, the 3D
canvas was completely empty — flat background, no terrain, no hero, no input
response.

Console showed one error:

```
[CRITICAL ERROR] Subsystem: boot
TypeError: Cannot read properties of undefined (reading 'attachQuestJournal')
```

## Cause

`Game.boot()` calls the UI attach helpers while wiring up systems:

```ts
this.quest = new QuestSystem(...);
this.ui.attachQuestJournal(() => this.quest.journalSnapshot());  // ← line 126
this.meta = new MetaSystem(...);
this.ui.attachMeta(...);
// ... attachShop, attachVillage, attachMap ...

this.ui = new UI(this.state, { ... });                            // ← line 190
```

`this.ui` is declared `ui!: UI` (definite-assignment assertion), so TypeScript
raised nothing. At runtime it is `undefined` until line 190, and the first attach
call throws.

Because the throw happens inside `boot()`, everything after line 126 is skipped —
including `new InputController(...)`, every system callback, and
`this.engine.start()`. The rAF loop never begins, so the renderer never draws.

## Why it stayed hidden for five phases

1. **The HUD is static markup.** `index.html` ships the whole chrome as plain
   DOM. It paints with or without a running engine, so the failure looked like a
   rendering glitch rather than a dead app.
2. **The error boundary muffled it.** `guarded("main", …)` caught the throw and
   surfaced a toast. A white screen and an uncaught exception would have been
   noticed immediately; a styled HUD plus a small toast was not.
3. **`npm test` could not see it.** The suite imports systems and drives them
   directly (`new BuildSystem(scene, g, state)`, `accrueLabourOffline(...)`). It
   never calls `boot()`. 54/54 stayed green across every broken release.

## Fix

Move the `new UI(...)` construction to immediately after `createFreshState(...)`,
before any `attach*` call. The UI needs only `state` plus callbacks that are
invoked lazily on user action, so it is safe to build that early.
`attachSystems(craft, build)` stays where it is, since it genuinely depends on
systems built later.

## Verification

- Headless boot: console clean, terrain/trees/water/buildings render, day-night
  tint applies.
- `62/62` QC checks pass.

## Follow-ups

- [ ] **Add a boot smoke test to `npm test`** — load the built page headless,
      assert a non-blank canvas and zero console errors. This class of defect is
      invisible to unit tests by construction.
- [ ] **Make `guarded()` fail loudly during boot.** Recovery semantics only make
      sense once the app is running; a boot-phase throw should be fatal and
      visible, not a toast.
- [ ] **Reconsider `!` definite-assignment on wired fields.** `ui!: UI` is what
      let the compiler stay silent about a use-before-assign in the same method.
