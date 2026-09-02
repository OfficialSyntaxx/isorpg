# Alderfell — Game Design Document

*Working title. Alternatives: **Emberwake**, **Vaelmoor**, **The Long Reach**.*

**Version** 1.0 · **Date** 2026-09-02 · **Status** Design lock, pre-production
**Engine** Unity 6 URP · **Platform** PC first, console-shaped controls
**Scope posture** Solo dev + AI tooling. Every system below is costed. Cut lines are explicit.

---

## 0. Why this document exists

`isorpg`/Isoperia built a genuinely good **simulation** and wrapped it in a world
that doesn't earn a second look. The systems work — tick engine, OSRS math,
A*, crafting, quests, saves, all under test. The failure is upstream of code:

> A 42×42 procedurally-generated flat tile plane cannot be beautiful, because
> beauty in RuneScape, WoW, Wizard101 and Minecraft is **authored** — elevation,
> sightlines, landmarks, framed reveals, silhouette against sky. None of those
> survive a uniform grid at a fixed isometric angle.

Alderfell keeps the simulation and throws away the world. This is not a reskin.
It is a change of the thing the player actually looks at for 100% of playtime.

**The one-line pitch:** *You wash up on the coast of a fallen realm with nothing,
and you climb — through its forests, its ruins and its guilds — until the realm
knows your name.*

---

## 1. Pillars

These four settle every argument. When a feature conflicts with a pillar, the
feature loses.

### P1 — The world is the product
Every zone is hand-composed. If a player can screenshot it and it looks like
nothing, that zone isn't finished. Terrain has real elevation; every region has a
landmark visible from the region before it; every path bends for a reason.
**Test:** stand anywhere in a shipped zone, spin the camera 360°, and at least one
frame is worth a screenshot.

### P2 — Earned, not idled
The player rises from nobody to legend. Progress comes from *going somewhere and
doing something*, never from a tab left open. Skills and XP stay; the grind that
made them a spreadsheet does not.

### P3 — Readable depth
Systems are deep but legible. OSRS-style numbers under the hood, WoW-style
feedback on the surface. The player never needs a wiki to understand *why* they
missed — but a wiki still rewards them.

### P4 — Built single-player, shaped for MMO
Ship a complete solo game. But every authority decision, every piece of state,
every combat resolution is written **as if a server owned it** from day one.
Multiplayer is a later milestone, not a later rewrite. See §9.

---

## 2. What carries over from `isorpg`

This is the honest inventory. It's why the project starts at month 6, not month 0.

### 2.1 Code — carries almost entirely (`unity/Assets/Isoperia/Core/`)

`Isoperia.Core` is an engine-agnostic C# assembly with **no UnityEngine
dependency** and a full NUnit suite. That is exactly the shape a server-authoritative
MMO sim needs. It survives the pivot untouched or lightly retuned:

| System | File | Fate in Alderfell |
|---|---|---|
| Tick engine | `Sim/TickRunner.cs` | **Keep as-is.** 600ms tick becomes the server tick. |
| Deterministic RNG | `Sim/Mulberry32.cs` | **Keep.** Seeded, reproducible — required for server authority. |
| Combat math | `Combat/CombatMath.cs` | **Keep the rolls**, layer abilities on top (§5). |
| XP curve | `Data/XpTable.cs` | **Keep the curve, retune the costs** (§4). |
| A* pathfinding | `AI/AStar.cs` | **Keep**, re-host on a navmesh-backed `IGridLike`. |
| Inventory / Equipment | `Components/Components.cs` | Keep. Equipment stats need filling in — they're currently all zeros in the wiki. |
| Skills | `Systems/SkillSystem.cs` | Keep, retuned. |
| Crafting | `Systems/CraftingSystem.cs` | Keep. |
| Farming | `Systems/FarmSystem.cs` | Keep, relocated to housing (§6). |
| Quests | `Systems/QuestSystem.cs` | Keep the state machine, replace all content. |
| Clue scrolls | `Systems/ClueSystem.cs` | **Keep — and promote.** Treasure trails are a world-exploration engine, which is exactly this game's pillar. |
| Shops | `Systems/ShopSystem.cs` | Keep. |
| Dungeons | `Systems/DungeonSystem.cs` | Keep the structure, rebuild as authored spaces. |
| Save / Sanitizer | `Save/*` | **Keep.** Sanitized JSON + rollback is server-migration-ready. |
| Building | `Systems/BuildingSystem.cs` | **Repurpose to player housing** (§6). |
| Labour / villagers | `Systems/LabourSystem.cs` | **Cut from v1.** Idle automation contradicts P2. Code retained, unwired. |
| Offline gathering | `OfflineGatheringTests.cs` | **Cut.** Directly contradicts P2. |
| Map | `Systems/MapSystem.cs` | Rewrite — the flat grid minimap becomes a hand-drawn world map. |
| Grid / WorldTypes | `World/*` | **Rewrite.** This is the flat plane. It is the problem. (§3) |

