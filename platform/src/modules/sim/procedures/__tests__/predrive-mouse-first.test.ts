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
  preDrivePrimaryInput,
  preDriveStepKind,
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

  it("the two pedal steps say so instead of pretending to be clickable", () => {
    // The honest residue of D9: a brake and a throttle have no dashboard
    // control, on any car. Everything else does.
    const pedals = PRE_DRIVE_STEP_ORDER.filter((id) => PRE_DRIVE_STEP_CONTROLS[id]?.pedal === true);
    expect(pedals).toEqual(["press-brake", "move-off"]);
    for (const id of pedals) {
      expect(PRE_DRIVE_STEP_CONTROLS[id]?.clickBg).toBeUndefined();
      expect(PRE_DRIVE_STEP_CONTROLS[id]?.hotspots).toEqual([]);
    }
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
    // 3 walkaround confirmations, 2 pedals = 11 of 13 reachable with a mouse
    // alone; before this change the checklist offered a mouse affordance on
    // the 3 info rows only.
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
