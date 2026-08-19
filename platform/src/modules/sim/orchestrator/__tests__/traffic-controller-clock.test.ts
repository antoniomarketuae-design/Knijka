/**
 * THE OFFICER'S TIMETABLE IS THE DRIVE'S CLOCK, NOT THE BRIEFING'S.
 *
 * Sweep 161 · doc 88 §3 lane D. `ScenarioDirectorImpl` stages every runner in
 * its CONSTRUCTOR, so `TrafficControllerRunner.stage()` used to post the
 * officer's single authored flip at SCENE MOUNT — and the clock
 * `SignalController.controllerPermission` compares it against runs on every
 * unpaused frame from then on, through the arrival card, the briefing, the
 * touch hint and the 51-second L1 demonstration that auto-plays before the
 * student touches the throttle. `paused` does not cover the briefing card.
 * The sweep's own desktop frames time that dead stretch at **36 s** (the ghost
 * demo transport reads 0:37 / 0:51 in `04-t001s.png` of BOTH
 * sc-sig-controller-postures/pc-right and /pc-wrong). The authored flips are 30
 * and 26 s. Both had therefore already fired before the first metre, and the
 * two shipped schedules point opposite ways, so the same cause produced both
 * crimes:
 *
 *   sc-sig-controller-postures  halts the PLAYER's axis first ⇒ post-flip every
 *                               crossing is "proceed". The sweep photographed
 *                               the wrong drive taking the junction at 59 км/ч
 *                               for «0 наказателни точки · MISTAKES (0)» on both
 *                               platforms, and the careful drive earning the
 *                               identical verdict. A GREEN TICK FOR A SKILL
 *                               NOTHING MEASURED.
 *   sc-sig-controller-live      halts the CROSS axis first ⇒ the permitted
 *                               window burned during the briefing and a CORRECT
 *                               careful drive arrived after the flip and was
 *                               billed 10 т. опасна, НЕИЗДЪРЖАН. A STUDENT
 *                               FAILED BY A CLOCK.
 *
 * WHAT THIS FILE ASSERTS, and why it is arranged this way.
 *
 * §1  BOTH DIRECTIONS, ON THE SHIPPED SPECS, AT FIVE DEAD TIMES — through the
 *     production pipeline (compileScenario → recordScriptedDrive, which runs the
 *     real runtime + director + this runner → createLessonSession/applyTick on
 *     every tick → buildLessonResult). **The verdict is read off the DEBRIEF**
 *     (`result.score`, `result.passed`, `result.objectives`), never off a
 *     runner outcome, because a runner outcome is not what the student is shown.
 *     A one-directional battery here would be worthless: the acquittal and the
 *     false conviction are the same defect seen from two sides, and a fix that
 *     answered one by loosening a check would create the other.
 * §2  THE INVARIANT, stated as an invariant rather than as five numbers: every
 *     dead time grades EXACTLY as dead time 0 does. That is the property the
 *     fix is for — a student is graded on his driving and not on how long he
 *     read the briefing — and it is what makes the whole committed trace corpus
 *     safe, because those traces open the throttle at t ≈ 0.
 * §3  THE TWO DIALS MOVE TOGETHER. The templates refuse `signalPlan` on purpose
 *     and say why: rebasing the LAMP alone would desync the misleading-green
 *     window from the permission flip. This runner owns both dials, so the
 *     pairing the templates authored is asserted here directly.
 * §4  THE FLOOR IS THE PRODUCT'S OWN. `CONTROLLER_DRIVE_START_KMH` is
 *     `DEFAULT_RULE_CONFIG.movingSpeedKmh` copied by value; this re-reads the
 *     literal so the two cannot drift in silence.
 *
 * EVERY ASSERTION BELOW WAS PROVED BY MUTATION — the mutation for each is named
 * at its own site, with the MEASURED result rather than the predicted one. The
 * five, and what each turned red out of 35:
 *
 *   defect       stage() posts `flipAtSec`, the anchor posts both dials
 *                un-rebased, `step()` reads session time  ................ 17 red
 *   nolamp       flip rebased, `signalOffsetSec` left alone .............. 7 red
 *   anchorfirst  anchor on the first step() frame, not the first moving one 17 red
 *   unlatch      clear `startedAtSec` whenever the car drops under the floor 14 red
 *   floor        `CONTROLLER_DRIVE_START_KMH` 5 → 15 .................... 1 red
 *
 * THE FIRST ATTEMPT AT `defect` WAS A BAD MUTATION AND IT IS RECORDED HERE
 * BECAUSE IT NEARLY CERTIFIED THIS FILE FALSELY: reverting only `stage()` and
 * the runner's own `flipped` left the anchor's re-post in place, so the runtime
 * still received the rebased schedule and all 35 passed. A mutation that does
 * not reach the code path the grade comes from proves the test guards nothing —
 * it just fails to disprove it.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TrafficControllerSpec } from "../../contracts";
import { DEFAULT_RULE_CONFIG } from "../../rules";
import type { SimTickEvent } from "../../rules";
import { recordScriptedDrive, type DriveScript } from "../../traces/recorder";
import { applyTick, buildLessonResult, createLessonSession } from "../../lessons/engine";
import { compileScenario } from "../../lessons/scenario/compile";
import {
  SC_SIGNAL_CONTROLLER,
  SC_SIGNAL_CONTROLLER_EVENT,
} from "../../lessons/scenario/templates-signals";
import {
  SC_SIG_CONTROLLER_LIVE,
  SC_SIG_CONTROLLER_LIVE_EVENT,
  SC_SIG_CONTROLLER_POSTURES,
  SC_SIG_CONTROLLER_POSTURES_EVENT,
} from "../../lessons/scenario/templates-signals2";
import type { ScenarioSpec } from "../../lessons/scenario/types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const sxDistrict = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "sx-v1.json"), "utf-8"),
) as unknown;

/** Drawn northbound lane centre of sx-v1's ns road, m. */
const LANE = 4.0625;
/** South spawn, m — 77.3 m short of the 27.725 m stop line. */
const SPAWN_Y = -105;
/** Rest pose short of the stop line (the shipped shadow's own hold). */
const HOLD_Y = -31;

