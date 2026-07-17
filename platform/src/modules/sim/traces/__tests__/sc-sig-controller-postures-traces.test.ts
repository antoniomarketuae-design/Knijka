/**
 * JU-18 „Езикът на регулировчика" trace gates (doc 76 §5/§9) —
 * sc-sig-controller-postures on sx-v1: a controller posted at sx-n-c with the
 * lamps DARK (no signalOffsetSec pin), so the officer's POSTURE is the ONLY
 * signal. haltedGroup "ns" halts the player's south approach until the single
 * authored flip at t = 30, then permits it (officer turns side-on).
 *
 * THE POSTURE IS THE LAW, probed on the crossing event's controller field:
 *  1. The SHADOW reads the „стоп" posture, waits at the line, then proceeds
 *     after the flip → crosses with controller "proceed" and ZERO violations.
 *  2. mistake-barge-chest never stops — crosses while the officer faces it
 *     (controller "halt") → EXACTLY CONTROLLER_SIGNAL_VIOLATED (гърди = стоп).
 *  3. mistake-start-on-raised-arm stops correctly, then false-starts on the
 *     raised arm while still halted (controller "halt") → STILL exactly
 *     CONTROLLER_SIGNAL_VIOLATED (вдигнатата ръка не е „тръгвай").
 *  4. COMMITTED FILES under content/traces/sc-sig-controller-postures/ ARE the
 *     recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD (after ANY change to the scripts, the recorder, sx-v1 or the rule
 * engine, then commit the JSON):
 *
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-sig-controller-postures-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_SIG_CONTROLLER_POSTURES } from "../../lessons/scenario/templates-signals2";
import type { SimTickEvent } from "../../rules";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScSigControllerPosturesDrive,
  scSigControllerPosturesTraceNames,
  type ScSigControllerPosturesTraceName,
} from "../scSigControllerPostures";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const TEMPLATE_ID = "sc-sig-controller-postures";

const sxDistrict = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "sx-v1.json"), "utf-8"),
) as unknown;

type LineCrossing = Extract<SimTickEvent, { kind: "stopLineCrossed" }>;

interface ProbedDrive {
  drive: RecordedDrive;
  /** Every trafficLight stopLineCrossed the production runtime emitted. */
  crossings: LineCrossing[];
  /** Session time of each crossing — the authored posture flip made checkable. */
  crossingTimes: number[];
}

function record(name: ScSigControllerPosturesTraceName): ProbedDrive {
  const crossings: LineCrossing[] = [];
  const crossingTimes: number[] = [];
  const drive = recordScSigControllerPosturesDrive(sxDistrict, name, {
    onTick: (tick) => {
      for (const e of tick.events) {
        if (e.kind === "stopLineCrossed" && e.control === "trafficLight") {
          crossings.push(e);
          crossingTimes.push(tick.t);
        }
      }
    },
  });
  return { drive, crossings, crossingTimes };
}

function violationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

const drives = new Map<ScSigControllerPosturesTraceName, ProbedDrive>(
  scSigControllerPosturesTraceNames().map((n) => [n, record(n)]),
);

