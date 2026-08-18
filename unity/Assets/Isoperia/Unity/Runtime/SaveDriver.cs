using System;
using System.Runtime.InteropServices;
using UnityEngine;
using Isoperia.Core.Save;
using Isoperia.Core.State;

namespace Isoperia.Unity
{
    /// <summary>
    /// Drives <see cref="SaveSystem"/> from Unity's lifecycle, and makes sure a
    /// save is flushed before the player can lose it.
    ///
    /// On WebGL the ways a session ends are all abrupt: the tab is closed, the
    /// browser is backgrounded and later reclaimed, or iOS kills the tab for
    /// memory. None of them run a tidy shutdown, and `OnApplicationQuit` is not
    /// reliably delivered in a browser at all — which is why the page installs
    /// pagehide/visibilitychange handlers that call back in here.
    /// </summary>
    [DefaultExecutionOrder(-500)]
    public sealed class SaveDriver : MonoBehaviour
    {
        /// <summary>Must match the GameObject name, since the JS side addresses it by name.</summary>
        public const string GameObjectName = "SaveDriver";

        private const string LifecycleMethod = nameof(OnPageHiding);

        public SaveSystem Save { get; private set; }
        public GameState State { get; private set; }

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void IsoperiaInstallLifecycleHooks(string goName, string method);
#endif

        private void Awake()
        {
            // The JS bridge sends messages to this object by name.
            if (gameObject.name != GameObjectName) gameObject.name = GameObjectName;
            DontDestroyOnLoad(gameObject);

            State = GameState.CreateFresh(nowMs: NowMs());
            Save = new SaveSystem(State, new FileSaveStore(), NowMs);

            LoadResult result = Save.Load();
            Debug.Log($"[Isoperia] save loaded from: {result.RecoveredFrom}");

            if (result.Summary != null && result.Summary.AwaySeconds > 0)
            {
                Debug.Log($"[Isoperia] away {result.Summary.AwaySeconds}s" +
                          (result.Summary.CapApplied ? " (capped)" : ""));
            }

#if UNITY_WEBGL && !UNITY_EDITOR
            IsoperiaInstallLifecycleHooks(GameObjectName, LifecycleMethod);
#endif
        }

        private void Start()
        {
            // Autosave rides the simulation tick rather than a wall-clock timer,
            // so it cannot fire while the game is paused mid-tick.
            GameLoop.Instance?.Tick.OnTick(Save.OnTick);
        }

        /// <summary>Epoch milliseconds. The single source of "now" for saves.</summary>
        public static long NowMs() =>
            (long)DateTime.UtcNow.Subtract(new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;

        /// <summary>Called from JavaScript on pagehide, blur, and hidden visibility.</summary>
        public void OnPageHiding()
        {
            if (Save == null) return;
            if (!Save.ForceSave()) Debug.LogWarning("[Isoperia] save on page-hide failed");
        }

        private void OnApplicationPause(bool paused)
        {
            // Native platforms' equivalent of the page hiding. Harmless on WebGL,
            // where the JS hooks do the real work.
            if (paused) Save?.ForceSave();
        }

        private void OnApplicationFocus(bool focused)
        {
            if (!focused) Save?.ForceSave();
        }

        private void OnApplicationQuit()
        {
            Save?.ForceSave();
        }
    }
}
