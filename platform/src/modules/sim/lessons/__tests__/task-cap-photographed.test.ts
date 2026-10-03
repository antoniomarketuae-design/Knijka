/**
 * THE TASK CEILING AGAINST THE DRIVE THAT WAS PHOTOGRAPHED — round 2 of the
 * founder ruling 2026-09-25 (register item 17, „Bill it"), rows
 * `sc-ac-truck-spray:990e5f64` (critical) and `:8ed4d8b3`.
 *
 * WHY THIS FILE EXISTS. Round 1 was refuted by an adversarial verifier whose
 * probe replayed the REAL speed profile off `.audit-frames/sweep161/
 * sc-ac-truck-spray/pc-wrong/log.txt` — 1 s 14 · 6 s 58 · 12 s 85 · 17 s 99 ·
 * 22 s 110 · 28 s 116 · 33 s 129, held to the route end, no stops — where the
 * round-1 suite had only a synthetic 2.5 m/s² ramp. Every case below is one of
 * its probes, ported and turned into a pinned assertion:
 *
 *   F1  the photographed profile billed through a coupling nobody tested (the
 *       TASK teach spent the shared topic, so the conditions code was charged on
 *       sight) — now the code that names the act and the debrief are PINNED;
 *   F2  the neighbours of that leg (through the mark at 116, then 130 held from
 *       y ≈ 540 to the route end) finished 0/0/0 with praise, because the drive
 *       ended inside a taught-but-not-re-graded episode — now settled at the end;
 *   F3  a CLEAN_DRIVING earned lawfully before the mark was printed unscoped
 *       over a cap breach that was taught and never charged;
 *   C1  after a blown mark the ceiling billed with 0 km/h slack;
 *   C2  a blown cap bound for the rest of the drive;
 *   C3  one continuous overspeed was billed twice under чл. 20, ал. 2;
 *   C4  the card named one number where the drive broke two;
 *   X9  nothing in the lane's own suite killed REACH_ZONE_CAP_SLACK_KMH 5 → 0.
 *
 * The reducer half of round 2 is `rules/__tests__/task-speed-cap.test.ts`.
 *
 * ROUND 14 — RETIRED HERE: 12 tests (founder ruling 2026-10-03, «Cap adds, never removes. The task cap
 * is an extra rule on top. Its bill stands on its own; the bend/weather bills are charged exactly as they would be in a
 * lesson with no cap. Blowing the cap can only add, never lower the score, and order never matters.»). Each pinned a
 * reading the ruling supersedes — a task-cap bill absorbing, or absorbed by, a weather, bend or SPEEDING_* bill, the kin
 * ledger's owners, lapses, surfaced cards and hand-overs, one bill per M-16 act — or read the state that carried them.
 * Their titles are in the round-14 hand-off log (`scratchpad/cap/r14/retired.txt`); what replaced them is the two-ledger
 * property (`rules/__tests__/taskCapTwoLedgers.ts`, `task-cap-property-census`), the two-ledger reference
 * (`task-cap-two-sided-census`), the lesson censuses and `task-cap-round14`. The tests left here pin readings the ruling
 * keeps (the cap ledger's own rules, the stretch of ruling 2, the card copy).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LessonSpec, StagedEventSpec } from "../../contracts";
import { recordScriptedDrive, type DriveScript } from "../../traces/recorder";
import { buildDebrief } from "../debrief";
import { abortSession, applyTick, buildLessonResult, createLessonSession, finishSession } from "../engine";
import { taskCapStretch, withinTaskCapStretch } from "../finish";
import { REACH_ZONE_CAP_SLACK_KMH } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SC_AC_TRUCK_SPRAY } from "../scenario/templates-conditions2";
import type { ScenarioLevel } from "../scenario/types";
import type { LessonSessionState, ObjectiveParams, TeachMoment } from "../types";
import { CURTAIN_OBJECTIVE_ID, makeTick } from "./fixtures";

const TASK = "TASK_SPEED_CAP_EXCEEDED";
const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
const KIN = new Set([TASK, COND, "SPEED_TOO_FAST_FOR_CURVE"]);
const TASK_TITLE = "Скорост над тавана на задачата";
/** Every sentence this product has ever used to hold a drive up as clean. */
const UNSCOPED_PRAISE = /чисто каране без нито едно нарушение|задръж това ниво|чисто каране по изпитния лист/u;
const CLEAN_TITLE = "Чисто и спокойно каране";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const MW = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", "mw-v1.json"), "utf-8")) as unknown;

