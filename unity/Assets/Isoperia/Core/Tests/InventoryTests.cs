using System.Collections.Generic;
using NUnit.Framework;
using Isoperia.Core.Components;

namespace Isoperia.Core.Tests
{
    /// <summary>
    /// Inventory, the storage cap, and the death penalty.
    ///
    /// The cap is the interesting part. It used to be advisory — several call
    /// sites checked it and several did not — so combat drops and offline
    /// progression could blow straight past it, and offline in particular capped
    /// each skill independently, letting three gathering skills each fill the
    /// whole cap. Making <c>Add</c> return what it actually stored turns the cap
    /// from a convention into an invariant, and these tests pin that.
    /// </summary>
    public class InventoryTests
    {
        /// <summary>Catalog where only ids in the set are non-bulk.</summary>
        private sealed class FakeCatalog : IItemCatalog
        {
            private readonly HashSet<string> _nonBulk;
            public FakeCatalog(params string[] nonBulk) => _nonBulk = new HashSet<string>(nonBulk);
            public bool IsBulk(string itemId) => !_nonBulk.Contains(itemId);
        }

        private static InventoryComponent Inv(params string[] nonBulk) =>
            InventoryComponent.Create(new FakeCatalog(nonBulk));

        [Test]
        public void StartsEmptyWithTheDefaultCap()
        {
            var inv = Inv();
            Assert.AreEqual(0, inv.Items.Count);
            Assert.AreEqual(500, inv.StorageCap);
            Assert.AreEqual(500, InventoryComponent.DefaultStorageCap);
        }

        [Test]
        public void AddStacksTheSameItem()
        {
            var inv = Inv();
            inv.Add("logs", 5);
            inv.Add("logs", 7);

            Assert.AreEqual(1, inv.Items.Count, "should be one stack, not two");
            Assert.AreEqual(12, inv.Count("logs"));
        }

        [Test]
        public void AddIgnoresNonPositiveAmounts()
        {
            var inv = Inv();
            Assert.AreEqual(0, inv.Add("logs", 0));
            Assert.AreEqual(0, inv.Add("logs", -5));
            Assert.AreEqual(0, inv.Items.Count);
        }

        /// <summary>The headline invariant: a short add reports what actually fit.</summary>
        [Test]
        public void AddReturnsWhatWasActuallyStored()
        {
            var inv = Inv();
            inv.StorageCap = 10;

            Assert.AreEqual(4, inv.Add("logs", 4), "room for all of it");
            Assert.AreEqual(6, inv.Add("ore", 100), "only six units of room left");
            Assert.AreEqual(0, inv.Add("coal", 50), "full");

            Assert.AreEqual(10, inv.StoredAmount());
            Assert.IsTrue(inv.IsFull());
        }

        /// <summary>
        /// The cap is scoped to bulk resources. Coins, keys, quest tokens, pets,
        /// gear and tools are carried regardless, so a full bag never blocks coin
        /// income, a quest reward, or a rare drop.
        /// </summary>
        [Test]
        public void NonBulkItemsBypassTheCap()
        {
            var inv = Inv("coins", "dungeon_key", "pet_rat");
            inv.StorageCap = 10;
            inv.Add("logs", 10);

            Assert.IsTrue(inv.IsFull());
            Assert.AreEqual(0, inv.Add("ore", 1), "another bulk resource must not fit");

            Assert.AreEqual(9999, inv.Add("coins", 9999), "coins are never capped");
            Assert.AreEqual(1, inv.Add("dungeon_key", 1), "a quest key must always fit");
            Assert.AreEqual(1, inv.Add("pet_rat", 1), "a pet drop must never be lost to a full bag");

            Assert.AreEqual(10, inv.StoredAmount(), "non-bulk items do not count toward the cap");
        }

        /// <summary>
        /// A newly added resource with no catalog entry must be capped by default.
        /// The permissive alternative silently uncaps anything the catalog has not
        /// caught up with.
        /// </summary>
        [Test]
        public void UnknownItemsAreTreatedAsBulk()
        {
            var inv = InventoryComponent.Create();   // fallback catalog
            inv.StorageCap = 5;

            Assert.AreEqual(5, inv.Add("brand_new_ore", 100));
            Assert.IsTrue(inv.IsFull());
        }

