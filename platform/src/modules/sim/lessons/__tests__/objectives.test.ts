import { describe, expect, it } from "vitest";
import type { LessonObjective, StagedEventOutcome } from "../../contracts";
import {
  createEvalState,
  parseObjectiveParams,
  stepObjective,
  type ObjectiveContext,
} from "../objectives";
import type { ObjectiveDetail, ObjectiveEvalState, ObjectiveParams } from "../types";
import { makeTick, tickWithEvents } from "./fixtures";

function parsed(kind: LessonObjective["kind"], params: Record<string, unknown>): ObjectiveParams {
  return parseObjectiveParams({ id: "o1", titleBg: "Тест", kind, params });
}

/** Run a tick sequence through one objective, returning done + final state. */
function run(
  params: ObjectiveParams,
  ticks: ReturnType<typeof makeTick>[],
  ctx?: ObjectiveContext,
) {
  let evalState: ObjectiveEvalState = createEvalState(params);
  let done = false;
  let progress = 0;
  let detail: ObjectiveDetail | undefined;
  for (const tick of ticks) {
    const r = stepObjective(params, evalState, tick, ctx);
    evalState = r.evalState;
    progress = r.progress;
    detail = r.detail;
    if (r.done) {
      done = true;
      break;
    }
  }
  return { done, progress, evalState, detail };
}

describe("parseObjectiveParams", () => {
  it("rejects malformed specs loudly", () => {
    expect(() => parsed("reachZone", { x: 1 })).toThrow(/reachZone/);
    expect(() => parsed("passSignal", { nodeId: "n1", x: 0, y: 0, radiusM: 10, control: "nope" })).toThrow();
    expect(() => parsed("driveDistance", { meters: 0 })).toThrow();
    expect(() =>
      parsed("completeManeuver", { maneuver: "roundabout", x: 0, y: 0, enterRadiusM: 30, exitRadiusM: 20 }),
    ).toThrow();
    expect(() => parsed("completeManeuver", { maneuver: "wheelie" })).toThrow();
  });

  it("applies smoothStop defaults", () => {
    const p = parsed("completeManeuver", { maneuver: "smoothStop" });
    expect(p).toMatchObject({ maneuver: "smoothStop", minApproachKmh: 20, maxDecelMs2: 3.5 });
  });

  it("A10: emergencyStop without a stagedEventId is a spec error (no speed-only arming)", () => {
    expect(() => parsed("completeManeuver", { maneuver: "emergencyStop" })).toThrow(/stagedEventId/);
    expect(() =>
      parsed("completeManeuver", { maneuver: "emergencyStop", minApproachKmh: 40, minDecelMs2: 5 }),
    ).toThrow(/stagedEventId/);
  });

  it("A10: parkInBay without a bay rect is a spec error (no coordinate-free parks)", () => {
    expect(() => parsed("completeManeuver", { maneuver: "parkInBay", holdSec: 1.5 })).toThrow(/bay/);
    expect(() =>
      parsed("completeManeuver", { maneuver: "parkInBay", bay: { x: 0, y: 0, headingDeg: 0, widthM: 0, lengthM: 6 } }),
    ).toThrow(/bay/);
  });

  it("A10: parkInBay applies tolerance defaults", () => {
    const p = parsed("completeManeuver", {
      maneuver: "parkInBay",
      bay: { x: 1, y: 2, headingDeg: 45, widthM: 3, lengthM: 6.6 },
    });
    expect(p).toMatchObject({ maneuver: "parkInBay", holdSec: 1.5, centerTolM: 0.5, headingTolDeg: 10 });
  });

  it("A10: requireRedMet is trafficLight-only (a stop sign would deadlock it)", () => {
    expect(() =>
      parsed("passSignal", { nodeId: "n1", x: 0, y: 0, radiusM: 10, control: "stopSign", requireRedMet: true }),
    ).toThrow(/requireRedMet/);
    const p = parsed("passSignal", {
      nodeId: "n1",
      x: 0,
      y: 0,
      radiusM: 10,
      control: "trafficLight",
      requireRedMet: true,
    });
    expect(p).toMatchObject({ kind: "passSignal", requireRedMet: true });
  });
});

