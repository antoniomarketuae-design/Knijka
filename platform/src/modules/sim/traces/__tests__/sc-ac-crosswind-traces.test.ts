/**
 * Crosswind trace gate — „Страничен вятър" (sc-ac-crosswind on fo-follow-v1,
 * the doc 72 AC-12 wind slice), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays in DAY DRY with ZERO violations and earns CLEAN_DRIVING —
 *      ~34 km/h through the exposed segment, the gust met with a SMALL steady
 *      correction (authored drift to x ≈ 3.3, far inside the 3.25 m band),
 *      released smoothly.
 *   2. MISTAKE DEMOS grade their exact codes — NO new rule code, the shipped
 *      lane detectors ARE the grading (doc 72's own call): the loose-hands
 *      50 km/h drift onto the осева → EXACTLY CENTER_LINE_TOUCHED; the panic
 *      over-correction to the curb side → EXACTLY POOR_LANE_KEEPING. Never a
 *      speed code (50 = the posted limit; DRY arms no conditions envelope).
 *   3. DUAL-CHANNEL HONESTY (the 4a law, wind edition): the recorder is
 *      kinematic, so the wind story is AUTHORED — asserted here by pinning
 *      the drift shapes against the lane-detector thresholds derived from
 *      DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM: the shadow NEVER leaves the
 *      band; each mistake crosses its side of it for longer than the sustain.
 *   4. COMMITTED FILES under content/traces/sc-ac-crosswind/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public
 *      copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ac-crosswind-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG } from "../../rules";
import { SC_AC_CROSSWIND } from "../../lessons/scenario/templates-conditions";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScAcCrosswindDrive,
  type ScAcCrosswindTraceName,
} from "../scAcCrosswind";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ac-crosswind";
const NAMES: ScAcCrosswindTraceName[] = ["shadow-correct", "mistake-full-speed", "mistake-overcorrect"];

/** Drawn lane center of the 1+1 street (half of the 8.125 m lane). The lane
 *  detectors measure offsets from THIS geometric center, not the rounded
 *  4.06 the specs pin. */
const LANE_CENTER_X = 8.125 / 2;

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

const district = loadDistrict("fo-follow-v1");
const drives = new Map<ScAcCrosswindTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScAcCrosswindDrive(district, n)]),
);

describe("sc-ac-crosswind — geometry pins against the committed map", () => {
  it("lane, spawn and length constants match fo-follow-v1", () => {
    const raw = district as {
      meta: { scenario: { laneCenterRightM: number; params: Record<string, number> } };
      spawnPoints: Array<{ id: string; x: number; y: number }>;
    };
    expect(raw.meta.scenario.laneCenterRightM).toBe(4.06);
    expect(raw.meta.scenario.params.lengthM).toBe(360);
    expect(SC_AC_CROSSWIND.map.params).toEqual(raw.meta.scenario.params);
    const spawn = raw.spawnPoints.find((s) => s.id === "fo-spawn-approach")!;
    expect(spawn).toBeTruthy();
    expect(spawn.x).toBe(4.06);
    expect(spawn.y).toBe(15);
  });

  it("wind-story honesty: the authored drifts are pinned against the lane-detector band", () => {
    // The single truth the drifts are authored against: laneKeepMaxOffsetM
    // (3.25 m at PERCEPTUAL_ROAD_SCALE 2.5). Toward the осева the band ends
    // at x = 0.8125; toward the curb at x = 7.3125.
    const band = DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM;
    expect(band).toBe(3.25);
    const centerSideX = LANE_CENTER_X - band; // 0.8125
    const curbSideX = LANE_CENTER_X + band; // 7.3125

    // Shadow: a VISIBLE drift (the ghost must tell the wind story)…
    const shadowXs = drives.get("shadow-correct")!.trace.samples.map((s) => s.x);
    expect(Math.min(...shadowXs)).toBeLessThan(3.6);
    // …that NEVER approaches the graded band (no violation by construction).
    expect(Math.min(...shadowXs)).toBeGreaterThan(2.5);
    expect(Math.max(...shadowXs)).toBeLessThanOrEqual(4.07);

    // Mistake 1 rides the осева side past the 3.5 s CENTER_LINE sustain…
    const full = drives.get("mistake-full-speed")!;
    expect(Math.min(...full.trace.samples.map((s) => s.x))).toBeLessThan(centerSideX);
    expect(longestSustainSec(full, (x) => x < centerSideX)).toBeGreaterThan(
      DEFAULT_RULE_CONFIG.centerLineSustainSec,
    );
    // …but stays on its own bank (never fully across — that is OV-04's story).
    expect(Math.min(...full.trace.samples.map((s) => s.x))).toBeGreaterThan(0);

    // Mistake 2 overshoots to the curb side past the 3 s lane-keep sustain.
    const over = drives.get("mistake-overcorrect")!;
    expect(Math.max(...over.trace.samples.map((s) => s.x))).toBeGreaterThan(curbSideX);
    expect(longestSustainSec(over, (x) => x > curbSideX)).toBeGreaterThan(
      DEFAULT_RULE_CONFIG.laneKeepSustainSec,
    );
  });
});

