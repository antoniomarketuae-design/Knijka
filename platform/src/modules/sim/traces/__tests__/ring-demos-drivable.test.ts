/**
 * catalogue-demo-curvature:dae908c7, family curvring — EVERY DEMO OF THE SIX
 * ROUNDABOUT LESSONS IS A DRIVE THE PRODUCT CAR CAN PERFORM, and each still
 * shows exactly what it is there to show.
 *
 * THE ROW: the committed demos turned tighter than the product car can (the
 * census: down to 1.11 m of body-centre radius over 1 m of travel, against a
 * car whose tightest circle is 3.955 m kinematic and ≈ 4.17 m physics). They
 * had been typed in as waypoints — the ring as 10° chords, entries and exits as
 * corners the kinematic recorder turns on the spot — so the student was shown a
 * line no car can follow. They are now cut from one continuous curvature
 * programme each (../ringDrive, ../ringMini). WHAT IS PINNED, on the COMMITTED
 * traces (what ships), each red on the old ones:
 *
 *  1. THE PAINT the yielding demos stop at is the district's own: the south
 *     mouth's give-way bar, from the world builder's paint expression, is
 *     where ../ringMini and ../scRbLaneChoice say it is.
 *  2. CURVATURE: over every 1 m of travel no demo turns tighter than
 *     FAMILY_FLOOR_M (4.6 m — the curvdepth family's floor,
 *     traces/drivablePath.ts DRIVABLE_MIN_CENTRE_RADIUS_M at the landing
 *     HEAD: 16 % over the census limit, 10 % over the physics car), and no
 *     correct demo tighter than CORRECT_FLOOR_M.
 *  3. CONTINUITY: the heading never jumps (≤ 2.5° between 20 Hz samples) and
 *     the ghost never skips ground (no step longer than its own speed allows).
 *  4. STEERABILITY: the same centre path driven by a no-slip car (the rear axle
 *     rolls along the body — ./ringProduct bicycleOnPath) never needs more
 *     road-wheel than STEER_MAX_ANGLE.
 *  5. CLEARANCE ≥ 0.25 m from the island's wall and every building, as the
 *     product's colliders see them (./ringProduct), for the recorded pose AND
 *     the bicycle pose; and ≥ 0.25 m inside the kerb, with ONE measured
 *     exception (KERB_EXCEPTIONS) — a mistake whose fault cannot be committed
 *     on this ring with the body on the tarmac.
 *  6. THE LIVE RUNG CHAIN (../../lessons/scenario/__tests__/liveChainReplay —
 *     compileScenario at every authored rung with the rung's own cast): every
 *     correct demo completes every objective, 0 т., no violation, ИЗДЪРЖАН;
 *     every mistake demo names only its own codeRefs, all of them on the
 *     practice rung L1, and never touches ambient traffic.
 *  7. THE MEASURED WINDOWS the scripts are centred in (the waits and paces
 *     their headers cite): both inside edges of every window still grade the
 *     way the authored value does, on every rung.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StagedEventSpec } from "../../contracts";
import { compileScenario } from "../../lessons/scenario/compile";
import { liveChainReplay } from "../../lessons/scenario/__tests__/liveChainReplay";
import {
  districtRaw,
  ROUNDABOUT_FAMILY,
  rungsOf,
  type FamilyDemo,
} from "../../lessons/scenario/__tests__/rbFamilyCensus";
import { SC_ROUNDABOUT_ENTRY } from "../../lessons/scenario/templates-flow";
import { SC_RB_BUSY_GAP, SC_RB_EXIT_SIGNAL, SC_RB_LANE_CHOICE } from "../../lessons/scenario/templates-roundabout";
import { SC_RB_PED_EXIT } from "../../lessons/scenario/templates-roundabout2";
import type { ScenarioSpec } from "../../lessons/scenario/types";
import { THROUGH_GATE_BEFORE_LINE_M } from "../../scene/guidanceRoute";
import { CHASSIS_HALF_EXTENTS, STEER_MAX_ANGLE, STEER_SPEED, WHEELBASE_M } from "../../vehicle/tuning";
import { analyzeNetwork, STOP_LINE_BEYOND_CUT_M } from "../../world/builders/network";
import { assertDistrict } from "../../world/types";
import { DRIVABLE_MIN_CENTRE_RADIUS_M, RECORDER_STOP_SHORT_M } from "../drivablePath";
import { parseScenarioTrace } from "../parse";
import { recordScriptedDrive, type DriveScript } from "../recorder";
import { MINI_GIVE_WAY_BAR_Y, MINI_LANE_X } from "../ringMini";
import * as RBG from "../scRbBusyGap";
import * as RBX from "../scRbExitSignal";
import * as RBP from "../scRbPedExit";
import * as RB2 from "../scRbLaneChoice";
import * as RBE from "../scRoundaboutEntry";
import type { ScenarioTrace } from "../types";
import { KINEMATIC_CENTRE_RADIUS_M, windowedMinRadius } from "./demoCurvature";
import { bicycleOnPath, ringStaticBodies, type RingStaticBodies } from "./ringProduct";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

/** The family floor, m — the same number the curvdepth family's kit holds every
 *  drivable demo to (traces/drivablePath.ts DRIVABLE_MIN_CENTRE_RADIUS_M). */
