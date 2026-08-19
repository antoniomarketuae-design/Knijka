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
 * overlap.
 *
 * ── 2026-08-19 · AND THE REPORTER USED TO BE THE GRADER ────────────────────
 *
 * Every drive below used to decide „is the physics layer reporting?" by asking
 * whether the player overlapped a CANDIDATE BODY — the very box
 * `nameLiveContact` tests. An instrument built that way cannot fail: it reports
 * only contacts the grader can already name, so a naming function that could
 * not name a single cyclist in the product read as perfect here. It is the
 * house failure exactly — a probe that lies in the reassuring direction.
 *
 * The reporter now fires off the COLLIDERS: the kinematic shell NpcColliders
 * binds to every `traffic.vehicles` agent, and the per-model tight cuboid
 * ScenarioObstacles measures off each loaded rig. Those are DIFFERENT SOURCES
 * from the boxes the grader sizes, and the whole defect lives in the gap.
 *
 * ── 2026-08-19 · AND THEN THE COLLIDER MOVED AND THE GRADING BOX DID NOT ───
 *
 * The paragraph above used to say the shell was „0.92 × 2.10 m, one size for
 * the whole fleet", and every helper in this file was written to that sentence.
 * Round 8 (audit O31, `stagedActorColliders.test.ts`) made the shell PER
 * PROFILE — `npcShellHalfExtents(profile)` → `actorObb` → the fleet rigs — so a
 * truck's collider is 3.75 m long and a tram's is 7.00 m. `npcShellObb` was
 * left on the retired constants, and so was every reporter in this file: the
 * instrument went on modelling a 2.10 m box for a 14 m tram, which is why a
 * REGRESSION THIS FILE EXISTS TO CATCH WENT GREEN HERE. That is the house
 * failure again — a probe lying in the reassuring direction, this time by
 * standing still while the product moved.
 *
 * MEASURED on the shipped tables (player half-length 2.02), gap at the frame
 * rapier fires, against the 0.90 m naming reach:
 *
 *   profile   collider halfL   fires at   2.10-box touches at   gap   nameable
 *   car            2.05          4.07            4.12         −0.05    yes
 *   van            2.60          4.62            4.12          0.50    yes
 *   truck          3.75          5.77            4.12          1.65    NO
 *   tram           7.00          9.02            4.12          4.90    NO
 *   train         17.20         19.22            4.12         15.10    NO
 *   cyclist        0.90          2.92            4.12         −1.20    yes*
 *
 * (*) the cyclist is nameable only because its box is now 1.20 m OVER-sized,
 * which is the phantom-candidate direction — see the rider-column drive.
 *
 * So every collider in this file is now read off `npcShellHalfExtents`, THE
 * COMPONENT'S OWN FUNCTION, and every candidate off the production naming
 * helpers. Two sources still, and they agree only when the product is right.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  hittableObstacleBodies,
  liveContactBodies,
  nameLiveContact,
  NAMING_REACH_M,
  type LiveContactBody,
} from "../LessonScene";
import type { ObstacleColliderFootprint } from "../ScenarioObstacles";
import { npcShellHalfExtents } from "../NpcColliders";
import type { VehicleSample } from "@/modules/sim/contracts";
import {
  actorObb,
  isContact,
  obbDiscSeparationM,
  obbSeparationM,
  playerObb,
  PLAYER_HALF_LENGTH_M,
  type ActorPose,
  type Obb2D,
} from "@/modules/sim/collision";
import type { VehicleProfile } from "@/modules/sim/traffic";
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

/** THE PHYSICS LAYER'S OWN BODY — the collider rapier reports through, stated
 *  separately from the candidate box the grader sizes, because in the product
 *  they come from two different sources and the defect lived in the gap. */
interface ColliderBody {
  readonly withWhat: "vehicle" | "pedestrian" | "cyclist";
  readonly box: Obb2D;
}

/**
 * THE RETIRED ONE-SIZE SHELL — the mutation, and the only place in this file
 * these two numbers may appear. They shipped as `NPC_VEHICLE_SHELL_HALF_*_M`
 * in `collision/bodies.ts` and were deleted with this lane: a constant that
 * describes a body the product no longer builds is exactly the thing a future
 * resize leaves behind. Kept here as a local literal so the DRIVES can still
 * be run against it, and so nothing in production can import it again.
 */
const RETIRED_ONE_SIZE = { halfWidthM: 0.92, halfLengthM: 2.1 } as const;

/**
 * The kinematic shell NpcColliders binds to a `traffic.vehicles` agent, at this
 * agent's OWN profile — read off the component's own sizing function rather
 * than restated, because a restated table is what this file got wrong.
 */
function shellCollider(
  x: number,
  y: number,
  withWhat: ColliderBody["withWhat"] = "vehicle",
  profile?: VehicleProfile,
): ColliderBody {
  const half = npcShellHalfExtents(profile);
  return {
    withWhat,
    box: { x, y, headingDeg: 0, halfLengthM: half.halfLengthM, halfWidthM: half.halfWidthM },
  };
}

/** A body at a MEASURED footprint — an obstacle's published cuboid, stated as
 *  the collider it is. */
function boxCollider(
  x: number,
  y: number,
  half: { halfWidthM: number; halfLengthM: number },
  withWhat: ColliderBody["withWhat"] = "vehicle",
): ColliderBody {
  return {
    withWhat,
    box: { x, y, headingDeg: 0, halfLengthM: half.halfLengthM, halfWidthM: half.halfWidthM },
  };
}

/**
 * THE INSTRUMENT'S OWN SELF-CHECK, at module load, and it is not decoration.
 *
 * This file's reporters were wrong for one round because they modelled a shell
 * the component had stopped building, and a wrong reporter reports „no
 * problem". So: the shell the component sizes for a TRAM must not be the shell
 * it sizes for a CAR. If NpcColliders ever goes back to one size, every drive
 * below becomes meaningless and this throws before any of them can pass.
 */
if (npcShellHalfExtents("tram").halfLengthM === npcShellHalfExtents(undefined).halfLengthM) {
  throw new Error(
    "instrument dead: npcShellHalfExtents is one size again — every drive in this file is void",
  );
}

/** Does any collider of this category touch the player? — the frame on which
 *  rapier fires (contact is a STATE, reported while it lasts: the reporter
 *  contract engine.ts's `collision` case is written to). */
function rapierReports(
  player: Obb2D,
  colliders: readonly ColliderBody[],
  withWhat: ColliderBody["withWhat"],
): boolean {
  for (const c of colliders) {
    if (c.withWhat !== withWhat) continue;
    if (isContact(obbSeparationM(player, c.box))) return true;
  }
  return false;
}

