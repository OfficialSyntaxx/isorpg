// Engine entry: wiring, tick runner, input routing, window bindings.
import "./style.css";
import { Engine } from "./core/Engine";
import { Grid } from "./world/Grid";
import { createFreshState } from "./state/GameState";
import { makeHero } from "./generators/Character";
import { WorldSystem } from "./systems/WorldSystem";
import { MovementSystem } from "./systems/MovementSystem";
import { SkillSystem } from "./systems/SkillSystem";
import { CombatSystem } from "./systems/CombatSystem";
import { SaveSystem } from "./systems/SaveSystem";
import { InputController } from "./core/InputController";
import { UI } from "./ui/UI";
import { initToasts, showToast } from "./ui/Toast";
import { findPath } from "./ai/AStar";
import { guarded, EngineLogger } from "./utils/Logger";
import { ITEMS as ITEM_NAMES } from "./data/Items";
import { levelFromXp } from "./data/XPTable";
import { SKILLS, COMBAT_SKILLS, SKILL_IDS, type SkillId } from "./data/Skills";
import type { ResourceNode } from "./world/ResourceNode";
import { nodeKey } from "./world/ResourceNode";
import { animFor } from "./generators/Nature";
import type { MonsterCombat } from "./world/Monster";

class Game {
  engine!: Engine;
  grid!: Grid;
  state!: ReturnType<typeof createFreshState>;
  world!: WorldSystem;
  movement!: MovementSystem;
  skill!: SkillSystem;
  combat!: CombatSystem;
  save!: SaveSystem;
  input!: InputController;
  ui!: UI;
  hero!: ReturnType<typeof makeHero>;

  private pendingNode: ResourceNode | null = null;
  private activeSkill: SkillId | null = null;

  async boot() {
    initToasts();

    this.engine = new Engine(document.getElementById("game-canvas") as HTMLElement);
    this.grid = new Grid(20, 20);
    this.hero = makeHero();
    this.engine.scene.add(this.hero.group);

    this.state = createFreshState(this.grid, "Hero", Math.floor(this.grid.width / 2), Math.floor(this.grid.height / 2));
    this.combat = new CombatSystem(this.state);
    this.world = new WorldSystem(this.engine.scene, this.grid, this.combat);
    this.movement = new MovementSystem(this.state.player.pos, this.hero);
    this.skill = new SkillSystem(this.state, this.world.consume.bind(this.world));
    this.save = new SaveSystem(this.state);
    this.ui = new UI(this.state, {
      onExport: () => this.doExport(),
      onImport: (j) => this.doImport(j),
      onDeleteSave: () => this.doDelete(),
    });

    // Fresh state, then load
    const loaded = await this.save.load();

    // Snap hero to town center (fresh) / current tile (saved)
    const { cx, cy } = adjustedStart(this.state, this.grid);
    this.state.player.pos.gx = cx;
    this.state.player.pos.gy = cy;
    this.state.player.pos.wx = cx;
    this.state.player.pos.wz = cy;
    this.hero.group.position.set(cx, 0, cy);
    this.engine.updateCameraTarget({ x: cx, z: cy }, 1);

    // Input
    this.input = new InputController(this.engine, this.grid, { onTileTap: (x, y) => this.onTileTap(x, y) });

    // Systems callback wiring
    this.movement.setCallbacks({ onArrive: (x, y) => this.onArrive(x, y) });
    this.skill.setCallbacks({
      onGather: (e) => {
        this.activeSkill = e.node.def.skill;
        this.ui.flashGather(nameOf(e.itemId), e.amount, e.doubled);
      },
      onActionStart: (node) => {
        this.activeSkill = node.def.skill;
        this.hero.setAction(animFor(node.type));
      },
      onActionEnd: (node, reason) => {
        if (reason === "level_shortfall") {
          const sk = node.def.skill;
          const have = levelFromXp(this.state.player.skills[sk].xp);
          showToast(`Need ${node.def.levelReq} ${SKILLS[sk].name} (you have ${have})`, "error");
        } else if (reason === "inventory_full") {
          showToast("Your pouch is full", "error");
        }
        this.hero.setAction("idle");
        if (this.pendingNode === node) this.pendingNode = null;
      },
    });

    // Combat events → HUD
    this.combat.setCallbacks({
      onPlayerHit: (m, dmg) => this.ui.floatText(`${dmg}`, "dmg"),
      onHurtByMonster: (d) => { this.ui.setPlayerHp(this.state.player.health.hp, this.state.player.health.maxHp); },
      onKill: (m, drops, kc) => {
        this.ui.setCombat(null, 0, 0);
        showToast(`⚔️ ${m.def.name} down! (+${kc} KC)`);
        if (drops.length) showToast(`Loot: ${drops.join(", ")}`, "info", 2000);
      },
      onAutoEat: (food, healed) => this.ui.floatText(`+${healed}`, "heal"),
      onPet: (itemId) => this.ui.floatText("🐾 pet!", "pet"),
      onLevelUp: (skill, lvl) => this.ui.floatText(`L${lvl} ${SKILLS[skill].short}`, "gain"),
    });

    // Engine hooks
    this.engine.onTick((idx, dt) => this.tick(idx, dt));
    this.engine.onFrame((dt) => this.frame(dt));

    // Autosave on tab hide
    window.addEventListener("pagehide", () => this.save.forceSave());

    this.engine.start();

    // Offline progression / new game
    const resumed = await this.save.load();
    if (resumed.summary?.lines.length) {
      this.ui.showOffline(resumed.summary.awaySeconds, resumed.summary.capApplied, resumed.summary.lines, resumed.summary.xpEarned);
    } else if (resumed.recoveredFrom === "fresh" || resumed.recoveredFrom === "indexeddb") {
      showToast("Welcome to Isoperia — tap a tree to begin gathering!", "info", 4200);
    }
  }

