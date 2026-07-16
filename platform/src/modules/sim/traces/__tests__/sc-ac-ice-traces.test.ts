/**
 * Ice trace gate — „Лед по моста" (sc-ac-ice on ac-ice-v1, the doc 72 AC-08
 * ice band), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays on the DAY-DRY cold morning with ZERO violations and
 *      earns CLEAN_DRIVING — ~40 approach, crawls to ~25 BEFORE the icy
 *      span, feather-light ICE_DECEL stop at the mark ON the ice, short of
 *      the stalled car.
 *   2. MISTAKE DEMOS grade their exact codes — NO new rule code: the legal
 *      50 with the brake pressed ON the ice slides into the stalled car →
 *      EXACTLY COLLISION (never a speed code — dry day, posted limit); the
 *      panic yank glides wide along the curb side → EXACTLY
 *      POOR_LANE_KEEPING (a near-miss of the car by ~1.9 m, never a
 *      contact).
 *   3. DUAL-CHANNEL HONESTY (the 4a law, ice edition): the recorder is
 *      kinematic, so the ice truth is AUTHORED — asserted here: every
 *      on-ice ramp derives from ICE_DECEL = SCRIPT_DECEL ×
 *      ICE_PATCH_GRIP_FACTOR (the same 0.15 scaling the live car obeys on
 *      the span), the brake-on-ice slide still carries ~40 km/h into the
 *      car, and the swerve shape is pinned against the lane-detector band.
 *   4. COMMITTED FILES under content/traces/sc-ac-ice/ ARE the recordings
 *      of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ac-ice-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG } from "../../rules";
import { ICE_PATCH_GRIP_FACTOR } from "../../vehicle";
import { SC_AC_ICE } from "../../lessons/scenario/templates-conditions";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { SCRIPT_DECEL, type RecordedDrive } from "../recorder";
import { ICE_DECEL, recordScAcIceDrive, type ScAcIceTraceName } from "../scAcIce";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ac-ice";
const NAMES: ScAcIceTraceName[] = ["shadow-correct", "mistake-brake-on-ice", "mistake-harsh-steer"];

/** Drawn lane center of the 1+1 street (half of the 8.125 m lane). */
const LANE_CENTER_X = 8.125 / 2;
/** The icePatch span of ac-ice-v1 (battery-pinned against the file). */
const ICE_FROM = 210;
const ICE_TO = 300;

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

const district = loadDistrict("ac-ice-v1");
const drives = new Map<ScAcIceTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScAcIceDrive(district, n)]),
);

