/**
 * NOTHING WAS STRUCK ON THE WAY HERE — `requireNoContact`, the fifth
 * ReachZoneWitnessDemand (sc-hazard-obstacle:0f31ccfb, wave 2).
 *
 * THE FRAME THIS FILE IS CUT FROM (`w11/frames/sc-hazard-obstacle__pc-wrong/
 * 08-debrief-p5.png`): «✓ Задмини обекта и продължи напред 0:43» — seven
 * seconds after «✓ Приближи обекта с контролирана скорост 0:36» — on a leg
 * whose own steering block reads „0 trace commands — THIS DRIVE DID NOT STEER",
 * wheel never touched, throttle flat at 57–59 км/ч. `sc-obs-cleared` was a bare
 * disc at (4.06, 178) r 12 with no contact term of any kind, so arrival was the
 * whole certificate.
 *
 * WHY THE PREVIOUS ROUND DID NOT CLOSE IT, and this is the half worth
 * remembering: it retitled the objective DOWN — «Задмини обекта, без да го
 * закачиш» became «Задмини обекта и продължи напред» — because an honest title
 * was the only thing a template file could ship, and left
 * `scenario/__tests__/hazard-obstacle-claims.test.ts` standing so the promise
 * could not come back without a gate. The SENTENCE stopped over-claiming; the
 * TICK did not change at all. `COLLISION` is `terminateSession`, and
 * terminating ends the SHEET rather than the drive (Наредба № 38 чл. 48), so
 * the student who clipped the obstacle drove the remaining 48 m and collected
 * the tick anyway.
 *
 * THE CHANNEL WAS ALREADY ON THE LEDGER, exactly as it was for the person
 * demand one entry above it: `tick.events` carries `{kind:"collision",
 * withWhat}` (worldRuntime `pushCollision` ← `LessonScene handleCollision`),
 * `rules/engine.ts` bills it per struck body, and `lessons/engine.ts` already
 * folded „did this drive strike a PERSON" into the objective context. Only the
 * wider read and the forwarding were missing.
 *
 * ENGINE-LEVEL ON PURPOSE. §3 drives `applyTick` — the entry point
 * `LessonPlayShell.tsx` itself calls — because the whole lesson of this
 * programme is that a gate nothing routes to is not a repair. The mutation is a
 * single conjunct: drop `contactOk` from `done` in `stepReachZone`, or drop the
 * `struckABodyInRun` forwarding in `applyTick`, and every „REFUSED" case here
 * goes green.
 *
 * WHAT THIS GATE STILL DOES NOT WITNESS, stated so no later round reads it as
 * more: it refuses a tick to a drive that STRUCK something. It does not certify
 * that the car went ROUND the obstacle. The un-steered leg above passes through
 * the disc at 59 км/ч having hit nothing (the stalled car sits curb-side of an
 * 8.125 m lane) and still ticks. The avoidance itself needs a lateral term no
 * objective param expresses today.
 */

import { describe, expect, it } from "vitest";
import type { LessonObjective, LessonSpec } from "../../contracts";
import type { SimTick } from "../../rules";
import { applyTick, createLessonSession } from "../engine";
import {
  contactVoidsObjective,
  createEvalState,
  parseObjectiveParams,
  stepObjective,
  type ObjectiveContext,
  type WitnessedReachZoneParams,
} from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { LessonSessionState, ObjectiveEvalState, ObjectiveParams } from "../types";
import { makeTick } from "./fixtures";

/** Northbound right-lane centre of hz-obstacle-v1 — the drill's own geometry. */
const LANE_X = 4.06;

function parsed(titleBg: string, params: Record<string, unknown>): WitnessedReachZoneParams {
  const objective: LessonObjective = { id: "o1", titleBg, kind: "reachZone", params };
  return parseObjectiveParams(objective) as WitnessedReachZoneParams;
}

/** Run a tick stream through one objective under a fixed session context. */
function run(
  params: ObjectiveParams,
  ticks: SimTick[],
  ctx: ObjectiveContext,
): { done: boolean; lastProgress: number } {
  let evalState: ObjectiveEvalState = createEvalState(params);
  let lastProgress = 0;
  for (const tick of ticks) {
    const r = stepObjective(params, evalState, tick, ctx);
    evalState = r.evalState;
    lastProgress = r.progress;
    if (r.done) return { done: true, lastProgress };
  }
  return { done: false, lastProgress };
}

