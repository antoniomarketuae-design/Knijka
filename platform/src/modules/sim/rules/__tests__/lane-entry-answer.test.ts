/**
 * THE SECOND BASIS OF «BILL THE FORCED BRAKING» — what the vehicle he came in
 * front of ACTUALLY DID (sc-ac-wind-truck-pass:ff1d4290 round 2).
 *
 * THE FINDING (round-1 verifier, F-01). The truck-pass crosswind lesson was
 * restaged so the truck holds its own 40 км/ч and is really passed. A student
 * who then pulled back in 3.0–6.5 m ahead of the truck's bumper made it brake
 * from 40 to 19.5–26.7 км/ч at 8 m/s² — and the product credited the return
 * about a second later (the 10 m gap opened BECAUSE the truck braked), praised
 * the lane change («…в правилния ред и навреме. Отлично.»), billed 0 т. and
 * passed the lesson 3/3 at every rung.
 *
 * THE FOUNDER HAS RULED THIS CLASS TWICE — 2026-09-30 «a lane-drop cut-in
 * forcing hard braking IS the push-out» and 2026-10-05 «bill it only when a …
 * car actually has to brake or swerve because of the entry, or there is
 * contact» — and the integrator's decision of 2026-10-08, under his delegation,
 * is that the return is billed with the lane-drop lessons' own code,
 * LANE_ENTRY_FORCED_BRAKING, „measured on the truck's own traffic-model
 * account".
 *
 * WHY A SECOND EVENT. `laneEntered` carries what the entry DEMANDS of a vehicle
 * that is catching him, and that is 0 by construction when he is the faster of
 * the two. The staged runner that owns the overtaken vehicle publishes
 * `laneEntryAnswer` instead: `watching` while its answer is not yet known,
 * `clear` when it did not have to brake, `braked` with the speed its own
 * account says it shed because of him and the hardest deceleration it shed it
 * at. This file pins the JUDGEMENT, which is `laneEntered`'s word for word
 * (armed per lesson, hard = over `harshBrakeDecelMps2`, exclusive; one cut-in,
 * one act, per vehicle; a contact inside the answering time reads as the
 * cut-in's tail) — and the two things the finding adds: the bill names the act
 * it is, and the lane change that was the entry is NOT PRAISED.
 *
 * ROUND 3 (round-2 verifier, F2-02; the integrator's decision D2). «Hard» was
 * one frame of the account over 7 m/s², so a 50 ms touch of the truck's guard
 * that cost it 1.44 км/ч was billed 10 т. under «…трябваше да спира рязко».
 * Now it is the WHOLE harsh-brake rule — over `harshBrakeDecelMps2` for
 * `harshBrakeSustainSec`, mean exclusive (`harshBrakeEpisode.ts
 * isHarshBrakeWindow`) — re-checked here on the window the runner hands over.
 * And a vehicle that only gave way (`lift`, or a `braked` this config does not
 * find hard) is not billed AS FORCED BRAKING — it is billed with the product's
 * own line for exactly that act, OVERTAKE_RETURN_TOO_EARLY (doc 72 OV-09,
 * основна, «…и го принуди да намали»), on a lesson that armed the rule — and
 * the lane change is not praised either way: «навреме» is not true of it.
 *
 * (The measurement — what the runner publishes, off the real traffic system —
 * is `orchestrator/__tests__/overtake-return-forced.test.ts`; the live car on
 * the lesson's own stack is `lessons/scenario/__tests__/
 * wind-truck-pass-restage.test.ts` §9.)
 */

import { describe, expect, it } from "vitest";
import { COLLISION_CONTACT_COPY, LANE_ENTRY_ACT_COPY, VIOLATIONS } from "../catalog";
import { reduceTick } from "../engine";
import { DEFAULT_RULE_CONFIG } from "../types";
import type { LaneEntryFollower, RuleEvent, SimTick, SimTickEvent, ViolationEvent } from "../types";
import { drive, tick } from "./fixtures";

const ARMED = { laneEntryForcedBrakingEnabled: true } as const;
const TRUCK = 7;
const TRUCK_MPS = 40 / 3.6;

