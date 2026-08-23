/**
 * sweep161 `sc-hz-brake-dont-swerve:8a5ed5b4` and `sc-hz-emergency-stop:6bb10521`
 * — „THE ACTOR THE LESSON IS BUILT ON IS NEVER IN THE WORLD".
 *
 * BOTH findings say the same sentence about two different drills, and both name
 * this renderer as the suspect. Neither is a rendering bug — and the reason
 * that matters is that ONE of them is nevertheless true, and the true one
 * cannot be seen by looking at TrafficLayer at all. It is arithmetic between
 * two numbers that live in two other files, and nothing in this repo measured
 * it until this file did.
 *
 * WHAT THE AUDITOR WROTE, verbatim:
 *
 *   A. „The car in the adjacent lane — the sole reason the lesson says brake
 *      instead of swerve — is never in the world. At 05-stopped the coach says
 *      «Виж я колата отляво — мина си по своята лента, без изобщо да разбере.
 *      Ако бяхме свили, щяхме да сме В нея» while the left lane is visibly,
 *      completely empty, and the same is true at t094 where the coach describes
 *      it as level with the driver's door."
 *      (.audit-frames/sweep161/sc-hz-brake-dont-swerve/pc-right/05-stopped.png)
 *
 *   B. „THE LESSON'S OWN EVENT NEVER HAPPENS … the road is completely empty.
 *      No ball, no child, nothing to brake for."
 *      (.audit-frames/sweep161/sc-hz-emergency-stop/mobile-right/05-stopped.png)
 *
 * MEASURED, on the shipped specs, the shipped districts, the shipped runners
 * and the shipped cockpit lens:
 *
 *   A is TRUE, and it is not the instrument. The escort is staged, updated and
 *   rendered exactly as authored — and it sits **66.1° off the driver's axis
 *   against a 37.70° half-windscreen**, i.e. 28.4° outside the glass, for the
 *   ENTIRE approach, at 14 km/h, at 22 km/h and at the authored 50 km/h alike.
 *   The auditor's own words already contain the mechanism: „level with the
 *   driver's door". A car level with the door is behind the A-pillar. It first
 *   crosses onto the glass 1.3 s AFTER the emergency brake has been pressed —
 *   after the choice it exists to inform.
 *
 *   B is FALSE about the child and TRUE about the ball. The child is standing
 *   at her authored kerb pose (9.5, 150) from the first frame of the session,
 *   0.9° off the driver's axis at her closest and on the glass for 12.5 s of a
 *   50 km/h approach (35.4 s of a crawl). She is not missing; she was between
 *   two 5-second sample frames. The BALL the briefing promises — „Някъде напред
 *   топка ще изскочи на платното, а след нея — дете" — genuinely never exists:
 *   `SC_HZ_EMERGENCY_STOP_DART` authors no `ballLeadSec` and the template no
 *   `hazard`, so `TrafficLayer`'s ball mesh is never mounted on any drive at
 *   any speed. That is a template row, named in the agent report, not this one.
 *
 * WHY THIS FILE IS IN THE RENDERER'S TEST DIRECTORY. Every legibility repair
 * this layer has shipped — B41's officer height, B42's gesture caption,
 * B40(a)'s staged-actor caption, FR-OFC-ARMS's sagittal tilt — answers one
 * question: can the student RESOLVE the thing the lesson grades, from the seat,
 * while there is still road left to act on it? Those all assume the actor is on
 * the glass at all. Nothing asked the prior question. This file asks it, and it
 * asks it the only honest way: by driving the shipped encounter and projecting
 * the actor against the shipped lens.
 *
 * THE LEDGER DISCIPLINE is `parked-on-footway.FOOTWAY_BUDGET`'s and
 * `scenery-sightline.TRACE_EXEMPT`'s, because it has already survived a founder
 * review: **an admitted row may only shrink, and a row that reaches zero must be
 * DELETED** — the assertions below fail on a stale row, so the list cannot
 * quietly stop being true.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  COCKPIT_ASPECT_REF,
  COCKPIT_CAM_OFFSET,
  COCKPIT_DEP,
  COCKPIT_FOV_MAX,
  COCKPIT_HFOV_RAD,
} from "@/modules/sim/vehicle/tuning";
import { CutInLeadCarRunner, PedestrianDartOutRunner } from "../../orchestrator/runners";
import type { DirectorInput } from "../../orchestrator/types";
import {
  SC_HZ_BRAKE_DONT_SWERVE_ESCORT,
  SC_HZ_EMERGENCY_STOP_DART,
} from "../../lessons/scenario/templates-hazards2";
import { createTrafficSystem } from "../system";
import type { TrafficDistrict } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORLD_DIR = path.resolve(HERE, "../../../../../..", "content", "world");

/**
 * Half the windscreen, in degrees — DERIVED from the shipped lens, never typed
 * in. `COCKPIT_HFOV_RAD` is the quantity CameraRig holds constant across every
 * window shape (`cockpitVFovForAspect`), so this one number is the horizontal
 * edge of the glass on the phone and on the PC alike. ≈ 37.70°.
 */
