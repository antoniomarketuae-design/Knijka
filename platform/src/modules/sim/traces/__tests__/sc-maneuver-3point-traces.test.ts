/**
 * S-maneuver trace gate — „Обратен завой в три точки" (sc-maneuver-3point on
 * ov-narrow-v1, doc 72 PK-12 / Наредба-38 обратен завой), doc 76 §5/§9 stages
 * 3+5:
 *   1. SHADOW replays with ZERO violations, reverses travel direction north →
 *      south, and comes to rest inside the turn corridor facing back (heading
 *      ~180°), never touching a curb.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs (COLLISION for both
 *      the too-wide forward swing onto the far curb and the over-correcting
 *      reverse onto the near curb), and NEVER a speeding/lane code (every move
 *      is at creep speed on a two-way street).
 *   3. COMMITTED FILES under content/traces/sc-maneuver-3point/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-maneuver-3point-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_MANEUVER_3POINT } from "../../lessons/scenario/templates-maneuver";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScManeuver3PointDrive, type ScManeuver3PointTraceName } from "../scManeuver3Point";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-maneuver-3point";
const NAMES: ScManeuver3PointTraceName[] = ["shadow-correct", "mistake-wide", "mistake-shunt"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

const district = loadDistrict("ov-narrow-v1");
const drives = new Map<ScManeuver3PointTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScManeuver3PointDrive(district, n)]),
);

describe("sc-maneuver-3point — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations (no contact with either curb)", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("reverses direction north → south and rests inside the corridor facing back", () => {
    const samples = shadow.trace.samples;
    const first = samples[0];
    const last = samples[samples.length - 1];
    expect(Math.abs(first.headingDeg)).toBeLessThan(15); // started heading north
    // ended facing south (~180°), fully stopped, inside the corridor y ∈ [48, 72]
    expect(Math.abs(last.headingDeg - 180)).toBeLessThan(15);
    expect(Math.abs(last.speedKmh)).toBeLessThan(1);
    expect(Math.abs(last.y - 60)).toBeLessThan(12);
    expect(Math.abs(last.x)).toBeLessThan(8);
    // used a reverse leg (the middle of the three movements)
    expect(samples.some((s) => s.gear < 0)).toBe(true);
    // never came near a curb (x = ±9): the correct swing clears them
    for (const s of samples) expect(Math.abs(s.x)).toBeLessThan(8);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-maneuver-3point — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Твърде широк замах“: exactly COLLISION, never a lane/speeding code", () => {
    const drive = drives.get("mistake-wide")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_MANEUVER_3POINT.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("POOR_LANE_KEEPING");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
  });

  it("„Излишни маневри“: exactly COLLISION, never a lane/speeding code", () => {
    const drive = drives.get("mistake-shunt")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_MANEUVER_3POINT.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("POOR_LANE_KEEPING");
    expect(codes).not.toContain("WRONG_WAY");
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
    const again = recordScManeuver3PointDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_MANEUVER_3POINT.shadow, ...SC_MANEUVER_3POINT.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_MANEUVER_3POINT.shadow.path, ...SC_MANEUVER_3POINT.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
