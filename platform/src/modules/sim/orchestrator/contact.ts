/**
 * sim/orchestrator/contact — the staged-actor CONTACT SENTINEL.
 *
 * WHY THIS IS NOT INSIDE THE RUNNERS ANY MORE (2026-08-10, register row B81).
 *
 * Every runner used to carry its own contact test as one branch of `step()`,
 * and every `step()` opens with `if (this.phase === "resolved") return null`.
 * So the instant a runner RETIRED — on a yield fault, on a cancelled
 * encounter, on "the actor cleared" — it stopped watching, and whatever the
 * player did to that actor afterwards was ungraded.
 *
 * Measured on the two SHIPPED sc-ov-narrow mistake demos (`mistake-barge`,
 * `mistake-force`): `NarrowMeetingRunner` retires on FAILED_TO_YIELD at
 * t = 20.38 s / 23.03 s, and the player then drives INTO the oncoming car and
 * stays there — 110 and 137 consecutive frames of real body overlap, deepest
 * at 2.25 m between centres where nose-to-tail touch is 4.07 m and flank-to-
 * flank touch is 1.77 m. Two cars occupying the same 4 m of street, and the
 * verdict the student saw was «не отстъпи предимство» — no crash at all. The
 * live Rapier path would have caught it in a browser; the TRACE channel, which
 * is what renders those demos to students, never runs Rapier.
 *
 * ⚠ THAT LAST CLAUSE IS FALSE, AND SWEEP 161 PHOTOGRAPHED IT (2026-08-19).
 * „The live Rapier path would have caught it in a browser" was the reason this
 * sentinel was scoped to the trace channel's problem alone. It does not hold
 * for STAGED actors, and the evidence is a frame rather than an argument:
 * `.audit-frames/sweep161/sc-ov-narrow/mobile-wrong/04-t017s.png` is the live
 * app on an iPhone 16, and the whole windscreen is the grey INSIDE of the
 * oncoming car with its red flank band running across it — the camera is
 * bodily within the other vehicle, at 0 км/ч, while the toast bills
 * «Пътнотранспортно произшествие». Both the right and the wrong drive end in
 * the same interpenetrated state.
 *
 * ⚠⚠ AND THE MECHANISM THIS HEADER THEN PUBLISHED IS ITSELF FALSE AT HEAD
 * (re-measured 2026-08-28). It read, in this slot: «`NpcColliders.tsx` pools
 * its kinematic bodies over `traffic.vehicles` — the AMBIENT fleet. Staged
 * actors are a different collection entirely and nothing in that file ever
 * reads it. So every actor a runner stages carries NO rapier collider in the
 * browser, and the player drives through all of them.» That was a hand-walked
 * grep, and it was wrong in the half that decides WHERE the row goes:
 *
 *   · `TrafficSystem.stage()` pushes every staged vehicle's state into
 *     `this.vehicles` — traffic/system.ts:653, the SAME array — and every
 *     staged pedestrian into `this.pedestrians` at :679.
 *   · `NpcColliders.tsx` scans `traffic.vehicles` (:307, :354, :388, :427,
 *     :497), so a staged actor is shell-eligible from the frame it is staged.
 *   · That is no longer a grep either: `components/sim/__tests__/
 *     stagedActorColliders.test.ts` carries a describe block named „staged
 *     actors ARE in the arrays the shell pool scans" and DRIVES the player
 *     into staged shells — the braking lead, the oncoming car, the cut-in
 *     truck, the tram, the officer's capsule — through real rapier. It landed
 *     in 25c2143, twelve hours after this paragraph was written.
 *
 * SO THE ROUTING THAT RESTED ON IT HAS TO MOVE. What survives of the frame is
 * NOT „staged bodies are ghosts"; it is the SHELL POOL'S BUDGET —
 * `VEHICLE_SHELL_COUNT` kinematic cuboids rebound every `REASSIGN_INTERVAL_SEC`
 * over a `VEHICLE_SHELL_RADIUS_M` neighbourhood. sc-ov-narrow stages an
 * oncoming car AND a stream AND parks a row of cars in a district with ambient
 * traffic; whether a shell is bound to the car the player is inside of, at the
 * frame he is inside of it, is a nearest-N churn question and it is
 * NpcColliders.tsx's. FIRST MEASUREMENT FOR WHOEVER TAKES IT: log the bound
 * agent ids at the contact frame, not the collider count.
 *
 * (Read w14 before re-quoting the sweep161 frame: on the newest leg of
 * sc-ov-narrow/mobile-wrong the symptom still reproduces — 04-t011s/04-t016s,
 * 0 км/ч, the windscreen full of the flat grey inside of the oncoming car with
 * its red flank band, the product's own chip reading «Дистанция · 0 м» — while
 * sc-ov-return-gap, filed on the SAME sentence, now ends inside a BUILDING
 * instead (w14 04-t054s/04-t059s, «Удар в неподвижно препятствие»), which is
 * the static-world class and neither this file's nor NpcColliders'.)
 *
 * NOT FIXED HERE, AND IT CANNOT BE: a sentinel reports, it does not move
 * bodies — the same boundary `collision/index.ts` states for itself («NO
 * CONTACT RESPONSE. Nothing here moves a body.»). WHAT DID CHANGE HERE is the
 * standing of this file: the sentinel is not the only thing that notices a
 * staged body being occupied any more, so its overlap report and rapier's
 * `onCollisionEnter` are TWO reporters on one event. They are already reconciled
 * by name rather than by category (`directorContactCast`, director.ts) — keep
 * that true, because the moment they invent two names the engine bills one
 * crash twice.
 *
 * ---------------------------------------------------------------------------
 * B84 — AND THE SECOND TIME, THE WATCH NEVER ARMED AT ALL (2026-08-10).
 *
 * B81's fix asked each runner to PUBLISH its strikeable bodies every frame
 * from a monotone `watching` latch, and pinned the invariant "a retired runner
 * still publishes". That invariant held. It just held over an EMPTY SET,
 * because `watching` was latched inside a narrative branch — for
 * `BrakingLeadCarRunner`, inside the slam. `sc-follow-standstill` deliberately
 * keeps the slam tier inert (`minSlamSpeedKmh` 250 on a street where nobody
 * reaches it; `slamAt` y = 520 on a 360 m road), so the latch could never arm.
 *
 * Measured on the shipped drill, driving the lane into the staged lead at
 * 30 km/h: first contact 13.08 s at 29.8 km/h, minimum separation −1.7675 m,
 * 93 CONSECUTIVE OVERLAP FRAMES — and ZERO contact bodies published across the
 * whole drive. The sheet read FOLLOWING_TOO_CLOSE, 3 наказателни точки,
 * passed = TRUE, for a student who ended nearly two metres inside another car.
 *
 * THE SHAPE OF THE FIX, THIS TIME. Not "also latch in the other branch" — that
 * is the same fragility with one more hole plugged. A car's body is solid
 * whether or not the script thinks this is the moment, so SOLIDITY IS NO
 * LONGER SOMETHING A RUNNER SAYS EACH FRAME. A runner declares its CAST once
 * (`EventRunner.contactCast` — a plain readonly array, no arguments, no
 * traffic port, no frame input, so there is nothing it could consult even if
 * it wanted to), the director snapshots that cast at construction, and this
 * sentinel resolves every member's live pose from the traffic port and sweeps
 * it EVERY FRAME OF THE SESSION. The runners are never asked again. A runner
 * that has already resolved, never armed, or arms only on a branch the drill
 * disables cannot make its actor pass through the player, because it is not
 * consulted about that at all.
 *
 * The geometry itself is untouched: the same `../collision` separating-axis
 * test on the same bodies, swept between frames, with the same per-encounter
 * nudge floors the runners always carried (a 2 km/h bumper kiss is not a
 * crash). Only the WATCH moved — twice, and this time out of reach.
 *
 * REPORTING DISCIPLINE: contact is a STATE, and this reports the state — every
 * frame the bodies overlap, for as long as they overlap. It does NOT bill
 * accidents, because "how many accidents is this" is one question with one
 * answer, and the rule engine already owns it (`collisionSeparationSec`: an
 * encounter opens on the first report, stays open while reports keep arriving,
 * closes after 1.2 s of silence). A rising-edge latch here would be a SECOND
 * answer to the same question, and a worse one — it was measured making the
 * `sc-rb-busy-gap` short-gap demo bill TWO «Пътнотранспортно произшествие» for
 * one crash, because the demo's authored contact beat landed 1.6 s into an
 * overlap this had already fallen silent about, and the engine could not know
 * the bodies had never come apart.
 *
 * WHY THE SPEED FLOOR MOVED (2026-08-10, register row B83). That paragraph was
 * the design and the code contradicted it: the floor test sat in the SAME
 * condition as the geometry, so this fell silent the moment the driver stopped
 * — and the rule engine, which closes an encounter on 1.2 s of silence
 * «because the bodies have come apart», was handed silence produced by a
 * STATIONARY CAR STILL EMBEDDED IN ANOTHER ONE. That is the founder's 90-point
 * complaint in smaller clothes. MEASURED on the shipped `sc-follow-brake`
 * through the production stack (createWorldRuntime + createTrafficSystem +
 * director + rule engine): nose into the standing lead, hold the brake, then
 * ease forward 0.6 m while the two bodies are still inside each other —
 *
 *   dwell 0.500 s (0.7833 s of silence) → 1 «Пътнотранспортно произшествие»
 *   dwell 0.800 s (1.0833 s)            → 1
 *   dwell 0.917 s (1.2000 s)            → 1
 *   dwell 0.933 s (1.2000 s)            → 1   ← the last innocent rung
 *   dwell 0.950 s (1.2333 s)            → 2   ← ONE FRAME (16.7 ms) of extra
 *                                               silence past the 1.2 s window
 *   dwell 1.000 s (1.2833 s)            → 2
 *   dwell 2.500 s (2.7833 s)            → 2  … 20 наказателни точки, two
 *                                             пътнотранспортни произшествия,
 *                                             for one crash in which the cars
 *                                             never came apart.
 *
 * The boundary sat exactly on `collisionSeparationSec` and on nothing about
 * the two cars: 260 frames of unbroken overlap, of which the sentinel reported
 * only the 83 the driver happened to be moving through.
 *
 * THE FIX IS ONE SENTENCE: the floor answers «is this touch a crash or a
 * bumper kiss», which is a question about the START of an encounter, so it is
 * asked ONLY THERE. Once a touch has cleared the floor the encounter is OPEN
 * for this body (`openKeys`) and every subsequent overlap frame is reported at
 * any speed, including none. The encounter closes on the one fact that is
 * actually measurable here — the exact geometry says the bodies are apart —
 * and the report stream stops on the same frame it does. Silence downstream is
 * then a SEPARATION FACT rather than an inference from an absence, which is
 * exactly what the rule engine's latch has always claimed to be reading.
 *
 * A 2 km/h bumper kiss is still not a crash and still opens nothing: a touch
 * that never cleared the floor is never reported at all. What is gone is the
 * ability of a shaken student — who does the one thing everyone does after
 * hitting something, and stops — to be charged twice for it.
 *
 * (This is deliberately NOT the rising-edge latch the paragraph above rejects.
 * A rising edge answers "how many accidents"; `openKeys` answers "is this
 * still the same touch", which is the question the geometry can actually
 * answer, and it emits on every frame rather than one.)
 *
 * ---------------------------------------------------------------------------
 * AND THE THIRD TIME, THE WATCH INVENTED THE CRASH (2026-08-28).
 *
 * THE PLAYER TELEPORTS MID-SESSION AND NOTHING TELLS THIS FILE. `VehicleRig`'s
 * kill-plane rescue is one line — `if (sim.positionY < KILL_PLANE_Y)
 * sim.reset()` (VehicleRig.tsx:534) — and `VehicleSim.reset()` is a teleport:
 * `setTranslation(spawnTranslation)` + `setRotation(spawnRotation)` +
 * `setLinvel(0)`. A car that leaves the carriageway and drops through the
 * world is put back on the spawn mark, at rest, in ONE FRAME.
 *
 * The paired call does not exist on that path. `resetCar` — key R and the touch
 * sheet's „Рестарт" — correctly pairs `simRef.current.reset()` with
 * `directorRef.current.reset()` (LessonScene.tsx:1808-1810), and
 * `director.reset()` calls `sentinel.reset()` FIRST (director.ts:157) for
 * exactly this reason, in a comment that says so: «Actors TELEPORT back to
 * their hold poses — the swept probe must forget every remembered pose or it
 * sweeps across the player on the retry frame.» The kill plane calls
 * `sim.reset()` ALONE. `sentinel.reset()` has one non-test caller in the tree
 * and the rescue is not it.
 *
 * SO THE PROBE HOLDS THE PRE-FALL POSE AND SWEEPS THE JUMP AS MOTION. It is
 * the identical crime the probe's own header names in the other direction —
 * «inventing a crash out of a re-stage is the same crime» — and the arithmetic
 * that used to make it unreachable is gone: `obb.ts`'s 12 m teleport guard now
 * only decides whether the interval is swept in ONE call or SUBDIVIDED, and
 * everything up to `SWEEP_FRAME_TRAVEL_M` (60 m) is treated as real motion.
 *
 * MEASURED against this class, one staged car standing on the origin doing
 * 25 m/s and the oncoming-stream cast verbatim (runners.ts:3814 — floor 5,
 * `closing: "combined"`, so the ACTOR's speed alone clears the floor while the
 * player sits at 0 км/ч). The player is CLEAR of the car before the jump and
 * CLEAR of it after; only the straight line between the two poses crosses it:
 *
 *   jump      swept as        «Пътнотранспортно произшествие» billed
 *   10 m      one call        1     ← the student never touched anything
 *   12 m      one call        1
 *   20 m      subdivided      1
 *   40 m      subdivided      1
 *   59 m      subdivided      1
 *   60 m      subdivided      1
 *   62 m      current pose    0     ← safe, and safe BY ACCIDENT
 *   200 m     current pose    0
 *
 * −10 изпитни точки, ОПАСНА ГРЕШКА, НЕИЗДЪРЖАН, for a car that was never
 * within four metres of him. That is the founder's own complaint in its worst
 * direction, and a lesson that convicts a student of an accident he did not
 * have teaches him nothing except that the instrument lies.
 *
 * THE FIX IS NOT A CALLBACK. Asking `VehicleRig` to notify the director is the
 * B84 mistake a third time: a per-frame duty that a caller can forget has a
 * per-frame wrong answer available to it, and this one has been forgotten for
 * as long as the kill plane has existed. The sentinel is ALREADY HANDED
 * everything it needs to notice the jump by itself — `DirectorInput` carries
 * `x`, `y`, `speedKmh` and `dtSec` — so it asks the question nobody can decline
 * to answer: DID THE PLAYER MOVE FURTHER THAN HIS OWN SPEED CAN ACCOUNT FOR?
 * If he did, the remembered pose is not last frame's; it is the other side of a
 * jump, and every remembered pose is dropped before a single sweep runs.
 *
 * It is deliberately blind to WHY. A kill-plane rescue, a future respawn, a
 * debug teleport and a dropped frame all present as the same fact, and the
 * answer is the same for all of them: this interval is not motion, so do not
 * sweep it. The frame degrades to the exact single-pose test `obb.ts` has
 * always fallen back to — which reports a REAL overlap at the new pose and
 * refuses to invent one on the way there.
 *
 * Deterministic: no clock, no RNG, no module state. `dtSec` is the director's
 * own frame interval, handed in with the pose it belongs to — the same input
 * that decides every other number here, replayed identically by the gates.
 */

