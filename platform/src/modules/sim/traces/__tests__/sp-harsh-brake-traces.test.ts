/**
 * Trace gate — „Рязко спиране без причина" (sc-sp-harsh-brake on sp-creep-v1,
 * doc 72 SP-11 / VP-09), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns CLEAN_DRIVING — the SAME
 *      stop the mistakes slam, planned early and braked progressively (~3.2
 *      m/s², the default recorder envelope) proves the innocent side of the
 *      exact maneuver.
 *   2. MISTAKE DEMOS grade EXACTLY HARSH_BRAKING_NO_CAUSE — the phantom slam
 *      to a dead stop AND the panic stab down to a crawl (no standstill);
 *      neither leaks a speed/lane code.
 *   3. COMMITTED FILES under content/traces/sc-sp-harsh-brake/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public
 *      copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sp-harsh-brake-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_SP_HARSH_BRAKE } from "../../lessons/scenario/templates-sp";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScSpHarshBrakeDrive, type ScSpHarshBrakeTraceName } from "../scSpHarshBrake";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-sp-harsh-brake";
const NAMES: ScSpHarshBrakeTraceName[] = ["shadow-correct", "mistake-phantom-stop", "mistake-stab-crawl"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("sp-creep-v1");
const drives = new Map<ScSpHarshBrakeTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScSpHarshBrakeDrive(district, n)]),
);

describe("sc-sp-harsh-brake — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING (the progressive stop is innocent)", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("actually performs the mid-route planned stop, centered and legal, with Bulgarian annotations", () => {
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThan(50); // under the posted limit
    // The planned stop: a full standstill inside the control zone (y ≈ 180).
    const atRestInZone = shadow.trace.samples.some(
      (s) => Math.abs(s.speedKmh) < 0.5 && Math.abs(s.y - 180) < 12,
    );
    expect(atRestInZone).toBe(true);
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(330);
    expect(Math.abs(last.x - 4.06)).toBeLessThan(1.5); // stayed in the lane center
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-sp-harsh-brake — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Фантомно спиране“: exactly HARSH_BRAKING_NO_CAUSE, never a speed/lane code", () => {
    const drive = drives.get("mistake-phantom-stop")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SP_HARSH_BRAKE.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("POOR_LANE_KEEPING");
  });

  it("„Рязък натиск до пълзене“: exactly HARSH_BRAKING_NO_CAUSE without a full stop", () => {
    const drive = drives.get("mistake-stab-crawl")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SP_HARSH_BRAKE.mistakes[1].codeRefs].sort());
    // The stab never reaches a standstill until the final planned stop: no
    // sample in the stab window (y 145..175) is at rest.
    const stabWindow = drive.trace.samples.filter((s) => s.y > 145 && s.y < 175);
    expect(stabWindow.length).toBeGreaterThan(0);
    expect(stabWindow.every((s) => Math.abs(s.speedKmh) > 0.5)).toBe(true);
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
    const again = recordScSpHarshBrakeDrive(district, "mistake-phantom-stop");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("mistake-phantom-stop")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_SP_HARSH_BRAKE.shadow, ...SC_SP_HARSH_BRAKE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_SP_HARSH_BRAKE.shadow.path, ...SC_SP_HARSH_BRAKE.mistakes.map((m) => m.traceRef.path)]).toEqual(
      expected,
    );
  });
});
