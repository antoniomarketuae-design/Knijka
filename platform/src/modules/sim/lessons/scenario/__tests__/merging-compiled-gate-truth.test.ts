/**
 * SWEEP 161 · the MERGING family — THE GATE THE STUDENT PLAYS IS THE COMPILED
 * ONE, AND THAT IS THE ONE NOTHING WAS CHECKING.
 *
 * Two route tasks in templates-merging.ts certify a legal duty by geometry:
 *
 *   sc-mgb-ease      «Намали, за да пропуснеш потеглящия автобус» (ЗДвП чл. 67)
 *   sc-mfp-walk-yield «Спри пред тротоара и пропусни пешеходеца»  (ЗДвП чл. 25)
 *
 * Both were proved against their AUTHORED params. Neither authored number is
 * what a student meets: `compileScenario` runs every reachZone through the
 * difficulty ladder (scenario/params.ts), which WIDENS the radius and the speed
 * cap on the aided rungs — and L1 «Пълна помощ» is the rung a 17-year-old
 * starts on and the rung both audit drives were photographed on.
 *
 * THE TWO ROWS THIS CLOSES, both filed off frames:
 *
 *   sc-merge-bus-pullout — .audit-frames/sweep161/sc-merge-bus-pullout/pc-right
 *     («there is no bus»; the ease gate ticked at 1:56 anyway). At the shipped
 *     y 168 / radius 5 the COMPILED L1 disc opened at y 160.5 with a cap of
 *     35 км/ч printed on the gate bar in the world, while the rig only finishes
 *     crossing into the player's lane at y 166.0 at that pace: the чл. 67
 *     certificate was issuable 5.5 m before the bus had come out. Doc 87 B58's
 *     class exactly — the world instructs the pace that makes its own gate lie.
 *
 *   sc-merge-from-property — .audit-frames/sweep161/sc-merge-from-property/
 *     mobile-right/run.log: «✓ Спри пред тротоара и пропусни пешеходеца 0:16»
 *     on the same sheet as «✗ Непропускане на пешеходец −10 изпитни т. ОПАСНА
 *     ГРЕШКА» and «! пешеходец — на 0.0 м 0:06». The тротоар is painted 6 m
 *     deep (ZEBRA_LENGTH_M) around `mgp-x-walk` at x = 34, so the band is
 *     x ∈ [31, 37]; the compiled L1 disc reached x = 33.25. «Спри ПРЕД
 *     тротоара» was earnable from three and three-quarter metres ON it.
 *
 * THE STACK IS REAL: `compileScenario` for the gates, the committed
 * content/world district through `createTrafficSystem` + the production
 * `CutInLeadCarRunner` for the bus, and `createLessonSession` + `applyTick` —
 * the student-facing engine — for the acceptance. Only the player pose stream
 * is synthetic, because "a student who crept onto the pavement and stopped
 * there" is not a thing any committed recording contains.
 *
 * THE MUTATION LEDGER — every one RUN against templates-merging.ts on
 * 2026-08-23, and the file restored byte-identically afterwards (29 green
 * before and after):
 *
 *   sc-mgb-ease y 178 → 168 (the value that shipped) ......... 5 red
 *   sc-mgb-ease radiusM 4 → 5 (the value that shipped) ....... 1 red
 *   both together — the gate exactly as it shipped ........... 6 red
 *   sc-mgb-ease maxSpeedKmh 30 → 40 .......................... 5 red
 *   sc-mfp-walk-yield acceptBeforeMarkM deleted .............. 11 red
 *   sc-mfp-walk-yield acceptBeforeMarkM −0.5 → −3 ............ 11 red
 *   sc-mfp-walk-yield acceptBeforeMarkM −0.5 → +1.5 .......... 6 red
 *   sc-mfp-walk-yield acceptBeforeMarkM −0.5 → 0 ............. 1 red
 *
 * That last row is the honest one and is left in rather than tidied away: 0
 * cuts the acceptance at the MARK instead of at the paint, which is 0.5 m
 * TIGHTER, so it breaks nothing a student does — only the assertion that the
 * boundary is derived from the pavement rather than picked. If that number is
 * ever to move it should move because the тротоар moved.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CutInLeadCarSpec, LessonObjective } from "../../../contracts";
import type { SimTickEvent } from "../../../rules";
import { CutInLeadCarRunner } from "../../../orchestrator/runners";
import type { DirectorInput } from "../../../orchestrator/types";
import { createTrafficSystem } from "../../../traffic/system";
import { VEHICLE_PROFILE_LENGTH_M, type TrafficDistrict } from "../../../traffic/types";
import { ZEBRA_LENGTH_M } from "../../../world/builders/constants";
import { createEvalState, parseObjectiveParams, stepObjective } from "../../objectives";
import type { ObjectiveEvalState } from "../../types";
import { makeTick } from "../../__tests__/fixtures";
import { compileScenario } from "../compile";
import { SC_MERGE_BUS_PULLOUT, SC_MERGE_FROM_PROPERTY } from "../templates-merging";
import type { ScenarioLevel } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const DT = 1 / 30;

/** Every rung the two templates ship — the ladder is the whole subject here. */
const RUNGS: readonly ScenarioLevel[] = [1, 2, 3, 4, 5];

