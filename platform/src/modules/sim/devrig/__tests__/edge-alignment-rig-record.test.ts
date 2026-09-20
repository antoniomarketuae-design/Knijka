/**
 * THE OBSERVATION MUST REACH THE INSTRUMENT, OR IT IS A DEAD PREDICATE.
 *
 * This programme has measured the failure this file exists to prevent: 51 of
 * 82 audited repairs shipped a predicate that NOTHING live reads, which is why
 * rounds moved the ledger and not the product. `SimTick.edgeAlignment` is
 * published for one consumer — the audit harness, which drives `/dev/drive-rig`
 * and reads `window.__driveRig.dump()` — and both dev taps copy NAMED fields
 * off the tick rather than spreading it. A field published on the tick alone is
 * therefore invisible to the harness, and the work would look done while
 * settling nothing.
 *
 * So the rig's copy is pinned here, by execution: the real `DriveRig.onTick`,
 * handed a real `LessonStepResult` from the real `applyTick`.
 *
 * HOW IT FAILS. Delete or rename the copy in `rig.onTick`, drop the field from
 * `DriveRigSample`, or reset `seq` where it must not be, and a named assertion
 * below goes red.
 */
import { describe, expect, it } from "vitest";
import { DRIVE_RIG_VERSION, DriveRig } from "../rig";
import { applyTick, createLessonSession } from "../../lessons/engine";
import type { LessonSpec } from "../../contracts";
import type { EdgeAlignment, SimTick } from "../../rules";

const lesson: LessonSpec = {
  id: "t-rig-edge-alignment",
  order: 99,
  titleBg: "Тест",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 90 },
  preDrive: false,
  objectives: [
    { id: "o-zone", titleBg: "Стигни зоната", kind: "reachZone", params: { x: 9999, y: 9999, radiusM: 5 } },
  ],
};

const RING: EdgeAlignment = {
  deg: -137.5,
  wrongWayArmed: true,
  edgeId: "e925166131.0",
  offCarriageway: false,
  travelDir: 1,
  roundabout: true,
};

const NOWHERE: EdgeAlignment = {
  deg: null,
  reason: "no-edge-fix",
  wrongWayArmed: false,
  edgeId: null,
  offCarriageway: true,
};

function tick(t: number, over: Partial<SimTick> = {}): SimTick {
  return {
    t,
    speedKmh: 30,
    maxSpeedKmh: 50,
    position: { x: t, y: 0 },
    headingDeg: 90,
    laneOffsetM: 0,
    laneId: 0,
    edgeId: "e925166131.0",
    oneway: true,
    indicator: "off",
    headlights: "low",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    isNight: false,
    events: [],
    ...over,
  };
}

/** Feed the rig a run of ticks through the REAL lesson engine. */
function record(ticks: readonly SimTick[]) {
  const rig = new DriveRig({ lessonId: lesson.id, lessonTitleBg: lesson.titleBg });
  let session = createLessonSession(lesson);
  for (const t of ticks) {
    const step = applyTick(session, t);
    session = step.state;
    rig.onTick(t, step);
  }
  return rig;
}

describe("the drive rig carries the road reference", () => {
  it("copies edgeAlignment onto the sample, unchanged", () => {
    const rig = record([tick(1, { edgeAlignment: RING, wrongWay: true })]);
    expect(rig.handle.last?.edgeAlignment).toEqual(RING);
  });

  it("carries the NOT-MEASURABLE record too — never a 0, never an omission", () => {
    const rig = record([tick(1, { edgeAlignment: NOWHERE, edgeId: null, oneway: undefined })]);
    const s = rig.handle.last!;
    expect(s.edgeAlignment).toEqual(NOWHERE);
    expect(s.edgeAlignment?.deg).toBeNull();
    expect(s.edgeId).toBeNull();
  });

  it("carries the five road-context fields the flow criteria join on", () => {
    const rig = record([
      tick(1, { edgeAlignment: RING, wrongWay: true, opposingBank: undefined, laneId: 2 }),
    ]);
    const s = rig.handle.last!;
    expect({
      edgeId: s.edgeId,
      laneId: s.laneId,
      oneway: s.oneway,
      wrongWay: s.wrongWay,
      opposingBank: s.opposingBank,
    }).toEqual({
      edgeId: "e925166131.0",
      laneId: 2,
      oneway: true,
      wrongWay: true,
      opposingBank: undefined,
    });
  });

  it("numbers every frame, so a read-back can tell decimation from a gap", () => {
    const rig = record([1, 2, 3, 4, 5, 6].map((n) => tick(n, { edgeAlignment: RING })));
    expect(rig.handle.dump().samples.map((s) => s.seq)).toEqual([0, 1, 2, 3, 4, 5]);
    // Decimation is a CONSTANT step; eviction and pauses are not. That is the
    // whole reason the counter exists, so the property is asserted, not assumed.
    expect(rig.handle.dump(2).samples.map((s) => s.seq)).toEqual([0, 2, 4]);
  });

  it("…and clear() does not restart the numbering, so the discontinuity stays visible", () => {
    const rig = record([1, 2, 3].map((n) => tick(n, { edgeAlignment: RING })));
    rig.handle.clear();
    const step = applyTick(createLessonSession(lesson), tick(4, { edgeAlignment: RING }));
    rig.onTick(tick(4, { edgeAlignment: RING }), step);
    expect(rig.handle.dump().samples.map((s) => s.seq)).toEqual([3]);
  });

  it("the published shape version MOVED, because the record gained required members", () => {
    // The earlier rationale here („an additive optional field") was wrong:
    // `seq`, `edgeId` and `laneId` are required on `DriveRigSample`, not
    // optional. And the version is the only thing that tells a reader of a
    // dump „this run predates the road reference" from „the runtime published
    // nothing" — the same absent-means-what ambiguity `edgeAlignment` exists
    // to remove, one layer up. The harness prints it into the evidence log.
    const rig = record([tick(1, { edgeAlignment: RING })]);
    expect(rig.handle.dump().meta.version).toBe(2);
    expect(rig.handle.dump().meta.version).toBe(DRIVE_RIG_VERSION);
  });

  it("…and the three members that made it move are REQUIRED on every sample", () => {
    // A required member is exactly what an optional one is not: it cannot be
    // absent, so a reader never has to guess whether the field was dropped or
    // never measured. Pinned by execution, so demoting one to optional and
    // omitting it here goes red rather than type-checking away.
    const rig = record([tick(1, { edgeAlignment: RING, edgeId: null, laneId: 3 })]);
    const s = rig.handle.dump().samples[0] as unknown as Record<string, unknown>;
    for (const key of ["seq", "edgeId", "laneId"]) {
      expect({ key, present: Object.prototype.hasOwnProperty.call(s, key) }).toEqual({
        key,
        present: true,
      });
    }
    expect({ seq: s.seq, edgeId: s.edgeId, laneId: s.laneId }).toEqual({
      seq: 0,
      edgeId: null,
      laneId: 3,
    });
  });
});
