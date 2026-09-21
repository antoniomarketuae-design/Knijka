/**
 * path-disarm.test.mjs — THE DISARM'S LANDING ON A CAR THAT MOVES (path-follow.mjs §10c, 2026-09-17).
 *
 * Run: node --test tools/mobile/__tests__/path-disarm.test.mjs   (~9 min measured; one Node process, no browser)
 *
 * WHY A FILE OF ITS OWN. path-follow.test.mjs T6.7b proves things about the disarm with the car HELD AT REST — the
 * worst case for ReverseAssist's LAW 1 while no landing brakes. §10c brakes, and its safety rests on the car MOVING, so
 * a car held at rest would refute it for a reason the product does not have. Here the product's own ReverseAssist runs
 * in the product's frame order (lib/disarm-sim.mjs) on a car that moves: the bench plant's longitudinal model
 * (path-bench.mjs pedalStep, VehicleSim's pedal priority) over the whole grid, and the product's OWN VehicleSim, rapier
 * and applyDifficulty over a subset, in both automatic tiers. The advanced tier is manual: the assist never runs there
 * (driveline.ts transmissionModeFor), so there is no gesture to disarm.
 *
 * WHAT IS ASSERTED (the three the brief requires, against the disarm as it stood at 424bb1f1 — `flow: "head"`):
 *  (a) the gear never goes back to R — every path, HUD phase, frame rate, latency, key lag (a call resolving before its
 *      key is handled included), long task before VehicleRig's read or after the assist, stall and pause;
 *  (b) no press the landing makes is ever armed: bound 0 s of hold, derived in path-follow.mjs §10c, measured here;
 *  (c) creep no worse than the head disarm at EVERY condition, and the numbers.
 * Every dependency the argument names is pinned by a case that fails when it is violated.
 *
 * EVERY MATCHER REPORTS WHAT IT CANNOT READ: a source anchor that moved is UNREADABLE and fails.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DISARM_LANDING, pathLandingActions, pathLandingHoldActions } from "../lib/path-follow.mjs";
import {
  DISARM_KEY_LAG_X,
  DISARM_LATENCIES_MS,
  DISARM_SLOW_HUD_MS,
  HARNESS_DISARM,
  awaitedPairLanding,
  disarmDisturbances,
  headLanding,
  liftThenBrakeLanding,
  planLanding,
  plantLongitudinal,
  simulateDisarmOnPhysics,
} from "../lib/disarm-sim.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const read = (...p) => readFileSync(resolve(REPO, ...p), "utf8").replace(/\r/g, "");
const ENGINE = ["platform", "src", "modules", "sim", "engine"];
let RA = null;
let raWhy = null;
try {
  RA = await import(pathToFileURL(resolve(REPO, ...ENGINE, "reverseAssist.ts")).href);
} catch (err) {
  raWhy = `${err.name}: ${err.message}`;
}
const FIXED_DT = 1 / 60;

/** input.ts's ramps, READ — a number this file cannot find is a refusal, never a default. */
const productRamps = () => {
  const src = read(...ENGINE, "input.ts");
  const num = (name) => {
    const m = src.match(new RegExp(`export const ${name} = ([0-9.]+);`));
    assert.ok(m, `UNREADABLE: input.ts ${name}`);
    return Number(m[1]);
  };
  assert.match(src, /if \(held\) return Math\.min\(1, value \+ dtSec \/ attackS\);\s*\n\s*return Math\.max\(0, value - dtSec \/ releaseS\);/, "UNREADABLE: input.ts stepPedal is no longer the linear ramp the simulator runs");
  assert.match(src, /Math\.min\(Math\.max\(\(now - this\.lastReadMs\) \/ 1000, 0\), MAX_RAMP_DT_S\)/, "UNREADABLE: input.ts no longer clamps each read's dt at MAX_RAMP_DT_S");
  return { wAttack: num("THROTTLE_ATTACK_S"), wRelease: num("THROTTLE_RELEASE_S"), sAttack: num("BRAKE_ATTACK_S"), sRelease: num("BRAKE_RELEASE_S"), maxDt: num("MAX_RAMP_DT_S") };
};

/** lesson-audit.mjs ARM_POLL_MS, read. */
const harnessPollMs = () => {
  const m = [...read("tools", "mobile", "lesson-audit.mjs").matchAll(/^const ARM_POLL_MS = (\d+);$/gm)];
  assert.equal(m.length, 1, "UNREADABLE: lesson-audit.mjs ARM_POLL_MS");
  return Number(m[0][1]);
};

/** The product's physics, imported and run (as path-follow.test.mjs T6.7d loads it) — nothing copied. */
let productP = null;
const productPhysics = () => {
  productP ??= (async () => {
    const { register } = await import("node:module");
    const hook = [
      "export async function resolve(specifier, context, next) {",
      "  if ((specifier.startsWith('./') || specifier.startsWith('../')) && String(context.parentURL).includes('/platform/src/') && !/\\.[cm]?[jt]sx?$/.test(specifier)) {",
      "    for (const ext of ['.ts', '/index.ts']) { try { return await next(specifier + ext, context); } catch { /* the next form */ } }",
      "  }",
      "  return next(specifier, context);",
      "}",
    ].join("\n");
    register(`data:text/javascript,${encodeURIComponent(hook)}`);
    const RAPIER = (await import(pathToFileURL(resolve(REPO, "platform", "node_modules", "@dimforge", "rapier3d-compat", "rapier.mjs")).href)).default;
    await RAPIER.init();
    const vehicle = (f) => import(pathToFileURL(resolve(REPO, "platform", "src", "modules", "sim", "vehicle", f)).href);
    const [T, VS, DF, DL] = await Promise.all([vehicle("tuning.ts"), vehicle("VehicleSim.ts"), vehicle("difficulty.ts"), vehicle("driveline.ts")]);
    for (const [name, ok] of [["VehicleSim", typeof VS.VehicleSim === "function"], ["createHeadlessChassis", typeof VS.createHeadlessChassis === "function"], ["applyDifficulty", typeof DF.applyDifficulty === "function"], ["READY_DRIVELINE", typeof DL.READY_DRIVELINE === "object"], ["transmissionModeFor", typeof DL.transmissionModeFor === "function"], ["FIXED_DT", Number.isFinite(T.FIXED_DT)]]) {
      if (!ok) throw new Error(`the product's ${name} is not where this file reads it`);
    }
    return { RAPIER, T, VS, DF, DL };
  })();
  return productP;
};
/** One product car on flat ground, settled at rest in R with the brake held — the reverse end. The functional pedals are handed in. */
const productCar = (P, mode) => () => {
  const { RAPIER, T, VS, DF, DL } = P;
  const world = new RAPIER.World({ x: 0, y: T.GRAVITY, z: 0 });
  world.timestep = T.FIXED_DT;
  world.createCollider(RAPIER.ColliderDesc.cuboid(5000, 1, 5000).setTranslation(0, -1, 0).setFriction(1));
  const body = VS.createHeadlessChassis(RAPIER, world);
  const sim = new VS.VehicleSim(world, body);
  const dl = { ...DL.READY_DRIVELINE, selector: "R" };
  const st = DF.createDriveAssistState();
  for (let i = 0; i < 240; i++) { sim.update(DF.applyDifficulty({ throttle: 0, brake: 1, steer: 0, handbrake: false }, mode, sim.speedKmh, T.FIXED_DT, st), T.FIXED_DT, dl); world.step(); }
  const p0 = { ...body.translation() };
  const q = body.rotation();
  const f = { x: 2 * (q.x * q.z + q.w * q.y), z: 1 - 2 * (q.x * q.x + q.y * q.y) };
  const fn = Math.hypot(f.x, f.z);
  const step = (gear, accel, brake) => {
    dl.selector = gear;
    sim.update(DF.applyDifficulty({ throttle: accel, brake, steer: 0, handbrake: false }, mode, sim.speedKmh, T.FIXED_DT, st), T.FIXED_DT, dl);
    world.step();
  };
  return {
    step,
    kmh: () => sim.speedKmh,
    metres: () => { const p = body.translation(); return ((p.x - p0.x) * f.x + (p.z - p0.z) * f.z) / fn; },
    // no pedal can act any more: the product's own coast, stepped to rest (the body moves, so nothing is added)
    tail() { for (let i = 0; i < 40000 && Math.abs(sim.speedKmh) >= 0.01; i++) step("D", 0, 0); return 0; },
    dispose() { sim.dispose(); world.free(); },
  };
};

