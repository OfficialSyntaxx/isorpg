// Procedural nature: richer low-poly trees, rocks, instanced ground clutter,
// hero tool props, animated water and a sky backdrop. Zero external assets (GDD §1).
import * as THREE from "three";
import { TREE_SCALE, ROCK_SCALE } from "../core/Scale";
import type { TerrainType } from "../world/Grid";

const cache = new Map<string, THREE.Material>();

function mat(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.92, metalness: 0 });
}

// ————— Trees —————
const TRUNK_TONES = ["#6b4a2b", "#7a5633", "#5d3f23"];
const LEAF_TONES: { top: string; bot: string }[] = [
  { top: "#3d8a46", bot: "#2a6b37" },
  { top: "#4a9c52", bot: "#2f7a3f" },
  { top: "#35804a", bot: "#256039" },
  { top: "#56a05a", bot: "#377a41" },
];

export function makeTree(variant: number): THREE.Group {
  const g = new THREE.Group();
  const v = Math.abs(variant);
  const rnd = seedRng(v * 7919 + 13);

  const trunkH = 0.7 + rnd() * 0.35;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.16, trunkH, 6),
    mat(TRUNK_TONES[v % 3])
  );
  trunk.position.y = trunkH / 2;
  g.add(trunk);

  const tone = LEAF_TONES[v % 4];
  const crownY = trunkH;
  const blobs: { x: number; z: number; y: number; s: number; c: string }[] = [
    { x: 0, z: 0, y: crownY + 0.32, s: 0.5, c: tone.top },
    { x: 0.2 + rnd() * 0.1, z: 0.12, y: crownY + 0.18, s: 0.38, c: tone.bot },
    { x: -0.2, z: 0.05, y: crownY + 0.16, s: 0.36, c: tone.bot },
    { x: 0.02, z: -0.22, y: crownY + 0.2, s: 0.34, c: tone.top },
  ];
  for (const b of blobs) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(b.s, 0), mat(b.c));
    leaf.position.set(b.x, b.y, b.z);
    leaf.scale.y = 0.8;
    g.add(leaf);
  }

  // A fallen companion log (only some variants)
  if (v % 5 === 0) {
    const log = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.7, 5),
      mat(TRUNK_TONES[(v + 1) % 3])
    );
    log.rotation.set(Math.PI / 2, 0, 0.6);
    log.position.set(0.5, 0.06, 0.12);
    g.add(log);
  }
  // Trees clear head height — a canopy an actor walks under, not a shrub.
  g.scale.setScalar(TREE_SCALE);
  g.userData.type = "TREE";
  return g;
}

// ————— Rocks —————
const ROCK_TONES = ["#9aa0ab", "#7e848f", "#a8aeb8"];

export function makeRock(variant: number): THREE.Group {
  const g = new THREE.Group();
  const v = Math.abs(variant);
  const rnd = seedRng(v * 528 + 7);
  for (let i = 0; i < 2 + (v % 2); i++) {
    const s = 0.26 - i * 0.05 + rnd() * 0.05;
    const st = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), mat(ROCK_TONES[(v + i) % 3]));
    st.position.set(i * 0.16 - 0.1 + rnd() * 0.08, 0.16 + i * 0.12, rnd() * 0.12 - 0.06);
    st.rotation.set(rnd() * 1.2, rnd() * Math.PI, rnd() * 0.6);
    st.scale.y = 0.72;
    g.add(st);
  }
  if (v % 4 === 0) {
    const moss = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), mat("#5f8f47"));
    moss.position.set(0.08, 0.12, 0.12);
    moss.scale.set(1, 0.4, 1);
    g.add(moss);
  }
  g.scale.setScalar(ROCK_SCALE);
  g.userData.type = "ROCK";
  return g;
}

// ————— Ground clutter (instanced) —————
export type ClutterKind = "tuft" | "bush" | "flower" | "pebble";

function makeClutterGeo(kind: ClutterKind): THREE.BufferGeometry {
  switch (kind) {
    case "tuft":
      return new THREE.ConeGeometry(0.05, 0.22, 3);
    case "bush": {
      const g = new THREE.BufferGeometry();
      const pos: number[] = [];
      const sp = new THREE.SphereGeometry(0.12, 5, 4);
      const center = new THREE.Vector3();
      const p = sp.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        center.fromBufferAttribute(p, i);
        center.multiplyScalar(0.6 + Math.sin(i) * 0.12);
        pos.push(center.x, center.y, center.z);
      }
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      return g;
    }
    case "flower":
      return new THREE.SphereGeometry(0.07, 5, 4);
    default:
      return new THREE.IcosahedronGeometry(0.07, 0);
  }
}

const CLUTTER_GEO: Record<ClutterKind, THREE.BufferGeometry> = {
  tuft: makeClutterGeo("tuft"),
  bush: makeClutterGeo("bush"),
  flower: makeClutterGeo("flower"),
  pebble: makeClutterGeo("pebble"),
};

