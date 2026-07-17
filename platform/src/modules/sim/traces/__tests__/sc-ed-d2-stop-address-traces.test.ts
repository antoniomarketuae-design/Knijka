/**
 * ED-03 trace gate — „„Спрете на удобно място" — Лозенец"
 * (sc-ed-d2-stop-address on d2-v1), doc 76 §5/§9 stages 3+5:
 *
 *  1. SHADOW replays through the PRODUCTION stack with ZERO violations and
 *     earns CLEAN_DRIVING: mirror + shoulder at rest, left indicator, a 45 km/h
 *     run down Незабравка, right indicator, and a PLANNED ease-down to a full
 *     stop on the mid-block legal stretch.
 *  2. THE BLOCK'S EMPTINESS IS PROVEN, not assumed: the drill's whole tuning
 *     rests on e76856228.0 carrying no crossing, no derived stop line and no
 *     signal, and on the block's only junction sitting 217 m past the dive
 *     demo's slam. Those are asserted (here and in the exam-districts battery),
 *     because they are exactly what make HARSH_BRAKING_NO_CAUSE causeless.
 *  3. MISTAKE DEMOS grade EXACTLY their template codeRefs — the dive clip
 *     grades HARSH_BRAKING_NO_CAUSE alone (its pull-away is observed, so PK-05
 *     cannot ride along), the no-observation clip grades
 *     MOVE_OFF_WITHOUT_OBSERVATION alone (its indicator is given and its stop is
 *     the shadow's own planned one, so nothing else can attach). One fault per
 *     card is the pedagogy AND the assert.
 *  4. COMMITTED FILES under content/traces/sc-ed-d2-stop-address/ ARE the
 *     recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD (after ANY change to the scripts, recorder, district or rules):
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ed-d2-stop-address-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_ED_D2_STOP_ADDRESS } from "../../lessons/scenario/templates-exam";
import { createWorldRuntime } from "../../runtime";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  buildScEdD2StopAddressRoute,
  recordScEdD2StopAddressDrive,
  scEdD2StopAddressRouteLength,
  SC_ED_D2_STOP_ADDRESS_TRACE_NAMES,
  type ScEdD2StopAddressTraceName,
} from "../scEdD2StopAddress";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const NAMES = SC_ED_D2_STOP_ADDRESS_TRACE_NAMES;

const district = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "d2-v1.json"), "utf-8"),
);

/** The block: Незабравка, one leg. */
const BLOCK_EDGE = "e76856228.0";
/** The chosen legal stretch (the sc-edsa-legal-stop gate). */
const STOP_MARK = { x: 173.85, y: -313.6 };
/** The dive demo's „first gap" (route s≈160). */
const DIVE_MARK = { x: 224.63, y: -235.0 };

function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const drives = new Map<ScEdD2StopAddressTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScEdD2StopAddressDrive(district, n)]),
);

describe("sc-ed-d2-stop-address — the drive line is derived from the committed map", () => {
  it("the single authored leg builds one ~377 m curb-lane route", () => {
    const route = buildScEdD2StopAddressRoute(district);
    expect(route.length).toBeGreaterThan(80);
    expect(scEdD2StopAddressRouteLength(district)).toBeCloseTo(377.3, 0);
    for (const [x, y] of route) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
  });

  it("it starts at the template's authored spawn pose", () => {
    // The template's start.position is a denormalized literal; the ghost must
    // actually begin there or the student and the shadow drive different runs.
    const route = buildScEdD2StopAddressRoute(district);
    expect(route[0][0]).toBeCloseTo(SC_ED_D2_STOP_ADDRESS.start.position!.x, 1);
    expect(route[0][1]).toBeCloseTo(SC_ED_D2_STOP_ADDRESS.start.position!.y, 1);
  });

  it("THE BLOCK IS EMPTY: no crossing, no stop line, no signal on the leg", () => {
    // This is the drill's licence to convict HARSH_BRAKING_NO_CAUSE. Every one
    // of these is an entry in the detector's cause ledger (engine.ts): a
    // crossing zone, a stop line within 60 m or a forbidding signal would make
    // the dive demo's slam structurally INNOCENT and the card a lie.
    const runtime = createWorldRuntime(district);
    expect(district.crossings.filter((c: { edgeId: string }) => c.edgeId === BLOCK_EDGE)).toEqual([]);
    expect(
      runtime.debugStopLines().filter((l) => l.id.split("@")[0] === BLOCK_EDGE),
    ).toEqual([]);
    const edge = district.roads.edges.find((e: { id: string }) => e.id === BLOCK_EDGE);
    for (const nodeId of [edge.from, edge.to]) {
      const it = district.intersections.find((i: { id: string }) => i.id === nodeId);
      if (it) expect(it.signalized, `${nodeId} signalized`).toBe(false);
    }
  });
});

