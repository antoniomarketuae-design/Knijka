/**
 * TWO WRECKS, ONE BILL — THE PER-BODY FIX THAT WAS INERT WHERE STUDENTS DRIVE.
 *
 * The rule engine keys its contact episode on the BODY, so that a student who
 * hits two cars is told he hit two. That fix was proved on the trace recorder
 * and on nothing else: the live rapier handler reached
 * `runtime.pushCollision(withWhat)` — the runtime declared no id parameter at
 * all — so every browser contact arrived ANONYMOUS and the per-body key fell
 * back to the per-KIND latch it was written to replace.
 *
 * MEASURED on the shipped reducer with live-shaped input, before any of this
 * existed (fixture ticks at 45.9 км/ч, «Пътнотранспортно произшествие» rows
 * counted off the debrief):
 *
 *   two ANONYMOUS vehicle reports 1.0 s apart ……………………… 1 bill  ← the defect
 *   the same two, NAMED wreck-a / wreck-b …………………………………… 2 bills
 *   NAMED-a, then one ANONYMOUS, then NAMED-b at 2.0 s …… 1 bill  ← see the
 *                                                                   residue row
 *   thirteen NAMED reports on ONE body across 6 s …………………… 1 bill
 *   a clean drive …………………………………………………………………………………… 0
 *
 * So the fix is: NAME THE BODY, at the only place that knows — and name it with
 * the SENTINEL'S OWN id, because two different names for one body bill twice.
 *
 * These drives run the production chain end to end: the naming helpers this
 * file exports from `LessonScene`, into `createWorldRuntime().pushCollision`,
 * into `sample()`, into `reduceTick`. Every assertion is paired with the drive
 * that must NOT convict, and the two-body case carries its own mutation — the
 * identical drive reported ANONYMOUSLY, which is the code as it shipped, and
 * which must still bill one.
 *
 * The physics layer is stood in for by the reporter contract the engine's
 * `collision` case states: contact is reported on every frame the bodies
 * overlap. Nothing here invents a contact — the overlap is the same
 * sim/collision geometry the director's sentinel grades with.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  hittableObstacleBodies,
  liveContactBodies,
  nameLiveContact,
  type LiveContactBody,
} from "../LessonScene";
import type { VehicleSample } from "@/modules/sim/contracts";
import {
  isContact,
  obbDiscSeparationM,
  obbSeparationM,
  playerObb,
  type ActorPose,
  type Obb2D,
} from "@/modules/sim/collision";
import { createRuleEngine, reduceTick, type RuleEvent } from "@/modules/sim/rules";
import { createWorldRuntime } from "@/modules/sim/runtime";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../..");
/** fo-follow-v1: one straight 360 m street; 4.06 = the northbound lane centre. */
const DISTRICT = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "fo-follow-v1.json"), "utf-8"),
) as unknown;
const LANE_X = 4.06;

// ---------------------------------------------------------------------------
// The drive
// ---------------------------------------------------------------------------

const DT = 1 / 60;

function vehicleSample(x: number, y: number, speedKmh: number): VehicleSample {
  return {
    position: { x, y },
    headingDeg: 0,
    speedKmh,
    indicator: "off",
    headlights: "off",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 3,
    mirrorGlance: null,
  };
}

/** Does any body of this category overlap the player? — the frame on which the
 *  physics layer would report a contact (contact is a STATE, reported while it
 *  lasts: the reporter contract engine.ts's `collision` case is written to). */
function anyOverlap(player: Obb2D, bodies: readonly LiveContactBody[]): boolean {
  for (const b of bodies) {
    if (b.withWhat !== "vehicle") continue;
    const sepM =
      b.disc !== undefined
        ? obbDiscSeparationM(player, b.disc.x, b.disc.y, b.disc.radiusM)
        : obbSeparationM(player, b.box as Obb2D);
    if (isContact(sepM)) return true;
  }
  return false;
}

interface DriveOpts {
  /** m travelled per frame is derived from this. */
  speedKmh: number;
  y0: number;
  frames: number;
  /** THE MUTATION SWITCH: false = report exactly as the code shipped, with no
   *  name at all. Every two-body assertion below is paired against it. */
  named?: boolean;
}

/** Drive the lane north through `bodies`, reporting contact while overlapped,
 *  and count the «Пътнотранспортно произшествие» rows the reducer bills. */