describe("reachZone", () => {
  const params = parsed("reachZone", { x: 100, y: 0, radiusM: 15 });

  it("completes on entering the zone", () => {
    const r = run(params, [
      makeTick({ t: 1, position: { x: 0, y: 0 }, speedKmh: 40 }),
      makeTick({ t: 2, position: { x: 90, y: 0 }, speedKmh: 40 }),
    ]);
    expect(r.done).toBe(true);
  });

  it("stays open outside the radius", () => {
    const r = run(params, [makeTick({ t: 1, position: { x: 80, y: 0 } })]);
    expect(r.done).toBe(false);
  });

  it("respects the optional max speed gate", () => {
    const slowZone = parsed("reachZone", { x: 0, y: 0, radiusM: 15, maxSpeedKmh: 10 });
    expect(run(slowZone, [makeTick({ t: 1, speedKmh: 30 })]).done).toBe(false);
    expect(run(slowZone, [makeTick({ t: 2, speedKmh: 8 })]).done).toBe(true);
  });

  // -------------------------------------------------------------------------
  // B4 / B5 (doc 86 §3, 2026-07-30) — the two latches
  // -------------------------------------------------------------------------

  describe("B5 — stopping SHORT of a halt mark counts; overshooting it does not", () => {
    // sc-jxgb-yield's shape: radius 4 at ≤6 km/h. The lawful stopping band is
    // metres long; the circle admitted the last 8 m of it, and doc 86 T6 shows
    // the conflict car is occluded from exactly that forced pose. The founder:
    // „if I don't stop on the green circle I can't do anything, I must do a
    // violation and go back to the green circle."
    const halt = parsed("reachZone", { x: 4.06, y: 118, radiusM: 4, maxSpeedKmh: 6 });

    it("a full stop 6 m short of the mark completes it", () => {
      const r = run(halt, [
        makeTick({ t: 0, position: { x: 4.06, y: 100 }, speedKmh: 25 }),
        makeTick({ t: 1, position: { x: 4.06, y: 112 }, speedKmh: 0 }), // 6 m short, stopped
      ]);
      expect(r.done).toBe(true);
    });

    it("…but a stop 12 m short is a different place, not an early one", () => {
      // The capsule reaches radius + REACH_ZONE_GRACE_M behind the mark and no
      // further. `sc-vp-police-stop`'s panic slam rests 10.1 m short of a
      // radius-3 kerbside mark: that is the failed pull-over the drill grades,
      // not „a shade early", and a grace wide enough to swallow it swallows
      // the lesson with it.
      const r = run(halt, [
        makeTick({ t: 0, position: { x: 4.06, y: 95 }, speedKmh: 25 }),
        makeTick({ t: 1, position: { x: 4.06, y: 106 }, speedKmh: 0 }), // 12 m short
      ]);
      expect(r.done).toBe(false);
    });

    it("slowing to the cap on the APPROACH counts — the discipline was shown", () => {
      const r = run(halt, [
        makeTick({ t: 0, position: { x: 4.06, y: 100 }, speedKmh: 25 }),
        makeTick({ t: 1, position: { x: 4.06, y: 113 }, speedKmh: 5 }), // 5 m short, at the cap
        makeTick({ t: 2, position: { x: 4.06, y: 117 }, speedKmh: 9 }), // in the zone, a shade over
      ]);
      expect(r.done).toBe(true);
    });

    it("a FLOW envelope is not a stop demand — resting near it credits nothing", () => {
      // sc-rb-busy-gap's east-mouth waypoint caps at 20 km/h and says so in
      // its own comment: „the ring's own envelope, not a slow-down demand."
      // Its counter-proof drive crashes on the chord and comes to rest short
      // of the mouth; that is not „reached the mouth carefully".
      const envelope = parsed("reachZone", { x: 18, y: 0, radiusM: 6, maxSpeedKmh: 20 });
      const r = run(envelope, [
        makeTick({ t: 0, position: { x: 6, y: 0 }, speedKmh: 18 }),
        makeTick({ t: 1, position: { x: 10, y: 0 }, speedKmh: 0 }), // 8 m short, stopped
      ]);
      expect(r.done).toBe(false);
    });

    /**
     * THE COUNTER-PROOF, and the reason the grace is half a ring. On a „спри
     * на маркировката" drill the overshoot IS the graded failure:
     * sc-ac-wet-braking's whole subject is that wet grip needs an earlier
     * braking point, and its mistake demo slides past the mark into a
     * collision. A symmetric grace credited that — three shipped counter-proof
     * suites caught it — and it would have taught, at scale, that stopping
     * past the line is stopping at it.
     */
    it("sliding THROUGH the mark and stopping 5 m past it does NOT complete it", () => {
      const r = run(halt, [
        makeTick({ t: 0, position: { x: 4.06, y: 100 }, speedKmh: 40 }),
        makeTick({ t: 1, position: { x: 4.06, y: 118 }, speedKmh: 30 }), // through it, fast
        makeTick({ t: 2, position: { x: 4.06, y: 123 }, speedKmh: 0 }), // 5 m past, stopped
      ]);
      expect(r.done).toBe(false);
      // Reached, yes — the discipline the cap names is what was not performed.
      expect(r.evalState).toMatchObject({ reached: true, capMet: false });
    });

    it("stopping in the NEXT LANE does not count — the capsule has no width", () => {
      // The grace stretches back down the approach, never sideways: the
      // authored radius is the whole of the lateral tolerance. One lane over
      // is a different place, and on `sc-vp-police-stop` it is the difference
      // between pulling over for the officer and stopping dead in traffic.
      const r = run(halt, [
        makeTick({ t: 0, position: { x: 12.19, y: 100 }, speedKmh: 25 }),
        makeTick({ t: 1, position: { x: 12.19, y: 116 }, speedKmh: 0 }), // 8.13 m to the side
      ]);
      expect(r.done).toBe(false);
    });

    it("the arrived-but-too-fast state is latched for the engine to explain", () => {
      const r = run(halt, [
        makeTick({ t: 0, position: { x: 4.06, y: 90 }, speedKmh: 35 }),
        makeTick({ t: 1, position: { x: 4.06, y: 118 }, speedKmh: 35 }),
      ]);
      expect(r.evalState).toMatchObject({
        type: "reachZone",
        reached: true,
        capMet: false,
        overCapNoted: true,
      });
    });

    it("an UNCAPPED waypoint keeps the old strict radius exactly", () => {
      // No grace arm at all: the pre-B4 behaviour, byte for byte.
      const plain = parsed("reachZone", { x: 0, y: 0, radiusM: 4 });
      expect(run(plain, [makeTick({ t: 0, position: { x: 0, y: 5 }, speedKmh: 0 })]).done).toBe(false);
      expect(run(plain, [makeTick({ t: 0, position: { x: 0, y: 3.9 }, speedKmh: 40 })]).done).toBe(true);
    });
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * A SPEED CAP CAN ONLY REFUSE — the property a cap was deleted for lacking.
   *
   * THE FRAME. The 2026-08-17 catalogue sweep took `maxSpeedKmh: 55` off
   * `sc-vue-made-way` (templates-vru.ts) on the argument that a cap above the
   * road's posted 50 „cannot bind but can only widen", because CARRYING one
   * arms `inGraceRing` and stretches the acceptance 5 m back down the approach.
   * Both halves were wrong, and the second is the one that needs arithmetic
   * rather than prose:
   *
   *   · the capsule never reaches `reached` on a flow cap — that arm demands
   *     `isHaltDemand` — so the ARRIVAL is the authored disc either way;
   *   · so `done = reached && capMet` under a cap is a strict SUBSET of the
   *     uncapped `done`. A cap cannot credit anybody the same zone without one
   *     did not already credit. It is monotone, and „it can only widen" is not
   *     a thing it is able to do.
   *
   * What it CAN do is refuse — and refusing the 58–59 km/h run the tier
   * governor produces on that boulevard, with the card that names 55 against
   * 59, was the only teaching that row ever emitted.
   *
   * Swept over a set of drives rather than asserted once, because the claim is
   * about every drive and a single example is how the false version of it
   * survived review.
   * ═══════════════════════════════════════════════════════════════════════════
   */
  describe("a reachZone speed cap is monotone — it refuses, it never credits", () => {
    // `sc-vue-made-way`'s own shape: the mid-boulevard mark on ln-v1, r4 at the
    // right-lane centre, capped at the lawful 55 on a road posted 50. The
    // approach runs up +y; the left lane (the ambulance's corridor) is 8.13 m
    // to the left, i.e. outside the capsule's lateral bound.
    const CAPPED = { x: 12.19, y: 180, radiusM: 4, maxSpeedKmh: 55 };
    const UNCAPPED = { x: 12.19, y: 180, radiusM: 4 };
    const at = (y: number, speedKmh: number, t: number, x = 12.19) =>
      makeTick({ t, position: { x, y }, speedKmh });

    /** Every drive below, named, so a failure says which one. */
    const DRIVES: ReadonlyArray<{ id: string; ticks: ReturnType<typeof makeTick>[] }> = [
      { id: "lawful 50 through the mark", ticks: [at(170, 50, 0), at(180, 50, 1)] },
      { id: "lawful, sampled either side (swept)", ticks: [at(174, 50, 0), at(184, 50, 1)] },
      { id: "flat-out 59 all the way", ticks: [at(172, 59, 0), at(180, 59, 1), at(188, 59, 2)] },
      {
        id: "59, at the cap 7 m short (the B4 approach grace)",
        ticks: [at(160, 59, 0), at(173, 55, 1), at(180, 59, 2)],
      },
      { id: "never enters the disc", ticks: [at(160, 40, 0), at(166, 40, 1)] },
      { id: "in the LEFT lane at the mark", ticks: [at(170, 40, 0, 4.06), at(180, 40, 1, 4.06)] },
      { id: "stopped on the mark", ticks: [at(174, 10, 0), at(180, 0, 1)] },
    ];

    it("credits nobody the same zone without a cap does not — on every drive", () => {
      const wrong: string[] = [];
      for (const { id, ticks } of DRIVES) {
        const capped = run(parsed("reachZone", CAPPED), ticks).done;
        const uncapped = run(parsed("reachZone", UNCAPPED), ticks).done;
        if (capped && !uncapped) wrong.push(`${id}: capped credits it, uncapped does not`);
      }
      expect(wrong).toEqual([]);
    });

    it("…and it is not a no-op: the unlawful drive is credited without it and refused with it", () => {
      // Without the pair above this whole block could pass on a cap that does
      // nothing at all, which is exactly what the row shipped as.
      const flatOut = DRIVES.find((d) => d.id === "flat-out 59 all the way")!.ticks;
      expect(run(parsed("reachZone", UNCAPPED), flatOut).done).toBe(true);
      expect(run(parsed("reachZone", CAPPED), flatOut).done).toBe(false);
    });

    it("THE CARD THE REMOVAL DELETED: the refusal latches for the engine to explain", () => {
      // `overCapNoted` is what lessons/engine.ts turns into «Задачата иска да
      // си тук с не повече от 55 км/ч, а в момента караш 59 км/ч…» — THEO-4's
      // own shape (what was observed, what is wanted, what to do about it), and
      // the sweep read it off staging at t = 17 s. With the cap gone this state
      // is unreachable and the row says nothing at all, on any drive.
      const r = run(
        parsed("reachZone", CAPPED),
        DRIVES.find((d) => d.id === "flat-out 59 all the way")!.ticks,
      );
      expect(r.evalState).toMatchObject({ reached: true, capMet: false, overCapNoted: true });
      // …and the uncapped row cannot produce it, which is the defect stated as
      // a state rather than as a screenshot.
      const bare = run(
        parsed("reachZone", UNCAPPED),
        DRIVES.find((d) => d.id === "flat-out 59 all the way")!.ticks,
      );
      expect(bare.evalState).toMatchObject({ overCapNoted: false });
    });

    it("the capsule never lends the ARRIVAL a metre on a flow cap", () => {
      // The half the sweep was actually worried about, measured. Stopped dead
      // 7 m short of the mark — inside the grace ring, at zero — and the zone
      // is not reached, because the standstill arm demands a genuine halt
      // demand (`REACH_ZONE_HALT_CAP_KMH`) and 55 is a lawfulness gate.
      const r = run(parsed("reachZone", CAPPED), [at(160, 40, 0), at(173, 0, 1), at(173, 0, 2)]);
      expect(r.done).toBe(false);
      expect(r.evalState).toMatchObject({ reached: false });
      // …and the uncapped zone refuses the same drive, so the two agree on
      // arrival exactly as the block header claims.
      expect(run(parsed("reachZone", UNCAPPED), [at(160, 40, 0), at(173, 0, 1)]).done).toBe(false);
    });
  });

  describe("B4 — the latches survive the whole visit, not one frame", () => {
    const capped = parsed("reachZone", { x: 0, y: 100, radiusM: 4, maxSpeedKmh: 6 });

    it("the cap met on the approach still counts after a fast frame in the zone", () => {
      // RE-POINTED, sweep 161 (2026-08-18). The frame in the zone used to read
      // 22 км/ч against a cap of 6 and this asserted the credit stood. It does
      // not any more, and the number is why: the driveline wobble a „spike"
      // means is 0.06–0.12 км/ч (SMOOTH_STOP_DECEL_WINDOW_SEC's measured
      // table), while 22 at a 6 км/ч halt gate is a car accelerating away from
      // the mark it was told to stop on — the sc-crossing-dart shape, which
      // shipped five green ticks for drives convicted of the same approach in
      // the same protocol. The latch still survives the visit; what it no
      // longer survives is being thrown away before arriving
      // (REACH_ZONE_CAP_SLACK_KMH, and approach-cap-contract.test.ts).
      const r = run(capped, [
        makeTick({ t: 0, position: { x: 0, y: 88 }, speedKmh: 20 }),
        makeTick({ t: 1, position: { x: 0, y: 94 }, speedKmh: 4 }), // 6 m short, at the cap
        makeTick({ t: 2, position: { x: 0, y: 100 }, speedKmh: 10 }), // a spike, inside the zone
      ]);
      expect(r.done).toBe(true);
    });

    it("…but a car ACCELERATING back over the cap loses it before it arrives", () => {
      // The other direction of the same latch, so „survives the visit" can
      // never again be read as „survives anything at all".
      const r = run(capped, [
        makeTick({ t: 0, position: { x: 0, y: 88 }, speedKmh: 20 }),
        makeTick({ t: 1, position: { x: 0, y: 94 }, speedKmh: 4 }), // 6 m short, at the cap
        makeTick({ t: 2, position: { x: 0, y: 100 }, speedKmh: 22 }), // on the mark, 16 over
      ]);
      expect(r.done).toBe(false);
      expect(r.evalState).toMatchObject({ reached: true, capMet: false, overCapNoted: true });
    });

    it("blowing through and never slowing near it does not", () => {
      const r = run(capped, [
        makeTick({ t: 0, position: { x: 0, y: 80 }, speedKmh: 35 }),
        makeTick({ t: 1, position: { x: 0, y: 100 }, speedKmh: 35 }),
        makeTick({ t: 2, position: { x: 0, y: 160 }, speedKmh: 4 }), // slow, but long gone
      ]);
      expect(r.done).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // A WAYPOINT IS CROSSED, NOT SAMPLED (2026-08-16)
  //
  // Since d1f5e18 the lesson clock is the world clock and both clamp at
  // PHYSICS_MAX_FRAME_DT = 0.5 s, so ONE tick advances the car by up to half a
  // second of travel — 6.94 m at 50 km/h, 8.33 m at 60. Measured on staging,
  // `sc-lane-change` L1 ran at 0.46 fps and `sc-roundabout-entry` L1 at 0.33,
  // i.e. every tick spending the whole clamp. The catalogue census: of 674
  // terminal reachZone rungs, 17 have a DIAMETER under one 50 km/h tick and 177
  // a radius under it; `sc-lane-change` L3-L5 is radius 4 on a 50 km/h street.
  //
  // The ticks below are that arithmetic, not an invention: 7 m apart at 50 km/h
  // is one honest frame of the shipped build.
  // -------------------------------------------------------------------------
  describe("the disc is CROSSED, not sampled — one 0.5 s tick can step over it", () => {
    // sc-lane-change's own terminal gate at L3+: (4.06, 260), radius 4, no cap.
    const lc = parsed("reachZone", { x: 4.06, y: 260, radiusM: 4 });

    it("FAILS ON THE OLD CODE: a 7 m tick over the mark, 2 m off its line, is credited", () => {
      // Chord through the disc at a 2 m offset is 2·√(16−4) = 6.93 m, so a
      // 7 m step can straddle it with neither endpoint inside. Both samples are
      // 4.1 m from the mark — outside the authored radius by a decimetre.
      const before = { x: 6.06, y: 256.5 };
      const after = { x: 6.06, y: 263.5 };
      expect(Math.hypot(before.x - 4.06, before.y - 260)).toBeGreaterThan(4);
      expect(Math.hypot(after.x - 4.06, after.y - 260)).toBeGreaterThan(4);
      const r = run(lc, [
        makeTick({ t: 0.0, position: before, speedKmh: 50 }),
        makeTick({ t: 0.5, position: after, speedKmh: 50 }),
      ]);
      expect(r.done).toBe(true);
    });

    it("the OTHER direction: a tick that passes 5 m wide of the disc is still refused", () => {
      // Same 7 m step, same street, one lane over (8.13 m pitch): the path
      // never touches the circle and nothing here may invent room for it.
      const r = run(lc, [
        makeTick({ t: 0.0, position: { x: 9.06, y: 256.5 }, speedKmh: 50 }),
        makeTick({ t: 0.5, position: { x: 9.06, y: 263.5 }, speedKmh: 50 }),
        makeTick({ t: 1.0, position: { x: 9.06, y: 270.5 }, speedKmh: 50 }),
      ]);
      expect(r.done).toBe(false);
    });

    it("a RESET does not draw an acceptance line across the district", () => {
      // A respawn is a teleport, not a drive: the segment from the old position
      // to the new one may not credit every waypoint on the line between them.
      // TELEPORT_JUMP_M (50) is the same guard driveDistance uses.
      const r = run(lc, [
        makeTick({ t: 0, position: { x: 4.06, y: 200 }, speedKmh: 40 }),
        makeTick({ t: 1, position: { x: 4.06, y: 320 }, speedKmh: 40 }), // 120 m jump
      ]);
      expect(r.done).toBe(false);
    });

    it("speed is sampled even though position is swept — the B5 slide is still refused", () => {
      // The counter-proof of the counter-proof. A segment says WHERE the car
      // went and nothing about how fast it was at each point, so the swept face
      // feeds the arrival latch only: a car that slid through a halt mark at 30
      // and stopped 5 m past it must not collect „slowed to the cap at the mark".
      const haltMark = parsed("reachZone", { x: 4.06, y: 118, radiusM: 4, maxSpeedKmh: 6 });
      const r = run(haltMark, [
        makeTick({ t: 0, position: { x: 4.06, y: 100 }, speedKmh: 40 }),
        makeTick({ t: 1, position: { x: 4.06, y: 118 }, speedKmh: 30 }),
        makeTick({ t: 2, position: { x: 4.06, y: 123 }, speedKmh: 0 }),
      ]);
      expect(r.done).toBe(false);
    });

    it("B18/FR-24 survives: sweeping a stop-line waypoint and ENDING past the paint fails", () => {
      // `beyondMark` reads the tick's own position, not the segment, so the
      // sweep can never redefine „before the line".
      const paint = parsed("reachZone", {
        x: 4.06,
        y: -34,
        radiusM: 9,
        maxSpeedKmh: 25,
        acceptBeforeMarkM: 1.725,
      });
      const r = run(paint, [
        makeTick({ t: 0, position: { x: 4.06, y: -48 }, speedKmh: 24 }),
        makeTick({ t: 1, position: { x: 4.06, y: -30 }, speedKmh: 24 }), // swept the disc, ended past the bars
      ]);
      expect(r.done).toBe(false);
    });
  });
});

describe("passSignal", () => {
  const params = parsed("passSignal", {
    nodeId: "n1805512602",
    x: 430,
    y: 235,
    radiusM: 30,
    control: "trafficLight",
  });

  it("completes when the matching stop line is crossed near the node", () => {
    const r = run(params, [
      tickWithEvents(5, [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "green" }], {
        position: { x: 425, y: 230 },
      }),
    ]);
    expect(r.done).toBe(true);
  });

  it("completes even on red — progression is not correctness", () => {
    const r = run(params, [
      tickWithEvents(5, [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "red" }], {
        position: { x: 430, y: 235 },
      }),
    ]);
    expect(r.done).toBe(true);
  });

  it("ignores crossings of the wrong control type or far away", () => {
    const wrongControl = run(params, [
      tickWithEvents(5, [{ kind: "stopLineCrossed", control: "stopSign" }], {
        position: { x: 430, y: 235 },
      }),
    ]);
    expect(wrongControl.done).toBe(false);

    const farAway = run(params, [
      tickWithEvents(5, [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "green" }], {
        position: { x: 0, y: 0 },
      }),
    ]);
    expect(farAway.done).toBe(false);
  });
});

describe("passSignal / requireRedMet (A10 — L2 must meet a red)", () => {
  const gated = parsed("passSignal", {
    nodeId: "n5997970086",
    x: 400,
    y: 200,
    radiusM: 30,
    control: "trafficLight",
    requireRedMet: true,
  });
  const at = (x: number) => ({ position: { x, y: 200 } });
  const crossGreen = (t: number) =>
    tickWithEvents(t, [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "green" }], {
      ...at(400),
      speedKmh: 20,
    });

  it("D4 cheat path: a greens-only crossing no longer completes the gated objective", () => {
    const r = run(gated, [makeTick({ t: 1, ...at(360), speedKmh: 40 }), crossGreen(2)]);
    expect(r.done).toBe(false);
    expect(r.progress).toBe(0.5); // crossed, but the run never met a red
    expect(r.detail).toMatchObject({
      kind: "passSignal",
      redMetHere: false,
      redsMetInRun: 0,
      redMetVia: null,
    });
  });

  it("completes after stopping at the light, then proceeding on green (waited out a red)", () => {
    const r = run(gated, [
      makeTick({ t: 1, ...at(360), speedKmh: 40 }),
      makeTick({ t: 2, ...at(395), speedKmh: 0 }), // full stop at the line
      crossGreen(30),
    ]);
    expect(r.done).toBe(true);
    expect(r.detail).toMatchObject({
      kind: "passSignal",
      redMetHere: true,
      redMetVia: "waitedOutGreen",
    });
  });

  // 2026-08-16 — THIS TEST USED TO ASSERT THE OPPOSITE, and the founder's
  // staging run is what overturned it: «✓ Изчакай червения сигнал и премини на
  // зелено — Изчака червения сигнал и потегли на зелено» printed in the same
  // second as «Преминаване на червен сигнал −10 изпитни т.», on both platforms.
  // A gate that its own forbidden act satisfies teaches that act; and the
  // debrief line rendered from `redMetHere` was a sentence about waiting that
  // no waiting produced. See stepPassSignal's header.
  it("crossing ON red does NOT close the gated objective, and certifies no red", () => {
    const r = run(gated, [
      tickWithEvents(2, [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "red" }], {
        ...at(400),
        speedKmh: 30,
      }),
    ]);
    expect(r.done).toBe(false);
    expect(r.detail).toMatchObject({ redMetHere: false, redsMetInRun: 0, redMetVia: null });
  });

  it("…and the same crossing still COMPLETES a plain junction (progression is untouched)", () => {
    const plain = parsed("passSignal", {
      nodeId: "n5997970086",
      x: 400,
      y: 200,
      radiusM: 30,
      control: "trafficLight",
    });
    const r = run(plain, [
      tickWithEvents(2, [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "red" }], {
        ...at(400),
        speedKmh: 30,
      }),
    ]);
    expect(r.done).toBe(true);
  });

  it("…and the prescribed retry still completes it: back, stop, wait, cross on green", () => {
    const r = run(gated, [
      tickWithEvents(2, [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "red" }], {
        ...at(400),
        speedKmh: 30,
      }),
      makeTick({ t: 20, ...at(300), speedKmh: 25 }), // turned round, off the approach
      makeTick({ t: 40, ...at(396), speedKmh: 0 }), // stopped at the line this time
      crossGreen(60),
    ]);
    expect(r.done).toBe(true);
    expect(r.detail).toMatchObject({ redMetHere: true, redMetVia: "waitedOutGreen" });
  });

  it("ЗДвП чл. 7: a регулировчик's wave through a red IS a met red (sc-sig-controller-live)", () => {
    // No stop at all — the drill's own bot rolls over the line at 22 km/h on the
    // officer's signal. It is the only path that completes that template, so the
    // permission arm has to survive this fix intact.
    const r = run(gated, [
      tickWithEvents(
        2,
        [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "red", controller: "proceed" }],
        { ...at(400), speedKmh: 22 },
      ),
    ]);
    expect(r.done).toBe(true);
    // …and the record says WHICH act certified it. `redMetHere` alone made the
    // debrief print „Изчака червения сигнал и потегли на зелено" for this run,
    // in which nothing stopped and nothing waited — and since this branch is
    // the ONLY completion path of sc-sig-controller-live, that false sentence
    // was printed by every successful run of the template.
    expect(r.detail).toMatchObject({ redMetHere: true, redMetVia: "controllerProceed" });
  });

  it("red+yellow is not green: creeping off the line does not certify the red", () => {
    const r = run(gated, [
      makeTick({ t: 1, ...at(396), speedKmh: 0 }), // waited the red out properly…
      tickWithEvents(
        2,
        [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "redYellow" }],
        { ...at(400), speedKmh: 8 },
      ), // …then went one phase early
    ]);
    expect(r.done).toBe(false);
  });


  it("a red met earlier in the run (ctx.redsMetInRun) satisfies the gate", () => {
    const ctx: ObjectiveContext = { stagedOutcomes: [], redsMetInRun: 1 };
    const r = run(gated, [crossGreen(2)], ctx);
    expect(r.done).toBe(true);
  });

  it("a stop OUTSIDE the zone certifies nothing", () => {
    const r = run(gated, [
      makeTick({ t: 1, ...at(300), speedKmh: 0 }), // stop 100 m away
      makeTick({ t: 2, ...at(380), speedKmh: 30 }),
      crossGreen(3),
    ]);
    expect(r.done).toBe(false);
  });

  it("the in-zone stop is visit-scoped: leaving the zone forgets it", () => {
    const r = run(gated, [
      makeTick({ t: 1, ...at(395), speedKmh: 0 }), // stopped at the line…
      makeTick({ t: 2, ...at(300), speedKmh: 40 }), // …then drove away
      makeTick({ t: 3, ...at(390), speedKmh: 30 }), // returned, no stop this visit
      crossGreen(4),
    ]);
    expect(r.done).toBe(false);
  });

  it("stays open after a lucky green until a later red is met at the same junction", () => {
    let evalState: ObjectiveEvalState = createEvalState(gated);
    const ctx: ObjectiveContext = { stagedOutcomes: [], redsMetInRun: 0 };
    // Lucky green crossing…
    let r = stepObjective(gated, evalState, crossGreen(1), ctx);
    evalState = r.evalState;
    expect(r.done).toBe(false);
    // …loop back, stop at the line, wait the red out, cross on green.
    r = stepObjective(gated, evalState, makeTick({ t: 40, ...at(396), speedKmh: 0 }), ctx);
    evalState = r.evalState;
    r = stepObjective(gated, evalState, crossGreen(70), ctx);
    expect(r.done).toBe(true);
  });
});

