/**
 * T-EXAM / T-EXAM-NEG — the exam drill's graded node, d2-v1 n4547529959, on the REAL TrafficSystem (lane slowturn2,
 * sc-turn-left-oncoming:1613ef2c; rulings ST-CLASS, ST-LATE-READ, ST-LATE-END (d)). Harness: examDriveD2.ts — the
 * live scene's own world (`buildLiveWorld`: anchor seeding at the lesson's spawn, 16 ambient vehicles within 60 m, no
 * staged actor) through `liveChainReplay`; the student drives the traffic model's own lane line for the slow left
 * turn e856821052.0 → e23040421.0 at 6 km/h.
 *
 * WHAT THE REAL MODEL DOES THERE (measured, STEP 0(b2) / STEP 6(iv)). The ambient cars that turn RIGHT from
 * e856821051.0 into his exit arm (e23040421.0) — the pair the old classifier read as «uturn» — were classed
 * «uturn» at base and are «right» now (T-EXAM (a), red on base). On these seeds they queue at the junction mouth
 * (27–33 m from the node) while he turns — the ambient yield to the student, `studentComing`'s side-blind band, is a
 * known limit recorded under ruling ST-COMING — so at his added commit none of them is approaching and his body is on
 * no one's route: none is an R13''' candidate, and nothing is billed, at base or now. When he moves off at 120 s,
 * car 8 follows him onto the exit arm and its OWN account grows by 3.5 m/s for him — but only after his turn is
 * complete (ST-LATE-END (d) at k 8980; the account first reaches 0.3 in his path at k 9296): the exit-arm follower
 * the turn-end close exists for (F16) is never billed (T-EXAM-NEG).
 */
import { describe, expect, it } from "vitest";
import { liveChainReplay } from "./liveChainReplay";
import { FIXED_DT } from "../../../vehicle/tuning";
import type { SimTickEvent } from "../../../rules/types";
import { examDrive, EXAM_NODE, type ExamDriveSpec } from "./examDriveD2";

function run(spec: ExamDriveSpec) {
  const { lesson, districtRaw, trace } = examDrive(spec);
  const evs: Array<{ k: number } & Record<string, unknown>> = [];
  const rightFromWest = new Map<number, number>(); // id → first k it was a right-turner from e856821051.0
  const acct = new Map<number, number>(); // id → max account while a right-turner from e856821051.0
  const movement = new Map<number, Set<string>>(); // id → the movements its plan was classed as
  const o = liveChainReplay({
    lesson,
    districtRaw,
    trace,
    applyOutcomes: true,
    holdAfterSec: 0,
    afterApply: ({ t, tick, traffic }) => {
      const k = Math.round(t / FIXED_DT);
      for (const e of tick.events as SimTickEvent[]) if (e.kind === "turnStarted" || e.kind === "prioritySituation") evs.push({ k, ...(e as object) });
      if (k % 5) return;
      for (const a of traffic.playerShedAccounts()) {
        const r = traffic.plannedRouteThrough(a.id, EXAM_NODE, 36);
        if (r === null) continue;
        const brg = ((Math.atan2(r.approachDirX, r.approachDirY) * 180) / Math.PI + 360) % 360;
        if (Math.abs(brg - 114.9) > 3) continue; // arriving by e856821051.0
        if (r.n < 2 || r.movement === "straight") continue;
        // its route leaves the node into e23040421.0 (south-west of it) — the right turn the old classifier called «uturn»
        const ex = r.px[r.n - 1] - NODE_XY.x;
        const ey = r.py[r.n - 1] - NODE_XY.y;
        if (!(ex < 0 && ey < 0)) continue;
        if (!rightFromWest.has(a.id)) rightFromWest.set(a.id, k);
        (movement.get(a.id) ?? movement.set(a.id, new Set()).get(a.id)!).add(r.movement);
        acct.set(a.id, Math.max(acct.get(a.id) ?? 0, a.playerShedMps));
      }
    },
  });
  return { o, evs, rightFromWest, acct, movement };
}

const NODE_XY = { x: -650.46, y: 68.94 }; // d2-v1 n4547529959
const SPEC = { vehicleCount: 16, anchorRadiusM: 60, approachKmh: 15, turnKmh: 6 };

describe("T-EXAM — the exam drill's graded node on the real TrafficSystem", () => {
  it("(a) the ambient right-turners from e856821051.0 into his exit arm are «right» (base: «uturn»), and the slow left from e856821052.0 is ONE added commit there", () => {
    const { evs, rightFromWest, movement } = run({ ...SPEC, goSec: 96 });
    expect([...rightFromWest.keys()].sort((a, b) => a - b)).toEqual([0, 5, 8, 13]);
    for (const id of rightFromWest.keys()) expect([...movement.get(id)!]).toEqual(["right"]);
    expect(evs.filter((e) => e.kind === "turnStarted")).toEqual([{ k: 6988, kind: "turnStarted", direction: "left", addedPath: true }]);
  });
  it("(b) T-EXAM-NEG, the careful drive (moving off at 96 s): the right-turners queue at the mouth while he turns, their own accounts stay 0 — no bill, a clean sheet", () => {
    const { o, evs, acct } = run({ ...SPEC, goSec: 96 });
    expect(evs.filter((e) => e.kind === "prioritySituation")).toEqual([]);
    expect([...acct.values()].every((v) => v === 0)).toBe(true);
    expect(o.result.summary.mistakes.map((m) => m.code)).toEqual([]);
  });
  it("(c) T-EXAM-NEG, the follower: moving off at 120 s, car 8 follows him onto the exit arm and its own account grows ≥ the line for him only after his turn is complete — no left-turn bill", () => {
    const { o, acct } = run({ ...SPEC, goSec: 120 });
    expect(acct.get(8) ?? 0).toBeGreaterThan(3);
    const ltBills = o.result.summary.mistakes.filter((m) => m.code === "FAILED_TO_YIELD" && (m.detail ?? "").startsWith("left-turn-oncoming"));
    expect(ltBills).toEqual([]);
  });
});
