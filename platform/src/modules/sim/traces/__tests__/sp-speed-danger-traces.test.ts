/**
 * S3 trace gate — „Над +10 км/ч" (sc-speed-dangerous on ov-keepright-v1, doc 72
 * SP-02 + SP-13; founder R3 redesign doc 62 #31 — the FLOW-PRESSURE drill),
 * doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns CLEAN_DRIVING while the
 *      two staged learn-only flow actors run their illegal pace around it.
 *   2. MISTAKE DEMOS demonstrate the BAND: pacing the flow at ~58 grades
 *      EXACTLY SPEEDING_OVER_LIMIT (never the dangerous code); chasing it to
 *      ~66 grades EXACTLY SPEEDING_DANGEROUS (never the minor band — the fast
 *      band-crossing keeps it from arming) and never FOLLOWING_TOO_CLOSE
 *      (the pace car starts ~75 m ahead and the chase closes ~1.4 m/s).
 *   3. COMMITTED FILES under content/traces/sc-speed-dangerous/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sp-speed-danger-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_SPEED_DANGEROUS } from "../../lessons/scenario/templates-sp";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScSpeedDangerousDrive, type ScSpeedDangerousTraceName } from "../scSpeedDanger";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-speed-dangerous";
const NAMES: ScSpeedDangerousTraceName[] = ["shadow-correct", "mistake-pace-flow", "mistake-chase-flow"];

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
const drives = new Map<ScSpeedDangerousTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScSpeedDangerousDrive(district, n)]),
);

describe("sc-speed-dangerous — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("drives the whole boulevard well under the +10 band, in the RIGHT lane, with Bulgarian annotations", () => {
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThan(50); // never touches the posted limit, let alone +10
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(330);
    expect(Math.abs(last.x - 12.19)).toBeLessThan(1.5); // held the right lane
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("the flow actors are STAGED by the template (the SP-13 unlock), learn-only by contract", () => {
    const kinds = (SC_SPEED_DANGEROUS.staged ?? []).map((s) => s.kind).sort();
    expect(kinds).toEqual(["brakingLeadCar", "rearTailgater"]);
  });
});

describe("sc-speed-dangerous — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Със скоростта на потока — 58“: exactly SPEEDING_OVER_LIMIT, never the dangerous band", () => {
    const drive = drives.get("mistake-pace-flow")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SPEED_DANGEROUS.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
  });

  it("„Гонене на потока — 66“: exactly SPEEDING_DANGEROUS, never the minor band, never tailgating", () => {
    const drive = drives.get("mistake-chase-flow")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SPEED_DANGEROUS.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
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
    const again = recordScSpeedDangerousDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_SPEED_DANGEROUS.shadow, ...SC_SPEED_DANGEROUS.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_SPEED_DANGEROUS.shadow.path, ...SC_SPEED_DANGEROUS.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
