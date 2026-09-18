/**
 * THE «ПОХВАЛИ» CARD AND THE «РАЗБОР» PROSE, ABOUT ONE COMMENDATION.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 * `SessionEndScreen.tsx` and `lessons/debrief.ts` derive a commendation's
 * rider from the SAME two functions — `commendationRiderFlags` and
 * `commendationRiderBg` — and the screen's own memo said, in prose, that this
 * was "the reason the two post-drive surfaces can never say different things
 * about one commendation". Sharing a function is not sharing a QUESTION. When
 * ADR-009 (founder Ruling A, 2026-09-17 · doc 92 §5.6.7) gave both functions a
 * third parameter — the лист-free hits — `debrief.ts commendationLines` passed
 * them and this screen did not, so the screen went on asking the pre-ADR
 * question and the sentence above became false.
 *
 * MEASURED 2026-09-18 on the production chain — every committed tape ×
 * authored rung, 2,434 drives, 654 of them carrying a hit, this component
 * rendered through `renderToStaticMarkup` and the riders read off its own
 * markup (scratch instrument `fix-riders/card-census.mjs`):
 *
 *     95 drives · 130 commendation rows · 22 lessons
 *
 * …on which the card printed the FULL GREEN ✓ and no rider, while the «Разбор»
 * prose immediately below it printed, about that same commendation:
 *
 *     «…но само на отделни отсечки от маршрута: в същия урок се случи
 *      грешката, която той учи. Похвалата е за метрите без нито едно
 *      нарушение, не за урока…»
 *
 * The card certified as clean a drive the same screen had just refused in the
 * badge above it — «Не е взет» on 87 of the 95, «Неиздържан» on the other 8.
 * That is the THEO-4 defect ADR-009 exists to end, printed by the ADR's own
 * screen. After the one-argument repair: 0 drives, 0 rows. The 2,434 drives
 * print 975 cards between them (1,459 carry no commendation, so no card at
 * all); of those 975, 880 are byte-identical and 95 moved — every one a hit
 * drive, 130 riders ADDED, 0 removed, 0 re-texted, 130 green ✓ turned to
 * «(✓)», none back. Re-counted independently by this round's verifier, who
 * corrected „2,339 of the 2,434 cards" here: that figure counted drives.
 *
 * ── WHAT IS PINNED, AND WHY IT IS PINNED THIS WAY ─────────────────────────
 * Both surfaces are driven for real in the same test: the RESULT is the
 * engine's fold (`buildLessonResult`, so `lessonMistakes` is never a literal
 * typed here), the CARD is this component rendered, and the PROSE is
 * `buildDebrief`'s actual text. The assertion is that the string the card
 * prints is the string the prose prints — not that each equals a copy of the
 * call site kept in this file, which is how the claim got out the door false
 * the first time.
 *
 * `renderToStaticMarkup` and not a DOM: vitest.config.ts is `environment:
 * "node"` for the whole suite — the sibling `session-end-verdict.test.tsx`
 * precedent.
 *
 * ── MUTATION · run 2026-09-18 in a scratch copy of `platform/src`, never the
 *    live file (`scratchpad/fix-riders/mut`, node_modules junctioned; the file
 *    was byte-restored after each break and the run says so) ────────────────
 *
 *   V0 control                                             GREEN  8 passed
 *   V1 `commendationRiderFlags(summary, c)` — flags lose
 *      the hits                                            RED    4 failed
 *   V2 `commendationRiderBg(summary, flags)` — only the
 *      TEXT argument dropped, the flags still fed           RED    2 failed
 *      (the лист arm «в същия урок има и отбелязани грешки» comes back, and it
 *      points at a «Грешки» block this screen does not print on a clean лист)
 *   V3 the whole pre-ADR line restored, both args dropped   RED    4 failed
 *   V4 memo deps back to `[summary]`                        GREEN — not
 *      observable in one render; disclosed, not claimed (foot of this file)
 *   V5 `const stands = true` — the gate always certifies    RED    1 failed
 *   V6 the heading always wears `text-success`              RED    1 failed
 *   V7 `lessonMistakes` forced non-empty for every drive    RED    1 failed
 *      (the other direction: a spotless drive's card must not move)
 *   V8 the hit's code swapped for one sharing the PRAISED
 *      skill's concept (`JUNCTION_SCAN_INCOMPLETE`)         RED    6 failed
 *      (so "praise for a DIFFERENT skill still stands" is not vacuous)
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  VIOLATIONS,
  makeCommendation,
  makeViolation,
  type ScorableEvent,
} from "../../rules";
import { buildDebrief } from "../../lessons/debrief";
import {
  applyTick,
  buildLessonResult,
  createLessonSession,
  finishSession,
} from "../../lessons/engine";
import { compileScenario } from "../../lessons/scenario/compile";
import { scenarioById } from "../../lessons/scenario/templates";
import type { CoachedMistake, LessonResult } from "../../lessons/types";
import { makeTick } from "../../lessons/__tests__/fixtures";
import { SessionEndScreen } from "../SessionEndScreen";

/** One compiled rung — the only lesson shape that carries `lessonMistakeTargets`. */
function lessonAt(id: string, level: 1 | 2 | 3 | 4 | 5) {
  const spec = scenarioById(id);
  if (spec === undefined) throw new Error(`no scenario template "${id}"`);
  return compileScenario(spec, level);
}

