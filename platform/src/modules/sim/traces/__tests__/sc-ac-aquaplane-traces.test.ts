/**
 * Aquaplane trace gate — „Аквапланинг" (sc-ac-aquaplane on ac-aqua-v1, the
 * doc 72 AC-07-full standing-water slice), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays in DAY RAIN with ZERO violations and earns
 *      CLEAN_DRIVING — ~70 approach under the 0.85 × 90 = 76.5 rain
 *      envelope, eased to ~55 BEFORE the water (55 < the 65 float speed),
 *      steady transit, WET_DECEL stop at the mark short of the van.
 *   2. MISTAKE DEMOS grade their exact codes — NO new rule code (the
 *      crosswind discipline): the 85 dry-limit habit grades COLLISION +
 *      SPEED_TOO_FAST_FOR_CONDITIONS; the „lawful" 72 float-drift grades
 *      EXACTLY CENTER_LINE_TOUCHED (72 < 76.5 — never a speed code; the
 *      whole point of the demo).
 *   3. DUAL-CHANNEL HONESTY (the 4a law, float edition): the recorder is
 *      kinematic, so the float is AUTHORED — asserted here: the mistakes
 *      cross the waterPatch span [240, 280] UNBRAKED at speed (no on-ice
 *      ramp exists — nothing answers in the water), the drift shape is
 *      pinned against the lane-detector band, and the authored envelopes
 *      derive from the SAME tuning constants the live car obeys
 *      (AQUA_WET_DECEL = SCRIPT_DECEL × WET_GRIP_FACTOR).
 *   4. COMMITTED FILES under content/traces/sc-ac-aquaplane/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public
 *      copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ac-aquaplane-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG } from "../../rules";
import {
  AQUAPLANE_ABOVE_KMH,
  AQUAPLANE_PATCH_GRIP_FACTOR,
  WET_GRIP_FACTOR,
} from "../../vehicle";
import { SC_AC_AQUAPLANE } from "../../lessons/scenario/templates-conditions";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { SCRIPT_DECEL, type RecordedDrive } from "../recorder";
import {
  AQUA_WET_DECEL,
  recordScAcAquaplaneDrive,
  type ScAcAquaplaneTraceName,
} from "../scAcAquaplane";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ac-aquaplane";
const NAMES: ScAcAquaplaneTraceName[] = ["shadow-correct", "mistake-full-speed", "mistake-float-drift"];

/** Drawn lane center of the 1+1 street (half of the 8.125 m lane). */
const LANE_CENTER_X = 8.125 / 2;
/** The waterPatch span of ac-aqua-v1 (battery-pinned against the file). */
const WATER_FROM = 240;
const WATER_TO = 280;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}
/** Longest continuous stretch (s) the trace spends past `predicate` on x. */
function longestSustainSec(d: RecordedDrive, predicate: (x: number) => boolean): number {
  let best = 0;
  let startT: number | null = null;
  for (const s of d.trace.samples) {
    if (predicate(s.x)) {
      startT ??= s.tSec;
      best = Math.max(best, s.tSec - startT);
    } else {
      startT = null;
    }
  }
  return best;
}
/** Samples whose y lies inside [fromY, toY]. */
function samplesIn(d: RecordedDrive, fromY: number, toY: number) {
  return d.trace.samples.filter((s) => s.y >= fromY && s.y <= toY);
}

const district = loadDistrict("ac-aqua-v1");
const drives = new Map<ScAcAquaplaneTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScAcAquaplaneDrive(district, n)]),
);

