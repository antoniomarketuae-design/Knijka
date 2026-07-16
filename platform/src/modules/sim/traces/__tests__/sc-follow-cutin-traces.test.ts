/**
 * FO-pair trace gate — „Вклиняване" (sc-follow-cutin on ln-v1, doc 72 FO-03),
 * doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays through the production stack with ZERO violations and
 *      earns CLEAN_DRIVING — the whole POINT of FO-03: the stolen-gap phase is
 *      INNOCENT while the driver is re-opening it (followRecoveryRateMps).
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs
 *      (FOLLOWING_TOO_CLOSE ×2 — a same-code pair at different severities)
 *      with NO extras.
 *   3. HONESTY PROBE: a panic-slam right after the cut grades NOTHING — the
 *      cut-in IS a forward cause in the harsh-brake ledger, so
 *      HARSH_BRAKING_NO_CAUSE must not fire (which is exactly why the demo
 *      pair is two holds, per the doc 72 FO-03 guidance).
 *   4. COMMITTED FILES under content/traces/sc-follow-cutin/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-follow-cutin-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_FOLLOW_CUTIN } from "../../lessons/scenario/templates-following";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScFollowCutinDrive,
  recordScFollowCutinPanicSlamProbe,
  type ScFollowCutinTraceName,
} from "../scFollowCutin";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-follow-cutin";
const NAMES: ScFollowCutinTraceName[] = ["shadow-correct", "mistake-hold-gap", "mistake-squeeze"];

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
const drives = new Map<ScFollowCutinTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScFollowCutinDrive(district, n)]),
);

describe("sc-follow-cutin — the shadow gate (doc 76 §5): the stolen gap is innocent", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("the cut really happened AND the cushion was rebuilt (outcome 'yielded')", () => {
    expect(shadow.outcomes).toHaveLength(1);
    expect(shadow.outcomes[0].eventId).toBe("sc-fc-cutter");
    expect(shadow.outcomes[0].success).toBe(true);
    expect(shadow.outcomes[0].detail).toBe("yielded");
  });

  it("drives the whole street calmly with Bulgarian annotations", () => {
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThan(50);
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(330);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-follow-cutin — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Лепене по инерция“: exactly FOLLOWING_TOO_CLOSE, no extras", () => {
    const drive = drives.get("mistake-hold-gap")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_FOLLOW_CUTIN.mistakes[0].codeRefs].sort());
  });

  it("„Затваряне за наказание“: exactly FOLLOWING_TOO_CLOSE, no extras", () => {
    const drive = drives.get("mistake-squeeze")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_FOLLOW_CUTIN.mistakes[1].codeRefs].sort());
  });
});

describe("sc-follow-cutin — the panic-slam honesty probe (doc 72 FO-03)", () => {
  it("a slam right after the cut grades NOTHING: the cut-in IS a forward cause", () => {
    const probe = recordScFollowCutinPanicSlamProbe(district);
    // No HARSH_BRAKING_NO_CAUSE (forward cause present), no FOLLOWING (the
    // gap is opening under braking) — zero violations of any kind.
    expect(violationCodes(probe)).toEqual([]);
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
    const again = recordScFollowCutinDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_FOLLOW_CUTIN.shadow, ...SC_FOLLOW_CUTIN.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_FOLLOW_CUTIN.shadow.path, ...SC_FOLLOW_CUTIN.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
