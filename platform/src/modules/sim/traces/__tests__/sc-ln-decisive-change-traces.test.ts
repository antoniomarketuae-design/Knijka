/**
 * Trace gate — „Решително престрояване в поток" (sc-ln-decisive-change on
 * ln-v1, OV-01/OV-02), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays through the production stack with ZERO violations and
 *      earns SAFE_LANE_CHANGE (огледало → мигач → рамо → волан, all inside the
 *      rule lookback windows) — AFTER genuinely waiting the target-lane car
 *      out, which the choreography asserts rather than narrates.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs — blind-spot
 *      isolates LANE_CHANGE_WITHOUT_MIRROR_CHECK + COLLISION (the indicator was
 *      fine), half-merge isolates LANE_CHANGE_WITHOUT_INDICATOR +
 *      POOR_LANE_KEEPING (the car was seen and waited out).
 *   3. COMMITTED FILES ARE the recordings, byte-for-byte, with public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ln-decisive-change-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_LN_DECISIVE_CHANGE } from "../../lessons/scenario/templates-lanes3";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScLnDecisiveChangeDrive, type ScLnDecisiveChangeTraceName } from "../scLnDecisiveChange";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const NAMES: ScLnDecisiveChangeTraceName[] = [
  "shadow-correct",
  "mistake-blind-spot",
  "mistake-half-merge",
];

/** ln-v1's drawn lane boundary — the laneId frontier the lane-change
 *  adjudicator grades on. */
const X_SPLIT = 8.125;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}
/** When the drive first crossed x = 8.125 right→left (into the target lane), s. */
function crossingTSec(d: RecordedDrive): number {
  const s = d.trace.samples;
  for (let i = 1; i < s.length; i++) {
    if (s[i - 1].x > X_SPLIT && s[i].x <= X_SPLIT) return s[i].tSec;
  }
  throw new Error("drive never crossed the lane boundary");
}
/** The target car's own resolution (pass complete, passAheadM ahead), s. */
function targetPassTSec(d: RecordedDrive): number {
  const o = d.outcomes.find((x) => x.eventId === "sc-lndc-target");
  if (!o) throw new Error("the staged target car never resolved");
  return o.tSec;
}

const district = loadDistrict("ln-v1");
const drives = new Map<ScLnDecisiveChangeTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScLnDecisiveChangeDrive(district, n)]),
);

describe("sc-ln-decisive-change — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns SAFE_LANE_CHANGE", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("SAFE_LANE_CHANGE");
  });

  it("performs the ritual: left glance + left indicator before crossing, ending in the LEFT lane", () => {
    const kinds = shadow.trace.events.map((e) => e.kind);
    // Three left glances: the one that READS the target car, plus the maneuver's
    // own огледало + рамо pair (the rubric's two observation moments).
    expect(kinds.filter((k) => k === "glance-left").length).toBeGreaterThanOrEqual(3);
    const signalOn = shadow.trace.events.find((e) => e.kind === "signal-on");
    expect(signalOn?.detail).toBe("left");
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(Math.abs(last.x - 4.06)).toBeLessThan(1.5); // ends in the left-lane center
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("the WAIT is real: the target car finishes its pass a full 8 s before the wheel moves", () => {
    // The template's whole reason to exist. A shadow that changed lane while the
    // car was still alongside would earn SAFE_LANE_CHANGE all the same (the
    // engine grades the ritual, not the gap) — so the demonstration's honesty
    // lives HERE, in the choreography, or nowhere.
    const cross = crossingTSec(shadow);
    const pass = targetPassTSec(shadow);
    expect(cross - pass).toBeGreaterThan(8);
  });

  it("the decisive glance + indicator arm inside BOTH lookback windows", () => {
    // indicatorLookbackSec = 3, mirrorLookbackSec = 5 (rules/engine.ts cfg).
    // Pinning the measured margin is what stops a future pacing tweak from
    // silently sliding the arming out of the window and gutting the §5 gate.
    const cross = crossingTSec(shadow);
    const signalOn = shadow.trace.events.find((e) => e.kind === "signal-on")!;
    const lastLeftGlance = [...shadow.trace.events]
      .filter((e) => e.kind === "glance-left" && e.tSec <= cross)
      .pop()!;
    expect(cross - signalOn.tSec).toBeGreaterThan(0);
    expect(cross - signalOn.tSec).toBeLessThan(3);
    expect(cross - lastLeftGlance.tSec).toBeLessThan(5);
  });
});

describe("sc-ln-decisive-change — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Престрояване върху колата в мъртвата зона“: exactly MIRROR_CHECK + COLLISION (the indicator was fine)", () => {
    const drive = drives.get("mistake-blind-spot")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_LN_DECISIVE_CHANGE.mistakes[0].codeRefs].sort());
    // Signalling without looking IS the demo — the indicator must never grade.
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
  });

  it("„в мъртвата зона“ means REAR-mirror only: the left blind spot is never checked", () => {
    // The engine's glance channel is DIRECTION-keyed, so this is exactly what
    // the fault name claims: the driver did look — in the mirror that cannot
    // see the alongside car. If a left glance ever crept in, the demo would
    // grade nothing and the card would be a lie.
    const drive = drives.get("mistake-blind-spot")!;
    const kinds = drive.trace.events.map((e) => e.kind);
    expect(kinds).toContain("glance-rear");
    expect(kinds).not.toContain("glance-left");
  });

  it("the contact is choreographed: the car is still alongside when the wheel goes over", () => {
    // The rearTailgater runner emits ZERO SimTick events by contract, so the
    // COLLISION is an AUTHORED beat. That is honest only if the geometry agrees
    // — i.e. the crossing happens BEFORE the car has passed.
    const drive = drives.get("mistake-blind-spot")!;
    expect(crossingTSec(drive)).toBeLessThan(targetPassTSec(drive));
  });

  it("„Половинчато вмъкване“: exactly LANE_CHANGE_WITHOUT_INDICATOR + POOR_LANE_KEEPING (the car was seen)", () => {
    const drive = drives.get("mistake-half-merge")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_LN_DECISIVE_CHANGE.mistakes[1].codeRefs].sort());
    // The car was SEEN and waited out — this demo's only faults are the
    // unannounced move and the uncommitted lane, so no contact and no
    // mirror-check may grade.
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
    expect(codes).not.toContain("COLLISION");
    // …and the half-taken lane is judged as lane-keeping, not as center-line
    // creep (the offset is toward the DIVIDER, not oncoming) and not as
    // hogging the left lane (it is released well under keepRightSustainSec).
    expect(codes).not.toContain("CENTER_LINE_TOUCHED");
    expect(codes).not.toContain("NOT_KEEPING_RIGHT");
    expect(drive.trace.events.some((e) => e.kind === "glance-left")).toBe(true);
    expect(drive.trace.events.some((e) => e.kind === "signal-on")).toBe(false);
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", "sc-ln-decisive-change");
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", "sc-ln-decisive-change");

  for (const name of NAMES) {
    it(`sc-ln-decisive-change/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe("sc-ln-decisive-change");
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const again = recordScLnDecisiveChangeDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_LN_DECISIVE_CHANGE.shadow, ...SC_LN_DECISIVE_CHANGE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith("content/traces/sc-ln-decisive-change/")).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/sc-ln-decisive-change/${n}.trace.json`);
    expect([
      SC_LN_DECISIVE_CHANGE.shadow.path,
      ...SC_LN_DECISIVE_CHANGE.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
