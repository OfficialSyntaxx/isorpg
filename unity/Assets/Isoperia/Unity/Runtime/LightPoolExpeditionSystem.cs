using System;
using Isoperia.Core.State;

namespace Isoperia.Unity
{
    /// <summary>Light-pool survival rule for the eastern Cinder Hollow approach.</summary>
    public sealed class LightPoolExpeditionSystem
    {
        public const string AcceptedJournalId = "cinder_hollow_accepted";
        public const string ReachedJournalId = "cinder_hollow_reached";
        public const string ReturnedJournalId = "cinder_hollow_returned";
        private static readonly int[,] Pools = { { 30, 20 }, { 34, 20 }, { 36, 24 } };
        private readonly GameState state;
        public event Action<string> StatusChanged;

        public LightPoolExpeditionSystem(GameState state) => this.state = state ?? throw new ArgumentNullException(nameof(state));

        public void Tick(long _)
        {
            var p = state.Player.Pos;
            if (!state.Player.Journal.Contains(AcceptedJournalId)) return;

            if (state.Player.Journal.Contains(ReachedJournalId) && InSettlement(p.Gx, p.Gy))
            {
                if (!state.Player.Journal.Contains(ReturnedJournalId))
                {
                    state.Player.Journal.Add(ReturnedJournalId);
                    StatusChanged?.Invoke("Cinder Hollow route complete · report to town");
                }
                return;
            }

            if (p.Gx < 28 || p.Gy < 16 || p.Gy > 26) return;
            if (AtEntrance(p.Gx, p.Gy) && !state.Player.Journal.Contains(ReachedJournalId))
            {
                state.Player.Journal.Add(ReachedJournalId);
                StatusChanged?.Invoke("Cinder Hollow survey marker found · return safely to settlement");
            }
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

        private static bool AtEntrance(int x, int y) => x >= 38 && y >= 22 && y <= 26;
        private static bool InSettlement(int x, int y) => x >= 17 && x <= 25 && y >= 17 && y <= 25;
    }
}