function district(id: string): TrafficDistrict {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as TrafficDistrict;
}

/**
 * The gate AS THE STUDENT MEETS IT — after the difficulty ladder, not before.
 * Reading the authored `spec.success[i].params` here instead is precisely the
 * mistake this file exists to stop repeating.
 */
function compiledZone(
  spec: typeof SC_MERGE_BUS_PULLOUT,
  level: ScenarioLevel,
  id: string,
): { x: number; y: number; radiusM: number; maxSpeedKmh: number; obj: LessonObjective } {
  const o = compileScenario(spec, level).objectives.find((x) => x.id === id);
  if (!o || o.kind !== "reachZone") throw new Error(`${id} is not a compiled reachZone at L${level}`);
  const p = o.params as { x: number; y: number; radiusM: number; maxSpeedKmh: number };
  return { x: p.x, y: p.y, radiusM: p.radiusM, maxSpeedKmh: p.maxSpeedKmh, obj: o };
}

// ---------------------------------------------------------------------------
// 1. sc-merge-bus-pullout — «намали» may not be certified before the bus moves,
//    at the pace the COMPILED gate itself permits
// ---------------------------------------------------------------------------

/** mg-busstop-v1 meta.scenario — re-pinned by hand (battery convention). */
const MGB_DISTRICT = "mg-busstop-v1";
const MGB_X_GENERAL = 4.0625; // the player's lane for his whole drive
const MGB_X_BUS = 12.1875; // the бус лента's centre
const MGB_SPAWN_Y = 15; // mgb-spawn-start
const MGB_LANE_PITCH_M = 8.125;

const MGB_BUS = (SC_MERGE_BUS_PULLOUT.staged ?? []).find(
  (s): s is CutInLeadCarSpec => s.kind === "cutInLeadCar",
)!;

/**
 * Player y at which the rig has published a WHOLE lane of lateral travel —
 * "the bus is now in your lane", the only fact the tick may certify. Null if it
 * never got there. Constant-speed approach up the general lane: that is what
 * "a student who held the pace the gate's own bar tells him to hold" means.
 */
function busInLaneAtPlayerY(kmh: number): number | null {
  const tr = createTrafficSystem(district(MGB_DISTRICT), {
    seed: 7,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  const runner = new CutInLeadCarRunner(MGB_BUS);
  runner.stage(tr, () => 0.5, true); // fixed jitter draw — bit-identical replays
  let py = MGB_SPAWN_Y;
  let t = 0;
  const out: SimTickEvent[] = [];
  for (let i = 0; i < 200 * 30; i++) {
    t += DT;
    py += (kmh / 3.6) * DT;
    tr.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: MGB_X_GENERAL, y: py },
      playerSpeedKmh: kmh,
      playerHeadingDeg: 0,
    });
    const input: DirectorInput = {
      tSec: t,
      dtSec: DT,
      x: MGB_X_GENERAL,
      y: py,
      speedKmh: kmh,
      headingDeg: 0,
      brakePedal: 0,
      tickEvents: [],
    };
    runner.step(tr, input, out);
    const a = tr.staged(MGB_BUS.id);
    if (a && Math.abs(a.lateralOffsetM ?? 0) >= MGB_LANE_PITCH_M - 0.15) return py;
    if (py > 395) break;
  }
  return null;
}

