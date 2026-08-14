// ------------------------------------------------------------------
// Skills: resource gathering, crafting recipes, and the smoke that ties
// hero arrival -> skill action -> yields/XP -> node depletion/respawn.
// Operates on the Game state + WorldObjects meshes.
// ------------------------------------------------------------------
import { NODES, xpToNext } from './data.js';

export const RECIPES = [
  { id: 'plank',     name: 'Planks',       ico: '🪵', skill: 'carpentry', lvl: 1,  inputs: { log: 2 }, out: { plank: 1 }, xp: 25,  desc: '2 Logs → 1 Plank' },
  { id: 'bar_bronze',name: 'Bronze Bar',   ico: '🟫', skill: 'smithing',  lvl: 1,  inputs: { ore_copper: 2 }, out: { bar_bronze: 1 }, xp: 30, desc: '2 Copper ore → 1 Bronze bar' },
  { id: 'bar_iron',  name: 'Iron Bar',     ico: '⬜', skill: 'smithing',  lvl: 15, inputs: { ore_iron: 2 }, out: { bar_iron: 1 }, xp: 55,  desc: '2 Iron ore → 1 Iron bar' },
  { id: 'bar_gold',  name: 'Gold Bar',     ico: '🟨', skill: 'smithing',  lvl: 30, inputs: { ore_gold: 2 }, out: { bar_gold: 1 }, xp: 90,  desc: '2 Gold ore → 1 Gold bar' },
  { id: 'potion',    name: 'Aether Potion',ico: '🧪', skill: 'alchemy',   lvl: 8, inputs: { bark: 2, bones: 1 }, out: { potion: 1 }, xp: 70, desc: '2 Bark + 1 Bones → Potion' },
  { id: 'sword_wood',name: 'Wood Sword',   ico: '🗡️', skill: 'carpentry', lvl: 5, inputs: { plank: 3 }, out: { sword_wood: 1 }, xp: 60, desc: '3 Planks → Wood sword' },
  { id: 'sword_iron',name: 'Iron Sword',   ico: '⚔️', skill: 'smithing',  lvl: 20, inputs: { bar_iron: 3 }, out: { sword_iron: 1 }, xp: 120, desc: '3 Iron bars → Iron sword' },
  { id: 'sword_gold',name: 'Aether Blade', ico: '✨', skill: 'smithing',  lvl: 40, inputs: { bar_gold: 3, gem: 1 }, out: { sword_gold: 1 }, xp: 220, desc: '3 Gold bars + Gem → Aether blade' },
  { id: 'armor_wood',name: 'Wood Armor',   ico: '🛡️', skill: 'carpentry', lvl: 8, inputs: { plank: 5 }, out: { armor_wood: 1 }, xp: 90, desc: '5 Planks → Wood armor' },
  { id: 'armor_iron',name: 'Iron Armor',   ico: '🛡️', skill: 'smithing',  lvl: 25, inputs: { bar_iron: 5 }, out: { armor_iron: 1 }, xp: 150, desc: '5 Iron bars → Iron armor' },
  { id: 'armor_gold',name: 'Aether Plate', ico: '🥋', skill: 'smithing',  lvl: 45, inputs: { bar_gold: 5, gem: 1 }, out: { armor_gold: 1 }, xp: 260, desc: '5 Gold bars + Gem → Aether plate' },
  { id: 'bread',     name: 'Bread',        ico: '🍞', skill: 'woodcutting', lvl: 3, inputs: { log: 1 }, out: { bread: 2 }, xp: 15, desc: '1 Log → 2 Bread' }
];

export class Skills {
  constructor(game, world, hero) {
    this.game = game; this.world = world; this.hero = hero;
    this.activeNode = null; // current node ref being gathered
    this.placedNodeKey = null;
    this.recipes = RECIPES;
  }

  getNodeAt(tx, ty) {
    return this.game.s.nodes.find(n => n.tx === tx && n.ty === ty) || null;
  }

  // start continuous gathering on a node the hero has reached
  startGather(node) {
    if (!node) return;
    this.stopGather();
    this.activeNode = node;
    this.hero.busy = true;
    // face the node
    this.hero.faceToward(node.tx, node.ty);
  }

