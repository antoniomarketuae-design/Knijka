/**
 * FOG-unlock trace gate — „Мъгла" (sc-ac-fog on ac-rain-v1, doc 72 AC-03),
 * doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays in DAY dense fog with ZERO violations and earns
 *      CLEAN_DRIVING — fog lamps ON (the recorder's fogLights channel; the
 *      default is off, which would itself grade the fog-lamp code) + low
 *      beams, a centered ~25 km/h drive under the 0.6 × 50 = 30 km/h fog
 *      envelope.
 *   2. MISTAKE DEMOS grade EXACTLY their cited codes: the dry-habit ~38 km/h
 *      grades SPEED_TOO_FAST_FOR_CONDITIONS (never the fog-lamp code — lamps
 *      are on); the lamps-off adapted drive grades FOG_LIGHTS_OFF_IN_FOG
 *      (never the speed code — under the envelope). Neither grades the RAIN
 *      codes (it is fog, not rain).
 *   3. COMMITTED FILES under content/traces/sc-ac-fog/ ARE the recordings of
 *      these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ac-fog-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_AC_FOG } from "../../lessons/scenario/templates-conditions";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScAcFogDrive, type ScAcFogTraceName } from "../scAcFog";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ac-fog";
const NAMES: ScAcFogTraceName[] = ["shadow-correct", "mistake-dry-speed", "mistake-no-fog-lights"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("ac-rain-v1");
const drives = new Map<ScAcFogTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScAcFogDrive(district, n)]),
);

describe("sc-ac-fog — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays in day dense fog with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("drives the whole street under the fog envelope with Bulgarian annotations", () => {
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThan(30); // under the 0.6 × 50 fog envelope
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(330);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ac-fog — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„като на сухо“: exactly SPEED_TOO_FAST_FOR_CONDITIONS, no fog-lamp or rain code", () => {
    const drive = drives.get("mistake-dry-speed")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_FOG.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("FOG_LIGHTS_OFF_IN_FOG");
    expect(codes).not.toContain("HEADLIGHTS_OFF_IN_RAIN");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
  });

  it("„без фарове за мъгла“: exactly FOG_LIGHTS_OFF_IN_FOG, no conditions-speed or rain code", () => {
    const drive = drives.get("mistake-no-fog-lights")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_FOG.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
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
    const again = recordScAcFogDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_AC_FOG.shadow, ...SC_AC_FOG.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_AC_FOG.shadow.path, ...SC_AC_FOG.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