import {
  actorObb,
  ContactProbe,
  isContact,
  PEDESTRIAN_BODY_RADIUS_M,
  playerObb,
  PLAYER_HALF_LENGTH_M,
  PLAYER_HALF_WIDTH_M,
} from "../collision";
import type { SimTickEvent } from "../rules";
import type { VehicleProfile } from "../traffic/types";
import type { DirectorInput, StagedTrafficPort } from "./types";

/** What the rule engine is told the contact was with (existing vocabulary). */
export type ContactWith = "vehicle" | "pedestrian" | "cyclist";

/**
 * ONE STAGED BODY OF AN EVENT'S CAST — declared, not published.
 *
 * This is a DESCRIPTION of a body that exists in the world, and it is
 * deliberately inert data: a runner builds its `contactCast` array and hands
 * it over, and from then on the sentinel resolves the live pose itself off the
 * traffic port. There is no per-frame call a runner could decline to make and
 * no state it could consult — which is precisely the B84 lesson.
 *
 * Vehicles (and the v1 cyclist proxy, a narrow vehicle agent with a real
 * heading) are BOXES sized from their own profile; pedestrians are DISCS,
 * because a walker has no body heading.
 */
export interface ContactCastMember {
  /** Id of the staged actor in the traffic system (the probe's memory key). */
  readonly actorId: string;
  /** The owning staged event's id, so the sentinel can tell its runner. */
  readonly ownerId: string;
  readonly withWhat: ContactWith;
  /** "disc" = pedestrian (no body heading); "box" = everything else. */
  readonly body: "box" | "disc";
  /** Fleet profile that sizes the box (absent = car). Unused for discs. */
  readonly profile?: VehicleProfile;
  /**
   * At or below this closing speed a touch is a nudge, not a crash, km/h —
   * the per-encounter floor each runner has always carried, moved verbatim.
   */
  readonly minClosingKmh: number;
  /** "combined" = |player| + actor speed; "player" = the player's alone. */
  readonly closing: "combined" | "player";
  /**
   * FRONTAL ONLY — bill this body only while it is AHEAD of the player, i.e.
   * while the player is the striker. Carried by the roundabout circulator: a
   * circulator that runs into the BACK of a car already in the ring is the
   * traffic guard's business, not the student's fault. Purely GEOMETRIC (it
   * reads this frame's two poses and nothing else), so it is a property of the
   * encounter, not of its script.
   */
  readonly frontalOnly?: boolean;
}

