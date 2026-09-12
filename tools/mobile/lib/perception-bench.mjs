#!/usr/bin/env node
/**
 * perception-bench.mjs — EVERY PERCEPTION CLAIM, REPLAYED AGAINST THE FRAMES
 * THAT ARE ALREADY ON DISK.
 *
 * WHAT IT ANSWERS, and it is deliberately two questions and not one:
 *
 *   · HOW MANY TURN DEMANDS MOVE FROM REFUSED TO CONFIDENT. This is the prize:
 *     zero of the 97 lanes on lessons demanding ≥30° of turn is on-line, and
 *     the reason is that the loop is never allowed a manoeuvre where the turn
 *     is.
 *   · AND HOW MANY FALSE COMMANDS THE SAME CHANGE WOULD HAVE PRODUCED. A
 *     change that admits everything is worse than the gate it replaces, and a
 *     bench that reports only the first number cannot tell the difference.
 *
 * THE TRUTH IT GRADES AGAINST IS NOT THE PERCEPTION'S OWN. It is the bearing
 * to a look-ahead point on the product's demonstrated correct drive, computed
 * in `perception-truth.mjs` from the chassis pose probe and the shadow trace —
 * two artefacts the pixel scan cannot touch.
 *
 * ── WHAT A NUMBER FROM THIS BENCH IS NOT ───────────────────────────────────
 *
 *  1. IT IS NOT A DRIVE. Replaying stored frames measures what the perception
 *     WOULD HAVE SEEN on the path the car actually took. It cannot show what
 *     the car would have done differently, because a different command puts
 *     the car somewhere the corpus has no photograph of. Closed-loop gain is
 *     `route-fidelity.mjs` on a fresh sweep, and this bench cannot pre-empt it.
 *  2. IT SEES MORE TEAL THAN THE DRIVE DID. The live HUD masks are computed
 *     from the DOM at scan time and are not recorded, so a replay cannot
 *     reproduce them. That biases the furniture measurement toward finding
 *     furniture the drive had already masked — i.e. it OVERSTATES what B has
 *     left to do, and understates nothing.
 *  3. THE FRAME AND THE SCAN ARE TWO PHOTOGRAPHS. `04-t###s.png` is written by
 *     the drive's own beat, a few hundred milliseconds from the scan the
 *     control law ran. Measured over 154 paired samples: replayed band pixels
 *     over recorded, median 1.00 (p10 0.47, p90 2.60); |errDeg| difference
 *     median 1.00°, p90 16.7°; seen/not-seen agrees on 136 of 142.
 *
 * USAGE
 *   node tools/mobile/lib/perception-bench.mjs --cache <dir> --build [--all-lessons]
 *   node tools/mobile/lib/perception-bench.mjs --cache <dir> [--lessons a,b]
 *        [--variant base|A|AB|ABC] [--json out]
 *
 * `--build` decodes the recorded PNGs into the packed-mask cache
 * (`perception-corpus.mjs`) once; every later run reads that and takes about a
 * minute. Without `--variant` it prints all four, so each of A, B and C can be
 * priced on its own against both the failing lessons and the shipping regime.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CONFIDENT_LINE_PX, TUNE, aimFrom, readAim } from "./guidance.mjs";
import { createFurnitureRegister } from "./perception.mjs";
import { NAMED_FAILING, buildLaneCache, laneDirs, loadCache, scanFromMask } from "./perception-corpus.mjs";
import { calibrateSign, demandAt, loadTrace } from "./perception-truth.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");

/**
 * A demand this size is a TURN, not a lane correction — the same
 * `SUSTAIN_DEG` the control law uses, so the bench counts the thing the law
 * would have to authorise and not a friendlier proxy.
 */
export const TURN_DEG = TUNE.SUSTAIN_DEG;

/** The four variants, so each of A, B and C can be priced on its own. */
export const VARIANTS = Object.freeze({
  base: { shape: false, furniture: false, chevron: false },
  A: { shape: true, furniture: false, chevron: false },
  AB: { shape: true, furniture: true, chevron: false },
  ABC: { shape: true, furniture: true, chevron: true },
});

/** Evaluate one lane under one variant. Returns per-frame decisions. */
export function runLane(c, variant, P = {}) {
  const v = VARIANTS[variant] ?? VARIANTS.ABC;
  // THE REGISTER IS FED CAUSALLY, frame by frame, in order — the same thing a
  // live drive does, which reaches frame N having already seen 1..N−1 and
  // nothing after it. A pre-warm over the whole lane would let the bench
  // subtract furniture using frames the drive had not taken yet, which is a
  // bench measuring a harness that cannot exist.
  const reg = v.furniture ? createFurnitureRegister({ w: c.w, h: c.h, dpr: c.dpr }) : null;
  const out = [];
  for (let i = 0; i < c.frames.length; i++) {
    const f = c.frames[i];
    const scan = scanFromMask(c.bitsOf(i), c.w, c.h);
    scan.mask = c.bitsOf(i);
    let aim;
    if (!v.shape) {
      aim = { ...aimFrom(scan), signal: "mass" };
    } else {
      aim = readAim(scan, {
        register: reg,
        moving: movingAt(c, f.tSec),
        dpr: c.dpr,
        perception: {
          ...P,
          // C off = the arrow may not become the aim point. A and B still
          // apply — the plate is still kept out of the road's mass — so the
          // price of C on its own is visible in the ledger.
          chevronMinLeanFrac: v.chevron ? P.chevronMinLeanFrac : 1e9,
        },
      });
    }
    out.push({ i, tSec: f.tSec, total: f.total, aim, errDeg: aim.seen && aim.aimPx !== null ? aim.aimPx * c.degPerPx : null });
  }
  return out;
}

