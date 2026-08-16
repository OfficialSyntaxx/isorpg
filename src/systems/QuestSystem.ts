// P6: world-scale onboarding — a tutorial guide NPC standing next to the
// dungeon entrance steers the player through the full P5 dungeon arc: find the
// Iron Key, unlock the locked door, defeat the Cave Brute. A floating gold
// marker (dungeon-local) points at the next objective; the guide voices hints.
import * as THREE from "three";
import type { DungeonSystem } from "./DungeonSystem";
import { addItem, type InventoryComponent } from "../components/Inventory";
import { play as sfx } from "../core/Sfx";

export type QuestStage = "INTRO" | "FIND_KEY" | "OPEN_DOOR" | "DEFEAT_BRUTE" | "DONE";

type ToastFn = (msg: string, kind?: "info" | "success" | "error", ms?: number) => void;

/** P6.3: one row of the quest journal (read-only view for the panel). */
export interface QuestJournalEntry {
  id: string;
  title: string;
  givenBy: string;
  objective: string;
  reward: string;
  done: boolean;
}

const GUIDE_NAME = "🧭 Eldric the Cartographer";

export class QuestSystem {
  /** Surface tile the guide stands on (beside the dungeon entrance). */
  guide = { x: 0, y: 0 };
  stage: QuestStage = "INTRO";

  private scene: THREE.Scene;
  private dungeon: DungeonSystem;
  private grid: { isWalkable(x: number, y: number): boolean };
  private toast: ToastFn;
  /** P6.3: persisted quest-log (ids of completed quests, shared with the save). */
  private journal: string[];
  /** P6.3: second quest — the Forest Ogre (surveyor's errand). */
  private ogreDone = false;
  private guideGroup = new THREE.Group();
  private hintRoot = new THREE.Group(); // lives inside the dungeon group
  private hintFloat = new THREE.Group();
  private ringMesh!: THREE.Mesh;

  constructor(
    scene: THREE.Scene,
    dungeon: DungeonSystem,
    grid: { isWalkable(x: number, y: number): boolean },
    toast: ToastFn,
    journal: string[] = []
  ) {
    this.scene = scene;
    this.dungeon = dungeon;
    this.grid = grid;
    this.toast = toast;
    this.journal = journal;
    this.pickGuideTile();
    this.buildGuide();
    this.buildHint();
    this.hintRoot.visible = false;
    this.dungeon.worldGroup.add(this.hintRoot);
  }

