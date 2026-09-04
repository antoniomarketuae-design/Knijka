/**
 * SWEEP 161 · the „+150 XP mobile / +100 XP desktop" finding, refuted by
 * arithmetic — and the lock-out defect that WAS in `progression.ts`.
 *
 * THE FRAMES, both real, both opened:
 *   `.audit-frames/sweep161/sc-pk-ban-stop/mobile-right/08-debrief.png`
 *       «Спиране в забранена зона · Ниво 1 — Пълна помощ · резултат»
 *       0 наказателни точки · ИЗДЪРЖАН · +150 XP
 *   `.audit-frames/sweep161/sc-pk-ban-stop/pc-right/08-debrief.png`
 *       the same title, the same 0, the same ИЗДЪРЖАН, ★★★ · +100 XP
 *
 * The finding read „Identical outcome, different reward … for the same lesson
 * at the same difficulty" and was filed at `lessons/progression.ts`. That file
 * has no XP concept in it — 110 lines of unlock / attempts / best-score — so
 * the row could not have been closed there whatever the truth was. The award
 * is computed in `app/(dashboard)/simulator/actions.ts` from
 * `gamification/xp.ts`, and this file is the lane's record of WHY the numbers
 * differ, because a refutation that is never written down is indistinguishable
 * from a file nobody opened.
 *
 * §1 — THE REFUTATION IS AN ENUMERATION, NOT AN OPINION. The sim-lesson award
 * is a closed four-term sum over a finite domain, so the whole space can be
 * walked: 150 and 100 are each reachable by exactly ONE combination, and those
 * two combinations agree on every term except the one-time first-pass
 * milestone. The counter-proof rides the same walk — no `cleanDrives` value
 * reaches 150 without the milestone, which is the reading the finding assumed.
 * The frames' own mtimes then say which run spent the milestone:
 * mobile-right's debrief was written 2026-08-17 13:12:04 and pc-right's
 * 13:22:30 — same account, ten minutes apart, so the desktop leg was the
 * SECOND pass and the milestone was already banked. Different reward, same
 * outcome, and the difference is a repeat rather than a platform.
 *
 * §2 — THE DEFECT THE FINDING WALKED PAST. `computeProgression` resolved „the
 * previous lesson" as `triedByOrder.get(lesson.order - 1)`, i.e. by ARITHMETIC
 * on the order number, with `?? false` on a miss. Nothing declared that the
 * caller must hand in a contiguous integer run and nothing checked it, so a
 * list whose orders skip — the shipped полигон cards at 0.5 / 1.5, the exam
 * card at 100 — produced LOCKED FOREVER for the rows it could not address.
 * §2 measures that on the real catalogue: feeding every shipped spec with
 * EVERY lesson already attempted, the pre-fix gate still refused
 * `l0p-poligon-free`. It is a lock nothing in the product can open, and the
 * student it would hit is one who has already finished the course.
 *
 * WHAT EACH ASSERTION ANSWERS TO (mutation, run and observed):
 *   · §1 REWARDS — set XP_SIM_FIRST_PASS_BONUS 50 → 40: „150 is reachable"
 *     fails, because the sum can no longer produce it at all.
 *   · §1 counter-proof — raise XP_SIM_CLEAN_DRIVE_MAX 3 → 11: 150 becomes
 *     reachable a second way (40+60+0+50·… ) and the „exactly one" assertion
 *     fails. The uniqueness is a real property of the shipped constants, not a
 *     restatement of them.
 *   · §2 — restore `triedByOrder.get(lesson.order - 1) ?? false` in
 *     progression.ts and the polygon row goes back to `unlocked: false` while
 *     every chain assertion in `progression.test.ts` stays green. That is the
 *     point: the old suite could not see this, and this one cannot miss it.
 */

import { describe, expect, it } from "vitest";
import {
  XP_SIM_CLEAN_DRIVE,
  XP_SIM_CLEAN_DRIVE_MAX,
  XP_SIM_COMPLETED,
  XP_SIM_FIRST_PASS_BONUS,
  XP_SIM_PASSED_BONUS,
  xpForEvent,
} from "../../../gamification/xp";
import { computeProgression, type LessonAttemptRow } from "../progression";
import { EXAM_LESSON, LESSONS, POLIGON_LESSONS } from "../specs";

// ---------------------------------------------------------------------------
// §1 — the two numbers on the two debriefs
// ---------------------------------------------------------------------------

