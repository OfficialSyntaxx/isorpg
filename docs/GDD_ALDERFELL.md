# Alderfell — Game Design Document

**Version** 5.0 · **Date** 2026-09-02 · **Status** Design lock, M0 ready to start
**Engine** Unity 6.0.5 (6000.5.8f1) URP · **Platform** Mobile-first (iOS/Android), PC parity from one build
**Genre** Third-person high-fantasy action-RPG with skill progression
**Scope posture** Solo dev + AI tooling, **zero cash budget**. Systems are costed
in time and licence, not money. Cut lines are explicit.

> **v5.0 changes:** made the document actionable by an agent working
> unsupervised. Added a Start here index, §27 player goals (collection log,
> achievements, titles), §28 endgame, §29 save versioning and migration, §30
> Unity project conventions, §31 code conventions and the command catalogue,
> §32 definition of done, §33 the verified content schema reference, §34 testing
> strategy, §35 glossary, and §36 the M0 task breakdown.
>
> **v4.0 changes:** added §22 business model,
> distribution and telemetry (free and unmonetized, itch.io, local-only
> analytics), §23 combat specification (camera, abilities, enemy AI, feedback —
> the M1/M2 blockers), §24 the first ten minutes, §25 reach and polish
> (localization, accessibility, audio, the 12-screen UI inventory), and §26
> audience and community.
>
> **v3.0 changes:** the technical half. Added §16 tech stack and
> architecture, §17 toolchain, §18 world construction, §19 art production,
> §20 build/CI/distribution, §21 working with AI agents. The paid Meshy/
> Higgsfield asset pipeline is **removed** throughout and replaced with a
> zero-cost Blender + Mixamo + CC0 pipeline.
>
> **v2.0 changes:** platform reversed to mobile-first; added the performance
> budget and UX sections. Title, death, loot, quests, character, narrative,
> travel and group content resolved.

---

## Start here

**If you are an agent or a new collaborator picking this project up cold, read
this section, then §1 (pillars), §16 (architecture), and §36 (the current
milestone). That is enough to start work. Read the rest as it becomes relevant.**

| I need to… | Read |
|---|---|
| Understand what game this is | §0, §1 |
| Know what to build next | §36 (M0), then §13 |
| Write C# in Core | §16.2, §31, §34 |
| Add or edit game content | §33, §16.3, `.claude/skills/add-content/` |
| Build or dress a region | §3.2, §18, `.claude/skills/build-region/` |
| Bring in an asset | §19, `docs/ASSET_ADMISSION.md`, `.claude/skills/import-asset/` |
| Know if something is finished | §32 |
| Understand a term | §35 |
| Know what we deliberately don't do | §15 |

**The five rules that override everything else:**

1. `Isoperia.Core` must never reference `UnityEngine` (§16.2).
2. The Unity layer decides nothing — Core resolves every outcome (§16.2).
3. Art that misses the performance budget is rebuilt, not shipped (§6).
4. A region that fails the craft checklist is not finished (§3.2).
5. Nothing in this project costs money (§17).

**When this document and the code disagree,** the document is the intent and the
code is the fact. Say so rather than silently following either — the mismatch is
usually the interesting information.

**When something here is ambiguous,** prefer the reading that serves the pillars in
§1, and flag the ambiguity rather than inventing a resolution.

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

### 2.3 Pipeline — replaced, not inherited

The previous project's asset pipeline ran on **paid Meshy/Higgsfield credits**
(5 to rig a mesh, 8 with an animation clip). That account is on the free tier with
a zero balance, so the pipeline cannot produce a single asset. Under a zero-cash
constraint it is **removed from the plan entirely** — see §19 for the replacement
(Blender + Mixamo + CC0 libraries, all free and commercially licensed).

Two things from it survive, and they're the valuable parts:

- **The 24-bone humanoid rig standard**, shared across every existing character.
  Mixamo's rig maps onto Unity's Humanoid system, which gives the same benefit:
  one animation set retargeted across every humanoid.
- **The style-lock prompt discipline** in `promptsfor3dmodels.md` — a fixed style
  paragraph appended to every asset request. That principle now governs CC0 asset
  selection and Blender authoring instead of text-to-3D generation.

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
See §19. In short: CC0 and Unity Asset Store free packs supply the bulk, Blender
authors what must be unique, Mixamo rigs and animates every humanoid, and one
shared gradient atlas makes assets from a dozen sources look like one game.

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
repeat it.

**On the test device:** builds go to your iPhone via Xcode free provisioning
(§20.4), which costs nothing. But an iPhone is far more powerful than the
mid-range Android in §6's budget, so **the budget stays the spec and the iPhone is
only the convenience target** — otherwise the game is tuned to hardware most of
the market doesn't have. Use the free Android Studio emulator on the Mac mini as
the lower-bound sanity check until real Android hardware is available.

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
· voxel/destructible terrain · classes · voice acting · a launch MMO · **ads,
in-app purchases, or any monetization in v1** (§22) · **remote telemetry** (§22.3)
· auto-rotating combat camera (§23.1) · tutorial text boxes (§24).

---

## 16. Tech stack and architecture

### 16.1 The stack

| Layer | Choice | Why |
|---|---|---|
| Engine | **Unity 6000.5.8f1, URP 17.5** | Already the project's version. URP is the mobile-appropriate pipeline. |
| Language | **C#** | The whole simulation is already written in it. |
| Rendering | URP Forward+, baked lightmaps, single directional light | §6 budget |
| Input | **Unity Input System 1.20** (installed) | One action map serves touch, gamepad and keyboard — required for mobile + PC parity. |
| Streaming | **Addressables 2.11** (installed) | Region streaming and download-size control. |
| Model import | **glTFast 6.19** (installed) | GLB import; the existing assets are GLB. |
| Serialization | **Newtonsoft.Json 3.2** (installed) | Content and saves. |
| Testing | **Unity Test Framework 1.4** + NUnit | The Core suite already runs on it. |
| UI | **UI Toolkit (UIElements)** | Better than uGUI for resolution-independent mobile UI; retained `com.unity.ugui` for legacy. |
| Version control | **Git + Git LFS** on GitHub | Already in place. See §20.3. |

### 16.2 The architecture rule that everything else hangs off

```
┌──────────────────────────────────────────────────┐
│  Isoperia.Core   (asmdef: noEngineReferences)    │
│  ─────────────────────────────────────────────   │
│  Tick · RNG · combat math · skills · inventory   │
│  crafting · quests · clues · A* · save · content │
│                                                  │
│  Knows nothing about Unity. Runs in any C#       │
│  runtime. THIS IS THE FUTURE SERVER.             │
└──────────────────────────────────────────────────┘
             ▲ commands            │ state
             │                     ▼
┌──────────────────────────────────────────────────┐
│  Isoperia.Unity   (presentation only)            │
│  Rendering · animation · input · audio · UI      │
│  Reads Core state, sends Core commands.          │
│  Decides nothing.                                │
└──────────────────────────────────────────────────┘
```