const LESSON = lessonAt("sc-vu-pass-clearance", 3);

/** The lesson's own mistake, taught and NOT scored — ADR-009's withheld half. */
const CYCLIST_SQUEEZE: CoachedMistake = {
  code: "VULNERABLE_PASS_TOO_CLOSE",
  titleBg: VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.titleBg,
  t: 20.9,
  detail: "vulnerable-pass",
};

/**
 * A SESSION THAT EXPERIENCED THE GIVEN RECORDS, folded by the real engine —
 * the `lesson-mistake-debrief.test.ts` pattern, so `lessonMistakes` here is
 * `foldLessonMistakes`' output and a fold that stopped running takes this file
 * red rather than leaving it certifying a literal.
 */
function drive(
  opts: { events?: ScorableEvent[]; coached?: CoachedMistake[] } = {},
): LessonResult {
  let s = createLessonSession(LESSON);
  s = applyTick(s, makeTick({ t: 1 })).state;
  s = {
    ...s,
    events: [...s.events, ...(opts.events ?? [])],
    coachedMistakes: [...(s.coachedMistakes ?? []), ...(opts.coached ?? [])],
  };
  return buildLessonResult(finishSession(s, 99));
}

/** THE CARD, as the student meets it: per row, its mark, its title, its rider. */
function commendationCard(
  result: LessonResult,
  debriefText: string,
): { headingTone: string; rows: { mark: string; titleBg: string; riderBg: string | null }[] } {
  const markup = renderToStaticMarkup(
    <SessionEndScreen
      lessonTitleBg="Разминаване с велосипедист"
      result={result}
      debriefText={debriefText}
      concepts={[]}
      xpEarned={null}
      onRetry={() => undefined}
      onExit={() => undefined}
      nextLessonTitleBg={null}
      onNextLesson={null}
    />,
  );
  const start = markup.indexOf('<section aria-label="Похвали"');
  if (start === -1) throw new Error("no «Похвали» card in the markup");
  const card = markup.slice(start, markup.indexOf("</section>", start));
  const headingTone = /<h3 class="text-sm font-extrabold ([^"]*)">/.exec(card)?.[1] ?? "";
  const rows = card.split("<li").slice(1).map((li) => {
    const mark = /<span aria-hidden="true" class="[^"]*">([^<]*)<\/span>/.exec(li)?.[1] ?? "";
    const titleBg = /<span class="font-semibold">([^<]*)<\/span>/.exec(li)?.[1] ?? "";
    const riderBg =
      /<p class="pl-7 text-xs font-semibold leading-relaxed text-warning">([^<]*)<\/p>/.exec(
        li,
      )?.[1] ?? null;
    return { mark, titleBg: unescapeMarkup(titleBg), riderBg: riderBg === null ? null : unescapeMarkup(riderBg) };
  });
  return { headingTone, rows };
}

/** `renderToStaticMarkup` escapes text nodes; the student reads the other side. */
function unescapeMarkup(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** The «Разбор» bullet for one praise title, verbatim, from the REAL debrief. */
function proseBullet(text: string, titleBg: string): string {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith(`• ${titleBg}`));
  if (line === undefined) throw new Error(`no «${titleBg}» bullet in the debrief prose`);
  return line;
}

// ---------------------------------------------------------------------------
// The measured shape: лист clean, lesson refused, praise printed anyway.
// ---------------------------------------------------------------------------

