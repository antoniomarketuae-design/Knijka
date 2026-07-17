/**
 * SP-11/JU-09 trace gate — „Видиш ли червено отдалеч, пусни газта"
 * (sc-sp-eco-coast on sx-v1), doc 76 §5/§9 stages 3+5:
 *
 *  1. SHADOW replays through the PRODUCTION stack with ZERO violations — lifts
 *     off early (already under 30 km/h a good 45 m short of the line), engine-
 *     brakes to a smooth halt in front of the paint, waits the last of the red
 *     out, and crosses on GREEN (the crossing event's lightState proves it).
 *  2. MISTAKE DEMOS grade EXACTLY their one code each:
 *     - „Газ до последно" → STOP_LINE_OVERSHOOT (nose past the line, still red;
 *       NEVER RED_LIGHT_CROSSED — it clears only once the light opens);
 *     - „Заспиване на зеленото" → HESITATION_AT_GREEN (a clean stop, then a
 *       freeze through the opening green).
 *  3. COMMITTED FILES under content/traces/sc-sp-eco-coast/ ARE the recordings
 *     of these scripts, byte-for-byte, with identical public copies — the
 *     determinism law IS the fragility-proofing of the pinned approach.
 *
 * RE-RECORD (after ANY change to the scripts, recorder, district or rules):
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-sp-eco-coast-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SimTickEvent } from "../../rules";
import { SC_SP_ECO_COAST } from "../../lessons/scenario/templates-speed";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScSpEcoCoastDrive, type ScSpEcoCoastTraceName } from "../scSpEcoCoast";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const NAMES: ScSpEcoCoastTraceName[] = [
  "shadow-correct",
  "mistake-late-brake",
  "mistake-sleep-at-green",
];

type LineCrossing = Extract<SimTickEvent, { kind: "stopLineCrossed" }>;

interface DriveWithLines {
  drive: RecordedDrive;
  lines: LineCrossing[];
}

const district = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "sx-v1.json"), "utf-8"),
);

function record(name: ScSpEcoCoastTraceName): DriveWithLines {
  const lines: LineCrossing[] = [];
  const drive = recordScSpEcoCoastDrive(district, name, {
    onTick: (t) => {
      for (const e of t.events) if (e.kind === "stopLineCrossed") lines.push(e);
    },
  });
  return { drive, lines };
}

function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

const drives = new Map<ScSpEcoCoastTraceName, DriveWithLines>(NAMES.map((n) => [n, record(n)]));

describe("sc-sp-eco-coast — the shadow gate (doc 76 §5)", () => {
  const { drive: shadow, lines } = drives.get("shadow-correct")!;

  it("replays with ZERO violations and crosses on GREEN after a coasted approach", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0].control).toBe("trafficLight");
    expect(lines[0].lightState).toBe("green");
  });

  it("PROVES the coast: already slow ~45 m out, then a smooth halt in front of the paint", () => {
    // The lift-off is visible in the kinematics: 45 m short of the line the car
    // is already well under the 50 limit (the gate the drill grades), and it
    // then comes fully to rest IN FRONT OF the paint (never over it — that would
    // be the overshoot mistake), on the last of the red.
    const coastBand = shadow.trace.samples.filter((s) => s.y >= -52 && s.y <= -44);
    expect(coastBand.length).toBeGreaterThan(0);
    expect(Math.max(...coastBand.map((s) => Math.abs(s.speedKmh)))).toBeLessThanOrEqual(32);
    // A real halt in front of the line (y between the line −27.73 and ~−33).
    const rested = shadow.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 0.5 && s.y < -27.73 && s.y > -33,
    );
    expect(rested.length).toBeGreaterThanOrEqual(20 * 3); // ≥ ~3 s at 20 Hz
  });

  it("carries the Bulgarian teach beats", () => {
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-sp-eco-coast — mistakes grade EXACTLY (doc 76 §9 stage 5)", () => {
  it("mistake-late-brake: exactly STOP_LINE_OVERSHOOT, and NEVER runs the red", () => {
    const { drive, lines } = drives.get("mistake-late-brake")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SP_ECO_COAST.mistakes[0].codeRefs].sort());
    expect(codes).toEqual(["STOP_LINE_OVERSHOOT"]);
    // The overrun is billed while red; the car clears only on green — so the
    // demo teaches the second-degree overshoot, not the 10-point red entry.
    expect(codes).not.toContain("RED_LIGHT_CROSSED");
    expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0].lightState).toBe("green");
  });

  it("mistake-sleep-at-green: exactly HESITATION_AT_GREEN, on a clean (non-overshooting) stop", () => {
    const { drive, lines } = drives.get("mistake-sleep-at-green")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SP_ECO_COAST.mistakes[1].codeRefs].sort());
    expect(codes).toEqual(["HESITATION_AT_GREEN"]);
    // The stop was in front of the line — the fault is the dawdle, not an overrun.
    expect(codes).not.toContain("STOP_LINE_OVERSHOOT");
    expect(codes).not.toContain("RED_LIGHT_CROSSED");
    expect(lines[0].lightState).toBe("green");
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", "sc-sp-eco-coast");
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", "sc-sp-eco-coast");

  for (const name of NAMES) {
    it(`sc-sp-eco-coast/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe("sc-sp-eco-coast");
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const again = recordScSpEcoCoastDrive(district, "mistake-late-brake");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("mistake-late-brake")!.drive.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_SP_ECO_COAST.shadow, ...SC_SP_ECO_COAST.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith("content/traces/sc-sp-eco-coast/")).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/sc-sp-eco-coast/${n}.trace.json`);
    expect([SC_SP_ECO_COAST.shadow.path, ...SC_SP_ECO_COAST.mistakes.map((m) => m.traceRef.path)]).toEqual(
      expected,
    );
  });
});
