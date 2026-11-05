/**
 * LANE ENDINGS (2026-10-18) on the PRODUCT CHASSIS — `rapierContactDrive`, the
 * browser's rapier, the product's chassis and `VehicleSim`, 60 Hz, one physics
 * step per frame, every grid point folded by the real `applyTick`.
 *
 * Two of the lane's three rows were filed from these drives (the engine-level
 * half and the catalogue census are `lessons/__tests__/endings-gate1-runout
 * .test.ts` and `route-runout.test.ts`):
 *
 *   · sc-hz-brake-dont-swerve:870904d4 — the keyboard swerve (full brake + full
 *     lock from y 181 at 47.45 on this controller) clips the debris block,
 *     slides past and stands at (0.28 | 7.84, 193.098), 9.852 m from the stop
 *     mark against gate 1's 9 m disc and more than CRASH_PIN_RADIUS_M from the
 *     impact. Measured at 219ac1e: holding the brake, phase "driving" at 7200
 *     steps on L1/L3/L5, both sides. Now: E2 ends it FINISH_STUCK_S after rest.
 *   · sc-pk-driveway:7fa8b79e («pinfree») — the crash pin's words. The free car
 *     is sc-hz-brake-dont-swerve CUT-R / CUT-L (rest 2.242 / 2.508 m clear of the
 *     block, the block BEHIND it; CUT-L's drive-on twin drives 158 m with no
 *     further contact). The pressed car is sc-pk-driveway's own wall, which on
 *     the chassis holds the car in contact or within SWEEP_RESOLUTION_M (no
 *     chassis drive there left the car free: 38 of 54 pin endings ≤ 0.15 m of
 *     a wall, 16 against an unmeasured static body 0.25 m from the impact pose).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PROP_COLLIDERS } from "@/components/sim/ScenarioObstacles";
import { PROP_COLLIDER_DIMS, staticContactBodiesOf, WALL_DEFAULT_THICKNESS_M } from "../../../scene/obstacleSpec";
import { heldStaticContactBodies } from "../../../scene/scenarioSceneryProps";
import { obbSeparationM, playerObb, SWEEP_RESOLUTION_M } from "../../../collision";
import type { SimTick } from "../../../rules";
import { objectiveTitleUnderHold } from "../../../../../components/sim/lesson-ui/LessonPlayShell";
import { advisorPromptForSession, routeHoldForSession, routeHoldWayOutForSession } from "../../advisor";
import { buildLessonWorldCore } from "../../../scene/lessonWorldRecipe";
import { crashPinClearEnds, crashPinEndingCopy, FINISH_STUCK_S, openTasksEndingCopy, type CrashPinImpact } from "../../finish";
import { READY_DRIVELINE } from "../../../vehicle/driveline";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import { SC_HZ_BRAKE_DONT_SWERVE } from "../templates-hazards2";
import { loadDistrict } from "./witnessLiveRung";
import { driveIntoContact, initRapier, type DriveState } from "./rapierContactDrive";

beforeAll(async () => {
  await initRapier();
});

interface Box {
  x: number;
  y: number;
  headingDeg: number;
  halfLengthM: number;
  halfWidthM: number;
}
type Out = { throttle?: number; brake?: number; steer?: number };
interface Said {
  k: number;
  kind: string;
  titleBg: string;
  text: string;
}
interface HoldSeen {
  k: number;
  lead: string | null;
  card: { textBg: string; keys: readonly string[]; peekBg?: string } | null;
  sepM: number;
  /** Round 4 (E11 / E13): the way out the hold named on this frame. */
  way: string;
  /**
   * Round 4 (E13): the separation to EVERY listed body (`heldStaticContactBodies`)
   * on this frame's pose — not only to the one struck at the bill — and after a
   * 0.1 m straight shift in the advised direction (back / forward). `towardAny`:
   * a body within SWEEP_RESOLUTION_M that the advised shift brings > 5 mm closer
   * (the round-3 verifier's toward-test, `endings-verify/r3/analyze-v3.cjs`).
   */
  sepsAll: number[];
  towardAny: boolean;
}

/** Separation to each body at a pose, and after a straight shift of `dM` along the heading (+ forward). */
function sepsAt(x: number, y: number, h: number, bodies: readonly Box[], dM = 0): number[] {
  const r = (h * Math.PI) / 180;
  return bodies.map((b) => obbSeparationM(playerObb(x + dM * Math.sin(r), y + dM * Math.cos(r), h), b));
}
function towardAnyListed(x: number, y: number, h: number, bodies: readonly Box[], way: string): boolean {
  if (way !== "back" && way !== "forward") return false;
  const s0 = sepsAt(x, y, h, bodies);
  const s1 = sepsAt(x, y, h, bodies, way === "back" ? -0.1 : 0.1);
  return s0.some((v, i) => v <= SWEEP_RESOLUTION_M && s1[i] - v < -0.005);
}
interface Ran {
  phase: string;
  endedAtPoint: number;
  billStep: number;
  restStep: number;
  rest: { x: number; y: number; v: number; sepM: number; h: number; sepsAll: number[] };
  said: Said[];
  holds: HoldSeen[];
  collisions: number;
  /** `crashPin.impact` on the bill's grid point (lane endings round 2, E5/E6). */
  impact: CrashPinImpact | null;
}

const HOLD_KMH = 47.45;
const cruise = (target: number, kmh: number) => {
  const err = target - kmh;
  return err > 0 ? Math.min(1, err / 5 + 0.2) : 0.12;
};
const signed = (h: number) => ((((h + 180) % 360) + 360) % 360) - 180;
const laneSteer = (st: DriveState, xt: number, gain = 6, maxH = 20) => {
  const hDes = Math.max(-maxH, Math.min(maxH, gain * (xt - st.x)));
  return Math.max(-1, Math.min(1, (signed(st.headingDeg) - hDes) / 12));
};

