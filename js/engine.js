// ------------------------------------------------------------------
// Engine: Three.js scene, orthographic isometric camera, lighting,
// raycasting for tile picking, and window-resize handling.
// Camera sits at (d,d,d) looking at origin -> classic 35.264deg / 45deg
// isometric projection (diamond tiles from a square grid).
// ------------------------------------------------------------------
import * as THREE from 'three';

export class Engine {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ canvas: container, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1a24);
    this.scene.fog = new THREE.Fog(0x0d1a24, 60, 150);

    // Orthographic camera at isometric angle.
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.cam.up.set(0, 1, 0);
    this.camDist = 42; // controls zoom

    // Lights
    this.ambient = new THREE.AmbientLight(0xbfd4e8, 0.9);
    this.hemi = new THREE.HemisphereLight(0xcfeeff, 0x24421, 0.9);
    this.dir = new THREE.DirectionalLight(0xfff4dd, 1.6);
    this.dir.position.set(24, 40, 14);
    this.dir.castShadow = true;
    this.dir.shadow.mapSize.set(2048, 2048);
    const s = 60;
    this.dir.shadow.camera.left = -s; this.dir.shadow.camera.right = s;
    this.dir.shadow.camera.top = s; this.dir.shadow.camera.bottom = -s;
    this.dir.shadow.camera.near = 1; this.dir.shadow.camera.far = 160;
    this.scene.add(this.ambient, this.hemi, this.dir);
    this.scene.add(this.dir.target);

    this.raycaster = new THREE.Raycaster();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    // half-height in world units derived from camDist (zoom)
    const halfH = this.camDist;
    const halfW = halfH * aspect;
    this.cam.left = -halfW; this.cam.right = halfW;
    this.cam.top = halfH; this.cam.bottom = -halfH;
    this.cam.updateProjectionMatrix();
  }

  focus(target, focusDist) {
    // Move camera to orbit around world target, keeping iso angle.
    this.target = target.clone();
    this.focusDist = focusDist || this.camDist;
  }

  update(dt) {
    // subtle camera shake / smoothing could go here. Camera follows pan offset.
    const t = this.target || new THREE.Vector3(0, 0, 0);
    const d = this.focusDist !== undefined ? this.focusDist : this.camDist;
    this.cam.position.set(t.x + d, t.y + d, t.z + d);
    this.cam.lookAt(t);
  }

  setZoom(z) {
    this.camDist = THREE.MathUtils.clamp(z, 16, 90);
    this.resize();
  }

  // Raycast a click against the flat ground plane (y=0).
  // Returns {x, z} world ground coords or null.
  groundPick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.cam);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pt = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(plane, pt)) return { x: pt.x, z: pt.z };
    return null;
  }

  // Picked tile from ground coords (unit grid starting at origin).
  pickTile(clientX, clientY) {
    const g = this.groundPick(clientX, clientY);
    if (!g) return null;
    return { tx: Math.floor(g.x), ty: Math.floor(g.z) };
  }

  render() {
    this.update(0);
    this.renderer.render(this.scene, this.cam);
  }
}