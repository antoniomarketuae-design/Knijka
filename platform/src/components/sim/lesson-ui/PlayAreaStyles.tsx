"use client";

import { TOUCH_CONTROLS_FLOOR } from "../TouchControls";

/**
 * One CSS rule, mounted by the play shell: while a LETTERBOXED session is on
 * screen, the page's prose width cap does not apply to it.
 *
 * WHY IT IS A GLOBAL SELECTOR AND NOT A CLASS. The cap does not live on the
 * shell — it lives on the (dashboard) group's
 * `<main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">`,
 * a 72 rem reading measure that is exactly right for the theory reader, the
 * exam runner and the lesson-select shelf, and exactly wrong for a driving
 * simulator. Measured in the harness at 1920×1080: it held the picture to
 * 1088×612 with 824 px of empty column beside it (founder review 2026-07-28:
 * „there is alot of dark space that we can use to make the screen bigger").
 * The shell cannot widen an ancestor from the inside, and editing the layout
 * would widen every dashboard page, not the one that needs it.
 *
 * `:has()` scopes it precisely: the cap lifts only for a <main> that currently
 * contains a letterboxed session, and drops back the instant the session ends
 * or goes fullscreen (the attribute is absent in the immersive layout). The
 * sidebar is untouched — <main> is a grid column, so it grows into the content
 * area and never under the nav.
 *
 * Specificity/cascade: `main:has([data-sim-play])` is (0,1,1) against
 * `.max-w-6xl` (0,1,0), and this <style> is unlayered while Tailwind's
 * utilities are layered — it wins on both counts.
 *
 * The padding goes with it, and to the same 0.5 rem the IMMERSIVE layout
 * already uses (`p-2` on the shell root) — so entering fullscreen is a change
 * of size, not a change of framing. On a 1366×768 laptop the column is already
 * narrower than the 72 rem cap, so the padding is the only lever there at all
 * (1044 px → 1094 px of picture); on a 1920×1080 window it is worth another
 * 48 px on top of the cap being lifted.
 *
 * GRACEFUL DEGRADATION IS THE POINT of doing it this way: a browser without
 * `:has()` simply keeps today's layout (a 16:9 picture in the reading column),
 * which is a smaller picture, never a broken one. The height cap the shell
 * applies inline is independent of this rule and works everywhere.
 */
