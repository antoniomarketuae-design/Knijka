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
 * Deterministic: no clock, no RNG, no module state.
 */

import {
  actorObb,
  ContactProbe,
  isContact,
  PEDESTRIAN_BODY_RADIUS_M,
  playerObb,
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

export class ContactSentinel {
  private readonly probe = new ContactProbe();
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
