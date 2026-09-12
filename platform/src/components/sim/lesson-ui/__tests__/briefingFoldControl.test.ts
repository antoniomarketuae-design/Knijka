/**
 * =============================================================================
 * THE BRIEFING'S FOLD HAD A COUNTER AND NO CONTROL — w11, 2026-08-27.
 * =============================================================================
 *
 * TWO ROWS, ONE MECHANISM, both re-judged STILL on the w11 re-drive:
 *
 *   sc-ov-crest-curve:79eb1226      „The PC ИНСТРУКЦИИ panel cuts off after
 *     item 4 with no scrollbar — items 5 and 6, which carry the whole decision
 *     rule (wait for the straight, overtake only with a clear stretch), are
 *     simply not shown."
 *   sc-sp-wet-limit-plate:f687c293  „…the last steps of the briefing are never
 *     drawn." The verifier cropped the list's right edge at ×5 and found „no
 *     scrollbar of any kind", then quoted `LessonPlayShell`'s own admission
 *     back at it: `scrollbar-width: thin` paints an OVERLAY bar that exists
 *     only DURING a scroll, „which is the engine the founder is actually on".
 *
 * So the scroll existed and could not be ASKED FOR — word for word the
 * diagnosis the sibling toast column got on 2026-08-26, whose repair
 * (`revealMoreToasts` + `toastPageScrollTop`) this one takes rather than
 * re-derives. „A sentence that names a gesture is not an affordance; a thing
 * you press is."
 *
 * AND A THIRD ROW, WHICH IS THE SAME CARD SEEN FROM THE ROAD:
 *
 *   sc-ov-crossing-overtake:4bce6fca  „The ИНСТРУКЦИИ panel covers the right
 *     third of the windscreen." Measured by the verifier at ~320 px of a
 *     ~1165 px stage, on DRIVING beats — `sc-ov-crossing-overtake/pc-right/
 *     04-t112s.png`, 11 км/ч on the approach to a pedestrian crossing, with the
 *     right kerb and the parked cars along it under the card. The same frame
 *     shows the «⌨ Клавиши» legend already folded to its pill, because
 *     `controlsLegendLifetime.ts` — this lane — stands it down at the same
 *     floor. The briefing was the one first-run reading surface in the corridor
 *     with no lifetime and exactly one exit, a ✕ that destroys it.
 *
 * WHY THESE ARE SOURCE ASSERTIONS AND NOT A RENDER. This suite runs in `node`
 * and jsdom has no layout in any case: `scrollTop`, `clientHeight` and
 * `scrollHeight` are all 0 there, so a rendered press would assert that 0
 * stayed 0 and pass whatever the handler did. The arithmetic IS testable and is
 * gated at its own export (`shellClipAffordances.test.ts` drives
 * `toastPageScrollTop` on real numbers); what nothing held is the WIRING — that
 * the row is a control at all, that it is bound to the handler, that the
 * handler feeds the list's own three numbers to the shared function, and that
 * the shell hands the card a real speed instead of a literal. Every one of
 * those is a place a repair can ship a value nothing reads.
 * =============================================================================
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { HAZARD_BAND_TOP_FRACTION } from "@/modules/sim/hud";

import {
  BRIEFING_ROAD_MIN_LIST_PX,
  briefingRoadCeilingPx,
  briefingSendsEyesRight,
  briefingStandsDown,
  compactBriefingFold,
} from "../LessonPlayShell";
import { TOUCH_HINT_MOVING_KMH } from "../touchHintLifetime";

const SHELL = readFileSync(resolve(__dirname, "../LessonPlayShell.tsx"), "utf8");

/** Code only — `briefingOverflow.test.tsx`'s reason, in its own words: a source
 *  assertion that cannot tell code from the paragraph describing it is not a
 *  guard, it is a ban on writing the reason down. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CODE = stripComments(SHELL);
const CARD = CODE.slice(
  CODE.indexOf("export function BriefingCard({"),
  CODE.indexOf('THE „MICRO MAJOR BUTTON WITH SUB MENU"'),
);

describe("briefingStandsDown · the floor is borrowed, not re-decided", () => {
  it("is the same 5 км/ч the touch hint and the key legend stand down at", () => {
    // Three surfaces in this lane now fold when the car is under way, and a
    // second opinion about what „under way" means is how two of them end up
    // disagreeing on the same frame. The constant is IMPORTED here rather than
    // written, so this case fails if the briefing ever grows its own number.
    expect(TOUCH_HINT_MOVING_KMH).toBe(5);
    expect(briefingStandsDown(TOUCH_HINT_MOVING_KMH)).toBe(false);
    expect(briefingStandsDown(TOUCH_HINT_MOVING_KMH + 0.1)).toBe(true);
  });

  it("a standstill keeps the steps — arrival and 03-ready are 0 км/ч", () => {
    // The rows above are about DRIVING beats. Every `01-arrival` and `03-ready`
    // frame in the catalogue is a stationary car, and folding the briefing
    // there would take the authored steps off the one screen the student reads
    // them on — the opposite defect, shipped as a fix.
    expect(briefingStandsDown(0)).toBe(false);
    expect(briefingStandsDown(4.9)).toBe(false);
  });

  it("reversing is driving", () => {
    // `sim.speedKmh` is a magnitude today. A signed reading arriving later must
    // not be the reason a card is immortal in R — the ruling
    // `controlsLegendStandsDown` already wrote down for the same floor.
    expect(briefingStandsDown(-12)).toBe(true);
  });

  it("NaN is false, and that direction is the deliberate one", () => {
    // A speed that cannot be read is not evidence that anyone is driving, and
    // an unreadable number may never be the thing that removes the teaching.
    expect(briefingStandsDown(Number.NaN)).toBe(false);
    expect(briefingStandsDown(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("the «↓ още N стъпки» row is a CONTROL, and it reaches the last step", () => {
  it("is a button bound to the reveal handler, not a <p>", () => {
    // The shipped row was `<p aria-live="polite">↓ още {below} …</p>`: it told
    // the student something was hidden and gave him nothing to press. The two
    // rows this case exists for are both about the steps being unreachable, so
    // the assertion is that the ROW IS PRESSABLE — a mutation back to a
    // paragraph puts the defect back with the counter still on the frame.
    const row = CARD.slice(CARD.indexOf("</ol>"));
    const openTag = row.indexOf("↓ още {below}");
    expect(openTag, "the counter moved out of the card — re-anchor").toBeGreaterThan(-1);
    const control = row.slice(0, openTag);
    expect(control).toContain("<button");
    expect(control).toContain("onClick={revealMoreSteps}");
    expect(control).not.toContain("<p");
    // …and it still ends in a verb. „покажи" names what the thing he is
    // pressing does; the bare count named nothing he could do.
    expect(row.slice(openTag, openTag + 200)).toContain("покажи");
  });

  it("the handler pages the LIST's own three numbers through the shared arithmetic", () => {
    // The dead-predicate half. `toastPageScrollTop` is pure, exported and
    // already gated on real numbers by `shellClipAffordances.test.ts`; what
    // makes it live here is that the briefing's own scroller is what is handed
    // to it and the result is what is assigned back. A handler that computed
    // the number and dropped it would pass every arithmetic case in the tree.
    const body = CARD.slice(CARD.indexOf("const revealMoreSteps"));
    expect(body.slice(0, body.indexOf("}, [measure]);"))).toContain(
      "ol.scrollTop = toastPageScrollTop(ol.scrollTop, ol.clientHeight, ol.scrollHeight)",
    );
    // …and it re-measures synchronously, so the count, the mask and the row's
    // own disappearance land in the same render as the movement. Without this
    // the last press leaves «↓ още 1 стъпка» on a list with nothing under it.
    expect(body.slice(0, body.indexOf("}, [measure]);"))).toContain("measure();");
  });

  it("the last press does not strand the reader at the bottom", () => {
    // `below` reaching 0 is true of a briefing that FITS and of one paged to
    // its END, and those need opposite chrome: none, and the way back. The
    // second control is therefore bound to the list's POSITION, not to the
    // counter — binding it to `below` would put a permanent «↑» on every
    // briefing short enough to fit, which is the invariant the row has carried
    // since it was written („a briefing that fits carries no chrome").
    const row = CARD.slice(CARD.indexOf("</ol>"));
    expect(row).toContain("below > 0 ? (");
    expect(row).toContain("scrollTopPx > 1 ? (");
    expect(row).toContain("onClick={restartSteps}");
    // The restart handler is a real seek, not a decoration.
    const restart = CARD.slice(CARD.indexOf("const restartSteps"));
    expect(restart.slice(0, restart.indexOf("}, [measure]);"))).toContain("ol.scrollTop = 0;");
  });
});

describe("the card folds instead of blanking the kerb — and folds RECOVERABLY", () => {
  it("the lifetime is wired to the cluster's own speed, not to a literal", () => {
    // The wire is the whole repair: `briefingStandsDown` with nothing feeding
    // it is a predicate no rendered code reads. `snap.speedKmh` is
    // `snapshotOf`'s `lastTick?.speedKmh ?? 0` — the number the instrument
    // prints and the number `rules/engine.ts` grades against.
    const mount = CODE.slice(CODE.indexOf("<BriefingCard"));
    expect(mount.slice(0, mount.indexOf("/>"))).toContain("speedKmh={snap.speedKmh}");
    // …and the predicate is actually consulted inside the card.
    expect(CARD).toContain("briefingStandsDown(speedKmh)");
  });

  it("folds to a control, never to nothing — the THEO-4 half", () => {
    // „A teaching card is never treated this way: it moves, it does not
    // disappear" (PlayAreaStyles, this corridor's own rule). The folded state
    // must therefore be a labelled, pressable chip that says how much is behind
    // it — a `return null` here would be the В27 mistake in a layout file:
    // removing the teaching to satisfy a row about the teaching being in the
    // way.
    // Anchored to the EXPANDED card's root, which is the next thing in the
    // file — `indexOf("return (")` would stop at the folded branch's own.
    const folded = CARD.slice(
      CARD.indexOf("if (folded) {"),
      CARD.indexOf('aria-label="Инструкции за упражнението"'),
    );
    expect(folded, "the folded branch moved — re-anchor").not.toBe("");
    expect(folded).toContain("<button");
    expect(folded).toContain("onClick={unfold}");
    expect(folded).toContain("Инструкции");
    expect(folded).toContain("steps.length");
    expect(folded).not.toMatch(/return\s+null/);
  });

  it("never fires twice, and never against a student who has answered it", () => {
    // „The auto-hide that will not let you look is the same crime as the panel
    // that will not go away, pointing the other way" —
    // `controlsLegendLifetime.ts`. The latch is set BEFORE the fold and again
    // in `unfold`, so a student who opens the chip mid-drive keeps the panel
    // for the rest of the lesson however often the car stops and starts.
    const effect = CARD.slice(CARD.indexOf("const foldedOnceRef"), CARD.indexOf("const measure"));
    expect(effect).toContain("if (foldedOnceRef.current) return;");
    expect(effect).toContain("foldedOnceRef.current = true;");
    const unfold = CARD.slice(CARD.indexOf("const unfold ="), CARD.indexOf("const fold ="));
    expect(unfold).toContain("foldedOnceRef.current = true;");
    expect(unfold).toContain("setFolded(false);");
  });

  it("the ✕ is still a ✕, and the fold is a SECOND control beside it", () => {
    // The card had one exit and it was a one-way door: `onClose` clears
    // `briefingOpen` and nothing re-opens it, so „I want the road back" cost
    // the student the authored steps for the rest of the lesson. The fold does
    // not replace that — a student who has read the briefing is entitled to be
    // rid of it — it stands beside it.
    expect(CARD).toContain('<HudCloseButton onClick={onClose} labelBg="Скрий инструкциите" />');
    expect(CARD).toContain("onClick={fold}");
    expect(CARD).toContain('aria-label="Сгъни инструкциите"');
  });

  it("the fold control is 44 px, on the SAME rect the ✕ beside it uses", () => {
    // Row A6: „a control he cannot hit is the same defect as a control that is
    // not there". The ring stays 18 px and an unpainted `::before` carries the
    // target — the column is `min(15rem, 36vw)` and a painted 44 px square
    // would be a third of its width. `popupClose.test.ts` pins the close rule
    // by its exact selector text, so the fold's rect is a SECOND block rather
    // than a comma; this is the gate that stops the duplicate from drifting.
    const STYLES = readFileSync(resolve(__dirname, "../PlayAreaStyles.tsx"), "utf8");
    const body = (attr: string) =>
      new RegExp(`\\[${attr}\\]::before\\s*\\{([^}]*)\\}`).exec(STYLES)?.[1] ?? "";
    expect(body("data-hud-close")).toContain("2.75rem");
    expect(body("data-hud-fold")).toBe(body("data-hud-close"));
    // …and the handle is actually on the control, or the rule is a dead rule.
    expect(CARD).toContain('data-hud-fold=""');
  });

  it("the fold re-attaches the observer, so the counter cannot go stale", () => {
    // The fold unmounts the `<ol>`. An observer left on the detached node
    // freezes `below` at whatever it read before the card became a chip — a
    // number about a list that is no longer on the glass. `folded` in the deps
    // is what makes re-opening re-observe.
    const effect = CARD.slice(CARD.indexOf("new ResizeObserver(measure)"));
    expect(effect.slice(0, effect.indexOf(");") + 2)).toBeTruthy();
    expect(CARD).toContain("}, [measure, steps, folded]);");
  });

  it("…and the fold OUTLIVES the card, because a teach moment unmounts it", () => {
    // sc-junction-rhr:486cad54 — „the ИНСТРУКЦИИ panel is pinned over the right
    // third, exactly the side the priority vehicle arrives from". The speed
    // rule above folds it on the approach; what it could not survive is the
    // card being TAKEN AWAY and PUT BACK. The roomy mount sits behind
    // `activeQuiz === null && teachQueue.length === 0`, so a teach moment — the
    // likeliest event in a give-way drill — unmounts `BriefingCard`, React
    // discards `folded` and `foldedOnceRef` with it, and «Разбрах» remounts a
    // FRESH expanded panel at 0 км/ч over the side the student was just told to
    // look at, where the speed rule cannot fold it again until he moves off.
    //
    // The repair is three props and a piece of shell state, i.e. four places a
    // refactor can drop the wire while every pure case in this file stays
    // green — the 51-of-82 defect class. Each half is pinned here.
    expect(CODE).toContain(
      "const [briefingFold, setBriefingFold] = useState<{ folded: boolean; latched: boolean }>({",
    );
    const mountAt = CODE.indexOf("<BriefingCard");
    expect(mountAt, "the roomy mount moved — re-anchor").toBeGreaterThan(-1);
    const mount = CODE.slice(mountAt, CODE.indexOf("/>", mountAt));
    // BOTH halves are carried, not just the fold: seeding `folded` alone would
    // put a student who had deliberately UNFOLDED the panel back under the
    // auto-fold on his next metre — the rule firing twice, which is the crime
    // „once, and never against the student" forbids.
    expect(mount).toContain("foldedAtMount={briefingFold.folded}");
    expect(mount).toContain("foldLatchedAtMount={briefingFold.latched}");
    expect(mount).toContain("onFoldChange={setBriefingFold}");
    // …and the card SEEDS its state from them rather than merely accepting
    // them, which is the difference between a repair and a prop nothing reads.
    const cardAt = CODE.indexOf("export function BriefingCard({");
    const seed = CODE.slice(cardAt, CODE.indexOf("const measure", cardAt));
    expect(seed).toContain("useState(foldedAtMount ?? false)");
    expect(seed).toContain("useRef(foldLatchedAtMount ?? false)");
    // …and every move of the fold is reported back up, or the shell's memory
    // drifts from the card the moment the student touches either control.
    expect(CARD).toContain("onFoldChange?.({ folded: true, latched: true });");
    expect(CARD).toContain("onFoldChange?.({ folded: false, latched: true });");
  });
});

/**
 * =============================================================================
 * …AND THE PHONE HAD NO LIFETIME AT ALL — sc-signal-hesitation:f5ffccf3.
 * =============================================================================
 *
 * The row: „The same briefing is a blocking modal on mobile and a persistent
 * side panel on PC." Three quarters of it closed elsewhere — the numbering
 * agrees (`briefingLineOrdinal`), the phone got a route back (`recallBriefing`),
 * and `blocking` holds nothing on either platform (`overlayHoldsDrive` has no
 * production consumer; only this suite's sibling in `hud/__tests__` calls it).
 *
 * What was left is the half `briefingStandsDown` above only ever fixed on ONE
 * leg: the roomy panel folds to a labelled pill the first time the car moves,
 * and the compact item — the same authored steps in the overlay rail — had no
 * such rule, so it stayed a candidate for the whole drive and came back every
 * time a higher-priority toast expired (`hud/overlayQueue.ts` records that
 * mechanism on three lessons).
 * =============================================================================
 */
