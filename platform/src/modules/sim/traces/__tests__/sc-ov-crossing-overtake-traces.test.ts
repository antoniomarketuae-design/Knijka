/**
 * Trace gate — „Изпреварване на пешеходна пътека" (sc-ov-crossing-overtake on
 * ov-crossing-v1, doc 72 OV-07), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW follows the lead THROUGH the crossing in the right lane (no lane
 *      change) → ZERO violations + CLEAN_DRIVING.
 *   2. MISTAKE DEMOS grade EXACTLY OVERTAKING_AT_CROSSING (both overtake by
 *      cutting back into the lead's lane inside the armed zone); the signalled
 *      lane changes earn SAFE_LANE_CHANGE — never a lane-change violation.
 *   3. COMMITTED FILES under content/traces/sc-ov-crossing-overtake/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ov-crossing-overtake-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_OV_CROSSING_OVERTAKE } from "../../lessons/scenario/templates-lanes";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScOvCrossingOvertakeDrive, type ScOvCrossingOvertakeTraceName } from "../scOvCrossingOvertake";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ov-crossing-overtake";
const NAMES: ScOvCrossingOvertakeTraceName[] = ["shadow-correct", "mistake-overtake-in-zone", "mistake-late-swerve"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("ov-crossing-v1");
const drives = new Map<ScOvCrossingOvertakeTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScOvCrossingOvertakeDrive(district, n)]),
);

describe("sc-ov-crossing-overtake — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("follows the lead through the crossing with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });
});

describe("sc-ov-crossing-overtake — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (["mistake-overtake-in-zone", "mistake-late-swerve"] as const).entries()) {
    it(`${name}: exactly OVERTAKING_AT_CROSSING, no lane-change violation`, () => {
      const codes = [...new Set(violationCodes(drives.get(name)!))].sort();
      expect(codes).toEqual([...SC_OV_CROSSING_OVERTAKE.mistakes[i].codeRefs].sort());
      expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
      expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
      expect(codes).not.toContain("NOT_KEEPING_RIGHT");
      expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
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
    const again = recordScOvCrossingOvertakeDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });
  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_OV_CROSSING_OVERTAKE.shadow, ...SC_OV_CROSSING_OVERTAKE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_OV_CROSSING_OVERTAKE.shadow.path, ...SC_OV_CROSSING_OVERTAKE.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
