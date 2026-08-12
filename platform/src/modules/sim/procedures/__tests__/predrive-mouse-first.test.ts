/**
 * D9 — the pre-drive is MOUSE-FIRST (founder review 2026-07-30, ledger 86).
 *
 * His finding: „Currently, the simulator displays thirteen preparation tasks
 * that must be completed almost entirely by pressing keyboard shortcuts. …
 * my first instinct was to skip the lesson entirely."
 *
 * The ledger's answer (D9): the doc-69 cockpit hotspots already exist and are
 * already clickable — they were never presented as the taught path. These
 * tests pin the two halves of that claim so it cannot silently regress:
 *
 *  1. COVERAGE — every dashboard control he listed by name really carries a
 *     hotspot, and every step that advertises a click really has one behind
 *     it (the honesty rule that already governs the key hints);
 *  2. LEADERSHIP — the primary input of a step is never the keyboard.
 */

import { describe, expect, it } from "vitest";
import { COCKPIT_HOTSPOTS } from "../../scene/vitok/hotspots";
import {
  PRE_DRIVE_INFO_STEPS,
  PRE_DRIVE_STEP_CONTROLS,
  preDriveActionBg,
  preDriveActionGlyph,
  preDriveMouseActionBg,
  preDrivePrimaryInput,
  preDriveStepKind,
  preDriveTapActionBg,
  type CockpitHotspotName,
} from "../performedSteps";
import { PRE_DRIVE_STEP_ORDER } from "../steps";
import type { PreDriveStepId } from "../types";

const BUILT_HOTSPOTS: ReadonlySet<string> = new Set(COCKPIT_HOTSPOTS.map((h) => h.name));

describe("D9 · the mouse path exists behind every click hint", () => {
  it("every advertised click is backed by a REAL doc-69 hotspot", () => {
    for (const [stepId, control] of Object.entries(PRE_DRIVE_STEP_CONTROLS)) {
      if (control?.clickBg === undefined) continue;
      expect(control.hotspots.length, stepId).toBeGreaterThan(0);
      for (const name of control.hotspots) {
        expect(BUILT_HOTSPOTS.has(name), `${stepId} → ${name}`).toBe(true);
      }
    }
  });

  it("no step claims a click when no hotspot performs it", () => {
    for (const [stepId, control] of Object.entries(PRE_DRIVE_STEP_CONTROLS)) {
      if (control === undefined) continue;
      const hasHotspot = control.hotspots.length > 0;
      expect(control.clickBg !== undefined, `${stepId} click hint vs hotspot`).toBe(hasHotspot);
    }
  });

  it("the two pedal steps name a PEDAL PAD, not a missing dashboard control", () => {
    // A brake and a throttle have no dashboard control, on any car — but since
    // the 2026-07-30 re-measure a desktop carries the two on-screen pedal pads
    // (lesson-ui/MousePedals.tsx), so „с педал" stopped meaning „not for you".
    // The founder's mouse-only run of the lesson died on step 8 for want of
    // exactly this sentence.
    const pedals = PRE_DRIVE_STEP_ORDER.filter((id) => PRE_DRIVE_STEP_CONTROLS[id]?.pedal === true);
    expect(pedals).toEqual(["press-brake", "move-off"]);
    for (const id of pedals) {
      expect(PRE_DRIVE_STEP_CONTROLS[id]?.clickBg).toBeUndefined();
      expect(PRE_DRIVE_STEP_CONTROLS[id]?.hotspots).toEqual([]);
      const pedalBg = PRE_DRIVE_STEP_CONTROLS[id]?.pedalBg;
      expect(pedalBg, `${id} pedal hint`).toBeDefined();
      expect(pedalBg).toMatch(/мишк/); // it must say the MOUSE does it
    }
  });

  it("only pedal steps carry a pedal hint (the honesty rule, both ways)", () => {
    for (const [stepId, control] of Object.entries(PRE_DRIVE_STEP_CONTROLS)) {
      if (control === undefined) continue;
      expect(
        control.pedalBg !== undefined,
        `${stepId} pedal hint vs pedal flag`,
      ).toBe(control.pedal === true);
    }
  });

  it("ALL THIRTEEN steps have a mouse sentence — his acceptance test, in code", () => {
    // „complete all 13 steps using only the mouse". Every step must be able to
    // TELL the student what the mouse does: a dashboard control to click, a
    // pedal pad to hold, or the checklist's own confirmation.
    for (const id of PRE_DRIVE_STEP_ORDER) {
      const sentence = preDriveMouseActionBg(id);
      expect(sentence.length, `${id} mouse sentence`).toBeGreaterThan(10);
    }
    expect(PRE_DRIVE_STEP_ORDER).toHaveLength(13);
  });

  it("ALL THIRTEEN have a TOUCH sentence too — doc 91 §U1/M6/I12", () => {
    // THE SAME HONESTY RULE, NOW WITH THREE INPUT DEVICES INSTEAD OF TWO.
    //
    // §D10: the pre-drive's copy was mouse-only BY DATA SHAPE — `clickBg`,
    // `pedalBg`, `keys` and no field a touch sentence could live in — so
    // `PreDriveChecklist` told a student holding a phone that «Всяка стъпка се
    // прави с МИШКАТА». The step he called „ultra hard to put BElts" is one of
    // the thirteen below.
    for (const id of PRE_DRIVE_STEP_ORDER) {
      const sentence = preDriveTapActionBg(id);
      expect(sentence.length, `${id} touch sentence`).toBeGreaterThan(10);
      expect(preDriveActionBg(id, "touch"), id).toBe(sentence);
      expect(preDriveActionBg(id, "mouse"), id).toBe(preDriveMouseActionBg(id));
      // A touch sentence may never send a phone student to a mouse.
      expect(sentence, `${id} must not name a mouse`).not.toMatch(/мишк/i);
    }
    // …and every PERFORMED step authors its own rather than falling through to
    // the info-step default (which is the only sentence that may be shared).
    for (const [stepId, control] of Object.entries(PRE_DRIVE_STEP_CONTROLS)) {
      expect(control?.tapBg, `${stepId} tapBg`).toBeDefined();
      expect(control!.tapBg!.length, stepId).toBeGreaterThan(10);
    }
  });

  it("a touch sentence only names controls a phone actually carries", () => {
    // Read off TouchControls.tsx, not invented: the rail («Изглед» «Пауза»
    // «Клаксон» «Кола» «Колан»), the two flanks («Ляв»/«Дясн» indicators,
    // «Дясн»/«Задн»/«Ляво» mirror glances), the two pads, and the ⚙ strip cells
    // behind «Кола» («ДВИГ» «РЪЧНА» «СВЕТЛ» «D►» …). This is the `keys` /
    // `clickBg` honesty rule applied to the third device.
    const PHONE_CONTROLS =
      /Колан|Кола|Ляв|Дясн|Задн|Ляво|ДВИГ|РЪЧНА|СВЕТЛ|D►|подложк/;
    for (const id of PRE_DRIVE_STEP_ORDER) {
      const control = PRE_DRIVE_STEP_CONTROLS[id];
      if (control?.tapBg === undefined) continue;
      expect(control.tapBg, `${id} names a real on-screen control`).toMatch(PHONE_CONTROLS);
    }
    // Every cell that lives inside the CLOSED ⚙ strip says how to open it —
    // naming a control the student cannot see is the defect one step along.
    for (const id of PRE_DRIVE_STEP_ORDER) {
      const tap = PRE_DRIVE_STEP_CONTROLS[id]?.tapBg;
      if (tap === undefined) continue;
      if (!/ДВИГ|РЪЧНА|СВЕТЛ|D►/.test(tap)) continue;
      expect(tap, `${id} must locate the ⚙ strip`).toMatch(/Кола/);
    }
  });

  it("the glyph matches the sentence — 🖱 or ☝, never both", () => {
    expect(preDriveActionGlyph("mouse")).toBe("🖱");
    expect(preDriveActionGlyph("touch")).toBe("☝");
  });

  it("every one of the SEVEN dashboard controls he named is built", () => {
    // brief.txt §"Dashboard Interaction Rework": „headlights, indicators,
    // mirrors, handbrake, ignition, gear selection" + the seat belt he opens
    // the paragraph with. Nothing on his list needs to be BUILT — the whole
    // gap was discoverability.
    const named: readonly CockpitHotspotName[] = [
      "hotspot_belt",
      "hotspot_headlights",
      "hotspot_indicator_stalk",
      "hotspot_mirror_left",
      "hotspot_mirror_right",
      "hotspot_mirror_rear",
      "hotspot_parking_brake",
      "hotspot_engine_start",
      "hotspot_gear_selector",
    ];
    for (const name of named) expect(BUILT_HOTSPOTS.has(name), name).toBe(true);
  });
});

