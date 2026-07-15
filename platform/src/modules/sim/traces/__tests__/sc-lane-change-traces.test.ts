/**
 * S2-C trace gate — „Смяна на лента" (sc-lane-change on ln-v1), doc 76 §5/§9
 * stages 3+5:
 *   1. SHADOW replays through the production stack with ZERO violations and
 *      earns SAFE_LANE_CHANGE (mirror → signal → shoulder → move, the учебен
 *      ред, all inside the rule lookback windows).
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs — no-indicator
 *      isolates LANE_CHANGE_WITHOUT_INDICATOR (mirror was fine), no-mirror
 *      isolates LANE_CHANGE_WITHOUT_MIRROR_CHECK (indicator was fine).
 *   3. COMMITTED FILES ARE the recordings, byte-for-byte, with public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-lane-change-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_LANE_CHANGE } from "../../lessons/scenario/templates-flow";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScLaneChangeDrive, type ScLaneChangeTraceName } from "../scLaneChange";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const NAMES: ScLaneChangeTraceName[] = ["shadow-correct", "mistake-no-indicator", "mistake-no-mirror"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("ln-v1");
const drives = new Map<ScLaneChangeTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScLaneChangeDrive(district, n)]),
);

describe("sc-lane-change — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns SAFE_LANE_CHANGE", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("SAFE_LANE_CHANGE");
  });

  it("performs the ritual: left glance + left indicator before crossing, ending in the LEFT lane", () => {
    const kinds = shadow.trace.events.map((e) => e.kind);
    expect(kinds.filter((k) => k === "glance-left").length).toBeGreaterThanOrEqual(2);
    const signalOn = shadow.trace.events.find((e) => e.kind === "signal-on");
    expect(signalOn?.detail).toBe("left");
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(Math.abs(last.x - 4.06)).toBeLessThan(1.5); // ends in the left-lane center
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-lane-change — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Престрояване без мигач“: exactly LANE_CHANGE_WITHOUT_INDICATOR (mirror was fine)", () => {
    const drive = drives.get("mistake-no-indicator")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_LANE_CHANGE.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
  });

  it("„Престрояване без огледало“: exactly LANE_CHANGE_WITHOUT_MIRROR_CHECK (indicator was fine)", () => {
    const drive = drives.get("mistake-no-mirror")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_LANE_CHANGE.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", "sc-lane-change");
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", "sc-lane-change");

  for (const name of NAMES) {
    it(`sc-lane-change/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe("sc-lane-change");
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const again = recordScLaneChangeDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_LANE_CHANGE.shadow, ...SC_LANE_CHANGE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith("content/traces/sc-lane-change/")).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/sc-lane-change/${n}.trace.json`);
    expect([SC_LANE_CHANGE.shadow.path, ...SC_LANE_CHANGE.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
