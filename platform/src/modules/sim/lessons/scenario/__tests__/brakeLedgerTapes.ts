/**
 * THE BRAKE-LEDGER TAPES (test support only) — the open-loop sc-follow-tailgater
 * drives on ln-v1 (northbound right lane, x 12.19) that the 2026-10-17 triage
 * (round 3, `sustaintie` and `flooredpraise`) replayed through the live rung
 * chain, kept byte-for-byte so the lane re-measures the SAME tapes:
 *   · `pedalTape` — the tailbrake3 round-3 verifier's «rw» drives: launch,
 *     ease to `holdKmh`, and at `pedalT` a deceleration `law(dt)` (or a peak
 *     with a ramp), to rest, then drive off and stop at y 345;
 *   · `stabTape` — the flooredpraise drives: the same launch and hold, and the
 *     pedal at `pedalT` or at y `pedalAtY` with a deceleration `law(dt)`.
 * Integrated at 600 Hz (pedalTape) / 10 sub-steps (stabTape), sampled on the
 * 1/60 grid.
 */
import { SC_FOLLOW_TAILGATER } from "../templates-following";
import type { ScenarioTrace, TraceEvent, TraceSample } from "../../../traces/types";

const G = 1 / 60;

export interface PedalTape {
  holdKmh: number;
  /** Pedal time, s; null = never (the reference drive). */
  pedalT: number | null;
  peak: number;
  rampSec: number;
  /** Pump: on for onSec, off for offSec, repeating. */
  pump?: { onSec: number; offSec: number };
  /** Hold the brake only this long, then release and drive on (a stab). */
  stabSec?: number;
  /** Student's lateral offset in his lane, m. */
  xOff?: number;
  easeFromY?: number;
  /** Deceleration by time since the pedal, m/s² (overrides peak/ramp/pump). */
  law?: (dt: number) => number;
}
export function pedalTape(o: PedalTape): ScenarioTrace {
  const cruise = 45.9 / 3.6;
  const hold = o.holdKmh / 3.6;
  const easeFromY = o.easeFromY ?? 125;
  const H = 1 / 600;
  let t = 0;
  let y = 15;
  let v = 0;
  type Ph = "wait" | "launch" | "ease" | "hold" | "brake" | "rest" | "off" | "stop" | "done";
  let ph: Ph = "wait";
  let restUntil = 0;
  let braking = false;
  let looked = false;
  const samples: TraceSample[] = [];
  const events: TraceEvent[] = [];
  let k = 0;
  for (let guard = 0; guard < 600 * 200 && ph !== "done"; guard++) {
    if (guard % 10 === 0) {
      samples.push({
        tSec: k / 60,
        x: 12.19 + (o.xOff ?? 0),
        y,
        headingDeg: 0,
        steerRad: 0,
        speedKmh: v * 3.6,
        gear: v * 3.6 > 30 ? 3 : v * 3.6 > 15 ? 2 : 1,
        indicator: "off",
        brakeOn: braking,
        throttleOn: !braking && v > 0,
      });
      k++;
    }
    if (!looked && y >= 100) {
      events.push({ tSec: Math.round(t * 60) / 60, kind: "glance-rear" });
      looked = true;
    }
    let a = 0;
    braking = false;
    const pedalDue = o.pedalT !== null && t >= o.pedalT - 1e-9;
    switch (ph) {
      case "wait":
        if (t >= 1) ph = "launch";
        break;
      case "launch":
        a = v < cruise ? 1.95 : 0;
        if (y >= easeFromY) ph = "ease";
        break;
      case "ease":
        a = v > hold ? -1 : 0;
        if (v <= hold) {
          v = hold;
          ph = "hold";
        }
        break;
      case "hold":
        a = 0;
        if (o.pedalT === null && y >= 300) ph = "stop";
        break;
      case "brake": {
        const dt = t - o.pedalT!;
        let on = true;
        if (o.pump) on = dt % (o.pump.onSec + o.pump.offSec) < o.pump.onSec;
        if (o.stabSec !== undefined && dt >= o.stabSec) {
          ph = "off";
          break;
        }
        braking = on;
        a = on ? -(o.peak * Math.min(1, dt / Math.max(o.rampSec, 1e-6))) : 0;
        if (o.law) {
          a = -o.law(dt);
          braking = a < 0;
          on = a < 0;
        }
        if (on && v + a * H <= 0) {
          v = 0;
          a = 0;
          ph = "rest";
          restUntil = t + 1.5;
        }
        break;
      }
      case "rest":
        braking = true;
        if (t >= restUntil) ph = "off";
        break;
      case "off": {
        const target = 39.9 / 3.6;
        a = v < target ? 1.95 : 0;
        if (v > 0 && 345 - y <= (v * v) / (2 * 2)) ph = "stop";
        break;
      }
      case "stop":
        braking = true;
        a = -2;
        if (v + a * H <= 0) {
          v = 0;
          a = 0;
          ph = "done";
        }
        break;
    }
    if ((ph === "ease" || ph === "hold" || ph === "launch") && pedalDue) {
      ph = "brake";
      continue; // re-enter on the same instant as the brake phase
    }
    const v0 = v;
    v = Math.max(0, v + a * H);
    if (ph === "launch" && v > cruise) v = cruise;
    y += ((v0 + v) / 2) * H;
    t += H;
  }
  const last = samples[samples.length - 1];
  for (let j = 1; j <= 60; j++) samples.push({ ...last, tSec: (k - 1 + j) / 60, speedKmh: 0, brakeOn: true, throttleOn: false });
  return { meta: { scenarioId: SC_FOLLOW_TAILGATER.id, kind: "attempt", version: 1, durationSec: samples[samples.length - 1].tSec }, samples, events };
}

