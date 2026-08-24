using System;
using System.Collections.Generic;
using NUnit.Framework;
using Isoperia.Core.Content;
using Isoperia.Core.Save;
using Isoperia.Core.Data;
using Isoperia.Core.Sim;
using Isoperia.Core.State;
using Isoperia.Core.Systems;

namespace Isoperia.Core.Tests
{
    [TestFixture]
    public class FarmSystemTests
    {
        private const long T0 = 1787000000000;

        /// <summary>Returns its values in order, then repeats the last.</summary>
        private sealed class ScriptedRandom : IRandom
        {
            private readonly double[] _v;
            public int Draws;
            public ScriptedRandom(params double[] v) { _v = v; }
            public double Next() { double d = _v[Math.Min(Draws, _v.Length - 1)]; Draws++; return d; }
        }

        private long _now;
        private GameState _state;
        private ContentDatabase _content;
        private int _beds;

        private FarmSystem Make(IRandom rng = null)
        {
            _content = TestContent.Real();
            _state = GameState.CreateFresh(nowMs: T0);
            _state.Player.Inventory.SetCatalog(new ContentItemCatalog(_content));
            _now = T0;
            _beds = 2;

            return new FarmSystem(_state, _content, rng ?? new ScriptedRandom(0.0),
                                  () => _now, () => _beds);
        }

        // -- planting -------------------------------------------------------

        [Test]
        public void PlantsIntoTheFirstFreeBedAndConsumesTheSeed()
        {
            FarmSystem farm = Make();
            _state.Player.Inventory.Add("potato_seed", 3);

            Assert.IsTrue(farm.TryPlant("potato_seed", out int bed, out PlantFailure why));
            Assert.AreEqual(0, bed);
            Assert.AreEqual(PlantFailure.None, why);
            Assert.AreEqual(2, _state.Player.Inventory.Count("potato_seed"));
        }

        [Test]
        public void CannotPlantASeedYouDoNotCarry()
        {
            FarmSystem farm = Make();
            Assert.IsFalse(farm.TryPlant("potato_seed", out _, out PlantFailure why));
            Assert.AreEqual(PlantFailure.NoSeed, why);
        }

        [Test]
        public void CannotPlantAnUnknownSeed()
        {
            FarmSystem farm = Make();
            Assert.IsFalse(farm.TryPlant("no_such_seed", out _, out PlantFailure why));
            Assert.AreEqual(PlantFailure.UnknownSeed, why);
        }

        [Test]
        public void CannotPlantAboveYourFarmingLevel()
        {
            FarmSystem farm = Make();
            _state.Player.Inventory.Add("redberry_seed", 1);

            // redberry_seed requires farming 30; a fresh character is level 1.
            // Asserted rather than skipped-if-unset: a test that ignores itself
            // when its premise changes reports green while proving nothing.
            Assert.AreEqual(30, (int)_content.Seeds["redberry_seed"]["levelReq"].AsNumber(0),
                "content changed — update this test deliberately");
            Assert.AreEqual(1, farm.Level);

            Assert.IsFalse(farm.TryPlant("redberry_seed", out _, out PlantFailure why));
            Assert.AreEqual(PlantFailure.Level, why);
        }

        [Test]
        public void CannotPlantWithEveryBedOccupied()
        {
            FarmSystem farm = Make();
            _state.Player.Inventory.Add("potato_seed", 5);

            Assert.IsTrue(farm.TryPlant("potato_seed", out _, out _));
            Assert.IsTrue(farm.TryPlant("potato_seed", out _, out _));

            Assert.IsFalse(farm.TryPlant("potato_seed", out _, out PlantFailure why));
            Assert.AreEqual(PlantFailure.NoBed, why);
            Assert.AreEqual(3, _state.Player.Inventory.Count("potato_seed"),
                "a failed plant must not consume the seed");
        }

        [Test]
        public void NoFarmPlotMeansNoBeds()
        {
            FarmSystem farm = Make();
            _beds = 0;
            _state.Player.Inventory.Add("potato_seed", 1);

            Assert.IsFalse(farm.TryPlant("potato_seed", out _, out PlantFailure why));
            Assert.AreEqual(PlantFailure.NoBed, why);
        }

