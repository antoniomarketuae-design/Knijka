// -----------------------------------------------------------------------------
// pedal-ab.mjs — THE DEAD PEDAL, REPRODUCED AND THEN KILLED.
//
// Doc 91 §C1: "when the pop up pops up after that the buttons for gas, forward
// backward are not working." The audit measured it as an A/B with ONE variable
// and three runs an arm — thumb HELD on the drive pad when the card fires =
// 3/3 dead, thumb LIFTED a beat earlier = 0/3 dead. This is that A/B, scripted,
// so the fix can be shown to have killed the MECHANISM and not just the symptom
// on one lucky run.
//
// WHY CHROMIUM AND NOT THE HOUSE WEBKIT. Real multi-touch — a finger that stays
// down across a state change while a second one taps — needs CDP
// `Input.dispatchTouchEvent` with an explicit touchPoints array. Playwright's
// `page.touchscreen` is a single tap and cannot express "still holding". WebKit
// has no CDP. The defect is JavaScript state (which pointerId owns a pad), not
// engine layout, so a real Chromium finger is the right instrument for it and
// the honest caveat is that the ENGINE is the second-opinion one. Every layout
// number in this repo still comes from WebKit; this file claims no layout.
//
//   node tools/mobile/pedal-ab.mjs --base http://localhost:3210
//   node tools/mobile/pedal-ab.mjs --runs 3 --device iphone16-landscape
//
// It drives /dev/pedal-rig (dev builds only), which mounts the real
// TouchControls and the real TouchInputSource and fakes exactly one boolean:
// the `hidden` prop that LessonPlayShell:2671–2673 raises for a teach moment, a
// micro-quiz, a consequence card, the end screen and the pause menu alike.
// -----------------------------------------------------------------------------
import { chromium } from "./lib/pw.mjs";
import { DEVICES } from "./lib/devices.mjs";
import { newDeviceContext, insetBanner } from "./lib/insets.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = arg("base", "http://localhost:3210");
const RUNS = Number(arg("runs", "3"));
const DEVICE_ID = arg("device", "iphone16-landscape");
const HEADED = process.argv.includes("--headed");
/**
 * `--variant prefix` runs the arms against a build with §I1 and §I3 REVERTED.
 * Running both variants is the difference between "the symptom went away" and
 * "the mechanism is dead": a green run on the fixed build alone proves only
 * that this rig did not happen to trip it today.
 *
 * THE PRE-FIX BUILD IS NOT IN THE TREE — a 1,600-line copy of a live component
 * is stale within a day and lies from then on. To recreate it (four edits, and
 * the diff against the shipped file is exactly the fix, inverted):
 *
 *   1. cp src/components/sim/TouchControls.tsx \
 *         src/app/dev/pedal-rig/TouchControlsPreFix.tsx
 *   2. in the copy, the `!visible` effect and the unmount effect become
 *      `touch.releaseAll()` alone — drop `releaseTouchControls(…, steerPad,
 *      drivePad)`, which is the §I1 half that lets go of the POINTERS;
 *   3. in the copy, drop the `adoptable(...)` branch from `onSteerMove` and
 *      `onDriveMove`, and put `if (!visible) return null;` back in front of the
 *      render — that is §I3;
 *   4. mount it from `pedal-rig-client.tsx` when `?variant=prefix`, and return
 *      "prefix" from the rig's `variant()` so this file's readback agrees.
 *
 * WHAT IT MEASURED, 2026-08-11, iPhone 16 landscape, 3 runs an arm, this file
 * unchanged between the two (the ONLY difference is which build was mounted):
 *
 *   PRE-FIX   ARM 3/3 DEAD   CTRL 0/3   ← the audit's own numbers, reproduced
 *   FIXED     ARM 0/3        CTRL 0/3   RESUME 0/3
 *
 *   §I3 node identity, pre-fix → fixed:
 *     mounted during the card   false → true
 *     same node afterwards      false → true
 *     hit-testable / announced / tabbable while the card is up: false / false / 0
 *
 * One honest note on the RESUME arm: it is alive on BOTH builds, and that is
 * not evidence the pre-fix code was fine. Chromium re-hit-tests a touch whose
 * target was removed, so the still-held finger lands on the freshly re-created
 * pad — and pre-fix that pad was still owned by exactly that pointerId, so it
 * answered. The ARM arm is the discriminating one, because there the finger's
 * `pointerup` is delivered WHILE the overlay is gone: nothing receives it, the
 * ownership is never cleared, and every later press is refused for ever.
 */
