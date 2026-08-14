// Unified input: touch is the primary input (mobile-first), mouse + keyboard
// mirror it for desktop testing. Emits high-level intents so systems never
// need to know about pointers.
import { Engine } from "./Engine";
import * as THREE from "three";
import type { Grid } from "../world/Grid";

export interface PanState {
  panX: number; panZ: number;
  zoom: number;
}

export interface InputCallbacks {
  /** Grid tile tapped (mobile tap or desktop click). */
  onTileTap: (x: number, y: number) => void;
  /** Pointer activity changes the drag threshold. */
  onCameraChanged?: (p: PanState) => void;
}

const ZOOM_MIN = 0.45;
const ZOOM_MAX = 1.9;
const TAP_DRAG_MS = 240; // max tap duration (ms)
const TAP_DRAG_PX = 10;  // max travel before it's a pan

export class InputController {
  private engine: Engine;
  private grid: Grid;
  private cbs: InputCallbacks;

  private pan = { x: 0, z: 0, zoom: 1 };
  // accumulated raw pan (world units) — camera target moves opposite drag
  private panWorld = { x: 0, z: 0 };

  private el: HTMLElement;
  private pointerDown = false;
  private startX = 0; private startY = 0;
  private startId: number | null = null;
  private lastX = 0; private lastY = 0;
  private startTime = 0;
  private moved = false;
  private pinching = false;
  private pinchDist = 0;
  private pinchStartZoom = 1;

  private keys: Record<string, boolean> = {};
  private keyPan = { x: 0, z: 0 };

  constructor(engine: Engine, grid: Grid, cbs: InputCallbacks) {
    this.engine = engine;
    this.grid = grid;
    this.cbs = cbs;
    this.el = document.body;
    this.bind();
    this.applyCamera();
  }

  private applyCamera() {
    this.engine.updateCameraTarget({ x: this.panWorld.x, z: this.panWorld.z }, this.pan.zoom);
    this.cbs.onCameraChanged?.({ ...this.pan, panX: this.panWorld.x, panZ: this.panWorld.z });
  }

  private bind() {
    const supportsTouch = "ontouchstart" in window;

    if (supportsTouch) {
      this.el.addEventListener("touchstart", this.onTouchStart, { passive: false });
      this.el.addEventListener("touchmove", this.onTouchMove, { passive: false });
      this.el.addEventListener("touchend", this.onTouchEnd, { passive: false });
      this.el.addEventListener("touchcancel", this.onTouchEnd, { passive: false });
    } else {
      this.el.addEventListener("mousedown", this.onMouseDown);
      window.addEventListener("mousemove", this.onMouseMove);
      window.addEventListener("mouseup", this.onMouseUp);
      this.el.addEventListener("wheel", this.onWheel, { passive: false });
    }
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  // ————— Touch —————
  private onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    const ts = Array.from(e.touches);
    if (ts.length === 2) {
      this.pinching = true;
      this.pinchDist = this.dist(ts[0], ts[1]);
      this.pinchStartZoom = this.pan.zoom;
      return;
    }
    if (ts.length === 1) {
      this.pointerDown = true;
      this.moved = false;
      this.startX = this.lastX = ts[0].clientX;
      this.startY = this.lastY = ts[0].clientY;
      this.startTime = performance.now();
      this.startId = ts[0].identifier;
    }
  };

