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

/**
 * Narrowest viewport the product supports, px — iPhone SE / small Android in
 * portrait. Every HUD card must fit HERE, not merely on the founder's phone.
 */
export const NARROWEST_VIEWPORT_PX = 320;

/** The founder's own device width, px — the frame the photo was taken on. */
export const FOUNDER_VIEWPORT_PX = 393;

/** Widest a HUD card may be on a `viewportWidthPx`-wide screen. */
export function hudCardMaxWidthPx(viewportWidthPx: number): number {
  return Math.max(0, viewportWidthPx - HUD_CARD_SIDE_GUTTER_PX * 2);
}

/**
 * Does a card that DECLARES `declaredWidthPx` still fit? The clamp means the
 * rendered width is `min(declared, max)`, so this asks the only question worth
 * asking: is the declaration itself honest, or is it relying on the clamp to
 * rescue it (which silently shrinks a card designed to be readable)?
 */
export function hudCardFitsViewport(
  declaredWidthPx: number,
  viewportWidthPx: number,
): boolean {
  return declaredWidthPx <= hudCardMaxWidthPx(viewportWidthPx);
}

/** What the card actually renders at, once the clamp is applied. */
export function hudCardRenderedWidthPx(
  declaredWidthPx: number,
  viewportWidthPx: number,
): number {
  return Math.min(declaredWidthPx, hudCardMaxWidthPx(viewportWidthPx));
}

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
 * The column the roomy HUD paints: quiet-suppressed kinds removed, then
 * clipped to the capacity. Newest first — `useHudToastQueue` unshifts, and the
 * card a student is most likely to still be reading is the one that just
 * arrived.
 */
export function visibleToasts<T extends { event: { kind: string } }>(
  toasts: readonly T[],
  quiet: boolean,
): T[] {
  return toasts
    .filter((t) => !quietSuppresses(t.event.kind, quiet))
    .slice(0, toastCapacity(quiet));
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
 * so a roomy student who skipped is NEVER left with no way back to the WHY,
 * and (because `held` forces the debrief open) the bar can never summarise a
 * verdict the calibration gate is still hiding.
 */
export function shouldShowEndBar(v: DebriefVisibility): boolean {
  return v.ended && !v.compact && !shouldShowDebrief(v);
}
