/**
 * THE TASK CEILING, THROUGH A REAL SESSION — founder ruling 2026-09-25
 * (register item 17, „Bill it"), rows `sc-ac-truck-spray:990e5f64` (critical)
 * and `:8ed4d8b3`.
 *
 * WHAT THE TREE DID BEFORE THIS FILE, measured with the drive helper below on
 * the base commit (L1, rain, posted 140, «задачата иска ≤80»):
 *
 *   110 км/ч, no stops   events []  ·  «Чисто и спокойно каране» ×3  ·
 *                        «…карането беше чисто по изпитния лист»
 *   129 км/ч, no stops   SPEED_TOO_FAST_FOR_CONDITIONS taught at 16.3 s, its
 *                        re-grade charged at 22.2 s — the w11
 *                        `conditionsSpeedRegrade` repair; the wave-10 frame's
 *                        «0 / 0 / 0» predates it
 *
 * So of the three mechanisms the row suggested, (2) „a continuing episode
 * opened under grace is never billed" was already closed for the conditions
 * code; (1) „the task cap never reaches rules/" was live — nothing could bill
 * the 85–119 band — and (3) the debrief's praise followed from (1): with no
 * event there was nothing for its coached/scored guards to see.
 *
 * The reducer half of the repair is `rules/__tests__/task-speed-cap.test.ts`.
 *
 * ROUND 2 (2026-09-25, after an adversarial verifier refuted round 1) moved
 * four things this file pins, each marked where it lands: the ceiling bills
 * only above the gate PLUS the objective's own slack (C1); it binds only from
 * the mark to the next goal (C2); one continuous чл. 20, ал. 2 act is named by
 * whichever of the task, conditions and bend codes bills first and is charged
 * once (C3 — the kin ledger); and a drive that ends inside a taught act is
 * settled (F2). The photographed-profile probes are
 * `task-cap-photographed.test.ts`.
 *
 * ROUND 6 (2026-09-26, founder ruling 4 in the integrator's reading): the mark
 * blown at a graded cap is ONE taught TASK event at the blow on every capped
 * objective (the curtain included), and every over-cap stretch that follows it
 * on the same stretch is the same act. Three pins moved, each marked.
 *
 * ROUND 14 — RETIRED HERE: 3 tests (founder ruling 2026-10-03, «Cap adds, never removes. The task cap
 * is an extra rule on top. Its bill stands on its own; the bend/weather bills are charged exactly as they would be in a
 * lesson with no cap. Blowing the cap can only add, never lower the score, and order never matters.»). Each pinned a
 * reading the ruling supersedes — a task-cap bill absorbing, or absorbed by, a weather, bend or SPEEDING_* bill, the kin
 * ledger's owners, lapses, surfaced cards and hand-overs, one bill per M-16 act — or read the state that carried them.
 * Their titles are in the round-14 hand-off log (`scratchpad/cap/r14/retired.txt`); what replaced them is the two-ledger
 * property (`rules/__tests__/taskCapTwoLedgers.ts`, `task-cap-property-census`), the two-ledger reference
 * (`task-cap-two-sided-census`), the lesson censuses and `task-cap-round14`. The tests left here pin readings the ruling
 * keeps (the cap ledger's own rules, the stretch of ruling 2, the card copy).
 */
import { describe, expect, it } from "vitest";
import type { HudEvent, LessonSpec } from "../../contracts";
import { buildDebrief } from "../debrief";
import { abortSession, applyTick, buildLessonResult, createLessonSession, finishSession } from "../engine";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioLevel } from "../scenario/types";
import type { LessonSessionState, TeachMoment } from "../types";
import { CURTAIN_OBJECTIVE_ID, makeTick } from "./fixtures";

const TASK = "TASK_SPEED_CAP_EXCEEDED";
const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
const PRAISE = "Какво се получи добре: чисто каране";

function spray(level: ScenarioLevel): LessonSpec {
  const spec = SCENARIO_TEMPLATES.find((t) => t.id === "sc-ac-truck-spray");
  if (spec === undefined) throw new Error("sc-ac-truck-spray is gone");
  return compileScenario(spec, level);
}

