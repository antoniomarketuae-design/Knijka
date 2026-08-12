/**
 * WHEN THE SIMULATOR STOPS BEING A PAGE AND BECOMES AN INSTRUMENT.
 *
 * FOUNDER REVIEW 2026-07-28 (iPhone 16, LANDSCAPE — his best case). Measured
 * off his three frames, before the road got a single pixel:
 *
 *     Safari chrome (URL bar, tabs, share)      ~19 % of height
 *     „← Всички уроци / Свободно каране" row    ~14 %
 *     „Съветник / ВЪПРОСИ / Завърши сесията"    ~14 %
 *     the dashboard pill                        ~18 %
 *     left + right letterbox                    ~10 % of WIDTH
 *
 * Verbatim: „from 100% screen the actual road seen infront from the front
 * mirror is less than 15% and it must be full 100% or at least 90%". And on
 * the chrome: the back button and title row are „absolutely no needed"; the
 * advisor/questions/end-session cluster should become „some micro button
 * activating them or Micro Major Button with sub menu".
 *
 * Reproduced headlessly at 844×390, deviceScaleFactor 3, isMobile, with
 * `Element.prototype.requestFullscreen` deleted (iPhone Safari has no
 * Fullscreen API for non-video elements — see fullscreen.ts): the scene box
 * measured 828×290 at y = 93. Ninety-three pixels — 24 % of the whole
 * viewport — were spent on a back button and a lesson title before the
 * simulator started.
 *
 * THE RULE THIS FILE ENCODES: on a phone-shaped viewport the play shell is not
 * a page with a picture on it. It is the picture, and every control is a small
 * quiet thing INSIDE it. Everything here is pure arithmetic over viewport
 * numbers so the decision can be tested without a DOM, exactly like
 * playArea.ts decides the letterboxed size.
 */

/**
 * A viewport this short cannot afford a chrome row. 560 px is chosen from the
 * device ladder, not from taste: every phone in landscape is below it (iPhone
 * SE 320, iPhone 16 390, iPhone 16 Pro Max 430, Pixel 9 Pro XL 448), and every
 * tablet in landscape is above it (iPad mini 744, iPad Pro 1024). A laptop
 * never reaches it unless the window has been squashed to a strip.
 */
export const COMPACT_MAX_HEIGHT_PX = 560;

/**
 * …and this narrow cannot afford one either. 640 px keeps every phone in
 * PORTRAIT compact (430 max on the current ladder) while leaving the smallest
 * tablet portrait (744) on the roomy layout.
 */
export const COMPACT_MAX_WIDTH_PX = 640;

/**
 * Does this viewport get the compact, in-canvas HUD grammar?
 *
 * `coarsePointer` is part of the test ON PURPOSE. A desktop user who drags a
 * window down to 500 px tall still has a mouse, a keyboard, a title bar and
 * the option to resize; giving them the thumb-sized phone HUD would be a
 * regression dressed as a fix. The audience this exists for is holding the
 * device in two hands.
 */
export function isCompactViewport(
  widthPx: number,
  heightPx: number,
  coarsePointer: boolean,
): boolean {
  if (!coarsePointer) return false;
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx)) return false;
  return heightPx <= COMPACT_MAX_HEIGHT_PX || widthPx <= COMPACT_MAX_WIDTH_PX;
}

/**
 * Should the shell pin itself to the viewport (its own „fullscreen", done in
 * CSS) rather than sit in the dashboard column?
 *
 *  - `isFullscreen` — a real Fullscreen API element: the UA already sized us.
 *  - `!fullscreenAvailable` — iPhone Safari. There has never been a button
 *    that could hide Safari's chrome for a non-video element, so the shell
 *    takes the rest of the screen itself.
 *  - `compact` — NEW. A phone-shaped viewport is immersive whether or not the
 *    Fullscreen API exists, so Android Chrome (which HAS the API but refuses
 *    it without a fresh user gesture, and lost the gesture on the way here)
 *    stops falling back to a letterboxed picture inside a scrolling page.
 *  - `standalone` — an installed app has no browser chrome at all; being
 *    anything other than immersive there would be strange.
 */
export function shouldGoImmersive(input: {
  isFullscreen: boolean;
  fullscreenAvailable: boolean;
  compact: boolean;
  standalone: boolean;
}): boolean {
  return (
    input.isFullscreen ||
    !input.fullscreenAvailable ||
    input.compact ||
    input.standalone
  );
}

