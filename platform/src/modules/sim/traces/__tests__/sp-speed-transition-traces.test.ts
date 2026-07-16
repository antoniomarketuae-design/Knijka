/**
 * S trace gate — „Преход 50→30" (sc-speed-transition on sp-trans-v1, doc 72
 * SP-03), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns CLEAN_DRIVING.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs against the PER-EDGE
 *      LOCAL limit — the carried speed grades SPEEDING_DANGEROUS (never the minor
 *      band) and ONLY past the transition (against 30), not on the 50 approach;
 *      the half-slow grades SPEEDING_OVER_LIMIT (never dangerous).
 *   3. COMMITTED FILES under content/traces/sc-speed-transition/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sp-speed-transition-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_SPEED_TRANSITION } from "../../lessons/scenario/templates-sp";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScSpeedTransitionDrive, type ScSpeedTransitionTraceName } from "../scSpeedTransition";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-speed-transition";
const TRANSITION_Y = 160;
const NAMES: ScSpeedTransitionTraceName[] = ["shadow-correct", "mistake-carry-speed", "mistake-half-slow"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("sp-trans-v1");
const drives = new Map<ScSpeedTransitionTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScSpeedTransitionDrive(district, n)]),
);

describe("sc-speed-transition — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("lifts off before the zone: reaches the end already under 30 in the zone", () => {
    const samples = shadow.trace.samples;
    const last = samples[samples.length - 1];
    expect(last.y).toBeGreaterThan(340);
    // Deep in the 30 zone (y > 200) the speed stays under the posted 30.
    const inZone = samples.filter((s) => s.y > 200);
    expect(Math.max(...inZone.map((s) => Math.abs(s.speedKmh)))).toBeLessThan(30);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-speed-transition — per-edge grading (doc 76 §9 stage 5)", () => {
  it("„Скоростта от преди зоната“: exactly SPEEDING_DANGEROUS, fired PAST the transition (against 30, not 50)", () => {
    // Re-record with an onTick probe to prove the LOCAL limit surface + where the
    // violation lands (the recorder's serialized bytes never depend on onTick).
    const samples: { t: number; y: number; limit: number }[] = [];
    const drive = recordScSpeedTransitionDrive(district, "mistake-carry-speed", {
      onTick: (tick) => samples.push({ t: tick.t, y: tick.position.y, limit: tick.maxSpeedKmh }),
    });
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SPEED_TRANSITION.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    // Per-edge limit surface: 50 on the approach, 30 deep in the zone.
    expect(samples.filter((s) => s.y < 150).every((s) => s.limit === 50)).toBe(true);
    expect(samples.filter((s) => s.y > 200).every((s) => s.limit === 30)).toBe(true);
    // The dangerous violation lands in the ZONE (y > the transition), not on the
    // 50 approach where 48 km/h is legal.
    const firstVio = drive.ruleEvents.find((e) => e.kind === "violation")! as { t: number };
    const yAt = samples.reduce((best, s) =>
      Math.abs(s.t - firstVio.t) < Math.abs(best.t - firstVio.t) ? s : best,
    ).y;
    expect(yAt).toBeGreaterThan(TRANSITION_Y);
  });

  it("„Само наполовина намалена“: exactly SPEEDING_OVER_LIMIT, never the dangerous band", () => {
    const drive = drives.get("mistake-half-slow")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SPEED_TRANSITION.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
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
    const again = recordScSpeedTransitionDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_SPEED_TRANSITION.shadow, ...SC_SPEED_TRANSITION.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_SPEED_TRANSITION.shadow.path, ...SC_SPEED_TRANSITION.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
