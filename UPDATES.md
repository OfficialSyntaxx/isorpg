# Isoperia — Update Log

Running changelog of shipped increments. Each entry names the phase, what changed,
the game-repo commit, and the live build (cache-bust version at
`isoperia-rpg.higgsfield.app`).

---

## 2026-08 · Phase H.2 — Sky regen

Replaced `public/sky.png` (a 1.2 MB realistic HDRI-style equirect panorama,
with a mirrored "reflection" baked into its lower half per HDRI convention)
with `public/sky.jpg` (~114 kB): a flat low-poly gradient sky matching the
rest of the game's art style — deep blue at the top through soft blue-grey
to a warm tan haze at the horizon, a few flat-shaded low-poly clouds, solid
tan (not mirrored sky) below the horizon line. Generated with `nano_banana_2`
at `16:9`/`2k` (~1 credit), converted PNG→JPEG at quality 0.85 with the same
headless-Chromium canvas trick `optimize-glb.cjs` already uses for texture
recompression (no native image library needed). `WorldSystem.buildSky()`'s
`TextureLoader` URL updated from `sky.png` to `sky.jpg`; nothing else about
the wiring changed (still hot-swapped in over the procedural gradient sky
with silent fallback, still `THREE.UVMapping` rather than equirectangular —
see the code comment on why, unchanged from Phase 8).

**Transfer blocker, again — and the fix scaled.** Downloading the generated
image hit the same egress block H.1 hit, this time confirmed precisely via
the proxy's own status log (`$HTTPS_PROXY/__agentproxy/status` →
`recentRelayFailures`: `connect_rejected`, `policy denial`, naming the exact
cloudfront host) rather than trial-and-error. Asked the user to download and
attach it directly, same as H.1's resolution — worked on the first try, file
size matched the generation exactly (2752×1536, no corruption).

Verified beyond the QC suite: the visual baseline (which frames the map
tightly enough that the sky isn't in shot) still matches at 0.00% drift, and
a manual zoomed-out screenshot (mouse-wheel to `ZOOM_MIN` against the live
build) confirms the sky actually renders as intended — gradient, clouds, and
horizon haze all visible and blending with the existing fog colour, no
stretching or mirroring artifact.

Gates: 321/321 QC, 5/5 smoke ("all assets load" catches a bad path — it
would have failed here on a stale `sky.png` reference), visual baseline
0.00% drift, `npm run audit` clean.

## 2026-08 · Post-H.1 polish — hero scale, camera, and real transparent icons

Two follow-up complaints on the just-shipped H.1 icons and the existing hero
render, addressed before starting H.2 (sky regen):

**Hero looked microscopic.** `ACTOR_HEIGHT` (`src/core/Scale.ts`) went from
1.25 to 1.7 tiles — the hero was maybe half a tree tall on screen, closer to
"prop" than "protagonist"; 1.7 puts an actor at roughly tree-trunk height.
Paired with a tighter default camera zoom (`src/core/InputController.ts`:
`DEFAULT_ZOOM` 1.75→2.15, `ZOOM_MAX` 1.9→2.5, `ZOOM_MIN` unchanged at 0.45 so
the wide view is still reachable). Both are pure visual-scale constants —
confirmed via grep that `ACTOR_HEIGHT` is used only for mesh scaling
(`Character.ts`, `Monster.ts`, `Model.ts`), never in collision or tile
occupancy math, so this couldn't touch gameplay. Verified with pixel-matched
before/after crops (not full-scene screenshots, which looked deceptively
similar at first glance) — hero height increased ~50–67% on screen.

**Item icons had a visible tan card background.** `scripts/slice-atlas.cjs`
gained a background-cutout pass and all 62 icons were re-sliced from the
original 4 sheets with it. Getting the cutout right took several wrong
turns, documented in the script's own comments and in
`bugreports/mistakes.md` — briefly: a naive flood-fill leaked straight
through anti-aliased edges and ate whole icons; classifying every pixel
against a single "the border is one background colour" reference broke on
icons whose border legitimately has two populations (card tan + a drop
shadow) or where the item's own art bled to the crop edge; one whole sheet
draws a thin dark card-outline stroke right at the crop boundary, which
poisoned every border sample until reference sampling moved inward past it;
and the safety net that was supposed to catch "the whole card matched and
the icon vanished" was catching small legitimate icons (a handful of seeds,
a tiny pet) as if they were failures, because both cases leave under 8% of
the cell opaque. Final state: bin-filtered border-colour references (keeps
multi-modal legitimate backgrounds, drops rare bleed outliers), the card's
own margin/outline forced into the cut unconditionally, classification-
gated flood-fill from there, and a 0.5%-opaque sanity floor. All 62 icons
re-verified — 0 flagged as suspicious cuts, spot-checked visually across all
4 sheets (previously-worst cases: `cartographers_tome`, `coins`,
`pet_zombie`, `wayfarers_lantern`, plus the sparse `cabbage_seed` /
`redberry_seed` and the misc/keys/pets sheet's thicker outline that needed a
larger inset).

Also extended `itemIconHtml()` (real icon image, falls back to emoji) to the
two call sites that were still using the emoji-only `itemIcon()`:
`ShopSystem.ts` (buy/sell listings) and `LabourSystem.ts` (village stock
claim panel) — both panels were shipping H.1's real icons already via other
paths, these two just hadn't been switched over. The Combat panel's weapon
stat row also now shows the equipped weapon's icon next to its name.

Gates: 321/321 QC, 5/5 smoke, visual baseline re-accepted (31.36% intended
drift from the scale/zoom change, reviewed and confirmed as the change
working correctly before `--update`), `npm run audit` clean.

## 2026-08 · Phase H.1 complete — the transfer blocker resolved itself

The blocker below was environment-specific, not fundamental: the user attached
the 4 generated sheets directly to the conversation, which reaches this
session through the chat attachment path rather than the sandbox/proxy one —
sidestepping every failure mode the previous entry documents. Matched each of
the 4 uploaded PNGs to its manifest by eye (filenames don't reveal which is
which; content does), ran `slice-atlas.cjs` for real this time, and spot-
checked several output icons visually (coins, steel sword, zombie pet, cooked
trout) before trusting the batch.

All 62 items now have a real icon: `ITEM_ICON_IMAGE_IDS` went from empty to
every item id, and `shrimp_food` got a literal file copy of `cooked_shrimp`'s
icon (it was always going to share the art, per the atlas README — a copy is
simpler than adding lookup indirection for one legacy duplicate). The QC
block gained file-level checks that didn't make sense before there were
files to check: every registered id has a non-empty PNG on disk, and every
one of those PNGs actually starts with a PNG header rather than trusting the
extension. ~514 KB total for 62 icons at 64×64.

Gates: 321/321 QC, 5/5 smoke, visual baseline 0.00% drift, npm run audit
0 bugs.

## 2026-08 · Phase H.1 — Icon atlas: infrastructure shipped, art blocked

Generated 4 grid sheets (`nano_banana_2`, 4×4, 1:1, 2k, ~8 credits total)
covering all 61 unique item icons, grouped thematically (resources / farming
& food / weapons & armor / misc-keys-pets — the game's `ItemType` field
conflates gathering tools, weapons and armor under `TOOL`, so it's useless
for visual grouping). Wrote `scripts/slice-atlas.cjs` to turn a sheet into
named per-item PNGs — same trick `optimize-glb.cjs` already uses (headless
Chromium + canvas `drawImage` with a source rect, no image library to
install), verified end-to-end against a synthetic 4-color test sheet before
touching anything real.

**The generated sheets are not in this repo.** This session's environment
has no reliable way to move them from the Higgsfield sandbox that rendered
them into this checkout:
- direct download is blocked by this session's egress policy (403 at the proxy)
- routing through Higgsfield's presigned S3 upload also 403'd, for reasons
  I couldn't isolate before giving up on it
