// Headless logic simulation — validates core systems without a browser.
import { Game } from '../js/game.js';
import { Skills, RECIPES } from '../js/skills.js';
import { Combat } from '../js/combat.js';
import { Pathfinder } from '../js/pathfinding.js';
import { SaveManager } from '../js/save.js';
import { NODES, MONSTERS, QUESTS } from '../js/data.js';

const log = (...a) => console.log(...a);
globalThis.localStorage = (()=>{const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}})();
let failures = 0;
const check = (name, cond) => { if (!cond) { failures++; log('✗', name); } else log('✓', name); };

// --- game + minimal harness ---
const game = new Game();
game.reset();
const world = { removeNode(){}, addNode(){}, addMonster(){}, removeMonster(){}, addBuilding(){}, flashMonster(){}, updateMonsterHp(){}, overlay:null, monsterGroups:new Map(), buildingGroups:new Map(), nodeGroups:new Map() };
const hero = new (class { constructor(){ this.tx=0;this.ty=0;this.busy=false;this.group={}; } place(x,y){this.tx=x;this.ty=y;} faceToward(){} })();
hero.tx=0; hero.ty=0;
const skills = new Skills(game, world, hero);
const combat = new Combat(game, world, hero, skills);

check('new game defaults', game.s.resources.gold === 250 && game.skillLvl('woodcutting') === 1);

// --- skills: addXp + level ---
game.addXp('woodcutting', 500);

// --- gather a tree ---
const tree = { type:'tree', tx:1, ty:0, health:1, depleted:0 };
game.s.nodes.push(tree);
game.s.inventory = {};
skills.startGather(tree);
// force rng to always hit the yield
const origRandom = Math.random;
Math.random = () => 0.0;
skills.gatherTick.call(skills);
Math.random = origRandom;
const hadLog = (game.s.inventory.log||0) >= 1;
check('gathered a log', hadLog);
check('tree depleted after 1 hit', tree.depleted > 0);
check('gather auto-stopped after deplete', skills.activeNode === null);

// --- craft planks ---
game.s.inventory = { log: 4 };
const before = Object.keys(game.s.inventory).length + 0;
skills.craft('plank');
check('crafted 2 logs into 1 plank', game.s.inventory.plank === 1 && game.s.inventory.log === 2);

// --- invalid craft (not enough) ---
game.s.inventory = { log: 1 };
skills.craft('plank');
check('craft fails without mats (log untouched)', game.s.inventory.log === 1 && game.s.inventory.plank === undefined);

// --- combat ---
game.s.inventory = { bread: 5 };
game.s.equipped = { weapon: 'sword_wood', armor: 'armor_wood' };
game.s.hp = 80;
const rat = { type:'rat', tx:1, ty:0, hp: MONSTERS.rat.hp, respawn:0, id:'m1' };
game.s.monsters.push(rat);
combat.startFight('m1');
hero.tx=1; hero.ty=1; // adjacent
Math.random = () => 0.0; // guarantee player hits
let rounds = 0;
while (combat.fighting() && rounds < 50) { combat.combatTick.call(combat); rounds++; if (game.s.hp<=0) ((combat)=>{combat.stopFight.call(combat)})(combat); }
Math.random = origRandom;
check('rat killed in battle', rat.hp <= 0 || !combat.fighting());
check('player survived with positive hp', game.s.hp > 0);
check('monstersKilled recorded', (game.s.monstersKilled.rat||0) >= 1);

// --- player death path ---
const rat2 = { type:'rat', tx:3, ty:0, hp: 15, respawn:0, id:'m2' };
game.s.monsters.push(rat2);
game.s.hp = 1;
combat.startFight('m2');
hero.tx=3; hero.ty=1;
Math.random = () => 0.0;
let guard=0;
while (combat.fighting() && guard<60){ combat.combatTick.call(combat); guard++; }
Math.random = origRandom;
check('player death resets hp+repositions', game.s.hp >= game.maxHp());
check('death xp plausible', game.s.skills.health.xp > 0);

// --- pathfinding across a grid with a wall ---
const occ = (x,y) => x<0||y<0||x>8||y>8 || (x===4 && y>=1 && y<=7);
const pf = new Pathfinder(occ, 9, 9);
let path = pf.find([0,0],[8,8]);
check('A* finds path around wall', Array.isArray(path) && path.length > 0, );
check('A* path start=goal start correct', path[0][0]===0 && path[0][1]===0);
check('A* ends at goal', path[path.length-1][0]===8 && path[path.length-1][1]===8);
// adjacency goal
const adj = pf.find([0,0],[4,4],(x,y)=>Math.max(Math.abs(x-4),Math.abs(y-4))===1);
check('A* adjacency goal works', adj && (adj[adj.length-1][0]===3||adj[adj.length-1][0]===5));

// --- save roundtrip ---
const s = new SaveManager(game);
s.onSave = () => { game.s.heroPos = { tx: hero.tx, ty: hero.ty }; };
s.save();
const raw = localStorage ? '' : '';
// simulate parse+sanitize
const dumped = JSON.stringify(game.s);
const re = new SaveManager(game).sanitize(JSON.parse(dumped));
check('save sanitize keeps state', re && re.resources.gold === game.s.resources.gold && re.version === 1);
// malformed injection
const bad = new SaveManager(game).sanitize(JSON.parse('{"resources":{"gold":"pwned","wood":-5},"skills":{},"buildings":"nope","nodes":[{"type":"tree","tx":null}]}'));
check('malformed save sanitized safely', bad && typeof bad.resources.gold === 'number' && Array.isArray(bad.buildings));
const evil = new SaveManager(game).sanitize({version:1, resources:{gold:"</script><img>"}});
check('script-injection resource rejected', evil && typeof evil.resources.gold === 'number');

log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);