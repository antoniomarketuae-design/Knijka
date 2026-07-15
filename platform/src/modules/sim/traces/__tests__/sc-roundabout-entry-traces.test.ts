/**
 * S2-C trace gate — „Кръгово движение" (sc-roundabout-entry on rb-mini-v1),
 * doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays through the production stack with ZERO violations and
 *      earns YIELDED_TO_PRIORITY — the staged circulating car resolves
 *      "yielded" (brisk flat-chord entry wins ring priority while the car is
 *      still on the right; matched 12 km/h circulation trails it to the exit).
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs — the barge grades
 *      only FAILED_TO_YIELD, and the no-signal exit grades only
 *      TURN_WITHOUT_INDICATOR (its ENTRY stays clean, YIELDED_TO_PRIORITY).
 *   3. COMMITTED FILES ARE the recordings, byte-for-byte, with public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-roundabout-entry-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_ROUNDABOUT_ENTRY } from "../../lessons/scenario/templates-flow";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScRoundaboutEntryDrive, type ScRoundaboutEntryTraceName } from "../scRoundaboutEntry";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const NAMES: ScRoundaboutEntryTraceName[] = ["shadow-correct", "mistake-barge-entry", "mistake-exit-no-signal"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("rb-mini-v1");
const drives = new Map<ScRoundaboutEntryTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScRoundaboutEntryDrive(district, n)]),
);

describe("sc-roundabout-entry — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns the priority-yield commendation", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("YIELDED_TO_PRIORITY");
  });

  it("the staged circulating car resolves 'yielded'", () => {
    const outcome = shadow.outcomes.find((o) => o.eventId === "sc-rb-circulating");
    expect(outcome).toBeDefined();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
  });

  it("signals RIGHT before the exit and completes northbound with Bulgarian annotations", () => {
    const signalOn = shadow.trace.events.find((e) => e.kind === "signal-on");
    expect(signalOn?.detail).toBe("right");
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(45);
    expect(Math.abs(last.x - 4.06)).toBeLessThan(1.5);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-roundabout-entry — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Влизане без пропускане“: exactly FAILED_TO_YIELD (roundabout tracker)", () => {
    const drive = drives.get("mistake-barge-entry")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_ROUNDABOUT_ENTRY.mistakes[0].codeRefs].sort());
    const failed = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD")!;
    expect(failed.kind === "violation" ? failed.detail : undefined).toBe("roundabout");
    expect(drive.outcomes.find((o) => o.eventId === "sc-rb-circulating")?.detail).toBe("violation");
  });

  it("„Излизане без десен мигач“: exactly TURN_WITHOUT_INDICATOR — the ENTRY stays clean", () => {
    const drive = drives.get("mistake-exit-no-signal")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_ROUNDABOUT_ENTRY.mistakes[1].codeRefs].sort());
    // The demo isolates the exit fault: the entry still earns ring priority
    // and there is no rear-end contamination.
    expect(codes).not.toContain("FAILED_TO_YIELD");
    expect(codes).not.toContain("COLLISION");
    expect(commendationCodes(drive)).toContain("YIELDED_TO_PRIORITY");
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", "sc-roundabout-entry");
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", "sc-roundabout-entry");

  for (const name of NAMES) {
    it(`sc-roundabout-entry/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe("sc-roundabout-entry");
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const again = recordScRoundaboutEntryDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_ROUNDABOUT_ENTRY.shadow, ...SC_ROUNDABOUT_ENTRY.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith("content/traces/sc-roundabout-entry/")).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/sc-roundabout-entry/${n}.trace.json`);
    expect([SC_ROUNDABOUT_ENTRY.shadow.path, ...SC_ROUNDABOUT_ENTRY.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
