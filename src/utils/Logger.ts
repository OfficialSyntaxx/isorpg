// EngineLogger: subsystem isolation / error boundaries (GDD §6.A).

export interface ToastFn {
  (message: string, kind?: "info" | "success" | "error"): void;
}

let toastFn: ToastFn | null = null;

export function attachToast(fn: ToastFn) {
  toastFn = fn;
}

// Recovery semantics only make sense once the game is actually running. During
// boot a throw means the app never started, and swallowing it into a small toast
// is how a five-phase outage went unnoticed: the static HUD still painted, so a
// dead canvas looked like a running game. Until markBooted() is called, failures
// are fatal and unmissable.
let booted = false;

/** Called once the render loop is live; switches guarded() to recovery mode. */
export function markBooted() {
  booted = true;
}

/** Full-screen, impossible-to-miss failure card. Used for boot-phase errors. */
export function showFatalOverlay(systemName: string, error: unknown) {
  const msg = error instanceof Error ? (error.stack ?? error.message) : String(error);
  try {
    const el = document.createElement("div");
    el.setAttribute("data-boot-error", systemName);
    el.style.cssText = [
      "position:fixed", "inset:0", "z-index:9999",
      "background:#140a0c", "color:#ffd7d0",
      "font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
      "padding:24px", "overflow:auto", "white-space:pre-wrap",
    ].join(";");
    el.textContent =
      `The game failed to start.\n\nSubsystem: ${systemName}\n\n${msg}\n\n` +
      `This is a boot failure, not a gameplay error — nothing is rendering behind this card.`;
    document.body.appendChild(el);
  } catch {
    /* DOM unavailable (tests/node) — the console.error below still fires */
  }
}

export class EngineLogger {
  static logError(systemName: string, error: unknown) {
    console.error(`[CRITICAL ERROR] Subsystem: ${systemName}`, error);
    if (toastFn) {
      const msg = error instanceof Error ? error.message : String(error);
      toastFn(`⚠️ ${systemName}: ${msg}`, "error");
    }
  }

  static info(...args: unknown[]) {
    console.info("[isorpg]", ...args);
  }
}

/**
 * Run a critical subsystem inside an error boundary.
 *
 * After boot this recovers: log, toast, carry on — a bad frame shouldn't kill
 * the session. DURING boot it does the opposite, because there is no session to
 * protect: it shows a fatal overlay and rethrows so the failure is loud in the
 * console and impossible to mistake for a running game.
 */
export function guarded(systemName: string, fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch (err) {
    if (!booted) {
      console.error(`[BOOT FAILURE] Subsystem: ${systemName}`, err);
      showFatalOverlay(systemName, err);
      throw err;
    }
    EngineLogger.logError(systemName, err);
    return false;
  }
}