type Answer = Extract<SimTickEvent, { kind: "laneEntryAnswer" }>;
const watching = (vehicleId = TRUCK): Answer => ({
  kind: "laneEntryAnswer",
  vehicleId,
  phase: "watching",
  shedMps: 0,
  decelMps2: 0,
  heldSec: 0,
  qualifiedSec: 0,
  speedMps: TRUCK_MPS,
  act: "overtakeReturn",
});
const clear = (vehicleId = TRUCK): Answer => ({ ...watching(vehicleId), phase: "clear" });
const lift = (shedMps = 1.2): Answer => ({ ...watching(), phase: "lift", shedMps });
/** A harsh window: `decelMps2` mean held for the sustain (0.4 s) unless overridden. */
const braked = (decelMps2: number, over: Partial<Answer> = {}): Answer => ({
  ...watching(),
  phase: "braked",
  shedMps: decelMps2 * 0.4,
  decelMps2,
  heldSec: 0.4,
  qualifiedSec: 0.4,
  ...over,
});
const glance = (mirror: "left" | "right" | "rear"): SimTickEvent => ({ kind: "mirrorGlance", mirror });

/** A frame of a car on a carriageway the lane ids are comparable on (`edgeId`
 *  present — the live tick source's shape, so lane changes wait out the joint
 *  grace before they are graded, exactly as in the product). */
const moving = (t: number, over: Partial<SimTick> = {}): SimTick =>
  tick(t, { speedKmh: 55, gear: 3, laneId: 2, edgeId: "mw", maxSpeedKmh: 140, ...over });

const bills = (ev: RuleEvent[]) =>
  ev.filter((e): e is ViolationEvent => e.kind === "violation" && e.code === "LANE_ENTRY_FORCED_BRAKING");
const earlies = (ev: RuleEvent[]) =>
  ev.filter((e): e is ViolationEvent => e.kind === "violation" && e.code === "OVERTAKE_RETURN_TOO_EARLY");
const praise = (ev: RuleEvent[]) => ev.filter((e) => e.kind === "commendation" && e.code === "SAFE_LANE_CHANGE");

