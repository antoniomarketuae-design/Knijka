"use client";

/**
 * RearProximityCue — the rear-awareness fallback badge (PROX): a small
 * „Кола отзад · X м" chip centered just above the status dashboard whenever a
 * REAL vehicle sits in the lane corridor behind the player within ~15 m.
 * Pure DOM overlay — works identically in cockpit/chase/top-down and on every
 * quality preset (it is the low-tier stand-in for the chase mirror strip,
 * which arrives in a later wave). NO sound, by design.
 *
 * Data path: polls traffic.rearGapMeters(player pose) at ~5 Hz off the shared
 * per-frame sample ref — no 60 Hz React state, no useFrame, and the poll
 * allocates only on a visible CHANGE (stepRearCue returns the previous
 * snapshot identity otherwise, so setState bails out). Honesty (doc 62
 * #39/#48): the badge renders exclusively from published traffic geometry —
 * stepRearCue maps the no-vehicle report (Infinity) to null in every state;
 * see rearProximity.ts and its tests.
 *
 * Placement: bottom-center at the shell's above-dashboard line (6.75rem —
 * the Minimap/legend row), clear of the minimap (right-3), the ribbon legend
 * (left-3), the touch sliders (edges) and the StatusDashboard itself.
 *
 * ── O53 IS REFUTED, AND THIS COMMENT IS WHAT MANUFACTURED IT ───────────────
 *
 * WHAT THIS BLOCK USED TO SAY. That the „ДЕМОНСТРАЦИЯ — СЛЕДВАЙ СЯНКАТА"
 * transport covers this badge — deck and badge both `bottom-[6.75rem]
 * left-1/2 -translate-x-1/2`, the deck 416 px wide at x 432 on a 1280 px
 * stage, i.e. dead centre — and that the answer was for `PlayAreaStyles` to
 * lift the badge above 213 px while the transport is up. Finding O53 („the
 * rear-proximity badge is hidden by the shadow transport") is that paragraph
 * re-filed as a defect. It was true when it was written and it stopped being
 * true within the week.
 *
 * WHY IT IS FALSE NOW, read off the rendered cascade rather than off the
 * Tailwind classes. `PlayAreaStyles` overrides the deck in ALL FOUR states and
 * not one of them is centred: 2026-08-03 dragged it into the right-edge column
 * (`left: auto` plus `transform`/`translate: none`), 2026-08-10 inset it by the
 * map toggle's lane, the OPEN roomy panel moved to the LEFT corridor
 * (`DECK_ROOMY_OPEN_LEFT_CSS`), and compact raised its floor off 108 px to
 * `TOUCH_CONTROLS_FLOOR`. The two boxes share no column in any state. And they
 * could not be arbitrated even if they did: this badge carried NO `data-hud`
 * attribute, so the shipped stylesheet contained zero rules able to match it —
 * `PlayAreaStyles` could not move this badge, which is the one thing the
 * paragraph above asked it to do.
 *
 * IMPLEMENTING O53 WOULD HAVE BEEN A FALSE REFUSAL IN LAYOUT FORM: a badge
 * lifted off a floor that is correct on every roomy stage, to clear a panel
 * that left the corridor a fortnight earlier.
 *
 * ── WHAT IS ACTUALLY WRONG WITH THIS SURFACE ───────────────────────────────
 *
 * ONE. IT HAD NO NAME, so nothing in this project could see it or place it.
 * Every overlap probe in `tools/mobile` resolves a box's owner through
 * `closest("[data-hud]")`, and every arbitration rule in `PlayAreaStyles`
 * selects on that attribute. An unnamed surface is read straight through and
 * counted as absent — a zero in the reassuring direction. Not a hypothesis:
 * this is the third recorded instance of one failure in this repo. The
 * shadow-line ribbon legend („every overlap probe in this row, all of which
 * iterate [data-hud], reported a clean zero straight through it") was 7 878
 * px² and a TOTAL occlusion, found the moment it was named; the objective
 * banner was 17 frames of the 161-scenario sweep and 4 698 px² of two ghost
 * surfaces compositing glyph-for-glyph. This badge was the third. It has a
 * name now, and that is what lets the rule below exist and the next probe see
 * it at all.
 *
 * TWO. 108 px IS THE ROOMY INSTRUMENT FLOOR, AND ON A PHONE IT IS INSIDE THE
 * THUMB BAND. `ROOMY_HUD_FLOOR_PX` is 108 (`lesson-ui/immersive.ts`), so this
 * floor is exactly right on a desktop and is deliberately left alone there.
 * On a phone it is the wrong band, and `TouchControls` already carries the
 * WebKit measurement of a chip this size at this exact floor (iPhone 16
 * portrait 393×852):
 *
 *     at 108 px (bottom-[6.75rem], the roomy floor)  wheel 981 px², throttle 363 px²
 *
 * Recomputed here from the pads' own exported geometry (stage 377 × 836 after
 * the shell's p-2): `touchControlsFloorPx` is 382 px, so this badge floats
 * 274 px INSIDE the control band, and the clear corridor between the two pads
 * on that row is 66.94 px wide — 59.68 px on both 360-px Androids. «Кола
 * отзад · 12 м» is not 67 px, so there is no width at which a centred chip
 * works on that floor. The demonstration deck and the minimap column were both
 * moved off it for precisely this; this one, having no name, was not.
 *
 * IT IS STILL NOT MOVED, AND THAT IS A MEASUREMENT RATHER THAN A SHRUG. The
 * obvious rule — hand it `TOUCH_CONTROLS_FLOOR` on compact, the way those two
 * were handed it — was written, measured and REJECTED: in compact portrait the
 * deck stands on that same floor, so the badge lands 848 px² under its
 * collapsed pill and ENTIRELY inside its open panel, later in DOM order at the
 * same z-10. That is the occlusion O53 falsely alleged, actually created. The
 * arithmetic, the two candidate answers and the routing are written out in
 * full at the rule site in `PlayAreaStyles.tsx`. All three LANDSCAPE profiles
 * — the orientation this product drives in — are clear at 108 px today, which
 * is why this is a routed row and not a stop-the-line.
 *
 * ── O59: THE COVERAGE CLAIM WAS FALSE ON A WHOLE FAMILY — CLOSED 2026-08-20 ─
 *
 * WHAT THIS BLOCK USED TO SAY, and it was true. „The universal rear-awareness
 * fallback" is a claim about COVERAGE. `traffic.rearGapMeters` was
 * `rearGapFor(this.vehicles…)`, and `this.vehicles` holds exactly two things:
 * ambient agents seeded on the road graph, and `stage()`d actors. A parking-bay
 * occupant is neither — it is authored in the district
 * (`meta.scenario.bays[].occupied`), turned into a hittable obstacle by
 * `scene/lessonWorldRecipe.ts` and mounted with its own collider by
 * `components/sim/ScenarioObstacles` — and a parking lot carries no road-graph
 * traffic to seed ambient agents from either. So the badge was silent across
 * the whole parking family while `sc-park-narrow` step 4 told the student
 * „движи се назад съвсем бавно и следи двете съседни коли": the lesson naming
 * a cue the world would not give him. The same student, the same metre of air,
 * one warned and one not, decided purely by which array the body was put in.
 *
 * MEASURED BEFORE THE FIX, by replaying every committed drive of the family
 * through the shipped query — 51 traces under `content/traces/sc-park-*`,
 * 36,367 samples, 11 lot districts: FINITE READS = 0. Infinity from the first
 * frame of every drive to the last, and `stepRearCue` maps Infinity to null in
 * every state, so the sole rear instrument on a low-tier phone was dark for the
 * whole of the only manoeuvre that is performed backwards.
 *
 * FIXED IN `traffic/system.ts`, NOT HERE, and this component did not change:
 * `occupiedBayBodies` builds each occupant with `actorObb` (the same function
 * that sizes the kinematic shell rapier binds) and `rearStaticGapFor` measures
 * it with `obbSeparationM` (the signed separation the contact grader itself
 * reports), against the corridor the chassis would sweep going straight back.
 * `rearGapMeters` is now the NEARER of that and the unchanged moving-vehicle
 * sweep — one answer over both kinds of body. After it, on the same corpus:
 *   · sc-park-narrow's CORRECT drive raises the badge at 2.34 m while reversing
 *     at 3.83 km/h, bottoms at 0.12 m, and goes dark again once the car is
 *     straight in the bay — no «Кола отзад · 0 м» on a finished manoeuvre;
 *   · its WRONG drive, the one whose debrief says the rear quarter clipped the
 *     neighbour, is warned at 3.51 m — 2.65 s and 2.82 m of reversing before
 *     the bodies actually overlap;
 *   · driving the lane past the 37 legally parked cars of vu-door-v1 and
 *     pk-double-v1 raises the badge on 0 of 722 poses. A cue that fires always
 *     is wallpaper, and that is the same crime pointing the other way.
 * All four directions are pinned, by mutation, in
 * `traffic/__tests__/rear-static-gap.test.ts`.
 *
 * ── O61: THE BADGE CAN NOW SAY THE ONE THING THAT MATTERS — CLOSED 2026-08-20 ─
 *
 * WHAT THIS BLOCK USED TO SAY, and it was measured and true. The red band could
 * not reach a parking manoeuvre: `rearProximity.ts` gated „danger" on
 * `Math.abs(speedKmh) >= REAR_CUE_MOVING_KMH` (5), and a parking manoeuvre runs
 * at 2–4 km/h BY DEFINITION, so the one situation this cue exists for was the
 * one situation structurally forbidden from raising its voice. MEASURED at
 * sc-park-narrow's closest approach — 0.116 m of air at −3.828 km/h — the badge
 * showed AMBER, and over that whole drive the level histogram was 739 × none,
 * 66 × warn, **0 × danger**.
 *
 * FIXED BY SPLITTING ONE NUMBER INTO THE TWO QUESTIONS IT WAS ANSWERING. RED is
 * about DISTANCE (`REAR_CUE_DANGER_M`, unchanged); the speed gate is about
 * RELEVANCE — is the gap CLOSING. `rearCueClosing` now answers only the second,
 * and answers it in two ways: reversing at all (below −0.8 km/h, the same
 * threshold at which the cockpit's gear readout says „R"), or moving at traffic
 * speed either way (the original gate, verbatim, so a tailgater at 50 km/h is
 * unchanged). A car standing still with a wall behind it is neither, which was
 * the gate's real job and is preserved by measurement: over all 51 recorded
 * parking drives, red frames while NEITHER reversing NOR at traffic speed = 0,
 * and slow reversing with 4 m or more of air behind = 571 samples, 0 of them
 * red. This component did not change.
 *
 * ── O62: THE BADGE NOW SEES WHAT THE SCENE MOUNTED — CLOSED 2026-08-20 ──────
 *
 * The district carries bay occupancy; it does not carry the panel van of
 * `lot-van-v1`, which `scene/scenarioSceneryProps.heldSceneryFor(lesson.id,
 * raw)` adds by lesson id, `buildLessonWorldCore` folds into
 * `built.scenarioObstacles`, and `ScenarioObstacles` gives a real collider.
 * `LessonScene` holds that array and the exact collider extents at once, so the
 * receiver (`traffic.setRearStaticBodies`) and its caller landed together —
 * this file still adds no API of its own, because an API with no caller is the
 * „schema that lies" `scene/obstacleSpec.ts` warns about.
 *
 * MEASURED on sc-park-van, replaying its shipped drives before and after:
 * `shadow-correct` 44 → 73 finite reads and `mistake-early-turn` 97 → 169, and
 * the held van is the NEAREST body behind the student on every one of them.
 * The badge was not silent on that lesson — it was reporting the neighbouring
 * BAY car at 3.56 m while the body the student was actually reversing at sat
 * 0.40 m behind. „Кола отзад · 4 м" with a van forty centimetres away is worse
 * than nothing, because a student reads it and keeps going.
 *
 * ── THE CYCLIST HALF OF THAT LIMIT — CLOSED 2026-09-04 ─────────────────────
 *
 * WHAT THIS BLOCK USED TO SAY, and it was only half true: „A BODY THAT IS NOT A
 * CAR CANNOT BE REPORTED AT ALL … `rearStaticBodiesFrom` deliberately feeds only
 * vehicles." That care went into the STATIC half. The MOVING half never had it:
 * `rearGapFor` sweeps `this.vehicles`, and a v1 cyclist is a narrow curb-riding
 * STAGED VEHICLE AGENT sitting in that very array (audit C3), so the badge
 * reported riders all along — under a car's sentence and a car's glyph.
 *
 * MEASURED, on the row's own frame. `.audit-frames/sweep161/
 * sc-vu-cyclist-hook/mobile-right/04-t184s.png` shows «Кола отзад · 12 м» on
 * `vu-cyclist-v1`, a map with ONE building, no parking bays and no held
 * scenery, in a lesson that runs ambient traffic 0 (`SC_VU_CYCLIST_HOOK`
 * authors no `traffic`). The only body the query can return there is the staged
 * rider — `extraRightOffsetM 2.6` against `LEAD_CORRIDOR_M` 4.0, squarely
 * inside the corridor — and «Кола отзад» sent the student to the mirror looking
 * for the wrong hazard in the one rung about not turning right across him.
 *
 * WHAT LANDED, as the old text prescribed and in one change: a gap query that
 * carries the body KIND (`TrafficSystem.rearBodyBehind`, from which
 * `rearGapMeters` is now derived so the number and the noun are one sweep) and
 * a second authored Bulgarian string («Велосипедист отзад · X м») with its own
 * glyph. The kind is `vehicleCollisionKind`'s — the same A11 marker the rapier
 * shell is tagged with and «Удар във велосипедист» is billed from, not a second
 * opinion.
 *
 * ── AND WHAT IS STILL NOT COVERED, because silence here reads as „clear" ────
 *
 * A WALL STILL CANNOT BE REPORTED. One exists in the product (`sc-park-wall`'s
 * garage end wall, an exact cuboid collider a student can hit) and
 * `rearStaticBodiesFrom` still does not feed it, because „Кола отзад · 1 м"
 * about concrete is the badge stating something false. Closing that needs a
 * third string and a static kind on `RearBodyBehind`; the seam is now there for
 * it. Not urgent on the evidence: measured across all three recorded drives of
 * `sc-park-wall`, the wall is in the rear corridor on 0 samples — the drive
 * filed as „reverses into the wall" never reverses at all and ends nose-first
 * against it («Предницата опря в стената в края на реда»).
 */

