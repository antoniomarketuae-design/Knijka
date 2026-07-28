import { describe, expect, it } from "vitest";
import {
  MAX_BEAT_SEC,
  MIN_BEAT_SEC,
  beatDurationSec,
  canAsk,
  isBeatAdvancing,
  isBoardDimmed,
  lessonDurationSec,
  pauseAtBoundary,
  sentenceBoundaries,
  teacherTransition,
} from "./player";
import type { ClassroomBeat, TeacherState } from "./types";

function beat(over: Partial<ClassroomBeat> = {}): ClassroomBeat {
  return {
    id: "b1",
    kind: "explain",
    tone: "explain",
    sayBg: "Кратко изречение.",
    ...over,
  };
}

describe("beatDurationSec", () => {
  it("uses the lesson lane's estSec when it has one", () => {
    expect(beatDurationSec(beat({ estSec: 22 }))).toBe(22);
  });

  it("clamps a nonsense estSec instead of trusting it", () => {
    expect(beatDurationSec(beat({ estSec: 0.2 }))).toBe(MIN_BEAT_SEC);
    expect(beatDurationSec(beat({ estSec: 9999 }))).toBe(MAX_BEAT_SEC);
    // NaN/negative fall through to the text estimate rather than producing one.
    expect(beatDurationSec(beat({ estSec: Number.NaN }))).toBe(MIN_BEAT_SEC);
  });

  it("estimates from the text at the documented Bulgarian speech rate", () => {
    // 1,000 chars ⇒ 60 s of narration.
    const long = beat({ sayBg: "а".repeat(1000) });
    expect(beatDurationSec(long)).toBeCloseTo(60, 5);
  });

  it("gives a board beat dwell time on top of the narration", () => {
    const text = "а".repeat(500); // 30 s spoken
    const plain = beatDurationSec(beat({ sayBg: text }));
    const withBoard = beatDurationSec(
      beat({
        sayBg: text,
        board: {
          templateId: "sc-zebra-approach",
          districtId: "zb-v1",
          correct: { tracePath: "/a.json", titleBg: "п", captionBg: "" },
          mistake: { tracePath: "/b.json", titleBg: "г", captionBg: "" },
          opensOn: "correct",
        },
      }),
    );
    expect(withBoard).toBeGreaterThan(plain);
  });

  it("never leaves a beat on screen for under the floor", () => {
    expect(beatDurationSec(beat({ sayBg: "Да." }))).toBe(MIN_BEAT_SEC);
  });

  it("sums a lesson", () => {
    expect(lessonDurationSec([beat({ estSec: 10 }), beat({ estSec: 20 })])).toBe(30);
    expect(lessonDurationSec([])).toBe(0);
  });
});

describe("sentenceBoundaries", () => {
  it("ends at 1 even with no punctuation at all", () => {
    expect(sentenceBoundaries("без точка")).toEqual([1]);
  });

  it("finds Bulgarian sentence ends and always terminates at 1", () => {
    const b = sentenceBoundaries("Едно. Две! Три?");
    expect(b[b.length - 1]).toBe(1);
    expect(b.length).toBe(3);
    expect(b.every((f) => f > 0 && f <= 1)).toBe(true);
  });

  it("does not treat a decimal point inside a number as a sentence end", () => {
    // "0.5" has no whitespace after the dot, so the lookahead rejects it.
    expect(sentenceBoundaries("Спирачен път 0.5 метра")).toEqual([1]);
  });

  it("survives an empty string", () => {
    expect(sentenceBoundaries("")).toEqual([1]);
  });
});

