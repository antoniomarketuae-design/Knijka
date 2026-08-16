/**
 * THE RUN-OUT — „the session ended itself" on `sc-zebra-approach` L1
 * (register row B-NEW-1's third repro, driven 2026-08-16).
 *
 * WHAT THE DRIVE FOUND. Nothing ended that session early in the watchdog sense
 * — no par timer, no idle rescue, no crash pin. It ended on ROUTE-END, and
 * route-end was in the wrong place: the terminal `reachZone` completes on
 * ENTERING its acceptance ring, and the engine ended the session on that same
 * frame. So the drive stopped one whole tolerance radius SHORT of the mark the
 * author placed — the point the guidance ribbon had been pointing at the whole
 * time.
 *
 * TOLERANCE IS FORGIVENESS FOR THE TASK. IT IS NOT A RELOCATION OF THE FINISH
 * LINE. One number was doing both jobs, and the second job nobody chose:
 *
 *   · 674 authored rungs end on a `reachZone`; mean radius 10.03 m, so the
 *     mean drive was cut ten metres short of its own end (worst:
 *     `sc-fo-motorway-gap` L1, 23 m).
 *   · `sc-zebra-approach` L1 — mark (4.06, 130), radius 12 → 17 under the L1
 *     ladder. All three COMMITTED recordings ended at y = 113.0…113.1, i.e.
 *     23 m and 2–3 s past the crossing at y = 90 that the lesson exists to
 *     teach, and 17 m short of the route's own end.
 *   · AND THE LADDER RAN BACKWARDS. `toleranceScale` widens the acceptance at
 *     the LOW rungs so a beginner is not failed for stopping a few metres off;
 *     because the same number ended the drive, the kinder the rung the shorter
 *     the road. Mean terminal radius L1 12.67 m against L5 8.91 m, and on 119
 *     of 140 templates L1 lost more road than L5. On the zebra the beginner got
 *     4.6 m less street than the expert, on the same street, for the same
 *     drive.
 *
 * WHAT THIS FILE PINS, and what it deliberately does not. The objective is
 * still ticked on EXACTLY the frame it was ticked before — that is asserted
 * here by pinned second and metre, because a fix that moved the CREDIT instead
 * of the ENDING would be the same defect wearing the opposite sign. Only the
 * drive is longer, and only as far as the mark.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LessonSpec } from "../../contracts";
import type { SimTick } from "../../rules";
import { recordScZebraApproachDrive, type ScZebraApproachTraceName } from "../../traces/scZebraApproach";
import { applyTick, createLessonSession } from "../engine";
import {
  FINISH_STANDSTILL_KMH,
  ROUTE_RUNOUT_ARRIVE_M,
  ROUTE_RUNOUT_MAX_S,
  routeEndMark,
} from "../finish";
import { parseObjectiveParams } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import { SC_ZEBRA_APPROACH } from "../scenario/templates-flow";
import type { ScenarioLevel } from "../scenario/types";
import type { LessonSessionState, ObjectiveParams } from "../types";
import { makeTick, tickWithEvents } from "./fixtures";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const WORLD_DIR = path.join(REPO_ROOT, "content", "world");

// ---------------------------------------------------------------------------
// 1. The founder's lesson, on its own committed recordings
// ---------------------------------------------------------------------------

interface DriveEnd {
  endY: number;
  endSpeedKmh: number;
  lastObjectiveAtSec: number | null;
  lastObjectiveAtY: number | null;
}

function driveRecorded(name: ScZebraApproachTraceName, level: ScenarioLevel): DriveEnd {
  const lesson = compileScenario(SC_ZEBRA_APPROACH, level);
  let session: LessonSessionState = createLessonSession(lesson);
  const out: DriveEnd = {
    endY: NaN,
    endSpeedKmh: NaN,
    lastObjectiveAtSec: null,
    lastObjectiveAtY: null,
  };
  const district = JSON.parse(readFileSync(path.join(WORLD_DIR, "zb-v1.json"), "utf-8")) as unknown;
  recordScZebraApproachDrive(district, name, {
    onTick: (tick: SimTick) => {
      const before = session.phase;
      const r = applyTick(session, tick);
      session = r.state;
      const last = session.objectives[session.objectives.length - 1];
      if (out.lastObjectiveAtSec === null && last.status === "done") {
        out.lastObjectiveAtSec = last.completedAtSec;
        out.lastObjectiveAtY = tick.position.y;
      }
      if (before === "driving" && session.phase !== "driving" && Number.isNaN(out.endY)) {
        out.endY = tick.position.y;
        out.endSpeedKmh = Math.abs(tick.speedKmh);
      }
    },
  });
  return out;
}

/** The authored end of `sc-zebra-approach`: objective 2's own mark. */
const ZEBRA_MARK_Y = 130;
/** The crossing the lesson exists to teach (`zb-x-1`, content/world/zb-v1). */
const ZEBRA_CROSSING_Y = 90;
/** Where every drive used to stop — measured, all three recordings, L1. */
const OLD_END_Y = 113.1;

