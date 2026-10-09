/**
 * sc-ln-obstacle-meeting:114706e0, clause 6 — «the outcome is not a function of
 * the driving». THE ONCOMING LANE HOLDS WHAT THE BRIEFING ANNOUNCED.
 *
 * The briefing counts the traffic: «Насреща идват ДВЕ коли» (instruction 4),
 * «Изчакай и двете да отминат … Чак когато насрещната лента е празна докрай:
 * ляв мигач, оглед и една спокойна дъга» (instruction 5). FR-B5-RETURN
 * (traffic/staged.ts) used to send each of those two cars round again ~12.7 s
 * after it left the street, 85-87 m dead ahead, and FR-B5-FACING held it
 * off-scene while the student sat facing it — so it came back THE INSTANT HE
 * MOVED OFF. The repair stages both cars `oneRun` (templates-lanes2.ts
 * LNOM_ONE_RUN; traffic/types.ts StagedVehicleSpec.oneRun).
 *
 * EVERY DRIVE HERE GOES THROUGH THE LIVE RUNG CHAIN (liveChainReplay: the
 * compiled rung, its seed, LessonScene's stack on the session grid). The drive
 * (lnomQueueDrive.ts) is a careful one: the shadow's approach, a stop in the
 * own lane at the wait ring, a wait of W seconds after the oncoming lane
 * EMPTIED (the second car past his nose — measured on the drive, not assumed),
 * then ONE look and the shadow's arc round the parked row. It never looks
 * again: it is the student who believed the briefing.
 *
 *   1. W = 5 / 12 / 25 s, every rung, two approach paces: passes, 0 т., and
 *      meets only the two cars the briefing announced.
 *   2. THE COMMITTED WINDOW, swept: whatever W, no car is released after he
 *      has moved off — in particular none after his centre crossed the axis —
 *      on three approach paces (the slowest puts the pre-repair window at
 *      3.5-5.5 s after the lane emptied, the rig's «4-9 s»).
 *   3. CONTROL (non-vacuity): the same drives on the PRE-REPAIR staging (the
 *      template with `oneRun` stripped — FR-B5-RETURN as it still is for every
 *      other lesson) DO meet a third car: a head-on COLLISION at W = 25, and a
 *      car released after the commit at W = 4 on the slow approach.
 *   4. The lesson's own demos, replayed live at every rung, still commit and
 *      are billed for their mistakes (pull-out COLLISION, squeeze
 *      CENTER_LINE_TOUCHED), and the shadow still passes clean.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StagedEventSpec } from "../../../contracts";
import { parseScenarioTrace } from "../../../traces/parse";
import type { ScenarioTrace } from "../../../traces/types";
import { compileScenario } from "../compile";
import { SC_LN_OBSTACLE_MEETING } from "../templates-lanes2";
import type { ScenarioLevel, ScenarioSpec } from "../types";
import { liveChainReplay } from "./liveChainReplay";
import { driveLnomCareful, type LnomDriveOutcome } from "./lnomQueueDrive";
import { loadDistrict } from "./witnessLiveRung";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const RUNGS = [1, 2, 3, 4, 5] as const;
/** Approach paces, km/h: the shadow's own (38) and two slower careful ones —
 *  car #1 is clockwork from his first movement while car #2 is synced to his
 *  arrival, so the pace moves the lane-empty instant against car #1's clock. */
const SHADOW_KMH = 38;
const SLOW_KMH = 20;
const SLOWEST_KMH = 15;

/** The pre-repair staging: the shipped template with `oneRun` stripped. */
const PRE_REPAIR: ScenarioSpec = {
  ...SC_LN_OBSTACLE_MEETING,
  staged: (SC_LN_OBSTACLE_MEETING.staged ?? []).map((e) => {
    const copy = { ...(e as StagedEventSpec & { oneRun?: boolean }) };
    delete copy.oneRun;
    return copy;
  }) as ScenarioSpec["staged"],
};

/** Where he stops and when the lane empties, for one rung × pace × staging —
 *  measured on a reference drive that waits long enough for both cars. */