describe("sc-merge-bus-pullout — the COMPILED «намали» gate opens after the pull-out, on every rung", () => {
  /**
   * The margin is derived, not chosen: one PLAYER CAR LENGTH past the metre at
   * which the rig finished crossing (`VEHICLE_PROFILE_LENGTH_M.car`, the same
   * 4.1 m every lead-gap query in the module is measured with). Anything less
   * and the certificate lands with the student level with a bus that has only
   * just stopped moving sideways.
   *
   * WHY THE CAP IS READ OFF THE COMPILED GATE and not off the template: the
   * ladder widens it (30 → 35 at L1) AND PRINTS THE WIDENED NUMBER IN THE WORLD
   * on the gate bar (RouteGuidance). The fastest pace the gate rewards is
   * therefore the fastest pace the student is INSTRUCTED to hold, and it is the
   * row with the worst margin — reading the authored 30 here would test a pace
   * the aided rung never asks for.
   */
  const MARGIN_M = VEHICLE_PROFILE_LENGTH_M.car;

  it("census guard — the template still stages the bus and its lane-crossing glide", () => {
    // Without this the whole suite could pass vacuously off a deleted actor.
    expect(MGB_BUS.id).toBe("sc-mgb-bus");
    expect(MGB_BUS.cutShiftM).toBe(-MGB_LANE_PITCH_M);
    expect(SC_MERGE_BUS_PULLOUT.success[0].id).toBe("sc-mgb-ease");
  });

  for (const level of RUNGS) {
    it(`L${level}: at the gate's OWN printed cap the bus is already a car-length into the lane`, () => {
      const gate = compiledZone(SC_MERGE_BUS_PULLOUT, level, "sc-mgb-ease");
      const opensAtY = gate.y - gate.radiusM;
      const inLaneY = busInLaneAtPlayerY(gate.maxSpeedKmh);
      expect(
        inLaneY,
        `L${level}: the bus never crossed into the player's lane at the gate's own ` +
          `${gate.maxSpeedKmh} км/ч cap`,
      ).not.toBeNull();
      expect(
        opensAtY,
        `L${level}: «${SC_MERGE_BUS_PULLOUT.success[0].titleBg}» — the compiled disc ` +
          `(y ${gate.y} ± ${gate.radiusM}) opens at y ${opensAtY.toFixed(1)}, but a student ` +
          `holding the ${gate.maxSpeedKmh} км/ч this rung prints on the gate bar only has the ` +
          `bus fully in his lane at y ${inLaneY!.toFixed(1)}. The чл. 67 tick would certify a ` +
          `pull-out that has not happened.`,
      ).toBeGreaterThanOrEqual(inLaneY! + MARGIN_M);
    });
  }

  /**
   * THE FAR SIDE OF THE SAME DISC, and the reason the radius is 4 and not 5.
   * `mistake-force-past` ends its run STANDING at y = 185.98 after the contact,
   * and a stopped car satisfies any speed cap — so a disc that reaches that
   * pose hands the чл. 67 certificate to the one demo whose entire point is
   * that it reaches no gate at all. Written out by hand rather than read off
   * the trace: reading the trace would let a re-record move the goalpost with
   * the defect (the `merging-sweep161-bus-pullout` GLIDE_ARC_TOL_M precedent).
   */
  const FORCE_PAST_RESTING_Y = 185.98;

  for (const level of RUNGS) {
    it(`L${level}: the disc ends before the pose the forcing-past demo dies in`, () => {
      const gate = compiledZone(SC_MERGE_BUS_PULLOUT, level, "sc-mgb-ease");
      expect(
        gate.y + gate.radiusM,
        `L${level}: the compiled disc reaches y ${(gate.y + gate.radiusM).toFixed(1)} and the ` +
          `forcing-past demo comes to rest at y ${FORCE_PAST_RESTING_Y} — a stationary crashed ` +
          `car is under every cap, so it would collect «${SC_MERGE_BUS_PULLOUT.success[0].titleBg}»`,
      ).toBeLessThan(FORCE_PAST_RESTING_Y);
    });
  }

  it("the AUTHORED disc cannot be satisfied from inside the бус лента", () => {
    // The claim the old comment made and the old number did not deliver: the
    // бус лента's near edge is half a pitch off its centre, so a disc centred
    // on the general lane may not reach it. 5 reached 0.94 m in.
    const authored = SC_MERGE_BUS_PULLOUT.success[0].params;
    if (authored.kind !== "reachZone") throw new Error("sc-mgb-ease is not a reachZone");
    const banNearEdgeX = MGB_X_BUS - MGB_LANE_PITCH_M / 2;
    expect(
      MGB_X_GENERAL + authored.radiusM,
      `radius ${authored.radiusM} reaches x ${(MGB_X_GENERAL + authored.radiusM).toFixed(2)}; ` +
        `the бус лента starts at x ${banNearEdgeX}`,
    ).toBeLessThanOrEqual(banNearEdgeX);
  });
});

