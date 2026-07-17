/**
 * S trace gate — „Спри в лентата, не свивай на сляпо" (sc-hz-brake-dont-swerve
 * on hz-debris-v1, doc 72 OV-18), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations — a FULL-FORCE stop on a dead-
 *      straight wheel, resting 6 m short of the debris IN ITS OWN LANE, and
 *      never billing HARSH_BRAKING_NO_CAUSE (the template's ruleConfig is the
 *      whole reason — on a crossing-less street with the only other car a full
 *      lane pitch away, the engine's cause ledger is empty by construction, so
 *      the taught behaviour would otherwise grade „рязко спиране без причина").
 *   2. THE GHOST BRAKES AT THE STUDENT'S OWN RATE — asserted as a physical BAND
 *      (≈ 9 m/s², the live car's BRAKE_FORCE_N / CHASSIS_MASS), not merely a
 *      floor: a ghost braking harder than the car can would be teaching a stop
 *      no student can reproduce. See the sustainedDecel note below for why the
 *      raw frame-to-frame peak is NOT the right measurement.
 *   3. MISTAKE DEMOS grade EXACTLY their template codeRefs, and each is honest
 *      about its own geometry — proved with the recorder's own SAT test rather
 *      than asserted: the blind swerve genuinely clears the debris and genuinely
 *      puts the wheel a full lane over; the late brake genuinely never leaves
 *      its lane and genuinely reaches the rect.
 *   4. STRUCTURAL: no PEDESTRIAN_* code can fire in ANY drive (hz-debris-v1 has
 *      `crossings: []`) and no center-line code can either (the street is
 *      one-way — rules/engine.ts guards both arms on `oneway === false`).
 *   5. COMMITTED FILES under content/traces/sc-hz-brake-dont-swerve/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-hz-brake-dont-swerve-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_HZ_BRAKE_DONT_SWERVE } from "../../lessons/scenario/templates-hazards2";
import { CHASSIS_HALF_EXTENTS } from "../../vehicle/tuning";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { obstacleRectsOverlap, type RecordedDrive } from "../recorder";
import {
  hzBrakeDontSwerveObstacles,
  recordScHzBrakeDontSwerveDrive,
  type ScHzBrakeDontSwerveTraceName,
} from "../scHzBrakeDontSwerve";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-hz-brake-dont-swerve";
const NAMES: ScHzBrakeDontSwerveTraceName[] = [
  "shadow-correct",
  "mistake-blind-swerve",
  "mistake-late-brake",
];
/** hz-debris-v1 lane centers (meta.scenario) — pinned by value. */
const LANE_X = 4.06;
const ESCORT_X = -4.06;
/** The debris rect's center (meta.scenario.debrisY). */
const DEBRIS_Y = 190;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
/**
 * Deceleration of the drive over its SUSTAINED braking, m/s² (positive).
 *
 * The naive frame-to-frame maximum is NOT usable here and the reason is worth
 * pinning: the trace is decimated to 20 Hz, so the final clamp-to-zero of any
 * stop compresses the last ~1 m/s into one 50 ms sample and reports ~23–26 m/s²
 * — an artifact of the sampling grid, not of the ghost. Excluding sample pairs
 * where either endpoint is already below 5 km/h measures the ramp the script
 * actually authored (a steady ≈ 9.1 m/s²).
 */
function sustainedDecelMps2(d: RecordedDrive): number {
  const s = d.trace.samples;
  let peak = 0;
  for (let i = 1; i < s.length; i++) {
    const dt = s[i].tSec - s[i - 1].tSec;
    if (dt <= 0) continue;
    if (s[i].speedKmh <= 5 || s[i - 1].speedKmh <= 5) continue;
    const dv = (s[i].speedKmh - s[i - 1].speedKmh) / 3.6;
    peak = Math.max(peak, -dv / dt);
  }
  return peak;
}
/** True if the hero footprint ever overlaps the debris rect during the drive —
 *  the recorder's OWN SAT test (exported for exactly this), replayed over the
 *  committed samples. This is how each demo's contact claim is PROVED instead
 *  of assumed. */
function everTouchesDebris(d: RecordedDrive): boolean {
  const debris = hzBrakeDontSwerveObstacles()[0];
  return d.trace.samples.some((s) =>
    obstacleRectsOverlap(
      {
        x: s.x,
        y: s.y,
        headingDeg: s.headingDeg,
        halfWidthM: CHASSIS_HALF_EXTENTS.x,
        halfLengthM: CHASSIS_HALF_EXTENTS.z,
      },
      debris,
    ),
  );
}

const district = loadDistrict("hz-debris-v1");
const drives = new Map<ScHzBrakeDontSwerveTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScHzBrakeDontSwerveDrive(district, n)]),
);

