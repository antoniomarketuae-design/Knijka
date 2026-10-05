/**
 * sc-jx-priority-confidence — NOBODY ON THIS ROAD HAS PRIORITY OVER THE
 * STUDENT, SO NOTHING HE DOES ON IT IS «ПРАВИЛНО ОТСТЪПЕНО ПРЕДИМСТВО»
 * (audit `sc-jx-priority-confidence:9c987e7b`, the commendation clause).
 *
 * THE ROW'S FRAME. `.audit-frames/sweep161/sc-jx-priority-confidence/pc-right`
 * (2026-08-17, L1): «top 15 км/ч · 14 full stops», 135 s against a 40 s par,
 * and «Похвали ✓ Правилно отстъпено предимство 1:47» — praise for yielding on
 * the road where the student HOLDS priority.
 *
 * WHAT MINTED IT, measured rather than reasoned (the run this file is):
 *
 *  · L1, the photographed drive — the WAITER. On 2026-08-17 `sc-jxpc-waiter`
 *    authored `junctionControl: "stopLine"`, so `PriorityFromRightRunner`
 *    pushed `{prioritySituation, give-way, yielded}` itself once the car it
 *    had released cleared the box. That key was moved to "uncontrolled" on
 *    2026-09-13 (9aec4c5). §3 below replays a tape of the photographed shape
 *    (14 halts, ≤ 15 км/ч, ~132 s) against the waiter AS IT SHIPPED THAT DAY
 *    and gets the praise back, then against today's waiter and gets none —
 *    so the L1 trigger is reproduced AND shown dead, not assumed dead because
 *    one tape happened to miss it.
 *
 *  · L5, still live before this change — the CREEPER. `sc-jxpc-creeper` kept
 *    `"stopLine"`, and its `lineDistM: 34` (a commit-distance dial, not a
 *    line) moves the runner's «yield pose» to 32–48 m from the node. Any car
 *    that is at ≤ 8 км/ч for one second anywhere in that band while the
 *    creeper crosses is praised: the stop-and-go tape's halts at x = −45 and
 *    −35 (t = 51.77), a single 2 s halt at x = −40, a 6 км/ч crawl with no
 *    halt at all — and a 6 s stop at x = −45 that the same debrief REFUSES as
 *    «Спиране без причина по пътя с предимство».
 *
 * WHY IT IS NOT A YIELD — the positive evidence A12 asks for before praise is
 * withdrawn. The pooled card says «Пропусна превозното средство с
 * предимство». Both stem cars approach tj-n-c along `tj-e-s`, and the BUILT
 * world (`createWorldRuntime(tj-stop-v1).debugStopLines()`) puts the node's
 * only sign line — a Б2 — on that very edge. The car is the one that owes way
 * (ЗДвП чл. 50, ал. 1; the Б2 face in content/signs: «Спри! Пропусни
 * движещите се по пътя с предимство!»). There is no vehicle with priority
 * over the student anywhere on this route, on any rung — the census beside
 * this file (`yield-praise-needs-a-priority-vehicle.test.ts`) measures it on
 * the built world for every staged priority car in the catalogue.
 *
 * WHAT IS KEPT. The creeper still crosses, the wait is still RECORDED (the
 * runner's outcome stays «yielded» on the measurement channel), a wait for it
 * is still NOT billed as a needless stop, and a genuine yield — the mirror
 * drill `sc-junction-gap`, where the student is the one behind the Б2 — is
 * still commended. Only the sentence that names a priority nobody held is gone.
 *
 * THEO-4 (how this serves the virtual-instructor rule): the lesson's own
 * instruction 2 says «не ѝ отстъпвай: тя е длъжна да спре и да те пропусне».
 * A debrief that then praises «правилно отстъпено предимство» for the same
 * car explains the opposite decision — and so did the L5 briefing line, which
 * told the student this car «има предимство» (§5).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LessonSpec, StagedEventSpec } from "../../../contracts";
import { recordScriptedDrive, type DriveScript } from "../../../traces/recorder";
import { SC_JX_PRIORITY_CONFIDENCE_RECORDINGS } from "../../../traces/scJxPriorityConfidence";
import { SC_JUNCTION2_RECORDINGS } from "../../../traces/scJunctions2";
import type { SimTick } from "../../../rules/types";
import { buildDebrief } from "../../debrief";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { compileScenario, resolveScenarioComplication } from "../compile";
import { SC_JUNCTION_GAP } from "../templates-junctions2";
import {
  SC_JX_PRIORITY_CONFIDENCE,
  SC_JX_PRIO_CREEPER,
  SC_JX_PRIO_TAILGATER,
  SC_JX_PRIO_WAITING_CAR,
} from "../templates-junctions3";
import type { ScenarioLevel, ScenarioSpec } from "../types";
import { liveChainReplay, type LiveReplayOutcome } from "./liveChainReplay";
import { driveLiveRung, loadDistrict, type LiveRungOutcome } from "./witnessLiveRung";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const DISTRICT = loadDistrict("tj-stop-v1");

/** The player's eastbound lane on the priority arm (scJxPriorityConfidence.ts). */
const Y = -4.0625;
const YIELD = "YIELDED_TO_PRIORITY";
const NEEDLESS = "STOPPED_WITHOUT_CAUSE";
const PRAISE_TITLE = "Правилно отстъпено предимство";
const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4, 5];
/** The practice rungs, where the lesson's own mistake refuses the lesson (ADR-009). */
const PRACTICE: readonly ScenarioLevel[] = [1, 2, 3, 5];

