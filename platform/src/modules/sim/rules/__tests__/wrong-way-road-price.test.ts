/**
 * THE OTHER HALF OF WRONG_WAY'S TWO ROADS — THE PRICE.
 * w12, `sc-merge-accel-lane:93685d58`, 2026-08-27.
 *
 * `wrong-way-road-copy.test.ts` pinned the TITLE and the EXPLANATION splitting
 * per road. This file pins the money, the книжка and the состав, which did not
 * split with them — and which the verifier photographed still being the
 * street's under the new motorway title:
 *
 *   «Глоба: 51,13 € (100 лв.)» · «Книжка: 0 контролни точки — не е в списъка» ·
 *   «Съставът: „…се движи в забранената посока на еднопосочен път."»
 *
 * — in «Включване в магистрала през лентата за ускоряване», district
 * `mw-entry-v1`, which contains no street at all; while ЗДвП чл. 178ж, ал. 1
 * (1000 лв., three months of лишаване, and — Наредба № Iз-2539, чл. 6, ал. 1,
 * т. 7 — 15 контролни точки) sat at the bottom of the card under `FaultCard`'s
 * «Ако от това излезе беля» header, i.e. as a thing that happens only if harm
 * follows. A seventeen-year-old was being told wrong-way on a motorway costs a
 * hundred лева and nothing off his licence.
 *
 * ── WHAT THE FIRST CUT OF THIS FILE HELD, AND WHY THAT WAS HALF ─────────────
 * It held that a чл. 178ж step EXISTS on the row, as an `escalation` under the
 * street's `single` shape. Every case in it was green while all three false
 * strings above were still on the glass, because a `single` row prints its own
 * `fine`, `controlPoints` and `offenceQuote` ABOVE the escalation and those
 * were the street's. An escalation cannot fix a headline; it can only be read
 * after it.
 *
 * ── WHAT IT HOLDS NOW ───────────────────────────────────────────────────────
 * That the row makes NO unconditional claim about a price it cannot have. One
 * code grades both acts (Наредба № 38, прил. № 5, т. 10, б. „в" — „пътен възел
 * ИЛИ път с еднопосочно движение"), `roadConsequenceFor` is keyed by that code
 * alone, and the road the student was on reaches the TITLE as `detail` and
 * stops there. So both prices are branches of one `conditional` row, each with
 * its road in front of it, and neither is printed as the price of the other.
 * Both live surfaces already render that shape: `hud/FaultCard.tsx` under the
 * neutral header «Кога все пак се плаща», `lessons/debrief.ts roadLines`
 * through `gatedLineBg`.
 *
 * Each case below fails in one direction on the pre-fix build:
 *   1. the row states no ungated глоба and no ungated книжка — the two
 *      sentences the finding quotes cannot be printed at all;
 *   2. …but the licence answer is not LOST: each branch carries its own, нула
 *      on the street and петнадесет on the motorway;
 *   3. the street price is intact, to the лв., the citation and the note;
 *   4. the motorway price is the motorway's — 1000 лв., чл. 178ж, ал. 1, 15
 *      контролни точки under т. 7, a three-month ban, and never 51,13 €;
 *   5. the motorway branch is gated on the ROAD, not on harm — this is the
 *      «АКО ОТ ТОВА ИЗЛЕЗЕ БЕЛЯ» half of the finding, and it is what the shape
 *      change buys: `conditional` branches render under «Кога все пак се
 *      плаща», `single` escalations under the harm header;
 *   6. the harm branch is still there and still last, so nothing was traded
 *      away for the road split;
 *   7. the три месеца survives on surfaces that never print `fine.banBg` —
 *      neither `FaultCard moneyBg` nor `debrief gatedLineBg` renders that
 *      field, so the headline has to say it in words;
 *   8. the exam mark is untouched: same code, same class, same 10 точки, same
 *      Наредба № 38 clause on both roads;
 *   9. the emergency-lane row, which cites the SAME article's first предложение
 *      (т. 6 → 10 контролни точки), does not collapse into this one (т. 7 → 15).
 *
 * `consequences.test.ts` independently re-cuts every quote here from
 * `content/law/acts` and fails on a changed word; what THIS file holds is which
 * figure is allowed to be printed as the price of what.
 */
import { describe, expect, it } from "vitest";
import { ROAD_CONSEQUENCES, examMarkFor, formatEur, roadConsequenceFor } from "../consequences";
import type { ConditionalPenalty } from "../consequences";
import { VIOLATIONS } from "../catalog";

const wrongWay = () => {
  const road = roadConsequenceFor("WRONG_WAY");
  if (road.kind !== "conditional") {
    throw new Error(
      `WRONG_WAY is "${road.kind}" — a shape that prints an UNCONDITIONAL price, and this code has none`,
    );
  }
  return road;
};

const branchCiting = (citationBg: string): ConditionalPenalty | null =>
  wrongWay().branches.find((b) => b.fine.source.citationBg === citationBg) ?? null;

