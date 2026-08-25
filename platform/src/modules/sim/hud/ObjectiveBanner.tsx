"use client";

/**
 * Objective banner — the top item of the RIGHT-EDGE NOTIFICATION COLUMN. Shows
 * the active objective ("Задача 2/3"), an optional progress bar (driveDistance
 * objectives) and, right after one completes, a checkmark flash before
 * advancing to the next.
 *
 * The shell passes `flash` with a fresh `key` on every completion; the banner
 * owns the 1.6 s reveal timing.
 *
 * ── 2026-08-03: IT IS NOT „TOP CENTER" ANY MORE. ─────────────────────────────
 * The founder's own annotated frame has this banner as the topmost of three
 * stacked cards across the middle of the road — the „ЗАДАЧА 2/2" panel — and
 * his instruction, for the third time, is to MOVE it, not to shrink it or fade
 * it. It is now a column item: `w-full` inside `notifyColumn.ts`'s geometry,
 * the chip above the title rather than beside it (a 20-character Bulgarian
 * objective and a chip do not share a 240 px line), small text, wrapping.
 *
 * `min-w-64` is gone with the centring. A 256 px floor inside a column that is
 * 141 px wide on a portrait iPhone is precisely the shape `hud-card-fit`'s last
 * section warns about: min-width is resolved AFTER max-width, so the floor wins
 * and the card hangs out of the stage.
 *
 * ── 2026-08-17: IT HAD NO NAME, AND THAT IS WHY NOTHING SAW IT. ──────────────
 *
 * The 161-scenario catalogue sweep routed seventeen BROKEN findings at this
 * file. Read off the frames, they are two collisions and one echo:
 *
 *   THE PILL LANDS ON THE TITLE. `PlayAreaStyles` moves «Следвай синята линия»
 *   (`[data-hud="follow-hint"]`) and the telltale cue into THIS column's lane —
 *   same `NOTIFY_COLUMN_RIGHT_CSS`, same `NOTIFY_COLUMN_WIDTH_CSS_ROOMY`,
 *   `justify-content: flex-end` — but it leaves them `absolute` at their own
 *   `top-16`. The column's roomy top is `NOTIFY_COLUMN_TOP_CSS_ROOMY`, 3.25 rem.
 *   Two absolutely positioned lanes, identical in x, 12 px apart in y: they were
 *   never going to miss each other. Measured off
 *   `sc-roundabout-entry/pc-right/04-t141s.png` (1440 × 900, stage at x 265 /
 *   y 107, ±2 px read off the pixels):
 *
 *     this banner        [1096, 159, 320 × 46]
 *     the follow chip    [1242, 162, 174 × 27]   ← entirely inside it
 *
 *   Both are ghost surfaces, so neither hides the other: the two strings
 *   composite glyph-for-glyph into «Премини през кръговото иCизлезiс десенамигачıя».
 *   Reproduced on sc-ov-keep-right, sc-ed-reverse-line, sc-ed-poligon-chain,
 *   sc-ed-d2-city-run, sc-follow-brake and sc-ln-turn-lane-arrows.
 *
 *   THE ADVISOR SAYS IT AGAIN, VERBATIM. `advisorPromptForObjective` falls back
 *   to the objective's own `titleBg` for five of its cases and to
 *   `${titleBg} — дръж под N км/ч` for a capped reachZone, so the card directly
 *   under this one repeats the sentence in the same 100 px of screen
 *   (sc-zebra-approach, sc-lane-change, sc-hz-accident-scene, sc-mw-min-speed).
 *
 * NEITHER LIVES IN THIS FILE. What does is the reason nobody had MEASURED
 * either, and it is not a hypothesis — it is a grep:
 *
 *   tools/mobile/overlay-probe.mjs:73   '[data-hud="objective-stack"]'
 *   tools/mobile/engprog-look.mjs:59    '[data-hud="objective-stack"]'
 *   platform/src/**                     — NOTHING RENDERS IT
 *
 * `objective-stack` was the pre-2026-08-03 centred three-panel stack that the
 * block above records dissolving into this column. Both probes have been asking
 * for it by name ever since and getting null: `overlay-probe`'s CONTENDERS list
 * — the list its own header says exists because „a probe that looks only for the
 * queue's marker cannot see the defect it exists to catch" — has not charged one
 * pixel for the objective since, and `engprog-look` has been reporting `task: ""`.
 * This banner is the one surface on the stage that is up for the whole drive, it
 * carried no `data-hud`, and every rule and census in this tree is keyed on that
 * attribute. It is the same failure `RIBBON_LEGEND_LANE_PX` records against the
 * shadow-line legend („the first measurement reported ZERO overlaps while
 * sitting entirely on top of it"), and the same one `selectors.test.mjs` was
 * written for: a selector that matches nothing vouches for a screen it has never
 * looked at.
 *
 * So the surface takes a name — a TRUE one, `objective-banner`, because it is
 * one banner and not a stack. The two probes are re-pointed, not appeased:
 * `unpanel.test.ts`'s own instruction for a rotted handle is „re-point the rule
 * at whatever the surface is called now", never rename the component to fit a
 * stale selector.
 *
 * ── …AND THE TASK IS PROSE, NOT TELEMETRY. ───────────────────────────────────
 *
 * The UNPANEL layer pins ghost surfaces to `--font-mono` and exempts authored
 * sentences by TAG: `${GHOST} :is(p, h1, h2, h3, blockquote)` goes back to
 * `--font-sans`. `unpanel.test.ts` states the reason — mono „costs it two lines
 * in the 216 px toast box and a student reads that sentence at the worst moment
 * of the lesson (THEO-4)". The objective title is the same kind of thing (it is
 * the authored instruction, straight off the template) and it was a `<span>`, so
 * it fell outside the exemption and shipped as telemetry. Measured on the same
 * frame: «Приближи кръстовището овладяно, готов за завой», 45 characters, ran
 * 307 px — 6.8 px per character — so the mono line budget in this column's
 * 312 px content box is 45 characters, and PlayAreaStyles' own comparison puts
 * the reading face at 1.46× the characters per line. The `Задача i/т` chip stays
 * a `<span>`: a counter IS telemetry and belongs in the telemetry face.
 *
 * ── 2026-08-18: THE LINE BREAK LANDS INSIDE THE GRADED NUMBER. ───────────────
 *
 * The redrive of the 161-scenario catalogue routed thirty-six BROKEN findings
 * here. All but one are somebody else's lane and are listed at the bottom of
 * this block. The one that is OURS is `sc-ac-aquaplane`, filed as minor and
 * photographed on `pc-right/01-arrival.png`:
 *
 *     «… дръж под 63 км/»
 *     «ч»
 *
 * The unit is cut in half by a wrap. It is a `<p>` with `break-words`, and
 * `break-words` is not what did it — UAX #14 gives SOLIDUS a break opportunity
 * AFTER it, so «км/ч» carries a legal wrap point in its own middle, and the
 * engine takes it whenever the line fills to just past the slash. That is a
 * one-character window, which is why it shows on one frame out of a hundred
 * and not on all of them.
 *
 * The frame that says why a one-in-a-hundred wrap is worth a fix is
 * `sc-ac-rain-lights/pc-right/04-t090s.png`, filed MAJOR for the same shape on
 * a world label: „«не по-бързо от 47 км/» … so the one figure the student is
 * being scored against is unreadable". A speed cap is not decoration; it is the
 * threshold the rung is graded on.
 *
 * MEASURED over the shipped catalogue, 2026-08-18 (663 compiled rungs, 1 575
 * rung-objectives, the same sweep the line-budget block at the foot of
 * `objective-banner-surface.test.ts` walks):
 *
 *     40 of 1 575 objective titles carry «км/ч» (10 distinct sentences)
 *     «км/ч» is the ONLY token following a numeral that contains a solidus —
 *       the rest of the tail is «с» (16) and «метра» (4), neither of which has
 *       a break opportunity inside it
 *     the longest is 61 characters — «Подмини авариралата кола в лентата за
 *       движение — под 110 км/ч» — i.e. it sits ON the 65-character reading
 *       line this column buys, so it is the one most likely to wrap at all
 *
 * So the numeral and its unit are bound into one `white-space: nowrap` run and
 * NOTHING ELSE IS. A blanket `nowrap` on the title would be the „loosen the
 * check until everybody passes" move in layout form: it would take a 77-
 * character title (the catalogue's worst) and push it straight out of a 312 px
 * column, trading a rare amputated unit for a guaranteed clipped sentence.
 * `withUnitsUnbroken` below therefore binds only what was measured, and the
 * text content is left byte-for-byte identical — no word joiners, no NBSPs —
 * because `advisorEchoTrim` in the shell compares the advisor's sentence
 * against this exact string, and a probe that reads `textContent` must keep
 * reading the authored title.
 *
 * WHAT IS NOT THIS FILE'S, of the other thirty-five, with where it went:
 *   · the objective printed twice (the advisor card repeating `titleBg`
 *     verbatim) — `advisorEchoTrim` in `LessonPlayShell.tsx`, landed;
 *   · the banner painted across the interior rear-view mirror, including the
 *     one CRITICAL finding (`sc-vu-emergency`) — `NOTIFY_COLUMN_TOP_CSS_ROOMY`
 *     in `notifyColumn.ts`, landed (52 px → 156.55 px on a 1264 × 619 stage);
 *   · «Следвай синята линия» composited into the title — `follow-hint` is
 *     still `top-16` in `LessonScene.tsx` while this column now starts at
 *     156.55 px, so the collision is gone, but the pill has been left sitting
 *     INSIDE the mirror band (0.24 × 619 + 8 = 156.6 px) that the column just
 *     stepped out of. It needs the column's top, not the column's x alone;
 *   · «Задача 3/3» read as „three of three DONE" against a debrief that ticks
 *     two — the ⚙ sheet's rows are `LessonPlayShell.tsx` 3123 / 3222, and the
 *     notation is shared with the chip below. A copy decision, not a layout
 *     one, and it must move in all three places at once.
 */

