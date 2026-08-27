/**
 * /devlog/rss.xml — RSS 2.0 feed of the 30 most recent devlog entries.
 *
 * A static build-time route (an Astro endpoint, not a page), so this ships as
 * a plain file like every other route on this static site.
 */
import type { APIRoute } from "astro";
import { recent } from "../../lib/devlog";
import { site, absolute } from "../../lib/site";

/** Escapes the five XML special characters. Several titles contain `&` and `—`. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const GET: APIRoute = () => {
  const entries = recent(30);
  const feedUrl = absolute("/devlog/rss.xml");
  const siteUrl = absolute("/devlog/");
  const lastBuildDate = new Date().toUTCString();

  const items = entries
    .map((entry) => {
      const link = absolute(`/devlog/${entry.slug}/`);
      // Month-only entries carry no day, so a real Date would guess one;
      // pubDate needs a concrete instant, so fall back to the 1st in that case.
      const pubDate = new Date(
        entry.precise ? `${entry.date}T00:00:00Z` : `${entry.date}-01T00:00:00Z`,
      ).toUTCString();
      return `    <item>
      <title>${escapeXml(entry.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(entry.summary)}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(site.name)} — Devlog</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${escapeXml(site.tagline)}</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml" },
  });
};
