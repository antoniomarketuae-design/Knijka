/**
 * JU-18 регулировчик trace gates (doc 76 §5/§9, ADR-006 stage 1d) —
 * sc-signal-controller on sx-v1 with a traffic CONTROLLER posted at sx-n-c
 * while the lamps keep cycling (the capability under test: cluster mode
 * "controlled" + the authored permission timetable, armed by the staged
 * trafficController event through the director's signal port).
 *
 * THE HIERARCHY IS PROVEN IN BOTH DIRECTIONS, with the lamp state probed at
 * the crossing moment:
 *  1. MISTAKES cross the stop line ON A GREEN LAMP while the controller halts
 *     the approach — the crossing event carries lightState "green" +
 *     controller "halt" and grades EXACTLY CONTROLLER_SIGNAL_VIOLATED
 *     (зеленото не оправдава: сигналите на регулировчика са над светофара).
 *  2. The SHADOW waits at the line through the green, then proceeds after the
 *     authored flip ON A RED LAMP with controller "proceed" — ZERO violations
 *     (червеното не осъжда срещу разрешението на регулировчика). ЗДвП чл. 7.
 *  3. COMMITTED FILES under content/traces/sc-signal-controller/ ARE the
 *     recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD (after ANY change to the scripts, the recorder, sx-v1 or the rule
 * engine, then commit the JSON):
 *
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-signal-controller-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_SIGNAL_CONTROLLER } from "../../lessons/scenario/templates-signals";
import type { SimTickEvent } from "../../rules";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScSignalControllerDrive,
  scSignalControllerTraceNames,
  type ScSignalControllerTraceName,
} from "../scSignalController";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const TEMPLATE_ID = "sc-signal-controller";

// B40(b): the регулировчик drill has its own signalized district now (two
// collectors, the widest place in the family). Read off the TEMPLATE so a
// future move cannot leave this recorder replaying the wrong street.
const sxDistrict = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", `${SC_SIGNAL_CONTROLLER.map.districtId}.json`), "utf-8"),
) as unknown;

type LineCrossing = Extract<SimTickEvent, { kind: "stopLineCrossed" }>;

interface ProbedDrive {
  drive: RecordedDrive;
  /** Every trafficLight stopLineCrossed the production runtime emitted. */
  crossings: LineCrossing[];
}

function record(name: ScSignalControllerTraceName): ProbedDrive {
  const crossings: LineCrossing[] = [];
  const drive = recordScSignalControllerDrive(sxDistrict, name, {
    onTick: (tick) => {
      for (const e of tick.events) {
        if (e.kind === "stopLineCrossed" && e.control === "trafficLight") crossings.push(e);
      }
    },
  });
  return { drive, crossings };
}

function violationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

const drives = new Map<ScSignalControllerTraceName, ProbedDrive>(
  scSignalControllerTraceNames().map((n) => [n, record(n)]),
);

describe("sc-signal-controller — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations", () => {
    expect(violationCodes(shadow.drive)).toEqual([]);
  });

  it("hierarchy, innocent side: crosses ON A RED LAMP under the controller's permission", () => {
    // The lamp truth is probed on the crossing event itself: by the flip the
    // ns lamps have cycled to red, yet controller "proceed" keeps it innocent.
    expect(shadow.crossings).toHaveLength(1);
    expect(shadow.crossings[0].controller).toBe("proceed");
    expect(shadow.crossings[0].lightState).toBe("red");
  });

  it("no lamp code ever fires (the controller permission overrides the lamps)", () => {
    const codes = violationCodes(shadow.drive);
    for (const c of [
      "RED_LIGHT_CROSSED",
      "RED_YELLOW_CROSSED",
      "YELLOW_LIGHT_NOT_STOPPED",
      "STOP_LINE_OVERSHOOT",
      "HESITATION_AT_GREEN",
      "CONTROLLER_SIGNAL_VIOLATED",
    ]) {
      expect(codes).not.toContain(c);
    }
  });

  it("resolves the staged controller as 'yielded' (waited out the halt) and clears north at rest", () => {
    const outcome = shadow.drive.outcomes.find((o) => o.eventId === "sc-sctrl-controller");
    expect(outcome).toBeDefined();
    expect(outcome!.kind).toBe("trafficController");
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
    // The crossing happens strictly AFTER the authored flip (flipAtSec 30).
    expect(outcome!.tSec).toBeGreaterThan(30);
    const last = shadow.drive.trace.samples[shadow.drive.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(45);
    expect(Math.abs(last.x - 4.0625)).toBeLessThan(1.5);
    expect(Math.abs(last.speedKmh)).toBeLessThan(0.5);
  });

  it("demonstrates the ritual: observation glances + Bulgarian annotations", () => {
    const kinds = shadow.drive.trace.events.map((e) => e.kind);
    expect(kinds).toContain("glance-left");
    expect(kinds).toContain("glance-right");
    const annotations = shadow.drive.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-signal-controller — mistakes grade EXACTLY the controller code (doc 76 §9 stage 5)", () => {
  for (const name of ["mistake-run", "mistake-creep"] as const) {
    const probed = drives.get(name)!;

    it(`${name}: exactly CONTROLLER_SIGNAL_VIOLATED — nothing else`, () => {
      expect([...new Set(violationCodes(probed.drive))]).toEqual(["CONTROLLER_SIGNAL_VIOLATED"]);
      const outcome = probed.drive.outcomes.find((o) => o.eventId === "sc-sctrl-controller")!;
      expect(outcome.success).toBe(false);
      expect(outcome.detail).toBe("violation");
      // Crossed strictly BEFORE the authored flip — while halted.
      expect(outcome.tSec).toBeLessThan(30);
    });

    it(`${name}: hierarchy, guilty side — the lamp IS GREEN at the crossing moment`, () => {
      // THE gate probe: the conviction comes from the controller's halt while
      // the cluster's lamps affirmatively show green for the approach.
      expect(probed.crossings).toHaveLength(1);
      expect(probed.crossings[0].lightState).toBe("green");
      expect(probed.crossings[0].controller).toBe("halt");
    });
  }

  it("the mistake codes match the template's authored codeRefs", () => {
    expect([...new Set(violationCodes(drives.get("mistake-run")!.drive))]).toEqual(
      SC_SIGNAL_CONTROLLER.mistakes[0].codeRefs,
    );
    expect([...new Set(violationCodes(drives.get("mistake-creep")!.drive))]).toEqual(
      SC_SIGNAL_CONTROLLER.mistakes[1].codeRefs,
    );
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", TEMPLATE_ID);
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", TEMPLATE_ID);

  for (const name of scSignalControllerTraceNames()) {
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
    const name = scSignalControllerTraceNames()[0];
    const again = recordScSignalControllerDrive(sxDistrict, name);
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get(name)!.drive.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_SIGNAL_CONTROLLER.shadow, ...SC_SIGNAL_CONTROLLER.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${TEMPLATE_ID}/`)).toBe(true);
    }
    const expected = scSignalControllerTraceNames().map(
      (n) => `content/traces/${TEMPLATE_ID}/${n}.trace.json`,
    );
    expect([
      SC_SIGNAL_CONTROLLER.shadow.path,
      ...SC_SIGNAL_CONTROLLER.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