import { useEffect, useState, type RefObject } from "react";
import {
  rearCueLabelBg,
  stepRearCue,
  type RearCue,
  type RearCueKind,
  type RearCueLevel,
} from "./rearProximity";

const POLL_MS = 200; // ~5 Hz — well under one human glance of latency

/**
 * Structural slice of the traffic system (no cross-module type import).
 *
 * `rearBodyBehind` and NOT `rearGapMeters`, since 2026-09-04: the badge's
 * sentence names a KIND of body, so the read that feeds it has to carry one.
 * `TrafficSystemImpl.rearGapMeters` is now derived from this same call, so the
 * two surfaces cannot drift — see the block at „WHAT IS STILL NOT COVERED"
 * below, which this closes for the moving half.
 */
export interface RearGapSource {
  rearBodyBehind(
    px: number,
    py: number,
    headingDeg: number,
  ): { gapM: number; kind: RearCueKind } | null;
}

/** Structural slice of the scene's per-frame VehicleSample ref. */
export interface RearCuePose {
  position: { x: number; y: number };
  headingDeg: number;
  speedKmh: number;
}

const LEVEL_COLOR: Record<RearCueLevel, string> = {
  info: "var(--border-strong)",
  warn: "var(--warning)",
  danger: "var(--danger)",
};

