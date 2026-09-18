/**
 * ADR-009 (founder Ruling A) · THE LIVE TEACH CARD — doc 92 §5.5.
 *
 * WHAT THE CARD SAID BEFORE THIS LANE. Both of this file's stake sentences read
 * «Първа среща — не се брои в резултата» UNCONDITIONALLY. Under Ruling A that
 * is false on the two arms that matter most:
 *
 *   · on the lesson's OWN mistake the first encounter is exactly the thing that
 *     costs the lesson, and the engine had already set the flag
 *     (`TeachMoment.lessonMistake`, `lessons/engine.ts applyTick`) while this
 *     component read neither it nor lane A's helpers — a measurement wired to
 *     no consumer, the dead-predicate shape this programme has measured 51
 *     times in 82 repairs;
 *   · on the L1 «Пълна помощ» pause-on-error arm the points had ALREADY been
 *     taken when the card promised they had not.
 *
 * SO THE TEST HAS TWO HALVES AND NEEDS BOTH. The three new sentences must
 * render; and `free-first` — the overwhelming majority of teach moments, which
 * is every incidental first encounter in the product — must not change by a
 * character. The second half is the one that could go quietly wrong, so it is
 * pinned against the BYTE-IDENTICAL markup that shipped at HEAD (measured:
 * `renderToStaticMarkup` of the HEAD component against this one, roomy and
 * compact, both identical — see the lane report; the literal below is the text
 * that comparison agreed on).
 *
 * WHAT THIS FILE CANNOT SEE, stated so no claim here is overstated:
 *  · the COMPACT sheet's stake sentence lives behind «Повече» and its expander
 *    is component state, so a static render cannot open it. It is pinned at the
 *    segment level (`teachStakeSegments` with `citeMark: true`) plus the shared
 *    `StakeText` renderer the roomy card's markup proves. The compact branch is
 *    also not reached in the product at all — `LessonPlayShell.tsx` renders the
 *    card `{!compact && teachQueue.length > 0 …}` and routes a phone's teach
 *    moment through the notification queue instead (lane G).
 *  · pixels. vitest.config.ts is `environment: "node"`. The 360 px fit was
 *    measured separately, in a browser, against the shipping compiled CSS —
 *    numbers in the lane report.
 *
 * MUTATION TABLE — every break applied to a SCRATCH COPY (never the live file),
 * each run alone:
 *
 *   M8   drop `lessonMistake` from the moment        → «the lesson's own
 *        (i.e. the engine stops flagging it)            mistake is not called a
 *                                                       free first encounter»
 *   A    `teachChipBg` → always «Учебен момент»      → «the header says which
 *                                                       kind, without «Повече»»
 *   B    `teachSublineBg` → always the shipped line  → «the roomy subline names
 *                                                       the pause»
 *   C    drop `strong: true` from «урокът няма да    → «the one sentence this
 *        се зачете»                                     ADR exists for is
 *                                                       emphasised» (ADDENDUM 1
 *                                                       item 2: unpinned until
 *                                                       here)
 *   D    drop the `LESSON_MISTAKE_CHIP_BG` chip      → «the compact header
 *                                                       carries the chip»
 *   E    `teachStakeSegments`: return the `free-first` → every kind's sentence
 *        arm for every kind                             case, and the
 *                                                       byte-identity case
 *                                                       stays GREEN — which is
 *                                                       why both halves are
 *                                                       required
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  teachChipBg,
  teachStakeBg,
  teachStakeKind,
  teachStakeSegments,
  teachSublineBg,
  type TeachMoment,
} from "@/modules/sim/lessons";
import { TeachMomentOverlay } from "../TeachMomentOverlay";

/** His own drive: over the limit in town, first encounter, t = 22 s. */
const BASE: TeachMoment = {
  code: "SPEEDING_DANGEROUS",
  scenarioId: null,
  titleBg: "Превишена скорост",
  explanationBg:
    "Превиши разрешената скорост с повече от 10 km/h. Спирачният път расте с квадрата на скоростта.",
  lawRef: "ЗДвП чл. 21, ал. 1",
  severity: "opasna",
  points: 10,
  t: 22,
};

