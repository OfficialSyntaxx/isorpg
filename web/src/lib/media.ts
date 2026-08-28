/**
 * The media manifest: every image this site publishes, with its provenance.
 *
 * WHY THIS FILE EXISTS
 * A screenshot of the Unity *editor* — hierarchy panel, inspector, a console
 * printing internal object names and a local bridge port — shipped on /press
 * under alt text describing a settlement plaza. Two failures at once: internals
 * published to the public web, and a screen-reader user told about a picture
 * that was not there. Nothing caught it, because scripts/verify-no-internals.cjs
 * reads the *text* of built pages and cannot see inside a PNG.
 *
 * So images stop being an ad-hoc import in whichever page wants one. Every
 * published image is declared here with a `kind`, and scripts/verify-media.cjs
 * fails the build if any page imports an image that is not in this list. The
 * manifest is the thing a human reviews; the scanner is the thing that stops
 * the list being bypassed.
 *
 * WHY `kind` IS REQUIRED AND SURFACED
 * Press pages get reproduced. If concept art runs in an article as a
 * screenshot, that is a misrepresentation the project caused, not the
 * journalist. `kind` is rendered as a visible badge wherever an image appears
 * (see MediaFigure.astro) — it cannot be declared and then quietly dropped.
 *
 *   capture     — pixels from a real, running build of the game.
 *   concept     — art that describes intent. The game does not look like this.
 *   art         — a real project asset shown outside the game (a kit render).
 *   placeholder — nothing to show yet, and the page says so.
 *
 * ADDING REAL FOOTAGE LATER
 * When a capture exists, add an entry with `kind: "capture"` and swap the id at
 * the use site. Nothing else changes: the badge, the caption and the checks all
 * follow the manifest. That is the whole point of the placeholder entries — the
 * layout that will hold the footage is built and tested now, against a slot
 * that is honest about being empty.
 */
import type { ImageMetadata } from "astro";

import roadShot from "../../../docs/screenshots/hearthvale-east-road-local-props-2026-08-25.png";
import overworld from "../../../docs/concepts/isoperia-overworld-layout-v1.png";
import direWolf from "../../../assets/concepts/dire_wolf.png";
import frostImp from "../../../assets/concepts/frost_imp.png";
import bogHusk from "../../../assets/concepts/bog_husk.png";
import caveSlasher from "../../../assets/concepts/cave_slasher.png";

export type Provenance = "capture" | "concept" | "art" | "placeholder";

interface Base {
  /** Stable key used at call sites, so swapping the file is a one-line edit. */
  id: string;
  /** What is in the picture. Never what the picture is *for*. */
  alt: string;
  /** Shown under the image. May repeat nothing from the alt text. */
  caption: string;
  kind: Provenance;
}

export interface MediaImage extends Base {
  kind: Exclude<Provenance, "placeholder">;
  src: ImageMetadata;
  /** ISO date the image was captured or authored, for the press record. */
  dated: string;
}

export interface MediaPlaceholder extends Base {
  kind: "placeholder";
  /** What will replace this, stated plainly. Rendered to the visitor. */
  expects: string;
  /**
   * Aspect ratio of the slot, so reserving space costs no layout shift.
   *
   * A closed set rather than a free string: the content security policy forbids
   * inline style attributes, so the ratio is applied by a stylesheet rule
   * matching this value. A ratio with no rule would render as a collapsed box.
   */
  ratio: "16 / 9" | "4 / 3" | "1 / 1";
}

export type Media = MediaImage | MediaPlaceholder;

/**
 * The published set.
 *
 * Provenance notes are deliberately blunt. If a line here would embarrass the
 * project when quoted back, the image should not ship.
 */