const refCache = new Map<string, { stoppedAt: number; laneEmptyAt: number }>();
function reference(level: ScenarioLevel, kmh: number, spec: ScenarioSpec) {
  const key = `${level}/${kmh}/${spec === PRE_REPAIR ? "pre" : "tree"}`;
  let r = refCache.get(key);
  if (!r) {
    const o = driveLnomCareful(level, 20, kmh, spec);
    if (o.stoppedAt < 0 || o.laneEmptyAt === null) throw new Error(`${key}: no stop / the lane never emptied`);
    r = { stoppedAt: o.stoppedAt, laneEmptyAt: o.laneEmptyAt };
    refCache.set(key, r);
  }
  return r;
}

/** The careful drive that moves off `waitSec` after the oncoming lane emptied. */
function driveAfterEmpty(
  level: ScenarioLevel,
  kmh: number,
  waitSec: number,
  spec: ScenarioSpec = SC_LN_OBSTACLE_MEETING,
): LnomDriveOutcome & { emptyAt: number } {
  const ref = reference(level, kmh, spec);
  const o = driveLnomCareful(level, ref.laneEmptyAt + waitSec - ref.stoppedAt, kmh, spec);
  return { ...o, emptyAt: ref.laneEmptyAt };
}

/** Arrivals at or after the student moved off — cars the briefing never announced. */
function lateArrivals(o: LnomDriveOutcome) {
  return o.arrivals.filter((a) => o.movedOffAt !== null && a.t >= o.movedOffAt);
}

describe("sc-ln-obstacle-meeting:114706e0 — the briefing counts two oncoming cars, and the staging is two", () => {
  it("instruction 4 says ДВЕ, and the template stages exactly two moving oncoming cars, each run once", () => {
    const text = SC_LN_OBSTACLE_MEETING.instructionsBg.map((i) => i.textBg).join(" ");
    expect(text).toContain("Насреща идват ДВЕ коли");
    const staged = (SC_LN_OBSTACLE_MEETING.staged ?? []) as StagedEventSpec[];
    let moving = 0;
    for (const e of staged) {
      if (e.kind === "oncomingStream") moving += e.count;
      else if (e.kind === "narrowMeeting") moving += 1;
    }
    expect(moving).toBe(2);
    // …and every rung compiles the same pair (no rung adds a third).
    for (const level of RUNGS) {
      const kinds = (compileScenario(SC_LN_OBSTACLE_MEETING, level).stagedEvents ?? []).map((e) => e.kind);
      expect(kinds.sort()).toEqual(["narrowMeeting", "oncomingStream"]);
    }
  });
});

describe("sc-ln-obstacle-meeting:114706e0 — a careful drive that waits 5 / 12 / 25 s after the lane empties", () => {
  for (const level of RUNGS) {
    for (const kmh of [SHADOW_KMH, SLOW_KMH]) {
      for (const waitSec of [5, 12, 25]) {
        it(`L${level}, ${kmh} км/ч approach, moves off ${waitSec} s after the lane emptied: passes, 0 т., and meets only the two announced cars`, () => {
          const o = driveAfterEmpty(level, kmh, waitSec);
          // Admission: the drive did what this title says.
          expect(o.stoppedAt).toBeGreaterThan(0);
          expect(o.movedOffAt).not.toBeNull();
          expect(o.movedOffAt! - o.emptyAt).toBeGreaterThan(waitSec - 0.1);
          expect(o.movedOffAt! - o.emptyAt).toBeLessThan(waitSec + 0.6);
          expect(o.committedAt, "he does go round the parked row").not.toBeNull();
          // What he met: the two cars staged at the start, and nothing after.
          expect(o.arrivals.length, JSON.stringify(o.arrivals)).toBe(2);
          for (const a of o.arrivals) {
            expect(a.reentry).toBe(false);
            expect(a.t).toBeLessThan(1);
          }
          expect(lateArrivals(o)).toEqual([]);
          expect(o.minAheadWhileCommittedM).toBe(Infinity);
          // The sheet.
          const r = o.replay;
          expect(r.violationCodes).toEqual([]);
          expect(r.commendationCodes).toContain("YIELDED_TO_PRIORITY");
          expect(r.session.phase).toBe("completed");
          expect(r.result.objectives.every((x) => x.done)).toBe(true);
          expect(r.result.score).toBe(0);
          expect(r.result.passed).toBe(true);
        });
      }
    }
  }
});

