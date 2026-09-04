/**
 * JU-18 регулировчик trace gates (doc 76 §5/§9) — sc-sig-controller-live on
 * sx-v1: a controller posted at sx-n-c with the lamps LEFT RUNNING and the
 * permission timetable INVERTED against sc-signal-controller (haltedGroup "ew"
 * + flipAtSec 26: the officer opens the player's axis first and closes it as
 * the lamps turn green).
 *
 * THE HIERARCHY IS PROVEN FROM THE SIDE DRIVERS REFUSE, with the lamp state
 * probed on the crossing event itself:
 *  1. The SHADOW crosses ON A RED LAMP with controller "proceed" — ZERO
 *     violations (червеното не осъжда срещу разрешението на регулировчика).
 *     This assert is the template's whole point.
 *  2. mistake-wait-for-green waits the red out and leaves on the GREEN LAMP,
 *     by which time the officer has halted it → EXACTLY
 *     CONTROLLER_SIGNAL_VIOLATED (зеленото не разрешава нищо срещу него).
 *  3. mistake-refuse-then-creep refuses the wave and creeps over on a RED LAMP
 *     while halted → STILL the controller code and NEVER RED_LIGHT_CROSSED: the
 *     permission REPLACES the lamp grading in both directions (ЗДвП чл. 7).
 *  4. COMMITTED FILES under content/traces/sc-sig-controller-live/ ARE the
 *     recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD (after ANY change to the scripts, the recorder, sx-v1 or the rule
 * engine, then commit the JSON):
 *
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-sig-controller-live-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_SIG_CONTROLLER_LIVE } from "../../lessons/scenario/templates-signals2";
import type { SimTickEvent } from "../../rules";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScSigControllerLiveDrive,
  scSigControllerLiveTraceNames,
  type ScSigControllerLiveTraceName,
} from "../scSigControllerLive";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const TEMPLATE_ID = "sc-sig-controller-live";

const sxDistrict = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "sx-v1.json"), "utf-8"),
) as unknown;

type LineCrossing = Extract<SimTickEvent, { kind: "stopLineCrossed" }>;

interface ProbedDrive {
  drive: RecordedDrive;
  /** Every trafficLight stopLineCrossed the production runtime emitted. */
  crossings: LineCrossing[];
  /** Session time of each crossing — the authored timetable made checkable. */
  crossingTimes: number[];
}

