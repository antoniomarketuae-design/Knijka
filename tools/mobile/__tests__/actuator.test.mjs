/**
 * actuator.test.mjs — THE LADDER, AND THE TWO WAYS IT USED TO LIE ABOUT WHAT
 * IT WAS ASKING THE CAR TO DO.
 *
 * `lib/guidance.mjs` §4b turns „I want the car to drive a radius of R" into „so
 * press the key for h milliseconds". Nothing in `guidance.test.mjs` touched any
 * of it — the whole actuator shipped with zero assertions on it — and the two
 * defects it shipped with were both of the same shape: THE CAR WAS TREATED AS A
 * CONSTANT. It is not. The available lock falls with speed, and above 15 км/ч
 * the tyres deliver progressively less of the kinematic turn.
 *
 * EVERY ASSERTION HERE HAS BEEN WATCHED TO FAIL, and the mutation that breaks
 * it is named beside it, which is this file's neighbours' rule.
 *
 * WHERE THE NUMBERS COME FROM. Every physical figure quoted below was measured
 * on the product's own `VehicleSim` on a real Rapier world, headless, by
 * `tools/mobile/lib/steer-bench.mjs --actuator` / `--yaw-gain`. This file does
 * NOT re-run the rig (it would need rapier's wasm and eight seconds a case);
 * it asserts that the closed forms still agree with what the rig said, so a
 * change to either one shows up here and the rig settles the argument.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FULL_RETURN_MS,
  holdMsForMeanAngle,
  maxSteerAtKmh,
  meanAngleForHold,
  meanAngleForRealRadius,
  pursuitMeanAngle,
  radiusForMeanAngle,
  realRadiusForMeanAngle,
  steerCommand,
  TUNE,
  VEHICLE,
  vehicleAtKmh,
  YAW_GAIN_TABLE,
  yawGainAtKmh,
} from "../lib/guidance.mjs";

/** A step-wise integration of the SAME rate limiter, written out here so the
 *  closed form is checked against something that shares no line with it. */
function integrate(holdMs, dtMs, maxAngle = VEHICLE.MAX_ANGLE_RAD, stepS = 0.0002) {
  let s = 0;
  let area = 0;
  const T = dtMs / 1000;
  const h = holdMs / 1000;
  for (let t = 0; t < T - 1e-12; t += stepS) {
    const target = t < h ? maxAngle : 0;
    const rate = Math.abs(target) < Math.abs(s) ? VEHICLE.RETURN_SPEED : VEHICLE.STEER_SPEED;
    const d = target - s;
    s += Math.sign(d) * Math.min(Math.abs(d), rate * stepS);
    area += s * stepS;
  }
  return area / T;
}

describe("§1 meanAngleForHold is the area under the real wheel, not a duty cycle", () => {
  it("agrees with a step-wise integration of the same limiter to 1 %", () => {
    // MUTATION: drop the `areaDown` term (or the plateau) and the ramp-only
    // cases still pass while the long presses go 20-60 % out.
    for (const dtMs of [546, 1021, 1500]) {
      for (const holdMs of [45, 65, 150, 250, 350, 500, 700, 890]) {
        if (holdMs > dtMs - FULL_RETURN_MS) continue;
        const closed = meanAngleForHold(holdMs, dtMs);
        const stepped = integrate(holdMs, dtMs);
        assert.ok(
          Math.abs(closed - stepped) / stepped < 0.01,
          `hold ${holdMs} ms in a ${dtMs} ms tick: closed ${closed.toFixed(5)} vs stepped ${stepped.toFixed(5)}`,
        );
      }
    }
  });

  it("REPRODUCES THE 55x GAP the ladder exists to fill", () => {
    // The two rungs the old ladder could reach, at the measured 1,021 ms
    // period: a capped 65 ms pulse, and the wheel left down all tick.
    // MUTATION: put the tick back to the old 546 ms `dtMs` and the pulse rung
    // reads R = 124 m instead of 232 m, which is how the 55x was missed.
    const pulse = meanAngleForHold(TUNE.MAX_HOLD_MS, TUNE.TICK_MS_ASSUMED);
    const heldDown = meanAngleForHold(TUNE.TICK_MS_ASSUMED, TUNE.TICK_MS_ASSUMED);
    const rPulse = radiusForMeanAngle(pulse);
    const rHeld = radiusForMeanAngle(heldDown);
    assert.ok(rPulse > 200 && rPulse < 270, `65 ms pulse should be ~232 m, got ${rPulse.toFixed(0)}`);
    assert.ok(rHeld > 3.5 && rHeld < 5, `held down should be ~4.2 m, got ${rHeld.toFixed(1)}`);
    assert.ok(rPulse / rHeld > 45, `the gap the rung fills is ~55x, got ${(rPulse / rHeld).toFixed(0)}x`);
  });

  it("puts every radius the corpus demands INSIDE the reachable range", () => {
    // 18.1 m (sc-junction-gap/-stop) down to 9.5 m (sc-ov-oneway) — the whole
    // point of the rung. MUTATION: restore MAX_HOLD_MS as the only ceiling and
    // every one of these becomes unreachable.
    for (const wantR of [18.1, 17.0, 14.2, 10.0, 9.5]) {
      const need = Math.atan(VEHICLE.WHEELBASE_M / wantR);
      const ms = holdMsForMeanAngle(need, TUNE.TICK_MS_ASSUMED);
      assert.ok(ms > TUNE.MIN_HOLD_MS, `R=${wantR} m needs ${ms.toFixed(0)} ms, under the floor`);
      assert.ok(ms < TUNE.TICK_MS_ASSUMED - FULL_RETURN_MS, `R=${wantR} m needs ${ms.toFixed(0)} ms, past the tick bound`);
      assert.ok(ms > TUNE.MAX_HOLD_MS, `R=${wantR} m at ${ms.toFixed(0)} ms would have fitted under the old cap`);
    }
  });
});