const FAMILY_FLOOR_M = DRIVABLE_MIN_CENTRE_RADIUS_M;
/** A correct demo is the line an instructor would show. The family's exits
 *  turn on 9 m; the tightest correct curve is sc-rb-busy-gap's entry, 8 m,
 *  because its graded «Спри на линията» disc stands the car 11 m closer to the
 *  ring than the paint does (../ringMini MINI_ENTRY_FROM_MOUTH). */
const CORRECT_FLOOR_M = 7.9;
const MIN_CLEARANCE_M = 0.25;
const MAX_HEADING_STEP_DEG = 2.5;

/**
 * THE ONE KERB EXCEPTION, measured. sc-rb-circulate-priority's «Колебливо
 * криволичене в пръстена» is billed POOR_LANE_KEEPING, which needs the centre
 * more than 3.25 m off the lane's centre for 3 s. On rb-mini-v1 the ring's one
 * 8.125 m lane is centred on r = 18 and its outer kerb's foot is at r = 21.8,
 * so a centre at r ≥ 21.25 — the least the fault needs — already puts the
 * body's outer side (half-width 0.85 m) 0.3 m over the kerb. The demo rides
 * r = 21.5: the fault, and no more. A lesson-design finding, reported; the
 * island's WALL keeps its full clearance on this drive as on every other.
 */
const KERB_EXCEPTIONS: Readonly<Record<string, { maxOverM: number }>> = {
  "sc-rb-circulate-priority/mistake-wandering-line": { maxOverM: 0.7 },
};

/**
 * What a mistake demo names on a rung beyond its codeRefs — measured, and the
 * same at the base the row was filed at (2e9268f): on sc-rb-ped-exit's L5 a
 * SECOND, sprinting crosser is staged (stagedAdd), and the demo that drives
 * over the zebra without yielding strikes it (COLLISION:pedestrian). Reported
 * to the integrator; not this row's.
 */
const RUNG_EXTRAS: Readonly<Record<string, Readonly<Record<number, readonly string[]>>>> = {
  "sc-rb-ped-exit/mistake-exit-through-ped": { 5: ["COLLISION"] },
};

const keyOf = (d: FamilyDemo) => `${d.spec.id}/${d.demo}`;
const committedTrace = (d: FamilyDemo): ScenarioTrace => {
  const file = path.join(REPO_ROOT, "content", "traces", d.spec.id, `${d.demo}.trace.json`);
  const t = parseScenarioTrace(JSON.parse(readFileSync(file, "utf-8")));
  if (t === null) throw new Error(`${file}: unparseable`);
  return t;
};

const bodiesCache = new Map<string, RingStaticBodies>();
const bodiesOf = (districtId: string): RingStaticBodies => {
  let b = bodiesCache.get(districtId);
  if (b === undefined) bodiesCache.set(districtId, (b = ringStaticBodies(districtRaw(districtId))));
  return b;
};