// ---------------------------------------------------------------------------
// The tapes
// ---------------------------------------------------------------------------

/** Halt at each x for `pauseSec`, rolling between halts at `kmh`, then drive out to x = 75. */
function stopAndGo(xs: readonly number[], kmh: number, pauseSec: number): DriveScript {
  const steps: DriveScript["steps"] = [{ kind: "drive", points: [[-135, Y]], targetKmh: kmh }];
  let prev = -135;
  for (const x of xs) {
    steps.push({ kind: "drive", points: [[prev, Y], [x, Y]], targetKmh: kmh, stopAtEnd: true });
    steps.push({ kind: "pause", sec: pauseSec, brake: true });
    prev = x;
  }
  steps.push({ kind: "drive", points: [[prev, Y], [75, Y]], targetKmh: kmh });
  return { steps };
}

/** jx-priority-confidence-add-stops.test.ts's own tape, verbatim: twelve 3 s halts at 18 км/ч. */
const STOP_AND_GO_XS = [-120, -105, -90, -75, -60, -45, -35, -24, 14, 24, 34, 44];
const STOP_AND_GO = (): DriveScript => stopAndGo(STOP_AND_GO_XS, 18, 3);

/**
 * THE PHOTOGRAPHED SHAPE (sweep161 pc-right, log.txt:631/694): «top 15 км/ч ·
 * 14 full stops», 135 s. No poses were recorded on that sweep — only the 5 s
 * speed beats (14, 0, 11, 2, 0, 11, 6, 0, 10, 10, 0, …) — so the tape is built
 * to the log's own summary: fourteen 5 s halts 13.5 m apart at 14 км/ч, two of
 * them in the mouth (x = −15.5 and −2).
 */
const CRAWL_XS = Array.from({ length: 14 }, (_, k) => -123.5 + 13.5 * k);
const CRAWL = (): DriveScript => stopAndGo(CRAWL_XS, 14, 5);

/** Cruise, brake to rest at x, wait `sec`, drive on (the add-stops file's `defensive`). */
const waitAt = (x: number, sec: number): DriveScript => ({
  steps: [
    { kind: "drive", points: [[-135, Y]], targetKmh: 46 },
    { kind: "drive", points: [[-135, Y], [-70, Y]], targetKmh: 46 },
    { kind: "drive", points: [[-70, Y], [x, Y]], targetKmh: 31, stopAtEnd: true },
    { kind: "pause", sec, brake: true },
    { kind: "drive", points: [[x, Y], [75, Y]], targetKmh: 40 },
  ],
});