describe("sc-ac-aquaplane — geometry pins against the committed map", () => {
  it("lane, spawn, length and the waterPatch span match ac-aqua-v1", () => {
    const raw = district as {
      meta: { scenario: { laneCenterRightM: number; params: Record<string, number> } };
      spawnPoints: Array<{ id: string; x: number; y: number }>;
      zones: Array<{
        kind: string;
        fromM: number;
        toM: number;
        patchGripFactor?: number;
        aquaplaneAboveKmh?: number;
      }>;
    };
    expect(raw.meta.scenario.laneCenterRightM).toBe(4.06);
    expect(raw.meta.scenario.params.lengthM).toBe(520);
    expect(raw.meta.scenario.params.maxspeedKmh).toBe(90);
    expect(SC_AC_AQUAPLANE.map.params).toEqual(raw.meta.scenario.params);
    const spawn = raw.spawnPoints.find((s) => s.id === "ac-aqua-spawn-approach")!;
    expect(spawn).toBeTruthy();
    expect(spawn.x).toBe(4.06);
    expect(spawn.y).toBe(15);
    // The span the scripts are authored against — and the tuning constants
    // as the single documented truth (the LANE_X by-value discipline).
    expect(raw.zones).toHaveLength(1);
    const z = raw.zones[0];
    expect(z.kind).toBe("waterPatch");
    expect(z.fromM).toBe(WATER_FROM);
    expect(z.toM).toBe(WATER_TO);
    expect(z.patchGripFactor).toBe(AQUAPLANE_PATCH_GRIP_FACTOR);
    expect(z.aquaplaneAboveKmh).toBe(AQUAPLANE_ABOVE_KMH);
  });

  it("dual-channel honesty: the authored envelopes derive from the live tuning constants", () => {
    expect(AQUA_WET_DECEL).toBe(SCRIPT_DECEL * WET_GRIP_FACTOR);
    // The taught transit speed sits UNDER the float gate; the mistakes above.
    const shadow = drives.get("shadow-correct")!;
    const inWater = samplesIn(shadow, WATER_FROM, WATER_TO);
    expect(inWater.length).toBeGreaterThan(0);
    for (const s of inWater) {
      expect(Math.abs(s.speedKmh)).toBeLessThan(AQUAPLANE_ABOVE_KMH - 5);
      expect(s.brakeOn, `shadow brakes in the water at y=${s.y}`).toBe(false);
    }
    for (const name of ["mistake-full-speed", "mistake-float-drift"] as const) {
      const inSpan = samplesIn(drives.get(name)!, WATER_FROM, WATER_TO);
      expect(inSpan.length).toBeGreaterThan(0);
      for (const s of inSpan) {
        // The float is authored honestly: above the gate, UNBRAKED — in the
        // water no pedal reaches the road.
        expect(Math.abs(s.speedKmh)).toBeGreaterThan(AQUAPLANE_ABOVE_KMH);
        expect(s.brakeOn, `${name} brakes in the water at y=${s.y}`).toBe(false);
      }
    }
  });

  it("float-drift honesty: the drift shape is pinned against the lane-detector band", () => {
    const band = DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM;
    expect(band).toBe(3.25);
    const centerSideX = LANE_CENTER_X - band; // 0.8125

    // Shadow: dead straight — never near the band.
    const shadowXs = drives.get("shadow-correct")!.trace.samples.map((s) => s.x);
    expect(Math.min(...shadowXs)).toBeGreaterThan(3.9);
    expect(Math.max(...shadowXs)).toBeLessThanOrEqual(4.07);

    // The float drift rides the осева past the 3.5 s CENTER_LINE sustain…
    const drift = drives.get("mistake-float-drift")!;
    expect(Math.min(...drift.trace.samples.map((s) => s.x))).toBeLessThan(centerSideX);
    expect(longestSustainSec(drift, (x) => x < centerSideX)).toBeGreaterThan(
      DEFAULT_RULE_CONFIG.centerLineSustainSec,
    );
    // …but stays on its own bank (never fully across — OV-04's story).
    expect(Math.min(...drift.trace.samples.map((s) => s.x))).toBeGreaterThan(0);
    // The full-speed mistake never drifts — its fault is speed + the crash.
    const full = drives.get("mistake-full-speed")!;
    expect(Math.min(...full.trace.samples.map((s) => s.x))).toBeGreaterThan(3.9);
  });
});

describe("sc-ac-aquaplane — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays in day rain with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("slows BEFORE the water, transits steady, and rests at the mark", () => {
    // The approach stays under the rain envelope (0.85 × 90 = 76.5).
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThanOrEqual(71);
    // The pre-water objective zone (y 225 ± 10, cap 58) is passed at ~55.
    const preWater = samplesIn(shadow, 215, 235);
    expect(preWater.length).toBeGreaterThan(0);
    expect(Math.max(...preWater.map((s) => Math.abs(s.speedKmh)))).toBeLessThan(58);
    // Rests at the mark (y = 450 ± 4, ≤ 6 km/h).
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(Math.abs(last.y - 450)).toBeLessThan(1.5);
    expect(Math.abs(last.speedKmh)).toBeLessThan(1);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(5);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ac-aquaplane — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Полет във водата — 85 в дъжда“: exactly COLLISION + SPEED_TOO_FAST_FOR_CONDITIONS", () => {
    const drive = drives.get("mistake-full-speed")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_AQUAPLANE.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_MINOR"); // 85 < the posted 90
    expect(codes).not.toContain("CENTER_LINE_TOUCHED"); // straight-line crash
  });

  it("„«В нормата съм» — 72 върху водата“: exactly CENTER_LINE_TOUCHED — never a speed code", () => {
    const drive = drives.get("mistake-float-drift")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_AQUAPLANE.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS"); // 72 < 76.5 — the demo's point
    expect(codes).not.toContain("COLLISION"); // the drift misses the van; the panic stop rests short
    expect(codes).not.toContain("POOR_LANE_KEEPING"); // one act, one code
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
    const again = recordScAcAquaplaneDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_AC_AQUAPLANE.shadow, ...SC_AC_AQUAPLANE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_AC_AQUAPLANE.shadow.path, ...SC_AC_AQUAPLANE.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