describe("§2 holdMsForMeanAngle inverts it, and says so where it cannot", () => {
  it("round-trips inside the tick bound to under 1.5 ms", () => {
    // MUTATION: drop the `maxRampArea` branch and every press past 188 ms
    // comes back tens of ms short.
    for (const dtMs of [546, 1021, 1500]) {
      for (const holdMs of [45, 65, 150, 250, 350, 500, 700, 890]) {
        if (holdMs > dtMs - FULL_RETURN_MS) continue;
        const back = holdMsForMeanAngle(meanAngleForHold(holdMs, dtMs), dtMs);
        assert.ok(Math.abs(back - holdMs) < 1.5, `hold ${holdMs} / tick ${dtMs} round-tripped to ${back.toFixed(1)}`);
      }
    }
  });

  it("returns an OVER-LENGTH press rather than Infinity, so the caller can name the bound", () => {
    // The doc-comment used to claim Infinity and the code never did it. A
    // caller that believed the comment would treat „40 ms too long" and „four
    // seconds too long" as the same refusal.
    // MUTATION: return Infinity here and `steerCommand` loses `cappedBy`.
    const dtMs = 400;
    const ms = holdMsForMeanAngle(0.55, dtMs);
    assert.ok(Number.isFinite(ms), "an unreachable demand must still return a number");
    // Unreachable means „past the bound the caller may press to", which is the
    // tick MINUS the time the wheel needs to come back — not the tick.
    assert.ok(ms > dtMs - FULL_RETURN_MS, `it should be honestly over-length, got ${ms.toFixed(0)} ms of a ${(dtMs - FULL_RETURN_MS).toFixed(0)} ms bound`);
    // …and a demand far past it comes back far past it, not saturated.
    assert.ok(holdMsForMeanAngle(0.55, 200) > ms * 0.5, "the over-length figure must still scale with the demand");
  });
});

describe("§3 the lock the product actually offers at this speed", () => {
  it("is the full 0.6 rad at and below FULL_LOCK_KMH and nowhere above it", () => {
    // MUTATION: flip the lerp's endpoints and the low-speed cases invert.
    assert.equal(maxSteerAtKmh(0), VEHICLE.MAX_ANGLE_RAD);
    assert.equal(maxSteerAtKmh(VEHICLE.FULL_LOCK_KMH), VEHICLE.MAX_ANGLE_RAD);
    assert.ok(maxSteerAtKmh(30) < VEHICLE.MAX_ANGLE_RAD);
    assert.ok(maxSteerAtKmh(45) < maxSteerAtKmh(30));
    assert.ok(Math.abs(maxSteerAtKmh(200) - VEHICLE.MIN_ANGLE_RAD) < 1e-9, "clamped at the far end");
  });

  it("matches what the rig measured, which the fixed-0.6 form does not", () => {
    // Rig (steer-bench --actuator), 1,021 ms tick, mean road-wheel angle:
    //   300 ms @ 22 км/ч → 0.1523   ·   300 ms @ 30 км/ч → 0.1433
    //   300 ms @ 44 км/ч → 0.1259
    // MUTATION: hand `meanAngleForHold` the bare VEHICLE and every one of
    // these goes to 0.1579, which is where the 25 % over-read came from.
    const cases = [[22, 0.1523], [30, 0.1433], [44, 0.1259]];
    for (const [kmh, rig] of cases) {
      const withLock = meanAngleForHold(300, 1021, vehicleAtKmh(kmh));
      const fixed = meanAngleForHold(300, 1021);
      assert.ok(Math.abs(withLock - rig) / rig < 0.02, `${kmh} км/ч: speed-aware ${withLock.toFixed(4)} vs rig ${rig}`);
      assert.ok(Math.abs(fixed - rig) / rig > Math.abs(withLock - rig) / rig, `${kmh} км/ч: the fixed form must be the worse one`);
    }
  });
});

