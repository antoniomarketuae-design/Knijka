/**
 * S3 batch-4 trace gates — the second JUNCTION/PRIORITY wave (doc 76 §5/§9,
 * stages 3+5): sc-junction-gap on tj-emerge-v1 and sc-junction-blind on
 * tj-occluded-v1.
 *
 *  1. SHADOWS replay through the PRODUCTION stack (runtime + traffic +
 *     scenario director + rules) with ZERO violations — each earns its
 *     template's positive proof (YIELDED_TO_PRIORITY, and FULL_STOP_AT_STOP_SIGN
 *     for the Б2 map).
 *  2. MISTAKE DEMOS grade EXACTLY their template codeRefs — ONE adjudicator
 *     per demo: the give-way conflictNear (gap) or the right-hand-rule tracker
 *     (blind); the full stop is a commendation, so it never joins the
 *     FAILED_TO_YIELD violation set.
 *  3. COMMITTED FILES under content/traces/<template>/ ARE the recordings of
 *     these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD (after ANY change to the scripts, the recorder, the districts or
 * the rule engine, then commit the JSON):
 *
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ju2-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SimTickEvent } from "../../rules";
import { SC_JUNCTION_GAP, SC_JUNCTION_BLIND } from "../../lessons/scenario/templates-junctions2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { createTracePoint } from "../types";
import { sampleAt } from "../sample";
import {
  recordScJunction2Drive,
  scJunction2TraceNames,
  type ScJunction2TemplateId,
  type ScJunction2TraceName,
} from "../scJunctions2";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";

const STOP_LINE_Y = -27.725; // derived Б2 line on the tj-emerge stem (battery)

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}

interface DriveWithTicks {
  drive: RecordedDrive;
  lineCrossings: Array<Extract<SimTickEvent, { kind: "stopLineCrossed" }>>;
}

function record(
  districtRaw: unknown,
  templateId: ScJunction2TemplateId,
  name: ScJunction2TraceName,
): DriveWithTicks {
  const lineCrossings: DriveWithTicks["lineCrossings"] = [];
  const drive = recordScJunction2Drive(districtRaw, templateId, name, {
    onTick: (tick) => {
      for (const e of tick.events) {
        if (e.kind === "stopLineCrossed") lineCrossings.push(e);
      }
    },
  });
  return { drive, lineCrossings };
}

function violationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

function commendationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const gapDistrict = loadDistrict("tj-emerge-v1");
const blindDistrict = loadDistrict("tj-occluded-v1");

const gap = new Map<ScJunction2TraceName, DriveWithTicks>(
  scJunction2TraceNames("sc-junction-gap").map((n) => [n, record(gapDistrict, "sc-junction-gap", n)]),
);
const blind = new Map<ScJunction2TraceName, DriveWithTicks>(
  scJunction2TraceNames("sc-junction-blind").map((n) => [n, record(blindDistrict, "sc-junction-blind", n)]),
);

describe("sc-junction-gap — the shadow gate (doc 76 §5)", () => {
  const shadow = gap.get("shadow-correct")!;

  // ALSO THE PIN for the give-way praise's wait clock (runners.ts
  // YIELD_PRAISE_WAIT_SEC). The clause first shipped counting only seconds
  // spent while the priority car was still SHORT of the node, and this drive
  // banks 0.40 s of those against 4.75 s of honest wait: `leadSec: -3.5` plus
  // the S2 witness gate put the car on the node at the instant he finished
  // braking, so ~92% of his stop is spent with the car between the node and
  // clear. If YIELDED_TO_PRIORITY ever disappears from here again, that clock —
  // not the shadow — is what to look at.
  it("replays with ZERO violations and earns BOTH the full-stop and give-way-yield proofs", () => {
    expect(violationCodes(shadow.drive)).toEqual([]);
    expect(commendationCodes(shadow.drive)).toContain("FULL_STOP_AT_STOP_SIGN");
    expect(commendationCodes(shadow.drive)).toContain("YIELDED_TO_PRIORITY");
  });

  it("the staged give-way conflict resolves 'yielded' through the priorityFromRight runner", () => {
    const outcome = shadow.drive.outcomes.find((o) => o.eventId === "sc-jgap-conflict");
    expect(outcome).toBeDefined();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
  });

  it("holds a REAL full stop (≥ 2 s at rest) before the Б2 line, then crosses it once", () => {
    const resting = shadow.drive.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 0.5 && s.y < STOP_LINE_Y && s.y > STOP_LINE_Y - 3.5,
    );
    expect(resting.length).toBeGreaterThanOrEqual(2 * 20 - 2); // ≥ ~2 s at 20 Hz
    expect(shadow.lineCrossings.length).toBe(1);
    expect(shadow.lineCrossings[0].control).toBe("stopSign");
  });

  it("demonstrates the ritual: right indicator + look left/right + annotations", () => {
    const kinds = shadow.drive.trace.events.map((e) => e.kind);
    expect(kinds).toContain("glance-left");
    expect(kinds).toContain("glance-right");
    const signalOn = shadow.drive.trace.events.find((e) => e.kind === "signal-on");
    expect(signalOn?.detail).toBe("right");
    const annotations = shadow.drive.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("ends at rest eastbound on the priority road, through the junction", () => {
    const last = shadow.drive.trace.samples[shadow.drive.trace.samples.length - 1];
    expect(last.x).toBeGreaterThan(50);
    expect(Math.abs(last.y + 4.0625)).toBeLessThan(1.5);
    expect(Math.abs(last.speedKmh)).toBeLessThan(0.5);
  });
});

describe("sc-junction-gap — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Потегляне в тесен интервал“: exactly FAILED_TO_YIELD, from the give-way check", () => {
    const drive = gap.get("mistake-cut-gap")!.drive;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_JUNCTION_GAP.mistakes[0].codeRefs].sort());
    const failed = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD")!;
    expect(failed.kind === "violation" ? failed.detail : undefined).toBe("give-way");
    // The stop itself is credited — it must NOT have graded as no-stop.
    expect(codes).not.toContain("STOP_SIGN_NO_FULL_STOP");
    // Emerging at speed — not a crawl.
    const at = createTracePoint();
    sampleAt(drive.trace, failed.t, at);
    expect(Math.abs(at.speedKmh)).toBeGreaterThan(6);
    expect(drive.outcomes.find((o) => o.eventId === "sc-jgap-conflict")?.detail).toBe("violation");
  });

  it("„Пълзящо навлизане“: exactly FAILED_TO_YIELD, crossing the line at a creep", () => {
    const drive = gap.get("mistake-creep-out")!.drive;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_JUNCTION_GAP.mistakes[1].codeRefs].sort());
    const failed = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD")!;
    expect(failed.kind === "violation" ? failed.detail : undefined).toBe("give-way");
    expect(codes).not.toContain("STOP_SIGN_NO_FULL_STOP");
    // Nosing out slowly — the creep signature.
    const at = createTracePoint();
    sampleAt(drive.trace, failed.t, at);
    expect(Math.abs(at.speedKmh)).toBeLessThan(8);
  });
});

describe("sc-junction-blind — the shadow gate (doc 76 §5)", () => {
  const shadow = blind.get("shadow-correct")!;

  it("replays with ZERO violations and earns the right-hand-rule yield commendation", () => {
    expect(violationCodes(shadow.drive)).toEqual([]);
    expect(commendationCodes(shadow.drive)).toContain("YIELDED_TO_PRIORITY");
  });

  it("the staged conflict resolves 'yielded' through the priorityFromRight runner", () => {
    const outcome = shadow.drive.outcomes.find((o) => o.eventId === "sc-jblind-conflict");
    expect(outcome).toBeDefined();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
  });

  it("actually WAITS: at rest outside the 18 m conviction core while the car crosses", () => {
    const resting = shadow.drive.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 0.5 && s.y > -22 && s.y < -18,
    );
    expect(resting.length).toBeGreaterThan(20 * 4); // > 4 s at the 20 Hz cadence
    for (const s of resting) expect(Math.hypot(s.x, s.y)).toBeGreaterThan(18);
  });

  it("demonstrates the ritual: left indicator + look left and RIGHT (past the building)", () => {
    const kinds = shadow.drive.trace.events.map((e) => e.kind);
    expect(kinds).toContain("glance-left");
    expect(kinds.filter((k) => k === "glance-right").length).toBeGreaterThanOrEqual(2);
    const signalOn = shadow.drive.trace.events.find((e) => e.kind === "signal-on");
    expect(signalOn?.detail).toBe("left");
    const annotations = shadow.drive.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("ends at rest on the west arm, through the junction", () => {
    const last = shadow.drive.trace.samples[shadow.drive.trace.samples.length - 1];
    expect(last.x).toBeLessThan(-50);
    expect(Math.abs(last.y - 4.0625)).toBeLessThan(1.5);
    expect(Math.abs(last.speedKmh)).toBeLessThan(0.5);
  });
});

describe("sc-junction-blind — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Изскачане иззад сградата“: exactly FAILED_TO_YIELD, from the RHR tracker", () => {
    const drive = blind.get("mistake-barge")!.drive;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_JUNCTION_BLIND.mistakes[0].codeRefs].sort());
    const failed = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD")!;
    expect(failed.kind === "violation" ? failed.detail : undefined).toBe("right-hand-rule");
    const at = createTracePoint();
    sampleAt(drive.trace, failed.t, at);
    expect(Math.abs(at.speedKmh)).toBeGreaterThan(10); // barging, not crawling
    expect(drive.outcomes.find((o) => o.eventId === "sc-jblind-conflict")?.detail).toBe("violation");
  });

  it("„Навлизане без оглеждане“: the authored consequence — exactly COLLISION (vehicle)", () => {
    const drive = blind.get("mistake-no-look")!.drive;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_JUNCTION_BLIND.mistakes[1].codeRefs].sort());
    const collision = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "COLLISION")!;
    expect(collision.kind === "violation" ? collision.detail : undefined).toBe("vehicle");
    // JU-17 cleanliness: the blind emerge collides at the mouth, so the RHR
    // tracker never latches a sustained failure-to-yield alongside the crash.
    expect(codes).not.toContain("FAILED_TO_YIELD");
    // And the demo really shows NO observation: zero glances after the spawn.
    const glances = drive.trace.events.filter((e) => e.kind.startsWith("glance-"));
    expect(glances).toEqual([]);
  });
});

describe("committed trace files — the determinism law", () => {
  const CASES: Array<{ templateId: ScJunction2TemplateId; district: unknown; drives: Map<ScJunction2TraceName, DriveWithTicks> }> = [
    { templateId: "sc-junction-gap", district: gapDistrict, drives: gap },
    { templateId: "sc-junction-blind", district: blindDistrict, drives: blind },
  ];

  for (const { templateId, district, drives } of CASES) {
    const contentDir = path.join(REPO_ROOT, "content", "traces", templateId);
    const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", templateId);

    for (const name of scJunction2TraceNames(templateId)) {
      it(`${templateId}/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
        expect(parsed!.meta.scenarioId).toBe(templateId);
      });
    }

    it(`${templateId}: recording is deterministic (a second run serializes identically)`, () => {
      const name = scJunction2TraceNames(templateId)[0];
      const again = recordScJunction2Drive(district, templateId, name);
      expect(serializeScenarioTrace(again.trace)).toBe(
        serializeScenarioTrace(drives.get(name)!.drive.trace),
      );
    });
  }

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    for (const spec of [SC_JUNCTION_GAP, SC_JUNCTION_BLIND]) {
      const refs = [spec.shadow, ...spec.mistakes.map((m) => m.traceRef)];
      for (const ref of refs) {
        expect(ref.pending, ref.path).not.toBe(true);
        expect(ref.path.startsWith(`content/traces/${spec.id}/`)).toBe(true);
      }
      const expected = scJunction2TraceNames(spec.id as ScJunction2TemplateId).map(
        (n) => `content/traces/${spec.id}/${n}.trace.json`,
      );
      expect([spec.shadow.path, ...spec.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
    }
  });
});