const PATHS = ["first", "stop-first", "attempt2", "attempt3"];
const HUD_MS = [...DISARM_LATENCIES_MS, ...DISARM_SLOW_HUD_MS];
const base = () => ({ RA, ramps: productRamps(), fixedDt: FIXED_DT, pollMs: harnessPollMs() });

/**
 * RUN ONE GRID TWICE, condition by condition: the head disarm and the §10c disarm on the SAME condition, so (c) is a
 * per-condition comparison and never a comparison of distributions. `landing` / `landingFlow` select a mutation.
 */
const compareGrid = (conds, { physics, physicsKey, landing = planLanding(), landingFlow = {}, withHead = true }) => {
  const b = { runs: 0, shifted: 0, armedRuns: 0, maxHoldS: 0, holdAt: null, openArm: 0, asked: 0, ran: 0, notSettled: 0, pastKeys: 0, braked: 0, worse: 0, worstDeltaM: 0, worstAt: null, byKey: {}, shiftEx: [] };
  const common = base();
  let anchorsFor = { key: null, anchors: null };
  for (const c of conds) {
    const args = { ...common, physics, physicsKey, hudPhaseS: c.hudPhaseS, frameS: 1 / c.hz, rttHudMs: c.rttHudMs, rttKeyMs: c.rttKeyMs, keyLagX: c.keyLagX, rttRepressKeyMs: c.rttRepressKeyMs ?? c.rttKeyMs, repressLagX: c.repressLagX ?? c.keyLagX, path: c.path, dist: c.dist };
    // ONE CONDITION, ONE WALL CLOCK: a disturbance lands at the time the §10c disarm's undisturbed run puts its anchor,
    // in BOTH runs — each run anchoring on its own timeline would compare two different disturbances
    let anchors;
    if (c.dist) {
      const key = JSON.stringify({ ...c, dist: null });
      if (anchorsFor.key !== key) anchorsFor = { key, anchors: simulateDisarmOnPhysics({ ...args, dist: null, flow: "landing", landing, landingFlow }).anchors };
      anchors = anchorsFor.anchors;
    }
    const it = simulateDisarmOnPhysics({ ...args, anchors, flow: "landing", landing, landingFlow });
    const head = withHead ? simulateDisarmOnPhysics({ ...args, anchors, flow: "head", landing: headLanding }) : null;
    b.runs += 1;
    if (it.shiftedBack || it.selector !== "D") { b.shifted += 1; if (b.shiftEx.length < 3) b.shiftEx.push(`${JSON.stringify(c)} → ${it.flips} (${it.landings.join(" | ")})`); }
    if (it.armedInD) b.armedRuns += 1;
    if (it.openArm) b.openArm += 1;
    if (it.maxHoldS > b.maxHoldS) { b.maxHoldS = it.maxHoldS; b.holdAt = c; }
    if (c.dist) { if (it.distAsked) { b.asked += 1; if (it.distRan) b.ran += 1; } }
    if (!it.settled || (head && !head.settled)) b.notSettled += 1;
    if (it.pastKeys || (head && head.pastKeys)) b.pastKeys += 1;
    if (it.landings.some((l) => /S down/.test(l))) b.braked += 1;
    const k = `${c.path}|${c.rttHudMs}`;
    const x = (b.byKey[k] ??= { n: 0, it: [], head: [], itPeak: 0, headPeak: 0, braked: 0 });
    x.n += 1;
    x.it.push(it.creepM);
    x.itPeak = Math.max(x.itPeak, it.maxKmh);
    if (it.landings.some((l) => /S down/.test(l))) x.braked += 1;
    if (head) {
      x.head.push(head.creepM);
      x.headPeak = Math.max(x.headPeak, head.maxKmh);
      const d = it.creepM - head.creepM;
      if (d > 1e-4) { b.worse += 1; if (d > b.worstDeltaM) { b.worstDeltaM = d; b.worstAt = { ...c, head: head.creepM, it: it.creepM }; } }
    }
  }
  return b;
};
const q = (a, p) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
const table = (b, label) => Object.entries(b.byKey).map(([k, x]) => `${label} ${k.padEnd(16)} n ${x.n} braked ${x.braked} · head p50/p90/max ${q(x.head, 0.5).toFixed(2)}/${q(x.head, 0.9).toFixed(2)}/${q(x.head, 1).toFixed(2)} m peak ${x.headPeak.toFixed(1)} km/h · §10c ${q(x.it, 0.5).toFixed(2)}/${q(x.it, 0.9).toFixed(2)}/${q(x.it, 1).toFixed(2)} m peak ${x.itPeak.toFixed(1)} km/h`).join("\n");

