/**
 * Trace gate — „Изпреварват те — не ускорявай" (sc-ov-being-overtaken on
 * ov-oncoming-v1 by day; doc 72 OV-10 „Ускоряване докато те изпреварват" ×
 * OV-12 „Возене по линията"), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW holds 70, eases 5 km/h off onto the right of its own lane while
 *      the overtaker passes → ZERO violations + CLEAN_DRIVING, and the actor
 *      resolves "yielded" (the runner's learn-only read of the taught
 *      response). On this 1+1 the bank flip renumbers no lane, so NO
 *      lane-change code (violation or SAFE_LANE_CHANGE) can exist.
 *   2. MISTAKE DEMOS grade EXACTLY their codes, never leaking into each other:
 *      the throttle-up takes no lane code (it holds its lane centre), and the
 *      left drift takes no speed code (it never passes 90).
 *   3. THE TRAP IS KINEMATIC, NOT NARRATED — the headline assertion of this
 *      gate: the overtaker resolves in BOTH lawful drives and NEVER in the
 *      throttle-up, because 25 m/s (its authored 90 km/h pass) cannot get ahead
 *      of the player's 99.4. „Ускориш ли, оставяш изпреварващия в капан на
 *      насрещното платно" (q-manevri-015) is a fact of the sim here, not a
 *      claim the card makes over a scripted fake.
 *   4. COMMITTED FILES under content/traces/sc-ov-being-overtaken/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ov-being-overtaken-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_OV_BEING_OVERTAKEN } from "../../lessons/scenario/templates-lanes2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScOvBeingOvertakenDrive,
  type ScOvBeingOvertakenTraceName,
} from "../scOvBeingOvertaken";
import type { RecordedDrive } from "../recorder";
import type { SimTick } from "../../rules";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ov-being-overtaken";
const NAMES: ScOvBeingOvertakenTraceName[] = [
  "shadow-correct",
  "mistake-accelerating",
  "mistake-drifting-left",
];

/** The posted limit on ov-oncoming-v1 and the shipped speeding band around it:
 *  gracedLimit = 90 × (1 + speedingGraceRatio 0.1) = 99; dangerousAbove =
 *  90 + dangerousSpeedOverKmh 10 = 100. The minor code lives in (99, 100]. */
const LIMIT_KMH = 90;
const GRACED_KMH = 99;
const DANGEROUS_KMH = 100;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}
/** The overtaker's resolution, or null if it never completed its pass. */
function overtakerOutcome(d: RecordedDrive) {
  return d.outcomes.find((o) => o.eventId === "sc-ovbo-overtaker") ?? null;
}

const district = loadDistrict("ov-oncoming-v1");
/** Peak speed + peak |laneOffsetM| per drive — the band/geometry proofs. */
const peaks = new Map<ScOvBeingOvertakenTraceName, { speed: number; offset: number }>();
const drives = new Map<ScOvBeingOvertakenTraceName, RecordedDrive>(
  NAMES.map((n) => {
    const peak = { speed: 0, offset: 0 };
    const drive = recordScOvBeingOvertakenDrive(district, n, {
      onTick: (tick: SimTick) => {
        peak.speed = Math.max(peak.speed, tick.speedKmh);
        peak.offset = Math.max(peak.offset, tick.laneOffsetM);
      },
    });
    peaks.set(n, peak);
    return [n, drive];
  }),
);