**Net:** ~80% of the simulation carries. The world layer is what gets replaced.

### 2.2 Art — a real head start, and a style that already matches

The locked direction is **stylized painterly (WoW-like)**, and the existing
low-poly GLBs with hand-painted textures already sit inside that target. They need
re-texturing to a tighter palette, not replacing.

| Asset | Count | Fate |
|---|---|---|
| Rigged/static GLBs — `hero_rigged`, `villager`, `cave_brute`, `forest_ogre`, `dire_wolf`, `frost_imp`, `bog_husk`, `cave_slasher` | 8 | **Keep all.** Retexture to the Alderfell palette; re-role (§7). |
| Item icons | ~80 PNGs + 5 atlas sheets | **Keep.** Rename/re-flavor as needed. |
| Music | 8 tracks (village, forest, swamp, snow, dungeon, combat, boss, title) | **Keep all 8.** They map cleanly onto the new regions. |
| SFX | bow, campfire, door, potion + prior passes | Keep. |
| Concept art | 4 monster concepts | Keep as style reference. |
| Terrain vertex-color shader | `IsoperiaTerrainVertexColor.shader` | **Keep and extend** — vertex-painted terrain is the correct base for painterly sculpted ground. |

### 2.3 Pipeline — the multiplier

`ASSETS_PIPELINE.md` and `promptsfor3dmodels.md` document a **working, verified**
asset pipeline: Higgsfield/Meshy `3d_rigging` accepts an existing GLB URL, all rigs
share a 24-bone humanoid, rotation-only retargeting lets one animation clip serve
many characters, and costs are known (5 credits to rig, 8 with a clip).

This is the single most valuable non-code asset in the repo. A solo dev with a
verified character pipeline can populate a world; one without cannot. **Keep and
formalize it** as the content factory (§8).

---

## 3. The world — the actual redesign

This section is the reason the document exists.

### 3.1 Structure: authored, seamless, elevation-first

No tile grid. No procedural terrain. **Sculpted Unity terrain, hand-painted,
per-region, streamed seamlessly.**

The organizing principle borrowed from Elwynn→Westfall and Lumbridge→Varrock:
**adjacent regions are visible from each other, and the next one always looks
inviting.** Difficulty is communicated by lighting, palette and silhouette, not
by a ring index.

**Region graph (v1 — five regions, ~1.5km² total):**

```
        [Coldreach Pass]  (snow · L30-40 · gates the north)
                 |
   [Thornwood] — [Hearth's Landing] — [Kingsmoor Ruins]
   (forest·L10-20)      (hub · safe)      (ruins · L20-30)
                 |
        [The Shorelands]  (starting coast · L1-10)
```

- **The Shorelands** — where you wash up. Cliffs, tidepools, a wrecked hull, gulls,
  a switchback path climbing inland. First real landmark: the smoke of Hearth's
  Landing seen from the cliff top. *This is the tutorial and it has no tutorial UI.*
- **Hearth's Landing** — the hub town. Built into a hillside, tiered, with a
  waterfall through the middle and a bell tower visible from all four neighbors.
  Bank, guilds, market, housing district, quest hub. **Safe.**
- **Thornwood** — dense forest, canopy light shafts, a sunken barrow, elevation
  hidden by trees so the space feels bigger than it is. Woodcutting heartland.
- **Kingsmoor Ruins** — the fallen kingdom made literal. Broken keep on a plateau,
  visible from three regions. Mid-game dungeon and first boss.
- **Coldreach Pass** — a wall of mountain, one road, and the promise of everything
  in v2 beyond it. Mining heartland.

**Why five:** it's what one person can author to P1 quality. Five beautiful
regions beat twenty adequate ones, and the pillar says so explicitly.

