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
import { peekScrimBackgroundCss } from "@/modules/sim/hud";
import { HudCloseButton } from "./HudCloseButton";

/**
 * The advisor ground's horizontal ramps, px — and they are the card's own
 * `px-3` and not a chosen number. Feather === the padding is what puts the flat
 * core exactly under the text box: every glyph on this card stands on full
 * ground, and both ramps live in margin that carries no ink. See the block at
 * the shade's site for why this shade may not bleed the way `SimOverlay`'s does.
 */
const ADVISOR_GROUND_FEATHER_PX = { left: 12, right: 12 } as const;

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
      // `relative isolate` is what the shade below hangs on, and `isolate` is
      // not decoration: a `z-index: -1` child in a box that is NOT a stacking
      // context paints behind the nearest ancestor that is, which in this tree
      // is the play stage — i.e. the shade would slide under the 3D canvas and
      // this fix would be a diff that changes no pixel.
      className="hud-ghost pointer-events-none relative isolate flex w-full min-w-0 flex-col gap-1 rounded-2xl border border-accent-2/60 px-3 py-1.5 select-none"
    >
      {/* ── THE GROUND UNDER THE INSTRUCTOR'S SENTENCE ─────────────────────
          W11 / sc-pe-night-unlit:bf7188c6: *„the words «Спри пред пътеката за
          появилия се пешеходец» with the lit building windows, the vertical
          railing bars and the standing dark pedestrian figure all reading
          straight through the card body behind them."*

          THE TRANSPARENCY IS NOT A BUG — it is the UNPANEL register, and the
          register is right. `PlayAreaStyles`' sweep strips fill from every
          `.hud-ghost` on the founder's own 2026-08-03 direction, and this card
          is a ghost on purpose: a strip across the road that carries a solid
          plate is furniture on a windscreen. What the register also says, in
          its own header, is that the rule has an edge — „a look is not worth
          costing a student the rule they just broke" — and it ships the exact
          instrument for that edge: `data-hud-ink`, the one attribute the sweep
          exempts. `SimOverlay` closed three criticals of this same shape with
          it («the ИНСТРУКЦИИ card has NO panel background at all … the briefing
          text is painted straight onto the street»).

          THIS CARD IS THE OTHER SIDE OF THAT EDGE, and the lesson that filed it
          says why: sc-pe-night-unlit is a NIGHT drill whose whole subject is
          picking a dark figure out of a dark background. Text that shares its
          pixels with that figure does not merely become hard to read — it puts
          the instructor's sentence on top of the exact silhouette the drill is
          training the eye to find. So the sentence gets a ground and the card
          keeps everything else: the same ink `SimOverlay`'s violation card two
          slots up in this same column uses (rgba(6, 11, 20) at
          `PEEK_SCRIM_ALPHA`, imported rather than restated so a re-skin moves
          both), so the column reads as one instrument and not as two design
          languages.

          IT IS INSET TO THE PADDING BOX, AND THAT IS THE ONE THING THIS SHADE
          DOES DIFFERENTLY FROM THE VIOLATION CARD'S. That card bleeds past
          itself and feathers 26 px into the road because `CARD_CLASS` has no
          padding — „row 1's tone glyph and «−N т.» chip start at y = 0", so a
          ramp inside it would leave a glyph on a partial ground. THIS card has
          `px-3`, i.e. 12 px of clear padding on each side, so the ramps fit
          entirely inside its own margin: the flat core begins exactly where the
          first glyph does (117 px content box on the phone column, 12 + 93 + 12),
          no glyph ever stands on a partial ground, and — the reason it matters
          here — the shade never reaches the CARD'S OWN HAIRLINE. A bleeding
          shade would cover `border-accent-2/60`, because a border is painted in
          the element's own phase and a `z-index: -1` child paints after it: the
          outline that the UNPANEL register leaves behind as „exactly the
          reference's hairline" would have been composited down to rgb(9, 54, 55)
          by the very fix meant to make the card readable.

          `z-index: -1` and not a `::before`: the rows above are ordinary
          in-flow content and in-flow content paints BEFORE positioned
          descendants, so an `auto` sibling would land on the words it exists to
          make readable. `aria-hidden` + `pointer-events-none` because it is a
          shade: it must not be announced, and this card is `pointer-events-none`
          end to end precisely so a tap meant for the road is not eaten by a
          hint. `data-hud-ink` IS LOAD-BEARING — without it the sweep's second
          selector hands this div `background-image: none !important` and the
          frame comes back exactly as filed. ────────────────────────────── */}
      <div
        data-hud-ink=""
        data-advisor-ground=""
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          zIndex: -1,
          pointerEvents: "none",
          // `rounded-2xl` is 1rem on the BORDER box; the padding box this is
          // inset to is one border-width smaller, so its corner is 1rem − 1px.
          borderRadius: "calc(1rem - 1px)",
          backgroundImage: peekScrimBackgroundCss(ADVISOR_GROUND_FEATHER_PX),
        }}
      />
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
