using NUnit.Framework;
using Isoperia.Core.Components;
using Isoperia.Core.Save;
using Isoperia.Core.State;

namespace Isoperia.Core.Tests
{
    /// <summary>
    /// Save round-tripping, recovery, autosave cadence, and offline progression.
    ///
    /// Time is injected rather than read from the clock, so an eight-hour idle
    /// window is a variable rather than a wait. That is also why the offline cap
    /// is testable at all.
    /// </summary>
    public class SaveSystemTests
    {
        private const long T0 = 1_787_000_000_000;

        private long _now;
        private GameState _state;
        private MemorySaveStore _store;
        private SaveSystem _save;

        [SetUp]
        public void SetUp()
        {
            _now = T0;
            _state = GameState.CreateFresh(nowMs: T0);
            _store = new MemorySaveStore();
            _save = new SaveSystem(_state, _store, () => _now);
        }

        private void Advance(long ms) => _now += ms;

        // ---- round trip --------------------------------------------------------

        [Test]
        public void SerializeThenApplyPreservesState()
        {
            _state.Player.Name = "Wren";
            _state.Player.Pos.Gx = 17;
            _state.Player.Pos.Gy = 23;
            _state.Player.Health.Hp = 42;
            _state.Player.Health.MaxHp = 88;
            _state.Player.Skills.AddXp("woodcutting", 5000);
            _state.Player.Skills.AddMasteryXp("woodcutting", "logs", 120);
            _state.Player.Inventory.Add("logs", 63);
            _state.Player.Equipped["weapon"] = "iron_sword";
            _state.Player.Journal.Add("q_intro");
            _state.Player.MetaKills["giant_rat"] = 41;
            _state.Player.Resolve = 55;
            _state.Player.SpecialEnergy = 30;
            _state.Player.MapDiscovered.Add("poi_a");
            _state.Player.MapFastTravel = true;
            _state.ClockMinute = 733;
            _state.ClockDay = 5;
            _state.Settings.AutoEatPct = 60;
            _state.Settings.AttackStyle = "aggressive";
            _state.CollectionLog.Add("logs");
            _state.Town.Buildings.Add(new TownBuilding
            { Id = "b1", Type = "CAMPFIRE", X = 20, Y = 21, Level = 2 });

            JsonValue payload = _save.Serialize();

            // Apply onto a fresh state, which is what a real load does.
            var loadedState = GameState.CreateFresh(nowMs: T0);
            var loaded = new SaveSystem(loadedState, new MemorySaveStore(), () => _now);
            Assert.IsTrue(loaded.Apply(payload));

            Assert.AreEqual("Wren", loadedState.Player.Name);
            Assert.AreEqual(17, loadedState.Player.Pos.Gx);
            Assert.AreEqual(23, loadedState.Player.Pos.Gy);
            Assert.AreEqual(42, loadedState.Player.Health.Hp);
            Assert.AreEqual(88, loadedState.Player.Health.MaxHp);
            Assert.AreEqual(5000, loadedState.Player.Skills.Get("woodcutting").Xp);
            Assert.AreEqual(120, loadedState.Player.Skills.Get("woodcutting").Mastery["logs"]);
            Assert.AreEqual(63, loadedState.Player.Inventory.Count("logs"));
            Assert.AreEqual("iron_sword", loadedState.Player.Equipped["weapon"]);
            CollectionAssert.AreEqual(new[] { "q_intro" }, loadedState.Player.Journal);
            Assert.AreEqual(41, loadedState.Player.MetaKills["giant_rat"]);
            Assert.AreEqual(55, loadedState.Player.Resolve);
            Assert.AreEqual(30, loadedState.Player.SpecialEnergy);
            Assert.IsTrue(loadedState.Player.MapFastTravel);
            Assert.AreEqual(733, loadedState.ClockMinute);
            Assert.AreEqual(5, loadedState.ClockDay);
            Assert.AreEqual(60, loadedState.Settings.AutoEatPct);
            Assert.AreEqual("aggressive", loadedState.Settings.AttackStyle);
            Assert.IsTrue(loadedState.CollectionLog.Contains("logs"));
            Assert.AreEqual(1, loadedState.Town.Buildings.Count);
            Assert.AreEqual("CAMPFIRE", loadedState.Town.Buildings[0].Type);
            Assert.AreEqual(2, loadedState.Town.Buildings[0].Level);
        }