export function PlayAreaStyles() {
  return (
    <style>{`
      main:has([data-sim-play="letterbox"]) {
        max-width: none;
        padding: 0.5rem;
      }

      /* ------------------------------------------------------------------
         COMPACT (phone-shaped viewport, 2026-07-28 second pass).

         Two pieces of DESKTOP chrome are rendered by the scene itself, not by
         this shell, and both land in the corner the micro menu needs:

           [data-hud="controls-help"]  the „⌨ Клавиши" keyboard legend, at
             left-3 top-3 — a list of key bindings on a device with no keys.
             It is already collapsed on touch, but the chip still sits exactly
             where the one control a phone DOES need has to go.
           [data-hud="difficulty"]     the Начинаещ/Нормален/Напреднал picker
             at right-3 top-3. It stays (difficulty is a real choice), it just
             moves clear of the notch now that the app ships viewport-fit=cover
             and that corner can be under a cutout.

         A CSS rule and not a prop, deliberately: LessonScene belongs to the
         scene lane, both elements already carry stable data-hud names, and a
         media-query-free rule driven by the shell's own attribute keeps ONE
         definition of "compact" in the codebase (immersive.ts) instead of a
         second one written in @media that would drift from it.
         ------------------------------------------------------------------ */
      [data-sim-compact="on"] [data-hud="controls-help"] {
        display: none;
      }
      [data-sim-compact="on"] [data-hud="difficulty"] {
        right: calc(0.75rem + env(safe-area-inset-right, 0px));
        top: calc(0.5rem + env(safe-area-inset-top, 0px));
      }

      /* ------------------------------------------------------------------
         …and the same treatment for the demonstration deck, which is the
         third piece of scene-owned chrome tuned on a roomy screen.

         It sits at bottom-[6.75rem] — 108px, ROOMY_HUD_FLOOR_PX — and on a
         phone that is inside the control band. So is --sim-hud-floor, which
         resolves to 48px on every phone in the ladder (40px of instrument band
         plus 8): that variable is where the DASH ends, and the touch pads reach
         176px above the bottom, 68px higher than this deck was sitting.

         Measured in WebKit (tools/mobile/stability-probe.mjs) on iPhone 16
         PORTRAIT 393x852 and on a 360x780 Android: the deck is
         min(88%, 26rem) = 346px wide, the steering pad occupies x 0-165 and
         the drive pad x 252-393, so there is no horizontal gap for it to sit
         in — it overlapped the wheel by 981px² and the throttle by 363px².
         Landscape was clean at the same 108px only because the two pads are
         644px apart there. That is how a constant tuned in landscape survived
         a portrait review.

         TOUCH_CONTROLS_FLOOR is interpolated from TouchControls rather than
         written out here: the pads are the one thing on this screen actively
         being reshaped, and whatever the band becomes, this follows it.
         ------------------------------------------------------------------ */
      [data-sim-compact="on"] [data-hud="demo-deck"] {
        bottom: ${TOUCH_CONTROLS_FLOOR};
      }

      /* ------------------------------------------------------------------
         THE MIRROR AND THE HUD — rows B74 / B76.

         The chase view now carries a PERSISTENT rear-view window and Q/E/F
         open it to full size on the glanced side (CameraRig +
         scene/chaseRearView.ts). That window is a quad INSIDE the WebGL
         canvas, so every DOM card painted over the canvas covers it, whatever
         renderOrder it carries — which is exactly what the audit photographed:
         the „Клавиши" legend over ~60 % of the Q window, the toast card over
         half of the E one, the objective chips over the top 40 % of F.

         An instrument you cannot see is not an instrument, so the HUD moves,
         not the mirror. CameraRig publishes on the document root which camera
         is live, whether a glance is held and on which side, and the two window
         edges in CSS pixels; these rules step each panel below whichever edge
         concerns it. Nothing is hidden — a teaching card that arrives
         mid-glance is still on screen, one window-height lower, and it slides
         back the moment the key is released.

         Written here, in the shell's own stylesheet, for the same reason the
         two rules above are: the panels belong to three different components in
         two different lanes, and their only shared vocabulary is data-hud.
         ------------------------------------------------------------------ */
      [data-hud="controls-help"],
      [data-hud="follow-hint"],
      [data-hud="objective-stack"] {
        transition: top 180ms ease-out;
      }
      [data-hud="toasts"] {
        transition: margin-top 180ms ease-out;
      }
      [data-hud="difficulty"] {
        transition: opacity 140ms ease-out;
      }
      @media (prefers-reduced-motion: reduce) {
        [data-hud="controls-help"],
        [data-hud="follow-hint"],
        [data-hud="objective-stack"],
        [data-hud="difficulty"],
        [data-hud="toasts"] {
          transition: none;
        }
      }

      /* The interior mirror hangs where the objective banner used to start, so
         the banner starts under it — for the whole time the chase camera is
         live, because the mirror is permanent. The „follow the blue line" chip
         sits at top-16, i.e. inside the same glass, and goes with it. */
      html[data-sim-camera="chase"] [data-hud="objective-stack"] {
        top: calc(0.75rem + var(--sim-mirror-h, 0px));
      }
      html[data-sim-camera="chase"] [data-hud="follow-hint"] {
        top: calc(4rem + var(--sim-mirror-h, 0px));
      }

      /* …and while a glance is HELD the window is full size and on that side. */
      html[data-sim-glance="left"] [data-hud="controls-help"] {
        top: calc(0.75rem + var(--sim-glance-h, 0px));
      }
      html[data-sim-glance="rear"] [data-hud="objective-stack"] {
        top: calc(0.75rem + var(--sim-glance-h, 0px));
      }
      html[data-sim-glance="rear"] [data-hud="follow-hint"] {
        top: calc(4rem + var(--sim-glance-h, 0px));
      }
      html[data-sim-glance="right"] [data-hud="toasts"] {
        margin-top: var(--sim-glance-h, 0px);
      }

      /* The tier picker shares the top-right corner with the E window and with
         the toast column, and three things do not fit in one corner. It is the
         only one of the three that carries no information — Начинаещ /
         Нормален / Напреднал is a SETTING, and a setting you are not touching
         while your head is turned. So it stands down for the second the glance
         lasts, instead of being stepped into the toasts' new place. A teaching
         card is never treated this way: it moves, it does not disappear. */
      html[data-sim-glance="right"] [data-hud="difficulty"] {
        opacity: 0;
        pointer-events: none;
      }

      /* ------------------------------------------------------------------
         ROW C7 — one speedometer per screen.

         In the cockpit camera the „Виток" 3D cluster draws speed and the
         selector letter inside the cabin, at the resolution four review rounds
         were spent on. The compact readout was drawing both AGAIN, 40 px lower,
         because it had no way to know which camera was live; the audit frame has
         the analogue dial, its digital „0 км/ч" and its „D" in the same picture
         as a DOM „D 0 км/ч". Two speedometers do not make a student faster at
         reading one.

         What does NOT go away is the limit disc: the cluster shows what the car
         is doing, never what the law allows, and speed discipline is the whole
         claim of this product. So in the cockpit the readout is exactly the one
         number the instrument panel cannot give you.

         Chase and top-down are untouched — there the cluster is not in frame at
         all, which is why this readout was kept in the first place.
         ------------------------------------------------------------------ */
      html[data-sim-camera="cockpit"] [data-hud="speed-block"] {
        display: none;
      }

      /* ------------------------------------------------------------------
         ROW C2 — 44 px under the thumb, 0 px more paint.

         Measured in WebKit on iPhone 16: „Начинаещ" 75.6×24.5, „Нормален"
         73.5×24.5, „Напреднал" 78.8×24.5 and „🎬 Демонстрация ▸" 137.2×26.5.
         Wide enough, half as tall as a thumb needs.

         Growing the buttons would have grown the chrome with them — the tier
         group alone is already 2.6 % of a landscape phone, and this is the
         screen the founder measured as „half furniture". So the TAP AREA grows
         and the pill does not: an absolutely positioned ::before at −0.75 rem
         top and bottom puts the hit rect at 24.5 + 24 ≈ 48 px. A pseudo-element
         paints nothing and is in no DOM, so it is charged nothing — and the
         mobile probe unions exactly these insets into the measured hit rect
         (tools/mobile/lib/probe.mjs, „a common and legitimate trick").
         ------------------------------------------------------------------ */
      [data-sim-compact="on"] [data-hud="difficulty"] button,
      [data-sim-compact="on"] [data-hud="demo-deck"] > button,
      /* C2 residual (doc 87:238): the fourth target. «Разбрах» measured
         62.9 × 24.9 px — and it is the ONE control that clears the popup C1 is
         about, so leaving it under the thumb minimum meant the student could
         not dismiss the thing covering his road. Same treatment, same reason:
         the hit rect grows to ~49 px, the pill paints not one pixel more. */
      [data-sim-compact="on"] [data-hud="audio-prompt"] button {
        position: relative;
      }
      [data-sim-compact="on"] [data-hud="difficulty"] button::before,
      [data-sim-compact="on"] [data-hud="demo-deck"] > button::before,
      [data-sim-compact="on"] [data-hud="audio-prompt"] button::before {
        content: "";
        position: absolute;
        top: -0.75rem;
        bottom: -0.75rem;
        left: 0;
        right: 0;
      }

      /* ------------------------------------------------------------------
         ROW C1 — ONE surface in the top band, not four painted on each other.

         The founder's landing frame (doc 87:237) is three surfaces stacked in
         the same 60 px of screen — the audio card with its own «Разбрах», the
         red «⚠ Коланът не е поставен» line, and the tier picker bleeding
         through behind them — plus a fourth full-width «Завърти телефона
         хоризонтално» note across the road. The harness reached the same
         verdict from the other side: „«Разбрах» was not tappable (something is
         painted over it)." A control that cannot be pressed is not a smaller
         box problem. It is a PRIORITY problem, and priority is what was
         missing: each of these four decided on its own that it deserved the
         top of the screen, which is the exact defect hud/overlayQueue.ts was
         written to end — except that three of the four are mounted in the
         SCENE tree and never entered the queue.

         They enter it here, by the cascade, because that is the one vocabulary
         the two trees share (the SimOverlay precedent, hud/SimOverlay.tsx:216:
         the overlay layer already stands the tier picker and the telltale
         pings down while it speaks). The order is not a taste call — it is
         which one the student can act on soonest:

           1. the shell's overlay line (a graded fault, a task, a teach card):
              it is the lesson talking, and it already owns the rail;
           2. «Завърти телефона хоризонтално»: on a portrait phone NOTHING
              else is actionable until it is done;
           3. the audio chip: real pedagogy, but it keeps until the student
              is holding the phone the right way round;
           4. the tier picker: chrome, and the only one of the four that is
              still one tap away at any time from the ⚙ sheet.

         Nothing is deleted and nothing moves — each surface simply waits for
         the one above it. All of them come straight back, which on a landing
         screen is a second or two later.
         ------------------------------------------------------------------ */
      [data-sim-compact="on"][data-sim-overlay-active="on"] [data-hud="audio-prompt"],
      [data-sim-compact="on"][data-sim-overlay-active="on"] [data-hud="touch-hint"] {
        display: none;
      }
      [data-sim-compact="on"]:has([data-hud="touch-hint"]) [data-hud="audio-prompt"],
      [data-sim-compact="on"]:has([data-hud="touch-hint"]) [data-hud="difficulty"],
      [data-sim-compact="on"]:has([data-hud="audio-prompt"]) [data-hud="difficulty"] {
        display: none;
      }

${UNPANEL_CSS}
    `}</style>
  );
}

