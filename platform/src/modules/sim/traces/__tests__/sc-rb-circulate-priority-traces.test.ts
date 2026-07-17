/**
 * Trace gate — „В кръга си с предимство“ (sc-rb-circulate-priority on the
 * REUSED rb-mini-v1 district), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays through the production stack with ZERO violations — the
 *      empty ring is entered without a stop, circulated flat at 12 km/h on one
 *      line past the east mouth, and left by the signalled north exit.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs — the approach-arm
 *      panic stop grades only HARSH_BRAKING_NO_CAUSE, and the wandering ring
 *      line grades only POOR_LANE_KEEPING (never TURN_WITHOUT_INDICATOR on top:
 *      the drift's curvature is authored to stay under the 55°/3 s window).
 *   3. THE STAGED WAITER NEVER MOVES — the whole lesson rests on that car
 *      standing at its west-mouth line for the entire drill, so it is asserted,
 *      not assumed.
 *   4. COMMITTED FILES ARE the recordings, byte-for-byte, with public copies.
 *
 * Geometry the drills depend on is asserted against the generated district in
 * world/__tests__/rb-mini-district.test.ts (the circulate-priority battery).
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-rb-circulate-priority-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_RB_CIRCULATE_PRIORITY } from "../../lessons/scenario/templates-roundabout";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScRbCirculatePriorityDrive,
  type ScRbCirculatePriorityTraceName,
} from "../scRbCirculatePriority";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const NAMES: ScRbCirculatePriorityTraceName[] = [
  "shadow-correct",
  "mistake-panic-brake",
  "mistake-wandering-line",
];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
/** Circulation angle of a district point, degrees CCW from the SOUTH node
 *  (φ 90 = east, 180 = north, 270 = west) — the trace scripts' own convention. */
function phiDeg(x: number, y: number): number {
  const d = (Math.atan2(x, -y) * 180) / Math.PI;
  return d < 0 ? d + 360 : d;
}

const district = loadDistrict("rb-mini-v1");
const drives = new Map<ScRbCirculatePriorityTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScRbCirculatePriorityDrive(district, n)]),
);