        [Test]
        public void ExportedJsonIsParseableAndIndented()
        {
            string json = _save.ExportJson();

            Assert.IsNotNull(JsonValue.Parse(json), "an exported save must be valid JSON");
            Assert.IsTrue(json.Contains("\n"), "the player's export file should be readable");
        }

        [Test]
        public void ClueSurvivesARoundTrip()
        {
            _state.Player.Clue = new ActiveClue { Tier = "simple", Seed = 77, Step = 1 };
            _state.Player.Clue.Sites.Add((3, 4));
            _state.Player.Clue.Sites.Add((5, 6));

            var loadedState = GameState.CreateFresh(nowMs: T0);
            var loaded = new SaveSystem(loadedState, new MemorySaveStore(), () => _now);
            Assert.IsTrue(loaded.Apply(_save.Serialize()));

            Assert.IsNotNull(loadedState.Player.Clue);
            Assert.AreEqual("simple", loadedState.Player.Clue.Tier);
            Assert.AreEqual(1, loadedState.Player.Clue.Step);
            Assert.AreEqual(2, loadedState.Player.Clue.Sites.Count);
            Assert.AreEqual(5, loadedState.Player.Clue.Sites[1].X);
            Assert.AreEqual(6, loadedState.Player.Clue.Sites[1].Y);
        }

        // ---- persistence -------------------------------------------------------

        [Test]
        public void ForceSaveWritesPrimaryAndFlushes()
        {
            Assert.IsTrue(_save.ForceSave());

            Assert.IsNotNull(_store.Primary);
            Assert.Greater(_store.FlushCount, 0,
                "a save is not durable on WebGL until it has been flushed to IndexedDB");
        }

        [Test]
        public void ForceSaveReportsAFailedWrite()
        {
            _store.FailWrites = true;
            Assert.IsFalse(_save.ForceSave(), "a full disk or exceeded quota must be reported, not swallowed");
        }

        [Test]
        public void AutosaveFiresEveryTwentyTicks()
        {
            Assert.AreEqual(20, SaveSystem.AutosaveEveryTicks);

            for (int i = 1; i < 20; i++) _save.OnTick(i);
            Assert.IsNull(_store.Primary, "must not save before the cadence is reached");

            _save.OnTick(20);
            Assert.IsNotNull(_store.Primary);
        }

        [Test]
        public void LoadReadsBackAPrimarySave()
        {
            _state.Player.Name = "Bram";
            _state.Player.Inventory.Add("coal", 12);
            _save.ForceSave();

            var freshState = GameState.CreateFresh(nowMs: T0);
            var fresh = new SaveSystem(freshState, _store, () => _now);

            LoadResult r = fresh.Load();

            Assert.AreEqual(LoadOutcome.Primary, r.RecoveredFrom);
            Assert.AreEqual("Bram", freshState.Player.Name);
            Assert.AreEqual(12, freshState.Player.Inventory.Count("coal"));
        }

        /// <summary>
        /// The reason a backup is kept: a primary truncated mid-write parses to
        /// nothing, and without the fallback that is a wiped profile.
        /// </summary>
        [Test]
        public void LoadFallsBackToTheBackupWhenThePrimaryIsCorrupt()
        {
            _state.Player.Name = "Tobias";
            _save.ForceSave();

            _store.Primary = "{\"version\":\"1.1.0\",\"player\":{\"na";  // truncated mid-write

            var freshState = GameState.CreateFresh(nowMs: T0);
            var fresh = new SaveSystem(freshState, _store, () => _now);

            LoadResult r = fresh.Load();

            Assert.AreEqual(LoadOutcome.Backup, r.RecoveredFrom);
            Assert.AreEqual("Tobias", freshState.Player.Name);
        }

        [Test]
        public void LoadReportsFreshWhenNothingIsStored()
        {
            LoadResult r = _save.Load();

            Assert.AreEqual(LoadOutcome.Fresh, r.RecoveredFrom);
            Assert.IsNull(r.Summary, "a fresh profile has no offline window to report");
        }

        [Test]
        public void LoadReportsFreshWhenBothCopiesAreUnusable()
        {
            _store.Primary = "not json at all";
            _store.Backup = "{ also broken";

            Assert.AreEqual(LoadOutcome.Fresh, _save.Load().RecoveredFrom);
        }

        // ---- offline progression -------------------------------------------------