function collisionBills(bodies: readonly LiveContactBody[], opts: DriveOpts): number {
  const rt = createWorldRuntime(DISTRICT);
  let engine = createRuleEngine();
  const events: RuleEvent[] = [];
  const stepM = (opts.speedKmh / 3.6) * DT;
  let t = 0;
  for (let i = 0; i < opts.frames; i++) {
    const y = opts.y0 + i * stepM;
    const player = playerObb(LANE_X, y, 0);
    if (anyOverlap(player, bodies)) {
      rt.pushCollision(
        "vehicle",
        opts.named === false ? undefined : nameLiveContact("vehicle", player, bodies),
      );
    }
    t += DT;
    rt.update(DT);
    const res = reduceTick(engine, rt.sample(vehicleSample(LANE_X, y, opts.speedKmh), t, false));
    engine = res.state;
    events.push(...res.events);
  }
  return events.filter((e) => e.kind === "violation" && e.code === "COLLISION").length;
}

/** Parked bodies in the lane, as `hittableObstacleBodies` builds them. */
const wrecks = (...ys: number[]): LiveContactBody[] =>
  hittableObstacleBodies(ys.map((y) => ({ kind: "vehicle" as const, x: LANE_X, y, headingDeg: 0 })));

/** …and the same, centred on the origin, for the naming unit tests below. */
const atOrigin = (...ys: number[]): LiveContactBody[] =>
  hittableObstacleBodies(ys.map((y) => ({ kind: "vehicle" as const, x: 0, y, headingDeg: 0 })));

// ---------------------------------------------------------------------------
// The four proofs
// ---------------------------------------------------------------------------

