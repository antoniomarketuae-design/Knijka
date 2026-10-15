/**
 * hudPreferences — the DESKTOP half of the notification rework (doc 86 · L14,
 * L15). Pure: no React, no DOM at module scope, so every rule below is
 * assertable in the node-environment vitest suite.
 *
 * WHY THIS FILE EXISTS. The mobile wave (`overlayQueue.ts`, 2026-07-29) gave
 * phones one overlay at a time, a 12 % screen budget and Space/Enter/tap
 * acknowledgement. **It never touched the roomy path**, which is the surface
 * the founder actually reviewed on — and his words about that surface were
 * „those pop ups that appear on the right up of the screen … they need to be
 * able to be removed when clicked with the mouse … currently they are much much
 * annoying, important but annoying, we need a complete rework". Doc 86 L14
 * pins the state he saw: `HudToasts` rendered the whole column
 * `pointer-events-none`, every card `w-72` (288 px), up to `MAX_VISIBLE = 4`
 * of them stacked, expiring only on a TTL. Four × 288 px is 1152 px of card —
 * on a 1280 px laptop that is 90 % of the width of the frame, and not one pixel
 * of it could be clicked away.
 *
 * THE THREE RULES THIS MODULE FIXES, in the same order the mobile file states
 * its own:
 *
 *  1. TWO, NOT FOUR. A toast column is a hint, not a feed. Two cards is the
 *     most a driver can read while the car is moving, and the third arriving
 *     card is precisely the one that proves nobody read the first.
 *  2. NARROWER. 288 px → 240 px (`w-60`). Combined with rule 1 the worst case
 *     falls from 1152 px to 480 px of card width — 37.5 % of a 1280 px frame
 *     instead of 90 %, and `TOAST_COLUMN_MAX_FRACTION` is the budget the test
 *     holds it to, the desktop analogue of `OVERLAY_PEEK_MAX_FRACTION`.
 *  3. DISMISSIBLE. Click removes a card; the column keeps a „изчисти" control
 *     while more than one is up. Mouse only, deliberately — see the note on
 *     Space below.
 *
 * SPACE IS NOT BOUND HERE, AND THAT IS A DECISION, NOT AN OMISSION.
 * `engine/input.ts:223` makes Space the stateful PARKING-BRAKE toggle, live
 * for the whole drive. `SimOverlay` and `TeachMomentOverlay` may hijack it
 * because they only ever do so while the car is held still by a blocking item.
 * A violation toast fires mid-corner with the car moving, so binding Space to
 * „dismiss the toast" would yank the handbrake at 50 km/h. The founder asked
 * for Space on the END-OF-LESSON popup (L15), where the drive is already over
 * and the scene is paused — that is where it is wired, and only there.
 *
 * THEO-4 (requirement zero) SURVIVES ALL OF IT. „По-тихи известия" drops
 * PRAISE, never a teaching card: a violation and a lesson toast both carry the
 * authored explanation + law chip, and those are the reason the toast exists at
 * all. `QUIET_SUPPRESSED_KINDS` is the whole of what quiet mode removes, and
 * `hudToastCarriesWhy` is the predicate the test uses to prove nothing with a
 * WHY is ever in that set. Same for the session-end setting: turning the
 * debrief off makes it stop opening BY ITSELF; the verdict bar that replaces it
 * always carries „Виж разбора", so the student is never left with a bare
 * pass/fail and no route to the explanation.
 */

// ---------------------------------------------------------------------------
// Persisted settings (parsing kept pure and testable here — the advisor
// setting in lessons/advisor.ts is the precedent this mirrors on purpose)
// ---------------------------------------------------------------------------

/** localStorage key of „По-тихи известия" (the roomy toast column). */
export const TOAST_QUIET_STORAGE_KEY = "aidrive.sim.toasts.quiet.v1";

/** localStorage key of „Показвай разбора автоматично" (the end-of-lesson popup). */
export const SESSION_END_AUTO_STORAGE_KEY = "aidrive.sim.sessionEnd.auto.v1";

/** Nothing stored → the column behaves as before, minus the L14 defects. */
export const TOAST_QUIET_DEFAULT = false;

/** Nothing stored → the debrief still opens itself. Opt-OUT, never opt-in. */
export const SESSION_END_AUTO_DEFAULT = true;

/** localStorage key of „Инструкции при старт" (the lesson's authored steps). */
export const BRIEFING_AUTO_STORAGE_KEY = "aidrive.sim.briefing.auto.v1";

