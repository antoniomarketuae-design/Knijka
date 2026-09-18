/**
 * =============================================================================
 * THE TWO SURFACES THAT PRINTED A DIFFERENT VERDICT FROM THE VERDICT
 * — ADR-009 §5.4 / §5.5, lane G, 2026-09-18.
 * =============================================================================
 *
 * THE DEFECT, AS THE TREE STOOD ON THE DAY THIS FILE WAS WRITTEN. `SessionEnd-
 * Screen`'s pill is a four-way `SessionVerdict`. `LessonPlayShell` carried two
 * end surfaces of its own — the phone's end LINE and the roomy end BAR — and
 * each folded `result.passed` itself:
 *
 *     result.aborted ? «Прекратена сесия» : result.passed ? «Издържан» : «Неиздържан»
 *
 * On two of the four verdicts that is the wrong word:
 *   · «Незавършен» — a clean изпитен лист and a route that stopped short. The
 *     pill has said so since 2026-08-21; these two kept saying «Неиздържан».
 *   · «Не е взет» — ADR-009's own verdict, on 558 of the corpus's 2,434 drives
 *     (doc 92 §9), where the note UNDER the pill says in words «затова тук не
 *     пише „Неиздържан“» while the bar beside it printed exactly that.
 *
 * And on the phone, the teach NOTIFICATION — the only teach surface a phone has,
 * because the roomy card is `!compact` — hard-coded «Учебен момент» and «Първа
 * среща — не се брои в резултата» over the very act that was refusing the
 * lesson. Lane E's adversarial verifier filed that as a live THEO-4 defect (F3);
 * lane F's filed the dead `CalibrationGate` props as F-3.
 *
 * WHY THAT IS A DEFECT AND NOT A COSMETIC DRIFT. Doc 64 THEO-4 forbids a bare
 * verdict anywhere, ever. Two surfaces announcing two different verdicts for one
 * drive is worse than a bare one: it does not merely withhold the reason, it
 * makes the reason unbelievable, because the student cannot tell which of the
 * two words the explanation belongs to.
 *
 * AND A THIRD SURFACE, ADDED 2026-09-18 BY THIS LANE'S VERIFIER. The shell also
 * FEEDS one: `CalibrationGate` stands in front of the result screen and its
 * reveal names the lesson's verdict. The prop was handed over on
 * `lessonMistakes.length > 0` alone, so on a drive that failed the изпитен лист
 * AND committed the lesson's own mistake — 96 of the corpus's 2,434, across 23
 * lessons — the gate said «Урокът също не е взет» one tap in front of a pill
 * reading «Неиздържан», with the sentence that reconciles the two words
 * (`lessonMistakeVerdictNoteBg`) returning null in exactly that state. The
 * condition is now the FOLD (`calibrationLessonMistakeBg`), and that state is
 * pinned below in §1 and swept in §2.
 *
 * WHAT THIS FILE HOLDS, and the division is deliberate:
 *   §1 the four PURE helpers, over every verdict the fold can return;
 *   §2 the AGREEMENT property — no input makes a surface contradict the pill;
 *   §3 the phone teach notification's text, byte-identical for an ordinary
 *      moment and changed for the lesson's own;
 *   §4 the WIRING, read off the shell's source — because §1–§3 would all pass
 *      with every call site reverted (the 51-of-82 dead-predicate shape), and
 *      the shell cannot be mounted in this suite.
 *
 * EVERY SOURCE ASSERTION IN §4 RESOLVES ITS ANCHOR FIRST AND FAILS IF IT
 * CANNOT. A matcher that reports «green» when it could not find what it is
 * about is the shape this repo has shipped four times; the last one was a
 * Bulgarian `\b` regex in this ADR's own spec, which can never match because
 * JS word boundaries are ASCII-only.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSessionSummary,
  EXAM_POINTS_SHORT_NOTE_BG,
  examMarkCitationBg,
  makeViolation,
  minusPointsBg,
  type ScorableEvent,
} from "@/modules/sim/rules";
import {
  teachChipBg,
  teachStakeBg,
  type LessonMistakeHit,
  type LessonResult,
  type TeachMoment,
} from "@/modules/sim/lessons";
import { SESSION_VERDICT_LABEL_BG, sessionVerdict } from "@/modules/sim/hud/SessionEndScreen";
import {
  calibrationLessonMistakeBg,
  sessionEndBarLabelBg,
  sessionEndLineBg,
  sessionEndToneIsGood,
} from "../LessonPlayShell";

/* ─────────────────────────────────────────────────────────────────────────────
   FIXTURES — the summary is the ENGINE's, never hand-written, so a result that
   could not happen cannot be asserted about. Same builder as
   `hud/__tests__/session-end-verdict.test.tsx`.
   ────────────────────────────────────────────────────────────────────────── */