`Isoperia.Core.asmdef` is declared `noEngineReferences: true`. **This line is the
most valuable asset in the repository** and must never be removed. It is what
allows: the whole simulation to be tested with no Unity licence (so CI is free —
§20.1), and the same binary to become an authoritative server later (§12) instead
of being rewritten.

**The one-way rule:** the Unity layer may read Core state and send Core commands.
It may never compute an outcome. Damage, loot, XP, gathering success, crop growth
and cooldowns all resolve inside Core against the seeded `Mulberry32` RNG.

**Commands, not mutations.** Player intent enters Core as a command object —
`MoveTo(x,z)`, `UseAbility(id, targetId)`, `Gather(nodeId)` — never as a direct
state write and never as `transform.position = …`. Command objects serialize over
a wire unchanged on the day there is a wire.

### 16.3 Content architecture — JSON is the source of truth

Content (items, monsters, recipes, quests, drop tables, buildings, XP) lives as
**JSON files loaded by `ContentDatabase`**, not as ScriptableObjects.

- `ContentDatabase` already takes a **reader delegate** rather than touching the
  filesystem: Unity passes one backed by `Resources`, tests pass one backed by
  `File.ReadAllText`, and a future server passes one backed by its own store.
  This is already correct and needs no change.
- **Retire the TypeScript export step.** Content is currently generated by
  `scripts/export-content.cjs` from `src/data/*.ts` — the dead prototype. The JSON
  becomes hand-authored source of truth, and the exporter is deleted.
- **Fail loudly.** `ContentException` is thrown on missing or malformed content and
  there is deliberately no fallback path. Keep this. The prior project shipped a
  fallback catalog that silently clamped a 2400-coin payout to 500.
- A **schema validator runs in the test suite** (§20.1), so malformed content fails
  CI rather than shipping.

### 16.4 Saves — local now, server-shaped

Keep the existing sanitized-JSON save with rollback recovery. Route every read and
write through a single `ISaveStore` interface with a device-storage implementation
today; a server-backed implementation later replaces one class. Sanitization on
load is non-negotiable and already implemented — it is also exactly the validation
an authoritative server needs against hostile clients.

---

## 17. Toolchain — what we have, and what it costs

**Everything below is free.** Nothing in this project requires a purchase until
store submission (§20.4).

| Tool | Cost | Role |
|---|---|---|
| **Unity 6 Personal** | Free under the revenue threshold | Engine |
| **Blender** | Free | Hero landforms, kit pieces, unique assets, retopo, UV, bakes |
| **Mixamo** | Free, commercial use permitted | Auto-rigging + ~2,500 mocap animations |
| **Xcode** | Free | iOS builds and on-device install (§20.4) |
| **Mac mini M4** | Owned | Build machine. Apple Silicon builds Unity and Xcode fast. |
| **iPhone** | Owned | On-device testing |
| **GIMP / Krita** | Free | Texture and atlas work |
| **Audacity** | Free | SFX editing |
| **CC0 asset libraries** | Free | Quaternius, Kenney, Poly Haven, ambientCG, OpenGameArt, Freesound |
| **Unity Asset Store free tier** | Free | Unity-ready packs with prefabs and LODs |
| **Claude Code (remote)** | Subscription owned | Design, C# systems, content JSON, tooling, docs — this repo |
| **Claude Code (local) + Unity MCP** | Subscription owned | Driving the Unity Editor: scenes, prefabs, terrain, tests |
| **Claude Code (local) + Blender MCP** | Subscription owned | Driving Blender: landforms, kit pieces, exports |
| **GitHub + Actions** | Free for public repos | Hosting and CI |

**Removed from the plan:** Meshy, Higgsfield, Tripo and every other paid
generation service. They are not required and the account has no balance.

### 17.1 The two-machine split

This matters for how work is assigned:

- **Remote sessions (this repo)** have no Unity and no Blender. They do design,
  architecture, C# systems, content JSON, shaders, CI, tooling and documentation.
- **Local sessions on the Mac mini** have the Unity MCP and Blender MCP bridges.
  They do everything that requires an editor: sculpting terrain, placing assets,
  building prefabs, wiring scenes, importing and atlasing meshes, running builds.

The repo is set up so a local session can pick up work without re-deriving the
design — see §21.

---

## 18. World construction — the four-layer method

Locked. Each layer owns something the others physically cannot produce.
*Visual reference: the four-layer landscape diagram.*

| # | Layer | Owns | Tool | Budget/region |
|---|---|---|---|---|
| 1 | **Unity Terrain** | Walkable ground, collision, LOD, streaming | Unity | ~25k tris, 2–4 draw calls |
| 2 | **Hero landforms** | Silhouette — cliffs, arches, plateaus, cave mouths | Blender | 4–8 meshes, 2–5k tris each |
| 3 | **Modular kit** | The built world — walls, roofs, stairs, ruins | CC0 + Blender | ~15 pieces, GPU-instanced |
| 4 | **Scatter** | Grass, trees, rocks, undergrowth | CC0 + Unity detail system | ~40k tris, billboard LOD |

**Fully dressed region: ~120k triangles, ~20–39 draw calls, 3 materials** — inside
the §6 budget with headroom for actors, VFX and UI.

Layer 2 is the one that looks skippable and isn't. Unity Terrain is a heightfield:
it can undulate but never overhang, so it cannot make a cliff face, a sea arch or
a pierced rock. Those are the shapes that give a region a readable skyline, and
§3.2's rule that every region needs a landmark visible from its neighbour is
satisfied at layer 2 or not at all.

### 18.1 The region build order

1. **Block out the heightfield** in Unity Terrain — masses and paths only, no
   detail. Walk it. If the shape is boring in grey, it will be boring in green.
2. **Sculpt the hero landforms** in Blender against that blockout and place them.
   The region's skyline, and the neighbouring region's view of it, is decided here.
3. **Flatten the terraces** the built world needs, then assemble structures from
   the kit. The landmark goes up first; everything else composes around it.
4. **Paint and scatter** — ground textures, then vegetation, then props. Jitter
   rotation and scale on everything.
5. **Light and fog it**, then stand at each of the three framed reveals (§3.2 rule
   4) and screenshot **on the phone**. If a shot isn't worth keeping, the region
   isn't finished.

---

## 19. Art production — zero-budget pipeline

### 19.1 The shared gradient atlas — the keystone decision

Every prop, landform, kit piece and terrain texture UV-maps to **one small
gradient palette texture**. This is standard practice for stylized mobile games
and it solves three problems at once:

- **Coherence.** Assets pulled from four different CC0 sources stop looking like
  they came from four different games, because they are all literally sampling the
  same colours. This is what makes free-asset sourcing viable at all.
- **Performance.** One material for the whole world. Hundreds of objects batch into
  a handful of draw calls, and texture memory is nearly zero.