describe("sc-ov-being-overtaken — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("holds its speed and its right: ZERO violations + CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });
  it("the overtaker completes its pass and reads the taught response as 'yielded'", () => {
    // easeKmh 4 against the shadow's 5 km/h lift off 70 — the runner's
    // learn-only measurement (nothing grades off it; doc 72 FO-07 / A12).
    const outcome = overtakerOutcome(shadow);
    expect(outcome).not.toBeNull();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
  });
  it("never approaches the limit — the drill is the response, not the speed", () => {
    expect(peaks.get("shadow-correct")!.speed).toBeLessThan(LIMIT_KMH);
    expect(violationCodes(shadow)).not.toContain("SPEEDING_OVER_LIMIT");
  });
  it("stays right of its own lane centre: never rides the осева", () => {
    // Positive laneOffsetM = left. The shadow's hug sits at x = 5.6 ⇒ offset
    // ≈ −1.54, so the peak LEFT offset is the spawn's own 0 — it never leans
    // toward the oncoming side at all, let alone past the 3.25 m band.
    expect(peaks.get("shadow-correct")!.offset).toBeLessThan(1);
    expect(violationCodes(shadow)).not.toContain("CENTER_LINE_TOUCHED");
    expect(violationCodes(shadow)).not.toContain("POOR_LANE_KEEPING");
  });
  it("the 1+1 bank flip renumbers nothing: no lane-change code of ANY kind exists", () => {
    expect(violationCodes(shadow)).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    expect(violationCodes(shadow)).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
    expect(commendationCodes(shadow)).not.toContain("SAFE_LANE_CHANGE");
  });
  it("carries Bulgarian annotations for the ghost narration", () => {
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ov-being-overtaken — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  it("mistake-accelerating: exactly SPEEDING_OVER_LIMIT + COLLISION, once each", () => {
    const drive = drives.get("mistake-accelerating")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_OV_BEING_OVERTAKEN.mistakes[0].codeRefs].sort());
    expect(violationCodes(drive).filter((c) => c === "SPEEDING_OVER_LIMIT")).toHaveLength(1);
    expect(violationCodes(drive).filter((c) => c === "COLLISION")).toHaveLength(1);
    // The fault is the THROTTLE, not the wheel: it holds its lane centre.
    expect(codes).not.toContain("CENTER_LINE_TOUCHED");
    expect(codes).not.toContain("POOR_LANE_KEEPING");
  });
  it("mistake-accelerating: the speed lands INSIDE the minor band, never the dangerous tier", () => {
    // The whole demo hinges on a 1 km/h window: on a 90 limit the minor code
    // lives in (99, 100] and anything above is SPEEDING_DANGEROUS — a different
    // lesson. The script servo clamps to target, so the hold is exact.
    const peak = peaks.get("mistake-accelerating")!.speed;
    expect(peak).toBeGreaterThan(GRACED_KMH);
    expect(peak).toBeLessThanOrEqual(DANGEROUS_KMH);
    expect(violationCodes(drives.get("mistake-accelerating")!)).not.toContain("SPEEDING_DANGEROUS");
  });
  it("mistake-accelerating: the overtaker is TRAPPED — its pass never resolves", () => {
    // The headline: 25 m/s cannot get ahead of 27.6 m/s. The same actor spec
    // that resolves in both lawful drives simply never completes here, so
    // „оставяш изпреварващия в капан на насрещното платно" is the sim's own
    // arithmetic. The COLLISION above is the authored way out of that trap.
    expect(overtakerOutcome(drives.get("mistake-accelerating")!)).toBeNull();
    expect(overtakerOutcome(drives.get("shadow-correct")!)).not.toBeNull();
    expect(overtakerOutcome(drives.get("mistake-drifting-left")!)).not.toBeNull();
  });
  it("mistake-drifting-left: exactly CENTER_LINE_TOUCHED, once, nothing else", () => {
    const drive = drives.get("mistake-drifting-left")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_OV_BEING_OVERTAKEN.mistakes[1].codeRefs].sort());
    expect(violationCodes(drive).filter((c) => c === "CENTER_LINE_TOUCHED")).toHaveLength(1);
    // The fault is the WHEEL, not the throttle: speed stays legal throughout.
    expect(peaks.get("mistake-drifting-left")!.speed).toBeLessThan(LIMIT_KMH);
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("COLLISION");
  });
  it("mistake-drifting-left: OV-12 bills the SPECIFIC code — 'one act, one code'", () => {
    // The drift rides x ≈ 0.3 ⇒ laneOffsetM ≈ 3.76, past the 3.25 m
    // laneKeepMaxOffsetM, indicator off, on the own bank ⇒ centerLineCond arms
    // and the engine STANDS DOWN the generic lane-keep clock (`!centerLineCond`,
    // rules/engine.ts stage 2b). POOR_LANE_KEEPING — doc 72's older note for
    // OV-12 — is therefore not merely absent, it is unreachable by this act;
    // the code that fires is titled „Настъпване на осевата линия", which is the
    // Bulgarian name doc 72 gives OV-12 itself.
    expect(peaks.get("mistake-drifting-left")!.offset).toBeGreaterThan(3.25);
    expect(violationCodes(drives.get("mistake-drifting-left")!)).not.toContain(
      "POOR_LANE_KEEPING",
    );
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
    const again = recordScOvBeingOvertakenDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });
  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_OV_BEING_OVERTAKEN.shadow, ...SC_OV_BEING_OVERTAKEN.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_OV_BEING_OVERTAKEN.shadow.path,
      ...SC_OV_BEING_OVERTAKEN.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});