/**
 * The dead stretch between scene mount and the student's first metre, s.
 * MEASURED off sweep 161's desktop frames, not assumed — the ghost demo's
 * transport reads 0:37 / 0:51 in `04-t001s.png` of BOTH
 * sc-sig-controller-postures/pc-right and /pc-wrong.
 */
const MEASURED_PRE_DRIVE_SEC = 36;

/**
 * The dead times the cure must survive: a student who skips everything, one who
 * sits through part of the demo, THE MEASURED SWEEP, one who reads it all, and
 * one who walks away and comes back. 120 s is past every authored flip by 4×
 * and is the row that would catch a fix which merely enlarged a constant.
 */
const DEAD_TIMES_SEC = [0, 12, MEASURED_PRE_DRIVE_SEC, 60, 120] as const;

/** The sweep's reckless leg: full throttle, straight north, no reading. */
const RECKLESS_KMH = 59;

type LineCrossing = Extract<SimTickEvent, { kind: "stopLineCrossed" }>;

interface DriveOutcome {
  /** Every trafficLight stop-line crossing the runtime emitted, with its time. */
  crossings: Array<{ tSec: number; controller?: "halt" | "proceed"; lamp?: string }>;
  /** What the DEBRIEF says — the only surface a student is ever shown. */
  score: number;
  passed: boolean;
  objectivesDone: boolean[];
  mistakeCodes: string[];
}

/** A pre-drive that burns world clock exactly as the briefing does: the car
 *  sits at the spawn on the brake while `runtime.update(dt)` keeps running. */
function deadTime(sec: number): DriveScript["steps"] {
  return sec > 0 ? [{ kind: "pause", sec, brake: true }] : [];
}