        [Test]
        public void NoTimeAwayEarnsNothing()
        {
            OfflineSummary s = _save.ComputeOffline();

            Assert.AreEqual(0, s.AwaySeconds);
            Assert.IsFalse(s.CapApplied);
        }

        [Test]
        public void AwayTimeIsMeasuredFromTheSavedTimestamp()
        {
            _save.ForceSave();
            Advance(4 * 3600 * 1000);   // four hours

            OfflineSummary s = _save.ComputeOffline();

            Assert.AreEqual(4 * 3600, s.AwaySeconds);
            Assert.IsFalse(s.CapApplied, "four hours is inside the eight-hour cap");
        }

        /// <summary>
        /// The cap is a design decision, not a safety valve. Thirty hours away pays
        /// out eight, and says so.
        /// </summary>
        [Test]
        public void TimeBeyondTheCapIsReportedButNotPaid()
        {
            _save.ForceSave();
            Advance(30L * 3600 * 1000);

            OfflineSummary s = _save.ComputeOffline();

            Assert.AreEqual(30 * 3600, s.AwaySeconds, "the real elapsed time is still reported");
            Assert.IsTrue(s.CapApplied);
        }

        [Test]
        public void ATownHallRaisesTheCapToTwelveHours()
        {
            _save.OfflineCapHoursProvider = () => 12.0;
            _save.ForceSave();
            Advance(10L * 3600 * 1000);

            OfflineSummary s = _save.ComputeOffline();

            Assert.IsFalse(s.CapApplied, "ten hours is inside a twelve-hour cap");
            Assert.IsTrue(s.Lines.Exists(l => l.Contains("12h")),
                "the player should be told the Town Hall raised the ceiling");
        }

        /// <summary>
        /// Without consuming the window, quitting and reloading repeatedly would
        /// pay the same idle time out over and over.
        /// </summary>
        [Test]
        public void TheElapsedWindowIsConsumedSoItCannotPayTwice()
        {
            _save.ForceSave();
            Advance(4 * 3600 * 1000);

            Assert.AreEqual(4 * 3600, _save.ComputeOffline().AwaySeconds);
            Assert.AreEqual(0, _save.ComputeOffline().AwaySeconds,
                "a second call with no further time elapsed must earn nothing");
        }

        [Test]
        public void OfflineTaxScalesWithHallLevelAndTime()
        {
            Assert.AreEqual(0, SaveSystem.OfflineTaxFor(0, 3600), "no hall, no tax");
            Assert.AreEqual(0, SaveSystem.OfflineTaxFor(2, 0), "no time, no tax");
            Assert.AreEqual(0, SaveSystem.OfflineTaxFor(2, -50), "negative time is not income");

            // 2 coins per level per 6-second cycle.
            Assert.AreEqual(2 * 1 * 10, SaveSystem.OfflineTaxFor(1, 60));
            Assert.AreEqual(2 * 3 * 10, SaveSystem.OfflineTaxFor(3, 60));
            Assert.AreEqual(2 * 1 * 600, SaveSystem.OfflineTaxFor(1, 3600));
        }

        [Test]
        public void ATownHallPaysTaxIntoTheBagWhileAway()
        {
            _state.Town.Buildings.Add(new TownBuilding
            { Id = "hall", Type = "TOWN_HALL", X = 20, Y = 20, Level = 2 });

            _save.ForceSave();
            Advance(3600 * 1000);   // one hour

            OfflineSummary s = _save.ComputeOffline();

            Assert.AreEqual(SaveSystem.OfflineTaxFor(2, 3600), _state.Player.Inventory.Count("coins"));
            Assert.IsTrue(s.Lines.Exists(l => l.Contains("Town Hall tax")));
        }

        [Test]
        public void WithoutATownHallNoTaxIsPaid()
        {
            _save.ForceSave();
            Advance(8L * 3600 * 1000);

            _save.ComputeOffline();

            Assert.AreEqual(0, _state.Player.Inventory.Count("coins"));
        }

        /// <summary>
        /// A clock that jumps backwards — a corrected device time, a save copied
        /// from another machine — must not produce negative or wrapped rewards.
        /// </summary>
        [Test]
        public void AClockGoingBackwardsEarnsNothingRatherThanBreaking()
        {
            _save.ForceSave();
            _now -= 5L * 3600 * 1000;

            OfflineSummary s = _save.ComputeOffline();

            Assert.AreEqual(0, s.AwaySeconds);
            Assert.IsFalse(s.CapApplied);
        }
    }
}
