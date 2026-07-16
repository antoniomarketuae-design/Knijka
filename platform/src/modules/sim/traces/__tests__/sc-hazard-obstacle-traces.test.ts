/**
 * S trace gate — „Заобикаляне на обект на платното" (sc-hazard-obstacle on
 * hz-obstacle-v1, doc 72 OV-18), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations — eases around the stalled obstacle
 *      WITHIN the lane (never crossing the centreline) and clears it.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs (COLLISION for both
 *      holding the line into the obstacle and the late clipping swerve), and
 *      NEVER a lane/wrong-way code (the swerve stays in the driver's own bank).
 *   3. COMMITTED FILES under content/traces/sc-hazard-obstacle/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-hazard-obstacle-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_HAZARD_OBSTACLE } from "../../lessons/scenario/templates-hazards";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScHazardObstacleDrive, type ScHazardObstacleTraceName } from "../scHazardObstacle";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-hazard-obstacle";
const NAMES: ScHazardObstacleTraceName[] = ["shadow-correct", "mistake-hold-line", "mistake-late-swerve"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

const district = loadDistrict("hz-obstacle-v1");
const drives = new Map<ScHazardObstacleTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScHazardObstacleDrive(district, n)]),
);

describe("sc-hazard-obstacle — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations (clears the obstacle without contact)", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("eases around WITHIN the lane (never crosses the centreline) and reaches the end", () => {
    const samples = shadow.trace.samples;
    // Stays in the northbound bank the whole time: x > 0 (never crosses x = 0).
    for (const s of samples) expect(s.x).toBeGreaterThan(0);
    // Did ease over toward the centreline to clear (x drops near 2 by the obstacle).
    expect(Math.min(...samples.map((s) => s.x))).toBeLessThan(2.6);
    const last = samples[samples.length - 1];
    expect(last.y).toBeGreaterThan(215);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-hazard-obstacle — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Задържане по линията“: exactly COLLISION, never a lane/wrong-way code", () => {
    const drive = drives.get("mistake-hold-line")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_HAZARD_OBSTACLE.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("POOR_LANE_KEEPING");
    expect(codes).not.toContain("WRONG_WAY");
  });

  it("„Закъсняло отклонение“: exactly COLLISION, never a lane/wrong-way code", () => {
    const drive = drives.get("mistake-late-swerve")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_HAZARD_OBSTACLE.mistakes[1].codeRefs].sort());
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
    const again = recordScHazardObstacleDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_HAZARD_OBSTACLE.shadow, ...SC_HAZARD_OBSTACLE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_HAZARD_OBSTACLE.shadow.path, ...SC_HAZARD_OBSTACLE.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