        // -- growth is wall-clock -------------------------------------------

        [Test]
        public void CropsGrowOnWallClockTimeWithNoTicking()
        {
            FarmSystem farm = Make();
            _state.Player.Inventory.Add("potato_seed", 1);
            farm.TryPlant("potato_seed", out int bed, out _);

            double grow = _content.Seeds["potato_seed"]["growMs"].AsNumber(0);

            Assert.AreEqual(HarvestFailure.Unripe, farm.Harvest(bed).Reason);

            // Nothing ticks. Only the clock moves.
            _now = T0 + (long)grow;
            Assert.IsTrue(farm.Harvest(bed).Ok);
        }

        [Test]
        public void RipeCountTracksTheClock()
        {
            FarmSystem farm = Make();
            _state.Player.Inventory.Add("potato_seed", 2);
            farm.TryPlant("potato_seed", out _, out _);
            farm.TryPlant("potato_seed", out _, out _);

            Assert.AreEqual(0, farm.RipeCount());

            _now = T0 + (long)_content.Seeds["potato_seed"]["growMs"].AsNumber(0);
            Assert.AreEqual(2, farm.RipeCount());
        }

        // -- yield ----------------------------------------------------------

        /// <summary>
        /// Mastery raises the FLOOR of the yield, it does not add a bonus roll.
        /// At mastery 1 the harvest spans the crop's full range; at 99 it is
        /// always the maximum. A port that added a separate bonus would make the
        /// range printed in the wiki a lie.
        /// </summary>
        [Test]
        public void MasteryRaisesTheYieldFloorRatherThanAddingABonus()
        {
            // Draw 0.0 always takes the LOWEST value in the range, so the result
            // is exactly the floor.
            FarmSystem farm = Make(new ScriptedRandom(0.0));
            _state.Player.Inventory.Add("potato_seed", 1);
            farm.TryPlant("potato_seed", out int bed, out _);
            _now = T0 + (long)_content.Seeds["potato_seed"]["growMs"].AsNumber(0);

            int minYield = (int)_content.Seeds["potato_seed"]["produce"]["min"].AsNumber(0);
            Assert.AreEqual(minYield, farm.Harvest(bed).Amount, "mastery 1 floors at the crop minimum");

            // Now at max mastery the floor is the crop maximum.
            FarmSystem farm2 = Make(new ScriptedRandom(0.0));
            _state.Player.Skills.AddMasteryXp(Skills.Farming, "potato", 4851);   // level 99
            _state.Player.Inventory.Add("potato_seed", 1);
            farm2.TryPlant("potato_seed", out int bed2, out _);
            _now = T0 + (long)_content.Seeds["potato_seed"]["growMs"].AsNumber(0);

            int maxYield = (int)_content.Seeds["potato_seed"]["produce"]["max"].AsNumber(0);
            Assert.AreEqual(maxYield, farm2.Harvest(bed2).Amount, "mastery 99 always yields the maximum");
        }

        [Test]
        public void HarvestAwardsXpAndRecordsTheCrop()
        {
            FarmSystem farm = Make();
            _state.Player.Inventory.Add("potato_seed", 1);
            farm.TryPlant("potato_seed", out int bed, out _);
            _now = T0 + (long)_content.Seeds["potato_seed"]["growMs"].AsNumber(0);

            HarvestResult r = farm.Harvest(bed);

            Assert.IsTrue(r.Ok);
            Assert.AreEqual((int)_content.Seeds["potato_seed"]["xp"].AsNumber(0), r.Xp);
            Assert.AreEqual(r.Xp, _state.Player.Skills.Get(Skills.Farming).Xp, 1e-9);
            Assert.IsTrue(_state.CollectionLog.Contains(r.ItemId));
            Assert.AreEqual(r.Amount, _state.Player.Inventory.Count(r.ItemId));
        }

