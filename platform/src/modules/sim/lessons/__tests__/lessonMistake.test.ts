/**
 * T0 — ADR-009's foundation, and the three things it must not get wrong
 * (doc 92 §8.1; founder Ruling A, 2026-09-17).
 *
 * `lessonMistake.ts` is a PURE module that no runtime path calls yet: lanes C
 * (engine and wire), D (debrief), E (end screen and teach card), F (history and
 * calibration) and G (the shell) adopt it after this one lands. That is exactly
 * the situation in which this programme has repeatedly shipped a predicate
 * nothing reads, so this file is written as the contract those lanes are owed:
 *
 *  1. THE BYTE-FOR-BYTE PIN. Lane E replaces the three sites that print the
 *     teach-card stake sentence today with `teachStakeBg`. If the helper's
 *     `free-first` text drifts by one space, EVERY existing teach card in the
 *     product changes wording silently — the most frequent pause in the whole
 *     simulator. So the three literals are copied out of the live source here
 *     (`TeachMomentOverlay.tsx`, `LessonPlayShell.tsx`) with their line numbers,
 *     and compared whole.
 *  2. THE FOLD'S SEMANTICS. One row per code, earliest `t`, OR-ed `charged`,
 *     act-aware title. Each is asserted against a case where the naive
 *     implementation gives a different answer, so a rewrite cannot pass by
 *     accident.
 *  3. THE VOCABULARY. Every string the enumeration below names is scanned for a
 *     bare „т." and for unqualified „точки" — the founder's photographed defect
 *     (he read „−10 т." as his DRIVING LICENCE being docked). This module sits
 *     OUTSIDE `rules/__tests__/point-scales.test.ts`'s guarded directories, so
 *     without the scan below nothing would catch the next one (doc 92 §1 graft
 *     7). The scan is enumerated over all four kinds × every severity class ×
 *     both `citeMark` values, not sampled, and the enumeration is DERIVED from
 *     `SEVERITY_POINTS` so a fourth class added to the rules module is covered
 *     the day it is added rather than the day someone remembers this file.
 *     M10 proves the scan bites: the same function is handed a synthetic
 *     «0 точки» and must reject it.
 *
 *     ⚠ IT IS ENUMERATION-BOUND, and the first version of this header said
 *     «every string this module CAN produce», which is not what it does. Lane
 *     A's verifier measured the difference: six probes that put a bare „−10 т."
 *     or an invented «ЗДвП чл. 99» into an EXISTING string were all caught, and
 *     two that added a NEW exported string producer sailed through green. A
 *     lane that adds an export returning Bulgarian must add it to the lists in
 *     §6 below, or its strings are scanned by nothing.
 */

import { describe, expect, it } from "vitest";
import {
  SEVERITY_POINTS,
  VIOLATIONS,
  examMarkCitationBg,
  makeViolation,
  minusPointsBg,
  violationPeekBg,
  type ScorableEvent,
  type SeverityClass,
} from "../../rules";
import type { LessonMistakeTarget } from "../../contracts";
import {
  LESSON_MISTAKE_CHIP_BG,
  MAX_LESSON_MISTAKE_TARGETS,
  foldLessonMistakes,
  lessonMistakeConceptIds,
  lessonMistakeCopy,
  lessonMistakeNamesBg,
  lessonMistakeRuleBg,
  lessonMistakeTargetCodes,
  teachChipBg,
  teachStakeBg,
  teachStakeKind,
  teachStakeSegments,
  teachSublineBg,
  type LessonMistakeLesson,
  type TeachStakeMoment,
} from "../lessonMistake";
import type { CoachedMistake, LessonMistakeHit } from "../types";

// ---------------------------------------------------------------------------
// Fixtures — hand-built, because the applicability rule must be exercisable
// without compiling a scenario (that is lane B's test, T8a).
// ---------------------------------------------------------------------------

function target(code: string, extra: Partial<LessonMistakeTarget> = {}): LessonMistakeTarget {
  return { code, source: "demo", ...extra };
}

function practice(...targets: LessonMistakeTarget[]): LessonMistakeLesson {
  return { lessonMistakeTargets: targets };
}

function coached(code: string, t: number, detail?: string): CoachedMistake {
  const titleBg = VIOLATIONS[code as keyof typeof VIOLATIONS].titleBg;
  return detail === undefined ? { code, titleBg, t } : { code, titleBg, t, detail };
}

function charged(code: string, t: number, detail?: string): ScorableEvent {
  return makeViolation(
    code as Parameters<typeof makeViolation>[0],
    t,
    detail === undefined ? {} : { detail },
  );
}

/** The four kinds, as a `TeachMoment`'s two optional flags produce them. */
const KIND_FLAGS: Record<string, Pick<TeachStakeMoment, "lessonMistake" | "charged">> = {
  "free-first": {},
  "lesson-first": { lessonMistake: true },
  "lesson-charged": { lessonMistake: true, charged: true },
  charged: { charged: true },
};

