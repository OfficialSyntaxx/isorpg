using System;
using Isoperia.Core.State;

namespace Isoperia.Unity
{
    /// <summary>Light-pool survival rule for the eastern Cinder Hollow approach.</summary>
    public sealed class LightPoolExpeditionSystem
    {
        private static readonly int[,] Pools = { { 30, 20 }, { 34, 20 }, { 36, 24 } };
        private readonly GameState state;
        public event Action<string> StatusChanged;

        public LightPoolExpeditionSystem(GameState state) => this.state = state ?? throw new ArgumentNullException(nameof(state));

        public void Tick(long _)
        {
            var p = state.Player.Pos;
            if (p.Gx < 28 || p.Gy < 16 || p.Gy > 26) return;
            if (InLight(p.Gx, p.Gy))
            {
                StatusChanged?.Invoke("Cinder Hollow · safe in lantern light");
                return;
            }

            state.Player.Health.Hp = Math.Max(0, state.Player.Health.Hp - 3);
            if (state.Player.Health.Hp > 0)
            {
                StatusChanged?.Invoke("Cinder Hollow darkness burns · find a lantern pool");
                return;
            }

            state.Player.Health.Hp = state.Player.Health.MaxHp;
            p.Gx = p.Gy = 21;
            p.Wx = p.Gx;
            p.Wz = p.Gy;
            StatusChanged?.Invoke("Darkness overcame you · returned to settlement");
        }

        public static bool InLight(int x, int y)
        {
            for (int i = 0; i < Pools.GetLength(0); i++)
                if (Math.Max(Math.Abs(x - Pools[i, 0]), Math.Abs(y - Pools[i, 1])) <= 2) return true;
            return false;
        }
    }
}