function resultOf(events: ScorableEvent[], over: Partial<LessonResult> = {}): LessonResult {
  const summary = buildSessionSummary(events);
  return {
    lessonId: "sc-test",
    summary,
    objectives: [],
    completedAll: true,
    aborted: false,
    passed: summary.passed,
    score: summary.score.totalPoints,
    effectiveScore: summary.score.totalPoints,
    escalations: [],
    durationSec: 90,
    ...over,
  };
}

const HIT: LessonMistakeHit = {
  code: "VULNERABLE_PASS_TOO_CLOSE",
  t: 20.9,
  charged: false,
  titleBg: "Тясно изпреварване на велосипедист",
};

/** A collision: the изпитен лист convicts, so the verdict is «Неиздържан». */
const COLLISION: ScorableEvent[] = [makeViolation("COLLISION", 12)];

/** THE FOUR STATES, each reached the way the product reaches it. */
const CASES = {
  passed: resultOf([], { passed: true }),
  failed: resultOf(COLLISION),
  // A clean sheet, the route finished, and the lesson's own mistake committed.
  lessonMistake: resultOf([], { passed: false, lessonMistakes: [HIT] }),
  // A clean sheet and a route that stopped short — the 2026-08-21 state.
  unfinished: resultOf([], { passed: false, completedAll: false }),
} as const;

/** A second act, so a two-hit sentence is about two different things. */
const HIT2: LessonMistakeHit = {
  code: "HARSH_BRAKING_NO_CAUSE",
  t: 51.2,
  charged: false,
  titleBg: "Рязко спиране без причина",
};

/**
 * THE STATE WHERE TWO SURFACES COULD DISAGREE — the изпитен лист convicts AND
 * the lesson's own mistake was committed. 96 of the corpus's 2,434 authored
 * drives, across 23 lessons. `sessionVerdict` consults the лист first, so the
 * pill reads «Неиздържан» and the note that would explain a «Не е взет» is null.
 */
const FAILED_SHEET_WITH_HIT = resultOf(COLLISION, { lessonMistakes: [HIT] });