/** Drive `pre` until the bill, then `post`; record every ending, every crash-pinned hold surface. */
function run(
  specId: string,
  level: number,
  start: { x: number; y: number; headingDeg: number },
  pre: (st: DriveState) => Out,
  post: (st: DriveState, restStep: number | null) => Out,
  struck: Box[],
  maxSteps: number,
  /** The harness's own „at rest" for `post` (the filed probes used 0.05 and 0.5). */
  restKmh = 0.05,
): Ran {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === specId)!;
  const lesson = compileScenario(spec, level as 1);
  let billed = false;
  let billStep = -1;
  let restStep: number | null = null;
  const said: Said[] = [];
  const holds: HoldSeen[] = [];
  let last: SimTick | null = null;
  let impact: CrashPinImpact | null = null;
  const sep = (x: number, y: number, h: number) => Math.min(...struck.map((b) => obbSeparationM(playerObb(x, y, h), b)));
  const listed = heldStaticContactBodies(lesson.id);
  const o = driveIntoContact({
    lesson,
    raw: loadDistrict(spec.map.districtId),
    start,
    control: (st: DriveState) => {
      if (billed && restStep === null && Math.abs(st.speedKmh) < restKmh) restStep = st.step;
      return billed ? post(st, restStep) : pre(st);
    },
    deltas: [1 / 60],
    maxSteps,
    onStep: (tick: SimTick, step: { state: any; hudEvents: any[] }) => {
      const k = Math.round(tick.t * 60);
      last = tick;
      const s = step.state;
      if (!billed && s.events.some((e: any) => e.kind === "violation" && e.code === "COLLISION")) {
        billed = true;
        billStep = k;
        impact = s.crashPin?.impact ?? null;
      }
      if (routeHoldForSession(s) === "crashPinned" && (holds.length === 0 || k - holds[holds.length - 1].k >= 60)) {
        const card = advisorPromptForSession(s);
        const way = routeHoldWayOutForSession(s);
        const h0 = tick.headingDeg ?? 0;
        holds.push({
          k,
          // As the shell builds it: the hold kind and the way out of the same session.
          lead: objectiveTitleUnderHold("ЗАДАЧА", "crashPinned", way),
          card: card === null ? null : { textBg: card.textBg, keys: card.keys, ...(card.peekBg ? { peekBg: card.peekBg } : {}) },
          sepM: sep(tick.position.x, tick.position.y, h0),
          way,
          sepsAll: sepsAt(tick.position.x, tick.position.y, h0, listed),
          towardAny: towardAnyListed(tick.position.x, tick.position.y, h0, listed, way),
        });
      }
      for (const h of step.hudEvents) {
        if (h.kind === "lesson") said.push({ k, kind: h.kind, titleBg: h.titleBg ?? "", text: String(h.explanationBg ?? "") });
      }
    },
  } as never);
  const lt = last as SimTick | null;
  return {
    phase: o.session.phase,
    endedAtPoint: o.endedAtPoint,
    billStep,
    restStep: restStep ?? -1,
    rest: {
      x: lt!.position.x,
      y: lt!.position.y,
      v: lt!.speedKmh,
      sepM: sep(lt!.position.x, lt!.position.y, lt!.headingDeg ?? 0),
      h: lt!.headingDeg ?? 0,
      sepsAll: sepsAt(lt!.position.x, lt!.position.y, lt!.headingDeg ?? 0, listed),
    },
    said,
    holds,
    collisions: o.collisions.length,
    impact,
  };
}

const BLOCK: Box = { x: 4.06, y: 190, headingDeg: 0, halfLengthM: 1.2, halfWidthM: 0.8 };
const MARK = { x: 4.06, y: 184 };
const endings = (r: Ran) => r.said.filter((s) => /^Край/u.test(s.titleBg));

// ───────────────────────────────────────────────────────────────────────────
// §1 · E2 — the keyboard swerve that clips the block and stands still past it
// ───────────────────────────────────────────────────────────────────────────

const swervePre = (s: 1 | -1) => (st: DriveState): Out =>
  st.y >= 181 ? { throttle: 0, brake: 1, steer: s } : { throttle: cruise(HOLD_KMH, st.speedKmh), brake: 0, steer: 0 };

