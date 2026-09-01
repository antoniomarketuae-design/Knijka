/**
 * SWEEP 161, „Спри в лентата, не свивай на сляпо" — THE NEIGHBOUR, DRIVEN.
 *
 * The row (:8a5ed5b4, critical): at `05-stopped` the coach says «Виж я колата
 * отляво — мина си по своята лента, без изобщо да разбере. Ако бяхме свили,
 * щяхме да сме В нея» while the left lane is „visibly, completely empty", and
 * the same at t094 where the copy calls the car level with the driver's door.
 * The auditor's conclusion was that the car is never in the world.
 *
 * IT IS IN THE WORLD. `sc-hzbds-escort` stages cleanly on hz-debris-v1 and
 * paces where `paceAheadM: 1` asks it to — about 1.8 m ahead, 8.125 m left,
 * i.e. ~77° off the nose against a cockpit half-field of ~38°. A car beside
 * your door is not visible through a windscreen, and this лекция is the one
 * that says so out loud («точно съседната лента е мястото, където живее
 * мъртвата ти зона»). That part is the subject, not the bug.
 *
 * THE BUG IS THAT IT NEVER STOPPED BEING BESIDE THE DOOR. The escort's „cut" is
 * a pure RELEASE — `cutShiftM: 0`, nothing is taken from anyone — and it was
 * gated behind `minCutSpeedKmh: 25`. The audited drives ran 10–15 км/ч
 * (log.txt: „POSITIVE CONTROL: 15 км/ч after 5 s of throttle"), so the gate
 * never opened: the escort stayed slaved to `matchPlayer` for the whole lesson
 * and then, when the student stopped on the drill's own mark, came to a DEAD
 * STOP a couple of metres from his door and stood there — the exact absurdity
 * the template's own `cutShiftM` note says the release exists to prevent, under
 * instruction 6 telling him to watch it drive by.
 *
 * So this battery drives the encounter through the PRODUCTION stack — the real
 * `createTrafficSystem`, the real `ScenarioDirector`, the real
 * `CutInLeadCarRunner` — at the pace the audited learner actually held, and
 * asserts what the student would have SEEN. Every arm carries its refutation:
 * the same drive re-run against the SHIPPED-BEFORE floor of 25, which must go
 * back to standing still. A test that only shows the fixed value working cannot
 * tell a reader whether it was ever broken.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  CutInLeadCarSpec,
  StagedEventOutcome,
  StagedEventSpec,
} from "../../../contracts";
import { createScenarioDirector } from "../../../orchestrator";
import { createTrafficSystem, type TrafficDistrict } from "../../../traffic";
import { SC_HZ_BRAKE_DONT_SWERVE, SC_HZ_BRAKE_DONT_SWERVE_ESCORT } from "../templates-hazards2";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

/** The floor as it was SHIPPED WHEN THE SWEEP RAN — the refutation arm. */
const SHIPPED_BEFORE_CUT_KMH = 25;

/** hz-debris-v1, pinned by value (meta.scenario — the L7 copy law). */
const LANE_X = 4.06;
/** The shadow's rest mark, and the `sc-hzbds-stop` gate's centre. */
const STOP_MARK_Y = 184;
/** One drawn lane pitch on this map (3.25 m × perceptual scale 2.5). */
const LANE_PITCH_M = 8.125;
/**
 * Half the cockpit's horizontal field. The camera holds ~75.4° of hFOV across
 * window shapes (doc 71 §4.9), so anything more than ~38° off the nose is not
 * on the glass at all — which is the whole reason the audited frames read as
 * „there is no car".
 *
 * COARSE, AND DELIBERATELY SO. The bearings below are taken from the CHASSIS
 * ORIGIN, not from the cockpit eye, which sits aft and inboard of it and
 * therefore reads every actor a few degrees NEARER the axis. The authoritative
 * measurement — the shipped lens, the shipped eye offsets, the A-pillar — lives
 * in traffic/__tests__/staged-subject-on-the-glass.test.ts and carries this
 * finding's off-glass ledger. What is wanted here is only the coarse verdict
 * „beside the door / up the road".
 *
 * The asymmetry, stated so nobody has to re-derive it: on the ON-THE-GLASS
 * claim the chassis-origin bearing is the HARSHER bound — it reads larger than
 * the eye's, so a pass here implies a pass there. On the OFF-THE-GLASS claim it
 * is the more lenient one, which is why that half is asserted properly, from
 * the eye and against the A-pillar, in the file named above rather than here.
 */
