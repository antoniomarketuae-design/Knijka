/**
 * Trace gate — „Авария на магистралата — протоколът" (sc-hz-breakdown-pulloff
 * on mw-v1, ЗДвП чл. 58, т. 3 — the motorway breakdown pull-off), doc 76
 * §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns CLEAN_DRIVING — signals,
 *      eases across to the emergency lane in one continuous braking diagonal
 *      and STOPS hard right (x = 8.13). The pull-off is the чл. 58 detector's
 *      ONE innocence case: firm braking keeps the EMERGENCY_LANE_DRIVING clock
 *      reset and the halt disarms it; the ≈ 4.6 m/s² script decel stays under
 *      the harsh-brake threshold, and the arc runs off the normal driving line.
 *   2. MISTAKE DEMOS grade EXACTLY their code, once per drive:
 *      - „Каране по аварийната лента до изхода": EMERGENCY_LANE_DRIVING (one
 *        excursion, one bill) and NEVER a lane-change code (the drift is
 *        mirror + indicator) and NEVER COLLISION (no obstacle staged);
 *      - „Спиране в активната лента при работеща кола": HARSH_BRAKING_NO_CAUSE
 *        (a dashboard lamp is not a forward cause; the telltale runner emits
 *        nothing) and NEVER EMERGENCY_LANE_DRIVING (the slam stays in laneId 1).
 *   3. COMMITTED FILES under content/traces/sc-hz-breakdown-pulloff/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-hz-breakdown-pulloff-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_HZ_BREAKDOWN_PULLOFF } from "../../lessons/scenario/templates-hazards2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScHzBreakdownPulloffDrive,
  type ScHzBreakdownPulloffTraceName,
} from "../scHzBreakdownPulloff";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-hz-breakdown-pulloff";
const NAMES: ScHzBreakdownPulloffTraceName[] = [
  "shadow-correct",
  "mistake-shoulder-drive",
  "mistake-lane-stop",
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

const district = loadDistrict("mw-v1");
const drives = new Map<ScHzBreakdownPulloffTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScHzBreakdownPulloffDrive(district, n)]),
);

describe("sc-hz-breakdown-pulloff — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("pulls off into the emergency lane and rests hard right (x = 8.13, near stop)", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    // Rests in the emergency lane, near the authored halt (8.13, 378).
    expect(last.x).toBeGreaterThan(6);
    expect(last.y).toBeGreaterThan(360);
    expect(last.y).toBeLessThan(400);
    expect(Math.abs(last.speedKmh)).toBeLessThan(3);
    // The approach genuinely happened in the TRAVEL lane (x ≈ 0) at motorway pace.
    const approach = shadow.trace.samples.filter((s) => s.y > 60 && s.y < 220);
    expect(approach.length).toBeGreaterThan(0);
    for (const s of approach) expect(s.x, `y=${s.y}`).toBeLessThan(2);
    expect(Math.max(...approach.map((s) => Math.abs(s.speedKmh)))).toBeGreaterThan(80);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-hz-breakdown-pulloff — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Каране по аварийната лента“: exactly EMERGENCY_LANE_DRIVING, once — never a lane-change code", () => {
    const drive = drives.get("mistake-shoulder-drive")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual(
      [...SC_HZ_BREAKDOWN_PULLOFF.mistakes[0].codeRefs].sort(),
    );
    expect(codes.filter((c) => c === "EMERGENCY_LANE_DRIVING")).toHaveLength(1);
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR"); // the drift is signalled
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
    expect(codes).not.toContain("COLLISION"); // no obstacle staged
    // The demo genuinely rode the emergency lane at speed for hundreds of metres.
    const stint = drive.trace.samples.filter((s) => s.y > 400 && s.y < 720);
    expect(stint.length).toBeGreaterThan(0);
    for (const s of stint) expect(s.x, `y=${s.y}`).toBeGreaterThan(6);
    expect(Math.min(...stint.map((s) => Math.abs(s.speedKmh)))).toBeGreaterThan(70);
    // The polite signalling really happened (the demo's own irony).
    expect(commendationCodes(drive)).toContain("SAFE_LANE_CHANGE");
  });

  it("„Спиране в активната лента“: exactly HARSH_BRAKING_NO_CAUSE — the slam stays in the travel lane", () => {
    const drive = drives.get("mistake-lane-stop")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual(
      [...SC_HZ_BREAKDOWN_PULLOFF.mistakes[1].codeRefs].sort(),
    );
    expect(codes.filter((c) => c === "HARSH_BRAKING_NO_CAUSE")).toHaveLength(1);
    expect(codes).not.toContain("EMERGENCY_LANE_DRIVING"); // never left laneId 1
    expect(codes).not.toContain("COLLISION");
    // It stopped DEAD in the travel lane (x ≈ 0), not the emergency lane.
    const last = drive.trace.samples[drive.trace.samples.length - 1];
    expect(Math.abs(last.x)).toBeLessThan(2);
    expect(Math.abs(last.speedKmh)).toBeLessThan(3);
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
    const again = recordScHzBreakdownPulloffDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [
      SC_HZ_BREAKDOWN_PULLOFF.shadow,
      ...SC_HZ_BREAKDOWN_PULLOFF.mistakes.map((m) => m.traceRef),
    ];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_HZ_BREAKDOWN_PULLOFF.shadow.path,
      ...SC_HZ_BREAKDOWN_PULLOFF.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
