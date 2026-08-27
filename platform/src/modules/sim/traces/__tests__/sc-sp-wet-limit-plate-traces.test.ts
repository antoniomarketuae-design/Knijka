/**
 * Wave-9 trace gate — „Табела „при мокра настилка"" (sc-sp-wet-limit-plate on
 * sp-rain-v1, doc 72 SP-04), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays (day rain) with ZERO violations and earns CLEAN_DRIVING —
 *      the ~38 km/h drive stays under the 0.85 × 50 = 42.5 km/h rain envelope,
 *      and low beams ON avoid HEADLIGHTS_OFF_IN_RAIN.
 *   2. MISTAKE DEMOS grade EXACTLY their codeRefs (toEqual, not toContain):
 *      the ~50 hold bills SPEED_TOO_FAST_FOR_CONDITIONS alone (never a speeding
 *      or lights code); the ~57 hold bills SPEEDING_OVER_LIMIT alone (never the
 *      conditions or dangerous code).
 *   3. COMMITTED FILES under content/traces/sc-sp-wet-limit-plate/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-sp-wet-limit-plate-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_SP_WET_LIMIT_PLATE } from "../../lessons/scenario/templates-speed2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScSpWetLimitPlateDrive, type ScSpWetLimitPlateTraceName } from "../scSpWetLimitPlate";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-sp-wet-limit-plate";
const NAMES: ScSpWetLimitPlateTraceName[] = [
  "shadow-correct",
  "mistake-dry-speed-in-wet",
  "mistake-over-limit-in-wet",
];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("sp-rain-v1");
const drives = new Map<ScSpWetLimitPlateTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScSpWetLimitPlateDrive(district, n)]),
);

describe("sc-sp-wet-limit-plate — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays under day rain with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("drives the whole street under the rain envelope with Bulgarian annotations", () => {
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThan(42.5); // under the 0.85 × 50 rain envelope
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(330);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-sp-wet-limit-plate — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Сухата скорост под мократа табела“: exactly SPEED_TOO_FAST_FOR_CONDITIONS, no speeding or lights code", () => {
    const drive = drives.get("mistake-dry-speed-in-wet")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SP_WET_LIMIT_PLATE.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    expect(codes).not.toContain("HEADLIGHTS_OFF_IN_RAIN");
  });

  it("„Пълно превишение в дъжда“: exactly SPEEDING_OVER_LIMIT, no conditions or dangerous code", () => {
    const drive = drives.get("mistake-over-limit-in-wet")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SP_WET_LIMIT_PLATE.mistakes[1].codeRefs].sort());
    expect(codes).toContain("SPEED_TOO_FAST_FOR_CONDITIONS"); // the wet envelope is breached as well as the plate — the demo's own prose says «табелата искаше 40»
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    expect(codes).not.toContain("HEADLIGHTS_OFF_IN_RAIN");
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
    const again = recordScSpWetLimitPlateDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_SP_WET_LIMIT_PLATE.shadow, ...SC_SP_WET_LIMIT_PLATE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_SP_WET_LIMIT_PLATE.shadow.path, ...SC_SP_WET_LIMIT_PLATE.mistakes.map((m) => m.traceRef.path)]).toEqual(
      expected,
    );
  });
});
