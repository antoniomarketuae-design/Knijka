/**
 * ADR-006 stage 1b trace gate — „Линейка отзад" (sc-vu-emergency on ln-v1,
 * doc 72 VU-09), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns YIELDED_TO_PRIORITY
 *      (mirror check, right indicator, eased right + slowed; the emergency
 *      vehicle passed on the left edge).
 *   2. MISTAKE DEMOS grade EXACTLY EMERGENCY_NOT_YIELDED — never a COLLISION,
 *      never the junction FAILED_TO_YIELD, no lane/speed pollution (the demo
 *      geometry keeps every other detector out of reach).
 *   3. COMMITTED FILES under content/traces/sc-vu-emergency/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public
 *      copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-vu-emergency-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_VU_EMERGENCY } from "../../lessons/scenario/templates-vru";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScVuEmergencyDrive, type ScVuEmergencyTraceName } from "../scVuEmergency";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-vu-emergency";
const NAMES: ScVuEmergencyTraceName[] = ["shadow-correct", "mistake-block", "mistake-speed-up"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("ln-v1");
const drives = new Map<ScVuEmergencyTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScVuEmergencyDrive(district, n)]),
);

describe("sc-vu-emergency — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns YIELDED_TO_PRIORITY", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("YIELDED_TO_PRIORITY");
  });

  it("makes way, lets the EV pass, reaches the far end with Bulgarian annotations", () => {
    expect(shadow.outcomes).toHaveLength(1);
    expect(shadow.outcomes[0]).toMatchObject({
      eventId: "sc-vue-approach",
      kind: "emergencyApproach",
      success: true,
      detail: "yielded",
    });
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(345);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-vu-emergency — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (["mistake-block", "mistake-speed-up"] as ScVuEmergencyTraceName[]).entries()) {
    it(`${name}: exactly EMERGENCY_NOT_YIELDED, nothing else pollutes the demo`, () => {
      const drive = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual([...SC_VU_EMERGENCY.mistakes[i].codeRefs].sort());
      expect(codes).not.toContain("COLLISION");
      expect(codes).not.toContain("FAILED_TO_YIELD");
      expect(codes).not.toContain("POOR_LANE_KEEPING");
      expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
      // The refused duty resolves as the runner's violation outcome, once.
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
    const again = recordScVuEmergencyDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_VU_EMERGENCY.shadow, ...SC_VU_EMERGENCY.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_VU_EMERGENCY.shadow.path, ...SC_VU_EMERGENCY.mistakes.map((m) => m.traceRef.path)]).toEqual(
      expected,
    );
  });
});
