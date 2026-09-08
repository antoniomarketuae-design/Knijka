/**
 * =============================================================================
 * THE В26 DISC STOPS STATING A ROAD THE CAR HAS LEFT.
 * `sc-ac-truck-spray:7e53374c` (critical), sweep 161.
 * =============================================================================
 *
 * THE FRAME, opened before anything was changed
 * (`.audit-frames/sweep161/sc-ac-truck-spray/mobile-wrong/04-t102s.png`):
 * «145 км/ч across open green field with no road anywhere in frame — the car
 * left the carriageway entirely and the sim keeps driving, keeps the 140 limit
 * chip on screen and raises no off-road state.»
 *
 * TWO THIRDS OF THAT ROW WERE ALREADY CLOSED BY PRODUCT COMMITS and are not
 * re-litigated here: the off-road STATE (`rules/catalog.ts OFF_CARRIAGEWAY` +
 * its detector, 56cc3f8; `lessons/finish.ts stepOffNetwork`; the coach's route
 * hold) and the „large untextured translucent grey plane … above the field",
 * which was `components/sim/VehicleRig.tsx`'s windshield tint pane ending in
 * mid-air over the bonnet. What no commit had touched is the third clause — the
 * chip — and §1 below is the measurement that says so, taken at HEAD on this
 * lesson's own district rather than read off the 2026-08-30 frame.
 *
 * WHY THE NUMBER IS NOT THE FIX. `runtime/worldRuntime.ts` holds `maxSpeedKmh`
 * off the asphalt deliberately („Silencing them would trade a wrong charge for
 * NO charge"), so the disc is showing the figure a speeding bill is still
 * measured against. The repair is therefore a QUALIFIER beside the disc and
 * never a change to the disc — §2 and §3.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path, { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SCENARIO_TEMPLATES,
  applyTick,
  compileScenario,
  createLessonSession,
  routeHoldForSession,
  type LessonSessionState,
} from "@/modules/sim/lessons";
import { createWorldRuntime } from "@/modules/sim/runtime/worldRuntime";
import { OffCarriagewayMark, StatusDashboard } from "@/modules/sim/hud/StatusDashboard";
import { createDashboardStatus } from "@/modules/sim/hud/dashboardStatus";
import type { SimTick } from "@/modules/sim/rules/types";
import type { VehicleSample } from "@/modules/sim/contracts";
import { jsxPropsOf } from "./callSiteShape";

const SHELL_SRC = readFileSync(resolve(__dirname, "../LessonPlayShell.tsx"), "utf8");
const WORLD = resolve(__dirname, "../../../../../..", "content", "world");

function veh(x: number, y: number, headingDeg: number, speedKmh: number): VehicleSample {
  return {
    position: { x, y },
    headingDeg,
    speedKmh,
    indicator: "off",
    headlights: "low",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    mirrorGlance: null,
  };
}

/**
 * The row's own drive, through the production stack: the compiled lesson, the
 * real `createWorldRuntime` on the committed mw-v1 document and the real
 * `applyTick`. Straight up the cruise lane at 145 км/ч, off the kerb at t = 10 s
 * and never back — the frame's own numbers.
 */
