/**
 * =============================================================================
 * THE TWO TEACHING CARDS THAT COULD RUN PAST THE STAGE AND SAY NOTHING
 * — catalogue sweep 161, the teaching-surfaces lane, 2026-08-19.
 * =============================================================================
 *
 * 18 BROKEN findings were routed at this lane's three files. FOURTEEN of them
 * name a component none of the three renders — the `📚 НАУЧИ` / `ОПАСНА
 * ГРЕШКА` cards are `hud/HudToasts.tsx` inside the right-edge column, the
 * `↓ ОЩЕ N РЕДА` card is `hud/SimOverlay.tsx`, the «РАЗБРАХ» tip is the touch
 * controls legend, and one is advisor COPY (`lessons/advisor.ts`). Those are
 * routed on in the lane report, and every one of them was read off its own
 * frame before being routed rather than guessed from the title.
 *
 * WHAT SURVIVED THE ROUTING IS THE DISEASE ITSELF, and it was structurally
 * present in these two cards with nothing guarding it:
 *
 *   · `MistakeConsequenceOverlay` — the THEO-3 card, the one a student meets
 *     with the collision still on the screen — had NO height bound, NO inner
 *     scroller and NO pinned action. Measured off the sweep's own PNGs: the
 *     roomy stage is 1163 × 642 CSS px (the play box in the 1440 × 900 pc
 *     frames spans x 265…1428, y 108…750) and the phone frames are 2556 × 1179
 *     device px at DPR 3, i.e. 852 × 393 CSS. That card is `max-w-3xl`, two
 *     columns at the `sm` breakpoint, a lazy 144 px media block and eight
 *     paragraphs; on 393 px minus the scrim's `p-4` its «Сега опитай правилно
 *     →» — the entire point of mistake mode — was below a fold nothing
 *     announced. (Those frames are the iPhone 16 BASE profile. The founder
 *     drives a PRO: 874 × 402 CSS, nine px taller, which moves nothing here.)
 *   · `TeachMomentOverlay`'s roomy card had the pinned acknowledgement since
 *     July and still overflowed the scrim with the law-cited WHY.
 *
 * WHY A SCROLLBAR IS NOT THE ANSWER ON ITS OWN — the shell lane's sentence,
 * landed the same day for the debrief scrim, and it is true here for the same
 * reason: `OVERLAY_SCRIM_CLASS` has carried `overflow-y-auto` since §I20, so
 * the tail was always REACHABLE and never ANNOUNCED. WebKit paints an overlay
 * bar only during a scroll, and the sweep's own harness runs Chromium with
 * `--hide-scrollbars`, so neither the student nor the instrument could see one.
 *
 * WHAT THIS FILE CAN AND CANNOT HOLD. The vitest environment here is node —
 * `mistakeBadge.test.tsx` and `point-scales-rendered.test.tsx` next door render
 * with `react-dom/server` for that reason — so there is no layout engine and an
 * assertion about a flex box's height would pass whatever the class list said.
 * So each row is a PURE half (arithmetic, asserted in both directions), a
 * SOURCE half (the wiring that feeds it), and a RENDERED half (the tree shape
 * that decides what can be scrolled away from what).
 *
 * EVERY SHAPE ASSERTION CARRIES ITS OWN NEGATIVE CONTROL: the class string the
 * card shipped with BEFORE this change, quoted verbatim, run through the same
 * predicate and required to FAIL it. A shape check that cannot reject the shape
 * it was written to reject is a decoration, and this project has shipped one
 * (a centroid bound that was rotation-invariant, so it could not fail at any
 * angle including 90). The markup walker in §3 is self-checked the same way,
 * against two hand-built fixtures whose answers were read by eye.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { MistakeDemo, TeachMoment } from "@/modules/sim/lessons";
import { MistakeConsequenceOverlay } from "../MistakeConsequenceOverlay";
import {
  foldRemainingPx,
  TEACH_FOLD_SLACK_PX,
  TeachMomentOverlay,
} from "../TeachMomentOverlay";

/** The source with its prose taken out — the sibling files' reason exactly:
 *  this lane's whole register is writing the reason down, and an assertion that
 *  cannot tell code from the paragraph describing it is a ban on doing that. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const TEACH = stripComments(
  readFileSync(resolve(__dirname, "../TeachMomentOverlay.tsx"), "utf8"),
);
const CONSEQUENCE = stripComments(
  readFileSync(resolve(__dirname, "../MistakeConsequenceOverlay.tsx"), "utf8"),
);

/* ─────────────────────────────────────────────────────────────────────────────
   1 · THE CARD KNOWS WHEN IT IS HIDING SOMETHING
   ────────────────────────────────────────────────────────────────────────── */