/** Distance from the ring centre to the south mouth's give-way bar, by the painter. */
function southBarY(districtId: string): number {
  const district = assertDistrict(districtRaw(districtId));
  const net = analyzeNetwork(district);
  const rb = district.roundabouts[0];
  const ring = new Set(rb.edgeIds);
  let best: { x: number; y: number } | null = null;
  for (const e of district.roads.edges) {
    if (!ring.has(e.id)) continue;
    for (const nodeId of [e.from, e.to]) {
      for (const ap of net.nodes.get(nodeId)?.approaches ?? []) {
        if (!ap.incoming || ring.has(ap.edgeId)) continue;
        const x = ap.cut[0] + ap.cutTangentAway[0] * STOP_LINE_BEYOND_CUT_M;
        const y = ap.cut[1] + ap.cutTangentAway[1] * STOP_LINE_BEYOND_CUT_M;
        if (y < rb.y && Math.abs(x - rb.x) < 1 && (best === null || y < best.y)) best = { x, y };
      }
    }
  }
  if (best === null) throw new Error(`${districtId}: no south mouth paint`);
  return best.y;
}

interface Graded {
  passed: boolean;
  score: number;
  completedAll: boolean;
  violations: string[];
  commendations: string[];
  named: string[];
  ambientContacts: number;
  order: Array<{ code: string; t: number }>;
}
function gradeOnRung(spec: ScenarioSpec, trace: ScenarioTrace, level: number): Graded {
  const res = liveChainReplay({
    lesson: compileScenario(spec, level as 1 | 2 | 3 | 4 | 5),
    districtRaw: districtRaw(spec.map.districtId),
    trace,
    holdAfterSec: 3,
  });
  const order = res.session.events.flatMap((e) => (e.kind === "violation" ? [{ code: e.code, t: e.t }] : []));
  const violations = order.map((o) => o.code);
  const named = [...new Set([...violations, ...(res.result.lessonMistakes ?? []).map((m) => m.code)])].sort();
  return {
    passed: res.result.passed,
    score: res.result.score,
    completedAll: res.result.completedAll,
    violations,
    commendations: res.commendationCodes,
    named,
    ambientContacts: res.ambientContacts.length,
    order,
  };
}
const recordWith = (spec: ScenarioSpec, kind: "shadow" | "mistake", script: DriveScript): ScenarioTrace =>
  recordScriptedDrive(districtRaw(spec.map.districtId), script, {
    scenarioId: spec.id,
    kind,
    seed: 7,
    stagedEvents: [...(spec.staged ?? [])] as StagedEventSpec[],
  }).trace;

