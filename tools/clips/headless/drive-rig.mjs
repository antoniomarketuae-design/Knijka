// THE DRIVE RIG DRIVER — script a drive on /dev/drive-rig, read the whole
// telemetry back, print the table.
//
// WHY THIS REPLACES srt-drive.mjs FOR REVIEW ROWS
// ---------------------------------------------------------------------------
// srt-drive.mjs drives /dev/ghost-demo, which mounts a BARE LessonScene: it can
// tell you where the car is, and it can never show you a fault card, because no
// lesson shell is mounted. /dev/gw-shell mounts the shell and shows the cards,
// and publishes nothing about the car. So „was that conviction correct?" had no
// answer anywhere (register rows B15, B29).
//
// /dev/drive-rig mounts the REAL shell AND publishes per-tick telemetry into a
// ring buffer, and this script drives it CLOSED-LOOP: the in-page controller
// holds a speed and brakes to a stop AT a point, instead of holding W and
// hoping. A drive that was specified as „stop at the line" now actually stops
// at the line, so a card that appears anyway is a finding rather than a doubt.
//
//   node drive-rig.mjs --scenario sc-junction-stop --level 1 \
//        --script '[{"label":"approach","speedKmh":20,"stopAt":{"x":0,"y":40}}, …]'
//   node drive-rig.mjs --scenario sc-junction-stop --probe 14
//   node drive-rig.mjs --lesson l2-intersections --script @plan.json
//
// --probe N drives a plain N-second 20 km/h roll first and prints the objective
// geometry, so the next run's stop points are COPIED rather than guessed.
//
// Writes PNGs + the full telemetry JSON to --out (default: the scratchpad).
// Frames NEVER go in the repo.

import { chromium } from "./pw.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d;
};

const BASE = opt("base", "http://localhost:3200");
const SCENARIO = opt("scenario", null);
const LESSON = opt("lesson", null);
const LEVEL = opt("level", "1");
const TAG = opt("tag", "drive");
const OUT = opt(
  "out",
  "C:\\Users\\Ljh\\AppData\\Local\\Temp\\claude\\E--AI-driver\\8942546c-780e-450f-ae95-3aa94e28222a\\scratchpad\\driverig",
);
const WARM_MS = Number(opt("warm", "20000"));
const BUDGET_S = Number(opt("budget", "240"));
const EVERY = Number(opt("every", "30")); // table decimation: 30 frames ≈ 0.5 s
const PROBE_S = Number(opt("probe", "0"));
const QUALITY = opt("quality", "medium");
// Keys tapped ONCE before the drive starts. KeyB is the seatbelt: the car
// spawns unbuckled, and an unbuckled car that starts moving trips a teach
// moment which PAUSES the scene about two seconds into every drive. Buckling
// first is what a student does; not buckling first is why the first run of this
// rig produced three samples.
const PRE_KEYS = (opt("pre", "KeyB") || "").split(",").filter(Boolean);
/** 0 disables the auto-acknowledge of teach/quiz cards (leave them on screen). */
const ACK = opt("ack", "1") !== "0";
/**
 * `--fullscreen on|off` — the state the shell is FORCED into before anything
 * is measured. Default `on`, which is what a student gets. See settleFullscreen.
 */
const FULLSCREEN = opt("fullscreen", "on");

let SCRIPT = opt("script", null);
if (SCRIPT && SCRIPT.startsWith("@")) SCRIPT = readFileSync(SCRIPT.slice(1), "utf8");

const GL_ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];
const log = (m) => process.stderr.write(`[drive-rig] ${m}\n`);

function table(dump, every) {
  const rows = dump.samples.filter((_, i) => i % every === 0);
  // Stamp each row with anything that fired between it and the previous row, so
  // the table answers "what was the car doing when the card appeared".
  const evs = dump.events;
  const head = [
    "t(s)".padStart(7),
    "wall(s)".padStart(8),
    "v(km/h)".padStart(8),
    "x".padStart(8),
    "y".padStart(8),
    "hdg".padStart(5),
    "thr".padStart(5),
    "brk".padStart(5),
    "phase".padEnd(9),
    "obj".padStart(4),
    "step".padEnd(16),
    "events",
  ].join(" ");
  const lines = [head, "-".repeat(head.length + 10)];
  let prevT = -Infinity;
  for (const s of rows) {
    const fired = evs
      .filter((e) => e.tSec > prevT && e.tSec <= s.tSec)
      .map((e) => `${e.channel}:${e.code ?? e.kind}`)
      .join(",");
    prevT = s.tSec;
    lines.push(
      [
        s.tSec.toFixed(2).padStart(7),
        (s.wallMs / 1000).toFixed(2).padStart(8),
        s.speedKmh.toFixed(1).padStart(8),
        s.x.toFixed(2).padStart(8),
        s.y.toFixed(2).padStart(8),
        s.headingDeg.toFixed(0).padStart(5),
        s.throttle.toFixed(2).padStart(5),
        s.brake.toFixed(2).padStart(5),
        s.phase.padEnd(9),
        `${s.activeObjective}/${s.objectiveCount}`.padStart(4),
        (s.stepIndex >= 0 ? `${s.stepIndex} ${s.stepLabel}` : "-").slice(0, 16).padEnd(16),
        fired,
      ].join(" "),
    );
  }
  return lines.join("\n");
}

