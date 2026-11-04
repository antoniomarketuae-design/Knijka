/**
 * KEYBOARD-TAP SLOWING ON THE PRODUCT CAR (2026-11-02 · `sc-follow-tailgater:63c0c28c`,
 * round 2; the integrator's Q3, from the round-1 verifier's note N2). The PC
 * keyboard does not press a pedal, it RAMPS one: `engine/input.ts` stepPedal —
 * 0 → 1 in BRAKE_ATTACK_S, 1 → 0 in BRAKE_RELEASE_S, read once per RENDER
 * frame. A student who slows by repeated firm taps with releases under the
 * sustain makes ONE chain of causeless applications in the ledger, and the
 * pumped record says of it «…на тласъци … заедно те отнеха скоростта толкова
 * рязко, колкото едно рязко спиране». That sentence must be TRUE of every chain
 * named pumped: its bursts' peak windows, gaps EXCLUDED, shed speed at
 * emergency grade (`harshBrakeDecelMps2` × (1 + tolerance)), as P2 requires.
 *
 * THE DRIVE: sc-sp-harsh-brake L3 (a straight empty street — no cause), the car
 * brought to `onset` км/ч, and from y 150 the BRAKE KEY tapped — down `tap` s,
 * up `rel` s, repeated until the car is at rest — at 30 / 60 / 144 Hz render
 * rates (the grid stays 1/60 s; the key ramp runs per render frame, as
 * `SimInput.read()` does). Every chain of two or more credited applications is
 * printed with its gap-excluded and gap-inclusive means, and its record.
 *
 * THE RULE PINNED: on its first pumped frame every pumped chain's bursts (the
 * peak windows that made it pumped), gaps excluded, are at emergency grade;
 * and no CLEAN_DRIVING is minted on a frame where a pumped chain was open
 * (between its first credit and its last pumped frame) in this grid.
 *
 * MEASURED 2026-11-02 (the report's table; FI_KB_OUT prints it): 252 drives,
 * 43 pumped records, every one with 0.3 s taps (the key ramp reaches full
 * brake) and releases 0.15–0.35 s; the mean on the first pumped frame
 * 7.000–7.236 m/s²; over the WHOLE chain, later bursts added, 6.91–7.29 gaps
 * excluded and 4.54–7.47 gaps included. The last-credit bound of the payout
 * hold (Q1) leaves up to 27 frames inside such a chain unheld once a release
 * reaches ~0.25 s (the key's 0.2 s fall and 0.25 s rise put the credited
 * frames more than the sustain apart while the release itself is shorter) —
 * printed per drive as `unheld` / `byBound`; no payout fell there in this grid.
 */
import { appendFileSync } from "node:fs";
import { describe, expect, it, beforeAll } from "vitest";
import { compileScenario } from "../compile";
import { SC_SP_HARSH_BRAKE } from "../templates-sp";
import { driveIntoContact, initRapier, type DriveState } from "./rapierContactDrive";
import { loadDistrict } from "./witnessLiveRung";
import { brakeCheckBridgeHolds, DEFAULT_RULE_CONFIG, HARSH_BRAKE_TIE_TOLERANCE } from "../../../rules";
import { BRAKE_ATTACK_S, BRAKE_RELEASE_S, stepPedal } from "../../../engine";
import type { SimTick } from "../../../rules/types";

const H = 1 / 60;
const BRAKE_AT_Y = 150;
/** sc-sp-harsh-brake overrides no harsh-brake number: the lesson's line is the default's. */
const DECEL = DEFAULT_RULE_CONFIG.harshBrakeDecelMps2;

beforeAll(async () => {
  await initRapier();
});

type HB = Record<string, number | boolean | null>;

interface ChainSeen {
  apps: number;
  sumQ: number;
  sumSpan: number;
  sumDrop: number;
  exclMean: number;
  inclMean: number;
  since: number;
  lastCredit: number;
  pumped: boolean;
  /** Frames from the chain's first credit to its last pumped frame on which NO payout hold stood (F1 or the bridge). */
  unheld: number;
  /** …of which the last-credit bound alone released (the release still under the sustain, the bursts emergency-grade). */
  unheldByBound: number;
  /** The pumped test's own sums on the FIRST pumped frame (the bursts that made it pumped). */
  atPumped: { q: number; span: number; drop: number } | null;
}

interface TapDrive {
  hz: number;
  onset: number;
  tap: number;
  rel: number;
  chains: ChainSeen[];
  records: { form: string; sinceSec: number; atSec: number; shownKmh: number }[];
  billed: boolean;
  clean: number[];
  pumpedOpen: [number, number][];
}

/** The steps the harness takes on each render frame (its own accumulator, replicated). */
function framesOfSteps(delta: number, maxSteps: number): { stepFrame: number[]; frameCount: number } {
  const stepFrame: number[] = [0];
  let acc = 0;
  let steps = 0;
  let f = 0;
  while (steps < maxSteps) {
    acc += Math.min(Math.max(delta, 0), 0.5);
    while (acc >= H) {
      steps++;
      stepFrame[steps] = f;
      acc -= H;
    }
    f++;
  }
  return { stepFrame, frameCount: f };
}

