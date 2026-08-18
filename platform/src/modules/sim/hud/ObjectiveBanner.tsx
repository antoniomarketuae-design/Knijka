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
 */

import { useEffect, useState } from "react";

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
            exemption is by tag, not by class. */}
        <p
          className="min-w-0 break-words text-[11px] font-bold leading-tight"
          style={{ color: "var(--success)" }}
        >
          {flash.titleBg}
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
        {titleBg}
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
