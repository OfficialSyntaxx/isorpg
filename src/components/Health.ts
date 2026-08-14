// Pure data: hitpoints.

export interface HealthComponent {
  hp: number;
  maxHp: number;
}

export function createHealth(maxHp = 100): HealthComponent {
  return { hp: maxHp, maxHp };
}