// ---------------------------------------------------------------------------
// 2. sc-merge-from-property — «спри ПРЕД тротоара» may not be earned from ON it
// ---------------------------------------------------------------------------

const MFP_Y_EXIT = 4.06;
/** `mgp-x-walk` — the тротоар band's centre on the exit edge. */
const MFP_X_WALK = 34;
/** world/builders/constants.ts ZEBRA_LENGTH_M — the band's depth along the
 *  road axis, written out by hand so a change over there reddens THIS.
 *
 *  VERIFIER, 2026-08-24: hand-pinning ALONE did not deliver that. Driven —
 *  `ZEBRA_LENGTH_M 6.0 → 9.0` in world/builders/constants.ts left this file
 *  29/29 GREEN while the тротоар moved to x ∈ [29.5, 38.5] and the boundary
 *  this suite certifies as «the paint» (x 37.0) landed 1.5 m ON it. The
 *  cross-check below is what makes the sentence true; without it the derived
 *  boundary was tied to a copy of a number and to nothing else. */
const MFP_BAND_DEPTH_M = 6.0;
/** …so the edge the student is told to stop in front of. */
const MFP_BAND_NEAR_X = MFP_X_WALK + MFP_BAND_DEPTH_M / 2;

/**
 * The forecourt roll-off the shadow performs, in numbers: cruise WEST at
 * `MFP_APPROACH_KMH`, brake over the last `MFP_BRAKE_M`, come to REST at
 * `haltX`, stand there two seconds. Returns whether `sc-mfp-walk-yield` came
 * out done at the requested rung.
 *
 * WHY THE APPROACH IS NOT A CRAWL, and it matters: a car that holds 4 км/ч the
 * whole way satisfies the 5 км/ч cap continuously and earns this gate wherever
 * it happens to be, so a crawl probe answers "was the car ever slow here",
 * which is not the question. `shadow-correct.trace.json` runs 17.82 км/ч to
 * x = 40.51 and brakes to rest over the next 3 m; these two constants are that
 * profile, so what the probe varies is the ONE thing under test — where the car
 * stopped.
 *
 * `parseObjectiveParams` + `stepObjective` is the same chain
 * `createLessonSession`/`applyTick` runs this gate through — taken directly so
 * the pose stream can be authored metre by metre, which no committed recording
 * can be.
 *
 * The pedestrian is deliberately absent from this stream: the question is not
 * "does the rule engine convict" (it does — that is the mobile sheet's
 * «Непропускане на пешеходец») but "does the ROUTE TASK certify a stop in front
 * of a pavement the car is standing on". The two channels disagreeing is the
 * defect; this pins the half that lives in this file.
 */
const MFP_APPROACH_KMH = 18;
const MFP_BRAKE_M = 3;