describe("§1 the four verdicts, on the two surfaces the shell prints and the one it feeds", () => {
  it("every case is the verdict this file says it is (the fixtures are not vacuous)", () => {
    // Without this, a fixture that silently became `failed` would let every
    // assertion below pass while testing one arm four times.
    for (const [want, result] of Object.entries(CASES)) {
      expect(sessionVerdict(result), `fixture «${want}» no longer reaches that verdict`).toBe(want);
    }
  });

  it("the END LINE names the verdict and the tap that explains it", () => {
    expect(sessionEndLineBg(CASES.passed)).toBe("Издържан — виж разбора");
    expect(sessionEndLineBg(CASES.failed)).toBe("Неиздържан — виж разбора");
    expect(sessionEndLineBg(CASES.unfinished)).toBe("Незавършен — виж разбора");
    // «виж защо» and not «виж разбора»: what is behind this one is not a
    // breakdown of an изпитен лист (which is clean) but a REASON — the act the
    // lesson teaches, and how it is done right. THEO-4's own promise, in the
    // word that invites the tap.
    expect(sessionEndLineBg(CASES.lessonMistake)).toBe("Не е взет — виж защо");
  });

  it("the END BAR prints the label alone — its own button already says «Виж разбора»", () => {
    expect(sessionEndBarLabelBg(CASES.passed)).toBe("Издържан");
    expect(sessionEndBarLabelBg(CASES.failed)).toBe("Неиздържан");
    expect(sessionEndBarLabelBg(CASES.unfinished)).toBe("Незавършен");
    expect(sessionEndBarLabelBg(CASES.lessonMistake)).toBe("Не е взет");
  });

  it("a quit drive keeps «Прекратена сесия» on both, including with a hit", () => {
    // The fold classifies an aborted clean-sheet drive as `unfinished`, but
    // these two surfaces have always carried a fact the label does not: the
    // student ended it himself. Doc 92 §5.4 writes the arm for that reason, and
    // it is checked FIRST so a hit cannot take the word away.
    const quit = resultOf([], { passed: false, aborted: true, completedAll: false });
    const quitWithHit = resultOf([], {
      passed: false,
      aborted: true,
      completedAll: false,
      lessonMistakes: [HIT],
    });
    for (const r of [quit, quitWithHit]) {
      expect(sessionEndLineBg(r)).toBe("Прекратена сесия");
      expect(sessionEndBarLabelBg(r)).toBe("Прекратена сесия");
      expect(sessionEndToneIsGood(r)).toBe(false);
    }
  });

  it("success colour belongs to «Издържан» and to nothing else", () => {
    expect(sessionEndToneIsGood(CASES.passed)).toBe(true);
    for (const k of ["failed", "unfinished", "lessonMistake"] as const) {
      expect(sessionEndToneIsGood(CASES[k]), `${k} was painted as a pass`).toBe(false);
    }
    // …and a passing drive that was also aborted is not a pass on the glass.
    expect(sessionEndToneIsGood(resultOf([], { passed: true, aborted: true }))).toBe(false);
  });

  it("the GATE's reveal carries the retrieved names, and only on the pill's own arm", () => {
    expect(calibrationLessonMistakeBg(CASES.lessonMistake)).toEqual({
      namesBg: "„Тясно изпреварване на велосипедист“",
      one: true,
    });
    for (const k of ["passed", "failed", "unfinished"] as const) {
      expect(calibrationLessonMistakeBg(CASES[k]), `${k} was handed a lesson verdict`).toBeNull();
    }
    // Two acts speak in the plural, and both are named — the sentence in the
    // gate is «… са грешките, които той учи», and `one` is what chooses it.
    const two = resultOf([], { passed: false, lessonMistakes: [HIT, HIT2] });
    expect(calibrationLessonMistakeBg(two)).toEqual({
      namesBg: "„Тясно изпреварване на велосипедист“ и „Рязко спиране без причина“",
      one: false,
    });
  });

  it("THE FAILED-SHEET DRIVE: the gate is silent where the pill will read «Неиздържан»", () => {
    // The fixture is the state itself, not a hand-set flag: a collision on the
    // изпитен лист and the lesson's own mistake on the same drive.
    expect(sessionVerdict(FAILED_SHEET_WITH_HIT)).toBe("failed");
    expect(FAILED_SHEET_WITH_HIT.lessonMistakes?.length).toBe(1);
    // The condition that shipped was `lessonMistakes.length > 0`, which is true
    // here — so this case is exactly what the old expression got wrong, and the
    // assertion below is not about an unreachable shape.
    expect(calibrationLessonMistakeBg(FAILED_SHEET_WITH_HIT)).toBeNull();
    // …and the two surfaces this shell prints say the pill's word, as always.
    expect(sessionEndBarLabelBg(FAILED_SHEET_WITH_HIT)).toBe("Неиздържан");
    expect(sessionEndLineBg(FAILED_SHEET_WITH_HIT)).toBe("Неиздържан — виж разбора");
  });

  it("a quit drive is handed no lesson verdict either, hit or no hit", () => {
    // `sessionVerdict` refuses «Не е взет» to an aborted run (doc 92 §5.1), and
    // the gate only renders on a drive that was not quit — this is the belt to
    // that brace, so a later caller cannot re-open the state by mounting it.
    const quitWithHit = resultOf([], {
      passed: false,
      aborted: true,
      completedAll: false,
      lessonMistakes: [HIT],
    });
    expect(sessionVerdict(quitWithHit)).toBe("unfinished");
    expect(calibrationLessonMistakeBg(quitWithHit)).toBeNull();
  });
});