/**
 * Two objectives on a straight road: a capped mark at y = 200 and a far,
 * uncapped terminal, so the drive keeps going long after the mark (the
 * terminal is the route's end mark, `finish.ts`).
 *
 * ROUND 4 (founder ruling 2026-09-25 «Only the named stretch»): the capped
 * mark borrows the spray curtain's id (`CURTAIN_OBJECTIVE_ID`), so its stretch
 * is the curtain's — to the far terminal — as these mechanics cases assume.
 * A mark that names only its own zone binds across that zone
 * (`task-cap-round4.test.ts`).
 */
function handBuilt(maxSpeedKmh: number, postedLimitKmh: number): LessonSpec {
  return {
    id: "t-task-cap",
    order: 1,
    titleBg: "Таван на задачата",
    descriptionBg: "",
    conceptIds: [],
    postedLimitKmh,
    spawn: { position: { x: 0, y: 15 }, headingDeg: 0 },
    preDrive: false,
    vehicleStart: "ready",
    objectives: [
      {
        id: CURTAIN_OBJECTIVE_ID,
        titleBg: "Мини точката",
        kind: "reachZone",
        params: { x: 0, y: 200, radiusM: 12, maxSpeedKmh },
      },
      { id: "o-end", titleBg: "Стигни края", kind: "reachZone", params: { x: 0, y: 6000, radiusM: 12 } },
    ],
  };
}

interface Drive {
  session: LessonSessionState;
  teach: TeachMoment[];
  hud: HudEvent[];
}

/**
 * The wrong leg's own shape: straight up the lane, accelerating at 2.5 m/s²
 * toward a target speed that may depend on where the car is, NO stops (a stop
 * would run the engine's acquittal arm — the audited leg makes none). 0.1 s
 * frames.
 */
function driveLesson(
  lesson: LessonSpec,
  target: number | ((y: number, t: number) => number),
  opts: {
    rain?: boolean;
    motorway?: boolean;
    postedKmh?: number;
    seconds?: number;
    wobbleKmh?: number;
    stopAtSec?: number;
  } = {},
): Drive {
  let session = createLessonSession(lesson);
  const teach: TeachMoment[] = [];
  const hud: HudEvent[] = [];
  const dt = 0.1;
  let v = 0;
  let y = 15;
  const seconds = opts.seconds ?? 120;
  for (let i = 0; i * dt < seconds && y < 5500; i++) {
    const t = Math.round(i * dt * 10) / 10;
    if (opts.stopAtSec !== undefined && t >= opts.stopAtSec) break;
    const base = typeof target === "number" ? target : target(y, t);
    const want = base + (opts.wobbleKmh ?? 0) * Math.sin(t / 3);
    v = Math.min(want, v + 2.5 * 3.6 * dt);
    y += (v / 3.6) * dt;
    const r = applyTick(
      session,
      makeTick({
        t,
        speedKmh: v,
        maxSpeedKmh: opts.postedKmh ?? 140,
        position: { x: 0, y },
        ...(opts.rain === false ? {} : { rain: true }),
        ...(opts.motorway === false ? {} : { motorway: true }),
      }),
    );
    teach.push(...(r.teachMoments ?? []));
    hud.push(...r.hudEvents);
    session = r.state;
  }
  return { session, teach, hud };
}

const charged = (s: LessonSessionState) =>
  s.events.filter((e) => e.kind === "violation").map((e) => e.code as string);
/** Shown and not charged — the teach card AND its rate-limited toast downgrade
 *  (`recordCoached`), so a card that lost the pause race still counts. */
const taught = (d: Drive, code: string) => (d.session.coachedMistakes ?? []).filter((c) => c.code === code);