- **Iteration.** Re-grading a whole region is editing one small image.

**Sourcing:** adopt a proven CC0 stylized palette as the base and tune it, rather
than authoring from scratch. Each region gets a ≤5-hue lock (§3.2 rule 7) drawn as
a band of that atlas, so regions read as distinct without needing separate
materials.

**Characters are the exception** — heroes and bosses get their own textures,
because that's where the player actually looks.

### 19.2 Models

Priority order, cheapest first:

1. **Unity Asset Store free packs** — already Unity-ready with prefabs, LODs and
   colliders. Fastest route to a populated scene.
2. **CC0 libraries** — Quaternius (stylized low-poly fantasy sets), Kenney, Poly
   Haven, ambientCG. Verify licence, then re-UV to the atlas.
3. **Blender** — for anything that must be unique or must sit on a silhouette:
   hero landforms, Hearth's Landing's landmark buildings, key props.

Every incoming asset passes the **asset admission gate** (`docs/ASSET_ADMISSION.md`):
licence recorded, triangle count checked, re-UV'd to the atlas, LODs present,
scale and pivot corrected. An asset that fails the gate doesn't enter the project.

### 19.3 Rigging and animation — Mixamo

This directly replaces the paid rigging pipeline.

1. Export the mesh from Blender as FBX in T-pose.
2. Upload to **Mixamo** → auto-rig (free, commercial use permitted).
3. Pick animations from Mixamo's library — idle, walk, run, attack variants, hit
   reaction, death, gather.
4. Download as FBX **"without skin"** for the clip set, and once **with skin** for
   the rigged mesh.
5. Import to Unity, set the rig to **Humanoid**, and Unity's avatar system
   retargets every clip across every humanoid automatically.

**The retargeting is the multiplier.** One animation set — roughly 12 clips —
serves the player, every villager, every guard, every humanoid enemy. Non-humanoid
creatures (wolf, imp, husk) need their own clips; keep those few and reuse them
across variants.

**Existing GLBs:** re-export through Blender to FBX before Mixamo, and re-role per
§8.3. Their existing 24-bone rig maps onto Humanoid.

### 19.4 Audio
Ambience-forward (§13). The 8 existing tracks cover v1 regions. New SFX come from
**Freesound** (filter to CC0) edited in Audacity. No voice acting.

---

## 20. Build, CI and distribution

### 20.1 CI — two workflows

The repository's six existing workflows (Vite build, Lighthouse, WebGL, web
deploy, site preview) target the dead three.js prototype. **Delete them.**

| Workflow | Runs | Why |
|---|---|---|
| **`core-tests.yml`** | Every push | Builds `Isoperia.Core` with plain `dotnet` and runs the NUnit suite. **No Unity licence needed** because Core is `noEngineReferences`. Seconds, not minutes. This protects the 80% of the project that carries over. |
| **`unity-build.yml`** | Every push to main + manual | GameCI: Unity Editor tests, then iOS and Android player builds. Needs a Unity licence in repository secrets. Slow, but catches project-level breakage the C# tests can't see. |

GitHub Actions is free for public repositories, so runner minutes are not the
constraint — Unity build *time* is. Keep `unity-build.yml` off the every-push path
for feature branches.

A **content schema validator** runs inside the Core suite, so malformed content
JSON fails CI rather than shipping.

### 20.2 Build targets

| Target | Built on | Purpose |
|---|---|---|
| **macOS (Apple Silicon)** | Mac mini | Daily iteration. No signing, no device, instant. The fastest loop you have. |
| **iOS** | Mac mini → Xcode → iPhone | Real performance truth. Milestone gates. |
| **Android** | Mac mini | The actual spec target (§6). No device — validated via the free Android Studio emulator, and on real hardware before ship. |

### 20.3 Asset storage

Stay on **Git LFS**. The root `.gitattributes` is currently missing LFS rules —
only `unity/.gitattributes` has them — so binaries outside `unity/` are being
committed as raw blobs. Fix that first.

GitHub's free LFS allowance is roughly **1 GB storage and 1 GB/month bandwidth**.
That is a real ceiling for a 3D project. Mitigations, in order: commit only
game-ready optimized assets (keep multi-hundred-MB `.blend` working files out of
the repo), watch the quota, and migrate to Unity Version Control (5 GB free for
solo use) if it fills.

### 20.4 Distribution — the honest picture

**Development costs nothing.** Xcode free provisioning installs builds onto your
own iPhone with a free Apple ID: 7-day signature expiry, up to 3 apps, re-sign by
rebuilding. That covers the entire development period.

**Shipping to iOS costs $99/year.** There is no legitimate way around it — TestFlight,
the App Store and any distribution beyond your own device all require the paid
Apple Developer Program.

**On the browser/PWA idea:** it doesn't work for this game. Unity does not support
WebGL on mobile browsers, and iOS Safari's memory ceiling and texture-compression
gaps make a streamed 3D RPG unviable there. It was the right answer for the old
three.js prototype and is the wrong one for Alderfell. Don't spend time on it.

**Therefore: ship Android first.** Google Play is a **$25 one-time** fee versus
Apple's $99/year, and Android additionally permits free direct APK distribution
with no store at all. Android is also the §6 spec target. iOS becomes the second
platform, funded by the first if it earns anything.

---

## 21. Working with AI agents

This project is built by a solo dev with AI assistance across two machines, so the
repository is deliberately set up to be agent-legible.

| Artifact | Purpose |
|---|---|
| **`CLAUDE.md`** | Project context loaded automatically by every session: pillars, the architecture rules, the performance budget, what must never be touched. Stops a session re-deriving the design or breaking `noEngineReferences`. |
| **`.claude/skills/build-region/`** | The §18.1 region build order as a repeatable procedure, ending in the §3.2 craft checklist. |
| **`.claude/skills/import-asset/`** | The §19.2 admission gate as a procedure: licence, tris, atlas re-UV, LODs, scale, pivot. |
| **`.claude/skills/add-content/`** | Adding an item, monster, recipe or quest to the content JSON against the schema, with the validator run. |
| **`docs/ASSET_ADMISSION.md`** | The gate itself, in prose, with the licence ledger. |
| **Content schema + validator** | Machine-checked content, failing in CI. |

**Division of labour:** remote sessions do design, C#, content and tooling; local
sessions with the Unity and Blender MCP bridges do editor work (§17.1). Both read
the same `CLAUDE.md` and skills, so they stay in agreement about what the game is.

---

## 22. Business model, distribution and telemetry

### 22.1 The posture: free, unmonetized, portfolio-first

**Alderfell v1 ships free with no monetization in the design.** No price, no ads,
no in-app purchases, no live service.

This is a decision, not a deferral, and it buys real things:

- **No monetization pressure on design.** No armour piece is secretly a store SKU;
  no progression curve is secretly a friction dial. Given P1 and P2, this matters
  more here than in most projects.
