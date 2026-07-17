/**
 * Wave-3 trace gate — the priority-road pass (doc 76 §5/§9, stages 3+5):
 * sc-jx-priority-confidence on tj-stop-v1.
 *
 *  1. The SHADOW replays through the PRODUCTION stack (runtime + traffic +
 *     scenario director + rules) with ZERO violations — while a car waits at the
 *     Б2 on the right and a лепка sits on its bumper. Passing a junction and
 *     having the engine find nothing to say IS this template.
 *  2. STRUCTURAL IMMUNITY has teeth: no drive of the three produces a
 *     prioritySituation event of ANY kind. That is the district's doing (tj-n-c
 *     carries a derived Б2 line → it is not an uncontrolled junction → the
 *     right-hand-rule tracker never arms), and if a future change to the
 *     stop-line heuristic silently flipped tj-n-c to uncontrolled, this drill
 *     would start billing the player FAILED_TO_YIELD for having priority. These
 *     asserts are the tripwire.
 *  3. The WAITING car is proven innocent by its OWN clock: it resolves "clear"
 *     AFTER the player has left the junction, i.e. it pulled out behind them.
 *  4. MISTAKE DEMOS grade EXACTLY their template codeRefs — and the phantom
 *     brake is proven to respect the harsh-brake detector's junction FP armor
 *     (>= 35 m clear) rather than dodge it.
 *  5. COMMITTED FILES under content/traces/sc-jx-priority-confidence/ ARE the
 *     recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD (after ANY change to the scripts, the recorder, the district or
 * the rule engine, then commit the JSON):
 *
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-jx-priority-confidence-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SimTickEvent } from "../../rules";
import { SC_JX_PRIORITY_CONFIDENCE } from "../../lessons/scenario/templates-junctions3";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScJxPriorityConfidenceDrive,
  scJxPriorityConfidenceTraceNames,
  SC_JX_PRIORITY_CONFIDENCE_DISTRICT_ID,
  type ScJxPriorityConfidenceTraceName,
} from "../scJxPriorityConfidence";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";

const TEMPLATE_ID = "sc-jx-priority-confidence";
/** The harsh-brake detector's junction clear window (rules cfg), m. */
const HARSH_BRAKE_JUNCTION_CLEAR_M = 35;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}

type PrioEvent = Extract<SimTickEvent, { kind: "prioritySituation" }>;

interface DriveWithTicks {
  drive: RecordedDrive;
  /** Every priority adjudication of the drive — must stay EMPTY on this map. */
  prio: PrioEvent[];
}

function record(districtRaw: unknown, name: ScJxPriorityConfidenceTraceName): DriveWithTicks {
  const prio: PrioEvent[] = [];
  const drive = recordScJxPriorityConfidenceDrive(districtRaw, name, {
    onTick: (tick) => {
      for (const e of tick.events) {
        if (e.kind === "prioritySituation") prio.push(e);
      }
    },
  });
  return { drive, prio };
}

function violationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

const district = loadDistrict(SC_JX_PRIORITY_CONFIDENCE_DISTRICT_ID);
const drives = new Map<ScJxPriorityConfidenceTraceName, DriveWithTicks>(
  scJxPriorityConfidenceTraceNames().map((n) => [n, record(district, n)]),
);

describe("sc-jx-priority-confidence — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations", () => {
    expect(violationCodes(shadow.drive)).toEqual([]);
  });

  it("never STOPS — the whole objective, made falsifiable", () => {
    // „не спирай без причина": from the moment the junction is in play until it
    // is behind, the shadow's speed never collapses. This is the assert that
    // fails if someone ever "fixes" the shadow by making it yield politely.
    const inPlay = shadow.drive.trace.samples.filter((s) => s.x >= -70 && s.x <= 30);
    expect(inPlay.length).toBeGreaterThan(0);
    const slowest = Math.min(...inPlay.map((s) => s.speedKmh));
    expect(slowest).toBeGreaterThan(35);
  });

  it("stays under the arm's 50 limit — confident is not fast", () => {
    const fastest = Math.max(...shadow.drive.trace.samples.map((s) => s.speedKmh));
    expect(fastest).toBeLessThanOrEqual(50);
  });

  it("the waiting car pulled out BEHIND the player — its own clock proves it", () => {
    const waiter = shadow.drive.outcomes.find((o) => o.eventId === "sc-jxpc-waiter");
    expect(waiter).toBeDefined();
    // "clear" = the car crossed the node with the player never having yielded to
    // it (sawYield needs speedKmh <= 8). It never became a conflict at all.
    expect(waiter!.success).toBe(true);
    expect(waiter!.detail).toBe("clear");
    // And it happened AFTER the player was already through and gone: the sample
    // clock at which the player left the junction area is well before this.
    const clearedAt = shadow.drive.trace.samples.find((s) => s.x > 20)!.tSec;
    expect(waiter!.tSec).toBeGreaterThan(clearedAt);
  });

  it("demonstrates the ritual: mirror + a look at the side street + annotations", () => {
    const kinds = shadow.drive.trace.events.map((e) => e.kind);
    expect(kinds).toContain("glance-rear");
    expect(kinds).toContain("glance-right");
    const annotations = shadow.drive.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("ends at rest eastbound on the east arm, clear of the junction area", () => {
    const last = shadow.drive.trace.samples[shadow.drive.trace.samples.length - 1];
    expect(last.x).toBeGreaterThan(90);
    expect(Math.abs(last.y + 4.0625)).toBeLessThan(1.5);
    expect(Math.abs(last.speedKmh)).toBeLessThan(0.5);
  });

  it("stays inside the authored par time", () => {
    expect(shadow.drive.trace.meta.durationSec).toBeLessThan(
      SC_JX_PRIORITY_CONFIDENCE.rubric!.parTimeSec!,
    );
  });
});

