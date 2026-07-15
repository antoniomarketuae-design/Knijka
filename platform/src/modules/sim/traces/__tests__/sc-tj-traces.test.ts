/**
 * S2-B trace gates — the T-JUNCTION templates (doc 76 §5/§9, stages 3+5):
 * sc-junction-rhr on tj-rhr-v1 and sc-junction-stop on tj-stop-v1.
 *
 *  1. SHADOWS replay through the PRODUCTION stack (runtime + traffic +
 *     scenario director + rules) with ZERO violations — and each earns its
 *     template's positive proof (YIELDED_TO_PRIORITY / FULL_STOP_AT_STOP_SIGN).
 *  2. MISTAKE DEMOS grade EXACTLY their template codeRefs.
 *  3. COMMITTED FILES under content/traces/<template>/ ARE the recordings of
 *     these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD (after ANY change to the scripts, the recorder, the districts or
 * the rule engine, then commit the JSON):
 *
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-tj-traces.test.ts
 *
 * Doc note (the mission's JU-15 verification, recorded in
 * templates-junctions.ts): STOP_LINE_OVERSHOOT is STRUCTURALLY unreachable
 * on tj-stop-v1 — the detector demands a trafficLight control + red lamp,
 * and every line here is a lamp-less Б2. Stopping past a Б2 line grades
 * STOP_SIGN_NO_FULL_STOP at the crossing (the honest legal reading), which
 * is exactly what the past-line demo asserts below.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SimTickEvent } from "../../rules";
import { SC_JUNCTION_RHR, SC_JUNCTION_STOP } from "../../lessons/scenario/templates-junctions";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { createTracePoint } from "../types";
import { sampleAt } from "../sample";
import {
  recordScJunctionDrive,
  scJunctionTraceNames,
  type ScJunctionTemplateId,
  type ScJunctionTraceName,
} from "../scJunctions";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";

const STOP_LINE_Y = -27.725; // derived Б2 line on the tj-stop stem (battery)

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}

interface DriveWithTicks {
  drive: RecordedDrive;
  lineCrossings: Array<Extract<SimTickEvent, { kind: "stopLineCrossed" }>>;
}

function record(
  districtRaw: unknown,
  templateId: ScJunctionTemplateId,
  name: ScJunctionTraceName,
): DriveWithTicks {
  const lineCrossings: DriveWithTicks["lineCrossings"] = [];
  const drive = recordScJunctionDrive(districtRaw, templateId, name, {
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

const rhrDistrict = loadDistrict("tj-rhr-v1");
const stopDistrict = loadDistrict("tj-stop-v1");

const rhr = new Map<ScJunctionTraceName, DriveWithTicks>(
  scJunctionTraceNames("sc-junction-rhr").map((n) => [n, record(rhrDistrict, "sc-junction-rhr", n)]),
);
const stop = new Map<ScJunctionTraceName, DriveWithTicks>(
  scJunctionTraceNames("sc-junction-stop").map((n) => [n, record(stopDistrict, "sc-junction-stop", n)]),
);

describe("sc-junction-rhr — the shadow gate (doc 76 §5)", () => {
  const shadow = rhr.get("shadow-correct")!;

  it("replays with ZERO violations and earns the right-hand-rule yield commendation", () => {
    expect(violationCodes(shadow.drive)).toEqual([]);
    expect(commendationCodes(shadow.drive)).toContain("YIELDED_TO_PRIORITY");
  });

  it("the staged conflict resolves 'yielded' through the priorityFromRight runner", () => {
    const outcome = shadow.drive.outcomes.find((o) => o.eventId === "sc-jrhr-conflict");
    expect(outcome).toBeDefined();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
  });

  it("demonstrates the ritual: left indicator + look left, RIGHT, and re-check", () => {
    const kinds = shadow.drive.trace.events.map((e) => e.kind);
    expect(kinds).toContain("glance-left");
    expect(kinds.filter((k) => k === "glance-right").length).toBeGreaterThanOrEqual(2);
    const signalOn = shadow.drive.trace.events.find((e) => e.kind === "signal-on");
    expect(signalOn?.detail).toBe("left");
    const annotations = shadow.drive.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("actually WAITS: at rest outside the 18 m conviction core while the car crosses", () => {
    const resting = shadow.drive.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 0.5 && s.y > -22 && s.y < -18,
    );
    expect(resting.length).toBeGreaterThan(20 * 4); // > 4 s at the 20 Hz cadence
    for (const s of resting) expect(Math.hypot(s.x, s.y)).toBeGreaterThan(18);
  });

  it("ends at rest on the west arm, through the junction", () => {
    const last = shadow.drive.trace.samples[shadow.drive.trace.samples.length - 1];
    expect(last.x).toBeLessThan(-50);
    expect(Math.abs(last.y - 4.0625)).toBeLessThan(1.5);
    expect(Math.abs(last.speedKmh)).toBeLessThan(0.5);
  });
});

describe("sc-junction-rhr — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Нахлуване без предимство“: exactly FAILED_TO_YIELD, from the RHR tracker", () => {
    const drive = rhr.get("mistake-barge")!.drive;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_JUNCTION_RHR.mistakes[0].codeRefs].sort());
    const failed = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD")!;
    expect(failed.kind === "violation" ? failed.detail : undefined).toBe("right-hand-rule");
    // Barging at speed — not a crawl.
    const at = createTracePoint();
    sampleAt(drive.trace, failed.t, at);
    expect(Math.abs(at.speedKmh)).toBeGreaterThan(10);
    // The runner records the same resolution.
    expect(drive.outcomes.find((o) => o.eventId === "sc-jrhr-conflict")?.detail).toBe("violation");
  });

  it("„Навлизане без оглеждане“: the authored consequence — exactly COLLISION (vehicle)", () => {
    const drive = rhr.get("mistake-no-look")!.drive;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_JUNCTION_RHR.mistakes[1].codeRefs].sort());
    const collision = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "COLLISION")!;
    expect(collision.kind === "violation" ? collision.detail : undefined).toBe("vehicle");
    // And the demo really shows NO observation: zero glances after the spawn.
    const glances = drive.trace.events.filter((e) => e.kind.startsWith("glance-"));
    expect(glances).toEqual([]);
  });
});

describe("sc-junction-stop — the shadow gate (doc 76 §5)", () => {
  const shadow = stop.get("shadow-correct")!;

  it("replays with ZERO violations and earns FULL_STOP_AT_STOP_SIGN", () => {
    expect(violationCodes(shadow.drive)).toEqual([]);
    expect(commendationCodes(shadow.drive)).toContain("FULL_STOP_AT_STOP_SIGN");
  });

  it("crosses the derived Б2 line exactly once, as a stopSign control", () => {
    expect(shadow.lineCrossings.length).toBe(1);
    expect(shadow.lineCrossings[0].control).toBe("stopSign");
  });

  it("holds a REAL full stop (≥ 2 s at rest) before the line", () => {
    const resting = shadow.drive.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 0.5 && s.y < STOP_LINE_Y && s.y > STOP_LINE_Y - 3.5,
    );
    expect(resting.length).toBeGreaterThanOrEqual(2 * 20 - 2); // ≥ ~2 s at 20 Hz
  });

  it("demonstrates наляво-надясно-наляво + the right indicator for the turn", () => {
    const kinds = shadow.drive.trace.events.map((e) => e.kind);
    expect(kinds.filter((k) => k === "glance-left").length).toBeGreaterThanOrEqual(2);
    expect(kinds).toContain("glance-right");
    const signalOn = shadow.drive.trace.events.find((e) => e.kind === "signal-on");
    expect(signalOn?.detail).toBe("right");
    const annotations = shadow.drive.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("ends at rest eastbound on the priority road", () => {
    const last = shadow.drive.trace.samples[shadow.drive.trace.samples.length - 1];
    expect(last.x).toBeGreaterThan(50);
    expect(Math.abs(last.y + 4.0625)).toBeLessThan(1.5);
    expect(Math.abs(last.speedKmh)).toBeLessThan(0.5);
  });
});

describe("sc-junction-stop — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Търкалящо спиране“: exactly STOP_SIGN_NO_FULL_STOP, crossing at a roll", () => {
    const { drive, lineCrossings } = stop.get("mistake-rolling-stop")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_JUNCTION_STOP.mistakes[0].codeRefs].sort());
    expect(lineCrossings.length).toBe(1);
    const v = drive.ruleEvents.find((e) => e.kind === "violation")!;
    const at = createTracePoint();
    sampleAt(drive.trace, v.t, at);
    // The taught failure: rolling — never at rest, but clearly slow.
    expect(Math.abs(at.speedKmh)).toBeGreaterThan(2);
    expect(Math.abs(at.speedKmh)).toBeLessThan(10);
    // No qualifying stop existed anywhere near the line.
    const nearLine = drive.trace.samples.filter((s) => s.y > -36 && s.y < STOP_LINE_Y);
    expect(Math.min(...nearLine.map((s) => Math.abs(s.speedKmh)))).toBeGreaterThan(2);
  });

  it("„Спиране след линията“: the late stop grades STOP_SIGN_NO_FULL_STOP at the crossing", () => {
    const { drive } = stop.get("mistake-past-line")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_JUNCTION_STOP.mistakes[1].codeRefs].sort());
    // The car DOES come to rest — but past the line, nose in the mouth.
    const last = drive.trace.samples[drive.trace.samples.length - 1];
    expect(Math.abs(last.speedKmh)).toBeLessThan(0.5);
    expect(last.y).toBeGreaterThan(STOP_LINE_Y);
    expect(last.y).toBeLessThan(STOP_LINE_Y + 5);
    // JU-15 verification: on this Б2 map the red-light overshoot code CANNOT
    // exist — the offence is the unstopped crossing itself.
    expect(codes).not.toContain("STOP_LINE_OVERSHOOT");
    const v = drive.ruleEvents.find((e) => e.kind === "violation")!;
    const at = createTracePoint();
    sampleAt(drive.trace, v.t, at);
    expect(Math.abs(at.speedKmh)).toBeGreaterThan(10); // crossed still braking
  });
});

describe("committed trace files — the determinism law", () => {
  const CASES: Array<{ templateId: ScJunctionTemplateId; district: unknown; drives: Map<ScJunctionTraceName, DriveWithTicks> }> = [
    { templateId: "sc-junction-rhr", district: rhrDistrict, drives: rhr },
    { templateId: "sc-junction-stop", district: stopDistrict, drives: stop },
  ];

  for (const { templateId, district, drives } of CASES) {
    const contentDir = path.join(REPO_ROOT, "content", "traces", templateId);
    const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", templateId);

    for (const name of scJunctionTraceNames(templateId)) {
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
      const name = scJunctionTraceNames(templateId)[0];
      const again = recordScJunctionDrive(district, templateId, name);
      expect(serializeScenarioTrace(again.trace)).toBe(
        serializeScenarioTrace(drives.get(name)!.drive.trace),
      );
    });
  }

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    for (const spec of [SC_JUNCTION_RHR, SC_JUNCTION_STOP]) {
      const refs = [spec.shadow, ...spec.mistakes.map((m) => m.traceRef)];
      for (const ref of refs) {
        expect(ref.pending, ref.path).not.toBe(true);
        expect(ref.path.startsWith(`content/traces/${spec.id}/`)).toBe(true);
      }
      const expected = scJunctionTraceNames(spec.id as ScJunctionTemplateId).map(
        (n) => `content/traces/${spec.id}/${n}.trace.json`,
      );
      expect([spec.shadow.path, ...spec.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
    }
  });
});
