// P6.4: achievements — pure predicates over player state; a MetaSystem
// evaluates them each tick and pops the ones that flip.
import type { GameState } from "../state/GameState";
import { levelFromXp } from "./XPTable";
import { WORLD_SIZE } from "../world/Grid";

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  test: (s: GameState) => boolean;
}

function totalKills(s: GameState): number {
  return Object.values(s.player.meta.kills).reduce((a, b) => a + b, 0);
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_kill", name: "First Blood", desc: "Slay your first monster.", test: (s) => totalKills(s) >= 1 },
  { id: "rat_hunter", name: "Rat Hunter", desc: "Slay 10 giant rats.", test: (s) => (s.player.meta.kills["giant_rat"] ?? 0) >= 10 },
  { id: "woodsman", name: "Heart of the Forest", desc: "Slay 5 dire wolves.", test: (s) => (s.player.meta.kills["dire_wolf"] ?? 0) >= 5 },
  { id: "boss_slayer", name: "Boss Breaker", desc: "Slay the Forest Ogre or the Cave Brute.", test: (s) => (s.player.meta.kills["forest_ogre"] ?? 0) + (s.player.meta.kills["cave_brute"] ?? 0) >= 1 },
  { id: "skiller_10", name: "Tenacious", desc: "Reach level 10 in any skill.", test: (s) => Object.values(s.player.skills).some((sk) => levelFromXp(sk.xp) >= 10) },
  { id: "collector_10", name: "Pack Rat", desc: "Collect 10 different items.", test: (s) => s.collectionLog.size >= 10 },
  { id: "quest_done", name: "Eldric's Student", desc: "Complete any quest.", test: (s) => s.player.journal.length >= 1 },
  { id: "explorer_25", name: "Pathfinder", desc: "Explore a quarter of the world.", test: (s) => s.player.map.explored.length / (WORLD_SIZE * WORLD_SIZE) >= 0.25 },
];