describe("the ring demos stop at the paint the district draws", () => {
  it("rb-mini-v1 and rb-ped-v1: the south give-way bar is at y = MINI_GIVE_WAY_BAR_Y, across the lane the demos use", () => {
    for (const id of ["rb-mini-v1", "rb-ped-v1"]) {
      expect(southBarY(id), id).toBeCloseTo(MINI_GIVE_WAY_BAR_Y, 2);
    }
    expect(MINI_LANE_X).toBe(4.06);
  });

  it("rb-2lane-v1: the south give-way bar is at y = GIVE_WAY_BAR_Y, and the demos rest 0.8 m of nose short of it", () => {
    const G = RB2.SC_RB_LANE_CHOICE_GEOMETRY;
    expect(southBarY("rb-2lane-v1")).toBeCloseTo(G.GIVE_WAY_BAR_Y, 2);
    expect(G.GIVE_WAY_BAR_Y - G.HOLD_Y).toBeCloseTo(0.8 + 2.02, 6);
  });

  /*
   * PINNED AT INTEGRATION (curvring C1 — mutant M1, MINI_BAR_STOP_Y moved so the nose rests 0.7 m OVER the bar and
   * sc-roundabout-entry re-recorded, survived every lane test). On the COMMITTED traces: every rb-mini / rb-ped demo
   * that yields at the south mouth stands with its NOSE THROUGH_GATE_BEFORE_LINE_M (0.8 m, the student's own
   * «пропускане» gate, scene/guidanceRoute.ts) short of the paint the district draws — within the recorder's 5 cm
   * stop resolution (drivablePath RECORDER_STOP_SHORT_M; measured 0.7954 m) — and its nose never crosses that line
   * before it stands. Which demos yield there is a census, not a list taken on trust: every family demo on those two
   * maps whose approach rest puts the nose within 3 m of the paint is one of YIELD_AT_BAR, and each of YIELD_AT_BAR
   * has one. (sc-rb-busy-gap stands in its graded disc ~10 m past the paint by design — the lane's lesson-design
   * finding — and is outside the 3 m band; sc-rb-lane-choice is rb-2lane, pinned above and in its traces test.)
   */
  it("rb-mini-v1 / rb-ped-v1: every yielding demo rests with its nose 0.8 m short of the painted give-way bar, and never noses over it first", () => {
    const YIELD_AT_BAR = [
      "sc-roundabout-entry/shadow-correct",
      "sc-roundabout-entry/mistake-exit-no-signal",
      "sc-rb-exit-signal/shadow-correct",
      "sc-rb-exit-signal/mistake-exit-no-signal",
      "sc-rb-ped-exit/shadow-correct",
      "sc-rb-ped-exit/mistake-exit-through-ped",
    ];
    const HALF_L = CHASSIS_HALF_EXTENTS.z;
    const atBar: string[] = [];
    for (const d of ROUNDABOUT_FAMILY) {
      const districtId = d.spec.map.districtId;
      if (districtId !== "rb-mini-v1" && districtId !== "rb-ped-v1") continue;
      const key = keyOf(d);
      const bar = southBarY(districtId);
      const S = committedTrace(d).samples;
      // The first rest of ≥ 1 s on the south approach (the demo's lane, headed north, short of the ring).
      let rest = -1;
      for (let i = 0; i < S.length && rest < 0; i++) {
        if (Math.abs(S[i].speedKmh) > 0.05 || Math.abs(S[i].x - MINI_LANE_X) > 0.5 || S[i].y > bar + 12) continue;
        let k = i;
        while (k < S.length && Math.abs(S[k].speedKmh) <= 0.05) k++;
        if (S[k - 1].tSec - S[i].tSec >= 1) rest = i;
        else i = k;
      }
      if (rest < 0) continue;
      const nose = S[rest].y + HALF_L * Math.cos((S[rest].headingDeg * Math.PI) / 180);
      if (Math.abs(nose - bar) > 3) continue;
      atBar.push(key);
      expect(Math.abs(S[rest].headingDeg % 360), `${key} stands headed north, square to the bar`).toBeLessThan(1);
      expect(bar - nose, `${key} nose short of the painted bar at ${S[rest].tSec}s`).toBeGreaterThanOrEqual(
        THROUGH_GATE_BEFORE_LINE_M - RECORDER_STOP_SHORT_M,
      );
      expect(bar - nose, `${key} nose short of the painted bar at ${S[rest].tSec}s`).toBeLessThanOrEqual(
        THROUGH_GATE_BEFORE_LINE_M + RECORDER_STOP_SHORT_M,
      );
      for (let i = 0; i <= rest; i++) {
        const n = S[i].y + HALF_L * Math.cos((S[i].headingDeg * Math.PI) / 180);
        expect(bar - n, `${key} nose before the gate line at ${S[i].tSec}s, before it stands`).toBeGreaterThanOrEqual(
          THROUGH_GATE_BEFORE_LINE_M - RECORDER_STOP_SHORT_M,
        );
      }
    }
    expect(atBar.sort()).toEqual([...YIELD_AT_BAR].sort());
  });
});