function driveTaps(hz: number, onset: number, tap: number, rel: number): TapDrive {
  const lesson = compileScenario(SC_SP_HARSH_BRAKE, 3);
  const delta = 1 / hz;
  const maxSteps = 60 * 40;
  const { stepFrame } = framesOfSteps(delta, maxSteps + 2);
  let pedal = 0;
  let lastFrame = -1;
  let triggerFrame: number | null = null;
  let restAt: number | null = null;
  let throttle = 0;
  const control = (st: DriveState) => {
    const f = stepFrame[st.step + 1] ?? lastFrame;
    for (let g = lastFrame + 1; g <= f; g++) {
      // the render frame's own read: the trigger is seen at its first step
      if (triggerFrame === null && st.y >= BRAKE_AT_Y) triggerFrame = g;
      if (triggerFrame === null) {
        const dv = onset - st.speedKmh;
        throttle = dv >= 0 ? Math.min(1, dv / 4 + 0.15) : 0;
        pedal = dv >= 0 ? 0 : Math.min(0.3, -dv / 8);
        continue;
      }
      throttle = 0;
      const since = (g - triggerFrame) * delta;
      const phase = since % (tap + rel);
      const down = restAt === null && phase < tap - 1e-9;
      pedal = stepPedal(pedal, down, delta, BRAKE_ATTACK_S, BRAKE_RELEASE_S);
    }
    lastFrame = Math.max(lastFrame, f);
    if (triggerFrame !== null && restAt === null && st.speedKmh < 0.3) restAt = st.step;
    if (restAt !== null) return { throttle: 0, brake: 1, steer: 0 };
    return { throttle, brake: pedal, steer: 0 };
  };
  const chains: ChainSeen[] = [];
  const pumpedOpen: [number, number][] = [];
  let prev: HB | null = null;
  let firstCredit: number | null = null;
  let onsetAtFirst = 0;
  let speedAtLastCredit = 0;
  let lastPumped: number | null = null;
  let unheldAt: number[] = [];
  let unheldByBoundAt: number[] = [];
  let atPumped: ChainSeen["atPumped"] = null;
  const SUS = DEFAULT_RULE_CONFIG.harshBrakeSustainSec;
  const closeChain = (p: HB) => {
    const openPeak = p.appOpen === true && p.appPeakSince !== null;
    const apps = (p.chainApps as number) + (openPeak ? 1 : 0);
    if (apps >= 1 && firstCredit !== null) {
      const sumQ = (p.chainSumPeakQ as number) + (openPeak ? (p.appPeakQ as number) : 0);
      const sumSpan = (p.chainSumSpan as number) + (openPeak ? (p.appPeakSpan as number) : 0);
      const sumDrop = (p.chainSumDrop as number) + (openPeak ? (p.appPeakDrop as number) : 0);
      const lastCredit = p.chainLastCreditAt as number;
      chains.push({
        apps,
        sumQ,
        sumSpan,
        sumDrop,
        exclMean: sumSpan > 0 ? sumDrop / sumSpan : 0,
        inclMean: lastCredit > firstCredit ? (onsetAtFirst - speedAtLastCredit) / 3.6 / (lastCredit - firstCredit) : 0,
        since: firstCredit,
        lastCredit,
        pumped: lastPumped !== null,
        unheld: lastPumped === null ? 0 : unheldAt.filter((u) => u <= (lastPumped as number) + 1e-9).length,
        unheldByBound: lastPumped === null ? 0 : unheldByBoundAt.filter((u) => u <= (lastPumped as number) + 1e-9).length,
        atPumped,
      });
      if (lastPumped !== null) pumpedOpen.push([firstCredit, lastPumped]);
    }
    firstCredit = null;
    lastPumped = null;
    unheldAt = [];
    unheldByBoundAt = [];
    atPumped = null;
  };
  const o = driveIntoContact({
    lesson,
    raw: loadDistrict(SC_SP_HARSH_BRAKE.map.districtId),
    start: { x: 4.06, y: 15, headingDeg: 0 },
    control,
    deltas: [delta],
    maxSteps,
    onStep: (tick: SimTick, step: { state: { rules: { harshBrake: HB } } }) => {
      const hb = step.state.rules.harshBrake;
      // a chain ends when it is no longer open, or when a new one opened on the tick that finalized it
      if (
        prev !== null &&
        prev.chainOpen === true &&
        (hb.chainOpen !== true || (prev.chainClosed === true && hb.chainClosed !== true) || (hb.chainApps as number) < (prev.chainApps as number))
      ) {
        closeChain(prev);
      }
      if (hb.chainOpen === true && hb.chainLastCreditAt === tick.t) {
        if (firstCredit === null) {
          firstCredit = tick.t;
          onsetAtFirst = hb.onsetKmh as number;
        }
        speedAtLastCredit = tick.speedKmh;
      }
      if (hb.appPumpedAt === tick.t) {
        lastPumped = tick.t;
        if (atPumped === null) {
          atPumped = {
            q: (hb.chainSumPeakQ as number) + (hb.appPeakQ as number),
            span: (hb.chainSumSpan as number) + (hb.appPeakSpan as number),
            drop: (hb.chainSumDrop as number) + (hb.appPeakDrop as number),
          };
        }
      }
      if (hb.chainOpen === true && firstCredit !== null) {
        // the reducer's two payout holds: F1 (read at the praise block) and the bridge, through the product's predicate
        const f1 = hb.activeSince !== null && (hb.qualifiedSec as number) > 0;
        const bridge = brakeCheckBridgeHolds(hb as never, tick.t, DEFAULT_RULE_CONFIG);
        if (!f1 && !bridge) unheldAt.push(tick.t);
        // …of which only the last-credit bound released: the bridge with the bound lifted would still hold
        const openPeak = hb.appOpen === true && hb.appPeakSince !== null;
        const span = (hb.chainSumSpan as number) + (openPeak ? (hb.appPeakSpan as number) : 0);
        const unbounded = hb.chainClosed !== true && hb.chainBilled !== true && hb.chainLastCreditAt !== null && span > 0;
        if (!f1 && !bridge && unbounded && tick.t - (hb.chainLastCreditAt as number) >= SUS * (1 - HARSH_BRAKE_TIE_TOLERANCE)) unheldByBoundAt.push(tick.t);
      }
      prev = { ...hb };
    },
  } as never);
  if (prev !== null && (prev as HB).chainOpen === true) closeChain(prev);
  const clean = o.session.events.filter((e) => e.kind === "commendation" && (e as { code: string }).code === "CLEAN_DRIVING").map((e) => e.t);
  const billed =
    o.session.events.some((e) => e.kind === "violation" && (e as { code: string }).code === "HARSH_BRAKING_NO_CAUSE") ||
    (o.result.coachedMistakes ?? []).some((c) => c.code === "HARSH_BRAKING_NO_CAUSE");
  return {
    hz,
    onset,
    tap,
    rel,
    chains,
    records: (o.result.unbilledHardBrakes ?? []).map((r) => ({ form: r.form, sinceSec: r.sinceSec, atSec: r.atSec, shownKmh: r.shownKmh })),
    billed,
    clean,
    pumpedOpen,
  };
}

