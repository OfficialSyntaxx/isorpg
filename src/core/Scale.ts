// Canonical world scale. One place to tune how big things are relative to a tile.
//
// Everything used to normalise to 0.75 world units on a 1-unit tile grid, which
// made an adult shorter than the square they stand on — the single biggest reason
// the world read as a tabletop diorama rather than a place. Props were also
// planted at y = 0 while the terrain surface sits at y = GROUND_Y, so trees and
// rocks were buried up to the crown.
//
// Treat one tile as roughly 1.5 m (the OSRS convention) and size everything from
// that.

/** Tile edge length in world units. The grid maps 1 tile → 1 unit. */
export const TILE = 1;

/**
 * Y of the walkable terrain surface. Terrain tiles are 0.6-tall boxes centred at
 * y = 0.3 (for flat ground), so their top face is here. Anything standing on the
 * ground — actors, trees, rocks, buildings — belongs at this height.
 */
export const GROUND_Y = 0.6;

/**
 * Standing height of a humanoid actor, in tiles. At 1.25 a hero is slightly
 * taller than the tile is wide, which is what reads as "a person on a path"
 * rather than a figurine on a board.
 */
export const ACTOR_HEIGHT = 1.25;

/** Bosses and large monsters multiply ACTOR_HEIGHT by their own factor. */
export const MONSTER_SCALE: Record<string, number> = {
  skeleton: 1.1,
  cave_brute: 1.75,
  forest_ogre: 1.9,
};

/**
 * Trees stand well above head height — roughly 2.5× an actor. Applied as a
 * uniform group scale, so trunks thicken with height and keep their proportions.
 */
export const TREE_SCALE = 1.95;

/** Rocks and ore veins sit low: about knee-to-waist on an actor. */
export const ROCK_SCALE = 1.35;

/**
 * Buildings scale taller than they do wide, so a cottage clears an actor's head
 * without its footprint spilling into neighbouring tiles (base is 0.82 wide, so
 * 1.15 keeps it inside a 1-unit tile).
 */
export const BUILDING_HEIGHT_SCALE = 1.9;
export const BUILDING_WIDTH_SCALE = 1.15;
