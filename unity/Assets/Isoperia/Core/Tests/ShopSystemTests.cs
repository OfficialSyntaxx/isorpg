using NUnit.Framework;
using Isoperia.Core.Components;
using Isoperia.Core.Content;
using Isoperia.Core.Save;
using Isoperia.Core.State;
using Isoperia.Core.Systems;

namespace Isoperia.Core.Tests
{
    [TestFixture]
    public class ShopSystemTests
    {
        private GameState _state;
        private ContentDatabase _content;

        private ShopSystem Make()
        {
            _content = TestContent.Real();
            _state = GameState.CreateFresh(nowMs: 1787000000000);
            _state.Player.Inventory.SetCatalog(new ContentItemCatalog(_content));
            return new ShopSystem(_state, _content);
        }

        // -- price curves ---------------------------------------------------

        [Test]
        public void AnUntradedItemSellsAtItsPlainValue()
        {
            Assert.AreEqual(1.0, ShopSystem.SellMultFor(0, 0), 1e-9);
        }

        [Test]
        public void FloodingSupplyDragsTheSellPriceDown()
        {
            double fresh = ShopSystem.SellMultFor(0, 0);
            double flooded = ShopSystem.SellMultFor(50, 0);

            Assert.Less(flooded, fresh);
        }

        /// <summary>
        /// Clamped at both ends so a market can never be driven to worthlessness
        /// or to infinity, however much is dumped into it.
        /// </summary>
        [Test]
        public void SellMultiplierIsClampedBothWays()
        {
            Assert.AreEqual(0.4, ShopSystem.SellMultFor(1000000, 0), 1e-9);
            Assert.AreEqual(1.5, ShopSystem.SellMultFor(0, 1000000), 1e-9);
        }

        [Test]
        public void HoardingCoinsRaisesBuyPrices()
        {
            double poor = ShopSystem.BuyMultFor(0, 0, 0);
            double rich = ShopSystem.BuyMultFor(0, 0, 100000);

            Assert.Greater(rich, poor);
        }

        /// <summary>Inflation is capped at +25%, so wealth cannot price a player out.</summary>
        [Test]
        public void CoinInflationIsCappedAtAQuarter()
        {
            // 4000 coins reaches the cap; beyond it nothing changes.
            Assert.AreEqual(ShopSystem.BuyMultFor(0, 0, 4000),
                            ShopSystem.BuyMultFor(0, 0, 100000000), 1e-9);
        }

        [Test]
        public void BuyMultiplierIsClampedBothWays()
        {
            Assert.AreEqual(0.6, ShopSystem.BuyMultFor(1000000, 0, 0), 1e-9);
            Assert.AreEqual(1.4, ShopSystem.BuyMultFor(0, 1000000, 100000), 1e-9);
        }

        // -- selling --------------------------------------------------------

        [Test]
        public void SellingPaysCoinsAndTakesTheWholeStack()
        {
            ShopSystem shop = Make();
            InventoryComponent inv = _state.Player.Inventory;
            inv.Add("normal_log", 10);

            int paid = shop.Sell(inv, "normal_log");

            Assert.Greater(paid, 0);
            Assert.AreEqual(0, inv.Count("normal_log"), "the whole stack goes");
            Assert.AreEqual(paid, inv.Count("coins"));
        }

        /// <summary>
        /// Tools are protected. Selling takes the WHOLE stack, so one tap would
        /// otherwise take every axe the player owns and strand them out of
        /// woodcutting entirely.
        /// </summary>
        [Test]
        public void ToolsCannotBeSold()
        {
            ShopSystem shop = Make();
            InventoryComponent inv = _state.Player.Inventory;
            inv.Add("bronze_axe", 1);

            Assert.IsFalse(shop.CanSell("bronze_axe"));
            Assert.AreEqual(0, shop.Sell(inv, "bronze_axe"));
            Assert.AreEqual(1, inv.Count("bronze_axe"));
        }

        [Test]
        public void CoinsCannotBeSold()
        {
            ShopSystem shop = Make();
            InventoryComponent inv = _state.Player.Inventory;
            inv.Add("coins", 500);

            Assert.IsFalse(shop.CanSell("coins"));
            Assert.AreEqual(0, shop.Sell(inv, "coins"));
            Assert.AreEqual(500, inv.Count("coins"));
        }

        [Test]
        public void SellingNothingPaysNothing()
        {
            ShopSystem shop = Make();
            Assert.AreEqual(0, shop.Sell(_state.Player.Inventory, "normal_log"));
        }