describe("THE ROW — through the ≤80 mark at 110 in the rain: the band only the task can see", () => {
  for (const level of [1, 3] as ScenarioLevel[]) {
    it(`L${level}: TAUGHT once, then BILLED once, and named as the task's ceiling`, () => {
      const d = driveLesson(spray(level), 110, { wobbleKmh: 2 });
      // The grace (founder ruling 16): the first commission is a card that explains…
      expect(taught(d, TASK)).toHaveLength(1);
      // …and the continuing breach is billed after SPEED_REGRADE_SEC.
      expect(charged(d.session)).toEqual([TASK]);
      const result = buildLessonResult(d.session);
      expect(result.score).toBe(1);
      // The card says what was measured against what, in the student's number.
      const card = d.hud.find((h) => h.kind === "violation" && h.titleBg === "Скорост над тавана на задачата");
      expect(card).toBeDefined();
      expect((card as { explanationBg: string }).explanationBg).toMatch(
        /^Отчетена скорост 1\d\d(,\d)? км\/ч при таван на задачата 80 км\/ч\. /,
      );
      const text = buildDebrief(d.session.lesson, result, { coachedMistakes: result.coachedMistakes }).text;
      expect(text).toContain("Скорост над тавана на задачата");
      expect(text).not.toContain(PRAISE);
      expect(text).not.toContain("карането беше чисто");
    });
  }

  it("the ceiling binds from the MARK: 110 on the approach, braked under 80 before the mark, is never stamped", () => {
    // Held 110 to 120 m short of the mark, then the same wrong-leg pedal lifted.
    const d = driveLesson(spray(1), (y) => (y < 330 ? 110 : 70));
    expect(taught(d, TASK)).toEqual([]);
    expect(charged(d.session)).toEqual([]);
  });
});

// ROUND 14: «one duty, one act, one bill» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.

describe("later commissions are billed per the grace policy that already exists", () => {

  it("ROUND 6 — a held correction on the SAME stretch does not open a new act: one card, the act's one charge", () => {
    // 110 through the mark (the arrival names the act, taught; its re-grade
    // charged), back to 70 — under the figure — held 8 s, then 110 again on
    // the same curtain. Round 3 pinned [TASK, TASK] here: the correction ended
    // the act and the second stretch's first bill was charged on the spent
    // topic. Under ruling 4 in the integrator's reading the arrival «is one act
    // with any sustained over-cap stretch that follows on the named feature»,
    // so the second stretch is the same act, and it has had its charge. (A NEW
    // blow is still a new act — `rules/__tests__/task-cap-round6.test.ts`.)
    const d = driveLesson(handBuilt(80, 140), (_y, t) => (t < 30 ? 110 : t < 38 ? 70 : 110), {
      seconds: 60,
      rain: false,
      motorway: false,
    });
    expect(taught(d, TASK)).toHaveLength(1);
    expect(charged(d.session)).toEqual([TASK]);
  });
});

describe("the lesson's own ADR-009 target is never hidden by the ledger", () => {
  it("a conditions-target lesson where the TASK code names the act first still records its conditions hit — free, and not a second charge", () => {
    // ≤80 mark at y = 200, rain, posted 140, envelope 119; the conditions code
    // is this lesson's own mistake. 100 through the mark (task names the act),
    // then 130: the conditions code's first bill is absorbed by the ledger —
    // and let through by the lesson, because it is its target's first
    // occurrence (the only record the lesson has that the mistake happened).
    const lesson: LessonSpec = {
      ...handBuilt(80, 140),
      lessonMistakeTargets: [{ code: COND, source: "demo" }],
    };
    const d = driveLesson(lesson, (_y, t) => (t < 20 ? 100 : 130), { seconds: 60, motorway: false });
    expect(taught(d, TASK)).toHaveLength(1);
    expect(taught(d, COND)).toHaveLength(1);
    const result = buildLessonResult(d.session);
    expect((result.lessonMistakes ?? []).map((m) => m.code)).toContain(COND);
    // One charge for the act: the task's own re-grade. The target is free.
    expect(charged(d.session)).toEqual([TASK]);
  });
});

