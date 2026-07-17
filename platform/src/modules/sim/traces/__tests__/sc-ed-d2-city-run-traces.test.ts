/**
 * ED-01 trace gate — „Изпитен сегмент „Лозенец" — градско каране"
 * (sc-ed-d2-city-run on d2-v1), doc 76 §5/§9 stages 3+5:
 *
 *  1. SHADOW replays through the PRODUCTION stack with ZERO violations and
 *     earns PEDESTRIAN_YIELDED over ~971 m of real Лозенец boulevard — a green
 *     pass at cluster 1, a REAL stop-and-wait at cluster 2's red, the curb lane
 *     held down the keep-right stretch, and a pass over an EMPTY zebra once the
 *     walker is off the carriageway.
 *  2. THE SEGMENT IS PROVEN ON THE EVENTS, not assumed: the shadow crosses
 *     exactly two stop lines and both read "green"; the red-light demo crosses
 *     the SAME second line reading "red". Same world, same offsets, one
 *     different choice — that is the drill's whole claim.
 *  3. MISTAKE DEMOS grade EXACTLY their template codeRefs — the red-light clip
 *     grades RED_LIGHT_CROSSED alone (it stops short of the zebra's zone, so
 *     the walker never releases); the no-yield clip grades
 *     PEDESTRIAN_NOT_YIELDED alone (it starts past cluster 2, so no stop line
 *     exists to contaminate it, and its 28 km/h approach stays under the
 *     crossing cap so „too fast" cannot fire instead).
 *  4. COMMITTED FILES under content/traces/sc-ed-d2-city-run/ ARE the
 *     recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD (after ANY change to the scripts, recorder, district or rules):
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ed-d2-city-run-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SimTickEvent } from "../../rules";
import { SC_ED_D2_CITY_RUN } from "../../lessons/scenario/templates-exam";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  buildScEdD2Route,
  recordScEdD2CityRunDrive,
  scEdD2RouteLength,
  SC_ED_D2_CITY_RUN_TRACE_NAMES,
  type ScEdD2CityRunTraceName,
} from "../scEdD2CityRun";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const NAMES = SC_ED_D2_CITY_RUN_TRACE_NAMES;

type LineCrossing = Extract<SimTickEvent, { kind: "stopLineCrossed" }>;
type CrossingPassed = Extract<SimTickEvent, { kind: "crossingPassed" }>;

interface DriveWithEvents {
  drive: RecordedDrive;
  lines: LineCrossing[];
  passed: CrossingPassed[];
}

const district = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "d2-v1.json"), "utf-8"),
);

/** The zebra, for in-zone speed assertions (crossing n331946209). */
const ZEBRA = { x: 138.3, y: 205.78 };
const CROSSING_ZONE_M = 35;

function record(name: ScEdD2CityRunTraceName): DriveWithEvents {
  const lines: LineCrossing[] = [];
  const passed: CrossingPassed[] = [];
  const drive = recordScEdD2CityRunDrive(district, name, {
    onTick: (t) => {
      for (const e of t.events) {
        if (e.kind === "stopLineCrossed") lines.push(e);
        if (e.kind === "crossingPassed") passed.push(e);
      }
    },
  });
  return { drive, lines, passed };
}

function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const drives = new Map<ScEdD2CityRunTraceName, DriveWithEvents>(NAMES.map((n) => [n, record(n)]));

describe("sc-ed-d2-city-run — the drive line is derived from the committed map", () => {
  it("the eight authored legs build one ~971 m curb-lane route", () => {
    const route = buildScEdD2Route(district);
    expect(route.length).toBeGreaterThan(200);
    expect(scEdD2RouteLength(district)).toBeCloseTo(971, 0);
    for (const [x, y] of route) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
  });

  it("it starts at the template's authored spawn pose", () => {
    // The template's start.position is a denormalized literal; the ghost must
    // actually begin there or the student and the shadow drive different runs.
    const route = buildScEdD2Route(district);
    expect(route[0][0]).toBeCloseTo(SC_ED_D2_CITY_RUN.start.position!.x, 1);
    expect(route[0][1]).toBeCloseTo(SC_ED_D2_CITY_RUN.start.position!.y, 1);
  });
});