describe("every committed ring demo is a drive the product car can perform", () => {
  for (const d of ROUNDABOUT_FAMILY) {
    const key = keyOf(d);
    it(`${key}: curvature, continuity, steering and clearance`, () => {
      const trace = committedTrace(d);
      const S = trace.samples;
      expect(S.length, key).toBeGreaterThan(100);

      // 2. Curvature.
      const w = windowedMinRadius(S, 1.0);
      expect(w.radiusM, `${key} tightest 1 m window at ${w.atSec}s`).toBeGreaterThanOrEqual(FAMILY_FLOOR_M);
      expect(w.radiusM, key).toBeGreaterThan(KINEMATIC_CENTRE_RADIUS_M);
      if (d.kind === "shadow") expect(w.radiusM, key).toBeGreaterThanOrEqual(CORRECT_FLOOR_M);

      // 3. Continuity.
      for (let i = 1; i < S.length; i++) {
        const dh = Math.abs(((((S[i].headingDeg - S[i - 1].headingDeg) % 360) + 540) % 360) - 180);
        expect(dh, `${key} heading step at ${S[i].tSec}s`).toBeLessThanOrEqual(MAX_HEADING_STEP_DEG);
        const step = Math.hypot(S[i].x - S[i - 1].x, S[i].y - S[i - 1].y);
        const allowed =
          ((Math.abs(S[i].speedKmh) + Math.abs(S[i - 1].speedKmh)) / 2 / 3.6) * (S[i].tSec - S[i - 1].tSec) + 0.06;
        expect(step, `${key} ground skipped at ${S[i].tSec}s`).toBeLessThanOrEqual(allowed);
        // Every ring demo drives forward; a gear change would need a stop.
        expect(S[i].gear, `${key} gear at ${S[i].tSec}s`).toBeGreaterThanOrEqual(0);
      }

      // 4. Steerability.
      const bike = bicycleOnPath(S);
      const maxSteer = Math.max(...bike.map((b) => b.steerRad));
      expect(maxSteer, key).toBeLessThanOrEqual(STEER_MAX_ANGLE);

      // 5. Clearance, recorded pose and bicycle pose.
      const bodies = bodiesOf(d.spec.map.districtId);
      expect(bodies.counts.pavement, key).toBeGreaterThan(0);
      expect(bodies.counts.wall, key).toBeGreaterThan(0);
      let worstSolid = Infinity;
      let worstKerbOver = 0;
      let worstKerbClear = Infinity;
      for (let i = 0; i < S.length; i++) {
        for (const pose of [
          { x: S[i].x, y: S[i].y, h: S[i].headingDeg },
          { x: bike[i].x, y: bike[i].y, h: bike[i].headingDeg },
        ]) {
          const c = bodies.clearance(pose.x, pose.y, pose.h);
          if (c.kind === "pavement") {
            worstKerbClear = Math.min(worstKerbClear, c.m);
            if (c.m === 0) worstKerbOver = Math.max(worstKerbOver, kerbOverhang(bodies, pose.x, pose.y, pose.h));
          } else {
            worstSolid = Math.min(worstSolid, c.m);
          }
        }
      }
      expect(worstSolid, `${key}: island wall / buildings`).toBeGreaterThanOrEqual(MIN_CLEARANCE_M);
      const exception = KERB_EXCEPTIONS[key];
      if (exception === undefined) {
        expect(worstKerbClear, `${key}: kerb`).toBeGreaterThanOrEqual(MIN_CLEARANCE_M);
      } else {
        expect(worstKerbOver, `${key}: the measured kerb overhang`).toBeGreaterThan(0);
        expect(worstKerbOver, `${key}: the measured kerb overhang`).toBeLessThanOrEqual(exception.maxOverM);
      }
    });
  }
});

/*
 * PINNED AT INTEGRATION (curvring C2 — mutant M7, MINI_ENTRY's ramps cut from 4 m to 5 cm so the road wheel snaps
 * 0 → ~14° within 5 cm at 17 км/ч, re-recorded, survived: the radius stayed 10 m and the heading step per sample
 * stayed under 2.5°). The kit's claim is that curvature, not only heading, is continuous — the wheel is WOUND on and
 * off. The bound is the product car's own: its road wheel turns at most STEER_SPEED (3.2 rad/s, vehicle/tuning.ts)
 * and, kinematically, δ = atan(WHEELBASE_M · κ), so dδ/dt = dκ/ds · v · WHEELBASE_M / (1 + (WHEELBASE_M · κ)²)
 * ≤ dκ/ds · v · WHEELBASE_M. Pinned in its strict form: dκ/ds ≤ STEER_SPEED / (WHEELBASE_M · v) everywhere along
 * the committed path, κ read from the recorded heading over CURV_WINDOW_M of travel and its change over the next
 * CURV_WINDOW_M. Measured on the committed family at the landing: the steepest is 1.23 rad/s (circulate wandering,
 * a mistake), correct demos ≤ 0.77 rad/s.
 */
