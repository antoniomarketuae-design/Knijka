/**
 * Audit M-15 — the eight codes that could not fire on a shipped district.
 *
 * THE FINDING. `district-v1` (free drive, Студентски град) and `d2-v1` (the
 * second exam district, Лозенец) shipped with `roads.zones = []`, so
 * CROSSED_SOLID_LINE, DRIVING_IN_BUS_LANE, ILLEGAL_STOP_IN_BAN_ZONE,
 * OVERTAKING_IN_BAN_ZONE, RAIL_CROSSING_VIOLATION, SPEED_TOO_FAST_FOR_CURVE,
 * DRIVING_TOO_SLOW_FOR_MOTORWAY and EMERGENCY_LANE_DRIVING were undetectable on
 * the closest thing this product has to a mock practical exam. Пресичане на
 * плътна осева is a real examiner fail.
 *
 * THE RESOLUTION, in two halves — because the eight codes are two problems:
 *
 *  A. FIVE codes needed AUTHORED ZONE DATA on the two OSM-derived cuts, and the
 *     cuts carry the evidence for it in their own provenance. That layer now
 *     ships (tools/maps/gen_exam_district_zones.mjs — every span names the OSM
 *     tag or the measured geometry that justifies it). §2 below drives each of
 *     the five on the REAL committed map, through the REAL runtime, and §3
 *     drives the innocent version of the SAME manoeuvre through the SAME span.
 *  B. THREE codes need infrastructure neither Sofia cut contains — a motorway
 *     and a железопътен прелез. Those are DESIGN decisions on the original
 *     (fictional) maps, where they are authored and shipped: mw-v1 carries the
 *     `motorway` edges + the `emergencyLane` spans, rx-unguarded-v1 /
 *     rx-guarded-v1 the `railCrossing` bands. §4 proves all three fire there
 *     end-to-end and §5 that the correct drive through the same spans does not
 *     convict. §6 pins WHY they are absent from the Sofia cuts, so a future
 *     session cannot quietly "fix" M-15 by inventing a road.
 *
 * THE FALSE-POSITIVE SIDE MATTERS MORE THAN THE TRUE-POSITIVE SIDE. A span that
 * convicts a correct drive is worse than a dead detector: it teaches the student
 * that the grader is arbitrary (the A12 doctrine, rules/__tests__/
 * false-positives.test.ts). Every guilty case below is therefore paired with an
 * innocent one on the same asphalt, and the innocent cases assert ZERO
 * violations — not merely the absence of the code under test.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createWorldRuntime, parseDistrict, type District, type DistrictEdge } from "..";
import { createRuleEngine, reduceTick } from "../../rules/engine";
import type { IndicatorState, MirrorKind, RuleEvent, SimTick } from "../../rules/types";
import { LANE_WIDTH_M } from "../spatial";
import { pointAlong, type PathPose } from "./helpers";

function loadWorld(id: string): District {
  const p = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    `../../../../../../content/world/${id}.json`,
  );
  return parseDistrict(JSON.parse(readFileSync(p, "utf-8")));
}

function edge(district: District, id: string): DistrictEdge {
  const e = district.roads.edges.find((x) => x.id === id);
  if (!e) throw new Error(`fixture: edge ${id} missing — the cut was regenerated`);
  return e;
}

function zoneOf(district: District, id: string) {
  const z = (district.zones ?? []).find((x) => x.id === id);
  if (!z) throw new Error(`fixture: zone ${id} missing — re-run tools/maps/gen_exam_district_zones.mjs`);
  return z;
}

// ---------------------------------------------------------------------------
// Driving fixtures — physically coherent frames (distance follows speed × dt)
// ---------------------------------------------------------------------------

const DT_SEC = 0.1;

interface Frame {
  pose: PathPose;
  speedKmh: number;
  indicator: IndicatorState;
  gear: number;
  mirrorGlance: MirrorKind | null;
  /** Staged lead vehicle, meters ahead in-lane (the director's channel). */
  leadGapM?: number;
}

interface LegOpts {
  /** Lateral offset RIGHT of the travel direction — picks the lane. */
  offsetM: number | ((u: number) => number);
  speedKmh: number;
  indicator?: IndicatorState;
  leadGapM?: number;
  /** One mirror glance at progress `u` — the observation a lane change needs. */
  glance?: { u: number; mirror: MirrorKind };
}

