/**
 * S3-C trace gate — „Дистанция на следване" (sc-follow-distance on fo-follow-v1,
 * doc 72 FO-01), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays through the production stack with ZERO violations and
 *      earns CLEAN_DRIVING (a calm follow that keeps a safe gap for its speed).
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs (FOLLOWING_TOO_CLOSE)
 *      with NO extras — a following demo must not also trip a speed or lane code.
 *   3. COMMITTED FILES under content/traces/sc-follow-distance/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/fo-follow-distance-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_FOLLOW_DISTANCE } from "../../lessons/scenario/templates-following";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScFollowDistanceDrive, type ScFollowDistanceTraceName } from "../scFollowDistance";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-follow-distance";
const NAMES: ScFollowDistanceTraceName[] = ["shadow-correct", "mistake-tailgate", "mistake-gap-melts"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("fo-follow-v1");
const drives = new Map<ScFollowDistanceTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScFollowDistanceDrive(district, n)]),
);

describe("sc-follow-distance — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("follows the lead the whole street at a calm speed with Bulgarian annotations", () => {
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThan(50); // never near the posted limit — this is gap discipline
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(330);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-follow-distance — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Лепене за предния“: exactly FOLLOWING_TOO_CLOSE, no speed/lane extras", () => {
    const drive = drives.get("mistake-tailgate")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_FOLLOW_DISTANCE.mistakes[0].codeRefs].sort());
  });

  it("„Дистанцията се топи“: exactly FOLLOWING_TOO_CLOSE, no speed/lane extras", () => {
    const drive = drives.get("mistake-gap-melts")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_FOLLOW_DISTANCE.mistakes[1].codeRefs].sort());
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
    const again = recordScFollowDistanceDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_FOLLOW_DISTANCE.shadow, ...SC_FOLLOW_DISTANCE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_FOLLOW_DISTANCE.shadow.path, ...SC_FOLLOW_DISTANCE.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
