/**
 * Trace gate — „Дистанция при спиране в колона" (sc-follow-standstill on
 * fo-follow-v1, doc 72 FO-08), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW rests ~4.9 m behind the stationary lead → ZERO violations +
 *      CLEAN_DRIVING.
 *   2. MISTAKE DEMOS grade EXACTLY STANDSTILL_GAP_TOO_CLOSE (bumper-kiss and
 *      creep-up), never a COLLISION (they stop short of contact) nor a FOLLOWING
 *      code (they are at rest).
 *   3. COMMITTED FILES under content/traces/sc-follow-standstill/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-follow-standstill-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_FOLLOW_STANDSTILL } from "../../lessons/scenario/templates-following";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScFollowStandstillDrive, type ScFollowStandstillTraceName } from "../scFollowStandstill";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-follow-standstill";
const NAMES: ScFollowStandstillTraceName[] = ["shadow-correct", "mistake-bumper-kiss", "mistake-creep-up"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("fo-follow-v1");
const drives = new Map<ScFollowStandstillTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScFollowStandstillDrive(district, n)]),
);

describe("sc-follow-standstill — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("rests a safe gap behind the stopped lead with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });
  it("comes to rest behind the lead (final speed ≈ 0)", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(Math.abs(last.speedKmh)).toBeLessThan(1.5);
    expect(last.y).toBeGreaterThan(270);
  });
});

describe("sc-follow-standstill — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (["mistake-bumper-kiss", "mistake-creep-up"] as const).entries()) {
    it(`${name}: exactly STANDSTILL_GAP_TOO_CLOSE, no COLLISION / FOLLOWING`, () => {
      const codes = [...new Set(violationCodes(drives.get(name)!))].sort();
      expect(codes).toEqual([...SC_FOLLOW_STANDSTILL.mistakes[i].codeRefs].sort());
      expect(codes).not.toContain("COLLISION");
      expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
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
    const again = recordScFollowStandstillDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });
  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_FOLLOW_STANDSTILL.shadow, ...SC_FOLLOW_STANDSTILL.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_FOLLOW_STANDSTILL.shadow.path, ...SC_FOLLOW_STANDSTILL.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
