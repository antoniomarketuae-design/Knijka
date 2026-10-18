/**
 * sc-hz-brake-dont-swerve:a7d0dd29 [critical] — THE CLAUSE rig-w3d LEFT OPEN:
 * «both tasks get a tick, „Спри преди препятствието“ included» (lane hztick,
 * round 2).
 *
 * WHERE THE ROW STOOD (rig-w3d at 8cb0707). The billing was repaired — a drive
 * into the fallen-load block bills the 10-point опасна COLLISION at the
 * contact's own step on every display. The verifier still refused to close it:
 * on the NO-BRAKE run (49.6 км/ч one step before the contact, −3.8 км/ч one
 * step after, brake 0 throughout) the task «Спри преди препятствието — с пълна
 * спирачка, В своята лента» ticked ✓ thirty steps after the strike, with the
 * car rolling back off the block, and the debrief printed «Задачите от
 * маршрута са изпълнени — този урок не пада заради маршрута».
 *
 * ROUND 1 asked «did the impact ARREST the car?» and read the answer off the
 * speed on the bill's grid point. Its verifier drove through it twice: a late
 * brake with the wheel turned leaves +1.6 … +2.6 км/ч there (19 of 90 swerves
 * still ticked), and a touch at 0.97 км/ч was never «travelling» (29 of 81
 * pedal settings still ticked). And the drives it did refuse ended, ten
 * seconds later, on «колата остана притисната на място» over a car that had
 * rolled 2.24 m clear.
 *
 * THE RULE NOW (integrator decision 2026-10-12): the task is not done by a car
 * that has TOUCHED the obstacle it names. The gate authors the block's own
 * rectangle (`ReachZoneParams.stopShortOf`); a graded static-object contact at
 * whose grid point the car's body is on that rectangle closes the task for the
 * rest of the attempt — any speed, any yaw, latched or not — and a contact
 * with any other body leaves it alone.
 *
 * WHAT THIS FILE HOLDS THE PRODUCT TO, on the product's chassis
 * (rapierContactDrive: rapier, VehicleRig's contact path, LessonScene's graded
 * call, the real `applyTick`):
 *  §0 the rectangle IS the block (the trace rect, the scene's collider), on
 *     every rung, and nothing else in the catalogue authors the term.
 *  §1 the rig's cells (LATE50, FLAT, BRAKE30), round 1's TOUCH and the
 *     verifier's three refutations (a quarter-lock and a half-lock late brake,
 *     a 0.97 км/ч touch) at L1 and L3: task 2 NOT ticked, the route sentence
 *     not printed, the bill unchanged, the row and the debrief say why, the
 *     drive ends by itself on a sentence that is true of it. EVERY ONE IS RUN
 *     TWICE — with the lesson as compiled and with the one key struck out —
 *     and the second run is the defect: the same bill, and the ✓.
 *  §2 the verifier's whole sweeps: 90 swerves and 81 slow touches. No drive
 *     that touched the block keeps the tick; no drive that did not touch it
 *     differs by one byte from the lesson without the key.
 *  §3 the stops the driver MADE keep the tick: the committed correct demo, and
 *     stops 0.05 / 0.2 / 0.5 / 1.0 m short of the block, straight and yawed.
 *  §4 one drive, one sheet on every display (ADR-014).
 *  §5 the reason survives the wire.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { obbSeparationM, playerObb, SWEEP_RESOLUTION_M } from "../../../collision";
import type { LessonSpec } from "../../../contracts";
import { objectiveDetailText, sessionVerdict } from "../../../hud/SessionEndScreen";
import type { SimTick } from "../../../rules";
import { heldSceneryFor } from "../../../scene/scenarioSceneryProps";
import { hzBrakeDontSwerveObstacles, recordScHzBrakeDontSwerveDrive } from "../../../traces/scHzBrakeDontSwerve";
import { buildDebrief } from "../../debrief";
import { applyTick, buildLessonResult, createLessonSession, type LessonStepResult } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import { compileScenario } from "../compile";
import { scoreRubric } from "../rubric";
import { SCENARIO_TEMPLATES } from "../templates";
import { SC_HZ_BRAKE_DONT_SWERVE } from "../templates-hazards2";
import { loadDistrict } from "./witnessLiveRung";
import {
  driveIntoContact,
  initRapier,
  phased,
  sheetDigest,
  type ContactDriveOutcome,
  type DriveState,
} from "./rapierContactDrive";

beforeAll(async () => {
  await initRapier();
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "../../../../..");

const STOP_ID = "sc-hzbds-stop";
const STOP_TASK = "Спри преди препятствието — с пълна спирачка, В своята лента";
const ROUTE_DONE = "Задачите от маршрута са изпълнени";
/** The task row's reason on the end card (hud/SessionEndScreen objectiveDetailText). */
const VOID_ROW = "Не се отчете: колата удари препятствието — задачата е да спреш преди него.";
/** The debrief's reason line (lessons/debrief.ts). */
const VOID_DEBRIEF = `Задачата «${STOP_TASK}» не се отчете: колата удари препятствието — задачата е да спреш преди него. Спирай по-рано.`;
/** Gate 1's ending for a chain that has stalled at the end of the route
 *  (lessons/engine.ts — unchanged copy). */
