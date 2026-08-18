namespace Isoperia.Core.Sim
{
    /// <summary>
    /// A source of randomness, injected rather than taken from a global.
    ///
    /// The TypeScript combat system calls <c>Math.random()</c> directly, which
    /// makes every roll in it untestable: you can assert that damage lands
    /// somewhere in a range, but never that a specific sequence of rolls produces
    /// a specific fight. Threading the source through instead means the combat
    /// port can be checked against the original roll for roll, with the same
    /// generator on both sides — which is what
    /// <c>scripts/verify-combat-parity.cjs</c> does.
    ///
    /// It also matters at runtime. Draw ORDER is part of the contract: a hit roll
    /// is drawn before a damage roll, a main drop before its quantity, an affix
    /// check before the affix choice. Reordering those changes every fight from a
    /// given seed even though each individual formula is still correct.
    /// </summary>
    public interface IRandom
    {
        /// <summary>Next value in [0, 1). Advances the stream.</summary>
        double Next();
    }

    /// <summary>Adapts the world-generation PRNG to <see cref="IRandom"/>.</summary>
    public sealed class Mulberry32Random : IRandom
    {
        private readonly Mulberry32 _rng;

        public Mulberry32Random(int seed) => _rng = new Mulberry32(seed);

        public double Next() => _rng.Next();
    }

    /// <summary>
    /// Replays a fixed sequence, then repeats the last value.
    ///
    /// For tests that need a specific outcome — "this roll misses, this one hits
    /// for maximum" — rather than a statistical property.
    /// </summary>
    public sealed class ScriptedRandom : IRandom
    {
        private readonly double[] _values;
        private int _i;

        public ScriptedRandom(params double[] values) => _values = values;

        /// <summary>How many draws have been taken. Lets a test assert draw ORDER.</summary>
        public int DrawCount => _i;

        public double Next()
        {
            if (_values.Length == 0) return 0;
            double v = _values[_i < _values.Length ? _i : _values.Length - 1];
            _i++;
            return v;
        }
    }
}