/**
 * THE ONE SETTING WHOSE DEFAULT DIFFERS BY SURFACE, AND WHY IT IS ALLOWED TO.
 *
 * FOUNDER RULING 2026-09-20, quoted because it is not one of the three options
 * it was asked to choose between: «In fact all this is causing huge issue for
 * phone since its not working properly and its taking alot of space on the
 * screen to we have to hide it and make it optional if the user wants it on».
 *
 * So the phone does not open the briefing by itself and the roomy stage still
 * does. That divergence is DELIBERATE and it is the opposite of what the rows
 * that prompted the question asked for — `sc-signal-hesitation:f5ffccf3` and
 * the briefing clause of `sc-rb-busy-gap:7bbdd45e` /
 * `sc-sig-controller-postures:f7e046c4` all complain that the two platforms
 * behave differently. They were put to the founder in those terms and he ruled
 * for the phone's screen space: a side panel on a 1440 px stage costs nobody
 * any world, and a card that eats a 393 px one costs the student the road.
 *
 * IT IS A DEFAULT AND NOT A DELETION, which is what keeps THEO-4 intact. The
 * authored steps ARE the lesson's instructions; a drive that cannot reach them
 * is a bare task with no explanation. They stay one tap away for the whole
 * drive through the МЕНЮ row «Инструкции · N стъпки» (`recallBriefing` in
 * LessonPlayShell), which is present on the compact surface from arrival to the
 * end of the session and carries its own step count.
 */
export const BRIEFING_AUTO_DEFAULT_ROOMY = true;
export const BRIEFING_AUTO_DEFAULT_COMPACT = false;

/** The surface's default, before any stored choice is consulted. */
export function briefingAutoDefault(compact: boolean): boolean {
  return compact ? BRIEFING_AUTO_DEFAULT_COMPACT : BRIEFING_AUTO_DEFAULT_ROOMY;
}

/**
 * Does the briefing open by itself at the start of this lesson?
 *
 * PURE, AND TAKING THE STORED VALUE AS AN ARGUMENT rather than reading the
 * store itself, so every branch is executable in the node-environment suite. A
 * predicate that can only be exercised through `window.localStorage` ends up
 * asserted by a source grep, and a source grep passes against a shell that has
 * stopped calling it.
 */
export function briefingOpensAtStart(compact: boolean, stored: unknown): boolean {
  return parseStoredFlag(stored) ?? briefingAutoDefault(compact);
}

/** Parse a persisted on/off flag; null = nothing stored / foreign value. */
export function parseStoredFlag(v: unknown): boolean | null {
  if (v === "on") return true;
  if (v === "off") return false;
  return null;
}

/** Wire format of a persisted flag (round-trips `parseStoredFlag`). */
export function serializeFlag(on: boolean): "on" | "off" {
  return on ? "on" : "off";
}

/**
 * Read a persisted flag, falling back to `fallback` on SSR, on a foreign
 * value, and on a throwing localStorage (Safari private mode). Safe as a lazy
 * `useState` initializer: the play shell mounts client-side only.
 */
