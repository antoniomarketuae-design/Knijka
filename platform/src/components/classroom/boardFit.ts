/**
 * How the correct/wrong pair fits the box the room gave it.
 *
 * This is arithmetic, not layout, and it lives outside the component because
 * getting it wrong is silent: `MistakeReplay` sizes its canvas from its OWN
 * width (`clamp(140, w × 0.72, 240)`) and then stacks a control row and a
 * 44 px annotation line under it, so a pane that is merely „as wide as the
 * column" produces a block ~90 px taller than anyone eyeballing the markup
 * expects — and what falls off the bottom is a sentence of stored teaching
 * copy. A rule that decides whether a phone shows one diagram or two, and at
 * what size, deserves to be argued with in a test rather than in a screenshot.
 *
 * Pure: no DOM, no React.
 */

/** `MistakeReplay`'s own canvas height rule — mirrored, never re-derived. */
export const REPLAY_ASPECT = 0.72;
export const REPLAY_MIN_H = 140;
export const REPLAY_MAX_H = 240;

/**
 * What `MistakeReplay` puts under its canvas: the play/step control row, the
 * gaps, and the `min-h-11` figcaption that carries the violation annotation.
 * Measured from the component, not guessed — it is 60 % of a short room.
 */
export const REPLAY_INTERNAL_CHROME_PX = 86;

/**
 * Everything in a pane that is not the canvas: the correct/wrong tab row, the
 * canvas box's own padding and border, `REPLAY_INTERNAL_CHROME_PX`, and the
 * three-line stored caption.
 */
export const BOARD_CHROME_PX = 36 + 8 + 10 + REPLAY_INTERNAL_CHROME_PX + 6 + 47;

/**
 * The same board with its caption moved out — what a phone held sideways gets.
 *
 * A 390 px-tall window minus the dashboard header leaves the board roughly
 * 220 px, and the canvas alone will not go below 140. Rather than clipping the
 * caption (which is how a teaching sentence silently disappears), the dense
 * board hands its text to the transcript column, which on that layout is
 * sitting right beside it with room to spare.
 */
export const BOARD_CHROME_DENSE_PX = 36 + 8 + 10 + REPLAY_INTERNAL_CHROME_PX;

/** Below this a pane is a thumbnail, not a diagram; two of them are worse than one. */
export const PANE_MIN_W = 196;

/** Gap between the two panes when both are shown. */
export const PANE_GAP_PX = 12;

/**
 * The floor on the last-resort scale. Below this the diagram is decoration.
 * Reaching it means the window is genuinely too short and the room lets the
 * page scroll instead (`MIN_SCENE_COMPACT_PX` in ClassroomScene).
 */
export const MIN_BOARD_SCALE = 0.72;

export interface BoardFit {
  /** Both panes at once? */
  wide: boolean;
  /** Cap applied to each pane so the canvas cannot outgrow the room. */
  paneMaxWidthPx: number;
  /**
   * Uniform scale applied to the board when even a minimum-size canvas plus
   * its chrome does not fit the height. 1 in every layout that fits.
   */
  scale: number;
}

export function fitBoard(
  widthPx: number,
  heightPx: number,
  chromePx: number = BOARD_CHROME_PX,
): BoardFit {
  // What a pane may be, given the HEIGHT.
  //
  // Note the shape of this: the budget is `height / MIN_BOARD_SCALE`, not
  // `height`. Once the board is being scaled at all, a WIDER pane produces a
  // LARGER diagram on the glass — `w × 0.72 × scale` grows with `w` because
  // the chrome that shares the box does not. So the pane is allowed to
  // overflow the raw height, up to exactly the amount the scale floor can
  // absorb, and not one pixel further.
  const canvasBudget = Math.max(
    REPLAY_MIN_H,
    Math.min(heightPx / MIN_BOARD_SCALE - chromePx, REPLAY_MAX_H),
  );
  const byHeight = Math.floor(canvasBudget / REPLAY_ASPECT);

  // What a pane would be, given the WIDTH, if both were shown at once.
  const halfWidth = Math.floor((widthPx - PANE_GAP_PX) / 2);
  const wide = halfWidth >= PANE_MIN_W;

  const byWidth = wide ? halfWidth : widthPx;
  const paneMaxWidthPx = Math.max(Math.min(byHeight, byWidth), PANE_MIN_W);

  // The canvas the component will actually draw at that width, and therefore
  // the height the board actually needs. When the room cannot give it — the
  // 140 px canvas floor is inside `MistakeReplay` and not ours to move — the
  // whole board is scaled rather than having its bottom sentence cropped away.
  const canvasH = Math.min(Math.max(paneMaxWidthPx * REPLAY_ASPECT, REPLAY_MIN_H), REPLAY_MAX_H);
  const neededH = chromePx + canvasH;
  const scale = neededH > heightPx ? Math.max(MIN_BOARD_SCALE, heightPx / neededH) : 1;

  return { wide, paneMaxWidthPx, scale };
}
