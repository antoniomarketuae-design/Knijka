/**
 * S3-E trace gate — „Еднопосочна улица" (sc-ov-oneway on ov-oneway-v1, doc 72
 * OV-13; founder R3 redesign doc 62 #47 — the T-JUNCTION entry choice, the
 * one-way bar flowing EAST), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns CLEAN_DRIVING (approach,
 *      right indicator, RIGHT turn WITH the eastbound flow, east arm to the
 *      end).
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs (WRONG_WAY) — the
 *      LEFT turn against the one-way flow, full-length and „само няколко
 *      метра", and NOTHING else.
 *   3. COMMITTED FILES under content/traces/sc-ov-oneway/ ARE the recordings of
 *      these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ov-oneway-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_OV_ONEWAY } from "../../lessons/scenario/templates-lanes";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScOvOneWayDrive, type ScOvOneWayTraceName } from "../scOvOneWay";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ov-oneway";
const NAMES: ScOvOneWayTraceName[] = ["shadow-correct", "mistake-wrong-way", "mistake-wrong-way-short"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("ov-oneway-v1");
const drives = new Map<ScOvOneWayTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScOvOneWayDrive(district, n)]),
);

describe("sc-ov-oneway — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("approaches on the stem and turns RIGHT — east, WITH the flow — with Bulgarian annotations", () => {
    const first = shadow.trace.samples[0];
    expect(Math.abs(first.x - 4.06)).toBeLessThan(1.5); // spawned on the approach stem
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.x).toBeGreaterThan(115); // deep on the EAST arm (the legal entry)
    expect(Math.abs(last.y - 200)).toBeLessThan(1.5); // on the bar's lane line
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ov-oneway — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Ляв завой срещу еднопосочната“: exactly WRONG_WAY, deep on the west arm", () => {
    const drive = drives.get("mistake-wrong-way")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_OV_ONEWAY.mistakes[0].codeRefs].sort());
    const last = drive.trace.samples[drive.trace.samples.length - 1];
    expect(last.x).toBeLessThan(-60); // travelled far AGAINST the eastbound flow
  });

  it("„«Само няколко метра» в грешната посока“: exactly WRONG_WAY after ~25 m", () => {
    const drive = drives.get("mistake-wrong-way-short")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_OV_ONEWAY.mistakes[1].codeRefs].sort());
    const last = drive.trace.samples[drive.trace.samples.length - 1];
    expect(last.x).toBeLessThan(-20); // entered against the flow…
    expect(last.x).toBeGreaterThan(-60); // …but only briefly — still the same опасна
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
    const again = recordScOvOneWayDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_OV_ONEWAY.shadow, ...SC_OV_ONEWAY.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_OV_ONEWAY.shadow.path, ...SC_OV_ONEWAY.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
