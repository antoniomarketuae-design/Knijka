// =============================================================================
// predrive-mouse-drive.mjs — THE FOUNDER'S ACCEPTANCE TEST, run by a machine.
//
//   „complete all 13 steps using only the mouse, and photograph the checklist
//    at 13/13."
//
// This drives /dev/hud-ux?lesson=l1-preparation with MOUSE EVENTS ONLY. It
// never dispatches a key: `page.keyboard` is not used anywhere below, and a
// keydown listener installed in the page counts any that leak in and fails the
// run. Every cockpit control is clicked at a canvas coordinate computed from
// the SAME projection the app ships (scene/vitok/cabinLook.ts, re-derived here
// because this file is plain .mjs) — so a control that has moved out of frame
// makes the run fail rather than silently mis-click.
//
//   node predrive-mouse-drive.mjs [--base http://localhost:3742] [--out DIR]
//
// Writes numbered PNGs of every stage plus `13-of-13.png`, and prints the
// checklist counter after each step so a failure names the step it died on.
// =============================================================================

import { chromium } from "./pw.mjs";
// The dev harness route mounts the REAL LessonPlayShell, and the shell calls
// server actions that go through requireUser() — an unauthenticated run gets
// redirected to /login and measures the login page. Same guard, same helpers
// the mobile sweep uses (tools/mobile/lib/auth.mjs, which exists because that
// exact mistake has already been made once in this project).
import { signIn } from "../../mobile/lib/auth.mjs";
import { ensureHarnessUser } from "../../mobile/lib/user.mjs";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rest = process.argv.slice(2);
const opt = (n, d) => {
  const i = rest.indexOf(`--${n}`);
  return i >= 0 && rest[i + 1] ? rest[i + 1] : d;
};
const BASE = opt("base", "http://localhost:3742");
const OUT = opt("out", join(__dirname, ".predrive"));
const VIEWPORT = { width: 1440, height: 900 };
const GL_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];

// --- the shipped cockpit projection, re-derived (validated in cabinLook.test) -
const EYE = { x: 0.24, y: 0.71, z: -0.255 };
const FOV = 47;
const FOV_MAX = 56;
const AR_REF = 16 / 9;
const HFOV = 2 * Math.atan(Math.tan((FOV * Math.PI) / 360) * AR_REF);
const vfovDeg = (a) =>
  Math.min((2 * Math.atan(Math.tan(HFOV / 2) / a) * 180) / Math.PI, FOV_MAX);
