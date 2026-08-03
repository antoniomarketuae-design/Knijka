/**
 * THE RIGHT-EDGE NOTIFICATION COLUMN — one place for every text panel.
 *
 * FOUNDER, THIRD ASKING (2026-08-03, with a drawing):
 *
 *   „you see all this text in the middle yes, and we said we have to move it
 *    from there so it doesnt bother the view … it must be like a popup
 *    notifications going below, it must be small text so the user can just
 *    read it — all the texts that are in the front: the task, the demonstration
 *    window, and the guidance what to do, the instructions too."
 *
 * His annotated frame («Look where I put the lines…») draws two vertical
 * corridors hard against the LEFT and RIGHT edges and leaves the middle empty.
 * The right corridor on that 591 px-wide photograph runs from roughly 0.66 to
 * 0.95 of the width — about a third of the screen, at the edge.
 *
 * WHY THIS FILE EXISTS AT ALL, AND WHY IT IS ARITHMETIC. The previous attempt
 * at this row „un-panelled the HUD" and reported chrome 70 % → 85 %: it made
 * the boxes TRANSPARENT while leaving them exactly where they were. He asked
 * for them MOVED. So the acceptance test here is not a coverage percentage —
 * it is a POSITION, and a position can be asserted:
 *
 *     notifyColumnLeftFraction(w, compact) >= NOTIFY_COLUMN_MIN_LEFT_FRACTION
 *
 * i.e. on every device in the ladder the column's left edge is at or past 60 %
 * of the width, so the centre of the frame — the road, the vanishing point, the
 * thing the student is steering down — is never under a text panel.
 *
 * Pure numbers with no DOM, exactly like immersive.ts and overlayQueue.ts, so
 * the CSS the components ship and the assertion in the test are generated from
 * ONE set of constants and cannot drift apart.
 */

/** Gutter between the column and the screen edge, px. Matches the HUD's own. */
export const NOTIFY_COLUMN_GUTTER_PX = 12;

/**
 * Widest the column may ever be, px — roomy and compact.
 *
 * 320 (20 rem) on a desktop is the toast column plus a little: wide enough for
 * a five-step briefing to read as prose. 240 (15 rem) on a phone is the toast
 * card's own shipped width (`TOAST_CARD_WIDTH_PX`), so a notification is never
 * re-flowed just because it moved into this column.
 */
export const NOTIFY_COLUMN_MAX_WIDTH_ROOMY_PX = 320;
export const NOTIFY_COLUMN_MAX_WIDTH_COMPACT_PX = 240;

/**
 * …and as a fraction of the viewport, which is what decides it on a phone.
 *
 * 0.30 / 0.36 are not taste: they are the largest values for which the left
 * edge of the column still lands past `NOTIFY_COLUMN_MIN_LEFT_FRACTION` on the
 * NARROWEST device in the ladder (320 px). `notify-column.test.ts` sweeps the
 * whole ladder rather than trusting this comment.
 */
export const NOTIFY_COLUMN_WIDTH_FRACTION_ROOMY = 0.3;
export const NOTIFY_COLUMN_WIDTH_FRACTION_COMPACT = 0.36;

/**
 * THE RULE. The column's left edge may never come left of this fraction of the
 * viewport width — that is what „off the middle of the road" means as a number.
 *
 * 0.6 and not 0.5: the road corridor in the authored cockpit frame (playArea.ts)
 * is not a hairline at x = 0.5, it is a band around it. A panel whose left edge
 * sits at 0.52 is technically „in the right half" and still lands on the lane
 * the student is driving in.
 */
export const NOTIFY_COLUMN_MIN_LEFT_FRACTION = 0.6;

/** Column width in CSS px for a viewport. */
export function notifyColumnWidthPx(viewportWidthPx: number, compact: boolean): number {
  const cap = compact
    ? NOTIFY_COLUMN_MAX_WIDTH_COMPACT_PX
    : NOTIFY_COLUMN_MAX_WIDTH_ROOMY_PX;
  const fraction = compact
    ? NOTIFY_COLUMN_WIDTH_FRACTION_COMPACT
    : NOTIFY_COLUMN_WIDTH_FRACTION_ROOMY;
  if (!Number.isFinite(viewportWidthPx) || viewportWidthPx <= 0) return 0;
  return Math.min(cap, viewportWidthPx * fraction);
}

/** Where the column's left edge lands, as a fraction of the viewport width. */
export function notifyColumnLeftFraction(viewportWidthPx: number, compact: boolean): number {
  if (!Number.isFinite(viewportWidthPx) || viewportWidthPx <= 0) return 1;
  const left =
    viewportWidthPx - NOTIFY_COLUMN_GUTTER_PX - notifyColumnWidthPx(viewportWidthPx, compact);
  return left / viewportWidthPx;
}