describe("sc-zebra-approach — the drive no longer stops at the edge of the tolerance", () => {
  const RECORDINGS: ScZebraApproachTraceName[] = [
    "shadow-correct" as ScZebraApproachTraceName,
    "mistake-not-yielded" as ScZebraApproachTraceName,
    "mistake-too-fast" as ScZebraApproachTraceName,
  ];

  for (const name of RECORDINGS) {
    it(`${name}: ends at the route's end or at a standstill — never mid-roll short of it`, () => {
      const d = driveRecorded(name, 1);
      expect(Number.isNaN(d.endY)).toBe(false);

      // THE OLD BEHAVIOUR, named so it cannot come back quietly: all three
      // stopped at y = 113.1 while still rolling at 13–25 km/h, 17 m short of
      // the mark. Either half of this assertion fails on it.
      const arrived = d.endY >= ZEBRA_MARK_Y - ROUTE_RUNOUT_ARRIVE_M;
      const atRest = d.endSpeedKmh <= FINISH_STANDSTILL_KMH;
      expect(arrived || atRest).toBe(true);
      expect(d.endY).toBeGreaterThan(OLD_END_Y + 1);
    });
  }

  it("the drive that FAILED the lesson gets the most road back, not the least", () => {
    // `mistake-not-yielded` is the lesson's own taught fault: it drove through
    // an occupied zebra at y = 90.0 and the session closed 3.0 s later at
    // y = 113.1 — 23 m of road between the −10 and the result screen. That is
    // the founder's frame. The recorded drive comes to rest at y = 120.
    const d = driveRecorded("mistake-not-yielded" as ScZebraApproachTraceName, 1);
    expect(d.endY).toBeGreaterThan(119);
    expect(d.endY - ZEBRA_CROSSING_Y).toBeGreaterThan(29);
  });

  it("the CREDIT did not move: the last task is still ticked at the same second and metre", () => {
    // The fix must lengthen the DRIVE and nothing else. These are the pinned
    // pre-fix measurements, unchanged by it — a fix that moved the tick would
    // be handing out (or withholding) a task nobody re-earned.
    const shadow = driveRecorded("shadow-correct" as ScZebraApproachTraceName, 1);
    expect(shadow.lastObjectiveAtSec).toBeCloseTo(26.95, 1);
    expect(shadow.lastObjectiveAtY).toBeCloseTo(113.1, 0);

    const failed = driveRecorded("mistake-not-yielded" as ScZebraApproachTraceName, 1);
    expect(failed.lastObjectiveAtSec).toBeCloseTo(14.43, 1);
    expect(failed.lastObjectiveAtY).toBeCloseTo(113.1, 0);
  });
});

// ---------------------------------------------------------------------------
// 2. The catalogue invariant — and the ladder that ran backwards
// ---------------------------------------------------------------------------

interface Pt {
  x: number;
  y: number;
}

const SPAWNS = new Map<string, Pt>();
for (const file of readdirSync(WORLD_DIR)) {
  if (!file.endsWith(".json")) continue;
  const j = JSON.parse(readFileSync(path.join(WORLD_DIR, file), "utf-8")) as {
    spawnPoints?: Array<{ id: string; x: number; y: number }>;
  };
  for (const p of j.spawnPoints ?? []) SPAWNS.set(p.id, { x: p.x, y: p.y });
}