describe("compactBriefingFold · one lifetime, two surfaces", () => {
  const FRESH = { folded: false, latched: false } as const;

  it("stands the phone's briefing down at the SAME floor the panel folds at", () => {
    expect(compactBriefingFold(true, FRESH, TOUCH_HINT_MOVING_KMH)).toBeNull();
    expect(compactBriefingFold(true, FRESH, TOUCH_HINT_MOVING_KMH + 0.1)).toEqual({
      folded: true,
      latched: true,
    });
    // Reversing is driving and an unreadable speed is not — inherited from
    // `briefingStandsDown` rather than re-decided, which is what these two pin.
    expect(compactBriefingFold(true, FRESH, -12)).toEqual({ folded: true, latched: true });
    expect(compactBriefingFold(true, FRESH, Number.NaN)).toBeNull();
  });

  it("the standstill keeps the steps — arrival and 03-ready are 0 км/ч", () => {
    expect(compactBriefingFold(true, FRESH, 0)).toBeNull();
  });

  it("roomy is refused outright: the card owns its own fold there", () => {
    // Two writers to one piece of state is the drift this whole lane exists to
    // stop. `BriefingCard` reports its fold up through `onFoldChange`; a second
    // opinion computed in the shell would race it.
    expect(compactBriefingFold(false, FRESH, 40)).toBeNull();
  });

  it("never fires twice, and never against a student who has answered it", () => {
    // The same sentence as the roomy latch: a student who recalled the steps
    // mid-drive keeps them for the rest of the lesson.
    expect(compactBriefingFold(true, { folded: false, latched: true }, 40)).toBeNull();
    expect(compactBriefingFold(true, { folded: true, latched: true }, 40)).toBeNull();
  });

  it("the shell WIRES it — the effect writes, the candidate reads, the recall spends", () => {
    // Every one of these is a place the repair could have shipped a value
    // nothing reads, which is the defect class this programme measured at 51 of
    // 82 repairs. The predicate above is pure and green either way.
    // The writer is the HUD poll, not an effect of its own — a `setState` in an
    // effect body is a cascading render and this repo's lint rejects it. It is
    // handed the CLUSTER's speed, which is the property `BriefingCard`'s own
    // header makes load-bearing: the panel's idea of „he is driving now" may not
    // drift from the grader's.
    const writeAt = CODE.indexOf("setBriefingFold((prev) => compactBriefingFold(");
    expect(writeAt, "the compact fold writer moved — re-anchor").toBeGreaterThan(-1);
    expect(CODE.slice(writeAt, writeAt + 200)).toContain("compact, prev, speedKmh) ?? prev");
    const pollAt = CODE.lastIndexOf("const speedKmh = lastTickRef.current?.speedKmh ?? 0;", writeAt);
    expect(pollAt, "the fold no longer reads the cluster's own speed").toBeGreaterThan(-1);
    // …the rail's candidate is gated on the memory the poll just wrote…
    expect(CODE).toContain(
      "briefingOpen && !briefingFold.folded && briefing.length > 0 && !mistakeMode && !ended",
    );
    // …the recall spends the latch, so the ask is not undone on the next metre.
    // Anchored on two single-line landmarks, never on a multi-line literal: this
    // worktree is CRLF and a `\n` in a needle silently matches nothing, which
    // would make every assertion below it pass over an empty slice.
    const recallAt = CODE.indexOf("const recallBriefing =");
    expect(recallAt, "recallBriefing moved — re-anchor").toBeGreaterThan(-1);
    const recall = CODE.slice(recallAt, CODE.indexOf("setDismissedOverlayIds", recallAt));
    expect(recall).toContain("setBriefingFold({ folded: false, latched: true });");
    // …and a retry is an arrival again, for the fold exactly as for the recall.
    // Without this a second attempt started with the steps already hidden.
    const retryAt = CODE.indexOf("setBriefingRecalled(false);");
    expect(retryAt, "the retry reset moved — re-anchor").toBeGreaterThan(-1);
    expect(CODE.slice(retryAt, retryAt + 400)).toContain(
      "setBriefingFold({ folded: false, latched: false });",
    );
  });
});