/** the LIVE, masked decision recorded on that tick, or null if there is none */
export function liveFor(c) {
  return (tSec) => (c.samples || []).filter((s) => s.tSec === tSec && s.seen !== undefined).pop() ?? null;
}

const movingAt = (c, tSec) => {
  const s = (c.samples || []).filter((x) => x.tSec === tSec).pop();
  return !s || s.kmh === undefined ? true : s.kmh >= 2;
};

/** The independent answer for every frame of a lane, or nulls where it refuses. */
export function truthFor(c, sign) {
  const poses = (c.samples || [])
    .filter((s) => s.wx !== null && s.wx !== undefined && s.wz !== null && s.wz !== undefined)
    .map((s) => ({ tSec: s.tSec, x: s.wx, z: s.wz }));
  const trace = loadTrace(c.lesson, REPO);
  return (tSec) => {
    if (!trace || poses.length < 6) return { ok: false, why: "no trace or no poses" };
    let bi = -1;
    for (let i = 0; i < poses.length; i++) if (poses[i].tSec === tSec) bi = i;
    if (bi < 0) return { ok: false, why: "no pose at this frame's tick" };
    return demandAt({ trace, poses, i: bi, sign });
  };
}

function tally() {
  return {
    frames: 0,
    withTruth: 0,
    turnDemands: 0,
    turnSeen: 0,
    turnConfident: 0,
    turnConfidentRight: 0,
    turnConfidentWrong: 0,
    anyCommand: 0,
    anyCommandWrong: 0,
    confidentAny: 0,
    confidentWrong: 0,
    /* ── AND THE SAME QUESTION ASKED OF THE LIVE RECORD, NOT OF THE REPLAY ──
     * `base` above is this bench's own replay of today's gate, which sees an
     * UNMASKED band and is therefore optimistic about how often the gate
     * opened. The recorded sample's `confident` field is what the live, masked
     * loop actually decided on that tick. `rescued` counts turn demands the
     * LIVE loop refused and the variant would authorise — the brief's
     * „refused → confident" — with the agreeing and disagreeing halves apart,
     * because a rescue that steers the wrong way is not a rescue. */
    liveRefusedTurns: 0,
    rescued: 0,
    rescuedRight: 0,
    rescuedWrong: 0,
    signal: { mass: 0, line: 0, chevron: 0, fragment: 0, none: 0 },
    fixedPx: 0,
    lanes: 0,
  };
}

function fold(t, rows, truth, live = () => null) {
  t.lanes += 1;
  for (const r of rows) {
    t.frames += 1;
    t.signal[r.aim.signal ?? "mass"] = (t.signal[r.aim.signal ?? "mass"] ?? 0) + 1;
    if (r.aim.shape) t.fixedPx += r.aim.shape.fixedPx;
    const g = truth(r.tSec);
    if (!g.ok) continue;
    t.withTruth += 1;
    const demand = Math.abs(g.demandDeg);
    const isTurn = demand >= TURN_DEG;
    if (isTurn) t.turnDemands += 1;
    const rec = live(r.tSec);
    if (isTurn && rec && rec.confident !== true) {
      t.liveRefusedTurns += 1;
      if (r.aim.confident && r.aim.seen && r.errDeg !== null) {
        t.rescued += 1;
        if (Math.sign(r.errDeg) === Math.sign(g.demandDeg)) t.rescuedRight += 1;
        else t.rescuedWrong += 1;
      }
    }
    if (!r.aim.seen || r.errDeg === null) continue;
    const agrees = Math.sign(r.errDeg) === Math.sign(g.demandDeg);
    // "A command" = past the deadband, i.e. the loop would move the wheel.
    if (Math.abs(r.errDeg) > TUNE.DEAD_DEG && demand > TUNE.DEAD_DEG) {
      t.anyCommand += 1;
      if (!agrees) t.anyCommandWrong += 1;
    }
    if (r.aim.confident) {
      t.confidentAny += 1;
      if (Math.abs(r.errDeg) > TUNE.DEAD_DEG && demand > TUNE.DEAD_DEG && !agrees) t.confidentWrong += 1;
    }
    if (isTurn) {
      t.turnSeen += 1;
      if (r.aim.confident) {
        t.turnConfident += 1;
        if (agrees) t.turnConfidentRight += 1;
        else t.turnConfidentWrong += 1;
      }
    }
  }
}

const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + "%" : "  —  ");