/** Rear-view car glyph: body + roof + the two taillights. */
function RearCarIcon({ level }: { level: RearCueLevel }) {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      <path
        d="M5 10 l1.5 -4 h11 L19 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <rect
        x="3.5"
        y="10"
        width="17"
        height="7"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="7" cy="13.5" r="1.4" fill={level === "info" ? "currentColor" : "var(--danger)"} />
      <circle cx="17" cy="13.5" r="1.4" fill={level === "info" ? "currentColor" : "var(--danger)"} />
    </svg>
  );
}

/**
 * …and the RIDER's glyph, because a car drawn over the word «велосипедист» is
 * the same false claim the label just stopped making, in the one channel a
 * driver reads faster than text. Rear view, matching the car glyph's framing:
 * two wheels, the rear triangle between them, the bar and the rider's head.
 */
function RearCyclistIcon({ level }: { level: RearCueLevel }) {
  const lamp = level === "info" ? "currentColor" : "var(--danger)";
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      <circle cx="6" cy="17" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="17" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M6 17 L11 9 L18 17 M11 9 H15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="12" cy="5" r="2" fill={lamp} />
    </svg>
  );
}

export function RearProximityCue({
  traffic,
  sampleRef,
  hidden = false,
}: {
  traffic: RearGapSource;
  /** The scene's shared per-frame vehicle sample (read-only here). */
  sampleRef: RefObject<RearCuePose | null>;
  /** True while a pause/quiz/end overlay is up — badge off, poll stopped. */
  hidden?: boolean;
}) {
  const [cue, setCue] = useState<RearCue | null>(null);

  // Poll only while visible. No state write on the hidden edge (lint: no
  // setState in effect bodies) — `hidden` gates the RENDER below instead,
  // which is just as honest: hidden ⇒ physics paused ⇒ traffic frozen, so
  // the held snapshot is still true when the overlay lifts.
  useEffect(() => {
    if (hidden) return;
    const id = window.setInterval(() => {
      const s = sampleRef.current;
      if (!s) return;
      const behind = traffic.rearBodyBehind(s.position.x, s.position.y, s.headingDeg);
      // Nothing behind stays Infinity, which `stepRearCue` maps to null in every
      // state — the honesty contract this file opens on, unmoved.
      setCue((prev) =>
        stepRearCue(prev, behind?.gapM ?? Infinity, s.speedKmh, behind?.kind ?? "vehicle"),
      );
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [traffic, sampleRef, hidden]);

  if (hidden || cue === null) return null;
  return <RearProximityBadge cue={cue} />;
}

/**
 * The badge itself, split out as a PURE surface — the `FaultCard` /
 * `ObjectiveBanner` precedent, and it is not decoration.
 *
 * The container above only ever paints through an effect (a 5 Hz interval that
 * the server renderer never runs), so `renderToStaticMarkup(<RearProximityCue/>)`
 * is the empty string in every state and the markup that reaches a student —
 * the `data-hud` name, the placement, the severity colour, the Bulgarian label
 * a screen reader announces — could not be asserted at all. This project has no
 * DOM test environment (`vitest.config.ts`: `environment: "node"`), so a surface
 * that cannot be server-rendered is a surface no test can see. Splitting the
 * two makes the pixels assertable while leaving the polling contract, the
 * identity-stability bail-out and the `hidden` gate exactly where they were.
 */
export function RearProximityBadge({ cue }: { cue: RearCue }) {
  const color = LEVEL_COLOR[cue.level];
  const label = rearCueLabelBg(cue);
  return (
    <div
      // THE NAME, and the naming IS the finding — see „ONE" in the header.
      // Without it every `closest("[data-hud]")` probe in tools/mobile reads
      // through this badge and reports it absent, and `PlayAreaStyles` owns no
      // selector that can reach it.
      data-hud="rear-proximity"
      // …and `bottom` stays a CLASS rather than an inline style, deliberately.
      // `PlayAreaStyles` is unlayered while Tailwind's utilities are layered,
      // so its compact rule wins the cascade with no `!important`; written
      // inline here it would outrank every selector and the phone floor would
      // silently do nothing — the trap that file names four separate times
      // (the ribbon legend's `bottom`, the column's `top`, the keyboard
      // legend's 65 % cap, the flank lane). 108 px is `ROOMY_HUD_FLOOR_PX`,
      // which is the correct floor on a roomy stage and is why it stays.
      className="pointer-events-none absolute bottom-[6.75rem] left-1/2 z-10 -translate-x-1/2"
    >
      <div
        role="status"
        aria-label={label}
        className="hud-ghost flex select-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold tabular-nums"
        style={{
          borderColor: color,
          color: cue.level === "info" ? "var(--foreground)" : color,
          // Damped severity ramps, never hard color cuts (the perf/UX law).
          transition: "color 200ms linear, border-color 200ms linear",
        }}
      >
        {cue.kind === "cyclist" ? (
          <RearCyclistIcon level={cue.level} />
        ) : (
          <RearCarIcon level={cue.level} />
        )}
        {label}
      </div>
    </div>
  );
}