const STREET = "ЗДвП чл. 183, ал. 4, т. 15";
const MOTORWAY = "ЗДвП чл. 178ж, ал. 1";
const HARM = "ЗДвП чл. 179, ал. 1, т. 5";

describe("WRONG_WAY prices the motorway carriageway as well as the one-way street", () => {
  it("makes no ungated claim about the money or the книжка", () => {
    const road = wrongWay();
    // `FaultCard` prints «Глоба:» and «Книжка:» only from a `single` row's own
    // fields and from a `conditional` row's top-level `controlPoints`. Both are
    // now unreachable for this code, which is what stops «51,13 €» and «0
    // контролни точки — не е в списъка» appearing over a motorway act.
    expect(road.controlPoints).toBeUndefined();
    // …and the summary line must not smuggle a figure back in.
    expect(road.headlineBg).not.toMatch(/\d+\s*(лв\.|€)/);
  });

  it("does not LOSE the licence answer — each road carries its own", () => {
    const street = branchCiting(STREET);
    const motorway = branchCiting(MOTORWAY);
    expect(street?.controlPoints.status).toBe("not-listed");
    expect(motorway?.controlPoints.status).toBe("grounded");
    expect(motorway?.controlPoints.points).toBe(15);
    // The whole justification for dropping the top-level figure: the branches
    // genuinely disagree, so no single number is true of the drive.
    expect(street?.controlPoints.points ?? 0).not.toBe(motorway?.controlPoints.points);
  });

  it("keeps the street price intact — 100 лв. under чл. 183, ал. 4, т. 15", () => {
    const street = branchCiting(STREET);
    expect(street, `no ${STREET} branch on WRONG_WAY`).not.toBeNull();
    expect(street?.fine.amountBgn).toBe(100);
    expect(formatEur(street?.fine.eurCents ?? 0)).toBe("51,13 €");
    expect(street?.fine.banBg).toBeNull();
    expect(street?.controlPoints.noteBg).toContain("изчерпателен");
    // The `Съставът:` line the `single` shape used to carry has nowhere to go on
    // a `conditional` row, so the conduct rides the condition — and NOT inside
    // „…", because it paraphrases the точка rather than quoting it.
    expect(street?.conditionBg).toContain("забранената посока на еднопосочен път");
    expect(street?.conditionBg).not.toContain("„");
  });

  it("prices the motorway at the motorway's own figures, never the street's", () => {
    const motorway = branchCiting(MOTORWAY);
    expect(motorway, `no ${MOTORWAY} branch on WRONG_WAY`).not.toBeNull();
    expect(motorway?.fine.amountBgn).toBe(1000);
    expect(motorway?.controlPoints.source.citationBg).toContain("чл. 6, ал. 1, т. 7");
    // The three-month ban is the fact that makes this a different scale, and it
    // has to be in the fine's own field (consequences.test.ts then proves it is
    // in the same sentence as the money).
    expect(motorway?.fine.banBg).toContain("три месеца");
    // And the euro on the glass is the conversion of the act's лв. — never 51,13.
    expect(formatEur(motorway?.fine.eurCents ?? 0)).not.toBe("51,13 €");
  });

  it("gates the motorway branch on the ROAD and never on harm", () => {
    const motorway = branchCiting(MOTORWAY);
    expect(motorway?.conditionBg ?? "").toMatch(/^когато/);
    expect(motorway?.conditionBg ?? "").toContain("автомагистрала");
    // The finding's second half, pinned: this step must not read as a
    // consequence of damage. `FaultCard` files a `single` row's `escalation`
    // under «Ако от това излезе беля»; a `conditional` row's branches go under
    // «Кога все пак се плаща», which is why the shape had to move.
    expect(motorway?.conditionBg ?? "").not.toContain("опасност");
    expect(motorway?.conditionBg ?? "").not.toContain("произшествие");
  });

  it("still carries the harm branch, and carries it last", () => {
    const road = wrongWay();
    const order = road.branches.map((b) => b.fine.source.citationBg);
    expect(order).toEqual([STREET, MOTORWAY, HARM]);
    // A road branch printed after the harm branch reads as a sub-case of harm,
    // which is the header this repair moved the motorway out of.
    expect(order.indexOf(MOTORWAY)).toBeLessThan(order.indexOf(HARM));
  });

  it("says the три месеца in words, because no surface prints `fine.banBg` here", () => {
    // `FaultCard moneyBg` renders «€ (лв. по текста на закона)» and
    // `debrief gatedLineBg` renders condition + money + контролни точки. Neither
    // touches `banBg` — only the speeding LADDER does. A three-month
    // disqualification is not something a seventeen-year-old may be left to
    // infer, so the headline states it.
    expect(wrongWay().headlineBg).toContain("три месеца");
    expect(wrongWay().headlineBg).toContain("чл. 178ж, ал. 1");
  });

  it("moves the price and NOTHING about the exam mark", () => {
    // One clause, one class, one figure on the изпитен лист, both roads —
    // Наредба № 38, прил. № 5, т. 10, б. „в" names „пътен възел ИЛИ път с
    // еднопосочно движение". Splitting the ЗДвП offence must not split that.
    const mark = examMarkFor("WRONG_WAY");
    expect(mark.points).toBe(VIOLATIONS.WRONG_WAY.points);
    expect(mark.severityClass).toBe(VIOLATIONS.WRONG_WAY.severityClass);
    expect(mark.clause).toBe("в");
  });

  it("does not disturb the emergency-lane row, which cites the SAME article's first limb", () => {
    // чл. 178ж, ал. 1 has two предложения: the аварийна лента (т. 6 → 10
    // контролни точки) and the насрещно платно (т. 7 → 15). They must not
    // collapse into one another.
    const lane = ROAD_CONSEQUENCES.EMERGENCY_LANE_DRIVING;
    expect(lane?.kind).toBe("single");
    if (lane?.kind !== "single") return;
    expect(lane.fine.source.citationBg).toBe(MOTORWAY);
    expect(lane.controlPoints.points).toBe(10);
    expect(branchCiting(MOTORWAY)?.controlPoints.points).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// 2. THE LIVE SURFACE — the half that keeps this from being a dead predicate
// ---------------------------------------------------------------------------

/**
 * §1 asserts the DATA. This section drives a real WRONG_WAY bill through
 * `buildDebrief` — the function `/simulator` calls through
 * `components/sim/lesson-ui/LessonPlayShell.tsx` (client) and
 * `app/(dashboard)/simulator/actions.ts` (server) — and reads the sentences a
 * student actually gets. It is here because a row nothing renders is not a
 * repair, and because the sibling surface `hud/FaultCard.tsx` switches on the
 * SAME `road.kind` this row just changed.
 *
 * Through the module's PUBLIC index, not `lessons/debrief` directly — doc 05
 * „modules talk only through their index.ts", the same route
 * `wrong-way-road-copy.test.ts` takes for the wire.
 */
import {
  applyTick,
  buildDebrief,
  buildLessonResult,
  createLessonSession,
  finishSession,
  lessonById,
} from "../../lessons";
import { makeViolation } from "../catalog";
import type { SimTick } from "../index";

const tick = (t: number): SimTick =>
  ({
    t,
    speedKmh: 30,
    maxSpeedKmh: 50,
    position: { x: 0, y: t * 8 },
    headingDeg: 0,
    laneOffsetM: 0,
    laneId: 0,
    gear: 1,
    seatbeltOn: true,
    handbrakeOn: false,
    headlights: "off",
    isNight: false,
    indicator: "off",
    events: [],
  }) as SimTick;

/** The debrief text of a free drive that collected one WRONG_WAY bill. */
function debriefTextForWrongWay(): string {
  const lesson = lessonById("l0-free-drive")!;
  let s = createLessonSession(lesson);
  s = applyTick(s, tick(1)).state;
  s = { ...s, events: [...s.events, makeViolation("WRONG_WAY", 5)] };
  s = finishSession(s, 99);
  return buildDebrief(lesson, buildLessonResult(s)).text;
}

describe("and the debrief a student actually reads carries both roads", () => {
  const text = debriefTextForWrongWay();

  it("prints the fault at all — the probe sees a real sheet", () => {
    expect(text).toContain(VIOLATIONS.WRONG_WAY.titleBg);
    expect(text).toContain("На пътя");
  });

  it("never states the street's money as the price of the drive", () => {
    // The exact sentence `roadLines`' `single` branch used to emit for this
    // code: «На пътя (не влиза в оценката на урока): глоба 51,13 € …». It is
    // the first of the three strings the finding quotes off the motorway card.
    expect(text).not.toContain("На пътя (не влиза в оценката на урока): глоба 51,13 €");
  });

  it("never states the street's licence answer as the drive's", () => {
    // «0 контролни точки — нарушението не е в изчерпателния списък», printed
    // ungated, is the second string. It may appear ONLY behind the street's
    // condition, i.e. on a line that names the one-way road first.
    const ungated = text
      .split("\n")
      .filter((l) => l.includes("0 контролни точки") && l.includes("На пътя"));
    expect(ungated, `ungated licence answer: ${ungated.join(" | ")}`).toEqual([]);
  });

  it("prices BOTH roads, each behind its own road", () => {
    expect(text).toContain("еднопосочен път");
    expect(text).toContain("51,13 €");
    expect(text).toContain("автомагистрала");
    expect(text).toContain("ЗДвП чл. 178ж, ал. 1");
    expect(text).toContain("15 контролни точки");
    // …and 1000 лв. converts to this, which the street row can never produce.
    expect(text).toContain(formatEur(motorwayEurCents()));
  });

  it("tells him the книжка is taken for three months", () => {
    // `gatedLineBg` does not render `fine.banBg`; the headline carries it.
    expect(text).toContain("три месеца");
  });
});

function motorwayEurCents(): number {
  return branchCiting(MOTORWAY)?.fine.eurCents ?? 0;
}