describe("sc-hz-brake-dont-swerve — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations — the full-force stop is never billed as causeless", () => {
    expect(violationCodes(shadow)).toEqual([]);
    // The named FP this template's ruleConfig exists to prevent: without the
    // override the ghost's ~9 m/s² stop clears harshBrakeDecelMps2 (7) with
    // noBrakeCause TRUE for the whole drill — hz-debris-v1 has no crossing, no
    // junction and no stop line, and the escort sits 8.125 m off the driving
    // line, well outside leadGapFor's 4 m corridor. A car ABREAST of the
    // student is invisible to the engine's notion of „why is he braking".
    expect(violationCodes(shadow)).not.toContain("HARSH_BRAKING_NO_CAUSE");
  });

  it("brakes at the LIVE CAR'S OWN full-pedal rate — not harder, not a comfort stop", () => {
    // The band, both ends load-bearing:
    //  - below 8.5 the demo has quietly become a lesson about lifting off (the
    //    recorder's default envelope is 0.7 × 4.6 = 3.22 m/s², and this map is
    //    explicitly sized so that rate does NOT fit the reveal window);
    //  - above 10 the ghost would be out-braking the student's own car
    //    (BRAKE_FORCE_N / CHASSIS_MASS = 11000 / 1220 ≈ 9.0 m/s²) and the drill
    //    would be demonstrating a stop nobody can reproduce.
    const decel = sustainedDecelMps2(shadow);
    expect(decel).toBeGreaterThan(8.5);
    expect(decel).toBeLessThan(10);
  });

  it("keeps the wheel DEAD STRAIGHT and rests short of the debris, in its OWN lane", () => {
    const samples = shadow.trace.samples;
    // The whole „не свивай" claim of the card is this one assertion: the
    // shadow never leaves the driving line by so much as a centimetre — it
    // never even enters the lane the mistake demo dies in.
    for (const s of samples) expect(s.x).toBeCloseTo(LANE_X, 6);
    const rest = samples.find((s) => Math.abs(s.speedKmh) < 1 && s.y > 100);
    expect(rest, "the shadow never came to rest").toBeDefined();
    expect(rest!.y).toBeLessThan(DEBRIS_Y);
    expect(rest!.y).toBeGreaterThan(DEBRIS_Y - 8);
    // …and it never so much as brushes the debris (the recorder's own SAT test).
    expect(everTouchesDebris(shadow)).toBe(false);
    // It STAYS stopped — the drill's claim ends at the stop (no pass-around).
    expect(samples[samples.length - 1].speedKmh).toBeCloseTo(0, 3);
  });

  it("the escort is escorted past, untouched, from a real approach speed", () => {
    // The staged neighbour resolves cleanly: it paced abreast, was released at
    // the reveal, and sailed 60 m clear in its OWN lane while the player braked
    // — „with the escort untouched" is the brief's phrase and this is it.
    const outcome = shadow.outcomes.find((o) => o.eventId === "sc-hzbds-escort");
    expect(outcome).toBeDefined();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
    // The drill is worthless from a crawl: the reveal armed at the posted speed.
    expect(outcome!.approachSpeedKmh).toBeGreaterThan(45);
  });

  it("carries its Bulgarian annotation track", () => {
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-hz-brake-dont-swerve — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Рязко отклонение“: exactly LANE_CHANGE_WITHOUT_MIRROR_CHECK + COLLISION", () => {
    const drive = drives.get("mistake-blind-swerve")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_HZ_BRAKE_DONT_SWERVE.mistakes[0].codeRefs].sort());
    // THE CARD'S CLAIM, and the reason the demo signals: the indicator IS on,
    // so the missing LOOK is the only fault billed. If this ever starts firing,
    // the demo has drifted into being about the blinker — which is a different,
    // lesser lesson and already shipped elsewhere (sc-merge-lane-end).
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    // The fault is the missing mirror, NOT lane discipline or speed: the swerve
    // is a real lane change, driven at the lawful 50 on a clean lateral rate.
    expect(codes).not.toContain("POOR_LANE_KEEPING");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("NOT_KEEPING_RIGHT");
  });

  it("„Рязко отклонение“ is HONEST: the wheel really does go a full lane over, into the escort's lane", () => {
    // The COLLISION is an AUTHORED beat (the scMergeLaneEnd „изтласкване"
    // precedent — the released escort has begun pulling away, so the runner's
    // 3 m contact test no longer reaches it). What the gate therefore proves is
    // the GEOMETRY the beat depicts: the car ends up squarely in the lane the
    // escort occupies, having never looked there.
    const drive = drives.get("mistake-blind-swerve")!;
    expect(Math.min(...drive.trace.samples.map((s) => s.x))).toBeCloseTo(ESCORT_X, 1);
    // No left glance exists anywhere in the drive — the blindness is REAL, not
    // narrated (a rear glance at the spawn is not a look into that lane). The
    // paired assertion below is what gives this one teeth: the SHADOW does
    // carry a glance-left, so the absence here is a property of the demo, not
    // of the recorder's event vocabulary.
    const kinds = (d: RecordedDrive) => d.trace.events.map((e) => e.kind);
    expect(kinds(drive)).not.toContain("glance-left");
    expect(kinds(drives.get("shadow-correct")!)).toContain("glance-left");
    // …and the indicator IS declared — the „politely signalled and still blind"
    // frame the card is built on (and the reason the INDICATOR code stays out).
    expect(kinds(drive)).toContain("signal-on");
    // …and the escort never got clear of the player (it never resolves), so it
    // was still alongside when the wheel arrived — the beat is not fiction.
    expect(drive.outcomes.find((o) => o.eventId === "sc-hzbds-escort")).toBeUndefined();
    // The swerve genuinely MISSES the debris — that is the card's whole point:
    // the reflex „works" against the thing you can see, and finds the thing you
    // cannot. If it ever started clipping the rect, the demo would be billing
    // the wrong COLLISION and the card would be a lie.
    expect(everTouchesDebris(drive)).toBe(false);
  });

  it("„Късно спиране“: exactly COLLISION — and it is the DEBRIS that is struck", () => {
    const drive = drives.get("mistake-late-brake")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_HZ_BRAKE_DONT_SWERVE.mistakes[1].codeRefs].sort());
    // The fault is the TIMING, not the line: same lawful 50, same dead-straight
    // driving line as the shadow — only the foot is late.
    expect(codes).not.toContain("POOR_LANE_KEEPING");
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    for (const s of drive.trace.samples) expect(s.x).toBeCloseTo(LANE_X, 6);
    // The COLLISION is EARNED, not authored: the hero footprint really does
    // overlap the debris rect (the recorder's own SAT test says so).
    expect(everTouchesDebris(drive)).toBe(true);
  });

  it("the two demos are the same drive until the reveal — only the choice differs", () => {
    // Both mistakes and the shadow share one approach; that is what makes the
    // cards comparable („същият подход, друго решение"). Sampled before the
    // reveal at y = 160, all three are on the same line at the same speed.
    const early = (n: ScHzBrakeDontSwerveTraceName) =>
      drives.get(n)!.trace.samples.filter((s) => s.y > 60 && s.y < 150);
    const shadowEarly = early("shadow-correct");
    for (const n of ["mistake-blind-swerve", "mistake-late-brake"] as const) {
      const other = early(n);
      expect(other.length, n).toBe(shadowEarly.length);
      for (let i = 0; i < other.length; i++) {
        expect(other[i].x, n).toBeCloseTo(shadowEarly[i].x, 3);
        expect(other[i].speedKmh, n).toBeCloseTo(shadowEarly[i].speedKmh, 3);
      }
    }
  });
});

