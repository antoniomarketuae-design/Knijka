"use client";

/**
 * Advisor prompt card — the visible half of the „Съветник" mode: the pure
 * module (modules/sim/lessons/advisor.ts) decides WHAT to advise, this card
 * only renders it.
 *
 * It is the founder's „green guidance strip" — «Премести лоста на R…» — and it
 * is the third of the four panels he named on 2026-08-03. It now sits under the
 * objective banner in the RIGHT-EDGE NOTIFICATION COLUMN (`notifyColumn.ts`),
 * not in a top-centre stack: a strip across the road that tells you what to do
 * next is still a strip across the road. The shell hides it while a teach/quiz
 * overlay is up so it never competes with a pause card.
 *
 * Column shape: `w-full`, the glyph and the key caps on their own row so a long
 * Bulgarian prompt gets the whole 240 px to wrap in, small text throughout.
 *
 * ── ROW A6, 2026-08-04: IT CAN NOW BE REMOVED WITH THE MOUSE ─────────────────
 *
 * Founder: „those pop ups … need to be able to be removed when clicked with the
 * mouse". This card was `pointer-events-none` end to end — the click went
 * through it to the road, and the only way to be rid of it was the „Съветник:
 * изкл." row in the ⚙ sheet, three taps away and phrased as a permanent
 * setting rather than „not this one, thanks".
 *
 * So: a `HudCloseButton` in the glyph row, and `onDismiss` optional — the card
 * is unchanged wherever the caller has nothing to dismiss to. The CARD stays
 * `pointer-events-none` on purpose; only the control takes the pointer, so
 * clicking the prompt's own text still reaches the scene behind it and the
 * student never loses a click on the road to a hint.
 *
 * WHAT DISMISS MEANS, and why it is not the settings toggle: the shell hides
 * THIS prompt (`LessonPlayShell`'s `advisorDismissed`) and the next DISTINCT
 * one speaks normally. „Съветник: изкл." is still there for „stop advising me
 * altogether" — one control per intention, and neither one impersonating the
 * other.
 */

import { IconBook } from "@/components/icons";
import type { AdvisorPrompt } from "@/modules/sim/lessons";
import { HudCloseButton } from "./HudCloseButton";

export function AdvisorCard({
  prompt,
  onDismiss = null,
}: {
  prompt: AdvisorPrompt;
  /** A6: null → no close control (the card is then exactly as it shipped). */
  onDismiss?: (() => void) | null;
}) {
  return (
    <div
      role="status"
      aria-label="Съветник — следващо действие"
      className="hud-ghost pointer-events-none flex w-full min-w-0 flex-col gap-1 rounded-2xl border border-accent-2/60 px-3 py-1.5 select-none"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-accent-2"
        >
          <IconBook className="h-4 w-4" />
        </span>
        {onDismiss !== null ? (
          <HudCloseButton onClick={onDismiss} labelBg="Скрий съвета" />
        ) : null}
      </span>
      <span className="break-words text-[11px] font-bold leading-tight text-foreground">
        {prompt.textBg}
      </span>
      {prompt.keys.length > 0 ? (
        <span className="flex flex-wrap items-center gap-1">
          {prompt.keys.map((k) => (
            <kbd
              key={k}
              data-hud-ink=""
              className="rounded bg-surface px-1.5 py-0.5 text-center font-mono text-[10px] font-bold text-accent"
            >
              {k}
            </kbd>
          ))}
        </span>
      ) : null}
    </div>
  );
}
