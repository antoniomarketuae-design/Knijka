/**
 * THE CORRECT DEMO HOLDS THE WHEEL THE LIVE CAR NEEDS — sc-ac-crosswind:a9db1738,
 * round 2 (round-1 verifier finding V-06).
 *
 * WHAT WAS WRONG. Both crosswind lessons teach „лека, ПОСТОЯННА корекция", and
 * since the founder rulings of 2026-10-04 / 10-05 the live car really needs
 * one: 3.5 % of the lock held into the wind at sc-ac-crosswind's 34 км/ч. The
 * committed correct demos showed a CENTRED wheel under that caption — the
 * recorder is kinematic, the wind never touches it, and its wheel channel was
 * the bicycle estimate of a straight polyline: 0.000 rad on average along the
 * taught stretch, plus four one-sample spikes up to ±0.55 rad where a polyline
 * vertex happened to land on a sampled frame. A student who copied the demo's
 * wheel on the live car left the carriageway.
 *
 * WHAT IS PINNED HERE, for BOTH lessons:
 *   1. the pure channel (`heldWheelChannel`) — sign, size, gust, ramp, and the
 *      end of the vertex spikes;
 *   2. THE CENSUS INSIDE THE RECORDER — recorded with and without the held
 *      wheel, the two drives differ in the `steerRad` channel and in NOTHING
 *      else: same poses, same events, same production ticks, same grades;
 *   3. the committed shadow CARRIES the correction on the windy stretch, never
 *      comes back to centre there, and RELEASES it in each lull (step 6) — on
 *      the very gust clock the live car is pushed by;
 *   4. the mistake demos are untouched: «отпусната ръка» keeps a loose wheel.
 *
 * The lesson-level half — that this wheel is what a live driver holding the
 * same line actually has in his hands — is in
 * `lessons/scenario/__tests__/crosswind-live-lane-hold.test.ts`.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_AC_CROSSWIND } from "../../lessons/scenario/templates-conditions";
import { SC_AC_WIND_TRUCK_PASS } from "../../lessons/scenario/templates-conditions2";
import type { StagedEventSpec } from "../../contracts";
import type { SimTick } from "../../rules";
import {
  CROSSWIND_BRIDGE_N,
  CROSSWIND_GUST_AMPLITUDE_N,
  CROSSWIND_GUST_PERIOD_SEC,
  crosswindForceAtN,
  crosswindSteerPullRad,
  lessonRigPhysics,
  STEER_FULL_SPEED_KMH,
  STEER_MAX_ANGLE,
  STEER_MIN_ANGLE,
  STEER_MIN_SPEED_KMH,
} from "../../vehicle";
import { parseScenarioTrace } from "../parse";
import {
  HELD_WHEEL_FULL_SPEED_MS,
  heldWheelChannel,
  recordScriptedDrive,
  type DriveScript,
  type HeldWheelWind,
  type RecordedDrive,
} from "../recorder";
import { recordScAcCrosswindDrive, scAcCrosswindShadowScript } from "../scAcCrosswind";
import { recordScAcWindTruckPassDrive, scAcWindTruckPassShadowScript } from "../scAcWindTruckPass";
import type { ScenarioTrace, TraceSample } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const loadJson = (rel: string) => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), "utf-8")) as unknown;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const WIND: HeldWheelWind = lessonRigPhysics({ crosswind: true });
const FO = loadJson("content/world/fo-follow-v1.json");
const MW = loadJson("content/world/mw-v1.json");

/** `tuning.ts`'s speed-sensitive lock: the road-wheel angle full input gives. */
function lockRad(kmh: number): number {
  const f = Math.min(
    1,
    Math.max(0, (Math.abs(kmh) - STEER_FULL_SPEED_KMH) / (STEER_MIN_SPEED_KMH - STEER_FULL_SPEED_KMH)),
  );
  return STEER_MAX_ANGLE + (STEER_MIN_ANGLE - STEER_MAX_ANGLE) * f;
}

/** A 20 Hz sample train: `headingDeg`/`speedKmh` as functions of time. */
function train(sec: number, headingDeg: (t: number) => number, speedKmh: (t: number) => number): TraceSample[] {
  const out: TraceSample[] = [];
  for (let i = 0; i <= Math.round(sec * 20); i++) {
    const tSec = i / 20;
    out.push({
      tSec,
      x: 0,
      y: 0,
      headingDeg: headingDeg(tSec),
      steerRad: 123, // whatever was there is replaced, never read
      speedKmh: speedKmh(tSec),
      gear: 1,
      indicator: "off",
      brakeOn: false,
      throttleOn: true,
    });
  }
  return out;
}

