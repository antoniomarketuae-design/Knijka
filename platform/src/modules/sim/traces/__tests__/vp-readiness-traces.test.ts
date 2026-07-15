/**
 * S4 trace gate — „Готовност преди тръгване" (sc-vp-readiness on vp-ready-v1,
 * doc 72 VP-02 belt + VP-05 handbrake), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns CLEAN_DRIVING — belt on,
 *      handbrake off, a centered ~40 km/h drive the whole street.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs — no-belt isolates
 *      SEATBELT_OFF_WHILE_MOVING, handbrake isolates HANDBRAKE_LEFT_ON; neither
 *      leaks the other, nor a speed/lane code.
 *   3. COMMITTED FILES under content/traces/sc-vp-readiness/ ARE the recordings
 *      of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/vp-readiness-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_VP_READINESS } from "../../lessons/scenario/templates-cockpit";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScVpReadinessDrive, type ScVpReadinessTraceName } from "../scVpReadiness";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-vp-readiness";
const NAMES: ScVpReadinessTraceName[] = ["shadow-correct", "mistake-no-belt", "mistake-handbrake"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("vp-ready-v1");
const drives = new Map<ScVpReadinessTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScVpReadinessDrive(district, n)]),
);

describe("sc-vp-readiness — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("drives the whole street centered and legal with Bulgarian annotations", () => {
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThan(50); // under the posted limit
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(330);
    expect(Math.abs(last.x - 4.06)).toBeLessThan(1.5); // stayed in the lane center
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-vp-readiness — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Тръгване без колан“: exactly SEATBELT_OFF_WHILE_MOVING, never a handbrake/speed/lane code", () => {
    const drive = drives.get("mistake-no-belt")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_VP_READINESS.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("HANDBRAKE_LEFT_ON");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("POOR_LANE_KEEPING");
  });

  it("„Тръгване с вдигната ръчна“: exactly HANDBRAKE_LEFT_ON, never a belt/speed/lane code", () => {
    const drive = drives.get("mistake-handbrake")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_VP_READINESS.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("SEATBELT_OFF_WHILE_MOVING");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("POOR_LANE_KEEPING");
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
    const again = recordScVpReadinessDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_VP_READINESS.shadow, ...SC_VP_READINESS.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_VP_READINESS.shadow.path, ...SC_VP_READINESS.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