/**
 * FORCE THE FULLSCREEN STATE, THEN SAY WHAT THE CANVAS ACTUALLY IS.
 *
 * `LessonPlayShell` asks for fullscreen in a MOUNT EFFECT, and the Fullscreen
 * API only grants that while the click that navigated here still counts as
 * transient user activation. A headless run has no click. Chrome therefore
 * grants it sometimes and rejects it other times, and the shell lays out
 * differently either way — measured on identical invocations of this rig, the
 * canvas came back 1264×620 on one run and 1028×577 on the next. EVERY frame
 * and every pixel measurement this project publishes is taken through that,
 * and nothing was pinning it.
 *
 * A synthetic `window.__driveRig.press("KeyX")` cannot fix it: a script-made
 * KeyboardEvent is not trusted and carries no activation, so the request is
 * refused. `page.keyboard.press` goes through CDP `Input.dispatchKeyEvent` and
 * IS trusted — that is the whole reason this uses the real keyboard for one
 * key while the drive itself uses the rig's injector.
 *
 * The state is then VERIFIED, not assumed, and the achieved geometry is logged
 * beside every run so a frame can be read against the size it was taken at.
 * Refusing to settle is a soft failure: an unpinned geometry is exactly the
 * kind of quiet variance that makes two runs disagree and nobody able to say
 * why.
 */
async function settleFullscreen(page, want, softFailures) {
  const read = () =>
    page.evaluate(() => {
      const c = document.querySelector("canvas");
      const r = c ? c.getBoundingClientRect() : null;
      return {
        fs: document.fullscreenElement !== null,
        supported: typeof document.documentElement.requestFullscreen === "function",
        w: r ? Math.round(r.width) : 0,
        h: r ? Math.round(r.height) : 0,
        dpr: window.devicePixelRatio,
      };
    });

  const target = want !== "off";
  let state = await read();
  if (state.fs !== target) {
    if (!state.supported && target) {
      softFailures.push("fullscreen: the browser has no Element.requestFullscreen — geometry unpinned");
      log(`  fullscreen UNAVAILABLE — canvas ${state.w}x${state.h} is not pinned`);
      return state;
    }
    // A trusted key press. The shell binds KeyX -> toggleFullscreen.
    await page.keyboard.press("KeyX");
    try {
      await page.waitForFunction(
        (t) => (document.fullscreenElement !== null) === t,
        target,
        { timeout: 5000 },
      );
    } catch {
      /* fall through to the verify below — it reports the real state */
    }
    state = await read();
  }

  if (state.fs !== target) {
    softFailures.push(
      `fullscreen: asked for ${target ? "ON" : "OFF"}, got ${state.fs ? "ON" : "OFF"} — ` +
        `canvas geometry is NOT pinned for this run`,
    );
    log(`  fullscreen NOT SETTLED (wanted ${target ? "on" : "off"}) — canvas ${state.w}x${state.h}`);
  } else {
    log(`  fullscreen ${state.fs ? "ON" : "OFF"} (forced) — canvas ${state.w}x${state.h} @dpr ${state.dpr}`);
  }
  return state;
}