/**
 * THE NAMING FUNCTION AS IT SHIPPED — the mutation every gap-dependent drive
 * below is paired against. Verbatim: loop the candidates, keep the ones the
 * ZERO-tolerance `isContact` says the player overlaps, refuse on two. The only
 * thing that changed underneath it is the sizing of the candidates it is given.
 */
function nameLikeShipped(
  withWhat: ColliderBody["withWhat"],
  player: Obb2D,
  bodies: readonly LiveContactBody[],
): string | undefined {
  let named: string | undefined;
  for (const b of bodies) {
    if (b.withWhat !== withWhat) continue;
    const sepM =
      b.disc !== undefined
        ? obbDiscSeparationM(player, b.disc.x, b.disc.y, b.disc.radiusM)
        : obbSeparationM(player, b.box as Obb2D);
    if (!isContact(sepM)) continue;
    if (named !== undefined) return undefined;
    named = b.id;
  }
  return named;
}

interface DriveOpts {
  /** m travelled per frame is derived from this. */
  speedKmh: number;
  y0: number;
  frames: number;
  /** Category the physics layer reports (default "vehicle"). */
  withWhat?: ColliderBody["withWhat"];
  /** THE MUTATION SWITCH: "none" = report exactly as the pre-naming code
   *  shipped, with no name at all; "shipped" = the pre-2026-08-19 naming
   *  function against pre-2026-08-19 candidate boxes; "flicker" = the resolved
   *  name, made unstable across frames — see `collisionBills`. */
  naming?: "fixed" | "shipped" | "none" | "flicker";
}

/**
 * Drive the lane north, reporting contact on every frame RAPIER would (i.e.
 * off `colliders`), naming it off `candidates`, and count the
 * «Пътнотранспортно произшествие» rows the reducer bills.
 *
 * The two lists are separate arguments on purpose — see the header. Passing one
 * list for both is the instrument bug this file was rebuilt to remove.
 */
