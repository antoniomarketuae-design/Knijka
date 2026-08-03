#!/usr/bin/env node
// =============================================================================
// gpu-pass-timer.mjs — THE instrument that can see a frame-rate regression.
//
//   node gpu-pass-timer.mjs --scenario sc-signal-flashing --tier med --seconds 10
//   node gpu-pass-timer.mjs --lesson l2-intersections --tier high --drive 12
//   node gpu-pass-timer.mjs --scenario sc-mw-overtake --tier med --ablate-shadows
//   node gpu-pass-timer.mjs --scenario sc-mw-overtake --tier med --novsync
//
// WHY IT HAD TO BE BUILT (docs/simulation/87 „THE PHONE COST OF THE ART PASS")
// ---------------------------------------------------------------------------
// The project's only performance instrument counted DRAW CALLS and TRIANGLES
// and reported frame time as unmeasurable. Both halves of that are structural
// blind spots, not bad luck:
//
//   * Draw calls cannot see a render PASS. Enabling the shadow map adds one
//     depth-only pass over the whole scene; it moves the submission count by a
//     handful and the triangle count by ~0 %, and can still cost milliseconds.
//     The art-wave A/B measured "+2 draws / +0.38 % triangles" and honestly
//     concluded it could not detect a cost. It could not, because that metric
//     is incapable of detecting one.
//   * Wall-clock frame time in Chromium is VSYNC-CAPPED. Every cell of that
//     table read 16.5-16.8 ms because the panel refreshes at 60 Hz. An 8 ms
//     frame and a 15 ms frame are the same number on that instrument — it
//     saturates exactly where a regression would first appear.
//
// MEASURED ON THIS BOX, 2026-08-03, before a line of this was written:
//   EXT_disjoint_timer_query_webgl2  → EXPOSED (ANGLE/D3D11, GTX 1060 6GB)
//   --disable-frame-rate-limit --disable-gpu-vsync
//                                    → rAF median 16.9 ms → 0.2 ms (cap gone)
// So both options in the brief work here, and they answer DIFFERENT questions:
//
//   GPU TIMER QUERIES answer "what does each pass cost". They read the GPU's
//   own clock for the commands between beginQuery/endQuery, are unaffected by
//   vsync, and are the ONLY way to price the shadow map. Default mode.
//
//   VSYNC OFF answers "how much headroom is there". With the cap removed the
//   CPU stops waiting, so the rAF rate becomes the CPU submission rate and the
//   GPU total becomes the real ceiling. NOTE the trap: with vsync off, rAF
//   deltas no longer measure the frame — the CPU runs far ahead of the GPU
//   queue. Uncapped rAF is a CPU number. Do not quote it as fps.
//
// WHAT IT PRINTS
//   * one row per render-target region: shadow map, main scene, AO, bloom,
//     SMAA/tone-map/grade, final blit — in GPU milliseconds PER FRAME;
//   * a frame-delta histogram (p50/p95/p99/max + a stutter count), because
//     "it lags" and "it freezes" are two different defects with one sentence;
//   * the CPU/GPU split, so "it is not the GPU" is a conclusion this tool can
//     actually reach instead of assume.
//
// Frames + JSON land in --out (default: the OS temp scratchpad). NEVER the repo.
// =============================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(
  new URL("../clips/headless/pw.mjs", import.meta.url).href
);

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d;
};
const flag = (n) => argv.includes(`--${n}`);

const PORT = Number(opt("port", "4162"));
const BASE = opt("base", `http://localhost:${PORT}`);
/** low | med | high — the ENVIRONMENT tier name, not the UI's "medium". */
const TIER = opt("tier", "med");
const SCENARIO = opt("scenario", null);
const LESSON = opt("lesson", null);
const LEVEL = opt("level", "1");
const SECONDS = Number(opt("seconds", "10"));
/** Seconds of held throttle before (and during) the measurement. 0 = stand still. */
const DRIVE_S = Number(opt("drive", "0"));
const WARM_MS = Number(opt("warm", "20000"));
const WIDTH = Number(opt("width", "1280"));
const HEIGHT = Number(opt("height", "720"));
const NOVSYNC = flag("novsync");
const ABLATE_SHADOWS = flag("ablate-shadows");
/** Extra tiers to sweep in the SAME session after --tier (see the loop below). */
const MORE_TIERS = (opt("also-tiers", "") || "").split(",").filter(Boolean);
const TAG = opt("tag", "run");
const OUT = resolve(
  opt(
    "out",
    join(
      process.env.LOCALAPPDATA ?? process.env.TMPDIR ?? "/tmp",
      "Temp",
      "claude",
      "gpu-pass-timer",
    ),
  ),
);

/** lesson-ui speaks "medium"; the environment module speaks "med". */
const UI_TIER = TIER === "med" ? "medium" : TIER;

const GL_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];
/**
 * The vsync cap is what made the art wave's frame-time column meaningless.
 * These three remove it (verified on this box: rAF median 16.9 → 0.2 ms).
 */
