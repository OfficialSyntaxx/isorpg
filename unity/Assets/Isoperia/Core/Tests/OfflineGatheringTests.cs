using System;
using System.Collections.Generic;
using NUnit.Framework;
using Isoperia.Core.Components;
using Isoperia.Core.Content;
using Isoperia.Core.Save;
using Isoperia.Core.State;

namespace Isoperia.Core.Tests
{
    /// <summary>
    /// Offline per-skill gathering — the piece deliberately deferred from Phase
    /// 2b until the content pipeline existed.
    ///
    /// Loads the REAL exported content rather than a fixture, because the
    /// behaviours worth pinning here are properties of the actual resource
    /// tables: which resource a level-1 miner idles on, and what three gathering
    /// skills sharing one storage cap add up to.
    /// </summary>
    [TestFixture]
    public class OfflineGatheringTests
    {
        private const long T0 = 1_787_000_000_000;

        /// <summary>
        /// Loads the real exported content.
        ///
        /// Deliberately THROWS when it cannot be found rather than skipping.
        /// A test that quietly passes when its subject is missing is worse than
        /// no test: it would report green in CI while proving nothing, which is
        /// the failure mode this whole migration keeps running into.
        /// </summary>
        private static ContentDatabase RealContent()
        {
            // Runs from the repo root outside Unity and from the Unity project
            // root inside it, so try both shapes while walking upward.
            string dir = System.IO.Directory.GetCurrentDirectory();

            for (int i = 0; i < 8 && dir != null; i++)
            {
                foreach (string rel in new[]
                {
                    "unity/Assets/Isoperia/Resources/Content",
                    "Assets/Isoperia/Resources/Content",
                })
                {
                    string candidate = System.IO.Path.Combine(dir, rel);
                    if (!System.IO.Directory.Exists(candidate)) continue;

                    return ContentDatabase.Load(name =>
                    {
                        string p = System.IO.Path.Combine(candidate, name + ".json");
                        return System.IO.File.Exists(p) ? System.IO.File.ReadAllText(p) : null;
                    });
                }

                dir = System.IO.Path.GetDirectoryName(dir);
            }

            throw new ContentException(
                "could not find Assets/Isoperia/Resources/Content from " +
                System.IO.Directory.GetCurrentDirectory() +
                ". Run `npm run export:content`.");
        }

        private static SaveSystem Make(out GameState state, long now, ContentDatabase content)
        {
            state = GameState.CreateFresh(nowMs: T0);
            state.Player.Inventory.SetCatalog(new ContentItemCatalog(content));

            GameState captured = state;
            var save = new SaveSystem(captured, new MemorySaveStore(), () => now) { Content = content };
            return save;
        }

        [Test]
        public void EightHoursAwayEarnsGatheringXpAndItems()
        {
            ContentDatabase c = RealContent();

            SaveSystem save = Make(out GameState st, T0 + 8L * 3600 * 1000, c);
            double before = st.Player.Skills.Get("woodcutting").Xp;

            OfflineSummary s = save.ComputeOffline();

            Assert.Greater(st.Player.Skills.Get("woodcutting").Xp, before);
            Assert.Greater(s.Lines.Count, 0);
        }

        /// <summary>
        /// THE BUG THIS GUARDS. The storage cap is shared across every skill.
        /// Three gathering skills each idling for eight hours must not bank three
        /// times the cap between them — an earlier version clamped each skill
        /// independently and did exactly that.
        /// </summary>
        [Test]
        public void ThreeGatheringSkillsShareOneStorageCap()
        {
            ContentDatabase c = RealContent();

            SaveSystem save = Make(out GameState st, T0 + 8L * 3600 * 1000, c);
            int cap = st.Player.Inventory.StorageCap;

            save.ComputeOffline();

            Assert.LessOrEqual(st.Player.Inventory.StoredAmount(), cap,
                "bulk stored offline must never exceed the shared cap");
        }

        /// <summary>
        /// rock_copper and rock_tin are both levelReq 1, so what a level-1 miner
        /// earns overnight is decided purely by iteration order. The TypeScript
        /// keeps the first DECLARED (rock_copper); the C# iterates in sorted id
        /// order and must reach the same answer. Without this test a data change
        /// could silently start repaying every returning miner in tin.
        /// </summary>
        [Test]
        public void OfflineGatheringPicksCopperOverTin()
        {
            ContentDatabase c = RealContent();

            SaveSystem save = Make(out GameState st, T0 + 8L * 3600 * 1000, c);

            // The cap has to be lifted or this measures the wrong thing. Skills
            // are processed in SKILL_IDS order against ONE shared cap, so with
            // the default 500 woodcutting fills the bag and mining stores
            // nothing — a correct outcome that would make this test pass or fail
            // for reasons unrelated to the copper/tin tie.
            st.Player.Inventory.StorageCap = 1_000_000;

            save.ComputeOffline();

            Assert.Greater(st.Player.Inventory.Count("copper_ore"), 0, "a level-1 miner should idle on copper");
            Assert.AreEqual(0, st.Player.Inventory.Count("tin_ore"), "not tin — copper is declared first");
        }

        /// <summary>
        /// Without content, offline gathering is skipped rather than crashing.
        /// Losing a few hours of idle gathering is recoverable; refusing to load
        /// a save is not.
        /// </summary>
        [Test]
        public void WithoutContentGatheringIsSkippedNotFatal()
        {
            GameState st = GameState.CreateFresh(nowMs: T0);
            var save = new SaveSystem(st, new MemorySaveStore(), () => T0 + 8L * 3600 * 1000);

            OfflineSummary s = null;
            Assert.DoesNotThrow(() => s = save.ComputeOffline());
            Assert.IsNotNull(s);
        }

        /// <summary>
        /// XP is credited ONLY for the actions whose drops actually fit.
        ///
        /// With a cap of 10, woodcutting idles for eight hours but banks 10 logs,
        /// so it is paid for 10 actions — not for the ~1,900 it notionally
        /// performed. Crediting all of them would let a player with a full bag
        /// earn a full night of XP for ten logs' worth of storage, which is both
        /// wrong and the cheaper of the two ways to get this wrong unnoticed.
        ///
        /// tree_normal: 15 ticks/action, yield 1, normal_log gives 25 woodcutting
        /// XP. 10 logs stored at 25 XP each = 250.
        /// </summary>
        [Test]
        public void XpIsCreditedOnlyForActionsWhoseDropsFit()
        {
            ContentDatabase c = RealContent();

            SaveSystem save = Make(out GameState st, T0 + 8L * 3600 * 1000, c);
            st.Player.Inventory.StorageCap = 10;

            save.ComputeOffline();

            // Woodcutting is the first gathering skill in SKILL_IDS, so it takes
            // the whole cap before mining or fishing see any of it.
            Assert.AreEqual(10, st.Player.Inventory.Count("normal_log"));
            Assert.AreEqual(250, st.Player.Skills.Get("woodcutting").Xp, 1e-9);
        }

        [Test]
        public void NoTimeAwayEarnsNothing()
        {
            ContentDatabase c = RealContent();

            SaveSystem save = Make(out GameState st, T0, c);
            double before = st.Player.Skills.Get("woodcutting").Xp;

            save.ComputeOffline();

            Assert.AreEqual(before, st.Player.Skills.Get("woodcutting").Xp, 1e-9);
        }
    }
}
