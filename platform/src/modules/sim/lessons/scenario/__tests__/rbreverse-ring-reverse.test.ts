/**
 * sc-roundabout-entry:9e85f27e [major] — lane rbreverse. THE ROW'S DRIVE IN
 * PROCESS (rbReverseDrive.ts: the product chassis on rapier, the live world
 * through `wireTrafficQueries`, a real cabin; R reached by the selector and by
 * the founder's 2026-08-11 gesture, never by setting the gear).
 *
 * rig-w3b SC2 (59be0de, 3 of 3): after the island strike the recovery card told
 * the student to ease away first and look afterwards; he reversed on the ring
 * (≤ 4.8 km/h, 6.3 m) toward the staged circulator, which braked from 2.9 m/s to
 * a standstill about 1 m off his rear bumper, and nothing warned.
 *
 * §1 T1 — THE LOOK COMES FIRST on every hold frame of the ring (card, peek and
 *    the banner lead the shell builds), integrator rulings R6 / R6a.
 * §2 STEP 0 — what the drive measures: the facts the warning rests on (the
 *    circulator's own account grows in the car's rear half-plane; the gear
 *    holds −1 across a creep; a STANDING car makes it shed too — STEP 0(c),
 *    which the integrator's ruling R5'' answers with its half (B): a vehicle
 *    that stopped for him and STILL STANDS counts, whatever the car did since).
 * §3 THE WARNING (STEP 2 / 3; founder ruling Q2 «warn only»): T2 on the row's
 *    four cells, Risk 2 (the standing car, then R), the NUDGE (the round-2
 *    verifier's V4: a forward creep between the stop and the reverse), the
 *    crash-free reverse (R1), and the controls — T3 (behind, not braking), T8 (exam), the
 *    standing car with no R, and T4 (a forward drive with a follower braking).
 *    Every zero-frame case asserts the field is DEFINED on its frames (wired,
 *    not absent) and runs beside the T2 drive in the same harness.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  advisorPromptForSession,
  reverseWarningAdvisorPrompt,
  reverseWarningForSession,
  routeHoldForSession,
  routeHoldWayOutForSession,
} from "../../advisor";
import { bannerObjectiveLineBg, objectiveTitleUnderHold, snapshotOf } from "@/components/sim/lesson-ui/LessonPlayShell";
import type { ReverseBrakedFor } from "../../../rules/types";
import { parseScenarioTrace } from "../../../traces/parse";
import {
  REVERSE_BRAKED_FOR_SHED_MPS,
  REVERSE_BRAKED_FOR_VEHICLE_STOPPED_MPS,
  ReverseBrakedForTracker,
  type ShedAccountRow,
} from "../../../runtime/reverseBrakedFor";
import { applyTick } from "../../engine";
import type { LessonSessionState } from "../../types";
import type { SimTick } from "../../../rules/types";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioLevel } from "../types";
import { liveChainReplay } from "./liveChainReplay";
import { loadDistrict } from "./witnessLiveRung";
import { initRapier } from "./rapierContactDrive";
import { driveRingReverse, type ReverseRoute } from "./rbReverseDrive";
import { createTrafficSystem, type TrafficDistrict } from "../../../traffic";

beforeAll(async () => {
  await initRapier();
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const SPEC = SCENARIO_TEMPLATES.find((s) => s.id === "sc-roundabout-entry")!;
const RAW = loadDistrict(SPEC.map.districtId);
const CIRC = "sc-rb-circulating";
const LOOK = /огледа/iu;
const MOVE = /назад|напред|отдръпни|потегл/u;
/** A move order of any kind on the advisor — the recovery's stems and the objective's. */
const ANY_MOVE = /назад|напред|отдръпни|потегл|Излез|Премини|тръгни/u;
/** The words the warning may never say (the brief's STEP 3 list). */
const SIDE_OR_OUTCOME = /отзад|отляво|отдясно|зад теб|пропусни|изчакай да мине|нека мине/iu;
const WARN = reverseWarningAdvisorPrompt("vehicle");

interface Point {
  t: number;
  v: number;
  gear: number;
  x: number;
  y: number;
  hdg: number;
  hold: string | null;
  way: string | null;
  card: string | null;
  peek: string | null;
  banner: string | null;
  /** The tick's measurement as published ("absent" when the field is not on the tick). */
  rbf: ReverseBrakedFor | null | "absent";
  warn: boolean;
  circ: { id: number | undefined; mps: number; shed: number; fwd: number; left: number } | null;
}

