/**
 * Trace gates — the RAIL-PACK ACTOR SLICE (ADR-006 stage 3b; doc 76 §5/§9,
 * stages 3+5): sc-rx-tram-left on sx-v1 (honest map reuse — the shipped
 * signalized X junction) and sc-rx-tram-island on rx-tram-island-v1.
 *
 *  1. SHADOWS replay through the PRODUCTION stack (runtime + traffic +
 *     scenario director + rules) with ZERO violations. The left-turn shadow
 *     additionally earns YIELDED_TO_PRIORITY and resolves the staged TRAM as
 *     "yielded" (the N1 machinery pointed at a rail-bound actor); the island
 *     shadow earns PEDESTRIAN_YIELDED for the passenger crossing to the stop.
 *  2. MISTAKE DEMOS grade EXACTLY their template codeRefs:
 *     - „Рязане пред трамвая" → FAILED_TO_YIELD (detail left-turn-oncoming,
 *       from the runtime's own left-turn tracker — no tram-specific code:
 *       reuse is honest, the teach copy carries the tram lesson);
 *     - „Завой без мигач" → TURN_WITHOUT_INDICATOR (the yield stays correct);
 *     - „Профучаване покрай трамвая" → PEDESTRIAN_NOT_YIELDED;
 *     - „Удар в пътника" → COLLISION.
 *  3. COMMITTED FILES under content/traces/<template>/ ARE the recordings of
 *     these scripts, byte-for-byte, with identical public copies.
 *  4. PINNED GEOMETRY: the island template's copies match the generated map.
 *
 * RE-RECORD (after ANY change to the scripts, the recorder, the districts or
 * the rule engine, then commit the JSON):
 *
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-rx-tram-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_RX_TRAM_ISLAND, SC_RX_TRAM_LEFT } from "../../lessons/scenario/templates-rail";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScRxTramDrive,
  scRxTramTraceNames,
  type ScRxTramTemplateId,
  type ScRxTramTraceName,
} from "../scRxTram";
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

const sxDistrict = loadDistrict("sx-v1");
const islandDistrict = loadDistrict("rx-tram-island-v1");

const left = new Map<ScRxTramTraceName, RecordedDrive>(
  scRxTramTraceNames("sc-rx-tram-left").map((n) => [
    n,
    recordScRxTramDrive(sxDistrict, "sc-rx-tram-left", n),
  ]),
);
const island = new Map<ScRxTramTraceName, RecordedDrive>(
  scRxTramTraceNames("sc-rx-tram-island").map((n) => [
    n,
    recordScRxTramDrive(islandDistrict, "sc-rx-tram-island", n),
  ]),
);

describe("sc-rx-tram-left — the shadow gate (doc 76 §5)", () => {
  const shadow = left.get("shadow-correct")!;

  it("waits the tram out, then turns: ZERO violations + YIELDED_TO_PRIORITY", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("YIELDED_TO_PRIORITY");
  });

  it("resolves the staged TRAM as 'yielded' (the N1 machinery, rail-bound actor)", () => {
    const outcome = shadow.outcomes.find((o) => o.eventId === "sc-rxtl-tram");
    expect(outcome).toBeDefined();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
  });

  it("signals LEFT before the turn and completes it southbound", () => {
    const signalOn = shadow.trace.events.find((e) => e.kind === "signal-on");
    expect(signalOn?.detail).toBe("left");
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeLessThan(-50);
    expect(Math.abs(last.x + 4.06)).toBeLessThan(1.5);
    expect(Math.abs(last.speedKmh)).toBeLessThan(0.5);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-rx-tram-left — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Рязане пред трамвая“: exactly FAILED_TO_YIELD, from the oncoming tracker", () => {
    const drive = left.get("mistake-cut-tram")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_RX_TRAM_LEFT.mistakes[0].codeRefs].sort());
    const failed = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD")!;
    expect(failed.kind === "violation" ? failed.detail : undefined).toBe("left-turn-oncoming");
    // The tram actor records the conflict (no tram-specific code — the N1
    // adjudicator grades the cut exactly as it grades a car; reuse is honest).
    expect(drive.outcomes.find((o) => o.eventId === "sc-rxtl-tram")?.detail).toBe("violation");
  });

  it("„Завой през релсите без мигач“: exactly TURN_WITHOUT_INDICATOR — the yield itself stays correct", () => {
    const drive = left.get("mistake-no-indicator")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_RX_TRAM_LEFT.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("FAILED_TO_YIELD");
    expect(drive.trace.events.find((e) => e.kind === "signal-on")).toBeUndefined();
    expect(commendationCodes(drive)).toContain("YIELDED_TO_PRIORITY");
  });
});

describe("sc-rx-tram-island — the shadow gate (doc 76 §5)", () => {
  const shadow = island.get("shadow-correct")!;

  it("slows at the stop, halts for the crossing passenger: ZERO violations + PEDESTRIAN_YIELDED", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("PEDESTRIAN_YIELDED");
  });

  it("resolves the staged passenger as 'yielded' and clears the stop northbound", () => {
    const outcome = shadow.outcomes.find((o) => o.eventId === "sc-rxti-passenger");
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

describe("sc-rx-tram-island — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Профучаване покрай спрелия трамвай“: exactly PEDESTRIAN_NOT_YIELDED, once", () => {
    const drive = island.get("mistake-squeeze-past")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_RX_TRAM_ISLAND.mistakes[0].codeRefs].sort());
    expect(violationCodes(drive).filter((c) => c === "PEDESTRIAN_NOT_YIELDED")).toHaveLength(1);
    expect(drive.outcomes.find((o) => o.eventId === "sc-rxti-passenger")?.detail).toBe("violation");
  });

  it("„Удар в пресичащия пътник“: exactly COLLISION (pedestrian)", () => {
    const drive = island.get("mistake-collision")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_RX_TRAM_ISLAND.mistakes[1].codeRefs].sort());
    const hit = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "COLLISION")!;
    expect(hit.kind === "violation" ? hit.detail : undefined).toBe("pedestrian");
  });
});

describe("committed trace files — the determinism law", () => {
  const CASES: Array<{
    templateId: ScRxTramTemplateId;
    district: unknown;
    drives: Map<ScRxTramTraceName, RecordedDrive>;
  }> = [
    { templateId: "sc-rx-tram-left", district: sxDistrict, drives: left },
    { templateId: "sc-rx-tram-island", district: islandDistrict, drives: island },
  ];

  for (const { templateId, district, drives } of CASES) {
    const contentDir = path.join(REPO_ROOT, "content", "traces", templateId);
    const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", templateId);

    for (const name of scRxTramTraceNames(templateId)) {
      it(`${templateId}/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
        expect(parsed!.meta.scenarioId).toBe(templateId);
      });
    }

    it(`${templateId}: recording is deterministic (a second run serializes identically)`, () => {
      const name = scRxTramTraceNames(templateId)[0];
      const again = recordScRxTramDrive(district, templateId, name);
      expect(serializeScenarioTrace(again.trace)).toBe(
        serializeScenarioTrace(drives.get(name)!.trace),
      );
    });
  }

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    for (const spec of [SC_RX_TRAM_LEFT, SC_RX_TRAM_ISLAND]) {
      const refs = [spec.shadow, ...spec.mistakes.map((m) => m.traceRef)];
      for (const ref of refs) {
        expect(ref.pending, ref.path).not.toBe(true);
        expect(ref.path.startsWith(`content/traces/${spec.id}/`)).toBe(true);
      }
      const expected = scRxTramTraceNames(spec.id as ScRxTramTemplateId).map(
        (n) => `content/traces/${spec.id}/${n}.trace.json`,
      );
      expect([spec.shadow.path, ...spec.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
    }
  });
});

describe("pinned geometry — the island template copies match the committed map", () => {
  it("rx-tram-island-v1 meta.scenario mirrors the template recipe (crossing + island + tram hold)", () => {
    const d = islandDistrict as {
      meta: {
        scenario?: {
          params?: Record<string, unknown>;
          primaryCrossingId?: string;
          laneCenterRightM?: number;
          crossings?: Array<{ id: string; x: number; y: number; kind: string }>;
          tramStop?: {
            islandId?: string;
            islandFromY?: number;
            islandToY?: number;
            tramLaneCenterM?: number;
            tramHoldY?: number;
          };
        };
      };
      roads: { edges: Array<{ length: number }> };
      buildings?: Array<{ id: string; height: number }>;
    };
    const scenario = d.meta.scenario!;
    expect(scenario.params).toEqual(SC_RX_TRAM_ISLAND.map.params);
    expect(scenario.primaryCrossingId).toBe("rxt-x-1");
    expect(scenario.laneCenterRightM).toBe(4.06);
    expect(scenario.crossings?.[0]).toEqual({ id: "rxt-x-1", x: 0, y: 90, kind: "marked" });
    // The staged encounter pins: passenger crossing + halted-tram hold pose.
    const ped = SC_RX_TRAM_ISLAND.staged![0];
    expect(ped.kind).toBe("pedestrianDartOut");
    if (ped.kind !== "pedestrianDartOut") return;
    expect(ped.crossingId).toBe(scenario.primaryCrossingId);
    expect(ped.crossing).toEqual({ x: 0, y: 90 });
    // Hold offset on the end→start path: lengthM − tramHoldY = 150 − 101 = 49.
    const holdOffset = d.roads.edges[0].length - scenario.tramStop!.tramHoldY!;
    expect(ped.props?.[0]?.hold.offsetM).toBe(holdOffset);
    expect(ped.props?.[0]?.profile).toBe("tram");
    // The island is a LOW platform block, physically present on the map.
    const islandBlock = d.buildings?.find((b) => b.id === scenario.tramStop!.islandId);
    expect(islandBlock).toBeDefined();
    expect(islandBlock!.height).toBeLessThanOrEqual(0.4);
  });
});