describe("driveDistance", () => {
  const params = parsed("driveDistance", { meters: 100 });

  it("accumulates odometer distance and reports progress", () => {
    const ticks = [];
    for (let i = 0; i <= 6; i++) {
      ticks.push(makeTick({ t: i, position: { x: i * 20, y: 0 }, speedKmh: 50 }));
    }
    const r = run(params, ticks);
    expect(r.done).toBe(true);
  });

  it("ignores teleport jumps (reset/respawn)", () => {
    const r = run(params, [
      makeTick({ t: 0, position: { x: 0, y: 0 } }),
      makeTick({ t: 1, position: { x: 500, y: 0 } }), // teleport — not driving
      makeTick({ t: 2, position: { x: 510, y: 0 } }),
    ]);
    expect(r.done).toBe(false);
    expect(r.progress).toBeCloseTo(0.1, 5);
  });
});

describe("completeManeuver / smoothStop", () => {
  const params = parsed("completeManeuver", {
    maneuver: "smoothStop",
    minApproachKmh: 20,
    maxDecelMs2: 3.5,
  });

  /** speed profile as [t, kmh] pairs at a fixed position (position irrelevant). */
  const profile = (pairs: Array<[number, number]>) =>
    pairs.map(([t, v]) => makeTick({ t, speedKmh: v }));

  it("completes on a gentle stop from speed", () => {
    // 30 km/h → 0 over 4 s ≈ 2.1 m/s² — smooth.
    const r = run(params, profile([[0, 30], [1, 24], [2, 16], [3, 8], [4, 0]]));
    expect(r.done).toBe(true);
  });

  it("rejects a harsh stop and re-arms for another attempt", () => {
    // 50 km/h → 0 in 1 s ≈ 13.9 m/s² — emergency braking.
    const harsh = run(params, profile([[0, 50], [1, 0]]));
    expect(harsh.done).toBe(false);

    // Same session state: accelerate again, then stop smoothly => done.
    let evalState = harsh.evalState;
    let done = false;
    for (const tick of profile([[2, 15], [3, 30], [4, 20], [5, 10], [6, 0]])) {
      const r = stepObjective(params, evalState, tick);
      evalState = r.evalState;
      if (r.done) done = true;
    }
    expect(done).toBe(true);
  });

  it("does not complete while the car never reached approach speed", () => {
    const r = run(params, profile([[0, 5], [1, 10], [2, 0]]));
    expect(r.done).toBe(false);
  });
});

