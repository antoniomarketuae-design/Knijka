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
  preDriveClipWeightBg,
  preDriveTutorialLaw,
  preDriveTutorialMedia,
  type PreDriveTutorialClip,
} from "../tutorial";

/**
 * THE SWAP-SEAM TESTS MUTATE THE SHIPPED REGISTRY, so they must put it back.
 *
 * This used to `delete` every key after each test, written when the registry
 * was empty and „restore" and „empty" were the same thing. The first real clip
 * (`adjust-seat`, 2026-08-10) turned that into test pollution with a straight
 * face: the „zero clips shipped" assertion below passed only because the
 * previous test's cleanup had thrown the shipped clip away. Snapshot/restore
 * instead, so the file measures the registry that actually ships.
 */
const SHIPPED: Partial<Record<string, PreDriveTutorialClip>> = { ...PRE_DRIVE_TUTORIAL_CLIPS };

afterEach(() => {
  for (const k of Object.keys(PRE_DRIVE_TUTORIAL_CLIPS)) {
    delete PRE_DRIVE_TUTORIAL_CLIPS[k as keyof typeof PRE_DRIVE_TUTORIAL_CLIPS];
  }
  Object.assign(PRE_DRIVE_TUTORIAL_CLIPS, SHIPPED);
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
  it("resolves to the inline still for every step that has no clip", () => {
    for (const id of PRE_DRIVE_STEP_ORDER) {
      const media = preDriveTutorialMedia(id);
      expect(media.kind, id).toBe(PRE_DRIVE_TUTORIAL_CLIPS[id] === undefined ? "still" : "clip");
      expect(media.stepId).toBe(id);
      // The caption is the STEP's, either way — the media never owns it.
      expect(media.captionBg).toBe(PRE_DRIVE_TUTORIALS[id].captionBg);
    }
  });

  it("the still is the floor: the great majority of steps still have no clip", () => {
    // THE STILL IS NOT A PLACEHOLDER THE CLIPS ARE REPLACING. It is what the
    // checklist teaches from when a student never taps play, is offline, or is
    // on a connection that cannot afford 2–9 MB, and every step must keep one.
    const withClip = PRE_DRIVE_STEP_ORDER.filter((id) => PRE_DRIVE_TUTORIAL_CLIPS[id]);
    expect(withClip.length).toBeLessThan(PRE_DRIVE_STEP_ORDER.length);
  });

  it("switches that step to the clip the moment one is authored", () => {
    PRE_DRIVE_TUTORIAL_CLIPS["fasten-seatbelt"] = {
      src: "/sim/tutorial/fasten-seatbelt.mp4",
      posterSrc: "/sim/tutorial/fasten-seatbelt.webp",
      durationSec: 12,
      bytes: 5_400_000,
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
      // …and every clip declares the two things tap-to-play needs: something
      // cheap to show first, and the price of the tap. Both are verified
      // against the real files in `predrive-clip-weight.test.ts`.
      expect(clip.posterSrc.startsWith("/"), `${stepId} poster`).toBe(true);
      expect(clip.bytes, `${stepId} bytes`).toBeGreaterThan(0);
    }
  });
});

describe("the price printed on the play button", () => {
  it("reads in decimal MB with a Bulgarian comma — the units a bundle is sold in", () => {
    expect(preDriveClipWeightBg(2_022_418)).toBe("2,0 MB");
    expect(preDriveClipWeightBg(8_990_000)).toBe("9,0 MB");
    expect(preDriveClipWeightBg(5_400_000)).toBe("5,4 MB");
  });

  it("drops to KB below a megabyte rather than printing „0,0 MB“", () => {
    expect(preDriveClipWeightBg(27_496)).toBe("27 KB");
    expect(preDriveClipWeightBg(999_000)).toBe("999 KB");
    expect(preDriveClipWeightBg(1_000_000)).toBe("1,0 MB");
  });

  it("never depends on the runtime's ICU data", () => {
    // `Intl.NumberFormat("bg-BG")` would return "2" on a small-icu build and
    // "2,0" on a full one; a test that passes on this box and prints an English
    // decimal point on the VPS is the kind of green nobody checks.
    expect(preDriveClipWeightBg(2_022_418)).not.toContain(".");
  });
});
