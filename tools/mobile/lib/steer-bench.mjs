#!/usr/bin/env node
/**
 * steer-bench.mjs — DOES THE LADDER DRIVE THE CAR, MEASURED ON THE PRODUCT'S
 * OWN PHYSICS AND GRADED BY THE PRODUCT'S OWN CORRECT LINE.
 *
 * ═══ WHY IT EXISTS, AND WHY IT EXISTED BEFORE IT EXISTED ══════════════════
 *
 * `lib/guidance.mjs` cites this file four times — for the closed-form actuator
 * check, for the `LOOKAHEAD_M` sweep, for the `--compare` press counts, and
 * for the assertion that `VEHICLE` still matches `tuning.ts`. NONE OF THOSE
 * CITATIONS RESOLVED: the file was never committed and never stashed, so four
 * numbers in the shipped source were attributed to a tool that was not on
 * disk. That is the same defect class this programme keeps finding one level
 * down — a measurement published without the thing that made it — and the
 * cheapest fix is to make the citations true.
 *
 * ═══ WHAT IT DOES THAT A DRIVE CANNOT, AND WHAT IT CANNOT DO THAT A DRIVE CAN
 *
 * A steering change can only be settled by driving, and a drive costs a dev
 * server, a browser, a sweep and hours. This bench closes the loop WITHOUT a
 * browser by putting three real artefacts together:
 *
 *   · THE REAL VEHICLE. `platform/src/modules/sim/vehicle/VehicleSim.ts` on a
 *     real Rapier world, headless in Node — the same class the browser scene
 *     binds to, the same rate-limited wheel, the same speed-sensitive lock,
 *     the same tyre model. The product's own test suite already runs it this
 *     way (`vehicle/harness.test.ts`), so this is not a reimplementation and
 *     cannot drift from the product without the product's own gate going red.
 *   · THE REAL ROAD. `content/traces/<lesson>/shadow-correct.trace.json`, the
 *     product's demonstrated correct drive, whose validation rule is „must
 *     replay with ZERO violations".
 *   · THE REAL GRADER. `tools/audit/route-fidelity.mjs`, unmodified, reading
 *     status files this bench writes in exactly the shape a sweep writes them.
 *     The verdict is computed by the deciding tool, not by a second opinion
 *     living in here.
 *
 * ── AND HERE IS EVERYTHING IT IS NOT ──────────────────────────────────────
 *
 * Read this before quoting any number below.
 *
 *  1. THERE IS NO WORLD. The rig drives on an infinite flat plane. No kerbs,
 *     no other traffic, no junction geometry, no collisions, no lesson rules.
 *     A lane that fails on the road because it clipped a kerb passes here.
 *  2. THERE IS NO PIXEL SCAN. Perception is a MODEL — see `REGIMES` — fitted
 *     to what the recorded corpus's perception actually did. It reproduces the
 *     rate at which the loop sees and the distribution of its error; it cannot
 *     reproduce WHICH frame confuses it.
 *  3. THE SPEED IS GIVEN, NOT EARNED. The throttle tracks the recorded lane's
 *     own speed profile so that the before and the after drive at the same
 *     speed and the only difference is the wheel. A real drive's speed reacts
 *     to the steering; this one does not.
 *  4. SO IT PREDICTS NOTHING ABOUT A SWEEP. It answers one question — „given
 *     the same sight of the road, does this law put the car closer to the
 *     correct line than that law" — and every other question is a sweep's.
 *
 * The whole point of stating those four is that a bench which is honest about
 * its scope can be used to REFUSE a change. This programme has been saved more
 * than once by a refusal with numbers, and a bench nobody trusts cannot make
 * one.
 *
 * ═══ USAGE ════════════════════════════════════════════════════════════════
 *
 *   node tools/mobile/lib/steer-bench.mjs --self-check
 *       VEHICLE vs tuning.ts, and both closed forms vs a step-wise
 *       integration of the same rate limiter (which never imports them).
 *   node tools/mobile/lib/steer-bench.mjs --actuator
 *       Mean road-wheel angle and achieved radius per press length and speed,
 *       measured on the rig. The table in `maxSteerAtKmh` comes from here.
 *   node tools/mobile/lib/steer-bench.mjs --yaw-gain
 *       Achieved radius over kinematic radius per speed. `YAW_GAIN_TABLE`
 *       comes from here.
 *   node tools/mobile/lib/steer-bench.mjs --compare [--regime base|abc|perfect]
 *                                         [--law old|new|both] [--lessons named|all]
 *                                         [--out <dir>] [--seed N] [--limit N]
 *       Closed-loop drive of every lane, one status file per lane per cell,
 *       then `route-fidelity.mjs --corpus` over each cell and a PAIRED
 *       distribution — better / worse / crossed into on-line / lost it.
 *   node tools/mobile/lib/steer-bench.mjs --sweep-lookahead
 *       `--compare` at several `LOOKAHEAD_M`, so the one fitted number in
 *       lib/guidance.mjs is fitted in the open.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as G from "./guidance.mjs";
import { loadTrace } from "./perception-truth.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, "..", "..", "..");
const VEHICLE_SRC = join(REPO, "platform", "src", "modules", "sim", "vehicle");

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. THE PRODUCT'S PHYSICS, IN NODE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `VehicleSim.ts` and its five neighbours are TypeScript, and Node will not
 * import them. They are transpiled — types stripped, nothing else touched —
 * into a cache keyed by a hash of the sources, so a change to the product
 * invalidates it by name rather than being silently driven against a stale
 * copy. Nothing under `platform/` is written to.
 *
 * The module graph is closed and small: VehicleSim → tuning, math, driveline,
 * gripSignal, roadNoise, difficulty (type-only). If the product grows an
 * import outside that set the transpile fails loudly with the missing name,
 * which is the correct failure — a bench that silently stubs out part of the
 * vehicle is measuring a different car.
 */
const GRAPH = ["VehicleSim", "tuning", "math", "driveline", "gripSignal", "roadNoise", "difficulty"];