- **No compliance surface.** No payment processing, no entitlement server, no
  receipt validation, no refunds, no purchase-related privacy obligations.
- **No infrastructure.** Which is what "zero cash budget" actually requires.

**Cosmetics are the eventual model, at the MMO milestone — not v1.** Cosmetic
revenue needs three things this project won't have until then: an audience of
meaningful size (a low single-digit share of players ever buy anything), *visible*
customization to sell (the modular character system, §8.1, deferred to the MMO
milestone), and purchase infrastructure. Building a store before any of those
exist is work spent on an empty room. When modular characters arrive because
multiplayer needs them, cosmetics become nearly free to add on top — that is the
right moment, and the architecture doesn't need to anticipate it.

### 22.2 What shipping actually costs

| Route | Cost | Notes |
|---|---|---|
| **itch.io** | **$0** | No fee to publish. Hosts macOS/Windows/Linux builds and Android APKs, supports free and pay-what-you-want. **The v1 target.** |
| Direct APK | $0 | Android permits installing outside a store. Good for testers. |
| Google Play | $25 one-time | Optional. Worth it only if the game earns an audience. |
| Apple App Store | $99/year | Development on your own iPhone stays free via Xcode provisioning (§20.4). Only pay this if iOS distribution becomes the point. |

**So a portfolio ship costs nothing.** That is the plan of record: itch.io first,
Google Play if it deserves it, Apple only if there's a reason.

### 22.3 Telemetry — local only

The game writes balance and performance data to a **local file on the device it
runs on**. You read it off your own test devices. Nothing is transmitted.

Recorded: time per region, deaths per zone, skill XP rates, ability usage, combat
duration, frame time percentiles, and where players stop playing.

Because nothing leaves the device, there is **no privacy policy, no consent flow,
no GDPR or COPPA surface, and no backend**. This is the correct trade at this
scale: the balance signal from watching five people play in person, plus their
device logs, is better than aggregate data from an audience you don't have yet.

If remote telemetry is ever wanted, it is additive — the same event stream gains a
transmitter, behind consent.

---

## 23. Combat specification (M1–M2 blockers)

M1 and M2 are the next milestones after M0, and neither can start from §5's
summary. This section is the buildable detail.

### 23.1 Camera

| Property | Value |
|---|---|
| Type | Third-person orbit, spring-arm follow |
| Default distance | 6m, pitch ~18° down |
| Range | 3m (close) – 9m (wide), pinch or scroll |
| Collision | Arm shortens on geometry; never clips through terrain |
| Follow | Position lerp ~10/s; rotation only on player input, never auto-turn |
| Combat framing | Distance eases to 7m so the target and telegraph both fit |
| FOV | 60° vertical; portrait-height framing checked at 6" (§3.2 rule 9) |

**Never auto-rotate the camera during play.** Auto-turn on a touchscreen fights
the thumb that is already dragging it, and it steals the player's view of the
world — which is the product.

### 23.2 Resources and the tick

- **Stamina** (melee/ranged) and **mana** (arcane). Out of combat both regenerate
  fully in ~6s; in combat, slowly.
- **Global cooldown: 1 tick (600ms).** Every ability respects it, so the hotbar
  can never out-pace the simulation.
- Auto-attack continues on its weapon speed underneath abilities.

### 23.3 Abilities — six per style at v1

Unlocked by skill level and guild rank. All damage resolves in
`CombatMath` — abilities supply multipliers and effects, never their own rolls.

**Melee** — stamina, close range, built around committing.

| Ability | Cost | CD | Effect |
|---|---|---|---|
| Cleave | 15 | 3t | 1.4× damage to target + adjacent |
| Sunder | 20 | 8t | 1.2× damage, −20% target defence for 10t |
| Bulwark | 15 | 15t | +40% defence for 8t |
| Rally | 25 | 20t | Heal 20% max HP |
| Overhead | 30 | 12t | 2.2× damage, 2t wind-up the enemy can interrupt |
| Execute | 25 | 10t | 3× damage to targets below 25% HP |

**Ranged** — stamina, 5-tile reach, built around kiting.

| Ability | Cost | CD | Effect |
|---|---|---|---|
| Aimed Shot | 15 | 3t | 1.5× damage |
| Crippling Shot | 20 | 10t | 1.1× damage, −40% target move speed for 6t |
| Volley | 25 | 12t | 0.7× damage to all enemies in a cone |
| Disengage | 15 | 15t | Leap backwards 4m |
| Hunter's Mark | 10 | 20t | +25% damage taken by target for 15t |
| Piercing Bolt | 30 | 14t | 1.8× damage, ignores 50% defence |

**Arcane** — mana, 5-tile reach, built around control and burst.

| Ability | Cost | CD | Effect |
|---|---|---|---|
| Ember Bolt | 12 | 2t | 1.3× damage |
| Frost Chain | 20 | 10t | 1.0× damage, roots target 3t |
| Ward | 18 | 15t | Absorbs damage equal to 15% max HP for 10t |
| Mend | 25 | 12t | Heal 25% max HP over 5t |
| Arcane Surge | 30 | 18t | 2.4× damage |
| Displace | 15 | 20t | Blink 5m in the facing direction |

**Balance intent, not final numbers.** These are the starting point for M2's
"killing one wolf is satisfying twenty times" gate; expect them to move.

### 23.4 Enemy AI

A small state machine per enemy, ticking in Core:

```
Idle ──sees player──> Alert ──in range──> Engage ──lost player──> Search ──> Idle
                                             │
                                        low HP + flees? ──> Flee
```

| Rule | Value |
|---|---|
| Aggro radius | Per-monster `aggroRange` (already in content) |
| Vision | Cone ~120°, blocked by terrain — never through a cliff |
| Leash | 25m from spawn, then reset and heal fully |
| Search | 5s at last known position before returning |
| Telegraph | Every attack above 1.5× damage has a **≥1t wind-up** with a distinct animation and ground marker |
| Pack behaviour | Aggro spreads to allies within 8m |

**The telegraph rule is not optional.** It is the whole difference between combat
and tapping a health bar, and it must read at phone size.

### 23.5 Combat feedback — where the M2 budget goes

The math already works. What makes it *feel* good:

- Hit-stop: 60–80ms freeze on a landed hit, 120ms on a crit
- Floating damage numbers, crits larger and distinct in colour **and** shape
- Screen shake on crits only, subtle, respecting a reduce-motion setting
- Distinct impact SFX per weapon class and per material struck
- Enemy flinch animation on hit; a real death animation, never a despawn
- Ability VFX as flipbooks/sprites rather than particle systems (mobile budget)
- Low-HP vignette and a heartbeat cue

---

## 24. The first ten minutes

The diegetic onboarding (§7.4) as an actual beat sheet. This is the most
important ten minutes in the game and the M3 gate depends on it.