function drive(
  level: ScenarioLevel,
  route: ReverseRoute,
  o: { enterAtPhiDeg?: number; standStill?: boolean; noStrike?: boolean; reverseAfterS?: number; tailStepsAfterEnd?: number; nudgeAtS?: number; nudgeM?: number } = {},
) {
  const points: Point[] = [];
  const frames: Array<{ t: number; mps: number; shed: number }> = [];
  const out = driveRingReverse({
    lesson: compileScenario(SPEC, level),
    raw: RAW,
    enterAtPhiDeg: o.enterAtPhiDeg ?? 250,
    route,
    standStill: o.standStill,
    noStrike: o.noStrike,
    reverseAfterS: o.reverseAfterS,
    nudgeAtS: o.nudgeAtS,
    nudgeM: o.nudgeM,
    tailAfterStrikeS: 30,
    tailStepsAfterEnd: o.tailStepsAfterEnd,
    onFrame: ({ stepS, traffic }) => {
      const c = traffic.staged(CIRC);
      if (c) frames.push({ t: stepS, mps: c.speedMps, shed: c.playerShedMps ?? NaN });
    },
    onPoint: ({ tick, step, traffic }) => {
      const s = step.state;
      const c = traffic.staged(CIRC);
      const h = (tick.headingDeg * Math.PI) / 180;
      const fx = Math.sin(h);
      const fy = Math.cos(h);
      const driving = s.phase === "driving";
      const pr = driving ? advisorPromptForSession(s) : null;
      let banner: string | null = null;
      if (driving) {
        const sn = snapshotOf(s, tick, null, null);
        banner = objectiveTitleUnderHold(bannerObjectiveLineBg(sn), sn.objectiveHold, sn.objectiveHoldWayOut, sn.objectiveHoldPersonLeadBg);
      }
      points.push({
        t: tick.t,
        v: tick.speedKmh,
        gear: tick.gear,
        x: tick.position.x,
        y: tick.position.y,
        hdg: tick.headingDeg,
        hold: driving ? routeHoldForSession(s) : null,
        way: driving ? routeHoldWayOutForSession(s) : null,
        card: pr?.textBg ?? null,
        peek: pr?.peekBg ?? null,
        banner,
        rbf: "reverseBrakedFor" in tick ? (tick.reverseBrakedFor ?? null) : "absent",
        warn: reverseWarningForSession(s) !== null,
        circ: c
          ? {
              id: c.stateId,
              mps: c.speedMps,
              shed: c.playerShedMps ?? NaN,
              fwd: (c.x - tick.position.x) * fx + (c.y - tick.position.y) * fy,
              left: (c.x - tick.position.x) * -fy + (c.y - tick.position.y) * fx,
            }
          : null,
      });
    },
  });
  return { out, points, frames };
}

/**
 * THE ORACLE, recomputed here from the drive's own pose and the circulator's
 * own account and speed (not from the product's tracker), by the integrator's
 * ruling R5'' as amended by R5''' at the landing (2026-11-04): the R interval
 * that holds the reverse; (A) the circulator's account at the interval's first
 * point (`base`); (B) its account since the drive began (`driveBase`, the
 * first point it was seen) and whether it has stood at rest on some point of
 * this R interval up to the point judged (R5'''; R5'' read its speed NOW); the
 * first point the test holds («the mark»); and the last point of the run after it.
 */
function oracle(points: Point[]) {
  const firstRev = points.findIndex((p) => p.gear === -1 && p.v < -0.8);
  if (firstRev < 0) return null;
  let rStart = firstRev;
  while (rStart > 0 && points[rStart - 1].gear === -1) rStart--;
  const base = points[rStart].circ!.shed;
  const driveBase = points.find((p) => p.circ !== null)!.circ!.shed;
  /** R5''': has the circulator stood at rest on some point of this R interval, up to and including point i? */
  const restSeen: boolean[] = [];
  for (let i = rStart, seen = false; i < points.length && points[i].gear === -1; i++) {
    const c = points[i].circ;
    if (c !== null && Math.abs(c.mps) <= REVERSE_BRAKED_FOR_VEHICLE_STOPPED_MPS) seen = true;
    restSeen[i] = seen;
  }
  /** (A) braking for him in this R interval, or (B) stopped for him on this drive and at rest in this R interval. */
  const slowed = (c: NonNullable<Point["circ"]>, i: number) =>
    c.shed - base >= REVERSE_BRAKED_FOR_SHED_MPS ||
    ((c.mps <= REVERSE_BRAKED_FOR_VEHICLE_STOPPED_MPS || restSeen[i] === true) && c.shed - driveBase >= REVERSE_BRAKED_FOR_SHED_MPS);
  const holds = (i: number) => {
    const p = points[i];
    return p.gear === -1 && p.v < -0.8 && p.circ !== null && p.circ.fwd < 0 && slowed(p.circ, i);
  };
  let mark = -1;
  for (let i = rStart; i < points.length && points[i].gear === -1; i++) {
    if (holds(i)) {
      mark = i;
      break;
    }
  }
  if (mark < 0) return { rStart, base, driveBase, slowed, mark: -1, end: -1 };
  // …and the last point of the run in which the test keeps holding (the car stops going back, or —
  // Risk 2 — its centre passes the vehicle's, which is then no longer behind it).
  let end = mark;
  while (end + 1 < points.length && holds(end + 1)) end++;
  return { rStart, base, driveBase, slowed, mark, end };
}

