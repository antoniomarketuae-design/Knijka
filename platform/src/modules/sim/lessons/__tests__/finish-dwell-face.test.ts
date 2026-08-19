/**
 * ONE CLOCK, TWO BARS — and until 2026-08-19 nothing said which bar it was
 * counting toward.
 *
 * WHAT THIS FILE IS ABOUT. An "outside" finish has two qualifying states and
 * they carry very different bars:
 *   · IN THE REGION (past `radiusM`) — the car has left the work site, and
 *     `zone.dwellSec` = FINISH_LEAVE_S = 20 s of that ends the drive;
 *   · STRANDED IN THE BAND (past the work site, short of `radiusM`, at a full
 *     standstill) — the car has stopped in a margin it can never leave by
 *     standing still, and FINISH_OUTSIDE_STUCK_S = 75 s of that ends it.
 * `FinishGateState.insideSinceSec` times both. The two states are
 * geometrically exclusive, and `stepFinishGate`'s comment used to conclude
 * from that that one clock was safe. It is not: the states are ADJACENT at
 * `radiusM`, and the clock was carried straight across that boundary.
 *
 * THE DEFECT, and it is a FALSE REFUSAL — the direction that matters most in
 * this module, because the founder's own complaint is one. Stand still just
 * inside the departure circle for twenty seconds — a queue on the exit, a
 * pedestrian on the far crossing, a beginner working out which way the ring
 * goes — and then drive out. The drive ends on the very frame the circle is
 * crossed, instead of FINISH_LEAVE_S after it. Those twenty seconds are not
 * slack: B1 put them there on purpose so a student who leaves a roundabout
 * without signalling — which VOIDS the traversal — has room to notice, swing
 * back and redo the ring. Ending the lesson under him at the moment he leaves
 * takes exactly that room away. Doc 88 §4 N3 recorded „one class of drive
 * ending 20 s early" with the replay not in hand; this is the class.
 *
 * THE FIX IS A LABEL, NOT A SECOND CLOCK, and the reason is worth stating
 * because the obvious fix is the wrong one. B15's lawful-wait freeze drops a
 * partial dwell by clearing `insideSinceSec` and nothing else
 * (lessons/engine.ts). A second stored clock would silently escape that, and a
 * student waiting lawfully at a give-way line would start banking seconds
 * toward having his lesson closed — the precise thing B15 exists to forbid.
 * So `dwellFace` labels the one clock, and a change of face restarts it.
 *
 * BOTH DIRECTIONS ARE PINNED HERE. Every ending the gate had before this file
 * still happens, at the same second, or the fix is not a fix — it is the
 * stranded student C7 was written for, put back.
 */

import { describe, expect, it } from "vitest";
import {
  FINISH_LEAVE_S,
  FINISH_OUTSIDE_STUCK_S,
  FINISH_STANDSTILL_KMH,
  createFinishGate,
  stepFinishGate,
  strandedBeyondM,
} from "../finish";
import type { FinishGateState, RouteFinishZone } from "../types";
import { makeTick } from "./fixtures";

/**
 * The shipped roundabout shape, by value: `sc-roundabout-entry`'s ring at the
 * origin with `enterRadiusM` 24 and `exitRadiusM` 34. Hand-built rather than
 * compiled ON PURPOSE — this file is about the fold's clock, not about the
 * catalogue's geometry, and `finish-work-site-band.test.ts` is what pins the
 * geometry against the real templates.
 */
const RING: RouteFinishZone = {
  x: 0,
  y: 0,
  radiusM: 34,
  armWithinM: 24,
  workSiteRadiusM: 24,
  dwellSec: FINISH_LEAVE_S,
  mode: "outside",
  terminalRescue: true,
};

const DT = 0.25;

interface Step {
  /** Distance from the ring centre, m. */
  dM: number;
  speedKmh: number;
  /** How long to hold this pose, seconds. */
  forSec: number;
}

