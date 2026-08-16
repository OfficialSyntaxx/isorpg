// Rigged GLB loader with baked-animation playback.
// Each model is fetched once (cached template), cloned per instance so many
// actors can share it; the clones get their own AnimationMixer. Call
// `updateMixers(dt)` from the main loop each frame.
import * as THREE from "three";
import { ACTOR_HEIGHT } from "./Scale";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

interface Template {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
}

const loader = new GLTFLoader();
const cache = new Map<string, Promise<Template>>();
const mixers = new Set<THREE.AnimationMixer>();

function fetchTemplate(name: string): Promise<Template> {
  const url = new URL(`models/${name}.glb`, window.location.href).href;
  return new Promise((res, rej) => {
    loader.load(
      url,
      (gltf) => res({ scene: gltf.scene, clips: gltf.animations ?? [] }),
      undefined,
      () => rej(new Error(`model load failed: ${name}`))
    );
  });
}

/** Spawn a fresh animated clone of a rigged model (falls back to null on error). */
export async function spawnModel(name: string): Promise<THREE.Object3D | null> {
  try {
    let p = cache.get(name);
    if (!p) {
      p = fetchTemplate(name);
      cache.set(name, p);
    }
    const t = await p;
    const scene = t.scene.clone(true);
    loadModelSizing(scene);
    if (t.clips.length) {
      const mixer = new THREE.AnimationMixer(scene);
      const action = mixer.clipAction(t.clips[0]);
      action.play();
      mixers.add(mixer);
    }
    return scene;
  } catch {
    return null;
  }
}

/** Flatten the rig under a movable Group and scale to a game-friendly size. */
export function loadModelSizing(scene: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const s = ACTOR_HEIGHT / Math.max(size.y, 0.01);
  scene.scale.setScalar(s);
  const b2 = new THREE.Box3().setFromObject(scene);
  const c = new THREE.Vector3();
  b2.getCenter(c);
  scene.position.set(-c.x, -b2.min.y, -c.z);
}

/** Advance every active animation mixer. */
export function updateModelMixers(dt: number): void {
  for (const m of mixers) m.update(dt);
}