function walkGateDone(level: ScenarioLevel, haltX: number): boolean {
  const objective = compileScenario(SC_MERGE_FROM_PROPERTY, level).objectives.find(
    (o) => o.id === "sc-mfp-walk-yield",
  )!;
  const params = parseObjectiveParams(objective);
  let state: ObjectiveEvalState = createEvalState(params);
  let t = 0;
  let done = false;
  const feed = (px: number, speedKmh: number): void => {
    const r = stepObjective(
      params,
      state,
      makeTick({ t, position: { x: px, y: MFP_Y_EXIT }, headingDeg: 270, speedKmh, gear: 1 }),
    );
    state = r.evalState;
    done = done || r.done;
  };
  const speedAt = (px: number): number =>
    px >= haltX + MFP_BRAKE_M
      ? MFP_APPROACH_KMH
      : MFP_APPROACH_KMH * Math.max(0, (px - haltX) / MFP_BRAKE_M);
  let x = 48; // clear of the gate's grace capsule, on the forecourt
  feed(x, speedAt(x)); // frame 0 — establishes the approach axis
  while (x > haltX) {
    t += DT;
    x = Math.max(haltX, x - Math.max(speedAt(x) / 3.6, 0.2) * DT);
    feed(x, speedAt(x));
  }
  for (let i = 0; i < 60; i++) {
    t += DT;
    feed(haltX, 0);
  }
  return done;
}

describe("sc-merge-from-property — «Спри пред тротоара» ends at the paint, on every rung", () => {
  it("census guard — the gate is still the first task and still a capped reachZone", () => {
    const o = SC_MERGE_FROM_PROPERTY.success[0];
    expect(o.id).toBe("sc-mfp-walk-yield");
    expect(o.titleBg).toBe("Спри пред тротоара и пропусни пешеходеца");
    if (o.params.kind !== "reachZone") throw new Error("not a reachZone");
    expect(o.params.maxSpeedKmh).toBe(5);
  });

  for (const level of RUNGS) {
    it(`L${level}: a car that crept ONTO the pavement and stopped there is refused`, () => {
      // 1.5 m past the band's near edge — the pose the mobile sheet's ✓ and its
      // «Непропускане на пешеходец» describe from opposite sides.
      const onTheBand = MFP_BAND_NEAR_X - 1.5;
      expect(
        walkGateDone(level, onTheBand),
        `L${level}: «Спри пред тротоара» ticked for a car standing at x ${onTheBand} — ` +
          `the тротоар runs x ${MFP_BAND_NEAR_X - MFP_BAND_DEPTH_M}…${MFP_BAND_NEAR_X}`,
      ).toBe(false);
    });

    it(`L${level}: …and the deepest pose the bare disc used to admit is refused too`, () => {
      // x 34.6 is 2.4 m into the band, all but on the crossing's own centre —
      // and it is INSIDE the authored radius-3 circle (|37.5 − 34.6| = 2.9), so
      // before the paint boundary existed this pose earned the tick outright at
      // every rung. It is the pose «Непропускане на пешеходец» is billed from.
      expect(
        walkGateDone(level, 34.6),
        `L${level}: the gate was earned by a car standing on the crossing itself`,
      ).toBe(false);
    });

    it(`L${level}: the taught halt — the shadow's own resting pose — is still credited`, () => {
      // content/traces/sc-merge-from-property/shadow-correct.trace.json comes to
      // rest at x = 37.54. Refusing THAT would be refusing the drive the lesson
      // tells the student to copy, which is the worse failure of the two — and
      // it is what makes the two assertions above a boundary rather than a ban.
      expect(
        walkGateDone(level, 37.54),
        `L${level}: the acceptance no longer contains the taught halt at x 37.54`,
      ).toBe(true);
    });
  }

  it("the hand-pinned band depth is still the depth the world paints", () => {
    // The other end of the derivation. `markings.ts` lays the band ±
    // ZEBRA_LENGTH_M / 2 about the crossing node, so this constant IS the
    // pavement's depth; if the world repaints it, the boundary asserted below
    // stops being «the paint» and this suite has to be re-derived rather than
    // quietly kept green.
    expect(MFP_BAND_DEPTH_M).toBeCloseTo(ZEBRA_LENGTH_M, 6);
  });

  it("the acceptance boundary IS the pavement's near edge, not a taste number", () => {
    const o = SC_MERGE_FROM_PROPERTY.success[0].params;
    if (o.kind !== "reachZone") throw new Error("not a reachZone");
    expect(o.acceptBeforeMarkM, "sc-mfp-walk-yield has no paint boundary at all").toBeDefined();
    // Signed the shipped way round: negative = the paint lies ahead of the mark.
    expect(o.x + o.acceptBeforeMarkM!).toBeCloseTo(MFP_BAND_NEAR_X, 6);
  });
});
