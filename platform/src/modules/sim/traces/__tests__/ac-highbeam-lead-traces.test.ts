/**
 * S4 trace gate — „Дълги светлини зад кола" (sc-ac-highbeam-lead on
 * fo-follow-v1, doc 72 AC-04), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays at night with ZERO violations and earns CLEAN_DRIVING —
 *      low beams on (the recorder's night default), a calm ~28 km/h follow at a
 *      safe ~20 m gap behind the staged lead.
 *   2. MISTAKE DEMOS grade EXACTLY HIGH_BEAM_NOT_DIPPED (highs-all-way and
 *      dip-too-late), never a following, speed or lane code.
 *   3. COMMITTED FILES under content/traces/sc-ac-highbeam-lead/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/ac-highbeam-lead-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_AC_HIGHBEAM_LEAD } from "../../lessons/scenario/templates-conditions";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScAcHighbeamLeadDrive, type ScAcHighbeamLeadTraceName } from "../scAcHighbeamLead";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ac-highbeam-lead";
const NAMES: ScAcHighbeamLeadTraceName[] = ["shadow-correct", "mistake-highs-all-way", "mistake-late-dip"];

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
const drives = new Map<ScAcHighbeamLeadTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScAcHighbeamLeadDrive(district, n)]),
);

describe("sc-ac-highbeam-lead — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays at night behind the lead with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("drives the whole street lit, centered, at a safe gap and legal", () => {
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThan(50); // under the posted limit
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(330);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ac-highbeam-lead — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Дълги през целия път“: exactly HIGH_BEAM_NOT_DIPPED, no following/speed/lane code", () => {
    const drive = drives.get("mistake-highs-all-way")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_HIGHBEAM_LEAD.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    expect(codes).not.toContain("POOR_LANE_KEEPING");
  });

  it("„Не превключи щом настигна“: exactly HIGH_BEAM_NOT_DIPPED, no following/speed/lane code", () => {
    const drive = drives.get("mistake-late-dip")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_HIGHBEAM_LEAD.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    expect(codes).not.toContain("POOR_LANE_KEEPING");
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
    const again = recordScAcHighbeamLeadDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_AC_HIGHBEAM_LEAD.shadow, ...SC_AC_HIGHBEAM_LEAD.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_AC_HIGHBEAM_LEAD.shadow.path, ...SC_AC_HIGHBEAM_LEAD.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
