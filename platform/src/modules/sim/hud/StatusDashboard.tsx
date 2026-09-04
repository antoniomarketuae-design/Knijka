"use client";

/**
 * StatusDashboard — the car-dashboard status bar (founder request 2026-07-17:
 * „табло като на кола" — blinkers, belt, lights, gear, speed — bottom, BIG).
 * Replaces the old bottom-left SpeedCard + GearIndicatorCard pair as the
 * single visual anchor of the drive HUD; works identically in chase and
 * cockpit camera (pure DOM overlay) and stays up in exam mode — it is the
 * vehicle's own instrument panel, not a training aid.
 *
 * Data path: the scene writes a shared DashboardStatus ref once per frame
 * (RuntimeDriver); this component samples it every DASHBOARD_POLL_MS and
 * re-renders only when dashboardHash changes — so the ◀ ▶ arrows flash on
 * the REAL 600 ms CabinControls blink clock (like the 3D cluster), never a
 * free-running CSS animation. No 60 Hz React state anywhere.
 *
 * NARROW SCREENS (fixed 2026-07-28). Measured on the founder's review profile
 * (390×844): the bar laid out 549 px wide inside a 374 px scene box and SIX of
 * its thirteen instruments were clipped away — the left blinker, the selector
 * letter, part of the speed block, the parking brake, the hazards and the right
 * blinker. „He only sees in the dashboard" was, on a phone, not even true. So
 * below `sm` the bar WRAPS instead of overflowing and the 8 px captions drop
 * out (the icons keep their aria-labels); the speed readout — the one thing the
 * founder confirmed is finally legible — is not shrunk.
 *
 * ── `compact` — THE PHONE. THIRD PASS, 2026-07-29. ─────────────────────────
 *
 * The second pass turned the floating pill into an edge-to-edge 40 px binnacle
 * and called it 10 % of the screen. It was: 852 × 40 = 34,080 px² of an
 * 852 × 393 landscape iPhone — 10.2 %, and every pixel of it charged, because
 * the band has a background, a top hairline and a backdrop-blur. The founder
 * looked at the result and said the mobile screen is still half furniture.
 *
 * SO WHERE DID THE 10 % ACTUALLY GO? Not into the numbers. Measured on that
 * layout, the thirteen instruments' own ink is under 2 % — the other 8 % is the
 * BAND: a full-width painted strip whose job was to hold them in a row. And
 * the car already has an instrument panel: the „Виток" 3D cluster
 * (components/sim/cockpit/InstrumentCluster.tsx) renders speed, gear and the
 * telltale rail inside the cabin, at the resolution four review rounds were
 * spent on. In the cockpit view — the default — this bar was drawing a SECOND
 * speedometer over the first one.
 *
 * So compact now drops the band and every instrument the car already lights:
 * both blinker arrows, the seatbelt, headlight, fog, wiper, parking-brake and
 * hazard telltales, the engine word, the dividers, and the strip they sat on.
 * What is left is a background-less bottom-centre readout of the three things a
 * driver reads as a NUMBER rather than as a lamp — the selector letter, the
 * speed, and the legal limit — costing about 0.9 % of the same screen.
 *
 * WHY THOSE THREE SURVIVE AT ALL, when the cluster shows them too: the cluster
 * is only in frame in the COCKPIT camera. The same founder review that produced
 * this file's previous pass also said, of the chase view, „he only sees in the
 * dashboard" — which is why TelltaleEdgePings exists for the LAMPS outside the
 * cockpit. Nothing did that job for the SPEED. Deleting the readout outright
 * would have left a student in chase or top-down view with no speedometer at
 * all, and this is a product whose entire claim is that it teaches speed
 * discipline. A Gran Turismo chase camera keeps a corner speed readout for
 * exactly this reason.
 *
 * AND THE READOUT ITSELF IS NOT SHRUNK. It stays `text-3xl` (30 px),
 * `tabular-nums`, `font-black`, with the same tone thresholds — the founder
 * signed that size off as legible at 0 / 58 / 132 km/h and this pass does not
 * reopen it. Only the furniture around it is gone. Every dropped instrument
 * keeps its aria-label on the roomy layout and its cabin control elsewhere, so
 * nothing is lost for a screen reader on the surface that still has it.
 */

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { readSpeedContract } from "../scene/lessonSpeedContract";
import { governorIsEasing } from "../vehicle";
import { STALL_RESTART_LABEL_BG, type HintInput } from "./controlPhrases";
import {
  createDashboardStatus,
  dashboardHash,
  displaySpeedKmh,
  HEADLIGHT_LABEL_BG,
  speedTone,
  type DashboardStatus,
} from "./dashboardStatus";

const DASHBOARD_POLL_MS = 100;

const DIM = "var(--border-strong)";

/** Caption under a telltale: hidden below `sm` so the bar still fits a small
 *  tablet (the aria-label and the title keep naming the instrument). The phone
 *  never reaches this JSX at all — see the early return in the component. */
const CAPTION =
  "hidden text-[8px] font-bold uppercase tracking-wider text-muted sm:block md:text-[9px]";

/** Telltale glyph box. */
const GLYPH = "flex h-6 items-center justify-center md:h-7";
/** Icon size every pictogram below takes. */
const ICON = "h-6 w-6 md:h-7 md:w-7";

/** Small labeled telltale column: icon/value on top, BG caption under it. */
function Telltale({
  labelBg,
  ariaLabel,
  titleBg,
  blink = false,
  children,
}: {
  labelBg: string;
  ariaLabel: string;
  /** Tooltip copy (control + its key) — aria carries it too, the bar itself
   *  is pointer-events-none so the scene stays clickable underneath. */
  titleBg: string;
  blink?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="flex min-w-7 flex-col items-center gap-0.5 sm:min-w-9 md:min-w-11"
      aria-label={ariaLabel}
      title={titleBg}
    >
      <span className={`${GLYPH} ${blink ? "hud-blink" : ""}`}>{children}</span>
      <span className={CAPTION}>{labelBg}</span>
    </div>
  );
}

function Divider({ short = false }: { short?: boolean }) {
  // `data-hud-ink`: the UNPANEL sweep clears fills off everything inside a
  // ghost, and a divider IS its fill. It survives as a 1 px hairline in the
  // stage's neutral border token — which is what the reference uses to group
  // its own instruments (the thin rules between the tyre-temp figures), and
  // the only thing still saying which numbers belong together now that the
  // band they sat in is gone.
  //
  // `short` is the compact variant's rule. The phone readout drops the band and
  // every divider with it, which is right for instruments that are merely
  // adjacent — and wrong for the ONE adjacency that changes what a number
  // means (the В26 disc against the governor cap; see GovernorCapMark).
  return (
    <span
      aria-hidden
      data-hud-ink=""
      className={
        // `short` is sized against the В26 DISC it stands next to, not against
        // the bar: the disc is h-6 on the phone and h-8/h-9 on the roomy bar,
        // so 16 px / 24 px reads as a rule between two items rather than as a
        // break between two groups (which is what the full-height one means
        // everywhere else in this bar).
        short
          ? "h-4 w-px shrink-0 self-center bg-border md:h-6"
          : "h-9 w-px shrink-0 bg-border md:h-11"
      }
    />
  );
}

