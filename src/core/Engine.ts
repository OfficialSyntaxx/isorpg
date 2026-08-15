// Core engine: Three.js scene setup, fixed 600ms tick loop decoupled from
// requestAnimationFrame, orthographic isometric camera (GDD §1, §3).
import * as THREE from "three";
import { EngineLogger, guarded } from "../utils/Logger";

export const TICK_MS = 600; // rigid 600ms tick = 100 ticks/min
const DEG = Math.PI / 180;
const PITCH = Math.asin(Math.tan(30 * DEG)); // 35.264°
const YAW = 45 * DEG;
const FRUSTUM = 30;

export type TickHandler = (tickIndex: number, dtMs: number) => void;
export type FrameHandler = (dt: number /* seconds */, elapsed: number) => void;

export class Engine {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly renderer: THREE.WebGLRenderer;
  cameraTarget = new THREE.Vector3(0, 0, 0);
  cameraZoom = 1;
  /** While the player is actively dragging/pinching, the camera follows input
   *  1:1 (no smoothing "slide"); smoothing resumes once they let go. */
  snapPan = false;
  private ambient: THREE.AmbientLight | null = null;
  private sun: THREE.DirectionalLight | null = null;
  // Smoothed position the camera actually renders at — eases toward
  // cameraTarget each frame so panning is smooth instead of snapping.
  private smoothTarget = new THREE.Vector3(0, 0, 0);

  private tickIndex = 0;
  private lastTickTime = 0;
  private acc = 0;
  private frameHandlers: FrameHandler[] = [];
  private tickHandlers: TickHandler[] = [];
  private running = false;
  private raf = 0;

  constructor(container: HTMLElement) {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    this.camera = new THREE.OrthographicCamera(
      (FRUSTUM * aspect) / -2, (FRUSTUM * aspect) / 2,
      FRUSTUM / 2, FRUSTUM / -2, 0.1, 1000
    );
    this.positionCamera();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.domElement.style.display = "block";
    container.appendChild(this.renderer.domElement);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.setupLights();
    this.bindResize();
  }

  private positionCamera() {
    const radius = 55;
    const x = radius * Math.cos(PITCH) * Math.sin(YAW);
    const y = radius * Math.sin(PITCH);
    const z = radius * Math.cos(PITCH) * Math.cos(YAW);
    // yaw 45° -> from the SW looking NE in typical isometric
    this.camera.position.set(this.smoothTarget.x + x, this.smoothTarget.y + y, this.smoothTarget.z + z);
    this.camera.lookAt(this.smoothTarget);
  }

  private setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.ambient = ambient;
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 0.85);
    this.sun = sun;
    sun.position.set(50, 80, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    sun.shadow.camera.far = 200;
    this.scene.add(sun);
    this.scene.add(sun.target);

    const fill = new THREE.DirectionalLight(0xffe8d0, 0.25);
    fill.position.set(-20, 30, -30);
    this.scene.add(fill);
  }

  private bindResize() {
    window.addEventListener("resize", () => {
      const aspect = window.innerWidth / Math.max(1, window.innerHeight);
      this.camera.left = (FRUSTUM * aspect) / -2;
      this.camera.right = (FRUSTUM * aspect) / 2;
      this.camera.top = FRUSTUM / 2;
      this.camera.bottom = FRUSTUM / -2;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  /** Apply camera pan (target moves on the XZ plane) with optional zoom. */
  updateCameraTarget(target: { x: number; z: number }, zoom: number) {
    this.cameraTarget.set(target.x, 0, target.z);
    this.cameraZoom = zoom;
  }

  /** P3 day/night: drive light intensity + tint from a daylight factor (0..1). */
  setDayNight(d: number) {
    if (this.ambient) this.ambient.intensity = 0.25 + 0.45 * d;
    if (this.sun) {
      this.sun.intensity = 0.2 + 0.8 * d;
      this.sun.color.lerpColors(new THREE.Color("#8fa2c4"), new THREE.Color("#fff3dd"), d);
    }
  }

  onFrame(fn: FrameHandler) { this.frameHandlers.push(fn); }
  onTick(fn: TickHandler) { this.tickHandlers.push(fn); }

  start() {
    if (this.running) return;
    this.running = true;
    // Snap ticks to 600ms boundaries for a clean feel
    this.lastTickTime = performance.now();
    this.acc = 0;
    this.last = performance.now();
    this.loop();
  }

  private last = 0;
  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(dt, 0.25); // clamp big tab-visibility gaps

    // Fixed tick accumulation
    this.acc += now - this.lastTickTime;
    this.lastTickTime = now;
    const tickSize = TICK_MS;
    while (this.acc >= tickSize) {
      this.acc -= tickSize;
      guarded("TickSystem", () => {
        for (const h of this.tickHandlers) h(this.tickIndex, tickSize);
      });
      this.tickIndex++;
    }

    // Render + frame handlers each rAF
    guarded("RenderSystem", () => {
      for (const h of this.frameHandlers) h(dt, now / 1000);
      this.camera.zoom = THREE.MathUtils.lerp(this.camera.zoom, this.cameraZoom, Math.min(1, dt * 5));
      // Critically-damped follow: settle in ~0.14s, no overshoot. During an
      // active drag the camera snaps 1:1 to the finger (no sliding).
      if (this.snapPan) {
        this.smoothTarget.copy(this.cameraTarget);
      } else {
        const k = 1 - Math.exp(-dt * 7);
        this.smoothTarget.x += (this.cameraTarget.x - this.smoothTarget.x) * k;
        this.smoothTarget.z += (this.cameraTarget.z - this.smoothTarget.z) * k;
      }
      this.camera.updateProjectionMatrix();
      this.positionCamera();
      this.renderer.render(this.scene, this.camera);
    });
  };

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}

export const isomConstants = { PITCH, YAW, FRUSTUM };