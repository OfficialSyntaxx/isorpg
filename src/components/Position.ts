// Pure data: grid + world position. No logic.

export interface PositionComponent {
  // Grid coords (tile space)
  gx: number;
  gy: number;
  // Interpolated world coords (smooth movement)
  wx: number;
  wz: number;
  // Movement speed in tiles/second
  speed: number;
  // Current heading in radians (for potential rotation-based models)
  facing: number;
}

export function createPosition(gx: number, gy: number, speed = 4): PositionComponent {
  return { gx, gy, wx: gx, wz: gy, speed, facing: 0 };
}