const NOVSYNC_ARGS = [
  "--disable-frame-rate-limit",
  "--disable-gpu-vsync",
  "--disable-gpu-frame-rate-limit",
];
/**
 * `--run-all-compositor-stages-before-draw` is NOT in the set above, and that is
 * a measurement, not an oversight. It is in the brief, so it was tried: with it
 * on, an 8 s window produced 121 frames (66 ms/frame), an rAF max of 7.3 s and a
 * half-res AO pass reading 14.8 ms. It serializes the compositor, which is the
 * opposite of what a throughput measurement wants. Kept behind a flag so the
 * next person does not have to re-discover it.
 */
const COMPOSITOR_SYNC_ARGS = ["--run-all-compositor-stages-before-draw"];

const log = (m) => process.stderr.write(`[gpu] ${m}\n`);

function url() {
  // /dev/ghost-demo is the only login-free route that drives immediately (no
  // pre-drive gate) — but it hard-codes quality="medium". /dev/gw-shell and
  // /dev/hud-ux take ?quality=, which is how low and high are reachable.
  const q = new URLSearchParams();
  if (SCENARIO) {
    q.set("scenario", SCENARIO);
    q.set("level", LEVEL);
  } else {
    q.set("lesson", LESSON ?? "l2-intersections");
  }
  q.set("quality", UI_TIER);
  q.set("simPerf", "1");
  const route = opt("route", "gw-shell");
  return `${BASE}/dev/${route}?${q.toString()}`;
}

/** p-th percentile of an already-sorted array. */
function pct(sorted, p) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i];
}

