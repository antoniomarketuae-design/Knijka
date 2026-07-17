/**
 * Trace gate — „Лентови стрелки преди кръстовище" (sc-ln-turn-lane-arrows on
 * ln-arrows-v1, doc 72 SN-04 + JU-14), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns the commendations the
 *      drill is about: SAFE_LANE_CHANGE for each of the two by-the-book
 *      repositioning steps (огледало → мигач → маневра), plus CLEAN_DRIVING.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs — the left turn out
 *      of the „само направо" lane isolates TURN_WITHOUT_INDICATOR +
 *      POOR_LANE_KEEPING (and never CENTER_LINE_TOUCHED: the wide exit drags
 *      the CURB side); the late two-lane swerve isolates the lane-change pair
 *      and never leaks a turn or lane-keeping code.
 *   3. COMMITTED FILES under content/traces/sc-ln-turn-lane-arrows/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * No staged actors, ambient traffic zero, the ns green window pinned by the
 * script's own signalOffsets — every graded fact is the driver's own.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ln-turn-lane-arrows-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_LN_TURN_LANE_ARROWS } from "../../lessons/scenario/templates-lanes2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScLnTurnLaneArrowsDrive, type ScLnTurnLaneArrowsTraceName } from "../scLnTurnLaneArrows";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ln-turn-lane-arrows";
const NAMES: ScLnTurnLaneArrowsTraceName[] = [
  "shadow-correct",
  "mistake-left-from-through",
  "mistake-late-two-lanes",
];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("ln-arrows-v1");
const drives = new Map<ScLnTurnLaneArrowsTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScLnTurnLaneArrowsDrive(district, n)]),
);

describe("sc-ln-turn-lane-arrows — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("repositions across BOTH lanes by the book — two SAFE_LANE_CHANGEs, never a rushed one", () => {
    // Lane 0 („само надясно") → 1 („само направо") → 2 („само наляво"), each
    // with its own mirror glance under the live indicator: the drill's whole
    // point is that the arrow lane is taken EARLY, one lane at a time.
    expect(commendationCodes(shadow).filter((c) => c === "SAFE_LANE_CHANGE").length).toBe(2);
  });

  it("crosses the stop line on GREEN inside the pinned window and turns left from the arrow lane", () => {
    const samples = shadow.trace.samples;
    // At the ns stop line (y = −43.98) the car is settled on the left-arrow
    // lane center (x = 4.06) — it never arrives at the junction mid-manoeuvre.
    const atLine = samples.find((s) => s.y >= -43.98)!;
    expect(atLine).toBeDefined();
    expect(Math.abs(atLine.x - 4.06)).toBeLessThan(1.5);
    // …and well inside SIGNAL_TIMING.greenSec = 20 s of the offset-0 dial.
    expect(atLine.tSec).toBeLessThan(20);
    expect(atLine.indicator).toBe("left");
    const last = samples[samples.length - 1];
    expect(last.x).toBeLessThan(-150); // left onto the west street
    expect(Math.abs(last.y - 4.06)).toBeLessThan(1); // centred in its lane
  });

  it("narrates the arrow reading in Bulgarian", () => {
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ln-turn-lane-arrows — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Ляв завой от лента „само направо““: exactly TURN_WITHOUT_INDICATOR + POOR_LANE_KEEPING", () => {
    const drive = drives.get("mistake-left-from-through")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_LN_TURN_LANE_ARROWS.mistakes[0].codeRefs].sort());
    // The wide exit drags the CURB side, so the toward-oncoming code can never
    // stand in for the lane-keeping grade (one act, one code).
    expect(codes).not.toContain("CENTER_LINE_TOUCHED");
    // The turn is cut from the through lane — the demo must NOT smuggle in a
    // lane-change grade (the junction-mouth deltas are locator artifacts).
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    const last = drive.trace.samples[drive.trace.samples.length - 1];
    expect(last.y).toBeCloseTo(7.7, 1); // still riding the curb edge at the end
  });

  it("„Късно престрояване през две ленти“: exactly the lane-change pair, no turn code", () => {
    const drive = drives.get("mistake-late-two-lanes")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_LN_TURN_LANE_ARROWS.mistakes[1].codeRefs].sort());
    // The indicator DOES come on — after the swerve, for the turn. The isolated
    // fault is the unannounced, unobserved reposition, not the turn itself.
    expect(codes).not.toContain("TURN_WITHOUT_INDICATOR");
    expect(codes).not.toContain("POOR_LANE_KEEPING");
    // BOTH lane boundaries grade: „през две ленти" is two distinct faults.
    expect(violationCodes(drive).filter((c) => c === "LANE_CHANGE_WITHOUT_INDICATOR").length).toBe(2);
    expect(violationCodes(drive).filter((c) => c === "LANE_CHANGE_WITHOUT_MIRROR_CHECK").length).toBe(2);
  });

  it("no demo ever meets a red: the signal is scenery, the arrow is the drill", () => {
    for (const name of NAMES) {
      const codes = violationCodes(drives.get(name)!);
      expect(codes, name).not.toContain("RED_LIGHT_CROSSED");
      expect(codes, name).not.toContain("RED_YELLOW_CROSSED");
      expect(codes, name).not.toContain("YELLOW_LIGHT_NOT_STOPPED");
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
    const again = recordScLnTurnLaneArrowsDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_LN_TURN_LANE_ARROWS.shadow, ...SC_LN_TURN_LANE_ARROWS.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_LN_TURN_LANE_ARROWS.shadow.path,
      ...SC_LN_TURN_LANE_ARROWS.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