describe("sc-ed-d2-city-run — the shadow gate (doc 76 §5)", () => {
  const { drive: shadow, lines, passed } = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns PEDESTRIAN_YIELDED", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("PEDESTRIAN_YIELDED");
  });

  it("the staged walker resolves 'yielded'", () => {
    const outcome = shadow.outcomes.find((o) => o.eventId === "sc-edcr-ped");
    expect(outcome).toBeDefined();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
  });

  it("crosses BOTH signal clusters, both on GREEN — the exam pass", () => {
    // Exactly two stop lines exist on this route (exam-districts battery); the
    // shadow must meet both lawfully. Cluster 1 is green on arrival; cluster 2
    // is green only because the shadow WAITED for it.
    expect(lines.length).toBe(2);
    expect(lines.map((l) => l.lightState)).toEqual(["green", "green"]);
    for (const l of lines) expect(l.control).toBe("trafficLight");
  });

  it("actually STOPPED at cluster 2's red line and waited it out", () => {
    // The map's natural offsets put ew red until t=35 and the approach at the
    // line at t≈33 — so a clean sheet here is not luck, it is a real rest.
    const rested = shadow.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 0.5 && Math.hypot(s.x - 535.26, s.y + 155.32) < 20,
    );
    expect(rested.length).toBeGreaterThanOrEqual(20 * 4); // >= ~4 s at 20 Hz
    // …and moved off without freezing on the green (HESITATION_AT_GREEN is a
    // 5 s sustain — the absence of the code above already proves it, but the
    // margin is what makes that absence robust).
    expect(shadow.ruleEvents.some((e) => e.kind === "violation" && e.code === "HESITATION_AT_GREEN")).toBe(false);
  });

  it("holds the crossing cap through the zebra zone — slow, not merely braking", () => {
    // PEDESTRIAN_CROSSING_TOO_FAST exempts a driver who is respondingByBraking,
    // so "no code" alone would be a weak claim. Assert the speed itself.
    const inZone = shadow.trace.samples.filter(
      (s) => Math.hypot(s.x - ZEBRA.x, s.y - ZEBRA.y) <= CROSSING_ZONE_M,
    );
    expect(inZone.length).toBeGreaterThan(0);
    for (const s of inZone) expect(s.speedKmh).toBeLessThanOrEqual(30);
  });

  it("waits the walker off the carriageway: the zebra is EMPTY when it passes", () => {
    const z = passed.find((p) => p.crossingId === "n331946209");
    expect(z).toBeDefined();
    expect(z!.pedestrianOnCrossing).toBe(false);
  });

  it("drives the whole segment and finishes NW with Bulgarian copy", () => {
    const s = shadow.trace.samples;
    let dist = 0;
    for (let i = 1; i < s.length; i++) dist += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
    expect(dist).toBeGreaterThan(950);
    const last = s[s.length - 1];
    expect(Math.hypot(last.x - 83.22, last.y - 283.09)).toBeLessThan(6);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ed-d2-city-run — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„преминаване на червено“: exactly RED_LIGHT_CROSSED — same line, same offsets, no stop", () => {
    const { drive, lines } = drives.get("mistake-red-light")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_ED_D2_CITY_RUN.mistakes[0].codeRefs].sort());
    // The demo's honesty: it crosses cluster 1 GREEN exactly like the shadow,
    // then takes the SAME second line the shadow waited at — on red.
    expect(lines.map((l) => l.lightState)).toEqual(["green", "red"]);
    // The clip stops short of the zebra's 35 m zone, so the walker never
    // releases and no pedestrian code can ride along.
    expect(drive.outcomes).toEqual([]);
    expect(codes).not.toContain("PEDESTRIAN_NOT_YIELDED");
    expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
    expect(codes).not.toContain("COLLISION");
  });

  it("„непропуснат пешеходец“: exactly PEDESTRIAN_NOT_YIELDED — lawful speed, occupied zebra, no contact", () => {
    const { drive, lines, passed } = drives.get("mistake-no-yield")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_ED_D2_CITY_RUN.mistakes[1].codeRefs].sort());
    // Starts past cluster 2: NO stop line exists on the clip, so no signal
    // code can contaminate the sheet — the fault stands alone by construction.
    expect(lines).toEqual([]);
    // It swept over the crossing while she was still on it — непропускане…
    const z = passed.find((p) => p.crossingId === "n331946209");
    expect(z).toBeDefined();
    expect(z!.pedestrianOnCrossing).toBe(true);
    expect(drive.outcomes.find((o) => o.eventId === "sc-edcr-ped")?.detail).toBe("violation");
    // …at a LAWFUL speed, which is what makes it a refusal and not a mishap.
    const inZone = drive.trace.samples.filter(
      (s) => Math.hypot(s.x - ZEBRA.x, s.y - ZEBRA.y) <= CROSSING_ZONE_M,
    );
    for (const s of inZone) expect(s.speedKmh).toBeLessThanOrEqual(30);
    expect(codes).not.toContain("PEDESTRIAN_CROSSING_TOO_FAST");
    expect(codes).not.toContain("COLLISION");
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", "sc-ed-d2-city-run");
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", "sc-ed-d2-city-run");

  for (const name of NAMES) {
    it(`sc-ed-d2-city-run/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe("sc-ed-d2-city-run");
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const again = recordScEdD2CityRunDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.drive.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_ED_D2_CITY_RUN.shadow, ...SC_ED_D2_CITY_RUN.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith("content/traces/sc-ed-d2-city-run/")).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/sc-ed-d2-city-run/${n}.trace.json`);
    expect([
      SC_ED_D2_CITY_RUN.shadow.path,
      ...SC_ED_D2_CITY_RUN.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
