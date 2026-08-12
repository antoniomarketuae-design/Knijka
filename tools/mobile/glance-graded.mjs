// -----------------------------------------------------------------------------
// glance-graded.mjs — DOES A TAP ON «Л»/«Д» REACH THE GRADER?
//
// The camera moving is only half the question. Mirror checks are GRADED, and a
// glance that turns the head without registering is the same bug one layer up —
// this product has shipped exactly that shape before.
//
// THE TEST IS AN A/B WITH A NEGATIVE CONTROL, because a green arm alone proves
// nothing: a rule that never fires on this lesson would also produce „no fault".
//
//   CONTROL  drive to the Б2 line, stop, press NOTHING, cross
//            → JUNCTION_SCAN_INCOMPLETE must FIRE (the rule is alive)
//   ARM      identical drive, but TAP «Л» and «Д» at the line
//            → it must NOT fire (the taps satisfied it)
//
// `sc-junction-scan` is used because it is one of only three templates that set
// `ruleConfig.junctionScanObservationEnabled` (templates-junctions.ts:839) — on
// a lesson that does not, both arms are silent and the test says nothing.
//
// The rule read is `rules/engine.ts:1798` (`scanIncomplete`), whose whole input
// is `lastGlanceAt[left|right]` — written at `:688` from the `mirrorGlance`
// event that `worldRuntime` raises from `VehicleSample.mirrorGlance`, which is
// what `CabinControls.consumeGlanceSample()` drains. So this exercises the
// entire chain from the student's thumb to the fault card.
//
// ── STATUS, 2026-08-12: THIS ONE IS NOT CLOSED, AND SAYING SO IS THE POINT ──
// Both arms currently report ZERO faults, which is an INCONCLUSIVE result and
// is reported as one rather than as a pass: the negative control never
// convicted, because the scripted approach never reached the stop line (the car
// was still ~94 m short when the poll expired — `stopAt` shapes speed but not
// steering, and this spawn needs the lane held). Fix the drive script, not the
// verdict. Until then the graded chain is evidenced one layer up instead, by
// `glance-procedure.mjs`, which is not a substitute for this file — it proves
// the OTHER consumer of the same latch:
//
//     private latchGlance(mirror) {
//       this.enqueueGlanceSample(mirror);   // → the rule engine (this file)
//       this.callbacks.onGlance?.(mirror);  // → the procedure observer
//     }
//
// Two lines that fire together or not at all. `glance-procedure.mjs` shows the
// second one arriving from a real finger on all six profiles, so the first was
// enqueued too — but „so it was enqueued too" is an argument, and this file is
// the measurement, so it stays on the list.
//
//   node tools/mobile/glance-graded.mjs --base http://localhost:3200
//   node tools/mobile/glance-graded.mjs --method click|touch|key
// -----------------------------------------------------------------------------
import { chromium } from "./lib/pw.mjs";
import { DEVICES } from "./lib/devices.mjs";
import { newDeviceContext, insetBanner } from "./lib/insets.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const BASE = arg("base", "http://localhost:3200");
const DEVICE_ID = arg("device", "iphone16-landscape");
const SCENARIO = arg("scenario", "sc-junction-scan");
const METHOD = arg("method", "touch"); // touch | click | key
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const device = DEVICES[DEVICE_ID];
if (!device) throw new Error(`unknown device ${DEVICE_ID}`);

