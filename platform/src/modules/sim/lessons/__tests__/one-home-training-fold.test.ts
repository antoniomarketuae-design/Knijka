/**
 * ONE HOME FOR THE LEDGER-BILLING FILTER — the guard the duplication needed and
 * never had (O12, measured 2026-08-19).
 *
 * The training-layer fold must run over the rows Наредба № 38, чл. 48, ал. 3
 * left the ledger charging, and no others. That filter used to be written out
 * TWICE — once in `engine.ts buildLessonResult` (the client) and once in
 * `wire.ts gradeFinishWire` (the server) — because neither file may import the
 * other. They were repaired in separate lanes, and the window between those
 * lanes shipped a student-facing lie: `LessonPlayShell.tsx:2683` renders the
 * SERVER's `debriefText` whenever the save succeeds, so what a seventeen-year-
 * old read on `sc-hz-accident-scene` L3 was «Удар в пешеходец … без
 * допълнителни точки … — повторна грешка ×1.5» over a «Тренировъчен резултат:
 * 25 наказателни т.» the client had computed as 10.
 *
 * WHAT WAS TRIED FIRST AND IS NOT ENOUGH — this is the reason the file is
 * shaped the way it is, and it is the single most important line in it. The
 * obvious guard is „build both debriefs and assert the texts are identical".
 * Re-measured here with the filter deleted from `wire.ts` alone, on the
 * „repeat before the close and another after it" drive below:
 *
 *   CLIENT  score=30  effective=35  escalations=[×1.5@8]
 *   SERVER  score=30  effective=55  escalations=[×1.5@8, ×2@20]
 *   both debrief texts: «Тренировъчен резултат: 35 наказателни т.»  ← EQUAL
 *
 * The texts agree because `debrief.ts` re-derives that line from its own billed
 * rows instead of printing `result.effectiveScore`. So a text-only comparison
 * passes on a build whose stored training total is out by 20 — and
 * `actions.ts:335` persists `result.effectiveScore` into the SimSession row,
 * which is what session-history's „официален vs тренировъчен" badge reads back.
 * A probe that reports no problem while the number the product keeps is wrong
 * is this project's signature instrument bug. The battery therefore compares
 * the RESULTS first and the texts second.
 *
 * TWO GUARDS, because they fail on different mutations:
 *   1. the differential battery — both paths, every drive, results AND text;
 *   2. the source guard — neither builder may write the filter out again.
 * (1) catches a copy that drifts. (2) catches a copy that has not drifted YET,
 * which is exactly the state this defect was in for eight months.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDebrief } from "../debrief";
import {
  abortSession,
  applyTick,
  buildLessonResult,
  createLessonSession,
  finishSession,
} from "../engine";
import { lessonById } from "../specs";
import type { LessonResult } from "../types";
import { gradeFinishWire, serializeRuleEvents } from "../wire";
import { makeTick } from "./fixtures";
import type { SimTick } from "../../rules";

const l0 = lessonById("l0-free-drive")!;

const zebra = (t: number, id: string): SimTick =>
  makeTick({
    t,
    speedKmh: 30,
    events: [{ kind: "crossingPassed", crossingId: id, pedestrianOnCrossing: true }],
  });

const crash = (t: number, withWhat: "vehicle" | "pedestrian", actorId: string): SimTick =>
  makeTick({ t, speedKmh: 46, events: [{ kind: "collision", withWhat, actorId }] });

interface Drive {
  name: string;
  ticks: SimTick[];
  endAtSec: number;
  abort?: true;
}

/**
 * THE BATTERY. Every drive is here to exercise one way the two folds can part
 * company; the non-vacuity block below asserts that the interesting ones really
 * do reach the state they are named for, so the battery cannot quietly decay
 * into seven clean drives that agree about nothing.
 */
