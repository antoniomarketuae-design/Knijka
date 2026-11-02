/**
 * sc-vu-bikelane-turn:9141072b (lane vru2offset) — THE WITH-FLOW RIDER RIDES
 * THE SOUTH CYCLE TRACK, on every tick, on every rung.
 *
 * THE DEFECT. templates-vru2.ts authored the with-flow rider's curb offset as
 * `VBL_WF_Y − VBL_THROUGH_Y` = −6.66 − (−4.06) = −2.6. `offsetPolyline`
 * (traffic/graph.ts) shifts a path to the RIGHT OF TRAVEL — south, for this
 * eastbound rider — so −2.6 carried him 2.6 m NORTH, to y = −1.46: inside the
 * car's own lane, 2.6 m to its LEFT, on every tick of L1–L5. Every sentence of
 * the lesson (instruction 3, the moment «Огледало и рамо назад — движещият се
 * направо велосипедист», the card «Отрязване на колелото по алеята»), the map
 * (meta.scenario.cycleTrack.withFlowYM −6.66, side «south»), the template's
 * own constant VBL_WF_Y and every sibling curb rider (+2.6) put him on the
 * south track, the side the right turn crosses. And on mistake-cut-path his
 * runner billed the hook (outcome «violation») while he rode ahead-LEFT of the
 * car, 4.6 m and more off its turn — a line the car never crossed.
 *
 * WHAT THIS PINS, in the world LessonScene builds (liveChainReplay over the
 * three committed tapes, every rung):
 *   1. from his spawn to the junction mouth (x ≤ 0) the with-flow rider's y is
 *      −6.66 ± 0.05 — right of the car's lane centre −4.06 — on every frame;
 *   2. the counter-flow rider still rides −8.26 (his offset is not this
 *      lane's: the reversed path, westbound, −12.32 is already right);
 *   3. on mistake-cut-path the with-flow rider is never convicted (outcome
 *      «violation» or «collision») while he is LEFT of the car — north of it
 *      in the through road's own frame, the direction both of them travel.
 */
import { describe, expect, it } from "vitest";
import type { StagedEventOutcome } from "../../../contracts";
import { compileScenario } from "../compile";
import { SC_VU_BIKELANE_TURN } from "../templates-vru2";
import type { ScenarioLevel } from "../types";
import { liveChainReplay } from "./liveChainReplay";
import { demoTrace } from "./npcContactDrive";
import { loadDistrict } from "./witnessLiveRung";

/** content/world/vu-bikelane-v1.json meta.scenario (the vu-bikelane-districts battery pins each). */
const THROUGH_LANE_Y = -4.06;
const WITH_FLOW_Y = -6.66;
const COUNTER_FLOW_Y = -8.26;
const TOL_M = 0.05;

type Name = "shadow-correct" | "mistake-only-behind" | "mistake-cut-path";
const NAMES: Name[] = ["shadow-correct", "mistake-only-behind", "mistake-cut-path"];
const LEVELS: ScenarioLevel[] = [1, 2, 3, 4, 5];

interface Pose {
  t: number;
  carX: number;
  carY: number;
  wf: { x: number; y: number } | null;
  cf: { x: number; y: number } | null;
}

function drive(name: Name, level: ScenarioLevel) {
  const lesson = compileScenario(SC_VU_BIKELANE_TURN, level);
  const poses: Pose[] = [];
  const at = (traffic: { vehicles: Array<{ id: number; x: number; y: number }>; stagedActorId(id: number): string | null }, actorId: string) => {
    const v = traffic.vehicles.find((x) => traffic.stagedActorId(x.id) === actorId);
    return v ? { x: v.x, y: v.y } : null;
  };
  const out = liveChainReplay({
    lesson,
    districtRaw: loadDistrict("vu-bikelane-v1"),
    trace: demoTrace("sc-vu-bikelane-turn", `${name}.trace.json`),
    afterApply: (ctx) => {
      const traffic = ctx.traffic as unknown as Parameters<typeof at>[0];
      poses.push({
        t: ctx.t,
        carX: ctx.tick.position.x,
        carY: ctx.tick.position.y,
        wf: at(traffic, "sc-vbl-rider-wf"),
        cf: at(traffic, "sc-vbl-rider-cf"),
      });
    },
  });
  return { out, poses };
}

const runs = new Map<string, ReturnType<typeof drive>>();
const run = (name: Name, level: ScenarioLevel) => {
  const key = `${name}@L${level}`;
  let r = runs.get(key);
  if (!r) {
    r = drive(name, level);
    runs.set(key, r);
  }
  return r;
};