// See glance-envelope.mjs: without the real-GPU flags this scene runs at
// 0.4 fps — slower than the 0.9 s tap hold, so nothing about a tap can be
// resolved through it.
const GL_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];
const browser = await chromium.launch({ headless: true, args: GL_ARGS });
const { context, inset } = await newDeviceContext(browser, device, {
  motion: "allow",
  insets: "real",
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

console.log(`[glance-graded] ${device.label} · ${BASE} · ${SCENARIO} · method=${METHOD}`);
console.log(`[glance-graded] ${insetBanner(device, inset)}`);

const L = "Поглед в лявото огледало";
const R = "Поглед в дясното огледало";

async function station(labelBg) {
  return page.evaluate((l) => {
    const b = document.querySelector(`[aria-label="${l}"]`);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, labelBg);
}

async function activate(labelBg, keyCode) {
  if (METHOD === "key") {
    await page.evaluate((c) => window.__driveRig.press(c), keyCode);
    await sleep(500);
    await page.evaluate((c) => window.__driveRig.release(c), keyCode);
    return "key";
  }
  const box = await station(labelBg);
  if (!box) return "ABSENT";
  if (METHOD === "click") {
    await page.evaluate((l) => document.querySelector(`[aria-label="${l}"]`).click(), labelBg);
    return "click";
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x, y: box.y, id: 5, radiusX: 12, radiusY: 12, force: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  return "touch";
}

/** One arm. `glance` decides the single variable. */
async function run(glance) {
  await page.goto(`${BASE}/dev/drive-rig?scenario=${SCENARIO}&level=1&readout=0&quality=low`, {
    waitUntil: "domcontentloaded",
    timeout: 240_000,
  });
  await page.waitForFunction(() => window.__driveRig?.ready === true, null, { timeout: 300_000 });
  await sleep(3500);

  const objectives = await page.evaluate(() => window.__driveRig.dump(1).meta.objectives);
  const line = objectives.find((o) => o.kind === "passSignal") ?? { x: 0, y: 0 };

  // Approach and stand ON the line's mouth. `stopAt` shapes a real deceleration
  // ramp and holds the brake, which is what a student at a Б2 does.
  await page.evaluate(
    (l) =>
      window.__driveRig.run([
        { label: "approach", speedKmh: 22, stopAt: { x: l.x, y: l.y - 7 }, withinM: 3, timeoutSec: 60 },
        { label: "stand", speedKmh: 0, holdBrake: true, forSec: 6 },
      ]),
    line,
  );

  // Wait until the car has actually stopped at the mouth.
  let at = null;
  for (let i = 0; i < 100; i += 1) {
    at = await page.evaluate(() => window.__driveRig.last);
    if (at && at.speedKmh < 1 && Math.abs(at.y - (line.y - 7)) < 6) break;
    await sleep(700);
  }
  console.log(
    `  stopped at x=${at?.x?.toFixed(1)} y=${at?.y?.toFixed(1)} v=${at?.speedKmh?.toFixed(2)} km/h`,
  );

  let how = "none";
  if (glance) {
    how = `${await activate(L, "KeyQ")} / ${await activate(R, "KeyE")}`;
    await sleep(700);
  }

  // …then cross the line and drive on, which is when the scan is adjudicated.
  await page.evaluate(() => window.__driveRig.run([{ label: "cross", speedKmh: 20, forSec: 14 }]));
  await sleep(16_000);

  const dump = await page.evaluate(() => window.__driveRig.dump(600));
  const rules = dump.events.filter((e) => e.channel === "rule");
  return {
    how,
    scan: rules.filter((e) => (e.code ?? "") === "JUNCTION_SCAN_INCOMPLETE"),
    all: rules.map((e) => e.code ?? e.kind),
  };
}

console.log("\nCONTROL — drive the same approach and press NOTHING:");
const control = await run(false);
console.log(
  `  JUNCTION_SCAN_INCOMPLETE ×${control.scan.length}  ${control.scan.length ? "← the rule is ALIVE on this lesson" : "← ⚠ the rule never fires; this test proves nothing"}`,
);
console.log(`  every rule event: ${control.all.join(", ") || "(none)"}`);

console.log(`\nARM — identical drive, but «Л» and «Д» pressed at the line (${METHOD}):`);
const armRun = await run(true);
console.log(`  activation: ${armRun.how}`);
console.log(
  `  JUNCTION_SCAN_INCOMPLETE ×${armRun.scan.length}  ${armRun.scan.length ? "← THE PRESS DID NOT REGISTER" : "← the press satisfied the grader"}`,
);
console.log(`  every rule event: ${armRun.all.join(", ") || "(none)"}`);

console.log(
  `\nVERDICT: control ${control.scan.length} fault(s) · arm ${armRun.scan.length} fault(s) → ` +
    (control.scan.length > 0 && armRun.scan.length === 0
      ? "the graded loop is CLOSED from the button"
      : control.scan.length === 0
        ? "INCONCLUSIVE — the negative control never convicted"
        : "THE BUTTON DOES NOT SATISFY THE GRADER"),
);

await browser.close();