/** The wind on the demo's clock, as the live car is pushed by it. */
const forceAt = (tSec: number) =>
  crosswindForceAtN(WIND.windLateralN, WIND.windGustAmplitudeN, WIND.windGustPeriodSec, tSec);

// ---------------------------------------------------------------------------
// 1. The pure channel
// ---------------------------------------------------------------------------

describe("heldWheelChannel — the wheel that cancels the lesson's own wind along a recorded path", () => {
  it("northbound in the westward wind: held to the RIGHT, by exactly the pull the wind puts on the live car's wheels", () => {
    const samples = train(12, () => 0, () => 34);
    const wheel = heldWheelChannel(samples, WIND);
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!;
      // Northbound: the car's left is WEST, the wind blows west → pushed LEFT
      // (+), pulled left (+), so the hold is negative: to the right.
      const pull = crosswindSteerPullRad(-forceAt(s.tSec), 34 / 3.6);
      expect(pull).toBeGreaterThan(0);
      expect(wheel[i]).toBeCloseTo(-pull, 12);
    }
    // 3.5 % of the lock on average, 2.0 % in the lull, 4.9 % on the gust.
    const share = wheel.map((w) => -w / lockRad(34));
    const mean = share.reduce((a, b) => a + b, 0) / share.length;
    expect(mean).toBeGreaterThan(0.03);
    expect(mean).toBeLessThan(0.05);
    expect(Math.min(...share)).toBeGreaterThan(0.018);
    expect(Math.max(...share)).toBeLessThan(0.052);
  });

  it("the correction is INTO the wind whichever way the car drives, and nothing along it", () => {
    const at = (headingDeg: number) => heldWheelChannel(train(3, () => headingDeg, () => 34), WIND)[30]!;
    expect(at(0)).toBeLessThan(-0.01); // northbound: pushed left, hold right
    expect(at(180)).toBeGreaterThan(0.01); // southbound: pushed right, hold left
    expect(at(180)).toBeCloseTo(-at(0), 12);
    expect(Math.abs(at(90))).toBeLessThan(1e-12); // eastbound, into the wind
    expect(Math.abs(at(270))).toBeLessThan(1e-12); // westbound, with it
  });

  it("it BREATHES with the gust and is released in the lull — on the clock the live gust runs on", () => {
    const samples = train(10, () => 0, () => 34);
    const wheel = heldWheelChannel(samples, WIND);
    const at = (tSec: number) => -wheel[Math.round(tSec * 20)]!;
    const peak = at(CROSSWIND_GUST_PERIOD_SEC / 4); // sin = +1
    const lull = at((3 * CROSSWIND_GUST_PERIOD_SEC) / 4); // sin = −1
    expect(peak / lull).toBeCloseTo(
      (CROSSWIND_BRIDGE_N + CROSSWIND_GUST_AMPLITUDE_N) / (CROSSWIND_BRIDGE_N - CROSSWIND_GUST_AMPLITUDE_N),
      9,
    );
    // …and it is still a correction in the lull: released, not dropped.
    expect(lull).toBeGreaterThan(0.009);
  });

  it("nothing is held on a car that is not moving, and the hold comes in with the first metres", () => {
    const samples = train(4, () => 0, (t) => Math.min(34, t * 8)); // 0 → 34 km/h
    const wheel = heldWheelChannel(samples, WIND);
    expect(wheel[0]).toBe(0);
    for (let i = 0; i < samples.length; i++) {
      const v = samples[i]!.speedKmh / 3.6;
      if (v <= 0.4) expect(wheel[i]).toBe(0);
      else if (v >= HELD_WHEEL_FULL_SPEED_MS) {
        expect(wheel[i]).toBeCloseTo(-crosswindSteerPullRad(-forceAt(samples[i]!.tSec), v), 12);
      } else {
        expect(-wheel[i]!).toBeGreaterThan(0);
        expect(-wheel[i]!).toBeLessThan(crosswindSteerPullRad(-forceAt(samples[i]!.tSec), v));
      }
    }
  });

  it("A TURN MADE IN ONE FRAME IS NOT A 0.5 rad SPIKE — the path's own steer is eased over the window", () => {
    // A 2° kink at t = 5 s, as the kinematic drive makes it: the heading snaps
    // between two samples. The per-frame estimate reads atan(L·Δθ/dt/v): at
    // 34 км/ч that is 0.19 rad for one 1/60 s frame.
    const samples = train(10, (t) => (t < 5 ? 0 : 2), () => 34);
    const calm: HeldWheelWind = { windLateralN: 0, windGustAmplitudeN: 0, windGustPeriodSec: 0 };
    const wheel = heldWheelChannel(samples, calm);
    // To the RIGHT (heading is clockwise-positive, steer is positive-left).
    const peak = Math.min(...wheel);
    expect(peak).toBeLessThan(-0.005);
    expect(peak).toBeGreaterThan(-0.015);
    expect(Math.max(...wheel)).toBe(0);
    // Eased: no sample-to-sample jump bigger than a twentieth of a degree…
    for (let i = 1; i < wheel.length; i++) expect(Math.abs(wheel[i]! - wheel[i - 1]!)).toBeLessThan(0.001);
    // …zero away from the kink, and the whole turn is still there: the
    // heading the wheel's yaw rate integrates to is the 2° of the kink.
    expect(wheel[60]).toBe(0);
    expect(wheel[140]).toBe(0);
    const v = 34 / 3.6;
    let turnedRad = 0;
    for (const w of wheel) turnedRad += ((-Math.tan(w) * v) / 2.6) * 0.05;
    expect((turnedRad * 180) / Math.PI).toBeGreaterThan(1.9);
    expect((turnedRad * 180) / Math.PI).toBeLessThan(2.1);
  });
});