/** What the mobile-right debrief chip read. */
const MOBILE_XP = 150;
/** What the pc-right debrief chip read, on the identical 0 / ИЗДЪРЖАН result. */
const PC_XP = 100;

interface Award {
  passed: boolean;
  firstPass: boolean;
  cleanDrives: number;
}

/** Every award a finished `sim_lesson` drive can produce, walked exhaustively.
 *  `cleanDrives` is swept past its own cap so the cap is exercised, not
 *  assumed. */
function everyAward(): Array<Award & { xp: number }> {
  const out: Array<Award & { xp: number }> = [];
  for (const passed of [true, false]) {
    for (const firstPass of [true, false]) {
      for (let cleanDrives = 0; cleanDrives <= XP_SIM_CLEAN_DRIVE_MAX + 4; cleanDrives++) {
        out.push({
          passed,
          firstPass,
          cleanDrives,
          xp: xpForEvent({
            type: "sim_lesson",
            passed,
            score: 0,
            lessonId: "sc-pk-ban-stop@L1",
            firstPass,
            cleanDrives,
          }),
        });
      }
    }
  }
  return out;
}

/** Distinct (passed, firstPass, clamped cleanDrives) shapes that reach `xp`. */
function shapesReaching(xp: number): Array<{ passed: boolean; firstPass: boolean; clean: number }> {
  const seen = new Map<string, { passed: boolean; firstPass: boolean; clean: number }>();
  for (const a of everyAward()) {
    if (a.xp !== xp) continue;
    const clean = Math.min(a.cleanDrives, XP_SIM_CLEAN_DRIVE_MAX);
    seen.set(`${a.passed}|${a.firstPass}|${clean}`, { passed: a.passed, firstPass: a.firstPass, clean });
  }
  return [...seen.values()];
}

describe("1 · the two debrief chips differ by the first-pass milestone and by nothing else", () => {
  it("both chips are reachable, each by exactly one award shape", () => {
    const mobile = shapesReaching(MOBILE_XP);
    const pc = shapesReaching(PC_XP);
    expect(mobile, `${MOBILE_XP} XP (mobile-right/08-debrief.png) is unreachable`).toHaveLength(1);
    expect(pc, `${PC_XP} XP (pc-right/08-debrief.png) is unreachable`).toHaveLength(1);
  });

  it("both shapes are a PASS with no clean-drive commendation — as both frames read ИЗДЪРЖАН", () => {
    for (const [xp, shape] of [
      [MOBILE_XP, shapesReaching(MOBILE_XP)[0]!],
      [PC_XP, shapesReaching(PC_XP)[0]!],
    ] as const) {
      expect(shape.passed, `${xp} XP came from a failed drive`).toBe(true);
      expect(shape.clean, `${xp} XP needed clean-drive commendations`).toBe(0);
    }
  });

  it("the ONLY term they disagree on is the one-time first-pass milestone", () => {
    const mobile = shapesReaching(MOBILE_XP)[0]!;
    const pc = shapesReaching(PC_XP)[0]!;
    expect(mobile.firstPass).toBe(true);
    expect(pc.firstPass).toBe(false);
    // …and the gap IS that term, to the point.
    expect(MOBILE_XP - PC_XP).toBe(XP_SIM_FIRST_PASS_BONUS);
    // The base both frames share is the completed + passed pair, so nothing
    // platform-shaped is left over to explain.
    expect(PC_XP).toBe(XP_SIM_COMPLETED + XP_SIM_PASSED_BONUS);
  });

  it("counter-proof: no clean-drive count reaches 150 without the milestone", () => {
    // The reading the finding assumed — „same result, different pay" — would
    // need 150 to be reachable some other way on the desktop leg. It is not:
    // the commendation term is capped below the gap.
    const withoutMilestone = everyAward().filter((a) => !a.firstPass).map((a) => a.xp);
    expect(Math.max(...withoutMilestone)).toBeLessThan(MOBILE_XP);
    expect(XP_SIM_CLEAN_DRIVE * XP_SIM_CLEAN_DRIVE_MAX).toBeLessThan(XP_SIM_FIRST_PASS_BONUS);
  });

  it("counter-proof: the milestone is one-time, so a repeat of the SAME drive pays less", () => {
    // This is the whole refutation in one line — identical inputs but for the
    // flag the server derives from history (`firstPass: passed && !previously
    // Passed`, actions.ts), which is exactly what ten minutes and one earlier
    // pass changed between the two frames.
    const base = { type: "sim_lesson", score: 0, lessonId: "sc-pk-ban-stop@L1", cleanDrives: 0 } as const;
    expect(xpForEvent({ ...base, passed: true, firstPass: true })).toBe(MOBILE_XP);
    expect(xpForEvent({ ...base, passed: true, firstPass: false })).toBe(PC_XP);
  });
});

