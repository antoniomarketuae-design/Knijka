/**
 * THE OVERLAY BUDGET — one overlay, one line, one edge.
 *
 * FOUNDER REVIEW 2026-07-29, on his own iPhone 16. His screenshots show three
 * panels stacked before the road gets a pixel: a „ЗАДАЧА" card, a teach card,
 * and a red belt warning — each an independent component that decided on its
 * own that it deserved the top of the screen. His verdict on the result: „not
 * acceptable it is not playable at all". And on the end of a run: the crash
 * debrief covers the entire frame, controls included.
 *
 * The reference he attached is a Gran Turismo frame labelled „how it should
 * look like". The lesson is NOT fidelity — it is WHERE THE INSTRUMENTS LIVE.
 * GT's screen furniture is tiny, hard against the edges, and THE CENTRE OF THE
 * SCREEN IS ROAD. Nothing sits there.
 *
 * So this module replaces "every panel positions itself" with a budget that
 * can be measured:
 *
 *   1. ONE overlay is visible at a time. Everything else waits in a QUEUE and
 *      is counted, not stacked (`selectOverlay`).
 *   2. The DEFAULT presentation of that one overlay is a single LINE at an
 *      edge — `OVERLAY_PEEK_MAX_FRACTION` of the viewport, no more.
 *   3. It never paints inside the CENTRE BAND (`overlayCentreBand`). That band
 *      is the road, and on a reading screen it is the question.
 *   4. Full-bleed is reserved for an EXPLICIT pause — something the student
 *      asked for by tapping. Nothing arrives full-bleed on its own, and while
 *      such a surface is up the queue says nothing at all
 *      (`OVERLAY_SCREEN_OWNERS` / `overlayQueueMaySpeak` / `overlayHoldsDrive`).
 *      This rule was PROSE ONLY until 2026-08-17, which is how the lesson menu
 *      came to share a screen with a live coaching card; the block above
 *      `OverlayScreenOwner` has the frame and the derivation.
 *
 * THEO-4 (requirement zero, founder-ratified) is why the line is not the whole
 * story. A one-line overlay may never degrade into a bare correct/wrong
 * verdict: every item that has an authored, law-cited WHY carries it in
 * `detailBg` + `lawRef`, one tap away, and `hasWhy()` is the assertion that it
 * still does. Shorter explanation — never no explanation.
 *
 * Pure arithmetic and pure data on purpose, exactly like immersive.ts and
 * playArea.ts: the geometry rules are unit-testable without a DOM, and the
 * WebKit probe in tools/mobile/ imports the SAME constants it asserts against,
 * so the screen and the measurement can never drift apart.
 */

// ---------------------------------------------------------------------------
// The budget
// ---------------------------------------------------------------------------

/**
 * How much of the viewport the default (peek) state of the one visible overlay
 * may paint on, as a fraction of viewport AREA.
 *
 * Twelve per cent is the founder's own arithmetic run backwards: „at least 85%
 * of the mobile screen should remain available for the actual simulator". The
 * instrument band already spends 40 px (10.3 % of a 390 px landscape height,
 * immersive.ts) and the touch controls spend theirs; an overlay layer that also
 * wanted a third of the screen is what produced „approximately half of the
 * screen is occupied by controls, information panels, popups".
 *
 * A pill is charged as its bounding rectangle here, the same conservative way
 * tools/mobile/lib/probe.mjs charges it — over-reporting, which is the safe
 * direction for a budget.
 */
export const OVERLAY_PEEK_MAX_FRACTION = 0.12;

/**
 * Height of the peek pill, px. 44 is Apple's minimum touch target, and the pill
 * IS the tap target — a 28 px pill with a 44 px invisible hit area is the sort
 * of thing that passes an audit and misses a thumb.
 *
 * There used to be a second, smaller floor (`OVERLAY_PEEK_STATUS_HEIGHT_PX`,
 * 30 px) for „pure status" cards with nothing to press. Row A6 deleted the
 * category rather than the number: the founder's complaint is that an ordinary
 * notification could not be removed by clicking it, so every card the drive is
 * not waiting on now carries a dismiss control, and there is no such thing as a
 * peek you cannot touch.
 */
export const OVERLAY_PEEK_HEIGHT_PX = 44;

/**
 * The centre band — THE ROAD. Fractions of the viewport, as a rect.
 *
 * Chosen from the frame the cockpit camera is authored at (playArea.ts): the
 * horizon sits a little above the middle, the corridor the student steers down
 * runs from roughly a fifth of the height to the top of the instrument band,
 * and the mirrors live outside it. On a reading screen the same rect is where
 * the question and its answers are. Anything that paints here is taking the
 * thing the student came for.
 *
 * Deliberately NOT the whole screen: the corners and the top/bottom rails are
 * exactly where GT puts its lap time, its pause chip and its map, and where
 * this app puts its menu button and its instrument band.
 */
export const OVERLAY_CENTRE_BAND = {
  x0: 0.16,
  x1: 0.84,
  y0: 0.2,
  y1: 0.74,
} as const;

export interface OverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The centre band in CSS pixels for a given viewport. */
export function overlayCentreBand(
  viewportWidthPx: number,
  viewportHeightPx: number,
): { left: number; top: number; right: number; bottom: number } {
  return {
    left: viewportWidthPx * OVERLAY_CENTRE_BAND.x0,
    right: viewportWidthPx * OVERLAY_CENTRE_BAND.x1,
    top: viewportHeightPx * OVERLAY_CENTRE_BAND.y0,
    bottom: viewportHeightPx * OVERLAY_CENTRE_BAND.y1,
  };
}

/**
 * Does this painted rect stay out of the road? Touching an edge is allowed
 * (a pill whose bottom is exactly the band's top line has not entered it);
 * one pixel inside is not.
 */
export function rectClearsCentreBand(
  rect: OverlayRect,
  viewportWidthPx: number,
  viewportHeightPx: number,
): boolean {
  const band = overlayCentreBand(viewportWidthPx, viewportHeightPx);
  const overlapX = Math.min(rect.x + rect.width, band.right) - Math.max(rect.x, band.left);
  const overlapY = Math.min(rect.y + rect.height, band.bottom) - Math.max(rect.y, band.top);
  return overlapX <= 0 || overlapY <= 0;
}

