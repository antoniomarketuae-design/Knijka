import { describe, expect, it } from "vitest";
import type { SimTickEvent } from "../../rules";
import {
  conceptForEvent,
  createQuizTriggerState,
  observeQuizTick,
  QUIZ_TUNING,
  type MicroQuizQuestion,
  type QuizFrequency,
} from "../quiz-trigger";
import { makeTick, tickWithEvents } from "./fixtures";

// ---------------------------------------------------------------------------
// A synthetic bank: two questions per relevant concept, distinct ids.
// ---------------------------------------------------------------------------

function q(id: string, conceptIds: string[]): MicroQuizQuestion {
  return {
    id,
    conceptIds,
    type: "single",
    textBg: `Въпрос ${id}`,
    options: [
      { id: `${id}-a`, textBg: "А" },
      { id: `${id}-b`, textBg: "Б" },
    ],
    points: 1,
  };
}

const BANK: MicroQuizQuestion[] = [
  q("q-cross-1", ["c-crosswalk-yield"]),
  q("q-cross-2", ["c-crosswalk-yield"]),
  q("q-stop-1", ["c-give-way-stop-behavior"]),
  q("q-light-1", ["c-traffic-light-signals"]),
  q("q-signal-1", ["c-driver-signals"]),
  q("q-priority-1", ["c-priority-concept"]),
];

const CROSSING: SimTickEvent = {
  kind: "crossingZoneEntered",
  crossingId: "x1",
  pedestrianOnCrossing: true,
};
const STOP_SIGN: SimTickEvent = { kind: "stopLineCrossed", control: "stopSign" };
const LIGHT: SimTickEvent = {
  kind: "stopLineCrossed",
  control: "trafficLight",
  lightState: "green",
};
const TURN: SimTickEvent = { kind: "turnStarted", direction: "left" };

function fresh(frequency: QuizFrequency = "frequent") {
  return createQuizTriggerState(frequency, BANK);
}

describe("conceptForEvent — situation → knowledge-graph concept", () => {
  it("maps each teachable event to its concept", () => {
    expect(conceptForEvent(CROSSING)).toBe("c-crosswalk-yield");
    expect(conceptForEvent(STOP_SIGN)).toBe("c-give-way-stop-behavior");
    expect(conceptForEvent(LIGHT)).toBe("c-traffic-light-signals");
    expect(conceptForEvent(TURN)).toBe("c-driver-signals");
    expect(conceptForEvent({ kind: "prioritySituation", situation: "rhr", violated: false })).toBe(
      "c-priority-concept",
    );
  });

  it("returns null for events with no priority/duty to quiz", () => {
    expect(conceptForEvent({ kind: "collision", withWhat: "vehicle" })).toBeNull();
    expect(conceptForEvent({ kind: "mirrorGlance", mirror: "left" })).toBeNull();
  });
});

describe("observeQuizTick — triggering + selection", () => {
  it("pops an on-topic question for the situation", () => {
    const r = observeQuizTick(fresh(), tickWithEvents(5, [CROSSING]));
    expect(r.quiz).not.toBeNull();
    expect(r.quiz!.conceptId).toBe("c-crosswalk-yield");
    expect(r.quiz!.id).toBe("q-cross-1");
    expect(r.state.shownCount).toBe(1);
    expect(r.state.lastQuizAtSec).toBe(5);
    expect(r.state.seenQuestionIds).toEqual(["q-cross-1"]);
  });

  it("does not fire on a tick without a teachable event", () => {
    const r = observeQuizTick(fresh(), tickWithEvents(5, [{ kind: "collision", withWhat: "vehicle" }]));
    expect(r.quiz).toBeNull();
    expect(r.state.shownCount).toBe(0);
  });

  it("never repeats a question — advances to the next unseen one", () => {
    let s = fresh();
    const r1 = observeQuizTick(s, tickWithEvents(0, [CROSSING]));
    s = r1.state;
    // Second crossing, past the gap: the first question is now seen.
    const r2 = observeQuizTick(s, tickWithEvents(100, [CROSSING]));
    expect(r1.quiz!.id).toBe("q-cross-1");
    expect(r2.quiz!.id).toBe("q-cross-2");
  });

  it("stays silent when every on-topic question is already seen", () => {
    let s = fresh();
    s = observeQuizTick(s, tickWithEvents(0, [CROSSING])).state; // q-cross-1
    s = observeQuizTick(s, tickWithEvents(100, [CROSSING])).state; // q-cross-2
    const r3 = observeQuizTick(s, tickWithEvents(200, [CROSSING]));
    expect(r3.quiz).toBeNull(); // no third crossing question in the bank
  });

  it("selects the concept of the FIRST teachable event on the tick", () => {
    const r = observeQuizTick(fresh(), tickWithEvents(5, [TURN, CROSSING]));
    expect(r.quiz!.conceptId).toBe("c-driver-signals");
  });
});

