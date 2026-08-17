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

export const MASTERY_MAX = 99;

/**
 * Mastery XP needed for a level: a simple triangular curve, 1 XP per unit
 * gathered or crafted.
 *
 * Mastery used to reuse the skill XP curve, which was wrong by a factor of
 * thousands. That curve is designed to span a whole skill's lifetime, but
 * mastery is tracked *per item* — one of eleven resources — so mastery 99 on
 * normal logs came out at 8,146 hours of chopping, and mastery 50 at 63. The
 * speed bonus scales with level/99, so in practice mastery did nothing.
 *
 * This curve puts mastery 99 on the cheapest resource at ~12 h and on the most
 * expensive at ~26 h: a real long-term goal rather than an unreachable one, and
 * cheap resources master faster, which is the right incentive since they are
 * worth less.
 */
export function masteryXpForLevel(level: number): number {
  const l = Math.max(1, Math.min(MASTERY_MAX, Math.floor(level)));
  return (l * (l - 1)) / 2;
}

export function masteryLevel(xp: number): number {
  if (!(xp > 0)) return 1;
  // Invert level*(level-1)/2 <= xp.
  const level = Math.floor((1 + Math.sqrt(1 + 8 * xp)) / 2);
  return Math.max(1, Math.min(MASTERY_MAX, level));
}

/** Progress through the current mastery level, 0..1 (1 at the cap). */
export function masteryProgress(xp: number): number {
  const level = masteryLevel(xp);
  if (level >= MASTERY_MAX) return 1;
  const from = masteryXpForLevel(level);
  const to = masteryXpForLevel(level + 1);
  return to > from ? Math.min(1, Math.max(0, (xp - from) / (to - from))) : 1;
}