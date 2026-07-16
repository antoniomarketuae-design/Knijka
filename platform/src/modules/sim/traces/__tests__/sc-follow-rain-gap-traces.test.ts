/**
 * Trace gate — „Дистанция в дъжд" (sc-follow-rain-gap on fo-follow-v1, doc 72
 * FO-04), doc 76 §5/§9 stages 3+5. The rain-following detector ships config-OFF;
 * the recorder enables it via ruleConfig (the per-lesson drill opt-in) and
 * records in RAIN, so the gate replays with the drill ON:
 *   1. SHADOW: the same 18 m gap at a calm 25 km/h (wet-prudent) → ZERO
 *      violations + CLEAN_DRIVING.
 *   2. MISTAKE DEMOS grade EXACTLY FOLLOWING_TOO_CLOSE_FOR_RAIN (dry-habit gap
 *      at 40 km/h, and gap-melts on acceleration), never the base
 *      FOLLOWING_TOO_CLOSE nor a conditions-speed / rain-lights code.
 *   3. COMMITTED FILES under content/traces/sc-follow-rain-gap/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-follow-rain-gap-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_FOLLOW_RAIN_GAP } from "../../lessons/scenario/templates-following";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScFollowRainGapDrive, type ScFollowRainGapTraceName } from "../scFollowRainGap";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-follow-rain-gap";
const NAMES: ScFollowRainGapTraceName[] = ["shadow-correct", "mistake-dry-habit", "mistake-gap-melts"];

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
const drives = new Map<ScFollowRainGapTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScFollowRainGapDrive(district, n)]),
);

describe("sc-follow-rain-gap — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("wet-prudent gap in rain → ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });
});

describe("sc-follow-rain-gap — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (["mistake-dry-habit", "mistake-gap-melts"] as const).entries()) {
    it(`${name}: exactly FOLLOWING_TOO_CLOSE_FOR_RAIN, no base following / conditions code`, () => {
      const codes = [...new Set(violationCodes(drives.get(name)!))].sort();
      expect(codes).toEqual([...SC_FOLLOW_RAIN_GAP.mistakes[i].codeRefs].sort());
      expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
      expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
      expect(codes).not.toContain("HEADLIGHTS_OFF_IN_RAIN");
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
    const again = recordScFollowRainGapDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });
  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_FOLLOW_RAIN_GAP.shadow, ...SC_FOLLOW_RAIN_GAP.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_FOLLOW_RAIN_GAP.shadow.path, ...SC_FOLLOW_RAIN_GAP.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
