// Low-poly humanoid player + home settings: fully procedural (GDD §8.2).
import * as THREE from "three";

const MAT_CAPE = new THREE.MeshStandardMaterial({ color: "#c0392b", flatShading: true, roughness: 0.85 });
const MAT_SKIN = new THREE.MeshStandardMaterial({ color: "#e0b28e", flatShading: true, roughness: 0.9 });
const MAT_HAIR = new THREE.MeshStandardMaterial({ color: "#3a2b1f", flatShading: true, roughness: 0.95 });
const MAT_SHOES = new THREE.MeshStandardMaterial({ color: "#3d2c1f", flatShading: true, roughness: 0.95 });
const MAT_HAND = new THREE.MeshStandardMaterial({ color: "#d29b74", flatShading: true, roughness: 0.9 });

export interface HeroModel {
  group: THREE.Group;
  /** Torso pivots/bob when walking. */
  bobAnchor: THREE.Group;
  /** Swing arm pivot (used for a gentle idle/swing). */
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  setAction(action: "idle" | "walk" | "chop" | "mine" | "fish"): void;
}

export function makeHero(): HeroModel {
  const group = new THREE.Group();

  const geo = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mm = new THREE.Mesh(g, m);
    mm.position.set(x, y, z);
    return mm;
  };

  // Legs (pivot groups so they swing)
  const legL = new THREE.Group(); legL.position.set(-0.09, 0.62, 0);
  const legR = new THREE.Group(); legR.position.set(0.09, 0.62, 0);
  const legGeo = geo(0.16, 0.62, 0.16);
  legL.add(mesh(legGeo, MAT_SHOES, 0, 0, 0));
  legR.add(mesh(legGeo, MAT_SHOES, 0, 0, 0));
  group.add(legL, legR);

  // Torso + arms anchored for swing
  const armR = new THREE.Group(); armR.position.set(0.18, 0.66, 0);
  const armL = new THREE.Group(); armL.position.set(-0.18, 0.66, 0);
  const armGeo = geo(0.13, 0.34, 0.13);
  const armRmesh = mesh(armGeo, MAT_HAND, 0, 0, 0);
  armRmesh.position.y -= 0.47;
  const armLmesh = mesh(armGeo, MAT_SKIN, 0, 0, 0);
  armLmesh.position.y -= 0.47;
  armR.add(armRmesh); armL.add(armLmesh);

  const bobAnchor = new THREE.Group();
  bobAnchor.position.y = 0.62;
  const body = mesh(geo(0.42, 0.5, 0.28), MAT_CAPE, 0, 0.25, 0);
  bobAnchor.add(body);
  const head = mesh(geo(0.24, 0.24, 0.24), MAT_SKIN, 0, 0.72, 0);
  bobAnchor.add(head);
  const hair = mesh(geo(0.26, 0.1, 0.26), MAT_HAIR, 0, 0.86, 0);
  bobAnchor.add(hair);
  bobAnchor.add(armR); bobAnchor.add(armL);
  group.add(bobAnchor);

  const model: HeroModel = { group, bobAnchor, armR, legL, legR, setAction: () => {} };
  model.setAction = (action) => {
    (group.userData as any).action = action;
    (group.userData as any).actionStart = performance.now();
  };
  return model;
}