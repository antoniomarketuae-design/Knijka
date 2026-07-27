/**
 * Trace gate — „Непрекъсната осева линия" (sc-ov-solid-line on ov-solid-v1,
 * doc 72 OV-04 escalation + SN-03; ADR-006 stage 2b LINE TYPES), doc 76 §5/§9
 * stages 3+5:
 *   1. SHADOW holds the middle of the own lane through the whole М1 span →
 *      ZERO violations + CLEAN_DRIVING.
 *   2. MISTAKE DEMOS grade EXACTLY CROSSED_SOLID_LINE — and provably NO
 *      CENTER_LINE_TOUCHED (the stage-2b no-double-bill ruling: the crossing
 *      bills the excursion alone) and NO lane-change/lane-keep codes.
 *   3. COMMITTED FILES under content/traces/sc-ov-solid-line/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ov-solid-line-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_OV_SOLID_LINE } from "../../lessons/scenario/templates-lanes";
import { clipStagedOverrideFor } from "../clipReplay";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScOvSolidLineDrive,
  scOvSolidLineClipStaged,
  type ScOvSolidLineTraceName,
} from "../scOvSolidLine";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ov-solid-line";
const NAMES: ScOvSolidLineTraceName[] = ["shadow-correct", "mistake-pullout", "mistake-drift"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("ov-solid-v1");
const drives = new Map<ScOvSolidLineTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScOvSolidLineDrive(district, n)]),
);

describe("sc-ov-solid-line — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("holds the own lane through the М1 span: ZERO violations, CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });
  it("carries Bulgarian annotations for the ghost narration", () => {
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(3);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ov-solid-line — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (["mistake-pullout", "mistake-drift"] as const).entries()) {
    it(`${name}: exactly CROSSED_SOLID_LINE, once, and NO touch double-bill`, () => {
      const drive = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual([...SC_OV_SOLID_LINE.mistakes[i].codeRefs].sort());
      // Exactly ONE bill for the one excursion across the line.
      expect(violationCodes(drive).filter((c) => c === "CROSSED_SOLID_LINE")).toHaveLength(1);
      // The stage-2b ruling: the crossing grades the опасна ALONE — never the
      // touch tier on the same excursion, and no phantom lane machinery on a
      // 1+1 (the bank flip renumbers no lane).
      expect(codes).not.toContain("CENTER_LINE_TOUCHED");
      expect(codes).not.toContain("POOR_LANE_KEEPING");
      expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
      expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
      expect(codes).not.toContain("WRONG_WAY");
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
    const again = recordScOvSolidLineDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });
  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_OV_SOLID_LINE.shadow, ...SC_OV_SOLID_LINE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_OV_SOLID_LINE.shadow.path, ...SC_OV_SOLID_LINE.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});

describe("pinned geometry — the template copies match the committed map", () => {
  it("ov-solid-v1 meta.scenario mirrors the template recipe (lane center + М1 span)", () => {
    const d = district as {
      meta: {
        zonesVersion?: number;
        scenario?: {
          laneCenterRightM?: number;
          banZone?: { kind?: string; signRef?: string; fromM?: number; toM?: number };
        };
      };
      zones?: Array<{ kind: string; fromM: number; toM: number; signRef: string }>;
    };
    expect(d.meta.zonesVersion).toBe(1);
    expect(d.meta.scenario?.laneCenterRightM).toBe(4.06);
    expect(d.meta.scenario?.banZone?.kind).toBe("solidCenterLine");
    expect(d.meta.scenario?.banZone?.signRef).toBe("М1");
    expect(d.meta.scenario?.banZone?.fromM).toBe(SC_OV_SOLID_LINE.map.params.banFromM);
    expect(d.meta.scenario?.banZone?.toM).toBe(SC_OV_SOLID_LINE.map.params.banToM);
    expect(d.zones?.[0]?.fromM).toBe(90);
    expect(d.zones?.[0]?.toM).toBe(230);
  });
});

describe("the CLIP staging — the fault gets a MOTIVE without moving the verdict", () => {
  // Founder R0: „overall good, the road marking is good, but there is not car
  // infront of the shadow car which we overtake — just the car moving left
  // wrongly." CROSSED_SOLID_LINE is an EGO-ONLY fault, so the graded run
  // legitimately stages nobody; the produced clip then showed a swerve with no
  // reason for it. The slow truck is added FOR THE CLIP ONLY.
  it("the recorded, GRADED run still stages nothing (grading untouched)", () => {
    expect(SC_OV_SOLID_LINE.staged ?? []).toEqual([]);
    for (const name of NAMES) {
      const ids = drives
        .get(name)!
        .outcomes.map((o) => o.eventId);
      expect(ids).toEqual([]);
    }
  });

  it("both mistakes get a slow vehicle on the PLAYER'S OWN bank, ahead of the pull-out", () => {
    for (const mi of [0, 1]) {
      const staged = scOvSolidLineClipStaged(mi);
      expect(staged, `mistake ${mi}`).not.toBeNull();
      expect(staged!.length).toBe((SC_OV_SOLID_LINE.staged ?? []).length + 1);
      const lead = staged![staged!.length - 1];
      expect(lead.kind).toBe("oncomingStream"); // path-locked, emits no events
      if (lead.kind !== "oncomingStream") throw new Error("unreachable");
      // Northbound = the ego's own direction, so it renders IN FRONT, not
      // head-on: ovs-n-start → ovs-n-end is the map's south→north order.
      expect(lead.actor.pathNodes).toEqual(["ovs-n-start", "ovs-n-end"]);
      // Slow enough to be worth crossing a solid line for (both mistakes run
      // 25–30 km/h through the span), and held inside the М1 span so it is in
      // frame at the fault.
      expect(lead.actor.cruiseSpeedMps * 3.6).toBeLessThan(20);
      expect(lead.actor.hold.offsetM).toBeGreaterThan(Number(SC_OV_SOLID_LINE.map.params.banFromM));
      expect(lead.actor.hold.offsetM).toBeLessThan(Number(SC_OV_SOLID_LINE.map.params.banToM));
    }
    // The shadow is never a clip subject — no override for anything else.
    expect(scOvSolidLineClipStaged(2)).toBeNull();
  });

  it("is registered on the clip-capture path (otherwise the clip renders the empty road again)", () => {
    expect(clipStagedOverrideFor(SCENARIO_ID, 0)).not.toBeNull();
    expect(clipStagedOverrideFor(SCENARIO_ID, 1)).not.toBeNull();
  });
});
