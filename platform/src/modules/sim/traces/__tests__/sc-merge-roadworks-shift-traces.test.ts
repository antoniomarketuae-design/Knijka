/**
 * Trace gate — „Ремонт затваря лентата ти" (sc-merge-roadworks-shift on
 * hz-roadworks-v1, ЗДвП чл. 25; Наредба № 2/2001), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns CLEAN_DRIVING +
 *      SAFE_LANE_CHANGE — spots the closure early, EASES to let the open-lane
 *      car go by, commits the merge with indicator + mirror BEFORE the cone
 *      taper even starts, holds the site's temporary 30, and never touches a
 *      cone.
 *   2. MISTAKE DEMOS grade EXACTLY their authored codeRefs: the silent
 *      last-metre merge grades LANE_CHANGE_WITHOUT_INDICATOR and NOTHING else
 *      (the mirror really was checked); the cone squeeze grades COLLISION +
 *      POOR_LANE_KEEPING and NEVER a lane-change code — it signals and looks,
 *      and is convicted by where its wheels went.
 *   3. THE MAP'S OWN LAW: no drive ever grades NOT_KEEPING_RIGHT (the sizing
 *      budget of gen_hz_roadworks.mjs), SPEEDING (every authored pace clears
 *      its own segment's limit — including the site's 30), or the two-way
 *      center-line codes (this street is one-way).
 *   4. THE JOINT-GRACE LAW: every authored merge flips laneId on the APPROACH
 *      edge with real margin before the works joint, so the §9 asserts have
 *      teeth instead of being silently swallowed (rules/engine.ts §3, C1).
 *   5. THE CONE SET is the district's, byte-for-byte (the L7 copy truth).
 *   6. COMMITTED FILES under content/traces/sc-merge-roadworks-shift/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public
 *      copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-merge-roadworks-shift-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_MERGE_ROADWORKS_SHIFT } from "../../lessons/scenario/templates-merging";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScMergeRoadworksShiftDrive,
  roadworksConeRects,
  type ScMergeRoadworksShiftTraceName,
} from "../scMergeRoadworksShift";
import { obstacleRectsOverlap, type RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-merge-roadworks-shift";
const NAMES: ScMergeRoadworksShiftTraceName[] = [
  "shadow-correct",
  "mistake-no-indicator",
  "mistake-squeeze-cones",
];

/** hz-roadworks-v1 truths (meta.scenario — pinned by hz-roadworks-districts.test.ts). */
const X_CLOSED = 4.06;
const X_OPEN = -4.06;
const TAPER_FROM_Y = 216;
const WORKS_FROM_Y = 240;
const WORKS_TO_Y = 276;
/** rules/types.ts DEFAULT_RULE_CONFIG — the laws the drives are tuned against. */
const LANE_CHANGE_JOINT_GRACE_SEC = 1.5;
const LANE_KEEP_MAX_OFFSET_M = 1.3 * 2.5;
/** Hero half-width (vehicle/tuning.ts CHASSIS_HALF_EXTENTS.x / .z). */
const HERO_HALF_W = 0.85;
const HERO_HALF_L = 2.02;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}
/** Does the hero footprint at this sample overlap any authored cone? */
function touchesCone(s: { x: number; y: number; headingDeg: number }): boolean {
  const hero = {
    x: s.x,
    y: s.y,
    headingDeg: s.headingDeg,
    halfWidthM: HERO_HALF_W,
    halfLengthM: HERO_HALF_L,
  };
  return roadworksConeRects().some((c) => obstacleRectsOverlap(hero, c));
}

const district = loadDistrict("hz-roadworks-v1");
const drives = new Map<ScMergeRoadworksShiftTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScMergeRoadworksShiftDrive(district, n)]),
);

/** Arclength at which a drive's laneId flips (x crosses the lane line). */
function flipY(d: RecordedDrive): number {
  const ss = d.trace.samples;
  for (let i = 1; i < ss.length; i++) {
    if (ss[i - 1].x > 0 && ss[i].x <= 0) return ss[i].y;
  }
  return NaN;
}

