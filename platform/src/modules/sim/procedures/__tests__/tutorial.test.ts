/**
 * D9 — the per-step tutorial (founder review 2026-07-30, ledger 86).
 *
 * „Instead of simply displaying `Press B`, the simulator should open a
 *  tutorial popup … The tutorial should explain why the action is important,
 *  how it is performed, and what the student should remember."
 *
 * Pinned here:
 *  - all 13 steps carry real WHY / HOW / ЗАПОМНИ copy (THEO-4: never a bare
 *    „do this");
 *  - the law citation is RETRIEVED from rules/catalog.ts, not typed as prose
 *    (ADR-002) — the assertion compares against the catalog directly, so a
 *    hand-typed article would fail;
 *  - the still→clip swap seam really swaps, and a clip must respect the
 *    founder's 10–15 s budget. That branch is tested BEFORE any clip exists,
 *    which is the whole reason the indirection is there.
 */

import { afterEach, describe, expect, it } from "vitest";
import { VIOLATIONS } from "../../rules/catalog";
import { PRE_DRIVE_STEP_ORDER } from "../steps";
import {
  PRE_DRIVE_TUTORIAL_CLIPS,
  PRE_DRIVE_TUTORIALS,
  preDriveTutorialLaw,
  preDriveTutorialMedia,
} from "../tutorial";

afterEach(() => {
  for (const k of Object.keys(PRE_DRIVE_TUTORIAL_CLIPS)) {
    delete PRE_DRIVE_TUTORIAL_CLIPS[k as keyof typeof PRE_DRIVE_TUTORIAL_CLIPS];
  }
});

describe("pre-drive tutorial content", () => {
  it("covers all 13 steps with why / how / remember (THEO-4)", () => {
    expect(Object.keys(PRE_DRIVE_TUTORIALS)).toHaveLength(13);
    for (const id of PRE_DRIVE_STEP_ORDER) {
      const t = PRE_DRIVE_TUTORIALS[id];
      // Real teaching, not a stub: the shortest authored WHY runs well past
      // a hundred characters, so the floor is a regression guard.
      expect(t.whyBg.length, `${id} why`).toBeGreaterThan(80);
      expect(t.howBg.length, `${id} how`).toBeGreaterThan(80);
      expect(t.rememberBg.length, `${id} remember`).toBeGreaterThan(40);
      expect(t.captionBg.length, `${id} caption`).toBeGreaterThan(10);
    }
  });

  it("is Bulgarian instructor prose, not a key legend", () => {
    for (const id of PRE_DRIVE_STEP_ORDER) {
      const t = PRE_DRIVE_TUTORIALS[id];
      const copy = `${t.whyBg} ${t.howBg} ${t.rememberBg}`;
      expect(/[а-яА-Я]/.test(copy), `${id} is Bulgarian`).toBe(true);
      // The failure mode the founder hit: instruction copy that spells a key.
      expect(/\bPress\b|\bнатисни\s+[A-Z]\b/i.test(copy), `${id} names a key cap`).toBe(false);
      // …and no step may OPEN with the keyboard.
      expect(/^натисни клавиш/i.test(t.howBg), `${id} leads with a key`).toBe(false);
    }
  });
});

describe("law citation is retrieved, never recalled (ADR-002)", () => {
  it("every step cites the catalog entry that grades its omission", () => {
    for (const id of PRE_DRIVE_STEP_ORDER) {
      const code = PRE_DRIVE_TUTORIALS[id].gradedByCode;
      const fromCatalog = VIOLATIONS[code].lawRef;
      expect(fromCatalog, `${id} → ${code} has a lawRef`).toBeDefined();
      expect(preDriveTutorialLaw(id), id).toBe(fromCatalog);
    }
  });

  it("the seatbelt step cites the seatbelt article, not the generic one", () => {
    // Spot-check that the mapping is meaningful and not all-чл.-20.
    expect(preDriveTutorialLaw("fasten-seatbelt")).toBe(VIOLATIONS.PREDRIVE_SEATBELT_SKIPPED.lawRef);
    expect(preDriveTutorialLaw("headlights-on")).toBe(VIOLATIONS.HEADLIGHTS_OFF_AT_NIGHT.lawRef);
    expect(preDriveTutorialLaw("final-mirror-check")).toBe(
      VIOLATIONS.MOVE_OFF_WITHOUT_OBSERVATION.lawRef,
    );
    expect(preDriveTutorialLaw("fasten-seatbelt")).not.toBe(preDriveTutorialLaw("adjust-seat"));
  });
});

describe("still → clip swap seam", () => {
  it("resolves to the inline still for every step today (zero clips shipped)", () => {
    expect(Object.keys(PRE_DRIVE_TUTORIAL_CLIPS)).toHaveLength(0);
    for (const id of PRE_DRIVE_STEP_ORDER) {
      const media = preDriveTutorialMedia(id);
      expect(media.kind, id).toBe("still");
      expect(media.stepId).toBe(id);
      expect(media.captionBg).toBe(PRE_DRIVE_TUTORIALS[id].captionBg);
    }
  });

  it("switches that step to the clip the moment one is authored", () => {
    PRE_DRIVE_TUTORIAL_CLIPS["fasten-seatbelt"] = {
      src: "/sim/tutorial/fasten-seatbelt.mp4",
      durationSec: 12,
      transcriptBg: "Издърпай колана бавно и го щракни.",
    };
    const swapped = preDriveTutorialMedia("fasten-seatbelt");
    expect(swapped.kind).toBe("clip");
    if (swapped.kind === "clip") {
      expect(swapped.clip.src).toBe("/sim/tutorial/fasten-seatbelt.mp4");
      // The caption survives the swap — it is the step's, not the media's.
      expect(swapped.captionBg).toBe(PRE_DRIVE_TUTORIALS["fasten-seatbelt"].captionBg);
    }
    // Every OTHER step is untouched by one authored clip.
    expect(preDriveTutorialMedia("start-engine").kind).toBe("still");
  });

  it("holds any authored clip to the founder's 10–15 s budget", () => {
    for (const [stepId, clip] of Object.entries(PRE_DRIVE_TUTORIAL_CLIPS)) {
      if (clip === undefined) continue;
      expect(clip.durationSec, stepId).toBeGreaterThanOrEqual(10);
      expect(clip.durationSec, stepId).toBeLessThanOrEqual(15);
      expect(clip.src.startsWith("/"), stepId).toBe(true);
      expect(clip.transcriptBg.length, stepId).toBeGreaterThan(0);
    }
  });
});
