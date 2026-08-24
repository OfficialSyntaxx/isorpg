using System;
using System.Collections.Generic;
using Isoperia.Core.State;
using Isoperia.Core.World;

namespace Isoperia.Core.Systems
{
    /// <summary>A point of interest on the world map.</summary>
    public sealed class Poi
    {
        public string Id;
        public string Name;
        public string Icon;
        public int X;
        public int Y;
        public bool Boss;

        /// <summary>
        /// Visible without being "discovered".
        ///
        /// Discovery is a persisted list of ids, which suits fixed landmarks. A
        /// clue's dig site is neither fixed nor something you find by exploring —
        /// the scroll already told you where it is — so it shows directly rather
        /// than being written into the save.
        /// </summary>
        public bool Always;

        public bool Discovered;
    }

    /// <summary>
    /// World map, discovery and fast travel. Port of
    /// <c>src/systems/MapSystem.ts</c>.
    ///
    /// The dungeon entrance, the guide's camp, the boss lair and the clue dig
    /// site are all supplied as lookups rather than by holding references to
    /// those systems. The TypeScript already did that for two of them; doing it
    /// for all four means this file has no dependency on systems that are still
    /// being ported, and it keeps the map from becoming the place everything
    /// else gets wired through.
    /// </summary>
    public sealed class MapSystem
    {
        /// <summary>Manhattan distance within which walking discovers a landmark.</summary>
        public const int DiscoverRadius = 3;

        private readonly int _size;
        private readonly PlayerState _player;

        private readonly Func<(int X, int Y)?> _dungeonEntrance;
        private readonly Func<(int X, int Y)?> _guideCamp;
        private readonly Func<(int X, int Y)?> _ogreLair;
        private readonly Func<(int X, int Y)?> _clueSite;

        /// <summary>
        /// Per-tile flags, rebuilt from the persisted index list on construction.
        ///
        /// The save stores a LIST of indices while this is a dense array. The
        /// array exists so recordExplore can reject a repeat in O(1) — without it
        /// the list would grow without bound as the player walked back and forth
        /// over the same tiles, and on a 126x126 map that list is already the
        /// largest thing in the save.
        /// </summary>
        private readonly bool[] _explored;

        public MapSystem(int size, PlayerState player,
                         Func<(int X, int Y)?> dungeonEntrance = null,
                         Func<(int X, int Y)?> guideCamp = null,
                         Func<(int X, int Y)?> ogreLair = null,
                         Func<(int X, int Y)?> clueSite = null)
        {
            if (size <= 0) throw new ArgumentOutOfRangeException(nameof(size));

            _size = size;
            _player = player ?? throw new ArgumentNullException(nameof(player));

            _dungeonEntrance = dungeonEntrance ?? (() => null);
            _guideCamp = guideCamp ?? (() => null);
            _ogreLair = ogreLair ?? (() => null);
            _clueSite = clueSite ?? (() => null);

            // The town is known from the start; the player is standing in it.
            if (!_player.MapDiscovered.Contains("town")) _player.MapDiscovered.Add("town");

            _explored = new bool[size * size];
            foreach (double idx in _player.MapExplored)
            {
                int i = (int)idx;
                if (i >= 0 && i < _explored.Length) _explored[i] = true;
            }
        }

        public bool FastTravelUnlocked => _player.MapFastTravel;

        public void UnlockFastTravel() => _player.MapFastTravel = true;