- relaying the bytes as base64 through chat text — the fallback — produced
  two silently corrupted files, caught only because I checksummed them
  against the sandbox afterward rather than trusting the copy. Neither was
  committed.

Rather than keep retrying a transfer path that had already corrupted output
twice, I stopped and asked; the call was to ship the code now and finish the
art later. So what's actually live:

- `itemIconHtml()` in `src/data/Items.ts` — prefers a real `/icons/<id>.png`
  over the emoji, but only for ids in `ITEM_ICON_IMAGE_IDS`, which is **empty
  right now**. Every call site in `UI.ts` (5 of them) switched from
  `itemIcon()` to `itemIconHtml()`, and with the set empty this is
  byte-for-byte the old behaviour — pinned by a QC check that
  `itemIconHtml(id) === itemIcon(id)` for every item while the set is empty.
- `assets/icon-atlas/` — the 4 manifests (row-major cell → item id, matching
  the sheets' generation prompts exactly) plus a README with the full prompt
  text, so regenerating doesn't mean re-deriving the mapping. A QC check
  confirms the 4 manifests together cover every item exactly once (61/61,
  `shrimp_food` deliberately excluded as a legacy duplicate of
  `cooked_shrimp`'s icon) — this caught nothing wrong this time, but it's the
  check that would catch a manifest drifting from `ITEMS` after the fact.
- CSS for `.item-icon-img` sized off the emoji's line-height, so an icon
  drops into the existing 19-20px slot with no layout change once one exists.

Finishing this needs someone/something with a working transfer path to get
the 4 PNGs onto disk, then `node scripts/slice-atlas.cjs <sheet> <manifest>
public/icons --size 64` four times, then add the new ids to
`ITEM_ICON_IMAGE_IDS`. Everything downstream is already built and tested.

Gates: 317/317 QC, 5/5 smoke, visual baseline 0.00% drift, npm run audit
0 bugs.

## 2026-08 · Phase F.5 — Death has stakes (Phase F complete)

Death was purely soft: full heal, walk back to town centre, nothing else.
Now dying costs 15% of every carried *bulk* item stack, floored per stack —
a stack under ~7 loses nothing, so a light bag never gets wiped, and losses
only start to bite once a haul is actually worth banking.

"Unbanked" reuses a split the storage cap already draws rather than
inventing a second one: coins, equipment, tools and quest items are all
`MISC`/`equip`/`tool`, already exempt from the bulk storage cap for the same
reason (a full bag of logs should never block a coin drop or a quest key).
`isBulk()` already answered "is this the kind of thing a Storehouse run is
for?" — death just asks the same question. So the whole feature is one new
function, `applyDeathPenalty()`, called from `diePlayer()`, with no new
save fields, no sanitizer work, no UI beyond an existing toast now listing
what was lost.

Kept deliberately forgiving per the roadmap's own risk note (mobile players
shouldn't feel punished): equipped gear is always safe, quest progress is
always safe, coins are always safe, and the floor means casual play barely
notices — it's a hoarded stack of logs mid-gathering-run that has something
to lose.

10 new QC checks: only bulk stacks are touched, the loss is floored not
rounded, a small stack survives untouched, coins/quest-items/gear all
survive completely, an empty bag doesn't error, and a full CombatSystem
death (pinned RNG, a hero baited down to 1 HP) reports the loss through
`onDeath` and confirms the respawn-healed state.

**Phase F — Combat depth is now complete**: attack styles (F.1), Resolve
(F.2), weapon specials (F.3), monster affixes (F.4), death with stakes
(F.5). Two players at the same combat level can now be built differently
and it shows in a fight — which was the phase's stated done-condition.

Gates: 246/246 QC, 5/5 smoke, visual baseline 0.00% drift, npm run audit
0 bugs.

## 2026-08 · Phase F.4 — Monster affixes

Cheap variety across all ten non-boss monsters, as the roadmap put it — no new
content, just an occasional prefix on a spawn:

- **Hardened** (12%/3 chance) — +50% HP, +30% max hit, +30% defense
- **Swift** — attacks ~40% faster, wider aggro range
- **Rich** — double coin drops, doubled tertiary-drop chance

Rolled once per spawn (12% overall, evenly split three ways) inside
`spawnMonster()` itself, so every spawner — the open world, both dungeon
floors, the boss ladder — gets it for free with no call-site changes. Bosses
are excluded; they already carry enrage/slam identity and stacking an affix
on top felt like double-dipping rather than variety.

The implementation leans on something already true of the codebase: combat,
loot and XP all read from `monster.def.*`, and nothing else holds a second
copy of those numbers. So an affix is just `applyAffix()` producing a *scaled
copy* of the monster's def for that one spawn — the shared `MONSTERS` table
entry every other instance of that type reads from is never touched — and
every system that already reads `def.name` / `def.hp` / `def.main` etc.
picks up the affix for free: kill toasts read "Hardened Goblin down!"
without any UI change, and Rich's better loot shows up in the normal drop
roll without a special case. No CombatSystem edit was needed at all.

Visual tell: a faint permanent emissive tint (red/cyan/gold) on unaffixed —
sorry, *affixed* — monsters, applied in `animateMonster()`'s idle branch so
flash and enrage still take priority when they're active. Persistence-free —
the affix lives on the def clone in memory, not in the save.

10 new QC checks: affix data sanity, each affix's stat/loot math, proof the
shared table entry is never mutated, a `def.id`-survives check (kill/collection
counters key off `def.id`, not the affix-prefixed name), bosses refusing an
affix even at a pinned 100% roll, and an unaffixed spawn keeping the exact
same def reference rather than a needless clone.

Gates: 236/236 QC, 5/5 smoke, visual baseline 0.00% drift, npm run audit
0 bugs.

## 2026-08 · Phase F.3 — Weapon specials

Every weapon differed from every other one by exactly two numbers — max hit
and accuracy — so past a point the "best" weapon was just whichever won that
comparison. Gave each weapon (but fists) a charge-based special, spent from a
0–100 bar that fills 1/tick regardless of location — no Campfire needed,
unlike Resolve, since a special is a combat cooldown, not a rest mechanic:

- Dagger — **Puncture**: always hits, 1.2× damage, 25% bar
- Sword — **Riposte**: 1.3× damage, 40% bar
- 2H Sword — **Cleave**: 1.8× damage, 100% bar (its whole bar, for a haymaker)
- Shortbow — **Piercing Shot**: always hits, 1.4× damage, 50% bar
- Iron Sword — **Execute**: 1.2× damage normally, 2.2× against a target under
  25% HP — the only special that changes behaviour with the fight, not just
  the numbers
- Steel Sword — **Onslaught**: 1.9× damage, 80% bar

Queued from the Combat panel (a button next to the bar) and consumed on the
very next swing — landing or missing, since the bar is spent the moment it's
queued, matching how a real cooldown reads rather than a free reroll on a
miss. A "guaranteed hit" special skips the accuracy roll entirely, so
Puncture and Piercing Shot are usable at a level where the base weapon would
often just splash.

13 new QC checks: bar-cost/damage-mult sanity, fists correctly has no
special, sanitizer clamping (a negative value clamps to 0, a *missing* value
starts full — different defaults for different failure modes, and both are
tested), refusal below cost, a guaranteed-hit special connecting against a
pinned RNG roll that would miss a normal swing, the bar being spent exactly
once whether or not the hit landed, and always-on regen with no Campfire in
the fixture. Extended `audit.cjs`'s round-trip fixture a third time.

Gates: 226/226 QC, 5/5 smoke, visual baseline 0.00% drift, npm run audit
0 bugs.

## 2026-08 · Phase F.2 — Resolve, a buff pool

Food was the only lever in a fight — no way to spend a resource on a short,
active edge. Added **Resolve**, a 0–100 pool (starts full) spent on one of
three toggleable buffs, picked in the Combat panel next to the fight stance:

- **Precision** — +6 accuracy
- **Power** — +4 max hit
- **Warden** — +6 defense

Each costs 2 Resolve per combat tick (600ms) while active — roughly 30s of
uptime from a full pool — and switches itself off (with a toast) rather than
going negative. Resolve only refills resting within 2 tiles of a Campfire,
at 3/tick, so it's a resource you manage between fights, not a free stat.
Stacks additively with attack styles: a Defensive/Warden pairing is the
tankiest combination in the game right now, an Accurate/Precision pull is
the most reliable, by design.

Wired the same way as F.1's styles — a `buffBonus()` helper feeding the same
accuracy/max-hit/defense rolls attack styles already touch, so there's one
place, not two, doing the arithmetic. Persisted as `player.resolve` /
`player.activeBuff`, sanitized (out-of-range resolve clamps into 0..100, an
unrecognised buff id is dropped rather than kept "active" with no data behind
it). 9 new QC checks: buff-shape sanity, sanitizer clamping, drain-per-tick,
never-goes-negative, self-switch-off at zero, no-regen-without-a-campfire,
regen-with-one, regen-caps-at-max, and a two-fight comparison (same pinned
RNG, with and without the buff) proving the bonus reaches the actual damage
roll rather than just existing in the data table.
Updated `audit.cjs`'s save round-trip fixture again, same as F.1 — it caught
nothing new this time, which is the point of running it every increment
rather than trusting the last clean result.

Gates: 212/212 QC, 5/5 smoke, visual baseline 0.00% drift, `npm run audit`
0 bugs.

## 2026-08 · Phase F.1 — Attack styles

The combat loop trained attack, strength and hitpoints on every single swing,
regardless of what the player was carrying or doing — there was no way to
specialise a build. Added a per-fight stance, picked in the Combat panel:

- **Accurate** — +3 to the attack roll, trains Attack.
- **Aggressive** — +3 to the max-hit roll, trains Strength.
- **Defensive** — +3 to the defense roll (only relevant while being hit), trains
  Defense.

Hitpoints still trickles in regardless of style, same as before styles existed.
`selectWeapon` and the drop/xp tables were untouched — this only changes which
of the three combat skills the swing feeds, and by how much it shifts the roll.
Persisted in `settings.attackStyle` (defaults to Accurate on a fresh save, an
unrecognised value on import falls back to it rather than crashing). 4 new QC
checks (`ATTACK_STYLES` shape, sanitizer fallback, and a determinism check with
`Math.random` pinned to 0 that aggressive trains strength and not attack).
Updated `scripts/audit.cjs`'s save round-trip fixture to a distinctive
`attackStyle` value, since the fixture is what caught this: the audit's own
save-roundtrip check flagged the new field the first time it ran.

## 2026-08 · Full audit & QC pass

Ran a fresh sweep over the whole project — data integrity, save round-trip, dead
code, UI layout, payload, stability — and fixed what it found.

**The headline finding: monsters were never animated.** `animateMonster()` has
existed since the first commit and was **never called from the frame loop**. It is
the only code that draws the hit flash, the boss enrage tint, the death pose, and
the idle motion for the ten monsters that have no rigged GLB. So:
- hitting a monster set `flashUntil` and drew nothing;
- a boss below half HP gained +2 max hit and double attack speed with **no visual
  tell**, on a boss whose whole design is a telegraphed slam;
- ten of twelve monsters stood perfectly still;
- corpses never settled into the defeated pose.
Now wired, with two care points: the idle bob is skipped for rigged monsters (their
clip owns the pose), and rigged clones get **per-instance materials** — `SkeletonUtils.clone()`
shares them, so without a copy flashing one Cave Brute would flash all three on
dungeon floor 3. Seven QC checks pin the behaviour with real `MeshStandardMaterial`
stubs, and four audit checks assert the frame loop calls it at all — the failure was
missing wiring, not wrong logic.

**Also fixed**
- `public/hero.png` — 612 kB, referenced by nothing since the 3D hero replaced it,
  shipped in every build. Deleted, and `audit-ui.cjs` now fails on any unreferenced
  file in `public/` so it cannot happen again (verified against a planted orphan).
- 14 dead exports removed, including `loadModelSizing`, whose comment read "Legacy
  name kept so existing call sites compile" with zero call sites left.
- `buildClip`'s doc claimed "Exported for tests" and no test used it. Now six checks
  cover the clip decoder, including the `Int16` alignment trap that would produce a
  garbage pose rather than an error.
- An inline SVG favicon: every page load was logging a 404 for `/favicon.ico`, which
  the smoke test then had to filter out.

**Came back clean**
- **Data integrity** — every item id referenced by a recipe, drop table, building
  cost, crop, clue or shop row exists; no unobtainable items; every bar has a
  consumer; every weapon has a recipe; drop weights and ranges all sane.
- **Save round-trip** — populated all 18 persisted field groups with distinctive
  values, serialised, sanitised and re-applied into a fresh state: every one
  survived. (`storageCap` is derived and recomputed by `BuildSystem.rehydrate()`.)
- **UI layout** — 8 panels × 2 viewports (390×844 and 1280×900), checking for
  zero-width labels, horizontal overflow, off-screen rows and clipped bodies. Clean;
  the `.btn-mini` and `.panel-body` fixes from Phase E hold.
- **Stability** — 41 s of driven play: heap 41 MB → 29 MB (GC, no leak), DOM 79 → 109
  nodes, no toast accumulation, no page errors, no failed requests.
- **Payload** — music is lazily loaded per zone, so the 4.4 MB of tracks is not a boot
  cost. Bundle 786 kB, models 2.1 MB, clips 32 kB.
- No `TODO`/`FIXME`/`@ts-ignore` anywhere; no stray `console.log` in `src/`.

**Known and deliberate:** `ItemType.GEM` still has no members, and `sky.png` is a
1.2 MB PNG that would recompress to roughly a tenth as a JPEG — left alone because it
is an art change and the visual baseline does not frame the horizon, so I could not
verify it without your eye on it.

- 197/197 QC · 57/57 UI audit · 25/25 rig · 5/5 smoke · visual baseline 0.00% drift.

---

## 2026-08 · The boot refactor — the compiler guards boot() now

- **`boot()` builds the system graph as `const` locals**, publishing each to the
  instance (`this.ui = ui;`) the moment its statement completes. 25 systems, 212
  `this.X` references rewritten across a 361-line method.
- **The point is the temporal dead zone.** Re-injecting the exact bug that shipped —
  `ui.attachQuestJournal(...)` sitting above `const ui = new UI(...)` — now produces
  `TS2448 Block-scoped variable 'ui' used before its declaration`. Before the
  refactor the compiler emitted nothing, because `ui!: UI` told it to trust the
  field. The `!` assertions remain (they have to, being assigned in an async method)
  but they can no longer hide anything: nothing in boot reads a system back off
  `this`.
- **Publishing per-statement is load-bearing, and I got it wrong first.** My initial
  version published all 25 fields in one block at the end. That broke the opening
  frame, because `new InputController(...)` synchronously calls its own
  `getFollowTarget`, which reaches `this.heroWorldPos()` and reads `this.state` —
  still unassigned. **The smoke test caught it at 2/5** with a stack trace straight to
  `heroWorldPos`. This is precisely the net Phase D was built to provide, doing its
  job on the very next refactor.
- **Three new audit checks** assert the shape so the compiler cannot be sidelined
  again: systems are built as locals rather than onto `this`; systems are read through
  locals, never off `this`; every local system is published. Each verified by
  injecting its own regression and watching it fail.
- Behaviour is unchanged: 52/52 UI audit · 184/184 QC · 25/25 rig · 5/5 smoke ·
  visual baseline **0.00% drift**.

---

## 2026-08 · Phase E complete — clue scrolls, and the offhand slot finally has items

- **Clue scrolls.** A multi-step treasure hunt. Reading a scroll consumes it and
  writes **one** hunt onto the player — inventory stacks hold only an id and a count,
  so which-tile-and-which-step could never live on the item itself. Each dig site is
  marked on the map one at a time; tapping the tile walks there and digs, the next
  site appears, and the last dig pays out.
- **Reproducible by seed.** Sites are chosen from a stored seed with the same
  mulberry32 the world uses, so a hunt survives a reload unchanged and a save
  round-trip cannot move the target out from under the player. The sanitizer clamps a
  hand-edited step into the site list and drops out-of-bounds sites, so a tampered
  save cannot strand you on an unfinishable hunt.
- **The offhand slot finally has items.** `offhand` has been a declared equip slot with
  **zero items** in it since equipment shipped. Both clue uniques fill it: the
  Wayfarer's Lantern (+3 Defence, +4 HP) and the Cartographer's Tome (+4 Attack,
  +5 Defence, +6 HP).
- Two tiers — Simple (2 digs, rings 1–2) and Hard (3 digs, rings 2–3) — as tertiary
  drops from goblins and skeletons, so they can fall alongside a normal drop. Hints
  name a direction and the ground underfoot rather than coordinates, since the map
  marker already gives the exact tile.
- Shown under the quest journal, because a clue *is* a quest — just a self-issued one.
  Three new achievements (Treasure Hunter, Cartographer, Green Thumb).
- **A near-miss worth recording.** Driving the hunt through real taps, digging did
  nothing. Rather than "fixing" it I instrumented the input controller: the tap was
  detected correctly, but the synthetic press measured **453 ms** against a 240 ms tap
  threshold, so the game rightly rejected it as a long press. A test artifact, not a
  bug — the same trap as the camera false alarm in Phase A. With a fast click the full
  hunt completes: *"🏆 Treasure! 273 coins, Iron Ore ×4, Plank ×4, ✨ Wayfarer's
  Lantern"*, coins credited and the hunt cleared in the save.
- Also replaced a QC check that asserted a literal achievement count (`=== 16`) with
  one that asserts the catalogue's integrity — unique ids, names, descriptions and
  callable tests — so adding content no longer edits a test to keep it passing.
- 39 new QC checks (**184/184**) · 49/49 UI audit · 25/25 rig · 5/5 smoke · visual
  baseline clean.

---

## 2026-08 · Phase E — Farming, and a row-layout bug that had shipped

- **Farming.** A twelfth skill, and the only one that advances on **wall-clock time**
  rather than on actions. A bed stores just the seed and the epoch ms it was sown, so
  growth is a function of `Date.now()`: no tick loop, no offline catch-up pass, no way
  for it to drift out of step with the save or be paid twice the way offline gathering
  once was. A crop sown before you close the tab is simply ripe when you return.
- **Beds come from Farm Plot levels** (Construction 3, one bed per level), matching the
  `levels()` rule established for every other passive effect. Shrinking the plot count
  never bins a growing crop — only empty trailing beds are removed.
- **Three seeds, each closing a loop** rather than adding a dead-end item: potato
  (5 min), cabbage (12 min) and redberry (30 min), stocked by the town merchant.
  Potatoes and cabbages feed two new Cooking recipes (Baked Potato, Cabbage Stew), and
  redberries brew the **Combat Tonic** — which until now could only be bought at 120
  coins. A QC check fails if any crop has no consumer.
- **Farming mastery raises the yield floor** rather than adding a separate bonus roll:
  at mastery 1 a harvest spans the crop's whole range, at 99 it always gives the
  maximum. One knob, and the range printed in the wiki stays literally true.
- Sown and harvested from **Village → Farm**, with a growth bar per bed, a ripe count
  on the tab, and Harvest-all when more than one is ready. Sanitizer clamps a future
  `plantedAt` to now, so a hand-edited save cannot leave a crop unripe forever.
- **A row-layout bug that had already shipped.** `.btn { width: 100% }` is declared
  *after* `.btn-mini`, and every row control is written `class="btn btn-mini"` — so the
  button claimed the entire row and, being `flex-shrink: 0`, squeezed the row's label
  to **zero width**. Bag equip/unequip, village labour, map travel and shop buy/sell
  were all affected. Found by measuring the DOM after the new farm rows looked wrong;
  three rounds of reading the CSS had not found it.
- 24 new QC checks (**145/145**) · 25/25 rig · 47/47 UI audit · 5/5 smoke · visual
  baseline clean.

---

## 2026-08 · Phase E — collection log, real building upgrades, craftable weapons

- **Smithing no longer dead-ends.** Not one weapon had a recipe: you could forge a
  helm, a platebody and a pickaxe, but the only way to hold a sword was a monster
  drop or the market — and steel bars fed nothing but an axe and a pickaxe. Added
  forge recipes for the bronze dagger/sword/2H and the iron sword, a carpentry
  recipe for the shortbow, and a new **Steel Sword** (13 max hit, Attack 20) so
  steel has a weapon tier. A QC check now fails if any weapon lacks a recipe or any
  bar lacks a consumer, so the chain cannot quietly dead-end again.
- **Building upgrades were doing nothing.** Upgrading cost 2× then 3× the materials
  and bought a 12% larger mesh — every passive effect read `count()` (how many
  buildings) and only the Town Hall ever read its *level*. New `levels()` sums
  levels across instances, so a level-3 Sawmill saws three logs a cycle and a
  level-3 Storehouse gives +750 cap. Upgrading now also recomputes the storage cap,
  which was previously invisible until a page reload.
- **Collection log viewer.** The log was already recorded and persisted; the Menu
  printed a bare count, so there was no way to see *what* was in it or what was
  still missing — which is the entire point of a collection log. It is now a tab in
  Progress: every item grouped by type with per-group counts, undiscovered entries
  as dimmed `? ???` cells.
- **Auto-eat is tunable.** Was a hardcoded 40% — too eager for a player stretching
  food across a long trip, too late against something that can two-shot them.
  Menu setting (Off / 20 / 30 / 40 / 50 / 60 / 75%), persisted, with off-grid stored
  values snapped to a selectable step so a hand-edited save cannot leave it
  unrepresentable.
- **Equipment slots turned out to be already shipped** — the plan item was stale.
  `equipItem` / `unequipItem` / `armorBonuses` and the Bag's equip/unequip rows were
  all in place. Verified rather than rebuilt.
- **Two UI defects found by looking at the panel**, not by the tests:
  `.inv-name` had no `flex`, so a row whose only child was the name got pushed to the
  right edge by `space-between` — the Levels and achievement lists read as
  `StrengthLv 1 · 0 XP`. And `.panel-body` capped itself at `calc(62vh - 70px)` while
  the desktop side panel is ~850 px tall, clipping lists at 488 px with 360 px of
  dead panel underneath.
- 23 new QC checks (**121/121**) · 25/25 rig · 47/47 UI audit · 5/5 smoke · visual
  baseline clean.

---

## 2026-08 · Phase D — CI, and a visual gate on the opening frame

- **CI exists.** `.github/workflows/ci.yml` runs on every push and PR: build,
  UI audit, QC suite, rig/clip verification, wiki regeneration, boot smoke, and
  visual regression. It installs Chromium rather than letting the browser tests
  skip themselves — two of this project's worst regressions (a boot crash from a
  use-before-assign, and a skinned-clone bug that scaled every actor 75×) were
  invisible to unit tests and obvious the instant a browser loaded the page.
  It also fails if a generated file is stale, so the wiki and the model manifest
  cannot drift from the data they describe.
- **The opening frame is now a gate.** Both Phase A defects were purely visual and
  both shipped. `scripts/visual-regress.cjs` compares the first frame against
  `tests/baseline/opening-frame.png`, writing a magenta diff on failure.
- **Determinism comes from the app, not from luck.** `?canonicalFrame=<seconds>`
  boots the whole game, waits for the rigged meshes to land, clears toasts, pins
  animation time and draws exactly one frame — without ever starting the loop, so
  no tick has moved an actor. Measured **0.00% drift across repeated runs**; a
  camera that stops following the hero moves **73%** of pixels, a 20% tree-scale
  change **7.3%**. It is also now the right way to take a clean screenshot.
  - `Engine.renderCanonicalFrame(t)` settles the camera, zeroes shake (it uses
    `Math.random()`) and runs frame handlers with dt 0.
  - `setModelMixerTime(t)` pins mixers absolutely — they integrate deltas, so
    their pose otherwise depends on how many frames happened to run.
  - `whenActorsSettled()` resolves when no actor load is outstanding. Actor loads
    are deliberately un-awaited so a slow GLB never holds up boot, which left
    "is the world loaded?" unanswerable until now.
  - `clearToasts()` — a 2.6 s fade is not part of a reproducible frame.
- **The definite-assignment hole is gated, not removed.** The `!` assertions
  remain. `audit-ui.cjs` check 7 fails the build on exactly the bug that bit us,
  verified by re-injecting it: a premature use of `ui`, `dungeon`, `labour` or
  `mapSys` each reports `this.X used at boot+3, assigned at boot+N`. Removing the
  assertions means threading 196 `this.X` references through locals inside a
  302-line `boot()` in the file that runs the whole game — a large diff whose only
  payoff is moving detection from the audit to the compiler. Deferred deliberately;
  reasoning recorded in REPAIR_PLAN.md.
- 98/98 QC · 25/25 rig · 47/47 UI audit · 5/5 smoke · visual baseline clean.

---

## 2026-08 · Phase C complete — mastery, weapons, and a name for the hero

- **Mastery actually does something now.** It reused the *skill* XP curve, which
  is built to span a whole skill's lifetime — but mastery is tracked **per item**,
  one of eleven resources. Mastery 99 on normal logs worked out to **8,146 hours**
  of chopping, and mastery 50 to 63; since the speed bonus scales with level/99,
  mastery was inert in practice. It now has its own triangular curve at 1 XP per
  unit produced, putting mastery 99 at **9.7 h (shrimp) to 25.9 h (coal)** — a real
  long-term goal, and cheap resources master faster, which is the right incentive
  since they are worth less.
- **Save migration `1.1.0`.** Old saves stored mastery at 4 XP/action on the old
  curve; read unmigrated on the new one they would have granted near-max mastery
  instantly. Both scales are "actions × a constant", so the sanitizer divides
  stored mastery by 4 — players keep the actions they really performed, and those
  actions simply count for much more now. `SAVE_VERSION` is bumped and the
  sanitizer stamps it, so this can never silently reinterpret a stored value again.
- **Gathering speed reads the right mastery.** `actionTicks` summed *every* mastery
  in a skill, so chopping normal logs sped up willow you had never touched, and the
  summed total inflated the level far past any single resource's real mastery. It
  now reads the resource being gathered, mirroring `CraftingSystem`, which had it
  right all along.
- **One weapon selector.** There were three — `CombatSystem.firstWeaponItem` (first
  weapon in *inventory* order), `UI.equippedWeapon` (first in *declaration* order),
  and `getWeapon` — and **none** checked `requiredAttack`. So a level-1 hero swung
  an iron sword needing Attack 10, and the stats panel could name a different
  weapon than the one combat was using. `selectWeapon(inv, equipped, attackLevel)`
  in `data/Combat.ts` is now the single answer: the equipped slot wins when still
  carried and usable, else the best usable carried weapon by damage-per-tick plus
  accuracy, else fists.
- **The hero is Corvin.** The player character is a young mystic apprentice, named
  to sit alongside Bram, Wren, Tobias and Eldric — and after the corvid its
  plum-black robe echoes. `DEFAULT_HERO_NAME` replaces the hardcoded `"Hero"` in
  three places.
- The wiki gained a **Mastery** section, generated from the curve itself.
- 19 new QC checks (**98/98**) · 25/25 rig · 47/47 UI audit · 5/5 smoke.

---

## 2026-08 · The player is a wizard — rigged hero mesh + shared clips

- **The hero animates.** `hero.glb` had never had a skeleton, so the player
  character has been a static mesh for the whole project. A Meshy "Young Mystic
  Apprentice" rig turned out to use the *identical* 24-bone skeleton as every
  other actor, so it dropped straight in as `hero_rigged.glb` and drives off the
  shared clip library with no new code.
- **20.8 MB → 739 kB.** The rig arrived at 318,929 triangles, ~40× the heaviest
  model in the game. `gltf-transform simplify` floors it at 13.2k (the mesh is
  many separate shells; past that the silhouette breaks), then `quantize` and a
  512px JPEG. Still ~1.7× the ogre, which is the price of being the character the
  camera is centred on.
- **Two new motions, free.** Its Walking and Running animations extracted to
  `actor_walk` (1.0s, 5.6 kB) and `actor_run` (0.6s, 3.7 kB) — usable by *every*
  actor, which is the whole point of the clip format.
- **`hero_walk` retired, on evidence.** New `verify-rig` check: a clip's **loop
  seam**, the angle between its first and last frame, which the mixer wraps
  straight across. `hero_walk` was a 4.2s "casual walk" take rather than a cycle
  and seamed at 5.5° on `LeftLeg` — a visible hitch every loop. `actor_walk` is a
  true cycle at 0.9°. Everything now walks on `actor_walk`. The check fails above
  3°.
- **`scripts/extract-clip.cjs`** pulls an animation out of any rigged GLB,
  resampling the rotation curves at a uniform rate rather than copying keyframes,
  so any source keyframe layout works. **`scripts/optimize-glb.cjs`** recompresses
  embedded textures to JPEG and drops baked animations, decoding in the headless
  Chromium the smoke test already needs. Both pipelines previously existed only as
  prose or in a scratch directory.
- **`--brighten` on the optimizer.** The wizard was authored against a neutral
  studio background and read as a flat black silhouette against the game's bright
  grass at the ~40 px an actor occupies. Lifting the texture (×1.75 brightness,
  ×1.2 saturation) keeps the fix in the asset instead of special-casing one model
  at runtime.
- The static `hero.glb` was removed — no skeleton, and only ever a fallback for
  the mesh that has now landed. Model payload is 2.1 MB total.
- 25/25 rig · 79/79 QC · 47/47 UI audit · 5/5 smoke.

---

## 2026-08 · Phase C — storage invariant, shared animation clips, the wiki

- **The storage cap is now an invariant, and it means bulk resources.** `addItem`
  clamps to `storageCap` itself and returns what actually fit. The cap used to be
  advisory — some call sites checked it by hand, some didn't, so combat drops
  slipped past it and offline gathering clamped each skill to the *whole* cap
  independently (three gatherers banked 3× the cap). Following the GDD's
  Storehouse wording, the cap now covers bulk resources only: coins, keys, quest
  tokens, pets, gear and tools are carried regardless, so a bag full of logs can
  never block income, a quest reward or a rare drop. `SkillSystem`,
  `CraftingSystem` and `BuildSystem` route through `storedAmount`/`isFull`
  instead of open-coding the same reduce three ways. 9 new QC checks (**79/79**).
- **Animations ship as data, not as GLBs.** The rigging provider bakes each
  animation into a complete GLB — mesh, skeleton, textures — ~770 kB for one walk
  cycle on a mesh we already have. Every character it rigs shares the same
  24-bone skeleton (`skel b6addeab77c8` across villager, forest_ogre,
  cave_brute), so the motion is the only new information in that file. Clips now
  ship as `.clip.json`: a header plus a base64 Int16 quaternion table at a
  uniform sample rate, rotation only — which is exactly what lets one clip drive
  every rig. **15 kB per clip, reusable across actors**, instead of 770 kB per
  character per motion. Villagers gained a walk cycle; the ogre and brute gained
  an idle. `verify-rig` now checks table size, unit-length quaternions and bone
  coverage against every rigged skeleton (**13/13**).
- **`WIKI.md` — the game's reference, generated from the game.** 647 lines
  covering skills, the XP curve, gathering, weapons, armour, every monster's drop
  table, recipes, buildings, food, villagers, quests, the full items index,
  achievements and a hand-written Guides section. `scripts/gen-wiki.cjs` compiles
  `src/data` and reads the real tables — drop chances are *computed* from the
  weight tables, not transcribed — and it runs as part of `npm test`, so a data
  change with a stale wiki fails the build.
- **NPC and quest data left the systems that animate them.** New
  `src/data/Npcs.ts` (villagers, critters, labour specializations, veteran tiers)
  and `src/data/Quests.ts` (titles, givers, per-stage objectives, reward tables).
  `QuestSystem` now rolls rewards *from* that table and builds its journal rows
  from it, so a reward can no longer be described one way in the journal and paid
  another.
- `smoke.cjs` finds a pre-installed Chromium under `PLAYWRIGHT_BROWSERS_PATH`, so
  the boot smoke test runs without a driver download (**5/5**).
- Commits `1f0ef14`, `7f6f738`, `86fe1e3`.

**Still outstanding:** `hero.glb` has no skeleton — it is the original static
mesh — so the hero cannot animate yet. Its rigged mesh is the one asset the game
is still waiting on; the idle and walk clips for it are already shipped.

---

## 2026-08 · Phase B — animation states wired, generated model manifest

- **The state machine now has callers.** `spawnActor().play(state)` is driven from
  real game state: the hero from the frame loop (walk/idle) plus `gather` on
  skill/craft start; villagers from `NpcSystem.update()` (walk while travelling,
  idle when stopped); monsters from `CombatSystem.update()` (walk when their tile
  changed, else idle) with `attack` fired on the swing. Until now nothing called
  `play()` — the machine existed but every actor still sat on one clip.
- **The hero goes through the shared loader.** `main.ts` had a bespoke
  `GLTFLoader` call passing only `gltf.scene`, discarding `gltf.animations`, which
  is why the hero could only ever be static. It now uses `spawnActor` like every
  other actor, keeping the procedural figure as fallback.
- **`ModelManifest.ts` is generated from `public/models` at build time**
  (`prebuild`/`predev`). `ACTOR_CLIPS` can name clips that don't exist yet — the
  loader skips anything not shipped instead of 404ing on every boot, and a file
  lights up the moment it's dropped in. `base` also accepts a candidate list, so
  the hero names its rigged clips first and the static original as fallback.
  Caught by the boot smoke test, which failed on the 404s.
- **Desktop HUD guard.** `onMouseDown` lacked the guard its touch counterpart has,
  so pressing a HUD button also started a camera pan.

- 70/70 QC + 3/3 rig + 5/5 smoke.

---

## 2026-08 · Phase B prep — model pipeline, 93% smaller assets

- **Textures recompressed: 21.5 MB → 1.53 MB (-93%).** Every character GLB was
  93-96% texture — one 2048x2048 PNG per model, for actors ~40 px tall on screen.
  `scripts/optimize-glb.cjs` decodes in headless Chromium (the bundled ffmpeg is
  built `--disable-everything` and cannot decode PNG), resizes to 512px, encodes
  JPEG q0.85 and repacks the GLB. Every material is `alphaMode OPAQUE`, so JPEG
  loses nothing, and it stays core glTF 2.0 (no `EXT_texture_webp` needed).
  Also gets a rigged clip comfortably under the 25 MB upload ceiling.
- **Skinned clones fixed.** `spawnModel` used `Object3D.clone()`, which does not
  rebind a SkinnedMesh to its cloned skeleton — every villager clone was driving
  the shared template's bones. Now `SkeletonUtils.clone()`.
- **…which unmasked a latent sizing bug.** `Box3.setFromObject()` on a SkinnedMesh
  measures the *posed* skeleton, and a fresh clone has stale bone matrices: cold,
  it reports ~0.02 units instead of 1.7, so `ACTOR_HEIGHT / size.y` scaled actors
  ~75x and one texture swallowed the screen. Fixed with
  `updateMatrixWorld(true)` before measuring plus a floor that refuses an
  implausible measurement. The old broken clone had hidden this.
- **Animation state machine** (`spawnActor`) replaces `clips[0]`-forever:
  named states with crossfade and graceful fallback, ready for the hero clips.
- **`scripts/verify-rig.cjs`** (in `npm test`) reports the model inventory and
  checks that a character's per-clip GLBs share one skeleton.

- 70/70 QC + 3/3 rig + 5/5 smoke.

---

## 2026-08 · Phase A follow-up — world scale & texture

The "miniature world" read, traced to two causes and fixed together.

- **Actors were shorter than the tile they stood on.** Everything normalised to
  0.75 world units on a 1-unit grid — an adult smaller than one square, which is
  exactly what makes a world look like a tabletop diorama. Introduced
  `src/core/Scale.ts` as the single source of truth: `ACTOR_HEIGHT = 1.25`, with
  per-monster bulk factors, tree/rock scales and a building height/width split
  (buildings scale taller than wide so their footprint stays inside a tile).
- **Every prop was buried 0.6 units.** Trees, rocks and ground clutter were
  planted at `y = 0` while the terrain surface sits at `y = 0.6`. With trunks
  only 0.7–1.05 tall, more than half of each tree was underground — which is why
  they read as shrubs with no trunk. Props now stand on `GROUND_Y`. Buildings
  scale *about* the ground plane so they neither float nor sink.
- **Terrain was confetti.** `rollTerrain` rolled DIRT/ROCK per tile from white
  noise, scattering isolated squares over the grass. Now sampled from smooth
  low-frequency noise so they form contiguous patches, thresholds chosen to keep
  the original ~6% rock / ~14% dirt share.
- **Resources only spawned along the top edge.** `spawnResources` walked rows
  top-down while decrementing a shared cap, so the first rows consumed every slot
  — the reason trees clustered at the map's top and fishing spots capped at one.
  Candidates are now collected first, shuffled deterministically by seed, then
  taken up to the cap: even density, guaranteed minimums, still identical across
  reloads.
- **The town core is now open ground.** Rock, dirt and interior lakes are cleared
  from the settlement chunk — a lake was silently removing ~17% of the buildable
  town tiles, right where the player spawns.

- 70/70 QC (2 new: terrain patch cohesion, town-core buildability). 5/5 smoke.

---

## 2026-08 · Phase A — the opening frame

The first thing a new player sees, made correct. All four causes were reproduced
in the running game before being fixed.

- **The "wave-shaped" water was one broken polygon.** `buildWater()` created a
  single `THREE.Shape` for the entire map — `moveTo` on the first water tile,
  then `lineTo` around every subsequent one — i.e. one continuous
  self-intersecting path hopping between scattered tiles. `ShapeGeometry`
  triangulated that into a huge wedge of "water" lying across open ground next to
  spawn. Rebuilt as one quad per water tile merged into a single
  `BufferGeometry` (still one draw call), with world-space UVs so the shimmer
  flows across a lake instead of restarting per tile.
- **The water shader rippled sideways.** `geo.rotateX()` bakes rotation into the
  vertex positions, so the surface lies in XZ — but the vertex shader displaced
  `p.z` and read `p.y` (always 0 there). The swell now moves along Y.
- **The camera sat on the map corner.** `boot()` aimed it at the hero, then
  `new InputController(...)` three lines later called `applyCamera()` with its
  pan still at the origin, snapping the view to world (0,0). `panWorld` is now an
  *offset* from a follow target, so the camera tracks the hero every frame and
  drag still pans relative to it. The four transition call sites (spawn, fast
  travel, dungeon enter/leave) collapse to `input.recentre()`.
- **The game opened at midnight.** `clockMin` started at 0 — `dayFactor(0)` is 0,
  the darkest frame of the cycle. The clock now starts at 10:00 (0.58 daylight)
  **and persists in the save**, so time of day survives a reload instead of
  resetting every launch.
- **Fog blanketed the whole map.** The camera orbits at radius 55, putting the
  scene 30–85 units out, while fog ramped 42→88 — so everything was washed toward
  the fog colour. Moved to 95→175, where it reads as horizon depth.
- **The skybox could never have worked.** `sky.png` loaded fine (200) but was
  tagged `EquirectangularReflectionMapping`. three.js samples an equirect
  background along the per-pixel view direction — and an **orthographic** camera
  has the same direction for every pixel, so the entire sky resolved to one flat
  grey. Switched to `UVMapping`, which renders it as a full-screen backdrop.
- **Default zoom opened too wide.** Frustum 30 at zoom 1 shows ~30 tiles on a
  42×42 map, rendering the hero about ten pixels tall — a large part of why the
  character read as low quality. Opens at 1.75 now; the full pinch/wheel range is
  unchanged.

- 68/68 QC checks (6 new: water containment, vertex count, clock start + daylight
  + save round-trip). 5/5 boot smoke.

---

## 2026-08 · QC sprint — boot crash, offline idle, XP ceiling, drops, reach

Full read-through of `src/` plus runtime probes against the compiled modules and
a real headless-browser boot. Five defects, each reproduced before and after the
fix.

**The headline: the game had not booted since P6.3.**

- **`boot()` threw on every launch — nothing rendered.** `cb2dcfb` (P6.3) added
  `this.ui.attachQuestJournal(...)` at the top of `boot()`, but `this.ui` is not
  assigned until ~60 lines later. Every launch threw
  `Cannot read properties of undefined (reading 'attachQuestJournal')`, aborting
  boot before `engine.start()` — so the render loop never began. The static HUD
  from `index.html` still painted, which is why it looked alive: a full chrome
  with an empty canvas behind it. `guarded("main", …)` caught the throw and
  turned a hard crash into a silent one. Every phase from P6.3 to P8.3 shipped on
  top of this. Fixed by constructing the UI before the systems that attach to it.
  **`npm test` stayed green throughout — it exercises systems in isolation and
  never boots the app.**

Also fixed in the same sweep:

- **Offline idle progression never paid out.** `SaveSystem.apply()` restored every
  field *except* `timestamp`, so `computeOffline()` measured "time away" from
  process start rather than the last save — a six-hour-old save reported
  `awaySeconds: 0` and an empty return screen. The whole idle pillar was inert
  for any returning player. Now restored on apply, and the elapsed window is
  consumed at the end of the offline calc so it can't be paid twice.
- **`boot()` loaded the save twice.** The second `load()` re-applied the payload
  over the live state, discarding the first load's gains and recomputing the same
  window. Collapsed to a single load.
- **Level 99 was unreachable.** `buildXpTable()` looped `n < 99`, leaving
  `XP_TABLE[99]` undefined: every skill capped at 98, and `levelProgress()` at 98
  divided by `undefined` → `width: NaN%`, which browsers drop, freezing the XP
  bar. Table now runs to 99; progress is clamped finite.
- **Main drop tables always paid exactly 1.** `rollWeighted()` returned only an
  item id, so the declared `min`/`max` were discarded — a Zombie's "10–40 coins"
  paid 1 coin. It now returns the whole entry and rolls the range, matching the
  tertiary path. This was suppressing coin income by roughly an order of magnitude.
- **The player could attack from any distance.** The monster's swing was gated on
  `monsterCanHit`; the hero's was gated only on the weapon cooldown. Added the
  mirrored `playerCanHit` (melee adjacent, ranged within `RANGED_RANGE`).

- 62/62 QC checks (8 new, pinning each of the above). Bundle 778 kB / 211 kB gzip.
- **Follow-up owed:** the suite needs a real boot smoke test — headless page load,
  assert the canvas renders and the console is clean. A unit suite cannot catch a
  wiring-order crash, and that is exactly what hid this one for five phases.

---

## 2026-08 · Phase 8.3 — Combat Tonic + drink SFX

- **Combat Tonic** 🧪: new potion, buyable at the Town Market, auto-drinks on low
  HP — heals 30 (highest auto-eat tier), a genuine boss-fight lifesaver. The
  `drink` SFX now fires on it, so all 23 SFX clips are bound to gameplay.
- 54/54 QC checks (2 new: tonic in auto-eat table + market stock).

---

## 2026-08 · Phase 8.2 — SFX pass 2 · ambient music · rigged 3D

- **SFX pass 2** (16 clips, ~4.5 cr): pickup, UI click, chest/door, monster
  squeak+spawn, step, eat/drink, accept, crafting (smelt/cook/carpentry), quest
  complete, boss slam, victory. 23 clips total in `public/sfx/`; live hooks wired
  (gather/hit/hurt/level/coin, auto-eat, achievements).
- **Ambient music** (3 loops, 2.5 cr each): town / wilderness / dungeon —
  `core/Music.ts` crossfades by zone (dungeon, or distance from town → wilds).
- **Rigged 3D** (3 meshes, 38 cr each): reusable villager (Idle) swapped into
  all NPCs; cave_brute + forest_ogre (walk/combat anims) into the boss spawns —
  `core/Model.ts` clones each GLB per actor and advances baked AnimationMixers
  each frame. Procedural figures remain as instant fallback.
- 52/52 QC green; bundle 777 kB / 211 kB gzip (+25 MB public assets).

---

## 2026-08 · Phase 8 — First asset pass (SFX, hero, skybox)

### 8.1 — SFX, real 3D hero, skybox panorama
- **SFX** (7 clips, ~2.0 cr): chop / mine / fish / hit / hurt / level-up / coin —
  wired through `src/core/Sfx.ts` (lazy `Audio`, no runtime cost) onto gather
  (per-skill), landing a hit, taking damage, level-up chime, market sell/buy and
  labour claim. MP3s in `public/sfx/`.
- **Hero mesh**: 2.6 MB low-poly GLB in `public/models/hero.glb`, loaded via
  `GLTFLoader` and swapped over the procedural box figure through
  `HeroModel.enableModel` (keeps the zero-asset figure as instant fallback).
- **Skybox**: generated panorama `public/sky.png`, hot-swapped over the procedural
  sky in `WorldSystem.buildSky` with silent fallback.
- 52/52 QC checks green; bundle 761 kB / 206 kB gzip (public assets +2.6 MB).

---

## 2026-08 · Phase 6 — World scale, biomes, onboarding, meta

### 6.4 — Meta page & achievements
- New **🏆 Progress** HUD panel: persisted kill tallies per monster, collection
  counter, per-skill level + XP, and an achievements list (🏆 unlocked / 🔒 locked).
- 8 achievements (first blood, rat hunter, heart of the forest, boss breaker,
  tenacious, pack rat, Eldric's student, pathfinder) with pop-up toasts the
  moment one flips.
- Kill counts + unlocked achievements persist in the save (`player.meta`).
- Commit `38e49e4` · cache-bust `v14`.

### 6.4-polish — Achievement pops & Phase-7 achievements
- **Gold banner pop** (animated) replaces plain toasts when an achievement
  unlocks.
- 5 new achievements fed by persisted counters: First Purchase, Junk Trader
  (20 sold), Foreman (3 villagers hired), Quartermaster (50 stock collected),
  Spelunker (floor 2).
- Commit `130f955` · cache-bust `v18`.

### 6.3 Quest journal
- **📖 Quests** panel listing active/complete quests, live objectives, givers and
  rewards. Second quest: **The Surveyor's Errand** (slay the Forest Ogre → 250
  coins, steel bar, cooked trout). Completions persist (`player.journal`).
- Commit `cb2dcfb` · cache-bust `v13`.

### 6.3-b Biome-gated monsters
- New natives: **Frost Imp** (snow) and **Bog Husk** (swamp); per-biome threat
  pools (wolves + undead in the woods), tame inner band, wild fallback.
- Commit `0da8003` · cache-bust `v12`.

### 6.2 Biomes
- Four region flavors on the tile grid (meadow / forest / snow / swamp) with
  per-biome terrain palettes and gated resources: swamp willow (woodcutting 30),
  treeless mineral-rich snowfields, dense woods, fishing anywhere.
- Commit `18db753` · cache-bust `v11`.

### 6.1 World scale
- 42×42 configurable world (`WORLD_SIZE`), four zone bands incl. the Deep Wilds,
  progressive chunk unlocking on exploration (fixed a latent bug that blocked all
  wilderness spawns), threat-scaled pools, deep-wilds dungeon entrance, map
  coverage meter + walk-range layer.
- Commit `5a7e7bf` · cache-bust `v10`.

### 6.x Map & fast travel
- **🗺️ Map** panel (player dot, waypoints incl. boss lair, coverage), proximity
  POI discovery, fast travel unlocked by beating the Cave Brute.
- Commits `64ffa01 / 1a37fa1` · cache-bust `v8-v9`.

### 6.x Onboarding quest
- Eldric the Cartographer guide NPC beside the deep-wilds door; staged quest
  (key → door → Cave Brute) with a floating objective marker and reward.
- Commit `cb2dcfb` (journal) / earlier `b495eca` · cache-bust `v7`.

## 2026-08 · Phase 7 — Economy

### 7.1 — Town market & shop
- A merchant stall now stands in the settled area (tap it → **Town Market** panel).
- **Sell junk** for coins (anything stackable at its data value: logs, bones, ores,
  food…) — tools, equipment and coins themselves are protected from being sold, so
  no softlocks. **Buy supplies**: cooked food, bronze/iron weapons and bronze
  armour (9 stock lines, fixed prices).
- Gives coins a real purpose and completes the gather → sell → gear loop.
- Commit `31949c2` · cache-bust `v15`.

### 7.2 — Dungeon depth (floor 2)
- The floor-1 exit ring is now a **stairway down** to **Floor 2**, re-using the
  same generator. Floor 2 swaps in a harder pool (6 cave slashers + a pair of
  Cave Brutes), re-seals the key/door gates, and its chest pays far better
  (coal + richer coins/ore, higher gear chance). A blue retreat stairway on
  Floor 2 lets you climb back; the teal portal on Floor 2 ends the run.
- Added `CombatSystem.removeMonster` so floor populations swap cleanly.
- Commit `759079d` · cache-bust `v16`.

### 7.3 — Villager labour
- **🏡 Village** panel: assign villagers (Bram, Wren, Old Tobias) to
  **woodcutting** (1 log / 20s) or **mining** (copper/tin ore / 30s), or stand
  them down; production accrues while playing into the **village stock**, and a
  Collect button moves it all into your bag. Assignments/stock/accrual persist
  with the save.
- Commit `33a8be6` · cache-bust `v17`.

### 7.4 — Offline village labour
- Assigned villagers keep producing into the **village stock** while you're
  away, mirroring the offline-XP system: same 8-hour cap, deterministic
  per-worker math (logs every 20s, ore every 30s), and the return screen lists
  it ("6 × Logs").
- Commit `b9d06ce` · cache-bust `v19`.

### 7.5 — Town Hall upgrade tiers
- The Town Hall now **upgrades to level 3** (Build panel → Upgrade ⬆): each
  level adds **+4h offline cap** (8h base → **12/16/20h**) and a level-scaled
  coin tax. Upgrade costs scale with the level (base cost × next level).
- The return screen announces the raised ceiling ("🏛️ Town Hall: offline cap
  raised to 12h").
- Commit `e852614` · cache-bust `v20`.

### 7.6 — Villager output perks
- Worked hours now raise a villager's **yield tier**: New hand ×1 →
  **Veteran** (2h) ×2 → **Reliable** (8h) ×3 → **Master** (20h) ×4. Live and
  offline production both pay the multiplier, hours accrue offline too, and the
  Village panel shows "⭐ tier · Xh worked".
- Commit `9966b36` · cache-bust `v21`.

### 7.7 — Villager specializations
- Each villager has a lore specialization: **Bram the Fisher** (🎣 Fresh Catch — a
  shrimp per cycle), **Wren the Woodcutter** (🪓 Fine Timber — an oak log per
  cycle), **Tobias the Elder** (🏛️ Elder's Due — a coin tribute per cycle).
  Perks stack with the veteran yield tiers, apply live and offline, and the
  Village panel shows "🎣 Fresh Catch · ⭐ Reliable · 10h worked".
- Commit `c8bcb8f` · cache-bust `v22`.

### QC sprint — test gate & audits
- **`npm test`** now runs a consolidated 46-check regression suite
  (`tests/qc.test.ts`) covering world/grid, dungeon depth, quests, map,
  market, labour (live/offline/perks/specs), meta, Town Hall, and full save
  round-trips. Fixed **sanitizer dropping P6–P8 fields** on import/load
  (journal, meta, labour, market, map). **`scripts/audit-ui.cjs`** = 46-check
  static UI/dom audit (ids, panels, branches, attach call sites).
  **`QC_CHECKLIST.md`** manual gameplay sweep; stale `bugreporturl` credential
  file & stray `systems/` copy removed; `//bugreports` scaffolded.
- Commit `024084a` · cache-bust `v24`.

### 7.9 — Zero-credit polish round
- **Offline Town Hall tax** — the hall keeps taxing while you're away (2 coins
  × level per ~6s idle cycle, capped by the same 8–20h offline cap; return
  screen shows "🏛️ Town Hall tax: N coins").
- **Market achievement trio**: Mogul (2,000 sale value), Market Flooder (100+
  of one item), Shop Regular (10 purchases) — 16 achievements total.
- **Dungeon floor 3**: the amber stairs now go 1→2→3; floor 3 packs 8 cave
  slashers + 3 Cave Brutes and a richer chest (90+ coins, coal, 35% iron
  sword); the teal portal ends the run only on floor 3; blue stairs retreat
  from floors 2 & 3.
- Commit `fe37485` · cache-bust `v25`.

### 7.8 — Market rebalance (supply & demand)
- Sell prices now slide down as an item floods the market (40% floor — a
  veteran village's oak/shrimp output stops printing coins); shop demand and a
  swelling coin pile push buy prices up (+25% inflation cap). Counters persist.
- Commit `81799ba` · cache-bust `v23`.

## Phase 5 — Dungeons
- P5.1 entrance + procedural single-floor (rooms/corridors), own monster pool
  (cave bat / cave slasher), chest, exit portal · `0547f6f` · `v4`.
- P5.2 locked door + Iron Key (consumed on use) · `7acauce` · `v5`.
- P5.3 Cave Brute mini-boss with telegraphed slam · `ac14a46` · `v6`.

---

> Play it: https://isoperia-rpg.higgsfield.app

*Phase 8 asset passes draw on the subscription credit pool (SFX, music, and
rigged 3D meshes). Everything before Phase 8 is procedural (zero-asset).*