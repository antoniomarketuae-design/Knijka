/**
 * S trace gate — „Екстрено спиране" (sc-hz-emergency-stop on hz-obstacle-v1,
 * doc 72 PE-04), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations — a FULL-FORCE stop (the ghost's
 *      envelope tracks the live car's ≈ 9 m/s² ABS rate) on a dead-straight
 *      wheel, resting 2 m short of the child, and NEVER billing
 *      HARSH_BRAKING_NO_CAUSE (the template's ruleConfig is the whole reason —
 *      see templates-hazards2.ts: on a crossing-less street the engine's cause
 *      ledger cannot see a staged dart, so the taught behaviour would otherwise
 *      grade as „рязко спиране без причина").
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs, and the SWERVE demo
 *      is honest about its geometry: the yank MISSES the child (a 1.5 m contact
 *      radius cannot reach the gutter line) — the COLLISION it bills is the
 *      parked car the swerve found instead. That is the card's claim.
 *   3. STRUCTURAL: no PEDESTRIAN_* code can fire in ANY drive — hz-obstacle-v1
 *      carries `crossings: []`, so the crossing chain is unreachable by design.
 *   4. COMMITTED FILES under content/traces/sc-hz-emergency-stop/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-hz-emergency-stop-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PEDESTRIAN_BODY_RADIUS_M, PLAYER_HALF_LENGTH_M } from "../../collision";
import { SC_HZ_EMERGENCY_STOP } from "../../lessons/scenario/templates-hazards2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScHzEmergencyStopDrive, type ScHzEmergencyStopTraceName } from "../scHzEmergencyStop";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-hz-emergency-stop";
const NAMES: ScHzEmergencyStopTraceName[] = ["shadow-correct", "mistake-late-reaction", "mistake-swerve"];
/** The child's line (templates-hazards2 DART_Y) — pinned by value. */
const DART_Y = 150;
/** Northbound right-lane center of hz-obstacle-v1. */
const LANE_X = 4.06;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
/** Peak deceleration of the drive, m/s² (positive), from the 20 Hz samples. */
function peakDecelMps2(d: RecordedDrive): number {
  const s = d.trace.samples;
  let peak = 0;
  for (let i = 1; i < s.length; i++) {
    const dt = s[i].tSec - s[i - 1].tSec;
    if (dt <= 0) continue;
    const dv = (s[i].speedKmh - s[i - 1].speedKmh) / 3.6;
    peak = Math.max(peak, -dv / dt);
  }
  return peak;
}

const district = loadDistrict("hz-obstacle-v1");
const drives = new Map<ScHzEmergencyStopTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScHzEmergencyStopDrive(district, n)]),
);