### 3.2 The craft rules (non-negotiable, per zone)

Each of these is a checklist item before a region ships:

1. **Vertical relief ≥ 15m** across the region. Flat ground is banned as a default.
2. **A silhouette landmark** visible from at least one neighboring region.
3. **No straight paths.** Every road bends around terrain that justifies the bend.
4. **Three framed reveals** — a spot where cresting a hill or clearing trees
   presents a composed view. These are placed by hand and screenshotted.
5. **Foreground / midground / background layering** in every major sightline.
6. **Nothing tiles visibly.** Rocks, trees and props are scattered by hand or
   by scatter tools with rotation/scale jitter, never on a grid.
7. **A palette per region**, ≤5 dominant hues, distinct from every neighbor.
8. **Sky and fog do the heavy lifting** — the cheapest beauty a solo dev can buy.

### 3.3 Art direction — stylized painterly

- **Textures:** hand-painted diffuse, minimal PBR, baked-in soft shading. Forgiving
  of low poly counts, ages far better than semi-realism, matches existing assets.
- **Geometry:** exaggerated silhouettes. Chunky roofs, oversized props, readable
  from 20m at a third-person camera distance.
- **Lighting:** dynamic time-of-day (short cycle, ~48 real minutes), volumetric
  light shafts, aggressive distance fog tinted per region. URP is a good fit.
- **Vegetation:** billboard-hybrid canopies with wind. Grass with a wind shader is
  the highest beauty-per-hour asset in the entire project — do it first.
- **Water:** stylized, animated, with foam at shorelines. The Shorelands sells or
  sinks the whole art direction, so it is built first as the proving ground.

*See `docs/ART_BIBLE.md` and `docs/VISUAL_DIRECTION.md` — the prior visual work
should be revised against §3.2 rather than discarded.*

---

## 4. Progression — skills kept, grind cut

The 12 skills stay (Attack, Strength, Defense, Hitpoints, Cooking, Smithing,
Carpentry, Construction, Farming, Woodcutting, Mining, Fishing). The identity is
worth keeping. The economy around them is not.

**Changes from Isoperia:**

| Was | Now | Why |
|---|---|---|
| Cap 99, OSRS curve (13M XP) | **Cap 50, curve rescaled to ~5% of OSRS totals** | 99 assumes an MMO's thousands of hours. A solo-authored world has dozens. Same satisfying curve shape, honest length. |
| Respawning nodes on tiles | **Authored node placements** in composed locations | A tree you walk to across a beautiful forest > a tree that pops back in 30s. |
| Offline progression | **Removed** | Contradicts P2. |
| Villager labour automation | **Removed from v1** | Contradicts P2. |
| Per-item mastery | **Kept** | It's good, invisible, rewards specialization. |
| Item mastery drives speed only | Also drives **visual/quality tiers** on crafted output | Makes progression visible in the world. |

**Rise-from-nobody arc, expressed mechanically:**

| Act | Levels | Where | The feeling |
|---|---|---|---|
| I — Castaway | 1–10 | Shorelands | Nothing. Fists, scavenged food, one road inland. |
| II — Townsfolk | 10–20 | Hearth's Landing, Thornwood | Guild membership, first real gear, a home. |
| III — Adventurer | 20–30 | Kingsmoor Ruins | First dungeon, first boss, the town starts recognizing you. |
| IV — Named | 30–40 | Coldreach Pass | Titles, endgame gear, the realm reacts. |
| V — Legend | 40–50 | Endgame content | Reserved for v2 / the MMO milestone. |

Recognition is **diegetic**: NPC dialogue changes by act, guards greet you,
the town bell rings for you at Act IV. This is the "legend" payoff, and it's
cheap — it's dialogue variants, not systems.

---

## 5. Combat — tab-target with abilities

Keep `CombatMath.cs` and the 600ms tick underneath. Layer WoW-shaped presentation
on top. This is deliberately the MMO-safe choice (P4): tick-resolved,
server-authoritative combat is netcode you can actually write; action combat with
client-side dodging is not.

**Model:**
- **Tab / click to target.** Auto-attack ticks along at weapon speed.
- **Abilities** on a hotbar, resource-gated and cooldown-gated. ~6 per style at
  v1, unlocked by skill level and guild rank.
