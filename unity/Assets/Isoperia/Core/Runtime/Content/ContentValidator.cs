using System;
using System.Collections.Generic;
using Isoperia.Core.Save;

namespace Isoperia.Core.Content
{
    /// <summary>
    /// Table-shape, item-reference and quantity checks over loaded content.
    /// This is not a complete gameplay schema or a reachability/balance proof.
    ///
    /// WHY THIS EXISTS SEPARATELY FROM <see cref="ContentDatabase"/>:
    /// the loader answers "is this file here, and does it have the tables I
    /// expect" — structural questions it must answer before anything can run.
    /// This answers the next question, which is the one that actually bites:
    /// "do the records make sense, and do they point at things that exist".
    ///
    /// A drop table that rolls <c>mithril_bar</c> when no such item is defined
    /// does not fail at load. It fails months later, on a boss kill, as an item
    /// that silently never arrives — the same shape of bug as the fallback item
    /// catalog that once clamped a 2400-coin payout to 500. Content is authored
    /// by hand now that the TypeScript exporter is retired, so a mistyped item id
    /// is a routine event rather than an exotic one. This runs in the test suite
    /// so that typo fails in CI instead of shipping.
    ///
    /// Every problem is collected rather than thrown on sight, because someone
    /// fixing content wants the whole list, not one line per run.
    /// </summary>
    public static class ContentValidator
    {
        /// <summary>Every problem found, as readable lines. Empty means valid.</summary>
        public static IReadOnlyList<string> Validate(ContentDatabase db)
        {
            if (db == null) throw new ArgumentNullException(nameof(db));

            var errors = new List<string>();
            ValidateTableShapes(db, errors);
            // JsonValue returns empty collections for the wrong kind. Without
            // this gate, object-shaped recipes would silently skip every check.
            if (errors.Count != 0) return errors;
            HashSet<string> itemIds = CollectItemIds(db, errors);

            ValidateItems(db, errors);
            ValidateRecipes(db, itemIds, errors);
            ValidateMonsters(db, itemIds, errors);
            ValidateWeapons(db, itemIds, errors);
            ValidateShopStock(db, itemIds, errors);
            ValidateOtherItemReferences(db, itemIds, errors);

            return errors;
        }

        /// <summary>
        /// Throws with the full list if anything is wrong, for callers that want
        /// a hard gate rather than a report.
        /// </summary>
        public static void ValidateOrThrow(ContentDatabase db)
        {
            IReadOnlyList<string> errors = Validate(db);
            if (errors.Count == 0) return;

            throw new ContentException(
                $"content failed validation ({errors.Count} problem(s)):{Environment.NewLine}  " +
                string.Join(Environment.NewLine + "  ", errors));
        }

        private static HashSet<string> CollectItemIds(ContentDatabase db, List<string> errors)
        {
            var ids = new HashSet<string>(StringComparer.Ordinal);

            foreach (KeyValuePair<string, JsonValue> entry in db.Table("items", "ITEMS").Members)
            {
                ids.Add(entry.Key);

                // Every other table refers to items by this key, so a record
                // whose own id disagrees with its key is ambiguous rather than
                // merely untidy: a lookup by one finds a different answer than a
                // lookup by the other.
                string declared = entry.Value["id"].AsString();
                if (string.IsNullOrEmpty(declared) || declared != entry.Key)
                {
                    errors.Add(
                        $"items.ITEMS[\"{entry.Key}\"] declares id \"{declared}\" — " +
                        "the key and the id must match.");
                }
            }

            return ids;
        }

        private static void ValidateItems(ContentDatabase db, List<string> errors)
        {
            foreach (KeyValuePair<string, JsonValue> entry in db.Table("items", "ITEMS").Members)
            {
                string id = entry.Key;
                JsonValue item = entry.Value;

                if (string.IsNullOrEmpty(item["name"].AsString()))
                    errors.Add($"item \"{id}\" has no name.");

                // An absent value parses as 0, which is legitimate for a quest
                // token; only a negative or non-finite one is unambiguously wrong.
                JsonValue value = item["value"];
                if (!value.IsNull && (!value.IsFiniteNumber || value.AsNumber() < 0))
                    errors.Add($"item \"{id}\" has a non-finite or negative value.");
            }
        }

