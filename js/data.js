// ------------------------------------------------------------------
// Static game data: skills, items, buildings, monsters, nodes, quests.
// All tuning constants live here so balance is easy to adjust.
// ------------------------------------------------------------------

export const TICK_MS = 600;            // base logic tick
export const MAX_IDLE_HOURS = 8;       // hard offline cap (Town Hall raises it)

export const SKILLS = {
  mining:        { name: 'Mining',        ico: '⛏️', tag: 'gather' },
  smithing:      { name: 'Smithing',      ico: '🔨', tag: 'craft ' },
  woodcutting:   { name: 'Woodcutting',   ico: '🪓', tag: 'gather' },
  fishing:       { name: 'Fishing',       ico: '🎣', tag: 'gather' },
  carpentry:     { name: 'Carpentry',     ico: '🪚', tag: 'craft ' },
  attack:        { name: 'Attack',        ico: '⚔️', tag: 'combat' },
  defense:       { name: 'Defense',       ico: '🛡️', tag: 'combat' },
  health:        { name: 'Health',        ico: '❤️', tag: 'combat' },
  construction:  { name: 'Construction',  ico: '🧱', tag: 'build ' },
  alchemy:       { name: 'Aetherurgy',    ico: '🧪', tag: 'craft ' }
};

export const SKILL_ORDER = ['woodcutting','mining','fishing','carpentry','smithing','construction','alchemy','attack','defense','health'];

// XP needed to go from level -> level+1
export function xpToNext(level) {
  return Math.floor(40 * Math.pow(level, 1.75)) + 20;
}
export function levelFromXp(xp) {
  let lv = 1, need = xpToNext(lv), rem = xp;
  while (rem >= need && lv < 99) { rem -= need; lv++; need = xpToNext(lv); }
  return lv;
}

export const ITEMS = {
  // id: { name, ico, type, desc, eat?, eq? }
  log:        { name: 'Log',          ico: '🪵', type: 'mat',    desc: 'Raw tree log. Used in carpentry.' },
  plank:      { name: 'Plank',        ico: '🪵', type: 'mat',    desc: 'Processed timber for building.' },
  bark:       { name: 'Bark',         ico: '🌿', type: 'mat',    desc: 'Fibrous bark. Alchemy base.' },
  stone:      { name: 'Stone',        ico: '🪨', type: 'mat',    desc: 'Quarried rock. Core building mat.' },
  ore_copper: { name: 'Copper ore',   ico: '⛏️', type: 'ore',    desc: 'Smelt into bronze.' },
  ore_iron:   { name: 'Iron ore',     ico: '⛏️', type: 'ore',    desc: 'Smelt into iron bars.' },
  ore_gold:   { name: 'Gold ore',     ico: '✨', type: 'ore',    desc: 'Smelt into gold bars.' },
  bar_bronze: { name: 'Bronze bar',   ico: '🟫', type: 'bar',    desc: 'Smelted bronze.' },
  bar_iron:   { name: 'Iron bar',     ico: '⬜', type: 'bar',    desc: 'Smelted iron.' },
  bar_gold:   { name: 'Gold bar',     ico: '🟨', type: 'bar',    desc: 'Smelted gold.' },
  bread:      { name: 'Bread',        ico: '🍞', type: 'food',   heal: 12, desc: 'Heals 12 HP.' },
  fish:       { name: 'Cooked fish',  ico: '🐟', type: 'food',   heal: 22, desc: 'Heals 22 HP.' },
  potion:     { name: 'Aether potion', ico: '🧪', type: 'food',  heal: 40, desc: 'Heals 40 HP.' },
  bones:      { name: 'Bones',        ico: '🦴', type: 'mat',    desc: 'Crush for alchemy.' },
  hide:       { name: 'Wolf hide',    ico: '🟤', type: 'mat',    desc: 'Leather from beasts.' },
  gem:        { name: 'Gem',          ico: '💎', type: 'mat',    desc: 'Rare shiny treasure.' },
  sword_wood: { name: 'Wood sword',   ico: '🗡️', type: 'weapon', atk: 4,  desc: '+4 Attack. Basic slash.' },
  sword_iron: { name: 'Iron sword',   ico: '⚔️', type: 'weapon', atk: 11, desc: '+11 Attack.' },
  sword_gold: { name: 'Aether blade', ico: '✨', type: 'weapon', atk: 20, desc: '+20 Attack. Pulses with magic.' },
  armor_wood: { name: 'Wood armor',   ico: '🛡️', type: 'armor',  def: 5,  desc: '+5 Defense. Splintery but real.' },
  armor_iron: { name: 'Iron armor',   ico: '🛡️', type: 'armor',  def: 12, desc: '+12 Defense.' },
  armor_gold: { name: 'Aether plate', ico: '🥋', type: 'armor', def: 22, desc: '+22 Defense.' },
};

