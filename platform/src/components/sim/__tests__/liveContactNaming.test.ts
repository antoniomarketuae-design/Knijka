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
 * binds to every `traffic.vehicles` agent (0.92 × 2.10 m, one size for the
 * whole fleet), and the per-model tight cuboid ScenarioObstacles measures off
 * each loaded rig. Those are two DIFFERENT SOURCES from the boxes the grader
 * used to size, and the whole defect lived in the gap between them:
 *
 *   body                collider (rapier)   old grading box   gap at enter
 *   cyclist proxy         0.92 × 2.10       0.23 × 0.90        1.20 m
 *   kargo_v obstacle      0.99 × 2.67       0.92 × 2.10        0.57 m
 *   staged car            0.92 × 2.10       0.92 × 2.05        0.05 m
 *   pedestrian            r = 0.30          r = 0.30           0
 *
 * Each drive that depends on the gap carries the OLD sizing as its mutation —
 * `nameLikeShipped`, the pre-fix function verbatim — and bills one where the
 * fixed channel bills two.
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
import type { VehicleSample } from "@/modules/sim/contracts";
import {
  actorObb,
  isContact,
  npcShellObb,
  NPC_VEHICLE_SHELL_HALF_LENGTH_M,
  NPC_VEHICLE_SHELL_HALF_WIDTH_M,
  obbDiscSeparationM,
  obbSeparationM,
  playerObb,
  PLAYER_HALF_LENGTH_M,
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

/** THE PHYSICS LAYER'S OWN BODY — the collider rapier reports through, stated
 *  separately from the candidate box the grader sizes, because in the product
 *  they come from two different sources and the defect lived in the gap. */
interface ColliderBody {
  readonly withWhat: "vehicle" | "pedestrian" | "cyclist";
  readonly box: Obb2D;
}

/** The kinematic shell NpcColliders binds to a `traffic.vehicles` agent — one
 *  size for the whole fleet, cyclist proxies included (NpcColliders
 *  VEH_HALF_W / VEH_HALF_L). */
function shellCollider(
  x: number,
  y: number,
  withWhat: ColliderBody["withWhat"] = "vehicle",
): ColliderBody {
  return {
    withWhat,
    box: {
      x,
      y,
      headingDeg: 0,
      halfLengthM: NPC_VEHICLE_SHELL_HALF_LENGTH_M,
      halfWidthM: NPC_VEHICLE_SHELL_HALF_WIDTH_M,
    },
  };
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
   *  function against pre-2026-08-19 candidate boxes. */
  naming?: "fixed" | "shipped" | "none";
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
      rt.pushCollision(
        withWhat,
        opts.naming === "none"
          ? undefined
          : opts.naming === "shipped"
            ? nameLikeShipped(withWhat, player, candidates)
            : nameLiveContact(withWhat, player, candidates),
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

/** The colliders of those wrecks. Sized to the shell here — which is what a
 *  fleet car's tight cuboid is within centimetres — so these drives isolate the
 *  EPISODE KEY and nothing else. The kargo_v drive below is the one that puts a
 *  real per-model collider in the lane. */
const wreckColliders = (...ys: number[]): ColliderBody[] =>
  ys.map((y) => shellCollider(LANE_X, y));

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
    const aside = hittableObstacleBodies([
      { kind: "vehicle", x: LANE_X + 6, y: 150, headingDeg: 0 },
    ]);
    expect(
      collisionBills([shellCollider(LANE_X + 6, 150)], aside, {
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
// THE BODY THAT COULD NOT BE NAMED AT ALL
//
// A "cyclist" in this product is a narrow curb-riding VEHICLE agent (audit C3's
// honest v1 model): `TrafficSystem.stage` puts it in `traffic.vehicles`, marks
// its state id from the staged spec's curb offset, and
// `vehicleCollisionKind(id)` returns "cyclist" — which is the tag NpcColliders
// stamps on the shell and the tag VehicleRig reports. So the body rapier hits
// is a 0.92 × 2.10 m shell, while `actorObb(pose, "cyclist")` is a 0.23 × 0.90
// bicycle. Naming it needed 1.20 m of penetration PAST the collider's own face,
// and the solver exists to prevent exactly that.
// ---------------------------------------------------------------------------

describe("a cyclist can be named — the case that was structurally impossible", () => {
  const player = playerObb(0, 0, 0);
  /** The staged cyclist's cast entry (runners.ts `vehicleCast(..., "cyclist")`
   *  — a BOX, and the profile it carries is the bicycle rig). */
  const cast = [{ actorId: "sc-vu-cyclist", withWhat: "cyclist" as const, body: "box" as const }];
  const behind = (gapM: number) => () =>
    ({ x: 0, y: gapM, dirX: 0, dirY: 1 }) as ActorPose;

  it("names the rider at the frame rapier fires, not 1.20 m later", () => {
    // The rear enter edge: player half-length 2.02 + shell half-length 2.10 =
    // 4.12 m between centres. This is the first frame rapier reports.
    const enterM = PLAYER_HALF_LENGTH_M + NPC_VEHICLE_SHELL_HALF_LENGTH_M;
    expect(enterM).toBeCloseTo(4.12, 6);
    const bodies = liveContactBodies(cast, behind(enterM), []);
    expect(nameLiveContact("cyclist", player, bodies)).toBe("sc-vu-cyclist");

    // THE MUTATION, and it is the code as it shipped: size the candidate from
    // the fleet profile instead of the collider. 4.12 m of centre separation
    // against a 2.02 + 0.90 = 2.92 m grading box is 1.20 m of clear air, so the
    // zero-tolerance test refuses — for ever, at every depth the solver allows.
    const asShipped: LiveContactBody[] = [
      {
        id: "sc-vu-cyclist",
        withWhat: "cyclist",
        box: actorObb(behind(enterM)(), "cyclist"),
      },
    ];
    expect(obbSeparationM(player, asShipped[0].box as Obb2D)).toBeCloseTo(1.2, 6);
    expect(nameLikeShipped("cyclist", player, asShipped)).toBeUndefined();
  });

  it("TWO riders struck 1.1 s apart bill TWO — as shipped they billed ONE", () => {
    // sc-hz-accident-scene's own spacing, riders instead of wrecks: two bodies
    // 12 m apart in the lane at 46 км/ч. The overlap windows are ±4.12 m of each
    // centre, so 3.76 m of silence between them — 0.29 s, well inside
    // collisionSeparationSec (1.2 s) and past COLLISION_REOPEN_TRAVEL_M (2 m).
    // The episode KEY is the only thing that decides the bill, and a name is
    // the only thing that makes the key.
    const cyclists = [
      { actorId: "sc-vu-cyclist-a", withWhat: "cyclist" as const, body: "box" as const },
      { actorId: "sc-vu-cyclist-b", withWhat: "cyclist" as const, body: "box" as const },
    ];
    const poses: Record<string, ActorPose> = {
      "sc-vu-cyclist-a": { x: LANE_X, y: 150, dirX: 0, dirY: 1 },
      "sc-vu-cyclist-b": { x: LANE_X, y: 162, dirX: 0, dirY: 1 },
    };
    const bodies = liveContactBodies(cyclists, (id) => poses[id] ?? null, []);
    const colliders = [
      shellCollider(LANE_X, 150, "cyclist"),
      shellCollider(LANE_X, 162, "cyclist"),
    ];
    const drive: DriveOpts = { speedKmh: 46, y0: 130, frames: 300, withWhat: "cyclist" };
    expect(collisionBills(colliders, bodies, drive)).toBe(2);

    // THE MUTATION: the same drive, named the way it shipped, against the
    // bicycle-sized candidates it shipped with. Every report is anonymous, so
    // the second rider joins the first's `kind:cyclist` episode and costs
    // nothing. One bill for two people on the road.
    const asShipped: LiveContactBody[] = cyclists.map((m) => ({
      id: m.actorId,
      withWhat: m.withWhat,
      box: actorObb(poses[m.actorId], "cyclist"),
    }));
    expect(collisionBills(colliders, asShipped, { ...drive, naming: "shipped" })).toBe(1);
  });

  it("one long shunt along one rider still bills ONE", () => {
    // The other direction, and the one a tolerance could break: 120 frames of
    // unbroken contact at a crawl must stay ONE accident. Every frame resolves
    // to the same id, so it is one episode, still open.
    const inLane = () => ({ x: LANE_X, y: 150, dirX: 0, dirY: 1 }) as ActorPose;
    const bodies = liveContactBodies(cast, inLane, []);
    expect(
      collisionBills([shellCollider(LANE_X, 150, "cyclist")], bodies, {
        speedKmh: 4,
        y0: 148.5,
        frames: 120,
        withWhat: "cyclist",
      }),
    ).toBe(1);
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
    const asShipped: LiveContactBody[] = [
      { id: "sc-fs-lead", withWhat: "vehicle", box: actorObb(pose(), undefined) },
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
    // THE MUTATION, and the measurement: as shipped, the first frames of the
    // contact — the ones that OPEN the episode — carried no name at all.
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
      { id: "sc-fs-lead", withWhat: "vehicle", box: actorObb(pose(), undefined) },
      ...hittableObstacleBodies(kargoSpec),
    ];
    expect(collisionBills(colliders, asShipped, { ...drive, naming: "shipped" })).toBe(1);
  });

  it("…and past the reach only the published footprint can save it", () => {
    // WHERE THE TWO HALVES OF THE FIX DIVIDE, measured rather than asserted.
    // Mutating `hittableObstacleBodies` to ignore its footprints leaves the
    // kargo_v drive above at TWO bills, because 0.57 m of unmodelled collider
    // is inside NAMING_REACH_M and the reach absorbs it. That is the reach
    // doing its job — and it is also the reason the footprints are not
    // optional: `box_truck` is a 7.5 m rig, halfLength 3.75 against the shell's
    // 2.10, so 1.65 m of its body is outside any reach it would be safe to
    // grant. `ScenarioVehicleObstacle` authorises exactly that placement (every
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
    // THE MUTATION: the same drive with the footprint withheld, i.e. the truck
    // graded as the canonical shell. Its opening frames go anonymous, the
    // anonymous episode absorbs the named one, and the lorry the student drove
    // into costs him nothing.
    const shellOnly = liveContactBodies(cast, pose, hittableObstacleBodies(spec));
    expect(collisionBills(colliders, shellOnly, drive)).toBe(1);
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
    const enterM = PLAYER_HALF_LENGTH_M + NPC_VEHICLE_SHELL_HALF_LENGTH_M; // 4.12
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
    const enterM = PLAYER_HALF_LENGTH_M + NPC_VEHICLE_SHELL_HALF_LENGTH_M;
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

  it("a staged candidate is the SHELL rapier binds, not the fleet profile", () => {
    // The cause, pinned at the source. NpcColliders binds ONE cuboid to every
    // `traffic.vehicles` agent whatever its profile ("one size fits the whole
    // GLB fleet — colliders are sized once"), so a candidate sized from the
    // profile is a different body from the one that reported.
    const pose = () => ({ x: 0, y: 0, dirX: 0, dirY: 1 }) as ActorPose;
    for (const withWhat of ["vehicle", "cyclist"] as const) {
      const box = liveContactBodies([{ actorId: "a", withWhat, body: "box" }], pose, [])[0]
        .box as Obb2D;
      expect(box.halfLengthM).toBe(NPC_VEHICLE_SHELL_HALF_LENGTH_M);
      expect(box.halfWidthM).toBe(NPC_VEHICLE_SHELL_HALF_WIDTH_M);
      expect(box).toEqual(npcShellObb(pose()));
    }
    // …and the profile box a `cyclist` would have been given is 1.20 m short of
    // it lengthwise and 0.69 m short across — the whole defect, in two numbers.
    const bicycle = actorObb(pose(), "cyclist");
    expect(NPC_VEHICLE_SHELL_HALF_LENGTH_M - bicycle.halfLengthM).toBeCloseTo(1.2, 6);
    expect(NPC_VEHICLE_SHELL_HALF_WIDTH_M - bicycle.halfWidthM).toBeCloseTo(0.69, 6);
  });

  it("an obstacle is sized from the PUBLISHED collider, shell only as fallback", () => {
    // ScenarioObstacles mounts a per-model tight cuboid measured off the loaded
    // rig, and no static table can state a GLB's extents — so it publishes
    // them. `kargo_v` is the shipped case: halfLength 2.67 against the shell's
    // 2.10, i.e. 0.57 m of collider a shell-sized candidate does not cover.
    //
    // A CORRECTION THIS ASSERTION FORCED. The first version of this test
    // claimed 0.57 m was "more than NAMING_REACH_M and therefore a body that
    // could never be named", and the assertion below said so — 0.57 is LESS
    // than 0.90, and it failed. The true statement is narrower and is why the
    // footprint channel exists anyway: the reach would indeed have masked
    // kargo_v, but only by spending its entire budget on a geometry error it
    // was not sized for (it is sized for the render-frame pose staleness, and
    // nothing else), and a `box_truck` obstacle — 3.75 against 2.10 — is
    // 1.65 m out, past any reach that is still safe to grant.
    const specs = [
      { kind: "vehicle" as const, x: 0, y: 0, headingDeg: 0, visual: true },
      { kind: "vehicle" as const, x: 0, y: 40, headingDeg: 0 },
      { kind: "vehicle" as const, x: 0, y: 80, headingDeg: 0 },
    ];
    const footprints: ObstacleColliderFootprint[] = [
      { index: 1, halfWidthM: 0.99, halfLengthM: 2.67 },
    ];
    const bodies = hittableObstacleBodies(specs, footprints);
    expect(bodies.map((b) => b.id)).toEqual(["obstacle:1", "obstacle:2"]);
    expect((bodies[0].box as Obb2D).halfLengthM).toBe(2.67);
    expect((bodies[0].box as Obb2D).halfWidthM).toBe(0.99);
    // Index 2 published nothing (a model whose rig has not resolved): the shell
    // is the fallback, which is also the window in which that obstacle has no
    // collider for rapier to report through.
    expect((bodies[1].box as Obb2D).halfLengthM).toBe(NPC_VEHICLE_SHELL_HALF_LENGTH_M);
    // The two numbers the correction above rests on, stated rather than
    // recalled: kargo_v is inside the reach, box_truck is not.
    expect(2.67 - NPC_VEHICLE_SHELL_HALF_LENGTH_M).toBeLessThan(NAMING_REACH_M);
    expect(3.75 - NPC_VEHICLE_SHELL_HALF_LENGTH_M).toBeGreaterThan(NAMING_REACH_M);
  });
});