describe("sc-ln-obstacle-meeting:114706e0 — no car is ever released into a student who has committed", () => {
  // Every whole second 0…30 after the lane emptied, plus the half-seconds of
  // the slowest approach's pre-repair window (3.5-5.5 s) and the rig's «4-9 s».
  const sweep = (kmh: number): number[] => {
    const w: number[] = [];
    for (let s = 0; s <= 30; s += 1) w.push(s);
    if (kmh === SLOWEST_KMH) for (let s = 3.5; s <= 9.5; s += 1) w.push(s);
    return w.sort((a, b) => a - b);
  };
  for (const level of [1, 3] as const) {
    for (const kmh of [SHADOW_KMH, SLOW_KMH, SLOWEST_KMH]) {
      it(`L${level}, ${kmh} км/ч approach: for every move-off 0-30 s after the lane emptied, nothing appears after he moved off`, () => {
        const bad: string[] = [];
        for (const w of sweep(kmh)) {
          const o = driveAfterEmpty(level, kmh, w);
          const late = lateArrivals(o);
          const afterCommit = late.filter((a) => o.committedAt !== null && a.t >= o.committedAt);
          if (late.length > 0 || o.arrivals.length !== 2 || o.replay.violationCodes.length > 0) {
            bad.push(
              `W=${w}: moved ${o.movedOffAt?.toFixed(2)} committed ${o.committedAt?.toFixed(2)} ` +
                `arrivals ${o.arrivals.length}, after move-off ${late.length}, after commit ${afterCommit.length}, ` +
                `billed [${o.replay.violationCodes.join(",")}]`,
            );
          }
        }
        expect(bad).toEqual([]);
      });
    }
  }
});

describe("sc-ln-obstacle-meeting:114706e0 — CONTROL: the same drives on the pre-repair staging meet a car the briefing never announced", () => {
  it("L1, shadow pace, W = 25 s: car #1 comes round at its hold the instant he moves off and he drives into it", () => {
    const o = driveAfterEmpty(1, SHADOW_KMH, 25, PRE_REPAIR);
    const late = lateArrivals(o);
    expect(late.length).toBeGreaterThan(0);
    expect(late[0].reentry).toBe(true);
    expect(o.replay.violationCodes).toContain("COLLISION");
    expect(o.replay.result.passed).toBe(false);
  });
  it("L1, slowest pace, W = 4 s: a car is released AFTER his centre crossed the axis", () => {
    const o = driveAfterEmpty(1, SLOWEST_KMH, 4, PRE_REPAIR);
    const afterCommit = lateArrivals(o).filter((a) => a.t >= o.committedAt!);
    expect(afterCommit.length).toBeGreaterThan(0);
    expect(afterCommit[0].player.x).toBeLessThan(0.8);
  });
});

function loadCommittedTrace(name: string): ScenarioTrace {
  const raw = JSON.parse(
    readFileSync(
      path.join(REPO_ROOT, "content", "traces", SC_LN_OBSTACLE_MEETING.id, `${name}.trace.json`),
      "utf-8",
    ),
  ) as unknown;
  const t = parseScenarioTrace(raw);
  if (!t) throw new Error(`${name}: committed trace does not parse`);
  return t;
}

describe("sc-ln-obstacle-meeting:114706e0 — the lesson's own demos, live at every rung, still commit and are billed", () => {
  const district = loadDistrict(SC_LN_OBSTACLE_MEETING.map.districtId);
  const shadow = loadCommittedTrace("shadow-correct");
  const pullOut = loadCommittedTrace("mistake-pull-out");
  const squeeze = loadCommittedTrace("mistake-squeeze");
  for (const level of RUNGS) {
    it(`L${level}: shadow clean · pull-out COLLISION · squeeze CENTER_LINE_TOUCHED`, () => {
      const lesson = compileScenario(SC_LN_OBSTACLE_MEETING, level);
      const s = liveChainReplay({ lesson, districtRaw: district, trace: shadow, holdAfterSec: 2 });
      expect(s.violationCodes).toEqual([]);
      expect(s.result.passed).toBe(true);
      const p = liveChainReplay({ lesson, districtRaw: district, trace: pullOut, holdAfterSec: 2 });
      expect(p.violationCodes).toContain("COLLISION");
      expect(p.result.passed).toBe(false);
      const q = liveChainReplay({ lesson, districtRaw: district, trace: squeeze, holdAfterSec: 2 });
      const qCodes = [...q.violationCodes, ...q.teachMomentCodes, ...(q.result.lessonMistakes ?? []).map((m) => m.code)];
      expect(qCodes).toContain("CENTER_LINE_TOUCHED");
      expect(q.result.passed).toBe(false);
    });
  }
});
