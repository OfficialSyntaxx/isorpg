# mistakes.md — running categorized issue log

Convention: append every defect here with a one-line category tag, plus a
details file `//bugreports/<date>_<slug>.md` for anything non-trivial.

## Phase H.1 2026-08-17
- **[tooling] No reliable path to move generated images from the Higgsfield
  sandbox into the repo.** Direct download of the generated sheets hit a 403
  at this session's egress proxy (the CDN host isn't on the allowed list).
  Routing through Higgsfield's own presigned-S3-upload pattern (the
  documented way to get sandbox output out) also 403'd, with a signature
  failure I didn't get to the bottom of. Fell back to relaying the image
  bytes as base64 through chat text — and that silently produced two
  corrupted files in a row. I only caught it because I computed sha256 in
  the sandbox and diffed it against what I'd decoded locally; without that
  check both would have shipped looking fine and rendering as either a
  decode error or a subtly wrong image.
  **Lesson: a large binary payload copied through a text channel is not a
  copy — verify it, every time, with a checksum computed on the source side,
  not by eyeballing that the string "looks complete."** The two corruptions
  here weren't edge cases; they were most of the attempts.
  **Second lesson: when the second independent transfer path also fails, stop
  and say so rather than trying a third workaround.** The honest, useful
  output of a blocked task is a clear description of the blocker plus
  whatever real progress doesn't depend on it — here, the generation prompts,
  the manifests, and a slicing script verified against a synthetic image —
  not a corrupted asset that passes casual inspection.

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

## Phase A 2026-08-16 (opening frame)
- **[render] Water built as one self-intersecting polygon** — `buildWater()` used
  a single `THREE.Shape` across all water tiles (`moveTo` once, `lineTo` per
  tile), triangulating into a wedge over open ground. **Lesson: `THREE.Shape` is
  for one closed contour; a tile set needs per-tile geometry (merged) or explicit
  holes.**
- **[render] Water shader displaced the wrong axis** — the geometry is rotated
  into XZ by `geo.rotateX()`, which bakes the rotation into positions, so the
  shader's `p.z +=` moved the sheet sideways and its `p.y` read was always 0.
  **Lesson: after a baked `rotateX`, shader-space axes are world axes — don't
  reason in the pre-rotation frame.**
- **[camera] Constructor undid the caller's framing** — `boot()` centred the
  camera on the hero, then `InputController`'s constructor called `applyCamera()`
  with an absolute pan of (0,0). **Lesson: a component that owns a value should
  be given the initial value, not silently reset it; "pan" is naturally an offset
  from a target, not an absolute.**
- **[render] Equirect skybox is incompatible with an orthographic camera** —
  three.js samples equirect backgrounds along the per-pixel view direction, which
  is constant under ortho, so the sky rendered as one flat colour. The asset was
  fine and loaded 200, which made it look like an art problem.
  **Lesson: when a correctly-loading asset renders wrong, suspect the projection
  before the asset.**
- **[render] Fog covered the entire play area** — a 42→88 ramp with the camera at
  radius 55 fogged everything. **Lesson: pick fog distances from the actual
  camera-to-scene range, not from map dimensions.**

## Phase A follow-up 2026-08-16 (world scale)
- **[render] Every ground prop was buried 0.6 units** — trees, rocks and clutter
  were placed at `y = 0` while the terrain surface is at `y = 0.6`. Trunks are
  0.7–1.05 tall, so most of each tree was underground and only the crown showed.
  The hero was correct (bobAnchor 0.62), which is what made the inconsistency
  hard to spot — one actor grounded, every prop sunk.
  **Lesson: "what Y is the ground?" belongs in one exported constant, not
  re-derived per generator.**
- **[art] Actors were shorter than one tile** — a 0.75-unit humanoid on a 1-unit
  grid. Everything else was proportioned to that, so the whole world read as a
  diorama. **Lesson: pick a real-world reference for the tile (1 tile ≈ 1.5 m)
  and size actors from it; don't let an arbitrary normalisation height become the
  implicit scale of the game.**
- **[world] Scan-order caps starved most of the map** — `spawnResources` walked
  rows top-down decrementing a shared cap, so row 1 consumed the budget and the
  remaining 40 rows got nothing. Looked like a density-tuning problem; was an
  iteration-order problem. **Lesson: when a budget is spent inside a loop,
  collect candidates first and sample, or the result is ordered by scan position
  rather than by design.**
