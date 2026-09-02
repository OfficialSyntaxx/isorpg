# Alderfell — Game Design Document

**Version** 2.0 · **Date** 2026-09-02 · **Status** Design lock, pre-production
**Engine** Unity 6 URP · **Platform** Mobile-first (iOS/Android), PC parity from one build
**Genre** Third-person high-fantasy action-RPG with skill progression
**Scope posture** Solo dev + AI tooling. Systems are costed. Cut lines are explicit.

> **v2.0 changes:** platform reversed to mobile-first (was PC-first) — this
> re-scoped §3, §5, §8 and added §6 (performance budget) and §7 (UX/controls).
> Title locked. Death, loot, quests, character, narrative, travel and group
> content all resolved.

---

## 0. Why this document exists

`isorpg`/Isoperia built a genuinely good **simulation** wrapped in a world that
doesn't earn a second look. The systems work — tick engine, OSRS math, A*,
crafting, quests, saves, all under test. The failure is upstream of code:

> A 42×42 procedurally-generated flat tile plane cannot be beautiful, because
> beauty in RuneScape, WoW, Wizard101 and Minecraft is **authored** — elevation,
> sightlines, landmarks, framed reveals, silhouette against sky. None of those
> survive a uniform grid at a fixed isometric angle.

Alderfell keeps the simulation and replaces the world. This is not a reskin; it
changes the thing the player looks at for 100% of playtime.

**Pitch:** *You wash up on the coast of a fallen realm with nothing, and you
climb — through its forests, its ruins and its guilds — until the realm knows
your name.*

---

## 1. Pillars

These four settle every argument. When a feature conflicts with a pillar, the
feature loses.

### P1 — The world is the product
Every zone is hand-composed. Terrain has real elevation; every region has a
landmark visible from the region before it; every path bends for a reason.
**Test:** stand anywhere in a shipped zone, spin the camera 360°, and at least
one frame is worth a screenshot.

### P2 — Earned, not idled
Progress comes from *going somewhere and doing something*, never from a tab left
open. Skills and XP stay; the grind that made them a spreadsheet does not.

### P3 — Readable depth
Deep but legible. OSRS-style numbers underneath, modern feedback on the surface.
The player never needs a wiki to understand why they missed — but a wiki still
rewards them.

### P4 — Built single-player, shaped for MMO
Ship a complete solo game. But every authority decision, every piece of state,
every combat resolution is written **as if a server owned it** from day one.
Multiplayer is a later milestone, not a later rewrite. See §12.

### P5 — It has to run beautifully in your hand *(new in v2.0)*
Mobile-first is a design constraint, not a port target. Every art and system
decision is made against the budget in §6. A gorgeous scene that drops frames on
a mid-range Android phone is not shipped — it is cut or rebuilt.

---

## 2. What carries over from `isorpg`

The honest inventory. It's why this project starts at month 6, not month 0.

### 2.1 Code — carries almost entirely (`unity/Assets/Isoperia/Core/`)

`Isoperia.Core` is an engine-agnostic C# assembly with **no UnityEngine
dependency** and a full NUnit suite — exactly the shape a server-authoritative
sim needs.

| System | File | Fate in Alderfell |
|---|---|---|
| Tick engine | `Sim/TickRunner.cs` | **Keep as-is.** 600ms tick becomes the server tick. |
| Deterministic RNG | `Sim/Mulberry32.cs` | **Keep.** Seeded and reproducible — required for server authority. |
| Combat math | `Combat/CombatMath.cs` | **Keep the rolls**, layer abilities on top (§5). |
| XP curve | `Data/XpTable.cs` | Keep the curve shape, **rescale to level 50** (§4). |
| A* pathfinding | `AI/AStar.cs` | **Keep** — now serving tap-to-travel and NPC/enemy nav on a navmesh-backed `IGridLike`. |
| Inventory / Equipment | `Components/Components.cs` | Keep. Equipment stats need filling in — currently all zeros. |
| Skills | `Systems/SkillSystem.cs` | Keep, retuned. |
| Crafting | `Systems/CraftingSystem.cs` | **Keep and promote** — central to the loot model (§4.3). |
| Farming | `Systems/FarmSystem.cs` | Keep, relocated to housing (§9). |
| Quests | `Systems/QuestSystem.cs` | Keep the state machine, replace all content (§10). |
| Clue scrolls | `Systems/ClueSystem.cs` | **Keep and promote.** Treasure trails are a world-exploration engine — exactly this game's pillar. |
| Shops | `Systems/ShopSystem.cs` | Keep; seed of the later player market. |
| Dungeons | `Systems/DungeonSystem.cs` | Keep the structure, rebuild as authored spaces (§11). |
| Save / Sanitizer | `Save/*` | **Keep.** Sanitized JSON + rollback is migration-ready. |
| Building | `Systems/BuildingSystem.cs` | **Repurpose to player housing** (§9). |
| Labour / villagers | `Systems/LabourSystem.cs` | **Cut from v1.** Idle automation contradicts P2. Code retained, unwired. |
| Offline gathering | `OfflineGatheringTests.cs` | **Cut.** Contradicts P2. |
| Map | `Systems/MapSystem.cs` | Rewrite — flat-grid minimap becomes a hand-drawn world map with fast-travel nodes. |
| Grid / WorldTypes | `World/*` | **Rewrite.** This is the flat plane. It is the problem. (§3) |

