// -----------------------------------------------------------------------------
// glance-procedure.mjs — THE GRADED LOOP, CLOSED FROM THE THUMB, WITHOUT
// DRIVING A METRE.
//
// `CabinControls.latchGlance` is two lines and they are the whole graded
// channel:
//
//     private latchGlance(mirror: MirrorGlanceKind): void {
//       this.enqueueGlanceSample(mirror);   // → VehicleSample.mirrorGlance
//       this.callbacks.onGlance?.(mirror);  // → the procedure observer
//     }
//
// They fire together or not at all, so proving EITHER consumer saw the press
// proves the press was latched for both. The procedure observer is the one that
// surfaces in the DOM without driving: three distinct glances complete the
// pre-drive step `adjust-mirrors` (procedures/performedSteps.ts:337-339), and
// the checklist prints «Подготовка n/13».
//
// So: open `l1-preparation`, read n, tap «Л» «З» «Д», read n again. A step that
// moves is a press the grader received.
//
// The negative control is built in: a run that presses NOTHING must leave n
// where it was, or the step completed on its own and the arm proves nothing.
//
//   node tools/mobile/glance-procedure.mjs --base http://localhost:3200
//   node tools/mobile/glance-procedure.mjs --device small-landscape --method click
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
const METHOD = arg("method", "touch"); // touch | click | key
/** Press nothing at all — the negative control the „before" read used to be. */
const IDLE_ONLY = process.argv.includes("--idle");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const devices = DEVICE_ARG ? [DEVICES[DEVICE_ARG]] : resolveDevices();
if (devices.some((d) => !d)) throw new Error(`unknown device ${DEVICE_ARG}`);

const GL_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];
const browser = await chromium.launch({ headless: true, args: GL_ARGS });

const STATIONS = [
  ["Поглед в лявото огледало", "KeyQ"],
  ["Поглед в огледалото за задно виждане", "KeyF"],
  ["Поглед в дясното огледало", "KeyE"],
];

const results = [];