function collisionBills(
  colliders: readonly ColliderBody[],
  candidates: readonly LiveContactBody[],
  opts: DriveOpts,
): number {
  const withWhat = opts.withWhat ?? "vehicle";
  const rt = createWorldRuntime(DISTRICT);
  let engine = createRuleEngine();
  const events: RuleEvent[] = [];
  const stepM = (opts.speedKmh / 3.6) * DT;
  let t = 0;
  for (let i = 0; i < opts.frames; i++) {
    const y = opts.y0 + i * stepM;
    const player = playerObb(LANE_X, y, 0);
    if (rapierReports(player, colliders, withWhat)) {
      const named =
        opts.naming === "shipped"
          ? nameLikeShipped(withWhat, player, candidates)
          : nameLiveContact(withWhat, player, candidates);
      rt.pushCollision(
        withWhat,
        opts.naming === "none"
          ? undefined
          : // THE MUTATION FOR THE „bills ONCE" DIRECTION, which no candidate
            // resizing can break and which therefore needs its own: a name that
            // is not STABLE across the frames of one contact. Every frame
            // becomes a fresh episode key, and one long shunt bills once per
            // frame — the catastrophe this mechanism replaced, which charged
            // 130-140 точки for a single contact against an allowance of 9.
            opts.naming === "flicker" && named !== undefined
            ? `${named}#${i}`
            : named,
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

/** Frames of a drive on which rapier reports at all — the denominator every
 *  naming census needs, so „0 anonymous" can never pass by reporting nothing. */
function reportedFrames(
  colliders: readonly ColliderBody[],
  opts: DriveOpts = { speedKmh: 46, y0: 130, frames: 300 },
): number {
  const withWhat = opts.withWhat ?? "vehicle";
  const stepM = (opts.speedKmh / 3.6) * DT;
  let n = 0;
  for (let i = 0; i < opts.frames; i++) {
    if (rapierReports(playerObb(LANE_X, opts.y0 + i * stepM, 0), colliders, withWhat)) n++;
  }
  return n;
}

/** …and of those, the ones `nameLiveContact` could not name. THE half the bill
 *  count cannot see: one bill is also what a wholly anonymous contact produces,
 *  so a drive that bills 1 proves nothing about naming on its own. */
function anonymousFrames(
  colliders: readonly ColliderBody[],
  candidates: readonly LiveContactBody[],
  opts: DriveOpts = { speedKmh: 46, y0: 130, frames: 300 },
): number {
  const withWhat = opts.withWhat ?? "vehicle";
  const stepM = (opts.speedKmh / 3.6) * DT;
  let n = 0;
  for (let i = 0; i < opts.frames; i++) {
    const player = playerObb(LANE_X, opts.y0 + i * stepM, 0);
    if (!rapierReports(player, colliders, withWhat)) continue;
    if (nameLiveContact(withWhat, player, candidates) === undefined) n++;
  }
  return n;
}

/** The name resolved on the FIRST frame rapier reports — the frame that OPENS
 *  the episode, and therefore the one that decides its key. A contact whose
 *  opening frame is anonymous is filed under `kind:<withWhat>` and swallows the
 *  next body of that kind, however well the later frames resolve. */
function firstReportName(
  colliders: readonly ColliderBody[],
  candidates: readonly LiveContactBody[],
  opts: DriveOpts,
): string | undefined | "no-report" {
  const withWhat = opts.withWhat ?? "vehicle";
  const stepM = (opts.speedKmh / 3.6) * DT;
  for (let i = 0; i < opts.frames; i++) {
    const player = playerObb(LANE_X, opts.y0 + i * stepM, 0);
    if (!rapierReports(player, colliders, withWhat)) continue;
    return nameLiveContact(withWhat, player, candidates);
  }
  return "no-report";
}

/** The same candidates, re-sized to the retired one-size shell — THE MUTATION,
 *  i.e. `npcShellObb` as it stood after round 8 moved the collider under it. */
const retiredBoxes = (bodies: readonly LiveContactBody[]): LiveContactBody[] =>
  bodies.map((b) =>
    b.box === undefined ? b : { ...b, box: { ...b.box, ...RETIRED_ONE_SIZE } },
  );

/**
 * A parked hatchback's MEASURED collider, as ScenarioObstacles publishes it —
 * `vehicleColliderDims(rig.halfWidth, rig.halfLength, …)` off the loaded rig.
 * Stated at the fleet "car" profile (traffic/types VEHICLE_PROFILE_*.car, which
 * the rigs are asserted against in `collision/__tests__/bodies.test.ts`), so
 * these drives isolate the EPISODE KEY and nothing else. The kargo_v drive
 * below is the one that puts a differently-sized per-model collider in the
 * lane.
 */
const CAR_RIG = { halfWidthM: 0.92, halfLengthM: 2.05 } as const;

const parkedSpecs = (ys: readonly number[], x = LANE_X) =>
  ys.map((y) => ({ kind: "vehicle" as const, x, y, headingDeg: 0 }));
const parkedFootprints = (ys: readonly number[]): ObstacleColliderFootprint[] =>
  ys.map((_, index) => ({ index, ...CAR_RIG }));

/** Parked bodies in the lane, as `hittableObstacleBodies` builds them — WITH
 *  the footprints ScenarioObstacles publishes for them. A hittable obstacle
 *  whose rig has loaded always has both; one whose rig has not has neither
 *  (same component, same `resolved` array), which is why the no-footprint case
 *  is a body that cannot be reported rather than a body to guess at. */
const wrecks = (...ys: number[]): LiveContactBody[] =>
  hittableObstacleBodies(parkedSpecs(ys), parkedFootprints(ys));

/** …and the same, centred on the origin, for the naming unit tests below. */
const atOrigin = (...ys: number[]): LiveContactBody[] =>
  hittableObstacleBodies(parkedSpecs(ys, 0), parkedFootprints(ys));

/** The colliders of those wrecks — the same measurement, stated as the body
 *  rapier binds rather than as the box the grader builds. */
const wreckColliders = (...ys: number[]): ColliderBody[] =>
  ys.map((y) => boxCollider(LANE_X, y, CAR_RIG));

// ---------------------------------------------------------------------------
// The four proofs
// ---------------------------------------------------------------------------

describe("the live contact channel names the body it hit", () => {
  it("TWO bodies struck seconds apart bill TWO — anonymously the same drive bills ONE", () => {
    // The sc-hz-accident-scene tableau's own spacing: two wrecks 12 m apart
    // (y = 150 and y = 162), taken at 46 км/ч. Both touch distances are
    // 2.02 + 2.05 = 4.07 m, so the overlap windows are y ∈ [145.93, 154.07] and
    // y ∈ [157.93, 166.07] — 3.86 m of daylight between them, which at 12.78 m/s
    // is 0.30 s of silence, well INSIDE collisionSeparationSec (1.2 s). That is
    // the whole trap. Travel between the two clears COLLISION_REOPEN_TRAVEL_M
    // (3.86 m against a 2 m floor), so every conjunct but the episode KEY is
    // satisfied and the key alone decides how many accidents this was.
    const drive: DriveOpts = { speedKmh: 46, y0: 130, frames: 300 };
    expect(collisionBills(wreckColliders(150, 162), wrecks(150, 162), drive)).toBe(2);
    // THE MUTATION — the identical drive, reported without a name. This is the
    // code exactly as it shipped, and it is what makes the assertion above a
    // real one: the second wrecked car cost the student nothing.
    expect(
      collisionBills(wreckColliders(150, 162), wrecks(150, 162), { ...drive, naming: "none" }),
    ).toBe(1);
  });

  it("ONE body, one long shunt, bills ONE however long it lasts", () => {
    // 120 frames of unbroken overlap at a crawl — the shape that once billed
    // 130-140 точки against an allowance of 9. Naming must not touch it: every
    // frame resolves to the SAME id, so it is one episode, still open.
    expect(
      collisionBills(wreckColliders(150), wrecks(150), { speedKmh: 4, y0: 148.5, frames: 120 }),
    ).toBe(1);
    // THE MUTATION for this direction — no candidate resizing can break it, so
    // it needs one of its own: an UNSTABLE name across the frames of one
    // contact. 120 frames then bill 120 accidents, which is the shape of the
    // 130-140 точки catastrophe this mechanism replaced.
    expect(
      collisionBills(wreckColliders(150), wrecks(150), {
        speedKmh: 4,
        y0: 148.5,
        frames: 120,
        naming: "flicker",
      }),
    ).toBeGreaterThan(50);
    // …and at speed, where the overlap is short, it is still one.
    expect(
      collisionBills(wreckColliders(150), wrecks(150), { speedKmh: 46, y0: 130, frames: 300 }),
    ).toBe(1);
  });

  it("a clean drive down the same street bills NOTHING", () => {
    expect(collisionBills([], [], { speedKmh: 46, y0: 130, frames: 300 })).toBe(0);
    // …and a body parked clear of the lane is passed, not hit. The lateral
    // enter edge is 0.85 + 0.92 = 1.77 m and this one stands 6 m off, so the
    // reach (0.90 m) is nowhere near it either — a tolerance that credited a
    // pass at six metres would be the founder's own false failure.
    const aside = hittableObstacleBodies(parkedSpecs([150], LANE_X + 6), parkedFootprints([150]));
    expect(
      collisionBills([boxCollider(LANE_X + 6, 150, CAR_RIG)], aside, {
        speedKmh: 46,
        y0: 130,
        frames: 300,
      }),
    ).toBe(0);
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
    const colliders = [shellCollider(LANE_X, 150), ...wreckColliders(162)];
    expect(staged).toHaveLength(2);
    expect(collisionBills(colliders, staged, { speedKmh: 46, y0: 130, frames: 300 })).toBe(2);
    // THE MUTATION: strip the names and the staged actor's crash is free.
    expect(
      collisionBills(colliders, staged, {
        speedKmh: 46,
        y0: 130,
        frames: 300,
        naming: "none",
      }),
    ).toBe(1);
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
        const touching = rapierReports(player, [shellCollider(LANE_X, 150)], "vehicle");
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
    //
    // 2026-08-19: THAT LAST PARAGRAPH WAS FALSE WHEN IT WAS WRITTEN, and the
    // drive below it («the live stream lays no anonymous stepping stone») is
    // the correction. The live stream DID contain an anonymous vehicle report
    // at the start of essentially every contact, because the first report is
    // resolved at the collider's enter edge, where a grading box sized from a
    // different source has not touched yet. It no longer does — but this row
    // stays 1, because it describes the ENGINE, and the authored trace beats
    // still reach it anonymously.
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
// THE BODY THAT COULD NOT BE NAMED AT ALL — RE-DRIVEN AGAINST THE NEW COLLIDER
//
// A "cyclist" in this product is a narrow curb-riding VEHICLE agent (audit C3's
// honest v1 model): `TrafficSystem.stage` puts it in `traffic.vehicles`, marks
// its state id from the staged spec's curb offset, and
// `vehicleCollisionKind(id)` returns "cyclist" — which is the tag NpcColliders
// stamps on the shell and the tag VehicleRig reports.
//
// ROUND 3 found this rider unnameable: the shell was 0.92 × 2.10 for everyone
// and `actorObb(pose, "cyclist")` is a 0.23 × 0.90 bicycle, so naming needed
// 1.20 m of penetration PAST the collider's own face and the solver exists to
// prevent exactly that. ROUND 8 shrank the collider to the bicycle. The rider
// must STILL be nameable — a lane that fixes the largest body by re-breaking
// the smallest has moved the defect, not closed it — and the mutation is now
// the other one: an OVER-sized grading box, which invents candidates.
// ---------------------------------------------------------------------------

describe("a cyclist can be named — the round-3 case, re-driven", () => {
  const player = playerObb(0, 0, 0);
  /** The staged cyclist's cast entry (runners.ts `vehicleCast(..., "cyclist")`
   *  — a BOX, and the profile it carries is the bicycle rig). */
  const cast = [
    {
      actorId: "sc-vu-cyclist",
      withWhat: "cyclist" as const,
      body: "box" as const,
      profile: "cyclist" as const,
    },
  ];
  const behind = (gapM: number) => () =>
    ({ x: 0, y: gapM, dirX: 0, dirY: 1 }) as ActorPose;
  /** The rear enter edge for a bicycle: 2.02 + 0.90 = 2.92 m between centres —
   *  the first frame rapier reports, read off the component's own sizing. */
  const CYCLIST_ENTER_M = PLAYER_HALF_LENGTH_M + npcShellHalfExtents("cyclist").halfLengthM;

  it("names the rider at the frame rapier fires, at the bicycle's own edge", () => {
    expect(CYCLIST_ENTER_M).toBeCloseTo(2.92, 6);
    const bodies = liveContactBodies(cast, behind(CYCLIST_ENTER_M), []);
    // The grading box touches at exactly the frame the collider does — nothing
    // is being absorbed by the reach here, which is what "one fact" means.
    expect(obbSeparationM(player, bodies[0].box as Obb2D)).toBeCloseTo(0, 6);
    expect(nameLiveContact("cyclist", player, bodies)).toBe("sc-vu-cyclist");

    // THE ROUND-3 MUTATION, kept because it is the failure this case is named
    // for: a grading box sized from a source OTHER than the collider. At
    // 2.92 m of centre separation a 2.10 m box is 1.20 m of clear air the wrong
    // way round, so the zero-tolerance test cannot resolve it either.
    const roundThree: LiveContactBody[] = [
      {
        id: "sc-vu-cyclist",
        withWhat: "cyclist",
        // The rider at the ONE-SIZE shell's enter edge (2.02 + 2.10 = 4.12 m),
        // graded as the bicycle he is: 1.20 m of clear air on the frame rapier
        // fired, at every depth the solver allows.
        box: actorObb(behind(PLAYER_HALF_LENGTH_M + RETIRED_ONE_SIZE.halfLengthM)(), "cyclist"),
      },
    ];
    expect(obbSeparationM(player, roundThree[0].box as Obb2D)).toBeCloseTo(1.2, 6);
    expect(nameLikeShipped("cyclist", player, roundThree)).toBeUndefined();
  });

  it("an OVER-sized box invents a second rider and loses the name of the first", () => {
    // THE MUTATION THAT MATTERS NOW, and the reason „the box is bigger than the
    // collider" is not the safe direction either. A column of two riders: the
    // one the player has just touched at the nose (+2.92 m) and one riding
    // 1.00 m clear of the tail (−3.92 m). The car is 4.04 m long, so the two
    // are 6.84 m apart — an ordinary two-up column.
    const column = [
      { actorId: "rider-front", withWhat: "cyclist" as const, body: "box" as const, profile: "cyclist" as const },
      { actorId: "rider-rear", withWhat: "cyclist" as const, body: "box" as const, profile: "cyclist" as const },
    ];
    const poses: Record<string, ActorPose> = {
      "rider-front": { x: 0, y: CYCLIST_ENTER_M, dirX: 0, dirY: 1 },
      "rider-rear": { x: 0, y: -(CYCLIST_ENTER_M + 1), dirX: 0, dirY: 1 },
    };
    const bodies = liveContactBodies(column, (id) => poses[id] ?? null, []);
    // Sized from the collider, the rear rider is 1.00 m of clear air — outside
    // NAMING_REACH_M — so he is not a candidate and the front rider is named.
    expect(obbSeparationM(player, bodies[1].box as Obb2D)).toBeCloseTo(1, 6);
    expect(nameLiveContact("cyclist", player, bodies)).toBe("rider-front");

    // …and with the retired one-size box, the rear rider's 2.10 m half-length
    // reaches 0.20 m INTO the player: two overlapping candidates, the refusal
    // fires, and the rider the student actually hit goes unnamed. That report
    // then merges into whatever `kind:cyclist` episode is open — the under-bill
    // this whole mechanism was built to end.
    const overSized: LiveContactBody[] = column.map((m) => ({
      id: m.actorId,
      withWhat: m.withWhat,
      box: { ...actorObb(poses[m.actorId], "cyclist"), ...RETIRED_ONE_SIZE },
    }));
    expect(obbSeparationM(player, overSized[1].box as Obb2D)).toBeCloseTo(-0.2, 6);
    expect(nameLiveContact("cyclist", player, overSized)).toBeUndefined();
  });

  it("TWO riders struck 1.1 s apart bill TWO — anonymously they bill ONE", () => {
    // sc-hz-accident-scene's own spacing, riders instead of wrecks: two bodies
    // 12 m apart in the lane at 46 км/ч. The overlap windows are ±2.92 m of each
    // centre, so 6.16 m of silence between them — 0.48 s, well inside
    // collisionSeparationSec (1.2 s) and past COLLISION_REOPEN_TRAVEL_M (2 m).
    // The episode KEY is the only thing that decides the bill, and a name is
    // the only thing that makes the key.
    const cyclists = [
      { actorId: "sc-vu-cyclist-a", withWhat: "cyclist" as const, body: "box" as const, profile: "cyclist" as const },
      { actorId: "sc-vu-cyclist-b", withWhat: "cyclist" as const, body: "box" as const, profile: "cyclist" as const },
    ];
    const poses: Record<string, ActorPose> = {
      "sc-vu-cyclist-a": { x: LANE_X, y: 150, dirX: 0, dirY: 1 },
      "sc-vu-cyclist-b": { x: LANE_X, y: 162, dirX: 0, dirY: 1 },
    };
    const bodies = liveContactBodies(cyclists, (id) => poses[id] ?? null, []);
    const colliders = [
      shellCollider(LANE_X, 150, "cyclist", "cyclist"),
      shellCollider(LANE_X, 162, "cyclist", "cyclist"),
    ];
    const drive: DriveOpts = { speedKmh: 46, y0: 130, frames: 300, withWhat: "cyclist" };
    expect(collisionBills(colliders, bodies, drive)).toBe(2);

    // THE MUTATION: the identical drive, reported with no name at all. The
    // second rider joins the first's `kind:cyclist` episode and costs nothing.
    // One bill for two people on the road.
    expect(collisionBills(colliders, bodies, { ...drive, naming: "none" })).toBe(1);
  });

  it("one long shunt along one rider still bills ONE", () => {
    // The other direction, and the one a tolerance could break: 120 frames of
    // unbroken contact at a crawl must stay ONE accident. Every frame resolves
    // to the same id, so it is one episode, still open.
    const inLane = () => ({ x: LANE_X, y: 150, dirX: 0, dirY: 1 }) as ActorPose;
    const bodies = liveContactBodies(cast, inLane, []);
    expect(
      collisionBills([shellCollider(LANE_X, 150, "cyclist", "cyclist")], bodies, {
        speedKmh: 4,
        y0: 149.5,
        frames: 120,
        withWhat: "cyclist",
      }),
    ).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// THE GRADING BOX AND THE COLLIDER ARE ONE FACT — THE LARGE BODIES
//
// Round 8 gave staged actors real colliders sized per profile, which is why a
// truck now stops the player instead of being driven through. `npcShellObb`
// was left on the retired 0.92 × 2.10 constants, so the naming side went on
// measuring a hatchback: at the frame rapier fires, a truck's grading box
// reported 1.65 m of clear air and a tram's 4.90 m — both past NAMING_REACH_M,
// so the report arrived ANONYMOUS. It is the third time this project has
// shipped the same mismatch, so these drives pin BOTH ends of the fleet.
// ---------------------------------------------------------------------------

describe("the grading box is the collider, at every profile", () => {
  const player = playerObb(0, 0, 0);
  const castOf = (actorId: string, profile: VehicleProfile) => [
    { actorId, withWhat: "vehicle" as const, body: "box" as const, profile },
  ];
  const at = (y: number) => () => ({ x: LANE_X, y, dirX: 0, dirY: 1 }) as ActorPose;

  /** Every fleet profile, at its own rear enter edge — the frame rapier fires
   *  and the frame the name has to exist. One loop rather than six drives: the
   *  regression was one constant, and it is one constant that must not return. */
  it("names EVERY profile at the frame its own collider fires", () => {
    for (const profile of [
      "car",
      "van",
      "truck",
      "emergency",
      "tram",
      "train",
      "cyclist",
      "childCyclist",
    ] as const) {
      const enterM = PLAYER_HALF_LENGTH_M + npcShellHalfExtents(profile).halfLengthM;
      const bodies = liveContactBodies(
        [{ actorId: "a", withWhat: "vehicle", body: "box", profile }],
        () => ({ x: 0, y: enterM, dirX: 0, dirY: 1 }) as ActorPose,
        [],
      );
      // ZERO, not „within the reach": one fact means the two edges coincide.
      expect(obbSeparationM(player, bodies[0].box as Obb2D), profile).toBeCloseTo(0, 6);
      expect(nameLiveContact("vehicle", player, bodies), profile).toBe("a");

      // THE MUTATION — the retired one-size box, i.e. the code this lane
      // replaces. Every body longer than a car reports metres of clear air on
      // the frame its own collider fired, and past the reach that is silence.
      const retired: LiveContactBody[] = [
        {
          id: "a",
          withWhat: "vehicle",
          box: { x: 0, y: enterM, headingDeg: 0, ...RETIRED_ONE_SIZE },
        },
      ];
      const gapM = obbSeparationM(player, retired[0].box as Obb2D);
      if (gapM > NAMING_REACH_M) {
        expect(nameLiveContact("vehicle", player, retired), profile).toBeUndefined();
      }
    }
  });

  it("the retired box loses TRUCK, TRAM and TRAIN outright — the measurement", () => {
    // The three rows of the table in this file's header, produced rather than
    // quoted, so the claim „1.65 / 4.90 / 15.10 m past the reach" fails here if
    // a rig is resized.
    const measured: Record<string, number> = {};
    for (const profile of ["truck", "tram", "train"] as const) {
      const enterM = PLAYER_HALF_LENGTH_M + npcShellHalfExtents(profile).halfLengthM;
      measured[profile] = obbSeparationM(player, {
        x: 0,
        y: enterM,
        headingDeg: 0,
        ...RETIRED_ONE_SIZE,
      });
    }
    expect(measured.truck).toBeCloseTo(1.65, 6);
    expect(measured.tram).toBeCloseTo(4.9, 6);
    expect(measured.train).toBeCloseTo(15.1, 6);
    for (const p of ["truck", "tram", "train"]) {
      expect(measured[p], p).toBeGreaterThan(NAMING_REACH_M);
    }
  });

  it("a rear-end into the staged TRUCK is named and bills ONCE — sc-follow-truck", () => {
    // sc-follow-truck's own actor: `profile: "truck"`, the box-truck rig, in
    // the lead position on a 360 m straight. 300 frames at 46 км/ч runs the
    // whole street, so the contact is entered once and held.
    const cast = castOf("sc-ft-lead", "truck");
    const bodies = liveContactBodies(cast, at(150), []);
    const colliders = [shellCollider(LANE_X, 150, "vehicle", "truck")];
    expect(collisionBills(colliders, bodies, { speedKmh: 46, y0: 130, frames: 300 })).toBe(1);

    // AND IT IS NAMED, which is the half the bill count cannot see: one bill is
    // also what a wholly anonymous contact produces. The census crawls through
    // the enter edge, which is where the FIRST report is and where a box sized
    // from the wrong source is furthest out.
    const census: DriveOpts = { speedKmh: 4, y0: 142, frames: 600 };
    expect(reportedFrames(colliders, census)).toBe(479);
    expect(firstReportName(colliders, bodies, census)).toBe("sc-ft-lead");
    expect(anonymousFrames(colliders, bodies, census)).toBe(0);
    // THE MUTATION: the retired box, i.e. HEAD. The lorry's collider reaches
    // 1.65 m further than the box, so the first 0.75 m of the contact — 40 of
    // 479 frames on this crawl, and the FIRST of them either way — is outside
    // the box AND outside the 0.90 m reach. Those are the frames that OPEN the
    // episode, so the crash is filed under `kind:vehicle` and swallows the next
    // vehicle struck. Later frames resolving is no consolation: the key is set.
    const retired = retiredBoxes(bodies);
    expect(firstReportName(colliders, retired, census)).toBeUndefined();
    expect(anonymousFrames(colliders, retired, census)).toBe(40);
  });

  it("a rear-end into the 14 m TRAM is named and bills ONCE — sc-rx-tram-left", () => {
    const cast = castOf("sc-rxtl-tram", "tram");
    const bodies = liveContactBodies(cast, at(150), []);
    const colliders = [shellCollider(LANE_X, 150, "vehicle", "tram")];
    expect(collisionBills(colliders, bodies, { speedKmh: 46, y0: 120, frames: 300 })).toBe(1);
    const census: DriveOpts = { speedKmh: 4, y0: 138, frames: 600 };
    expect(reportedFrames(colliders, census)).toBe(439);
    expect(firstReportName(colliders, bodies, census)).toBe("sc-rxtl-tram");
    expect(anonymousFrames(colliders, bodies, census)).toBe(0);
    // THE MUTATION: 4.90 m of tram outside the retired box, of which 4.00 m is
    // also outside the reach — 216 of 439 frames anonymous, the opening ones
    // included. Half the contact with a 14-metre body had no body named.
    const retired = retiredBoxes(bodies);
    expect(firstReportName(colliders, retired, census)).toBeUndefined();
    expect(anonymousFrames(colliders, retired, census)).toBe(216);
  });

  it("TWO tram bodies touched in one pass bill TWO — the per-body episode", () => {
    // Two units on the corridor, 25 m between centres. Each overlap window is
    // ±9.02 m, so the daylight between them is 25 − 18.04 = 6.96 m — at
    // 12.78 m/s that is 0.54 s of silence, INSIDE collisionSeparationSec
    // (1.2 s) and past COLLISION_REOPEN_TRAVEL_M (2 m). Every conjunct but the
    // episode KEY is satisfied, so the key alone decides how many accidents
    // this was, and only a NAME makes a key.
    const cast = [
      { actorId: "tram-a", withWhat: "vehicle" as const, body: "box" as const, profile: "tram" as const },
      { actorId: "tram-b", withWhat: "vehicle" as const, body: "box" as const, profile: "tram" as const },
    ];
    const poses: Record<string, ActorPose> = {
      "tram-a": { x: LANE_X, y: 150, dirX: 0, dirY: 1 },
      "tram-b": { x: LANE_X, y: 175, dirX: 0, dirY: 1 },
    };
    const bodies = liveContactBodies(cast, (id) => poses[id] ?? null, []);
    const colliders = [
      shellCollider(LANE_X, 150, "vehicle", "tram"),
      shellCollider(LANE_X, 175, "vehicle", "tram"),
    ];
    const drive: DriveOpts = { speedKmh: 46, y0: 120, frames: 380 };
    // The daylight is real and it is short — stated as a measurement so a rig
    // resize that closes it fails here instead of quietly making this trivial.
    const enterM = PLAYER_HALF_LENGTH_M + npcShellHalfExtents("tram").halfLengthM;
    expect(25 - 2 * enterM).toBeCloseTo(6.96, 6);
    expect((25 - 2 * enterM) / (46 / 3.6)).toBeLessThan(1.2);
    expect(collisionBills(colliders, bodies, drive)).toBe(2);

    // THE MUTATION, and it is the regression verbatim: grade both trams with
    // the retired 2.10 m box. Neither is ever nameable, both reports arrive
    // anonymous under one `kind:vehicle` latch, and two 14-metre bodies bill
    // ONE «Пътнотранспортно произшествие».
    expect(collisionBills(colliders, retiredBoxes(bodies), drive)).toBe(1);
  });

  it("one long shunt against ONE tram still bills ONE — 120 frames, 1 bill", () => {
    // The direction over-billing lives in, and the catastrophe this whole
    // mechanism replaced: 130–140 точки for a single contact against an
    // allowance of 9. 120 frames of unbroken overlap at a crawl, every one of
    // them resolving to the same id, is ONE episode still open.
    const cast = castOf("tram-a", "tram");
    const bodies = liveContactBodies(cast, at(150), []);
    const colliders = [shellCollider(LANE_X, 150, "vehicle", "tram")];
    const opts: DriveOpts = { speedKmh: 4, y0: 141.5, frames: 120 };
    // The drive must actually be inside the body for all 120 frames, or the
    // „1" would be the trivial one. 4 км/ч × 2 s = 2.2 m of travel from 0.5 m
    // inside the enter edge, against a 9.02 m half-window.
    expect(reportedFrames(colliders, opts)).toBe(120);
    expect(collisionBills(colliders, bodies, opts)).toBe(1);
    // THE MUTATION, because no candidate resizing can break this direction and
    // an assertion nothing can break guards nothing: make the name UNSTABLE
    // across the frames of the one contact. 120 frames of one shunt then bill
    // 120 accidents — 1,200 наказателни точки against an allowance of 9.
    expect(collisionBills(colliders, bodies, { ...opts, naming: "flicker" })).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// THE ANONYMOUS STEPPING STONE — the deferral that was false
// ---------------------------------------------------------------------------

describe("the live stream lays no anonymous stepping stone", () => {
  /** `kargo_v` as the reversing bay stages it: a HITTABLE obstacle whose rig
   *  measures 1.98 × 5.34, i.e. a collider half-length of 2.67 against the
   *  canonical shell's 2.10. */
  const KARGO: ObstacleColliderFootprint = { index: 0, halfWidthM: 0.99, halfLengthM: 2.67 };
  const kargoSpec = [{ kind: "vehicle" as const, x: LANE_X, y: 162, headingDeg: 0 }];
  const kargoCollider: ColliderBody = {
    withWhat: "vehicle",
    box: { x: LANE_X, y: 162, headingDeg: 0, halfLengthM: 2.67, halfWidthM: 0.99 },
  };

  it("every frame of a contact resolves to a name — none arrives anonymous", () => {
    // The census the refutation asked for. Drive the lane into a staged car and
    // count the reported frames that could NOT be named. Before this lane the
    // first report of every rear-end contact was one of them: the grading box
    // was 0.05 m shorter than the shell for a car, 0.57 m for the kargo_v,
    // 1.20 m for a cyclist — and the enter edge is where the first report is.
    const cast = [{ actorId: "sc-fs-lead", withWhat: "vehicle" as const, body: "box" as const }];
    const pose = () => ({ x: LANE_X, y: 150, dirX: 0, dirY: 1 }) as ActorPose;
    const bodies = liveContactBodies(cast, pose, hittableObstacleBodies(kargoSpec, [KARGO]));
    const colliders = [shellCollider(LANE_X, 150), kargoCollider];
    // THE MUTATION: the staged car on the retired one-size box, and the kargo_v
    // with its footprint withheld — a body whose rig has not published, which
    // this lane makes a NON-candidate rather than a car-sized guess.
    const asShipped: LiveContactBody[] = [
      {
        id: "sc-fs-lead",
        withWhat: "vehicle",
        box: { ...actorObb(pose(), undefined), ...RETIRED_ONE_SIZE },
      },
      ...hittableObstacleBodies(kargoSpec),
    ];

    let reported = 0;
    let anonymous = 0;
    let anonymousAsShipped = 0;
    const stepM = (4 / 3.6) * DT; // a crawl: the enter edge gets many frames
    for (let i = 0; i < 900; i++) {
      const player = playerObb(LANE_X, 143 + i * stepM, 0);
      if (!rapierReports(player, colliders, "vehicle")) continue;
      reported++;
      if (nameLiveContact("vehicle", player, bodies) === undefined) anonymous++;
      if (nameLikeShipped("vehicle", player, asShipped) === undefined) anonymousAsShipped++;
    }
    expect(reported).toBeGreaterThan(100);
    expect(anonymous).toBe(0);
    // …and the measurement: without the published footprint the kargo_v's own
    // frames carry no name at all.
    expect(anonymousAsShipped).toBeGreaterThan(0);
  });

  it("a named body and a per-model obstacle 1.1 s apart bill TWO", () => {
    // The interleave itself. Post-fix both bodies are named from their first
    // reported frame, so the two victims are two episodes. As shipped, the
    // kargo_v's 0.57 m of unmodelled collider made its opening frames
    // anonymous; that anonymous report writes a `kind:vehicle` episode, and the
    // engine's own rule is that a NAMED report is a continuation of the
    // anonymous episode of its kind — so the second car was absorbed by a
    // stepping stone the drive laid for itself, and billed nothing.
    const cast = [{ actorId: "sc-fs-lead", withWhat: "vehicle" as const, body: "box" as const }];
    const pose = () => ({ x: LANE_X, y: 150, dirX: 0, dirY: 1 }) as ActorPose;
    const bodies = liveContactBodies(cast, pose, hittableObstacleBodies(kargoSpec, [KARGO]));
    const colliders = [shellCollider(LANE_X, 150), kargoCollider];
    const drive: DriveOpts = { speedKmh: 46, y0: 130, frames: 300 };
    expect(collisionBills(colliders, bodies, drive)).toBe(2);

    const asShipped: LiveContactBody[] = [
      {
        id: "sc-fs-lead",
        withWhat: "vehicle",
        box: { ...actorObb(pose(), undefined), ...RETIRED_ONE_SIZE },
      },
      ...hittableObstacleBodies(kargoSpec),
    ];
    expect(collisionBills(colliders, asShipped, { ...drive, naming: "shipped" })).toBe(1);
  });

  it("…and only the published footprint can name an obstacle at all", () => {
    // WHERE THE TWO HALVES OF THE FIX DIVIDE, measured rather than asserted.
    // No static table can state a GLB's extents, so an obstacle whose rig has
    // not published one is a body this file cannot size — and it is also a body
    // that has no collider (ScenarioObstacles derives the footprint from the
    // very `resolved` array it mounts the `CuboidCollider` from, so the two
    // arrive together or not at all). Guessing it at car dimensions is the
    // shape of the defect this lane closes: `box_truck` is a 7.5 m rig,
    // halfLength 3.75 against a 2.10 guess, i.e. 1.65 m outside any reach it
    // would be safe to grant. So it is not a candidate.
    // `ScenarioVehicleObstacle` authorises exactly that placement (every
    // box_truck in the catalogue is `visual: true` today, which mounts no
    // collider — nothing but that keeps this case theoretical).
    const spec = [{ kind: "vehicle" as const, x: LANE_X, y: 162, headingDeg: 0 }];
    const truck: ObstacleColliderFootprint = { index: 0, halfWidthM: 1.2, halfLengthM: 3.75 };
    const truckCollider: ColliderBody = {
      withWhat: "vehicle",
      box: { x: LANE_X, y: 162, headingDeg: 0, halfLengthM: 3.75, halfWidthM: 1.2 },
    };
    const cast = [{ actorId: "sc-fs-lead", withWhat: "vehicle" as const, body: "box" as const }];
    const pose = () => ({ x: LANE_X, y: 150, dirX: 0, dirY: 1 }) as ActorPose;
    const colliders = [shellCollider(LANE_X, 150), truckCollider];
    const drive: DriveOpts = { speedKmh: 46, y0: 130, frames: 300 };

    const withFootprint = liveContactBodies(cast, pose, hittableObstacleBodies(spec, [truck]));
    expect(collisionBills(colliders, withFootprint, drive)).toBe(2);
    // THE MUTATION: the same drive with the footprint withheld. Every frame of
    // the lorry contact is anonymous, that report joins the car's episode, and
    // the lorry the student drove into costs him nothing. Which is exactly why
    // the fallback must not be a GUESS — a car-sized box here would report
    // 1.65 m of clear air and produce the identical silence, while ALSO being
    // able to steal a name from a body that really was hit.
    const noFootprint = liveContactBodies(cast, pose, hittableObstacleBodies(spec));
    expect(hittableObstacleBodies(spec)).toEqual([]);
    expect(collisionBills(colliders, noFootprint, drive)).toBe(1);
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

  it("reaches PAST the box by NAMING_REACH_M, and stops there", () => {
    // The reach exists for ONE residue: the pose tested here is the shared
    // VehicleSample, written once per RENDER frame, while rapier's contact
    // fires inside the physics step. 0.21 m at 46 км/ч and 60 fps; ×2 for the
    // 30 fps mobile floor; ×2 again for two bodies closing at that speed.
    //
    // It is safe HERE and would be a defect in `isContact` for one reason: this
    // function is never called except by a contact rapier already declared, so
    // it decides WHICH body, never WHETHER. Both edges are pinned.
    // CONCRETE DISTANCES, not the constant. Writing these as
    // `enterM + NAMING_REACH_M − ε` made the test self-referential: it passed
    // unchanged with the reach mutated to ZERO, which is the „a test that
    // passes equally before and after guards nothing" trap in its purest form.
    // The constant's own value is asserted once, here, so moving it is a
    // deliberate act with a failing test attached.
    expect(NAMING_REACH_M).toBe(0.9);
    const enterM = PLAYER_HALF_LENGTH_M + CAR_RIG.halfLengthM; // 4.07
    const air = (m: number) => atOrigin(enterM + m);
    expect(obbSeparationM(playerObb(0, 0, 0), air(0.5)[0].box as Obb2D)).toBeCloseTo(0.5, 6);
    expect(nameLiveContact("vehicle", player, air(0.5))).toBe("obstacle:0");
    expect(nameLiveContact("vehicle", player, air(0.85))).toBe("obstacle:0");
    // …and past it the answer is `undefined`, which is byte-identically the
    // shipped behaviour. A reach that never ended would name a car the student
    // drove cleanly past — the founder's own false failure, in a new hat.
    expect(nameLiveContact("vehicle", player, air(0.95))).toBeUndefined();
    expect(nameLiveContact("vehicle", player, air(4))).toBeUndefined();
  });

  it("refuses when TWO bodies share the reach — a coin toss is not a name", () => {
    // Nobody is overlapped, so the reach is doing the work; two candidates
    // inside a window this coarse are not distinguishable by it, and a name
    // that flickers between two bodies during ONE contact bills it twice.
    const enterM = PLAYER_HALF_LENGTH_M + CAR_RIG.halfLengthM;
    // Each is nameable ALONE — without this the refusal below would pass for
    // the wrong reason (two bodies nobody can see are also „not two bodies").
    expect(nameLiveContact("vehicle", player, atOrigin(enterM + 0.2))).toBe("obstacle:0");
    expect(nameLiveContact("vehicle", player, atOrigin(-(enterM + 0.5)))).toBe("obstacle:0");
    expect(nameLiveContact("vehicle", player, atOrigin(enterM + 0.2, -(enterM + 0.5)))).toBe(
      undefined,
    );
    // …but a body the player is genuinely INSIDE of outranks one merely within
    // reach: the bands are ordered, so nothing that resolved before resolves
    // differently now.
    expect(nameLiveContact("vehicle", player, atOrigin(enterM - 0.2, -(enterM + 0.5)))).toBe(
      "obstacle:0",
    );
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
    const bodies = hittableObstacleBodies(
      [
        { kind: "vehicle", x: 0, y: 0, headingDeg: 0, visual: true },
        { kind: "vehicle", x: 0, y: 20, headingDeg: 0 },
        { kind: "prop", prop: "cone", x: 0, y: 40, headingDeg: 0 },
        { kind: "vehicle", x: 0, y: 60, headingDeg: 0 },
      ],
      [
        { index: 1, ...CAR_RIG },
        { index: 2, ...CAR_RIG },
      ],
    );
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

  it("a staged candidate is sized from its OWN profile — the collider's source", () => {
    // The cause, pinned at the source, and it is one line of production code:
    // `liveContactBodies` sizes each candidate through `actorObb(pose, profile)`
    // — the SAME call `npcShellHalfExtents` makes to size the rapier body. The
    // two are one fact, so this asserts them equal rather than asserting a
    // number, and no constant sits between them for a resize to leave behind.
    const pose = () => ({ x: 0, y: 0, dirX: 0, dirY: 1 }) as ActorPose;
    for (const profile of ["car", "truck", "tram", "train", "cyclist", "childCyclist"] as const) {
      const withWhat = profile === "cyclist" || profile === "childCyclist" ? "cyclist" : "vehicle";
      const box = liveContactBodies([{ actorId: "a", withWhat, body: "box", profile }], pose, [])[0]
        .box as Obb2D;
      const collider = npcShellHalfExtents(profile);
      expect(box.halfLengthM, profile).toBe(collider.halfLengthM);
      expect(box.halfWidthM, profile).toBe(collider.halfWidthM);
      expect(box, profile).toEqual(actorObb(pose(), profile));
    }
    // An absent profile is a car on BOTH sides — ambient agents publish none,
    // and NpcColliders reads the same absence the same way. Agreement, not a
    // guess: the two functions return the identical body for the identical
    // input, which is what „a fallback that guesses" would not.
    const ambient = liveContactBodies(
      [{ actorId: "a", withWhat: "vehicle", body: "box" }],
      pose,
      [],
    )[0].box as Obb2D;
    expect(ambient.halfLengthM).toBe(npcShellHalfExtents(undefined).halfLengthM);
    expect(ambient.halfWidthM).toBe(npcShellHalfExtents(undefined).halfWidthM);
  });

  it("an obstacle with no PUBLISHED collider is not a candidate at all", () => {
    // ScenarioObstacles mounts a per-model tight cuboid measured off the loaded
    // rig, and no static table can state a GLB's extents — so it publishes
    // them. `kargo_v` is the shipped case: halfLength 2.67, i.e. 0.57 m of
    // collider a car-sized candidate does not cover; `box_truck` would be
    // 1.65 m, past any reach it is safe to grant.
    //
    // AND THE ABSENT CASE IS A REFUSAL, NOT A GUESS. The footprint and the
    // `CuboidCollider` are derived from the same `resolved` array in the same
    // component, so an obstacle with no published footprint has no body for
    // rapier to report through either. A car-sized stand-in for it could only
    // ever do two things, both wrong: report metres of clear air on a body it
    // cannot be (silence), or overlap the player and STEAL the name of a body
    // that really was hit (a phantom, and the two-candidate refusal).
    const specs = [
      { kind: "vehicle" as const, x: 0, y: 0, headingDeg: 0, visual: true },
      { kind: "vehicle" as const, x: 0, y: 40, headingDeg: 0 },
      { kind: "vehicle" as const, x: 0, y: 80, headingDeg: 0 },
    ];
    const footprints: ObstacleColliderFootprint[] = [
      { index: 1, halfWidthM: 0.99, halfLengthM: 2.67 },
    ];
    const bodies = hittableObstacleBodies(specs, footprints);
    // Index 2 published nothing (a model whose rig has not resolved), so it is
    // gone — while index 1 keeps its own measured cuboid and its own id.
    expect(bodies.map((b) => b.id)).toEqual(["obstacle:1"]);
    expect((bodies[0].box as Obb2D).halfLengthM).toBe(2.67);
    expect((bodies[0].box as Obb2D).halfWidthM).toBe(0.99);
    // …and with nothing published at all, nothing is a candidate.
    expect(hittableObstacleBodies(specs)).toEqual([]);
    // The two numbers the refusal rests on, stated rather than recalled: a
    // car-sized guess is inside the reach for kargo_v and far outside it for a
    // box_truck, so no single guess can be right for both.
    expect(2.67 - CAR_RIG.halfLengthM).toBeLessThan(NAMING_REACH_M);
    expect(3.75 - CAR_RIG.halfLengthM).toBeGreaterThan(NAMING_REACH_M);
  });
});