        /// <summary>
        /// A sale always pays at least one coin, so junk is worth carrying out
        /// of a dungeon.
        ///
        /// The item matters. The first version of this test used normal_log
        /// (value 3): 3 x 0.4 = 1.2, which floors to 1 with or without the
        /// guard, so it passed against a build with the floor REMOVED — a
        /// mutation proved it tested nothing. rat_bone is value 1, and
        /// 1 x 0.4 = 0.4 floors to 0, so the guard is the only thing standing
        /// between the player and a free item.
        /// </summary>
        [Test]
        public void ASaleAlwaysPaysAtLeastOneCoin()
        {
            ShopSystem shop = Make();
            InventoryComponent inv = _state.Player.Inventory;

            Assert.AreEqual(1, _content.Item("rat_bone")["value"].AsNumber(0), 1e-9,
                "content changed — pick another item whose value x 0.4 floors to 0");

            // Drown the market so the multiplier bottoms out at 0.4.
            _state.Town.MarketSupply["rat_bone"] = 1000000;
            inv.Add("rat_bone", 1);

            Assert.AreEqual(1, shop.Sell(inv, "rat_bone"));
            Assert.AreEqual(1, inv.Count("coins"));
        }

        [Test]
        public void SellingTheSameItemTwiceFetchesLess()
        {
            ShopSystem shop = Make();
            InventoryComponent inv = _state.Player.Inventory;

            inv.Add("normal_log", 20);
            int first = shop.Sell(inv, "normal_log");

            inv.Add("normal_log", 20);
            int second = shop.Sell(inv, "normal_log");

            Assert.Less(second, first, "the first sale floods supply for the second");
        }

        // -- buying ---------------------------------------------------------

        [Test]
        public void BuyingSpendsCoinsAndDeliversTheItem()
        {
            ShopSystem shop = Make();
            InventoryComponent inv = _state.Player.Inventory;
            inv.Add("coins", 1000);

            int price = shop.PriceOf("potato_seed", inv.Count("coins"));
            Assert.Greater(price, 0);
            Assert.IsTrue(shop.Buy(inv, "potato_seed"));

            Assert.AreEqual(1, inv.Count("potato_seed"));
            Assert.AreEqual(1000 - price, inv.Count("coins"));
        }

        [Test]
        public void CannotBuyWhatIsNotStocked()
        {
            ShopSystem shop = Make();
            InventoryComponent inv = _state.Player.Inventory;
            inv.Add("coins", 100000);

            Assert.AreEqual(0, shop.PriceOf("normal_log", 100000));
            Assert.IsFalse(shop.Buy(inv, "normal_log"));
            Assert.AreEqual(100000, inv.Count("coins"), "nothing was spent");
        }

        [Test]
        public void CannotBuyWithoutEnoughCoins()
        {
            ShopSystem shop = Make();
            InventoryComponent inv = _state.Player.Inventory;
            inv.Add("coins", 1);

            Assert.IsFalse(shop.Buy(inv, "iron_sword"));
            Assert.AreEqual(1, inv.Count("coins"));
            Assert.AreEqual(0, inv.Count("iron_sword"));
        }

        [Test]
        public void BuyingRepeatedlyRaisesThePrice()
        {
            ShopSystem shop = Make();
            InventoryComponent inv = _state.Player.Inventory;
            inv.Add("coins", 100000);

            int first = shop.PriceOf("potato_seed", inv.Count("coins"));
            for (int i = 0; i < 20; i++) shop.Buy(inv, "potato_seed");
            int later = shop.PriceOf("potato_seed", inv.Count("coins"));

            Assert.Greater(later, first, "demand raises the sticker price");
        }

        // -- the stock table comes from content -----------------------------

        /// <summary>
        /// The stock table is READ FROM CONTENT, not restated in C#. It was
        /// extracted out of src/systems/ShopSystem.ts specifically so it could
        /// be, since hand-transcribed tables caused two of this migration's
        /// worst bugs.
        /// </summary>
        [Test]
        public void StockComesFromTheExportedContent()
        {
            ShopSystem shop = Make();

            Assert.AreEqual(13, shop.StockIds().Count);
            Assert.Contains("potato_seed", shop.StockIds());
            Assert.Contains("iron_sword", shop.StockIds());
        }

        [Test]
        public void SeedsAreStockedBecauseFarmingIsOtherwiseUnreachable()
        {
            ShopSystem shop = Make();

            // Every seed in the farming table must be buyable somewhere, or the
            // skill has no entry point at all.
            foreach (string id in new[] { "potato_seed", "cabbage_seed", "redberry_seed" })
                Assert.Contains(id, shop.StockIds());
        }
    }
}
