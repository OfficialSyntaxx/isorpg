// 8-way A* pathfinding over the tile grid, with dynamic obstacle support (GDD §4.C).

export interface GridLike {
  isWalkable(x: number, y: number): boolean;
  width: number;
  height: number;
}

interface Node {
  x: number;
  y: number;
  g: number;
  f: number;
  parent: Node | null;
}

// 8 directions, diagonal costs sqrt(2)
const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  // Octile distance for 8-way movement
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

/**
 * A* search. Returns an array of tiles [x, y] from the FIRST step after `start`
 * to `goal` inclusive (i.e. excludes the starting tile), or null if unreachable.
 * When `allowAdjacentIfBlocked` and the goal itself is blocked, it will path to
 * the nearest walkable neighbour so the player can stand by a resource.
 */
export function findPath(
  grid: GridLike,
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  allowAdjacentIfBlocked = false
): [number, number][] | null {
  if (!grid.isWalkable(startX, startY)) return null;
  const goalWalkable = grid.isWalkable(goalX, goalY);

  if (!goalWalkable && !allowAdjacentIfBlocked) return null;

  const open: Node[] = [];
  const closed = new Set<string>();
  const nodes = new Map<string, Node>();
  const key = (x: number, y: number) => `${x},${y}`;

  const start: Node = { x: startX, y: startY, g: 0, f: heuristic(startX, startY, goalX, goalY), parent: null };
  open.push(start);
  nodes.set(key(startX, startY), start);

  // Best walkable tile found near the goal, used when goal itself is blocked.
  let bestNear: Node | null = null;
  let bestDist = Infinity;

  const isGoal = (n: Node) => n.x === goalX && n.y === goalY;

  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!;
    closed.add(key(cur.x, cur.y));

    if (isGoal(cur)) return reconstruct(cur);

    // Track nearest walkable node to the (possibly blocked) goal
    const d = heuristic(cur.x, cur.y, goalX, goalY);
    if (d < bestDist && (grid.isWalkable(cur.x, cur.y) || isGoal(cur))) {
      bestDist = d;
      bestNear = cur;
    }

    for (const [dx, dy, cost] of DIRS) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
      if (!grid.isWalkable(nx, ny)) continue;
      // Prevent corner-cutting through diagonal walls
      if (dx !== 0 && dy !== 0) {
        if (!grid.isWalkable(cur.x + dx, cur.y) || !grid.isWalkable(cur.x, cur.y + dy)) continue;
      }
      const k = key(nx, ny);
      if (closed.has(k)) continue;
      const g = cur.g + cost;
      const existing = nodes.get(k);
      if (!existing) {
        const node: Node = { x: nx, y: ny, g, f: g + heuristic(nx, ny, goalX, goalY), parent: cur };
        nodes.set(k, node);
        open.push(node);
      } else if (g < existing.g) {
        existing.g = g;
        existing.f = g + heuristic(nx, ny, goalX, goalY);
        existing.parent = cur;
      }
    }
  }

  // Fallback: if goal blocked, return path to nearest walkable neighbour.
  if (allowAdjacentIfBlocked && bestNear && bestNear !== start) return reconstruct(bestNear);
  return null;
}

function reconstruct(end: Node): [number, number][] {
  const path: [number, number][] = [];
  let cur: Node | null = end;
  while (cur && cur.parent) {
    path.unshift([cur.x, cur.y]);
    cur = cur.parent;
  }
  return path;
}