const HALF_GLASS_DEG = (COCKPIT_HFOV_RAD * 90) / Math.PI;

/**
 * How far BEHIND the chassis origin the cockpit eye sits, m — the worst case
 * for an actor abreast, because every metre of aft offset pushes a car level
 * with the door further behind the driver. Read off the same two constants
 * `CameraRig` places the camera with, so a re-seat moves this measurement
 * instead of silently invalidating it.
 */
const EYE_AFT_M = COCKPIT_CAM_OFFSET.aft + COCKPIT_DEP.z;
/**
 * …and how far the eye sits toward one flank. Applied in the direction that
 * FAVOURS the actor (the driver leaning toward the car he is asked to look at),
 * so the verdict below is the kindest reading of the geometry, not the harshest.
 */
const EYE_LATERAL_M = COCKPIT_DEP.x - COCKPIT_CAM_OFFSET.inboard;

/**
 * THE A-PILLAR, and why `HALF_GLASS_DEG` is a FLOOR on the excess rather than
 * the whole of it (added by the verifier; the repo already owned this number).
 *
 * `orchestrator/runners.ts` carries a measured-from-frames constant for exactly
 * this question — `CUTIN_VISIBLE_CONE_DEG = 20`, whose provenance note reads:
 * *„In the rendered cockpit at 1440×900 the windscreen's left edge (the
 * A-pillar) sits at screen x ≈ 255 of 1440, i.e. 24.3° off the axis — so the
 * frustum's 37.7° is a lie about what the driver can actually see"* (20° was
 * then chosen to clear the pillar with margin). That constant is module-private,
 * so it cannot be imported; the angle it was measured at is restated here with
 * its citation.
 *
 * CONSEQUENCE FOR THE LEDGER BELOW: 28.4 is the excess over the FRUSTUM. Over
 * the glass a seated driver actually has, the same escort is 66.1 − 24.3 =
 * 41.8° out. Both say „off the glass", so the verdict is safe in the direction
 * it matters — but a repair that lands the escort between 24.3° and 37.7° would
 * make the frustum row stale (and demand its deletion) while the car is still
 * behind the pillar. The extra test in the escort block below is the guard on
 * that: it stays green only while the escort is outside the VISIBLE cone too.
 */
const A_PILLAR_HALF_DEG = 24.3;

