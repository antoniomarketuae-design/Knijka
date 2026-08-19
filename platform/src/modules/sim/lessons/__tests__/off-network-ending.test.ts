/**
 * O22 — THE DRIVE THAT LEFT THE AUTHORED WORLD, both directions.
 *
 * WHAT THIS FILE IS ABOUT. Fourteen scenarios in the sweep161 audit had no lane
 * end at all, and after re-measurement exactly one class of them has no ENDING
 * as opposed to no DRIVER: a car that is no longer in the authored world. Read
 * by eye off the frames rather than derived — `sc-junction-blind` pc/right
 * `04-t090s.png`, `sc-junction-left` pc/right `04-t208s.png` and
 * `sc-vu-emergency-junction` pc/right `04-t205s.png` are a featureless green
 * plane with the task chip still asking for a turn out of a junction that is
 * nowhere on screen. No finish gate can see that: every one is anchored on route
 * geometry the car is no longer near, and the crash pin is disarmed by
 * travelling away from the impact, which is what being launched off the map is.
 *
 * BOTH DIRECTIONS, because either one alone is the other crime:
 *  · A CAR OFF THE NETWORK MUST END, and it must end WITH A REASON. «Урокът
 *    беше прекъснат преди края» over a scoreboard is a bare verdict, and so is
 *    an ending that borrows «Стигна края на маршрута» from a gate that did not
 *    fire — a bare verdict wearing a costume. THEO-4 forbids both.
 *  · A CAR DRIVING LAWFULLY MUST NEVER BE ENDED ON — crawling in traffic,
 *    stopped dead at a red, waiting behind a bus, or reporting a tick that does
 *    not carry the channel at all. The founder's own complaint is a FALSE
 *    FAILURE, and this is the row most able to manufacture one: the false-refusal
 *    exposure of `edgeId === null` is a 0.645 m band past the outermost legal
 *    parking pose on `district-v1` (runtime/__tests__/off-network-headroom.test.ts
 *    measures it), and OFF_NETWORK_STUCK_S is what keeps a car in that band from
 *    being closed down.
 *
 * THE LAST BLOCK IS A TEST OF A DEFECT THAT IS STILL OPEN, and it is labelled as
 * one. `stepOffNetwork` and `offNetworkEndingCopy` live in this lane's file; the
 * ARM is three lines in `lessons/engine.ts` plus one primitive field in
 * `lessons/types.ts`, neither of which this lane owns. So a shipped lesson driven
 * off the map still does not end, and that is pinned here rather than left to a
 * report nobody reads — when the arm lands, that block must be replaced by its
 * opposite and this paragraph deleted.
 */

import { describe, expect, it } from "vitest";
import type { SimTick } from "../../rules";
import { applyTick, createLessonSession } from "../engine";
import {
  FINISH_OUTSIDE_STUCK_S,
  OFF_NETWORK_STUCK_S,
  offNetworkEndingCopy,
  stepOffNetwork,
} from "../finish";
import { parseObjectiveParams } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import { makeTick } from "./fixtures";

const DT = 0.25;

/**
 * Run the fold over a tick stream and report the first frame it fired on.
 *
 * `posed` defaults true — the frame-zero pose guard is exercised by its own case
 * below rather than smeared through every other one.
 */
function runFold(
  ticks: readonly SimTick[],
  posed: (tick: SimTick) => boolean = () => true,
): { firedAtSec: number | null; frames: number } {
  let sinceSec: number | null = null;
  let firedAtSec: number | null = null;
  let frames = 0;
  for (const tick of ticks) {
    frames++;
    const fold = stepOffNetwork(sinceSec, tick, posed(tick));
    sinceSec = fold.sinceSec;
    if (fold.ended && firedAtSec === null) firedAtSec = tick.t;
  }
  return { firedAtSec, frames };
}

