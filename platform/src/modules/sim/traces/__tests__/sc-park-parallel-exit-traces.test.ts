/**
 * Trace gates — sc-park-parallel-exit (doc 76 §5/§9; the doc 86 D11 parking
 * deepening, lane 15): leaving a kerbside slot.
 *
 *  1. SHADOW: the room-buying reverse + a 40° left arc replays through the
 *     PRODUCTION stack with ZERO violations and leaves the slot aligned in the
 *     lane — the proof that the taught order (back up FIRST, then swing)
 *     actually clears both neighbours from a start pose 0.63 m off the car in
 *     front.
 *  2. MISTAKE DEMOS: a token metre back instead of three puts the swing through
 *     the front car's rear corner (COLLISION, detail „vehicle", creep speed);
 *     and the indicator-without-a-look demo — same room, same lamp, no glance —
 *     meets the cyclist filtering past (COLLISION, detail „cyclist").
 *  3. COMMITTED FILES: content/traces/sc-park-parallel-exit/*.trace.json ARE the
 *     recordings of these scripts, byte-for-byte, with public copies.
 *
 * RE-RECORD (after ANY change to the scripts, recorder, district or rules):
 *
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-park-parallel-exit-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_PARK_PARALLEL_EXIT } from "../../lessons/scenario/templates-parking";
import { parkingObservationFromTrace } from "../../lessons/scenario/observation";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { createTracePoint } from "../types";
import { sampleAt } from "../sample";
import {
  recordScParkParallelExitDrive,
  type ScParkParallelExitTraceName,
} from "../scParkParallelExit";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const CONTENT_DIR = path.join(REPO_ROOT, "content", "traces", "sc-park-parallel-exit");
const PUBLIC_DIR = path.join(REPO_ROOT, "platform", "public", "traces", "sc-park-parallel-exit");
const RECORD = process.env.RECORD_TRACES === "1";

const district: unknown = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "lot-par-v1.json"), "utf-8"),
);

const NAMES: ScParkParallelExitTraceName[] = [
  "shadow-correct",
  "mistake-no-room",
  "mistake-no-look",
];

const drives = new Map<ScParkParallelExitTraceName, RecordedDrive>(
  NAMES.map((name) => [name, recordScParkParallelExitDrive(district, name)]),
);

function violationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

describe("sc-park-parallel-exit — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations — the bought room clears BOTH neighbours", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("buys the room first: it reverses to within a metre of the rear car", () => {
    const reversing = shadow.trace.samples.filter((s) => s.gear === -1);
    expect(reversing.length).toBeGreaterThan(10);
    // The rear neighbour's rect ends at y = −4.25; the hero half-length is
    // 2.02, so „almost touching" is a centre around y = −1.4.
    const deepest = Math.min(...reversing.map((s) => s.y));
    expect(deepest).toBeLessThan(-1.2);
    expect(deepest).toBeGreaterThan(-2.0);
  });

  it("ends aligned in the lane, past the car in front (the §5 completion pose)", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    // The front neighbour's rect ends at y = 8.75; the drive-away checkpoint
    // is at y = 11 and the shadow runs past it to y ≈ 22, back on the lane line.
    expect(last.y).toBeGreaterThan(20);
    expect(Math.abs(last.x - 4.0625)).toBeLessThan(0.3);
    const headingOff = Math.abs(((last.headingDeg + 180) % 360) - 180);
    expect(headingOff).toBeLessThan(4);
  });

  it("never crosses to the wrong side — the lane detectors can never arm", () => {
    // |laneOffset| > 3.25 m ⇔ x < 0.81 on this road; the whole drill lives east
    // of the lane centre, so the envelope has a 3+ m margin at every sample.
    expect(Math.min(...shadow.trace.samples.map((s) => s.x))).toBeGreaterThan(3.5);
  });

  it("scores BOTH authored observation moments through the production mapper", () => {
    const moments = SC_PARK_PARALLEL_EXIT.rubric!.observation!.moments;
    const obs = parkingObservationFromTrace(shadow.trace, moments);
    expect(obs).not.toBeNull();
    expect([...obs!.observedMomentIds].sort()).toEqual(moments.map((m) => m.id).sort());
  });
});

describe("sc-park-parallel-exit — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Изнасяне без купено място“: the front car's corner, exact codes", () => {
    const drive = drives.get("mistake-no-room")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PARK_PARALLEL_EXIT.mistakes[0].codeRefs].sort());
    const collision = drive.ruleEvents.find(
      (e) => e.kind === "violation" && e.code === "COLLISION",
    )!;
    expect(collision.kind === "violation" ? collision.detail : undefined).toBe("vehicle");
    const at = createTracePoint();
    sampleAt(drive.trace, collision.t, at);
    expect(Math.abs(at.speedKmh)).toBeGreaterThan(0.5);
    expect(Math.abs(at.speedKmh)).toBeLessThan(6);
    // Forward gear and NORTH of the slot centre: it is the car in FRONT that
    // the un-bought swing eats, exactly as the copy says.
    expect(at.gear).toBeGreaterThanOrEqual(0);
    expect(at.y).toBeGreaterThan(0);
  });

  it("„Ляв мигач без поглед“: the cyclist, exact codes, and the lamp WAS on", () => {
    const drive = drives.get("mistake-no-look")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PARK_PARALLEL_EXIT.mistakes[1].codeRefs].sort());
    const collision = drive.ruleEvents.find(
      (e) => e.kind === "violation" && e.code === "COLLISION",
    )!;
    expect(collision.kind === "violation" ? collision.detail : undefined).toBe("cyclist");
    // The demo's whole point: the indicator was given and it changed nothing.
    const signalOn = drive.trace.events.find((e) => e.kind === "signal-on");
    expect(signalOn).toBeDefined();
    expect(signalOn!.tSec).toBeLessThan(collision.t);
    // …and the ONE check that would have found him never happens: the driver
    // looks back before reversing (t = 0) and then never looks LEFT at all,
    // nor anywhere between the indicator and the contact. That is the whole
    // difference between this demo and the shadow.
    expect(drive.trace.events.filter((e) => e.kind === "glance-left")).toEqual([]);
    const glancesAfterSignal = drive.trace.events.filter(
      (e) => e.kind.startsWith("glance-") && e.tSec >= signalOn!.tSec,
    );
    expect(glancesAfterSignal).toEqual([]);
  });
});

describe("committed trace files — the determinism law", () => {
  for (const name of NAMES) {
    const contentFile = path.join(CONTENT_DIR, `${name}.trace.json`);
    const publicFile = path.join(PUBLIC_DIR, `${name}.trace.json`);

    it(`${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
      const serialized = serializeScenarioTrace(drives.get(name)!.trace) + "\n";
      if (RECORD) {
        mkdirSync(CONTENT_DIR, { recursive: true });
        mkdirSync(PUBLIC_DIR, { recursive: true });
        writeFileSync(contentFile, serialized);
        writeFileSync(publicFile, serialized);
      }
      expect(existsSync(contentFile), `${contentFile} missing — run the RECORD_TRACES tool`).toBe(true);
      expect(existsSync(publicFile), `${publicFile} missing — run the RECORD_TRACES tool`).toBe(true);
      expect(readFileSync(contentFile, "utf-8")).toBe(serialized);
      expect(readFileSync(publicFile, "utf-8")).toBe(readFileSync(contentFile, "utf-8"));
      const parsed = parseScenarioTrace(JSON.parse(readFileSync(contentFile, "utf-8")));
      expect(parsed).not.toBeNull();
      expect(parsed!.meta.scenarioId).toBe("sc-park-parallel-exit");
    });
  }

  it("recording is deterministic: a second run serializes identically", () => {
    const again = recordScParkParallelExitDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    expect(SC_PARK_PARALLEL_EXIT.shadow.path).toBe(
      "content/traces/sc-park-parallel-exit/shadow-correct.trace.json",
    );
    expect(SC_PARK_PARALLEL_EXIT.shadow.pending).not.toBe(true);
    const paths = SC_PARK_PARALLEL_EXIT.mistakes.map((m) => m.traceRef.path);
    expect(paths).toEqual([
      "content/traces/sc-park-parallel-exit/mistake-no-room.trace.json",
      "content/traces/sc-park-parallel-exit/mistake-no-look.trace.json",
    ]);
    for (const m of SC_PARK_PARALLEL_EXIT.mistakes) expect(m.traceRef.pending).not.toBe(true);
  });
});