interface Out {
  ended: LessonSessionState;
  charged: string[];
  chargedAt: Array<{ code: string; t: number }>;
  coached: string[];
  commendations: number[];
  cards: TeachMoment[];
  violationCards: Array<{ titleBg: string; explanationBg: string }>;
  score: number;
  debrief: string;
  endedAt: number;
  endedNaturally: boolean;
}

function finish(s: LessonSessionState, t: number, cards: TeachMoment[], vcards: Out["violationCards"]): Out {
  const endedNaturally = s.phase !== "driving";
  const ended = endedNaturally ? s : finishSession(s, t);
  const result = buildLessonResult(ended);
  const debrief = buildDebrief(ended.lesson, result, { coachedMistakes: result.coachedMistakes }).text;
  const viol = ended.events.filter((e) => e.kind === "violation");
  return {
    ended,
    charged: viol.map((e) => e.code as string),
    chargedAt: viol.map((e) => ({ code: e.code as string, t: e.t })),
    coached: (ended.coachedMistakes ?? []).map((c) => c.code),
    commendations: ended.events.filter((e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING").map((e) => e.t),
    cards,
    violationCards: vcards,
    score: result.score,
    debrief,
    endedAt: t,
    endedNaturally,
  };
}

/** The good block of a debrief — everything under «Какво се получи добре». */
function goodBlock(text: string): string {
  return (text.split("Какво се получи добре")[1] ?? "").split("\n\n")[0];
}

/** Any line that holds this drive up as clean without saying what it was measured over. */
function unscopedPraise(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (UNSCOPED_PRAISE.test(line)) out.push(line);
    if (line.includes(CLEAN_TITLE) && !line.includes("но само на отделни отсечки")) out.push(line);
  }
  return out;
}

const kinCharges = (o: Out) => o.charged.filter((c) => KIN.has(c));

// ---------------------------------------------------------------------------
// The photographed speed profile, replayed tick by tick (the verifier's
// `replayPhoto`, verbatim in shape): rain, posted 140, motorway, 0.1 s frames.
// ---------------------------------------------------------------------------
const PHOTO: Array<[number, number]> = [
  [0, 0], [1, 14], [6, 58], [12, 85], [17, 99], [22, 110], [28, 116], [33, 129], [140, 129],
];
function photoKmh(t: number, wobble: number): number {
  for (let i = 1; i < PHOTO.length; i++) {
    const [t0, v0] = PHOTO[i - 1];
    const [t1, v1] = PHOTO[i];
    if (t <= t1) {
      const v = v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
      return t > 33 ? v + wobble * Math.sin(t) : v;
    }
  }
  return 129;
}

function spray(level: ScenarioLevel): LessonSpec {
  return compileScenario(SC_AC_TRUCK_SPRAY, level);
}

/** Drive the spray with a speed that is a function of (t, y); ends naturally or at `maxSec`. */
function driveSpray(
  level: ScenarioLevel,
  speedAt: (t: number, y: number, v: number) => number,
  opts: { maxSec?: number; handEndAtSec?: number; abort?: boolean; motorway?: boolean } = {},
): Out {
  let s = createLessonSession(spray(level));
  const cards: TeachMoment[] = [];
  const vcards: Out["violationCards"] = [];
  let y = 15;
  let t = 0;
  let v = 0;
  const maxSec = opts.maxSec ?? 140;
  while (t < maxSec && s.phase === "driving") {
    t = Math.round((t + 0.1) * 10) / 10;
    v = speedAt(t, y, v);
    y += (v / 3.6) * 0.1;
    const r = applyTick(
      s,
      makeTick({
        t,
        speedKmh: v,
        maxSpeedKmh: 140,
        position: { x: 0, y },
        rain: true,
        ...(opts.motorway === false ? {} : { motorway: true }),
      }),
    );
    cards.push(...(r.teachMoments ?? []));
    for (const h of r.hudEvents) {
      if (h.kind === "violation") vcards.push({ titleBg: h.titleBg, explanationBg: h.explanationBg });
    }
    s = r.state;
    if (opts.handEndAtSec !== undefined && t >= opts.handEndAtSec) {
      const ended = opts.abort === true ? abortSession(s, t) : finishSession(s, t);
      return finish(ended, t, cards, vcards);
    }
  }
  return finish(s, t, cards, vcards);
}

const photo = (level: ScenarioLevel, wobble = 2) => driveSpray(level, (t) => photoKmh(t, wobble));

/** Through the ≤80 mark at `pre`, then `post` from the switch point `ys` on — the verifier's `replaySwitch`. */
function switchLeg(level: ScenarioLevel, pre: number, post: number, ys: number): Out {
  return driveSpray(level, (_t, y, v) => {
    const target = y < ys ? pre : post;
    return v < target ? Math.min(target, v + 3 * 3.6 * 0.1) : Math.max(target, v - 4 * 3.6 * 0.1);
  });
}

describe("F1 — the PHOTOGRAPHED profile bills through a tested mechanism, and the debrief is pinned", () => {
  for (const level of [1, 2, 3, 5] as ScenarioLevel[]) {
  }

  it("L1: the pause card names the numbers the drive broke — the task's 80 at the mark, and at the charge also what the rain leaves of the sign (C4)", () => {
    const o = photo(1);
    const card = o.cards.find((c) => c.code === TASK);
    expect(card).toBeDefined();
    // ROUND 6 (ruling 4, the integrator's reading): the card is now the
    // ARRIVAL — the speed the ≤80 mark was passed at and the cap the student
    // read. The photographed profile passes it at ~109, UNDER the 119 the rain
    // leaves of the sign, so the card truthfully names the task's 80 alone.
    expect(card?.explanationBg).toMatch(/^Мина точката на задачата с 1\d\d(,\d)? км\/ч при таван на задачата 80 км\/ч\. /u);
    expect(card?.explanationBg).not.toMatch(/119 км\/ч/u);
    // The charge (the re-grade) carries the measurement too, and at 129 it is
    // over the conditions envelope as well: 0.85 × 140 = 119.
    const charge = o.violationCards.filter((c) => c.titleBg === TASK_TITLE).at(-1);
    expect(charge?.explanationBg).toMatch(/таван на задачата 80 км\/ч/u);
    expect(charge?.explanationBg).toMatch(/119 км\/ч/u);
  });
});

// ROUND 14: «F2 — the neighbours of the photographed leg never finish 0/0/0 with praise» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.

describe("F2 — the finish-time settlement reaches every ending (finishSession / abortSession / route end)", () => {
  it("hand-ended once the task's own 3 s have run after the card, still over the ceiling: the withheld charge is settled", () => {
    // Through the mark at 110 (blown), held. ROUND 6: the teach is now the
    // ARRIVAL, at the blow (it landed ~3 s after the mark before); R3's rule
    // reads the sustained episode's own first bill, absorbed 3 s later — so the
    // ending is 5 s after the card, and 2 s after it (below) nothing is settled.
    const probe = driveSpray(1, () => 110);
    const teachAt = probe.ended.coachedMistakes?.find((c) => c.code === TASK)?.t;
    expect(teachAt).toBeDefined();
    const o = driveSpray(1, () => 110, { handEndAtSec: (teachAt as number) + 5 });
    expect(o.coached).toContain(TASK);
    expect(kinCharges(o)).toEqual([TASK]);
    const aborted = driveSpray(1, () => 110, { handEndAtSec: (teachAt as number) + 5, abort: true });
    expect(kinCharges(aborted)).toEqual([TASK]);
    const early = driveSpray(1, () => 110, { handEndAtSec: (teachAt as number) + 2 });
    expect(early.coached).toContain(TASK);
    expect(kinCharges(early)).toEqual([]);
  });

  it("…and a driver who CORRECTED before the end is acquitted exactly as before", () => {
    const probe = driveSpray(1, () => 110);
    const teachAt = probe.ended.coachedMistakes?.find((c) => c.code === TASK)?.t as number;
    // 110 until the card, then back to 70 (under the figure) held 5 s, then ended.
    const o = driveSpray(1, (t) => (t < teachAt + 0.5 ? 110 : 70), { handEndAtSec: teachAt + 5.5 });
    expect(o.coached).toContain(TASK);
    expect(kinCharges(o)).toEqual([]);
  });

  it("ROUND 4 (founder ruling «Yes, same as speeding»): a pure-rain overspeed with NO task in the act, taught and then ended over the envelope, IS settled", () => {
    // No task stamp here: honoured at the mark (70), then 129 over the rain envelope.
    const probe = driveSpray(1, (_t, y) => (y < 470 ? 70 : 129));
    const teachAt = probe.ended.coachedMistakes?.find((c) => c.code === COND)?.t;
    expect(teachAt).toBeDefined();
    const o = driveSpray(1, (_t, y) => (y < 470 ? 70 : 129), { handEndAtSec: (teachAt as number) + 2 });
    expect(o.coached).toContain(COND);
    // Round 2 settled it (1 point); round 3 restored base (0) pending the
    // founder; the founder answered 2026-09-25 «Yes, same as speeding» — a taught
    // weather overspeed still running when the drive ends is settled, as
    // SPEEDING_OVER_LIMIT is since 0e58070 (rules/engine.ts
    // settleUnpaidAdaptationTeach).
    expect(kinCharges(o)).toEqual([COND]);
  });
});

// ---------------------------------------------------------------------------
// F3 — the praise branch round 1 did not test: a commendation earned lawfully
// on the approach, then the cap broken, taught and never charged.
// ---------------------------------------------------------------------------
// ROUND 4 (founder ruling 2026-09-25 «Only the named stretch»): the capped
// mark borrows the spray curtain's id (`CURTAIN_OBJECTIVE_ID`) so its stretch
// is the curtain's — to the next goal — the case every test below was written
// for; a mark naming only its own zone is `task-cap-round4.test.ts`'s.
function twoMarks(markY: number, nextY: number, endY: number, cap: number, posted: number): LessonSpec {
  const objectives: LessonSpec["objectives"] = [
    { id: CURTAIN_OBJECTIVE_ID, titleBg: "Точка", kind: "reachZone", params: { x: 0, y: markY, radiusM: 12, maxSpeedKmh: cap } },
  ];
  if (nextY !== endY) {
    objectives.push({ id: "o-next", titleBg: "Следваща", kind: "reachZone", params: { x: 0, y: nextY, radiusM: 12 } });
  }
  objectives.push({ id: "o-end", titleBg: "Край", kind: "reachZone", params: { x: 0, y: endY, radiusM: 12 } });
  return {
    id: "t-cap-r2",
    order: 1,
    titleBg: "Проба",
    descriptionBg: "",
    conceptIds: [],
    postedLimitKmh: posted,
    spawn: { position: { x: 0, y: 15 }, headingDeg: 0 },
    preDrive: false,
    vehicleStart: "ready",
    objectives,
  };
}

function driveLesson(
  lesson: LessonSpec,
  speedAt: (t: number, y: number) => number,
  opts: { posted: number; rain?: boolean; maxSec?: number; handEndAt?: (t: number, y: number) => boolean; accel?: number },
): Out {
  let s = createLessonSession(lesson);
  const cards: TeachMoment[] = [];
  const vcards: Out["violationCards"] = [];
  let y = 15;
  let t = 0;
  let v = 0;
  const accel = opts.accel ?? 2.5;
  while (t < (opts.maxSec ?? 300) && s.phase === "driving") {
    t = Math.round((t + 0.1) * 10) / 10;
    const target = speedAt(t, y);
    v = v < target ? Math.min(target, v + accel * 3.6 * 0.1) : Math.max(target, v - 4 * 3.6 * 0.1);
    y += (v / 3.6) * 0.1;
    const r = applyTick(
      s,
      makeTick({ t, speedKmh: v, maxSpeedKmh: opts.posted, position: { x: 0, y }, ...(opts.rain ? { rain: true } : {}) }),
    );
    cards.push(...(r.teachMoments ?? []));
    for (const h of r.hudEvents) {
      if (h.kind === "violation") vcards.push({ titleBg: h.titleBg, explanationBg: h.explanationBg });
    }
    s = r.state;
    if (opts.handEndAt?.(t, y) === true) break;
  }
  return finish(s, t, cards, vcards);
}

describe("F3 — no praise after a cap breach, in ANY branch", () => {
  // ≤30 mark at y = 400 on a 50 street; 29 on the approach (a CLEAN_DRIVING is
  // earned there, lawfully), 45 through the mark (blown: 45 > 30 + 5).
  const praiseLeg = (y: number) => (y < 340 ? 29 : 45);

  it("natural route end 100 m after the blown mark: the commendation is kept (the metres were driven) but SCOPED — and the breach is on the sheet", () => {
    const o = driveLesson(twoMarks(400, 500, 500, 30, 50), (_t, y) => praiseLeg(y), { posted: 50 });
    expect(o.commendations.length).toBeGreaterThan(0);
    expect(o.coached).toContain(TASK);
    // The route ended with the car still over the ceiling: the finish-time
    // settlement (F2) charges what the teach withheld, so the rider points at
    // the mistakes block, which names it.
    expect(kinCharges(o)).toEqual([TASK]);
    expect(unscopedPraise(o.debrief)).toEqual([]);
    const good = goodBlock(o.debrief);
    expect(good).toContain(CLEAN_TITLE);
    expect(good).toContain("но само на отделни отсечки");
    expect(o.debrief).toContain(TASK_TITLE);
  });

  it("taught, CORRECTED, never charged: the rider names the task breach itself (the sheet is empty, so «отбелязани грешки» would point at nothing)", () => {
    // Through the mark at 45 (blown), 45 until the card, then back to 25 — under
    // the figure — until the route ends: no settlement (the car is inside), no
    // re-grade (the correction ended the episode).
    const probe = driveLesson(twoMarks(400, 5000, 5000, 30, 50), (_t, y) => praiseLeg(y), { posted: 50, maxSec: 80 });
    const teach = probe.ended.coachedMistakes?.find((c) => c.code === TASK)?.t as number;
    expect(teach).toBeGreaterThan(0);
    const o = driveLesson(twoMarks(400, 700, 700, 30, 50), (t, y) => (t < teach + 0.3 ? praiseLeg(y) : 25), {
      posted: 50,
    });
    expect(o.coached).toContain(TASK);
    expect(kinCharges(o)).toEqual([]);
    expect(o.commendations.length).toBeGreaterThan(0);
    expect(unscopedPraise(o.debrief)).toEqual([]);
    expect(goodBlock(o.debrief)).toContain("в същия урок мина над тавана на задачата (виж «Учебни моменти»)");
  });

  it("hand-ended 5 s after the blown mark: the same", () => {
    let blownAt: number | null = null;
    const o = driveLesson(twoMarks(400, 5000, 5000, 30, 50), (_t, y) => praiseLeg(y), {
      posted: 50,
      handEndAt: (t, y) => {
        if (blownAt === null && y > 400) blownAt = t;
        return blownAt !== null && t - blownAt >= 5;
      },
    });
    expect(o.commendations.length).toBeGreaterThan(0);
    expect(unscopedPraise(o.debrief)).toEqual([]);
  });

  it("ROUND 4 (founder ruling «Yes, same as speeding»): a CONDITIONS breach that was only taught, on a drive that never blew its cap, rules out unscoped praise", () => {
    // Dry approach earns the commendation; rain envelope 42.5 on a 50 street;
    // 48 held (over the envelope, under the sign), hand-ended 1 s after the teach.
    const lesson = twoMarks(3000, 3000, 3000, 45, 50);
    const probe = driveLesson(lesson, (_t, y) => (y < 400 ? 40 : 48), { posted: 50, rain: true, maxSec: 60 });
    const teach = probe.ended.coachedMistakes?.find((c) => c.code === COND)?.t;
    expect(teach).toBeDefined();
    // End it BEFORE the settlement could see it over — the car has corrected to 40.
    const o = driveLesson(lesson, (t, y) => (y < 400 ? 40 : t < (teach as number) + 0.3 ? 48 : 40), {
      posted: 50,
      rain: true,
      handEndAt: (t) => t >= (teach as number) + 5,
    });
    expect(o.coached).toContain(COND);
    expect(kinCharges(o)).toEqual([]);
    // Round 2 scoped this praise; round 3 left it as base printed it (the drive
    // broke no task cap — its ≤45 mark is 3 km away and never reached) pending
    // the founder; the founder answered 2026-09-25 «Yes, same as speeding»: a
    // taught weather overspeed rules out unscoped CLEAN_DRIVING praise.
    expect(o.ended.taskCapBreaches).toBeUndefined();
    expect(unscopedPraise(o.debrief)).toEqual([]);
  });
});

describe("C1 — after a blown mark the ceiling keeps the grace the product uses everywhere else", () => {
  it(`REACH_ZONE_CAP_SLACK_KMH is ${REACH_ZONE_CAP_SLACK_KMH} — the objective's own blow rule and the posted-limit grace at 80 (min(10 %, 5))`, () => {
    expect(REACH_ZONE_CAP_SLACK_KMH).toBe(5);
  });

  it("through a ≤80 mark at 100 (blown), then 83 held on a dry 140: the arrival is taught, and the 83 is never billed — 83 against a posted 80 is not billed either", () => {
    // ROUND 6 (ruling 4, the integrator's reading): the blow at 100 IS the
    // offence, one taught card at the blow (round 2 pinned no card here); the 83
    // held after it, inside the slack, adds nothing and is never charged.
    const task = driveLesson(twoMarks(200, 1500, 1500, 80, 140), (_t, y) => (y < 230 ? 100 : 83), { posted: 140 });
    expect(task.coached.filter((c) => c === TASK)).toHaveLength(1);
    expect(kinCharges(task)).toEqual([]);
    // Positive control, same leg settling at 86 (over 80 + 5): the act keeps
    // running over the bill line, and its one charge lands.
    const over = driveLesson(twoMarks(200, 1500, 1500, 80, 140), (_t, y) => (y < 230 ? 100 : 86), { posted: 140 });
    expect(over.coached.filter((c) => c === TASK)).toHaveLength(1);
    expect(kinCharges(over)).toEqual([TASK]);
  });

  it("X9 — L3 through the ≤80 mark at 84 (inside the slack, never blown) and held: never TASK", () => {
    const o = driveSpray(3, (_t, _y, v) => Math.min(84, v + 0.9));
    expect([...o.coached, ...o.charged]).not.toContain(TASK);
  });

  it("X9 — L3 through the ≤80 mark at 88 (blown), then 83: the arrival once, taught, never charged", () => {
    const o = driveSpray(3, (_t, y, v) => {
      const target = y < 470 ? 88 : 83;
      return v < target ? Math.min(target, v + 0.9) : Math.max(target, v - 1.4);
    });
    // ROUND 6: the blow at 88 is billed as the arrival (round 2 pinned «never
    // TASK» here); the 83 after it is inside the slack and adds nothing.
    expect(o.coached.filter((c) => c === TASK)).toHaveLength(1);
    expect(o.charged).not.toContain(TASK);
  });
});

describe("C2 — the ceiling binds only over the stretch the task's cap governs", () => {
  // ≤30 at y = 200 on a 50 street; the NEXT goal is at y = 400 (radius 12), the
  // route ends far away. Through the mark at 45 (blown), back to 25 at once
  // (under the figure), and 45 again only once the next goal is behind.
  const leg = (_t: number, y: number) => (y < 150 ? 29 : y < 215 ? 45 : y < 430 ? 25 : 45);

  it("past the next goal the task's ceiling no longer binds: 45 on the 50 street for 2 km books nothing after the arrival", () => {
    // ROUND 6: the blow at 45 through the ≤30 mark is the arrival, one taught
    // card (round 2 pinned no card at all); the 2 km at 45 past the next goal
    // add nothing — no second card, no charge.
    const o = driveLesson(twoMarks(200, 400, 2500, 30, 50), leg, { posted: 50, accel: 3 });
    expect(o.coached.filter((c) => c === TASK)).toHaveLength(1);
    expect(kinCharges(o)).toEqual([]);
  });

  it("CONTROL — the same drive where the next goal IS the far end: the stretch still runs and the 45 on it is charged", () => {
    const o = driveLesson(twoMarks(200, 2500, 2500, 30, 50), leg, { posted: 50, accel: 3 });
    expect(o.coached.filter((c) => c === TASK)).toHaveLength(1);
    expect(kinCharges(o)).toEqual([TASK]);
  });
});

describe("C3 — one continuous act under one law is one bill (plus its code's own re-grade), in BOTH directions", () => {
  // The photographed profile with its time axis stretched ×1.1 (verifier's k-sweep).
  function scaled(level: ScenarioLevel, k: number): Out {
    return driveSpray(level, (t) => (t / k > 33 ? 129 + 2 * Math.sin(t) : photoKmh(t / k, 0)));
  }

  for (const level of [1, 3] as ScenarioLevel[]) {
  }

  it("de-escalating, SHORT: 125 only long enough for the conditions teach, then 100 over the task — one charge, and it names the ceiling that is broken on that frame", () => {
    // The conditions code teaches at 125; the car drops to 100 BEFORE its own
    // re-grade — inside the envelope, still over the task. The act's one
    // charge falls to the task code (the conditions ceiling is not broken at
    // 100), and it is the only one.
    const probe = driveLesson(twoMarks(600, 2400, 2400, 80, 140), () => 125, { posted: 140, rain: true, maxSec: 40 });
    const teachAt = probe.ended.coachedMistakes?.find((c) => c.code === COND)?.t as number;
    expect(teachAt).toBeGreaterThan(0);
    const o = driveLesson(twoMarks(600, 2400, 2400, 80, 140), (t) => (t < teachAt + 1 ? 125 : 100), {
      posted: 140,
      rain: true,
    });
    expect(o.coached).toContain(COND);
    expect(kinCharges(o)).toEqual([TASK]);
  });
});

// ---------------------------------------------------------------------------
// The production recorder on mw-v1 (the verifier's `runRecorded`): real ticks —
// rain, motorway, the staged truck, posted 140 — into a real session.
// ---------------------------------------------------------------------------
function runRecorded(level: ScenarioLevel, script: DriveScript): Out {
  let s = createLessonSession(spray(level));
  const cards: TeachMoment[] = [];
  const vcards: Out["violationCards"] = [];
  let lastT = 0;
  recordScriptedDrive(MW, script, {
    scenarioId: "sc-ac-truck-spray",
    kind: "mistake",
    seed: 7,
    rain: true,
    stagedEvents: [...(SC_AC_TRUCK_SPRAY.staged ?? [])] as StagedEventSpec[],
    ruleConfig: { followRainAwareEnabled: true },
    onTick: (tick) => {
      if (s.phase !== "driving") return;
      const r = applyTick(s, tick);
      s = r.state;
      lastT = tick.t;
      cards.push(...(r.teachMoments ?? []));
      for (const h of r.hudEvents) {
        if (h.kind === "violation") vcards.push({ titleBg: h.titleBg, explanationBg: h.explanationBg });
      }
    },
  });
  return finish(s, lastT, cards, vcards);
}
const XL = -8.12;
function leftLane(kmh: number): DriveScript {
  return {
    steps: [
      { kind: "headlights", setting: "low" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[0, 15], [0, 40], [XL, 110]], targetKmh: kmh, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[XL, 110], [XL, 450], [XL, 2300]], targetKmh: kmh, stopAtEnd: false },
      { kind: "drive", points: [[XL, 2300], [XL, 2400]], targetKmh: kmh },
    ],
  };
}