describe("E2 on the chassis — the held-brake swerve ends where it stands, FINISH_STUCK_S after rest", () => {
  for (const level of [1, 3, 5]) {
    for (const s of [1, -1] as const) {
      it(`L${level} steer ${s > 0 ? "+1" : "−1"}: brake held after the bill — phase completed within the bar + 1 s of rest, on the non-arrival sentence`, () => {
        const r = run(SC_HZ_BRAKE_DONT_SWERVE.id, level, { x: 4.06, y: 15, headingDeg: 0 }, swervePre(s), () => ({ brake: 1, steer: 0 }), [BLOCK], 60 * 40);
        // The filed rest, re-measured on this base.
        expect(r.billStep).toBe(880);
        expect(r.rest.y).toBeCloseTo(193.098, 2);
        expect(Math.hypot(r.rest.x - MARK.x, r.rest.y - MARK.y)).toBeCloseTo(9.852, 2);
        expect(r.phase).toBe("completed");
        // Rest: the first grid point the car is at FINISH_STANDSTILL_KMH (step 953 on this base).
        const restAtK = 953;
        expect(r.endedAtPoint - restAtK).toBeGreaterThanOrEqual(FINISH_STUCK_S * 60);
        expect(r.endedAtPoint - restAtK).toBeLessThanOrEqual((FINISH_STUCK_S + 1) * 60);
        const e = endings(r);
        expect(e.map((x) => [x.k, x.titleBg, x.text])).toEqual([
          [r.endedAtPoint, "Край на маршрута", openTasksEndingCopy(false).explanationBg],
        ]);
        expect(r.said.some((x) => /притисн|Стигна края|Спря в края/u.test(x.text))).toBe(false);
      });
    }
  }

  // The moving variants end EXACTLY as on base (steps measured at 219ac1e; the
  // pin ending's words are E3's now, its timing is not touched).
  const MOVING: Array<{ s: 1 | -1; after: "idle" | "forward10" | "forward20"; end: number; title: string }> = [
    { s: 1, after: "idle", end: 5625, title: "Край на урока — колата е извън пътя" },
    { s: -1, after: "idle", end: 5496, title: "Край на урока — колата е извън пътя" },
    { s: 1, after: "forward10", end: 2979, title: "Край на упражнението след удара" },
    { s: 1, after: "forward20", end: 2740, title: "Край на упражнението след удара" },
    { s: -1, after: "forward10", end: 6757, title: "Край на урока — колата е извън пътя" },
    { s: -1, after: "forward20", end: 6540, title: "Край на урока — колата е извън пътя" },
  ];
  for (const m of MOVING) {
    it(`L1 steer ${m.s > 0 ? "+1" : "−1"}, ${m.after} after the bill: a car that keeps moving ends exactly where and how it did on base (step ${m.end})`, () => {
      const post = (st: DriveState, restStep: number | null): Out => {
        if (m.after === "idle") return {};
        if (restStep !== null && st.step - restStep > 180) {
          const dev = ((st.headingDeg + 180) % 360) - 180;
          return { throttle: cruise(m.after === "forward10" ? 10 : 20, st.speedKmh), steer: Math.max(-0.3, Math.min(0.3, dev / 20)) };
        }
        return { brake: 1, steer: 0 };
      };
      const r = run(SC_HZ_BRAKE_DONT_SWERVE.id, 1, { x: 4.06, y: 15, headingDeg: 0 }, swervePre(m.s), post, [BLOCK], 60 * 120, 0.5);
      expect(r.phase).toBe("completed");
      expect(r.endedAtPoint).toBe(m.end);
      expect(endings(r).map((x) => x.titleBg)).toEqual([m.title]);
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// §2 · E3 — CUT-R / CUT-L: a FREE car after the crash
// ───────────────────────────────────────────────────────────────────────────

const passAndCut = (xt: number) => (st: DriveState): Out => {
  const brake = st.y >= 186 ? 1 : 0;
  const tgt = st.y >= 187 ? 4.06 : st.y >= 150 ? xt : 4.06;
  const steer = st.y >= 150 ? laneSteer(st, tgt, 8, 30) : 0;
  return brake > 0 ? { brake, steer } : { throttle: cruise(HOLD_KMH, st.speedKmh), steer };
};
const UNCONDITIONAL_REVERSE = /^(Съвсем леко назад|Първо назад|Колата е притисната)/u;

// RE-TAUGHT (lane rbreverse, sc-roundabout-entry:9e85f27e; integrator rulings R6 /
// R6a, 2026-11-04): every card, peek and lead string this file pins verbatim held
// the move-first order through 479127b («Ако колата опира в удареното, първо съвсем
// леко …», «Ако опира — …», «След удара — ако колата опира в удареното, първо леко
// …») — the move as the first act, the look only in the free branch. They now hold
// the look-first copy (look round; once clear, ease away only if the car touches —
// slowly, and why — or move off; stop for anyone approaching). What these chassis
// cells measure — which way out the pin chose, the conditional, and that no
// surface orders an unconditional reverse — is unchanged.

describe("E3 on the chassis — a car standing FREE of what it hit is never told it is pressed, nor ordered back into it", () => {
  const CUTS: Array<{ name: string; xt: number; end: number; sep: number }> = [
    { name: "CUT-R", xt: 6.2, end: 1565, sep: 2.2416 },
    { name: "CUT-L", xt: 1.9, end: 1567, sep: 2.5083 },
  ];
  for (const level of [1, 3]) {
    for (const c of CUTS) {
      it(`${c.name} L${level}: rest ${c.sep} m clear, block behind — the hold (lead, card, peek, chip) and the ending are true of a free car, at the base step`, () => {
        const r = run(SC_HZ_BRAKE_DONT_SWERVE.id, level, { x: 4.06, y: 15, headingDeg: 0 }, passAndCut(c.xt), () => ({ brake: 1, steer: 0 }), [BLOCK], 60 * 45);
        expect(r.billStep).toBe(901);
        expect(r.rest.sepM).toBeCloseTo(c.sep, 3);
        expect(r.rest.sepM, "the car is FREE (clearance > SWEEP_RESOLUTION_M)").toBeGreaterThan(SWEEP_RESOLUTION_M);
        // The block is behind the car: the car's centre is beyond the block's centre along the road.
        expect(r.rest.y).toBeGreaterThan(BLOCK.y);
        // Timing, phase: untouched (base 1565 / 1567).
        expect(r.phase).toBe("completed");
        expect(r.endedAtPoint).toBe(c.end);
        // Struck travelling forward with the FRONT half on the block (round 3,
        // E9/E10): the corrective is base's forward static-body sentence, verbatim.
        expect(r.impact).toEqual({ travel: "forward", body: "staticObject", end: "front" });
        expect(endings(r).map((x) => [x.k, x.titleBg, x.text])).toEqual([
          [c.end, crashPinEndingCopy(false).titleBg, crashPinEndingCopy(false, r.impact!).explanationBg],
        ]);
        expect(endings(r)[0].text).toContain("по-ранно намаляване и достатъчна дистанция до всичко неподвижно напред.");
        // The hold: raised at bill + ROUTE_HOLD_S as on base, and every surface conditional.
        expect(r.holds.length).toBeGreaterThan(0);
        expect(r.holds[0].k).toBe(1201);
        for (const h of r.holds) {
          expect(h.lead).not.toMatch(/притисната|измъкни се назад/u);
          expect(h.lead).toMatch(/^След удара — първо се огледай; ако колата опира, леко назад: ЗАДАЧА$/u);
          expect(h.card).not.toBeNull();
          expect(h.card!.textBg).not.toMatch(UNCONDITIONAL_REVERSE);
          expect(h.card!.textBg).toMatch(/^Огледай се — огледала и рамо\. Щом е чисто: ако опира в удареното/u);
          expect(h.card!.textBg).toContain("ако не опира, потегли");
          expect(h.card!.textBg.search(/огледа/iu)).toBeLessThan(h.card!.textBg.search(/назад|напред|отдръпни|потегл/u));
          expect(h.card!.peekBg ?? "").not.toMatch(UNCONDITIONAL_REVERSE);
          expect(h.card!.keys).toEqual([]);
        }
        expect(r.said.some((x) => /притисн|не може да продължи/u.test(x.text))).toBe(false);
      });
    }
  }
});

// ───────────────────────────────────────────────────────────────────────────
// §3 · E3 — sc-pk-driveway: a PRESSED car after the crash
// ───────────────────────────────────────────────────────────────────────────

describe("E3 on the chassis — a car PRESSED against the driveway wall gets a true account too", () => {
  it("sc-pk-driveway wall #0, flank scrape cut at 35 km/h: rests in contact (≤ SWEEP_RESOLUTION_M) — the ending is the pin's, and the card, its flank along the wall, names no direction (E11)", () => {
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-pk-driveway")!;
    const obs = buildLessonWorldCore(compileScenario(spec, 1), loadDistrict(spec.map.districtId)).scenarioObstacles as any[];
    const walls: Box[] = obs
      .filter((o) => o.kind === "wall")
      .map((o) => ({ x: o.x, y: o.y, headingDeg: o.headingDeg, halfLengthM: o.lengthM / 2, halfWidthM: (o.thicknessM ?? 0.3) / 2 }));
    const w = obs.filter((o) => o.kind === "wall")[0];
    const box = walls[0];
    const rad0 = (w.headingDeg * Math.PI) / 180;
    const fx = Math.sin(rad0);
    const fy = Math.cos(rad0);
    const rx = Math.cos(rad0);
    const ry = -Math.sin(rad0);
    const toLocal = (x: number, y: number) => ({ u: (x - w.x) * rx + (y - w.y) * ry, v: (x - w.x) * fx + (y - w.y) * fy });
    const side = -1;
    const off = box.halfWidthM + 0.85 + 0.49;
    const cutV = -box.halfLengthM - 1.8 - 1.0;
    const brakeV = cutV - 1;
    const pre = (st: DriveState): Out => {
      const p = toLocal(st.x, st.y);
      const hRel = signed(st.headingDeg - w.headingDeg);
      const tgtU = p.v >= cutV ? 0 : p.v >= -25 ? side * off : 0;
      const hDes = Math.max(-30, Math.min(30, 8 * (tgtU - p.u)));
      const steer = Math.max(-1, Math.min(1, (hRel - hDes) / 12));
      if (p.v >= brakeV) return { brake: 1, steer };
      return { throttle: cruise(35, st.speedKmh), steer };
    };
    const r = run(spec.id, 1, { x: w.x - 45 * fx, y: w.y - 45 * fy, headingDeg: w.headingDeg }, pre, () => ({ brake: 1, steer: 0 }), [box], 60 * 30);
    expect(r.rest.sepM,"PRESSED: in contact or within SWEEP_RESOLUTION_M of the wall it struck").toBeLessThanOrEqual(SWEEP_RESOLUTION_M);
    expect(r.phase).toBe("completed");
    const e = endings(r);
    expect(r.impact).toEqual({ travel: "forward", body: "staticObject", end: "front" });
    expect(e.map((x) => [x.titleBg, x.text])).toEqual([[crashPinEndingCopy(false).titleBg, crashPinEndingCopy(false, r.impact!).explanationBg]]);
    // The ending is true here too: it stopped by the place it struck and stayed still.
    expect(r.holds.length).toBeGreaterThan(0);
    // Round 4 (E11). The bill's end is the FRONT, but the car rests ALONG the wall
    // (heading ~92° against the wall's 90°, its flank 0.014 m off it): the REAR half —
    // the way «назад» heads — is inside SWEEP_RESOLUTION_M of the wall too, so no
    // direction is free and the card is the direction-free one (round 3 said «назад»).
    expect(crashPinClearEnds({ x: r.rest.x, y: r.rest.y, headingDeg: r.rest.h }, heldStaticContactBodies(compileScenario(spec, 1).id))).toEqual({ front: false, rear: false });
    for (const h of r.holds) {
      expect(h.sepM).toBeLessThanOrEqual(SWEEP_RESOLUTION_M);
      expect(h.way).toBe("away");
      expect(h.towardAny).toBe(false);
      expect(h.card!.textBg).toMatch(/^Огледай се — огледала и рамо\. Щом е чисто: ако опира в удареното, леко я отдръпни — към него я притиска;/u);
      expect(h.lead).toBe("След удара — първо се огледай; ако колата опира, леко я отдръпни: ЗАДАЧА");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §4 · E5 / E6 — the way out is AWAY from the struck body, on a reverse drill
// ───────────────────────────────────────────────────────────────────────────
//
// The round-1 verifier's refutation (R1), on this row's own lesson: the product
// chassis in R reversed into sc-pk-driveway's wall rests PRESSED (0.001–0.137 m)
// with the wall ~4 m BEHIND its centre, and round 1's card, peek and lead told
// it «назад» — into the wall — and that forward presses it in. The harness pins
// the selector to D (`READY_DRIVELINE`, read by `sim.update` every step), so
// round 1 never drove this case; here the selector is set to R for the drive
// and restored in `finally`. Forward (D) into the same wall end face is the
// control: the body ahead, «назад».

function wallDrive(level: number, wallIdx: number, sel: "R" | "D", post: "hold" | "release") {
  const spec = SCENARIO_TEMPLATES.find((x) => x.id === "sc-pk-driveway")!;
  const obs = buildLessonWorldCore(compileScenario(spec, level as 1), loadDistrict(spec.map.districtId)).scenarioObstacles as any[];
  const w = obs.filter((o) => o.kind === "wall")[wallIdx];
  const box: Box = { x: w.x, y: w.y, headingDeg: w.headingDeg, halfLengthM: w.lengthM / 2, halfWidthM: (w.thicknessM ?? 0.3) / 2 };
  const rad = (w.headingDeg * Math.PI) / 180;
  const fx = Math.sin(rad);
  const fy = Math.cos(rad);
  const startV = -box.halfLengthM - 14;
  const startHeading = sel === "R" ? (w.headingDeg + 180) % 360 : w.headingDeg;
  const start = { x: w.x + startV * fx, y: w.y + startV * fy, headingDeg: startHeading };
  const was = READY_DRIVELINE.selector;
  (READY_DRIVELINE as { selector: string }).selector = sel;
  try {
    const r = run(spec.id, level, start, () => ({ throttle: 0.25, steer: 0 }), () => (post === "hold" ? { throttle: 0.25, steer: 0 } : {}), [box], 60 * 30);
    return { r, box, startHeading };
  } finally {
    (READY_DRIVELINE as { selector: string }).selector = was;
  }
}

/** Where the struck box's centre lies along the car's own nose axis at rest: > 0 ahead, < 0 behind. */
const bodyAheadM = (r: Ran, box: Box, headingDeg: number) => {
  const hr = (headingDeg * Math.PI) / 180;
  return (box.x - r.rest.x) * Math.sin(hr) + (box.y - r.rest.y) * Math.cos(hr);
};

const REVERSE_CORRECTIVE =
  "Разборът показва как се стига до такъв удар и какво го предотвратява: на заден ход — съвсем бавно, с поглед назад и в огледалата, и спиране навреме преди всичко зад колата.";
const GENERAL_CORRECTIVE =
  "Разборът показва как се стига до такъв удар и какво го предотвратява: по-ранно намаляване и достатъчно място около колата.";
const FRONT_SWING_CORRECTIVE =
  "Разборът показва как се стига до такъв удар и какво го предотвратява: при заден ход със завъртян волан предницата излиза встрани — затова следи и предния ъгъл, а не само това зад колата.";
const FORWARD_STATIC_CORRECTIVE =
  "Разборът показва как се стига до такъв удар и какво го предотвратява: по-ранно намаляване и достатъчна дистанция до всичко неподвижно напред.";

describe("E5 / E6, re-keyed by E9 / E10, on the chassis — sc-pk-driveway's wall struck in reverse and forward: every surface names the way AWAY from it", () => {
  for (const level of [1, 3, 5]) {
    for (const wallIdx of [0, 1]) {
      for (const post of ["hold", "release"] as const) {
        it(`L${level} wall #${wallIdx}, selector R, ${post} after the bill: PRESSED with the wall BEHIND — «напред», never «назад»; the corrective is the reversing one`, () => {
          const { r, box, startHeading } = wallDrive(level, wallIdx, "R", post);
          expect(r.billStep).toBeGreaterThan(60);
          // A straight reverse: the REAR half touched the wall at the bill (E9).
          expect(r.impact).toEqual({ travel: "reverse", body: "staticObject", end: "rear" });
          expect(r.rest.sepM, "PRESSED (≤ SWEEP_RESOLUTION_M)").toBeLessThanOrEqual(SWEEP_RESOLUTION_M);
          expect(bodyAheadM(r, box, startHeading), "the wall is BEHIND the car's centre").toBeLessThan(-2);
          expect(r.holds.length).toBeGreaterThan(0);
          for (const h of r.holds) {
            expect(h.sepM).toBeLessThanOrEqual(SWEEP_RESOLUTION_M);
            expect(h.lead).toBe("След удара — първо се огледай; ако колата опира, леко напред: ЗАДАЧА");
            expect(h.card!.textBg).toBe(
              "Огледай се — огледала и рамо. Щом е чисто: ако опира в удареното, съвсем леко напред — назад я притиска; ако не опира, потегли. Спри, ако някой идва.",
            );
            expect(h.card!.peekBg).toBe("Огледай се; ако опира — леко напред.");
            expect(h.card!.textBg).not.toMatch(/леко назад|газта напред само/u);
          }
          const e = endings(r);
          expect(e).toHaveLength(1);
          expect(e[0].titleBg).toBe("Край на упражнението след удара");
          expect(e[0].text.endsWith(REVERSE_CORRECTIVE)).toBe(true);
          expect(e[0].text).not.toContain("неподвижно напред");
        });
      }
      it(`L${level} wall #${wallIdx}, selector D, brake released: ${wallIdx === 0 ? "the FRONT half on the wall at the bill — «назад», and base's forward corrective verbatim" : "the bill falls on the driveway apron 5.4 m before the wall, not on a listed body — direction-free, the corrective that names no direction"}`, () => {
        const { r, box, startHeading } = wallDrive(level, wallIdx, "D", "release");
        // Wall #1 (the back wall, approached up the alley): the COLLISION bill is
        // booked at y ≈ 35 against the apron's kerb ramp (8 staticObject contacts,
        // 5.44 m from the wall), and the car rolls on into the wall inside that
        // open episode — no second bill, so the pin's impact is the apron one,
        // which is not one of the scenery's boxes: no side is known (E9).
        const known = wallIdx === 0;
        expect(r.impact).toEqual({ travel: "forward", body: "staticObject", end: known ? "front" : "neither" });
        expect(bodyAheadM(r, box, startHeading), "the wall is AHEAD of the car's centre").toBeGreaterThan(2);
        expect(r.holds.length).toBeGreaterThan(0);
        for (const h of r.holds) {
          if (known) {
            expect(h.lead).toBe("След удара — първо се огледай; ако колата опира, леко назад: ЗАДАЧА");
            expect(h.card!.textBg).toBe(
              "Огледай се — огледала и рамо. Щом е чисто: ако опира в удареното, съвсем леко назад — напред я притиска; ако не опира, потегли. Спри, ако някой идва.",
            );
            expect(h.card!.peekBg).toBe("Огледай се; ако опира — леко назад.");
          } else {
            expect(h.lead).toBe("След удара — първо се огледай; ако колата опира, леко я отдръпни: ЗАДАЧА");
            expect(h.card!.peekBg).toBe("Огледай се; ако опира — леко я отдръпни.");
          }
        }
        const e = endings(r);
        expect(e).toHaveLength(1);
        expect(e[0].text.endsWith(known ? FORWARD_STATIC_CORRECTIVE : GENERAL_CORRECTIVE)).toBe(true);
      });
    }
  }
  it("the selector is restored after every drive (the harness's own D is untouched)", () => {
    wallDrive(1, 0, "R", "hold");
    expect(READY_DRIVELINE.selector).toBe("D");
  });
});


// ───────────────────────────────────────────────────────────────────────────
// §5 · E9 / E10, amended by E11 / E13 — THE FRONT-SWING, and THE WEDGE
// ───────────────────────────────────────────────────────────────────────────
//
// Round 2's refutation (`endings-verify/r2/replay-pk26.json`): sc-pk-driveway
// L1, selector R from (−1.41, 42.58) heading 219.7°, steer 0.6, throttle 0.34,
// pressing 90 steps past the bill. The car reverses and its FRONT corner swings
// into wall #0 (9.0, 47.3); round 2's travel key said «напред», which drove it
// back into wall #0 (a new graded contact at step 653). Round 3 keyed the way on
// the END that touched at the bill (E9) and said «назад».
//
// Round 3's refutation (`endings-verify/r3/replay-builder-pk26.json`): on that
// same drive the REAR strikes wall #1 (11.0, 45.0) at 3 km/h 64 steps after the
// bill — inside the same open contact episode, so it is not billed and the pin
// does not re-arm — and the car rests with its rear 0.002 m from wall #1 and its
// front 0.071 m from wall #0. «назад» pressed the rear into wall #1. E11: a
// direction is named only while the end it heads toward is more than
// SWEEP_RESOLUTION_M clear of EVERY listed body on the pose the advice is shown
// on, so this car gets the direction-free advice. E13: every measurement here is
// taken against EVERY listed body (`heldStaticContactBodies`), never only the
// wall struck at the bill. A front-swing whose rear IS free (L5, from the
// round-2 sweep's row n2) keeps «назад» — so the test can still fail both ways.

interface PinCfg {
  level: 1 | 3 | 5;
  start: { x: number; y: number; headingDeg: number };
  steer: number;
  throttle: number;
}
const PK26: PinCfg = { level: 1, start: { x: -1.41, y: 42.58, headingDeg: 219.7 }, steer: 0.6, throttle: 0.34 };
// The round-2 sweep's sc-pk-driveway L5 b0 n2 (`tmp-v2-wayout` seed 12345), inputs verbatim.
const PK_L5_N2: PinCfg = {
  level: 5,
  start: { x: 6.716715775995863, y: 54.785382059071296, headingDeg: 335.8825256167364 },
  steer: 1,
  throttle: 0.33708269602483265,
};

/**
 * Reverse on a lock into the driveway (selector R), keep pressing 90 steps past
 * the bill, release; at the first crashPinned frame `act` for 90 steps: "card"
 * does literally what the hold says on THAT frame (back → R, forward → D,
 * straight wheels, throttle 0.25; the direction-free advice names no selector,
 * so it is no input), "R" / "D" force a direction, "none" does nothing.
 */
function pinDriveChassis(cfg: PinCfg, act: "card" | "none" | "R" | "D") {
  const spec = SCENARIO_TEMPLATES.find((x) => x.id === "sc-pk-driveway")!;
  const lesson = compileScenario(spec, cfg.level);
  const listed = heldStaticContactBodies(lesson.id);
  let billK = -1;
  let holdK = -1;
  let impact: CrashPinImpact | null = null;
  let liveWay: string | null = null;
  let sepsHold: number[] = [];
  let sepsMin: number[] = [];
  let sepsAfter: number[] = [];
  let billed = 0;
  const holds: HoldSeen[] = [];
  const said: Said[] = [];
  const was = READY_DRIVELINE.selector;
  (READY_DRIVELINE as { selector: string }).selector = "R";
  try {
    const o = driveIntoContact({
      lesson,
      raw: loadDistrict(spec.map.districtId),
      start: cfg.start,
      deltas: [1 / 60],
      maxSteps: 60 * 26,
      control: (st: DriveState) => {
        if (billK < 0) return { throttle: cfg.throttle, steer: cfg.steer };
        if (holdK < 0) return st.step < billK + 90 ? { throttle: cfg.throttle, steer: cfg.steer } : {};
        if (st.step < holdK + 90) {
          const w = act === "card" ? liveWay : act === "R" ? "back" : act === "D" ? "forward" : null;
          if (w === "back") {
            (READY_DRIVELINE as { selector: string }).selector = "R";
            return { throttle: 0.25, steer: 0 };
          }
          if (w === "forward") {
            (READY_DRIVELINE as { selector: string }).selector = "D";
            return { throttle: 0.25, steer: 0 };
          }
          return {};
        }
        return { brake: 1 };
      },
      onStep: (tick: SimTick, step: { state: any; hudEvents: any[] }) => {
        const k = Math.round(tick.t * 60);
        const s = step.state;
        const h = tick.headingDeg ?? 0;
                if (billK < 0 && s.events.some((e: any) => e.kind === "violation" && e.code === "COLLISION")) {
          billK = k;
          impact = s.crashPin?.impact ?? null;
        }
        if (s.phase === "driving" && routeHoldForSession(s) === "crashPinned") {
          const way = routeHoldWayOutForSession(s);
          liveWay = way;
          if (holdK < 0) holdK = k;
          if (holds.length === 0 || k - holds[holds.length - 1].k >= 60 || holds[holds.length - 1].way !== liveWay) {
            const card = advisorPromptForSession(s);
            holds.push({
              k,
              lead: objectiveTitleUnderHold("ЗАДАЧА", "crashPinned", way),
              card: card === null ? null : { textBg: card.textBg, keys: card.keys, ...(card.peekBg ? { peekBg: card.peekBg } : {}) },
              sepM: Math.min(...sepsAt(tick.position.x, tick.position.y, h, listed)),
              way: liveWay,
              sepsAll: sepsAt(tick.position.x, tick.position.y, h, listed),
              towardAny: towardAnyListed(tick.position.x, tick.position.y, h, listed, liveWay),
            });
          }
        }
        if (holdK >= 0 && k >= holdK && k < holdK + 90) {
          const now = sepsAt(tick.position.x, tick.position.y, h, listed);
          if (k === holdK) {
            sepsHold = now;
            sepsMin = now.slice();
          } else sepsMin = sepsMin.map((v, i) => Math.min(v, now[i]));
        }
        if (holdK >= 0 && k === holdK + 90) sepsAfter = sepsAt(tick.position.x, tick.position.y, h, listed);
        for (const hh of step.hudEvents) {
          if (hh.kind === "lesson") said.push({ k, kind: hh.kind, titleBg: hh.titleBg ?? "", text: String(hh.explanationBg ?? "") });
        }
      },
    } as never);
    billed = o.collisions.length;
    const judged = o.judged as Array<{ graded: boolean; bookedStep: number; impactKmh: number }>;
    return {
      billK,
      holdK,
      impact: impact as CrashPinImpact | null,
      listed,
      sepsHold,
      sepsMin,
      sepsAfter,
      billed,
      holds,
      ends: said.filter((x) => /^Край/u.test(x.titleBg)),
      gradedBetweenBillAndHold: judged.filter((j) => j.graded && j.bookedStep > billK && j.bookedStep < holdK).map((j) => j.bookedStep),
      gradedAfterHold: judged.filter((j) => j.graded && j.bookedStep >= holdK).map((j) => [j.bookedStep, +j.impactKmh.toFixed(2)]),
    };
  } finally {
    (READY_DRIVELINE as { selector: string }).selector = was;
  }
}

const CARD_AWAY =
  "Огледай се — огледала и рамо. Щом е чисто: ако опира в удареното, леко я отдръпни — към него я притиска; ако не опира, потегли. Спри, ако някой идва.";
const CARD_BACK =
  "Огледай се — огледала и рамо. Щом е чисто: ако опира в удареното, съвсем леко назад — напред я притиска; ако не опира, потегли. Спри, ако някой идва.";

describe("E11 / E13 on the chassis — THE WEDGE: the round-2 decisive drive, its rear on a SECOND wall after the bill, gets no direction", () => {
  it("sc-pk-driveway L1 (pk26): one bill (front-swing into wall #0), an unbilled rear contact with wall #1 before the hold; PRESSED at both walls; card, peek and lead direction-free on every hold frame; the front-swing corrective", () => {
    const d = pinDriveChassis(PK26, "none");
    expect(d.listed).toHaveLength(2);
    expect(d.billK).toBe(322);
    expect(d.billed, "one COLLISION bill").toBe(1);
    expect(d.impact).toEqual({ travel: "reverse", body: "staticObject", end: "front" });
    // The second contact: graded by the rig, not billed, between the bill and the hold.
    expect(d.gradedBetweenBillAndHold.length).toBeGreaterThan(0);
    // Measured against EVERY listed body: pressed at the front (wall #0) AND at the rear (wall #1).
    expect(d.sepsHold[0]).toBeLessThanOrEqual(SWEEP_RESOLUTION_M);
    expect(d.sepsHold[1]).toBeLessThanOrEqual(SWEEP_RESOLUTION_M);
    expect(d.holds.length).toBeGreaterThan(0);
    for (const h of d.holds) {
      expect(h.way).toBe("away");
      expect(h.card!.textBg).toBe(CARD_AWAY);
      expect(h.card!.peekBg).toBe("Огледай се; ако опира — леко я отдръпни.");
      expect(h.lead).toBe("След удара — първо се огледай; ако колата опира, леко я отдръпни: ЗАДАЧА");
      expect(h.sepsAll.every((v) => v <= SWEEP_RESOLUTION_M)).toBe(true);
    }
    // E10: the corrective keeps the BILL's end — the billed crash was the front swing.
    expect(d.ends).toHaveLength(1);
    expect(d.ends[0].titleBg).toBe("Край на упражнението след удара");
    expect(d.ends[0].text.endsWith(FRONT_SWING_CORRECTIVE)).toBe(true);
    expect(d.ends[0].k).toBe(986);
  });

  it("why no direction: doing what the card says (no selector named → no input) lowers neither separation and books nothing; «назад» keeps the rear on wall #1, «напред» re-strikes wall #0", () => {
    const card = pinDriveChassis(PK26, "card");
    const none = pinDriveChassis(PK26, "none");
    expect(card.holds.every((h) => h.way === "away")).toBe(true);
    card.sepsHold.forEach((v, i) => expect(card.sepsMin[i]).toBeGreaterThanOrEqual(v - 0.005));
    expect(card.billed).toBe(1);
    expect(card.gradedAfterHold).toEqual([]);
    expect(card.ends.map((e) => e.k)).toEqual(none.ends.map((e) => e.k));
    // «назад» (R, straight, 0.25): the rear stays PRESSED on wall #1 — the way is not free.
    const back = pinDriveChassis(PK26, "R");
    expect(back.sepsAfter[1]).toBeLessThanOrEqual(SWEEP_RESOLUTION_M);
    expect(back.sepsMin[1]).toBeLessThanOrEqual(back.sepsHold[1] + 0.005);
    // «напред» (D, straight, 0.25): back into wall #0 — a new graded contact, the ending later.
    const fwd = pinDriveChassis(PK26, "D");
    expect(fwd.sepsMin[0]).toBeLessThan(fwd.sepsHold[0] - 0.005);
    expect(fwd.gradedAfterHold.length).toBeGreaterThan(0);
    expect(fwd.ends[0].k).toBeGreaterThan(none.ends[0].k);
  });
});

describe("E9 / E10 / E11 on the chassis — a front-swing reverse strike whose REAR is free: the way out is BACK, and its corrective names the swing", () => {
  it("sc-pk-driveway L5 (the sweep's n2): impact reverse/staticObject/front; the rear clear of every listed body; card, peek and lead «назад»; the front-swing corrective", () => {
    const d = pinDriveChassis(PK_L5_N2, "none");
    expect(d.impact).toEqual({ travel: "reverse", body: "staticObject", end: "front" });
    expect(d.billed).toBe(1);
    expect(Math.min(...d.sepsHold), "PRESSED at the hold").toBeLessThanOrEqual(SWEEP_RESOLUTION_M);
    expect(d.holds.length).toBeGreaterThan(0);
    for (const h of d.holds) {
      expect(h.way).toBe("back");
      expect(h.towardAny).toBe(false);
      expect(h.lead).toBe("След удара — първо се огледай; ако колата опира, леко назад: ЗАДАЧА");
      expect(h.card!.textBg).toBe(CARD_BACK);
      expect(h.card!.peekBg).toBe("Огледай се; ако опира — леко назад.");
    }
    expect(d.ends).toHaveLength(1);
    expect(d.ends[0].text.endsWith(FRONT_SWING_CORRECTIVE)).toBe(true);
    expect(d.ends[0].text).not.toContain("спиране навреме преди всичко зад колата");
  });

  it("DOING what the card says (R, straight wheels, throttle 0.25): no listed body comes closer, the car comes free of the wall, no contact of any kind — and the opposite («напред») presses it in", () => {
    const card = pinDriveChassis(PK_L5_N2, "card");
    expect(card.holds[0].way).toBe("back");
    card.sepsHold.forEach((v, i) => expect(card.sepsMin[i], `listed body #${i}`).toBeGreaterThanOrEqual(v - 0.005));
    expect(Math.min(...card.sepsAfter)).toBeGreaterThan(SWEEP_RESOLUTION_M);
    expect(card.billed).toBe(1);
    expect(card.gradedAfterHold).toEqual([]);
    const opp = pinDriveChassis(PK_L5_N2, "D");
    expect(Math.min(...opp.sepsMin)).toBeLessThanOrEqual(Math.min(...opp.sepsHold) + 0.005);
    expect(Math.min(...opp.sepsAfter)).toBeLessThanOrEqual(SWEEP_RESOLUTION_M);
  });
});


// ───────────────────────────────────────────────────────────────────────────
// §6 · E9 — where the bodies come from: the shell, and the harnesses that stand in for it
// ───────────────────────────────────────────────────────────────────────────

describe("E9 — the session is handed the held scenery's collider boxes, by the shell and by the harnesses alike", () => {
  it("heldStaticContactBodies boxes the template's held walls and props with the numbers their colliders are mounted with", () => {
    expect(heldStaticContactBodies(compileScenario(SCENARIO_TEMPLATES.find((x) => x.id === "sc-pk-driveway")!, 1).id)).toEqual([
      { x: 9.0, y: 47.3, headingDeg: 90, halfLengthM: 2.0, halfWidthM: 0.3 },
      { x: 11.0, y: 45.0, headingDeg: 0, halfLengthM: 2.5, halfWidthM: 0.3 },
    ]);
    expect(heldStaticContactBodies(compileScenario(SC_HZ_BRAKE_DONT_SWERVE, 3).id)).toEqual([BLOCK]);
    // A wall without a thickness takes the component's default; a prop takes PROP_COLLIDERS.
    expect(
      staticContactBodiesOf([
        { kind: "wall", x: 1, y: 2, headingDeg: 30, lengthM: 6 },
        { kind: "prop", prop: "cone", x: 3, y: 4, headingDeg: 0 },
        { kind: "vehicle", x: 5, y: 6, headingDeg: 0, seed: 1 },
      ] as never),
    ).toEqual([
      { x: 1, y: 2, headingDeg: 30, halfLengthM: 3, halfWidthM: WALL_DEFAULT_THICKNESS_M / 2 },
      { x: 3, y: 4, headingDeg: 0, halfLengthM: PROP_COLLIDERS.cone.half.z, halfWidthM: PROP_COLLIDERS.cone.half.x },
    ]);
    expect(PROP_COLLIDERS).toBe(PROP_COLLIDER_DIMS);
    expect(heldStaticContactBodies("l-first-drive")).toEqual([]);
  });

  it("LessonPlayShell creates EVERY session with them, and so do the two harnesses this lane measures with", () => {
    const CALL = "createLessonSession(lesson, { staticContactBodies: heldStaticContactBodies(lesson.id) })";
    const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8").replace(/\s+/g, " ");
    const shell = read("../../../../../components/sim/lesson-ui/LessonPlayShell.tsx");
    expect(shell.split(CALL).length - 1).toBe(2);
    expect(shell).not.toMatch(/createLessonSession\(lesson\)/);
    for (const h of ["./rapierContactDrive.ts", "./liveChainReplay.ts"]) {
      const src = read(h);
      expect(src.split(CALL).length - 1, h).toBe(1);
      expect(src, h).not.toMatch(/createLessonSession\(lesson\)/);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// T1 (lane rbreverse, sc-roundabout-entry:9e85f27e; integrator rulings R6 / R6a)
// — THE LOOK COMES BEFORE THE MOVE on every hold frame the chassis raises, on
// both lessons the brief names beside the ring: sc-hz-brake-dont-swerve CUT-R
// (a free car, the block behind) and sc-pk-driveway's wall struck in R and in D
// (the «напред», «назад» and direction-free variants). Through 479127b every
// card, peek and lead ordered the move first («първо … назад / напред / я
// отдръпни») and named no look; the ring's own frames are pinned in
// rbreverse-ring-reverse.test.ts.
// ───────────────────────────────────────────────────────────────────────────

describe("T1 · look before move on the chassis's hold frames — sc-hz-brake-dont-swerve CUT-R and sc-pk-driveway (R / D)", () => {
  const LOOK = /огледа/iu;
  const MOVE = /назад|напред|отдръпни|потегл/u;
  const lookFirst = (s: string) => {
    const l = s.search(LOOK);
    const m = s.search(MOVE);
    return l >= 0 && m > l;
  };
  it("every card, peek and lead on every hold frame names the look before the first move, and all three ways out are driven", () => {
    const runs: Ran[] = [
      run(SC_HZ_BRAKE_DONT_SWERVE.id, 1, { x: 4.06, y: 15, headingDeg: 0 }, passAndCut(6.2), () => ({ brake: 1, steer: 0 }), [BLOCK], 60 * 45),
      wallDrive(1, 0, "R", "hold").r,
      wallDrive(1, 0, "D", "release").r,
      wallDrive(1, 1, "D", "release").r,
    ];
    const ways = new Set<string>();
    let frames = 0;
    const bad: string[] = [];
    for (const r of runs) {
      expect(r.holds.length).toBeGreaterThan(0);
      for (const h of r.holds) {
        frames++;
        ways.add(h.way);
        for (const [surface, text] of [["card", h.card?.textBg ?? ""], ["peek", h.card?.peekBg ?? ""], ["lead", h.lead ?? ""]] as const) {
          if (!lookFirst(text)) bad.push(`${h.k} ${h.way} ${surface}: «${text}»`);
        }
      }
    }
    expect(bad).toEqual([]);
    expect(frames).toBeGreaterThan(10);
    expect([...ways].sort()).toEqual(["away", "back", "forward"]);
  });
});
