// -----------------------------------------------------------------------------
// disarm-sim.mjs — THE DISARM, ON A CAR THAT MOVES, IN THE PRODUCT'S FRAME ORDER (2026-09-17). A BENCH, NOT A DRIVE.
//
// `path-follow.test.mjs` T6.7b stepped the product's own ReverseAssist in the product frame order with the car HELD
// AT REST — the worst case for LAW 1 while no landing braked. A landing that brakes changes that: its safety rests on
// the car MOVING (path-follow.mjs §10c), and a car held at rest would call it unsafe for a reason the product does
// not have. So this simulator couples the same frame structure to a longitudinal plant stepped once per physics
// substep on the pedals of that substep's read:
//
//  · THE FRAME (read off the product by path-disarm.test.mjs T14.0, as T6.7b's `productFrameOrder` reads it): ONE
//    `delta` per frame; the physics substeps first — each a `SimInput.read()` then a step of FIXED_DT on the FUNCTIONAL
//    pedals of that read (in R the swapped ones) — at `substepS` apart; then VehicleRig's read `readX × V` after them;
//    then the ReverseAssist on the pedals of that last read with `dtSec = min(delta, 0.5)` and the car's forward speed
//    AFTER this frame's physics (sample.speedKmh = sim.speedKmh); then the render (`renderX × V`). The probe
//    (__camProbe.speedKmh, CameraRig mounted after RuntimeDriver) publishes that same speed. Two clocks: the ramps
//    integrate the time between READS, the physics and the assist the frame delta.
//  · THE HUD: StatusDashboard's 100 ms snapshot of the selector and the rounded |v|, visible from the next frame.
//  · THE HARNESS: lesson-audit.mjs `disarmReverse` on a pc-path leg, call for call — every page read a round trip
//    (`rttHudMs`, read half-way through, once the page is idle), every key call `rttKeyMs` handled `keyLagX × rttKeyMs`
//    after it is sent (× 3 is a call that resolves before its key is handled), keys handled in call order.
//    `flow: "head"` is the disarm as it stands at 424bb1f1 (the stop-first press unwatched, the D hold lifting W on
//    «D»); `flow: "landing"` is the disarm of 2026-09-17 §10c (the stop-first loop's dial read also reading the
//    cluster and the car's speed and landing «D», no second press after such a landing, the final hold read landing too,
//    the landing's braking pair dispatched in order).
//  · THE PATHS, as T6.7b names them: "first" (W held from motion, lifted, pressed: the press that flips); "stop-first"
//    (the N4 end state — W lifted at rest, the entry dial reads non-zero once — so the stop-first press flips);
//    "attempt2" / "attempt3" (the first press flips but every cluster read of one or two attempts misses «D»).
//  · DISTURBANCES (placed at times measured on the undisturbed run of the same case): a long task before VehicleRig's
//    read ("pre") or after the assist ("post"), a stall (no frame), a pause (frames render and read, no physics and no
//    assist — one gate for both, LessonScene.tsx physicsPaused).
//
// It decides no key: the landings call path-follow.mjs's planners, exactly as the harness executor does.
// -----------------------------------------------------------------------------
import { pedalStep } from "./path-bench.mjs";
import { DISARM_BRAKE, DISARM_LANDING, pathDisarmHoldActions, pathDisarmLandActions, pathLandingActions, pathLandingHoldActions } from "./path-follow.mjs";

export const PRODUCT_FRAME = Object.freeze({ readX: 0.2, renderX: 0.3, substepS: 0.001 });
/** lesson-audit.mjs's disarm constants (path-disarm.test.mjs T14.0 reads each off the harness) */
export const HARNESS_DISARM = Object.freeze({ liftMs: 900, holdMs: 1100, attempts: 3, stopFirstWaitMs: 600, stopFirstIters: 8 });