export function stabTape(holdKmh: number, pedalT: number | null, law: (s: number) => number, pedalAtY: number | null = null): ScenarioTrace {
  const SUB = 10;
  const h = G / SUB;
  const cruise = 45.9 / 3.6;
  const hold = holdKmh / 3.6;
  let y = 15;
  let v = 0;
  let phase: string = "wait";
  let restUntil = 0;
  let braking = false;
  let looked = false;
  let brakeStart: number | null = null;
  const samples: TraceSample[] = [];
  const events: TraceEvent[] = [];
  for (let n = 0; n < 60 * 200 * SUB && phase !== "done"; n++) {
    const t = n * h;
    if (n % SUB === 0) {
      samples.push({ tSec: n / SUB / 60, x: 12.19, y, headingDeg: 0, steerRad: 0, speedKmh: v * 3.6, gear: v * 3.6 > 30 ? 3 : v * 3.6 > 15 ? 2 : 1, indicator: "off", brakeOn: braking, throttleOn: !braking && v > 0 });
    }
    if (!looked && y >= 100) {
      events.push({ tSec: Math.round(t * 60) / 60, kind: "glance-rear" });
      looked = true;
    }
    const trig = (pedalT !== null && t >= pedalT - 1e-9) || (pedalAtY !== null && y >= pedalAtY);
    if (trig && brakeStart === null && (phase === "launch" || phase === "ease" || phase === "hold")) {
      phase = "brake";
      brakeStart = t;
    }
    let a = 0;
    braking = false;
    if (phase === "wait") {
      if (t >= 1) phase = "launch";
    } else if (phase === "launch") {
      a = v < cruise ? 1.95 : 0;
      if (y >= 125) phase = "ease";
    } else if (phase === "ease") {
      a = v > hold ? -1 : 0;
      if (v <= hold) {
        v = hold;
        phase = "hold";
      }
    } else if (phase === "hold") {
      if (brakeStart === null && pedalT === null && pedalAtY === null && y >= 300) phase = "stop";
    } else if (phase === "brake") {
      a = -law(t - brakeStart!);
      braking = a < 0;
      if (a < 0 && v + a * h <= 0) {
        v = 0;
        a = 0;
        phase = "rest";
        restUntil = t + 1.5;
      }
    } else if (phase === "rest") {
      braking = true;
      if (t >= restUntil) phase = "off";
    } else if (phase === "off") {
      a = v < 39.9 / 3.6 ? 1.95 : 0;
      if (v > 0 && 345 - y <= (v * v) / 4) phase = "stop";
    } else if (phase === "stop") {
      braking = true;
      a = -2;
      if (v + a * h <= 0) {
        v = 0;
        a = 0;
        phase = "done";
      }
    }
    const v0 = v;
    v = Math.max(0, v + a * h);
    if (phase === "launch" && v > cruise) v = cruise;
    y += ((v0 + v) / 2) * h;
  }
  const last = samples[samples.length - 1]!;
  for (let j = 1; j <= 60; j++) samples.push({ ...last, tSec: last.tSec + j / 60, speedKmh: 0, brakeOn: true, throttleOn: false });
  return { meta: { scenarioId: SC_FOLLOW_TAILGATER.id, kind: "attempt", version: 1, durationSec: samples[samples.length - 1]!.tSec }, samples, events };
}
