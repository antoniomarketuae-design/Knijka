/**
 * SNOW-unlock trace gate — „Сняг" (sc-ac-snow on ac-rain-v1, the doc 72
 * AC-08 packed-snow slice — the LAST weather ungated), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays in DAY snow with ZERO violations and earns
 *      CLEAN_DRIVING — low beams on, ~22 km/h under the 0.5 × 50 = 25 km/h
 *      winter envelope, an EARLY snow-envelope stop that rests at the mark,
 *      short of the van.
 *   2. MISTAKE DEMOS grade their exact codes: the dry-habit ~40 km/h grades
 *      EXACTLY SPEED_TOO_FAST_FOR_CONDITIONS (the stop itself is early — the
 *      speed is the fault, no collision); the dry-point braking at winter
 *      speed grades EXACTLY COLLISION (the 0.4 grip physically cannot stop).
 *      Never a lamp code (no lamp duty arms on snow; all demos correctly lit).
 *   3. DUAL-CHANNEL HONESTY: every stop ramp in the scripts is authored at
 *      SNOW_DECEL = SCRIPT_DECEL × SNOW_GRIP_FACTOR — asserted here so the
 *      demo ghosts can never silently drift from the live snow physics
 *      scaling (the wet-braking gate law, one grip band deeper).
 *   4. COMMITTED FILES under content/traces/sc-ac-snow/ ARE the recordings of
 *      these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ac-snow-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SNOW_GRIP_FACTOR } from "../../vehicle";
import { SCRIPT_DECEL } from "../recorder";
import { SC_AC_SNOW } from "../../lessons/scenario/templates-conditions";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScAcSnowDrive,
  scAcSnowMistakeDrySpeedScript,
  scAcSnowMistakeLateBrakeScript,
  scAcSnowShadowScript,
  SNOW_DECEL,
  snowVanObstacle,
  type ScAcSnowTraceName,
} from "../scAcSnow";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ac-snow";
const NAMES: ScAcSnowTraceName[] = ["shadow-correct", "mistake-dry-speed", "mistake-late-brake"];

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
const drives = new Map<ScAcSnowTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScAcSnowDrive(district, n)]),
);

describe("sc-ac-snow — geometry pins against the committed map", () => {
  it("lane, spawn and stop-mark constants match ac-rain-v1", () => {
    const raw = district as {
      meta: { scenario: { laneCenterRightM: number; params: Record<string, number> } };
      spawnPoints: Array<{ id: string; x: number; y: number }>;
    };
    expect(raw.meta.scenario.laneCenterRightM).toBe(4.06);
    expect(raw.meta.scenario.params.lengthM).toBe(360);
    expect(SC_AC_SNOW.map.params).toEqual(raw.meta.scenario.params);
    const spawn = raw.spawnPoints.find((s) => s.id === "ac-rain-spawn-approach")!;
    expect(spawn).toBeTruthy();
    expect(spawn.x).toBe(4.06);
    expect(spawn.y).toBe(15);
    // The van sits inside the street, past the stop mark, in the right lane.
    const [van] = snowVanObstacle();
    expect(van.x).toBe(4.06);
    expect(van.y).toBe(310);
    expect(van.y - van.halfLengthM).toBeGreaterThan(300); // mark is short of it
    expect(van.y + van.halfLengthM).toBeLessThan(360); // inside the street
  });

  it("dual-channel honesty: every stop ramp is authored at SCRIPT_DECEL × SNOW_GRIP_FACTOR", () => {
    expect(SNOW_DECEL).toBe(SCRIPT_DECEL * SNOW_GRIP_FACTOR);
    for (const script of [
      scAcSnowShadowScript(),
      scAcSnowMistakeDrySpeedScript(),
      scAcSnowMistakeLateBrakeScript(),
    ]) {
      const ramps = script.steps.filter(
        (s) => s.kind === "drive" && s.maxDecelMps2 !== undefined,
      );
      expect(ramps.length).toBeGreaterThanOrEqual(1);
      for (const r of ramps) {
        if (r.kind === "drive") expect(r.maxDecelMps2).toBe(SNOW_DECEL);
      }
    }
  });
});

describe("sc-ac-snow — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays in day snow with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("stays under the winter envelope and RESTS at the mark, short of the van", () => {
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThan(25); // under the 0.5 × 50 snow envelope
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.speedKmh).toBe(0);
    expect(Math.abs(last.y - 300)).toBeLessThan(0.5); // at the mark…
    expect(last.y + 2.02).toBeLessThan(307.75); // …nose short of the van's rear
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ac-snow — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„40 в снега“: exactly SPEED_TOO_FAST_FOR_CONDITIONS — the speed is the fault, the stop is early", () => {
    const drive = drives.get("mistake-dry-speed")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_SNOW.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("COLLISION"); // the early snow-envelope stop rests short
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT"); // 40 < the posted 50
    expect(codes).not.toContain("HEADLIGHTS_OFF_IN_RAIN"); // no lamp duty on snow
  });

  it("„Спирачка на сухата точка“: exactly COLLISION — winter speed, wrong (dry) braking point", () => {
    const drive = drives.get("mistake-late-brake")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_SNOW.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS"); // the speed WAS winter-lawful
    expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE"); // the snow ramp is gentle by construction
  });

  it("the late-brake ghost strikes the van at demonstrable speed (the snow physics story)", () => {
    // The kinematic ghost must cross the van's face still MOVING — that is
    // the taught consequence (~10 km/h on the authored snow envelope).
    const trace = drives.get("mistake-late-brake")!.trace;
    const atVanFace = trace.samples.find((s) => s.y >= 305.7);
    expect(atVanFace, "late-brake reaches the van").toBeTruthy();
    expect(atVanFace!.speedKmh).toBeGreaterThan(5);
    expect(atVanFace!.speedKmh).toBeLessThan(15);
    // The dry-speed demo NEVER reaches the van (its fault is the speed alone).
    const drySpeed = drives.get("mistake-dry-speed")!.trace;
    expect(drySpeed.samples.some((s) => s.y >= 305.7)).toBe(false);
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
    const again = recordScAcSnowDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_AC_SNOW.shadow, ...SC_AC_SNOW.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_AC_SNOW.shadow.path, ...SC_AC_SNOW.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