/**
 * The bench plant's longitudinal model (path-bench.mjs `pedalStep`, VehicleSim's pedal priority) at `fixedDt`, 1-D.
 * `tail()` steps the same integrator with no pedal to rest once nothing can press one (a closed-form v² / 2a would differ
 * from the stepped coast by millimetres, and two disarms that stop pressing at different instants would be compared on two
 * integrators), and returns 0 because the plant itself moved.
 * `wallM`: a body that far ahead — forward motion stops dead at it and stays stopped while anything pushes; backward
 * motion is free. `backAfterContactM()` is the furthest the car then went backwards from it (path-disarm.test.mjs T14.8).
 */
export function plantLongitudinal({ aCoast = 0.23, aRev = 1.2, fixedDt, wallM = null }) {
  let v = 0;
  let x = 0;
  let contact = false;
  let back = 0;
  let gearNow = "R";
  return {
    step(gear, accel, brake) {
      gearNow = gear;
      const ped = pedalStep({ gear, accel, brake, v, aRev, aCoast });
      const dir = gear === "D" ? 1 : -1;
      const resist = ped.brakeDecel + ped.coastDecel;
      if (Math.abs(v) > 1e-9) {
        const sgn = Math.sign(v);
        const push = dir === sgn ? ped.aDrive : -ped.aDrive;
        const mag = Math.abs(v) + (push - resist) * fixedDt;
        v = mag <= 0 ? 0 : sgn * mag;
      } else if (ped.aDrive > resist) v = dir * (ped.aDrive - resist) * fixedDt;
      x += v * fixedDt;
      if (wallM !== null && x >= wallM && v >= 0) {
        x = wallM;
        v = 0;
        contact = true;
      }
      if (contact) back = Math.max(back, wallM - x);
    },
    kmh: () => v * 3.6,
    metres: () => x,
    tail() {
      if (wallM !== null) {
        for (let i = 0; i < 1e6 && Math.abs(v) > 1e-9; i++) this.step(gearNow, 0, 0);
        return 0;
      }
      // the stepped coast in closed form: with no pedal the plant decelerates aCoast every step (pedalStep's coast branch),
      // |v| after k steps is |v| − k·aCoast·dt until the first step it would not stay above 0, and x gains v·dt after each
      const sp = Math.abs(v);
      if (sp > 1e-9) {
        const n = Math.ceil(sp / (aCoast * fixedDt) - 1e-12) - 1;
        x += Math.sign(v) * fixedDt * (n * sp - (aCoast * fixedDt * n * (n + 1)) / 2);
        v = 0;
      }
      return 0;
    },
    contact: () => contact,
    backAfterContactM: () => back,
    dispose() {},
  };
}

const stepPedal = (value, held, dt, attack, release) => (held ? Math.min(1, value + dt / attack) : Math.max(0, value - dt / release));

/* the frame buffer: typed arrays, grown on demand, ONE run at a time (the undisturbed pass returns before its caller uses it) */
const FR = { cap: 0 };
const grow = (need) => {
  let cap = Math.max(4096, FR.cap);
  while (cap < need) cap *= 2;
  for (const [k, A] of [["start", Float64Array], ["delta", Float64Array], ["readAt", Float64Array], ["end", Float64Array], ["sub", Float64Array], ["n", Uint8Array], ["assist", Uint8Array]]) {
    const next = new A(cap);
    if (FR[k]) next.set(FR[k]);
    FR[k] = next;
  }
  FR.cap = cap;
};
let firstPass = { key: null, anchors: null };

/**
 * ONE DISARM. Returns `{ outcome, flips, shiftedBack, armedInD, arms, maxHoldS, openArm, creepM, maxKmh, settled,
 * pastKeys, distAsked, distRan, anchors, landings }`: `creepM` is the forward travel from the reverse end to rest (the
 * coast after the last pedal comes up closed by the plant's `tail`), `maxKmh` the peak |v|, `arms`/`maxHoldS` read off
 * the machine's own `armed` and `holdS` after every update in D, `landings` the planner's `why` lines.
 */
