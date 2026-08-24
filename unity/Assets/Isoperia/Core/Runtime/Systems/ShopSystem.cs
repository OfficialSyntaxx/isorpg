using System;
using System.Collections.Generic;
using Isoperia.Core.Components;
using Isoperia.Core.Content;
using Isoperia.Core.Save;
using Isoperia.Core.State;

namespace Isoperia.Core.Systems
{
    /// <summary>
    /// The town market. Port of the simulation half of
    /// <c>src/systems/ShopSystem.ts</c>.
    ///
    /// The stall mesh, its placement scan and the panel rendering are
    /// presentation and stay on the Unity side. What is here is the economy:
    /// what may be sold, what it fetches, and how trade moves prices.
    ///
    /// The stock table is read from content (<c>shop.json</c>), not restated
    /// here. It was extracted out of the TypeScript system file for exactly that
    /// reason — the two worst bugs in this migration were hand-transcribed
    /// tables, and shop prices were the last table that would have needed it.
    /// </summary>
    public sealed class ShopSystem
    {
        public const string Coins = "coins";

        private readonly GameState _state;
        private readonly ContentDatabase _content;

        public ShopSystem(GameState state, ContentDatabase content)
        {
            _state = state ?? throw new ArgumentNullException(nameof(state));
            _content = content ?? throw new ArgumentNullException(nameof(content));
        }

        private static double Clamp(double v, double min, double max) =>
            Math.Min(max, Math.Max(min, v));

        /// <summary>
        /// Sell-price curve: flooding an item with supply drags its price down,
        /// while the shop wanting it lifts it. Clamped to [0.4, 1.5] so a market
        /// can never be driven to worthlessness or to infinity.
        /// </summary>
        public static double SellMultFor(double supply, double demand) =>
            Clamp((1 + 0.12 * demand) / (1 + 0.1 * supply), 0.4, 1.5);

        /// <summary>
        /// Buy-price curve: demand and a swelling coin pile raise the sticker
        /// price. The inflation term is capped at +25% so a rich player pays
        /// more, but not unboundedly more.
        /// </summary>
        public static double BuyMultFor(double supply, double demand, double coinCount)
        {
            double inflation = 1 + Math.Min(0.25, coinCount / 4000.0);
            return Clamp((1 + 0.08 * demand) / (1 + 0.05 * supply) * inflation, 0.6, 1.4);
        }

        private double Supply(string id) =>
            _state.Town.MarketSupply.TryGetValue(id, out double v) ? v : 0;

        private double Demand(string id) =>
            _state.Town.MarketDemand.TryGetValue(id, out double v) ? v : 0;

        /// <summary>
        /// Can this item be sold at all?
        ///
        /// Coins obviously not, and TOOLS are protected: selling your only axe
        /// would strand the player with no way back into woodcutting, and the
        /// stack-selling below would take every one of them at once.
        /// </summary>
        public bool CanSell(string itemId)
        {
            if (itemId == Coins) return false;

            JsonValue item = _content.Item(itemId);
            if (item == null) return false;

            return item["type"].AsString("") != "TOOL";
        }

        /// <summary>
        /// Sell the WHOLE STACK of an item at its data value. Returns the coins
        /// paid, or 0 when nothing was sold.
        ///
        /// Whole-stack is deliberate — the panel offers one tap per item, not a
        /// quantity picker — and it is why <see cref="CanSell"/> refuses tools.
        /// </summary>
        public int Sell(InventoryComponent inv, string itemId)
        {
            if (!CanSell(itemId)) return 0;

            int qty = inv.Count(itemId);
            if (qty <= 0) return 0;

            JsonValue item = _content.Item(itemId);
            double value = item["value"].AsNumber(0);

            double mult = SellMultFor(Supply(itemId), Demand(itemId));

            // Floored, then floored again at 1: a sale always pays something,
            // which keeps junk worth carrying out of a dungeon.
            int price = Math.Max(1, (int)Math.Floor(value * qty * mult));

            inv.Remove(itemId, qty);
            inv.Add(Coins, price);

            // Selling floods supply and drags the price down for everyone,
            // including the player's next stack.
            _state.Town.MarketSupply[itemId] = Supply(itemId) + qty;

            return price;
        }

        /// <summary>Current asking price for a stocked item.</summary>
        public int PriceOf(string itemId, double coinCount)
        {
            JsonValue stock = _content.ShopStock;

            for (int i = 0; i < stock.Count; i++)
            {
                if (stock[i]["itemId"].AsString(null) != itemId) continue;

                double basePrice = stock[i]["price"].AsNumber(0);
                double mult = BuyMultFor(Supply(itemId), Demand(itemId), coinCount);
                return Math.Max(1, (int)Math.Floor(basePrice * mult));
            }

            return 0;
        }

        /// <summary>What the player would be paid for their stack right now.</summary>
        public int SellPriceOf(InventoryComponent inv, string itemId)
        {
            if (!CanSell(itemId)) return 0;

            int qty = inv.Count(itemId);
            if (qty <= 0) return 0;

            double value = _content.Item(itemId)["value"].AsNumber(0);
            return Math.Max(1, (int)Math.Floor(value * qty * SellMultFor(Supply(itemId), Demand(itemId))));
        }

        /// <summary>Buy one of a stocked item. False when unstocked or unaffordable.</summary>
        public bool Buy(InventoryComponent inv, string itemId)
        {
            int coins = inv.Count(Coins);
            int price = PriceOf(itemId, coins);

            if (price <= 0) return false;      // not stocked
            if (coins < price) return false;

            inv.Remove(Coins, price);
            inv.Add(itemId, 1);

            _state.Town.MarketDemand[itemId] = Demand(itemId) + 1;
            return true;
        }

        /// <summary>Stocked item ids, in the order the merchant lists them.</summary>
        public List<string> StockIds()
        {
            var ids = new List<string>();
            JsonValue stock = _content.ShopStock;

            for (int i = 0; i < stock.Count; i++)
            {
                string id = stock[i]["itemId"].AsString(null);
                if (id != null) ids.Add(id);
            }

            return ids;
        }
    }
}