/**
 * How much further than his own speed accounts for the player may move in one
 * observed interval and still be MOVING rather than JUMPING, m.
 *
 * The budget itself is `max(|speed now|, |speed last frame|) × dtSec`, and the
 * larger of the two endpoints is used because a frame's MEAN speed cannot
 * exceed its larger endpoint while the speed is monotone — which is every
 * ordinary frame, accelerating or braking. Compare against the current speed
 * alone and a hard brake from 90 to 30 km/h in one hitch frame reads as a jump,
 * which would silently disarm the sweep on the exact frame a crash happens on.
 *
 * This slack covers what monotonicity does not:
 *
 *   · a frame in which the speed rose and fell again, whose peak exceeds both
 *     endpoints by at most a·dt/2 and therefore its distance by at most
 *     a·dt²/8 — 0.23 m at the staged slam decel of 7.5 m/s² across rapier's
 *     0.5 s frame cap, 0.63 m even at a wholly implausible 20 m/s²;
 *   · `x`/`y` being the physics pose while `speedKmh` is the sampled scalar
 *     beside it, so the two may be one integration step apart.
 *
 * 2 m is ~3× the worst of those and still far under the shortest jump that can
 * fabricate anything: crossing a body the player was clear of takes at least
 * 2 × (`PLAYER_HALF_LENGTH_M` + the other half-extent) — 8.2 m against a car,
 * 4.8 m against a pedestrian disc. So the guard cannot fire on real motion and
 * cannot miss a jump that matters, and the gap between the two is wide enough
 * that neither edge is resting on the last bit of a float.
 */