  stopGather() {
    this.activeNode = null;
    if (this.hero) this.hero.busy = false;
  }

  getNodeDef(node) { return NODES[node.type]; }

  // called on each game tick while gathering
  gatherTick() {
    if (!this.activeNode) return false;
    const node = this.activeNode;
    const def = this.getNodeDef(node);
    if (!def) { this.stopGather(); return false; }
    const skill = def.skill;
    const lvl = this.game.skillLvl(skill);
    const req = def.lvl || 1;
    // fail (too low level) -> small xp anyway
    const canWork = lvl >= req;
    if (!canWork) {
      this.game.addXp(skill, 2);
      const n = 5;
      if (node.chat !== undefined) this.game.toast(`Need ${skill} level ${req} for ${def.name}`, 'bad');
      // throttle the reminder
      if ((this.game.s.tick + node.tx) % 6 === 0) this.game.toast(`Raise ${skill.toUpperCase()} to ${req}`, 'bad');
      return true;
    }
    // everyone fishes from the same spot trigger
    if (node.type === 'fishing') {
      this.game.addItem('fish', 1);
      this.game.addXp('fishing', 2 + Math.floor(lvl * 0.4));
      return true;
    }
    for (const y of def.yields) {
      const got = Math.random() < (y.p !== undefined ? y.p : 1);
      if (!got) continue;
      const qty = y.min !== undefined ? y.min + Math.floor(Math.random() * (y.max - y.min + 1)) : 1;
      this.game.addItem(y.item, qty);
    }
    this.game.addXp(skill, (node.type === 'rock_gold' ? 90 : node.type === 'yew' || node.type === 'rock_iron' ? 45 : 20 + lvl));
    // deplete
    node.health = (node.health || 1) - 1;
    if (node.health <= 0) this.deplete(node);
    return true;
  }

  deplete(node) {
    const def = this.getNodeDef(node);
    if (!def || node.type === 'fishing') return;
    node.depleted = def.respawn || 10;
    node.health = def.count || 1;
    this.world.removeNode(node.tx, node.ty);
    this.stopGather();
  }

  // respawn countdown on tick
  respawnTick() {
    for (const node of this.game.s.nodes) {
      if (node.depleted > 0) {
        node.depleted--;
        if (node.depleted <= 0) {
          node.depleted = 0;
          // only respawn if still part of world (not re-created)
          if (!this.world.nodeGroups.has(node.tx + ',' + node.ty)) {
            this.world.addNode(node.type, node.tx, node.ty);
          }
        }
      }
    }
  }

  craft(id) {
    const r = this.recipes.find(x => x.id === id);
    if (!r) return;
    const lvl = this.game.skillLvl(r.skill);
    if (lvl < r.lvl) { this.game.toast(`Need ${r.skill} level ${r.lvl}`, 'bad'); return; }
    for (const [it, q] of Object.entries(r.inputs)) {
      if (!this.game.hasItem(it, q)) { this.game.toast('Missing materials', 'bad'); return; }
    }
    if (!this.canCarryYield(r.out)) { this.game.toast('Inventory full', 'bad'); return; }
    for (const [it, q] of Object.entries(r.inputs)) this.game.removeItem(it, q);
    for (const [it, q] of Object.entries(r.out)) this.game.addItem(it, q);
    const buffed = this.game.getBuff(r.skill);
    this.game.addXp(r.skill, r.xp * buffed);
    this.game.toast(`Crafted ${r.name}`, 'good');
  }

  canCarryYield(out) {
    const count = Object.keys(this.game.s.inventory).length;
    const space = 32;
    const newKeys = Object.keys(out).filter(k => !(k in this.game.s.inventory));
    return count + newKeys.length <= space;
  }

  // Buff-respected XP for combat
  buffSkill(skill, amt) { return Math.round(amt * this.game.getBuff(skill)); }

  // find nearest walkable tile adjacent to (tx,ty)
  adjacentTo(tx, ty) { return [tx, ty]; }
}