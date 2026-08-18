/**
 * ContactProbe — the swept memory, and the frame rate that used to decide the
 * verdict.
 *
 * Every case here is a drive: poses handed to the probe one observed frame at a
 * time, the way `orchestrator/contact.ts` hands them over, with the TICK as the
 * variable. The whole point of a swept test is that the answer must not depend
 * on how often it was asked — sweep161 found three lessons where it did
 * (sc-hz-accident-scene, sc-signal-response, sc-turn-left-oncoming: same
 * scripted drive, «ИЗДЪРЖАН, 0 наказателни точки» on one platform and a
 * collision on the other).
 *
 * The ticks are not invented. 1/60 s is a healthy frame; 0.5 s is the ceiling
 * @react-three/rapier clamps a frame to and, since 2026-08-16, exactly what a
 * 2.33–3.57 s PC render frame hands the director (lesson-ui/sessionClock.ts).
 */

import { describe, expect, it } from "vitest";

import { actorObb, PEDESTRIAN_BODY_RADIUS_M, playerObb } from "../bodies";
import {
  obbSeparationM,
  sweptObbSeparationM,
  SWEEP_MAX_STEPS,
  SWEEP_RESOLUTION_M,
  SWEEP_TELEPORT_M,
  type Obb2D,
} from "../obb";
import {
  ContactProbe,
  isContact,
  SWEEP_CHUNK_TRAVEL_M,
  SWEEP_FRAME_TRAVEL_M,
} from "../probe";

/** A car standing in the lane, nose north. */
function parked(x: number, y: number): Obb2D {
  return actorObb({ x, y, dirX: 0, dirY: 1 });
}

/**
 * Two cars nose-to-nose down ONE lane at `kmh` each, stepped at `dtSec`, run
 * through the probe until they have passed each other. Returns whether the
 * probe ever reported contact and the deepest separation it saw.
 */
function headOn(dtSec: number, kmh: number): { contact: boolean; minSepM: number } {
  const v = kmh / 3.6;
  const probe = new ContactProbe();
  let contact = false;
  let minSepM = Infinity;
  for (let i = 0; ; i++) {
    const t = i * dtSec;
    const py = -60 + v * t;
    if (py > 60) break;
    const sep = probe.vehicleSeparationM(
      "oncoming",
      playerObb(0, py, 0),
      actorObb({ x: 0, y: 60 - v * t, dirX: 0, dirY: -1 }),
    );
    if (sep < minSepM) minSepM = sep;
    if (isContact(sep)) contact = true;
  }
  return { contact, minSepM };
}

/** The player drives north past a car parked `lateralM` to its right. */
function passBy(dtSec: number, kmh: number, lateralM: number): { contact: boolean; minSepM: number } {
  const v = kmh / 3.6;
  const probe = new ContactProbe();
  const car = parked(lateralM, 0);
  let contact = false;
  let minSepM = Infinity;
  for (let i = 0; ; i++) {
    const py = -40 + v * dtSec * i;
    if (py > 40) break;
    const sep = probe.vehicleSeparationM("kerb", playerObb(0, py, 0), car);
    if (sep < minSepM) minSepM = sep;
    if (isContact(sep)) contact = true;
  }
  return { contact, minSepM };
}

const TICKS = [1 / 60, 0.1, 0.25, 0.5];