describe("pauseAtBoundary", () => {
  const text = "Първо изречение. Второ изречение. Трето изречение.";

  it("finishes the sentence in progress rather than cutting mid-word", () => {
    // A 15-second beat: the first boundary is ~3.3 s away, inside the budget.
    const stop = pauseAtBoundary(text, 0.1, 15);
    expect(stop).toBeGreaterThan(0.1);
    // …and it is the FIRST boundary, not the end of the beat.
    expect(stop).toBeLessThan(0.5);
  });

  it("never rewinds — you cannot un-say a sentence", () => {
    expect(pauseAtBoundary(text, 0.99, 15)).toBeGreaterThanOrEqual(0.99);
  });

  it("keeps the wait budget in seconds, not in fractions of the beat", () => {
    // Same text, same moment; only the beat's length differs. In a short beat
    // the next boundary is close enough to wait for; in a long one it is not.
    expect(pauseAtBoundary(text, 0.1, 15)).toBeGreaterThan(0.1);
    expect(pauseAtBoundary(text, 0.1, 60)).toBe(0.1);
  });

  it("stops where the student is when the next boundary is too far", () => {
    // A single 1,000-char sentence: waiting for its end would be a minute.
    const wall = `${"а".repeat(999)}.`;
    expect(pauseAtBoundary(wall, 0.2, 60)).toBe(0.2);
  });

  it("clamps a fraction outside [0,1] and survives a zero duration", () => {
    // A hand raised before the teacher has said anything stops at 0, not below.
    expect(pauseAtBoundary(text, -5, 15)).toBe(0);
    expect(pauseAtBoundary(text, 5, 15)).toBe(1);
    expect(pauseAtBoundary(text, 0.5, 0)).toBeGreaterThanOrEqual(0.5);
  });
});

describe("teacherTransition", () => {
  it("walks the doc-84 §5.1 loop: speaking → listening → thinking → answering → resuming → speaking", () => {
    let s: TeacherState = "idle";
    s = teacherTransition(s, { type: "start" });
    expect(s).toBe("speaking");
    s = teacherTransition(s, { type: "raise-hand" });
    expect(s).toBe("listening");
    s = teacherTransition(s, { type: "submit-question" });
    expect(s).toBe("thinking");
    s = teacherTransition(s, { type: "answer-ready" });
    expect(s).toBe("answering");
    s = teacherTransition(s, { type: "resume" });
    expect(s).toBe("resuming");
    s = teacherTransition(s, { type: "resumed" });
    expect(s).toBe("speaking");
  });

  it("lets the student ask again from the answer — bounded elsewhere, not here", () => {
    expect(teacherTransition("answering", { type: "raise-hand" })).toBe("listening");
  });

  it("lets the student interrupt the resume too", () => {
    expect(teacherTransition("resuming", { type: "raise-hand" })).toBe("listening");
  });

  it("can resume straight from listening — a raised hand may be lowered", () => {
    expect(teacherTransition("listening", { type: "resume" })).toBe("resuming");
  });

  it("is identity on impossible transitions instead of throwing", () => {
    // A double-tapped button must not be able to break a lesson.
    expect(teacherTransition("thinking", { type: "raise-hand" })).toBe("thinking");
    expect(teacherTransition("idle", { type: "submit-question" })).toBe("idle");
    expect(teacherTransition("speaking", { type: "answer-ready" })).toBe("speaking");
    expect(teacherTransition("speaking", { type: "start" })).toBe("speaking");
  });

  it("always accepts finish", () => {
    for (const s of [
      "idle",
      "speaking",
      "listening",
      "thinking",
      "answering",
      "resuming",
    ] as const) {
      expect(teacherTransition(s, { type: "finish" })).toBe("idle");
    }
  });
});

describe("state predicates", () => {
  it("advances the lesson clock only while the teacher lectures", () => {
    expect(isBeatAdvancing("speaking")).toBe(true);
    for (const s of ["idle", "listening", "thinking", "answering", "resuming"] as const) {
      expect(isBeatAdvancing(s)).toBe(false);
    }
  });

  it("dims the board for the whole interruption and never outside it", () => {
    expect(isBoardDimmed("listening")).toBe(true);
    expect(isBoardDimmed("thinking")).toBe(true);
    expect(isBoardDimmed("answering")).toBe(true);
    expect(isBoardDimmed("speaking")).toBe(false);
    expect(isBoardDimmed("resuming")).toBe(false);
    expect(isBoardDimmed("idle")).toBe(false);
  });

  it("blocks a second question only while one is in flight", () => {
    expect(canAsk("thinking")).toBe(false);
    expect(canAsk("idle")).toBe(false);
    expect(canAsk("speaking")).toBe(true);
    expect(canAsk("listening")).toBe(true);
    expect(canAsk("answering")).toBe(true);
  });
});
