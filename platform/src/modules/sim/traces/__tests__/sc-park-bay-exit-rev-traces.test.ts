/**
 * S1 trace gates — sc-park-bay-exit-rev (doc 76 §5/§9, stages 3+5):
 *
 *  1. SHADOW: the authored correct drive replays through the PRODUCTION stack
 *     (runtime + traffic + scenario director + rules, parked-car obstacles
 *     armed at collisionMinKmh 0) with ZERO violations — out of a bay boxed on
 *     both sides, then a yield to the staged walker on the aisle.
 *  2. MISTAKE DEMOS: each grades EXACTLY its template codeRefs — the blind
 *     reverse's scripted pedestrian, the one-motion swing's scripted aisle car.
 *  3. COMMITTED FILES: content/traces/sc-park-bay-exit-rev/*.trace.json ARE the
 *     recordings of these scripts, byte-for-byte (determinism law), and the
 *     platform/public copies are identical to the content sources.
 *
 * RE-RECORD (run after ANY change to the scripts, the recorder, the district
 * or the rule engine, then commit the JSON):
 *
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-park-bay-exit-rev-traces.test.ts
 *
 * In record mode the test WRITES the copies and still asserts every gate — a
 * dirty recording can never be committed green.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_PARK_BAY_EXIT_REV } from "../../lessons/scenario/templates-parking2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { createTracePoint } from "../types";
import { sampleAt } from "../sample";
import {
  lotObstacleRects,
  recordScParkBayExitRevDrive,
  type ScParkBayExitRevTraceName,
} from "../scParkBayExitRev";
import { obstacleRectsOverlap, type RecordedDrive } from "../recorder";
import { CHASSIS_HALF_EXTENTS } from "../../vehicle";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const CONTENT_DIR = path.join(REPO_ROOT, "content", "traces", "sc-park-bay-exit-rev");
const PUBLIC_DIR = path.join(REPO_ROOT, "platform", "public", "traces", "sc-park-bay-exit-rev");
const RECORD = process.env.RECORD_TRACES === "1";

const district: unknown = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "lot-perp-v1.json"), "utf-8"),
);

const NAMES: ScParkBayExitRevTraceName[] = [
  "shadow-correct",
  "mistake-blind-reverse",
  "mistake-swing-out",
];

const drives = new Map<ScParkBayExitRevTraceName, RecordedDrive>(
  NAMES.map((name) => [name, recordScParkBayExitRevDrive(district, name)]),
);

function violationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

describe("sc-park-bay-exit-rev — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations, parked-car obstacles armed at 0 km/h threshold", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("STARTS at rest inside lot-bay-3, nose-in on the bay axis (the P0's finish)", () => {
    const first = shadow.trace.samples[0];
    expect(Math.hypot(first.x - 5.03, first.y - 0)).toBeLessThan(0.25);
    // Nose EAST (heading 90) — parked forward-in, which is what makes the exit
    // a reverse. Folded to the bay's 180° axis like the P0's completion assert.
    const axisDiff = Math.abs(((first.headingDeg - 90) % 180) + 180) % 180;
    expect(Math.min(axisDiff, 180 - axisDiff)).toBeLessThan(5);
    expect(first.headingDeg).toBeGreaterThan(45);
    expect(first.headingDeg).toBeLessThan(135);
    expect(Math.abs(first.speedKmh)).toBeLessThan(0.5);
    // The template's authored start pose IS this pose (single truth).
    expect(SC_PARK_BAY_EXIT_REV.start.position).toEqual({ x: 5.03, y: 0 });
    expect(SC_PARK_BAY_EXIT_REV.start.headingDeg).toBe(90);
  });

  it("actually reverses OUT of the bay (gear −1 from the bay to the aisle)", () => {
    const reversing = shadow.trace.samples.filter((s) => s.gear === -1);
    expect(reversing.length).toBeGreaterThan(20);
    // Reverse starts in the bay…
    expect(reversing.some((s) => s.x > 4.0)).toBe(true);
    // …and ends on the aisle exit line, nose north.
    const last = reversing[reversing.length - 1];
    expect(Math.hypot(last.x - 1.0, last.y - -3.03)).toBeLessThan(0.4);
    expect(Math.min(Math.abs(last.headingDeg), 360 - Math.abs(last.headingDeg))).toBeLessThan(6);
  });

  it("holds пешеходна скорост through the whole reverse (≤ 5 km/h)", () => {
    for (const s of shadow.trace.samples) {
      if (s.gear === -1) expect(Math.abs(s.speedKmh)).toBeLessThanOrEqual(5);
    }
  });

  it("NEVER touches a neighbour car: the swept hero rect clears every parked rect", () => {
    const rects = lotObstacleRects(district);
    expect(rects.length).toBe(4); // occupancy XX_XX — lot-bay-3 is the free one
    let minSeparated = 0;
    for (const s of shadow.trace.samples) {
      const hero = {
        x: s.x,
        y: s.y,
        headingDeg: s.headingDeg,
        halfWidthM: CHASSIS_HALF_EXTENTS.x,
        halfLengthM: CHASSIS_HALF_EXTENTS.z,
      };
      for (const r of rects) {
        expect(obstacleRectsOverlap(hero, r), `overlap at t=${s.tSec}`).toBe(false);
      }
      minSeparated++;
    }
    expect(minSeparated).toBeGreaterThan(100);
  });

  it("demonstrates the full observation ritual (mirrors + shoulder BEFORE the reverse)", () => {
    const firstReverse = shadow.trace.samples.find((s) => s.gear === -1)!.tSec;
    const before = shadow.trace.events.filter(
      (e) => e.kind.startsWith("glance-") && e.tSec <= firstReverse,
    );
    // The чл. 40 duty is discharged BEFORE the gear, not during it.
    expect(before.map((e) => e.kind)).toEqual(
      expect.arrayContaining(["glance-left", "glance-right", "glance-rear"]),
    );
    // And the maneuver keeps looking: rear glances after the reverse begins.
    const during = shadow.trace.events.filter(
      (e) => e.kind === "glance-rear" && e.tSec > firstReverse,
    );
    expect(during.length).toBeGreaterThanOrEqual(2);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(6);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("pauses TWICE mid-arc and once for the walker (the two-stop discipline)", () => {
    // Standstill spans while in reverse gear = the authored mid-maneuver stops.
    let stops = 0;
    let wasStopped = true;
    for (const s of shadow.trace.samples) {
      const stopped = Math.abs(s.speedKmh) < 0.05;
      if (stopped && !wasStopped && s.gear === -1) stops++;
      wasStopped = stopped;
    }
    expect(stops).toBeGreaterThanOrEqual(2);
  });

  it("yields to the staged walker: the encounter resolves without contact", () => {
    const outcome = shadow.outcomes.find((o) => o.eventId === "pbe-aisle-walker");
    expect(outcome, "the staged walker must actually fire on the drive-away leg").toBeDefined();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
  });

  it("finishes past the aisle checkpoint, on the drive-away line", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(20);
    expect(Math.abs(last.x - 1.0)).toBeLessThan(0.3);
    expect(Math.abs(last.speedKmh)).toBeLessThan(0.5);
    expect(last.brakeOn).toBe(true);
  });
});

describe("sc-park-bay-exit-rev — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Заден ход без оглед“: the scripted pedestrian consequence, exact codes", () => {
    const drive = drives.get("mistake-blind-reverse")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PARK_BAY_EXIT_REV.mistakes[0].codeRefs].sort());
    const collision = drive.ruleEvents.find(
      (e) => e.kind === "violation" && e.code === "COLLISION",
    )!;
    expect(collision.kind === "violation" ? collision.detail : undefined).toBe("pedestrian");
    const at = createTracePoint();
    sampleAt(drive.trace, collision.t, at);
    expect(at.gear).toBe(-1); // struck while reversing — the taught failure
    // And the demo really shows NO observation: the reverse begins blind.
    expect(drive.trace.events.filter((e) => e.kind.startsWith("glance-"))).toEqual([]);
  });

  it("„Изнасяне със замах“: the scripted aisle-car contact, exact codes", () => {
    const drive = drives.get("mistake-swing-out")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PARK_BAY_EXIT_REV.mistakes[1].codeRefs].sort());
    const collision = drive.ruleEvents.find(
      (e) => e.kind === "violation" && e.code === "COLLISION",
    )!;
    expect(collision.kind === "violation" ? collision.detail : undefined).toBe("vehicle");
    const at = createTracePoint();
    sampleAt(drive.trace, collision.t, at);
    expect(at.gear).toBe(-1);
    // The whole point: ONE motion — not one standstill between the gear going
    // in and the contact (the shadow stops twice over the same arc).
    const midManeuver = drive.trace.samples.filter(
      (s) => s.gear === -1 && s.tSec > 0.5 && s.tSec < collision.t,
    );
    expect(midManeuver.length).toBeGreaterThan(20);
    expect(midManeuver.every((s) => Math.abs(s.speedKmh) > 0.05)).toBe(true);
    expect(drive.trace.events.filter((e) => e.kind.startsWith("glance-"))).toEqual([]);
  });

  it("neither demo clips a parked neighbour: the arc itself is the shadow's", () => {
    // The taught difference is the missing checks, NOT a wilder path — so no
    // geometric contact may sneak into either demo's code set.
    const rects = lotObstacleRects(district);
    for (const name of ["mistake-blind-reverse", "mistake-swing-out"] as const) {
      for (const s of drives.get(name)!.trace.samples) {
        const hero = {
          x: s.x,
          y: s.y,
          headingDeg: s.headingDeg,
          halfWidthM: CHASSIS_HALF_EXTENTS.x,
          halfLengthM: CHASSIS_HALF_EXTENTS.z,
        };
        for (const r of rects) expect(obstacleRectsOverlap(hero, r), `${name} @ ${s.tSec}`).toBe(false);
      }
    }
  });
});

describe("committed trace files — the determinism law", () => {
  for (const name of NAMES) {
    const contentFile = path.join(CONTENT_DIR, `${name}.trace.json`);
    const publicFile = path.join(PUBLIC_DIR, `${name}.trace.json`);

    it(`${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
      const serialized = serializeScenarioTrace(drives.get(name)!.trace) + "\n";
      if (RECORD) {
        mkdirSync(CONTENT_DIR, { recursive: true });
        mkdirSync(PUBLIC_DIR, { recursive: true });
        writeFileSync(contentFile, serialized);
        writeFileSync(publicFile, serialized);
      }
      expect(existsSync(contentFile), `${contentFile} missing — run the RECORD_TRACES tool`).toBe(true);
      expect(existsSync(publicFile), `${publicFile} missing — run the RECORD_TRACES tool`).toBe(true);
      expect(readFileSync(contentFile, "utf-8")).toBe(serialized);
      expect(readFileSync(publicFile, "utf-8")).toBe(readFileSync(contentFile, "utf-8"));
      const parsed = parseScenarioTrace(JSON.parse(readFileSync(contentFile, "utf-8")));
      expect(parsed).not.toBeNull();
      expect(parsed!.meta.scenarioId).toBe("sc-park-bay-exit-rev");
    });
  }

  it("recording is deterministic: a second run serializes identically", () => {
    const again = recordScParkBayExitRevDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    expect(SC_PARK_BAY_EXIT_REV.shadow.path).toBe(
      "content/traces/sc-park-bay-exit-rev/shadow-correct.trace.json",
    );
    expect(SC_PARK_BAY_EXIT_REV.shadow.pending).not.toBe(true);
    const paths = SC_PARK_BAY_EXIT_REV.mistakes.map((m) => m.traceRef.path);
    expect(paths).toEqual([
      "content/traces/sc-park-bay-exit-rev/mistake-blind-reverse.trace.json",
      "content/traces/sc-park-bay-exit-rev/mistake-swing-out.trace.json",
    ]);
    for (const m of SC_PARK_BAY_EXIT_REV.mistakes) expect(m.traceRef.pending).not.toBe(true);
  });
});
