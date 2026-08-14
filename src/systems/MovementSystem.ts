// MovementSystem: follows an A* waypoint path with smooth, frame-rate
// independent translation; drives the hero's walk/idle animation.
import type { PositionComponent } from "../components/Position";
import type { HeroModel } from "../generators/Character";

export interface MoveCallbacks {
  onArrive?: (finalX: number, finalY: number) => void;
  onStep?: (x: number, y: number) => void;
}

export class MovementSystem {
  private pos: PositionComponent;
  private model: HeroModel | null;
  private cb: MoveCallbacks = {};
  private path: { x: number; z: number }[] = [];
  private idx = 0;
  private moving = false;
  private current = { x: 0, z: 0 };

  constructor(pos: PositionComponent, model: HeroModel | null = null) {
    this.pos = pos;
    this.model = model;
    this.current = { x: pos.wx, z: pos.wz };
  }

  setCallbacks(cb: MoveCallbacks) { this.cb = cb; }

  get isMoving() { return this.moving; }
  get targetTile() { return this.path.length ? this.path[this.path.length - 1] : null; }

  /** Set a full grid path (excluding the player's own tile). */
  setPath(path: [number, number][]) {
    this.path = path.map(([x, y]) => ({ x, z: y }));
    this.idx = 0;
    this.moving = this.path.length > 0;
    if (this.model) this.model.setAction("walk");
  }

  stop() {
    this.path = [];
    this.moving = false;
    if (this.model) this.model.setAction("idle");
  }

  /** Move one step toward a tile; used for free WASD/joystick control. */
  moveToward(gx: number, gy: number) {
    const dx = gx - this.pos.gx;
    const dz = gy - this.pos.gy;
    const dist = Math.max(0.0001, Math.hypot(dx, dz));
    this.moving = true;
    this.path = [];
    this.idx = 0;
    this.current = { x: this.pos.wx, z: this.pos.wz };
    this.path.push({ x: this.pos.wx + (dx / dist) * dist, z: this.pos.wz + (dz / dist) * dist });
    if (this.model) this.model.setAction("walk");
  }

  update(dt: number) {
    const pos = this.pos;
    if (!this.moving) return;

    let target: { x: number; z: number };
    if (this.idx < this.path.length) {
      target = this.path[this.idx];
    } else {
      // arrived
      this.moving = false;
      pos.gx = Math.round(this.current.x);
      pos.gy = Math.round(this.current.z);
      pos.wx = this.current.x;
      pos.wz = this.current.z;
      if (this.model) this.model.setAction("idle");
      this.cb.onArrive?.(pos.gx, pos.gy);
      return;
    }

    const dx = target.x - this.current.x;
    const dz = target.z - this.current.z;
    const dist = Math.hypot(dx, dz);
    const step = pos.speed * dt;
    if (dist <= step) {
      this.current.x = target.x;
      this.current.z = target.z;
      pos.gx = Math.round(target.x);
      pos.gy = Math.round(target.z);
      this.cb.onStep?.(pos.gx, pos.gy);
      this.idx++;
    } else {
      this.current.x += (dx / dist) * step;
      this.current.z += (dz / dist) * step;
    }

    pos.wx = this.current.x;
    pos.wz = this.current.z;
    pos.facing = Math.atan2(dx, dz);
    this.animate(dt);
  }

  private animate(dt: number) {
    if (!this.model || !this.moving) return;
    const time = performance.now() / 1000;
    const swing = Math.sin(time * 10);
    this.model.legL.rotation.x = -swing * 0.6;
    this.model.legR.rotation.x = swing * 0.6;
    this.model.armR.rotation.x = swing * 0.4;
    this.model.bobAnchor.position.y = 0.62 + Math.abs(Math.sin(time * 10)) * 0.06;
    // Face travel direction (isometric yaw about vertical)
    this.model.group.rotation.y = -this.pos.facing;
  }

  /** Ensure the model's world transform mirrors the component every frame. */
  syncToModel() {
    if (!this.model) return;
    this.model.group.position.set(this.pos.wx, 0, this.pos.wz);
  }
}