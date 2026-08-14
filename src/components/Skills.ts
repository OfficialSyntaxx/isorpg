// Pure data: per-skill XP and per-item mastery XP.
import type { SkillId } from "../data/Skills";
import { SKILL_IDS } from "../data/Skills";

export interface MasteryMap {
  [itemKey: string]: number; // mastery xp per item key
}

export interface SkillState {
  xp: number;
  mastery: MasteryMap;
}

export type SkillComponent = Record<SkillId, SkillState>;

export function createSkillComponent(): SkillComponent {
  const c = {} as SkillComponent;
  for (const id of SKILL_IDS) {
    c[id] = { xp: 0, mastery: {} };
  }
  return c;
}

export function addMasteryXp(skills: SkillComponent, skillId: SkillId, itemKey: string, xp: number) {
  const m = skills[skillId].mastery;
  m[itemKey] = (m[itemKey] || 0) + xp;
}

export function masteryLevel(xp: number): number {
  // Mastery mirrors the same OSRS curve, also capped at 99.
  let total = 0;
  for (let n = 1; n < 99; n++) {
    total += Math.floor(n + 300 * Math.pow(2, n / 7));
    if (xp < Math.floor(total / 4)) return n;
  }
  return 99;
}