describe("completeManeuver / emergencyStop (A10 — stimulus-locked)", () => {
  const params = parsed("completeManeuver", {
    maneuver: "emergencyStop",
    stagedEventId: "l5-braking-lead-car",
  });
  const profile = (pairs: Array<[number, number]>) =>
    pairs.map(([t, v]) => makeTick({ t, speedKmh: v }));
  const outcome = (over: Partial<StagedEventOutcome> = {}): StagedEventOutcome => ({
    eventId: "l5-braking-lead-car",
    kind: "brakingLeadCar",
    success: true,
    detail: "stoppedInTime",
    tSec: 12,
    reactionTimeSec: 0.6,
    stopGapM: 4.2,
    approachSpeedKmh: 48,
    ...over,
  });
  const ctxWith = (...outcomes: StagedEventOutcome[]): ObjectiveContext => ({
    stagedOutcomes: outcomes,
    redsMetInRun: 0,
  });

  it("D4 cheat path: a hard stop with NO stimulus never completes it", () => {
    // The exact profile that used to pass (45 km/h → 0 in 1 s ≈ 12.5 m/s²).
    const r = run(params, profile([[0, 45], [1, 0]]));
    expect(r.done).toBe(false);
    expect(r.progress).toBe(0);
    expect(r.detail).toMatchObject({ kind: "emergencyStop", outcome: "pending", band: null });

    // Nor does ANY speed theatrics without an outcome, ever.
    const wild = run(params, profile([[0, 80], [1, 0], [2, 70], [3, 0], [4, 90], [5, 0]]));
    expect(wild.done).toBe(false);
  });

  it("completes from a successful staged outcome, with the reaction time banded", () => {
    const r = run(params, [makeTick({ t: 13, speedKmh: 0 })], ctxWith(outcome()));
    expect(r.done).toBe(true);
    expect(r.detail).toMatchObject({
      kind: "emergencyStop",
      outcome: "stoppedInTime",
      reactionTimeSec: 0.6,
      band: "otlichen",
      stopGapM: 4.2,
    });
  });

  it("bands the reaction time: <0.8 отличен, <1.2 добър, else бавен", () => {
    const band = (rt: number) =>
      run(params, [makeTick({ t: 13 })], ctxWith(outcome({ reactionTimeSec: rt }))).detail;
    expect(band(0.79)).toMatchObject({ band: "otlichen" });
    expect(band(0.8)).toMatchObject({ band: "dobur" });
    expect(band(1.19)).toMatchObject({ band: "dobur" });
    expect(band(1.2)).toMatchObject({ band: "baven" });
    expect(band(2.4)).toMatchObject({ band: "baven" });
  });

  it("fails (stays incomplete) on hitLeadCar and passedWithoutStopping", () => {
    const hit = run(
      params,
      [makeTick({ t: 13 })],
      ctxWith(outcome({ success: false, detail: "hitLeadCar", stopGapM: 0 })),
    );
    expect(hit.done).toBe(false);
    expect(hit.progress).toBe(0.5); // stimulus fired and was measured — stop not earned
    expect(hit.detail).toMatchObject({ kind: "emergencyStop", outcome: "hitLeadCar" });

    const swerved = run(
      params,
      [makeTick({ t: 13 })],
      ctxWith(outcome({ success: false, detail: "passedWithoutStopping" })),
    );
    expect(swerved.done).toBe(false);
    expect(swerved.detail).toMatchObject({ outcome: "passedWithoutStopping" });
  });

  it("a restaged retry can still complete it (last outcome for the event wins)", () => {
    const r = run(
      params,
      [makeTick({ t: 30 })],
      ctxWith(
        outcome({ success: false, detail: "hitLeadCar", tSec: 12 }),
        outcome({ tSec: 28, reactionTimeSec: 1.0 }),
      ),
    );
    expect(r.done).toBe(true);
    expect(r.detail).toMatchObject({ band: "dobur" });
  });

  it("ignores outcomes of other staged events", () => {
    const other = outcome({ eventId: "l2-priority-from-right" });
    const r = run(params, [makeTick({ t: 13 })], ctxWith(other));
    expect(r.done).toBe(false);
  });
});

