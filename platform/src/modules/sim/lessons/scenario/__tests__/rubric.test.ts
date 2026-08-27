/**
 * scoreRubric — pure star fold over channels that already exist (A10
 * objective details) + the S1-fed observation input. No UI here.
 */
import { describe, expect, it } from "vitest";
import { buildSessionSummary, makeViolation } from "../../../rules";
import type { LessonResult, ObjectiveDetail } from "../../types";
import { scoreRubric } from "../rubric";
import { SC_VP_HANDBRAKE } from "../templates-cockpit2";
import { SCENARIO_TEMPLATES_PARKING3 } from "../templates-parking3";
import type { RubricSpec } from "../types";

/**
 * The two consequence clauses, DUPLICATED here on purpose rather than imported
 * from rubric.ts: an assertion that reads the constant it is checking can only
 * ever agree with itself. These are the strings a Bulgarian 17-year-old reads
 * on the card, so they are pinned as literals and a change to the copy has to
 * be made twice, deliberately, in two files.
 */
const NOT_IN_STARS = "Този показател не влиза в звездите горе.";
const NO_QUALITY_MEASURED =
  "Нито един показател за качеството на маневрата не бе измерен на това каране: " +
  "звездите горе идват само от изпитния лист — наказателни точки и изпълнени задачи — " +
  "а не от оценка на самото изпълнение.";
/**
 * The third clause, duplicated for the same reason as the two above: what the
 * under-par „Ориентировъчно време" row now says about the ориентир itself.
 */