/* ===========================================================================
   THE UNPANEL LAYER — the driving HUD stops being a web page over a road.
   ===========================================================================

   FOUNDER REFERENCE, 2026-08-02. Two Gran Turismo frames and one layout he
   drew himself, in `C:\Users\Ljh\Desktop\For fix\`. Opened, finally, and the
   thing they share is NOT the coverage number:

     · tyre temps, ABS, ECU, TC, fuel, the lap times, the leaderboard — none of
       it sits on a card. Naked text and hairline outlines, straight on the
       image;
     · „Brake" and „Throttle" are barely-visible grey words you can read the
       road through;
     · nothing is filled, nothing is blurred, nothing casts a shadow.

   WHY THIS EXISTS AS ITS OWN PASS, AFTER THE COVERAGE WORK. The mobile harness
   charges every pixel a control paints on, so we drove chrome 68.3 % → 6.1 %
   and called it done. Measured here on 2026-08-02 at 1280×720, the drive
   screen still carried THIRTY-EIGHT filled / blurred / bordered surfaces —
   the „⌨ Клавиши" legend alone was 7.8 % of the frame as an opaque blurred
   card, the instrument bar 4.6 %, the audio chip 2.7 %. Six per cent of solid
   cards still reads as a web page; fifteen per cent of floating text reads as
   a game. WE OPTIMISED AREA AND HE WAS ASKING ABOUT FILL.

   So this layer changes FILL, not size, and it is expected to score WORSE on
   tools/mobile — a text-shadow paints more pixels than the glyph alone, and a
   hairline that used to be invisible against a fill is now charged. That is
   the trade, stated out loud rather than hidden.

   HOW CONTRAST SURVIVES WITHOUT A BOX. Exactly the way the reference does it:
   a two-stop dark halo under the type (`--hud-halo`), and ink pinned to the
   LIGHT register in both themes. The pin is the part that is easy to get
   wrong: the ground behind this HUD is a photograph of a road, not the app
   background, so `--foreground` — which is #0b1524 in the light theme — would
   be dark ink under a dark halo, i.e. mud. Inside the stage, and only there,
   the tokens are restated for the surface they are actually painted on.

   WHERE THE TOKEN OVERRIDE HANGS, AND WHY NOT ON THE STAGE. The obvious move
   is to restate the tokens once on the scene box and let them inherit. It is
   wrong, and the reason is worth writing down: the debrief, the micro-quiz and
   the teach card are rendered INSIDE that box, and they are explicit pauses —
   pages to read, on their own scrim, with the theory-grade contrast the founder
   already signed off. Doc 89 §3 is about those cards clipping their own text; a
   student who cannot read the rule they just broke has lost the lesson, not the
   look. Cancelling an inherited override in a subtree cannot be done cleanly
   either — `--x: initial` on a custom property yields the guaranteed-invalid
   value, not the theme's, and restating the palette here would fork it.

   So the tokens ride on the GHOST SURFACES THEMSELVES. Nothing that is not in
   the list below can inherit them, the pause overlays never see them, and no
   cancellation rule has to exist.

   WHAT IS DELIBERATELY NOT SWEPT:
     · `border-radius` — a radius on a transparent element paints nothing, and
       blanket-zeroing it would square off the red speed-limit disc, which is a
       road sign, not a card;
     · semantic border colours (danger / success / accent) set by the
       component — those are information;
     · every explicit pause, by construction (see above).

   WHY A STYLESHEET AND NOT TWELVE COMPONENT EDITS. The same reason the mirror
   and overlay-queue rules above live here: these panels belong to five
   components across three lanes, and `data-hud` is the only vocabulary they
   share. The components this lane owns carry `hud-ghost` in their own class
   lists (the intent is in the code); the ones it does not are reached here by
   name, which is also the merge-safe way to do it while other lanes have those
   files open.
   =========================================================================== */