// ---------------------------------------------------------------------------
// §1b — THE SAME FINDING, FILED AGAIN, WITH THE PLATFORMS THE OTHER WAY ROUND
//
// `sc-sig-controller-postures:f7e046c4` (w13, major) carries the identical
// sentence — „a perfect drive is worth +150 XP on mobile and +100 XP on pc" —
// against `.audit-frames/sweep161/sc-sig-controller-postures/{mobile,pc}-right/
// 08-debrief.png`. Both frames were opened. They read:
//
//   mobile-right  «Езикът на регулировчика · Ниво 1 — Пълна помощ · резултат»
//                 0 наказателни точки · ИЗДЪРЖАН · +100 XP
//   pc-right      the same title, the same 0, the same ИЗДЪРЖАН, ★★★ · +150 XP
//
// i.e. the row's own text has the two platforms the wrong way round, and the
// numbers it names are on the OPPOSITE screens from `sc-pk-ban-stop`'s. That is
// the refutation in its strongest form: if the platform were the variable, the
// same pair of numbers could not land on the same pair of platforms swapped.
// The frames' mtimes say which leg spent the one-time milestone here, exactly
// as they did there — pc-right's debrief was written 2026-08-18 00:05:42.035
// and mobile-right's 00:05:54.935, so on THIS lesson the desktop leg finished
// first and banked it, and the phone was the repeat.
//
// Nothing below re-derives the arithmetic §1 already walked; it asserts that
// the enumeration is symmetric under the swap, which is the only claim §1 does
// not already make.
// ---------------------------------------------------------------------------
describe("1b · the same two numbers, on the opposite platforms, one lesson over", () => {
  /** What `sc-sig-controller-postures/mobile-right/08-debrief.png` reads. */
  const POSTURES_MOBILE_XP = 100;
  /** …and `pc-right/08-debrief.png`, on the identical 0 / ИЗДЪРЖАН result. */
  const POSTURES_PC_XP = 150;

  it("is the SAME pair of chips as sc-pk-ban-stop, with the screens exchanged", () => {
    expect(new Set([POSTURES_MOBILE_XP, POSTURES_PC_XP])).toEqual(new Set([MOBILE_XP, PC_XP]));
    expect(POSTURES_MOBILE_XP).toBe(PC_XP);
    expect(POSTURES_PC_XP).toBe(MOBILE_XP);
  });

  it("so the award cannot be a function of the platform — it has no such input", () => {
    // `xpForEvent` is handed no device, viewport or user-agent, and the whole
    // shape of the award is enumerated in §1. The only term that separates the
    // two chips is `firstPass`, and it separates them the same way on whichever
    // screen happens to have driven the lesson first.
    const base = {
      type: "sim_lesson",
      score: 0,
      lessonId: "sc-sig-controller-postures@L1",
      cleanDrives: 0,
    } as const;
    expect(xpForEvent({ ...base, passed: true, firstPass: true })).toBe(POSTURES_PC_XP);
    expect(xpForEvent({ ...base, passed: true, firstPass: false })).toBe(POSTURES_MOBILE_XP);
  });

  it("and the lesson id is not an input either — both drills pay identically", () => {
    // The last thing the row could mean is that the two templates pay
    // differently. They do not: the award reads `passed`, `firstPass` and
    // `cleanDrives`, and the id only rides along for the ledger.
    for (const firstPass of [true, false]) {
      expect(
        xpForEvent({
          type: "sim_lesson",
          passed: true,
          score: 0,
          lessonId: "sc-sig-controller-postures@L1",
          firstPass,
          cleanDrives: 0,
        }),
      ).toBe(
        xpForEvent({
          type: "sim_lesson",
          passed: true,
          score: 0,
          lessonId: "sc-pk-ban-stop@L1",
          firstPass,
          cleanDrives: 0,
        }),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// §2 — the lock-out that was in this file
// ---------------------------------------------------------------------------

/** The pre-fix gate, verbatim, as the thing this section convicts. */
function unlockedByOrderArithmetic(
  lessons: ReadonlyArray<{ id: string; order: number }>,
  attemptedIds: ReadonlySet<string>,
): Map<string, boolean> {
  const ordered = [...lessons].sort((a, b) => a.order - b.order);
  const triedByOrder = new Map<number, boolean>();
  for (const l of ordered) triedByOrder.set(l.order, attemptedIds.has(l.id));
  return new Map(
    ordered.map((l) => [
      l.id,
      l.order === ordered[0]!.order || (triedByOrder.get(l.order - 1) ?? false),
    ]),
  );
}

describe("2 · a lesson whose predecessor's order is not exactly one less", () => {
  /** Every shipped spec in one list — the input the old arithmetic could not
   *  address, and the one a future caller is most likely to hand in. */
  const ALL = [...LESSONS, ...POLIGON_LESSONS, EXAM_LESSON];
  const everythingDriven: LessonAttemptRow[] = ALL.map((l) => ({
    lessonId: l.id,
    passed: true,
    score: 0,
  }));

  it("MEASURED: the old arithmetic locked l0p-poligon-free against a student who had driven everything", () => {
    const old = unlockedByOrderArithmetic(ALL, new Set(ALL.map((l) => l.id)));
    // 0.5 − 1 = −0.5, which is in no catalogue, so `?? false` won.
    expect(old.get("l0p-poligon-free")).toBe(false);
    // …while its neighbour at 1.5 survived only by the accident that 0.5 exists.
    expect(old.get("l8-poligon")).toBe(true);
  });

  it("the shipped gate opens every one of them once its predecessor is driven", () => {
    const entries = computeProgression(ALL, everythingDriven);
    const locked = entries.filter((e) => !e.unlocked).map((e) => `${e.lesson.order}:${e.lesson.id}`);
    expect(locked, "a finished student still sees locked doors").toEqual([]);
  });

  it("…and still refuses the one that has NOT been driven — the gate did not simply open", () => {
    // A false certificate points both ways: a fix for a lock-out that unlocks
    // unconditionally is the same crime as the lock-out.
    const onlyFirst: LessonAttemptRow[] = [{ lessonId: "l0-free-drive", passed: true, score: 0 }];
    const entries = computeProgression(ALL, onlyFirst);
    const unlocked = entries.filter((e) => e.unlocked).map((e) => e.lesson.id);
    expect(unlocked).toEqual(["l0-free-drive", "l0p-poligon-free"]);
    // Everything past the second rung stays shut, including the exam card.
    expect(entries.find((e) => e.lesson.id === "lex-exam-1")!.unlocked).toBe(false);
    expect(entries.find((e) => e.lesson.id === "l7-parking")!.unlocked).toBe(false);
  });

  it("a synthetic catalogue with a skipped integer no longer strands its tail", () => {
    // The regression that would reintroduce this: renumbering the chain, or
    // inserting a lesson and forgetting to renumber the rest.
    const gapped = [
      { ...LESSONS[0]!, id: "a", order: 0 },
      { ...LESSONS[1]!, id: "b", order: 1 },
      { ...LESSONS[2]!, id: "c", order: 9 },
    ];
    const driven: LessonAttemptRow[] = [
      { lessonId: "a", passed: true, score: 0 },
      { lessonId: "b", passed: false, score: 12 },
    ];
    expect(unlockedByOrderArithmetic(gapped, new Set(["a", "b"])).get("c")).toBe(false);
    expect(computeProgression(gapped, driven).find((e) => e.lesson.id === "c")!.unlocked).toBe(true);
  });

  it("the shipped chain is the reason this was latent, so its shape is pinned", () => {
    // `/simulator/page.tsx` passes LESSONS alone, and LESSONS happens to be a
    // contiguous run from 0 with unique orders. That accident is what kept the
    // arithmetic honest; it is now recorded rather than relied upon.
    const orders = [...LESSONS].map((l) => l.order).sort((a, b) => a - b);
    expect(new Set(orders).size).toBe(orders.length);
    expect(orders).toEqual(orders.map((_, i) => i));
    // …and the out-of-chain cards are precisely the ones that break it.
    expect([...POLIGON_LESSONS.map((l) => l.order), EXAM_LESSON.order]).toEqual([0.5, 1.5, 100]);
  });
});
