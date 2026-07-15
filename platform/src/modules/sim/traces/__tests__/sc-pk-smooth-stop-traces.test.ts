/**
 * S3-F trace gate — „Плавно спиране на позиция" (sc-pk-smooth-stop on
 * pk-stop-v1, doc 72 PK-14), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations (eased to a controlled stop AT the
 *      mark, ~6 m short of the van) and never touches it.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs (COLLISION for both
 *      the late-brake overrun and the too-fast approach), and NEVER a speeding
 *      code (both stay at/under the 50 km/h limit).
 *   3. COMMITTED FILES under content/traces/sc-pk-smooth-stop/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-pk-smooth-stop-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_PK_SMOOTH_STOP } from "../../lessons/scenario/templates-pk";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScPkSmoothStopDrive, type ScPkSmoothStopTraceName } from "../scPkSmoothStop";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-pk-smooth-stop";
const NAMES: ScPkSmoothStopTraceName[] = ["shadow-correct", "mistake-overshoot", "mistake-too-fast"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

const district = loadDistrict("pk-stop-v1");
const drives = new Map<ScPkSmoothStopTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScPkSmoothStopDrive(district, n)]),
);

describe("sc-pk-smooth-stop — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations (no contact with the van)", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("stops at the mark (~y=112), short of the van at y=120, with Bulgarian annotations", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(Math.abs(last.y - 112)).toBeLessThan(3); // rested at the mark
    expect(last.y).toBeLessThan(116); // never overran into the van
    expect(Math.abs(last.speedKmh)).toBeLessThan(1); // fully stopped
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-pk-smooth-stop — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Претърколи се в спрелия автомобил“: exactly COLLISION, never a speeding code", () => {
    const drive = drives.get("mistake-overshoot")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PK_SMOOTH_STOP.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
  });

  it("„Твърде бърз подход“: exactly COLLISION, never a speeding code", () => {
    const drive = drives.get("mistake-too-fast")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PK_SMOOTH_STOP.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
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
    const again = recordScPkSmoothStopDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_PK_SMOOTH_STOP.shadow, ...SC_PK_SMOOTH_STOP.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_PK_SMOOTH_STOP.shadow.path, ...SC_PK_SMOOTH_STOP.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