async function main() {
  if (!SCENARIO && !LESSON) {
    console.error("usage: node drive-rig.mjs --scenario <id> [--level N] [--script <json|@file>] [--probe SEC]");
    process.exit(64);
  }
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: GL_ARGS });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await context.addInitScript((tier) => {
    try {
      const envTier = tier === "medium" ? "med" : tier;
      window.localStorage.setItem("aidrive.sim.quality.v1", JSON.stringify({ setting: envTier, recommendation: envTier }));
      window.localStorage.setItem("sim.quality", tier);
    } catch {}
  }, QUALITY);
  const page = await context.newPage();

  // A rig exists to produce EVIDENCE. An exception thrown inside the scene used
  // to be one `log()` line that scrolled past under a hundred telemetry rows,
  // and the run went on to print a full table and exit 0 — a drive that looked
  // authoritative while the thing being driven was broken. That is precisely how
  // a row gets "closed" against a frame nobody should have trusted. Collect them
  // and fail the run at the end: the frames and the table are still written (you
  // want to look at them), but the exit code and a banner say do not trust this.
  const pageErrors = [];
  page.on("pageerror", (e) => {
    pageErrors.push(e?.stack ?? String(e));
    log(`pageerror: ${e.message}`);
  });
  /** Non-fatal-at-the-time failures that still invalidate the drive. */
  const softFailures = [];

  const q = SCENARIO
    ? `scenario=${encodeURIComponent(SCENARIO)}&level=${LEVEL}`
    : `lesson=${encodeURIComponent(LESSON)}`;
  const url = `${BASE}/dev/drive-rig?${q}&quality=${QUALITY}`;
  log(`loading ${url}`);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "load", timeout: 300_000 });
  await page.waitForSelector("canvas", { timeout: 300_000 });
  log(`canvas in ${((Date.now() - t0) / 1000).toFixed(1)}s — warming ${WARM_MS}ms`);
  await page.waitForTimeout(WARM_MS);

  await page.waitForFunction(() => window.__driveRig?.ready === true, { timeout: 120_000 });
  const meta = await page.evaluate(() => window.__driveRig.dump(99999).meta);
  log(`rig v${meta.version} on ${meta.lessonId} — ${meta.objectives.length} objectives`);
  for (const o of meta.objectives) {
    log(`  obj ${o.index} ${o.id} [${o.kind}] ${o.x !== undefined ? `x=${o.x} y=${o.y} r=${o.radiusM}` : "(no zone)"} — ${o.titleBg}`);
  }

  // The scene keeps keyboard focus on the document; a stray focused element
  // would eat the synthetic glance keys.
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());

  // Pin the geometry BEFORE the first frame is taken (see settleFullscreen).
  const viewportState = await settleFullscreen(page, FULLSCREEN, softFailures);

  for (const code of PRE_KEYS) {
    await page.evaluate((c) => {
      window.__driveRig.press(c);
      window.setTimeout(() => window.__driveRig.release(c), 120);
    }, code);
    await page.waitForTimeout(300);
    log(`  pre-key ${code}`);
  }

  let steps;
  if (PROBE_S > 0) {
    steps = [{ label: "probe roll", speedKmh: 20, forSec: PROBE_S }];
  } else if (SCRIPT) {
    steps = JSON.parse(SCRIPT);
  } else {
    steps = [{ label: "roll", speedKmh: 20, forSec: 10 }];
  }
  log(`running ${steps.length} step(s): ${steps.map((s) => s.label ?? `${s.speedKmh}km/h`).join(" → ")}`);
  await page.evaluate((s) => window.__driveRig.run(s), steps);
  await page.evaluate(() => window.__driveRig.clear());

  // Poll until the script finishes; shoot a frame on every step handover.
  const deadline = Date.now() + BUDGET_S * 1000;
  let lastStep = -1;
  let shots = 0;
  let lastTick = -1;
  let stalledSince = 0;
  const heldShot = new Set();
  const ackBtn = page.locator('button:has-text("Разбрах")');
  for (;;) {
    const st = await page.evaluate(() => window.__driveRig.status());

    // A teach moment / quiz / consequence card PAUSES the scene, which stops
    // onTick — so the telemetry clock freezing IS the pause signal. Shoot the
    // card first (that frame is the evidence), then acknowledge it the way a
    // student does: click the button, no synthetic Space (Space is also the
    // parking brake when no card is open).
    const live = await page.evaluate(() => window.__driveRig.last?.tSec ?? -1);
    if (live === lastTick) {
      if (stalledSince === 0) stalledSince = Date.now();
      else if (ACK && Date.now() - stalledSince > 1200 && (await ackBtn.count()) > 0) {
        const name = `${TAG}-card-t${live.toFixed(1)}`;
        writeFileSync(join(OUT, `${name}.png`), await page.screenshot());
        shots += 1;
        log(`  card frame ${name}.png — acknowledging`);
        // If the card never got acknowledged the car never resumed, so every
        // step after this one is a drive that did not happen. Record it.
        await ackBtn
          .first()
          .click({ timeout: 5000 })
          .catch((e) => {
            softFailures.push(`ack failed at t=${live.toFixed(1)}s: ${e?.message ?? e}`);
            log(`  ack failed: ${e}`);
          });
        await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
        stalledSince = 0;
      }
    } else {
      lastTick = live;
      stalledSince = 0;
    }

    // A step that HOLDS keys is photographed MID-hold, not at its handover.
    // The handover frame is taken as the keys are released — which is how the
    // first held-right-glance run came back with the head already swung home,
    // i.e. a frame of exactly the thing the row is not about.
    if (st.heldKeys.length > 0 && !heldShot.has(st.stepIndex) && st.elapsedSec > 1.5) {
      heldShot.add(st.stepIndex);
      const s = await page.evaluate(() => window.__driveRig.last);
      const name = `${TAG}-held-${st.heldKeys.join("+")}-t${(s?.tSec ?? 0).toFixed(1)}-v${(s?.speedKmh ?? 0).toFixed(0)}`;
      writeFileSync(join(OUT, `${name}.png`), await page.screenshot());
      log(`  held frame ${name}.png`);
      shots += 1;
    }

    if (st.stepIndex !== lastStep) {
      lastStep = st.stepIndex;
      const s = await page.evaluate(() => window.__driveRig.last);
      const name = `${TAG}-step${String(Math.max(0, lastStep)).padStart(2, "0")}-t${(s?.tSec ?? 0).toFixed(1)}-v${(s?.speedKmh ?? 0).toFixed(0)}`;
      writeFileSync(join(OUT, `${name}.png`), await page.screenshot());
      log(`  shot ${name}.png`);
      shots += 1;
    }
    if (st.finished || Date.now() > deadline) break;
    await page.waitForTimeout(250);
  }
  // One last frame at the end of the drive.
  const endSample = await page.evaluate(() => window.__driveRig.last);
  const endName = `${TAG}-end-t${(endSample?.tSec ?? 0).toFixed(1)}-v${(endSample?.speedKmh ?? 0).toFixed(0)}`;
  writeFileSync(join(OUT, `${endName}.png`), await page.screenshot());
  shots += 1;

  const dump = await page.evaluate(() => window.__driveRig.dump());
  // The geometry every frame in this run was measured through, stored WITH the
  // telemetry — a PNG whose canvas size is not recorded cannot be compared to
  // the next one.
  dump.viewport = { requested: FULLSCREEN, ...viewportState };
  writeFileSync(join(OUT, `${TAG}-telemetry.json`), JSON.stringify(dump, null, 2));

  // INTEGRITY CHECK. The session clock is monotonic per SimTick's contract, so
  // a backwards step means the SCENE REMOUNTED mid-drive (a Fast Refresh, a
  // retry, a respawn) and the run is TWO drives spliced together. Silently
  // splicing them is how "one run in five looked wrong and nobody could say
  // why" happens, so it is reported loudly instead.
  let resets = 0;
  for (let i = 1; i < dump.samples.length; i++) {
    if (dump.samples[i].tSec < dump.samples[i - 1].tSec - 0.001) resets += 1;
  }
  if (resets > 0) {
    console.log(
      `\n!! SESSION CLOCK RESET ${resets}× — the scene remounted mid-drive. This telemetry is\n` +
        `!! more than one drive spliced together; re-run before trusting any row of it.`,
    );
  }

  console.log(
    `\n=== ${dump.meta.lessonId} — ${dump.meta.sampleCount} samples, ${dump.events.length} events, ` +
      `${shots} frames @ canvas ${viewportState.w}x${viewportState.h} ` +
      `(fullscreen ${viewportState.fs ? "on" : "off"}, asked ${FULLSCREEN}) ===\n`,
  );
  console.log(table(dump, EVERY));
  console.log("\n--- step log ---");
  for (const l of dump.script.log) {
    console.log(
      `  ${l.index} "${l.label}" ${l.startedAtSec.toFixed(2)}s → ${l.endedAtSec.toFixed(2)}s (${l.reason})  at x=${l.x.toFixed(2)} y=${l.y.toFixed(2)} v=${l.speedKmh.toFixed(1)}km/h`,
    );
  }
  console.log("\n--- events ---");
  if (dump.events.length === 0) console.log("  (none)");
  for (const e of dump.events) {
    console.log(
      `  t=${e.tSec.toFixed(2)}s [${e.channel}] ${e.kind}${e.code ? ` ${e.code}` : ""}${e.detail ? ` <${e.detail}>` : ""}${e.severity ? ` (${e.severity} ${e.points}pt)` : ""} at x=${e.x.toFixed(2)} y=${e.y.toFixed(2)} v=${e.speedKmh.toFixed(1)}km/h  ${e.titleBg ?? ""}`,
    );
  }
  console.log(`\nframes + telemetry → ${OUT}`);

  await browser.close();

  if (pageErrors.length > 0 || softFailures.length > 0) {
    console.error(`\n!! THIS DRIVE IS NOT EVIDENCE — ${pageErrors.length} page error(s), ${softFailures.length} soft failure(s):`);
    for (const e of pageErrors) console.error(`  pageerror: ${e}`);
    for (const s of softFailures) console.error(`  ${s}`);
    console.error("!! the frames above were still written so you can look at them, but do not close a row on this run.\n");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  log(`FAILED: ${e?.stack ?? e}`);
  process.exit(1);
});
