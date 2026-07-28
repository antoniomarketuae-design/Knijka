/**
 * S3-F trace gate — „Десен завой през велосипедист" (sc-vu-cyclist-hook on
 * vu-cyclist-v1, doc 72 VU-01), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns YIELDED_TO_PRIORITY
 *      (waited the curb-riding cyclist past the mouth, THEN turned right).
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs (FAILED_TO_YIELD for
 *      both the gap-misjudge hook and the no-blind-spot-check hook), and NEVER a
 *      turn-signal or follow code (both demos signal right and never tailgate).
 *   3. COMMITTED FILES under content/traces/sc-vu-cyclist-hook/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-vu-cyclist-hook-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_VU_CYCLIST_HOOK } from "../../lessons/scenario/templates-vru";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScVuCyclistDrive, type ScVuCyclistTraceName } from "../scVuCyclist";
import type { RecordedDrive } from "../recorder";
import { createTracePoint, sampleAt, type ScenarioTrace } from "../index";
import { createTrafficSystem } from "../../traffic/system";
import type { TrafficDistrict } from "../../traffic/types";
import { createScenarioDirector } from "../../orchestrator/director";
import type { StagedEventSpec } from "../../contracts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-vu-cyclist-hook";
const NAMES: ScVuCyclistTraceName[] = [
  "shadow-correct",
  "mistake-hook",
  "mistake-no-look",
  "mistake-forced-brake",
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

const district = loadDistrict("vu-cyclist-v1");
const drives = new Map<ScVuCyclistTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScVuCyclistDrive(district, n)]),
);

/**
 * What the STAGED CYCLIST did while the ghost drove — the founder's own test of
 * this reel ("the bicyclist will have to slow down"), which the trace format
 * cannot answer on its own: a ScenarioTrace v1 stores the EGO only, so a demo
 * can grade FAILED_TO_YIELD while, on screen, the rider is never touched by the
 * manoeuvre. Replays the recorded ego pose through a fresh traffic system +
 * director (the same wiring the recorder runs; the pipeline is deterministic
 * and driven by the player pose alone) and reads the staged rider back.
 */
/** The staged rider's authored cruise, m/s (templates-vru VU_CYCLIST). */
const CYCLIST_CRUISE_MPS = 3.0;