  private onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    const ts = Array.from(e.touches);
    if (ts.length >= 2) {
      if (this.pinching) {
        const d = this.dist(ts[0], ts[1]);
        const scale = this.pinchDist > 0 ? d / this.pinchDist : 1;
        this.pan.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.pinchStartZoom * scale));
        this.applyCamera();
      }
      return;
    }
    if (!this.pointerDown || ts.length !== 1) return;
    const t = ts[0];
    const dx = t.clientX - this.lastX;
    const dy = t.clientY - this.lastY;
    this.lastX = t.clientX; this.lastY = t.clientY;
    if (Math.abs(t.clientX - this.startX) + Math.abs(t.clientY - this.startY) > TAP_DRAG_PX) {
      // A pan gesture once movement exceeds the tap threshold — own it.
      this.el.style.touchAction = "none";
      this.moved = true;
      this.panWorld.x -= dx * 0.05 / this.pan.zoom;
      this.panWorld.z -= dy * 0.05 / this.pan.zoom;
      this.applyCamera();
    }
  };

  private onTouchEnd = (e: TouchEvent) => {
    // If we were pinching and now one finger remains, treat the remaining one as a new press.
    if (this.pinching) {
      this.pinching = false;
      const ts = Array.from(e.touches);
      if (ts.length === 1) {
        this.pointerDown = true;
        this.moved = false;
        this.startX = this.lastX = ts[0].clientX;
        this.startY = this.lastY = ts[0].clientY;
        this.startTime = performance.now();
      } else {
        this.pointerDown = false;
      }
      return;
    }
    if (!this.pointerDown) return;
    this.pointerDown = false;
    this.el.style.touchAction = "";
    if (e.changedTouches.length === 0) return;
    const t = e.changedTouches[0];
    // A tap: quick, short movement, released on the same finger
    const dur = performance.now() - this.startTime;
    if (!this.moved && dur < TAP_DRAG_MS && t.identifier === this.startId) {
      this.raycastTap(t.clientX, t.clientY);
    }
  };

  // ————— Mouse —————
  private onMouseDown = (e: MouseEvent) => {
    this.pointerDown = true;
    this.moved = false;
    this.startX = this.lastX = e.clientX;
    this.startY = this.lastY = e.clientY;
    this.startTime = performance.now();
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerDown) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX; this.lastY = e.clientY;
    if (Math.abs(e.clientX - this.startX) + Math.abs(e.clientY - this.startY) > 3) {
      this.moved = true;
      this.panWorld.x -= dx * 0.05 / this.pan.zoom;
      this.panWorld.z -= dy * 0.05 / this.pan.zoom;
      this.applyCamera();
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (!this.pointerDown) return;
    this.pointerDown = false;
    const dur = performance.now() - this.startTime;
    if (!this.moved && dur < TAP_DRAG_MS) {
      this.raycastTap(e.clientX, e.clientY);
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    this.pan.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.pan.zoom * factor));
    this.applyCamera();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  /** Keyboard pan, called each frame by the engine. */
  updateKeyboard(dt: number) {
    const k = this.keys;
    let dx = 0, dz = 0;
    if (k["KeyW"] || k["ArrowUp"]) dz = -1;
    if (k["KeyS"] || k["ArrowDown"]) dz = 1;
    if (k["KeyA"] || k["ArrowLeft"]) dx = -1;
    if (k["KeyD"] || k["ArrowRight"]) dx = 1;
    // W/S+A/D move the target on screen-space axes (isometric)
    const speed = 8 * dt / this.pan.zoom;
    if (dx !== 0 || dz !== 0) {
      // Rotate key input into camera right/forward for natural WASD
      const cos45 = Math.SQRT1_2;
      const rx = dz * cos45 + dx * cos45;
      const rz = -dz * cos45 + dx * cos45;
      // camera looks toward +z,-x-ish; reinterpret
      this.panWorld.x -= rx * speed;
      this.panWorld.z += rz * speed;
      this.applyCamera();
    }
  }

  private dist(a: Touch, b: Touch) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  /** Cast from screen coords to the ground plane (ortho → unproject). */
  private raycastTap(clientX: number, clientY: number) {
    const cam = this.engine.camera;
    const rect = this.engine.renderer.domElement.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const ndc = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(cam);
    const origin = ndc.clone().sub(cam.position).normalize();
    const t = -cam.position.y / origin.y; // hit ground plane y=0
    const hit = cam.position.clone().add(origin.multiplyScalar(t));
    const tile = this.grid.at(Math.round(hit.x), Math.round(hit.z));
    if (tile) this.cbs.onTileTap(tile.x, tile.y);
  }

  getPanState(): PanState { return { panX: this.panWorld.x, panZ: this.panWorld.z, zoom: this.pan.zoom }; }
}