/**
 * S trace gate — „Покрай прясна катастрофа" (sc-hz-accident-scene on
 * hz-accident-v1, doc 72 VP-12), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations — sheds speed BEFORE the scene, arcs
 *      the WIDE line (x = 1.8) around the wreck and the bystander, NEVER stops in
 *      the В27 span, lets the arriving rig pass (YIELDED_TO_PRIORITY, a
 *      commendation, not a violation) and resumes past the span.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs:
 *      - the gawk-stop rests dead in the lane inside the В27 span → the single
 *        ILLEGAL_STOP_IN_BAN_ZONE, with no queue/control on this street to
 *        acquit it;
 *      - the tight-and-fast squeeze holds the lane (no POOR_LANE_KEEPING) under
 *        the limit (no SPEEDING) straight into the wreck rects → the single
 *        COLLISION.
 *   3. STRUCTURAL: no PEDESTRIAN_* code can fire in ANY drive — hz-accident-v1
 *      carries `crossings: []`, so the bystander's synthetic crossingId never
 *      arms the crossing chain; and the arriving rig NEVER bills
 *      EMERGENCY_NOT_YIELDED (it passes before the arm-window expires, every
 *      drive).
 *   4. COMMITTED FILES under content/traces/sc-hz-accident-scene/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-hz-accident-scene-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_HZ_ACCIDENT_SCENE } from "../../lessons/scenario/templates-hazards2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScHzAccidentSceneDrive, type ScHzAccidentSceneTraceName } from "../scHzAccidentScene";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-hz-accident-scene";
const NAMES: ScHzAccidentSceneTraceName[] = ["shadow-correct", "mistake-gawk-stop", "mistake-squeeze"];
/** Northbound right-lane center of hz-accident-v1. */
const LANE_X = 4.06;
/** The wide-pass line the shadow arcs onto (templates-hazards2 ACC_WIDE_X). */
const WIDE_X = 1.8;
/** The В27 no-stopping span [fromM, toM] (gen_hz_accident). */
const BAN_FROM_Y = 120;
const BAN_TO_Y = 195;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

const district = loadDistrict("hz-accident-v1");
const drives = new Map<ScHzAccidentSceneTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScHzAccidentSceneDrive(district, n)]),
);