**Net:** ~80% of the simulation carries. The world layer is what gets replaced.

### 2.2 Art — a real head start in the right style

The locked direction is **stylized painterly**, and the existing low-poly GLBs
with hand-painted textures already sit inside that target. They need retexturing
to a tighter palette, not replacing — and low-poly hand-painted is also the
correct answer for the mobile budget (§6).

| Asset | Count | Fate |
|---|---|---|
| Rigged/static GLBs — `hero_rigged`, `villager`, `cave_brute`, `forest_ogre`, `dire_wolf`, `frost_imp`, `bog_husk`, `cave_slasher` | 8 | **Keep all.** Retexture and re-role (§8.3). |
| Item icons | ~80 PNGs + 5 atlas sheets | **Keep.** Atlased icons are mobile-friendly as-is. |
| Music | 8 tracks | **Keep all 8** — they map onto the new regions (§3.1). |
| SFX | bow, campfire, door, potion + prior passes | Keep. |
| Concept art | 4 monster concepts | Keep as style reference. |
| Terrain vertex-color shader | `IsoperiaTerrainVertexColor.shader` | **Keep and extend** — vertex-painted terrain is both the correct painterly base *and* cheap on mobile. |

### 2.3 Pipeline — the multiplier

`ASSETS_PIPELINE.md` and `promptsfor3dmodels.md` document a **verified** pipeline:
Meshy/Higgsfield `3d_rigging` accepts an existing GLB URL, all rigs share a
24-bone humanoid, rotation-only retargeting lets one clip serve many characters,
and costs are known (5 credits to rig, 8 with a clip).

This is the most valuable non-code asset in the repo. A solo dev with a verified
character pipeline can populate a world; one without cannot. **Keep and formalize
it** as the content factory (§8.4).

---

## 3. The world — the actual redesign

### 3.1 Structure: authored, seamless, elevation-first

No tile grid. No procedural terrain. **Sculpted Unity terrain, hand-painted,
per-region, streamed seamlessly.**

Organizing principle, borrowed from Elwynn→Westfall and Lumbridge→Varrock:
**adjacent regions are visible from each other, and the next one always looks
inviting.** Difficulty is communicated by lighting, palette and silhouette — never
by a ring index.

```
        [Coldreach Pass]  (snow · L30-40 · gates the north)
                 |
   [Thornwood] — [Hearth's Landing] — [Kingsmoor Ruins]
   (forest·L10-20)      (hub · safe)      (ruins · L20-30)
                 |
        [The Shorelands]  (starting coast · L1-10)
```

| Region | Music track | Identity |
|---|---|---|
| **The Shorelands** | `title` / ambience | Where you wash up. Cliffs, tidepools, a wrecked hull, gulls, a switchback path climbing inland. First landmark: the smoke of Hearth's Landing seen from the clifftop. *The tutorial, with no tutorial UI.* |
| **Hearth's Landing** | `village` | Hub town built into a hillside — tiered, a waterfall through the middle, a bell tower visible from all four neighbours. Bank, guilds, market, housing, quests. **Safe.** |
| **Thornwood** | `forest` / `swamp` | Dense forest, canopy light shafts, a sunken barrow. Elevation hidden by trees so the space feels bigger than it is. Woodcutting heartland. |
| **Kingsmoor Ruins** | `dungeon` / `boss` | The fallen kingdom made literal. Broken keep on a plateau, visible from three regions. First dungeon and boss. |
| **Coldreach Pass** | `snow` | A wall of mountain, one road, and the promise of everything beyond it in v2. Mining heartland. |

