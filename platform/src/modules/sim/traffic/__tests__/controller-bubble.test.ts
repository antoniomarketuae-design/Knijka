/**
 * Register row B42 / ledger L4 — the регулировчик's gesture bubble.
 *
 * The founder asked for this twice and doc 86 §12.5 lists it as his
 * third-most-repeated ask: *„each position the traffic officers shows on top of
 * his head some bubble must appear stating what exactly he is pointing, who is
 * he letting go, whos turn its to pass"*. Lane 9 authored the teaching content
 * (`CONTROLLER_GESTURES`) and correctly refused to cross into `traffic/` to
 * render it; this lane renders it.
 *
 * The caption lives in `traffic/controllerGestures.ts` because a presentation
 * module must not import lesson content (docs/architecture/05). That leaves one
 * risk — two copies of the same answer drifting apart — and this file is the
 * guard against it. A TEST may cross the boundary; shipped code may not.
 *
 * ADR-002 is the reason the `lawRef` equality below is not optional: the
 * article must be RETRIEVED from the authored bank, never recalled. If someone
 * edits the citation on one side, this fails.
 */
import { describe, expect, it } from "vitest";
import { CONTROLLER_GESTURES } from "@/modules/sim/lessons/scenario/templates-signals";
import {
  BUBBLE_ARM_RAISED,
  BUBBLE_CHEST_OR_BACK,
  BUBBLE_SIDE_PROFILE,
  CONTROLLER_BUBBLES,
} from "../controllerGestures";

describe("controller bubble copy (B42)", () => {
  it("carries exactly the three authored postures, in the authored order", () => {
    expect(CONTROLLER_BUBBLES.map((b) => b.posture)).toEqual(
      CONTROLLER_GESTURES.map((g) => g.posture),
    );
  });

  it("the index constants the renderer picks by match the array", () => {
    expect(CONTROLLER_BUBBLES[BUBBLE_SIDE_PROFILE].posture).toBe("sideProfile");
    expect(CONTROLLER_BUBBLES[BUBBLE_CHEST_OR_BACK].posture).toBe("chestOrBack");
    expect(CONTROLLER_BUBBLES[BUBBLE_ARM_RAISED].posture).toBe("armRaised");
  });

  it("cites the SAME law as the authored gesture it captions (ADR-002)", () => {
    for (let i = 0; i < CONTROLLER_BUBBLES.length; i++) {
      expect(CONTROLLER_BUBBLES[i].lawRef, CONTROLLER_BUBBLES[i].posture).toBe(
        CONTROLLER_GESTURES[i].lawRef,
      );
    }
  });

  it("answers his three questions on every posture, in Bulgarian (THEO-4)", () => {
    for (const b of CONTROLLER_BUBBLES) {
      // What am I looking at / who goes / who stops — never a bare verdict.
      expect(b.poseBg.length, b.posture).toBeGreaterThan(12);
      expect(b.goBg, b.posture).toMatch(/^Минава:/);
      expect(b.stopBg, b.posture).toMatch(/^Спира(ш|т)?:/);
      for (const s of [b.headlineBg, b.poseBg, b.goBg, b.stopBg]) {
        expect(s, `${b.posture}: "${s}" must be Bulgarian`).toMatch(/[А-Яа-я]/);
        expect(s, `${b.posture}: "${s}" must have no latin letters`).not.toMatch(/[A-Za-z]/);
      }
    }
  });

  it("stays short enough to read on a billboard from the approach", () => {
    // The bubble canvas is 1024 px wide and these are drawn at 44-46 px; past
    // ~44 characters a line starts running off the card. A hard cap is cheaper
    // than discovering it in a frame.
    for (const b of CONTROLLER_BUBBLES) {
      expect(b.headlineBg.length, b.posture).toBeLessThanOrEqual(12);
      expect(b.poseBg.length, b.posture).toBeLessThanOrEqual(40);
      expect(b.goBg.length, b.posture).toBeLessThanOrEqual(40);
      expect(b.stopBg.length, b.posture).toBeLessThanOrEqual(40);
    }
  });

  it("the три headlines are distinct verdicts, not the same word", () => {
    const set = new Set(CONTROLLER_BUBBLES.map((b) => b.headlineBg));
    expect(set.size).toBe(CONTROLLER_BUBBLES.length);
  });
});
