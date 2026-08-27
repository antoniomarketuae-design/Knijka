/**
 * Trace gate — „Бус лента" (sc-ov-bus-lane on ov-bus-v1, doc 72 SN-05;
 * ADR-006 stage 2b BUS LANES), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW travels the GENERAL lane through the whole BUS span (24+ s —
 *      far past the keep-right 12 s sustain) and returns right after it →
 *      ZERO violations — NOT_KEEPING_RIGHT provably does NOT fire (the SN-05
 *      keep-right interplay assert) — plus CLEAN_DRIVING + SAFE_LANE_CHANGE.
 *   2. MISTAKE DEMOS grade EXACTLY DRIVING_IN_BUS_LANE (the full-span cruise
 *      and the mid-span „just to get ahead" dip); the signalled changes stay
 *      commendations — the graded fault is the TRAVEL, not the signalling.
 *   3. COMMITTED FILES under content/traces/sc-ov-bus-lane/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ov-bus-lane-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_OV_BUS_LANE } from "../../lessons/scenario/templates-lanes";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScOvBusLaneDrive, type ScOvBusLaneTraceName } from "../scOvBusLane";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ov-bus-lane";
const NAMES: ScOvBusLaneTraceName[] = ["shadow-correct", "mistake-cruise", "mistake-dip-in"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("ov-bus-v1");
const drives = new Map<ScOvBusLaneTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScOvBusLaneDrive(district, n)]),
);

describe("sc-ov-bus-lane — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("travels the general lane through the span, returns right after: ZERO violations, CLEAN_DRIVING + SAFE_LANE_CHANGE", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
    expect(commendationCodes(shadow)).toContain("SAFE_LANE_CHANGE");
  });
  it("the keep-right interplay assert: 24+ s of left-lane travel in-span and NOT_KEEPING_RIGHT does NOT fire", () => {
    // The whole point of the SN-05 exemption: the bus lane is not a required
    // lane, so the ONLY correct lane choice must grade nothing.
    expect(violationCodes(shadow)).not.toContain("NOT_KEEPING_RIGHT");
    // The proof is real: the drive genuinely spends the span in the left lane
    // far past the 12 s sustain (240 m at ~38 km/h ≈ 23 s).
    expect(shadow.trace.meta.durationSec).toBeGreaterThan(23);
  });
  it("carries Bulgarian annotations for the ghost narration", () => {
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(3);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ov-bus-lane — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (["mistake-cruise", "mistake-dip-in"] as const).entries()) {
    it(`${name}: exactly DRIVING_IN_BUS_LANE, once, no lane-change violation`, () => {
      const drive = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual([...SC_OV_BUS_LANE.mistakes[i].codeRefs].sort());
      // Exactly ONE bill for the one bus-lane cruise.
      // Count CHARGES, not raw reducer events — 2026-08-27. The bus-lane re-grade
    // emits a second event marked `regrade: true`, dropped by lessons/engine.ts
    // wherever the code was already charged, so the student is still billed once.
    // The demand is unchanged: EXACTLY ONE CHARGE.
    expect(
      drive.ruleEvents.filter(
        (e) => e.kind === "violation" && e.code === "DRIVING_IN_BUS_LANE" && e.regrade !== true,
      ),
    ).toHaveLength(1);
      expect(codes).not.toContain("NOT_KEEPING_RIGHT");
      expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
      expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
      expect(codes).not.toContain("POOR_LANE_KEEPING");
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
    const again = recordScOvBusLaneDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });
  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_OV_BUS_LANE.shadow, ...SC_OV_BUS_LANE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_OV_BUS_LANE.shadow.path, ...SC_OV_BUS_LANE.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});

describe("pinned geometry — the template copies match the committed map", () => {
  it("ov-bus-v1 meta.scenario mirrors the template recipe (lane centers + BUS span)", () => {
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
    expect(d.meta.scenario?.banZone?.kind).toBe("busLane");
    expect(d.meta.scenario?.banZone?.signRef).toBe("BUS");
    expect(d.meta.scenario?.banZone?.fromM).toBe(SC_OV_BUS_LANE.map.params.banFromM);
    expect(d.meta.scenario?.banZone?.toM).toBe(SC_OV_BUS_LANE.map.params.banToM);
    expect(d.zones?.[0]?.fromM).toBe(90);
    expect(d.zones?.[0]?.toM).toBe(330);
  });
});
