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
  /**
   * World position the camera should keep centred (the hero, including any
   * dungeon origin offset). Drag/WASD pan is applied as an offset from this, so
   * the camera follows the player without fighting manual panning.
   */
  getFollowTarget?: () => { x: number; z: number };
}

const ZOOM_MIN = 0.45;
const DEFAULT_ZOOM = 1.75;
const ZOOM_MAX = 1.9;
const TAP_DRAG_MS = 240; // max tap duration (ms)
const TAP_DRAG_PX = 10;  // max travel before it's a pan

export class InputController {
  private engine: Engine;
  private grid: Grid;
  private cbs: InputCallbacks;

  // A frustum of 30 at zoom 1 shows ~30 tiles vertically, which on the 42x42
  // map renders the hero about ten pixels tall. Open nearer to character scale;
  // the player can still pinch/wheel out to ZOOM_MIN for the wide view.
  private pan = { x: 0, z: 0, zoom: DEFAULT_ZOOM };
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

  /** P5: world offset of the active dungeon (0,0 on the surface) — taps are
   *  translated into the active grid's local coords. */
  origin = { x: 0, z: 0 };

  // Reusable ortho raycast objects (created once, not per tap)
  private ray = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private followTarget: { x: number; z: number } | null = null;

  constructor(engine: Engine, grid: Grid, cbs: InputCallbacks) {
    this.engine = engine;
    this.grid = grid;
    this.cbs = cbs;
    this.el = document.body;
    this.bind();
    this.applyCamera();
  }

  /**
   * Camera target = follow target + the user's accumulated pan offset.
   *
   * `panWorld` used to be an absolute world position starting at (0,0), so this
   * constructor snapped the camera to the map corner — undoing the hero-centring
   * that boot() had just done one line earlier. Treating it as an offset means
   * the camera follows the hero and drag still works, from one expression.
   */
  private applyCamera() {
    // While a finger/mouse is down, the camera tracks input 1:1 (no slide).
    this.engine.snapPan = this.pointerDown || this.pinching;
    const f = this.cbs.getFollowTarget?.() ?? { x: 0, z: 0 };
    this.engine.updateCameraTarget(
      { x: f.x + this.panWorld.x, z: f.z + this.panWorld.z },
      this.pan.zoom
    );
    this.cbs.onCameraChanged?.({ ...this.pan, panX: this.panWorld.x, panZ: this.panWorld.z });
  }

  /** Re-centre on the follow target, dropping any manual pan. Used on spawn,
   *  fast travel and dungeon transitions. */
  recentre() {
    this.panWorld.x = 0;
    this.panWorld.z = 0;
    this.applyCamera();
  }

  /** Called every frame so the camera tracks the hero as it walks. */
  update() {
    this.applyCamera();
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
    const target = e.target as HTMLElement;
    if (target?.closest?.(".hud-slot, .bar, .panel, .modal, button, a, input, .combat-tray, [data-hud]")) return; // HUD: let the browser fire the click
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
    const target = e.target as HTMLElement;
    if (target?.closest?.(".hud-slot, .bar, .panel, .modal, button, a, input, [data-hud]")) return;
    e.preventDefault();
    const ts = Array.from(e.touches);
    if (ts.length >= 2) {
      if (this.pinching) {
        const d = this.dist(ts[0], ts[1]);
        const scale = this.pinchDist > 0 ? d / this.pinchDist : 1;
        const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.pinchStartZoom * scale));
        if (nextZoom !== this.pan.zoom) {
          // Anchor the zoom on the pinch midpoint: the world point under the
          // fingers stays put while the zoom changes.
          const midX = (ts[0].clientX + ts[1].clientX) / 2;
          const midY = (ts[0].clientY + ts[1].clientY) / 2;
          const before = this.pickWorld(midX, midY);
          this.pan.zoom = nextZoom;
          const after = this.pickWorld(midX, midY);
          if (before && after) {
            this.panWorld.x += before.x - after.x;
            this.panWorld.z += before.z - after.z;
          }
        }
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
      const c = Math.SQRT1_2;
      const s = 0.05 / this.pan.zoom;
      this.panWorld.x -= (dx - dy) * c * s;
      this.panWorld.z += (dx + dy) * c * s;
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
    const hudTarget = (e.target as HTMLElement)?.closest?.(".hud-slot, .bar, .panel, .modal, button, a, input");
    if (!hudTarget && !this.moved && dur < TAP_DRAG_MS && t.identifier === this.startId) {
      this.raycastTap(t.clientX, t.clientY);
    }
  };

  // ————— Mouse —————
  private onMouseDown = (e: MouseEvent) => {
    // Same HUD guard the touch path uses: a press on a panel/button must not
    // start a camera pan, or dragging off a button drags the world with it.
    const target = e.target as HTMLElement;
    if (target?.closest?.(".hud-slot, .bar, .panel, .modal, button, a, input, .combat-tray, [data-hud]")) return;
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

  /** Cast from screen coords to the ground plane. Uses THREE.Raycaster's
   *  setFromCamera, which handles ORTHOGRAPHIC cameras correctly (rays are
   *  parallel to the view axis). The old manual unproject built a
   *  perspective-like ray from the camera position, so taps away from screen
   *  centre hit the WRONG tile — the root cause of "tap to walk misses".
   */
  private pickWorld(clientX: number, clientY: number): THREE.Vector3 | null {
    const cam = this.engine.camera;
    const rect = this.engine.renderer.domElement.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    this.ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), cam);
    const hit = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.groundPlane, hit) ? hit : null;
  }

  private raycastTap(clientX: number, clientY: number) {
    const hit = this.pickWorld(clientX, clientY);
    if (!hit) return;
    // P5: translate into the active grid's local coords (dungeon offset).
    const gx = Math.round(hit.x) - this.origin.x;
    const gy = Math.round(hit.z) - this.origin.z;
    if (!this.grid.at(gx, gy)) return;
    this.cbs.onTileTap(gx, gy);
  }

  /** Ask the camera to drift toward a world point while the hero walks. */
  setFollow(p: { x: number; z: number } | null) { this.followTarget = p; }

  /** Called each frame: gently move the camera toward the follow target unless
   *  the player is actively panning (their input takes precedence). */
  updateFollow(dt: number) {
    if (!this.followTarget || this.pointerDown || this.pinching) return;
    const k = 1 - Math.exp(-dt * 5);
    const nx = this.panWorld.x + (this.followTarget.x - this.panWorld.x) * k;
    const nz = this.panWorld.z + (this.followTarget.z - this.panWorld.z) * k;
    if (Math.abs(nx - this.panWorld.x) > 0.001 || Math.abs(nz - this.panWorld.z) > 0.001) {
      this.panWorld.x = nx;
      this.panWorld.z = nz;
      this.applyCamera();
    }
  }

  getPanState(): PanState { return { panX: this.panWorld.x, panZ: this.panWorld.z, zoom: this.pan.zoom }; }
}