import { useEffect, useState, type ReactNode } from "react";

import {
  PEEK_SCRIM_FEATHER_PX,
  peekScrimBackgroundCss,
  peekScrimMaskCss,
} from "./SimOverlay";

/**
 * «км/ч» with the numeral in front of it, as ONE run.
 *
 * The numeral is inside the group on purpose: «под 110» / «км/ч» separates the
 * figure from its unit, which is the same defect one break earlier, and both
 * are the shape `sc-ac-rain-lights` was filed for. `[.,]` because Bulgarian
 * copy uses the comma decimal, though nothing in the shipped catalogue does
 * today (all 40 are whole numbers).
 *
 * Global because `matchAll` requires it; safe as a module singleton because
 * `String.prototype.matchAll` clones the regex rather than advancing this
 * one's `lastIndex`.
 */
const GRADED_SPEED_UNIT = /(?:\d+(?:[.,]\d+)?\s*)?км\/ч/gu;

/**
 * The authored sentence, with every graded speed bound against the wrap.
 *
 * Returns the string untouched — not an array of one — when there is nothing to
 * bind, so the 1 535 titles that carry no unit render as a single text node and
 * the markup this component emits for them does not change at all.
 */
function withUnitsUnbroken(text: string): ReactNode {
  const runs = [...text.matchAll(GRADED_SPEED_UNIT)];
  if (runs.length === 0) return text;

  const out: ReactNode[] = [];
  let cut = 0;
  runs.forEach((run, i) => {
    const at = run.index;
    if (at > cut) out.push(text.slice(cut, at));
    out.push(
      <span key={`u${i}`} style={{ whiteSpace: "nowrap" }}>
        {run[0]}
      </span>,
    );
    cut = at + run[0].length;
  });
  if (cut < text.length) out.push(text.slice(cut));
  return out;
}

