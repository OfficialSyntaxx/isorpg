namespace Isoperia.Core.Sim
{
    /// <summary>
    /// Bit-exact C# port of the mulberry32 PRNG in <c>src/world/Grid.ts</c>.
    ///
    /// The world is a pure function of this generator, so "close enough" is not
    /// a thing: a single differing bit produces a different map, which would
    /// silently invalidate every saved game and every reference screenshot.
    /// <see cref="Isoperia.Core.Tests"/> pins it against vectors captured from
    /// the TypeScript implementation.
    ///
    /// Porting notes, all of which matter:
    ///  - JavaScript's <c>|0</c> and <c>Math.imul</c> are 32-bit *wrapping*
    ///    operations. C# <c>int</c> arithmetic inside <c>unchecked</c> wraps
    ///    identically, so <c>Math.imul(a, b)</c> is just <c>unchecked(a * b)</c>.
    ///  - <c>&gt;&gt;&gt;</c> is a *logical* shift on a uint32. C#'s <c>&gt;&gt;</c>
    ///    on <c>int</c> is arithmetic (sign-propagating), so every one of them
    ///    casts through <c>uint</c> first. Getting this wrong only diverges for
    ///    negative intermediates, which is exactly the case that survives casual
    ///    testing and breaks the map.
    ///  - The final <c>&gt;&gt;&gt; 0</c> reinterprets as unsigned before the
    ///    divide, which is why the result is always in [0, 1).
    /// </summary>
    public sealed class Mulberry32
    {
        private int _state;

        public Mulberry32(int seed)
        {
            _state = seed;
        }

        /// <summary>Next double in [0, 1). Advances the stream.</summary>
        public double Next()
        {
            unchecked
            {
                _state = _state + (int)0x6d2b79f5;

                int t = Imul(_state ^ (int)((uint)_state >> 15), 1 | _state);
                t = (t + Imul(t ^ (int)((uint)t >> 7), 61 | t)) ^ t;

                return (uint)(t ^ (int)((uint)t >> 14)) / 4294967296.0;
            }
        }

        /// <summary>Equivalent of JavaScript's <c>Math.imul</c>.</summary>
        private static int Imul(int a, int b)
        {
            unchecked { return a * b; }
        }
    }
}