const ROUTE_END_TITLE = "Край на маршрута";
const ROUTE_END_TEXT =
  "Стигна края на маршрута, затова урокът приключва тук. Част от задачите останаха неизпълнени — разборът показва всяка от тях и всяка грешка, вместо да те връща да караш маршрута отново.";
/** The crash pin's sentence (FR-B5-JAM) — true only of a car pressed to what it hit. */
const PINNED = "притисната";

/** The block: the trace harness's rect, by value (§0 pins it). */
const BLOCK = { x: 4.06, y: 190, headingDeg: 0, halfLengthM: 1.2, halfWidthM: 0.8 };
/** How far the car's box is from the block, m (≤ 0: overlapping). */
const sepOf = (p: { x: number; y: number }, headingDeg: number) =>
  obbSeparationM(playerObb(p.x, p.y, headingDeg), BLOCK);

const SPAWN = { x: 4.06, y: 15, headingDeg: 0 };
const DISTRICT = () => loadDistrict(SC_HZ_BRAKE_DONT_SWERVE.map.districtId);

/** The lesson as compiled, or with the ONE key this lane adds struck out —
 *  which is the lesson the base shipped (every line of the repair is behind
 *  `stopShortOf`). */
function lessonAt(level: 1 | 3 | 5, withoutTheKey = false): LessonSpec {
  const lesson = compileScenario(SC_HZ_BRAKE_DONT_SWERVE, level);
  if (!withoutTheKey) return lesson;
  return {
    ...lesson,
    objectives: lesson.objectives.map((o) => {
      const { stopShortOf: _struck, ...params } = o.params as Record<string, unknown>;
      return { ...o, params };
    }),
  };
}

/**
 * THE LESSON THE BASE SHIPPED, exactly — `stopShortOf` struck AND `restInLane` (lane lanegate round 2,
 * sc-hz-brake-dont-swerve:cb563b2d), the later key on the same gate. §1's `was` is «the base's sheet», and with
 * `restInLane` left in it is not: that key ticks only a HALTED car wholly in its lane, so LATE50's bounce off the
 * block — read ≤ 6 km/h on a MOVING grid point, 907, the measured base tick — would be ticked at the first halted
 * frame instead (1071). The sweeps (§2) keep `lessonAt(…, true)`: they isolate THIS key's effect with the other one
 * present on both arms, which is what «no other drive changes» means.
 */
