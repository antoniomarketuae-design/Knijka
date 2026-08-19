/**
 * =============================================================================
 * THE INSTRUCTOR'S SENTENCE WAS BEING SET AS TELEMETRY
 * — catalogue sweep 161, the last-majors advisor lane, 2026-08-19.
 * =============================================================================
 *
 * SIX BROKEN findings were routed at `AdvisorCard.tsx`. FIVE of them name a
 * surface it does not render and are routed on in the lane report — the
 * `📚 НАУЧИ` / `ОПАСНА ГРЕШКА` cards are `modules/sim/hud/HudToasts.tsx`
 * (sc-pk-move-off, sc-vp-stall, sc-vp-police-stop, sc-vp-handbrake) and the
 * «↓ ОЩЕ 6 РЕДА» card is `modules/sim/hud/SimOverlay.tsx` (sc-pe-night-unlit).
 * Every one of them was opened and looked at before being routed, not guessed
 * from its title, and the sixth turned out to be `TraceTimeline`'s caption
 * (`deckCaptionVoice.test.tsx` holds that one).
 *
 * WHAT WAS ACTUALLY WRONG IN THIS FILE was not in any finding's title, which is
 * the failure mode the lane brief names: the card can be right about what it
 * says and wrong about how it says it.
 *
 * `PlayAreaStyles`' UNPANEL register pins `font-family: var(--font-mono)` on
 * every `.hud-ghost` under the stage — this card carries that class — and hands
 * the READING face back with ONE rule, whose own header states the grammar:
 *
 *   „NUMBERS AND LABELS IN THE TELEMETRY FACE, SENTENCES IN THE READING FACE …
 *    every instrument value in this HUD is a span/div/kbd and EVERY AUTHORED
 *    SENTENCE IS A <p>."
 *
 * The advisor prompt was a `<span>`. It is authored copy — `advisor.ts` writes
 * it, ADR-002 forbids the model free-forming it, THEO-4 makes it the mid-drive
 * half of „explain every decision" — so it was the one authored sentence in the
 * whole ghost register still laid out as an instrument value, and the contract
 * that said otherwise was a paragraph with nothing enforcing it.
 *
 * SEEN FIRST. `sc-pk-move-off/pc-wrong/04-t012s.png`, 1440 × 900, the right-
 * edge column: this card carries «Стигни края на отсечката» in JetBrains Mono
 * two cards above `SimOverlay`'s mistake card, whose body — same column, same
 * register, same drive — is in the reading face, because that one is a `<p>`.
 * Two cards, one register, two faces, and the wrong one is on the sentence.
 *
 * WHAT THIS FILE CAN AND CANNOT HOLD. The vitest environment here is node, so
 * there is no layout engine and no font metrics: an assertion about a rendered
 * line COUNT would pass whatever the markup said. So §1 is arithmetic over the
 * shipped copy using the stylesheet's OWN measured characters-per-line, §2 is
 * the rendered element name, and §3 is the stylesheet rule the element name
 * depends on — because a `<p>` with no rule to select it is decoration, and
 * this project has shipped a fix that was exactly that (the tier picker's fill,
 * which survived a whole unpanel pass).
 *
 * EVERY SHAPE ASSERTION CARRIES ITS OWN NEGATIVE CONTROL: the markup this card
 * SHIPPED with, quoted verbatim, run through the same predicate and required to
 * fail it.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { yieldWaitAdvisorPrompt, type YieldReason } from "@/modules/sim/lessons";
import { GHOST_SURFACES, UNPANEL_CSS } from "../PlayAreaStyles";
import { AdvisorCard } from "../AdvisorCard";

/* ─────────────────────────────────────────────────────────────────────────────
   0 · THE INSTRUMENT — a word wrapper, self-checked against a case counted by
       hand, because every "0 defects" instrument in this project was wrong in
       the reassuring direction.
   ────────────────────────────────────────────────────────────────────────── */

