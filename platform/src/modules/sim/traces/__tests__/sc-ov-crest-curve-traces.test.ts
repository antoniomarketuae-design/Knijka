/**
 * Trace gate — „Забранено изпреварване преди било и завой" (sc-ov-crest-curve
 * on ov-crest-v1; doc 72 OV-06 ban × OV-05 corridor × SP-05 curve, ЗДвП чл. 43),
 * doc 76 §5/§9 stages 3+5:
 *   1. SHADOW follows the slow truck at ~55 through the В24 approach, brakes to
 *      the А1 advisory BEFORE the bend, holds ~40 through the whole blind arc
 *      while both oncoming cars sweep past, then passes in the legal straight →
 *      ZERO violations + CLEAN_DRIVING. On this 1+1 the bank flip renumbers no
 *      lane, so NO lane-change code (violation or SAFE_LANE_CHANGE) can exist.
 *   2. THE SHADOW'S PATIENCE IS GEOMETRIC, NOT NARRATED: it never once occupies
 *      the oncoming bank while the В24 span is armed, and every metre it DOES
 *      spend there is span-free road past the ban. „Изчакай до правата" is a
 *      measured fact of this recording, not a claim the card makes.
 *   3. MISTAKE DEMOS grade EXACTLY their codes, never leaking into each other:
 *      the blind pass runs at the advisory's own grace speed (so no curve code
 *      can ride along) and the curve-speed demo never leaves its lane (so no
 *      corridor code can). Each demo bills ONE law — one act, one code.
 *   4. THE BAN SPAN CANNOT GRADE, AND THAT IS PINNED. OVERTAKING_IN_BAN_ZONE
 *      appears in NO drive: on a 1+1 laneId is 0 on both banks (locator.ts), and
 *      the detector rides a laneId delta (rules/engine.ts stage 3). This is the
 *      reason the template's §9 codes are what they are. If a future engine
 *      change makes the span gradable, THIS assert fails first — and the
 *      template gains its second code on purpose, not by accident.
 *   5. COMMITTED FILES under content/traces/sc-ov-crest-curve/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ov-crest-curve-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_OV_CREST_CURVE } from "../../lessons/scenario/templates-lanes2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScOvCrestCurveDrive, type ScOvCrestCurveTraceName } from "../scOvCrestCurve";
import type { RecordedDrive } from "../recorder";
import type { SimTick } from "../../rules";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ov-crest-curve";
const NAMES: ScOvCrestCurveTraceName[] = [
  "shadow-correct",
  "mistake-blind-pass",
  "mistake-curve-speed",
];

/** ov-crest-v1's posted limit and the shipped bands around the А1 advisory:
 *  the curve code arms above advisory + curveSpeedGraceKmh (5), and the
 *  recorder's kinematic curve cap on the inside lane (R 130.94) is
 *  √(2.4·130.94)·3.6 ≈ 63.8 km/h — the ceiling a guilty demo must record under. */
const LIMIT_KMH = 90;
const ADVISORY_KMH = 40;
const ADVISORY_GRACE_KMH = 45; // 40 + curveSpeedGraceKmh 5 — silent at/below
const RECORDER_CURVE_CAP_KMH = Math.sqrt(2.4 * 130.94) * 3.6;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("ov-crest-v1");

/** Per-drive geometry facts, measured off the production ticks. */
interface Facts {
  /** Peak speed anywhere, km/h. */
  peakKmh: number;
  /** Peak speed while the А1 advisory span is armed, km/h. */
  peakInArcKmh: number;
  /** Frames spent on the oncoming bank INSIDE the В24 span (the banned pass). */
  bannedBankFrames: number;
  /** Frames spent on the oncoming bank OUTSIDE any span (the legal pass). */
  legalBankFrames: number;
  /** Every laneId the drive ever reported. */
  laneIds: Set<number>;
  /** Tightest bumper gap to the truck the lead probe ever saw, m. */
  minLeadGapM: number;
}