describe("sc-ac-ice — geometry pins against the committed map", () => {
  it("lane, spawn, length and the icePatch span match ac-ice-v1", () => {
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
    expect(raw.meta.scenario.params.lengthM).toBe(360);
    expect(raw.meta.scenario.params.maxspeedKmh).toBe(50);
    expect(SC_AC_ICE.map.params).toEqual(raw.meta.scenario.params);
    const spawn = raw.spawnPoints.find((s) => s.id === "ac-ice-spawn-approach")!;
    expect(spawn).toBeTruthy();
    expect(spawn.x).toBe(4.06);
    expect(spawn.y).toBe(15);
    // The span the scripts are authored against — the tuning constant is the
    // single documented truth; ice carries NO float gate (any speed bites).
    expect(raw.zones).toHaveLength(1);
    const z = raw.zones[0];
    expect(z.kind).toBe("icePatch");
    expect(z.fromM).toBe(ICE_FROM);
    expect(z.toM).toBe(ICE_TO);
    expect(z.patchGripFactor).toBe(ICE_PATCH_GRIP_FACTOR);
    expect(z.aquaplaneAboveKmh).toBeUndefined();
  });

  it("dual-channel honesty: the on-ice envelopes derive from the live tuning constant", () => {
    expect(ICE_DECEL).toBe(SCRIPT_DECEL * ICE_PATCH_GRIP_FACTOR);
    // The shadow's crawl is established BEFORE the span (dry tarmac).
    const shadow = drives.get("shadow-correct")!;
    const preIce = shadow.trace.samples.filter((s) => s.y >= 195 && s.y < ICE_FROM);
    expect(preIce.length).toBeGreaterThan(0);
    expect(Math.max(...preIce.map((s) => Math.abs(s.speedKmh)))).toBeLessThan(27);
    // The brake-on-ice slide: the held brake sheds barely ~10 km/h — the
    // authored 0.69 m/s² envelope carries ~40 km/h into the stalled car.
    const slide = drives.get("mistake-brake-on-ice")!;
    const nearCar = slide.trace.samples.filter((s) => s.y >= 280 && s.y <= 286);
    expect(nearCar.length).toBeGreaterThan(0);
    expect(Math.min(...nearCar.map((s) => Math.abs(s.speedKmh)))).toBeGreaterThan(35);
    const onIceBraking = slide.trace.samples.filter(
      (s) => s.y >= 240 && s.y <= 280 && s.brakeOn,
    );
    expect(onIceBraking.length).toBeGreaterThan(0); // the pedal IS held — it just does ~nothing
  });

  it("harsh-steer honesty: the slide shape is pinned against the lane-detector band and the car rect", () => {
    const band = DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM;
    expect(band).toBe(3.25);
    const curbSideX = LANE_CENTER_X + band; // 7.3125

    // Shadow: dead straight, never near the band.
    const shadowXs = drives.get("shadow-correct")!.trace.samples.map((s) => s.x);
    expect(Math.min(...shadowXs)).toBeGreaterThan(3.9);
    expect(Math.max(...shadowXs)).toBeLessThanOrEqual(4.07);

    // The swerve wobbles the curb side past the 3 s POOR_LANE_KEEPING sustain…
    const swerve = drives.get("mistake-harsh-steer")!;
    expect(Math.max(...swerve.trace.samples.map((s) => s.x))).toBeGreaterThan(curbSideX);
    expect(longestSustainSec(swerve, (x) => x > curbSideX)).toBeGreaterThan(
      DEFAULT_RULE_CONFIG.laneKeepSustainSec,
    );
    // …and passes the stalled car (x ≤ 4.96) with real clearance, no contact:
    // hero left edge ≥ 7.7 − 0.85 = 6.85 alongside the car rows.
    const alongsideCar = swerve.trace.samples.filter((s) => s.y >= 284 && s.y <= 296);
    expect(alongsideCar.length).toBeGreaterThan(0);
    expect(Math.min(...alongsideCar.map((s) => s.x))).toBeGreaterThan(6.5);
  });
});

describe("sc-ac-ice — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays on the dry cold morning with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("crawls before the bridge and rests at the mark on the ice", () => {
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThanOrEqual(41); // approach 40, crawl 25
    // The pre-bridge objective zone (y 190 ± 10, cap 30) is passed at ~25.
    const zone = shadow.trace.samples.filter((s) => s.y >= 180 && s.y <= 200);
    expect(zone.length).toBeGreaterThan(0);
    expect(Math.max(...zone.map((s) => Math.abs(s.speedKmh)))).toBeLessThan(30);
    // Rests at the mark (y = 280 ± 4, ≤ 6 km/h) — ON the icy span.
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(Math.abs(last.y - 280)).toBeLessThan(1.5);
    expect(Math.abs(last.speedKmh)).toBeLessThan(1);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(5);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ac-ice — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Спирачка върху леда“: exactly COLLISION — never a speed code (dry day, posted limit)", () => {
    const drive = drives.get("mistake-brake-on-ice")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_ICE.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_MINOR"); // 50 = the posted limit
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS"); // DRY arms no envelope
    expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE"); // 0.69 m/s² is anything but harsh
  });

  it("„Рязък волан върху леда“: exactly POOR_LANE_KEEPING — a near-miss, never a contact", () => {
    const drive = drives.get("mistake-harsh-steer")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_ICE.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("COLLISION"); // squeezes past by ~1.9 m
    expect(codes).not.toContain("CENTER_LINE_TOUCHED"); // the slide goes curb-side
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
    const again = recordScAcIceDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_AC_ICE.shadow, ...SC_AC_ICE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_AC_ICE.shadow.path, ...SC_AC_ICE.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
