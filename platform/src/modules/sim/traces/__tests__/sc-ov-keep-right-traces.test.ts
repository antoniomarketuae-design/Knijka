/**
 * S3-E trace gate — „Дръж вдясно" (sc-ov-keep-right on ov-keepright-v1, doc 72
 * OV-11 + OV-02; founder R3 redesign doc 62 #45 — the drill SPAWNS IN THE
 * LEFT LANE), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations, STARTS in the LEFT lane, performs
 *      the signalled change and earns CLEAN_DRIVING + SAFE_LANE_CHANGE.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs — since the founder
 *      ruling of 2026-10-01 «KEEP-RIGHT FOLLOWS THE LAW» the two lane-change
 *      codes (no indicator / no mirror). ov-keepright-v1 is a town street,
 *      2+2 at 50 (ЗДвП чл. 15, ал. 2, т. 2): NO demo, and not the shadow, may
 *      bill NOT_KEEPING_RIGHT here.
 *   3. COMMITTED FILES under content/traces/sc-ov-keep-right/ ARE the recordings
 *      of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ov-keep-right-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_OV_KEEP_RIGHT } from "../../lessons/scenario/templates-lanes";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScOvKeepRightDrive, type ScOvKeepRightTraceName } from "../scOvKeepRight";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ov-keep-right";
const NAMES: ScOvKeepRightTraceName[] = ["shadow-correct", "mistake-no-indicator", "mistake-no-mirror"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("ov-keepright-v1");
const drives = new Map<ScOvKeepRightTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScOvKeepRightDrive(district, n)]),
);

describe("sc-ov-keep-right — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING + SAFE_LANE_CHANGE", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
    // The redesign's whole point: the shadow DEMONSTRATES the signalled move.
    expect(commendationCodes(shadow)).toContain("SAFE_LANE_CHANGE");
  });

  it("starts in the LEFT lane, comes home and finishes in the RIGHT lane, with Bulgarian annotations", () => {
    const first = shadow.trace.samples[0];
    expect(Math.abs(first.x - 4.06)).toBeLessThan(1.5); // spawned in the LEFT lane
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(330);
    expect(Math.abs(last.x - 12.19)).toBeLessThan(1.5); // finished in the right-lane center
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ov-keep-right — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Престрояване надясно без мигач“: exactly LANE_CHANGE_WITHOUT_INDICATOR (the mirror WAS checked)", () => {
    const drive = drives.get("mistake-no-indicator")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(SC_OV_KEEP_RIGHT.mistakes[0].codeRefs).toEqual(["LANE_CHANGE_WITHOUT_INDICATOR"]);
    expect(codes).toEqual([...SC_OV_KEEP_RIGHT.mistakes[0].codeRefs].sort());
  });

  it("„Престрояване без поглед в огледалото“: exactly LANE_CHANGE_WITHOUT_MIRROR_CHECK (the stalk WAS on)", () => {
    const drive = drives.get("mistake-no-mirror")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(SC_OV_KEEP_RIGHT.mistakes[1].codeRefs).toEqual(["LANE_CHANGE_WITHOUT_MIRROR_CHECK"]);
    expect(codes).toEqual([...SC_OV_KEEP_RIGHT.mistakes[1].codeRefs].sort());
  });

  it("each demo really is the move home: left lane at the start, right lane at the end", () => {
    for (const name of ["mistake-no-indicator", "mistake-no-mirror"] as const) {
      const s = drives.get(name)!.trace.samples;
      expect(Math.abs(s[0].x - 4.06), name).toBeLessThan(1.5);
      expect(Math.abs(s[s.length - 1].x - 12.19), name).toBeLessThan(1.5);
    }
  });

  it("FOUNDER RULING 2026-10-01: nothing on this town street bills NOT_KEEPING_RIGHT", () => {
    for (const name of NAMES) expect(violationCodes(drives.get(name)!), name).not.toContain("NOT_KEEPING_RIGHT");
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
    const again = recordScOvKeepRightDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_OV_KEEP_RIGHT.shadow, ...SC_OV_KEEP_RIGHT.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_OV_KEEP_RIGHT.shadow.path, ...SC_OV_KEEP_RIGHT.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