describe("D9 · the keyboard is never the primary input", () => {
  it("classifies all 13 steps as click / pedal / confirm — never key", () => {
    const tally: Record<string, PreDriveStepId[]> = { click: [], pedal: [], confirm: [] };
    for (const id of PRE_DRIVE_STEP_ORDER) tally[preDrivePrimaryInput(id)].push(id);

    // The measured shape of the redesigned lesson: 8 dashboard clicks,
    // 3 walkaround confirmations, 2 pedals. Since the mouse pedal pads landed
    // that is 13 of 13 reachable with a mouse alone; before D9 the checklist
    // offered a mouse affordance on the 3 info rows only.
    expect(tally["click"]).toHaveLength(8);
    expect(tally["confirm"]).toHaveLength(3);
    expect(tally["pedal"]).toHaveLength(2);
    expect(tally["click"].length + tally["confirm"].length + tally["pedal"].length).toBe(13);
  });

  it("the confirm rows are exactly the walkaround info steps", () => {
    const confirm = PRE_DRIVE_STEP_ORDER.filter((id) => preDrivePrimaryInput(id) === "confirm");
    expect(confirm).toEqual([...PRE_DRIVE_INFO_STEPS]);
    for (const id of confirm) expect(preDriveStepKind(id)).toBe("info");
  });

  it("keeps every key cap that already worked — nothing was taken away", () => {
    // Demoted, not deleted: the advanced student still has all ten.
    const withKeys = PRE_DRIVE_STEP_ORDER.filter(
      (id) => (PRE_DRIVE_STEP_CONTROLS[id]?.keys.length ?? 0) > 0,
    );
    expect(withKeys).toHaveLength(10);
  });
});