        /// <summary>RECIPES is an array of records, each with {itemId, qty} parts.</summary>
        private static void ValidateRecipes(
            ContentDatabase db, HashSet<string> itemIds, List<string> errors)
        {
            var recipeIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (JsonValue recipe in db.Table("recipes", "RECIPES").Items)
            {
                string id = recipe["id"].AsString();
                if (string.IsNullOrEmpty(id)) errors.Add("recipe has no id.");
                else if (!recipeIds.Add(id)) errors.Add($"recipe \"{id}\" has a duplicate id.");

                RequireItem(recipe["output"]["itemId"].AsString(), itemIds, errors,
                    $"recipe \"{id}\" output");

                RequirePositiveInteger(recipe["output"]["qty"], errors, $"recipe \"{id}\" output qty");
                if (!RequireKind(recipe["inputs"], JsonKind.Array, errors, $"recipe \"{id}\" inputs")) continue;
                foreach (JsonValue input in recipe["inputs"].Items)
                {
                    RequireItem(input["itemId"].AsString(), itemIds, errors, $"recipe \"{id}\" input");
                    RequirePositiveInteger(input["qty"], errors, $"recipe \"{id}\" input qty");
                }
            }
        }

        /// <summary>
        /// Monsters carry three independent drop tables with different shapes:
        /// <c>main</c> is weighted and rolled exactly once per kill, while
        /// <c>tertiary</c> and <c>petTable</c> are independent probability rolls.
        /// A weight or chance that can never fire is the failure worth catching —
        /// it reads in game as a rare drop that simply never happens.
        /// </summary>
        private static void ValidateMonsters(
            ContentDatabase db, HashSet<string> itemIds, List<string> errors)
        {
            foreach (KeyValuePair<string, JsonValue> entry in db.Table("combat", "MONSTERS").Members)
            {
                string id = entry.Key;
                JsonValue monster = entry.Value;

                ValidateDropTable(monster["main"], id, "main", "weight", itemIds, errors);
                ValidateDropTable(monster["tertiary"], id, "tertiary", "chance", itemIds, errors);
                ValidateDropTable(monster["petTable"], id, "petTable", "chance", itemIds, errors);
            }
        }

        private static void ValidateDropTable(
            JsonValue table, string monsterId, string tableName, string rollField,
            HashSet<string> itemIds, List<string> errors)
        {
            // Individual monsters may deliberately omit optional drop tables.
            if (table.IsNull) return;
            if (!RequireKind(table, JsonKind.Array, errors, $"monster \"{monsterId}\" {tableName}")) return;
            foreach (JsonValue drop in table.Items)
            {
                string itemId = drop["itemId"].AsString();
                string where = $"monster \"{monsterId}\" {tableName} drop";

                RequireItem(itemId, itemIds, errors, where);

                JsonValue roll = drop[rollField];
                if (roll.IsNull)
                {
                    errors.Add($"{where} \"{itemId}\" has no {rollField}.");
                }
                else if (!roll.IsFiniteNumber || roll.AsNumber() <= 0)
                {
                    errors.Add(
                        $"{where} \"{itemId}\" has {rollField} {roll.AsNumber()} — " +
                        "it can never be rolled.");
                }
                else if (rollField == "chance" && roll.AsNumber() > 1)
                {
                    // Chances are fractions, not percentages. A 5 here means
                    // "always", which is almost certainly a typo for 0.05.
                    errors.Add(
                        $"{where} \"{itemId}\" has chance {roll.AsNumber()} — " +
                        "chances are fractions between 0 and 1.");
                }

                // min/max are optional (pets drop exactly one), but an inverted
                // range would silently yield nothing.
                JsonValue min = drop["min"], max = drop["max"];
                if (!min.IsNull) RequireNonNegativeInteger(min, errors, $"{where} min");
                if (!max.IsNull) RequireNonNegativeInteger(max, errors, $"{where} max");
                if (!min.IsNull && !max.IsNull && min.AsNumber() > max.AsNumber())
                {
                    errors.Add(
                        $"{where} \"{itemId}\" has min {min.AsNumber()} above max {max.AsNumber()}.");
                }
            }
        }