describe("a lawful RIGHT leg is never billed", () => {
  it("the shadow's ~64 km/h, every rung", () => {
    for (const level of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
      const d = driveLesson(spray(level), 64, { wobbleKmh: 1 });
      expect(charged(d.session), `L${level}`).toEqual([]);
      expect(taught(d, TASK), `L${level}`).toEqual([]);
    }
  });

  it("a leg that blows the mark at 100 and is back inside the L1 grace (84) at once: the arrival is taught, and the 84 after it is never billed — the gate is the objective's own", () => {
    // The mark is at y = 450 (radius 12); 100 is past the gate plus the slack
    // (85 + 5), so the approach is blown and the ceiling is stamped. 84 is over
    // the figure on the glass (80) and inside the gate the objective itself
    // refuses at (85): the sheet must agree with the gate.
    // ROUND 6 (ruling 4, the integrator's reading): the blow at 100 IS the
    // offence — one taught card at the blow (round 3 pinned no card here) —
    // and nothing after it is billed or charged.
    const d = driveLesson(spray(1), (y) => (y < 470 ? 100 : 84));
    expect(taught(d, TASK)).toHaveLength(1);
    expect(charged(d.session)).not.toContain(TASK);
    // ROUND 2 (C1): 88 is ALSO inside now — the ceiling bills above the gate
    // plus the objective's own slack (85 + 5 = 90), the speed this mark was
    // blown at. Round 1 billed 88 here, with 0 km/h of slack.
    const slack = driveLesson(spray(1), (y) => (y < 470 ? 100 : 88));
    expect(taught(slack, TASK)).toHaveLength(1);
    expect(charged(slack.session)).not.toContain(TASK);
    // Positive control: the same leg settling at 95 is over gate + slack, so the
    // act keeps running on the curtain and its re-grade is charged.
    const over = driveLesson(spray(1), (y) => (y < 470 ? 100 : 95));
    expect(taught(over, TASK)).toHaveLength(1);
    expect(charged(over.session)).toEqual([TASK]);
  });

  it("a leg that holds exactly the figure on the glass (80), and one inside the L1 grace (84)", () => {
    for (const [level, kmh] of [
      [3, 80],
      [1, 80],
      [1, 84],
    ] as Array<[ScenarioLevel, number]>) {
      const d = driveLesson(spray(level), kmh);
      expect(charged(d.session), `L${level}@${kmh}`).not.toContain(TASK);
      expect(taught(d, TASK), `L${level}@${kmh}`).toEqual([]);
    }
  });
});

describe("the stamp is exactly what the glass shows as a ceiling", () => {
  it("a flow cap under the sign, blown at its mark, is graded (the positive control for the refusals below)", () => {
    const d = driveLesson(handBuilt(30, 50), 45, { rain: false, motorway: false, postedKmh: 50, seconds: 40 });
    expect(taught(d, TASK)).toHaveLength(1);
  });

  it("never on the EXAM rung — no «задачата иска» is shown there, and an exam grades the official sheet", () => {
    const lesson = spray(4);
    expect(lesson.examMode).toBe(true);
    const d = driveLesson(lesson, 110);
    expect(charged(d.session)).not.toContain(TASK);
  });

  it("never in the halt band (≤ 8 км/ч means „come to rest here“, and arriving in motion IS the act)", () => {
    const d = driveLesson(handBuilt(6, 50), 30, { rain: false, motorway: false, postedKmh: 50, seconds: 40 });
    expect(taught(d, TASK)).toEqual([]);
    expect(charged(d.session)).not.toContain(TASK);
  });

  it("never where the cap is at or above the sign — the sign is the stricter ceiling and SPEEDING_* grades it", () => {
    // 70 through a 60 mark on a 50 street: blown, and far over the sign too.
    const d = driveLesson(handBuilt(60, 50), 70, { rain: false, motorway: false, postedKmh: 50, seconds: 40 });
    expect(taught(d, TASK)).toEqual([]);
    expect(charged(d.session)).not.toContain(TASK);
    const seen = [...charged(d.session), ...(d.session.coachedMistakes ?? []).map((c) => c.code)];
    expect(seen.some((c) => c.startsWith("SPEEDING_"))).toBe(true);
  });
});