describe("the judgement of what the vehicle did — `laneEntered`'s own, on the vehicle's own number", () => {
  it("is OFF unless the lesson arms it: a `braked` answer bills nothing on an unarmed lesson", () => {
    const { events } = drive([moving(1), moving(1.1, { events: [watching()] }), moving(1.5, { events: [braked(8)] }), moving(3)]);
    expect(bills(events)).toEqual([]);
  });

  it("armed: a vehicle that braked for him at 8 m/s² is ONE опасна, 10 т., named as the act it is", () => {
    const { events } = drive(
      [moving(1), moving(1.1, { events: [watching()] }), moving(1.5, { events: [braked(8)] }), moving(3), moving(9)],
      ARMED,
    );
    const b = bills(events);
    expect(b).toHaveLength(1);
    expect(b[0]!.t).toBeCloseTo(1.5, 9);
    expect(b[0]!.severityClass).toBe("opasna");
    expect(b[0]!.points).toBe(10);
    // The per-act row, not the lane-drop card: the act travels on `detail`
    // (it crosses the wire, so the server rebuilds the same title).
    expect(b[0]!.detail).toBe("overtakeReturn");
    expect(b[0]!.titleBg).toBe(LANE_ENTRY_ACT_COPY.overtakeReturn.titleBg);
    expect(b[0]!.explanationBg).toBe(LANE_ENTRY_ACT_COPY.overtakeReturn.explanationBg);
    expect(b[0]!.titleBg).not.toBe(VIOLATIONS.LANE_ENTRY_FORCED_BRAKING.titleBg);
    expect(b[0]!.lawRef).toBe(VIOLATIONS.LANE_ENTRY_FORCED_BRAKING.lawRef);
  });

  it("«hard» is the product's own harsh-braking line, exclusive — the tie acquits, and it follows the configured line", () => {
    const line = DEFAULT_RULE_CONFIG.harshBrakeDecelMps2;
    expect(line).toBe(7);
    for (const [decel, n] of [[line, 0], [line - 0.01, 0], [line + 0.01, 1], [8, 1], [0, 0]] as const) {
      const { events } = drive([moving(1), moving(1.1, { events: [watching()] }), moving(1.5, { events: [braked(decel)] })], ARMED);
      expect(bills(events).length, `decel ${decel}`).toBe(n);
    }
    const { events } = drive([moving(1), moving(1.5, { events: [braked(6)] })], { ...ARMED, harshBrakeDecelMps2: 5 });
    expect(bills(events)).toHaveLength(1);
  });

  it("F2-02 — «hard» is HELD for the sustain too (0.4 s, both halves): a 50 ms touch at 8 m/s² is not a bill, an exact 0.4 s is, and it follows the configured sustain", () => {
    const sustain = DEFAULT_RULE_CONFIG.harshBrakeSustainSec;
    expect(sustain).toBe(0.4);
    const cases: Array<[Partial<Answer>, number]> = [
      [{ heldSec: 0.05, qualifiedSec: 0.05 }, 0], // the verifier's blip: 1.44 км/ч in ~50 ms
      [{ heldSec: 0.383, qualifiedSec: 0.4 }, 0],
      [{ heldSec: 0.4, qualifiedSec: 0.383 }, 0],
      [{ heldSec: 24 / 60, qualifiedSec: 24 / 60 }, 1],
      [{ heldSec: 0.39999999999999997, qualifiedSec: 0.39999999999999997 }, 1], // the same tie, summed frame by frame
      [{ heldSec: 0.6, qualifiedSec: 0.6 }, 1],
    ];
    for (const [over, n] of cases) {
      const { events } = drive([moving(1), moving(1.1, { events: [watching()] }), moving(1.5, { events: [braked(8, over)] })], ARMED);
      expect(bills(events).length, JSON.stringify(over)).toBe(n);
    }
    const longer = drive([moving(1), moving(1.5, { events: [braked(8, { heldSec: 0.5, qualifiedSec: 0.5 })] })], { ...ARMED, harshBrakeSustainSec: 0.6 });
    expect(bills(longer.events)).toEqual([]);
  });

  it("a «lift» is never a forced-braking bill; armed, it is the product's own «you came back too soon» — OVERTAKE_RETURN_TOO_EARLY, основна, once, with the runtime tracker's own detail; unarmed, nothing", () => {
    const armed = drive([moving(1), moving(1.1, { events: [watching()] }), moving(3, { events: [lift(2.5)] }), moving(5)], ARMED);
    expect(bills(armed.events)).toEqual([]);
    const e = earlies(armed.events);
    expect(e).toHaveLength(1);
    expect(e[0]!.t).toBeCloseTo(3, 9);
    expect(e[0]!.severityClass).toBe("osnovna");
    expect(e[0]!.detail).toBe("overtake-return");
    expect(e[0]!.titleBg).toBe(VIOLATIONS.OVERTAKE_RETURN_TOO_EARLY.titleBg);
    expect(e[0]!.explanationBg).toBe(VIOLATIONS.OVERTAKE_RETURN_TOO_EARLY.explanationBg);
    expect(e[0]!.lawRef).toBe("ЗДвП чл. 42, ал. 1, т. 2");
    const unarmed = drive([moving(1), moving(1.1, { events: [watching()] }), moving(3, { events: [lift(2.5)] }), moving(5)]);
    expect(unarmed.events.filter((x) => x.kind === "violation")).toEqual([]);
  });

  it("a «braked» this config does not find hard is read as the lift it is: OVERTAKE_RETURN_TOO_EARLY, not forced braking", () => {
    const { events } = drive([moving(1), moving(1.5, { events: [braked(8, { heldSec: 0.05, qualifiedSec: 0.05 })] })], ARMED);
    expect(bills(events)).toEqual([]);
    expect(earlies(events)).toHaveLength(1);
  });

  it("`watching` and `clear` bill nothing, however long the watch is open", () => {
    const frames = [moving(1), moving(1.1, { events: [watching()] })];
    for (let t = 1.2; t < 12; t += 0.5) frames.push(moving(t));
    frames.push(moving(12, { events: [clear()] }), moving(13));
    expect(bills(drive(frames, ARMED).events)).toEqual([]);
  });

  it("one cut-in, one act: a second `braked` for the SAME vehicle inside its own hard stop from the speed it had is not billed again; after it, it is", () => {
    // 40 км/ч at the 7 m/s² line is 1.587 s. No reaction term: it is braking.
    const windowSec = TRUCK_MPS / DEFAULT_RULE_CONFIG.harshBrakeDecelMps2;
    expect(windowSec).toBeCloseTo(1.587, 3);
    const inside = drive([moving(1), moving(2, { events: [braked(8)] }), moving(2 + windowSec - 0.05, { events: [braked(8)] })], ARMED);
    expect(bills(inside.events).map((e) => e.t)).toEqual([2]);
    const after = drive([moving(1), moving(2, { events: [braked(8)] }), moving(2 + windowSec + 0.05, { events: [braked(8)] })], ARMED);
    expect(bills(after.events)).toHaveLength(2);
    // …and in front of ANOTHER vehicle it is a new act at once.
    const other = drive([moving(1), moving(2, { events: [braked(8)] }), moving(2.2, { events: [braked(8, { vehicleId: 11 })] })], ARMED);
    expect(bills(other.events)).toHaveLength(2);
  });

  it("the two bases share ONE act window, keyed by the vehicle's published id: an entry billed on what it DEMANDED is not billed again for what the vehicle then DID", () => {
    const f: LaneEntryFollower = { vehicleId: TRUCK, gapM: 2, closingMps: 3, speedMps: TRUCK_MPS, reactionSec: 1, forcedDecelMps2: 40 };
    const { events } = drive(
      [moving(1), moving(2, { events: [{ kind: "laneEntered", laneId: 1, follower: f }] }), moving(2.4, { events: [braked(8)] }), moving(5)],
      ARMED,
    );
    const b = bills(events);
    expect(b.map((e) => e.t)).toEqual([2]);
    expect(b[0]!.detail).toBeUndefined(); // the lane-drop basis keeps the pooled card
  });

  it("a vehicle contact inside the answering time is the cut-in's tail and reads as one; one after it reads as before", () => {
    const hit = (t: number) => moving(t, { events: [{ kind: "collision", withWhat: "vehicle" } as SimTickEvent] });
    const tail = drive([moving(1), moving(2, { events: [braked(8)] }), hit(3)], ARMED);
    const c = tail.events.find((e) => e.kind === "violation" && e.code === "COLLISION") as ViolationEvent;
    expect(c.titleBg).toBe(COLLISION_CONTACT_COPY.vehicleCutIn.titleBg);
    const late = drive([moving(1), moving(2, { events: [braked(8)] }), hit(4)], ARMED);
    const c2 = late.events.find((e) => e.kind === "violation" && e.code === "COLLISION") as ViolationEvent;
    expect(c2.titleBg).toBe(COLLISION_CONTACT_COPY.vehicle.titleBg);
  });

  it("the reducer writes the watch into its own frame, never into the caller's state", () => {
    const { state } = drive([moving(1)], ARMED);
    const frame = moving(1.1, { events: [watching()] });
    const first = reduceTick(state, frame);
    expect(state.laneEntryWatch).toEqual({});
    expect(first.state.laneEntryWatch).toEqual({ [String(TRUCK)]: true });
    expect(first.state.laneEntryWatch).not.toBe(state.laneEntryWatch);
    const closed = reduceTick(first.state, moving(1.2, { events: [clear()] }));
    expect(closed.state.laneEntryWatch).toEqual({});
    expect(first.state.laneEntryWatch).toEqual({ [String(TRUCK)]: true });
  });
});