function transpileVehicle() {
  const srcs = GRAPH.map((f) => {
    const p = join(VEHICLE_SRC, `${f}.ts`);
    if (!existsSync(p)) throw new Error(`steer-bench: ${p} is missing — the product's vehicle module moved`);
    return { f, p, text: readFileSync(p, "utf8") };
  });
  const id = createHash("sha1").update(srcs.map((s) => s.text).join("\0")).digest("hex").slice(0, 16);
  const out = join(tmpdir(), "ai-driver-steer-bench", id);
  if (!existsSync(join(out, "VehicleSim.mjs"))) {
    mkdirSync(out, { recursive: true });
    // `typescript` is a devDependency of platform/ and is used ONLY to strip
    // types. `transpileModule` is per-file and does no type checking, which is
    // what makes it safe to point at product source from outside the app.
    const ts = createRequire(join(REPO, "platform", "package.json"))("typescript");
    for (const s of srcs) {
      const js = ts.transpileModule(s.text, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, isolatedModules: true },
        fileName: `${s.f}.ts`,
      }).outputText;
      writeFileSync(join(out, `${s.f}.mjs`), js.replace(/from ["']\.\/([A-Za-z0-9_-]+)["']/g, 'from "./$1.mjs"'));
    }
  }
  return out;
}
/** Resolve a package that lives under `platform/node_modules` from out here. */
function platformPackage(spec, file) {
  const p = join(REPO, "platform", "node_modules", ...spec.split("/"), file);
  if (!existsSync(p)) throw new Error(`steer-bench: ${p} is missing — run npm install inside platform/`);
  return pathToFileURL(p).href;
}

let RIG = null;
/** The rapier module, the product's tuning, and the product's VehicleSim. */
export async function loadPhysics() {
  if (RIG) return RIG;
  const RAPIER = (await import(platformPackage("@dimforge/rapier3d-compat", "rapier.mjs"))).default;
  await RAPIER.init();
  const out = transpileVehicle();
  const base = pathToFileURL(join(out, "/")).href;
  const T = await import(`${base}tuning.mjs`);
  const V = await import(`${base}VehicleSim.mjs`);
  RIG = { RAPIER, T, VehicleSim: V.VehicleSim, createHeadlessChassis: V.createHeadlessChassis, IDLE_INPUT: V.IDLE_INPUT };
  return RIG;
}

/** One car on an infinite flat slab. Nothing else is in the world, on purpose
 *  — see „THERE IS NO WORLD" in the header. */
export function makeCar(P) {
  const world = new P.RAPIER.World({ x: 0, y: P.T.GRAVITY, z: 0 });
  world.timestep = P.T.FIXED_DT;
  world.createCollider(P.RAPIER.ColliderDesc.cuboid(4000, 1, 4000).setTranslation(0, -1, 0).setFriction(1));
  const body = P.createHeadlessChassis(P.RAPIER, world);
  const sim = new P.VehicleSim(world, body);
  const step = (input) => {
    sim.update(input, P.T.FIXED_DT, undefined);
    world.step();
  };
  for (let i = 0; i < 120; i++) step(P.IDLE_INPUT);
  return { world, sim, body, step, free: () => { sim.dispose(); world.free(); } };
}

/* THE FRAME, AND IT IS THE SAME ONE EVERY OTHER FILE IN THIS PROGRAMME USES.
 * The shadow trace is `(x, y)` in district coordinates; the chassis probe is
 * `(wx, wz)` in world coordinates; they differ by one sign, `y = −z`
 * (LessonScene.tsx:597). So the rig is placed with world x = trace x and
 * world z = −trace y, and every pose it publishes is read back the same way.
 * `input.steer = +1` is LEFT (`engine/input.ts:248`). */
const traceXY = (body) => { const p = body.translation(); return { x: p.x, y: -p.z }; };
function fwdXY(body) {
  const q = body.rotation();
  // local +Z is forward (WHEEL_POSITIONS front axle at z = +1.28), rotated by q
  const x = 2 * (q.x * q.z + q.w * q.y);
  const z = 1 - 2 * (q.x * q.x + q.y * q.y);
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, y: -z / l };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. THE ROAD, AND THE TRUTH ABOUT IT
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Nearest point of the shadow line, and the bearing to a look-ahead on it.
 *  Signed the way `errDeg` is: POSITIVE = the road is to the RIGHT. */
export function roadAhead(trace, pos, fwd, lookaheadM) {
  let best = Infinity;
  let bi = 0;
  for (let k = 0; k < trace.pts.length; k++) {
    const d = (trace.pts[k].x - pos.x) ** 2 + (trace.pts[k].y - pos.y) ** 2;
    if (d < best) { best = d; bi = k; }
  }
  const offM = Math.sqrt(best);
  const s = trace.cum[bi] + lookaheadM;
  if (s >= trace.length) return { done: true, offM, arcM: trace.cum[bi] };
  let lo = 0;
  let hi = trace.cum.length - 1;
  while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (trace.cum[m] <= s) lo = m; else hi = m; }
  const seg = trace.cum[hi] - trace.cum[lo] || 1e-9;
  const fr = (s - trace.cum[lo]) / seg;
  const tx = trace.pts[lo].x + (trace.pts[hi].x - trace.pts[lo].x) * fr;
  const ty = trace.pts[lo].y + (trace.pts[hi].y - trace.pts[lo].y) * fr;
  const vx = tx - pos.x;
  const vy = ty - pos.y;
  const vl = Math.hypot(vx, vy) || 1e-9;
  const cross = fwd.x * (vy / vl) - fwd.y * (vx / vl);
  const dot = fwd.x * (vx / vl) + fwd.y * (vy / vl);
  return { done: false, offM, arcM: trace.cum[bi], errDeg: (-Math.atan2(cross, dot) * 180) / Math.PI };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. THE PERCEPTION MODEL — MEASURED, NOT INVENTED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A closed loop cannot replay recorded frames: the moment the wheel differs
 * the car is somewhere else and the photograph is of a road it is no longer
 * on. So the sight of the road is a MODEL, and every number in it comes from
 * the corpus rather than from taste.
 *
 * `base` IS MEASURED HERE, in this repo, over 462 lanes of w34–w37, joining
 * the recorded samples to the shadow-trace truth (`lib/perception-truth.mjs`,
 * sign −1). It has THREE states, and the first draft of this model had two,
 * which is why the first draft was refuted before it was believed: collapsing
 * „the loop saw nothing" into „the loop saw something the gate refused" drove
 * every simulated lane 100 m off the line, ten times worse than the real
 * drives it was supposed to stand in for.
 *
 *     15,880 moving ticks:  BLIND 27.7 %   THIN 39.7 %   CONFIDENT 32.7 %
 *
 *   · BLIND — no aim point at all. `steerCommand` returns nothing and the
 *     wheel stays centred. This is most of what the perception does.
 *   · THIN — a sighting the mass gate refuses. It still produces an `errDeg`
 *     the loop pulses on; it may not authorise a turn.
 *   · CONFIDENT — past `CONFIDENT_BAND_PX`, may authorise a turn.
 *
 * AND THE STATES ARE STICKY, which is the other thing the first draft had
 * wrong. Measured transition matrix, rows blind/thin/confident:
 *
 *     blind → 0.903  0.094  0.002      (n=3,725)
 *     thin  → 0.065  0.780  0.156      (n=5,672)
 *     conf  → 0.040  0.175  0.785      (n=4,492)
 *
 * Thinness is geometric and comes in runs; an independent coin per tick hands
 * any law a gap it can always bridge and makes every refusal recoverable in
 * one tick. The chain is re-weighted per tick toward the measured
 * demand-conditioned mix (`STATE_BY_DEMAND`) so the anti-correlation the whole
 * programme is about survives the stickiness: at 40–49° of demand the loop is
 * BLIND on 58 % of ticks and confident on 19 %, against 14 % / 39 % at 0–9°.
 *
 * ── AND ONE MEASUREMENT HERE CONTRADICTS THE GATE'S OWN PREMISE ────────────
 *
 * The residual (`errDeg` − truth) is WORSE on the sightings the gate accepts
 * than on the ones it refuses: |residual| p50 8.0° / p90 21.9° when confident,
 * 3.0° / 19.1° when thin. `CONFIDENT_BAND_PX` is a mass threshold and mass is
 * not accuracy — which is the perception rebuild's finding arriving from a
 * completely different direction, out of the recorded corpus rather than out
 * of the pixels. It is stated here because it is the reason a bench must model
 * thin sightings as MISLEADING rather than as absent.
 *
 * `abc` IS NOT MEASURED HERE AND MUST NOT BE READ AS IF IT WERE. The
 * perception rebuild (`lib/perception.mjs`) published its own before/after
 * over its own corpus: on the 14 named failing lessons, turn demands ≥15°,
 * authorised 254→282 of 429 and wrong-way 26.0 %→17.0 %; on the shipping
 * regime 101→137 authorised and 17.8 %→13.1 %. This regime reproduces THOSE
 * TWO NUMBERS and nothing else — the confident share is scaled by 282/254 at
 * the expense of blind and thin, and the confident residual by the factor that
 * lands the ≥15° wrong-way rate on 17.0 %. If that publication is wrong so is
 * every `abc` row below, and no row below is independent evidence for it.
 *
 * `perfect` is the control: the truth, always seen. It exists so a regression
 * can be attributed — a law that loses ground under `perfect` is a bad law,
 * and a law that only loses ground under `base` is starved, not bad.
 */
export const STATES = Object.freeze(["blind", "thin", "confident"]);

/** P(next | current), measured. */
export const STATE_TRANSITION = Object.freeze([
  Object.freeze([0.903, 0.094, 0.003]),
  Object.freeze([0.065, 0.780, 0.155]),
  Object.freeze([0.040, 0.175, 0.785]),
]);

/** The marginal mix by |truth demand| in degrees, measured. */
export const STATE_BY_DEMAND = Object.freeze([
  Object.freeze([0, 0.144, 0.468, 0.388]),
  Object.freeze([10, 0.113, 0.410, 0.477]),
  Object.freeze([20, 0.079, 0.404, 0.517]),
  Object.freeze([30, 0.159, 0.328, 0.513]),
  Object.freeze([40, 0.583, 0.231, 0.186]),
]);
/** …and over the whole corpus. */
export const STATE_MARGINAL = Object.freeze([0.277, 0.397, 0.327]);

/** The persistence probability that reproduces BOTH the measured
 *  self-transition and the measured marginal — see the derivation in
 *  `perceive`. Solved, not chosen. */
export const STATE_STICK = Object.freeze(
  [0, 1, 2].map((s) => Math.max(0, (STATE_TRANSITION[s][s] - STATE_MARGINAL[s]) / (1 - STATE_MARGINAL[s]))),
);

/**
 * Residual (`errDeg` − truth) quantiles, per state, measured.
 *
 * THE TAILS ARE CARRIED OUT TO p01/p99 AND THAT IS NOT DECORATION. A first cut
 * stopped at p05/p95 and reproduced a wrong-way rate of 4.2 % where the corpus
 * measures 20.7 % — because a sign flip at a 20° demand needs a residual past
 * −20°, which lives at about the 8th percentile, and a table clamped at p05
 * has no −40° in it at all. Truncating the tail of a perception model is
 * exactly the reassuring direction: it removes the misreads the ladder's whole
 * risk is about.
 */
export const RESIDUAL_QUANTILES = Object.freeze({
  thin: Object.freeze([
    [0.01, -40.6], [0.02, -27.2], [0.05, -18.8], [0.10, -15.9], [0.25, -8.4], [0.50, 0.4],
    [0.75, 0.9], [0.90, 5.6], [0.95, 20.2], [0.98, 47.1], [0.99, 71.3],
  ]),
  confident: Object.freeze([
    [0.01, -43.7], [0.02, -34.9], [0.05, -26.3], [0.10, -19.8], [0.25, -14.1], [0.50, -5.5],
    [0.75, 0.8], [0.90, 4.6], [0.95, 8.3], [0.98, 20.9], [0.99, 27.3],
  ]),
});

/**
 * …AND AT A TURN THE ERROR IS NOT ADDITIVE, IT IS A FRACTION OF THE TURN.
 *
 * Two drafts of this model fitted an additive residual and reproduced a
 * wrong-way rate of 4.2 % where the corpus measures 20.7 %. The reason is not
 * the tail — it is the parameterisation. Re-measured as
 * `(errDeg·sign(truth) − |truth|) / |truth|` over the same samples, at
 * |truth| ≥ 15°:
 *
 *     CONFIDENT n=1,347   p05 −1.44  p10 −1.21  p25 −0.95  p50 −0.72  p90 −0.28
 *     THIN      n=1,065   p05 −1.86  p10 −1.46  p25 −0.94  p50 −0.68  p90 −0.10
 *
 * A MEDIAN OF −0.72 MEANS THE LOOP READS ABOUT A QUARTER OF THE TURN THAT IS
 * THERE, and a value past −1 means it read the OTHER WAY: 20.7 % of confident
 * sightings and 21.6 % of thin ones. That single distribution reproduces the
 * systematic under-reading AND the wrong-way rate, which two independent
 * additive parameters could not. It is also the brief's own finding stated as
 * a number — the ribbon swings out of the 75.4° cockpit FOV exactly as the
 * turn starts, so what is left in the band is a fraction of the geometry.
 *
 * Below 15° the normalised form divides by a demand near zero and explodes
 * (p05 of −1,121), so the ADDITIVE table above is used there. The switch is at
 * `SUSTAIN_DEG`, which is where the product itself stops calling something a
 * lane correction and starts calling it a turn.
 */
export const TURN_RESIDUAL_QUANTILES = Object.freeze({
  thin: Object.freeze([
    [0.01, -2.72], [0.02, -2.44], [0.05, -1.86], [0.10, -1.46], [0.25, -0.94], [0.50, -0.68],
    [0.75, -0.50], [0.90, -0.10], [0.95, 0.21], [0.98, 0.92], [0.99, 1.12],
  ]),
  confident: Object.freeze([
    [0.01, -1.87], [0.02, -1.71], [0.05, -1.44], [0.10, -1.21], [0.25, -0.95], [0.50, -0.72],
    [0.75, -0.52], [0.90, -0.28], [0.95, -0.04], [0.98, 0.34], [0.99, 0.55],
  ]),
});

/** The number the model has to reproduce: wrong-way sign among CONFIDENT
 *  sightings at |truth| ≥ 15°, measured at 279 of 1,347 over w34–w37. */
export const MEASURED_WRONG_WAY_15 = 279 / 1347;

/**
 * THE RESIDUAL IS NOT A COIN, AND A MODEL THAT DRAWS IT LIKE ONE CANNOT
 * REPRODUCE THE FAILURE IT EXISTS TO TEST.
 *
 * The second draft of this model drew the residual independently each tick and
 * produced ZERO wrong-way turn presses over twelve lanes — because a turn press
 * needs `SUSTAIN_CONFIRM` consecutive same-sign confident samples, and two
 * independent tail draws in a row essentially never happen. It was therefore
 * grading the ladder on a corpus with no misreads in it, which is the most
 * flattering possible corpus for a law whose whole risk is committing harder
 * to a misread.
 *
 * MEASURED on the recorded corpus: the residual's lag-1 autocorrelation within
 * a lane is r = 0.873 (n = 3,249). The wrong-way rate among confident samples
 * at |truth| ≥ 15° is 20.7 % (279 of 1,347) and it arrives in RUNS — 138 runs,
 * p90 of 4 consecutive ticks, longest 8, and 65 of them are two or longer,
 * i.e. long enough to authorise a turn. That is the shape: the loop does not
 * flip a coin per frame, it locks onto the wrong thing and stays there.
 *
 * Implemented as a Gaussian copula so the measured MARGINAL above survives the
 * measured CORRELATION: a latent AR(1), then the normal CDF, then the
 * empirical quantile. The latent resets whenever the loop goes blind, because
 * that is where the recorded runs were observed to break.
 */
export const RESIDUAL_RHO = 0.873;
const normCdf = (z) => {
  // Abramowitz & Stegun 7.1.26 on erf — good to ~1.5e-7, far inside the
  // resolution of a seven-point empirical quantile table.
  const s = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + s * y);
};
/** Box–Muller off the seeded stream, so the latent is reproducible too. */
function gauss(rand) {
  const u = Math.max(1e-12, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

export const REGIMES = Object.freeze({
  perfect: { confBoost: 1, residScale: { thin: 0, confident: 0 }, alwaysConfident: true, label: "perfect sight of the road (the control)" },
  base: { confBoost: 1, residScale: { thin: 1, confident: 1 }, label: "the perception as measured on w34–w37" },
  /**
   * `confBoost` is „authorised 254 → 282 of 429". `residScale` is the factor
   * that moves the wrong-way rate from this bench's own base (22.6 % over
   * 300k draws, against the corpus's measured 20.7 %) to the publication's
   * 17.0 % — i.e. the same 0.654 ratio it reported, applied to the normalised
   * turn residual: P(r·k < −1) = 0.135 needs r = −1/k at about the 13.5th
   * percentile, which the table puts at −1.14, so k = 0.88. It is applied to
   * the CONFIDENT state only, because that is the only state the publication
   * made a claim about.
   */
  abc: { confBoost: 282 / 254, residScale: { thin: 1, confident: 0.88 }, label: "the perception rebuild's published +A+B+C outcome" },
});

function quantileDraw(table, u) {
  if (u <= table[0][0]) return table[0][1];
  if (u >= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 1; i < table.length; i++) {
    if (u <= table[i][0]) {
      const [x0, y0] = table[i - 1];
      const [x1, y1] = table[i];
      return y0 + ((y1 - y0) * (u - x0)) / (x1 - x0);
    }
  }
  return 0;
}
function stateMixFor(absDeg) {
  let row = STATE_BY_DEMAND[0];
  for (const r of STATE_BY_DEMAND) if (absDeg >= r[0]) row = r;
  return [row[1], row[2], row[3]];
}

/** Deterministic PRNG. The SAME seed and the SAME lane give the SAME draws to
 *  every law, so a paired comparison compares laws and not luck. */
export function rng(seedStr) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
}

/**
 * What the loop is allowed to see this tick.
 *
 * `prevState` carries the stickiness; the caller keeps it, exactly the way
 * `lesson-audit.mjs` keeps `guideSustainRun`. The chain's row is re-weighted
 * by the demand-conditioned marginal so a sticky model still reproduces the
 * anti-correlation with demand, then renormalised.
 */
export function perceive(truthDeg, regime, rand, mem = { state: 2, z: 0 }) {
  const R = REGIMES[regime] ?? REGIMES.base;
  if (R.alwaysConfident) return { state: 2, seen: true, confident: true, errDeg: truthDeg };
  /* THE DEMAND IS CLAMPED TO THE RANGE THE MIX WAS MEASURED OVER. Off the
   * route the bearing to the correct line can be 150°, and there is no
   * recorded 150° bucket — extrapolating one would let the model decide how a
   * lane it has already lost gets lost, which is a number about this file. */
  const mix = [...stateMixFor(Math.min(49, Math.abs(truthDeg)))];
  /* THE BOOST MOVES MASS INTO `confident` AND IS APPLIED WHERE THE PUBLICATION
   * MEASURED IT AND NOWHERE ELSE. „authorised 254 → 282 of 429" is a statement
   * about TURN DEMANDS ≥ 15°; spreading it across the lane-keeping demands too
   * would credit the rebuild with a gain it never claimed. */
  if (Math.abs(truthDeg) >= 15 && R.confBoost !== 1) {
    const lift = Math.min(0.97, mix[2] * R.confBoost) - mix[2];
    const rest = mix[0] + mix[1] || 1;
    mix[2] += lift;
    mix[0] -= (lift * mix[0]) / rest;
    mix[1] -= (lift * mix[1]) / rest;
  }
  /* ── STAY-OR-REDRAW, BECAUSE RE-WEIGHTING A TRANSITION ROW DOES NOT GIVE YOU
   *    THE MARGINAL YOU WEIGHTED IT WITH ─────────────────────────────────────
   * The first cut multiplied `STATE_TRANSITION[cur]` by `mix / marginal` and
   * renormalised. It looks like importance sampling and it is not: the
   * stationary distribution of a re-weighted chain is not the weight. MEASURED
   * on 40,000 draws it produced 9.2 % blind against the corpus's 27.7 % — the
   * model was three times less blind than the loop it stands in for, which is
   * the flattering direction on exactly the axis that decides these lanes.
   *
   * So the chain is built from the two facts that were actually measured. With
   * probability λ the state PERSISTS; otherwise it is redrawn from the
   * demand-conditioned mix, which makes that mix the stationary distribution
   * by construction. λ is then solved so the self-transition still equals the
   * measured one:
   *
   *     P(stay) = λ + (1 − λ)·π   ⇒   λ = (p_ss − π) / (1 − π)
   *
   * — 0.87 / 0.64 / 0.68 against the measured 0.903 / 0.780 / 0.785. Both
   * measurements survive instead of one being an accident of the other. */
  let state;
  if (rand() < STATE_STICK[mem.state]) state = mem.state;
  else {
    const u = rand() * (mix[0] + mix[1] + mix[2]);
    state = u < mix[0] ? 0 : u < mix[0] + mix[1] ? 1 : 2;
  }
  /* THE LATENT EVOLVES ON EVERY TICK, INCLUDING BLIND ONES, AND A DRAFT THAT
   * RESET IT TO ZERO ON BLINDNESS LOST THE TAILS. Blind is 28 % of ticks in
   * runs of about seven, so zeroing there pinned the latent near the middle of
   * its own distribution and the marginal stopped being standard normal — the
   * measured wrong-way rate fell to a fifth of the corpus's. The thing that
   * misleads the loop does not go away because the loop stopped looking. */
  const z = RESIDUAL_RHO * mem.z + Math.sqrt(1 - RESIDUAL_RHO * RESIDUAL_RHO) * gauss(rand);
  mem.z = z;
  mem.state = state;
  if (state === 0) return { state, seen: false, confident: false, errDeg: null };
  const key = state === 1 ? "thin" : "confident";
  const mag = Math.abs(truthDeg);
  const errDeg =
    mag >= 15
      // A fraction of the turn, not an offset from it — see
      // `TURN_RESIDUAL_QUANTILES`. `residScale` shrinks the fraction, which is
      // what „wrong-way 26.0 % → 17.0 %" is a claim about.
      ? truthDeg * (1 + quantileDraw(TURN_RESIDUAL_QUANTILES[key], normCdf(z)) * R.residScale[key])
      : truthDeg + quantileDraw(RESIDUAL_QUANTILES[key], normCdf(z)) * R.residScale[key];
  // A sighting the gate refuses is still a sighting: the loop gets a number it
  // may pulse on and may NOT authorise a turn on. That is exactly the shipped
  // shape (`aim.confident` gates only the turn branch), and collapsing it into
  // blindness would flatter every regime by making the loop silent instead of
  // misled.
  return { state, seen: true, confident: state === 2, errDeg };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. THE OLD LAW, KEPT HERE AND NOWHERE ELSE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The BEFORE has to be run, not remembered. This is `steerCommand` as it stood
 * before the actuator ladder — the two-rung version whose only turn manoeuvre
 * was to leave the key down across the scan — transcribed from the pre-image
 * of the change. It lives in the bench and NOT in `lib/guidance.mjs` because a
 * second control law in the shipping file is a second thing to keep in step,
 * and this one exists only to be beaten.
 */
export const LEGACY_TUNE = Object.freeze({
  MIN_KMH: 2, DEAD_DEG: 3.0, KP_MS_PER_DEG: 7, KD_MS_PER_DEG: 4,
  MIN_HOLD_MS: 45, MAX_HOLD_MS: 65, SUSTAIN_DEG: 15, SUSTAIN_CONFIRM: 2, SUSTAIN_MAX: 4,
});
export function steerCommandLegacy({ errDeg, prevErrDeg = null, kmh, sustainRun = 0, confident = true, tune = LEGACY_TUNE }) {
  if (errDeg === null || !Number.isFinite(errDeg)) return { dir: null, holdMs: 0, sustain: false };
  if (!(kmh >= tune.MIN_KMH)) return { dir: null, holdMs: 0, sustain: false };
  const mag = Math.abs(errDeg);
  if (mag <= tune.DEAD_DEG) return { dir: null, holdMs: 0, sustain: false };
  if (confident && mag >= tune.SUSTAIN_DEG && sustainRun >= tune.SUSTAIN_CONFIRM && sustainRun < tune.SUSTAIN_CONFIRM + tune.SUSTAIN_MAX) {
    // holdMs 0 + sustain true = the caller pressed and did NOT release: the
    // key stayed down through the scan and through every following sustained
    // sample. That is the 4.2 m rung, and it is why the bench holds for the
    // whole tick on this branch.
    return { dir: errDeg > 0 ? "right" : "left", holdMs: 0, sustain: true };
  }
  const dErr = prevErrDeg === null ? 0 : errDeg - prevErrDeg;
  const raw = tune.KP_MS_PER_DEG * (mag - tune.DEAD_DEG) + tune.KD_MS_PER_DEG * Math.sign(errDeg) * dErr;
  if (raw < tune.MIN_HOLD_MS) return { dir: null, holdMs: 0, sustain: false, tooSmall: true };
  return { dir: errDeg > 0 ? "right" : "left", holdMs: Math.min(tune.MAX_HOLD_MS, Math.round(raw)), sustain: false };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. ONE LANE, DRIVEN
 * ═══════════════════════════════════════════════════════════════════════════ */

export const DEFAULT_PERIOD_MS = G.TUNE.TICK_MS_ASSUMED;

/**
 * PAST THIS FAR OFF THE LINE FOR THIS MANY TICKS, THE LANE IS OVER — AND THAT
 * IS A PROPERTY OF THE BENCH, NOT A WAY OF HIDING A FAILURE.
 *
 * The rig drives an infinite empty plane. A real drive that leaves the road
 * hits a kerb, a building, or the lesson's budget; this one accelerates into
 * nothing for as many ticks as it is given, and the cross-track it accumulates
 * is then a measurement of the tick budget. MEASURED before this guard
 * existed: every lane whose max cross-track exceeded 100 m had spent 27–82
 * CONSECUTIVE ticks blind, driving straight away from the route, and those
 * runaways alone moved the corpus median from 9 m to 120 m — a number about
 * the plane, not about the ladder.
 *
 * The lane is still LOST. The poses up to the abandonment are published, the
 * verdict stays whatever `route-fidelity.mjs` makes of them (off-route, every
 * time), and `stats.abandoned` says it happened. What is removed is only the
 * part of the excursion that measures how long the runaway was allowed to run.
 */
export const ABANDON_M = 25;
export const ABANDON_TICKS = 5;

/**
 * Drive one lane and return the poses, in the shape `route-fidelity.mjs`
 * reads them out of a status file.
 *
 * `speedKmh(tick)` supplies the demand speed. It comes from the RECORDED lane
 * so both laws drive the same profile — including its slowing into junctions,
 * which is a fact about that drive and not about either law.
 */
export function driveLane({ P, trace, speedAt, maxTicks, law, regime, seed, periodMs = DEFAULT_PERIOD_MS, tune = G.TUNE, lookaheadM = null }) {
  const car = makeCar(P);
  const t0 = trace.pts[0];
  const t1 = trace.pts[Math.min(20, trace.pts.length - 1)];
  const yaw = Math.atan2(t1.x - t0.x, -(t1.y - t0.y));
  car.body.setTranslation({ x: t0.x, y: car.body.translation().y, z: -t0.y }, true);
  car.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  car.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  car.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  for (let i = 0; i < 30; i++) car.step(P.IDLE_INPUT);

  const rand = rng(seed);
  const useTune = lookaheadM === null ? tune : { ...tune, LOOKAHEAD_M: lookaheadM };
  const substeps = Math.max(1, Math.round(periodMs / 1000 / P.T.FIXED_DT));
  const samples = [];
  let prevErr = null;
  let run = 0;
  let runDir = 0;
  let carry = 0;
  const sightMem = { state: 2, z: 0 };
  let farTicks = 0;
  const stats = { ticks: 0, turnPresses: 0, pulses: 0, blind: 0, thin: 0, maxHoldMs: 0, wrongWay: 0, authorised: 0, demands: 0, abandoned: false, turnPressesAboveFullLock: 0, refitDeltaMs: 0, pressesRefitMoved: 0 };

  for (let tick = 0; tick < maxTicks; tick++) {
    const pos = traceXY(car.body);
    const kmh = car.sim.speedKmh;
    const road = roadAhead(trace, pos, fwdXY(car.body), G.TUNE.LOOKAHEAD_M);
    samples.push({ tSec: Math.round((tick * periodMs) / 1000), kmh: Math.round(kmh), dtMs: periodMs, wx: pos.x, wz: -pos.y });
    if (road.done) break;
    const truth = road.errDeg;
    // See `ABANDON_M` — the lane is lost and the rest of the excursion would
    // only measure the tick budget.
    if (road.offM > ABANDON_M) {
      farTicks += 1;
      if (farTicks >= ABANDON_TICKS) { stats.abandoned = true; break; }
    } else farTicks = 0;
    const sight = perceive(truth, regime, rand, sightMem);
    if (Math.abs(truth) >= useTune.SUSTAIN_DEG) stats.demands += 1;
    if (!sight.seen) {
      // BLIND. No aim point, no command, the run is broken — exactly the
      // shipped branch. The wheel is centred for the whole tick.
      stats.blind += 1;
      prevErr = null;
      run = 0;
      runDir = 0;
      carry = 0;
      const wantBlind = speedAt(tick);
      for (let i = 0; i < substeps; i++) {
        const v = car.sim.speedKmh;
        car.step({ ...P.IDLE_INPUT, throttle: v < wantBlind ? Math.min(1, 0.25 + (wantBlind - v) * 0.08) : 0, brake: v > wantBlind + 3 ? 0.3 : 0, steer: 0 });
      }
      stats.ticks += 1;
      continue;
    }

    const errDeg = sight.errDeg;
    const mag = Math.abs(errDeg);
    if (sight.confident && mag >= useTune.SUSTAIN_DEG && (runDir === 0 || Math.sign(errDeg) === runDir)) {
      run += 1;
      runDir = Math.sign(errDeg);
    } else {
      run = 0;
      runDir = 0;
    }
    const cmd = law === "old"
      ? steerCommandLegacy({ errDeg, prevErrDeg: prevErr, kmh, sustainRun: run, confident: sight.confident })
      : G.steerCommand({ errDeg, prevErrDeg: prevErr, kmh, dtMs: periodMs, sustainRun: run, confident: sight.confident, carryMs: carry, tune: useTune });
    carry = cmd.carryMs ?? 0;
    prevErr = errDeg;
    stats.ticks += 1;
    if (cmd.sustain) {
      stats.turnPresses += 1;
      /* THE ONLY PRESSES THE SPEED REFIT CAN POSSIBLY HAVE MOVED. Below
       * `FULL_LOCK_KMH` both corrections are ~1 and the arithmetic is
       * byte-for-byte the pre-refit one, so this counter is what says whether
       * a change in the corpus result could have come from the refit at all.
       * Published rather than argued. */
      if (kmh > G.VEHICLE.FULL_LOCK_KMH) stats.turnPressesAboveFullLock += 1;
      /* …AND BY HOW MANY MILLISECONDS, so „the rung" and „the speed refit" can
       * be told apart in the command rather than argued about in the result.
       * This recomputes the SAME press with the pre-refit arithmetic — a fixed
       * 0.6 rad lock and a yaw gain of 1 — and banks the difference. */
      if (law === "new") {
        const preMax = Math.atan(G.VEHICLE.WHEELBASE_M / useTune.TURN_RADIUS_MIN_M);
        const preWant = G.pursuitMeanAngle(errDeg, { lookaheadM: useTune.LOOKAHEAD_M, maxMeanRad: preMax });
        const preMs = Math.round(Math.max(0, Math.min(G.holdMsForMeanAngle(preWant, periodMs), useTune.TURN_HOLD_MAX_MS, periodMs - G.FULL_RETURN_MS)));
        stats.refitDeltaMs += (cmd.holdMs || 0) - preMs;
        if (Math.abs((cmd.holdMs || 0) - preMs) >= 5) stats.pressesRefitMoved += 1;
      }
      if (Math.abs(truth) >= useTune.SUSTAIN_DEG) {
        stats.authorised += 1;
        if (Math.sign(errDeg) !== Math.sign(truth)) stats.wrongWay += 1;
      }
    } else if (cmd.dir) stats.pulses += 1;
    if (sight.state === 1) stats.thin += 1;

    // THE PRESS. `holdMs 0 + sustain` is the legacy „key stays down across the
    // scan"; every other command is pressed and released inside the tick.
    const holdN = cmd.sustain && law === "old" ? substeps : Math.round((cmd.holdMs || 0) / 1000 / P.T.FIXED_DT);
    stats.maxHoldMs = Math.max(stats.maxHoldMs, cmd.sustain && law === "old" ? periodMs : cmd.holdMs || 0);
    const sgn = cmd.dir === "left" ? 1 : cmd.dir === "right" ? -1 : 0;
    const want = speedAt(tick);
    for (let i = 0; i < substeps; i++) {
      const v = car.sim.speedKmh;
      car.step({
        ...P.IDLE_INPUT,
        throttle: v < want ? Math.min(1, 0.25 + (want - v) * 0.08) : 0,
        brake: v > want + 3 ? 0.3 : 0,
        steer: i < holdN ? sgn : 0,
      });
    }
  }
  car.free();
  return { samples, stats };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 6. THE CORPUS
 * ═══════════════════════════════════════════════════════════════════════════ */

export const NAMED_FAILING = Object.freeze([
  "sc-junction-gap", "sc-junction-left", "sc-junction-rhr", "sc-junction-stop",
  "sc-roundabout-entry", "sc-rb-busy-gap", "sc-rb-lane-choice", "sc-rb-ped-exit",
  "sc-turn-left-oncoming", "sc-vu-cyclist-hook", "sc-vu-emergency-junction",
  "sc-merge-from-property", "sc-ed-d2-priority-run", "sc-ed-poligon-chain",
]);

/**
 * The lanes to drive, and the speed profile each one drives at.
 *
 * Taken from RECORDED sweeps rather than invented, because the demand speed is
 * the single biggest lever on a turn (`yawGainAtKmh`) and a bench that picks
 * its own speeds is a bench that can pick a flattering one. `mode: "wrong"`
 * lanes are excluded: their whole purpose is to leave the correct line, and
 * grading them against it measures nothing.
 */
export function collectLanes({ waves = ["w34", "w35", "w36", "w37"], lessons = "all", limit = 0 } = {}) {
  const want = lessons === "named" ? new Set(NAMED_FAILING) : null;
  const seen = new Map();
  for (const w of waves) {
    const root = join(REPO, ".audit-frames", w, "frames");
    if (!existsSync(root)) continue;
    for (const d of readdirSync(root)) {
      const p = join(root, d, "_audit-status.json");
      if (!existsSync(p)) continue;
      let j;
      try { j = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
      if (j.mode === "wrong") continue;
      const lesson = j.scenario;
      if (!lesson || (want && !want.has(lesson))) continue;
      if (!loadTrace(lesson, REPO)) continue;
      const s = (j.guidance?.samples ?? []).filter((x) => Number.isFinite(x?.kmh));
      if (s.length < 8) continue;
      const key = `${lesson}__${j.platform}-${j.mode}`;
      // Newest wave wins: one lane per lesson/platform/mode, so the corpus is
      // a set of lanes and not a set of repeats weighted by how often a wave
      // happened to include them.
      seen.set(key, {
        key, lesson, platform: j.platform, mode: j.mode, wave: w, statusPath: p,
        speeds: s.map((x) => Math.max(0, x.kmh)),
      });
    }
  }
  const out = [...seen.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  if (limit <= 0 || limit >= out.length) return out;
  /* EVERY Nth LANE, NOT THE FIRST N. The keys are alphabetical, so a prefix is
   * a subsample of the alphabet — `sc-ac-*` and `sc-ed-*` and nothing after
   * `sc-j`. A stride keeps the lesson mix, which is the only thing a subsample
   * has to preserve here. */
  const stride = out.length / limit;
  const picked = [];
  for (let i = 0; picked.length < limit && Math.floor(i * stride) < out.length; i++) picked.push(out[Math.floor(i * stride)]);
  return picked;
}

function writeStatus(dir, lane, samples) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "_audit-status.json"),
    JSON.stringify({
      scenario: lane.lesson,
      platform: lane.platform,
      mode: lane.mode,
      // Stated in the artefact itself, so a status file that escapes this
      // directory cannot be mistaken for a drive.
      benchSimulated: true,
      benchNote: "steer-bench.mjs closed-loop simulation on the product's headless VehicleSim — NOT a drive. No world, no pixel scan, given speed.",
      guidance: { samples, tracking: { verdict: null } },
    }),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 7. THE MODES
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Step-wise integration of the SAME rate limiter, importing none of the
 *  closed forms — the independent check `lib/guidance.mjs` cites. */
export function integrateMeanAngle(holdMs, dtMs, v = G.VEHICLE, stepS = 0.0005) {
  let s = 0;
  let area = 0;
  const T = dtMs / 1000;
  const h = holdMs / 1000;
  for (let t = 0; t < T - 1e-12; t += stepS) {
    const target = t < h ? v.MAX_ANGLE_RAD : 0;
    const rate = Math.abs(target) < Math.abs(s) ? v.RETURN_SPEED : v.STEER_SPEED;
    const d = target - s;
    s += Math.sign(d) * Math.min(Math.abs(d), rate * stepS);
    area += s * stepS;
  }
  return area / T;
}

async function selfCheck() {
  const P = await loadPhysics();
  const T = P.T;
  const fail = [];
  const eq = (a, b, what) => { if (Math.abs(a - b) > 1e-9) fail.push(`${what}: guidance ${a} vs tuning.ts ${b}`); };
  eq(G.VEHICLE.MAX_ANGLE_RAD, T.STEER_MAX_ANGLE, "MAX_ANGLE_RAD");
  eq(G.VEHICLE.MIN_ANGLE_RAD, T.STEER_MIN_ANGLE, "MIN_ANGLE_RAD");
  eq(G.VEHICLE.FULL_LOCK_KMH, T.STEER_FULL_SPEED_KMH, "FULL_LOCK_KMH");
  eq(G.VEHICLE.MIN_LOCK_KMH, T.STEER_MIN_SPEED_KMH, "MIN_LOCK_KMH");
  eq(G.VEHICLE.STEER_SPEED, T.STEER_SPEED, "STEER_SPEED");
  eq(G.VEHICLE.RETURN_SPEED, T.STEER_RETURN_SPEED, "RETURN_SPEED");
  const wb = T.WHEEL_POSITIONS[0].z - T.WHEEL_POSITIONS[2].z;
  eq(G.VEHICLE.WHEELBASE_M, wb, "WHEELBASE_M");
  process.stdout.write(`VEHICLE vs platform/src/modules/sim/vehicle/tuning.ts: ${fail.length ? "MISMATCH" : "matches"}\n`);
  for (const f of fail) process.stdout.write(`  ${f}\n`);

  process.stdout.write("\nclosed form vs step-wise integration of the same limiter (never imports it):\n");
  let worst = 0;
  for (const dtMs of [546, 1021, 1500]) {
    for (const holdMs of [45, 65, 150, 250, 350, 500, 700, 896]) {
      if (holdMs > dtMs - G.FULL_RETURN_MS) continue;
      const closed = G.meanAngleForHold(holdMs, dtMs);
      const stepped = integrateMeanAngle(holdMs, dtMs);
      const rel = Math.abs(closed - stepped) / Math.max(1e-9, stepped);
      worst = Math.max(worst, rel);
      const back = G.holdMsForMeanAngle(closed, dtMs);
      const inv = Math.abs(back - holdMs);
      if (rel > 0.01 || inv > 1.5) fail.push(`hold ${holdMs} / tick ${dtMs}: closed ${closed.toFixed(5)} stepped ${stepped.toFixed(5)} inverse ${back.toFixed(1)}`);
    }
  }
  process.stdout.write(`  worst relative disagreement ${(worst * 100).toFixed(3)} % over 3 tick lengths x 8 presses\n`);
  process.stdout.write(`  inverse round-trip (holdMsForMeanAngle . meanAngleForHold) within 1.5 ms: ${fail.length ? "NO" : "yes"}\n`);
  for (const f of fail) process.stdout.write(`  ${f}\n`);
  return fail.length ? 1 : 0;
}

const yawOf = (q) => Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));

/** Drive a constant press, repeated, and report what the car did. */
async function actuatorTable({ speeds, holds, tickMs = DEFAULT_PERIOD_MS, nTicks = 4 }) {
  const P = await loadPhysics();
  const rows = [];
  for (const kmh of speeds) {
    for (const holdMs of holds) {
      const car = makeCar(P);
      let g = 0;
      while (car.sim.speedKmh < kmh && g++ < 40000) car.step({ ...P.IDLE_INPUT, throttle: 1 });
      for (let i = 0; i < 60; i++) car.step({ ...P.IDLE_INPUT, throttle: 0.2 });
      const y0 = yawOf(car.body.rotation());
      let prev = car.body.translation();
      prev = { x: prev.x, z: prev.z };
      let dist = 0;
      let sumSteer = 0;
      let sumKmh = 0;
      let n = 0;
      const nHold = Math.round(holdMs / 1000 / P.T.FIXED_DT);
      const nTick = Math.round(tickMs / 1000 / P.T.FIXED_DT);
      for (let t = 0; t < nTicks; t++) {
        for (let i = 0; i < nTick; i++) {
          const v = car.sim.speedKmh;
          car.step({ ...P.IDLE_INPUT, throttle: v < kmh ? 0.4 : 0, brake: v > kmh + 2 ? 0.25 : 0, steer: i < nHold ? 1 : 0 });
          sumSteer += Math.abs(car.sim.steerRad);
          sumKmh += v;
          n += 1;
          const p = car.body.translation();
          dist += Math.hypot(p.x - prev.x, p.z - prev.z);
          prev = { x: p.x, z: p.z };
        }
      }
      let dyaw = yawOf(car.body.rotation()) - y0;
      while (dyaw < 0) dyaw += 2 * Math.PI;
      const meanSteer = sumSteer / n;
      const vKmh = sumKmh / n;
      rows.push({
        kmh: +vKmh.toFixed(1), holdMs, rigMean: +meanSteer.toFixed(4),
        closedFixed: +G.meanAngleForHold(holdMs, tickMs).toFixed(4),
        closedLock: +G.meanAngleForHold(holdMs, tickMs, G.vehicleAtKmh(vKmh)).toFixed(4),
        kinR: +(2.56 / Math.tan(meanSteer)).toFixed(2),
        realR: +(dyaw > 1e-6 ? dist / dyaw : Infinity).toFixed(2),
      });
      car.free();
    }
  }
  for (const r of rows) r.yawGain = +(r.kinR / r.realR).toFixed(3);
  return rows;
}

function summariseCell(rows) {
  const s = { total: rows.length, onLine: 0, drifted: 0, offRoute: 0, noWitness: 0, xs: [], cov: [] };
  for (const r of rows) {
    if (r.verdict === "on-line") s.onLine += 1;
    else if (r.verdict === "drifted") s.drifted += 1;
    else if (r.verdict === "off-route") s.offRoute += 1;
    else s.noWitness += 1;
    if (Number.isFinite(r.maxCrossTrackM)) s.xs.push(r.maxCrossTrackM);
    if (Number.isFinite(r.routeCoveredFrac)) s.cov.push(r.routeCoveredFrac);
  }
  const q = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : null);
  s.medXt = q(s.xs, 0.5);
  s.p90Xt = q(s.xs, 0.9);
  s.medCov = q(s.cov, 0.5);
  return s;
}

function routeFidelity(root) {
  const out = execFileSync(process.execPath, [join(REPO, "tools", "audit", "route-fidelity.mjs"), "--corpus", "--root", root], {
    encoding: "utf8", maxBuffer: 1 << 28,
  });
  return out.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

/**
 * THE ANCHOR — the SAME lanes as they were actually driven.
 *
 * A simulated `before` is only worth reading if it lands near the real
 * `before`. This runs the deciding tool over the RECORDED status files of the
 * lanes the bench is about to drive, so every simulated cell can be read
 * against the thing it is standing in for. It is the one row in this file that
 * is not a simulation, and if `base/old` is far from it, nothing else here
 * means anything.
 */
export function recordedAnchor(lanes) {
  const { laneFidelity } = anchorMod;
  return lanes.map((l) => laneFidelity({ statusPath: l.statusPath }));
}
const anchorMod = await import(pathToFileURL(join(REPO, "tools", "audit", "route-fidelity.mjs")).href);

async function compare(opts) {
  const P = await loadPhysics();
  const lanes = collectLanes({ lessons: opts.lessons, limit: opts.limit });
  process.stderr.write(`${lanes.length} lanes (${opts.lessons}), regimes ${opts.regimes.join("/")}, laws ${opts.laws.join("/")}\n`);
  const outRoot = opts.out ?? join(tmpdir(), "ai-driver-steer-bench", `run-${Date.now()}`);
  const cells = [];
  for (const regime of opts.regimes) {
    for (const law of opts.laws) {
      const dir = join(outRoot, `${regime}-${law}`, "frames");
      const stats = { turnPresses: 0, pulses: 0, authorised: 0, wrongWay: 0, maxHoldMs: 0, turnPressesAboveFullLock: 0, abandoned: 0, refitDeltaMs: 0, pressesRefitMoved: 0 };
      let i = 0;
      for (const lane of lanes) {
        const trace = loadTrace(lane.lesson, REPO);
        const speedAt = (t) => lane.speeds[Math.min(lane.speeds.length - 1, t)] || 10;
        const r = driveLane({
          P, trace, speedAt, maxTicks: Math.max(40, lane.speeds.length + 40), law, regime,
          seed: `${opts.seed}|${lane.key}`, lookaheadM: opts.lookaheadM,
          tune: { ...G.TUNE, ...(opts.tune ?? {}) },
        });
        writeStatus(join(dir, lane.key), lane, r.samples);
        stats.turnPresses += r.stats.turnPresses;
        stats.pulses += r.stats.pulses;
        stats.authorised += r.stats.authorised;
        stats.wrongWay += r.stats.wrongWay;
        stats.maxHoldMs = Math.max(stats.maxHoldMs, r.stats.maxHoldMs);
        stats.turnPressesAboveFullLock += r.stats.turnPressesAboveFullLock;
        stats.refitDeltaMs += r.stats.refitDeltaMs;
        stats.pressesRefitMoved += r.stats.pressesRefitMoved;
        stats.abandoned += r.stats.abandoned ? 1 : 0;
        if (++i % 25 === 0) process.stderr.write(`  ${regime}/${law}: ${i}/${lanes.length}\n`);
      }
      const rows = routeFidelity(join(outRoot, `${regime}-${law}`));
      cells.push({ regime, law, dir, rows, stats, summary: summariseCell(rows) });
    }
  }
  const anchor = recordedAnchor(lanes);
  return { outRoot, lanes, cells, anchor: { rows: anchor, summary: summariseCell(anchor), stats: { turnPresses: 0, pulses: 0, maxHoldMs: 0 } } };
}

function pairedReport(a, b, out = process.stdout) {
  const byLane = new Map(a.rows.map((r) => [r.lane, r]));
  let better = 0, worse = 0, same = 0, gained = 0, lost = 0, bothOn = 0, neither = 0;
  const deltas = [];
  const lostLanes = [];
  const gainedLanes = [];
  for (const rb of b.rows) {
    const ra = byLane.get(rb.lane);
    if (!ra) continue;
    const xa = ra.maxCrossTrackM;
    const xb = rb.maxCrossTrackM;
    if (Number.isFinite(xa) && Number.isFinite(xb)) {
      const d = xb - xa;
      deltas.push(d);
      if (d < -0.05) better += 1;
      else if (d > 0.05) worse += 1;
      else same += 1;
    }
    const oa = ra.verdict === "on-line";
    const ob = rb.verdict === "on-line";
    if (!oa && ob) { gained += 1; gainedLanes.push(rb.lane); }
    else if (oa && !ob) { lost += 1; lostLanes.push(rb.lane); }
    else if (oa && ob) bothOn += 1;
    else neither += 1;
  }
  const q = (p) => (deltas.length ? [...deltas].sort((x, y) => x - y)[Math.min(deltas.length - 1, Math.floor(p * deltas.length))] : null);
  out.write(`\n  ${a.regime}/${a.law}  ->  ${b.regime}/${b.law}   (${deltas.length} lanes paired)\n`);
  out.write(`    on-line       ${String(a.summary.onLine).padStart(4)} -> ${String(b.summary.onLine).padStart(4)}   (net ${b.summary.onLine - a.summary.onLine >= 0 ? "+" : ""}${b.summary.onLine - a.summary.onLine})\n`);
  out.write(`      crossed IN ${String(gained).padStart(4)}   lost OUT ${String(lost).padStart(4)}   both on ${bothOn}   neither ${neither}\n`);
  out.write(`    cross-track   better ${String(better).padStart(4)}   WORSE ${String(worse).padStart(4)}   unchanged ${same}\n`);
  out.write(`      delta m: p10 ${q(0.1)?.toFixed(2)}  p50 ${q(0.5)?.toFixed(2)}  p90 ${q(0.9)?.toFixed(2)}\n`);
  out.write(`    median max x-track ${a.summary.medXt?.toFixed(2)} -> ${b.summary.medXt?.toFixed(2)} m   p90 ${a.summary.p90Xt?.toFixed(2)} -> ${b.summary.p90Xt?.toFixed(2)} m\n`);
  out.write(`    median coverage    ${(100 * a.summary.medCov).toFixed(0)}% -> ${(100 * b.summary.medCov).toFixed(0)}%\n`);
  out.write(`    turn presses ${a.stats.turnPresses} -> ${b.stats.turnPresses}   (above the full-lock speed, the only ones the speed refit can move: ${a.stats.turnPressesAboveFullLock} -> ${b.stats.turnPressesAboveFullLock})   longest press ${a.stats.maxHoldMs} -> ${b.stats.maxHoldMs} ms   lanes abandoned ${a.stats.abandoned} -> ${b.stats.abandoned}
    of the after's ${b.stats.turnPresses} turn presses, the SPEED REFIT moved ${b.stats.pressesRefitMoved} by 5 ms or more (${b.stats.pressesRefitMoved ? Math.round(b.stats.refitDeltaMs / b.stats.pressesRefitMoved) : 0} ms mean) — the rest is the rung alone\n`);
  if (lostLanes.length) out.write(`    LOST on-line: ${lostLanes.slice(0, 12).join(", ")}${lostLanes.length > 12 ? ` … +${lostLanes.length - 12}` : ""}\n`);
  if (gainedLanes.length) out.write(`    gained on-line: ${gainedLanes.slice(0, 12).join(", ")}${gainedLanes.length > 12 ? ` … +${gainedLanes.length - 12}` : ""}\n`);
  return { better, worse, gained, lost };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 8. CLI
 * ═══════════════════════════════════════════════════════════════════════════ */

async function main(argv) {
  const args = argv.slice(2);
  const flag = (n) => args.includes(n);
  const value = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

  if (!args.length || flag("--help")) {
    process.stdout.write(readFileSync(fileURLToPath(import.meta.url), "utf8").split("═══ USAGE")[1].split("*/")[0].replace(/^\s*\*/gm, "") + "\n");
    return 0;
  }
  if (flag("--self-check")) return selfCheck();
  if (flag("--actuator")) {
    const rows = await actuatorTable({ speeds: [8, 12, 20, 30, 45], holds: [65, 150, 250, 350, 500, 700, 896] });
    process.stdout.write("kmh  hold  rigMeanRad  closed@0.6  closed@lock(v)  R_kin  R_real  yawGain\n");
    for (const r of rows) {
      process.stdout.write(
        `${String(r.kmh).padStart(4)} ${String(r.holdMs).padStart(5)} ${String(r.rigMean).padStart(11)} ${String(r.closedFixed).padStart(11)} ${String(r.closedLock).padStart(15)} ${String(r.kinR).padStart(6)} ${String(r.realR).padStart(7)} ${String(r.yawGain).padStart(8)}\n`,
      );
    }
    return 0;
  }
  if (flag("--yaw-gain")) {
    const rows = await actuatorTable({ speeds: [5, 8, 10, 12, 15, 18, 22, 26, 30, 36, 45], holds: [200, 300, 450] });
    const by = new Map();
    for (const r of rows) {
      const k = Math.round(r.kmh);
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(r.yawGain);
    }
    process.stdout.write("kmh  measured yawGain (kinematic R / achieved R)   table\n");
    for (const [k, v] of [...by].sort((x, y) => x[0] - y[0])) {
      process.stdout.write(`${String(k).padStart(3)}   ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3)}  [${v.join(" ")}]    ${G.yawGainAtKmh(k).toFixed(3)}\n`);
    }
    return 0;
  }
  if (flag("--compare") || flag("--sweep-lookahead")) {
    const opts = {
      regimes: (value("--regime", "perfect,base,abc")).split(","),
      laws: (value("--law", "old,new")).split(","),
      lessons: value("--lessons", "all"),
      limit: Number(value("--limit", "0")),
      seed: value("--seed", "1"),
      out: value("--out", null),
      lookaheadM: null,
      /** `--tune SUSTAIN_MAX=6,TURN_HOLD_MAX_MS=400` — sweep a constant
       *  without editing the shipping file, so an arbitration is run rather
       *  than argued. */
      tune: value("--tune", "").split(",").filter(Boolean).reduce((acc, kv) => {
        const [k, v] = kv.split("=");
        acc[k] = Number(v);
        return acc;
      }, {}),
    };
    if (flag("--sweep-lookahead")) {
      opts.laws = ["new"];
      for (const la of [8, 10, 12, 15, 20, 25]) {
        const { cells } = await compare({ ...opts, lookaheadM: la });
        for (const c of cells) {
          process.stdout.write(`LOOKAHEAD_M ${String(la).padStart(2)}  ${c.regime}: on-line ${c.summary.onLine}/${c.summary.total}  medXt ${c.summary.medXt?.toFixed(2)}  p90 ${c.summary.p90Xt?.toFixed(2)}\n`);
        }
      }
      return 0;
    }
    const { outRoot, cells, anchor } = await compare(opts);
    process.stdout.write(`\nartefacts: ${outRoot}\n`);
    process.stdout.write("\nANCHOR — the same lanes AS ACTUALLY DRIVEN (recorded status files, not a simulation)\n");
    const a = anchor.summary;
    process.stdout.write(
      `  ${"recorded".padEnd(14)} on-line ${String(a.onLine).padStart(4)}/${a.total}  drifted ${String(a.drifted).padStart(4)}  off-route ${String(a.offRoute).padStart(4)}  no-witness ${String(a.noWitness).padStart(4)}  medXt ${a.medXt?.toFixed(2)}  p90 ${a.p90Xt?.toFixed(2)}  cov ${(100 * a.medCov).toFixed(0)}%\n`,
    );
    process.stdout.write("\nCELLS\n");
    for (const c of cells) {
      process.stdout.write(
        `  ${(c.regime + "/" + c.law).padEnd(14)} on-line ${String(c.summary.onLine).padStart(4)}/${c.summary.total}  drifted ${String(c.summary.drifted).padStart(4)}  off-route ${String(c.summary.offRoute).padStart(4)}  no-witness ${String(c.summary.noWitness).padStart(4)}  medXt ${c.summary.medXt?.toFixed(2)}  p90 ${c.summary.p90Xt?.toFixed(2)}  cov ${(100 * c.summary.medCov).toFixed(0)}%\n`,
      );
    }
    process.stdout.write("\nPAIRED — the distribution, not the headline\n");
    const find = (r, l) => cells.find((c) => c.regime === r && c.law === l);
    for (const r of opts.regimes) {
      const a = find(r, "old");
      const b = find(r, "new");
      if (a && b) pairedReport(a, b);
    }
    if (find("base", "new") && find("abc", "new")) pairedReport(find("base", "new"), find("abc", "new"));
    if (find("base", "old") && find("abc", "new")) pairedReport(find("base", "old"), find("abc", "new"));
    if (!flag("--keep")) rmSync(outRoot, { recursive: true, force: true });
    return 0;
  }
  process.stderr.write("unknown mode — try --help\n");
  return 2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = await main(process.argv);
}