        /// <summary>
        /// The landmarks, in a fixed order.
        ///
        /// The boss marker is skipped when it would land exactly on another
        /// waypoint, and the dig site is appended last with a fixed id.
        /// </summary>
        public List<Poi> Pois()
        {
            int c = _size / 2;

            var list = new List<Poi>
            {
                new Poi { Id = "town", Name = "Isoperia Centre", Icon = "🏠", X = c, Y = c },
            };

            (int X, int Y)? caves = _dungeonEntrance();
            if (caves.HasValue)
                list.Add(new Poi { Id = "caves", Name = "The Caves", Icon = "🕳️", X = caves.Value.X, Y = caves.Value.Y });

            (int X, int Y)? guide = _guideCamp();
            if (guide.HasValue)
                list.Add(new Poi { Id = "eldric", Name = "Eldric's Camp", Icon = "🧭", X = guide.Value.X, Y = guide.Value.Y });

            (int X, int Y)? ogre = _ogreLair();
            if (ogre.HasValue)
            {
                bool clash = false;
                foreach (Poi p in list) if (p.X == ogre.Value.X && p.Y == ogre.Value.Y) { clash = true; break; }
                if (!clash)
                    list.Add(new Poi { Id = "ogre", Name = "The Forest Ogre", Icon = "👹", X = ogre.Value.X, Y = ogre.Value.Y, Boss = true });
            }

            (int X, int Y)? dig = _clueSite();
            if (dig.HasValue)
                list.Add(new Poi { Id = "clue_site", Name = "Dig here", Icon = "📜", X = dig.Value.X, Y = dig.Value.Y, Always = true });

            foreach (Poi p in list)
                p.Discovered = p.Always || _player.MapDiscovered.Contains(p.Id);

            return list;
        }

        /// <summary>
        /// Mark the player's tile and its four neighbours as walked.
        ///
        /// Only NEW tiles are appended to the persisted list, so walking in
        /// circles does not grow the save.
        /// </summary>
        public void RecordExplore(int px, int py)
        {
            if (px < 0 || py < 0 || px >= _size || py >= _size) return;

            Mark(px, py);
            Mark(px + 1, py);
            Mark(px - 1, py);
            Mark(px, py + 1);
            Mark(px, py - 1);
        }

        private void Mark(int x, int y)
        {
            if (x < 0 || y < 0 || x >= _size || y >= _size) return;

            int idx = y * _size + x;
            if (_explored[idx]) return;

            _explored[idx] = true;
            _player.MapExplored.Add(idx);
        }

        public bool IsExplored(int x, int y) =>
            x >= 0 && y >= 0 && x < _size && y < _size && _explored[y * _size + x];

        /// <summary>Percentage of the world walked, to one decimal place.</summary>
        public double CoveragePercent()
        {
            int seen = 0;
            for (int i = 0; i < _explored.Length; i++) if (_explored[i]) seen++;

            return Math.Round(seen / (double)(_size * _size) * 1000, MidpointRounding.AwayFromZero) / 10;
        }

        /// <summary>
        /// One flag per chunk block, row-major: has the player been anywhere in
        /// it? This is what the map panel draws rather than 15,876 tiles.
        /// </summary>
        public List<bool> CoarseCoverage()
        {
            int cols = Math.Max(1, (int)Math.Ceiling(_size / (double)Grid.GridChunk));
            var coarse = new List<bool>(cols * cols);

            for (int cb = 0; cb < cols; cb++)
            {
                for (int ca = 0; ca < cols; ca++)
                {
                    bool any = false;

                    for (int y = cb * Grid.GridChunk; y < Math.Min(_size, (cb + 1) * Grid.GridChunk) && !any; y++)
                        for (int x = ca * Grid.GridChunk; x < Math.Min(_size, (ca + 1) * Grid.GridChunk); x++)
                            if (_explored[y * _size + x]) { any = true; break; }

                    coarse.Add(any);
                }
            }

            return coarse;
        }

        /// <summary>
        /// Discover any landmark the player has walked near. Returns the ids that
        /// flipped, so the caller can toast them once.
        /// </summary>
        public List<string> CheckDiscoveries(int px, int py)
        {
            var fresh = new List<string>();

            foreach (Poi p in Pois())
            {
                if (_player.MapDiscovered.Contains(p.Id)) continue;
                if (Math.Abs(p.X - px) + Math.Abs(p.Y - py) > DiscoverRadius) continue;

                _player.MapDiscovered.Add(p.Id);
                fresh.Add(p.Id);
            }

            return fresh;
        }

        /// <summary>
        /// Where a waypoint sends you, or null when fast travel is locked, the
        /// id is unknown, or the place has not been found yet.
        /// </summary>
        public (int X, int Y)? TravelTarget(string id)
        {
            if (!_player.MapFastTravel) return null;
            if (!_player.MapDiscovered.Contains(id)) return null;

            foreach (Poi p in Pois()) if (p.Id == id) return (p.X, p.Y);
            return null;
        }

        public string PoiName(string id)
        {
            foreach (Poi p in Pois()) if (p.Id == id) return p.Name;
            return id;
        }
    }
}