const VARIANT = arg("variant", "fixed");

/** One synthetic finger, dispatched as the browser's own touch input. */
class Finger {
  constructor(cdp, id) {
    this.cdp = cdp;
    this.id = id;
    this.down = false;
  }
  async press(x, y) {
    this.x = x;
    this.y = y;
    this.down = true;
    await this.cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: this.id, radiusX: 12, radiusY: 12, force: 1 }],
    });
  }
  async moveTo(x, y) {
    this.x = x;
    this.y = y;
    await this.cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y, id: this.id, radiusX: 12, radiusY: 12, force: 1 }],
    });
  }
  async lift() {
    this.down = false;
    await this.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rig(page, fn, ...args) {
  return page.evaluate(fn, ...args);
}

/**
 * ONE RUN. `hold` decides the single variable: is the thumb still on the glass
 * when the card takes the screen?
 *
 * Returns what the pad did AFTER the card was dismissed — the only question
 * that matters, and the one his session died on.
 */
async function run(page, cdp, { hold, resume = false }) {
  await page.goto(`${BASE}/dev/pedal-rig?card=900&variant=${VARIANT}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => typeof window.__pedalRig !== "undefined", null, {
    timeout: 30_000,
  });
  // The arm reads its own variable back off the page. An A/B that trusts its
  // own URL is one typo away from reporting the wrong arm as green — and the
  // failure mode that matters is a "pre-fix" arm that quietly ran the fixed
  // build and then reported the defect as unreproducible.
  const mounted = await page.evaluate(() => window.__pedalRig.variant());
  if (mounted !== VARIANT) {
    throw new Error(
      `asked for variant=${VARIANT}, the page mounted "${mounted}". ` +
        "See this file's header for how to build the pre-fix variant.",
    );
  }

  // THE INSTRUMENT CHECK THE AUDIT DEMANDS. A pane that does not report a
  // coarse pointer is rendering a layout no phone gets, and every measurement
  // taken through it describes a device nobody owns.
  const coarse = await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches);
  if (!coarse) throw new Error("pointer:coarse is FALSE — this is not a phone context, stop");

  const box = await rig(page, () => window.__pedalRig.padBox());
  if (!box) throw new Error("the drive pad is not in the DOM at all");
  const centreX = box.x + box.width / 2;
  const centreY = box.y + box.height / 2;
  const throttleY = centreY - 40; // above the middle = forward, per the ruling
  const finger = new Finger(cdp, 4); // id 4: the audit's own pointerId

  // 1. Thumb on the gas — PRESSED AND THEN MOTIONLESS, which is how a thumb
  //    actually holds a pedal and which produced exactly zero before the
  //    founder's ruling made this pad absolute.
  await finger.press(centreX, throttleY);
  await sleep(250);
  const drivingBefore = (await rig(page, () => window.__pedalRig.axis())).throttle;

  // 2. …and the card arrives on its own, ~900 ms in, exactly as the seatbelt
  //    teach moment does ~1.2 s into every fresh drive.
  if (!hold) await finger.lift(); // CTRL: the thumb leaves a beat earlier
  await page.waitForFunction(() => window.__pedalRig.hidden() === true, null, { timeout: 10_000 });
  const throttleUnderCard = (await rig(page, () => window.__pedalRig.axis())).throttle;

  // 2b. THE STEP THE WHOLE DEFECT TURNS ON, and it is what a hand does without
  //     being told: the card is up, so the driving thumb COMES OFF THE GLASS —
  //     usually to press «РАЗБРАХ» with it. That `pointerup` is delivered while
  //     the overlay is hidden. Before the fix, the pad's node was not there to
  //     receive it and the pad stayed owned by that finger for ever; the ARM /
  //     CTRL variable is only whether the lift happens INSIDE this window or a
  //     beat before it.
  if (hold && !resume) {
    await finger.lift();
    await sleep(120);
  }

  // 3. He dismisses it. (With the driving thumb still down — the rig's dismiss
  //    is bound to pointerdown so §C2 cannot mask §C1.)
  const dismiss = await page.$('[data-rig="dismiss"]');
  const dbox = await dismiss.boundingBox();
  const tap = new Finger(cdp, 9);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      ...(finger.down ? [{ x: finger.x, y: finger.y, id: finger.id }] : []),
      { x: dbox.x + dbox.width / 2, y: dbox.y + dbox.height / 2, id: tap.id },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: finger.down ? [{ x: finger.x, y: finger.y, id: finger.id }] : [],
  });
  await page.waitForFunction(() => window.__pedalRig.hidden() === false, null, { timeout: 10_000 });

  /** The knob's inline transform WHILE the finger is still down — the audit's
   *  own tell: in the dead state it stayed `(none)`, because the component's
   *  handler was never reached at all. */
  const readKnob = () =>
    page.evaluate(() => {
      const pads = document.querySelectorAll('[data-hud="touch-controls"] [role="slider"]');
      const el = pads[1]?.querySelector('div[class*="rounded-full"]');
      return el ? el.style.transform || "(none)" : "(no knob)";
    });

  let axis;
  let knob;
  if (resume) {
    // §I3's promise, tested literally: the thumb NEVER leaves the glass. It
    // wobbles three pixels, the way a resting thumb does, and the pedal has to
    // come back with no lift-and-press ritual at all.
    await finger.moveTo(centreX, throttleY - 3);
    await sleep(200);
    axis = await rig(page, () => window.__pedalRig.axis());
    knob = await readKnob();
    await finger.lift();
  } else {
    // 4. The thumb comes off, the way a hand does when a card interrupts it.
    if (finger.down) await finger.lift();
    await sleep(120);

    // 5. AND HE PRESSES THE GAS AGAIN — motionless, a new pointerId. This is
    //    the press that used to be refused for the rest of the session.
    const again = new Finger(cdp, 12);
    await again.press(centreX, throttleY);
    await sleep(200);
    axis = await rig(page, () => window.__pedalRig.axis());
    knob = await readKnob();
    await again.lift();
  }

  return {
    drivingBefore: Number(drivingBefore.toFixed(3)),
    throttleUnderCard: Number(throttleUnderCard.toFixed(3)),
    throttleAfter: Number(axis.throttle.toFixed(3)),
    knobAfter: knob,
    dead: axis.throttle <= 0,
  };
}

const device = DEVICES[DEVICE_ID];
if (!device) throw new Error(`unknown device ${DEVICE_ID}`);

const browser = await chromium.launch({ headless: !HEADED });
const { context, inset } = await newDeviceContext(browser, device, {
  motion: "reduce",
  insets: "real",
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

console.log(
  `[pedal-ab] ${device.label} · engine chromium (CDP touch) · ${BASE} · variant=${VARIANT}`,
);
console.log(`[pedal-ab] ${insetBanner(device, inset)}`);

const ARMS = {
  ARM: { hold: true, label: "thumb HELD when the card fires, then lifts and presses again" },
  CTRL: { hold: false, label: "thumb LIFTED a beat earlier — the audit's control" },
  RESUME: {
    hold: true,
    resume: true,
    label: "thumb NEVER lifts: does the pedal come back by itself (§I3)",
  },
};

const results = {};
for (const key of Object.keys(ARMS)) results[key] = [];
for (let i = 0; i < RUNS; i += 1) {
  for (const [key, opts] of Object.entries(ARMS)) results[key].push(await run(page, cdp, opts));
}

for (const [armName, rows] of Object.entries(results)) {
  const deadCount = rows.filter((r) => r.dead).length;
  console.log(`\n${armName} — ${ARMS[armName].label}: ${deadCount}/${rows.length} DEAD`);
  for (const [i, r] of rows.entries()) {
    console.log(
      `  run ${i + 1}: motionless press before ${r.drivingBefore} · under the card ` +
        `${r.throttleUnderCard} · AFTER ${r.throttleAfter} · knob ${r.knobAfter}` +
        ` → ${r.dead ? "DEAD" : "alive"}`,
    );
  }
}

// ── §I3, MEASURED AS NODE IDENTITY ──────────────────────────────────────────
// The A/B above proves the pedal answers again. This proves WHY, and it is the
// half a green A/B cannot see: does the element the thumb is holding survive
// the card, or is the student left holding a node that no longer exists?
// (Chromium re-hit-tests a touch whose target was removed, which is why even a
// destroyed pad can look recoverable here. The identity check does not care.)
await page.goto(`${BASE}/dev/pedal-rig?card=0&variant=${VARIANT}`, {
  waitUntil: "domcontentloaded",
});
await page.waitForFunction(() => typeof window.__pedalRig !== "undefined");
const identity = await page.evaluate(async () => {
  const padNow = () => document.querySelectorAll('[data-hud="touch-controls"] [role="slider"]')[1];
  const settle = () => new Promise((r) => setTimeout(r, 300));
  const before = padNow();
  window.__pedalRig.card(true);
  await settle();
  // Everything about the interrupted state is read HERE, while the card is up.
  const during = padNow();
  const snap = {
    mountedDuringTheCard: !!during,
    stillInTheDocument: !!before && before.isConnected,
    hitTestableDuringTheCard: during ? getComputedStyle(during).pointerEvents !== "none" : null,
    announcedDuringTheCard: during ? !during.closest("[aria-hidden='true']") : null,
    tabbablesDuringTheCard: document.querySelectorAll(
      '[data-hud="touch-controls"] button, [data-hud="touch-controls"] [tabindex]',
    ).length,
  };
  window.__pedalRig.card(false);
  await settle();
  return { ...snap, sameNodeAfterwards: !!before && before === padNow() };
});
console.log("\n§I3 — what happens to the node the thumb is holding, while the card is up:");
for (const [k, v] of Object.entries(identity)) console.log(`  ${k.padEnd(26)} ${v}`);

// ── THE FOUNDER'S RULING, MEASURED: „up is forward, middle is stop, down is
//    backwards", with nothing moving at all.
await page.goto(`${BASE}/dev/pedal-rig?card=0&variant=${VARIANT}`, {
  waitUntil: "domcontentloaded",
});
await page.waitForFunction(() => typeof window.__pedalRig !== "undefined");
const box = await rig(page, () => window.__pedalRig.padBox());
const bands = [
  ["top of the pad", box.y + 6],
  ["66 px above centre", box.y + box.height / 2 - 66],
  ["30 px above centre", box.y + box.height / 2 - 30],
  ["dead centre", box.y + box.height / 2],
  ["20 px below centre", box.y + box.height / 2 + 20],
  ["30 px below centre", box.y + box.height / 2 + 30],
  ["bottom of the pad", box.y + box.height - 6],
];
console.log(`\nTHE ABSOLUTE PAD — a press with NO movement at all (pad ${box.height.toFixed(0)}px):`);
for (const [label, y] of bands) {
  const f = new Finger(cdp, 21);
  await f.press(box.x + box.width / 2, y);
  await sleep(120);
  const a = await rig(page, () => window.__pedalRig.axis());
  await f.lift();
  await sleep(60);
  console.log(
    `  ${label.padEnd(20)} throttle ${a.throttle.toFixed(3)} · brake ${a.brake.toFixed(3)}`,
  );
}

await browser.close();