const BATTERY: Drive[] = [
  {
    name: "clean drive, nothing to fold",
    ticks: [makeTick({ t: 1, speedKmh: 30 }), makeTick({ t: 5, speedKmh: 30 })],
    endAtSec: 10,
  },
  {
    name: "one mistake, no repeat",
    ticks: [makeTick({ t: 1, speedKmh: 30 }), zebra(6, "z1"), makeTick({ t: 9, speedKmh: 25 })],
    endAtSec: 15,
  },
  {
    // The ledger never closes, so every row is billed and the ×1.5 is real.
    name: "genuine repeat, nothing terminating",
    ticks: [
      makeTick({ t: 1, speedKmh: 30 }),
      zebra(6, "z1"),
      zebra(40, "z2"),
      makeTick({ t: 45, speedKmh: 30 }),
    ],
    endAtSec: 45,
  },
  {
    // THE MEASURED DIVERGENCE: a real repeat before the close (must survive)
    // and a second one after it (must not be billed, must not be annotated).
    name: "repeat before the close and another after it",
    ticks: [
      makeTick({ t: 1, speedKmh: 30 }),
      zebra(4, "z1"),
      zebra(8, "z2"),
      crash(12, "vehicle", "a"),
      zebra(20, "z3"),
      makeTick({ t: 25, speedKmh: 20 }),
    ],
    endAtSec: 40,
  },
  {
    // The founder's drive, one surface over: two bodies in one crash. The
    // false-repeat root is fixed upstream (coach.ts keys encounters by detail),
    // so no record exists — this drive tests the LEDGER half of the filter on
    // its own: unfiltered, the free row's ten points come back.
    name: "one crash, two victims",
    ticks: [
      makeTick({ t: 1, speedKmh: 46 }),
      crash(13.13, "vehicle", "a"),
      crash(13.43, "pedestrian", "b"),
      makeTick({ t: 14, speedKmh: 40 }),
    ],
    endAtSec: 60,
  },
  {
    // Two billed rows on ONE (code, t) with two records queued on it — the case
    // where consuming and maxing part company (45 vs 50). It is here because the
    // fold moved house in this lane and the move must not have changed it.
    name: "two billed rows share one (code, t)",
    ticks: [
      makeTick({ t: 1, speedKmh: 30 }),
      zebra(6, "x-1"),
      makeTick({
        t: 40,
        speedKmh: 30,
        events: [
          { kind: "crossingPassed", crossingId: "x-2", pedestrianOnCrossing: true },
          { kind: "crossingPassed", crossingId: "x-3", pedestrianOnCrossing: true },
        ],
      }),
      makeTick({ t: 41, speedKmh: 20 }),
    ],
    endAtSec: 50,
  },
  {
    // Quitting does not exempt the fold from agreeing with itself.
    name: "aborted after a repeat",
    ticks: [makeTick({ t: 1, speedKmh: 30 }), zebra(4, "z1"), zebra(9, "z2")],
    endAtSec: 12,
    abort: true,
  },
];

/**
 * Drive once, grade BOTH ways exactly as the product does: `buildLessonResult`
 * on the client, then `LessonPlayShell` serializes the same session — with the
 * RAW `penaltyEscalations` list, which is how a record for a closed-over row
 * reaches the server at all — and the action regrades it via `gradeFinishWire`.
 */
function bothPaths(d: Drive): { client: LessonResult; server: LessonResult } {
  let s = createLessonSession(l0);
  for (const t of d.ticks) s = applyTick(s, t).state;
  s = d.abort === true ? abortSession(s, d.endAtSec) : finishSession(s, d.endAtSec);
  const client = buildLessonResult(s);
  const graded = gradeFinishWire({
    lessonId: l0.id,
    startedAtMs: 0,
    finishedAtMs: d.endAtSec * 1000,
    aborted: client.aborted,
    ruleEvents: serializeRuleEvents(s.events, s.penaltyEscalations, []),
    objectives: [],
  });
  if (graded.status !== "ok") throw new Error(`gradeFinishWire: ${graded.status}`);
  return { client, server: graded.result };
}

/** The raw records the coach made — what the client actually transmits. */
function rawRecords(d: Drive): Array<{ code: string; t: number; multiplier: number }> {
  let s = createLessonSession(l0);
  for (const t of d.ticks) s = applyTick(s, t).state;
  return [...s.penaltyEscalations];
}

const byName = (n: string): Drive => {
  const d = BATTERY.find((x) => x.name === n);
  if (d === undefined) throw new Error(`no battery drive named «${n}»`);
  return d;
};

describe("the client fold and the server fold are one fold", () => {
  for (const d of BATTERY) {
    it(`agrees on every number and every word: ${d.name}`, () => {
      const { client, server } = bothPaths(d);
      // THE RESULTS FIRST — see the header. This is the assertion the shipped
      // defect fails; the text one below does not.
      expect(server.score).toBe(client.score);
      expect(server.effectiveScore).toBe(client.effectiveScore);
      expect(server.escalations).toEqual(client.escalations);
      // …and then the sheet, byte for byte.
      expect(buildDebrief(l0, server).text).toBe(buildDebrief(l0, client).text);
    });
  }
});

