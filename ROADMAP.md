# Isoperia — Prioritized Roadmap (6 phases)

> Companion to `README.md` / the GDD. Grounded in the current codebase state (M1–M3
> mechanics live: combat, gather/build/craft, inventory, skills, save/load, procedural
> world). Ordered to maximize "this feels like a living world" value per unit of work,
> front-load the risk, and respect the rule: **mechanics before assets/sound**.

## Legend
- **Priority** — 1..3 (1 = do first, highest value-per-effort).
- **Effort** — dev sessions (@ ~1 focused session ≈ a few hours; single dev).
- **Risk** — `LOW` / `MED` / `HIGH` and what could bite.
- **Depends** — `↑ phase.N` (in this phase) and `→ phase.X` (needs another phase),
  then `R` (releases the work to others).
- **DAG** — the work items form a dependency graph; the "execution order" below is one
  valid topological order (critical path).

## Global execution order (critical path first)
```
En  (enabling enabler, do first)
P1.1→P1.2→P1.3→P1.4            (game-feel, quick win)
P2.1→P2.2→P2.3→P2.4            (tool gating feeds everything downstream)
P3.1→P3.2→P3.3  and  P4.1→P4.2  (can run in parallel once P2 done)
P5.1→P5.2→P5.3                  (needs P4 early)
P6.1→P6.2→P6.3→P6.4              (last: onboarding references the rest)
```

---

## Enabling groundwork (before any phase)

**E.1 Test harness + a11y fail-visible** *(Low effort, L risk)*
- Promote the headless harness used this week into `tests/` (chop/path/save roundtrip +
  the UI panel audit), wired to `npm test`.
- **Why:** the late `settings` bug was a silent render crash; the harness already
  caught it. Keep it green or the loop stalls.
- **Depends:** none. **Releases:** every later phase.

**E.2 Data-driven content manifests** *(Med effort, L risk)*
- Move tools/monsters/recipes/buildings/xp into a schema'd manifest (already partly
  data-driven: `data/*.ts` is close). Add a `getTool(name)` lookpoint and a
  content-migration bump so saved games survive adding fields.
- **Releases:** P2 (tools), P4 (monsters), P5 (bones), P6 (biomes) all become data, not code.

**E.3 · Consistent error surfacing** *(Lowest, L)*
- Standardize on the `justMe` pattern (openPanel guard) for all render/tick paths.

---

## Phase 1 — Interaction veil  (Priority 1 · Med-low effort · `L`)
Goal: make the world answer "I see that thing, I can do that" — the biggest single jump
in feeling like a real place. Pure three/UI, no new sim — small and fast to ship alone.

| # | Work item | Depends | Risk |
|---|-----------|----------|------|
| 1.1 | Tap target highlight: HUD "targeting reticle" + in-world outline (on tapped node/monster/tile) | — | L |
| 1.2 | In-world name labels above the tapped block (nodes/monsters) — 3D bob text | 1.1 | L |
| 1.3 | Action chip over the target ("Chop Oak", "Gather copper", "Attack goblin", "Walk") + tap-another-to-cancel | 1.1 | L |
| 1.4 | Obstacle/walk-to feedback (toast "Can't reach there" when blocked) | 1.1 | L |

**Effort:** ~3–4 days total. **Depends:** E1,E3 only. **Releases:** makes P2 (tool req labels),
P4 (monster targeting), P6 (quest hints) obviously better.

---

