/**
 * THE LIBRARY MAY NOT ACQUIT A FAULT THE LAW GRADES.
 *
 * `event-library.json` is authored data, and one of its fields decides whether
 * a student is charged for a mistake. `policy.ts resolveEncounter` reads
 * `getScenarioEvent(id)?.policyDefault`, and `"learn-only"` is documented in
 * types.ts as „Illustrative — always a learning moment, NEVER PENALISED". A
 * single word in a JSON file can therefore make a fault free.
 *
 * TODAY EXACTLY ONE EVENT CARRIES IT — `ev-collision`, which is `safety:
 * "critical"` — and the only thing standing between that word and a debrief
 * that prints 0 for a crash is a branch in a DIFFERENT module:
 * `policyForViolation` forces `"always-grade"` when the catalogue calls the
 * code опасна or `terminateSession`, and `COLLISION` is both. The acquittal is
 * inert by coincidence of two files agreeing, not by anything that checks.
 *
 * So this file checks it, in the direction that matters. A green tick for a
 * skill nothing measured is the crime this audit exists to stop, and „the
 * collision was never penalised" is its purest form.
 *
 * TWO ASSERTIONS, AND THEY FAIL FOR DIFFERENT REASONS:
 *
 *  1. DATA — every code mapped to a `learn-only` event must be опасна or
 *     terminating in `rules/catalog.ts`. That is precisely the condition under
 *     which the severity floor overrides the library; anything else is a fault
 *     the library switches off and nothing switches back on.
 *  2. BEHAVIOUR — driven through the REAL `coachStep` on a FRESH session, the
 *     first occurrence of every such code is `scored: true`. Assertion 1 is
 *     about the data; this one is about what the coach does with it, and a
 *     future change to the floor breaks this without touching the JSON.
 *
 * MUTATION (2026-08-19, reverted): `ev-lane-change.policyDefault` in
 * event-library.json set to `"learn-only"`. `LANE_CHANGE_WITHOUT_INDICATOR` is
 * основна (3 pt) and not terminating, so it falls through the floor
 * (`policyForViolation` returns undefined for основна) — assertion 1 named all
 * three of that event's codes and assertion 2 caught the first-encounter
 * `scored: false`. Both failed; the file was restored.
 */

import { describe, expect, it } from "vitest";
import { SCENARIO_EVENTS } from "../events";
import { scenarioForCode } from "../mapping";
import { coachStep } from "../coach";
import { VIOLATIONS, type ViolationCode } from "../../rules";

/** Every catalogue code that maps onto a scenario event, with its severity. */
function mappedCodes(): { code: ViolationCode; eventId: string }[] {
  const out: { code: ViolationCode; eventId: string }[] = [];
  for (const code of Object.keys(VIOLATIONS) as ViolationCode[]) {
    const eventId = scenarioForCode(code);
    if (eventId) out.push({ code, eventId });
  }
  return out;
}

const LEARN_ONLY = new Set(
  SCENARIO_EVENTS.filter((e) => e.policyDefault === "learn-only").map((e) => e.id),
);

describe("event-library.json cannot acquit a graded fault", () => {
  it("the mapping is live — this file is measuring something", () => {
    // The self-check the rules of this audit demand: if `scenarioForCode` ever
    // stops resolving, every assertion below passes vacuously and says so in
    // the reassuring direction. 37 codes map today.
    expect(mappedCodes().length).toBeGreaterThanOrEqual(30);
    // …and there IS a learn-only event to catch, so the set is not empty by
    // accident either. `ev-collision` is the one, and it is safety-critical.
    expect(LEARN_ONLY.size).toBeGreaterThan(0);
    for (const id of LEARN_ONLY) {
      const ev = SCENARIO_EVENTS.find((e) => e.id === id)!;
      expect(ev).toBeDefined();
    }
  });

  it("every code mapped to a learn-only event is опасна or terminating in the catalogue", () => {
    const acquitted: string[] = [];
    for (const { code, eventId } of mappedCodes()) {
      if (!LEARN_ONLY.has(eventId)) continue;
      const spec = VIOLATIONS[code];
      const floored = spec.severityClass === "opasna" || spec.terminateSession === true;
      if (!floored) acquitted.push(`${code} → ${eventId} (${spec.severityClass})`);
    }
    expect(
      acquitted,
      `these codes are switched off by event-library.json and nothing switches them back on:\n  ${acquitted.join("\n  ")}`,
    ).toEqual([]);
  });

  it("a FIRST-encounter learn-only-mapped fault is still scored by the coach", () => {
    for (const { code, eventId } of mappedCodes()) {
      if (!LEARN_ONLY.has(eventId)) continue;
      const spec = VIOLATIONS[code];
      // A fresh session: no prior encounters at all. This is the only shot the
      // library gets at making the fault free.
      const { decision } = coachStep(
        {},
        {
          code,
          severityClass: spec.severityClass,
          terminateSession: spec.terminateSession === true,
        },
      );
      expect(decision.scored, `${code} (${eventId}) went unscored on its first occurrence`).toBe(
        true,
      );
      expect(decision.mode).toBe("grade");
    }
  });
});