function baseLessonAt(level: 1 | 3 | 5): LessonSpec {
  const lesson = lessonAt(level, true);
  return {
    ...lesson,
    objectives: lesson.objectives.map((o) => {
      const { restInLane: _laneStruck, ...params } = o.params as Record<string, unknown>;
      return { ...o, params };
    }),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// The drives — the verifier's own controllers (hztick-verify), decided per
// physics step from the car after the previous one (ADR-017's rule for the rig)
// ───────────────────────────────────────────────────────────────────────────

interface Ctx {
  /** The session has billed a COLLISION (set by the engine tap, one step on). */
  billed: boolean;
}
type Control = (st: DriveState, ctx: Ctx) => { throttle?: number; brake?: number; steer?: number };

/** 47.45 on this controller is 49.87 км/ч at the block (the rig's LATE50 plan: 49.6 ± 2). */
const HOLD = 47.45;
const cruise = (target: number, kmh: number) => {
  const err = target - kmh;
  return err > 0 ? Math.min(1, err / 5 + 0.2) : 0.12;
};
/** No brake at all; every pedal released at the bill (the rig's LATE50). */
const late50: Control = (st, c) =>
  c.billed ? { throttle: 0, brake: 0, steer: 0 } : { throttle: cruise(HOLD, st.speedKmh), brake: 0, steer: 0 };
/** 58.9 км/ч into the block, no brake (the rig's FLAT). */
const flat: Control = (st, c) =>
  c.billed
    ? { throttle: 0, brake: 0, steer: 0 }
    : { throttle: cruise(st.y >= 88 ? 58.9 : HOLD, st.speedKmh), brake: 0, steer: 0 };
/** The pedal `brake` from `y` on, held after the bill. */
const brakeFrom = (y: number, brake = 1): Control => (st, c) => {
  if (c.billed) return { throttle: 0, brake: 1, steer: 0 };
  if (st.y >= y) return { throttle: 0, brake, steer: 0 };
  return { throttle: cruise(HOLD, st.speedKmh), brake: 0, steer: 0 };
};
/** Brake `b` and wheel `s` from `fromY`; after the bill the whole pedal, wheel straight. */
const swerve = (fromY: number, s: number, b: number): Control => (st, c) => {
  if (c.billed) return { brake: 1, steer: 0 };
  if (st.y >= fromY) return { throttle: 0, brake: b, steer: s };
  return { throttle: cruise(HOLD, st.speedKmh), brake: 0, steer: 0 };
};
/** The whole pedal from `y` down to `vSwitch` км/ч, then the light pedal `b2` to the end. */
const twoStage = (y: number, vSwitch: number, b2: number): Control => {
  let light = false;
  return (st) => {
    if (st.y >= y) {
      if (st.speedKmh <= vSwitch) light = true;
      return { throttle: 0, brake: light ? b2 : 1, steer: 0 };
    }
    return { throttle: cruise(HOLD, st.speedKmh), brake: 0, steer: 0 };
  };
};
/**
 * Come to rest with the car's box `gapM` short of the block, closed loop on
 * the measured separation, then hold the brake. `yawDeg`: turn the nose that
 * far off the lane's axis from y 181 (− = left), then straighten — a yawed stop.
 */
const stopShort = (gapM: number, yawDeg = 0): Control => {
  let parked = false;
  let yawed = yawDeg === 0;
  return (st) => {
    const d = sepOf(st, st.headingDeg) - gapM;
    if (parked || d <= 0.02) {
      parked = true;
      return { throttle: 0, brake: 1, steer: 0 };
    }
    if (st.y < 150) return { throttle: cruise(HOLD, st.speedKmh), brake: 0, steer: 0 };
    // Signed deviation from the lane's axis, deg (− = nose to the left).
    const dev = ((st.headingDeg + 180) % 360) - 180;
    if (!yawed && Math.abs(dev) >= Math.abs(yawDeg)) yawed = true;
    const s = !yawed && st.y >= 181 ? (yawDeg < 0 ? 0.35 : -0.35) : 0;
    // A 3 m/s² profile to the target, never under 1.8 км/ч until it is reached
    // (≤ 1 км/ч is «standing» to the rule engine: a slower crawl would be
    // ticked half a second in, short of the gap this drive is meant to reach).
    const vDes = Math.max(1.8, Math.sqrt(2 * 3 * Math.max(0, d - 0.15)) * 3.6);
    const err = vDes - st.speedKmh;
    if (err >= 0) return { throttle: Math.min(0.6, err / 6 + 0.04), brake: 0, steer: s };
    return { throttle: 0, brake: Math.min(1, -err / 5 + 0.05), steer: s };
  };
};

interface Heard {
  /** The last tick the session heard (the session's own `lastTick` keeps no heading). */
  last: SimTick | null;
  /** Every HUD event the engine raised: its grid point, the car there, its text. */
  hud: Array<{ k: number; kind: string; titleBg: string; text: string; speedKmh: number; sepM: number }>;
  /** Every graded contact a tick carried: its grid point, the car's speed one
   *  grid point before and at it, and how far its box stood from the block. */
  contacts: Array<{ k: number; withWhat: string; before: number; at: number; sepM: number }>;
}
type Driven = ContactDriveOutcome & Heard;

function drive(
  lesson: LessonSpec,
  control: Control,
  opts: { deltas?: readonly number[]; maxSteps?: number } = {},
): Driven {
  const ctx: Ctx = { billed: false };
  const hud: Heard["hud"] = [];
  const contacts: Heard["contacts"] = [];
  let before = 0;
  let last: SimTick | null = null;
  const o = driveIntoContact({
    lesson,
    raw: DISTRICT(),
    start: SPAWN,
    control: (st) => control(st, ctx),
    deltas: opts.deltas ?? [1 / 60],
    maxSteps: opts.maxSteps ?? 60 * 60,
    onStep: (tick: SimTick, step: LessonStepResult) => {
      const k = Math.round(tick.t * 60);
      const sepM = sepOf(tick.position, tick.headingDeg);
      for (const e of tick.events) {
        if (e.kind === "collision") contacts.push({ k, withWhat: e.withWhat, before, at: tick.speedKmh, sepM });
      }
      for (const h of step.hudEvents) {
        hud.push({
          k,
          kind: h.kind,
          titleBg: (h as { titleBg?: string }).titleBg ?? "",
          text: JSON.stringify(h),
          speedKmh: tick.speedKmh,
          sepM,
        });
      }
      if (step.state.events.some((e) => e.kind === "violation" && e.code === "COLLISION")) ctx.billed = true;
      before = tick.speedKmh;
      last = tick;
    },
  });
  return { ...o, hud, contacts, last };
}

const debriefOf = (o: ContactDriveOutcome, lesson: LessonSpec) =>
  buildDebrief(lesson, o.result, { coachedMistakes: o.result.coachedMistakes }).text;
/** What a sheet bills, and to whom: the part of a result no repair may move. */
const billOf = (o: ContactDriveOutcome) => ({
  collisions: o.collisions,
  ledger: o.session.events.map((e) => [e.kind, e.code, e.kind === "violation" ? e.points : null, e.t]),
  score: o.result.score,
  effectiveScore: o.result.effectiveScore,
  passed: o.result.passed,
  verdict: sessionVerdict(o.result),
  stars: scoreRubric(o.result, SC_HZ_BRAKE_DONT_SWERVE.rubric!).stars,
  task1: o.result.objectives[0],
});

// ───────────────────────────────────────────────────────────────────────────
// §0 · the rectangle IS the block
// ───────────────────────────────────────────────────────────────────────────

describe("the body «Спри преди препятствието» names is the fallen-load block, by value", () => {
  const authored = SC_HZ_BRAKE_DONT_SWERVE.success.find((o) => o.id === STOP_ID)!.params as {
    stopShortOf?: typeof BLOCK;
  };

  it("the template's rectangle is the trace harness's one rect and the scene's collider", () => {
    expect(authored.stopShortOf).toEqual(BLOCK);
    const [rect] = hzBrakeDontSwerveObstacles();
    expect(hzBrakeDontSwerveObstacles().length).toBe(1);
    expect({
      x: rect.x,
      y: rect.y,
      headingDeg: rect.headingDeg,
      halfLengthM: rect.halfLengthM,
      halfWidthM: rect.halfWidthM,
    }).toEqual(BLOCK);
    expect(rect.withWhat).toBe("staticObject");
    // The live collider: a `wall` is [thicknessM/2, heightM/2, lengthM/2] about (x, y).
    const walls = heldSceneryFor(lessonAt(3).id, DISTRICT()).filter((o) => o.kind === "wall");
    expect(walls.length).toBe(1);
    const wall = walls[0] as { x: number; y: number; headingDeg: number; lengthM: number; thicknessM: number };
    expect({
      x: wall.x,
      y: wall.y,
      headingDeg: wall.headingDeg,
      halfLengthM: wall.lengthM / 2,
      halfWidthM: wall.thicknessM / 2,
    }).toEqual(BLOCK);
  });

  it("every rung carries it unchanged (the aid ladder forgives precision, not a touch), on its own object", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      const stop = compileScenario(SC_HZ_BRAKE_DONT_SWERVE, level).objectives.find((o) => o.id === STOP_ID)!;
      expect((stop.params as { stopShortOf?: unknown }).stopShortOf, `L${level}`).toEqual(BLOCK);
      expect((stop.params as { stopShortOf?: unknown }).stopShortOf, `L${level} shares the template's object`).not.toBe(
        authored.stopShortOf,
      );
    }
    // …and the session parses it (a key the whitelist drops never reaches here).
    const session = createLessonSession(lessonAt(1));
    const params = session.objectives.find((o) => o.spec.id === STOP_ID)!.params;
    expect(params.kind === "reachZone" && params.stopShortOf).toEqual(BLOCK);
  });

  it("ONE gate in the catalogue authors the term (scoped as narrowly as the defect)", () => {
    const authors: string[] = [];
    for (const t of SCENARIO_TEMPLATES) {
      for (const o of t.success) {
        if ((o.params as { stopShortOf?: unknown }).stopShortOf !== undefined) authors.push(`${t.id}/${o.id}`);
      }
    }
    expect(authors).toEqual([`sc-hz-brake-dont-swerve/${STOP_ID}`]);
  });

  it("it is the LAST task of its drill — so a refusal must also be an ending, and a tick ends the attempt", () => {
    const ids = SC_HZ_BRAKE_DONT_SWERVE.success.map((o) => o.id);
    expect(ids[ids.length - 1]).toBe(STOP_ID);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §1 · the rig's cells, round 1's, and the verifier's refutations — L1 and L3
// ───────────────────────────────────────────────────────────────────────────

interface Cell {
  name: string;
  what: string;
  control: () => Control;
  maxSteps?: number;
  /**
   * MEASURED at 60 Hz, L1 and L3 alike, base and tree alike (the car's
   * trajectory is the chassis's; nothing here moves it): the grid point of the
   * first contact with the block and the car's speed one grid point before and
   * at it, км/ч; whether task 1 was ticked; and the grid point the BASE ticked
   * task 2 at (null: it did not — FLAT never reaches task 2).
   */
  contactStep: number;
  before: number;
  at: number;
  task1Done: boolean;
  baseTickStep: number | null;
  /** The grid point the drive ends itself at on the tree (gate 1: half a
   *  second under the cap at the end of the route). */
  endStep: number;
}
const CELLS: Cell[] = [
  {
    name: "LATE50",
    what: "the rig's cell: 50 км/ч dead straight, no brake, every pedal released at the crash",
    control: () => late50,
    contactStep: 877,
    before: 49.869,
    at: -3.866,
    task1Done: true,
    baseTickStep: 907,
    endStep: 907,
  },
  {
    name: "FLAT",
    what: "the rig's cell: 58.9 км/ч into the block (over task 1's ceiling), no brake",
    control: () => flat,
    contactStep: 811,
    before: 58.902,
    at: -4.703,
    task1Done: false,
    baseTickStep: null,
    endStep: 841,
  },
  {
    name: "BRAKE30",
    what: "the rig's cell: the whole pedal, too late — 30 км/ч left at the block",
    control: () => brakeFrom(180.25),
    contactStep: 884,
    before: 30.284,
    at: -2.126,
    task1Done: true,
    baseTickStep: 914,
    endStep: 914,
  },
  {
    name: "TOUCH",
    what: "round 1's cell: under the cap for the last metre, 2.6 км/ч at the block",
    control: () => brakeFrom(176.31, 0.995),
    contactStep: 918,
    before: 2.585,
    at: -0.131,
    task1Done: true,
    baseTickStep: 948,
    endStep: 948,
  },
  {
    // The verifier's SW183-q-b06: the lesson's own named reflex. On round 1's
    // tree this drive kept the tick — +1.6 км/ч forward on the bill's grid
    // point is not «arrested».
    name: "QUARTER-LOCK",
    what: "the verifier's: a quarter of the wheel and 60 % brake from y 183 — 44.9 км/ч at the block, +1.6 after",
    control: () => swerve(183, 0.25, 0.6),
    contactStep: 877,
    before: 44.897,
    at: 1.616,
    task1Done: true,
    baseTickStep: 909,
    endStep: 907,
  },
  {
    name: "HALF-LOCK",
    what: "the verifier's: half the wheel and the whole pedal from y 181 — 40.0 км/ч at the block, +2.6 after",
    control: () => swerve(181, 0.5, 1),
    contactStep: 879,
    before: 40.012,
    at: 2.579,
    task1Done: true,
    baseTickStep: 920,
    endStep: 909,
  },
  {
    name: "HALF-LOCK-RIGHT",
    what: "the same strike with the wheel the other way",
    control: () => swerve(181, -0.5, 1),
    contactStep: 879,
    before: 40.012,
    at: 2.579,
    task1Done: true,
    baseTickStep: 920,
    endStep: 909,
  },
  {
    // The verifier's KISS-b019: under 1 км/ч for one grid point when it
    // touched — never «travelling» for round 1's predicate.
    name: "KISS",
    what: "the verifier's: the whole pedal from y 176.06, then 19 % from 4 км/ч — a touch at 0.97 км/ч",
    control: () => twoStage(176.06, 4, 0.19),
    maxSteps: 2400,
    contactStep: 943,
    before: 0.97,
    at: -0.077,
    task1Done: true,
    baseTickStep: 972,
    endStep: 974,
  },
];

describe("sc-hz-brake-dont-swerve — a car that has TOUCHED the block has not stopped BEFORE it", () => {
  for (const level of [1, 3] as const) {
    for (const c of CELLS) {
      describe(`${c.name} at L${level}`, () => {
        let o: Driven;
        /** The same drive on the lesson without the key: the base's sheet. */
        let was: Driven;
        const lesson = lessonAt(level);
        beforeAll(() => {
          o = drive(lesson, c.control(), { maxSteps: c.maxSteps });
          was = drive(baseLessonAt(level), c.control(), { maxSteps: c.maxSteps });
        });
        const task = (i: number) => o.result.objectives[i];

        it(`is the drive it says it is (${c.what})`, () => {
          const first = o.contacts[0];
          expect(first.withWhat).toBe("staticObject");
          expect(first.k).toBe(c.contactStep);
          expect(first.before).toBeCloseTo(c.before, 2);
          expect(first.at).toBeCloseTo(c.at, 2);
          // …and the car's box is ON the block at that grid point: inside the
          // reach, and nowhere near its edge.
          expect(first.sepM).toBeLessThanOrEqual(0.05);
          expect(first.sepM).toBeGreaterThanOrEqual(-SWEEP_RESOLUTION_M);
        });

        it("the bill is the base's: one 10-point опасна with a static object at the contact's own step — the sheet's points, verdict, stars and task 1 unmoved", () => {
          expect(o.collisions.map((b) => [b.points, b.withWhat])).toEqual([[10, "staticObject"]]);
          expect(Math.round(o.collisions[0].t * 60), "the grid point the bill is stamped at").toBe(c.contactStep);
          expect(o.result.score).toBe(10);
          expect(sessionVerdict(o.result)).toBe("failed");
          expect(task(0).done).toBe(c.task1Done);
          expect(billOf(o)).toEqual(billOf(was));
        });

        it(`«${STOP_TASK}» is NOT ticked, carries no time, and no «task done» toast was raised for it`, () => {
          expect(task(1).titleBg).toBe(STOP_TASK);
          expect(task(1).done, "the task ticked on a car that touched the block").toBe(false);
          expect(task(1).completedAtSec).toBeNull();
          expect(o.result.completedAll).toBe(false);
          expect(o.session.touchedNamedBodies).toEqual([STOP_ID]);
          expect(o.hud.filter((h) => h.kind === "objectiveComplete").map((h) => h.titleBg)).toEqual(
            c.task1Done ? ["Мини участъка с разрешената скорост"] : [],
          );
        });

        it("the task row and the debrief say WHY, once, in the sheet's own word for it — and the route sentence is not printed", () => {
          expect(task(1).detail).toEqual({ kind: "haltVoided", reason: "touched" });
          expect(objectiveDetailText(task(1).detail)).toBe(VOID_ROW);
          const text = debriefOf(o, lesson);
          expect(text.split(VOID_DEBRIEF).length, "the reason line, printed exactly once").toBe(2);
          expect(text).not.toContain(ROUTE_DONE);
          // «удари» is the bill's own word on this very sheet.
          expect(o.session.events.find((e) => e.code === "COLLISION")?.titleBg).toBe("Удар в неподвижно препятствие");
        });

        it("the drive ends by itself, on a sentence that is true of it — never on «притисната на място»", () => {
          expect(o.session.phase, "the drive never ended").toBe("completed");
          expect(o.endedAtPoint).toBe(c.endStep);
          const ending = o.hud.filter((h) => h.k === o.endedAtPoint && h.kind === "lesson");
          expect(ending.map((h) => h.titleBg)).toEqual([ROUTE_END_TITLE]);
          expect(ending[0].text).toContain(ROUTE_END_TEXT);
          // «Стигна края на маршрута»: the car is at the route's last mark (the
          // stop mark, 4.06 / 184) — inside one lane's width of it.
          const rest = o.session.lastTick!;
          expect(Math.hypot(rest.position.x - 4.06, rest.position.y - 184)).toBeLessThan(9);
          // No card anywhere in the drive says the car is pinned.
          expect(o.hud.filter((h) => h.text.includes(PINNED))).toEqual([]);
        });

        if (c.baseTickStep !== null) {
          it("WITHOUT THE KEY this is the filed defect: the same bill, «✓ Спри преди препятствието» and «Задачите от маршрута са изпълнени»", () => {
            expect(was.result.objectives[1].done).toBe(true);
            expect(Math.round(was.result.objectives[1].completedAtSec! * 60)).toBe(c.baseTickStep);
            expect(was.result.completedAll).toBe(true);
            expect(debriefOf(was, baseLessonAt(level))).toContain(ROUTE_DONE);
            expect(was.result.objectives[1].detail).toBeUndefined();
          });
        } else {
          it("(without the key task 2 is not ticked either: task 1 was refused over its ceiling and the chain never reached it)", () => {
            expect(was.result.objectives[1].done).toBe(false);
            expect(debriefOf(was, baseLessonAt(level))).not.toContain(ROUTE_DONE);
          });
        }
      });
    }
  }

  it("the released-pedal crash (LATE50) stands FREE of the block when its drive ends — the car the pin's sentence was false of", () => {
    const o = drive(lessonAt(3), late50);
    const end = o.hud.find((h) => h.titleBg === ROUTE_END_TITLE);
    expect(end, "the drive did not end on «Край на маршрута»").toBeDefined();
    expect(end!.sepM, "the car's box is clear of the block, rolling back").toBeGreaterThan(0.3);
    expect(o.hud.filter((h) => h.text.includes(PINNED))).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §2 · the verifier's sweeps, whole
// ───────────────────────────────────────────────────────────────────────────

interface SweepTally {
  drives: number;
  /** Drives that made a graded static contact with the car's box on the block. */
  touched: number;
  /** …of those, how many the lesson WITHOUT the key ticks (the defect's size). */
  touchedAndTickedWithoutTheKey: number;
  /** Contact-free of the block. */
  clear: number;
  /** Widest the car's box stood from the block at a touching contact's grid point, m. */
  widestTouchSepM: number;
  wrong: string[];
}
function sweep(named: Array<[string, () => Control, number?]>): SweepTally {
  const lesson = lessonAt(3);
  const bare = lessonAt(3, true);
  const tally: SweepTally = {
    drives: 0,
    touched: 0,
    touchedAndTickedWithoutTheKey: 0,
    clear: 0,
    widestTouchSepM: -Infinity,
    wrong: [],
  };
  for (const [name, control, maxSteps] of named) {
    const o = drive(lesson, control(), { maxSteps });
    const was = drive(bare, control(), { maxSteps });
    tally.drives++;
    // A static contact is with the block exactly when the car's box is on it.
    // Anything further off is another body (the kerb, a façade): this sweep
    // names the band in between so a contact can never sit in it unnoticed.
    const onBlock = o.contacts.filter((x) => x.withWhat === "staticObject" && x.sepM <= SWEEP_RESOLUTION_M);
    const inBetween = o.contacts.filter(
      (x) => x.withWhat === "staticObject" && x.sepM > SWEEP_RESOLUTION_M && x.sepM < 1,
    );
    if (inBetween.length > 0) tally.wrong.push(`${name}: a static contact ${inBetween[0].sepM.toFixed(3)} m off the block`);
    if (JSON.stringify(billOf(o)) !== JSON.stringify(billOf(was))) tally.wrong.push(`${name}: the bill moved`);
    if (onBlock.length > 0) {
      tally.touched++;
      for (const x of onBlock) tally.widestTouchSepM = Math.max(tally.widestTouchSepM, x.sepM);
      if (was.result.objectives[1].done) tally.touchedAndTickedWithoutTheKey++;
      if (o.result.objectives[1].done) tally.wrong.push(`${name}: touched the block and kept the tick`);
      if (o.session.touchedNamedBodies?.includes(STOP_ID) !== true) tally.wrong.push(`${name}: the touch was not recorded`);
      if (debriefOf(o, lesson).includes(ROUTE_DONE)) tally.wrong.push(`${name}: the route sentence was printed`);
      if (o.hud.some((h) => h.text.includes(PINNED))) tally.wrong.push(`${name}: «притисната» was shown`);
    } else {
      tally.clear++;
      if (o.session.touchedNamedBodies !== undefined) tally.wrong.push(`${name}: a touch recorded with no contact on the block`);
      if (sheetDigest(o.result) !== sheetDigest(was.result)) tally.wrong.push(`${name}: a drive clear of the block changed`);
    }
  }
  return tally;
}

describe("the verifier's sweeps — no drive that touched the block keeps the tick, no other drive changes", () => {
  it(
    "the 90-drive swerve sweep (wheel ±¼ / ±½ / ±full × brake 0 / 60 % / full × onset y 172–183): 19 ticked on round 1's tree, 34 without the key — none now",
    () => {
      const named: Array<[string, () => Control]> = [];
      for (const fromY of [172, 176, 179, 181, 183]) {
        for (const s of [0.25, 0.5, 1, -0.25, -0.5, -1]) {
          for (const b of [0, 0.6, 1]) named.push([`swerve-y${fromY}-s${s}-b${b}`, () => swerve(fromY, s, b)]);
        }
      }
      const t = sweep(named);
      expect(t.wrong).toEqual([]);
      expect(t.drives).toBe(90);
      expect(t.touchedAndTickedWithoutTheKey, "the sweep no longer reaches the defect").toBe(34);
      expect(t.touched + t.clear).toBe(90);
      expect(t.widestTouchSepM).toBeLessThanOrEqual(0.05);
    },
    600_000,
  );

  it(
    "the 81-setting slow-touch sweep (the whole pedal from y 176.06, then 17 %–21 % from 4 км/ч): 29 ticked on round 1's tree — none now, and the settings that stop short still tick",
    () => {
      const named: Array<[string, () => Control, number]> = [];
      for (let i = 0; i <= 80; i++) {
        const b2 = 0.17 + (0.04 * i) / 80;
        named.push([`two-y176.06-v4-b${b2.toFixed(4)}`, () => twoStage(176.06, 4, b2), 2400]);
      }
      const t = sweep(named);
      expect(t.wrong).toEqual([]);
      expect(t.drives).toBe(81);
      expect(t.touched, "the sweep no longer reaches the block").toBeGreaterThanOrEqual(29);
      expect(t.clear, "the sweep no longer reaches a stop short of it").toBeGreaterThan(0);
      expect(t.touchedAndTickedWithoutTheKey).toBeGreaterThanOrEqual(29);
      expect(t.widestTouchSepM).toBeLessThanOrEqual(0.05);
    },
    600_000,
  );
});

// ───────────────────────────────────────────────────────────────────────────
// §3 · the stop the driver MADE still ticks
// ───────────────────────────────────────────────────────────────────────────

describe("the stop the driver made still ticks", () => {
  for (const level of [1, 3, 5] as const) {
    it(`the lesson's committed correct demo at L${level}: both tasks ticked, no reason row, a pass — and nothing recorded as touched`, () => {
      const lesson = lessonAt(level);
      let session = createLessonSession(lesson);
      recordScHzBrakeDontSwerveDrive(DISTRICT(), "shadow-correct", {
        onTick: (t) => {
          session = applyTick(session, t).state;
        },
      });
      const r = buildLessonResult(session);
      expect(r.objectives.map((t) => t.done)).toEqual([true, true]);
      expect(r.objectives.map((t) => t.detail)).toEqual([undefined, undefined]);
      expect(r.completedAll).toBe(true);
      expect(r.passed).toBe(true);
      expect(r.score).toBe(0);
      expect(session.touchedNamedBodies).toBeUndefined();
    });
  }

  for (const level of [1, 3] as const) {
    it(`a hard stop half a metre short of the block on the real chassis at L${level}: ticked, 0 points, a pass`, () => {
      const o = drive(lessonAt(level), brakeFrom(175.9));
      expect(o.contacts).toEqual([]);
      expect(o.collisions).toEqual([]);
      const rest = o.last!;
      const gapM = sepOf(rest.position, rest.headingDeg);
      expect(gapM, `the nose stood ${gapM} m short of the block`).toBeGreaterThan(0.4);
      expect(gapM).toBeLessThan(0.6);
      expect(o.result.objectives.map((t) => t.done)).toEqual([true, true]);
      expect(o.result.objectives[1].detail).toBeUndefined();
      expect(o.result.passed).toBe(true);
      expect(o.result.score).toBe(0);
      expect(o.session.touchedNamedBodies).toBeUndefined();
    });
  }

  it(
    "stops that end 0.05, 0.2, 0.5 and 1.0 m short of the block, straight and yawed, at L1 and L3: every one ticked, and byte for byte the lesson without the key",
    () => {
      const wrong: string[] = [];
      const gaps: string[] = [];
      for (const level of [1, 3] as const) {
        for (const gap of [0.05, 0.2, 0.5, 1.0]) {
          for (const [tag, yaw] of [
            ["straight", 0],
            ["nose 5° left", -5],
            ["nose 5° right", 5],
            ["nose 12° left", -12],
            ["nose 12° right", 12],
          ] as const) {
            const name = `L${level} ${gap} m ${tag}`;
            const o = drive(lessonAt(level), stopShort(gap, yaw));
            const was = drive(lessonAt(level, true), stopShort(gap, yaw));
            const rest = o.last!;
            const stood = sepOf(rest.position, rest.headingDeg);
            const dev = ((rest.headingDeg + 180) % 360) - 180;
            gaps.push(`${name}: ${stood.toFixed(3)} m, nose ${dev.toFixed(1)}°`);
            // The drive is what it says: clear of the block by about `gap`,
            // and (for the yawed ones) really yawed.
            if (o.contacts.length > 0) wrong.push(`${name}: it touched something`);
            if (Math.abs(stood - gap) > 0.04) wrong.push(`${name}: it stood ${stood.toFixed(3)} m short`);
            if (Math.abs(dev - yaw) > 2.5) wrong.push(`${name}: its nose stands ${dev.toFixed(1)}° off the axis`);
            if (!o.result.objectives[1].done) wrong.push(`${name}: a stop short of the block lost its tick`);
            if (!o.result.passed || o.result.score !== 0) wrong.push(`${name}: not a clean pass`);
            if (o.session.touchedNamedBodies !== undefined) wrong.push(`${name}: recorded as touched`);
            if (sheetDigest(o.result) !== sheetDigest(was.result)) wrong.push(`${name}: differs from the lesson without the key`);
          }
        }
      }
      expect(wrong, gaps.join("\n")).toEqual([]);
    },
    600_000,
  );
});

// ───────────────────────────────────────────────────────────────────────────
// §4 · one drive, one sheet (ADR-014)
// ───────────────────────────────────────────────────────────────────────────

describe("one drive, one sheet on every display", () => {
  const W69 = [
    234, 668, 255, 629, 259, 722, 522, 277, 227, 300, 1104, 295, 256, 739, 524, 778, 518, 817, 350, 411, 927, 1365,
    498, 287, 800, 524, 845, 366, 310, 1217, 1185, 262, 234, 241, 243, 338, 404, 1114, 527, 1249, 332, 1272, 355,
  ].map((m) => m / 1000);

  for (const [name, control] of [
    ["LATE50", () => late50],
    ["QUARTER-LOCK (yawed)", () => swerve(183, 0.25, 0.6)],
    ["KISS (0.97 км/ч)", () => twoStage(176.06, 4, 0.19)],
  ] as const) {
    it(
      `${name} at L3 on 30 Hz, a phone's frame list and a 2 fps lens is the 60 Hz sheet — undone task, reason and touch record included`,
      () => {
        const lesson = lessonAt(3);
        const ref = drive(lesson, control(), { maxSteps: 2400 });
        const wrong: string[] = [];
        for (const [label, deltas, phases] of [
          ["30 Hz", [1 / 30], 2],
          ["w69 phone", W69, 6],
          ["2 fps lens", [0.5], 8],
        ] as const) {
          for (let lead = 0; lead < phases; lead++) {
            const o = drive(lesson, control(), { deltas: phased(deltas, lead), maxSteps: 2400 });
            if (sheetDigest(o.result) !== sheetDigest(ref.result)) {
              wrong.push(`${label} lead ${lead}: the sheet differs — tasks ${JSON.stringify(o.result.objectives.map((t) => t.done))}`);
            }
            if (JSON.stringify(o.session.touchedNamedBodies) !== JSON.stringify(ref.session.touchedNamedBodies)) {
              wrong.push(`${label} lead ${lead}: the touch record differs`);
            }
            if (o.contacts[0]?.k !== ref.contacts[0]?.k) wrong.push(`${label} lead ${lead}: contact at ${o.contacts[0]?.k}`);
          }
        }
        expect(ref.result.objectives[1].done).toBe(false);
        expect(ref.result.objectives[1].detail).toEqual({ kind: "haltVoided", reason: "touched" });
        expect(wrong).toEqual([]);
      },
      600_000,
    );
  }
});

// ───────────────────────────────────────────────────────────────────────────
// §5 · the reason survives the wire (the debrief the student reads is the server's)
// ───────────────────────────────────────────────────────────────────────────

describe("the server's sheet says the same thing", () => {
  it("QUARTER-LOCK at L3 through the finish wire: the task undone, the reason on the row and in the server's debrief; a forged reason is dropped", () => {
    const o = drive(lessonAt(3), swerve(183, 0.25, 0.6));
    const wire = {
      lessonId: lessonAt(3).id,
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(o.result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(o.session.events),
      objectives: o.result.objectives.map((ob) => ({
        id: ob.id,
        done: ob.done,
        completedAtSec: ob.completedAtSec,
        ...(ob.detail !== undefined ? { detail: ob.detail } : {}),
      })),
    };
    const g = gradeFinishWire(wire);
    expect(g.status).toBe("ok");
    if (g.status !== "ok") return;
    expect(g.result.objectives[1].done).toBe(false);
    expect(g.result.objectives[1].detail).toEqual({ kind: "haltVoided", reason: "touched" });
    expect(g.result.score).toBe(10);
    const text = buildDebrief(g.lesson, g.result, {}).text;
    expect(text).toContain(VOID_DEBRIEF);
    expect(text).not.toContain(ROUTE_DONE);

    for (const reason of ["arrested", "impact", "", 7]) {
      const forged = gradeFinishWire({
        ...wire,
        objectives: wire.objectives.map((ob, i) => (i === 1 ? { ...ob, detail: { kind: "haltVoided", reason } } : ob)),
      });
      expect(forged.status).toBe("ok");
      if (forged.status !== "ok") return;
      expect(forged.result.objectives[1].detail, `reason ${JSON.stringify(reason)}`).toBeUndefined();
    }

    // …and a payload that claims the task DONE while carrying the reason is not
    // told «не се отчете» about a ticked row (the debrief reads `done` first).
    const contradictory = gradeFinishWire({
      ...wire,
      objectives: wire.objectives.map((ob, i) => (i === 1 ? { ...ob, done: true, completedAtSec: 20 } : ob)),
    });
    expect(contradictory.status).toBe("ok");
    if (contradictory.status !== "ok") return;
    expect(contradictory.result.objectives[1].done).toBe(true);
    expect(buildDebrief(contradictory.lesson, contradictory.result, {}).text).not.toContain("не се отчете");
  });

  it("the shell's own payload builder passes the task's detail through unchanged", () => {
    // `finishLessonPayload` (LessonPlayShell) spreads `o.detail` onto the wire
    // objective; pinned on its source because the component module cannot be
    // imported in a node test of this directory.
    const shell = readFileSync(path.join(SRC, "components/sim/lesson-ui/LessonPlayShell.tsx"), "utf-8");
    expect(shell).toMatch(/objectives: r\.objectives\.map\(\(o\) => \(\{[\s\S]{0,200}?\.\.\.\(o\.detail !== undefined \? \{ detail: o\.detail \} : \{\}\),/);
  });
});
