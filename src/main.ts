// Engine entry: wiring, tick runner, input routing, window bindings.
import "./style.css";
import * as THREE from "three";
import { Engine } from "./core/Engine";
import { Grid, WORLD_SIZE } from "./world/Grid";
import { createFreshState } from "./state/GameState";
import { makeHero } from "./generators/Character";
import { play as sfx } from "./core/Sfx";
import { setMusicZone } from "./core/Music";
import { updateModelMixers } from "./core/Model";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { WorldSystem } from "./systems/WorldSystem";
import { MovementSystem } from "./systems/MovementSystem";
import { SkillSystem } from "./systems/SkillSystem";
import { CombatSystem } from "./systems/CombatSystem";
import { CraftingSystem } from "./systems/CraftingSystem";
import { BuildSystem } from "./systems/BuildSystem";
import { SaveSystem } from "./systems/SaveSystem";
import { InputController } from "./core/InputController";
import { makeSelectionRing, makeBossRing, type SelectionRing } from "./generators/Selection";
import { spawnBurst, updateFx, type FxPiece } from "./core/Fx";
import { tickClock, dayFactor, iconFor } from "./core/Clock";
import { NpcSystem } from "./systems/NpcSystem";
import { DungeonSystem, DUNGEON_ORIGIN } from "./systems/DungeonSystem";
import { QuestSystem } from "./systems/QuestSystem";
import { MapSystem } from "./systems/MapSystem";
import { MetaSystem } from "./systems/MetaSystem";
import { ShopSystem } from "./systems/ShopSystem";
import { LabourSystem } from "./systems/LabourSystem";
import { UI } from "./ui/UI";
import { initToasts, showToast } from "./ui/Toast";
import { findPath } from "./ai/AStar";
import { guarded, EngineLogger } from "./utils/Logger";
import { ITEMS as ITEM_NAMES } from "./data/Items";
import { getToolTier } from "./data/Items";
import { addItem, countItem, removeItem } from "./components/Inventory";
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

  // P3: living world — clock + NPCs/wildlife.
  private npcs!: NpcSystem;
  private dungeon!: DungeonSystem;
  private quest!: QuestSystem;
  private mapSys!: MapSystem;
  private meta!: MetaSystem;
  private shop!: ShopSystem;
  private labour!: LabourSystem;
  private savedPos = { gx: 0, gy: 0, wx: 0, wz: 0 };
  private clockMin = 0;
  private day = 1;
  private heroFlashUntil = 0;
  private bossRing!: THREE.Group;
  private fx: FxPiece[] = [];
  private shots: { mesh: THREE.Mesh; sx: number; sy: number; sz: number; tx: number; ty: number; tz: number; born: number; dur: number }[] = [];

  async boot() {
    initToasts();

    this.engine = new Engine(document.getElementById("game-canvas") as HTMLElement);
    this.grid = new Grid(WORLD_SIZE, WORLD_SIZE);
    this.hero = makeHero();
    this.engine.scene.add(this.hero.group);

    // A.3: swap in the low-poly hero GLB when it loads (keeps the procedural
    // box figure as an instant, zero-asset fallback if the fetch fails).
    try {
      const heroURL = new URL("models/hero.glb", window.location.href).href;
      new GLTFLoader().load(
        heroURL,
        (gltf) => {
          try { this.hero.enableModel(gltf.scene); } catch { /* keep boxes */ }
        },
        undefined,
        () => { /* fetch failed — procedural hero stays */ }
      );
    } catch {
      /* noop */
    }

    // P1 targeting ring (hidden until the player taps something).
    const ring: SelectionRing = makeSelectionRing();
    this.ringGroup = ring.group;
    this.ringUpdate = ring.update;
    this.ringGroup.visible = false;
    this.engine.scene.add(this.ringGroup);

    // P4b: boss slam telegraph ring (hidden until a slam winds up).
    this.bossRing = makeBossRing();
    this.engine.scene.add(this.bossRing);

    this.state = createFreshState(this.grid, "Hero", Math.floor(this.grid.width / 2), Math.floor(this.grid.height / 2));
    this.combat = new CombatSystem(this.state);
    this.world = new WorldSystem(this.engine.scene, this.grid, this.combat);
    this.npcs = new NpcSystem(this.engine.scene, this.grid, { getBuildings: () => this.state.town.buildings });
    this.dungeon = new DungeonSystem(this.engine.scene, this.combat, this.grid, this.grid.width);
    this.dungeon.buildMeshes();
    this.quest = new QuestSystem(this.engine.scene, this.dungeon, this.grid, showToast, this.state.player.journal);
    this.ui.attachQuestJournal(() => this.quest.journalSnapshot()); // P6.3
    this.meta = new MetaSystem(this.state, (m) => { this.ui.popAchievement(m); sfx("victory"); });
    this.ui.attachMeta(() => this.meta.snapshot()); // P6.4
    this.shop = new ShopSystem(this.engine.scene, this.grid, this.state); // P7.1 / P7.8
    this.ui.attachShop(
      () => this.shop.snapshot(this.state.player.inventory),
      (id) => {
        const qty = countItem(this.state.player.inventory, id);
        const p = this.shop.sellItem(this.state.player.inventory, id);
        if (p > 0) { showToast(`Sold for 🪙${p}`, "success", 1400); this.meta.bump("shop_sold", qty); this.meta.bump("shop_sold_value", p); sfx("coin"); }
        return p > 0;
      },
      (id) => {
        const ok = this.shop.buyItem(this.state.player.inventory, id);
        if (ok) this.meta.bump("shop_bought");
        if (ok) sfx("coin");
        showToast(ok ? "Purchase complete." : "Not enough coins.", ok ? "success" : "error", 1400);
        return ok;
      }
    );
    this.labour = new LabourSystem(this.state, () =>
      this.npcs.entities.filter((e) => e.def.kind === "villager").map((e) => ({ id: e.def.id, name: e.def.name }))
    );
    this.ui.attachVillage(
      () => this.labour.snapshot(),
      (id, job) => {
        this.labour.assign(id, job);
        if (job !== "idle") this.meta.bump("labour_assigns");
        showToast(job === "idle" ? "The villager stands down." : "The villager takes the task.", "info", 1300);
        return true;
      },
      () => {
        const c = this.labour.claim(this.state.player.inventory);
        if (c.length) {
          this.meta.bump("labour_collected", c.reduce((a, x) => a + x.qty, 0));
          sfx("coin");
          showToast(`Collected: ${c.map((x) => `${ITEM_NAMES[x.itemId]?.name ?? x.itemId} ×${x.qty}`).join(", ")}`, "success", 2800);
        }
        return c.length > 0;
      }
    );
    this.mapSys = new MapSystem(
      this.grid.width,
      this.dungeon,
      this.quest,
      this.state.player.map,
      () => {
        // P6b: the boss waypoint tracks the Forest Ogre's lair (its home tile).
        for (const mm of this.combat.registry.values()) {
          if (mm.def.id === "forest_ogre") return { x: mm.home.x, y: mm.home.y };
        }
        return null;
      }
    );
    this.ui.attachMap(
      () => this.mapSys.snapshot(this.state.player.pos.gx, this.state.player.pos.gy),
      (id) => this.doFastTravel(id)
    );
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
        const s = e.node.def.skill ?? "";
        sfx(s.includes("fish") ? "fish" : s.includes("mine") ? "mine" : "chop");
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
      onPlayerHit: (m, dmg) => { this.ui.floatText(`${dmg}`, "dmg"); sfx("hit"); },
      onHurtByMonster: (d) => {
        this.ui.setPlayerHp(this.state.player.health.hp, this.state.player.health.maxHp);
        this.heroFlashUntil = Date.now() + 250;
        this.engine.addShake(0.4); // P4b: camera kick on hits
        sfx("hurt");
      },
      onDeath: () => {
        // P5: dying underground still respawns in town — but exit the dungeon
        // first so the town-centre teleport lands on the surface.
        if (this.dungeon.active) this.leaveDungeon();
        showToast("💀 You died… respawned in town.");
      },
      onKill: (m, drops, kc) => {
        // P6: slaying the Cave Brute completes the dungeon onboarding quest.
if (m.def.id === "cave_brute" && this.dungeon.active) {
          this.quest.notifyBruteDown(this.state.player.inventory);
          this.mapSys.unlockFastTravel(); // P6: beating the boss opens fast travel
        }
        // P6.3: the surveyor's errand — slaying the Forest Ogre closes the quest.
        if (m.def.id === "forest_ogre") {
          this.quest.notifyOgreSlain(this.state.player.inventory);
        }
        this.ui.setCombat(null, 0, 0);
        showToast(`⚔️ ${m.def.name} down! (+${kc} KC)`);
        if (drops.length) showToast(`Loot: ${drops.join(", ")}`, "info", 2000);
        this.engine.addShake(0.35); // P4b: kill thump + burst
        // P5.3: bursts go to world space — offset inside the dungeon.
        const ox = this.dungeon.active ? DUNGEON_ORIGIN.x : 0;
        const oz = this.dungeon.active ? DUNGEON_ORIGIN.z : 0;
        this.fx.push(...spawnBurst(this.engine.scene, m.tile.x + ox, 0.6, m.tile.y + oz, "#c0392b"));
        if (m.def.boss) this.fx.push(...spawnBurst(this.engine.scene, m.tile.x + ox, 1.0, m.tile.y + oz, "#ffd76a", 18));
      },
      onAutoEat: (food, healed) => { this.ui.floatText(`+${healed}`, "heal"); sfx("eat"); },
      onPet: (itemId) => this.ui.floatText("🐾 pet!", "pet"),
      // P4b: boss telegraph ring follows the slam target, then clears.
      onBossTelegraph: (tile) => {
        if (!tile) { this.bossRing.visible = false; return; }
        // P5.3: inside the dungeon the ring must sit at +DUNGEON_ORIGIN (world).
        const ox = this.dungeon.active ? DUNGEON_ORIGIN.x : 0;
        const oz = this.dungeon.active ? DUNGEON_ORIGIN.z : 0;
        this.bossRing.position.set(tile.x + ox, 0.05, tile.y + oz);
        sfx("boss_slam");
        this.bossRing.visible = true;
      },
      // P4c: ranged shots — fire a visible arrow at the struck monster.
      onPlayerShot: (toX, toY) => {
        const p = this.state.player.pos;
        const dir = Math.atan2(toX - p.gx, toY - p.gy);
        const mesh = new THREE.Mesh(
          new THREE.ConeGeometry(0.045, 0.3, 6),
          new THREE.MeshStandardMaterial({ color: "#d9b87a", flatShading: true, emissive: "#ffd889", emissiveIntensity: 0.3 })
        );
        mesh.rotation.z = Math.PI / 2;
        mesh.rotation.y = -dir;
        this.engine.scene.add(mesh);
        this.shots.push({ mesh, sx: p.gx, sy: 1.0, sz: p.gy, tx: toX, ty: 0.9, tz: toY, born: performance.now(), dur: 0.26 });
      },
      onLevelUp: (skill, lvl) => { this.ui.floatText(`L${lvl} ${SKILLS[skill].short}`, "gain"); sfx("levelup"); },
    });

    // Crafting (Cooking / Smithing / Carpentry) events → HUD
    this.craft.setCallbacks({
      onStart: (r) => { this.skill.interrupt(); this.activeSkill = r.skill; this.hero.setAction("chop"); },
      onCraft: (e) => {
        this.activeSkill = e.recipe.skill;
        sfx(e.recipe.skill === "cooking" ? "craft_cook" : e.recipe.skill === "smithing" ? "craft_smelt" : "craft_carpentry");
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
      onPlaced: (b) => {
        showToast(`${BUILDINGS[b.type].icon} ${BUILDINGS[b.type].name} built!`, "success");
        // P3.4: a nearby villager comments and walks over to inspect it.
        const comment = this.npcs.onBuildingPlaced(b.type, b.x, b.y);
        if (comment) setTimeout(() => showToast(comment, "info", 3800), 500);
      },
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
        // Starter stash so a brand-new hero has something to cook/build with.
        addItem(this.state.player.inventory, "normal_log", 5);
        addItem(this.state.player.inventory, "raw_shrimp", 2);
        addItem(this.state.player.inventory, "coins", 5);
      }
      showToast("Welcome to Isoperia — tap a tree to begin gathering!", "info", 4200);
    }
    // Every load: grant any missing starter tool (covers old saves created
    // before the kit existed), so gathering always works.
    {
      const inv = this.state.player.inventory;
      if (getToolTier(inv, "woodcutting") === 0) addItem(inv, "bronze_axe", 1);
      if (getToolTier(inv, "mining") === 0) addItem(inv, "bronze_pickaxe", 1);
      if (getToolTier(inv, "fishing") === 0) addItem(inv, "small_net", 1);
    }
  }

  // ————— Tap routing —————
  private onTileTap(gx: number, gy: number) {
    if (this.build.placing) {
      if (this.dungeon.active) { showToast("Can't build down here", "error", 1100); }
      else this.build.tryPlaceAt(gx, gy);
      return;
    }
    // P5: inside the dungeon, all taps are dungeon actions.
    if (this.dungeon.active) { this.onDungeonTap(gx, gy); return; }
    // P5: the deep-wilderness door.
    if (gx === this.dungeon.entrance.x && gy === this.dungeon.entrance.y) { this.enterDungeon(); return; }
    // P6: the tutorial guide NPC parked beside the dungeon door.
    if (this.quest.isGuideTile(gx, gy)) { this.quest.talkGuide(); return; }
    // P7.1: tap the town merchant to open the market.
    if (this.shop.isStallTile(gx, gy)) { this.ui.openPanel("shop"); return; }

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

    const npc = this.npcs.at(gx, gy);
    if (npc) {
      showToast(this.npcs.talk(npc), "info", 3200);
      this.setTarget("walk", gx, gy, `Talk ${npc.def.name}`, null);
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

  /** P5: taps inside the dungeon — monster, chest, exit, floor. */
  private onDungeonTap(gx: number, gy: number) {
    const m = this.dungeon.monsterAt(gx, gy);
    if (m) {
      this.setTarget("monster", gx, gy, `Attack ${m.def.name}`, m);
      const px = this.state.player.pos.gx, py = this.state.player.pos.gy;
      const path = findPath(this.dungeon, px, py, gx, gy, true);
      if (!path) { showToast("Can't reach that", "error", 1200); return; }
      this.combat.engage(m);
      if (path.length === 0) this.combat.confirmFight();
      else this.movement.setPath(path);
      return;
    }
    // P5.2: the locked door — needs the Iron Key (consumed on use).
    if (gx === this.dungeon.door.x && gy === this.dungeon.door.y) {
      if (!this.dungeon.doorOpened) {
        this.setTarget("walk", gx, gy, "Locked Door", null);
        if (countItem(this.state.player.inventory, "dungeon_key") > 0) {
          removeItem(this.state.player.inventory, "dungeon_key", 1);
          this.dungeon.unlock();
          showToast("🔓 The Iron Key turns — the door grinds open (key consumed).", "success", 2400);
          this.quest.notifyDoorOpened(); // P6
        } else {
          showToast("🔒 Locked. Find the Iron Key in a side chamber.", "error", 2200);
        }
        return;
      }
      // Already open — fall through to walk through it.
    }
    // P5.2: pick up the Iron Key (consumed when the door is used).
    if (gx === this.dungeon.key.x && gy === this.dungeon.key.y) {
      if (!this.dungeon.keyTaken) {
        this.dungeon.keyTaken = true;
        addItem(this.state.player.inventory, "dungeon_key", 1);
        this.dungeon.hideKey();
        showToast("🗝️ You found the Iron Key.", "success", 2000);
        this.quest.notifyKeyFound(); // P6
      }
      this.setTarget("walk", gx, gy, "Iron Key", null);
      return;
    }
    if (gx === this.dungeon.chest.x && gy === this.dungeon.chest.y) {
      this.setTarget("walk", gx, gy, "Open Chest", null);
      if (!this.dungeon.openedChest) {
        this.dungeon.openedChest = true;
        const loot = this.dungeon.chestLoot();
        for (const d of loot) addItem(this.state.player.inventory, d.itemId, d.qty);
        showToast(`Chest looted: ${loot.map((d) => `${ITEM_NAMES[d.itemId]?.name ?? d.itemId} ×${d.qty}`).join(", ")}`, "success", 2400);
      } else showToast("The chest is empty…", "info", 1100);
      return;
    }
    // P7.2: floor 2's teal ring leaves the dungeon; floor 1's exit tile is stairs
    // down, and floor 2 has a blue retreat stairway back to floor 1.
    if (gx === this.dungeon.exit.x && gy === this.dungeon.exit.y) {
      if (this.dungeon.currentFloor === 3) { this.leaveDungeon(); return; }
      this.dungeon.descend(this.combat);
      this.teleportDungeonSpawn();
      this.meta.bump("floors_descended"); // P6.4-polish
      showToast("You take the stairs down… the air gets colder.", "info", 2000);
      return;
    }
    if (gx === this.dungeon.upstairs.x && gy === this.dungeon.upstairs.y && this.dungeon.currentFloor >= 2) {
      this.dungeon.ascend(this.combat);
      this.teleportDungeonSpawn();
      showToast("You climb back to Floor 1.", "info", 1600);
      return;
    }
    if (this.dungeon.isWalkable(gx, gy)) {
      this.skill.interrupt(); this.craft.stop(); this.pendingNode = null;
      this.setTarget("walk", gx, gy, "Walk", null);
      const px = this.state.player.pos.gx, py = this.state.player.pos.gy;
      const path = findPath(this.dungeon, px, py, gx, gy);
      if (path) this.movement.setPath(path);
    } else {
      showToast("Solid stone walls.", "info", 900);
    }
  }

  /** P5: descend through the deep-wilderness door into the dungeon level. */
  private enterDungeon() {
    if (this.dungeon.active) return;
    const p = this.state.player.pos;
    this.savedPos = { gx: p.gx, gy: p.gy, wx: p.wx, wz: p.wz };
    this.dungeon.enter(this.combat);
    this.combat.setActiveGrid(this.dungeon);
    this.input.origin = { x: DUNGEON_ORIGIN.x, z: DUNGEON_ORIGIN.z };
    p.gx = this.dungeon.spawn.x; p.gy = this.dungeon.spawn.y;
    p.wx = this.dungeon.spawn.x; p.wz = this.dungeon.spawn.y;
    this.hero.group.removeFromParent();
    this.dungeon.worldGroup.add(this.hero.group);
    this.hero.group.position.set(p.wx, 0, p.wz);
    this.engine.updateCameraTarget({ x: DUNGEON_ORIGIN.x + p.wx, z: DUNGEON_ORIGIN.z + p.wz }, 1);
    this.target = null;
    showToast("You descend into the Caves…", "info", 2200);
  }

  /** P5: step back through the portal to the surface. */
  private leaveDungeon() {
    if (!this.dungeon.active) return;
    this.dungeon.leave();
    this.combat.setActiveGrid(null);
    this.input.origin = { x: 0, z: 0 };
    const p = this.state.player.pos;
    p.gx = this.savedPos.gx; p.gy = this.savedPos.gy;
    p.wx = this.savedPos.wx; p.wz = this.savedPos.wz;
    this.hero.group.removeFromParent();
    this.engine.scene.add(this.hero.group);
    this.hero.group.position.set(p.wx, 0, p.wz);
    this.engine.updateCameraTarget({ x: p.wx, z: p.wz }, 1);
    this.target = null;
    showToast("Back above ground.", "info", 1800);
  }

  /** P7.2: drop the hero at the dungeon spawn after a floor change. */
  private teleportDungeonSpawn(): void {
    const p = this.state.player.pos;
    p.gx = this.dungeon.spawn.x; p.gy = this.dungeon.spawn.y;
    p.wx = p.gx; p.wz = p.gy;
    this.hero.group.position.set(p.wx, 0, p.wz);
    this.engine.updateCameraTarget({ x: DUNGEON_ORIGIN.x + p.wx, z: DUNGEON_ORIGIN.z + p.wz }, 1);
    this.target = null;
  }

  /** P6: teleport to a discovered waypoint (fast travel, unlocked by the quest). */
  private doFastTravel(id: string): boolean {
    if (this.dungeon.active) { showToast("You must leave the dungeon to fast-travel.", "error", 2000); return false; }
    const t = this.mapSys.travelTarget(id);
    if (!t) {
      showToast(this.mapSys.unlocked ? "Waypoint not discovered yet." : "Fast travel unlocks after you finish Eldric's quest.", "error", 2600);
      return false;
    }
    const p = this.state.player.pos;
    p.gx = t.x; p.gy = t.y; p.wx = t.x; p.wz = t.y;
    this.hero.group.position.set(p.wx, 0, p.wz);
    this.engine.updateCameraTarget({ x: p.wx, z: p.wz }, 1);
    this.skill.interrupt(); this.craft.stop(); this.pendingNode = null; this.target = null; this.combat.stop();
    showToast(`🧭 Fast-travelled to ${this.mapSys.poiName(id)}`, "success", 2200);
    return true;
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
    // P4: a ranged weapon fights from distance — no need to walk adjacent.
    const dist = Math.max(Math.abs(m.tile.x - px), Math.abs(m.tile.y - py));
    if (this.combat.equippedWeapon().kind === "ranged" && dist <= 5) {
      this.combat.engage(m);
      this.combat.confirmFight();
      return;
    }
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
    // P3: advance the in-game clock and drive day/night lighting.
    const clk = tickClock(this.clockMin, this.day, 1);
    this.clockMin = clk.minute;
    this.day = clk.day;
    const hour = this.clockMin / 60;
    const d = dayFactor(hour);
    this.engine.setDayNight(d);
    this.world.setDayNight(d);
    this.ui.setNight(0.38 * (1 - d));
    this.ui.setDay(this.day, iconFor(hour));

    // 8.x: advance rigged model animation + pick the ambient music zone.
    updateModelMixers(dtMs / 1000);
    const p = this.state.player.pos;
    const cxw = this.grid.width / 2;
    const cdist = Math.hypot(p.gx - cxw, p.gy - cxw);
    setMusicZone(this.dungeon.active ? "dungeon" : cdist > 12 ? "wilds" : "town");

    guarded("Skill", () => this.skill.tick(dtMs));
    guarded("Crafting", () => this.craft.tick(dtMs));
    guarded("Combat", () => this.combat.tick(dtMs, Date.now()));
    guarded("Combat", () => this.combat.update(dtMs, Date.now()));
    guarded("World", () => this.world.updateRespawns(Date.now()));
    guarded("Npc", () => this.npcs.tick());
    guarded("Build", () => this.build.tick(dtMs));
    guarded("Save", () => this.save.tick(dtMs));
    guarded("Labour", () => this.labour.tick(Date.now())); // P7.3
  }

  private frame(dt: number) {
    guarded("Movement", () => { this.movement.update(dt); this.movement.syncToModel(); });
    guarded("World", () => this.world.update(dt * 1000));
    guarded("Npc", () => this.npcs.update(dt));
    guarded("Quest", () => this.quest.update(dt));
    guarded("Map", () => {
      const gx = this.state.player.pos.gx, gy = this.state.player.pos.gy;
      const fresh = this.mapSys.checkDiscoveries(gx, gy);
      if (fresh.length) showToast(`📍 Explored: ${fresh.map((id) => this.mapSys.poiName(id)).join(", ")}`, "info", 3600);
      if (!this.dungeon.active) {
        // P6.1: track walked tiles + reveal region chunks as they are reached.
        this.mapSys.recordExplore(gx, gy);
        this.grid.unlockAround(gx, gy);
      }
    });
    guarded("Meta", () => this.meta.evaluate()); // P6.4: achievement pops
    // P4: hero flashes red briefly when a monster lands a hit.
    flashHero(this.hero, Date.now() < this.heroFlashUntil ? "#ff4030" : "#000000");
    // P4b: advance kill-burst shards.
    this.fx = updateFx(this.fx, dt);
    // P4c: fly ranged arrows to their target; spark on impact.
    if (this.shots.length) {
      const now = performance.now();
      this.shots = this.shots.filter((s) => {
        const t = Math.min(1, (now - s.born) / (s.dur * 1000));
        s.mesh.position.set(
          s.sx + (s.tx - s.sx) * t,
          s.sy + (s.ty - s.sy) * t + Math.sin(t * Math.PI) * 0.25,
          s.sz + (s.tz - s.sz) * t
        );
        if (t >= 1) {
          s.mesh.removeFromParent();
          s.mesh.geometry.dispose();
          (s.mesh.material as THREE.Material).dispose();
          this.fx.push(...spawnBurst(this.engine.scene, s.tx, s.ty, s.tz, "#d9b87a", 5));
          return false;
        }
        return true;
      });
    }
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

/** P4: tint the hero's materials (red flash on hurt, black otherwise). */
function flashHero(hero: ReturnType<typeof makeHero>, color: string) {
  hero.group.traverse((o) => {
    const mm = o as THREE.Mesh;
    if (mm.isMesh && mm.material instanceof THREE.MeshStandardMaterial) {
      mm.material.emissive.set(color);
      mm.material.emissiveIntensity = color === "#000000" ? 0 : 1.4;
    }
  });
}

const NODE_NAMES: Record<string, string> = {
  normal: "Ordinary tree", oak: "Oak tree", willow: "Willow tree",
  copper: "Copper rock", tin: "Tin rock", iron: "Iron rock", coal: "Coal rock",
  shrimp: "Fishing spot", trout: "Fishing spot",
};
const ACTION_FOR: Record<string, string> = { TREE: "Chop", ROCK: "Mine", WATER: "Fish" };
const TOOL_NAMES: Record<string, string> = { woodcutting: "axe", mining: "pickaxe", fishing: "net or rod" };

// Boot guarded so a failure surfaces as a toast instead of a white screen
guarded("main", () => {
  new Game()
    .boot()
    .catch((err) => {
      EngineLogger.logError("boot", err);
      showToast("Failed to start: " + (err instanceof Error ? err.message : "unknown"), "error");
    });
});