- **[world] Per-tile random for terrain type reads as confetti** — coherent
  features need low-frequency noise, not an independent roll per tile.

## Phase B prep 2026-08-16 (rigged models)
- **[render] Skinned bounds measured before updateMatrixWorld → 75x actors** —
  switching clones to `SkeletonUtils.clone()` (correct: `Object3D.clone()` never
  rebinds a SkinnedMesh to its cloned skeleton) made `sizeToActor` blow every NPC
  up to ~75x, filling the screen with one texture. Cause: `Box3.setFromObject()`
  on a SkinnedMesh derives bounds from the *posed* skeleton, and a fresh clone
  still has stale bone matrices — measured cold it returns ~0.02 units instead of
  1.7, so `ACTOR_HEIGHT / size.y` explodes. `Object3D.clone()` had masked it,
  because an unbound skeleton falls back to the plain-geometry path.
  Fix: `scene.updateMatrixWorld(true)` before measuring, plus a sanity floor that
  refuses an implausible measurement rather than scaling by it.
  **Lesson: fixing one bug can unmask another that the first was hiding. The
  clone fix was right; it just exposed a latent measurement bug.**
  **Second lesson: I "fixed" this twice by reasoning about it and was wrong both
  times — a geometry-only bounding box reads ~0.02 for a skinned mesh because the
  bind-pose geometry is tiny and the size lives in the bone transforms. Logging
  the actual numbers settled it in one run. Instrument before theorising.**
- **[assets] Character GLBs were 93-96% texture** — a single 2048x2048 PNG was
  ~5.7 MB of each 6.1 MB model, for actors that render ~40 px tall. Recompressing
  to 512px JPEG (every material is alphaMode OPAQUE, so no alpha to lose) took
  the model set from 21.5 MB to 1.53 MB with no visible change.
  **Lesson: check where the bytes actually are before optimising geometry.**

## Phase C 2026-08-17 (storage, clips, wiki)
- **[design] An invariant enforced in the wrong scope breaks the game instead of
  fixing it** — moving the storage cap into `addItem()` was right, but enforcing
  it over *every* item immediately broke three Town Hall tests: the hall's tax
  coins were blocked once the bag was full of logs. The GDD had said so all along
  ("bulk resource storage caps"); I had read the cap as "everything". Coins,
  keys, quest tokens, pets, gear and tools are now exempt.
  **Lesson: when tightening a rule breaks existing tests, the first question is
  whether the rule's *scope* is wrong, not whether the tests are. Loosening the
  tests would have shipped a real regression — a full bag silently eating quest
  rewards — and left it invisible.**
- **[process] Two of six base64 chunks arrived corrupted, silently** — moving a
  binary through the transcript byte-for-byte failed on ~2 characters out of
  14,172, and gzip's CRC was the only thing that caught it. Splitting the payload
  and comparing per-chunk md5 against the source located both bad chunks in one
  round. **Lesson: for any hand-carried binary, ship a checksum with it and
  verify per chunk — "the length matches" proves nothing.**
- **[assets] The cheapest asset is the one you don't ship** — the rigging service
  returns a full ~770 kB GLB per animation, but every character shares one
  skeleton, so the *motion* is the only new data: 15 kB as a quaternion table,
  and reusable across every actor instead of bought per character.
  **Lesson: before treating a vendor's output format as the unit of delivery,
  ask what fraction of it is actually new information.**

## Hero rig 2026-08-17
- **[qc] "Has a clip" was the wrong assertion** — `verify-rig` required every
  rigged GLB to carry a baked animation, which was right when clips lived inside
  meshes and wrong the moment clips became shared data. The new hero mesh
  correctly ships with zero animations and failed the check.
  **Lesson: a test encodes an assumption about the architecture. When the
  architecture changes, the test does not politely become irrelevant — it starts
  reporting the new correct thing as broken.**
- **[art] "Looks fine" at working zoom is not "looks fine" at play zoom** — the
  wizard read clearly in a close-up and as a featureless black blob at the ~40 px
  an actor actually occupies. Judging an asset at the size the player sees it is
  the only judgement that counts.
- **[qc] A loop that is not a loop** — `hero_walk` was a 4.2s *take*, not a cycle;
  its first and last frames differ by 5.5° at the knee, so the mixer's wrap put a
  hitch in every stride. Nothing flagged it, because "has a walk clip" was true.
  Fixed by measuring the seam in `verify-rig` and failing above 3°.
  **Lesson: presence checks pass on assets that are present and wrong. Where a
  quality property can be computed, compute it.**