| Beat | Time | Teaches | How |
|---|---|---|---|
| Wake on the shore | 0:00 | Look and move | No UI but the joystick. Waves, gulls, wreckage. The camera opens facing the sea, then the player turns and finds land. |
| The wreck | 0:30 | Interact | One crate, glinting. Yields a knife and a scrap of food. The contextual button appears only when close. |
| Driftwood | 1:30 | Gathering + skills | Choppable driftwood on the beach. First XP popup. Woodcutting is now on the skills screen, which is now worth opening. |
| The crab | 3:00 | Combat basics | One weak enemy, telegraphed attack, beatable with the knife. Death here is harmless (Safe tier). |
| Cook it | 4:30 | Crafting + survival | A driftwood fire. Raw crab → cooked. Healing is now understood. |
| The climb | 6:00 | Traversal and vista | A switchback up the cliff. Elevation reveals the bay behind you. **First framed reveal.** |
| The clifftop | 7:30 | The goal | Hearth's Landing's bell tower and smoke, across the valley. Nothing tells you to go there. **This is the hook.** |
| The road | 9:00 | The world is bigger | A signpost, a second path into Thornwood you're too weak for, and a wolf howl from it. |
| Arrival | 10:00 | Act I proper | The town gate, a guard who greets a stranger, and the game opens up. |

**Rules:** no tutorial text boxes; at most one contextual hint per system, once.
Nothing is gated behind a "press X to continue". A player who ignores every hint
and simply walks must still reach the clifftop.

---

## 25. Reach and polish

### 25.1 Localization architecture — English only at v1, but built for more

Retrofitting localization is expensive; building for it is nearly free.

- **No user-facing string is ever a literal in code.** Every string is a key into a
  locale JSON, loaded through the same reader delegate as content (§16.3).
- Locale files live beside content: `Resources/Locale/en.json`.
- **Never concatenate sentences.** Use positional placeholders (`"You gained {0}
  {1}."`) — word order differs between languages.
- UI must survive ~40% text expansion. German and Finnish are the usual killers.
  Layouts wrap and grow; never fixed-width text boxes.
- Fonts: pick a face with broad Latin + Cyrillic coverage now; CJK needs a separate
  atlas and is out of scope for v1.
- A test asserts **no orphaned or missing keys** — the same discipline as
  `ContentValidator`.

Ship English. Adding a language later is then a translation job, not a refactor.

### 25.2 Accessibility

| Area | Requirement |
|---|---|
| Colour | Never colour alone — damage type, rarity, threat all carry a shape or icon too |
| Text | Scalable UI text, minimum 14pt at phone size, high-contrast option |
| Motion | Reduce-motion setting disabling screen shake, hit-stop and camera sway |
| Flashing | No flashing above 3Hz anywhere |
| Input | Full one-handed play via tap-to-move; left-handed layout mirroring; remappable buttons |
| Difficulty | Damage-taken multiplier in settings, no achievement penalty |
| Subtitles | All dialogue readable and dismissible at the player's pace, never timed |
| Audio | Independent music/SFX/ambience sliders; no information conveyed by sound alone |

### 25.3 Audio design

Ambience-forward (§13). The mix, in priority order:

1. **Ambience bed** — per-region loop: wind, surf, forest, cave drip. Always present.
2. **Diegetic detail** — birds, insects, creaking timber, distant bells. Randomized
   one-shots with position, so the world sounds inhabited rather than looped.
3. **Player feedback** — footsteps by surface, tool impacts, combat hits. Loudest.
4. **Music** — sparing. Enters on discovery, combat and boss encounters; silent
   often, so its arrival means something.

The 8 existing tracks map onto the regions (§3.1). New SFX come from Freesound
(CC0), edited in Audacity. **Silence is a tool** — a region that is quiet except
for wind reads as vast.

### 25.4 UI screen inventory

Full-screen modal panels, summoned (§7.2). Everything the game needs:

| Screen | Contents |
|---|---|
| HUD (in-world) | Joystick, contextual interact, health/resource, ability bar — fading per §7.2 |
| Inventory | Grid, item detail, use/drop/equip |
| Character | Equipment slots, derived stats, appearance |
| Skills | 12 skills, levels, XP bars, mastery detail |
| Map | Hand-drawn world map, discovered regions, fast-travel nodes |
| Quest log | Active and completed, current objective, no auto-tracking arrows |
| Crafting | Recipe list by skill, ingredient availability, quality preview |
| Housing | Placement mode, furniture catalogue, room upgrades |
| Shop | Buy/sell, price, stock |
| Codex | Optional depth: mechanics reference, bestiary, lore found in the world |
| Settings | Audio, graphics preset, accessibility, controls, save management |
| Title / save select | New game, continue, settings |

**Twelve screens is the real UI cost of this game.** It is routinely
underestimated and it is a substantial fraction of M3–M7. Build them plain and
consistent before making any of them beautiful.

---

## 26. Audience and community

Free and unmonetized (§22) doesn't mean unseen. A portfolio project that nobody
watches is worth less than one that a few hundred people follow.

### 26.1 Who this is for

Players who loved RuneScape's sense of *place* and progression but want it in a
real 3D world they can hold — and who are underserved, because mobile RPGs are
mostly gacha and idle games. The pitch that lands with them is precisely the one
that motivated this project: **a world worth looking at, with systems worth
learning, and nothing trying to sell them anything.**

Secondary and honest: the game-dev audience, who reward exactly this kind of
solo-with-AI build being shown openly.

### 26.2 How they find it

- **A devlog is the marketing.** Short, regular posts showing the world coming
  together — screenshots of framed reveals, before/after terrain, the four-layer
  stack. This project's most compelling asset is *watching a beautiful world get
  built*, which is inherently visual and inherently shareable.
- Post where these people are: r/gamedev, r/Unity3D, r/MMORPG, Bluesky/Mastodon
  gamedev communities, and TikTok/Shorts for the visual moments.
- **Screenshot Saturday**, every week, from M0 onward. It's free, it's a deadline,
  and it forces the P1 test to actually happen.
- An itch.io page from M3, updated with each milestone build.

### 26.3 The discipline

- Show the world, not the systems. A terrain sculpt timelapse outperforms a
  combat-math explainer every time.
- Post the honest version — including what got cut. That's the content people
  actually engage with, and it costs nothing to be truthful.
- **Never promise dates.** Solo timelines slip; a missed public date converts
  goodwill into disappointment.
- Do not announce the MMO. Announce the game you're actually shipping. The
  multiplayer path is architecture, not a promise.

---

## 27. Player goals — the collection log and achievements

Levels and quests tell a player what they *can* do. Neither tells them what to aim
for on a given evening. That scaffolding is the collection log, and it is the
cheapest real content in the project because it adds no systems — it reads state
that already exists.

### 27.1 The collection log

Every obtainable item has a slot. Obtained slots show the item and the count;
unobtained ones show a silhouette and **where it comes from**.

