/**
 * N8 slice-1 trace gate — „Изпреварване на велосипедист" (sc-vu-pass-clearance
 * on vu-pass-v1, doc 72 VU-02), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns YIELDED_TO_PRIORITY (the
 *      wide-arc pass adjudicated clean by the runtime vulnerable-pass tracker).
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs
 *      (VULNERABLE_PASS_TOO_CLOSE for both the slow squeeze and the fast
 *      late-dive pass), and NEVER a follow/collision code (the squeeze rides
 *      under the follow floor; the dive keeps the corridor time under the
 *      follow sustain; both lines stay outside the contact radius).
 *   3. COMMITTED FILES under content/traces/sc-vu-pass-clearance/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-vu-pass-clearance-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_VU_PASS_CLEARANCE } from "../../lessons/scenario/templates-vru";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScVuPassDrive, type ScVuPassTraceName } from "../scVuPass";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-vu-pass-clearance";
const NAMES: ScVuPassTraceName[] = ["shadow-correct", "mistake-squeeze", "mistake-fast-close"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("vu-pass-v1");
const drives = new Map<ScVuPassTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScVuPassDrive(district, n)]),
);

describe("sc-vu-pass-clearance — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns YIELDED_TO_PRIORITY from the clean pass", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("YIELDED_TO_PRIORITY");
  });

  it("drives the wide arc and returns to the lane, with Bulgarian annotations", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    // Ended far up the street, back in the northbound lane.
    expect(last.y).toBeGreaterThan(300);
    expect(Math.abs(last.x - 4.06)).toBeLessThan(1.5);
    // The pass itself happened on the wide line (x ≈ 2.2 mid-street).
    const wide = shadow.trace.samples.some((s) => s.y > 100 && s.y < 190 && s.x < 2.6);
    expect(wide).toBe(true);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-vu-pass-clearance — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Провиране покрай велосипедиста“: exactly VULNERABLE_PASS_TOO_CLOSE, never a follow/collision code", () => {
    const drive = drives.get("mistake-squeeze")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_VU_PASS_CLEARANCE.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    expect(codes).not.toContain("COLLISION");
    expect(commendationCodes(drive)).not.toContain("YIELDED_TO_PRIORITY");
  });

  it("„Бързо изпреварване с късно отместване“: exactly VULNERABLE_PASS_TOO_CLOSE, never a follow/collision code", () => {
    const drive = drives.get("mistake-fast-close")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_VU_PASS_CLEARANCE.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    expect(codes).not.toContain("COLLISION");
    expect(commendationCodes(drive)).not.toContain("YIELDED_TO_PRIORITY");
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
    const again = recordScVuPassDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_VU_PASS_CLEARANCE.shadow, ...SC_VU_PASS_CLEARANCE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_VU_PASS_CLEARANCE.shadow.path,
      ...SC_VU_PASS_CLEARANCE.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
