---
name: add-content
description: Add or edit Alderfell game content — items, monsters, drop tables, recipes, quests, shop stock, buildings, seeds — in the content JSON, then validate it. Use whenever game data changes rather than game code.
---

# Add game content

Content lives as **JSON**, not ScriptableObjects. Read `docs/WORKFLOW.md` and the
applicable GDD section first. JSON records approved design; GDD defines intent.
Editing and validating data can be done remotely; gameplay/visual acceptance still
needs Unity when relevant.

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

1. Edit the relevant JSON file using GDD §33 and the actual consumer. `RECIPES`
   and `QUESTS` are arrays; `ITEMS` and `MONSTERS` are objects keyed by ID.
   Recipe inputs/output use `{itemId, qty}`. Monster main drops use
   `{itemId, min, max, weight}`; tertiary drops use `chance` instead of `weight`;
   pet drops use `{itemId, chance}`. Chances are fractions, not percentages.
   Quest rewards use either `{itemId, qty}` or `{itemId, min, max}`. Do not
   substitute a bare string or `id` for an `itemId` reference.
2. For a new required **file/table**, update `RequiredFiles` / `RequiredTables`
   in `ContentDatabase.cs`, `ContentValidator` shape/reference checks, consumers,
   tests and GDD §33 together. The loader enforces presence and nonempty required
   tables; it does not automatically discover new tables or validate every field.
3. If you added an item, add its icon id to `ITEM_ICONS` and, if it needs art, to
   `ITEM_ICON_IMAGE_IDS`.
4. **Validate:**
   ```bash
   dotnet test ci/CoreTests/CoreTests.csproj --filter ContentValidatorTests
   ```
   This runs synthetic regressions **and `ShippingContentPassesValidation` against
   actual repository JSON**. Current coverage includes table kinds, selected item
   references, recipe quantities, drop probabilities/ranges and shop prices; see
   `docs/WORKFLOW.md` for scope and limits. Fix invalid fixtures instead of weakening
   the loader. Reachability, balance, icons and localization are separate checks.
5. Run `dotnet test ci/CoreTests/CoreTests.csproj`, review the JSON diff, and
   record the checked commit/results in the status board. Reachability and
   collection-log acceptance apply when those gameplay features are implemented;
   until then record the relevant validation as pending, not passed.

## Do not

- Add content by writing C#. Content is data.
- Introduce ScriptableObjects for content. They are a UnityEngine dependency, and
  the future server has to load the same content the client does (GDD §16.3).
- Restore the retired exporter write path or author new Unity content in `src/data/*.ts`.
  `scripts/export-content.cjs` is now only a fail-fast notice; the JSON is the source.