/** Run a pose script through the gate and report when (if) it tripped. */
function drive(zone: RouteFinishZone, script: readonly Step[]): {
  trippedAtSec: number | null;
  lastTSec: number;
} {
  let gate: FinishGateState = createFinishGate();
  let t = 0;
  for (const step of script) {
    for (let s = 0; s < step.forSec; s += DT) {
      gate = stepFinishGate(
        gate,
        zone,
        makeTick({ t, speedKmh: step.speedKmh, position: { x: 0, y: -step.dM } }),
      );
      if (gate.reachedAtSec !== null) return { trippedAtSec: gate.reachedAtSec, lastTSec: t };
      t += DT;
    }
  }
  return { trippedAtSec: null, lastTSec: t };
}

/** One frame inside the arming circle — you cannot leave what you never reached. */
const ARM: Step = { dM: 20, speedKmh: 5, forSec: 1 };

describe("the band's inner edge and the region are the two faces", () => {
  it("the fixture really does straddle both, so the scripts below mean what they say", () => {
    // A self-check on the instrument. If the shape ever changes so that the
    // „just inside the departure circle" pose is no longer in the band, every
    // script here would silently become a different test.
    expect(strandedBeyondM(RING)).toBe(24);
    expect(RING.radiusM).toBeGreaterThan(strandedBeyondM(RING));
    expect(33).toBeGreaterThan(strandedBeyondM(RING)); // in the band
    expect(33).toBeLessThan(RING.radiusM);
    expect(35).toBeGreaterThan(RING.radiusM); // in the region
  });
});

describe("A STUDENT WHO STOPS IN THE BAND AND THEN DRIVES OUT KEEPS HIS FULL 20 SECONDS", () => {
  it("the departure dwell starts when he leaves, not when he stopped", () => {
    // 30 s at a standstill in the band (short of the 75 s stranded bar, so
    // nothing has ended yet), then out past the departure circle and driving.
    const out = drive(RING, [
      ARM,
      { dM: 33, speedKmh: 0, forSec: 30 },
      { dM: 35, speedKmh: 10, forSec: 60 },
    ]);
    expect(out.trippedAtSec).not.toBeNull();
    // He crossed at t = 1 + 30 = 31 s. FINISH_LEAVE_S of BEING OUT is owed
    // from there — never from the frame he stopped in the band, which is what
    // the shared clock charged him.
    const crossedAtSec = ARM.forSec + 30;
    expect(out.trippedAtSec! - crossedAtSec).toBeGreaterThanOrEqual(FINISH_LEAVE_S - DT);
    expect(out.trippedAtSec! - crossedAtSec).toBeLessThanOrEqual(FINISH_LEAVE_S + DT);
  });

  it("…and the longer he stood there, the more the shared clock would have stolen", () => {
    // The worst case: he stands still for 70 s — one tick short of the
    // stranded bar — and then leaves. Under the shared clock the departure
    // dwell was already 3.5× spent and the drive ended on the crossing frame.
    const standSec = FINISH_OUTSIDE_STUCK_S - 5;
    const out = drive(RING, [
      ARM,
      { dM: 33, speedKmh: 0, forSec: standSec },
      { dM: 35, speedKmh: 10, forSec: 60 },
    ]);
    const crossedAtSec = ARM.forSec + standSec;
    expect(out.trippedAtSec).not.toBeNull();
    expect(out.trippedAtSec! - crossedAtSec).toBeGreaterThanOrEqual(FINISH_LEAVE_S - DT);
  });

  it("and he is not ended at all if he goes back to the ring instead", () => {
    // The whole reason those twenty seconds exist: an unsignalled exit voids
    // the traversal, and the student who realises it drives back in. Standing
    // in the band, leaving, and returning inside the window must end nothing.
    const out = drive(RING, [
      ARM,
      { dM: 33, speedKmh: 0, forSec: 30 },
      { dM: 35, speedKmh: 10, forSec: FINISH_LEAVE_S - 4 },
      { dM: 20, speedKmh: 10, forSec: 40 }, // back on the ring, working it
    ]);
    expect(out.trippedAtSec).toBeNull();
  });
});