        /// <summary>
        /// Weapons are stats keyed by weapon id, pointing at the item they equip.
        ///
        /// A null <c>itemId</c> is legal and means unarmed: <c>fists</c> is a real
        /// weapon row with real accuracy and max-hit numbers, but there is no
        /// "fists" item to carry in a bag. So absence is accepted here and only a
        /// stated-but-unknown item is an error — the opposite of the rule
        /// everywhere else.
        /// </summary>
        private static void ValidateWeapons(
            ContentDatabase db, HashSet<string> itemIds, List<string> errors)
        {
            foreach (KeyValuePair<string, JsonValue> entry in db.Table("combat", "WEAPONS").Members)
            {
                string itemId = entry.Value["itemId"].AsString();
                if (string.IsNullOrEmpty(itemId)) continue;

                RequireItem(itemId, itemIds, errors, $"weapon \"{entry.Key}\"");
            }
        }

        private static void ValidateShopStock(
            ContentDatabase db, HashSet<string> itemIds, List<string> errors)
        {
            foreach (JsonValue row in db.Table("shop", "STOCK").Items)
            {
                RequireItem(row["itemId"].AsString(), itemIds, errors, "shop stock");
                JsonValue price = row["price"];
                if (!price.IsFiniteNumber || price.AsNumber() < 0)
                    errors.Add("shop stock price must be a finite non-negative number.");
            }
        }

        private static void ValidateTableShapes(ContentDatabase db, List<string> errors)
        {
            RequireKind(db.Table("items", "ITEMS"), JsonKind.Object, errors, "items.ITEMS");
            RequireKind(db.Table("items", "ITEM_ICONS"), JsonKind.Object, errors, "items.ITEM_ICONS");
            RequireKind(db.Table("items", "ITEM_ICON_IMAGE_IDS"), JsonKind.Array, errors, "items.ITEM_ICON_IMAGE_IDS");
            RequireKind(db.Table("skills", "SKILLS"), JsonKind.Object, errors, "skills.SKILLS");
            RequireKind(db.Table("skills", "SKILL_IDS"), JsonKind.Array, errors, "skills.SKILL_IDS");
            RequireKind(db.Table("skills", "CRAFT_SKILLS"), JsonKind.Array, errors, "skills.CRAFT_SKILLS");
            RequireKind(db.Table("skills", "COMBAT_SKILLS"), JsonKind.Array, errors, "skills.COMBAT_SKILLS");
            RequireKind(db.Table("skills", "RESOURCES"), JsonKind.Object, errors, "skills.RESOURCES");
            RequireKind(db.Table("combat", "ATTACK_STYLES"), JsonKind.Object, errors, "combat.ATTACK_STYLES");
            RequireKind(db.Table("combat", "BUFFS"), JsonKind.Object, errors, "combat.BUFFS");
            RequireKind(db.Table("combat", "WEAPON_SPECIALS"), JsonKind.Object, errors, "combat.WEAPON_SPECIALS");
            RequireKind(db.Table("combat", "AFFIXES"), JsonKind.Object, errors, "combat.AFFIXES");
            RequireKind(db.Table("combat", "WEAPONS"), JsonKind.Object, errors, "combat.WEAPONS");
            RequireKind(db.Table("combat", "MONSTERS"), JsonKind.Object, errors, "combat.MONSTERS");
            RequireKind(db.Table("combat", "FOODS"), JsonKind.Object, errors, "combat.FOODS");
            RequireKind(db.Table("recipes", "RECIPES"), JsonKind.Array, errors, "recipes.RECIPES");
            RequireKind(db.Table("buildings", "BUILDINGS"), JsonKind.Object, errors, "buildings.BUILDINGS");
            RequireKind(db.Table("buildings", "BUILDING_TYPES"), JsonKind.Array, errors, "buildings.BUILDING_TYPES");
            RequireKind(db.Table("buildings", "MAX_BUILD_LEVEL"), JsonKind.Number, errors, "buildings.MAX_BUILD_LEVEL");
            RequireKind(db.Table("achievements", "ACHIEVEMENTS"), JsonKind.Array, errors, "achievements.ACHIEVEMENTS");
            RequireKind(db.Table("xp", "XP_TABLE"), JsonKind.Array, errors, "xp.XP_TABLE");
            RequireKind(db.Table("npcs", "VILLAGERS"), JsonKind.Array, errors, "npcs.VILLAGERS");
            RequireKind(db.Table("npcs", "CRITTERS"), JsonKind.Array, errors, "npcs.CRITTERS");
            RequireKind(db.Table("npcs", "VETERAN_TIERS"), JsonKind.Array, errors, "npcs.VETERAN_TIERS");
            RequireKind(db.Table("npcs", "VILLAGER_SPECS"), JsonKind.Object, errors, "npcs.VILLAGER_SPECS");
            RequireKind(db.Table("quests", "QUESTS"), JsonKind.Array, errors, "quests.QUESTS");
            RequireKind(db.Table("farming", "SEEDS"), JsonKind.Object, errors, "farming.SEEDS");
            RequireKind(db.Table("farming", "SEED_IDS"), JsonKind.Array, errors, "farming.SEED_IDS");
            RequireKind(db.Table("clues", "CLUE_TIERS"), JsonKind.Object, errors, "clues.CLUE_TIERS");
            RequireKind(db.Table("clues", "CLUE_TIER_LIST"), JsonKind.Array, errors, "clues.CLUE_TIER_LIST");
            RequireKind(db.Table("shop", "STOCK"), JsonKind.Array, errors, "shop.STOCK");
        }

