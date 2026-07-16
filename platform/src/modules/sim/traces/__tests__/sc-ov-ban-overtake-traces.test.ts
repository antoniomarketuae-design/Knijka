/**
 * Trace gate — „Изпреварване при забрана" (sc-ov-ban-overtake on ov-ban-v1,
 * doc 72 OV-06; ADR-006 stage 2a ZONE-BAN layer), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW follows the slow lead THROUGH the В24 zone and overtakes AFTER
 *      it ends → ZERO violations + CLEAN_DRIVING + SAFE_LANE_CHANGE (the
 *      legal pass is actively good, not merely unpunished).
 *   2. MISTAKE DEMOS grade EXACTLY OVERTAKING_IN_BAN_ZONE (both cut back
 *      toward the lead inside the armed span); the signalled lane changes
 *      earn SAFE_LANE_CHANGE — never a lane-change violation.
 *   3. COMMITTED FILES under content/traces/sc-ov-ban-overtake/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ov-ban-overtake-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_OV_BAN_OVERTAKE } from "../../lessons/scenario/templates-lanes";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScOvBanOvertakeDrive, type ScOvBanOvertakeTraceName } from "../scOvBanOvertake";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ov-ban-overtake";
const NAMES: ScOvBanOvertakeTraceName[] = ["shadow-correct", "mistake-overtake-in-zone", "mistake-early-jump"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("ov-ban-v1");
const drives = new Map<ScOvBanOvertakeTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScOvBanOvertakeDrive(district, n)]),
);

describe("sc-ov-ban-overtake — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("waits out the В24 zone and passes legally after it: ZERO violations, CLEAN_DRIVING + SAFE_LANE_CHANGE", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
    expect(commendationCodes(shadow)).toContain("SAFE_LANE_CHANGE");
  });
  it("carries Bulgarian annotations for the ghost narration", () => {
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ov-ban-overtake — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (["mistake-overtake-in-zone", "mistake-early-jump"] as const).entries()) {
    it(`${name}: exactly OVERTAKING_IN_BAN_ZONE, once, no lane-change violation`, () => {
      const drive = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual([...SC_OV_BAN_OVERTAKE.mistakes[i].codeRefs].sort());
      // Exactly ONE bill for the one illegal pass.
      expect(violationCodes(drive).filter((c) => c === "OVERTAKING_IN_BAN_ZONE")).toHaveLength(1);
      expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
      expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
      expect(codes).not.toContain("NOT_KEEPING_RIGHT");
      expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
      expect(codes).not.toContain("OVERTAKING_AT_CROSSING");
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
    const again = recordScOvBanOvertakeDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });
  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_OV_BAN_OVERTAKE.shadow, ...SC_OV_BAN_OVERTAKE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_OV_BAN_OVERTAKE.shadow.path, ...SC_OV_BAN_OVERTAKE.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});

describe("pinned geometry — the template copies match the committed map", () => {
  it("ov-ban-v1 meta.scenario mirrors the template recipe (lane centers + ban span)", () => {
    const d = district as {
      meta: {
        zonesVersion?: number;
        scenario?: {
          laneCenterRightM?: number;
          laneCenterLeftM?: number;
          banZone?: { kind?: string; signRef?: string; fromM?: number; toM?: number };
        };
      };
      zones?: Array<{ kind: string; fromM: number; toM: number; signRef: string }>;
    };
    expect(d.meta.zonesVersion).toBe(1);
    expect(d.meta.scenario?.laneCenterRightM).toBe(12.19);
    expect(d.meta.scenario?.laneCenterLeftM).toBe(4.06);
    expect(d.meta.scenario?.banZone?.kind).toBe("noOvertaking");
    expect(d.meta.scenario?.banZone?.signRef).toBe("В24");
    expect(d.meta.scenario?.banZone?.fromM).toBe(SC_OV_BAN_OVERTAKE.map.params.banFromM);
    expect(d.meta.scenario?.banZone?.toM).toBe(SC_OV_BAN_OVERTAKE.map.params.banToM);
    expect(d.zones?.[0]?.fromM).toBe(90);
    expect(d.zones?.[0]?.toM).toBe(210);
  });
});