describe("§4 the yaw gain — the car does not make the turn the geometry asks for", () => {
  it("is ~1 where the corpus turns and collapses where it does not", () => {
    // MUTATION: return a constant 1 and the 30 км/ч assertion fails; return a
    // constant 0.5 and the 10 км/ч one does.
    assert.ok(yawGainAtKmh(10) > 0.95 && yawGainAtKmh(10) < 1.1);
    assert.ok(yawGainAtKmh(30) > 0.5 && yawGainAtKmh(30) < 0.62);
    assert.ok(yawGainAtKmh(45) < 0.45);
    // monotone above the full-lock speed — a tyre model that recovers grip as
    // it goes faster is a table someone mistyped
    for (let i = 5; i < YAW_GAIN_TABLE.length; i++) {
      assert.ok(YAW_GAIN_TABLE[i][1] <= YAW_GAIN_TABLE[i - 1][1], `table is not monotone at ${YAW_GAIN_TABLE[i][0]} км/ч`);
    }
    // clamped, not extrapolated: an extrapolated tyre model is a guess
    assert.equal(yawGainAtKmh(500), YAW_GAIN_TABLE[YAW_GAIN_TABLE.length - 1][1]);
  });

  it("makes the REAL radius agree with the rig where the kinematic one does not", () => {
    // Rig: 450 ms @ ~30 км/ч → achieved R 18.13 m, kinematic 11.16 m.
    // MUTATION: drop the gain from `realRadiusForMeanAngle` and this reads
    // 11 m — the number a run.log would have printed for a 18 m turn.
    const mean = meanAngleForHold(450, 1021, vehicleAtKmh(29.7));
    const real = realRadiusForMeanAngle(mean, 29.7, vehicleAtKmh(29.7));
    const kin = radiusForMeanAngle(mean, vehicleAtKmh(29.7));
    assert.ok(Math.abs(real - 18.13) / 18.13 < 0.15, `real radius ${real.toFixed(1)} m vs rig 18.13 m`);
    assert.ok(kin < 13, `the kinematic radius should be the optimistic one, got ${kin.toFixed(1)}`);
  });

  it("inverts: meanAngleForRealRadius asks for the angle that delivers the radius", () => {
    // MUTATION: multiply instead of divide by the gain and this comes back
    // at 30+ m at speed.
    for (const kmh of [8, 20, 30]) {
      const a = meanAngleForRealRadius(12, kmh, vehicleAtKmh(kmh));
      const back = realRadiusForMeanAngle(a, kmh, vehicleAtKmh(kmh));
      assert.ok(Math.abs(back - 12) < 0.05, `${kmh} км/ч: asked 12 m, delivers ${back.toFixed(2)} m`);
    }
  });
});