describe("the live contact channel names the body it hit", () => {
  it("TWO bodies struck seconds apart bill TWO — anonymously the same drive bills ONE", () => {
    // The sc-hz-accident-scene tableau's own spacing: two wrecks 12 m apart
    // (y = 150 and y = 162), taken at 46 км/ч. Both touch distances are
    // 2.02 + 2.10 = 4.12 m, so the overlap windows are y ∈ [145.88, 154.12] and
    // y ∈ [157.88, 166.12] — 3.76 m of daylight between them, which at 12.78 m/s
    // is 0.29 s of silence, well INSIDE collisionSeparationSec (1.2 s). That is
    // the whole trap. Travel between the two clears COLLISION_REOPEN_TRAVEL_M
    // (3.76 m against a 2 m floor), so every conjunct but the episode KEY is
    // satisfied and the key alone decides how many accidents this was.
    const bodies = wrecks(150, 162);
    const drive: DriveOpts = { speedKmh: 46, y0: 130, frames: 300 };
    expect(collisionBills(bodies, drive)).toBe(2);
    // THE MUTATION — the identical drive, reported without a name. This is the
    // code exactly as it shipped, and it is what makes the assertion above a
    // real one: the second wrecked car cost the student nothing.
    expect(collisionBills(bodies, { ...drive, named: false })).toBe(1);
  });

  it("ONE body, one long shunt, bills ONE however long it lasts", () => {
    // 120 frames of unbroken overlap at a crawl — the shape that once billed
    // 130-140 точки against an allowance of 9. Naming must not touch it: every
    // frame resolves to the SAME id, so it is one episode, still open.
    const bodies = wrecks(150);
    expect(collisionBills(bodies, { speedKmh: 4, y0: 148.5, frames: 120 })).toBe(1);
    // …and at speed, where the overlap is short, it is still one.
    expect(collisionBills(bodies, { speedKmh: 46, y0: 130, frames: 300 })).toBe(1);
  });

  it("a clean drive down the same street bills NOTHING", () => {
    expect(collisionBills([], { speedKmh: 46, y0: 130, frames: 300 })).toBe(0);
    // …and a body parked clear of the lane is passed, not hit.
    const aside = hittableObstacleBodies([
      { kind: "vehicle", x: LANE_X + 6, y: 150, headingDeg: 0 },
    ]);
    expect(collisionBills(aside, { speedKmh: 46, y0: 130, frames: 300 })).toBe(0);
  });

  it("a STAGED body and an obstacle, same 0.29 s gap, bill TWO — the live interleave", () => {
    // The normal configuration, and the one the refutation named: the director
    // owns a NAMED ContactSentinel while the rapier handler used to be
    // anonymous, so both channels are live in the same scene. With the rapier
    // side named from the sentinel's OWN cast, the two reporters share one
    // vocabulary and two victims read as two. Same spacing as the wreck pair
    // above — the staged car at y = 150, the parked one at y = 162.
    const staged = liveContactBodies(
      [{ actorId: "sc-fs-lead", withWhat: "vehicle", body: "box" }],
      (id) => (id === "sc-fs-lead" ? ({ x: LANE_X, y: 150, dirX: 0, dirY: 1 } as ActorPose) : null),
      wrecks(162),
    );
    expect(staged).toHaveLength(2);
    expect(collisionBills(staged, { speedKmh: 46, y0: 130, frames: 300 })).toBe(2);
    // THE MUTATION: strip the names and the staged actor's crash is free.
    expect(collisionBills(staged, { speedKmh: 46, y0: 130, frames: 300, named: false })).toBe(1);
  });

  it("ONE staged body reported by BOTH live channels bills ONCE, not twice", () => {
    // The catastrophic direction, and the reason the physics side reuses the
    // sentinel's id instead of minting one. On a browser drive the sentinel
    // reports a staged body every frame it is inside of, and rapier reports the
    // same contact through this handler. Same name = one episode = one
    // accident. A DIFFERENT name — the shell tag's numeric `npcId` is the
    // obvious candidate, and it is what a naive routing of that tag would
    // supply — makes it two, which is 90 наказателни точки for one crash.
    const cast = [{ actorId: "sc-fs-lead", withWhat: "vehicle" as const, body: "box" as const }];
    const pose = () => ({ x: LANE_X, y: 150, dirX: 0, dirY: 1 }) as ActorPose;

    /** Both channels report the same staged body; `rapierName` is theirs. */
    function billsWhenRapierSays(rapierName: (n: string | undefined) => string | undefined): number {
      const rt = createWorldRuntime(DISTRICT);
      let engine = createRuleEngine();
      const events: RuleEvent[] = [];
      const stepM = (10 / 3.6) * DT;
      for (let i = 0; i < 200; i++) {
        const y = 146 + i * stepM;
        const player = playerObb(LANE_X, y, 0);
        const bodies = liveContactBodies(cast, pose, []);
        const touching = anyOverlap(player, bodies);
        // The rapier channel…
        if (touching) {
          rt.pushCollision("vehicle", rapierName(nameLiveContact("vehicle", player, bodies)));
        }
        rt.update(DT);
        const tick = rt.sample(vehicleSample(LANE_X, y, 10), (i + 1) * DT, false);
        // …and the sentinel's own report, into the same tick, exactly as the
        // director appends it in LessonScene's frame loop.
        if (touching) {
          tick.events.push({ kind: "collision", withWhat: "vehicle", actorId: "sc-fs-lead" });
        }
        const res = reduceTick(engine, tick);
        engine = res.state;
        events.push(...res.events);
      }
      return events.filter((e) => e.kind === "violation" && e.code === "COLLISION").length;
    }

    expect(billsWhenRapierSays((n) => n)).toBe(1);
    // THE MUTATION, and the measurement the design rests on: give the SAME body
    // a second name — `npc:1000`, which is literally what the shell tag carries
    // — and one crash is billed as two.
    expect(billsWhenRapierSays(() => "npc:1000")).toBe(2);
  });

  it("RESIDUE, NOT MINE: one anonymous report still absorbs a later named body", () => {
    // engine.ts's `collision` case writes an episode under the REPORT's own key
    // even when that report was absorbed by another episode, so a single
    // anonymous vehicle report leaves a `kind:vehicle` latch behind that
    // swallows the next NAMED body — measured at 1 bill for named-a @0 s,
    // anonymous @1.0 s, named-b @2.0 s, with named-b a full 0.8 s OUTSIDE
    // collisionSeparationSec.
    //
    // That is why this lane names the live channel at its SOURCE rather than
    // teaching the engine to tell named from anonymous: with no anonymous
    // vehicle report in the live stream there is no stepping stone to lay. The
    // remaining anonymous reporters are the authored trace beats, and closing
    // them is engine.ts's lane — when it lands, this row becomes 2.
    const rt = createWorldRuntime(DISTRICT);
    let engine = createRuleEngine();
    const events: RuleEvent[] = [];
    const stepM = (46 / 3.6) * DT;
    for (let i = 0; i < 300; i++) {
      const y = 130 + i * stepM;
      if (i === 0) rt.pushCollision("vehicle", "wreck-a");
      if (i === 60) rt.pushCollision("vehicle");
      if (i === 120) rt.pushCollision("vehicle", "wreck-b");
      rt.update(DT);
      const res = reduceTick(engine, rt.sample(vehicleSample(LANE_X, y, 46), (i + 1) * DT, false));
      engine = res.state;
      events.push(...res.events);
    }
    const bills = events.filter((e) => e.kind === "violation" && e.code === "COLLISION").length;
    expect(bills).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The naming itself
// ---------------------------------------------------------------------------

describe("nameLiveContact", () => {
  const player = playerObb(0, 0, 0);

  it("names the one body it is inside of", () => {
    expect(nameLiveContact("vehicle", player, atOrigin(1))).toBe("obstacle:0");
  });

  it("names NOTHING when two bodies of the kind overlap at once", () => {
    // Wedged between two cars: a name would be a coin toss, and a name that
    // flickers between two bodies during ONE contact bills it twice — the
    // catastrophe this whole mechanism exists to prevent. Refusing falls back
    // to the shipped per-category behaviour, which errs toward one bill (A12).
    expect(nameLiveContact("vehicle", player, atOrigin(1))).toBe("obstacle:0");
    expect(nameLiveContact("vehicle", player, atOrigin(1, -1))).toBeUndefined();
  });

  it("names nothing for staticObject, whatever is standing there", () => {
    // Walls, kerbs and world meshes have no identity anywhere in the product.
    // Keeping them per-category is what holds the wall-scrape and guardrail
    // pins at one bill for one scrape.
    expect(nameLiveContact("staticObject", player, atOrigin(1))).toBeUndefined();
  });

  it("does not cross categories — a pedestrian report never names a car", () => {
    expect(nameLiveContact("pedestrian", player, atOrigin(1))).toBeUndefined();
  });

  it("names a pedestrian off the DISC body, not a box", () => {
    const walker = liveContactBodies(
      [{ actorId: "sc-mfp-walker", withWhat: "pedestrian", body: "disc" }],
      () => ({ x: 0.3, y: 0, dirX: 0, dirY: 1 }) as ActorPose,
      [],
    );
    expect(nameLiveContact("pedestrian", player, walker)).toBe("sc-mfp-walker");
    // …and one standing well clear is not under the wheels.
    const clear = liveContactBodies(
      [{ actorId: "sc-mfp-walker", withWhat: "pedestrian", body: "disc" }],
      () => ({ x: 6, y: 0, dirX: 0, dirY: 1 }) as ActorPose,
      [],
    );
    expect(nameLiveContact("pedestrian", player, clear)).toBeUndefined();
  });
});

describe("the candidate bodies", () => {
  it("`visual: true` obstacles are NOT candidates — they mount no collider", () => {
    // ScenarioObstacles renders them through the same instanced pass and mounts
    // no body (a purely visual car must not add a crash surface the grading
    // never authored), so rapier can never have reported one. The index still
    // counts it, so these ids line up with the shell tags the renderer writes.
    const bodies = hittableObstacleBodies([
      { kind: "vehicle", x: 0, y: 0, headingDeg: 0, visual: true },
      { kind: "vehicle", x: 0, y: 20, headingDeg: 0 },
      { kind: "prop", prop: "cone", x: 0, y: 40, headingDeg: 0 },
      { kind: "vehicle", x: 0, y: 60, headingDeg: 0 },
    ]);
    expect(bodies.map((b) => b.id)).toEqual(["obstacle:1", "obstacle:2"]);
  });

  it("a staged actor with no body in the world is not a candidate", () => {
    // The sentinel's own rule: no actor = nothing to have been inside of.
    expect(
      liveContactBodies(
        [{ actorId: "gone", withWhat: "vehicle", body: "box" }],
        () => null,
        [],
      ),
    ).toEqual([]);
  });

  it("a staged candidate carries the SENTINEL'S id, never one of its own", () => {
    // The load-bearing half: an id minted here (the shell tag's numeric npcId,
    // say) would be a SECOND name for a body the sentinel already names, and
    // two names for one body bill twice.
    const bodies = liveContactBodies(
      [{ actorId: "sc-rbg-follower", withWhat: "vehicle", body: "box" }],
      () => ({ x: 0, y: 0, dirX: 0, dirY: 1 }) as ActorPose,
      [],
    );
    expect(bodies.map((b) => b.id)).toEqual(["sc-rbg-follower"]);
  });
});
