/**
 * Trace gate — „Неохраняем жп прелез" (sc-rx-unguarded on rx-unguarded-v1,
 * doc 72 RX-02; ADR-006 stage 3a RAIL PACK slice 1), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW stops fully at the СТОП-cross line, scans BOTH ways and crosses
 *      briskly → ZERO violations + CLEAN_DRIVING (the correct ritual is
 *      actively good, not merely unpunished).
 *   2. MISTAKE DEMOS grade EXACTLY RAIL_CROSSING_VIOLATION, once each, with
 *      the case-precise detail: the roll-through bills "no-stop" (the
 *      mandatory unguarded stop, чл. 51–53) and the mid-band freeze bills
 *      "stopped-on-track" (the RX-03 kill — its own CORRECT stop at the line
 *      keeps the ENTRY innocent, so exactly one act bills).
 *   3. COMMITTED FILES under content/traces/sc-rx-unguarded/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-rx-unguarded-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_RX_UNGUARDED } from "../../lessons/scenario/templates-rail";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScRxUnguardedDrive, type ScRxUnguardedTraceName } from "../scRxUnguarded";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-rx-unguarded";
const NAMES: ScRxUnguardedTraceName[] = ["shadow-correct", "mistake-roll-through", "mistake-stop-on-track"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function violationDetails(d: RecordedDrive): Array<string | undefined> {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.detail);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("rx-unguarded-v1");
const drives = new Map<ScRxUnguardedTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScRxUnguardedDrive(district, n)]),
);

describe("sc-rx-unguarded — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("stops at the line, scans both ways, crosses briskly: ZERO violations + CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });
  it("the scan is real: a LEFT and a RIGHT glance are recorded before the crossing", () => {
    const glances = shadow.trace.events.filter(
      (e) => e.kind === "glance-left" || e.kind === "glance-right",
    );
    expect(glances.map((g) => g.kind)).toEqual(expect.arrayContaining(["glance-left", "glance-right"]));
  });
  it("carries Bulgarian annotations for the ghost narration", () => {
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-rx-unguarded — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  const CASES: Array<{ name: ScRxUnguardedTraceName; mistakeIdx: number; detail: string }> = [
    { name: "mistake-roll-through", mistakeIdx: 0, detail: "no-stop" },
    { name: "mistake-stop-on-track", mistakeIdx: 1, detail: "stopped-on-track" },
  ];
  for (const { name, mistakeIdx, detail } of CASES) {
    it(`${name}: exactly RAIL_CROSSING_VIOLATION, once, detail "${detail}"`, () => {
      const drive = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual([...SC_RX_UNGUARDED.mistakes[mistakeIdx].codeRefs].sort());
      // Exactly ONE bill — one act, one code (the stop-on-track demo's own
      // correct stop at the line keeps its band ENTRY innocent).
      expect(violationCodes(drive).filter((c) => c === "RAIL_CROSSING_VIOLATION")).toHaveLength(1);
      expect(violationDetails(drive)).toEqual([detail]);
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
    const again = recordScRxUnguardedDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });
  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_RX_UNGUARDED.shadow, ...SC_RX_UNGUARDED.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_RX_UNGUARDED.shadow.path, ...SC_RX_UNGUARDED.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});

describe("pinned geometry — the template copies match the committed map", () => {
  it("rx-unguarded-v1 meta.scenario mirrors the template recipe (lane center + band + stop line)", () => {
    const d = district as {
      meta: {
        zonesVersion?: number;
        scenario?: {
          laneCenterRightM?: number;
          railCrossing?: { signRef?: string; fromM?: number; toM?: number; guarded?: boolean; stopLineY?: number };
        };
      };
      zones?: Array<{ kind: string; fromM: number; toM: number; signRef: string; guarded?: boolean }>;
    };
    expect(d.meta.zonesVersion).toBe(1);
    expect(d.meta.scenario?.laneCenterRightM).toBe(4.06);
    expect(d.meta.scenario?.railCrossing?.signRef).toBe("А35");
    expect(d.meta.scenario?.railCrossing?.guarded).toBe(false);
    expect(d.meta.scenario?.railCrossing?.fromM).toBe(SC_RX_UNGUARDED.map.params.crossingFromM);
    expect(d.meta.scenario?.railCrossing?.toM).toBe(SC_RX_UNGUARDED.map.params.crossingToM);
    expect(d.meta.scenario?.railCrossing?.stopLineY).toBe(145);
    expect(d.zones?.[0]?.kind).toBe("railCrossing");
    expect(d.zones?.[0]?.guarded).toBeUndefined();
    expect(d.zones?.[0]?.fromM).toBe(150);
    expect(d.zones?.[0]?.toM).toBe(156);
  });
});
