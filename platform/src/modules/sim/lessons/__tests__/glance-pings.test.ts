/**
 * Glance edge pings (founder 2026-07-20) — the pure gating + derivation the
 * GlanceEdgePings overlay renders. The graded channel (mirrorGlance events →
 * JU-23) is only CONSUMED here; these tests pin that the pings arm exactly
 * where the drill grades the scan and satisfy-and-clear from the same events.
 */

import { describe, expect, it } from "vitest";
import type { LessonSpec } from "../../contracts";
import type { SimTick } from "../../rules";
import {
  createGlancePingsState,
  GLANCE_PING_APPROACH_M,
  GLANCE_PING_MIN_ARM_KMH,
  glancePingsEligible,
  observeGlancePingsTick,
  resetGlancePings,
  type GlancePingsState,
} from "../advisor";
import { makeTick } from "./fixtures";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function scanLesson(overrides: Partial<LessonSpec> = {}): LessonSpec {
  return {
    id: "t-glance-pings",
    order: 1,
    titleBg: "Тест пингове",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
    preDrive: false,
    objectives: [],
    ruleConfig: { junctionScanObservationEnabled: true },
    ...overrides,
  };
}

/** Moving approach tick toward a scan-graded line `m` meters ahead. */
function approachTick(
  m: number,
  overrides: Partial<SimTick> = {},
): SimTick {
  return makeTick({
    speedKmh: 25,
    nextStopLineM: m,
    nextStopLineControl: "giveWay",
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Gate (founder-ratified: JU-23 drills only, L1–L2, advisor gate, never exams)
// ---------------------------------------------------------------------------

describe("glancePingsEligible", () => {
  it("requires the lesson to GRADE the junction scan (JU-23 opt-in)", () => {
    expect(glancePingsEligible(scanLesson())).toBe(true);
    expect(glancePingsEligible(scanLesson({ ruleConfig: {} }))).toBe(false);
    expect(glancePingsEligible(scanLesson({ ruleConfig: undefined }))).toBe(false);
  });

  it("follows the advisor's ONE rung gate: scenario L1–L2 on, L3+ off", () => {
    const base = scanLesson({ order: 99 });
    expect(glancePingsEligible({ ...base, id: "sc-jx-giveway@L1" })).toBe(true);
    expect(glancePingsEligible({ ...base, id: "sc-jx-giveway@L2" })).toBe(true);
    expect(glancePingsEligible({ ...base, id: "sc-jx-giveway@L3" })).toBe(false);
    expect(glancePingsEligible({ ...base, id: "sc-jx-giveway@L5" })).toBe(false);
  });

  it("curriculum lessons follow the same gate via order", () => {
    expect(glancePingsEligible(scanLesson({ order: 2 }))).toBe(true);
    expect(glancePingsEligible(scanLesson({ order: 3 }))).toBe(false);
  });

  it("is ALWAYS off on exam sessions, drill flag or not", () => {
    expect(glancePingsEligible(scanLesson({ examMode: true }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Derivation (tick stream → ping phases)
// ---------------------------------------------------------------------------

describe("observeGlancePingsTick", () => {
  it("stays idle with no watched stop line", () => {
    const s = createGlancePingsState();
    expect(observeGlancePingsTick(s, makeTick({ speedKmh: 30 }))).toBe(false);
    expect(s).toMatchObject({ armed: false, left: "off", right: "off" });
  });

  it("arms BOTH pings entering the approach window of a give-way line", () => {
    const s = createGlancePingsState();
    expect(observeGlancePingsTick(s, approachTick(GLANCE_PING_APPROACH_M + 5))).toBe(false);
    expect(observeGlancePingsTick(s, approachTick(GLANCE_PING_APPROACH_M - 5))).toBe(true);
    expect(s).toMatchObject({ armed: true, left: "ping", right: "ping" });
    // Steady approach: no phase change → no re-render churn.
    expect(observeGlancePingsTick(s, approachTick(30))).toBe(false);
  });

  it("arms on Б2 stop-sign lines too, never on traffic lights", () => {
    const stop = createGlancePingsState();
    expect(
      observeGlancePingsTick(stop, approachTick(20, { nextStopLineControl: "stopSign" })),
    ).toBe(true);
    expect(stop.armed).toBe(true);

    const light = createGlancePingsState();
    expect(
      observeGlancePingsTick(light, approachTick(20, { nextStopLineControl: "trafficLight" })),
    ).toBe(false);
    expect(light.armed).toBe(false);
  });

  it("does not arm while (nearly) stationary — a spawn near a line must not ping through the pre-drive", () => {
    const s = createGlancePingsState();
    expect(observeGlancePingsTick(s, approachTick(20, { speedKmh: 0 }))).toBe(false);
    expect(s.armed).toBe(false);
    // The same line pings the moment the car actually moves off.
    expect(
      observeGlancePingsTick(s, approachTick(20, { speedKmh: GLANCE_PING_MIN_ARM_KMH })),
    ).toBe(true);
  });

  it("keeps pending pings while WAITING at the line (armed survives speed 0)", () => {
    const s = createGlancePingsState();
    observeGlancePingsTick(s, approachTick(30));
    expect(observeGlancePingsTick(s, approachTick(1.5, { speedKmh: 0 }))).toBe(false);
    expect(s).toMatchObject({ armed: true, left: "ping", right: "ping" });
  });

  it("a side's GRADED glance flips its ping to the ✓ confirmation", () => {
    const s = createGlancePingsState();
    observeGlancePingsTick(s, approachTick(40));
    expect(
      observeGlancePingsTick(
        s,
        approachTick(35, { events: [{ kind: "mirrorGlance", mirror: "left" }] }),
      ),
    ).toBe(true);
    expect(s).toMatchObject({ left: "done", right: "ping" });
    // Rear glances and repeat glances change nothing.
    expect(
      observeGlancePingsTick(
        s,
        approachTick(30, {
          events: [
            { kind: "mirrorGlance", mirror: "rear" },
            { kind: "mirrorGlance", mirror: "left" },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      observeGlancePingsTick(
        s,
        approachTick(25, { events: [{ kind: "mirrorGlance", mirror: "right" }] }),
      ),
    ).toBe(true);
    expect(s).toMatchObject({ left: "done", right: "done" });
  });

  it("clears everything once the line leaves the watch window (junction passed)", () => {
    const s = createGlancePingsState();
    observeGlancePingsTick(s, approachTick(30));
    expect(observeGlancePingsTick(s, makeTick({ speedKmh: 30 }))).toBe(true);
    expect(s).toMatchObject({ armed: false, left: "off", right: "off" });
    // Already clear → no further transitions reported.
    expect(observeGlancePingsTick(s, makeTick({ speedKmh: 30 }))).toBe(false);
  });

  it("re-pings for a NEW line that enters the window right after the last (distance jump-up)", () => {
    const s = createGlancePingsState();
    observeGlancePingsTick(s, approachTick(20));
    observeGlancePingsTick(
      s,
      approachTick(2, { events: [{ kind: "mirrorGlance", mirror: "left" }] }),
    );
    expect(s.left).toBe("done");
    // Crossed; the next mouth is already 40 m out — fresh junction, fresh pings.
    expect(observeGlancePingsTick(s, approachTick(40))).toBe(true);
    expect(s).toMatchObject({ armed: true, left: "ping", right: "ping" });
  });

  it("resetGlancePings returns to idle (advisor toggled off mid-approach)", () => {
    const s: GlancePingsState = createGlancePingsState();
    observeGlancePingsTick(s, approachTick(30));
    resetGlancePings(s);
    expect(s).toMatchObject({ armed: false, left: "off", right: "off" });
    expect(s.lastLineM).toBe(Number.POSITIVE_INFINITY);
  });
});