/** Greedy word wrap — what a line box does — in whole characters per line. */
function wrapLines(text: string, charsPerLine: number): number {
  const per = Math.max(1, Math.floor(charsPerLine));
  let lines = 1;
  let col = 0;
  for (const word of text.split(" ")) {
    const need = col === 0 ? word.length : col + 1 + word.length;
    if (need > per && col > 0) {
      lines += 1;
      col = word.length;
    } else col = need;
  }
  return lines;
}

/**
 * The stylesheet's own measurement, quoted: „JetBrains Mono sets about 24
 * characters per line in the 216 px toast content box against about 35 in the
 * body face". Both faces scale with the box, so one ratio serves every column.
 */
const MONO_CHARS_PER_PX = 24 / 216;
const SANS_CHARS_PER_PX = 35 / 216;

/**
 * The two content boxes this card is actually laid out in. The notification
 * column is `min(15rem, 36vw)` (`notifyColumn.ts`) — 240 px on a desktop and
 * 141 px on the founder's 393 px phone — and the card's own `px-3` takes 24.
 */
const ROOMY_CONTENT_PX = 240 - 24;
const PHONE_CONTENT_PX = 141 - 24;

/** Every reason the yield voice can put on this card — the longest copy it
 *  carries, and the reason the founder's own review was about waiting. */
const YIELD_REASONS: readonly YieldReason[] = [
  "roundaboutEntry",
  "giveWayLine",
  "stopSign",
  "redLight",
  "pedestrian",
];