describe("sc-merge-roadworks-shift — the cone set is the district's (the L7 copy truth)", () => {
  it("every authored rect matches content/world/hz-roadworks-v1.json meta.scenario.cones", () => {
    const sc = (district as { meta: { scenario: { cones: Array<{ x: number; y: number }>; coneHalfM: number } } })
      .meta.scenario;
    const rects = roadworksConeRects();
    expect(rects.length).toBe(sc.cones.length);
    expect(rects.map((r) => [r.x, r.y])).toEqual(sc.cones.map((c) => [c.x, c.y]));
    for (const r of rects) {
      expect(r.halfWidthM).toBe(sc.coneHalfM);
      expect(r.halfLengthM).toBe(sc.coneHalfM);
      // Props are untagged in ScenarioObstacles ⇒ the VehicleRig fallback
      // classifies them "staticObject"; the recorded detail must say the same.
      expect(r.withWhat).toBe("staticObject");
    }
  });
});

describe("sc-merge-roadworks-shift — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING + SAFE_LANE_CHANGE", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
    expect(commendationCodes(shadow)).toContain("SAFE_LANE_CHANGE");
  });

  it("rides the closed lane and EASES for the open-lane car instead of racing it", () => {
    // Deep in the approach the car is squarely in the lane the works will take…
    const inLane = shadow.trace.samples.filter((s) => s.y > 60 && s.y < 118);
    expect(inLane.length).toBeGreaterThan(0);
    for (const s of inLane) expect(Math.abs(s.x - X_CLOSED), `y=${s.y}`).toBeLessThan(0.5);
    // …and it genuinely gives way: the taught beat is the lift, so the speed in
    // the ease window drops well below the approach cruise.
    const cruising = shadow.trace.samples.filter((s) => s.y > 60 && s.y < 110);
    const easing = shadow.trace.samples.filter((s) => s.y > 150 && s.y < 164);
    expect(easing.length).toBeGreaterThan(0);
    expect(Math.max(...easing.map((s) => s.speedKmh))).toBeLessThan(
      Math.max(...cruising.map((s) => s.speedKmh)) - 8,
    );
    // The lift is a lift, not a stop: this drill is never won by halting.
    const running = shadow.trace.samples.filter((s) => s.y > 40 && s.y < 285);
    expect(Math.min(...running.map((s) => s.speedKmh))).toBeGreaterThan(20);
  });

  it("THE TAUGHT MERGE: decided before the first cone, settled well before the site", () => {
    // „Reads the closure early" made precise: the car is already ACROSS the
    // lane line — the laneId flip, the thing the engine grades — before the
    // taper's first cone at y = 216. It is still finishing the lateral arc
    // there, which is what a smooth merge looks like; what matters is that the
    // decision was taken ahead of the closure, not negotiated against it.
    expect(flipY(shadow)).toBeLessThan(TAPER_FROM_Y);
    for (const s of shadow.trace.samples.filter((s) => s.y > TAPER_FROM_Y)) {
      expect(s.x, `y=${s.y}`).toBeLessThan(0);
    }
    // …and the arc is FINISHED with 10 m to spare before the works joint, so
    // the car enters the site already tracking the temporary lane.
    const settled = shadow.trace.samples.filter((s) => s.y > 232 && s.y < WORKS_FROM_Y);
    expect(settled.length).toBeGreaterThan(0);
    for (const s of settled) expect(Math.abs(s.x - X_OPEN), `y=${s.y}`).toBeLessThan(0.5);
    // It never wanders back toward the lane the works have taken.
    for (const s of shadow.trace.samples.filter((s) => s.y > 232)) {
      expect(s.x, `y=${s.y}`).toBeLessThan(-2);
    }
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(290);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("HOLDS THE TEMPORARY LIMIT through the whole site — the drill's second duty", () => {
    const inWorks = shadow.trace.samples.filter((s) => s.y > WORKS_FROM_Y && s.y < WORKS_TO_Y);
    expect(inWorks.length).toBeGreaterThan(0);
    // Under the posted 30 for every metre of the site — not "on average".
    for (const s of inWorks) expect(s.speedKmh, `y=${s.y}`).toBeLessThanOrEqual(30);
    // …and squarely on the temporary lane's line the whole way through.
    for (const s of inWorks) expect(Math.abs(s.x - X_OPEN), `y=${s.y}`).toBeLessThan(0.5);
  });

  it("NEVER TOUCHES A CONE — the innocence the whole map is sized around", () => {
    for (const s of shadow.trace.samples) {
      expect(touchesCone(s), `y=${s.y.toFixed(1)} x=${s.x.toFixed(2)}`).toBe(false);
    }
    expect(violationCodes(shadow)).not.toContain("COLLISION");
  });

  it("uses the taught observation pair: TWO left mirror glances AND a left signal before the wheel", () => {
    const kinds = shadow.trace.events.map((e) => e.kind);
    expect(kinds.filter((k) => k === "glance-left").length).toBeGreaterThanOrEqual(2);
    expect(kinds).toContain("signal-on");
    expect(kinds).toContain("signal-off");
  });
});