describe("EVERY ENDING THE GATE ALREADY HAD STILL HAPPENS, AT THE SAME SECOND", () => {
  it("a car that simply drives out and away ends after FINISH_LEAVE_S", () => {
    const out = drive(RING, [ARM, { dM: 35, speedKmh: 10, forSec: 60 }]);
    expect(out.trippedAtSec).not.toBeNull();
    expect(out.trippedAtSec! - ARM.forSec).toBeGreaterThanOrEqual(FINISH_LEAVE_S - DT);
    expect(out.trippedAtSec! - ARM.forSec).toBeLessThanOrEqual(FINISH_LEAVE_S + DT);
  });

  it("a car stranded at a standstill in the band ends after FINISH_OUTSIDE_STUCK_S", () => {
    const out = drive(RING, [ARM, { dM: 33, speedKmh: 0, forSec: 200 }]);
    expect(out.trippedAtSec).not.toBeNull();
    expect(out.trippedAtSec! - ARM.forSec).toBeGreaterThanOrEqual(FINISH_OUTSIDE_STUCK_S - DT);
    expect(out.trippedAtSec! - ARM.forSec).toBeLessThanOrEqual(FINISH_OUTSIDE_STUCK_S + DT);
  });

  it("a car MOVING in the band is never ended, however long — the band is a margin, not a trap", () => {
    // Just above the standstill bar. Every shuffle, hover and queue-nudge the
    // band was drawn for lives here, and none of them is evidence of anything.
    const out = drive(RING, [
      ARM,
      { dM: 33, speedKmh: FINISH_STANDSTILL_KMH + 0.5, forSec: 400 },
    ]);
    expect(out.trippedAtSec).toBeNull();
  });

  it("a car standing still INSIDE the work site is never ended, at any duration", () => {
    // B1's ruling, unchanged: standing still in the middle of the work can
    // never end a drive. 400 s on the ring itself.
    const out = drive(RING, [ARM, { dM: 22, speedKmh: 0, forSec: 400 }]);
    expect(out.trippedAtSec).toBeNull();
  });

  it("the reverse direction also restarts the clock, and that is the generous way round", () => {
    // Region → band: 15 s away from the ring (banking the departure dwell),
    // then back into the band at a standstill. The stranded bar is owed in
    // full from the frame he stopped — 75 s, not 60. Later, never earlier.
    const awaySec = 15;
    const out = drive(RING, [
      ARM,
      { dM: 35, speedKmh: 10, forSec: awaySec },
      { dM: 33, speedKmh: 0, forSec: 200 },
    ]);
    const stoppedAtSec = ARM.forSec + awaySec;
    expect(out.trippedAtSec).not.toBeNull();
    expect(out.trippedAtSec! - stoppedAtSec).toBeGreaterThanOrEqual(FINISH_OUTSIDE_STUCK_S - DT);
  });
});

describe("an INSIDE zone is bit-identical — it has only ever had one face", () => {
  const BAY: RouteFinishZone = {
    x: 0,
    y: 0,
    radiusM: 14,
    dwellSec: 3,
    maxSpeedKmh: 3,
    terminalRescue: true,
  };

  it("arrival still trips after dwellSec at rest, and a roll-through still does not", () => {
    // Armed by being outside once (a lot drill may spawn in its own bay).
    const arrived = drive(BAY, [
      { dM: 40, speedKmh: 10, forSec: 1 },
      { dM: 1, speedKmh: 0, forSec: 20 },
    ]);
    expect(arrived.trippedAtSec).not.toBeNull();
    expect(arrived.trippedAtSec! - 1).toBeGreaterThanOrEqual(BAY.dwellSec - DT);

    const rolledThrough = drive(BAY, [
      { dM: 40, speedKmh: 10, forSec: 1 },
      { dM: 1, speedKmh: 10, forSec: 60 },
    ]);
    expect(rolledThrough.trippedAtSec).toBeNull();
  });
});