export function report(name, t) {
  return (
    `${name.padEnd(5)} lanes ${String(t.lanes).padStart(4)}  frames ${String(t.frames).padStart(5)}  truth ${String(t.withTruth).padStart(5)}  ` +
    `turn-demands ${String(t.turnDemands).padStart(4)}  seen ${String(t.turnSeen).padStart(4)}  ` +
    `CONFIDENT ${String(t.turnConfident).padStart(4)} (${pct(t.turnConfident, t.turnDemands)})  ` +
    `of which wrong-way ${String(t.turnConfidentWrong).padStart(3)} (${pct(t.turnConfidentWrong, t.turnConfident)})  ` +
    `| all commands ${String(t.anyCommand).padStart(5)} wrong ${String(t.anyCommandWrong).padStart(4)} (${pct(t.anyCommandWrong, t.anyCommand)})  ` +
    `| LIVE-refused turns ${String(t.liveRefusedTurns).padStart(4)} rescued ${String(t.rescued).padStart(4)} ` +
    `(right ${String(t.rescuedRight).padStart(4)} wrong ${String(t.rescuedWrong).padStart(3)})  ` +
    `| signal line/chev/frag ${t.signal.line}/${t.signal.chevron}/${t.signal.fragment}`
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * CLI
 * ═══════════════════════════════════════════════════════════════════════════ */
function main(argv) {
  const arg = (k, d = null) => {
    const i = argv.indexOf(k);
    return i < 0 ? d : argv[i + 1];
  };
  const has = (k) => argv.includes(k);
  const cacheDir = arg("--cache", join(REPO, ".audit-frames", "_perception-cache"));
  if (has("--build")) {
    mkdirSync(cacheDir, { recursive: true });
    const sweeps = (arg("--sweeps", "") || "").split(",").filter(Boolean);
    const dirs = laneDirs({ lessons: has("--all-lessons") ? null : NAMED_FAILING, sweeps: sweeps.length ? sweeps : null });
    console.log(`[bench] building the mask cache for ${dirs.length} lane(s) into ${cacheDir}`);
    let n = 0;
    for (const d of dirs) {
      buildLaneCache(d, cacheDir);
      if (++n % 20 === 0) console.log(`  ${n}/${dirs.length}`);
    }
  }
  if (!existsSync(cacheDir)) {
    console.error(`[bench] no cache at ${cacheDir} — run with --build first.`);
    process.exit(2);
  }
  const only = (arg("--lessons", "") || "").split(",").filter(Boolean);
  const all = loadCache(cacheDir, { lessons: only.length ? only : null });
  if (!all.length) {
    console.error("[bench] the cache is empty for that selection.");
    process.exit(2);
  }

  // ── THE SIGN OF THE TRACE FRAME, MEASURED ──────────────────────────────
  // …OVER THE WHOLE CACHE AND NOT THE SELECTION. The convention is a property
  // of two coordinate frames, not of the lessons a run happens to ask about,
  // and reading it off three lanes is how a bench ends up with a different
  // handedness per invocation.
  const pairs = [];
  for (const c of loadCache(cacheDir)) {
    const trace = loadTrace(c.lesson, REPO);
    if (!trace) continue;
    const poses = (c.samples || []).filter((s) => s.wx !== null && s.wx !== undefined).map((s) => ({ tSec: s.tSec, x: s.wx, z: s.wz, s }));
    for (let i = 0; i < poses.length; i++) {
      const s = poses[i].s;
      if (!s.seen || s.errDeg === null || s.errDeg === undefined || !s.confident) continue;
      const d = demandAt({ trace, poses, i, sign: 1 });
      if (d.ok) pairs.push({ errDeg: s.errDeg, rawDeg: d.demandDeg });
    }
  }
  const cal = calibrateSign(pairs);
  if (!cal.ok) {
    console.error(`[bench] REFUSING: the ground truth's sign convention could not be fixed — ${cal.why}`);
    process.exit(3);
  }
  console.log(
    `[bench] ground truth: shadow trace + chassis pose. sign=${cal.sign} ` +
      `(agrees with the recorded errDeg on ${(cal.agree * 100).toFixed(0)}% of ${cal.n} confident on-route samples)`,
  );

  const named = new Set(NAMED_FAILING);
  const groups = { failing: all.filter((c) => named.has(c.lesson)), shipping: all.filter((c) => !named.has(c.lesson)) };
  const wanted = arg("--variant") ? [arg("--variant")] : ["base", "A", "AB", "ABC"];
  const out = {};
  for (const [gname, lanes] of Object.entries(groups)) {
    if (!lanes.length) continue;
    console.log(`\n── ${gname.toUpperCase()} (${lanes.length} lanes) ${"─".repeat(40)}`);
    for (const v of wanted) {
      const t = tally();
      for (const c of lanes) {
        const truth = truthFor(c, cal.sign);
        fold(t, runLane(c, v), truth, liveFor(c));
      }
      out[`${gname}.${v}`] = t;
      console.log(report(v, t));
    }
  }
  const jsonOut = arg("--json");
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ calibration: cal, confidentLinePx: CONFIDENT_LINE_PX, groups: out }, null, 2));
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
