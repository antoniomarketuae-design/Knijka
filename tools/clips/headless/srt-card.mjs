// srt-card.mjs — sit in a drill and photograph the TEACHING CARD carousel.
//
// Several of this lane's rows are about what the lesson SAYS, not where the
// furniture stands — B64 („the question states stopping out of nowhere, but
// why?") is answered by instruction 2 or it is not answered at all. The cards
// advance on the demonstration clock, so the only way to photograph a specific
// one is to watch for its text and shoot when it is on screen.
//
//   node srt-card.mjs --scenario sc-sp-harsh-brake --want спирка --for 90
//
// Logs every distinct card it sees (so „the copy never appears" is a finding
// with evidence) and writes a PNG for each.

import { chromium } from "./pw.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, ".srt");
const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const BASE = opt("base", "http://localhost:3743");
const SCENARIO = opt("scenario", null);
const LEVEL = opt("level", "1");
const TAG = opt("tag", "C");
const WANT = opt("want", null);
const FOR_S = Number(opt("for", "80"));
const WARM_MS = Number(opt("warm", "14000"));

const GL_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];
const log = (m) => process.stderr.write(`[card] ${m}\n`);
if (!SCENARIO) {
  console.error("usage: node srt-card.mjs --scenario <templateId> [--want <substring>]");
  process.exit(64);
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: GL_ARGS });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await context.addInitScript(() => {
  try {
    window.localStorage.setItem(
      "aidrive.sim.quality.v1",
      JSON.stringify({ setting: "med", recommendation: "med" }),
    );
    window.localStorage.setItem("sim.quality", "medium");
  } catch {}
});
const page = await context.newPage();
page.on("pageerror", (e) => log(`pageerror: ${e.message}`));
await page.goto(
  `${BASE}/dev/ghost-demo?scenario=${encodeURIComponent(SCENARIO)}&level=${LEVEL}`,
  { waitUntil: "load", timeout: 300_000 },
);
await page.waitForSelector("canvas", { timeout: 300_000 });
await page.waitForTimeout(WARM_MS);

/** The teaching card is the only long Cyrillic sentence in the overlay; read
 *  the whole overlay text and keep the sentences, deduped. */
const readCards = () =>
  page
    .evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("div,p,span")) {
        if (el.children.length > 0) continue;
        const t = (el.textContent ?? "").trim();
        if (t.length > 40 && /[а-яА-Я]/.test(t)) out.push(t);
      }
      return out;
    })
    .catch(() => []);

const seen = new Set();
const started = Date.now();
let i = 0;
while ((Date.now() - started) / 1000 < FOR_S) {
  for (const card of await readCards()) {
    if (seen.has(card)) continue;
    seen.add(card);
    const hit = WANT !== null && card.includes(WANT);
    const name = `${TAG}-${SCENARIO}-card${String(i++).padStart(2, "0")}${hit ? "-WANTED" : ""}`;
    writeFileSync(join(OUT, `${name}.png`), await page.screenshot());
    log(`${hit ? "★ " : "  "}${name}: ${card.slice(0, 120)}`);
  }
  await page.waitForTimeout(900);
}
log(`distinct cards seen: ${seen.size}`);
if (WANT !== null) log(`„${WANT}" seen: ${[...seen].some((c) => c.includes(WANT))}`);
await browser.close();