function histogram(deltas) {
  const s = [...deltas].sort((a, b) => a - b);
  const over = (ms) => s.filter((d) => d > ms).length;
  return {
    frames: s.length,
    p50: pct(s, 50),
    p95: pct(s, 95),
    p99: pct(s, 99),
    max: s.length > 0 ? s[s.length - 1] : 0,
    /** Frames slower than 2× / 4× the 60 Hz budget — the "freeze" signal. */
    over33ms: over(33.4),
    over66ms: over(66.7),
    over200ms: over(200),
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const args = [
    ...GL_ARGS,
    ...(NOVSYNC ? NOVSYNC_ARGS : []),
    ...(flag("compositor-sync") ? COMPOSITOR_SYNC_ARGS : []),
  ];
  const browser = await chromium.launch({ headless: true, args });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  // MirrorRig / HeroCarBody read the STORE, not the prop — srt-drive.mjs found
  // this the hard way. Seed both so the whole scene is on one tier.
  await context.addInitScript(
    ([envTier, uiTier]) => {
      try {
        window.localStorage.setItem(
          "aidrive.sim.quality.v1",
          JSON.stringify({ setting: envTier, recommendation: envTier }),
        );
        window.localStorage.setItem("sim.quality", uiTier);
      } catch {}
    },
    [TIER, UI_TIER],
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => log(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    const t = m.text();
    if (t.startsWith("[sim-gpu]") || t.startsWith("[sim-perf] tier=")) log(t);
  });

  const target = url();
  log(`${target}`);
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 900_000 });
  await page.waitForSelector("canvas", { timeout: 300_000 });
  log(`canvas up; warming ${WARM_MS / 1000}s (shader compile + texture upload)`);
  await page.waitForTimeout(WARM_MS);

  const have = await page.evaluate(() => typeof window.__simPerf?.gpuStart === "function");
  if (!have) {
    log("FATAL: window.__simPerf.gpuStart is absent — is ?simPerf=1 on the URL and PerfProbe mounted?");
    await browser.close();
    process.exit(70);
  }

  if (DRIVE_S > 0) {
    await page.keyboard.down("KeyW");
    log(`throttle held (${DRIVE_S}s of drive around the window)`);
    await page.waitForTimeout(Math.min(DRIVE_S, 4) * 1000);
  }

  async function measure(labelText) {
    await page.evaluate(() => {
      window.__simPerf.frameDeltas();
      window.__simPerf.gpuStart();
    });
    await page.waitForTimeout(SECONDS * 1000);
    const out = await page.evaluate(() => ({
      report: window.__simPerf.gpuStop(),
      deltas: window.__simPerf.frameDeltas(),
      ghost: window.__ghostDemo ?? null,
    }));
    const hist = histogram(out.deltas ?? []);
    log(
      `${labelText}: GPU ${out.report.gpuMsPerFrameTotal.toFixed(2)} ms/frame` +
        ` · rAF p50 ${hist.p50.toFixed(2)} ms p99 ${hist.p99.toFixed(1)} max ${hist.max.toFixed(1)}` +
        ` · >33ms ${hist.over33ms} >66ms ${hist.over66ms}`,
    );
    return { ...out, hist, label: labelText };
  }

  const runs = [];
  runs.push(await measure(ABLATE_SHADOWS ? `${TIER} · shadows ON` : `${TIER} · baseline`));

  if (ABLATE_SHADOWS) {
    await page.evaluate(() => window.__simPerf.setShadows(false));
    // A material recompile is not free and must not land inside the window.
    await page.waitForTimeout(4000);
    runs.push(await measure(`${TIER} · shadows OFF`));
    await page.evaluate(() => window.__simPerf.setShadows(true));
  }

  // ---- extra tiers, IN THE SAME BROWSER SESSION -----------------------------
  //
  // Not a convenience. Three separate `node` invocations meant three fresh page
  // loads, and on this box every load raced a Turbopack recompile: the dev
  // server re-invalidates `/dev/gw-shell` each time ANOTHER agent touches a
  // `content/*.json` the lesson compiler imports, and a recompile on a 7200 rpm
  // disk runs 5-15 minutes. Two full sweeps were lost to it. Changing only the
  // QUERY STRING re-mounts the React tree against the SAME compiled entry, so
  // the tier sweep pays the compile once — and, as a bonus, all three tiers are
  // then measured against one browser process, one GPU context and one thermal
  // state, which is a better comparison than three cold starts anyway.
  for (const extra of MORE_TIERS) {
    const uiExtra = extra === "med" ? "medium" : extra;
    const nextUrl = target.replace(/quality=[^&]*/, `quality=${uiExtra}`);
    log(`→ tier ${extra}: ${nextUrl}`);
    await page.evaluate(
      ([envTier, uiTier]) => {
        try {
          window.localStorage.setItem(
            "aidrive.sim.quality.v1",
            JSON.stringify({ setting: envTier, recommendation: envTier }),
          );
          window.localStorage.setItem("sim.quality", uiTier);
        } catch {}
      },
      [extra, uiExtra],
    );
    await page.goto(nextUrl, { waitUntil: "domcontentloaded", timeout: 900_000 });
    await page.waitForSelector("canvas", { timeout: 300_000 });
    await page.waitForTimeout(WARM_MS);
    const ok = await page.evaluate(() => typeof window.__simPerf?.gpuStart === "function");
    if (!ok) {
      log(`tier ${extra}: __simPerf missing after navigation — skipped`);
      continue;
    }
    runs.push(await measure(`${extra} · baseline`));
    writeFileSync(join(OUT, `${TAG}-${SCENARIO ?? LESSON ?? "lesson"}-${extra}.png`), await page.screenshot());
  }

  if (DRIVE_S > 0) await page.keyboard.up("KeyW");

  const stem = `${TAG}-${SCENARIO ?? LESSON ?? "lesson"}-${TIER}${NOVSYNC ? "-novsync" : ""}`;
  const shot = join(OUT, `${stem}.png`);
  writeFileSync(shot, await page.screenshot());
  log(`frame → ${shot}`);

  const payload = {
    tag: TAG,
    url: target,
    tier: TIER,
    vsync: NOVSYNC ? "disabled" : "enabled (60 Hz cap)",
    viewport: `${WIDTH}x${HEIGHT}`,
    seconds: SECONDS,
    driveSeconds: DRIVE_S,
    runs: runs.map((r) => ({ label: r.label, report: r.report, hist: r.hist, ghost: r.ghost })),
    recordedAt: new Date().toISOString(),
  };
  const jsonPath = join(OUT, `${stem}.json`);
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  log(`json  → ${jsonPath}`);

  // Human-readable, on stdout, so a shell pipeline keeps it.
  for (const r of runs) {
    process.stdout.write(`\n### ${stem} — ${r.label}\n`);
    process.stdout.write(
      `GPU total ${r.report.gpuMsPerFrameTotal.toFixed(2)} ms/frame ` +
        `(⇒ ${(1000 / Math.max(r.report.gpuMsPerFrameTotal, 0.001)).toFixed(0)} fps GPU-bound) · ` +
        `renderer ${r.report.glRenderer} · buffer ${r.report.drawingBuffer} · ` +
        `frames ${r.report.frames} · dropped ${r.report.droppedQueries} · disjoint ${r.report.disjointEvents}\n`,
    );
    process.stdout.write(
      `rAF p50 ${r.hist.p50.toFixed(2)} ms · p95 ${r.hist.p95.toFixed(2)} · p99 ${r.hist.p99.toFixed(1)} · ` +
        `max ${r.hist.max.toFixed(1)} · >33ms ${r.hist.over33ms} · >66ms ${r.hist.over66ms} · >200ms ${r.hist.over200ms}\n\n`,
    );
    process.stdout.write("| pass | ms/frame | % | draws | enters | samples | key | shader uniforms |\n");
    process.stdout.write("|---|--:|--:|--:|--:|--:|---|---|\n");
    for (const row of r.report.rows) {
      const p = r.report.gpuMsPerFrameTotal > 0 ? (100 * row.gpuMsPerFrame) / r.report.gpuMsPerFrameTotal : 0;
      process.stdout.write(
        `| ${row.label} | ${row.gpuMsPerFrame.toFixed(3)} | ${p.toFixed(1)} | ` +
          `${row.drawsPerFrame.toFixed(1)} | ${row.entriesPerFrame.toFixed(2)} | ${row.samples} | ` +
          `\`${row.key}\` | \`${(row.shader ?? "").slice(0, 70)}\` |\n`,
      );
    }
  }

  await browser.close();
}

await main();
