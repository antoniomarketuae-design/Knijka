/**
 * Trace gate — „Десен завой през велоалея" (sc-vu-bikelane-turn on
 * vu-bikelane-v1, doc 72 VU-01, the TWO-WAY / counter-flow variant), doc 76
 * §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns YIELDED_TO_PRIORITY
 *      (stood outside the junction core while BOTH cycle directions crossed the
 *      mouth, THEN turned right into the cleared gap).
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs:
 *      · „Завой само с поглед назад" → FAILED_TO_YIELD + COLLISION (barged the
 *        counter-flow rider from ahead and hit it);
 *      · „Отрязване на колелото по алеята" → FAILED_TO_YIELD (cut the rider off
 *        in the mouth — the classic right hook), and NEVER a turn/follow code.
 *   3. COMMITTED FILES under content/traces/sc-vu-bikelane-turn/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-vu-bikelane-turn-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_VU_BIKELANE_TURN } from "../../lessons/scenario/templates-vru2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScVuBikelaneTurnDrive, type ScVuBikelaneTurnTraceName } from "../scVuBikelaneTurn";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-vu-bikelane-turn";
const NAMES: ScVuBikelaneTurnTraceName[] = ["shadow-correct", "mistake-only-behind", "mistake-cut-path"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("vu-bikelane-v1");
const drives = new Map<ScVuBikelaneTurnTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScVuBikelaneTurnDrive(district, n)]),
);

describe("sc-vu-bikelane-turn — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns YIELDED_TO_PRIORITY", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("YIELDED_TO_PRIORITY");
  });

  it("stands off, yields both directions, then turns right onto the stem with Bulgarian annotations", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    // Ended down the south stem (a completed right turn), not still eastbound.
    expect(last.y).toBeLessThan(-45);
    expect(Math.abs(last.x - -4.06)).toBeLessThan(1.5); // in the southbound lane center
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-vu-bikelane-turn — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Завой само с поглед назад“: exactly FAILED_TO_YIELD + COLLISION", () => {
    const drive = drives.get("mistake-only-behind")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_VU_BIKELANE_TURN.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("TURN_WITHOUT_INDICATOR");
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
  });

  it("„Отрязване на колелото по алеята“: exactly FAILED_TO_YIELD, never a turn/follow code", () => {
    const drive = drives.get("mistake-cut-path")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_VU_BIKELANE_TURN.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("TURN_WITHOUT_INDICATOR");
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
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
    const again = recordScVuBikelaneTurnDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_VU_BIKELANE_TURN.shadow, ...SC_VU_BIKELANE_TURN.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_VU_BIKELANE_TURN.shadow.path, ...SC_VU_BIKELANE_TURN.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
