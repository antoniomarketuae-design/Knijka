/**
 * sc-rb-busy-gap / sc-rbg-exit — «Премини през кръга и го напусни с включен
 * десен мигач» is collectable by a LAWFUL drive that is not the recorded
 * shadow. Audit row sc-rb-busy-gap:5ee56710 („Leaving at the second exit never
 * ticks in any leg — no drive has completed the roundabout the lesson is named
 * after").
 *
 * WHY THIS FILE EXISTS. Two product repairs have landed against that row —
 * a5344aa added `sc-rbg-exit-approach` so a FIRST-exit drive can no longer
 * certify the second, and 8b9d135 moved `sc-rbg-past-east` off the east node
 * and onto the ring — and both of them narrowed the path to the maneuver row.
 * After each, the ONLY committed proof that the row can still be earned was
 * `s-w3-bot-completion.test.ts`, which replays ONE recorded line
 * (`traces/scRbBusyGap.ts` shadow-correct) at ONE rung. A recorded line is a
 * point, not an envelope: a future gate move could refuse every lawful drive
 * except the one in the trace file and nothing in the suite would fail. The
 * objectives are SEQUENTIAL (`engine.ts` steps only the current one), so a row
 * that refuses a lawful line does not cost that row — it costs every row behind
 * it, and `sc-rbg-exit` is the last of four.
 *
 * So this sweeps LINES rather than replaying one: the ring centerline, the
 * outer keep-right line and an inner line, at three paces, on every authored
 * rung. The two refusals the drill depends on are pinned in the same sweep,
 * because an envelope that only ever widens is not a gate.
 *
 * WHAT IT DOES NOT CLAIM. The car enters `sc-rbg-exit`'s watch already ON the
 * ring (the objective before it is a disc at φ = 160°), so `traversalArcDeg`
 * is null and the arc demand is waived by design — `stepRoundabout`'s own
 * docstring: „the passage is required only of a car this objective watched
 * approach". This file therefore proves the SHIPPED SEQUENCING is completable,
 * not that the arc integrator fires; `roundabout-traversal.test.ts` owns that.
 */

import { describe, expect, it } from "vitest";
import { applyTick, createLessonSession } from "../../engine";
import { makeTick } from "../../__tests__/fixtures";
import { compileScenario } from "../compile";
import type { ScenarioLevel } from "../types";
import { SC_RB_BUSY_GAP } from "../templates-roundabout";

/** Ring centerline radius of rb-mini-v1 — the value the template pins. */
const RING_R = 18;
/** Right-lane centre of an arm (rb-mini-v1 meta.scenario.laneCenterRightM). */
const ARM_LANE = 4.06;
/**
 * The ring's drivable half-width (`edgeTravelHalfWidth`: one `roundabout` lane
 * at LANE_WIDTH_M 8.125), less half a 1.8 m car — the outermost and innermost
 * centres a car with its FULL width on the carriageway can hold.
 */
const RING_HALF_W = ARM_LANE - 0.9;

/** Ring point at circulation angle φ (0 = south node, CCW through east). */
function ring(phiDeg: number, radius: number): { x: number; y: number } {
  const a = (phiDeg * Math.PI) / 180;
  return { x: radius * Math.sin(a), y: -radius * Math.cos(a) };
}

type Session = ReturnType<typeof createLessonSession>;

const statusOf = (s: Session, objectiveId: string): string =>
  s.objectives.find((o) => o.spec.id === objectiveId)!.status;

interface DriveOpts {
  /** Radius the car holds round the ring, m. */
  ringRadius: number;
  /** Pace held round the ring, км/ч. */
  ringKmh: number;
  /** Circulation angle from which the right stalk is lit; null = never. */
  signalFromPhi: number | null;
  /** Where the car leaves the ring: 90 = east (the FIRST exit), 180 = north. */
  exitAtPhi: 90 | 180;
  /** How many times round before the exit above is taken. */
  laps?: number;
}

/**
 * One drive through the production stack: up the south arm, halted on the
 * give-way line, round the ring on the given line at the given pace, out by the
 * named arm. Every sample is a real `applyTick`, so the same evaluators that
 * grade a student grade this.
 */
