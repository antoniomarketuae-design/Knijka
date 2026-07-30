/**
 * Trace gates — sc-park-perp-forward (doc 76 §5/§9; the doc 86 D11 parking
 * deepening, lane 15): the nose-in entry into the P0's own bay.
 *
 *  1. SHADOW: the authored wide setup (x = 0.9) + a single quarter-arc of
 *     radius 4 replays through the PRODUCTION stack with ZERO violations and
 *     comes to rest on the bay centre in a FORWARD gear — the proof that the
 *     taught „buy the swing from the far side of the aisle" actually clears the
 *     south neighbour's corner.
 *  2. MISTAKE DEMOS: the early turn out of the right-hand lane takes that exact
 *     corner (COLLISION, detail „vehicle", at creep speed); and the blind exit
 *     — the SAME clean park, followed by the reverse it obliges — grades
 *     COLLISION with detail „pedestrian". Two different geometries, two
 *     different details, one code.
 *  3. COMMITTED FILES: content/traces/sc-park-perp-forward/*.trace.json ARE the
 *     recordings of these scripts, byte-for-byte, with public copies.
 *
 * RE-RECORD (after ANY change to the scripts, recorder, district or rules):
 *
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-park-perp-forward-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_PARK_PERP_FORWARD } from "../../lessons/scenario/templates-parking";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { createTracePoint } from "../types";
import { sampleAt } from "../sample";
import {
  recordScParkPerpForwardDrive,
  type ScParkPerpForwardTraceName,
} from "../scParkPerpForward";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const CONTENT_DIR = path.join(REPO_ROOT, "content", "traces", "sc-park-perp-forward");
const PUBLIC_DIR = path.join(REPO_ROOT, "platform", "public", "traces", "sc-park-perp-forward");
const RECORD = process.env.RECORD_TRACES === "1";

const district: unknown = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "lot-perp-v1.json"), "utf-8"),
);

const NAMES: ScParkPerpForwardTraceName[] = [
  "shadow-correct",
  "mistake-early-turn",
  "mistake-blind-exit",
];

const drives = new Map<ScParkPerpForwardTraceName, RecordedDrive>(
  NAMES.map((name) => [name, recordScParkPerpForwardDrive(district, name)]),
);

function violationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

describe("sc-park-perp-forward — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations — the wide swing clears the south neighbour", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("ends at rest on the bay centre, on the bay axis (the §5 completion pose)", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    // Target bay lot-bay-3: centre (5.03, 0), axis east-west. The template
    // grades centerTolM 0.5 / headingTolDeg 10 — the shadow lands far inside.
    expect(Math.hypot(last.x - 5.03, last.y - 0)).toBeLessThan(0.2);
    const axisDiff = Math.abs(((last.headingDeg - 90) % 180) + 180) % 180;
    expect(Math.min(axisDiff, 180 - axisDiff)).toBeLessThan(3);
    expect(Math.abs(last.speedKmh)).toBeLessThan(0.5);
    expect(last.brakeOn).toBe(true);
  });

  it("enters FORWARD — no sample inside the bay is in reverse gear", () => {
    const insideBay = shadow.trace.samples.filter((s) => s.x > 3.0);
    expect(insideBay.length).toBeGreaterThan(10);
    expect(insideBay.every((s) => s.gear >= 0)).toBe(true);
  });

  it("takes its room on the LEFT before the swing — the drill's first task", () => {
    // Every sample between the veer and the turn-in must sit at/left of the
    // setup line, and never inside the lane-detector band (x >= 0.81).
    const setup = shadow.trace.samples.filter((s) => s.y > -9.6 && s.y < -4.2);
    expect(setup.length).toBeGreaterThan(5);
    expect(Math.max(...setup.map((s) => s.x))).toBeLessThan(1.3);
    expect(Math.min(...setup.map((s) => s.x))).toBeGreaterThanOrEqual(0.81);
  });
});

describe("sc-park-perp-forward — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Подранил завой от дясната лента“: the corner clip, exact codes", () => {
    const drive = drives.get("mistake-early-turn")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PARK_PERP_FORWARD.mistakes[0].codeRefs].sort());
    const collision = drive.ruleEvents.find(
      (e) => e.kind === "violation" && e.code === "COLLISION",
    )!;
    expect(collision.kind === "violation" ? collision.detail : undefined).toBe("vehicle");
    const at = createTracePoint();
    sampleAt(drive.trace, collision.t, at);
    expect(Math.abs(at.speedKmh)).toBeGreaterThan(0.5);
    expect(Math.abs(at.speedKmh)).toBeLessThan(6);
    // Forward gear, and SOUTH of the bay centreline: the corner the early
    // swing eats is the south neighbour's, exactly as the copy says.
    expect(at.gear).toBeGreaterThanOrEqual(0);
    expect(at.y).toBeLessThan(0);
  });

  it("„Чиста маневра, сляп изход“: the exit the entry obliges, exact codes", () => {
    const drive = drives.get("mistake-blind-exit")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PARK_PERP_FORWARD.mistakes[1].codeRefs].sort());
    const collision = drive.ruleEvents.find(
      (e) => e.kind === "violation" && e.code === "COLLISION",
    )!;
    expect(collision.kind === "violation" ? collision.detail : undefined).toBe("pedestrian");
    // The demo's whole argument: the park itself was clean — the ONLY contact
    // in the drive happens in REVERSE, after it.
    const at = createTracePoint();
    sampleAt(drive.trace, collision.t, at);
    expect(at.gear).toBe(-1);
    // …and there is no look between the park and the reverse.
    const reverseStart = drive.trace.samples.find((s) => s.gear === -1)!.tSec;
    const glancesNearReverse = drive.trace.events.filter(
      (e) => e.kind.startsWith("glance-") && e.tSec > reverseStart - 10,
    );
    expect(glancesNearReverse).toEqual([]);
  });
});

describe("committed trace files — the determinism law", () => {
  for (const name of NAMES) {
    const contentFile = path.join(CONTENT_DIR, `${name}.trace.json`);
    const publicFile = path.join(PUBLIC_DIR, `${name}.trace.json`);

    it(`${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
      const serialized = serializeScenarioTrace(drives.get(name)!.trace) + "\n";
      if (RECORD) {
        mkdirSync(CONTENT_DIR, { recursive: true });
        mkdirSync(PUBLIC_DIR, { recursive: true });
        writeFileSync(contentFile, serialized);
        writeFileSync(publicFile, serialized);
      }
      expect(existsSync(contentFile), `${contentFile} missing — run the RECORD_TRACES tool`).toBe(true);
      expect(existsSync(publicFile), `${publicFile} missing — run the RECORD_TRACES tool`).toBe(true);
      expect(readFileSync(contentFile, "utf-8")).toBe(serialized);
      expect(readFileSync(publicFile, "utf-8")).toBe(readFileSync(contentFile, "utf-8"));
      const parsed = parseScenarioTrace(JSON.parse(readFileSync(contentFile, "utf-8")));
      expect(parsed).not.toBeNull();
      expect(parsed!.meta.scenarioId).toBe("sc-park-perp-forward");
    });
  }

  it("recording is deterministic: a second run serializes identically", () => {
    const again = recordScParkPerpForwardDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    expect(SC_PARK_PERP_FORWARD.shadow.path).toBe(
      "content/traces/sc-park-perp-forward/shadow-correct.trace.json",
    );
    expect(SC_PARK_PERP_FORWARD.shadow.pending).not.toBe(true);
    const paths = SC_PARK_PERP_FORWARD.mistakes.map((m) => m.traceRef.path);
    expect(paths).toEqual([
      "content/traces/sc-park-perp-forward/mistake-early-turn.trace.json",
      "content/traces/sc-park-perp-forward/mistake-blind-exit.trace.json",
    ]);
    for (const m of SC_PARK_PERP_FORWARD.mistakes) expect(m.traceRef.pending).not.toBe(true);
  });
});
