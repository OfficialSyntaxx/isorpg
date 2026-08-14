// Low-poly hero + home settings: fully procedural (GDD §8.2).
import * as THREE from "three";
import { makeTool } from "./Nature";

const MAT_CAPE = new THREE.MeshStandardMaterial({ color: "#c0392b", flatShading: true, roughness: 0.85 });
const MAT_SKIN = new THREE.MeshStandardMaterial({ color: "#e0b28e", flatShading: true, roughness: 0.9 });
const MAT_HAIR = new THREE.MeshStandardMaterial({ color: "#3a2b1f", flatShading: true, roughness: 0.95 });
const MAT_SHOES = new THREE.MeshStandardMaterial({ color: "#3d2c1f", flatShading: true, roughness: 0.95 });
const MAT_HAND = new THREE.MeshStandardMaterial({ color: "#d29b74", flatShading: true, roughness: 0.95 });

export type ToolKind = "axe" | "pick" | "net" | "sword" | null;

export interface HeroModel {
  group: THREE.Group;
  bobAnchor: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  setAction(action: "idle" | "walk" | "chop" | "mine" | "fish"): void;
  setTool(tool: ToolKind): void;
}

export function makeHero(): HeroModel {
  const group = new THREE.Group();
  const geo = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const mesh = (g: THREE.BufferGeometry, mm: THREE.Material, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(g, mm);
    o.position.set(x, y, z);
    return o;
  };

  const legL = new THREE.Group(); legL.position.set(-0.09, 0.62, 0);
  const legR = new THREE.Group(); legR.position.set(0.09, 0.62, 0);
  legL.add(mesh(geo(0.16, 0.62, 0.16), MAT_SHOES, 0, 0, 0));
  legR.add(mesh(geo(0.16, 0.62, 0.16), MAT_SHOES, 0, 0, 0));
  group.add(legL, legR);

  const armR = new THREE.Group(); armR.position.set(0.18, 0.66, 0);
  const armL = new THREE.Group(); armL.position.set(-0.18, 0.66, 0);
  const arm = mesh(geo(0.13, 0.34, 0.13), MAT_HAND, 0, -0.47, 0);
  armR.add(arm.clone());
  const armLm = arm.clone();
  armLm.material = MAT_SKIN;
  armL.add(armLm);

  const bobAnchor = new THREE.Group();
  bobAnchor.position.y = 0.62;
  bobAnchor.add(mesh(geo(0.42, 0.5, 0.28), MAT_CAPE, 0, 0.25, 0));
  bobAnchor.add(mesh(geo(0.24, 0.24, 0.24), MAT_SKIN, 0, 0.72, 0));
  bobAnchor.add(mesh(geo(0.26, 0.1, 0.26), MAT_HAIR, 0, 0.86, 0));
  bobAnchor.add(armR);
  bobAnchor.add(armL);
  group.add(bobAnchor);

  // Held tool hangs from the right arm; the hero reaches it forward when active
  const toolSlot = new THREE.Group();
  toolSlot.position.set(0.22, -0.1, 0);
  armR.add(toolSlot);
  const held: THREE.Object3D[] = [];

  const model: HeroModel = { group, bobAnchor, armR, legL, legR, setTool: (t) => { void t; }, setAction: () => {} };
  model.setTool = (tool) => {
    held.forEach((h) => h.removeFromParent());
    held.length = 0;
    if (!tool) return;
    const t = makeTool(tool);
    toolSlot.add(t);
    held.push(t);
  };
  model.setAction = (action) => {
    (group.userData as any).action = action;
    (group.userData as any).actionStart = performance.now();
  };
  return model;
}