/** Build instanced ground decoration. Returns {group, count} — one InstancedMesh per kind. */
export function buildClutter(
  tiles: { x: number; y: number; terrain: string; seed: number }[]
): THREE.Group {
  const g = new THREE.Group();
  const buckets: Record<ClutterKind, { x: number; y: number; seed: number }[]> = {
    tuft: [], bush: [], flower: [], pebble: [],
  };

  for (const t of tiles) {
    if (t.terrain !== "GRASS" && t.terrain !== "DIRT" && t.terrain !== "SAND") continue;
    const rnd = seedRng(t.seed);
    const r = rnd();
    if (t.terrain === "GRASS") {
      if (r < 0.7) buckets.tuft.push({ x: t.x, y: t.y, seed: t.seed });
      if (r >= 0.4 && r < 0.48) buckets.bush.push({ x: t.x, y: t.y, seed: t.seed });
      if (r >= 0.5 && r < 0.56) buckets.flower.push({ x: t.x, y: t.y, seed: t.seed });
    }
    if (t.terrain === "DIRT") {
      if (r < 0.5) buckets.pebble.push({ x: t.x, y: t.y, seed: t.seed });
    }
  }

  const PALETTES: Record<ClutterKind, string[]> = {
    tuft: ["#4f8f42", "#5a9c4b", "#478a3c"],
    bush: ["#3f7d39", "#4b8d43", "#356b30"],
    flower: ["#e8e19a", "#d98fb0", "#9fd0e0", "#e0b06a"],
    pebble: ["#8b8f98", "#9aa0ab"],
  };

  for (const kind of Object.keys(buckets) as ClutterKind[]) {
    const list = buckets[kind];
    if (!list.length) continue;
    const geo = CLUTTER_GEO[kind];
    const matv = PALETTES[kind];
    const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1 }), list.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const up = new THREE.Vector3(0, 1, 0);
    const scale = kind === "bush" ? 1 : 0.7;
    list.forEach((t, i) => {
      const rnd = seedRng(t.seed * 13 + i);
      q.setFromEuler(euler.set(rnd() * 1.5 - 0.75, rnd() * Math.PI, 0));
      m.compose(
        new THREE.Vector3(t.x + rnd() * 0.5 - 0.25, 0.1, t.y + rnd() * 0.5 - 0.25),
        q,
        new THREE.Vector3(scale * (0.8 + rnd() * 0.6), scale * (0.8 + rnd() * 0.6), scale * (0.8 + rnd() * 0.6))
      );
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, new THREE.Color(matv[i % matv.length]));
      void up;
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    g.add(inst);
  }
  return g;
}

// ————— Hero tool props —————
export function makeTool(kind: "axe" | "pick" | "net" | "sword"): THREE.Group {
  const g = new THREE.Group();
  const wood = mat("#8a6434");
  const steel = new THREE.MeshStandardMaterial({ color: "#b9c0cc", flatShading: true, roughness: 0.5, metalness: 0.7 });
  if (kind === "axe") {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.55, 5), wood);
    handle.rotation.z = Math.PI / 2;
    g.add(handle);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.03), steel);
    head.position.set(0.28, 0.02, 0);
    head.rotation.z = -0.1;
    g.add(head);
  } else if (kind === "pick") {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.55, 5), wood);
    handle.rotation.z = Math.PI / 2;
    g.add(handle);
    const headGeo = new THREE.TorusGeometry(0.12, 0.03, 6, 8, Math.PI);
    const head = new THREE.Mesh(headGeo, steel);
    head.position.set(0.24, 0.0, 0);
    head.rotation.z = -Math.PI / 2;
    g.add(head);
  } else if (kind === "sword") {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.03), steel);
    blade.position.set(0.26, 0, 0);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.05), wood);
    guard.position.set(0.14, 0.02, 0);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.04), wood);
    grip.position.set(0.1, -0.02, 0);
    g.add(blade); g.add(guard); g.add(grip);
  } else {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.4, 5), wood);
    handle.rotation.z = Math.PI / 2;
    g.add(handle);
    const ringGeo = new THREE.TorusGeometry(0.12, 0.02, 5, 10);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: "#4b4f5a", flatShading: true, roughness: 0.6 }));
    ring.position.set(0.26, 0, 0);
    g.add(ring);
  }
  return g;
}

export function animFor(type: "TREE" | "ROCK" | "WATER"): "chop" | "mine" | "fish" {
  return type === "TREE" ? "chop" : type === "ROCK" ? "mine" : "fish";
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
export function makeFishingMarker(): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.1, 0.02, 6, 12),
    new THREE.MeshStandardMaterial({ color: "#d8e8f8", transparent: true, opacity: 0.85 })
  );
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);
  const float = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true }));
  float.position.y = 0.06;
  g.add(float);
  g.visible = false;
  return g;
}

export function makeWaterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color("#2f6fae") },
      uColorB: { value: new THREE.Color("#5aa2d8") },
    },
    transparent: true, opacity: 0.95,
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        // The surface lies in the XZ plane, so the swell has to move along Y.
        // This displaced p.z (and read p.y, which is always 0 here), so the
        // whole sheet slid sideways instead of rippling.
        p.y += sin((p.x + p.z) * 0.9 + uTime * 1.4) * 0.05;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float sh = sin(vUv.x * 14.0 + uTime * 1.6) * sin(vUv.y * 14.0 - uTime * 1.2);
        float g = 0.5 + 0.5 * sh;
        vec3 c = mix(uColorA, uColorB, g);
        c += vec3(0.25) * pow(max(0.0, sin(vUv.x * 40.0 - uTime * 2.0)), 8.0);
        gl_FragColor = vec4(c, 0.94);
      }
    `,
  });
}

export function makeSkyTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 64; cv.height = 512;
  const g = cv.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#2d4a7a");
  grad.addColorStop(0.55, "#7fa6cc");
  grad.addColorStop(1, "#e8d9b0");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 512);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}