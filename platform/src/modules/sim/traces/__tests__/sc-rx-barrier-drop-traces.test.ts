/**
 * Trace gate — „Бариерата тръгва надолу" (sc-rx-barrier-drop on rx-drop-v1,
 * doc 72 RX-01, the DESCENDING barrier; ADR-006 stage 3a RAIL PACK), doc 76
 * §5/§9 stages 3+5:
 *   1. SHADOW reaches the stop line as the barrier drops (deterministic
 *      timetable: OPEN at spawn, down [20, 60) of every 90 s), waits out the
 *      WHOLE down-window at the line, crosses in the open window [60, 90) →
 *      ZERO violations + CLEAN_DRIVING.
 *   2. MISTAKE DEMOS grade EXACTLY RAIL_CROSSING_VIOLATION, once each, but with
 *      DISTINCT details — the same-code/different-detail discipline:
 *        - „Гмуркане под спускащата се бариера" → detail "entered-barred"
 *          (dives onto the band inside the barred window without stopping);
 *        - „Спиране върху релсите" → detail "stopped-on-track" (enters while
 *          the crossing is still OPEN — an innocent entry, чл. 52 — then
 *          FREEZES on the track band as the arm comes down; the REST is the kill).
 *   3. COMMITTED FILES under content/traces/sc-rx-barrier-drop/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * The timetable determinism itself (same session clock → same barred phases)
 * is what makes these recordings replayable at all — the barrier is WORLD
 * DATA, not an actor.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-rx-barrier-drop-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_RX_BARRIER_DROP } from "../../lessons/scenario/templates-rail";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScRxBarrierDropDrive, type ScRxBarrierDropTraceName } from "../scRxBarrierDrop";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-rx-barrier-drop";
const NAMES: ScRxBarrierDropTraceName[] = ["shadow-correct", "mistake-dive-barrier", "mistake-stop-on-track"];
/** The detail each mistake demo is built to trip — pinned in route order. */
const MISTAKE_DETAILS: Record<Exclude<ScRxBarrierDropTraceName, "shadow-correct">, string> = {
  "mistake-dive-barrier": "entered-barred",
  "mistake-stop-on-track": "stopped-on-track",
};

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

const district = loadDistrict("rx-drop-v1");
const drives = new Map<ScRxBarrierDropTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScRxBarrierDropDrive(district, n)]),
);

describe("sc-rx-barrier-drop — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("meets the drop, waits it out, and crosses after the lift: ZERO violations + CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });
  it("the wait is real: the drive outlasts the 40 s down-window ([20, 60)) before finishing", () => {
    expect(shadow.trace.meta.durationSec).toBeGreaterThan(60);
  });
  it("carries Bulgarian annotations for the ghost narration", () => {
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-rx-barrier-drop — mistakes grade their exact codes + details (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (["mistake-dive-barrier", "mistake-stop-on-track"] as const).entries()) {
    it(`${name}: exactly RAIL_CROSSING_VIOLATION, once, detail "${MISTAKE_DETAILS[name]}"`, () => {
      const drive = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual([...SC_RX_BARRIER_DROP.mistakes[i].codeRefs].sort());
      // Exactly ONE bill: the dive convicts on its barred ENTRY, the freeze on
      // its REST — neither double-bills.
      expect(violationCodes(drive).filter((c) => c === "RAIL_CROSSING_VIOLATION")).toHaveLength(1);
      // The DETAIL is what separates the two demos: same code, two faults.
      expect(violationDetails(drive)).toEqual([MISTAKE_DETAILS[name]]);
    });
  }
  it("the two mistakes are the SAME code from DIFFERENT acts (the detail discipline)", () => {
    const dive = violationDetails(drives.get("mistake-dive-barrier")!);
    const freeze = violationDetails(drives.get("mistake-stop-on-track")!);
    expect(dive).toEqual(["entered-barred"]);
    expect(freeze).toEqual(["stopped-on-track"]);
    expect(dive).not.toEqual(freeze);
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
    const again = recordScRxBarrierDropDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });
  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_RX_BARRIER_DROP.shadow, ...SC_RX_BARRIER_DROP.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_RX_BARRIER_DROP.shadow.path, ...SC_RX_BARRIER_DROP.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});

describe("pinned geometry — the template copies match the committed map", () => {
  it("rx-drop-v1 meta.scenario mirrors the template recipe (band + descending-barrier timetable)", () => {
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
    expect(d.meta.scenario?.railCrossing?.fromM).toBe(SC_RX_BARRIER_DROP.map.params.crossingFromM);
    expect(d.meta.scenario?.railCrossing?.toM).toBe(SC_RX_BARRIER_DROP.map.params.crossingToM);
    expect(d.meta.scenario?.railCrossing?.stopLineY).toBe(145);
    expect(d.meta.scenario?.railCrossing?.barrier?.cycleSec).toBe(SC_RX_BARRIER_DROP.map.params.barrierCycleSec);
    expect(d.meta.scenario?.railCrossing?.barrier?.downFromSec).toBe(SC_RX_BARRIER_DROP.map.params.barrierDownFromSec);
    expect(d.meta.scenario?.railCrossing?.barrier?.downToSec).toBe(SC_RX_BARRIER_DROP.map.params.barrierDownToSec);
    // The DROP signature: OPEN at spawn (downFromSec > 0), barred [20, 60).
    expect(d.meta.scenario?.railCrossing?.barrier?.downFromSec).toBe(20);
    const z = d.zones?.[0];
    expect(z?.kind).toBe("railCrossing");
    expect(z?.guarded).toBe(true);
    expect(z?.barrier).toEqual({ cycleSec: 90, downFromSec: 20, downToSec: 60 });
    expect(z?.fromM).toBe(150);
    expect(z?.toM).toBe(156);
  });
});
