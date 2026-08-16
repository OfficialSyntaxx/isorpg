// Rigged GLB loader with a per-actor animation state machine.
//
// Each GLB is fetched once (cached template) and cloned per instance, so many
// actors share one download. Clones use SkeletonUtils.clone() — NOT
// Object3D.clone(), which does not rebind a SkinnedMesh to its cloned skeleton
// and leaves every clone driving the original's bones.
//
// The provider rigs one clip per generation, so a character's states arrive as
// separate GLBs of the same rig. ACTOR_CLIPS maps a state name to whichever file
// carries its clip; the clips are collected onto a single mixer, and play()
// crossfades between them. Previously spawnModel() played clips[0] and never
// switched, so villagers idled while walking and bosses walk-cycled standing still.
import * as THREE from "three";
import { ACTOR_HEIGHT } from "./Scale";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

interface Template {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
}

/** Canonical animation states. Systems ask for these, not for clip names. */
export type ActorState = "idle" | "walk" | "attack" | "gather" | "hurt" | "die";

interface ActorDef {
  /** GLB providing the mesh + skeleton. Should itself be a rigged file. */
  base: string;
  /** state → GLB whose first clip drives that state. */
  states: Partial<Record<ActorState, string>>;
  /**
   * States whose clip comes from a DIFFERENT character's rig. Those are loaded
   * rotation-only (see retargetable) so the donor's proportions don't transfer.
   */
  borrowed?: ActorState[];
}

/**
 * Which files provide which states.
 *
 * Files are only listed once they exist; a missing state simply falls back to
 * the nearest available one (see resolveState), so this can be filled in as
 * clips are generated without breaking anything already shipped.
 */
export const ACTOR_CLIPS: Record<string, ActorDef> = {
  hero: {
    base: "hero_idle",
    states: { idle: "hero_idle", walk: "hero_walk" },
  },
  villager: {
    base: "villager",
    states: { idle: "villager" },
  },
  forest_ogre: {
    base: "forest_ogre",
    states: { walk: "forest_ogre" },
  },
  cave_brute: {
    base: "cave_brute",
    states: { walk: "cave_brute" },
  },
};

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

function template(name: string): Promise<Template> {
  let p = cache.get(name);
  if (!p) { p = fetchTemplate(name); cache.set(name, p); }
  return p;
}

/** A spawned actor with switchable animation states. */
export interface AnimatedActor {
  root: THREE.Object3D;
  /** Crossfade to a state. Unknown//missing states fall back gracefully. */
  play(state: ActorState): void;
  /** States this actor actually has clips for. */
  readonly available: ActorState[];
  dispose(): void;
}

/** Nearest sensible substitute when a state has no clip yet. */
const FALLBACK: Record<ActorState, ActorState[]> = {
  idle: ["walk"],
  walk: ["idle"],
  attack: ["gather", "walk", "idle"],
  gather: ["attack", "walk", "idle"],
  hurt: ["idle", "walk"],
  die: ["hurt", "idle"],
};

const FADE = 0.18; // seconds

/**
 * Strip position/scale tracks, keeping rotation only.
 *
 * Meshy rigs every character to the same 24 bone names but keeps each mesh's own
 * limb proportions in the rest pose, and its clips animate translation on all 24
 * bones. Playing one actor's clip on another therefore drags the target into the
 * donor's proportions. Rotations are proportion-independent, so a rotation-only
 * copy retargets cleanly — at the cost of any squash/stretch, which is invisible
 * at this camera distance. This is what lets one purchased motion drive several
 * characters instead of buying it per actor.
 */
export function retargetable(clip: THREE.AnimationClip): THREE.AnimationClip {
  const out = clip.clone();
  out.tracks = out.tracks.filter((t) => t.name.endsWith(".quaternion"));
  return out;
}

/**
 * Spawn an animated clone of a rigged actor. Returns null on any load failure so
 * callers keep their procedural fallback figure.
 */
export async function spawnActor(name: string): Promise<AnimatedActor | null> {
  const def = ACTOR_CLIPS[name];
  try {
    const baseName = def?.base ?? name;
    const base = await template(baseName);
    // SkeletonUtils.clone rebinds SkinnedMesh → cloned Skeleton. Object3D.clone
    // does not, so every clone would animate the template's bones instead.
    const root = cloneSkinned(base.scene) as THREE.Object3D;
    sizeToActor(root);

    const mixer = new THREE.AnimationMixer(root);
    mixers.add(mixer);

    const actions = new Map<ActorState, THREE.AnimationAction>();
    const states = def?.states ?? {};
    const wanted = Object.keys(states) as ActorState[];

    if (wanted.length) {
      // Pull each state's clip from whichever file carries it. Files are cached,
      // so several states sharing one file cost a single fetch.
      await Promise.all(wanted.map(async (state) => {
        const file = states[state];
        if (!file) return;
        try {
          const t = file === baseName ? base : await template(file);
          const raw = t.clips[0];
          if (!raw) return;
          const borrowed = def?.borrowed?.includes(state) ?? false;
          actions.set(state, mixer.clipAction(borrowed ? retargetable(raw) : raw));
        } catch { /* that state simply stays unavailable */ }
      }));
    } else if (base.clips.length) {
      // Undeclared actor: treat its single baked clip as idle.
      actions.set("idle", mixer.clipAction(base.clips[0]));
    }

    let current: ActorState | null = null;
    const resolve = (s: ActorState): ActorState | null => {
      if (actions.has(s)) return s;
      for (const alt of FALLBACK[s] ?? []) if (actions.has(alt)) return alt;
      return actions.size ? ([...actions.keys()][0]) : null;
    };

    const play = (state: ActorState) => {
      const target = resolve(state);
      if (!target || target === current) return;
      const next = actions.get(target)!;
      const prev = current ? actions.get(current) : undefined;
      next.reset().setEffectiveWeight(1).play();
      if (prev && prev !== next) prev.crossFadeTo(next, FADE, false);
      current = target;
    };

    play("idle");

    return {
      root,
      play,
      available: [...actions.keys()],
      dispose: () => { mixer.stopAllAction(); mixers.delete(mixer); },
    };
  } catch {
    return null;
  }
}

/**
 * Back-compat wrapper for callers that only need the mesh. Prefer spawnActor,
 * which can switch states.
 */
export async function spawnModel(name: string): Promise<THREE.Object3D | null> {
  const a = await spawnActor(name);
  return a ? a.root : null;
}

/** Scale a rig to ACTOR_HEIGHT and seat its feet on the group origin. */
export function sizeToActor(scene: THREE.Object3D): void {
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

/** Legacy name kept so existing call sites compile. */
export const loadModelSizing = sizeToActor;

/** Advance every active animation mixer. */
export function updateModelMixers(dt: number): void {
  for (const m of mixers) m.update(dt);
}
