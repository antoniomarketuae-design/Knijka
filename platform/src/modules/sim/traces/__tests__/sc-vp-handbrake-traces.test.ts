/**
 * Trace gate — sc-vp-handbrake (doc 72 VP-05 „Потегляне с вдигната ръчна" +
 * PK-05 as the checklist's last step; the config-gated move-off drill on the
 * reused vp-ready-v1 street), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns CLEAN_DRIVING — lever
 *      down, mirror + shoulder at rest, then centered and legal up the street
 *      (the move-off drill ENABLED via ruleConfig).
 *   2. MISTAKE DEMOS grade EXACTLY their one code each — the handbrake demo
 *      bills only HANDBRAKE_LEFT_ON (its glances keep the move-off detector
 *      satisfied), the observation demo bills only MOVE_OFF_WITHOUT_OBSERVATION
 *      (its lever is down). Neither leaks the other's code, or a speed/lane one.
 *   3. COMMITTED FILES under content/traces/sc-vp-handbrake/ ARE the recordings
 *      of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-vp-handbrake-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_VP_HANDBRAKE } from "../../lessons/scenario/templates-cockpit2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScVpHandbrakeDrive, type ScVpHandbrakeTraceName } from "../scVpHandbrake";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-vp-handbrake";
const NAMES: ScVpHandbrakeTraceName[] = ["shadow-correct", "mistake-handbrake-on", "mistake-no-observation"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("vp-ready-v1");
const drives = new Map<ScVpHandbrakeTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScVpHandbrakeDrive(district, n)]),
);

describe("sc-vp-handbrake — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING (move-off drill enabled)", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("runs the whole checklist: lever down, mirror AND shoulder at rest, then a legal centered drive", () => {
    const kinds = shadow.trace.events.map((e) => e.kind);
    // The checklist's last step — both halves, before the wheels turn.
    // EXPECTATION CHANGED 2026-09-01, AND THE PRODUCT IS WHAT CHANGED: this
    // asserted `glance-rear` for the shoulder half because the cabin had no
    // shoulder check and the script recorded a second MIRROR under the comment
    // „mirror + shoulder". `MirrorGlanceKind` now carries `"shoulder"`, the
    // script performs it, and MOVE_OFF_WITHOUT_OBSERVATION requires it.
    expect(kinds).toContain("glance-left");
    expect(kinds).toContain("glance-shoulder");
    // Drives the whole street centered and under the posted 50.
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThan(50);
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(300);
    expect(Math.abs(last.x - 4.06)).toBeLessThan(1.5);
  });
});

describe("sc-vp-handbrake — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Вдигната ръчна“: exactly HANDBRAKE_LEFT_ON — the glances keep move-off innocent", () => {
    const drive = drives.get("mistake-handbrake-on")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_VP_HANDBRAKE.mistakes[0].codeRefs].sort());
    // The isolation claim of this demo: ONE fault, the lever. The observation
    // drill is ENABLED template-wide, so a demo that forgot to glance would
    // silently bill two codes and teach two things at once.
    expect(codes).not.toContain("MOVE_OFF_WITHOUT_OBSERVATION");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("POOR_LANE_KEEPING");
    const kinds = drive.trace.events.map((e) => e.kind);
    expect(kinds).toContain("glance-left");
    // …and the shoulder, for the same reason as the shadow above: the demo's
    // isolation claim („ONE fault, the lever") only holds if the observation it
    // performs is the WHOLE observation the detector now asks for.
    expect(kinds).toContain("glance-shoulder");
  });

  it("„Без оглед“: exactly MOVE_OFF_WITHOUT_OBSERVATION — the lever is genuinely down", () => {
    const drive = drives.get("mistake-no-observation")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_VP_HANDBRAKE.mistakes[1].codeRefs].sort());
    // The mirror image of the demo above: ONE fault, the missing last step.
    expect(codes).not.toContain("HANDBRAKE_LEFT_ON");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    // Really moved off blind: no left/rear glance anywhere in the demo.
    const kinds = drive.trace.events.map((e) => e.kind);
    expect(kinds).not.toContain("glance-left");
    expect(kinds).not.toContain("glance-rear");
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
    const again = recordScVpHandbrakeDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_VP_HANDBRAKE.shadow, ...SC_VP_HANDBRAKE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_VP_HANDBRAKE.shadow.path, ...SC_VP_HANDBRAKE.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