// ---------------------------------------------------------------------------
// 2. THE CENSUS INSIDE THE RECORDER — only the wheel channel moves
// ---------------------------------------------------------------------------

interface Census {
  drive: RecordedDrive;
  ticks: number;
  tickSha: string;
}
function census(district: unknown, script: DriveScript, base: { scenarioId: string; stagedEvents?: StagedEventSpec[] }, heldWheel?: HeldWheelWind): Census {
  const h = createHash("sha256");
  let ticks = 0;
  const drive = recordScriptedDrive(district, script, {
    ...base,
    kind: "shadow",
    seed: 7,
    onTick: (tick: SimTick) => {
      ticks++;
      h.update(JSON.stringify(tick));
    },
    ...(heldWheel ? { heldWheel } : {}),
  });
  return { drive, ticks, tickSha: h.digest("hex") };
}

const CASES = [
  {
    id: "sc-ac-crosswind",
    district: FO,
    script: scAcCrosswindShadowScript,
    base: { scenarioId: "sc-ac-crosswind" },
    committed: SC_AC_CROSSWIND.shadow.path,
    record: () => recordScAcCrosswindDrive(FO, "shadow-correct"),
    /** The stretch the lesson teaches on. */
    windy: (s: TraceSample) => s.speedKmh > 31 && s.speedKmh < 37,
  },
  {
    id: "sc-ac-wind-truck-pass",
    district: MW,
    script: scAcWindTruckPassShadowScript,
    base: {
      scenarioId: "sc-ac-wind-truck-pass",
      stagedEvents: [...(SC_AC_WIND_TRUCK_PASS.staged ?? [])] as StagedEventSpec[],
    },
    committed: SC_AC_WIND_TRUCK_PASS.shadow.path,
    record: () => recordScAcWindTruckPassDrive(MW, "shadow-correct"),
    windy: (s: TraceSample) => s.speedKmh > 66,
  },
] as const;

describe("the held wheel changes the wheel channel and NOTHING else — poses, events, ticks and grades byte-identical", () => {
  for (const c of CASES) {
    it(`${c.id}: recorded with and without it`, () => {
      const plain = census(c.district, c.script(), c.base);
      const held = census(c.district, c.script(), c.base, WIND);
      // The production ticks the stack stepped and graded: the same objects.
      expect(held.ticks).toBe(plain.ticks);
      expect(held.tickSha).toBe(plain.tickSha);
      expect(JSON.stringify(held.drive.ruleEvents)).toBe(JSON.stringify(plain.drive.ruleEvents));
      expect(JSON.stringify(held.drive.outcomes)).toBe(JSON.stringify(plain.drive.outcomes));
      expect(JSON.stringify(held.drive.trace.events)).toBe(JSON.stringify(plain.drive.trace.events));
      expect(held.drive.trace.meta).toEqual(plain.drive.trace.meta);
      // Every sample, every field but one.
      const strip = (t: ScenarioTrace) => JSON.stringify(t.samples.map((s) => ({ ...s, steerRad: 0 })));
      expect(sha(strip(held.drive.trace))).toBe(sha(strip(plain.drive.trace)));
      // …and that one field DID change, on most of the drive.
      const moved = held.drive.trace.samples.filter(
        (s, i) => s.steerRad !== plain.drive.trace.samples[i]!.steerRad,
      ).length;
      expect(moved).toBeGreaterThan(held.drive.trace.samples.length * 0.9);
      // The lesson's own recorder entry IS the held recording (the shadow opts in).
      expect(JSON.stringify(c.record().trace)).toBe(JSON.stringify(held.drive.trace));
    });
  }
});