describe("the battery reaches the states it is named for", () => {
  /**
   * NON-VACUITY. Without this block a battery of seven clean drives would pass
   * every assertion above while proving nothing — the shape of every "0
   * defects" instrument bug in this audit. Each check names the property the
   * fold is supposed to have an opinion about.
   */
  it("a record really is queued on a row the ledger closed over", () => {
    const d = byName("repeat before the close and another after it");
    const { client } = bothPaths(d);
    expect(client.summary.score.unscoredAfterClose).toBeGreaterThan(0);
    const closedAt = client.summary.score.ledgerClosedAtSec;
    expect(closedAt).not.toBeNull();
    const doomed = rawRecords(d).filter((r) => r.t > closedAt!);
    expect(doomed.length).toBeGreaterThan(0);
    // …and it is dropped: neither annotated nor priced.
    for (const r of doomed) {
      expect(client.escalations.some((e) => e.code === r.code && e.t === r.t)).toBe(false);
    }
    // Measured: base 30, the surviving ×1.5@8 makes 35. Unfiltered it was 55.
    expect(client.score).toBe(30);
    expect(client.effectiveScore).toBe(35);
  });

  it("THE OTHER DIRECTION: a repeat the ledger DID charge still escalates", () => {
    // A filter that dropped everything would satisfy the block above. This one
    // fails unless the ladder still runs on the rows that were billed — the
    // false-failure half of the crime, and the founder's own complaint.
    const { client, server } = bothPaths(byName("genuine repeat, nothing terminating"));
    expect(client.escalations.map((e) => e.multiplier)).toEqual([1.5]);
    expect(server.escalations.map((e) => e.multiplier)).toEqual([1.5]);
    expect(client.effectiveScore).toBeGreaterThan(client.score);
    expect(buildDebrief(l0, server).text).toMatch(/повторна грешка ×1[,.]5/);
    expect(buildDebrief(l0, server).text).toMatch(/Тренировъчен резултат/);
    // …and one is kept while another is dropped on the SAME drive, so the
    // filter is a filter and not a blanket verdict either way.
    const mixed = bothPaths(byName("repeat before the close and another after it")).client;
    expect(mixed.escalations.map((e) => e.multiplier)).toEqual([1.5]);
  });

  it("two billed rows really do land on one (code, t), with two records on it", () => {
    const d = byName("two billed rows share one (code, t)");
    const { client } = bothPaths(d);
    const keys = client.summary.mistakes.map((m) => `${m.code}@${m.t}`);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i).length).toBeGreaterThan(0);
    const onDupe = rawRecords(d).filter(
      (r) => keys.filter((k) => k === `${r.code}@${r.t}`).length > 1,
    );
    expect(onDupe.length).toBeGreaterThan(1);
    expect(new Set(onDupe.map((r) => r.multiplier)).size).toBeGreaterThan(1);
    // Consumed, not maxed: 10 + 15 + 20 = 45. Maxing gives 50.
    expect(client.effectiveScore).toBe(45);
  });

  it("the crash drive really does close the ledger over a second body", () => {
    const { client } = bothPaths(byName("one crash, two victims"));
    expect(client.summary.mistakes).toHaveLength(2);
    expect(client.summary.score.unscoredAfterClose).toBe(1);
    // Unfiltered this is 20 — the free row's ten points coming back.
    expect(client.score).toBe(10);
    expect(client.effectiveScore).toBe(10);
  });

  it("at least one drive escalates, at least one does not, at least one closes", () => {
    const folded = BATTERY.map((d) => bothPaths(d).client);
    expect(folded.some((r) => r.escalations.length > 0)).toBe(true);
    expect(folded.some((r) => r.escalations.length === 0)).toBe(true);
    expect(folded.some((r) => r.summary.score.unscoredAfterClose > 0)).toBe(true);
  });
});

describe("the filter has exactly one home", () => {
  /**
   * THE GUARD THE DRIFT NEEDED. The battery catches a copy that has diverged;
   * this catches a copy that has been RE-INTRODUCED and not diverged yet, which
   * is the state the defect sat in while it was shipping. Reading the source is
   * the only way to assert „there is one of these" — no runtime observation can
   * distinguish two identical folds from one.
   *
   * SELF-CHECKING, per the discipline this audit had to learn four times: it
   * first asserts the names it forbids are REAL and present in escalation.ts, so
   * a rename cannot turn the checks into vacuous truths about strings nobody
   * uses any more.
   */
  const read = (rel: string): string => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

  const escalation = read("escalation.ts");
  const engine = read("engine.ts");
  const wire = read("wire.ts");

  it("escalation.ts is that home, and the names below are the live ones", () => {
    expect(escalation).toContain("ledgerBilling");
    expect(escalation).toContain("export function foldTrainingScore");
    expect(escalation).toContain("export function escalationQueue");
    expect(escalation).toContain("export function applyEscalations");
  });

  it("neither builder applies the ledger filter itself", () => {
    // `ledgerBilling` is the filter; `applyEscalations` is the fold that must
    // never be reached without it. A builder naming either has grown a copy.
    //
    // IF THIS FIRES ON AN HONEST CHANGE — a builder that wants `ledgerBilling`
    // for something that is not the training fold (a billed-row count for a HUD
    // line, say) — the answer is a named helper in `escalation.ts` or
    // `rules/scoring.ts`, not an exemption here. The whole defect was that the
    // arithmetic had two authors.
    expect(engine).not.toContain("ledgerBilling");
    expect(wire).not.toContain("ledgerBilling");
    expect(engine).not.toContain("applyEscalations(");
    expect(wire).not.toContain("applyEscalations(");
  });

  it("…because both call the one that does", () => {
    expect(engine).toContain("foldTrainingScore(");
    expect(wire).toContain("foldTrainingScore(");
    // And the consumption queue is borrowed, not written out a third time.
    // `serializeRuleEvents` held the third copy; `debrief.ts` still holds a
    // fourth (it is outside this lane — see the report). The literal below is
    // what a re-written queue looks like: (code, t) → a list of multipliers.
    expect(wire).toContain("escalationQueue(");
    expect(wire).not.toMatch(/new Map<string, number\[\]>/);
  });
});