const PLAYER_JUMP_SLACK_M = 2;

export class ContactSentinel {
  private readonly probe = new ContactProbe();
  /**
   * Last frame's player pose and speed — the ONLY state this class keeps about
   * the player, and it exists to answer one question: was this interval motion?
   * See the header's third section. `hasLastPlayer` is false at session start
   * and after `reset()`, and a first frame is never judged: there is nothing
   * remembered to sweep from, so there is nothing to invent.
   */
  private lastPlayerX = 0;
  private lastPlayerY = 0;
  private lastPlayerKmh = 0;
  private hasLastPlayer = false;
  /** Event ids in contact this frame (rebuilt per frame; no allocation). */
  private readonly hitOwners = new Set<string>();
  /**
   * B83 — actor ids whose ENCOUNTER IS OPEN: bodies that have been in unbroken
   * contact with the player since a touch that cleared the nudge floor (and,
   * where it applies, the frontal gate). Membership is set by the geometry and
   * cleared by the geometry — a member leaves this set on the first frame the
   * exact separation says the bodies are apart, and on no other event. Nothing
   * about the driver's speed, the runner's phase or the clock can remove a key.
   *
   * That is the whole repair: while a key is in here the overlap is reported
   * every frame at ANY speed, so the silence the rule engine closes encounters
   * on is produced by separation and by nothing else.
   */
  private readonly openKeys = new Set<string>();