export function simulateDisarmOnPhysics(args) {
  const { RA, ramps, fixedDt, physics, hudPhaseS, rttHudMs, rttKeyMs, keyLagX = 0.5, rttEvalMs = 2, frameS, dist = null, path = "first", rttRepressKeyMs = rttKeyMs, repressLagX = keyLagX, pollMs, flow = "landing", landing = null, frame = PRODUCT_FRAME, harness = HARNESS_DISARM, maxSettleS = 40, landingFlow = {} } = args;
  if (!["first", "stop-first", "attempt2", "attempt3"].includes(path)) throw new Error(`simulateDisarmOnPhysics: unknown path ${JSON.stringify(path)}`);
  if (!["head", "landing"].includes(flow)) throw new Error(`simulateDisarmOnPhysics: unknown flow ${JSON.stringify(flow)}`);
  if (!Number.isFinite(pollMs)) throw new Error("simulateDisarmOnPhysics: pollMs (lesson-audit.mjs ARM_POLL_MS) is required");
  const land = landing ?? (flow === "head" ? headLanding : planLanding());
  const NEW = flow === "landing";
  const LF = { stopFirstWatch: true, finalReadLands: true, ...landingFlow };
  let d = null;
  if (dist) {
    const key = JSON.stringify({ ...args, RA: null, physics: String(args.physicsKey ?? ""), dist: null, landing: land.label ?? String(land) });
    // `anchors`: place the disturbance at times taken from ANOTHER run's undisturbed timeline — a per-condition
    // comparison of two disarms must disturb both at the same wall time, not each at its own anchor
    let a = args.anchors;
    if (!a) {
      if (firstPass.key !== key) firstPass = { key, anchors: simulateDisarmOnPhysics({ ...args, dist: null }).anchors };
      a = firstPass.anchors;
    }
    if (dist.kind === "long") {
      const base = a[dist.from];
      d = { ...dist, where: dist.where ?? "pre", at: Number.isFinite(base) ? base + dist.offsetS : null, used: false };
    } else if (dist.kind === "stall" || dist.kind === "pause") {
      const base = a[dist.anchor];
      d = { ...dist, anchorAt: Number.isFinite(base) ? base : null, startAt: null, after: 0, used: false };
    } else throw new Error(`simulateDisarmOnPhysics: unknown disturbance ${JSON.stringify(dist)}`);
  }
  const asked = d !== null && (d.kind === "long" ? d.at !== null : d.anchorAt !== null);
  const car = physics();
  const V = frameS;
  const wHeld = path !== "stop-first";
  const w = { t: 0, lastRead: 0, events: [], lastProc: 0, keys: { W: wHeld, S: false }, pW: wHeld ? 1 : 0, pS: 0, selector: "R", flips: "", hudPollAt: -hudPhaseS, hudPending: false, pendGear: "R", pendDial: 0, hudGear: "R", hudDial: 0, probeV: 0, anchors: {}, anchorOpen: false, pastKeys: 0, armedInD: 0, armSince: null, arms: 0, maxHoldS: 0, maxArmPageS: 0, maxKmh: 0, lastWDown: null, landings: [] };
  const ra = new RA.ReverseAssist();
  if (typeof ra.armed !== "boolean" || typeof ra.holdS !== "number") throw new Error("UNREADABLE: ReverseAssist.armed / holdS — the arm readout is read off the machine itself");
  let nF = 0;
  let acc = 0;
  let gi = 0;
  const grid = (t) => Math.ceil(t / V - 1e-9) * V;
  const gen = () => {
    if (nF >= FR.cap) grow(nF + 1);
    const i = nF;
    let start = i > 0 ? grid(Math.max(FR.start[i - 1] + V, FR.end[i - 1])) : V;
    let paused = false;
    if (d && !d.used && d.kind !== "long" && d.anchorAt !== null && d.startAt === null && i > 0 && FR.start[i - 1] > d.anchorAt) {
      d.after += 1;
      if (d.after >= Math.max(1, d.afterFrames)) d.startAt = FR.start[i - 1];
    }
    if (d && !d.used && d.kind === "stall" && d.startAt !== null) {
      start = grid(Math.max(start, d.startAt + d.L));
      d.used = true;
      d.lastFrame = i;
    }
    if (d && !d.used && d.kind === "pause" && d.startAt !== null) {
      if (start < d.startAt + d.L) paused = true;
      else {
        d.used = true;
        d.lastFrame = i;
      }
    }
    const delta = i > 0 ? start - FR.start[i - 1] : V;
    let n = 0;
    if (!paused) {
      acc += Math.min(Math.max(delta, 0), 0.5);
      while (acc >= fixedDt - 1e-12) { acc -= fixedDt; n += 1; }
    }
    let c = frame.substepS;
    let pre = frame.readX * V;
    let post = frame.renderX * V;
    if (d && !d.used && d.kind === "long" && d.at !== null && start >= d.at - 1e-12) {
      d.used = true;
      d.lastFrame = i + 1;
      if (Number.isFinite(d.substepS)) c = d.substepS;
      if (d.where === "pre") pre += d.L;
      else if (d.where === "post") post += d.L;
      else throw new Error(`simulateDisarmOnPhysics: long disturbance where ${JSON.stringify(d.where)}`);
    }
    const readAt = start + n * c + pre;
    FR.start[i] = start; FR.delta[i] = delta; FR.n[i] = n; FR.sub[i] = c; FR.readAt[i] = readAt; FR.end[i] = readAt + post; FR.assist[i] = paused ? 0 : 1;
    nF += 1;
  };
  const startOf = (i) => { while (nF <= i) gen(); return FR.start[i]; };
  const idleAt = (t) => {
    for (let i = Math.max(0, gi - 1); ; i++) {
      if (startOf(i) > t) return t;
      if (t < FR.end[i]) return FR.end[i];
    }
  };
  const read = (t) => {
    const dt = Math.min(Math.max(t - w.lastRead, 0), ramps.maxDt);
    w.lastRead = t;
    w.pW = stepPedal(w.pW, w.keys.W, dt, ramps.wAttack, ramps.wRelease);
    w.pS = stepPedal(w.pS, w.keys.S, dt, ramps.sAttack, ramps.sRelease);
  };
  const process = (i) => {
    const start = FR.start[i];
    while (w.events.length && w.events[0].at <= start) {
      const e = w.events.shift();
      w.keys[e.key] = e.down;
    }
    const n = FR.n[i];
    for (let j = 0; j < n; j++) {
      read(start + j * FR.sub[i]);
      const inR = w.selector === "R";
      car.step(w.selector, inR ? w.pS : w.pW, inR ? w.pW : w.pS);
    }
    read(FR.readAt[i]);
    const kmh = car.kmh();
    if (Math.abs(kmh) > w.maxKmh) w.maxKmh = Math.abs(kmh);
    if (FR.assist[i]) {
      const inR = w.selector === "R";
      const cmd = ra.update({ speedKmh: kmh, selector: w.selector, brakePedal: inR ? w.pW : w.pS, throttlePedal: inR ? w.pS : w.pW, dtSec: Math.min(Math.max(FR.delta[i], 0), 0.5) });
      if (cmd) {
        w.selector = cmd === "shiftToD" ? "D" : "R";
        w.flips += w.selector;
      }
      if (w.selector === "D" && ra.armed === true) {
        w.armedInD += 1;
        if (w.armSince === null) { w.armSince = start; w.arms += 1; }
        if (ra.holdS > w.maxHoldS) w.maxHoldS = ra.holdS;
      } else if (w.armSince !== null) {
        w.maxArmPageS = Math.max(w.maxArmPageS, start - w.armSince);
        w.armSince = null;
      }
    }
    w.probeV = kmh;
    if (w.hudPending) { w.hudGear = w.pendGear; w.hudDial = w.pendDial; w.hudPending = false; }
    if (start - w.hudPollAt >= 0.1 - 1e-9) { w.hudPollAt = start; w.hudPending = true; w.pendGear = w.selector; w.pendDial = Math.round(Math.abs(kmh)); }
    w.t = start;
  };
  const stepTo = (until) => { while (startOf(gi) <= until) process(gi++); };
  let now = 0;
  const held = { W: wHeld, S: false, steer: null };
  const wait = (ms) => { now += ms / 1000; stepTo(now); };
  // one key call — lesson-audit.mjs's helpers skip a call for a key already in the wanted state
  const press = (key, down, rtt = rttKeyMs, lagX = keyLagX) => {
    if (held[key] === down) return null;
    const at = Math.max(w.lastProc + 1e-7, now + (lagX * rtt) / 1000);
    if (at < w.t) w.pastKeys += 1;
    w.lastProc = at;
    const handled = idleAt(at);
    w.events.push({ at, key, down });
    const name = `${key}-${down ? "down" : "up"}`;
    if (w.anchorOpen && w.anchors[name] === undefined) w.anchors[name] = handled;
    if (key === "W" && down) w.lastWDown = handled;
    held[key] = down;
    now = lagX <= 1 ? Math.max(now + rtt / 1000, handled) : now + rtt / 1000;
    stepTo(now);
    return handled;
  };
  const keyOf = (a) => {
    if (a.ch === "W") return "W";
    if (a.ch === "S-brake" || a.ch === "S-hold") return "S";
    throw new Error(`simulateDisarmOnPhysics: unknown action channel ${JSON.stringify(a.ch)}`);
  };
  // lesson-audit.mjs pathActuate: one key call at a time, each awaited
  const exec = (actions) => { for (const a of actions) press(keyOf(a), a.down); };
  // lesson-audit.mjs pathDispatchInOrder: every call SENT at the same instant, in order — handled in that order and in
  // ONE input batch (the same instant; the event queue keeps their order), the harness waiting only for the last to resolve
  const dispatch = (actions) => {
    const t0 = now;
    let resolveAt = now;
    let batchAt = null;
    for (const a of actions) {
      const key = keyOf(a);
      if (held[key] === a.down) continue;
      const at = batchAt ?? Math.max(w.lastProc + 1e-7, t0 + (keyLagX * rttKeyMs) / 1000);
      batchAt = at;
      if (at < w.t) w.pastKeys += 1;
      w.lastProc = at;
      const handled = idleAt(at);
      w.events.push({ at, key, down: a.down });
      const name = `${key}-${a.down ? "down" : "up"}`;
      if (w.anchorOpen && w.anchors[name] === undefined) w.anchors[name] = handled;
      held[key] = a.down;
      resolveAt = Math.max(resolveAt, keyLagX <= 1 ? Math.max(t0 + rttKeyMs / 1000, handled) : t0 + rttKeyMs / 1000);
    }
    now = resolveAt;
    stepTo(now);
  };
  const pageRead = (pick) => {
    now = idleAt(now + rttHudMs / 2000);
    stepTo(now);
    const v = pick();
    now += rttHudMs / 2000;
    stepTo(now);
    return v;
  };
  const framesSince = (minFrames, minMs, maxMs) => {
    const start = idleAt(now + rttEvalMs / 2000);
    now = start;
    stepTo(start);
    const limit = start + maxMs / 1000;
    const times = [];
    while (startOf(gi) <= limit) {
      const f = gi++;
      process(f);
      times.push(FR.start[f] * 1000);
      if (times.length >= minFrames && FR.start[f] * 1000 - times[0] >= minMs) { now = FR.start[f] + rttEvalMs / 2000; stepTo(now); return { times, timedOut: false }; }
    }
    now = idleAt(limit) + rttEvalMs / 2000;
    stepTo(now);
    return { times, timedOut: true };
  };
  const forcedMisses = path === "attempt2" ? 1 : path === "attempt3" ? 2 : 0;
  let missing = false;
  // lesson-audit.mjs pathGearProbe: the cluster letter and __camProbe.speedKmh in ONE evaluate (gear() when `v` is unused)
  const gearProbe = () => pageRead(() => ({ gear: missing ? "R" : w.hudGear, v: w.probeV }));
  const speedNow = () => pageRead(() => w.hudDial);
  const ctx = { held, exec, dispatch, wait, framesSince, now: () => now, dial: speedNow, probe: () => pageRead(() => w.probeV), gearProbe: () => pageRead(() => ({ gear: [w.hudGear], v: w.probeV })), pollMs };
  const landAt = (r, info) => {
    w.anchorOpen = true;
    w.anchors.land ??= now;
    w.anchors["W-land"] ??= w.lastWDown;
    const why = land({ ...ctx, read: r, ...info });
    w.landings.push(why ?? "");
  };
  // lesson-audit.mjs pathSelectorHold("D", REVERSE_HOLD_MS, throttle) (flow head) / pathDisarmHold (flow landing)
  const dHold = (info) => {
    const t0 = now;
    while (now - t0 < harness.holdMs / 1000) {
      wait(pollMs);
      const r = gearProbe();
      if (r.gear === "D") {
        landAt(r, info);
        return;
      }
    }
    const r = gearProbe();
    if (NEW && LF.finalReadLands && r.gear === "D") landAt(r, { ...info, late: true });
  };
  const x0 = car.metres();
  let outcome = null;
  wait(1000); // standing in R at the reverse end
  // disarmReverse: `if (!(STEER_BY === "authored-path" && (await speedNow()) === 0))` — the N4 path's dial reads non-zero once
  const entry = pageRead(() => (path === "stop-first" ? 1 : w.hudDial));
  let stopFirstRan = false;
  let landedStopFirst = false;
  if (entry !== 0) {
    stopFirstRan = true;
    press("S", false);
    press("W", true);
    for (let i = 0; i < harness.stopFirstIters; i++) {
      wait(harness.stopFirstWaitMs);
      // lesson-audit.mjs: on a pc-path leg the dial read that ends the wait is pathGearProbe — the cluster, the car's
      // speed and the dial in ONE evaluate — and «D» there lands the flipping press; the head disarm reads the dial only
      if (NEW && LF.stopFirstWatch) {
        const r = pageRead(() => ({ gear: w.hudGear, v: w.probeV, dial: w.hudDial }));
        if (r.gear === "D") {
          landAt(r, { firstPress: true, attempt: 0 });
          landedStopFirst = true;
          break;
        }
        if (r.dial === 0) break;
      } else if (speedNow() === 0) break;
    }
  }
  // `const rest = landedStopFirst ? 0 : await speedNow()` — a landing that braked has read rest off the car itself
  if ((landedStopFirst ? 0 : speedNow()) !== 0) {
    press("W", false);
    outcome = "no-rest";
  }
  if (outcome === null) {
    for (let attempt = 1; attempt <= harness.attempts; attempt++) {
      press("W", false);
      wait(harness.liftMs);
      missing = attempt <= forcedMisses;
      // lesson-audit.mjs: after a stop-first landing the gear is D — attempt 1 presses nothing and reads the cluster
      const pressIt = !(landedStopFirst && attempt === 1);
      if (pressIt) {
        const repress = path !== "first" && (path === "stop-first" || attempt === forcedMisses + 1);
        if (repress) press("W", true, rttRepressKeyMs, repressLagX);
        else press("W", true);
        dHold({ firstPress: attempt === 1 && !stopFirstRan, attempt });
      }
      press("W", false);
      const g = pageRead(() => (missing ? "R" : w.hudGear));
      missing = false;
      if (g === "D") {
        outcome = `disarmed-a${attempt}${pressIt ? "" : "-no-press"}`;
        break;
      }
    }
    outcome ??= "disarm-failed";
  }
  if (held.W) press("W", false);
  if (held.S) press("S", false);
  const spent = () => !d || !asked || (d.used && gi > d.lastFrame);
  const quiet = () => !w.events.length && !w.keys.W && !w.keys.S && w.pW === 0 && w.pS === 0 && spent();
  let tailM = 0;
  let settled = false;
  for (let i = 0; i < maxSettleS * 10; i++) {
    if (quiet() && Math.abs(car.kmh()) < 0.01) { settled = true; break; }
    // nothing can press a pedal any more: the coast to rest — with no brake pressed ReverseAssist never emits
    // (reverseAssist.ts:244-252), so the plant's own tail closes the travel
    if (quiet() && w.selector === "D") { tailM = car.tail(); settled = true; break; }
    wait(100);
  }
  const creepM = car.metres() - x0 + tailM;
  const contact = typeof car.contact === "function" ? { hit: car.contact(), backM: car.backAfterContactM() } : null;
  car.dispose();
  return { contact, outcome, flips: w.flips, selector: w.selector, shiftedBack: w.flips.includes("DR"), armedInD: w.armedInD, arms: w.arms, maxHoldS: w.maxHoldS, maxArmPageS: w.maxArmPageS, openArm: w.armSince !== null, creepM, maxKmh: w.maxKmh, settled, pastKeys: w.pastKeys, distAsked: asked, distRan: d ? d.used : null, anchors: w.anchors, landings: w.landings };
}

