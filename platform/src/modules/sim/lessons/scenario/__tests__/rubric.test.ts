/**
 * scoreRubric — pure star fold over channels that already exist (A10
 * objective details) + the S1-fed observation input. No UI here.
 */
import { describe, expect, it } from "vitest";
import { buildSessionSummary, makeViolation } from "../../../rules";
import type { LessonResult, ObjectiveDetail } from "../../types";
import { scoreRubric } from "../rubric";
import type { RubricSpec } from "../types";

const RUBRIC: RubricSpec = {
  placement: { objectiveId: "park" },
  economy: { objectiveId: "park", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
  observation: {
    moments: [
      { id: "m1", titleBg: "Огледала преди задна" },
      { id: "m2", titleBg: "Поглед през рамо" },
    ],
  },
  parTimeSec: 90,
};

function parkDetail(over: Partial<Extract<ObjectiveDetail, { kind: "parkInBay" }>> = {}): ObjectiveDetail {
  return {
    kind: "parkInBay",
    attempts: 1,
    inBay: true,
    centerOffsetM: 0.12,
    headingOffsetDeg: 2.4,
    alignment: "centered",
    ...over,
  };
}

/** N bay entries with the car NOT at rest in the outline — a count still running. */
function unsettled(attempts: number): ObjectiveDetail {
  return parkDetail({ attempts, inBay: false, alignment: null, centerOffsetM: null, headingOffsetDeg: null });
}

function makeResult(over: Partial<LessonResult> = {}, detail: ObjectiveDetail | undefined = parkDetail()): LessonResult {
  return {
    lessonId: "sc-park-perp-rev@L3",
    summary: buildSessionSummary([]),
    objectives: [
      { id: "park", titleBg: "Паркирай", done: true, completedAtSec: 62, detail },
    ],
    completedAll: true,
    aborted: false,
    passed: true,
    score: 0,
    effectiveScore: 0,
    escalations: [],
    durationSec: 75,
    ...over,
  };
}

describe("scoreRubric", () => {
  it("perfect park, first attempt, all glances → 3 stars, full breakdown", () => {
    const { stars, breakdownBg } = scoreRubric(makeResult(), RUBRIC, {
      observedMomentIds: ["m1", "m2"],
    });
    expect(stars).toBe(3);
    expect(breakdownBg.map((l) => [l.id, l.points, l.measured])).toEqual([
      ["placement", 2, true],
      ["economy", 2, true],
      ["observation", 2, true],
      ["parTime", null, true],
    ]);
    // Bulgarian breakdown copy on every line.
    for (const line of breakdownBg) expect(line.detailBg).toMatch(/[Ѐ-ӿ]/);
  });

  it("acceptable placement + second attempt → 2 stars", () => {
    const result = makeResult({}, parkDetail({ alignment: "acceptable", attempts: 2, centerOffsetM: 0.4 }));
    const { stars } = scoreRubric(result, RUBRIC, { observedMomentIds: ["m1", "m2"] });
    expect(stars).toBe(2); // (1 + 1 + 2) / 6 = 0.67
  });

  it("sloppy placement and shuffled attempts → 1 star", () => {
    const result = makeResult({}, parkDetail({ alignment: "sloppy", attempts: 4 }));
    const { stars, breakdownBg } = scoreRubric(result, RUBRIC, { observedMomentIds: [] });
    expect(stars).toBe(1);
    expect(breakdownBg.find((l) => l.id === "economy")?.points).toBe(0);
    expect(breakdownBg.find((l) => l.id === "observation")?.points).toBe(0);
  });

  it("without the observation input the component reports measured:false and stays out of the fold", () => {
    const { stars, breakdownBg } = scoreRubric(makeResult(), RUBRIC);
    const obs = breakdownBg.find((l) => l.id === "observation")!;
    expect(obs.measured).toBe(false);
    expect(obs.points).toBeNull();
    // placement 2 + economy 2 over 2 measured components → still 3 stars.
    expect(stars).toBe(3);
  });

  it("par time is informational: overrunning it never costs a star", () => {
    const { stars, breakdownBg } = scoreRubric(makeResult({ durationSec: 240 }), RUBRIC, {
      observedMomentIds: ["m1", "m2"],
    });
    expect(stars).toBe(3);
    expect(breakdownBg.find((l) => l.id === "parTime")?.points).toBeNull();
  });

  it("any penalty point caps at 2 stars (quality never outranks legality)", () => {
    const v = makeViolation("HANDBRAKE_LEFT_ON", 10); // 1 т. второстепенна
    const result = makeResult({ summary: buildSessionSummary([v]), score: 1 });
    const { stars } = scoreRubric(result, RUBRIC, { observedMomentIds: ["m1", "m2"] });
    expect(stars).toBe(2);
  });

  it("dangerous/terminated, aborted or unfinished results floor at 1 star", () => {
    const collision = makeViolation("COLLISION", 20);
    expect(
      scoreRubric(
        makeResult({ summary: buildSessionSummary([collision]), score: 10, passed: false }),
        RUBRIC,
        { observedMomentIds: ["m1", "m2"] },
      ).stars,
    ).toBe(1);
    expect(scoreRubric(makeResult({ aborted: true, passed: false }), RUBRIC).stars).toBe(1);
    expect(scoreRubric(makeResult({ completedAll: false, passed: false }), RUBRIC).stars).toBe(1);
  });

  // OPEN ITEM, recorded not repaired — see the same note at the fold in
  // rubric.ts. sweep161: six of the seven cockpit scenarios carry a
  // `parTimeSec`-only rubric (doc 86 D7: 128 of 154), so `measuredCount` is 0
  // on every run of them — and every ИЗДЪРЖАН lane printed „3 от 3 звезди",
  // `sc-pk-move-off/pc-wrong` included: the lane driven WRONG on purpose,
  // 59 км/ч in a 50 zone with the tutor's speeding card up (`04-t012s.png`),
  // three filled gold stars on the debrief (`08-debrief.png`). The 3 below is
  // the SHIPPED contract (~141 assertions encode it; 72 are named „earns full
  // stars from cleanliness"), so it stands until an ADR moves it.
  it("no measurable channels: stars come from official cleanliness alone", () => {
    const result = makeResult({}, undefined); // objective has no detail
    const clean = scoreRubric(result, { parTimeSec: 60 });
    expect(clean.stars).toBe(3);
    const dirty = scoreRubric(
      makeResult({ score: 1, summary: buildSessionSummary([makeViolation("HANDBRAKE_LEFT_ON", 5)]) }, undefined),
      { parTimeSec: 60 },
    );
    expect(dirty.stars).toBe(2);
  });

  // -------------------------------------------------------------------------
  // A COUNT THAT IS STILL RUNNING IS NOT EVIDENCE YET.
  //
  // `attempts` counts bay ENTRIES, so a car that crossed the outline once and
  // then hit the van reads `attempts: 1` — which scored a full 2/2 and printed
  // „Паркира от първи опит — чиста маневра" over a park that never happened.
  // The conviction side of the same counter is final (more attempts cannot
  // make „too many corrections" untrue) and is kept.
  // -------------------------------------------------------------------------
  it("economy withholds praise for a park that never came to rest in the bay", () => {
    const crashedOnFirstEntry = makeResult({
      completedAll: false,
      passed: false,
      objectives: [{ id: "park", titleBg: "Паркирай", done: false, completedAtSec: null, detail: unsettled(1) }],
    });
    const line = scoreRubric(crashedOnFirstEntry, RUBRIC).breakdownBg.find((l) => l.id === "economy")!;
    expect(line.measured).toBe(false); // was true, with points: 2
    expect(line.points).toBeNull();
    expect(line.detailBg).not.toMatch(/чиста маневра/);
    expect(line.detailBg).toMatch(/Един опит/); // the count is still reported
  });

  it("economy still convicts on a count that can no longer improve", () => {
    // 4 entries is already past attemptsFor2Stars — settling later cannot
    // rescue it, so the 0 stands even though the car never came to rest.
    const shuffling = makeResult({
      completedAll: false,
      passed: false,
      objectives: [{ id: "park", titleBg: "Паркирай", done: false, completedAtSec: null, detail: unsettled(4) }],
    });
    const line = scoreRubric(shuffling, RUBRIC).breakdownBg.find((l) => l.id === "economy")!;
    expect(line.measured).toBe(true);
    expect(line.points).toBe(0);
  });

  it("economy praises a first-attempt park that DID finish", () => {
    // The guard must not swallow the credit it exists to qualify.
    const line = scoreRubric(makeResult(), RUBRIC).breakdownBg.find((l) => l.id === "economy")!;
    expect(line.measured).toBe(true);
    expect(line.points).toBe(2);
    expect(line.detailBg).toMatch(/чиста маневра/);
  });

  it("an observation component with no authored moments measures nothing", () => {
    // Was: `ratio = 1` → a full 2/2 for every driver alive, counted as a
    // MEASURED component, off a check nobody wrote. `validate.ts:261` rejects
    // an empty `moments` at authoring time; this is the same refusal at the
    // scorer, where the runtime-merged rubric of `simulator/actions.ts` lands.
    const vacuous = { observation: { moments: [] }, parTimeSec: 60 };
    const result = makeResult({}, undefined);
    const obs = scoreRubric(result, vacuous, { observedMomentIds: [] }).breakdownBg.find(
      (l) => l.id === "observation",
    )!;
    expect(obs.measured).toBe(false);
    expect(obs.points).toBeNull();
  });

  it("a component with moments still measures — the empty guard is not a blanket excuse", () => {
    // The opposite direction: refusing to grade nothing must not become
    // refusing to grade anything.
    const obs = scoreRubric(makeResult(), RUBRIC, { observedMomentIds: ["m1", "m2"] }).breakdownBg.find(
      (l) => l.id === "observation",
    )!;
    expect(obs.measured).toBe(true);
    expect(obs.points).toBe(2);
  });

  it("placement/economy report measured:false when the maneuver never landed in the bay", () => {
    const result = makeResult({ completedAll: false, passed: false }, parkDetail({ alignment: null, attempts: 0, inBay: false, centerOffsetM: null, headingOffsetDeg: null }));
    const { breakdownBg } = scoreRubric(result, RUBRIC);
    expect(breakdownBg.find((l) => l.id === "placement")?.measured).toBe(false);
    expect(breakdownBg.find((l) => l.id === "economy")?.measured).toBe(false);
  });

  it("is pure: identical inputs → identical output", () => {
    const a = scoreRubric(makeResult(), RUBRIC, { observedMomentIds: ["m1"] });
    const b = scoreRubric(makeResult(), RUBRIC, { observedMomentIds: ["m1"] });
    expect(a).toEqual(b);
  });
});
