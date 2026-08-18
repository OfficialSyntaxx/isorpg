// Bridges Unity's Emscripten filesystem to IndexedDB, and exposes the safe-area
// insets the PWA shell measured.
//
// WHY THE SYNC EXISTS: on WebGL, Application.persistentDataPath is an in-memory
// Emscripten filesystem backed by IndexedDB. Writes land in memory only; nothing
// reaches IndexedDB until FS.syncfs runs. A save written without this is lost the
// moment the tab closes — silently, with no error, and the player has no idea
// their progress was not kept.
mergeInto(LibraryManager.library, {

  // Push the in-memory filesystem out to IndexedDB.
  IsoperiaSyncFs: function () {
    try {
      if (typeof FS === 'undefined' || typeof FS.syncfs !== 'function') return 0;

      // populate=false means "memory -> IndexedDB". Passing true would go the
      // other way and overwrite the save that was just written with the older
      // stored copy.
      FS.syncfs(false, function (err) {
        if (err) console.error('[isoperia] FS.syncfs failed:', err);
      });
      return 1;
    } catch (e) {
      console.error('[isoperia] FS.syncfs threw:', e);
      return 0;
    }
  },

  // Safe-area insets, resolved by the page from env(safe-area-inset-*). CSS
  // environment variables are not visible to C#, so the shell measures them and
  // parks them on window; see the template's readSafeArea().
  IsoperiaGetSafeArea: function (outPtr) {
    var sa = (typeof window !== 'undefined' && window.isoperiaSafeArea) || null;
    var top = sa ? sa.top : 0;
    var right = sa ? sa.right : 0;
    var bottom = sa ? sa.bottom : 0;
    var left = sa ? sa.left : 0;

    // Four consecutive floats into a C#-allocated buffer.
    var base = outPtr >> 2;
    HEAPF32[base] = top;
    HEAPF32[base + 1] = right;
    HEAPF32[base + 2] = bottom;
    HEAPF32[base + 3] = left;
  },

  // The page installs pagehide/visibilitychange handlers that call back into
  // Unity, so a save is flushed before the tab goes away rather than after.
  IsoperiaInstallLifecycleHooks: function (goNamePtr, methodPtr) {
    var goName = UTF8ToString(goNamePtr);
    var method = UTF8ToString(methodPtr);

    var notify = function () {
      try {
        if (typeof unityInstance !== 'undefined' && unityInstance.SendMessage) {
          unityInstance.SendMessage(goName, method);
        } else if (typeof SendMessage === 'function') {
          SendMessage(goName, method);
        }
      } catch (e) {
        console.warn('[isoperia] lifecycle notify failed:', e);
      }
    };

    // pagehide is the reliable one on iOS Safari; beforeunload frequently does
    // not fire there at all, and visibilitychange covers the app-switch case
    // where the tab is never formally unloaded.
    window.addEventListener('pagehide', notify);
    window.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') notify();
    });
    window.addEventListener('blur', notify);
  },
});
