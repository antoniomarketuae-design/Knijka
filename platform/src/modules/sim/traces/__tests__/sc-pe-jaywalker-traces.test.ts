/**
 * PE-13 trace gate — „Пешеходец на червено" (sc-pe-jaywalker on pe-jay-v1),
 * doc 76 §5/§9 stages 3+5:
 *
 *  1. SHADOW replays through the PRODUCTION stack with ZERO violations and
 *     earns PEDESTRIAN_YIELDED — braking for the jaywalker DESPITE a pinned
 *     green. The чл. 120 lesson is provable on the events: every drive's
 *     stopLineCrossed carries lightState "green" (the player really had the
 *     light; the duty of care still governed).
 *  2. MISTAKE DEMOS grade EXACTLY their template codeRefs — the drive-through
 *     grades PEDESTRIAN_NOT_YIELDED alone (28 km/h, under the approach cap,
 *     no contact); the distracted crawl grades COLLISION alone.
 *  3. COMMITTED FILES under content/traces/sc-pe-jaywalker/ ARE the recordings
 *     of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD (after ANY change to the scripts, recorder, district or rules):
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-pe-jaywalker-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SimTickEvent } from "../../rules";
import { SC_PE_JAYWALKER } from "../../lessons/scenario/templates-pe";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScPeJaywalkerDrive, type ScPeJaywalkerTraceName } from "../scPeJaywalker";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const NAMES: ScPeJaywalkerTraceName[] = ["shadow-correct", "mistake-my-green", "mistake-collision"];

type LineCrossing = Extract<SimTickEvent, { kind: "stopLineCrossed" }>;

interface DriveWithLines {
  drive: RecordedDrive;
  lines: LineCrossing[];
}

function record(name: ScPeJaywalkerTraceName): DriveWithLines {
  const lines: LineCrossing[] = [];
  const drive = recordScPeJaywalkerDrive(district, name, {
    onTick: (t) => {
      for (const e of t.events) if (e.kind === "stopLineCrossed") lines.push(e);
    },
  });
  return { drive, lines };
}

function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "pe-jay-v1.json"), "utf-8"),
);
const drives = new Map<ScPeJaywalkerTraceName, DriveWithLines>(NAMES.map((n) => [n, record(n)]));

describe("sc-pe-jaywalker — the shadow gate (doc 76 §5)", () => {
  const { drive: shadow } = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns PEDESTRIAN_YIELDED despite the green", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("PEDESTRIAN_YIELDED");
  });

  it("the staged jaywalker resolves 'yielded'", () => {
    const outcome = shadow.outcomes.find((o) => o.eventId === "sc-jay-ped");
    expect(outcome).toBeDefined();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
  });

  it("stops short of the crossing (inside a REAL wait) and finishes north with Bulgarian copy", () => {
    // The full stop lands past the junction, before the crossing at y = 34.
    const rested = shadow.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 0.5 && s.y > 20 && s.y < 34,
    );
    expect(rested.length).toBeGreaterThanOrEqual(20 * 4); // ≥ ~4 s at 20 Hz
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(65);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-pe-jaywalker — the чл. 120 proof: every drive crossed on GREEN", () => {
  for (const name of NAMES) {
    it(`${name}: the junction stop line carried lightState "green"`, () => {
      const { lines } = drives.get(name)!;
      expect(lines.length).toBeGreaterThanOrEqual(1);
      expect(lines[0].control).toBe("trafficLight");
      expect(lines[0].lightState).toBe("green");
    });
  }
});

describe("sc-pe-jaywalker — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Аз съм на зелено“: exactly PEDESTRIAN_NOT_YIELDED — no too-fast, no contact", () => {
    const { drive } = drives.get("mistake-my-green")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PE_JAYWALKER.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("PEDESTRIAN_CROSSING_TOO_FAST");
    expect(codes).not.toContain("COLLISION");
    expect(drive.outcomes.find((o) => o.eventId === "sc-jay-ped")?.detail).toBe("violation");
  });

  it("„Удар в пешеходеца“: exactly COLLISION — the distracted crawl meets her in-lane", () => {
    const { drive } = drives.get("mistake-collision")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PE_JAYWALKER.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("PEDESTRIAN_NOT_YIELDED");
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", "sc-pe-jaywalker");
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", "sc-pe-jaywalker");

  for (const name of NAMES) {
    it(`sc-pe-jaywalker/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe("sc-pe-jaywalker");
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const again = recordScPeJaywalkerDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.drive.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_PE_JAYWALKER.shadow, ...SC_PE_JAYWALKER.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith("content/traces/sc-pe-jaywalker/")).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/sc-pe-jaywalker/${n}.trace.json`);
    expect([SC_PE_JAYWALKER.shadow.path, ...SC_PE_JAYWALKER.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
