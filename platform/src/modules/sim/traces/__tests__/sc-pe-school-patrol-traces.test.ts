/**
 * PE-07 + PE-02 trace gate — „Училищна пътека със стоп-палка"
 * (sc-pe-school-patrol on pe-school-v1), doc 76 §5/§9 stages 3+5:
 *
 *  1. SHADOW replays through the PRODUCTION stack with ZERO violations and
 *     earns PEDESTRIAN_YIELDED, and the PADDLE WAS OBEYED: the policeStop
 *     warden's outcome channel reads "yielded" — the лесson is provable on the
 *     recorded outcomes, not merely on the absence of faults.
 *  2. MISTAKE DEMOS grade EXACTLY their template codeRefs — the drive-through
 *     grades PEDESTRIAN_NOT_YIELDED alone (a LAWFUL 26 km/h: no speeding, no
 *     too-fast, no contact); the fast approach grades SPEEDING_OVER_LIMIT
 *     alone (~38 in the 30 zone: above the 33 grace, below the 40 dangerous
 *     band), and the warden still reads "yielded" — proof the demo isolates
 *     the APPROACH fault and does not smuggle in a yield failure.
 *  3. COMMITTED FILES under content/traces/sc-pe-school-patrol/ ARE the
 *     recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD (after ANY change to the scripts, recorder, district or rules):
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-pe-school-patrol-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_PE_SCHOOL_PATROL } from "../../lessons/scenario/templates-pe2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScPeSchoolPatrolDrive, type ScPeSchoolPatrolTraceName } from "../scPeSchoolPatrol";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const NAMES: ScPeSchoolPatrolTraceName[] = [
  "shadow-correct",
  "mistake-ignored-paddle",
  "mistake-fast-approach",
];

/** The 50 → 30 school-zone entry and the zebra (pinned from pe-school-v1). */
const Y_ZONE = 140;
const Y_CROSSING = 250;

function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}
/** The warden is scenery + measurement only — this is its outcome channel. */
function wardenOutcome(d: RecordedDrive) {
  return d.outcomes.find((o) => o.eventId === "sc-pesp-warden");
}

const district = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "pe-school-v1.json"), "utf-8"),
);
const drives = new Map<ScPeSchoolPatrolTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScPeSchoolPatrolDrive(district, n)]),
);

describe("sc-pe-school-patrol — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns PEDESTRIAN_YIELDED", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("PEDESTRIAN_YIELDED");
  });

  it("the PADDLE WAS OBEYED: the warden resolves 'yielded' at its halt point", () => {
    const outcome = wardenOutcome(shadow);
    expect(outcome).toBeDefined();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
  });

  it("the child group resolves 'yielded' — the group was let across", () => {
    const outcome = shadow.outcomes.find((o) => o.eventId === "sc-pesp-children");
    expect(outcome).toBeDefined();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
  });

  it("holds the зона-30 regime: never above 30 anywhere inside the school zone", () => {
    // The зона-30 lesson is provable on the samples, not just on the absence
    // of a speeding code (which only fires after a 2 s sustain past the grace).
    const inZone = shadow.trace.samples.filter((s) => s.y >= Y_ZONE);
    expect(inZone.length).toBeGreaterThan(0);
    expect(Math.max(...inZone.map((s) => s.speedKmh))).toBeLessThanOrEqual(30);
    // …and it really was a boulevard speed before the entry (the delta IS the
    // taught behaviour: the driver shed speed BEFORE the sign).
    const beforeZone = shadow.trace.samples.filter((s) => s.y < Y_ZONE - 40);
    expect(Math.max(...beforeZone.map((s) => s.speedKmh))).toBeGreaterThan(40);
  });

  it("stops short of the zebra (inside a REAL wait) and finishes north with Bulgarian copy", () => {
    const rested = shadow.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 0.5 && s.y > Y_CROSSING - 12 && s.y < Y_CROSSING,
    );
    expect(rested.length).toBeGreaterThanOrEqual(20 * 8); // ≥ ~8 s at 20 Hz
    // It never crept INTO the zebra while waiting.
    expect(Math.max(...rested.map((s) => s.y))).toBeLessThan(Y_CROSSING);
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(285);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-pe-school-patrol — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Подминаване на вдигната стоп-палка“: exactly PEDESTRIAN_NOT_YIELDED", () => {
    const drive = drives.get("mistake-ignored-paddle")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PE_SCHOOL_PATROL.mistakes[0].codeRefs].sort());
    // The approach itself was lawful — this demo isolates the yield failure.
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("PEDESTRIAN_CROSSING_TOO_FAST");
    expect(codes).not.toContain("COLLISION");
    expect(drive.outcomes.find((o) => o.eventId === "sc-pesp-children")?.detail).toBe("violation");
    // The paddle was driven past — the warden's receipt (scenery, never graded:
    // the conviction above comes from the PEOPLE the paddle was protecting).
    expect(wardenOutcome(drive)!.detail).toBe("passedWithoutStopping");
    expect(wardenOutcome(drive)!.success).toBe(false);
  });

  it("„Бърз подход към зоната“: exactly SPEEDING_OVER_LIMIT — never the dangerous band", () => {
    const drive = drives.get("mistake-fast-approach")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PE_SCHOOL_PATROL.mistakes[1].codeRefs].sort());
    // The band is the whole tuning: >33 (grace) but never >40 (опасна).
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    // The stop that follows is a correct yield — the demo isolates the APPROACH.
    expect(codes).not.toContain("PEDESTRIAN_NOT_YIELDED");
    expect(codes).not.toContain("PEDESTRIAN_CROSSING_TOO_FAST");
    expect(wardenOutcome(drive)!.detail).toBe("yielded");
    expect(commendationCodes(drive)).toContain("PEDESTRIAN_YIELDED");
  });

  it("the fast approach really sat in the 33..40 band INSIDE the school zone", () => {
    // Proves the code came from the zone's own 30 limit, not from the 50
    // approach segment: the speeding samples are all past the entry.
    const drive = drives.get("mistake-fast-approach")!;
    const speeding = drive.trace.samples.filter((s) => s.y >= Y_ZONE && s.speedKmh > 33);
    expect(speeding.length).toBeGreaterThan(0);
    expect(Math.max(...speeding.map((s) => s.speedKmh))).toBeLessThanOrEqual(40);
    // …and the episode completed in the map's SPEED-ONLY WINDOW (before the
    // crossing zone arms at ~215), which is why no crossing code piles on.
    expect(Math.min(...speeding.map((s) => s.y))).toBeLessThan(Y_CROSSING - 35);
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", "sc-pe-school-patrol");
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", "sc-pe-school-patrol");

  for (const name of NAMES) {
    it(`sc-pe-school-patrol/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe("sc-pe-school-patrol");
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const again = recordScPeSchoolPatrolDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_PE_SCHOOL_PATROL.shadow, ...SC_PE_SCHOOL_PATROL.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith("content/traces/sc-pe-school-patrol/")).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/sc-pe-school-patrol/${n}.trace.json`);
    expect([
      SC_PE_SCHOOL_PATROL.shadow.path,
      ...SC_PE_SCHOOL_PATROL.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
