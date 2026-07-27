/**
 * S4 trace gate — „Дъжд без светлини" (sc-ac-rain-lights on ac-rain-v1, doc 72
 * AC-02), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays in DAY rain with ZERO violations and earns CLEAN_DRIVING —
 *      low beams on (set explicitly; the day default is "off"), a centered ~38
 *      km/h drive under the 0.85 × 50 = 42.5 km/h rain envelope.
 *   2. MISTAKE DEMOS grade EXACTLY HEADLIGHTS_OFF_IN_RAIN (never-on and
 *      wipers-only) and NEVER SPEED_TOO_FAST_FOR_CONDITIONS (speed under the
 *      envelope) nor the night lights code (it is day).
 *   3. COMMITTED FILES under content/traces/sc-ac-rain-lights/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/ac-rain-lights-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { OncomingStreamSpec } from "../../contracts";
import { SC_AC_RAIN_LIGHTS } from "../../lessons/scenario/templates-conditions";
import { clipStagedOverrideFor } from "../clipReplay";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScAcRainLightsDrive, type ScAcRainLightsTraceName } from "../scAcRainLights";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ac-rain-lights";
const NAMES: ScAcRainLightsTraceName[] = ["shadow-correct", "mistake-never-on", "mistake-wipers-only"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("ac-rain-v1");
const drives = new Map<ScAcRainLightsTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScAcRainLightsDrive(district, n)]),
);

describe("sc-ac-rain-lights — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays in day rain with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("drives the whole street lit and under the rain envelope with Bulgarian annotations", () => {
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThan(42.5); // under the 0.85 × 50 rain envelope
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(330);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ac-rain-lights — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Виждам си добре“: exactly HEADLIGHTS_OFF_IN_RAIN, no conditions-speed or night code", () => {
    const drive = drives.get("mistake-never-on")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_RAIN_LIGHTS.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
    expect(codes).not.toContain("HEADLIGHTS_OFF_AT_NIGHT");
  });

  it("„Чистачки без светлини“: exactly HEADLIGHTS_OFF_IN_RAIN, no conditions-speed or night code", () => {
    const drive = drives.get("mistake-wipers-only")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_RAIN_LIGHTS.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
    expect(codes).not.toContain("HEADLIGHTS_OFF_AT_NIGHT");
  });
});

// ---------------------------------------------------------------------------
// Founder R0 — „the road is completely visible and this contradicts the
// question itself"
// ---------------------------------------------------------------------------

describe("sc-ac-rain-lights — the clip has somebody the unlit car is invisible TO", () => {
  // The lesson's own teach copy: the lights in rain „не са за да виждаш, а за да
  // те виждат другите". The recording drives an empty street, so the produced
  // clip could only make the claim the founder rejected — that the road is
  // perfectly visible. The CLIP (never the recording, never the grading) gets
  // an oncoming stream on the far bank.
  it("registers a clip-only oncoming stream for both mistakes", () => {
    for (const mi of [0, 1]) {
      const staged = clipStagedOverrideFor(SCENARIO_ID, mi);
      expect(staged, `mistake ${mi}`).not.toBeNull();
      const stream = staged!.find((e) => e.kind === "oncomingStream");
      expect(stream, `mistake ${mi} oncoming`).toBeDefined();
    }
  });

  it("the stream rides the OTHER carriageway — nothing the centred ghost can meet", () => {
    const stream = clipStagedOverrideFor(SCENARIO_ID, 0)!.find(
      (e) => e.kind === "oncomingStream",
    ) as OncomingStreamSpec;
    // Southbound node order = the opposite bank (the narrowMeeting-actor recipe).
    expect(stream.actor.pathNodes).toEqual(["ac-rain-n-end", "ac-rain-n-start"]);
    expect(stream.count).toBeGreaterThanOrEqual(2);
  });

  it("the RECORDING is untouched by it — grading stays byte-identical", () => {
    // The clip override is applied by the capture rig, not by the recorder:
    // the committed trace must be recordable from the template's own staged
    // list alone (which is empty for this drill).
    expect(SC_AC_RAIN_LIGHTS.staged ?? []).toEqual([]);
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
    const again = recordScAcRainLightsDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_AC_RAIN_LIGHTS.shadow, ...SC_AC_RAIN_LIGHTS.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_AC_RAIN_LIGHTS.shadow.path, ...SC_AC_RAIN_LIGHTS.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
