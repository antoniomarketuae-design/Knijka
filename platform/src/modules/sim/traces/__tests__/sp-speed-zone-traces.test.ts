/**
 * S trace gate — „Зона 30 (училище/жилищна)" (sc-speed-zone on sp-zone30-v1,
 * doc 72 SP-03 / PE-07), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns CLEAN_DRIVING.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs — the boulevard
 *      speed grades SPEEDING_OVER_LIMIT and NEVER the dangerous band; the full
 *      50 km/h grades SPEEDING_DANGEROUS and NEVER the minor band.
 *   3. COMMITTED FILES under content/traces/sc-speed-zone/ ARE the recordings of
 *      these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sp-speed-zone-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_SPEED_ZONE } from "../../lessons/scenario/templates-sp";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScSpeedZoneDrive, type ScSpeedZoneTraceName } from "../scSpeedZone";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-speed-zone";
const NAMES: ScSpeedZoneTraceName[] = ["shadow-correct", "mistake-boulevard-speed", "mistake-full-speed"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("sp-zone30-v1");
const drives = new Map<ScSpeedZoneTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScSpeedZoneDrive(district, n)]),
);

describe("sc-speed-zone — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("drives the whole zone under 30 km/h with Bulgarian annotations", () => {
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThan(30); // never touches the posted 30 limit
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(330);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-speed-zone — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Скорост от булеварда“: exactly SPEEDING_OVER_LIMIT, never the dangerous band", () => {
    const drive = drives.get("mistake-boulevard-speed")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SPEED_ZONE.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
  });

  it("„Пълни 50 през зоната“: exactly SPEEDING_DANGEROUS, never the minor band", () => {
    const drive = drives.get("mistake-full-speed")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SPEED_ZONE.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
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
    const again = recordScSpeedZoneDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_SPEED_ZONE.shadow, ...SC_SPEED_ZONE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_SPEED_ZONE.shadow.path, ...SC_SPEED_ZONE.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
