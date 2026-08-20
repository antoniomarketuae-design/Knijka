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
 * ── WHAT IS STILL NOT COVERED, stated because silence here reads as „clear" ─
 *
 * ONE. THE RED BAND STILL CANNOT REACH A PARKING MANOEUVRE, and this is the
 * sharper half of what is left. `rearProximity.ts` gates „danger" on
 * `Math.abs(speedKmh) >= REAR_CUE_MOVING_KMH` (5). „A car parked on your bumper
 * at a light is normal city life" is right for a queue and wrong for one you
 * are reversing INTO: a parking manoeuvre runs at 2–4 km/h. MEASURED at
 * sc-park-narrow's closest approach — 0.12 m of air at −3.83 km/h — the badge
 * shows AMBER. The `Math.abs` erases the sign, and closing on something behind
 * you is the branch it throws away. That file is not this lane's; the fix is a
 * sign-aware band (reversing at any speed toward something inside
 * REAR_CUE_DANGER_M is red), and it must land with its own both-directions test
 * so a car merely rolling backwards on a slope does not paint the screen.
 *
 * TWO. HELD SCENERY IS STILL INVISIBLE TO THE SOURCE. The district carries bay
 * occupancy; it does not carry the van of `lot-van-v1` or the wall of
 * `lot-wall-v1`, which `scene/scenarioSceneryProps.heldSceneryFor(lesson.id,
 * raw)` adds by lesson id. MEASURED: `sc-park-wall/mistake-into-wall` — the
 * recorded drive whose entire subject is reversing into that wall — raises the
 * badge on 0 of 681 samples. `LessonScene` already holds both halves at once
 * (`built.scenarioObstacles`, and the exact collider extents `ScenarioObstacles`
 * publishes upward as `ObstacleColliderFootprint[]` for contact naming); handing
 * that array to the traffic system closes this AND replaces the fleet-profile
 * box `actorObb` approximates each occupant with. It is one wiring line in a
 * file this lane does not own. No setter was added here to receive it: an API
 * with no caller is the „schema that lies" `scene/obstacleSpec.ts` warns about
 * in its own header, and the receiver and the wiring must land together.
 */

import { useEffect, useState, type RefObject } from "react";
import { rearCueLabelBg, stepRearCue, type RearCue, type RearCueLevel } from "./rearProximity";

const POLL_MS = 200; // ~5 Hz — well under one human glance of latency

/** Structural slice of the traffic system (no cross-module type import). */
export interface RearGapSource {
  rearGapMeters(px: number, py: number, headingDeg: number): number;
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
      const gapM = traffic.rearGapMeters(s.position.x, s.position.y, s.headingDeg);
      setCue((prev) => stepRearCue(prev, gapM, s.speedKmh));
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
        <RearCarIcon level={cue.level} />
        {label}
      </div>
    </div>
  );
}