const PAR_NOT_A_TARGET =
  "Ориентирът е груба мярка колко трае маршрутът в спокойно темпо, а не цел за " +
  "надбягване: по-бързото каране не добавя звезда и не променя изпитния лист. " +
  "Безопасната скорост я определя пътят — знакът, видимостта и хората по него.";

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

  // -------------------------------------------------------------------------
  // THE SAME COUNT, THE OTHER ARM — sweep161 · sc-maneuver-uturn/mobile-right.
  //
  // The debrief printed „Не всички задачи от маршрута бяха изпълнени" and
  // „– Задача 2: обърни посоката на 180° в едно движение" (a dash — unmet), and
  // one card higher „Икономичност на маневрата 2 / 2 т. за изпълнение · Обратен
  // завой в 1 движения — чиста маневра." (RUN.log / 08-debrief.png). The park
  // arm had been given the settled fold; this arm had not. `movements` is
  // `reversals + 1` and `reversals` keeps counting while the objective is open,
  // so the count is final only once the turn came to rest facing back inside
  // the corridor — which is what `done` means here.
  // -------------------------------------------------------------------------
  const TURN_RUBRIC: RubricSpec = {
    economy: { objectiveId: "turn", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    parTimeSec: 45,
  };

  function turnResult(
    over: Partial<LessonResult>,
    detail: ObjectiveDetail | undefined,
    done: boolean,
  ): LessonResult {
    return makeResult(
      {
        objectives: [
          { id: "turn", titleBg: "Обърни посоката", done, completedAtSec: done ? 40 : null, detail },
        ],
        ...over,
      },
      undefined,
    );
  }

  const turnDetail = (movements: number): ObjectiveDetail => ({
    kind: "threePointTurn",
    entered: true,
    reversals: Math.max(0, movements - 1),
    movements,
    headingToTargetDeg: 3,
  });

  it("economy withholds praise for a turn that never came to rest in the corridor", () => {
    // Swung round in one arc and rolled on out of the box: the facing came
    // back (so objectives.ts reports a movement) but the maneuver never
    // finished, and the count could still have grown.
    const rolledOn = turnResult({ completedAll: false, passed: false }, turnDetail(1), false);
    const line = scoreRubric(rolledOn, TURN_RUBRIC).breakdownBg.find((l) => l.id === "economy")!;
    expect(line.measured).toBe(false); // was true, with points: 2
    expect(line.points).toBeNull();
    expect(line.detailBg).not.toMatch(/чиста маневра/);
    expect(line.detailBg).toMatch(/Едно движение/); // the count is still reported
  });

  it("economy still convicts a turn on a count that can no longer improve", () => {
    // The counter-direction: 4 movements is already past attemptsFor2Stars, and
    // settling later cannot rescue it — abstaining here would be the opposite
    // false verdict.
    const shunting = turnResult({ completedAll: false, passed: false }, turnDetail(4), false);
    const line = scoreRubric(shunting, TURN_RUBRIC).breakdownBg.find((l) => l.id === "economy")!;
    expect(line.measured).toBe(true);
    expect(line.points).toBe(0);
  });

  it("economy praises a single-arc turn that DID finish", () => {
    // The guard must not swallow the credit it exists to qualify — this is the
    // shipped sc-maneuver-uturn shadow (done, 1 movement → 2/2).
    const line = scoreRubric(turnResult({}, turnDetail(1), true), TURN_RUBRIC).breakdownBg.find(
      (l) => l.id === "economy",
    )!;
    expect(line.measured).toBe(true);
    expect(line.points).toBe(2);
    expect(line.detailBg).toMatch(/чиста маневра/);
    // „Обратен завой в 1 движения" was printed on the card for the BEST result
    // this rubric can award.
    expect(line.detailBg).toBe("Обратен завой в едно движение — чиста маневра.");
  });

  // -------------------------------------------------------------------------
  // THE GOAL IN THE SENTENCE IS THE AUTHORED GOAL.
  // -------------------------------------------------------------------------
  it("the „acceptable“ line names the rubric's own target, not a remembered three", () => {
    // sc-maneuver-uturn is „Обръщане в ЕДНО движение" (attemptsFor3Stars: 1);
    // a two-movement turn is OVER that goal and used to be told „целта е в три".
    const twoArcs = turnResult({}, turnDetail(2), true);
    const line = scoreRubric(twoArcs, TURN_RUBRIC).breakdownBg.find((l) => l.id === "economy")!;
    expect(line.points).toBe(1);
    expect(line.detailBg).not.toMatch(/целта е в три/);
    expect(line.detailBg).toBe("2 движения — приемливо, целта е в едно движение.");
  });

  it("a three-point turn still hears three — the fix reads the number, it does not lower it", () => {
    // templates-maneuver.ts SC_MANEUVER_3POINT: 3 / 5. Four movements is the
    // „приемливо" band there, and three IS the goal.
    const threePoint: RubricSpec = {
      economy: { objectiveId: "turn", attemptsFor3Stars: 3, attemptsFor2Stars: 5 },
    };
    const line = scoreRubric(turnResult({}, turnDetail(4), true), threePoint).breakdownBg.find(
      (l) => l.id === "economy",
    )!;
    expect(line.points).toBe(1);
    expect(line.detailBg).toBe("4 движения — приемливо, целта е в 3 движения.");
  });

  // -------------------------------------------------------------------------
  // THE „NOT MEASURED" SENTENCE NAMES A SHAPE THE LESSON ACTUALLY HAS.
  // sweep161 · sc-maneuver-uturn/mobile-wrong: task 1 was never met, so task 2
  // never became current and produced no detail (engine.ts steps only the
  // current objective) — and a boulevard U-turn card told the student „колата
  // не е влизала в очертанията". There is no bay in that lesson.
  // -------------------------------------------------------------------------
  it("a turn that was never reached is not told about bay outlines", () => {
    const neverReached = turnResult({ completedAll: false, passed: false }, undefined, false);
    const line = scoreRubric(neverReached, TURN_RUBRIC).breakdownBg.find((l) => l.id === "economy")!;
    expect(line.measured).toBe(false);
    expect(line.detailBg).not.toMatch(/очертания/);
    expect(line.detailBg).toBe(`Няма измерване — до тази маневра не се стигна. ${NO_QUALITY_MEASURED}`);
  });

  it("a turn that was entered but never turned says corridor, not outlines", () => {
    const enteredOnly = turnResult({ completedAll: false, passed: false }, turnDetail(0), false);
    const line = scoreRubric(enteredOnly, TURN_RUBRIC).breakdownBg.find((l) => l.id === "economy")!;
    expect(line.measured).toBe(false);
    expect(line.detailBg).not.toMatch(/очертания/);
    expect(line.detailBg).toBe(`Няма измерване — завоят не е направен в коридора. ${NO_QUALITY_MEASURED}`);
  });

  it("a PARK that never entered still hears about the outlines — the copy follows the channel", () => {
    // The counter-direction: naming the corridor must not become naming it
    // everywhere. A bay drill keeps the bay sentence.
    const noEntry = makeResult(
      { completedAll: false, passed: false },
      parkDetail({ attempts: 0, inBay: false, alignment: null, centerOffsetM: null, headingOffsetDeg: null }),
    );
    const line = scoreRubric(noEntry, RUBRIC).breakdownBg.find((l) => l.id === "economy")!;
    expect(line.measured).toBe(false);
    expect(line.detailBg).toBe(`Няма измерване — колата не е влизала в очертанията. ${NO_QUALITY_MEASURED}`);
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

  // -------------------------------------------------------------------------
  // A ROW THAT MEASURED NOTHING MUST SAY WHAT THAT COSTS THE STAR ROW.
  //
  // sweep161 · `sc-park-van/mobile-right/08-debrief.png` — „Точност на позицията
  // не се измерва · Икономичност на маневрата не се измерва · Наблюдение не се
  // измерва", and in the same card a star row the harness read as „1 от 3
  // звезди". Three abstentions under a grade, with nothing joining them. The
  // number is not this file's to move (see the fold's note and the ADR it waits
  // on); the silence around it is.
  // -------------------------------------------------------------------------
  it("when NOTHING was measured every abstaining row says the stars are the exam sheet restated", () => {
    // The sc-park-van shape: all three components authored, none of them able
    // to fill — no glance record, and a maneuver that never reached the bay.
    const nothing = makeResult(
      { completedAll: false, passed: false },
      parkDetail({ attempts: 0, inBay: false, alignment: null, centerOffsetM: null, headingOffsetDeg: null }),
    );
    const { breakdownBg } = scoreRubric(nothing, RUBRIC);
    for (const id of ["placement", "economy", "observation"] as const) {
      const line = breakdownBg.find((l) => l.id === id)!;
      expect(line.measured, id).toBe(false);
      expect(line.points, id).toBeNull(); // the „не се измерва" column is KEPT
      expect(line.detailBg, id).toContain(NO_QUALITY_MEASURED);
    }
    // …and never the weaker sentence, which would understate it.
    for (const id of ["placement", "economy", "observation"] as const) {
      expect(breakdownBg.find((l) => l.id === id)!.detailBg, id).not.toContain(NOT_IN_STARS);
    }
  });

  it("when something DID measure, an abstaining row says only that it is out of the fold", () => {
    // The counter-direction: „nothing was measured" must not be printed on a
    // card where placement and economy both scored. Here only наблюдение is
    // missing, and the sentence has to be the smaller, true one.
    const { breakdownBg, stars } = scoreRubric(makeResult(), RUBRIC);
    const obs = breakdownBg.find((l) => l.id === "observation")!;
    expect(obs.measured).toBe(false);
    expect(obs.detailBg).toContain(NOT_IN_STARS);
    expect(obs.detailBg).not.toContain(NO_QUALITY_MEASURED);
    // The grade itself is untouched by any of this copy.
    expect(stars).toBe(3);
  });

  it("a MEASURED row is never given either clause", () => {
    // The blanket-append failure mode: „не влиза в звездите" printed under a
    // row that scored 2/2 is a worse lie than the silence it replaced.
    const { breakdownBg } = scoreRubric(makeResult(), RUBRIC, { observedMomentIds: ["m1", "m2"] });
    for (const line of breakdownBg) {
      if (!line.measured) continue;
      expect(line.detailBg, line.id).not.toContain(NOT_IN_STARS);
      expect(line.detailBg, line.id).not.toContain(NO_QUALITY_MEASURED);
    }
    // Par time reports measured:true and is informational — it must be spared
    // BOTH consequence clauses. It carries its own sentence (below) and that
    // one is neither of these; the pin stays an exact `toBe` on the whole
    // string so „spared" cannot quietly become „spared, plus whatever else
    // somebody appended".
    const par = breakdownBg.find((l) => l.id === "parTime")!;
    expect(par.detailBg).toBe(`75 с — в ориентира от 90 с. ${PAR_NOT_A_TARGET}`);
  });

  // -------------------------------------------------------------------------
  // THE ROW THAT TOLD THE FLAT-OUT DRIVE IT WAS THE RIGHT ONE.
  //
  // MEASURED · w11 · `sc-vu-pass-clearance` (the lesson whose subject IS
  // slowing down beside a vulnerable road user), read off its two
  // `_audit-debrief.json` cards:
  //     pc-wrong  51 s flat out, never met a road user
  //               → „51 с — в ориентира от 60 с."
  //     pc-right  206 s careful → „206 с при ориентир 60 с — спокойно, …"
  // Everything else on the two cards is identical (ИЗДЪРЖАН, 3 наказателни
  // точки, ★★☆, same XP), so this row was the only thing separating them and
  // it separated them the wrong way. `sc-pk-move-off/pc-wrong` — 59 км/ч with
  // the 50 disc live — got the same congratulation: „48 с — в ориентира от
  // 55 с".
  //
  // The number is untouched (doc 76 §6: time never moves a star, and it still
  // does not — `points` stays null and the fold ignores it). What is asserted
  // here is that the UNDER-par side is no longer a bare verdict pointing at
  // speed, and that the OVER-par side — the half that was already right — is
  // byte-identical to what shipped.
  // -------------------------------------------------------------------------
  describe("the ориентир is not a target to beat", () => {
    it("under the ориентир, the row says beating it earns nothing", () => {
      const par = scoreRubric(makeResult(), RUBRIC).breakdownBg.find((l) => l.id === "parTime")!;
      expect(par.detailBg).toContain("75 с — в ориентира от 90 с.");
      expect(par.detailBg).toContain(PAR_NOT_A_TARGET);
      // THEO-4: the reason, not just the refusal — the card names what sets a
      // safe speed instead of leaving „не е цел" as another bare verdict.
      expect(par.detailBg).toContain("Безопасната скорост я определя пътят");
      // And it is still informational: no points, no star.
      expect(par.points).toBeNull();
      expect(scoreRubric(makeResult(), RUBRIC).stars).toBe(
        scoreRubric(makeResult(), { ...RUBRIC, parTimeSec: 1 }).stars,
      );
    });

    it("over the ориентир the line is byte-identical to what shipped", () => {
      // The half that already carried the north-star sentence. Changing it
      // would also break `lessons/__tests__/b15-lawful-wait.test.ts`, which
      // pins it with its own exact `toBe` — pinned here too so a lane editing
      // this file sees it without having to find that suite.
      const slow = makeResult({ durationSec: 200 });
      const par = scoreRubric(slow, RUBRIC).breakdownBg.find((l) => l.id === "parTime")!;
      expect(par.detailBg).toBe("200 с при ориентир 90 с — спокойно, точността е преди скоростта.");
      expect(par.detailBg).not.toContain(PAR_NOT_A_TARGET);
    });
  });

  // -------------------------------------------------------------------------
  // AN ABORTED DRIVE HAS NOT DRIVEN THE ROUTE THE ОРИЕНТИР DESCRIBES.
  //
  // MEASURED · w11 · 59 lanes end with «Урокът беше прекъснат преди края» and
  // every one of them also printed „N с при ориентир M с" — two surfaces of one
  // result screen disagreeing about the same drive. This lane's own exhibit is
  // `sc-vp-readiness/pc-wrong`: „259 с при ориентир 55 с" on a drive that
  // reached neither of its two checkpoints.
  // -------------------------------------------------------------------------
  describe("a lesson that was cut short is not billed against the whole-route ориентир", () => {
    const abortedPar = (over: Partial<LessonResult> = {}) =>
      scoreRubric(makeResult({ aborted: true, completedAll: false, passed: false, ...over }), RUBRIC)
        .breakdownBg.find((l) => l.id === "parTime")!;

    it("names the time as time-until-the-abort and refuses the comparison, with a reason", () => {
      const par = abortedPar({ durationSec: 259 });
      expect(par.detailBg).toContain("259 с до прекъсването");
      expect(par.detailBg).not.toContain("при ориентир");
      expect(par.detailBg).not.toContain("в ориентира");
      expect(par.detailBg).toContain("не стигна до края");
      // THEO-4: a withheld comparison still owes the student the way to get it.
      expect(par.detailBg).toContain("Карай маршрута докрай");
    });

    it("BOTH numbers stay on the card — refusing a comparison is not hiding one", () => {
      // The failure mode this branch is one keystroke away from: a mismatch
      // somebody filed a row about, quietly deleted instead of explained.
      const par = abortedPar({ durationSec: 259 });
      expect(par.detailBg).toContain("259 с");
      expect(par.detailBg).toContain("90 с"); // RUBRIC.parTimeSec
    });

    it("a drive that ENDED — however badly — keeps its comparison exactly as filed", () => {
      // sc-ln-decisive-change:5c5e69a6 („175 с срещу ориентир 60 с") ended
      // naturally with a task unmet. Its comparison is real and must survive:
      // an unfinished OBJECTIVE is not an unfinished DRIVE.
      const par = scoreRubric(
        makeResult({ durationSec: 175, completedAll: false, passed: false, aborted: false }),
        { parTimeSec: 60 },
      ).breakdownBg.find((l) => l.id === "parTime")!;
      expect(par.detailBg).toBe("175 с при ориентир 60 с — спокойно, точността е преди скоростта.");
    });

    it("the lawful-wait subtraction still applies, and the star is still untouched", () => {
      const par = abortedPar({ durationSec: 211, yieldWaitSec: 47 });
      expect(par.detailBg).toContain("164 с до прекъсването");
      expect(par.detailBg).toContain("47 с чакане на предимство не се броят");
      expect(par.points).toBeNull();
      // An aborted session is floored at one star by the cap, not by this row.
      expect(scoreRubric(makeResult({ aborted: true }), RUBRIC).stars).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // THE ONLY ROW IN THE PRODUCT THAT GRADES MIRRORS AND THE SHOULDER CHECK.
  //
  // It used to print „Все още не се измерва в този режим." — stale (the glance
  // channel IS wired: LessonPlayShell `finalize` → parkingObservationFromTrace,
  // and simulator/actions.ts re-reads wire.observedMomentIds), misleading („в
  // този режим" implies another mode looks), and empty of teaching on the one
  // card where a student who moved off without a mirror needs some.
  // -------------------------------------------------------------------------
  it("the unmeasured observation row names the glances the examiner watches", () => {
    const obs = scoreRubric(makeResult(), RUBRIC).breakdownBg.find((l) => l.id === "observation")!;
    expect(obs.detailBg).not.toContain("Все още не се измерва в този режим");
    expect(obs.detailBg).toContain("Огледала преди задна"); // RUBRIC moment m1
    expect(obs.detailBg).toContain("Поглед през рамо"); // RUBRIC moment m2
  });

  it("the unmeasured observation row states a REASON and blames the record, not the student", () => {
    // The row's own note promises „the reason"; the first version of this copy
    // opened «Оглеждането ти не стигна до оценката на това каране» — subject:
    // the student's looking — and gave no cause at all. On the twelve
    // non-parking templates that author glance moments,
    // `parkingObservationFromTrace` returns null forever (no reverse phase), so
    // that sentence is what a student who checked both mirrors and his shoulder
    // reads every single time. THEO-4: never a bare verdict, and a soft
    // negative with no cause is one.
    const obs = scoreRubric(makeResult(), RUBRIC).breakdownBg.find((l) => l.id === "observation")!;
    // Opens like its two siblings, so the three rows read as one card.
    expect(obs.detailBg.startsWith("Няма измерване — ")).toBe(true);
    // The cause is named…
    expect(obs.detailBg).toContain("симулаторът не отчете погледите ти");
    // …and so is whose limitation it is — the record's, not the student's.
    expect(obs.detailBg).toContain("ограничение на записа, а не бележка към теб");
    // And it never says the student's looking fell short — the product cannot
    // know that here.
    expect(obs.detailBg).not.toContain("Оглеждането ти не стигна");
    // The teaching the previous pass added is still there.
    expect(obs.detailBg).toContain("Провери се сам");
    expect(obs.measured).toBe(false);
    expect(obs.points).toBeNull();
  });

  it("sc-vp-handbrake: the shipped rubric teaches its two moments when it cannot grade them", () => {
    // The lesson behind sc-vp-handbrake:1f2f7463 — „потегляне с вдигната ръчна"
    // — is the one cockpit scenario that authors an observation component, and
    // its two moments are exactly what the student is failing to do.
    const obs = scoreRubric(
      makeResult({ completedAll: false, passed: false }),
      SC_VP_HANDBRAKE.rubric!,
    ).breakdownBg.find((l) => l.id === "observation")!;
    expect(obs.measured).toBe(false);
    expect(obs.detailBg).toContain("Поглед в огледалото, преди колата да тръгне");
    expect(obs.detailBg).toContain("Поглед през ляво рамо в мъртвата зона");
    expect(obs.detailBg).toContain(NO_QUALITY_MEASURED);
  });

  it("sc-park-van: the shipped rubric prints the provenance sentence on all three rows", () => {
    // sc-park-van:3bf9c933, from the spec the frame was taken of.
    const spec = SCENARIO_TEMPLATES_PARKING3.find((s) => s.id === "sc-park-van")!;
    const { breakdownBg } = scoreRubric(
      makeResult(
        { completedAll: false, passed: false },
        parkDetail({ attempts: 0, inBay: false, alignment: null, centerOffsetM: null, headingOffsetDeg: null }),
      ),
      spec.rubric!,
    );
    expect(breakdownBg.map((l) => l.id)).toEqual(["placement", "economy", "observation", "parTime"]);
    for (const id of ["placement", "economy", "observation"] as const) {
      expect(breakdownBg.find((l) => l.id === id)!.detailBg, id).toContain(NO_QUALITY_MEASURED);
    }
    expect(breakdownBg.find((l) => l.id === "observation")!.detailBg).toContain(
      "Втори поглед към страната на буса",
    );
  });

  it("an observation component with no authored moments is not told to check nothing", () => {
    // The empty-moments arm must not print „Провери се сам по: " with an empty
    // list after it — a sentence that reads as a bug to a 17-year-old.
    const obs = scoreRubric(makeResult(), { observation: { moments: [] } }).breakdownBg.find(
      (l) => l.id === "observation",
    )!;
    expect(obs.detailBg).not.toContain("Провери се сам");
    expect(obs.detailBg).toBe(
      `Този урок не е задал контролни погледи, затова няма какво да се измери тук. ${NO_QUALITY_MEASURED}`,
    );
  });

  it("is pure: identical inputs → identical output", () => {
    const a = scoreRubric(makeResult(), RUBRIC, { observedMomentIds: ["m1"] });
    const b = scoreRubric(makeResult(), RUBRIC, { observedMomentIds: ["m1"] });
    expect(a).toEqual(b);
  });
});
