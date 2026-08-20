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
 * ── AND THE HONESTY BOUNDARY THIS BADGE DOES NOT STATE ─────────────────────
 *
 * „The universal rear-awareness fallback" is a claim about COVERAGE, and it is
 * false on one whole family. `traffic.rearGapMeters` is
 * `rearGapFor(this.vehicles…)`, and `this.vehicles` holds exactly two things
 * (`traffic/system.ts`): ambient agents seeded on the road graph, and
 * `stage()`d actors — which resolve a lane-graph path and return null without
 * one. Parking-bay occupants are neither. They are the district's `occupancy`
 * rect plus `extraObstacles: ObstacleRect2D[]` („bodies the district's own
 * occupancy does not carry (van, wall)", `traces/scParkDepth.ts`), rendered by
 * `ScenarioObstacles` over `computeParkedCars`; and a parking lot carries no
 * road-graph traffic to seed ambient agents from either.
 *
 * So across the whole parking family — `sc-park-narrow` reverses into a 2.5 m
 * pocket between two occupied bays, and its own step 4 reads „движи се назад
 * съвсем бавно и следи двете съседни коли" — `rearGapMeters` returns Infinity
 * for the entire manoeuvre, and Infinity means no badge, by the honesty
 * contract two paragraphs up. The only rear instrument a low-tier phone has is
 * silent exactly where reversing IS the lesson, and silence on the sole rear
 * instrument reads as „clear behind". That is a green tick for a skill nothing
 * measured, pointed at a seventeen-year-old who then reverses a real car.
 *
 * NOT FIXED HERE, AND THE ROUTING IS EXACT rather than a shrug. This component
 * renders what its source reports and has no second channel to consult; that
 * seam is proved in BOTH directions in `__tests__/rear-proximity-cue.test.tsx`
 * — a finite gap raises the badge, Infinity raises nothing from any state — so
 * the defect is provably the source's blindness and not this file's. Two files
 * this lane does not own have to move:
 *   · `modules/sim/traffic/system.ts` — `rearGapMeters` must sweep the static
 *     bodies (`computeParkedCars` / `ObstacleRect2D`) as well as
 *     `this.vehicles`. `rearGapFor` already takes a plain `{x, y, profile}[]`,
 *     so the query needs no new geometry, only a second array.
 *   · `modules/sim/hud/rearProximity.ts` — the red band is gated on
 *     `Math.abs(speedKmh) >= REAR_CUE_MOVING_KMH`, which erases the SIGN. „A
 *     car parked on your bumper at a light is normal city life" is right for a
 *     queue and wrong for one you are reversing INTO: a parking manoeuvre runs
 *     at 2–4 km/h, i.e. under the 5 km/h floor, so the one case that most
 *     needs red can never reach it. Closing on something BEHIND you is the
 *     negative branch, and it is the branch thrown away.
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
