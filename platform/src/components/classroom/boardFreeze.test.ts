/**
 * „FREEZES AND DIMS" — the half of doc 84 §5.1 rule 2 that was missing.
 *
 * When a hand goes up the board is supposed to stop and fade. It only faded:
 * `MistakeReplay` owned its own rAF loop and exposed no input, so the car kept
 * driving behind a 42%-opacity veil while the teacher answered a question about
 * the moment that had just gone past. The dim exists to KEEP THE REFERENT on
 * screen, and the referent was moving — which is the one failure mode the dim
 * was designed to prevent. `LessonBoard`'s own header carried the note for a
 * week: „The seam is a `paused?: boolean` prop […]; when it exists, pass
 * `dimmed` into it and delete this paragraph."
 *
 * There is no DOM in this repo's vitest environment (vitest.config.ts:
 * `environment: "node"`, and it says why), so the chain is asserted from the
 * source — the same technique `components/ui/checkControl.test.ts` uses for the
 * tick-box call sites. What is being guarded is a CHAIN OF CUSTODY: the flag
 * exists, it reaches the loop, the loop obeys it, and the board supplies it.
 * Break any one link and one of these goes red.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(SRC, rel), "utf8");

const REPLAY = read("components/theory/MistakeReplay.tsx");
const MEDIA = read("components/theory/MistakeMedia.tsx");
const BOARD = read("components/classroom/LessonBoard.tsx");
const SCENE = read("components/classroom/ClassroomScene.tsx");

describe("MistakeReplay — the canvas renderer", () => {
  it("takes a `paused` input at all", () => {
    expect(REPLAY).toMatch(/paused\s*=\s*false/);
    expect(REPLAY).toMatch(/paused\?:\s*boolean/);
  });

  it("gates the rAF loop on the caller's freeze AND the student's own control", () => {
    // Either one stops it; neither one overwrites the other, so a student who
    // had paused the replay does not find it playing when the board comes back.
    expect(REPLAY).toMatch(/const animating = playing && !paused/);
    expect(REPLAY).toMatch(/if \(!animating\) return;/);
    // The old gate must be gone — `playing` alone would ignore the freeze.
    expect(REPLAY).not.toMatch(/if \(!playing\) return;/);
  });

  it("re-runs the draw effect when the freeze changes", () => {
    // Without `animating` in the dependency list the loop would keep running
    // with a stale closure and the flag would do nothing at all.
    const deps = REPLAY.match(/\}, \[data, view, layers, ([^\]]*)\]\);/);
    expect(deps?.[1]).toContain("animating");
  });

  it("still paints one frame while frozen, so the referent stays on screen", () => {
    // The dim's whole purpose. A cleared canvas would destroy exactly what the
    // student interrupted about.
    expect(REPLAY).toMatch(/render\(tSecRef\.current\);\s*\n\s*if \(!animating\) return;/);
  });
});

describe("MistakeMedia — the video renderer", () => {
  it("takes the same input and forwards it to whichever renderer wins", () => {
    expect(MEDIA).toMatch(/paused\?:\s*boolean/);
    // Both branches: the clip AND the canvas fallback.
    expect([...MEDIA.matchAll(/paused=\{paused\}/g)].length).toBeGreaterThanOrEqual(2);
  });

  it("lets the freeze outrank visibility, so an on-screen clip still stops", () => {
    expect(MEDIA).toMatch(/if \(visible && !paused\)/);
    expect(MEDIA).toMatch(/\}, \[visible, paused\]\);/);
  });
});

describe("the board supplies it", () => {
  it("feeds `dimmed` straight into `paused` at every pane", () => {
    // One flag, one meaning („the student's attention is somewhere else"), so
    // the two halves of rule 2 cannot drift apart.
    expect([...BOARD.matchAll(/paused=\{dimmed\}/g)].length).toBe(3);
    expect(BOARD).toMatch(/paused: boolean/);
  });

  it("passes it down to both renderers", () => {
    expect(BOARD).toMatch(/<MistakeMedia[\s\S]{0,220}paused=\{paused\}/);
    expect(BOARD).toMatch(/<MistakeReplay[\s\S]{0,220}paused=\{paused\}/);
  });

  it("no longer carries the note that said it could not be done", () => {
    expect(BOARD).not.toContain("It does not FREEZE");
    expect(BOARD).not.toContain("delete this paragraph");
  });
});

describe("the room tells the teacher a question is up", () => {
  it("derives `quizzing` from the same flag that stops the clock", () => {
    expect(SCENE).toMatch(/quizHolding && teacher === "speaking"/);
    expect(SCENE).toContain('act({ type: "quiz-open" })');
    expect(SCENE).toContain('act({ type: "quiz-done" })');
  });
});
