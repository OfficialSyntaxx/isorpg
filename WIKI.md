# Isoperia — Game Wiki

> **Generated from the game's data files** by `scripts/gen-wiki.cjs`.
> Do not edit by hand — run `npm run wiki` after changing anything in `src/data/`.
> Every number here is read straight from the code, so it cannot drift out of date.

_Last generated: 2026-08-17_

## Contents

- [Getting started](#getting-started)
- [Skills](#skills)
- [Experience table](#experience-table)
- [Gathering](#gathering)
- [Weapons](#weapons)
- [Armour & equipment](#armour-equipment)
- [Monsters & drops](#monsters-drops)
- [Crafting recipes](#crafting-recipes)
- [Buildings](#buildings)
- [Food & healing](#food-healing)
- [Farming](#farming)
- [Villagers & labour](#villagers-labour)
- [Quests](#quests)
- [Items index](#items-index)
- [Achievements](#achievements)
- [Guides](#guides)

## Getting started

You spawn in the **town centre** of a 42×42 world with a small starter stash.
The world is built in four concentric bands, and difficulty rises with distance:

| Zone | Distance from town | What's there |
|---|---|---|
| **Town Centre** | centre chunk | Safe. All tiles buildable. Market, villagers, quest givers. |
| **Settlement** | ring 1 | Safe. Resource gathering, room to expand the town. |
| **Wilderness** | ring 2 | Monsters spawn. Better ore and trees. |
| **Deep Wilds** | ring 3+ | Tough monsters, the boss, and the dungeon entrance. |

Biomes overlay the bands — **snow** to the north-east (barren but mineral-rich),
**swamp** to the south-west (willow), **forest** elsewhere (dense woodland).
The town core is always meadow.

**The core loop:** gather raw materials → build a Sawmill/Smelter → craft them into
planks, bars, tools and armour → fight your way outward → assign villagers to
automate gathering while you're away.

**Time** runs at one in-game minute per 600 ms tick. Days affect lighting only.
**Offline progress** accrues while you're away, capped by your Town Hall level.

## Skills

All skills use the same experience curve and cap at level 99.

| Skill | Type | What it does |
|---|---|---|
| ⚔️ **Attack** | Combat | Accuracy — how often your hits land. |
| 💪 **Strength** | Combat | Max hit — how hard they land. |
| 🛡️ **Defense** | Combat | Mitigation — how often you get hit. |
| ❤️ **Hitpoints** | Combat | Your health pool. Max HP = level + 9 + armour bonus. |
| 🍳 **Cooking** | Artisan | Turn raw food into healing meals. Low levels burn food. |
| 🔨 **Smelting** | Artisan | Smelt ore into bars, then forge tools, weapons and armour. Needs a Smelter. |
| 🪚 **Carpentry** | Artisan | Saw logs into planks and carve tools. Needs a Sawmill. |
| 🏗️ **Construction** | Artisan | Gates which settlement buildings you can place, and their upgrades. |
| 🌱 **Farming** | Artisan |  |
| 🪓 **Woodcutting** | Gathering | Chop trees for logs. Better axes and higher levels unlock harder wood. |
| ⛏️ **Mining** | Gathering | Mine rocks for ore and coal. Pickaxe tier gates the higher ores. |
| 🎣 **Fishing** | Gathering | Catch raw fish at fishing spots. Needs a net or rod. |

## Experience table

Standard OSRS-style curve: XP to reach level *L* is
`floor( sum(n + 300 · 2^(n/7)) for n = 1..L-1 ) / 4`.

| Level | Total XP | Level | Total XP |
|---:|---:|---:|---:|
| 2 | 83 | 10 | 1,154 |
| 20 | 4,470 | 30 | 13,363 |
| 40 | 37,224 | 50 | 101,333 |
| 60 | 273,742 | 70 | 737,627 |
| 75 | 1,210,421 | 80 | 1,986,068 |
| 85 | 3,258,594 | 90 | 5,346,332 |
| 92 | 6,517,253 | 95 | 8,771,558 |
| 98 | 11,805,606 | 99 | 13,034,431 |

**Item mastery** is tracked separately per resource/recipe. Higher mastery grants
up to +20% double-yield on gathering, up to +15% material preservation on crafting,
and shortens the action by up to a third.

## Gathering

| Node | Skill | Level | Yields | XP | Ticks | Uses |
|---|---|---:|---|---:|---:|---:|
| tree normal | Woodcutting | 1 | 🪵 Logs | 25 | 15 | 4 |
| tree oak | Woodcutting | 15 | 🌳 Oak Logs | 37.5 | 22 | 6 |
| tree willow | Woodcutting | 30 | 🌿 Willow Logs | 67.5 | 28 | 8 |
| rock copper | Mining | 1 | 🟠 Copper Ore | 17.5 | 20 | 5 |
| rock tin | Mining | 1 | ⚪ Tin Ore | 17.5 | 20 | 5 |
| rock iron | Mining | 15 | ⚙️ Iron Ore | 35 | 26 | 6 |
| rock coal | Mining | 30 | ⚫ Coal | 50 | 32 | 7 |
| water shrimp | Fishing | 1 | 🦐 Raw Shrimp | 10 | 12 | ∞ |
| water trout | Fishing | 20 | 🐟 Raw Trout | 50 | 18 | ∞ |

A node's action takes `ticks × 0.6s`, reduced by mastery. Depleting nodes respawn.

## Weapons

Attack speed is in 600 ms ticks — lower is faster. Max hit also scales with your
Strength level (`+1 per 4 levels`) and your armour's strength bonus.

| Weapon | Style | Speed | Max hit | Accuracy | Attack req |
|---|---|---:|---:|---:|---:|
| **Fists** | melee | 2t (1.2s) | 1 | 2 | 0 |
| 🗡️ **Bronze Dagger** | melee | 3t (1.8s) | 4 | 8 | 1 |
| ⚔️ **Bronze Sword** | melee | 4t (2.4s) | 6 | 12 | 1 |
| ⚔️ **Bronze 2H Sword** | melee | 6t (3.6s) | 10 | 16 | 5 |
| 🏹 **Shortbow** | ranged | 3t (1.8s) | 5 | 14 | 1 |
| ⚔️ **Iron Sword** | melee | 4t (2.4s) | 9 | 20 | 10 |
| ⚔️ **Steel Sword** | melee | 4t (2.4s) | 13 | 28 | 20 |

Ranged weapons reach **5 tiles**; melee must be adjacent. The same rule applies to
monsters, so a bow lets you open on an enemy before it closes.

## Armour & equipment

| Item | Slot | Attack | Strength | Defence | Max HP | Level req |
|---|---|---:|---:|---:|---:|---|
| 🗡️ **Bronze Dagger** | weapon | 0 | 0 | 0 | 0 | — |
| ⚔️ **Bronze Sword** | weapon | 0 | 0 | 0 | 0 | — |
| ⚔️ **Bronze 2H Sword** | weapon | 0 | 0 | 0 | 0 | — |
| ⚔️ **Iron Sword** | weapon | 0 | 0 | 0 | 0 | — |
| ⚔️ **Steel Sword** | weapon | 0 | 0 | 0 | 0 | — |
| 🏹 **Shortbow** | weapon | 0 | 0 | 0 | 0 | — |
| ⛑️ **Bronze Helm** | head | 0 | 0 | 0 | 0 | — |
| 🛡️ **Bronze Platebody** | body | 0 | 0 | 0 | 0 | — |
| 🦵 **Bronze Platelegs** | legs | 0 | 0 | 0 | 0 | — |
| ⛑️ **Iron Helm** | head | 0 | 0 | 0 | 0 | — |
| 🛡️ **Iron Platebody** | body | 0 | 0 | 0 | 0 | — |
| 🦵 **Iron Platelegs** | legs | 0 | 0 | 0 | 0 | — |

## Monsters & drops

Drop chances below are computed from the game's weight tables. **Main table** rolls
exactly once per kill, so its chances sum to 100%. **Tertiary** and **pet** rolls are
independent — they can drop alongside a main drop.

### Giant Rat

Level 1 · 8 HP · max hit 1 · attacks every 4t (2.4s) · melee

Aggro range 3 tiles · respawns after 20s

**XP:** 4 Attack · 2 Strength · 2 Defence · 1 Hitpoints

| Drop | Quantity | Chance |
|---|---|---:|
| 🍖 Raw Rat Meat | 1 | 17% |
| 🪙 Coins | 1–6 | 62% |
| 🦴 Bones | 1 | 21% |
| 🦴 Rat Bone (Triangular) _(tertiary)_ | 1 | 2.0% |
| 🐀 Tiny Rat _(pet)_ | 1 | 1/2,500 |

### Goblin

Level 2 · 14 HP · max hit 3 · attacks every 4t (2.4s) · melee

Aggro range 4 tiles · respawns after 30s

**XP:** 6 Attack · 3 Strength · 3 Defence · 1 Hitpoints

| Drop | Quantity | Chance |
|---|---|---:|
| 🪙 Coins | 2–10 | 83% |
| 🗝️ Goblin Key | 1 | 4.2% |
| 🍖 Raw Rat Meat | 1 | 13% |
| 🗝️ Goblin Key _(tertiary)_ | 1 | 5.0% |
| 👹 Eager Goblin _(pet)_ | 1 | 1/3,333 |

### Skeleton

Level 8 · 26 HP · max hit 5 · attacks every 4t (2.4s) · melee

Aggro range 4 tiles · respawns after 40s

**XP:** 14 Attack · 8 Strength · 8 Defence · 2 Hitpoints

| Drop | Quantity | Chance |
|---|---|---:|
| 🪙 Coins | 5–20 | 46% |
| 🦴 Bones | 1 | 46% |
| ⚔️ Bronze Sword | 1 | 1.5% |
| 🍤 Cooked Shrimp | 1 | 5.8% |
| 🗝️ Loop Half of a Key _(tertiary)_ | 1 | 4.0% |
| 💀 Bones Malone _(pet)_ | 1 | 1/4,000 |

### Zombie

Level 13 · 40 HP · max hit 7 · attacks every 5t (3.0s) · melee

Aggro range 5 tiles · respawns after 50s

**XP:** 20 Attack · 12 Strength · 12 Defence · 3 Hitpoints

| Drop | Quantity | Chance |
|---|---|---:|
| 🪙 Coins | 10–40 | 65% |
| ⚔️ Bronze 2H Sword | 1 | 2.0% |
| ⚙️ Iron Ore | 1–2 | 20% |
| 🍤 Cooked Shrimp | 1–2 | 13% |
| 🧟 Zombie Flesh _(tertiary)_ | 1 | 6.0% |
| 🧟 Mortimer _(pet)_ | 1 | 1/5,000 |

### Dire Wolf

Level 5 · 22 HP · max hit 4 · attacks every 3t (1.8s) · melee

Aggro range 5 tiles · respawns after 25s

**XP:** 10 Attack · 8 Strength · 6 Defence · 2 Hitpoints

| Drop | Quantity | Chance |
|---|---|---:|
| 🍖 Raw Rat Meat | 1 | 19% |
| 🪙 Coins | 2–8 | 58% |
| 🦴 Bones | 1–2 | 23% |
| 🐀 Tiny Rat _(tertiary)_ | 1 | 1/250 |
| 🐀 Tiny Rat _(pet)_ | 1 | 1/1,250 |

### Goblin Archer

Level 7 · 18 HP · max hit 5 · attacks every 4t (2.4s) · ranged

Aggro range 6 tiles · respawns after 30s

**XP:** 14 Attack · 6 Strength · 8 Defence · 2 Hitpoints

| Drop | Quantity | Chance |
|---|---|---:|
| 🪙 Coins | 3–12 | 78% |
| 🏹 Shortbow | 1 | 0.98% |
| 🗝️ Goblin Key | 1 | 5.9% |
| 🍖 Raw Rat Meat | 1 | 15% |
| 🗝️ Goblin Key _(tertiary)_ | 1 | 6.0% |
| 👹 Eager Goblin _(pet)_ | 1 | 1/1,667 |

### Forest Ogre

Level 18 · 110 HP · max hit 10 · attacks every 5t (3.0s) · **BOSS** · melee

Aggro range 5 tiles · respawns after 120s

**XP:** 42 Attack · 28 Strength · 28 Defence · 8 Hitpoints

| Drop | Quantity | Chance |
|---|---|---:|
| 🪙 Coins | 25–80 | 43% |
| 🍣 Cooked Trout | 1–3 | 18% |
| ⚙️ Iron Ore | 2–5 | 28% |
| ⚔️ Bronze 2H Sword | 1 | 7.1% |
| ⚔️ Iron Sword | 1 | 4.3% |
| 🗝️ Goblin Key _(tertiary)_ | 1 | 20% |
| 💀 Bones Malone _(pet)_ | 1 | 2.0% |

### Cave Bat

Level 6 · 14 HP · max hit 3 · attacks every 3t (1.8s) · melee

Aggro range 5 tiles · respawns after 20s

**XP:** 8 Attack · 5 Strength · 5 Defence · 1 Hitpoints

| Drop | Quantity | Chance |
|---|---|---:|
| 🦴 Bones | 1 | 38% |
| 🪙 Coins | 1–5 | 63% |
| 🐀 Tiny Rat _(pet)_ | 1 | 1/333 |

### Cave Slasher

Level 12 · 52 HP · max hit 8 · attacks every 4t (2.4s) · melee

Aggro range 6 tiles · respawns after 45s

**XP:** 26 Attack · 16 Strength · 14 Defence · 4 Hitpoints

| Drop | Quantity | Chance |
|---|---|---:|
| 🪙 Coins | 8–30 | 81% |
| ⚔️ Bronze Sword | 1 | 5.0% |
| ⚔️ Bronze 2H Sword | 1 | 2.5% |
| 🍣 Cooked Trout | 1 | 11% |
| 🗝️ Goblin Key _(tertiary)_ | 1 | 10% |
| 👹 Eager Goblin _(pet)_ | 1 | 1/1,000 |

### Cave Brute

Level 15 · 90 HP · max hit 9 · attacks every 5t (3.0s) · **BOSS** · melee

Aggro range 6 tiles · respawns after 3600s
· telegraphed slam: 8.0% per tick for 14 damage

**XP:** 40 Attack · 26 Strength · 26 Defence · 7 Hitpoints

| Drop | Quantity | Chance |
|---|---|---:|
| 🪙 Coins | 30–120 | 41% |
| 🍣 Cooked Trout | 1–2 | 20% |
| ⚙️ Iron Ore | 2–6 | 27% |
| ⚔️ Bronze 2H Sword | 1 | 5.4% |
| ⚔️ Iron Sword | 1 | 6.8% |
| 🗝️ Goblin Key _(tertiary)_ | 1 | 25% |
| 👹 Eager Goblin _(pet)_ | 1 | 1/100 |

### Frost Imp

Level 14 · 38 HP · max hit 4 · attacks every 4t (2.4s) · melee

Aggro range 6 tiles · respawns after 30s

**XP:** 16 Attack · 15 Strength · 18 Defence · 3 Hitpoints

| Drop | Quantity | Chance |
|---|---|---:|
| 🪙 Coins | 6–20 | 43% |
| 🦴 Bones | 1 | 36% |
| 🍖 Raw Rat Meat | 1–2 | 21% |
| 🗝️ Goblin Key _(tertiary)_ | 1 | 4.0% |
| 🐀 Tiny Rat _(pet)_ | 1 | 1/200 |

### Bog Husk

Level 10 · 44 HP · max hit 5 · attacks every 5t (3.0s) · melee

Aggro range 6 tiles · respawns after 30s

**XP:** 10 Attack · 10 Strength · 10 Defence · 2 Hitpoints

| Drop | Quantity | Chance |
|---|---|---:|
| 🪙 Coins | 4–16 | 38% |
| 🦴 Bones | 1 | 38% |
| 🍖 Raw Rat Meat | 1 | 25% |
| 🗝️ Goblin Key _(tertiary)_ | 1 | 8.0% |
| 👹 Eager Goblin _(pet)_ | 1 | 1/250 |

## Crafting recipes

### 🍳 Cooking

| Product | Level | Materials | XP | Time | Requires |
|---|---:|---|---:|---:|---|
| 🍤 Cooked Shrimp | 1 | 1× 🦐 Raw Shrimp | 30 | 1.2s | — · can burn |
| 🍗 Cooked Rat Meat | 5 | 1× 🍖 Raw Rat Meat | 40 | 1.2s | — · can burn |
| 🍣 Cooked Trout | 20 | 1× 🐟 Raw Trout | 70 | 1.8s | — · can burn |
| 🥔 Baked Potato | 8 | 1× 🥔 Potato | 45 | 1.2s | — · can burn |
| 🍲 Cabbage Stew | 25 | 2× 🥬 Cabbage + 1× 🥔 Potato | 110 | 2.4s | — · can burn |
| 🧪 Combat Tonic | 35 | 4× 🍒 Redberry | 190 | 3.0s | Campfire |

### 🔨 Smelting

| Product | Level | Materials | XP | Time | Requires |
|---|---:|---|---:|---:|---|
| 🟤 Bronze Bar | 1 | 1× 🟠 Copper Ore + 1× ⚪ Tin Ore | 30 | 1.8s | Smelter |
| 🔩 Iron Bar | 20 | 2× ⚙️ Iron Ore | 60 | 2.4s | Smelter |
| ⛓️ Steel Bar | 30 | 1× 🔩 Iron Bar + 1× ⚫ Coal | 100 | 3.0s | Smelter |
| 🪓 Bronze Axe | 1 | 3× 🟤 Bronze Bar | 40 | 2.4s | Smelter |
| ⛏️ Bronze Pickaxe | 1 | 3× 🟤 Bronze Bar | 40 | 2.4s | Smelter |
| 🪓 Iron Axe | 20 | 3× 🔩 Iron Bar | 70 | 3.0s | Smelter |
| ⛏️ Iron Pickaxe | 20 | 3× 🔩 Iron Bar | 70 | 3.0s | Smelter |
| 🪓 Steel Axe | 35 | 3× ⛓️ Steel Bar | 110 | 3.6s | Smelter |
| ⛏️ Steel Pickaxe | 35 | 3× ⛓️ Steel Bar | 110 | 3.6s | Smelter |
| 🗡️ Bronze Dagger | 2 | 1× 🟤 Bronze Bar | 25 | 1.8s | Smelter |
| ⚔️ Bronze Sword | 6 | 2× 🟤 Bronze Bar | 45 | 2.4s | Smelter |
| ⚔️ Bronze 2H Sword | 10 | 3× 🟤 Bronze Bar | 70 | 3.0s | Smelter |
| ⚔️ Iron Sword | 26 | 2× 🔩 Iron Bar | 95 | 3.0s | Smelter |
| ⚔️ Steel Sword | 40 | 3× ⛓️ Steel Bar | 150 | 3.6s | Smelter |
| ⛑️ Bronze Helm | 3 | 2× 🟤 Bronze Bar | 30 | 1.8s | Smelter |
| 🛡️ Bronze Platebody | 5 | 3× 🟤 Bronze Bar | 45 | 2.4s | Smelter |
| 🦵 Bronze Platelegs | 4 | 2× 🟤 Bronze Bar | 35 | 1.8s | Smelter |
| ⛑️ Iron Helm | 22 | 2× 🔩 Iron Bar | 65 | 2.4s | Smelter |
| 🛡️ Iron Platebody | 24 | 3× 🔩 Iron Bar | 85 | 3.0s | Smelter |
| 🦵 Iron Platelegs | 23 | 2× 🔩 Iron Bar | 70 | 2.4s | Smelter |

### 🪚 Carpentry

| Product | Level | Materials | XP | Time | Requires |
|---|---:|---|---:|---:|---|
| 🪵 Plank | 1 | 1× 🪵 Logs | 20 | 1.2s | Sawmill |
| 2× 🪵 Plank | 15 | 1× 🌳 Oak Logs | 45 | 1.8s | Sawmill |
| 3× 🪵 Plank | 30 | 1× 🌿 Willow Logs | 80 | 2.4s | Sawmill |
| 🏹 Shortbow | 12 | 2× 🪵 Plank | 60 | 2.4s | Sawmill |
| 🎣 Fly Rod | 10 | 2× 🪵 Plank + 1× 🟤 Bronze Bar | 55 | 2.4s | Sawmill |

### Mastery

Every resource and every recipe tracks its **own** mastery, earning 1 mastery XP
per unit produced. Mastery raises action speed (up to 33% faster at 99), the
double-yield chance when gathering (up to 20%) and the material-preserve chance
when crafting (up to 15%). It also reduces cooking burn.

| Mastery level | Total XP (= actions) |
|---:|---:|
| 10 | 45 |
| 25 | 300 |
| 50 | 1,225 |
| 75 | 2,775 |
| 99 | 4,851 |

Cooking can **burn** at low levels — the chance falls as your level rises above the
recipe's requirement and as mastery grows. A built Campfire makes cooking 25% faster.

## Buildings

| Building | Con. level | Cost | Effect |
|---|---:|---|---|
| 📦 **Storage Bin** | 0 | 5× 🪵 Logs | +50 inventory storage cap per level |
| 🔥 **Campfire** | 0 | 6× 🪵 Logs | Cooking 25% faster · villagers gather here |
| 🏛️ **Town Hall** | 1 | 200× 🪙 Coins + 10× 🪵 Plank | +4h max offline idle capacity, +2 coins/tick passive tax |
| 🏚️ **Storehouse** | 1 | 150× 🪙 Coins + 20× 🪵 Plank | +250 inventory storage cap per level |
| 🪵 **Sawmill** | 5 | 120× 🪙 Coins + 15× 🪵 Logs | Passively converts 1 log → 1 plank per cycle, per level |
| 🔥 **Smelter** | 10 | 150× 🪙 Coins + 10× 🟠 Copper Ore + 10× ⚪ Tin Ore | Unlocks Smithing recipes; passively converts ore → bars per cycle, per level |
| 🌾 **Granary** | 8 | 100× 🪙 Coins + 8× 🪵 Plank | Passively produces 1 raw shrimp per cycle, per level |
| 🌱 **Farm Plot** | 3 | 6× 🪵 Plank + 8× 🪵 Logs | +1 planting bed per level (see Village → Farm) |

Buildings may only be placed on unlocked, buildable tiles in the town or settlement
ring. Placing one grants Construction XP.

## Food & healing

**Auto-eat** fires when your HP drops below 40%, consuming the highest-tier food you
carry. Tier decides priority, not the heal value.

| Food | Heals | Tier |
|---|---:|---:|
| 🍖 Raw Rat Meat | 3 | 1 |
| 🍗 Cooked Rat Meat | 4 | 1 |
| 🍤 Cooked Shrimp | 6 | 2 |
| 🍤 Cooked Shrimp | 6 | 2 |
| 🥔 Baked Potato | 9 | 2 |
| 🍣 Cooked Trout | 14 | 3 |
| 🍲 Cabbage Stew | 20 | 3 |
| 🧪 Combat Tonic | 30 | 4 |

## Farming

Farming is the one skill that advances on **real time** rather than on actions.
Sow a bed and it ripens whether the game is open or not — a crop planted before you
close the tab is ready when you come back, with no offline calculation involved.

Beds come from the **Farm Plot** building (Construction 3): one bed per Farm Plot
*level*, so upgrading a plot adds beds. Seeds are stocked by the town merchant.

| Seed | Farming | Ripens in | Yield | XP |
|---|---:|---:|---|---:|
| 🌰 **Potato Seed** | 1 | 5 min | 2–4 × 🥔 Potato | 35 |
| 🌱 **Cabbage Seed** | 12 | 12 min | 2–3 × 🥬 Cabbage | 90 |
| 🫘 **Redberry Seed** | 30 | 30 min | 3–6 × 🍒 Redberry | 220 |

Farming mastery raises the yield **floor** rather than adding a bonus roll: at
mastery 1 a harvest spans the crop's whole range, at 99 it always gives the maximum.

Every crop feeds something — potatoes and cabbages go to Cooking, and redberries
brew the **Combat Tonic**, which was previously only buyable.

## Villagers & labour

Villagers live in the town centre, wander between the Campfire and the storehouses,
and comment on what you build. Assign one to a job and they gather into the **village
stock** — including while you are offline, up to your Town Hall's cap.

| Villager | Role | Perk | Per-cycle bonus |
|---|---|---|---|
| **Bram**, the Fisher | 🎣 Fisher | Fresh Catch | 1 × 🦐 Raw Shrimp |
| **Wren**, the Woodcutter | 🪓 Woodcutter | Fine Timber | 1 × 🌳 Oak Logs |
| **Old Tobias**, Town Elder | 🏛️ Elder | Elder's Due | 1 × 🪙 Coins |

**Veteran tiers.** Hours worked accumulate per villager and multiply their yield:

| Tier | Hours worked | Yield |
|---|---:|---:|
| New hand | 0h | ×1 |
| Veteran | 2h | ×2 |
| Reliable | 8h | ×3 |
| Master | 20h | ×4 |

The town also hosts 2 ambient critters — decorative, not catchable.

### What they say

**Bram, the Fisher**

- "The shrimp are biting today. The trout are deeper."
- "Build a Smelter near the water if you fancy roasted fish."
- "The pond freezes over at night — come back at dawn."

**Wren, the Woodcutter**

- "These oaks need a sharper axe than my old bronze."
- "Planks come from logs, and logs come from work."
- "Mind the goblins past the treeline."

**Old Tobias, Town Elder**

- "The settlement grows with every log you haul home."
- "A Storage Bin is cheap — build one before your pouch bursts."
- "Bury the bones. It's only proper."

## Quests

Quests are given by **Eldric the Cartographer**, who waits beside the dungeon entrance
in the deep wilds. Rewards are paid once, on completion.

### The Caves of the Deep

_Given by Eldric the Cartographer._

Descend into the dungeon beneath the deep wilds, unlock the sealed door and put down the Cave Brute guarding the exit.

**Steps**

1. Talk to Eldric by the deep-wilds door to begin.  `(INTRO)`
1. Find the Iron Key in a side chamber of the Caves.  `(FIND_KEY)`
1. Use the Iron Key on the door locked shut.  `(OPEN_DOOR)`
1. Slay the Cave Brute that guards the exit portal.  `(DEFEAT_BRUTE)`

**Reward:** 50–100 × Coins, 4–8 × Iron Ore, 2 × Cooked Trout

### The Surveyor's Errand

_Given by Eldric the Cartographer._

A Forest Ogre has moved into the deep woods and the surveyor cannot finish his map while it prowls. Kill it.

**Objective:** Slay the Forest Ogre that prowls the deep woods.

**Reward:** 250 × Coins, 1 × Steel Bar, 3 × Cooked Trout

## Items index

### Bar

| Item | Value | Requirements | Notes |
|---|---:|---|---|
| 🟤 **Bronze Bar** | 15 | — | Smelted copper and tin. |
| 🔩 **Iron Bar** | 40 | Smelting 20 | Smelted iron — hard and reliable. |
| ⛓️ **Steel Bar** | 90 | Smelting 30 | Iron forged with coal. The good stuff. |

### Fish

| Item | Value | Requirements | Notes |
|---|---:|---|---|
| 🦐 **Raw Shrimp** | 5 | — | A fresh little shrimp. |
| 🐟 **Raw Trout** | 15 | Fishing 20 | A lively spotted trout. |

### Food

| Item | Value | Requirements | Notes |
|---|---:|---|---|
| 🥔 **Baked Potato** | 18 | — | Hot from the fire. Heals 9. |
| 🥬 **Cabbage** | 14 | — | Hearty leaves. Better in a stew than raw. |
| 🍲 **Cabbage Stew** | 44 | — | Thick and restoring. Heals 20. |
| 🧪 **Combat Tonic** | 45 | — | A fiery red tonic. Heals 30, gulped down automatically when you're hurt. |
| 🍗 **Cooked Rat Meat** | 9 | — | Better than it sounds. Heals 4. |
| 🍤 **Cooked Shrimp** | 12 | — | A tasty cooked shrimp. Heals 6. |
| 🍤 **Cooked Shrimp** | 12 | — | A tasty cooked shrimp. Heals 6. |
| 🍣 **Cooked Trout** | 32 | — | Flaky and filling. Heals 14. |
| 🥔 **Potato** | 6 | — | Earthy and filling once baked. |
| 🍖 **Raw Rat Meat** | 4 | — | Edible once cooked. Heals a little raw. |
| 🍒 **Redberry** | 22 | — | Tart and faintly medicinal — the base of a Combat Tonic. |

### Log

| Item | Value | Requirements | Notes |
|---|---:|---|---|
| 🪵 **Logs** | 4 | — | A sturdy cut of ordinary wood. |
| 🌳 **Oak Logs** | 10 | Woodcutting 15 | Heavier, denser oak timber. |
| 🌿 **Willow Logs** | 20 | Woodcutting 30 | Flexible willow, prized by carpenters. |

### Material

| Item | Value | Requirements | Notes |
|---|---:|---|---|
| 🪵 **Plank** | 8 | — | Sawn, seasoned timber — settlement building material. |

### Misc

| Item | Value | Requirements | Notes |
|---|---:|---|---|
| 🦴 **Bones** | 2 | — | Possibly worth burying. |
| 💀 **Bones Malone** | 1 | — | Unlocks a follower. 1/4000 per kill. |
| 🪙 **Coins** | 1 | — | Shiny currency the merchants accept. |
| 👹 **Eager Goblin** | 1 | — | Unlocks a follower. 1/3333 per kill. |
| 🗝️ **Goblin Key** | 5 | — | Rusted and noisy. |
| 🗝️ **Iron Key** | 0 | — | Fits the locked door that blocks the dungeon exit. Consumed on use. |
| 🗝️ **Loop Half of a Key** | 20 | — | Half a mysterious key. |
| 🧟 **Mortimer** | 1 | — | Unlocks a follower. 1/5000 per kill. |
| 🦴 **Rat Bone (Triangular)** | 1 | — | A curious irregular bone. |
| 🐀 **Tiny Rat** | 1 | — | Unlocks a follower. 1/2500 per kill. |
| 🧟 **Zombie Flesh** | 3 | — | Moves slightly on its own. |

### Ore

| Item | Value | Requirements | Notes |
|---|---:|---|---|
| ⚫ **Coal** | 33 | Mining 30 | Black, glossy fuel for the smelter. |
| 🟠 **Copper Ore** | 5 | — | Soft, orange-gold ore. |
| ⚙️ **Iron Ore** | 17 | Mining 15 | Dense grey ore, ready to smelt. |
| ⚪ **Tin Ore** | 5 | — | Bright silver ore. |

### Seed

| Item | Value | Requirements | Notes |
|---|---:|---|---|
| 🌱 **Cabbage Seed** | 12 | Farming 12 | A slower crop with a better yield. About 12 minutes. |
| 🌰 **Potato Seed** | 3 | Farming 1 | Plant it in a Farm Plot bed. Ready in about 5 minutes. |
| 🫘 **Redberry Seed** | 40 | Farming 30 | Half an hour in the ground, and the berries brew a Combat Tonic. |

### Tool

| Item | Value | Requirements | Notes |
|---|---:|---|---|
| ⚔️ **Bronze 2H Sword** | 30 | — | Slow but heavy. 6-tick attack. |
| 🪓 **Bronze Axe** | 1 | — | A starter woodcutting axe. |
| 🗡️ **Bronze Dagger** | 12 | — | Fast but small. 3-tick attack. |
| ⛑️ **Bronze Helm** | 25 | — | +1 defence, +5 HP. |
| ⛏️ **Bronze Pickaxe** | 1 | — | A starter mining pickaxe. |
| 🛡️ **Bronze Platebody** | 40 | — | +2 defence, +10 HP. |
| 🦵 **Bronze Platelegs** | 30 | — | +1 defence, +5 HP. |
| ⚔️ **Bronze Sword** | 20 | — | A solid starter sword. 4-tick attack. |
| 🎣 **Fly Rod** | 40 | — | Lets you reach deeper, faster fish. |
| 🪓 **Iron Axe** | 30 | — | Cuts wood noticeably faster. |
| ⛑️ **Iron Helm** | 80 | — | +2 defence, +10 HP. |
| ⛏️ **Iron Pickaxe** | 30 | — | Cracks ore clean off the rock. |
| 🛡️ **Iron Platebody** | 130 | — | +4 defence, +15 HP. |
| 🦵 **Iron Platelegs** | 100 | — | +2 defence, +10 HP. |
| ⚔️ **Iron Sword** | 60 | — | A sharp iron blade. |
| 🏹 **Shortbow** | 25 | — | A quick bow. 3-tick attack. |
| 🥅 **Small Fishing Net** | 1 | — | Catches shrimp in open water. |
| 🪓 **Steel Axe** | 90 | — | Bites deep — swift and true. |
| ⛏️ **Steel Pickaxe** | 90 | — | The miner's best friend. |
| ⚔️ **Steel Sword** | 140 | — | Forged from steel — the finest blade a settlement smith can make. |

## Achievements

| Achievement | How to earn it |
|---|---|
| **First Blood** | Slay your first monster. |
| **Rat Hunter** | Slay 10 giant rats. |
| **Heart of the Forest** | Slay 5 dire wolves. |
| **Boss Breaker** | Slay the Forest Ogre or the Cave Brute. |
| **Tenacious** | Reach level 10 in any skill. |
| **Pack Rat** | Collect 10 different items. |
| **Eldric's Student** | Complete any quest. |
| **Pathfinder** | Explore a quarter of the world. |
| **First Purchase** | Buy something from the town market. |
| **Junk Trader** | Sell 20 items to the town market. |
| **Foreman** | Give three villagers a job. |
| **Quartermaster** | Collect 50 items from the village stock. |
| **Spelunker** | Descend to dungeon floor 2. |
| **Mogul** | Bank 2,000 coins from market sales. |
| **Market Flooder** | Dump 100+ of the same item on the market. |
| **Shop Regular** | Buy 10 items from the town market. |

## Guides

### Your first hour

1. **Chop and mine in the settlement ring.** Your starter axe and pickaxe work on
   anything nearby. You want logs, copper ore and tin ore.
2. **Build a Sawmill, then a Smelter.** Both are cheap and both unlock a whole crafting
   skill — planks from logs, bars from ore. Nothing else gates as much as these two.
3. **Smelt bronze bars** (copper + tin) and forge a better axe and pickaxe. Tool tiers
   are the single biggest gathering speed-up available early.
4. **Build a Storage Bin.** The bulk cap fills faster than you expect; see below.
5. **Cook before you fight.** Auto-eat fires at 40% HP and picks your highest-tier food,
   so carry a stack of anything cooked before stepping into the wilderness ring.

### Storage, and what the cap actually covers

The storage cap applies to **bulk resources only** — logs, ore, bars, fish, planks and
other stackable materials. Coins, keys, quest items, pets, tools and equipment are
carried regardless, so a bag full of logs never blocks a coin drop or a quest reward.

When the cap is hit, gathering and crafting stop with an *inventory full* message
rather than silently discarding output. Sell or bank before a long offline stretch:
offline gathering shares the same cap across every skill.

### Combat

Attack decides how often you hit, Strength how hard, Defence how often you are hit,
and Hitpoints your pool (max HP = level + 9 + armour bonus). Weapons have an Attack
level requirement; armour does not, but higher tiers carry better bonuses.

Monsters in the wilderness ring aggro within their listed range. Rare tertiary and pet
drops roll independently of the main table, so they can drop alongside a normal drop.

### Offline progress

While you are away the game credits gathering on your best available resource per
skill, villager labour into the village stock, and Town Hall tax. The window is capped
by your Town Hall level — upgrading it is the only way to extend it. Everything is
still bounded by the storage cap, so an upgrade to the Storehouse pairs naturally with
an upgrade to the Town Hall.

### Settlement build order

Sawmill → Smelter → Storage Bin → Campfire → Town Hall → Storehouse. The first two
open crafting, the next two solve capacity and cooking speed, and the Town Hall is
what turns offline time from a trickle into real progress.

---

_Generated by `scripts/gen-wiki.cjs`. Change the data, re-run `npm run wiki`._
