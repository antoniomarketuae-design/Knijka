/**
 * Trace gate — „Един поглед не стига" (sc-junction-scan on tj-scan-v1, doc 72
 * JU-23), doc 76 §5/§9 stages 3+5. The junction-scan detector ships config-OFF;
 * the recorder enables it via ruleConfig (the per-lesson drill opt-in), so the
 * gate replays with the drill ON:
 *   1. SHADOW: full stop + ляво-дясно-ляво scan + a real WAIT for the staged
 *      priority car → ZERO violations (FULL_STOP_AT_STOP_SIGN, no
 *      JUNCTION_SCAN_INCOMPLETE), and the conflict resolves as "yielded".
 *   2. MISTAKE DEMOS grade exactly their authored codeRefs — since T9 staged
 *      the car the lesson always talked about, that is JUNCTION_SCAN_INCOMPLETE
 *      *and* FAILED_TO_YIELD: not looking and not yielding are the same event.
 *      Never STOP_SIGN_NO_FULL_STOP (they stop fully).
 *   3. COMMITTED FILES under content/traces/sc-junction-scan/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-junction-scan-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_JUNCTION_SCAN } from "../../lessons/scenario/templates-junctions";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScJunctionScanDrive, type ScJunctionScanTraceName } from "../scJunctionScan";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-junction-scan";
const NAMES: ScJunctionScanTraceName[] = ["shadow-correct", "mistake-no-scan", "mistake-single-glance"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict(SC_JUNCTION_SCAN.map.districtId);
const drives = new Map<ScJunctionScanTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScJunctionScanDrive(district, n)]),
);

describe("sc-junction-scan — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("full stop + Л-Д-Л scan → ZERO violations, FULL_STOP_AT_STOP_SIGN earned", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("FULL_STOP_AT_STOP_SIGN");
  });

  /**
   * T9 (ledger §2): the drill graded a scan against an empty map for its whole
   * life — the objective, instruction 4, the teach copy and both mistake
   * narrations all asserted a car that did not exist. This pins the car so it
   * cannot be dropped again: the template must stage it, and the correct
   * demonstration must actually wait for it.
   */
  it("stages the priority car its copy promises, and the shadow yields to it", () => {
    expect(SC_JUNCTION_SCAN.staged ?? []).toHaveLength(1);
    const outcome = shadow.outcomes.find((o) => o.eventId === "sc-jscan-conflict");
    expect(outcome, "the staged conflict never resolved — the car was not met").toBeDefined();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
    // …AND THE CARD, which `detail` cannot stand in for — `sc-junction-scan:
    // d9c8e516`. `detail` rides the loose `sawYield` latch (one frame under
    // 8 км/ч); the commendation needs the ACT (YIELD_PRAISE_WAIT_SEC in
    // orchestrator/runners.ts: a banked second of wait for a car that had not
    // cleared, no impact). Asserted apart, or this drill's gate cannot tell the
    // drive that waited from the one that dipped — in either direction.
    expect(commendationCodes(shadow)).toContain("YIELDED_TO_PRIORITY");
  });
});

describe("sc-junction-scan — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (["mistake-no-scan", "mistake-single-glance"] as const).entries()) {
    it(`${name}: exactly its authored codeRefs, no STOP_SIGN_NO_FULL_STOP`, () => {
      const codes = [...new Set(violationCodes(drives.get(name)!))].sort();
      expect(codes).toEqual([...SC_JUNCTION_SCAN.mistakes[i].codeRefs].sort());
      // T9: the unlooked-at car is now real, so the demo takes its priority.
      expect(codes).toContain("FAILED_TO_YIELD");
      expect(codes).not.toContain("STOP_SIGN_NO_FULL_STOP");
      expect(codes).not.toContain("TURN_WITHOUT_INDICATOR");
    });
  }
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
    const again = recordScJunctionScanDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });
  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_JUNCTION_SCAN.shadow, ...SC_JUNCTION_SCAN.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_JUNCTION_SCAN.shadow.path, ...SC_JUNCTION_SCAN.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
