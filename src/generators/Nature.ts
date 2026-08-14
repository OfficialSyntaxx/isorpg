// Procedural low-poly nature / prop meshes (GDD §8.2). All shared geometry,
// so many instances cost little and flat-shading keeps the look crisp.
import * as THREE from "three";

// Shared geometries
const TRUNK_GEO = new THREE.CylinderGeometry(0.09, 0.13, 0.5, 6);
const LEAF_CONE_GEO = new THREE.ConeGeometry(0.42, 0.7, 7);

function mat(color: string, emissive: string | null = null): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0, emissive: emissive ?? "#000000", emissiveIntensity: emissive ? 0.9 : 0 });
}

const LEAF_TONES = ["#2f6b38", "#3d8a46", "#2a5d33"];

export function makeTree(variant: number): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(TRUNK_GEO, mat("#6b4a2b")).clone();
  trunk.position.y = 0.25;
  g.add(trunk);

  const v = Math.abs(variant) % LEAF_TONES.length;
  const leaves = new THREE.Mesh(LEAF_CONE_GEO, mat(LEAF_TONES[v])).clone();
  leaves.position.y = 0.85;
  leaves.scale.set(1, 1.1, 1);
  // fatten the cone base for a softer canopy
  leaves.scale.x = leaves.scale.z = 1 + ((variant & 1) ? 0.15 : -0.05);
  g.add(leaves);

  // a secondary lozenge of foliage for depth
  const layer2 = new THREE.Mesh(LEAF_CONE_GEO, mat(LEAF_TONES[(v + 1) % 3])).clone();
  layer2.position.y = 1.25;
  layer2.scale.set(0.6, 0.65, 0.6);
  g.add(layer2);

  g.userData.type = "TREE";
  return g;
}

const ROCK_GEO_A = new THREE.IcosahedronGeometry(0.32, 0);
const ROCK_GEO_B = new THREE.DodecahedronGeometry(0.26, 0);

const ROCK_TONES = ["#9aa0ab", "#7e848f", "#a8aeb8"];

export function makeRock(variant: number): THREE.Group {
  const g = new THREE.Group();
  const tone = ROCK_TONES[Math.abs(variant) % ROCK_TONES.length];
  const a = new THREE.Mesh(ROCK_GEO_A, mat(tone)).clone();
  a.position.set(0, 0.2, 0);
  a.scale.set(1, 0.72, 1);
  a.rotation.y = variant * 0.7;
  g.add(a);
  const b = new THREE.Mesh(ROCK_GEO_B, mat(ROCK_TONES[(variant + 1) % 3])).clone();
  b.position.set(0.22 + (variant % 3) * 0.06, 0.32, 0.1);
  b.scale.set(0.5, 0.6, 0.5);
  b.rotation.set(variant * 0.4, variant * 0.5, 0);
  g.add(b);
  g.userData.type = "ROCK";
  return g;
}

// A whirl/spot marker under fishable water
export function makeFishingMarker(): THREE.Mesh {
  const geo = new THREE.RingGeometry(0.28, 0.42, 16);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: "#8fd8ff", transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  m.name = "fishing_marker";
  return m;
}

const SHRIMP_GEO = new THREE.SphereGeometry(0.05, 4, 3);
export function makeSpawnBubble(): THREE.Mesh {
  const m = new THREE.Mesh(SHRIMP_GEO, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85 }));
  m.name = "bubble";
  return m;
}