using System.Collections.Generic;
using NUnit.Framework;
using Isoperia.Core.AI;
using Isoperia.Core.Components;
using Isoperia.Core.Systems;

namespace Isoperia.Core.Tests
{
    [TestFixture]
    public class MovementSystemTests
    {
        private static List<PathStep> Path(params int[] xy)
        {
            var p = new List<PathStep>();
            for (int i = 0; i < xy.Length; i += 2) p.Add(new PathStep(xy[i], xy[i + 1]));
            return p;
        }

        [Test]
        public void NotMovingUntilGivenAPath()
        {
            var pos = PositionComponent.Create(5, 5);
            var mv = new MovementSystem(pos);

            Assert.IsFalse(mv.IsMoving);
            mv.Update(1.0);
            Assert.AreEqual(5, pos.Gx);
        }

        [Test]
        public void AnEmptyPathDoesNotStartMovement()
        {
            var mv = new MovementSystem(PositionComponent.Create(5, 5));
            mv.SetPath(Path());
            Assert.IsFalse(mv.IsMoving);
        }

        [Test]
        public void WalksAStraightPathAndArrives()
        {
            var pos = PositionComponent.Create(0, 0, speed: 1.0);
            var mv = new MovementSystem(pos);

            int arrivedX = -1, arrivedY = -1;
            mv.Arrived += (x, y) => { arrivedX = x; arrivedY = y; };

            mv.SetPath(Path(1, 0, 2, 0));

            // 1 tile/s over 2 tiles = 4 updates of 0.6s to consume both
            // waypoints, plus a fifth for arrival to be noticed. See
            // ArrivalIsNoticedOnTheUpdateAfterTheLastWaypoint.
            for (int i = 0; i < 5; i++) mv.Update(0.6);

            Assert.IsFalse(mv.IsMoving);
            Assert.AreEqual(2, pos.Gx);
            Assert.AreEqual(0, pos.Gy);
            Assert.AreEqual(2, arrivedX);
            Assert.AreEqual(0, arrivedY);
        }

        [Test]
        public void StepFiresOncePerWaypoint()
        {
            var pos = PositionComponent.Create(0, 0, speed: 10.0);
            var mv = new MovementSystem(pos);

            var steps = new List<string>();
            mv.Stepped += (x, y) => steps.Add($"{x},{y}");

            mv.SetPath(Path(1, 0, 1, 1, 2, 1));
            for (int i = 0; i < 10; i++) mv.Update(0.1);

            Assert.AreEqual(3, steps.Count);
            Assert.AreEqual("1,0", steps[0]);
            Assert.AreEqual("1,1", steps[1]);
            Assert.AreEqual("2,1", steps[2]);
        }

        /// <summary>
        /// The tile is authoritative for gameplay and the world position is for
        /// rendering. Mid-step the two must disagree — if Gx tracked the smoothed
        /// position, range checks and tile occupancy would see a unit between
        /// tiles.
        /// </summary>
        [Test]
        public void TileLagsBehindTheSmoothedPositionMidStep()
        {
            var pos = PositionComponent.Create(0, 0, speed: 1.0);
            var mv = new MovementSystem(pos);
            mv.SetPath(Path(4, 0));

            mv.Update(0.5);   // half a tile along

            Assert.AreEqual(0, pos.Gx, "tile must not move until the waypoint is reached");
            Assert.AreEqual(0.5, pos.Wx, 1e-9);
            Assert.IsTrue(mv.IsMoving);
        }

        /// <summary>
        /// Arrival is reported on the update AFTER the last waypoint is
        /// consumed, not on the same one. The TypeScript has the same one-frame
        /// lag — it returns immediately after incrementing the index, and only
        /// the next call sees the index past the end. Pinned because it is
        /// exactly the kind of off-by-one a "tidier" rewrite would remove, and
        /// anything sequencing an action on arrival would then fire a frame early.
        /// </summary>
        [Test]
        public void ArrivalIsNoticedOnTheUpdateAfterTheLastWaypoint()
        {
            var pos = PositionComponent.Create(0, 0, speed: 100.0);
            var mv = new MovementSystem(pos);

            bool arrived = false;
            mv.Arrived += (x, y) => arrived = true;

            mv.SetPath(Path(1, 0));

            mv.Update(1.0);
            Assert.IsFalse(arrived, "not yet — the waypoint was only just consumed");
            Assert.IsTrue(mv.IsMoving);

            mv.Update(1.0);
            Assert.IsTrue(arrived);
            Assert.IsFalse(mv.IsMoving);
        }

        [Test]
        public void StopHaltsImmediatelyAndFiresNoArrival()
        {
            var pos = PositionComponent.Create(0, 0, speed: 1.0);
            var mv = new MovementSystem(pos);

            bool arrived = false;
            mv.Arrived += (x, y) => arrived = true;

            mv.SetPath(Path(5, 0));
            mv.Update(0.5);
            mv.Stop();
            mv.Update(10.0);

            Assert.IsFalse(mv.IsMoving);
            Assert.IsFalse(arrived);
        }

        [Test]
        public void ANewPathReplacesTheOldOne()
        {
            var pos = PositionComponent.Create(0, 0, speed: 10.0);
            var mv = new MovementSystem(pos);

            mv.SetPath(Path(5, 5));
            mv.SetPath(Path(1, 0));
            for (int i = 0; i < 5; i++) mv.Update(0.1);

            Assert.AreEqual(1, pos.Gx);
            Assert.AreEqual(0, pos.Gy);
        }

        /// <summary>
        /// Facing is Atan2(dx, dz) — X first, then Z, which is not the usual
        /// argument order. Moving along +X must give pi/2, not 0.
        /// </summary>
        [Test]
        public void FacingUsesTheIsometricArgumentOrder()
        {
            var pos = PositionComponent.Create(0, 0, speed: 1.0);
            var mv = new MovementSystem(pos);

            mv.SetPath(Path(10, 0));
            mv.Update(0.1);

            Assert.AreEqual(System.Math.PI / 2, pos.Facing, 1e-9);
        }
    }
}
