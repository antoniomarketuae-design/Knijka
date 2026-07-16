/**
 * ADR-006 stage 1c trace gate — „Линейка на кръстовището"
 * (sc-vu-emergency-junction on tj-rhr-v1, doc 72 VU-10), doc 76 §5/§9 stages
 * 3+5:
 *   1. SHADOW replays with ZERO violations and earns YIELDED_TO_PRIORITY
 *      (stopped short of the RHR core on the siren, let the crossing EV
 *      flash through, then turned left into the cleared junction).
 *   2. MISTAKE DEMOS grade EXACTLY FAILED_TO_YIELD — the documented stage-1c
 *      mechanic choice: the crossing EV rides the junction machinery (the
 *      runtime's own right-hand-rule tracker), NOT the rear-approach
 *      emergency adjudication (its arm logic is behind+closing and cannot see
 *      a crossing geometry) — never EMERGENCY_NOT_YIELDED, never COLLISION,
 *      no lane/speed pollution.
 *   3. COMMITTED FILES under content/traces/sc-vu-emergency-junction/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public
 *      copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-vu-emergency-junction-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_VU_EMERGENCY_JUNCTION } from "../../lessons/scenario/templates-vru";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScVuEmergencyJunctionDrive,
  type ScVuEmergencyJunctionTraceName,
} from "../scVuEmergencyJunction";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-vu-emergency-junction";
const NAMES: ScVuEmergencyJunctionTraceName[] = ["shadow-correct", "mistake-barge", "mistake-race"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("tj-rhr-v1");
const drives = new Map<ScVuEmergencyJunctionTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScVuEmergencyJunctionDrive(district, n)]),
);

describe("sc-vu-emergency-junction — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns YIELDED_TO_PRIORITY", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("YIELDED_TO_PRIORITY");
  });

  it("lets the EV cross, then completes the left turn west, with Bulgarian annotations", () => {
    expect(shadow.outcomes).toHaveLength(1);
    expect(shadow.outcomes[0]).toMatchObject({
      eventId: "sc-vuej-ev",
      kind: "priorityFromRight",
      success: true,
      detail: "yielded",
    });
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.x).toBeLessThan(-50); // rests on the west arm — turn completed
    expect(Math.abs(last.speedKmh)).toBeLessThan(1);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-vu-emergency-junction — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (["mistake-barge", "mistake-race"] as ScVuEmergencyJunctionTraceName[]).entries()) {
    it(`${name}: exactly FAILED_TO_YIELD, nothing else pollutes the demo`, () => {
      const drive = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual([...SC_VU_EMERGENCY_JUNCTION.mistakes[i].codeRefs].sort());
      // The stage-1c mechanic boundary: the junction machinery grades — the
      // rear-approach emergency code must never leak into a crossing recipe.
      expect(codes).not.toContain("EMERGENCY_NOT_YIELDED");
      expect(codes).not.toContain("COLLISION");
      expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
      expect(codes).not.toContain("POOR_LANE_KEEPING");
      // The refused priority resolves as the runner's violation outcome, once.
      expect(drive.outcomes).toHaveLength(1);
      expect(drive.outcomes[0]).toMatchObject({ success: false, detail: "violation" });
      // No yield commendation for a refused duty.
      expect(commendationCodes(drive)).not.toContain("YIELDED_TO_PRIORITY");
    });
  }
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
    const again = recordScVuEmergencyJunctionDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [
      SC_VU_EMERGENCY_JUNCTION.shadow,
      ...SC_VU_EMERGENCY_JUNCTION.mistakes.map((m) => m.traceRef),
    ];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_VU_EMERGENCY_JUNCTION.shadow.path,
      ...SC_VU_EMERGENCY_JUNCTION.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
