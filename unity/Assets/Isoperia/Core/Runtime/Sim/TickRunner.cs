using System;
using System.Collections.Generic;

namespace Isoperia.Core.Sim
{
    /// <summary>
    /// The fixed 600 ms simulation clock. Port of the tick half of
    /// <c>src/core/Engine.ts</c>.
    ///
    /// Everything in the game that has an outcome happens here: combat rolls,
    /// gathering, crafting progress, monster AI, autosave. Rendering, animation
    /// and camera smoothing run per frame and are strictly downstream — they read
    /// simulation state and never write it.
    ///
    /// Deliberately NOT Unity's FixedUpdate: its step is a project-wide physics
    /// setting unrelated to our cadence, and on WebGL its interaction with frame
    /// pacing is not something we want the combat math resting on. This class
    /// takes delta time as a parameter, so it is pure, testable without an
    /// engine, and driven by a thin MonoBehaviour in Isoperia.Unity.
    /// </summary>
    public sealed class TickRunner
    {
        /// <summary>Rigid 600 ms tick = 100 ticks per minute.</summary>
        public const double TickMs = 600.0;

        /// <summary>
        /// Ceiling on how many ticks a single Advance call may run.
        ///
        /// A backgrounded tab, a long GC pause, or a stalled asset load can hand
        /// us a delta of many seconds. Without a clamp the game would resolve
        /// hundreds of combat rounds in one frame the moment it resumed — the
        /// player returns to a corpse. Elapsed real time while away is handled
        /// deliberately and separately by offline progression, which is capped and
        /// pays out only the things it should.
        /// </summary>
        public const int MaxCatchUpTicks = 5;

        /// <summary>
        /// Monotonically increasing tick counter. Used for scheduling — autosave
        /// every 20 ticks, buff durations, respawn timers — so it must never reset
        /// while a session is live.
        /// </summary>
        public long TickIndex { get; private set; }

        /// <summary>Ticks dropped to the catch-up clamp. Diagnostics only.</summary>
        public long DroppedTicks { get; private set; }

        private double _accumulatorMs;
        private readonly List<Action<long>> _handlers = new List<Action<long>>();

        /// <summary>
        /// Handlers run in registration order, which is load-bearing: movement
        /// resolves before combat so a monster that steps into range attacks on
        /// the same tick, matching the web build.
        /// </summary>
        public void OnTick(Action<long> handler)
        {
            if (handler == null) throw new ArgumentNullException(nameof(handler));
            _handlers.Add(handler);
        }

        public bool RemoveHandler(Action<long> handler) => _handlers.Remove(handler);

        /// <summary>
        /// Feed real elapsed time. Fires zero or more ticks.
        /// </summary>
        /// <param name="deltaMs">Milliseconds since the previous call.</param>
        /// <returns>How many ticks fired.</returns>
        public int Advance(double deltaMs)
        {
            if (deltaMs < 0 || double.IsNaN(deltaMs)) return 0;

            _accumulatorMs += deltaMs;

            int fired = 0;
            while (_accumulatorMs >= TickMs)
            {
                if (fired >= MaxCatchUpTicks)
                {
                    // Discard the backlog rather than carrying it into the next
                    // frame, which would just stretch the storm over more frames.
                    long dropped = (long)(_accumulatorMs / TickMs);
                    DroppedTicks += dropped;
                    _accumulatorMs = 0;
                    break;
                }

                _accumulatorMs -= TickMs;
                TickIndex++;
                fired++;

                // Snapshot: a handler may register or remove another mid-tick
                // (a dying monster detaching itself), and mutating the live list
                // during iteration would throw.
                for (int i = 0; i < _handlers.Count; i++)
                {
                    _handlers[i](TickIndex);
                }
            }

            return fired;
        }

        /// <summary>Clears the accumulator without firing. For scene transitions.</summary>
        public void ResetAccumulator() => _accumulatorMs = 0;
    }
}