/** A straight northbound drive past the obstacle (y = 130) and through the
 *  cleared disc at (4.06, 178) — the shape of the leg in the frame. */
function driveToCleared(): SimTick[] {
  const out: SimTick[] = [];
  let t = 0;
  for (let y = 120; y <= 190; y += 2) {
    out.push(makeTick({ t, speedKmh: 40, position: { x: LANE_X, y } }));
    t += 1;
  }
  return out;
}

/** The authored gate, parsed exactly as the engine parses it. */
function obsClearedParams(): WitnessedReachZoneParams {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-hazard-obstacle")!;
  const o = spec.success.find((x) => x.id === "sc-obs-cleared")!;
  return parseObjectiveParams({
    id: o.id,
    titleBg: o.titleBg,
    kind: "reachZone",
    params: o.params as unknown as Record<string, unknown>,
  }) as WitnessedReachZoneParams;
}

// ---------------------------------------------------------------------------
// 1 · The parse — authored only, and loud when malformed
// ---------------------------------------------------------------------------

describe("the contact term is written where it is meant, never guessed", () => {
  it("an authored `true` binds the demand", () => {
    const p = parsed("Задмини обекта, без да го закачиш, и продължи напред", {
      kind: "reachZone",
      x: LANE_X,
      y: 178,
      radiusM: 12,
      requireNoContact: true,
    });
    expect(p.requireNoContact).toBe(true);
  });

  it("any other value is a loud spec error, not a silent no-op", () => {
    for (const bad of [false, "yes", 1, null]) {
      expect(() =>
        parsed("Задмини обекта", {
          kind: "reachZone",
          x: LANE_X,
          y: 178,
          radiusM: 12,
          requireNoContact: bad,
        }),
      ).toThrow(/requireNoContact/);
    }
  });

  it("NO TITLE MAY CONJURE IT — the four derived demands have censuses, this has none", () => {
    // The census (2026-08-26, every `titleBg:` in `templates-*.ts` against
    // /закач|удар|засегн|блъсн|допр/) returns exactly one contact-claiming
    // title and it is a parkInBay. One member is not a population, so this
    // demand is authored-only — and that is asserted rather than trusted: the
    // sentence the frame photographed must NOT bind the gate by itself.
    expect(
      parsed("Задмини обекта, без да го закачиш, и продължи напред", {
        kind: "reachZone",
        x: LANE_X,
        y: 178,
        radiusM: 12,
      }).requireNoContact,
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2 · The census — exactly five gates in the whole catalogue carry it
// ---------------------------------------------------------------------------

describe("the catalogue census", () => {
  it("binds the five authored rows and nothing else", () => {
    const bound: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const o of spec.success) {
        const p = o.params as { kind?: string };
        if (p.kind !== "reachZone") continue;
        const out = parseObjectiveParams({
          id: o.id,
          titleBg: o.titleBg,
          kind: "reachZone",
          params: o.params as unknown as Record<string, unknown>,
        }) as WitnessedReachZoneParams;
        if (out.requireNoContact === true) bound.push(`${spec.id}/${o.id}`);
      }
    }
    // An empty list means the template lost the key and the title is promising
    // again; a SIXTH entry means a later lane authored one without reading this
    // file. Both are worth failing the build for.
    //
    // ── RE-BASELINED 1 → 5, wave 8, 2026-08-28 (templates-parking3 lane) ──
    //
    // WHY THE NEW VALUE IS RIGHT, in one sentence: «Задача 1: спри в изходната
    // позиция …» certifies that the car came to REST IN A STARTING POSITION,
    // and a car that reached that mark by driving through the parked row is not
    // in a starting position but inside another vehicle — so these four gates
    // now refuse the exact drive `.audit-frames/w10-4/frames/
    // sc-park-wall__mobile-right/08-debrief-p5.png` photographed, where the ✓
    // printed one card above «Удар в неподвижно препятствие · ОПАСНА ГРЕШКА ·
    // −10 изпитни т.».
    //
    // The five mechanical claims the raise rests on, each checked against the
    // tree rather than taken from the lane's own note:
    //   1. LIVE, not a dead predicate. `params.ts serializeObjectiveParams:49`
    //      whitelists the key, `engine.ts:1130` computes `struckABodyInRun`,
    //      `:1572` folds it and `stepReachZone` consults it. Pinned below by
    //      THE COMPILE BOUNDARY, which now walks all five rows, not one.
    //   2. IT CANNOT COST A PASS. `isBodyContact` is `code === "COLLISION"`
    //      only, and COLLISION is `severityClass: "opasna"` / −10
    //      (`rules/catalog.ts:619`) — «директно неиздържан». Every drive this
    //      demand can refuse had already failed the sheet before the objective
    //      was consulted, so the refusal removes a contradiction between the
    //      two halves of one sheet and can never take a pass away. This is the
    //      same safety property `reach-zone-yield-clean.test.ts` §2 demands of
    //      its own codes, and it is why the raise is safe at all.
    //   3. NO CERTIFICATE IS WITHDRAWN. `engine.ts:1197–1259` steps only
    //      `objectives[currentIndex]` and `currentIndex` only ever increments,
    //      so a contact during Задача 2's reverse — which is where these drills
    //      EXPECT a student to be near bodies — cannot retract a Задача 1 that
    //      was clean when it was performed.
    //   4. NO DRIVE IS STRANDED. All four are objective 1 of 2, so `!onTerminal`
    //      at `engine.ts:1599` arms the finish gate unconditionally and the
    //      student reaches the debrief that explains the ПТП instead of having
    //      to quit and forfeit the attempt.
    //   5. THE TITLES DID NOT MOVE. All four read the same at HEAD b211041 as
    //      here; the earlier wave that stripped their lateral claim
    //      («спри рано, в средата на алеята» → the halt only) is already
    //      shipped. This wave added the key and nothing else — `params.x/y/
    //      radiusM/maxSpeedKmh` are the values `parking3-claim-gates` §2 pins.
    //
    // WHAT THIS RAISE DOES **NOT** CLOSE, written down so no later round reads
    // it as more than it is. These four titles do NOT name contact the way the
    // founding member does («Задмини обекта, БЕЗ ДА ГО ЗАКАЧИШ»); the key is a
    // PROXY here, and it only catches the crash-shaped subset of wrong-position
    // halts. The geometry hole the lane documented is still open: the mark is
    // (0.9, y) while the district's own spawn lane centre is x = 4.0625, and the
    // compiled radius is 5 m (7.5 m at L1/L2), so the acceptance disc is WIDER
    // THAN THE ROAD and a car that halts in the through lane having touched
    // nothing still ticks. The honest fix is a radius, not a contact term, and
    // the catalogue already contains the worked example — `templates-parking.ts
    // sc-ppf-setup` earns the lateral claim on this same mark with
    // `radiusM: 3.0`, because |4.0625 − 0.9| = 3.16 > 3.0 excludes the
    // right-hand lane, and `lane15-parking-depth` asserts that exclusion every
    // build. Reported to the integrator; the row stays open.
    expect(bound).toEqual([
      // WAVE 12 — and this one is the strongest member of the set, because its
      // banner names the RELATIONSHIP to the body it must not strike:
      // «Следвай предната кола с къси светлини». The w17 frame shows that tick
      // awarded beside «Удар в друго превозно средство −10» — the objective was
      // certified over a rear-end INTO THE VERY CAR the banner says to follow.
      // Every term the disc carried was honoured; none of them witnessed the
      // collision. Measured through applyTick: clean drive -> done, struck
      // vehicle -> active, both reaching phase=completed so the debrief still
      // renders.
      "sc-ac-highbeam-lead/sc-ahl-follow",
      // The founding member — the only one whose banner names the contact.
      "sc-hazard-obstacle/sc-obs-cleared",
      // The four reverse-parking setup halts (wave 8). Ordered as the
      // catalogue compiles them, which is what `toEqual` compares.
      "sc-park-van/sc-pvn-setup",
      "sc-park-45-rev/sc-p45r-setup",
      "sc-park-wall/sc-pwl-setup",
      "sc-park-double/sc-pdb-setup",
    ]);
  });

  it("the authored gate really does carry the demand after parsing", () => {
    expect(obsClearedParams().requireNoContact).toBe(true);
  });

  /**
   * THE BOUNDARY THAT MAKES OR BREAKS THIS WHOLE REPAIR.
   *
   * `scenario/params.ts serializeObjectiveParams` is a WHITELIST, and every
   * scenario lesson a student plays passes through it: compileScenario →
   * LessonSpec.objectives → createLessonSession → parseObjectiveParams. A term
   * added to `ReachZoneParams` and read by the evaluator is still a term the
   * product never sees until its name appears on that whitelist.
   *
   * MEASURED, not reasoned — the sibling demand `requireRailClear` was authored,
   * parsed, read by the evaluator and gated by its own template-level test, and
   * `rail-clear-gate.test.ts` still caught the barred creep collecting its
   * certificate, because the key was dropped at compile. This case is the one
   * that would have caught it here.
   *
   * MUTATION: delete `if (p.requireNoContact === true) …` from
   * `serializeObjectiveParams`. Red on every rung.
   */
  it("THE COMPILE BOUNDARY: the key survives the ladder at every rung", () => {
    // WALKS ALL FIVE ROWS since the 2026-08-28 re-baseline above, not just the
    // founding one. The whole point of the whitelist trap is that it is
    // per-KEY, not per-row — but a raise that only ever compiled the row it
    // inherited would be exactly the „shipped a measurement, wired it to no
    // consumer" class this programme has measured 51 times, so the four new
    // members are driven through `compileScenario` too.
    const CENSUS: ReadonlyArray<readonly [string, string]> = [
      ["sc-ac-highbeam-lead", "sc-ahl-follow"],
      ["sc-hazard-obstacle", "sc-obs-cleared"],
      ["sc-park-van", "sc-pvn-setup"],
      ["sc-park-45-rev", "sc-p45r-setup"],
      ["sc-park-wall", "sc-pwl-setup"],
      ["sc-park-double", "sc-pdb-setup"],
    ];
    for (const [specId, objectiveId] of CENSUS)
    for (const level of [1, 2, 3, 4, 5] as const) {
      const compiled = compileScenario(SCENARIO_TEMPLATES.find((s) => s.id === specId)!, level);
      const cleared = compiled.objectives.find((o) => o.id === objectiveId);
      expect(cleared, `L${level} lost ${objectiveId}`).toBeDefined();
      expect(cleared!.params.requireNoContact, `L${level} dropped the demand on ${objectiveId}`).toBe(true);
      // …and the parse the session actually runs still sees it.
      expect(
        (parseObjectiveParams(cleared!) as WitnessedReachZoneParams).requireNoContact,
        `L${level} ${objectiveId}`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 3 · The measurement, through `applyTick` — the entry point the shell calls
// ---------------------------------------------------------------------------

describe("«без да го закачиш» is refused on the drive that struck something", () => {
  const clearedLesson: LessonSpec = {
    id: "t-obs-cleared",
    order: 99,
    titleBg: "Тест заобикаляне",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: LANE_X, y: 120 }, headingDeg: 0 },
    preDrive: false,
    objectives: [
      {
        id: "t-cleared",
        titleBg: "Задмини обекта, без да го закачиш, и продължи напред",
        kind: "reachZone",
        params: { x: LANE_X, y: 178, radiusM: 12, requireNoContact: true },
      },
    ],
  };

  /** Drive the cleared disc through the real engine, optionally striking a body
   *  on the first frame — before the disc, exactly as the frame's order was. */
  function driveThroughEngine(
    lesson: LessonSpec,
    struck?: "staticObject" | "vehicle" | "pedestrian",
  ): LessonSessionState {
    let s = createLessonSession(lesson);
    let first = true;
    for (const frame of driveToCleared()) {
      const withStrike =
        first && struck !== undefined
          ? makeTick({ ...frame, events: [{ kind: "collision", withWhat: struck }] })
          : frame;
      first = false;
      s = applyTick(s, withStrike).state;
    }
    return s;
  }

  it("POSITIVE CONTROL: the clean drive still completes end-to-end", () => {
    // Without this the refusals below would only be asserting that a broken
    // harness never ticks anything.
    expect(driveThroughEngine(clearedLesson).objectives[0].status).toBe("done");
  });

  it("REFUSED: the struck obstacle — the w11 frame's own fault", () => {
    const s = driveThroughEngine(clearedLesson, "staticObject");
    expect(s.objectives[0].status).toBe("active");
    // The strike really was graded, so the refusal rests on a fault the same
    // debrief prints rather than on a silent state.
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
  });

  it("REFUSED: a struck vehicle and a struck person count too — any body", () => {
    // Unlike `requireVruUntouched`, this demand is about CONTACT and not about
    // a category of victim: «без да го закачиш» is falsified by any crash the
    // protocol books on the way to the mark.
    expect(driveThroughEngine(clearedLesson, "vehicle").objectives[0].status).toBe("active");
    expect(driveThroughEngine(clearedLesson, "pedestrian").objectives[0].status).toBe("active");
  });

  it("THE DEMAND DOES NOT LEAK: a claimless gate ticks over the same strike", () => {
    const plainLesson: LessonSpec = {
      ...clearedLesson,
      objectives: [
        {
          id: "t-plain",
          titleBg: "Стигни края на отсечката",
          kind: "reachZone",
          params: { x: LANE_X, y: 178, radiusM: 12 },
        },
      ],
    };
    expect(driveThroughEngine(plainLesson, "staticObject").objectives[0].status).toBe("done");
  });

  it("the banner is not inert while refused — the place half is acknowledged", () => {
    const r = run(obsClearedParams(), driveToCleared(), {
      stagedOutcomes: [],
      redsMetInRun: 0,
      struckABodyInRun: true,
    });
    expect(r.done).toBe(false);
    expect(r.lastProgress).toBe(0.5);
  });

  it("UNKNOWN IS NOT GUILTY: an absent channel keeps every shipped drive intact", () => {
    // Every fixture, rig and replay omits the field. Absent must read as
    // „the caller cannot answer", never as „yes" — the polarity every additive
    // channel in objectives.ts is held to.
    const r = run(obsClearedParams(), driveToCleared(), { stagedOutcomes: [], redsMetInRun: 0 });
    expect(r.done).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4 · A REFUSAL MAY NOT DOUBLE AS A TRAP — the drive still has to END
// ---------------------------------------------------------------------------

describe("the permanence is declared, so the finish gate can route round it", () => {
  it("contactVoidsObjective answers only for a gate that carries the key", () => {
    const gated = obsClearedParams() as unknown as ObjectiveParams;
    expect(contactVoidsObjective(gated, true)).toBe(true);
    expect(contactVoidsObjective(gated, false)).toBe(false);
    const plain = parsed("Стигни края на отсечката", {
      kind: "reachZone",
      x: LANE_X,
      y: 178,
      radiusM: 12,
    }) as unknown as ObjectiveParams;
    expect(contactVoidsObjective(plain, true)).toBe(false);
  });

  it("A TERMINAL gated objective does not strand the drive", () => {
    // `lessons/engine.ts` withholds gate 1 (the stalled chain) on the terminal
    // objective, because a correct final approach would satisfy it. When the
    // demand is already unsatisfiable that reason has evaporated — otherwise a
    // student who struck the obstacle could reach the protocol that teaches him
    // why only by quitting, which costs the attempt its XP.
    const terminalLesson: LessonSpec = {
      id: "t-obs-terminal",
      order: 99,
      titleBg: "Тест заобикаляне (терминален)",
      descriptionBg: "тест",
      conceptIds: [],
      spawn: { position: { x: LANE_X, y: 120 }, headingDeg: 0 },
      preDrive: false,
      objectives: [
        {
          id: "t-only",
          titleBg: "Задмини обекта, без да го закачиш, и продължи напред",
          kind: "reachZone",
          params: { x: LANE_X, y: 178, radiusM: 12, requireNoContact: true },
        },
      ],
    };
    let s = createLessonSession(terminalLesson);
    let first = true;
    // Drive in, then sit at the mark long enough for the stalled-chain gate to
    // fire. The certificate stays refused; only the strand goes.
    const frames = [...driveToCleared()];
    let t = frames[frames.length - 1].t;
    for (let i = 0; i < 60; i++) {
      t += 1;
      frames.push(makeTick({ t, speedKmh: 0, position: { x: LANE_X, y: 178 } }));
    }
    for (const frame of frames) {
      const withStrike = first
        ? makeTick({ ...frame, events: [{ kind: "collision", withWhat: "staticObject" }] })
        : frame;
      first = false;
      s = applyTick(s, withStrike).state;
    }
    expect(s.objectives[0].status, "the certificate must still be refused").toBe("active");
    expect(s.phase, "the drive must still be able to end").toBe("completed");
  });
});
