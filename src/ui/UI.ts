// HUD + overlay panels. DOM-driven; no framework (GDD §1, §8.6).
import type { GameState } from "../state/GameState";
import { levelProgress, levelFromXp } from "../data/XPTable";
import { ITEMS } from "../data/Items";
import type { SkillId } from "../data/Skills";
import { SKILLS } from "../data/Skills";
import { showToast } from "./Toast";
import { EngineLogger } from "../utils/Logger";

export interface UIEvents {
  onExport?: () => void;
  onImport?: (json: string) => void;
  onReset?: () => void;
  onDeleteSave?: () => void;
}

export class UI {
  private state: GameState;
  private ev: UIEvents = {};
  private modalRoot = document.getElementById("modal-root")!;
  private panel = document.getElementById("side-panel")!;
  private panelTitle = document.getElementById("panel-title")!;
  private panelBody = document.getElementById("panel-body")!;
  private playerLevel = document.getElementById("player-level")!;
  private playerName = document.getElementById("player-name")!;
  private xpWrap = document.getElementById("action-xp")!;
  private xpLabel = document.getElementById("action-xp-label")!;
  private xpFill = document.getElementById("action-xp-fill")! as HTMLElement;
  private fileInput: HTMLInputElement;

  constructor(state: GameState, ev: UIEvents = {}) {
    this.state = state;
    this.ev = ev;
    this.bindPanels();
    this.playerName.textContent = state.player.name;
    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.accept = ".json,application/json";
    this.fileInput.style.display = "none";
    document.body.appendChild(this.fileInput);
    this.fileInput.addEventListener("change", this.onFilePick);
  }

  private $(sel: string): HTMLElement { return document.querySelector(sel) as HTMLElement; }

  private bindPanels() {
    this.$("#btn-inventory").addEventListener("click", () => this.openPanel("inventory"));
    this.$("#btn-settings").addEventListener("click", () => this.openPanel("settings"));
    this.$("#panel-close").addEventListener("click", () => this.closePanel());
    this.panel.addEventListener("click", (e) => { if (e.target === this.panel) this.closePanel(); });
  }

  openPanel(id: "inventory" | "settings") {
    if (id === "inventory") this.renderInventory();
    else this.renderSettings();
    this.panel.classList.remove("hidden");
  }
  closePanel() { this.panel.classList.add("hidden"); }

  /** Update the topbar: player level + active-skill XP bar. */
  refresh(activeSkill: SkillId | null) {
    const pl = levelFromXp(this.state.player.skills.woodcutting.xp + this.state.player.skills.mining.xp + this.state.player.skills.fishing.xp);
    // Overall "total level" headline: use the highest skill as a proxy for milestone 1
    const best = Math.max(...Object.values(this.state.player.skills).map((s) => levelFromXp(s.xp)));
    this.playerLevel.textContent = String(best);

    if (activeSkill) {
      const xp = this.state.player.skills[activeSkill].xp;
      const { level, into } = levelProgress(xp);
      this.xpWrap.classList.remove("hidden");
      this.xpLabel.textContent = `${SKILLS[activeSkill].name} · Lv ${level}`;
      this.xpFill.style.width = `${Math.round(into * 100)}%`;
    } else {
      this.xpWrap.classList.add("hidden");
    }
  }

  private renderInventory() {
    this.panelTitle.textContent = `Inventory (${this.state.player.inventory.items.length})`;
    const inv = this.state.player.inventory.items;
    if (!inv.length) {
      this.panelBody.innerHTML = `<div class="empty">Nothing yet. Tap a tree, rock or fishing spot to gather.</div>`;
      return;
    }
    const rows = inv
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((s) => {
        const it = ITEMS[s.id];
        const name = it ? it.name : s.id;
        const desc = it ? it.desc : "";
        return `<div class="inv-row"><div class="inv-name"><span class="inv-count">${s.amount.toLocaleString()}</span> ${name}</div><div class="inv-desc">${desc}</div></div>`;
      })
      .join("");
    this.panelBody.innerHTML = rows;
  }

  private renderSettings() {
    this.panelTitle.textContent = "Menu";
    const totalXp = Object.values(this.state.player.skills).reduce((a, s) => a + s.xp, 0);
    const saved = Math.round(totalXp).toLocaleString();
    this.panelBody.innerHTML = `
      <div class="set-val">Total XP: <b>${saved}</b></div>
      <div class="set-val">Collection Log: <b>${this.state.collectionLog.size}</b></div>
      <div class="set-row">
        <button class="btn" data-act="export">Export Save (.json)</button>
      </div>
      <div class="set-row">
        <button class="btn" data-act="import">Import Save</button>
      </div>
      <div class="set-row">
        <button class="btn btn-danger" data-act="delete">Delete Save &amp; Restart</button>
      </div>
    `;
    this.panelBody.querySelector("[data-act='export']")!.addEventListener("click", () => this.ev.onExport?.());
    this.panelBody.querySelector("[data-act='import']")!.addEventListener("click", () => this.fileInput.click());
    this.panelBody.querySelector("[data-act='delete']")!.addEventListener("click", () => {
      if (confirm("Delete your save and start a fresh profile?")) this.ev.onDeleteSave?.();
    });
  }

  private onFilePick = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = String(reader.result);
        JSON.parse(json); // basic validation before handing off
        this.ev.onImport?.(json);
      } catch (err) {
        EngineLogger.logError("Save importer", err);
        showToast("That doesn't look like a valid save file", "error");
      }
    };
    reader.readAsText(file);
    this.fileInput.value = "";
  };

  /** Show the offline-away summary modal. */
  showOffline(awaySeconds: number, capApplied: boolean, lines: string[], xpEarned: number) {
    const h = Math.floor(awaySeconds / 3600);
    const m = Math.floor((awaySeconds % 3600) / 60);
    const durLabel = h > 0 ? `${h}h ${m}m` : `${m}m`;
    const rows = lines.length ? lines.map((l) => `<li>${l}</li>`).join("") : `<li>Nothing — you need a moment of gathering first.</li>`;
    this.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <h2>Welcome back!</h2>
          <p class="modal-sub">You were away for <b>${durLabel}</b>${capApplied ? " (capped at 8h)" : ""}.</p>
          <ul class="offline-list">${rows}</ul>
          ${xpEarned > 0 ? `<p class="modal-sub">While away you earned <b>${xpEarned.toLocaleString()} XP</b>.</p>` : ""}
          <button class="btn btn-primary" id="offline-ok">Continue</button>
        </div>
      </div>`;
    this.modalRoot.querySelector("#offline-ok")!.addEventListener("click", () => {
      this.modalRoot.innerHTML = "";
    });
  }

  /** Tiny "gained +N wood" pulse near the top (kept light for milestone 1). */
  flashGather(itemName: string, amount: number, doubled: boolean) {
    showToast(`${doubled ? "x2 " : ""}+${amount} ${itemName}${doubled ? " (mastery!)" : ""}`, "success", 1400);
  }
}