describe("completeManeuver / parkInBay (A10 — bay-locked)", () => {
  // Bay centred at the origin, axis due north: inside ⇔ |x| ≤ 1.5, |y| ≤ 3.3.
  const params = parsed("completeManeuver", {
    maneuver: "parkInBay",
    holdSec: 1.5,
    bay: { x: 0, y: 0, headingDeg: 0, widthM: 3.0, lengthM: 6.6 },
  });
  /** Tick at (x, y) with the given speed/gear/heading (defaults: aligned north). */
  const at = (
    t: number,
    x: number,
    y: number,
    over: Partial<ReturnType<typeof makeTick>> = {},
  ) => makeTick({ t, position: { x, y }, headingDeg: 0, ...over });

  it("D4 cheat path: any-reverse + held-stop ANYWHERE no longer completes it", () => {
    // The exact sequence that used to pass — but 30 m from the bay.
    const r = run(params, [
      at(0, 30, 0, { speedKmh: 8, gear: -1 }),
      at(1, 30, 0, { speedKmh: 3, gear: -1 }),
      at(2, 30, 0, { speedKmh: 0, gear: -1 }),
      at(3, 30, 0, { speedKmh: 0, gear: 0 }),
      at(3.6, 30, 0, { speedKmh: 0, gear: 0 }),
    ]);
    expect(r.done).toBe(false);
    expect(r.detail).toMatchObject({ kind: "parkInBay", inBay: false, attempts: 0 });
  });

  it("completes only at rest inside the bay: reversed in, centred, aligned, held", () => {
    const r = run(params, [
      at(0, 0, 10, { speedKmh: 15 }), // pulled ahead of the bay
      at(1, 0.4, 6, { speedKmh: 6, gear: -1 }), // reversing, in the maneuver zone
      at(2, 0.3, 2, { speedKmh: 4, gear: -1 }), // entering the bay (attempt 1)
      at(3, 0.1, 0.1, { speedKmh: 0, gear: -1 }), // at rest, centred — hold starts
      at(4, 0.1, 0.1, { speedKmh: 0, gear: 0 }), // held 1 s — not yet
      at(4.6, 0.1, 0.1, { speedKmh: 0, gear: 0 }), // held 1.6 s ≥ 1.5 s => done
    ]);
    expect(r.done).toBe(true);
    expect(r.detail).toMatchObject({ kind: "parkInBay", attempts: 1, inBay: true });
    expect(r.detail?.kind === "parkInBay" && r.detail.alignment).toBe("centered");
  });

  it("a stop inside the bay WITHOUT reverse does not complete (forward nose-in)", () => {
    const r = run(params, [
      at(0, 0, -10, { speedKmh: 20, gear: 2 }), // driving up in D
      at(1, 0, -2, { speedKmh: 8, gear: 1 }), // nosing in forward
      at(2, 0, 0, { speedKmh: 0, gear: 1 }),
      at(4, 0, 0, { speedKmh: 0, gear: 1 }), // held long enough — still not a park
    ]);
    expect(r.done).toBe(false);
  });

  it("reverse banked far from the bay does not count (maneuver zone)", () => {
    const r = run(params, [
      at(0, 0, -40, { speedKmh: 5, gear: -1 }), // reverse 40 m away — no credit
      at(1, 0, -10, { speedKmh: 20, gear: 2 }),
      at(2, 0, 0, { speedKmh: 0, gear: 1 }), // forward into the bay
      at(4, 0, 0, { speedKmh: 0, gear: 1 }),
    ]);
    expect(r.done).toBe(false);
  });

  it("a sloppy park (off-centre or crooked) stays open and reports its quality", () => {
    const offCentre = run(params, [
      at(0, 1.0, 2.0, { speedKmh: 4, gear: -1 }), // inside, but 1 m off-axis
      at(1, 1.0, 2.0, { speedKmh: 0, gear: -1 }),
      at(3, 1.0, 2.0, { speedKmh: 0, gear: 0 }),
    ]);
    expect(offCentre.done).toBe(false);
    expect(offCentre.detail?.kind === "parkInBay" && offCentre.detail.alignment).toBe("sloppy");

    const crooked = run(params, [
      at(0, 0, 0, { speedKmh: 4, gear: -1, headingDeg: 25 }),
      at(1, 0, 0, { speedKmh: 0, gear: -1, headingDeg: 25 }),
      at(3, 0, 0, { speedKmh: 0, gear: 0, headingDeg: 25 }),
    ]);
    expect(crooked.done).toBe(false);
    expect(crooked.detail?.kind === "parkInBay" && crooked.detail.alignment).toBe("sloppy");
  });

  it("heading is folded to the bay axis (parked facing either way is aligned)", () => {
    const r = run(params, [
      at(0, 0, 2, { speedKmh: 4, gear: -1, headingDeg: 184 }),
      at(1, 0, 0.1, { speedKmh: 0, gear: -1, headingDeg: 184 }),
      at(3, 0, 0.1, { speedKmh: 0, gear: 0, headingDeg: 184 }),
    ]);
    expect(r.done).toBe(true);
  });

  it("rolling resets the hold clock", () => {
    const r = run(params, [
      at(0, 0, 1, { speedKmh: 4, gear: -1 }),
      at(1, 0, 0.2, { speedKmh: 0, gear: -1 }), // stop begins
      at(1.5, 0, 0.3, { speedKmh: 6, gear: -1 }), // rolled — clock resets
      at(2, 0, 0.2, { speedKmh: 0, gear: -1 }), // new stop begins at t=2
      at(3, 0, 0.2, { speedKmh: 0, gear: 0 }), // only 1 s held — not done
    ]);
    expect(r.done).toBe(false);
    expect(r.progress).toBeCloseTo(0.9, 5); // in bay, at rest, aligned — holding
  });

  it("leaving the bay opens a NEW attempt and revokes the reverse credit", () => {
    let evalState: ObjectiveEvalState = createEvalState(params);
    const feed = (tick: ReturnType<typeof makeTick>) => {
      const r = stepObjective(params, evalState, tick);
      evalState = r.evalState;
      return r;
    };
    feed(at(0, 0, 8, { speedKmh: 10 }));
    feed(at(1, 0, 2, { speedKmh: 5, gear: -1 })); // attempt 1 (reversed in)
    feed(at(2, 0, 8, { speedKmh: 10, gear: 1 })); // pulled out — attempt over
    feed(at(3, 0, 2, { speedKmh: 5, gear: 1 })); // attempt 2, forward this time
    const r = feed(at(5, 0, 0, { speedKmh: 0, gear: 1 }));
    expect(r.detail).toMatchObject({ kind: "parkInBay", attempts: 2 });
    expect(r.done).toBe(false); // reverse credit from attempt 1 was revoked

    // Reversing INSIDE the bay to adjust restores the credit for attempt 2.
    feed(at(6, 0, 0.5, { speedKmh: 3, gear: -1 }));
    feed(at(7, 0, 0.2, { speedKmh: 0, gear: 0 }));
    const done = feed(at(8.6, 0, 0.2, { speedKmh: 0, gear: 0 }));
    expect(done.done).toBe(true);
    expect(done.detail).toMatchObject({ attempts: 2 });
  });
});