/**
 * `sc-ac-aquaplane/mistake-float-drift` and 94 other drives, in one fixture:
 * a hit, an EMPTY изпитен лист, and CLEAN_DRIVING on the card. The praise for
 * the very skill the hit convicted is the second half — `YIELDED_TO_PRIORITY`
 * with the `vulnerable-pass` situation carries `c-cyclists`, which is also
 * `VULNERABLE_PASS_TOO_CLOSE`'s concept.
 *
 * THE 130 ROWS, COUNTED BY ARM (re-measured by this round's verifier, who
 * corrected the „20 of the 130" this line first claimed for THIS shape):
 *   110 · `CLEAN_DRIVING`, the „чисто" arm — the лист is clean and the hit is
 *         the only thing that makes „чисто" false;
 *    12 · `FULL_STOP_AT_STOP_SIGN` contradicted by `JUNCTION_SCAN_INCOMPLETE`;
 *     8 · `YIELDED_TO_PRIORITY` contradicted by `FOLLOWING_TOO_CLOSE` +
 *         `VULNERABLE_PASS_TOO_CLOSE` — the shape this fixture reproduces.
 * So 20 rows take the contradiction arm and 8 of them are this one. Both arms
 * were dead on this surface before the repair, not just the „чисто" one.
 */
const REFUSED_BUT_PRAISED = drive({
  coached: [CYCLIST_SQUEEZE],
  events: [
    makeCommendation("CLEAN_DRIVING", 12),
    makeCommendation("YIELDED_TO_PRIORITY", 8, "vulnerable-pass"),
  ],
});

describe("the fixture is the measured shape, read off the engine", () => {
  it("one hit, a clean изпитен лист, and two commendations to print", () => {
    expect((REFUSED_BUT_PRAISED.lessonMistakes ?? []).map((h) => h.code)).toEqual([
      "VULNERABLE_PASS_TOO_CLOSE",
    ]);
    // ADR-009's whole point: the first occurrence is taught and NOT scored, so
    // `summary` — which IS the лист — cannot see it. This is why the flags
    // needed the hits handed to them separately.
    expect(REFUSED_BUT_PRAISED.summary.mistakes).toEqual([]);
    expect(REFUSED_BUT_PRAISED.summary.conceptIds).toEqual([]);
    expect(REFUSED_BUT_PRAISED.summary.passed).toBe(true);
    // …and the screen refuses the lesson all the same.
    expect(REFUSED_BUT_PRAISED.passed).toBe(false);
    expect(REFUSED_BUT_PRAISED.summary.commendations.map((c) => c.code)).toEqual([
      "YIELDED_TO_PRIORITY",
      "CLEAN_DRIVING",
    ]);
  });
});

describe("the card carries the rider the prose carries", () => {
  it("FAILS ON THE OLD CALL SITE: the praise on a refused drive is qualified", () => {
    const deb = buildDebrief(LESSON, REFUSED_BUT_PRAISED, {
      coachedMistakes: REFUSED_BUT_PRAISED.coachedMistakes,
    });
    const card = commendationCard(REFUSED_BUT_PRAISED, deb.text);
    expect(card.rows).toHaveLength(2);
    for (const row of card.rows) {
      expect(row.riderBg).not.toBeNull();
      // THE GATE, not the text: the certificate is withheld, not the credit.
      expect(row.mark).toBe("(✓)");
    }
    // …and with no row standing, the heading stops wearing the certificate
    // colour — the card's own rule, now reachable on a clean-лист drive.
    expect(card.headingTone).toBe("text-warning");
  });

  it("…and it is the SAME SENTENCE, not a second opinion about the same drive", () => {
    const deb = buildDebrief(LESSON, REFUSED_BUT_PRAISED, {
      coachedMistakes: REFUSED_BUT_PRAISED.coachedMistakes,
    });
    const card = commendationCard(REFUSED_BUT_PRAISED, deb.text);
    for (const row of card.rows) {
      const bullet = proseBullet(deb.text, row.titleBg);
      // The prose joins its rider with „ — "; the card prints it as a line of
      // its own (see `cleanDrivingScopeBg`, which carries no leading dash).
      expect(bullet).toBe(`• ${row.titleBg} — ${row.riderBg}`);
    }
  });

  it("the rider names what actually happened — the ADR arm, not the лист arm", () => {
    const deb = buildDebrief(LESSON, REFUSED_BUT_PRAISED, {
      coachedMistakes: REFUSED_BUT_PRAISED.coachedMistakes,
    });
    const card = commendationCard(REFUSED_BUT_PRAISED, deb.text);
    const clean = card.rows.find((r) => r.titleBg === "Чисто и спокойно каране");
    expect(clean).toBeDefined();
    // «има и отбелязани грешки» would point at a «Грешки» block that does NOT
    // render on this screen — the лист is empty. Doc 92 §5.6.7.
    expect(clean?.riderBg).toContain("в същия урок се случи грешката, която той учи");
    expect(clean?.riderBg).not.toContain("в същия урок има и отбелязани грешки");
    expect(clean?.riderBg).toContain("Похвалата е за метрите без нито едно нарушение");
    // The skill praise gets the contradiction rider instead — a different
    // sentence, because it is a different claim.
    const skill = card.rows.find((r) => r.titleBg !== "Чисто и спокойно каране");
    expect(skill?.riderBg).toContain("същото умение е и сред грешките в този урок");
  });

  it("THEO-4 · ADR-002: both riders are a reason, and neither cites law", () => {
    const deb = buildDebrief(LESSON, REFUSED_BUT_PRAISED, {
      coachedMistakes: REFUSED_BUT_PRAISED.coachedMistakes,
    });
    for (const row of commendationCard(REFUSED_BUT_PRAISED, deb.text).rows) {
      const rider = row.riderBg ?? "";
      expect(rider).not.toMatch(/чл\.|ал\.|ЗДвП|Наредба/);
      // Not a bare verdict: each rider says what it was measured over and what
      // the standard is.
      expect(rider.length).toBeGreaterThan(80);
    }
  });
});

