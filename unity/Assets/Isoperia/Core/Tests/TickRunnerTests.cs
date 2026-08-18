using NUnit.Framework;
using Isoperia.Core.Sim;

namespace Isoperia.Core.Tests
{
    /// <summary>
    /// The 600 ms clock. Everything with a gameplay outcome hangs off this, so
    /// its cadence is not negotiable: at 601 ms per tick, every drop rate, XP
    /// rate and combat exchange in the game shifts.
    /// </summary>
    public class TickRunnerTests
    {
        [Test]
        public void TickIsSixHundredMilliseconds()
        {
            Assert.AreEqual(600.0, TickRunner.TickMs);
        }

        [Test]
        public void DoesNotFireBelowOneTick()
        {
            var r = new TickRunner();
            Assert.AreEqual(0, r.Advance(599));
            Assert.AreEqual(0, r.TickIndex);
        }

        [Test]
        public void FiresExactlyOnceAtTheBoundary()
        {
            var r = new TickRunner();
            Assert.AreEqual(1, r.Advance(600));
            Assert.AreEqual(1, r.TickIndex);
        }

        /// <summary>
        /// The remainder must carry, or the clock drifts slower than real time.
        /// Sixty frames of 16.67 ms is 1000 ms and must yield exactly one tick
        /// with 400 ms banked.
        /// </summary>
        [Test]
        public void AccumulatesRemainderAcrossFrames()
        {
            var r = new TickRunner();
            int fired = 0;
            for (int i = 0; i < 60; i++) fired += r.Advance(1000.0 / 60.0);

            Assert.AreEqual(1, fired);

            // 400 ms banked: 200 more should not tick, 201 should.
            Assert.AreEqual(0, r.Advance(199));
            Assert.AreEqual(1, r.Advance(2));
        }

        [Test]
        public void FiresMultipleTicksForALargeDelta()
        {
            var r = new TickRunner();
            Assert.AreEqual(3, r.Advance(1800));
            Assert.AreEqual(3, r.TickIndex);
        }

        /// <summary>
        /// A backgrounded tab or a long GC pause can hand us many seconds. Without
        /// the clamp the game resolves hundreds of combat rounds the instant it
        /// resumes and the player returns to a corpse. Time spent away is paid out
        /// deliberately by offline progression instead.
        /// </summary>
        [Test]
        public void ClampsCatchUpAfterALongStall()
        {
            var r = new TickRunner();
            int ticks = 0;
            r.OnTick(_ => ticks++);

            int fired = r.Advance(60_000);   // one minute stalled

            Assert.AreEqual(TickRunner.MaxCatchUpTicks, fired);
            Assert.AreEqual(TickRunner.MaxCatchUpTicks, ticks);
            Assert.Greater(r.DroppedTicks, 0, "the discarded backlog should be recorded");

            // The backlog must be dropped, not banked: the next frame is normal.
            Assert.AreEqual(0, r.Advance(0));
            Assert.AreEqual(1, r.Advance(600));
        }

        [Test]
        public void TickIndexIsMonotonic()
        {
            var r = new TickRunner();
            long last = 0;
            for (int i = 0; i < 50; i++)
            {
                r.Advance(600);
                Assert.AreEqual(last + 1, r.TickIndex);
                last = r.TickIndex;
            }
        }

        [Test]
        public void PassesTheTickIndexToHandlers()
        {
            var r = new TickRunner();
            var seen = new System.Collections.Generic.List<long>();
            r.OnTick(seen.Add);

            r.Advance(1800);

            CollectionAssert.AreEqual(new long[] { 1, 2, 3 }, seen);
        }

        /// <summary>
        /// Registration order is load-bearing: movement resolves before combat, so
        /// a monster that steps into range attacks on the same tick.
        /// </summary>
        [Test]
        public void RunsHandlersInRegistrationOrder()
        {
            var r = new TickRunner();
            var order = new System.Collections.Generic.List<string>();
            r.OnTick(_ => order.Add("movement"));
            r.OnTick(_ => order.Add("combat"));

            r.Advance(600);

            CollectionAssert.AreEqual(new[] { "movement", "combat" }, order);
        }

        [Test]
        public void IgnoresNegativeAndNaNDeltas()
        {
            var r = new TickRunner();
            Assert.AreEqual(0, r.Advance(-1000));
            Assert.AreEqual(0, r.Advance(double.NaN));
            Assert.AreEqual(0, r.TickIndex);

            // and the clock is undamaged
            Assert.AreEqual(1, r.Advance(600));
        }

        [Test]
        public void HandlersCanBeRemoved()
        {
            var r = new TickRunner();
            int n = 0;
            System.Action<long> h = _ => n++;
            r.OnTick(h);

            r.Advance(600);
            Assert.AreEqual(1, n);

            Assert.IsTrue(r.RemoveHandler(h));
            r.Advance(600);
            Assert.AreEqual(1, n, "removed handler still fired");
        }

        [Test]
        public void ResetAccumulatorDropsPartialProgress()
        {
            var r = new TickRunner();
            r.Advance(599);
            r.ResetAccumulator();
            Assert.AreEqual(0, r.Advance(1), "the banked 599 ms should be gone");
        }
    }
}