**Why five:** it's what one person can author to P1 quality. Five beautiful
regions beat twenty adequate ones, and the pillar says so.

**Scale target:** ~1.5km² total. Small enough to author properly, large enough
that the fast-travel network (§7.3) has something to connect.

### 3.2 The craft rules (non-negotiable, checked before a region ships)

1. **Vertical relief ≥ 15m** across the region. Flat ground is banned as a default.
2. **A silhouette landmark** visible from at least one neighbouring region.
3. **No straight paths.** Every road bends around terrain that justifies the bend.
4. **Three framed reveals** — spots where cresting a hill or clearing trees
   presents a composed view. Placed by hand, screenshotted, reviewed.
5. **Foreground / midground / background layering** in every major sightline.
6. **Nothing tiles visibly.** Rotation and scale jitter on all scatter.
7. **A palette per region**, ≤5 dominant hues, distinct from every neighbour.
8. **Sky and fog do the heavy lifting** — the cheapest beauty available, and on
   mobile, fog is also the performance tool that lets you cull aggressively.
9. **Composed for a phone screen.** Every framed reveal is reviewed at 6" in
   portrait-height field of view, not on a 27" monitor. Detail that vanishes at
   phone resolution is wasted budget — push it into silhouette and colour instead.

### 3.3 Art direction — stylized painterly, mobile-budgeted

- **Textures:** hand-painted diffuse, minimal PBR, baked-in soft shading.
  Forgiving of low poly counts, ages better than semi-realism, cheap on mobile.
- **Geometry:** exaggerated silhouettes. Chunky roofs, oversized props, readable
  at phone size from third-person distance.
- **Lighting:** baked lightmaps for static geometry + one real-time directional
  light. Time-of-day is a **shader/skybox tint cycle**, not fully dynamic GI
  (§6). ~48-minute cycle.
- **Vegetation:** billboard-hybrid canopies with a vertex wind shader. Grass with
  wind is the highest beauty-per-hour asset in the project — build it first.
- **Water:** stylized, animated, foam at shorelines. The Shorelands sells or sinks
  the art direction, so it's the proving ground (M0).

*Revise `docs/ART_BIBLE.md` and `docs/VISUAL_DIRECTION.md` against §3.2 rather
than discarding them.*

---

## 4. Progression, loot and economy

### 4.1 Skills — kept, grind cut

The 12 skills stay (Attack, Strength, Defense, Hitpoints, Cooking, Smithing,
Carpentry, Construction, Farming, Woodcutting, Mining, Fishing). The identity is
worth keeping; the economy around them is not.

| Was | Now | Why |
|---|---|---|
| Cap 99, OSRS curve (13M XP) | **Cap 50, rescaled to ~5% of OSRS totals** | 99 assumes thousands of hours. A solo-authored world has dozens. Same curve shape, honest length. |
| Respawning nodes on tiles | **Authored node placements** in composed locations | A tree you walk to across a beautiful forest beats one that pops back in 30s. |
| Offline progression | **Removed** | Contradicts P2. |
| Villager labour automation | **Removed from v1** | Contradicts P2. |
| Per-item mastery | **Kept** | Invisible, rewards specialization. |
| Mastery drives speed only | Also drives **visual quality tiers** on crafted output | Makes progression visible in the world. |

### 4.2 The rise arc, expressed mechanically

| Act | Levels | Where | The feeling |
|---|---|---|---|
| I — Castaway | 1–10 | Shorelands | Nothing. Fists, scavenged food, one road inland. |
| II — Townsfolk | 10–20 | Hearth's Landing, Thornwood | Guild membership, first real gear, a home. |
| III — Adventurer | 20–30 | Kingsmoor Ruins | First dungeon, first boss, the town notices you. |
| IV — Named | 30–40 | Coldreach Pass | Titles, endgame gear, the realm reacts. |
| V — Legend | 40–50 | Endgame | Reserved for v2 / the MMO milestone. |

Recognition is **diegetic**: NPC dialogue changes by act, guards greet you, the
town bell rings for you at Act IV. That's the "legend" payoff, and it's cheap —
dialogue variants, not systems.

### 4.3 Loot model — drops are bases, crafting refines them

Drops supply **bases and components**; crafting turns them into finished gear.
Every drop feeds the skills, so the 12 skills stay relevant to the end and the
future player economy has real demand on both sides.

