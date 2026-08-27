/**
 * THE OTHER HALF OF WRONG_WAY'S TWO ROADS — THE PRICE.
 * w11, `sc-merge-accel-lane:93685d58`, 2026-08-27.
 *
 * `wrong-way-road-copy.test.ts` pinned the TITLE and the EXPLANATION splitting
 * per road. The repair that landed it said in as many words what it was leaving
 * behind (`catalog.ts WRONG_WAY_ROAD_COPY`): „What genuinely differs is the
 * PRICE — чл. 183, ал. 4 (100 лв.) on a street versus чл. 178ж, ал. 1 on a
 * motorway — and `realWorldBg` has no per-event channel at all, so that half is
 * reported rather than smuggled in here."
 *
 * THE VERIFIER RE-DROVE IT AND READ THE CARD BACK. Under the new motorway
 * title the money apparatus was still the street's — «51,13 €», «0 контролни
 * точки» — and the row closed with «Този ред е за постоянната забрана и за
 * еднопосочната улица», on `mw-entry-v1`, a district with no street in it.
 * A student on the motorway was being told his ticket was a hundred лева and
 * his книжка untouched, when ЗДвП чл. 178ж, ал. 1 prices that act at 1000 лв.,
 * three months of лишаване and — Наредба № Iз-2539, чл. 6, ал. 1, т. 7 — 15
 * контролни точки.
 *
 * `roadConsequenceFor` is keyed by `ViolationCode` alone, so the fix is a
 * CONDITIONAL step: the figure printed with its condition attached, which is
 * this module's own rule for anything the simulator has not established. Both
 * live surfaces already render it (`hud/FaultCard.tsx` escalation block,
 * `lessons/debrief.ts roadLines` → `gatedLineBg`).
 *
 * `consequences.test.ts` independently re-cuts BOTH quotes from
 * `content/law/acts` and fails on a changed word; what THIS file holds is that
 * the row exists at all, that its numbers are the motorway's and not the
 * street's, and that the closing note no longer denies the motorway case.
 */
import { describe, expect, it } from "vitest";
import { ROAD_CONSEQUENCES, formatEur, roadConsequenceFor } from "../consequences";

const wrongWay = () => {
  const road = roadConsequenceFor("WRONG_WAY");
  if (road.kind !== "single") throw new Error(`WRONG_WAY is ${road.kind}, expected "single"`);
  return road;
};

const motorwayStep = () =>
  (wrongWay().escalation ?? []).find((s) => s.fine.source.citationBg === "ЗДвП чл. 178ж, ал. 1") ??
  null;

describe("WRONG_WAY prices the motorway carriageway as well as the one-way street", () => {
  it("the street row is untouched — 100 лв. under чл. 183, ал. 4, т. 15, книжка not listed", () => {
    const road = wrongWay();
    expect(road.fine.amountBgn).toBe(100);
    expect(road.fine.source.citationBg).toBe("ЗДвП чл. 183, ал. 4, т. 15");
    expect(road.controlPoints.status).toBe("not-listed");
  });

  it("carries a чл. 178ж, ал. 1 step — the article the finding said had not changed", () => {
    expect(motorwayStep(), "no ЗДвП чл. 178ж, ал. 1 step on WRONG_WAY").not.toBeNull();
  });

  it("…priced at the motorway's own figures, not the street's", () => {
    const step = motorwayStep();
    expect(step?.fine.amountBgn).toBe(1000);
    expect(step?.controlPoints.status).toBe("grounded");
    expect(step?.controlPoints.points).toBe(15);
    expect(step?.controlPoints.source.citationBg).toContain("чл. 6, ал. 1, т. 7");
    // The three-month ban is the fact that makes this a different scale, and it
    // has to be in the fine's own field (consequences.test.ts then proves it is
    // in the same sentence as the money).
    expect(step?.fine.banBg).toContain("три месеца");
    // And the euro on the glass is the conversion of the act's лв. — never 51,13.
    expect(formatEur(step?.fine.eurCents ?? 0)).not.toBe("51,13 €");
  });

  it("keeps the condition attached — it is a different ROAD, never the price of this drive", () => {
    const step = motorwayStep();
    expect(step?.conditionBg ?? "").toMatch(/^когато/);
    expect(step?.conditionBg ?? "").toContain("автомагистрала");
  });

  it("the closing note stops saying the row is only about the one-way street", () => {
    const note = wrongWay().noteBg ?? "";
    expect(note).not.toContain("Този ред е за постоянната забрана и за еднопосочната улица");
    // It must name the other road and the article that prices it, because
    // `gatedLineBg` does not print a ban and a three-month disqualification is
    // not something a seventeen-year-old should have to infer.
    expect(note).toContain("АВТОМАГИСТРАЛА");
    expect(note).toContain("чл. 178ж, ал. 1");
    expect(note).toContain("три месеца");
  });

  it("does not disturb the emergency-lane row, which cites the SAME article's first limb", () => {
    // чл. 178ж, ал. 1 has two предложения: the аварийна лента (т. 6 → 10
    // контролни точки) and the насрещно платно (т. 7 → 15). They must not
    // collapse into one another.
    const lane = ROAD_CONSEQUENCES.EMERGENCY_LANE_DRIVING;
    expect(lane?.kind).toBe("single");
    if (lane?.kind !== "single") return;
    expect(lane.fine.source.citationBg).toBe("ЗДвП чл. 178ж, ал. 1");
    expect(lane.controlPoints.points).toBe(10);
    expect(motorwayStep()?.controlPoints.points).toBe(15);
  });
});