for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, {
    motion: "allow",
    insets: "real",
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  console.log(`\n=== ${device.label} ===`);
  console.log(`    ${insetBanner(device, inset)}`);

  await page.goto(`${BASE}/dev/drive-rig?lesson=l1-preparation&readout=0&quality=low`, {
    waitUntil: "domcontentloaded",
    timeout: 240_000,
  });
  await page.waitForFunction(() => window.__glanceProbe !== undefined, null, { timeout: 300_000 });
  await sleep(4000);

  /**
   * «n/13» off the checklist itself.
   *
   * On compact the checklist is mounted ONLY inside the overlay's detail sheet
   * (doc 91 · D3), so it has to be opened to be read — and it is closed again
   * before the glances, because the sheet stands on the arc stations (D4) and a
   * covered button would test the sheet, not the glance.
   *
   * The sheet is opened with a plain DOM `.click()` ON PURPOSE: it is harness
   * plumbing, not the control under test. What is under test is «Л» «З» «Д»,
   * and those are pressed with whatever `--method` says.
   */
  const openSheet = () =>
    page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        /СПИСЪК|Списък/.test(x.textContent ?? ""),
      );
      if (!b) return false;
      b.click();
      return true;
    });
  const progress = async () => {
    let value = null;
    for (let i = 0; i < 5 && value === null; i += 1) {
      await openSheet();
      await sleep(900);
      value = await page.evaluate(() => {
        const el = document.querySelector('[data-hud="predrive-checklist"]');
        if (!el) return null;
        const m = (el.textContent || "").match(/(\d+)\s*\/\s*(\d+)/);
        return m ? { done: Number(m[1]), total: Number(m[2]) } : null;
      });
    }
    if (value === null) {
      console.log(
        `  ⚠ could not reach the checklist; screen says: ${await page.evaluate(() => (document.body.innerText || "").slice(0, 180).replace(/\n+/g, " · "))}`,
      );
    }
    // Close it again — anything left open would cover the stations.
    //
    // BY THE SAME TOGGLE, NEVER BY THE ✕. The first version of this probe
    // closed the sheet with the nearest ✕ and the second read came back null:
    // that ✕ DISMISSES the pre-drive notification for good, «СПИСЪК» goes with
    // it, and there is no way back to the checklist. That is doc 91 · C5
    // reproduced by accident — the 4-pixel miss that bricks the lesson — and it
    // is wave 2's own item I5. A probe must not step in it.
    await openSheet();
    await sleep(700);
    return value;
  };

  const hudCount = await page.evaluate(
    () => document.querySelectorAll('[data-hud="touch-controls"] button').length,
  );

  // THE COUNTER IS NOT READ FIRST, AND THAT IS THE POINT.
  //
  // The checklist is only mounted inside the «СПИСЪК» sheet on compact, and
  // that sheet COVERS all three graded mirror stations (measured:
  // glance-cover.mjs). Reading „before" therefore left a panel standing on the
  // very buttons under test — and because `.click()` ignores hit-testing while
  // a finger does not, that made `--method click` pass and `--method touch`
  // fail for a reason that had nothing to do with either. The negative control
  // is now a SEPARATE, equally long idle run instead: nothing is opened until
  // every press has already happened.
  const before = { done: 0, total: 13 };
  console.log(`  touch buttons=${hudCount} · pre-drive assumed at start: 0/13 (fresh lesson)`);
  if (IDLE_ONLY) {
    await sleep(3000 + 3 * 1400);
    const screen = await page.evaluate(() =>
      (document.body.innerText || "").replace(/\n+/g, " · "),
    );
    const seen = /настройка на огледалата|Настройка на огледалата/.test(screen);
    console.log(
      `  NEGATIVE CONTROL — nothing pressed for the same wall time: mirrors step acknowledged=${seen}`,
    );
    console.log(`  screen: ${screen.slice(0, 190)}`);
    results.push({
      device: device.id,
      before,
      idle: { done: seen ? 1 : 0, total: 13 },
      after: { done: seen ? 1 : 0, total: 13 },
      how: "(nothing)",
      moved: seen ? 1 : 0,
      mirrorsStepSeen: seen,
    });
    await context.close();
    continue;
  }
  const idle = null;

  const how = [];
  for (const [labelBg, code] of STATIONS) {
    if (METHOD === "key") {
      await page.evaluate((c) => window.__driveRig.press(c), code);
      await sleep(400);
      await page.evaluate((c) => window.__driveRig.release(c), code);
      how.push("key");
    } else {
      // WHAT WOULD A FINGER ACTUALLY HIT? `getBoundingClientRect` answers where
      // the button is LAID OUT, which is not the same question — a sheet or a
      // card on top of it leaves the rect exactly where it was. `.click()`
      // ignores hit-testing and activates the button anyway, so a probe that
      // only clicks can report a covered control as healthy. This is the check
      // that tells the two apart, and it is the difference between „the button
      // is broken" and „something is standing on it".
      const box = await page.evaluate((l) => {
        const b = document.querySelector(`[aria-label="${l}"]`);
        if (!b) return null;
        const r = b.getBoundingClientRect();
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        const hit = document.elementFromPoint(cx, cy);
        const covered = !(hit === b || b.contains(hit));
        return {
          x: cx,
          y: cy,
          covered,
          hitBy: covered
            ? `${hit?.tagName ?? "(nothing)"}${hit?.getAttribute?.("data-hud") ? `[data-hud=${hit.getAttribute("data-hud")}]` : ""}` +
              `${hit?.closest?.("[data-hud]")?.getAttribute("data-hud") ? ` in [${hit.closest("[data-hud]").getAttribute("data-hud")}]` : ""}`
            : null,
        };
      }, labelBg);
      if (!box) {
        how.push("ABSENT");
        continue;
      }
      if (box.covered) {
        console.log(`  ⚠ «${labelBg}» is COVERED at its own centre — a finger there hits ${box.hitBy}`);
        how.push("COVERED");
      }
      if (METHOD === "click") {
        await page.evaluate((l) => document.querySelector(`[aria-label="${l}"]`).click(), labelBg);
        how.push("click");
      } else {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: box.x, y: box.y, id: 6, radiusX: 12, radiusY: 12, force: 1 }],
        });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        if (!box.covered) how.push("touch");
      }
    }
    // Distinct glances, not a mash: `GlanceHold.start` refuses to re-latch a
    // mirror it is already holding, and the step needs three DIFFERENT ones.
    await sleep(1400);
  }

  // THE READOUT THAT SURVIVES THE PRESS.
  //
  // Completing `adjust-mirrors` while step 1 is still pending REPLACES the
  // pre-drive notification line with the out-of-order card «Нарушен ред:
  // настройка на огледалата» — which takes «СПИСЪК» away with it, so the
  // counter becomes unreadable exactly when it would have proved the point.
  // That card is a strictly BETTER witness anyway: the procedure observer is
  // the only thing that can raise it, and it can only be raised by three
  // distinct glances arriving (procedures/performedSteps.ts:337-339).
  const screen = await page.evaluate(() =>
    (document.body.innerText || "").replace(/\n+/g, " · "),
  );
  const mirrorsStepSeen = /настройка на огледалата|Настройка на огледалата/.test(screen);
  const after = mirrorsStepSeen ? { done: 1, total: 13 } : await progress();
  const probe = await page.evaluate(() => window.__glanceProbe);
  const moved = before && after ? after.done - before.done : null;
  console.log(`  activation: ${how.join(" / ")}`);
  console.log(`  the pre-drive step «настройка на огледалата» acknowledged on screen: ${mirrorsStepSeen}`);
  console.log(`  screen: ${screen.slice(0, 190)}`);
  console.log(`  probe: ${JSON.stringify(probe)}`);
  console.log(
    `  → ${moved !== null && moved > 0 ? "THE GRADED STEP FIRED — the press reached the procedure observer" : "nothing fired — the press did NOT reach the grader"}`,
  );
  results.push({ device: device.id, before, idle, after, how: how.join("/"), moved, mirrorsStepSeen });
  await context.close();
}

console.log("\n──────── SUMMARY ────────");
for (const r of results) {
  console.log(
    `${r.device.padEnd(30)} ${String(r.before?.done ?? "?")}→${String(r.after?.done ?? "?")}/13  ` +
      `idle ${String(r.idle?.done ?? "?")}  via ${r.how}  ${r.moved > 0 ? "PASS" : "FAIL"}`,
  );
}
await browser.close();