  /** Forget every remembered pose (call whenever actors teleport). */
  reset(): void {
    this.probe.reset();
    this.hitOwners.clear();
    this.openKeys.clear();
    // …including the player's. An attempt restart teleports HIM too
    // (`resetCar` pairs `sim.reset()` with this), so the next frame must be
    // treated as a first frame rather than as a 300 m sprint from the old mark.
    this.hasLastPlayer = false;
  }

  /**
   * Sweep every cast member against the player and report every overlap into
   * `out`. Returns the set of staged-event ids in contact this frame — the
   * director hands it to the runners so the one that owns the encounter can
   * still resolve it as a crash.
   *
   * `cast` is the SESSION's cast, snapshotted once: this runs on every frame
   * from the first, whatever any runner's phase is.
   */
  watch(
    cast: readonly ContactCastMember[],
    traffic: StagedTrafficPort,
    input: DirectorInput,
    out: SimTickEvent[],
  ): ReadonlySet<string> {
    this.hitOwners.clear();
    if (cast.length === 0) return this.hitOwners;
    // DID HE MOVE, OR WAS HE MOVED? Answered BEFORE any sweep, off the pose and
    // the clock the director already hands over, because the one caller that
    // teleports him without saying so (VehicleRig's kill-plane rescue) has been
    // silent for as long as it has existed and a notification it can forget is
    // not a guard. A jump drops every remembered pose, so this frame is judged
    // on the exact geometry at the new pose alone — the same fallback `obb.ts`
    // takes for a re-stage — instead of dragging the player through whatever
    // stood on the line between the two. See the header's third section for the
    // measurement: 10 m through 60 m each billed one accident that never
    // happened.
    if (this.hasLastPlayer) {
      const movedM = Math.hypot(input.x - this.lastPlayerX, input.y - this.lastPlayerY);
      const fastestMps =
        Math.max(Math.abs(input.speedKmh), Math.abs(this.lastPlayerKmh)) / 3.6;
      const budgetM = fastestMps * Math.max(0, input.dtSec) + PLAYER_JUMP_SLACK_M;
      if (movedM > budgetM) {
        this.probe.reset();
        // He is not inside anything he was inside a frame ago: he is somewhere
        // else. Every encounter that was open against him ended when he left.
        this.openKeys.clear();
      }
    }
    this.lastPlayerX = input.x;
    this.lastPlayerY = input.y;
    this.lastPlayerKmh = input.speedKmh;
    this.hasLastPlayer = true;
    const player = playerObb(input.x, input.y, input.headingDeg);
    // SPEED IS A MAGNITUDE HERE, NOT A DIRECTION. The live channel
    // (LessonScene → VehicleSample.speedKmh) hands the director a SIGNED
    // speed, negative in reverse, while the trace recorder hands it an
    // unsigned one — so an unsigned floor comparison silenced every reversing
    // contact in the browser and nowhere else. Reversing into a parked car at
    // 10 km/h is a crash at 10 km/h.
    const playerKmh = Math.abs(input.speedKmh);
    for (let i = 0; i < cast.length; i++) {
      const m = cast[i];
      const actor = traffic.staged(m.actorId);
      if (actor === null) {
        // No body in the world = nothing to be inside of. The encounter cannot
        // still be open against an actor that is not there.
        this.openKeys.delete(m.actorId);
        // …and neither can the POSE MEMORY be, which is the sibling of the
        // player-jump guard above and the case `ContactProbe.forget` was
        // written for verbatim («an actor that leaves the world … comes back
        // reporting −0.070 m of penetration where the two bodies are in fact
        // 3.680 m apart»). STATED AS LATENT RATHER THAN SOLD AS A FIX: no
        // production port flips an id from absent back to present today —
        // `TrafficSystem.stagedById` is never deleted from, so a cast member
        // that resolves is null only if its own `stage()` failed, permanently.
        // This closes the gap before a lazily-staged actor opens it, and it is
        // what makes `forget`'s documented contract true instead of aspirational.
        this.probe.forget(m.actorId);
        continue;
      }
      const sepM =
        m.body === "disc"
          ? this.probe.discSeparationM(m.actorId, player, actor.x, actor.y, PEDESTRIAN_BODY_RADIUS_M)
          : this.probe.vehicleSeparationM(m.actorId, player, actorObb(actor, m.profile));
      // THE ONLY THING THAT CLOSES AN ENCOUNTER: the exact geometry says the
      // two bodies are apart. This is the separation FACT the rule engine's
      // «the bodies have come apart» has always been quietly assuming (B83).
      if (!isContact(sepM)) {
        this.openKeys.delete(m.actorId);
        continue;
      }
      // …and the only place the crash-or-kiss questions are asked: at the
      // START of an encounter. A touch that never cleared the floor opens
      // nothing and is never reported (a 2 km/h bumper kiss is not a crash);
      // once one HAS cleared it, every later frame of the same unbroken
      // contact is the same accident, still happening, and is reported whether
      // the driver is still moving, has stopped dead, or is easing forward
      // through the wreck.
      if (!this.openKeys.has(m.actorId)) {
        const closingKmh =
          m.closing === "combined" ? playerKmh + Math.abs(actor.speedMps) * 3.6 : playerKmh;
        if (closingKmh <= m.minClosingKmh) continue;
        if (m.frontalOnly === true) {
          const rad = (input.headingDeg * Math.PI) / 180;
          const ahead =
            (actor.x - input.x) * Math.sin(rad) + (actor.y - input.y) * Math.cos(rad);
          if (ahead <= 0) continue;
        }
        this.openKeys.add(m.actorId);
      }
      this.hitOwners.add(m.ownerId);
      // THE ID TRAVELS WITH THE REPORT. This loop has always known exactly
      // WHICH staged body it is inside of — `m.actorId` is the probe's own
      // memory key, three lines up — and used to hand the rule engine only the
      // category, which then had to latch per KIND and gave the second of two
      // staged bodies away free (see engine.ts's `collision` case). Nothing
      // about the reporting cadence changes: this is still a per-frame report
      // for as long as the geometry says the bodies overlap, and the engine
      // still collapses that stream into one bill. It is the same rising edge,
      // told which body it belongs to.
      out.push({ kind: "collision", withWhat: m.withWhat, actorId: m.actorId });
    }
    return this.hitOwners;
  }
}

