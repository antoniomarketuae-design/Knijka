// PARK10 STILLS — look at the ten parking-depth situations, side by side.
//
// Builds a scene-still spec per drill STRAIGHT FROM the committed district
// (meta.scenario.bays: occupied → a parked body, the target → a green mark)
// and renders two frames of each through /dev/scene-still:
//
//   <id>-plan.png  the route's angled-overhead 3/4 — the layout of the row
//   <id>-eye.png   ?eye= — the same geometry from the DRIVER'S seat on the
//                  aisle, which is the only frame that answers „what does the
//                  student actually meet".
//
//   node park10-stills.mjs [--base http://localhost:3741] [--only <id>]
//
// Writes PNGs under tools/clips/headless/.park10/.

import { chromium } from "./pw.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");
const OUT = join(__dirname, ".park10");

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const BASE = opt("base", "http://localhost:3741");
const ONLY = opt("only", null);

/**
 * drill → district + how to look at it. `eye` is a pose on the aisle a few
 * metres short of the row, facing north (the approach direction) — the pose a
 * student is in when he has to decide.
 */
const DRILLS = [
  { id: "sc-park-gap-short", district: "lot-gap-short-v1", focus: { x: 3, y: 0, zoomM: 46 }, eye: [3.5, -20, 1.2, 0], van: null },
  { id: "sc-park-gap-long", district: "lot-gap-long-v1", focus: { x: 3, y: 0, zoomM: 60 }, eye: [3.5, -26, 1.2, 0], van: null },
  { id: "sc-park-van", district: "lot-van-v1", focus: { x: 2, y: 0, zoomM: 38 }, eye: [1.5, -16, 1.2, 0], van: { x: 5.03, y: -2.7, headingDeg: 90 } },
  { id: "sc-park-45-rev", district: "lot-45rev-v1", focus: { x: 2, y: 0, zoomM: 44 }, eye: [1.0, -18, 1.2, 0], van: null },
  { id: "sc-park-left", district: "lot-left-v1", focus: { x: -2, y: 0, zoomM: 38 }, eye: [1.5, -16, 1.2, 0], van: null },
  { id: "sc-park-zebra", district: "lot-zebra-v1", focus: { x: 3, y: 2, zoomM: 62 }, eye: [3.5, -22, 1.2, 0], van: null },
  { id: "sc-park-wall", district: "lot-wall-v1", focus: { x: 2, y: 3, zoomM: 40 }, eye: [1.0, -14, 1.2, 0], van: null },
  { id: "sc-park-night", district: "lot-night-v1", focus: { x: 3, y: 4, zoomM: 66 }, eye: [3.5, -24, 1.2, 0], van: null },
  { id: "sc-park-double", district: "lot-double-v1", focus: { x: 0, y: 0, zoomM: 38 }, eye: [0.9, -16, 1.2, 0], van: null },
  { id: "sc-park-judge", district: "lot-gap-judge-v1", focus: { x: 3, y: 0, zoomM: 56 }, eye: [3.5, -24, 1.2, 0], van: null },
];

const GL_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];
const log = (m) => process.stderr.write(`[park10-still] ${m}\n`);

function specFor(d) {
  const raw = JSON.parse(
    readFileSync(join(REPO, "content", "world", `${d.district}.json`), "utf-8"),
  );
  const bays = raw.meta.scenario.bays;
  const target = bays.find((b) => b.id === raw.meta.scenario.targetBayId);
  const half = d.focus.zoomM / 2;
  const inside = (p) =>
    Math.abs(p.x - d.focus.x) <= half - 1 && Math.abs(p.y - d.focus.y) <= half - 1;
  const poses = [];
  for (const b of bays) {
    if (!b.occupied) continue;
    const p = { kind: "car", x: b.x, y: b.y, headingDeg: b.headingDeg };
    if (inside(p)) poses.push(p);
  }
  if (d.van) poses.push({ kind: "truck", x: d.van.x, y: d.van.y, headingDeg: d.van.headingDeg });
  // The ego, on the aisle level with the target — where the decision is taken.
  poses.push({ kind: "car", x: 1.6 * Math.sign(target.x || 1), y: target.y + 6, headingDeg: 0, variant: "ego" });
  return {
    kind: "sceneStill",
    districtId: d.district,
    focus: d.focus,
    poses,
    marks: [{ kind: "target", x: target.x, y: target.y }],
  };
}

async function shoot(page, url, out) {
  await page.goto(url, { waitUntil: "load", timeout: 300_000 });
  await page.waitForFunction(
    () => {
      const a = window.__sceneStill;
      return a && (a.state === "ready" || a.state === "error");
    },
    undefined,
    { timeout: 300_000 },
  );
  await page.waitForTimeout(1500);
  const canvas = await page.$("canvas");
  writeFileSync(out, await (canvas ?? page).screenshot());
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: GL_ARGS });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => log(`pageerror: ${e.message}`));
  for (const d of DRILLS) {
    if (ONLY && d.id !== ONLY) continue;
    const b64 = Buffer.from(JSON.stringify(specFor(d)), "utf-8").toString("base64url");
    try {
      log(`${d.id}: plan`);
      await shoot(page, `${BASE}/dev/scene-still?spec=${b64}`, join(OUT, `${d.id}-plan.png`));
      log(`${d.id}: eye`);
      await shoot(
        page,
        `${BASE}/dev/scene-still?spec=${b64}&eye=${d.eye.join(",")}`,
        join(OUT, `${d.id}-eye.png`),
      );
    } catch (e) {
      log(`${d.id}: FAILED ${e.message}`);
    }
  }
  await browser.close();
}

main().catch((e) => {
  log(`fatal ${e.stack ?? e}`);
  process.exit(1);
});