/** Turn-signal arrow — lit green on the real blink clock (or hazard relay). */
function BlinkerArrow({
  dir,
  lit,
}: {
  dir: "left" | "right";
  lit: boolean;
}) {
  return (
    <span
      aria-label={`${dir === "left" ? "Ляв" : "Десен"} мигач: ${lit ? "свети" : "не свети"}`}
      title={dir === "left" ? "Ляв мигач (клавиш ,)" : "Десен мигач (клавиш .)"}
      className="text-3xl font-black leading-none md:text-4xl"
      style={{
        color: lit ? "var(--success)" : DIM,
        opacity: lit ? 1 : 0.55,
        textShadow: lit ? "0 0 14px var(--success)" : "none",
        transition: "opacity 80ms linear",
      }}
    >
      {dir === "left" ? "◀" : "▶"}
    </span>
  );
}

// -- Telltale icons (inline SVG, currentColor via style.color) ----------------

function BeltIcon({ on, cls = ICON }: { on: boolean; cls?: string }) {
  const c = on ? "var(--success)" : "var(--danger)";
  return (
    <svg viewBox="0 0 24 24" className={cls} style={{ color: c }} aria-hidden>
      <circle cx="12" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M6 20 L18 10" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M5.5 13.5 h4 M14.5 16.5 h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Headlight lamp: slanted-down beams = къси (green), level beams = дълги
 *  (blue — the cluster's real color code); dim housing when off. */
function HeadlightIcon({
  state,
  cls = ICON,
}: {
  state: DashboardStatus["headlights"];
  cls?: string;
}) {
  const c = state === "off" ? DIM : state === "high" ? "var(--accent-soft)" : "var(--success)";
  const tilt = state === "high" ? 0 : 1.8;
  return (
    <svg viewBox="0 0 24 24" className={cls} style={{ color: c }} aria-hidden>
      <path
        d="M13 5 a7 7 0 0 0 0 14 z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {[-1, 0, 1].map((i) => (
        <path
          key={i}
          d={`M15.5 ${12 + i * 5 + tilt} L22 ${12 + i * 5 - tilt}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

/** Fog lamp: beams cut by the vertical „fog" wave. */
function FogIcon({ on, cls = ICON }: { on: boolean; cls?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cls}
      style={{ color: on ? "var(--success)" : DIM }}
      aria-hidden
    >
      <path d="M10 5 a7 7 0 0 0 0 14 z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      {[-1, 0, 1].map((i) => (
        <path
          key={i}
          d={`M12.5 ${12 + i * 5} h7`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      ))}
      <path
        d="M17.5 5.5 q-2 3.25 0 6.5 t0 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Windscreen arc + wiper blade. */
function WiperIcon({ on, cls = ICON }: { on: boolean; cls?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cls}
      style={{ color: on ? "var(--accent)" : DIM }}
      aria-hidden
    >
      <path d="M3 16 a11 11 0 0 1 18 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 17 L17 7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="17.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

/**
 * THE TIER'S CEILING — the number the governor has been enforcing in silence
 * since the first difficulty tier shipped (2026-08-11).
 *
 * THE DEFECT, measured. `vehicle/difficulty.ts` clamps the throttle to zero
 * across the last `GOVERNOR_BAND_KMH` before a per-tier cap, and the cap is a
 * function of the tier AND the loaded map: on Начинаещ it is the map's speed
 * domain − 10, so in the 65 districts posted 50 the car dies at 40 and in the
 * 31 posted 20–40 it dies at 30. Нормален is domain + 10 floored at 50.
 * Напреднал has no cap at all. NOT ONE OF THOSE NUMBERS WAS EVER PRINTED
 * ANYWHERE — `governorCapKmh` was exported and read by exactly one test. A
 * student pressing the pedal harder and going no faster had no way to learn
 * that it is the TIER and not the car, which is precisely how a 17-year-old
 * concludes the software is broken (THEO-4: a silent refusal is a bare
 * verdict).
 *
 * WHY A PERMANENT MARK AND NOT A TOAST. A cap is not an event — it is a
 * property of this speedometer's world, true before the student ever reaches
 * it. A toast fires on every full-pedal straight, which is the noise the toast
 * channel exists to avoid, and it arrives at the one moment the student is
 * busy driving. A quiet mark is discoverable BEFORE the frustration: pick
 * „Начинаещ" and „Начинаещ ≤40" appears at once, so the tier ladder becomes a
 * thing with numbers in it instead of three words.
 *
 * …AND IT STILL ANSWERS „AT THE MOMENT IT BITES". The mark turns from muted to
 * `--warning` exactly when `governorIsEasing` says the physics step has begun
 * taking throttle away — the same function, not a re-derived inequality, so the
 * colour and the clamp cannot disagree.
 *
 * IT NAMES THE TIER, and that is the whole reason it is not just a number: „it
 * is the tier and not the car" is the sentence the student needs, and the tier
 * picker that would otherwise supply it is hidden during a mirror glance and
 * behind any rank-1 overlay on a phone (PlayAreaStyles).
 *
 * IT IS NOT INSIDE `data-hud="speed-block"` — DELIBERATELY, and this is the
 * one placement decision that is load-bearing. Row C7 folds that group away in
 * the cockpit camera because the „Виток" 3D cluster already draws speed and the
 * selector. The cluster does NOT draw the tier's ceiling — no real car has one
 * — so folding this with the speed would hide it in the camera a lesson OPENS
 * in. Same argument, same place in the row, as the legal-limit disc: what the
 * instrument panel cannot say is exactly what survives the fold.
 *
 * Nothing here is interactive and nothing paints a box: `text-shadow` on the
 * glyphs is the ghost register the rest of this file already uses.
 *
 * ── 2026-08-16 · IT WAS READING AS LEGAL ADVICE, AND THE GAP WAS 6 px ───────
 *
 * Founder: „the dashboard shows a red-ringed «50» speed-limit sign glyph
 * immediately beside «Нормален ≤60» … rendered in the same visual register as
 * the limit sign it reads as «the limit is 50, you may do 60», to a 17-year-old
 * learning the law."
 *
 * MEASURED on the deployed build, iPhone-16 landscape, `sc-vp-handbrake` L1:
 * the whole bar was 104 px wide and read, as one string, **„D 6 км/ч 50
 * Нормален ≤60"**. The В26 disc occupied x 378–402 and this mark began at
 * x 408 — **6 px of clear space between a legal prohibition sign and a
 * training-mode throttle ceiling**, with no rule, no label and no register
 * change between them. `rules/engine.ts:562` NORMAL_CAP_MARGIN_KMH = 10 is
 * where the 60 comes from: posted limit + 10, a governor, not a permission.
 *
 * AND THE COPY MADE IT WORSE, which nobody had noticed. In Bulgarian
 * «Нормален ≤60» parses as „Normal ≤60" — the tier's NAME is an ordinary
 * adjective, so the string reads as „normally, up to 60". The one word doing
 * the disambiguating was a word that disambiguates in the wrong direction.
 *
 * THREE CHANGES, and none of them removes the governor or the limit:
 *  1. A HAIRLINE between the disc and this mark, on BOTH variants (Divider
 *     `short`). Adjacency was doing the damage; 6 px is not a separator.
 *  2. A REGISTER LABEL, «РЕЖИМ», always visible — not the `sm:block` caption
 *     the telltales use, because the phone is exactly where the founder read
 *     it and where that caption is hidden. It names the thing the number
 *     belongs to: a mode of the CAR, not a property of the ROAD.
 *  3. WHEN THE CAP EXCEEDS THE POSTED LIMIT — which is the founder's own
 *     frame, 60 against 50, and the only case where the misreading is
 *     dangerous — the mark says «знакът важи» outright, pointing at the disc
 *     it stands beside. Below the limit there is nothing to misread and the
 *     clause does not render, so the bar does not carry permanent furniture.
 *
 * The `{nameBg} ≤{cap}` core is deliberately unchanged: `governor-cap.test.ts`
 * pins it as „the mark says WHOSE ceiling it is", and that argument still
 * holds — this pass adds the register around it rather than rewriting it.
 *
 * ── 2026-08-28 · THE BAR STATED CEILINGS AND NEVER STATED PRECEDENCE ────────
 *
 * Wave 8, five rows, one cause, and the cause as handed down was HALF RIGHT —
 * which is worth writing down, because it was handed down as verified.
 *
 * WHAT WAS TRUE. The numeral is `governorCapKmh` and nothing else, and the
 * two anchors resolve: `NORMAL_CAP_MARGIN_KMH = 10` (**`vehicle/difficulty.ts`**
 * :214, applied :282) over the lesson's speed domain.
 *
 * WHAT WAS NOT, and both corrections change what a fix may claim:
 *  · „ALWAYS domain + 10". It is `Math.max(domain + 10, NORMAL_CAP_FLOOR_KMH)`
 *    — 50 on the eight districts whose domain is 20 or 30 — it is `domain − 10`
 *    on Начинаещ, it is absent on Напреднал, and `REQUIRED_SPEED_HEADROOM_KMH`
 *    can raise it again. No copy here may spell the arithmetic out.
 *  · „carries no road fact". It carries one: the domain IS the fastest legal
 *    edge of the loaded district. The defect is subtler and is what the copy
 *    below had to answer — the fact it carries is about the WHOLE MAP, while
 *    every other number on this bar is about the road under the wheels.
 *  · „the only one wearing ≤". Stale by one wave: the task chip below has worn
 *    a ≤ since sweep 161.
 *
 * SO THE REAL CAUSE, restated: the bar printed up to three ceilings in one
 * register — same weight, same ≤, one flat line — and named the BILLING one
 * nowhere. The resolution existed (`readSpeedContract`) and was spent only on
 * `title`/`aria-label`, which is a surface a touch screen has no gesture to
 * open. Computed, correct, and unreadable by the student it was written for.
 *
 * THREE CHANGES, all inside this component, none of which moves a number:
 *  4. The mode numeral drops to `font-normal` when `reading.modeAboveLaw` — it
 *     is then the one number on the bar that can neither convict nor acquit,
 *     and it was the heaviest. At or under the sign it is the operative
 *     ceiling and keeps the bar's weight.
 *  5. «знакът важи» → «знакът важи, не режимът». The clause always meant „the
 *     sign beats the MODE"; beside a roadworks briefing that had just taught
 *     „temporary signage overrides permanent" it read as an endorsement of the
 *     permanent disc. Naming the loser removes the reading, and turns a bare
 *     verdict into an explained one (THEO-4).
 *  6. When the task binds, the chip carries «— по-строгото важи» — the rule,
 *     not just the number, and verbatim the words `lineBg` had been saying to
 *     the accessibility tree alone.
 */
// Exported for `governor-cap.test.ts` ONLY, and deliberately not re-exported
// from `hud/index.ts`: the mark is an internal part of this bar, not a HUD
// surface another module may mount. It is exported at all because the previous
// guard for this component could only READ THE SOURCE — the bar's own state
// arrives through an interval effect, so a static render of StatusDashboard
// always shows `governorCapKmh: null` and never draws the mark at all. A grep
// cannot tell „the sign clause renders when the cap is above the limit" from
// „the string exists somewhere in the file", and that distinction is the whole
// of this change.
export function GovernorCapMark({
  capKmh,
  tierBg,
  speedKmh,
  limitKmh,
  taskCapKmh,
  size,
}: {
  capKmh: number | null;
  tierBg: string;
  speedKmh: number;
  /**
   * The POSTED limit the В26 disc is showing, so the mark can tell the one
   * case that misreads (cap above the sign) from the one that cannot. Passed
   * in rather than re-derived: the disc and this mark must never disagree
   * about what the law says on this road.
   */
  limitKmh: number;
  /**
   * ── THE THIRD NUMBER — sweep 161, 22 rows, and the row this bar owns ──────
   *
   * This objective's own demand (`reachZone.maxSpeedKmh`) — the number
   * `RouteGuidance.capLineBg` paints across the lane as «Карай дотук — не
   * по-бързо от 40 км/ч», and the number the student is actually GRADED on
   * whenever it is stricter than the sign.
   *
   * `scene/lessonSpeedContract.ts` wrote the resolution for all three numbers
   * and could not spend it: „the three surfaces that must adopt it are
   * `hud/StatusDashboard.tsx` (`GovernorCapMark`), `components/sim/
   * RouteGuidance.tsx` (`capLineBg`) and `components/sim/LessonScene.tsx` …
   * none of which this lane owns … Until they do, the glass is unchanged and
   * the 22 rows stand." This is the first of the three to adopt it.
   *
   * READ OFF A FRAME, not inferred (`sc-zebra-approach/mobile-right/
   * 04-t087s.png`, iPhone 16 landscape): the instruction line says «приближи
   * пътеката с под 40 км/ч», the В26 disc says **50**, this mark said
   * **«РЕЖИМ Нормален ≤60 · знакът важи»**. Three numbers, ascending, and the
   * one the student is billed against is the smallest and the only one with
   * nothing beside it saying so. The same reading is in `sc-crossing-dart/
   * mobile-right/01-arrival.png` (50 · ≤60) and `sc-sp-curve/mobile-wrong/
   * 04-t030s.png` (90 · ≤100).
   *
   * OPTIONAL, and the absent case is the shipped one until the shell threads
   * it: `undefined` reproduces the old two-number reading byte for byte, so no
   * legacy or headless mount changes. See the ⚠ block on `StatusDashboard`'s
   * own prop for what still has to happen upstream.
   */
  taskCapKmh?: number;
  /** Type scale: the phone readout runs one step below the roomy bar. */
  size: "compact" | "roomy";
}) {
  // No cap („Напреднал", or a headless mount that never wrote one) = no mark.
  // Printing „no ceiling" would be furniture that teaches nothing.
  if (capKmh === null) return null;
  const cap = Math.round(capKmh);
  const easing = governorIsEasing(capKmh, speedKmh);
  const nameBg = tierBg.trim() === "" ? "Режимът" : tierBg;
  /**
   * ONE RESOLUTION, ASKED FOR RATHER THAN RE-DERIVED.
   *
   * `overLimit` used to be `cap > Math.round(limitKmh)` written out here, and
   * `SpeedContractReading.modeAboveLaw` is the same inequality written out
   * there — with a docstring saying it „Mirrors `GovernorCapMark`'s own
   * `overLimit` (rounded compare) so the mark and this cannot disagree." That
   * is a hand-kept copy, i.e. exactly the arrangement the census block in
   * `overlayQueue.ts` and the weather-vocabulary drift in `dashboardStatus.ts`
   * were both burned by: two places that must agree, and nothing that makes
   * them. Now there is one place, and this file has no inequality left to
   * drift.
   */
  const reading = readSpeedContract({
    postedKmh: limitKmh,
    taskCapKmh,
    modeCapKmh: capKmh,
  });
  // The sign clause renders only when the ceiling sits ABOVE the posted limit
  // — the founder's 60-against-50. When the governor is at or under the sign,
  // obeying it cannot break the law and there is nothing to disclaim.
  const overLimit = reading.modeAboveLaw;
  /**
   * …AND THE CASE THE BAR HAD NO WORDS FOR: THE DRILL IS STRICTER THAN THE LAW.
   *
   * Rendered only when the TASK binds, because that is the only reading where
   * obeying every number the student can see still fails him. When the sign is
   * the stricter of the two, `знакът важи` above already says everything and a
   * second clause would be the permanent furniture this mark refuses to carry.
   *
   * B58's rule is inherited whole rather than re-stated: a task cap ABOVE the
   * street's own limit is grading slack, never an instruction, and
   * `readSpeedContract` never makes it `binding` — so 32 catalogue gates
   * authored above their street print nothing here, and cannot.
   */
  const taskBinds = reading.binding === "task" && reading.bindingKmh !== undefined;
  const bindingKmh = taskBinds ? Math.round(reading.bindingKmh as number) : null;
  /**
   * ── WHEN THE GOVERNOR MAY STAND ON THE GLASS AT ALL ───────────────────────
   * sc-sig-controller-postures:e245bd5c · sc-crossing-child-ball:b2be3466 ·
   * sc-rb-lane-choice:ff5f8190 — three rows, one sentence: „THREE different
   * speed figures are on screen SIMULTANEOUSLY".
   *
   * Every answer before this one was a VOCABULARY answer — name the third
   * number, name the loser, name the precedence — and each of them put more
   * glyphs on the strip the rows are counting. `lessonSpeedContract.ts` routed
   * this edit here by name and settled which figure may leave: `SpeedAuthority`
   * has no `"mode"` member because a governor cap is a ceiling on the THROTTLE,
   * so it can neither be exceeded nor be obeyed. It is the one number on this
   * bar that cannot bill, and on the audited frames it is also the LARGEST —
   * the hierarchy in the grader, exactly inverted.
   *
   * IT STILL EARNS THE BAR IN THREE STATES, and the same three the SENTENCE
   * already applies (`readSpeedContract`'s governor clause renders „only where
   * it can be MISREAD"):
   *   · it is easing the throttle RIGHT NOW — a student flooring it into a
   *     ceiling has to be told it is the mode and not a broken engine
   *     (doc 86 B7, founder item L17/5);
   *   · it BLOCKS the number the drill needs (`modeBlocksBinding`);
   *   · it is at or under the sign, where it IS the operative ceiling.
   * Outside those three it is furniture, and the strip loses a numeral.
   *
   * THE EXPLANATION LOSES NOTHING: `explainBg` below is untouched, so the
   * `aria-label`/`title` still states all three ceilings and the precedence.
   */
  const modeSpeaks = easing || reading.modeBlocksBinding || !reading.modeAboveLaw;
  /**
   * ── THE ACCESSIBLE NAME ASSERTED THE PRECEDENCE THE GLASS JUST FIXED ──────
   * Wave 8, the other half of `sc-signal-response:a1989c9a`.
   *
   * Both sentences below ended by naming the DISC as the limit („знакът до
   * скоростта е ограничението" / „важи знакът до скоростта"), which is true
   * against the governor and false against a stricter drill. `lineBg` then
   * appended the correction — so a screen-reader user heard the wrong ruler
   * first and the right one two sentences later, and the two surfaces of this
   * one element disagreed with each other. `lineBg` already states all three
   * numbers AND the precedence, so when the task binds the tail is dropped
   * rather than argued with.
   *
   * BYTE-IDENTICAL WHEN NO TASK BINDS — which is every mount without a task
   * cap and every drill whose gate is slack (B58). Nothing that shipped before
   * this pass changed its accessible name.
   */
  const explainBg = `${
    easing
      ? `Режимът „${nameBg}“ те ограничава на ${cap} км/ч — газта не отива по-нагоре, колата е наред. Смени режима горе вдясно. Това е таван на РЕЖИМА, не разрешение${
          taskBinds ? "." : ": важи знакът до скоростта."
        }`
      : `Режимът „${nameBg}“ пуска най-много ${cap} км/ч. Това е таван на РЕЖИМА, не на пътя${
          taskBinds ? "." : " — знакът до скоростта е ограничението."
        }`
  }${reading.lineBg === "" ? "" : ` ${reading.lineBg}`}`;
  // Nothing left to print: the governor cannot bill here (see `modeSpeaks`)
  // and no drill cap is stricter than the disc. An empty labelled span is not
  // "no furniture" — a screen reader still announces it and the flex gap still
  // spends a pixel — so the mark leaves the bar the same way it does with no
  // cap at all. The В26 disc beside it is untouched and still states the law.
  if (!modeSpeaks && bindingKmh === null) return null;
  return (
    <span
      data-hud="governor-cap"
      aria-label={explainBg}
      title={explainBg}
      className={`flex shrink-0 items-baseline gap-1 whitespace-nowrap font-bold leading-none tabular-nums ${
        size === "compact" ? "text-[9px]" : "text-[10px]"
      }`}
      style={{
        color: easing ? "var(--warning)" : "var(--muted)",
        opacity: easing ? 1 : 0.9,
      }}
    >
      {/* THE GOVERNOR'S OWN THREE ELEMENTS — the register word, the numeral and
          the sign-wins clause — stand or leave TOGETHER, under `modeSpeaks`.
          Together, because they are one statement: the word names the register
          the numeral belongs to, and the clause says what that numeral loses
          to. Keeping any one of them without the others would leave the strip
          saying half a sentence about a ceiling that cannot bill. */}
      {modeSpeaks ? (
        <>
          {/* The register word. Muted and letter-spaced like every other caption
              in this file, and — whenever the numeral beside it is on the bar at
              all — never suppressed on its own: a caption that vanishes under
              its own number would leave the phone reading exactly the bare
              string the founder read. */}
          <span
            data-hud="governor-register"
            className="text-[7px] font-bold uppercase tracking-widest opacity-80 md:text-[8px]"
          >
            Режим
          </span>
          {/* ── THE MODE NUMERAL IS DEMOTED WHEN IT OUTRANKS NOTHING ────────────
              Wave 8, rows `sc-sp-wet-limit-plate:dabfa37c` („the largest number on
              the bar — and the one carrying the ≤ — is above the law") and
              `sc-mw-discipline:d58e1b61` (disc 140, this numeral ≤150).

              The numeral is `governorCapKmh` — the loaded MAP's fastest legal edge
              plus `NORMAL_CAP_MARGIN_KMH` (vehicle/difficulty.ts:214, applied :282,
              floored at NORMAL_CAP_FLOOR_KMH). It is therefore a fact about the car
              and about the whole district, never about the road under the wheels,
              and when it sits above the posted disc it is the one number on the bar
              that can neither convict nor acquit. It was nevertheless drawn in the
              bar's `font-bold`, i.e. in the same weight as the two numbers that DO
              bill — so the hierarchy on the glass was the exact inverse of the
              hierarchy in the grader.

              WEIGHT AND NOT OPACITY, deliberately: at `text-[9px]` over bright
              tarmac the `hud-ghost` shadow is tuned for this alpha, and fading the
              glyphs would buy the hierarchy with legibility. Dropping to
              `font-normal` beside a `font-black` В26 disc and a `font-bold` amber
              task chip puts the eye where the billing is.

              AND ONLY WHEN IT OUTRANKS NOTHING. At or under the sign the governor
              IS the operative ceiling — that is the tier doing its job — so it
              keeps the bar's weight. One predicate, `reading.modeAboveLaw`, the
              same one the clause below renders from. */}
          <span
            data-hud="governor-mode-cap"
            className={reading.modeAboveLaw ? "font-normal" : undefined}
          >
            {nameBg} ≤{cap}
          </span>
          {overLimit ? (
            /* ── „ЗНАКЪТ ВАЖИ" NAMED THE WINNER AND NEVER THE LOSER ─────────────
               Wave 8, `sc-merge-roadworks-shift:9eab5ce5`. On that briefing frame
               (`w10-1/frames/sc-merge-roadworks-shift__mobile-wrong/02-briefing`)
               instruction 2 reads „Временната сигнализация отменя постоянната …
               тук ограничението в участъка е 30, а не 50" — and six pixels under
               it the bar said «50 · РЕЖИМ Нормален ≤60 · знакът важи». The clause
               MEANS „the sign beats the mode"; a student who has just been told
               that temporary signage overrides permanent reads it as „the 50 you
               can see is the sign that applies", which is the one sentence that
               frame must not say. (The world is right: `hz-roadworks-v1` publishes
               maxspeed 30 on `hzr-e-works` and the disc follows the edge — the car
               is simply still 216 m short of the taper.)

               Naming the loser costs twelve characters and removes the reading:
               the clause is now unambiguously about the REGISTER contrast this
               mark exists for, and says nothing about which sign. It also closes
               the row's other half — «знакът важи» was itself a bare verdict
               (THEO-4), true and unexplained; „not the mode" is the explanation. */
            <span data-hud="governor-sign-wins" className="font-bold opacity-90">
              · знакът важи, не режимът
            </span>
          ) : null}
        </>
      ) : null}
      {/* THE NUMBER THE STUDENT IS ACTUALLY BILLED AGAINST, when it is neither
          of the two already on this bar.
          It is amber type and nothing else: a red annulus around a numeral IS
          В26, and that shape belongs to the law alone. The mark above is held
          to the same ban by `governor-cap.test.ts`, which greps this slice for
          the two tokens that would build one — so this comment names neither,
          and that is why it is phrased the long way round. */}
      {bindingKmh === null ? null : (
        <span
          data-hud="governor-task-binds"
          className="font-bold"
          style={{ color: "var(--warning)", opacity: 1 }}
        >
          · задачата иска ≤{bindingKmh}
          {/* ── THE PRECEDENCE, WHICH IS WHAT WAS ACTUALLY MISSING ──────────
              Wave 8, `sc-signal-response:a1989c9a`, read off
              `wave-c/frames/sc-signal-response__mobile-wrong/04-t012s.png`:
              the strip said «РЕЖИМ Нормален ≤60 · знакът важи · задачата иска
              ≤45» with the cluster at 59 км/ч. Three ceilings, and one word —
              «знакът важи» — that appears to pick the 50. It does not:
              `reading.binding` is `"task"` here and the billed number is 45.

              `lessonSpeedContract.ts` routed this edit to this component by
              name („What is missing is ONE render branch in `GovernorCapMark`:
              when `reading.binding === "task"`, the «знакът важи» chip must not
              stand alone"), and the sentence it wanted was already written —
              `SpeedContractReading.lineBg` has said «…: по-строгото важи» since
              sweep 161. It was on `title`/`aria-label` and nowhere else, i.e.
              on the one surface a touch screen has no gesture for. This is the
              same three words on the glass, so the label and the bar now say
              one thing rather than two.

              UNCONDITIONAL WHEN THE TASK BINDS, and that is sound rather than
              lazy: the В26 disc above renders in both variants with no
              conditional of its own, so whenever this chip is on screen the
              number it is stricter THAN is on screen beside it. B58 keeps the
              inverse case off the bar entirely — a task cap above the street is
              slack, `readSpeedContract` never makes it `binding`, and nothing
              here can print it. */}
          {" — по-строгото важи"}
        </span>
      )}
    </span>
  );
}

export function StatusDashboard({
  statusRef,
  limitKmh,
  taskCapKmh,
  rejectFlashKey = 0,
  compact = false,
  input = "keyboard",
}: {
  /** Scene-written per-frame status (see dashboardStatus.ts header). */
  statusRef: RefObject<DashboardStatus>;
  /**
   * THE OBJECTIVE'S OWN SPEED DEMAND (km/h) — DECLARED HERE, THREADED SINCE
   * ROUND 11 (O51).
   *
   * Forwarded verbatim to both `GovernorCapMark`s, which is where the whole
   * argument lives; see that prop's docstring for the frames.
   *
   * WHAT SHIPS: `LessonPlayShell.tsx` mounts this bar twice — compact and roomy
   * — and both now pass `taskCapKmh={snap.taskCapKmh}`. `undefined` is still the
   * shipped case for an uncapped objective, an exam session and every headless
   * or legacy mount, and there `readSpeedContract` reduces to the two-number
   * reading the bar has always printed.
   *
   * IT IS NOT `reachZone.maxSpeedKmh` AND THAT IS DELIBERATE. The shell
   * publishes the figure the advisor is SPEAKING, not the widened gate: measured
   * over the shipped catalogue, the raw gate sits above the sentence the student
   * is reading on 212 of 953 capped cards (sc-zebra-approach@L1 — the frame this
   * row was filed on — is gate 45 against card 40), so passing it would have put
   * a fourth unexplained ceiling on the bar. The derivation, the census and the
   * ⚠ that routes `spokenCapKmh` out of `lessons/advisor.ts` are all at
   * `taskCapKmhFromPrompt` in `LessonPlayShell.tsx`.
   *
   * ⚠ CITATION REPAIRED (§7 B-R10): this block used to route the tripwire to
   * `governor-cap.test.ts`, which never contained it. The block was — and the
   * inverted version still is — in `__tests__/governor-speed-contract.test.ts`,
   * and the measurement it points at is
   * `components/sim/lesson-ui/__tests__/taskCapThread.test.ts`.
   */
  taskCapKmh?: number;
  /** Current legal limit (tick-derived, the shell's 150 ms snapshot). */
  limitKmh: number;
  /** Increments on every REJECTED shift — the gear letter flashes red once
   *  (founder bug 2026-07-10: refusals must never be silent). */
  rejectFlashKey?: number;
  /** Phone-shaped viewport: the three numbers and no band (see header). */
  compact?: boolean;
  /**
   * WHICH CONTROLS THE STALL LABEL MAY NAME — doc 91 §J-WAVE-4.
   *
   * The engine cell's accessible name has always been „Двигателят угасна —
   * рестартирай (Z + I)", on every device. A sighted phone student ignores it;
   * a screen-reader user is handed the ONLY way out of a dead car in keys his
   * phone does not have, and has no way to discover that it is wrong. Same
   * defect class as the drivetrain pad's reverse promise (`touchLabels.test.ts`),
   * one attribute over. Defaults to the desktop wording so a legacy mount is
   * byte-identical.
   */
  input?: HintInput;
}) {
  const [snap, setSnap] = useState<DashboardStatus>(createDashboardStatus);

  /**
   * Low-Hz mirror of the frame-rate ref (TraceTimeline/cluster poll grammar):
   * copy only when the rendered hash actually changed.
   *
   * ── „THE HASH CONTAINS THE SPEED, SO IT COMMITS ON EVERY FRAME" — MEASURED,
   *    AND THE CHARGE AS FILED IS REFUTED (2026-08-19) ─────────────────────────
   *
   * The standing note against this file said the poll „commits on every frame
   * while the car is moving — a performance row that also means the dashboard
   * re-renders constantly during exactly the moments the student is being
   * graded." Two of its three clauses are wrong and the third is real but is
   * not a defect in `dashboardHash`.
   *
   *   NOT every frame. The interval is `DASHBOARD_POLL_MS` = 100, and the hash
   *     pre-rounds through `displaySpeedKmh`, so the ceiling is 10 commits/s
   *     and only while the INTEGER km/h changes — not 60.
   *   NOT a stale field. `{speed}` is genuinely rendered, seven lines below, in
   *     both variants. A hash blind to it would freeze the digit.
   *   THE RATIO IS REAL. Over a 0 → 55 км/ч ramp sampled at this interval
   *     (11 s at 5 км/ч/s, 111 samples) the speed segment takes **56 distinct
   *     values** while everything the bar DRAWS from the speed — `speedTone`'s
   *     three bands × `governorIsEasing`'s one bit — takes **3**. That is
   *     **18.7 whole-bar commits per distinct appearance**: every telltale
   *     cell, the gear cell and both `GovernorCapMark`s re-render to move a
   *     number by one.
   *
   * AND IN THE COCKPIT CAMERA THE NUMBER IS NOT EVEN VISIBLE. `PlayAreaStyles`
   * folds `[data-hud="speed-block"]` with `display: none` under
   * `html[data-sim-camera="cockpit"]` — the camera every lesson opens in, and
   * the one all 16,649 sweep frames were shot in. So in the ordinary case the
   * 18.7× buys a digit nobody can see.
   *
   * WHY IT IS NOT FIXED HERE, stated rather than left as a silent trade. The
   * two candidate fixes are both out of this lane or already refused:
   *   (a) coarsen `dashboardHash` to the DERIVED pair — one line, but the pair
   *       needs `limitKmh`, which `dashboardHash(s)` is not given, so it is a
   *       signature change in `hud/dashboardStatus.ts`, **not this lane's**;
   *   (b) gate the poll on the live camera — refused at the site of the fold
   *       itself, in those words: „CSS and not a prop because the camera lives
   *       in a per-frame ref inside the scene — a React state for it would be a
   *       60 Hz re-render of the HUD to answer a question that changes when
   *       somebody presses C."
   * ROUTED, not dropped: (a), to `dashboardStatus.ts`, with the 56-vs-3 number
   * above as the acceptance measurement.
   */
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = statusRef.current;
      if (!s) return;
      setSnap((prev) => (dashboardHash(prev) === dashboardHash(s) ? prev : { ...s }));
    }, DASHBOARD_POLL_MS);
    return () => window.clearInterval(id);
  }, [statusRef]);

  const speed = displaySpeedKmh(snap.speedKmh);
  const limit = Math.max(1, Math.round(limitKmh));
  const tone = speedTone(snap.speedKmh, limitKmh);
  const speedColor =
    tone === "danger" ? "var(--danger)" : tone === "over" ? "var(--warning)" : "var(--foreground)";

  // ── PHONE: the three numbers, and no band. See the header. ────────────────
  // No background, no border, no backdrop-filter, no radius: on the strict
  // screen budget an element is charged for every pixel it paints on, so the
  // only thing this may cost is its own type. Contrast over a bright road comes
  // from a text-shadow, which is drawn on the glyphs and not on a box.
  if (compact) {
    return (
      <div
        aria-label="Табло на автомобила"
        data-hud="status-dashboard"
        // Already the ghost register since 2026-07-29 (see the header). It now
        // says so with the shared class instead of its own hand-rolled shadow,
        // so the phone and the desktop cannot drift apart again.
        className="hud-ghost pointer-events-none flex select-none items-baseline gap-1.5 px-1"
      >
        {/* ── ROW C7, 2026-07-30. THE CLUSTER IS ALSO A SPEEDOMETER. ───────
            The paragraph above argues this readout must survive because the
            3D cluster „is only in frame in the COCKPIT camera". True — and the
            conclusion drawn from it was not. In the cockpit camera, which is
            the one a lesson OPENS in, the audit frame has the cabin's analogue
            dial, its digital „0 км/ч" and its selector „D" in the same picture
            as this line's „D 0 км/ч". The trade was recorded and then never
            conditioned on anything.

            The selector letter, the number and its unit are therefore grouped
            under one handle and folded away when the cockpit is live
            (PlayAreaStyles: html[data-sim-camera="cockpit"]); chase and
            top-down keep every one of them, which is the case that argument was
            actually about. CSS and not a prop because the camera lives in a
            per-frame ref inside the scene — a React state for it would be a
            60 Hz re-render of the HUD to answer a question that changes when
            somebody presses C.

            The LIMIT DISC below is deliberately outside the group: the cluster
            shows what the car is doing and never what the law allows. */}
        <span data-hud="speed-block" className="flex items-baseline gap-1.5">
          <span
            key={`reject-${rejectFlashKey}`}
            className={`text-xl font-black leading-none tabular-nums ${
              rejectFlashKey > 0 ? "hud-gear-reject" : ""
            }`}
            style={{ color: snap.engineOn ? "var(--accent)" : DIM }}
            aria-label={`Скоростен лост: ${snap.gearLabel}`}
            title="Скоростен лост"
          >
            {snap.gearLabel}
          </span>
          <span
            className="text-3xl font-black leading-none tabular-nums"
            style={{ color: speedColor }}
            aria-label={`Скорост ${speed} километра в час`}
          >
            {speed}
          </span>
          <span className="text-[8px] font-bold uppercase tracking-wider text-muted">км/ч</span>
        </span>
        {/* See the roomy variant below for why the sign stays a sign. On the
            phone the ring is already 2 px; only the 85 % tint is new, so the
            two variants cannot drift apart again. */}
        <span
          aria-label={`Ограничение ${limit} км/ч`}
          title="Ограничение на скоростта"
          className="flex h-6 w-6 shrink-0 translate-y-0.5 items-center justify-center rounded-full border-2 text-[10px] font-black tabular-nums text-foreground"
          style={{ borderColor: "color-mix(in srgb, var(--danger) 85%, transparent)" }}
        >
          {limit}
        </span>
        {/* THE RULE BETWEEN THE LAW AND THE MODE. The disc above is a В26 sign;
            everything after this hairline is a property of the car. On the
            phone these two sat 6 px apart and read as one sentence — see
            GovernorCapMark. */}
        {snap.governorCapKmh === null ? null : <Divider short />}
        {/* The tier's ceiling — outside `speed-block` for the same reason the
            disc above is: it survives the cockpit fold, because the 3D cluster
            cannot draw a governor. See GovernorCapMark. */}
        <GovernorCapMark
          capKmh={snap.governorCapKmh}
          tierBg={snap.governorTierBg}
          speedKmh={snap.speedKmh}
          limitKmh={limitKmh}
          taskCapKmh={taskCapKmh}
          size="compact"
        />
      </div>
    );
  }

  return (
    <div
      aria-label="Табло на автомобила"
      data-hud="status-dashboard"
      // `hud-ghost` — 2026-08-02, the founder's reference frames. This bar was
      // the second-largest painted surface on the drive screen (measured 4.6 %
      // of 1280×720 as an opaque, blurred, 16 px-radius card). In both
      // reference frames the equivalent instruments — tyre temps, ABS, ECU, TC,
      // fuel, lap times — are naked numbers on the image with no card under
      // them at all. The COMPACT variant above has been exactly that since
      // 2026-07-29 and the founder did not complain about it; this one simply
      // catches up. Nothing moves, nothing shrinks, no instrument is dropped:
      // the band is what goes, and the halo the ghost register carries is what
      // holds the numbers legible over bright tarmac.
      className="hud-ghost pointer-events-none flex max-w-full select-none flex-wrap items-center justify-center gap-x-2 gap-y-1 px-3 py-2 sm:flex-nowrap md:gap-x-3.5 md:px-5 md:py-2.5"
    >
      <BlinkerArrow dir="left" lit={snap.leftLampLit} />

      <Divider />

      {/* Selector letter + gear — the driveline truth (P R N D / M2).

          C7 (doc 87): `data-hud="speed-block"` is the CAMERA HANDLE, and it
          belongs on THIS variant too. The compact readout above carried it and
          this one did not, so the rule at PlayAreaStyles
          (html[data-sim-camera="cockpit"] [data-hud="speed-block"]) matched
          nothing on any screen wide enough to render the roomy bar — i.e. on
          the desktop the founder was looking at, where the „Виток" 3D cluster
          and this DOM readout showed the same selector letter and the same
          number in one frame. Both halves fold in the cockpit camera; the
          limit disc below deliberately does not (see the compact variant). */}
      <div
        data-hud="speed-block"
        className="flex flex-col items-center gap-0.5"
        aria-label={`Скоростен лост: ${snap.gearLabel}`}
        title="Скоростен лост ([ към P · ] към D)"
      >
        {/* key remount retriggers the one-shot flash on every new rejection */}
        <span
          key={`reject-${rejectFlashKey}`}
          className={`text-2xl font-black leading-none tabular-nums md:text-3xl ${
            rejectFlashKey > 0 ? "hud-gear-reject" : ""
          }`}
          style={{ color: snap.engineOn ? "var(--accent)" : DIM }}
        >
          {snap.gearLabel}
        </span>
        <span className={CAPTION}>Предавка</span>
      </div>

      {/* Speed — THE readout (large), with the legal-limit disc beside it. */}
      <div className="flex items-center gap-2 px-1 md:gap-2.5">
        <div
          data-hud="speed-block"
          className="flex items-baseline gap-1"
          aria-label={`Скорост ${speed} километра в час`}
          title="Скорост"
        >
          <span
            className="text-4xl font-black leading-none tabular-nums md:text-5xl"
            style={{ color: speedColor }}
          >
            {speed}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted md:text-[10px]">
            км/ч
          </span>
        </div>
        {/* THE LIMIT DISC — and the one place this lane declines the review.
            „Crisp flat vector glyphs laid on the 3D (the «40» ring …)" is a
            fair description, and the reference's answer would be a mono
            „LIMIT 40" at the edge. It is not taken, deliberately: a red ring
            with a numeral in it IS the Bulgarian sign В26, the student is
            being trained to read that shape at speed on a real road, and
            replacing it with a word would teach the HUD instead of the law.
            North star (CLAUDE.md): safer, more competent real drivers.

            What DOES change is that it stops being a heavy sticker — the ring
            drops 3 px → 2 px and carries the danger colour at 85 %, so the
            road shows through it the way it shows through everything else in
            this register, and the numeral is now set in the register's mono
            face. It is a sign seen through a windscreen, not a vector pasted
            on one. The fill was already gone (the ghost sweep). */}
        <span
          aria-label={`Ограничение ${limit} км/ч`}
          title="Ограничение на скоростта"
          className="flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-black tabular-nums text-foreground md:h-9 md:w-9 md:text-sm"
          style={{ borderColor: "color-mix(in srgb, var(--danger) 85%, transparent)" }}
        >
          {limit}
        </span>
        {/* …and the same rule and the same mark on the roomy bar. Both variants
            or neither: the compact/roomy pair has drifted apart once already
            (row C7 — the camera handle was on one of them and not the other, so
            the fold matched nothing on a desktop). */}
        {snap.governorCapKmh === null ? null : <Divider short />}
        <GovernorCapMark
          capKmh={snap.governorCapKmh}
          tierBg={snap.governorTierBg}
          speedKmh={snap.speedKmh}
          limitKmh={limitKmh}
          taskCapKmh={taskCapKmh}
          size="roomy"
        />
      </div>

      <Divider />

      {/* Engine — text state (Вкл./Изкл./Угасна) reads clearer than a glyph. */}
      <div
        className="flex min-w-7 flex-col items-center gap-0.5 sm:min-w-9 md:min-w-11"
        aria-label={
          snap.stalled
            ? STALL_RESTART_LABEL_BG[input]
            : snap.engineOn
              ? "Двигателят работи"
              : "Двигателят е изключен"
        }
        title="Двигател (I)"
      >
        <span
          className={`flex h-6 items-center text-sm font-black leading-none md:h-7 md:text-base ${
            snap.stalled || !snap.engineOn ? "hud-blink" : ""
          }`}
          style={{ color: snap.engineOn && !snap.stalled ? "var(--success)" : "var(--danger)" }}
        >
          {/* „Изкл. I" — the key cap is DECORATION here (the state is the
              reading), so on touch it simply goes, which is the HUD's existing
              `showKeyHints` idiom. The stall label above is the opposite case:
              there the control name IS the way out, so it is translated, not
              dropped. */}
          {snap.stalled ? "Угасна" : snap.engineOn ? "Вкл." : input === "touch" ? "Изкл." : "Изкл. I"}
        </span>
        <span className={CAPTION}>Двигател</span>
      </div>

      {/* Seatbelt — red + blink until buckled (the real telltale grammar). */}
      <Telltale
        labelBg="Колан"
        ariaLabel={snap.seatbeltOn ? "Коланът е поставен" : "Коланът не е поставен"}
        titleBg="Предпазен колан (B)"
        blink={!snap.seatbeltOn}
      >
        <BeltIcon on={snap.seatbeltOn} />
      </Telltale>

      {/* Headlights — distinct icon per state + the BG word under it. */}
      <div
        className="flex min-w-7 flex-col items-center gap-0.5 sm:min-w-9 md:min-w-11"
        aria-label={`Светлини: ${snap.headlights === "off" ? "изключени" : HEADLIGHT_LABEL_BG[snap.headlights]}`}
        title="Светлини (L): изкл. → къси → дълги"
      >
        <span className={GLYPH}>
          <HeadlightIcon state={snap.headlights} />
        </span>
        <span
          className="hidden text-[8px] font-bold uppercase tracking-wider sm:block md:text-[9px]"
          style={{
            color:
              snap.headlights === "off"
                ? "var(--muted)"
                : snap.headlights === "high"
                  ? "var(--accent-soft)"
                  : "var(--success)",
          }}
        >
          {snap.headlights === "off" ? "Светлини" : HEADLIGHT_LABEL_BG[snap.headlights]}
        </span>
      </div>

      <Telltale
        labelBg="Мъгла"
        ariaLabel={snap.fogLightsOn ? "Фаровете за мъгла светят" : "Фарове за мъгла — изключени"}
        titleBg="Фарове за мъгла (V)"
      >
        <FogIcon on={snap.fogLightsOn} />
      </Telltale>

      <Telltale
        labelBg="Чистачки"
        ariaLabel={snap.wipersOn ? "Чистачките работят" : "Чистачки — изключени"}
        titleBg="Чистачки (T)"
      >
        <WiperIcon on={snap.wipersOn} />
      </Telltale>

      {/* Parking brake — the round (P) lamp, red while engaged. */}
      <Telltale
        labelBg="Ръчна"
        ariaLabel={
          snap.parkingBrakeOn ? "Ръчната спирачка е вдигната" : "Ръчната спирачка е освободена"
        }
        titleBg="Ръчна спирачка (Space)"
      >
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full border-[2.5px] text-xs font-black leading-none md:h-7 md:w-7 md:text-sm"
          style={{
            color: snap.parkingBrakeOn ? "var(--danger)" : DIM,
            borderColor: snap.parkingBrakeOn ? "var(--danger)" : DIM,
          }}
        >
          P
        </span>
      </Telltale>

      {/* Hazards — the ▲ button state; the arrows themselves do the flashing. */}
      <Telltale
        labelBg="Авар."
        ariaLabel={snap.hazardsOn ? "Аварийните светлини са включени" : "Аварийни светлини — изключени"}
        titleBg="Аварийни светлини (J)"
      >
        <span
          className="text-xl font-black leading-none md:text-2xl"
          style={{ color: snap.hazardsOn ? "var(--warning)" : DIM }}
        >
          ▲
        </span>
      </Telltale>

      <Divider />

      <BlinkerArrow dir="right" lit={snap.rightLampLit} />
    </div>
  );
}
