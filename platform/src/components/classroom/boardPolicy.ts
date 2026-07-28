/**
 * What the board is allowed to download — the one number that decides this
 * whole design.
 *
 * Doc 84 §1.1, measured: a correct/wrong pair delivered as recorded TRACES is
 * ~270 KB. The same pair delivered as rendered video is ~5.1 MB — nineteen
 * times more — and only 42 of the 155 templates have a reel at all. The
 * audience is Bulgarian teenagers on mobile data, so the default renderer is
 * the 2D trace replay and video is an UPGRADE, applied only where a reel
 * exists AND the connection is not asking us to be careful.
 *
 * That inverts what `MistakeMedia` does today (video first, canvas as
 * fallback) — correctly, for a surface that plays a pair on every beat instead
 * of one clip at the end of a question. `MistakeMedia` is untouched; the room
 * simply decides which of the two renderers to mount.
 *
 * Pure: reads a plain snapshot, never `navigator`.
 */

/** The bits of the (non-standard, Chromium-only) NetworkInformation we use. */
export interface ConnectionSnapshot {
  /** Data Saver is on. The strongest signal there is; it is a user's request. */
  saveData?: boolean;
  /** "slow-2g" | "2g" | "3g" | "4g" — the browser's own round-trip estimate. */
  effectiveType?: string;
}

export type BoardRenderer = "trace" | "video";

export interface BoardPolicy {
  renderer: BoardRenderer;
  /** True when a reel exists but the policy declined it — offer the upgrade. */
  videoAvailableButHeld: boolean;
  /** Why, in Bulgarian, for the one-line note under the offer. Null if silent. */
  noticeBg: string | null;
}

const SLOW_TYPES = new Set(["slow-2g", "2g"]);

/**
 * Decide the renderer for one board take.
 *
 * @param hasReel       the clip manifest has a rendered .webm for this trace
 * @param conn          what the browser says about the connection (may be empty)
 * @param userOptIn     the student pressed „Пусни видеото" for this take
 * @param pairSymmetric BOTH halves of the pair have a reel
 */
export function boardPolicyFor(
  hasReel: boolean,
  conn: ConnectionSnapshot | null,
  userOptIn = false,
  pairSymmetric = true,
): BoardPolicy {
  if (!hasReel) {
    return { renderer: "trace", videoAvailableButHeld: false, noticeBg: null };
  }
  // An explicit tap always wins: the student was told the cost and chose.
  if (userOptIn) {
    return { renderer: "video", videoAvailableButHeld: false, noticeBg: null };
  }
  if (conn?.saveData === true) {
    return {
      renderer: "trace",
      videoAvailableButHeld: true,
      noticeBg: "Икономия на данни е включена — показвам леката схема вместо видеото.",
    };
  }
  if (conn?.effectiveType !== undefined && SLOW_TYPES.has(conn.effectiveType)) {
    return {
      renderer: "trace",
      videoAvailableButHeld: true,
      noticeBg: "Връзката е бавна — показвам леката схема вместо видеото.",
    };
  }
  // The comparison rule. Reels exist only for MISTAKE traces — none of the 155
  // shadow-correct lines has ever been rendered — so „play the video whenever
  // there is one" would put a photoreal reel of the mistake next to a wireframe
  // of the correct line, and the student would read the difference as the
  // difference between the media. A teacher shows both halves the same way.
  // The reel stays one tap away, and the tap is worth more once it is a choice.
  if (!pairSymmetric) {
    return {
      renderer: "trace",
      videoAvailableButHeld: true,
      noticeBg: "Правилното изпълнение няма видеозапис — двете са като схеми, за да се сравняват.",
    };
  }
  return { renderer: "video", videoAvailableButHeld: false, noticeBg: null };
}

/** Read the live connection. The only impure function in this file. */
export function readConnection(): ConnectionSnapshot | null {
  if (typeof navigator === "undefined") return null;
  const c = (navigator as Navigator & { connection?: ConnectionSnapshot }).connection;
  if (!c) return null;
  return { saveData: c.saveData, effectiveType: c.effectiveType };
}

/**
 * Approximate weight of a board pair, for the „~0,2 MB" line the room prints
 * next to the video offer. Teenagers on a metered plan deserve the number
 * before the download, not after it.
 *
 * Sources, doc 84 §1.1 [measured]: average trace 134 KB, average reel 2.55 MB.
 */
export const AVG_TRACE_KB = 134;
export const AVG_REEL_KB = 2550;

export function formatMegabytesBg(kb: number): string {
  const mb = kb / 1024;
  const rounded = mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10;
  return `${String(rounded).replace(".", ",")} MB`;
}
