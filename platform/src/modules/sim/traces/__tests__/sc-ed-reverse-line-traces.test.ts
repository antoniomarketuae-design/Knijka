/**
 * ED reverse-line trace gate — „Заден ход по права линия" (sc-ed-reverse-line on
 * poligon-v1, PK-11 / PK-05, Наредба-38), doc 76 §5/§9 stages 3+5:
 *
 *  1. SHADOW replays through the PRODUCTION stack with ZERO violations: mirror +
 *     shoulder before the observed forward pull-away, a mirror before the reverse,
 *     and a straight 25 m reverse hugging the south curb — meeting all three
 *     corridor gates, never touching the curb.
 *  2. THE SITE'S EMPTINESS lets the two demos convict alone: the полигон straight
 *     carries no signals/crossings/actors, and reverse gear is exempt from the
 *     lane/wrong-way detectors (A12), so the curb demo grades COLLISION alone and
 *     the no-look demo grades MOVE_OFF_WITHOUT_OBSERVATION alone.
 *  3. MISTAKE DEMOS grade EXACTLY their template codeRefs (toEqual), one fault per
 *     card — that is the pedagogy AND the assert.
 *  4. COMMITTED FILES under content/traces/sc-ed-reverse-line/ ARE the recordings
 *     of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD (after ANY change to the scripts, recorder, district or rules):
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ed-reverse-line-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_ED_REVERSE_LINE } from "../../lessons/scenario/templates-exam";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScEdReverseLineDrive,
  SC_ED_REVERSE_LINE_TRACE_NAMES,
  type ScEdReverseLineTraceName,
} from "../scEdReverseLine";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ed-reverse-line";
const NAMES = SC_ED_REVERSE_LINE_TRACE_NAMES;

const district = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "poligon-v1.json"), "utf-8"),
);

function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

const drives = new Map<ScEdReverseLineTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScEdReverseLineDrive(district, n)]),
);

describe("sc-ed-reverse-line — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("starts at the template's authored curb pose and reverses 25 m in a straight line", () => {
    const samples = shadow.trace.samples;
    const first = samples[0];
    const last = samples[samples.length - 1];
    // The ghost must begin at the template's denormalized start pose.
    expect(first.x).toBeCloseTo(SC_ED_REVERSE_LINE.start.position!.x, 1);
    expect(first.y).toBeCloseTo(SC_ED_REVERSE_LINE.start.position!.y, 1);
    expect(Math.abs(first.headingDeg - 90)).toBeLessThan(5); // facing east
    // Used a reverse leg (gear −1) and ended at rest 25 m back along the curb.
    expect(samples.some((s) => s.gear < 0)).toBe(true);
    expect(last.x).toBeCloseTo(-145, 0);
    expect(Math.abs(last.y - -136.4)).toBeLessThan(0.6); // held the straight line
    expect(Math.abs(last.speedKmh)).toBeLessThan(1);
    // Faced east throughout (heading ~90, whether creeping forward or reversing).
    for (const s of samples) expect(Math.abs(s.headingDeg - 90)).toBeLessThan(6);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("the pull-away is OBSERVED — the graded move-off carries fresh glances", () => {
    // The absence of MOVE_OFF_WITHOUT_OBSERVATION above is only meaningful if the
    // detector was ARMED and the glances were real. Both are asserted: the drill's
    // ruleConfig enables it, and glances land before the first forward motion.
    expect(SC_ED_REVERSE_LINE.ruleConfig?.moveOffObservationEnabled).toBe(true);
    const firstMotion = shadow.trace.samples.find((s) => s.speedKmh > 5);
    expect(firstMotion).toBeDefined();
    const before = shadow.trace.events.filter(
      (e) => e.kind.startsWith("glance-") && e.tSec <= firstMotion!.tSec,
    );
    expect(before.length).toBeGreaterThanOrEqual(2);
    for (const g of before) expect(firstMotion!.tSec - g.tSec).toBeLessThanOrEqual(7);
  });
});

describe("sc-ed-reverse-line — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Качване на бордюра“: exactly COLLISION — the pull-away was observed", () => {
    const drive = drives.get("mistake-curb")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_ED_REVERSE_LINE.mistakes[0].codeRefs].sort());
    // The isolation that makes the card honest: the оглед before the move-off is
    // real, so PK-05 cannot contaminate the sheet.
    expect(codes).not.toContain("MOVE_OFF_WITHOUT_OBSERVATION");
    const firstMotion = drive.trace.samples.find((s) => s.speedKmh > 5)!;
    const before = drive.trace.events.filter(
      (e) => e.kind.startsWith("glance-") && e.tSec <= firstMotion.tSec,
    );
    expect(before.length).toBeGreaterThanOrEqual(1);
    // The curb was actually mounted: the tail drifted south past the curb line.
    expect(Math.min(...drive.trace.samples.map((s) => s.y))).toBeLessThan(-137.3);
  });

  it("„Заден ход без поглед назад“: exactly MOVE_OFF_WITHOUT_OBSERVATION — nothing looked at", () => {
    const drive = drives.get("mistake-no-look")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_ED_REVERSE_LINE.mistakes[1].codeRefs].sort());
    // NO glance exists before the wheels turn — that IS the fault, asserted
    // positively rather than inferred from the code.
    const firstMotion = drive.trace.samples.find((s) => s.speedKmh > 5)!;
    const before = drive.trace.events.filter(
      (e) => e.kind.startsWith("glance-") && e.tSec <= firstMotion.tSec,
    );
    expect(before).toEqual([]);
    // The reverse itself is clean — it never reaches the curb, so no collision.
    expect(codes).not.toContain("COLLISION");
    expect(Math.min(...drive.trace.samples.map((s) => s.y))).toBeGreaterThan(-137);
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
    const again = recordScEdReverseLineDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_ED_REVERSE_LINE.shadow, ...SC_ED_REVERSE_LINE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_ED_REVERSE_LINE.shadow.path,
      ...SC_ED_REVERSE_LINE.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