const HZ = (process.env.FI_KB_HZ ?? "30,60,144").split(",").map(Number);
const ONSETS = (process.env.FI_KB_ONSETS ?? "25,30,40,50").split(",").map(Number);
const TAPS = [0.1, 0.2, 0.3];
const RELS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35];

describe("KEYBOARD-TAP SLOWING — every chain that forms, and every pumped one is emergency-grade with the gaps excluded", () => {
  for (const hz of HZ) {
    for (const onset of ONSETS) {
      it(`${hz} Hz from ${onset} км/ч: taps ${TAPS.join("/")} s × releases ${RELS.join("/")} s`, () => {
        const bad: string[] = [];
        for (const tap of TAPS) {
          for (const rel of RELS) {
            const d = driveTaps(hz, onset, tap, rel);
            const multi = d.chains.filter((c) => c.apps >= 2);
            const line = `[kb-taps] ${hz}Hz ${onset}км/ч tap ${tap} rel ${rel}: ${d.billed ? "BILLED " : ""}records ${JSON.stringify(d.records.map((r) => `${r.form}@${r.atSec.toFixed(3)} X${Math.floor(r.shownKmh)}`))} chains≥2 ${JSON.stringify(
              multi.map((c) => ({ apps: c.apps, q: +c.sumQ.toFixed(3), span: +c.sumSpan.toFixed(3), excl: +c.exclMean.toFixed(2), incl: +c.inclMean.toFixed(2), pumped: c.pumped, ...(c.atPumped ? { pq: +c.atPumped.q.toFixed(3), pspan: +c.atPumped.span.toFixed(3), pmean: +(c.atPumped.drop / c.atPumped.span).toFixed(3) } : {}), unheld: c.unheld, byBound: c.unheldByBound })),
            )} clean ${JSON.stringify(d.clean.map((t) => +t.toFixed(3)))}`;
            if (process.env.FI_KB_OUT) appendFileSync(process.env.FI_KB_OUT, line + "\n");
            for (const c of d.chains) {
              // the bursts that made it pumped, gaps excluded, are emergency-grade (P2) — read on its first pumped frame
              if (c.pumped && !(c.atPumped !== null && c.atPumped.drop > DECEL * c.atPumped.span * (1 + HARSH_BRAKE_TIE_TOLERANCE))) {
                bad.push(`${line} — a pumped chain under emergency grade`);
              }
            }
            for (const [a, b] of d.pumpedOpen) {
              if (d.clean.some((t) => t >= a - 1e-9 && t <= b + 1e-9)) bad.push(`${line} — CLEAN_DRIVING inside a pumped chain`);
            }
          }
        }
        expect(bad).toEqual([]);
      }, 3_600_000);
    }
  }
});