/** cde40a6's landing (the harness at 424bb1f1): W lifted on «D», nothing else. */
export const headLanding = Object.assign((ctx) => { ctx.exec([{ ch: "W", down: false }]); return "W up (cde40a6)"; }, { label: "head" });

/** §10c: every key from path-follow.mjs's planners; this only executes them and polls, as lesson-audit.mjs pathDisarmLanding does. */
export const planLanding = (tune = DISARM_LANDING, { holdIgnoresGear = false } = {}) =>
  Object.assign(
    (ctx) => {
      const landed = pathLandingActions({ held: ctx.held, read: ctx.read, firstPress: ctx.firstPress === true, tune });
      if (landed.dispatch === "in-order") ctx.dispatch(landed.actions);
      else ctx.exec(landed.actions);
      let hold = landed;
      const t0 = ctx.now();
      while (!hold.done) {
        ctx.wait(ctx.pollMs);
        const r = ctx.gearProbe();
        // `holdIgnoresGear`: MUTATION — the hold blind to a gear that left D (and to backward motion)
        hold = pathLandingHoldActions({ held: ctx.held, v: holdIgnoresGear ? Math.abs(r.v) : r.v, gear: holdIgnoresGear ? null : r.gear, sinceLandS: ctx.now() - t0, tune });
        ctx.exec(hold.actions);
      }
      return hold.alarm ? `${landed.why}; ALARM ${hold.why}` : landed.why;
    },
    { label: `plan:${JSON.stringify(tune)}:${holdIgnoresGear}` },
  );