Organized by source, because "where do I go" is the question it answers:

| Category | Entries |
|---|---|
| Monsters | One page per monster, its full drop table, kill count |
| Bosses | The Act II and III bosses, their unique drops, kill count |
| Gathering | Every log, ore and fish, with the node that yields it |
| Crafting | Every craftable, at every quality tier |
| Clue trails | Rewards per tier |
| Quests | Unique quest rewards |
| Housing | Furniture, trophies |

**Why it works here:** it turns the authored world into a checklist without a
single quest marker on screen (§7.2 keeps the minimap off). A player who wants
`wolf_pelt` learns they need Thornwood, and goes and looks at Thornwood — which is
the point of building Thornwood.

**Mechanically:** a `HashSet` of obtained item ids plus per-item counts in
`GameState`, written on every item acquisition, read by the UI. That is the whole
feature. Milestone rewards at completion percentages (25/50/75/100 per category)
give it teeth.

### 27.2 Achievements

`ACHIEVEMENTS` already exists in content as `{id, name, desc}`. Alderfell keeps it
and adds an act-scoped structure: a handful per act, granted for the things the act
is *about* rather than arbitrary counters.

Examples: reach the clifftop; craft your first quality-3 item; kill the Thornwood
ogre without eating; reach level 25 in any gathering skill; discover all three
framed reveals in a region.

**Never award an achievement for something the player can't see the shape of.** A
counter-based achievement with no visible counter is noise.

### 27.3 Titles

Titles are the diegetic half of §4.2's recognition. Earned from achievements and
act progress, displayed by NPCs and (later) other players. They are the answer to
"the realm knows your name" — Castaway, Of the Landing, Barrow-Breaker, Kingsmoor's
Bane, and so on.

---

## 28. Endgame — mastery and completion

Act V (levels 40–50) is not new content. It is the point at which the content you
have becomes the thing you're mastering. This is the honest and correct endgame for
a solo-built game, and it is the reason the collection log matters.

| Pillar | What it asks of the player |
|---|---|
| **The log** | Complete categories. Rare drops, every crafting quality tier, every clue reward. |
| **Skills to 50** | The remaining skills, at the reduced curve (§4.1). |
| **Clue trails** | The hard tier, which spans every region and rewards world knowledge. |
| **Elite variants** | Named/elite versions of existing enemies at higher tiers, in the Deep zones. Reuses meshes with scaling and tinting (§8.3) — near-free content. |
| **The house** | Every functional room at max tier, the trophy case filled. |
| **Titles** | The final ones require completion across several pillars. |

**Explicitly not building** a raid, a season pass, or infinite scaling dungeons.
Those need an audience and a live-service posture the project has ruled out (§22).

**The ending:** the Act IV story beat closes the arc — the realm acknowledges you.
Mastery content continues past it, so there is no "credits then nothing" wall.

---

## 29. Save versioning and migration

Content changes constantly during development and the schema must survive it.

### 29.1 The rules

- **Every save carries `schemaVersion`.** An integer, bumped whenever the shape of
  saved state changes in a way old saves can't be read as-is.
- **Migrations are ordered and cumulative.** A save at v3 loading into a v7 build
  runs migrations 3→4→5→6→7. Each migration is a small pure function, and each gets
  a test with a real fixture of the old shape.
- **Never migrate in place destructively.** Back up the original save first — the
  rollback path already exists in `SaveSystem` and this rides on it.
- **A save from a newer build than the running one is refused**, with a clear
  message. Downgrading silently corrupts.
- **Sanitize after migrating, not before.** The sanitizer's job is hostile or
  corrupt data; the migration's job is old-but-valid data. Running them the other
  way round makes the sanitizer discard fields the migration was about to use.
- **Content ids are the fragile part.** Renaming an item id breaks every save
  holding it. Either don't rename, or add a migration that remaps the old id.

### 29.2 The policy through development

Versioning and migration infrastructure is built **now** — it is much harder to
retrofit. But the *policy* changes at M3:

| Phase | Policy |
|---|---|
| M0–M2 | Breaking changes allowed. Bump the version, write the migration only if a save is worth keeping. |
| **M3 onward** | The vertical slice is playable by other people. Every schema change gets a migration and a test. No exceptions. |
| Post-release | As above, plus: never remove a migration, however old. |

---

## 30. Unity project conventions

So that two sessions on two machines produce a project that looks like one person
built it.

### 30.1 Folder layout

```
unity/Assets/Isoperia/
  Core/          simulation + tests (noEngineReferences — see §16.2)
  Unity/         presentation: MonoBehaviours, views, input, UI
  Art/
    Models/      meshes (.fbx, .glb)
    Materials/   the shared world material + character materials
    Textures/    the gradient atlas, terrain textures
    Shaders/     terrain, vegetation wind, water
  Audio/         Music/ SFX/ Ambience/
  Prefabs/       Actors/ Props/ Kit/ UI/ VFX/
  Scenes/        Bootstrap + one per region
  Resources/
    Content/     the content JSON (§16.3)
    Locale/      locale JSON (§25.1)
  Settings/      URP assets, quality tiers
  Editor/        build and asset-prep tooling
```

### 30.2 Naming

| Thing | Convention | Example |
|---|---|---|
| C# types | PascalCase | `CombatMath`, `RegionStreamer` |
| C# private fields | `_camelCase` | `_currentTick` |
| Content ids | snake_case | `oak_plank`, `dire_wolf` |
| Assets | snake_case, category-prefixed | `tree_oak_a`, `kit_wall_stone_02` |
| Prefabs | PascalCase | `DireWolf`, `OakTree` |
| Scenes | PascalCase region name | `Shorelands`, `HearthsLanding` |
| Locale keys | dotted namespace | `ui.inventory.title` |

### 30.3 Scenes

- **`Bootstrap`** is the only scene in build settings that runs first. It creates
  the Core simulation, loads content, restores the save, then loads a region scene
  additively.
- **One scene per region**, loaded and unloaded additively by the streamer.
  Regions never reference each other's objects directly.
- **Nothing gameplay-critical is placed in a scene by hand** where content JSON
  could describe it. Scenes hold the world; JSON holds the rules.

### 30.4 Layers and physics

| Layer | Use |
|---|---|
| `Terrain` | Ground collision, camera collision |
| `Actor` | Player and NPCs |
| `Interactable` | Nodes, doors, chests — what the contextual button finds |
| `Landform` | Hero landforms; camera-collides, blocks vision |
| `Scatter` | No collision at all |
| `UI` | Canvas |

Vision checks (§23.4) raycast against `Terrain | Landform` only. Scatter must
never block an enemy's line of sight — a bush that hides you is a bug, not stealth.

### 30.5 Addressables

One group per region, plus `Shared` (atlas, characters, UI) and `Audio`. Region
groups load on approach and unload behind, which is what keeps the build under the
§6 size budget.

