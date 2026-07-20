/**
 * Doc 62 S1 — SIGNAL RENDER DESYNC regression gate: the lamp state the world
 * RENDERS (SignalController.lampState / WorldRuntime.signalLampState — the
 * getter the TrafficLights component consumes per head) must derive from the
 * SAME mode + offset state the stop lines GRADE, for every cluster mode:
 *
 *  - live:          lampState(head bearing) == phaseForClusterGroup(approach
 *                   axis) — each head lights its OWN arm's graded group;
 *  - dark:          lampState == "dark" AND the cluster grades UNCONTROLLED
 *                   (no signal codes at the line) — founder #17 „Загаснал
 *                   светофар" showed a live green;
 *  - flashingAmber: lampState blinks amberFlashOn/Off on the controller's own
 *                   clock AND the cluster grades UNCONTROLLED — founder #18
 *                   „Мигащо жълто" had no blink;
 *  - pinned:        after an offset rebase (offsetForPhaseStart — the
 *                   signalPlan / amberDilemma dial) the rendered lamp and the
 *                   graded phase move together — founder #21 redYellow drill
 *                   showed green;
 *  - controlled:    the lamps KEEP cycling live (misleading-but-visible,
 *                   ЗДвП чл. 7) while the controller's permission grades.
 *
 * Against the committed sx-v1 (single-node cluster sx-n-c at the origin,
 * node group "ns"; south approach travel bearing 0, east-arm approach 270).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createWorldRuntime, parseDistrict } from "..";
import {
  FLASHING_AMBER_ON_SEC,
  FLASHING_AMBER_PERIOD_SEC,
  SignalController,
} from "../signals";
import { DistrictIndex } from "../spatial";

const SX_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../content/world/sx-v1.json",
);
const sxRaw = JSON.parse(readFileSync(SX_PATH, "utf-8")) as unknown;

const NODE = "sx-n-c";
/** South-stem travel bearing into the junction (northbound) — axis "ns". */
const BEARING_NS = 0;
/** West-arm travel bearing into the junction (eastbound) — axis "ew". */
const BEARING_EW = 90;

function mkSignals(): SignalController {
  const district = parseDistrict(sxRaw);
  return new SignalController(district, new DistrictIndex(district));
}