/** T2's assertions on one drive; returns the warned span. */
function assertWarnedSpan(d: ReturnType<typeof drive>, label: string) {
  const P = d.points;
  const o = oracle(P);
  expect(o, label).not.toBeNull();
  expect(o!.mark, `${label}: the R5'' test holds on some frame`).toBeGreaterThanOrEqual(0);
  const warned = P.map((p, i) => (p.card === WARN.textBg ? i : -1)).filter((i) => i >= 0);
  expect(warned.length, label).toBeGreaterThan(0);
  // from one grid step after the test first holds (± one step) until the car stops reversing
  expect(warned[0] - o!.mark, `${label}: first warned point vs the mark`).toBeGreaterThanOrEqual(0);
  expect(warned[0] - o!.mark, `${label}: first warned point vs the mark`).toBeLessThanOrEqual(1);
  expect(Math.abs(warned[warned.length - 1] - o!.end), `${label}: last warned point vs the end of the reverse`).toBeLessThanOrEqual(1);
  // contiguous: no hole in the span
  expect(warned.length, `${label}: contiguous`).toBe(warned[warned.length - 1] - warned[0] + 1);
  const bad: string[] = [];
  for (const i of warned) {
    const p = P[i];
    if (p.peek !== WARN.peekBg) bad.push(`${p.t.toFixed(3)} peek «${p.peek}»`);
    if (ANY_MOVE.test(p.card ?? "") || ANY_MOVE.test(p.peek ?? "")) bad.push(`${p.t.toFixed(3)} a move order on the advisor`);
    if (SIDE_OR_OUTCOME.test(p.card ?? "") || SIDE_OR_OUTCOME.test(p.peek ?? "")) bad.push(`${p.t.toFixed(3)} a side or an outcome`);
    // the sentence is true on this frame: the car is in R and going back, the named vehicle is behind, and it has slowed for him
    if (!(p.gear === -1 && p.v < -0.8)) bad.push(`${p.t.toFixed(3)} not reversing`);
    if (p.rbf === null || p.rbf === "absent" || p.rbf.fwdM >= 0) bad.push(`${p.t.toFixed(3)} no vehicle behind`);
    if (!(p.circ !== null && o!.slowed(p.circ, i))) bad.push(`${p.t.toFixed(3)} it has not slowed for him`);
  }
  expect(bad, label).toEqual([]);
  // the warning is gone once he stops going back
  expect(P.slice(o!.end + 2).filter((p) => p.card === WARN.textBg).length, `${label}: after the stop`).toBe(0);
  return { o: o!, first: P[warned[0]], last: P[warned[warned.length - 1]], frames: warned.length };
}