## Phase 2 — Tools & gear: a real progression loop  (priority 1 · MED · effort MED)
Goal: give the XP curve something to spend LEVEL on (OSRS-era "use better tool to do
bigger things"). Directly unlocks P5 reward gating and P6 biome gating.

2.1 **Tool tiers** (axe/pick/rod: bronze→steel→mithril): itemTier field on tools, `+speed/positive`
   check in `SkillSystem`; worn in an arm slot. *(L)* dep: E2
2.2 **Equip system** — Slots: Head/Torso/Legs/Weapon/Offhand; `INVENTORY` gets an `equipped`
   map; UI: long-press item → Equip; stat buffs (Str/Def etc.) actually land on combat stats.
   *(M — save/mig returnable; dep: P2.1, E1 saves test)*
2.3 **Gathering speed & tool gating in UI** — tooltip shows "needs Steel axe"; XP curve
   smoothing for the lvl-1..15 band so newcomers feel progress (tune `XPTable`/delays).
   (L) dep: P1.3
2.4 **Storage**: a buildable storage bin (uses existing BuildSystem) raising `storageCap`
   beyond 500 so late-gather isn't "pouch full" constant. (L) dep: P2.2
2.5 **Market/Do-trade** — optional, defer to P6.

**Effort:** ~5–7 days. **Risk:** `MED` (balance/uproot + save-compat). Mitigate: save
migration covered by E2/E1; keep tier diffs modest; test with fresh + existing save.
**Releases:** P3 (NPCs can hand you tier goals), P5 (dungeon loot tiers), P6 (biome gating).

---

## Phase 3 — Living world  (priority 2 · effort MED+ · effort mod)
Goal: the settlement is a place (day/night, villagers, ambient life). Standalone but
benefits from P1 labels for NPC talk.

3.1 **Clock & day/night**: `GameState.time` (dayCount + clock), ambient dir-light tint,
   UI sun/moon icon. (L) none
3.2 **Village NPCs**: roster [Mayor, Fisher, Woodcutter...]. `NPCState`: schedule (stand/
   walk/chat), usage of existing A* to move tile by tile, small talk lines, a "Talk"
   interaction added to P1 action system. (M — scope; keep to 3–5 NPCs, schedule wheel).
3.3 **Ambient wildlife** (birds/rabbits w/ simple wander) & extra sky variation. (L)
3.4 **Soon** integration: villages use your built settlement (fire → cooking speed).
   (M — links BuildSystem + Crafting). Nice-to-have; can be P6.

**Effort:** ~8–10 days. **Risk:** `MED` (NPC sim scope + perf on mobile). **Mitigation:**
limit NPC count, re-use A*, keep agents shared on a fixed tick (already 600ms world).
**Depends:** → P1.3 label (cheap), not required — can be optional. **Releases:** nothing
hard, but gameplay-feel compounding.

---

## Phase 4 — Combat depth  *priority 2 · effort MED · risk med/high*
Goal: fighting reads as a real fight — aggro, movement, ranged, bosses.

4.1 **Aggro & chase**: monster detection radius → A* chase to range, leash via distance;
   idle wander. (M; careful with balance + safety) dep E2
4.2 **Ranged & magic combat**: ranged weapon type, projectile system (simple SpriteMesh/
   instanced bolts), range check, kite/strafe. (M) dep 4.1 + P2.2 weapons
4.3 **Boss archetype**: multi-phase HP, reachable telegraphs (allocate ground shape that
   hurts), enrage>35%. (H) dep 4.2
4.4 **Feedback**: hit stop, camera kick, floating dmg already in place — add stagger
   delay, kill burst, brief screen flash at crit.

**Effort:** ~7–9 days. **Risk:** `MED→HIGH` (balance + chase could frustrate on mobile).
**Mitigation:** aggro only when within radius & always-mitigated with a retreat; safe
zones. **Depends:** P2.2 (weapons), E2. → R P5 bosses.

---

## Phase 5 — Dungeons (instanced floors)  *priority 2 · epic · risk high*
Goal: deliver the GDD "dungeons" milestone with genuine "go deeper, get richer".

5.1 **Dungeon archetype**: a 2–4 chamber floor from the Grid (door/switch architecture),
   entrance from a door object on the map; separate RoomState + reset. (M) dep E2
5.2 **Locked-door + key, miniboss door, treasure chest, respawn-on-death**. (M) dep 5.1, P4.1
5.3 **Rewards & gating**: loot table (tiered by P2 tools), unlock token, boss variant
   tiers. (L) dep 5.2, P2
5.4 (stretch) **Stairs down / difficulty floors**.

Effort: ~8–12 days. Risk: `HIGH` (procedural layout + goals loop bugs, save). Mitigation:
rebuild on A*/tileset (exists), strict RNG, reset on session end, no un-save.
Depends: hard on P4 (boss AI, aggro) + P2 (loot) + P1 (visualize locked doors).
→ R6 content feed.

---

## Phase 6 — World scale & onboarding  * priority 2-3 · effort · risk med*
6.1 **Larger/configurable world** (32×32 & beyond) with chunk tests; walk-range panel.
   (M; revisit path cost/perf) dep E1
6.2 **New biomes** (forest, snow, swamp) gated by P2 tool/skill + P4 threat; new tilesets
   mercator-style. (M)
6.3 **Quests & tutorial intro** (an "Okay starter quest chain" + Journal). Given P1–P5
   affordances, teach 1: move (already), 2: collect tool + chop (P2), 3: aggro (P4),
   4: first dungeon (P5). (M) depends content in P2/P4/P5.
6.4 **Collection log / mastery polish** into a real Meta page + achievement pop.

Effort modelling: ~10–14 days. Risk `MED` (large scope, scaling perf). 
Depends: P2, P4, P5. Final phase — the seasoning on the rest.

---

## Dependency / risk summary (quick table)

| Phase | Name | Priority | Effort(days) | Risk | Needs before | Unlocks |
|---|---|---|---|---|---|---|
| 1 | Interaction veil / feel | 1 | 3-4 | Low | E3 | P2 label; P6 hints |
| 2 | Tool & gear progression | 1 | 5-7 | Med | P1, E2 | P3 goals, P5 loot, P6 biomes |
| 3 | Living world (NPCs,day) | 2 | 8-10 | Med | P1 | flavor compounding |
| 4 | Combat depth | 2 | 7-9 | Med-High | P2 | P5 bosses, P6 threat |
| 5 | Dungeons | 2 | 8-12 | High | P4, P2 | P6 quests |
| 6 | World scale + onboarding | 3 | 10-14 | Med | P2,P4,P5 | store-front, meta |

## Ordering policy
1. Do **E1/E2** first (cheap insurance + data).
2. Ship **P1 start-to-finish** (tight, visible, low risk freedom).
3. **P2** (progression) next: it releases the most downstream value.
4. **P3 + P4** are both post-P2: run as any room — P4 before P5, P3 while w/mon max.
5. **P5** then **P6** finally (content-sensit proper onboarding).

> Every phase above keeps zero-asset procedural look per GDD — sound/3D assets remain a
> trailing "final pass" only after outright.