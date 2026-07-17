/**
 * Trace gate — „Дете на колело лъкатуши" (sc-vu-child-cyclist on vu-child-v1,
 * doc 72 VU-03 „Колелото завива около дупка"), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns YIELDED_TO_PRIORITY — and
 *      earns it by WAITING: the assert pins that the car was still crawling
 *      behind the child while the swerve ran, and only then went wide.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs. The pair is the
 *      template's whole claim: the SAME metre of air, billed once before the
 *      wobble and twice during it.
 *   3. COMMITTED FILES under content/traces/sc-vu-child-cyclist/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-vu-child-cyclist-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_VU_CHILD_CYCLIST } from "../../lessons/scenario/templates-vru2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScVuChildCyclistDrive, type ScVuChildCyclistTraceName } from "../scVuChildCyclist";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-vu-child-cyclist";
const NAMES: ScVuChildCyclistTraceName[] = [
  "shadow-correct",
  "mistake-pass-in-wobble",
  "mistake-narrow",
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
/** The player's pose at the first sample at/after `y`. */
function at(d: RecordedDrive, y: number) {
  const s = d.trace.samples.find((s) => s.y >= y);
  expect(s, `no sample reached y=${y}`).toBeDefined();
  return s!;
}

const district = loadDistrict("vu-child-v1");
const drives = new Map<ScVuChildCyclistTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScVuChildCyclistDrive(district, n)]),
);

describe("sc-vu-child-cyclist — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("earns YIELDED_TO_PRIORITY — the clearance verdict this template exists for", () => {
    expect(commendationCodes(shadow)).toContain("YIELDED_TO_PRIORITY");
  });

  it("earns it by WAITING: still crawling behind the child while the swerve runs", () => {
    // The template's central claim, made checkable. The wobble fires when the
    // CHILD reaches y ≈ 98 (t ≈ 21.4 s) and settles ~2.5 s later; the shadow is
    // ~20 m astern and under 12 km/h through all of it. Both halves matter:
    //  - the SPEED is what makes the drill safe (чл. 20, ал. 2), and it is also
    //    what keeps the tracker's arm window shut (floor 15 km/h), so the
    //    episode that eventually grades is frozen on the child's NEW line and
    //    the 2 m swerve can never stand it down;
    //  - a shadow that had already committed to a pass here would be measuring
    //    its margin against a line the child was in the act of abandoning.
    for (const y of [60, 70, 80]) {
      expect(at(shadow, y).speedKmh, `y=${y} must still be a crawl`).toBeLessThan(12);
      expect(Math.abs(at(shadow, y).x - 4.06), `y=${y} must still be in lane`).toBeLessThan(0.5);
    }
  });

  it("then commits ONE wide excursion across the crown, and comes home after the child", () => {
    // The pass line is genuinely on the OTHER side of the crown (x < 0) for the
    // whole of it — not an in-lane nudge (which is mistake demo 1's fault).
    for (const y of [130, 155, 180, 195]) {
      expect(at(shadow, y).x, `y=${y} should still be on the wide line`).toBeLessThan(-1.5);
    }
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(265);
    expect(Math.abs(last.x - 4.06)).toBeLessThan(1.5);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-vu-child-cyclist — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Изпреварване точно в лъкатушенето“: exactly VULNERABLE_PASS_TOO_CLOSE + COLLISION", () => {
    const drive = drives.get("mistake-pass-in-wobble")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_VU_CHILD_CYCLIST.mistakes[0].codeRefs].sort());
    // 19 km/h holds the whole pass under followMinSpeedKmh (20) even though the
    // child sits inside the 4 m lead corridor: the clearance verdict must not be
    // shared with a following code, or the card would teach the wrong fault.
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    // The nudge line is 1.75 m off the lane center — inside laneKeepMaxOffsetM.
    // NOTHING about this car's line is illegal; only the gap is. If a lane code
    // ever appeared here, the demo would be blaming the route.
    expect(codes).not.toContain("POOR_LANE_KEEPING");
    expect(codes).not.toContain("CROSSED_SOLID_LINE");
    expect(commendationCodes(drive)).not.toContain("YIELDED_TO_PRIORITY");
  });

  it("„Тесен просвет покрай детето“: exactly VULNERABLE_PASS_TOO_CLOSE — the SAME metre, billed once", () => {
    const drive = drives.get("mistake-narrow")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_VU_CHILD_CYCLIST.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    // THE DEMO'S POINT: he got away with it. The swerve happened behind him, so
    // there is no contact — and the engine bills him anyway, because чл. 42
    // grades the gap you left, not the outcome you were handed. If COLLISION
    // ever appeared here the pair of demos would collapse into one lesson.
    expect(codes).not.toContain("COLLISION");
    expect(commendationCodes(drive)).not.toContain("YIELDED_TO_PRIORITY");
  });

  it("THE PAIR IS THE LESSON: identical margins, and only the clock differs", () => {
    // Both demos pass the child at ~1.1 m of air. The first does it AFTER the
    // swerve (against the child's new line) and collects two codes; the second
    // does it BEFORE (against the curb line) and collects one. If these two ever
    // drifted apart in margin, the comparison the cards make would be a lie.
    const inWobble = drives.get("mistake-pass-in-wobble")!;
    const narrow = drives.get("mistake-narrow")!;
    // …measured where each demo actually draws level with the child.
    const nudgeAir = 4.6625 - at(inWobble, 150).x; // child's APEX line
    const squeezeAir = 6.6625 - at(narrow, 60).x; // child's CURB line
    expect(nudgeAir).toBeCloseTo(squeezeAir, 1);
    // The clock: the narrow demo is 60+ m past the drain before the child gets
    // there — which is the ONLY reason its bill is shorter.
    expect(at(narrow, 100).tSec).toBeLessThan(at(inWobble, 100).tSec);
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
    const again = recordScVuChildCyclistDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_VU_CHILD_CYCLIST.shadow, ...SC_VU_CHILD_CYCLIST.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_VU_CHILD_CYCLIST.shadow.path,
      ...SC_VU_CHILD_CYCLIST.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