/**
 * ── 2026-08-25: THE ONE SURFACE THAT IS UP FOR THE WHOLE DRIVE HAD NO GROUND ─
 *
 * `sc-junction-blind:a3d5e632`, filed MAJOR and photographed twice. Off
 * `w10-1/frames/sc-junction-blind__pc-right/01-arrival.png` at 2.8×
 * (x 1050-1440 / y 250-380): «ЗАДАЧА 1/2» and «Приближи кръстовището бавно, с
 * готовност за спиране» are white glyphs with NOTHING behind them, laid over a
 * pale building facade and then a dark green tree crown — white-on-pale then
 * white-on-dark INSIDE ONE LINE — and over the demonstration picture-in-picture
 * panel as well. Same shape on `04-t092s.png`, task 2/2, over the sky.
 *
 * THE HALF THAT WAS ALREADY FIXED IS WHY THIS ONE SURVIVED. The row's other
 * clause — the coach bubble repeating the sentence verbatim — went with
 * `advisorEchoTrim`, and the round-10 judge recorded the rest in one sentence:
 * „the repair landed on one platform only". On COMPACT there is no banner at
 * all (`LessonPlayShell` hides the column) and the objective travels as the
 * queue's `task` item, which `SimOverlay` paints on the peek — and the peek has
 * carried this exact shade since 2026-08-14. So the phone was legible and the
 * laptop was not, on the same lesson, in the same sweep.
 *
 * SO THE RECIPE IS TAKEN, NOT RE-DECIDED. `PEEK_SCRIM_*` is published out of
 * `SimOverlay` for exactly this („a hand-kept near-copy of a gradient is two
 * numbers that must agree with nothing making them"), and both halves travel:
 * the horizontal ramps as a background, the vertical ones as a MASK, because
 * two background layers stack instead of intersecting and put a hard edge back
 * on the two sides the shade exists to remove.
 *
 * WHAT THE NUMBERS ALREADY DECIDE FOR THIS COLUMN, so nothing here re-picks
 * them: `top` is 0 because above this card is the interior mirror's lane and
 * `NOTIFY_COLUMN_TOP_CSS_*` leaves zero slack over it — this banner is the TOP
 * item of the column, so it is the one surface a top ramp would actually spend
 * on the mirror. Alpha is 0.8 and not 1.0 for the founder's own reason, quoted
 * at the constant: „an instruction he can read but which hides the hazard it is
 * about is a different failure". The shade dims the world here; it does not
 * replace it, which is what keeps this a ghost surface and not the panel the
 * 2026-08-03 ruling removed.
 *
 * `relative isolate` ON THE HOST IS LOAD-BEARING AND IS NOT STYLE. Without
 * `isolate` a `z-index: -1` child escapes its parent's stacking context and
 * paints behind the stage — no shade at all, and not one pixel of test output
 * changes; without `relative` the shade covers the text it is under. Both are
 * asserted in `objective-banner-surface.test.tsx`, mutation-proved, because
 * that is the token bc5a279 found guarded by 139 green tests and nothing else.
 *
 * ── 2026-08-25, SAME DAY, ADVERSARIAL PASS: THE RECIPE TRAVELLED AND THE
 *    GEOMETRY DID NOT, SO THE SENTENCE WAS STILL STANDING IN A FADE. ─────────
 *
 * The first version of this element took the published gradient and mounted it
 * on `inset: 0`. `SimOverlay` mounts the identical shade on NEGATIVE insets,
 * one per side, each equal to its own feather, and the constant says why:
 * „Feather === bleed is what keeps the flat core exactly coincident with the
 * card's box: the ramps live entirely in the overhang, so no glyph is ever
 * standing on a partial ground." Mounted at `inset: 0` the ramps live INSIDE
 * the card — and this card is 31.5 px tall where the peek is 161.
 *
 * MEASURED, on `w10-1/frames/sc-ac-crosswind__pc-right/04-t084s.png` cropped
 * (1080, 255, 360 × 110) and upscaled 4×, which renders this same steady
 * banner:
 *
 *     «ЗАДАЧА 1/2»        glyphs y 268.75 - 275.0     box top    ~265.0
 *     «Мини отсечката …»  glyphs y 285.0  - 294.5     box bottom ~296.5
 *     bottom feather 16   → the mask starts fading at   y ~280.5
 *
 * The COUNTER — the least important string on the card — got the full 0.8
 * ground, and the INSTRUCTION, which is the string both `a3d5e632` and
 * `sc-ac-crosswind:b30bdf77` name, sat entirely inside the fade: alpha ~0.33 at
 * its mid-height and ~0.13 at its baseline. The left ramp did the same thing
 * sideways — text starts at `px-1` = 4 px and the flat core started at 26 px,
 * so the leading 22 px of every line stood on a ground ramping 0 → 0.68.
 *
 * AND THE OVERHANG IS NOT AVAILABLE HERE, which is why the repair is not simply
 * SimOverlay's four negative insets. The roomy column carrying
 * `data-hud="notify-column"` (`LessonPlayShell`) is `overflow-hidden` and every
 * card in it is `w-full` — the card's left edge IS the column's left edge. A
 * bled shade is therefore clipped exactly at the card's box: the ramps never
 * paint at all, and what is left is a flat 0.8 rectangle with a hard vertical
 * edge on the road side, i.e. the plate the 2026-08-03 ruling removed, bought
 * with the diff that was supposed to close this row. `LessonScene`'s touch-hint
 * met the same wall first and wrote it down: „this root is `overflow-hidden` …
 * so an overhang would be clipped to nothing and the geometry is `inset: 0`
 * instead."
 *
 * SO THE RAMP IS BOUGHT OUT OF THE CARD'S OWN PADDING, and the padding is
 * raised to pay for it: `px-1 py-0.5` → `px-2 pt-0.5 pb-1.5`. One invariant,
 * and it is the one the gate reads:
 *
 *     feather[side] <= padding[side]     on every side of BOTH branches
 *
 * — the card's padding is the overhang SimOverlay gets for free. THE COST IS
 * STATED RATHER THAN HIDDEN: 8 px of reading width off each side (312 → 296 px
 * on a 320 px column, one more wrap on the longest titles) and 4 px of height,
 * on the one surface that is up for the whole drive. Every px of ramp here is a
 * px the sentence does not get, which is why these ramps are 8 and 6 and not
 * the peek's 26 and 16: that card bleeds outside itself and can afford a long
 * dissolve, this one pays for every px of it out of the instruction.
 *
 * `top` STAYS THE PUBLISHED 0 and is imported rather than re-typed, because its
 * reason is about the COLUMN and not about this card's height: above it is the
 * interior mirror's lane and `NOTIFY_COLUMN_TOP_CSS_*` leaves zero slack over
 * it. The cost is the bounded one SimOverlay already accepted — a hard edge on
 * the one side with no room for a ramp, whose ends dissolve over the horizontal
 * ramps, so it is a stroke with no corners rather than a plate.
 *
 * `borderRadius: "inherit"` because the FLASH branch is `rounded-2xl`: a square
 * shade behind a 16 px radius paints its shoulders outside the border for the
 * whole 1.6 s the tick card is up, and 8 px of ramp does not dissolve a 16 px
 * corner. `inherit` resolves to 0 on the steady branch, which has no radius and
 * must not acquire one.
 */