describe("sc-sig-controller-postures — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations", () => {
    expect(violationCodes(shadow.drive)).toEqual([]);
  });

  it("THE POINT: crosses under the officer's PERMISSION (posture), and it is innocent", () => {
    expect(shadow.crossings).toHaveLength(1);
    expect(shadow.crossings[0].controller).toBe("proceed");
    // …after the authored flip (haltedGroup "ns" → permitted at flipAtSec 30).
    expect(shadow.crossingTimes[0]).toBeGreaterThan(30);
  });

  it("no lamp / hesitation code ever fires (the posture is the only signal)", () => {
    const codes = violationCodes(shadow.drive);
    for (const c of [
      "RED_LIGHT_CROSSED",
      "RED_YELLOW_CROSSED",
      "YELLOW_LIGHT_NOT_STOPPED",
      "STOP_LINE_OVERSHOOT",
      "HESITATION_AT_GREEN",
      "CONTROLLER_SIGNAL_VIOLATED",
      "HARSH_BRAKING_NO_CAUSE",
    ]) {
      expect(codes).not.toContain(c);
    }
  });

  it("resolves the staged controller as 'yielded' — the halt was read and waited out", () => {
    const outcome = shadow.drive.outcomes.find((o) => o.eventId === "sc-sctp-officer");
    expect(outcome).toBeDefined();
    expect(outcome!.kind).toBe("trafficController");
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
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

describe("sc-sig-controller-postures — mistakes grade EXACTLY the controller code (doc 76 §9 stage 5)", () => {
  for (const name of ["mistake-barge-chest", "mistake-start-on-raised-arm"] as const) {
    const probed = drives.get(name)!;

    it(`${name}: exactly CONTROLLER_SIGNAL_VIOLATED — nothing else`, () => {
      expect([...new Set(violationCodes(probed.drive))]).toEqual(["CONTROLLER_SIGNAL_VIOLATED"]);
      const outcome = probed.drive.outcomes.find((o) => o.eventId === "sc-sctp-officer")!;
      expect(outcome.success).toBe(false);
      expect(outcome.detail).toBe("violation");
    });

    it(`${name}: convicted while the officer HALTS the approach (posture "stop")`, () => {
      // The crossing carries controller "halt" — the officer faced the player
      // (chest / raised arm), before the authored side-on flip at t = 30.
      expect(probed.crossings).toHaveLength(1);
      expect(probed.crossings[0].controller).toBe("halt");
      expect(probed.crossingTimes[0]).toBeLessThan(30);
    });

    it(`${name}: the wait at the line is never itself billed`, () => {
      const codes = violationCodes(probed.drive);
      expect(codes).not.toContain("HESITATION_AT_GREEN");
      expect(codes).not.toContain("STOP_LINE_OVERSHOOT");
      expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
      expect(codes).not.toContain("RED_LIGHT_CROSSED");
    });
  }

  it("the pair is one lesson twice: the SAME code from opposite drives", () => {
    const barge = drives.get("mistake-barge-chest")!;
    const start = drives.get("mistake-start-on-raised-arm")!;
    // One never stops, the other stops then false-starts — same conviction.
    expect([...new Set(violationCodes(barge.drive))]).toEqual(
      [...new Set(violationCodes(start.drive))],
    );
    // …and the shadow crossed on the OTHER posture (proceed vs the pair's halt).
    expect(drives.get("shadow-correct")!.crossings[0].controller).not.toBe(
      barge.crossings[0].controller,
    );
  });

  it("the mistake codes match the template's authored codeRefs", () => {
    expect([...new Set(violationCodes(drives.get("mistake-barge-chest")!.drive))]).toEqual(
      SC_SIG_CONTROLLER_POSTURES.mistakes[0].codeRefs,
    );
    expect([...new Set(violationCodes(drives.get("mistake-start-on-raised-arm")!.drive))]).toEqual(
      SC_SIG_CONTROLLER_POSTURES.mistakes[1].codeRefs,
    );
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", TEMPLATE_ID);
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", TEMPLATE_ID);

  for (const name of scSigControllerPosturesTraceNames()) {
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
      expect(existsSync(contentFile), `${contentFile} missing — run the RECORD_TRACES tool`).toBe(
        true,
      );
      expect(existsSync(publicFile), `${publicFile} missing — run the RECORD_TRACES tool`).toBe(
        true,
      );
      expect(readFileSync(contentFile, "utf-8")).toBe(serialized);
      expect(readFileSync(publicFile, "utf-8")).toBe(readFileSync(contentFile, "utf-8"));
      const parsed = parseScenarioTrace(JSON.parse(readFileSync(contentFile, "utf-8")));
      expect(parsed).not.toBeNull();
      expect(parsed!.meta.scenarioId).toBe(TEMPLATE_ID);
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const name = scSigControllerPosturesTraceNames()[0];
    const again = recordScSigControllerPosturesDrive(sxDistrict, name);
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get(name)!.drive.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [
      SC_SIG_CONTROLLER_POSTURES.shadow,
      ...SC_SIG_CONTROLLER_POSTURES.mistakes.map((m) => m.traceRef),
    ];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${TEMPLATE_ID}/`)).toBe(true);
    }
    const expected = scSigControllerPosturesTraceNames().map(
      (n) => `content/traces/${TEMPLATE_ID}/${n}.trace.json`,
    );
    expect([
      SC_SIG_CONTROLLER_POSTURES.shadow.path,
      ...SC_SIG_CONTROLLER_POSTURES.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
