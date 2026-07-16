/**
 * Trace gate — „Скорост в завой" (sc-sp-curve on sp-curve-v1, doc 72 SP-05),
 * doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns CLEAN_DRIVING — 85 on
 *      the legal 90 approach, braked to ~48 BEFORE the marked arc, steady
 *      through it (under the advisory-50 envelope), accelerating out.
 *   2. MISTAKE DEMOS grade EXACTLY SPEED_TOO_FAST_FOR_CURVE — once per drive
 *      (one act, one bill) — and NEVER a speeding code (70/85 < the posted 90)
 *      and NEVER TURN_WITHOUT_INDICATOR: the ~90° arc at any authored speed
 *      stays far under the 55°/3 s turn window AND the map has zero
 *      intersections (the junction gate) — the no-double-bill interplay proof.
 *   3. COMMITTED FILES under content/traces/sc-sp-curve/ ARE the recordings
 *      of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-sp-curve-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_SP_CURVE } from "../../lessons/scenario/templates-sp";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScSpCurveDrive, type ScSpCurveTraceName } from "../scSpCurve";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-sp-curve";
const NAMES: ScSpCurveTraceName[] = ["shadow-correct", "mistake-hold-speed", "mistake-brake-late"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}
/** Samples clearly INSIDE the arc (away from both joints): y > 240 ∧ x < 150. */
function arcSamples(d: RecordedDrive) {
  return d.trace.samples.filter((s) => s.y > 240 && s.x < 150);
}

const district = loadDistrict("sp-curve-v1");
const drives = new Map<ScSpCurveTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScSpCurveDrive(district, n)]),
);

describe("sc-sp-curve — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("brakes BEFORE the arc and holds under the advisory envelope through it", () => {
    const inArc = arcSamples(shadow);
    expect(inArc.length).toBeGreaterThan(50);
    const maxArcKmh = Math.max(...inArc.map((s) => Math.abs(s.speedKmh)));
    expect(maxArcKmh).toBeLessThan(55); // advisory 50 + grace — never in the band
    // …while the APPROACH really ran at rural speed (the lesson is WHERE to slow).
    const approach = shadow.trace.samples.filter((s) => s.y < 150 && s.x < 20);
    expect(Math.max(...approach.map((s) => Math.abs(s.speedKmh)))).toBeGreaterThan(80);
    // Reaches the exit straight.
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.x).toBeGreaterThan(320);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-sp-curve — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Със скоростта от правата“: exactly SPEED_TOO_FAST_FOR_CURVE, once — no speeding, no turn code", () => {
    const drive = drives.get("mistake-hold-speed")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual([...SC_SP_CURVE.mistakes[0].codeRefs].sort());
    expect(codes.filter((c) => c === "SPEED_TOO_FAST_FOR_CURVE")).toHaveLength(1);
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    expect(codes).not.toContain("TURN_WITHOUT_INDICATOR"); // the interplay proof
    // The demo genuinely holds ~70 through the arc (the recorder cap ~71.8
    // must not have silently rewritten the authored story).
    const inArc = arcSamples(drive);
    expect(Math.max(...inArc.map((s) => Math.abs(s.speedKmh)))).toBeGreaterThan(65);
  });

  it("„Спиране В завоя“: the same single code — braking IN the arc never got under the envelope", () => {
    const drive = drives.get("mistake-brake-late")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual([...SC_SP_CURVE.mistakes[1].codeRefs].sort());
    expect(codes.filter((c) => c === "SPEED_TOO_FAST_FOR_CURVE")).toHaveLength(1);
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE"); // the in-curve brake is firm, not a slam
    expect(codes).not.toContain("TURN_WITHOUT_INDICATOR");
    // The braking really happened IN the arc: entry fast, still over the
    // envelope mid-arc.
    const entry = drive.trace.samples.filter((s) => s.y > 215 && s.y < 240 && s.x < 30);
    expect(Math.max(...entry.map((s) => Math.abs(s.speedKmh)))).toBeGreaterThan(75);
    const inArc = arcSamples(drive);
    expect(Math.min(...inArc.map((s) => Math.abs(s.speedKmh)))).toBeGreaterThan(55);
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
    const again = recordScSpCurveDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_SP_CURVE.shadow, ...SC_SP_CURVE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_SP_CURVE.shadow.path, ...SC_SP_CURVE.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
