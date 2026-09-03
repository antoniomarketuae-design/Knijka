/**
 * THE KEYBOARD LEGEND'S LIFETIME, AND THE TWO WAYS IT CAN BE WRONG.
 *
 * The defect these guard, measured by the catalogue sweep on the deployed build:
 * `[data-hud="controls-help"]` opened itself on every desktop lesson without a
 * pre-drive procedure and then had no exit but a click. On
 * sc-follow-distance/pc-right it was still open at 12 s and 11 км/ч, printing
 * ghost key caps across the buildings on the left third of the windscreen; on
 * sc-junction-rhr/pc-right it was open at 01-arrival over exactly the side a
 * right-hand-priority lesson tells the student to look at; on sc-jx-giveway-b1
 * the shadow-ribbon legend was drawn across it, two ghost text layers deep.
 *
 * Every row below FAILS on the old code: there was no `controlsLegendStandsDown`
 * to call and `ControlsHelp` had no effect to bind it to. The OTHER-DIRECTION
 * rows are the point of the file, though — a panel that folds itself away while
 * the student is reading it, or that will not stay open when re-opened, is the
 * same crime as one that never leaves.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTROLS_LEGEND_MOVING_KMH,
  CONTROLS_LEGEND_POLL_MS,
  controlsLegendStandsDown,
} from "../controlsLegendLifetime";
import { TOUCH_HINT_MOVING_KMH } from "../touchHintLifetime";

describe("the legend folds away when the car is actually driving", () => {
  it("a car at rest KEEPS it — this is the direction that must not regress", () => {
    // 01-arrival: briefing on screen, engine running, nothing rolling. This is
    // the state the founder-facing default was chosen for („no other way to
    // discover the controls"), and a collapse here would be a fix that deleted
    // the reason the panel exists.
    expect(controlsLegendStandsDown(0)).toBe(false);
  });

  it("…and so does a car creeping below the grader's own „moving“ floor", () => {
    // Idle creep in D, a nudge off the pad, roll-back on a slope. None of these
    // is a student who has finished reading.
    expect(controlsLegendStandsDown(CONTROLS_LEGEND_MOVING_KMH)).toBe(false);
    expect(controlsLegendStandsDown(CONTROLS_LEGEND_MOVING_KMH - 0.01)).toBe(false);
    expect(controlsLegendStandsDown(1)).toBe(false);
  });

  it("a car under way clears it — including the frame that was photographed", () => {
    expect(controlsLegendStandsDown(CONTROLS_LEGEND_MOVING_KMH + 0.01)).toBe(true);
    // THE ROW THE SWEEP MEASURED. sc-follow-distance/pc-right/04-t012s: the
    // cluster reads 11 км/ч, the drive is 12 s old, and the sheet is still open
    // over the buildings. At 11 км/ч it is now gone within one poll.
    expect(controlsLegendStandsDown(11)).toBe(true);
    expect(controlsLegendStandsDown(50)).toBe(true);
  });

  it("REVERSING is driving — a bay manoeuvre is not reading time either", () => {
    // `speedKmh` is a magnitude today. If a signed reading ever lands, a student
    // backing into a bay must not be the one case where the panel is immortal.
    expect(controlsLegendStandsDown(-12)).toBe(true);
    expect(controlsLegendStandsDown(-1)).toBe(false);
  });

  it("an UNREADABLE speed keeps it — a bad number may not remove a control list", () => {
    // The failing direction is chosen. NaN/±Infinity are not evidence that the
    // student is driving; leaving the sheet open costs a panel on a screen the
    // student can still close by hand.
    expect(controlsLegendStandsDown(Number.NaN)).toBe(false);
    expect(controlsLegendStandsDown(Number.POSITIVE_INFINITY)).toBe(false);
    expect(controlsLegendStandsDown(Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it("the floor IS the rule engine's, read out of the config it belongs to", () => {
    // Copied by value so this stays a Node-testable leaf, so the copy is checked
    // against its source on every run rather than trusted. If `movingSpeedKmh`
    // moves, this fails here instead of the legend quietly disagreeing with the
    // grader about whether the student is driving.
    const types = readFileSync(
      join(__dirname, "../../../../modules/sim/rules/types.ts"),
      "utf8",
    );
    const m = types.match(/\n\s*movingSpeedKmh:\s*([\d.]+),/);
    expect(m, "movingSpeedKmh literal in rules/types.ts").not.toBeNull();
    expect(Number(m?.[1])).toBe(CONTROLS_LEGEND_MOVING_KMH);
    // …and it is the SAME floor the first-run touch hint stands down at. Two
    // surfaces answering „is he driving yet?" with two different numbers would
    // be a screen that disagrees with itself about the same second.
    expect(CONTROLS_LEGEND_MOVING_KMH).toBe(TOUCH_HINT_MOVING_KMH);
  });

  it("the poll is cheap enough to be honest about, and slower than the hint's", () => {
    // It exists only while the sheet is open and the latch has not fired. The
    // hint is bare type over the middle of a phone screen and polls at 100 ms;
    // this is a desktop corner panel, and a quarter second is the cadence the
    // cabin state beside it is already read at.
    expect(CONTROLS_LEGEND_POLL_MS).toBeGreaterThanOrEqual(100);
    expect(CONTROLS_LEGEND_POLL_MS).toBeLessThanOrEqual(500);
  });
});

/**
 * …AND THE WIRING. A rule nobody bound is exactly the defect the sweep found —
 * the panel had a considered default and no code that ever ended it.
 * `LessonScene.tsx` cannot be imported into a Node test (R3F, rapier wasm, the
 * district loader), so it is read as source: the same device
 * `touchHintLifetime.test.ts` uses on the block directly above this one.
 */