function drive(level: ScenarioLevel, opts: DriveOpts): Session {
  let s = createLessonSession(compileScenario(SC_RB_BUSY_GAP, level));
  let t = 0;
  const tick = (
    p: { x: number; y: number },
    speedKmh: number,
    indicator: "off" | "right",
  ): void => {
    s = applyTick(s, makeTick({ t, position: p, speedKmh, indicator })).state;
    t += 1;
  };

  // The approach every drive shares: down to yield speed ON the paint.
  tick({ x: ARM_LANE, y: -93 }, 0, "off");
  tick({ x: ARM_LANE, y: -50 }, 14, "off");
  tick({ x: ARM_LANE, y: -30 }, 8, "off");
  tick({ x: ARM_LANE, y: -26 }, 0, "off");
  expect(statusOf(s, "sc-rbg-yield-line")).toBe("done");

  const laps = opts.laps ?? 1;
  const totalDeg = (laps - 1) * 360 + opts.exitAtPhi;
  for (let sweep = 6; sweep <= totalDeg; sweep += 4) {
    const lit = opts.signalFromPhi !== null && sweep >= opts.signalFromPhi;
    tick(ring(sweep % 360, opts.ringRadius), opts.ringKmh, lit ? "right" : "off");
  }
  // Out of the arm, keeping right, with the stalk auto-cancelling as a real
  // one does once the wheel comes back (scene/cabin.ts ARM 0.22 → RELEASE 0.05).
  const outbound: Array<{ x: number; y: number }> =
    opts.exitAtPhi === 180
      ? [20, 24, 28, 34, 42, 52].map((y) => ({ x: ARM_LANE, y }))
      : [20, 24, 28, 34, 42, 52].map((x) => ({ x, y: -ARM_LANE }));
  for (const [i, p] of outbound.entries()) {
    tick(p, 20, opts.signalFromPhi !== null && i < 2 ? "right" : "off");
  }
  return s;
}

const LEVELS = SC_RB_BUSY_GAP.levels.map((l) => l.level);

// ---------------------------------------------------------------------------
// (a) A lawful circulation collects the drill's own title row — on three lines
//     and three paces, at every authored rung
// ---------------------------------------------------------------------------

describe("(a) the second exit ticks for a lawful drive that is not the recorded shadow", () => {
  const lines = [
    ["centerline", RING_R],
    ["outer keep-right line", RING_R + RING_HALF_W],
    ["inner line", RING_R - RING_HALF_W],
  ] as const;

  for (const level of LEVELS) {
    for (const [what, radius] of lines) {
      // 20 км/ч is the pace the drill's own card SPEAKS on this row
      // («дръж под 20 км/ч», advisor-authored-cap.test.ts): the envelope has to
      // reach the number the student is given, or the card fails the student
      // who obeys it.
      for (const kmh of [12, 18, 20]) {
        it(`L${level} · ${what} · ${kmh} км/ч`, () => {
          const s = drive(level, {
            ringRadius: radius,
            ringKmh: kmh,
            signalFromPhi: 140,
            exitAtPhi: 180,
          });
          expect(statusOf(s, "sc-rbg-past-east")).toBe("done");
          expect(statusOf(s, "sc-rbg-exit-approach")).toBe("done");
          expect(statusOf(s, "sc-rbg-exit")).toBe("done");
        });
      }
    }
  }
});

// ---------------------------------------------------------------------------
// (b) …and the two refusals the drill is built on still refuse
// ---------------------------------------------------------------------------

describe("(b) the first exit does not buy the second", () => {
  for (const level of LEVELS) {
    it(`L${level}`, () => {
      // The bail-out instruction 5 exists to prevent: into the ring, straight
      // out the EAST arm, right stalk lit for the exit he did make.
      const s = drive(level, {
        ringRadius: RING_R,
        ringKmh: 12,
        signalFromPhi: 60,
        exitAtPhi: 90,
      });
      expect(statusOf(s, "sc-rbg-past-east")).not.toBe("done");
      expect(statusOf(s, "sc-rbg-exit")).not.toBe("done");
    });
  }
});

describe("(c) an unsignalled exit does not buy it either — the A10 contract", () => {
  for (const level of LEVELS) {
    it(`L${level}`, () => {
      const s = drive(level, {
        ringRadius: RING_R,
        ringKmh: 12,
        signalFromPhi: null,
        exitAtPhi: 180,
      });
      // The path rows are earned — this drive did circulate — and only the
      // stalk is missing, which is the one thing `sc-rbg-exit` grades.
      expect(statusOf(s, "sc-rbg-past-east")).toBe("done");
      expect(statusOf(s, "sc-rbg-exit-approach")).toBe("done");
      expect(statusOf(s, "sc-rbg-exit")).not.toBe("done");
    });
  }
});

// ---------------------------------------------------------------------------
// (d) A student who sails past his exit once is not locked out of the drill
// ---------------------------------------------------------------------------

describe("(d) a second lap still collects it", () => {
  for (const level of LEVELS) {
    it(`L${level}`, () => {
      const s = drive(level, {
        ringRadius: RING_R,
        ringKmh: 12,
        // Lit only on the SECOND lap's run-up to north (360 + 140).
        signalFromPhi: 500,
        exitAtPhi: 180,
        laps: 2,
      });
      expect(statusOf(s, "sc-rbg-exit")).toBe("done");
    });
  }
});
