// ------------------------------------------------------------------
// A* pathfinding over the 2D game grid. 8-directional movement with
// optional corner-cutting prevention, respecting walkability from the
// tilemap's occupancy grid + a target that can be occupied (interact).
// ------------------------------------------------------------------

const NEIGHBORS = [
  [1,0],[-1,0],[0,1],[0,-1],
  [1,1],[1,-1],[-1,1],[-1,-1]
];

export class Pathfinder {
  constructor(occupancy, width, height) {
    // occupancy: (tx,ty) => true if impassable
    this.occupancy = occupancy;
    this.w = width; this.h = height;
  }

  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }

  // Find path from start to goal. goalReached(tx,ty) -> bool allows
  // stopping before/at an occupied goal tile (interactions).
  find(start, goal, goalReached) {
    const key = (tx, ty) => tx + ',' + ty;
    const inb = (tx, ty) => this.inBounds(tx, ty);
    const occ = this.occupancy;

    const open = new Map(); // key -> {f,g,parent,node}
    const closed = new Set();
    const startKey = key(start[0], start[1]);
    open.set(startKey, { f: 0, g: 0, node: [start[0], start[1]], parent: null });

    // goal reached by predicate (default: exact tile)
    const re = goalReached || ((tx, ty) => tx === goal[0] && ty === goal[1]);

    let iterations = 0;
    const MAX_ITER = 20000;
    while (open.size && iterations++ < MAX_ITER) {
      let bestKey = null, bestF = Infinity;
      for (const [k, v] of open) { if (v.f < bestF) { bestF = v.f; bestKey = k; } }
      if (bestKey === null) break;
      const cur = open.get(bestKey);
      if (re(cur.node[0], cur.node[1])) {
        // reconstruct
        const path = [];
        let c = cur;
        while (c) { path.push(c.node); c = c.parent; }
        path.reverse();
        return path;
      }
      open.delete(bestKey);
      closed.add(bestKey);

      const [cx, cy] = cur.node;
      for (const [dx, dy] of NEIGHBORS) {
        const nx = cx + dx, ny = cy + dy;
        const nk = key(nx, ny);
        if (closed.has(nk)) continue;
        const nReached = re(nx, ny);
        if (!inb(nx, ny) && !nReached) continue;
        if (occ(nx, ny) && !nReached) continue;
        // diagonal corner-cut prevention
        if (dx !== 0 && dy !== 0) {
          if (!nReached && (occ(nx, cy) || occ(cx, ny))) continue;
        }
        const g = cur.g + (dx !== 0 && dy !== 0 ? 1.414 : 1);
        const h = this._heuristic(nx, ny, goal);
        const f = g + h;
        const existing = open.get(nk);
        if (existing && existing.g <= g) continue;
        open.set(nk, { f, g, node: [nx, ny], parent: cur });
      }
    }
    return null;
  }

  _heuristic(tx, ty, goal) {
    // octile distance
    const dx = Math.abs(tx - goal[0]), dy = Math.abs(ty - goal[1]);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  }
}