/** Is a measured rect inside the column — at the right edge, past the middle? */
export function rectIsInNotifyColumn(
  rect: { x: number; width: number },
  viewportWidthPx: number,
  /** Slack for sub-pixel layout and a card's own shadow, px. */
  tolerancePx = 2,
): boolean {
  if (!Number.isFinite(viewportWidthPx) || viewportWidthPx <= 0) return false;
  const leftOk = rect.x >= viewportWidthPx * NOTIFY_COLUMN_MIN_LEFT_FRACTION - tolerancePx;
  const rightGap = viewportWidthPx - (rect.x + rect.width);
  const rightOk = rightGap <= NOTIFY_COLUMN_GUTTER_PX * 2 + tolerancePx;
  return leftOk && rightOk;
}

/** px → a rem literal, so the CSS below is generated from the constants above. */
function rem(px: number): string {
  return `${px / 16}rem`;
}

/**
 * The shipped CSS lengths. Written as `min(<cap>, <fraction>vw)` on purpose:
 * a `min()` is self-limiting, which is what keeps `hud-card-fit.test.ts`'s
 * inline-width scanner from having to special-case it, and it is the same
 * shape the play area already uses for its own caps.
 */
export const NOTIFY_COLUMN_WIDTH_CSS_ROOMY = `min(${rem(
  NOTIFY_COLUMN_MAX_WIDTH_ROOMY_PX,
)}, ${NOTIFY_COLUMN_WIDTH_FRACTION_ROOMY * 100}vw)`;

export const NOTIFY_COLUMN_WIDTH_CSS_COMPACT = `min(${rem(
  NOTIFY_COLUMN_MAX_WIDTH_COMPACT_PX,
)}, ${NOTIFY_COLUMN_WIDTH_FRACTION_COMPACT * 100}vw)`;

/**
 * Distance from the right edge, safe-area aware. `viewport-fit=cover` ships, so
 * on a landscape iPhone the right inset is a real 59 px of notch.
 */
export const NOTIFY_COLUMN_RIGHT_CSS = `calc(${rem(
  NOTIFY_COLUMN_GUTTER_PX,
)} + env(safe-area-inset-right, 0px))`;

/**
 * Where the column starts.
 *
 * COMPACT starts at the very top: the tier picker — the only other thing in
 * that corner — is already stood down while the overlay layer speaks
 * (`PlayAreaStyles`, the row C1 rules), so the corner is free.
 *
 * ROOMY starts 2.75 rem lower, which clears the tier picker's own row. That
 * picker is a SETTING and it stays where the student expects to find it; the
 * notifications simply queue underneath it.
 */
export const NOTIFY_COLUMN_TOP_CSS_COMPACT = `calc(0.5rem + env(safe-area-inset-top, 0px))`;
export const NOTIFY_COLUMN_TOP_CSS_ROOMY = `calc(3.25rem + env(safe-area-inset-top, 0px))`;

/**
 * Room kept at the BOTTOM of the column for the demonstration transport, px.
 *
 * MEASURED, not guessed: at 1280×800 with the ghost demo open, the deck laid
 * out 320 × 239 px with its floor at ROOMY_HUD_FLOOR_PX. 248 is that height
 * plus the column's own 9 px gutter. It only ever bites when the column is long
 * enough to reach down there — a task line and an advisor prompt together are
 * about 110 px — and it exists so a five-step briefing scrolls inside itself
 * instead of being painted over the scrub bar.
 *
 * The deck is not a notification and does not join the flow above: it is a
 * TRANSPORT, it collapses to a 26 px pill on its own toggle, and a scrub bar
 * belongs near the floor. What the founder asked for is that it stop sitting in
 * the middle of the road, and at the bottom of this column it does not.
 */
export const NOTIFY_COLUMN_DECK_RESERVE_PX = 248;

/**
 * COMPACT: how far up the deck may float.
 *
 * `TOUCH_CONTROLS_FLOOR` is tuned on a PORTRAIT phone, where the pads stack;
 * applied to a 393 px-tall LANDSCAPE stage the same number lifts the deck to
 * y = 30, i.e. straight into the overlay peek at the top of this column
 * (measured 2026-08-03: deck at y 30.5, peek at y 8). Capping it at 45 % of the
 * stage keeps the portrait floor untouched — 45 % of 836 is larger than the
 * floor, so `min()` picks the floor — and drops the deck into the lower half of
 * the column in landscape, which is where a transport belongs.
 */
export const NOTIFY_COLUMN_DECK_MAX_LIFT_COMPACT = "45%";
