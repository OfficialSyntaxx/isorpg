// Procedural low-poly settlement building meshes + placement tile highlights.
// Zero external assets — Canvas 2D textures + primitive geometry (GDD §1, §5.B).
import * as THREE from "three";
import type { BuildingType } from "../data/Buildings";

const cache = new Map<string, THREE.Material>();

function panelTexture(base: string, grain: string): THREE.CanvasTexture {
  const key = `wall_${base}_${grain}`;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = grain;
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * 11 + 4);
    ctx.lineTo(64, i * 11 + 4);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function wallMat(base: string, grain: string): THREE.MeshStandardMaterial {
  const key = `bwall_${base}`;
  if (cache.has(key)) return cache.get(key) as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({ map: panelTexture(base, grain), flatShading: true, roughness: 0.9 });
  cache.set(key, m);
  return m;
}

function flatMat(color: string): THREE.MeshStandardMaterial {
  const key = `bflat_${color}`;
  if (cache.has(key)) return cache.get(key) as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 });
  cache.set(key, m);
  return m;
}

interface Palette { wall: string; grain: string; roof: string; trim: string; }
const PALETTES: Record<BuildingType, Palette> = {
  STORAGE_BIN: { wall: "#9c7a4a", grain: "#7f6238", roof: "#6b4a2a", trim: "#ffd76a" },
  TOWN_HALL: { wall: "#d8bd82", grain: "#c2a366", roof: "#8a3b3b", trim: "#ffd479" },
  STOREHOUSE: { wall: "#a68a5c", grain: "#8c7048", roof: "#5a4632", trim: "#e0cf9a" },
  SAWMILL: { wall: "#8a6a4a", grain: "#71543a", roof: "#6b4423", trim: "#c98f4a" },
  SMELTER: { wall: "#6b6b6b", grain: "#575757", roof: "#3a2a2a", trim: "#ff9c4a" },
  GRANARY: { wall: "#c2b280", grain: "#a99968", roof: "#7a5a30", trim: "#7cd992" },
};

// Terrain tiles are boxes centered at y=0.3 with height 0.6, so the walkable
// top surface sits at y=0.6 for flat (elevation 0) land — buildings stand on it.
const GROUND_Y = 0.6;

/** A small low-poly structure: base + peaked roof, color-coded per building type. */
export function makeBuilding(type: BuildingType): THREE.Group {
  const g = new THREE.Group();
  const p = PALETTES[type];

  // Storage Bin: a small open-topped crate with a flat lid (tier-0 starter).
  if (type === "STORAGE_BIN") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), wallMat(p.wall, p.grain));
    body.position.y = GROUND_Y + 0.15;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.07, 0.54), flatMat(p.roof));
    lid.position.y = GROUND_Y + 0.335;
    lid.castShadow = true;
    g.add(lid);
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.04), flatMat(p.trim));
    latch.position.set(0, GROUND_Y + 0.375, 0.26);
    g.add(latch);
    return g;
  }

  const baseH = 0.5;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.82, baseH, 0.82), wallMat(p.wall, p.grain));
  base.position.y = GROUND_Y + baseH / 2;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  const roofH = 0.42;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.68, roofH, 4), flatMat(p.roof));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = GROUND_Y + baseH + roofH / 2;
  roof.castShadow = true;
  g.add(roof);

  // A small trim accent (door / chimney / banner) so silhouettes read apart.
  if (type === "SMELTER") {
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.34, 6), flatMat("#3a3a3a"));
    chimney.position.set(0.22, GROUND_Y + baseH + 0.17, -0.22);
    g.add(chimney);
  } else if (type === "TOWN_HALL") {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.22), flatMat(p.trim));
    banner.position.set(0, GROUND_Y + baseH + 0.05, 0.42);
    g.add(banner);
  } else {
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), flatMat(p.trim));
    door.position.set(0, GROUND_Y + 0.13, 0.415);
    g.add(door);
  }

  return g;
}

/** Flat, semi-transparent tile marker used for build placement (green = valid). */
export function makeTileHighlight(color: number, opacity = 0.42): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(0.94, 0.94);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 5;
  return mesh;
}