export const OBJECTIVE_SCRIM_FEATHER_PX = {
  /** The interior mirror's lane. The published judgement, taken not re-decided. */
  top: PEEK_SCRIM_FEATHER_PX.top,
  /** `px-2` on the steady branch, `px-3` on the flash card. */
  right: 8,
  /** `pb-1.5`, and `py-1.5` on the flash card. */
  bottom: 6,
  /** The road-facing side. Same 8 px, because it is bought out of the sentence. */
  left: 8,
} as const;

function ObjectiveScrim({ name }: { name: string }) {
  return (
    <div
      data-hud={name}
      data-hud-ink=""
      aria-hidden
      style={{
        position: "absolute",
        // NOT the bled `-${feather}px` per side SimOverlay uses: the column
        // clips, so the bleed would paint nothing and cost the ramps. See the
        // measurement above.
        inset: 0,
        borderRadius: "inherit",
        zIndex: -1,
        pointerEvents: "none",
        backgroundImage: peekScrimBackgroundCss({
          left: OBJECTIVE_SCRIM_FEATHER_PX.left,
          right: OBJECTIVE_SCRIM_FEATHER_PX.right,
        }),
        // Both spellings — WebKit is the engine the mobile half of this
        // catalogue is photographed on, and an unprefixed-only mask there is
        // no mask at all.
        WebkitMaskImage: peekScrimMaskCss({
          top: OBJECTIVE_SCRIM_FEATHER_PX.top,
          bottom: OBJECTIVE_SCRIM_FEATHER_PX.bottom,
        }),
        maskImage: peekScrimMaskCss({
          top: OBJECTIVE_SCRIM_FEATHER_PX.top,
          bottom: OBJECTIVE_SCRIM_FEATHER_PX.bottom,
        }),
      }}
    />
  );
}