function riderUnder(trace: ScenarioTrace): {
  peakSpeedMps: number;
  minSpeedAfterPeakMps: number;
  minSeparationM: number;
} {
  const traffic = createTrafficSystem(district as TrafficDistrict, {
    seed: 7,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  const staged = [...(SC_VU_CYCLIST_HOOK.staged ?? [])] as StagedEventSpec[];
  const director = createScenarioDirector(staged, traffic, { seed: 7 });
  const dt = 1 / 60;
  const pt = createTracePoint();
  let peakSpeedMps = 0;
  let minSpeedAfterPeakMps = Infinity;
  let minSeparationM = Infinity;
  for (let t = 0; t <= trace.meta.durationSec; t += dt) {
    sampleAt(trace, t, pt);
    traffic.update(dt, {
      signalPhase: () => "green",
      playerPos: { x: pt.x, y: pt.y },
      playerSpeedKmh: Math.abs(pt.speedKmh),
      playerHeadingDeg: pt.headingDeg,
    });
    director.step({
      tSec: t,
      dtSec: dt,
      x: pt.x,
      y: pt.y,
      speedKmh: Math.abs(pt.speedKmh),
      headingDeg: pt.headingDeg,
      brakePedal: pt.brakeOn ? 1 : 0,
      tickEvents: [],
    });
    const rider = traffic.staged("sc-vu-cyclist");
    if (!rider) continue;
    if (rider.speedMps > peakSpeedMps) peakSpeedMps = rider.speedMps;
    // Only meaningful once the rider has REACHED cruise: the post-release ramp
    // climbs through every lower speed and would otherwise read as a slowdown.
    if (peakSpeedMps >= CYCLIST_CRUISE_MPS && rider.speedMps < minSpeedAfterPeakMps) {
      minSpeedAfterPeakMps = rider.speedMps;
    }
    const d = Math.hypot(pt.x - rider.x, pt.y - rider.y);
    if (d < minSeparationM) minSeparationM = d;
  }
  return { peakSpeedMps, minSpeedAfterPeakMps, minSeparationM };
}

describe("sc-vu-cyclist-hook — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns YIELDED_TO_PRIORITY", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("YIELDED_TO_PRIORITY");
  });

  it("drives the approach, yields, then turns right onto the south stem with Bulgarian annotations", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    // Ended down the south stem (a completed right turn), not still eastbound.
    expect(last.y).toBeLessThan(-45);
    expect(Math.abs(last.x - -4.06)).toBeLessThan(1.5); // in the southbound lane center
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-vu-cyclist-hook — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Завой пред велосипедиста“: exactly FAILED_TO_YIELD, never a turn/follow code", () => {
    const drive = drives.get("mistake-hook")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_VU_CYCLIST_HOOK.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("TURN_WITHOUT_INDICATOR");
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
  });

  it("„Завой без оглеждане“: exactly FAILED_TO_YIELD, never a turn/follow code", () => {
    const drive = drives.get("mistake-no-look")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_VU_CYCLIST_HOOK.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("TURN_WITHOUT_INDICATOR");
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
  });

  it("„Отрязване на велосипедиста в завоя“: exactly FAILED_TO_YIELD, never a turn/follow code", () => {
    const drive = drives.get("mistake-forced-brake")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_VU_CYCLIST_HOOK.mistakes[2].codeRefs].sort());
    // The left-biased overtaking line exists to keep the rider outside
    // leadGapFor's 4 m corridor: if it ever drifts back in-lane this fires.
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    expect(codes).not.toContain("TURN_WITHOUT_INDICATOR");
    // The right indicator is lit before the turn and never a left one — the
    // founder's other complaint about the mis-mapped clip was a car showing a
    // LEFT signal under a right-turn question.
    const signals = drive.trace.events.filter((e) => e.kind === "signal-on");
    expect(signals.map((e) => e.detail)).toEqual(["right"]);
  });
});

/**
 * THE PICTURE GATE (founder brief, 2026-07-28) — a right-hook reel has to SHOW
 * the right hook, not merely grade it. THEO-4: the visual IS the explanation.
 */
describe("sc-vu-cyclist-hook — the rider is really cut off (the picture gate)", () => {
  it("„Отрязване на велосипедиста“ forces the cyclist to brake hard — without ever touching him", () => {
    const rider = riderUnder(drives.get("mistake-forced-brake")!.trace);
    // He was cruising…
    expect(rider.peakSpeedMps).toBeGreaterThan(2.9);
    // …and the turn across his line made him stop. (Measured: 3.00 → 0.00 m/s.)
    expect(rider.minSpeedAfterPeakMps).toBeLessThan(0.5);
    // A NEAR-MISS, not a crash — the founder's ruling on the train reel. The
    // runner's contact radius is 2.2 m; measured closest approach ≈ 4.26 m.
    expect(rider.minSeparationM).toBeGreaterThan(3.5);
  });

  it("the shadow never disturbs the rider — it waits, so he keeps his speed", () => {
    const rider = riderUnder(drives.get("shadow-correct")!.trace);
    expect(rider.peakSpeedMps).toBeGreaterThan(2.9);
    expect(rider.minSpeedAfterPeakMps).toBeGreaterThan(2.9);
    expect(rider.minSeparationM).toBeGreaterThan(3.5);
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
    const again = recordScVuCyclistDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_VU_CYCLIST_HOOK.shadow, ...SC_VU_CYCLIST_HOOK.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_VU_CYCLIST_HOOK.shadow.path, ...SC_VU_CYCLIST_HOOK.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