export const media = {
  "hearthvale-east-road": {
    id: "hearthvale-east-road",
    kind: "capture",
    src: roadShot,
    dated: "2026-08-25",
    alt: "Cottages with teal roofs either side of a stone road out of a settlement, a lit lantern on a post, a supply crate on the verge, and villagers around a fountain in the distance.",
    caption: "Hearthvale, looking east along the road",
  },

  "overworld-layout": {
    id: "overworld-layout",
    kind: "concept",
    src: overworld,
    dated: "2026-08-20",
    alt: "Illustrated top-down map of an island: a walled settlement around a fountain at the centre, pine forest and a standing-stone circle northwest, snow-capped mountains and a mine northeast, a dead-tree bog southwest, ploughed fields and a windmill southeast, and a violet-lit ruin on the eastern shore.",
    caption: "The mainland layout the world is built against",
  },

  /*
   * The bestiary.
   *
   * These are `art`, not `concept`, and the distinction was checked rather than
   * assumed. Each one has a matching entry in the combat export and a matching
   * .glb in the Unity build under the same id, committed on the same day as the
   * render — so these are pictures of the creatures a player actually meets,
   * photographed outside the game rather than drawn before it. The folder they
   * live in is called "concepts", which is exactly the kind of thing that would
   * have made this the wrong label if nobody looked.
   *
   * They share a deliberate look: a single figure on a pale studio backdrop.
   * The site presents them on a light plate in both themes for that reason —
   * see the `.threat__plate` note in WorldMap.astro.
   */
  "dire-wolf": {
    id: "dire-wolf",
    kind: "art",
    src: direWolf,
    dated: "2026-08-24",
    alt: "A faceted low-polygon wolf in slate grey and white, snarling, head low and shoulders raised, with orange eyes.",
    caption: "Dire Wolf",
  },

  "frost-imp": {
    id: "frost-imp",
    kind: "art",
    src: frostImp,
    dated: "2026-08-24",
    alt: "A small pale-blue imp studded with translucent ice shards, with long ears, cyan eyes and a wide grin.",
    caption: "Frost Imp",
  },

  "bog-husk": {
    id: "bog-husk",
    kind: "art",
    src: bogHusk,
    dated: "2026-08-24",
    alt: "A hunched humanoid of brown bark and green moss, trailing roots from its face and limbs, with two glowing yellow eyes.",
    caption: "Bog Husk",
  },

  "cave-slasher": {
    id: "cave-slasher",
    kind: "art",
    src: caveSlasher,
    dated: "2026-08-24",
    alt: "A broad rock creature in dark teal and grey, its shoulders armoured in slabs, with pale slit eyes and long pale claws on both hands.",
    caption: "Cave Slasher",
  },

  /*
   * The gameplay slot.
   *
   * There is no footage worth publishing yet, and a page that pretends
   * otherwise — a stock loop, a blurred still, a "coming soon" plate stretched
   * to fill the space — is the thing this manifest exists to prevent. The slot
   * reserves its own space and says what it is waiting for. When a capture
   * lands, this entry is replaced by a MediaImage and every page using it
   * updates.
   */
  "gameplay-loop": {
    id: "gameplay-loop",
    kind: "placeholder",
    alt: "",
    caption: "Gameplay capture",
    expects:
      "A continuous capture of one loop — gather, craft, build — from a playable build. It will land here when the loop is worth watching end to end.",
    ratio: "16 / 9",
  },
} as const satisfies Record<string, Media>;

export type MediaId = keyof typeof media;

/** The badge text shown on every published image. */
export const provenanceLabel: Record<Provenance, string> = {
  capture: "In-game capture",
  concept: "Concept art",
  art: "Project asset",
  placeholder: "Not captured yet",
};

/**
 * The one-line explanation behind each badge, used as its title/description so
 * the distinction survives for a reader who does not already know the jargon.
 */
export const provenanceNote: Record<Provenance, string> = {
  capture: "Pixels from a running build of the game.",
  concept: "Art describing intent. The game does not look like this.",
  art: "A real project asset, shown outside the game.",
  placeholder: "Nothing has been captured for this slot yet.",
};

export function get<K extends MediaId>(id: K): (typeof media)[K] {
  return media[id];
}