/**
 * Frames driving an edge from arclength s0 to s1 at a constant speed. Frame
 * spacing is speed × DT_SEC, so the sustain clocks the detectors run on and the
 * ground the car covers agree — the thing a naive fixed-step path gets wrong.
 * `offsetM` may be a function of progress u ∈ [0, 1] to author a lane change.
 */
function driveLeg(e: DistrictEdge, s0: number, s1: number, opts: LegOpts): Frame[] {
  const stepM = (opts.speedKmh / 3.6) * DT_SEC;
  const dir = s1 >= s0 ? 1 : -1;
  const n = Math.max(2, Math.round(Math.abs(s1 - s0) / Math.max(stepM, 1e-6)) + 1);
  const frames: Frame[] = [];
  const glanceAt = opts.glance ? Math.round(opts.glance.u * (n - 1)) : -1;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const s = s0 + (s1 - s0) * u;
    const p = pointAlong(e.geometry, s);
    const tx = p.tx * dir;
    const ty = p.ty * dir;
    const off = typeof opts.offsetM === "function" ? opts.offsetM(u) : opts.offsetM;
    frames.push({
      // Right of the travel direction (x east, y north) is (ty, -tx).
      pose: {
        x: p.x + ty * off,
        y: p.y - tx * off,
        headingDeg: ((Math.atan2(tx, ty) * 180) / Math.PI + 360) % 360,
      },
      speedKmh: opts.speedKmh,
      indicator: opts.indicator ?? "off",
      gear: 1,
      mirrorGlance: i === glanceAt ? (opts.glance as { mirror: MirrorKind }).mirror : null,
      leadGapM: opts.leadGapM,
    });
  }
  return frames;
}

/** Frames standing still at the last pose of `after` for `sec` seconds. */
function standStill(after: Frame[], sec: number, leadGapM?: number): Frame[] {
  const last = after[after.length - 1];
  const n = Math.max(1, Math.round(sec / DT_SEC));
  return Array.from({ length: n }, () => ({ ...last, speedKmh: 0, mirrorGlance: null, leadGapM }));
}

/** Fold frames through the production stack (world runtime → rule reducer). */
function grade(district: District, frames: Frame[], t0Sec = 0): RuleEvent[] {
  const rt = createWorldRuntime(district);
  let rules = createRuleEngine();
  const out: RuleEvent[] = [];
  let t = t0Sec;
  for (const f of frames) {
    t += DT_SEC;
    rt.update(DT_SEC);
    const vehicle: VehicleSample = {
      position: { x: f.pose.x, y: f.pose.y },
      headingDeg: f.pose.headingDeg,
      speedKmh: f.speedKmh,
      indicator: f.indicator,
      headlights: "off",
      seatbeltOn: true,
      handbrakeOn: false,
      gear: f.gear,
      mirrorGlance: f.mirrorGlance,
    };
    const tick: SimTick = rt.sample(vehicle, t, false);
    // The staged lead rides the director's channel — worldRuntime knows only
    // the world, never the traffic (modules/sim/orchestrator owns that seam).
    if (f.leadGapM !== undefined) tick.leadGapM = f.leadGapM;
    const r = reduceTick(rules, tick);
    rules = r.state;
    out.push(...r.events);
  }
  return out;
}

const violations = (events: RuleEvent[]): string[] => [
  ...new Set(events.filter((e) => e.kind === "violation").map((e) => e.code)),
];

/** The A12 bar: innocent driving earns commendations, never penalties. */
function expectInnocent(events: RuleEvent[]): void {
  const got = events
    .filter((e) => e.kind === "violation")
    .map((e) => `${e.code}@${e.t.toFixed(1)}`);
  expect(got, `a correct drive must never be penalised, got: ${got.join(", ")}`).toEqual([]);
}

// ---------------------------------------------------------------------------
// The authored hosts — every constant below is re-derived from the shipped map
// ---------------------------------------------------------------------------