/**
 * THE GHOST SURFACES — stated once, used by every rule below.
 *
 * `.hud-ghost` is what the components in this lane carry in their own class
 * lists, so the intent lives in the code. The `data-hud` names are the surfaces
 * owned by OTHER lanes: reaching them through the shared attribute vocabulary
 * is both the established pattern in this file and the merge-safe way to do it
 * while those files are open in another worktree.
 *
 * Anything not on this list keeps its panel — which is how the debrief, the
 * micro-quiz, the teach card and the pre-drive checklist stay readable without
 * a single cancellation rule (see the header).
 */
export const GHOST_SURFACES = [
  ".hud-ghost",
  '[data-hud="controls-help"]', // „⌨ Клавиши" — 7.8 % of the frame, measured
  '[data-hud="audio-prompt"]',
  '[data-hud="difficulty"]',
  '[data-hud="demo-deck"]',
  '[data-hud="touch-hint"]',
  '[data-hud="follow-hint"]',
  '[data-hud="glance-buttons"]',
  '[data-hud="glance-ping"]',
  '[data-hud="mouse-pedals"]', // „Brake" / „Throttle" in the reference
] as const;

/** `:is(…)` over the list — one token, so the list cannot drift between rules. */
const GHOST = `:is(${GHOST_SURFACES.join(", ")})`;