describe("completeManeuver / roundabout (A10 — exit under right indicator)", () => {
  const params = parsed("completeManeuver", {
    maneuver: "roundabout",
    x: -38,
    y: -343,
    enterRadiusM: 26,
    exitRadiusM: 45,
  });
  const approach = makeTick({ t: 0, position: { x: 20, y: -343 } }); // 58 m out
  const exiting = (t: number, indicator: "off" | "left" | "right") =>
    makeTick({ t, position: { x: -38, y: -300 }, indicator }); // 43 m — annulus
  const out = (t: number, indicator: "off" | "left" | "right" = "off") =>
    makeTick({ t, position: { x: -38, y: -290 }, indicator }); // 53 m — outside

  /** ON the ring (22 m from the island centre; enterRadiusM is 26), at azimuth
   *  `azDeg` about it — 180° is due north of the island, which is where
   *  `exiting`/`out` sit, so the default keeps the car on that radial. The angle
   *  matters twice: the exit-signal memory is spent in DEGREES OF ARC, and so
   *  (2026-08-17) is the passage itself. */
  const onRing = (
    t: number,
    indicator: "off" | "left" | "right",
    azDeg = 180,
    over: Partial<ReturnType<typeof makeTick>> = {},
  ) =>
    makeTick({
      t,
      position: {
        x: -38 + 22 * Math.sin((azDeg * Math.PI) / 180),
        y: -343 - 22 * Math.cos((azDeg * Math.PI) / 180),
      },
      indicator,
      ...over,
    });
  /** Just OUTSIDE the ring (27 m) — the first frame the old sampler looked at. */
  const justOut = (t: number, indicator: "off" | "left" | "right" = "off") =>
    makeTick({ t, position: { x: -38, y: -316 }, indicator });

  /**
   * THE PASSAGE — in at the east mouth (az 88°) and round the island to the
   * north exit's radial (az 180°), sampled every 0.2 s.
   *
   * IT REPLACED A SINGLE TICK (2026-08-17), and that is the point. Every drive
   * in this describe used to be `[approach, inRing, exiting, out]`: one sample
   * inside the entry circle, the next one outside it, no arc between them. That
   * is not a roundabout being driven — it is the shape of the false pass
   * ROUNDABOUT_MIN_TRAVERSAL_ARC_DEG exists to refuse (reach the give-way line,
   * turn off down the side road, leave). The fixtures were never asserting a
   * traversal; they were asserting the SIGNAL rules and happened to be handed
   * `done` by latches that asked for nothing else. Each test below keeps its own
   * assertion exactly as it was — what changed is that the car now goes round
   * the island first, 92° of it, the first-exit passage the shipped rings
   * measure at 70–99°.
   */
  const ringRide = (
    t: number,
    indicator: "off" | "left" | "right" = "off",
    over: Partial<ReturnType<typeof makeTick>> = {},
  ) => [
    onRing(t, indicator, 88, over),
    onRing(t + 0.2, indicator, 111, over),
    onRing(t + 0.4, indicator, 134, over),
    onRing(t + 0.6, indicator, 157, over),
  ];

  it("requires entering before exiting counts", () => {
    // Approaching from 100 m away — outside exitRadius means nothing yet.
    const r = run(params, [makeTick({ t: 0, position: { x: 62, y: -343 } })]);
    expect(r.done).toBe(false);
  });

  it("completes after enter → exit with the right indicator in the exit window", () => {
    const r = run(params, [approach, ...ringRide(1), exiting(2, "right"), out(3)]);
    expect(r.done).toBe(true);
  });

  it("the indicator on the exit-crossing tick itself also counts", () => {
    const r = run(params, [approach, ...ringRide(1), out(2, "right")]);
    expect(r.done).toBe(true);
  });

  it("D4 cheat path: enter → exit WITHOUT the signal no longer completes, and voids the traversal", () => {
    let evalState: ObjectiveEvalState = createEvalState(params);
    let done = false;
    for (const tick of [approach, ...ringRide(1), exiting(2, "off"), out(3, "off")]) {
      const r = stepObjective(params, evalState, tick);
      evalState = r.evalState;
      done ||= r.done;
    }
    expect(done).toBe(false);
    // Traversal voided: signaling right NOW, already outside, earns nothing…
    let r = stepObjective(params, evalState, out(4, "right"));
    evalState = r.evalState;
    expect(r.done).toBe(false);
    expect(r.detail).toMatchObject({ kind: "roundabout", entered: false });
    // …the student must go around again and exit properly.
    for (const tick of [
      ...ringRide(5),
      makeTick({ t: 6, position: { x: -38, y: -300 }, indicator: "right" }),
    ]) {
      r = stepObjective(params, evalState, tick);
      evalState = r.evalState;
    }
    r = stepObjective(params, evalState, out(7));
    expect(r.done).toBe(true);
  });

  it("signaling only on the APPROACH (before entering) earns nothing", () => {
    const signaledApproach = makeTick({
      t: 0,
      position: { x: -8, y: -343 }, // 30 m out — inside the annulus, not entered
      indicator: "right",
    });
    const r = run(params, [signaledApproach, ...ringRide(1), exiting(2, "off"), out(3)]);
    expect(r.done).toBe(false);
  });

  it("a LEFT indicator (or none) in the exit window does not count", () => {
    const r = run(params, [approach, ...ringRide(1), exiting(2, "left"), out(3)]);
    expect(r.done).toBe(false);
  });

  // -------------------------------------------------------------------------
  // B21-RB (2026-08-11) — the stalk is not a level. Founder: «I turned on the
  // signal when leaving it but, it didnt mark it as signal is on and it popped
  // up an error stating I didnt leave the roundabout with signal».
  //
  // The distances below are MEASURED, not invented: fifteen drives of the
  // rb-mini ring through the real Rapier car and the real CabinControls, with
  // the right stalk pressed on the ring at φ ≈ 110°. On the exit lines where
  // the driver holds the ring until his exit is beside him, the wheel comes
  // back to centre — and CabinControls cancels the stalk, exactly as a real
  // car does — at d = 21.9–26.7 m. The credit rate for a CORRECT exit was
  // 12/15 at 24/34, 9/15 at 26/45, 6/15 at 29/34 and 5/15 at 33/46, decided by
  // the two metres at which the wheel happened to straighten.
  //
  // The CURRENCY of the memory was then corrected from seconds to degrees of
  // ring arc, again by driving: 64 runs (four geometries × keyboard/analog ×
  // 12/15/18/22 km/h × {textbook signal, flick at the entrance}) put the two
  // populations 10.20–13.57 s ON TOP OF EACH OTHER in seconds — a 5 s lookback
  // still failed 16 of 32 correct exits, every one of them a slower drive —
  // and 64° APART in degrees (1.1–87.7 correct vs 152.1–231.4 for the flick).
  // See ROUNDABOUT_EXIT_SIGNAL_ARC_DEG.
  // -------------------------------------------------------------------------

  it("B21-RB: a signal given ON THE RING that the car auto-cancelled on the exit turn still counts", () => {
    // 0.4 s from the stalk going dark to the car clearing enterRadiusM — the
    // measured gap was 0.03–0.45 s on the drives this defect was found on.
    const r = run(params, [
      approach,
      ...ringRide(0.2),
      onRing(1.0, "right"),
      justOut(1.4, "off"),
      exiting(3, "off"),
      out(4, "off"),
    ]);
    expect(r.done).toBe(true);
  });

  it("B21-RB: the credit expires — a stalk that went dark a whole lap ago still voids the traversal", () => {
    let evalState: ObjectiveEvalState = createEvalState(params);
    let done = false;
    const ticks = [
      approach,
      // No ringRide here: this drive IS the ride, and a longer one — in at the
      // south-east mouth and round past two more of them, 160° of island.
      onRing(1.0, "right", 20), // signalled at the south-east of the island…
      onRing(3.0, "off", 80), // …then killed it and kept circulating, silent,
      onRing(5.0, "off", 140), // past two more mouths…
      onRing(7.0, "off", 180),
      justOut(7.5, "off"), // …so it is 160° of ring stale when he leaves
      exiting(8.5, "off"),
      out(9.5, "off"),
    ];
    for (const tick of ticks) {
      const r = stepObjective(params, evalState, tick);
      evalState = r.evalState;
      done ||= r.done;
    }
    expect(done).toBe(false);
    expect(evalState).toMatchObject({ type: "roundabout", voidedExits: 1, entered: false });
  });

  it("B21-RB: a lawful STOP cannot expire the credit — seconds burn, arc does not", () => {
    // sc-rb-ped-exit makes the student halt between the ring and the zebra and
    // wait the pedestrian out. Here he signals, the exit turn auto-cancels the
    // stalk, and he then stands still for twenty seconds. He has driven nowhere
    // since the signal, so the signal still stands — which is the whole reason
    // this memory is spent in degrees and not in seconds.
    const r = run(params, [
      approach,
      ...ringRide(0.2),
      onRing(1.0, "right", 170),
      onRing(1.5, "off", 178),
      justOut(2.0, "off"),
      justOut(12.0, "off"), // waiting
      justOut(22.0, "off"), // still waiting
      exiting(24.0, "off"),
      out(25.0, "off"),
    ]);
    expect(r.done).toBe(true);
  });

  it("B21-RB: the arc boundary — 110° of ring since the signal counts, 130° does not", () => {
    const drive = (staleDeg: number) =>
      run(params, [
        approach,
        // The stale span IS the passage here (110° / 130° of island), so no
        // separate ringRide — prepending one would only make it longer.
        onRing(1.0, "right", 180 - staleDeg),
        onRing(2.0, "off", 180 - staleDeg / 2),
        onRing(3.0, "off", 180),
        justOut(3.5, "off"),
        exiting(4.5, "off"),
        out(5.5, "off"),
      ]);
    expect(drive(110).done).toBe(true);
    expect(drive(130).done).toBe(false);
  });

  it("B21-RB: `entered` does NOT mean on the ring — a signal lit INSIDE enterRadiusM on the approach is still not banked", () => {
    // The trap in the one-line version of this fix (just delete `d >
    // enterRadiusM`). enterRadiusM is authored 6–11 m outside the circulatory
    // carriageway on every shipped ring — 26 against r = 19.83 here — so a
    // right stalk lit for the give-way line is lit for 1–2 s of APPROACH with
    // `entered` already true. Deleting the radius test banks it for a silent
    // lap; the arc memory is what actually closes the hole.
    const r = run(params, [
      makeTick({ t: 0, position: { x: -11, y: -343 }, indicator: "right" }), // 27 m — not entered
      makeTick({ t: 0.5, position: { x: -13, y: -343 }, indicator: "right" }), // 25 m — entered, STILL approaching
      onRing(1.5, "off", 60), // the stalk dies on the entry turn…
      onRing(3.0, "off", 120), // …and he rides most of the ring in silence
      onRing(4.5, "off", 180),
      justOut(5.0, "off"),
      exiting(6, "off"),
      out(7, "off"),
    ]);
    expect(r.done).toBe(false);
  });

  it("B21-RB: an APPROACH signal is still not banked — the memory only arms on the ring", () => {
    // Lit at 30 m (outside enterRadiusM ⇒ not entered), dark from the moment
    // he is actually in the ring, and out again only 2 s later: well inside the
    // lookback, and it must STILL earn nothing.
    const r = run(params, [
      makeTick({ t: 0, position: { x: -8, y: -343 }, indicator: "right" }), // 30 m
      ...ringRide(1), // the whole passage driven with the stalk dark
      justOut(2, "off"),
      exiting(2.5, "off"),
      out(3, "off"),
    ]);
    expect(r.done).toBe(false);
  });

  it("B21-RB: a voided traversal forgets the ring signal — it cannot bank into the next lap", () => {
    let evalState: ObjectiveEvalState = createEvalState(params);
    // Lap 1: silent exit ⇒ voided.
    for (const tick of [approach, ...ringRide(1), exiting(2, "off"), out(3, "off")]) {
      evalState = stepObjective(params, evalState, tick).evalState;
    }
    expect(evalState).toMatchObject({
      type: "roundabout",
      voidedExits: 1,
      ringSignalArcDeg: null,
      prevAzimuthDeg: null,
    });
    // Lap 2: back on the ring, signals, then rides most of the ring silent.
    let done = false;
    for (const tick of [
      onRing(5, "right", 10),
      onRing(6, "off", 90),
      onRing(7, "off", 170),
      justOut(12.5, "off"),
      out(13.5, "off"),
    ]) {
      const r = stepObjective(params, evalState, tick);
      evalState = r.evalState;
      done ||= r.done;
    }
    expect(done).toBe(false);
    expect(evalState).toMatchObject({ type: "roundabout", voidedExits: 2 });
  });

  // -------------------------------------------------------------------------
  // NOBODY LEAVES A ROUNDABOUT BACKWARDS — 2026-08-16.
  //
  // Driving `sc-roundabout-entry` L1 on staging to find out why the founder's
  // exit went uncredited produced the opposite result. The bench rolled 5 m
  // into the south mouth (d = 17.85 against enterRadiusM 24), flicked the right
  // stalk there, and REVERSED back out down the same arm past exitRadiusM 34 —
  // and «✓ Премини през кръговото и излез с десен мигач» flashed on the way out.
  // The identical drive with no stalk left the objective open and dropped the
  // banner's bar from 50 % to 0 % (the void's own `entered` reset), so both
  // directions of the SIGNAL half work on the deployed build; what did not work
  // is that neither half asks whether a roundabout was driven at all.
  // -------------------------------------------------------------------------
  describe("the exit is a DEPARTURE — a reversing car has not left", () => {
    /**
     * The ring driven FORWARD, all 92° of it, ending on the north exit radial.
     * It used to be one tick 15 m inside the mouth (2026-08-17): with the
     * traversal arc in place that drive abandons for want of arc before the
     * gear is ever consulted, so these fixtures would have passed while testing
     * nothing. The car now genuinely completes the passage — the ONLY thing
     * left for each test below to turn on is the gear it leaves in.
     */
    const ringForward = (t: number, indicator: "off" | "right" = "off") =>
      ringRide(t, indicator, { gear: 1 });
    const backOut = (t: number, gear: number, indicator: "off" | "right" = "off") =>
      makeTick({ t, position: { x: -38, y: -290 }, indicator, gear }); // 53 m — outside

    it("FAILS ON THE OLD BEHAVIOUR: drive the ring, signal, reverse out — not a departure", () => {
      const r = run(params, [approach, ...ringForward(1, "right"), backOut(2, -1)]);
      expect(r.done).toBe(false);
    });

    it("…it is not VOIDED either — the card would accuse him of the wrong thing", () => {
      // «Излезе от кръговото без десен мигач» at a student who never left, with
      // his stalk lit, is a worse lie than silence. Backing out ABANDONS the
      // attempt instead: latches cleared, nothing said, nothing counted.
      let evalState: ObjectiveEvalState = createEvalState(params);
      let done = false;
      for (const tick of [approach, ...ringForward(1, "right"), backOut(2, -1), backOut(3, -1)]) {
        const r = stepObjective(params, evalState, tick);
        evalState = r.evalState;
        done ||= r.done;
      }
      expect(done).toBe(false);
      expect(evalState).toMatchObject({
        type: "roundabout",
        entered: false,
        exitSignaled: false,
        ringSignalArcDeg: null,
        voidedExits: 0,
      });
    });

    it("…and the cheat does not just move one frame later: forward AFTER backing out is nothing", () => {
      // The measured drive really did end up outside, pointing away, with the
      // stalk memory intact. A guard that only withheld `done` while the gear
      // was negative would have handed the tick over on the next forward frame.
      const r = run(params, [
        approach,
        ...ringForward(1, "right"),
        backOut(2, -1), // out past exitRadiusM in reverse — attempt abandoned
        backOut(3, 1), // …now driving forward, still outside
        backOut(4, 1, "right"),
      ]);
      expect(r.done).toBe(false);
    });

    it("the OTHER direction: the same exit driven FORWARD still completes", () => {
      const r = run(params, [approach, ...ringForward(1, "right"), backOut(2, 1)]);
      expect(r.done).toBe(true);
    });

    it("…and a forward exit with no signal still voids, exactly as before", () => {
      let evalState: ObjectiveEvalState = createEvalState(params);
      let done = false;
      for (const tick of [approach, ...ringForward(1, "off"), backOut(2, 1, "off")]) {
        const r = stepObjective(params, evalState, tick);
        evalState = r.evalState;
        done ||= r.done;
      }
      expect(done).toBe(false);
      expect(evalState).toMatchObject({ type: "roundabout", voidedExits: 1, entered: false });
    });
  });
});

