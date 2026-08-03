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
 */

import { IconBook } from "@/components/icons";
import type { AdvisorPrompt } from "@/modules/sim/lessons";

export function AdvisorCard({ prompt }: { prompt: AdvisorPrompt }) {
  return (
    <div
      role="status"
      aria-label="Съветник — следващо действие"
      className="hud-ghost pointer-events-none flex w-full min-w-0 flex-col gap-1 rounded-2xl border border-accent-2/60 px-3 py-1.5 select-none"
    >
      <span
        aria-hidden
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-accent-2"
      >
        <IconBook className="h-4 w-4" />
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