describe("THE FREEZE STILL REACHES THE STRANDED DWELL", () => {
  it("clearing insideSinceSec — the only thing B15 clears — drops it", () => {
    // lessons/engine.ts implements the lawful-wait freeze by setting
    // `insideSinceSec: null` and nothing else. If the stranded dwell ever
    // moved to a field of its own it would escape that, and a student waiting
    // correctly at a give-way line would bank seconds toward being closed
    // down — B15's exact defect, reintroduced by a refactor. This asserts the
    // freeze's reach directly, on the field it actually clears.
    let gate = createFinishGate();
    let t = 0;
    const tickAt = (dM: number, speedKmh: number) =>
      makeTick({ t, speedKmh, position: { x: 0, y: -dM } });

    gate = stepFinishGate(gate, RING, tickAt(20, 5)); // arm
    t += DT;
    // 70 s stranded — one tick short of the bar.
    for (let s = 0; s < FINISH_OUTSIDE_STUCK_S - 5; s += DT) {
      gate = stepFinishGate(gate, RING, tickAt(33, 0));
      t += DT;
    }
    expect(gate.reachedAtSec).toBeNull();
    expect(gate.insideSinceSec).not.toBeNull();

    // One frozen frame, exactly as the engine writes it.
    gate = { ...gate, insideSinceSec: null };

    // …and the bar is owed in full again from here.
    const resumedAtSec = t;
    for (let s = 0; s < FINISH_OUTSIDE_STUCK_S - 2; s += DT) {
      gate = stepFinishGate(gate, RING, tickAt(33, 0));
      t += DT;
    }
    expect(gate.reachedAtSec).toBeNull();
    for (let s = 0; s < 10; s += DT) {
      gate = stepFinishGate(gate, RING, tickAt(33, 0));
      if (gate.reachedAtSec !== null) break;
      t += DT;
    }
    expect(gate.reachedAtSec).not.toBeNull();
    expect(gate.reachedAtSec! - resumedAtSec).toBeGreaterThanOrEqual(
      FINISH_OUTSIDE_STUCK_S - DT,
    );
  });
});

describe("the clamp on strandedBeyondM, on inputs the catalogue cannot produce", () => {
  // `normalizeOutside` deliberately does NOT floor the radius against a stated
  // work site (see its comment — no shipped anchor can reach that floor, and an
  // unreachable guarantee is guarded by nothing). The invariants live here
  // instead, where a hand-built zone CAN reach them.
  it("a work site stated inside the arm cannot pull the band into B1's ground", () => {
    const z: RouteFinishZone = { ...RING, workSiteRadiusM: 5 };
    expect(strandedBeyondM(z)).toBe(24); // the arm, not 5
  });

  it("a work site stated past the departure circle cannot invert the band", () => {
    const z: RouteFinishZone = { ...RING, workSiteRadiusM: 99 };
    expect(strandedBeyondM(z)).toBe(z.radiusM);
    // …and with the band collapsed to nothing, no pose is stranded, so the
    // gate falls back to the departure dwell rather than ending anyone early.
    const out = drive(z, [ARM, { dM: 33, speedKmh: 0, forSec: 400 }]);
    expect(out.trippedAtSec).toBeNull();
  });

  it("a zone with no stated work site still infers one, exactly as before O23", () => {
    const { workSiteRadiusM: _dropped, ...z } = RING;
    void _dropped;
    // max(arm 24, radius 34 − margin 8 = 26) = 26 — the pre-O23 answer, kept
    // as the fallback so hand-built zones and recorded sessions are unchanged.
    expect(strandedBeyondM(z)).toBe(26);
  });
});
