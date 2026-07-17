/**
 * Trace gate — „Включване в магистрала през лентата за ускоряване"
 * (sc-merge-accel-lane on mw-entry-v1, ЗДвП чл. 55 + чл. 25), doc 76 §5/§9
 * stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns CLEAN_DRIVING — builds
 *      flow speed IN the acceleration lane (laneId 0 of the span-free
 *      segment), merges into the mainline lane with indicator + mirror well
 *      before the taper (SAFE_LANE_CHANGE), and never touches the аварийна
 *      лента that resumes past it.
 *   2. MISTAKE DEMOS grade EXACTLY their authored codeRefs — once each:
 *      the causeless slam grades HARSH_BRAKING_NO_CAUSE and NOTHING else (the
 *      merge that follows it is properly signalled and mirrored); the blind
 *      merge grades LANE_CHANGE_WITHOUT_MIRROR_CHECK + COLLISION and NEVER
 *      LANE_CHANGE_WITHOUT_INDICATOR — signalling without looking is the demo.
 *   3. THE MAP'S OWN LAW: no drive ever grades EMERGENCY_LANE_DRIVING (the
 *      acceleration segment carries no span), NOT_KEEPING_RIGHT (the resumed
 *      span past the taper exempts laneId 1) or DRIVING_TOO_SLOW_FOR_MOTORWAY
 *      (the ramp is untagged; every carriageway crawl is a transition).
 *   4. COMMITTED FILES under content/traces/sc-merge-accel-lane/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public
 *      copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-merge-accel-lane-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_MERGE_ACCEL_LANE } from "../../lessons/scenario/templates-merging";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScMergeAccelLaneDrive,
  type ScMergeAccelLaneTraceName,
} from "../scMergeAccelLane";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-merge-accel-lane";
const NAMES: ScMergeAccelLaneTraceName[] = [
  "shadow-correct",
  "mistake-stop-at-end",
  "mistake-blind-merge",
];

/** mw-entry-v1 truths (meta.scenario — pinned by merge-districts.test.ts). */
const X_CURB = 8.13;
const TAPER_Y = 460;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("mw-entry-v1");
const drives = new Map<ScMergeAccelLaneTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScMergeAccelLaneDrive(district, n)]),
);

describe("sc-merge-accel-lane — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING + SAFE_LANE_CHANGE", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
    expect(commendationCodes(shadow)).toContain("SAFE_LANE_CHANGE");
  });

  it("builds flow speed IN the acceleration lane and reaches its end fast, not stopped", () => {
    // Deep inside the acceleration lane the car rides the curb lane…
    const inLane = shadow.trace.samples.filter((s) => s.y > 290 && s.y < 340);
    expect(inLane.length).toBeGreaterThan(0);
    for (const s of inLane) expect(Math.abs(s.x - X_CURB), `y=${s.y}`).toBeLessThan(0.5);
    // …and it is genuinely up to flow speed by the time it commits.
    const atCommit = shadow.trace.samples.filter((s) => s.y > 340 && s.y < 355);
    expect(atCommit.length).toBeGreaterThan(0);
    expect(Math.min(...atCommit.map((s) => s.speedKmh))).toBeGreaterThan(85);
    // Nothing in the whole drive comes near a stop before the finish.
    const running = shadow.trace.samples.filter((s) => s.y > 200 && s.y < 900);
    expect(Math.min(...running.map((s) => s.speedKmh))).toBeGreaterThan(50);
  });

  it("completes the merge BEFORE the taper and holds the mainline lane after it", () => {
    // The lateral commit is done with room to spare (the joint-grace law).
    const atTaper = shadow.trace.samples.filter((s) => s.y > TAPER_Y - 20 && s.y < TAPER_Y + 20);
    expect(atTaper.length).toBeGreaterThan(0);
    for (const s of atTaper) expect(Math.abs(s.x), `y=${s.y}`).toBeLessThan(0.5);
    // Past the taper the curb lane is the аварийна лента — never touched.
    for (const s of shadow.trace.samples.filter((s) => s.y > TAPER_Y)) {
      expect(s.x, `y=${s.y}`).toBeLessThan(2);
    }
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(940);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("uses the taught observation pair: a left mirror glance AND a left signal before the wheel", () => {
    const kinds = shadow.trace.events.map((e) => e.kind);
    expect(kinds.filter((k) => k === "glance-left").length).toBeGreaterThanOrEqual(2);
    expect(kinds).toContain("signal-on");
    expect(kinds).toContain("signal-off");
  });
});