describe("completeManeuver / threePointTurn (обратен завой — corridor-locked)", () => {
  // Corridor centred at the origin, axis due north: inside ⇔ |x| ≤ 4, |y| ≤ 6.
  // Start heading north (0); the turn must end facing back (~180°).
  const params = parsed("completeManeuver", {
    maneuver: "threePointTurn",
    corridor: { x: 0, y: 0, halfWidthM: 4, halfLengthM: 6 },
    startHeadingDeg: 0,
    toleranceDeg: 20,
    holdSec: 0.6,
  });
  /** Tick at (x, y) with the given speed/gear/heading. */
  const at = (
    t: number,
    x: number,
    y: number,
    over: Partial<ReturnType<typeof makeTick>> = {},
  ) => makeTick({ t, position: { x, y }, headingDeg: 0, ...over });

  it("rejects a malformed corridor or a missing start heading", () => {
    expect(() =>
      parsed("completeManeuver", { maneuver: "threePointTurn", startHeadingDeg: 0 }),
    ).toThrow(/corridor/);
    expect(() =>
      parsed("completeManeuver", {
        maneuver: "threePointTurn",
        corridor: { x: 0, y: 0, halfWidthM: 0, halfLengthM: 6 },
        startHeadingDeg: 0,
      }),
    ).toThrow(/corridor/);
    expect(() =>
      parsed("completeManeuver", {
        maneuver: "threePointTurn",
        corridor: { x: 0, y: 0, halfWidthM: 4, halfLengthM: 6 },
      }),
    ).toThrow(/startHeadingDeg/);
  });

  it("applies tolerance/hold defaults", () => {
    const p = parsed("completeManeuver", {
      maneuver: "threePointTurn",
      corridor: { x: 1, y: 2, halfWidthM: 4, halfLengthM: 6 },
      startHeadingDeg: 90,
    });
    expect(p).toMatchObject({ maneuver: "threePointTurn", toleranceDeg: 20, holdSec: 0.6 });
  });

  it("FIRES ON COMPLETION: forward → reverse → forward, ends facing back, at rest, held", () => {
    const r = run(params, [
      at(0, 0, 5, { speedKmh: 6, gear: 1, headingDeg: 0 }), // enter, forward-left (move 1)
      at(1, 0, 4, { speedKmh: 4, gear: -1, headingDeg: 95 }), // reverse-right (move 2 — shunt 1)
      at(2, 0, 2, { speedKmh: 4, gear: 1, headingDeg: 160 }), // forward-away (move 3 — shunt 2)
      at(3, -1, 0, { speedKmh: 0, gear: 1, headingDeg: 180 }), // at rest facing south — hold starts
      at(3.4, -1, 0, { speedKmh: 0, gear: 0, headingDeg: 180 }), // held 0.4 s — not yet
      at(3.7, -1, 0, { speedKmh: 0, gear: 0, headingDeg: 180 }), // held 0.7 s ≥ 0.6 => done
    ]);
    expect(r.done).toBe(true);
    // A clean three-point turn: two direction changes → three movements.
    expect(r.detail).toMatchObject({ kind: "threePointTurn", reversals: 2, movements: 3, entered: true });
  });

  it("counts extra shunts: a five-point turn reports 5 movements", () => {
    const r = run(params, [
      at(0, 0, 5, { speedKmh: 5, gear: 1, headingDeg: 0 }),
      at(1, 0, 4, { speedKmh: 4, gear: -1, headingDeg: 60 }), // shunt 1
      at(2, 0, 3, { speedKmh: 4, gear: 1, headingDeg: 110 }), // shunt 2
      at(3, 0, 2, { speedKmh: 4, gear: -1, headingDeg: 150 }), // shunt 3
      at(4, -1, 1, { speedKmh: 4, gear: 1, headingDeg: 175 }), // shunt 4
      at(5, -1, 0, { speedKmh: 0, gear: 1, headingDeg: 180 }),
      at(5.7, -1, 0, { speedKmh: 0, gear: 0, headingDeg: 180 }),
    ]);
    expect(r.done).toBe(true);
    expect(r.detail).toMatchObject({ reversals: 4, movements: 5 });
  });

  it("FIRES ON FAILURE: stopping in the corridor still facing FORWARD never completes", () => {
    const r = run(params, [
      at(0, 0, 4, { speedKmh: 5, gear: 1, headingDeg: 0 }), // entered, forward
      at(1, 0, 0, { speedKmh: 0, gear: 1, headingDeg: 0 }), // at rest — but never turned
      at(3, 0, 0, { speedKmh: 0, gear: 0, headingDeg: 0 }), // held long — direction not reversed
    ]);
    expect(r.done).toBe(false);
    // RE-POINTED, sweep 161 (2026-08-18): 0, not 1. `movements` used to count
    // from the corridor ENTRY, and rubric.ts prices the economy row off it —
    // so this car, which turned nothing, was printed «Икономичност на
    // маневрата 2 / 2 т. · Обратен завой в 1 движения — чиста маневра» beside
    // the dash for the objective it failed, on both platforms of both U-turn
    // drills. See approach-cap-contract.test.ts.
    expect(r.detail).toMatchObject({ kind: "threePointTurn", movements: 0, headingToTargetDeg: 180 });
  });

  it("FIRES ON FAILURE: an incomplete turn (stops facing east, ~90°) does not complete", () => {
    const r = run(params, [
      at(0, 0, 5, { speedKmh: 5, gear: 1, headingDeg: 0 }),
      at(1, 0, 4, { speedKmh: 4, gear: -1, headingDeg: 60 }), // shunt 1
      at(2, 0, 1, { speedKmh: 4, gear: 1, headingDeg: 90 }), // shunt 2, but only turned to east
      at(3, 0, 0, { speedKmh: 0, gear: 1, headingDeg: 90 }),
      at(3.7, 0, 0, { speedKmh: 0, gear: 0, headingDeg: 90 }),
    ]);
    expect(r.done).toBe(false); // heading 90° is 90° off the 180° target (> 20° tol)
  });

  it("FIRES ON FAILURE: reversing direction but coming to rest OUTSIDE the corridor", () => {
    const r = run(params, [
      at(0, 0, 5, { speedKmh: 5, gear: 1, headingDeg: 0 }),
      at(1, 0, 4, { speedKmh: 4, gear: -1, headingDeg: 95 }),
      at(2, 0, 2, { speedKmh: 4, gear: 1, headingDeg: 160 }),
      at(3, 0, 10, { speedKmh: 0, gear: 1, headingDeg: 180 }), // faces back, but y=10 is outside
      at(3.7, 0, 10, { speedKmh: 0, gear: 0, headingDeg: 180 }),
    ]);
    expect(r.done).toBe(false);
  });

  it("rolling resets the hold clock", () => {
    const r = run(params, [
      at(0, 0, 4, { speedKmh: 4, gear: -1, headingDeg: 120 }),
      at(1, -1, 1, { speedKmh: 4, gear: 1, headingDeg: 178 }), // shunt, facing ~back
      at(2, -1, 0, { speedKmh: 0, gear: 1, headingDeg: 180 }), // stop begins
      at(2.4, -1, 0.2, { speedKmh: 5, gear: 1, headingDeg: 180 }), // rolled — clock resets
      at(3, -1, 0, { speedKmh: 0, gear: 0, headingDeg: 180 }), // only ~0 s held — not done
    ]);
    expect(r.done).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// B18 residual / FR-24 — „I have to stop BEFORE the line not after it"
// ---------------------------------------------------------------------------

/**
 * The founder, on «Кръгово движение»: „the green cyrcle that is stating where
 * the car to stop is actually putted after the stop marked line on the road …
 * I have to stop before the line not after it."
 *
 * The DRAWN marker was moved onto the lawful side in scene/guidanceRoute.ts;
 * the register's residual was that the GRADE was not. A radius-9 circle
 * centred 1.725 m INSIDE the roundabout mouth accepts the approach task from
 * anywhere up to 7.3 m past the give-way bars — so a driver who came in too
 * fast, crossed the paint and only then settled to a legal speed was told he
 * had „approached ready to stop". He had done the opposite.
 *
 * `acceptBeforeMarkM` cuts the acceptance at the paint. Credit can only be
 * EARNED on the approach side; every metre the L1/L2 tolerance ladder adds is
 * added backwards, down the road, where being early is the same act done
 * sooner.
 */
describe("reachZone acceptBeforeMarkM — the acceptance stops where the paint does", () => {
  // The shipped geometry of sc-roundabout-entry's first task.
  const MARK: ObjectiveParams = {
    kind: "reachZone",
    x: 4.06,
    y: -34,
    radiusM: 9,
    maxSpeedKmh: 25,
    acceptBeforeMarkM: 1.725,
  };
  const PAINT_Y = -35.725;

  /**
   * Drive north up the lane from y = −60 to y = `toY`, at `beforeKmh` until
   * `slowAtY` and `afterKmh` from there on. Returns whether the task ticked.
   */
  function approach(
    params: ObjectiveParams,
    opts: { toY: number; beforeKmh: number; afterKmh: number; slowAtY: number },
  ): boolean {
    let st = createEvalState(params);
    let done = false;
    let t = 0;
    for (let y = -60; y <= opts.toY + 1e-9; y += 0.25) {
      t += 0.05;
      const speedKmh = y < opts.slowAtY ? opts.beforeKmh : opts.afterKmh;
      const step = stepObjective(params, st, makeTick({ t, speedKmh, position: { x: 4.06, y } }));
      st = step.evalState;
      done = done || step.done;
    }
    // …and hold there for a second: a driver who has stopped, waits.
    for (let i = 0; i < 30; i++) {
      t += 1 / 30;
      const step = stepObjective(
        params,
        st,
        makeTick({ t, speedKmh: 0, position: { x: 4.06, y: opts.toY } }),
      );
      st = step.evalState;
      done = done || step.done;
    }
    return done;
  }

  /** Slowed down properly, before the bars — the taught approach. */
  const LAWFUL = { toY: PAINT_Y, beforeKmh: 40, afterKmh: 20, slowAtY: PAINT_Y - 12 };
  /** Barged the mouth at 40 and only complied INSIDE it — the taught mistake. */
  const BARGED = { toY: -34.03, beforeKmh: 40, afterKmh: 20, slowAtY: PAINT_Y + 0.5 };

  it("credits the driver who slowed down before the bars", () => {
    expect(approach(MARK, LAWFUL)).toBe(true);
    // …and from the far edge of the disc, 7.2 m short of the paint, too.
    expect(approach(MARK, { ...LAWFUL, toY: PAINT_Y - 7 })).toBe(true);
  });

  it("refuses the driver who only complied PAST the bars — the whole of B18", () => {
    expect(approach(MARK, BARGED)).toBe(false);
    // Deeper into the mouth is no better, though the old circle reached there.
    expect(approach(MARK, { ...BARGED, toY: -30, slowAtY: -33 })).toBe(false);
  });

  it("the L1 tolerance ladder widens it BACKWARDS only", () => {
    // Radius 9 × 1.5 and the cap 25 → 30 (the compiler's aided rung).
    const aided: ObjectiveParams = { ...MARK, radiusM: 13.5, maxSpeedKmh: 30 };
    // More room short of the line: a driver who settles 12 m out is credited.
    expect(approach(aided, { ...LAWFUL, toY: PAINT_Y - 11, slowAtY: PAINT_Y - 20 })).toBe(true);
    // …and not one centimetre more past it.
    expect(approach(aided, BARGED)).toBe(false);
  });

  it("a waypoint WITHOUT the bound is evaluated exactly as before", () => {
    const plain: ObjectiveParams = { kind: "reachZone", x: 4.06, y: -34, radiusM: 9, maxSpeedKmh: 25 };
    expect(approach(plain, LAWFUL)).toBe(true);
    // The before picture: the same barge, credited.
    expect(approach(plain, BARGED)).toBe(true);
  });

  /**
   * FR-24, the NEGATIVE sign — and it is the common case, not the exotic one.
   *
   * `sc-rb-approach` above has its mark INSIDE the mouth, so its cut is
   * positive. Ten of the catalog's twelve cut objectives are the other shape:
   * the mark is authored honestly on the approach and the RADIUS is what
   * reaches past the paint — helped over the line by the L1/L2 aid ladder,
   * which widens the disc in both directions.
   *
   * This is `sc-sry-approach` („Спри на стоп-линията на червено") at its real
   * geometry: mark y −34, stop line y −27.725, so the paint is 6.275 m AHEAD
   * of the mark and the cut is −6.275. At L1 the ladder takes radius 8 → 12,
   * which used to credit a car standing 5.72 m past a red light's stop line
   * with having stopped AT it.
   *
   * THE CAP BELOW IS DELIBERATELY THE OLD ONE. The template's authored cap was
   * 40 when this case was written and is now 3 — the title-honesty pass made
   * the word „спри" ask for a stop (a cap of 40 completed a stop drill at 40).
   * These fixtures are about the CUT, and the cut needs a driver who can be
   * legal on one side of the paint and illegal on the other, which a halt cap
   * would collapse. Kept at 40 on purpose; it is a fixture, not a mirror.
   */
  describe("the negative cut — when the RADIUS, not the mark, crosses the paint", () => {
    const SRY_PAINT_Y = -27.725;
    const AIDED: ObjectiveParams = {
      kind: "reachZone",
      x: 4.06,
      y: -34,
      radiusM: 12, // L1 aided (authored 8)
      maxSpeedKmh: 40,
      acceptBeforeMarkM: -6.275,
    };
    const UNCUT: ObjectiveParams = { ...AIDED, acceptBeforeMarkM: undefined };

    /**
     * The variable is WHERE THE DRIVER FIRST COMPLIES, exactly as in the
     * positive-cut BARGED case above — not where he ends up. A car that was
     * already legal on the approach has satisfied the task there and creeping
     * forward afterwards cannot un-satisfy it; that is the monotonic latch
     * working, and it is correct („he stopped at the line, then edged out for
     * a better look" is not a red-light violation).
     *
     * So: over the 40 km/h cap all the way down the approach, dropping to a
     * legal speed only at `compliesAtY`, and finishing 8 m past the mark.
     */
    const barge = (compliesAtY: number) => ({
      toY: -26,
      beforeKmh: 60,
      afterKmh: 20,
      slowAtY: compliesAtY,
    });

    it("credits the driver who is legal BEFORE the paint", () => {
      expect(approach(AIDED, barge(SRY_PAINT_Y - 12))).toBe(true);
      // …and from well back down the approach, where the sightline is better.
      expect(approach(AIDED, barge(-50))).toBe(true);
    });

    it("refuses the driver who only complies PAST the line, though the disc reaches there", () => {
      // The end pose is 8 m from the mark and the aided radius is 12, so the
      // uncut circle unambiguously covers it — this is not a near miss.
      expect(Math.abs(-26 - (AIDED as { y: number }).y)).toBeLessThan(12);
      expect(approach(UNCUT, barge(SRY_PAINT_Y + 0.5))).toBe(true); // the before picture
      expect(approach(AIDED, barge(SRY_PAINT_Y + 0.5))).toBe(false); // the fix
    });

    it("the boundary is the PAINT, not the mark — to the centimetre", () => {
      expect(approach(AIDED, barge(SRY_PAINT_Y - 0.3))).toBe(true);
      expect(approach(AIDED, barge(SRY_PAINT_Y + 0.3))).toBe(false);
      // And the mark itself is NOT the boundary: complying 6 m past the mark
      // but still short of the paint is credited. That 6.275 m is the whole
      // difference between grading the waypoint and grading the law.
      expect(approach(AIDED, barge((AIDED as { y: number }).y + 6))).toBe(true);
    });
  });
});
