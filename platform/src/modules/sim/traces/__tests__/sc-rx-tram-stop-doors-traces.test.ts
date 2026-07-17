/**
 * Trace gate — the NO-ISLAND TRAM-STOP (ADR-006 stage 3b; doc 76 §5/§9, stages
 * 3+5): sc-rx-tram-stop-doors on rx-tram-stop-v1, the RX-04 INVERSE of
 * sc-rx-tram-island.
 *
 *  1. The SHADOW replays through the PRODUCTION stack (runtime + traffic +
 *     scenario director + rules) with ZERO violations and earns
 *     PEDESTRIAN_YIELDED, resolving the staged passenger as "yielded".
 *  2. MISTAKE DEMOS grade EXACTLY their template codeRefs:
 *     - „Провиране покрай отворените врати" → PEDESTRIAN_NOT_YIELDED + COLLISION
 *       (threads past the doors INTO the alighting passenger);
 *     - „Пълзене през слизащите" → PEDESTRIAN_NOT_YIELDED alone (rolls across
 *       after the passenger is past the lane but still on the carriageway).
 *  3. COMMITTED FILES under content/traces/sc-rx-tram-stop-doors/ ARE the
 *     recordings of these scripts, byte-for-byte, with identical public copies.
 *  4. PINNED GEOMETRY: the template's copies match the generated map.
 *
 * RE-RECORD (after ANY change to the scripts, the recorder, the district or the
 * rule engine, then commit the JSON):
 *
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-rx-tram-stop-doors-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_RX_TRAM_STOP } from "../../lessons/scenario/templates-rail2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScRxTramStopDrive,
  scRxTramStopTraceNames,
  SC_RX_TRAM_STOP_ID,
  type ScRxTramStopTraceName,
} from "../scRxTramStopDoors";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}

function violationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

function commendationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("rx-tram-stop-v1");

const drives = new Map<ScRxTramStopTraceName, RecordedDrive>(
  scRxTramStopTraceNames().map((n) => [n, recordScRxTramStopDrive(district, n)]),
);

describe("sc-rx-tram-stop-doors — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("stops behind the open doors, waits the passenger off the lane: ZERO violations + PEDESTRIAN_YIELDED", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("PEDESTRIAN_YIELDED");
  });

  it("resolves the staged passenger as 'yielded' and clears the stop northbound", () => {
    const outcome = shadow.outcomes.find((o) => o.eventId === "sc-rts-passenger");
    expect(outcome).toBeDefined();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(125);
    expect(Math.abs(last.speedKmh)).toBeLessThan(0.5);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-rx-tram-stop-doors — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Провиране покрай отворените врати“: exactly PEDESTRIAN_NOT_YIELDED + COLLISION", () => {
    const drive = drives.get("mistake-thread-doors")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_RX_TRAM_STOP.mistakes[0].codeRefs].sort());
    const hit = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "COLLISION")!;
    expect(hit.kind === "violation" ? hit.detail : undefined).toBe("pedestrian");
    expect(drive.outcomes.find((o) => o.eventId === "sc-rts-passenger")?.detail).toBe("collision");
  });

  it("„Пълзене през слизащите“: exactly PEDESTRIAN_NOT_YIELDED, once, no collision", () => {
    const drive = drives.get("mistake-creep-through")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_RX_TRAM_STOP.mistakes[1].codeRefs].sort());
    expect(violationCodes(drive).filter((c) => c === "PEDESTRIAN_NOT_YIELDED")).toHaveLength(1);
    expect(violationCodes(drive)).not.toContain("COLLISION");
    expect(drive.outcomes.find((o) => o.eventId === "sc-rts-passenger")?.detail).toBe("violation");
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", SC_RX_TRAM_STOP_ID);
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", SC_RX_TRAM_STOP_ID);

  for (const name of scRxTramStopTraceNames()) {
    it(`${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe(SC_RX_TRAM_STOP_ID);
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const name = scRxTramStopTraceNames()[0];
    const again = recordScRxTramStopDrive(district, name);
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get(name)!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_RX_TRAM_STOP.shadow, ...SC_RX_TRAM_STOP.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SC_RX_TRAM_STOP_ID}/`)).toBe(true);
    }
    const expected = scRxTramStopTraceNames().map(
      (n) => `content/traces/${SC_RX_TRAM_STOP_ID}/${n}.trace.json`,
    );
    expect([SC_RX_TRAM_STOP.shadow.path, ...SC_RX_TRAM_STOP.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});

describe("pinned geometry — the template copies match the committed map", () => {
  it("rx-tram-stop-v1 meta.scenario mirrors the template recipe (crossing + no island + tram hold)", () => {
    const d = district as {
      meta: {
        scenario?: {
          params?: Record<string, unknown>;
          primaryCrossingId?: string;
          laneCenterRightM?: number;
          crossings?: Array<{ id: string; x: number; y: number; kind: string }>;
          tramStop?: {
            hasIsland?: boolean;
            shelterId?: string;
            tramLaneCenterM?: number;
            tramHoldY?: number;
          };
        };
      };
      roads: { edges: Array<{ length: number }> };
      buildings?: Array<{ id: string; height: number }>;
    };
    const scenario = d.meta.scenario!;
    expect(scenario.params).toEqual(SC_RX_TRAM_STOP.map.params);
    expect(scenario.primaryCrossingId).toBe("rts-x-1");
    expect(scenario.laneCenterRightM).toBe(4.06);
    expect(scenario.crossings?.[0]).toEqual({ id: "rts-x-1", x: 0, y: 90, kind: "marked" });
    // The staged encounter pins: passenger crossing + halted-tram hold pose.
    const ped = SC_RX_TRAM_STOP.staged![0];
    expect(ped.kind).toBe("pedestrianDartOut");
    if (ped.kind !== "pedestrianDartOut") return;
    expect(ped.crossingId).toBe(scenario.primaryCrossingId);
    expect(ped.crossing).toEqual({ x: 0, y: 90 });
    // Hold offset on the end→start path: lengthM − tramHoldY = 150 − 97 = 53.
    const holdOffset = d.roads.edges[0].length - scenario.tramStop!.tramHoldY!;
    expect(ped.props?.[0]?.hold.offsetM).toBe(holdOffset);
    expect(ped.props?.[0]?.profile).toBe("tram");
    // NO island — the whole lane is the spill area (the RX-04 contrast).
    expect(scenario.tramStop!.hasIsland).toBe(false);
    const island = d.buildings?.find((b) => b.id === "rxt-b-island" || b.id === "rts-b-island");
    expect(island).toBeUndefined();
    // The kerb shelter IS present.
    const shelter = d.buildings?.find((b) => b.id === scenario.tramStop!.shelterId);
    expect(shelter).toBeDefined();
  });
});