describe("sc-vu-bikelane-turn — the with-flow rider rides the south track (vru2offset)", () => {
  for (const level of LEVELS) {
    for (const name of NAMES) {
      it(`L${level} ${name}: from spawn to the mouth the with-flow rider holds y ${WITH_FLOW_Y} ± ${TOL_M} (right of the car's lane centre ${THROUGH_LANE_Y}); the counter-flow rider holds ${COUNTER_FLOW_Y}`, () => {
        const { poses } = run(name, level);
        const wf = poses.filter((p) => p.wf !== null && p.wf.x <= 0).map((p) => ({ t: +p.t.toFixed(3), x: +p.wf!.x.toFixed(2), y: +p.wf!.y.toFixed(3) }));
        // He is staged from the first frame, 30 m short of the junction.
        expect(wf.length).toBeGreaterThan(0);
        expect(wf[0].x).toBeCloseTo(-30, 0);
        const offLine = wf.filter((p) => Math.abs(p.y - WITH_FLOW_Y) > TOL_M);
        expect(offLine.slice(0, 3), `${offLine.length} of ${wf.length} frames off the with-flow line`).toEqual([]);
        expect(wf.every((p) => p.y < THROUGH_LANE_Y)).toBe(true);
        const cf = poses.filter((p) => p.cf !== null && p.cf.x >= 0).map((p) => +p.cf!.y.toFixed(3));
        expect(cf.length).toBeGreaterThan(0);
        expect(cf.filter((y) => Math.abs(y - COUNTER_FLOW_Y) > TOL_M)).toEqual([]);
      }, 120_000);
    }
  }

  for (const level of LEVELS) {
    it(`L${level} mistake-cut-path: the with-flow rider is never convicted while he rides LEFT of the car`, () => {
      const { out, poses } = run("mistake-cut-path", level);
      const convictions = out.outcomes.filter(
        (o: StagedEventOutcome) => o.eventId === "sc-vbl-rider-wf" && (o.detail === "violation" || o.detail === "collision"),
      );
      const leftOfCar = convictions
        .map((o) => {
          const p = poses.reduce((b, q) => (Math.abs(q.t - (o.tSec ?? NaN)) < Math.abs(b.t - (o.tSec ?? NaN)) ? q : b), poses[0]);
          return { detail: o.detail, t: +(o.tSec ?? NaN).toFixed(2), car: [+p.carX.toFixed(2), +p.carY.toFixed(2)], wf: p.wf && [+p.wf.x.toFixed(2), +p.wf.y.toFixed(2)] };
        })
        // LEFT in the through road's frame (both travel east): north of the car.
        .filter((c) => c.wf !== null && c.wf[1] > c.car[1]);
      expect(leftOfCar).toEqual([]);
    }, 120_000);
  }

  // C1 (integration of lane vru2offset): the one hook the with-flow runner
  // still BILLS on the tree — L2 mistake-cut-path, FAILED_TO_YIELD
  // «cyclist-right-hook» @18.20 — is billed on a rider the car really cut:
  // AHEAD of the car's centre, inside the southbound stem lane the car turns
  // into (x within [STEM_WEST_X, 0]), on the with-flow line, and within half a
  // stem-lane width of the car's line ahead (measured: fwd 3.61 m, left
  // 1.24 m, rider at (−2.21, −6.66)). At the authored −2.6 the same bill fell
  // on a rider at (−2.21, −1.46), 5.83 m LEFT of the car — the wrong bill.
  it("L2 mistake-cut-path: the with-flow runner's FAILED_TO_YIELD is billed with the rider AHEAD of the car, inside the stem lane it turns into", () => {
    const STEM_WEST_X = -8.125;
    const STEM_HALF_W = 8.125 / 2;
    const { out, poses } = run("mistake-cut-path", 2);
    const wfBills = out.outcomes.filter((o: StagedEventOutcome) => o.eventId === "sc-vbl-rider-wf" && o.detail === "violation");
    expect(wfBills.map((o) => +o.tSec.toFixed(2))).toEqual([18.2]);
    const t = wfBills[0].tSec;
    const hook = out.session.events
      .filter((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD" && Math.abs(e.t - t) < 0.05)
      .map((e) => `${e.code}:${(e as { detail?: string }).detail ?? ""}`);
    expect(hook).toEqual(["FAILED_TO_YIELD:cyclist-right-hook"]);
    // The frame of the bill and the car's heading over the preceding 6 frames.
    const i = poses.reduce((bi, q, j) => (Math.abs(q.t - t) < Math.abs(poses[bi].t - t) ? j : bi), 0);
    const p = poses[i];
    const q = poses[Math.max(0, i - 6)];
    const hn = Math.hypot(p.carX - q.carX, p.carY - q.carY);
    expect(hn).toBeGreaterThan(0);
    const fx = (p.carX - q.carX) / hn;
    const fy = (p.carY - q.carY) / hn;
    expect(p.wf).not.toBeNull();
    const dx = p.wf!.x - p.carX;
    const dy = p.wf!.y - p.carY;
    const rider = {
      at: [+p.wf!.x.toFixed(2), +p.wf!.y.toFixed(2)],
      fwd: +(dx * fx + dy * fy).toFixed(2),
      left: +(-dx * fy + dy * fx).toFixed(2),
    };
    const where = JSON.stringify(rider);
    expect(rider.fwd, `rider not AHEAD of the car at the bill: ${where}`).toBeGreaterThan(0);
    expect(rider.at[0] >= STEM_WEST_X && rider.at[0] <= 0, `rider not inside the stem lane's x-span [${STEM_WEST_X}, 0]: ${where}`).toBe(true);
    expect(Math.abs(rider.at[1] - WITH_FLOW_Y), `rider not on the with-flow line ${WITH_FLOW_Y}: ${where}`).toBeLessThanOrEqual(TOL_M);
    expect(Math.abs(rider.left), `rider off the car's line ahead (beyond half a stem lane, ${STEM_HALF_W} m): ${where}`).toBeLessThanOrEqual(STEM_HALF_W);
  }, 120_000);
});
