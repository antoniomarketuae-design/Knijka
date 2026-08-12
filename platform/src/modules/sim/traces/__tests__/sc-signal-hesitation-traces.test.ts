/**
 * Trace gate — sc-signal-hesitation (doc 72 JU-09 „Спане на зелено"; a LIVE
 * green phase pinned over the encounter on sx-v1), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations — sees green + a clear box and
 *      proceeds without freezing (green is go).
 *   2. MISTAKE DEMOS grade EXACTLY HESITATION_AT_GREEN — the freeze at the line
 *      and the green-filter dither both sit stationary on green > 5 s; neither
 *      leaks a stop-overshoot/priority/speed code.
 *   3. COMMITTED FILES under content/traces/sc-signal-hesitation/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-signal-hesitation-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_SIGNAL_HESITATION } from "../../lessons/scenario/templates-signals";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScSignalHesitationDrive, type ScSignalHesitationTraceName } from "../scSignalHesitation";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-signal-hesitation";
const NAMES: ScSignalHesitationTraceName[] = ["shadow-correct", "mistake-freeze", "mistake-filter"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

// B40(b): «Спане на зелено» has its own signalized district now — one built
// so the far stop line is READABLE from the seat (see templates-signals.ts).
const district = loadDistrict(SC_SIGNAL_HESITATION.map.districtId);
const drives = new Map<ScSignalHesitationTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScSignalHesitationDrive(district, n)]),
);

describe("sc-signal-hesitation — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations (green + clear box → proceed, no freeze)", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("actually crosses the junction straight through and reaches the north arm", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(40);
    expect(Math.abs(last.x - 4.06)).toBeLessThan(1.5);
    // Never froze: no long stationary stretch mid-drive.
    const minMovingKmh = Math.min(...shadow.trace.samples.filter((s) => s.y > -40 && s.y < 40).map((s) => Math.abs(s.speedKmh)));
    expect(minMovingKmh).toBeGreaterThan(3);
  });
});

describe("sc-signal-hesitation — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Замръзване на зелено“: exactly HESITATION_AT_GREEN, no overshoot/priority/speed leak", () => {
    const drive = drives.get("mistake-freeze")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SIGNAL_HESITATION.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("STOP_LINE_OVERSHOOT");
    expect(codes).not.toContain("FAILED_TO_YIELD");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
  });

  it("„Изпуснато зелено“: exactly HESITATION_AT_GREEN (the green-filter dither)", () => {
    const drive = drives.get("mistake-filter")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SIGNAL_HESITATION.mistakes[1].codeRefs].sort());
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
    const again = recordScSignalHesitationDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_SIGNAL_HESITATION.shadow, ...SC_SIGNAL_HESITATION.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_SIGNAL_HESITATION.shadow.path, ...SC_SIGNAL_HESITATION.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
