/**
 * =============================================================================
 * THE DEMONSTRATION'S NARRATION WAS STANDING ALONE ON THE ROAD
 * — catalogue sweep 161, the last-majors advisor/trace lane, 2026-08-19.
 * =============================================================================
 *
 * THE FINDING, AND IT IS FILED AGAINST THE WRONG FILE, WHICH IS THE EVIDENCE.
 * `sc-follow-distance/pc-right/04-t180s.png` was bucketed BROKEN with:
 *
 *   „The advisor bubble quotes a speed the car is not doing: it reasons about
 *    26 km/h while the speedometer reads 0 km/h and the car is stationary."
 *    — quote: «На 26 км/ч тези двайсетина метра са близо 3 секунди — има време
 *      за реакция.», suspectFile: AdvisorCard.tsx
 *
 * It is not the advisor. That sentence is `modules/sim/traces/scFollowDistance`
 * annotation #2, and the surface carrying it is THIS component's
 * `[data-hud="deck-caption"]` — the demonstration narrating the SHADOW car,
 * whose speed at that point in the recording really is 26 км/ч. The card was
 * telling the truth about the ghost and was read as a claim about the student,
 * by a judge whose whole job was reading that frame carefully.
 *
 * WHY IT COULD BE READ THAT WAY, AS ARITHMETIC. The caption box is a FIXED
 * `DECK_ROOMY_CAPTION_HEIGHT_PX` = 138 px (sized 2026-08-12 against the tallest
 * of 1 811 authored captions, so the deck's controls never move) and its
 * content was START-aligned. A two-line caption is 18 px of chrome plus two
 * 20 px lines = 58, so it left EIGHTY pixels of transparent box between itself
 * and the deck panel underneath it. Read off that PNG at 1440 × 900: the card
 * spans y 402…447 and the deck panel starts at y 540 — 93 px of nothing, the
 * column's own 6 px gap included. At that distance the caption is not part of
 * the transport; it is a notification floating over the carriageway, and the
 * only thing on the whole stage that names the speaker — the panel's own
 * «ДЕМОНСТРАЦИЯ — СЛЕДВАЙ СЯНКАТА» heading — was on the far side of the gap.
 *
 * WHY THIS IS GRAVER THAN THE „minor" IT WAS FILED AS. Following distance is
 * the one lesson in the catalogue whose entire subject is that the SAME twenty
 * metres is a different amount of time at a different speed. A seventeen-year-
 * old who reads «на 26 км/ч … близо 3 секунди» as a statement about the car
 * they are sitting in has been taught that twenty metres IS three seconds —
 * the exact misconception the lesson exists to remove — and then goes out on a
 * real road with it. That is the north-star test failing in the direction that
 * costs the most.
 *
 * THE FIX AND ITS PRICE. `mt-auto` on the card inside a flex column: the
 * caption now grows UPWARD out of the deck instead of downward off it, which is
 * the direction the portrait phone already chose. It costs no height, no width
 * and not one character of the caption bank, so the box is still exactly 138 px
 * and `tools/mobile/deck-captions.mjs` still reports 0 / 1811.
 *
 * AN AUTO MARGIN, AND THE TWO THINGS IT IS NOT — both of which were written
 * before this one and binned:
 *
 *   · NOT `justify-content: flex-end`. Content that overflows an end-aligned
 *     scroller does so past the START edge and cannot be scrolled back to. This
 *     box's overflow is a safety net, and a safety net that eats the first line
 *     of a sentence is worse than the gap it replaced. An auto margin cannot do
 *     that: auto margins absorb only POSITIVE free space and resolve to 0 when
 *     there is none, so an overflowing caption lays out and scrolls exactly as
 *     it shipped.
 *   · NOT A SPACER SIBLING. `deck-captions.mjs` finds the card with
 *     `box.firstElementChild`, so an empty growing div in front of it would
 *     have handed the gate a 0 px box to measure and every caption in the bank
 *     would have „fitted". That is this project's own signature failure — every
 *     „0 defects" report here was an instrument bug and all of them lied in the
 *     reassuring direction — committed by the FIX rather than by the defect.
 *     §2 now pins the card as the box's first element child so the seam cannot
 *     be taken away again.
 *
 * WHAT IS NOT FIXED HERE, AND IS ROUTED INSTEAD: a VISIBLE speaker label on the
 * card cannot be added inside this box without moving
 * `DECK_ROOMY_CAPTION_HEIGHT_PX` (138 = 18 + six 20 px lines, and the tallest
 * caption in the bank IS six lines), which lives in `modules/sim/hud/
 * notifyColumn.ts` and would need `deck-captions.mjs` re-run against a
 * production WebKit build. Neither is this lane's. The sighted attribution is
 * therefore the adjacency; the announced one is the `sr-only` prefix below.
 *
 * WHAT THIS FILE CAN AND CANNOT HOLD: the vitest environment is node, so there
 * is no layout engine — an assertion that the card „sits on the deck" would
 * pass whatever the markup said. So §1 is arithmetic and §2 is the tree SHAPE
 * that decides which way the box's slack falls, each with the shape this
 * component SHIPPED with as its negative control.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import {
  DECK_ROOMY_CAPTION_HEIGHT_PX,
  DECK_TOUCH_CAPTION_HEIGHT_PX,
} from "@/modules/sim/hud";
import type { ScenarioTrace, TraceClock } from "@/modules/sim/traces";
import { captionDeadAirPx, captionSpeakerBg, TraceTimeline } from "../TraceTimeline";

/* ─────────────────────────────────────────────────────────────────────────────
   1 · THE DEAD AIR, AS A NUMBER
   ────────────────────────────────────────────────────────────────────────── */

