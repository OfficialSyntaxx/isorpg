using System;
using System.Collections.Generic;
using Isoperia.Core.AI;
using Isoperia.Core.Components;

namespace Isoperia.Core.Systems
{
    /// <summary>
    /// Follows an A* waypoint path, frame-rate independently.
    ///
    /// Port of the simulation half of <c>src/systems/MovementSystem.ts</c>. The
    /// TypeScript class also drives limb rotations, a bob anchor and the model's
    /// yaw from <c>performance.now()</c>; none of that is here. Animation is
    /// presentation, it belongs on the Unity side, and keeping it out is what
    /// lets this file live in an assembly with no engine reference and be tested
    /// without an Editor.
    ///
    /// <para>
    /// Gx/Gy are authoritative for gameplay; Wx/Wz are the interpolated position
    /// and are read only by the renderer. That split is inherited from the
    /// TypeScript and is load-bearing: A*, range checks and tile occupancy all
    /// key off the integer tile, so a system that read the smoothed position
    /// would see a unit "between" tiles.
    /// </para>
    /// </summary>
    public sealed class MovementSystem
    {
        private readonly PositionComponent _pos;

        // PathStep rather than a tuple, deliberately. It is what AStar.FindPath
        // already returns, so no conversion is needed — and Mono's mcs, which
        // runs this port's tests outside Unity, has no ValueTuple. The same
        // toolchain gap once miscompiled a tuple swap in AStar into list
        // indexers and silently corrupted the heap.
        private readonly List<PathStep> _path = new List<PathStep>();
        private int _index;
        private double _curX;
        private double _curZ;

        /// <summary>Fired as each waypoint tile is reached.</summary>
        public event Action<int, int> Stepped;

        /// <summary>Fired once when the final waypoint is reached.</summary>
        public event Action<int, int> Arrived;

        public MovementSystem(PositionComponent pos)
        {
            _pos = pos ?? throw new ArgumentNullException(nameof(pos));
            _curX = pos.Wx;
            _curZ = pos.Wz;
        }

        public bool IsMoving { get; private set; }

        /// <summary>Final tile of the current path. Only meaningful while moving.</summary>
        public PathStep TargetTile =>
            _path.Count > 0 ? _path[_path.Count - 1] : new PathStep(_pos.Gx, _pos.Gy);

        /// <summary>
        /// Sets a full grid path, EXCLUDING the unit's own tile — the same
        /// convention <c>AStar</c> returns and the TypeScript expects. Passing a
        /// path that starts on the current tile makes the unit spend a step
        /// arriving where it already is.
        /// </summary>
        public void SetPath(IEnumerable<PathStep> path)
        {
            _path.Clear();
            if (path != null)
                foreach (PathStep p in path) _path.Add(p);

            _index = 0;
            IsMoving = _path.Count > 0;
        }

        public void Stop()
        {
            _path.Clear();
            _index = 0;
            IsMoving = false;
        }

        /// <summary>
        /// Advances by <paramref name="dtSeconds"/>.
        ///
        /// Called per FRAME, not per tick — movement is the one part of the
        /// simulation that is deliberately frame-driven, so walking looks smooth
        /// between the 600 ms ticks that everything else runs on.
        /// </summary>
        public void Update(double dtSeconds)
        {
            if (!IsMoving) return;

            if (_index >= _path.Count)
            {
                // Arrived. Snap the authoritative tile to the smoothed position
                // rather than to the last waypoint: they agree here, and rounding
                // the position is what the TypeScript does.
                IsMoving = false;
                _pos.Gx = (int)Math.Round(_curX, MidpointRounding.AwayFromZero);
                _pos.Gy = (int)Math.Round(_curZ, MidpointRounding.AwayFromZero);
                _pos.Wx = _curX;
                _pos.Wz = _curZ;
                Arrived?.Invoke(_pos.Gx, _pos.Gy);
                return;
            }

            PathStep next = _path[_index];
            int tx = next.X;
            int tz = next.Y;

            double dx = tx - _curX;
            double dz = tz - _curZ;
            double dist = Math.Sqrt(dx * dx + dz * dz);
            double step = _pos.Speed * dtSeconds;

            if (dist <= step)
            {
                _curX = tx;
                _curZ = tz;
                _pos.Gx = tx;
                _pos.Gy = tz;
                Stepped?.Invoke(tx, tz);
                _index++;
            }
            else
            {
                _curX += dx / dist * step;
                _curZ += dz / dist * step;
            }

            _pos.Wx = _curX;
            _pos.Wz = _curZ;

            // Atan2(dx, dz) — X then Z, not the usual Y then X. Matches the
            // TypeScript, and the isometric yaw convention depends on it.
            _pos.Facing = Math.Atan2(dx, dz);
        }
    }
}