- **Enemies and bosses** drop weapon/armour **bases** and rare components.
- **Crafting** upgrades a base along a quality track (Smithing/Carpentry) and
  applies **enchantments/runes** from rare components.
- **Gathering** feeds materials; **Cooking/Farming** feed consumables.
- **Mastery** on a recipe raises the quality ceiling — visible on the model.
- The chase item is therefore a *base plus the mats to finish it*, which is a
  longer, more satisfying hook than a single drop.

`ShopSystem` handles NPC vendors and acts as the seed of the later player market
(§12). Gold sinks: repairs (§4.4), housing, fast-travel unlocks, respecs.

### 4.4 Death — tiered by region

Danger is a design tool, placed deliberately rather than applied uniformly.

| Zone tier | On death | Regions |
|---|---|---|
| **Safe** | No penalty. Respawn nearby. | Hearth's Landing, housing |
| **Settled** | Durability loss + repair cost. | Shorelands, Thornwood edges |
| **Wild** | Durability loss + **drop unequipped inventory** at the corpse; recoverable. | Deep Thornwood, Kingsmoor Ruins |
| **Deep** | Drop everything but equipped gear; corpse has a recovery timer. | Coldreach Pass, dungeon depths |

The tier is **signposted in the world** — a boundary marker, a palette shift, a
music change — never a surprise. Tier is a property of the region asset, so it's
data, not code, and it tunes freely after playtesting.

---

## 5. Combat

Tab/tap-target with abilities, resolved on the existing 600ms tick. Deliberately
the MMO-safe choice (P4): tick-resolved server-authoritative combat is netcode
you can actually write; action combat with client-side dodging is not. It is also
the mobile-safe choice — precise timing on a touchscreen is a losing battle.

- **Target** by tapping an enemy or cycling with a button. Auto-attack ticks at
  weapon speed.
- **Abilities** on a hotbar, resource- and cooldown-gated. ~6 per style at v1,
  unlocked by skill level and guild rank.
- **Three styles** — Melee, Ranged and **Arcane** (new; a high-fantasy world needs
  magic). Weakness triangle, readable from enemy silhouette and VFX colour.
- **Resources:** stamina (melee/ranged), mana (arcane). Regenerate out of combat.
- **Global cooldown** 1 tick (600ms), aligning abilities to the sim.

**The budget goes to feedback.** The math works; what's missing is hit-stop,
damage numbers, crit shake, ability VFX, impact SFX and death animations. Combat
that *feels* good is 90% presentation over a sound sim, and the sim is done.

**Every enemy telegraphs** — a wind-up animation before a big hit, readable at
phone size. This single rule separates "tapping a health bar" from combat.

---

## 6. Mobile performance budget *(new in v2.0)*

The target device defines the art direction. These are hard limits; art that
misses them is rebuilt, not shipped.

**Target spec:** mid-range Android of ~3 years ago (Snapdragon 7-series class) at
**30 FPS locked**; high-end mobile and PC unlock 60 FPS and higher settings from
the same build.

| Budget | Limit |
|---|---|
| Triangles on screen | ~150k |
| Draw calls | ~120 (aggressive batching/atlasing is mandatory) |
| Real-time lights | 1 directional + baked lightmaps. No real-time shadows beyond the character. |
| Texture memory | ~500 MB, ASTC compressed, atlased |
| Post-processing | Fog + colour grading + light bloom only. **No** SSAO, SSR, volumetrics or heavy DOF. |
| Character bones | 24 (the existing rig standard — already compliant) |
| Physics | Kinematic + simple colliders. No ragdolls, no cloth. |
| Build size | < 2 GB, with streamed regions via Addressables |

**Consequences accepted up front:**
- Beauty must come from **silhouette, palette, sky, fog and composition** — not
  density or expensive lighting. This is exactly what stylized painterly is good
  at, which is why the style choice and the platform choice agree.
- Time-of-day is a skybox/tint cycle over baked lighting, not dynamic GI.
- Vegetation is billboard-hybrid with LOD and aggressive distance culling; fog
  hides the cull distance.
- Region streaming happens at authored boundaries, hidden by terrain occlusion —
  which §3.2's elevation rules give us for free.

**PC parity** means the same content at higher settings: draw distance, shadow
resolution, foliage density, 60+ FPS, higher-res textures. No PC-exclusive assets.