## Phase D 2026-08-17 (release confidence)
- **[qc] A visual test without determinism is worse than none** — the first version
  of the opening-frame check drifted because animation reads wall-clock time, the
  camera eases over ~0.14 s, and a 2.6 s welcome toast may or may not still be on
  screen. The fix was to give the *app* a canonical-frame mode rather than to widen
  the tolerance until it passed. **Lesson: when a test is flaky, make the system
  reproducible; loosening the threshold just buys silence.**
- **[qc] I placed the canonical-frame render mid-boot and it captured a frame no
  player ever sees** — the starter stash and the welcome toast are granted after it.
  Caught by looking at the actual baseline image rather than trusting the 0.00%
  match. **Lesson: a self-consistent test can be consistently wrong; look at what
  it actually captured.**
- **[qc] I claimed the visual check would have caught both Phase A defects, then
  measured it** — it catches the camera one decisively (73% of pixels) but barely
  moves on smeared water, because the blue reads from the terrain tile underneath
  and the water overlay is subtle. The water bug is properly covered by the two
  geometry checks in the QC suite. **Lesson: verify which failures a new gate
  actually catches before writing down what it covers.**

## Phase E 2026-08-17 (content)
- **[design] A number that scales the cost but not the effect** — buildings upgraded
  to level 3, each level costing level × baseCost, and every passive effect read
  `count()` instead of the level. Only the Town Hall ever looked at its own level, so
  every other upgrade sold the player a 12% larger mesh for triple materials. Nothing
  failed; the feature simply had no effect. **Lesson: when a stat is introduced,
  grep every consumer of the thing it is meant to scale. A half-wired multiplier
  reads as content, not as a bug.**
- **[design] Content that exists as items but not as recipes** — five weapons, an
  entire bar tier, and no way to make any of them. The item table, the combat table
  and the shop all agreed weapons existed; only the recipe table disagreed, and
  nothing cross-checked the two. Fixed, and now gated: a QC check fails if a weapon
  has no recipe or a bar has no consumer. **Lesson: cross-table invariants need a
  test, because each table looks complete on its own.**
- **[qc] Two UI defects sat in the panel I was editing and no test could see them** —
  a missing `flex` that right-aligned every single-column row, and a `62vh` body cap
  inside an 850px desktop panel that clipped lists with 360px of dead space below.
  Both obvious in a screenshot, invisible to 121 passing checks. **Lesson: after
  touching a panel, look at it. The audit checks structure, not layout.**
- **[process] The plan itself had gone stale** — "equipment slots (M)" was listed as
  unbuilt and was fully implemented. Reading the code before starting saved building
  a second one. **Lesson: audit against the code, not against the plan; a roadmap
  written two sessions ago is a hypothesis.**

## Phase E, part 2 2026-08-17 (farming)
- **[css] Source order beat me, and reading the file did not find it** — every row's
  mini button is `class="btn btn-mini"`, and `.btn { width: 100% }` sits ~145 lines
  *after* `.btn-mini` in the stylesheet, so it won. Combined with
  `.inv-row .btn-mini { flex-shrink: 0 }` the button took the whole row and the label
  collapsed to zero width. I looked at the CSS three times and blamed my own
  `.inv-name` flex change. What actually found it was dumping child bounding boxes in
  the page: `[24, 0, 332]` — the button was 332px wide. **Lesson: for a layout bug,
  measure the boxes before theorising about the rules. The numbers name the culprit
  in one shot; reading cascade order does not.**
- **[qc] The bug was months old and 145 checks never saw it** — it affected Bag,
  Village, Map and Shop, every one of which the UI audit "passes", because the audit
  checks that elements and handlers exist, not that they are visible. Screenshotting
  one new panel exposed four broken ones. **Lesson: a new feature is a good excuse to
  look at the old ones next to it.**
- **[design] Timestamps beat accumulators for anything that grows while away** — the
  offline gathering system needed a catch-up pass, a cap, and a bug fix for paying
  three times over. Farming stores `plantedAt` and asks `Date.now()`, so there is
  nothing to catch up and nothing to double-count. **Lesson: when state is a pure
  function of elapsed time, store the start time, not the progress.**