const HALF_FIELD_DEG = 37.7;

function district(id: string): unknown {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as unknown;
}

/** Bearing of a neighbour `aheadM` up the next lane, degrees off the nose. */
function bearingDeg(aheadM: number): number {
  return (Math.atan2(LANE_PITCH_M, Math.max(aheadM, 1e-6)) * 180) / Math.PI;
}

interface DriveProbe {
  /** The director's own report on the encounter — null if it never fired. */
  outcome: StagedEventOutcome | null;
  /** Metres of clear road between the two cars the moment the player rests. */
  clearAtRestM: number;
  /** The escort's speed at that instant, m/s. */
  escortSpeedAtRestMps: number;
  /** The furthest it ever got up its own lane — before any FR-B5 re-entry. */
  maxClearM: number;
  /** …and where it stands 6 s after the player has stopped. */
  clearLateM: number;
  escortSpeedLateMps: number;
}

/**
 * Drive the player's own lane from rest to `cruiseKmh`, hold it, then stop on
 * the drill's mark — the shape of every honest attempt at this lesson.
 * Kinematic on purpose: the question is what the DIRECTOR does with a player
 * pose stream, and a physics car would only add noise to that.
 */
function drive(cruiseKmh: number, minCutSpeedKmh: number): DriveProbe {
  const raw = district("hz-debris-v1") as TrafficDistrict;
  const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  const escort: CutInLeadCarSpec = { ...SC_HZ_BRAKE_DONT_SWERVE_ESCORT, minCutSpeedKmh };
  const staged = (SC_HZ_BRAKE_DONT_SWERVE.staged ?? []).map((s) =>
    s.id === escort.id ? escort : s,
  ) as StagedEventSpec[];
  const director = createScenarioDirector(staged, traffic, { seed: 7 });

  const dt = 1 / 60;
  const cruiseMps = cruiseKmh / 3.6;
  const ACCEL = 2.5; // a learner getting under way
  const BRAKE = 9.0; // BRAKE_FORCE_N / CHASSIS_MASS — the car's own full pedal
  let t = 0;
  let py = 15;
  let pv = 0;
  let outcome: StagedEventOutcome | null = null;
  let restedAt: number | null = null;
  let clearAtRestM = 0;
  let escortSpeedAtRestMps = 0;
  let maxClearM = -Infinity;
  let clearLateM = 0;
  let escortSpeedLateMps = 0;
  let prevY: number | null = null;
  let reentered = false;

  for (let f = 0; f < 60 * 200; f++) {
    // Brake so as to come to rest on the mark, exactly as instruction 5 asks.
    if (py > STOP_MARK_Y - (pv * pv) / (2 * BRAKE)) pv = Math.max(0, pv - BRAKE * dt);
    else pv = Math.min(cruiseMps, pv + ACCEL * dt);
    py += pv * dt;
    t += dt;

    traffic.update(dt, {
      signalPhase: () => "green" as never,
      playerPos: { x: LANE_X, y: py },
      playerSpeedKmh: pv * 3.6,
      playerHeadingDeg: 0,
    });
    const res = director.step({
      tSec: t,
      dtSec: dt,
      x: LANE_X,
      y: py,
      speedKmh: pv * 3.6,
      headingDeg: 0,
      brakePedal: 0,
      tickEvents: [],
    });
    for (const o of res.outcomes) if (o.eventId === escort.id) outcome ??= o;

    const v = traffic.staged(escort.id);
    if (!v) throw new Error("sc-hzbds-escort did not stage");
    // The escort's path is 300 m and it RE-ENTERS at the start once it runs off
    // the end (staged.ts FR-B5-EXIT). A re-entered lap is a different car for
    // every question this file asks, so measurement stops at the teleport.
    if (prevY !== null && v.y < prevY - 20) reentered = true;
    prevY = v.y;
    if (!reentered) {
      const clear = v.y - py;
      if (clear > maxClearM) maxClearM = clear;
      if (restedAt === null && pv === 0 && py > STOP_MARK_Y - 2) {
        restedAt = t;
        clearAtRestM = clear;
        escortSpeedAtRestMps = v.speedMps;
      }
      clearLateM = clear;
      escortSpeedLateMps = v.speedMps;
    }
    if (restedAt !== null && t >= restedAt + 6) break;
  }

  if (restedAt === null) throw new Error(`the player never came to rest (cruise ${cruiseKmh})`);
  return {
    outcome,
    clearAtRestM,
    escortSpeedAtRestMps,
    maxClearM,
    clearLateM,
    escortSpeedLateMps,
  };
}

