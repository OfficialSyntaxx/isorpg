// HUD + DOM panels. No framework (GDD §1, §8).
import type { GameState } from "../state/GameState";
import { levelProgress, levelFromXp } from "../data/XPTable";
import { ITEMS } from "../data/Items";
import { SKILLS, type SkillId } from "../data/Skills";
import { showToast } from "./Toast";
import { EngineLogger } from "../utils/Logger";
import { WEAPONS } from "../data/Combat";
import { CombatSystem } from "../systems/CombatSystem";

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
  private xpFill = document.getElementById("action-xp-fill") as HTMLElement;
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
    const combatBtn = this.$("#btn-combat");
    combatBtn?.addEventListener("click", () => this.openPanel("combat"));
    this.$("#panel-close").addEventListener("click", () => this.closePanel());
    this.panel.addEventListener("click", (e) => { if (e.target === this.panel) this.closePanel(); });
  }

  openPanel(id: "inventory" | "settings" | "combat") {
    if (id === "inventory") this.renderInventory();
    else if (id === "combat") this.renderCombat();
    else this.renderSettings();
    this.panel.classList.remove("hidden");
  }
  closePanel() { this.panel.classList.add("hidden"); }

  // ————— Combat / HP / floating text —————
  setPlayerHp(hp: number, max: number) {
    const bar = this.$("#player-hp-fill");
    const txt = this.$("#player-hp-text");
    const pct = Math.max(0, Math.min(1, hp / max)) * 100;
    bar.style.width = `${pct}%`;
    txt.textContent = `${Math.max(0, hp)}/${max}`;
  }

  setCombat(name: string | null, hp: number, max: number) {
    const tray = this.$("#combat-tray");
    if (!name) { tray.classList.add("hidden"); return; }
    tray.classList.remove("hidden");
    this.$("#combat-name").textContent = name;
    const fill = this.$("#combat-hp-fill");
    fill.style.width = `${Math.max(0, Math.min(1, hp / max)) * 100}%`;
    this.$("#combat-hp-text").textContent = `${Math.max(0, hp)}/${max}`;
  }

  floatText(text: string, kind: "gain" | "dmg" | "heal" | "pet" = "gain", xFrac = 0.5, yFrac = 0.42) {
    const layer = document.getElementById("float-layer");
    if (!layer) return;
    const el = document.createElement("div");
    el.className = `float-tex${kind === "dmg" ? " dmg" : kind === "heal" ? " heal" : kind === "pet" ? " pet" : ""}`;
    el.textContent = text;
    el.style.left = `${xFrac * 100}%`;
    el.style.top = `${yFrac * 100}%`;
    el.style.transform = "translate(-50%, 0)";
    layer.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  /** Update the topbar: player level + the active-skill XP bar. */
  refresh(activeSkill: SkillId | null) {
    // Overall "total level": best skill as a stand-in for milestone 1
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
      <div class="set-row"><button class="btn" data-act="export">Export Save (.json)</button></div>
      <div class="set-row"><button class="btn" data-act="import">Import Save</button></div>
      <div class="set-row"><button class="btn btn-danger" data-act="reset">New Save &amp; Reset</button></div>
    `;
    this.panelBody.querySelector("[data-act='export']")!.addEventListener("click", () => this.ev.onExport?.());
    this.panelBody.querySelector("[data-act='import']")!.addEventListener("click", () => this.fileInput.click());
    this.panelBody.querySelector("[data-act='delete']")!.addEventListener("click", () => {
      if (confirm("Delete this save and start a fresh profile?")) this.ev.onDeleteSave?.();
    });
  }

  private renderCombat() {
    this.panelTitle.textContent = "Combat";
    const p = this.state.player;
    const atk = levelFromXp(p.skills.attack.xp);
    const str = levelFromXp(p.skills.strength.xp);
    const def = levelFromXp(p.skills.defense.xp);
    const hpx = levelFromXp(p.skills.hitpoints.xp);
    const weapon = this.equippedWeapon();
    this.panelBody.innerHTML = `
      <div class="combat-title">Battle Stats</div>
      <div class="set-row"><span>Attack</span><b>${atk}</b></div>
      <div class="set-row"><span>Strength</span><b>${str}</b></div>
      <div class="set-row"><span>Defense</span><b>${def}</b></div>
      <div class="set-row"><span>Hitpoints</span><b>${hpx}</b></div>
      <div class="set-row"><span>Weapon</span><b>${weapon ? weapon.name : "Fists"}</b></div>
      <div class="set-row"><span>Kills</span><b>${Object.values(CombatSystem.kcCounts).reduce((a, b) => a + b, 0)}</b></div>
    `;
  }

  private equippedWeapon() {
    for (const w of Object.values(WEAPONS)) {
      if (w.itemId && this.state.player.inventory.items.some((i) => i.id === w.itemId)) return w;
    }
    return WEAPONS.fists;
  }

  private onFilePick = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = String(reader.result);
        JSON.parse(json); // basic validity
        this.ev.onImport?.(json);
      } catch (err) {
        EngineLogger.logError("Save importer", err);
        showToast("That doesn't look like a valid save file", "error");
      }
    };
    reader.readAsText(file);
    this.fileInput.value = "";
  };

  /** Show the offline-away modal. */
  showOffline(awaySeconds: number, capApplied: boolean, lines: string[], xpEarned: number) {
    const h = Math.floor(awaySeconds / 3600);
    const m = Math.floor((awaySeconds % 3600) / 60);
    const durLabel = h > 0 ? `${h}h ${m}m` : `${m}m`;
    const rows = lines.length ? lines.map((l) => `<li>${l}</li>`).join("") : `<li>Nothing — go gather something first.</li>`;
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
    this.modalRoot.querySelector("#offline-ok")!.addEventListener("click", () => { this.modalRoot.innerHTML = ""; });
  }

  /** Tiny "gained +N wood" pulse near the top (kept light for M1). */
  flashGather(itemName: string, amount: number, doubled: boolean) {
    showToast(`${doubled ? "x2 " : ""}+${amount} ${itemName}${doubled ? " (mastery!)" : ""}`, "success", 1400);
  }
}