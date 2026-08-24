using System.Collections.Generic;
using NUnit.Framework;
using Isoperia.Core.State;
using Isoperia.Core.Systems;
using Isoperia.Core.World;

namespace Isoperia.Core.Tests
{
    [TestFixture]
    public class MapSystemTests
    {
        private GameState _state;

        private MapSystem Make(int size = 42,
                               (int X, int Y)? caves = null,
                               (int X, int Y)? guide = null,
                               (int X, int Y)? ogre = null,
                               (int X, int Y)? clue = null)
        {
            _state = GameState.CreateFresh(nowMs: 1787000000000);
            return new MapSystem(size, _state.Player,
                                 () => caves, () => guide, () => ogre, () => clue);
        }

        // -- landmarks ------------------------------------------------------

        [Test]
        public void TheTownIsKnownFromTheStart()
        {
            MapSystem map = Make();
            Assert.Contains("town", _state.Player.MapDiscovered);

            List<Poi> pois = map.Pois();
            Assert.AreEqual(1, pois.Count);
            Assert.IsTrue(pois[0].Discovered);
        }

        [Test]
        public void LandmarksAppearOnlyWhenTheirSystemSuppliesOne()
        {
            MapSystem none = Make();
            Assert.AreEqual(1, none.Pois().Count, "just the town");

            MapSystem some = Make(caves: (5, 6), guide: (7, 8));
            Assert.AreEqual(3, some.Pois().Count);
        }

        /// <summary>
        /// The boss marker is skipped when it would sit exactly on another
        /// waypoint, so the map never draws two icons on one tile.
        /// </summary>
        [Test]
        public void TheBossMarkerIsSkippedWhenItLandsOnAnotherWaypoint()
        {
            MapSystem clash = Make(caves: (5, 6), ogre: (5, 6));
            foreach (Poi p in clash.Pois()) Assert.AreNotEqual("ogre", p.Id);

            MapSystem apart = Make(caves: (5, 6), ogre: (9, 9));
            bool found = false;
            foreach (Poi p in apart.Pois()) if (p.Id == "ogre") { found = true; Assert.IsTrue(p.Boss); }
            Assert.IsTrue(found);
        }

        /// <summary>
        /// The dig site shows without being discovered and is NOT a landmark you
        /// find by exploring — the scroll already told you where it is.
        /// </summary>
        [Test]
        public void TheDigSiteIsVisibleWithoutBeingDiscovered()
        {
            MapSystem map = Make(clue: (11, 12));

            bool found = false;
            foreach (Poi p in map.Pois())
                if (p.Id == "clue_site") { found = true; Assert.IsTrue(p.Always); Assert.IsTrue(p.Discovered); }

            Assert.IsTrue(found);
            Assert.IsFalse(_state.Player.MapDiscovered.Contains("clue_site"),
                "showing it must not write it into the save");
        }

        [Test]
        public void TheDigSiteDisappearsWhenTheHuntEnds()
        {
            MapSystem map = Make(clue: null);
            foreach (Poi p in map.Pois()) Assert.AreNotEqual("clue_site", p.Id);
        }

        // -- discovery ------------------------------------------------------

        [Test]
        public void WalkingNearALandmarkDiscoversIt()
        {
            MapSystem map = Make(caves: (20, 20));

            Assert.AreEqual(0, map.CheckDiscoveries(30, 30).Count);
            Assert.IsFalse(_state.Player.MapDiscovered.Contains("caves"));

            List<string> fresh = map.CheckDiscoveries(20, 22);   // Manhattan 2
            Assert.Contains("caves", fresh);
        }

        [Test]
        public void DiscoveryUsesManhattanDistanceAndTheRadiusIsThree()
        {
            MapSystem edge = Make(caves: (20, 20));
            Assert.AreEqual(0, edge.CheckDiscoveries(22, 22).Count, "Manhattan 4 is out of range");

            MapSystem inside = Make(caves: (20, 20));
            Assert.AreEqual(1, inside.CheckDiscoveries(22, 21).Count, "Manhattan 3 is in range");
        }

        [Test]
        public void ALandmarkIsOnlyDiscoveredOnce()
        {
            MapSystem map = Make(caves: (20, 20));

            Assert.AreEqual(1, map.CheckDiscoveries(20, 20).Count);
            Assert.AreEqual(0, map.CheckDiscoveries(20, 20).Count, "no repeat");
            Assert.AreEqual(2, _state.Player.MapDiscovered.Count, "town + caves, no duplicate");
        }

