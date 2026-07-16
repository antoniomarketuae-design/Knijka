/**
 * Trace gate — „Аварийната лента" (sc-mw-emergency-lane on mw-v1, ЗДвП чл. 58,
 * т. 3 — the motorway emergency-lane ban), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns CLEAN_DRIVING — cruises
 *      the RIGHT travel lane at ~110, eases passing the breakdown scene (a
 *      stalled car ON the emergency lane, staged as a recorder obstacle rect
 *      — the sc-hazard-obstacle pattern) and NEVER touches the emergency
 *      lane: with the obstacle armed, zero contacts proves the pass.
 *   2. MISTAKE DEMOS grade EXACTLY EMERGENCY_LANE_DRIVING — once per drive
 *      (one excursion, one bill) — and NEVER a lane-change code (both drifts
 *      are signalled + mirror-checked; the point of the demo is that the
 *      indicator does NOT legalize the lane) and NEVER COLLISION (both exit
 *      the lane well before the stranded car).
 *   3. COMMITTED FILES under content/traces/sc-mw-emergency-lane/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public
 *      copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-mw-emergency-lane-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_MW_EMERGENCY_LANE } from "../../lessons/scenario/templates-lanes";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScMwEmergencyLaneDrive,
  type ScMwEmergencyLaneTraceName,
} from "../scMwEmergencyLane";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-mw-emergency-lane";
const NAMES: ScMwEmergencyLaneTraceName[] = [
  "shadow-correct",
  "mistake-undertake",
  "mistake-shoulder-cruise",
];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("mw-v1");
const drives = new Map<ScMwEmergencyLaneTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScMwEmergencyLaneDrive(district, n)]),
);

describe("sc-mw-emergency-lane — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations (obstacle armed) and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("passes the breakdown scene entirely in the TRAVEL lane — never touching the emergency lane", () => {
    // The whole drive holds the cruise lane (x = 0); the emergency lane
    // center sits at +8.13 and its inner boundary at ~+4.06.
    for (const s of shadow.trace.samples) {
      expect(s.x, `t=${s.tSec}`).toBeLessThan(2);
    }
    // …and it genuinely PASSES the scene (y = 780) at motorway pace.
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(930);
    const passing = shadow.trace.samples.filter((s) => s.y > 700 && s.y < 830);
    expect(passing.length).toBeGreaterThan(0);
    expect(Math.min(...passing.map((s) => Math.abs(s.speedKmh)))).toBeGreaterThan(80);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-mw-emergency-lane — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Изпреварване през аварийната лента“: exactly EMERGENCY_LANE_DRIVING, once — the indicator does NOT exempt", () => {
    const drive = drives.get("mistake-undertake")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual(
      [...SC_MW_EMERGENCY_LANE.mistakes[0].codeRefs].sort(),
    );
    expect(codes.filter((c) => c === "EMERGENCY_LANE_DRIVING")).toHaveLength(1);
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR"); // both drifts signalled
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
    expect(codes).not.toContain("COLLISION"); // exits well before the stranded car
    // The undertake genuinely rode the emergency lane at speed.
    const stint = drive.trace.samples.filter((s) => s.y > 420 && s.y < 600);
    expect(stint.length).toBeGreaterThan(0);
    for (const s of stint) expect(s.x, `y=${s.y}`).toBeGreaterThan(6);
    expect(Math.max(...stint.map((s) => Math.abs(s.speedKmh)))).toBeGreaterThan(95);
    // The polite signalling really happened (the demo's own irony).
    expect(commendationCodes(drive)).toContain("SAFE_LANE_CHANGE");
  });

  it("„Каране по аварийната лента“: the same single code — one long excursion, one bill", () => {
    const drive = drives.get("mistake-shoulder-cruise")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual(
      [...SC_MW_EMERGENCY_LANE.mistakes[1].codeRefs].sort(),
    );
    expect(codes.filter((c) => c === "EMERGENCY_LANE_DRIVING")).toHaveLength(1);
    expect(codes).not.toContain("COLLISION");
    // The cruise really settled into the lane for hundreds of metres.
    const stint = drive.trace.samples.filter((s) => s.y > 340 && s.y < 630);
    expect(stint.length).toBeGreaterThan(0);
    for (const s of stint) expect(s.x, `y=${s.y}`).toBeGreaterThan(6);
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
    const again = recordScMwEmergencyLaneDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [
      SC_MW_EMERGENCY_LANE.shadow,
      ...SC_MW_EMERGENCY_LANE.mistakes.map((m) => m.traceRef),
    ];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_MW_EMERGENCY_LANE.shadow.path,
      ...SC_MW_EMERGENCY_LANE.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