describe("observeQuizTick — rate limiting", () => {
  it("enforces the min gap between quizzes", () => {
    let s = fresh("frequent"); // minGap 25 s
    const r1 = observeQuizTick(s, tickWithEvents(10, [CROSSING]));
    s = r1.state;
    // 20 s later — inside the 25 s gap: suppressed.
    const tooSoon = observeQuizTick(s, tickWithEvents(30, [STOP_SIGN]));
    expect(tooSoon.quiz).toBeNull();
    expect(tooSoon.state.shownCount).toBe(1);
    // 26 s after the first — gap satisfied: fires.
    const ok = observeQuizTick(s, tickWithEvents(36, [STOP_SIGN]));
    expect(ok.quiz).not.toBeNull();
    expect(ok.quiz!.conceptId).toBe("c-give-way-stop-behavior");
  });

  it("caps quizzes per session (frequent = 4)", () => {
    let s = fresh("frequent");
    const events = [CROSSING, STOP_SIGN, LIGHT, TURN];
    let t = 0;
    let fired = 0;
    for (const e of events) {
      const r = observeQuizTick(s, tickWithEvents(t, [e]));
      if (r.quiz) fired += 1;
      s = r.state;
      t += QUIZ_TUNING.frequent.minGapSec + 1;
    }
    expect(fired).toBe(4);
    // A 5th eligible situation is refused by the cap.
    const capped = observeQuizTick(s, tickWithEvents(t, [{ kind: "prioritySituation", situation: "x", violated: false }]));
    expect(capped.quiz).toBeNull();
    expect(capped.state.shownCount).toBe(4);
  });

  it("occasional fires fewer than frequent over the same drive (via a longer gap)", () => {
    // Six crossings 30 s apart. frequent (gap 25) fires up to its cap; occasional
    // (gap 45, cap 2) fires fewer.
    function run(frequency: QuizFrequency): number {
      let s = createQuizTriggerState(frequency, [
        ...BANK,
        q("q-cross-3", ["c-crosswalk-yield"]),
        q("q-cross-4", ["c-crosswalk-yield"]),
        q("q-cross-5", ["c-crosswalk-yield"]),
        q("q-cross-6", ["c-crosswalk-yield"]),
      ]);
      let fired = 0;
      for (let i = 0; i < 6; i++) {
        const r = observeQuizTick(s, tickWithEvents(i * 30, [CROSSING]));
        if (r.quiz) fired += 1;
        s = r.state;
      }
      return fired;
    }
    const occasional = run("occasional");
    const frequent = run("frequent");
    expect(occasional).toBe(2); // capped at 2
    expect(frequent).toBeGreaterThan(occasional);
  });

  it("frequency 'off' never fires", () => {
    const r = observeQuizTick(fresh("off"), tickWithEvents(5, [CROSSING]));
    expect(r.quiz).toBeNull();
    expect(r.state.shownCount).toBe(0);
  });

  it("stays silent with an empty bank (graceful degradation)", () => {
    const s = createQuizTriggerState("frequent", []);
    const r = observeQuizTick(s, tickWithEvents(5, [CROSSING]));
    expect(r.quiz).toBeNull();
  });

  it("is a no-op on an event-free tick", () => {
    const r = observeQuizTick(fresh(), makeTick({ t: 5, speedKmh: 40 }));
    expect(r.quiz).toBeNull();
    expect(r.state).toEqual(fresh());
  });
});