describe("sc-roundabout-entry:9e85f27e — the island strike and the reverse on the ring, in process", () => {
  let L3: ReturnType<typeof drive>;
  beforeAll(() => {
    L3 = drive(3, "selector");
  }, 600_000);

  // ── §1 ──────────────────────────────────────────────────────────────────────
  it("T1 · on every crashPinned frame of the ring the card, the peek and the banner lead name the look BEFORE the first move (the direction-free way out) — unless the warning holds the card", () => {
    const held = L3.points.filter((p) => p.hold === "crashPinned");
    expect(held.length).toBeGreaterThan(60);
    const bad: string[] = [];
    let warned = 0;
    for (const p of held) {
      expect(p.way).toBe("away");
      const surfaces: Array<[string, string | null]> = [["banner", p.banner]];
      if (p.card === WARN.textBg) {
        warned++; // the warning outranks the pinned card (R2); the banner keeps the lead (R4)
      } else surfaces.push(["card", p.card], ["peek", p.peek]);
      for (const [surface, text] of surfaces) {
        const s = text ?? "";
        const l = s.search(LOOK);
        const m = s.search(MOVE);
        if (!(l >= 0 && m > l)) bad.push(`${p.t.toFixed(3)} ${surface}: «${s}»`);
      }
    }
    expect(bad).toEqual([]);
    expect(warned).toBeGreaterThan(0);
    // …and the hold covers the reverse the row was filed on (the pin is armed while it starts).
    expect(held.some((p) => p.gear === -1 && p.v < -0.8 && p.card !== WARN.textBg)).toBe(true);
  });

  // ── §2 ──────────────────────────────────────────────────────────────────────
  it("STEP 0(a) · the drive is the row's: one bill (the island), R by the selector, a 6.3 m reverse at ≈ 4.3 km/h", () => {
    const o = L3.out;
    expect(o.collisions.map((c) => [c.withWhat, c.points])).toEqual([["staticObject", 10]]);
    expect(o.rBy).toBe("selector");
    expect(o.reversedM).toBeGreaterThan(6.2);
    expect(o.maxBackKmh).toBeGreaterThan(4);
    expect(o.maxBackKmh).toBeLessThan(4.8);
  });

  it("STEP 0(a) · the circulator's own account grows ≥ 0.3 m/s inside the R interval, its centre in the car's REAR half-plane on every growing point, and it stops ≈ 6 m centre to centre", () => {
    const inR = L3.points.filter((p) => p.gear === -1 && p.circ !== null);
    expect(inR.length).toBeGreaterThan(300);
    const base = inR[0].circ!.shed;
    let prev = base;
    let growing = 0;
    for (const p of inR) {
      if (p.circ!.shed > prev + 1e-9) {
        growing++;
        expect(p.circ!.fwd, `t ${p.t}`).toBeLessThan(0);
      }
      prev = p.circ!.shed;
    }
    expect(growing).toBeGreaterThan(30);
    const first = inR.find((p) => p.circ!.shed - base >= 0.3)!;
    expect(first).toBeDefined();
    expect(first.v).toBeLessThan(-0.8);
    // beside him on the ring, not behind: 45°–80° off the rear axis, outside the rear badge's 4 m corridor
    const off = (Math.atan2(Math.abs(first.circ!.left), -first.circ!.fwd) * 180) / Math.PI;
    expect(off).toBeGreaterThan(40);
    expect(Math.abs(first.circ!.left)).toBeGreaterThan(4);
    const stop = inR.find((p) => p.t > first.t && p.circ!.mps === 0)!;
    expect(Math.hypot(stop.circ!.fwd, stop.circ!.left)).toBeGreaterThan(5.4);
    expect(Math.hypot(stop.circ!.fwd, stop.circ!.left)).toBeLessThan(6.2);
  });

  it("STEP 0(a) · SimTick.gear holds −1 across the creep in R at |v| < 0.8 km/h after the stop (the discrete fact R5 keys on)", () => {
    const creep = L3.points.filter((p) => L3.out.reverseEndS !== null && p.t > L3.out.reverseEndS && Math.abs(p.v) < 0.8);
    expect(creep.length).toBeGreaterThan(60);
    expect(new Set(creep.map((p) => p.gear))).toEqual(new Set([-1]));
  });

  it("STEP 0(c) · a STANDING car at the island makes the circulator shed its whole 2.9 m/s too — inside the live drive when it comes round within the pin's 10 s (the fact R5'' (B) answers: a vehicle that stopped for him and still stands counts)", () => {
    const st = drive(3, "selector", { enterAtPhiDeg: 283, standStill: true, tailStepsAfterEnd: 1200 });
    expect(st.out.rAtS).toBeNull();
    const strike = st.out.strikeAtS!;
    const endedAt = st.out.session.endedAtSec!;
    const at = (t: number) => st.frames.find((f) => f.t >= t)!;
    const base = at(strike).shed;
    const first = st.frames.find((f) => f.t >= strike && f.shed - base >= 0.3)!;
    expect(first).toBeDefined();
    expect(first.t).toBeLessThan(endedAt);
    expect(st.frames[st.frames.length - 1].shed - base).toBeCloseTo(2.9, 6);
    expect(st.frames[st.frames.length - 1].mps).toBe(0);
    // …and with NO R there is no warning: the field is published (wired) on every graded point and never raised
    expect(st.points.length).toBeGreaterThan(1000);
    expect(st.points.filter((p) => p.rbf === "absent")).toEqual([]);
    expect(st.points.filter((p) => p.rbf !== null).length).toBe(0);
    expect(st.points.filter((p) => p.warn || p.card === WARN.textBg).length).toBe(0);
    expect(st.points.every((p) => p.gear !== -1)).toBe(true);
  }, 600_000);

  // ── §3 ──────────────────────────────────────────────────────────────────────
  it("T2 · L3, R by the SELECTOR (the row): the warning is on the card and peek from the mark until the car stops reversing; «Излез от кръговото…» and the pinned move are off the advisor on every one of those frames", () => {
    const r = assertWarnedSpan(L3, "L3 selector");
    // the measurement names the circulator, as a vehicle
    expect(r.first.rbf).toMatchObject({ kind: "vehicle", vehicleId: r.first.circ!.id });
    // the frames it replaced: the pinned look-first card and then the objective (measured before this lane: the pin
    // dropped mid-reverse and «Излез от кръговото с десен мигач» took the card)
    expect(r.frames).toBeGreaterThan(100);
    console.log(`[T2 L3 selector] mark ${L3.points[r.o.mark].t.toFixed(3)} warned ${r.first.t.toFixed(3)}–${r.last.t.toFixed(3)} (${r.frames} points); circulator at the first: fwd ${r.first.circ!.fwd.toFixed(2)} left ${r.first.circ!.left.toFixed(2)} shed ${(r.first.circ!.shed - r.o.base).toFixed(3)}`);
  });

  for (const [L, route] of [
    [3, "gesture"],
    [1, "selector"],
    [1, "gesture"],
  ] as const) {
    it(`T2 · L${L}, R by the ${route === "gesture" ? "founder's GESTURE (ra2)" : "SELECTOR"}: the same warned span, the same truths`, () => {
      const d = drive(L, route);
      expect(d.out.rBy).toBe(route);
      const r = assertWarnedSpan(d, `L${L} ${route}`);
      console.log(`[T2 L${L} ${route}] warned ${r.first.t.toFixed(3)}–${r.last.t.toFixed(3)} (${r.frames} points)`);
    }, 600_000);
  }

  // RE-TAUGHT in round 3 (ruling R5'' replaced R5'): the warning here is carried by half (B) — the circulator stopped
  // for the STANDING car and still stands — not by a standstill baseline, which R5'' removed. The round-2 assertion
  // that the oracle's baseline lay before R is replaced by «the first warned point is a (B) point».
  it("RISK 2 (R5'' (B)) · the car stands at the island, the circulator stops for it, THEN R: the warning is up from the first reverse point, before the contact", () => {
    const d = drive(3, "selector", { enterAtPhiDeg: 283, reverseAfterS: 9.72 });
    const veh = d.out.collisions.filter((c) => c.withWhat === "vehicle");
    expect(veh.length).toBe(1); // the reverse still reaches it — the warning is a warning, not a brake (Q2)
    const contactT = veh[0].t;
    // the circulator had already stopped for the STANDING car before R
    const rAt = d.out.rAtS!;
    const atR = d.points.find((p) => p.t >= rAt)!;
    expect(atR.circ!.mps).toBe(0);
    const r = assertWarnedSpan(d, "Risk 2");
    expect(r.first.t).toBeLessThan(contactT - 2);
    expect(r.last.t).toBeLessThan(contactT);
    // R5''' (landing, 2026-11-04; the r3 verifier's V3-risk2-tail): the circulator starts moving off beside him
    // (> 0.5 m/s) in the last ~0.2 s; it stood at rest in this R interval, so the warning runs to the LAST graded point
    // before the contact (under R5'' alone it dropped ~12 points early, onto the look-first pinned card).
    const lastPre = d.points.filter((p) => p.t < contactT).at(-1)!;
    expect(r.last.t, "warned to the last point before the contact").toBe(lastPre.t);
    expect(d.points.some((p) => p.t >= r.first.t && p.t <= r.last.t && p.circ !== null && p.circ.mps > REVERSE_BRAKED_FOR_VEHICLE_STOPPED_MPS), "the tail it covers: the circulator moving off").toBe(true);
    // the first warned point is (B): at rest, its drive account ≥ 0.3, and NO growth of 0.3 inside this R interval
    expect(r.first.circ!.mps).toBeLessThanOrEqual(REVERSE_BRAKED_FOR_VEHICLE_STOPPED_MPS);
    expect(r.first.circ!.shed - r.o.driveBase).toBeGreaterThanOrEqual(REVERSE_BRAKED_FOR_SHED_MPS);
    expect(r.first.circ!.shed - r.o.base).toBeLessThan(REVERSE_BRAKED_FOR_SHED_MPS);
    console.log(`[Risk 2] R ${rAt.toFixed(3)} warned ${r.first.t.toFixed(3)}–${r.last.t.toFixed(3)}, contact ${contactT.toFixed(3)}`);
  }, 600_000);

  // THE NUDGE (the round-2 verifier's V4 cell, its probe copied into rbReverseDrive's `nudgeAtS` / `nudgeM`): no strike;
  // the car halts on the ring (enter at φ 283), the circulator stops ≈ 6.3 m behind it for the halted car, the car
  // creeps FORWARD 0.3–0.5 m and stops, then shifts to R and reverses 6.3 m toward it. Under R5' the standstill
  // baseline restarted after the nudge and the warning was silent (L1: COLLISION vehicle −10 at 71.98 under «Излез
  // от кръговото с десен мигач»). R5'' (B): it stopped for him and still stands — warned before any contact.
  for (const [L, route, nudgeM] of [
    [1, "selector", 0.3],
    [3, "selector", 0.5],
    [3, "gesture", 0.5],
  ] as const) {
    it(`R5'' (B) · THE NUDGE, L${L} ${route}, ${nudgeM} m forward between the stop and the reverse: warned before any contact, no «Излез…» or other move order on the advisor while it holds`, () => {
      const d = drive(L, route, { noStrike: true, enterAtPhiDeg: 283, reverseAfterS: 13, nudgeAtS: 10.5, nudgeM });
      expect(d.out.rBy).toBe(route);
      expect(d.out.collisions.filter((c) => c.withWhat !== "vehicle")).toEqual([]);
      // the nudge happened: between the anchor's rest and R the car moved FORWARD by about nudgeM
      const anchor = d.out.anchorS!;
      const rest1 = d.points.find((p) => p.t >= anchor + 5)!;
      const atR = d.points.find((p) => p.gear === -1)!;
      const hr = (rest1.hdg * Math.PI) / 180;
      const moved = (atR.x - rest1.x) * Math.sin(hr) + (atR.y - rest1.y) * Math.cos(hr);
      expect(moved, "forward along the car's heading").toBeGreaterThan(nudgeM - 0.05);
      expect(moved).toBeLessThan(nudgeM + 0.4);
      // …and the circulator had stopped for him before it, and stands at R (it creeps at < 0.11 m/s: at rest by the
      // traffic model's stopped bar)
      expect(atR.circ!.mps).toBeLessThanOrEqual(REVERSE_BRAKED_FOR_VEHICLE_STOPPED_MPS);
      expect(atR.circ!.fwd).toBeLessThan(0);
      const r = assertWarnedSpan(d, `nudge L${L} ${route}`);
      const veh = d.out.collisions.filter((c) => c.withWhat === "vehicle");
      if (veh.length > 0) expect(r.first.t, "warned before the contact").toBeLessThan(veh[0].t);
      expect(r.first.circ!.mps).toBeLessThanOrEqual(REVERSE_BRAKED_FOR_VEHICLE_STOPPED_MPS);
      console.log(`[nudge L${L} ${route}] R ${d.out.rAtS?.toFixed(3)} warned ${r.first.t.toFixed(3)}–${r.last.t.toFixed(3)} (${r.frames} points); contact ${veh[0]?.t.toFixed(3) ?? "none"}`);
    }, 600_000);
  }

  it("R1 · NO CRASH: the car halts on the ring and reverses toward the circulator — the same warning, over «Излез от кръговото с десен мигач»", () => {
    const d = drive(3, "selector", { noStrike: true, reverseAfterS: 5.6 });
    expect(d.out.collisions).toEqual([]);
    const r = assertWarnedSpan(d, "no crash");
    const o = r.o;
    // what the advisor said on the reverse before the mark: the objective
    expect(d.points.slice(o.rStart, o.mark).some((p) => /^Излез от кръговото/u.test(p.card ?? ""))).toBe(true);
  }, 600_000);

  it("T3 · a ring reverse with the circulator in the car's rear half-plane on every reverse point but NOT braking for him: 0 frames, the field defined on every one (beside the T2 drive)", () => {
    const d = drive(3, "selector", { enterAtPhiDeg: 200 });
    const rev = d.points.filter((p) => p.gear === -1 && p.v < -0.8);
    expect(rev.length).toBeGreaterThan(300);
    expect(rev.every((p) => p.circ !== null && p.circ.fwd < 0)).toBe(true);
    expect(rev.every((p) => p.circ!.shed === rev[0].circ!.shed)).toBe(true);
    expect(d.points.filter((p) => p.rbf === "absent")).toEqual([]);
    expect(d.points.filter((p) => p.rbf !== null).length).toBe(0);
    expect(d.points.filter((p) => p.card === WARN.textBg || p.warn).length).toBe(0);
    // the positive control in the same harness
    expect(L3.points.filter((p) => p.card === WARN.textBg).length).toBeGreaterThan(100);
  }, 600_000);

  it("T8 · EXAM (L4): the same crash-free reverse is MEASURED — the field raised on the reverse — and nothing is shown: no warning, no card", () => {
    const d = drive(4, "selector", { noStrike: true, reverseAfterS: 5.6 });
    expect(compileScenario(SPEC, 4).examMode).toBe(true);
    expect(d.points.filter((p) => p.rbf === "absent")).toEqual([]);
    const raised = d.points.filter((p) => p.rbf !== null);
    expect(raised.length).toBeGreaterThan(100);
    expect(d.points.filter((p) => p.warn || p.card !== null || p.peek !== null).length).toBe(0);
    // the positive control in the same harness: the practice rung warns on the same drive
    const pr = drive(3, "selector", { noStrike: true, reverseAfterS: 5.6 });
    expect(pr.points.filter((p) => p.card === WARN.textBg).length).toBeGreaterThan(100);
  }, 600_000);

  // The brief named sc-follow-tailgater's brake check. MEASURED on this tree: its tailgater's own account never
  // moves (the runner commands its speed — ADR-016's followerBraked is that drive's fact, not playerShedMps), so
  // no follower there is «braking for him» in the warning's sense and the case would prove nothing. The forward
  // drive here is one whose AMBIENT follower's account does grow ≥ 0.3 behind a car moving forward:
  // sc-follow-distance/mistake-tailgate (938 such points at L1, from t 13.67).
  it("T4 · a FORWARD drive with a follower braking for him (sc-follow-distance, mistake-tailgate, live chain): 0 frames, the field defined on every graded point", () => {
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-follow-distance")!;
    const trace = parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", spec.id, "mistake-tailgate.trace.json"), "utf-8")))!;
    let points = 0;
    let absent = 0;
    let raised = 0;
    let warned = 0;
    let followerGrewBehind = 0;
    const base = new Map<number, number>();
    liveChainReplay({
      lesson: compileScenario(spec, 1),
      districtRaw: loadDistrict(spec.map.districtId),
      trace,
      holdAfterSec: 5,
      afterApply: ({ tick, step, traffic }) => {
        points++;
        if (!("reverseBrakedFor" in tick)) absent++;
        else if (tick.reverseBrakedFor !== null) raised++;
        if (reverseWarningForSession(step.state) !== null) warned++;
        const h = (tick.headingDeg * Math.PI) / 180;
        for (const a of traffic.playerShedAccounts()) {
          if (!base.has(a.id)) base.set(a.id, a.playerShedMps);
          const fwd = (a.x - tick.position.x) * Math.sin(h) + (a.y - tick.position.y) * Math.cos(h);
          if (fwd < 0 && a.playerShedMps - base.get(a.id)! >= 0.3 && tick.speedKmh > 0.8) followerGrewBehind++;
        }
      },
    });
    expect(points).toBeGreaterThan(500);
    expect(followerGrewBehind, "the brake check made the follower brake for him").toBeGreaterThan(0);
    expect(absent).toBe(0);
    expect(raised).toBe(0);
    expect(warned).toBe(0);
  }, 600_000);
});