/** A tick stream: `spec(t)` describes each frame; `dur` seconds at DT. */
function stream(dur: number, spec: (t: number) => Partial<SimTick>): SimTick[] {
  const out: SimTick[] = [];
  for (let t = 0; t <= dur + 1e-9; t = Number((t + DT).toFixed(6))) {
    out.push(makeTick({ t, ...spec(t) }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// The convicting half — a car that is nowhere
// ---------------------------------------------------------------------------

describe("a car off the road network ends, and not before the bar", () => {
  it("THE EXHIBIT: sc-junction-blind's shape — on the street, then the green plane", () => {
    // Measured off the frames: pc/right is still on its street at t = 63 s
    // (04-t063s.png) and on the plane at t = 74 s (04-t074s.png), then runs to
    // t = 209 s. Modelled at the pessimistic end of that bracket — the car is
    // still on the network for the whole 63 s and leaves at 68 s — so the fold
    // has to survive a minute of legitimate driving first.
    const LEFT_AT = 68;
    const ticks = stream(300, (t) =>
      t < LEFT_AT
        ? { speedKmh: 12, edgeId: "e-junction-blind-approach", position: { x: 0, y: t } }
        : // 0…14 км/ч oscillation, exactly what the run.log records for 209 s.
          { speedKmh: t % 10 < 5 ? 0 : 11, edgeId: null, position: { x: 400, y: 400 } },
    );

    const { firedAtSec } = runFold(ticks);
    expect(firedAtSec).not.toBeNull();
    // Fires one bar after the car left, not one bar after the drive started.
    expect(firedAtSec!).toBeGreaterThanOrEqual(LEFT_AT + OFF_NETWORK_STUCK_S);
    expect(firedAtSec!).toBeLessThan(LEFT_AT + OFF_NETWORK_STUCK_S + DT * 2);
    // …and inside the drive the harness actually recorded, which is the half of
    // the derivation that stops the bar being merely "safe": 209 s of session.
    expect(firedAtSec!).toBeLessThan(209);
  });

  it("…and at 11 км/ч in gear D, because there is no speed test in the evidence", () => {
    // sc-vu-emergency-junction pc/right t205s: off the world and MOVING. Any bar
    // that required a standstill would miss the frame it was written for — which
    // is why the header block above refuses one, and this is that refusal pinned.
    const ticks = stream(200, () => ({ speedKmh: 11, gear: 1, edgeId: null }));
    expect(runFold(ticks).firedAtSec).not.toBeNull();

    // The same drive at a dead standstill fires at the same time — the fold is
    // blind to speed in both directions, not just permissive in one.
    const still = stream(200, () => ({ speedKmh: 0, gear: 1, edgeId: null }));
    expect(runFold(still).firedAtSec).toBe(runFold(ticks).firedAtSec);
  });

  it("the bar is the module's own measured 75 s, not a new number", () => {
    // FINISH_OUTSIDE_STUCK_S was derived from the same corpus and the same
    // claim ("past this, the car is not coming back"): 1,569 resumed pauses,
    // longest 69 s sampled, 74.2 s true. Two numbers for one claim rot apart, so
    // this asserts they are the same number rather than merely both correct.
    expect(OFF_NETWORK_STUCK_S).toBe(FINISH_OUTSIDE_STUCK_S);
  });
});

// ---------------------------------------------------------------------------
// The half that matters more — no lawful drive may be closed down
// ---------------------------------------------------------------------------

describe("a car that is on a road is never ended on", () => {
  it("crawling in traffic for ten minutes", () => {
    // The sweep's own driver: 0–12 км/ч, roll-then-stop, for far longer than any
    // bar in the module. On a road, so none of it counts.
    const ticks = stream(600, (t) => ({
      speedKmh: t % 8 < 3 ? 0 : 12,
      edgeId: "e-boulevard",
      position: { x: 0, y: t },
    }));
    expect(runFold(ticks).firedAtSec).toBeNull();
  });

  it("stopped dead at a red light for ten minutes", () => {
    const ticks = stream(600, () => ({
      speedKmh: 0,
      edgeId: "e-approach",
      nextStopLineM: 4,
      nextStopLineControl: "trafficLight",
      nextStopLineState: "red",
    }));
    expect(runFold(ticks).firedAtSec).toBeNull();
  });

  it("waiting behind a stopped bus for ten minutes", () => {
    const ticks = stream(600, () => ({ speedKmh: 0, edgeId: "e-busstop", leadGapM: 2.4 }));
    expect(runFold(ticks).firedAtSec).toBeNull();
  });

  it("A TICK THAT DOES NOT CARRY THE CHANNEL IS INNOCENT — undefined ≠ null", () => {
    // A hand-built tick, a recorded trace and every legacy engine omit `edgeId`
    // entirely (`makeTick` itself does). Reading "absent" as "nowhere" would end
    // every replay in the repository at 75 s, silently, with a sentence saying
    // the student drove off the road.
    const ticks = stream(600, () => ({ speedKmh: 30 }));
    expect(ticks.every((tk) => tk.edgeId === undefined)).toBe(true);
    expect(runFold(ticks).firedAtSec).toBeNull();
  });

  it("A KERB-BAND EXCURSION HE DROVE BACK FROM: two 74 s runs do not add up", () => {
    // The false-refusal exposure is a 0.645 m band past the outermost legal
    // parking pose (headroom test). A student who strays into it, returns, and
    // strays again has recovered TWICE — deliberately the opposite of
    // stepFinishGate's two accumulators, where two visits to one face are one car
    // sitting in one place. Banking here would close a lesson on a driver who
    // came back to the road.
    const A = OFF_NETWORK_STUCK_S - 1; // 74 s off
    const ticks: SimTick[] = [];
    let t = 0;
    for (const _run of [0, 1]) {
      for (let s = 0; s < A; s += DT) {
        ticks.push(makeTick({ t, speedKmh: 8, edgeId: null }));
        t += DT;
      }
      // ONE frame back on the road — the minimum evidence of a recovery.
      ticks.push(makeTick({ t, speedKmh: 8, edgeId: "e-boulevard" }));
      t += DT;
    }
    expect(runFold(ticks).firedAtSec).toBeNull();
    // …and the total time spent off the network is well past the bar, so this is
    // a real test of the reset and not of a stream that was too short.
    expect(2 * A).toBeGreaterThan(OFF_NETWORK_STUCK_S);
  });

  it("A DRIVE THAT HAS NOT BEGUN CANNOT HAVE LEFT ANYWHERE (the pose guard)", () => {
    // B-NEW-1's standing lesson: the scene ticks the session with a placeholder
    // pose at the district origin before the chassis publishes, and one such
    // frame once armed the roundabout finish and ended untouched sessions at
    // ~40 s. `posed` is a parameter of the fold, not the caller's discretion.
    const ticks = stream(600, () => ({ speedKmh: 0, edgeId: null }));
    expect(runFold(ticks, () => false).firedAtSec).toBeNull();

    // And once the drive DOES begin, the clock starts there — not at t = 0.
    const POSED_AT = 30;
    const late = runFold(ticks, (tk) => tk.t >= POSED_AT);
    expect(late.firedAtSec).not.toBeNull();
    expect(late.firedAtSec!).toBeGreaterThanOrEqual(POSED_AT + OFF_NETWORK_STUCK_S);
  });

  it("a rewound clock restarts the run instead of stalling the ending behind it", () => {
    // A seek, or a resumed tab handing back a stale stamp. The FIRST draft of
    // this case appended one older frame to a short run and asserted it did not
    // fire — and it passed with the guard REMOVED, because a stale stamp makes
    // the elapsed negative and a negative elapsed never fires. It guarded
    // nothing. The guard's real job is the other direction: without it the run's
    // start stays in the abandoned timeline and the ending is delayed by the
    // whole size of the jump, so a car off the map after a seek runs on for
    // however long the seek was.
    //
    // Off-network run opens at t = 100, the clock rewinds to 0, and the car is
    // still off the map for a further 90 s. The honest answer is that the run
    // began at 0 in the timeline now in hand, so the drive ends at ≈ 75 — not at
    // 175, which those 90 s never reach.
    const ticks: SimTick[] = [];
    for (let t = 100; t < 110; t = Number((t + DT).toFixed(6))) {
      ticks.push(makeTick({ t, speedKmh: 8, edgeId: null }));
    }
    for (let t = 0; t <= 90; t = Number((t + DT).toFixed(6))) {
      ticks.push(makeTick({ t, speedKmh: 8, edgeId: null }));
    }
    const { firedAtSec } = runFold(ticks);
    expect(firedAtSec).not.toBeNull();
    expect(firedAtSec!).toBeGreaterThanOrEqual(OFF_NETWORK_STUCK_S);
    expect(firedAtSec!).toBeLessThan(OFF_NETWORK_STUCK_S + DT * 2);
  });
});

// ---------------------------------------------------------------------------
// THEO-4 — the ending brings its own sentence
// ---------------------------------------------------------------------------

describe("the ending says WHY, in the instructor's voice", () => {
  for (const examMode of [false, true]) {
    it(`${examMode ? "exam" : "training"}: names the reason and never borrows «края на маршрута»`, () => {
      const copy = offNetworkEndingCopy(examMode);
      expect(copy.kind).toBe("lesson");

      // It must SAY the thing that happened. Not decoration: the whole reason
      // the previous pass routed this ending instead of shipping it through an
      // existing gate is that both sentences engine.ts can speak today claim the
      // student reached the end of his route.
      expect(copy.explanationBg).toContain("извън пътната мрежа");
      expect(copy.titleBg).toContain("извън пътя");

      // …and it must not claim the ending that did not happen. Both existing
      // endings open with «Стигна края на маршрута» / «Спря в края на маршрута»;
      // either one here would be a bare verdict wearing a costume.
      expect(copy.explanationBg).not.toContain("Стигна края");
      expect(copy.explanationBg).not.toContain("края на маршрута");
      expect(copy.titleBg).not.toContain("Край на маршрута");

      // It must hand him to the debrief, which is where the teaching is.
      // (Case-insensitive: mid-sentence in the exam copy, sentence-initial in
      // the training one.)
      expect(copy.explanationBg).toMatch(/разборът показва/i);

      // Inside the violation catalogue's own length band (median 186, max 319):
      // this is a HUD toast on a 390 px phone.
      expect(copy.explanationBg.length).toBeLessThanOrEqual(319);
      expect(copy.explanationBg.length).toBeGreaterThan(120);
      expect(copy.titleBg.length).toBeLessThanOrEqual(48);
    });
  }

  it("the exam and training sentences are different, and only one says НЕИЗДЪРЖАН", () => {
    const training = offNetworkEndingCopy(false);
    const exam = offNetworkEndingCopy(true);
    expect(exam.explanationBg).not.toBe(training.explanationBg);
    expect(exam.explanationBg).toContain("не е издържан");
    expect(training.explanationBg).not.toContain("не е издържан");
  });
});

// ---------------------------------------------------------------------------
// THE ARM LANDED — this block was written as its own tripwire and has now fired
// ---------------------------------------------------------------------------

describe("the arm is folded, and a car off the authored world ends", () => {
  it("a shipped lesson driven off the map ENDS, with its own sentence", () => {
    // Driven through the real `applyTick` on the real compiled lesson, so this is
    // a statement about the product and not about a stub. `sc-junction-blind@L1`
    // is the scenario the O22 row was filed against; its ticks report
    // `edgeId: null` from the first frame and it drives for 300 s — four times
    // OFF_NETWORK_STUCK_S — with the fold available and nothing calling it.
    //
    // THIS TEST WAS WRITTEN INVERTED, ON PURPOSE, AND THEN FIRED. It shipped
    // asserting that the drive does NOT end, because `stepOffNetwork` was built,
    // tested and folded by nothing — the lane that wrote it owned finish.ts and
    // `lessons/engine.ts` was not its to touch. Its own instruction was that
    // failing here would be the signal the routed change had landed rather than
    // a regression. It failed on 2026-08-19 and this is the inversion.
    //
    // That is the whole shape of the routing debt this programme kept paying:
    // fifteen of twenty-six open rows were "one edit in a file this lane does
    // not own", and a lane can only ever NAME those. A test that convicts its
    // own missing arm is the cheapest way to make sure the naming is not lost.
    const template = SCENARIO_TEMPLATES.find((t) => t.id === "sc-junction-blind");
    expect(template, "sc-junction-blind must still be in the catalogue").toBeDefined();
    const lesson = compileScenario(template!, 1);

    let state = createLessonSession(lesson);
    let endedAtSec: number | null = null;
    for (let t = 0; t <= 300; t = Number((t + DT).toFixed(6))) {
      // A real pose that moves (so the frame-zero guard passes) and no road
      // under it — the green plane, drifting.
      state = applyTick(
        state,
        makeTick({ t, speedKmh: 11, gear: 1, edgeId: null, position: { x: 400, y: 400 + t } }),
      ).state;
      if (state.phase !== "driving") {
        endedAtSec = state.endedAtSec ?? t;
        break;
      }
    }
    // OFF_NETWORK_STUCK_S is 75 s and the clock starts on the first frame with
    // no road under a moving car, so the ending lands just after it — and well
    // inside the 300 s this rig drives, which is four times the bar.
    expect(endedAtSec, "the arm is folded — this must now end").not.toBeNull();
    expect(endedAtSec!).toBeGreaterThanOrEqual(OFF_NETWORK_STUCK_S);
    expect(endedAtSec!).toBeLessThan(OFF_NETWORK_STUCK_S + 5);
    expect(state.phase).toBe("completed");
  });

  it("it does NOT borrow either existing ending's sentence", () => {
    // THEO-4, and the reason this ending needed copy of its own rather than a
    // reused string: both endings this engine could already speak say «край на
    // маршрута», and telling a student he reached the end of a route he drove
    // OFF is precisely the false sentence. Read off the pushed HUD event, not
    // off the copy helper — the helper being right proves nothing about what
    // the engine actually pushed.
    const template = SCENARIO_TEMPLATES.find((t) => t.id === "sc-junction-blind")!;
    const lesson = compileScenario(template, 1);
    let state = createLessonSession(lesson);
    let pushed: { titleBg?: string; explanationBg?: string } | null = null;
    for (let t = 0; t <= 300; t = Number((t + DT).toFixed(6))) {
      const step = applyTick(
        state,
        makeTick({ t, speedKmh: 11, gear: 1, edgeId: null, position: { x: 400, y: 400 + t } }),
      );
      state = step.state;
      const lessonEvent = step.hudEvents.find(
        (e) => e.kind === "lesson" && String(e.titleBg ?? "").includes("извън пътя"),
      );
      if (lessonEvent) pushed = lessonEvent as { titleBg?: string; explanationBg?: string };
      if (state.phase !== "driving") break;
    }
    expect(pushed, "the ending must announce itself").not.toBeNull();
    expect(pushed!.titleBg).toBe(offNetworkEndingCopy(false).titleBg);
    expect(pushed!.explanationBg).toBe(offNetworkEndingCopy(false).explanationBg);
    expect(pushed!.titleBg).not.toContain("край на маршрута");
    expect(pushed!.explanationBg).not.toContain("край на маршрута");
  });

  it("THE POSITIVE CONTROL: the same rig DOES end a drive an existing gate can see", () => {
    // Without this, the case above is worthless: "the session did not end" is
    // equally true of a rig that never ticked, and every "0 defects" report in
    // this programme was an instrument that lied in the reassuring direction.
    // Same lesson, same `applyTick`, same tick builder — but the car is on a
    // road and standing still at the end of the route, which is exactly what
    // `terminalRescueZone` is armed for (FINISH_STUCK_S = 12 s at a waypoint).
    const template = SCENARIO_TEMPLATES.find((t) => t.id === "sc-junction-blind")!;
    const lesson = compileScenario(template, 1);
    const terminal = parseObjectiveParams(lesson.objectives[lesson.objectives.length - 1]);
    expect(terminal.kind).toBe("reachZone");
    if (terminal.kind !== "reachZone") return;

    let state = createLessonSession(lesson);
    let t = 0;
    let endedAtSec: number | null = null;
    // 40 m of approach from outside the zone (the arming evidence), then dead
    // still on the mark for 20 s — past the twelve-second waypoint bar.
    const push = (x: number, y: number, speedKmh: number): boolean => {
      state = applyTick(
        state,
        makeTick({ t, speedKmh, gear: 1, edgeId: "e-junction-blind", position: { x, y } }),
      ).state;
      t = Number((t + DT).toFixed(6));
      if (state.phase !== "driving") {
        endedAtSec = state.endedAtSec ?? t;
        return true;
      }
      return false;
    };
    for (let s = 0; s <= 1 && endedAtSec === null; s += DT / 10) {
      push(terminal.x, terminal.y - 40 * (1 - s), 8);
    }
    for (let s = 0; s < 20 && endedAtSec === null; s += DT) {
      push(terminal.x, terminal.y, 0);
    }
    expect(endedAtSec, "the rig must be able to end a drive at all").not.toBeNull();
  });
});