        /// <summary>
        /// Regression. The fallback catalog used before content data loads must
        /// still exempt the currency: SaveSystem pays the offline Town Hall tax in
        /// coins, and a returning player with a full bag had their gold clamped to
        /// the storage cap — 500 instead of 2,400 in the case that caught this.
        /// </summary>
        [Test]
        public void TheFallbackCatalogStillExemptsCoins()
        {
            var inv = InventoryComponent.Create();
            inv.StorageCap = 5;
            inv.Add("logs", 5);

            Assert.IsTrue(inv.IsFull());
            Assert.AreEqual(9999, inv.Add("coins", 9999),
                "currency must never be clamped by the resource cap");
            Assert.AreEqual(5, inv.StoredAmount(), "coins do not count toward the cap");
        }

        [Test]
        public void RemoveTakesFromAStackAndDropsItWhenEmpty()
        {
            var inv = Inv();
            inv.Add("logs", 10);

            Assert.IsTrue(inv.Remove("logs", 4));
            Assert.AreEqual(6, inv.Count("logs"));

            Assert.IsTrue(inv.Remove("logs", 6));
            Assert.AreEqual(0, inv.Count("logs"));
            Assert.AreEqual(0, inv.Items.Count, "an emptied stack should be gone, not left at zero");
        }

        [Test]
        public void RemoveRefusesToOverdraw()
        {
            var inv = Inv();
            inv.Add("logs", 3);

            Assert.IsFalse(inv.Remove("logs", 4), "cannot remove more than is held");
            Assert.AreEqual(3, inv.Count("logs"), "a refused removal must not change anything");

            Assert.IsFalse(inv.Remove("nothing_here", 1));
        }

        // ---- death penalty ---------------------------------------------------

        [Test]
        public void DeathPenaltyIsFifteenPercent()
        {
            Assert.AreEqual(0.15, InventoryComponent.DeathLossPct, 1e-9);
        }

        [Test]
        public void DeathPenaltyTakesAFlooredSliceOfEachBulkStack()
        {
            var inv = Inv("coins");
            inv.StorageCap = 10000;
            inv.Add("logs", 100);
            inv.Add("ore", 50);

            List<ItemStack> lost = inv.ApplyDeathPenalty();

            Assert.AreEqual(85, inv.Count("logs"), "100 - floor(100 * 0.15)");
            Assert.AreEqual(43, inv.Count("ore"), "50 - floor(50 * 0.15)");

            Assert.AreEqual(2, lost.Count);
        }

        /// <summary>
        /// Floored per stack, so it stays forgiving: a small haul loses nothing and
        /// the penalty only bites once a haul is worth banking. floor(6 * 0.15) = 0.
        /// </summary>
        [Test]
        public void DeathPenaltySparesSmallStacks()
        {
            var inv = Inv();
            inv.Add("logs", 6);

            List<ItemStack> lost = inv.ApplyDeathPenalty();

            Assert.AreEqual(6, inv.Count("logs"), "a stack under 7 should lose nothing");
            Assert.AreEqual(0, lost.Count);
        }

        /// <summary>
        /// "Unbanked" reuses the bulk split the cap already draws, so coins, gear,
        /// tools and quest items are never at risk — exactly what a Storehouse run
        /// does not need to protect.
        /// </summary>
        [Test]
        public void DeathPenaltyNeverTouchesNonBulkItems()
        {
            var inv = Inv("coins", "iron_sword", "dungeon_key");
            inv.StorageCap = 10000;
            inv.Add("coins", 5000);
            inv.Add("iron_sword", 1);
            inv.Add("dungeon_key", 1);
            inv.Add("logs", 100);

            inv.ApplyDeathPenalty();

            Assert.AreEqual(5000, inv.Count("coins"), "coins must survive death");
            Assert.AreEqual(1, inv.Count("iron_sword"), "equipment must survive death");
            Assert.AreEqual(1, inv.Count("dungeon_key"), "quest items must survive death");
            Assert.AreEqual(85, inv.Count("logs"), "only raw materials are at risk");
        }

        [Test]
        public void DeathPenaltyOnAnEmptyBagIsHarmless()
        {
            var inv = Inv();
            Assert.AreEqual(0, inv.ApplyDeathPenalty().Count);
            Assert.AreEqual(0, inv.Items.Count);
        }

        [Test]
        public void StoredAmountCountsOnlyBulk()
        {
            var inv = Inv("coins");
            inv.Add("logs", 30);
            inv.Add("coins", 1000);

            Assert.AreEqual(30, inv.StoredAmount());
        }
    }
}