/**
 * THE LEDGER. Staged actors a lesson's own instructions tell the student to
 * LOOK AT, which are outside the windscreen for the whole window that
 * instruction covers. The value is the EXCESS in degrees: how far beyond the
 * edge of the glass the actor sits at its most favourable moment.
 *
 * `sc-hzbds-escort` — `templates-hazards2.SC_HZ_BRAKE_DONT_SWERVE_ESCORT`.
 * Instruction 2 of the drill: «Погледни вляво: в съседната лента, почти наравно
 * с вратата ти, се движи кола. Запомни я — тя е причината днешният урок да не е
 * „завърти волана“.» The car is authored at `paceAheadM: 1` in a lane
 * `extraRightOffsetM: −8.125` over, which is 66.1° off the driver's axis.
 *
 * TO CLOSE THE ROW (all of these are outside this lane's file ownership and are
 * named in the agent report): give the escort a `paceAheadM` that puts it in
 * front of the windscreen for the part of the approach the instruction covers;
 * or author an `actorLabels` entry so this layer's B40(a) caption can carry the
 * claim; or surface it through the mirror/blind-spot channel a real driver uses
 * for a car level with his door. Widening the lens is NOT one of the options —
 * the third test below measures why.
 *
 * AND THE ONE THE REPO ALREADY BUILT (verifier's addition — this is the first
 * thing the next lane should read). `CutInLeadCarRunner.paceGapM()` already
 * solves this problem for a different actor: it rides a pacing actor at
 * `|cutShiftM| / tan(CUTIN_VISIBLE_CONE_DEG)` — 8.125 m of lane over 20° is
 * 22.3 m ahead — precisely so „a lane `extraRightOffsetM` over sits inside the
 * driver's cone". The escort is excluded from it because `pacesIntoView()`
 * demands `cutShiftM !== 0`, and the escort's `cutShiftM: 0` is its whole point
 * („ZERO LATERAL: the escort never enters the player's lane"). The predicate is
 * keyed on whether the actor CHANGES LANE, not on whether the student can SEE
 * it. Note the size of the gap that implies: a `paceAheadM` picked off the
 * 37.70° frustum (≈ 10.5 m to touch the edge, ≈ 14 m for dwell) still leaves the
 * escort at ~28° — inside the frustum, still behind the A-pillar. The repo's own
 * frame-measured answer is ~22 m.
 */
const OFF_GLASS_LEDGER: Record<string, number> = {
  "sc-hzbds-escort": 28.4,
};

function loadDistrict(id: string): TrafficDistrict {
  return JSON.parse(
    fs.readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf-8"),
  ) as TrafficDistrict;
}

/**
 * Off-axis angle of a world point from the cockpit eye, degrees, for a driver
 * heading north up a straight street (both drills' maps are one straight edge —
 * `hz-debris-v1` and `hz-obstacle-v1`, asserted by their own district
 * batteries). 0° = dead ahead; > `HALF_GLASS_DEG` = not on the windscreen.
 */
function offAxisDeg(
  driverX: number,
  driverY: number,
  eyeLateralSign: -1 | 1,
  ax: number,
  ay: number,
): number {
  const eyeX = driverX + eyeLateralSign * EYE_LATERAL_M;
  const eyeY = driverY - EYE_AFT_M;
  return (Math.atan2(Math.abs(ax - eyeX), ay - eyeY) * 180) / Math.PI;
}

const DT = 1 / 30;
const PLAYER_LANE_X = 4.06; // both maps' meta.scenario lanePlayerX
const SPAWN_Y = 15; // both maps' meta.scenario spawnY

/** The runner's `out` parameter — typed off the runner itself; nothing here
 *  reads it, but a runner that starts emitting a different event shape should
 *  not be able to slip past this file's compile. */
type SimTickEventLike = Parameters<CutInLeadCarRunner["step"]>[2][number];

interface Approach {
  /** Smallest off-axis angle the actor ever reached, degrees. */
  minOffAxisDeg: number;
  /** Frames the actor spent inside the windscreen. */
  onGlassFrames: number;
  framesTotal: number;
  /** tSec the actor FIRST came inside the windscreen (−1 = never). */
  firstOnGlassSec: number;
  /** tSec the brake went down (−1 = never braked on this leg). */
  brakeAtSec: number;
}

/**
 * Drive the escort's own street the way its instructions read: accelerate to
 * `topMps`, and (when `brakeAtY` is given) stand on the brake there at the
 * 9.0 m/s² the live car actually produces — BRAKE_FORCE_N / CHASSIS_MASS, the
 * figure the template's own `ruleConfig` note derives.
 */