describe("§5 the turn press, end to end", () => {
  const turn = (kmh, errDeg = -25) =>
    steerCommand({ errDeg, prevErrDeg: errDeg + 2, kmh, dtMs: TUNE.TICK_MS_ASSUMED, sustainRun: TUNE.SUSTAIN_CONFIRM, confident: true });

  it("delivers the SAME radius whatever the speed, until the car runs out of lock", () => {
    // This is the whole refit in one assertion. MUTATION: remove the yaw gain
    // from `pursuitMeanAngle` and the delivered radius at 30 км/ч doubles
    // while the press length and the printed `radiusM` do not move.
    const slow = turn(8);
    const fast = turn(30);
    assert.ok(fast.holdMs > slow.holdMs * 1.5, `the fast press must be longer: ${slow.holdMs} -> ${fast.holdMs} ms`);
    assert.ok(Math.abs(fast.radiusM - slow.radiusM) < 1.5, `same delivered radius: ${slow.radiusM} vs ${fast.radiusM} m`);
  });

  it("publishes the delivered radius and the kinematic one apart", () => {
    // MUTATION: publish only `radiusM` computed kinematically — which is what
    // shipped — and a reader at 30 км/ч is told 9.9 m for an 18 m turn.
    const c = turn(30);
    assert.ok(c.radiusM > c.kinRadiusM, "the real radius is the wider one above the full-lock speed");
    assert.equal(c.yawGain, Number(yawGainAtKmh(30).toFixed(3)));
    assert.ok(c.why.includes("yaw gain"), "the reason must say the gain was applied");
  });

  it("says nothing about a gain at the speeds where there is not one", () => {
    // A record that shouts a correction it did not make is noise. MUTATION:
    // drop the `gain < 0.97` guard and every parking lane's log grows a clause.
    assert.ok(!turn(8).why.includes("yaw gain"));
  });

  it("never presses past the tick bound, so the wheel is centred before the next scan", () => {
    // The strongest property the ladder has over the branch it replaced.
    // MUTATION: drop `tickBound` from the Math.min and a 500 ms tick issues a
    // press that is still winding down when the next scan starts.
    for (const dtMs of [400, 546, 1021, 1500]) {
      for (const kmh of [5, 12, 25, 40]) {
        const c = steerCommand({ errDeg: -40, prevErrDeg: -35, kmh, dtMs, sustainRun: 3, confident: true });
        if (!c.sustain) continue;
        assert.ok(c.holdMs <= dtMs - FULL_RETURN_MS + 0.5, `tick ${dtMs} @ ${kmh}: ${c.holdMs} ms leaves the wheel down`);
        assert.ok(c.holdMs <= TUNE.TURN_HOLD_MAX_MS, `tick ${dtMs} @ ${kmh}: ${c.holdMs} ms past the ceiling`);
      }
    }
  });

  it("names which bound bit, and only when one did", () => {
    // MUTATION: report `cappedBy` unconditionally and every ordinary turn
    // press claims it was clipped.
    const easy = steerCommand({ errDeg: -16, prevErrDeg: -15, kmh: 10, dtMs: 1021, sustainRun: 2, confident: true });
    assert.equal(easy.cappedBy, null, "a small confirmed turn is not capped");
    const hard = steerCommand({ errDeg: -80, prevErrDeg: -75, kmh: 45, dtMs: 1021, sustainRun: 2, confident: true });
    assert.ok(hard.cappedBy !== null, "an unreachable demand must name its bound");
  });

  it("still refuses everything the safety argument rests on", () => {
    // The rung is reachable ONLY on confirmed, confident, same-signed,
    // above-SUSTAIN_DEG evidence. MUTATION: drop any one of the four
    // conditions and one of these four goes green.
    const base = { errDeg: -25, prevErrDeg: -23, kmh: 12, dtMs: 1021 };
    assert.ok(!steerCommand({ ...base, sustainRun: 2, confident: false }).sustain, "a thin sighting may not authorise a turn");
    assert.ok(!steerCommand({ ...base, sustainRun: 1, confident: true }).sustain, "one sample is not confirmation");
    assert.ok(!steerCommand({ ...base, errDeg: -9, prevErrDeg: -8, sustainRun: 5, confident: true }).sustain, "a lane correction is not a turn");
    assert.ok(
      !steerCommand({ ...base, sustainRun: TUNE.SUSTAIN_CONFIRM + TUNE.SUSTAIN_MAX, confident: true }).sustain,
      "past SUSTAIN_MAX the branch retires",
    );
    // …and every unconfirmed command is still bounded by MAX_HOLD_MS.
    const pulse = steerCommand({ ...base, sustainRun: 0, confident: true });
    assert.ok(!pulse.sustain && pulse.holdMs <= TUNE.MAX_HOLD_MS, `an unconfirmed command must stay under the cap, got ${pulse.holdMs}`);
  });

  it("pure pursuit with a gain of 1 is still the textbook law", () => {
    // So the geometry stays readable on its own. MUTATION: fold the gain into
    // the default and this breaks, which is the point of the default being 1.
    const a = 20;
    const Ld = 15;
    const expected = Math.atan((2 * VEHICLE.WHEELBASE_M * Math.sin((a * Math.PI) / 180)) / Ld);
    assert.ok(Math.abs(pursuitMeanAngle(a, { lookaheadM: Ld, maxMeanRad: 1 }) - expected) < 1e-12);
  });
});