---

## 7. Controls and UX (mobile-first)

### 7.1 Controls
- **Virtual joystick** (left thumb) for direct movement — the modern mobile
  standard, and it maps 1:1 to a gamepad stick and WASD on PC.
- **Tap-to-move** for long travel: tap the ground or a map point and the character
  auto-walks via the existing `AStar` code. Auto-walk is an MMO staple and it
  makes one-handed play viable.
- **Right thumb zone:** ability buttons + interact. Camera orbits by dragging
  anywhere not occupied by a control; pinch to zoom.
- **Interact is contextual** — one button whose label and icon change based on
  what's nearest (chop / mine / talk / open / enter).

### 7.2 UI — minimal, fades out of combat
The screen belongs to the world (P1).

- **Exploring:** joystick, contextual interact button, and nothing else. Health,
  hotbar and quest text fade out after a few seconds of calm.
- **In combat:** health/resource bars and the ability hotbar fade in, anchored in
  the thumb zones, with the centre of the screen kept clear.
- **Summoned panels** (inventory, skills, map, character) are full-screen and
  modal — better on a phone than persistent windows, and they let the exploring
  HUD stay near-zero.
- **Minimap:** off by default; the world map is a summoned panel. Navigation is
  meant to happen by looking at landmarks (§3.2 rule 2), which is only possible
  if the world is built well — the UI decision enforces the world decision.
- **Everything is thumb-reachable**, tested at 6" one-handed. Nothing critical in
  screen corners.

### 7.3 Travel — unlockable fast travel
Walk a route once, then unlock its waypoint and teleport back. Respects the
authored world on first pass and respects the player's time forever after —
critical on mobile, where sessions are ten minutes. Waypoints are authored
landmarks (the bell tower, a shrine, a camp), so fast travel reinforces the
world's landmarks instead of bypassing them. Unlock cost is a gold sink.

### 7.4 Onboarding — the world teaches
No tutorial UI. The Shorelands *is* the tutorial and the fiction: you're a
castaway with nothing, so learning to chop, cook and fight is what a castaway
does. Systems appear one at a time in the order the beach presents them, each
with a single contextual hint on first encounter. An optional in-game **codex**
holds the depth for players who want the numbers (P3).

### 7.5 Sessions and accessibility
- Designed for **10-minute sessions**: fast travel, quick save/resume, no
  timing-critical content, no long uninterruptible sequences.
- Colourblind-safe combat feedback (never colour alone), scalable UI and text,
  left-handed layout mirroring, and a no-flashing option.
- Full one-handed playability via tap-to-move.

---

## 8. Content and production

### 8.1 Character
A **custom avatar, no classes.** You build your look at creation; your build comes
from skills and gear, OSRS-style. This fits the skill system that already exists,
avoids class-balance work, and is MMO-correct — players need to be visually
distinct from each other.

v1 customization is body/skin/hair/face variants and colour on one base mesh, plus
visible equipped gear. A modular character system (swappable body parts) is an
MMO-milestone cost, budgeted there (§13).

### 8.2 Narrative — environmental plus short dialogue
The ruins tell the story; dialogue is brief and characterful. No walls of text —
mobile players skip them, and it makes the authored world do narrative work, which
is free content on top of art you're building anyway. Key beats: readable ruins,
abandoned camps, item descriptions, and NPCs who speak in a few strong lines.

### 8.3 Re-roling the existing GLBs

| Existing asset | Role in Alderfell |
|---|---|
| `hero_rigged` | Player character base |
| `villager` | **All humanoid NPCs** — retint + prop swap per NPC. Guards, merchants, guild masters. |
| `dire_wolf` | Thornwood wolves, plus a rare alpha variant |
| `bog_husk` | Thornwood barrow — undead/wood-corrupted |
| `cave_slasher` | Kingsmoor Ruins dungeon |
| `frost_imp` | Coldreach Pass |
| `forest_ogre` | **Act II boss** — Thornwood |
| `cave_brute` | **Act III boss** — Kingsmoor Ruins |

Scaling and tinting one mesh into 3–4 variants (juvenile / normal / elite / named)
is standard MMO practice and effectively free. **Eight meshes becomes ~25
encounters.**

**New assets for v1, priority order:**
1. Environment kit — trees ×4 species, rocks ×6, cliffs, terrain textures. Largest
   single art cost; buys P1 directly.
