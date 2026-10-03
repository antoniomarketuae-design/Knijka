/**
 * harness-h2.test.mjs — HARNESS STAGE H2: the pace that holds on a real drive, the emergency lesson's own start, the
 * GAP-8 driving faults, and the hydration the safe-area agent no longer breaks.
 *
 * Run: node --test tools/mobile/__tests__/harness-h2.test.mjs
 * (collected by platform/scripts/tools-tests.mjs — it walks tools/ and classifies by the `node:test` import.)
 *
 * Every section EXECUTES the code it is about wherever the code can be reached: the pure libs are imported, and the
 * harness's own blocks (lesson-audit.mjs has a top-level await and cannot be imported) are SLICED out of its source and
 * run against fakes — the modulator on a fake clock, the reload start against a fake page — the way
 * wrong-leg-profiles.test.mjs runs the P1 block. Where only wiring is left to check, the check is a source pin and says
 * so. The sabotage that turns each row red is named beside it; harness-h2/builder/mutate-h2.mjs runs them.
 *
 * The cited records: .audit-frames/w69-h1-pc (the pace runs that broke; the emergency encounter over at 0:07), w66
 * (sc-ac-bridge-ice pc-right into the railing; sc-pe-zone-living mobile-right into a pedestrian; the hydration overlay),
 * w67 (sc-merge-lane-end mobile-right: the 800 ms hold, the 8 s scan gap, the open-loop roll after RECOVERY REFUSED).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as L from "../lib/driveline.mjs";
import * as G from "../lib/guidance.mjs";
import { hazardPaceProvenance, hazardPaceRow } from "../lib/hazard.mjs";
import { decodePng } from "../lib/png.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const SRC = readFileSync(resolve(HERE, "..", "lesson-audit.mjs"), "utf8");
const INSETS_SRC = readFileSync(resolve(HERE, "..", "lib", "insets.mjs"), "utf8");
const trace = (id) => JSON.parse(readFileSync(resolve(REPO, "content", "traces", id, "shadow-correct.trace.json"), "utf8"));
const between = (src, a, b) => {
  const i = src.indexOf(a);
  assert.ok(i >= 0, `«${a.slice(0, 60)}» is not in the source`);
  const j = src.indexOf(b, i + a.length);
  assert.ok(j > i, `«${b.slice(0, 60)}» does not follow «${a.slice(0, 60)}»`);
  return src.slice(i, j);
};

/* ═══ §1 THE PACE GOVERNOR'S LAW (lib/driveline.mjs §5 `pacePedal`) ═════════════════════════════════════════════════ */
describe("§1 the pace governor: a fraction of a fixed cycle, from the duty base, the shortfall and the rise", () => {
  const T = 45;
  const base = L.PROFILE_DESIGN.paceDutyBase.value;
  it("the duty base is the model's equilibrium with the pedal's ramps and the default tier in it (0.415 → 0.42), sized at 9ab89b8", () => {
    // SABOTAGE: put the base back to H1's 0.15 — red here.
    assert.equal(base, 0.42);
    assert.equal(L.PROFILE_DESIGN.paceDutyBase.at, L.PROFILE_SIZED_AT_H2);
    assert.equal(L.PROFILE_SIZED_AT_H2, "9ab89b8");
    assert.match(L.PROFILE_DESIGN.paceDutyBase.from, /input\.ts THROTTLE_ATTACK_S/);
    assert.match(L.PROFILE_DESIGN.paceDutyBase.from, /difficulty\.ts DIFFICULTY_PRESETS\.normal/);
    assert.deepEqual([...L.PROFILE_SIZED_COMMITS], [L.PROFILE_SIZED_AT, L.PROFILE_SIZED_AT_H1, L.PROFILE_SIZED_AT_H2]);
  });
  it("at the target with nothing rising, the down time is the base's share of the cycle", () => {
    // SABOTAGE: multiply by the tick's interval again (H1's `duty × dtMs`) — red: the command no longer depends on the cycle.
    assert.deepEqual({ ...L.pacePedal(T, { targetKmh: T }) }, { act: "pulse", ms: Math.round(base * L.PACE_CYCLE_MS) });
    assert.equal(L.PACE_CYCLE_MS, 500);
  });
  it("each км/ч under the target adds the gain; each км/ч over it takes it off", () => {
    const at = (d) => L.pacePedal(d, { targetKmh: T }).ms;
    assert.equal(at(43), Math.round((base + 2 * L.PACE_DUTY_GAIN_PER_KMH) * L.PACE_CYCLE_MS));
    assert.equal(at(47), Math.round((base - 2 * L.PACE_DUTY_GAIN_PER_KMH) * L.PACE_CYCLE_MS));
  });
  it("a rising dial takes duty off, at the rate gain per км/ч a second, on the wall interval between the two readings", () => {
    // SABOTAGE: drop the rate term — red: a launch at the target's edge would still be pressed at the base.
    const still = L.pacePedal(40, { targetKmh: T, prevKmh: 40, wallDtMs: 500 }).ms;
    const rising = L.pacePedal(40, { targetKmh: T, prevKmh: 35, wallDtMs: 500 }).ms;
    const want = Math.round((base + 5 * L.PACE_DUTY_GAIN_PER_KMH - L.PACE_RATE_GAIN_PER_KMH_S * 10) * L.PACE_CYCLE_MS);
    assert.equal(rising, want);
    assert.ok(rising < still);
    // …a falling one adds it, and an interval under the floor is rated over the floor
    assert.ok(L.pacePedal(44, { targetKmh: T, prevKmh: 46, wallDtMs: 500 }).ms > L.pacePedal(44, { targetKmh: T }).ms);
    assert.equal(L.pacePedal(40, { targetKmh: T, prevKmh: 39, wallDtMs: 10 }).ms, L.pacePedal(40, { targetKmh: T, prevKmh: 39, wallDtMs: L.PACE_RATE_MIN_INTERVAL_MS }).ms);
    // …and no reading before it, or no interval, is no rate
    assert.equal(L.pacePedal(40, { targetKmh: T, prevKmh: null, wallDtMs: 500 }).ms, L.pacePedal(40, { targetKmh: T }).ms);
    assert.equal(L.pacePedal(40, { targetKmh: T, prevKmh: 30, wallDtMs: null }).ms, L.pacePedal(40, { targetKmh: T }).ms);
  });
  it("a fraction of 1 or more holds the throttle down, 0 or less lets it up, and the down time is clamped inside the cycle", () => {
    assert.deepEqual({ ...L.pacePedal(10, { targetKmh: T }) }, { act: "down", ms: null });
    assert.deepEqual({ ...L.pacePedal(60, { targetKmh: T }) }, { act: "up", ms: null });
    assert.deepEqual({ ...L.pacePedal(-1, { targetKmh: T }) }, { act: "up", ms: null });
    for (let d = 0; d <= 70; d += 0.5) {
      const c = L.pacePedal(d, { targetKmh: T, prevKmh: d - 1, wallDtMs: 400 });
      if (c.act === "pulse") assert.ok(c.ms >= L.PACE_MIN_PULSE_MS && c.ms <= L.PACE_MAX_PULSE_MS, `${d}: ${c.ms}`);
    }
    assert.equal(L.PACE_MAX_PULSE_MS, L.PACE_CYCLE_MS - 40);
  });
  it("H2 ROUND 2 (V9): the profile takes the rise from the tick before only when both read the dial — none on its first tick, none after an unread dial, none on an interval not over 0 — as pace.governor now says", () => {
    // EXECUTED on the §5 step. (The round-1 sentence said «from the read dial before it», i.e. across an unread tick;
    // the code never did that.) SABOTAGE: carry the last read dial across an unread tick — red on the tick after it.
    const { st, steps } = paceDrive("sc-vu-emergency", [[40, 500], [-1, 500], [44, 300], [46, 300], [47, 0]]);
    const T = st.pace.goalKmh;
    const cmd = (k) => ({ ...steps[k].pedal });
    assert.deepEqual(cmd(0), { ...L.pacePedal(40, { targetKmh: T }) }, "a rise was taken on the profile's first tick");
    assert.deepEqual(cmd(2), { ...L.pacePedal(44, { targetKmh: T }) }, "a rise was taken across an unread dial");
    assert.notDeepEqual({ ...L.pacePedal(44, { targetKmh: T, prevKmh: 40, wallDtMs: 800 }) }, cmd(2), "the case cannot tell the two readings apart");
    assert.deepEqual(cmd(3), { ...L.pacePedal(46, { targetKmh: T, prevKmh: 44, wallDtMs: 300 }) }, "the rise from the tick before was not taken");
    assert.notDeepEqual(cmd(3), { ...L.pacePedal(46, { targetKmh: T }) }, "the case cannot tell a rise from none");
    assert.deepEqual(cmd(4), { ...L.pacePedal(47, { targetKmh: T }) }, "a rise was taken on an interval of 0");
    assert.notDeepEqual(cmd(4), { ...L.pacePedal(47, { targetKmh: T, prevKmh: 46, wallDtMs: L.PACE_RATE_MIN_INTERVAL_MS }) }, "the case cannot tell a rise from none");
    const words = L.PROFILE_LINE_TEMPLATES["pace.governor"];
    assert.match(words, /the dial rose from the tick before to this one when both read it \(over this tick's interval of wall clock, counted as \{rateFloorMs:n\} ms when it is less\), and nothing is taken off on the profile's first tick, on a tick after one whose dial was unread, or on a tick whose interval of wall clock is not over 0;/);
    assert.doesNotMatch(words, /from the read dial before it/);
  });
});

/* ═══ §2 THE PACE RUN ON THE HARNESS'S WALL CLOCK, AND THE LAMP RUN ON THE ROUTE ═════════════════════════════════════ */
/** Drive a pace profile through readings `[kmh, wallDtMs, dtMs?]`; returns every step. */
function paceDrive(id, readings, { posted = 50 } = {}) {
  let st = L.createWrongLegProfile(id, { platform: "pc" });
  let now = 100_000;
  const steps = [];
  for (const [kmh, wall, dt = Math.round(wall * 0.8)] of readings) {
    now += wall;
    const r = L.wrongLegFlatStep(st, { now, t0: 100_000, kmh, flatStepM: (Math.max(0, kmh) / 3.6) * (dt / 1000), dtMs: dt, postedKmh: posted, probeAt: now, wallDtMs: wall });
    st = r.state;
    steps.push(r);
  }
  return { st, steps };
}
describe("§2 the pace run: wall-clock seconds, a wall-clock dial odometer, and the lamp run sized on the route to its ignore point", () => {
  it("the emergency run credits each WALL interval (capped), not the profile clock's — H1's 0.8 under-count is gone", () => {
    // SABOTAGE: credit `dtSec` again — red: 0.8 of every interval.
    const launch = [[20, 500], [30, 500], [41, 500]];
    const { st } = paceDrive("sc-vu-emergency", [...launch, ...Array(10).fill([45, 600, 480])]);
    assert.ok(Math.abs(st.pace.runSec - 6.0) < 1e-9, `run ${st.pace.runSec}`);
    // …a wall interval over the cap credits the cap
    const big = paceDrive("sc-vu-emergency", [...launch, [45, 5000, 400]]);
    assert.ok(Math.abs(big.st.pace.runSec - L.PROFILE_STEP_CAP_MS / 1000) < 1e-9);
  });
  it("a tick handed no wall interval credits nothing and is counted, and the outcome line says so", () => {
    // SABOTAGE: fall back to `dtMs` when the wall interval is missing — red: the tick credits 0.4 s.
    let st = L.createWrongLegProfile("sc-vu-emergency", { platform: "pc" });
    for (const [k, w] of [[41, 500], [45, 500], [45, null]]) {
      st = L.wrongLegFlatStep(st, { now: 1, t0: 0, kmh: k, flatStepM: 5, dtMs: 400, postedKmh: 50, probeAt: 1, wallDtMs: w }).state;
    }
    assert.ok(Math.abs(st.pace.runSec - 0.5) < 1e-9, `run ${st.pace.runSec}`);
    assert.equal(st.pace.wallUnread, 1);
    const fin = L.wrongLegProfileFinish(st, { now: 2, t0: 0, driveEnded: true }).state;
    assert.match(L.wrongLegProfileOutcomeLine(fin), /1 flat tick\(s\) with no wall interval, credited nothing/);
    assert.match(L.wrongLegProfileOutcomeLine(fin), /The pace run's seconds are on the harness's wall clock between its flat readings/);
  });
  it("the lamp run is HELD only WARNING_LAMP_REGRADE_SEC + the margin after the tick its wall-clock dial odometer reads warningLampIgnoreRouteM", () => {
    // SABOTAGE: hold on the whole run's seconds again — red: the run is held long before the odometer reaches 260 m.
    const gate = L.PROFILE_DESIGN.warningLampIgnoreRouteM.value;
    assert.equal(gate, 260);
    const sized = L.PROFILE_DESIGN.WARNING_LAMP_REGRADE_SEC.value + L.PROFILE_SUSTAIN_MARGIN_SEC;
    // 45 км/ч = 12.5 m/s over 500 ms ticks: 6.25 m a tick of wall-clock odometer
    const rd = [[30, 500], [41, 500], ...Array(70).fill([45, 500])];
    const { st, steps } = paceDrive("sc-vp-telltale-red", rd);
    const heldAt = steps.findIndex((s) => s.say && /ANTECEDENT HELD AS SIZED/.test(s.say.line));
    assert.ok(heldAt > 0, "never held");
    const P = st.pace;
    assert.ok(P.gateRoadM >= gate && P.gateRoadM - gate < 6.26, `gate read at ${P.gateRoadM}`);
    assert.ok(P.runSec - P.gateRunSec >= sized - 1e-9 && P.runSec - P.gateRunSec < sized + 0.5 + 1e-9, `held ${P.runSec - P.gateRunSec} s after the gate`);
    assert.ok(P.roadM > gate + sized * 12.5 - 7, "held before the route the sizing names");
    assert.match(steps[heldAt].say.line, /its first reading at or over warningLampIgnoreRouteM 260 m/);
  });
  it("a lamp run that started at or over the route is never held, and says why", () => {
    // SABOTAGE: drop the «started under the route» clause — red: a run started past the ignore point is held.
    const pre = Array(50).fill([30, 500]);
    // 30 км/ч is under the lamp run's start (40): 50 ticks × 4.17 m = 208 m before the run; then the run starts at 270 m+
    const { st } = paceDrive("sc-vp-telltale-red", [...pre, ...Array(14).fill([38, 500]), ...Array(40).fill([45, 500])]);
    assert.ok(st.pace.fromRoadM >= 260, `run started at ${st.pace.fromRoadM}`);
    assert.equal(st.heldAsSized, false);
    const fin = L.wrongLegProfileFinish(st, { now: 1, t0: 0, driveEnded: true }).state;
    assert.match(L.wrongLegProfileOutcomeLine(fin), /started with the harness's wall-clock dial odometer already at [0-9.]+ m, not under warningLampIgnoreRouteM 260 m/);
  });
  it("the sizing line says the lamp run's route and seconds, with no lag allowance, and every word is from the template table", () => {
    const line = L.wrongLegProfileStartLine(L.createWrongLegProfile("sc-vp-telltale-red", { platform: "pc" }), { everyM: 45 });
    assert.match(line, /sized to last 7\.0 s on the harness's wall clock after the tick on which that odometer reads 260 m or more \(WARNING_LAMP_REGRADE_SEC 6 \+ the harness's 1 s, with no lag allowance/);
    assert.doesNotMatch(line, /warningLampBillSec/);
    assert.match(line, /each sized at the commit its own record names — 4112566 \+ 01de885 \+ 9ab89b8/);
  });
});

/* ═══ §3 THE THROTTLE MODULATOR (lesson-audit.mjs), EXECUTED ON A FAKE CLOCK ════════════════════════════════════════ */
const MOD_SRC = between(SRC, "const paceMod = { cmd: null, run: null, stop: false };", "let refusedReversePress = 0;");
function modulator() {
  const clock = { t: 0 };
  const log = [];
  const timers = [];
  const page = { waitForTimeout: (ms) => new Promise((res) => timers.push({ at: clock.t + ms, res })) };
  let holdW = false;
  const throttle = async (on) => {
    if (on === holdW) return;
    holdW = on;
    log.push([clock.t, on ? "down" : "up"]);
  };
  const api = new Function("page", "throttle", "PACE_CYCLE_MS", `"use strict";\n${MOD_SRC}\nreturn { paceMod, paceThrottle, paceRelease };`)(page, throttle, L.PACE_CYCLE_MS);
  /** Advance the fake clock to `t`, firing every timer due on the way, in order. */
  const advance = async (t) => {
    for (;;) {
      await new Promise((r) => setImmediate(r));
      timers.sort((a, b) => a.at - b.at);
      if (!timers.length || timers[0].at > t) break;
      const x = timers.shift();
      clock.t = x.at;
      x.res();
    }
    clock.t = t;
    await new Promise((r) => setImmediate(r));
  };
  return { api, log, advance, held: () => holdW, timers };
}
describe("§3 the modulator keys the command on its own cycle, between ticks and through a pause, until it is stopped", () => {
  it("a `pulse` is down for its ms of every cycle and up for the rest, cycle after cycle, with nothing else calling it", async () => {
    // SABOTAGE: run the command once and return (H1's one press a tick) — red: one down/up pair, then silence.
    const m = modulator();
    await m.api.paceThrottle({ act: "pulse", ms: 210 });
    await m.advance(2600);
    const downs = m.log.filter((e) => e[1] === "down").map((e) => e[0]);
    const ups = m.log.filter((e) => e[1] === "up").map((e) => e[0]);
    assert.deepEqual(downs, [0, 500, 1000, 1500, 2000, 2500]);
    assert.deepEqual(ups, [210, 710, 1210, 1710, 2210]);
    const r = m.api.paceRelease();
    await m.advance(3200);
    await r;
  });
  it("a new command is taken up at the next cycle, `down` holds, `up` lets go", async () => {
    const m = modulator();
    await m.api.paceThrottle({ act: "down", ms: null });
    await m.advance(1200);
    assert.equal(m.held(), true);
    assert.deepEqual(m.log, [[0, "down"]]);
    await m.api.paceThrottle({ act: "up", ms: null });
    await m.advance(1600);
    assert.equal(m.held(), false);
    assert.deepEqual(m.log, [[0, "down"], [1500, "up"]]);
    const r = m.api.paceRelease();
    await m.advance(2200);
    await r;
  });
  it("`paceRelease` stops it within one cycle and nothing keys the throttle after it; a second release is a no-op", async () => {
    // SABOTAGE: make paceRelease return without waiting for the loop — red: a key event lands after the release.
    const m = modulator();
    await m.api.paceThrottle({ act: "pulse", ms: 100 });
    await m.advance(250);
    const released = m.api.paceRelease();
    await m.advance(1000);
    await released;
    const n = m.log.length;
    await m.advance(3000);
    assert.equal(m.log.length, n, "the throttle was keyed after the release");
    assert.equal(m.api.paceMod.run, null);
    await m.api.paceRelease();
  });
  it("the pause branch lets the throttle up only when no modulator runs, and nothing sets the modulator back after a drain", () => {
    // SABOTAGE: put back the H2-draft `await paceRelease();` before the drain — red: the modulator is stopped for a pause.
    const pause = between(SRC, "  if (p.pause !== null) {", "    tickMs.push(Date.now() - tickStart);\n    continue;");
    assert.ok(pause.includes("    if (paceMod.run === null) await throttle(false);\n    const drained = await drainPause();"), "the pause branch stops or lifts the modulator");
    assert.ok(!/paceRelease\(\)/.test(pause), "the pause branch stops the modulator");
    assert.ok(!/paceThrottle\(/.test(pause), "the pause branch sets the modulator");
  });
  it("the flat tick sets the command, a stopping profile's `null` stops the modulator before the plain throttle, and the loop's end stops it before the keys are let go", () => {
    assert.ok(SRC.includes("      if (wrongProfileStep.pedal === null) await paceRelease();\n      if (!wrongProfileStep.pedal) await timed(\"pedals\", () => throttle(true));\n      else await timed(\"pedals\", () => paceThrottle(wrongProfileStep.pedal));"));
    assert.ok(SRC.includes("\n}\nawait paceRelease();\nif (roadWitness !== null) await roadWitness.poll();\nawait throttle(false);\nawait brake(false);\n"));
    // …and nothing else sets or stops it
    assert.equal((SRC.match(/\bpaceThrottle\(/g) ?? []).length - 1, 1, "paceThrottle is called from more than the flat tick");
    assert.equal((SRC.match(/\bawait paceRelease\(\)/g) ?? []).length, 2, "paceRelease is called from somewhere new");
  });
  it("the flat tick hands the profile the wall interval the odometer's own clock measured, and nothing else reads it", () => {
    // SABOTAGE: hand `now - lastTickAt` — red here.
    assert.ok(SRC.includes("  const wallDtMs = now - paceLastAt;\n  paceOdoM += (Math.max(0, p.kmh) / 3.6) * ((now - paceLastAt) / 1000);\n  paceLastAt = now;"));
    assert.ok(SRC.includes("        wallDtMs: wrongProfile.on ? wallDtMs : null,\n"));
    assert.equal((SRC.match(/\bwallDtMs\b/g) ?? []).length, 2 + (SRC.match(/\(see `wallDtMs` above\)/g) ?? []).length + 1);
  });
});

/* ═══ §4 THE EMERGENCY LESSON'S START (lesson-audit.mjs's reload start), EXECUTED AGAINST A FAKE PAGE ═══════════════ */
const RELOAD_SRC = between(SRC, "const wrongLegStart = wrongLegStartFor(MODE === \"right\" || STEER_PROOF ? null : SCENARIO);", "\nlet ended = false;");
async function reloadStart({ mode = "wrong", scenario = "sc-vu-emergency", steerProof = false, dialAfterMs = 900, navMs = 300, unbelted = false } = {}) {
  const clock = { t: 0 };
  const events = [];
  let loadedAt = null;
  // The navigation resolves when the fake clock — driven by the loop's own waits — reaches `navMs`.
  let navDone = null;
  const page = {
    goto: async (url, opts) => {
      events.push(["goto", url, opts.waitUntil]);
      await new Promise((r) => { navDone = r; });
      loadedAt = clock.t;
    },
    reload: async () => { events.push(["reload"]); },
    keyboard: {
      down: async (k) => events.push(["down", k, clock.t]),
      press: async (k) => events.push(["press", k, clock.t]),
    },
    waitForTimeout: async (ms) => {
      clock.t += ms;
      if (navDone !== null && clock.t >= navMs) { const r = navDone; navDone = null; r(); }
    },
  };
  const speedNow = async () => {
    events.push(["read", clock.t]);
    return loadedAt !== null && clock.t - loadedAt >= dialAfterMs ? 3 : loadedAt !== null ? 0 : 7;
  };
  const status = [];
  const inputChannel = { driveKeyEvents: 0 };
  const env = { holdW: false };
  const f = new Function(
    "MODE", "STEER_PROOF", "SCENARIO", "BASE", "page", "speedNow", "saveStatus", "inputChannel", "DRIVE_UNBELTED", "wrongLegStartFor", "RELOAD_START_MAX_MS", "RELOAD_START_POLL_MS", "Date", "env",
    `"use strict"; let holdW = env.holdW; return (async () => {\n${RELOAD_SRC}\nenv.holdW = holdW; return reloadStart; })();`,
  );
  const out = await f(mode, steerProof, scenario, "http://x", page, speedNow, (o) => status.push(o), inputChannel, unbelted, L.wrongLegStartFor, L.RELOAD_START_MAX_MS, L.RELOAD_START_POLL_MS, { now: () => clock.t }, env);
  return { out, events, status, inputChannel, holdW: env.holdW };
}
describe("§4 the reload start: only where the row declares it; the lesson's own address; the throttle held from the load; the dial read only once the page has loaded", () => {
  it("is declared on sc-vu-emergency's row alone, and every other lesson and every right leg starts as it did", async () => {
    // SABOTAGE: return "reload" for every declared row — red: the lamp lesson reloads.
    assert.equal(L.wrongLegStartFor("sc-vu-emergency"), "reload");
    for (const id of [...L.WRONG_LEG_PROFILES.keys()].filter((k) => k !== "sc-vu-emergency")) assert.equal(L.wrongLegStartFor(id), null, id);
    assert.equal(L.wrongLegStartFor("sc-junction-left"), null);
    for (const [mode, sc, proof] of [["right", "sc-vu-emergency", false], ["wrong", "sc-vp-telltale-red", false], ["wrong", "sc-vu-emergency", true]]) {
      const r = await reloadStart({ mode, scenario: sc, steerProof: proof });
      assert.equal(r.out.applies, false);
      assert.deepEqual(r.events, [], `${mode} ${sc} proof=${proof}: the page was touched`);
      assert.equal(r.holdW, false);
    }
  });
  it("loads the lesson's own address (a bare reload lands on the catalogue), presses the throttle again after each wait until the dial reads over 0, and reads the dial only after the load", async () => {
    // SABOTAGE: `page.reload(…)` — red: no goto to the lesson's address. Read the dial before `loaded` — red: the
    // first load's rolling car (7 км/ч here) is taken for the launch.
    const r = await reloadStart({ dialAfterMs: 900 });
    assert.deepEqual(r.events[0], ["goto", "http://x/simulator?scenario=sc-vu-emergency&level=1", "domcontentloaded"]);
    assert.ok(!r.events.some((e) => e[0] === "reload"));
    const reads = r.events.filter((e) => e[0] === "read");
    assert.ok(reads.length > 0 && reads.every((e) => e[1] >= 300), "the dial was read before the page reported its content loaded");
    assert.equal(r.out.goKmh, 3);
    assert.ok(r.out.goMs >= 1200 && r.out.goMs <= 1300 + L.RELOAD_START_POLL_MS, `first ${r.out.goMs}`);
    const downs = r.events.filter((e) => e[0] === "down");
    assert.ok(downs.every((e) => e[1] === "KeyW"));
    assert.equal(downs.length, r.out.keyDowns);
    assert.ok(downs.length >= 10, `pressed ${downs.length} time(s)`);
    for (let k = 1; k < downs.length; k++) assert.ok(downs[k][2] - downs[k - 1][2] <= L.RELOAD_START_POLL_MS + 1, "a press came more than one wait after the last");
    assert.equal(r.holdW, true, "the pedal belief was not set");
    assert.equal(r.inputChannel.driveKeyEvents, r.out.keyDowns);
    assert.deepEqual(r.events.filter((e) => e[0] === "press").map((e) => e[1]), ["KeyB"]);
    assert.equal(r.out.beltPresses, 1);
    assert.deepEqual(r.status, [{ reloadStart: r.out }]);
  });
  it("on the lesson whose mistake IS the belt, the belt is left alone", async () => {
    const r = await reloadStart({ unbelted: true });
    assert.deepEqual(r.events.filter((e) => e[0] === "press"), []);
    assert.equal(r.out.beltPresses, 0);
  });
  it("a dial that never reads over 0 ends the wait at its ceiling, and the line says so in the template table's words", async () => {
    const r = await reloadStart({ dialAfterMs: 1e12 });
    assert.equal(r.out.goKmh, null);
    const st = L.createWrongLegProfile("sc-vu-emergency", { platform: "pc" });
    assert.match(L.wrongLegReloadStartLine(st, r.out), new RegExp(`the dial did not read over 0 in ${L.RELOAD_START_MAX_MS / 1000} s`));
    const ok = await reloadStart({});
    assert.match(L.wrongLegReloadStartLine(st, ok.out), /until the dial first read over 0 — 3 км\/ч, \d+ ms after the load was asked for/);
    assert.equal(L.wrongLegReloadStartLine(L.createWrongLegProfile("sc-vp-telltale-red", { platform: "pc" }), ok.out), null);
  });
  it("the line is printed with the profile's start line, before the drive clock, and only where the reload ran", () => {
    assert.ok(SRC.indexOf("const reloadStart = {") < SRC.indexOf("const t0 = Date.now();\n// P1:"));
    assert.ok(SRC.includes("const wrongProfileReload = reloadStart.applies ? wrongLegReloadStartLine(wrongProfile, reloadStart) : null;\nif (wrongProfileReload !== null) loud(wrongProfileReload);"));
  });
  it("H2 ROUND 2 (F1): on the reload lane the ENTERED THE LOOP line names the reload start's held throttle, never the positive control, and «top» is not called inheritance; every other lane prints it as before", () => {
    // EXECUTED: the ENTERED block is sliced out of the harness and run with the reload record and the dial readings.
    // SABOTAGE: print the old sentence on every lane — red: the reload lane says «the positive control's press, and its
    // decay» (run.log v-em-1 line 302, when the positive control ran on the FIRST load and released at 6 км/ч).
    const block = between(SRC, "if (enteredLoopKmh !== null) {\n  // H2 ROUND 2 (F1)", "// ── AND WHOSE BEHAVIOUR THOSE STOPS WERE");
    const run = (enteredLoopKmh, topSpeed, reload) => {
      const notes = [];
      const louds = [];
      vm.runInContext(block, vm.createContext({ enteredLoopKmh, topSpeed, reloadStart: reload, note: (s) => notes.push(s), loud: (s) => louds.push(s) }));
      return { notes, louds };
    };
    const went = { applies: true, goKmh: 3 };
    const never = { applies: true, goKmh: null };
    const none = { applies: false, goKmh: null };
    const a = run(3, 45, went);
    assert.deepEqual(a.louds, []);
    assert.equal(a.notes.length, 1);
    assert.match(a.notes[0], /^ {2}ENTERED THE LOOP AT: 3 км\/ч — the first tick's dial, which the drive loop did NOT earn: the harness loaded the lesson again after its checks and held the throttle down from that load \(pressing its key again until the dial first read over 0\), and had not let it up when the loop took its first reading \(the WRONG-LEG START line above\)\. «top 45 км\/ч» above must be read against it\.$/);
    assert.doesNotMatch(a.notes[0], /positive control/);
    const b = run(0, 45, never);
    assert.doesNotMatch(b.notes[0], /until the dial first read over 0/, "the line says the dial read over 0 when the reload record says it never did");
    assert.match(b.notes[0], /held the throttle down from that load, and had not let it up/);
    // a launch the loop then barely added to is still the leg's own launch from the lesson's start, not inheritance
    const c = run(30, 40, went);
    assert.deepEqual(c.louds, []);
    assert.doesNotMatch(c.notes[0], /INHERITANCE|positive control/);
    // every other lane: the sentence it always printed, and the inheritance warning where it always fired
    assert.deepEqual(run(3, 45, none).notes, ["  ENTERED THE LOOP AT: 3 км/ч — the first tick's dial, which is speed this drive did NOT earn (the positive control's press, and its decay). «top 45 км/ч» above must be read against it."]);
    const d = run(30, 40, none);
    assert.deepEqual(d.notes, []);
    assert.match(d.louds[0], /\(the positive control's press, and its decay\)\. «top 40 км\/ч» above must be read against it\. AT OR OVER HALF OF «top», SO «top» IS MOSTLY INHERITANCE/);
  });
  it("H2 ROUND 2 (F1): the positive-control line claims only what is true on every lane — its pedal is UP as the control ends — and nothing between the reload start and the loop's first reading lets the throttle up", () => {
    // SOURCE PIN (the positive control and the drive's opening are not reachable outside a live page). SABOTAGE: restore
    // «the pedal is UP entering the drive» — red: on the reload lane the reload holds W down (holdW = true) into the loop.
    assert.ok(SRC.includes("км/ч moving latch — the pedal is UP as this control ends)`"));
    assert.ok(!SRC.includes("entering the drive"), "a sentence still says the pedal is up entering the drive");
    const gap = between(SRC, "  saveStatus({ reloadStart });", "  if (enteredLoopKmh === null) enteredLoopKmh = p.kmh;");
    const code = gap.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.deepEqual(code.match(/throttle\([^)]*\)/g), ["throttle(true)"], "a pedal act other than the wrong leg's throttle press sits between the reload start and the first reading");
    for (const re of [/keyboard\.up\(/, /\bholdW = /, /paceRelease\(/, /paceThrottle\(/]) assert.doesNotMatch(code, re);
  });
});

/* ═══ §5 GAP-8a — THE ARROW OUTRANKS THE RIBBON ONLY WHERE THE AUTHORED ROUTE TURNS; NO SLIVER IS AN ARROW ═════════ */
const W = 1166, H = 210;
function canvas() {
  const data = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) { data[i * 3] = 30; data[i * 3 + 1] = 30; data[i * 3 + 2] = 34; }
  const img = { data, width: W, height: H, channels: 3 };
  img.set = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; data[i] = 23; data[i + 1] = 225; data[i + 2] = 196; };
  img.rect = (x0, y0, ww, hh) => { for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + ww; x++) img.set(x, y); };
  img.arrow = (cx, cy, len, halfWidth, dirX) => {
    const tipX = Math.round(cx + dirX * len * 0.95), backX = Math.round(cx - dirX * len * 0.55);
    for (let y = Math.round(cy - halfWidth); y <= Math.round(cy + halfWidth); y++) for (let x = Math.min(tipX, backX); x <= Math.max(tipX, backX); x++) {
      const t = Math.abs(x - tipX) / Math.max(1, Math.abs(tipX - backX));
      if (Math.abs(y - cy) <= t * halfWidth && Math.abs(y - cy) >= Math.max(0, (t - 0.75) / 0.25) * halfWidth) img.set(x, y);
    }
  };
  return img;
}
describe("§5 GAP-8a: the authored route's turns, the junction gate in readAim, and the sliver ceiling", () => {
  const poly = (id) => G.authoredLinePolyline(trace(id));
  it("routeTurnAhead: the straight bridge and the living zone have no junction turn anywhere; the junction lesson has one near its turn and none past it; a lane merge is not one", () => {
    // SABOTAGE: drop the window (look at the whole route) — red: the junction lesson's last stretch reads a turn ahead.
    for (const id of ["sc-ac-bridge-ice", "sc-pe-zone-living"]) for (const o of [0, 50, 120, 200, 300]) assert.equal(G.routeTurnAhead(poly(id), o).ahead, false, `${id} at ${o}`);
    const jl = poly("sc-junction-left");
    assert.equal(G.routeTurnAhead(jl, 40).ahead, true);
    assert.equal(G.routeTurnAhead(jl, 75).ahead, true);
    assert.equal(G.routeTurnAhead(jl, 140).ahead, false);
    const merge = G.routeTurnAhead(poly("sc-merge-lane-end"), 180);
    assert.equal(merge.ahead, false);
    assert.ok(merge.maxDeg > 10 && merge.maxDeg < G.JUNCTION_TURN_DEG, `merge ${merge.maxDeg}`);
    assert.deepEqual(G.routeTurnAhead(null, 10), { known: false, ahead: false, maxDeg: null });
    assert.deepEqual(G.routeTurnAhead(jl, Number.NaN), { known: false, ahead: false, maxDeg: null });
  });
  it("readAim: with no junction turn ahead an arrow-shaped component outranks nothing — the ribbon is read and the refusal recorded; `undefined` keeps the order as it was", () => {
    // SABOTAGE: drop the `o.junctionAhead === false` branch — red: the chevron is followed on a straight road.
    const img = canvas();
    img.rect(560, 45, 40, 90); // the ribbon ahead, a little left of centre
    img.arrow(900, 60, 30, 13, 1); // an arrow-shaped component to the right
    const s = G.scanBand(img, [], { keepMask: true });
    const legacy = G.readAim(s);
    assert.equal(legacy.signal, "chevron", "the fixture's arrow is not read as one");
    assert.equal(G.readAim(s, { junctionAhead: true }).signal, "chevron");
    const gated = G.readAim(s, { junctionAhead: false });
    assert.equal(gated.signal, "line");
    assert.ok(gated.aimPx < 0, `aim ${gated.aimPx}`);
    assert.match(String(gated.shape.chevronRefused), /no junction turn ahead/);
    assert.equal(legacy.shape.chevronRefused, null);
  });
  it("the sliver ceiling: a component past CHEVRON_MAX_ELONGATION is not the arrow — the ring pieces measured on sc-ac-bridge-ice's w66 frame read 2.91–2.97", () => {
    // SABOTAGE: drop the ceiling clause — red: the 26×10 piece is the arrow again.
    assert.equal(G.CHEVRON_MAX_ELONGATION, 2.5);
    const frame = resolve(REPO, "..", "..", "..", ".audit-frames", "w66-landing-pc", "frames", "sc-ac-bridge-ice__pc-right", "04-t038s.png");
    let png = null;
    try { png = readFileSync(frame); } catch { /* the archived frame is not on this disk */ }
    if (png === null) {
      // The archived frame lives in the main tree's gitignored .audit-frames; off that disk the synthetic sliver stands in.
      const img = canvas();
      img.rect(560, 45, 40, 90);
      img.arrow(900, 60, 40, 6, 1); // long and thin: elongation over the ceiling
      const a = G.readAim(G.scanBand(img, [], { keepMask: true }));
      assert.notEqual(a.signal, "chevron");
      return;
    }
    const img = decodePng(png);
    const band = { x: 265, y: 360, w: 1166, h: 210 };
    const ch = img.data.length / (img.width * img.height);
    const out = Buffer.alloc(band.w * band.h * ch);
    for (let y = 0; y < band.h; y++) for (let x = 0; x < band.w; x++) for (let c = 0; c < ch; c++) out[(y * band.w + x) * ch + c] = img.data[((y + band.y) * img.width + x + band.x) * ch + c];
    const s = G.scanBand({ ...img, width: band.w, height: band.h, data: out }, [], { keepMask: true });
    const a = G.readAim(s);
    assert.ok(!(a.signal === "chevron" && a.shape.chevronPx === 151), "the 151 px ring piece (elongation 2.97) is read as the turn arrow");
    const slivers = G.labelComponents(s.mask, band.w, band.h, { minPx: G.MIN_COMPONENT_PX }).filter((c) => G.classify(c) === "object" && c.elongation > G.CHEVRON_MAX_ELONGATION);
    assert.ok(slivers.some((c) => c.n === 151), "the measured sliver is no longer in the frame's components");
  });
  it("the harness hands readAim the authored route's answer at the dial odometer, and never the pose", () => {
    const tick = between(SRC, "async function guideTick(kmh, tElapsedMs, dtMs) {", "\nasync function guideLeaveRoll()");
    assert.ok(tick.includes("const guideTurn = AUTHORED_LINE === null ? { known: false, ahead: false, maxDeg: null } : routeTurnAhead(AUTHORED_LINE, paceOdoM);"));
    assert.ok(tick.includes("junctionAhead: guideTurn.known ? guideTurn.ahead : undefined,"));
    assert.ok(!/routeTurnAhead\([^)]*witness/i.test(tick), "the route is indexed by a pose");
  });
});

/* ═══ §6 GAP-8d — NO SUSTAINED PRESS WITHOUT A TURN AHEAD; THE FLIP INHERITS THE PRESS IT CORRECTS ════════════════ */
describe("§6 GAP-8d: the sustained-turn branch gated on the authored route, and the flipped correction", () => {
  it("a steady −23° bearing at 7 км/ч on a long phone tick: `turnAhead: false` gives a bounded pulse and says why; `undefined` keeps the 800 ms press", () => {
    // SABOTAGE: drop `!noTurnAhead &&` — red: the merge lesson's lateral offset is pressed as a turn again.
    const a = { errDeg: -23, kmh: 7, sustainRun: G.TUNE.SUSTAIN_CONFIRM, dtMs: 2500 };
    const before = G.steerCommand(a);
    assert.equal(before.sustain, true);
    assert.ok(before.holdMs > G.TUNE.MAX_HOLD_MS);
    const gated = G.steerCommand({ ...a, turnAhead: false });
    assert.equal(gated.sustain, false);
    assert.ok(gated.holdMs <= G.TUNE.MAX_HOLD_MS);
    assert.equal(gated.turnRefused, true);
    assert.match(gated.why, /no junction turn ahead/);
    assert.equal(G.steerCommand({ ...a, turnAhead: true }).sustain, true);
  });
  it("an error that flipped past SUSTAIN_DEG after a sustained press inherits that press's length (bounded), for one tick", () => {
    // SABOTAGE: drop the flip branch — red: the 800 ms overshoot is answered with 65 ms again.
    const r = G.steerCommand({ errDeg: 21, kmh: 7, sustainRun: 1, dtMs: 2500, flipFrom: { dir: "left", holdMs: 800 } });
    assert.equal(r.dir, "right");
    assert.equal(r.holdMs, 800);
    assert.equal(r.inherited, true);
    assert.equal(r.sustain, true);
    // bounded by the tick
    assert.equal(G.steerCommand({ errDeg: 21, kmh: 7, dtMs: 600, flipFrom: { dir: "left", holdMs: 800 } }).holdMs, Math.round(600 - G.FULL_RETURN_MS));
    // not on the same side, not under SUSTAIN_DEG, not on a thin sighting
    assert.notEqual(G.steerCommand({ errDeg: -21, kmh: 7, dtMs: 2500, flipFrom: { dir: "left", holdMs: 800 } }).inherited, true);
    assert.notEqual(G.steerCommand({ errDeg: 10, kmh: 7, dtMs: 2500, flipFrom: { dir: "left", holdMs: 800 } }).inherited, true);
    assert.notEqual(G.steerCommand({ errDeg: 21, kmh: 7, dtMs: 2500, confident: false, flipFrom: { dir: "left", holdMs: 800 } }).inherited, true);
  });
  it("the harness passes the route and the last scan's sustained press, and a press is inherited by the NEXT scan only", () => {
    const tick = between(SRC, "async function guideTick(kmh, tElapsedMs, dtMs) {", "\nasync function guideLeaveRoll()");
    assert.ok(tick.includes("    turnAhead: guideTurn.known ? guideTurn.ahead : undefined,\n    flipFrom: guideFlipFrom,\n"));
    assert.ok(tick.includes("  const guideFlipFrom = guideLastSustain;\n  guideLastSustain = null;"));
    assert.ok(tick.includes("  guideLastSustain = cmd.sustain === true ? { dir: cmd.dir, holdMs: cmd.holdMs } : null;"));
    assert.ok(tick.indexOf("const guideFlipFrom = guideLastSustain;") < tick.indexOf("const cmd = steerCommand({\n    errDeg,"));
  });
  it("THE LEAN IS NOT SCALED, AND WHY: measured in degrees the phone and pc legs lean the same — 151 px ≈ 5.2° and 70 px ≈ 5.2°; the pixels differ by the viewport", () => {
    // A recorded fact the triage read in pixels; no hold is scaled by a pixel ratio. (Pinned so a later scaling has to
    // argue with the degrees.)
    assert.ok(!/leanScale|holdScale/.test(SRC), "a hold is scaled by a lean ratio");
  });
});

/* ═══ §7 GAP-8b / 8e / 8f — THE RIGHT LEG'S PEDALS AROUND THE HARNESS'S OWN WORK, THE TASK CAP, AND THE HALT ═══════ */
describe("§7 GAP-8b/8e/8f: the task cap in the pace target, the throttle let up before a frame, the coast after a long gap, the halt after RECOVERY REFUSED", () => {
  it("hazardPaceRow: a row the task cap lowered says so; a lane with no task cap writes the row it always wrote", () => {
    // SABOTAGE: drop the task-cap fold — red: the zone lesson's row asks for 18 under «дръж под 5».
    assert.deepEqual(hazardPaceRow(null, { tSec: 1, odoM: 2, pacedKmh: 18, capKmh: null }), { tSec: 1, odoM: 2, kmh: 18, pacedKmh: 18, hazardCapKmh: null, src: "pace" });
    assert.deepEqual(hazardPaceRow(null, { tSec: 1, odoM: 2, pacedKmh: 18, capKmh: null, taskCapKmh: 5 }), { tSec: 1, odoM: 2, kmh: 5, pacedKmh: 18, hazardCapKmh: null, src: "task-cap", taskCapKmh: 5 });
    assert.deepEqual(hazardPaceRow(null, { tSec: 1, odoM: 2, pacedKmh: 4, capKmh: null, taskCapKmh: 5 }).src, "pace");
    assert.equal(hazardPaceRow(null, { tSec: 1, odoM: 2, pacedKmh: 18, capKmh: 6, taskCapKmh: 5 }).kmh, 5);
    const prev = hazardPaceRow(null, { tSec: 1, odoM: 2, pacedKmh: 18, capKmh: null });
    assert.notEqual(hazardPaceRow(prev, { tSec: 2, odoM: 3, pacedKmh: 18, capKmh: null, taskCapKmh: 18 - 13 }), null, "a provenance change was deduplicated away");
    assert.match(hazardPaceProvenance([hazardPaceRow(null, { tSec: 1, odoM: 2, pacedKmh: 18, taskCapKmh: 5 })]), /LOWERED TO THE TASK CAP ON THE GLASS \(5 км\/ч\)/);
    assert.equal(hazardPaceProvenance([prev]), `all 1 target row(s) carry src:"pace" — the hazard loop lowered none of them, so kmh IS the pace law's target`);
  });
  it("the roll folds the strictest task cap on the glass into its target by `min`, beside the hazard cap", () => {
    assert.ok(SRC.includes("      const rollTaskCaps = parseTaskCapsKmh(p.taskCapText);\n      const rollTaskCap = rollTaskCaps.length ? Math.min(...rollTaskCaps) : null;\n      target = Math.min(paced, hz.capKmh ?? Number.POSITIVE_INFINITY, rollTaskCap ?? Number.POSITIVE_INFINITY);"));
    assert.ok(SRC.includes("        taskCapKmh: rollTaskCap,\n"));
  });
  it("a ribbon roll held under the task cap gets that time back on the drive budget, at most TASK_CAP_BUDGET_MAX_MS more, and the PACE block says how much", () => {
    // SABOTAGE: drop the extension (or let it run past its ceiling) — red. The zone lesson's «дръж под 5» ran out of the
    // 210 s budget at y=295 on t3-r1 with no fault on the glass.
    assert.match(SRC, /^const TASK_CAP_BUDGET_MAX_MS = 150_000;$/m);
    assert.ok(SRC.includes("      if (rollTaskCap !== null && rollTaskCap < Math.min(paced, hz.capKmh ?? Number.POSITIVE_INFINITY)) rollTaskCapMs += now - lastTickAt;"));
    assert.ok(SRC.includes('  if (STEER_BY === "ribbon" && rollTaskCapMs > 0 && budgetMs < DRIVE_BUDGET_MS + Math.min(TASK_CAP_BUDGET_MAX_MS, rollTaskCapMs)) {'));
    assert.ok(SRC.includes("    budgetMs = DRIVE_BUDGET_MS + Math.min(TASK_CAP_BUDGET_MAX_MS, rollTaskCapMs);"));
    // (the slow-tick widening and this one; the slow-tick one only ever raises it to SLOW_DRIVE_BUDGET_MS, and this one only
    // raises it while it is under DRIVE_BUDGET_MS + the time given back)
    assert.equal((SRC.match(/\bbudgetMs = /g) ?? []).length, 2, "the budget is set somewhere else too");
    assert.ok(SRC.includes("TASK CAP (H2): ${Math.round(rollTaskCapMs / 1000)} s of roll ran with the task cap on the glass under the tape's pace"));
  });
  it("on a ribbon leg's roll the throttle is let up before the periodic frame — and the fault-card beats stay photograph-only", () => {
    // SABOTAGE: drop the release — red. (driveline.test.mjs §M keeps `throttle(` out of the fault-card block.)
    const beat = between(SRC, "    const withShot = now - lastShot >= spacing;", "    const s = await beat(periodicLabel, { withShot });");
    assert.ok(beat.includes('    if (MODE === "right" && STEER_BY === "ribbon" && phase === "roll" && holdW) {\n      await throttle(false);\n      pace.beatReleases += 1;\n    }'));
    const extra = between(SRC, "while (faultBeatQueue.length > 0 && Date.now() >= faultBeatQueue[0].dueAt)", "if (ended) break;");
    assert.ok(!extra.includes("throttle("));
  });
  it("a roll tick that comes more than GUIDE_GAP_PEDAL_MS after the steering loop's last tick does not press the throttle", () => {
    assert.match(SRC, /^const GUIDE_GAP_PEDAL_MS = 3000;$/m);
    assert.ok(SRC.includes("      const rollGapHold = guideLastTickAt !== null && now - guideLastTickAt > GUIDE_GAP_PEDAL_MS;"));
    assert.ok(SRC.includes("        await throttle(!hz.brake && !rollGapHold && p.kmh >= 0 && p.kmh < target - lift);"));
  });
  it("RECOVERY REFUSED sets the halt; the roll hands over to `halt`, which lets the throttle up, brakes to rest and ends the drive loop", () => {
    // SABOTAGE: drop `recoveryHalt = true;` — red: the drive rolls on open-loop after the refusal.
    const refusal = between(SRC, "    if (!budget.ok) {", "      return;\n    }");
    assert.ok(refusal.includes("recovery.exhausted = true;") && refusal.includes("recoveryHalt = true;"));
    assert.ok(SRC.includes('      if (recoveryHalt && phase === "roll") {\n        await guideLeaveRoll();\n        phase = "halt";'));
    const halt = between(SRC, '    } else if (phase === "halt") {', '    } else if (phase === "reverse") {');
    assert.ok(halt.includes("await throttle(false);") && halt.includes("await brake(true, p.kmh);"));
    assert.match(halt, /if \(p\.kmh >= 0 && p\.kmh <= 1\) \{[\s\S]*loud\([\s\S]*break;\n {6}\}/);
    assert.match(halt, /Nothing after this line is driven/);
  });
  it("H2 ROUND 2 (C1): a refusal on a roll's LAST tick still halts — the roll's end does not overwrite the halt with `stop`, and once halted nothing presses the throttle again", async () => {
    // EXECUTED: the roll's tail (the halt hand-over, the roll bookkeeping and the roll-end test), the stop phase and the
    // halt phase are sliced out of the harness and run tick by tick against fakes. A roll tick is modelled as what the
    // roll's pedal line does under its target at these speeds — `throttle(!hz.brake && !rollGapHold && p.kmh >= 0 &&
    // p.kmh < target - lift)` presses — followed by the sliced tail. On the refusal tick guideTick has just set
    // `recoveryHalt`. SABOTAGE (the round-1 source): drop `phase === "roll" &&` from the roll-end test — red: on the
    // last-tick case the phase becomes `stop`, the stop at rest hands back to a roll after STOP_MS, and that roll
    // presses the throttle before the halt re-latches.
    const tail = between(SRC, "      // H2 (GAP-8f): the recovery ceiling refused on this tick", '    } else if (phase === "stop") {');
    const STOP_H = '    } else if (phase === "stop") {';
    const HALT_H = '    } else if (phase === "halt") {';
    const stopBody = between(SRC, STOP_H, HALT_H).slice(STOP_H.length);
    const haltRaw = between(SRC, HALT_H, '    } else if (phase === "reverse") {').slice(HALT_H.length);
    assert.equal((haltRaw.match(/\bbreak;/g) ?? []).length, 1, "the halt phase no longer ends the loop with one `break;`");
    const haltBody = haltRaw.replace(/\bbreak;/, 'return "break";');
    const num = (name) => Number(SRC.match(new RegExp(`^const ${name} = ([\\d_]+);`, "m"))[1].replace(/_/g, ""));
    const run = async (lastTick) => {
      const log = [];
      const presses = [];
      let leaves = 0;
      const ctx = vm.createContext({
        Math, Infinity, Number,
        STEER_BY: "ribbon", STOP_MS: num("STOP_MS"), MIN_PHASE_TICKS: num("MIN_PHASE_TICKS"), LAWFUL_WAIT_MAX_MS: num("LAWFUL_WAIT_MAX_MS"),
        paceLookM: () => 15, paceRollCapMs: () => 1e9,
        pace: { capHits: 0, capHitsHazard: 0, rolls: 0 },
        pathFollow: { wantStop: false, dwellMs: 0, lastAbsKmh: 0 },
        hz: { capKmh: null }, target: 20,
        recoveryHalt: false, phase: "roll", phaseAt: 0, phaseTicks: 0, drivingTicks: 0, rollM: lastTick ? 14.9 : 2, rollHazardCapMs: 0,
        hazardHoldAt: null, hazardPrevCls: null, waitStartedAt: null, restLogged: false, stopsMade: 0, shotStopped: true, shotWaited: true,
        waitsHonoured: 0, waitSeconds: 0, holdS: false, holdW: true, prevKmh: -1, lostKeys: 0, inputChannel: { driveKeyEvents: 0 },
        now: 250, lastTickAt: 0, t0: 0, p: { kmh: 12, lawfulWait: null, lawfulWaitVia: null },
        loud: (s) => log.push(s), note: (s) => log.push(s), shot: async () => {}, timed: async (_, f) => f(),
        guidePose: async () => {}, guideLeaveRoll: async () => { leaves += 1; },
        throttle: async (on) => { presses.push([ctx.now, !!on]); ctx.holdW = !!on; },
        brake: async (on) => { ctx.holdS = !!on; },
        pathSafeKmh: (k) => k, pathStopExit: () => true,
        page: { keyboard: { up: async () => {} } },
      });
      const fn = (body) => vm.runInContext(`(async () => {${body}\n})`, ctx);
      const rollTail = fn(tail), stop = fn(stopBody), halt = fn(haltBody);
      const refusalAt = ctx.now;
      let ended = false;
      for (let tick = 0; tick < 400 && !ended; tick++) {
        if (ctx.phase === "roll") {
          await ctx.throttle(true);
          if (tick === 0) ctx.recoveryHalt = true;
          await rollTail();
        } else if (ctx.phase === "stop") {
          await stop();
        } else if (ctx.phase === "halt") {
          ended = (await halt()) === "break";
        } else {
          assert.fail(`phase «${ctx.phase}»`);
        }
        if (tick === 0) assert.equal(ctx.phase, "halt", `the refusal tick left the phase «${ctx.phase}» (lastTick ${lastTick})`);
        ctx.prevKmh = ctx.p.kmh;
        ctx.lastTickAt = ctx.now;
        ctx.now += 250;
        ctx.p = { ...ctx.p, kmh: ctx.holdS ? Math.max(0, ctx.p.kmh - 4) : ctx.holdW ? ctx.p.kmh + 2 : Math.max(0, ctx.p.kmh - 1) };
      }
      return { ended, log, leaves, rolls: ctx.pace.rolls, pressedAfter: presses.filter(([t, on]) => on && t > refusalAt).length };
    };
    for (const lastTick of [true, false]) {
      const r = await run(lastTick);
      assert.equal(r.pressedAfter, 0, `the throttle was pressed ${r.pressedAfter} time(s) after the refusal (lastTick ${lastTick})`);
      assert.ok(r.ended, `the halt never ended the drive loop (lastTick ${lastTick})`);
      assert.equal(r.leaves, 1, `the wheel was centred ${r.leaves} time(s), not once (lastTick ${lastTick})`);
      assert.equal(r.rolls, 0, `a roll was counted as ended by its length after the halt (lastTick ${lastTick})`);
      assert.ok(r.log.some((s) => s.startsWith("THE RECOVERY CEILING REFUSED, SO THIS DRIVE STOPS HERE")), `no halt line (lastTick ${lastTick})`);
    }
  });

  it("H2 ROUND 2 (integrator, from the round-2 verifier): a halted car at rest under a banner that asks for R is NOT armed into reverse — the R gate before the phase branch yields to the halt", async () => {
    // EXECUTED: the «DOES THIS TASK WANT R?» gate, the roll's tail and the halt phase are sliced out and run tick by tick.
    // The banner starts asking for R the moment the halted car is at rest. SABOTAGE: drop `phase !== "halt" &&` from the
    // gate — red: armReverse runs and the drive enters the reverse phase, whose roll presses the throttle again.
    const rWant = between(SRC, "    // ── DOES THIS TASK WANT R?", "    // ACT FIRST, DECIDE AFTERWARDS");
    const tail = between(SRC, "      // H2 (GAP-8f): the recovery ceiling refused on this tick", '    } else if (phase === "stop") {');
    const HALT_H = '    } else if (phase === "halt") {';
    const haltBody = between(SRC, HALT_H, '    } else if (phase === "reverse") {').slice(HALT_H.length).replace(/\bbreak;/, 'return "break";');
    const events = [];
    const ctx = vm.createContext({
      Math, Infinity, Number, Date,
      STEER_BY: "ribbon", REVERSE_ARM_BUDGET: 6, MODE: "right",
      paceLookM: () => 15, paceRollCapMs: () => 1e9,
      pace: { capHits: 0, capHitsHazard: 0, rolls: 0 },
      pathFollow: { wantStop: false },
      hz: { capKmh: null }, target: 20,
      reverse: { armed: false, blocked: null, attempted: 0, demanded: false, demandedBy: null, gearSeen: [], bursts: 0 },
      recoveryHalt: false, phase: "roll", phaseAt: 0, phaseTicks: 0, drivingTicks: 0, rollM: 2, rollHazardCapMs: 0,
      hazardHoldAt: null, hazardPrevCls: null, waitStartedAt: null, restLogged: false,
      holdS: false, holdW: true, tickMs: [], tickStart: 0, lastTickAt: 0, t0: 0, now: 250,
      p: { kmh: 12, lawfulWait: null, reverseWant: null, gear: ["D"] },
      loud: (s) => events.push(["loud", s]), note: (s) => events.push(["note", s]), shot: async (n) => events.push(["shot", n]),
      timed: async (_, f) => f(), saveStatus: () => {}, aimEnterLeg: () => events.push(["aimEnterLeg"]),
      guidePose: async () => {}, guideLeaveRoll: async () => {},
      armReverse: async () => { events.push(["armReverse"]); return true; },
      throttle: async (on) => { events.push(["throttle", !!on]); ctx.holdW = !!on; },
      brake: async (on) => { events.push(["brake", !!on]); ctx.holdS = !!on; },
      sChannel: async () => {}, gear: async () => ["D"], gearLine: (g) => g.join(""), reverseWhy: () => null,
      pathArmGateWait: () => {},
    });
    const rFn = vm.runInContext(`(async () => { do {${rWant}\n} while (false); })`, ctx);
    const rollTail = vm.runInContext(`(async () => {${tail}\n})`, ctx);
    const halt = vm.runInContext(`(async () => {${haltBody}\n})`, ctx);
    let ended = false;
    let haltedAt = null;
    for (let tick = 0; tick < 60 && !ended; tick++) {
      if (ctx.phase === "halt" && ctx.p.kmh <= 1) ctx.p = { ...ctx.p, reverseWant: "включи на заден ход" };
      await rFn();
      if (ctx.phase === "roll") {
        await ctx.throttle(true);
        if (tick === 0) ctx.recoveryHalt = true;
        await rollTail();
        if (ctx.phase === "halt" && haltedAt === null) haltedAt = events.length;
      } else if (ctx.phase === "halt") {
        ended = (await halt()) === "break";
      } else if (ctx.phase === "reverse") {
        events.push(["REVERSE-PHASE-ENTERED"]);
        break;
      }
      ctx.now += 250;
      ctx.p = { ...ctx.p, kmh: ctx.holdS ? Math.max(0, ctx.p.kmh - 4) : ctx.p.kmh };
    }
    assert.ok(haltedAt !== null, "the refusal never handed over to the halt");
    const after = events.slice(haltedAt);
    assert.ok(ctx.p.reverseWant !== null, "the banner never asked for R, so this test proved nothing");
    assert.ok(!after.some((e) => e[0] === "armReverse"), "the halted car was armed into R");
    assert.ok(!after.some((e) => e[0] === "REVERSE-PHASE-ENTERED"), "the halted drive entered the reverse phase");
    assert.ok(!after.some((e) => e[0] === "throttle" && e[1] === true), "the throttle was pressed after the halt");
    assert.ok(ended, "the halt never ended the loop");
  });
});

/* ═══ §8 GAP-8c — THE SAFE-AREA AGENT, RUN IN A FAKE DOCUMENT ══════════════════════════════════════════════════════ */
const AGENT_SRC = between(INSETS_SRC, "function agent(config) {", "\n/**\n * Install the emulation");
class El {
  constructor(tag, style = null, react = false) {
    this.tagName = tag;
    this.nodeType = 1;
    this._style = style;
    this.kids = [];
    if (react) this["__reactProps$abc123"] = {};
    const self = this;
    this.style = {
      get cssText() { return self._style ?? ""; },
      get length() { return self._style ? self._style.split(";").filter(Boolean).length : 0; },
      item(i) { return self._style.split(";").filter(Boolean)[i].split(":")[0].trim(); },
      getPropertyValue(p) { const d = self._style.split(";").find((x) => x.split(":")[0].trim() === p); return d ? d.slice(d.indexOf(":") + 1).trim() : ""; },
      getPropertyPriority() { return ""; },
      setProperty(p, v) { self._style = self._style.split(";").filter(Boolean).map((x) => (x.split(":")[0].trim() === p ? `${p}: ${v}` : x)).join(";"); },
    };
    this.dataset = {};
  }
  getAttribute(n) { return n === "style" ? this._style : null; }
  *walk() { for (const k of this.kids) { yield k; yield* k.walk(); } }
  querySelectorAll() { return [...this.walk()].filter((e) => e._style && e._style.includes("safe-area-inset")); }
}
function runAgent() {
  const html = new El("HTML");
  const pre = new El("DIV", "right: calc(0.75rem + env(safe-area-inset-right, 0px))", false);
  const hydrated = new El("DIV", "top: calc(1rem + env(safe-area-inset-top, 0px))", true);
  html.kids.push(pre, hydrated);
  const clock = { t: 1000 };
  const timers = [];
  const win = { addEventListener() {} };
  const document = {
    documentElement: html,
    styleSheets: [],
    adoptedStyleSheets: [],
    addEventListener() {},
    querySelector: (s) => html.querySelectorAll(s)[0] ?? null,
  };
  const ctx = vm.createContext({
    window: win, document, Date: { now: () => clock.t },
    setTimeout: (fn, ms) => timers.push({ at: clock.t + ms, fn }),
    MutationObserver: class { observe() {} },
  });
  vm.runInContext(`(${AGENT_SRC.replace(/^function agent/, "function")})({ inset: { top: 59, right: 12, bottom: 34, left: 21 }, source: "t" })`, ctx);
  const run = (until) => {
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      if (!timers.length || timers[0].at > until) break;
      const x = timers.shift();
      clock.t = x.at;
      x.fn();
    }
    clock.t = until;
  };
  return { html, pre, hydrated, win, run, clock };
}
describe("§8 GAP-8c: the agent writes nothing on <html>, and rewrites an inline style only once React has hydrated its element (or after the grace)", () => {
  it("nothing is stamped on <html>; the readback is on window.__knijkaInsets", () => {
    // SABOTAGE: put the dataset stamps back — red here.
    const a = runAgent();
    a.run(2000);
    assert.deepEqual(a.html.dataset, {});
    assert.equal(a.win.__knijkaInsets.emulated, "59,12,34,21");
    assert.ok(!/documentElement\.dataset/.test(AGENT_SRC), "the agent writes a dataset attribute on <html>");
  });
  it("an element React has hydrated is rewritten; one it has not is held, then rewritten once it has", () => {
    // SABOTAGE: drop the `reactOwned` gate — red: the not-yet-hydrated element is rewritten before hydration.
    const a = runAgent();
    a.run(1500);
    assert.equal(a.hydrated._style, "top: calc(1rem + 59px)");
    assert.equal(a.pre._style, "right: calc(0.75rem + env(safe-area-inset-right, 0px))", "a server-rendered style was rewritten before React hydrated it");
    assert.ok(a.win.__knijkaInsets.inlineHeld > 0);
    a.pre["__reactProps$abc123"] = {}; // React hydrates it
    a.run(2000);
    assert.equal(a.pre._style, "right: calc(0.75rem + 12px)");
    assert.equal(a.win.__knijkaInsets.rewrites, 2);
  });
  it("an element React never claims is rewritten once the grace has passed", () => {
    const a = runAgent();
    a.run(1500);
    assert.match(a.pre._style, /env\(/);
    a.run(1000 + 20_000 + 300);
    assert.equal(a.pre._style, "right: calc(0.75rem + 12px)");
    assert.equal(a.win.__knijkaInsets.inlineAfterGrace, 1);
  });
});
