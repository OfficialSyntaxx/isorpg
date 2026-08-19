using Isoperia.Core.Components;
using Isoperia.Core.Save;

namespace Isoperia.Core.Content
{
    /// <summary>
    /// The real item catalog, backed by the exported content.
    ///
    /// This replaces <see cref="AllBulkCatalog"/>, which was the deliberate
    /// placeholder until the content pipeline existed. That placeholder was not
    /// harmless: it treated every unknown id as bulk, and the first version
    /// treated coins as bulk too, which silently clamped an offline Town Hall
    /// payout of 2,400 coins down to the 500 storage cap.
    ///
    /// Mirrors <c>isBulk</c> in <c>src/components/Inventory.ts</c> exactly,
    /// including the unknown-id default:
    ///
    ///     const def = ITEMS[id];
    ///     if (!def) return true;
    ///     return def.type !== "MISC" &amp;&amp; !def.equip &amp;&amp; !def.tool;
    ///
    /// An unknown id is BULK on purpose. A resource added to the data and not yet
    /// known here should be capped by default rather than silently uncapped —
    /// uncapped is the direction that breaks the economy.
    /// </summary>
    public sealed class ContentItemCatalog : IItemCatalog
    {
        private readonly ContentDatabase _content;

        public ContentItemCatalog(ContentDatabase content)
        {
            _content = content ?? throw new System.ArgumentNullException(nameof(content));
        }

        public bool IsBulk(string itemId)
        {
            JsonValue def = _content.Item(itemId);
            if (def == null) return true;

            if (def["type"].AsString("") == "MISC") return false;
            if (!def["equip"].IsNull) return false;
            if (!def["tool"].IsNull) return false;
            return true;
        }
    }

    /// <summary>
    /// Tool lookup over the inventory. Port of <c>getBestTool</c> and
    /// <c>getToolTier</c> from <c>src/data/Items.ts</c>.
    /// </summary>
    public static class ItemTools
    {
        /// <summary>
        /// Best tool the player owns for a skill, or null.
        /// </summary>
        /// <remarks>
        /// Ties go to the FIRST stack encountered, because the TypeScript
        /// replaces <c>best</c> only on a strict <c>t.tier &gt; best.tier</c>.
        /// Inventory order is therefore observable and must not be "tidied" into
        /// a sort — two tools of equal tier can have different speedPct.
        /// </remarks>
        public static bool TryGetBest(ContentDatabase content, InventoryComponent inv,
                                      string skill, out int tier, out double speedPct)
        {
            tier = 0;
            speedPct = 0;
            bool found = false;

            foreach (ItemStack s in inv.Items)
            {
                JsonValue def = content.Item(s.Id);
                if (def == null) continue;

                JsonValue tool = def["tool"];
                if (tool.IsNull || tool["skill"].AsString(null) != skill) continue;

                int t = (int)tool["tier"].AsNumber(0);
                if (found && t <= tier) continue;

                tier = t;
                speedPct = tool["speedPct"].AsNumber(0);
                found = true;
            }

            return found;
        }

        /// <summary>Tier of the best tool for a skill; 0 when the player has none.</summary>
        public static int BestTier(ContentDatabase content, InventoryComponent inv, string skill) =>
            TryGetBest(content, inv, skill, out int tier, out _) ? tier : 0;
    }
}
