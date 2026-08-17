// Shared, retargetable animation clips stored as data instead of GLBs.
//
// The rigging provider returns one animation per generation, baked into a full
// GLB — mesh, skeleton, textures and all — which is ~770 kB for a single walk
// cycle we already have the mesh for. Since every character it rigs shares the
// same 24-bone skeleton (Hips, LeftUpLeg, … Head), the *motion* is the only new
// information in that file, and motion is small: 22 bones x 64 frames of
// quaternion is 11 kB.
//
// So a clip ships as a .clip.json: a header plus a base64 Int16 table of
// quaternions sampled at a uniform rate. Rotation only, which is what makes one
// clip drive every actor — see retargetable() in Model.ts for why translation
// tracks do not transfer between rigs.
//
// Adding a motion to the game is therefore ~15 kB and no per-character cost,
// rather than ~770 kB per character per motion.
import * as THREE from "three";

export interface ClipFile {
  name: string;
  /** Seconds. */
  duration: number;
  /** Sample rate the table was baked at. */
  fps: number;
  frames: number;
  /** Bone names, in table order. */
  bones: string[];
  /** base64 Int16Array, [bone][frame][xyzw], each component scaled by 32767. */
  quat: string;
}

const cache = new Map<string, Promise<THREE.AnimationClip | null>>();

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Exported for tests: turn a decoded .clip.json into a three.js clip. */
export function buildClip(data: ClipFile): THREE.AnimationClip {
  const bytes = decodeBase64(data.quat);
  // Copy into a fresh buffer: the Uint8Array from atob is not guaranteed to be
  // 2-byte aligned, and Int16Array demands alignment.
  const q = new Int16Array(bytes.slice().buffer);
  const times = new Float32Array(data.frames);
  for (let f = 0; f < data.frames; f++) times[f] = f / data.fps;

  const tracks: THREE.KeyframeTrack[] = [];
  for (let b = 0; b < data.bones.length; b++) {
    const values = new Float32Array(data.frames * 4);
    const base = b * data.frames * 4;
    for (let i = 0; i < values.length; i++) values[i] = q[base + i] / 32767;
    tracks.push(new THREE.QuaternionKeyframeTrack(`${data.bones[b]}.quaternion`, times as unknown as number[], values as unknown as number[]));
  }
  return new THREE.AnimationClip(data.name, data.duration, tracks);
}

/**
 * Load a shared clip by name (e.g. "hero_walk"). Resolves to null if the clip
 * is missing or malformed, so callers keep whatever animation they already had
 * rather than losing the actor entirely.
 */
export function loadClip(name: string): Promise<THREE.AnimationClip | null> {
  let p = cache.get(name);
  if (!p) {
    const url = new URL(`models/clips/${name}.clip.json`, window.location.href).href;
    p = fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<ClipFile>) : Promise.reject(new Error(String(r.status)))))
      .then(buildClip)
      .catch(() => null);
    cache.set(name, p);
  }
  return p;
}
