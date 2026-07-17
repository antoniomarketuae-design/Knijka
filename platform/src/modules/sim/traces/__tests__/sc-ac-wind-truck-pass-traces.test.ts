/**
 * Wind-truck-pass trace gate — „Страничен вятър след камиона"
 * (sc-ac-wind-truck-pass on mw-v1, the doc 72 AC-12 wind slice OVERTAKING beat),
 * doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays in DAY DRY with ZERO violations and earns CLEAN_DRIVING —
 *      a slow declared overtake (SAFE_LANE_CHANGE each way, the LEFT indicator
 *      held across the pass exempting keep-right), the cab-line gust met with a
 *      SMALL steady correction (authored drift to x ≈ −9.2, far inside the
 *      3.25 m band), released smoothly.
 *   2. MISTAKE DEMOS grade their exact codes — NO new rule code (the shipped
 *      detectors ARE the grading): loose hands blown to the median side →
 *      EXACTLY POOR_LANE_KEEPING; the gust throwing the car against the trailer
 *      → EXACTLY COLLISION (the authored-consequence seam). Never a speed code
 *      (all ≤ 80 ≪ 140; DRY arms no envelope), never CENTER_LINE_TOUCHED (the
 *      carriageway is ONEWAY — centerLineCond is structurally unreachable).
 *   3. DUAL-CHANNEL HONESTY (the 4a law, wind edition): the recorder is
 *      kinematic, so the lee-then-gust story is AUTHORED — asserted here by
 *      pinning the drift shapes against the overtaking-lane band derived from
 *      DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM: the shadow NEVER leaves the band;
 *      the blown-out mistake crosses the median side for longer than the
 *      sustain.
 *   4. COMMITTED FILES under content/traces/sc-ac-wind-truck-pass/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ac-wind-truck-pass-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG } from "../../rules";
import { SC_AC_WIND_TRUCK_PASS } from "../../lessons/scenario/templates-conditions2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScAcWindTruckPassDrive,
  type ScAcWindTruckPassTraceName,
} from "../scAcWindTruckPass";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ac-wind-truck-pass";
const NAMES: ScAcWindTruckPassTraceName[] = ["shadow-correct", "mistake-blown-out", "mistake-clip-truck"];

/** Overtaking-lane (laneId 2) center of mw-v1 — the geometric center the lane
 *  detectors measure offsets from (meta.scenario.laneLeftX). */
const OVERTAKE_CENTER_X = -8.12;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}
/** Longest continuous stretch (s) the trace spends past `predicate`. */
function longestSustainSec(d: RecordedDrive, predicate: (x: number) => boolean): number {
  let best = 0;
  let startT: number | null = null;
  for (const s of d.trace.samples) {
    if (predicate(s.x)) {
      startT ??= s.tSec;
      best = Math.max(best, s.tSec - startT);
    } else {
      startT = null;
    }
  }
  return best;
}

const district = loadDistrict("mw-v1");
const drives = new Map<ScAcWindTruckPassTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScAcWindTruckPassDrive(district, n)]),
);

describe("sc-ac-wind-truck-pass — geometry pins against the committed map", () => {
  it("lane, spawn and length constants match mw-v1", () => {
    const raw = district as {
      meta: { scenario: { laneCruiseX: number; laneLeftX: number; params: Record<string, number> } };
      spawnPoints: Array<{ id: string; x: number; y: number }>;
    };
    expect(raw.meta.scenario.laneCruiseX).toBe(0);
    expect(raw.meta.scenario.laneLeftX).toBe(OVERTAKE_CENTER_X);
    expect(raw.meta.scenario.params.lengthM).toBe(1000);
    expect(SC_AC_WIND_TRUCK_PASS.map.params).toEqual(raw.meta.scenario.params);
    const spawn = raw.spawnPoints.find((s) => s.id === "mw-spawn-approach")!;
    expect(spawn).toBeTruthy();
    expect(spawn.x).toBe(0);
    expect(spawn.y).toBe(15);
  });

  it("wind-story honesty: the authored drifts are pinned against the overtaking-lane band", () => {
    const band = DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM;
    expect(band).toBe(3.25);
    // Toward the median the overtaking-lane band ends at x = −11.375.
    const medianSideX = OVERTAKE_CENTER_X - band; // −11.37

    // Shadow: a VISIBLE drift toward the truck at the cab line (the ghost must
    // tell the wind story)…
    const shadowXs = drives.get("shadow-correct")!.trace.samples.map((s) => s.x);
    expect(Math.min(...shadowXs)).toBeLessThan(-8.5);
    // …that NEVER approaches the graded band (no violation by construction).
    expect(Math.min(...shadowXs)).toBeGreaterThan(medianSideX);

    // Mistake 1 rides the median side past the 3 s lane-keep sustain…
    const blown = drives.get("mistake-blown-out")!;
    expect(Math.min(...blown.trace.samples.map((s) => s.x))).toBeLessThan(medianSideX);
    expect(longestSustainSec(blown, (x) => x < medianSideX)).toBeGreaterThan(
      DEFAULT_RULE_CONFIG.laneKeepSustainSec,
    );
    // …but never off the carriageway (stays inside laneId 2 — basin left −12.19).
    expect(Math.min(...blown.trace.samples.map((s) => s.x))).toBeGreaterThan(-12.19);
  });
});

describe("sc-ac-wind-truck-pass — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays in day dry with ZERO violations and earns CLEAN_DRIVING + SAFE_LANE_CHANGE", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
    expect(commendationCodes(shadow)).toContain("SAFE_LANE_CHANGE");
  });

  it("passes the whole drill in the prudent-wind band and never speeds", () => {
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThanOrEqual(79); // motorway posted 140 — the drill rides ~70–78
    expect(maxKmh).toBeGreaterThan(50); // …and always over the motorway floor
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ac-wind-truck-pass — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Изненадан от порива“: exactly POOR_LANE_KEEPING — the gust blows the car to the median", () => {
    const drive = drives.get("mistake-blown-out")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_WIND_TRUCK_PASS.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("CENTER_LINE_TOUCHED"); // ONEWAY — structurally unreachable
    expect(codes).not.toContain("NOT_KEEPING_RIGHT"); // LEFT indicator held across the pass
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS"); // DRY arms no envelope
  });

  it("„Порив в тясната пролука“: exactly COLLISION — thrown against the trailer", () => {
    const drive = drives.get("mistake-clip-truck")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_WIND_TRUCK_PASS.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("POOR_LANE_KEEPING"); // the lurch stays in-band, no sustain
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
    const again = recordScAcWindTruckPassDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_AC_WIND_TRUCK_PASS.shadow, ...SC_AC_WIND_TRUCK_PASS.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_AC_WIND_TRUCK_PASS.shadow.path, ...SC_AC_WIND_TRUCK_PASS.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