describe("sc-hz-accident-scene — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations — the drive-past never bills a phantom", () => {
    expect(violationCodes(shadow)).toEqual([]);
    // The three phantoms this drill's story invites: a gawk that never happened,
    // a lane-keep episode from the wide arc, and a causeless-harsh-brake from the
    // early shed. NONE of them fire.
    expect(violationCodes(shadow)).not.toContain("ILLEGAL_STOP_IN_BAN_ZONE");
    expect(violationCodes(shadow)).not.toContain("POOR_LANE_KEEPING");
    expect(violationCodes(shadow)).not.toContain("HARSH_BRAKING_NO_CAUSE");
  });

  it("arcs WIDE of the wreck and stays in its own lane (no crown crossing)", () => {
    const xs = shadow.trace.samples.map((s) => s.x);
    // Reached the wide line…
    expect(Math.min(...xs)).toBeLessThanOrEqual(WIDE_X + 0.05);
    // …but never crossed the centre line (x > 0 throughout — the arc is a
    // curb-half excursion, not a straddle of oncoming), and never drifted past
    // the driving line to the curb side either.
    for (const s of shadow.trace.samples) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(LANE_X + 0.1);
    }
  });

  it("never rests inside the В27 span, and finishes beyond it", () => {
    // No near-stop may fall INSIDE the ban span [120, 195] — a rest there would
    // be the gawk it must not do. (The car legitimately starts at rest at the
    // spawn, y = 15, and ends at rest at the finish, y = 235 — both outside.)
    for (const s of shadow.trace.samples) {
      if (Math.abs(s.speedKmh) < 1) {
        expect(s.y < BAN_FROM_Y || s.y > BAN_TO_Y, `rest inside span at y=${s.y.toFixed(1)}`).toBe(true);
      }
    }
    expect(shadow.trace.samples[shadow.trace.samples.length - 1].y).toBeGreaterThan(232);
  });

  it("makes way for the arriving rig (yielded, not blocked), and clears the bystander", () => {
    const rig = shadow.outcomes.find((o) => o.eventId === "sc-hzac-rig");
    expect(rig?.success).toBe(true);
    expect(rig?.detail).toBe("yielded");
    // The commendation, not a violation — it must never appear in the sheet's
    // violation column.
    expect(violationCodes(shadow)).not.toContain("EMERGENCY_NOT_YIELDED");
    const bystander = shadow.outcomes.find((o) => o.eventId === "sc-hzac-bystander");
    expect(bystander?.success).toBe(true);
    expect(bystander?.detail).not.toBe("collision");
  });

  it("carries its Bulgarian annotation track", () => {
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-hz-accident-scene — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Зяпане със спиране в лентата“: exactly ILLEGAL_STOP_IN_BAN_ZONE", () => {
    const drive = drives.get("mistake-gawk-stop")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_HZ_ACCIDENT_SCENE.mistakes[0].codeRefs].sort());
    // The fault is the STOP, not the line or a crash: wheel on the driving line,
    // nothing struck.
    expect(codes).not.toContain("POOR_LANE_KEEPING");
    expect(codes).not.toContain("COLLISION");
    expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
    // …and the car really came to rest INSIDE the В27 span (the only place the
    // code can fire).
    const rest = drive.trace.samples.find((s) => Math.abs(s.speedKmh) < 1 && s.y > 100);
    expect(rest, "the gawk demo never came to rest").toBeDefined();
    expect(rest!.y).toBeGreaterThan(BAN_FROM_Y);
    expect(rest!.y).toBeLessThan(BAN_TO_Y);
  });

  it("„Минаване плътно и бързо“: exactly COLLISION", () => {
    const drive = drives.get("mistake-squeeze")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_HZ_ACCIDENT_SCENE.mistakes[1].codeRefs].sort());
    // The squeeze holds its own lane (offset +1.44 < 3.25) and stays under the
    // 50 limit — so neither POOR_LANE_KEEPING nor SPEEDING joins the COLLISION.
    expect(codes).not.toContain("POOR_LANE_KEEPING");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("ILLEGAL_STOP_IN_BAN_ZONE");
    // It threaded the tight line, never the crown.
    expect(Math.max(...drive.trace.samples.map((s) => s.x))).toBeGreaterThan(5.3);
    for (const s of drive.trace.samples) expect(s.x).toBeGreaterThan(0);
  });
});

describe("sc-hz-accident-scene — the structural claim: no crossing, no PEDESTRIAN_* code", () => {
  it("no drive can bill a crossing code (hz-accident-v1 has crossings: [])", () => {
    // The map choice is the same as the two siblings: the CrossingZoneTracker
    // builds its zones from district crossings[] alone, so the staged bystander
    // grades braking/contact — never a zebra duty. If a crossing ever appeared,
    // PEDESTRIAN_* would start firing on the squeeze demo and the codeRef would
    // silently rot.
    for (const name of NAMES) {
      const codes = violationCodes(drives.get(name)!);
      expect(codes.filter((c) => c.startsWith("PEDESTRIAN_")), name).toEqual([]);
      // …and the ambulance never convicts in any drive (it passes clean).
      expect(codes, name).not.toContain("EMERGENCY_NOT_YIELDED");
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
    const again = recordScHzAccidentSceneDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_HZ_ACCIDENT_SCENE.shadow, ...SC_HZ_ACCIDENT_SCENE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_HZ_ACCIDENT_SCENE.shadow.path,
      ...SC_HZ_ACCIDENT_SCENE.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