/** Fraction of the viewport a painted rect costs. */
export function rectViewportFraction(
  rect: OverlayRect,
  viewportWidthPx: number,
  viewportHeightPx: number,
): number {
  const area = viewportWidthPx * viewportHeightPx;
  if (!(area > 0)) return 0;
  const w = Math.max(0, Math.min(rect.x + rect.width, viewportWidthPx) - Math.max(rect.x, 0));
  const h = Math.max(0, Math.min(rect.y + rect.height, viewportHeightPx) - Math.max(rect.y, 0));
  return (w * h) / area;
}

/** Is the default state within budget? */
export function peekWithinBudget(
  rect: OverlayRect,
  viewportWidthPx: number,
  viewportHeightPx: number,
): boolean {
  return rectViewportFraction(rect, viewportWidthPx, viewportHeightPx) <= OVERLAY_PEEK_MAX_FRACTION;
}

// ---------------------------------------------------------------------------
// The items
// ---------------------------------------------------------------------------

/**
 * Every kind of thing that used to be its own floating panel. The list IS the
 * inventory of what was competing for the top of the screen, which is why the
 * founder saw three at once: nothing knew about anything else.
 */
export type SimOverlayKind =
  /** Session over — verdict + the debrief behind one tap. */
  | "end"
  /** A9 teach moment: first encounter, the drive is frozen. */
  | "teach"
  /** A graded mistake (HUD violation toast). */
  | "violation"
  /** An armed cabin fault: belt, handbrake, lights, fog. */
  | "warning"
  /** Control feedback / practice nudge (HUD "lesson" toast). */
  | "hint"
  /** „Браво" — a commendation. */
  | "praise"
  /** Pre-drive: the next step, with the checklist behind one tap. */
  | "predrive"
  /** „Съветник": the next expected action. */
  | "advisor"
  /** The active objective („ЗАДАЧА 2/3"). */
  | "task"
  /** The two-ribbon colour legend, once, at the start of a guided rung. */
  | "legend";

export type SimOverlayTone = "neutral" | "teach" | "warn" | "danger" | "good";

export interface SimOverlayItem {
  /** Stable within a kind; changing it re-announces the item. */
  id: string;
  kind: SimOverlayKind;
  tone: SimOverlayTone;
  /**
   * THE LINE. One line, truncated, always present. It must say WHAT — never a
   * bare verdict, never a naked score.
   */
  lineBg: string;
  /**
   * ── THE LINE'S OWN NUMBER, WHEN THE BODY UNDER IT IS A NUMBERED LIST ───────
   *   round 10, 2026-08-24 · twenty-one BROKEN rows, one sentence between them.
   *
   * THE FRAMES, and there are twenty-one of them on the same commit — every
   * one a mobile `02-briefing.png`, i.e. the SHEET at the bottom of
   * `SimOverlay.tsx`, not the peek:
   *
   *   sc-pe-school-patrol/mobile-right  «Потегли и се движи спокойно в своята
   *     лента — улицата пред теб минава край училище.» in the headline face,
   *     with NO number, and then «2.» «3.» «4.» «5.» «6.» «7.» under it.
   *   sc-park-zebra, sc-park-left, sc-park-wall  the same, running to «8.»
   *   …and the pc leg of each prints the identical list numbered 1–5 in full,
   *     which is the half that makes it a divergence rather than a style.
   *
   * WHY IT IS NOT COSMETIC. `briefingLineBg`/`briefingBodyBg` deliberately do
   * NOT renumber the body from 1 — „the list is a sequence whose first item is
   * the bold sentence directly above it". That is a correct contract and it is
   * the reason the split exists at all. What was never delivered is the other
   * half of it: nothing on the glass ever SAID the bold sentence is item 1, so
   * the student is handed a seven-step procedure whose visible numbering opens
   * at two. A learner counting the steps of a manoeuvre concludes one is
   * missing and goes looking for it — on the surface whose whole job is to be
   * the one place all the steps are readable.
   *
   * IT IS A NUMBER BESIDE `lineBg` AND NOT A PREFIX INSIDE IT. Two reasons,
   * and the weaker of them was withdrawn under verification on 2026-08-25 —
   * written down here rather than quietly dropped, because a repair whose
   * stated reason is wrong is the next reader's trap:
   *
   *   · IT STANDS — `briefingLineBg` is the derivation the corpus gates read
   *     (`briefing-no-echo.test.ts` sweeps all 663 compiled rungs through it,
   *     and `briefing-card-budget.test.ts` budgets against `textBg`). „1. " in
   *     that string is chrome inside a field the whole product treats as
   *     AUTHORED BULGARIAN: the echo row, the numbering row and the fold table
   *     would all be asserting against copy no author wrote. Markup on the
   *     surface costs the string nothing.
   *   · IT DOES NOT — the original filing said three characters cost 29 of 663
   *     rungs a worse fold band and 12 of them their body outright, swept over
   *     FOLD_TABLE. That table's header measures the peek's text window at
   *     180 × 127 px and budgets a ≤ 42-character line 110 visible body
   *     characters; the round-10 frames show a ~44-character line with ZERO
   *     body and «↓ ОЩЕ 17 РЕДА» (`sc-crossing-white-cane__mobile-right/
   *     01-arrival.png`), i.e. a real window of about 51 CSS px. The peek's
   *     body is already at zero with or without the three characters, so that
   *     cost is not demonstrated on this sweep's own evidence.
   *
   * WHICH SURFACE PAINTS IT, then, is settled by the frames and not by the
   * table: all twenty-one are the opened SHEET (the harness clicks «ПРОЧЕТИ»
   * and waits 2 500 ms before the beat, `tools/mobile/lesson-audit.mjs:1049`),
   * and the sheet is the one surface that shows the whole list. The peek's lead
   * stays unnumbered because on those frames the peek shows no numbers at all —
   * its body is entirely below the fold — so there is no visible sequence for a
   * missing «1.» to be missing FROM. That is a measurement, not a prohibition:
   * see the note on the test that used to forbid it.
   *
   * `null`/absent for every item that is not one step of an authored list — a
   * fault card, a commendation, a task line. Do not invent one.
   */
  lineOrdinal?: number | null;
  /** Leading chip: „ЗАДАЧА 2/3", „−2 т.", „Изпит". */
  chipBg?: string | null;
  /**
   * THEO-4: the authored, law-cited explanation. One tap away, never gone.
   * Absent only for items that have no WHY to give (a commendation, a legend).
   */
  detailBg?: string | null;
  lawRef?: string | null;
  /**
   * The item holds the drive frozen until it is acknowledged. Exactly the
   * teach-moment contract — the pause is the product behaviour (doc 65 §5);
   * what changed is that it now costs one line instead of half the screen.
   */
  blocking?: boolean;
  /** Label for the acknowledge control; defaults to „Разбрах". */
  ackLabelBg?: string | null;
  /** Label for the control that opens the detail; defaults to „Защо". */
  openLabelBg?: string | null;
  /**
   * ── DOC 91 · C5/§I5(a) — THE 4-PIXEL DEAD END ─────────────────────────────
   * „one 4-pixel miss bricks the lesson, silently and permanently."
   *
   * MEASURED: «СПИСЪК» at [664,51 61×44] and the ✕ «Скрий известието» at
   * [729,51 44×44] — **a 4 px gap.** One tap on that ✕ removed the pre-drive
   * line for good (`dismissedOverlayIds` is added to and never cleared), and on
   * the three INFO steps whose only completion path is «Потвърди» inside that
   * checklist the lesson was then unwinnable. Step 1 is an info step, **so tap
   * #1 of a lesson could do it.**
   *
   * This flag is the distinction the A6 ruling („those pop ups need to be able
   * to be removed when clicked") was always missing: A6 is about TRANSIENT
   * NOTIFICATIONS — a task line, a „Браво", a piece of guidance. An item that
   * IS the task is not a notification about the lesson, it is the lesson, which
   * is also why it carries no TTL. `blocking` is the wrong tool for it: a
   * blocking item freezes the drive, and the pre-drive is performed by driving
   * the controls.
   *
   * Use it only for an item that (a) has no TTL, (b) reappears identically on
   * the next poll anyway, and (c) is the student's only route to something he
   * needs. Everything else on the glass stays one tap from gone.
   */
  noDismiss?: boolean;
  /** The caller renders extra React inside the opened sheet (checklist, result). */
  hasRichDetail?: boolean;
  /**
   * ── WHEN THIS ITEM WAS RAISED (ms, `performance.now()`/`Date.now()` domain) ──
   *   sweep 161 · §2.6 O33, filed by the toast-moment lane against a gap it
   *   could not reach into this file.
   *
   * THE FRAME (`sc-sp-curve/mobile-wrong/04-t030s.png`, iPhone 16 landscape,
   * opened before this field was added): a card reading «Превишена скорост —
   * Движеше се над разрешената скорост…» stands at the top right while the
   * cluster under it reads **18 км/ч** and the В26 disc beside it reads **90**.
   * The car had been at 96 км/ч six seconds earlier in the open field, so the
   * card is telling the truth about a moment that is gone — and nothing on the
   * glass says which moment. A seventeen-year-old reads an accusation of
   * speeding next to a speedometer showing 18 and a sign showing 90, and the
   * only conclusion available to him is that the grader is broken.
   * `sc-merge-from-property/mobile-right/05-stopped.png` is the same reading.
   *
   * WHY THE ROOMY LEG IS ALREADY FIXED AND THE PHONE IS NOT. `hud/HudToasts.tsx`
   * stamps `raisedAtMs` on every toast and prints «сега» / «преди 8 с» on the
   * card's last row. On a phone the shell does not render `HudToasts` at all —
   * it re-maps each toast into a `SimOverlayItem` — and **this shape carried no
   * moment**, so the stamp was dropped at the boundary. O33's own words: „so
   * that whoever adds the field to `SimOverlayItem` is told this file wants
   * it." This is that field, with the same name as the toast's so the two
   * cannot be mapped across by accident.
   *
   * OPTIONAL, and absent means „no moment" rather than „now" — the same
   * direction `HudToasts` chose and for the same reason it gives: an unstamped
   * card must print no age at all rather than invent one. A card that says
   * «сега» about a fault from six seconds ago is the defect above wearing the
   * costume of the fix.
   *
   * ⚠ NOT YET SPENT ON THE GLASS. The two edits that spend it are both outside
   * this lane and both are named so neither can be lost: the shell's re-map
   * (`components/sim/lesson-ui/LessonPlayShell.tsx`, the `...(!ended` block —
   * add `raisedAtMs: t.raisedAtMs`) and the phone card's last row
   * (`hud/SimOverlay.tsx` — render `overlayMomentBg(item, now)`).
   * `hud-toast-moment.test.tsx`'s „THE PHONE IS NOT COVERED" block asserts
   * `expect(mapped).not.toContain("raisedAtMs")` against the CURRENT shell, so
   * it goes red the moment the first of those lands — deliberately, and
   * whoever lands it inverts that assertion in the same commit.
   */
  raisedAtMs?: number;
  /** Called when the student acknowledges/dismisses. Ignored by the pure selector. */
  onAck?: () => void;
}

