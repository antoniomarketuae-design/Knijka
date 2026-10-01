/**
 * «BILL THE FORCED BRAKING» — founder ruling 2026-09-30, the rule engine's half
 * (sc-merge-lane-end:0487bcec round 3).
 *
 * „A cut-in so close that the vehicle already in the lane the student enters
 * must brake hard IS the lane-drop lesson's own push-out mistake («Изтласкване
 * на кола от съседната лента»), billed even with NO contact (ЗДвП чл. 25,
 * ал. 2 …). Early, correct merges are never hit and never billed."
 *
 * The runtime publishes the measurement (`laneEntered` → LaneEntryFollower,
 * runtime/__tests__/lane-entry.test.ts); this file pins the judgement:
 *   · it is OFF unless a lesson arms it (`laneEntryForcedBrakingEnabled`);
 *   · armed, it bills LANE_ENTRY_FORCED_BRAKING exactly when the deceleration
 *     the entry demands of the follower is ABOVE the product's own harsh-braking
 *     line (`harshBrakeDecelMps2`, exclusive — a tie acquits, as it does for the
 *     student's own braking), and never without a follower;
 *   · the card is TRUE for a cut-in: it cites чл. 25, ал. 2 as RETRIEVED from
 *     content/law/acts/zdvp.json, and it is not the forward-collision copy
 *     («…колкото ти е трябвал, за да спреш»), which round 2's verifier (F8)
 *     showed is false for a car that is struck from behind after a cut-in;
 *   · a contact that follows a billed cut-in reads the cut-in copy too, not the
 *     forward-collision one — and one that does not, keeps its old copy;
 *   · the charge is опасна under Наредба № 38 case 5 with MEASURED evidence,
 *     so the existing machinery grades it as it grades every опасна lesson
 *     mistake (always-grade; not an ADR-009 target — `lessonMistakeTargets.ts`).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COLLISION_CONTACT_COPY, VIOLATIONS } from "../catalog";
import { DEFAULT_RULE_CONFIG } from "../types";
import type { LaneEntryFollower, RuleEvent, SimTickEvent, ViolationEvent } from "../types";
import { N38_BASIS } from "../n38";
import { drive, tick } from "./fixtures";
import { reduceTick } from "../engine";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

const ARMED = { laneEntryForcedBrakingEnabled: true } as const;

function follower(forcedDecelMps2: number, over: Partial<LaneEntryFollower> = {}): LaneEntryFollower {
  return { vehicleId: 3, gapM: 4, closingMps: 4, speedMps: 13.9, reactionSec: 1, forcedDecelMps2, ...over };
}
const entered = (f: LaneEntryFollower | null): SimTickEvent => ({ kind: "laneEntered", laneId: 1, follower: f });
const moving = (t: number, events: SimTickEvent[] = []) =>
  tick(t, { speedKmh: 35, gear: 3, laneId: 1, events });
const bills = (ev: RuleEvent[]) =>
  ev.filter((e): e is ViolationEvent => e.kind === "violation" && e.code === "LANE_ENTRY_FORCED_BRAKING");

describe("the judgement", () => {
  it("is OFF by default — an unarmed lesson never bills it, whatever the entry demanded", () => {
    expect(DEFAULT_RULE_CONFIG.laneEntryForcedBrakingEnabled).toBe(false);
    const { events } = drive([moving(1), moving(1.1, [entered(follower(80))]), moving(1.2)]);
    expect(bills(events)).toEqual([]);
  });

  it("armed: a demand above the harsh-braking line bills ONE опасна at the entry frame", () => {
    const { events } = drive([moving(1), moving(1.1, [entered(follower(7.5))]), moving(1.2), moving(5)], ARMED);
    const b = bills(events);
    expect(b.length).toBe(1);
    expect(b[0].t).toBeCloseTo(1.1, 9);
    expect(b[0].severityClass).toBe("opasna");
    expect(b[0].points).toBe(10);
  });

  it("the line is the product's own harsh-braking line, and it is exclusive (a tie acquits)", () => {
    const line = DEFAULT_RULE_CONFIG.harshBrakeDecelMps2;
    expect(line).toBe(7);
    for (const [demand, n] of [[line, 0], [line - 0.01, 0], [line + 0.01, 1], [80, 1]] as const) {
      const { events } = drive([moving(1), moving(1.1, [entered(follower(demand))])], ARMED);
      expect(bills(events).length, `demand ${demand}`).toBe(n);
    }
    // …and it follows the configured line, not a second copy of the number
    const { events } = drive([moving(1), moving(1.1, [entered(follower(6))])], { ...ARMED, harshBrakeDecelMps2: 5 });
    expect(bills(events).length).toBe(1);
  });

  it("no follower, no bill — an entry into an empty lane is what the lesson teaches", () => {
    const { events } = drive([moving(1), moving(1.1, [entered(null)]), moving(2)], ARMED);
    expect(bills(events)).toEqual([]);
  });

  it("two genuine entries are two acts (the runtime publishes one event per entry)", () => {
    const { events } = drive(
      [moving(1), moving(1.1, [entered(follower(20))]), moving(4), moving(6, [entered(follower(20))]), moving(7)],
      ARMED,
    );
    expect(bills(events).map((e) => e.t)).toEqual([1.1, 6]);
  });

  it("ROUND 4: ONE cut-in is ONE act — a body that flickers back over the line in front of the SAME car while that car is still answering the first cut-in is not billed again", () => {
    // Since round 4 the runtime has no lane-switch deadband (a body wholly back
    // in his own lane has left — F3), so a student riding the line in front of
    // a car publishes an entry per crossing. The car is answering ONE cut-in
    // for its reaction plus its own hard stop (1 s + 13.9/7 s ≈ 2.99 s here);
    // crossings inside that are the same act.
    const flicker = drive(
      [
        moving(1),
        moving(1.1, [entered(follower(40))]),
        moving(1.5, [entered(follower(60))]),
        moving(2.9, [entered(follower(100))]),
        moving(4.05, [entered(follower(100))]), // 1.1 + 2.986 = 4.086: still inside
        moving(5),
      ],
      ARMED,
    );
    expect(bills(flicker.events).map((e) => e.t)).toEqual([1.1]);
    // after the car's react-and-stop time it is a new act
    const later = drive([moving(1), moving(1.1, [entered(follower(40))]), moving(4.2, [entered(follower(40))])], ARMED);
    expect(bills(later.events).map((e) => e.t)).toEqual([1.1, 4.2]);
    // in front of a DIFFERENT car it is a new act at once
    const other = drive(
      [moving(1), moving(1.1, [entered(follower(40))]), moving(1.5, [entered(follower(40, { vehicleId: 9 }))])],
      ARMED,
    );
    expect(bills(other.events).map((e) => e.t)).toEqual([1.1, 1.5]);
    // and an UNFORCED crossing in between neither bills nor restarts anything
    const mixed = drive(
      [moving(1), moving(1.1, [entered(follower(40))]), moving(2, [entered(follower(3))]), moving(4.2, [entered(follower(40))])],
      ARMED,
    );
    expect(bills(mixed.events).map((e) => e.t)).toEqual([1.1, 4.2]);
  });

  it("ROUND 4: the act table is the reducer's own — reducing the SAME state twice bills twice (it never writes into the caller's state)", () => {
    const { state } = drive([moving(1)], ARMED);
    const frame = moving(1.1, [entered(follower(40))]);
    const first = reduceTick(state, frame);
    const second = reduceTick(state, frame);
    expect(bills(first.events).length).toBe(1);
    expect(bills(second.events).length).toBe(1);
    expect(state.cutInActUntil).toEqual({});
    expect(first.state.cutInActUntil).not.toBe(state.cutInActUntil);
  });

  it("ROUND 4: the same-act window is the car's own — its reaction plus its own hard stop from ITS speed at the billed entry", () => {
    // a slow car (5 m/s): 1 + 5/7 ≈ 1.71 s; a crossing at +1.6 s is the same act, at +1.8 s a new one
    const slow = (_t: number) => entered(follower(40, { speedMps: 5 }));
    expect(bills(drive([moving(1), moving(1.1, [slow(1.1)]), moving(2.7, [slow(2.7)])], ARMED).events).map((e) => e.t)).toEqual([1.1]);
    expect(bills(drive([moving(1), moving(1.1, [slow(1.1)]), moving(2.9, [slow(2.9)])], ARMED).events).map((e) => e.t)).toEqual([1.1, 2.9]);
  });
});

describe("the card", () => {
  const row = VIOLATIONS.LANE_ENTRY_FORCED_BRAKING;
  const zdvp = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "law", "acts", "zdvp.json"), "utf-8")) as {
    units: { ref: string; textBg: string }[];
  };
  const art25 = zdvp.units.find((u) => u.ref === "чл. 25")!;

  it("cites чл. 25, ал. 2 — and the retrieved article really says what the card relies on", () => {
    expect(row.lawRef).toBe("ЗДвП чл. 25, ал. 2");
    expect(art25.textBg).toContain(
      "(2) При извършване на маневра, която е свързана с навлизане изцяло или частично в съседна пътна лента, водачът е длъжен да пропусне пътните превозни средства, които се движат по нея.",
    );
  });

  it("is опасна, 10 points, not session-terminating (no contact happened)", () => {
    expect(row.severityClass).toBe("opasna");
    expect(row.points).toBe(10);
    expect(row.terminateSession ?? false).toBe(false);
  });

  it("explains the cut-in (THEO-4) — and is not the forward-collision copy", () => {
    for (const text of [row.titleBg, row.explanationBg, row.correctiveBg ?? "", row.peekBg ?? ""]) {
      expect(text).not.toMatch(/колкото ти е трябвал/);
      expect(text).not.toMatch(/за да спреш/);
    }
    // it names the act and the duty, not a bare verdict
    expect(row.explanationBg).toMatch(/лент/);
    expect(row.explanationBg).toMatch(/спир/);
    expect(row.explanationBg.length).toBeGreaterThan(120);
    expect(row.correctiveBg ?? "").toMatch(/огледал/);
  });

  it("Наредба № 38: case 5 («предпоставка за ПТП»), grounded on a MEASURED conflict", () => {
    const b = N38_BASIS.LANE_ENTRY_FORCED_BRAKING;
    expect(b.clause).toBe("в");
    expect(b.opasnaCase).toBe("accidentPrecondition");
    expect(b.conflictEvidence).toBe("measured");
  });
});

describe("a contact after a billed cut-in reads as the cut-in it was", () => {
  const crash: SimTickEvent = { kind: "collision", withWhat: "vehicle" };
  const collisions = (ev: RuleEvent[]) =>
    ev.filter((e): e is ViolationEvent => e.kind === "violation" && e.code === "COLLISION");

  it("inside the follower's react-and-stop time: the cut-in copy, not «…колкото ти е трябвал, за да спреш»", () => {
    const { events } = drive([moving(1), moving(1.1, [entered(follower(40))]), moving(2.0, [crash])], ARMED);
    const c = collisions(events);
    expect(c.length).toBe(1);
    expect(c[0].detail).toBe("vehicleCutIn");
    expect(c[0].explanationBg).toBe(COLLISION_CONTACT_COPY.vehicleCutIn.explanationBg);
    expect(c[0].explanationBg).not.toMatch(/колкото ти е трябвал/);
    expect(c[0].titleBg).toBe(COLLISION_CONTACT_COPY.vehicleCutIn.titleBg);
  });

  it("the window is the follower's reaction plus its hard stop from its own speed — a later contact keeps the old copy", () => {
    // 13.9 m/s at the 7 m/s² line after 1 s of reaction: ≈ 2.99 s.
    const inside = drive([moving(1), moving(1.1, [entered(follower(40))]), moving(3.9, [crash])], ARMED);
    expect(collisions(inside.events)[0].detail).toBe("vehicleCutIn");
    const after = drive([moving(1), moving(1.1, [entered(follower(40))]), moving(4.3, [crash])], ARMED);
    expect(collisions(after.events)[0].detail).toBe("vehicle");
  });

  it("ROUND 4: a forced re-crossing that is the same act (not billed again) still keeps the contact that follows it the cut-in it is", () => {
    // billed at 1.1 (window to ≈ 4.09), re-crossed forced at 3.5 (not billed —
    // same act), contact at 5.0: inside the re-crossing's own react-and-stop
    // time (3.5 + 2.99), so it reads the cut-in copy
    const { events } = drive(
      [moving(1), moving(1.1, [entered(follower(40))]), moving(3.5, [entered(follower(40))]), moving(5.0, [crash])],
      ARMED,
    );
    expect(bills(events).map((e) => e.t)).toEqual([1.1]);
    expect(collisions(events)[0].detail).toBe("vehicleCutIn");
  });

  it("an entry that was NOT a forced cut-in leaves a later contact's copy alone", () => {
    const { events } = drive([moving(1), moving(1.1, [entered(follower(2))]), moving(1.5, [crash])], ARMED);
    expect(collisions(events)[0].detail).toBe("vehicle");
  });

  it("only a VEHICLE contact is re-labelled — a person or a wall struck after a cut-in keeps its own card", () => {
    for (const withWhat of ["pedestrian", "cyclist", "staticObject"] as const) {
      const { events } = drive([moving(1), moving(1.1, [entered(follower(40))]), moving(1.5, [{ kind: "collision", withWhat }])], ARMED);
      expect(collisions(events)[0].detail, withWhat).toBe(withWhat);
    }
  });

  it("an unarmed lesson never re-labels a contact", () => {
    const { events } = drive([moving(1), moving(1.1, [entered(follower(40))]), moving(1.5, [crash])]);
    expect(collisions(events)[0].detail).toBe("vehicle");
  });

  it("the cut-in contact copy is true for a cut-in and does not claim who struck whom", () => {
    const c = COLLISION_CONTACT_COPY.vehicleCutIn;
    expect(c.explanationBg).not.toMatch(/колкото ти е трябвал/);
    expect(c.explanationBg).toMatch(/лент/);
    expect(c.peekBg.length).toBeLessThanOrEqual(40);
  });
});