function driveEscort(topMps: number, rngValue: number, brakeAtY: number | null): Approach {
  const traffic = createTrafficSystem(loadDistrict("hz-debris-v1"), {
    anchor: { x: PLAYER_LANE_X, y: SPAWN_Y },
    anchorRadiusM: 400,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  const runner = new CutInLeadCarRunner(SC_HZ_BRAKE_DONT_SWERVE_ESCORT);
  runner.stage(traffic, () => rngValue, true);

  const r: Approach = {
    minOffAxisDeg: Infinity,
    onGlassFrames: 0,
    framesTotal: 0,
    firstOnGlassSec: -1,
    brakeAtSec: -1,
  };
  let py = SPAWN_Y;
  let mps = 0;
  const events: SimTickEventLike[] = [];
  for (let i = 0; i < 60 * 30 && py < 250; i++) {
    const tSec = i * DT;
    const braking = brakeAtY !== null && py >= brakeAtY;
    if (braking && r.brakeAtSec < 0) r.brakeAtSec = tSec;
    mps = braking ? Math.max(0, mps - 9.0 * DT) : Math.min(topMps, mps + 2.5 * DT);
    py += mps * DT;
    const input = {
      tSec,
      dtSec: DT,
      x: PLAYER_LANE_X,
      y: py,
      speedKmh: mps * 3.6,
      headingDeg: 0,
      brakePedal: braking ? 1 : 0,
      tickEvents: [],
    } as unknown as DirectorInput;
    runner.step(traffic, input, events);
    traffic.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: PLAYER_LANE_X, y: py },
      playerSpeedKmh: mps * 3.6,
      playerHeadingDeg: 0,
    });
    const actor = traffic.staged(SC_HZ_BRAKE_DONT_SWERVE_ESCORT.id);
    if (!actor) continue;
    // The escort's path is 300 m long; once it runs off the end the staged
    // channel re-enters it at the hold pose, and a body 160 m BEHIND the
    // stopped player is not what either finding is about.
    if (actor.y < py) continue;
    const ang = offAxisDeg(PLAYER_LANE_X, py, -1, actor.x, actor.y);
    r.framesTotal++;
    if (ang < r.minOffAxisDeg) r.minOffAxisDeg = ang;
    if (ang <= HALF_GLASS_DEG) {
      r.onGlassFrames++;
      if (r.firstOnGlassSec < 0) r.firstOnGlassSec = tSec;
    }
  }
  return r;
}

/** The sibling drill's child, driven the same way — the other direction. */
function driveChild(topMps: number): Approach & { onGlassSec: number } {
  const traffic = createTrafficSystem(loadDistrict("hz-obstacle-v1"), {
    anchor: { x: PLAYER_LANE_X, y: SPAWN_Y },
    anchorRadiusM: 400,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  const runner = new PedestrianDartOutRunner(SC_HZ_EMERGENCY_STOP_DART);
  runner.stage(traffic, () => 0.5, true);

  const r = {
    minOffAxisDeg: Infinity,
    onGlassFrames: 0,
    framesTotal: 0,
    firstOnGlassSec: -1,
    brakeAtSec: -1,
    onGlassSec: 0,
  };
  let py = SPAWN_Y;
  let mps = 0;
  const events: SimTickEventLike[] = [];
  for (let i = 0; i < 240 * 30 && py < 235; i++) {
    const tSec = i * DT;
    mps = Math.min(topMps, mps + 2.5 * DT);
    py += mps * DT;
    const input = {
      tSec,
      dtSec: DT,
      x: PLAYER_LANE_X,
      y: py,
      speedKmh: mps * 3.6,
      headingDeg: 0,
      brakePedal: 0,
      tickEvents: [],
    } as unknown as DirectorInput;
    runner.step(traffic, input, events);
    traffic.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: PLAYER_LANE_X, y: py },
      playerSpeedKmh: mps * 3.6,
      playerHeadingDeg: 0,
    });
    const child = traffic.pedestrians[0];
    if (child.y < py) continue; // already behind the windscreen
    // She stands on the RIGHT kerb, so the eye leans right toward her.
    const ang = offAxisDeg(PLAYER_LANE_X, py, 1, child.x, child.y);
    r.framesTotal++;
    if (ang < r.minOffAxisDeg) r.minOffAxisDeg = ang;
    if (ang <= HALF_GLASS_DEG) {
      r.onGlassFrames++;
      r.onGlassSec += DT;
      if (r.firstOnGlassSec < 0) r.firstOnGlassSec = tSec;
    }
  }
  return r;
}