// THE CYCLIST, QUERY TO CARD (round 3; the round-2 verifier's surviving mutant VM13 — «playerShedAccounts' kind always
// "vehicle"» — stayed green because no test took a rider's kind from the REAL query). sc-vu-pass-clearance's
// mistake-squeeze, live chain (wireTrafficQueries): the cast rider sheds 3 m/s for the squeezing car and stops. On the
// first such graded point the REAL query's rows go through the product's tracker for a car reversing toward the
// rider (5 m ahead of him, facing away: he is in its rear half-plane — R5'' (B), he stopped for the car and
// stands), the value rides a tick through the session's own fold (applyTick), and the advisor shows the RIDER's card.
describe("the cyclist's card from the real account query", () => {
  it("VM13 · the real playerShedAccounts publishes the cast rider as \"cyclist\", the tracker carries it, the session folds it, and the card says «велосипедист»", () => {
    const spec = SCENARIO_TEMPLATES.find((x) => x.id === "sc-vu-pass-clearance")!;
    const trace = parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", spec.id, "mistake-squeeze.trace.json"), "utf-8")))!;
    let got: { state: LessonSessionState; tick: SimTick; rows: ShedAccountRow[]; rider: ShedAccountRow; actor: string | undefined } | null = null;
    liveChainReplay({
      lesson: compileScenario(spec, 1),
      districtRaw: loadDistrict(spec.map.districtId),
      trace,
      holdAfterSec: 1,
      afterApply: ({ tick, step, traffic }) => {
        if (got !== null || step.state.phase !== "driving") return;
        const rows = traffic.playerShedAccounts().map((r) => ({ ...r }));
        // found by what it did, NOT by its kind (the kind is what this test proves): the one body that stopped for him
        const rider = rows.find((r) => r.playerShedMps >= REVERSE_BRAKED_FOR_SHED_MPS && r.speedMps <= REVERSE_BRAKED_FOR_VEHICLE_STOPPED_MPS);
        if (rider) got = { state: step.state, tick, rows, rider, actor: traffic.stagedActorId(rider.id) ?? undefined };
      },
    });
    expect(got, "the rider stopped for the squeezing car").not.toBeNull();
    const g = got!;
    // the row is a staged cast member (the lesson's rider), not an ambient car
    expect(g.actor).toBeDefined();
    const car = { gear: -1, speedKmh: -3, x: g.rider.x, y: g.rider.y + 5, headingDeg: 0 };
    const v = new ReverseBrakedForTracker().step(car, () => g.rows);
    const next = applyTick(g.state, { ...g.tick, t: g.tick.t + 1 / 60, gear: -1, speedKmh: -3, events: [], reverseBrakedFor: v }).state;
    expect(next.reverseBrakedFor).toEqual(v);
    // THE CARD names the rider — the assertion the VM13 mutant must fail
    expect(advisorPromptForSession(next)?.textBg).toBe(reverseWarningAdvisorPrompt("cyclist").textBg);
    expect(advisorPromptForSession(next)?.textBg).toMatch(/велосипедист намали заради теб/u);
    expect(v).toMatchObject({ vehicleId: g.rider.id, kind: "cyclist" });
  }, 600_000);
});

