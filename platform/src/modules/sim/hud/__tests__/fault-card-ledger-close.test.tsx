/**
 * ONE CARD, ONE NUMBER — the fault row on a closed exam sheet.
 *
 * ── 2026-08-19 · WHAT THIS FILE DOES NOT PROVE, AND THE MEASUREMENT THAT SAID
 * SO. The header below argues from ONE SCREEN and every case in it renders the
 * CARD ALONE. That gap was real, not rhetorical: `FaultCard` gained
 * `examBilled` and this file went green, while `SessionEndScreen.tsx` — the
 * only surface in the product that mounts the list — never passed the prop, and
 * the prop DEFAULTS TO BILLED on purpose. So the screen went on printing the
 * catalogue base on every row for another day. Rendered on 2026-08-19, the
 * squeeze below produced «−10 изпитни т.» TWICE on one screen whose table read
 * 10 and whose debrief read «без допълнителни точки». The screen-level proof
 * lives in `session-end-ledger-close.test.tsx`, which mounts
 * `SessionEndScreen` with a real `buildDebrief` and sums the marks off the
 * markup. THIS file is still worth its run — it is where the card's own
 * wording and its default are pinned — but it is the unit half. Do not read a
 * green here as a claim about a screen.
 *
 * `SessionEndScreen.tsx` renders the FaultCard list (line 1211) and
 * `debriefText` (line 1290) on the SAME screen. Наредба № 38, чл. 48, ал. 3
 * closes the practical sheet at the first terminating опасна, so a fault after
 * it is taught and not charged; `rules/scoring.ts ledgerBilling()` says which
 * rows those are and `lessons/debrief.ts` has folded it since 2026-08-18.
 * `FaultCard` had not: it printed `minusPointsBg("exam", event.points)` — the
 * CATALOGUE BASE — unconditionally on every row.
 *
 * THE DRIVE, and it is a real one: the sc-hz-accident-scene squeeze, a wrecked
 * car struck at 13.13 s and a bystander at 13.43 s (the same fixture
 * `lessons/__tests__/debrief-collision-truth.test.ts` was built from). The
 * ledger charges 10. The debrief printed «Удар в пешеходец — опасна, без
 * допълнителни точки — изпитът вече беше прекратен» and the card beside it
 * printed «−10 изпитни т.» about that row, so the screen stated 10 and 20 at
 * once. `.audit-frames/sweep161/sc-ac-aquaplane/pc-wrong/08-debrief.png` is the
 * deployed build doing the same thing in the protocol table: «Опасни грешки 2 ·
 * 20» over one closed exam.
 *
 * WHY THE DEBRIEF IS BUILT HERE RATHER THAN QUOTED. A literal copied into two
 * files agrees until one of them is edited, and this whole defect is two
 * surfaces on one screen that stopped agreeing. So the phrase the card prints
 * is asserted to be a phrase a REAL `buildDebrief` prints, over the same
 * events — editing either wording alone fails this file.
 *
 * BOTH DIRECTIONS, always. A card that suppressed the mark whenever it felt
 * unsure would hide charges the ledger really made, which is the same crime
 * pointing at a green tick: every „says nothing" case below is paired with a
 * drive that must still say «−10 изпитни т.».
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildDebrief, lessonById } from "../../lessons";
import type { LessonResult } from "../../lessons";
import {
  buildSessionSummary,
  ledgerBilling,
  makeViolation,
  type ViolationEvent,
} from "../../rules";
import { FaultCard } from "../FaultCard";

/** Markup with tags stripped — what a reader actually reads. */
function textOf(node: React.ReactElement): string {
  return renderToStaticMarkup(node)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const l0 = lessonById("l0-free-drive")!;

/**
 * A LessonResult around a list of violations — enough for `buildDebrief`, and
 * built through `buildSessionSummary` so the score, the closure and the billing
 * are the product's own arithmetic and not this file's idea of it.
 */
function resultOf(mistakes: ViolationEvent[]): LessonResult {
  const summary = buildSessionSummary(mistakes);
  return {
    lessonId: l0.id,
    summary,
    objectives: [],
    completedAll: true,
    aborted: false,
    passed: summary.passed,
    score: summary.score.totalPoints,
    effectiveScore: summary.score.totalPoints,
    escalations: [],
    durationSec: 60,
  };
}

/** The measured drive: a wrecked car at 13.13, the bystander at 13.43. */
const CAR_THEN_PERSON: ViolationEvent[] = [
  makeViolation("COLLISION", 13.13, { detail: "vehicle" }),
  makeViolation("COLLISION", 13.43, { detail: "pedestrian" }),
];

/**
 * THE CONTROL DRIVE: two опасни that terminate NOTHING — two zebras walked
 * through with a pedestrian on them. `PEDESTRIAN_NOT_YIELDED` carries no
 * `terminateSession`, so the ledger never closes and BOTH rows are charged.
 * Every „does not print the mark" assertion below is run against this too, so a
 * fix that answered the collision case by muting the mark generally fails here.
 */
const TWO_MISSED_ZEBRAS: ViolationEvent[] = [
  makeViolation("PEDESTRIAN_NOT_YIELDED", 4),
  makeViolation("PEDESTRIAN_NOT_YIELDED", 38),
];

function cardsFor(mistakes: ViolationEvent[]): string[] {
  const summary = buildSessionSummary(mistakes);
  const billed = ledgerBilling(summary.mistakes);
  return summary.mistakes.map((m, i) =>
    textOf(<FaultCard event={m} correctiveBg={null} atBg="0:13" examBilled={billed[i]} />),
  );
}

describe("the fault card reads the ledger, not the catalogue base", () => {
  it("the row чл. 48, ал. 3 closed over prints no mark — it printed «−10 изпитни т.»", () => {
    const [car, person] = cardsFor(CAR_THEN_PERSON);
    // The charged row is unchanged: the crash that ended the exam costs 10.
    expect(car).toContain("−10 изпитни т.");
    // The row the closure covered carries no exam figure of any kind — not the
    // base, and not a „0" either, which beside «Удар в пешеходец» would read as
    // „this did not matter".
    expect(person).not.toContain("−10 изпитни т.");
    expect(person).not.toMatch(/−\d+ изпитн/);
    expect(person).not.toMatch(/\b0 изпитни т\./);
    expect(person).toContain("без допълнителни изпитни точки");
    // …with the clause that closed the sheet, so the claim is checkable.
    expect(person).toContain("Наредба № 38, чл. 48, ал. 3");
    // And the scale is named. „без допълнителни точки" is the founder's own
    // misreading with the number taken out: unqualified „точки" is КОНТРОЛНИ
    // точки to a Bulgarian reader, and this card sits beside three other point
    // systems. `rules/__tests__/point-scales.test.ts` scans this directory for
    // exactly that and caught this string when it was first written.
    expect(person).not.toMatch(/без допълнителни точки/);
  });

  it("the two halves of ONE screen state one number", () => {
    // The card's own words must be words the debrief prints for the same drive
    // — not a literal this file also happens to hold. The pin is the clause the
    // two surfaces share VERBATIM; the card additionally names the scale (see
    // LEDGER_CLOSED_MARK_BG), which is a difference in the safe direction and
    // must not be allowed to hide a difference in the unsafe one.
    const [, person] = cardsFor(CAR_THEN_PERSON);
    const debrief = buildDebrief(l0, resultOf(CAR_THEN_PERSON)).text;
    const SHARED = "изпитът вече беше прекратен";
    expect(debrief).toContain(`без допълнителни точки — ${SHARED}`);
    expect(person.toLowerCase()).toContain(SHARED);
    expect(person).toContain("без допълнителни");
    // And the number the debrief DOES charge is the number the cards carry
    // between them: 10 once, not 10 twice.
    expect(debrief).toContain("10 наказателни т. по изпитния лист");
    expect(debrief).not.toMatch(/20 наказателни т/);
  });

  it("THE OTHER DIRECTION: with no closure BOTH rows keep their mark", () => {
    // Nothing terminates here, so suppressing either row would hide a charge
    // the ledger really made — a fail quietly reshaped towards a pass.
    const cards = cardsFor(TWO_MISSED_ZEBRAS);
    expect(cards).toHaveLength(2);
    for (const c of cards) {
      expect(c).toContain("−10 изпитни т.");
      expect(c).not.toContain("без допълнителни");
      expect(c).not.toContain("Изпитът вече беше прекратен");
    }
    expect(buildSessionSummary(TWO_MISSED_ZEBRAS).score.totalPoints).toBe(20);
  });

  it("THE OTHER DIRECTION: an unwired card is the BILLED one", () => {
    // The live overlay and the dev rigs render one fault with no session around
    // it. Omitting the prop must overstate a penalty, never hide one.
    const bare = textOf(
      <FaultCard event={makeViolation("COLLISION", 13.13, { detail: "vehicle" })} correctiveBg={null} atBg="0:13" />,
    );
    expect(bare).toContain("−10 изпитни т.");
    expect(bare).not.toContain("без допълнителни");
  });

  it("the closed row keeps everything the closure does NOT reach", () => {
    // чл. 48, ал. 3 is a provision of the exam наредба. It ends the sheet; it
    // does not make the second crash free on the street, and a student who read
    // «без допълнителни точки» and stopped there would think it did.
    const [, person] = cardsFor(CAR_THEN_PERSON);
    // The class and its clause — the fault is still an опасна грешка.
    expect(person).toContain("опасна грешка");
    expect(person).toContain("Наредба № 38 приложение № 5, т. 10, б. „в“");
    // The act's own words (THEO-4): a person was struck, and the card says so.
    expect(person).toContain("Удари човек");
    // The road half, untouched.
    expect(person).toContain("На пътя");
    expect(person).toContain("Глобата и контролните точки са друга система");
  });
});
