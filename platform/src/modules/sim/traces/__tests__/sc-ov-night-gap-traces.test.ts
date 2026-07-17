/**
 * Trace gate — „Изпреварване нощем — преценка по фаровете" (sc-ov-night-gap on
 * ov-oncoming-v1 at NIGHT; doc 72 OV-05 corridor × AC-04 night), doc 76 §5/§9
 * stages 3+5:
 *   1. SHADOW follows the lead on LOW beams, refuses the trap car's window and
 *      passes in the dark one → ZERO violations + CLEAN_DRIVING. On this 1+1
 *      road the bank flip renumbers no lane, so NO lane-change code (violation
 *      or SAFE_LANE_CHANGE) can exist — asserted as the renumbering-free proof
 *      (the sc-ov-oncoming-gap discipline).
 *   2. MISTAKE DEMOS grade EXACTLY their one code each, once — the corridor
 *      conviction and the beam duty, never leaking into each other: the
 *      headlight gamble takes no beam code (it runs on low), and the beam demo
 *      takes no corridor code (it never leaves its lane).
 *   3. COMMITTED FILES under content/traces/sc-ov-night-gap/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ov-night-gap-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OVERTAKE_CONVICT_GAP_SEC } from "../../runtime";
import { SC_OV_NIGHT_GAP } from "../../lessons/scenario/templates-lanes2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScOvNightGapDrive, type ScOvNightGapTraceName } from "../scOvNightGap";
import type { RecordedDrive } from "../recorder";
import type { SimTick } from "../../rules";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ov-night-gap";
const NAMES: ScOvNightGapTraceName[] = [
  "shadow-correct",
  "mistake-far-headlights",
  "mistake-high-beams",
];

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
const convictions = new Map<ScOvNightGapTraceName, Array<{ gapSec?: number }>>();
/** Proof the drives really ran in the dark (the whole template's premise). */
const nightTicks = new Map<ScOvNightGapTraceName, { night: number; total: number }>();
const drives = new Map<ScOvNightGapTraceName, RecordedDrive>(
  NAMES.map((n) => {
    const seen: Array<{ gapSec?: number }> = [];
    const counted = { night: 0, total: 0 };
    const drive = recordScOvNightGapDrive(district, n, {
      onTick: (tick: SimTick) => {
        counted.total++;
        if (tick.isNight) counted.night++;
        for (const e of tick.events) {
          if (e.kind === "prioritySituation" && e.situation === "overtake-oncoming" && e.violated) {
            seen.push({ ...(e.gapSec !== undefined ? { gapSec: e.gapSec } : {}) });
          }
        }
      },
    });
    convictions.set(n, seen);
    nightTicks.set(n, counted);
    return [n, drive];
  }),
);

describe("sc-ov-night-gap — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("refuses the trap window, passes in the dark one: ZERO violations + CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });
  it("the whole drive is DARK — the template's premise, on every tick", () => {
    const n = nightTicks.get("shadow-correct")!;
    expect(n.total).toBeGreaterThan(0);
    expect(n.night).toBe(n.total);
  });
  it("night's own duties stay clean: low beams behind the lead, lights never off", () => {
    // The recorder's night default IS low beam, and the shadow states it — so
    // neither чл. 74 (dip) nor the lights-off duty can fire. Night's prudent-
    // speed factor is 1, so the legal 62 km/h pass takes no conditions code.
    expect(violationCodes(shadow)).not.toContain("HIGH_BEAM_NOT_DIPPED");
    expect(violationCodes(shadow)).not.toContain("HEADLIGHTS_OFF_AT_NIGHT");
    expect(violationCodes(shadow)).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
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

describe("sc-ov-night-gap — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  it("mistake-far-headlights: exactly OVERTAKE_INSUFFICIENT_GAP, once, nothing else", () => {
    const drive = drives.get("mistake-far-headlights")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_OV_NIGHT_GAP.mistakes[0].codeRefs].sort());
    // Exactly ONE bill for the one gamble.
    expect(violationCodes(drive).filter((c) => c === "OVERTAKE_INSUFFICIENT_GAP")).toHaveLength(1);
    expect(codes).not.toContain("COLLISION");
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    // The gamble is the GAP, not the beam: this drive runs on low the whole way.
    expect(codes).not.toContain("HIGH_BEAM_NOT_DIPPED");
  });
  it("mistake-far-headlights: the conviction carries a measured gap inside the convict band", () => {
    const seen = convictions.get("mistake-far-headlights")!;
    expect(seen).toHaveLength(1);
    expect(seen[0].gapSec).toBeDefined();
    expect(seen[0].gapSec!).toBeLessThanOrEqual(OVERTAKE_CONVICT_GAP_SEC);
    expect(seen[0].gapSec!).toBeGreaterThan(0);
  });
  it("mistake-high-beams: exactly HIGH_BEAM_NOT_DIPPED, once, nothing else", () => {
    const drive = drives.get("mistake-high-beams")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_OV_NIGHT_GAP.mistakes[1].codeRefs].sort());
    expect(violationCodes(drive).filter((c) => c === "HIGH_BEAM_NOT_DIPPED")).toHaveLength(1);
    // It never leaves its lane, so the corridor cannot bill it — the beam demo
    // and the gap demo are two different lessons, not one drive with two faults.
    expect(convictions.get("mistake-high-beams")).toEqual([]);
    expect(codes).not.toContain("OVERTAKE_INSUFFICIENT_GAP");
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
  });
  it("both demos really ran in the dark — a daylight drive could grade neither", () => {
    for (const name of ["mistake-far-headlights", "mistake-high-beams"] as const) {
      const n = nightTicks.get(name)!;
      expect(n.night, name).toBe(n.total);
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
    const again = recordScOvNightGapDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });
  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_OV_NIGHT_GAP.shadow, ...SC_OV_NIGHT_GAP.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_OV_NIGHT_GAP.shadow.path,
      ...SC_OV_NIGHT_GAP.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});

describe("pinned geometry + the night axis — the template copies match the committed map", () => {
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
    expect(d.meta.scenario?.params?.lengthM).toBe(SC_OV_NIGHT_GAP.map.params.lengthM);
    expect(d.meta.scenario?.params?.maxspeedKmh).toBe(SC_OV_NIGHT_GAP.map.params.maxspeedKmh);
  });
  it("the template is authored DARK on every rung — the drill has no daytime meaning", () => {
    expect(SC_OV_NIGHT_GAP.conditions?.night).toBe(true);
    // L5's rung override sets weather only; compileScenario spreads the rung
    // over the template, so night carries. No `physics` anywhere: the ghost
    // envelope is dry-tuned (ADR-006 stage 4a).
    const l5 = SC_OV_NIGHT_GAP.levels.find((l) => l.level === 5)!;
    expect(l5.conditions?.weather).toBe("rain");
    expect(l5.conditions?.night).toBeUndefined();
    expect(SC_OV_NIGHT_GAP.physics).toBeUndefined();
  });
});