        // -- exploration ----------------------------------------------------

        [Test]
        public void ExploringMarksTheTileAndItsFourNeighbours()
        {
            MapSystem map = Make();
            map.RecordExplore(10, 10);

            Assert.IsTrue(map.IsExplored(10, 10));
            Assert.IsTrue(map.IsExplored(11, 10));
            Assert.IsTrue(map.IsExplored(9, 10));
            Assert.IsTrue(map.IsExplored(10, 11));
            Assert.IsTrue(map.IsExplored(10, 9));

            Assert.IsFalse(map.IsExplored(11, 11), "diagonals are not marked");
            Assert.AreEqual(5, _state.Player.MapExplored.Count);
        }

        /// <summary>
        /// Walking the same ground repeatedly must not grow the save. On a
        /// 126x126 map the explored list is already the largest thing in it.
        /// </summary>
        [Test]
        public void WalkingInCirclesDoesNotGrowTheSave()
        {
            MapSystem map = Make();

            for (int i = 0; i < 50; i++) map.RecordExplore(10, 10);

            Assert.AreEqual(5, _state.Player.MapExplored.Count);
        }

        [Test]
        public void ExploringOffTheMapIsIgnored()
        {
            MapSystem map = Make(size: 10);

            map.RecordExplore(-1, 5);
            map.RecordExplore(10, 5);
            Assert.AreEqual(0, _state.Player.MapExplored.Count);

            // At an edge, only the in-bounds neighbours are marked.
            map.RecordExplore(0, 0);
            Assert.AreEqual(3, _state.Player.MapExplored.Count, "self + right + down");
        }

        [Test]
        public void ExploredTilesSurviveALoad()
        {
            MapSystem first = Make();
            first.RecordExplore(10, 10);
            int saved = _state.Player.MapExplored.Count;

            // A second system over the same persisted state, as on load.
            var reloaded = new MapSystem(42, _state.Player);

            Assert.IsTrue(reloaded.IsExplored(10, 10));

            reloaded.RecordExplore(10, 10);
            Assert.AreEqual(saved, _state.Player.MapExplored.Count, "already-known tiles are not re-added");
        }

        [Test]
        public void CoverageIsAPercentageToOneDecimalPlace()
        {
            MapSystem map = Make(size: 10);
            Assert.AreEqual(0, map.CoveragePercent(), 1e-9);

            map.RecordExplore(5, 5);            // 5 of 100 tiles
            Assert.AreEqual(5.0, map.CoveragePercent(), 1e-9);
        }

        [Test]
        public void CoarseCoverageIsOneFlagPerChunkBlock()
        {
            MapSystem map = Make(size: Grid.GridChunk * 3);

            List<bool> coarse = map.CoarseCoverage();
            Assert.AreEqual(9, coarse.Count);
            foreach (bool b in coarse) Assert.IsFalse(b);

            map.RecordExplore(1, 1);            // first block only
            coarse = map.CoarseCoverage();
            Assert.IsTrue(coarse[0]);
            Assert.IsFalse(coarse[1]);
        }

        // -- fast travel ----------------------------------------------------

        [Test]
        public void FastTravelIsLockedUntilUnlocked()
        {
            MapSystem map = Make(caves: (20, 20));
            map.CheckDiscoveries(20, 20);

            Assert.IsFalse(map.FastTravelUnlocked);
            Assert.IsNull(map.TravelTarget("caves"));

            map.UnlockFastTravel();
            Assert.IsTrue(map.FastTravelUnlocked);
            Assert.AreEqual(20, map.TravelTarget("caves").Value.X);
        }

        [Test]
        public void CannotTravelToAPlaceNotYetFound()
        {
            MapSystem map = Make(caves: (20, 20));
            map.UnlockFastTravel();

            Assert.IsNull(map.TravelTarget("caves"), "discovered first, then travel");

            map.CheckDiscoveries(20, 20);
            Assert.IsNotNull(map.TravelTarget("caves"));
        }

        [Test]
        public void CannotTravelToAnUnknownId()
        {
            MapSystem map = Make();
            map.UnlockFastTravel();
            Assert.IsNull(map.TravelTarget("atlantis"));
        }

        [Test]
        public void PoiNameFallsBackToTheId()
        {
            MapSystem map = Make();
            Assert.AreEqual("Isoperia Centre", map.PoiName("town"));
            Assert.AreEqual("nowhere", map.PoiName("nowhere"));
        }
    }
}