/** No halt at all: roll from x = −70 to −20 at `kmh`, then drive on. */
const crawlThrough = (kmh: number): DriveScript => ({
  steps: [
    { kind: "drive", points: [[-135, Y]], targetKmh: 46 },
    { kind: "drive", points: [[-135, Y], [-70, Y]], targetKmh: 46 },
    { kind: "drive", points: [[-70, Y], [-20, Y]], targetKmh: kmh },
    { kind: "drive", points: [[-20, Y], [75, Y]], targetKmh: 40 },
  ],
});

// ---------------------------------------------------------------------------
// The chains
// ---------------------------------------------------------------------------

interface Witness {
  /** The recorder-wired rung (witnessLiveRung.ts). */
  rung: LiveRungOutcome;
  /** The same poses through LessonScene's stack (liveChainReplay.ts). */
  live: LiveReplayOutcome;
}

/** One act through one rung, on both witness harnesses. */
function witness(spec: ScenarioSpec, level: ScenarioLevel, script: DriveScript): Witness {
  const rung = driveLiveRung(spec, level, script, { collisionMinKmh: 0 });
  const live = liveChainReplay({
    lesson: rung.lesson,
    districtRaw: DISTRICT,
    trace: rung.drive.trace,
    holdAfterSec: 2,
  });
  return { rung, live };
}