/**
 * Which kinds carry a moment — `HudToasts.toastCarriesAge`, in this file's
 * vocabulary, so the phone and the roomy leg cannot decide differently about
 * the same event.
 *
 * `violation` and `hint` are that function's `"violation"` and `"lesson"` (the
 * mapping is written into `SimOverlayKind`'s own doc comment: „Control feedback
 * / practice nudge (HUD "lesson" toast)"). `teach` is deliberately NOT here,
 * for the reason `toastCarriesAge` gives about its own exclusions: a teach
 * moment freezes the drive at the instant it fires, so there is no elapsed time
 * for the student to be wrong about. `praise`, `task`, `advisor`, `predrive`,
 * `legend`, `warning` and `end` state no verdict about a past moment.
 */
const CARRIES_MOMENT: ReadonlySet<SimOverlayKind> = new Set<SimOverlayKind>([
  "violation",
  "hint",
]);

export function overlayCarriesMoment(kind: SimOverlayKind): boolean {
  return CARRIES_MOMENT.has(kind);
}

/** The «сега» band, ms — `HudToasts.TOAST_AGE_NOW_MAX_MS`, copied by value. */
export const OVERLAY_MOMENT_NOW_MAX_MS = 2000;

/**
 * THE MOMENT, IN THE CARD'S OWN WORDS — the phone's half of the toast stamp.
 *
 * Deliberately here and not in `SimOverlay.tsx`: it is a pure string function
 * over two numbers, and this project's node-environment vitest can drive it
 * without R3F, so the rule is checkable where the render is not. Same argument
 * `touchHintLifetime.ts` and `sessionClock.ts` both make for sitting where they
 * sit.
 *
 * IT IS `toastAgeBg` TO THE CHARACTER, and that is the requirement rather than
 * a nicety. The two legs describe the SAME event on the same drive — the phone
 * one because the shell re-maps a toast into a `SimOverlayItem`, the desktop one
 * because it renders the toast directly — so a rounding difference here would
 * mean one device saying «преди 8 с» and the other «преди 7 с» about one fault.
 * That is the shape of drift this module was burned by twice already (the two
 * hand-kept screen-owner lists above; `dashboardStatus`' two weather
 * vocabularies), so the bands are copied by value — importing a `.tsx` client
 * component into this pure leaf would drag React into the selector — and
 * `overlay-queue-moment.test.ts` re-reads `HudToasts.tsx`'s own literals on
 * every run and fails if either side moves:
 *
 *   < 2 s        «сега»
 *   ≥ 2 s        «преди N с», N = `Math.round(ms / 1000)`  ← ROUND, not floor
 *   clock back   «сега», not a negative and not a future age
 *
 * THE ONE THING IT ADDS is the answer `toastAgeBg` cannot express, because its
 * `raisedAtMs` is a required number and this one's is optional: **no stamp at
 * all → `null`, print nothing.** That is the state every item ships in today,
 * and the direction matters — inventing «сега» for an unstamped card would date
 * a fault that may be a minute old, which is `sc-sp-curve/mobile-wrong/
 * 04-t030s.png` again wearing the costume of its own fix.
 */