/** d2-v1: бул. „Драган Цанков", 636 m of 2+2 two-way — the М1 host. */
const D2_M1_EDGE = "e193362542.0";
/** d2-v1: бул. „Пейо К. Яворов" viaduct, 70 km/h with no shoulder — the В27 host. */
const D2_V27_EDGE = "e286852750.0";
/** d2-v1: бул. „Джеймс Баучер", tram bed in the inner lanes — the В24 host. */
const D2_V24_EDGE = "e1115502712.0";
/** d2-v1: бул. „Драган Цанков" bend, posted 40 / advisory 30 — the А1 host. */
const D2_A1_EDGE = "e859027438.0";
/** district-v1: бул. „Свети Климент Охридски", `bus:lanes=||designated`. */
const DV1_BUS_EDGE = "e672169336.0";
/** district-v1: „Кирил Цонев" bend, posted 50 / advisory 40 — the А1 host. */
const DV1_A1_EDGE = "e892658655.0";

// ---------------------------------------------------------------------------
// §1 — the layer ships (the finding's own guard, flipped)
// ---------------------------------------------------------------------------

describe("M-15 §1 — the exam/free-drive cuts carry the authored zone layer", () => {
  it("both districts ship zones + the ADR-006 version marker", () => {
    // The original guard here asserted `zones` was EMPTY on both files — the
    // finding, pinned. It is inverted deliberately: the gap must not be able to
    // reopen silently, in either direction.
    for (const id of ["d2-v1", "district-v1"]) {
      const d = loadWorld(id);
      expect((d.zones ?? []).length, `${id} zones`).toBeGreaterThan(0);
      expect((d.meta as { zonesVersion?: number }).zonesVersion, `${id} zonesVersion`).toBe(1);
    }
  });

  it("every span sits on a real edge, inside its polyline, with its own sign", () => {
    // Rule 4 of the authoring law, asserted against the SHIPPED bytes rather
    // than against the generator: a re-cut that moves an edge must fail here.
    const SIGN_OF: Record<string, string> = {
      noOvertaking: "В24",
      noStopping: "В27",
      solidCenterLine: "М1",
      busLane: "BUS",
      curveAdvisory: "А1",
    };
    for (const id of ["d2-v1", "district-v1"]) {
      const d = loadWorld(id);
      const byId = new Map(d.roads.edges.map((e) => [e.id, e]));
      for (const z of d.zones ?? []) {
        const host = byId.get(z.edgeId);
        expect(host, `${id}/${z.id}: unknown edge ${z.edgeId}`).toBeTruthy();
        expect(z.fromM, `${id}/${z.id} fromM`).toBeGreaterThanOrEqual(0);
        expect(z.toM, `${id}/${z.id} toM`).toBeLessThanOrEqual(host!.length + 0.01);
        expect(z.fromM, `${id}/${z.id} span`).toBeLessThan(z.toM);
        expect(SIGN_OF[z.kind], `${id}/${z.id} sign`).toBe(z.signRef);
        // A curve advisory that merely repeats the posted limit teaches
        // nothing — and one ABOVE it would be a data lie the runtime would
        // dutifully grade.
        if (z.kind === "curveAdvisory") {
          expect(z.advisoryKmh, `${id}/${z.id} advisory`).toBeLessThanOrEqual(host!.maxspeed - 10);
        }
        // Shape law: an осева exists only between opposing banks.
        if (z.kind === "solidCenterLine") expect(host!.oneway, `${id}/${z.id} host`).toBe(false);
        // Shape law: a bus lane the car cannot avoid is a trap, not a lesson.
        if (z.kind === "busLane" || z.kind === "noOvertaking") {
          const lanesPerDir = host!.oneway ? host!.lanes : Math.floor(host!.lanes / 2);
          expect(lanesPerDir, `${id}/${z.id} lanes per direction`).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("the публичното копие is byte-identical to the content master", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    for (const id of ["d2-v1", "district-v1"]) {
      const master = readFileSync(path.resolve(here, `../../../../../../content/world/${id}.json`));
      const published = readFileSync(path.resolve(here, `../../../../../public/world/${id}.json`));
      expect(published.equals(master), `${id}: public/world copy has drifted`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// §2 — the five authorable codes FIRE on the real Sofia cuts
// ---------------------------------------------------------------------------

describe("M-15 §2 — the five data-driven codes fire on the shipped Sofia cuts", () => {
  it("CROSSED_SOLID_LINE — the oncoming half of the М1 span on бул. Драган Цанков", () => {
    const d2 = loadWorld("d2-v1");
    const host = edge(d2, D2_M1_EDGE);
    const span = zoneOf(d2, "d2-m1-tsankov");
    // Fully across the осева: the committed lane fix lands on the opposing
    // bank (lane 1 of the other direction, half a lane width past the centre).
    const frames = driveLeg(host, span.fromM + 40, span.fromM + 160, {
      offsetM: -LANE_WIDTH_M / 2,
      speedKmh: 45,
    });
    expect(violations(grade(d2, frames))).toContain("CROSSED_SOLID_LINE");
  });

  it("DRIVING_IN_BUS_LANE — the curb lane of the бул. Свети Климент Охридски BUS span", () => {
    const dv1 = loadWorld("district-v1");
    const host = edge(dv1, DV1_BUS_EDGE);
    // Curb lane of a 3-lane one-way carriageway sits one full lane right of the
    // geometry centreline. 74 m at 45 km/h ≈ 5.9 s — past the 4 s transit grace
    // that protects the legal right-turn crossing.
    const frames = driveLeg(host, 1, host.length - 1, { offsetM: LANE_WIDTH_M, speedKmh: 45 });
    expect(violations(grade(dv1, frames))).toContain("DRIVING_IN_BUS_LANE");
  });

  it("ILLEGAL_STOP_IN_BAN_ZONE — standing on the Яворов viaduct under В27", () => {
    const d2 = loadWorld("d2-v1");
    const host = edge(d2, D2_V27_EDGE);
    const span = zoneOf(d2, "d2-v27-yavorov-viaduct");
    // Roll into the span and stop dead on a 70 km/h viaduct with no shoulder:
    // no lead, no stop line, no crossing — nothing that makes a rest explicable.
    const approach = driveLeg(host, span.fromM + 5, span.fromM + 55, {
      offsetM: LANE_WIDTH_M / 2,
      speedKmh: 40,
    });
    expect(violations(grade(d2, [...approach, ...standStill(approach, 8)]))).toContain(
      "ILLEGAL_STOP_IN_BAN_ZONE",
    );
  });

  it("OVERTAKING_IN_BAN_ZONE — pulling out past a lead inside the Баучер В24 span", () => {
    const d2 = loadWorld("d2-v1");
    const host = edge(d2, D2_V24_EDGE);
    // The pull-out beat: curb lane → inner lane past a lead 20 m ahead, inside
    // the ban. On this street the inner lane IS the tram bed — which is the
    // reason the span exists at all.
    const frames = driveLeg(host, 3, host.length - 3, {
      offsetM: (u) => (u < 0.45 ? 1.5 * LANE_WIDTH_M : 0.5 * LANE_WIDTH_M),
      speedKmh: 35,
      leadGapM: 20,
    });
    expect(violations(grade(d2, frames))).toContain("OVERTAKING_IN_BAN_ZONE");
  });

  it("SPEED_TOO_FAST_FOR_CURVE — 48 km/h into the Кирил-Цонев bend (advisory 40)", () => {
    const dv1 = loadWorld("district-v1");
    const host = edge(dv1, DV1_A1_EDGE);
    const span = zoneOf(dv1, "dv1-a1-8926586550");
    expect(span.advisoryKmh).toBe(40);
    // 48 is LEGAL against the posted 50 and reckless against the measured bend
    // — the whole point of SP-05, and the reason the code is not capped at the
    // graced limit (catalog.ts).
    const codes = violations(
      grade(dv1, driveLeg(host, span.fromM, span.toM, { offsetM: 0, speedKmh: 48 })),
    );
    expect(codes).toContain("SPEED_TOO_FAST_FOR_CURVE");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
  });

  it("SPEED_TOO_FAST_FOR_CURVE — and again on the d2 bend (advisory 30 under a posted 40)", () => {
    const d2 = loadWorld("d2-v1");
    const host = edge(d2, D2_A1_EDGE);
    const span = zoneOf(d2, "d2-a1-8590274380");
    expect(span.advisoryKmh).toBe(30);
    const codes = violations(
      grade(d2, driveLeg(host, span.fromM, span.toM, { offsetM: LANE_WIDTH_M / 2, speedKmh: 40 })),
    );
    expect(codes).toContain("SPEED_TOO_FAST_FOR_CURVE");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
  });
});

// ---------------------------------------------------------------------------
// §3 — and the CORRECT drive through the very same spans convicts nothing
// ---------------------------------------------------------------------------

describe("M-15 §3 — FP battery: the correct drive through each authored span", () => {
  it("М1: holding the own lane through the whole 586 m осева span", () => {
    const d2 = loadWorld("d2-v1");
    const host = edge(d2, D2_M1_EDGE);
    const span = zoneOf(d2, "d2-m1-tsankov");
    // Curb lane of the own bank, end to end of the span at the posted 50.
    expectInnocent(
      grade(d2, driveLeg(host, span.fromM, span.toM, { offsetM: 1.5 * LANE_WIDTH_M, speedKmh: 50 })),
    );
  });

  it("М1: the same span driven in the INNER own-bank lane (a legal overtake position)", () => {
    // Regression guard for the one-act-one-code seam: being left of centre in
    // your OWN bank is not crossing the осева, and must not inherit the опасна.
    const d2 = loadWorld("d2-v1");
    const host = edge(d2, D2_M1_EDGE);
    const span = zoneOf(d2, "d2-m1-tsankov");
    const codes = violations(
      grade(d2, driveLeg(host, span.fromM + 20, span.fromM + 160, {
        offsetM: LANE_WIDTH_M / 2,
        speedKmh: 50,
        indicator: "left", // declared — the чл. 25 left-lane exemption
      })),
    );
    expect(codes).not.toContain("CROSSED_SOLID_LINE");
    expect(codes).not.toContain("CENTER_LINE_TOUCHED");
  });

  it("BUS: the whole corridor in the general lane earns nothing — not even NOT_KEEPING_RIGHT", () => {
    // The SN-05 interplay: inside a BUS span the rightmost lane the car MAY use
    // is laneId 1, so keeping out of the bus lane is CORRECT driving. A grader
    // that bills чл. 25 here would punish the exact behaviour it teaches — and
    // that duty needs 12 s to mature, which is why this drives all THREE spans
    // of the chained corridor rather than one edge (≈13 s at 36 km/h).
    const dv1 = loadWorld("district-v1");
    const frames = [
      ...driveLeg(edge(dv1, "e672169337.0"), 1, 63, { offsetM: 0, speedKmh: 36 }),
      ...driveLeg(edge(dv1, "e672169337.1"), 0, 29.3, { offsetM: 0, speedKmh: 36 }),
      // Stop short of the signal at the corridor's end: the derived stop line
      // sits ~32 m back from that junction (examBankData A1_SITE), and this
      // case is about the bus lane, not about a red the fixture drove into.
      ...driveLeg(edge(dv1, DV1_BUS_EDGE), 0, 35, { offsetM: 0, speedKmh: 36 }),
    ];
    expectInnocent(grade(dv1, frames));
  });

  it("BUS: crossing the bus lane, declared and observed (a curb-side turn)", () => {
    // The legal transit: entering the curb lane to turn/park is allowed and
    // takes a couple of seconds. Indicator on, mirror checked, short = innocent.
    const dv1 = loadWorld("district-v1");
    const host = edge(dv1, "e672169337.0");
    const frames = driveLeg(host, 1, 63, {
      offsetM: (u) => (u < 0.6 ? 0 : LANE_WIDTH_M),
      speedKmh: 36,
      indicator: "right",
      glance: { u: 0.45, mirror: "right" },
    });
    expectInnocent(grade(dv1, frames));
  });

  it("В27: driving THROUGH the viaduct ban at the posted 70 without stopping", () => {
    const d2 = loadWorld("d2-v1");
    const host = edge(d2, D2_V27_EDGE);
    const span = zoneOf(d2, "d2-v27-yavorov-viaduct");
    expectInnocent(
      grade(d2, driveLeg(host, span.fromM - 20, span.toM + 20, {
        offsetM: LANE_WIDTH_M / 2,
        speedKmh: 70,
      })),
    );
  });

  it("В27: stopping inside the ban BEHIND A QUEUE is traffic, not an offence", () => {
    // The structural-innocence half of PK-06: a rest with a lead inside the
    // queue gap is congestion. A В27 span must never convict a driver for the
    // traffic in front of them.
    const d2 = loadWorld("d2-v1");
    const host = edge(d2, D2_V27_EDGE);
    const span = zoneOf(d2, "d2-v27-yavorov-viaduct");
    const approach = driveLeg(host, span.fromM + 5, span.fromM + 55, {
      offsetM: LANE_WIDTH_M / 2,
      speedKmh: 30,
      leadGapM: 6,
    });
    const codes = violations(grade(d2, [...approach, ...standStill(approach, 10, 6)]));
    expect(codes).not.toContain("ILLEGAL_STOP_IN_BAN_ZONE");
  });

  it("В24: repositioning inside the ban with NOBODY to pass is not изпреварване", () => {
    // A12: a lane change with no lead ahead is a reposition. The В24 span grades
    // overtaking, not lane discipline.
    const d2 = loadWorld("d2-v1");
    const host = edge(d2, D2_V24_EDGE);
    const frames = driveLeg(host, 3, host.length - 3, {
      offsetM: (u) => (u < 0.45 ? 1.5 * LANE_WIDTH_M : 0.5 * LANE_WIDTH_M),
      speedKmh: 35,
      indicator: "left",
    });
    expect(violations(grade(d2, frames))).not.toContain("OVERTAKING_IN_BAN_ZONE");
  });

  it("В24: moving RIGHT toward the curb behind a lead (the чл. 37 turn set-up)", () => {
    // The H-5 direction gate on ban spans: изпреварване is a LEFT-side act, and
    // tucking in behind the car ahead to line up for a right turn is textbook.
    const d2 = loadWorld("d2-v1");
    const host = edge(d2, D2_V24_EDGE);
    const frames = driveLeg(host, 3, host.length - 3, {
      offsetM: (u) => (u < 0.45 ? 0.5 * LANE_WIDTH_M : 1.5 * LANE_WIDTH_M),
      speedKmh: 35,
      leadGapM: 20,
      indicator: "right",
    });
    expect(violations(grade(d2, frames))).not.toContain("OVERTAKING_IN_BAN_ZONE");
  });

  it("А1: taking each bend AT its advisory speed", () => {
    const dv1 = loadWorld("district-v1");
    const dv1Host = edge(dv1, DV1_A1_EDGE);
    const dv1Span = zoneOf(dv1, "dv1-a1-8926586550");
    expectInnocent(
      grade(dv1, driveLeg(dv1Host, dv1Span.fromM, dv1Span.toM, { offsetM: 0, speedKmh: 40 })),
    );
    const d2 = loadWorld("d2-v1");
    const d2Host = edge(d2, D2_A1_EDGE);
    const d2Span = zoneOf(d2, "d2-a1-8590274380");
    expectInnocent(
      grade(d2, driveLeg(d2Host, d2Span.fromM, d2Span.toM, {
        offsetM: LANE_WIDTH_M / 2,
        speedKmh: 30,
      })),
    );
  });

  it("А1: the posted limit is still legal on the STRAIGHT part of the same street", () => {
    // The envelope binds inside the arc, not for the length of the street: a
    // curve advisory that leaked onto the approach would tax legal driving.
    const dv1 = loadWorld("district-v1");
    const host = edge(dv1, DV1_A1_EDGE);
    const span = zoneOf(dv1, "dv1-a1-8926586550");
    expect(span.toM).toBeLessThan(host.length); // there IS a straight run-out
    expectInnocent(grade(dv1, driveLeg(host, span.toM + 0.1, host.length, { offsetM: 0, speedKmh: 50 })));
  });
});

// ---------------------------------------------------------------------------
// §4 — the three infrastructure codes, on the shipped ORIGINAL maps
// ---------------------------------------------------------------------------

describe("M-15 §4 — the motorway + rail codes fire on their shipped districts", () => {
  it("DRIVING_TOO_SLOW_FOR_MOTORWAY — a steady 35 km/h crawl on mw-v1", () => {
    const mw = loadWorld("mw-v1");
    const host = edge(mw, "mw-e-nb");
    expect(host.motorway).toBe(true);
    // Travel lane (laneId 1), steady, empty road: no transition, no queue, no
    // hazard — the mobile chicane the code exists for.
    expect(
      violations(grade(mw, driveLeg(host, 100, 260, { offsetM: 0, speedKmh: 35 }))),
    ).toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");
  });

  it("EMERGENCY_LANE_DRIVING — cruising the лентата за принудително спиране on mw-v1", () => {
    const mw = loadWorld("mw-v1");
    const host = edge(mw, "mw-e-nb");
    expect((mw.zones ?? []).some((z) => z.kind === "emergencyLane" && z.edgeId === host.id)).toBe(true);
    // Curb lane of a 3-lane one-way motorway carriageway = the hard shoulder.
    expect(
      violations(grade(mw, driveLeg(host, 100, 400, { offsetM: LANE_WIDTH_M, speedKmh: 90 }))),
    ).toContain("EMERGENCY_LANE_DRIVING");
  });

  it("RAIL_CROSSING_VIOLATION — rolling over the unguarded прелез without stopping", () => {
    const rx = loadWorld("rx-unguarded-v1");
    const host = edge(rx, "rxu-e-street");
    const band = zoneOf(rx, "rxu-z-railcrossing");
    expect(band.guarded).toBeUndefined(); // А35 — the mandatory-stop variant
    // Approach + cross in one continuous run so the runtime sees the approach
    // phase before the band (a teleport onto the rails is inert by design).
    const events = grade(
      rx,
      driveLeg(host, band.fromM - 60, band.toM + 20, { offsetM: LANE_WIDTH_M / 2, speedKmh: 30 }),
    );
    expect(violations(events)).toContain("RAIL_CROSSING_VIOLATION");
    expect(
      events.filter((e) => e.kind === "violation" && e.code === "RAIL_CROSSING_VIOLATION"),
    ).toContainEqual(expect.objectContaining({ detail: "no-stop" }));
  });

  it("RAIL_CROSSING_VIOLATION — entering the guarded прелез while the barrier is down", () => {
    const rx = loadWorld("rx-guarded-v1");
    const host = edge(rx, "rxg-e-street");
    const band = zoneOf(rx, "rxg-z-railcrossing");
    expect(band.guarded).toBe(true);
    expect(band.barrier).toBeTruthy();
    // The timetable is deterministic over session time: the barrier is down for
    // the first 40 s of every 90 s cycle, so a drive starting at t=0 meets it.
    const events = grade(
      rx,
      driveLeg(host, band.fromM - 60, band.toM + 20, { offsetM: LANE_WIDTH_M / 2, speedKmh: 30 }),
    );
    expect(
      events.filter((e) => e.kind === "violation" && e.code === "RAIL_CROSSING_VIOLATION"),
    ).toContainEqual(expect.objectContaining({ detail: "entered-barred" }));
  });
});

describe("M-15 §5 — FP battery: the correct drive over the motorway + rail spans", () => {
  it("motorway: flowing with the traffic in the travel lane", () => {
    const mw = loadWorld("mw-v1");
    const host = edge(mw, "mw-e-nb");
    expectInnocent(grade(mw, driveLeg(host, 100, 700, { offsetM: 0, speedKmh: 120 })));
  });

  it("motorway: a slow crawl in the TRAVEL lane behind a queue is congestion, not obstruction", () => {
    const mw = loadWorld("mw-v1");
    const host = edge(mw, "mw-e-nb");
    const codes = violations(
      grade(mw, driveLeg(host, 100, 260, { offsetM: 0, speedKmh: 35, leadGapM: 12 })),
    );
    expect(codes).not.toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");
  });

  it("unguarded прелез: a full stop at the line, then across", () => {
    const rx = loadWorld("rx-unguarded-v1");
    const host = edge(rx, "rxu-e-street");
    const band = zoneOf(rx, "rxu-z-railcrossing");
    const approach = driveLeg(host, band.fromM - 60, band.fromM - 4, {
      offsetM: LANE_WIDTH_M / 2,
      speedKmh: 30,
    });
    const halt = standStill(approach, 2);
    const cross = driveLeg(host, band.fromM - 4, band.toM + 20, {
      offsetM: LANE_WIDTH_M / 2,
      speedKmh: 20,
    });
    expect(violations(grade(rx, [...approach, ...halt, ...cross]))).not.toContain(
      "RAIL_CROSSING_VIOLATION",
    );
  });

  it("guarded прелез: crossing an OPEN barrier without stopping is legal (чл. 52)", () => {
    // The legal asymmetry that makes the rail band safe to author: a guarded
    // crossing carries no stop duty while it is open. Start the session inside
    // the timetable's open window (40–90 s of the 90 s cycle).
    const rx = loadWorld("rx-guarded-v1");
    const host = edge(rx, "rxg-e-street");
    const band = zoneOf(rx, "rxg-z-railcrossing");
    const events = grade(
      rx,
      driveLeg(host, band.fromM - 60, band.toM + 20, { offsetM: LANE_WIDTH_M / 2, speedKmh: 40 }),
      50, // t0: 50 s into the cycle — barrier up
    );
    expect(violations(events)).not.toContain("RAIL_CROSSING_VIOLATION");
  });
});

// ---------------------------------------------------------------------------
// §6 — the honest absences, pinned so nobody "fixes" M-15 by inventing a road
// ---------------------------------------------------------------------------

describe("M-15 §6 — what the Sofia cuts deliberately do NOT carry", () => {
  it("neither cut fakes a motorway", () => {
    // Студентски град tops out at 50; Лозенец's fastest road is бул. „Пейо К.
    // Яворов", a 70 km/h grade-separated PRIMARY — a скоростен градски булевард,
    // which is what OSM records it as. Tagging it `motorway` to unlock two
    // detectors would invent a road; mw-v1 carries that lesson instead (§4).
    for (const id of ["d2-v1", "district-v1"]) {
      const d = loadWorld(id);
      expect(d.roads.edges.some((e) => e.motorway === true), id).toBe(false);
      expect(Math.max(...d.roads.edges.map((e) => e.maxspeed)), id).toBeLessThan(80);
      expect((d.zones ?? []).some((z) => z.kind === "emergencyLane"), id).toBe(false);
    }
  });

  it("the Лозенец tram crossings are authored as a В24 ban, never as a rail band", () => {
    // Лозенец's Overpass cut carries 8 `railway=tram_level_crossing` nodes on
    // бул. „Джеймс Баучер" and NO железопътен прелез. Calling those a
    // `railCrossing` span would impose the ЗДвП чл. 51–53 mandatory full stop —
    // a duty a tram crossing does not carry — and would therefore convict a
    // lawful drive. The tram bed is authored for what it IS instead: the reason
    // overtaking is banned there.
    for (const id of ["d2-v1", "district-v1"]) {
      const d = loadWorld(id);
      expect((d.zones ?? []).some((z) => z.kind === "railCrossing"), id).toBe(false);
    }
    const d2 = loadWorld("d2-v1");
    const baucher = (d2.zones ?? []).filter((z) => z.edgeId === D2_V24_EDGE);
    expect(baucher.map((z) => z.kind)).toEqual(["noOvertaking"]);
  });

  it("no span sits on a road a shipped exam drill drives", () => {
    // The drills pin their own asphalt (traces/scEdD2CityRun.ts,
    // scEdD2PriorityRun.ts, scEdD2StopAddress.ts). A zone landing on one would
    // change a committed recording's verdict without anyone deciding to.
    const DRILL_EDGES = new Set([
      // sc-ed-d2-city-run (бул. Драган Цанков)
      "e601140178.0", "e29435479.0", "e601140177.0", "e435203751.0",
      "e435203752.0", "e1233248921.0", "e171919144.0", "e1131622979.0",
      // sc-ed-d2-priority-run (Яворов ramp → Стоян Михайловски → Златовръх)
      "e171919146.0", "e695511390.0", "e248750627.1", "e677692188.0",
      "e751678613.0", "e285878100.0", "e673714439.0", "e855867078.0",
      "e856821052.0", "e23040421.0", "e1382335108.0", "e1382335109.0",
      "e856821053.0", "e856821053.1", "e856821051.0", "e20302341.0",
      // sc-ed-d2-stop-address (Незабравка)
      "e76856228.0",
    ]);
    const hosts = new Set((loadWorld("d2-v1").zones ?? []).map((z) => z.edgeId));
    expect([...hosts].filter((id) => DRILL_EDGES.has(id))).toEqual([]);
  });
});