describe("the lens the whole verdict rests on", () => {
  it("is the shipped one, and it is a real windscreen — not a number this file chose", () => {
    // 47° vertical at 16:9 ⇒ ≈ 75.4° horizontal ⇒ 37.70° each side of the axis.
    // If this ever drifts out of the band a driving cockpit can have, every
    // measurement below is meaningless and this test says so first.
    expect(HALF_GLASS_DEG).toBeGreaterThan(30);
    expect(HALF_GLASS_DEG).toBeLessThan(45);
    expect(HALF_GLASS_DEG).toBeCloseTo(37.7, 1);
    expect(COCKPIT_ASPECT_REF).toBeCloseTo(16 / 9, 6);
    // The eye is behind and inboard of the driver's own head. Both matter to an
    // actor abreast, and both are read from tuning.ts rather than assumed.
    expect(EYE_AFT_M).toBeGreaterThan(0.3);
    expect(EYE_LATERAL_M).toBeGreaterThan(0.15);
  });
});

describe("sc-hz-brake-dont-swerve — «Погледни вляво … се движи кола»", () => {
  const EXCESS = OFF_GLASS_LEDGER["sc-hzbds-escort"];

  it("the escort is outside the windscreen for the whole approach, at every pace a student can drive", () => {
    // 14 km/h is the harness crawl the sweep161 frames were shot at; 22 is a
    // cautious real seventeen-year-old; 13.89 m/s is the drill's own authored
    // 50. The finding must not depend on which one you pick — and it does not.
    for (const topMps of [3.9, 6.0, 13.89]) {
      const r = driveEscort(topMps, 0.5, null);
      expect(r.framesTotal, `${(topMps * 3.6).toFixed(0)} km/h produced no samples`).toBeGreaterThan(300);
      expect(
        r.onGlassFrames,
        `${(topMps * 3.6).toFixed(0)} km/h: the escort reached the glass`,
      ).toBe(0);
      expect(r.minOffAxisDeg).toBeGreaterThan(HALF_GLASS_DEG);
    }
  });

  it("…and the runner's own ±1 m station jitter cannot rescue it at either extreme", () => {
    // CutInLeadCarRunner.stage: `paceAheadM = spec.paceAheadM + (rng()*2−1)`.
    // rng 0 puts the escort exactly level with the chassis origin, rng 1 puts it
    // 2 m ahead. Both are still behind the A-pillar.
    for (const rngValue of [0, 0.5, 1]) {
      const r = driveEscort(13.89, rngValue, null);
      expect(r.onGlassFrames, `rng ${rngValue}`).toBe(0);
    }
  });

  it("it arrives ON THE GLASS only AFTER the brake it exists to justify", () => {
    // The authored drive: 50 km/h, then full ABS braking from the reveal.
    // The escort is released by the runner at that moment and sails ahead —
    // which is exactly when it becomes visible. Instruction 2 asks the student
    // to have already remembered it.
    const r = driveEscort(13.89, 0.5, 168);
    expect(r.brakeAtSec, "the drive never braked").toBeGreaterThan(0);
    expect(r.firstOnGlassSec, "the escort never reached the glass at all").toBeGreaterThan(0);
    expect(r.firstOnGlassSec).toBeGreaterThan(r.brakeAtSec);
    // Not a hair late — the better part of a second AFTER the pedal is down,
    // i.e. after the brake-or-swerve choice has been made and executed.
    expect(r.firstOnGlassSec - r.brakeAtSec).toBeGreaterThan(0.5);
  });

  it("is admitted in the ledger by the excess it actually measures, and the row may only shrink", () => {
    const r = driveEscort(13.89, 0.5, null);
    const measured = r.minOffAxisDeg - HALF_GLASS_DEG;
    // Shrink-only: a repair that brings the escort nearer the axis passes here…
    expect(measured).toBeLessThanOrEqual(EXCESS + 0.05);
    // …and a repair that brings it INSIDE the glass makes the row stale, which
    // must fail rather than silently pass. Delete the entry when that happens.
    expect(
      measured,
      "sc-hzbds-escort is on the glass now — DELETE its OFF_GLASS_LEDGER row",
    ).toBeGreaterThan(0);
    expect(EXCESS).toBeGreaterThan(0);
    // The measurement is the authored geometry, not an accident of the drive:
    // atan(laneShift / (paceAhead + eyeAft)) with the eye leaning toward it.
    const predicted =
      (Math.atan2(
        8.125 - EYE_LATERAL_M,
        SC_HZ_BRAKE_DONT_SWERVE_ESCORT.paceAheadM + EYE_AFT_M,
      ) *
        180) /
      Math.PI;
    expect(r.minOffAxisDeg).toBeLessThanOrEqual(predicted + 0.5);
  });

  it("…and it is outside the glass the SEATED driver has, not merely outside the frustum", () => {
    // Verifier's addition. The ledger's 28.4 is measured against the 37.70°
    // frustum; `orchestrator/runners.ts` measured the A-pillar off real frames
    // at 24.3°. This assertion is the weaker of the two bounds, so it can never
    // turn red on its own while the row above is honest — its job is to stay
    // green through a HALF repair. When it finally fails, the escort has
    // entered the cone a driver can actually look through, and only then is the
    // OFF_GLASS_LEDGER row genuinely retired rather than merely stale.
    expect(A_PILLAR_HALF_DEG).toBeLessThan(HALF_GLASS_DEG);
    const r = driveEscort(13.89, 0.5, null);
    expect(
      r.minOffAxisDeg,
      "the escort is inside the A-pillar cone now — the repair is real, retire the row",
    ).toBeGreaterThan(A_PILLAR_HALF_DEG);
  });

  it("widening the lens is not the repair — not even at the rig's hard ceiling", () => {
    // COCKPIT_FOV_MAX is the widest vertical FOV CameraRig will ever produce
    // (speed-widen included). Converted to a horizontal half-angle at the
    // widest window the sweep actually audited — the 2556×1179 handset — it is
    // still nowhere near a car level with the door. So „just widen the FOV" is
    // closed as an option, and the ledger row cannot be retired that way.
    const widestAspect = 2556 / 1179;
    const widestHalfDeg =
      (Math.atan(Math.tan((COCKPIT_FOV_MAX * Math.PI) / 360) * widestAspect) * 180) / Math.PI;
    expect(widestHalfDeg).toBeGreaterThan(HALF_GLASS_DEG); // the widen is real
    const r = driveEscort(13.89, 0.5, null);
    expect(r.minOffAxisDeg).toBeGreaterThan(widestHalfDeg);
  });
});

