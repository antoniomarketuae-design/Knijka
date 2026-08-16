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
  /** Type scale: the phone readout runs one step below the roomy bar. */
  size: "compact" | "roomy";
}) {
  // No cap („Напреднал", or a headless mount that never wrote one) = no mark.
  // Printing „no ceiling" would be furniture that teaches nothing.
  if (capKmh === null) return null;
  const cap = Math.round(capKmh);
  const easing = governorIsEasing(capKmh, speedKmh);
  const nameBg = tierBg.trim() === "" ? "Режимът" : tierBg;
  // The sign clause renders only when the ceiling sits ABOVE the posted limit
  // — the founder's 60-against-50. When the governor is at or under the sign,
  // obeying it cannot break the law and there is nothing to disclaim.
  const overLimit = cap > Math.round(limitKmh);
  const explainBg = easing
    ? `Режимът „${nameBg}“ те ограничава на ${cap} км/ч — газта не отива по-нагоре, колата е наред. Смени режима горе вдясно. Това е таван на РЕЖИМА, не разрешение: важи знакът до скоростта.`
    : `Режимът „${nameBg}“ пуска най-много ${cap} км/ч. Това е таван на РЕЖИМА, не на пътя — знакът до скоростта е ограничението.`;
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
      {/* The register word. Muted and letter-spaced like every other caption in
          this file, but NEVER hidden — a caption that disappears on the phone
          would leave the phone reading exactly the string the founder read. */}
      <span
        data-hud="governor-register"
        className="text-[7px] font-bold uppercase tracking-widest opacity-80 md:text-[8px]"
      >
        Режим
      </span>
      <span>
        {nameBg} ≤{cap}
      </span>
      {overLimit ? (
        <span data-hud="governor-sign-wins" className="font-bold opacity-90">
          · знакът важи
        </span>
      ) : null}
    </span>
  );
}

export function StatusDashboard({
  statusRef,
  limitKmh,
  rejectFlashKey = 0,
  compact = false,
  input = "keyboard",
}: {
  /** Scene-written per-frame status (see dashboardStatus.ts header). */
  statusRef: RefObject<DashboardStatus>;
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

  // Low-Hz mirror of the frame-rate ref (TraceTimeline/cluster poll grammar):
  // copy only when the rendered hash actually changed.
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
