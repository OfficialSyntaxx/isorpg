// Non-intrusive toast notifications (GDD §6.A recovery notifications).
import { attachToast } from "../utils/Logger";

const ROOT_ID = "toast-root";

export function initToasts(): void {
  attachToast(showToast);
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