describe("captionDeadAirPx · how far the sentence floats from its speaker", () => {
  it("THE FRAME, AS ARITHMETIC: the two-line caption in the 1440 × 900 stage", () => {
    // 18 px of chrome (`px-3.5 py-2` + two 1 px borders) plus two 20 px lines
    // of `text-sm` = 58, in a 138 px box. The PNG reads 93 px between the
    // card's lower edge and the deck panel's upper one, the column's own 6 px
    // gap and a pixel of border rounding included.
    expect(captionDeadAirPx(2)).toBe(80);
    // MUTATION: `return 0` — the shape of „there is no gap, nothing to fix" —
    // passes every „no dead air" row below and fails only here, which is why
    // both directions are required.
  });

  it("reaches zero at the tallest caption the bank contains", () => {
    // 138 was chosen as 18 + SIX whole lines, because the longest annotation in
    // 1 811 (`sc-rb-exit-signal/mistake-barge-entry`, 249 chars) is six lines
    // at 416 px. At six there is nothing spare, which is the constraint that
    // stops a visible label being added inside this box.
    expect(captionDeadAirPx(6)).toBe(0);
    expect(captionDeadAirPx(5)).toBe(20);
  });

  it("clamps instead of going negative when a caption overruns", () => {
    // „How much empty box is there" cannot be −20. Without the clamp a caption
    // that overflows would report NEGATIVE dead air and read as the best case.
    expect(captionDeadAirPx(7)).toBe(0);
    expect(captionDeadAirPx(99)).toBe(0);
    // MUTATION: drop the `Math.max(0, …)` and captionDeadAirPx(7) is −20.
  });

  it("answers for an empty caption too — the box is fixed either way", () => {
    // The box is 138 px whether or not there is an annotation on screen, which
    // is the whole reason the deck's controls do not move. Nothing is being
    // hidden by the spacer; the slack was always there.
    expect(captionDeadAirPx(0)).toBe(DECK_ROOMY_CAPTION_HEIGHT_PX - 18);
  });

  it("is measured against the box it is given, not a baked-in one", () => {
    // The touch box is 46 px and its card is smaller; passing the wrong box is
    // how a probe silently starts measuring a different surface.
    expect(captionDeadAirPx(1, DECK_TOUCH_CAPTION_HEIGHT_PX)).toBe(8);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   2 · THE TREE SHAPE THAT DECIDES WHICH WAY THE SLACK FALLS
   ────────────────────────────────────────────────────────────────────────── */

const CAPTION_BG = "На 26 км/ч тези двайсетина метра са близо 3 секунди — има време за реакция.";

/** A trace whose annotation is live at t = 0, so the caption renders. */
function traceWithCaption(): ScenarioTrace {
  return {
    meta: { scenarioId: "sc-follow-distance", kind: "shadow", version: 1, durationSec: 49 },
    samples: [
      {
        tSec: 0,
        x: 0,
        y: 0,
        headingDeg: 0,
        steerRad: 0,
        speedKmh: 26,
        gear: 1,
        indicator: "off",
        brakeOn: false,
        throttleOn: true,
      },
    ],
    events: [{ tSec: 0, kind: "annotation", textBg: CAPTION_BG }],
  };
}

function render(opts: { touch: boolean }): string {
  const clockRef = createRef<TraceClock>() as React.RefObject<TraceClock>;
  return renderToStaticMarkup(
    <TraceTimeline
      trace={traceWithCaption()}
      clockRef={clockRef}
      compact
      touch={opts.touch}
    />,
  );
}

/**
 * The caption box's inner HTML — everything between `data-hud="deck-caption"`
 * and the end of that element. Self-checked below against two fixtures whose
 * answers are obvious by eye, because „find the box by the div whose overflow
 * is auto" is exactly how a probe starts measuring the wrong node (this
 * component says so at the `data-hud` it was given for that reason).
 */
function captionBox(html: string): { openTag: string; inner: string } | null {
  const at = html.indexOf('data-hud="deck-caption"');
  if (at < 0) return null;
  const open = html.lastIndexOf("<", at);
  const tagEnd = html.indexOf(">", at);
  if (open < 0 || tagEnd < 0) return null;
  // Walk to the matching close, counting nested divs.
  let depth = 1;
  let i = tagEnd + 1;
  const start = i;
  while (i < html.length && depth > 0) {
    const nextOpen = html.indexOf("<div", i);
    const nextClose = html.indexOf("</div>", i);
    if (nextClose < 0) return null;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + 4;
    } else {
      depth -= 1;
      i = nextClose + 6;
    }
  }
  return { openTag: html.slice(open, tagEnd + 1), inner: html.slice(start, i - 6) };
}

describe("captionBox is checked before it is believed", () => {
  it("returns the box's own tag and its subtree, and null when absent", () => {
    const fixture = '<div><div data-hud="deck-caption" class="k"><div>a</div>b</div><div>c</div></div>';
    expect(captionBox(fixture)?.openTag).toBe('<div data-hud="deck-caption" class="k">');
    expect(captionBox(fixture)?.inner).toBe("<div>a</div>b");
    expect(captionBox("<div>nothing here</div>")).toBeNull();
  });
});

describe("ROOMY · the caption sits on the transport instead of over the road", () => {
  const box = captionBox(render({ touch: false }));

  it("the box lays its content out as a column, so the slack can be taken", () => {
    expect(box).not.toBeNull();
    expect(box?.openTag).toContain("flex flex-col");
    // …and it is still the fixed 138 px box the caption lint measures. If this
    // stops being true the deck's controls start moving again and 0 / 1811
    // stops meaning anything.
    expect(box?.openTag).toContain(`height:${DECK_ROOMY_CAPTION_HEIGHT_PX / 16}rem`);
    expect(box?.openTag).toContain(`max-height:${DECK_ROOMY_CAPTION_HEIGHT_PX / 16}rem`);
  });

  it("the card carries the auto margin that takes the slack — on the TOP", () => {
    // Direction is the whole fix: `mb-auto` would pin the caption to the TOP of
    // the box, which is where it was.
    expect(box?.inner).toContain("mt-auto");
    expect(box?.inner).not.toContain("mb-auto");
  });

  it("THE GATE'S SEAM: the card is still the box's FIRST ELEMENT CHILD", () => {
    // `tools/mobile/deck-captions.mjs` — the run that reports 0 / 1811 — reads
    // `box.firstElementChild` and measures its height. The first shape written
    // for this fix put an empty growing div in front of the card, which would
    // have handed the gate 0 px and turned the whole bank green while changing
    // nothing about whether a caption fits. Nothing may stand in front of the
    // card in this box.
    const inner = (box?.inner ?? "").trimStart();
    expect(inner.startsWith("<div")).toBe(true);
    expect(inner.slice(0, inner.indexOf(">") + 1)).toContain("mx-auto mt-auto max-w-md");
    // …and it is the node that actually carries the sentence, not a wrapper.
    expect(inner).toContain(CAPTION_BG);
  });

  it("NEGATIVE CONTROL: the shape this component shipped with fails both rows", () => {
    // Verbatim, the box as it was before this change: no flex, no auto margin.
    const shipped =
      '<div data-hud="deck-caption" class="w-full min-h-0 overflow-y-auto overscroll-contain" ' +
      'style="height:8.625rem;max-height:8.625rem">' +
      '<div class="mx-auto max-w-md rounded-xl">' +
      CAPTION_BG +
      "</div></div>";
    const old = captionBox(shipped);
    expect(old?.openTag).not.toContain("flex flex-col");
    expect(old?.inner).not.toContain("mt-auto");
    // …and the arithmetic says what that shape costs at the length in the frame.
    expect(captionDeadAirPx(2)).toBeGreaterThan(0);
  });

  it("NEGATIVE CONTROL: a spacer in front of the card fails the seam row", () => {
    // The binned shape, so the row above cannot rot into a decoration.
    const withSpacer =
      '<div data-hud="deck-caption" class="w-full min-h-0 overflow-y-auto overscroll-contain flex flex-col">' +
      '<div aria-hidden class="grow"></div>' +
      '<div class="mx-auto max-w-md rounded-xl">' +
      CAPTION_BG +
      "</div></div>";
    const inner = (captionBox(withSpacer)?.inner ?? "").trimStart();
    expect(inner.slice(0, inner.indexOf(">") + 1)).not.toContain("mx-auto mt-auto max-w-md");
  });
});

describe("TOUCH · the landscape caption is NOT bottom-aligned, on purpose", () => {
  const box = captionBox(render({ touch: true }));

  it("keeps the shipped shape, because PlayAreaStyles puts it BELOW the deck", () => {
    // On a landscape phone the caption is `position: absolute; top: calc(100% +
    // 0.5rem)` — under the transport, right of the steering arc. Bottom-
    // aligning there would push the sentence AWAY from its speaker, which is
    // the defect this file exists to close, pointing the other way. A false
    // refusal is as bad as a false certificate; so is a fix applied where the
    // geometry is already right.
    expect(box).not.toBeNull();
    expect(box?.openTag).not.toContain("flex flex-col");
    expect(box?.inner).not.toContain("mt-auto");
  });

  it("…and it still reads its two custom properties rather than a baked number", () => {
    expect(box?.openTag).toContain("--deck-caption-h");
    expect(box?.openTag).toContain("--deck-caption-max-h");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   3 · WHO IS SPEAKING — announced in both grammars, in the deck's own words
   ────────────────────────────────────────────────────────────────────────── */

describe("the caption names its speaker", () => {
  it("announces the demonstration before the sentence, in BOTH grammars", () => {
    for (const touch of [false, true]) {
      const inner = captionBox(render({ touch }))?.inner ?? "";
      const speaker = inner.indexOf("Демонстрация — следвай сянката");
      const text = inner.indexOf(CAPTION_BG);
      expect(speaker, `touch=${touch}`).toBeGreaterThanOrEqual(0);
      expect(speaker, `touch=${touch}`).toBeLessThan(text);
      expect(inner).toContain("sr-only");
    }
  });

  it("uses the deck's OWN heading, so the two can never say different things", () => {
    const meta = traceWithCaption().meta;
    expect(captionSpeakerBg({ meta })).toBe("Демонстрация — следвай сянката");
    // A mistake demo is a different speaker and must say so — a student
    // watching «❌ Грешен подход» must never hear it as instruction.
    expect(captionSpeakerBg({ meta: { ...meta, kind: "mistake" } })).toContain("Грешен подход");
    // …and an explicit deck title still wins, exactly as the heading does.
    expect(captionSpeakerBg({ meta }, "Твоят опит")).toBe("Твоят опит");
    // MUTATION: hard-coding the string here instead of reading KIND_TITLE_BG
    // passes the first row and fails the second — which is the point: two
    // wordings for one trace is how the heading and the announcement drift.
  });

  it("costs no layout: the attribution is sr-only, never a line of the box", () => {
    // The constraint is not stylistic. 138 px is 18 + six lines and the tallest
    // caption in the bank IS six lines, so a visible label row inside this box
    // would clamp it — see the header for what would have to move and where.
    expect(captionDeadAirPx(6)).toBe(0);
    const inner = captionBox(render({ touch: false }))?.inner ?? "";
    expect(inner).toContain('class="sr-only"');
  });
});
