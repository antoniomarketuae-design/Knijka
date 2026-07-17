/**
 * ED poligon-chain trace gate — „Полигонът на един дъх" (sc-ed-poligon-chain on
 * poligon-v1, PK-02/PK-11/PK-12/PK-05, Наредба-38 площадка), doc 76 §5/§9
 * stages 3+5 — the capstone that chains the three площадкови маневри:
 *
 *  1. SHADOW replays through the PRODUCTION stack with ZERO violations: the
 *     observed forward pull-away, a perpendicular reverse-park in the EAST band,
 *     a straight reverse along the curb, and a three-point turn in the WEST band
 *     that reverses the travel direction — every swing kept >40 m from a junction
 *     node so `turnStarted` never fires, every forward maneuver move a creep.
 *  2. THE SITE'S EMPTINESS lets the two demos convict alone: the полигон carries
 *     no signals/crossings/actors, so the cone demo grades COLLISION alone and
 *     the stall demo grades ENGINE_STALLED alone — the observed pull-away keeps
 *     MOVE_OFF_WITHOUT_OBSERVATION off both sheets.
 *  3. MISTAKE DEMOS grade EXACTLY their template codeRefs (toEqual), one fault
 *     per card — that is the pedagogy AND the assert.
 *  4. COMMITTED FILES under content/traces/sc-ed-poligon-chain/ ARE the
 *     recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD (after ANY change to the scripts, recorder, district or rules):
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ed-poligon-chain-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_ED_POLIGON_CHAIN } from "../../lessons/scenario/templates-exam";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScEdPoligonChainDrive,
  SC_ED_POLIGON_CHAIN_TRACE_NAMES,
  type ScEdPoligonChainTraceName,
} from "../scEdPoligonChain";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ed-poligon-chain";
const NAMES = SC_ED_POLIGON_CHAIN_TRACE_NAMES;

const district = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "poligon-v1.json"), "utf-8"),
);

function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

const drives = new Map<ScEdPoligonChainTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScEdPoligonChainDrive(district, n)]),
);

describe("sc-ed-poligon-chain — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("starts at the authored EAST-band curb pose facing WEST", () => {
    const first = shadow.trace.samples[0];
    expect(first.x).toBeCloseTo(SC_ED_POLIGON_CHAIN.start.position!.x, 1);
    expect(first.y).toBeCloseTo(SC_ED_POLIGON_CHAIN.start.position!.y, 1);
    expect(Math.abs(first.headingDeg - 270)).toBeLessThan(5); // facing west
  });

  it("chains the three maneuvers: a reverse leg, the bay, the west corridor, direction reversed", () => {
    const s = shadow.trace.samples;
    // Used reverse gear (the bay-reverse + the straight-reverse + the 3-point M2).
    expect(s.some((x) => x.gear < 0)).toBe(true);
    // Rested inside the EAST-band bay (near 143, −127) during the park.
    expect(s.some((x) => Math.hypot(x.x - 143, x.y - -127) < 1.2 && Math.abs(x.speedKmh) < 1)).toBe(true);
    // Reached the WEST-band three-point corridor (near −150, −131).
    expect(s.some((x) => Math.hypot(x.x - -150, x.y - -131.5) < 6)).toBe(true);
    // The three-point reversed the travel direction: the drive ends facing EAST,
    // at rest — the opposite of the WEST it started (270 → 90).
    const last = s[s.length - 1];
    expect(Math.abs(last.headingDeg - 90)).toBeLessThan(6);
    expect(Math.abs(last.speedKmh)).toBeLessThan(1);
    // Longest trace in the catalog, but comfortably inside the 300 s ring.
    expect(shadow.trace.samples.length / 20).toBeLessThan(230);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("the opening pull-away is OBSERVED — the graded move-off carries fresh glances", () => {
    // The absence of MOVE_OFF_WITHOUT_OBSERVATION is only meaningful if the
    // detector was ARMED and the glances were real. Both are asserted.
    expect(SC_ED_POLIGON_CHAIN.ruleConfig?.moveOffObservationEnabled).toBe(true);
    const firstMotion = shadow.trace.samples.find((s) => s.speedKmh > 5);
    expect(firstMotion).toBeDefined();
    const before = shadow.trace.events.filter(
      (e) => e.kind.startsWith("glance-") && e.tSec <= firstMotion!.tSec,
    );
    expect(before.length).toBeGreaterThanOrEqual(2);
    for (const g of before) expect(firstMotion!.tSec - g.tSec).toBeLessThanOrEqual(7);
  });
});

describe("sc-ed-poligon-chain — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Удар в конус по веригата“: exactly COLLISION — the pull-away was observed", () => {
    const drive = drives.get("mistake-cone")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_ED_POLIGON_CHAIN.mistakes[0].codeRefs].sort());
    // The isolation that makes the card honest: the оглед before the move-off is
    // real, so PK-05 cannot contaminate the sheet.
    expect(codes).not.toContain("MOVE_OFF_WITHOUT_OBSERVATION");
    const firstMotion = drive.trace.samples.find((s) => s.speedKmh > 5)!;
    const before = drive.trace.events.filter(
      (e) => e.kind.startsWith("glance-") && e.tSec <= firstMotion.tSec,
    );
    expect(before.length).toBeGreaterThanOrEqual(1);
  });

  it("„Загасване под напрежение“: exactly ENGINE_STALLED — one stall, observed pull-away", () => {
    const drive = drives.get("mistake-stall")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_ED_POLIGON_CHAIN.mistakes[1].codeRefs].sort());
    // Exactly one rising edge — the restart re-arms, but the demo stalls once.
    expect(violationCodes(drive).filter((c) => c === "ENGINE_STALLED")).toHaveLength(1);
    // No cone contact — the stall is the only fault.
    expect(codes).not.toContain("COLLISION");
    // The pull-away was observed (a glance before the first forward metre).
    const firstMotion = drive.trace.samples.find((s) => s.speedKmh > 5)!;
    const before = drive.trace.events.filter(
      (e) => e.kind.startsWith("glance-") && e.tSec <= firstMotion.tSec,
    );
    expect(before.length).toBeGreaterThanOrEqual(1);
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
    const again = recordScEdPoligonChainDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_ED_POLIGON_CHAIN.shadow, ...SC_ED_POLIGON_CHAIN.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_ED_POLIGON_CHAIN.shadow.path,
      ...SC_ED_POLIGON_CHAIN.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
