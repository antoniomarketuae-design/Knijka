/**
 * Trace gate — „Охраняем прелез с бариера" (sc-rx-guarded on rx-guarded-v1,
 * doc 72 RX-01; ADR-006 stage 3a RAIL PACK slice 1), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW arrives at the lowered barrier (deterministic timetable: down
 *      [0, 40) of every 90 s), waits at the stop line, crosses after the lift
 *      → ZERO violations + CLEAN_DRIVING.
 *   2. MISTAKE DEMOS grade EXACTLY RAIL_CROSSING_VIOLATION, once each, both
 *      with detail "entered-barred": the blast-through AND the
 *      polite-stop-then-creep — a stop does NOT acquit a barred entry.
 *   3. COMMITTED FILES under content/traces/sc-rx-guarded/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * The timetable determinism itself (same session clock → same barred phases)
 * is what makes these recordings replayable at all — the barrier is WORLD
 * DATA, not an actor.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-rx-guarded-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_RX_GUARDED } from "../../lessons/scenario/templates-rail";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScRxGuardedDrive, type ScRxGuardedTraceName } from "../scRxGuarded";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-rx-guarded";
const NAMES: ScRxGuardedTraceName[] = ["shadow-correct", "mistake-run-barrier", "mistake-creep-barred"];

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

const district = loadDistrict("rx-guarded-v1");
const drives = new Map<ScRxGuardedTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScRxGuardedDrive(district, n)]),
);

describe("sc-rx-guarded — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("waits out the lowered barrier and crosses after the lift: ZERO violations + CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });
  it("the wait is real: the drive outlasts the 40 s barred window before finishing", () => {
    expect(drives.get("shadow-correct")!.trace.meta.durationSec).toBeGreaterThan(40);
  });
  it("carries Bulgarian annotations for the ghost narration", () => {
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-rx-guarded — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (["mistake-run-barrier", "mistake-creep-barred"] as const).entries()) {
    it(`${name}: exactly RAIL_CROSSING_VIOLATION, once, detail "entered-barred"`, () => {
      const drive = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual([...SC_RX_GUARDED.mistakes[i].codeRefs].sort());
      // Exactly ONE bill for the one barred entry — the creep demo's polite
      // stop neither acquits (still barred) nor double-bills (never rests ON
      // the band).
      expect(violationCodes(drive).filter((c) => c === "RAIL_CROSSING_VIOLATION")).toHaveLength(1);
      expect(violationDetails(drive)).toEqual(["entered-barred"]);
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
    const again = recordScRxGuardedDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });
  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_RX_GUARDED.shadow, ...SC_RX_GUARDED.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_RX_GUARDED.shadow.path, ...SC_RX_GUARDED.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});

describe("pinned geometry — the template copies match the committed map", () => {
  it("rx-guarded-v1 meta.scenario mirrors the template recipe (band + barrier timetable)", () => {
    const d = district as {
      meta: {
        zonesVersion?: number;
        scenario?: {
          laneCenterRightM?: number;
          railCrossing?: {
            signRef?: string;
            fromM?: number;
            toM?: number;
            guarded?: boolean;
            stopLineY?: number;
            barrier?: { cycleSec?: number; downFromSec?: number; downToSec?: number };
          };
        };
      };
      zones?: Array<{
        kind: string;
        fromM: number;
        toM: number;
        signRef: string;
        guarded?: boolean;
        barrier?: { cycleSec: number; downFromSec: number; downToSec: number };
      }>;
    };
    expect(d.meta.zonesVersion).toBe(1);
    expect(d.meta.scenario?.laneCenterRightM).toBe(4.06);
    expect(d.meta.scenario?.railCrossing?.signRef).toBe("А34");
    expect(d.meta.scenario?.railCrossing?.guarded).toBe(true);
    expect(d.meta.scenario?.railCrossing?.fromM).toBe(SC_RX_GUARDED.map.params.crossingFromM);
    expect(d.meta.scenario?.railCrossing?.toM).toBe(SC_RX_GUARDED.map.params.crossingToM);
    expect(d.meta.scenario?.railCrossing?.stopLineY).toBe(145);
    expect(d.meta.scenario?.railCrossing?.barrier?.cycleSec).toBe(SC_RX_GUARDED.map.params.barrierCycleSec);
    expect(d.meta.scenario?.railCrossing?.barrier?.downFromSec).toBe(SC_RX_GUARDED.map.params.barrierDownFromSec);
    expect(d.meta.scenario?.railCrossing?.barrier?.downToSec).toBe(SC_RX_GUARDED.map.params.barrierDownToSec);
    const z = d.zones?.[0];
    expect(z?.kind).toBe("railCrossing");
    expect(z?.guarded).toBe(true);
    expect(z?.barrier).toEqual({ cycleSec: 90, downFromSec: 0, downToSec: 40 });
    expect(z?.fromM).toBe(150);
    expect(z?.toM).toBe(156);
  });
});
