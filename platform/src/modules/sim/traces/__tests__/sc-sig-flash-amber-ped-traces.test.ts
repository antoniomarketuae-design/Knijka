/**
 * JU-20 × PE-01/PE-02 trace gate — „Мигащо жълто и пешеходец на пътеката"
 * (sc-sig-flash-amber-ped on pe-jay-v1), doc 76 §5/§9 stages 3+5:
 *
 *  1. SHADOW replays through the PRODUCTION stack with ZERO violations and
 *     earns PEDESTRIAN_YIELDED — a 28 km/h approach to the flashing amber
 *     (under the 30 km/h crossing cap), a real stop before the crossing, and a
 *     pass over an EMPTY crossing once the walker is off the carriageway.
 *  2. THE CAPABILITY is proven on the events, not assumed: with sx-n-c dialed
 *     flashingAmber, NO drive emits a single stopLineCrossed — the cluster
 *     carries no phase, so no signal code can fire and the crossing chain is
 *     the only graded axis (the whole reason this drill is authorable).
 *  3. MISTAKE DEMOS grade EXACTLY their template codeRefs — the hot approach
 *     grades PEDESTRIAN_CROSSING_TOO_FAST alone (the panic stop that follows is
 *     structurally innocent inside the crossing zone: no HARSH_BRAKING_NO_CAUSE,
 *     no непропускане, no contact); the lawful-speed drive-through grades
 *     PEDESTRIAN_NOT_YIELDED alone.
 *  4. COMMITTED FILES under content/traces/sc-sig-flash-amber-ped/ ARE the
 *     recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD (after ANY change to the scripts, recorder, district or rules):
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-sig-flash-amber-ped-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SimTickEvent } from "../../rules";
import { SC_SIG_FLASH_AMBER_PED } from "../../lessons/scenario/templates-signals2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScSigFlashAmberPedDrive,
  SC_SIG_FLASH_AMBER_PED_TRACE_NAMES,
  type ScSigFlashAmberPedTraceName,
} from "../scSigFlashAmberPed";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const NAMES = SC_SIG_FLASH_AMBER_PED_TRACE_NAMES;

type LineCrossing = Extract<SimTickEvent, { kind: "stopLineCrossed" }>;

interface DriveWithLines {
  drive: RecordedDrive;
  lines: LineCrossing[];
}

const district = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "pe-jay-v1.json"), "utf-8"),
);

function record(name: ScSigFlashAmberPedTraceName): DriveWithLines {
  const lines: LineCrossing[] = [];
  const drive = recordScSigFlashAmberPedDrive(district, name, {
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

const drives = new Map<ScSigFlashAmberPedTraceName, DriveWithLines>(NAMES.map((n) => [n, record(n)]));

describe("sc-sig-flash-amber-ped — the shadow gate (doc 76 §5)", () => {
  const { drive: shadow } = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns PEDESTRIAN_YIELDED", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("PEDESTRIAN_YIELDED");
  });

  it("the staged walker resolves 'yielded'", () => {
    const outcome = shadow.outcomes.find((o) => o.eventId === "sc-sfap-ped");
    expect(outcome).toBeDefined();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
  });

  it("stops short of the crossing (a REAL wait) and finishes north with Bulgarian copy", () => {
    // The full stop lands past the junction, before the crossing at y = 34.
    const rested = shadow.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 0.5 && s.y > 20 && s.y < 34,
    );
    expect(rested.length).toBeGreaterThanOrEqual(20 * 4); // >= ~4 s at 20 Hz
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(65);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("never exceeds the 30 km/h crossing cap once inside the zone (the lawful approach)", () => {
    // Zone arms at y ~ -0.76; from there to the crossing the shadow is slow.
    const inZone = shadow.trace.samples.filter((s) => s.y > 0 && s.y < 34);
    expect(inZone.length).toBeGreaterThan(0);
    for (const s of inZone) expect(s.speedKmh).toBeLessThanOrEqual(30);
  });
});

describe("sc-sig-flash-amber-ped — the flashing-amber proof: the lamps carry NO phase", () => {
  for (const name of NAMES) {
    it(`${name}: not a single stopLineCrossed fires at the dialed cluster`, () => {
      // The capability under test (runtime fireLine returns early for a
      // dark/flashing cluster): no phase => no signal code can ever grade here,
      // so every code these drives earn is a pedestrian-chain code.
      expect(drives.get(name)!.lines).toEqual([]);
    });
  }
});

describe("sc-sig-flash-amber-ped — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„несъобразена скорост“: exactly PEDESTRIAN_CROSSING_TOO_FAST — no harsh-brake, no непропускане, no contact", () => {
    const { drive } = drives.get("mistake-hot-approach")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SIG_FLASH_AMBER_PED.mistakes[0].codeRefs].sort());
    // The three false positives this demo is deliberately shaped to avoid.
    expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
    expect(codes).not.toContain("PEDESTRIAN_NOT_YIELDED");
    expect(codes).not.toContain("COLLISION");
    // It really did carry a hot speed into the zone (the graded fault).
    const hot = drive.trace.samples.filter((s) => s.y > 0 && s.y < 16 && s.speedKmh > 40);
    expect(hot.length).toBeGreaterThan(0);
    // …and it really did stop before the crossing (which is WHY nothing else grades).
    const rested = drive.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 0.5 && s.y > 20 && s.y < 34,
    );
    expect(rested.length).toBeGreaterThan(0);
  });

  it("„непропускане“: exactly PEDESTRIAN_NOT_YIELDED — lawful speed, occupied crossing, no contact", () => {
    const { drive } = drives.get("mistake-no-yield")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SIG_FLASH_AMBER_PED.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("PEDESTRIAN_CROSSING_TOO_FAST");
    expect(codes).not.toContain("COLLISION");
    expect(drive.outcomes.find((o) => o.eventId === "sc-sfap-ped")?.detail).toBe("violation");
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", "sc-sig-flash-amber-ped");
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", "sc-sig-flash-amber-ped");

  for (const name of NAMES) {
    it(`sc-sig-flash-amber-ped/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe("sc-sig-flash-amber-ped");
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const again = recordScSigFlashAmberPedDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.drive.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_SIG_FLASH_AMBER_PED.shadow, ...SC_SIG_FLASH_AMBER_PED.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith("content/traces/sc-sig-flash-amber-ped/")).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/sc-sig-flash-amber-ped/${n}.trace.json`);
    expect([
      SC_SIG_FLASH_AMBER_PED.shadow.path,
      ...SC_SIG_FLASH_AMBER_PED.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