/**
 * =============================================================================
 * …AND THE PANEL THE STUDENT ASKS BACK HAD NO CEILING AT ALL — 2026-09-12.
 * =============================================================================
 *
 * sc-junction-rhr:486cad54, major, re-judged STILL on twelve consecutive
 * re-drives (w26 → w37), every one of them on `01-arrival`: „the ИНСТРУКЦИИ
 * panel is pinned over the right third of the windscreen — exactly the side the
 * priority vehicle arrives from in a right-hand-priority lesson."
 *
 * THE SIBLING ROW WITH THE SAME SENTENCE CLOSED, AND THE DIFFERENCE IS THE BEAT.
 * `sc-ov-crossing-overtake:4bce6fca` was filed on a DRIVING frame (11 км/ч,
 * `sweep161/…/04-t160s.png`) and was retired on the w12 re-drive because
 * `briefingStandsDown` had turned all 33 of that leg's beats into the pill.
 * 486cad54's frame is a 0 км/ч standstill, where the fold correctly does not
 * fire — folding a briefing at the standstill it exists for is the opposite
 * defect, and this suite already pins that direction two describes up.
 *
 * WHAT IS LEFT IS THE ONE DRIVING BEAT THE FOLD IS FORBIDDEN TO OWN. „Once, and
 * never against the student" entitles a student who presses «ⓘ Инструкции · 6
 * стъпки ▸» at 40 км/ч to keep the whole panel for the rest of the lesson, and
 * nothing bounded it: ~320 px of opaque card on a ~1165 px stage, standing on
 * the right kerb at speed. `briefingRoadCeilingPx` is that bound, borrowed from
 * the surface in this same lane that already pays it.
 * =============================================================================
 */
