/**
 * S3 trace gate — „Скорост в дъжд през нощта" (sc-speed-rain on sp-rain-v1,
 * doc 72 SP-04), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays (rain + night) with ZERO violations and earns
 *      CLEAN_DRIVING — the 38 km/h drive stays under the 0.85 × 50 = 42.5 km/h
 *      rain envelope, and low beams on at night avoid HEADLIGHTS_OFF_IN_RAIN.
 *   2. MISTAKE DEMOS grade EXACTLY their codeRefs and no headlights code (lights
 *      on): „Като на сухо в дъжда" blasts to ~72 → SPEEDING_DANGEROUS (+22 over
 *      the 50, past the +10 band; too fast through the 55–60 minor band to arm
 *      SPEEDING_OVER_LIMIT, and above graced 55 the conditions code is out of
 *      range); „Каране с потока" holds 48 → SPEED_TOO_FAST_FOR_CONDITIONS.
 *   3. COMMITTED FILES under content/traces/sc-speed-rain/ ARE the recordings
 *      of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sp-speed-rain-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_SPEED_RAIN } from "../../lessons/scenario/templates-sp";
import { clipStagedOverrideFor } from "../clipReplay";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScSpeedRainDrive,
  scSpeedRainClipStaged,
  type ScSpeedRainTraceName,
} from "../scSpeedRain";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-speed-rain";
const NAMES: ScSpeedRainTraceName[] = ["shadow-correct", "mistake-dry-speed", "mistake-flow-along"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("sp-rain-v1");
const drives = new Map<ScSpeedRainTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScSpeedRainDrive(district, n)]),
);

describe("sc-speed-rain — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays under rain+night with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("drives the whole street under the rain envelope with Bulgarian annotations", () => {
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThan(42.5); // under the 0.85 × 50 rain envelope
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(330);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-speed-rain — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Като на сухо в дъжда“ (72): exactly SPEEDING_DANGEROUS, no minor-speeding, conditions, or lights code", () => {
    const drive = drives.get("mistake-dry-speed")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SPEED_RAIN.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT"); // crosses the 55–60 minor band too fast to arm
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS"); // 72 > graced 55: conditions code is capped at the graced limit
    expect(codes).not.toContain("HEADLIGHTS_OFF_IN_RAIN");
  });

  it("„Каране с потока“: exactly SPEED_TOO_FAST_FOR_CONDITIONS, no speeding or lights code", () => {
    const drive = drives.get("mistake-flow-along")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SPEED_RAIN.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("HEADLIGHTS_OFF_IN_RAIN");
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
    const again = recordScSpeedRainDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_SPEED_RAIN.shadow, ...SC_SPEED_RAIN.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_SPEED_RAIN.shadow.path, ...SC_SPEED_RAIN.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});

describe("the CLIP staging — the speed gets something to be wrong AGAINST", () => {
  // Founder R0: „again nothing, a car moving forward, no cars infront of it,
  // this is not showing anything to the user, needs complete re design." Both
  // faults are graded off the ego's own speedometer on an empty 360 m straight,
  // so the frame carried no measure of the speed at all. The wet-pace column is
  // added FOR THE CLIP ONLY.
  it("the recorded, GRADED run still stages nothing (grading untouched)", () => {
    expect(SC_SPEED_RAIN.staged ?? []).toEqual([]);
    for (const name of NAMES) expect(drives.get(name)!.outcomes).toEqual([]);
  });

  it("both mistakes get traffic AHEAD on the player's own bank, at the correct wet pace", () => {
    /** The rain envelope this lesson teaches: 0.85 × 50 = 42.5 km/h. */
    const WET_CAP_KMH = 0.85 * 50;
    for (const mi of [0, 1]) {
      const staged = scSpeedRainClipStaged(mi);
      expect(staged, `mistake ${mi}`).not.toBeNull();
      expect(staged!.length).toBe((SC_SPEED_RAIN.staged ?? []).length + 1);
      const ahead = staged![staged!.length - 1];
      expect(ahead.kind).toBe("oncomingStream"); // path-locked, emits no events
      if (ahead.kind !== "oncomingStream") throw new Error("unreachable");
      // Northbound = the ego's own direction, so the column renders IN FRONT.
      expect(ahead.actor.pathNodes).toEqual(["sp-n-start", "sp-n-end"]);
      // Running the pace the SHADOW holds — that contrast is the whole point:
      // lawful-for-the-weather traffic the speeder is reeling in.
      expect(ahead.actor.cruiseSpeedMps * 3.6).toBeLessThanOrEqual(WET_CAP_KMH);
      expect(ahead.actor.cruiseSpeedMps * 3.6).toBeGreaterThan(30);
      expect(ahead.count).toBeGreaterThanOrEqual(2);
      // Held far enough up the street that the ghost — which rides its recorded
      // rails and cannot brake — never reaches it inside the clip window
      // (fault + CLIP_POST_FAULT_S): at 72 km/h the m0 ghost is at y ≈ 171 when
      // the window closes, and the head car is past 185 by then.
      expect(ahead.actor.hold.offsetM).toBeGreaterThanOrEqual(50);
    }
    expect(scSpeedRainClipStaged(2)).toBeNull();
  });

  it("is registered on the clip-capture path (otherwise the clip renders the empty road again)", () => {
    expect(clipStagedOverrideFor(SCENARIO_ID, 0)).not.toBeNull();
    expect(clipStagedOverrideFor(SCENARIO_ID, 1)).not.toBeNull();
  });
});
