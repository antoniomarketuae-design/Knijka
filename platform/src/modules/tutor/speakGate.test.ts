/**
 * When the Учител is allowed to speak while the student is driving (doc 81
 * §4.3).
 *
 * The properties pinned here are the ones a founder cannot check by playing the
 * game once, because they are about what does NOT happen: the voice that stays
 * silent on the exam, the line that never lands mid-turn, the queue that drops
 * instead of flushing forty seconds late. Each one is a rule the document
 * states and the code would otherwise be free to forget.
 */

import { describe, expect, it } from "vitest";
import {
  createSpeakGateState,
  isSafeToInterrupt,
  observeSpeakTick,
  SPEAK_CODE_LOCKOUT_SEC,
  SPEAK_COOLDOWN_SEC,
  SPEAK_MAX_PER_SESSION,
  SPEAK_QUEUE_MAX_WAIT_SEC,
  SPEAK_SAFE_LEAD_GAP_M,
  SPEAK_TOAST_QUIET_SEC,
  type SpeakGateState,
  type SpeakGateTick,
  type SpeakRequest,
} from "./speakGate";

/** A calm, straight, empty road — every gate open unless a test closes one. */
function tick(overrides: Partial<SpeakGateTick> = {}): SpeakGateTick {
  return {
    t: 100,
    speedKmh: 40,
    leadGapM: null,
    driving: true,
    overlayOpen: false,
    lastToastAtSec: null,
    dangerLive: false,
    manoeuvreCommitted: false,
    requests: [],
    ...overrides,
  };
}

function request(overrides: Partial<SpeakRequest> = {}): SpeakRequest {
  return {
    utteranceId: "sim:FOLLOWING_TOO_CLOSE:hud",
    trigger: "repeatMistake",
    code: "FOLLOWING_TOO_CLOSE",
    ...overrides,
  };
}

function training(): SpeakGateState {
  return createSpeakGateState({ enabled: true, examMode: false });
}

describe("hard mutes", () => {
  it("never speaks on an exam, and lets nothing accumulate for later", () => {
    const state = createSpeakGateState({ enabled: true, examMode: true });
    const result = observeSpeakTick(state, tick({ requests: [request()] }));

    expect(result.speak).toBeNull();
    expect(result.state).toBe(state); // fully inert — not even a clock moved
    expect(result.dropped).toHaveLength(1);
  });

  it("stays silent for the whole exam even at a standstill with an easy line", () => {
    let state = createSpeakGateState({ enabled: true, examMode: true });
    for (let t = 0; t < 600; t += 10) {
      const result = observeSpeakTick(
        state,
        tick({ t, speedKmh: 0, requests: [request({ trigger: "stationary" })] }),
      );
      expect(result.speak).toBeNull();
      state = result.state;
    }
    expect(state.spokenCount).toBe(0);
  });

  it("drops requests while the coaching toggle is off", () => {
    const state = createSpeakGateState({ enabled: false, examMode: false });
    const result = observeSpeakTick(state, tick({ requests: [request()] }));

    expect(result.speak).toBeNull();
    expect(result.dropped).toHaveLength(1);
    expect(result.state.pending).toBeNull();
  });

  it("still tracks manoeuvres while off, so re-enabling cannot speak into a turn", () => {
    const off = createSpeakGateState({ enabled: false, examMode: false });
    const during = observeSpeakTick(off, tick({ t: 10, manoeuvreCommitted: true }));
    expect(during.state.lastManoeuvreAtSec).toBe(10);

    const back = observeSpeakTick(
      { ...during.state, enabled: true },
      tick({ t: 11, requests: [request()] }),
    );
    expect(back.speak).toBeNull();
    expect(back.state.pending).not.toBeNull(); // held, not lost
  });

  it("holds while an overlay is up, while a danger event is live, and off-drive", () => {
    for (const closed of [
      { overlayOpen: true },
      { dangerLive: true },
      { driving: false },
    ]) {
      const result = observeSpeakTick(training(), tick({ requests: [request()], ...closed }));
      expect(result.speak).toBeNull();
      expect(result.state.pending).not.toBeNull();
    }
  });

  it("waits out the quiet period after a HUD toast rather than doubling it", () => {
    const state = training();
    const noisy = observeSpeakTick(
      state,
      tick({ t: 100, lastToastAtSec: 100 - (SPEAK_TOAST_QUIET_SEC - 1), requests: [request()] }),
    );
    expect(noisy.speak).toBeNull();

    const quiet = observeSpeakTick(
      noisy.state,
      tick({ t: 101, lastToastAtSec: 100 - (SPEAK_TOAST_QUIET_SEC - 1) }),
    );
    expect(quiet.speak).not.toBeNull();
  });
});

describe("isSafeToInterrupt", () => {
  it("is always safe at a standstill — the only place a longer line belongs", () => {
    expect(isSafeToInterrupt({ t: 50, speedKmh: 0, leadGapM: 2 }, 49.5)).toBe(true);
  });

  it("refuses within three seconds of a manoeuvre commitment", () => {
    expect(isSafeToInterrupt({ t: 50, speedKmh: 40, leadGapM: null }, 48)).toBe(false);
    expect(isSafeToInterrupt({ t: 50, speedKmh: 40, leadGapM: null }, 47)).toBe(true);
  });

  it("refuses while the student is closing on the car in front", () => {
    const gap = SPEAK_SAFE_LEAD_GAP_M;
    expect(isSafeToInterrupt({ t: 50, speedKmh: 40, leadGapM: gap }, null)).toBe(false);
    expect(isSafeToInterrupt({ t: 50, speedKmh: 40, leadGapM: gap + 1 }, null)).toBe(true);
  });

  it("treats an empty road ahead as the safest case, not an unknown one", () => {
    expect(isSafeToInterrupt({ t: 50, speedKmh: 40, leadGapM: null }, null)).toBe(true);
  });
});

