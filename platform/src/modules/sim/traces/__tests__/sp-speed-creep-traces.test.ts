/**
 * S3 trace gate — „Пълзящо превишаване" (sc-speed-creep on sp-creep2-v1, doc 72
 * SP-01 + SP-03; the founder R3 P5 road — doc 62 #30: 400 m @ 50 → 280 m of
 * zone 30, both caps failable), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns CLEAN_DRIVING — 46 held
 *      on the approach, an early lift, ~27 held through the zone.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs
 *      (SPEEDING_OVER_LIMIT), each against its OWN edge cap (57 on the 50
 *      approach; a 27→37 creep in the 30 zone), and NEVER the dangerous band.
 *      The zone-creep demo must NOT earn the shadow's CLEAN_DRIVING (its
 *      clean prefix is authored under the 250 m streak).
 *   3. COMMITTED FILES under content/traces/sc-speed-creep/ ARE the recordings
 *      of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sp-speed-creep-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SPEED_GLYPH_DIGIT_H_M,
  SPEED_GLYPH_INSET_M,
  SPEED_GLYPH_PITCH_M,
} from "../../world/builders/constants";
import { SC_SPEED_CREEP } from "../../lessons/scenario/templates-sp";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScSpeedCreepDrive,
  SC_SPEED_CREEP_ZONE_GLYPH_LEN_M,
  SC_SPEED_CREEP_ZONE_GLYPH_Y,
  type ScSpeedCreepTraceName,
} from "../scSpeedCreep";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-speed-creep";
// ORDER IS THE TEMPLATE'S ORDER (templates-sp.ts): the zone-30 demo leads
// because the clip pilot renders mistake index 0 and only the zone demo has a
// rendered cap (the painted „30") it can keep in the fault frame.
const NAMES: ScSpeedCreepTraceName[] = ["shadow-correct", "mistake-zone-creep", "mistake-flow-along"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("sp-creep2-v1");
const drives = new Map<ScSpeedCreepTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScSpeedCreepDrive(district, n)]),
);

describe("sc-speed-creep — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("holds both caps — under 50 on the approach, under 30 in the zone — with Bulgarian annotations", () => {
    const approachMax = Math.max(
      ...shadow.trace.samples.filter((s) => s.y < 390).map((s) => Math.abs(s.speedKmh)),
    );
    expect(approachMax).toBeLessThan(50); // never touches the posted 50
    const zoneMax = Math.max(
      ...shadow.trace.samples.filter((s) => s.y > 410).map((s) => Math.abs(s.speedKmh)),
    );
    expect(zoneMax).toBeLessThan(30); // never touches the zone's 30
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(640); // the WHOLE long road, zone included
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-speed-creep — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Пълзене в зоната 30“: exactly SPEEDING_OVER_LIMIT against the LOCAL 30, never dangerous, no CLEAN_DRIVING", () => {
    const drive = drives.get("mistake-zone-creep")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SPEED_CREEP.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    // The demo's creep tops out at ~37 — a fault ONLY against the zone's 30.
    const zoneMax = Math.max(
      ...drive.trace.samples.filter((s) => s.y > 410).map((s) => Math.abs(s.speedKmh)),
    );
    expect(zoneMax).toBeGreaterThan(33); // over the graced 30…
    expect(zoneMax).toBeLessThanOrEqual(40); // …never into the dangerous band
    expect(commendationCodes(drive)).not.toContain("CLEAN_DRIVING");
  });

  it("„Носене с потока по подхода“: exactly SPEEDING_OVER_LIMIT against the 50, never the dangerous band", () => {
    const drive = drives.get("mistake-flow-along")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SPEED_CREEP.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
  });
});

// ---------------------------------------------------------------------------
// Founder R0 — „a car driving forward in a city street, nothing else"
// ---------------------------------------------------------------------------

describe("sc-speed-creep — the zone demo's fault is framed by a painted „30“", () => {
  // The clip window is [fault−8, fault+4] around the ENGINE fault time and the
  // camera is a chase cam, so the only cap a speeding clip can SHOW is one that
  // is under the car at the conviction. sp-creep2-v1 posts no В26-30 face; the
  // painted road numerals are it. This test is the reason the demo exists in
  // its current shape — it fails on any restaging that lets the ❌ drift off
  // the paint.
  const ZONE_FROM_Y = 400; // meta.scenario.transitionY (asserted below)
  const ZONE_TO_Y = 680;

  it("the pinned glyph stations are exactly what markings.ts paints on this map", () => {
    const raw = district as { meta: { scenario: { transitionY: number } } };
    expect(raw.meta.scenario.transitionY).toBe(ZONE_FROM_Y);
    // markings.ts: the zone edge is trimmed 0.8 m at each end, stations start
    // SPEED_GLYPH_INSET_M in and repeat every SPEED_GLYPH_PITCH_M while the
    // glyph still fits (station + length <= lineLen − 2).
    const lineLen = ZONE_TO_Y - ZONE_FROM_Y - 1.6;
    const expected: number[] = [];
    for (let s = SPEED_GLYPH_INSET_M; s + SPEED_GLYPH_DIGIT_H_M <= lineLen - 2; s += SPEED_GLYPH_PITCH_M) {
      expected.push(Number((ZONE_FROM_Y + 0.8 + s).toFixed(1)));
    }
    expect([...SC_SPEED_CREEP_ZONE_GLYPH_Y]).toEqual(expected);
    expect(SC_SPEED_CREEP_ZONE_GLYPH_LEN_M).toBe(SPEED_GLYPH_DIGIT_H_M);
  });

  it("the first SPEEDING_OVER_LIMIT lands ON one of those numerals", () => {
    const drive = drives.get("mistake-zone-creep")!;
    const fault = drive.ruleEvents.find(
      (e) => e.kind === "violation" && e.code === "SPEEDING_OVER_LIMIT",
    )!;
    expect(fault).toBeDefined();
    // Ghost pose at the conviction.
    const pose = drive.trace.samples.reduce((best, s) =>
      Math.abs(s.tSec - fault.t) < Math.abs(best.tSec - fault.t) ? s : best,
    );
    const onGlyph = SC_SPEED_CREEP_ZONE_GLYPH_Y.some(
      (y0) => pose.y >= y0 && pose.y <= y0 + SC_SPEED_CREEP_ZONE_GLYPH_LEN_M,
    );
    expect(onGlyph, `fault at y=${pose.y.toFixed(1)} is off every painted „30“`).toBe(true);
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
    const again = recordScSpeedCreepDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_SPEED_CREEP.shadow, ...SC_SPEED_CREEP.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_SPEED_CREEP.shadow.path, ...SC_SPEED_CREEP.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