describe("SignalController.lampState — render == graded, per mode (doc 62 S1)", () => {
  it("live: every head shows its OWN approach axis-group's graded phase, at all times", () => {
    const s = mkSignals();
    for (let step = 0; step < 120; step++) {
      s.update(0.7); // sweeps > one full 50 s cycle, off-grid times
      expect(s.lampState(NODE, BEARING_NS)).toBe(s.phaseForClusterGroup(0, "ns"));
      expect(s.lampState(NODE, BEARING_EW)).toBe(s.phaseForClusterGroup(0, "ew"));
    }
    // Bearing omitted = the node's own assigned group (the legacy read).
    expect(s.lampState(NODE)).toBe(s.phase(NODE));
  });

  it("dark: heads render unlit exactly while the cluster grades uncontrolled", () => {
    const s = mkSignals();
    s.setClusterMode(NODE, "dark");
    expect(s.isClusterUncontrolled(0)).toBe(true); // the graded half
    s.update(13.7);
    expect(s.lampState(NODE, BEARING_NS)).toBe("dark"); // the rendered half
    expect(s.lampState(NODE, BEARING_EW)).toBe("dark");
    s.setClusterMode(NODE, "live");
    expect(s.isClusterUncontrolled(0)).toBe(false);
    expect(s.lampState(NODE, BEARING_NS)).toBe(s.phaseForClusterGroup(0, "ns"));
  });

  it("flashingAmber: the blink rides the controller's own clock; the cluster grades uncontrolled", () => {
    const s = mkSignals();
    s.setClusterMode(NODE, "flashingAmber");
    expect(s.isClusterUncontrolled(0)).toBe(true);
    s.update(0.3); // t = 0.3 — first half of the period
    expect(s.lampState(NODE, BEARING_NS)).toBe("amberFlashOn");
    s.update(0.3); // t = 0.6 — second half
    expect(s.lampState(NODE, BEARING_NS)).toBe("amberFlashOff");
    s.update(0.5); // t = 1.1 — next period, on again
    expect(s.lampState(NODE, BEARING_EW)).toBe("amberFlashOn");
    // The timetable constants are the single source of the blink truth.
    expect(FLASHING_AMBER_ON_SEC).toBeLessThan(FLASHING_AMBER_PERIOD_SEC);
  });

  it("deterministic: two controllers fed the same dt sequence render identical lamp states", () => {
    const a = mkSignals();
    const b = mkSignals();
    a.setClusterMode(NODE, "flashingAmber");
    b.setClusterMode(NODE, "flashingAmber");
    for (const dt of [0.016, 0.45, 0.016, 0.3, 2.2, 0.016]) {
      a.update(dt);
      b.update(dt);
      expect(a.lampState(NODE, BEARING_NS)).toBe(b.lampState(NODE, BEARING_NS));
    }
  });

  it("pinned greenFresh: the rendered lamp and the graded phase rebase together (#19/#21)", () => {
    const s = mkSignals();
    s.update(31.4); // arbitrary mid-cycle moment (the live-play pre-pin drift)
    s.setClusterOffset(NODE, s.offsetForPhaseStart(NODE, BEARING_NS, "green", 0));
    // Render == graded at the pin…
    expect(s.phaseForClusterGroup(0, "ns")).toBe("green");
    expect(s.lampState(NODE, BEARING_NS)).toBe("green");
    // …the cross-street head shows ITS graded group, never the player's…
    expect(s.lampState(NODE, BEARING_EW)).toBe(s.phaseForClusterGroup(0, "ew"));
    expect(s.lampState(NODE, BEARING_EW)).not.toBe("green");
    // …and green RETURNS on the graded cycle (the #19 "never again" pin):
    s.update(50);
    expect(s.phaseForClusterGroup(0, "ns")).toBe("green");
    expect(s.lampState(NODE, BEARING_NS)).toBe("green");
  });

  it("pinned redFresh: the full taught arc (red → redYellow → green) renders from the graded clock (#21)", () => {
    const s = mkSignals();
    s.update(7.9);
    s.setClusterOffset(NODE, s.offsetForPhaseStart(NODE, BEARING_NS, "red", 0));
    expect(s.lampState(NODE, BEARING_NS)).toBe("red");
    expect(s.phaseForClusterGroup(0, "ns")).toBe("red");
    s.update(26.5); // red runs 26 s → inside the 1 s redYellow window
    expect(s.lampState(NODE, BEARING_NS)).toBe("redYellow");
    expect(s.phaseForClusterGroup(0, "ns")).toBe("redYellow");
    s.update(1); // clean green
    expect(s.lampState(NODE, BEARING_NS)).toBe("green");
    expect(s.phaseForClusterGroup(0, "ns")).toBe("green");
  });

  it("controlled: the lamps keep cycling live (misleading-but-visible) — never dark, never blinking", () => {
    const s = mkSignals();
    s.setClusterController(NODE, { haltedGroup: "ns" });
    const seen = new Set<string>();
    for (let t = 0; t < 50; t += 0.5) {
      s.update(0.5);
      const lamp = s.lampState(NODE, BEARING_NS);
      expect(lamp).toBe(s.phaseForClusterGroup(0, "ns"));
      seen.add(lamp);
    }
    expect([...seen].sort()).toEqual(["green", "red", "redYellow", "yellow"]);
  });

  it("unknown ids fail like phase(): red, never a phantom green", () => {
    const s = mkSignals();
    expect(s.lampState("no-such-node", BEARING_NS)).toBe("red");
  });
});

describe("WorldRuntime.signalLampState — the render seam the scene wires (doc 62 S1)", () => {
  it("delegates mode + approach + pin through one getter (the LessonScene callback)", () => {
    const rt = createWorldRuntime(sxRaw);
    rt.update(3.2);
    expect(rt.signalLampState(NODE, BEARING_NS)).toBe(rt.signalPhaseForApproach(NODE, BEARING_NS));
    rt.setSignalClusterMode(NODE, "dark");
    expect(rt.signalLampState(NODE, BEARING_NS)).toBe("dark");
    rt.setSignalClusterMode(NODE, "flashingAmber");
    const lamp = rt.signalLampState(NODE, BEARING_NS);
    expect(lamp === "amberFlashOn" || lamp === "amberFlashOff").toBe(true);
    rt.setSignalClusterMode(NODE, "live");
    rt.setSignalClusterOffset(NODE, rt.signalOffsetForPhaseStart(NODE, BEARING_NS, "green", 0));
    expect(rt.signalLampState(NODE, BEARING_NS)).toBe("green");
  });
});
