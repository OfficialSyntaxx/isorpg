// Non-intrusive toast notifications (GDD §6.A recovery notifications).
import { attachToast } from "../utils/Logger";

const ROOT_ID = "toast-root";

export function initToasts(): void {
  attachToast(showToast);
}

/**
 * Remove every toast immediately, pending fade-outs included.
 *
 * A toast is transient by design — it fades on a wall-clock timer — so it cannot
 * be part of a reproducible frame. Engine.renderCanonicalFrame() draws one, and
 * whether a 2.6 s toast is still on screen depends on how fast the machine
 * booted, which is exactly the flakiness a visual baseline must not have.
 */
export function clearToasts(): void {
  document.getElementById(ROOT_ID)?.replaceChildren();
}

export function showToast(message: string, kind: "info" | "success" | "error" = "info", ms = 2600): void {
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    document.body.appendChild(root);
  }
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    el.classList.add("out");
    setTimeout(() => el.remove(), 300);
  }, ms);
}