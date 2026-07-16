/**
 * Trace gate — „Спиране в забранена зона" (sc-pk-ban-stop on pk-ban-v1,
 * doc 72 PK-06; ADR-006 stage 2a ZONE-BAN layer), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW transits the В27 span without stopping and rests at the LEGAL
 *      mark after it → ZERO violations.
 *   2. MISTAKE DEMOS grade EXACTLY ILLEGAL_STOP_IN_BAN_ZONE, ONCE each (the
 *      later legal stop past the zone must not double-bill) — mid-zone and
 *      near-the-edge casual rests.
 *   3. COMMITTED FILES under content/traces/sc-pk-ban-stop/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * The INNOCENT side of the detector (queue stop / red-light stop inside the
 * zone, brief 2 s stops) is locked in rules/__tests__/ban-zone-detectors
 * .test.ts + false-positives.test.ts, and end-to-end on this very map in
 * world/__tests__/ban-districts.test.ts (the queue-lead rest drive).
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-pk-ban-stop-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_PK_BAN_STOP } from "../../lessons/scenario/templates-pk";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScPkBanStopDrive, type ScPkBanStopTraceName } from "../scPkBanStop";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-pk-ban-stop";
const NAMES: ScPkBanStopTraceName[] = ["shadow-correct", "mistake-stop-in-zone", "mistake-stop-at-edge"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

const district = loadDistrict("pk-ban-v1");
const drives = new Map<ScPkBanStopTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScPkBanStopDrive(district, n)]),
);

describe("sc-pk-ban-stop — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("transits the В27 zone without resting and stops legally after it: ZERO violations", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });
  it("rests at the legal mark (~y = 235), past the zone end at 190, with Bulgarian annotations", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(Math.abs(last.y - 235)).toBeLessThan(3);
    expect(last.y).toBeGreaterThan(190); // the rest is OUTSIDE the ban span
    expect(Math.abs(last.speedKmh)).toBeLessThan(1);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-pk-ban-stop — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (["mistake-stop-in-zone", "mistake-stop-at-edge"] as const).entries()) {
    it(`${name}: exactly ILLEGAL_STOP_IN_BAN_ZONE, ONCE (the later legal stop never double-bills)`, () => {
      const drive = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual([...SC_PK_BAN_STOP.mistakes[i].codeRefs].sort());
      expect(violationCodes(drive).filter((c) => c === "ILLEGAL_STOP_IN_BAN_ZONE")).toHaveLength(1);
      expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
      expect(codes).not.toContain("POOR_LANE_KEEPING");
      expect(codes).not.toContain("HESITATION_AT_GREEN");
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
    const again = recordScPkBanStopDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });
  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_PK_BAN_STOP.shadow, ...SC_PK_BAN_STOP.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_PK_BAN_STOP.shadow.path, ...SC_PK_BAN_STOP.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});

describe("pinned geometry — the template copies match the committed map", () => {
  it("pk-ban-v1 meta.scenario mirrors the template recipe (lane center + ban span)", () => {
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
    expect(d.meta.scenario?.banZone?.kind).toBe("noStopping");
    expect(d.meta.scenario?.banZone?.signRef).toBe("В27");
    expect(d.meta.scenario?.banZone?.fromM).toBe(SC_PK_BAN_STOP.map.params.banFromM);
    expect(d.meta.scenario?.banZone?.toM).toBe(SC_PK_BAN_STOP.map.params.banToM);
    expect(d.zones?.[0]?.fromM).toBe(70);
    expect(d.zones?.[0]?.toM).toBe(190);
  });
});
