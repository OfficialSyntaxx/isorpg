// P6.4: the Meta page — killed-monster tallies, collection progress, skill
// levels and achievements. Evaluates achievement predicates each tick, pops a
// toast the moment one flips, and persists unlocked ids via GameState.
import type { GameState } from "../state/GameState";
import { ACHIEVEMENTS } from "../data/Achievements";
import { levelFromXp } from "../data/XPTable";
import { SKILLS, SKILL_IDS } from "../data/Skills";
import { MONSTERS } from "../data/Combat";

export interface MetaSnapshot {
  totalKills: number;
  kills: { id: string; name: string; count: number }[];
  collectionCount: number;
  skills: { id: string; name: string; level: number; xp: number; toNext: number }[];
  achieved: number; // count of unlocked achievements
  achievements: { id: string; name: string; desc: string; unlocked: boolean }[];
}

export class MetaSystem {
  constructor(
    private state: GameState,
    private toast: (msg: string, kind?: "info" | "success" | "error", ms?: number) => void
  ) {}

  /** Evaluate every locked achievement; toast + persist the newly flipped. */
  evaluate(): void {
    for (const a of ACHIEVEMENTS) {
      if (this.state.player.meta.achievements.includes(a.id)) continue;
      if (a.test(this.state)) {
        this.state.player.meta.achievements.push(a.id);
        this.toast?.(`🏆 Achievement: ${a.name} — ${a.desc}`, "success", 4800);
      }
    }
  }

  /** P6.4-polish: persist a counter event (sales, purchases, labour…). */
  bump(counter: string, n = 1): void {
    const c = this.state.player.meta.counters;
    c[counter] = (c[counter] ?? 0) + n;
  }

  /** Read-only view for the Meta panel. */
  snapshot(): MetaSnapshot {
    const p = this.state.player;
    const kills = Object.entries(p.meta.kills)
      .map(([id, count]) => ({ id, name: MONSTERS[id]?.name ?? id, count }))
      .sort((a, b) => b.count - a.count);
    const skills = SKILL_IDS.map((id) => {
      const sk = p.skills[id];
      const level = levelFromXp(sk.xp);
      return { id, name: SKILLS[id].name, level, xp: sk.xp, toNext: sk.xp };
    }).sort((a, b) => b.level - a.level);
    return {
      totalKills: kills.reduce((a, k) => a + k.count, 0),
      kills,
      collectionCount: this.state.collectionLog.size,
      skills,
      achieved: p.meta.achievements.length,
      achievements: ACHIEVEMENTS.map((a) => ({ id: a.id, name: a.name, desc: a.desc, unlocked: p.meta.achievements.includes(a.id) })),
    };
  }
}