/**
 * Wave-6 trace gate — „Лентова дисциплина на булеварда" (sc-ln-boulevard-
 * discipline on wb-boulevard-v1, doc 72 OV-11 × OV-02 × OV-12), doc 76 §5/§9
 * stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns the TWO SAFE_LANE_CHANGE
 *      commendations of the arc (out and back). NOT CLEAN_DRIVING: the streak
 *      needs cleanDrivingDistanceM = 250 m and this boulevard is 200 m long —
 *      the map's ceiling, not the drive's fault (see the template header).
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs and nothing else:
 *      the left-lane hog never leaks a lane-change code (it moved BY THE BOOK —
 *      the isolated fault is the stay), and the weave never leaks
 *      LANE_CHANGE_WITHOUT_MIRROR_CHECK (it glances every time — the isolated
 *      fault is the silence) nor CENTER_LINE_TOUCHED (it straddles the 0/1 lane
 *      boundary, not the осева — the one-act-one-code seam of engine §4).
 *   3. COMMITTED FILES under content/traces/sc-ln-boulevard-discipline/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ln-boulevard-discipline-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_LN_BOULEVARD_DISCIPLINE } from "../../lessons/scenario/templates-lanes2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScLnBoulevardDisciplineDrive,
  type ScLnBoulevardDisciplineTraceName,
} from "../scLnBoulevardDiscipline";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ln-boulevard-discipline";
const NAMES: ScLnBoulevardDisciplineTraceName[] = [
  "shadow-correct",
  "mistake-left-lane-hog",
  "mistake-weaving",
];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")) as unknown;
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("wb-boulevard-v1");
const drives = new Map<ScLnBoulevardDisciplineTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScLnBoulevardDisciplineDrive(district, n)]),
);

describe("sc-ln-boulevard-discipline — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("earns SAFE_LANE_CHANGE TWICE — the pass AND the homecoming", () => {
    // The template's whole thesis in one assert: чл. 15 is not „stay right",
    // it is „go left for a reason and COME BACK". A one-commendation shadow
    // would be a shadow that never returned.
    expect(commendationCodes(shadow).filter((c) => c === "SAFE_LANE_CHANGE")).toHaveLength(2);
  });

  it("finishes in the RIGHT lane after visiting the left one, with Bulgarian annotations", () => {
    const samples = shadow.trace.samples;
    const last = samples[samples.length - 1];
    expect(last.y).toBeGreaterThan(180);
    expect(Math.abs(last.x - 12.19)).toBeLessThan(1.0); // home again
    // It really did use the left lane (radius 4 < the 8.125 m lane pitch, so
    // the pass gate is unreachable without this).
    expect(samples.some((s) => Math.abs(s.x - 4.06) < 1.0 && s.y > 100 && s.y < 130)).toBe(true);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ln-boulevard-discipline — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Постоянно каране в лявата лента“: exactly NOT_KEEPING_RIGHT, never a lane-change code", () => {
    const drive = drives.get("mistake-left-lane-hog")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_LN_BOULEVARD_DISCIPLINE.mistakes[0].codeRefs].sort());
    // The move was by the book — mirror, signal, glide. Only the STAY is billed.
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
    expect(commendationCodes(drive)).toContain("SAFE_LANE_CHANGE");
  });

  it("„Лутане между лентите без мигач“: exactly LANE_CHANGE_WITHOUT_INDICATOR + POOR_LANE_KEEPING", () => {
    const drive = drives.get("mistake-weaving")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_LN_BOULEVARD_DISCIPLINE.mistakes[1].codeRefs].sort());
    // He LOOKED every time — the fault is that nobody else knew what he saw.
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
    // The straddle hangs on the 0/1 lane boundary from the LEFT lane, so
    // laneOffsetM is NEGATIVE (toward the curb): centerLineCond never arms and
    // the generic lane-keep episode is the one that bills (engine §4's
    // one-act-one-code seam). A drift toward x = 0 would grade the other code.
    expect(codes).not.toContain("CENTER_LINE_TOUCHED");
    expect(violationCodes(drive).filter((c) => c === "LANE_CHANGE_WITHOUT_INDICATOR").length).toBe(3);
  });

  it("no demo leaks a following or speeding code — the crawler is scenery, and 40 is 40", () => {
    for (const name of NAMES) {
      const codes = new Set(violationCodes(drives.get(name)!));
      expect([...codes], name).not.toContain("FOLLOWING_TOO_CLOSE");
      expect([...codes], name).not.toContain("SPEEDING_OVER_LIMIT");
      expect([...codes], name).not.toContain("COLLISION");
    }
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
    const again = recordScLnBoulevardDisciplineDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_LN_BOULEVARD_DISCIPLINE.shadow, ...SC_LN_BOULEVARD_DISCIPLINE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_LN_BOULEVARD_DISCIPLINE.shadow.path,
      ...SC_LN_BOULEVARD_DISCIPLINE.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