const facts = new Map<ScOvCrestCurveTraceName, Facts>();
const drives = new Map<ScOvCrestCurveTraceName, RecordedDrive>(
  NAMES.map((n) => {
    const f: Facts = {
      peakKmh: 0,
      peakInArcKmh: 0,
      bannedBankFrames: 0,
      legalBankFrames: 0,
      laneIds: new Set<number>(),
      minLeadGapM: Infinity,
    };
    const drive = recordScOvCrestCurveDrive(district, n, {
      onTick: (tick: SimTick) => {
        f.peakKmh = Math.max(f.peakKmh, tick.speedKmh);
        if (tick.curveAdvisoryKmh !== undefined) f.peakInArcKmh = Math.max(f.peakInArcKmh, tick.speedKmh);
        if (tick.opposingBank === true) {
          if (tick.noOvertakeZone === true) f.bannedBankFrames++;
          else f.legalBankFrames++;
        }
        f.laneIds.add(tick.laneId);
        if (typeof tick.leadGapM === "number" && Number.isFinite(tick.leadGapM)) {
          f.minLeadGapM = Math.min(f.minLeadGapM, tick.leadGapM);
        }
      },
    });
    facts.set(n, f);
    return [n, drive];
  }),
);

describe("sc-ov-crest-curve — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("waits out the blind bend and passes in the straight: ZERO violations + CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });
  it("NEVER touches the oncoming bank while the В24 is armed — the drill, measured", () => {
    // The one fact the whole template rests on. The ban span covers 90 m of
    // approach plus the entire arc; the shadow spends none of it on the wrong
    // side of the осева, no matter how slow the truck is.
    expect(facts.get("shadow-correct")!.bannedBankFrames).toBe(0);
  });
  it("…and every metre it DOES spend there is span-free road past the ban", () => {
    // The other half of чл. 43: the ban is „не тук", not „никога". A shadow
    // that never overtook at all would satisfy the assert above and fail this
    // one — patience without the follow-through is not the lesson.
    expect(facts.get("shadow-correct")!.legalBankFrames).toBeGreaterThan(60);
  });
  it("respects the А1 envelope through the arc and the posted 90 in the straight", () => {
    const f = facts.get("shadow-correct")!;
    expect(f.peakInArcKmh).toBeLessThanOrEqual(ADVISORY_KMH + 0.5); // AT the advisory
    expect(f.peakKmh).toBeLessThan(LIMIT_KMH); // the pass is brisk, never illegal
    expect(violationCodes(shadow)).not.toContain("SPEED_TOO_FAST_FOR_CURVE");
    expect(violationCodes(shadow)).not.toContain("SPEEDING_OVER_LIMIT");
  });
  it("keeps its distance behind the truck the whole way (no following fault)", () => {
    // followGapM 38 ⇒ ~34 m of bumpers; the fire band at the drive's ~55 km/h is
    // followFireRatio 0.7 × followSafeSeconds 1.8 × 15.3 m/s ≈ 19 m.
    expect(facts.get("shadow-correct")!.minLeadGapM).toBeGreaterThan(25);
    expect(violationCodes(shadow)).not.toContain("FOLLOWING_TOO_CLOSE");
  });
  it("carries Bulgarian annotations for the ghost narration", () => {
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ov-crest-curve — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  it("mistake-blind-pass: exactly OVERTAKE_INSUFFICIENT_GAP, once", () => {
    const drive = drives.get("mistake-blind-pass")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_OV_CREST_CURVE.mistakes[0].codeRefs].sort());
    expect(violationCodes(drive).filter((c) => c === "OVERTAKE_INSUFFICIENT_GAP")).toHaveLength(1);
  });
  it("mistake-blind-pass: the gamble happens INSIDE the ban AND inside the blind arc", () => {
    // Where the excursion happens is the entire difference between this demo
    // and the shadow's lawful pass — both cross the осева, only one does it
    // where the road is hidden.
    const f = facts.get("mistake-blind-pass")!;
    expect(f.bannedBankFrames).toBeGreaterThan(30);
    expect(f.legalBankFrames).toBe(0); // it never even reaches the legal window
  });
  it("mistake-blind-pass: the fault is the DECISION, not the speed — the curve code cannot ride along", () => {
    // The demo is authored at 44 km/h: above OVERTAKE_COMMIT_MIN_KMH (20) so the
    // corridor treats it as a pressed pass, and at/under advisory + the 5 km/h
    // grace so SPEED_TOO_FAST_FOR_CURVE is unreachable BY CONSTRUCTION. If the
    // pacing ever drifted over the band, the §9 assert above would gain a second
    // code and the demo would quietly start teaching two lessons.
    expect(facts.get("mistake-blind-pass")!.peakInArcKmh).toBeLessThanOrEqual(ADVISORY_GRACE_KMH);
    expect(violationCodes(drives.get("mistake-blind-pass")!)).not.toContain("SPEED_TOO_FAST_FOR_CURVE");
  });
  it("mistake-blind-pass: no collision — the staged car's guard rescues, the memory latch still convicts", () => {
    // worldRuntime OVERTAKE_GAP_MEMORY_SEC: the oncoming car emergency-brakes
    // rather than ram the gambler, and the conviction survives the rescue. The
    // demo grades the gamble, never the victim's reflexes.
    expect(violationCodes(drives.get("mistake-blind-pass")!)).not.toContain("COLLISION");
  });
  it("mistake-curve-speed: exactly SPEED_TOO_FAST_FOR_CURVE, once", () => {
    const drive = drives.get("mistake-curve-speed")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_OV_CREST_CURVE.mistakes[1].codeRefs].sort());
    expect(violationCodes(drive).filter((c) => c === "SPEED_TOO_FAST_FOR_CURVE")).toHaveLength(1);
  });
  it("mistake-curve-speed: the guilty speed sits in the ONLY window that teaches one lesson", () => {
    // A 1-km/h-wide argument, in three parts: above the advisory band or nothing
    // grades; under the recorder's √(2.4·R) curve cap or the demo records slower
    // than it was authored; under the truck's own 57 km/h cap or the drive turns
    // into a following-distance lesson. This assert is that window.
    const f = facts.get("mistake-curve-speed")!;
    expect(f.peakInArcKmh).toBeGreaterThan(ADVISORY_GRACE_KMH);
    expect(f.peakInArcKmh).toBeLessThan(RECORDER_CURVE_CAP_KMH);
    expect(f.peakKmh).toBeLessThan(LIMIT_KMH);
    expect(violationCodes(drives.get("mistake-curve-speed")!)).not.toContain("SPEEDING_OVER_LIMIT");
    expect(violationCodes(drives.get("mistake-curve-speed")!)).not.toContain("FOLLOWING_TOO_CLOSE");
  });
  it("mistake-curve-speed: never overtakes at all — the corridor is not this demo's story", () => {
    const f = facts.get("mistake-curve-speed")!;
    expect(f.bannedBankFrames).toBe(0);
    expect(f.legalBankFrames).toBe(0);
    expect(violationCodes(drives.get("mistake-curve-speed")!)).not.toContain("OVERTAKE_INSUFFICIENT_GAP");
  });
});

