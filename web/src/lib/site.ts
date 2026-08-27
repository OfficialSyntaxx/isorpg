/**
 * Typed access to web/site.config.json.
 *
 * Everything outward-facing — the canonical origin, the socials, the contact
 * addresses, where the game is mounted — comes from here so there is one place
 * to fill in as those things become real. Nothing in src/ should hardcode a URL.
 */
import raw from "../../site.config.json" with { type: "json" };

export interface SocialLink {
  id: string;
  label: string;
  /** null means "not set up yet". Never rendered — see `socials()`. */
  url: string | null;
  cta: string;
}

/**
 * Links that actually exist.
 *
 * A `null` url is a placeholder, and rendering it as a `#` anchor would put a
 * dead link in the footer of every page. Filtering here means an unfilled
 * config produces a missing link rather than a broken one, and filling the url
 * in is the only step needed to make it appear.
 */
export function socials(): (SocialLink & { url: string })[] {
  return (raw.social as SocialLink[]).filter(
    (s): s is SocialLink & { url: string } =>
      typeof s.url === "string" && s.url.length > 0,
  );
}

/** The canonical origin, with the current URL standing in until a domain exists. */
export const origin: string = raw.origin.canonical ?? raw.origin.current;

/** Where the Unity build is mounted. Must match compose-site.cjs `--prefix`. */
export const gamePrefix: string = raw.paths.gamePrefix;

/** Absolute path to the game, for links and canonical URLs. */
export const gamePath = `/${gamePrefix}/`;

export const site = {
  name: raw.name,
  tagline: raw.tagline,
  shortDescription: raw.shortDescription,
} as const;

/**
 * Absolute URL for a site-relative path. Open Graph and canonical tags require
 * absolute URLs — a relative one is silently ignored by most crawlers.
 */
export function absolute(pathname: string): string {
  return new URL(pathname, origin).href;
}
