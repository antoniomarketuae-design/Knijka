/**
 * Trace gate — „Изход от магистралата" (sc-merge-motorway-exit on mw-exit-v1,
 * ЗДвП чл. 55 + чл. 58 + чл. 20, ал. 2), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns CLEAN_DRIVING — it is out
 *      of the overtaking lane a kilometre out, holds motorway pace to the
 *      taper, enters the лента за намаляване WITH the flow speed (indicator +
 *      mirror both times → SAFE_LANE_CHANGE), sheds 130 → 60 INSIDE the lane,
 *      and rides the ramp bend at exactly its advisory.
 *   2. MISTAKE DEMOS grade EXACTLY their authored codeRefs — once each:
 *      the slam to a dead stop in the travel lane grades HARSH_BRAKING_NO_CAUSE
 *      and NOTHING else (the exit that follows it is properly signalled,
 *      mirrored and slowed); the late brake grades SPEED_TOO_FAST_FOR_CURVE and
 *      NOTHING else (85 stays at/under the ramp's own 90, so no SPEEDING_* code
 *      can leak into the single-code demo).
 *   3. THE MAP'S OWN LAW: no drive ever grades EMERGENCY_LANE_DRIVING (the
 *      deceleration segment carries no span, and none of them hugs the curb
 *      lane past the gore), NOT_KEEPING_RIGHT (out of laneId 2 inside 7 s of the
 *      12 s sustain; the лента за намаляване is crossed far quicker than that)
 *      or DRIVING_TOO_SLOW_FOR_MOTORWAY (the ramp is untagged; every
 *      carriageway slow-down is a transition).
 *   4. COMMITTED FILES under content/traces/sc-merge-motorway-exit/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-merge-motorway-exit-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_MERGE_MOTORWAY_EXIT } from "../../lessons/scenario/templates-merging2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScMergeMotorwayExitDrive,
  type ScMergeMotorwayExitTraceName,
} from "../scMergeMotorwayExit";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-merge-motorway-exit";
const NAMES: ScMergeMotorwayExitTraceName[] = [
  "shadow-correct",
  "mistake-brake-on-carriageway",
  "mistake-ramp-too-fast",
];

/** mw-exit-v1 truths (meta.scenario — pinned by mw-exit-districts.test.ts). */
const X_CURB = 8.13;
const TAPER_Y = 520;
const NOSE_Y = 800;
const ADVISORY_KMH = 60;
const RAMP_ARC_END_Y = 976.78;
const RAMP_END: readonly [number, number] = [123.78, 1019.21];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("mw-exit-v1");
const drives = new Map<ScMergeMotorwayExitTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScMergeMotorwayExitDrive(district, n)]),
);

