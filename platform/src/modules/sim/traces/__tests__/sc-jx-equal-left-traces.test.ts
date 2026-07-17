/**
 * Wave-1 trace gate — the equal crossroads left turn (doc 76 §5/§9, stages 3+5):
 * sc-jx-equal-left on jx-equal-v1.
 *
 *  1. The SHADOW replays through the PRODUCTION stack (runtime + traffic +
 *     scenario director + rules) with ZERO violations and earns BOTH yield
 *     proofs — the right-hand-rule tracker AND the N1 left-turn tracker. Two
 *     adjudicators, one node, one clean drive: that IS the template.
 *  2. SEQUENCING has teeth: the „cut-right" demo proves the oncoming actor is
 *     still parked while the right-hand conflict plays out (no left-turn event
 *     of any kind fires), which is what keeps the teach-pause to ONE card per
 *     conflict below L5.
 *  3. MISTAKE DEMOS grade EXACTLY their template codeRefs.
 *  4. COMMITTED FILES under content/traces/sc-jx-equal-left/ ARE the recordings
 *     of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD (after ANY change to the scripts, the recorder, the district or
 * the rule engine, then commit the JSON):
 *
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-jx-equal-left-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SimTickEvent } from "../../rules";
import { SC_JX_EQUAL_LEFT } from "../../lessons/scenario/templates-junctions3";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScJxEqualLeftDrive,
  scJxEqualLeftTraceNames,
  SC_JX_EQUAL_LEFT_DISTRICT_ID,
  type ScJxEqualLeftTraceName,
} from "../scJxEqualLeft";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";

const TEMPLATE_ID = "sc-jx-equal-left";
/** The runtime's right-hand-rule conviction core around the node, m. */
const RHR_CORE_M = 18;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}

type PrioEvent = Extract<SimTickEvent, { kind: "prioritySituation" }>;

interface DriveWithTicks {
  drive: RecordedDrive;
  /** Every priority adjudication of the drive, in order — the two trackers. */
  prio: PrioEvent[];
}