describe("a debrief never praises a drive that broke the cap", () => {
  it("taught, CORRECTED, never charged: the praise is withheld", () => {
    // 45 through a 30 mark 185 m from the spawn — short enough that no
    // CLEAN_DRIVING is earned before it, so the praise sentence (which prints
    // only when there are no commendations) is the branch under test. Blown at
    // ~18 s, the teach lands ~21 s; the car then drops to 25 (under the figure)
    // and the drive is ended at 30 s — inside, so neither the re-grade nor the
    // finish-time settlement (round 2, F2) has anything to charge.
    const probe = driveLesson(handBuilt(30, 50), 45, { rain: false, motorway: false, postedKmh: 50, seconds: 40 });
    const teachAt = taught(probe, TASK)[0]?.t as number;
    expect(teachAt).toBeGreaterThan(0);
    const d = driveLesson(handBuilt(30, 50), (_y, t) => (t < teachAt + 0.3 ? 45 : 25), {
      rain: false,
      motorway: false,
      postedKmh: 50,
      stopAtSec: teachAt + 9,
    });
    expect(taught(d, TASK)).toHaveLength(1);
    const ended = finishSession(d.session, teachAt + 9);
    const result = buildLessonResult(ended);
    expect(charged(ended)).toEqual([]);
    const text = buildDebrief(ended.lesson, result, { coachedMistakes: result.coachedMistakes }).text;
    expect(text).not.toContain(PRAISE);
    // Round 3 (R4): the drive carries the record of its blown cap.
    expect(result.taskCapBreaches?.map((b) => b.objectiveId)).toEqual([CURTAIN_OBJECTIVE_ID]);
    // THE CONTROL: the very same result with the teach re-labelled as a code
    // that is NOT the task's, and the breach record removed, prints the
    // (scoped) praise — so it is the task-cap breach, and nothing else about
    // this drive, that withholds it.
    const relabelled = (result.coachedMistakes ?? []).map((c) => ({ ...c, code: "HEADLIGHTS_OFF_IN_RAIN" }));
    const control = buildDebrief(ended.lesson, { ...result, coachedMistakes: relabelled, taskCapBreaches: undefined }, {
      coachedMistakes: relabelled,
    }).text;
    expect(control).toContain(PRAISE);
    for (const kin of [COND, "SPEED_TOO_FAST_FOR_CURVE"]) {
      const asKin = (result.coachedMistakes ?? []).map((c) => ({ ...c, code: kin }));
      // ROUND 3 (C2) left a weather or bend row ALONE unable to withhold the
      // praise, pending the founder. ROUND 4 — ANSWERED 2026-09-25, «Yes, same
      // as speeding»: a taught weather or bend overspeed withholds it too, on a
      // drive that never broke a task cap…
      const alone = buildDebrief(
        ended.lesson,
        { ...result, coachedMistakes: asKin, taskCapBreaches: undefined },
        { coachedMistakes: asKin },
      ).text;
      expect(alone, kin).not.toContain(PRAISE);
      // …and the breach RECORD withholds it whichever code the ledger named the
      // act by (R4: it is the task cap that was broken).
      const withBreach = buildDebrief(ended.lesson, { ...result, coachedMistakes: asKin }, { coachedMistakes: asKin }).text;
      expect(withBreach, kin).not.toContain(PRAISE);
    }
  });

  it("taught and ended STILL OVER the ceiling: the finish-time settlement charges it (F2), by hand-end and by abort", () => {
    // ROUND 6: the card is the ARRIVAL, at the blow; the settlement reads the
    // sustained episode's own first bill (R3), which lands 3 s later, absorbed
    // into the act. So the ending is 5 s after the card (was 2 s after a card
    // that itself came 3 s after the mark) — and 2 s after it, pinned below,
    // nothing is settled yet.
    const probe = driveLesson(handBuilt(30, 50), 45, { rain: false, motorway: false, postedKmh: 50, seconds: 40 });
    const teachAt = taught(probe, TASK)[0]?.t as number;
    const d = driveLesson(handBuilt(30, 50), 45, {
      rain: false,
      motorway: false,
      postedKmh: 50,
      stopAtSec: teachAt + 5,
    });
    expect(taught(d, TASK)).toHaveLength(1);
    expect(charged(finishSession(d.session, teachAt + 5))).toEqual([TASK]);
    expect(charged(abortSession(d.session, teachAt + 5))).toEqual([TASK]);
    const early = driveLesson(handBuilt(30, 50), 45, {
      rain: false,
      motorway: false,
      postedKmh: 50,
      stopAtSec: teachAt + 2,
    });
    expect(taught(early, TASK)).toHaveLength(1);
    expect(charged(finishSession(early.session, teachAt + 2))).toEqual([]);
  });
});
