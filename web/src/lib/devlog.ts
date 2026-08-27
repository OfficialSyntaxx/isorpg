/**
 * Reads UPDATES.md at build time and turns it into devlog entries.
 *
 * UPDATES.md stays the authoring surface — nobody writes devlog content inside
 * web/. One source, one truth, the same discipline the root ci.yml already
 * enforces for its other generated files.
 *
 * STRICTNESS
 * A heading that matches neither known shape throws and fails the build. A
 * devlog that silently drops entries is worse than one that refuses to build:
 * the failure would be invisible, and the missing entry would look like it was
 * never written.
 *
 * The file genuinely uses two entry shapes, verified by enumerating all 101
 * "## " headings present:
 *   "## 2026-08-26 · Title"   (55) — a dated entry
 *   "## 2026-08 · Title"      (45) — a month-scoped entry, no specific day
 *   one undated section heading  (1) — see KNOWN_SECTION_HEADINGS
 * Both entry shapes are legitimate; only the day-level precision differs.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Finds UPDATES.md by walking up from the working directory.
 *
 * Deliberately not resolved from `import.meta.url`: this module is bundled
 * before it runs, so at build time that URL points at the bundle's location in
 * .astro/ rather than at src/lib/, and the relative hop lands nowhere. Walking
 * up from cwd works whether the build is invoked from web/ or from the repo
 * root, and fails loudly rather than silently producing an empty devlog.
 */
function findUpdates(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "UPDATES.md");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not find UPDATES.md walking up from ${process.cwd()}. ` +
      `The devlog section reads it at build time; without it the section would ` +
      `render empty, so the build stops instead.`,
  );
}

const UPDATES = findUpdates();

export interface DevlogEntry {
  /** "2026-08-26" or "2026-08". Sorts correctly as a string, see `recent()`. */
  date: string;
  /** True when the heading carried a day, not just a month. */
  precise: boolean;
  title: string;
  slug: string;
  /** First paragraph of the entry body, flattened to one line. */
  summary: string;
  /** Position in the file. Later means newer — the log appends. */
  index: number;
}

const HEADING = /^##\s+(\d{4}-\d{2}(?:-\d{2})?)\s+·\s+(.+?)\s*$/;

/**
 * Headings that are section titles rather than dated log entries.
 *
 * Named individually on purpose. The obvious alternative — skipping any heading
 * without a date — would mean a mistyped date ("2026-8-26", "2026-08-26 -
 * Title") silently vanishes from the devlog instead of failing the build, which
 * is precisely the failure this parser exists to prevent. An exact allow-list
 * keeps that guarantee: a new undated heading stops the build, and whoever
 * added it decides deliberately whether it is an entry or a section.
 */
const KNOWN_SECTION_HEADINGS = new Set(["## Phase 5 — Dungeons"]);

function slugify(date: string, title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${date}-${base}`;
}

/**
 * Flattens the entry's first bullet or paragraph into a single sentence-ish
 * line. Markdown bullets wrap across lines, so joining before trimming matters.
 */
function firstParagraph(body: string[]): string {
  const lines: string[] = [];
  for (const raw of body) {
    const line = raw.trim();
    if (line === "") {
      if (lines.length > 0) break;
      continue;
    }
    if (line.startsWith("#")) break;
    lines.push(line.replace(/^[-*]\s+/, ""));
  }
  return lines
    .join(" ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

let cache: DevlogEntry[] | null = null;

export function all(): DevlogEntry[] {
  if (cache) return cache;

  const text = fs.readFileSync(UPDATES, "utf8");
  const lines = text.split("\n");

  const entries: DevlogEntry[] = [];
  let current: { date: string; precise: boolean; title: string; body: string[] } | null =
    null;

  const flush = () => {
    if (!current) return;
    entries.push({
      date: current.date,
      precise: current.precise,
      title: current.title,
      slug: slugify(current.date, current.title),
      summary: firstParagraph(current.body),
      index: entries.length,
    });
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      const m = HEADING.exec(line);
      if (!m && KNOWN_SECTION_HEADINGS.has(line.trimEnd())) {
        // Not an entry. Keep the line with the current entry's body so no
        // content is lost; firstParagraph() stops at "#" so it cannot leak
        // into a summary.
        if (current) current.body.push(line);
        continue;
      }
      if (!m) {
        throw new Error(
          `UPDATES.md: unrecognised entry heading ${JSON.stringify(line)}.\n` +
            `Expected "## YYYY-MM-DD · Title" or "## YYYY-MM · Title".\n` +
            `Fix the heading rather than loosening this parser — a devlog that ` +
            `silently drops entries is worse than a build that stops.`,
        );
      }
      flush();
      const date = m[1] as string;
      current = { date, precise: date.length === 10, title: m[2] as string, body: [] };
      continue;
    }
    if (current) current.body.push(line);
  }
  flush();

  cache = entries;
  return entries;
}

/**
 * The newest entries first.
 *
 * Sorted by date string descending, which also puts a dated entry above a
 * month-only one in the same month ("2026-08-26" > "2026-08" lexicographically,
 * same prefix but longer). Ties break on file position, because the log appends
 * — later in the file is newer.
 */
export function recent(count: number): DevlogEntry[] {
  return [...all()]
    .sort((a, b) => (a.date === b.date ? b.index - a.index : a.date < b.date ? 1 : -1))
    .slice(0, count);
}

/** Human-readable date. Month-only entries render without a day. */
export function formatDate(entry: DevlogEntry): string {
  const [y, m, d] = entry.date.split("-");
  const month = new Date(`${y}-${m}-01T00:00:00Z`).toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  return entry.precise ? `${month} ${Number(d)}, ${y}` : `${month} ${y}`;
}
