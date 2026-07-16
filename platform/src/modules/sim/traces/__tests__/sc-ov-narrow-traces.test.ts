/**
 * S trace gate — „Разминаване в тясна улица" (sc-ov-narrow on ov-narrow-v1,
 * doc 72 OV-14), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns YIELDED_TO_PRIORITY
 *      (waited at the widening for the oncoming, then squeezed past).
 *   2. MISTAKE DEMOS grade EXACTLY FAILED_TO_YIELD — no COLLISION, no
 *      lane-keeping fault (the swing is centered in the oncoming lane).
 *   3. COMMITTED FILES under content/traces/sc-ov-narrow/ ARE the recordings of
 *      these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ov-narrow-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_OV_NARROW } from "../../lessons/scenario/templates-lanes";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScOvNarrowDrive, type ScOvNarrowTraceName } from "../scOvNarrow";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ov-narrow";
const NAMES: ScOvNarrowTraceName[] = ["shadow-correct", "mistake-barge", "mistake-force"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("ov-narrow-v1");
const drives = new Map<ScOvNarrowTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScOvNarrowDrive(district, n)]),
);

describe("sc-ov-narrow — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns YIELDED_TO_PRIORITY", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("YIELDED_TO_PRIORITY");
  });

  it("waits, then squeezes past to the far end with Bulgarian annotations", () => {
    expect(shadow.outcomes.some((o) => o.detail === "yielded" && o.success)).toBe(true);
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(200);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ov-narrow — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (["mistake-barge", "mistake-force"] as ScOvNarrowTraceName[]).entries()) {
    it(`${name}: exactly FAILED_TO_YIELD, never a collision or lane-keeping fault`, () => {
      const drive = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual([...SC_OV_NARROW.mistakes[i].codeRefs].sort());
      expect(codes).not.toContain("COLLISION");
      expect(codes).not.toContain("POOR_LANE_KEEPING");
      expect(codes).not.toContain("CENTER_LINE_TOUCHED");
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
    const again = recordScOvNarrowDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_OV_NARROW.shadow, ...SC_OV_NARROW.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_OV_NARROW.shadow.path, ...SC_OV_NARROW.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
