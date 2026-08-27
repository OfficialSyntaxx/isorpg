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

export interface Analytics {
  /** "plausible" | "umami" — or null, which disables analytics entirely. */
  provider: string | null;
  /** The site/website identifier the provider expects. */
  domain: string | null;
}

/**
 * Analytics configuration.
 *
 * Blueprint §10: cookieless and privacy-preserving only. Deliberately NOT
 * Google Analytics — it needs a cookie banner, weakens `connect-src`, and buys
 * nothing this project needs.
 *
 * `provider: null` means no snippet is emitted at all, which is the current
 * state. Turning it on also requires adding the provider's host to `script-src`
 * and `connect-src` in the CSP (blueprint §8.1, Phase 7) — a snippet with no
 * CSP entry is a blocked request and a silently broken integration.
 */
export const analytics: Analytics = {
  provider: raw.analytics.provider,
  domain: raw.analytics.domain,
};

/** Whether a snippet should be rendered at all. */
export function analyticsEnabled(): boolean {
  return typeof analytics.provider === "string" && typeof analytics.domain === "string";
}

/**
 * Absolute URL for a site-relative path. Open Graph and canonical tags require
 * absolute URLs — a relative one is silently ignored by most crawlers.
 */
export function absolute(pathname: string): string {
  return new URL(pathname, origin).href;
}