describe("sc-hzbds-escort — the neighbour drives on, at the pace the audit actually held", () => {
  it("SHIPPED BEFORE (minCutSpeedKmh 25): at 12 км/ч it never leaves, and parks beside the door", () => {
    const p = drive(12, SHIPPED_BEFORE_CUT_KMH);
    // The photographed drill: the release gate never opens, so the director has
    // nothing to report about the one encounter the lesson is built on…
    expect(p.outcome).toBeNull();
    // …the escort is still on the rubber band when the player stops, so it is
    // already shedding the last of its own speed beside his door (it cannot
    // stop as hard as he can: the band is a proportional target, not a pedal)…
    expect(p.escortSpeedAtRestMps).toBeLessThan(3);
    expect(Math.abs(p.clearAtRestM)).toBeLessThan(5);
    // …and it is still there six seconds later, under «мина си по своята
    // лента». That sentence, over that world, is the finding.
    expect(p.escortSpeedLateMps).toBeLessThan(0.5);
    expect(Math.abs(p.clearLateM)).toBeLessThan(5);
    // It never once reached a place on the windscreen where a student could
    // have seen it — beside the door, tens of degrees outside the glass on
    // either lens model (see the HALF_FIELD_DEG note; the eye-based figure is
    // 66.1° against 37.70°, measured next door in traffic/__tests__).
    expect(bearingDeg(p.maxClearM)).toBeGreaterThan(HALF_FIELD_DEG);
  });

  it("SHIPPED NOW (minCutSpeedKmh 5): at 12 км/ч it is released and genuinely goes past", () => {
    expect(SC_HZ_BRAKE_DONT_SWERVE_ESCORT.minCutSpeedKmh).toBeLessThan(SHIPPED_BEFORE_CUT_KMH);
    const p = drive(12, SC_HZ_BRAKE_DONT_SWERVE_ESCORT.minCutSpeedKmh);
    // The director reports the encounter, and reports it clean: the escort was
    // escorted past untouched, which is the shadow's own claim.
    expect(p.outcome).not.toBeNull();
    expect(p.outcome!.success).toBe(true);
    // It is under way — and well ahead — at the instant the student comes to
    // rest and the coach says «виж я колата отляво».
    expect(p.escortSpeedAtRestMps).toBeGreaterThan(8);
    expect(p.clearAtRestM).toBeGreaterThan(20);
    // …and it keeps going up its OWN lane rather than freezing in it.
    expect(p.clearLateM).toBeGreaterThan(p.clearAtRestM);
    // And it did it IN FRONT OF HIM — inside the windscreen, where instruction
    // 6 («Гледай колата отляво как си минава по своята лента») points.
    expect(bearingDeg(p.clearAtRestM)).toBeLessThan(HALF_FIELD_DEG);
  });

  it("TRACE-NEUTRAL: the posted-speed approach behaves identically at 25 and at 5", () => {
    // The three committed recordings all approach at the posted 50, so the old
    // floor was never the binding condition on any of them — the geometry was.
    // If this arm ever diverges, the trace gate is about to go red for a reason
    // that has nothing to do with the drill.
    const before = drive(50, SHIPPED_BEFORE_CUT_KMH);
    const after = drive(50, SC_HZ_BRAKE_DONT_SWERVE_ESCORT.minCutSpeedKmh);
    expect(before.outcome).not.toBeNull();
    expect(after.outcome).not.toBeNull();
    expect(after.outcome!.tSec).toBeCloseTo(before.outcome!.tSec, 6);
    expect(after.clearAtRestM).toBeCloseTo(before.clearAtRestM, 6);
    expect(after.escortSpeedAtRestMps).toBeCloseTo(before.escortSpeedAtRestMps, 6);
  });
});