const P0 = -(4 * Math.PI) / 180;
const mul = (a, b) => {
  const o = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
};
const Ry = (t) => {
  const c = Math.cos(t), s = Math.sin(t);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
const Rx = (t) => {
  const c = Math.cos(t), s = Math.sin(t);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
const camRot = (y, p) => mul(mul(Ry(Math.PI), Rx(P0)), mul(Ry(y), Rx(p)));
function project(p, yaw, pitch, a) {
  const R = camRot(yaw, pitch);
  const d = [p[0] - EYE.x, p[1] - EYE.y, p[2] - EYE.z];
  const v = [
    R[0] * d[0] + R[3] * d[1] + R[6] * d[2],
    R[1] * d[0] + R[4] * d[1] + R[7] * d[2],
    R[2] * d[0] + R[5] * d[1] + R[8] * d[2],
  ];
  if (v[2] >= 0) return null;
  const t = Math.tan((vfovDeg(a) * Math.PI) / 360);
  return { x: (v[0] / (-v[2] * t * a) + 1) / 2, y: (v[1] / (-v[2] * t) + 1) / 2 };
}
const POSES = {
  forward: [0, 0],
  belt: [-1.141, -1.155],
  console: [0, -0.15],
  mirrorRight: [-0.93, -0.09],
};
const HOTSPOTS = {
  hotspot_engine_start: [[0.095, 0.316, 0.725], [0.08, 0.08, 0.07]],
  hotspot_belt: [[0.135, 0.05, -0.22], [0.09, 0.13, 0.15]],
  hotspot_gear_selector: [[0, 0.32, 0.43], [0.13, 0.14, 0.16]],
  hotspot_parking_brake: [[0.093, 0.315, 0.5], [0.1, 0.08, 0.12]],
  hotspot_indicator_stalk: [[0.48, 0.327, 0.587], [0.17, 0.08, 0.12]],
  hotspot_headlights: [[0.655, 0.342, 0.71], [0.09, 0.09, 0.08]],
  hotspot_mirror_left: [[0.905, 0.455, 0.592], [0.18, 0.14, 0.1]],
  hotspot_mirror_right: [[-0.905, 0.455, 0.592], [0.18, 0.14, 0.1]],
  hotspot_mirror_rear: [[0, 0.803, 0.5], [0.3, 0.13, 0.09]],
};
/** Visible-part centre of a hotspot in canvas fractions from the top-left. */
function clickPoint(name, pose, aspect) {
  const [yaw, pitch] = POSES[pose];
  const [pos, size] = HOTSPOTS[name];
  let x0 = 1e9, x1 = -1e9, tb = -1e9, bb = 1e9;
  for (const sx of [-0.5, 0.5])
    for (const sy of [-0.5, 0.5])
      for (const sz of [-0.5, 0.5]) {
        const f = project(
          [pos[0] + sx * size[0], pos[1] + sy * size[1], pos[2] + sz * size[2]],
          yaw, pitch, aspect,
        );
        if (!f) return null;
        x0 = Math.min(x0, f.x); x1 = Math.max(x1, f.x);
        bb = Math.min(bb, f.y); tb = Math.max(tb, f.y);
      }
  const left = Math.max(0, x0), right = Math.min(1, x1);
  const top = Math.max(0, 1 - tb), bottom = Math.min(1, 1 - bb);
  if (right - left < 0.02 || bottom - top < 0.02) return null;
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

mkdirSync(OUT, { recursive: true });
const LOGFILE = join(OUT, "run.log");
writeFileSync(LOGFILE, "");
const log = (m) => {
  const line = `[predrive] ${m}\n`;
  process.stderr.write(line);
  // Unbuffered, so a hung run can still be watched from another shell.
  try {
    appendFileSync(LOGFILE, line);
  } catch {}
};

async function main() {
  const browser = await chromium.launch({ headless: true, args: GL_ARGS });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("sim.quality", "medium");
      // The tutorial popup auto-opens by design; this run DRIVES it (it is the
      // founder's own flow), so leave the preference at its default.
      window.localStorage.removeItem("aidrive.sim.predriveTutorial.v1");
    } catch {}
    // KEYBOARD TRIPWIRE: if any key reaches the page this is not a mouse-only
    // run and the result is worthless.
    window.__keys = [];
    window.addEventListener("keydown", (e) => window.__keys.push(e.key), true);
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => log(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") log(`console.error: ${m.text().slice(0, 240)}`);
  });

  log("signing in (the shell's server actions need a session)");
  const credentials = await ensureHarnessUser();
  await signIn(page, credentials, BASE);
  log("signed in");

  log(`goto ${BASE}/dev/hud-ux?lesson=l1-preparation`);
  await page.goto(`${BASE}/dev/hud-ux?lesson=l1-preparation`, {
    waitUntil: "domcontentloaded",
    timeout: 240_000,
  });
  log("dom ready — waiting for the canvas");
  await page.waitForSelector("canvas", { timeout: 240_000 });
  log("canvas mounted — waiting for the world build");
  await page.waitForSelector('[data-hud="predrive-checklist"]', { timeout: 240_000 });
  log("checklist mounted");
  await page.waitForTimeout(9000); // world build + first frames

  const box = await page.locator("canvas").first().boundingBox();
  if (!box) throw new Error("no canvas box");
  const aspect = box.width / box.height;
  log(`canvas ${Math.round(box.width)}x${Math.round(box.height)} aspect ${aspect.toFixed(3)}`);

  const shot = async (name) => {
    const buf = await page.screenshot();
    writeFileSync(join(OUT, `${name}.png`), buf);
    log(`shot ${name}.png`);
  };
  const counter = async () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-hud="predrive-checklist"] header span');
      return el ? el.textContent.trim() : "?";
    });
  const pose = async () =>
    page.evaluate(() => {
      const b = [...document.querySelectorAll('[data-hud="predrive-checklist"] button')].find((x) =>
        x.textContent.includes("Погледни напред"),
      );
      return b ? "looking" : "forward";
    });

  /**
   * The tutorial card auto-opens for each NEW pending step, a beat after the
   * previous step ticks (the shell's HUD snapshot runs on its own cadence).
   * Since it became a real full-screen modal it also blocks the canvas, so
   * every canvas gesture below has to stand behind it: close whatever is open,
   * settle, and check again. A human reads the card and clicks „Разбрах"; this
   * is the machine doing the same thing without racing it.
   */
  const ensureNoDialog = async () => {
    for (let i = 0; i < 6; i += 1) {
      const dlg = page.locator('div[role="dialog"]');
      if ((await dlg.count()) === 0) {
        await page.waitForTimeout(250);
        if ((await page.locator('div[role="dialog"]').count()) === 0) return;
        continue;
      }
      const btn = page.locator('div[role="dialog"] button:has-text("Разбрах")').first();
      if ((await btn.count()) === 0) return;
      await btn.click({ timeout: 15_000 });
      await page.waitForTimeout(600);
    }
  };

  /** Click a cockpit hotspot at the given look pose. */
  const clickHotspot = async (name, poseId = "forward", { hold = 0, times = 1 } = {}) => {
    await ensureNoDialog();
    const p = clickPoint(name, poseId, aspect);
    if (!p) throw new Error(`${name} is NOT on screen at pose ${poseId} — mouse cannot reach it`);
    const x = box.x + p.x * box.width;
    const y = box.y + p.y * box.height;
    for (let i = 0; i < times; i += 1) {
      await page.mouse.move(x, y);
      await page.mouse.down();
      if (hold > 0) await page.waitForTimeout(hold);
      await page.mouse.up();
      await page.waitForTimeout(320);
    }
  };
  /** Click a HUD button by its visible Bulgarian text. */
  const clickText = async (text, { optional = false } = {}) => {
    await ensureNoDialog();
    const el = page.locator(`button:has-text("${text}")`).first();
    if ((await el.count()) === 0) {
      if (optional) return false;
      throw new Error(`button "${text}" not found`);
    }
    await el.click({ timeout: 15_000 });
    await page.waitForTimeout(400);
    return true;
  };
  /** Dismiss the auto-opened tutorial modal, ticking the step if it is an info
   *  step (the card's own button does that — the founder's flow). */
  const closeTutorial = async () => {
    // Wait for the card that belongs to the step now pending: it opens a beat
    // after the previous one ticks, so „no dialog right now" is not an answer.
    await page
      .waitForSelector('div[role="dialog"] button:has-text("Разбрах")', { timeout: 6000 })
      .catch(() => null);
    await ensureNoDialog();
    return true;
  };
  /** Press and hold an on-screen pedal with the mouse. */
  const holdPedal = async (label, ms) => {
    await ensureNoDialog();
    const pad = page.locator(`[data-pedal="${label}"]`).first();
    if ((await pad.count()) === 0) throw new Error(`pedal "${label}" not on screen`);
    const b = await pad.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(ms);
    await page.mouse.up();
    await page.waitForTimeout(400);
  };

  const step = async (label, fn) => {
    await fn();
    const c = await counter();
    log(`${label.padEnd(22)} → ${c}   (${await pose()})`);
    return c;
  };

  await shot("00-opened");

  // 1 adjust-seat (info) — the tutorial's own button ticks it.
  await step("1 седалка", async () => {
    await closeTutorial();
  });
  await shot("01-seat");

  // 2 adjust-mirrors — three graded glances, all with the mouse. Left and rear
  //   are in the windscreen frame; the RIGHT one is not, which is why the card
  //   offers the head turn.
  await step("2 огледала", async () => {
    await closeTutorial();
    await clickHotspot("hotspot_mirror_left", "forward", { hold: 700 });
    await clickHotspot("hotspot_mirror_rear", "forward", { hold: 700 });
    await shot("02a-before-right-look");
    await clickText("Погледни към дясното огледало");
    await page.waitForTimeout(900);
    await shot("02b-looking-right");
    await clickHotspot("hotspot_mirror_right", "mirrorRight", { hold: 700 });
    // NOTE: do NOT click „↩ Погледни напред" here. The third glance completes
    // the step, the checklist advances, and its auto-look has ALREADY aimed
    // the head at the next step's control — clicking „forward" at that moment
    // undoes the instructor's own head turn (measured: it cancelled the
    // seat-belt look two steps later and the belt click then missed).
    await page.waitForTimeout(1200);
  });
  await shot("02-mirrors");

  // 3 check-surroundings (info)
  await step("3 обстановка", async () => {
    await closeTutorial();
  });

  // 4 fasten-seatbelt — the control 0.66 m below the eye. Instruction mode
  //    has already turned the head; the click lands in the belt pose.
  await step("4 колан", async () => {
    await closeTutorial();
    await page.waitForTimeout(900);
    await shot("04a-looking-down-at-belt");
    await clickHotspot("hotspot_belt", "belt");
    await page.waitForTimeout(900);
  });
  await shot("04-belt");

  // 5 check-dashboard (info)
  await step("5 табло", async () => {
    await closeTutorial();
  });

  // 6 headlights — the control the checklist used to stand on top of.
  await step("6 светлини", async () => {
    await closeTutorial();
    await shot("06a-light-switch-clear-of-panel");
    await clickHotspot("hotspot_headlights");
  });

  // 7 start-engine
  await step("7 двигател", async () => {
    await closeTutorial();
    await clickHotspot("hotspot_engine_start");
  });

  // 8 press-brake — THE step that used to read „няма контрола на таблото".
  await step("8 спирачка", async () => {
    await closeTutorial();
    await shot("08a-pedal-pads");
    await holdPedal("СПИРАЧКА", 900);
  });

  // 9 select-gear — P → R → N → D, three gate steps, left-click each.
  await step("9 предавка", async () => {
    await closeTutorial();
    await clickHotspot("hotspot_gear_selector", "forward", { times: 3 });
  });

  // 10 release-handbrake
  await step("10 ръчна", async () => {
    await closeTutorial();
    await clickHotspot("hotspot_parking_brake");
  });

  // 11 final-mirror-check — one more graded glance.
  await step("11 контролен поглед", async () => {
    await closeTutorial();
    await clickHotspot("hotspot_mirror_left", "forward", { hold: 700 });
  });

  // 12 signal — the stalk cycles; LEFT is the one that performs the step.
  await step("12 мигач", async () => {
    await closeTutorial();
    for (let i = 0; i < 3; i += 1) {
      await clickHotspot("hotspot_indicator_stalk");
      const c = await counter();
      if (c.startsWith("12")) break;
    }
  });

  // 13 move-off — hold the throttle pad with the mouse.
  const final = await step("13 потегляне", async () => {
    await closeTutorial();
    await holdPedal("ГАЗ", 1400);
  });

  await page.waitForTimeout(900);
  await shot("13-of-13");
  // …and a close-up of the panel itself, which is what the acceptance test
  // actually asks to see.
  const panel = page.locator('[data-hud="predrive-checklist"]').first();
  if ((await panel.count()) > 0) {
    const pb = await panel.boundingBox();
    if (pb) {
      const buf = await page.screenshot({
        clip: {
          x: Math.max(0, pb.x - 8),
          y: Math.max(0, pb.y - 8),
          width: pb.width + 16,
          height: pb.height + 16,
        },
      });
      writeFileSync(join(OUT, "13-of-13-panel.png"), buf);
      log("shot 13-of-13-panel.png");
    }
  } else {
    log("WARNING: the checklist panel is not on screen at 13/13");
  }

  const keys = await page.evaluate(() => window.__keys);
  log(`keys observed: ${keys.length === 0 ? "NONE (mouse-only ✓)" : keys.join(",")}`);
  log(`FINAL COUNTER: ${final}`);
  await browser.close();
  if (keys.length > 0) process.exitCode = 3;
  if (!final.startsWith("13/13")) process.exitCode = 2;
}

main().catch((e) => {
  log(`FAILED: ${e.message}`);
  process.exitCode = 1;
});