// ---------------------------------------------------------------------------
// 3. The committed correct demos carry the correction
// ---------------------------------------------------------------------------

describe("the committed correct demo SHOWS the held correction on the windy stretch", () => {
  for (const c of CASES) {
    it(`${c.id}: held into the wind, sized by the wind, never centred, released in the lull — and no spike`, () => {
      const trace = parseScenarioTrace(loadJson(c.committed));
      expect(trace).not.toBeNull();
      const all = trace!.samples;
      const stretch = all.filter(c.windy);
      expect(stretch.length).toBeGreaterThan(200); // 10 s and more at 20 Hz

      // (a) SIZED BY THE WIND: sample for sample the wheel is the path's own
      // steer minus the pull of the live gust at that instant. The path steer
      // of these gentle polylines is under 0.013 rad anywhere on the stretch.
      let sumWheel = 0;
      let sumPull = 0;
      for (const s of stretch) {
        const leftX = -Math.cos((s.headingDeg * Math.PI) / 180);
        const pull = crosswindSteerPullRad(forceAt(s.tSec) * leftX, Math.abs(s.speedKmh) / 3.6);
        expect(pull).toBeGreaterThan(0); // pushed LEFT on both lessons' northbound runs
        expect(Math.abs(s.steerRad + pull)).toBeLessThan(0.013);
        sumWheel += s.steerRad;
        sumPull += pull;
      }
      const meanWheel = sumWheel / stretch.length;
      const meanPull = sumPull / stretch.length;
      // To the RIGHT, and on average the pull itself (the path's own turns
      // cancel out over a stretch that ends where it began).
      expect(meanWheel).toBeLessThan(0);
      expect(-meanWheel).toBeGreaterThan(meanPull * 0.85);
      expect(-meanWheel).toBeLessThan(meanPull * 1.15);

      // (b) RELEASED IN THE LULL, as step 6 says: the wheel in the gust half
      // of the cycle is held harder than in the lull half.
      const phase = (s: TraceSample) => Math.sin((2 * Math.PI * s.tSec) / CROSSWIND_GUST_PERIOD_SEC);
      const mean = (xs: TraceSample[]) => xs.reduce((a, s) => a + s.steerRad, 0) / xs.length;
      const gust = stretch.filter((s) => phase(s) > 0.5);
      const lull = stretch.filter((s) => phase(s) < -0.5);
      expect(gust.length).toBeGreaterThan(30);
      expect(lull.length).toBeGreaterThan(30);
      // (measured: 1.9× on the street; 1.5× on the motorway, whose two lane
      // changes put their own steer on top of the gust's.)
      expect(-mean(gust)).toBeGreaterThan(-mean(lull) * 1.3);

      // (c) NO SPIKE anywhere in the drive: the largest wheel angle is a
      // correction, and no sample jumps.
      expect(Math.max(...all.map((s) => Math.abs(s.steerRad)))).toBeLessThan(0.03);
      for (let i = 1; i < all.length; i++) {
        expect(Math.abs(all[i]!.steerRad - all[i - 1]!.steerRad), `t=${all[i]!.tSec}`).toBeLessThan(0.009);
      }
    });
  }

  it("sc-ac-crosswind: 3–5 % of the lock on the taught stretch (the founder's band), and NEVER back at centre while the wind blows", () => {
    const trace = parseScenarioTrace(loadJson(SC_AC_CROSSWIND.shadow.path))!;
    const stretch = trace.samples.filter((s) => s.speedKmh > 31 && s.speedKmh < 37);
    const share = stretch.map((s) => -s.steerRad / lockRad(s.speedKmh));
    const mean = share.reduce((a, b) => a + b, 0) / share.length;
    expect(mean).toBeGreaterThanOrEqual(0.03); // measured 3.51 %
    expect(mean).toBeLessThanOrEqual(0.05);
    // «ПОСТОЯННА»: the least the demo ever holds there is over 1 % of the lock
    // (measured 1.1 %, in a lull while the authored line is being let drift);
    // before round 2 the median was exactly 0.
    expect(Math.min(...share)).toBeGreaterThan(0.01);
    expect(Math.max(...share)).toBeLessThan(0.055); // measured 5.0 %
    // …and from the first metres to the last: wherever the car is moving at
    // more than walking pace the wheel is to the right of centre.
    for (const s of trace.samples) {
      if (s.speedKmh > 8) expect(s.steerRad, `t=${s.tSec}`).toBeLessThan(-0.004);
    }
  });

  it("sc-ac-wind-truck-pass: the wheel is held on the WHOLE drive — behind the truck and in the overtaking lane alike", () => {
    // The caption this demo used to carry here said «вятърът мълчи». The wheel
    // says otherwise, at the size the live car needs at these speeds.
    const trace = parseScenarioTrace(loadJson(SC_AC_WIND_TRUCK_PASS.shadow.path))!;
    // Three STRAIGHT stretches, each more than a second clear of any polyline
    // vertex, so the wheel there is the held correction and nothing else:
    // behind the truck in the cruise lane, in the overtaking lane on the
    // stretch the old caption called its lee, and back in the cruise lane.
    const regions = [
      { name: "behind the truck (cruise lane, y 60–100)", keep: (s: TraceSample) => s.y > 60 && s.y < 100 && Math.abs(s.x) < 0.01 },
      { name: "the overtaking lane (y 225–268)", keep: (s: TraceSample) => s.y > 225 && s.y < 268 && Math.abs(s.x + 8.12) < 0.01 },
      { name: "after the return (cruise lane, y 500–560)", keep: (s: TraceSample) => s.y > 500 && s.y < 560 && Math.abs(s.x) < 0.01 },
    ];
    for (const r of regions) {
      const xs = trace.samples.filter(r.keep);
      expect(xs.length, r.name).toBeGreaterThan(40); // two seconds and more
      for (const s of xs) {
        const pull = crosswindSteerPullRad(-forceAt(s.tSec), s.speedKmh / 3.6);
        // Held to the RIGHT — toward the truck from the overtaking lane, as
        // step 7 says — and it is exactly the wheel that cancels the wind.
        expect(s.steerRad, `${r.name} t=${s.tSec}`).toBeLessThan(-0.002);
        expect(Math.abs(s.steerRad + pull), `${r.name} t=${s.tSec}`).toBeLessThan(1e-9);
        // 0.7–3.7 % of the lock at these speeds (the gust's lull and peak).
        const share = -s.steerRad / lockRad(s.speedKmh);
        expect(share).toBeGreaterThan(0.006);
        expect(share).toBeLessThan(0.04);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 4. The mistake demos keep their own wheel
// ---------------------------------------------------------------------------

describe("the mistake demos do not opt in — a loose hand shows a loose wheel", () => {
  it("sc-ac-crosswind «Полет срещу поривите»: the wheel is at centre while the gust walks the car off its line", () => {
    const drive = recordScAcCrosswindDrive(FO, "mistake-full-speed");
    // y 150–185: the car is carried from x = 4.06 to x = 0.55 on a straight
    // segment, hands off — the live car does the same with a centred wheel.
    const drifting = drive.trace.samples.filter((s) => s.y > 155 && s.y < 180);
    expect(drifting.length).toBeGreaterThan(20);
    for (const s of drifting) expect(s.steerRad).toBe(0);
  });

  it("neither lesson's mistake recorder passes a held wheel", () => {
    for (const [name, rec] of [
      ["mistake-full-speed", () => recordScAcCrosswindDrive(FO, "mistake-full-speed")],
      ["mistake-overcorrect", () => recordScAcCrosswindDrive(FO, "mistake-overcorrect")],
      ["mistake-blown-out", () => recordScAcWindTruckPassDrive(MW, "mistake-blown-out")],
      ["mistake-clip-truck", () => recordScAcWindTruckPassDrive(MW, "mistake-clip-truck")],
    ] as const) {
      const samples = rec().trace.samples;
      // The bicycle estimate of a polyline is 0 on every straight segment —
      // most of the drive. A held wheel would leave almost none.
      const centred = samples.filter((s) => s.steerRad === 0).length;
      expect(centred, name).toBeGreaterThan(samples.length * 0.9);
    }
  });
});