describe("sc-ov-crest-curve — the 1+1 structural law behind the §9 codes", () => {
  it("no drive reports any laneId but 0 — both banks are lane 0 on a 1+1", () => {
    for (const name of NAMES) {
      expect([...facts.get(name)!.laneIds], name).toEqual([0]);
    }
  });
  it("OVERTAKING_IN_BAN_ZONE fires in NO drive — including the one that passes in the ban", () => {
    // The load-bearing negative (see the header). The В24 span IS armed for the
    // blind-pass demo (bannedBankFrames > 30 above proves tick.noOvertakeZone
    // was true throughout its excursion) — and the code still cannot fire,
    // because there is no laneId delta to hang it on. Hence the corridor code.
    for (const name of NAMES) {
      expect(violationCodes(drives.get(name)!), name).not.toContain("OVERTAKING_IN_BAN_ZONE");
    }
  });
  it("no lane-change code of ANY kind exists, positive or negative", () => {
    for (const name of NAMES) {
      const v = violationCodes(drives.get(name)!);
      expect(v, name).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
      expect(v, name).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
      expect(commendationCodes(drives.get(name)!), name).not.toContain("SAFE_LANE_CHANGE");
    }
  });
  it("the bend never bills a turn code — zero intersections disarm the junction gate", () => {
    for (const name of NAMES) {
      expect(violationCodes(drives.get(name)!), name).not.toContain("TURN_WITHOUT_INDICATOR");
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
    const again = recordScOvCrestCurveDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });
  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_OV_CREST_CURVE.shadow, ...SC_OV_CREST_CURVE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_OV_CREST_CURVE.shadow.path,
      ...SC_OV_CREST_CURVE.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});

describe("pinned geometry + the staged hinge — the template copies match the committed map", () => {
  it("ov-crest-v1 meta.scenario mirrors the template recipe (spans, lanes, the legal window)", () => {
    const d = district as {
      meta: {
        zonesVersion?: number;
        scenario?: {
          laneCenterRightM?: number;
          laneCurveMid?: { x: number; y: number };
          exitLaneY?: number;
          exitOncomingLaneY?: number;
          legalWindowM?: number;
          banZone?: { fromM: number; toM: number; signRef: string };
          curveZone?: { fromM: number; toM: number; advisoryKmh: number; signRef: string };
          params?: Record<string, number>;
        };
      };
    };
    const sc = d.meta.scenario!;
    expect(d.meta.zonesVersion).toBe(1);
    expect(sc.params).toEqual(SC_OV_CREST_CURVE.map.params);
    expect(sc.banZone?.signRef).toBe("В24");
    expect(sc.curveZone?.signRef).toBe("А1");
    expect(sc.curveZone?.advisoryKmh).toBe(ADVISORY_KMH);
    // Both spans end together — the ban and the blindness stop at the same metre.
    expect(sc.banZone?.toM).toBe(sc.curveZone?.toM);
    expect(sc.legalWindowM).toBeGreaterThanOrEqual(300);
    // Every value the ScenarioSpec denormalized (the L7 copy law).
    const patience = SC_OV_CREST_CURVE.success[0].params as { x: number; y: number; maxSpeedKmh: number };
    expect(patience.x).toBeCloseTo(sc.laneCurveMid!.x, 2);
    expect(patience.y).toBeCloseTo(sc.laneCurveMid!.y, 2);
    // The patience gate's ceiling must sit just above the advisory band, or the
    // curve-speed demo would satisfy the objective it is supposed to fail.
    expect(patience.maxSpeedKmh).toBeGreaterThan(ADVISORY_GRACE_KMH);
    expect(patience.maxSpeedKmh).toBeLessThan(facts.get("mistake-curve-speed")!.peakInArcKmh);
    const pass = SC_OV_CREST_CURVE.success[1].params as { y: number; radiusM: number };
    const finish = SC_OV_CREST_CURVE.success[2].params as { y: number };
    // RE-BASELINED for ledger B8 (doc 86 §3). `pass.y` used to be pinned to
    // exitOncomingLaneY, i.e. the gate lived on the oncoming bank ALONE — which
    // is what made a non-overtaking (always lawful) drive score
    // `completedAll: false` and lock the next rung. The new law is stronger than
    // the old pin and is asserted as such: the gate is centred between the two
    // exit-leg lane centres and its radius admits BOTH, so the student who reads
    // the straight and decides «не сега» finishes the lesson.
    expect(pass.y).toBeCloseTo((sc.exitLaneY! + sc.exitOncomingLaneY!) / 2, 2);
    expect(Math.abs(pass.y - sc.exitLaneY!)).toBeLessThan(pass.radiusM);
    expect(Math.abs(pass.y - sc.exitOncomingLaneY!)).toBeLessThan(pass.radiusM);
    expect(finish.y).toBeCloseTo(sc.exitLaneY!, 2);
  });
  it("the truck's cap IS the hinge — above the guilty curve speed, far under the limit", () => {
    // If this drifts, the template silently changes meaning: a slower truck
    // would turn the curve-speed demo into a following-distance demo; a faster
    // one would make the shadow's legal pass overrun the authored window.
    const truck = (SC_OV_CREST_CURVE.staged ?? []).find((s) => s.kind === "brakingLeadCar") as
      | { maxMatchSpeedMps: number; followGapM: number; actor: { profile?: string } }
      | undefined;
    expect(truck).toBeDefined();
    const capKmh = truck!.maxMatchSpeedMps * 3.6;
    expect(capKmh).toBeGreaterThan(facts.get("mistake-curve-speed")!.peakInArcKmh);
    expect(capKmh).toBeLessThan(LIMIT_KMH - 25); // slow enough to be worth passing
    expect(truck!.actor.profile).toBe("truck"); // the bank's „бавен камион"
    expect(truck!.followGapM).toBeGreaterThan(30);
  });
  it("the template is authored DRY by day, with the L5 rain rung render-only", () => {
    expect(SC_OV_CREST_CURVE.conditions?.weather).toBe("dry");
    expect(SC_OV_CREST_CURVE.conditions?.night).toBeUndefined();
    // No `physics`: it is a TEMPLATE-wide field, so a wetGrip rung would run
    // L1–L4 on wet grip too and invalidate these dry-tuned recordings
    // (ADR-006 stage 4a — the sc-ov-night-gap ruling).
    expect(SC_OV_CREST_CURVE.physics).toBeUndefined();
    expect(SC_OV_CREST_CURVE.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    expect(SC_OV_CREST_CURVE.levels[4].conditions?.weather).toBe("rain");
  });
});
