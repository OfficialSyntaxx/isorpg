// ------------------------------------------------------------------
// Hero: procedural low-poly humanoid + smooth tile-to-tile movement.
// Hero walks a path produced by the A* pathfinder, bobbing body/limbs
// as it goes, then fires an onArrive callback (start skilling / combat
// / building interaction).
// ------------------------------------------------------------------
import * as THREE from 'three';

export class Hero {
  constructor(scene) {
    this.scene = scene;
    this.path = [];            // list of [tx,ty]
    this.pathIndex = 0;
    this.moving = false;
    this.onArrive = null;      // callback when last waypoint reached
    this.speed = 3.2;          // tiles / second
    this.tx = 36; this.ty = 36; // current tile (settlement center)
    this.busy = false;         // currently performing an action (skilling/combat)
    this.buildMesh();
  }

  tileDistance(tx, ty) { return Math.max(Math.abs(this.tx - tx), Math.abs(this.ty - ty)); }

  buildMesh() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a7cc6, roughness: 0.7 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xe9c08c, roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.9 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.2), mat);
    body.position.y = 0.62;

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), skin);
    head.position.y = 0.98;

    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.04), dark);
    eye.position.set(0.03, 0.98, 0.12);

    // limbs
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.09), mat); armL.position.set(-0.23, 0.55, 0);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.09), mat); armR.position.set(0.23, 0.55, 0);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.1), dark); legL.position.set(-0.09, 0.2, 0);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.1), dark); legR.position.set(0.09, 0.2, 0);

    // weapon (wooden sword on back)
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x9c7442, roughness: 0.6 }));
    sword.position.set(-0.2, 0.72, -0.12); sword.rotation.y = 0.2;

    g.add(body, head, eye, armL, armR, legL, legR, sword);
    // cast shadow
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    this.group = g;
    this.armL = armL; this.armR = armR; this.legL = legL; this.legR = legR; this.body = body;
    this.scene.add(g);
    this.place(this.tx, this.ty);
  }

  place(tx, ty) {
    this.tx = tx; this.ty = ty;
    this.group.position.set(tx + 0.5, 0.02, ty + 0.5);
  }

  // World XY screen angle facing:
  faceToward(tx, ty) {
    const dx = (tx + 0.5) - this.group.position.x;
    const dz = (ty + 0.5) - this.group.position.z;
    if (Math.abs(dx) < 0.001 && Math.abs(dz) < 0.001) return;
    // rotate so "front" (+z) faces movement
    const ang = Math.atan2(dz, dx);
    this.group.rotation.y = -ang + Math.PI / 2;
  }

  goToTile(tx, ty, onArrive, path) {
    if (this.moving) {
      // clear current movement
    }
    this.path = path || [[tx, ty]];
    // ensure first step is current tile
    if (this.path[0][0] === this.tx && this.path[0][1] === this.ty) this.path.shift();
    this.pathIndex = 0;
    this.moving = this.path.length > 0;
    this.onArrive = onArrive;
    this.busy = false;
    if (!this.moving) {
      this.faceToward(tx, ty);
      if (onArrive) onArrive(this);
    }
  }

  stop() { this.moving = false; this.path = []; }

  update(dt, time) {
    if (!this.moving) {
      // gentle idle sway
      this.group.position.y = 0.02;
      this.armL.rotation.x = 0; this.armR.rotation.x = 0;
      this.legL.rotation.x = 0; this.legR.rotation.x = 0;
      return;
    }
    const steps = this.speed * dt;
    let remaining = steps;
    while (remaining > 0 && this.moving) {
      const [gx, gy] = this.path[this.pathIndex];
      const worldX = gx + 0.5, worldZ = gy + 0.5;
      const dx = worldX - this.group.position.x;
      const dz = worldZ - this.group.position.z;
      const dist = Math.hypot(dx, dz);
      this.faceToward(gx, gy);
      if (dist <= remaining) {
        this.group.position.x = worldX; this.group.position.z = worldZ;
        this.tx = gx; this.ty = gy;
        remaining -= dist;
        this.pathIndex++;
        if (this.pathIndex >= this.path.length) {
          this.moving = false;
          const cb = this.onArrive; this.onArrive = null;
          if (cb) cb(this);
          break;
        }
      } else {
        this.group.position.x += (dx / dist) * remaining;
        this.group.position.z += (dz / dist) * remaining;
        remaining = 0;
      }
    }
    // walk bob + limb swing
    const bob = Math.sin(time * 14) * 0.03;
    this.group.position.y = 0.02 + Math.abs(bob);
    const swing = Math.sin(time * 14) * 0.6;
    this.armL.rotation.x = swing; this.armR.rotation.x = -swing;
    this.legL.rotation.x = -swing; this.legR.rotation.x = swing;
  }
}