/** The audit's wrong leg: 59 км/ч from the spawn, straight through the box. */
function recklessScript(preDriveSec: number): DriveScript {
  return {
    steps: [
      ...deadTime(preDriveSec),
      {
        kind: "drive",
        points: [
          [LANE, SPAWN_Y],
          [LANE, 60],
        ],
        targetKmh: RECKLESS_KMH,
      },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

/**
 * The audit's right leg, in the shape the drill asks for: a slow approach, a
 * real stop short of the paint, a wait long enough to outlast the authored
 * posture hold, then a decisive crossing.
 *
 * `waitSec` is the dwell at the line. It is a PARAMETER and not a constant
 * because the two shipped schedules ask opposite things of a careful driver:
 * `postures` halts the player first, so the careful drive must OUTWAIT the flip;
 * `live` permits him first, so the careful drive must read the officer and GO
 * before it. One script with one number could only ever have tested one of them.
 */
function carefulScript(preDriveSec: number, waitSec: number): DriveScript {
  return {
    steps: [
      ...deadTime(preDriveSec),
      {
        kind: "drive",
        points: [
          [LANE, SPAWN_Y],
          [LANE, -38],
        ],
        targetKmh: 22,
      },
      {
        kind: "drive",
        points: [
          [LANE, -38],
          [LANE, HOLD_Y],
        ],
        targetKmh: 8,
      },
      { kind: "pause", sec: waitSec, brake: true },
      {
        kind: "drive",
        points: [
          [LANE, HOLD_Y],
          [LANE, 0],
          [LANE, 30],
          [LANE, 48],
        ],
        targetKmh: 18,
      },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}

/** Drive a script through the FULL production pipeline the live app runs. */
function drive(
  scenario: ScenarioSpec,
  staged: TrafficControllerSpec,
  script: DriveScript,
): DriveOutcome {
  const lesson = compileScenario(scenario, 1);
  let session = createLessonSession(lesson);
  const crossings: DriveOutcome["crossings"] = [];
  recordScriptedDrive(sxDistrict, script, {
    scenarioId: scenario.id,
    kind: "mistake",
    seed: 7,
    stagedEvents: [staged],
    collisionMinKmh: 0,
    onTick: (tick) => {
      for (const e of tick.events) {
        if (e.kind === "stopLineCrossed" && e.control === "trafficLight") {
          const line = e as LineCrossing;
          crossings.push({ tSec: tick.t, controller: line.controller, lamp: line.lightState });
        }
      }
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);
  return {
    crossings,
    score: result.score,
    passed: result.passed,
    objectivesDone: result.objectives.map((o) => o.done),
    mistakeCodes: session.events
      .filter((e) => e.kind === "violation")
      .map((e) => (e as { code: string }).code),
  };
}

/**
 * The two shipped drills, with the wait a CORRECT student makes at each.
 *
 * `postures` (halts the player's own axis, flip 30): read «спри», hold through
 * the hold, cross after the officer opens the direction — 20 s of dwell.
 * `live` (halts the CROSS axis, flip 26): the officer is waving THIS approach
 * through over a red lamp, so the correct drive slows enough to read him and
 * then goes — 3 s of dwell, and it must land inside the permitted window.
 */
const DRILLS = [
  {
    id: "sc-sig-controller-postures",
    scenario: SC_SIG_CONTROLLER_POSTURES,
    event: SC_SIG_CONTROLLER_POSTURES_EVENT,
    carefulWaitSec: 20,
    /** What the officer's permission must read at the careful crossing. */
    carefulController: "proceed" as const,
    /** …and at the reckless one, which is the whole conviction. */
    recklessController: "halt" as const,
  },
  {
    id: "sc-signal-controller",
    scenario: SC_SIGNAL_CONTROLLER,
    event: SC_SIGNAL_CONTROLLER_EVENT,
    carefulWaitSec: 20,
    carefulController: "proceed" as const,
    recklessController: "halt" as const,
  },
  {
    id: "sc-sig-controller-live",
    scenario: SC_SIG_CONTROLLER_LIVE,
    event: SC_SIG_CONTROLLER_LIVE_EVENT,
    carefulWaitSec: 3,
    carefulController: "proceed" as const,
    recklessController: "proceed" as const,
  },
];

/**
 * THE LAMP IS ONLY A FACT WHERE A TEMPLATE PINS IT.
 *
 * `SC_SIG_CONTROLLER_POSTURES_EVENT` authors NO `signalOffsetSec` — its own
 * comment is «NO signalOffsetSec: the lamps are dark, the posture is the law» —
 * so the head at that junction is free-running state nobody wrote and nothing
 * grades. The first draft of this battery asserted the crossing lamp on all
 * three drills and went red on that drill alone; MEASURED with the runner
 * instrumented, `postSchedule` is never handed an offset there at all, and the
 * lamp read green / yellow / red / green / red across the five dead times purely
 * because an unpinned cycle was at a different point each time.
 *
 * That is the instrument lying, not the code — and lying in the ALARMING
 * direction for once, which is the only reason it was cheap to catch. The
 * assertion is therefore made where the pin exists (`live` 23, `signal` 45) and
 * withheld where it does not. (Separately: that those heads are LIT at all in a
 * drill whose instruction 1 says «светофарът е ЗАГАСНАЛ» is a real open finding
 * — doc 87 still-open row 7, owned by the B35 lane and not by this one, because
 * closing it needs a „controlled but dark" lamp state in `runtime/signals.ts`.)
 */
const PINS_LAMP = new Set(["sc-signal-controller", "sc-sig-controller-live"]);

/** By id, never by index: this list grew by one mid-review and the positional
 *  lookups silently pointed the „live" block at another drill for one run. */
const drill = (id: string) => DRILLS.find((d) => d.id === id)!;

// ---------------------------------------------------------------------------
// §1 — both directions, on the SHIPPED specs, at five dead times
// ---------------------------------------------------------------------------

describe("§1 the shipped controller drills grade the DRIVING, at every dead time", () => {
  /**
   * The two drills that HALT the player's own axis first — the pair the sweep
   * caught acquitting a 59 км/ч barge. `sc-sig-controller-postures` is the one
   * it photographed; `sc-signal-controller` is its sibling on the same junction
   * with the same flip and a pinned green lamp, and it was never driven at a
   * realistic dead time either.
   */
  describe.each([drill("sc-sig-controller-postures"), drill("sc-signal-controller")])(
    "$id — the acquittal the sweep photographed",
    (d) => {
      for (const dead of DEAD_TIMES_SEC) {
        it(`dead time ${dead} s: the 59 км/ч drive is CONVICTED (10 т., опасна, НЕИЗДЪРЖАН)`, () => {
          const out = drive(d.scenario, d.event, recklessScript(dead));
          expect(out.crossings).toHaveLength(1);
          // The officer is still holding this approach when the car reaches the
          // paint — which is the fact the whole lesson turns on.
          expect(out.crossings[0].controller).toBe(d.recklessController);
          // Read off the DEBRIEF, not off the runner's outcome.
          expect(out.mistakeCodes).toEqual(["CONTROLLER_SIGNAL_VIOLATED"]);
          expect(out.score).toBe(10);
          expect(out.passed).toBe(false);
        });

        it(`dead time ${dead} s: the careful drive still PASSES, zero violations`, () => {
          const out = drive(d.scenario, d.event, carefulScript(dead, d.carefulWaitSec));
          expect(out.crossings).toHaveLength(1);
          expect(out.crossings[0].controller).toBe(d.carefulController);
          expect(out.mistakeCodes).toEqual([]);
          expect(out.score).toBe(0);
          expect(out.passed).toBe(true);
        });
      }

      /**
       * MUTATION (§1, the false-certificate direction). `defect`, MEASURED: the
       * reckless rows at 36 / 60 / 120 s go red on BOTH drills with `controller`
       * "proceed", `mistakeCodes` [] and `score` 0 — exactly the «0 наказателни
       * точки · MISTAKES (0) · top 59 км/ч» the sweep filed — and this row goes
       * red with them. The 0 s and 12 s rows stay GREEN, because both are under
       * the authored flip of 30, and that is precisely why every gate this drill
       * had before (all of which drive from t ≈ 0) was green while the shipped
       * lesson certified a barge.
       */
      it("the two verdicts are OPPOSITE at the measured dead time — the drill discriminates", () => {
        const reckless = drive(d.scenario, d.event, recklessScript(MEASURED_PRE_DRIVE_SEC));
        const careful = drive(
          d.scenario,
          d.event,
          carefulScript(MEASURED_PRE_DRIVE_SEC, d.carefulWaitSec),
        );
        // The sweep's complaint in one line: these two used to be equal.
        expect(reckless.mistakeCodes).not.toEqual(careful.mistakeCodes);
        expect(reckless.passed).toBe(false);
        expect(careful.passed).toBe(true);
      });
    },
  );

  describe("sc-sig-controller-live — the correct student the clock failed", () => {
    const d = drill("sc-sig-controller-live");

    for (const dead of DEAD_TIMES_SEC) {
      /**
       * THE FALSE FAILURE, WHICH IS THE HALF THAT MATTERS MOST HERE. This drill
       * teaches «мини на червено, защото регулировчикът те пуска». Before the
       * fix, a student who did exactly that after reading a 36-second briefing
       * arrived past the flip, crossed on the officer's word as instructed, and
       * was billed 10 т. опасна — «Неизпълнение на сигнала на регулировчика» —
       * for obeying the lesson. That is the founder's own complaint.
       *
       * MUTATION `defect`, MEASURED: dead times 12 / 36 / 60 / 120 go red here
       * with `controller` "halt", `mistakeCodes` ["CONTROLLER_SIGNAL_VIOLATED"],
       * `score` 10, `passed` false — a correct student billed a dangerous error
       * for doing what the briefing told him. Only 0 s stays green: this drill's
       * flip is 26 s and the careful approach itself takes ~24 s, so even a
       * TWELVE-second briefing was already enough to fail him. The committed
       * traces open the throttle at t ≈ 0 and never saw it.
       */
      it(`dead time ${dead} s: the CORRECT drive over the red lamp is innocent`, () => {
        const out = drive(d.scenario, d.event, carefulScript(dead, d.carefulWaitSec));
        expect(out.crossings).toHaveLength(1);
        expect(out.crossings[0].controller).toBe("proceed");
        // ЗДвП чл. 7 — the officer outranks the lamp, and the lamp IS red here.
        expect(out.crossings[0].lamp).toBe("red");
        expect(out.mistakeCodes).toEqual([]);
        expect(out.score).toBe(0);
        expect(out.passed).toBe(true);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// §2 — the invariant: the briefing's length is not a grade
// ---------------------------------------------------------------------------

describe("§2 every dead time grades exactly as dead time 0 does", () => {
  /** The debrief, reduced to what a student is actually shown. The lamp joins
   *  it only where the drill pins one — see PINS_LAMP. */
  const verdict = (o: DriveOutcome, pinsLamp: boolean) => ({
    controller: o.crossings.map((c) => c.controller),
    ...(pinsLamp ? { lamp: o.crossings.map((c) => c.lamp) } : {}),
    mistakeCodes: o.mistakeCodes,
    score: o.score,
    passed: o.passed,
    objectivesDone: o.objectivesDone,
  });

  for (const d of DRILLS) {
    /**
     * MUTATIONS. This is the assertion the whole fix exists to make true, so it
     * had to be shown breakable rather than trivially satisfiable. All three
     * MEASURED:
     *  - `defect` ⇒ red on ALL THREE drills (the two halting ones flip their
     *    reckless verdict, `live` flips its careful one);
     *  - `nolamp` — flip rebased, `signalOffsetSec` posted as authored ⇒ red on
     *    the two drills that PIN a lamp, on the `lamp` key alone and with every
     *    `controller`/`score` key still equal. The misleading-green window then
     *    slides against a flip that no longer moves with it, which is exactly
     *    the desync both templates' own comments refuse. `postures` stays green
     *    because it pins no lamp — the isolation is the evidence;
     *  - `anchorfirst` — anchor on the first `step()` frame ⇒ red on all three,
     *    same 17 rows as `defect`, because the director steps through the
     *    briefing and that anchor is scene mount under another name.
     */
    it(`${d.id}: the whole debrief is identical at 0 / 12 / 36 / 60 / 120 s`, () => {
      const lamp = PINS_LAMP.has(d.id);
      const recklessBase = verdict(drive(d.scenario, d.event, recklessScript(0)), lamp);
      const carefulBase = verdict(
        drive(d.scenario, d.event, carefulScript(0, d.carefulWaitSec)),
        lamp,
      );
      for (const dead of DEAD_TIMES_SEC) {
        expect(
          verdict(drive(d.scenario, d.event, recklessScript(dead)), lamp),
          `reckless @${dead}`,
        ).toEqual(recklessBase);
        expect(
          verdict(drive(d.scenario, d.event, carefulScript(dead, d.carefulWaitSec)), lamp),
          `careful @${dead}`,
        ).toEqual(carefulBase);
      }
    });
  }

  /**
   * …AND THE BASELINE IS NOT VACUOUS. An invariant test passes trivially if the
   * quantity it pins is constant for an uninteresting reason — e.g. if no
   * crossing were recorded at all, or if both legs scored the same. This pins
   * that the dead-time-0 baseline the row above compares against is itself a
   * real, discriminating verdict.
   *
   * MUTATION: delete the `stopLineCrossed` capture in `drive()` and §2 above
   * stays GREEN (two empty lists are equal) while this goes red. That is the
   * whole reason this test exists next to it.
   */
  it("the baseline it compares against actually says something", () => {
    for (const d of DRILLS) {
      const reckless = drive(d.scenario, d.event, recklessScript(0));
      const careful = drive(d.scenario, d.event, carefulScript(0, d.carefulWaitSec));
      expect(reckless.crossings, `${d.id} reckless`).toHaveLength(1);
      expect(careful.crossings, `${d.id} careful`).toHaveLength(1);
      expect(reckless.crossings[0].controller).toBe(d.recklessController);
      expect(careful.crossings[0].controller).toBe(d.carefulController);
      expect(careful.passed, `${d.id} careful passes`).toBe(true);
    }
    // The postures drill is the one whose reckless leg must FAIL; the live
    // drill's reckless leg is permitted by its own inverted schedule and is
    // graded elsewhere (speed), so it is deliberately not asserted as a fail.
    expect(drive(drill("sc-sig-controller-postures").scenario, drill("sc-sig-controller-postures").event, recklessScript(0)).passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §3 — the two dials are written together or the lesson dissolves
// ---------------------------------------------------------------------------

describe("§3 the lamp pin and the permission flip move on ONE zero", () => {
  /**
   * Both templates carry the same refusal in the tree — «NO signalPlan
   * (deliberate): the lamps here are pinned at session start by the staged
   * event's signalOffsetSec, synchronized with the controller's SESSION-TIME
   * timetable (flipAtSec) — an approach-relative rebase would desync the
   * misleading-green window from the permission flip and break the hierarchy
   * lesson.» That objection is an objection to rebasing ONE dial, and it is
   * correct. The runner owns both, so this asserts the pair.
   *
   * MUTATION `nolamp`, MEASURED: leave `s.signalOffsetSec` un-rebased in
   * `step()`'s `postSchedule` call and this goes red on `lamp` — the lamp the
   * student is being taught to disobey is no longer the lamp the briefing names.
   */
  it("sc-sig-controller-live: the lamp at the permitted crossing is RED at every dead time", () => {
    for (const dead of DEAD_TIMES_SEC) {
      const out = drive(
        SC_SIG_CONTROLLER_LIVE,
        SC_SIG_CONTROLLER_LIVE_EVENT,
        carefulScript(dead, 3),
      );
      expect(out.crossings[0], `dead ${dead}`).toMatchObject({
        controller: "proceed",
        lamp: "red",
      });
    }
  });

  /**
   * The other half of the hierarchy: `sc-signal-controller` pins its lamps at
   * `signalOffsetSec` 45 so the approach the officer HALTS is showing GREEN
   * («misleading-but-visible» — the drill's whole subject). If the lamp pin did
   * not move with the flip, the barging student would be convicted over a lamp
   * that no longer says green, and the lesson would be teaching a different
   * thing at 36 s than at 0 s.
   *
   * MUTATION `nolamp`, MEASURED: leave `s.signalOffsetSec` un-rebased and this
   * reds while dead time 0 stays green — the same signature the UN-PINNED
   * postures head showed when this battery first measured it (green / yellow /
   * red / green / red across the five dead times, which is what an unpinned
   * cycle looks like sampled at five different points).
   */
  it("sc-signal-controller: the halted approach is showing GREEN at the crossing, at every dead time", () => {
    for (const dead of DEAD_TIMES_SEC) {
      const out = drive(SC_SIGNAL_CONTROLLER, SC_SIGNAL_CONTROLLER_EVENT, recklessScript(dead));
      expect(out.crossings[0], `dead ${dead}`).toMatchObject({
        controller: "halt",
        lamp: "green",
      });
    }
  });
});

// ---------------------------------------------------------------------------
// §4 — the floor is the product's own, and cannot drift
// ---------------------------------------------------------------------------

describe("§4 the 'under way' floor is the rule engine's own threshold", () => {
  /**
   * `CONTROLLER_DRIVE_START_KMH` is copied by value into runners.ts so the
   * orchestrator stays free of a runtime import into `rules` (the same reason
   * this file keeps its own `axisOfBearing`). Copied constants drift; this
   * re-reads both literals every run so they cannot.
   *
   * MUTATION `floor`, MEASURED: set the runner's constant to 15 and this reds —
   * and it is the ONLY row in the file that does, 1 of 35. A 15 km/h floor still
   * latches on every script here, so behaviour alone cannot see the drift, which
   * is exactly why the arithmetic needs a guard of its own rather than being
   * inferred from a verdict.
   */
  it("matches DEFAULT_RULE_CONFIG.movingSpeedKmh", () => {
    const src = readFileSync(path.join(HERE, "..", "runners.ts"), "utf-8");
    const m = /const CONTROLLER_DRIVE_START_KMH = (\d+(?:\.\d+)?);/.exec(src);
    expect(m, "CONTROLLER_DRIVE_START_KMH is no longer a literal in runners.ts").not.toBeNull();
    expect(Number(m![1])).toBe(DEFAULT_RULE_CONFIG.movingSpeedKmh);
  });

  /**
   * …and the latch is a LATCH: a student who stops dead at the line must not
   * restart the officer's timetable by moving off again. The careful script
   * does exactly that — it comes to a full stop for `carefulWaitSec` and then
   * drives on — so if `startedAtSec` re-armed on the second move, the flip would
   * be pushed past every crossing and the postures drill's careful leg would
   * lose its «proceed» (it would still be halted).
   *
   * MUTATION `unlatch`, MEASURED: clear `startedAtSec` whenever the car drops
   * under the floor and this goes red on `controller` — "halt" instead of
   * "proceed" — at every dead time INCLUDING 0, taking 14 rows with it (every
   * careful row on both halting drills, plus §2's baseline). A student who obeys
   * the officer, stops, and is then convicted for going when waved on is the
   * false-failure direction again, manufactured by an un-latched clock.
   */
  it("the zero is latched once per attempt, not re-armed by every move-off", () => {
    for (const dead of DEAD_TIMES_SEC) {
      const out = drive(
        SC_SIG_CONTROLLER_POSTURES,
        SC_SIG_CONTROLLER_POSTURES_EVENT,
        carefulScript(dead, 20),
      );
      expect(out.crossings[0].controller, `dead ${dead}`).toBe("proceed");
    }
  });
});
