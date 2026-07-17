/**
 * Trace gate — sc-sig-green-wave (doc 72 SP-09 „Спурт между светофари", crossed
 * with SP-01/SP-11 and JU-09) on the committed sig-wave-v1 avenue. Doc 76 §5/§9
 * stages 3+5:
 *   1. SHADOW replays with ZERO violations — 49.9 km/h end to end rides all
 *      three greens without touching the brake.
 *   2. MISTAKE DEMOS grade EXACTLY their codeRefs — the sprint trips minor
 *      speeding + the phantom slam and nothing else; the freeze trips only the
 *      hesitation.
 *   3. THE THESIS, measured: the sprint demo peaks at 57.9 km/h and reaches the
 *      THIRD stop line LATER than the shadow that never exceeded 50. If that
 *      ever stops being true, this template is teaching a lie — so it is a gate,
 *      not a comment.
 *   4. COMMITTED FILES under content/traces/sc-sig-green-wave/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-sig-green-wave-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_SIG_GREEN_WAVE } from "../../lessons/scenario/templates-signals2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScSigGreenWaveDrive, type ScSigGreenWaveTraceName } from "../scSigGreenWave";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-sig-green-wave";
const NAMES: ScSigGreenWaveTraceName[] = ["shadow-correct", "mistake-sprint", "mistake-sleep-at-green"];

/** Northbound stop line of the THIRD signal (sw-n-tl3 at y = 528), m. */
const LINE_3 = 500.275;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
/** Trace time at which the drive first reaches the third stop line, or null. */
function tAtThirdLine(d: RecordedDrive): number | null {
  return d.trace.samples.find((s) => s.y >= LINE_3)?.tSec ?? null;
}

const district = loadDistrict("sig-wave-v1");
const drives = new Map<ScSigGreenWaveTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScSigGreenWaveDrive(district, n)]),
);

describe("sc-sig-green-wave — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("rides the wave: all three lines crossed on GREEN, never braking, never stopping", () => {
    // The lamp state AT each crossing is the district's promise — and nothing
    // pins it: sig-wave-v1's own fnv1a offsets (36/17/48) are the wave.
    const lights: string[] = [];
    let minSpeedKmh = Infinity;
    recordScSigGreenWaveDrive(district, "shadow-correct", {
      onTick: (tick) => {
        for (const e of tick.events) {
          if (e.kind === "stopLineCrossed" && e.control === "trafficLight") lights.push(e.lightState ?? "?");
        }
        // Ignore the ramp away from the spawn and the closing stop.
        if (tick.position.y > -240 && tick.position.y < 560) {
          minSpeedKmh = Math.min(minSpeedKmh, tick.speedKmh);
        }
      },
    });
    expect(lights).toEqual(["green", "green", "green"]);
    // Never dropped out of the flow — the whole avenue at one speed.
    expect(minSpeedKmh).toBeGreaterThan(45);
  });

  it("stays lawful: never exceeds the 50 km/h avenue limit", () => {
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => s.speedKmh));
    expect(maxKmh).toBeLessThanOrEqual(50);
    expect(maxKmh).toBeGreaterThan(48); // …and actually USES the limit
  });

  it("finishes on the north arm, on the lane center", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(600);
    expect(Math.abs(last.x - 4.06)).toBeLessThan(1.5);
  });
});

