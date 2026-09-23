/**
 * =============================================================================
 * WHAT A RAW STORED STRING MEANS — lane D, round 3, 2026-09-23.
 * =============================================================================
 *
 * WHY THIS FILE EXISTS. Round 2 moved three remembered choices out of
 * `LessonPlayShell`'s lazy `useState` initializers into `../storedChoices.ts`,
 * and proved the HYDRATION contract (server default → stored value) in
 * `hydrationClientSnapshot.test.tsx`. The round-2 verifier then mutated the
 * mappers those hooks sit on and found the proofs did not reach them:
 *
 *   · `quizFrequencyFromStored` — drop `raw === "off"` from the accepted set
 *     and every test stayed green, because the hydration proof exercised
 *     "frequent" and one junk value only. A student who had deliberately
 *     turned the micro-quiz OFF would silently be back on „Понякога“ — the
 *     one choice in this module a student makes to be left alone.
 *   · `minimapOnFromStored` — widen `raw === "on"` to „anything that is not
 *     'off'" and nothing went red either: the proof used exactly "on" and
 *     „nothing stored“, and `null` is not `"off"`.
 *
 * So the mappers get a TABLE each, executed directly: every value the product
 * writes, plus the values a browser can hand back that it never wrote (an old
 * build's spelling, a different case, an empty string, junk from another tab).
 * These are the functions the hooks call, not copies of them.
 *
 * The write side is proved in `hydrationClientSnapshot.test.tsx` (the hook's
 * setter must write the key the hook reads); this file is the read side.
 */
import { describe, expect, it } from "vitest";
import type { LessonSpec, QuizFrequency } from "@/modules/sim/lessons";
import {
  advisorOnFromStored,
  DEFAULT_QUIZ_FREQUENCY,
  MINIMAP_STORAGE_KEY,
  minimapOnFromStored,
  quizFrequencyFromStored,
  readStoredChoice,
  serverStoredChoice,
} from "../storedChoices";
import { MICRO_QUIZ_FREQUENCIES, MICRO_QUIZ_STORAGE_KEY } from "../types";

// ---------------------------------------------------------------------------
// The raw read itself. No `window` is stubbed in this file — this is the
// server, where the whole defect started.
// ---------------------------------------------------------------------------

describe("readStoredChoice on the server", () => {
  it("answers „nothing stored“ rather than guessing, with no window in scope", () => {
    expect(typeof window).toBe("undefined"); // precondition: really the server
    expect(readStoredChoice(MINIMAP_STORAGE_KEY)).toBeNull();
    expect(readStoredChoice(MICRO_QUIZ_STORAGE_KEY)).toBeNull();
  });

  it("the server snapshot is „nothing stored“ too — that is the whole fix", () => {
    expect(serverStoredChoice()).toBeNull();
  });

  it("the keys are the ones students' browsers already hold", () => {
    // Renaming either silently forgets every existing choice; the module's
    // header promises the move keeps them.
    expect(MINIMAP_STORAGE_KEY).toBe("aidrive.sim.minimap.v1");
    expect(MICRO_QUIZ_STORAGE_KEY).toBe("sim.quizFrequency");
  });
});

// ---------------------------------------------------------------------------
// Micro-quiz frequency.
// ---------------------------------------------------------------------------

describe("quizFrequencyFromStored", () => {
  // Each id the selector can write must come back as itself — „off“ included,
  // which is the one the round-2 verifier's mutation swallowed.
  const ROUND_TRIP: QuizFrequency[] = ["off", "occasional", "frequent"];

  it.each(ROUND_TRIP)("a stored %s is honoured", (id) => {
    expect(quizFrequencyFromStored(id)).toBe(id);
  });

  it("every frequency the selector offers is a value this mapper accepts", () => {
    // Guards the pair: a new segment added to the UI with no branch here would
    // be stored and then read back as the default.
    for (const { id } of MICRO_QUIZ_FREQUENCIES) {
      expect(quizFrequencyFromStored(id)).toBe(id);
    }
    expect(MICRO_QUIZ_FREQUENCIES.map((f) => f.id)).toEqual(ROUND_TRIP);
  });

  it("„off“ is not treated as „nothing stored“ (the deliberate silence is kept)", () => {
    expect(quizFrequencyFromStored("off")).toBe("off");
    expect(quizFrequencyFromStored("off")).not.toBe(DEFAULT_QUIZ_FREQUENCY);
  });

  it.each([
    ["nothing stored", null],
    ["an empty string", ""],
    ["another build's spelling", "always"],
    ["the wrong case", "OFF"],
    ["padded", " off "],
    ["a number", "0"],
    ["JSON from another key", '{"id":"off"}'],
  ])("%s falls back to the default", (_label, raw) => {
    expect(quizFrequencyFromStored(raw)).toBe(DEFAULT_QUIZ_FREQUENCY);
  });

  it("the default is „occasional“ (the shell's original constant)", () => {
    expect(DEFAULT_QUIZ_FREQUENCY).toBe("occasional");
  });
});

// ---------------------------------------------------------------------------
// Minimap. Founder review 2026-07-28: DEFAULT OFF, remembered per browser.
// ---------------------------------------------------------------------------

describe("minimapOnFromStored", () => {
  it("exactly the string the toggle writes turns it on", () => {
    expect(minimapOnFromStored("on")).toBe(true);
  });

  it.each([
    ["the string the toggle writes for off", "off"],
    ["nothing stored", null],
    ["an empty string", ""],
    ["the wrong case", "ON"],
    ["a boolean's text", "true"],
    ["a number", "1"],
    ["junk from another key", "occasional"],
  ])("%s leaves it off (the founder's default is OFF, not „not off“)", (_label, raw) => {
    expect(minimapOnFromStored(raw)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Advisor. A persisted choice wins; nothing stored → the lesson-level default.
// ---------------------------------------------------------------------------

const BEGINNER = { id: "lesson-fixture-beginner", order: 1 } as unknown as LessonSpec;
const ADVANCED = { id: "lesson-fixture-advanced", order: 9 } as unknown as LessonSpec;

describe("advisorOnFromStored", () => {
  it("the two lessons used here really do have opposite defaults", () => {
    // Precondition, not a claim about the mapper: without it the „stored wins“
    // assertions below could pass by agreeing with the default.
    expect(advisorOnFromStored(null, BEGINNER)).toBe(true);
    expect(advisorOnFromStored(null, ADVANCED)).toBe(false);
  });

  it("a stored choice overrides the lesson default in both directions", () => {
    expect(advisorOnFromStored("off", BEGINNER)).toBe(false);
    expect(advisorOnFromStored("on", ADVANCED)).toBe(true);
  });

  it.each([
    ["an empty string", ""],
    ["junk", "maybe"],
    ["the wrong case", "OFF"],
  ])("%s is not a choice — the lesson default stands", (_label, raw) => {
    expect(advisorOnFromStored(raw, BEGINNER)).toBe(true);
    expect(advisorOnFromStored(raw, ADVANCED)).toBe(false);
  });
});