describe("what it says, and how often", () => {
  it("speaks the line and starts every clock", () => {
    const result = observeSpeakTick(training(), tick({ t: 12, requests: [request()] }));

    expect(result.speak?.utteranceId).toBe("sim:FOLLOWING_TOO_CLOSE:hud");
    expect(result.state.spokenCount).toBe(1);
    expect(result.state.lastSpokeAtSec).toBe(12);
    expect(result.state.spokenCodeAtSec.FOLLOWING_TOO_CLOSE).toBe(12);
    expect(result.state.pending).toBeNull();
  });

  it("holds a second line for the full cooldown", () => {
    const first = observeSpeakTick(training(), tick({ t: 0, requests: [request()] }));
    const early = observeSpeakTick(
      first.state,
      tick({ t: SPEAK_COOLDOWN_SEC - 1, requests: [request({ code: "SPEEDING_OVER_LIMIT" })] }),
    );
    expect(early.speak).toBeNull();

    const due = observeSpeakTick(early.state, tick({ t: SPEAK_COOLDOWN_SEC }));
    expect(due.speak?.code).toBe("SPEEDING_OVER_LIMIT");
  });

  it("says nothing twice about the same code inside the lockout", () => {
    const first = observeSpeakTick(training(), tick({ t: 0, requests: [request()] }));
    const repeat = observeSpeakTick(
      first.state,
      tick({ t: SPEAK_CODE_LOCKOUT_SEC - 1, requests: [request()] }),
    );

    expect(repeat.dropped).toHaveLength(1);
    expect(repeat.state.pending).toBeNull();
  });

  it("stops for good at the session cap", () => {
    let state = training();
    for (let n = 0; n < SPEAK_MAX_PER_SESSION; n += 1) {
      const t = n * SPEAK_COOLDOWN_SEC;
      const result = observeSpeakTick(
        state,
        tick({ t, requests: [request({ code: `CODE_${n}` })] }),
      );
      expect(result.speak).not.toBeNull();
      state = result.state;
    }

    const over = observeSpeakTick(
      state,
      tick({ t: 10_000, requests: [request({ code: "CODE_LAST" })] }),
    );
    expect(over.speak).toBeNull();
    expect(over.dropped).toHaveLength(1);
  });
});

describe("priority and the one-slot queue", () => {
  it("speaks the most urgent line when several land on the same tick", () => {
    const result = observeSpeakTick(
      training(),
      tick({
        requests: [
          request({ trigger: "objectiveComplete", code: "OBJ" }),
          request({ trigger: "repeatMistake", code: "REPEAT" }),
          request({ trigger: "stationary", code: "IDLE" }),
        ],
      }),
    );

    expect(result.speak?.code).toBe("REPEAT");
    expect(result.dropped.map((d) => d.code)).toEqual(["OBJ", "IDLE"]);
  });

  it("lets a more urgent arrival displace the line that is waiting", () => {
    const held = observeSpeakTick(
      training(),
      tick({ t: 10, overlayOpen: true, requests: [request({ trigger: "stationary", code: "IDLE" })] }),
    );
    expect(held.state.pending?.request.code).toBe("IDLE");

    const displaced = observeSpeakTick(
      held.state,
      tick({ t: 11, overlayOpen: true, requests: [request({ code: "REPEAT" })] }),
    );
    expect(displaced.state.pending?.request.code).toBe("REPEAT");
    expect(displaced.dropped.map((d) => d.code)).toEqual(["IDLE"]);
  });

  it("never queues more than one line — the queue cannot grow to be flushed", () => {
    let state = training();
    for (let t = 0; t < 10; t += 1) {
      const result = observeSpeakTick(
        state,
        tick({ t, overlayOpen: true, requests: [request({ code: `CODE_${t}` })] }),
      );
      state = result.state;
      expect(result.state.pending).not.toBeNull();
    }
    expect(state.pending?.request.code).toBe("CODE_0"); // the first, still waiting
  });

  it("drops a line that waited too long instead of speaking it late", () => {
    const held = observeSpeakTick(
      training(),
      tick({ t: 0, overlayOpen: true, requests: [request()] }),
    );

    const stillWaiting = observeSpeakTick(
      held.state,
      tick({ t: SPEAK_QUEUE_MAX_WAIT_SEC, overlayOpen: true }),
    );
    expect(stillWaiting.state.pending).not.toBeNull();

    const expired = observeSpeakTick(
      stillWaiting.state,
      tick({ t: SPEAK_QUEUE_MAX_WAIT_SEC + 1 }),
    );
    expect(expired.speak).toBeNull();
    expect(expired.dropped).toHaveLength(1);
    expect(expired.state.pending).toBeNull();
  });
});

describe("determinism", () => {
  it("returns the same decision for the same state and tick", () => {
    const state = training();
    const input = tick({ t: 7, requests: [request()] });
    const a = observeSpeakTick(state, input);
    const b = observeSpeakTick(state, input);

    expect(a.speak).toEqual(b.speak);
    expect(a.state).toEqual(b.state);
  });

  it("never mutates the state it was given", () => {
    const state = training();
    const snapshot = structuredClone(state);
    observeSpeakTick(state, tick({ t: 3, manoeuvreCommitted: true, requests: [request()] }));

    expect(state).toEqual(snapshot);
  });
});
