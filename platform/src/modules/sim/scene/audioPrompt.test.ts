// „Звукът е част от урока" (doc 82 §4.4) — the pure rule behind the prompt.
// It is pedagogy, not a preference: a muted session teaches a systematically
// faster car than the student will actually drive.

import { describe, expect, it } from "vitest";
import {
  audioPromptState,
  audioPromptTextBg,
  AUDIO_PROMPT_LOCKED_BG,
  AUDIO_PROMPT_MUTED_BG,
} from "./audioPrompt";

describe("audioPromptState", () => {
  it("asks for the unlock gesture while the AudioContext has never opened", () => {
    expect(audioPromptState({ unlocked: false, muted: false, dismissed: false })).toBe("locked");
  });

  it("asks again — with its own line — when the student muted the mix", () => {
    expect(audioPromptState({ unlocked: true, muted: true, dismissed: false })).toBe("muted");
  });

  it("says nothing once audio is actually playing", () => {
    expect(audioPromptState({ unlocked: true, muted: false, dismissed: false })).toBeNull();
  });

  it("NEVER nags a student who has read it (doc 82 §7 rule 31)", () => {
    // Dismissal outranks every other state: informed silence is a choice.
    expect(audioPromptState({ unlocked: false, muted: false, dismissed: true })).toBeNull();
    expect(audioPromptState({ unlocked: true, muted: true, dismissed: true })).toBeNull();
  });
});

describe("audioPromptTextBg", () => {
  it("gives each state its own bg-BG line", () => {
    expect(audioPromptTextBg("locked")).toBe(AUDIO_PROMPT_LOCKED_BG);
    expect(audioPromptTextBg("muted")).toBe(AUDIO_PROMPT_MUTED_BG);
    expect(AUDIO_PROMPT_LOCKED_BG).not.toBe(AUDIO_PROMPT_MUTED_BG);
  });

  it("states the REASON rather than issuing an instruction", () => {
    // The line has to survive a 17-year-old's first reading; doc 82 §5.4:
    // "tone must live in the writing".
    expect(AUDIO_PROMPT_LOCKED_BG).toContain("урок");
    expect(AUDIO_PROMPT_MUTED_BG).toContain("скорост");
  });
});