describe("sc-hz-brake-dont-swerve — the structural claims of the map", () => {
  it("no drive can bill a crossing code (hz-debris-v1 has crossings: [])", () => {
    // The map choice IS the lesson (templates-hazards2 header): the
    // CrossingZoneTracker builds its zones from district crossings[] alone, so
    // this drill grades braking and lane discipline — never a zebra duty.
    for (const name of NAMES) {
      const codes = violationCodes(drives.get(name)!);
      expect(codes.filter((c) => c.startsWith("PEDESTRIAN_")), name).toEqual([]);
    }
  });

  it("no drive can bill a center-line code (the street is ONE-WAY)", () => {
    // rules/engine.ts guards CROSSED_SOLID_LINE and CENTER_LINE_TOUCHED on
    // `tick.oneway === false`. This is why the drill could not reuse the
    // sibling's two-way hz-obstacle-v1: over there the leftward swerve would
    // arm the center-line arm and the mistake's codeRefs would gain a code the
    // card never claims.
    for (const name of NAMES) {
      const codes = violationCodes(drives.get(name)!);
      expect(codes, name).not.toContain("CENTER_LINE_TOUCHED");
      expect(codes, name).not.toContain("CROSSED_SOLID_LINE");
      expect(codes, name).not.toContain("WRONG_WAY");
    }
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", SCENARIO_ID);
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", SCENARIO_ID);

  for (const name of NAMES) {
    it(`${SCENARIO_ID}/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe(SCENARIO_ID);
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const again = recordScHzBrakeDontSwerveDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_HZ_BRAKE_DONT_SWERVE.shadow, ...SC_HZ_BRAKE_DONT_SWERVE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_HZ_BRAKE_DONT_SWERVE.shadow.path,
      ...SC_HZ_BRAKE_DONT_SWERVE.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
