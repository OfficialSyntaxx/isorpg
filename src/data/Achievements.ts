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
  // P6.4-polish: Phase-7 systems now feed their own achievements.
  { id: "merchant", name: "First Purchase", desc: "Buy something from the town market.", test: (s) => (s.player.meta.counters["shop_bought"] ?? 0) >= 1 },
  { id: "hawker", name: "Junk Trader", desc: "Sell 20 items to the town market.", test: (s) => (s.player.meta.counters["shop_sold"] ?? 0) >= 20 },
  { id: "foreman", name: "Foreman", desc: "Give three villagers a job.", test: (s) => (s.player.meta.counters["labour_assigns"] ?? 0) >= 3 },
  { id: "quartermaster", name: "Quartermaster", desc: "Collect 50 items from the village stock.", test: (s) => (s.player.meta.counters["labour_collected"] ?? 0) >= 50 },
  { id: "spelunker", name: "Spelunker", desc: "Descend to dungeon floor 2.", test: (s) => (s.player.meta.counters["floors_descended"] ?? 0) >= 1 },
  // P7.9: the market economy feeds its own milestones.
  { id: "mogul", name: "Mogul", desc: "Bank 2,000 coins from market sales.", test: (s) => (s.player.meta.counters["shop_sold_value"] ?? 0) >= 2000 },
  { id: "flooder", name: "Market Flooder", desc: "Dump 100+ of the same item on the market.", test: (s) => Object.values(s.town.market.supply).some((v) => v >= 100) },
  { id: "regular", name: "Shop Regular", desc: "Buy 10 items from the town market.", test: (s) => (s.player.meta.counters["shop_bought"] ?? 0) >= 10 },
  { id: "treasure_hunter", name: "Treasure Hunter", desc: "Solve a clue scroll.", test: (s) => (s.player.meta.counters["clues_done"] ?? 0) >= 1 },
  { id: "cartographer", name: "Cartographer", desc: "Solve 10 clue scrolls.", test: (s) => (s.player.meta.counters["clues_done"] ?? 0) >= 10 },
  { id: "green_thumb", name: "Green Thumb", desc: "Reach Farming level 20.", test: (s) => levelFromXp(s.player.skills.farming.xp) >= 20 },
];