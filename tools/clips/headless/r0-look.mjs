// R0 LOOK RIG (doc 66 R0) — open one clip's scene in the SAME headless page the
// renderer uses, walk the clock, screenshot, and print what the R1 presence log
// saw at each beat. Reads nothing; writes only PNGs under .r0look/.
//
// Why it exists: `render-clip.mjs` fails a clip whose required actors never
// framed ("R1: липсва cyclist") and deletes the frames, which is correct and
// completely opaque — you learn that the picture does not argue the lesson but
// not WHERE the actor went. This walks the same scene and shows you.
//
//   node r0-look.mjs <templateId> <mistakeIndex> [--at 5,10,12.9] [--base URL]
//
// Default sample times are the five planned R0 keyframes.

import { chromium } from "./pw.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, ".r0look");

const [templateId, mistakeRaw, ...rest] = process.argv.slice(2);
if (!templateId || mistakeRaw === undefined) {
  console.error("usage: node r0-look.mjs <templateId> <mistakeIndex> [--at a,b,c] [--base URL]");
  process.exit(64);
}
const mistakeIndex = Number(mistakeRaw);
const opt = (name, def) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 && rest[i + 1] ? rest[i + 1] : def;
};
const BASE = opt("base", "http://localhost:3200");
const AT = opt("at", null);
const id = `${templateId}__m${mistakeIndex}`;
const log = (m) => process.stderr.write(`[r0 ${id}] ${m}\n`);

const GL_ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: GL_ARGS });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("sim.quality", "high");
    } catch {}
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => log(`pageerror: ${e.message}`));
  const url = `${BASE}/dev/clip-headless?template=${encodeURIComponent(templateId)}&mistake=${mistakeIndex}`;
  await page.goto(url, { waitUntil: "load", timeout: 120_000 });
  await page.waitForFunction(
    () => {
      const a = window.__clipHeadless;
      return a && (a.state === "ready" || a.state === "error");
    },
    undefined,
    { timeout: 180_000 },
  );
  const snap = await page.evaluate(() => ({
    state: window.__clipHeadless.state,
    error: window.__clipHeadless.error ?? null,
    meta: window.__clipHeadless.meta ?? null,
  }));
  if (snap.state === "error") throw new Error(`scene error: ${snap.error}`);
  const m = snap.meta;
  log(`window ${m.startSec.toFixed(2)}–${m.endSec.toFixed(2)}s · fault @${m.faultTimeSec.toFixed(2)}s · view ${m.view}`);
  log(`planned keyframes: ${m.keyframeAt.map((t) => t.toFixed(2)).join(" / ")}`);

  const times = (AT ? AT.split(",").map(Number) : m.keyframeAt).slice().sort((a, b) => a - b);
  const canvas = page.locator('main[data-headless="scene"] canvas');
  const frameCount = () => page.evaluate(() => window.__clipHeadless.frameCount);

  // ONE MONOTONIC FORWARD PASS, screenshotting as each requested time is
  // reached. NEVER seek backwards: the capture stepper (captureGhostFeed
  // advanceTo) only integrates FORWARD, so the ghost pose rewinds with the
  // clock but the traffic system and the staged actors do NOT. A "look" that
  // walks to the end and then seeks back to the fault renders the ghost at the
  // fault with the cyclist frozen where he ended up — a picture that never
  // occurs in the produced clip. That bug cost this session one wrong verdict;
  // the renderer is monotonic, so the look must be too.
  const N = Math.max(240, Math.round((m.endSec - m.startSec) * 30));
  const dt = (m.endSec - m.startSec) / (N - 1);
  let nextShot = 0;
  for (let i = 0; i < N; i++) {
    const t = m.startSec + i * dt;
    const before = await frameCount();
    await page.evaluate((tt) => window.__clipHeadless.seek(tt), t);
    await page.waitForFunction((tgt) => window.__clipHeadless.frameCount >= tgt, before + 2, { timeout: 20_000 });
    while (nextShot < times.length && t >= times[nextShot] - dt / 2) {
      const dataUrl = await canvas.evaluate((el) => el.toDataURL("image/png"));
      const file = join(OUT, `${id}__t${times[nextShot].toFixed(2)}.png`);
      writeFileSync(file, Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
      log(`wrote ${file} (clock ${t.toFixed(2)}s)`);
      nextShot++;
    }
  }
  const actors = await page.evaluate(() => window.__clipHeadless.readChecklist());
  log(`R1 checklist: ${JSON.stringify(actors)}`);
  const presence = await page.evaluate(() =>
    window.__clipHeadless.readPresence ? window.__clipHeadless.readPresence() : null,
  );
  log(`R1 presence log: ${JSON.stringify(presence)}`);
  await browser.close();
}

main().catch((e) => {
  log(`FAIL: ${e.message}`);
  process.exit(1);
});