function moment(kind: keyof typeof KIND_FLAGS, severity: SeverityClass): TeachStakeMoment {
  return { points: SEVERITY_POINTS[severity], severity, ...KIND_FLAGS[kind] };
}

// ---------------------------------------------------------------------------
// 1. Applicability — the ruling's two exemptions
// ---------------------------------------------------------------------------

describe("lessonMistakeTargetCodes — when ADR-009 applies", () => {
  it("returns the targets on a practice rung", () => {
    const codes = lessonMistakeTargetCodes(practice(target("HARSH_BRAKING_NO_CAUSE")));
    expect(codes?.get("HARSH_BRAKING_NO_CAUSE")?.source).toBe("demo");
    expect(codes?.size).toBe(1);
  });

  it("returns null on an exam rung — Ruling A exempts L4 explicitly (M2)", () => {
    expect(
      lessonMistakeTargetCodes({ ...practice(target("HARSH_BRAKING_NO_CAUSE")), examMode: true }),
    ).toBeNull();
  });

  it("returns null in the THEO-3 sandbox, where the mistake IS the assignment (M3)", () => {
    expect(
      lessonMistakeTargetCodes({
        ...practice(target("HARSH_BRAKING_NO_CAUSE")),
        mistakeExperience: { mistakeIndex: 0, codes: ["HARSH_BRAKING_NO_CAUSE"] },
      }),
    ).toBeNull();
  });

  it("returns null for an absent or empty field — today's behaviour, not an empty rule", () => {
    expect(lessonMistakeTargetCodes({})).toBeNull();
    expect(lessonMistakeTargetCodes({ lessonMistakeTargets: [] })).toBeNull();
  });

  it("exports the derivation cap as a CONSTANT — nothing at HEAD enforces it", () => {
    // Honest about what this assertion is, after lane A's verifier pointed out
    // that the module's comment read as if a guard existed. It is a mirror of
    // the literal, so the value cannot drift between this module and lane B;
    // the module never checks the cap and lane B's `deriveLessonMistakeTargets`
    // (its T8a) owns the whole guard. The measured maximum is 4
    // (sc-rb-lane-choice). The line below proves the module does NOT enforce it,
    // so no later lane builds on an enforcement that is not there.
    expect(MAX_LESSON_MISTAKE_TARGETS).toBe(8);
    const over = Array.from({ length: MAX_LESSON_MISTAKE_TARGETS + 1 }, (_, i) =>
      target(`CODE_${i}`),
    );
    expect(lessonMistakeTargetCodes(practice(...over))?.size).toBe(over.length);
  });
});

// ---------------------------------------------------------------------------
// 2. The fold
// ---------------------------------------------------------------------------

