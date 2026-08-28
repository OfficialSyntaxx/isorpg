#!/usr/bin/env node
/**
 * QC: /save never sends your save anywhere.
 *
 * WHY THIS EXISTS
 * The page tells a visitor to hand over something personal and promises it does
 * not leave their machine. Every other privacy claim on this site is about what
 * the site does not do; this one is about what it does with a file the reader
 * gave it, which is a different order of promise.
 *
 * A promise about privacy that nothing verifies is a promise about intentions.
 * So this drives a real browser, drops a real save, and fails if a single
 * request is made after the page has loaded.
 *
 * TWO ASSERTIONS, AND ONLY ONE OF THEM IS WORTH ANYTHING ON ITS OWN
 * Reading the source for `fetch`, `sendBeacon` and friends is cheap and catches
 * the honest mistake. It is also defeatable by anyone who wants to defeat it —
 * `window["fe"+"tch"]` sails past. The network observation is the real check:
 * it does not care how a request was spelled, only that none happened.
 *
 * It also asserts the version this page claims to read matches the game's
 * SAVE_VERSION, because a reader pinned to a format the game no longer writes
 * would refuse every real save while looking perfectly healthy.
 */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { requireBrowser } = require("./lib/browser.cjs");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "web/dist");
const PAGE = path.join(ROOT, "web/src/pages/save.astro");
const GAME_STATE = path.join(ROOT, "src/state/GameState.ts");

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? "  [" + detail + "]" : ""}`);
  }
};

if (!fs.existsSync(DIST)) {
  console.log(`SKIP  save-privacy: ${path.relative(ROOT, DIST)} not built.`);
  process.exit(0);
}

/* ------------------------------------------------------------------ *
 * 1. The version this page reads is the version the game writes.
 * ------------------------------------------------------------------ */
{
  const page = fs.readFileSync(PAGE, "utf8");
  const claimed = [...page.matchAll(/const SUPPORTED = "([^"]+)"/g)].map(
    (m) => m[1],
  );
  const game = fs.existsSync(GAME_STATE)
    ? (fs
        .readFileSync(GAME_STATE, "utf8")
        .match(/SAVE_VERSION\s*=\s*"([^"]+)"/) || [])[1]
    : null;

  ok(
    "the page declares the save format it reads",
    claimed.length === 2 && claimed[0] === claimed[1],
    `found ${claimed.length} declarations: ${claimed.join(", ")}`,
  );
  ok(
    "that format is the one the game writes",
    Boolean(game) && claimed[0] === game,
    `page reads ${claimed[0] ?? "?"}, game writes ${game ?? "?"}`,
  );
}

/* ------------------------------------------------------------------ *
 * 2. No transport in the source. Cheap, and not sufficient — see below.
 * ------------------------------------------------------------------ */
{
  const page = fs.readFileSync(PAGE, "utf8");
  // Strip comments: this file's own documentation names every one of these in
  // the course of explaining that they are absent.
  const code = page
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  const banned = [
    "fetch(",
    "XMLHttpRequest",
    "sendBeacon",
    "WebSocket",
    "EventSource",
    "navigator.clipboard",
    "import(",
  ];
  const found = banned.filter((b) => code.includes(b));
  ok(
    "no transport appears in the page source",
    found.length === 0,
    found.join(", "),
  );
}

/* ------------------------------------------------------------------ *
 * 3. The one that matters: nothing goes out when a save is dropped.
 * ------------------------------------------------------------------ */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath.endsWith("/")) urlPath += "index.html";
  const file = path.join(DIST, urlPath);
  if (
    !file.startsWith(DIST) ||
    !fs.existsSync(file) ||
    fs.statSync(file).isDirectory()
  ) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
  });
  fs.createReadStream(file).pipe(res);
});

/** A save shaped like the sanitiser's output, with recognisable numbers. */
const SAVE = {
  version: "1.1.0",
  timestamp: 1756400000000,
  player: {
    name: "Testwalker",
    position: { x: 10, y: 10 },
    stats: { hp: 61, maxHp: 61 },
    skills: {
      attack: { xp: 41171, mastery: {} },
      strength: { xp: 22406, mastery: {} },
      defense: { xp: 13363, mastery: {} },
      hitpoints: { xp: 37224, mastery: {} },
      woodcutting: { xp: 1210421, mastery: {} },
      mining: { xp: 302288, mastery: {} },
      fishing: { xp: 13034431, mastery: {} },
      cooking: { xp: 668051, mastery: {} },
      smithing: { xp: 101333, mastery: {} },
      carpentry: { xp: 83014, mastery: {} },
      construction: { xp: 37224, mastery: {} },
      farming: { xp: 4470, mastery: {} },
    },
    inventory: { slots: [], storageCap: 100 },
    equipped: {},
    journal: [],
    meta: {
      kills: { dire_wolf: 412, bog_husk: 87, cave_slasher: 13 },
      achievements: ["first_axe", "first_house", "ninety_nine"],
      counters: {},
    },
    clue: null,
    resolve: 100,
    activeBuff: null,
    specialEnergy: 100,
  },
  town: {
    buildings: [{ id: "b_1" }, { id: "b_2" }, { id: "b_3" }],
    labour: {},
    farm: {},
  },
  collectionLog: { unlocked: ["logs", "oak_logs", "coal", "raw_shrimp"] },
  settings: { autoEatPct: 40, attackStyle: "accurate" },
  map: { discovered: [], fastTravel: false, explored: [] },
  clock: { minute: 480, day: 37 },
};

const PORT = 4461;

(async () => {
  const { chromium, executablePath } = requireBrowser("save-privacy");
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  const browser = await chromium.launch({
    executablePath,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
  });

  await page.goto(`http://localhost:${PORT}/save/`, { waitUntil: "load" });
  await page.waitForTimeout(700);

  /*
   * WHAT COUNTS AS A VIOLATION, AND WHY IT IS NOT SIMPLY "ANY REQUEST".
   *
   * The first version of this asserted zero requests after load, and it failed —
   * on `jetbrains-mono-latin-600-normal.woff2`. Rendering the results puts text
   * on the page in a weight that had not been used yet, so the browser fetched
   * the face. That is the site loading its own font, from its own origin, and
   * calling it a privacy breach would have been a false alarm that eventually
   * gets silenced rather than understood.
   *
   * So the rule is precise about what actually matters: nothing may leave this
   * origin, nothing may carry a body, and nothing same-origin may be anything
   * other than a static asset. A save cannot be exfiltrated without breaking at
   * least one of those, and a lazily-fetched font breaks none.
   */
  const origin = `http://localhost:${PORT}`;
  const STATIC = /\/_astro\/|\.(?:woff2?|css|js|png|jpe?g|webp|avif|svg|ico)$/;
  const outbound = [];
  page.on("request", (r) => {
    const url = r.url();
    const why = !url.startsWith(origin)
      ? "left the origin"
      : r.method() !== "GET"
        ? `method ${r.method()}`
        : r.postData()
          ? "carried a body"
          : !STATIC.test(url)
            ? "not a static asset"
            : null;
    if (why) outbound.push(`${r.method()} ${url} — ${why}`);
  });

  // Paste rather than a synthesised file drop: it exercises the same read()
  // path and does not depend on DataTransfer support in the driver.
  await page.evaluate((json) => {
    const area = document.querySelector("[data-paste]");
    const button = document.querySelector("[data-read]");
    area.value = json;
    button.click();
  }, JSON.stringify(SAVE));

  await page.waitForTimeout(1200);

  const rendered = await page.evaluate(() => {
    const cells = [...document.querySelectorAll("[data-summary] dd")].map((d) =>
      d.textContent.trim(),
    );
    const rows = [...document.querySelectorAll("[data-skills] tr")].map((tr) =>
      [...tr.children].map((td) => td.textContent.trim()),
    );
    return {
      hidden: document.querySelector("[data-result]").hidden,
      cells,
      rows,
      status: document.querySelector("[data-status]").textContent.trim(),
      kills: [...document.querySelectorAll("[data-kills] tr")].length,
    };
  });

  ok(
    "nothing carrying data leaves the page while a save is read",
    outbound.length === 0,
    outbound.join(" | "),
  );

  ok("the save renders", rendered.hidden === false, rendered.status);

  // 13,034,431 is exactly level 99, so a correct reader shows 99 and "done".
  const fishing = rendered.rows.find((r) => r[0] === "Fishing");
  ok(
    "a maxed skill reads as level 99 with nothing left",
    Boolean(fishing) && fishing[1] === "99" && fishing[3] === "done",
    fishing ? fishing.join(" / ") : "no Fishing row",
  );

  ok(
    "the summary counts what is in the file",
    rendered.cells.includes("Testwalker") &&
      rendered.cells.includes("37") &&
      rendered.cells.includes("512") &&
      rendered.cells.includes("3") &&
      rendered.cells.includes("4 items"),
    rendered.cells.join(" · "),
  );

  ok(
    "every creature killed is listed",
    rendered.kills === 3,
    `${rendered.kills} rows`,
  );

  // A newer format must be refused, not guessed at.
  await page.evaluate(() => {
    document.querySelector("[data-paste]").value = "";
  });
  await page.evaluate(
    (json) => {
      const area = document.querySelector("[data-paste]");
      area.value = json;
      document.querySelector("[data-read]").click();
    },
    JSON.stringify({ ...SAVE, version: "9.9.9" }),
  );
  await page.waitForTimeout(500);
  const refused = await page.evaluate(() => ({
    hidden: document.querySelector("[data-result]").hidden,
    status: document.querySelector("[data-status]").textContent.trim(),
  }));
  ok(
    "a save from a newer format is refused rather than guessed at",
    refused.hidden === true && /9\.9\.9/.test(refused.status),
    refused.status,
  );

  await browser.close();
  await new Promise((r) => server.close(r));
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("verify-save-privacy: " + ((e && e.stack) || e));
  try {
    server.close();
  } catch {}
  process.exit(1);
});