const fullPlantConds = () => {
  const dists = disarmDisturbances();
  const out = [];
  for (const path of PATHS) for (const hudPhaseS of [0, 0.02, 0.04, 0.06, 0.08]) for (const hz of [144, 60, 30, 12]) for (const rttHudMs of HUD_MS) for (const rttKeyMs of DISARM_LATENCIES_MS) for (const keyLagX of DISARM_KEY_LAG_X) for (const dist of dists) out.push({ path, hudPhaseS, hz, rttHudMs, rttKeyMs, keyLagX, dist });
  return out;
};
const repressConds = () => {
  const out = [];
  for (const path of ["stop-first", "attempt2", "attempt3"]) for (const hudPhaseS of [0, 0.02, 0.04, 0.06, 0.08]) for (const hz of [144, 60, 30, 12]) for (const rttHudMs of HUD_MS) for (const rttKeyMs of DISARM_LATENCIES_MS) for (const rttRepressKeyMs of DISARM_LATENCIES_MS) for (const keyLagX of DISARM_KEY_LAG_X) for (const repressLagX of DISARM_KEY_LAG_X) {
    if (repressLagX !== keyLagX || rttRepressKeyMs !== rttKeyMs) out.push({ path, hudPhaseS, hz, rttHudMs, rttKeyMs, rttRepressKeyMs, keyLagX, repressLagX, dist: null });
  }
  return out;
};
/** a subset for the mutations: every path, two HUD phases, the fastest and slowest frame rates, every latency and lag, every disturbance */
const mutationConds = () => {
  const dists = disarmDisturbances();
  const out = [];
  for (const path of PATHS) for (const hudPhaseS of [0, 0.04]) for (const hz of [144, 12]) for (const rttHudMs of [2, 250, 2000]) for (const rttKeyMs of [2, 250]) for (const keyLagX of DISARM_KEY_LAG_X) for (const dist of dists) out.push({ path, hudPhaseS, hz, rttHudMs, rttKeyMs, keyLagX, dist });
  return out;
};

