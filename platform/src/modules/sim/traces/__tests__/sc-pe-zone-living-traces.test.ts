/**
 * PE-15 + PE-02 trace gate — „Жилищна зона — гостите са пешеходците"
 * (sc-pe-zone-living on pe-zone-v1), doc 76 §5/§9 stages 3+5:
 *
 *  1. SHADOW replays through the PRODUCTION stack with ZERO violations and
 *     earns PEDESTRIAN_YIELDED, and the зона regime is provable on the SAMPLES
 *     (never above 20 anywhere inside the zone, while the approach really was a
 *     city speed) — the лесson holds on the recorded drive, not merely on the
 *     absence of faults.
 *  2. MISTAKE DEMOS grade EXACTLY their template codeRefs — „с 50" grades
 *     SPEEDING_DANGEROUS alone (~50 in the 20 zone, breached inside the map's
 *     SPEED-ONLY WINDOW, and never sustaining the 22..30 minor band on the way
 *     down); the push-through grades PEDESTRIAN_NOT_YIELDED alone (a LAWFUL
 *     18 km/h: no speeding, no too-fast, no contact).
 *  3. COMMITTED FILES under content/traces/sc-pe-zone-living/ ARE the
 *     recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD (after ANY change to the scripts, recorder, district or rules):
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-pe-zone-living-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_PE_ZONE_LIVING } from "../../lessons/scenario/templates-pe2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScPeZoneLivingDrive, type ScPeZoneLivingTraceName } from "../scPeZoneLiving";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const NAMES: ScPeZoneLivingTraceName[] = [
  "shadow-correct",
  "mistake-city-speed",
  "mistake-push-through",
];

/** Pinned from pe-zone-v1: the Д15 entry, the crossing, the Д16 exit mouth. */
const Y_ENTRY = 120;
const Y_CROSSING = 215;
const Y_EXIT = 285;
/** The CrossingZoneTracker's arming radius — the window's far edge. */
const CROSSING_ZONE_M = 35;

function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "pe-zone-v1.json"), "utf-8"),
);
const drives = new Map<ScPeZoneLivingTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScPeZoneLivingDrive(district, n)]),
);

