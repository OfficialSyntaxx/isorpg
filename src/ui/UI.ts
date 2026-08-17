// HUD + DOM panels. No framework (GDD §1, §8).
import type { GameState } from "../state/GameState";
import { levelProgress, levelFromXp } from "../data/XPTable";
import { ITEMS } from "../data/Items";
import { itemIcon } from "../data/Items";
import { SKILLS, CRAFT_SKILLS, type SkillId } from "../data/Skills";
import { showToast } from "./Toast";
import { EngineLogger } from "../utils/Logger";
import { play as sfx } from "../core/Sfx";
import { selectWeapon } from "../data/Combat";
import { CombatSystem } from "../systems/CombatSystem";
import type { CraftingSystem } from "../systems/CraftingSystem";
import type { BuildSystem } from "../systems/BuildSystem";
import { recipesFor, type CraftRecipe } from "../data/Recipes";
import { BUILDINGS, BUILDING_TYPES, type BuildingType } from "../data/Buildings";
import { countItem } from "../components/Inventory";
import { equipItem, unequipItem, EQUIP_SLOTS } from "../components/Equipment";
import type { EquipSlot } from "../data/Items";
import type { MapSnapshot } from "../systems/MapSystem";
import type { QuestJournalEntry } from "../systems/QuestSystem";
import type { MetaSnapshot } from "../systems/MetaSystem";
import type { ShopSnapshot } from "../systems/ShopSystem";
import type { LabourSnapshot, LabourJob } from "../systems/LabourSystem";

const SLOT_NAMES: Record<EquipSlot, string> = {
  weapon: "Weapon", offhand: "Offhand", head: "Helm", body: "Body", legs: "Legs",
};

export interface UIEvents {
  onExport?: () => void;
  onImport?: (json: string) => void;
  onReset?: () => void;
  onDeleteSave?: () => void;
}

export class UI {
  private state: GameState;
  private ev: UIEvents = {};
  private craft: CraftingSystem | null = null;
  private build: BuildSystem | null = null;
  private craftTab: SkillId = "cooking";
  private placeBanner = document.getElementById("place-banner")!;
  private placeBannerText = document.getElementById("place-banner-text")!;
  private modalRoot = document.getElementById("modal-root")!;
  private panel = document.getElementById("side-panel")!;
  private panelTitle = document.getElementById("panel-title")!;
  private panelBody = document.getElementById("panel-body")!;
  private targetChip = document.getElementById("target-chip")!;
  private nightOverlay = document.getElementById("night-overlay")!;
  private dayIcon = document.getElementById("day-icon")!;
  private dayLabel = document.getElementById("day-label")!;
  private playerLevel = document.getElementById("player-level")!;
  private playerName = document.getElementById("player-name")!;
  private xpWrap = document.getElementById("action-xp")!;
  private xpLabel = document.getElementById("action-xp-label")!;
  private xpFill = document.getElementById("action-xp-fill") as HTMLElement;
  private fileInput: HTMLInputElement;
  private mapSnapshot: (() => MapSnapshot | null) | null = null;
  private mapTravel: ((id: string) => boolean) | null = null;
  private journalSource: (() => QuestJournalEntry[]) | null = null;
  private metaSource: (() => MetaSnapshot | null) | null = null;
  private shopSource: (() => ShopSnapshot | null) | null = null;
  private shopSell: ((itemId: string) => boolean) | null = null;
  private shopBuy: ((itemId: string) => boolean) | null = null;
  private labourSource: (() => LabourSnapshot | null) | null = null;
  private labourAssign: ((id: string, job: LabourJob | "idle") => boolean) | null = null;
  private labourClaim: (() => boolean) | null = null;

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
    this.$("#place-cancel").addEventListener("click", () => this.build?.cancelPlacing());
  }

  /** Wire in the artisan crafting + settlement build systems (main.ts, after construction). */
  attachSystems(craft: CraftingSystem, build: BuildSystem) {
    this.craft = craft;
    this.build = build;
  }

  private $(sel: string): HTMLElement { return document.querySelector(sel) as HTMLElement; }

  private bindPanels() {
    this.$("#btn-inventory").addEventListener("click", () => this.openPanel("inventory"));
    this.$("#btn-map")?.addEventListener("click", () => this.openPanel("map"));
    this.$("#btn-quest")?.addEventListener("click", () => this.openPanel("quest"));
    this.$("#btn-progress")?.addEventListener("click", () => this.openPanel("meta"));
    this.$("#btn-village")?.addEventListener("click", () => this.openPanel("village"));
    this.$("#btn-settings").addEventListener("click", () => this.openPanel("settings"));
    this.$("#btn-craft")?.addEventListener("click", () => this.openPanel("craft"));
    this.$("#btn-build")?.addEventListener("click", () => this.openPanel("build"));
    const combatBtn = this.$("#btn-combat");
    combatBtn?.addEventListener("click", () => this.openPanel("combat"));
    this.$("#panel-close").addEventListener("click", () => this.closePanel());
    this.panel.addEventListener("click", (e) => { if (e.target === this.panel) this.closePanel(); });
  }