function spawnOf(lesson: LessonSpec): Pt {
  if (lesson.spawn.position) return { ...lesson.spawn.position };
  const p = lesson.spawn.pointId ? SPAWNS.get(lesson.spawn.pointId) : undefined;
  if (p === undefined) throw new Error(`unknown spawn "${lesson.spawn.pointId}"`);
  return p;
}

/**
 * Walk spawn → every waypoint → 60 m beyond the last, at a steady 40 km/h.
 * Only routes made ENTIRELY of `reachZone` are driven: this driver holds no
 * stop line, works no bay and turns no wheel, so on any other route the chain
 * stalls and the drive ends through the rescue gates instead — a different
 * mechanism, already covered by the completability battery.
 */
function driveWaypoints(lesson: LessonSpec, params: ObjectiveParams[]): { endX: number; endY: number } | null {
  const pts: Pt[] = [spawnOf(lesson)];
  for (const p of params) {
    if (p.kind !== "reachZone") return null;
    pts.push({ x: p.x, y: p.y });
  }
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  const m = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  pts.push({ x: b.x + ((b.x - a.x) / m) * 60, y: b.y + ((b.y - a.y) / m) * 60 });

  const DT = 0.1;
  const MPS = 40 / 3.6;
  let session: LessonSessionState = createLessonSession(lesson);
  let t = 0;
  for (let i = 1; i < pts.length; i++) {
    const from = pts[i - 1];
    const to = pts[i];
    const legM = Math.hypot(to.x - from.x, to.y - from.y);
    if (legM < 1e-6) continue;
    const ux = (to.x - from.x) / legM;
    const uy = (to.y - from.y) / legM;
    for (let s = 0; s <= legM; s += MPS * DT) {
      const pos = { x: from.x + ux * s, y: from.y + uy * s };
      session = applyTick(
        session,
        makeTick({ t, speedKmh: 40, maxSpeedKmh: 130, position: pos, headingDeg: (Math.atan2(ux, uy) * 180) / Math.PI }),
      ).state;
      t += DT;
      if (session.phase !== "driving") return { endX: pos.x, endY: pos.y };
    }
  }
  // Never ended inside the driven polyline. Returned rather than skipped: a
  // silently dropped row is how a census lies to the person reading it, and
  // this one already did it once (see the NaN note below).
  return null;
}