export const BUILDINGS = {
  town_center: {
    name: 'Town Center', ico: '🏛️', size: 3,
    cost: { wood: 50, stone: 40, gold: 100 }, lvl: { construction: 1 },
    desc: 'The heart of your settlement. Raises offline idle cap.',
    build: 'Built on the map by default.',
    unique: true
  },
  house: {
    name: 'House', ico: '🏠', size: 2,
    cost: { wood: 30, stone: 10 }, lvl: { construction: 1 },
    desc: '+1 offline/hour cap, holds idle workers.',
    storage: { wood: 50, stone: 50 }
  },
  lumber_mill: {
    name: 'Lumber Mill', ico: '🪚', size: 2,
    cost: { wood: 60, gold: 40 }, lvl: { construction: 3, woodcutting: 10 },
    desc: 'Converts logs → planks and grants passive wood.',
    passive: { wood: 0.8 }
  },
  stone_mason: {
    name: 'Stone Mason', ico: '🧱', size: 2,
    cost: { stone: 50, wood: 20, gold: 30 }, lvl: { construction: 3, mining: 10 },
    desc: 'Grinds stone from nothing + passive stone income.',
    passive: { stone: 0.6 }
  },
  smithy: {
    name: 'Smithy', ico: '⚒️', size: 2,
    cost: { stone: 60, wood: 40 }, lvl: { construction: 5, smithing: 10 },
    desc: 'Skill boost: smithing XP +20%.',
    buff: { smithing: 1.2 }
  },
  farm: {
    name: 'Farm', ico: '🌾', size: 3,
    cost: { wood: 30, gold: 20 }, lvl: { construction: 2 },
    desc: 'Passive food income over time.',
    passive: { food: 1.2 }
  },
  storage: {
    name: 'Storage', ico: '📦', size: 2,
    cost: { wood: 60, stone: 30 }, lvl: { construction: 4 },
    desc: 'Raises maximum resource capacity.',
    cap: { add: 500 }
  },
  workshop: {
    name: 'Workshop', ico: '🛠️', size: 2,
    cost: { wood: 40, stone: 40 }, lvl: { construction: 4, carpentry: 8 },
    desc: 'Crafting bench. Carpenter XP +20%.',
    buff: { carpentry: 1.2 }
  },
  alchemy_lab: {
    name: 'Alchemy Lab', ico: '⚗️', size: 2,
    cost: { stone: 80, wood: 40, gold: 150 }, lvl: { construction: 8, alchemy: 15 },
    desc: 'Brew aether potions and alchemy XP boost.',
    buff: { alchemy: 1.35 }
  },
  barracks: {
    name: 'Barracks', ico: '🎖️', size: 3,
    cost: { stone: 100, wood: 80, gold: 200 }, lvl: { construction: 7, attack: 15 },
    desc: 'Combat training. +25% combat XP.',
    buff: { attack: 1.25, defense: 1.25 }
  }
};

