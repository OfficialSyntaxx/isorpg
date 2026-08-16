// Sfx: tiny HTMLAudio one-shots for game events. No credits at runtime — the
// clips are static MP3s shipped in /public (copied into /game on the site).
// Autoplay is legal: the first sfx fires on a tap, which is a user gesture.
export type SfxName =
  | "chop"
  | "mine"
  | "fish"
  | "hit"
  | "hurt"
  | "levelup"
  | "coin"
  | "pickup"
  | "ui_click"
  | "chest_open"
  | "door_unlock"
  | "monster_squeak"
  | "monster_spawn"
  | "step"
  | "eat"
  | "drink"
  | "accept_quest"
  | "craft_smelt"
  | "craft_cook"
  | "craft_carpentry"
  | "quest_complete"
  | "boss_slam"
  | "victory";

const cache = new Map<string, HTMLAudioElement>();

export function play(name: SfxName): void {
  try {
    // Resolve relative to the served page so it works both at dev root and
    // under the /<game>/ iframe subpath (window.location.href already ends at
    // the directory the app is served from).
    const url = new URL(`sfx/${name}.mp3`, window.location.href).href;
    let a = cache.get(url);
    if (!a) {
      a = new Audio(url);
      a.volume = 0.5;
      a.preload = "auto";
      cache.set(url, a);
    }
    a.currentTime = 0;
    void a.play().catch(() => {
      /* audio can fail to start before a gesture; ignore */
    });
  } catch {
    /* never let audio break gameplay */
  }
}