/** MUTATION — the brief's order: W up, THEN S (the same gates and hold); `awaited`: S sent once W's call resolved (default), or the two dispatched back to back. */
export const liftThenBrakeLanding = (tune = DISARM_LANDING, { awaited = true } = {}) =>
  Object.assign(
    (ctx) => {
      const landed = pathLandingActions({ held: ctx.held, read: ctx.read, firstPress: ctx.firstPress === true, tune });
      const wFirst = [...landed.actions].sort((a, b) => (a.ch === "W" ? -1 : 0) - (b.ch === "W" ? -1 : 0));
      if (awaited) ctx.exec(wFirst);
      else ctx.dispatch(wFirst);
      let hold = landed;
      const t0 = ctx.now();
      while (!hold.done) {
        ctx.wait(ctx.pollMs);
        const r = ctx.gearProbe();
        hold = pathLandingHoldActions({ held: ctx.held, v: r.v, gear: r.gear, sinceLandS: ctx.now() - t0, tune });
        ctx.exec(hold.actions);
      }
      return `MUTATION W-then-S: ${landed.why}`;
    },
    { label: `lift-then-brake:${JSON.stringify(tune)}:${awaited}` },
  );

/** MUTATION — S down AWAITED before W up (the pair not dispatched together): W is held one more key round trip. */
export const awaitedPairLanding = (tune = DISARM_LANDING) =>
  Object.assign(
    (ctx) => {
      const landed = pathLandingActions({ held: ctx.held, read: ctx.read, firstPress: ctx.firstPress === true, tune });
      ctx.exec(landed.actions);
      let hold = landed;
      const t0 = ctx.now();
      while (!hold.done) {
        ctx.wait(ctx.pollMs);
        const r = ctx.gearProbe();
        hold = pathLandingHoldActions({ held: ctx.held, v: r.v, gear: r.gear, sinceLandS: ctx.now() - t0, tune });
        ctx.exec(hold.actions);
      }
      return `MUTATION awaited pair: ${landed.why}`;
    },
    { label: `awaited-pair:${JSON.stringify(tune)}` },
  );

