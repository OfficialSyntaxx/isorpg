// P4b: tiny procedural kill-burst FX — a few colored shards that fly out,
// slow, and get removed. Zero assets.
import * as THREE from "three";

export interface FxPiece {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  born: number;
}

const LIFE_MS = 700;

/** Spawn a small burst at a world point. Returns the pieces (caller tracks). */
export function spawnBurst(scene: THREE.Scene, x: number, y: number, z: number, color: string, count = 10): FxPiece[] {
  const material = new THREE.MeshStandardMaterial({ color, flatShading: true, emissive: color, emissiveIntensity: 0.5 });
  const geo = new THREE.IcosahedronGeometry(0.07, 0);
  const pieces: FxPiece[] = [];
  const now = performance.now();
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(geo, material);
    const a = (i / count) * Math.PI * 2;
    const speed = 0.6 + Math.random() * 0.9;
    mesh.position.set(x, y, z);
    scene.add(mesh);
    pieces.push({
      mesh,
      vx: Math.cos(a) * speed,
      vy: 0.8 + Math.random() * 0.8,
      vz: Math.sin(a) * speed,
      born: now,
    });
  }
  return pieces;
}

/** Advance a piece list; returns the surviving pieces (dead ones removed). */
export function updateFx(pieces: FxPiece[], dt: number): FxPiece[] {
  const now = performance.now();
  const alive: FxPiece[] = [];
  for (const p of pieces) {
    if (now - p.born > LIFE_MS) {
      p.mesh.removeFromParent();
      (p.mesh.material as THREE.Material).dispose();
      p.mesh.geometry.dispose();
      continue;
    }
    p.vy -= 2.2 * dt; // gravity
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.mesh.rotation.x += dt * 6;
    p.mesh.rotation.y += dt * 5;
    const fade = 1 - (now - p.born) / LIFE_MS;
    (p.mesh.material as THREE.MeshStandardMaterial).opacity = fade;
    alive.push(p);
  }
  return alive;
}