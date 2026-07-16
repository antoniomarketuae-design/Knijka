/**
 * S trace gate — „Ляв завой от Б2 през пътя с предимство" (sc-junction-left on
 * tj-emerge-v1, doc 72 JU-04 applied to the left turn), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns YIELDED_TO_PRIORITY
 *      (full stop + let the priority car pass, then turn left).
 *   2. MISTAKE DEMOS grade EXACTLY FAILED_TO_YIELD — no STOP_SIGN_NO_FULL_STOP
 *      (both stop fully), no COLLISION.
 *   3. COMMITTED FILES under content/traces/sc-junction-left/ ARE the recordings
 *      of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ju3-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_JUNCTION_LEFT } from "../../lessons/scenario/templates-junctions2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScJunctionLeftDrive, type ScJunctionLeftTraceName } from "../scJunctions3";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-junction-left";
const NAMES: ScJunctionLeftTraceName[] = ["shadow-correct", "mistake-cut-gap", "mistake-creep-out"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("tj-emerge-v1");
const drives = new Map<ScJunctionLeftTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScJunctionLeftDrive(district, n)]),
);

describe("sc-junction-left — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns the yield commendations", () => {
    expect(violationCodes(shadow)).toEqual([]);
    const cs = commendationCodes(shadow);
    expect(cs).toContain("YIELDED_TO_PRIORITY");
  });

  it("stops at the line and completes the left turn onto the west arm", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.x).toBeLessThan(-25); // ended up on the west arm
    const stopped = shadow.trace.samples.some((s) => Math.abs(s.speedKmh) < 0.5);
    expect(stopped).toBe(true);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-junction-left — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (["mistake-cut-gap", "mistake-creep-out"] as ScJunctionLeftTraceName[]).entries()) {
    it(`${name}: exactly FAILED_TO_YIELD, no stop-sign fault, no collision`, () => {
      const drive = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual([...SC_JUNCTION_LEFT.mistakes[i].codeRefs].sort());
      expect(codes).not.toContain("STOP_SIGN_NO_FULL_STOP");
      expect(codes).not.toContain("COLLISION");
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
    const again = recordScJunctionLeftDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_JUNCTION_LEFT.shadow, ...SC_JUNCTION_LEFT.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_JUNCTION_LEFT.shadow.path, ...SC_JUNCTION_LEFT.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
