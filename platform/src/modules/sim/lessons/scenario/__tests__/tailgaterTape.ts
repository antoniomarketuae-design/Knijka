/**
 * sc-follow-tailgater — THE KINEMATIC TAPES the brake-check witnesses replay
 * through the live rung chain (`liveChainReplay`). Test support only.
 *
 * Each tape is the rig-w2 drive (D:/knijka-lanes/scratch/rig-w2/
 * sc-follow-tailgater/tailgater-drive.mjs, mode T «the brake check with task 1
 * done first») written as an open-loop speed profile on ln-v1's northbound
 * right lane (x 12.19, heading 0):
 *   launch at 1.95 m/s² to `cruiseKmh` (45.9), a rear-mirror look at y 100,
 *   cruise to y 140, ease at `easeMps2` (1 m/s², the rig's 3.6 км/ч per s) to
 *   `holdKmh`, hold it into the «Успокой темпото» circle (y 200 ± 10), and at
 *   y `brakeAtY` the act under test:
 *     · "slam" — the rig's full pedal: brake = clamp(0.45·v, 0, 1) of a
 *       `peakMps2` (9.5 — the judge's 9.3–9.6 m/s² strongest window) stop,
 *       plus 0.5 m/s² of rolling drag so the car comes to rest;
 *     · "gentle" — the taught ease-off: lift at `gentleMps2` to `gentleToKmh`;
 *     · "none" — hold on.
 *   Then rest `restSec` (1 s), drive off at 1.95 m/s² to 39.9 км/ч and stop
 *   gently (2 m/s²) at y 345, as the rig did.
 */
import type {
  ScenarioTrace,
  TraceSample,
  TraceEvent,
} from "../../../traces/types";

export const LANE_X = 12.19;

export interface TailgaterTapeOptions {
  cruiseKmh?: number;
  easeFromY?: number;
  easeMps2?: number;
  holdKmh: number;
  brakeAtY?: number;
  act: "slam" | "gentle" | "none";
  peakMps2?: number;
  gentleMps2?: number;
  gentleToKmh?: number;
  restSec?: number;
  endY?: number;
}

export function tailgaterTape(o: TailgaterTapeOptions): ScenarioTrace & {
  brakeOnsetSec: number | null;
  brakeOnsetKmh: number | null;
} {
  const cruise = (o.cruiseKmh ?? 45.9) / 3.6;
  const easeFromY = o.easeFromY ?? 140;
  const easeA = o.easeMps2 ?? 1;
  const hold = o.holdKmh / 3.6;
  const brakeAtY = o.brakeAtY ?? 195;
  const peak = o.peakMps2 ?? 9.5;
  const gentleA = o.gentleMps2 ?? 1;
  const gentleTo = (o.gentleToKmh ?? 28) / 3.6;
  const restSec = o.restSec ?? 1;
  const endY = o.endY ?? 345;
  const H = 0.001;
  const SAMPLE = 0.05;
  let t = 0;
  let y = 15;
  let v = 0;
  type Phase =
    "launch" | "ease" | "act" | "rest" | "driveOff" | "stop" | "done";
  let phase: Phase = "launch";
  let restUntil = 0;
  let onsetSec: number | null = null;
  let onsetKmh: number | null = null;
  const samples: TraceSample[] = [];
  const events: TraceEvent[] = [];
  let nextSample = 0;
  let looked = false;
  let braking = false;
  for (let guard = 0; guard < 400_000 && phase !== "done"; guard++) {
    if (t >= nextSample - 1e-9) {
      samples.push({
        tSec: Math.round(nextSample * 1000) / 1000,
        x: LANE_X,
        y,
        headingDeg: 0,
        steerRad: 0,
        speedKmh: v * 3.6,
        gear: v * 3.6 > 30 ? 3 : v * 3.6 > 15 ? 2 : 1,
        indicator: "off",
        brakeOn: braking,
        throttleOn: !braking && v > 0,
      });
      nextSample += SAMPLE;
    }
    if (!looked && y >= 100) {
      events.push({ tSec: Math.round(t * 1000) / 1000, kind: "glance-rear" });
      looked = true;
    }
    let a = 0;
    braking = false;
    switch (phase) {
      case "launch":
        a = v < cruise ? 1.95 : 0;
        if (v >= cruise) v = cruise;
        if (y >= easeFromY) phase = "ease";
        if (y >= brakeAtY) {
          // the act straight from the cruise (no ease before it)
          a = 0;
          if (o.act === "none") {
            phase = "driveOff";
          } else {
            phase = "act";
            onsetSec = t;
            onsetKmh = v * 3.6;
          }
        }
        break;
      case "ease":
        if (v > hold) {
          a = -easeA;
          braking = true;
        }
        if (y >= brakeAtY) {
          a = 0;
          braking = false;
          if (o.act === "none") {
            phase = "driveOff";
          } else {
            phase = "act";
            onsetSec = t;
            onsetKmh = v * 3.6;
          }
        }
        break;
      case "act":
        braking = true;
        if (o.act === "slam") {
          a = -(peak * Math.min(1, 0.45 * v) + 0.5);
          if (v + a * H <= 0) {
            v = 0;
            a = 0;
            phase = "rest";
            restUntil = t + restSec;
          }
        } else {
          a = -gentleA;
          if (v <= gentleTo) {
            v = gentleTo;
            a = 0;
            phase = "driveOff";
          }
        }
        break;
      case "rest":
        braking = true;
        a = 0;
        if (t >= restUntil) phase = "driveOff";
        break;
      case "driveOff": {
        const target = 39.9 / 3.6;
        a = v < target ? 1.95 : 0;
        if (v >= target) v = target;
        // the gentle 2 m/s² stop at endY
        if (v > 0 && endY - y <= (v * v) / (2 * 2)) phase = "stop";
        break;
      }
      case "stop":
        braking = true;
        a = -2;
        if (v + a * H <= 0) {
          v = 0;
          a = 0;
          phase = "done";
        }
        break;
    }
    const v0 = v;
    v = Math.max(0, v + a * H);
    y += ((v0 + v) / 2) * H;
    t += H;
  }
  // a short held rest at the end so the last sample is at rest
  for (let k = 1; k <= 20; k++) {
    samples.push({
      ...samples[samples.length - 1],
      tSec: Math.round((nextSample + (k - 1) * SAMPLE) * 1000) / 1000,
      speedKmh: 0,
      brakeOn: true,
      throttleOn: false,
    });
  }
  const durationSec = samples[samples.length - 1].tSec;
  return {
    meta: {
      scenarioId: "sc-follow-tailgater",
      kind: "attempt",
      version: 1,
      durationSec,
    },
    samples,
    events,
    brakeOnsetSec: onsetSec,
    brakeOnsetKmh: onsetKmh,
  };
}
