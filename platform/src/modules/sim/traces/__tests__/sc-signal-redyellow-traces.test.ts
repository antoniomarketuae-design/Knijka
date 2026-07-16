/**
 * JU-08 trace gate — „Тръгване на червено-жълто" (sc-signal-redyellow on
 * sx-v1), doc 76 §5/§9 stages 3+5:
 *
 *  1. SHADOW replays through the PRODUCTION stack with ZERO violations —
 *     waits the red out, holds through the 1 s red+yellow, and crosses the
 *     line on GREEN (the crossing event's lightState proves it).
 *  2. MISTAKE DEMOS grade EXACTLY RED_YELLOW_CROSSED — both cross INSIDE the
 *     pinned 1 s window (lightState "redYellow" asserted on the events), the
 *     creep at walking pace and the jump at speed.
 *  3. COMMITTED FILES under content/traces/sc-signal-redyellow/ ARE the
 *     recordings of these scripts, byte-for-byte, with identical public
 *     copies — the determinism law IS the fragility-proofing of the window.
 *
 * RE-RECORD (after ANY change to the scripts, recorder, district or rules):
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-signal-redyellow-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SimTickEvent } from "../../rules";
import { SC_SIGNAL_REDYELLOW } from "../../lessons/scenario/templates-signals";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScSignalRedYellowDrive,
  type ScSignalRedYellowTraceName,
} from "../scSignalRedYellow";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const NAMES: ScSignalRedYellowTraceName[] = ["shadow-correct", "mistake-creep", "mistake-jump"];

type LineCrossing = Extract<SimTickEvent, { kind: "stopLineCrossed" }>;

interface DriveWithLines {
  drive: RecordedDrive;
  lines: LineCrossing[];
}

const district = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "sx-v1.json"), "utf-8"),
);

function record(name: ScSignalRedYellowTraceName): DriveWithLines {
  const lines: LineCrossing[] = [];
  const drive = recordScSignalRedYellowDrive(district, name, {
    onTick: (t) => {
      for (const e of t.events) if (e.kind === "stopLineCrossed") lines.push(e);
    },
  });
  return { drive, lines };
}

function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

const drives = new Map<ScSignalRedYellowTraceName, DriveWithLines>(
  NAMES.map((n) => [n, record(n)]),
);

describe("sc-signal-redyellow — the shadow gate (doc 76 §5)", () => {
  const { drive: shadow, lines } = drives.get("shadow-correct")!;

  it("replays with ZERO violations and crosses on GREEN after a real red wait", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0].control).toBe("trafficLight");
    expect(lines[0].lightState).toBe("green");
    // A REAL wait at the line (red + the red-yellow second) before the launch.
    const rested = shadow.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 0.5 && s.y < -27.73 && s.y > -33,
    );
    expect(rested.length).toBeGreaterThanOrEqual(20 * 6); // ≥ ~6 s at 20 Hz
  });

  it("carries the Bulgarian teach beats", () => {
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-signal-redyellow — mistakes cross INSIDE the 1 s window (doc 76 §9 stage 5)", () => {
  for (const name of ["mistake-creep", "mistake-jump"] as const) {
    it(`${name}: exactly RED_YELLOW_CROSSED, on a "redYellow" lamp`, () => {
      const { drive, lines } = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      const mistakeIdx = name === "mistake-creep" ? 0 : 1;
      expect(codes).toEqual([...SC_SIGNAL_REDYELLOW.mistakes[mistakeIdx].codeRefs].sort());
      expect(lines.length).toBeGreaterThanOrEqual(1);
      expect(lines[0].lightState).toBe("redYellow");
      // Never the red-light or overshoot codes — the window is its own state.
      expect(codes).not.toContain("RED_LIGHT_CROSSED");
      expect(codes).not.toContain("STOP_LINE_OVERSHOOT");
    });
  }
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", "sc-signal-redyellow");
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", "sc-signal-redyellow");

  for (const name of NAMES) {
    it(`sc-signal-redyellow/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe("sc-signal-redyellow");
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const again = recordScSignalRedYellowDrive(district, "mistake-creep");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("mistake-creep")!.drive.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_SIGNAL_REDYELLOW.shadow, ...SC_SIGNAL_REDYELLOW.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith("content/traces/sc-signal-redyellow/")).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/sc-signal-redyellow/${n}.trace.json`);
    expect([SC_SIGNAL_REDYELLOW.shadow.path, ...SC_SIGNAL_REDYELLOW.mistakes.map((m) => m.traceRef.path)]).toEqual(
      expected,
    );
  });
});