/** §10b «W ENCLOSES S» (unwired 2026-09-17), on its own planners — measured, never shipped. */
export const s10bLanding = Object.assign(
  (ctx) => {
    ctx.exec(pathDisarmLandActions(ctx.held).actions);
    const t0 = ctx.now();
    const brakeRead = ctx.framesSince(DISARM_BRAKE.brakeReadFrames, DISARM_BRAKE.brakeFullMs, DISARM_BRAKE.maxHoldS * 1000);
    let why = "";
    for (;;) {
      const hold = pathDisarmHoldActions({ held: ctx.held, brakeRead, sinceLandS: ctx.now() - t0, dialKmh: ctx.dial() });
      ctx.exec(hold.actions);
      why = hold.why;
      if (hold.done) break;
      ctx.wait(ctx.pollMs);
    }
    return `§10b: ${why}`;
  },
  { label: "s10b" },
);

/** The latencies (ms) and key lags T6.7b sweeps, and the HUD round trips of a slow CDP link. */
export const DISARM_LATENCIES_MS = Object.freeze([2, 30, 90, 250]);
export const DISARM_KEY_LAG_X = Object.freeze([0.5, 1, 3]);
export const DISARM_SLOW_HUD_MS = Object.freeze([1200, 2000]);

/**
 * T6.7b's disturbance families, anchored on what a landing sends: long tasks (pre / post) at L ∈ {0.24, 0.35, 0.5, 2.5} s
 * from the landing's start; stalls and pauses of {0.3, 0.6, 2.5} s after {0, 1, 3} frames past each anchor key; and the
 * two-clock family — a long task before VehicleRig's read beginning 60 / 30 / 15 ms before the landing's W was handled.
 */
export function disarmDisturbances(anchors = ["S-down", "S-up", "W-up", "W-land"]) {
  const out = [null];
  for (const where of ["pre", "post"]) for (const L of [0.24, 0.35, 0.5, 2.5]) for (const offsetS of [0, 0.005, 0.01, 0.02, 0.04, 0.08]) out.push({ kind: "long", where, from: "land", L, offsetS });
  for (const kind of ["stall", "pause"]) for (const anchor of anchors) for (const afterFrames of [0, 1, 3]) for (const L of [0.3, 0.6, 2.5]) out.push({ kind, anchor, afterFrames, L });
  for (const L of [0.35, 0.5, 2.5]) for (const offsetS of [-0.06, -0.03, -0.015]) for (const substepS of [0.001, 0.003]) out.push({ kind: "long", where: "pre", from: "W-land", L, offsetS, substepS });
  return out;
}