describe("sc-hz-emergency-stop — the same sentence, and it does not hold", () => {
  it("the child stands on the glass from the first metre of the drill, not only at the dart", () => {
    // sweep161 said „the road is completely empty … no child". She is at her
    // authored kerb pose (9.5, 150) from the frame the encounter is staged on,
    // which is before TrafficLayer mounts (LessonScene's A8 ordering), and she
    // is inside the windscreen the whole way in. What the audit sampled was a
    // five-second grid, not an empty world.
    const r = driveChild(13.89);
    expect(r.firstOnGlassSec, "she never reached the glass").toBe(0);
    expect(r.minOffAxisDeg).toBeLessThan(5);
    expect(r.onGlassSec).toBeGreaterThan(10);
  });

  it("and stays there through a crawl, which is the drive the frames were shot on", () => {
    const r = driveChild(3.9);
    expect(r.minOffAxisDeg).toBeLessThan(HALF_GLASS_DEG);
    expect(r.onGlassSec).toBeGreaterThan(25);
  });

  it("she is NOT in the ledger, and that is the guard on any escort repair", () => {
    // The two drills stage the same class of actor on the same kind of street.
    // If a future repair „fixes" the escort by moving every staged actor toward
    // the driving line, this row is what notices: the child must stay where the
    // лекция put her, on the kerb, читаема from the seat as she already is.
    expect(OFF_GLASS_LEDGER["sc-hzes-child"]).toBeUndefined();
    expect(SC_HZ_EMERGENCY_STOP_DART.start.x).toBeCloseTo(9.5, 6);
    expect(SC_HZ_EMERGENCY_STOP_DART.start.y).toBeCloseTo(150, 6);
  });
});
