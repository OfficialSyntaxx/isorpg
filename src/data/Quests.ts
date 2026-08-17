// Static quest definitions: title, giver, stage objectives and rewards.
//
// Data only — QuestSystem owns the stage machine, the scene markers and the
// toasts; this file owns what a quest *is*. Splitting them means the journal
// panel, the reward grant and the wiki all read the same rows, so a reward can
// never be described one way and paid another.

export type QuestStage = "INTRO" | "FIND_KEY" | "OPEN_DOOR" | "DEFEAT_BRUTE" | "DONE";

/** One item paid on completion. `max` present = an inclusive random range. */
export interface QuestReward {
  itemId: string;
  min: number;
  max: number;
}

export interface QuestDef {
  id: string;
  title: string;
  givenBy: string;
  /** One-line summary for the wiki and the journal's collapsed state. */
  summary: string;
  /** Objective text per stage. Quests without stages use `objective`. */
  objectives?: Partial<Record<QuestStage, string>>;
  objective?: string;
  /** Objective text once complete. */
  doneText: string;
  rewards: QuestReward[];
}

export const QUESTS: QuestDef[] = [
  {
    id: "caves",
    title: "The Caves of the Deep",
    givenBy: "Eldric the Cartographer",
    summary: "Descend into the dungeon beneath the deep wilds, unlock the sealed door and put down the Cave Brute guarding the exit.",
    objectives: {
      INTRO: "Talk to Eldric by the deep-wilds door to begin.",
      FIND_KEY: "Find the Iron Key in a side chamber of the Caves.",
      OPEN_DOOR: "Use the Iron Key on the door locked shut.",
      DEFEAT_BRUTE: "Slay the Cave Brute that guards the exit portal.",
    },
    doneText: "The treasure of the Caves is claimed.",
    rewards: [
      { itemId: "coins", min: 50, max: 100 },
      { itemId: "iron_ore", min: 4, max: 8 },
      { itemId: "cooked_trout", min: 2, max: 2 },
    ],
  },
  {
    id: "ogre",
    title: "The Surveyor's Errand",
    givenBy: "Eldric the Cartographer",
    summary: "A Forest Ogre has moved into the deep woods and the surveyor cannot finish his map while it prowls. Kill it.",
    objective: "Slay the Forest Ogre that prowls the deep woods.",
    doneText: "The Forest Ogre is slain — the deep woods can breathe again.",
    rewards: [
      { itemId: "coins", min: 250, max: 250 },
      { itemId: "steel_bar", min: 1, max: 1 },
      { itemId: "cooked_trout", min: 3, max: 3 },
    ],
  },
];

export function questById(id: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === id);
}

/** Human-readable reward list, e.g. "50–100 coins, 4–8 iron ore, 2 cooked trout". */
export function rewardText(q: QuestDef, nameOf: (id: string) => string): string {
  return q.rewards
    .map((r) => `${r.min === r.max ? r.min : `${r.min}–${r.max}`} × ${nameOf(r.itemId)}`)
    .join(", ");
}
