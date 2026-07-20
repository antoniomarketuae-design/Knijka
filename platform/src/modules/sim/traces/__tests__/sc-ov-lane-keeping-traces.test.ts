/**
 * S3-E trace gate — „Движение в средата на лентата" (sc-ov-lane-keeping on
 * ov-lane-v1, doc 72 OV-12 + OV-04; founder R3 redesign doc 62 #46 — the
 * S-CURVE street, sway ±14 m), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns CLEAN_DRIVING (the whole
 *      S-curve held in the MIDDLE of the lane — real steering, both bends).
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs — running wide in
 *      the left-hand bend isolates POOR_LANE_KEEPING (toward the curb);
 *      under-steering the right-hand bend isolates CENTER_LINE_TOUCHED
 *      (toward oncoming); neither leaks the other.
 *   3. COMMITTED FILES under content/traces/sc-ov-lane-keeping/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ov-lane-keeping-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_OV_LANE_KEEPING } from "../../lessons/scenario/templates-lanes";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScOvLaneKeepingDrive, type ScOvLaneKeepingTraceName } from "../scOvLaneKeeping";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ov-lane-keeping";
const NAMES: ScOvLaneKeepingTraceName[] = ["shadow-correct", "mistake-straddle", "mistake-center-line"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("ov-lane-v1");
const drives = new Map<ScOvLaneKeepingTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScOvLaneKeepingDrive(district, n)]),
);

describe("sc-ov-lane-keeping — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("rides the whole S-curve centered in the lane with Bulgarian annotations", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(270);
    // The finish gate of the CURVED lane center (meta.scenario.gates.finish).
    expect(Math.abs(last.x - -0.42)).toBeLessThan(1.5);
    // The route genuinely swayed: it reached both the east and the west bank.
    const xs = shadow.trace.samples.map((s) => s.x);
    expect(Math.max(...xs)).toBeGreaterThan(14); // east apex ≈ 18.06
    expect(Math.min(...xs)).toBeLessThan(-6); // west apex ≈ −9.94
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ov-lane-keeping — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Изнасяне към бордюра в левия завой“: exactly POOR_LANE_KEEPING, never the center-line code", () => {
    const drive = drives.get("mistake-straddle")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_OV_LANE_KEEPING.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("CENTER_LINE_TOUCHED");
  });

  it("„Изплуване върху осевата в десния завой“: exactly CENTER_LINE_TOUCHED, never generic lane-keeping", () => {
    const drive = drives.get("mistake-center-line")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_OV_LANE_KEEPING.mistakes[1].codeRefs].sort());
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
    const again = recordScOvLaneKeepingDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_OV_LANE_KEEPING.shadow, ...SC_OV_LANE_KEEPING.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_OV_LANE_KEEPING.shadow.path, ...SC_OV_LANE_KEEPING.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
