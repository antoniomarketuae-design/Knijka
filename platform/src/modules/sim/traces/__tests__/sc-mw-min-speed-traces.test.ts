/**
 * Trace gate — „Магистрален ритъм — не пълзи" (sc-mw-min-speed on mw-v1,
 * doc 72 SP-10 + OV-11), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns CLEAN_DRIVING — a genuine
 *      flow-speed drive: ~110 km/h held in the RIGHT travel lane (laneId 1 —
 *      the rightmost REQUIRED lane under the emergencyLaneRight seam) for the
 *      whole kilometre, with the staged flow car passing it legally.
 *   2. MISTAKE DEMOS grade EXACTLY their codes, once each. The pair is the
 *      template's whole claim, so the gate tests it as a PAIR: both crawl at
 *      the same authored 40 km/h and differ ONLY in lane, so the second code
 *      is attributable to the lane alone.
 *      - right lane (x = 0)     → DRIVING_TOO_SLOW_FOR_MOTORWAY, alone;
 *      - left lane  (x = −8.12) → that PLUS NOT_KEEPING_RIGHT.
 *      Neither ever bills a speeding code (40 ≪ 140) or EMERGENCY_LANE_DRIVING.
 *   3. THE STAGED FLOW CAR never contaminates the verdict: it is never a lead
 *      in any drive (tick.leadGapM stays non-finite throughout all three), so
 *      the crawl detector's congestion innocence (motorwaySlowQueueGapM 60 m)
 *      never fires and the convictions are honest — the backlog's own
 *      „keep the drill corridor congestion-free" flag, proven rather than
 *      asserted in prose.
 *   4. COMMITTED FILES under content/traces/sc-mw-min-speed/ ARE the recordings
 *      of these scripts, byte-for-byte, with identical public copies.
 *
 * RECORDER SPEED HONESTY: the gate asserts the shadow really reached its
 * authored ~110 km/h and that both demos really held ~40 — the kinematic
 * recorder has no top-speed cap and the straight never triggers its curve cap,
 * so a silent rewrite of either story would fail here.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-mw-min-speed-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_MW_MIN_SPEED } from "../../lessons/scenario/templates-speed2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScMwMinSpeedDrive, type ScMwMinSpeedTraceName } from "../scMwMinSpeed";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-mw-min-speed";
const NAMES: ScMwMinSpeedTraceName[] = [
  "shadow-correct",
  "mistake-crawl-right",
  "mistake-crawl-left",
];

/** mw-v1 northbound lane centers (meta.scenario — the L7 copy truth). */
const X_CRUISE = 0;
const X_LEFT = -8.12;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}
function maxKmh(d: RecordedDrive): number {
  return Math.max(...d.trace.samples.map((s) => Math.abs(s.speedKmh)));
}
function durationSec(d: RecordedDrive): number {
  return d.trace.samples[d.trace.samples.length - 1].tSec;
}

const district = loadDistrict("mw-v1");
/** Per-drive record of whether ANY vehicle ever entered the player's 4 m lead
 *  corridor (traffic/system.ts LEAD_CORRIDOR_M) — the staged-actor honesty
 *  channel; see the „flow car" describe below. */
const everHadLead = new Map<ScMwMinSpeedTraceName, boolean>();
const drives = new Map<ScMwMinSpeedTraceName, RecordedDrive>(
  NAMES.map((n) => {
    let sawLead = false;
    const d = recordScMwMinSpeedDrive(district, n, {
      onTick: (tick) => {
        if (tick.leadGapM !== undefined && Number.isFinite(tick.leadGapM)) sawLead = true;
      },
    });
    everHadLead.set(n, sawLead);
    return [n, d];
  }),
);

describe("sc-mw-min-speed — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("really cruises at flow speed in the RIGHT travel lane (the recorder-honesty assert)", () => {
    // The authored 110 must be REACHED (no silent kinematic rewrite) — and it
    // must stay a FLOW speed, not a crawl: comfortably over чл. 54's 50 km/h
    // construction line, comfortably under the posted 140.
    expect(maxKmh(shadow)).toBeGreaterThan(105);
    expect(maxKmh(shadow)).toBeLessThan(112);
    // …and held in the cruise lane: x = 0 throughout (never the left lane at
    // -8.12, never the emergency lane at +8.13).
    for (const s of shadow.trace.samples) {
      expect(Math.abs(s.x - X_CRUISE), `t=${s.tSec}`).toBeLessThan(2);
    }
    // Reaches the end of the segment.
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(930);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("the flow car overtakes and clears — the shadow's encounter genuinely resolves", () => {
    // The card promises the student a beat („изпреварва отляво и си отива").
    // A pass that silently never played would make that copy a lie.
    expect(shadow.outcomes).toHaveLength(1);
    expect(shadow.outcomes[0].eventId).toBe("sc-mwms-flow-car");
    expect(shadow.outcomes[0].kind).toBe("rearTailgater");
    expect(shadow.outcomes[0].success).toBe(true);
    expect(shadow.outcomes[0].tSec).toBeLessThan(durationSec(shadow));
  });
});

