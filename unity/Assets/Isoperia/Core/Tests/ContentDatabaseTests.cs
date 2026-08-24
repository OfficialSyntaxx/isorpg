using System;
using System.Collections.Generic;
using NUnit.Framework;
using Isoperia.Core.Content;
using Isoperia.Core.Data;

namespace Isoperia.Core.Tests
{
    /// <summary>
    /// Tests for the content loader.
    ///
    /// The interesting cases are the failures. A loader that returns something
    /// plausible when content is missing is worse than one that throws: this
    /// port has already shipped a fallback item catalog that looked like
    /// robustness and silently clamped a 2400-coin payout to 500. Every test
    /// below that asserts a throw is guarding that.
    /// </summary>
    [TestFixture]
    public class ContentDatabaseTests
    {
        // A minimal but structurally valid content set, built in code so the
        // tests do not depend on the real files being present or on their
        // current balance numbers.
        private static Dictionary<string, string> Fake()
        {
            return new Dictionary<string, string>
            {
                ["items"] = @"{""ITEMS"":{""coins"":{""id"":""coins"",""name"":""Coins"",""stack"":true,""value"":1},
                                          ""bronze_axe"":{""id"":""bronze_axe"",""name"":""Bronze Axe"",""stack"":false,""value"":7}},
                               ""ITEM_ICONS"":{""coins"":""C""},""ITEM_ICON_IMAGE_IDS"":[""coins""]}",
                ["skills"] = @"{""SKILLS"":{""woodcutting"":{""id"":""woodcutting"",""name"":""Woodcutting""}},
                                ""SKILL_IDS"":[""woodcutting""],""CRAFT_SKILLS"":[""smithing""],
                                ""COMBAT_SKILLS"":[""attack""],""RESOURCES"":{""tree"":{""skill"":""woodcutting""}}}",
                ["combat"] = @"{""ATTACK_STYLES"":{""accurate"":{}},""BUFFS"":{""b"":{}},""WEAPON_SPECIALS"":{""s"":{}},
                                ""AFFIXES"":{""a"":{}},""WEAPONS"":{""w"":{}},""MONSTERS"":{""m"":{}},""FOODS"":{""f"":{}}}",
                ["recipes"] = @"{""RECIPES"":{""r"":{}}}",
                ["buildings"] = @"{""BUILDINGS"":{""CAMPFIRE"":{}},""BUILDING_TYPES"":[""CAMPFIRE""],""MAX_BUILD_LEVEL"":3}",
                ["achievements"] = @"{""ACHIEVEMENTS"":{""a"":{}}}",
                ["xp"] = @"{""XP_TABLE"":[0,83,174]}",
                ["npcs"] = @"{""VILLAGERS"":{""v"":{}},""CRITTERS"":{""c"":{}},""VETERAN_TIERS"":[{}],""VILLAGER_SPECS"":{""s"":{}}}",
                ["quests"] = @"{""QUESTS"":{""q"":{}}}",
                ["farming"] = @"{""SEEDS"":{""s"":{}},""SEED_IDS"":[""s""]}",
                ["clues"] = @"{""CLUE_TIERS"":{""easy"":{}},""CLUE_TIER_LIST"":[""easy""]}",
                ["shop"] = @"{""STOCK"":[{""itemId"":""potato_seed"",""price"":10}]}",
            };
        }

        private static Func<string, string> Reader(Dictionary<string, string> files) =>
            name => files.TryGetValue(name, out string v) ? v : null;

        [Test]
        public void LoadsAValidContentSet()
        {
            ContentDatabase db = ContentDatabase.Load(Reader(Fake()));

            Assert.AreEqual("Coins", db.ItemName("coins"));
            Assert.AreEqual(7, db.ItemValue("bronze_axe"));
            Assert.IsTrue(db.ItemStacks("coins"));
            Assert.IsFalse(db.ItemStacks("bronze_axe"));
        }

        [Test]
        public void MissingFileIsFatal()
        {
            var files = Fake();
            files.Remove("recipes");

            var e = Assert.Throws<ContentException>(() => ContentDatabase.Load(Reader(files)));
            StringAssert.Contains("recipes", e.Message);
        }

        [Test]
        public void EmptyFileIsFatal()
        {
            var files = Fake();
            files["quests"] = "";

            Assert.Throws<ContentException>(() => ContentDatabase.Load(Reader(files)));
        }

        [Test]
        public void MalformedJsonIsFatal()
        {
            var files = Fake();
            files["xp"] = "{ this is not json";

            var e = Assert.Throws<ContentException>(() => ContentDatabase.Load(Reader(files)));
            StringAssert.Contains("xp", e.Message);
        }

        [Test]
        public void MissingTableIsFatalAndNamesIt()
        {
            var files = Fake();
            files["buildings"] = @"{""BUILDINGS"":{""CAMPFIRE"":{}},""MAX_BUILD_LEVEL"":3}";  // no BUILDING_TYPES

            var e = Assert.Throws<ContentException>(() => ContentDatabase.Load(Reader(files)));
            StringAssert.Contains("BUILDING_TYPES", e.Message);
        }

        /// <summary>
        /// The regression that motivated the check. ITEM_ICON_IMAGE_IDS is a Set
        /// in TypeScript, JSON.stringify renders a Set as {}, and the first
        /// export wrote an empty object — a valid-looking file with all 62 ids
        /// gone and no warning. An empty table now fails the load.
        /// </summary>
        [Test]
        public void EmptyTableIsFatal()
        {
            var files = Fake();
            files["items"] = @"{""ITEMS"":{""coins"":{}},""ITEM_ICONS"":{""coins"":""C""},
                                ""ITEM_ICON_IMAGE_IDS"":{}}";

            var e = Assert.Throws<ContentException>(() => ContentDatabase.Load(Reader(files)));
            StringAssert.Contains("ITEM_ICON_IMAGE_IDS", e.Message);
        }

        /// <summary>
        /// MAX_BUILD_LEVEL is a bare number, whose Count is 0. The empty-table
        /// check must not mistake it for a dropped table.
        /// </summary>
        [Test]
        public void ScalarTableIsNotMistakenForEmpty()
        {
            Assert.DoesNotThrow(() => ContentDatabase.Load(Reader(Fake())));
            ContentDatabase db = ContentDatabase.Load(Reader(Fake()));
            Assert.AreEqual(3, (int)db.Table("buildings", "MAX_BUILD_LEVEL").AsNumber(0));
        }

        [Test]
        public void UnknownItemReturnsNullRatherThanADefault()
        {
            ContentDatabase db = ContentDatabase.Load(Reader(Fake()));
            Assert.IsNull(db.Item("no_such_item"));
        }

        [Test]
        public void NullReaderIsRejected()
        {
            Assert.Throws<ArgumentNullException>(() => ContentDatabase.Load(null));
        }
    }
}