## Phase E, part 3 2026-08-17 (clue scrolls)
- **[qc] A synthetic tap is not a tap** — digging did nothing through Playwright. I
  instrumented rather than assuming a bug, and the input controller reported
  `up moved=false dur=453` against `TAP_DRAG_MS = 240`: headless rendering stretched
  the gap between `down` and `up`, so the game correctly read a long press. Fixed the
  *test* (`mouse.click(..., {delay: 0})`), not the game. **Lesson: this is the second
  time a Playwright input artifact has looked like a game defect. Before changing
  behaviour to satisfy a harness, log what the code actually received.**
- **[qc] A test that asserts a literal count is a test you edit to keep passing** —
  `check("meta: 16 achievements catalogued", ACHIEVEMENTS.length === 16)` failed the
  moment content was added, and the tempting fix is to bump the number, which asserts
  nothing. Replaced with unique-id, name, description and callable-test checks plus a
  floor. **Lesson: assert the invariant, not the inventory.**
- **[design] A declared slot with no members is invisible debt** — `offhand` shipped
  with the equipment system and stayed empty for the whole project; `SEED` and `GEM`
  were the same. Nothing failed, and nothing pointed at them. Clue uniques filled
  `offhand`, farming filled `SEED`. **Lesson: an enum member with no data behind it is
  a promise the code is making and not keeping. Worth grepping for periodically.**

## Boot refactor 2026-08-17
- **[arch] I recreated the bug I was removing, one layer down** — the refactor exists
  to stop a system being used before construction, and my first version published all
  25 fields in one block at the end of boot. `new InputController(...)` synchronously
  invokes its own `getFollowTarget`, which reaches `this.heroWorldPos()` and reads
  `this.state` — unassigned at that moment. Smoke went 2/5 with a stack trace pointing
  straight at it. **Lesson: "assign everything at the end" assumes construction is
  side-effect free. A constructor that calls back into its owner breaks that
  assumption, and the fix is to keep the instance in step with construction rather
  than to batch it.**
- **[qc] The net built in Phase D paid for itself on the very next change** — a
  361-line rewrite of the file that runs the whole game, and the failure was reported
  in seconds with a stack trace, not discovered by a player. Worth remembering next
  time a test harness looks like overhead.
- **[process] The deferral was right, and so was doing it later** — I declined this
  refactor in Phase D because the payoff was moving detection from an audit script to
  the compiler, and the risk was a large diff in main.ts with nothing watching. Once
  smoke + visual + a 52-check audit existed, the same diff was routine. **Lesson: the
  answer to "is this refactor worth the risk" changes when the safety net changes.
  Revisit deferrals after the tooling improves, not on a schedule.**

## Audit pass 2026-08-17
- **[design] The third instance of "state computed, never consumed"** — after building
  upgrades that only scaled cost, and craftable weapons that had no recipes,
  `animateMonster()` turned out to have been written in commit one and never called.
  Combat dutifully stamped `flashUntil` on every hit and flipped `enraged` on bosses;
  nothing drew either, and ten monsters never moved. **Lesson: this project's
  characteristic bug is a producer with no consumer. Worth a standing check — for any
  field written by a system, grep for who reads it.**
- **[qc] A wiring bug needs a wiring test** — I first "verified" the fix by grepping
  main.ts for the call, which proves nothing about behaviour. The useful pair turned
  out to be: unit checks on the pure function with real `MeshStandardMaterial`
  instances (a duck-typed stub silently skipped the whole tint branch, because the
  code gates on `instanceof`), plus an audit check that the frame loop calls it.
  **Lesson: test the function for logic and the call site for existence; neither
  alone would have caught this.**
- **[perf] Dead assets are invisible without a check** — 612 kB of `hero.png` shipped
  in every build for weeks after the 3D hero replaced it. No test, lint or review step
  looks at `public/`. Now `audit-ui.cjs` does. **Lesson: build output deserves the same
  unused-symbol scrutiny as code.**
- **[process] Comments rot faster than code** — `loadModelSizing` was documented as
  "Legacy name kept so existing call sites compile"; the call sites were gone. The
  comment was actively misleading about why the code existed. **Lesson: when deleting
  the last caller, delete the compatibility shim too.**

## Open threads (not yet filed as bugs)
- Offline **coin tax** (Town Hall) only accrues online, unlike labour — by
  design vs bug, decide next sprint.
- Market panel shows live prices but no trend arrows yet (cosmetic).
- `ItemType.GEM` has no members — a declared type with nothing behind it.
- `public/sky.png` is a 1.2 MB PNG; a 512-1024px JPEG would be ~10% of that. Not done
  because it is an art change the visual baseline cannot verify (the horizon is not in
  the opening frame).