// THE AMBIENT VEHICLE, QUERY TO CARD (gate rb, 2026-11-04; the r3 verifier's surviving mutant V3M2 — «playerShedAccounts
// walks only the staged fleet» — stayed green because no test sent an AMBIENT vehicle through the real query).
// The production traffic system on rb-mini-v1 with an ambient fleet only (no staged cast — as traffic/player-shed.test.ts
// «THE AMBIENT FLEET»): a student standing 12 m ahead in a rolling ambient car's lane, facing the way it travels, makes
// it brake. The REAL query's rows go through the product's tracker for that car reversing toward it on every step
// (R from the first step: (A) its account grew ≥ 0.3 since the R interval began); the value rides a tick through a
// practice session's own fold (sc-follow-distance L1, its first driving point, live chain), and the advisor shows
// the VEHICLE's card.
describe("the ambient vehicle's card from the real account query", () => {
  it("V3M2 · the real playerShedAccounts publishes an AMBIENT vehicle's account, the tracker carries it, the session folds it, and the card says «превозно средство»", () => {
    const raw = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", "rb-mini-v1.json"), "utf-8")) as TrafficDistrict;
    const traffic = createTrafficSystem(raw, { seed: 11, vehicleCount: 6, pedestrianCount: 0, anchor: { x: 4.06, y: -93 }, anchorRadiusM: 400 });
    const DT = 1 / 60;
    for (let i = 0; i < 60 * 20; i++) traffic.update(DT, { signalPhase: () => "green", playerPos: null });
    const target = traffic.vehicles.find((v) => v.speedMps > 4)!;
    expect(target, "a rolling ambient car").toBeDefined();
    expect(traffic.stagedActorId(target.id), "ambient: no staged actor").toBeNull();
    const at = { x: target.x + target.dirX * 12, y: target.y + target.dirY * 12 };
    const headingDeg = (Math.atan2(target.dirX, target.dirY) * 180) / Math.PI; // facing the way it travels: it is behind him
    const tr = new ReverseBrakedForTracker();
    const car = { gear: -1, speedKmh: -3, x: at.x, y: at.y, headingDeg };
    let v: ReverseBrakedFor | null = null;
    let rowSeen = false;
    for (let i = 0; i < 90; i++) {
      traffic.update(DT, { signalPhase: () => "green", playerPos: at, playerSpeedKmh: 0, playerHeadingDeg: headingDeg });
      if (traffic.playerShedAccounts().some((r) => r.id === target.id)) rowSeen = true;
      v = tr.step(car, () => traffic.playerShedAccounts());
    }
    expect(rowSeen, "the ambient car is a row of the real query").toBe(true);
    const row = traffic.playerShedAccounts().find((r) => r.id === target.id)!;
    expect(row.playerShedMps, "it braked for him").toBeGreaterThan(1);
    expect(row.kind).toBe("vehicle");
    expect(v).toMatchObject({ vehicleId: target.id, kind: "vehicle" });
    expect(v!.fwdM).toBeLessThan(0);
    // …and into a practice session's fold and onto the card
    const spec = SCENARIO_TEMPLATES.find((x) => x.id === "sc-follow-distance")!;
    const trace = parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", spec.id, "mistake-tailgate.trace.json"), "utf-8")))!;
    let got: { state: LessonSessionState; tick: SimTick } | null = null;
    liveChainReplay({
      lesson: compileScenario(spec, 1),
      districtRaw: loadDistrict(spec.map.districtId),
      trace,
      holdAfterSec: 1,
      afterApply: ({ tick, step }) => {
        if (got === null && step.state.phase === "driving") got = { state: step.state, tick };
      },
    });
    expect(got).not.toBeNull();
    const g = got!;
    const next = applyTick(g.state, { ...g.tick, t: g.tick.t + 1 / 60, gear: -1, speedKmh: -3, events: [], reverseBrakedFor: v }).state;
    expect(next.reverseBrakedFor).toEqual(v);
    expect(advisorPromptForSession(next)?.textBg).toBe(reverseWarningAdvisorPrompt("vehicle").textBg);
    expect(advisorPromptForSession(next)?.textBg).toMatch(/превозно средство намали заради теб/u);
  }, 600_000);
});