        private static bool RequireKind(JsonValue value, JsonKind kind, List<string> errors, string where)
        {
            if (value.Kind == kind) return true;
            errors.Add($"{where} must be {kind}, got {value.Kind}.");
            return false;
        }

        private static void RequirePositiveInteger(JsonValue value, List<string> errors, string where)
        {
            if (!value.IsFiniteNumber || value.AsNumber() <= 0 || value.AsNumber() != Math.Floor(value.AsNumber()))
                errors.Add($"{where} must be a positive integer.");
        }

        private static void RequireNonNegativeInteger(JsonValue value, List<string> errors, string where)
        {
            if (!value.IsFiniteNumber || value.AsNumber() < 0 || value.AsNumber() != Math.Floor(value.AsNumber()))
                errors.Add($"{where} must be a non-negative integer.");
        }

        private static void ValidateOtherItemReferences(ContentDatabase db, HashSet<string> ids, List<string> errors)
        {
            foreach (var pair in db.Resources.Members)
                ValidateDropTable(pair.Value["drops"], pair.Key, "resource drops", "weight", ids, errors);

            foreach (var pair in db.Seeds.Members)
            {
                RequireItem(pair.Key, ids, errors, $"seed {pair.Key}");
                ValidateReward(pair.Value["produce"], ids, errors, $"seed {pair.Key} produce");
            }
            foreach (var pair in db.Buildings.Members)
                ValidateRewardList(pair.Value["baseCost"], ids, errors, $"building {pair.Key} baseCost");
            foreach (var quest in db.Quests.Items)
                ValidateRewardList(quest["rewards"], ids, errors, $"quest {quest["id"].AsString()} rewards");
            foreach (var pair in db.Table("clues", "CLUE_TIERS").Members)
            {
                RequireItem(pair.Value["itemId"].AsString(), ids, errors, $"clue {pair.Key}");
                ValidateRewardList(pair.Value["loot"], ids, errors, $"clue {pair.Key} loot");
                if (!pair.Value["unique"].IsNull)
                    RequireItem(pair.Value["unique"]["itemId"].AsString(), ids, errors, $"clue {pair.Key} unique");
            }
        }

        private static void ValidateRewardList(JsonValue rows, HashSet<string> ids, List<string> errors, string where)
        {
            if (!RequireKind(rows, JsonKind.Array, errors, where)) return;
            foreach (var row in rows.Items) ValidateReward(row, ids, errors, where);
        }

        private static void ValidateReward(JsonValue row, HashSet<string> ids, List<string> errors, string where)
        {
            RequireItem(row["itemId"].AsString(), ids, errors, where);
            // Legacy quest rewards use min/max; newer quests and costs use qty.
            if (!row["qty"].IsNull)
                RequirePositiveInteger(row["qty"], errors, where + " qty");
            else
            {
                RequireNonNegativeInteger(row["min"], errors, where + " min");
                RequirePositiveInteger(row["max"], errors, where + " max");
                if (row["min"].AsNumber() > row["max"].AsNumber()) errors.Add(where + " min exceeds max.");
            }
        }

        private static void RequireItem(
            string id, HashSet<string> itemIds, List<string> errors, string where)
        {
            if (string.IsNullOrEmpty(id))
            {
                errors.Add($"{where} has no item id.");
                return;
            }

            if (!itemIds.Contains(id))
                errors.Add($"{where} refers to unknown item \"{id}\".");
        }
    }
}
