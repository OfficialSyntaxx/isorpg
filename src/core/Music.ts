// Lightweight zone-aware music: one lazy looped <audio> per zone, crossfading
// to the target zone's track. No automation cost — the tracks are static files
// in /public (copied into /<game>/ on the site).
export type MusicZone = "town" | "wilds" | "dungeon" | null;

const tracks = new Map<string, HTMLAudioElement>();
const VOL = 0.45;
let current: MusicZone = null;

export function setMusicZone(z: MusicZone): void {
  if (z === current) return;
  current = z;
  // duck everything, then fade in the target (or nothing).
  for (const [k, a] of tracks) {
    a.volume = 0;
    if (k !== z) a.pause();
  }
  if (!z) return;
  try {
    let a = tracks.get(z);
    if (!a) {
      a = new Audio(new URL(`music/${z}.m4a`, window.location.href).href);
      a.loop = true;
      a.preload = "auto";
      a.volume = 0;
      tracks.set(z, a);
    }
    a.currentTime = 0;
    void a
      .play()
      .then(() => {
        a!.volume = VOL;
      })
      .catch(() => {
        /* not an error path — audio waits for the first user gesture */
      });
  } catch {
    /* keep silence */
  }
}

