// -----------------------------------------------------------------------------
// glance-cover.mjs — IS ANYTHING STANDING ON THE THREE GRADED MIRROR STATIONS?
//
// `document.elementFromPoint` at each station's own centre, with the covering
// element identified all the way up its ancestor chain. Nothing is opened,
// dismissed or clicked first: this is the screen as the lesson hands it over.
//
// A `.click()` activates a covered button anyway, so a probe that only clicks
// reports a buried control as healthy. This is the check that tells „the button
// is broken" from „something is standing on it" — and it is run on all six
// profiles, because a cover is a layout fact and layout facts do not travel.
// -----------------------------------------------------------------------------
import { chromium } from "./lib/pw.mjs";
import { DEVICES, resolveDevices } from "./lib/devices.mjs";
import { newDeviceContext, insetBanner } from "./lib/insets.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const BASE = arg("base", "http://localhost:3200");
const DEVICE_ARG = arg("device", null);
const LESSON = arg("lesson", "l1-preparation");
const SCENARIO = arg("scenario", null);
const OPEN_SHEET = process.argv.includes("--open-sheet");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const devices = DEVICE_ARG ? [DEVICES[DEVICE_ARG]] : resolveDevices();
const GL_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];
const browser = await chromium.launch({ headless: true, args: GL_ARGS });

const LABELS = [
  "Поглед в лявото огледало",
  "Поглед в огледалото за задно виждане",
  "Поглед в дясното огледало",
  "Мигач наляво",
  "Мигач надясно",
];

const rows = [];
for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, {
    motion: "allow",
    insets: "real",
  });
  const page = await context.newPage();
  const url = SCENARIO
    ? `${BASE}/dev/drive-rig?scenario=${SCENARIO}&level=1&readout=0&quality=low`
    : `${BASE}/dev/drive-rig?lesson=${LESSON}&readout=0&quality=low`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForFunction(() => window.__glanceProbe !== undefined, null, { timeout: 300_000 });
  await sleep(4500);

  if (OPEN_SHEET) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        /СПИСЪК|Списък/.test(x.textContent ?? ""),
      );
      b?.click();
    });
    await sleep(1000);
  }

  const report = await page.evaluate((labels) => {
    const describe = (el) => {
      if (!el) return "(nothing)";
      const parts = [];
      let n = el;
      for (let i = 0; i < 6 && n && n !== document.body; i += 1) {
        const hud = n.getAttribute?.("data-hud");
        const aria = n.getAttribute?.("aria-label");
        parts.push(
          `${n.tagName.toLowerCase()}${hud ? `[data-hud=${hud}]` : ""}${aria ? `[${aria}]` : ""}` +
            `${n.className && typeof n.className === "string" ? `.${n.className.split(/\s+/).slice(0, 3).join(".")}` : ""}`,
        );
        n = n.parentElement;
      }
      return parts.join(" < ");
    };
    return labels.map((l) => {
      const b = document.querySelector(`[aria-label="${l}"]`);
      if (!b) return { label: l, present: false };
      const r = b.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      const covered = !(hit === b || b.contains(hit));
      return {
        label: l,
        present: true,
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        covered,
        hitBy: covered ? describe(hit) : null,
      };
    });
  }, LABELS);

  const bodyLine = await page.evaluate(() => (document.body.innerText || "").slice(0, 200).replace(/\n+/g, " · "));
  console.log(`\n=== ${device.label}${OPEN_SHEET ? " · «СПИСЪК» OPEN" : " · nothing opened"} ===`);
  console.log(`    ${insetBanner(device, inset)}`);
  console.log(`    screen says: ${bodyLine}`);
  for (const r of report) {
    if (!r.present) {
      console.log(`  ${r.label.padEnd(38)} NOT IN THE DOM`);
      continue;
    }
    console.log(
      `  ${r.label.padEnd(38)} ${String(r.rect[2]).padStart(3)}x${String(r.rect[3])} @${String(r.rect[0]).padStart(4)},${String(r.rect[1]).padStart(4)}  ` +
        (r.covered ? `COVERED by ${r.hitBy}` : "reachable"),
    );
  }
  rows.push({ device: device.id, report });
  await context.close();
}

console.log("\n──────── SUMMARY: graded mirror stations a finger cannot reach ────────");
for (const r of rows) {
  const dead = r.report.filter((x) => x.present && x.covered).map((x) => x.label);
  console.log(`${r.device.padEnd(30)} ${dead.length}/5 covered${dead.length ? ` — ${dead.join(", ")}` : ""}`);
}
await browser.close();