- **Three styles** — Melee, Ranged, and **Arcane** (new; the existing game has no
  magic and a high-fantasy world needs one). Rock-paper-scissors weakness triangle,
  readable from enemy silhouette and VFX color.
- **Resource:** stamina for melee/ranged, mana for arcane. Regenerates out of combat.
- **Global cooldown** of 1 tick (600ms) — aligns abilities to the existing sim.

**Feedback is where the budget goes.** The math already works; what's missing is
hit-stop, damage numbers, screen shake on crits, ability VFX, impact SFX, and
death animations. Combat that *feels* good is 90% presentation over a sound sim,
and the sim is done.

**Enemy design:** every enemy telegraphs. A wind-up animation before a big hit,
readable at third-person distance. This single rule is what separates "clicking a
health bar" from combat.

---

## 6. Player housing (was: settlement building)

`BuildingSystem` becomes a **personal instanced home** in Hearth's Landing's
housing district. This is a direct swap of a muddy identity for a proven one, and
it's MMO-native — housing is a feature every MMO ships.

- A plot in the housing district, entered through a door (instanced, so it's cheap).
- Place and rotate furniture, crafted decorations, trophies from bosses.
- **Functional rooms** gate real benefits: a workshop enables high-tier Carpentry,
  a forge enables high-tier Smithing, a kitchen for Cooking, a **garden** which is
  where `FarmSystem` now lives.
- Construction skill gates room tiers — the skill finally has a clear purpose.
- Trophies are the "legend" trophy case. Visible proof of the arc in §4.

**Cut:** villager assignment, passive yields, town-wide sim. It contradicts P2 and
muddies the identity.

---

## 7. Content — re-roling what exists

The eight existing GLBs cover more than they look like they do:

| Existing asset | Role in Alderfell |
|---|---|
| `hero_rigged` | Player character (needs a customization pass — see §8 risk) |
| `villager` | **All humanoid NPCs.** Retint + prop swap per NPC, per the existing prompt pack. Guards, merchants, guild masters. |
| `dire_wolf` | Thornwood — wolves, and a rare alpha variant |
| `bog_husk` | Thornwood barrow — undead/wood-corrupted |
| `cave_slasher` | Kingsmoor Ruins dungeon |
| `frost_imp` | Coldreach Pass |
| `forest_ogre` | **Act II boss** — Thornwood |
| `cave_brute` | **Act III boss** — Kingsmoor Ruins |

Scaling and tinting one mesh into 3–4 variants (juvenile / normal / elite / named)
is standard MMO practice and effectively free. Eight meshes becomes ~25 encounters.

**New assets needed for v1 (priority order):**
1. Environment kit — trees ×4 species, rocks ×6, cliffs, terrain textures. *This is
   the largest single art cost and it buys P1 directly.*
2. Building kit for Hearth's Landing — modular walls/roofs/doors, ~15 pieces.
3. Arcane style: staff, effects, one caster enemy.
4. Ability VFX set.
5. Furniture set for housing (~20 pieces).

---

## 8. Production plan (solo-dev realistic)

Milestones are gated on *demonstrable quality*, not feature counts.

| M | Name | Deliverable | Gate |
|---|---|---|---|
| **M0** | Beauty proof | The Shorelands alone: sculpted terrain, water, grass, sky, time-of-day, third-person camera. No systems. | **Does it look beautiful?** If no, iterate here and nowhere else. This gate protects the entire project. |
| **M1** | Character in world | Hero moves, camera orbits, navmesh + A* rehost, animation state machine | Movement feels good for 5 minutes straight |
| **M2** | Combat feel | Tab-target, 3 abilities, one enemy, full feedback pass | Killing one wolf is satisfying 20 times |
| **M3** | Vertical slice | Shorelands + Hearth's Landing complete. Act I playable end to end. | A stranger plays 45 min without guidance |
| **M4** | Thornwood + housing | Region 3, housing, Farming, Act II boss | Region passes the §3.2 checklist |
| **M5** | Kingsmoor + dungeon | Region 4, first dungeon, Act III boss | — |
| **M6** | Coldreach + endgame | Region 5, Act IV, titles, clue trails | Content complete |
| **M7** | Ship single-player | Polish, balance, save migration, settings, audio mix | Shippable |
| **M8+** | MMO conversion | §9 | — |

**M0 is the most important milestone in this document.** The prior project's
failure was building systems on top of a world nobody wanted to look at. Do not
repeat it. If the Shorelands doesn't look good, no amount of ability design saves it.

**Content factory:** formalize the Higgsfield/Meshy pipeline from
`ASSETS_PIPELINE.md` into a repeatable loop — concept image → mesh → rig → clip →
Unity import via `IsoperiaOwnedModelPreparation.cs`. Budget credits per milestone.
Rotation-only retargeting means one animation set serves every humanoid.

---

## 9. The MMO path (P4 — architecture now, servers later)

The goal is stated: single-player first, converting to multiplayer, with MMO
features added. That conversion is only affordable if v1 is written for it. **Rules
that cost almost nothing now and save the project later:**

1. **`Isoperia.Core` never references UnityEngine.** It already doesn't. Hold this
   line absolutely — it is the future server binary.
2. **All state lives in `GameState`,** serializable, sanitized. Already true.
3. **The client never decides an outcome.** Damage, loot rolls, XP, gathering
   success all resolve in Core against the seeded RNG. In v1 the "server" is a
   local instance of Core. In v8 it's a process on a machine. Same code path.
4. **Everything is tick-quantized.** Already true. This is what makes lockstep or
   authoritative-with-prediction feasible.
5. **Player input is a command, not a mutation.** `MoveTo(x,z)`, `UseAbility(id,
   targetId)` — never `transform.position = ...`. Commands serialize over a wire
   unchanged.
6. **Instanced spaces from day one** (housing, dungeons) — the boundary between
   shared world and instance is a design decision that's painful to add later.
7. **No client-side authoritative timers.** Cooldowns, respawns, growth all tick
   in Core.

**MMO features deferred but designed-for:** chat, parties, guilds (the guild
buildings exist in the fiction from Act II — the shell is already there), trading,
a Grand-Exchange-style market (`ShopSystem` is the seed), shared world bosses,
and player names/titles.

**Honest scope note:** an MMO is a multi-year, multi-person undertaking, and the
server, hosting and moderation costs are real. The plan above does not make that
cheap — it makes it *possible*, by ensuring v1 doesn't have to be thrown away. Ship
the single-player game and let its reception fund the conversion.

---

## 10. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **World authoring is the bottleneck** — one person hand-building 5 beautiful regions | **High** | M0 measures the true per-region cost before committing to five. Cut to three regions if M0 says so. Buy environment kits rather than authoring every prop. |
| **Character customization** — one `hero_rigged` mesh means every player looks identical, unacceptable for an MMO | Medium | v1: color/gear customization on one base mesh. Modular character system is an MMO-milestone cost, budgeted there. |
| Scope creep back into settlement sim | Medium | Pillars. LabourSystem stays unwired. |
| Combat feel underestimated | Medium | M2 is its own gate. Do not proceed until one wolf is fun. |
| MMO conversion never happens | Medium | v1 must be complete and satisfying as single-player. It is designed to be. |
| Art coherence drift across a long solo build | Medium | Palette lock per region, style lock in every generation prompt (already documented in `promptsfor3dmodels.md`). |

---

## 11. What we are explicitly not building

Stated so it can't creep back in: offline/idle progression · villager labour
automation · settlement management sim · isometric or fixed camera · procedurally
generated terrain · 99-level grind curves · action combat with client-side dodging
· voxel/destructible terrain · a launch MMO.

---

## Appendix A — Open decisions

1. **Final title.** Alderfell is a working name.
2. **Region count** — five is the plan; M0's measured cost decides whether it's
   three or five.
3. **Arcane style scope** — a full third style, or a lighter utility/support kit?
4. **Death penalty** — item loss (OSRS), durability (WoW), or none? Affects tension
   and MMO economy design.
5. **Time-of-day gameplay effects** — cosmetic only, or do night spawns differ?

## Appendix B — Immediate next steps

1. Lock the title.
2. Build **M0**: The Shorelands beauty proof. Terrain, water, grass, sky, camera.
   Nothing else. Screenshot it and judge it against the games named in §0.
3. Revise `docs/ART_BIBLE.md` against §3.2's craft rules.
4. Strip `LabourSystem` and offline gathering from the active wiring (retain code).
5. Rescale `XpTable` to the level-50 curve and re-baseline the tests.