export function readStoredFlag(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    return parseStoredFlag(window.localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Read a persisted flag WITHOUT a fallback: `null` = nothing stored, a foreign
 * value, SSR, or a throwing store. For a setting whose default depends on a
 * fact the first render does not know yet (the briefing's per-surface default,
 * `briefingStart.ts`), the default must be applied LATER, against the resolved
 * value — folding it in here would freeze the first render's guess.
 */
export function readStoredFlagOrNull(key: string): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    return parseStoredFlag(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

/** Persist a flag; a throwing store leaves the in-memory value in charge. */
export function writeStoredFlag(key: string, on: boolean): void {
  try {
    window.localStorage.setItem(key, serializeFlag(on));
  } catch {
    // Private mode etc. — this session still honours the choice.
  }
}

// ---------------------------------------------------------------------------
// The toast column budget
// ---------------------------------------------------------------------------

/** Card width in px — `w-60`. Was `w-72` (288 px) before doc 86 L14. */
export const TOAST_CARD_WIDTH_PX = 240;

// ---------------------------------------------------------------------------
// THE VIEWPORT CLAMP — „a card wider than the phone", founder photo
// `photo_2026-07-29_08-22-13 (2).jpg`.
//
// WHAT THE PHOTO SHOWS, described from the pixels and not from memory: the
// violation card is anchored to the RIGHT edge of the screen and runs off the
// LEFT one. The severity label reads «АСНА ГРЕШКА» — the «ОП» is gone. The
// title reads «ътнотранспортно произшествие», the body «астъпи сблъсък… о
// сесията се оценява като прекратена». The teach card below it loses its left
// edge the same way («аркираната», «воята лента») AND runs off the right.
// The stage carries `overflow-hidden` (LessonPlayShell), so anything wider than
// it is simply cut — silently, with no scrollbar and no wrap. A student cannot
// read the rule he just broke.
//
// (Scale, so the numbers here can be checked: the image is 591 px wide; the
// card's `rounded-2xl` corner measures 24 image px and its `p-3` padding 18, so
// 1 CSS px ≈ 1.5 image px and the viewport is ≈ 393 CSS px. That is the founder's
// phone in portrait, which is why 393 is named below.)
//
// WHY A DECLARED WIDTH IS NOT ENOUGH. `w-60` is 240 px and 240 < 393, so on
// paper the card fits — and that is exactly the reasoning that let this ship.
// A box gets wider than its declaration for three reasons this HUD meets every
// day:
//   · a Bulgarian compound with no break opportunity («Пътнотранспортно») is
//     one unbreakable word; without `break-words` it punches out of the content
//     box and is clipped by the stage even when the BOX fits;
//   · the narrow end of the device ladder is 320 px, not 393 — a 240 px card
//     plus its gutters is 264 px there, and the next card somebody adds may not
//     be 240;
//   · the roomy HUD is reachable on a phone-shaped viewport. `useCompactHud`
//     requires `matchMedia("(pointer: coarse)")` to MATCH; a browser that does
//     not report the `pointer` feature, or a stylus/trackpad device, keeps the
//     desktop grammar at 393 px wide.
//
// So the clamp is expressed against the VIEWPORT, not against a breakpoint or a
// layout mode. `calc(100vw - 1.5rem)` is „the screen, minus the 12 px gutter on
// each side" — the same 12 px the column is positioned at (`right-3`). It can
// only ever bite on a viewport narrower than 264 px; on every real device the
// rendered width is unchanged, which is the point: this is a floor under the
// layout, not a redesign of it.
// ---------------------------------------------------------------------------

/** Gutter a HUD card keeps on each side of the screen, px (`right-3`/`left-3`). */
export const HUD_CARD_SIDE_GUTTER_PX = 12;

/**
 * The hard cap, as the Tailwind class the cards carry. Written once here so the
 * arithmetic below, the components, and `__tests__/hud-card-fit.test.ts` cannot
 * drift apart.
 */
export const HUD_CARD_MAX_WIDTH_CLASS = "max-w-[calc(100vw-1.5rem)]";

/** Widest a HUD card may be on a `viewportWidthPx`-wide screen — the px form of
 *  the class above, so the gate and the cards read one number. */
export function hudCardMaxWidthPx(viewportWidthPx: number): number {
  return Math.max(0, viewportWidthPx - HUD_CARD_SIDE_GUTTER_PX * 2);
}

/* ─────────────────────────────────────────────────────────────────────────────
   FOUR SYMBOLS MOVED OUT OF THIS FILE — 2026-08-26, and where they went says
   what they were: `NARROWEST_VIEWPORT_PX`, `FOUNDER_VIEWPORT_PX`,
   `hudCardFitsViewport` and `hudCardRenderedWidthPx` now live at the top of
   `__tests__/hud-card-fit.test.ts`.

   They were never re-exported from `hud/index.ts`, so by doc 05 nothing outside
   this file could call them even in principle — and inside it, nothing did.
   Their one importer was the gate that scans every HUD `.tsx` for an over-wide
   declaration, which is a real and valuable gate and is untouched: a device
   ladder and a „does this declaration fit" predicate are the QUESTIONS A GATE
   ASKS, not values the running HUD reads. The HUD's own answer is a CSS clamp
   (`HUD_CARD_MAX_WIDTH_CLASS`) applied by the cards themselves; nothing in the
   product ever computes a fit at runtime, because nothing in the product knows
   the viewport width in TypeScript.

   Left here on purpose: `hudCardMaxWidthPx`, because it is the px reading of
   the shipped clamp and TWO test files (this gate and `notify-column`) hold the
   column against it, so it is the one shared number of the five.
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Tailwind classes that must stay in step with `TOAST_CARD_WIDTH_PX`.
 *
 * `break-words` (`overflow-wrap: break-word`) is load-bearing, not tidying: it
 * is what stops «Пътнотранспортно» from overhanging a 216 px content box and
 * being cut by the stage. The clamp keeps the BOX inside the screen; this keeps
 * the WORDS inside the box. The photo needed both.
 */
export const TOAST_CARD_WIDTH_CLASS = `w-60 ${HUD_CARD_MAX_WIDTH_CLASS} break-words`;

/** Stacked cards at once. Was 4. */
export const TOAST_MAX_VISIBLE = 2;

/** …and one while „по-тихи известия" is on. */
export const TOAST_QUIET_MAX_VISIBLE = 1;

/**
 * The desktop analogue of `OVERLAY_PEEK_MAX_FRACTION`: the toast column may
 * never charge more than this share of the frame's WIDTH. 0.4 is the ceiling
 * the shipped numbers must clear with room to spare (240 px at the narrowest
 * roomy frame the shell allows), not a target to grow into.
 */
export const TOAST_COLUMN_MAX_FRACTION = 0.4;

/**
 * Narrowest frame the shell still calls ROOMY: `isCompactViewport`
 * (`components/sim/lesson-ui/immersive.ts:64`) sends anything ≤ 640 px wide to
 * the compact grammar, so 641 px is the worst case the toast column must fit.
 * Repeated as a literal rather than imported: `modules/**` may not reach into
 * `components/**` (docs/architecture/05).
 */
export const ROOMY_MIN_WIDTH_PX = 641;

/** Share of a `viewportWidthPx`-wide frame the column occupies. */
export function toastColumnFraction(viewportWidthPx: number): number {
  if (viewportWidthPx <= 0) return 1;
  return TOAST_CARD_WIDTH_PX / viewportWidthPx;
}

/** How many cards may stand at once. */
export function toastCapacity(quiet: boolean): number {
  return quiet ? TOAST_QUIET_MAX_VISIBLE : TOAST_MAX_VISIBLE;
}

/** The HudEvent kinds that actually render as a card. */
export type HudToastKind = "violation" | "commendation" | "lesson";

/**
 * Kinds quiet mode removes. EXACTLY ONE ENTRY, and it is the one with no
 * authored WHY behind it — „Браво" is a single title line (HudToasts.tsx's
 * commendation card renders no `explanationBg` and no `lawRef`). Adding
 * "violation" or "lesson" here would silence the law-cited explanation at the
 * moment of the mistake, which is THEO-4's requirement zero, so the test in
 * `__tests__/hud-preferences.test.ts` asserts this set against
 * `hudToastCarriesWhy` rather than against a literal.
 */
export const QUIET_SUPPRESSED_KINDS: ReadonlySet<string> = new Set<string>(["commendation"]);

/** True when this toast kind is a teaching artefact (title + WHY + law chip). */
export function hudToastCarriesWhy(kind: string): boolean {
  return kind === "violation" || kind === "lesson";
}

/** True when quiet mode is allowed to drop this event entirely. */
export function quietSuppresses(kind: string, quiet: boolean): boolean {
  return quiet && QUIET_SUPPRESSED_KINDS.has(kind);
}

/**
 * THE CARD WHOSE «ЗАЩО» THE STUDENT HAS OPEN — sc-roundabout-entry:fe081cf1,
 * the clauses rig-w3d left open (2026-10-12), round 2 (2026-10-13).
 *
 * `id` is the toast's own id (`HudToast.id`). `held` says the column's standing
 * things ABOVE the stack have given way to it (the advisor's card waits) —
 * measured by `HudToasts.useToastReader`, latched until the explanation is
 * closed or its card leaves. Which CARDS are on the glass no longer depends on
 * it: see `visibleToasts`.
 */
export interface ToastReading {
  id: number;
  held: boolean;
}

/** The cards quiet mode lets through, in queue order (newest first). */
function audibleToasts<T extends { event: { kind: string } }>(
  toasts: readonly T[],
  quiet: boolean,
): T[] {
  return toasts.filter((t) => !quietSuppresses(t.event.kind, quiet));
}

/**
 * The column the roomy HUD paints: quiet-suppressed kinds removed, then
 * clipped to the capacity. Newest first — `useHudToastQueue` unshifts, and the
 * card a student is most likely to still be reading is the one that just
 * arrived.
 *
 * AN EXPLANATION THE STUDENT ASKED FOR OWNS THE STACK WHILE IT IS OPEN
 * (integrator decision W1, 2026-10-13). `reading` is the card whose «Защо» is
 * open; while it is in the column it is the ONE card painted, in quiet mode and
 * out of it. Round 1 ADDED it beside the newest cards, and the round-1 verifier
 * measured what that costs on the rig's own stage: a second fault's 116.5 px
 * card arriving on top pushed the opened paragraph 124.5 px down and cut it
 * 93.7 px, law chip 89.7 px out — and in quiet mode it painted two cards under
 * a toggle whose tooltip says «едно по едно». So nothing arrives on top of it
 * and nothing stands under it:
 *   · every other card is off the glass. A card that carries a WHY — a graded
 *     fault or a «Научи» card (`hudToastCarriesWhy`), what the student is
 *     judged and taught by — WAITS: its clock stopped and the queue's cap
 *     unable to touch it (`useHudToastQueue.holdAllBut`), until the column
 *     paints it again after the opened card is closed, dismissed or out of
 *     reading time; it is announced on the opened card by the count
 *     `waitingToasts` returns. Praise keeps its own clock and may leave unread
 *     (integrator decision W5, round 3 — see „NOTHING THE STUDENT IS JUDGED BY
 *     IS LOST" in `HudToasts.tsx`);
 *   · with nothing open (`null`, the default) the answer is the one this
 *     function has always given.
 * A reading id that is not in the column (expired, dismissed, praise in quiet
 * mode) changes nothing.
 */
export function visibleToasts<T extends { id?: number; event: { kind: string } }>(
  toasts: readonly T[],
  quiet: boolean,
  reading: ToastReading | null = null,
): T[] {
  const audible = audibleToasts(toasts, quiet);
  if (reading !== null) {
    const opened = audible.find((t) => t.id === reading.id);
    if (opened !== undefined) return [opened];
  }
  return audible.slice(0, toastCapacity(quiet));
}

/**
 * How many cards are waiting behind the one being read — the «+N» the opened
 * card prints (`HudToasts`; the phone card's own badge). The cards that carry
 * a WHY (`hudToastCarriesWhy`) other than the opened one: each is in the queue
 * with its clock stopped and comes back when the explanation is closed. Praise
 * is not counted (round 3, W5): its clock keeps running and it may be gone by
 * then, and «още N известия» may only count what will still be there. Zero
 * with nothing open, and zero when the reading id is not in the column.
 */
export function waitingToasts<T extends { id?: number; event: { kind: string } }>(
  toasts: readonly T[],
  quiet: boolean,
  reading: ToastReading | null,
): number {
  if (reading === null) return 0;
  const audible = audibleToasts(toasts, quiet);
  if (!audible.some((t) => t.id === reading.id)) return 0;
  return audible.filter((t) => t.id !== reading.id && hudToastCarriesWhy(t.event.kind)).length;
}

// ---------------------------------------------------------------------------
// The end-of-lesson debrief (L15)
// ---------------------------------------------------------------------------

/** «Space = пропусни» — the visible note the founder asked for, in one place. */
export const SESSION_END_SKIP_HINT_BG = "Space = пропусни";

export interface DebriefVisibility {
  /** The session is over AND a result exists to show. */
  ended: boolean;
  /** Phone-shaped viewport: the debrief has always been tap-to-open there. */
  compact: boolean;
  /** The student explicitly opened it („Резултат" / „Виж разбора"). */
  expanded: boolean;
  /** The student skipped it this session (Space, „Пропусни", ✕). */
  skipped: boolean;
  /** Persisted „Показвай разбора автоматично". */
  autoOpen: boolean;
  /**
   * I1 „Позна ли се?" is holding the result back (`isResultScreenHeld`). This
   * is a REQUIRED step, not a debrief: the screen renders only the calibration
   * gate, there is no verdict on it yet, and therefore nothing to skip. It
   * outranks the preference — otherwise a student who once switched the popup
   * off would silently never be asked to self-assess again.
   */
  held: boolean;
  /**
   * AN EXPLANATION THE STUDENT OPENED IS STILL ON THE GLASS (integrator decision
   * W3, 2026-10-13 — `HudToasts.useToastReader`'s `reading !== null`). Roomy
   * only: the phone's «Защо» is a paused sheet. Optional, and absent means
   * nobody is reading, so every caller written before W3 gets the answer it
   * always got. See `shouldShowDebrief`.
   */
  reading?: boolean;
}

/**
 * Does the full-frame debrief render?
 *
 * Compact was already correct (open only on request) and stays untouched.
 * Roomy: auto-open unless the student turned that off, and an explicit skip
 * always wins over the auto-open — but an explicit OPEN always wins over the
 * skip, which is what makes „Виж разбора" work after a skip.
 */
export function shouldShowDebrief(v: DebriefVisibility): boolean {
  if (!v.ended) return false;
  if (v.expanded) return true;
  if (v.compact) return false;
  // W3 — THE END SCREEN DOES NOT TAKE AN OPENED EXPLANATION AWAY MID-READ. The
  // full-frame debrief is opaque and covers the notify column; the rig cell
  // (pc-L3-F-ON-WHY, frame 31) photographed it replacing the stage 7.85 s into
  // a paragraph the product's own reading rule gives 21.5 s. So while that card
  // is still up the popup WAITS — and `shouldShowEndBar`, its complement, puts
  // the end bar on the glass instead: the student is told the session is over,
  // and «Виж разбора» opens this screen at once (`expanded`, two lines up,
  // outranks the wait). BOUNDED by the card's own life: the queue removes it
  // when its reading time is over, `reading` goes false and the screen opens
  // exactly as it would have. It outranks `held` on purpose — the I1 gate is
  // still the first thing on the screen when it opens, and the bar prints no
  // verdict while the gate holds one (`endBarVerdictHidden`).
  // NOTHING GRADED READS THIS: the session ended, was folded and was sent when
  // and as it always was; this decides only when an overlay is painted.
  if (v.reading === true) return false;
  if (v.held) return true;
  return v.autoOpen && !v.skipped;
}

/**
 * COMPACT · A2 — does the end-of-session LINE demand an answer?
 *
 * On a phone the debrief has never opened itself, so „Показвай разбора
 * автоматично" had nothing to switch off there and the whole of L15 was
 * withheld from the device the founder reviews on. What DOES pop up by itself
 * on a phone is the end-of-session overlay line with `blocking: true`: it holds
 * the layer and its only control is „Резултат", which opens the very debrief
 * the student is trying to get past. That is the phone's popup, and this
 * predicate is what the setting governs.
 *
 * `held` outranks everything: the I1 calibration gate is a required step, so
 * while it holds the result the line blocks whatever the preference says —
 * otherwise a student who once turned the popup off would silently never be
 * asked to self-assess again.
 *
 * When it returns false the line STAYS on the glass (a verdict is not a thing
 * to hide) but becomes an ordinary dismissible notification — and THEO-4 is
 * carried by the shell adding „Виж разбора" to the micro menu for the whole
 * ended session, so the law-cited explanation is one tap away from anywhere.
 */
export function endLineDemandsAnswer(v: {
  /** I1 „Позна ли се?" is holding the result back. */
  held: boolean;
  /** Persisted „Показвай разбора автоматично". */
  autoOpen: boolean;
  /** The student skipped the debrief in THIS session. */
  skipped: boolean;
}): boolean {
  if (v.held) return true;
  return v.autoOpen && !v.skipped;
}

/**
 * Does the roomy verdict bar (the thing that replaces the popup) render?
 * Exactly the complement of `shouldShowDebrief` on a roomy, ended session —
 * so a roomy student who skipped is NEVER left with no way back to the WHY.
 *
 * Until W3 `held` always forced the debrief open, so the bar could never be up
 * while the calibration gate was hiding a verdict. It now can — for as long as
 * an opened explanation is being read (`reading`) — and what it may print then
 * is `endBarVerdictHidden`'s to say.
 */
export function shouldShowEndBar(v: DebriefVisibility): boolean {
  return v.ended && !v.compact && !shouldShowDebrief(v);
}

/**
 * THE BAR MAY NOT LEAK WHAT THE I1 GATE IS HOLDING BACK. While «Позна ли се?»
 * holds the result (`held`) the bar prints no verdict word and no points — the
 * phone's end line has always obeyed the same rule («the line must not leak
 * the score it is about to ask you to predict») and since W3 the bar can stand
 * in the same state. Pure, so the shell's markup and the gate ask ONE question.
 */
export function endBarVerdictHidden(v: Pick<DebriefVisibility, "held">): boolean {
  return v.held;
}

/**
 * What both end surfaces say while the I1 gate holds the verdict: the phone's
 * end line (since the gate shipped) and, since W3, the roomy end bar. One
 * string, so the two cannot drift.
 */
export const SESSION_END_HELD_LINE_BG = "Сесията завърши — първо се самооцени";
