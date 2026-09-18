/**
 * ADR-009 T2 — THE VERDICT: a practice lesson is NOT TAKEN when the student
 * commits the mistake it exists to teach (founder Ruling A, 2026-09-17; spec
 * `docs/simulation/92_ADR009_LESSON_MISTAKE_SPEC.md` §8.1 T2).
 *
 * THIS IS THE FILE THAT SAYS THE RULING IS REAL. Everything else in lane C
 * withholds a point or moves a card; this one asserts the one sentence the
 * founder ruled on — park on the bus stop in the lesson about where you may
 * stop, and the lesson is not taken, the first time, with NO exam points taken
 * for that first occurrence.
 *
 * WHAT IT DRIVES, AND WHY THAT AND NOT A FIXTURE. `sc-vu-pass-clearance`'s two
 * ❌ demos, through the production chain `compileScenario →
 * createLessonSession → applyTick → buildLessonResult` — the entry points
 * `LessonPlayShell.tsx` calls — on the committed recordings the product ships.
 * A hand-built `LessonResult` would prove the fold's arithmetic and nothing
 * about whether the fold is WIRED, and this programme has measured 51 such
 * repairs in 82: a predicate nothing live reads.
 *
 * THE FOUR ANSWERS IT PINS, each with the control that makes it a measurement
 * rather than a constant:
 *   §1  the mistake demos at L1/L2/L3/L5 → NOT passed, score 0, one UNCHARGED
 *       hit …and the same tapes at L4 (the shipped exam rung) → passed, the
 *       official 3 points, and NO `lessonMistakes` field at all;
 *   §2  the shadow recording → passed at every rung, field absent. A ruling
 *       that refuses everything refuses nothing;
 *   §3  a REPEAT reaches the sheet and the hit reads `charged: true` — founder
 *       answer F1, and the half that keeps §1's «no points» honest rather than
 *       absolute;
 *   §4  the THEO-3 sandbox and a lesson with no targets → untouched;
 *   §5  M1, EXECUTED rather than described: strip `lessonMistakeTargets` off a
 *       copy of the same compiled lesson and the same drive passes again. That
 *       is the rollback the spec's dead-predicate ledger promises, run here.
 *
 * NO STAR ASSERTIONS LIVE HERE (spec §8.1 T2). The 1★ cap is `rubric.ts`'s and
 * has not landed in this lane; a drive that fails ADR-009 can currently still
 * show 3★, which is lane E's to close and is stated in lane C's report rather
 * than pinned in a suite that does not own it.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { LessonSpec } from "../../contracts";
import { recordScVuPassDrive, type ScVuPassTraceName } from "../../traces/scVuPass";
import { applyTick, buildLessonResult, createLessonSession } from "../engine";
import { compileScenario } from "../scenario/compile";
import { SC_VU_PASS_CLEARANCE } from "../scenario/templates-vru";
import type { ScenarioLevel } from "../scenario/types";
import type { LessonResult, LessonSessionState } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const district: unknown = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "vu-pass-v1.json"), "utf-8"),
);

const CODE = "VULNERABLE_PASS_TOO_CLOSE";
const MISTAKES: ScVuPassTraceName[] = ["mistake-squeeze", "mistake-fast-close"];
/** Practice rungs. L4 is `examMode` by `compile.ts rungExamMode`, and is the control. */
const PRACTICE: ScenarioLevel[] = [1, 2, 3, 5];