  /** Pick a walkable surface tile hugging the dungeon entrance. */
  private pickGuideTile(): void {
    const e = this.dungeon.entrance;
    const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    for (const [dx, dy] of dirs) {
      if (this.grid.isWalkable(e.x + dx, e.y + dy)) { this.guide = { x: e.x + dx, y: e.y + dy }; return; }
    }
    for (let r = 2; r <= 5; r++) {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        if (Math.max(Math.abs(x), Math.abs(y)) !== r) continue;
        if (this.grid.isWalkable(e.x + x, e.y + y)) { this.guide = { x: e.x + x, y: e.y + y }; return; }
      }
    }
    this.guide = { x: e.x + 1, y: e.y }; // last resort — tests will catch a bad pick
  }

  isGuideTile(x: number, y: number): boolean {
    return this.guide.x === x && this.guide.y === y;
  }

  /** The dungeon-local tile the active hint marker floats over (null = none). */
  hintTile(): { x: number; y: number } | null {
    switch (this.stage) {
      case "FIND_KEY": return this.dungeon.key;
      case "OPEN_DOOR": return this.dungeon.door;
      case "DEFEAT_BRUTE": return this.dungeon.brute;
      default: return null;
    }
  }

  get done(): boolean { return this.stage === "DONE"; }

  // ————— guide NPC (surface, next to the entrance) —————
  private buildGuide(): void {
    const g = this.guideGroup;
    const robe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.68, 0.3), new THREE.MeshStandardMaterial({ color: "#7a5a3a", flatShading: true }));
    robe.position.set(0, 0.52, 0);
    g.add(robe);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), new THREE.MeshStandardMaterial({ color: "#d8b48a", flatShading: true }));
    head.position.set(0, 0.98, 0);
    g.add(head);
    const beard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.18), new THREE.MeshStandardMaterial({ color: "#cbbfa8", flatShading: true }));
    beard.position.set(0, 0.86, 0.1);
    g.add(beard);
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.8, 6), new THREE.MeshStandardMaterial({ color: "#5a4020", flatShading: true }));
    staff.position.set(0.28, 0.6, 0);
    g.add(staff);
    // The gold "!" lure — visible from far away, easy to spot on mobile.
    const ex = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), new THREE.MeshStandardMaterial({ color: "#ffd24a", emissive: "#a87800", emissiveIntensity: 0.7 }));
    ex.position.set(0, 1.45, 0);
    g.add(ex);
    const ear = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), new THREE.MeshBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0.4, depthWrite: false }));
    ear.rotation.x = -Math.PI / 2;
    ear.position.set(0, 1.36, 0);
    g.add(ear);
    g.position.set(this.guide.x, 0, this.guide.y);
    this.scene.add(g);
  }

  // ————— the moving hint marker (inside the dungeon) —————
  private buildHint(): void {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshStandardMaterial({ color: "#ffd24a", emissive: "#8a6a00", emissiveIntensity: 0.55, flatShading: true }));
    gem.position.y = 0.85;
    this.hintFloat.add(gem);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), new THREE.MeshBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0.35, depthWrite: false }));
    beam.position.y = 0.55;
    this.hintFloat.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.5, 24), new THREE.MeshBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    this.hintFloat.add(ring);
    this.hintRoot.add(this.hintFloat);
    this.hintRoot.visible = false;
  }

  /** Move the marker to the current stage target (or hide on DONE). */
  private syncHint(): void {
    const t = this.hintTile();
    this.hintRoot.visible = !!t;
    if (t) this.hintRoot.position.set(t.x, 0, t.y);
  }

  /** Called from main's frame loop — bob + spin the marker. */
  update(tMs: number): void {
    if (!this.hintRoot.visible) return;
    this.hintFloat.position.y = Math.sin(tMs * 0.004) * 0.12;
    this.hintFloat.rotation.y += 0.02;
  }

  // ————— dialogue + stage gate —————
  /** Tap the guide: starts the quest, then repeats the relevant hint. */
  talkGuide(): void {
    switch (this.stage) {
case "INTRO":
         this.stage = "FIND_KEY";
         sfx("accept_quest");
        this.syncHint();
        this.toast(`${GUIDE_NAME}: "Those caves breathe treasure — but the way out is barred. A door, an old iron lock…"`, "info", 5200);
        this.toast("Quest: find the Iron Key in a side chamber, then follow the marker.", "info", 4200);
        break;
      case "FIND_KEY":
        this.toast(`${GUIDE_NAME}: "The key — a side room off the main halls. It won't open the door by itself."`, "info", 4200);
        break;
      case "OPEN_DOOR":
        this.toast(`${GUIDE_NAME}: "Good. Now the door — it grinds open when the Iron Key turns in the lock."`, "info", 4200);
        break;
      case "DEFEAT_BRUTE":
        this.toast(`${GUIDE_NAME}: "The Cave Brute guards the exit. It's a born slugger — when a red ring marks the floor, step aside before it slams."`, "info", 5200);
        break;
      case "DONE":
        this.toast(`${GUIDE_NAME}: "The caves are quiet now. My surveyors will drink to your name tonight."`, "info", 3800);
        break;
    }
  }

  /** Called by main when the player picks up the key. Ignored before the quest starts. */
  notifyKeyFound(): void {
    if (this.stage !== "FIND_KEY") return;
    this.stage = "OPEN_DOOR";
    this.syncHint();
    this.toast("Quest: the Iron Key is yours — the locked door is just past the chest room.", "info", 3800);
  }

  /** Called after a successful door unlock. Requires the key step first. */
  notifyDoorOpened(): void {
    if (this.stage !== "OPEN_DOOR") return;
    this.stage = "DEFEAT_BRUTE";
    this.syncHint();
    this.toast(`${GUIDE_NAME}: the door rumbles open — the brute is yours. (See the red ring? Step aside.)`, "info", 4200);
  }

  /** Called when the Cave Brute dies while inside the dungeon. Grants the reward once. */
  notifyBruteDown(inv: InventoryComponent): void {
    if (this.stage !== "DEFEAT_BRUTE") return;
this.stage = "DONE";
       this.syncHint();
       sfx("quest_complete");
    if (!this.journal.includes("caves")) this.journal.push("caves");
    addItem(inv, "coins", 50 + Math.floor(Math.random() * 51));
    addItem(inv, "iron_ore", 4 + Math.floor(Math.random() * 5));
    addItem(inv, "cooked_trout", 2);
    this.toast("🏆 Quest complete — The Caves of the Deep! Reward: coins, iron ore, cooked trout.", "success", 5600);
  }

  /** P6.3: second quest — the Forest Ogre falls, the surveyor's errand ends. */
  notifyOgreSlain(inv: InventoryComponent): void {
    if (this.ogreDone || this.journal.includes("ogre")) return;
    this.ogreDone = true;
    if (!this.journal.includes("ogre")) this.journal.push("ogre");
    addItem(inv, "coins", 250);
    addItem(inv, "steel_bar", 1);
    addItem(inv, "cooked_trout", 3);
    this.toast("🏆 Quest complete — The Surveyor's Errand! Reward: 250 coins, a steel bar, cooked trout.", "success", 5600);
    sfx("quest_complete");
  }

  /** P6.3: read-only journal rows for the quest panel. */
  journalSnapshot(): QuestJournalEntry[] {
    const cavesDone = this.stage === "DONE" || this.journal.includes("caves");
    const ogreDone = this.ogreDone || this.journal.includes("ogre");
    return [
      {
        id: "caves",
        title: "The Caves of the Deep",
        givenBy: "Eldric",
        objective: this.stageObjective(),
        reward: "Coins, iron ore, cooked trout",
        done: cavesDone,
      },
      {
        id: "ogre",
        title: "The Surveyor's Errand",
        givenBy: "Eldric",
        objective: ogreDone ? "The Forest Ogre is slain — the deep woods can breathe again." : "Slay the Forest Ogre that prowls the deep woods.",
        reward: "250 coins, a steel bar, cooked trout",
        done: ogreDone,
      },
    ];
  }

  private stageObjective(): string {
    switch (this.stage) {
      case "FIND_KEY": return "Find the Iron Key in a side chamber of the Caves.";
      case "OPEN_DOOR": return "Use the Iron Key on the door locked shut.";
      case "DEFEAT_BRUTE": return "Slay the Cave Brute that guards the exit portal.";
      case "DONE": return "The treasure of the Caves is claimed.";
      default: return "Talk to Eldric by the deep-wilds door to begin.";
    }
  }
}