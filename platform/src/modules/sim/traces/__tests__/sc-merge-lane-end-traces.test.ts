/**
 * Trace gate — „Краят на лентата — вливане с цип" (sc-merge-lane-end on
 * ln-merge-v1, ЗДвП чл. 25), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns CLEAN_DRIVING +
 *      SAFE_LANE_CHANGE — spots the drop early, EASES to let the through-lane
 *      car go by, and commits the merge with indicator + mirror well before the
 *      ending lane runs out.
 *   2. MISTAKE DEMOS grade EXACTLY their authored codeRefs — once each: the
 *      silent last-metre merge grades LANE_CHANGE_WITHOUT_INDICATOR and NOTHING
 *      else (the mirror really was checked); the blind merge grades
 *      LANE_CHANGE_WITHOUT_MIRROR_CHECK + COLLISION and NEVER
 *      LANE_CHANGE_WITHOUT_INDICATOR — signalling without looking is the demo.
 *   3. THE MAP'S OWN LAW: no drive ever grades NOT_KEEPING_RIGHT (every merge
 *      commits at or after the taper, and the street is sized so the survivor
 *      lane can never be held for keepRightSustainSec — see gen_ln_merge.mjs),
 *      POOR_LANE_KEEPING (the 34 m commit is a lane change, not a swerve) or
 *      HARSH_BRAKING_NO_CAUSE (the ease is a 4.6 m/s² lift, not a slam).
 *   4. COMMITTED FILES under content/traces/sc-merge-lane-end/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public
 *      copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-merge-lane-end-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_MERGE_LANE_END } from "../../lessons/scenario/templates-merging";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScMergeLaneEndDrive, type ScMergeLaneEndTraceName } from "../scMergeLaneEnd";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-merge-lane-end";
const NAMES: ScMergeLaneEndTraceName[] = [
  "shadow-correct",
  "mistake-no-indicator",
  "mistake-push-out",
];

/** ln-merge-v1 truths (meta.scenario — pinned by ln-merge-districts.test.ts). */
const X_ENDING = 4.06;
const X_THROUGH = -4.06;
const TAPER_FROM_Y = 180;
const TAPER_TO_Y = 240;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("ln-merge-v1");
const drives = new Map<ScMergeLaneEndTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScMergeLaneEndDrive(district, n)]),
);

describe("sc-merge-lane-end — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING + SAFE_LANE_CHANGE", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
    expect(commendationCodes(shadow)).toContain("SAFE_LANE_CHANGE");
  });

  it("rides the ending lane and EASES for the through-lane car instead of racing it", () => {
    // Deep in the approach the car is squarely in the lane that dies…
    const inLane = shadow.trace.samples.filter((s) => s.y > 60 && s.y < 105);
    expect(inLane.length).toBeGreaterThan(0);
    for (const s of inLane) expect(Math.abs(s.x - X_ENDING), `y=${s.y}`).toBeLessThan(0.5);
    // …and it genuinely gives way: the taught beat is the lift, so the speed in
    // the ease window drops well below the approach cruise.
    const cruising = shadow.trace.samples.filter((s) => s.y > 60 && s.y < 100);
    const easing = shadow.trace.samples.filter((s) => s.y > 140 && s.y < 152);
    expect(easing.length).toBeGreaterThan(0);
    expect(Math.max(...easing.map((s) => s.speedKmh))).toBeLessThan(
      Math.max(...cruising.map((s) => s.speedKmh)) - 8,
    );
    // The lift is a lift, not a stop: this drill is never won by halting.
    const running = shadow.trace.samples.filter((s) => s.y > 40 && s.y < 265);
    expect(Math.min(...running.map((s) => s.speedKmh))).toBeGreaterThan(20);
  });

  it("completes the merge INSIDE the taper and holds the survivor lane after it", () => {
    // The lateral commit is done before the ending lane is gone…
    const atTaperEnd = shadow.trace.samples.filter((s) => s.y > TAPER_TO_Y - 10 && s.y < TAPER_TO_Y + 10);
    expect(atTaperEnd.length).toBeGreaterThan(0);
    for (const s of atTaperEnd) expect(Math.abs(s.x - X_THROUGH), `y=${s.y}`).toBeLessThan(0.5);
    // …and it never wanders back toward the lane that no longer exists.
    for (const s of shadow.trace.samples.filter((s) => s.y > TAPER_TO_Y)) {
      expect(s.x, `y=${s.y}`).toBeLessThan(-2);
    }
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(270);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * THE SWEEP FILED THIS DRIVE AS A CRAWL. IT WAS LOOKING AT THE HARNESS.
   *
   *   sc-merge-lane-end/pc-right/04-t161s.png → scMergeLaneEnd.ts:
   *   „The reference 'right' drive crawls at 9–11 км/ч for 160 seconds on a
   *    50 km/h street and finishes stopped against a building facade, off the
   *    carriageway, with a parked car beside it."
   *
   * The demo transport on that very screenshot reads 0:13 / 0:30 with this
   * shadow's own step-5 annotation on the glass; the crawling car is the audit
   * harness's ego, which holds `CRUISE_KMH = 12` by construction
   * (tools/mobile/lesson-audit.mjs — see the file header for the 102-lesson
   * measurement). This case exists so that claim cannot be filed against this
   * trace a second time without the gate saying otherwise.
   * ═══════════════════════════════════════════════════════════════════════════
   */
  it("is a 45 км/ч drive that ends ON the carriageway — not a 160 s crawl into a facade", () => {
    const s = shadow.trace.samples;
    // 1 · THE PACE. The script authors 45 → 30 → 35 → 45; the recorder ramps at
    // 2.2 m/s², so the top lands a hair under the target rather than on it.
    expect(Math.max(...s.map((x) => x.speedKmh))).toBeGreaterThan(44);
    // …and it is not a crawl that happens to touch 45 once: most of the drive
    // is above the harness's entire operating range.
    const brisk = s.filter((x) => x.speedKmh > 30).length;
    expect(brisk / s.length).toBeGreaterThan(0.5);
    // 2 · THE LENGTH. Thirty-odd seconds, against the 160 s of frames.
    expect(s[s.length - 1].tSec).toBeLessThan(45);
    // 3 · WHERE IT STOPS. In the survivor lane, on the road, at the far end of
    // the street (which runs to y = 280) — not off the carriageway.
    const last = s[s.length - 1];
    expect(Math.abs(last.x - X_THROUGH)).toBeLessThan(0.5);
    expect(last.y).toBeGreaterThan(270);
    expect(last.y).toBeLessThan(280);
  });

  it("uses the taught observation pair: TWO left mirror glances AND a left signal before the wheel", () => {
    const kinds = shadow.trace.events.map((e) => e.kind);
    expect(kinds.filter((k) => k === "glance-left").length).toBeGreaterThanOrEqual(2);
    expect(kinds).toContain("signal-on");
    expect(kinds).toContain("signal-off");
  });
});