describe("sc-merge-motorway-exit — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING + SAFE_LANE_CHANGE", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
    // BOTH authored moves — out of the overtaking lane, and into the
    // deceleration lane — grade as safe lane changes.
    expect(commendationCodes(shadow).filter((c) => c === "SAFE_LANE_CHANGE")).toHaveLength(2);
  });

  it("is out of the overtaking lane a kilometre out, then holds motorway pace to the taper", () => {
    // The drill opens in laneId 2 and leaves it early — 7 s of the 12 s
    // keep-right sustain, which is why the shadow can be innocent at all.
    const start = shadow.trace.samples.filter((s) => s.y < 35);
    expect(start.length).toBeGreaterThan(0);
    for (const s of start) expect(s.x, `y=${s.y}`).toBeLessThan(-7);
    const leftLane = shadow.trace.samples.filter((s) => s.x < -4.06);
    expect(Math.max(...leftLane.map((s) => s.tSec))).toBeLessThan(7);
    // …and from there it rides the travel lane at flow speed all the way in.
    const approach = shadow.trace.samples.filter((s) => s.y > 340 && s.y < TAPER_Y);
    expect(approach.length).toBeGreaterThan(0);
    for (const s of approach) expect(Math.abs(s.x), `y=${s.y}`).toBeLessThan(0.5);
    expect(Math.min(...approach.map((s) => s.speedKmh))).toBeGreaterThan(125);
  });

  it("THE DRILL: it enters the deceleration lane WITH the flow and sheds all of it INSIDE the lane", () => {
    // The lane is entered at motorway pace — the whole point of the archetype.
    // (the window opens PAST the lateral shift's end at y = 645 — the flip
    //  itself is graded by the SAFE_LANE_CHANGE assert above)
    const entering = shadow.trace.samples.filter((s) => s.y > 646 && s.y < 660);
    expect(entering.length).toBeGreaterThan(0);
    for (const s of entering) expect(Math.abs(s.x - X_CURB), `y=${s.y}`).toBeLessThan(0.5);
    expect(Math.min(...entering.map((s) => s.speedKmh))).toBeGreaterThan(120);
    // Nothing on the CARRIAGEWAY ever slows: the braking starts past the flip.
    const onCarriageway = shadow.trace.samples.filter((s) => s.y > 100 && s.y < 620);
    expect(Math.min(...onCarriageway.map((s) => s.speedKmh))).toBeGreaterThan(60);
    // …and by the gore the car is already at the ramp advisory.
    const atGore = shadow.trace.samples.filter((s) => s.y > NOSE_Y - 15 && s.y < NOSE_Y + 5);
    expect(atGore.length).toBeGreaterThan(0);
    for (const s of atGore) expect(s.speedKmh, `y=${s.y}`).toBeLessThanOrEqual(ADVISORY_KMH + 1);
  });

  it("rides the whole ramp bend at the advisory and finishes at the ramp end", () => {
    const arc = shadow.trace.samples.filter((s) => s.y > NOSE_Y + 5 && s.y < RAMP_ARC_END_Y - 5);
    expect(arc.length).toBeGreaterThan(0);
    // Steady at the advisory — no braking in the bend, no overspeed either.
    expect(Math.max(...arc.map((s) => s.speedKmh))).toBeLessThanOrEqual(ADVISORY_KMH + 1);
    expect(Math.min(...arc.map((s) => s.speedKmh))).toBeGreaterThan(ADVISORY_KMH - 2);
    // …and it really followed the bend east, not the mainline north.
    expect(Math.max(...arc.map((s) => s.x))).toBeGreaterThan(50);
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(Math.hypot(last.x - RAMP_END[0], last.y - RAMP_END[1])).toBeLessThan(1);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * „THE VEHICLE NEVER EXCEEDS WALKING SPEED IN ANY CAPTURED FRAME."
   *
   *   sc-merge-motorway-exit/mobile-right/05-stopped.png → scMergeMotorwayExit.ts.
   *   That run's own summary says `top 22 км/ч · 25 full stops · forcedBy:
   *   Прекрати урока` — it is the audit harness's ego at `CRUISE_KMH = 12`
   *   (tools/mobile/lesson-audit.mjs), and the frames kept for it are the
   *   standstills. The authored drive is the opposite of walking pace, and this
   *   case says so in numbers so the claim cannot land here again.
   * ═══════════════════════════════════════════════════════════════════════════
   */
  it("holds MOTORWAY pace, not walking pace — the whole drive, in one reading", () => {
    const s = shadow.trace.samples;
    // The authored cruise is 130; the recorder ramps toward it at 2.2 m/s².
    expect(Math.max(...s.map((x) => x.speedKmh))).toBeGreaterThan(128);
    // And it is not one peak on an otherwise slow drive: the exit is taken at
    // the advisory 60, so most of the run sits above it and NONE of it crawls.
    const atPace = s.filter((x) => x.speedKmh > 55).length;
    expect(atPace / s.length).toBeGreaterThan(0.6);
    // Nothing between the launch and the ramp's tail is ever at walking pace —
    // the drill is „hold the flow and shed it in the lane", never „stop on a
    // motorway". The window excludes the two ends the script authors at rest:
    // the standstill start (135 m of a 2.2 m/s² launch puts y = 150 at ~87 км/ч)
    // and the halt at the ramp end past the arc.
    const underWay = s.filter((x) => x.y > 150 && x.y < RAMP_ARC_END_Y);
    expect(underWay.length).toBeGreaterThan(0);
    // The slowest it ever gets in there is the ramp's own advisory.
    expect(Math.min(...underWay.map((x) => x.speedKmh))).toBeGreaterThan(50);
  });

  it("uses the taught observation pair before BOTH moves: a right mirror glance AND a right signal before the wheel", () => {
    const kinds = shadow.trace.events.map((e) => e.kind);
    expect(kinds.filter((k) => k === "glance-right").length).toBeGreaterThanOrEqual(2);
    expect(shadow.trace.events.filter((e) => e.kind === "signal-on" && e.detail === "right")).toHaveLength(2);
    expect(kinds.filter((k) => k === "signal-off").length).toBeGreaterThanOrEqual(2);
    expect(kinds).toContain("glance-rear");
  });
});

describe("sc-merge-motorway-exit — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Спиране на платното преди изхода“: exactly HARSH_BRAKING_NO_CAUSE, once", () => {
    const drive = drives.get("mistake-brake-on-carriageway")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual([...SC_MERGE_MOTORWAY_EXIT.mistakes[0].codeRefs].sort());
    expect(codes.filter((c) => c === "HARSH_BRAKING_NO_CAUSE")).toHaveLength(1);
    // The demo really stopped, and really stopped ON THE CARRIAGEWAY in the
    // TRAVEL lane before the exit — not in the deceleration lane, not on the
    // аварийна лента. The window excludes the standing start and the closing
    // stop at the ramp end.
    const stopped = drive.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 1 && s.y > 400 && s.y < TAPER_Y,
    );
    expect(stopped.length).toBeGreaterThan(0);
    for (const s of stopped) expect(Math.abs(s.x), `y=${s.y}`).toBeLessThan(0.5);
    // …and the slam it arrived with was a genuine emergency-grade stab from
    // motorway pace (the onset the detector needs, not a gentle roll to rest).
    const approach = drive.trace.samples.filter((s) => s.y > 330 && s.y < 390);
    expect(Math.max(...approach.map((s) => s.speedKmh))).toBeGreaterThan(120);
    // The recovery exit is done properly — the stop is the ONLY fault.
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CURVE");
    expect(codes).not.toContain("COLLISION");
    // …and it still rides the bend at the advisory (one demo, one fault).
    const arc = drive.trace.samples.filter((s) => s.y > NOSE_Y + 5 && s.y < RAMP_ARC_END_Y - 5);
    expect(Math.max(...arc.map((s) => s.speedKmh))).toBeLessThanOrEqual(ADVISORY_KMH + 1);
  });

  it("„Рампата с магистрална скорост“: exactly SPEED_TOO_FAST_FOR_CURVE — the ramp's own limit never bills", () => {
    const drive = drives.get("mistake-ramp-too-fast")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual([...SC_MERGE_MOTORWAY_EXIT.mistakes[1].codeRefs].sort());
    expect(codes.filter((c) => c === "SPEED_TOO_FAST_FOR_CURVE")).toHaveLength(1);
    // The whole deceleration lane went by at motorway pace — the fault is that
    // NONE of its 280 m were used.
    const inLane = drive.trace.samples.filter((s) => s.y > TAPER_Y + 100 && s.y < 730);
    expect(inLane.length).toBeGreaterThan(0);
    expect(Math.min(...inLane.map((s) => s.speedKmh))).toBeGreaterThan(125);
    // …so the bend is taken 25 km/h over the advisory — and yet at/under the
    // ramp's own 90, which is exactly why the demo is single-code (the curve
    // detector is deliberately not capped at the graced limit).
    const arc = drive.trace.samples.filter((s) => s.y > NOSE_Y + 5 && s.y < RAMP_ARC_END_Y - 5);
    expect(arc.length).toBeGreaterThan(0);
    expect(Math.min(...arc.map((s) => s.speedKmh))).toBeGreaterThan(ADVISORY_KMH + 20);
    expect(Math.max(...arc.map((s) => s.speedKmh))).toBeLessThanOrEqual(90);
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    // The lane work was faultless — signalling is not the lesson here.
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
    expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
  });

  it("the map's own law holds on every drive: no emergency-lane, keep-right or motorway-crawl leakage", () => {
    for (const name of NAMES) {
      const codes = violationCodes(drives.get(name)!);
      expect(codes, name).not.toContain("EMERGENCY_LANE_DRIVING");
      expect(codes, name).not.toContain("NOT_KEEPING_RIGHT");
      expect(codes, name).not.toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");
      expect(codes, name).not.toContain("POOR_LANE_KEEPING");
      expect(codes, name).not.toContain("WRONG_WAY");
      expect(codes, name).not.toContain("MOVE_OFF_WITHOUT_OBSERVATION");
      // …and no drive ever touches the curb lane past the gore (the resumed
      // аварийна span) — every one of them is ON the ramp by then.
      const pastGore = drives
        .get(name)!
        .trace.samples.filter((s) => s.y > NOSE_Y + 30 && s.x < 20 && s.x > 4);
      expect(pastGore.length, `${name}: lingering on the curb lane past the gore`).toBeLessThan(60);
    }
  });

  it("the staged rear car is pressure scenery: it never grades anything (doc 72 FO-07)", () => {
    // Its only footprint is the outcome channel — never a SimTick event.
    for (const name of NAMES) {
      const drive = drives.get(name)!;
      for (const o of drive.outcomes) expect(o.kind, name).toBe("rearTailgater");
      expect(violationCodes(drive), name).not.toContain("COLLISION");
      expect(violationCodes(drive), name).not.toContain("FOLLOWING_TOO_CLOSE");
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
    const again = recordScMergeMotorwayExitDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [
      SC_MERGE_MOTORWAY_EXIT.shadow,
      ...SC_MERGE_MOTORWAY_EXIT.mistakes.map((m) => m.traceRef),
    ];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_MERGE_MOTORWAY_EXIT.shadow.path,
      ...SC_MERGE_MOTORWAY_EXIT.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