describe("sc-jx-priority-confidence — the priority arm is structurally innocent", () => {
  // The premise of the whole template. tj-n-c carries a derived Б2 line on the
  // stem, so worldRuntime's uncontrolledJunctions excludes it and the
  // right-hand-rule tracker never arms — a car approaching from the player's
  // RIGHT cannot bill them. Proven on every drive, including the two where the
  // player is at fault for something else.
  for (const name of ["shadow-correct", "mistake-phantom-brake", "mistake-blind-priority"] as const) {
    it(`${name}: no prioritySituation event of any kind fires`, () => {
      expect(drives.get(name)!.prio).toEqual([]);
    });

    it(`${name}: FAILED_TO_YIELD is never billed to the player`, () => {
      expect(violationCodes(drives.get(name)!.drive)).not.toContain("FAILED_TO_YIELD");
    });
  }
});

describe("sc-jx-priority-confidence — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Паническо спиране“: exactly HARSH_BRAKING_NO_CAUSE", () => {
    const { drive } = drives.get("mistake-phantom-brake")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_JX_PRIORITY_CONFIDENCE.mistakes[0].codeRefs].sort());
  });

  it("„Паническо спиране“: the slam RESPECTS the junction FP armor, it does not dodge it", () => {
    // HARSH_BRAKING_NO_CAUSE refuses to fire with a junction inside 35 m. The
    // demo is authored at ~50 m out precisely BECAUSE panic-braking that early,
    // for a car that is not moving, on an open sightline, is the real fault. If
    // a future edit slid the slam toward the box to make it "feel" closer, the
    // detector would go silent and the demo would quietly stop teaching.
    const { drive } = drives.get("mistake-phantom-brake")!;
    const stopped = drive.trace.samples.find((s) => s.x > -120 && Math.abs(s.speedKmh) < 0.5);
    expect(stopped).toBeDefined();
    expect(Math.hypot(stopped!.x, stopped!.y)).toBeGreaterThan(HARSH_BRAKE_JUNCTION_CLEAR_M);
  });

  it("„Сляпо държане на предимството“: exactly COLLISION", () => {
    const { drive } = drives.get("mistake-blind-priority")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_JX_PRIORITY_CONFIDENCE.mistakes[1].codeRefs].sort());
  });

  it("„Сляпо държане“: the crash is the RUNNER's verdict, not an authored step", () => {
    // The creeper's own contact test resolved it. This is what keeps the demo
    // honest: the car really is in the box at that clock, at contact range —
    // no `collision` step is authored in this drive at all.
    const { drive } = drives.get("mistake-blind-priority")!;
    const creeper = drive.outcomes.find((o) => o.eventId === "sc-jxpc-creeper");
    expect(creeper).toBeDefined();
    expect(creeper!.success).toBe(false);
    expect(creeper!.detail).toBe("collision");
  });

  it("„Сляпо държане“: the player was NOT speeding — the fault is blindness, not speed", () => {
    // The demo must convict on the taught thing alone. Same cruise as the shadow.
    const { drive } = drives.get("mistake-blind-priority")!;
    const fastest = Math.max(...drive.trace.samples.map((s) => s.speedKmh));
    expect(fastest).toBeLessThanOrEqual(50);
    expect([...new Set(violationCodes(drive))]).not.toContain("SPEEDING_OVER_LIMIT");
  });

  it("the лепка never grades the player (doc 72 FO-07 learn-only contract)", () => {
    // The tailgater rides every drive. If it ever emitted a SimTick event, the
    // phantom-brake demo's exact-code assert would be the first casualty.
    for (const name of scJxPriorityConfidenceTraceNames()) {
      const drive = drives.get(name)!.drive;
      expect(drive.outcomes.some((o) => o.eventId === "sc-jxpc-tail"), name).toBe(false);
    }
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", TEMPLATE_ID);
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", TEMPLATE_ID);

  for (const name of scJxPriorityConfidenceTraceNames()) {
    it(`${TEMPLATE_ID}/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
      const serialized = serializeScenarioTrace(drives.get(name)!.drive.trace) + "\n";
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
      expect(parsed!.meta.scenarioId).toBe(TEMPLATE_ID);
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    for (const name of scJxPriorityConfidenceTraceNames()) {
      const again = recordScJxPriorityConfidenceDrive(district, name);
      expect(serializeScenarioTrace(again.trace), name).toBe(
        serializeScenarioTrace(drives.get(name)!.drive.trace),
      );
    }
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [
      SC_JX_PRIORITY_CONFIDENCE.shadow,
      ...SC_JX_PRIORITY_CONFIDENCE.mistakes.map((m) => m.traceRef),
    ];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${TEMPLATE_ID}/`)).toBe(true);
    }
    const expected = scJxPriorityConfidenceTraceNames().map(
      (n) => `content/traces/${TEMPLATE_ID}/${n}.trace.json`,
    );
    expect([
      SC_JX_PRIORITY_CONFIDENCE.shadow.path,
      ...SC_JX_PRIORITY_CONFIDENCE.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
