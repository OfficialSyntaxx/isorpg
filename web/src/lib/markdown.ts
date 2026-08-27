/**
 * Renders a root-level markdown document (ROADMAP.md, WIKI.md) to HTML at
 * build time.
 *
 * WHY RENDER RATHER THAN PARSE
 * Both source documents are prose with tables, not structured records:
 * ROADMAP.md mixes `##`/`###` phase headings with free-form sections
 * ("Execution order", "Standing work"), and WIKI.md's `###` headings name
 * item categories, monsters, and guide sections above 300+ table rows. A
 * bespoke data model would have to keep re-fighting that shape every time
 * either file is edited, so this module renders the markdown as-is with
 * `marked` and does light, purely structural post-processing: wrapping
 * tables so they scroll in their own box, and stamping stable ids on
 * headings so a table of contents can link to them.
 */
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";

/**
 * Locates a root-level file by walking up from the working directory.
 *
 * Deliberately not resolved from `import.meta.url`: this module is bundled
 * before it runs, so at build time that URL points at the bundle's location
 * rather than at src/lib/, and a relative hop from it lands nowhere. Walking
 * up from cwd works whether the build is invoked from web/ or from the repo
 * root (see web/src/lib/devlog.ts, which does the same for UPDATES.md).
 */
function findRootFile(name: string): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not find ${name} walking up from ${process.cwd()}. ` +
      `This page renders it at build time; without it the page would render ` +
      `empty, so the build stops instead.`,
  );
}

export interface Heading {
  /** 2 or 3, matching the source's h2/h3. */
  depth: number;
  text: string;
  id: string;
}

export interface RenderedDoc {
  html: string;
  headings: Heading[];
}

function slugify(text: string, seen: Map<string, number>): string {
  const base =
    text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-") || "section";
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

/** Strips the inline markup marked leaves inside a heading, for a plain-text id/TOC label. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Renders `name` (a file at the repo root) to HTML.
 *
 * - The document's own top-level `# ` heading is dropped: each page supplies
 *   its own single `<h1>`, and a second one from the source markdown would
 *   break that contract.
 * - Every `<table>` is wrapped in `.table-wrap.scroll-x` and gets the shared
 *   `.table` class, so wide tables scroll in their own box instead of the page.
 * - Every `<h2>`/`<h3>` gets a stable, de-duplicated `id`, returned alongside
 *   the html as a flat heading list for building a table of contents.
 */
export function renderDoc(name: string): RenderedDoc {
  const file = findRootFile(name);
  const source = fs.readFileSync(file, "utf8");

  const tokens = marked.lexer(source);
  // Drop the document's own top-level heading — the page provides its own h1.
  const filtered = tokens.filter((t) => !(t.type === "heading" && t.depth === 1));

  let html = marked.parser(filtered);

  html = html.replace(/<table>/g, '<table class="table">');
  html = html.replace(
    /<table class="table">[\s\S]*?<\/table>/g,
    (tableHtml) => `<div class="table-wrap scroll-x">${tableHtml}</div>`,
  );

  // Neither source document currently embeds an image, but guard anyway: an
  // <img> without alt is an accessibility bug, and one written relative to the
  // repo root (these files live outside web/) would 404 once served from
  // web/dist. Give every image a real alt and drop any src that is not
  // absolute or already web-rooted, rather than shipping a broken image.
  html = html.replace(/<img\b([^>]*)>/g, (_match, attrs: string) => {
    let a = attrs as string;
    if (!/\balt=/.test(a)) a += ' alt=""';
    const srcMatch = /\bsrc="([^"]*)"/.exec(a);
    if (srcMatch) {
      const src = srcMatch[1] ?? "";
      const usable =
        /^(https?:)?\/\//.test(src) || src.startsWith("/") || src.startsWith("data:");
      if (!usable) a = a.replace(/\bsrc="[^"]*"/, 'src=""');
    }
    return `<img${a}>`;
  });

  const headings: Heading[] = [];
  const seen = new Map<string, number>();
  html = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_match, depthStr, inner) => {
    const depth = Number(depthStr);
    const text = textOf(inner);
    const id = slugify(text, seen);
    headings.push({ depth, text, id });
    return `<h${depth} id="${id}">${inner}</h${depth}>`;
  });

  return { html, headings };
}
