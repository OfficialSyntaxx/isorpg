using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using Isoperia.Core.Content;

namespace Isoperia.Core.Tests
{
    /// <summary>
    /// Tests for the content schema and referential-integrity checks.
    ///
    /// Content is hand-authored JSON now that the TypeScript exporter is retired,
    /// so a mistyped item id is an ordinary authoring slip rather than an exotic
    /// failure. The point of these checks is that such a slip fails here, loudly,
    /// instead of shipping as a drop that silently never arrives — so most of
    /// what is asserted below is that one specific broken reference is *caught*,
    /// and named well enough to find and fix.
    ///
    /// The fixtures mirror the real content's shapes exactly: RECIPES is an
    /// array, drops are keyed by <c>itemId</c>, and a monster's three tables are
    /// <c>main</c> (weighted), <c>tertiary</c> and <c>petTable</c> (independent
    /// chances). Fixtures that drift from those shapes would test nothing.
    /// </summary>
    [TestFixture]
    public class ContentValidatorTests
    {
        /// <summary>
        /// A structurally valid, referentially clean content set — built in code
        /// so these tests never depend on the shipping content's balance numbers,
        /// and so each test can break exactly one thing.
        /// </summary>
        private static Dictionary<string, string> Clean()
        {
            return new Dictionary<string, string>
            {
                ["items"] = @"{""ITEMS"":{
                                ""coins"":{""id"":""coins"",""name"":""Coins"",""stack"":true,""value"":1},
                                ""oak_log"":{""id"":""oak_log"",""name"":""Oak Logs"",""stack"":true,""value"":4},
                                ""oak_plank"":{""id"":""oak_plank"",""name"":""Oak Plank"",""stack"":true,""value"":12},
                                ""wolf_pelt"":{""id"":""wolf_pelt"",""name"":""Wolf Pelt"",""stack"":true,""value"":9},
                                ""pet_wolf"":{""id"":""pet_wolf"",""name"":""Wolf Pup"",""stack"":false,""value"":0},
                                ""bronze_dagger"":{""id"":""bronze_dagger"",""name"":""Bronze Dagger"",""stack"":false,""value"":7}},
                              ""ITEM_ICONS"":{""coins"":""C""},""ITEM_ICON_IMAGE_IDS"":[""coins""]}",
                ["skills"] = @"{""SKILLS"":{""woodcutting"":{""name"":""Woodcutting""}},""SKILL_IDS"":[""woodcutting""],
                               ""CRAFT_SKILLS"":[],""COMBAT_SKILLS"":[],""RESOURCES"":{}}",
                ["combat"] = @"{""ATTACK_STYLES"":{},""BUFFS"":{},""WEAPON_SPECIALS"":{},""AFFIXES"":{},
                               ""WEAPONS"":{
                                 ""fists"":{""id"":""fists"",""name"":""Fists"",""itemId"":null,""maxHit"":1,""ticks"":2},
                                 ""dagger"":{""id"":""dagger"",""name"":""Bronze Dagger"",""itemId"":""bronze_dagger"",""maxHit"":4,""ticks"":3}},
                               ""MONSTERS"":{""dire_wolf"":{""id"":""dire_wolf"",""name"":""Dire Wolf"",""hp"":30,
                                 ""main"":[{""itemId"":""wolf_pelt"",""min"":1,""max"":2,""weight"":60},
                                           {""itemId"":""coins"",""min"":4,""max"":16,""weight"":40}],
                                 ""tertiary"":[{""itemId"":""wolf_pelt"",""min"":1,""max"":1,""chance"":0.08}],
                                 ""petTable"":[{""itemId"":""pet_wolf"",""chance"":0.004}]}},
                               ""FOODS"":{}}",
                ["recipes"] = @"{""RECIPES"":[{""id"":""saw_oak"",""name"":""Saw Oak"",""skill"":""carpentry"",
                                 ""levelReq"":1,""ticks"":3,""xp"":25,
                                 ""inputs"":[{""itemId"":""oak_log"",""qty"":1}],
                                 ""output"":{""itemId"":""oak_plank"",""qty"":1}}]}",
                ["buildings"] = @"{""BUILDINGS"":{""sawmill"":{}},""BUILDING_TYPES"":[""sawmill""],""MAX_BUILD_LEVEL"":3}",
                ["achievements"] = @"{""ACHIEVEMENTS"":{""first_log"":{}}}",
                ["xp"] = @"{""XP_TABLE"":[0,83,174]}",
                ["npcs"] = @"{""VILLAGERS"":{""bram"":{}},""CRITTERS"":{},""VETERAN_TIERS"":[],""VILLAGER_SPECS"":{}}",
                ["quests"] = @"{""QUESTS"":{""landfall"":{}}}",
                ["farming"] = @"{""SEEDS"":{""cabbage_seed"":{}},""SEED_IDS"":[""cabbage_seed""]}",
                ["clues"] = @"{""CLUE_TIERS"":{""simple"":{}},""CLUE_TIER_LIST"":[""simple""]}",
                ["shop"] = @"{""STOCK"":[{""itemId"":""oak_plank"",""price"":15}]}",
            };
        }

        private static ContentDatabase Load(Dictionary<string, string> files)
            => ContentDatabase.Load(name => files.TryGetValue(name, out string t) ? t : null);

        private static IReadOnlyList<string> ValidateWith(string file, string replacement)
        {
            Dictionary<string, string> files = Clean();
            files[file] = replacement;
            return ContentValidator.Validate(Load(files));
        }

        private static void AssertMentions(IReadOnlyList<string> errors, params string[] fragments)
        {
            Assert.That(errors, Is.Not.Empty, "expected a validation error, got none");

            string joined = string.Join(" | ", errors);
            foreach (string fragment in fragments)
            {
                Assert.That(joined, Does.Contain(fragment),
                    $"the error should name \"{fragment}\" so it can be found and fixed: {joined}");
            }
        }

        // A monster table rewritten around one broken drop, so a test can change
        // a single field without restating the whole combat file.
        private static string CombatWith(string main, string tertiary, string pets)
        {
            return @"{""ATTACK_STYLES"":{},""BUFFS"":{},""WEAPON_SPECIALS"":{},""AFFIXES"":{},
                     ""WEAPONS"":{""fists"":{""id"":""fists"",""name"":""Fists"",""itemId"":null}},
                     ""MONSTERS"":{""dire_wolf"":{""id"":""dire_wolf"",""name"":""Dire Wolf"",
                       ""main"":[" + main + @"],""tertiary"":[" + tertiary + @"],""petTable"":[" + pets + @"]}},
                     ""FOODS"":{}}";
        }

        [Test]
        public void CleanContentValidates()
        {
            Assert.That(ContentValidator.Validate(Load(Clean())), Is.Empty);
        }

        [Test]
        public void ValidateOrThrowStaysQuietOnCleanContent()
        {
            Assert.DoesNotThrow(() => ContentValidator.ValidateOrThrow(Load(Clean())));
        }

        // The headline case: a drop table pointing at an item nobody defined.
        // Otherwise this surfaces months later as a rare drop that never lands.
        [Test]
        public void UnknownDropItemIsCaught()
        {
            IReadOnlyList<string> errors = ValidateWith("combat", CombatWith(
                @"{""itemId"":""mithril_bar"",""min"":1,""max"":1,""weight"":10}", "", ""));

            AssertMentions(errors, "dire_wolf", "mithril_bar");
        }

        [Test]
        public void UnrollableDropWeightIsCaught()
        {
            IReadOnlyList<string> errors = ValidateWith("combat", CombatWith(
                @"{""itemId"":""wolf_pelt"",""min"":1,""max"":1,""weight"":0}", "", ""));

            AssertMentions(errors, "wolf_pelt", "never be rolled");
        }

        [Test]
        public void MissingDropWeightIsCaught()
        {
            IReadOnlyList<string> errors = ValidateWith("combat", CombatWith(
                @"{""itemId"":""wolf_pelt"",""min"":1,""max"":1}", "", ""));

            AssertMentions(errors, "wolf_pelt", "no weight");
        }

        // Chances are fractions. A 5 here means "always", and is almost always a
        // typo for 0.05 — which would otherwise ship as a guaranteed pet drop.
        [Test]
        public void ChanceAboveOneIsCaught()
        {
            IReadOnlyList<string> errors = ValidateWith("combat", CombatWith(
                @"{""itemId"":""wolf_pelt"",""min"":1,""max"":1,""weight"":10}",
                "", @"{""itemId"":""pet_wolf"",""chance"":5}"));

            AssertMentions(errors, "pet_wolf", "fractions");
        }

        [Test]
        public void InvertedDropRangeIsCaught()
        {
            IReadOnlyList<string> errors = ValidateWith("combat", CombatWith(
                @"{""itemId"":""coins"",""min"":16,""max"":4,""weight"":10}", "", ""));

            AssertMentions(errors, "coins", "min 16", "max 4");
        }

        // fists is a real weapon row with real numbers and no backing item, so a
        // null itemId must stay legal. This guards against "tightening" the rule.
        [Test]
        public void UnarmedWeaponWithNoItemIsAllowed()
        {
            Assert.That(ContentValidator.Validate(Load(Clean())), Is.Empty);
        }

        [Test]
        public void WeaponPointingAtUnknownItemIsCaught()
        {
            IReadOnlyList<string> errors = ValidateWith("combat",
                @"{""ATTACK_STYLES"":{},""BUFFS"":{},""WEAPON_SPECIALS"":{},""AFFIXES"":{},
                  ""WEAPONS"":{""dagger"":{""id"":""dagger"",""itemId"":""rune_dagger""}},
                  ""MONSTERS"":{},""FOODS"":{}}");

            AssertMentions(errors, "dagger", "rune_dagger");
        }

        [Test]
        public void UnknownRecipeInputIsCaught()
        {
            IReadOnlyList<string> errors = ValidateWith("recipes",
                @"{""RECIPES"":[{""id"":""saw_oak"",""inputs"":[{""itemId"":""willow_log"",""qty"":1}],
                   ""output"":{""itemId"":""oak_plank"",""qty"":1}}]}");

            AssertMentions(errors, "saw_oak", "willow_log");
        }

        [Test]
        public void UnknownRecipeOutputIsCaught()
        {
            IReadOnlyList<string> errors = ValidateWith("recipes",
                @"{""RECIPES"":[{""id"":""saw_oak"",""inputs"":[{""itemId"":""oak_log"",""qty"":1}],
                   ""output"":{""itemId"":""mithril_bar"",""qty"":1}}]}");

            AssertMentions(errors, "output", "mithril_bar");
        }

        [Test]
        public void UnknownShopStockItemIsCaught()
        {
            IReadOnlyList<string> errors = ValidateWith("shop",
                @"{""STOCK"":[{""itemId"":""dragon_sword"",""price"":15}]}");

            AssertMentions(errors, "shop stock", "dragon_sword");
        }

        // A record whose key and id disagree is ambiguous rather than untidy: a
        // lookup by key and a lookup by id find different answers.
        [Test]
        public void ItemKeyDisagreeingWithItsIdIsCaught()
        {
            IReadOnlyList<string> errors = ValidateWith("items",
                @"{""ITEMS"":{""oak_plank"":{""id"":""oak_planks"",""name"":""Oak Plank"",""value"":12}},
                  ""ITEM_ICONS"":{},""ITEM_ICON_IMAGE_IDS"":[]}");

            AssertMentions(errors, "oak_plank", "oak_planks");
        }

        [Test]
        public void NamelessItemIsCaught()
        {
            IReadOnlyList<string> errors = ValidateWith("items",
                @"{""ITEMS"":{""oak_plank"":{""id"":""oak_plank"",""value"":12}},
                  ""ITEM_ICONS"":{},""ITEM_ICON_IMAGE_IDS"":[]}");

            AssertMentions(errors, "oak_plank", "no name");
        }

        [Test]
        public void NegativeItemValueIsCaught()
        {
            IReadOnlyList<string> errors = ValidateWith("items",
                @"{""ITEMS"":{""oak_plank"":{""id"":""oak_plank"",""name"":""Oak Plank"",""value"":-5}},
                  ""ITEM_ICONS"":{},""ITEM_ICON_IMAGE_IDS"":[]}");

            AssertMentions(errors, "oak_plank", "negative");
        }

        // Someone fixing content wants the whole list, not one line per run.
        [Test]
        public void EveryProblemIsReportedNotJustTheFirst()
        {
            Dictionary<string, string> files = Clean();
            files["shop"] = @"{""STOCK"":[{""itemId"":""ghost_one"",""price"":1},
                                          {""itemId"":""ghost_two"",""price"":2}]}";
            files["recipes"] = @"{""RECIPES"":[{""id"":""saw_oak"",
                                  ""inputs"":[{""itemId"":""ghost_three"",""qty"":1}],
                                  ""output"":{""itemId"":""ghost_four"",""qty"":1}}]}";

            IReadOnlyList<string> errors = ContentValidator.Validate(Load(files));

            Assert.That(errors.Count, Is.EqualTo(4), string.Join(" | ", errors));
            foreach (string ghost in new[] { "ghost_one", "ghost_two", "ghost_three", "ghost_four" })
                Assert.That(errors.Any(e => e.Contains(ghost)), Is.True, $"{ghost} was not reported");
        }

        [Test]
        public void ValidateOrThrowReportsEveryProblemInOneMessage()
        {
            Dictionary<string, string> files = Clean();
            files["shop"] = @"{""STOCK"":[{""itemId"":""ghost_one"",""price"":1},
                                          {""itemId"":""ghost_two"",""price"":2}]}";

            var ex = Assert.Throws<ContentException>(
                () => ContentValidator.ValidateOrThrow(Load(files)));

            Assert.That(ex.Message, Does.Contain("ghost_one"));
            Assert.That(ex.Message, Does.Contain("ghost_two"));
        }
    }
}