export interface ObjectiveFlash {
  titleBg: string;
  /** Increment per completion so consecutive flashes re-trigger. */
  key: number;
}

export function ObjectiveBanner({
  titleBg,
  index,
  total,
  progress,
  flash,
}: {
  /** Active objective title; null when all objectives are done / free drive. */
  titleBg: string | null;
  /** 1-based index of the active objective. */
  index: number;
  total: number;
  /** 0..1 progress of the active objective; null hides the bar. */
  progress: number | null;
  flash: ObjectiveFlash | null;
}) {
  const [dismissedFlash, setDismissedFlash] = useState<ObjectiveFlash | null>(null);
  const showingFlash = flash !== null && flash !== dismissedFlash;

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setDismissedFlash(flash), 1600);
    return () => window.clearTimeout(id);
  }, [flash]);

  if (showingFlash && flash) {
    return (
      <div
        role="status"
        // Same handle on both branches — a surface that changes name halfway
        // through its own lifecycle is a surface a rule cannot address and a
        // census cannot count. See the 2026-08-17 block above.
        data-hud="objective-banner"
        className="hud-ghost hud-pop pointer-events-none relative isolate flex w-full min-w-0 items-center gap-2 rounded-2xl border px-3 py-1.5 select-none"
        style={{
          borderColor: "color-mix(in srgb, var(--success) 60%, transparent)",
        }}
      >
        {/* The flash branch gets the SAME ground, and it is the branch with the
            least contrast to spare: `--success` green at `text-[11px]` for
            1.6 s, which is also exactly when a sweep tends to photograph. The
            border stays — the shade sits behind it at `z-index: -1` — and this
            card's `px-3 py-1.5` already clears the 8/6 feather, so nothing here
            has to move. The one thing the steady branch does not need is the
            `borderRadius: "inherit"` on the shade: 8 px of ramp does not
            dissolve a `rounded-2xl` corner, so a square shade would paint its
            shoulders outside this border for the whole 1.6 s. */}
        <ObjectiveScrim name="objective-banner-scrim" />
        {/* The tick is a lit lamp, not a chip: `data-hud-ink` holds its fill
            through the UNPANEL sweep, exactly as the reference keeps its one
            filled green „BEST" badge on an otherwise unfilled screen. */}
        <span
          aria-hidden
          data-hud-ink=""
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-black"
          style={{ background: "var(--success)", color: "var(--accent-foreground)" }}
        >
          ✓
        </span>
        {/* The completed objective is the SAME authored sentence as the one
            below, so it takes the same tag for the same reason — the UNPANEL
            exemption is by tag, not by class — and the same unit binding: the
            tick card is 1.6 s long and narrower by `px-3`, i.e. the branch a
            wrap is MORE likely on, not less. */}
        <p
          className="min-w-0 break-words text-[11px] font-bold leading-tight"
          style={{ color: "var(--success)" }}
        >
          {withUnitsUnbroken(flash.titleBg)}
        </p>
      </div>
    );
  }

  if (titleBg === null) return null;

  return (
    <div
      role="status"
      data-hud="objective-banner"
      className="hud-ghost hud-banner-in pointer-events-none relative isolate flex w-full min-w-0 flex-col gap-1 px-2 pt-0.5 pb-1.5 select-none"
    >
      {/* THE GROUND — see the block above `ObjectiveScrim`. This is the branch
          the frames were taken on: the steady banner, up for the whole drive,
          no border, i.e. glyphs standing directly on whatever the windscreen
          happens to show.
          `px-2 pt-0.5 pb-1.5` AND NOT `px-1 py-0.5`, and the four numbers are
          one decision with the four in `OBJECTIVE_SCRIM_FEATHER_PX`: the column
          clips, so this padding IS the shade's overhang and every ramp has to
          fit inside it. 8 px of reading width off each side is what that costs;
          a sentence standing on alpha 0.13 is what it buys off. */}
      <ObjectiveScrim name="objective-banner-scrim" />
      {/* A COUNTER, so it stays in the telemetry face the register pins. */}
      <span className="text-[10px] font-black uppercase tracking-wider text-accent">
        Задача {index}/{total}
      </span>
      {/* THE AUTHORED INSTRUCTION, so it does not. `<p>` is the whole mechanism
          — UNPANEL's `:is(p, h1, h2, h3, blockquote)` rule is what puts it back
          in the reading face, and as a `<span>` this sentence was set in
          JetBrains Mono at 6.8 px a character. */}
      <p className="break-words text-[11px] font-bold leading-tight text-foreground">
        {withUnitsUnbroken(titleBg)}
      </p>
      {progress !== null ? (
        // A progress bar IS its fill — both halves are marked so the sweep
        // leaves them alone. It is two hairline-thin bars of colour on the
        // image, which is how the reference draws its own meters.
        <div
          data-hud-ink=""
          className="h-1 w-full overflow-hidden rounded-full"
          style={{ background: "rgba(226, 234, 247, 0.22)" }}
        >
          <div
            data-hud-ink=""
            className="h-full rounded-full bg-accent"
            style={{
              width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`,
              transition: "width 0.3s ease-out",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
