// EngineLogger: subsystem isolation / error boundaries (GDD §6.A).

export interface ToastFn {
  (message: string, kind?: "info" | "success" | "error"): void;
}

let toastFn: ToastFn | null = null;

export function attachToast(fn: ToastFn) {
  toastFn = fn;
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

/** Run a critical subsystem inside an error boundary. */
export function guarded(systemName: string, fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch (err) {
    EngineLogger.logError(systemName, err);
    return false;
  }
}