/** The add-stops file's own chain: seed 7, no ambient street, the rung's staged cast. */
function tapeChain(level: ScenarioLevel, script: DriveScript) {
  const lesson = compileScenario(SC_JX_PRIORITY_CONFIDENCE, level);
  let session = createLessonSession(lesson);
  const ticks: SimTick[] = [];
  recordScriptedDrive(DISTRICT, script, {
    scenarioId: SC_JX_PRIORITY_CONFIDENCE.id,
    kind: "mistake",
    seed: 7,
    stagedEvents: [...(lesson.stagedEvents ?? [])] as StagedEventSpec[],
    collisionMinKmh: 0,
    onTick: (tick) => {
      ticks.push(tick);
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);
  return {
    session,
    result,
    ticks,
    debrief: buildDebrief(lesson, result, { coachedMistakes: result.coachedMistakes }).text,
  };
}

const commendations = (events: readonly { kind: string; code: string }[]): string[] =>
  events.filter((e) => e.kind === "commendation").map((e) => e.code);

/** Every `prioritySituation` a drive's ticks carried, with where the student was. */
function prioritySituations(ticks: readonly SimTick[]) {
  return ticks.flatMap((t) =>
    t.events
      .filter((e) => e.kind === "prioritySituation")
      .map((e) => ({ t: Number(t.t.toFixed(2)), x: Number(t.position.x.toFixed(1)), ...e })),
  );
}

/** What the student is shown: no yield praise on any surface the chain feeds. */
function expectNoYieldPraise(w: Witness, label: string): void {
  // The ledger both the end screen's «Похвали» and the server rebuild read.
  expect(commendations(w.rung.session.events), `${label} · rung ledger`).not.toContain(YIELD);
  expect(w.live.commendationCodes, `${label} · live ledger`).not.toContain(YIELD);
  expect(
    w.rung.result.summary.commendations.map((c) => c.code),
    `${label} · summary`,
  ).not.toContain(YIELD);
  // …and the SOURCE: no runner and no runtime tracker reported a yield at all.
  expect(
    prioritySituations(w.rung.ticks).filter((e) => "yielded" in e && e.yielded),
    `${label} · tick events`,
  ).toEqual([]);
  // «Какво се получи добре: • Правилно отстъпено предимство» (debrief.ts).
  expect(w.rung.debrief, `${label} · debrief`).not.toContain(PRAISE_TITLE);
  expect(w.live.debrief, `${label} · live debrief`).not.toContain(PRAISE_TITLE);
}

function haltsOf(ticks: readonly SimTick[]): { count: number; peakKmh: number } {
  let count = 0;
  let resting = true;
  let peakKmh = 0;
  for (const tk of ticks) {
    peakKmh = Math.max(peakKmh, tk.speedKmh);
    if (tk.speedKmh < 0.5) {
      if (!resting) count++;
      resting = true;
    } else {
      resting = false;
    }
  }
  return { count, peakKmh };
}

// ---------------------------------------------------------------------------
// §1 — the stop-and-go tape, every rung
// ---------------------------------------------------------------------------

describe("§1 · the stop-and-go tape (the add-stops chain) carries no yield praise on any rung", () => {
  for (const level of LEVELS) {
    describe(`L${level}`, () => {
      const tape = tapeChain(level, STOP_AND_GO());
      const w = witness(SC_JX_PRIORITY_CONFIDENCE, level, STOP_AND_GO());

      it("the add-stops chain itself (seed 7): no YIELDED_TO_PRIORITY, no «Правилно отстъпено предимство»", () => {
        expect(commendations(tape.session.events)).not.toContain(YIELD);
        expect(prioritySituations(tape.ticks)).toEqual([]);
        expect(tape.debrief).not.toContain(PRAISE_TITLE);
      });

      it("the compiled rung at the live seed, and the same poses through LessonScene's stack: none either", () => {
        expectNoYieldPraise(w, `L${level}`);
        expect(w.live.ambientContacts, "no ambient car was driven through").toEqual([]);
      });

      it("…and the drive is still refused for what it did (1988426 is not undone)", () => {
        if (level === 4) {
          // The exam rung has no «lesson mistake» channel (ADR-009): the same
          // act is charged on the изпитен лист instead — as on base.
          expect(w.rung.scored).toContain(NEEDLESS);
          return;
        }
        expect((tape.result.lessonMistakes ?? []).map((m) => m.code)).toEqual([NEEDLESS]);
        expect((w.rung.result.lessonMistakes ?? []).map((m) => m.code)).toEqual([NEEDLESS]);
        expect(w.rung.result.passed).toBe(false);
        expect(w.rung.debrief).toContain("Грешката на този урок");
        expect(w.rung.debrief).toContain("Спиране без причина по пътя с предимство");
      });
    });
  }

  it("L5 is the rung the row's verifier measured: the creeper is in the cast and did cross", () => {
    const w = witness(SC_JX_PRIORITY_CONFIDENCE, 5, STOP_AND_GO());
    expect((w.rung.lesson.stagedEvents ?? []).map((s) => s.id)).toEqual([
      "sc-jxpc-waiter",
      "sc-jxpc-tail",
      "sc-jxpc-creeper",
    ]);
    // The encounter happened and resolved as a wait — it is not that the car
    // never came. Only the praise is absent.
    const creeper = w.rung.drive.outcomes.find((o) => o.eventId === "sc-jxpc-creeper");
    expect(creeper).toMatchObject({ success: true, detail: "yielded" });
  });
});

// ---------------------------------------------------------------------------
// §2 — L5: every way the creeper used to mint the praise
// ---------------------------------------------------------------------------

describe("§2 · L5 — nothing done for the car that ran its Б2 is «отстъпено предимство»", () => {
  it("the product no longer praises and refuses ONE stop: 6 s at x = −45", () => {
    // On base this single halt was «✓ Правилно отстъпено предимство 0:23» AND
    // «Грешката на този урок: Спиране без причина по пътя с предимство».
    const w = witness(SC_JX_PRIORITY_CONFIDENCE, 5, waitAt(-45, 6));
    expect((w.rung.result.lessonMistakes ?? []).map((m) => m.code)).toEqual([NEEDLESS]);
    expect(w.rung.result.passed).toBe(false);
    expectNoYieldPraise(w, "wait(-45, 6)");
  });

  for (const [x, sec] of [
    [-40, 6],
    [-36, 6],
    [-40, 2],
  ] as const) {
    it(`a ${sec} s halt ${-x} m short of the node while the creeper crosses: not praised, not billed, passed — as today minus the praise`, () => {
      const w = witness(SC_JX_PRIORITY_CONFIDENCE, 5, waitAt(x, sec));
      expectNoYieldPraise(w, `wait(${x}, ${sec})`);
      // The needless-stop detector's own acquittal (a body in the corridor
      // within 45 m, 1988426) is untouched: waiting for him is not the fault.
      expect(w.rung.result.lessonMistakes ?? []).toEqual([]);
      expect(w.rung.coached).not.toContain(NEEDLESS);
      expect(w.rung.result.passed).toBe(true);
      // …and the wait is still MEASURED: the encounter resolves «yielded».
      const creeper = w.rung.drive.outcomes.find((o) => o.eventId === "sc-jxpc-creeper");
      expect(creeper).toMatchObject({ success: true, detail: "yielded" });
    });
  }

  it("a 6 км/ч crawl with no halt at all used to collect it too", () => {
    const w = witness(SC_JX_PRIORITY_CONFIDENCE, 5, crawlThrough(6));
    expectNoYieldPraise(w, "crawl(6)");
  });

  it("the two waits the add-stops file protects stay unbilled and unpraised", () => {
    for (const [x, sec] of [
      [-12, 10],
      [-30, 8],
    ] as const) {
      const w = witness(SC_JX_PRIORITY_CONFIDENCE, 5, waitAt(x, sec));
      expect(w.rung.result.lessonMistakes ?? [], `wait(${x}, ${sec})`).toEqual([]);
      expect(w.rung.result.passed, `wait(${x}, ${sec})`).toBe(true);
      expectNoYieldPraise(w, `wait(${x}, ${sec})`);
    }
  });
});

// ---------------------------------------------------------------------------
// §3 — the LIVE L1 trigger, reproduced and shown dead
// ---------------------------------------------------------------------------

describe("§3 · the photographed L1 drive (sweep161 pc-right, 2026-08-17)", () => {
  /** The cast as it shipped on the day of the frame: the waiter still «stopLine». */
  const AS_SHIPPED_2026_08_17: ScenarioSpec = {
    ...SC_JX_PRIORITY_CONFIDENCE,
    staged: [{ ...SC_JX_PRIO_WAITING_CAR, junctionControl: "stopLine" }, SC_JX_PRIO_TAILGATER],
  };

  it("the tape is the drive in the log: 14 full stops, top ≤ 15 км/ч, 120–140 s, both tasks, no contact", () => {
    const w = witness(SC_JX_PRIORITY_CONFIDENCE, 1, CRAWL());
    const h = haltsOf(w.rung.ticks);
    expect(h.count).toBe(14);
    expect(h.peakKmh).toBeLessThanOrEqual(15);
    expect(w.rung.result.durationSec).toBeGreaterThan(120);
    expect(w.rung.result.durationSec).toBeLessThan(140);
    expect(w.rung.done).toEqual({ "sc-jxpc-approach": true, "sc-jxpc-cross": true });
    expect(w.rung.scored).not.toContain("COLLISION");
  });

  it("CONTROL — against the waiter as it shipped that day, this tape DOES mint the praise", () => {
    // So the tape reaches the trigger: its silence below is the product's, not the tape's.
    const w = witness(AS_SHIPPED_2026_08_17, 1, CRAWL());
    const yields = prioritySituations(w.rung.ticks).filter((e) => "yielded" in e && e.yielded);
    expect(yields).toHaveLength(1);
    expect(yields[0]).toMatchObject({ situation: "give-way", yielded: true });
    // After the node-side halts, late in the drive — the log's «1:47».
    expect(yields[0]!.t).toBeGreaterThan(85);
    expect(yields[0]!.t).toBeLessThan(110);
    expect(commendations(w.rung.session.events)).toEqual([YIELD]);
    expect(w.rung.debrief).toContain(`• ${PRAISE_TITLE}`);
  });

  for (const level of LEVELS) {
    it(`L${level}: the same tape against today's cast earns no yield praise`, () => {
      expectNoYieldPraise(witness(SC_JX_PRIORITY_CONFIDENCE, level, CRAWL()), `crawl L${level}`);
    });
  }

  it("the template's own cast can never mint it: neither stem car's runner may commend a yield", () => {
    for (const car of [SC_JX_PRIO_WAITING_CAR, SC_JX_PRIO_CREEPER]) {
      expect(car.junctionControl, car.id).toBe("uncontrolled");
    }
    for (const level of LEVELS) {
      const cast = compileScenario(SC_JX_PRIORITY_CONFIDENCE, level).stagedEvents ?? [];
      for (const s of cast) {
        if (s.kind !== "priorityFromRight") continue;
        expect(s.junctionControl, `L${level} ${s.id}`).toBe("uncontrolled");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// §4 — positive controls
// ---------------------------------------------------------------------------

describe("§4 · controls — what was earned before is earned now", () => {
  /**
   * Measured on base (30da9e4) through this same chain. The shadow script is
   * the L1–L4 drive; on L5 it meets the creeper at 46 км/ч, which is that
   * rung's blind-priority mistake — recorded here as it grades, not as a claim
   * that it should.
   */
  const SHADOW_ON_BASE: Record<number, { passed: boolean; scored: string[]; commendations: string[] }> = {
    1: { passed: true, scored: [], commendations: [] },
    2: { passed: true, scored: [], commendations: [] },
    3: { passed: true, scored: [], commendations: [] },
    4: { passed: true, scored: [], commendations: [] },
    5: { passed: false, scored: ["COLLISION", "HEADLIGHTS_OFF_IN_RAIN"], commendations: [] },
  };

  for (const level of LEVELS) {
    it(`the shadow-correct drive at L${level} keeps exactly what it earned on base`, () => {
      const rung = driveLiveRung(
        SC_JX_PRIORITY_CONFIDENCE,
        level,
        SC_JX_PRIORITY_CONFIDENCE_RECORDINGS["shadow-correct"].script(),
        { collisionMinKmh: 0 },
      );
      expect({
        passed: rung.result.passed,
        scored: rung.scored,
        commendations: commendations(rung.session.events),
      }).toEqual(SHADOW_ON_BASE[level]);
      expect(prioritySituations(rung.ticks)).toEqual([]);
    });
  }

  for (const level of [1, 5] as const) {
    it(`a GENUINE yield is still commended — sc-junction-gap L${level}, the student behind the Б2`, () => {
      // The mirror seat: there the student is the one the sign obliges, the
      // crossing car really has priority, and the runner's own commendation
      // (the same `junctionControl: "stopLine"` branch) must still fire.
      const lesson: LessonSpec = compileScenario(SC_JUNCTION_GAP, level);
      const raw = JSON.parse(
        readFileSync(path.join(REPO_ROOT, "content", "world", `${SC_JUNCTION_GAP.map.districtId}.json`), "utf-8"),
      ) as unknown;
      const rec = SC_JUNCTION2_RECORDINGS["sc-junction-gap"].drives["shadow-correct"]!;
      const drive = recordScriptedDrive(raw, rec.script(), {
        scenarioId: SC_JUNCTION_GAP.id,
        kind: "shadow",
        seed: 7,
        stagedEvents: (lesson.stagedEvents ?? []) as StagedEventSpec[],
        collisionMinKmh: 0,
      });
      const out = liveChainReplay({ lesson, districtRaw: raw, trace: drive.trace, holdAfterSec: 3 });
      expect(out.commendationCodes).toContain(YIELD);
      expect(out.debrief).toContain(`• ${PRAISE_TITLE}`);
      expect(out.result.passed).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// §5 — the L5 briefing told him the car HAD priority
// ---------------------------------------------------------------------------

describe("§5 · the L5 briefing names the car truthfully (THEO-4)", () => {
  const c5 = resolveScenarioComplication(SC_JX_PRIORITY_CONFIDENCE, 5)!;
  const briefing5 = compileScenario(SC_JX_PRIORITY_CONFIDENCE, 5).briefingBg ?? [];

  it("no rung of this lesson tells the student a car from the side «има предимство»", () => {
    for (const level of LEVELS) {
      const lesson = compileScenario(SC_JX_PRIORITY_CONFIDENCE, level);
      // `briefingBg` is the compiled surface: the rung's line, then the
      // template's own numbered steps (compile.ts).
      const shown = (lesson.briefingBg ?? []).map((s) => s.textBg).join("\n");
      expect(shown.length, `L${level}`).toBeGreaterThan(200);
      expect(shown, `L${level}`).not.toContain("която има предимство");
    }
    // …and the debrief repeats the briefing («Правилото на този урок»), so the
    // refused stop-and-go drive no longer reads the two against each other.
    const w = witness(SC_JX_PRIORITY_CONFIDENCE, 5, STOP_AND_GO());
    expect(w.rung.debrief).not.toContain("която има предимство");
  });

  it("the rung's line says what the car is: obliged to let him pass, and it goes anyway", () => {
    expect(briefing5[0]!.textBg).toContain(c5.coachBg);
    expect(c5.coachBg).toContain("длъжна да те пропусне");
    expect(c5.coachBg).toContain("Б2 „Спри!“");
    // The lamp duty the rain rung grades is still stated (level-complication's L10 rule).
    expect(c5.coachBg).toMatch(/светлини/);
    // The rain sentence is the ladder's own reviewed copy, kept verbatim.
    expect(c5.coachBg.startsWith("Вече вали: включи чистачките и късите светлини")).toBe(true);
  });

  it("it declares exactly the delta the compiler measures for this rung", () => {
    const auto = resolveScenarioComplication(
      { ...SC_JX_PRIORITY_CONFIDENCE, levels: SC_JX_PRIORITY_CONFIDENCE.levels.map((l) => ({ ...l, complication: undefined })) },
      5,
    )!;
    expect([...c5.adds].sort()).toEqual([...auto.adds].sort());
    expect(c5.titleBg).toBe(auto.titleBg);
  });

  it("every article it cites is in the content bank, and says what the line says (ADR-002 retrieval)", () => {
    expect(c5.lawRef).toBe("ЗДвП чл. 70; чл. 20, ал. 2; чл. 50, ал. 1");
    const zdvp = JSON.parse(
      readFileSync(path.join(REPO_ROOT, "content", "law", "acts", "zdvp.json"), "utf-8"),
    ) as { units: Array<{ ref: string; textBg: string }> };
    const unit = (ref: string) => zdvp.units.find((u) => u.ref === ref)?.textBg ?? "";
    // «длъжна да те пропусне»
    expect(unit("чл. 50")).toContain(
      "водачите на пътни превозни средства от другите пътища са длъжни да пропуснат пътните превозни средства, които се движат по пътя с предимство",
    );
    // «намали навреме»
    expect(unit("чл. 20")).toContain("Когато възникне опасност за движението, водачите са длъжни незабавно да намалят скоростта");
    // «късите светлини»
    expect(unit("чл. 70")).toContain("с включени къси или дълги светлини");
    // …and the sign face is the bank's, not recalled.
    const signs = readFileSync(path.join(REPO_ROOT, "content", "signs", "signs.json"), "utf-8");
    expect(signs).toContain('"code": "Б2"');
    expect(signs).toContain("Спри! Пропусни движещите се по пътя с предимство!");
  });
});