export const NODES = {
  tree: {
    name: 'Tree', ico: '🌲', skill: 'woodcutting', count: 1,
    yields: [ { item: 'log', min: 1, max: 2, p: 1 } ],
    respawn: 12
  },
  yew: {
    name: 'Yew Tree', ico: '🌳', skill: 'woodcutting', count: 1, lvl: 15,
    yields: [ { item: 'log', min: 2, max: 4, p: 1 }, { item: 'bark', p: 0.4 } ],
    respawn: 22
  },
  rock_copper: {
    name: 'Copper Rocks', ico: '⛰️', skill: 'mining', count: 2, lvl: 1,
    yields: [ { item: 'ore_copper', min: 1, max: 2, p: 1 }, { item: 'stone', p: 0.4 } ],
    respawn: 14
  },
  rock_iron: {
    name: 'Iron Rocks', ico: '⛰️', skill: 'mining', count: 2, lvl: 15,
    yields: [ { item: 'ore_iron', min: 1, max: 2, p: 1 }, { item: 'stone', p: 0.5 } ],
    respawn: 18
  },
  rock_gold: {
    name: 'Gold Vein', ico: '⛰️', skill: 'mining', count: 2, lvl: 30,
    yields: [ { item: 'ore_gold', p: 1 }, { item: 'gem', p: 0.15 } ],
    respawn: 30
  },
  fishing: {
    name: 'Fishing Spot', ico: '🌊', skill: 'fishing', count: 0,
    yields: [ { item: 'fish', p: 1 } ],
    respawn: 0
  }
};

export const MONSTERS = {
  rat:    { name: 'Giant Rat',  ico: '🐀', hp: 15,  atk: 3,  def: 1,  xp: 10, lvl: 1,  gold: [1,4],  drops: [ ['hide',0.2], ['bones',0.5] ] },
  wolf:   { name: 'Wolf',       ico: '🐺', hp: 32,  atk: 6,  def: 3,  xp: 20, lvl: 4,  gold: [3,8],  drops: [ ['hide',0.55], ['bones',0.5] ] },
  goblin: { name: 'Goblin',     ico: '👺', hp: 42,  atk: 8,  def: 5,  xp: 30, lvl: 8,  gold: [5,12], drops: [ ['bones',0.6], ['sword_wood',0.15] ] },
  skeleton:{ name: 'Skeleton',  ico: '💀', hp: 65,  atk: 11, def: 8,  xp: 45, lvl: 13, gold: [8,18], drops: [ ['bones',0.9], ['sword_iron',0.12] ] },
  zombie: { name: 'Zombie',     ico: '🧟', hp: 80,  atk: 13, def: 7,  xp: 60, lvl: 18, gold: [10,22], drops: [ ['hide',0.4], ['potion',0.1] ] },
  bandit: { name: 'Bandit',     ico: '🥷', hp: 95,  atk: 15, def: 11, xp: 75, lvl: 22, gold: [15,35], drops: [ ['sword_iron',0.2], ['armor_iron',0.1], ['potion',0.2] ] },
  dark_mage: { name: 'Dark Mage', ico: '🧙', hp: 120, atk: 18, def: 13, xp: 95, lvl: 26, gold: [20,45], drops: [ ['ore_gold',0.3], ['potion',0.3], ['sword_gold',0.03] ] },
  dragon: { name: 'Elder Wyrm', ico: '🐉', hp: 400, atk: 26, def: 20, xp: 300, lvl: 40, gold: [60,120], drops: [ ['gem',0.5], ['armor_gold',0.15], ['sword_gold',0.15] ] }
};

export const QUESTS = [
  { id: 'q1', name: 'First Cut',      desc: 'Cut 5 logs.',        type: 'item',  item: 'log',  target: 5 },
  { id: 'q2', name: 'Bedrock',        desc: 'Mine 5 copper ore.', type: 'item',  item: 'ore_copper', target: 5 },
  { id: 'q3', name: 'Woodcutter',     desc: 'Reach Woodcutting lv 5.', type: 'skill', skill: 'woodcutting', target: 5 },
  { id: 'q4', name: 'Home Builder',   desc: 'Build a House.',      type: 'build', building: 'house' },
  { id: 'q5', name: 'Rat Catcher',    desc: 'Slay 3 giant rats.', type: 'kill',  monster: 'rat', target: 3 },
  { id: 'q6', name: 'Blacksmith',     desc: 'Smelt an iron bar.', type: 'item',  item: 'bar_iron', target: 1 },
  { id: 'q7', name: 'Explorer',       desc: 'Reach the wilderness tile at (6, 50).', type: 'tile', tx: 6, ty: 50 },
  { id: 'q8', name: 'Aether Adept',   desc: 'Reach Aetherurgy lv 12.', type: 'skill', skill: 'alchemy', target: 12 }
];

export function buildingUnlockLevel(b){ return b.lvl.construction; }