describe("sc-mw-min-speed — the demo PAIR: one variable, two verdicts (doc 76 §9 stage 5)", () => {
  it("„Пълзене с 40 в активната лента“: exactly DRIVING_TOO_SLOW_FOR_MOTORWAY, once", () => {
    const drive = drives.get("mistake-crawl-right")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual([...SC_MW_MIN_SPEED.mistakes[0].codeRefs].sort());
    expect(codes.filter((c) => c === "DRIVING_TOO_SLOW_FOR_MOTORWAY")).toHaveLength(1);
    // The lane is the RIGHT one — keep-right must stay silent, or the demo
    // would be teaching two faults while claiming one.
    expect(codes).not.toContain("NOT_KEEPING_RIGHT");
    expect(codes).not.toContain("EMERGENCY_LANE_DRIVING");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT"); // 40 ≪ 140
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    for (const s of drive.trace.samples) expect(Math.abs(s.x - X_CRUISE), `t=${s.tSec}`).toBeLessThan(2);
    expect(maxKmh(drive)).toBeLessThan(45); // really held ~40, never over the floor
  });

  it("„Пълзене с 40, и то в лявата лента“: exactly BOTH codes — the compound bill", () => {
    const drive = drives.get("mistake-crawl-left")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual([...SC_MW_MIN_SPEED.mistakes[1].codeRefs].sort());
    expect(codes.filter((c) => c === "DRIVING_TOO_SLOW_FOR_MOTORWAY")).toHaveLength(1);
    expect(codes.filter((c) => c === "NOT_KEEPING_RIGHT")).toHaveLength(1);
    expect(codes).not.toContain("EMERGENCY_LANE_DRIVING");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    // Genuinely the LEFT lane (laneId 2), genuinely the same crawl.
    const cruising = drive.trace.samples.filter((s) => s.y > 60);
    expect(cruising.length).toBeGreaterThan(0);
    for (const s of cruising) expect(Math.abs(s.x - X_LEFT), `y=${s.y}`).toBeLessThan(2);
    expect(maxKmh(drive)).toBeLessThan(45);
  });

  it("the pair isolates the LANE: same speed envelope, one extra code", () => {
    // This is the template's reason to exist next to sc-mw-discipline (which
    // contrasts a 130 hog against a 40 crawl — speed AND lane both move). If a
    // future tweak let the two demos drift apart in speed, the second code
    // would stop being attributable to the lane and this test should fail.
    const right = drives.get("mistake-crawl-right")!;
    const left = drives.get("mistake-crawl-left")!;
    expect(Math.abs(maxKmh(right) - maxKmh(left))).toBeLessThan(1);
    const rightCodes = new Set(violationCodes(right));
    const leftCodes = new Set(violationCodes(left));
    for (const c of rightCodes) expect([...leftCodes]).toContain(c);
    expect([...leftCodes].filter((c) => !rightCodes.has(c))).toEqual(["NOT_KEEPING_RIGHT"]);
  });
});

describe("sc-mw-min-speed — the staged flow car never contaminates the verdict", () => {
  it("is NEVER a lead vehicle in any drive (so the crawl's queue innocence never fires)", () => {
    // DRIVING_TOO_SLOW_FOR_MOTORWAY is exempt while a lead sits within
    // motorwaySlowQueueGapM (60 m) — congestion is not a crawl. The flow car
    // is behind through the pressure phase and rides the LEFT lane (8.125 m
    // off-axis, outside the 4 m LEAD_CORRIDOR_M) once it passes, so it is
    // never a lead at all. If it ever became one, the crawl demos would be
    // convicting a driver the engine considers innocent.
    for (const n of NAMES) expect(everHadLead.get(n), n).toBe(false);
  });

  it("never enters the LEFT-lane player's lane: the pass is not commanded before that demo ends", () => {
    // The structural claim behind the left-lane demo's length (see
    // traces/scMwMinSpeed.ts): the actor's pass commits at t ≈ 28 and a probe
    // measured its arrival alongside a left-lane player at t = 31.8. The demo
    // ends at t ≈ 20.5, so the actor is still trapped behind — which is
    // exactly what the card tells the student.
    const left = drives.get("mistake-crawl-left")!;
    expect(durationSec(left)).toBeLessThan(25);
    // Never resolved ⇒ the pass never completed.
    expect(left.outcomes).toEqual([]);
    // Both codes landed with room to spare inside that window.
    const codeTimes = left.ruleEvents
      .filter((e) => e.kind === "violation")
      .map((e) => (e as unknown as { t: number }).t);
    expect(Math.max(...codeTimes)).toBeLessThan(durationSec(left) - 5);
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
    // The staged flow car draws seeded jitter (releaseGapM/followBehindM/
    // pressureSec) — determinism here is what makes the whole pass choreography
    // a fixed function of the district, not a lucky replay.
    for (const name of NAMES) {
      const again = recordScMwMinSpeedDrive(district, name);
      expect(serializeScenarioTrace(again.trace), name).toBe(
        serializeScenarioTrace(drives.get(name)!.trace),
      );
    }
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_MW_MIN_SPEED.shadow, ...SC_MW_MIN_SPEED.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_MW_MIN_SPEED.shadow.path,
      ...SC_MW_MIN_SPEED.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
