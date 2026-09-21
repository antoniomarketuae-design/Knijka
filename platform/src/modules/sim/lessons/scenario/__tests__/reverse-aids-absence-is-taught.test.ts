import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioSpec } from "../types";
import { rearCueLabelBg, type RearCueKind } from "../../../hud/rearProximity";

/**
 * =============================================================================
 * THE MISSING REVERSE AIDS ARE DELIBERATE — SO THE LESSON HAS TO SAY SO
 * — founder ruling 2026-09-21, registered decision 18, option B.
 * =============================================================================
 *
 * THE ROWS. `sc-ed-reverse-line:1f812456` («There is no rear-facing camera
 * image») and `:e05f2cee` («There is no rear proximity read-out on screen at
 * any point of the reverse manoeuvre»). Both were filed as missing features.
 *
 * THE RULING. They are not missing features, they are the lesson: a rear camera
 * would perform the very duty this drill GRADES — the look over the shoulder
 * and into the mirrors, чл. 40. The founder was given three options (build
 * them / deliberate-and-say-so / split) and chose **deliberate, and the product
 * must say so on the glass**.
 *
 * SO THE ABSENCE IS NOW A CLAIM THE LESSON MAKES, and a claim can be tested.
 * That is the whole point of this file: without it, «the product says so» is a
 * sentence in a commit message, and the next person to shorten a briefing for a
 * 780x360 phone (which has happened — 4209dad) would delete the ruling without
 * knowing it was one.
 *
 * WHY THIS IS NOT A SOURCE GREP. It reads the COMPILED template registry, the
 * same object the shell renders from, so it fails if the step is removed, if
 * the lesson stops authoring `instructionsBg`, or if the text moves to a field
 * nothing renders. A regex over templates-exam.ts would pass on all three.
 */

const spec = (id: string): ScenarioSpec => {
  const s = SCENARIO_TEMPLATES.find((t) => t.id === id);
  if (!s) throw new Error(`no template ${id} — re-anchor this test`);
  return s as ScenarioSpec;
};

/** Every authored instruction line of a lesson, joined — the text on the glass. */
const briefingText = (id: string): string =>
  (spec(id).instructionsBg ?? []).map((i) => i.textBg).join(" · ");

describe("sc-ed-reverse-line teaches that the reverse aids are absent ON PURPOSE", () => {
  it("names the absent camera — a student must not read the blank glass as a broken car", () => {
    const t = briefingText("sc-ed-reverse-line");
    expect(t, "the briefing no longer names the camera").toMatch(/камера/iu);
    expect(t, "the absence is no longer stated as an absence").toMatch(/камера[^.]*няма/iu);
  });

  /*
   * THE FIRST VERSION OF THIS FILE PINNED A FALSE SENTENCE. It required the
   * briefing to name «датчици» as absent, and the briefing obliged: «Камера и
   * датчици за заден ход няма». But `hud/RearProximityCue.tsx` is mounted in
   * every lesson and prints «Кола отзад · X м» whenever a car is behind — so on
   * any frame with a car behind the player the glass contradicted itself, and
   * this test was the thing holding the contradiction in place. An adversarial
   * verifier found it (w53); these two tests are the correction.
   *
   * They read the chip's OWN label function, not a copy of its strings, so a
   * renamed chip fails here instead of leaving the briefing describing a badge
   * that no longer exists.
   */
  const CHIP_KINDS: readonly RearCueKind[] = ["vehicle", "cyclist"];
  const chipLabels = CHIP_KINDS.map((kind) => rearCueLabelBg({ kind, meters: 7, level: "warn" }));

  it("never denies the rear chip the product ships — the sentence must be true on every frame", () => {
    const t = briefingText("sc-ed-reverse-line");
    expect(t, "the briefing claims there are no rear sensors while the chip exists").not.toMatch(
      /(датчиц|сензор)[^.]*няма|няма[^.]*(датчиц|сензор)/iu,
    );
    // The briefing names the chip by the one word every label of it shares.
    for (const label of chipLabels) expect(label, "the chip's label lost «отзад»").toMatch(/ отзад · /u);
    expect(t, "the briefing no longer names the distance-behind chip").toMatch(/табелката за разстояние отзад/iu);
  });

  it("names what the chip does NOT see — on that chip silence reads as «clear»", () => {
    const t = briefingText("sc-ed-reverse-line");
    // What it reports: exactly the kinds `RearCueKind` enumerates. If a kind is
    // ever added, CHIP_KINDS stops being exhaustive and this sentence is stale —
    // the `satisfies` below makes that a type error rather than a silent pass.
    const exhaustive = { vehicle: true, cyclist: true } satisfies Record<RearCueKind, true>;
    expect(Object.keys(exhaustive)).toEqual([...CHIP_KINDS]);
    expect(t, "the briefing no longer says the chip reports cars").toMatch(/коли/iu);
    expect(t, "the briefing no longer says the chip reports cyclists").toMatch(/велосипедист/iu);
    // What it does not — and neither label can ever say it.
    for (const blind of [/пешеход/iu, /стен/iu]) {
      for (const label of chipLabels) expect(label).not.toMatch(blind);
      expect(t, `the briefing no longer names the chip's blind spot ${blind}`).toMatch(blind);
    }
  });

  it("says WHY, which is the half that makes it teaching rather than an apology (THEO-4)", () => {
    const t = briefingText("sc-ed-reverse-line");
    // The ruling's reason: it is the student's own look that is assessed, and
    // the exam gives him no aid either. Either half alone is a bare statement.
    expect(t, "the briefing no longer ties the absence to the exam").toMatch(/изпит/iu);
    expect(t, "the briefing no longer says the LOOK is what is graded").toMatch(/оглед|огледал|през рамо/iu);
  });

  it("keeps it on the step that already teaches the look back, not as an extra row", () => {
    // A seventh row is the thing that overflows a 780x360 phone; the ruling's
    // sentence rides on step 4, where «обърни се и гледай през рамо» already is.
    const steps = spec("sc-ed-reverse-line").instructionsBg ?? [];
    const carrying = steps.filter((s) => /камера/iu.test(s.textBg));
    expect(carrying.length, "the camera sentence is on more than one step, or on none").toBe(1);
    expect(carrying[0].textBg, "it moved off the look-back step").toMatch(/през рамо/iu);
  });

  it("the drill still grades the look it now explains — the ruling removes no duty", () => {
    // If a later edit ever DID add a camera, this is the assertion that should
    // stop it: the lesson's own law reference for the duty is чл. 40.
    expect(briefingText("sc-ed-reverse-line")).toMatch(/чл\.\s*40/u);
  });
});