/**
 * Height of the bottom instrument band, px — the number every other overlay
 * offsets from (`--sim-dash-h`), so nothing can ever be laid on top of it
 * again. Founder: the dashboard „eats almost 30% … 3 times less visible should
 * be enough".
 *
 * MEASURED BEFORE: the floating pill laid out 785 × 70 inside an 844 × 390
 * viewport — 70 px is 18 % of the height, and it was a pill with margins, so
 * the strip it occupied cost the full 18 % while showing 93 % of the width.
 *
 * AFTER: 40 px edge-to-edge = 10.3 % of the same viewport, i.e. the „3 times
 * less" the founder asked for measured against his own 30 % reading. 40 and
 * not 24: the speed readout inside it is `text-3xl` (30 px) plus 4 px of
 * padding top and bottom, and that readout took four review rounds to become
 * legible at 0 / 58 / 132 km/h. Shrinking the band by throwing that away would
 * be trading one founder ruling for another.
 */
export const COMPACT_DASH_HEIGHT_PX = 40;

/**
 * The roomy layout's floor: the floating pill (70 px) plus its 8 px gutter,
 * rounded to the value the legend and the minimap were already hard-coded to
 * (`bottom-[6.75rem]` = 108 px). Unchanged behaviour — it is only written down
 * here so both layouts read their floor from ONE place.
 */
export const ROOMY_HUD_FLOOR_PX = 108;

/**
 * The „🗺" map toggle, px square — and the lane the ROOMY floor owes it.
 *
 * THE COLLISION, MEASURED (WebKit, 1264 × 619, the real lesson shell,
 * `sc-zebra-approach@L1`, deck COLLAPSED): the deck's pill at
 * [1109.8, 476.5, 134.2 × 26.5] against the map toggle at [1204, 463, 40 × 40]
 * — **1 060 px²**, and `elementFromPoint` at the toggle's own centre answered
 * «🎬 Демонстрация ▸». The toggle was dead. With the deck OPEN it was dead too,
 * under the transport row's own wrapper (the row wraps to two lines at 320 px,
 * so the deck's box reaches y 491 while the toggle starts at 463) — which is
 * why this is a lane and not a nudge: BOTH deck states have to clear it.
 *
 * They collided because the deck MOVED here. It used to be centred over the
 * road; the 2026-08-03 pass dragged it into the right-edge column at the same
 * `ROOMY_HUD_FLOOR_PX` the map toggle and the shadow-line legend were already
 * standing on, and nothing arbitrated the corner. The deck is the newcomer, so
 * the deck is what yields — the toggle stays where students find it.
 *
 * IT YIELDS SIDEWAYS, and that is a measurement rather than a preference: the
 * first attempt lifted the deck by this same 48 px, and the re-measure showed
 * it had pushed the collapsed pill up into the briefing card instead (the hit
 * test at the pill's centre then answered the notification column) — one dead
 * control traded for another. Insetting the deck's RIGHT EDGE by the lane moves
 * nothing vertically and nothing toward the road: the deck keeps the column's
 * left edge and gives up 48 px of scrub bar. See `PlayAreaStyles`.
 *
 * 48 = the toggle (40) + the 8 px gutter this HUD uses everywhere. Read by the
 * SHELL for the toggle's own box and by `PlayAreaStyles` for the deck's inset,
 * so the button and the clearance cannot drift apart.
 */
export const MINIMAP_TOGGLE_SIZE_PX = 40;
export const ROOMY_MINIMAP_LANE_PX = MINIMAP_TOGGLE_SIZE_PX + 8;

/**
 * Tallest a teach card may be, as a fraction of the scene box.
 *
 * Founder: the teach hints are „each almost 50% of the screen when popped
 * which is also unacceptable". Measured before: the card was `absolute
 * inset-0` — 100 % of the scene box, 72.8 % of the whole viewport, and it
 * covered the dashboard as well (complaint #3, „two overlays fighting for one
 * strip").
 *
 * COLLAPSED is what a student sees by default: header + title + two clamped
 * lines + the acknowledge button. EXPANDED is what „Повече" opens, and it
 * scrolls inside itself rather than growing past this ceiling. Neither ever
 * reaches the instrument band, because the sheet is positioned ABOVE
 * `--sim-dash-h`, not over it.
 *
 * THEO-4 is not weakened by this: the authored, law-cited WHY is on screen in
 * the collapsed state (that is what the two lines are), the lawRef chip is on
 * screen, and the full text plus the repeat-cost stake are one tap away. What
 * was removed is the 96 px pictogram stage and the whitespace — never a word
 * of the explanation.
 */
export const TEACH_SHEET_MAX_FRACTION = 0.62;

/**
 * Right-edge clearance the touch pedal cluster keeps for the minimap, px.
 *
 * The minimap disc is 168 px and the cluster used to sit inboard of a hard
 * 180 px reservation — but the minimap has been DEFAULT-OFF since the same
 * 2026-07-28 review, so on virtually every phone that reservation was 180 px
 * of screen held for a widget that was not there. It follows the toggle now.
 */
export function minimapClearancePx(minimapOn: boolean): number {
  return minimapOn ? 180 : 0;
}