describe("LessonScene binds the legend's exit, and binds it ONE WAY", () => {
  const SCENE = readFileSync(join(__dirname, "../../LessonScene.tsx"), "utf8");

  it("the scene hands ControlsHelp the sample it has to read", () => {
    const mount = SCENE.slice(
      SCENE.indexOf("<ControlsHelp"),
      SCENE.indexOf("/>", SCENE.indexOf("<ControlsHelp")),
    );
    expect(mount.length).toBeGreaterThan(0);
    expect(mount).toContain("sampleRef={sampleRef}");
    // THE EXPECTATION MOVED, AND HERE IS WHY. It used to pin
    // `defaultOpen={!touchOnly && !driveLockedAtMount}` as „the founder-facing
    // default is untouched". The product changed: the sheet no longer opens
    // itself on ANY device, because the reason the open default existed —
    // „a first-time student … has no other way to discover the controls" —
    // stopped being true of this screen. The cockpit control strip prints the
    // key caps under the controls themselves (СПИРАЧКА S · ГАЗ W · Л Q/З F/Д E,
    // legible in the very frame the row was filed on) and the collapsed state
    // is a labelled «⌨ Клавиши · за напреднали ▸» pill. Doc 88 carries the
    // „expanded by default" row on fifteen lessons; doc 87 B7 names this exact
    // mount as its owner. The LIFETIME below is unchanged — this file's subject
    // is still that the panel has an end as well as a beginning.
    expect(mount).toContain("defaultOpen={false}");
  });

  it("the poll reads the vehicle sample's speed through the shared predicate", () => {
    expect(SCENE).toContain("controlsLegendStandsDown(sampleRef.current.speedKmh)");
    expect(SCENE).toContain("CONTROLS_LEGEND_POLL_MS");
  });

  it("…and it is a LATCHED event, so re-opening mid-drive sticks", () => {
    // THE ROW THAT MATTERS. Written as a standing condition the collapse would
    // re-fire every poll, and a student who re-opened the sheet at speed would
    // watch it shut a quarter-second later — an auto-hide that will not let you
    // look. The effect must therefore both READ the latch as a guard and SET it
    // before collapsing.
    const start = SCENE.indexOf("const autoCollapsedRef = useRef(false);");
    expect(start).toBeGreaterThan(-1);
    const effect = SCENE.slice(start, SCENE.indexOf("}, [open, sampleRef]);", start));
    expect(effect.length).toBeGreaterThan(0);
    expect(effect).toContain("autoCollapsedRef.current) return;");
    expect(effect).toContain("autoCollapsedRef.current = true;");
    expect(effect).toContain("setOpen(false)");
    // …and it does NOT persist. There is no device-wide „seen" flag for a piece
    // of per-lesson furniture: the next lesson opens with the sheet again, at a
    // standstill, where it is legible and covers nothing that is moving.
    expect(effect).not.toContain("localStorage");
  });
});