const CURV_WINDOW_M = 0.2;
function steepestWinding(S: ScenarioTrace["samples"]): { radPerSec: number; dkds: number; kmh: number; atM: number } {
  const s: number[] = [0];
  const turn: number[] = [0];
  const wrap180 = (a: number) => ((((a % 360) + 540) % 360) - 180);
  for (let i = 1; i < S.length; i++) {
    s.push(s[i - 1] + Math.hypot(S[i].x - S[i - 1].x, S[i].y - S[i - 1].y));
    turn.push(turn[i - 1] + wrap180(S[i].headingDeg - S[i - 1].headingDeg));
  }
  const locate = (q: number): [number, number, number] => {
    let lo = 0;
    let hi = s.length - 1;
    if (q <= 0) return [0, 0, 0];
    if (q >= s[hi]) return [hi, hi, 0];
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (s[m] <= q) lo = m;
      else hi = m;
    }
    return [lo, hi, (q - s[lo]) / (s[hi] - s[lo] || 1)];
  };
  const turnAt = (q: number) => {
    const [a, b, f] = locate(q);
    return turn[a] + f * (turn[b] - turn[a]);
  };
  const speedAt = (q: number) => {
    const [a, b, f] = locate(q);
    return Math.abs(S[a].speedKmh + f * (S[b].speedKmh - S[a].speedKmh)) / 3.6;
  };
  const W = CURV_WINDOW_M;
  const kAt = (c: number) => (((turnAt(c + W / 2) - turnAt(c - W / 2)) * Math.PI) / 180) / W;
  let best = { radPerSec: 0, dkds: 0, kmh: 0, atM: 0 };
  const L = s[s.length - 1];
  for (let c = W; c < L - 1.5 * W; c += 0.02) {
    const dkds = Math.abs(kAt(c + W) - kAt(c)) / W;
    const v = Math.max(speedAt(c), speedAt(c + W));
    const rate = dkds * v * WHEELBASE_M;
    if (rate > best.radPerSec) best = { radPerSec: rate, dkds, kmh: v * 3.6, atM: c };
  }
  return best;
}

describe("every committed ring demo winds the wheel on and off — curvature changes no faster than the car can steer", () => {
  for (const d of ROUNDABOUT_FAMILY) {
    const key = keyOf(d);
    it(`${key}: dκ/ds ≤ STEER_SPEED / (WHEELBASE_M · v) along the whole path`, () => {
      const w = steepestWinding(committedTrace(d).samples);
      expect(
        w.radPerSec,
        `${key}: dκ/ds ${w.dkds.toFixed(3)} /m² at ${w.kmh.toFixed(1)} км/ч, ${w.atM.toFixed(1)} m along — the wheel would turn at ${w.radPerSec.toFixed(2)} rad/s`,
      ).toBeLessThanOrEqual(STEER_SPEED);
    });
  }
});

/** How far the body overlaps the pavement, m: the smallest sideways shift (in
 *  0.05 m steps, toward the ring's centre or away) that clears it. */
function kerbOverhang(bodies: RingStaticBodies, x: number, y: number, h: number): number {
  const r = Math.hypot(x, y);
  const ux = x / r;
  const uy = y / r;
  for (let s = 0.05; s <= 2; s += 0.05) {
    for (const sign of [-1, 1]) {
      const c = bodies.clearance(x + sign * ux * s, y + sign * uy * s, h);
      if (c.m > 0 || c.kind !== "pavement") return s;
    }
  }
  return Infinity;
}

