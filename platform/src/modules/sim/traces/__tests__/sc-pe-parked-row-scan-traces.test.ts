/**
 * S trace gate — „Покрай редицата паркирани коли" (sc-pe-parked-row-scan on
 * pe-child-v1, doc 72 PE-04), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns PEDESTRIAN_YIELDED.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs — the fast row grades
 *      SPEEDING_OVER_LIMIT + COLLISION (never a too-fast or a not-yielded: the
 *      strike lands before the late figure is on the driving surface); the hug
 *      grades COLLISION (a legal 27 km/h, never a speeding/too-fast/not-yielded).
 *   3. COMMITTED FILES under content/traces/sc-pe-parked-row-scan/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-pe-parked-row-scan-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_PE_PARKED_ROW_SCAN } from "../../lessons/scenario/templates-pe2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScPeParkedRowScanDrive, type ScPeParkedRowScanTraceName } from "../scPeParkedRowScan";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-pe-parked-row-scan";
const NAMES: ScPeParkedRowScanTraceName[] = ["shadow-correct", "mistake-fast-row", "mistake-hug-row"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("pe-child-v1");
const drives = new Map<ScPeParkedRowScanTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScPeParkedRowScanDrive(district, n)]),
);

describe("sc-pe-parked-row-scan — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns PEDESTRIAN_YIELDED", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("PEDESTRIAN_YIELDED");
  });

  it("rode the whole row under the 30 km/h cap, stopped short and cleared the zebra", () => {
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThan(30); // never over the crossing-approach cap
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(116);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-pe-parked-row-scan — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  // doc 86 T11 — RE-BASELINED, deliberately. This assertion used to demand
  // `not.toContain("PEDESTRIAN_CROSSING_TOO_FAST")`, and the only reason the
  // demo satisfied it was the template's `roadFromM 4.0`: 2.4 m past the real
  // carriageway edge (9.73 − 8.125 = 1.605), which kept `pedestrianOnCrossing`
  // false while the child was already on the tarmac inside the driver's lane.
  // That same lie is what made the drill's fault surface run backwards — the
  // obedient 32 km/h driver collided and the 40–50 km/h driver was billed
  // nothing. With the honest occupancy window the fast-row demo now grades the
  // чл. 119 approach code as well, which is what the drive actually did.
  it("„50 покрай редицата“: exactly SPEEDING_OVER_LIMIT + PEDESTRIAN_CROSSING_TOO_FAST + COLLISION, никога dangerous/not-yielded", () => {
    const drive = drives.get("mistake-fast-row")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PE_PARKED_ROW_SCAN.mistakes[0].codeRefs].sort());
    expect(codes).toContain("PEDESTRIAN_CROSSING_TOO_FAST");
    expect(codes).not.toContain("PEDESTRIAN_NOT_YIELDED");
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
  });

  it("„плътно покрай колите“: exactly COLLISION, never speeding, too-fast or not-yielded", () => {
    const drive = drives.get("mistake-hug-row")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PE_PARKED_ROW_SCAN.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("PEDESTRIAN_CROSSING_TOO_FAST");
    expect(codes).not.toContain("PEDESTRIAN_NOT_YIELDED");
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
    const again = recordScPeParkedRowScanDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_PE_PARKED_ROW_SCAN.shadow, ...SC_PE_PARKED_ROW_SCAN.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_PE_PARKED_ROW_SCAN.shadow.path, ...SC_PE_PARKED_ROW_SCAN.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