describe("THE OTHER DIRECTION — the 880 cards that must not move", () => {
  it("a spotless drive's praise keeps the green ✓ and gets no rider at all", () => {
    const clean = drive({ events: [makeCommendation("CLEAN_DRIVING", 12)] });
    expect(clean.lessonMistakes ?? []).toEqual([]);
    const deb = buildDebrief(LESSON, clean, { coachedMistakes: clean.coachedMistakes });
    const card = commendationCard(clean, deb.text);
    expect(card.rows).toHaveLength(1);
    expect(card.rows[0].riderBg).toBeNull();
    expect(card.rows[0].mark).toBe("✓");
    expect(card.headingTone).toBe("text-success");
    // The prose agrees, by carrying no rider either.
    expect(proseBullet(deb.text, "Чисто и спокойно каране")).toBe("• Чисто и спокойно каране");
  });

  it("a DIRTY лист still gets the лист's own arm, not the ADR's", () => {
    // 43 of the measured drives carry both a hit and scored faults; the arm is
    // chosen by what the student can actually see on the screen, and here the
    // «Грешки» block is right above the praise.
    const both = drive({
      coached: [CYCLIST_SQUEEZE],
      events: [makeCommendation("CLEAN_DRIVING", 12), makeViolation("HANDBRAKE_LEFT_ON", 30)],
    });
    expect((both.lessonMistakes ?? []).length).toBe(1);
    expect(both.summary.mistakes.length).toBe(1);
    const deb = buildDebrief(LESSON, both, { coachedMistakes: both.coachedMistakes });
    const card = commendationCard(both, deb.text);
    const clean = card.rows.find((r) => r.titleBg === "Чисто и спокойно каране");
    expect(clean?.riderBg).toContain("в същия урок има и отбелязани грешки");
    expect(clean?.riderBg).not.toContain("се случи грешката, която той учи");
  });

  it("praise for a DIFFERENT skill on the same refused drive still stands", () => {
    // FULL_STOP_AT_STOP_SIGN is `c-give-way-stop-behavior`, not `c-cyclists`,
    // so the hit contradicts nothing it claims — only the drive-level claim
    // («чисто») is qualified. This is the mixed card: one ✓, one (✓).
    const mixed = drive({
      coached: [CYCLIST_SQUEEZE],
      events: [makeCommendation("FULL_STOP_AT_STOP_SIGN", 8)],
    });
    const deb = buildDebrief(LESSON, mixed, { coachedMistakes: mixed.coachedMistakes });
    const card = commendationCard(mixed, deb.text);
    expect(card.rows).toHaveLength(1);
    expect(card.rows[0].riderBg).toBeNull();
    expect(card.rows[0].mark).toBe("✓");
    expect(card.headingTone).toBe("text-success");
  });
});

/**
 * WHAT THIS FILE DOES NOT CLAIM.
 *
 * The memo's dependency array (`[summary, result.lessonMistakes]`) is not
 * pinned here: a single `renderToStaticMarkup` computes every memo exactly
 * once, so a wrong dep list is invisible to this instrument and an assertion
 * shaped to "prove" it would be green under its own break. It is stated in the
 * source instead, where the reader can check it against the closure.
 *
 * Fit is not claimed either. The riders render into a wrapping `<p>` with no
 * `truncate`, `line-clamp` or fixed height, inside a `max-w-2xl` column; the
 * longest string this card can now print is 206 characters against the 197 it
 * already printed before this repair, so the worst case is one more wrapped
 * line. Nothing here photographs a frame.
 */