openPanel(id: "inventory" | "settings" | "combat" | "craft" | "build" | "map" | "quest" | "meta" | "shop" | "village") {
    sfx("ui_click");
   // Any render error must never silently keep the panel hidden. Render first;
    // on failure show a visible degraded panel + log, never a dead button.
    try {
      if (id === "inventory") this.renderInventory();
      else if (id === "combat") this.renderCombat();
      else if (id === "craft") this.renderCraft();
      else if (id === "build") this.renderBuild();
      else if (id === "map") this.renderMap();
      else if (id === "quest") this.renderJournal();
      else if (id === "meta") this.renderMeta();
      else if (id === "shop") this.renderShop();
      else if (id === "village") this.renderVillage();
      else this.renderSettings();
    } catch (err) {
      EngineLogger.logError(`panel:${id}`, err);
      this.panelTitle.textContent = "Menu";
      this.panelBody.innerHTML = `<div class="empty">That panel hit an error — try again.</div>`;
    }
    this.panel.classList.remove("hidden");
  }
  closePanel() { sfx("ui_click"); this.panel.classList.add("hidden"); }

  /** P6: wire the world-map data + fast-travel executor (main.ts). */
  attachMap(snapshot: () => MapSnapshot | null, travel: (id: string) => boolean) {
    this.mapSnapshot = snapshot;
    this.mapTravel = travel;
  }

  // ————— World map —————
  private renderMap() {
    this.panelTitle.textContent = "World Map";
    const snap = this.mapSnapshot?.();
    if (!snap) { this.panelBody.innerHTML = `<div class="empty">Map unavailable.</div>`; return; }
    const scale = 8;
    const PX = (x: number) => (x + 0.5) * scale;
    const PY = (y: number) => (y + 0.5) * scale;
    const W = snap.size * scale;
    let grid = "";
    for (let i = 0; i <= snap.size; i++) {
      grid += `<line x1="${i * scale}" y1="0" x2="${i * scale}" y2="${W}" stroke="#7fd0a0" stroke-opacity="0.08" stroke-width="1"/>`;
      grid += `<line x1="0" y1="${i * scale}" x2="${W}" y2="${i * scale}" stroke="#7fd0a0" stroke-opacity="0.08" stroke-width="1"/>`;
    }
    // P6.1: faint tint over visited chunk blocks — the walk-range layer.
    let exploredSvg = "";
    const covCols = Math.max(1, Math.ceil(snap.size / 6));
    for (let cb = 0; cb < covCols; cb++) {
      for (let ca = 0; ca < covCols; ca++) {
        if (snap.coverage.coarse[cb * covCols + ca] !== "E") continue;
        const x0 = ca * 6 * scale, y0 = cb * 6 * scale, w = 6 * scale;
        exploredSvg += `<rect x="${x0}" y="${y0}" width="${w}" height="${w}" fill="#7fd0a0" opacity="0.10"/>`;
      }
    }
    let markers = "";
    for (const p of snap.pois) {
      if (!p.discovered) continue;
      // P6b: boss lairs get a distinct red marker, waypoints stay gold.
      const fill = p.boss ? "#ff5a4a" : "#ffd24a";
      const stroke = p.boss ? "#8c0e08" : "#6b4a00";
      const label = p.boss ? "#ffb0a4" : "#ffe9a0";
      markers += `<circle cx="${PX(p.x)}" cy="${PY(p.y)}" r="5" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
      markers += `<text x="${PX(p.x) + 8}" y="${PY(p.y) + 3.5}" font-size="8.5" fill="${label}" style="text-shadow:0 1px 0 #000">${p.name}</text>`;
    }
    const mapHtml = `<svg viewBox="0 0 ${W} ${W}" width="100%" height="auto" style="background:#1b2230;border-radius:10px;display:block">
        <rect width="${W}" height="${W}" fill="#1b2230"/>${grid}${exploredSvg}${markers}
        <circle cx="${PX(snap.player.x)}" cy="${PY(snap.player.y)}" r="6" fill="#ffffff">
          <animate attributeName="r" values="5;8;5" dur="2s" repeatCount="indefinite"/>
        </circle>
      </svg>`;
    const covChip = `<div class="set-val">🗺️ Land explored: ${snap.coverage.pct}%</div>`;
    const lockChip = snap.unlocked
      ? `<div class="set-val">Fast travel ready ✨</div>`
      : `<div class="set-val">🔒 Fast travel unlocks when you finish Eldric's quest (defeat the Cave Brute).</div>`;
    const rows = snap.pois.map((p) => {
      if (!p.discovered) return `<div class="inv-row"><span class="inv-ico">❔</span><div class="inv-name">???</div><div class="inv-desc">Undiscovered</div></div>`;
      const travel = snap.unlocked
        ? `<button class="btn btn-mini" data-travel="${p.id}">Travel</button>`
        : `<span class="inv-desc">🔒 Locked</span>`;
      return `<div class="inv-row"><span class="inv-ico">${p.icon}</span><div class="inv-name">${p.name}</div><div class="inv-desc">(${p.x}, ${p.y})</div>${travel}</div>`;
    }).join("");
    this.panelBody.innerHTML = mapHtml + covChip + lockChip + rows;
    this.panelBody.querySelectorAll<HTMLButtonElement>("[data-travel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.travel ?? "";
        if (this.mapTravel?.(id)) this.closePanel();
        else this.renderMap();
      });
    });
  }

  /** P6.3: main.ts feeds the quest journal rows. */
  attachQuestJournal(snapshot: () => QuestJournalEntry[]) {
    this.journalSource = snapshot;
  }

  // ————— Quest journal —————
  private renderJournal() {
    this.panelTitle.textContent = "Quests";
    const entries = this.journalSource?.() ?? [];
    if (!entries.length) {
      this.panelBody.innerHTML = `<div class="empty">No quests yet — talk to Eldric by the deep-wilds door.</div>`;
      return;
    }
    const rows = entries.map((q) => `
      <div class="inv-row" style="align-items:flex-start">
        <span class="inv-ico">${q.done ? "✅" : "📖"}</span>
        <div class="inv-name">${q.title} <span class="inv-count">${q.done ? "Complete" : "Active"}</span>
          <div class="inv-desc">${q.objective}</div>
          <div class="inv-desc"><b>Given by ${q.givenBy}</b> · Reward: ${q.reward}</div>
        </div>
      </div>`).join("");
    this.panelBody.innerHTML = rows;
  }

  /** P6.4: main.ts feeds the progress/meta snapshot. */
  attachMeta(snapshot: () => MetaSnapshot | null) {
    this.metaSource = snapshot;
  }

  // ————— Progress / Meta —————
  private renderMeta() {
    this.panelTitle.textContent = "Progress";
    const snap = this.metaSource?.();
    if (!snap) { this.panelBody.innerHTML = `<div class="empty">Nothing to report yet.</div>`; return; }
    const achRows = snap.achievements.map((a) => `
      <div class="inv-row" style="align-items:flex-start">
        <span class="inv-ico">${a.unlocked ? "🏆" : "🔒"}</span>
        <div class="inv-name">${a.name} <span class="inv-count">${a.unlocked ? "Unlocked" : "Locked"}</span>
          <div class="inv-desc">${a.desc}</div>
        </div>
      </div>`).join("");
    const killRows = snap.kills.length
      ? snap.kills.map((k) => `<div class="inv-row"><span class="inv-ico">⚔️</span><div class="inv-name">${k.name}<span class="inv-count">×${k.count}</span></div></div>`).join("")
      : `<div class="empty">No kills yet — the wilderness awaits.</div>`;
    const skillRows = snap.skills.map((sk) => `
      <div class="inv-row"><span class="inv-ico">✦</span>
        <div class="inv-name">${sk.name}<span class="inv-count">Lv ${sk.level} · ${sk.xp.toLocaleString()} XP</span></div>
      </div>`).join("");
    this.panelBody.innerHTML = `
      <div class="set-val">🏆 Achievements ${snap.achieved}/${snap.achievements.length}</div>${achRows}
      <div class="set-val">⚔️ Slain ${snap.totalKills} monster${snap.totalKills === 1 ? "" : "s"} · 📦 ${snap.collectionCount} items collected</div>${killRows}
      <div class="set-val">Levels</div>${skillRows}`;
  }

  /** P7.1: main.ts wires the market snapshot + buy/sell executors. */
  attachShop(snapshot: () => ShopSnapshot | null, sell: (itemId: string) => boolean, buy: (itemId: string) => boolean) {
    this.shopSource = snapshot;
    this.shopSell = sell;
    this.shopBuy = buy;
  }

  // ————— Town market —————
  private renderShop() {
    this.panelTitle.textContent = "Town Market";
    const snap = this.shopSource?.();
    if (!snap) { this.panelBody.innerHTML = `<div class="empty">The market is closed.</div>`; return; }
    const coinChip = `<div class="set-val">🪙 ${snap.coins.toLocaleString()} coins</div>`;
    const stockRows = snap.stock.map((s) => `
      <div class="inv-row"><span class="inv-ico">${s.icon}</span>
        <div class="inv-name">${s.name}</div>
        <div class="inv-desc">${s.price} coins</div>
        <button class="btn btn-mini" data-buy="${s.itemId}">Buy</button></div>`).join("");
    const sellRows = snap.sellable.length
      ? snap.sellable.map((s) => `
        <div class="inv-row"><span class="inv-ico">${s.icon}</span>
          <div class="inv-name">${s.name}<span class="inv-count">×${s.qty}</span></div>
          <div class="inv-desc">${s.price} each</div>
          <button class="btn btn-mini" data-sell="${s.itemId}">Sell</button></div>`).join("")
      : `<div class="empty">Nothing sellable — gather some junk first.</div>`;
    this.panelBody.innerHTML = `
      ${coinChip}
      <div class="set-val">For sale</div>${stockRows}
      <div class="set-val">Sell from bag</div>${sellRows}`;
    this.panelBody.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach((btn) => {
      btn.addEventListener("click", () => { this.shopBuy?.(btn.dataset.buy ?? ""); this.renderShop(); });
    });
    this.panelBody.querySelectorAll<HTMLButtonElement>("[data-sell]").forEach((btn) => {
      btn.addEventListener("click", () => { this.shopSell?.(btn.dataset.sell ?? ""); this.renderShop(); });
    });
  }

  /** P7.3: main.ts wires the labour snapshot + assign/claim executors. */
  attachVillage(snapshot: () => LabourSnapshot | null, assign: (id: string, job: LabourJob | "idle") => boolean, claim: () => boolean) {
    this.labourSource = snapshot;
    this.labourAssign = assign;
    this.labourClaim = claim;
  }

  // ————— Village labour —————
  private renderVillage() {
    this.panelTitle.textContent = "Village Labour";
    const snap = this.labourSource?.();
    if (!snap) { this.panelBody.innerHTML = `<div class="empty">No villagers about yet.</div>`; return; }
    const JOB_LABEL: Record<string, string> = { woodcutting: "🪓 Woodcutting", mining: "⛏️ Mining", idle: "Idle" };
    const workerRows = snap.workers.map((w) => `
      <div class="inv-row" style="align-items:flex-start">
        <span class="inv-ico">👤</span>
        <div class="inv-name">${w.name}<span class="inv-count">${JOB_LABEL[w.job ?? "idle"]}</span>
          <div class="inv-desc">${w.spec ? `${w.spec.icon} ${w.spec.perkName} · ` : ""}⭐ ${w.tier} · ${w.hours} worked</div>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn btn-mini" data-lassign="woodcutting" data-vid="${w.id}">🪓</button>
          <button class="btn btn-mini" data-lassign="mining" data-vid="${w.id}">⛏️</button>
          <button class="btn btn-mini" data-lassign="idle" data-vid="${w.id}">✋</button>
        </div>
      </div>`).join("");
    const stockRows = snap.stock.length
      ? snap.stock.map((s) => `<div class="inv-row"><span class="inv-ico">${s.icon}</span><div class="inv-name">${s.name}<span class="inv-count">×${s.qty}</span></div></div>`).join("")
      : `<div class="empty">The village has nothing stockpiled yet.</div>`;
    const claimBtn = snap.stock.length ? `<button class="btn btn-mini" data-lclaim="1">Collect stock</button>` : "";
    this.panelBody.innerHTML = `
      <div class="set-val">Villagers</div>${workerRows}
      <div class="set-val">Village stock</div>${stockRows}${claimBtn}`;
    this.panelBody.querySelectorAll<HTMLButtonElement>("[data-lassign]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.labourAssign?.(btn.dataset.vid ?? "", btn.dataset.lassign as LabourJob | "idle");
        this.renderVillage();
      });
    });
    this.panelBody.querySelectorAll<HTMLButtonElement>("[data-lclaim]").forEach((btn) => {
      btn.addEventListener("click", () => { this.labourClaim?.(); this.renderVillage(); });
    });
  }

  /** P1: in-world label + action chip, anchored to a screen point (px, py). */
  showTargetChip(text: string, px: number, py: number) {
    this.targetChip.textContent = text;
    this.targetChip.style.left = `${Math.round(px)}px`;
    this.targetChip.style.top = `${Math.round(py)}px`;
    this.targetChip.classList.remove("hidden");
  }
  hideTargetChip() { this.targetChip.classList.add("hidden"); }

  /** P3: night dim overlay opacity (0 = day, ~0.35 = night). */
  setNight(opacity: number) {
    this.nightOverlay.style.opacity = String(Math.max(0, Math.min(0.4, opacity)));
  }

  /** P3: day counter + phase icon in the top bar. */
  setDay(day: number, icon: string) {
    this.dayLabel.textContent = `Day ${day}`;
    if (this.dayIcon.textContent !== icon) this.dayIcon.textContent = icon;
  }

  /** Show/hide the "tap a green tile" banner while a building is armed for placement. */
  setPlacing(type: BuildingType | null) {
    if (!type) { this.placeBanner.classList.add("hidden"); return; }
    this.placeBannerText.textContent = `Tap a green tile to build ${BUILDINGS[type].name}`;
    this.placeBanner.classList.remove("hidden");
  }

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

  /** P6.4-polish: a gold banner slides in when an achievement pops. */
  popAchievement(message: string) {
    const layer = document.getElementById("ui-root") ?? document.body;
    const el = document.createElement("div");
    el.textContent = message;
    el.style.position = "fixed";
    el.style.top = "16%";
    el.style.left = "50%";
    el.style.transform = "translate(-50%, -10px)";
    el.style.background = "linear-gradient(90deg,#7a5a1f,#c9a13a,#7a5a1f)";
    el.style.color = "#ffffff";
    el.style.padding = "10px 18px";
    el.style.borderRadius = "12px";
    el.style.fontWeight = "bold";
    el.style.boxShadow = "0 4px 16px rgba(0,0,0,0.55)";
    el.style.zIndex = "120";
    el.style.opacity = "0";
    el.style.transition = "opacity 0.3s ease, transform 0.3s ease";
    el.style.maxWidth = "86vw";
    el.style.textAlign = "center";
    layer.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = "1"; el.style.transform = "translate(-50%, 0)"; });
    setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translate(-50%, 14px)"; }, 3000);
    setTimeout(() => el.remove(), 3450);
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
    const inv = this.state.player.inventory.items;
    const stored = inv.reduce((a, i) => a + i.amount, 0);
    this.panelTitle.textContent = `Inventory (${stored.toLocaleString()}/${this.state.player.inventory.storageCap.toLocaleString()})`;
    const eq = this.state.player.equipped;

    // P2: equipped slots section (what is worn right now)
    const eqRows = EQUIP_SLOTS
      .filter((s) => eq[s])
      .map((s) => {
        const id = eq[s]!;
        const it = ITEMS[id];
        return `<div class="inv-row"><span class="inv-ico">${itemIcon(id)}</span><div class="inv-name"><span class="inv-count">${SLOT_NAMES[s]}</span> ${it ? it.name : id}</div><button class="btn btn-mini" data-act="unequip" data-slot="${s}">Unequip</button></div>`;
      })
      .join("");

    if (!inv.length && !eqRows) {
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
        const equipBtn = it?.equip ? `<button class="btn btn-mini" data-act="equip" data-item="${s.id}">Equip</button>` : "";
        return `<div class="inv-row"><span class="inv-ico">${itemIcon(s.id)}</span><div class="inv-name"><span class="inv-count">${s.amount.toLocaleString()}</span> ${name}</div><div class="inv-desc">${desc}</div>${equipBtn}</div>`;
      })
      .join("");

    this.panelBody.innerHTML = (eqRows ? `<div class="set-val">Equipped</div>${eqRows}` : "") + rows;

    this.panelBody.querySelectorAll<HTMLButtonElement>("[data-act='equip']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.item ?? "";
        if (equipItem(this.state, id)) {
          showToast(`Equipped ${ITEMS[id]?.name ?? id}`, "success", 1200);
          this.renderInventory();
        }
      });
    });
    this.panelBody.querySelectorAll<HTMLButtonElement>("[data-act='unequip']").forEach((btn) => {
      btn.addEventListener("click", () => {
        unequipItem(this.state, btn.dataset.slot as EquipSlot);
        this.renderInventory();
      });
    });
  }

  // ————— Crafting (Cooking / Smithing / Carpentry) —————
  private renderCraft() {
    const craft = this.craft;
    this.panelTitle.textContent = "Craft";
    if (!craft) { this.panelBody.innerHTML = `<div class="empty">Crafting isn't ready yet.</div>`; return; }

    const tabs = CRAFT_SKILLS.map(
      (id) => `<button class="tab-btn${id === this.craftTab ? " active" : ""}" data-skill="${id}">${SKILLS[id].icon} ${SKILLS[id].short}</button>`
    ).join("");

    const active = craft.activeRecipe;
    const cards = recipesFor(this.craftTab)
      .map((r) => this.recipeCard(r, active?.id === r.id))
      .join("");

    this.panelBody.innerHTML = `<div class="tab-row">${tabs}</div>${cards}`;

    this.panelBody.querySelectorAll<HTMLButtonElement>("[data-skill]").forEach((btn) => {
      btn.addEventListener("click", () => { this.craftTab = btn.dataset.skill as SkillId; this.renderCraft(); });
    });
    this.panelBody.querySelectorAll<HTMLButtonElement>("[data-recipe]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.recipe!;
        if (craft.activeRecipe?.id === id) { craft.stop(); this.renderCraft(); return; }
        const r = recipesFor(this.craftTab).find((rr) => rr.id === id);
        if (r) { craft.start(r); this.renderCraft(); }
      });
    });
  }

  private recipeCard(r: CraftRecipe, isActive: boolean): string {
    const craft = this.craft!;
    const lvl = levelFromXp(this.state.player.skills[r.skill].xp);
    const locked = lvl < r.levelReq;
    const missingBuilding = r.requiresBuilding && !this.build?.hasBuilding(r.requiresBuilding);
    const have = r.inputs.every((i) => countItem(this.state.player.inventory, i.itemId) >= i.qty);
    const inputsTxt = r.inputs
      .map((i) => `<b>${countItem(this.state.player.inventory, i.itemId)}/${i.qty}</b> ${ITEMS[i.itemId]?.name ?? i.itemId}`)
      .join(" + ");
    const buildingNote = r.requiresBuilding
      ? `<div class="recipe-sub">Requires: ${BUILDINGS[r.requiresBuilding].name}${missingBuilding ? " (not built)" : " ✓"}</div>`
      : "";
    const disabled = locked || missingBuilding || (!have && !isActive);
    const progress = isActive ? `<div class="progress-track"><div class="progress-fill" style="width:${Math.round(craft.progress * 100)}%"></div></div>` : "";
    const btnLabel = isActive ? "Stop" : locked ? `Requires Lv ${r.levelReq}` : missingBuilding ? "Missing building" : !have ? "Missing materials" : "Craft";
    return `
      <div class="recipe-card${locked ? " locked" : ""}">
        <div class="recipe-head"><span class="recipe-title">${r.name}</span><span class="recipe-sub">Lv ${r.levelReq} · +${r.xp} xp</span></div>
        <div class="recipe-inputs">${inputsTxt} → ${r.output.qty}× ${ITEMS[r.output.itemId]?.name ?? r.output.itemId}</div>
        ${buildingNote}
        ${progress}
        <button class="card-btn${isActive ? " stop" : ""}" data-recipe="${r.id}" ${disabled && !isActive ? "disabled" : ""}>${btnLabel}</button>
      </div>`;
  }

  // ————— Settlement building —————
  private renderBuild() {
    const build = this.build;
    this.panelTitle.textContent = "Build";
    if (!build) { this.panelBody.innerHTML = `<div class="empty">Building isn't ready yet.</div>`; return; }
    const conLvl = levelFromXp(this.state.player.skills.construction.xp);
    const cards = BUILDING_TYPES.map((type) => {
      const def = BUILDINGS[type];
      const count = build.count(type);
      const locked = conLvl < def.levelReq;
      const maxed = count >= def.maxCount;
      const afford = build.canAfford(type);
      const costTxt = def.baseCost
        .map((c) => `<b>${countItem(this.state.player.inventory, c.itemId)}/${c.qty}</b> ${ITEMS[c.itemId]?.name ?? c.itemId}`)
        .join(" + ");
      const disabled = locked || maxed || !afford;
      const label = maxed ? "Max built" : locked ? `Requires Lv ${def.levelReq}` : !afford ? "Missing materials" : "Place";
      return `
        <div class="building-card${locked ? " locked" : ""}">
          <div class="building-head"><span class="building-title">${def.icon} ${def.name}</span><span class="building-sub">${count}/${def.maxCount} built</span></div>
          <div class="building-sub">${def.desc}</div>
          <div class="building-sub"><b>Effect:</b> ${def.effect}</div>
          <div class="building-cost">${costTxt}</div>
          <button class="card-btn" data-build="${type}" ${disabled ? "disabled" : ""}>${label}</button>
          ${count > 0 ? `<div class="building-sub">Level ${build.levelOf(type)}/3</div>
            ${build.levelOf(type) < 3 ? `<button class="card-btn" data-upgrade="${type}" ${build.canUpgrade(type) ? "" : "disabled"}>Upgrade ⬆</button>` : ""}` : ""}
        </div>`;
    }).join("");

    this.panelBody.innerHTML = `<div class="set-val">Construction Lv ${conLvl} · Storage ${this.state.player.inventory.storageCap}</div>${cards}`;
    this.panelBody.querySelectorAll<HTMLButtonElement>("[data-build]").forEach((btn) => {
      btn.addEventListener("click", () => {
        build.startPlacing(btn.dataset.build as BuildingType);
        this.closePanel();
      });
    });
    this.panelBody.querySelectorAll<HTMLButtonElement>("[data-upgrade]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ok = build.upgradeType(btn.dataset.upgrade as BuildingType);
        showToast(ok ? "Building upgraded." : "Cannot upgrade — materials or max level.", ok ? "success" : "error", 1400);
        this.renderBuild();
      });
    });
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
      <div class="set-row"><button class="btn btn-danger" data-act="delete">New Save &amp; Reset</button></div>
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
    // Same selector combat uses, so the panel cannot name a different weapon.
    const p = this.state.player;
    return selectWeapon(p.inventory, p.equipped.weapon, levelFromXp(p.skills.attack.xp));
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