describe("briefingRoadCeilingPx · the recalled panel stops above the hazard band", () => {
  /* THE NUMBERS ARE OFF THE ROW'S OWN NEWEST FRAME, not off an estimate.
     `.audit-frames/w37/frames/sc-junction-rhr__pc-right/01-arrival.png`,
     1440 × 900, edges found by scanning the raw pixels for the `26,33,48`
     border: the stage box is x 264–1431 × y 97–753, and the ИНСТРУКЦИИ card is
     x 1099–1418 × y 323–581 — 320 px wide, 27.4 % of a 1167 px stage, with its
     floor at 0.737 of the stage, a third of the frame below the horizon. */
  const STAGE_TOP = 98;
  const STAGE_H = 655;
  /** The `<ol>`'s own top on that frame: the card starts at 323 and its
   *  `py-1.5`, header row and `mt-1` take ~28 before the first step. */
  const LIST_TOP = 351;

  it("is the BAND's top and not the horizon, because the horizon is unreachable", () => {
    // The measurement that chooses the constant. At 0.402 (the cockpit horizon,
    // which `NOTIFY_COLUMN_MAX_STAGE_FRACTION` rounds down to 0.40 for the
    // compact peek) the corridor between this list's top and the line is 10 px,
    // so the ceiling would be FLOORED on every roomy stage in the ladder — a
    // fixed 38 px cap wearing a rule's name. The band's own top is reachable.
    const horizon = briefingRoadCeilingPx(LIST_TOP, STAGE_TOP, STAGE_H, 0.402);
    expect(horizon).toBe(BRIEFING_ROAD_MIN_LIST_PX);
    const band = briefingRoadCeilingPx(LIST_TOP, STAGE_TOP, STAGE_H);
    expect(band).toBeGreaterThan(BRIEFING_ROAD_MIN_LIST_PX);
    // 98 + 0.53 × 655 − 351 = 94.15 px ≈ seven 13.75 px line boxes ≈ 3 steps,
    // with the rest under the counter that already pages to them. The card's
    // floor moves 581 → ~467, i.e. ~114 px of the right kerb handed back.
    expect(band).toBeCloseTo(94.15, 2);
  });

  it("the number is IMPORTED, so two surfaces cannot disagree about the road", () => {
    // `PlayAreaStyles` spends the same fraction on `[data-hud="touch-hint"]`,
    // the other reading surface in this corridor. A locally written 0.53 here
    // is how one frame ends up carrying two answers to „where does the road
    // begin"; this case fails if the briefing ever grows its own number.
    expect(HAZARD_BAND_TOP_FRACTION).toBe(0.53);
    expect(briefingRoadCeilingPx(LIST_TOP, STAGE_TOP, STAGE_H)).toBe(
      briefingRoadCeilingPx(LIST_TOP, STAGE_TOP, STAGE_H, HAZARD_BAND_TOP_FRACTION),
    );
  });

  it("never reaches zero — a ceiling that deletes the teaching is not a ceiling", () => {
    // A card already below the band would compute a negative budget. Clamping to
    // 0 would hand the student a header, a counter and nothing between them,
    // which is the В27 shape: removing the teaching to satisfy a row about the
    // teaching being in the way. It fails toward keeping the words.
    expect(briefingRoadCeilingPx(600, STAGE_TOP, STAGE_H)).toBe(BRIEFING_ROAD_MIN_LIST_PX);
    expect(BRIEFING_ROAD_MIN_LIST_PX).toBeGreaterThan(0);
  });

  it("an unreadable geometry is null, never a small number", () => {
    // jsdom returns 0 for every rect, a server render measures nothing, and the
    // popup rig has no `[data-sim-stage]` ancestor at all. Each of those must
    // resolve to TODAY's behaviour — no cap — and not to a card clipped to its
    // floor by a measurement that never happened.
    expect(briefingRoadCeilingPx(0, 0, 0)).toBeNull();
    expect(briefingRoadCeilingPx(LIST_TOP, STAGE_TOP, -1)).toBeNull();
    expect(briefingRoadCeilingPx(Number.NaN, STAGE_TOP, STAGE_H)).toBeNull();
    expect(briefingRoadCeilingPx(LIST_TOP, Number.NaN, STAGE_H)).toBeNull();
    expect(briefingRoadCeilingPx(LIST_TOP, STAGE_TOP, Number.NaN)).toBeNull();
    expect(briefingRoadCeilingPx(LIST_TOP, STAGE_TOP, STAGE_H, Number.NaN)).toBeNull();
  });

  it("a taller stage stops binding, so 32:9 and a desk monitor are untouched", () => {
    // Blast radius, stated as an assertion rather than as a claim. The ceiling
    // is a `max-height`: on a stage where the band's top is already below the
    // card's natural floor it simply does not bind, and the panel is byte-for-
    // byte what it is today. Only the short stages — where the card genuinely
    // reaches the road — pay anything.
    //
    // The reference is the list's own natural height on the frame this suite is
    // measured off: the six steps run to 14 wrapped 13.75 px line boxes ≈ 200 px
    // (card y 323–581, less ~28 of header and ~30 of counter row and padding).
    // On a 1400 px stage the budget is 98 + 0.53 × 1400 − 351 = 489, so the
    // `max-height` is more than twice the content and never binds.
    const NATURAL_LIST_PX = 200;
    const tall = briefingRoadCeilingPx(LIST_TOP, STAGE_TOP, 1400);
    expect(tall).toBeCloseTo(489, 0);
    expect(tall).toBeGreaterThan(NATURAL_LIST_PX);
  });

  it("the ceiling is WIRED, and only while the car is moving", () => {
    // The dead-predicate gate. The arithmetic above is pure and stays green
    // whether or not one line of rendered code reads it, which is the 51-of-82
    // class this programme measured. Three places it can be dropped:
    //   · the measurement (the stage box is walked to, in the list's own coords)
    const measureAt = CARD.indexOf("const measure");
    expect(measureAt, "the measurement moved — re-anchor").toBeGreaterThan(-1);
    const m = CARD.slice(measureAt, CARD.indexOf("const revealMoreSteps", measureAt));
    expect(m, "the measure/reveal anchors crossed — re-anchor").not.toBe("");
    expect(m).toContain('ol.closest("[data-sim-stage]")');
    expect(m).toContain("briefingRoadCeilingPx(listTop, stageRect.top, stageRect.height)");
    //   · the application (on the LIST, so the header, the ▾/✕ pair and the
    //     «↓ още N стъпки — покажи» row can never be what gets clipped)…
    const list = CARD.slice(CARD.indexOf("<ol"), CARD.indexOf("</ol>"));
    expect(list).toContain("maxHeight: roadCeilingPx");
    //   · …and the predicate, which is the fold's own, so the card cannot hold
    //     one opinion about „he is driving now" while the fold holds another.
    expect(list).toContain("briefingStandsDown(speedKmh)");
  });

  it("a standstill keeps every authored step — 01-arrival is not shortened", () => {
    // The half that stops this from being the opposite defect. `01-arrival` and
    // `03-ready` are 0 км/ч on every lesson in the catalogue: the student is
    // reading, the world behind the card is a parked street 120 m short of the
    // junction, and trading four authored steps for a view of it is a loss.
    //
    // NARROWED, NOT WITHDRAWN (sc-junction-rhr:486cad54, w41). The exemption is
    // now „…on the lessons whose steps point his head somewhere else": the one
    // family where the standstill is NOT a parked street is the one whose own
    // briefing says the priority car arrives from the side this column stands
    // on. `briefingSendsEyesRight` is that condition and the test below is its
    // behaviour; here the guard is pinned so the disjunct cannot be dropped
    // while the arithmetic above stays green.
    expect(briefingStandsDown(0)).toBe(false);
    const list = CARD.slice(CARD.indexOf("<ol"), CARD.indexOf("</ol>"));
    const capAt = list.indexOf("maxHeight: roadCeilingPx");
    const guard = list.slice(0, capAt);
    expect(guard).toContain("roadCeilingPx !== null");
    expect(guard).toContain("briefingStandsDown(speedKmh)");
    expect(guard).toContain("sendsEyesRight");
  });

  it("…and the one family where the standstill IS the hazard", () => {
    // sc-junction-rhr's own step 3, verbatim off `01-arrival.png` — the sentence
    // the panel was photographed covering the right third of the windscreen
    // with. Both matched tokens are in it.
    expect(
      briefingSendsEyesRight([
        { textBg: "Тръгни по страничната улица към кръстовището — то е равнозначно." },
        {
          textBg:
            "Преди устието се огледай: първо наляво, после НАДЯСНО. Кола отдясно има предимство — това е правилото на дясното.",
        },
      ]),
    ).toBe(true);
    // Either token alone is enough, because either one is a car arriving.
    expect(briefingSendsEyesRight([{ textBg: "Кола отдясно има предимство." }])).toBe(true);
    expect(
      briefingSendsEyesRight([{ textBg: "Огледай се надясно, преди да тръгнеш." }]),
    ).toBe(true);

    // …AND THE THINGS A STUDENT DOES RATHER THAN SEES, which must NOT charge the
    // ceiling — a predicate that fired on these would be the unconditional rule
    // wearing a condition's name, and ~150 lessons would silently lose steps at
    // their reading beat.
    expect(briefingSendsEyesRight([{ textBg: "Завий надясно и продължи." }])).toBe(false);
    expect(briefingSendsEyesRight([{ textBg: "Пусни десен мигач." }])).toBe(false);
    expect(briefingSendsEyesRight([{ textBg: "Движи се спокойно в дясната лента." }])).toBe(
      false,
    );
    // The mirror is an instrument reading, not the windscreen view this card
    // stands on: „огледай" is deliberately not a substring of „огледало".
    expect(
      briefingSendsEyesRight([{ textBg: "Погледни в дясното огледало преди престрояване." }]),
    ).toBe(false);

    // Nothing measurable → today's card, exactly (the `null` direction every
    // predicate in this file takes).
    expect(briefingSendsEyesRight([])).toBe(false);
    expect(briefingSendsEyesRight(null)).toBe(false);
    expect(briefingSendsEyesRight(undefined)).toBe(false);

    // WIRED: the card computes it once from its own authored steps and the
    // `<ol>` is the only declaration that spends it.
    expect(CARD).toContain("briefingSendsEyesRight(steps)");
  });
});