function record(districtRaw: unknown, name: ScJxEqualLeftTraceName): DriveWithTicks {
  const prio: PrioEvent[] = [];
  const drive = recordScJxEqualLeftDrive(districtRaw, name, {
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

function commendationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict(SC_JX_EQUAL_LEFT_DISTRICT_ID);
const drives = new Map<ScJxEqualLeftTraceName, DriveWithTicks>(
  scJxEqualLeftTraceNames().map((n) => [n, record(district, n)]),
);

describe("sc-jx-equal-left — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations", () => {
    expect(violationCodes(shadow.drive)).toEqual([]);
  });

  it("earns BOTH yield proofs — the right-hand-rule AND the left-turn tracker", () => {
    // The whole point of the equal X: one left turn, two чл. 37 duties, both
    // discharged. Anything less means one adjudicator silently never armed.
    expect(commendationCodes(shadow.drive)).toEqual([
      "YIELDED_TO_PRIORITY",
      "YIELDED_TO_PRIORITY",
    ]);
    const situations = shadow.prio.map((e) => `${e.situation}:${String(e.yielded)}`);
    expect(situations).toEqual(["left-turn-oncoming:true", "right-hand-rule:true"]);
    expect(shadow.prio.every((e) => e.violated === false)).toBe(true);
  });

  it("both staged conflicts resolve 'yielded' through their runners", () => {
    const right = shadow.drive.outcomes.find((o) => o.eventId === "sc-jxeq-right");
    expect(right).toBeDefined();
    expect(right!.success).toBe(true);
    expect(right!.detail).toBe("yielded");
    const oncoming = shadow.drive.outcomes.find((o) => o.eventId === "sc-jxeq-oncoming");
    expect(oncoming).toBeDefined();
    expect(oncoming!.success).toBe(true);
    expect(oncoming!.detail).toBe("yielded");
  });

  it("actually WAITS — at rest OUTSIDE the 18 m conviction core, long enough for both cars", () => {
    const resting = shadow.drive.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 0.5 && s.y > -22 && s.y < -18,
    );
    // Two sequenced conflicts = a long, deliberate hold (> 15 s at 20 Hz).
    expect(resting.length).toBeGreaterThan(20 * 15);
    // Innocence is structural, not lucky: the wait pose never enters the core.
    for (const s of resting) expect(Math.hypot(s.x, s.y)).toBeGreaterThan(RHR_CORE_M);
  });

  it("demonstrates the ritual: left indicator + look left and right + annotations", () => {
    const kinds = shadow.drive.trace.events.map((e) => e.kind);
    expect(kinds).toContain("glance-left");
    expect(kinds).toContain("glance-right");
    const signalOn = shadow.drive.trace.events.find((e) => e.kind === "signal-on");
    expect(signalOn?.detail).toBe("left");
    const annotations = shadow.drive.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("ends at rest westbound on the west arm, clear of the junction area", () => {
    const last = shadow.drive.trace.samples[shadow.drive.trace.samples.length - 1];
    expect(last.x).toBeLessThan(-50);
    expect(Math.abs(last.y - 4.0625)).toBeLessThan(1.5);
    expect(Math.abs(last.speedKmh)).toBeLessThan(0.5);
  });

  it("stays inside the authored par time (the two waits are the lesson, not a stall)", () => {
    expect(shadow.drive.trace.meta.durationSec).toBeLessThan(SC_JX_EQUAL_LEFT.rubric!.parTimeSec!);
  });
});

describe("sc-jx-equal-left — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Завой пред колата отдясно“: exactly FAILED_TO_YIELD, from the RHR tracker", () => {
    const { drive, prio } = drives.get("mistake-cut-right")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_JX_EQUAL_LEFT.mistakes[0].codeRefs].sort());
    const failed = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD")!;
    expect(failed.kind === "violation" ? failed.detail : undefined).toBe("right-hand-rule");
    expect(drive.outcomes.find((o) => o.eventId === "sc-jxeq-right")?.detail).toBe("violation");
    // The left indicator was given — the fault graded is the priority slip
    // ALONE, not a bookkeeping miss riding along.
    expect(codes).not.toContain("TURN_WITHOUT_INDICATOR");
  });

  it("SEQUENCING: while the right-hand conflict plays, the oncoming is not live at all", () => {
    // The brief's design rule ("only ONE conflict active at a time below L5")
    // made falsifiable: the oncoming runner holds its car at 125 m until the
    // student yields, so a student who never yields never meets it. If this
    // fails, the teach-pause stacks two cards and the lesson stops teaching.
    const { drive, prio } = drives.get("mistake-cut-right")!;
    expect(prio.map((e) => e.situation)).toEqual(["right-hand-rule"]);
    expect(prio.some((e) => e.situation === "left-turn-oncoming")).toBe(false);
    expect(drive.outcomes.some((o) => o.eventId === "sc-jxeq-oncoming")).toBe(false);
  });

  it("„Ляв завой през носа на насрещния“: exactly FAILED_TO_YIELD + COLLISION", () => {
    const { drive, prio } = drives.get("mistake-cut-oncoming")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_JX_EQUAL_LEFT.mistakes[1].codeRefs].sort());
    // The TAUGHT fault must actually be among them: the N1 left-turn tracker
    // convicts the turn across the oncoming (the RHR tracker also bills the
    // same code here — see the header note — so asserting the set alone would
    // pass even if the left-turn duty were never adjudicated).
    expect(prio.some((e) => e.situation === "left-turn-oncoming" && e.violated)).toBe(true);
    const oncoming = drive.outcomes.find((o) => o.eventId === "sc-jxeq-oncoming");
    expect(oncoming?.detail).toBe("violation");
    // The gap the student accepted is measured for the debrief — and it is
    // under the taught 4 s norm.
    expect(oncoming?.acceptedGapSec).toBeDefined();
    expect(oncoming!.acceptedGapSec!).toBeLessThan(4);
  });

  it("„Ляв завой през носа“: the right-hand car was yielded to — the demo isolates the SECOND duty", () => {
    // The story only teaches if the first duty was met: this student did
    // everything right up to the oncoming.
    const { drive } = drives.get("mistake-cut-oncoming")!;
    expect(drive.outcomes.find((o) => o.eventId === "sc-jxeq-right")?.detail).toBe("yielded");
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", TEMPLATE_ID);
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", TEMPLATE_ID);

  for (const name of scJxEqualLeftTraceNames()) {
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
    for (const name of scJxEqualLeftTraceNames()) {
      const again = recordScJxEqualLeftDrive(district, name);
      expect(serializeScenarioTrace(again.trace), name).toBe(
        serializeScenarioTrace(drives.get(name)!.drive.trace),
      );
    }
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_JX_EQUAL_LEFT.shadow, ...SC_JX_EQUAL_LEFT.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${TEMPLATE_ID}/`)).toBe(true);
    }
    const expected = scJxEqualLeftTraceNames().map((n) => `content/traces/${TEMPLATE_ID}/${n}.trace.json`);
    expect([SC_JX_EQUAL_LEFT.shadow.path, ...SC_JX_EQUAL_LEFT.mistakes.map((m) => m.traceRef.path)]).toEqual(
      expected,
    );
  });
});