export function overlayMomentBg(
  item: Pick<SimOverlayItem, "raisedAtMs">,
  nowMs: number,
): string | null {
  const raised = item.raisedAtMs;
  if (typeof raised !== "number" || !Number.isFinite(raised)) return null;
  const ms = nowMs - raised;
  if (!Number.isFinite(ms) || ms < OVERLAY_MOMENT_NOW_MAX_MS) return "сега";
  return `преди ${Math.round(ms / 1000)} с`;
}

/**
 * Surfacing priority. Safety and „the car is frozen waiting for you" outrank
 * ambient guidance; ambient guidance is what gets counted instead of stacked.
 */
const PRIORITY: Record<SimOverlayKind, number> = {
  end: 100,
  teach: 90,
  violation: 80,
  warning: 70,
  hint: 60,
  praise: 50,
  predrive: 40,
  advisor: 30,
  task: 20,
  legend: 10,
};

/**
 * AMBIENT kinds are always-on guidance — they are not "waiting their turn",
 * they are simply not the most important thing right now. Counting them in the
 * „+N" badge would tell a student that three things are pending when the truth
 * is that one warning is covering a task line that has not changed in a minute.
 */
const AMBIENT: ReadonlySet<SimOverlayKind> = new Set<SimOverlayKind>([
  "task",
  "advisor",
  "predrive",
  "legend",
]);

export function overlayPriority(kind: SimOverlayKind): number {
  return PRIORITY[kind];
}

export function isAmbientOverlay(kind: SimOverlayKind): boolean {
  return AMBIENT.has(kind);
}

/**
 * THEO-4 assertion: does this item still carry a reachable WHY?
 *
 * Anything that names a mistake — a teach moment, a graded violation, a coached
 * hint, an armed fault — must be able to explain itself. „Не спря на STOP" with
 * nothing behind it is the bare verdict requirement zero forbids. Praise,
 * tasks, prompts and the ribbon legend are not verdicts and are exempt.
 */
const MUST_EXPLAIN: ReadonlySet<SimOverlayKind> = new Set<SimOverlayKind>([
  "teach",
  "violation",
  "hint",
  "warning",
]);

export function requiresWhy(kind: SimOverlayKind): boolean {
  return MUST_EXPLAIN.has(kind);
}