describe("T14 the disarm's landing on a car that moves (path-follow.mjs §10c)", () => {
  /* T14.0 WHAT THE ARGUMENT READS OFF THE PRODUCT, PINNED. Each is a step of §10c's proof or of the simulator's frame. */
  it("T14.0 the product facts §10c rests on are where it reads them: the rising-edge arm and the liftS reset, the ramps' shared clock, the pedal priority, the probe's speed and its frame, the shared pause gate, the harness's disarm constants", () => {
    assert.ok(RA?.ReverseAssist, `UNREADABLE: the product's ReverseAssist could not be imported (${raWhy})`);
    const ra = read(...ENGINE, "reverseAssist.ts");
    // step 4: armed is decided at the rising edge from `stopped` and liftS; liftS is zeroed by any update that sees motion with the pedal up
    assert.match(ra, /if \(!down\) \{[\s\S]{0,400}?this\.liftS = stopped \? this\.liftS \+ f\.dtSec : 0;/, "UNREADABLE: ReverseAssist no longer resets liftS on an update that sees the car moving with the brake up");
    assert.match(ra, /if \(!this\.pedalDown\) \{[\s\S]{0,200}?this\.armed = stopped && this\.liftS >= REVERSE_ASSIST_LIFT_S;/, "UNREADABLE: ReverseAssist no longer arms only at the rising edge from `stopped && liftS >= LIFT_S`");
    assert.match(ra, /if \(!stopped \|\| f\.throttlePedal > REVERSE_ASSIST_PEDAL_ON\) \{\s*\n\s*this\.armed = false;/, "UNREADABLE: ReverseAssist no longer disarms a press on motion or a throttle above PEDAL_ON");
    assert.match(ra, /this\.holdS \+= f\.dtSec;\s*\n\s*if \(this\.holdS < REVERSE_ASSIST_HOLD_S\) return null;/, "UNREADABLE: the hold that shifts is no longer REVERSE_ASSIST_HOLD_S of an armed press");
    // step 2: both pedals on one read clock, one clamp; S attacks no slower than W releases
    const ramps = productRamps();
    assert.ok(ramps.sAttack <= ramps.wRelease, `BRAKE_ATTACK_S ${ramps.sAttack} > THROTTLE_RELEASE_S ${ramps.wRelease}: at S's rising edge W may have fallen to 0 — §10c step 2 no longer holds; re-derive`);
    // step 3: the pedal priority — a throttle above zero drives and the brake is not read
    const vs = read("platform", "src", "modules", "sim", "vehicle", "VehicleSim.ts");
    assert.match(vs, /\} else if \(input\.throttle > 0\) \{\s*\n\s*if \(speedMs < -0\.5\) \{[\s\S]{0,300}?\} else if \(input\.brake > 0\) \{/, "UNREADABLE: VehicleSim's D branch no longer drives on a throttle above zero before it reads the brake");
    // the probe the gate reads IS the assist's speed, after the same frame's physics
    const cam = read("platform", "src", "components", "sim", "CameraRig.tsx");
    const probeAt = cam.indexOf("__camProbe = {");
    assert.ok(probeAt > 0, "UNREADABLE: CameraRig no longer publishes __camProbe");
    assert.match(cam.slice(probeAt, probeAt + 120), /speedKmh: sim\?\.speedKmh \?\? 0,/, "UNREADABLE: __camProbe.speedKmh is no longer VehicleSim's speedKmh");
    assert.ok(cam.lastIndexOf("useFrame((state, delta) => {", probeAt) > 0, "UNREADABLE: __camProbe is no longer written in CameraRig's useFrame");
    assert.match(read("platform", "src", "modules", "sim", "scene", "vehicleSample.ts"), /out\.speedKmh = sim\.speedKmh;/, "UNREADABLE: the sample the assist reads is no longer VehicleSim's speedKmh");
    const scene = read("platform", "src", "components", "sim", "LessonScene.tsx");
    const update = scene.indexOf("const cmd = reverseAssist.update({");
    assert.ok(update > 0 && /speedKmh: sample\.speedKmh,/.test(scene.slice(update, update + 120)), "UNREADABLE: the assist no longer reads sample.speedKmh");
    const frame = scene.lastIndexOf("useFrame((_, delta) => {", update);
    const pausedAt = scene.indexOf("if (paused) return;", frame);
    const dtAt = scene.indexOf("const dt = sessionClockAdvance(delta);", frame);
    assert.ok(frame > 0 && pausedAt > frame && dtAt > pausedAt && update > dtAt, "UNREADABLE: RuntimeDriver no longer returns on `paused` before it steps the assist on the frame delta");
    const phys = scene.indexOf("<Physics");
    const physEnd = scene.indexOf("</Physics>", phys);
    const rigAt = scene.indexOf("<VehicleRig", phys);
    const driverAt = scene.indexOf("<RuntimeDriver", phys);
    const camAt = scene.indexOf("<CameraRig", phys);
    assert.ok(phys > 0 && rigAt > phys && driverAt > rigAt && camAt > driverAt && physEnd > camAt, "UNREADABLE: <VehicleRig>, <RuntimeDriver>, <CameraRig> are no longer mounted in that order inside <Physics>");
    assert.match(scene.slice(phys, rigAt), /paused=\{physicsPaused\}/, "UNREADABLE: <Physics> is no longer paused on physicsPaused");
    assert.match(scene.slice(driverAt, camAt), /paused=\{physicsPaused\}/, "UNREADABLE: RuntimeDriver is no longer paused on the same physicsPaused as the physics");
    // the assist exists only on the automatic box: the manual tier has no gesture to disarm
    assert.match(read("platform", "src", "modules", "sim", "vehicle", "driveline.ts"), /return mode === "advanced" \? "manual" : "automatic";/, "UNREADABLE: which tier is manual");
    // the harness's disarm constants the simulator runs
    const la = read("tools", "mobile", "lesson-audit.mjs");
    const c = (name) => { const m = la.match(new RegExp(`^const ${name} = (\\d+);$`, "m")); assert.ok(m, `UNREADABLE: lesson-audit.mjs ${name}`); return Number(m[1]); };
    assert.deepEqual({ liftMs: c("REVERSE_LIFT_MS"), holdMs: c("REVERSE_HOLD_MS"), attempts: c("REVERSE_ARM_ATTEMPTS") }, { liftMs: HARNESS_DISARM.liftMs, holdMs: HARNESS_DISARM.holdMs, attempts: HARNESS_DISARM.attempts }, "lib/disarm-sim.mjs HARNESS_DISARM no longer mirrors lesson-audit.mjs");
    assert.ok(/for \(let i = 0; i < 8; i\+\+\) \{\s*\n\s*await page\.waitForTimeout\(600\);\s*\n\s*const read = STEER_BY === "authored-path" \? await pathGearProbe\(\) : null;/.test(la), "UNREADABLE: the stop-first loop (8 × 600 ms, its dial read the cluster probe) the simulator mirrors");
    assert.equal(HARNESS_DISARM.stopFirstIters, 8);
    assert.equal(HARNESS_DISARM.stopFirstWaitMs, 600);
  });

  /* T14.1 THE PLANNERS, cell by cell. The gate picks WHICH press may brake; the actions put S before W and mark the pair for
   * in-order dispatch; nothing but a lift ever follows. Each checker is shown failing on the mutation it guards. */
  it("T14.1 pathLandingActions / pathLandingHoldActions: a brake only above the gate that applies, S before W dispatched in order, an unread speed never brakes, the hold only lifts", () => {
    const H = (W, S) => ({ W, S, steer: null });
    let brakes = 0;
    const check = (planner, hold) => {
      const bad = [];
      for (const [W, S] of [[true, false], [false, false], [true, true], [false, true]]) for (const firstPress of [true, false]) for (const v of [null, NaN, -3, 0, 0.6, DISARM_LANDING.brakeFirstKmh - 1e-6, DISARM_LANDING.brakeFirstKmh, 2, DISARM_LANDING.brakeCoastKmh - 1e-6, DISARM_LANDING.brakeCoastKmh, 30]) {
        const r = planner({ held: H(W, S), read: { gear: ["D"], v }, firstPress });
        const tag = JSON.stringify({ W, S, firstPress, v });
        const gate = firstPress && W ? DISARM_LANDING.brakeFirstKmh : DISARM_LANDING.brakeCoastKmh;
        const want = !S && Number.isFinite(v) && v >= gate;
        if (r.brake !== want) bad.push(`${tag}: brake ${r.brake}, want ${want}`);
        const presses = r.actions.filter((a) => a.down);
        if (want) {
          const expect = [{ ch: "S-hold", down: true }, ...(W ? [{ ch: "W", down: false }] : [])];
          if (JSON.stringify(r.actions) !== JSON.stringify(expect)) bad.push(`${tag}: actions ${JSON.stringify(r.actions)}`);
          if (r.dispatch !== "in-order") bad.push(`${tag}: a braking pair not dispatched in order`);
          if (r.done !== false || r.held.S !== true || r.held.W !== false) bad.push(`${tag}: held ${JSON.stringify(r.held)} done ${r.done}`);
        } else {
          if (presses.length) bad.push(`${tag}: pressed ${JSON.stringify(presses)}`);
          if (W && !r.actions.some((a) => a.ch === "W" && !a.down)) bad.push(`${tag}: W not lifted`);
          if (r.done !== true) bad.push(`${tag}: not done`);
        }
      }
      for (const [W, S] of [[false, true], [true, true], [false, false]]) for (const v of [null, 5, 0.05, -0.05]) for (const t of [0, 1, DISARM_LANDING.maxHoldS]) {
        const r = hold({ held: H(W, S), v, sinceLandS: t });
        const tag = JSON.stringify({ W, S, v, t });
        if (r.actions.some((a) => a.down)) bad.push(`${tag}: the hold pressed a key`);
        const release = S && ((Number.isFinite(v) && Math.abs(v) < DISARM_LANDING.restKmh) || t >= DISARM_LANDING.maxHoldS);
        if (S && r.done !== release) bad.push(`${tag}: done ${r.done}, want ${release}`);
      }
      return bad;
    };
    const bad = check(pathLandingActions, pathLandingHoldActions);
    assert.deepEqual(bad, []);
    for (const W of [true]) brakes += pathLandingActions({ held: H(W, false), read: { v: 1 }, firstPress: true }).brake ? 1 : 0;
    assert.equal(brakes, 1);
    // MUTATIONS the checker must see: W before S; the coast gate used for the flip; an unread speed braking; a hold that presses
    const wFirst = (a) => { const r = pathLandingActions(a); return { ...r, actions: [...r.actions].reverse() }; };
    assert.ok(check(wFirst, pathLandingHoldActions).length > 0, "MUTATION W up before S down is not caught");
    const oneGate = (a) => pathLandingActions({ ...a, firstPress: false });
    assert.ok(check(oneGate, pathLandingHoldActions).length > 0, "MUTATION: one gate for every press is not caught");
    const unread = (a) => pathLandingActions({ ...a, read: { v: Number.isFinite(a.read.v) ? a.read.v : 99 } });
    assert.ok(check(unread, pathLandingHoldActions).length > 0, "MUTATION: an unread speed braking is not caught");
    const awaited = (a) => ({ ...pathLandingActions(a), dispatch: "awaited" });
    assert.ok(check(awaited, pathLandingHoldActions).length > 0, "MUTATION: the pair awaited one key at a time is not caught");
    const pressing = (a) => { const r = pathLandingHoldActions(a); return { ...r, actions: [...r.actions, { ch: "S-hold", down: true }] }; };
    assert.ok(check(pathLandingActions, pressing).length > 0, "MUTATION: a hold that presses is not caught");
  });

  /* T14.2 THE COAST BOUND, DERIVED — from the product's measured decelerations and from the grid this file runs. */
  it("T14.2 brakeCoastKmh covers the coast bound: the product's coast and S-at-PEDAL_ON decelerations are under the terms it is derived with, and coastBoundS covers the slowest HUD read, key call and frame of the grid plus one clamped frame", async () => {
    const P = await productPhysics();
    const { T, DF } = P;
    const ramps = productRamps();
    const on = RA.REVERSE_ASSIST_PEDAL_ON;
    const decel = (mode, S) => {
      // drive to 1 km/h past the coast gate, then pedals (0, S) until the car falls below the standstill: the worst single
      // physics step of that fall (deceleration grows with speed, so every car the bound is about decelerates no harder)
      const car = productCar(P, mode)();
      try {
        for (let i = 0; i < 600 && car.kmh() > -1 && car.kmh() < DISARM_LANDING.brakeCoastKmh + 1; i++) car.step("D", 1, 0);
        const v0 = car.kmh() / 3.6;
        let n = 0;
        let worst = 0;
        let prev = v0;
        for (; n < 3000 && car.kmh() >= RA.REVERSE_ASSIST_STANDSTILL_KMH; n++) {
          car.step("D", 0, S);
          const v = car.kmh() / 3.6;
          worst = Math.max(worst, (prev - v) / FIXED_DT);
          prev = v;
        }
        return { mean: (v0 - prev) / (n * FIXED_DT), worst };
      } finally {
        car.dispose();
      }
    };
    const lines = [];
    for (const mode of ["beginner", "normal"]) {
      assert.equal(P.DL.transmissionModeFor(mode), "automatic");
      const coast = decel(mode, 0);
      const atOn = decel(mode, on);
      lines.push(`${mode}: coast mean ${coast.mean.toFixed(3)} / worst step ${coast.worst.toFixed(3)} m/s², S = ${on}: ${atOn.mean.toFixed(3)} / ${atOn.worst.toFixed(3)} m/s²`);
      assert.ok(coast.worst <= DISARM_LANDING.coastMps2, `${mode}: the coast decelerates ${coast.worst} m/s² > coastMps2 ${DISARM_LANDING.coastMps2}`);
      assert.ok(atOn.worst <= DISARM_LANDING.brakeOnMps2, `${mode}: S at PEDAL_ON decelerates ${atOn.worst} m/s² > brakeOnMps2 ${DISARM_LANDING.brakeOnMps2}`);
    }
    assert.equal(P.DL.transmissionModeFor("advanced"), "manual", "the advanced tier gained the automatic box — it now has a gesture to disarm and belongs in this file's grid");
    // the plant's terms too (the grid below runs on it)
    const pl = plantLongitudinal({ fixedDt: FIXED_DT });
    for (let i = 0; i < 400 && pl.kmh() < DISARM_LANDING.brakeCoastKmh + 1; i++) pl.step("D", 1, 0);
    const pv0 = pl.kmh();
    pl.step("D", 0, on);
    const plantOn = ((pv0 - pl.kmh()) / 3.6) / FIXED_DT;
    lines.push(`plant: S = ${on} ${plantOn.toFixed(3)} m/s²`);
    assert.ok(plantOn <= DISARM_LANDING.brakeOnMps2);
    // THE GRID'S WORST physics time between the probe's frame and S's key-down handled: the evaluate's return half, the
    // slowest key handled at the largest lag, one frame at the slowest rate, and one frame clamped at 0.5 s
    const worstS = Math.max(...HUD_MS) / 2000 + (Math.max(...DISARM_KEY_LAG_X) * Math.max(...DISARM_LATENCIES_MS)) / 1000 + 1 / 12 + 0.5;
    lines.push(`grid worst probe → S key ${worstS.toFixed(3)} s against coastBoundS ${DISARM_LANDING.coastBoundS} s`);
    assert.ok(DISARM_LANDING.coastBoundS >= worstS, `the grid reaches ${worstS} s between the probe and S's key, past coastBoundS ${DISARM_LANDING.coastBoundS} s — re-derive brakeCoastKmh`);
    const needKmh = RA.REVERSE_ASSIST_STANDSTILL_KMH + 3.6 * (DISARM_LANDING.brakeOnMps2 * (on * ramps.sAttack + ramps.maxDt) + DISARM_LANDING.coastMps2 * DISARM_LANDING.coastBoundS);
    lines.push(`brakeCoastKmh ${DISARM_LANDING.brakeCoastKmh} ≥ ${needKmh.toFixed(3)} km/h`);
    console.log(`T14.2 ${lines.join(" · ")}`);
    assert.ok(DISARM_LANDING.brakeCoastKmh >= needKmh - 1e-9, `brakeCoastKmh ${DISARM_LANDING.brakeCoastKmh} is under the ${needKmh} km/h its bound needs`);
    assert.ok(DISARM_LANDING.brakeFirstKmh > RA.REVERSE_ASSIST_STANDSTILL_KMH);
  });

  /* T14.3 STEP 3's PHYSICS: under a throttle above zero the product's forward speed does not fall — measured, not assumed. */
  it("T14.3 under any throttle above zero (a held W, or W on its release ramp, with or without S full) the product's forward speed never falls by more than brakeFirstKmh − 0.6 km/h, in both automatic tiers", async () => {
    const P = await productPhysics();
    const { T } = P;
    const margin = DISARM_LANDING.brakeFirstKmh - RA.REVERSE_ASSIST_STANDSTILL_KMH;
    const lines = [];
    for (const mode of ["beginner", "normal"]) {
      let worstDrop = 0;
      let cases = 0;
      for (const w0 of [0.11, 0.2, 0.5, 1]) for (const holdS of [0.05, 0.2, 0.8, 1.5]) for (const S of [0, 1]) {
        const car = productCar(P, mode)();
        try {
          let W = w0;
          let peak = -Infinity;
          for (let i = 0; i < 200; i++) {
            const t = i * T.FIXED_DT;
            W = t < holdS ? Math.min(1, W + T.FIXED_DT / 0.35) : Math.max(0, W - T.FIXED_DT / 0.25);
            if (W <= 0) break;
            car.step("D", W, S);
            const v = car.kmh();
            if (peak - v > worstDrop) worstDrop = peak - v;
            peak = Math.max(peak, v);
          }
          cases += 1;
        } finally {
          car.dispose();
        }
      }
      lines.push(`${mode}: worst fall under a throttle above zero ${worstDrop.toFixed(4)} km/h over ${cases} pedal histories`);
      assert.ok(worstDrop < margin, `${mode}: the product's speed fell ${worstDrop} km/h under a throttle above zero — the margin brakeFirstKmh − 0.6 = ${margin} does not cover it`);
    }
    console.log(`T14.3 ${lines.join(" · ")} (margin ${margin.toFixed(2)} km/h)`);
  });

  /* T14.4 THE GRID ON THE BENCH PLANT — every path × HUD phase × frame rate × HUD round trip (the slow CDP link's 1200 and
   * 2000 ms included) × key latency × key lag × disturbance, the §10c disarm and the head disarm on the SAME condition. */
  it("T14.4 plant, the whole grid: (a) the gear never goes back to R, (b) no press is ever armed in D, (c) no condition rolls further than the head disarm — and the brake is exercised, every disturbance asked for runs", () => {
    assert.ok(RA?.ReverseAssist, `UNREADABLE: ReverseAssist (${raWhy})`);
    const physics = () => plantLongitudinal({ fixedDt: FIXED_DT });
    const t0 = Date.now();
    const b = compareGrid(fullPlantConds(), { physics, physicsKey: "plant" });
    const r = compareGrid(repressConds(), { physics, physicsKey: "plant" });
    console.log(`T14.4 plant grid: ${b.runs} conditions + ${r.runs} re-press-lag conditions in ${((Date.now() - t0) / 1000).toFixed(0)} s — shifted ${b.shifted}+${r.shifted}, armed ${b.armedRuns}+${r.armedRuns}, worst hold ${(Math.max(b.maxHoldS, r.maxHoldS) * 1000).toFixed(1)} ms, braked ${b.braked}+${r.braked}, rolled further than head ${b.worse}+${r.worse} (worst +${Math.max(b.worstDeltaM, r.worstDeltaM).toFixed(4)} m), disturbances ${b.ran}/${b.asked}\n${table(b, "plant")}\n${table(r, "plant re-press")}`);
    for (const x of [b, r]) {
      assert.equal(x.shifted, 0, `(a) the gear went back to R: ${x.shiftEx.join(" | ")}`);
      assert.equal(x.armedRuns, 0, `(b) a press was armed in D (worst hold ${x.maxHoldS} s at ${JSON.stringify(x.holdAt)})`);
      assert.equal(x.openArm, 0);
      assert.equal(x.worse, 0, `(c) a condition rolled further than the head disarm: +${x.worstDeltaM} m at ${JSON.stringify(x.worstAt)}`);
      assert.equal(x.notSettled, 0, "a run did not settle — its creep is not a number to compare");
      assert.equal(x.pastKeys, 0, "a key was scheduled behind the world");
    }
    assert.equal(b.ran, b.asked, `${b.asked - b.ran} requested disturbances never ran`);
    assert.ok(b.asked > b.runs / 2, "most disturbances were never asked — the families are not reaching the landing");
    // not vacuous: the brake is the case on a large share of the grid, on the press that flipped AND on re-presses
    assert.ok(b.braked >= b.runs / 10 && r.braked >= r.runs / 10, `the brake landed on ${b.braked} of ${b.runs} and ${r.braked} of ${r.runs} — (a)/(b) were barely exercised`);
  });

  /* T14.5 THE SAME ON THE PRODUCT'S OWN PHYSICS, in both automatic tiers, over a subset that keeps every path, both key
   * semantics, the slow HUD and one of each disturbance family. */
  it("T14.5 the product's own VehicleSim (beginner, normal): (a), (b) and (c) over every path, slow HUD, both key semantics and each disturbance family", async () => {
    const P = await productPhysics();
    const all = disarmDisturbances();
    const pick = [null, ...all.filter((d) => d && ((d.kind === "long" && d.from === "land" && d.offsetS === 0.01 && d.L === 0.5 && d.where === "pre") || (d.kind === "stall" && d.anchor === "S-down" && d.afterFrames === 1 && d.L === 2.5) || (d.kind === "pause" && d.anchor === "W-land" && d.afterFrames === 1 && d.L === 0.3) || (d.from === "W-land" && d.substepS === 0.001 && d.offsetS === -0.03 && d.L === 0.5)))];
    assert.equal(pick.length, 5, "UNREADABLE: the disturbance subset");
    const lines = [];
    for (const mode of ["beginner", "normal"]) {
      const conds = [];
      for (const path of PATHS) for (const hz of [60, 12]) for (const rttHudMs of [2, 250, 2000]) for (const rttKeyMs of [2, 250]) for (const keyLagX of [1, 3]) for (const dist of pick) conds.push({ path, hudPhaseS: 0.04, hz, rttHudMs, rttKeyMs, keyLagX, dist });
      const b = compareGrid(conds, { physics: productCar(P, mode), physicsKey: `product-${mode}` });
      lines.push(`${mode}: ${b.runs} conditions, shifted ${b.shifted}, armed ${b.armedRuns}, braked ${b.braked}, rolled further than head ${b.worse} (worst +${b.worstDeltaM.toFixed(4)} m)\n${table(b, mode)}`);
      assert.equal(b.shifted, 0, `(a) ${mode}: ${b.shiftEx.join(" | ")}`);
      assert.equal(b.armedRuns, 0, `(b) ${mode}: a press armed in D`);
      assert.equal(b.worse, 0, `(c) ${mode}: +${b.worstDeltaM} m at ${JSON.stringify(b.worstAt)}`);
      assert.equal(b.notSettled, 0);
      assert.ok(b.braked >= b.runs / 10, `${mode}: the brake landed on ${b.braked} of ${b.runs}`);
    }
    console.log(`T14.5 product physics — ${lines.join("\n")}`);
  });

  /* T14.6 THE MUTATIONS THE ARGUMENT SAYS ARE UNSAFE OR COSTLY, each shown so on the plant, on the same subset:
   *  · the brief's order — W up, THEN S once W's call has resolved — with the shipped gates: presses ARM (the shipped order
   *    arms none), because the car coasts between the read that saw it moving and S's rising edge (§10c (ii));
   *  · the gates removed, the shipped order kept (S then W, dispatched): presses ARM — step 3 needs the car moving;
   *  · both at once (W then S, no gate): the gear SHIFTS back to R;
   *  · the pair awaited key by key instead of dispatched: some conditions roll further than the head disarm ((c));
   *  · the stop-first loop's read not watching the cluster: the stop-first path rolls as far as the head disarm does.
   * The coast bound's own mutation needs keys past the bound to show anything and is T14.7's. */
  it("T14.6 mutations: W-then-S arms, no gate arms, both together shift the gear, the awaited pair rolls further than the head disarm, an unwatched stop-first press drives the car tens of metres", () => {
    const physics = () => plantLongitudinal({ fixedDt: FIXED_DT });
    const conds = mutationConds();
    const run = (landing, landingFlow = {}) => compareGrid(conds, { physics, physicsKey: "plant", landing, landingFlow });
    const noGate = { ...DISARM_LANDING, brakeFirstKmh: 0, brakeCoastKmh: 0 };
    const shipped = run(planLanding());
    const lift = run(liftThenBrakeLanding());
    const gateless = run(planLanding(noGate));
    const both = run(liftThenBrakeLanding(noGate));
    const awaited = run(awaitedPairLanding());
    const unwatched = run(planLanding(), { stopFirstWatch: false });
    const line = (n, x) => `${n}: shifted ${x.shifted}, armed ${x.armedRuns} (worst hold ${(x.maxHoldS * 1000).toFixed(1)} ms), worse than head ${x.worse} (+${x.worstDeltaM.toFixed(3)} m)`;
    console.log(`T14.6 over ${conds.length} conditions — ${[line("shipped", shipped), line("W up then S (awaited)", lift), line("no gate", gateless), line("W then S, no gate", both), line("pair awaited", awaited), line("stop-first unwatched", unwatched)].join(" · ")}`);
    assert.deepEqual([shipped.shifted, shipped.armedRuns, shipped.worse], [0, 0, 0], "the shipped landing on the mutation subset");
    assert.ok(lift.armedRuns > 0, "MUTATION W up then S never armed a press — the order argument is not load-bearing on this grid");
    assert.ok(gateless.armedRuns > 0, "MUTATION the gate removed never armed a press — the motion argument is not load-bearing on this grid");
    assert.ok(both.shifted > 0, "MUTATION W then S with no gate never shifted the gear — the grid cannot see a shift");
    assert.ok(awaited.worse > 0, "MUTATION the awaited pair never rolled further than the head disarm — dispatching in order is not load-bearing for (c)");
    const stopFirst = (x) => Math.max(...Object.entries(x.byKey).filter(([k]) => k.startsWith("stop-first")).flatMap(([, v]) => v.it));
    assert.ok(stopFirst(unwatched) >= 10 && stopFirst(unwatched) > 5 * stopFirst(shipped), `MUTATION the unwatched stop-first press rolled only ${stopFirst(unwatched)} m (watched ${stopFirst(shipped)} m)`);
  });

  /* T14.7 THE DEPENDENCIES, EACH NAMED AND EACH SHOWN LOAD-BEARING OR NOT.
   *  · ARM_POLL_MS — NOT a dependency of §10c (it was §10b's): with the poll at 0 ms nothing arms or shifts.
   *  · key-resolve semantics — NOT a dependency of the flip brake; the grid above runs lag ≤ 1 and lag 3 alike.
   *  · the coast bound — a dependency of every brake that is not on the flipping press: with keys handled far past the
   *    bound (a 1500 ms call resolving before its key, three times late), a car found just above the flip gate on a
   *    re-press is braked into an armed press when the coast gate is the flip gate, and not with the shipped gate.
   *  · dispatch order — S's key-down reaches the page before W's key-up: path-follow-wiring.test.mjs W-22 pins the
   *    helpers; here the reversed order is T14.6's W-then-S, which shifts. */
  it("T14.7 dependencies: ARM_POLL_MS 0 arms nothing; keys handled past the coast bound arm a re-press brake only under a gate below the bound", () => {
    const physics = () => plantLongitudinal({ fixedDt: FIXED_DT });
    const conds = [];
    for (const path of PATHS) for (const hudPhaseS of [0, 0.04]) for (const hz of [144, 30, 12]) for (const rttHudMs of [2, 90, 2000]) for (const rttKeyMs of DISARM_LATENCIES_MS) for (const keyLagX of DISARM_KEY_LAG_X) conds.push({ path, hudPhaseS, hz, rttHudMs, rttKeyMs, keyLagX, dist: null });
    const common = base();
    let poll0 = { shifted: 0, armed: 0, braked: 0 };
    for (const c of conds) {
      const it = simulateDisarmOnPhysics({ ...common, pollMs: 0, physics, physicsKey: "plant", hudPhaseS: c.hudPhaseS, frameS: 1 / c.hz, rttHudMs: c.rttHudMs, rttKeyMs: c.rttKeyMs, keyLagX: c.keyLagX, path: c.path, flow: "landing" });
      if (it.shiftedBack) poll0.shifted += 1;
      if (it.armedInD) poll0.armed += 1;
      if (it.landings.some((l) => /S down/.test(l))) poll0.braked += 1;
    }
    // past the coast bound: re-press paths, keys of 1500 ms resolving before they are handled (lag 3 → 4.5 s)
    const slow = [];
    for (const path of ["attempt2", "attempt3", "stop-first"]) for (const hudPhaseS of [0, 0.02, 0.04, 0.06, 0.08]) for (const hz of [144, 60, 30, 12]) for (const rttHudMs of [2, 30, 90, 250]) for (const rttKeyMs of [2, 30]) slow.push({ path, hudPhaseS, hz, rttHudMs, rttKeyMs, rttRepressKeyMs: 1500, keyLagX: 1, repressLagX: 3, dist: null });
    const past = { lowGate: { shifted: 0, armed: 0 }, shipped: { shifted: 0, armed: 0 } };
    for (const c of slow) for (const [name, landing] of [["lowGate", planLanding({ ...DISARM_LANDING, brakeCoastKmh: DISARM_LANDING.brakeFirstKmh })], ["shipped", planLanding()]]) {
      const it = simulateDisarmOnPhysics({ ...common, physics, physicsKey: "plant", hudPhaseS: c.hudPhaseS, frameS: 1 / c.hz, rttHudMs: c.rttHudMs, rttKeyMs: c.rttKeyMs, keyLagX: c.keyLagX, rttRepressKeyMs: c.rttRepressKeyMs, repressLagX: c.repressLagX, path: c.path, flow: "landing", landing });
      if (it.shiftedBack) past[name].shifted += 1;
      if (it.armedInD) past[name].armed += 1;
    }
    console.log(`T14.7 ARM_POLL_MS 0 over ${conds.length}: shifted ${poll0.shifted}, armed ${poll0.armed}, braked ${poll0.braked} · keys past the coast bound over ${slow.length}: coast gate = flip gate shifted ${past.lowGate.shifted} / armed ${past.lowGate.armed}; shipped gate shifted ${past.shipped.shifted} / armed ${past.shipped.armed}`);
    assert.deepEqual([poll0.shifted, poll0.armed], [0, 0], "ARM_POLL_MS 0 armed or shifted — the poll became a dependency");
    assert.ok(poll0.braked > conds.length / 10, "the poll sweep barely braked");
    assert.ok(past.lowGate.shifted + past.lowGate.armed > 0, "keys past the coast bound never armed even under a gate below it — this case cannot show the bound is load-bearing");
    assert.deepEqual([past.shipped.shifted], [0], "the shipped gate shifted with keys past the coast bound");
  });

  /* T14.8 THE DEPENDENCY THAT IS NOT A LATENCY: THE CAR MUST BE FREE TO ROLL FORWARD (found 2026-09-17 while re-measuring).
   * §10c step 3 says the car keeps moving while W drives. A body ahead breaks that: the car driven into it stops under W,
   * liftS grows with S still up, and when a read gap then lets S's rising edge meet W at or below PEDAL_ON, the press is
   * ARMED on a car at rest — and one long frame shifts the gear to R, with the landing still holding S, which in R is the
   * accelerator. The head disarm never presses S and cannot do this. So this case (1) shows the dependency is real — the
   * §10c landing on a car pinned by a body 0.05–0.6 m ahead does shift, the head disarm never does; (2) bounds where: only
   * with a disturbance (a long task, stall or pause) at the landing, never undisturbed and never at a 2 ms HUD read; and
   * (3) pins the consequence bound: the hold lifts S at its first read of R or of backward motion (`alarm`) — or had
   * already lifted it on a rest read before the shift was handled — and the reverse it allowed is far shorter than with a
   * hold blind to the gear, which keeps R's accelerator down until maxHoldS. It is a dependency, not a proof: nothing here makes
   * a contact during the landing safe. */
  it("T14.8 contact during the landing (a body 0.05–0.6 m ahead): the §10c brake can shift the gear — only with a disturbance and a HUD read slower than 2 ms — the head disarm never does, and the hold's own read releases S, so the reverse is far shorter than a hold blind to the gear allows", () => {
    const common = base();
    const dists = disarmDisturbances();
    const book = { plan: { runs: 0, shifted: 0, undisturbedShift: 0, fastHudShift: 0, alarmed: 0, worstBackM: 0, at: null }, blind: { shifted: 0, worstBackM: 0 }, head: { shifted: 0 } };
    const byHud = {};
    for (const wallM of [0.05, 0.3, 0.6]) for (const hz of [144, 12]) for (const rttHudMs of [2, 90, 250, 2000]) for (const rttKeyMs of [2, 250]) for (const keyLagX of [0.5, 3]) for (const dist of dists) {
      const args = { ...common, physicsKey: `wall-${wallM}`, hudPhaseS: 0, frameS: 1 / hz, rttHudMs, rttKeyMs, keyLagX, path: "first", dist };
      const physics = () => plantLongitudinal({ fixedDt: FIXED_DT, wallM });
      const it = simulateDisarmOnPhysics({ ...args, physics, flow: "landing" });
      const blind = simulateDisarmOnPhysics({ ...args, physics, flow: "landing", landing: planLanding(DISARM_LANDING, { holdIgnoresGear: true }) });
      const head = simulateDisarmOnPhysics({ ...args, physics, flow: "head", landing: headLanding });
      book.plan.runs += 1;
      if (it.shiftedBack) {
        book.plan.shifted += 1;
        if (!dist) book.plan.undisturbedShift += 1;
        if (rttHudMs === 2) book.plan.fastHudShift += 1;
        if (it.landings.some((l) => /ALARM/.test(l))) book.plan.alarmed += 1;
        const hb = (byHud[rttHudMs] ??= { shifted: 0, worstBackM: 0 });
        hb.shifted += 1;
        hb.worstBackM = Math.max(hb.worstBackM, it.contact.backM);
        if (it.contact.backM > book.plan.worstBackM) { book.plan.worstBackM = it.contact.backM; book.plan.at = { wallM, hz, rttHudMs, rttKeyMs, keyLagX, dist }; }
      }
      if (blind.shiftedBack) { book.blind.shifted += 1; book.blind.worstBackM = Math.max(book.blind.worstBackM, blind.contact.backM); }
      if (head.shiftedBack) book.head.shifted += 1;
    }
    console.log(`T14.8 contact over ${book.plan.runs} runs: §10c shifted ${book.plan.shifted} (undisturbed ${book.plan.undisturbedShift}, at a 2 ms HUD ${book.plan.fastHudShift}; S released by the hold's alarm in ${book.plan.alarmed}), worst reverse after contact ${book.plan.worstBackM.toFixed(2)} m at ${JSON.stringify(book.plan.at)}; by HUD round trip ${JSON.stringify(byHud)} · hold blind to the gear: shifted ${book.blind.shifted}, worst reverse ${book.blind.worstBackM.toFixed(2)} m · head disarm shifted ${book.head.shifted}`);
    assert.ok(book.plan.shifted > 0, "no contact run shifted — this case cannot show the free-car dependency is load-bearing");
    assert.equal(book.head.shifted, 0, "the head disarm shifted under contact — it presses no S; the simulator is wrong");
    assert.equal(book.plan.undisturbedShift, 0, "an UNDISTURBED contact run shifted — the exposure is wider than §10c states");
    assert.equal(book.plan.fastHudShift, 0, "a contact run shifted at a 2 ms HUD read — the exposure is wider than §10c states");
    assert.ok(book.plan.worstBackM < book.blind.worstBackM, `the alarm does not shorten the reverse (${book.plan.worstBackM} m vs a blind hold's ${book.blind.worstBackM} m)`);
  });
});
