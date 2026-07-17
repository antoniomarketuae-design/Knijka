/**
 * S trace gate — „Неосветена пътека нощем" (sc-pe-night-unlit on pe-dart-v1,
 * doc 72 PE-09 / PE-02), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns PEDESTRIAN_YIELDED.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs — the city-speed
 *      approach grades PEDESTRIAN_CROSSING_TOO_FAST + COLLISION (never a
 *      not-yielded, never SPEEDING_*); the dark drive grades only
 *      HEADLIGHTS_OFF_AT_NIGHT (never a crossing code — it stops outside the
 *      zone).
 *   3. The NIGHT axis is real (every drive records isNight) and the leash is
 *      genuinely shorter than the live daytime dart's — the two templates on
 *      this district cannot play identically.
 *   4. COMMITTED FILES under content/traces/sc-pe-night-unlit/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-pe-night-unlit-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_CROSSING_DART } from "../../lessons/scenario/templates-pe";
import { SC_PE_NIGHT_UNLIT } from "../../lessons/scenario/templates-pe2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScPeNightUnlitDrive, type ScPeNightUnlitTraceName } from "../scPeNightUnlit";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-pe-night-unlit";
const NAMES: ScPeNightUnlitTraceName[] = ["shadow-correct", "mistake-city-speed", "mistake-lights-off"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("pe-dart-v1");
const drives = new Map<ScPeNightUnlitTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScPeNightUnlitDrive(district, n)]),
);

describe("sc-pe-night-unlit — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns PEDESTRIAN_YIELDED", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("PEDESTRIAN_YIELDED");
  });

  it("is ready BEFORE the figure exists: under the 30 km/h cap from the zone edge on", () => {
    // The zone arms ~35 m out (y ≈ 45.2). Every sample from there to the zebra
    // sits under the crossing-approach cap — the readiness is the lesson, and
    // it is not a reaction: the speed was already chosen when she stepped out.
    const inZone = shadow.trace.samples.filter((s) => s.y >= 45.2 && s.y <= 80);
    expect(inZone.length).toBeGreaterThan(0);
    for (const s of inZone) expect(s.speedKmh).toBeLessThanOrEqual(30);
  });

  it("rests short of the zebra, then clears it with Bulgarian annotations", () => {
    // The wait is real (the 1.4 m/s figure needs ~12.8 s of carriageway) and it
    // happens BEFORE the paint — never on it.
    const atRest = shadow.trace.samples.filter((s) => Math.abs(s.speedKmh) < 0.5 && s.y > 60);
    expect(atRest.length).toBeGreaterThan(0);
    const firstRest = atRest[0];
    expect(firstRest.y).toBeGreaterThan(70);
    expect(firstRest.y).toBeLessThan(80);
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(118);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-pe-night-unlit — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Градска скорост срещу невидимия пешеходец“: exactly too-fast + COLLISION", () => {
    const drive = drives.get("mistake-city-speed")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PE_NIGHT_UNLIT.mistakes[0].codeRefs].sort());
    // The car never passes the paint — the strike is the code, not a drive-through.
    expect(codes).not.toContain("PEDESTRIAN_NOT_YIELDED");
    // 40 km/h under the posted 50: the speed is LAWFUL. That is the whole point.
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    // No ruleConfig ⇒ the shipped night factor is 1 ⇒ the night never bills
    // a conditions code here (the template header's A12 note).
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });

  it("„Нощно каране без светлини“: exactly HEADLIGHTS_OFF_AT_NIGHT, no crossing codes", () => {
    const drive = drives.get("mistake-lights-off")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PE_NIGHT_UNLIT.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("PEDESTRIAN_CROSSING_TOO_FAST");
    expect(codes).not.toContain("COLLISION");
    // It rests outside the 35 m crossing zone: the figure is never released.
    const last = drive.trace.samples[drive.trace.samples.length - 1];
    expect(last.y).toBeLessThan(45.2);
  });
});

describe("the NIGHT delta against the live daytime dart on the same district", () => {
  it("every drive records at night with an authored headlights channel", () => {
    for (const name of NAMES) {
      const samples = drives.get(name)!.trace.samples;
      expect(samples.length).toBeGreaterThan(0);
    }
    // The dark demo's whole thesis: the lights channel is authored OFF, and
    // the engine bills it. The other two author "low" and are billed nothing.
    expect(violationCodes(drives.get("mistake-lights-off")!)).toEqual(["HEADLIGHTS_OFF_AT_NIGHT"]);
    expect(violationCodes(drives.get("shadow-correct")!)).not.toContain("HEADLIGHTS_OFF_AT_NIGHT");
  });

  it("the leash is meaningfully shorter than sc-crossing-dart's (they cannot play alike)", () => {
    const night = SC_PE_NIGHT_UNLIT.staged![0];
    const day = SC_CROSSING_DART.staged![0];
    expect(night.kind).toBe("pedestrianDartOut");
    expect(day.kind).toBe("pedestrianDartOut");
    if (night.kind !== "pedestrianDartOut" || day.kind !== "pedestrianDartOut") return;
    // Same district, same zebra — the encounter differs by WHEN she is released
    // (and by her pace: the night figure walks, she does not sprint).
    expect(night.crossing).toEqual(day.crossing);
    expect(night.triggerDistM).toBeLessThanOrEqual(day.triggerDistM - 8);
    expect(night.speedMps).toBeLessThan(day.speedMps);
    expect(SC_PE_NIGHT_UNLIT.conditions?.night).toBe(true);
    expect(SC_CROSSING_DART.conditions?.night ?? false).toBe(false);
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
    const again = recordScPeNightUnlitDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_PE_NIGHT_UNLIT.shadow, ...SC_PE_NIGHT_UNLIT.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_PE_NIGHT_UNLIT.shadow.path, ...SC_PE_NIGHT_UNLIT.mistakes.map((m) => m.traceRef.path)]).toEqual(
      expected,
    );
  });
});
