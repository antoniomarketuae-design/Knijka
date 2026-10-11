/**
 * sc-hz-brake-dont-swerve:a7d0dd29 — THE CONTACT HALF OF THE STEP RECORD.
 *
 * A contact the chassis BEGAN is recorded at the physics step it began, with
 * that step's relative speed, once per manifold (as @react-three/rapier called
 * `onCollisionEnter` once per manifold), and is read back by the step number —
 * the session grid's point. The rapier-driven proof that this edge IS rapier's
 * STARTED event, and that it bills on every display, is
 * lessons/scenario/__tests__/hz-static-contact-cadence.test.ts; this file pins
 * the bookkeeping with a scripted contact source.
 */
import { describe, expect, it } from "vitest";
import { PlayerStepTrackRecorder, recordPhysicsStep, type ChassisContactSource } from "..";

type Reading = Parameters<Parameters<ChassisContactSource["forEachChassisContact"]>[0]>[0];

/** A sim whose contacts after each step are scripted: `touching[k]` is the
 *  list the chassis touches after step k (1-based). */
function scriptedSim(touching: Reading[][]) {
  let step = 0;
  return {
    speedKmh: 0,
    advance() {
      step++;
    },
    forEachChassisContact(f: (r: Reading) => void) {
      for (const r of touching[step] ?? []) f(r);
    },
  };
}

const body = {
  translation: () => ({ x: 0, y: 0, z: 0 }),
  rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
};
const wall = (impactKmh: number, manifolds = 1): Reading => ({ otherHandle: 7, manifolds, otherUserData: undefined, impactKmh });
const kerb = (impactKmh: number): Reading => ({ otherHandle: 3, manifolds: 1, otherUserData: { districtSurface: true }, impactKmh });

function drive(touching: Reading[][], steps: number) {
  const rec = new PlayerStepTrackRecorder();
  const sim = scriptedSim(touching);
  for (let i = 0; i < steps; i++) {
    sim.advance();
    expect(recordPhysicsStep(rec, body, sim)).toBe(true);
  }
  return rec;
}

describe("PlayerStepTrackRecorder — the contacts the chassis BEGAN, at their step", () => {
  it("a contact is recorded at the step it began, with that step's speed — and not again while it lasts", () => {
    const touching: Reading[][] = [];
    touching[5] = [wall(6.01)];
    touching[6] = [wall(4.2)];
    touching[7] = [wall(3.9)];
    const rec = drive(touching, 10);
    expect(rec.contactsAtStep(5)).toEqual([{ step: 5, otherUserData: undefined, impactKmh: 6.01 }]);
    for (const k of [1, 2, 3, 4, 6, 7, 8, 9, 10]) expect(rec.contactsAtStep(k), `step ${k}`).toEqual([]);
  });

  it("a pair that leaves contact and returns begins again — each start at its own step", () => {
    const touching: Reading[][] = [];
    touching[3] = [wall(10)];
    touching[4] = [wall(9)];
    touching[8] = [wall(0.8)];
    const rec = drive(touching, 9);
    expect(rec.contactsAtStep(3).map((c) => c.impactKmh)).toEqual([10]);
    expect(rec.contactsAtStep(8).map((c) => c.impactKmh)).toEqual([0.8]);
    expect(rec.contactsAtStep(4)).toEqual([]);
  });

  it("two bodies begun at one step are both recorded, in rapier's order, with their own tags; a pair holding three manifolds is heard three times (r3r called the handler per manifold)", () => {
    const touching: Reading[][] = [];
    touching[2] = [kerb(12), wall(30, 3)];
    const rec = drive(touching, 3);
    expect(rec.contactsAtStep(2)).toEqual([
      { step: 2, otherUserData: { districtSurface: true }, impactKmh: 12 },
      { step: 2, otherUserData: undefined, impactKmh: 30 },
      { step: 2, otherUserData: undefined, impactKmh: 30 },
      { step: 2, otherUserData: undefined, impactKmh: 30 },
    ]);
  });

  it("a step not taken yet, or older than the ring of 64, holds no contact", () => {
    const touching: Reading[][] = [];
    touching[1] = [wall(5)];
    touching[100] = [wall(8)];
    const rec = drive(touching, 100);
    expect(rec.contactsAtStep(1), "older than the ring").toEqual([]);
    expect(rec.contactsAtStep(100).map((c) => c.impactKmh)).toEqual([8]);
    expect(rec.contactsAtStep(101), "not taken yet").toEqual([]);
    expect(rec.contactsAtStep(0)).toEqual([]);
    expect(rec.droppedContacts).toBe(0);
  });

  it("a sim that cannot report contacts records none, and the pose half is untouched (the stand-in rigs of the wiring tests)", () => {
    const rec = new PlayerStepTrackRecorder();
    expect(recordPhysicsStep(rec, body, { speedKmh: 12 })).toBe(true);
    expect(rec.stepCount).toBe(1);
    expect(rec.contactsAtStep(1)).toEqual([]);
  });

  it("contacts are recorded AFTER the step's record: the step number is the step just taken", () => {
    const rec = new PlayerStepTrackRecorder();
    const seen: number[] = [];
    const sim = {
      speedKmh: 0,
      forEachChassisContact(f: (r: Reading) => void) {
        seen.push(rec.stepCount);
        if (rec.stepCount === 4) f(wall(2));
      },
    };
    for (let i = 0; i < 5; i++) recordPhysicsStep(rec, body, sim);
    expect(seen).toEqual([1, 2, 3, 4, 5]);
    expect(rec.contactsAtStep(4).length).toBe(1);
  });
});
