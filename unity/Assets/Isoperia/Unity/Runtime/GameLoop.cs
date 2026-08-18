using UnityEngine;
using Isoperia.Core.Sim;

namespace Isoperia.Unity
{
    /// <summary>
    /// The only bridge between Unity's frame loop and the simulation clock.
    ///
    /// Deliberately thin: it converts <c>Time.deltaTime</c> into milliseconds and
    /// hands them to <see cref="TickRunner"/>. All gameplay lives in
    /// Isoperia.Core, which cannot reference UnityEngine at all, so this class is
    /// the entire surface where the two meet.
    ///
    /// Not FixedUpdate: that step is a project-wide physics setting unrelated to
    /// our 600 ms cadence, and coupling combat rolls to it would make the game's
    /// balance a side effect of a physics field.
    /// </summary>
    [DefaultExecutionOrder(-1000)]
    public sealed class GameLoop : MonoBehaviour
    {
        public static GameLoop Instance { get; private set; }

        /// <summary>The simulation clock. Systems subscribe via <c>Tick.OnTick</c>.</summary>
        public TickRunner Tick { get; private set; }

        [Header("Diagnostics (read-only)")]
        [SerializeField] private long _tickIndex;
        [SerializeField] private long _droppedTicks;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);
            Tick = new TickRunner();

            // WebGL is single-threaded and vsync-driven; asking for a rate the
            // browser will not honour just burns battery. 60 is a ceiling, not a
            // promise, and Phase 8 may cap it lower on weak devices.
            Application.targetFrameRate = 60;
        }

        private void Update()
        {
            if (Tick == null) return;

            Tick.Advance(Time.deltaTime * 1000.0);

            _tickIndex = Tick.TickIndex;
            _droppedTicks = Tick.DroppedTicks;
        }

        private void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }
    }
}
