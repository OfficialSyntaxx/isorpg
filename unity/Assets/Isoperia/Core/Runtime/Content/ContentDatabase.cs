using System;
using System.Collections.Generic;
using Isoperia.Core.Save;

namespace Isoperia.Core.Content
{
    /// <summary>
    /// Thrown when content is missing, malformed, or not the content this build
    /// expects. Always fatal.
    ///
    /// There is deliberately no fallback path. An earlier version of the port
    /// carried a hand-written fallback item catalog for when the real one was
    /// unavailable, and it treated coins as a bulk resource — which clamped an
    /// offline Town Hall payout of 2400 coins down to 500. It looked like
    /// robustness and behaved like silent data loss. Missing content is a broken
    /// build; say so and stop.
    /// </summary>
    public sealed class ContentException : Exception
    {
        public ContentException(string message) : base(message) { }
    }

    /// <summary>
    /// The game's hand-authored content tables, loaded from
    /// <c>Resources/Content/*.json</c>. These files are the source of truth.
    ///
    /// WHY THIS IS IN Isoperia.Core AND TAKES A DELEGATE:
    /// Core is declared <c>noEngineReferences</c>, which is what lets the whole
    /// simulation — and this loader — be tested with any C# compiler and no
    /// Unity licence. So it cannot call <c>Resources.Load</c>, or touch a file
    /// path, or know what a TextAsset is. The caller supplies a reader; the
    /// Unity layer passes one backed by Resources, the tests pass one backed by
    /// <c>File.ReadAllText</c>. Neither knows about the other.
    /// </summary>
    public sealed class ContentDatabase
    {
        /// <summary>The files the exporter writes, and this build requires.</summary>
        public static readonly string[] RequiredFiles =
        {
            "items", "skills", "combat", "recipes", "buildings",
            "achievements", "xp", "npcs", "quests", "farming", "clues", "shop",
        };

        /// <summary>
        /// The tables each file must contain. Checked at load, so a table that
        /// has been renamed or dropped in the TypeScript fails immediately and
        /// by name, rather than surfacing later as a system quietly finding
        /// nothing and behaving as though the player owns no tools.
        /// </summary>
        private static readonly Dictionary<string, string[]> RequiredTables =
            new Dictionary<string, string[]>
            {
                ["items"] = new[] { "ITEMS", "ITEM_ICONS", "ITEM_ICON_IMAGE_IDS" },
                ["skills"] = new[] { "SKILLS", "SKILL_IDS", "CRAFT_SKILLS", "COMBAT_SKILLS", "RESOURCES" },
                ["combat"] = new[] { "ATTACK_STYLES", "BUFFS", "WEAPON_SPECIALS", "AFFIXES", "WEAPONS", "MONSTERS", "FOODS" },
                ["recipes"] = new[] { "RECIPES" },
                ["buildings"] = new[] { "BUILDINGS", "BUILDING_TYPES", "MAX_BUILD_LEVEL" },
                ["achievements"] = new[] { "ACHIEVEMENTS" },
                ["xp"] = new[] { "XP_TABLE" },
                ["npcs"] = new[] { "VILLAGERS", "CRITTERS", "VETERAN_TIERS", "VILLAGER_SPECS" },
                ["quests"] = new[] { "QUESTS" },
                ["farming"] = new[] { "SEEDS", "SEED_IDS" },
                ["clues"] = new[] { "CLUE_TIERS", "CLUE_TIER_LIST" },
                ["shop"] = new[] { "STOCK" },
            };

        private readonly Dictionary<string, JsonValue> _files = new Dictionary<string, JsonValue>();

        private ContentDatabase() { }

