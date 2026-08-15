// Engine entry: wiring, tick runner, input routing, window bindings.
import "./style.css";
import * as THREE from "three";
import { Engine } from "./core/Engine";
import { Grid } from "./world/Grid";
import { createFreshState } from "./state/GameState";
import { makeHero } from "./generators/Character";
import { WorldSystem } from "./systems/WorldSystem";
import { MovementSystem } from "./systems/MovementSystem";
import { SkillSystem } from "./systems/SkillSystem";
import { CombatSystem } from "./systems/CombatSystem";
import { CraftingSystem } from "./systems/CraftingSystem";
import { BuildSystem } from "./systems/BuildSystem";
import { SaveSystem } from "./systems/SaveSystem";
import { InputController } from "./core/InputController";
import { makeSelectionRing, type SelectionRing } from "./generators/Selection";
import { UI } from "./ui/UI";
import { initToasts, showToast } from "./ui/Toast";
import { findPath } from "./ai/AStar";
import { guarded, EngineLogger } from "./utils/Logger";
import { ITEMS as ITEM_NAMES } from "./data/Items";
import { getToolTier } from "./data/Items";
import { addItem } from "./components/Inventory";
import { levelFromXp } from "./data/XPTable";
import { SKILLS, COMBAT_SKILLS, SKILL_IDS, type SkillId } from "./data/Skills";
import { BUILDINGS } from "./data/Buildings";
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
  craft!: CraftingSystem;
  build!: BuildSystem;
  save!: SaveSystem;
  input!: InputController;
  ui!: UI;
  hero!: ReturnType<typeof makeHero>;

  private pendingNode: ResourceNode | null = null;
  private activeSkill: SkillId | null = null;

  // P1: targeting — in-world ring + floating label/action chip.
  private ringGroup!: THREE.Group;
  private ringUpdate!: (tMs: number) => void;
  private target: { kind: "node" | "monster" | "walk"; label: string; p: THREE.Vector3; ref: ResourceNode | MonsterCombat | null } | null = null;

  async boot() {
    initToasts();

    this.engine = new Engine(document.getElementById("game-canvas") as HTMLElement);
    this.grid = new Grid(20, 20);
    this.hero = makeHero();
    this.engine.scene.add(this.hero.group);

    // P1 targeting ring (hidden until the player taps something).
    const ring: SelectionRing = makeSelectionRing();
    this.ringGroup = ring.group;
    this.ringUpdate = ring.update;
    this.ringGroup.visible = false;
    this.engine.scene.add(this.ringGroup);

    this.state = createFreshState(this.grid, "Hero", Math.floor(this.grid.width / 2), Math.floor(this.grid.height / 2));
    this.combat = new CombatSystem(this.state);
    this.world = new WorldSystem(this.engine.scene, this.grid, this.combat);
    this.movement = new MovementSystem(this.state.player.pos, this.hero);
    this.skill = new SkillSystem(this.state, this.world.consume.bind(this.world));
    this.build = new BuildSystem(this.engine.scene, this.grid, this.state);
    this.craft = new CraftingSystem(this.state, this.build.hasBuilding.bind(this.build));
    this.save = new SaveSystem(this.state);
    this.save.setOfflineCapProvider(() => this.build.offlineCapHours);
    this.ui = new UI(this.state, {
      onExport: () => this.doExport(),
      onImport: (j) => this.doImport(j),
      onDeleteSave: () => this.doDelete(),
    });
    this.ui.attachSystems(this.craft, this.build);

    // Fresh state, then load
    const loaded = await this.save.load();
    this.build.rehydrate();

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
          const label = NODE_NAMES[node.def.masteryKey] ?? SKILLS[sk].name;
          showToast(`${label} needs ${SKILLS[sk].name} ${node.def.levelReq} (you have ${have}) — chop a starter tree near town first`, "error");
        } else if (reason === "tool_shortfall") {
          const sk = node.def.skill;
          const have = getToolTier(this.state.player.inventory, sk);
          const label = NODE_NAMES[node.def.masteryKey] ?? SKILLS[sk].name;
          showToast(`${label} needs a tier ${node.def.toolTier ?? 1} ${TOOL_NAMES[sk] ?? "tool"} (you own tier ${have || "none"})`, "error");
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

    // Crafting (Cooking / Smithing / Carpentry) events → HUD
    this.craft.setCallbacks({
      onStart: (r) => { this.skill.interrupt(); this.activeSkill = r.skill; this.hero.setAction("chop"); },
      onCraft: (e) => {
        this.activeSkill = e.recipe.skill;
        if (e.burned) showToast(`Burnt the ${ITEM_NAMES[e.recipe.inputs[0]?.itemId]?.name ?? "batch"}…`, "error", 1200);
        else this.ui.flashGather(nameOf(e.recipe.output.itemId), e.amount, e.preserved);
      },
      onEnd: (r, reason) => {
        this.hero.setAction("idle");
        if (!r) return;
        if (reason === "level_shortfall") showToast(`Need ${r.levelReq} ${SKILLS[r.skill].name}`, "error");
        else if (reason === "missing_materials") showToast("Out of materials", "error");
        else if (reason === "missing_building") showToast(`Requires a ${r.requiresBuilding ? BUILDINGS[r.requiresBuilding].name : "building"}`, "error");
        else if (reason === "inventory_full") showToast("Your pouch is full", "error");
      },
    });

    // Settlement building events → HUD
    this.build.setCallbacks({
      onPlacingChanged: (type) => this.ui.setPlacing(type),
      onDenied: (_reason, msg) => showToast(msg, "error"),
      onPlaced: (b) => showToast(`${BUILDINGS[b.type].icon} ${BUILDINGS[b.type].name} built!`, "success"),
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
      if (resumed.recoveredFrom === "fresh") {
        // P2: hand new heroes a starter tool kit so they can begin gathering.
        for (const id of STARTER_TOOLS) addItem(this.state.player.inventory, id, 1);
      }
      showToast("Welcome to Isoperia — tap a tree to begin gathering!", "info", 4200);
    }
  }

  // ————— Tap routing —————
  private onTileTap(gx: number, gy: number) {
    if (this.build.placing) { this.build.tryPlaceAt(gx, gy); return; }

    const node = this.world.nodeAt(gx, gy);
    if (node) {
      if (node.depleted) { showToast("That spot is still growing back…", "info", 1200); return; }
      const verb = ACTION_FOR[node.type] ?? "Forage";
      const name = NODE_NAMES[node.def.masteryKey] ?? node.def.masteryKey;
      let label = `${verb} ${name}`;
      // P2.3: tell the player up-front what they still need for this node.
      const haveLvl = levelFromXp(this.state.player.skills[node.def.skill].xp);
      if (haveLvl < node.def.levelReq) {
        label += ` · need ${SKILLS[node.def.skill].name} ${node.def.levelReq}`;
      } else if (getToolTier(this.state.player.inventory, node.def.skill) < (node.def.toolTier ?? 1)) {
        label += ` · need tier ${node.def.toolTier ?? 1} ${TOOL_NAMES[node.def.skill] ?? "tool"}`;
      }
      this.setTarget("node", node.tile.x, node.tile.y, label, node);
      this.routeToNode(node);
      return;
    }

    const m = this.combat.monsterAt(gx, gy);
    if (m) {
      this.setTarget("monster", m.tile.x, m.tile.y, `Attack ${m.def.name}`, m);
      this.routeToMonster(m);
      return;
    }

    const t = this.grid.at(gx, gy);
    if (t?.walkable) {
      this.skill.interrupt(); this.craft.stop(); this.pendingNode = null;
      this.setTarget("walk", gx, gy, "Walk", null);
      this.setPath(gx, gy);
      return;
    }
    showToast(t ? "That spot is blocked" : "Out of bounds", "error", 1100);
  }

  private routeToNode(node: ResourceNode) {
    const px = this.state.player.pos.gx, py = this.state.player.pos.gy;
    const path = findPath(this.grid, px, py, node.tile.x, node.tile.y, true);
    if (!path) { showToast("Can't reach that", "error", 1200); return; }
    if (path.length === 0) { this.beginGather(node); return; }
    this.pendingNode = node;
    this.movement.setPath(path);
  }

  private routeToMonster(m: MonsterCombat) {
    const px = this.state.player.pos.gx, py = this.state.player.pos.gy;
    const path = findPath(this.grid, px, py, m.tile.x, m.tile.y, true);
    if (!path) { showToast("Can't reach that monster", "error", 1200); return; }
    if (path.length === 0) { this.combat.confirmFight(); return; }
    this.combat.engage(m);
    this.movement.setPath(path);
  }

  private setPath(gx: number, gy: number) {
    const px = this.state.player.pos.gx, py = this.state.player.pos.gy;
    const path = findPath(this.grid, px, py, gx, gy, true);
    if (path) this.movement.setPath(path);
    else showToast("Can't reach there", "error", 1200);
  }

  /** P1: aim the ring + label at whatever was tapped (replaces previous). */
  private setTarget(kind: "node" | "monster" | "walk", gx: number, gy: number, label: string, ref: ResourceNode | MonsterCombat | null) {
    this.target = { kind, label, p: new THREE.Vector3(gx, 0, gy), ref };
  }

  /** P1: each frame — move/pulse the ring under the target and pin the chip. */
  private updateTarget(_dt: number) {
    if (!this.target) { this.ringGroup.visible = false; this.ui.hideTargetChip(); return; }
    const tgt = this.target;
    if (tgt.kind === "node" && (tgt.ref as ResourceNode)?.depleted) this.target = null;
    else if (tgt.kind === "monster" && (tgt.ref as MonsterCombat)?.dead) this.target = null;
    if (!this.target) { this.ringGroup.visible = false; this.ui.hideTargetChip(); return; }

    this.ringGroup.position.set(tgt.p.x, 0.02, tgt.p.z);
    this.ringGroup.visible = true;
    this.ringUpdate(performance.now());

    const w = this.engine.renderer.domElement.clientWidth || window.innerWidth;
    const h = window.innerHeight;
    const v = new THREE.Vector3(tgt.p.x, 1.15, tgt.p.z).project(this.engine.camera);
    if (v.z > -1 && v.z < 1) {
      this.ui.showTargetChip(tgt.label, (v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h);
    } else {
      this.ui.hideTargetChip();
    }
  }

  private onArrive(x: number, y: number) {
    const node = this.pendingNode;
    if (node) { this.beginGather(node); return; }
    if (this.combat.engaged) this.combat.confirmFight();
  }

  private beginGather(node: ResourceNode) {
    this.skill.interrupt();
    this.craft.stop();
    if (this.skill.startGathering(node)) this.pendingNode = node;
    else this.pendingNode = null;
  }

  // ————— Tick / frame —————
  private tick(_tick: number, dtMs: number) {
    guarded("Skill", () => this.skill.tick(dtMs));
    guarded("Crafting", () => this.craft.tick(dtMs));
    guarded("Combat", () => this.combat.tick(dtMs, Date.now()));
    guarded("Combat", () => this.combat.update(dtMs, Date.now()));
    guarded("World", () => this.world.updateRespawns(Date.now()));
    guarded("Build", () => this.build.tick(dtMs));
    guarded("Save", () => this.save.tick(dtMs));
  }

  private frame(dt: number) {
    guarded("Movement", () => { this.movement.update(dt); this.movement.syncToModel(); });
    guarded("World", () => this.world.update(dt * 1000));
    if (this.skill.hasActive || this.craft.hasActive) {
      const t = performance.now() / 1000;
      this.hero.armR.rotation.x = Math.sin(t * 14) * 0.5;
      this.hero.bobAnchor.position.y = 0.62 + Math.abs(Math.sin(t * 14)) * 0.04;
    }
    // Camera drifts with the hero while he walks; a manual drag takes over.
    this.input.setFollow(this.movement.isMoving ? { x: this.hero.group.position.x, z: this.hero.group.position.z } : null);
    this.input.updateFollow(dt);
    this.input.updateKeyboard(dt);
    guarded("Target", () => this.updateTarget(dt));
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

const NODE_NAMES: Record<string, string> = {
  normal: "Ordinary tree", oak: "Oak tree", willow: "Willow tree",
  copper: "Copper rock", tin: "Tin rock", iron: "Iron rock", coal: "Coal rock",
  shrimp: "Fishing spot", trout: "Fishing spot",
};
const ACTION_FOR: Record<string, string> = { TREE: "Chop", ROCK: "Mine", WATER: "Fish" };
const TOOL_NAMES: Record<string, string> = { woodcutting: "axe", mining: "pickaxe", fishing: "net or rod" };
const STARTER_TOOLS = ["bronze_axe", "bronze_pickaxe", "small_net"];

// Boot guarded so a failure surfaces as a toast instead of a white screen
guarded("main", () => {
  new Game()
    .boot()
    .catch((err) => {
      EngineLogger.logError("boot", err);
      showToast("Failed to start: " + (err instanceof Error ? err.message : "unknown"), "error");
    });
});