function play(name: ScVuPassTraceName, level: ScenarioLevel, tweak?: (l: LessonSpec) => LessonSpec): LessonResult {
  const compiled = compileScenario(SC_VU_PASS_CLEARANCE, level);
  let session: LessonSessionState = createLessonSession(
    tweak === undefined ? compiled : tweak(compiled),
  );
  recordScVuPassDrive(district, name, {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  return buildLessonResult(session);
}

// ---------------------------------------------------------------------------
// §1 — THE RULING, AND THE EXAM RUNG THAT IS EXEMPT FROM IT
// ---------------------------------------------------------------------------

describe("§1 the lesson's own mistake refuses the pass on every practice rung", () => {
  for (const level of PRACTICE) {
    for (const name of MISTAKES) {
      it(`L${level} ${name}: not taken, 0 т., one uncharged hit`, () => {
        const r = play(name, level);
        // The whole ruling, in three assertions.
        expect(r.passed).toBe(false);
        expect(r.score).toBe(0);
        expect(r.lessonMistakes).toEqual([
          expect.objectContaining({ code: CODE, charged: false }),
        ]);
        // …and the title is RETRIEVED, not composed (ADR-002). It is the
        // catalogue's own string for the act, stamped by the fold.
        expect(r.lessonMistakes![0].titleBg.length).toBeGreaterThan(0);
        // The reason the ruling needed a channel of its own: this fault is on
        // the COACHED record, never on the sheet, so a verdict that read only
        // `summary.mistakes` would have found nothing on the very drive the
        // founder was ruling about.
        expect(r.summary.mistakes.map((m) => m.code)).not.toContain(CODE);
        expect((r.coachedMistakes ?? []).map((c) => c.code)).toContain(CODE);
      });
    }
  }

  it("the compiled L4 rung IS the exam (this suite did not make it one)", () => {
    expect((compileScenario(SC_VU_PASS_CLEARANCE, 4) as { examMode?: boolean }).examMode).toBe(true);
    // …and the exam rung carries no targets at all, which is where the
    // exemption is enforced: `compile.ts` never writes the field on an exam.
    expect(
      (compileScenario(SC_VU_PASS_CLEARANCE, 4) as { lessonMistakeTargets?: unknown })
        .lessonMistakeTargets,
    ).toBeUndefined();
  });

  for (const name of MISTAKES) {
    it(`L4 exam ${name}: UNCHANGED — the официален лист grades it, and it passes`, () => {
      // ADR-009 is a LESSON rule, not an exam rule: a practical exam in Bulgaria
      // is scored on Наредба № 38 and nothing in this lane may move that number.
      // The exam charges what the practice rung coached — основна, 3 точки —
      // and 3 is inside the official pass window, so the candidate passes.
      const r = play(name, 4);
      expect(r.passed).toBe(true);
      expect(r.score).toBe(3);
      expect(r.summary.mistakes.map((m) => m.code)).toEqual([CODE]);
      expect(r.lessonMistakes).toBeUndefined();
    });
  }
});

// ---------------------------------------------------------------------------
// §2 — THE CONTROL: a ruling that refuses every drive refuses nothing
// ---------------------------------------------------------------------------

describe("§2 the correct drive is untouched at every rung", () => {
  for (const level of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
    it(`L${level} shadow-correct: passed, no hit, field absent`, () => {
      const r = play("shadow-correct", level);
      expect(r.passed).toBe(true);
      expect(r.score).toBe(0);
      expect(r.lessonMistakes).toBeUndefined();
    });
  }
});

// ---------------------------------------------------------------------------
// §3 — F1: A REPEAT STILL COSTS POINTS, and the hit says so
// ---------------------------------------------------------------------------

describe("§3 a repeat episode reaches the изпитен лист (founder answer F1)", () => {
  it("driving the same ❌ demo twice: the second pass is charged and the hit reads charged", () => {
    // ONE SESSION, TWO EPISODES — the shape the ruling deliberately leaves
    // alone. The first occurrence is taught and free; the second is a new act,
    // grades at catalogue points, and `LessonMistakeHit.charged` becomes true so
    // the teach card can say «Отново» instead of guessing.
    const compiled = compileScenario(SC_VU_PASS_CLEARANCE, 3);
    let session: LessonSessionState = createLessonSession(compiled);
    const onTick = (tick: Parameters<typeof applyTick>[1]): void => {
      session = applyTick(session, tick).state;
    };
    recordScVuPassDrive(district, "mistake-squeeze", { onTick });
    const afterFirst = buildLessonResult(session);
    expect(afterFirst.score).toBe(0);
    expect(afterFirst.lessonMistakes).toEqual([
      expect.objectContaining({ code: CODE, charged: false }),
    ]);

    // The session completes on the first drive, and `applyTick` returns early
    // once completed — so the repeat is driven on a session whose phase is
    // still live. Re-running the recording on the SAME state is the only way to
    // reach a second episode without authoring a new tape, and it is honest
    // about what it is: the encounter counters, not the world, are the subject.
    const second = createLessonSession(compiled);
    let repeat: LessonSessionState = {
      ...second,
      scenarioEncounters: session.scenarioEncounters,
      coachedMistakes: session.coachedMistakes,
    };
    recordScVuPassDrive(district, "mistake-squeeze", {
      onTick: (tick) => {
        repeat = applyTick(repeat, tick).state;
      },
    });
    const r = buildLessonResult(repeat);
    expect(r.summary.mistakes.map((m) => m.code)).toContain(CODE);
    expect(r.score).toBeGreaterThan(0);
    expect(r.passed).toBe(false);
    expect(r.lessonMistakes).toEqual([expect.objectContaining({ code: CODE, charged: true })]);
    // …and `t` is still the EARLIEST occurrence, the moment he was taught at —
    // the one the reason block and the mistake map point to.
    expect(r.lessonMistakes![0].t).toBeLessThanOrEqual(
      r.summary.mistakes.find((m) => m.code === CODE)!.t,
    );
  });
});

// ---------------------------------------------------------------------------
// §4 — WHERE THE RULE DOES NOT REACH
// ---------------------------------------------------------------------------

describe("§4 the sessions ADR-009 exempts", () => {
  it("the THEO-3 sandbox: the mistake IS the assignment, so nothing is refused", () => {
    // Failing a student for doing what the product just asked him to do is the
    // same defect with the sign flipped. `mistakeExperience` is the flag, and
    // `lessonMistakeTargetCodes` returns null on it.
    const r = play("mistake-squeeze", 3, (l) => ({
      ...l,
      id: "t-adr009-sandbox",
      mistakeExperience: { mistakeIndex: 0, codes: [CODE] },
    }));
    expect(r.lessonMistakes).toBeUndefined();
  });

  it("a lesson with an EMPTY target list behaves exactly as one with none", () => {
    // `[]` and absent must not differ: 62 of the 167 templates derive an empty
    // set (only опасна codes on their demos), and an engine that treated the
    // two differently would ship a second, silent applicability rule.
    const empty = play("mistake-squeeze", 3, (l) => ({ ...l, lessonMistakeTargets: [] }));
    const stripped = play("mistake-squeeze", 3, stripTargets);
    expect(empty.lessonMistakes).toBeUndefined();
    expect(empty.passed).toBe(stripped.passed);
    expect(empty.score).toBe(stripped.score);
  });
});

// ---------------------------------------------------------------------------
// §5 — M1, EXECUTED. A suite green on its first run has told you nothing yet.
// ---------------------------------------------------------------------------

/** The rollback the spec's §3.6 ledger describes: remove the one field. */
function stripTargets(lesson: LessonSpec): LessonSpec {
  const copy = { ...lesson };
  delete (copy as { lessonMistakeTargets?: unknown }).lessonMistakeTargets;
  return copy;
}

describe("§5 M1 — strip the targets and the SAME drive passes again", () => {
  for (const name of MISTAKES) {
    it(`${name} @L3: without the field this is the pre-ADR-009 product`, () => {
      const r = play(name, 3, stripTargets);
      // The answer §1 asserts is `false`. If this ever reads `false` too, §1 has
      // stopped measuring anything and both must be re-derived before either is
      // believed.
      expect(r.passed).toBe(true);
      expect(r.lessonMistakes).toBeUndefined();
      // …and the sheet is the same either way: ADR-009 withholds a PASS on this
      // drive, never a point. (Where it does withhold a point — the dropped
      // re-bill — is `lesson-mistake-regrade.test.ts`, and this code has no
      // re-bill to drop.)
      expect(r.score).toBe(play(name, 3).score);
    });
  }
});