describe("sc-ed-d2-stop-address — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("the pull-away is OBSERVED — the graded move-off carries fresh glances", () => {
    // The absence of MOVE_OFF_WITHOUT_OBSERVATION above is only meaningful if
    // the detector was ARMED and the glances were real. Both are asserted: the
    // drill's ruleConfig enables it, and the glances land before the wheels turn
    // (moveOffLookbackSec = 7).
    expect(SC_ED_D2_STOP_ADDRESS.ruleConfig?.moveOffObservationEnabled).toBe(true);
    const glances = shadow.trace.events.filter((e) => e.kind.startsWith("glance-"));
    expect(glances.length).toBeGreaterThanOrEqual(2);
    const firstMotion = shadow.trace.samples.find((s) => s.speedKmh > 5);
    expect(firstMotion).toBeDefined();
    const before = glances.filter((g) => g.tSec <= firstMotion!.tSec);
    expect(before.length).toBeGreaterThanOrEqual(2);
    for (const g of before) expect(firstMotion!.tSec - g.tSec).toBeLessThanOrEqual(7);
  });

  it("comes to REST on the legal stretch — the site-selection gate, met", () => {
    // sc-edsa-legal-stop is a maxSpeedKmh: 3 reachZone: the drill's site
    // selection is gate-graded (d2-v1 carries no `zones` layer, so no ban-zone
    // detector can exist here — the template's HONEST LIMIT 1). So assert the
    // rest itself, not merely the absence of a code.
    const rested = shadow.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 0.5 && Math.hypot(s.x - STOP_MARK.x, s.y - STOP_MARK.y) < 12,
    );
    expect(rested.length).toBeGreaterThanOrEqual(20 * 3); // >= ~3 s at 20 Hz
  });

  it("the stop was PLANNED, not merely legal: ≤ 32 km/h through the approach gate", () => {
    // „Плавно" cannot be proven by the absence of HARSH_BRAKING_NO_CAUSE — that
    // detector only fires past 7 m/s². The sc-edsa-planned-approach gate is what
    // grades the plan, so assert the speed the shadow actually carries into it.
    const inZone = shadow.trace.samples.filter(
      (s) => Math.hypot(s.x - 184.48, s.y + 279.35) <= 9,
    );
    expect(inZone.length).toBeGreaterThan(0);
    for (const s of inZone) expect(s.speedKmh).toBeLessThanOrEqual(32);
  });

  it("drives the whole block and finishes at the curb with Bulgarian copy", () => {
    const s = shadow.trace.samples;
    let dist = 0;
    for (let i = 1; i < s.length; i++) dist += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
    expect(dist).toBeGreaterThan(250);
    const last = s[s.length - 1];
    expect(Math.hypot(last.x - STOP_MARK.x, last.y - STOP_MARK.y)).toBeLessThan(2);
    expect(last.speedKmh).toBeLessThan(1);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ed-d2-stop-address — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„спиране на първото място“: exactly HARSH_BRAKING_NO_CAUSE — observed pull-away, causeless slam", () => {
    const drive = drives.get("mistake-first-spot-dive")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_ED_D2_STOP_ADDRESS.mistakes[0].codeRefs].sort());
    // The isolation that makes the card honest: this driver DID look before
    // pulling away, so the drill's other fault cannot contaminate the sheet.
    expect(codes).not.toContain("MOVE_OFF_WITHOUT_OBSERVATION");
    const glances = drive.trace.events.filter((e) => e.kind.startsWith("glance-"));
    expect(glances.length).toBeGreaterThanOrEqual(2);
    // The slam was real: it stops at the „first gap", well short of the legal
    // stretch, from a genuine 45 km/h (harshBrakeMinSpeedKmh is 35).
    const last = drive.trace.samples[drive.trace.samples.length - 1];
    expect(Math.hypot(last.x - DIVE_MARK.x, last.y - DIVE_MARK.y)).toBeLessThan(2);
    expect(Math.max(...drive.trace.samples.map((s) => s.speedKmh))).toBeGreaterThan(40);
    // …and it never reaches the place a planned drive would have chosen.
    const atStop = drive.trace.samples.filter(
      (s) => Math.hypot(s.x - STOP_MARK.x, s.y - STOP_MARK.y) < 12,
    );
    expect(atStop).toEqual([]);
  });

  it("„потегляне без оглед“: exactly MOVE_OFF_WITHOUT_OBSERVATION — indicator given, nothing looked at", () => {
    const drive = drives.get("mistake-no-observation")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_ED_D2_STOP_ADDRESS.mistakes[1].codeRefs].sort());
    // NO glance exists before the wheels turn — that IS the fault, asserted
    // positively rather than inferred from the code.
    const firstMotion = drive.trace.samples.find((s) => s.speedKmh > 5)!;
    const before = drive.trace.events.filter(
      (e) => e.kind.startsWith("glance-") && e.tSec <= firstMotion.tSec,
    );
    expect(before).toEqual([]);
    // The rest of the drill is done properly: the same planned stop the shadow
    // makes, on the same legal stretch — one card, one thing to fix.
    expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
    const rested = drive.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 0.5 && Math.hypot(s.x - STOP_MARK.x, s.y - STOP_MARK.y) < 12,
    );
    expect(rested.length).toBeGreaterThan(0);
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", "sc-ed-d2-stop-address");
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", "sc-ed-d2-stop-address");

  for (const name of NAMES) {
    it(`sc-ed-d2-stop-address/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe("sc-ed-d2-stop-address");
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const again = recordScEdD2StopAddressDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_ED_D2_STOP_ADDRESS.shadow, ...SC_ED_D2_STOP_ADDRESS.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith("content/traces/sc-ed-d2-stop-address/")).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/sc-ed-d2-stop-address/${n}.trace.json`);
    expect([
      SC_ED_D2_STOP_ADDRESS.shadow.path,
      ...SC_ED_D2_STOP_ADDRESS.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