describe("foldLessonMistakes", () => {
  it("finds the lesson's mistake in the COACHED record, which is where it lives", () => {
    // The whole ruling turns on this: a target's first occurrence is taught, so
    // it is never on the charged ledger. A fold reading only `events` would
    // report a clean drive on exactly the drives ADR-009 is about.
    const hits = foldLessonMistakes(
      practice(target("VULNERABLE_PASS_TOO_CLOSE")),
      [],
      [coached("VULNERABLE_PASS_TOO_CLOSE", 12.5)],
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].charged).toBe(false);
    expect(hits[0].t).toBe(12.5);
    expect(hits[0].titleBg).toBe(VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.titleBg);
  });

  it("returns [] when the rule does not apply, even with the code on both records", () => {
    const lesson = { ...practice(target("VULNERABLE_PASS_TOO_CLOSE")), examMode: true };
    expect(
      foldLessonMistakes(
        lesson,
        [charged("VULNERABLE_PASS_TOO_CLOSE", 9)],
        [coached("VULNERABLE_PASS_TOO_CLOSE", 3)],
      ),
    ).toEqual([]);
  });

  it("ignores codes that are not this lesson's own mistake", () => {
    const hits = foldLessonMistakes(
      practice(target("VULNERABLE_PASS_TOO_CLOSE")),
      [charged("SPEEDING_OVER_LIMIT", 4)],
      [coached("HARSH_BRAKING_NO_CAUSE", 6)],
    );
    expect(hits).toEqual([]);
  });

  it("folds coached t=3 plus charged t=9 into ONE hit: earliest t, charged true", () => {
    // Doc 92 §3.2. The naive implementations both fail here: one row per record
    // gives two hits, and «the charged one wins» gives t=9 — the moment of the
    // repeat rather than the moment the student was taught.
    const hits = foldLessonMistakes(
      practice(target("HARSH_BRAKING_NO_CAUSE")),
      [charged("HARSH_BRAKING_NO_CAUSE", 9)],
      [coached("HARSH_BRAKING_NO_CAUSE", 3)],
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ code: "HARSH_BRAKING_NO_CAUSE", t: 3, charged: true });
  });

  it("takes `charged` from the WHOLE episode, not from the earliest occurrence", () => {
    // The mutation this exists for: `charged: earliest.charged`. On a target the
    // earliest occurrence is by construction the taught, uncharged one, so that
    // implementation prints «в наказателните точки не влиза» on a drive whose
    // repeat had just cost three of them — and it agrees with the honest one on
    // every other input, which is why it needs its own case.
    const hits = foldLessonMistakes(
      practice(target("HARSH_BRAKING_NO_CAUSE")),
      [charged("HARSH_BRAKING_NO_CAUSE", 41)],
      [coached("HARSH_BRAKING_NO_CAUSE", 6), coached("HARSH_BRAKING_NO_CAUSE", 38)],
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].t).toBe(6);
    expect(hits[0].charged).toBe(true);
  });

  it("stays false when nothing reached the sheet, however many times it happened", () => {
    // The false-refusal direction of the same assertion: a repeat that was
    // coached again (the rate-limited toast) must not read as charged, or the
    // card claims points were taken that were not.
    const hits = foldLessonMistakes(
      practice(target("HARSH_BRAKING_NO_CAUSE")),
      [],
      [coached("HARSH_BRAKING_NO_CAUSE", 6), coached("HARSH_BRAKING_NO_CAUSE", 38)],
    );
    expect(hits[0].charged).toBe(false);
  });

  it("collapses duplicate occurrences of one code to one row", () => {
    const hits = foldLessonMistakes(
      practice(target("HARSH_BRAKING_NO_CAUSE")),
      [],
      [
        coached("HARSH_BRAKING_NO_CAUSE", 30),
        coached("HARSH_BRAKING_NO_CAUSE", 11),
        coached("HARSH_BRAKING_NO_CAUSE", 47),
      ],
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].t).toBe(11);
    expect(hits[0].charged).toBe(false);
  });

  it("sorts by (t, code) — the order the student met them in", () => {
    const hits = foldLessonMistakes(
      practice(target("HARSH_BRAKING_NO_CAUSE"), target("SPEEDING_OVER_LIMIT"), target("HESITATION_AT_GREEN")),
      [],
      [
        coached("SPEEDING_OVER_LIMIT", 20),
        coached("HESITATION_AT_GREEN", 5),
        coached("HARSH_BRAKING_NO_CAUSE", 5),
      ],
    );
    expect(hits.map((h) => h.code)).toEqual([
      "HARSH_BRAKING_NO_CAUSE",
      "HESITATION_AT_GREEN",
      "SPEEDING_OVER_LIMIT",
    ]);
  });

  it("retrieves the ACT's title, not the pooled one (ILLEGAL_STOP_IN_BAN_ZONE basis)", () => {
    // Live at HEAD: PER_ACT_COPY carries ILLEGAL_STOP_IN_BAN_ZONE →
    // NO_STOP_BASIS_COPY (catalog.ts:2960 — the registration moved when lane R
    // added its two tables above it in this same uncommitted block; the first
    // version of this line said :2833, which is now the table's closing brace).
    // Without the act step the reason a
    // bus-stop lesson was not taken reads «Спиране в забранена зона», directly
    // under a teach card that had already named the act.
    const hits = foldLessonMistakes(
      practice(target("ILLEGAL_STOP_IN_BAN_ZONE")),
      [],
      [coached("ILLEGAL_STOP_IN_BAN_ZONE", 22, "law-alongside")],
    );
    expect(hits[0].detail).toBe("law-alongside");
    expect(hits[0].titleBg).toBe("Спиране до спряла кола");
    expect(hits[0].titleBg).not.toBe(VIOLATIONS.ILLEGAL_STOP_IN_BAN_ZONE.titleBg);
  });

  it("carries the act of the EARLIEST occurrence, not the last one seen", () => {
    const hits = foldLessonMistakes(
      practice(target("ILLEGAL_STOP_IN_BAN_ZONE")),
      [],
      [
        coached("ILLEGAL_STOP_IN_BAN_ZONE", 40, "law-junction"),
        coached("ILLEGAL_STOP_IN_BAN_ZONE", 8, "law-alongside"),
      ],
    );
    expect(hits[0].t).toBe(8);
    expect(hits[0].titleBg).toBe("Спиране до спряла кола");
  });

  it("agrees with the catalogue on JUNCTION_SCAN_INCOMPLETE, before AND after lane R", () => {
    // Lane R moves JUNCTION_SCAN_COPY (engine.ts:2117-2128 AT HEAD 0137fde,
    // i.e. before this commit — the declaration is gone from engine.ts in the
    // tree you are reading) into detail-keyed
    // PER_ACT_COPY, after which `give-way` retitles to «Непълно оглеждане при
    // знак Б1» on both the client and the server. This assertion is written to
    // hold on BOTH sides of that landing and to say which it measured, rather
    // than silently tracking whatever the catalogue happens to hold.
    //
    // MEASURED TWICE, and this is the useful part: once with lane R NOT landed
    // (actCopy returned null and the first branch held, pooled title), and again
    // after lane R landed mid-session (PER_ACT_COPY gained the code at
    // catalog.ts:2967 and the second branch held, «…при знак Б1»). The fold
    // followed the catalogue across the move without being touched.
    const hits = foldLessonMistakes(
      practice(target("JUNCTION_SCAN_INCOMPLETE")),
      [],
      [coached("JUNCTION_SCAN_INCOMPLETE", 17, "give-way")],
    );
    const laneRLanded = makeViolation("JUNCTION_SCAN_INCOMPLETE", 0, { detail: "give-way" }).titleBg;
    if (laneRLanded === VIOLATIONS.JUNCTION_SCAN_INCOMPLETE.titleBg) {
      expect(hits[0].titleBg).toBe("Непълно оглеждане на кръстовището");
    } else {
      expect(hits[0].titleBg).toBe("Непълно оглеждане при знак Б1");
    }
    // Either way the fold agrees with the catalogue rather than inventing text.
    expect(hits[0].titleBg).toBe(laneRLanded);
  });

  it("carries demoTitleBg from the target, and only when the target has one", () => {
    const hits = foldLessonMistakes(
      practice(
        target("HARSH_BRAKING_NO_CAUSE", { demoTitleBg: "Паника в лентата" }),
        target("SPEEDING_OVER_LIMIT"),
      ),
      [],
      [coached("HARSH_BRAKING_NO_CAUSE", 4), coached("SPEEDING_OVER_LIMIT", 6)],
    );
    expect(hits[0].demoTitleBg).toBe("Паника в лентата");
    expect(hits[1].demoTitleBg).toBeUndefined();
  });

  it("ignores commendations on the event list", () => {
    const praise: ScorableEvent = {
      kind: "commendation",
      code: "CLEAN_DRIVING",
      t: 5,
      titleBg: "x",
      explanationBg: "y",
    };
    expect(foldLessonMistakes(practice(target("CLEAN_DRIVING")), [praise], [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Retrieval
// ---------------------------------------------------------------------------

describe("lessonMistakeCopy — retrieval only (ADR-002)", () => {
  it("returns the catalogue's own explanation, corrective, lawRef and concept", () => {
    const copy = lessonMistakeCopy({ code: "HARSH_BRAKING_NO_CAUSE", t: 12 });
    expect(copy?.titleBg).toBe(VIOLATIONS.HARSH_BRAKING_NO_CAUSE.titleBg);
    expect(copy?.explanationBg).toBe(VIOLATIONS.HARSH_BRAKING_NO_CAUSE.explanationBg);
    expect(copy?.correctiveBg).toBe(VIOLATIONS.HARSH_BRAKING_NO_CAUSE.correctiveBg);
    expect(copy?.lawRef).toBe(VIOLATIONS.HARSH_BRAKING_NO_CAUSE.lawRef);
    expect(copy?.conceptId).toBe(VIOLATIONS.HARSH_BRAKING_NO_CAUSE.conceptId ?? null);
  });

  it("resolves the act's copy when a detail is given", () => {
    const copy = lessonMistakeCopy({ code: "ILLEGAL_STOP_IN_BAN_ZONE", t: 3, detail: "law-junction" });
    expect(copy?.titleBg).toBe("Спиране на кръстовище");
  });

  it("returns null for an uncatalogued code — a stored row must be droppable", () => {
    expect(lessonMistakeCopy({ code: "SOME_FUTURE_CODE", t: 1 })).toBeNull();
  });

  it("RETRIEVES the peek, and the ACT's peek where the detail selects one", () => {
    // NOT PINNED UNTIL 2026-09-18. Lane A's verifier replaced the whole field
    // with `peekBg: null` and all 46 tests stayed green — nothing said the
    // module retrieves a peek at all. The act step is live at HEAD and it is
    // not cosmetic: the peek is the ONE line a phone card has room to finish
    // (rules/catalog.ts:123-128, a two-line budget), so printing the pooled
    // summary for a specific act is printing the wrong reason in the only slot
    // the student reads.
    const pooled = lessonMistakeCopy({ code: "ILLEGAL_STOP_IN_BAN_ZONE", t: 3 });
    expect(pooled?.peekBg).toBe(VIOLATIONS.ILLEGAL_STOP_IN_BAN_ZONE.peekBg);

    const act = lessonMistakeCopy({
      code: "ILLEGAL_STOP_IN_BAN_ZONE",
      t: 3,
      detail: "law-alongside",
    });
    expect(act?.peekBg).toBe("Ставаш втори ред на платното.");
    expect(act?.peekBg).toBe(violationPeekBg("ILLEGAL_STOP_IN_BAN_ZONE", "law-alongside"));
    // …and it really is a different sentence, or the assertion above would pass
    // on an implementation that never looked at `detail`.
    expect(act?.peekBg).not.toBe(VIOLATIONS.ILLEGAL_STOP_IN_BAN_ZONE.peekBg);

    // The second live pair, and the one the catalogue's own header is about: a
    // struck pedestrian must not get the vehicle's summary.
    expect(lessonMistakeCopy({ code: "COLLISION", t: 8, detail: "pedestrian" })?.peekBg).toBe(
      violationPeekBg("COLLISION", "pedestrian"),
    );
    expect(lessonMistakeCopy({ code: "COLLISION", t: 8, detail: "pedestrian" })?.peekBg).not.toBe(
      lessonMistakeCopy({ code: "COLLISION", t: 8, detail: "vehicle" })?.peekBg,
    );
  });

  it("every catalogue code yields a peek — why the field is `string`, not `string | null`", () => {
    // The measurement behind the narrowing (58 of 58, 2026-09-18) AND the alarm
    // if the catalogue ever re-opens the optional door it closed on 2026-09-11.
    // `ViolationSpec.peekBg` is required, so tsc catches a missing one; this
    // catches the empty string, which tsc does not and which renders as a blank
    // line where the reason should be.
    const codes = Object.keys(VIOLATIONS) as (keyof typeof VIOLATIONS)[];
    const missing = codes.filter((code) => {
      const peekBg = lessonMistakeCopy({ code, t: 1 })?.peekBg;
      return typeof peekBg !== "string" || peekBg.trim().length === 0;
    });
    expect(missing).toEqual([]);
    expect(codes.length).toBeGreaterThanOrEqual(58);
  });

  it("conceptId is the one field whose null is REACHABLE — the EXACT set, 3 of 58 codes", () => {
    // Stated as an assertion because lanes D and F branch on it. If this set
    // ever empties, that branch is dead and the declaration should be narrowed
    // exactly the way `peekBg` just was, rather than left as a guard that
    // cannot fire.
    //
    // THE WHOLE SET, NOT A MEMBER OF IT. Until 2026-09-18 this case asserted
    // `toContain("POOR_LANE_KEEPING")` and `length > 0` while the module's own
    // docblock told lanes D and F the set was «pinned by this module's test».
    // Lane A's verifier swapped the set for `POOR_LANE_KEEPING` plus a
    // synthetic concept on every other code and all 50 tests stayed green — the
    // same shape as the `contracts.ts` docblock this lane was correcting one
    // file over. Either the claim goes or the set is pinned; the set is pinned,
    // because a code losing or gaining a `conceptId` changes whether a consuming
    // lane's `if (conceptId === null)` can run at all, and that is worth a red.
    const withoutConcept = (Object.keys(VIOLATIONS) as (keyof typeof VIOLATIONS)[]).filter(
      (code) => lessonMistakeCopy({ code, t: 1 })?.conceptId === null,
    );
    expect([...withoutConcept].sort()).toEqual([
      "FOLLOWING_TOO_CLOSE",
      "NOT_KEEPING_RIGHT",
      "POOR_LANE_KEEPING",
    ]);
    // …and the «of 58» half EXACTLY, so the ratio in this case's name cannot go
    // on reading true while the catalogue grows past it. A 59th code is not a
    // defect — it is a reason to come back here, re-measure which codes carry no
    // concept, and move both halves together.
    expect(Object.keys(VIOLATIONS).length).toBe(58);
  });
});

describe("lessonMistakeConceptIds", () => {
  it("de-duplicates, keeps hit order and skips codes with no concept", () => {
    const hits = [
      { code: "HESITATION_AT_GREEN" },
      { code: "HARSH_BRAKING_NO_CAUSE" },
      { code: "HESITATION_AT_GREEN" },
      { code: "SOME_FUTURE_CODE" },
    ];
    const ids = lessonMistakeConceptIds(hits);
    expect(ids).toEqual([...new Set(ids)]);
    expect(ids[0]).toBe(VIOLATIONS.HESITATION_AT_GREEN.conceptId);
    expect(ids).toContain(VIOLATIONS.HARSH_BRAKING_NO_CAUSE.conceptId);
  });
});

// ---------------------------------------------------------------------------
// 4. The Bulgarian phrases
// ---------------------------------------------------------------------------

describe("lessonMistakeNamesBg", () => {
  const hit = (titleBg: string) => ({ titleBg });

  it("names one", () => {
    expect(lessonMistakeNamesBg([hit("Рязко спиране без причина")])).toBe(
      "„Рязко спиране без причина“",
    );
  });

  it("joins two with «и»", () => {
    expect(lessonMistakeNamesBg([hit("A"), hit("B")])).toBe("„A“ и „B“");
  });

  it("shortens four to two names and a count — the phone's sentence budget", () => {
    expect(lessonMistakeNamesBg([hit("A"), hit("B"), hit("C"), hit("D")])).toBe("„A“, „B“ и още 2");
  });

  it("is empty for no hits, so a missing guard does not render as prose", () => {
    expect(lessonMistakeNamesBg([])).toBe("");
  });
});

describe("lessonMistakeRuleBg — the rule BEFORE the drive (§5.10)", () => {
  it("names one code", () => {
    expect(lessonMistakeRuleBg(practice(target("HESITATION_AT_GREEN")))).toBe(
      "Урокът не се зачита, ако допуснеш „Колебание на зелен сигнал“ — дори веднъж.",
    );
  });

  it("joins two with «или»", () => {
    expect(
      lessonMistakeRuleBg(practice(target("HESITATION_AT_GREEN"), target("STOPPED_WITHOUT_CAUSE"))),
    ).toBe(
      "Урокът не се зачита, ако допуснеш „Колебание на зелен сигнал“ или " +
        "„Спиране без причина на открит път“ — дори веднъж.",
    );
  });

  it("names EVERY code at four — this line is the only warning the student gets", () => {
    const line = lessonMistakeRuleBg(
      practice(
        target("HESITATION_AT_GREEN"),
        target("STOPPED_WITHOUT_CAUSE"),
        target("HARSH_BRAKING_NO_CAUSE"),
        target("SPEEDING_OVER_LIMIT"),
      ),
    );
    expect(line).toBe(
      `Урокът не се зачита, ако допуснеш „${VIOLATIONS.HESITATION_AT_GREEN.titleBg}“, ` +
        `„${VIOLATIONS.STOPPED_WITHOUT_CAUSE.titleBg}“, ` +
        `„${VIOLATIONS.HARSH_BRAKING_NO_CAUSE.titleBg}“ или ` +
        `„${VIOLATIONS.SPEEDING_OVER_LIMIT.titleBg}“ — дори веднъж.`,
    );
    // Unlike the names phrase, it must not abbreviate: «и още 2» warns nobody.
    expect(line).not.toContain("още");
  });

  it("uses the POOLED title — no act has happened yet", () => {
    expect(lessonMistakeRuleBg(practice(target("ILLEGAL_STOP_IN_BAN_ZONE")))).toContain(
      VIOLATIONS.ILLEGAL_STOP_IN_BAN_ZONE.titleBg,
    );
  });

  it("is null where the rule does not apply — the briefing renders as today", () => {
    expect(lessonMistakeRuleBg({})).toBeNull();
    expect(lessonMistakeRuleBg({ ...practice(target("HESITATION_AT_GREEN")), examMode: true })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. The teach-card stake — THE BYTE-FOR-BYTE PIN
// ---------------------------------------------------------------------------

describe("teachStakeKind", () => {
  it("maps the two flags onto the four sentences", () => {
    expect(teachStakeKind({})).toBe("free-first");
    expect(teachStakeKind({ lessonMistake: true })).toBe("lesson-first");
    expect(teachStakeKind({ lessonMistake: true, charged: true })).toBe("lesson-charged");
    expect(teachStakeKind({ charged: true })).toBe("charged");
  });
});

describe("free-first is BYTE-IDENTICAL to what the three sites render today", () => {
  // Every literal below is copied out of the live source. If any of them moves,
  // this test is the place the move is noticed — not the student's screen.
  const sev: SeverityClass = "opasna";
  const m = moment("free-first", sev);
  const SEVERITY_LABEL_BG = "опасна грешка"; // TeachMomentOverlay.tsx:237-240
  const mark = minusPointsBg("exam", SEVERITY_POINTS[sev]);
  const cite = examMarkCitationBg(sev);

  it("compact card — TeachMomentOverlay.tsx:395-401", () => {
    expect(teachStakeBg(m, { citeMark: true, severityLabelBg: SEVERITY_LABEL_BG })).toBe(
      `Първа среща — не се брои в резултата. При повторение: ${mark} (${SEVERITY_LABEL_BG})` +
        ` по ${cite}, а повторните грешки тежат още повече (×1.5 / ×2.0).`,
    );
  });

  it("roomy card — TeachMomentOverlay.tsx:527-531 (no «по {cite}»: the chip has it)", () => {
    expect(teachStakeBg(m, { citeMark: false, severityLabelBg: SEVERITY_LABEL_BG })).toBe(
      `Първа среща — не се брои в резултата. При повторение: ${mark} (${SEVERITY_LABEL_BG})` +
        ", а повторните грешки тежат още повече (×1.5 / ×2.0).",
    );
  });

  it("phone notification — LessonPlayShell.tsx:6113 (no «({SEV})»: never printed one)", () => {
    expect(teachStakeBg(m, { citeMark: true })).toBe(
      `Първа среща — не се брои в резултата. При повторение: ${mark} по ${cite},` +
        " а повторните грешки тежат още повече (×1.5 / ×2.0).",
    );
  });

  it("keeps today's header and subline — LessonPlayShell.tsx:6107, TeachMomentOverlay.tsx:367, :474, :476", () => {
    expect(teachChipBg(m)).toBe("Учебен момент");
    expect(teachSublineBg(m)).toBe("Пауза — първа среща с тази ситуация");
  });

  it("bolds exactly the two runs the live cards bold", () => {
    const strong = teachStakeSegments(m, { citeMark: true, severityLabelBg: SEVERITY_LABEL_BG })
      .filter((s) => s.strong === true)
      .map((s) => s.text);
    expect(strong).toEqual(["не се брои в резултата", mark]);
  });
});

describe("the three NEW stake sentences (§5.5)", () => {
  const sev: SeverityClass = "osnovna";
  const SEVERITY_LABEL_BG = "основна грешка";
  const opts = { citeMark: true, severityLabelBg: SEVERITY_LABEL_BG };
  const mark = minusPointsBg("exam", SEVERITY_POINTS[sev]);
  const cite = examMarkCitationBg(sev);

  it("lesson-first says the lesson will not count AND that no points are taken", () => {
    expect(teachStakeBg(moment("lesson-first", sev), opts)).toBe(
      "Това е грешката, която този урок учи — затова урокът няма да се зачете, дори да е" +
        ` първа среща. В наказателните точки не влиза; при повторение: ${mark}` +
        ` (${SEVERITY_LABEL_BG}) по ${cite}, а повторните грешки тежат още повече (×1.5 / ×2.0).`,
    );
    expect(teachChipBg(moment("lesson-first", sev))).toBe("Грешката на урока");
    expect(teachSublineBg(moment("lesson-first", sev))).toBe("Пауза — грешката, която този урок учи");
  });

  it("lesson-charged says «Отново» — a charged target is always a repeat (F1)", () => {
    expect(teachStakeBg(moment("lesson-charged", sev), opts)).toBe(
      "Отново грешката, която този урок учи — урокът не се зачита. Повторението влиза в" +
        ` изпитния лист: ${mark} (${SEVERITY_LABEL_BG}) по ${cite}.`,
    );
    expect(teachChipBg(moment("lesson-charged", sev))).toBe("Грешката на урока");
    expect(teachSublineBg(moment("lesson-charged", sev))).toBe("Пауза — повторена грешка на урока");
  });

  it("charged drops today's false «не се брои в резултата» on the L1 pause arm", () => {
    const text = teachStakeBg(moment("charged", sev), opts);
    expect(text).toBe(
      `Влиза в изпитния лист: ${mark} (${SEVERITY_LABEL_BG}) по ${cite},` +
        " а повторните грешки тежат още повече (×1.5 / ×2.0).",
    );
    expect(text).not.toContain("не се брои в резултата");
    expect(text).not.toContain("Първа среща");
    expect(teachSublineBg(moment("charged", sev))).toBe(
      "Пауза — грешка, която влиза в изпитния лист",
    );
  });

  it("bolds «урокът няма да се зачете» — the sentence this whole ADR delivers", () => {
    // NOT PINNED UNTIL 2026-09-18. Lane A's verifier removed `strong: true`
    // from `lesson-first` and all 46 tests stayed green, because the file's only
    // `strong` assertion built a `free-first` moment. The emphasis is not
    // decoration: on `lesson-first` the SAME sentence says the lesson is gone
    // and that no points were taken, and unmarked those two clauses read as one
    // shrug — which is the card the founder would photograph next.
    const strongRuns = (kind: keyof typeof KIND_FLAGS): string[] =>
      teachStakeSegments(moment(kind, sev), opts)
        .filter((s) => s.strong === true)
        .map((s) => s.text);
    expect(strongRuns("lesson-first")).toEqual(["урокът няма да се зачете", mark]);
    expect(strongRuns("lesson-charged")).toEqual(["урокът не се зачита", mark]);
    // `charged` carries no stake clause of its own, so the mark is the only
    // emphasis — asserted so a later lane cannot quietly bold something else.
    expect(strongRuns("charged")).toEqual([mark]);
  });

  it("only a target moment wears the chip that names the stake", () => {
    expect(LESSON_MISTAKE_CHIP_BG).toBe("урокът не се зачита");
    for (const kind of ["lesson-first", "lesson-charged"] as const) {
      expect(teachChipBg(moment(kind, sev))).toBe("Грешката на урока");
    }
    for (const kind of ["free-first", "charged"] as const) {
      expect(teachChipBg(moment(kind, sev))).toBe("Учебен момент");
    }
  });
});

// ---------------------------------------------------------------------------
// 6. THE VOCABULARY ASSERTION (critic gap 7) + M10
// ---------------------------------------------------------------------------

/**
 * The same defect `rules/__tests__/point-scales.test.ts` guards by scanning
 * SOURCE, asserted here over PRODUCED STRINGS, because this module is in none
 * of that file's guarded directories.
 *
 * ⚠ `/\bт\./` — the regex doc 92 §8.1 writes — CANNOT MATCH Bulgarian text and
 * would have shipped a scan that passes on everything. JavaScript's `\b` is
 * ASCII-only: Cyrillic „т" is a non-word character to it, so `\bт` requires an
 * ASCII letter or digit immediately before the „т". A bare „−10 т." has a space
 * there and would sail through. So the check is built the way the source
 * scanner builds it: find every „т." token, discard the three shapes that are
 * not a point unit, and require a scale's own adjective in front of the rest.
 */
const QUALIFIER_STEMS = ["наказателн", "изпитн"];
const LETTER = /\p{L}/u;
const LAW_ITEM = /^т\.\s*\d/; // „т. 10" — half of every citation this product prints
const AND_SO_ON = /и\s*т\.\s*н\./;

function barePointWords(text: string): string[] {
  const bad: string[] = [];
  // (a) the abbreviation
  let from = 0;
  for (;;) {
    const at = text.indexOf("т.", from);
    if (at === -1) break;
    from = at + 2;
    if (at > 0 && LETTER.test(text[at - 1])) continue; // „резултат.", a word ending
    if (LAW_ITEM.test(text.slice(at, at + 6))) continue;
    if (AND_SO_ON.test(text.slice(Math.max(0, at - 4), at + 6))) continue;
    const before = text.slice(Math.max(0, at - 14), at);
    if (!QUALIFIER_STEMS.some((s) => before.includes(s))) bad.push(text.slice(Math.max(0, at - 14), at + 2));
  }
  // (b) the same defect spelled out — „точки" with nothing naming the scale
  let word = 0;
  for (;;) {
    const at = text.indexOf("точк", word);
    if (at === -1) break;
    word = at + 4;
    const window = text.slice(Math.max(0, at - 20), at + 30);
    if (!QUALIFIER_STEMS.some((s) => window.includes(s))) bad.push(window);
  }
  return bad;
}

describe("no bare abbreviated points and no unqualified «точки» in this module's output", () => {
  it("M10: the assertion BITES — a synthetic «0 точки» is rejected", () => {
    // Without this case the scan above could be empty-by-construction and read
    // as nine passing assertions. Both halves are proved: the spelled-out form
    // and the abbreviation the founder actually photographed.
    expect(barePointWords("Загуби 0 точки за това.")).not.toHaveLength(0);
    expect(barePointWords("При повторение: −10 т.")).not.toHaveLength(0);
    // …and the three legitimate shapes are NOT rejected, or the scan would be
    // a spelling preference that fails on every citation in the catalogue.
    expect(barePointWords("Наредба № 38 приложение № 5, т. 10, б. „в“")).toEqual([]);
    expect(barePointWords("знаци, маркировка и т.н.")).toEqual([]);
    expect(barePointWords("това е крайният резултат.")).toEqual([]);
  });

  it("every stake sentence, over all four kinds × every severity × both cite modes", () => {
    const severities = Object.keys(SEVERITY_POINTS) as SeverityClass[];
    const offenders: string[] = [];
    for (const kind of Object.keys(KIND_FLAGS) as (keyof typeof KIND_FLAGS)[]) {
      for (const severity of severities) {
        for (const citeMark of [true, false]) {
          for (const severityLabelBg of [undefined, `${severity} грешка`]) {
            const text = teachStakeBg(moment(kind, severity), { citeMark, severityLabelBg });
            for (const bad of barePointWords(text)) offenders.push(`${kind}/${severity}: …${bad}…`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the headers, the sublines, the chip, the rule line and the names phrase", () => {
    const strings: string[] = [LESSON_MISTAKE_CHIP_BG];
    for (const kind of Object.keys(KIND_FLAGS) as (keyof typeof KIND_FLAGS)[]) {
      strings.push(teachChipBg(KIND_FLAGS[kind]), teachSublineBg(KIND_FLAGS[kind]));
    }
    strings.push(
      lessonMistakeRuleBg(practice(target("HARSH_BRAKING_NO_CAUSE"))) ?? "",
      lessonMistakeRuleBg(
        practice(target("HARSH_BRAKING_NO_CAUSE"), target("SPEEDING_OVER_LIMIT")),
      ) ?? "",
      lessonMistakeNamesBg([{ titleBg: "A" }, { titleBg: "B" }, { titleBg: "C" }]),
    );
    const offenders = strings.flatMap((s) => barePointWords(s));
    expect(offenders).toEqual([]);
  });

  it("no string this module writes invents a law reference (ADR-002)", () => {
    // Only `examMarkCitationBg` may put an article on the glass, and it is cut
    // from n38.ts. Anything else naming ЗДвП / ППЗДвП / чл. here would be a
    // free-recalled citation, which ADR-002 forbids outright.
    const authored = [
      LESSON_MISTAKE_CHIP_BG,
      ...(Object.keys(KIND_FLAGS) as (keyof typeof KIND_FLAGS)[]).flatMap((k) => [
        teachChipBg(KIND_FLAGS[k]),
        teachSublineBg(KIND_FLAGS[k]),
        teachStakeBg(moment(k, "osnovna"), { citeMark: false }),
      ]),
      lessonMistakeRuleBg(practice(target("HARSH_BRAKING_NO_CAUSE"))) ?? "",
    ];
    for (const s of authored) {
      expect(s).not.toMatch(/ЗДвП|ППЗДвП|чл\.|ал\.|Наредба/);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. The shape lane C will store — a sanity pin on the hit record
// ---------------------------------------------------------------------------

describe("LessonMistakeHit carries only what both sides can rebuild", () => {
  it("has no field a server rebuilding from (code, t, charged, detail) cannot fill", () => {
    const hits = foldLessonMistakes(
      practice(target("VULNERABLE_PASS_TOO_CLOSE", { demoTitleBg: "Тясно подминаване" })),
      [],
      [coached("VULNERABLE_PASS_TOO_CLOSE", 12.5, undefined)],
    );
    const hit: LessonMistakeHit = hits[0];
    expect(Object.keys(hit).sort()).toEqual(["charged", "code", "demoTitleBg", "t", "titleBg"]);
  });
});