describe("pinned geometry + the staged hinge — the template copies match the committed map", () => {
  it("ov-oncoming-v1 meta.scenario mirrors the template recipe (lane centers, no zones)", () => {
    const d = district as {
      meta: {
        zonesVersion?: number;
        scenario?: {
          laneCenterRightM?: number;
          laneCenterOncomingM?: number;
          params?: { lengthM?: number; maxspeedKmh?: number };
        };
      };
      zones?: unknown[];
    };
    expect(d.meta.zonesVersion).toBeUndefined();
    expect(d.zones).toBeUndefined(); // dashed осева by design — no М1 span
    expect(d.meta.scenario?.laneCenterRightM).toBe(4.06);
    expect(d.meta.scenario?.laneCenterOncomingM).toBe(-4.06);
    expect(d.meta.scenario?.params?.lengthM).toBe(SC_OV_BEING_OVERTAKEN.map.params.lengthM);
    expect(d.meta.scenario?.params?.maxspeedKmh).toBe(SC_OV_BEING_OVERTAKEN.map.params.maxspeedKmh);
    expect(d.meta.scenario?.params?.maxspeedKmh).toBe(LIMIT_KMH);
  });
  it("the template is authored DRY by day on every rung — no night, no physics", () => {
    expect(SC_OV_BEING_OVERTAKEN.conditions?.weather).toBe("dry");
    expect(SC_OV_BEING_OVERTAKEN.conditions?.night).toBeUndefined();
    expect(SC_OV_BEING_OVERTAKEN.physics).toBeUndefined();
    expect(SC_OV_BEING_OVERTAKEN.levels.map((l) => l.level)).toEqual([1, 2, 3, 4]);
  });
  it("the overtaker's pass speed IS the posted limit — the hinge of both outcomes", () => {
    // If this drifts, the whole template silently changes meaning: a faster
    // pass would complete against the throttle-up (no trap), a slower one
    // would fail against the lawful shadow (no pass at all).
    const overtaker = (SC_OV_BEING_OVERTAKEN.staged ?? []).find(
      (s) => s.kind === "rearTailgater",
    ) as { passSpeedMps: number; passShiftM: number; easeKmh: number } | undefined;
    expect(overtaker).toBeDefined();
    expect(overtaker!.passSpeedMps * 3.6).toBeCloseTo(LIMIT_KMH, 6);
    // The pass runs one full lane pitch LEFT — onto the oncoming bank.
    expect(overtaker!.passShiftM).toBeCloseTo(-8.125, 6);
    // The shadow lifts 5 km/h off 70; easeKmh must sit under that to latch.
    expect(overtaker!.easeKmh).toBeLessThan(5);
  });
});
