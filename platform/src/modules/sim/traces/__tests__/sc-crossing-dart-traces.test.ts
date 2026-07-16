/**
 * S trace gate — „Внезапен пешеходец на пътеката" (sc-crossing-dart on
 * pe-dart-v1, doc 72 PE-02 / PE-04), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns PEDESTRIAN_YIELDED.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs — driving through
 *      grades PEDESTRIAN_NOT_YIELDED (never a too-fast or a contact); the strike
 *      grades COLLISION (never a not-yielded or too-fast).
 *   3. COMMITTED FILES under content/traces/sc-crossing-dart/ ARE the recordings
 *      of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-crossing-dart-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_CROSSING_DART } from "../../lessons/scenario/templates-pe";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScCrossingDartDrive, type ScCrossingDartTraceName } from "../scCrossingDart";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-crossing-dart";
const NAMES: ScCrossingDartTraceName[] = ["shadow-correct", "mistake-not-yielded", "mistake-collision"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("pe-dart-v1");
const drives = new Map<ScCrossingDartTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScCrossingDartDrive(district, n)]),
);

describe("sc-crossing-dart — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns PEDESTRIAN_YIELDED", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("PEDESTRIAN_YIELDED");
  });

  it("stops before the zebra and clears it with Bulgarian annotations", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(118);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-crossing-dart — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Преминаване през пешеходеца“: exactly PEDESTRIAN_NOT_YIELDED, no too-fast, no contact", () => {
    const drive = drives.get("mistake-not-yielded")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_CROSSING_DART.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("PEDESTRIAN_CROSSING_TOO_FAST");
    expect(codes).not.toContain("COLLISION");
  });

  it("„Удар в пешеходеца“: exactly COLLISION, never not-yielded or too-fast", () => {
    const drive = drives.get("mistake-collision")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_CROSSING_DART.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("PEDESTRIAN_NOT_YIELDED");
    expect(codes).not.toContain("PEDESTRIAN_CROSSING_TOO_FAST");
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
    const again = recordScCrossingDartDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_CROSSING_DART.shadow, ...SC_CROSSING_DART.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_CROSSING_DART.shadow.path, ...SC_CROSSING_DART.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
