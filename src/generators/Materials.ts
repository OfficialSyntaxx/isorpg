// Procedural Canvas 2D textures — all styling, zero external assets (GDD §1).
import * as THREE from "three";
import type { TerrainType } from "../world/Grid";

const cache = new Map<string, THREE.Material>();

function noiseCanvas(size: number, base: string, speckles: string[], speckleCount: number, alpha = 1): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < speckleCount; i++) {
    ctx.fillStyle = speckles[i % speckles.length];
    const s = size / 24;
    ctx.globalAlpha = alpha * (0.4 + Math.random() * 0.6);
    ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const PALETTES: Record<TerrainType, { base: string; speckles: string }> = {
  GRASS: { base: "#5c9e46", speckles: "#6fae55" },
  DIRT: { base: "#9a744a", speckles: "#8a6640" },
  SAND: { base: "#e0cf9a", speckles: "#d5c086" },
  ROCK: { base: "#8b8f98", speckles: "#7a7e88" },
  WATER: { base: "#3d7fb8", speckles: "#4e8fc3" },
  ROAD: { base: "#6b6355", speckles: "#5f574a" },
};

export function getTerrainMaterial(type: TerrainType): THREE.MeshStandardMaterial {
  const key = `terr_${type}`;
  if (cache.has(key)) return cache.get(key) as THREE.MeshStandardMaterial;
  const p = PALETTES[type];
  const tex = noiseCanvas(128, p.base, [p.speckles], 260, 0.55);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    flatShading: true,
    roughness: 0.95,
    metalness: 0,
  });
  cache.set(key, mat);
  return mat;
}

/** Accent material for the whole-map base plate. */
export function getBaseMaterial(): THREE.MeshStandardMaterial {
  const key = "base";
  if (cache.has(key)) return cache.get(key) as THREE.MeshStandardMaterial;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#2e2720";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.04})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
  cache.set(key, mat);
  return mat;
}