  // ————— Tap routing —————
  private onTileTap(gx: number, gy: number) {
    const node = this.world.nodeAt(gx, gy);
    if (node) {
      if (node.depleted) { showToast("That spot is still growing back…", "info", 1200); return; }
      this.routeToNode(node);
      return;
    }

    const m = this.combat.monsterAt(gx, gy);
    if (m) { this.routeToMonster(m); return; }

    const t = this.grid.at(gx, gy);
    if (t?.walkable) { this.skill.interrupt(); this.pendingNode = null; this.setPath(gx, gy); }
  }

  private routeToNode(node: ResourceNode) {
    const px = this.state.player.pos.gx, py = this.state.player.pos.gy;
    const path = findPath(this.grid, px, py, node.tile.x, node.tile.y, true);
    if (!path || path.length === 0) { this.beginGather(node); return; }
    this.pendingNode = node;
    this.movement.setPath(path);
  }

  private routeToMonster(m: MonsterCombat) {
    const px = this.state.player.pos.gx, py = this.state.player.pos.gy;
    const path = findPath(this.grid, px, py, m.tile.x, m.tile.y, true);
    if (!path || path.length === 0) { this.combat.confirmFight(); return; }
    this.combat.engage(m);
    this.movement.setPath(path);
  }

  private setPath(gx: number, gy: number) {
    const px = this.state.player.pos.gx, py = this.state.player.pos.gy;
    const path = findPath(this.grid, px, py, gx, gy, true);
    if (path) this.movement.setPath(path);
  }

  private onArrive(x: number, y: number) {
    const node = this.pendingNode;
    if (node) { this.beginGather(node); return; }
    if (this.combat.engaged) this.combat.confirmFight();
  }

  private beginGather(node: ResourceNode) {
    this.skill.interrupt();
    if (this.skill.startGathering(node)) this.pendingNode = node;
    else this.pendingNode = null;
  }

  // ————— Tick / frame —————
  private tick(_tick: number, dtMs: number) {
    guarded("Skill", () => this.skill.tick(dtMs));
    guarded("Combat", () => this.combat.tick(dtMs, Date.now()));
    guarded("World", () => this.world.updateRespawns(Date.now()));
    guarded("Save", () => this.save.tick(dtMs));
  }

  private frame(dt: number) {
    guarded("Movement", () => { this.movement.update(dt); this.movement.syncToModel(); });
    guarded("World", () => this.world.update(dt * 1000));
    if (this.skill.hasActive) {
      const t = performance.now() / 1000;
      this.hero.armR.rotation.x = Math.sin(t * 14) * 0.5;
      this.hero.bobAnchor.position.y = 0.62 + Math.abs(Math.sin(t * 14)) * 0.04;
    }
    this.input.updateKeyboard(dt);
    guarded("UI", () => this.ui.refresh(this.activeSkill));
  }

  // ————— Persistence actions —————
  private doExport() {
    const json = this.save.exportJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `isoperia_save_${Date.now()}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
    showToast("Save exported", "success");
  }

  private doImport(json: string) {
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { showToast("Import failed — invalid JSON", "error"); return; }
const ok = this.save.apply(parsed);
    if (!ok.ok) { showToast("Import failed — invalid save data", "error"); return; }
    showToast("Save imported", "success");
    this.save.forceSave();
    location.reload();
  }

  private doDelete() {
    localStorage.removeItem("isorpg_save");
    location.reload();
  }
}

function adjustedStart(state: ReturnType<typeof createFreshState>, grid: Grid) {
  const { w, h } = { w: grid.width, h: grid.height };
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  const t = grid.at(state.player.pos.gx, state.player.pos.gy);
  if (t?.walkable) return { cx: state.player.pos.gx, cy: state.player.pos.gy };
  return { cx, cy };
}



function nameOf(itemId: string): string {
  return ITEM_NAMES[itemId]?.name ?? itemId;
}

// Boot guarded so a failure surfaces as a toast instead of a white screen
guarded("main", () => {
  new Game()
    .boot()
    .catch((err) => {
      EngineLogger.logError("boot", err);
      showToast("Failed to start: " + (err instanceof Error ? err.message : "unknown"), "error");
    });
});