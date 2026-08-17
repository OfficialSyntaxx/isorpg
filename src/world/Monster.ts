// Monster entity: procedural low-poly creature + live HP reference.
import * as THREE from "three";
import { ACTOR_HEIGHT, MONSTER_SCALE } from "../core/Scale";
import type { MonsterDef } from "../data/Combat";
import { MONSTER_STYLES } from "../data/Combat";
import { spawnActor, type AnimatedActor } from "../core/Model";

/** Rigged bosses render their generated animated GLB over the box fallback. */
const RIGGED: Record<string, string> = {
  cave_brute: "cave_brute",
  forest_ogre: "forest_ogre",
};

export interface MonsterCombat {
  id: string;
  def: MonsterDef;
  tile: { x: number; y: number };
  home: { x: number; y: number }; // spawn tile — leash/return anchor (P4 AI)
  seed: number;
  hp: number;
  maxHp: number;
  group: THREE.Group;
  dead: boolean;
  respawnAt: number;
  inCombat: boolean;   // true once the player engages it
  attackAcc: number;   // ticks since its last strike
  flashUntil: number;  // timestamp of red hit-flash
  enraged: boolean;    // P4b: boss below 50% HP — faster, hits harder
  /** Rigged GLB + clip state machine, once loaded (null = procedural boxes). */
  actor?: AnimatedActor | null;
  /** Tile it occupied last tick — used to tell walking from standing. */
  lastTile?: { x: number; y: number };
}

const fistGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);

function mat(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0 });
}

/** Build a low-poly monster body from its style record. */
export function buildMonsterMesh(id: string, seed: number): THREE.Group {
  const g = new THREE.Group();
  const style = MONSTER_STYLES[id] ?? { body: "#8a9a6a", accent: "#66331f" };
  const rnd = seedRng(seed * 977 + 31);
  const isRat = id === "giant_rat";

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.3), mat(style.body));
  body.position.y = 0.58;
  g.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.2), mat(style.body));
  head.position.set(0, 0.82, 0);
  g.add(head);

  const eyeMat = mat(isRat ? "#c0392b" : "#111419");
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(fistGeo, eyeMat);
    eye.position.set(s * 0.05, 0.84, isRat ? 0.1 : 0.1);
    eye.scale.set(1, 0.8, 0.4);
    g.add(eye);
  }

  if (style.ears) {
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.045, 4, 3), mat(style.accent));
      ear.position.set(s * 0.08, 0.95, 0);
      g.add(ear);
    }
  }

  const legN = isRat ? 4 : 2;
  for (let i = 0; i < legN; i++) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.28, 0.07), mat(style.body));
    leg.position.set(i % 2 === 0 ? -0.1 : 0.1, 0.17, i < 2 ? -0.08 : 0.09);
    g.add(leg);
  }

  if (id === "goblin") {
    const club = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.45, 4), mat("#6b4a2b"));
    club.position.set(0.22, 0.6, 0.06);
    club.rotation.z = -0.5;
    g.add(club);
  }
  // The box figure is built ~0.95 tall; normalise it to ACTOR_HEIGHT so the
  // procedural fallback matches the rigged GLBs instead of being a half-size
  // stand-in, then apply any per-monster bulk on top.
  const PROC_H = 0.95;
  g.scale.setScalar((ACTOR_HEIGHT / PROC_H) * (MONSTER_SCALE[id] ?? 1));
  void rnd;

  g.userData.monsterId = id;
  return g;
}

export function spawnMonster(type: string, def: MonsterDef, gx: number, gy: number): MonsterCombat {
  const seed = gx * 31 + gy * 57 + 1000;
  const group = buildMonsterMesh(type, seed);
  group.position.set(gx, 0, gy);

  // Unique id so multiple monsters of one type can coexist in the registry.
  const id = `${type}_${gx}_${gy}`;
  const out = buildMonster(id, def, gx, gy, seed, group);

  // Rigged bosses: swap the placeholder boxes for the animated GLB when ready.
  // Built after `out` exists so the async handler can attach the actor to it.
  const rig = RIGGED[type];
  if (rig) {
    const big = type === "cave_brute" ? 1.5 : 1.35;
    spawnActor(rig).then((a) => {
      if (!a) return;
      for (const child of [...group.children]) child.visible = false;
      a.root.scale.multiplyScalar(big);
      group.add(a.root);
      out.actor = a;
    });
  }
  return out;
}

function buildMonster(id: string, def: MonsterDef, gx: number, gy: number, seed: number, group: THREE.Group): MonsterCombat {
  return {
    id, def, tile: { x: gx, y: gy }, home: { x: gx, y: gy }, seed,
    hp: def.hp, maxHp: def.hp, group,
    dead: false, respawnAt: 0, inCombat: false, attackAcc: 0, flashUntil: 0, enraged: false,
  };
}

/** Frame-time idle bob + red hit-flash. */
export function animateMonster(m: MonsterCombat, now: number) {
  if (m.dead) {
    // Sunk + rolled over to read as "defeated" (removed by the spawner on respawn).
    m.group.position.y = 0.05;
    m.group.rotation.x = 0;
    m.group.rotation.z = 0;
    m.group.visible = true; // corpse shown until respawn swaps it
    return;
  }
  const t = now / 1000;
  m.group.position.y = Math.abs(Math.sin(t * 3 + m.seed * 0.01)) * 0.04;
  m.group.rotation.y = Math.sin(t * 1.5 + m.seed * 0.01) * 0.08;

  const flash = now < m.flashUntil;
  const enraged = m.enraged && !flash;
  m.group.traverse((o) => {
    const mm = o as THREE.Mesh;
    if (mm.isMesh && mm.material instanceof THREE.MeshStandardMaterial) {
      if (flash) { mm.material.emissive.set("#ff5a3a"); mm.material.emissiveIntensity = 1.6; }
      else if (enraged) { mm.material.emissive.set("#ff2a1a"); mm.material.emissiveIntensity = 0.3 + Math.abs(Math.sin(t * 8)) * 0.5; }
      else { mm.material.emissive.set("#000000"); mm.material.emissiveIntensity = 0; }
    }
  });
}

function seedRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}