        /// <summary>
        /// Loads and validates every required file.
        /// </summary>
        /// <param name="read">
        /// Returns the text of a content file by its bare name ("items"), or
        /// null if it does not exist.
        /// </param>
        public static ContentDatabase Load(Func<string, string> read)
        {
            if (read == null) throw new ArgumentNullException(nameof(read));

            var db = new ContentDatabase();

            foreach (string name in RequiredFiles)
            {
                string text = read(name);
                if (string.IsNullOrEmpty(text))
                {
                    throw new ContentException(
                        $"content file \"{name}\" is missing or empty. Run " +
                        "content validation and make sure Resources/Content is included in the build.");
                }

                // JsonValue.Parse RETURNS NULL on malformed input rather than
                // throwing. That is deliberate and right for its original
                // caller: a corrupt save should fall through to a backup, not
                // crash on the way in. Content is the opposite case — there is
                // no backup and a half-loaded rulebook is worse than no game —
                // so the null becomes fatal here.
                JsonValue root = JsonValue.Parse(text);

                if (root == null)
                    throw new ContentException($"content file \"{name}\" is not valid JSON.");

                if (root.Kind != JsonKind.Object)
                    throw new ContentException($"content file \"{name}\" is not a JSON object.");

                foreach (string table in RequiredTables[name])
                {
                    JsonValue t = root[table];
                    if (t.IsNull)
                    {
                        throw new ContentException(
                            $"content file \"{name}\" has no table \"{table}\". It was renamed or " +
                            "removed in the authored JSON — update the content, validator " +
                            "and RequiredTables here together.");
                    }

                    // An empty table is almost always a serialisation failure
                    // rather than a designer's intent. ITEM_ICON_IMAGE_IDS
                    // shipped as {} once because JSON.stringify renders a Set
                    // that way, losing all 62 entries with a valid-looking file.
                    if (t.Count == 0 && t.Kind != JsonKind.Number)
                    {
                        throw new ContentException(
                            $"content table \"{name}.{table}\" is empty. If that is genuinely " +
                            "intended, say so here; otherwise the exporter dropped it.");
                    }
                }

                db._files[name] = root;
            }

            return db;
        }

        /// <summary>The parsed root of a content file. Unknown name is fatal.</summary>
        public JsonValue File(string name)
        {
            if (!_files.TryGetValue(name, out JsonValue v))
                throw new ContentException($"no content file \"{name}\" was loaded.");
            return v;
        }

        /// <summary>A named table, e.g. Table("items", "ITEMS").</summary>
        public JsonValue Table(string file, string table)
        {
            JsonValue t = File(file)[table];
            if (t.IsNull) throw new ContentException($"no table \"{table}\" in content file \"{file}\".");
            return t;
        }

        // -- convenience views over the tables the systems reach for most ------
        //
        // These stay as JsonValue rather than becoming POCOs. The tables are
        // read-only reference data accessed by id, the JsonValue indexer never
        // throws and never returns null, and a POCO layer would be a second
        // transcription of the same shapes — which is the thing this whole
        // export pipeline exists to eliminate.

        public JsonValue Items => Table("items", "ITEMS");
        public JsonValue Skills => Table("skills", "SKILLS");
        public JsonValue Resources => Table("skills", "RESOURCES");
        public JsonValue Weapons => Table("combat", "WEAPONS");
        public JsonValue Monsters => Table("combat", "MONSTERS");
        public JsonValue Foods => Table("combat", "FOODS");
        public JsonValue Recipes => Table("recipes", "RECIPES");
        public JsonValue Buildings => Table("buildings", "BUILDINGS");
        public JsonValue Seeds => Table("farming", "SEEDS");
        public JsonValue Quests => Table("quests", "QUESTS");
        public JsonValue ShopStock => Table("shop", "STOCK");

        /// <summary>Ids of a table, in the order the exporter emitted them (sorted).</summary>
        public List<string> IdsOf(string file, string table)
        {
            var ids = new List<string>();
            foreach (var kv in Table(file, table).Members) ids.Add(kv.Key);
            return ids;
        }

        /// <summary>
        /// A single item definition, or null. Callers that require the item to
        /// exist should say so rather than defaulting — a missing item id is a
        /// content bug, and coercing it to a plausible default is how the
        /// fallback catalog swallowed 1900 coins.
        /// </summary>
        public JsonValue Item(string id)
        {
            JsonValue v = Items[id];
            return v.IsNull ? null : v;
        }

        public bool ItemStacks(string id) => Item(id)?["stack"].AsBool(false) ?? false;
        public string ItemName(string id) => Item(id)?["name"].AsString(id) ?? id;
        public int ItemValue(string id) => (int)(Item(id)?["value"].AsNumber(0) ?? 0);
    }
}
