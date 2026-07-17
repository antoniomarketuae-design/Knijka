"use client";

/**
 * Advisor prompt card — the visible half of the „Съветник" mode: the pure
 * module (modules/sim/lessons/advisor.ts) decides WHAT to advise, this card
 * only renders it. Sits under the objective banner (top-center stack in
 * LessonPlayShell); the shell hides it while a teach/quiz overlay is up so
 * it never competes with a pause card.
 *
 * Visual language: the teach accent (accent-2 + IconBook) from
 * TeachMomentOverlay over the followHint chip's readable base
 * (bg-background/85 + blur — this floats on the 3D canvas, not on a card),
 * with ControlsHelp's kbd chip styling for the key caps.
 */

import { IconBook } from "@/components/icons";
import type { AdvisorPrompt } from "@/modules/sim/lessons";

export function AdvisorCard({ prompt }: { prompt: AdvisorPrompt }) {
  return (
    <div
      role="status"
      aria-label="Съветник — следващо действие"
      className="pointer-events-none flex max-w-xl items-center gap-2.5 rounded-2xl border border-accent-2/60 bg-background/85 px-4 py-2 backdrop-blur-md select-none"
    >
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent-2/15 text-accent-2"
      >
        <IconBook className="h-4 w-4" />
      </span>
      <span className="text-sm font-bold leading-snug text-foreground">{prompt.textBg}</span>
      {prompt.keys.length > 0 ? (
        <span className="flex shrink-0 items-center gap-1">
          {prompt.keys.map((k) => (
            <kbd
              key={k}
              className="rounded bg-surface px-1.5 py-0.5 text-center font-mono text-[11px] font-bold text-accent"
            >
              {k}
            </kbd>
          ))}
        </span>
      ) : null}
    </div>
  );
}