---

## 31. Code conventions and the command catalogue

### 31.1 The command catalogue

Player intent enters Core as one of these. This list is the contract; add to it
rather than reaching into state.

| Command | Fields | Effect |
|---|---|---|
| `MoveTo` | `x, z` | Path and walk. The only way position changes. |
| `StopMoving` | — | Cancels the path. |
| `Interact` | `targetId` | Context-resolved: gather, talk, open, enter. |
| `SetTarget` | `targetId` | Combat target selection. |
| `UseAbility` | `abilityId, targetId` | Resolved on the next tick, GCD-gated. |
| `EquipItem` / `UnequipItem` | `itemId, slot` | |
| `UseItem` | `itemId` | Eat, drink, read. |
| `DropItem` | `itemId, qty` | |
| `CraftRecipe` | `recipeId, qty` | |
| `PlantSeed` / `HarvestPlot` | `seedId, plotId` | |
| `PlaceFurniture` / `RemoveFurniture` | `itemId, position, rotation` | Housing. |
| `BuyItem` / `SellItem` | `itemId, qty` | |
| `AcceptQuest` / `AbandonQuest` | `questId` | |
| `FastTravel` | `waypointId` | Rejected if the waypoint isn't unlocked. |

**Every command is validated inside Core.** The Unity layer never pre-checks
whether a move is legal or an ability is off cooldown to decide whether to send it
— it sends, and Core accepts or rejects. That is the same discipline an
authoritative server needs against a hostile client, and building it now costs
nothing.

### 31.2 Adding a system to Core

1. Create `Core/Runtime/Systems/<Name>System.cs`. No `using UnityEngine`.
2. Take dependencies as constructor parameters (`IRandom`, `ContentDatabase`,
   `GameState`) — never a static singleton, or it can't be tested or run per-player
   on a server.
3. All randomness through the injected `IRandom`, so a seeded run is reproducible.
4. All timing in **ticks**, never seconds and never `Time.deltaTime`.
5. Write the tests alongside. A system without tests doesn't get merged.
6. If it changes saved state, bump `schemaVersion` and write the migration (§29).

### 31.3 Comment style

This codebase explains **why**, frequently citing the bug that motivated a rule —
see `ContentDatabase`'s note about the fallback catalog that clamped a 2400-coin
payout to 500. Keep that habit. A comment restating what the line does is noise; a
comment recording what went wrong last time is the most valuable text in the file.

---

## 32. Definition of done

Nothing is "done" because it works once on the machine that made it.

**A Core system is done when:** it has tests covering the failure cases as well as
the happy path; it has no `UnityEngine` reference; all randomness goes through
`IRandom`; all timing is in ticks; `core-tests.yml` is green.

**A content addition is done when:** `ContentValidator` passes; every referenced id
exists; it's reachable in game (obtainable, craftable, or dropped); it appears
correctly in the collection log.

**An asset is done when:** it passes every gate in `docs/ASSET_ADMISSION.md` —
licence recorded in the ledger, within budget, re-UV'd to the atlas, LODs present,
scale and pivot correct, verified in a lit scene at phone size.

**A region is done when:** all ten items of the §3.2 craft checklist pass, the
three framed-reveal screenshots are worth keeping, and it holds 30 FPS on device
inside the §18 budget.

**A UI screen is done when:** it works at 6" one-handed; text scales; it survives
40% string expansion; no colour-only information; it opens and closes without
disturbing world state.

**A milestone is done when** its gate in §13 passes — and those gates are
deliberately subjective ("killing one wolf is satisfying twenty times"), because
the failure mode this project is guarding against is shipping something that
technically works and isn't worth looking at.

---

## 33. Content schema reference

The real shapes, as they exist in `unity/Assets/Isoperia/Resources/Content/`.
**Verified against the shipping files** — note that some tables are objects keyed
by id and others are arrays, which is inconsistent but is what the code expects.

| File | Table | Shape |
|---|---|---|
| `items` | `ITEMS` | **object** keyed by id → `{id, name, value, stack, type, desc}`. Key and `id` must match. |
| `items` | `ITEM_ICONS` | object: id → emoji/glyph |
| `items` | `ITEM_ICON_IMAGE_IDS` | array of item ids that have PNG icons |
| `combat` | `MONSTERS` | **object** → `{id, name, hp, level, maxHit, attackRoll, defenseRoll, attackTick, aggroRange, respawnMs, ranged, xp, main[], tertiary[], petTable[]}` |
| `combat` | `WEAPONS` | **object** → `{id, name, itemId, kind, accuracy, maxHit, ticks, requiredAttack}`. `itemId` may be `null` (unarmed). |
| `combat` | `FOODS` | object → `{heal, tier}` |
| `combat` | `ATTACK_STYLES` | object → `{id, name, description, trains, accuracyBonus, maxHitBonus, defenseBonus}` |
| `recipes` | `RECIPES` | **array** → `{id, name, skill, levelReq, ticks, xp, inputs:[{itemId, qty}], output:{itemId, qty}, burnable?}` |
| `skills` | `SKILLS` | object → `{id, name, short, icon, kind}` |
| `skills` | `RESOURCES` | object → `{nodeType, skill, levelReq, ticksPerAction, maxUses, depletes, toolTier, yield, masteryKey, drops:[{itemId,min,max,weight}]}` |
| `buildings` | `BUILDINGS` | object keyed by UPPERCASE → `{name, desc, effect, icon, levelReq, maxCount, buildXp, baseCost:[{itemId,qty}]}` |
| `farming` | `SEEDS` | object → `{id, name, levelReq, growMs, xp, masteryKey, produce:{itemId,min,max}}` |
| `clues` | `CLUE_TIERS` | object → `{name, itemId, minRing, maxRing, coins:{min,max}, loot:[{itemId,min,max}]}` |
| `quests` | `QUESTS` | **array** → `{id, title, summary, doneText, starterType, target, count, reward…}` |
| `achievements` | `ACHIEVEMENTS` | **array** → `{id, name, desc}` |
| `npcs` | `VILLAGERS` | **array** → `{id, kind, home:{x,y}, lines:{context:[…]}}` |
| `xp` | `XP_TABLE` | array of cumulative XP thresholds |
| `shop` | `STOCK` | **array** → `{itemId, price}` |

**Drop table shapes differ by table and this matters:**
`main` entries are `{itemId, min, max, weight}` and are rolled once per kill against
the summed weights. `tertiary` entries are `{itemId, min, max, chance}` and
`petTable` entries are `{itemId, chance}` — both independent rolls, with `chance` a
fraction between 0 and 1, never a percentage.

`ContentValidator` enforces the referential rules; see `.claude/skills/add-content/`
for the procedure.

---

## 34. Testing strategy