describe("ContactProbe — a crash is a crash at every frame rate", () => {
  it("reports the head-on at 50 km/h on a 0.5 s tick, not just on a fast one", () => {
    // 50 km/h each = 27.8 m/s closing = 13.89 m of relative travel per 0.5 s
    // tick, over obb.ts's 12 m teleport cap. Before subdivision the swept test
    // fell back to a single pose sample and reported +0.930 m of CLEAR AIR
    // between two cars that had just driven through each other.
    const slow = headOn(0.5, 50);
    expect(slow.contact).toBe(true);
    expect(slow.minSepM).toBeLessThan(0);

    const fast = headOn(1 / 60, 50);
    expect(fast.contact).toBe(true);
  });

  it("reports it at every tick and every speed the sim can reach", () => {
    // 168 km/h is the player's measured terminal (tuning.ts); at a 0.5 s tick
    // that is 46.67 m of relative travel in ONE observed interval — nearly four
    // times the cap, and previously reported as +15.930 m of air.
    for (const dt of TICKS) {
      for (const kmh of [50, 90, 130, 168]) {
        const run = headOn(dt, kmh);
        expect(run.contact, `dt=${dt} v=${kmh}`).toBe(true);
        expect(run.minSepM, `dt=${dt} v=${kmh}`).toBeLessThan(0);
      }
    }
  });

  it("runs a pedestrian down at a 0.5 s tick, where the child used to survive", () => {
    // A walker standing on the centreline, the player through the spot at
    // 130 km/h: 18.06 m of travel per tick. The disc path has the same cap and
    // the same hole, and the body it misses is the smallest one graded.
    const v = 130 / 3.6;
    const probe = new ContactProbe();
    let contact = false;
    for (let i = 0; ; i++) {
      const py = -40 + v * 0.5 * i;
      if (py > 40) break;
      const sep = probe.discSeparationM("child", playerObb(0, py, 0), 0, 0, PEDESTRIAN_BODY_RADIUS_M);
      if (isContact(sep)) contact = true;
    }
    expect(contact).toBe(true);
  });
});

describe("ContactProbe — and clear air stays clear air", () => {
  it("gives the same separation past a parked car at 0.017 s and at 0.5 s", () => {
    // The opposite direction of the same invariant: subdividing must not invent
    // contact where there is none. 1.8 m lateral leaves 0.030 m of body-to-body
    // air (PLAYER_HALF_WIDTH + the car's own half-width); the whole reason this
    // module exists is that a metre of daylight was once billed as a crash.
    for (const lateralM of [1.8, 2.0, 2.6]) {
      const fine = passBy(1 / 60, 15, lateralM);
      for (const dt of TICKS) {
        for (const kmh of [50, 90, 130]) {
          const coarse = passBy(dt, kmh, lateralM);
          expect(coarse.contact, `lat=${lateralM} dt=${dt} v=${kmh}`).toBe(false);
          expect(coarse.minSepM, `lat=${lateralM} dt=${dt} v=${kmh}`).toBeCloseTo(
            fine.minSepM,
            9,
          );
        }
      }
    }
  });

  it("still refuses to sweep a TELEPORT across the player", () => {
    // A re-stage puts an actor back on its hold pose. Sweeping that jump would
    // drag its body through a stationary player and invent «Пътнотранспортно
    // произшествие» out of a retry — the error this file's reset() exists to
    // prevent, and subdivision must not smuggle it back in. 80 m in one
    // observed interval is not motion at any frame rate the physics can
    // produce (82.8 m/s × rapier's 0.5 s ceiling = 41.4 m).
    const probe = new ContactProbe();
    const still = playerObb(0, 0, 0);
    probe.vehicleSeparationM("restaged", still, parked(0, -40));
    const afterJump = probe.vehicleSeparationM("restaged", still, parked(0, 40));
    expect(isContact(afterJump)).toBe(false);
    expect(afterJump).toBeCloseTo(obbSeparationM(still, parked(0, 40)), 12);
  });

  it("takes obb.ts's own path, unchanged, on an ordinary frame", () => {
    // Below the teleport cap nothing is subdivided, and the number is BIT-FOR-BIT
    // the one sweptObbSeparationM returns — which is what keeps every separation
    // ever measured through this probe and quoted in the scenario templates
    // (templates-lanes2.ts's «0.192 m», templates-vru2.ts's re-measurements)
    // still true.
    //
    // Subdividing is not merely "finer": it moves where the sub-samples land, so
    // it can return a slightly DIFFERENT minimum in either direction. Measured
    // on the pose pair below, a 10.28 m interval swept as one call gives
    // 0.135789577 m and the same interval cut in two gives 0.135804808 m. Same
    // verdict, different number — and the number is quoted, so an ordinary frame
    // must keep taking the one call.
    const car = actorObb({ x: 3.5, y: 0, dirX: 1, dirY: 0.35 });
    const from = { x: 0, y: -6, headingDeg: 0 };
    const now = playerObb(0.4, 4, 7);
    const probe = new ContactProbe();
    probe.vehicleSeparationM("k", playerObb(from.x, from.y, from.headingDeg), car);
    const direct = sweptObbSeparationM(from, now, { x: car.x, y: car.y, headingDeg: car.headingDeg }, car);
    expect(direct).toBeLessThan(SWEEP_TELEPORT_M); // sanity: one call's worth
    expect(probe.vehicleSeparationM("k", now, car)).toBe(direct);
  });
});

