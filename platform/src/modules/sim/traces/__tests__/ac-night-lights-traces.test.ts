/**
 * S4 trace gate — „Нощно каране без светлини" (sc-ac-night-lights on
 * ac-night-v1, doc 72 AC-01), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays at night with ZERO violations and earns CLEAN_DRIVING —
 *      low beams on (the recorder's night default), a centered ~44 km/h drive.
 *   2. MISTAKE DEMOS grade EXACTLY HEADLIGHTS_OFF_AT_NIGHT (never-on and
 *      turned-off-mid-drive), never a speed or lane code.
 *   3. COMMITTED FILES under content/traces/sc-ac-night-lights/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/ac-night-lights-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_AC_NIGHT_LIGHTS } from "../../lessons/scenario/templates-conditions";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScAcNightLightsDrive, type ScAcNightLightsTraceName } from "../scAcNightLights";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ac-night-lights";
const NAMES: ScAcNightLightsTraceName[] = ["shadow-correct", "mistake-never-on", "mistake-turned-off"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("ac-night-v1");
const drives = new Map<ScAcNightLightsTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScAcNightLightsDrive(district, n)]),
);

describe("sc-ac-night-lights — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays at night with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("drives the whole street lit, centered and legal with Bulgarian annotations", () => {
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThan(50); // under the posted limit
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(330);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ac-night-lights — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Никога не включени светлини“: exactly HEADLIGHTS_OFF_AT_NIGHT, no speed or lane code", () => {
    const drive = drives.get("mistake-never-on")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_NIGHT_LIGHTS.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
    expect(codes).not.toContain("POOR_LANE_KEEPING");
  });

  it("„Изгасени по време на движение“: exactly HEADLIGHTS_OFF_AT_NIGHT, no speed or lane code", () => {
    const drive = drives.get("mistake-turned-off")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_NIGHT_LIGHTS.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
    expect(codes).not.toContain("POOR_LANE_KEEPING");
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
    const again = recordScAcNightLightsDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_AC_NIGHT_LIGHTS.shadow, ...SC_AC_NIGHT_LIGHTS.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_AC_NIGHT_LIGHTS.shadow.path, ...SC_AC_NIGHT_LIGHTS.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
