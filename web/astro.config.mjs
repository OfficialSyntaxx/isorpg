// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import site from "./site.config.json" with { type: "json" };

// The canonical origin. Null until the custom domain exists (blueprint D4 /
// Phase 9), in which case the current netlify.app URL is canonical.
const origin = site.origin.canonical ?? site.origin.current;

export default defineConfig({
  site: origin,

  // Blueprint §9.3. Needs `site` set, which it is above — without an absolute
  // origin the sitemap would emit relative URLs and be ignored.
  integrations: [sitemap()],

  // Static output. There is no server: Netlify is a dumb host receiving a
  // finished directory (docs/CI_DEPLOY.md), and scripts/compose-site.cjs merges
  // this dist with the Unity build before deploy.
  output: "static",

  build: {
    // Emit /about/index.html rather than /about.html so paths work without
    // relying on host-level extension stripping.
    format: "directory",

    // Never inline stylesheets or scripts into the HTML.
    //
    // This is a SECURITY decision, not a performance one. Blueprint §8.1 bans
    // 'unsafe-inline' in script-src, and the alternative — pinning a sha256
    // hash per inline block — goes stale the moment the code changes and
    // eventually ships a blocked script and a broken page. External files need
    // only 'self', which never goes stale.
    //
    // The cost is a few extra requests; they are same-origin, cached, and tiny.
    inlineStylesheets: "never",
  },

  // Astro's own accessibility audits during dev. Blueprint §9.2 makes a11y a
  // gate, and catching it in dev is cheaper than catching it in Lighthouse.
  devToolbar: { enabled: true },

  vite: {
    build: {
      // Same reasoning as build.inlineStylesheets above: keep everything in
      // external files so `script-src 'self'` is sufficient.
      assetsInlineLimit: 0,
      // Blueprint §9.1 budgets first-load JS at <60 KB gzip. Warn well before
      // that so a heavy import is noticed when it lands, not at audit time.
      chunkSizeWarningLimit: 150,
    },
  },
});