describe("sc-sig-green-wave — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Спринт до всяко червено“: exactly SPEEDING_OVER_LIMIT + HARSH_BRAKING_NO_CAUSE", () => {
    const drive = drives.get("mistake-sprint")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SIG_GREEN_WAVE.mistakes[0].codeRefs].sort());
    // The demo sprints, it does not rampage: no опасна leak turns the lesson
    // into a different (10-point) story.
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    expect(codes).not.toContain("RED_LIGHT_CROSSED");
    expect(codes).not.toContain("YELLOW_LIGHT_NOT_STOPPED");
    expect(codes).not.toContain("HESITATION_AT_GREEN");
  });

  it("„Спринт“: the slam is graded because it is CAUSELESS — no lamp, no lead, no junction", () => {
    // The detector's ruling IS the teach: the third lamp was red but 180 m away
    // (harshBrakeSignalCauseM is 120), so nothing on the road called for an
    // emergency stop. Prove the slam window really was clear of every cause.
    let slamTicks = 0;
    recordScSigGreenWaveDrive(district, "mistake-sprint", {
      onTick: (tick) => {
        const y = tick.position.y;
        if (y >= 320 && y <= 335) {
          slamTicks++;
          expect(tick.nextStopLineM === undefined || tick.nextStopLineM > 120).toBe(true);
          expect(tick.nextJunctionM === undefined || tick.nextJunctionM > 35).toBe(true);
          expect(tick.leadGapM === undefined || tick.leadGapM > 45).toBe(true);
        }
      },
    });
    expect(slamTicks).toBeGreaterThan(0);
  });

  it("„Заспиване на потеглящото зелено“: exactly HESITATION_AT_GREEN", () => {
    const drive = drives.get("mistake-sleep-at-green")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SIG_GREEN_WAVE.mistakes[1].codeRefs].sort());
    // The freeze happens ON GREEN at a line it never oversteps — if either of
    // these leaked, the demo would be teaching a different fault.
    expect(codes).not.toContain("STOP_LINE_OVERSHOOT");
    expect(codes).not.toContain("RED_LIGHT_CROSSED");
  });

  it("„Заспиване“: misses the wave — the third lamp is no longer green when it arrives", () => {
    const drive = drives.get("mistake-sleep-at-green")!;
    // It stops short of the third line and never crosses it (the card's claim).
    expect(tAtThirdLine(drive)).toBeNull();
    const last = drive.trace.samples[drive.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(490);
    expect(last.y).toBeLessThan(LINE_3);
    expect(last.speedKmh).toBe(0);
  });
});

describe("sc-sig-green-wave — THE THESIS: the sprint LOSES time (doc 76 §9)", () => {
  it("the sprint peaks at ~58 km/h and still reaches the third line LATER than the wave rider", () => {
    // The one measurement the whole template rests on. The shadow never
    // exceeds 50; the sprint demo runs 58 between the lamps, brakes hard once,
    // and arrives at the third stop line AFTER it. Speeding did not buy time —
    // it bought fuel, brakes and two graded faults.
    const shadowT = tAtThirdLine(drives.get("shadow-correct")!);
    const sprintT = tAtThirdLine(drives.get("mistake-sprint")!);
    expect(shadowT).not.toBeNull();
    expect(sprintT).not.toBeNull();
    const sprintMax = Math.max(...drives.get("mistake-sprint")!.trace.samples.map((s) => s.speedKmh));
    const shadowMax = Math.max(...drives.get("shadow-correct")!.trace.samples.map((s) => s.speedKmh));
    expect(sprintMax).toBeGreaterThan(shadowMax + 5);
    expect(sprintT!).toBeGreaterThan(shadowT!);
  });

  it("both reach the third lamp on green — the wave is what carried them, not the throttle", () => {
    for (const name of ["shadow-correct", "mistake-sprint"] as const) {
      const lights: string[] = [];
      recordScSigGreenWaveDrive(district, name, {
        onTick: (tick) => {
          for (const e of tick.events) {
            if (e.kind === "stopLineCrossed" && e.control === "trafficLight") lights.push(e.lightState ?? "?");
          }
        },
      });
      expect(lights, name).toEqual(["green", "green", "green"]);
    }
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
    for (const name of NAMES) {
      const again = recordScSigGreenWaveDrive(district, name);
      expect(serializeScenarioTrace(again.trace), name).toBe(
        serializeScenarioTrace(drives.get(name)!.trace),
      );
    }
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_SIG_GREEN_WAVE.shadow, ...SC_SIG_GREEN_WAVE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_SIG_GREEN_WAVE.shadow.path, ...SC_SIG_GREEN_WAVE.mistakes.map((m) => m.traceRef.path)]).toEqual(
      expected,
    );
  });
});