describe("sc-ac-crosswind — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays in day dry with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("slows for the exposed segment and passes the objective zone in the prudent band", () => {
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThanOrEqual(41); // approach 40, gap ridden at ~34
    const inGap = shadow.trace.samples.filter((s) => s.y > 155 && s.y < 260);
    expect(inGap.length).toBeGreaterThan(0);
    expect(Math.max(...inGap.map((s) => Math.abs(s.speedKmh)))).toBeLessThan(36);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ac-crosswind — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Полет през открития участък“: exactly CENTER_LINE_TOUCHED — the gust drift toward oncoming", () => {
    const drive = drives.get("mistake-full-speed")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_CROSSWIND.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("POOR_LANE_KEEPING"); // one act, one code
    expect(codes).not.toContain("SPEEDING_MINOR"); // 50 = the posted limit
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS"); // DRY arms no envelope
  });

  it("„Свръхкорекцията“: exactly POOR_LANE_KEEPING — the second swerve to the curb side", () => {
    const drive = drives.get("mistake-overcorrect")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_CROSSWIND.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("CENTER_LINE_TOUCHED"); // the gust push stays in-band
    // A MISTAKE demo must never collect the shadow's positive: the old staging
    // ran its wrong pose past the 250 m cleanDrivingDistanceM streak and earned
    // CLEAN_DRIVING two tenths before the fault.
    expect(commendationCodes(drive)).not.toContain("CLEAN_DRIVING");
  });
});

// ---------------------------------------------------------------------------
// Founder R0 — „the car moves straight than right close to the side cars than
// left center of the lane again"
// ---------------------------------------------------------------------------

describe("sc-ac-crosswind — the over-correction reads as ONE held wrong pose", () => {
  // This is the demo the clip pilot renders (ev-loss-of-control-recovery). The
  // founder read it as aimless wandering, and the polyline was: the car passed
  // THROUGH each pose instead of sitting in one. The clip's keyframes are
  // [start, fault−2, fault, fault+2, end] — so the fault beat only reads if the
  // car is still out of its lane 2 s either side of the conviction.
  const drive = drives.get("mistake-overcorrect")!;
  const CURB_SIDE_X = LANE_CENTER_X + DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM;

  it("holds the curb-side pose across the whole fault beat (fault ± 2 s)", () => {
    const fault = drive.ruleEvents.find(
      (e) => e.kind === "violation" && e.code === "POOR_LANE_KEEPING",
    )!;
    expect(fault).toBeDefined();
    // FAULT_BEAT_SPAN_S in clips/capture/capturePlan.ts — the keyframe half-width.
    const beat = drive.trace.samples.filter(
      (s) => s.tSec >= fault.t - 2 && s.tSec <= fault.t + 2,
    );
    expect(beat.length).toBeGreaterThan(20); // a real band of samples, not an edge
    expect(Math.min(...beat.map((s) => s.x))).toBeGreaterThan(CURB_SIDE_X);
  });

  it("the yank is a SNAP, not a drift — ≥ 0.15 m of lateral per metre of road", () => {
    // The push-left and the yank-right have to be distinguishable at 25 fps.
    // The old polyline moved 5.1 m sideways over 40 m of road (0.13 m/m) and
    // read as a lazy curve; the yank is authored steeper than the gust push.
    const s = drive.trace.samples;
    let maxRate = 0;
    for (let i = 1; i < s.length; i++) {
      const dy = s[i]!.y - s[i - 1]!.y;
      if (dy <= 0.05) continue;
      maxRate = Math.max(maxRate, (s[i]!.x - s[i - 1]!.x) / dy);
    }
    expect(maxRate).toBeGreaterThan(0.15);
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
    const again = recordScAcCrosswindDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_AC_CROSSWIND.shadow, ...SC_AC_CROSSWIND.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_AC_CROSSWIND.shadow.path, ...SC_AC_CROSSWIND.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