/**
 * THE PUBLISHER FOR `SimTick.vruAheadM` — how far ahead, in the car's own path,
 * the nearest STAGED PERSON is standing. `Infinity` = nobody is.
 *
 * WHY THIS EXISTS AND WHY IT IS THE WHOLE FIX. `rules/engine.ts`'s ban-zone
 * block already reads `tick.vruAheadM` and already acquits on it: a car at rest
 * under a В27 with a person inside `banZoneVruAheadM` is not billed
 * ILLEGAL_STOP_IN_BAN_ZONE. That acquittal has been ARMED AND SILENT since
 * 2026-08-23, because nothing in the product ever wrote the field — the block's
 * own closing paragraph says so in as many words: „WHAT IT STILL NEEDS, AND
 * THIS FILE CANNOT DO IT: a publisher." So the finding it was written for kept
 * reproducing: `.audit-frames/w10-1/frames/sc-hz-accident-scene__mobile-right/
 * 04-t119s.png` and 04-t124s.png — «ⓘ Спиране в забранена зона» twice, cluster
 * at 0 км/ч, a bystander against the bonnet, on the lesson whose whole subject
 * is that people are standing in the road. A student is convicted for stopping
 * for a human being.
 *
 * WHY THE MEASUREMENT LIVES HERE. This module already resolves every staged
 * body's live pose off the traffic port each frame and already computes the
 * „is it ahead of me" projection for `frontalOnly`. Re-deriving either in
 * `LessonScene` would put grading geometry in a component (doc 05) and give one
 * question two answers — the exact failure `directorContactCast` exists to
 * prevent for the contact ids.
 *
 * THE CORRIDOR IS THE NARROWEST HONEST READING, deliberately. The engine's own
 * contract calls this „a PERSON in the path", and a rule that acquitted for
 * anyone merely NEARBY would hand the В27 code back its opposite defect: a
 * deliberate curb stop beside a busy pavement would stop being billed, which is
 * „loosening a check until it credits everybody". So a person counts only while
 * his disc overlaps the band the car's own body sweeps — `PLAYER_HALF_WIDTH_M +
 * PEDESTRIAN_BODY_RADIUS_M` either side of the centreline — and the distance
 * returned is BUMPER TO BODY, not centre to centre, so it means the same thing
 * `leadGapM` means one exemption up.
 *
 * PEDESTRIANS ONLY (`body === "disc"`), and the omission is named rather than
 * implied: a cyclist is staged as a narrow BOX with a real heading, so „is he in
 * my path" is an oriented-box question and not a disc one. Answering it with the
 * pedestrian radius would be a guess in the direction that acquits, which is the
 * direction this function may never guess in. Until a cyclist is measured with
 * his own geometry, a stop for one is judged as it is today.
 *
 * ONE-DIRECTIONAL, like the field it feeds: this number can only ACQUIT.
 * Nothing convicts on it, and nothing may — see the engine block.
 */