// ROUND 14: «the production recorder — the wrong leg in the left lane» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.

// ROUND 14: «C4 — whichever code carries the act says BOTH numbers» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.

// ROUND 14: «C3 — the act's one charge is not paid twice when its owner was charged on sight» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.

describe("C2 → R1 — the stretch itself (finish.ts taskCapStretch), a bounded region since round 3", () => {
  // ROUND 5 (2026-09-26, verifier F2): these cases test the REGION, which since
  // round 5 is what a `goal`-kind feature (the curtain, a lead, a section) gets;
  // a bare mark is its own zone. So the region is asked for explicitly.
  const GOAL = { kind: "goal" } as const;
  const mark: ObjectiveParams = { kind: "reachZone", x: 0, y: 450, radiusM: 12, maxSpeedKmh: 80 };
  const end: ObjectiveParams = { kind: "reachZone", x: 0, y: 860, radiusM: 12 };
  const at = (y: number) => ({ x: 0, y });
  const approach = { x: 0, y: 300 };

  it("from the mark to the far edge of the next goal: a 410 m corridor, then the goal's own 12 m disc", () => {
    const s = taskCapStretch([mark, end], 0, approach, GOAL);
    expect(s?.corner).toBeNull(); // straight on: one corridor along the chord
    expect(s?.goal).toEqual({ x: 0, y: 860, radiusM: 12 });
    expect(withinTaskCapStretch(s!, at(450))).toBe(true);
    expect(withinTaskCapStretch(s!, at(871.9))).toBe(true);
    expect(withinTaskCapStretch(s!, at(872.1))).toBe(false);
    // Behind the mark is the approach — an arrival demand, never the ceiling.
    expect(withinTaskCapStretch(s!, at(449.9))).toBe(false);
  });

  it("a goal with no place (drive N metres) is skipped for the next located one", () => {
    const s = taskCapStretch([mark, { kind: "driveDistance", meters: 50 }, end], 0, approach, GOAL);
    expect(s?.goal).toEqual({ x: 0, y: 860, radiusM: 12 });
  });

  it("with no later goal the stretch is the capped zone itself, along the student's approach — and an unknown approach is no stretch", () => {
    const s = taskCapStretch([mark], 0, approach, GOAL);
    expect(s?.corner).toBeNull();
    expect(s?.goal).toEqual({ x: 0, y: 450, radiusM: 12 });
    expect(withinTaskCapStretch(s!, at(461.9))).toBe(true);
    expect(withinTaskCapStretch(s!, at(462.1))).toBe(false);
    expect(taskCapStretch([mark], 0, null, GOAL)).toBeNull();
  });

  it("only a capped reachZone has a stretch", () => {
    expect(taskCapStretch([{ kind: "driveDistance", meters: 50 }, end], 0, null)).toBeNull();
  });
});
