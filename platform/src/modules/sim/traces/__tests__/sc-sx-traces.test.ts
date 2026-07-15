/**
 * S2-B trace gates — the SIGNALIZED-X templates (doc 76 §5/§9, stages 3+5):
 * sc-signal-response and sc-turn-left-oncoming, both on sx-v1.
 *
 *  1. SHADOWS replay through the PRODUCTION stack (runtime + traffic +
 *     scenario director + rules) with ZERO violations. The left-turn shadow
 *     additionally earns YIELDED_TO_PRIORITY and resolves BOTH staged oncoming
 *     actors as "yielded"; the signal shadow handles a real red (the passSignal
 *     success objective requireRedMet) and clears the junction north.
 *  2. MISTAKE DEMOS grade EXACTLY their template codeRefs.
 *  3. COMMITTED FILES under content/traces/<template>/ ARE the recordings of
 *     these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD (after ANY change to the scripts, the recorder, the districts or
 * the rule engine, then commit the JSON):
 *
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-sx-traces.test.ts
 *
 * Doc note (JU-06 dilemma dial): the amber flip arms only for an approach at
 * or above 21 km/h. The shadow and the red-creep demo approach slower and
 * never arm it (so the signalized junction keeps its authored red-arrival
 * pinning); only the amber-gamble demo, at 22 km/h, triggers a yellow the
 * runtime adjudicates as stoppable — hence YELLOW_LIGHT_NOT_STOPPED, not the
 * red-light code. On sx-v1 the line carries a trafficLight control, so a late
 * stop with the nose over the line grades STOP_LINE_OVERSHOOT (contrast the
 * lamp-less Б2 stem in sc-tj-traces, where the same act grades
 * STOP_SIGN_NO_FULL_STOP).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_SIGNAL_RESPONSE, SC_TURN_LEFT_ONCOMING } from "../../lessons/scenario/templates-junctions";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
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

const STOP_LINE_Y = -27.73; // sx-v1 south-approach line (lineDistM in the specs)

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}

function record(templateId: ScJunctionTemplateId, name: ScJunctionTraceName): RecordedDrive {
  return recordScJunctionDrive(sxDistrict, templateId, name);
}

function violationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

function commendationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const sxDistrict = loadDistrict("sx-v1");

const signal = new Map<ScJunctionTraceName, RecordedDrive>(
  scJunctionTraceNames("sc-signal-response").map((n) => [n, record("sc-signal-response", n)]),
);
const ltap = new Map<ScJunctionTraceName, RecordedDrive>(
  scJunctionTraceNames("sc-turn-left-oncoming").map((n) => [n, record("sc-turn-left-oncoming", n)]),
);

describe("sc-signal-response — the shadow gate (doc 76 §5)", () => {
  const shadow = signal.get("shadow-correct")!;

  it("replays with ZERO violations", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("stops before the line, then clears the junction north at rest", () => {
    // A real full stop before the line while red (rear axle south of the line).
    const restedBeforeLine = shadow.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 0.5 && s.y < STOP_LINE_Y && s.y > STOP_LINE_Y - 4,
    );
    expect(restedBeforeLine.length).toBeGreaterThanOrEqual(20); // ≥ ~1 s at 20 Hz
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(45);
    expect(Math.abs(last.x - 4.06)).toBeLessThan(1.5);
    expect(Math.abs(last.speedKmh)).toBeLessThan(0.5);
  });

  it("demonstrates the ritual: early observation with Bulgarian annotations", () => {
    const kinds = shadow.trace.events.map((e) => e.kind);
    expect(kinds).toContain("glance-left");
    expect(kinds).toContain("glance-right");
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-signal-response — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Жълтото като зелено“: exactly YELLOW_LIGHT_NOT_STOPPED, via the armed dilemma", () => {
    const drive = signal.get("mistake-amber-gamble")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SIGNAL_RESPONSE.mistakes[0].codeRefs].sort());
    // The staged amber event is what resolves against the driver.
    expect(drive.outcomes.find((o) => o.eventId === "sc-sig-amber")?.detail).toBe("violation");
  });

  it("„Пропълзяване на червено“: exactly STOP_LINE_OVERSHOOT (trafficLight line)", () => {
    const drive = signal.get("mistake-red-creep")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SIGNAL_RESPONSE.mistakes[1].codeRefs].sort());
    // JU-06 distinction: this is the light code, never the stop-sign code.
    expect(codes).not.toContain("STOP_SIGN_NO_FULL_STOP");
  });
});

describe("sc-turn-left-oncoming — the shadow gate (doc 76 §5)", () => {
  const shadow = ltap.get("shadow-correct")!;

  it("replays with ZERO violations and earns the priority yield commendation", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("YIELDED_TO_PRIORITY");
  });

  it("resolves BOTH staged oncoming actors as 'yielded' (N1 machinery)", () => {
    for (const id of ["sc-ltap-tight", "sc-ltap-follow"]) {
      const outcome = shadow.outcomes.find((o) => o.eventId === id);
      expect(outcome, id).toBeDefined();
      expect(outcome!.success, id).toBe(true);
      expect(outcome!.detail, id).toBe("yielded");
    }
  });

  it("signals LEFT before the turn and completes it southbound", () => {
    const signalOn = shadow.trace.events.find((e) => e.kind === "signal-on");
    expect(signalOn?.detail).toBe("left");
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeLessThan(-50);
    expect(Math.abs(last.x + 4.06)).toBeLessThan(1.5);
    expect(Math.abs(last.speedKmh)).toBeLessThan(0.5);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-turn-left-oncoming — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Рязане на тесния интервал“: exactly FAILED_TO_YIELD, from the oncoming tracker", () => {
    const drive = ltap.get("mistake-cut-gap")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_TURN_LEFT_ONCOMING.mistakes[0].codeRefs].sort());
    const failed = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD")!;
    expect(failed.kind === "violation" ? failed.detail : undefined).toBe("left-turn-oncoming");
    // The tight oncoming actor records the conflict.
    expect(drive.outcomes.find((o) => o.eventId === "sc-ltap-tight")?.detail).toBe("violation");
  });

  it("„Ляв завой без мигач“: exactly TURN_WITHOUT_INDICATOR — the yield itself stays correct", () => {
    const drive = ltap.get("mistake-no-indicator")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_TURN_LEFT_ONCOMING.mistakes[1].codeRefs].sort());
    // The demo isolates the fault: it still yields (no FAILED_TO_YIELD) but
    // never fires a signal-on event.
    expect(codes).not.toContain("FAILED_TO_YIELD");
    expect(drive.trace.events.find((e) => e.kind === "signal-on")).toBeUndefined();
    expect(commendationCodes(drive)).toContain("YIELDED_TO_PRIORITY");
  });
});

describe("committed trace files — the determinism law", () => {
  const CASES: Array<{ templateId: ScJunctionTemplateId; drives: Map<ScJunctionTraceName, RecordedDrive> }> = [
    { templateId: "sc-signal-response", drives: signal },
    { templateId: "sc-turn-left-oncoming", drives: ltap },
  ];

  for (const { templateId, drives } of CASES) {
    const contentDir = path.join(REPO_ROOT, "content", "traces", templateId);
    const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", templateId);

    for (const name of scJunctionTraceNames(templateId)) {
      it(`${templateId}/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
        expect(parsed!.meta.scenarioId).toBe(templateId);
      });
    }

    it(`${templateId}: recording is deterministic (a second run serializes identically)`, () => {
      const name = scJunctionTraceNames(templateId)[0];
      const again = recordScJunctionDrive(sxDistrict, templateId, name);
      expect(serializeScenarioTrace(again.trace)).toBe(
        serializeScenarioTrace(drives.get(name)!.trace),
      );
    });
  }

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    for (const spec of [SC_SIGNAL_RESPONSE, SC_TURN_LEFT_ONCOMING]) {
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
