/**
 * Trace gate — „Изпреварване срещу насрещни" (sc-ov-oncoming-gap on
 * ov-oncoming-v1, doc 72 OV-05 — the overtake-corridor adjudication),
 * doc 76 §5/§9 stages 3+5:
 *   1. SHADOW waits behind the slow lead while the oncoming stream passes and
 *      overtakes in the BIG window → ZERO violations + CLEAN_DRIVING. On this
 *      1+1 road the bank flip renumbers no lane, so NO lane-change code
 *      (violation or SAFE_LANE_CHANGE) can exist — asserted as the
 *      renumbering-free proof (the sc-ov-solid-line discipline).
 *   2. MISTAKE DEMOS grade EXACTLY OVERTAKE_INSUFFICIENT_GAP, once each —
 *      never a collision, never a following/lane code (the corridor bills the
 *      gap gamble alone).
 *   3. COMMITTED FILES under content/traces/sc-ov-oncoming-gap/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ov-oncoming-gap-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OVERTAKE_CONVICT_GAP_SEC } from "../../runtime";
import { SC_OV_ONCOMING_GAP } from "../../lessons/scenario/templates-lanes";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScOvOncomingGapDrive, type ScOvOncomingGapTraceName } from "../scOvOncomingGap";
import type { RecordedDrive } from "../recorder";
import type { SimTick } from "../../rules";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ov-oncoming-gap";
const NAMES: ScOvOncomingGapTraceName[] = ["shadow-correct", "mistake-tight-gap", "mistake-overstay"];

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
/** Convicting prioritySituation events collected from the live tick stream. */
const convictions = new Map<ScOvOncomingGapTraceName, Array<{ gapSec?: number }>>();
const drives = new Map<ScOvOncomingGapTraceName, RecordedDrive>(
  NAMES.map((n) => {
    const seen: Array<{ gapSec?: number }> = [];
    const drive = recordScOvOncomingGapDrive(district, n, {
      onTick: (tick: SimTick) => {
        for (const e of tick.events) {
          if (e.kind === "prioritySituation" && e.situation === "overtake-oncoming" && e.violated) {
            seen.push({ ...(e.gapSec !== undefined ? { gapSec: e.gapSec } : {}) });
          }
        }
      },
    });
    convictions.set(n, seen);
    return [n, drive];
  }),
);

describe("sc-ov-oncoming-gap — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("waits out the occupied lane and passes in the big window: ZERO violations + CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });
  it("the 1+1 bank flip renumbers nothing: no lane-change code of ANY kind exists", () => {
    expect(violationCodes(shadow)).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    expect(violationCodes(shadow)).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
    expect(commendationCodes(shadow)).not.toContain("SAFE_LANE_CHANGE");
  });
  it("the corridor stayed silent for the whole legal pass (no conviction event on any tick)", () => {
    expect(convictions.get("shadow-correct")).toEqual([]);
  });
  it("carries Bulgarian annotations for the ghost narration", () => {
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ov-oncoming-gap — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (["mistake-tight-gap", "mistake-overstay"] as const).entries()) {
    it(`${name}: exactly OVERTAKE_INSUFFICIENT_GAP, once, nothing else`, () => {
      const drive = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual([...SC_OV_ONCOMING_GAP.mistakes[i].codeRefs].sort());
      // Exactly ONE bill for the one gamble.
      expect(violationCodes(drive).filter((c) => c === "OVERTAKE_INSUFFICIENT_GAP")).toHaveLength(1);
      expect(codes).not.toContain("COLLISION");
      expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
      expect(codes).not.toContain("FAILED_TO_YIELD");
      expect(codes).not.toContain("CROSSED_SOLID_LINE");
    });
    it(`${name}: the conviction carries a measured gap inside the convict band`, () => {
      const seen = convictions.get(name)!;
      expect(seen).toHaveLength(1);
      expect(seen[0].gapSec).toBeDefined();
      expect(seen[0].gapSec!).toBeLessThanOrEqual(OVERTAKE_CONVICT_GAP_SEC);
      expect(seen[0].gapSec!).toBeGreaterThan(0);
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
    const again = recordScOvOncomingGapDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });
  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_OV_ONCOMING_GAP.shadow, ...SC_OV_ONCOMING_GAP.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_OV_ONCOMING_GAP.shadow.path, ...SC_OV_ONCOMING_GAP.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});

describe("pinned geometry — the template copies match the committed map", () => {
  it("ov-oncoming-v1 meta.scenario mirrors the template recipe (lane centers, no zones)", () => {
    const d = district as {
      meta: {
        zonesVersion?: number;
        scenario?: {
          laneCenterRightM?: number;
          laneCenterOncomingM?: number;
          params?: { lengthM?: number; maxspeedKmh?: number };
        };
      };
      zones?: unknown[];
    };
    expect(d.meta.zonesVersion).toBeUndefined();
    expect(d.zones).toBeUndefined(); // dashed осева by design — no М1 span
    expect(d.meta.scenario?.laneCenterRightM).toBe(4.06);
    expect(d.meta.scenario?.laneCenterOncomingM).toBe(-4.06);
    expect(d.meta.scenario?.params?.lengthM).toBe(SC_OV_ONCOMING_GAP.map.params.lengthM);
    expect(d.meta.scenario?.params?.maxspeedKmh).toBe(SC_OV_ONCOMING_GAP.map.params.maxspeedKmh);
  });
});