/**
 * Exported ONLY so `unpanel.test.ts` can assert on the shipped text of these
 * rules. A stylesheet in a template literal is the one thing in this app that
 * can rot into a no-op without a single type error, a single failing render or
 * a single changed pixel in a test — which is exactly how the tier picker's
 * filled segment survived a whole „unpanel" pass. The component below is still
 * the only consumer at runtime.
 */
export const UNPANEL_CSS = `
      /* ── The register. See GHOST_SURFACES above for what is on this list. */
      [data-sim-stage] ${GHOST} {
        /* THE FACE — 2026-08-03, and it is the half of the reference the first
           unpanel pass did not read. His sentence about the top edge is not
           only about fill: „crisp flat vector glyphs laid on the 3D … where his
           reference uses LOW-CONTRAST MONOSPACE TEXT ANCHORED TO THE EDGE."
           Both GT frames are telemetry in a mono face — ABS, TC, the lap
           times, the sector deltas — and our HUD was drawing the same job in
           IBM Plex Sans, the app's reading face, which is what a web page is
           set in. One declaration on the register moves every instrument at
           once (speed, gear, limit, telltales, the tier picker, the peek line)
           instead of eleven component edits that would drift.

           JetBrains Mono ships a CYRILLIC subset in this app (layout.tsx), so
           «Начинаещ» and «км/ч» render in it rather than falling through to a
           latin-only fallback — that was the one thing worth checking before
           pinning a face on Bulgarian copy.

           The explicit pauses are unaffected: they are not on this list, and
           the debrief / teach card / micro-quiz stay in the reading face. */
        font-family: var(--font-mono);
        /* The halo that replaces the box. Two stops: a tight one that holds an
           edge against bright tarmac, a wide soft one that separates the glyph
           from a busy background, the way the reference's does. */
        --hud-halo: 0 1px 3px rgba(0, 0, 0, 0.95), 0 0 10px rgba(0, 0, 0, 0.7);
        /* Ink, pinned light in BOTH themes — the ground here is a road, not the
           app background (see the header). Inherited by the subtree, so
           "text-foreground" / "text-muted" inside a ghost follow without any
           component having to know. */
        --foreground: #f2f6fc;
        --muted: #c3cfe2;
        /* Hairlines, pinned neutral for the same reason: #d3e0f0 vanishes on a
           bright road and #1e2c46 vanishes on a dark one. Semantic borders
           (danger / success / accent) are set by the component and untouched. */
        --border: rgba(226, 234, 247, 0.22);
        --border-strong: rgba(226, 234, 247, 0.38);
        text-shadow: var(--hud-halo);
      }

      /* …NUMBERS AND LABELS IN THE TELEMETRY FACE, SENTENCES IN THE READING
         FACE. The mono pin above is the reference's grammar for instruments —
         and the reference has no PROSE in it at all, while this HUD does: the
         violation toast carries THEO-4's authored WHY, which is the single
         most important thing on the screen at the moment it appears. Measured:
         JetBrains Mono sets about 24 characters per line in the 216 px toast
         content box against about 35 in the body face, i.e. the same
         explanation grows from four lines to six on the founder's phone. A
         look is not worth costing a student the rule they just broke.

         The split falls out of the existing markup with nothing to maintain:
         every instrument value in this HUD is a span/div/kbd and every
         authored sentence is a <p>. */
      [data-sim-stage] ${GHOST} :is(p, h1, h2, h3, blockquote) {
        font-family: var(--font-sans);
      }

      /* ── The sweep. Fill, blur and shadow come off the panel AND off every
            chip inside it — a ghost panel with a solid pill in it is still a
            panel, just a smaller one. What is left is the outline, which is
            exactly the reference's hairline.

            "[data-hud-ink]" is the opt-out for the handful of fills that ARE
            the information: a progress bar with no fill is not a progress bar,
            and the tier picker's lit pill is the answer to „which tier am I
            on" (the reference has a filled green „BEST" chip for the same
            reason). ──────────────────────────────────────────────────────── */
      [data-sim-stage] ${GHOST},
      [data-sim-stage] ${GHOST} :is(div, span, button, kbd, p, li, a, section):not([data-hud-ink]):not([data-hud-ink] *):not([aria-pressed="true"]) {
        background-color: transparent !important;
        background-image: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        box-shadow: none !important;
      }

      /* ── THE SEGMENTED CONTROL — «Начинаещ | Нормален | Напреднал».
            2026-08-03 review, verbatim: „a segmented control lifted straight
            from a settings page, with a FILLED BLUE SELECTED SEGMENT."

            He is describing an iOS/Material segmented control, and he is right
            that it is one: a pill group with a brand-filled active segment is
            the single most recognisable piece of settings-page furniture in
            mobile design, and it was sitting on his windscreen.

            The container was already unpanelled by the sweep above. What
            survived is the SEGMENT, because the sweep carries a blanket
            ":not([aria-pressed="true"])" — written for progress fills and the
            reference's one filled badge, and it happened to also exempt this.
            So the exemption is withdrawn HERE, for this control only, and the
            selected state is restated in the reference's own grammar: the
            chosen tier is the one at full ink with a rule under it, the others
            step back. Nothing is hidden, nothing moves, and the answer to
            „which tier am I on" is still readable at a glance — which is the
            reason the fill was exempted in the first place.

            WHY IT IS STILL A CSS RULE AND NOT A COMPONENT EDIT: the picker is
            rendered by LessonScene.tsx, another lane's file, and "data-hud" is
            the shared vocabulary this whole stylesheet is built on (see the
            header). Specificity: this is (0,3,1) against the sweep's (0,2,1)
            and it repeats "!important", so it wins on both counts. ────────── */
      [data-sim-stage] [data-hud="difficulty"] button[aria-pressed="true"] {
        background-color: transparent !important;
        background-image: none !important;
        box-shadow: inset 0 -2px 0 0 currentColor !important;
        color: var(--foreground);
        border-radius: 0;
      }
      [data-sim-stage] [data-hud="difficulty"] button[aria-pressed="false"] {
        /* Legible, and clearly not the one you are on. 0.72 against the pinned
           #c3cfe2 over the halo, not against the road. */
        opacity: 0.72;
      }
      [data-sim-stage] [data-hud="difficulty"] button {
        letter-spacing: 0.06em;
      }
      /* …and the GROUP's own ring goes with the fill. A rounded outline around
         three options is the other half of what makes a segmented control read
         as one: rendered, it was still a pill sitting in his sky. Three words
         at the edge with one of them underlined is the whole control, and it
         is the shape the reference uses for the same job. */
      [data-sim-stage] [data-hud="difficulty"] {
        border-color: transparent;
      }

      /* ── „Brake" and „Throttle" are ghosts in the reference, and so are the
            mirror-glance arrows that sit in the same corners. Readable, and
            you can see the road through them. They come back to full strength
            the moment a finger is on them, which is the one state where a
            control has to be unambiguous. ────────────────────────────────── */
      [data-sim-stage] [data-hud="mouse-pedals"] button,
      [data-sim-stage] [data-hud="glance-buttons"] button {
        opacity: 0.5;
        transition: opacity 140ms ease-out;
      }
      [data-sim-stage] [data-hud="mouse-pedals"] button:hover,
      [data-sim-stage] [data-hud="mouse-pedals"] button[data-pressed="1"],
      [data-sim-stage] [data-hud="glance-buttons"] button:hover,
      [data-sim-stage] [data-hud="glance-buttons"] button:active {
        opacity: 1;
      }
      @media (prefers-reduced-motion: reduce) {
        [data-sim-stage] [data-hud="mouse-pedals"] button,
        [data-sim-stage] [data-hud="glance-buttons"] button {
          transition: none;
        }
      }

      /* ── Doc 89 §3, and it belongs in this layer because it is the same
            defect seen from the other side: „the violation card is WIDER THAN
            THE VIEWPORT. Both edges are cut off mid-word — «...АСНА ГРЕШКА»,
            «ътнотранспортно произшествие»." A card that clips its own text has
            destroyed the content, which is worse than a card that is too big.

            The three explicit pauses keep their panel — a student reading the
            rule they just broke needs a page, not a ghost — so they are simply
            never allowed to exceed the picture, and a long Bulgarian compound
            wraps mid-word rather than running off the edge. Cheap, total, and
            it cannot regress: it is stated once for the whole stage instead of
            per card. ─────────────────────────────────────────────────────── */
      [data-sim-stage] [data-hud-keep] {
        max-width: 100%;
      }
      /* Text elements only, deliberately: a blanket "min-width: 0" on "*" is
         the usual flex-overflow fix and it would out-specify the "min-w-11"
         utilities that hold this app's 44 px touch targets open. Wrapping is
         the half of the fix that cannot shrink a control. */
      [data-sim-stage] [data-hud-keep] :is(p, h1, h2, h3, h4, li, dd, dt, td, blockquote) {
        overflow-wrap: anywhere;
      }
`;