describe("§2 no input makes a surface contradict the pill", () => {
  /** Every result these three surfaces can be handed, built from the product's
   *  own inputs rather than from a list of verdicts somebody typed. */
  const EVERY: LessonResult[] = [];
  for (const events of [[], COLLISION]) {
    for (const passed of [true, false]) {
      for (const aborted of [true, false]) {
        for (const completedAll of [true, false]) {
          for (const hits of [[], [HIT], [HIT, { ...HIT, code: "HARSH_BRAKING_NO_CAUSE" }]]) {
            EVERY.push(
              resultOf(events as ScorableEvent[], {
                passed: passed && buildSessionSummary(events as ScorableEvent[]).passed,
                aborted,
                completedAll,
                ...(hits.length > 0 ? { lessonMistakes: hits as LessonMistakeHit[] } : {}),
              }),
            );
          }
        }
      }
    }
  }

  it("covers more than a handful of shapes (a sweep over nothing proves nothing)", () => {
    expect(EVERY.length).toBe(48);
    // All four verdicts are actually reached, or the loop is testing one arm.
    const reached = new Set(EVERY.map((r) => sessionVerdict(r)));
    expect([...reached].sort()).toEqual(["failed", "lessonMistake", "passed", "unfinished"]);
  });

  it("THE PROPERTY: the bar prints the pill's word, or «Прекратена сесия»", () => {
    for (const r of EVERY) {
      const pill = SESSION_VERDICT_LABEL_BG[sessionVerdict(r)];
      const bar = sessionEndBarLabelBg(r);
      expect(bar === pill || (r.aborted && bar === "Прекратена сесия"), JSON.stringify({ pill, bar })).toBe(true);
    }
  });

  it("THE ONE THE SHIP-BLOCKER WAS: nothing says «Неиздържан» unless the pill does", () => {
    // The re-measurement doc 92's brief asks for, as a property rather than a
    // count: 0 results where a surface prints «Неиздържан» over a pill that
    // does not. Before ADR-009 this failed on every `unfinished` and every
    // `lessonMistake` row in the loop.
    let contradictions = 0;
    for (const r of EVERY) {
      const pillSaysFailed = sessionVerdict(r) === "failed";
      const surfaceSaysFailed =
        sessionEndBarLabelBg(r) === "Неиздържан" || sessionEndLineBg(r).startsWith("Неиздържан");
      if (surfaceSaysFailed && !pillSaysFailed) contradictions += 1;
    }
    expect(contradictions).toBe(0);
    // And the PRE-ADR-009 expression, on the same 48 results, to prove the
    // assertion above is not vacuous. This is the code that shipped.
    let before = 0;
    for (const r of EVERY) {
      const old = r.aborted ? "Прекратена сесия" : r.passed ? "Издържан" : "Неиздържан";
      if (old === "Неиздържан" && sessionVerdict(r) !== "failed") before += 1;
    }
    expect(before, "the old fold contradicted the pill on no result — then §2 tests nothing").toBeGreaterThan(0);
  });

  it("the line is the bar's word plus an invitation, always", () => {
    for (const r of EVERY) {
      const bar = sessionEndBarLabelBg(r);
      const line = sessionEndLineBg(r);
      expect(line === bar || line.startsWith(`${bar} — виж `), `${bar} / ${line}`).toBe(true);
    }
  });

  it("THE THIRD SURFACE: the gate speaks the lesson's verdict exactly where the pill does", () => {
    // Same property, one screen earlier. The gate renders BEFORE the result, so
    // a sentence here that the pill will not repeat is the contradiction read in
    // the worst order: the student meets the second word already holding a
    // first one.
    let spokeWhereThePillWillNot = 0;
    let silentWhereThePillWill = 0;
    for (const r of EVERY) {
      const pillSaysNotTaken = sessionVerdict(r) === "lessonMistake";
      const gateSpeaks = calibrationLessonMistakeBg(r) !== null;
      if (gateSpeaks && !pillSaysNotTaken) spokeWhereThePillWillNot += 1;
      if (!gateSpeaks && pillSaysNotTaken) silentWhereThePillWill += 1;
    }
    expect(spokeWhereThePillWillNot).toBe(0);
    expect(silentWhereThePillWill, "the gate lost the reveal on the arm it is for").toBe(0);

    // …and the condition that shipped, on the same 48 results, so the two
    // assertions above are not a sweep over a shape that cannot occur.
    let before = 0;
    for (const r of EVERY) {
      const old = (r.lessonMistakes?.length ?? 0) > 0;
      if (old && sessionVerdict(r) !== "lessonMistake") before += 1;
    }
    expect(before, "the shipped condition spoke on no wrong result — then this tests nothing").toBeGreaterThan(0);
  });
});

