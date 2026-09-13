/**
 * THE THREE ERROR-CLASS COUNTS, AS DATA — AND THE PROOF THEY CANNOT DRIFT.
 *
 * WHY THIS FILE EXISTS. `sc-vp-readiness:b3c922d5` came back UNJUDGED eight
 * sweeps running (w33·w34·w35·w36·w37·w41×2·w43). Its claim is about three
 * numbers — «Опасни / Основни / Второстепенни» — across four lanes, and until
 * 2026-09-14 those numbers existed ONLY as pixels: all 125 debrief sidecars in
 * w43 carry a verdict, a score and six screenshots each, and not one of them
 * carries a class count. Settling the row therefore cost twenty-four
 * screenshot reads, so in eight sweeps it was never settled.
 *
 * `tools/mobile/lesson-audit.mjs` now reads `tr[data-sev]` into
 * `_audit-debrief.json`. That read is only worth having if the attribute and
 * the cell can never disagree — a probe that measures something ADJACENT to
 * what the screen shows is the exact failure mode of every HUD probe that has
 * lied in this codebase (`scrollWidth` for overflow, an `/id:/` anchor for
 * identity, `/км\/ч/` for speed). So this file does not assert that the
 * attributes exist. It asserts, on a graded result whose numbers come from the
 * ENGINE and not from a fixture, that each row's `data-sev-count` /
 * `data-sev-points` equal the two numbers printed in that row's own cells.
 *
 * `renderToStaticMarkup`, matching the sibling files: vitest.config.ts runs
 * this suite under `environment: "node"`, and the question is what the markup
 * SAYS.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildSessionSummary, makeViolation, type ScorableEvent } from "../../rules";
import type { LessonResult } from "../../lessons";
import { SessionEndScreen } from "../SessionEndScreen";

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

function markupOf(result: LessonResult): string {
  return renderToStaticMarkup(
    <SessionEndScreen
      lessonTitleBg="Тестов урок"
      result={result}
      debriefText="разбор"
      concepts={[]}
      xpEarned={null}
      onRetry={() => undefined}
      onExit={() => undefined}
      nextLessonTitleBg={null}
      onNextLesson={null}
    />,
  );
}

/**
 * Every `<tr data-sev=…>` in the markup, as {sev, attrCount, attrPoints,
 * cells}. `cells` is the row's `<td>` text with tags stripped — i.e. what a
 * reader reads — so the comparison below is attribute-versus-pixel and not
 * attribute-versus-attribute.
 */
function severityRows(markup: string) {
  const out: { sev: string; attrCount: number; attrPoints: number; cells: string[] }[] = [];
  const rowRe = /<tr\b([^>]*\bdata-sev=[^>]*)>([\s\S]*?)<\/tr>/g;
  for (let m = rowRe.exec(markup); m; m = rowRe.exec(markup)) {
    const attrs = m[1];
    const sev = /\bdata-sev="([^"]*)"/.exec(attrs)?.[1];
    const count = /\bdata-sev-count="([^"]*)"/.exec(attrs)?.[1];
    const points = /\bdata-sev-points="([^"]*)"/.exec(attrs)?.[1];
    if (sev === undefined || count === undefined || points === undefined) continue;
    const cells = [...m[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
      c[1].replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(),
    );
    out.push({ sev, attrCount: Number(count), attrPoints: Number(points), cells });
  }
  return out;
}

/** A drive with a fault in every class, so no row is proven by a zero.
 *  Codes are the live catalogue's: ПТП is опасна, the belt основна, the
 *  centre line второстепенна. Points come from the engine. */
const ALL_THREE = resultOf(
  [
    makeViolation("COLLISION", 30),
    makeViolation("SEATBELT_OFF_WHILE_MOVING", 8),
    makeViolation("CENTER_LINE_TOUCHED", 15),
  ],
  { completedAll: false },
);

/** A clean drive — every class zero. The OPPOSITE direction, because a hook
 *  that only ever reports non-zeroes would answer b3c922d5's actual question
 *  («every class reads 0») with silence. */
const CLEAN = resultOf([]);

describe("the class table is machine-readable", () => {
  it("carries exactly the three classes, keyed by the SeverityClass name", () => {
    expect(severityRows(markupOf(ALL_THREE)).map((r) => r.sev)).toEqual([
      "opasna",
      "osnovna",
      "vtorostepenna",
    ]);
  });

  it("reports zeroes as zeroes, so «no table» and «a table of zeroes» stay distinguishable", () => {
    const rows = severityRows(markupOf(CLEAN));
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.attrCount, r.sev).toBe(0);
      expect(r.attrPoints, r.sev).toBe(0);
    }
  });
});

describe("the attribute cannot drift from the cell", () => {
  // The fixture must actually exercise all three, or the equality below is
  // three comparisons of 0 to 0 and proves nothing.
  it("proves the fixture is graded in all three classes", () => {
    const s = ALL_THREE.summary.score;
    expect(s.opasniCount, "опасни").toBeGreaterThan(0);
    expect(s.osnovniCount, "основни").toBeGreaterThan(0);
    expect(s.vtorostepenniCount, "второстепенни").toBeGreaterThan(0);
  });

  for (const [name, result] of [["a fault in every class", ALL_THREE], ["a clean drive", CLEAN]] as const) {
    it(`each row's attributes equal the two numbers printed in that row — ${name}`, () => {
      const rows = severityRows(markupOf(result));
      expect(rows).toHaveLength(3);
      for (const r of rows) {
        // The last two <td> of the row are the count and the points columns.
        const [countCell, pointsCell] = r.cells.slice(-2);
        expect(countCell, `${r.sev} count cell`).toBe(String(r.attrCount));
        expect(pointsCell, `${r.sev} points cell`).toBe(String(r.attrPoints));
      }
    });
  }

  it("and equals what the ENGINE scored, not merely what the row object held", () => {
    const s = ALL_THREE.summary.score;
    const byKey = Object.fromEntries(severityRows(markupOf(ALL_THREE)).map((r) => [r.sev, r]));
    expect(byKey.opasna.attrCount).toBe(s.opasniCount);
    expect(byKey.opasna.attrPoints).toBe(s.opasniPoints);
    expect(byKey.osnovna.attrCount).toBe(s.osnovniCount);
    expect(byKey.osnovna.attrPoints).toBe(s.osnovniPoints);
    expect(byKey.vtorostepenna.attrCount).toBe(s.vtorostepenniCount);
    expect(byKey.vtorostepenna.attrPoints).toBe(s.vtorostepenniPoints);
  });
});

describe("the scanner itself can fail", () => {
  // A test whose extractor silently returns [] passes every assertion that
  // loops over it. Three of the four numbers this programme got wrong in one
  // day came from a reader that matched nothing and said so quietly.
  it("finds nothing in markup that carries no data-sev", () => {
    expect(severityRows("<table><tr><td>Опасни грешки</td><td>2</td><td>20</td></tr></table>")).toEqual([]);
  });

  it("would catch an attribute that disagrees with its cell", () => {
    const rigged = `<tr data-sev="opasna" data-sev-count="0" data-sev-points="0"><td>Опасни грешки</td><td>2</td><td>20</td></tr>`;
    const [r] = severityRows(rigged);
    expect(r.attrCount).toBe(0);
    expect(r.cells.slice(-2)).toEqual(["2", "20"]);
    expect(String(r.attrCount)).not.toBe(r.cells.slice(-2)[0]);
  });
});
