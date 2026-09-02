---
name: add-content
description: Add or edit Alderfell game content — items, monsters, drop tables, recipes, quests, shop stock, buildings, seeds — in the content JSON, then validate it. Use whenever game data changes rather than game code.
---

# Add game content

Content lives as **JSON**, not ScriptableObjects, and the JSON is the source of
truth. This can be done from a remote session — no Unity needed.

## Where it lives

`unity/Assets/Isoperia/Resources/Content/*.json`

| File | Tables |
|---|---|
| `items.json` | `ITEMS`, `ITEM_ICONS`, `ITEM_ICON_IMAGE_IDS` |
| `combat.json` | `MONSTERS`, `WEAPONS`, `FOODS`, `ATTACK_STYLES`, `BUFFS`, `AFFIXES`, `WEAPON_SPECIALS` |
| `recipes.json` | `RECIPES` |
| `quests.json` | `QUESTS` |
| `shop.json` | `STOCK` |
| `buildings.json` | `BUILDINGS`, `BUILDING_TYPES`, `MAX_BUILD_LEVEL` |
| `farming.json` | `SEEDS`, `SEED_IDS` |
| `clues.json` | `CLUE_TIERS`, `CLUE_TIER_LIST` |
| `npcs.json` | `VILLAGERS`, `CRITTERS`, `VETERAN_TIERS`, `VILLAGER_SPECS` |
| `skills.json`, `xp.json`, `achievements.json` | as named |

## Rules

- **An item's key and its `id` must match.** A record where they disagree is
  ambiguous: a lookup by key and a lookup by id find different answers.
- **Everything referenced must exist.** Drop tables, recipe inputs and outputs,
  and shop stock all refer to item ids. A typo here doesn't fail at load — it
  fails months later as a drop that silently never arrives.
- **Drop weights must be > 0.** A zero-weight drop can never be rolled, so it
  reads as a rare drop that simply never happens.
- **No fallbacks.** Missing or malformed content throws `ContentException` and
  that is deliberate. Do not add a default-value path to make an error go away.
- **Balance changes go through the GDD first** (§4 progression, §4.3 loot). The
  JSON is where a decision is recorded, not where it's made.

## Steps

1. Edit the relevant JSON file. Match the surrounding record shape exactly —
   inputs and drops appear both as bare id strings and as `{id, qty}` /
   `{id, weight}` objects depending on the table, and both are valid.
2. If you added a new **file** or **table**, update `RequiredFiles` /
   `RequiredTables` in `ContentDatabase.cs` in the same commit. The loader
   deliberately fails on an unknown shape rather than quietly skipping it.
3. If you added an item, add its icon id to `ITEM_ICONS` and, if it needs art, to
   `ITEM_ICON_IMAGE_IDS`.
4. **Validate:**
   ```bash
   dotnet test ci/CoreTests/CoreTests.csproj --filter ContentValidatorTests
   ```
   `ContentValidator` checks referential integrity across items, recipes, drop
   tables and shop stock, and reports every problem at once rather than the first.
5. Run the full suite before committing — content changes can move balance tests.

## Do not

- Add content by writing C#. Content is data.
- Introduce ScriptableObjects for content. They are a UnityEngine dependency, and
  the future server has to load the same content the client does (GDD §16.3).
- Re-add `scripts/export-content.cjs` or author content in `src/data/*.ts`. That
  pipeline belonged to the retired three.js prototype; the JSON is now the source.
