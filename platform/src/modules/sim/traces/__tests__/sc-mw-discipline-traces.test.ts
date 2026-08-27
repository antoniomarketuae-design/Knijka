/**
 * Trace gate — „Дисциплина на магистралата" (sc-mw-discipline on mw-v1,
 * doc 72 SP-10 + OV-11 at speed), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns CLEAN_DRIVING — a
 *      genuine flow-speed drive: ~125 km/h held in the RIGHT travel lane
 *      (laneId 1 — the rightmost REQUIRED lane under the emergencyLaneRight
 *      seam) for the whole kilometre.
 *   2. MISTAKE DEMOS grade EXACTLY their codes, once each:
 *      - the 130 km/h left-lane hog → NOT_KEEPING_RIGHT (the shipped
 *        keep-right detector at motorway speed — zero new code, the ln-v1
 *        precedent) and NEVER a speeding code (130 < 140);
 *      - the causeless 40 km/h crawl → DRIVING_TOO_SLOW_FOR_MOTORWAY, with
 *        the accel/brake transitions through the sub-50 band staying exempt
 *        (the A12 steady-state gate).
 *   3. COMMITTED FILES under content/traces/sc-mw-discipline/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public
 *      copies.
 *
 * RECORDER SPEED HONESTY: the gate asserts the shadow/hog really reached
 * their authored ~125/130 km/h — the kinematic recorder has no top-speed cap
 * and the straight never triggers its curve cap, so a silent rewrite of the
 * story would fail here.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-mw-discipline-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_MW_DISCIPLINE } from "../../lessons/scenario/templates-sp";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScMwDisciplineDrive, type ScMwDisciplineTraceName } from "../scMwDiscipline";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-mw-discipline";
const NAMES: ScMwDisciplineTraceName[] = ["shadow-correct", "mistake-left-hog", "mistake-crawl"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
/**
 * The raw reducer bills for one code, in order, with the w11 re-grade marking
 * (rules/engine.ts MOTORWAY_CRAWL_REGRADE_SEC): a continuing второстепенна
 * breach is billed TWICE — the teach the free mini-lesson spends, and the
 * charge it consumed — and lessons/engine.ts drops the MARKED one wherever the
 * code was already charged, so the изпитен лист still sees one point.
 */
function billMarks(d: RecordedDrive, code: string): boolean[] {
  return d.ruleEvents
    .filter((e) => e.kind === "violation" && e.code === code)
    .map((e) => (e as { regrade?: true }).regrade === true);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}
function maxKmh(d: RecordedDrive): number {
  return Math.max(...d.trace.samples.map((s) => Math.abs(s.speedKmh)));
}

const district = loadDistrict("mw-v1");
const drives = new Map<ScMwDisciplineTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScMwDisciplineDrive(district, n)]),
);

describe("sc-mw-discipline — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("really cruises at flow speed in the RIGHT travel lane (the recorder-honesty assert)", () => {
    // The authored 125 must be REACHED (no silent kinematic rewrite).
    expect(maxKmh(shadow)).toBeGreaterThan(120);
    expect(maxKmh(shadow)).toBeLessThan(126);
    // …and held in the cruise lane: x = 0 throughout (never the left lane at
    // -8.12, never the emergency lane at +8.13).
    for (const s of shadow.trace.samples) {
      expect(Math.abs(s.x), `t=${s.tSec}`).toBeLessThan(2);
    }
    // Reaches the end of the segment.
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(930);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-mw-discipline — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Висене в лявата лента при 130“: exactly NOT_KEEPING_RIGHT, once — and never a speeding code", () => {
    const drive = drives.get("mistake-left-hog")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual([...SC_MW_DISCIPLINE.mistakes[0].codeRefs].sort());
    expect(codes.filter((c) => c === "NOT_KEEPING_RIGHT")).toHaveLength(1);
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT"); // 130 < 140: the speed itself is legal
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    expect(codes).not.toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");
    // The hog genuinely rode the LEFT lane at speed (the OV-11-at-130 story).
    expect(maxKmh(drive)).toBeGreaterThan(125);
    const cruising = drive.trace.samples.filter((s) => s.y > 100 && s.y < 900);
    for (const s of cruising) expect(s.x, `y=${s.y}`).toBeLessThan(-6);
  });

  it("„Пълзене с 40“: exactly DRIVING_TOO_SLOW_FOR_MOTORWAY — taught, then charged, transitions exempt", () => {
    const drive = drives.get("mistake-crawl")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual([...SC_MW_DISCIPLINE.mistakes[1].codeRefs].sort());
    // ONE code, TWO bills, the second marked (w11, MOTORWAY_CRAWL_REGRADE_SEC).
    // The single raw bill is what `sc-mw-discipline:9e8f6966` photographed:
    // 273 s of crawling, «Второстепенни 0 | 0», the code shown only under
    // «Учебни моменти (не влизат в точките)».
    expect(billMarks(drive, "DRIVING_TOO_SLOW_FOR_MOTORWAY")).toEqual([false, true]);
    expect(codes).not.toContain("NOT_KEEPING_RIGHT"); // the crawl stays in the RIGHT lane
    // The crawl really held ~40 — far under the flow floor, never over it.
    expect(maxKmh(drive)).toBeLessThan(45);
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
    const again = recordScMwDisciplineDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_MW_DISCIPLINE.shadow, ...SC_MW_DISCIPLINE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_MW_DISCIPLINE.shadow.path, ...SC_MW_DISCIPLINE.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