describe("foldRemainingPx · the sentence that replaces a scrollbar", () => {
  it("THE FRAME, AS ARITHMETIC: the consequence card in the phone's stage", () => {
    // 852 × 393 CSS (the 2556 × 1179 frames at DPR 3), scrim `p-4` top and
    // bottom → 361 px of reading region, against a card whose two text columns
    // and 144 px media block lay out at ~586. 225 px is six lines of the
    // stored what-went-wrong copy plus the whole CTA row.
    expect(foldRemainingPx(0, 361, 586)).toBe(225);
    // MUTATION: `return 0` (the pre-fix silence) gives 0 here and passes every
    // "says nothing" case below — which is why both directions are required.
  });

  it("reaches zero at the end — the affordance is not permanent chrome", () => {
    // A line that is always on is the «↓ ОЩЕ 6 РЕДА» badge this same sweep
    // filed twice, on sc-junction-gap/mobile-wrong/04-t100s and
    // sc-pe-night-unlit/mobile-right/04-t038s, for sitting ON the sentence it
    // was counting. Scrolled the full 225, nothing is left.
    expect(foldRemainingPx(225, 361, 586)).toBe(0);
    // MUTATION: `return left` without the slack clamp reports 0 here too, so
    // the case below is the one that separates them.
  });

  it("says nothing about a card that fits, at any scroll position", () => {
    // The other direction, and the one that matters most: a fold announcement
    // on the teach card that fits is a permanent badge over the road.
    expect(foldRemainingPx(0, 642, 500)).toBe(0);
    expect(foldRemainingPx(0, 642, 642)).toBe(0);
    // MUTATION: dropping the `<=` clamp to `<` leaves this green; dropping the
    // clamp entirely returns -142 > 0 → false, but a `Math.max(0, …)` "fix"
    // would report 0 for a genuinely hidden tail too. Hence the pair.
  });

  it("swallows sub-pixel residue and nothing larger", () => {
    // Fractional line boxes stack: a scroller the student HAS read to the end
    // reports 1–3 px left on both engines. The slack is 4 px, which is well
    // under one 11 px line — the smallest thing that could be a lost sentence.
    expect(foldRemainingPx(0, 100, 100 + TEACH_FOLD_SLACK_PX)).toBe(0);
    expect(foldRemainingPx(0, 100, 100 + TEACH_FOLD_SLACK_PX + 1)).toBe(5);
    // MUTATION: widening the slack to 20 hides a whole 11 px line and this
    // second expectation goes red.
  });

  it("reports nothing before first layout instead of the whole card", () => {
    // clientHeight 0 is „not measured yet", not „everything is hidden".
    // Without this the line flashes on every mount of every teach pause.
    expect(foldRemainingPx(0, 0, 586)).toBe(0);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   2 · THE SHAPE — held against each card's own source, with the shape it
       SHIPPED WITH as the negative control
   ────────────────────────────────────────────────────────────────────────── */

/**
 * The card's outer box is bounded by the stage and can shrink to it.
 *
 * `max-h-full` resolves against the scrim's content box (the scrim is
 * `absolute inset-0`, so its height is definite), and `min-h-0` is what lets
 * the column give way at all — a flex item defaults to `min-height: auto` and
 * REFUSES to shrink, which is how `overflow-y-auto` on an ancestor ends up
 * cutting a card instead of the card scrolling. Both, or the chain breaks at
 * whichever is missing.
 */
const isBoundedColumn = (cls: string) =>
  cls.includes("max-h-full") && cls.includes("min-h-0") && cls.includes("flex-col");

/** THE SELF-CHECK. These two strings are what the cards shipped with until
 *  2026-08-19, copied out of the pre-change source. If the predicate above
 *  cannot reject them it is not measuring anything. */
const SHIPPED_UNBOUNDED = [
  "card my-auto flex w-full max-w-lg flex-col gap-4 p-5 sm:p-6",
  "card my-auto flex w-full max-w-3xl flex-col gap-4 p-5 sm:p-6",
];

/** The `className="…"` of the first `<section` in a source file. */
function sectionClass(src: string, from: number): string {
  const at = src.indexOf("<section", from);
  expect(at, "no <section> after the given offset").toBeGreaterThan(-1);
  const cls = /className="([^"]+)"/.exec(src.slice(at, src.indexOf(">", at) + 1));
  expect(cls, "the <section> carries no literal className").not.toBeNull();
  return cls![1];
}

describe("the bounded card · neither teaching surface can outgrow its stage", () => {
  it("rejects the shape both cards shipped with — the predicate has teeth", () => {
    for (const cls of SHIPPED_UNBOUNDED) expect(isBoundedColumn(cls)).toBe(false);
  });

  it("the consequence card is bounded", () => {
    expect(isBoundedColumn(sectionClass(CONSEQUENCE, 0))).toBe(true);
  });

  it("the teach card's ROOMY branch is bounded — not only the compact sheet", () => {
    // The compact sheet has capped itself with `--sim-vh` since July, and the
    // shell renders it on NO device (`{!compact && teachQueue.length > 0 …}`),
    // so a check that found the first `<section>` in this file would certify
    // the one branch that never reaches a student. Anchored past the compact
    // return instead.
    const roomy = TEACH.indexOf('className={`absolute inset-0 z-30 ${OVERLAY_SCRIM_CLASS}`}');
    expect(roomy, "the roomy scrim").toBeGreaterThan(-1);
    expect(isBoundedColumn(sectionClass(TEACH, roomy))).toBe(true);
  });
});

describe("the reading region is painted, and it is the only thing that moves", () => {
  it("carries the two declarations the product's other HUD scrollers carry", () => {
    // The briefing list, the pre-drive checklist, the controls panel and the
    // debrief scrim all carry this pair. `overflow-y-auto` alone paints nothing
    // at rest in WebKit, which is the engine the founder is on.
    expect(TEACH).toContain("overflow-y-auto");
    expect(TEACH).toContain("[scrollbar-width:thin]");
    expect(TEACH).toContain("[scrollbar-color:var(--border-strong)_transparent]");
    // …and stated ONCE, so the two cards cannot drift apart.
    expect(CONSEQUENCE).toContain("HUD_SCROLLER_CLASS");
    expect(CONSEQUENCE).not.toContain("[scrollbar-width:thin]");
  });

  it("the arithmetic has ONE home in this lane, not a copy per card", () => {
    // `LessonPlayShell` exports the identical `scrollRemainingPx` and cannot be
    // imported from here — it imports both of these cards, so the edge would
    // close a cycle. That forces a second home; it does not force a third.
    expect(CONSEQUENCE).toContain('from "./TeachMomentOverlay"');
    expect(CONSEQUENCE).not.toContain("export function foldRemainingPx");
    expect(TEACH).toContain("export function foldRemainingPx");
  });

  it("the header and the action are `shrink-0`, so the verdict and the way out stay", () => {
    // THEO-4 is the reason and not tidiness: the consequence card's header
    // carries the severity class and the point cost, and a verdict a student
    // can scroll away from its explanation is the bare verdict doc 64
    // forbids. The action row is «Сега опитай правилно →».
    const header = CONSEQUENCE.slice(CONSEQUENCE.indexOf("<div className=\"flex shrink-0 items-center gap-3\">"));
    expect(header.length).toBeGreaterThan(0);
    const cta = CONSEQUENCE.indexOf("Сега опитай правилно");
    expect(cta).toBeGreaterThan(-1);
    const row = CONSEQUENCE.lastIndexOf("<div className=", cta);
    expect(CONSEQUENCE.slice(row, cta)).toContain("shrink-0");
  });

  it("THE FLAG IS DERIVED FROM THE MEASUREMENT, which the lines above cannot see", () => {
    // The shell lane's mutation walked through its first version of this check
    // by leaving the JSX conditional alone and replacing the handler's body
    // with `setHasMore(true)`: the line became permanent chrome — the defect
    // this sweep filed twice on the phone — with every shape assertion green.
    // A conditional is only as honest as what feeds it.
    expect(TEACH).toContain(
      "setHasMore(foldRemainingPx(el.scrollTop, el.clientHeight, el.scrollHeight) > 0);",
    );
    // …and it is genuinely conditional on both cards.
    expect(TEACH).toContain("{fold.hasMore ? (");
    expect(CONSEQUENCE).toContain("{fold.hasMore ? (");
    // …and it can never take a tap meant for the control it floats over.
    const line = TEACH.slice(TEACH.indexOf("export function FoldContinuesLine"));
    expect(line.slice(0, line.indexOf("</p>"))).toContain("pointer-events-none");
    expect(line.slice(0, line.indexOf("</p>"))).toContain("sticky bottom-0");
  });

  it("THE OBSERVER WATCHES THE CONTENT, NOT ONLY THE BOX", () => {
    // A ResizeObserver on a scroller fires for changes to the SCROLLER's size,
    // never to what is inside it — and the consequence card GROWS after it
    // mounts, when the lazy `MistakeMedia` clip replaces its 144 px pulse
    // placeholder. Observing the box alone would report the fold as it was
    // before the replay arrived: stale in the reassuring direction.
    const hook = TEACH.slice(TEACH.indexOf("export function useFoldWatch"));
    const body = hook.slice(0, hook.indexOf("return { scrollRef, measure, hasMore };"));
    expect(body).toContain("ro.observe(el)");
    expect(body).toContain("firstElementChild");
    expect(body).toContain("ro.observe(content)");
    // …and it degrades rather than throwing where there is no ResizeObserver.
    expect(body).toContain('typeof ResizeObserver === "undefined"');
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   3 · THE TREE, RENDERED — what can be scrolled away from what
   ────────────────────────────────────────────────────────────────────────── */

/** HTML elements that never carry a closing tag. */
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/**
 * Is `needle` inside the element whose opening tag contains `marker`?
 *
 * A depth walk, not a regex on the flat string: „the CTA appears after the
 * scroller's class" is true whether the CTA is the scroller's child or its
 * sibling, and the whole question here is WHICH. Returns null when the marker
 * is not present at all, so a renamed class fails loudly instead of quietly
 * reporting „outside".
 */
function isInsideElement(html: string, marker: string, needle: string): boolean | null {
  const markerAt = html.indexOf(marker);
  if (markerAt === -1) return null;
  const needleAt = html.indexOf(needle);
  if (needleAt === -1) return null;
  const tag = /<(\/?)([a-zA-Z][^\s/>]*)([^>]*?)(\/?)>/g;
  let openStart = -1;
  let openDepth = -1;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(html)) !== null) {
    const [full, close, name, , selfClose] = m;
    const void_ = selfClose === "/" || VOID_TAGS.has(name.toLowerCase());
    if (close === "/") {
      depth -= 1;
      // The marker element just closed — everything after it is outside.
      if (openStart !== -1 && depth === openDepth) {
        return needleAt > openStart && needleAt < m.index;
      }
      continue;
    }
    if (void_) continue;
    if (openStart === -1 && m.index <= markerAt && markerAt < m.index + full.length) {
      openStart = m.index + full.length;
      openDepth = depth;
    }
    depth += 1;
  }
  // The marker element never closed — malformed markup, not an answer.
  return null;
}

describe("isInsideElement · the walker, self-checked before it is trusted", () => {
  // Both fixtures were read by eye. If the walker cannot tell them apart it
  // cannot answer the only question §3 asks, and every case below is theatre.
  const INSIDE = '<div class="a"><div class="scroll"><p>x</p><button>CTA</button></div></div>';
  const OUTSIDE = '<div class="a"><div class="scroll"><p>x</p></div><button>CTA</button></div>';
  const NESTED_OUTSIDE =
    '<div class="a"><div class="scroll"><div><p>x</p></div></div><button>CTA</button></div>';

  it("says INSIDE for the nested case and OUTSIDE for the sibling case", () => {
    expect(isInsideElement(INSIDE, 'class="scroll"', "CTA")).toBe(true);
    expect(isInsideElement(OUTSIDE, 'class="scroll"', "CTA")).toBe(false);
  });

  it("is not fooled by a nesting level inside the scroller", () => {
    // A flat „does CTA come after </div>" check reports INSIDE here, which is
    // exactly the shape both cards now have (scroller > content column).
    expect(isInsideElement(NESTED_OUTSIDE, 'class="scroll"', "CTA")).toBe(false);
  });

  it("returns null rather than a reassuring answer when the anchor is gone", () => {
    expect(isInsideElement(OUTSIDE, 'class="renamed"', "CTA")).toBeNull();
    expect(isInsideElement(OUTSIDE, 'class="scroll"', "NOPE")).toBeNull();
  });

  it("is not fooled by void tags, which never close", () => {
    const withVoid = '<div class="scroll"><img src="x"><br><p>y</p></div><button>CTA</button>';
    expect(isInsideElement(withVoid, 'class="scroll"', "CTA")).toBe(false);
    expect(isInsideElement(withVoid, 'class="scroll"', "y")).toBe(true);
  });
});

/** His exact drive, as `point-scales-rendered.test.tsx` states it. */
const SPEEDING_AT_22: TeachMoment = {
  code: "SPEEDING_DANGEROUS",
  scenarioId: null,
  titleBg: "Превишена скорост",
  explanationBg:
    "Превиши разрешената скорост с повече от 10 km/h. Спирачният път расте с квадрата на скоростта.",
  lawRef: "ЗДвП чл. 21, ал. 1",
  severity: "opasna",
  points: 10,
  t: 22,
};

const COLLISION_DEMO: MistakeDemo = {
  id: "m-collide",
  titleBg: "Удар в насрещния автомобил",
  whatWentWrongBg:
    "Зави наляво пред насрещен автомобил, който вече беше твърде близо. В симулатора продължаваме, за да се учиш, но сесията се оценява като прекратена.",
  codeRefs: ["COLLISION"],
  traceRef: { path: "content/traces/x.json", sha: "0" },
} as unknown as MistakeDemo;

describe("the action is a sibling of the reading region, never inside it", () => {
  const SCROLLER = "[scrollbar-width:thin]";

  it("«Сега опитай правилно →» cannot be scrolled away from the collision", () => {
    const html = renderToStaticMarkup(
      <MistakeConsequenceOverlay
        demo={COLLISION_DEMO}
        districtId="pe-child-v1"
        moment={null}
        onRetryCorrect={() => {}}
        onDismiss={() => {}}
      />,
    );
    // Pre-fix this returned null: there was no scroller in the tree at all,
    // and the whole card — CTA included — overflowed the scrim.
    expect(isInsideElement(html, SCROLLER, "Сега опитай правилно")).toBe(false);
    // …and the severity badge stays with it, above the fold.
    expect(isInsideElement(html, SCROLLER, "опасна грешка")).toBe(false);
    // …while the thing that EXPLAINS is what scrolls. THEO-4: the card may
    // degrade to a shorter explanation, never to a verdict.
    expect(isInsideElement(html, SCROLLER, "В симулатора продължаваме")).toBe(true);
  });

  it("«Разбрах — продължи» is likewise outside the teach card's scroller", () => {
    const html = renderToStaticMarkup(
      <TeachMomentOverlay moment={SPEEDING_AT_22} remaining={0} onAcknowledge={() => {}} />,
    );
    expect(isInsideElement(html, SCROLLER, "Разбрах")).toBe(false);
    expect(isInsideElement(html, SCROLLER, "Спирачният път расте")).toBe(true);
  });

  it("nothing is announced on the server pass — the line waits to be measured", () => {
    // `useFoldWatch`'s effect never runs in `renderToStaticMarkup`, so
    // `hasMore` is false and the line is absent. That is the correct first
    // frame: a fold claim before a measurement is the badge that was always on.
    const html = renderToStaticMarkup(
      <TeachMomentOverlay moment={SPEEDING_AT_22} remaining={0} onAcknowledge={() => {}} />,
    );
    expect(html).not.toContain("продължава — превърти");
  });
});
