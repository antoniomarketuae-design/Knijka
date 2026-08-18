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
        className="hud-ghost hud-pop pointer-events-none flex w-full min-w-0 items-center gap-2 rounded-2xl border px-3 py-1.5 select-none"
        style={{
          borderColor: "color-mix(in srgb, var(--success) 60%, transparent)",
        }}
      >
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
      className="hud-ghost hud-banner-in pointer-events-none flex w-full min-w-0 flex-col gap-1 px-1 py-0.5 select-none"
    >
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