describe("sc-merge-roadworks-shift — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Вливане в последния момент без мигач“: exactly LANE_CHANGE_WITHOUT_INDICATOR, once", () => {
    const drive = drives.get("mistake-no-indicator")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual([...SC_MERGE_ROADWORKS_SHIFT.mistakes[0].codeRefs].sort());
    expect(codes.filter((c) => c === "LANE_CHANGE_WITHOUT_INDICATOR")).toHaveLength(1);
    // The mirror really WAS checked — the demo is about the missing signal
    // alone, so the mirror code must never appear.
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
    expect(drive.trace.events.some((e) => e.kind === "glance-left")).toBe(true);
    // …and no indicator was ever raised, at any point in the drive.
    expect(drive.trace.events.some((e) => e.kind === "signal-on")).toBe(false);
    // The merge really did happen, and really did happen LATE: the car was
    // still in the closed lane deep inside the taper.
    const merged = drive.trace.samples.filter((s) => s.y > 232);
    expect(merged.length).toBeGreaterThan(0);
    expect(Math.max(...merged.map((s) => Math.abs(s.x - X_OPEN)))).toBeLessThan(0.5);
    const stillClosed = drive.trace.samples.filter((s) => Math.abs(s.x - X_CLOSED) < 0.5);
    expect(Math.max(...stillClosed.map((s) => s.y))).toBeGreaterThan(TAPER_FROM_Y - 20);
    // It is a LATE merge, not a cone-clipping one: this demo carries exactly
    // ONE fault, so it must thread the taper without contact.
    for (const s of drive.trace.samples) expect(touchesCone(s), `y=${s.y.toFixed(1)}`).toBe(false);
  });

  it("„Провиране през конусите“: exactly COLLISION + POOR_LANE_KEEPING — the signal does NOT excuse", () => {
    const drive = drives.get("mistake-squeeze-cones")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual([...SC_MERGE_ROADWORKS_SHIFT.mistakes[1].codeRefs].sort());
    expect(codes).toContain("COLLISION");
    expect(codes.filter((c) => c === "POOR_LANE_KEEPING")).toHaveLength(1);
    // The ritual really WAS performed — this demo is about the cones and the
    // line, so no lane-change code may leak into the verdict.
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
    expect(drive.trace.events.some((e) => e.kind === "signal-on" && e.detail === "left")).toBe(true);
    expect(drive.trace.events.some((e) => e.kind === "glance-left")).toBe(true);
    // The contact is GEOMETRIC, not an authored beat: the hero footprint really
    // does overlap authored cones, and the graded detail says what it hit.
    expect(drive.trace.samples.some((s) => touchesCone(s))).toBe(true);
    for (const e of drive.ruleEvents) {
      if (e.kind === "violation" && e.code === "COLLISION") expect(e.detail).toBe("staticObject");
    }
    // …and the straddle is real: it drags itself along the boundary line, far
    // enough off ANY lane center to be nowhere at all.
    const dragging = drive.trace.samples.filter((s) => s.y > 250 && s.y < 275);
    expect(dragging.length).toBeGreaterThan(0);
    for (const s of dragging) {
      expect(Math.abs(s.x - X_OPEN), `y=${s.y}`).toBeGreaterThan(LANE_KEEP_MAX_OFFSET_M);
      expect(Math.abs(s.x - X_CLOSED), `y=${s.y}`).toBeGreaterThan(LANE_KEEP_MAX_OFFSET_M);
    }
  });

  it("THE JOINT-GRACE LAW: every authored merge flips clear of the works joint, so the asserts have teeth", () => {
    // rules/engine.ts §3 (C1): a lane delta within laneChangeJointGraceSec of a
    // segment transition is DROPPED. If a merge flipped too near the works
    // joint, „вливане без мигач" would silently grade NOTHING and this suite
    // would still be green — the worst possible failure mode. So: prove the
    // margin, in the units the engine actually uses.
    for (const name of ["shadow-correct", "mistake-no-indicator"] as const) {
      const d = drives.get(name)!;
      const y = flipY(d);
      expect(y, name).toBeGreaterThan(0);
      // The flip happens on the APPROACH edge, before the works begin…
      expect(y, name).toBeLessThan(WORKS_FROM_Y);
      const at = d.trace.samples.find((s) => s.y >= y)!;
      const secToJoint = (WORKS_FROM_Y - y) / (at.speedKmh / 3.6);
      expect(secToJoint, `${name}: ${secToJoint.toFixed(2)}s to the joint`).toBeGreaterThan(
        LANE_CHANGE_JOINT_GRACE_SEC,
      );
    }
    // …and the demo that DOES flip late is the cone squeeze — which is exactly
    // why its verdict must not (and does not) rest on a lane-change code.
    expect(flipY(drives.get("mistake-squeeze-cones")!)).toBeGreaterThan(WORKS_FROM_Y);
  });

  it("the map's own law holds on every drive: no keep-right, speeding or one-way leakage", () => {
    for (const name of NAMES) {
      const codes = violationCodes(drives.get(name)!);
      // The keep-right budget (gen_hz_roadworks.mjs's sizing law): the open
      // lane is never held long enough to convict a correctly-merged driver,
      // even at the site's mandatory 30.
      expect(codes, name).not.toContain("NOT_KEEPING_RIGHT");
      // Every authored pace clears its own segment's limit — including the
      // temporary 30, which is a different edge from the 50 around it.
      expect(codes, name).not.toContain("SPEEDING_OVER_LIMIT");
      expect(codes, name).not.toContain("SPEEDING_DANGEROUS");
      // A one-way street can never grade the two-way center-line codes, and
      // nothing here drives against the flow.
      expect(codes, name).not.toContain("CENTER_LINE_TOUCHED");
      expect(codes, name).not.toContain("CROSSED_SOLID_LINE");
      expect(codes, name).not.toContain("WRONG_WAY");
      // The ease that lets the open-lane car by is a lift, not a slam.
      expect(codes, name).not.toContain("HARSH_BRAKING_NO_CAUSE");
      // No span exists on this map, so these can never arm (the generator's
      // deliberate refusal — see its keep-right header note).
      expect(codes, name).not.toContain("EMERGENCY_LANE_DRIVING");
    }
  });

  it("every drive respects the site's temporary 30 — the demos break ONE rule each, not two", () => {
    for (const name of NAMES) {
      const inWorks = drives.get(name)!.trace.samples.filter((s) => s.y > WORKS_FROM_Y && s.y < WORKS_TO_Y);
      expect(inWorks.length, name).toBeGreaterThan(0);
      // The 10% grace on 30 is 33; every demo stays under the posted 30 itself,
      // so no verdict here is ever contaminated by a speeding code.
      expect(Math.max(...inWorks.map((s) => s.speedKmh)), name).toBeLessThanOrEqual(30);
    }
  });

  it("the staged open-lane car is pressure scenery: it never grades anything (doc 72 FO-07)", () => {
    // Its only footprint is the outcome channel — never a SimTick event. That
    // is also why the cone demo's contact is a GEOMETRIC rect overlap and not
    // an authored beat: the consequence here is real, not narrated.
    for (const name of NAMES) {
      const drive = drives.get(name)!;
      for (const o of drive.outcomes) expect(o.kind, name).toBe("rearTailgater");
    }
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", SCENARIO_ID);
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", SCENARIO_ID);

  for (const name of NAMES) {
    it(`${SCENARIO_ID}/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
      const serialized = serializeScenarioTrace(drives.get(name)!.trace) + "\n";
      const contentFile = path.join(contentDir, `${name}.trace.json`);
      const publicFile = path.join(publicDir, `${name}.trace.json`);
      if (RECORD) {
        mkdirSync(contentDir, { recursive: true });
        mkdirSync(publicDir, { recursive: true });
        writeFileSync(contentFile, serialized);
        writeFileSync(publicFile, serialized);
      }
      expect(existsSync(contentFile), `${contentFile} missing — run the RECORD_TRACES tool`).toBe(true);
      expect(existsSync(publicFile), `${publicFile} missing — run the RECORD_TRACES tool`).toBe(true);
      expect(readFileSync(contentFile, "utf-8")).toBe(serialized);
      expect(readFileSync(publicFile, "utf-8")).toBe(readFileSync(contentFile, "utf-8"));
      const parsed = parseScenarioTrace(JSON.parse(readFileSync(contentFile, "utf-8")));
      expect(parsed).not.toBeNull();
      expect(parsed!.meta.scenarioId).toBe(SCENARIO_ID);
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const again = recordScMergeRoadworksShiftDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_MERGE_ROADWORKS_SHIFT.shadow, ...SC_MERGE_ROADWORKS_SHIFT.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_MERGE_ROADWORKS_SHIFT.shadow.path,
      ...SC_MERGE_ROADWORKS_SHIFT.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
