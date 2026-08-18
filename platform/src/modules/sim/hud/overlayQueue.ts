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
  /** Called when the student acknowledges/dismisses. Ignored by the pure selector. */
  onAck?: () => void;
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
 */
export function briefingLineBg(steps: readonly BriefingStepBg[]): string {
  return steps.length > 0 ? steps[0]!.textBg : "";
}

/**
 * THE BODY: everything AFTER step 1, numbered as authored.
 *
 * The numbers are kept (2., 3., …) rather than renumbered from 1: the list is a
 * sequence whose first item is the bold sentence directly above it, and
 * renumbering would make the body claim to be a different list.
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
