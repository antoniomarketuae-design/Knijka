/**
 * Trace gate — „Прекъснато изпреварване" (sc-ov-abort on ov-oncoming-v1,
 * doc 72 OV-08 abort discipline — the OV-05 companion), doc 76 §5/§9 stages
 * 3+5. THE ABORT IS SACRED: the shadow pulls out legally, the window
 * collapses against the 90 km/h oncoming, it BRAKES AND TUCKS BACK — and must
 * replay COMPLETELY CLEAN (zero violations): the abort's structural innocence
 * is the whole lesson. The FP battery's hardest case lives here as content.
 *   1. SHADOW: legal pull-out → abort → wait → clean completion on the
 *      emptied road → ZERO violations + CLEAN_DRIVING, and NO corridor
 *      conviction event on any tick.
 *   2. „Настояване" grades EXACTLY OVERTAKE_INSUFFICIENT_GAP (pushing on
 *      instead of aborting); „Челен сблъсък" grades EXACTLY the conviction +
 *      COLLISION (the head-on the abort exists to prevent).
 *   3. COMMITTED FILES under content/traces/sc-ov-abort/ ARE the recordings,
 *      byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ov-abort-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_OV_ABORT } from "../../lessons/scenario/templates-lanes";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScOvAbortDrive, type ScOvAbortTraceName } from "../scOvAbort";
import type { RecordedDrive } from "../recorder";
import type { SimTick } from "../../rules";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ov-abort";
const NAMES: ScOvAbortTraceName[] = ["shadow-correct", "mistake-push-on", "mistake-head-on"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("ov-oncoming-v1");
const convictionCounts = new Map<ScOvAbortTraceName, number>();
const drives = new Map<ScOvAbortTraceName, RecordedDrive>(
  NAMES.map((n) => {
    let seen = 0;
    const drive = recordScOvAbortDrive(district, n, {
      onTick: (tick: SimTick) => {
        for (const e of tick.events) {
          if (e.kind === "prioritySituation" && e.situation === "overtake-oncoming" && e.violated) {
            seen++;
          }
        }
      },
    });
    convictionCounts.set(n, seen);
    return [n, drive];
  }),
);

describe("sc-ov-abort — the shadow gate: THE ABORT IS SACRED (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("aborts the collapsing pass and completes on the emptied road: ZERO violations + CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });
  it("the corridor never emitted a conviction against the abort (tick-level proof)", () => {
    expect(convictionCounts.get("shadow-correct")).toBe(0);
  });
  it("the empty-road completion pass is clean too (no code of the lane-change family)", () => {
    expect(violationCodes(shadow)).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    expect(violationCodes(shadow)).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
  });
  it("carries Bulgarian annotations for the ghost narration", () => {
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ov-abort — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  it("mistake-push-on: exactly OVERTAKE_INSUFFICIENT_GAP, once — pushing on IS the fault", () => {
    const drive = drives.get("mistake-push-on")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_OV_ABORT.mistakes[0].codeRefs].sort());
    expect(violationCodes(drive).filter((c) => c === "OVERTAKE_INSUFFICIENT_GAP")).toHaveLength(1);
    expect(codes).not.toContain("COLLISION");
  });
  it("mistake-head-on: the conviction AND the collision it exists to prevent", () => {
    const drive = drives.get("mistake-head-on")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_OV_ABORT.mistakes[1].codeRefs].sort());
    expect(violationCodes(drive).filter((c) => c === "OVERTAKE_INSUFFICIENT_GAP")).toHaveLength(1);
    // The conviction lands BEFORE the contact — the warning precedes the wall.
    const events = drive.ruleEvents.filter((e) => e.kind === "violation");
    const convictT = events.find((e) => e.code === "OVERTAKE_INSUFFICIENT_GAP")!.t;
    const collisionT = events.find((e) => e.code === "COLLISION")!.t;
    expect(convictT).toBeLessThan(collisionT);
    // The staged-encounter outcome recorded the contact.
    expect(drive.outcomes.some((o) => o.kind === "oncomingStream" && o.detail === "collision")).toBe(true);
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
    const again = recordScOvAbortDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });
  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_OV_ABORT.shadow, ...SC_OV_ABORT.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_OV_ABORT.shadow.path, ...SC_OV_ABORT.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