export function hasWhy(item: SimOverlayItem): boolean {
  if (!requiresWhy(item.kind)) return true;
  return typeof item.detailBg === "string" && item.detailBg.trim().length > 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   …AND `hasWhy` ANSWERS A NARROWER QUESTION THAN IT IS READ AS ANSWERING.
   Sweep 161, four frames of one shape, 2026-08-19.

   `hasWhy` measures ONE thing: is there an authored explanation on the object.
   It is read as measuring „can the student read the explanation", and those
   came apart the moment the peek acquired a fold. Every frame below returns
   `hasWhy === true`:

     sc-zebra-approach/mobile-right/04-t087s     ↓ ОЩЕ 15 РЕДА
     sc-crossing-dart/mobile-right/01-arrival    ↓ ОЩЕ 15 РЕДА
     sc-sp-curve/mobile-wrong/04-t129s           ↓ ОЩЕ 8 РЕДА
     sc-speed-transition/mobile-wrong/04-t018s   ↓ ОЩЕ 3 РЕДА
     sc-merge-motorway-exit/mobile-right/01-arrival  ↓ ОЩЕ 39 РЕДА

   THE ZEBRA FRAME IS THE ONE THAT SETTLES IT, because there the folded line is
   the graded one. Opened at 852 × 393: the peek prints the whole first line,
   then step 2 in grey, then **half of step 3 at ~50 % opacity, straight across
   the face of the pedestrian-crossing sign it is about**, then the counter.
   Step 3 is the stop rule — the thing this lesson bills. A student can be
   convicted of breaking a rule the card cut in half, and every THEO-4
   instrument in the tree said the card was fine.

   That is the failure mode the audit rules name first: an instrument that lies
   in the REASSURING direction. `hasWhy` is not wrong — it is narrow, and the
   repair is a second predicate that answers the wider question, not a quieter
   `hasWhy`. Both are kept, and `requiresWhy` still gates both, so nothing that
   was exempt becomes graded by accident.

   WHAT THIS FILE CAN AND CANNOT SEE. It cannot measure pixels: the peek's
   height is `notifyColumnMaxHeightCss` and the wrap is the browser's, and
   `SimOverlay.foldLinesBelow` already owns the measured half. What it CAN see
   is the ratio the fold is being asked to absorb, which is a property of the
   ITEM and belongs with the item. 39 hidden lines behind a 2.5-line peek is not
   a fold; it is a document with a sentence on top of it.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * How many lines of `detailBg` a peek must be able to show before the WHY
 * counts as reachable ON THE GLASS rather than merely present in the object.
 *
 * NOT a reading-speed number and not a layout number — a RATIO floor, and it is
 * set from the frames rather than chosen. The four cut frames above hide 3, 8,
 * 15, 15 and 39 lines behind a peek showing between one and three; the shipped
 * budget at 852 × 393 is 161 px of column, and after the mirror lane
 * (`NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN`, adopted by `SimOverlay` in a later
 * round) it is 95.8 px — about five of the peek's eleven landscape lines gone,
 * which makes every number above WORSE, not better. So the floor is stated as
 * „the majority of the explanation, or all of it", i.e. the fold may hide less
 * than it shows.
 *
 * A CARD THAT FAILS THIS IS NOT BROKEN COPY — it is copy on the wrong surface.
 * The remedy is never to delete the explanation: it is that the peek prints a
 * SUMMARY it can finish and the sheet holds the rest, which is the arrangement
 * `briefingLineBg` / `briefingBodyBg` below already impose on the briefing and
 * which nothing imposes on a violation card.
 */
export const WHY_REACHABLE_MIN_VISIBLE_FRACTION = 0.5;

/**
 * Is this item's explanation reachable on the glass, given how many lines the
 * peek can actually print?
 *
 * `visibleLines` is what the surface reports — `SimOverlay.foldLinesBelow`'s
 * complement — and `detailLines` is what the item needs. Passed in rather than
 * derived here for the reason at the top of the block: this file may not guess
 * at a wrap.
 *
 * BOTH DIRECTIONS ARE LOAD-BEARING AND BOTH ARE PROVED IN THE TEST.
 *   false when a real explanation is mostly folded — the five frames above.
 *   TRUE when the item has no WHY to owe (`requiresWhy` is false: praise, a
 *     task line, the ribbon legend), because a predicate that failed those
 *     would flag every clean frame in the catalogue and be switched off within
 *     a round. That is the false-refusal half, and it costs exactly as much as
 *     the false pass: an alarm that fires on everything is an alarm nobody
 *     reads, and the graded step goes back behind the fold unnoticed.
 *   TRUE when nothing is folded at all (`visibleLines >= detailLines`),
 *     whatever the fraction.
 *
 * An unreadable count is FALSE — not true. A surface that cannot say how much
 * it is showing has not shown that the explanation arrived, and the direction
 * that costs a student is the one that assumes it did.
 */
export function whyIsReachable(
  item: SimOverlayItem,
  lines: { visibleLines: number; detailLines: number },
): boolean {
  if (!requiresWhy(item.kind)) return true;
  if (!hasWhy(item)) return false;
  const { visibleLines, detailLines } = lines;
  if (!Number.isFinite(visibleLines) || !Number.isFinite(detailLines)) return false;
  if (visibleLines < 0 || detailLines < 0) return false;
  // Nothing authored to fold, or nothing folded: the sentence arrived whole.
  if (detailLines === 0 || visibleLines >= detailLines) return true;
  return visibleLines >= detailLines * WHY_REACHABLE_MIN_VISIBLE_FRACTION;
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE BRIEFING'S TWO HALVES — AND WHY THEY LIVE HERE AND NOT IN THE SHELL.

   FOUNDER, 2026-08-14, frames from both orientations: „there are TWO copies of
   it on screen, in different styling, both cut." One card. `lineBg` was
   `briefingBg[0].textBg` and `detailBg` was `briefingBg.map(...)` — the WHOLE
   list, step 1 included — so `SimOverlay` printed the same 219 characters
   twice, bold and then grey-prefixed „1. ", and clamped both. The read sheet
   inherited it: its <h2> and its first body line were the same sentence.

   It was a one-line expression inside a 4 000-line component, which is exactly
   why six waves of measurement walked past it: there was nothing to assert
   against. It is two pure functions now, so `briefing-no-echo.test.ts` can put
   every compiled rung of all 167 shipped templates through them and fail on any
   scenario where the body starts repeating the line again.

   THE RULE, stated once: THE CARD MAY NEVER PRINT THE SAME SENTENCE TWICE.
   Not a layout preference — the peek's whole budget in landscape is 128 px,
   and 39–42 % of what it was being asked to hold was an echo.
   ═══════════════════════════════════════════════════════════════════════════ */

/** One authored step of `LessonSpec.briefingBg`. */
export interface BriefingStepBg {
  readonly n: number;
  readonly textBg: string;
}

/**
 * THE LINE: step 1, and it is step 1 by contract rather than by convenience.
 *
 * `scenario/compile.ts` puts a rung's complication at `briefingBg[0]` precisely
 * so that „the one sentence that says WHY the rung is harder is the one
 * sentence nobody can skip" — the line is the row that is always painted first
 * and cannot be scrolled away from. Changing which step lands here breaks that
 * delivery, so it is written down in both files.
 *
 * [MERGE NOTE, 2026-08-25 — THE THIRD LANE TO PROPOSE THE STRING PREFIX.]
 * A third independent repair lane arrived here wanting briefingLineBg to return
 * "N. text". Its frame evidence is right and its diagnosis is right; only the
 * PLACEMENT is wrong. A verifier measured that shape over 663 rungs: 29 move to
 * a worse fold band, 12 fall to ZERO body, 1,190 body characters lost — the
 * GRADED step among them, including the child-safety line on
 * sc-crossing-child-ball. Three characters of a 180 px window are not free.
 * The ordinal travels as data instead (briefingLineOrdinal, c61868b), so every
 * lane that files this defect gets its fix without the peek paying for it.
 *
 * ── …AND IT CARRIES ITS NUMBER, WHICH IT DID NOT — sweep w10, 2026-08-24 ────
 *
 * SIX ROWS, SIX LESSONS, ONE SENTENCE BETWEEN THEM: „Mobile briefing loses
 * step 1 — the opening sentence is a heading and the list starts at «2.»."
 * Filed on sc-ln-turn-lane-arrows, sc-ov-crest-curve, sc-ov-abort,
 * sc-ov-return-gap, sc-ov-being-overtaken and sc-ov-oncoming-gap; all six were
 * routed at `LessonPlayShell.tsx` and none of them is owned there.
 *
 * OPEN `w10-3/frames/sc-ln-turn-lane-arrows__mobile-right/02-briefing.png`.
 * The ИНСТРУКЦИИ sheet reads, top to bottom:
 *
 *   Потегли по булеварда. Стрелките на платното разпределят посоките: …
 *   2. Маршрутът ти е НАЛЯВО. Ти си в дясната лента — нейната стрелка не води…
 *   3. Прочети стрелките отдалеч и започни престрояването рано: …
 *
 * `SimOverlay`'s sheet paints `lineBg` in an <h2> and `detailBg` under it, so a
 * six-step procedure arrives as a heading plus «2.»…«6.». The desktop
 * `BriefingCard` prints `{s.n}.` on every row and reads 1–6 correctly, which is
 * why every one of the six rows says „the same scenario on PC renders 1–5
 * correctly" — the mismatch is the surface, not the content.
 *
 * WHY THE NUMBER RATHER THAN THE OTHER TWO REPAIRS. Renumbering the body from
 * 1 would make the body claim to be a different list (the paragraph below says
 * so, and it is right). Deleting the numbers everywhere would throw away the
 * only thing that tells a student the briefing is a SEQUENCE — «започни
 * престрояването рано» is worth nothing if he cannot tell it comes before
 * «заеми лявата лента». So the line joins the numbering it was always the head
 * of: `${n}. ` from the step's OWN `n`, never a hardcoded 1, for the same
 * reason the body is not renumbered.
 *
 * IT CANNOT RE-CREATE THE ECHO, AND THE REASON IS NOT THE ONE THIS BLOCK FIRST
 * CLAIMED. The first draft said the numbered line was made safe by teaching
 * `itemEchoesLine` to strip an ordinal from both sides. Counted afterwards:
 * `itemEchoesLine` has ZERO non-test call sites — its six mentions in
 * `LessonPlayShell.tsx` (1547, 1605, 1722, 1826, 3693, 3727) are all inside
 * comment blocks and it is not re-exported from `hud/index.ts`, so nothing the
 * student ever sees passes through it. What actually keeps the sentence from
 * being printed twice is `briefingBodyBg` starting the body at step 2, which
 * this change does not touch. The predicate was therefore left exactly as it
 * was: a repair to something no live path reaches is the shape this programme
 * keeps paying for, and one dressed as a safety argument for another repair is
 * worse than a useless one. `briefing-no-echo.test.ts` drives all 167 templates
 * × 4 rungs through `briefingLineBg` + `briefingBodyBg` and holds the rest.
 */
export function briefingLineBg(steps: readonly BriefingStepBg[]): string {
  // THE ORDINAL DOES NOT LIVE HERE, and THREE repair lanes put it here.
  //
  // Prefixing it into the line spends three characters of the peek fold budget.
  // Measured by a lane verifier over 663 rungs: 29 move to a worse band, 12 fall
  // to ZERO body, 1,190 body characters lost — and what those twelve stop showing
  // is the GRADED step, including the child-safety line on sc-crossing-child-ball.
  // No gate could see it: those scenarios sit outside the five files
  // briefing-card-budget.test.ts owns, so the full suite went green over it.
  //
  // The number travels as DATA instead — briefingLineOrdinal + SimOverlayItem
  // .lineOrdinal, landed c61868b — so the line stays exactly as long as it was.
  return steps.length > 0 ? steps[0]!.textBg : "";
}

/**
 * THE BODY: everything AFTER step 1, numbered as authored.
 *
 * The numbers are kept (2., 3., …) rather than renumbered from 1: the list is a
 * sequence whose first item is the bold sentence directly above it, and
 * renumbering would make the body claim to be a different list. Since
 * 2026-08-24 that sentence carries «1. » of its own, so the two halves finally
 * read as one 1…N procedure instead of a heading followed by a list that
 * starts at 2 — the six w10 rows quoted on `briefingLineBg`.
 *
 * `null` for a single-step briefing — there is then no second surface to offer,
 * and `SimOverlay` correctly renders no «ПРОЧЕТИ». No shipped template is in
 * that case (the step-count histogram over all 167 is {4:5, 5:118, 6:30, 7:12,
 * 8:2}), but a hand-written curriculum `LessonSpec` may be, and a control that
 * opens onto an empty sheet is worse than no control.
 */
export function briefingBodyBg(steps: readonly BriefingStepBg[]): string | null {
  if (steps.length < 2) return null;
  return steps
    .slice(1)
    .map((s) => `${s.n}. ${s.textBg}`)
    .join("\n");
}

/**
 * THE LINE'S NUMBER — the half of the split that was never delivered.
 *
 * `briefingBodyBg` keeps the authored numbering and therefore opens at „2.",
 * on the stated ground that item 1 is the bold sentence above it. Twenty-one
 * round-10 frames say the glass never told anybody that: the mobile sheet
 * paints an unnumbered lead and a list starting at two, while the pc panel
 * beside it numbers the same five steps 1–5. This returns the number the lead
 * IS, so the surface that shows the whole list can close the sequence.
 *
 * `null` for an empty briefing — the same guard `briefingLineBg` uses, and for
 * the same reason: there is no step 1 to name.
 *
 * It is `steps[0].n` and NOT the literal 1 deliberately. `compile.ts` owns
 * which step lands on the line; a hard-coded 1 would keep claiming „first"
 * through a change that made it something else, which is the failure mode the
 * contract note above `briefingLineBg` exists to prevent.
 */
export function briefingLineOrdinal(steps: readonly BriefingStepBg[]): number | null {
  return steps.length > 0 ? steps[0]!.n : null;
}

/**
 * …AND THE RULE ABOVE IS STATED FOR EVERY CARD AND ENFORCED FOR ONE.
 * Sweep 161, 2026-08-19.
 *
 * „THE CARD MAY NEVER PRINT THE SAME SENTENCE TWICE" is written six lines up
 * as a rule about cards. What actually guards it is `briefing-no-echo.test.ts`
 * driving the two functions above — i.e. the BRIEFING, one producer, one kind.
 * A rule with one enforced instance is a convention, and the frames found the
 * next producer immediately.
 *
 * `sc-vp-readiness/pc-right/01-arrival.png`, 1440 × 900, opened:
 *
 *   chip   «ЗАДАЧА 1/2 · Мини контролната зона с готов кокпит»
 *   box    «Мини контролната зона с готов кокпит — дръж под 50 км/ч»
 *
 * One sentence, printed twice in two registers, the second a superstring of the
 * first — and both laid over the interior rear-view mirror, so the echo is
 * costing the student the glass twice over. `sc-park-bay-exit-rev/pc-wrong/
 * 04-t028s.png` is the same pair for «Задача 2: подравни се по алеята…».
 *
 * WHAT THIS PREDICATE CAN AND CANNOT REACH. It judges ONE item — does its
 * `detailBg` open by repeating its own `lineBg` — which is the shape the
 * briefing had and the shape any future single card can have. The frame above
 * is the CROSS-PRODUCER case: the chip is the queue's `task` item and the box
 * is `ObjectiveBanner`'s own text, two surfaces neither of which can see the
 * other. That half is not closable from a pure predicate over one item and is
 * ROUTED, not dropped: the two producers must be handed one string, which is a
 * change in `components/sim/lesson-ui/LessonPlayShell.tsx` (where both are
 * mounted) — **not this lane's file**. This predicate is what that change would
 * then be checkable against.
 *
 * NORMALISATION IS DELIBERATELY MINIMAL — case and surrounding whitespace only.
 * Bulgarian punctuation carries meaning here („— дръж под 50 км/ч" is the
 * qualifier that makes the second string worth printing at all), and this file
 * has enough hand-kept near-copies of other people's rules already.
 *
 * ⚠ THE PREFIX MATCH NEEDS A WORD BOUNDARY, and the first draft of this
 * function did not have one. Written as a bare `startsWith`, it answered TRUE
 * for lineBg «Спри» against detailBg «Спринтирай към целта» — a genuine
 * elaboration flagged as an echo, i.e. this predicate producing the exact
 * false-refusal it exists to prevent, and it would have deleted teaching the
 * moment anything acted on it. It was caught by mutating the function and
 * finding that NOTHING went red, which is this programme's rule doing its job
 * on the code that was written to serve it: a test that passes equally before
 * and after guards nothing. The boundary is asserted in both directions in
 * `overlay-queue-moment.test.ts`.
 *
 * ⚠ AND IT IS REACHED BY NOTHING THE STUDENT SEES — counted 2026-08-24, when a
 * sweep tried to edit it. Six mentions in `LessonPlayShell.tsx` (1547, 1605,
 * 1722, 1826, 3693, 3727), every one inside a comment block; no re-export from
 * `hud/index.ts`; the only callers are `overlay-queue-moment.test.ts` and
 * `queueTaskEcho.test.ts`. It is a GATE PREDICATE, and the invariant it holds
 * is real — `queueTaskEcho` runs live shell rows through it — but it guards no
 * running code path, so a change to it fixes no frame. Written down here
 * because the w10 sweep spent a hunk on it believing the opposite.
 */
export function itemEchoesLine(item: Pick<SimOverlayItem, "lineBg" | "detailBg">): boolean {
  const line = item.lineBg.trim().toLocaleLowerCase("bg");
  const detail = (item.detailBg ?? "").trim().toLocaleLowerCase("bg");
  if (line === "" || detail === "") return false;
  // The briefing's own shape: the body opens with „1. " + the line, or with the
  // line bare. Both are the same defect — the reader sees the sentence twice
  // before anything new arrives.
  const stripped = detail.replace(/^\d+\.\s*/, "");
  if (stripped === line) return true;
  if (!stripped.startsWith(line)) return false;
  // …and the repeat must END where the line ends. Otherwise «Спри» matches
  // «Спринтирай», and a longer word that merely begins with the line is called
  // a duplicate of it.
  const next = stripped.charAt(line.length);
  return !/[\p{L}\p{N}]/u.test(next);
}

/* ═══════════════════════════════════════════════════════════════════════════
   RULE 4 HAD NO FUNCTION — SO THE SHELL WROTE IT TWICE AND THE TWO DIVERGED.

   CATALOGUE SWEEP 2026-08-17, ten BROKEN findings routed at this file. Rule 4
   at the top of this module — „Full-bleed is reserved for an EXPLICIT pause …
   Nothing arrives full-bleed on its own" — was prose. Rules 1 and 3 at least
   compile to `selectOverlay` and `overlayCentreBand`; rule 4 compiled to
   nothing, so every consumer had to restate it by hand, and `LessonPlayShell`
   restates it TWICE, 833 lines apart, for the two halves of the same question:

     line 3585  `paused={…}`      — must the CAR be frozen?      6 disjuncts
     line 2752  `pauseModalUp`    — may the QUEUE speak?         2 disjuncts

   Nothing said they were the same list, so they stopped being the same list.
   Laid side by side against the surfaces that actually take the screen:

     surface                    freezes the car   silences the queue
     ────────────────────────   ───────────────   ──────────────────
     micro-quiz                 yes               yes
     THEO-3 consequence card    yes               ONLY IF `mistakeMode`   ←
     «Меню на урока»            yes               NO                      ←←
     the overlay's own sheet    yes               no  (correct — same item)

   REPRODUCED TODAY, deployed build, WebKit, iPhone 16 landscape, the shipped
   harness (`tools/mobile/lesson-audit.mjs sc-hz-breakdown-pulloff mobile
   right`, frame `07b-menu.png`): the lesson menu is open, the cluster reads
   «0 км/ч D» — so the car IS frozen, `playMenuOpen` did its job — and the
   queue's own `warning` card «Контролна лампа: температура! / Спри спокойно
   вдясно» is painted live at the top right of the same frame, over an
   undimmed road. Two interaction layers on one screen, one of them
   instructing the student to pull over a car that cannot move.

   THE FIX IS NOT „ADD `playMenuOpen` TO THE OTHER LIST". That repairs this
   frame and leaves the shape that produced it: two hand-kept lists, no third
   thing that knows they are one list. So the census moves HERE, where rule 4
   is written, and both answers are DERIVED from it — `overlayQueueMaySpeak`
   and `overlayHoldsDrive` read the same table, so a surface added to one is
   in the other by construction and cannot be forgotten.

   WHAT IS DELIBERATELY NOT IN THE CENSUS, because both omissions look like
   holes and neither is:

     `ended` — a session PHASE, not a surface. The queue must keep speaking
       when the session ends: the `end` item IS how the verdict is delivered,
       and silencing the queue there would remove the «Резултат» chip that is
       the only route to the debrief on a phone.
     `teachQueue.length > 0` — the queue's OWN blocking item, named by its
       producer instead of by its property. That is what `blocking` and the
       new `held` below are for; see the block on `OverlaySelection.held`.
   ═══════════════════════════════════════════════════════════════════════════ */

/** A surface OUTSIDE the overlay queue that can take the drive screen. */
export type OverlayScreenOwner =
  /** A micro-quiz: asks a question and waits for the answer. */
  | "quiz"
  /** THEO-3 consequence card — „ето какво щеше да стане". */
  | "consequence"
  /** «Меню на урока» — the sheet behind МЕНЮ / ЗАТВОРИ. */
  | "playMenu"
  /** The overlay's OWN detail sheet («ПРОЧЕТИ» / «ЗАЩО» / «СПИСЪК»). */
  | "readSheet";

export interface OverlayScreenOwnerSpec {
  readonly id: OverlayScreenOwner;
  /** Who renders it — so the next reader can go and look. */
  readonly ownerFile: string;
  /**
   * Is this surface the overlay layer ITSELF?
   *
   * The one bit that is not uniform, and the reason the census cannot just be
   * a list of booleans. `readSheet` is the opened state of the very item the
   * queue selected: blanking the queue while it is up would delete the card
   * the sheet belongs to and, with it, the «Разбрах» that closes it. Every
   * other owner is a DIFFERENT owner, and two owners on one screen is the
   * defect. „One overlay at a time" has to mean across the whole layer.
   */
  readonly isQueueSurface: boolean;
}

/**
 * THE CENSUS. Exhaustive by type: a new `OverlayScreenOwner` that is not given
 * a row here is a `tsc` error, which is a stronger guard than any test — the
 * 2026-08-17 divergence existed precisely because nothing was exhaustive over
 * these four things.
 */
export const OVERLAY_SCREEN_OWNERS: Readonly<
  Record<OverlayScreenOwner, OverlayScreenOwnerSpec>
> = {
  quiz: {
    id: "quiz",
    ownerFile: "components/sim/lesson-ui/LessonPlayShell.tsx (activeQuiz)",
    isQueueSurface: false,
  },
  consequence: {
    id: "consequence",
    ownerFile: "components/sim/lesson-ui/LessonPlayShell.tsx (consequence)",
    isQueueSurface: false,
  },
  playMenu: {
    id: "playMenu",
    ownerFile: "components/sim/lesson-ui/LessonPlayShell.tsx (PlayMenu, playMenuOpen)",
    isQueueSurface: false,
  },
  readSheet: {
    id: "readSheet",
    ownerFile: "modules/sim/hud/SimOverlay.tsx (overlaySheetOpen)",
    isQueueSurface: true,
  },
} as const;

/** Does this owner take the screen away from the queue, or is it the queue? */
export function overlaySilencesQueue(owner: OverlayScreenOwner): boolean {
  return !OVERLAY_SCREEN_OWNERS[owner].isQueueSurface;
}

/**
 * May the queue paint at all?
 *
 * This is `LessonPlayShell`'s `pauseModalUp`, inverted and complete. Passing
 * `[]` — nothing owns the screen — is the ordinary drive.
 */
export function overlayQueueMaySpeak(owners: readonly OverlayScreenOwner[]): boolean {
  return !owners.some(overlaySilencesQueue);
}

export interface OverlaySelection {
  /** The ONE overlay on screen, or null when the road is clean. */
  active: SimOverlayItem | null;
  /** How many non-ambient items are waiting behind it (the „+N" badge). */
  queued: number;
  /** Everything except `active`, in priority order — for tests and debugging. */
  waiting: SimOverlayItem[];
  /**
   * MUST THE DRIVE BE FROZEN FOR THIS SELECTION? — 2026-08-17.
   *
   * `SimOverlayItem.blocking` says, in this file, „the item holds the drive
   * frozen until it is acknowledged". NOTHING READ IT. `paused` freezes the
   * car for `teachQueue.length > 0` — the teach moment named by its PRODUCER —
   * so the one other item that ships `blocking: true`, the briefing card at
   * `LessonPlayShell` line ~2986, has been declaring a pause that never
   * happened.
   *
   * MEASURED, same harness run (`sc-ac-rain-lights mobile right`):
   *
   *   [01-arrival]  0 км/ч   card=warning/peek
   *
   * At arrival the briefing (`kind: "hint"`, priority 60, `blocking: true`)
   * and an armed telltale (`kind: "warning"`, priority 70) are both candidates
   * and PRIORITY alone decides, so the warning takes the glass and the
   * briefing's «Разбрах» — the only control that clears it — is not on screen.
   * The drive is not frozen, so the student drives away from an instruction he
   * never dismissed; `briefingOpen` is `useState(true)` closed only by that
   * ack, so the card is a candidate for the rest of the session and returns
   * every time the warning's 5 s TTL lapses. That is the sweep's „the
   * instructions card is still open 13 seconds into the drive" (sc-vp-stall),
   * „identical panel 105 seconds later" (sc-ac-rain-lights) and „the coaching
   * state never advances … at t=180 s the cluster reads 49 км/ч"
   * (sc-ed-reverse-line) — one mechanism, three frames.
   *
   * So `held` is computed over ALL candidates and not over `active`: a
   * blocking item that lost the priority contest still holds the drive. That
   * is the whole point of the field — if it only reported on the item that
   * happens to be painted, it would report exactly the state above as „not
   * held", which is the frame this is written against.
   */
  held: boolean;
}

/**
 * MUST THE CAR BE FROZEN? — the other half of the census, same table.
 *
 * This is `LessonPlayShell`'s `paused`, less the `ended` phase which is not a
 * surface. Every owner freezes the drive (that is what „owns the screen"
 * means, and it is why `isQueueSurface` gates only the SILENCING half), and so
 * does a blocking item still waiting for its acknowledgement.
 */
export function overlayHoldsDrive(
  owners: readonly OverlayScreenOwner[],
  selection: OverlaySelection,
): boolean {
  return owners.length > 0 || selection.held;
}

export interface SelectOverlayOptions {
  /**
   * Which non-queue surfaces currently own the screen. Default `[]` — the
   * ordinary drive, and the behaviour every existing call site already has.
   */
  screenOwners?: readonly OverlayScreenOwner[];
}

/**
 * Pick the one overlay that gets the screen.
 *
 * Stable: equal priority keeps caller order, so the newest toast (which the
 * caller unshifts) wins over an older one of the same kind, and a re-render
 * with unchanged inputs cannot make the line flicker between two items.
 *
 * `screenOwners` is rule 4, applied: while a DIFFERENT surface owns the drive
 * screen the queue says nothing — no active item, nothing counted. `held` is
 * still answered honestly, because the car must stay frozen for a blocking
 * item whether or not the menu on top of it lets that item be painted.
 */
export function selectOverlay(
  candidates: ReadonlyArray<SimOverlayItem | null | undefined>,
  options: SelectOverlayOptions = {},
): OverlaySelection {
  const items = candidates.filter((c): c is SimOverlayItem => c != null);
  // Over ALL candidates, and before the gate below — see `OverlaySelection.held`.
  const held = items.some((i) => i.blocking === true);

  if (!overlayQueueMaySpeak(options.screenOwners ?? [])) {
    return { active: null, queued: 0, waiting: [], held };
  }
  if (items.length === 0) return { active: null, queued: 0, waiting: [], held };

  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) =>
      PRIORITY[b.item.kind] - PRIORITY[a.item.kind] || a.index - b.index,
    )
    .map((e) => e.item);

  const [active, ...waiting] = ordered;
  return {
    active,
    queued: waiting.filter((i) => !AMBIENT.has(i.kind)).length,
    waiting,
    held,
  };
}