describe("sc-pe-zone-living — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns PEDESTRIAN_YIELDED", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("PEDESTRIAN_YIELDED");
  });

  it("the walker resolves 'yielded' — the people were let across", () => {
    const outcome = shadow.outcomes.find((o) => o.eventId === "sc-pzl-walker-w");
    expect(outcome).toBeDefined();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
  });

  it("holds the зона-20 regime: never above 20 anywhere inside the living zone", () => {
    // The зона lesson is provable on the samples, not just on the absence of a
    // speeding code (which only fires after a sustain past the grace).
    const inZone = shadow.trace.samples.filter((s) => s.y >= Y_ENTRY && s.y <= Y_EXIT);
    expect(inZone.length).toBeGreaterThan(0);
    expect(Math.max(...inZone.map((s) => s.speedKmh))).toBeLessThanOrEqual(20);
    // …and it really was a city speed before the entry (the delta IS the taught
    // behaviour: the driver shed speed BEFORE the sign).
    const beforeZone = shadow.trace.samples.filter((s) => s.y < Y_ENTRY - 40);
    expect(Math.max(...beforeZone.map((s) => s.speedKmh))).toBeGreaterThan(40);
  });

  it("stops short of the people (inside a REAL wait) and never creeps into them", () => {
    const rested = shadow.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 0.5 && s.y > Y_CROSSING - 12 && s.y < Y_CROSSING,
    );
    expect(rested.length).toBeGreaterThanOrEqual(20 * 8); // >= ~8 s at 20 Hz
    expect(Math.max(...rested.map((s) => s.y))).toBeLessThan(Y_CROSSING);
  });

  it("crawls the Д16 exit mouth, then joins the ordinary street", () => {
    // The чл. 25 exit duty as the shadow demonstrates it: at the mouth the car
    // is at a speed it can stop from, and only past it does it accelerate.
    const atMouth = shadow.trace.samples.filter((s) => s.y > Y_EXIT - 10 && s.y <= Y_EXIT);
    expect(atMouth.length).toBeGreaterThan(0);
    expect(Math.max(...atMouth.map((s) => s.speedKmh))).toBeLessThanOrEqual(10);
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(325);
    const beyond = shadow.trace.samples.filter((s) => s.y > Y_EXIT + 25);
    expect(Math.max(...beyond.map((s) => s.speedKmh))).toBeGreaterThan(30);
  });

  it("carries Bulgarian annotation copy", () => {
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-pe-zone-living — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Квартална улица с 50“: exactly SPEEDING_DANGEROUS", () => {
    const drive = drives.get("mistake-city-speed")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PE_ZONE_LIVING.mistakes[0].codeRefs].sort());
    // The band is the whole tuning: the minor code must NOT ride along (the
    // 22..30 window is crossed too fast to sustain — see the script's header).
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    // The stop that follows is a correct yield — the demo isolates the SPEED.
    expect(codes).not.toContain("PEDESTRIAN_NOT_YIELDED");
    expect(codes).not.toContain("PEDESTRIAN_CROSSING_TOO_FAST");
    expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
    expect(commendationCodes(drive)).toContain("PEDESTRIAN_YIELDED");
    expect(drive.outcomes.find((o) => o.eventId === "sc-pzl-walker-w")?.detail).toBe("yielded");
  });

  it("the „с 50“ demo really sat above the 30 dangerous band INSIDE the zone", () => {
    // Proves the code came from the zone's own 20 limit, not from the 50
    // segments either side of it: the speeding samples all sit INSIDE the zone
    // (the 46 km/h run-out past the Д16 mouth is lawful — the limit is 50
    // again there — so it must be excluded, not asserted against).
    const drive = drives.get("mistake-city-speed")!;
    const speeding = drive.trace.samples.filter(
      (s) => s.y >= Y_ENTRY && s.y <= Y_EXIT && s.speedKmh > 30,
    );
    expect(speeding.length).toBeGreaterThan(0);
    // …and the episode completed in the map's SPEED-ONLY WINDOW (before the
    // crossing zone arms at ~180), which is why no crossing code piles on.
    expect(Math.min(...speeding.map((s) => s.y))).toBeLessThan(Y_CROSSING - CROSSING_ZONE_M);
    expect(Math.max(...speeding.map((s) => s.y))).toBeLessThan(Y_CROSSING - CROSSING_ZONE_M);
  });

  it("„Клаксон и провиране между пешеходците“: exactly PEDESTRIAN_NOT_YIELDED", () => {
    const drive = drives.get("mistake-push-through")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PE_ZONE_LIVING.mistakes[1].codeRefs].sort());
    // The zone speed itself was lawful — this demo isolates the yield failure.
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    expect(codes).not.toContain("PEDESTRIAN_CROSSING_TOO_FAST");
    expect(codes).not.toContain("COLLISION");
    expect(drive.outcomes.find((o) => o.eventId === "sc-pzl-walker-w")?.detail).toBe("violation");
  });

  it("the push-through really was lawful the whole way (18 in a 20)", () => {
    const drive = drives.get("mistake-push-through")!;
    const inZone = drive.trace.samples.filter((s) => s.y >= Y_ENTRY && s.y <= Y_EXIT);
    expect(inZone.length).toBeGreaterThan(0);
    expect(Math.max(...inZone.map((s) => s.speedKmh))).toBeLessThanOrEqual(20);
    // …and it never stopped for anyone: no rest anywhere near the people.
    const rested = inZone.filter((s) => Math.abs(s.speedKmh) < 0.5);
    expect(rested.length).toBe(0);
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", "sc-pe-zone-living");
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", "sc-pe-zone-living");

  for (const name of NAMES) {
    it(`sc-pe-zone-living/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe("sc-pe-zone-living");
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const again = recordScPeZoneLivingDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_PE_ZONE_LIVING.shadow, ...SC_PE_ZONE_LIVING.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith("content/traces/sc-pe-zone-living/")).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/sc-pe-zone-living/${n}.trace.json`);
    expect([
      SC_PE_ZONE_LIVING.shadow.path,
      ...SC_PE_ZONE_LIVING.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