describe("sc-merge-accel-lane — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Спиране в края на лентата за ускоряване“: exactly HARSH_BRAKING_NO_CAUSE, once", () => {
    const drive = drives.get("mistake-stop-at-end")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual([...SC_MERGE_ACCEL_LANE.mistakes[0].codeRefs].sort());
    expect(codes.filter((c) => c === "HARSH_BRAKING_NO_CAUSE")).toHaveLength(1);
    // The demo really stopped, and really stopped IN the acceleration lane
    // near its end (not on the аварийна лента past the taper). The window
    // excludes the standing start on the ramp and the closing stop at the
    // finish line — the graded rest is the one INSIDE the acceleration lane.
    const stopped = drive.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 1 && s.y > 340 && s.y < TAPER_Y,
    );
    expect(stopped.length).toBeGreaterThan(0);
    for (const s of stopped) expect(Math.abs(s.x - X_CURB), `y=${s.y}`).toBeLessThan(0.5);
    // …and the slam it arrived with was a genuine emergency-grade stab from
    // flow speed (the onset the detector needs, not a gentle roll to rest).
    const approach = drive.trace.samples.filter((s) => s.y > 300 && s.y < 335);
    expect(Math.max(...approach.map((s) => s.speedKmh))).toBeGreaterThan(90);
    // The recovery merge is done properly — the stop is the ONLY fault.
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
    expect(codes).not.toContain("COLLISION");
  });

  it("„Вливане без оглеждане пред идваща кола“: exactly the mirror code + COLLISION — the indicator does NOT excuse", () => {
    const drive = drives.get("mistake-blind-merge")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual([...SC_MERGE_ACCEL_LANE.mistakes[1].codeRefs].sort());
    expect(codes.filter((c) => c === "LANE_CHANGE_WITHOUT_MIRROR_CHECK")).toHaveLength(1);
    expect(codes.filter((c) => c === "COLLISION")).toHaveLength(1);
    // The signal really was on — the demo's own irony.
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    expect(drive.trace.events.some((e) => e.kind === "signal-on" && e.detail === "left")).toBe(true);
    // …and NO glance was ever made toward the lane it moved into.
    expect(drive.trace.events.some((e) => e.kind === "glance-left")).toBe(false);
    // The merge itself genuinely crossed into the mainline lane before the taper.
    const merged = drive.trace.samples.filter((s) => s.y > 405);
    expect(merged.length).toBeGreaterThan(0);
    expect(Math.min(...merged.map((s) => Math.abs(s.x)))).toBeLessThan(0.5);
    expect(Math.max(...merged.map((s) => s.y))).toBeLessThan(TAPER_Y);
  });

  it("the map's own law holds on every drive: no emergency-lane, keep-right or motorway-crawl leakage", () => {
    for (const name of NAMES) {
      const codes = violationCodes(drives.get(name)!);
      expect(codes, name).not.toContain("EMERGENCY_LANE_DRIVING");
      expect(codes, name).not.toContain("NOT_KEEPING_RIGHT");
      expect(codes, name).not.toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");
      expect(codes, name).not.toContain("SPEEDING_OVER_LIMIT");
      expect(codes, name).not.toContain("SPEEDING_DANGEROUS");
      expect(codes, name).not.toContain("POOR_LANE_KEEPING");
      expect(codes, name).not.toContain("WRONG_WAY");
    }
  });

  it("the staged mainline car is pressure scenery: it never grades anything (doc 72 FO-07)", () => {
    // Its only footprint is the outcome channel — never a SimTick event.
    for (const name of NAMES) {
      const drive = drives.get(name)!;
      for (const o of drive.outcomes) expect(o.kind, name).toBe("rearTailgater");
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
    const again = recordScMergeAccelLaneDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [
      SC_MERGE_ACCEL_LANE.shadow,
      ...SC_MERGE_ACCEL_LANE.mistakes.map((m) => m.traceRef),
    ];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_MERGE_ACCEL_LANE.shadow.path,
      ...SC_MERGE_ACCEL_LANE.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