        /// <summary>
        /// A full bag leaves the crop IN THE GROUND rather than destroying it.
        /// The cap is checked before the bed is cleared. LabourSystem.Claim does
        /// the opposite and loses the overflow; both match the TypeScript.
        /// </summary>
        [Test]
        public void AFullBagLeavesTheCropInTheGround()
        {
            FarmSystem farm = Make();
            _state.Player.Inventory.Add("potato_seed", 1);
            farm.TryPlant("potato_seed", out int bed, out _);
            _now = T0 + (long)_content.Seeds["potato_seed"]["growMs"].AsNumber(0);

            _state.Player.Inventory.StorageCap = 1;
            _state.Player.Inventory.Add("normal_log", 1);

            HarvestResult r = farm.Harvest(bed);

            Assert.IsFalse(r.Ok);
            Assert.AreEqual(HarvestFailure.InventoryFull, r.Reason);
            Assert.AreEqual(1, farm.RipeCount(), "the crop is still there to harvest later");
        }

        [Test]
        public void HarvestingAnEmptyBedFails()
        {
            FarmSystem farm = Make();
            Assert.AreEqual(HarvestFailure.Empty, farm.Harvest(0).Reason);
        }

        [Test]
        public void HarvestAllTotalsPerItem()
        {
            FarmSystem farm = Make();
            _state.Player.Inventory.Add("potato_seed", 2);
            farm.TryPlant("potato_seed", out _, out _);
            farm.TryPlant("potato_seed", out _, out _);
            _now = T0 + (long)_content.Seeds["potato_seed"]["growMs"].AsNumber(0);

            List<KeyValuePair<string, int>> got = farm.HarvestAll();

            Assert.AreEqual(1, got.Count, "two beds of the same crop total into one row");
            Assert.AreEqual(_state.Player.Inventory.Count(got[0].Key), got[0].Value);
        }

        /// <summary>
        /// One draw per SUCCESSFUL harvest, and none for a failure — so an
        /// unripe or blocked bed does not advance the stream.
        /// </summary>
        [Test]
        public void OnlySuccessfulHarvestsTakeADraw()
        {
            var rng = new ScriptedRandom(0.0);
            FarmSystem farm = Make(rng);
            _state.Player.Inventory.Add("potato_seed", 1);
            farm.TryPlant("potato_seed", out int bed, out _);

            farm.Harvest(bed);                       // unripe
            Assert.AreEqual(0, rng.Draws);

            _now = T0 + (long)_content.Seeds["potato_seed"]["growMs"].AsNumber(0);
            farm.Harvest(bed);                       // ripe
            Assert.AreEqual(1, rng.Draws);
        }

        // -- bed syncing ----------------------------------------------------

        /// <summary>
        /// Shrinking the bed array must not bin a growing crop. Only EMPTY
        /// trailing beds are removed.
        /// </summary>
        [Test]
        public void LosingAPlotDoesNotDestroyACropAlreadyInTheGround()
        {
            FarmSystem farm = Make();
            _beds = 2;
            _state.Player.Inventory.Add("potato_seed", 2);
            farm.TryPlant("potato_seed", out _, out _);   // bed 0
            farm.TryPlant("potato_seed", out _, out _);   // bed 1

            _beds = 0;                                    // the plot is demolished

            _now = T0 + (long)_content.Seeds["potato_seed"]["growMs"].AsNumber(0);
            Assert.AreEqual(2, farm.RipeCount(), "planted crops survive losing the plot");
        }

        [Test]
        public void EmptyTrailingBedsAreTrimmed()
        {
            FarmSystem farm = Make();
            _beds = 4;
            Assert.AreEqual(0, farm.RipeCount());
            Assert.AreEqual(4, _state.Town.FarmPlots.Count);

            _beds = 1;
            farm.RipeCount();
            Assert.AreEqual(1, _state.Town.FarmPlots.Count);
        }

        [Test]
        public void BedsFromCountsFarmPlotLevelsNotPlots()
        {
            GameState st = GameState.CreateFresh(nowMs: T0);
            st.Town.Buildings.Add(new TownBuilding { Type = "FARM_PLOT", Level = 3, X = 1, Y = 1, Id = "a" });
            st.Town.Buildings.Add(new TownBuilding { Type = "FARM_PLOT", Level = 1, X = 2, Y = 2, Id = "b" });
            st.Town.Buildings.Add(new TownBuilding { Type = "SAWMILL", Level = 5, X = 3, Y = 3, Id = "c" });

            Assert.AreEqual(4, FarmSystem.BedsFrom(st), "levels, not plot count, and only FARM_PLOT");
        }
    }
}