describe("catalogue — a completed route ends AT its end, on every rung", () => {
  interface Row {
    id: string;
    level: number;
    shortM: number;
  }
  const rows: Row[] = [];
  const neverEnded: string[] = [];

  for (const spec of SCENARIO_TEMPLATES) {
    for (const rung of spec.levels) {
      const lesson = compileScenario(spec, rung.level);
      const params = lesson.objectives.map(parseObjectiveParams);
      if (params.length < 2) continue;
      const zones = params.filter(
        (p): p is Extract<ObjectiveParams, { kind: "reachZone" }> => p.kind === "reachZone",
      );
      // Whole-route reachZone only: this driver holds no line, works no bay and
      // turns no wheel, so anything else stalls the chain and ends through the
      // rescue gates — a different mechanism, and the battery's business.
      if (zones.length !== params.length) continue;
      // …and it drives a flat 40 km/h, so a waypoint demanding less would never
      // latch its cap. Those rungs are simply not measurable from here.
      if (zones.some((p) => p.maxSpeedKmh !== undefined && p.maxSpeedKmh < 40)) continue;
      const mark = routeEndMark(params);
      if (mark === null) continue;
      const end = driveWaypoints(lesson, params);
      if (end === null) {
        neverEnded.push(`${spec.id}@L${rung.level}`);
        continue;
      }
      rows.push({
        id: `${spec.id}@L${rung.level}`,
        level: rung.level,
        shortM: Math.hypot(end.endX - mark.x, end.endY - mark.y),
      });
    }
  }

  it("drove a meaningful slice of the catalogue, and MEASURED it", () => {
    // Both halves are load-bearing. The first draft of this census read
    // `end.x` off a `{endX, endY}` — every distance came out NaN, `NaN > 3.6`
    // is false, and the sweep reported a clean catalogue against the very
    // engine it was written to convict. A count alone would not have caught
    // that; a finite metric would.
    expect(rows.length).toBeGreaterThan(60);
    expect(rows.filter((r) => !Number.isFinite(r.shortM))).toEqual([]);
    // …and the run-out did not turn any of them into a drive that never ends.
    // The 60 m of road past the mark is far more than any run-out needs, so a
    // name here means a route that cannot close, which is the worse bug.
    expect(neverEnded).toEqual([]);
  });

  it("no rung stops short of its own mark by more than the arrival tolerance", () => {
    // BEFORE: every one of these stopped a full terminal radius short — 4 to
    // 23 m, mean 10.03 m over the 674 rungs that end on a reachZone.
    const short = rows.filter((r) => r.shortM > ROUTE_RUNOUT_ARRIVE_M + 4 / 3.6);
    expect(short.map((r) => `${r.id} ${r.shortM.toFixed(1)} m short`)).toEqual([]);
  });

  it("the tolerance ladder no longer shortens the beginner's drive", () => {
    // THE INVERSION, which is the part nobody chose: L1's wider acceptance used
    // to end the drive EARLIER than L5's narrow one on 119 of 140 templates.
    // With the run-out both rungs finish at the same place — the mark.
    const byId = new Map<string, Map<number, number>>();
    for (const r of rows) {
      const id = r.id.slice(0, r.id.lastIndexOf("@"));
      const m = byId.get(id) ?? new Map<number, number>();
      m.set(r.level, r.shortM);
      byId.set(id, m);
    }
    const inverted: string[] = [];
    for (const [id, m] of byId) {
      const l1 = m.get(1);
      const l5 = m.get(5);
      if (l1 !== undefined && l5 !== undefined && l1 > l5 + 0.5) {
        inverted.push(`${id}: L1 stops ${l1.toFixed(1)} m short, L5 only ${l5.toFixed(1)} m`);
      }
    }
    expect(inverted).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. The three exits, and the freeze — a drive must still always END
// ---------------------------------------------------------------------------

/** Two waypoints on the x axis; the route ends at x = 100 with a radius-10 ring. */
const RUNOUT_LESSON: LessonSpec = {
  id: "t-runout",
  order: 99,
  titleBg: "Тест на дотичването",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 90 },
  preDrive: false,
  objectives: [
    { id: "o-1", titleBg: "Първа точка", kind: "reachZone", params: { x: 40, y: 0, radiusM: 8 } },
    { id: "o-2", titleBg: "Край на маршрута", kind: "reachZone", params: { x: 100, y: 0, radiusM: 10 } },
  ],
};

/** Drive along x, one frame per entry, at a constant speed. */
function driveX(
  session: LessonSessionState,
  fromT: number,
  xs: number[],
  speedKmh: number,
  dt = 0.5,
  events: SimTick["events"] = [],
): { state: LessonSessionState; endedAtX: number | null } {
  let s = session;
  let t = fromT;
  let endedAtX: number | null = null;
  for (const x of xs) {
    const before = s.phase;
    s = applyTick(s, tickWithEvents(t, [...events], { speedKmh, position: { x, y: 0 } })).state;
    if (before === "driving" && s.phase !== "driving" && endedAtX === null) endedAtX = x;
    t += dt;
  }
  return { state: s, endedAtX };
}

describe("the run-out's three exits", () => {
  it("ARRIVED — a car driving through ends at the mark, not at the ring edge", () => {
    const a = driveX(createLessonSession(RUNOUT_LESSON), 0, [0, 20, 40, 70, 91], 40);
    expect(a.state.objectives[1].status).toBe("done"); // ticked at the ring edge…
    expect(a.state.phase).toBe("driving"); // …and the drive continues
    const b = driveX(a.state, 3, [95, 99, 103], 40);
    expect(b.state.phase).toBe("completed");
    expect(b.endedAtX).not.toBeNull();
    expect(b.endedAtX!).toBeGreaterThanOrEqual(99);
  });

  it("AT REST — a car that finishes and stops ends where it stopped", () => {
    const a = driveX(createLessonSession(RUNOUT_LESSON), 0, [0, 20, 40, 70, 91], 40);
    expect(a.state.phase).toBe("driving");
    const b = driveX(a.state, 3, [91], 0);
    expect(b.state.phase).toBe("completed");
    expect(b.endedAtX).toBe(91);
  });

  it("SPENT — a car that crawls nowhere is still let out, at the ceiling", () => {
    let s = driveX(createLessonSession(RUNOUT_LESSON), 0, [0, 20, 40, 70, 91], 40).state;
    expect(s.phase).toBe("driving");
    // Rolling at 6 km/h but going nowhere (the pose does not advance): neither
    // arrival nor standstill can fire, so only the ceiling can end this.
    const armedAtSec = s.lastT;
    expect(s.routeRunOut).toBeDefined();
    let t = armedAtSec + 0.5;
    let ended: number | null = null;
    for (let i = 0; i < 200 && ended === null; i++) {
      const before = s.phase;
      s = applyTick(s, makeTick({ t, speedKmh: 6, position: { x: 91, y: 0 } })).state;
      if (before === "driving" && s.phase !== "driving") ended = t;
      t += 0.5;
    }
    expect(ended).not.toBeNull();
    // The arming frame is itself a run-out frame (the car was moving through
    // the ring), so the ceiling lands within one frame of the constant.
    const spentSec = ended! - armedAtSec;
    expect(Math.abs(spentSec - ROUTE_RUNOUT_MAX_S)).toBeLessThanOrEqual(0.5);
  });

  it("FROZEN — a lawful wait at the very end of the route does not end the drive", () => {
    // B15's rule, applied to the run-out for the same reason it applies to the
    // finish gates: the student is stopped because a pedestrian is on the
    // crossing. Closing his drive here would convict him of finishing while he
    // is doing the last thing the lesson asked for.
    const a = driveX(createLessonSession(RUNOUT_LESSON), 0, [0, 20, 40, 70, 91], 40);
    expect(a.state.phase).toBe("driving");

    const ped: SimTick["events"] = [
      { kind: "crossingZoneEntered", crossingId: "x-1", pedestrianOnCrossing: true },
    ];
    // Stopped, pedestrian latched: 30 s of standstill and the drive lives on.
    let s = a.state;
    let t = 3;
    for (let i = 0; i < 60; i++) {
      s = applyTick(s, tickWithEvents(t, i === 0 ? ped : [], { speedKmh: 0, position: { x: 91, y: 0 } })).state;
      t += 0.5;
    }
    expect(s.yieldWait?.holding).toBe(true);
    expect(s.phase).toBe("driving");

    // She steps off the paint; the same standstill now ends the drive.
    s = applyTick(
      s,
      tickWithEvents(t, [{ kind: "crossingZoneExited", crossingId: "x-1" }], {
        speedKmh: 0,
        position: { x: 91, y: 0 },
      }),
    ).state;
    expect(s.phase).toBe("completed");
  });

  it("a route that ends NOWHERE terminates on the chain exactly as before", () => {
    // `routeEndMark` returns null for a placeless terminal, so there is nothing
    // to run out to and the old branch fires unchanged.
    const distanceLesson: LessonSpec = {
      ...RUNOUT_LESSON,
      id: "t-runout-placeless",
      objectives: [
        { id: "o-1", titleBg: "Първа точка", kind: "reachZone", params: { x: 40, y: 0, radiusM: 8 } },
        { id: "o-2", titleBg: "Измини 60 метра", kind: "driveDistance", params: { meters: 60 } },
      ],
    };
    expect(routeEndMark(distanceLesson.objectives.map(parseObjectiveParams))).toBeNull();
    // The odometer starts counting when the objective activates (x = 40), so
    // the 60 m falls due at x = 100 — the drive ends on that frame, at speed,
    // with no run-out anywhere in the state.
    const r = driveX(createLessonSession(distanceLesson), 0, [0, 20, 40, 70, 91, 100], 40);
    expect(r.state.phase).toBe("completed");
    expect(r.state.routeRunOut).toBeUndefined();
  });
});