function driveOffTheMotorway(): { t: number; tick: SimTick; state: LessonSessionState }[] {
  const template = SCENARIO_TEMPLATES.find((s) => s.id === "sc-ac-truck-spray");
  expect(template, "sc-ac-truck-spray must still be in the catalogue").toBeDefined();
  const lesson = compileScenario(template!, 1);
  expect(lesson.world?.districtId).toBe("mw-v1");
  const raw: unknown = JSON.parse(
    readFileSync(path.join(WORLD, "mw-v1.json"), "utf-8"),
  );
  const rt = createWorldRuntime(raw);
  let state = createLessonSession(lesson);
  const MPS = 145 / 3.6;
  const out: { t: number; tick: SimTick; state: LessonSessionState }[] = [];
  for (let t = 0; t <= 40; t = Number((t + 0.25).toFixed(6))) {
    const leaving = t > 10;
    const y = 15 + Math.min(t, 10) * MPS + (leaving ? (t - 10) * MPS * 0.2 : 0);
    const x = leaving ? (t - 10) * MPS * 0.98 : 0;
    const tick = rt.sample(veh(x, y, leaving ? 80 : 0, 145), t, false);
    state = applyTick(state, tick).state;
    out.push({ t, tick, state });
    if (state.phase !== "driving") break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// §1 — THE CLAUSE STILL REPRODUCES, AND THE OTHER STATE DOES NOT
// ---------------------------------------------------------------------------

describe("the row's own drive at HEAD", () => {
  const frames = driveOffTheMotorway();

  it("the runtime DOES say there is no road — the state half of the row is closed", () => {
    // Not a symptom that stopped appearing: the channel the whole repair chain
    // reads is asserted directly. A build in which `edgeId` never goes null
    // would fail here, and every claim below would be vacuous.
    const offRoad = frames.filter((f) => f.tick.edgeId === null);
    expect(offRoad.length).toBeGreaterThan(50);
    // …and the surfaces the student sees arm on it: the banner and the coach
    // card both read `routeHoldForSession`.
    expect(frames.some((f) => routeHoldForSession(f.state) === "offRoad")).toBe(true);
  });

  it("…and the disc's number does NOT move — the clause the row filed is live", () => {
    // Every off-carriageway frame still carries the motorway's 140, out to the
    // last one, ~2 km into open country. This is the measurement the repair
    // exists for AND the reason the repair may not touch the number:
    // `worldRuntime.ts` keeps it so a speeding bill off the asphalt still lands.
    const offRoad = frames.filter((f) => f.tick.edgeId === null);
    expect(new Set(offRoad.map((f) => f.tick.maxSpeedKmh))).toEqual(new Set([140]));
    // The control: it was 140 on the carriageway too, so the figure is the
    // road's and not an artefact of leaving it.
    const onRoad = frames.filter((f) => typeof f.tick.edgeId === "string");
    expect(new Set(onRoad.map((f) => f.tick.maxSpeedKmh))).toEqual(new Set([140]));
  });
});

// ---------------------------------------------------------------------------
// §2 — THE BAR SAYS IT, AND SAYS IT ABOUT THE DISC'S OWN NUMBER
// ---------------------------------------------------------------------------

const barHtml = (offCarriageway: boolean | undefined, compact: boolean): string =>
  renderToStaticMarkup(
    createElement(StatusDashboard, {
      statusRef: { current: createDashboardStatus() },
      limitKmh: 140,
      ...(offCarriageway === undefined ? {} : { offCarriageway }),
      compact,
    }),
  );

describe("the qualifier reaches the glass", () => {
  it("ADDITIVE — an unqualified bar is byte-identical to the shipped one", () => {
    // The prop absent and the prop false must render the same markup, or every
    // headless, legacy and sibling-test mount has silently changed.
    for (const compact of [true, false]) {
      expect(barHtml(undefined, compact)).toBe(barHtml(false, compact));
      expect(barHtml(undefined, compact)).not.toContain("off-carriageway");
    }
  });

  it("BOTH variants carry it — the compact/roomy pair has drifted apart once", () => {
    for (const compact of [true, false]) {
      const html = barHtml(true, compact);
      expect(html).toContain('data-hud="off-carriageway"');
      expect(html).toContain("Извън платното");
      // The disc is untouched: the number the grader still uses is still on the
      // bar, in its В26 ring.
      expect(html).toContain("140");
      expect(html).toContain('aria-label="Ограничение 140 км/ч"');
    }
  });

  it("the roomy bar carries the clause, the phone carries it in the accessible name", () => {
    expect(barHtml(true, false)).toContain("знакът е на него");
    expect(barHtml(true, true)).not.toContain("знакът е на него");
    // …but the sentence itself is on BOTH, as the name and the title, which is
    // the split `CAPTION` already makes below `sm` throughout that file.
    for (const compact of [true, false]) {
      expect(barHtml(true, compact)).toContain("Знакът 140 км/ч е на платното");
    }
  });

  it("MUTATION — the mark states the DISC's figure, not a literal", () => {
    // A mark hard-coded to «140» would pass every assertion above on this
    // lesson and lie on all 104 other districts.
    const mark = (limitKmh: number): string =>
      renderToStaticMarkup(createElement(OffCarriagewayMark, { limitKmh, size: "roomy" }));
    expect(mark(140)).toContain("Знакът 140 км/ч");
    expect(mark(50)).toContain("Знакът 50 км/ч");
    expect(mark(50)).not.toContain("140");
  });

  it("NO LAW IS RECALLED ON THIS SURFACE (ADR-002)", () => {
    // Neither line is a claim about Bulgarian law — they state where the car is
    // and which road the sign belongs to. The offence's own citation is on the
    // OFF_CARRIAGEWAY fault card, retrieved from the catalogue. An article
    // number appearing here would be free recall on a HUD string.
    const html = barHtml(true, false);
    expect(html).not.toMatch(/чл\.\s*\d/);
    expect(html).not.toMatch(/ЗДвП|Наредба|ал\.\s*\d/);
  });
});

// ---------------------------------------------------------------------------
// §3 — THE SHELL WIRES IT, AT BOTH MOUNTS, OFF THE BANNER'S OWN PREDICATE
// ---------------------------------------------------------------------------

describe("both mounts carry it — read as a tree, not as text", () => {
  const mounts = () => jsxPropsOf(SHELL_SRC, "StatusDashboard");

  it("compact and roomy read the SAME predicate the banner arms on", () => {
    expect(mounts()).toHaveLength(2);
    for (const m of mounts()) {
      // `objectiveHold` is `routeHoldForSession` — so the bar, the banner
      // (`objectiveTitleUnderHold`) and the coach card change on one frame.
      expect(m.offCarriageway).toBe('snap.objectiveHold === "offRoad"');
    }
  });

  it("MUTATION — a prop pinned false keeps the substring and is rejected", () => {
    // The neutralisation a `toContain` accepts: the field is still present,
    // still `boolean`, still type-checks, and the qualifier never renders.
    const mutated = SHELL_SRC.replace(
      /offCarriageway=\{snap\.objectiveHold === "offRoad"\}/g,
      "offCarriageway={false}",
    );
    expect(mutated).not.toBe(SHELL_SRC);
    const seen = jsxPropsOf(mutated, "StatusDashboard").map((m) => m.offCarriageway);
    expect(seen).toEqual(["false", "false"]);
  });
});