2. Modular building kit for Hearth's Landing (~15 pieces).
3. Arcane style: staff, VFX, one caster enemy.
4. Ability VFX set (mobile-cheap: sprite/flipbook over particles).
5. Housing furniture set (~20 pieces).

### 8.4 The content factory
Formalize the Meshy/Higgsfield pipeline into a repeatable loop: concept image →
mesh → rig → clip → Unity import via `IsoperiaOwnedModelPreparation.cs`. Budget
credits per milestone. Rotation-only retargeting means one animation set serves
every humanoid — this is what makes a populated world affordable solo.

---

## 9. Player housing (was: settlement building)

`BuildingSystem` becomes a **personal instanced home** in Hearth's Landing's
housing district — a direct swap of a muddy identity for a proven, MMO-native one.

- A plot entered through a door (instanced, so it's cheap and mobile-friendly).
- Place and rotate furniture, crafted decorations, boss trophies.
- **Functional rooms** gate real benefits: workshop (Carpentry), forge (Smithing),
  kitchen (Cooking), **garden** — which is where `FarmSystem` now lives.
- Construction skill gates room tiers; the skill finally has a clear purpose.
- The trophy case is visible proof of the §4.2 arc.

**Cut:** villager assignment, passive yields, town-wide sim. Contradicts P2,
muddies the identity.

---

## 10. Quests — story spine plus light side content

- **A handcrafted main questline per act** (5 total), each a real designed
  experience with characters, a puzzle or set-piece, and a unique reward. These
  are the memorable ones.
- **Light side quests** for pacing and world texture — shorter, but never "kill 10
  rats"; each one shows you somewhere worth seeing.
- **Clue trails** (`ClueSystem`) as the third pillar of content: they're an
  exploration engine that turns the authored world into puzzle content at almost
  no art cost. Heavily promoted from the original game.
- Target v1: **5 main quests, ~20 side quests, 3 clue tiers.**

---

## 11. Dungeons — solo-first, group-scalable

Every dungeon is beatable alone. Encounters read party size and scale health,
damage and mechanic count — so when multiplayer lands, nothing is rebuilt and
nothing is gated on having friends.

- **v1: two dungeons** — the Thornwood barrow (Act II) and Kingsmoor keep (Act III),
  each ending in a boss using an existing GLB.
- Dungeons are **instanced**, which is both a design choice and a mobile
  performance win (contained, occluded, streamable).
- Boss design follows the telegraph rule (§5): every mechanic is readable at
  phone size.

---

## 12. The MMO path (P4 — architecture now, servers later)

Single-player first, converting to multiplayer. That conversion is only affordable
if v1 is written for it. **Rules that cost almost nothing now:**

1. **`Isoperia.Core` never references UnityEngine.** It already doesn't. Hold this
   line absolutely — it is the future server binary.
2. **All state lives in `GameState`**, serializable and sanitized. Already true.
3. **The client never decides an outcome.** Damage, loot, XP and gathering resolve
   in Core against the seeded RNG. In v1 the "server" is a local Core instance; in
   v2 it's a process on a machine. Same code path.
4. **Everything is tick-quantized.** Already true — this is what makes
   authoritative-with-prediction feasible.
5. **Player input is a command, not a mutation.** `MoveTo(x,z)`,
   `UseAbility(id,target)` — never `transform.position = ...`. Commands serialize
   over a wire unchanged.
6. **Instanced spaces from day one** (housing, dungeons). That boundary is painful
   to add later.
7. **No client-side authoritative timers.** Cooldowns, respawns and crop growth all
   tick in Core.

**MMO features deferred but designed-for:** chat, parties, guilds (guild buildings
exist in the fiction from Act II — the shell is there), trading, a player market
(`ShopSystem` is the seed), shared world bosses, names and titles, modular
character customization.

**Honest scope note:** an MMO is a multi-year, multi-person undertaking with real
server, hosting and moderation costs. This plan doesn't make that cheap — it makes
it *possible*, by ensuring v1 doesn't have to be thrown away. Ship the
single-player game and let its reception fund the conversion.

---

## 13. Production plan (solo-dev realistic)

Milestones gate on *demonstrable quality*, not feature counts.

| M | Name | Deliverable | Gate |
|---|---|---|---|
| **M0** | Beauty proof | The Shorelands alone: sculpted terrain, water, grass, sky, time-of-day tint, third-person camera. **Running at 30 FPS on a real mid-range phone.** No systems. | **Does it look beautiful on a phone?** If no, iterate here and nowhere else. |
| **M1** | Character in world | Joystick + tap-to-move, camera, navmesh + A* rehost, animation state machine | Movement feels good for 5 minutes straight |
| **M2** | Combat feel | Tap-target, 3 abilities, one enemy, full feedback pass | Killing one wolf is satisfying 20 times |
| **M3** | Vertical slice | Shorelands + Hearth's Landing. Act I end to end, diegetic onboarding, save/load. | A stranger plays 45 min on a phone without guidance |
| **M4** | Thornwood + housing | Region 3, housing, Farming, Act II boss, first dungeon | Region passes the §3.2 checklist |
| **M5** | Kingsmoor | Region 4, second dungeon, Act III boss, clue trails | — |
| **M6** | Coldreach + endgame | Region 5, Act IV, titles, fast-travel network complete | Content complete |
| **M7** | Ship v1 | Polish, balance, device-matrix perf pass, store submission, audio mix | Shippable on iOS + Android + PC |
| **M8+** | MMO conversion | §12 | — |

**M0 is the most important milestone in this document.** The prior project's
failure was building systems on top of a world nobody wanted to look at. Do not
repeat it. Buy a cheap test Android device before M0 starts — mobile-first without
a target device is a guess.

**Audio** (§ orchestral + ambience-forward): music used sparingly, rich
environmental ambience carrying most moments — wind, birds, water, fire. This is
both the most immersive and the cheapest option, and it means the 8 existing
tracks are close to sufficient for v1. No voice acting.

---

## 14. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **World authoring is the bottleneck** — one person, five beautiful regions | **High** | M0 measures true per-region cost before committing to five. Cut to three if M0 says so. Buy environment kits rather than authoring every prop. |
| **Mobile budget kills the beauty** | **High** | Budget is fixed in §6 *before* art production, not discovered after. M0 gates on a real device. Style choice (painterly, low-poly) is already the mobile-friendly one. |
| Character customization is thin on one mesh | Medium | v1: colour/hair/gear variety. Modular system budgeted at the MMO milestone. |
| Scope creep back into settlement sim | Medium | Pillars. `LabourSystem` stays unwired. |
| Combat feel underestimated | Medium | M2 is its own gate. Don't proceed until one wolf is fun. |
| Death penalty tuning drives players off | Medium | Tier is region data, not code — retune freely from playtest. Start forgiving. |
| MMO conversion never happens | Medium | v1 must be complete and satisfying solo. It's designed to be. |
| Art coherence drift over a long solo build | Medium | Palette lock per region; style lock in every generation prompt (already in `promptsfor3dmodels.md`). |
| Store submission friction (first mobile ship) | Low | Budget two weeks in M7 for certification, store assets, age rating, privacy policy. |

---

## 15. What we are explicitly not building

Stated so it can't creep back in: offline/idle progression · villager labour
automation · settlement management sim · isometric or fixed camera · procedurally
generated terrain · 99-level grind curves · action combat with client-side dodging
· voxel/destructible terrain · classes · voice acting · a launch MMO.

---

## Appendix A — Open decisions

1. **Business model** — deliberately deferred (§ "build it first"). Options and
   their design implications: premium (no in-game design impact); cosmetic-only F2P
   (needs a cosmetics pipeline, best combined with modular characters at the MMO
   milestone); subscription/RuneScape model (free starting regions, subscription
   unlocks the rest — proven for this genre and funds servers). **Decide before
   M6**, because the region-gating shape has to be designed in if subscription wins.
2. **Arcane style scope** — full third style, or a lighter utility/support kit?
3. **Region count** — five is the plan; M0's measured cost decides three vs five.
4. **Time-of-day gameplay effects** — cosmetic only, or do night spawns differ?
5. **Whether the repo/package should be renamed** from `isorpg` to `alderfell`.

## Appendix B — Immediate next steps

1. Buy a mid-range Android test device.
2. Build **M0**: the Shorelands beauty proof. Terrain, water, grass, sky, camera.
   Nothing else. Judge it on the phone, against the games named in §0.
3. Revise `docs/ART_BIBLE.md` against §3.2's craft rules and §6's budget.
4. Strip `LabourSystem` and offline gathering from the active wiring (retain code).
5. Rescale `XpTable` to the level-50 curve and re-baseline the tests.
6. Fill in the equipment stat tables (currently all zeros) against the §4.3 model.