function record(name: ScSigControllerLiveTraceName): ProbedDrive {
  const crossings: LineCrossing[] = [];
  const crossingTimes: number[] = [];
  const drive = recordScSigControllerLiveDrive(sxDistrict, name, {
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

function commendationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const drives = new Map<ScSigControllerLiveTraceName, ProbedDrive>(
  scSigControllerLiveTraceNames().map((n) => [n, record(n)]),
);

describe("sc-sig-controller-live — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations", () => {
    expect(violationCodes(shadow.drive)).toEqual([]);
  });

  it("THE POINT: crosses ON A RED LAMP under the controller's permission, and it is innocent", () => {
    // If the reducer ever stopped letting the permission override the lamps,
    // this drive would grade RED_LIGHT_CROSSED (опасна, 10 т.) and the template
    // would be teaching a student to fail. The lamp truth is probed on the
    // crossing event itself, not asserted about the offsets.
    expect(shadow.crossings).toHaveLength(1);
    expect(shadow.crossings[0].lightState).toBe("red");
    expect(shadow.crossings[0].controller).toBe("proceed");
    // …inside the authored permission window (flipAtSec 26), on a lamp that has
    // been red since t = 0 (signalOffsetSec 23). Both dials pinned by measurement.
    expect(shadow.crossingTimes[0]).toBeLessThan(26);
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
      "HARSH_BRAKING_NO_CAUSE",
    ]) {
      expect(codes).not.toContain(c);
    }
  });

  it("AND IS CREDITED FOR IT — the арм that only convicted now praises too", () => {
    // audit sc-sig-controller-live:bf4c6bab. Zero violations was never the same
    // thing as feedback: this drive is the лесson performed perfectly and its
    // sheet read «COMMENDATIONS (0): (none credited)», because the reducer's
    // controller branch had a `halt` arm and nothing else. The credit is ONE
    // per crossing, at the crossing, and it is the crossing this file already
    // probes for red+proceed two asserts up.
    expect(commendationCodes(shadow.drive)).toEqual(["CONTROLLER_SIGNAL_OBEYED"]);
    const praise = shadow.drive.ruleEvents.find((e) => e.kind === "commendation")!;
    expect(praise.t).toBeCloseTo(shadow.crossingTimes[0], 1);
    // CLEAN_DRIVING is NOT the thing that was missing and must not be what
    // arrives: it needs 250 m of violation-free travel and this route is
    // ~150 m, so without the чл. 7 credit a flawless run stays empty.
    expect(commendationCodes(shadow.drive)).not.toContain("CLEAN_DRIVING");
  });

  it("resolves the staged controller as 'clear' — WAVED THROUGH, not yielded to", () => {
    // The one-word difference between this drill and sc-signal-controller: that
    // shadow earns "yielded" by holding at the line, this one must NOT stop
    // (the officer is waving it on). The runner latches a hold at ≤ 4 km/h, so
    // "clear" is the assertion that the drive kept rolling on the permission.
    const outcome = shadow.drive.outcomes.find((o) => o.eventId === "sc-sctl-officer");
    expect(outcome).toBeDefined();
    expect(outcome!.kind).toBe("trafficController");
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("clear");
    expect(outcome!.tSec).toBeLessThan(26);
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

describe("sc-sig-controller-live — mistakes grade EXACTLY the controller code (doc 76 §9 stage 5)", () => {
  for (const name of ["mistake-wait-for-green", "mistake-refuse-then-creep"] as const) {
    const probed = drives.get(name)!;

    it(`${name}: exactly CONTROLLER_SIGNAL_VIOLATED — nothing else`, () => {
      expect([...new Set(violationCodes(probed.drive))]).toEqual(["CONTROLLER_SIGNAL_VIOLATED"]);
      const outcome = probed.drive.outcomes.find((o) => o.eventId === "sc-sctl-officer")!;
      expect(outcome.success).toBe(false);
      expect(outcome.detail).toBe("violation");
      // Crossed strictly AFTER the authored flip — the officer had closed the
      // direction, which is the only reason either demo is a mistake at all.
      expect(outcome.tSec).toBeGreaterThan(26);
    });

    it(`${name}: the long wait at the line is never itself billed`, () => {
      // Both demos rest 5.275 m short of the paint for 14–37 s. With a
      // controller posted the runtime surfaces the EFFECTIVE signal — a halted
      // approach reads "red" however green its lamp is — so the freeze can
      // never be HESITATION_AT_GREEN, and the pose never STOP_LINE_OVERSHOOT
      // (window 1.2 m). The fault of BOTH demos is moving, never waiting.
      const codes = violationCodes(probed.drive);
      expect(codes).not.toContain("HESITATION_AT_GREEN");
      expect(codes).not.toContain("STOP_LINE_OVERSHOOT");
      expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
    });

    it(`${name}: and it is NOT praised — the credit tracks the act, not the lesson`, () => {
      // The praise arm (bf4c6bab) must never become „you were in the чл. 7
      // drill, here is a ✓". Both demos cross this line; one on a green lamp,
      // one on a red; both on the officer's HALT — so neither may be credited.
      expect(commendationCodes(probed.drive)).not.toContain("CONTROLLER_SIGNAL_OBEYED");
    });
  }

  it("mistake-wait-for-green: convicted with the lamp AFFIRMATIVELY GREEN", () => {
    // The classic half: the conviction comes from the controller's halt while
    // the cluster's own lamps show this approach green.
    const probed = drives.get("mistake-wait-for-green")!;
    expect(probed.crossings).toHaveLength(1);
    expect(probed.crossings[0].lightState).toBe("green");
    expect(probed.crossings[0].controller).toBe("halt");
  });

  it("mistake-refuse-then-creep: convicted on a RED lamp — and NOT for the red", () => {
    // The sharpest assert of the file. This driver crossed a red light: under
    // any other template that is RED_LIGHT_CROSSED. Here the permission has
    // REPLACED the lamp grading entirely, so the sheet names the officer and
    // the lamp is not even mentioned — the two codes must never co-occur, or
    // the card would teach „не минавай на червено" instead of чл. 7.
    const probed = drives.get("mistake-refuse-then-creep")!;
    expect(probed.crossings).toHaveLength(1);
    expect(probed.crossings[0].lightState).toBe("red");
    expect(probed.crossings[0].controller).toBe("halt");
    expect(violationCodes(probed.drive)).not.toContain("RED_LIGHT_CROSSED");
  });

  it("the pair is one lesson twice: the SAME code from opposite lamps", () => {
    const green = drives.get("mistake-wait-for-green")!;
    const red = drives.get("mistake-refuse-then-creep")!;
    expect(green.crossings[0].lightState).not.toBe(red.crossings[0].lightState);
    expect([...new Set(violationCodes(green.drive))]).toEqual(
      [...new Set(violationCodes(red.drive))],
    );
    // …and the shadow's crossing is on the same red lamp as the creeper's. The
    // lamp is not what separates innocence from a 10-point опасна — the
    // officer's permission is, and these three drives are the proof.
    expect(drives.get("shadow-correct")!.crossings[0].lightState).toBe(
      red.crossings[0].lightState,
    );
  });

  it("the mistake codes match the template's authored codeRefs", () => {
    expect([...new Set(violationCodes(drives.get("mistake-wait-for-green")!.drive))]).toEqual(
      SC_SIG_CONTROLLER_LIVE.mistakes[0].codeRefs,
    );
    expect([...new Set(violationCodes(drives.get("mistake-refuse-then-creep")!.drive))]).toEqual(
      SC_SIG_CONTROLLER_LIVE.mistakes[1].codeRefs,
    );
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", TEMPLATE_ID);
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", TEMPLATE_ID);

  for (const name of scSigControllerLiveTraceNames()) {
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
    const name = scSigControllerLiveTraceNames()[0];
    const again = recordScSigControllerLiveDrive(sxDistrict, name);
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get(name)!.drive.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [
      SC_SIG_CONTROLLER_LIVE.shadow,
      ...SC_SIG_CONTROLLER_LIVE.mistakes.map((m) => m.traceRef),
    ];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${TEMPLATE_ID}/`)).toBe(true);
    }
    const expected = scSigControllerLiveTraceNames().map(
      (n) => `content/traces/${TEMPLATE_ID}/${n}.trace.json`,
    );
    expect([
      SC_SIG_CONTROLLER_LIVE.shadow.path,
      ...SC_SIG_CONTROLLER_LIVE.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