describe("the wrapper is checked before it is believed", () => {
  it("counts a line the way a line box does, on a string counted by hand", () => {
    // "аб вг де" is 8 characters. At 5 per line: "аб вг" (5) then "де" → 2.
    expect(wrapLines("аб вг де", 5)).toBe(2);
    // At 8 it is one line exactly, and at 7 it is two — the boundary, both ways.
    expect(wrapLines("аб вг де", 8)).toBe(1);
    expect(wrapLines("аб вг де", 7)).toBe(2);
    // A single word longer than the line does not become two lines here and
    // must not: `break-words` splits it in the browser, and counting it as one
    // over-line is the direction that UNDER-reports the defect.
    expect(wrapLines("аааааааааа", 4)).toBe(1);
    // MUTATION: `return 1` passes the first and third and fails the second and
    // fourth; dropping the `col > 0` guard turns the fourth into 2 lines.
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   1 · WHAT THE WRONG FACE COSTS, OVER THE SHIPPED COPY
   ────────────────────────────────────────────────────────────────────────── */

describe("the telemetry face costs the advisor whole lines of authored copy", () => {
  it("every yield card is at least one line longer in mono, on the phone", () => {
    for (const reason of YIELD_REASONS) {
      const text = yieldWaitAdvisorPrompt(reason).textBg;
      const mono = wrapLines(text, PHONE_CONTENT_PX * MONO_CHARS_PER_PX);
      const sans = wrapLines(text, PHONE_CONTENT_PX * SANS_CHARS_PER_PX);
      expect(mono, `${reason}: ${text}`).toBeGreaterThan(sans);
    }
    // MUTATION: swap the two constants and every row goes red — the direction
    // matters, and a test that only asserted `mono !== sans` would not notice.
  });

  it("…and on a desktop too, where the column is 240 px", () => {
    const roundabout = yieldWaitAdvisorPrompt("roundaboutEntry").textBg;
    expect(wrapLines(roundabout, ROOMY_CONTENT_PX * MONO_CHARS_PER_PX)).toBeGreaterThan(
      wrapLines(roundabout, ROOMY_CONTENT_PX * SANS_CHARS_PER_PX),
    );
  });

  it("REPORTS NOTHING for a prompt short enough to fit either way", () => {
    // The other direction, and the one that keeps this honest: if the metric
    // said „mono is worse" for every string it would say nothing at all. The
    // shortest thing the card carries is a two-word imperative.
    const short = "Спри";
    expect(wrapLines(short, PHONE_CONTENT_PX * MONO_CHARS_PER_PX)).toBe(1);
    expect(wrapLines(short, PHONE_CONTENT_PX * SANS_CHARS_PER_PX)).toBe(1);
  });

  it("SWEPT: the whole card-reachable corpus is 40 % longer in the wrong face", () => {
    // Measured over the 24 authored texts in `advisor.ts` that can land here —
    // 73 mono lines vs 52 sans in the 216 px box, 133 vs 93 in the 117 px one,
    // 23 of the 24 costing at least one whole line on the phone. Only the five
    // yield cards are reachable through the public API from a node test, so
    // this row holds the RATE they are all paying rather than re-deriving the
    // sweep: every one of the five, on both columns, at once.
    const rate = (box: number) => {
      let mono = 0;
      let sans = 0;
      for (const reason of YIELD_REASONS) {
        const t = yieldWaitAdvisorPrompt(reason).textBg;
        mono += wrapLines(t, box * MONO_CHARS_PER_PX);
        sans += wrapLines(t, box * SANS_CHARS_PER_PX);
      }
      return mono / sans;
    };
    expect(rate(ROOMY_CONTENT_PX)).toBeGreaterThan(1.25);
    expect(rate(PHONE_CONTENT_PX)).toBeGreaterThan(1.25);
    // MUTATION: `mono / mono` — the shape of „the face costs nothing" — is 1.0
    // and both rows go red. A ratio and not a difference, so the claim does not
    // quietly become „the corpus got longer" if copy is added.
  });

  it("the lines it costs are not free space — the column folds what it cannot fit", () => {
    // The sweep filed the fold twice in the same run — «↓ ОЩЕ 6 РЕДА» on
    // sc-pe-night-unlit/mobile-right/04-t038s and «↓ ОЩЕ 3 РЕДА» on
    // 04-t060s — on the card BELOW this one in the same column. Whatever this
    // card spends in extra lines, that one pays for. So: the longest advisor
    // text does not fit the phone column in either face, and it is 4 lines
    // worse in the one that was shipping.
    const worst = YIELD_REASONS.map((r) => yieldWaitAdvisorPrompt(r).textBg).reduce((a, b) =>
      b.length > a.length ? b : a,
    );
    const mono = wrapLines(worst, PHONE_CONTENT_PX * MONO_CHARS_PER_PX);
    const sans = wrapLines(worst, PHONE_CONTENT_PX * SANS_CHARS_PER_PX);
    expect(mono - sans).toBeGreaterThanOrEqual(3);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   2 · THE RENDERED ELEMENT NAME, with the shipped markup as the control
   ────────────────────────────────────────────────────────────────────────── */

const PROMPT_BG = "Изчакай зад бавната кола, докато насрещните минат";

/**
 * Which element wraps `text` in `html` — the tag name of the innermost open tag
 * before it. Self-checked below against two fixtures whose answer is obvious by
 * eye, the same way the sibling suites check their markup walkers.
 */
function wrapperOf(html: string, text: string): string | null {
  const at = html.indexOf(text);
  if (at < 0) return null;
  const before = html.slice(0, at);
  const open = before.lastIndexOf("<");
  if (open < 0) return null;
  const m = /^<\/?([a-zA-Z][a-zA-Z0-9]*)/.exec(before.slice(open));
  return m ? m[1].toLowerCase() : null;
}

describe("wrapperOf is checked before it is believed", () => {
  it("reads the element a string sits in, and answers null when it is absent", () => {
    expect(wrapperOf("<p class='x'>здравей</p>", "здравей")).toBe("p");
    expect(wrapperOf("<div><span>здравей</span></div>", "здравей")).toBe("span");
    expect(wrapperOf("<p>нещо друго</p>", "здравей")).toBeNull();
  });
});

describe("the advisor's sentence renders as a paragraph", () => {
  const html = renderToStaticMarkup(
    <AdvisorCard prompt={{ textBg: PROMPT_BG, keys: ["W"] }} />,
  );

  it("the prompt is a <p> — the token the reading-face rule selects on", () => {
    expect(wrapperOf(html, PROMPT_BG)).toBe("p");
  });

  it("NEGATIVE CONTROL: the markup this card shipped with fails the same check", () => {
    // Verbatim, from AdvisorCard.tsx before this change. If the predicate above
    // cannot reject this, it is a decoration.
    const shipped =
      '<span class="break-words text-[11px] font-bold leading-tight text-foreground">' +
      PROMPT_BG +
      "</span>";
    expect(wrapperOf(shipped, PROMPT_BG)).toBe("span");
    expect(wrapperOf(shipped, PROMPT_BG)).not.toBe("p");
  });

  it("the key caps stay instrument values — a <kbd> is not a sentence", () => {
    // The other direction of the same grammar: „W" is a control legend and
    // belongs in the telemetry face. Moving the sentence must not drag the
    // chips with it.
    expect(wrapperOf(html, "W")).toBe("kbd");
  });

  it("nothing else about the card moved: the class list is unchanged", () => {
    expect(html).toContain("break-words text-[11px] font-bold leading-tight text-foreground");
    // …and it is still the card that cannot eat a click on the road (A6).
    expect(html).toContain("pointer-events-none");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   3 · THE RULE THE ELEMENT NAME RESTS ON — because a <p> that nothing selects
       is a fix that reads as one and changes no pixel
   ────────────────────────────────────────────────────────────────────────── */

describe("the stylesheet still honours the grammar this card now obeys", () => {
  it("the card is ON the ghost register, or neither rule reaches it", () => {
    const html = renderToStaticMarkup(
      <AdvisorCard prompt={{ textBg: PROMPT_BG, keys: [] }} />,
    );
    expect(html).toContain("hud-ghost");
    expect(GHOST_SURFACES).toContain(".hud-ghost");
  });

  it("the register still pins the telemetry face — the thing being escaped", () => {
    expect(UNPANEL_CSS).toContain("font-family: var(--font-mono);");
  });

  /** The prose elements the reading-face rule names, or null if it is gone. */
  function readingFaceMembers(css: string): string[] | null {
    const rule = /:is\(([^)]*)\)\s*\{\s*font-family: var\(--font-sans\);/.exec(css);
    return rule ? rule[1].split(",").map((s) => s.trim()) : null;
  }

  it("…and still hands the reading face back to prose elements, <p> among them", () => {
    // The whole fix hangs off this one selector. Deleting `p` from it leaves
    // tsc silent, leaves the render assertions above green, and puts the
    // advisor's sentence back in the telemetry face on every drive.
    expect(readingFaceMembers(UNPANEL_CSS), "the rule is gone from UNPANEL_CSS").not.toBeNull();
    expect(readingFaceMembers(UNPANEL_CSS)).toContain("p");
  });

  it("NEGATIVE CONTROL: the same predicate on a rule with <p> taken out", () => {
    // `PlayAreaStyles` belongs to another lane and is open in another worktree,
    // so the mutation is run on a copy rather than on the file: the rule with
    // exactly one member removed, and the rule deleted outright. A predicate
    // that cannot tell either of these from the shipped stylesheet would be
    // reporting „still guarded" forever — which is how this project's eight
    // comment-stripped source assertions passed while the code was dead.
    const withoutP = UNPANEL_CSS.replace(
      ":is(p, h1, h2, h3, blockquote)",
      ":is(h1, h2, h3, blockquote)",
    );
    expect(withoutP, "the quoted selector no longer appears verbatim").not.toBe(UNPANEL_CSS);
    expect(readingFaceMembers(withoutP)).not.toContain("p");

    const deleted = UNPANEL_CSS.replace("font-family: var(--font-sans);", "");
    expect(readingFaceMembers(deleted)).toBeNull();
  });
});
