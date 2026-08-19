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
 *
 * ── SWEEP 161: THE ONE AUTHORED SENTENCE STILL SET IN THE TELEMETRY FACE ─────
 *
 * `PlayAreaStyles`' UNPANEL register pins `font-family: var(--font-mono)` on
 * every `.hud-ghost` — this card carries that class — and then hands the
 * READING face back to prose with one rule, whose own header states the
 * grammar and the reason:
 *
 *   „NUMBERS AND LABELS IN THE TELEMETRY FACE, SENTENCES IN THE READING FACE …
 *    JetBrains Mono sets about 24 characters per line in the 216 px toast
 *    content box against about 35 in the body face, i.e. the same explanation
 *    grows from four lines to six on the founder's phone. A look is not worth
 *    costing a student the rule they just broke. The split falls out of the
 *    existing markup with nothing to maintain: every instrument value in this
 *    HUD is a span/div/kbd and EVERY AUTHORED SENTENCE IS A <p>."
 *
 * The prompt was a `<span>`. It is the instructor's sentence — `advisor.ts`
 * authors it, ADR-002 forbids the model free-forming it, and THEO-4 makes it
 * the mid-drive half of „explain every decision" — so it was the one authored
 * sentence in the whole ghost register still being laid out as telemetry, and
 * the contract that says otherwise was a paragraph with nothing enforcing it.
 *
 * SEEN, then measured. `sc-pk-move-off/pc-wrong/04-t012s.png` photographs this
 * card carrying «Стигни края на отсечката» in JetBrains Mono in the right-edge
 * column, two cards above `SimOverlay`'s mistake card whose body — same column,
 * same register, same drive — is in the reading face, because that one is a
 * `<p>`. Measured over the 24 authored texts in `advisor.ts` that can reach
 * this card — the pre-drive imperatives, the literal objective prompts and the
 * five yield cards — using the stylesheet's own 24-vs-35 chars per 216 px,
 * scaled to each column:
 *
 *   roomy, 240 px column → 216 px box   73 mono lines vs 52 sans (+40 %),
 *                                       18 of 24 cost a whole extra line
 *   phone, 141 px column → 117 px box  133 mono lines vs 93 sans (+43 %),
 *                                       23 of 24 do, the worst by five
 *
 * 24 is a FLOOR and not the corpus: `advisorPromptForObjective` also puts each
 * lesson's own objective `titleBg` on this card, and those are authored in the
 * scenario bank rather than here. Every one of them pays the same rate.
 *
 * The column is height-capped and folds what does not fit (`notifyColumn.ts`),
 * so those lines are not free space — they are the difference between the
 * sentence being on screen and being behind a «↓ ОЩЕ N РЕДА» badge the driver
 * cannot open at 50 км/ч. `advisorFace.test.tsx` holds the rule from both ends.
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
      {/* A `<p>`, and that element name is the whole fix — see the header. It is
          the token `PlayAreaStyles`' „sentences in the reading face" rule
          selects on; as a `<span>` this sentence inherited the telemetry face
          and cost 45 % more lines in a column that folds. Every class is
          unchanged, so nothing else about it moves. */}
      <p className="break-words text-[11px] font-bold leading-tight text-foreground">
        {prompt.textBg}
      </p>
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