describe("on the live rung chain every ring demo still teaches what it is there to teach", () => {
  for (const d of ROUNDABOUT_FAMILY) {
    const key = keyOf(d);
    it(`${key}: every rung`, { timeout: 300_000 }, () => {
      const trace = committedTrace(d);
      const refs =
        d.kind === "mistake"
          ? [...d.spec.mistakes.find((m) => m.traceRef.path.endsWith(`/${d.demo}.trace.json`))!.codeRefs].sort()
          : [];
      for (const level of rungsOf(d.spec)) {
        const g = gradeOnRung(d.spec, trace, level);
        const label = `${key} L${level}`;
        expect(g.ambientContacts, label).toBe(0);
        if (d.kind === "shadow") {
          expect(g.violations, label).toEqual([]);
          expect(g.named, label).toEqual([]);
          expect(g.score, label).toBe(0);
          expect(g.completedAll, label).toBe(true);
          expect(g.passed, label).toBe(true);
        } else {
          const allowed = [...refs, ...(RUNG_EXTRAS[key]?.[level] ?? [])];
          expect(g.named.length, label).toBeGreaterThan(0);
          for (const c of g.named) expect(allowed, `${label} names ${c}`).toContain(c);
          if (level === 1) expect(g.named, label).toEqual(refs);
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 7. The measured windows
// ---------------------------------------------------------------------------

type Expect = (g: Graded, label: string) => void;
const clean: Expect = (g, label) => {
  expect(g.violations, label).toEqual([]);
  expect(g.named, label).toEqual([]);
  expect(g.passed, label).toBe(true);
  expect(g.completedAll, label).toBe(true);
};
const namesExactly =
  (spec: ScenarioSpec, mistakeIndex: number): Expect =>
  (g, label) => {
    const refs = [...spec.mistakes[mistakeIndex].codeRefs].sort();
    expect(g.named.length, label).toBeGreaterThan(0);
    for (const c of g.named) expect(refs, `${label} names ${c}`).toContain(c);
    if (label.endsWith(" L1")) expect(g.named, label).toEqual(refs);
    expect(g.ambientContacts, label).toBe(0);
  };

interface WindowCell {
  name: string;
  spec: ScenarioSpec;
  kind: "shadow" | "mistake";
  script: () => DriveScript;
  expect: Expect;
}

const WINDOWS: readonly WindowCell[] = [
  // sc-roundabout-entry — the shadow's wait (authored 10 s; clean 8–35 s).
  ...[8, 35].map((w) => ({
    name: `sc-roundabout-entry WAIT ${w}`,
    spec: SC_ROUNDABOUT_ENTRY,
    kind: "shadow" as const,
    script: () => RBE.scRoundaboutEntryShadowScript({ waitSec: w }),
    expect: clean,
  })),
  // sc-roundabout-entry — BARGE_BANDS (authored −34 / 7 км/ч).
  ...[
    [-34, 5],
    [-34, 9],
    [-38, 7],
    [-30, 7],
  ].map(([y, k]) => ({
    name: `sc-roundabout-entry BARGE_BANDS brakeY ${y} roll ${k}`,
    spec: SC_ROUNDABOUT_ENTRY,
    kind: "mistake" as const,
    script: () => RBE.scRoundaboutEntryMistakeBargeScript({ bargeBrakeY: y, bargeRollKmh: k }),
    expect: namesExactly(SC_ROUNDABOUT_ENTRY, 0),
  })),
  // sc-rb-exit-signal — the shadow's wait (authored 10 s; clean 7–15 s) and ring pace (10.5; 9–12).
  ...[7, 15].map((w) => ({
    name: `sc-rb-exit-signal WAIT ${w}`,
    spec: SC_RB_EXIT_SIGNAL,
    kind: "shadow" as const,
    script: () => RBX.scRbExitSignalShadowScript({ waitSec: w }),
    expect: clean,
  })),
  ...[9, 12].map((k) => ({
    name: `sc-rb-exit-signal RING ${k}`,
    spec: SC_RB_EXIT_SIGNAL,
    kind: "shadow" as const,
    script: () => RBX.scRbExitSignalShadowScript({ ringKmh: k }),
    expect: clean,
  })),
  // …and its barge (authored −34 / 7 км/ч, the same ring, car and staging as
  // sc-roundabout-entry's).
  ...[
    [-34, 5],
    [-34, 9],
    [-38, 7],
    [-30, 7],
  ].map(([y, k]) => ({
    name: `sc-rb-exit-signal BARGE brakeY ${y} roll ${k}`,
    spec: SC_RB_EXIT_SIGNAL,
    kind: "mistake" as const,
    script: () => RBX.scRbExitSignalMistakeBargeScript({ bargeBrakeY: y, bargeRollKmh: k }),
    expect: namesExactly(SC_RB_EXIT_SIGNAL, 1),
  })),
  // sc-rb-busy-gap — SHADOW_WAIT_WINDOW (authored 14 s; every rung clean 12–32 s),
  // BARGE_BAND (14 км/ч; 13–15), SHORT_GAP_WINDOW (5.1 s; 5.02–5.18).
  ...[12, 32].map((w) => ({
    name: `sc-rb-busy-gap SHADOW_WAIT_WINDOW ${w}`,
    spec: SC_RB_BUSY_GAP,
    kind: "shadow" as const,
    script: () => RBG.scRbBusyGapShadowScript({ waitSec: w }),
    expect: clean,
  })),
  ...[13, 15].map((k) => ({
    name: `sc-rb-busy-gap BARGE_BAND ${k}`,
    spec: SC_RB_BUSY_GAP,
    kind: "mistake" as const,
    script: () => RBG.scRbBusyGapMistakeBargeScript({ bargeKmh: k }),
    expect: namesExactly(SC_RB_BUSY_GAP, 0),
  })),
  ...[5.02, 5.18].map((w) => ({
    name: `sc-rb-busy-gap SHORT_GAP_WINDOW ${w}`,
    spec: SC_RB_BUSY_GAP,
    kind: "mistake" as const,
    script: () => RBG.scRbBusyGapMistakeShortGapScript({ shortGapWaitSec: w }),
    expect: namesExactly(SC_RB_BUSY_GAP, 1),
  })),
  // sc-rb-ped-exit — ENTRY_WAIT_WINDOW (authored 10 s; clean 7–14 s).
  ...[7, 14].map((w) => ({
    name: `sc-rb-ped-exit ENTRY_WAIT_WINDOW ${w}`,
    spec: SC_RB_PED_EXIT,
    kind: "shadow" as const,
    script: () => RBP.scRbPedExitShadowScript({ waitSec: w }),
    expect: clean,
  })),
  // sc-rb-lane-choice — WAIT_WINDOW (authored 15 s; clean 10 s and up, measured to 25).
  ...[10, 25].map((w) => ({
    name: `sc-rb-lane-choice WAIT_WINDOW ${w}`,
    spec: SC_RB_LANE_CHOICE,
    kind: "shadow" as const,
    script: () => RB2.scRbLaneChoiceShadowScript({ waitSec: w }),
    expect: (g: Graded, label: string) => {
      clean(g, label);
      expect(g.commendations, label).toContain("SAFE_LANE_CHANGE");
      expect(g.commendations, label).toContain("YIELDED_TO_PRIORITY");
    },
  })),
  // M1_WAIT_WINDOW (authored 11.5 s; the yield is read for 11–12 s).
  ...[11, 12].map((w) => ({
    name: `sc-rb-lane-choice M1_WAIT_WINDOW ${w}`,
    spec: SC_RB_LANE_CHOICE,
    kind: "mistake" as const,
    script: () => RB2.scRbLaneChoiceMistakeOuterLaneScript({ waitSec: w }),
    expect: (g: Graded, label: string) => {
      namesExactly(SC_RB_LANE_CHOICE, 0)(g, label);
      expect(g.commendations, label).toContain("YIELDED_TO_PRIORITY");
    },
  })),
  // M2_RING_BAND (authored 13.45 км/ч at a 10 s wait; 13.4–13.5): the conviction, then the contact.
  ...[13.4, 13.5].map((k) => ({
    name: `sc-rb-lane-choice M2_RING_BAND ${k}`,
    spec: SC_RB_LANE_CHOICE,
    kind: "mistake" as const,
    script: () => RB2.scRbLaneChoiceMistakeExitAcrossScript({ m2RingKmh: k }),
    expect: (g: Graded, label: string) => {
      namesExactly(SC_RB_LANE_CHOICE, 1)(g, label);
      const fty = g.order.find((o) => o.code === "FAILED_TO_YIELD");
      const col = g.order.find((o) => o.code === "COLLISION");
      expect(fty, label).toBeDefined();
      if (col !== undefined) expect(fty!.t, label).toBeLessThan(col.t);
    },
  })),
];

describe("the windows the ring demos are centred in (both inside edges, every rung)", () => {
  for (const cell of WINDOWS) {
    it(cell.name, { timeout: 300_000 }, () => {
      const trace = recordWith(cell.spec, cell.kind, cell.script());
      for (const level of rungsOf(cell.spec)) {
        cell.expect(gradeOnRung(cell.spec, trace, level), `${cell.name} L${level}`);
      }
    });
  }
});