describe("the lane change that was the entry is not praised — «…в правилния ред и навреме. Отлично.» has to be true", () => {
  /**
   * A return to the right made by the book — right indicator, right mirror,
   * then the lane id falls from 2 to 1 at t = 10 — on a tick source that
   * carries edge ids, so the grade waits out `laneChangeJointGraceSec` (1.5 s).
   */
  const signalled = [
    moving(8, { indicator: "right", events: [glance("right")] }),
    moving(9, { indicator: "right" }),
  ];
  const crossed = (events: SimTickEvent[] = []) => moving(10, { indicator: "right", laneId: 1, events });
  const onward = (from: number, to: number, events: Record<string, SimTickEvent[]> = {}): SimTick[] => {
    const out: SimTick[] = [];
    for (let t = from; t <= to + 1e-9; t = Math.round((t + 0.1) * 10) / 10) {
      out.push(moving(t, { laneId: 1, events: events[t.toFixed(1)] ?? [] }));
    }
    return out;
  };

  it("control: with nobody behind him the same lane change is praised, stamped with its own time, once the grace has run", () => {
    expect(DEFAULT_RULE_CONFIG.laneChangeJointGraceSec).toBe(1.5);
    const { events } = drive([...signalled, crossed(), ...onward(10.1, 13)], ARMED);
    expect(praise(events).map((e) => e.t)).toEqual([10]);
    expect(events.filter((e) => e.kind === "violation")).toEqual([]);
  });

  it("F-01: the vehicle he came in front of BRAKES HARD half a second later — billed, and the lane change is never praised", () => {
    const { events } = drive(
      [...signalled, crossed([watching()]), ...onward(10.1, 16, { "10.5": [braked(8)] })],
      ARMED,
    );
    expect(bills(events).map((e) => e.t)).toEqual([10.5]);
    expect(praise(events)).toEqual([]);
  });

  it("the praise WAITS for the answer: a watch still open when the grace runs out holds it; `clear` releases it with the lane change's own time", () => {
    const held = drive([...signalled, crossed([watching()]), ...onward(10.1, 14)], ARMED);
    expect(praise(held.events)).toEqual([]);
    const released = drive([...signalled, crossed([watching()]), ...onward(10.1, 16, { "14.0": [clear()] })], ARMED);
    expect(praise(released.events).map((e) => e.t)).toEqual([10]);
    expect(bills(released.events)).toEqual([]);
  });

  it("…and a hard brake that comes AFTER the grace would have run out (a slow drift across the lane) still finds the praise held, and takes it", () => {
    const { events } = drive([...signalled, crossed([watching()]), ...onward(10.1, 16, { "12.4": [braked(8)] })], ARMED);
    expect(bills(events).map((e) => e.t)).toEqual([12.4]);
    expect(praise(events)).toEqual([]);
  });

  it("ROUND 3 (D2): a brake that is not HARD is not a bill — and the vehicle having had to give way, the praise is NOT released («навреме» is false)", () => {
    for (const answer of [braked(6.9), braked(8, { heldSec: 0.05, qualifiedSec: 0.05 }), lift(0.4)]) {
      const { events } = drive([...signalled, crossed([watching()]), ...onward(10.1, 16, { "12.0": [answer] })], ARMED);
      expect(bills(events), answer.phase).toEqual([]);
      expect(earlies(events).map((x) => x.t), answer.phase).toEqual([12]);
      expect(praise(events), answer.phase).toEqual([]);
    }
    // …and the same on a lesson that did not arm the rule: no bill, no praise.
    const unarmed = drive([...signalled, crossed([watching()]), ...onward(10.1, 16, { "12.0": [braked(8)] })]);
    expect(bills(unarmed.events)).toEqual([]);
    expect(praise(unarmed.events)).toEqual([]);
  });

  it("…while a «clear» after the same long watch still releases it, with the lane change's own time", () => {
    const { events } = drive([...signalled, crossed([watching()]), ...onward(10.1, 16, { "12.0": [clear()] })], ARMED);
    expect(praise(events).map((e) => e.t)).toEqual([10]);
  });

  it("the bill can land BEFORE the lane id flips (the lane-drop basis bills on the body's first corner): the lane change made inside the open act is the entry, and is not praised either", () => {
    const f: LaneEntryFollower = { vehicleId: 3, gapM: 2, closingMps: 4, speedMps: 13.9, reactionSec: 1, forcedDecelMps2: 40 };
    const { events } = drive(
      [
        ...signalled,
        moving(9.6, { indicator: "right", events: [{ kind: "laneEntered", laneId: 1, follower: f }] }),
        crossed(),
        ...onward(10.1, 14),
      ],
      ARMED,
    );
    expect(bills(events).map((e) => e.t)).toEqual([9.6]);
    expect(praise(events)).toEqual([]);
  });

  it("a lane change that ends against the watched vehicle's side is not praised — not on the contact, and not when the watch later closes", () => {
    const hit: SimTickEvent = { kind: "collision", withWhat: "vehicle" };
    const { events } = drive(
      [...signalled, crossed([watching()]), ...onward(10.1, 16, { "10.6": [hit], "13.0": [clear()] })],
      ARMED,
    );
    expect(events.filter((e) => e.kind === "violation").map((e) => e.code)).toEqual(["COLLISION"]);
    expect(praise(events)).toEqual([]);
    expect(bills(events)).toEqual([]);
  });

  it("the faults of a lane change are NOT held or dropped: no mirror is billed on its grace whether a watch is open, or the vehicle braked", () => {
    const blind = [moving(8, { indicator: "right" }), moving(9, { indicator: "right" })];
    const open = drive([...blind, crossed([watching()]), ...onward(10.1, 13)], ARMED);
    expect(open.events.filter((e) => e.kind === "violation").map((e) => e.code)).toEqual(["LANE_CHANGE_WITHOUT_MIRROR_CHECK"]);
    const forced = drive([...blind, crossed([watching()]), ...onward(10.1, 13, { "10.5": [braked(8)] })], ARMED);
    expect(forced.events.filter((e) => e.kind === "violation").map((e) => e.code).sort()).toEqual([
      "LANE_CHANGE_WITHOUT_MIRROR_CHECK",
      "LANE_ENTRY_FORCED_BRAKING",
    ]);
  });

  it("the EARLIER lane change — the pull-out, graded long before — keeps its praise", () => {
    const { events } = drive(
      [
        moving(1, { laneId: 1, indicator: "left", events: [glance("left")] }),
        moving(2, { laneId: 2, indicator: "left" }),
        ...[3, 4, 5, 6, 7].map((t) => moving(t, { indicator: "left" })),
        ...signalled,
        crossed([watching()]),
        ...onward(10.1, 14, { "10.5": [braked(8)] }),
      ],
      ARMED,
    );
    expect(praise(events).map((e) => e.t)).toEqual([2]);
    expect(bills(events)).toHaveLength(1);
  });
});
