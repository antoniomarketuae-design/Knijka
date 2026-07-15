/**
 * S2-A trace gates — sc-park-parallel (doc 76 §5/§9, the sc-park-perp-rev
 * mold):
 *
 *  1. SHADOW: the authored correct parallel-park replays through the
 *     PRODUCTION stack (parked-car obstacles armed at collisionMinKmh 0)
 *     with ZERO violations and ends at rest centered in the slot.
 *  2. MISTAKE DEMOS: each grades EXACTLY its template codeRefs — the
 *     far-from-lead setup collapses the slot geometry and the correction
 *     reverse clips the REAR car (vehicle COLLISION at creep speed); the
 *     no-observation demo's scripted pedestrian consequence.
 *  3. COMMITTED FILES: content/traces/sc-park-parallel/*.trace.json ARE the
 *     recordings of these scripts, byte-for-byte, with identical public
 *     copies.
 *
 * RE-RECORD (after ANY change to the scripts, recorder, district or rules):
 *
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-park-parallel-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_PARK_PARALLEL } from "../../lessons/scenario/templates-parking";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { createTracePoint } from "../types";
import { sampleAt } from "../sample";
import {
  recordScParkParallelDrive,
  type ScParkParallelTraceName,
} from "../scParkParallel";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const CONTENT_DIR = path.join(REPO_ROOT, "content", "traces", "sc-park-parallel");
const PUBLIC_DIR = path.join(REPO_ROOT, "platform", "public", "traces", "sc-park-parallel");
const RECORD = process.env.RECORD_TRACES === "1";

const district: unknown = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "lot-par-v1.json"), "utf-8"),
);

const NAMES: ScParkParallelTraceName[] = [
  "shadow-correct",
  "mistake-far-from-lead",
  "mistake-no-observation",
];

const drives = new Map<ScParkParallelTraceName, RecordedDrive>(
  NAMES.map((name) => [name, recordScParkParallelDrive(district, name)]),
);

function violationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

describe("sc-park-parallel — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations, parked-car obstacles armed at 0 km/h threshold", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("ends at rest centered in the parallel slot (the §5 completion pose)", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    // Target bay lot-bay-3: center (6.28, 0), axis north (headingDeg 0).
    expect(Math.hypot(last.x - 6.28, last.y - 0)).toBeLessThan(0.25);
    const axisDiff = Math.abs(((last.headingDeg - 0) % 180) + 180) % 180;
    expect(Math.min(axisDiff, 180 - axisDiff)).toBeLessThan(5);
    expect(Math.abs(last.speedKmh)).toBeLessThan(0.5);
    expect(last.brakeOn).toBe(true);
  });

  it("demonstrates the full observation ritual (mirrors + shoulder before reverse)", () => {
    const kinds = shadow.trace.events.map((e) => e.kind);
    expect(kinds).toContain("glance-left");
    expect(kinds).toContain("glance-right");
    expect(kinds).toContain("glance-rear");
    expect(kinds).toContain("signal-on");
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(5);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("actually reverses into the slot (gear -1 samples near the bay)", () => {
    const reversing = shadow.trace.samples.filter((s) => s.gear === -1);
    expect(reversing.length).toBeGreaterThan(20);
    expect(reversing.some((s) => Math.hypot(s.x - 6.28, s.y) < 3)).toBe(true);
  });
});

describe("sc-park-parallel — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Твърде далеч от предната кола“: the correction clips the rear car, exact codes", () => {
    const drive = drives.get("mistake-far-from-lead")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PARK_PARALLEL.mistakes[0].codeRefs].sort());
    const collision = drive.ruleEvents.find(
      (e) => e.kind === "violation" && e.code === "COLLISION",
    )!;
    expect(collision.kind === "violation" ? collision.detail : undefined).toBe("vehicle");
    const at = createTracePoint();
    sampleAt(drive.trace, collision.t, at);
    expect(Math.abs(at.speedKmh)).toBeGreaterThan(0.5);
    expect(Math.abs(at.speedKmh)).toBeLessThan(5);
    expect(at.gear).toBe(-1); // clipped while reversing — the taught failure
  });

  it("„Заден ход без наблюдение“: the scripted pedestrian consequence, exact codes", () => {
    const drive = drives.get("mistake-no-observation")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PARK_PARALLEL.mistakes[1].codeRefs].sort());
    const collision = drive.ruleEvents.find(
      (e) => e.kind === "violation" && e.code === "COLLISION",
    )!;
    expect(collision.kind === "violation" ? collision.detail : undefined).toBe("pedestrian");
    // And the demo really shows NO observation right before reversing.
    const reverseStart = drive.trace.samples.find((s) => s.gear === -1)!.tSec;
    const glancesNearReverse = drive.trace.events.filter(
      (e) => e.kind.startsWith("glance-") && e.tSec > reverseStart - 10,
    );
    expect(glancesNearReverse).toEqual([]);
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
      expect(parsed!.meta.scenarioId).toBe("sc-park-parallel");
    });
  }

  it("recording is deterministic: a second run serializes identically", () => {
    const again = recordScParkParallelDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    expect(SC_PARK_PARALLEL.shadow.path).toBe(
      "content/traces/sc-park-parallel/shadow-correct.trace.json",
    );
    expect(SC_PARK_PARALLEL.shadow.pending).not.toBe(true);
    const paths = SC_PARK_PARALLEL.mistakes.map((m) => m.traceRef.path);
    expect(paths).toEqual([
      "content/traces/sc-park-parallel/mistake-far-from-lead.trace.json",
      "content/traces/sc-park-parallel/mistake-no-observation.trace.json",
    ]);
    for (const m of SC_PARK_PARALLEL.mistakes) expect(m.traceRef.pending).not.toBe(true);
  });
});