| Layer | How it's tested | Where |
|---|---|---|
| Core systems | NUnit, every failure case | `Core/Tests/`, CI on every push |
| Content | `ContentValidator` | Same suite |
| Saves | Round-trip, corruption, every migration with a real old fixture | Same suite |
| Determinism | Same seed + same commands → identical state | Same suite |
| Performance | Frame time on device at each milestone gate | Manual, on the phone |
| Feel | A person plays it | Manual — the M2 and M3 gates |

**What must have a test:** anything with a number in it; anything that reads or
writes the save; anything content-driven; every migration.

**What can't be tested and needs a human:** whether the world is beautiful, whether
combat feels good, whether onboarding works. Those are §13's gates and they are
deliberately not automatable.

**The determinism test is load-bearing for the MMO path.** If the same seed and the
same command sequence stop producing identical state, server authority is broken
and the cause needs finding immediately.

---

## 35. Glossary

| Term | Meaning |
|---|---|
| **Tick** | 600ms. The simulation's unit of time. All durations are in ticks. |
| **Core** | `Isoperia.Core` — the engine-agnostic simulation. The future server. |
| **Command** | A serializable object expressing player intent (§31.1). |
| **Framed reveal** | A hand-placed spot where cresting terrain presents a composed view. Three per region, screenshotted. |
| **Hero landform** | A Blender-sculpted mesh providing silhouette a heightfield can't — cliff, arch, plateau. Layer 2 of §18. |
| **The atlas** | The one shared gradient palette texture every world surface maps to (§19.1). |
| **Craft checklist** | The ten rules in §3.2 a region must pass to ship. |
| **Mastery** | Per-item/recipe progression, separate from skill level. |
| **Zone tier** | Safe / Settled / Wild / Deep — sets the death penalty (§4.4). Region data, not code. |
| **Act** | One of five progression chapters (§4.2), each with its own region and tone. |
| **The gate** | A milestone's subjective pass condition (§13). |
| **The budget** | §6's mobile performance limits. Art that misses it is rebuilt. |
| **Retargeting** | Unity Humanoid remapping one animation set onto every humanoid rig (§19.3). |
| **Isoperia** | The previous project. Its name survives in namespaces and paths; the game is Alderfell. |

---

## 36. M0 — the Shorelands beauty proof

The next milestone, broken down. **Nothing here is a game system.** M0 answers one
question: does this look beautiful on a phone? If it doesn't, no amount of combat
design rescues the project — that is exactly how the previous one failed.

### 36.1 Tasks, in order

| # | Task | Where | Done when |
|---|---|---|---|
| 1 | Adopt and tune the CC0 base palette into the gradient atlas | Remote + GIMP | One texture, ≤5 hues for the Shorelands band, committed to `Art/Textures/` |
| 2 | Write the world material and terrain shader against the atlas | Remote | Vertex-colour blend, atlas sample, one material |
| 3 | Vegetation wind shader | Remote | Vertex wind, cheap, no per-frame CPU cost |
| 4 | Stylized water with shoreline foam | Remote | Animated, no reflections (§6 forbids SSR) |
| 5 | Terrain blockout of the Shorelands | Local/Unity | ≥15m relief, the switchback path, walkable in grey and interesting |
| 6 | Sculpt 4–6 hero landforms — cliffs, a sea arch, the wreck's rock shelf | Local/Blender | 2–5k tris each, atlas-UV'd, admitted per `import-asset` |
| 7 | Admit CC0 scatter: 2 tree species, 4 rocks, grass, beach debris | Local | Each passes the admission gate |
| 8 | Paint and scatter the region | Local/Unity | Jittered, nothing tiling visibly |
| 9 | Sky, fog, directional light, time-of-day tint cycle | Local/Unity | ~48-min cycle, fog tinted to the region palette |
| 10 | Third-person orbit camera to §23.1 spec | Remote + Local | Spring arm, collision, no auto-rotate |
| 11 | Place the three framed reveals | Local | Screenshotted on the phone |
| 12 | Build to the iPhone and profile | Local/Xcode | Frame time and draw calls recorded |

### 36.2 Acceptance criteria

- [ ] Runs at **30 FPS** on device, inside §6's budget (~120k tris, ~40 draw calls,
      3 materials for the dressed region)
- [ ] All ten §3.2 craft-checklist items pass
- [ ] Three framed-reveal screenshots that are **worth keeping**
- [ ] Judged on the phone against the reference games in §0 — RuneScape, WoW, W101,
      Minecraft — and it holds up
- [ ] Every asset in the licence ledger

### 36.3 What M0 must NOT contain

No combat, no inventory, no UI beyond the joystick, no enemies, no quests, no
saving. Every one of those is a way of avoiding the question M0 exists to ask.

### 36.4 The honest exit

If M0 doesn't look good, **iterate inside M0**. Do not proceed to M1 hoping the art
improves later — it doesn't, and that is the specific mistake this whole document
exists to prevent. If after real iteration it still doesn't hold, the scope
conclusion is that five regions is wrong and three is right (§14), not that the
pillar was wrong.

---

## Appendix A — Open decisions

1. ~~**Business model**~~ — **resolved in §22.** Free and unmonetized at v1,
   published on itch.io at zero cost; cosmetics revisited at the MMO milestone
   where modular characters make them viable. No region gating is needed, so this
   no longer constrains world layout.
2. **Arcane style scope** — §23.3 specs a full six-ability third style. Confirm
   that's wanted before the art cost (staff, VFX set, caster enemy) is committed.
3. **Region count** — five is the plan; M0's measured cost decides three vs five.
4. **Time-of-day gameplay effects** — cosmetic only, or do night spawns differ?
5. **Whether the repo/package should be renamed** from `isorpg` to `alderfell`.
6. **Ability numbers in §23.3** are a starting point, not balance. M2's gate is
   feel, not spreadsheet correctness — expect these to move.

## Appendix B — Immediate next steps

**Repo groundwork (remote sessions — mostly done):**
1. ~~`CLAUDE.md`, agent skills, asset admission gate, content schema + validator.~~
2. ~~Replace the six web CI workflows with `core-tests.yml` and `unity-build.yml`.~~
3. ~~Fix the root `.gitattributes` so binaries are LFS-tracked.~~
4. Retire `scripts/export-content.cjs` and promote the content JSON to source of truth.
5. Rescale `XpTable` to the level-50 curve and re-baseline the tests.
6. Fill in the equipment stat tables (currently all zeros) against the §4.3 model.
7. Strip `LabourSystem` and offline gathering from the active wiring (retain code).

**Then M0 — see §36 for the ordered task list and acceptance criteria.**

Also outstanding, and cheap to do from a remote session:
- Save `schemaVersion` and the migration harness (§29), before M3 makes it mandatory
- The collection-log state (`HashSet` of obtained ids + counts) in `GameState` (§27.1)
- Locale extraction: move user-facing strings to `Resources/Locale/en.json` (§25.1)
- Revise `docs/ART_BIBLE.md` against §3.2's craft rules and §6's budget
