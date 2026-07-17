/**
 * NIGHT-SPEED trace gate — „Не изпреварвай собствените си фарове"
 * (sc-ac-night-overdrive on ov-oncoming-v1, doc 72 SP-07 + AC-01), doc 76
 * §5/§9 stages 3+5:
 *   1. SHADOW replays at night with ZERO violations and earns CLEAN_DRIVING —
 *      low beams on, a centered ~50 km/h drive under the authored 0.65 × 90 =
 *      58.5 km/h unlit-segment envelope, braking at the ~40 m beam edge and
 *      resting at the mark ~5.7 m short of the trailer.
 *   2. MISTAKE DEMOS grade EXACTLY their cited codes: the posted-limit 90
 *      grades SPEED_TOO_FAST_FOR_CONDITIONS + COLLISION (never SPEEDING_* —
 *      90 is LAWFUL here; the fault is the dark, not the limit); the lights-off
 *      drive grades HEADLIGHTS_OFF_AT_NIGHT alone (under the envelope, and it
 *      stops well short of the trailer).
 *   3. COMMITTED FILES under content/traces/sc-ac-night-overdrive/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *   4. The DISTRICT INVARIANTS the template pins by value (limit 90, lane x,
 *      length, no zones) still hold on the generated map — this template reuses
 *      ov-oncoming-v1 and adds no map of its own, so its L7 copy truth is
 *      asserted here rather than in a district battery of its own.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ac-night-overdrive-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_AC_NIGHT_OVERDRIVE } from "../../lessons/scenario/templates-conditions2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScAcNightOverdriveDrive,
  type ScAcNightOverdriveTraceName,
} from "../scAcNightOverdrive";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ac-night-overdrive";
const NAMES: ScAcNightOverdriveTraceName[] = [
  "shadow-correct",
  "mistake-posted-limit",
  "mistake-lights-off",
];

/** The authored unlit-segment envelope: 0.65 × the road's posted 90. */
const NIGHT_ENVELOPE_KMH = 58.5;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("ov-oncoming-v1");
const drives = new Map<ScAcNightOverdriveTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScAcNightOverdriveDrive(district, n)]),
);

describe("sc-ac-night-overdrive — the district it pins (the L7 copy truth)", () => {
  const raw = district as {
    roads: { edges: Array<{ maxspeed: number; length: number; lanes: number }> };
    zones?: unknown[];
    crossings: unknown[];
    intersections: unknown[];
    spawnPoints: Array<{ id: string; x: number; y: number }>;
    meta: { scenario: { params: Record<string, number>; laneCenterRightM: number } };
  };

  it("ov-oncoming-v1 is the 90 km/h unlit-segment road the template's arithmetic needs", () => {
    // The WHOLE lesson exists only where the posted limit exceeds the ~60 km/h
    // ceiling the 40 m low beam imposes. On a 50-zone the limit already fits
    // inside the beam and „не изпреварвай фаровете" would be fabricated.
    expect(raw.roads.edges.length).toBe(1);
    expect(raw.roads.edges[0].maxspeed).toBe(90);
    expect(raw.roads.edges[0].length).toBe(900);
    expect(SC_AC_NIGHT_OVERDRIVE.map.params).toEqual({ lengthM: 900, maxspeedKmh: 90 });
    expect(SC_AC_NIGHT_OVERDRIVE.map.districtId).toBe("ov-oncoming-v1");
  });

  it("nothing but the night channels is gradable: no zones, crossings or junctions", () => {
    // Contrast ac-aqua-v1 (the other committed 90-road), whose waterPatch span
    // would inject an aquaplane code into every demo.
    expect(raw.zones).toBeUndefined();
    expect(raw.crossings.length).toBe(0);
    expect(raw.intersections.length).toBe(0);
  });

  it("the template starts on the committed own-lane spawn and pins its lane center", () => {
    const spawn = raw.spawnPoints.find((s) => s.id === SC_AC_NIGHT_OVERDRIVE.start.spawnPointId);
    expect(spawn, "start.spawnPointId must exist in the district").toBeDefined();
    expect(spawn!.x).toBe(raw.meta.scenario.laneCenterRightM);
    // Every zone the template pins sits on that lane center (the L7 copy).
    for (const o of SC_AC_NIGHT_OVERDRIVE.success) {
      expect((o.params as { x: number }).x, o.id).toBe(raw.meta.scenario.laneCenterRightM);
    }
  });

  it("the authored envelope is per-DRILL: the template carries it, the engine default does not", () => {
    // rules/types.ts ships conditionSpeedNightFactor 1 ON PURPOSE (lit urban
    // Sofia — the A12 FP case). This template authors the unlit segment its own
    // note anticipates, and ONLY for itself.
    expect(SC_AC_NIGHT_OVERDRIVE.ruleConfig?.conditionSpeedNightFactor).toBe(0.65);
    expect(90 * SC_AC_NIGHT_OVERDRIVE.ruleConfig!.conditionSpeedNightFactor!).toBeCloseTo(
      NIGHT_ENVELOPE_KMH,
      6,
    );
  });
});