describe("sc-merge-lane-end — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Вливане без мигач в последния метър“: exactly LANE_CHANGE_WITHOUT_INDICATOR, once", () => {
    const drive = drives.get("mistake-no-indicator")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual([...SC_MERGE_LANE_END.mistakes[0].codeRefs].sort());
    expect(codes.filter((c) => c === "LANE_CHANGE_WITHOUT_INDICATOR")).toHaveLength(1);
    // The mirror really WAS checked — the demo is about the missing signal
    // alone, so the mirror code must never appear.
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
    expect(drive.trace.events.some((e) => e.kind === "glance-left")).toBe(true);
    // …and no indicator was ever raised, at any point in the drive.
    expect(drive.trace.events.some((e) => e.kind === "signal-on")).toBe(false);
    // The merge really did happen, and really did happen LATE: the wheel-over
    // starts past the taper's midpoint and lands inside the last usable metres.
    const merged = drive.trace.samples.filter((s) => s.y > 239);
    expect(merged.length).toBeGreaterThan(0);
    expect(Math.max(...merged.map((s) => Math.abs(s.x - X_THROUGH)))).toBeLessThan(0.5);
    const stillInEndingLane = drive.trace.samples.filter((s) => Math.abs(s.x - X_ENDING) < 0.5);
    expect(Math.max(...stillInEndingLane.map((s) => s.y))).toBeGreaterThan(TAPER_FROM_Y + 20);
  });

  it("„Изтласкване на кола от съседната лента“: exactly the mirror code + COLLISION — the indicator does NOT excuse", () => {
    const drive = drives.get("mistake-push-out")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual([...SC_MERGE_LANE_END.mistakes[1].codeRefs].sort());
    expect(codes.filter((c) => c === "LANE_CHANGE_WITHOUT_MIRROR_CHECK")).toHaveLength(1);
    expect(codes.filter((c) => c === "COLLISION")).toHaveLength(1);
    // The signal really was on — the demo's own irony.
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    expect(drive.trace.events.some((e) => e.kind === "signal-on" && e.detail === "left")).toBe(true);
    // …and NO glance was ever made toward the lane it moved into.
    expect(drive.trace.events.some((e) => e.kind === "glance-left")).toBe(false);
    // The merge itself genuinely crossed into the survivor lane.
    const merged = drive.trace.samples.filter((s) => s.y > 214);
    expect(merged.length).toBeGreaterThan(0);
    expect(Math.min(...merged.map((s) => Math.abs(s.x - X_THROUGH)))).toBeLessThan(0.5);
  });

  it("the map's own law holds on every drive: no keep-right, lane-keeping or speeding leakage", () => {
    for (const name of NAMES) {
      const codes = violationCodes(drives.get(name)!);
      // The keep-right budget (gen_ln_merge.mjs's sizing law): the survivor
      // lane is never held long enough to convict a correctly-merged driver.
      expect(codes, name).not.toContain("NOT_KEEPING_RIGHT");
      // The 34 m commit is a lane change, not a swerve.
      expect(codes, name).not.toContain("POOR_LANE_KEEPING");
      expect(codes, name).not.toContain("CENTER_LINE_TOUCHED");
      // The ease that lets the through car by is a lift, not a slam.
      expect(codes, name).not.toContain("HARSH_BRAKING_NO_CAUSE");
      expect(codes, name).not.toContain("SPEEDING_OVER_LIMIT");
      expect(codes, name).not.toContain("SPEEDING_DANGEROUS");
      expect(codes, name).not.toContain("WRONG_WAY");
    }
  });

  it("the staged through-lane car is pressure scenery: it never grades anything (doc 72 FO-07)", () => {
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
    const again = recordScMergeLaneEndDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_MERGE_LANE_END.shadow, ...SC_MERGE_LANE_END.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_MERGE_LANE_END.shadow.path,
      ...SC_MERGE_LANE_END.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