describe("ContactProbe — memory it must not pretend to have", () => {
  it("forget(key) stops the next call sweeping across the unobserved gap", () => {
    // The caller that skips a body for a while (contact.ts skips a cast member
    // whose actor the traffic port cannot resolve) leaves a pose behind that is
    // no longer LAST frame's. Swept against the current one it drags the walker
    // through the car: measured −0.070 m of penetration where the two bodies
    // are 3.680 m apart.
    const gapped = new ContactProbe();
    gapped.discSeparationM("ped", playerObb(0, -6, 0), 0, 0, PEDESTRIAN_BODY_RADIUS_M);
    const invented = gapped.discSeparationM("ped", playerObb(0, 6, 0), 0, 0, PEDESTRIAN_BODY_RADIUS_M);
    expect(isContact(invented)).toBe(true); // the defect, stated

    const told = new ContactProbe();
    told.discSeparationM("ped", playerObb(0, -6, 0), 0, 0, PEDESTRIAN_BODY_RADIUS_M);
    told.forget("ped");
    const honest = told.discSeparationM("ped", playerObb(0, 6, 0), 0, 0, PEDESTRIAN_BODY_RADIUS_M);
    expect(isContact(honest)).toBe(false);
    expect(honest).toBeCloseTo(3.68, 6);
  });

  it("forget(key) leaves every other key's memory alone", () => {
    // A per-key drop that quietly behaved like reset() would delete the sweep
    // for the bodies still being watched, and a missed contact is the worse
    // error of the two. The step below is the one only a SWEEP catches: 5 m
    // short of a parked car to 5 m past it, where nose-to-tail touch is 4.12 m,
    // so BOTH end poses show 0.88 m of air and only the motion between them is
    // a crash.
    const probe = new ContactProbe();
    const car = parked(0, 0);
    probe.vehicleSeparationM("other", playerObb(0, -5, 0), car);
    probe.vehicleSeparationM("dropped", playerObb(0, -5, 0), parked(30, 0));
    expect(isContact(obbSeparationM(playerObb(0, 5, 0), car))).toBe(false);

    probe.forget("dropped");
    expect(isContact(probe.vehicleSeparationM("other", playerObb(0, 5, 0), car))).toBe(true);
  });

  it("pins the two subdivision budgets to the physics they were read off", () => {
    // Numbers, not preferences — and each inequality is the reason the number
    // is what it is.
    //
    // A chunk must never itself be refused as a teleport by the call it is
    // handed to, or subdivision would achieve nothing:
    expect(SWEEP_CHUNK_TRAVEL_M).toBeLessThanOrEqual(SWEEP_TELEPORT_M);
    // …and must be short enough to be sub-sampled at the FULL resolution,
    // because a step-capped chunk makes the sampling coarsen with the frame
    // rate again — the exact dependence subdivision exists to remove:
    expect(SWEEP_CHUNK_TRAVEL_M / SWEEP_RESOLUTION_M).toBeLessThanOrEqual(SWEEP_MAX_STEPS);
    // The outer cap must cover everything one frame can physically produce:
    // 46.8 m/s player terminal + 36 m/s fastest authored actor = 82.8 m/s of
    // closing speed, over rapier's 0.5 s per-frame ceiling.
    expect(SWEEP_FRAME_TRAVEL_M).toBeGreaterThanOrEqual((46.8 + 36) * 0.5);
  });
});
