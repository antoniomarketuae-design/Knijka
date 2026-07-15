/**
 * S2-A trace gates — sc-park-45 (doc 76 §5/§9): the FORWARD-entry echelon
 * template.
 *
 *  1. SHADOW: the authored correct forward entry replays through the
 *     PRODUCTION stack (parked-car obstacles armed at collisionMinKmh 0)
 *     with ZERO violations, never touches reverse, and ends at rest
 *     centered on the 45° bay axis.
 *  2. MISTAKE DEMOS: each grades EXACTLY its template codeRefs — the
 *     overshoot pushes past the bay end line into the curb (scripted
 *     staticObject COLLISION); the corner-cut grazes the neighbor car
 *     geometrically at walking speed (vehicle COLLISION), both in a
 *     FORWARD gear (this template's whole failure surface is forward).
 *  3. COMMITTED FILES: content/traces/sc-park-45/*.trace.json ARE the
 *     recordings of these scripts, byte-for-byte, with public copies.
 *
 * RE-RECORD (after ANY change to the scripts, recorder, district or rules):
 *
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-park-45-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_PARK_45 } from "../../lessons/scenario/templates-parking";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { createTracePoint } from "../types";
import { sampleAt } from "../sample";
import { recordScPark45Drive, type ScPark45TraceName } from "../scPark45";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const CONTENT_DIR = path.join(REPO_ROOT, "content", "traces", "sc-park-45");
const PUBLIC_DIR = path.join(REPO_ROOT, "platform", "public", "traces", "sc-park-45");
const RECORD = process.env.RECORD_TRACES === "1";

const district: unknown = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "lot-45-v1.json"), "utf-8"),
);

const NAMES: ScPark45TraceName[] = [
  "shadow-correct",
  "mistake-overshoot",
  "mistake-corner-cut",
];

const drives = new Map<ScPark45TraceName, RecordedDrive>(
  NAMES.map((name) => [name, recordScPark45Drive(district, name)]),
);

function violationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

describe("sc-park-45 — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations, parked-car obstacles armed at 0 km/h threshold", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("ends at rest centered on the 45° bay axis (the §5 completion pose)", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    // Target bay lot-bay-3: center (4.8, 0), axis 45°.
    expect(Math.hypot(last.x - 4.8, last.y - 0)).toBeLessThan(0.25);
    const axisDiff = Math.abs(((last.headingDeg - 45) % 180) + 180) % 180;
    expect(Math.min(axisDiff, 180 - axisDiff)).toBeLessThan(5);
    expect(Math.abs(last.speedKmh)).toBeLessThan(0.5);
    expect(last.brakeOn).toBe(true);
  });

  it("is a pure FORWARD entry: no reverse gear anywhere in the drive", () => {
    expect(shadow.trace.samples.some((s) => s.gear < 0)).toBe(false);
    // …and it really drives INTO the bay nose-first (forward samples at the center).
    expect(
      shadow.trace.samples.some((s) => s.gear === 1 && Math.hypot(s.x - 4.8, s.y) < 1),
    ).toBe(true);
  });

  it("demonstrates the mirror ritual and signals the turn", () => {
    const kinds = shadow.trace.events.map((e) => e.kind);
    expect(kinds).toContain("glance-right");
    expect(kinds).toContain("glance-left");
    expect(kinds).toContain("signal-on");
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(5);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-park-45 — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Подмината линия на гнездото“: curb strike past the end line, exact codes", () => {
    const drive = drives.get("mistake-overshoot")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PARK_45.mistakes[0].codeRefs].sort());
    const collision = drive.ruleEvents.find(
      (e) => e.kind === "violation" && e.code === "COLLISION",
    )!;
    expect(collision.kind === "violation" ? collision.detail : undefined).toBe("staticObject");
    const at = createTracePoint();
    sampleAt(drive.trace, collision.t, at);
    expect(at.gear).toBe(1); // the overshoot happens driving forward
    expect(Math.abs(at.speedKmh)).toBeGreaterThan(0.5);
    expect(Math.abs(at.speedKmh)).toBeLessThan(6);
    // The car center really is PAST the bay center along the 45° axis when
    // the wheel meets the curb (the demonstrated overshoot).
    const lon = ((at.x - 4.8) + (at.y - 0)) * Math.SQRT1_2;
    expect(lon).toBeGreaterThan(1);
  });

  it("„Подрязан ъгъл на съседа“: geometric graze at walking speed, exact codes", () => {
    const drive = drives.get("mistake-corner-cut")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PARK_45.mistakes[1].codeRefs].sort());
    const collision = drive.ruleEvents.find(
      (e) => e.kind === "violation" && e.code === "COLLISION",
    )!;
    expect(collision.kind === "violation" ? collision.detail : undefined).toBe("vehicle");
    const at = createTracePoint();
    sampleAt(drive.trace, collision.t, at);
    expect(at.gear).toBe(1); // clipped while entering FORWARD — the taught failure
    expect(Math.abs(at.speedKmh)).toBeGreaterThan(0.5);
    expect(Math.abs(at.speedKmh)).toBeLessThan(5.5);
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
      expect(parsed!.meta.scenarioId).toBe("sc-park-45");
    });
  }

  it("recording is deterministic: a second run serializes identically", () => {
    const again = recordScPark45Drive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    expect(SC_PARK_45.shadow.path).toBe("content/traces/sc-park-45/shadow-correct.trace.json");
    expect(SC_PARK_45.shadow.pending).not.toBe(true);
    const paths = SC_PARK_45.mistakes.map((m) => m.traceRef.path);
    expect(paths).toEqual([
      "content/traces/sc-park-45/mistake-overshoot.trace.json",
      "content/traces/sc-park-45/mistake-corner-cut.trace.json",
    ]);
    for (const m of SC_PARK_45.mistakes) expect(m.traceRef.pending).not.toBe(true);
  });
});
