// Engine entry point: wiring, tick runner, input routing, window bindings.
import "./style.css";
import { Engine } from "./core/Engine";
import { Grid } from "./world/Grid";
import { createFreshState } from "./state/GameState";
import { makeHero } from "./generators/Character";
import { WorldSystem } from "./systems/WorldSystem";
import { MovementSystem } from "./systems/MovementSystem";
import { SkillSystem } from "./systems/SkillSystem";
import { SaveSystem } from "./systems/SaveSystem";
import { InputController } from "./core/InputController";
import { UI } from "./ui/UI";
import { initToasts, showToast } from "./ui/Toast";
import { findPath } from "./ai/AStar";
import { guarded, EngineLogger } from "./utils/Logger";
import { ITEMS as ITEM_NAMES } from "./data/Items";
import { levelFromXp } from "./data/XPTable";
import { SKILLS, type SkillId } from "./data/Skills";
import type { ResourceNode } from "./world/ResourceNode";

class Game {
  engine!: Engine;
  grid!: Grid;
  state!: ReturnType<typeof createFreshState>;
  world!: WorldSystem;
  movement!: MovementSystem;
  skill!: SkillSystem;
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

    // Hero model + world
    this.hero = makeHero();
    this.engine.scene.add(this.hero.group);

    this.state = createFreshState(this.grid, "Hero", Math.floor(this.grid.width / 2), Math.floor(this.grid.height / 2));
    this.world = new WorldSystem(this.engine.scene, this.grid);
    this.movement = new MovementSystem(this.state.player.pos, this.hero);
    this.skill = new SkillSystem(this.state, this.world.consume.bind(this.world));
    this.save = new SaveSystem(this.state);
    this.ui = new UI(this.state, {
      onExport: () => this.doExport(),
      onImport: (j) => this.doImport(j),
      onDeleteSave: () => this.doDelete(),
    });

    // Load save (recovers from localStorage/IndexedDB, computes offline gains)
    const loaded = await this.save.load();

    // Snap the hero to a valid walkable tile (fresh start → town center).
    const { cx, cy } = adjustedStart(this.state, this.grid);
    this.state.player.pos.gx = cx;
    this.state.player.pos.gy = cy;
    this.state.player.pos.wx = cx;
    this.state.player.pos.wz = cy;
    this.hero.group.position.set(cx, 0, cy);
    this.engine.updateCameraTarget({ x: cx, z: cy }, 1);

    // Input
    this.input = new InputController(this.engine, this.grid, {
      onTileTap: (x, y) => this.onTileTap(x, y),
    });

    // Systems callbacks
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
          showToast(`Need ${node.def.levelReq} ${SKILLS[node.def.skill].name} (you have ${levelFromXp(this.state.player.skills[node.def.skill].xp)})`, "error");
        } else if (reason === "inventory_full") {
          showToast("Your pouch is full", "error");
        }
        this.hero.setAction("idle");
        if (this.pendingNode === node) this.pendingNode = null;
      },
    });

    // Engine hooks
    this.engine.onTick((idx, dt) => this.tick(idx, dt));
    this.engine.onFrame((dt) => this.frame(dt));

    // Autosave on tab hide / unload
    window.addEventListener("pagehide", () => this.save.forceSave());

    this.engine.start();

    // Offline away summary
    if (loaded.summary && loaded.summary.lines.length) {
      this.ui.showOffline(loaded.summary.awaySeconds, loaded.summary.capApplied, loaded.summary.lines, loaded.summary.xpEarned);
    } else if (loaded.recoveredFrom === "fresh") {
      showToast("Welcome to Isoperia — tap a tree to begin gathering!", "info", 4200);
    }
  }

  // ————— Input routing —————
  private onTileTap(x: number, y: number) {
    const node = this.world.nodeAt(x, y);
    if (node) {
      if (node.depleted) {
        showToast("That node is still growing back…", "info", 1200);
        return;
      }
      this.routeToNode(node);
    } else {
      const t = this.grid.at(x, y);
      if (t && t.walkable) {
        this.skill.interrupt();
        this.pendingNode = null;
        this.setPath(x, y);
      }
    }
  }

  private routeToNode(node: ResourceNode) {
    const px = this.state.player.pos.gx;
    const py = this.state.player.pos.gy;
    const path = findPath(this.grid, px, py, node.tile.x, node.tile.y, true);
    if (!path || path.length === 0) {
      // Already standing next to it, or unreachable → try to gather directly.
      this.beginGather(node);
      return;
    }
    this.pendingNode = node;
    this.movement.setPath(path);
  }

  private setPath(x: number, y: number) {
    const px = this.state.player.pos.gx;
    const py = this.state.player.pos.gy;
    const path = findPath(this.grid, px, py, x, y, true);
    if (path) this.movement.setPath(path);
  }

  private onArrive(x: number, y: number) {
    const node = this.pendingNode;
    if (node) this.beginGather(node);
  }

  private beginGather(node: ResourceNode) {
    this.skill.interrupt(); // one action at a time
    if (this.skill.startGathering(node)) {
      this.pendingNode = node;
    } else {
      this.pendingNode = null;
    }
  }

  // ————— Systems tick / frame —————
  private tick(_idx: number, dtMs: number) {
    guarded("SkillSystem", () => this.skill.tick(dtMs));
    guarded("WorldSystem", () => this.world.updateRespawns(Date.now()));
    guarded("SaveSystem", () => this.save.tick(dtMs));
  }

  private frame(dt: number) {
    guarded("MovementSystem", () => {
      this.movement.update(dt);
      this.movement.syncToModel();
    });
    // Gathering idle sway
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
    a.href = url;
    a.download = `isorpg_save_${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    showToast("Save exported", "success");
  }

  private doImport(json: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      showToast("Import failed — invalid JSON", "error");
      return;
    }
    const ok = this.save.apply(parsed);
    if (ok.ok) {
      showToast("Save imported successfully", "success");
      this.save.forceSave();
      location.reload();
    } else {
      showToast("Import failed — invalid save data", "error");
    }
  }

  private doDelete() {
    localStorage.removeItem("isorpg_save");
    location.reload();
  }
}

function adjustedStart(state: ReturnType<typeof createFreshState>, grid: Grid) {
  const { w, h } = { w: grid.width, h: grid.height };
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const t = grid.at(state.player.pos.gx, state.player.pos.gy);
  if (t && t.walkable) return { cx: state.player.pos.gx, cy: state.player.pos.gy };
  return { cx, cy };
}

function animFor(type: "TREE" | "ROCK" | "WATER"): "chop" | "mine" | "fish" {
  return type === "TREE" ? "chop" : type === "ROCK" ? "mine" : "fish";
}

function nameOf(itemId: string): string {
  return ITEM_NAMES[itemId]?.name ?? itemId;
}

// boot guarded so a failure surfaces as a toast instead of a white screen
guarded("main", () => {
  new Game()
    .boot()
    .catch((err) => {
      EngineLogger.logError("boot", err);
      showToast("Failed to start: " + (err instanceof Error ? err.message : "unknown"), "error");
    });
});