describe("§3 the phone teach notification", () => {
  const moment = (over: Partial<TeachMoment> = {}): TeachMoment =>
    ({
      code: "SPEEDING_DANGEROUS",
      titleBg: "Превишена скорост",
      explanationBg: "Обяснението, както го носи каталогът.",
      lawRef: "ЗДвП чл. 21",
      severity: "opasna",
      points: 10,
      t: 42,
      ...over,
    }) as TeachMoment;

  /** The shell's composition, as one expression, so the test asserts the WHOLE
   *  string a student reads and not just the sentence in the middle. */
  const detail = (m: TeachMoment): string =>
    `${m.explanationBg}\n\n${teachStakeBg(m, { citeMark: true })}\n\n${EXAM_POINTS_SHORT_NOTE_BG}`;

  it("an ORDINARY teach moment does not change by a character", () => {
    const m = moment();
    // The literal that shipped, reproduced here and nowhere else. Not composed
    // from the helper — that would compare the new code with itself.
    const SHIPPED =
      `${m.explanationBg}\n\nПърва среща — не се брои в резултата. При повторение: ` +
      `${minusPointsBg("exam", m.points)} по ${examMarkCitationBg(m.severity)}, ` +
      `а повторните грешки тежат още повече (×1.5 / ×2.0).\n\n${EXAM_POINTS_SHORT_NOTE_BG}`;
    expect(detail(m)).toBe(SHIPPED);
    expect(teachChipBg(m)).toBe("Учебен момент");
  });

  it("the LESSON'S OWN mistake stops claiming it does not count", () => {
    const m = moment({ lessonMistake: true });
    const text = detail(m);
    // The sentence the phone used to print over the act that was refusing the
    // lesson. Its absence is the whole of lane E's F3.
    expect(text).not.toContain("Първа среща — не се брои в резултата");
    expect(text).toContain("урокът няма да се зачете");
    // …and it still says where the points stand, which is what keeps it from
    // being a bare verdict in the other direction.
    expect(text).toContain("В наказателните точки не влиза");
    expect(text).toContain(minusPointsBg("exam", m.points));
    expect(teachChipBg(m)).toBe("Грешката на урока");
  });

  it("a REPEAT of the lesson's own mistake says the repeat cost points", () => {
    const m = moment({ lessonMistake: true, charged: true });
    expect(detail(m)).toContain("Повторението влиза в изпитния лист");
    expect(teachChipBg(m)).toBe("Грешката на урока");
  });

  it("a charged ordinary code stops saying «не се брои» over points it just took", () => {
    const m = moment({ charged: true });
    expect(detail(m)).not.toContain("не се брои в резултата");
    expect(detail(m)).toContain("Влиза в изпитния лист");
    expect(teachChipBg(m)).toBe("Учебен момент");
  });

  it("every variant still carries the scale note — the founder's «10 т.» frame", () => {
    for (const over of [{}, { lessonMistake: true }, { lessonMistake: true, charged: true }, { charged: true }]) {
      expect(detail(moment(over as Partial<TeachMoment>))).toContain(EXAM_POINTS_SHORT_NOTE_BG);
    }
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   §4 · THE WIRING. Same technique and same reason as `briefingOverflow.test.tsx`
   and `notify-column.test.ts`: this shell cannot be mounted in a node-environment
   suite, and every assertion above would stay green with all four call sites
   reverted. The source is read with its PROSE TAKEN OUT — half the comments in
   that file quote the code they explain, and this file's own header quotes the
   literals it forbids.
   ────────────────────────────────────────────────────────────────────────── */
const SHELL_SRC = readFileSync(resolve(__dirname, "..", "LessonPlayShell.tsx"), "utf8");
const SHELL = SHELL_SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Resolve a region by two landmarks; an unresolved region FAILS the case that
 *  asked for it rather than returning an empty string that matches nothing. */
function region(fromNeedle: string, toNeedle: string): string {
  const a = SHELL.indexOf(fromNeedle);
  expect(a, `anchor «${fromNeedle}» is gone from LessonPlayShell.tsx — UNRESOLVED, not satisfied`).toBeGreaterThanOrEqual(0);
  const b = SHELL.indexOf(toNeedle, a);
  expect(b, `anchor «${toNeedle}» is gone from LessonPlayShell.tsx — UNRESOLVED, not satisfied`).toBeGreaterThan(a);
  return SHELL.slice(a, b);
}

describe("§4 the shell calls all of it", () => {
  it("the END LINE is composed by the helper, and the literal is gone", () => {
    const end = region('id: "end",', 'id: `teach:');
    expect(end).toContain("sessionEndLineBg(result)");
    expect(end).toContain("sessionEndToneIsGood(result)");
    expect(end).not.toContain("Неиздържан — виж разбора");
    expect(end).not.toContain("Издържан — виж разбора");
  });

  it("the END BAR is composed by the helper, and the literal is gone", () => {
    const bar = region('data-hud="end-bar"', "Виж разбора");
    expect(bar).toContain("sessionEndBarLabelBg(result)");
    expect(bar).not.toContain('"Неиздържан"');
    // BOTH tone call sites, because there are two and a single `toContain` is
    // satisfied by either. The bar paints its border AND the label's colour, and
    // reverting just one of them to the pre-ADR-009 `result.passed` expression
    // left this case green (the verifier's VS8). A count, not a presence — and
    // the region is the source with its prose stripped, so the paragraph above
    // the label, which names this helper twice, cannot inflate it.
    expect(bar.split("sessionEndToneIsGood(result)").length - 1).toBe(2);
    // The expression that shipped, gone from this region entirely: the tone and
    // the word now come off one fold or neither does.
    expect(bar).not.toContain("result.passed");
  });

  it("«Неиздържан» survives in this file only as prose", () => {
    // The strongest form of the ship-blocker's own check: not «the two anchors
    // were fixed» but «the word is nowhere in the code of this file». The
    // stripped source is what is searched, so the paragraphs that explain the
    // change — including this test's own quotations — do not satisfy it.
    expect(SHELL).not.toContain("Неиздържан");
    // …and it IS still in the prose, which is how we know the strip ran and the
    // assertion above is about code rather than about an empty string.
    expect(SHELL_SRC).toContain("Неиздържан");
  });

  it("the TEACH NOTIFICATION routes through lane A's helpers", () => {
    const teach = region("id: `teach:", "toasts.map(");
    expect(teach).toContain("chipBg: teachChipBg(teachQueue[0])");
    expect(teach).toContain("teachStakeBg(teachQueue[0], { citeMark: true })");
    expect(teach).toContain("${EXAM_POINTS_SHORT_NOTE_BG}");
    // The sentence that was false on the lesson's own mistake.
    expect(teach).not.toContain("Първа среща — не се брои в резултата");
  });

  it("the CALIBRATION GATE gets both props, from the lesson and from the fold", () => {
    // THE ELEMENT'S OWN CLOSING TAG, and not `onSubmit=` as this case first
    // read: that anchor is not unique in the file, so renaming the gate's prop
    // moved the region's end to the NEXT component's — the region silently grew
    // instead of failing, and a later `toContain` could have been satisfied by
    // somebody else's call site. Measured as mutation M9 of this round, which
    // stayed green until the anchor became the element's own `/>`.
    const gate = region("<CalibrationGate", "      />");
    expect(gate).toContain("lessonHasTargets={lessonMistakeTargetCodes(lesson) !== null}");
    // The REVEAL half goes through the tested helper, not through an expression
    // written out here: an inline `lessonMistakes.length > 0` is what handed the
    // gate a lesson verdict on 96 drives whose pill reads «Неиздържан», and only
    // a source-reading test could ever have seen it. §1 and §2 pin the helper's
    // answer; this pins that the call site asks it.
    expect(gate).toContain("lessonMistake={calibrationLessonMistakeBg(result)}");
    // …and the fold's own inputs are not re-read beside it, which is how the
    // second opinion got in the first time.
    expect(gate).not.toContain("result.lessonMistakes");
  });

  it("the helpers this file tests are the ones the shell imports", () => {
    // A fold defined twice is a fold that will disagree with itself. The shell
    // must take the word from `SessionEndScreen`, not restate it.
    expect(SHELL).toContain('from "@/modules/sim/hud/SessionEndScreen"');
    expect(SHELL).toContain("SESSION_VERDICT_LABEL_BG");
    expect(SHELL).toContain("sessionVerdict");
    expect(SHELL).not.toMatch(/const\s+SESSION_VERDICT_LABEL_BG\s*=/);
  });
});