const FREE_FIRST: TeachMoment = BASE;
const LESSON_FIRST: TeachMoment = { ...BASE, lessonMistake: true };
const LESSON_CHARGED: TeachMoment = { ...BASE, lessonMistake: true, charged: true };
const CHARGED: TeachMoment = { ...BASE, charged: true };

const ALL: Array<[string, TeachMoment]> = [
  ["free-first", FREE_FIRST],
  ["lesson-first", LESSON_FIRST],
  ["lesson-charged", LESSON_CHARGED],
  ["charged", CHARGED],
];

function roomy(moment: TeachMoment, remaining = 0): string {
  return renderToStaticMarkup(
    <TeachMomentOverlay moment={moment} remaining={remaining} onAcknowledge={() => {}} />,
  );
}
function compact(moment: TeachMoment, remaining = 0): string {
  return renderToStaticMarkup(
    <TeachMomentOverlay moment={moment} remaining={remaining} onAcknowledge={() => {}} compact />,
  );
}
/** Markup with tags stripped — what a reader actually reads. */
function textOf(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// 1 · THE ORDINARY CARD DID NOT MOVE
// ---------------------------------------------------------------------------

/**
 * THE STRING THAT SHIPPED, measured off HEAD's component (not transcribed from
 * the JSX): `renderToStaticMarkup` of the pre-ADR-009 `TeachMomentOverlay` for
 * `SPEEDING_DANGEROUS`/opasna/10, tags stripped. The whole reason lane A built
 * one helper module is that this sentence is printed at three sites; the whole
 * reason it is asserted HERE is that adopting the helper is the moment it could
 * silently change.
 */
const SHIPPED_FREE_FIRST_ROOMY =
  "Учебен момент Пауза — първа среща с тази ситуация Превишена скорост " +
  "Превиши разрешената скорост с повече от 10 km/h. Спирачният път расте с квадрата на скоростта. " +
  "правило: ЗДвП чл. 21, ал. 1 оценка: Наредба № 38 приложение № 5, т. 10, б. „в“ " +
  "Първа среща — не се брои в резултата . При повторение: −10 изпитни т. (опасна грешка), " +
  "а повторните грешки тежат още повече (×1.5 / ×2.0). " +
  "Наказателни точки от изпитния лист по Наредба № 38 — важат за този урок. " +
  "НЕ са контролни точки по книжката. Разбрах — продължи Space или натисни Space / Enter";

describe("free-first — the card 99 % of teach moments still get", () => {
  it("the roomy card reads exactly what it read before ADR-009", () => {
    // The `не се брои в резултата .` space is the `</strong>.` boundary showing
    // through the tag-stripper; it is in the shipped string too, because both
    // sides of this comparison were stripped the same way.
    expect(textOf(roomy(FREE_FIRST))).toBe(SHIPPED_FREE_FIRST_ROOMY);
  });

  it("the header and the subline are the shipped words", () => {
    expect(teachChipBg(FREE_FIRST)).toBe("Учебен момент");
    expect(teachSublineBg(FREE_FIRST)).toBe("Пауза — първа среща с тази ситуация");
    expect(roomy(FREE_FIRST)).toContain("Пауза — първа среща с тази ситуация");
  });

  it("the emphasis is where it was: on „не се брои в резултата“", () => {
    expect(roomy(FREE_FIRST)).toContain("<strong>не се брои в резултата</strong>");
    // …and the compact card keeps its own emphasis class.
    expect(teachStakeSegments(FREE_FIRST, { citeMark: true, severityLabelBg: "опасна грешка" })[1])
      .toEqual({ text: "не се брои в резултата", strong: true });
  });

  it("no lesson chip, no new subline, nothing about a lesson not counting", () => {
    for (const markup of [roomy(FREE_FIRST), compact(FREE_FIRST)]) {
      expect(markup).not.toContain("урокът не се зачита");
      expect(markup).not.toContain("Грешката на урока");
      expect(markup).not.toContain("няма да се зачете");
    }
  });

  it("the compact sheet's header is unchanged too", () => {
    const text = textOf(compact(FREE_FIRST, 2));
    expect(text).toContain("Учебен момент · опасна грешка");
    expect(text).not.toContain("урокът не се зачита");
  });
});

// ---------------------------------------------------------------------------
// 2 · THE THREE NEW SENTENCES
// ---------------------------------------------------------------------------

describe("lesson-first — the sentence ADR-009 exists to deliver", () => {
  it("FAILS ON THE OLD CARD: the lesson's own mistake is not called free", () => {
    const text = textOf(roomy(LESSON_FIRST));
    expect(text).toContain(
      "Това е грешката, която този урок учи — затова урокът няма да се зачете , " +
        "дори да е първа среща. В наказателните точки не влиза; при повторение:",
    );
    // The old promise is gone from this card entirely.
    expect(text).not.toContain("Първа среща — не се брои в резултата");
  });

  it("FAILS ON THE OLD CARD: the header says which kind, without tapping «Повече»", () => {
    // The stake sentence is inside the scrolling reading region; the header is
    // not. A student who reads only the header used to be told the opposite of
    // what was happening to his lesson.
    expect(teachChipBg(LESSON_FIRST)).toBe("Грешката на урока");
    expect(teachSublineBg(LESSON_FIRST)).toBe("Пауза — грешката, която този урок учи");
    const markup = roomy(LESSON_FIRST);
    expect(markup).toContain("Грешката на урока");
    expect(markup).toContain("Пауза — грешката, която този урок учи");
    expect(markup).not.toContain("Пауза — първа среща с тази ситуация");
  });

  it("FAILS ON THE OLD CARD: the compact header carries the lesson chip", () => {
    // «още 2» is the queue pill and carries no „·“ — it is a bordered chip.
    expect(textOf(compact(LESSON_FIRST, 2))).toContain(
      "Грешката на урока · опасна грешка · урокът не се зачита още 2",
    );
  });

  it("ADDENDUM 1 item 2: the one sentence this ADR exists for is EMPHASISED", () => {
    // Lane A's verifier measured that removing `strong: true` from this segment
    // left the module's own 50 tests green. It is pinned here, at the site that
    // renders it, in both the markup and the segment list.
    expect(roomy(LESSON_FIRST)).toContain("<strong>урокът няма да се зачете</strong>");
    const emphasised = teachStakeSegments(LESSON_FIRST, {
      citeMark: false,
      severityLabelBg: "опасна грешка",
    })
      .filter((s) => s.strong === true)
      .map((s) => s.text);
    expect(emphasised).toEqual(["урокът няма да се зачете", "−10 изпитни т."]);
  });

  it("the promise that no points are taken is stated, because it is now TRUE", () => {
    // It is true WITHOUT EXCEPTION only because lane C drops the continuing
    // breach's re-bill (doc 92 §3.4b b). Before that a re-bill six seconds
    // later would have made this card a liar.
    expect(teachStakeBg(LESSON_FIRST, { citeMark: false })).toContain(
      "В наказателните точки не влиза",
    );
  });
});

describe("lesson-charged — a repeat of the lesson's own mistake", () => {
  it("FAILS ON THE OLD CARD: it says «Отново», and where the points went", () => {
    const text = textOf(roomy(LESSON_CHARGED));
    expect(text).toContain(
      "Отново грешката, която този урок учи — урокът не се зачита . " +
        "Повторението влиза в изпитния лист: −10 изпитни т. (опасна грешка).",
    );
    // Both falsehoods the old card printed on this state.
    expect(text).not.toContain("не се брои в резултата");
    expect(text).not.toContain("първа среща");
    // …and no ladder tail: this IS the repeat.
    expect(text).not.toContain("×1.5 / ×2.0");
  });

  it("its subline names a repeat, not a first encounter", () => {
    expect(teachSublineBg(LESSON_CHARGED)).toBe("Пауза — повторена грешка на урока");
    expect(roomy(LESSON_CHARGED)).toContain("Пауза — повторена грешка на урока");
  });
});

describe("charged — the L1 pause-on-error arm on ANY code", () => {
  it("FAILS ON THE OLD CARD: it stops claiming the points were not taken", () => {
    // This card pauses over points it has JUST charged, and it used to print
    // «Първа среща — не се брои в резултата» over them.
    const text = textOf(roomy(CHARGED));
    expect(text).toContain(
      "Влиза в изпитния лист: −10 изпитни т. (опасна грешка), " +
        "а повторните грешки тежат още повече (×1.5 / ×2.0).",
    );
    expect(text).not.toContain("не се брои в резултата");
    expect(text).not.toContain("Първа среща");
  });

  it("it is NOT dressed as a lesson mistake — the two flags are separate", () => {
    expect(teachChipBg(CHARGED)).toBe("Учебен момент");
    expect(teachSublineBg(CHARGED)).toBe("Пауза — грешка, която влиза в изпитния лист");
    expect(roomy(CHARGED)).not.toContain("урокът не се зачита");
  });
});

// ---------------------------------------------------------------------------
// 3 · THE FOUR KINDS AS A SET — properties that hold across all of them
// ---------------------------------------------------------------------------

describe("all four kinds, at both surfaces", () => {
  it("each moment gets exactly the kind its two flags name", () => {
    expect(ALL.map(([, m]) => teachStakeKind(m))).toEqual([
      "free-first",
      "lesson-first",
      "lesson-charged",
      "charged",
    ]);
  });

  it("every kind renders a distinct sentence at each surface", () => {
    for (const citeMark of [true, false]) {
      const said = ALL.map(([, m]) =>
        teachStakeBg(m, { citeMark, severityLabelBg: "опасна грешка" }),
      );
      expect(new Set(said).size).toBe(4);
    }
  });

  it("every kind names the mark with its SCALE — never a bare „−10 т.“", () => {
    // The founder's photographed defect: he read „−10 т." as his licence.
    for (const [label, m] of ALL) {
      for (const citeMark of [true, false]) {
        const said = teachStakeBg(m, { citeMark, severityLabelBg: "опасна грешка" });
        expect(`${label}: ${said.includes("−10 изпитни т.")}`).toBe(`${label}: true`);
        expect(said).not.toMatch(/−\d+ т\./);
      }
    }
  });

  it("every kind keeps the „this is not your licence“ note under it", () => {
    for (const [label, m] of ALL) {
      expect(`${label}: ${textOf(roomy(m)).includes("НЕ са контролни точки")}`).toBe(
        `${label}: true`,
      );
    }
  });

  it("the roomy card never prints the citation twice", () => {
    // `citeMark: false` for the roomy surface: the card already carries the same
    // clause as its own «оценка:» chip, and one provision cited twice reads as
    // two rules.
    for (const [label, m] of ALL) {
      const hits = textOf(roomy(m)).split("приложение № 5, т. 10, б. „в“").length - 1;
      expect(`${label}: ${hits}`).toBe(`${label}: 1`);
    }
  });

  it("every kind still teaches: the authored WHY and the law chip are intact", () => {
    for (const [label, m] of ALL) {
      const text = textOf(roomy(m));
      expect(`${label}: why`).toBe(text.includes("Спирачният път расте") ? `${label}: why` : "");
      expect(text).toContain("правило: ЗДвП чл. 21, ал. 1");
    }
  });

  it("no sentence states law beyond the retrieved citation (ADR-002)", () => {
    for (const [, m] of ALL) {
      for (const citeMark of [true, false]) {
        const said = teachStakeBg(m, { citeMark, severityLabelBg: "опасна грешка" });
        // The ONLY legal reference allowed is `examMarkCitationBg`'s, and only
        // when the caller asked for it.
        const stripped = said.replace(/по Наредба № 38 приложение № 5, т\. \d+, б\. „[а-я]“/g, "");
        expect(stripped).not.toMatch(/чл\.|ал\.|ЗДвП|Наредба/);
      }
    }
  });

  it("the severity label is the CARD's map, passed in — not a second copy", () => {
    // Duplicating `SEVERITY_LABEL` inside the helper is how two surfaces start
    // naming one class differently. Omitting it drops the bracket entirely,
    // which is what the phone notification has always done.
    for (const sev of ["opasna", "osnovna", "vtorostepenna"] as const) {
      const m = { ...LESSON_FIRST, severity: sev };
      // Not a bare `(`: the ladder tail „(×1.5 / ×2.0)" is a bracket too, and
      // the question here is the SEVERITY bracket after the mark.
      expect(teachStakeBg(m, { citeMark: false })).not.toMatch(/т\. \(/);
      expect(teachStakeBg(m, { citeMark: false, severityLabelBg: "изпитна грешка" })).toContain(
        "(изпитна грешка)",
      );
      // …and the label never comes from a second copy of the card's own map.
      expect(teachStakeBg(m, { citeMark: false })).not.toContain("грешка)");
    }
  });
});