describe("sc-hz-emergency-stop — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations — the full-force stop is never billed as causeless", () => {
    expect(violationCodes(shadow)).toEqual([]);
    // The named FP this template's ruleConfig exists to prevent: without the
    // override the ghost's ~9 m/s² stop clears harshBrakeDecelMps2 (7) with
    // noBrakeCause TRUE for the whole drill (no crossings ⇒ no hazard ledger,
    // no lead vehicle, no stop line, no junction on hz-obstacle-v1).
    expect(violationCodes(shadow)).not.toContain("HARSH_BRAKING_NO_CAUSE");
  });

  it("actually brakes FULL FORCE — not a comfortable C1 stop", () => {
    // The recorder's default SCRIPT_DECEL envelope is 0.7 × 4.6 = 3.22 m/s²;
    // this ghost is authored at 0.7 × 12.9 ≈ 9.03, the live car's own full-pedal
    // rate (BRAKE_FORCE_N / CHASSIS_MASS = 11000 / 1220). If this ever drops
    // below 8 the demo has quietly become a lesson about lifting off.
    expect(peakDecelMps2(shadow)).toBeGreaterThan(8);
  });

  it("keeps the wheel dead straight and rests SHORT of the child", () => {
    const samples = shadow.trace.samples;
    // Straight wheel: never leaves the driving line (the whole „не заобикаляй"
    // claim of the card is this assertion).
    for (const s of samples) expect(s.x).toBeCloseTo(LANE_X, 6);
    // Came to a full rest before her line, then drove on to the end.
    const rest = samples.find((s) => Math.abs(s.speedKmh) < 1 && s.y > 100);
    expect(rest, "the shadow never came to rest").toBeDefined();
    // SHORT OF HER BODY, not short of her coordinate. The sample is the hero's
    // CENTRE and the car is 4.04 m long, so the assertion has to carry the
    // front overhang — the exact mistake the drive script itself used to make
    // (it rested at y = 148, i.e. bumper 2 cm PAST a child at y = 150, and the
    // 1.5 m contact circle in force at the time reported that as clear).
    const noseY = rest!.y + PLAYER_HALF_LENGTH_M;
    expect(noseY).toBeLessThan(DART_Y - PEDESTRIAN_BODY_RADIUS_M);
    expect(DART_Y - PEDESTRIAN_BODY_RADIUS_M - noseY).toBeGreaterThan(1.5); // real air
    expect(DART_Y - PEDESTRIAN_BODY_RADIUS_M - noseY).toBeLessThan(3); // …and still a STOP
    expect(samples[samples.length - 1].y).toBeGreaterThan(220);
  });

  it("resolves the staged child as YIELDED, from a real approach speed", () => {
    const outcome = shadow.outcomes.find((o) => o.eventId === "sc-hzes-child");
    expect(outcome).toBeDefined();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
    // The drill is worthless from a crawl: the dart armed at the posted speed.
    expect(outcome!.approachSpeedKmh).toBeGreaterThan(45);
  });

  it("carries its Bulgarian annotation track", () => {
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-hz-emergency-stop — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Късна реакция“: exactly COLLISION — and it is the CHILD that is struck", () => {
    const drive = drives.get("mistake-late-reaction")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_HZ_EMERGENCY_STOP.mistakes[0].codeRefs].sort());
    // The fault is the TIMING, not the line or the speed: same lawful 50, same
    // driving line as the shadow — only the foot is late.
    expect(codes).not.toContain("POOR_LANE_KEEPING");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    for (const s of drive.trace.samples) expect(s.x).toBeCloseTo(LANE_X, 6);
    const outcome = drive.outcomes.find((o) => o.eventId === "sc-hzes-child");
    expect(outcome?.success).toBe(false);
    expect(outcome?.detail).toBe("collision");
  });

  it("„Отклонение от лентата“: exactly POOR_LANE_KEEPING + COLLISION", () => {
    const drive = drives.get("mistake-swerve")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_HZ_EMERGENCY_STOP.mistakes[1].codeRefs].sort());
    // The excursion is to the CURB side: away from the centre line, so the
    // generic lane-keep episode bills and CENTER_LINE_TOUCHED stays disarmed
    // (its arm needs a POSITIVE offset toward oncoming).
    expect(codes).not.toContain("CENTER_LINE_TOUCHED");
    expect(codes).not.toContain("WRONG_WAY");
    expect(Math.max(...drive.trace.samples.map((s) => s.x))).toBeGreaterThan(7.31);
    // Never crosses into the oncoming bank.
    for (const s of drive.trace.samples) expect(s.x).toBeGreaterThan(0);
  });

  it("the swerve demo is HONEST: the yank misses the child — the parked car is what it hits", () => {
    // The card says exactly this, and the geometry forces it: the runner's
    // contact radius is 1.5 m and the child is at x ≈ 3.9 when the car reaches
    // her line at x = 7.8. A dart-out COLLISION would mean the demo drifted off
    // its own claim, so the staged child must resolve NO collision here.
    const drive = drives.get("mistake-swerve")!;
    const outcome = drive.outcomes.find((o) => o.eventId === "sc-hzes-child");
    expect(outcome?.detail).not.toBe("collision");
    // …and the COLLISION it does bill is real, not authored: the obstacle rect
    // sits at (7.2, 185) and only a car on the gutter line can reach it.
    expect(violationCodes(drive)).toContain("COLLISION");
    const hit = drive.trace.samples.find((s) => s.y > 180);
    expect(hit, "the swerve never reached the parked car").toBeDefined();
  });
});

describe("sc-hz-emergency-stop — the structural claim: no crossing, no PEDESTRIAN_* code", () => {
  it("no drive can bill a crossing code (hz-obstacle-v1 has crossings: [])", () => {
    // The map choice IS the lesson (templates-hazards2 header): the
    // CrossingZoneTracker builds its zones from district crossings[] alone, so
    // this drill grades braking — never a zebra duty. If a crossing ever
    // appeared on this map, PEDESTRIAN_CROSSING_TOO_FAST would start firing on
    // the mistake demos and both codeRefs above would silently rot.
    for (const name of NAMES) {
      const codes = violationCodes(drives.get(name)!);
      expect(codes.filter((c) => c.startsWith("PEDESTRIAN_")), name).toEqual([]);
    }
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
    const again = recordScHzEmergencyStopDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_HZ_EMERGENCY_STOP.shadow, ...SC_HZ_EMERGENCY_STOP.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_HZ_EMERGENCY_STOP.shadow.path,
      ...SC_HZ_EMERGENCY_STOP.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
