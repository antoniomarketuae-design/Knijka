/**
 * THE MIRROR RULE AS A PREDICATE — the judge, not the layout.
 *
 * Moved out of `notifyColumn.ts` on 2026-08-26, and the move is the finding.
 *
 * The RULE ships: `NOTIFY_COLUMN_TOP_CSS_ROOMY` and
 * `NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN` are CSS strings derived from
 * `MIRROR_BAND_BOTTOM_FRACTION_*` + `NOTIFY_COLUMN_MIRROR_GUTTER_PX`, and
 * `PlayAreaStyles.tsx` writes both. That is the product keeping the column off
 * the interior mirror, and none of it moved.
 *
 * `rectClearsMirrorBand` is the other thing: „here is a rect somebody MEASURED —
 * is it legal?" No renderer asks that. Nothing in the shipped tree called it,
 * and nothing could: the layout is done by a static length in a stylesheet, and
 * the only party that arrives holding a measured box is a probe. It was
 * exported from a module on the /simulator path for a week, which made it look
 * like a rule the HUD applies, and the row it was filed against was booked as
 * repaired on the strength of it.
 *
 * So it lives with its readers. Its two inputs are still imported from the
 * module, so a fraction that changes there still changes the judgement here —
 * which is the property that would have been lost by copying the numbers.
 */
import { MIRROR_BAND_LEFT_FRACTION, notifyColumnMirrorLanePx } from "../notifyColumn";

/**
 * It asks about BOTH axes on purpose. A box in the LEFT corridor never touches
 * this mirror however high it is, and a rule that forgot to say so would drag
 * the top rail and the open deck down with the column.
 */
export function rectClearsMirrorBand(
  rect: { x: number; y: number; width: number },
  stage: { width: number; height: number },
  compact: boolean,
): boolean {
  if (!Number.isFinite(stage.width) || stage.width <= 0) return false;
  if (rect.x + rect.width <= stage.width * MIRROR_BAND_LEFT_FRACTION) return true;
  return rect.y >= notifyColumnMirrorLanePx(stage, compact);
}