describe("sc-rb-circulate-priority — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("never stops: the empty ring is entered and circulated without coming to rest", () => {
    // The lesson's whole claim. From the first metre of the approach to the exit
    // the car is always moving — an empty roundabout is not a stop sign, and a
    // stop inside the ring is the fault this template exists to prevent.
    const rolling = shadow.trace.samples.filter((s) => s.tSec > 1 && s.tSec < shadow.trace.samples.at(-1)!.tSec - 2);
    for (const s of rolling) expect(s.speedKmh, `t=${s.tSec}`).toBeGreaterThan(3);
  });

  it("holds ONE ring pace and ONE ring line past the east mouth", () => {
    // The ring PROPER: the arc between the entry chord's landing (φ = 55) and
    // the exit peel (φ = 150), with both joints given a few degrees of clearance
    // so the blends in and out are judged by their own steps, not this one. The
    // window spans the east mouth (φ = 90) — the spoke this drill rides past.
    const onRing = shadow.trace.samples.filter((s) => {
      const p = phiDeg(s.x, s.y);
      return p >= 62 && p <= 145;
    });
    expect(onRing.length).toBeGreaterThan(20);
    for (const s of onRing) {
      // One line: within the ring lane's centre band (the POOR_LANE_KEEPING
      // tolerance is |laneOffsetM| = 3.25 ⇒ radius 18 ± 3.25).
      expect(Math.abs(Math.hypot(s.x, s.y) - 18), `t=${s.tSec}`).toBeLessThan(3);
      // One pace: never over the ring's turn-detector ceiling, never stalled.
      expect(s.speedKmh, `t=${s.tSec}`).toBeLessThan(20);
      expect(s.speedKmh, `t=${s.tSec}`).toBeGreaterThan(4);
    }
  });

  it("signals RIGHT before the north exit, leaves by it, and cancels, with Bulgarian annotations", () => {
    const signalOn = shadow.trace.events.find((e) => e.kind === "signal-on");
    expect(signalOn).toBeDefined();
    expect(signalOn!.detail).toBe("right");
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(50); // north arm, well beyond the exit radius
    expect(Math.abs(last.x - 4.06)).toBeLessThan(1.5); // outbound north lane center
    expect(last.indicator).toBe("off"); // cancelled after the exit
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-rb-circulate-priority — the staged waiter never moves (the lesson's premise)", () => {
  for (const name of NAMES) {
    it(`${name}: the west-mouth car never claims the ring (encounter never resolves)`, () => {
      // The PriorityFromRightRunner holds its actor with `cruise speedMps: 0`
      // for the whole drill and never reaches its triggered phase — so it
      // records NO outcome. A resolution here would mean the car committed
      // through the mouth (the player came within PRIORITY_COMMIT_PLAYER_M of
      // it), which would invert the lesson and is exactly what the west-mouth
      // placement buys ~9 m of margin against.
      expect(drives.get(name)!.outcomes.map((o) => o.eventId)).not.toContain("sc-rbc-waiter");
    });
  }
});

describe("sc-rb-circulate-priority — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Паническо спиране заради чакащия на входа“: exactly HARSH_BRAKING_NO_CAUSE", () => {
    const drive = drives.get("mistake-panic-brake")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_RB_CIRCULATE_PRIORITY.mistakes[0].codeRefs].sort());
    // ONE stab, one fault: the taught mistake is never double-counted.
    expect(violationCodes(drive).filter((c) => c === "HARSH_BRAKING_NO_CAUSE")).toHaveLength(1);
    // The stop really happens on the APPROACH ARM, clear of the ring's
    // junction-proximity armor (> 35 m from the south node at (0, −18)) — the
    // structural reason this demo cannot live inside the ring.
    const hb = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "HARSH_BRAKING_NO_CAUSE")!;
    const at = drive.trace.samples.reduce((b, s) =>
      Math.abs(s.tSec - hb.t) < Math.abs(b.tSec - hb.t) ? s : b,
    );
    expect(Math.hypot(at.x - 0, at.y + 18)).toBeGreaterThan(35);
    // …and the car really comes to a dead stop out on the open arm.
    expect(drive.trace.samples.some((s) => s.speedKmh < 0.5 && s.y < -55 && s.y > -70)).toBe(true);
  });

  it("„Колебливо криволичене в пръстена“: exactly POOR_LANE_KEEPING — the exit stays announced", () => {
    const drive = drives.get("mistake-wandering-line")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_RB_CIRCULATE_PRIORITY.mistakes[1].codeRefs].sort());
    expect(violationCodes(drive).filter((c) => c === "POOR_LANE_KEEPING")).toHaveLength(1);
    // The drift is the ONLY fault: the ring pace never trips the turn detector
    // and the exit is signalled, so neither code contaminates the demo.
    expect(codes).not.toContain("TURN_WITHOUT_INDICATOR");
    expect(codes).not.toContain("FAILED_TO_YIELD");
    expect(drive.trace.events.find((e) => e.kind === "signal-on")?.detail).toBe("right");
    // The car really rides the lane's outer edge for a sustained stretch (the
    // detector's 3 s at |laneOffsetM| > 3.25 ⇒ radius > 21.25).
    const wide = drive.trace.samples.filter((s) => Math.hypot(s.x, s.y) > 21.25);
    expect(wide.length).toBeGreaterThan(20); // > 1 s of 20 Hz samples, comfortably
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", "sc-rb-circulate-priority");
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", "sc-rb-circulate-priority");

  for (const name of NAMES) {
    it(`sc-rb-circulate-priority/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe("sc-rb-circulate-priority");
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    for (const name of NAMES) {
      const again = recordScRbCirculatePriorityDrive(district, name);
      expect(serializeScenarioTrace(again.trace), name).toBe(
        serializeScenarioTrace(drives.get(name)!.trace),
      );
    }
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_RB_CIRCULATE_PRIORITY.shadow, ...SC_RB_CIRCULATE_PRIORITY.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith("content/traces/sc-rb-circulate-priority/")).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/sc-rb-circulate-priority/${n}.trace.json`);
    expect([
      SC_RB_CIRCULATE_PRIORITY.shadow.path,
      ...SC_RB_CIRCULATE_PRIORITY.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