describe("sc-ac-night-overdrive — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays at night with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("drives the unlit stretch under the night envelope with Bulgarian annotations", () => {
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThan(NIGHT_ENVELOPE_KMH);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("stops INSIDE the beam: at rest on the mark, short of the trailer", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    // Rest on the mark (y = 390) — the hero nose (+2.02) clears the trailer's
    // rear face at 397.75 by ~5.7 m.
    expect(Math.abs(last.speedKmh)).toBeLessThan(1);
    expect(last.y).toBeGreaterThan(387);
    expect(last.y).toBeLessThan(392);
    expect(last.y + 2.02).toBeLessThan(397.75);
  });

  it("the brake lands at the ~40 m beam edge — the story and the geometry are one number", () => {
    // The recorder is given 50 m of room for a 30 m stop, so it chooses the
    // brake point itself: it must fall near y = 360, where the trailer first
    // enters the low-beam cone. Nothing here is hand-placed.
    const samples = shadow.trace.samples;
    const cruise = Math.max(...samples.map((s) => Math.abs(s.speedKmh)));
    const brakeStart = samples.find((s) => s.y > 300 && Math.abs(s.speedKmh) < cruise - 2);
    expect(brakeStart, "the shadow must brake before the mark").toBeDefined();
    expect(brakeStart!.y).toBeGreaterThan(350);
    expect(brakeStart!.y).toBeLessThan(372);
  });
});

describe("sc-ac-night-overdrive — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„90 км/ч на къси светлини“: exactly SPEED_TOO_FAST_FOR_CONDITIONS + COLLISION", () => {
    const drive = drives.get("mistake-posted-limit")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_NIGHT_OVERDRIVE.mistakes[0].codeRefs].sort());
    // The posted 90 is LAWFUL on this road — the fault is the dark, not the
    // limit. The conditions code is capped at the graced limit by construction,
    // so a speeding code here would mean the demo drifted over 99 km/h.
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    // Lights were correct: this demo must never bill the AC-01 beat.
    expect(codes).not.toContain("HEADLIGHTS_OFF_AT_NIGHT");
  });

  it("„90 км/ч“: the impact is decided BEFORE the trailer is visible (the archetype)", () => {
    const drive = drives.get("mistake-posted-limit")!;
    const samples = drive.trace.samples;
    // It carried the posted limit through the dark…
    expect(Math.max(...samples.map((s) => Math.abs(s.speedKmh)))).toBeGreaterThan(85);
    // …and braking from the beam edge could not save it: still fast at contact.
    const atTrailer = samples.find((s) => s.y >= 395);
    expect(atTrailer, "the demo must reach the trailer").toBeDefined();
    expect(Math.abs(atTrailer!.speedKmh)).toBeGreaterThan(40);
  });

  it("„без светлини“: exactly HEADLIGHTS_OFF_AT_NIGHT, no conditions-speed or collision", () => {
    const drive = drives.get("mistake-lights-off")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_NIGHT_OVERDRIVE.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
    expect(codes).not.toContain("COLLISION");
  });

  it("„без светлини“: the two demos are two SEPARATE lessons, not one pile-up", () => {
    const drive = drives.get("mistake-lights-off")!;
    // Adapted speed under the envelope…
    expect(Math.max(...drive.trace.samples.map((s) => Math.abs(s.speedKmh)))).toBeLessThan(
      NIGHT_ENVELOPE_KMH,
    );
    // …and it never reaches the trailer, so the dark is the only fault shown.
    const last = drive.trace.samples[drive.trace.samples.length - 1];
    expect(last.y).toBeLessThan(395.5);
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
    const again = recordScAcNightOverdriveDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_AC_NIGHT_OVERDRIVE.shadow, ...SC_AC_NIGHT_OVERDRIVE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_AC_NIGHT_OVERDRIVE.shadow.path,
      ...SC_AC_NIGHT_OVERDRIVE.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