export function vruAheadMeters(
  cast: readonly ContactCastMember[],
  traffic: StagedTrafficPort,
  x: number,
  y: number,
  headingDeg: number,
): number {
  if (cast.length === 0) return Number.POSITIVE_INFINITY;
  const rad = (headingDeg * Math.PI) / 180;
  const fx = Math.sin(rad);
  const fy = Math.cos(rad);
  const HALF_CORRIDOR_M = PLAYER_HALF_WIDTH_M + PEDESTRIAN_BODY_RADIUS_M;
  let nearest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < cast.length; i++) {
    const m = cast[i];
    if (m.body !== "disc") continue;
    const actor = traffic.staged(m.actorId);
    if (actor === null) continue;
    const dx = actor.x - x;
    const dy = actor.y - y;
    // Forward is (sin, cos) — the same projection `frontalOnly` uses above;
    // right is its perpendicular (cos, −sin).
    const ahead = dx * fx + dy * fy;
    if (ahead <= 0) continue;
    if (Math.abs(dx * fy - dy * fx) > HALF_CORRIDOR_M) continue;
    const gap = Math.max(0, ahead - PLAYER_HALF_LENGTH_M - PEDESTRIAN_BODY_RADIUS_M);
    if (gap < nearest) nearest = gap;
  }
  return nearest;
}
