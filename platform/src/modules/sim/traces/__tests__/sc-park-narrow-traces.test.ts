/**
 * S2-A trace gates — sc-park-narrow (doc 76 §5/§9): the tight-pocket hard
 * variant of the P0 maneuver (2.5 m bay, both neighbors occupied).
 *
 *  1. SHADOW: the authored STEEP swing (radius 3 + straight finish) replays
 *     through the PRODUCTION stack with ZERO violations — the corridor is
 *     0.2 m tighter per side than P0's, so this is the proof the taught
 *     narrow technique actually clears both neighbors.
 *  2. MISTAKE DEMOS: the P0-style WIDE swing (radius 4.5) grazes the north
 *     neighbor mid-arc (vehicle COLLISION at creep speed — the exact habit
 *     the template exists to break); the no-observation demo's scripted
 *     pedestrian consequence.
 *  3. COMMITTED FILES: content/traces/sc-park-narrow/*.trace.json ARE the
 *     recordings of these scripts, byte-for-byte, with public copies.
 *
 * RE-RECORD (after ANY change to the scripts, recorder, district or rules):
 *
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-park-narrow-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_PARK_NARROW } from "../../lessons/scenario/templates-parking";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { createTracePoint } from "../types";
import { sampleAt } from "../sample";
import {
  recordScParkNarrowDrive,
  type ScParkNarrowTraceName,
} from "../scParkNarrow";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const CONTENT_DIR = path.join(REPO_ROOT, "content", "traces", "sc-park-narrow");
const PUBLIC_DIR = path.join(REPO_ROOT, "platform", "public", "traces", "sc-park-narrow");
const RECORD = process.env.RECORD_TRACES === "1";

const district: unknown = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "lot-narrow-v1.json"), "utf-8"),
);

const NAMES: ScParkNarrowTraceName[] = [
  "shadow-correct",
  "mistake-wide-swing",
  "mistake-no-observation",
];

const drives = new Map<ScParkNarrowTraceName, RecordedDrive>(
  NAMES.map((name) => [name, recordScParkNarrowDrive(district, name)]),
);

function violationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

describe("sc-park-narrow — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations — the steep swing clears BOTH occupied neighbors", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("ends at rest dead-center in the tight pocket (the §5 completion pose)", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    // Target bay lot-bay-3: center (5.03, 0), axis east-west. The template's
    // rubric is TIGHTER than P0 (0.35 m / 7°) — the shadow lands well inside.
    expect(Math.hypot(last.x - 5.03, last.y - 0)).toBeLessThan(0.15);
    const axisDiff = Math.abs(((last.headingDeg - 90) % 180) + 180) % 180;
    expect(Math.min(axisDiff, 180 - axisDiff)).toBeLessThan(3.5);
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

  it("actually reverses into the pocket (gear -1 samples near the bay)", () => {
    const reversing = shadow.trace.samples.filter((s) => s.gear === -1);
    expect(reversing.length).toBeGreaterThan(20);
    expect(reversing.some((s) => Math.hypot(s.x - 5.03, s.y) < 3)).toBe(true);
  });
});

describe("sc-park-narrow — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Широк замах в тясното място“: the P0-style arc clips the neighbor, exact codes", () => {
    const drive = drives.get("mistake-wide-swing")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PARK_NARROW.mistakes[0].codeRefs].sort());
    const collision = drive.ruleEvents.find(
      (e) => e.kind === "violation" && e.code === "COLLISION",
    )!;
    expect(collision.kind === "violation" ? collision.detail : undefined).toBe("vehicle");
    const at = createTracePoint();
    sampleAt(drive.trace, collision.t, at);
    expect(Math.abs(at.speedKmh)).toBeGreaterThan(0.5);
    expect(Math.abs(at.speedKmh)).toBeLessThan(5);
    expect(at.gear).toBe(-1); // clipped mid-swing while reversing
    // …and the clip happens NORTH of the bay centerline: the north neighbor
    // is the car the wide swing eats (the taught geometry).
    expect(at.y).toBeGreaterThan(0);
  });

  it("„Заден ход без наблюдение“: the scripted pedestrian consequence, exact codes", () => {
    const drive = drives.get("mistake-no-observation")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PARK_NARROW.mistakes[1].codeRefs].sort());
    const collision = drive.ruleEvents.find(
      (e) => e.kind === "violation" && e.code === "COLLISION",
    )!;
    expect(collision.kind === "violation" ? collision.detail : undefined).toBe("pedestrian");
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
      expect(parsed!.meta.scenarioId).toBe("sc-park-narrow");
    });
  }

  it("recording is deterministic: a second run serializes identically", () => {
    const again = recordScParkNarrowDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    expect(SC_PARK_NARROW.shadow.path).toBe(
      "content/traces/sc-park-narrow/shadow-correct.trace.json",
    );
    expect(SC_PARK_NARROW.shadow.pending).not.toBe(true);
    const paths = SC_PARK_NARROW.mistakes.map((m) => m.traceRef.path);
    expect(paths).toEqual([
      "content/traces/sc-park-narrow/mistake-wide-swing.trace.json",
      "content/traces/sc-park-narrow/mistake-no-observation.trace.json",
    ]);
    for (const m of SC_PARK_NARROW.mistakes) expect(m.traceRef.pending).not.toBe(true);
  });
});
