/**
 * Server-side types for the hazard delivery layer.
 *
 * The browser-facing shapes live in @/components/hazard/types (they cross the
 * RSC boundary and must stay dependency-free); this file adds only what never
 * leaves the server — the engine port's request/response shapes and the stored
 * run record.
 */

import type {
  HazardDoor,
  HazardItemCard,
  HazardItemFeedback,
  HazardRunItemLine,
} from "@/components/hazard/types";

// ---------------------------------------------------------------------------
// The engine port (implemented by @/modules/hazard — the sibling item engine)
// ---------------------------------------------------------------------------

export interface HazardDealRequest {
  /**
   * Who the run is for. The engine may use it to avoid repeating items the
   * student has already seen; it must NOT use it for anything that would make
   * two students' runs incomparable, because the calibration story
   * (@/modules/outcomes) eventually needs to pool them.
   */
  userId: string;
  door: HazardDoor;
  /** How many items to deal. The caller has already clamped it. */
  length: number;
  /** Optional determinism handle for tests and support replays. */
  seed?: number;
}

/**
 * One dealt item, server-side.
 *
 * `card` is the client-safe half and is the ONLY half that is ever serialized
 * to the browser. Whatever the engine knows about the window stays inside the
 * engine — this layer deliberately does not hold it, so it cannot leak it by
 * accident (there is no field here to leak).
 */
export interface HazardDealtItem {
  itemId: string;
  /** What the browser gets. `index`/`total` are filled in by this layer. */
  card: Omit<HazardItemCard, "index" | "total">;
}

export interface HazardJudgeRequest {
  itemId: string;
  /**
   * Press timestamps in media seconds, ascending, already clamped to
   * [0, durationSec] and capped in count by the delivery layer.
   */
  pressesMediaSec: number[];
  /** How far into the clip the player actually got. */
  watchedToSec: number;
}

/**
 * The engine's verdict for one item. It is the whole of the feedback the
 * student sees, minus `itemId`, which the delivery layer already knows.
 *
 * ADR-002: every string on this object must be a stored copy from the item
 * bank or the 58-entry rule catalog. The engine is not allowed to compose law
 * text at request time, and this layer never inspects or rewrites it.
 */
export type HazardJudgement = Omit<HazardItemFeedback, "itemId">;

/**
 * What the delivery layer needs from the item engine. Two methods, on purpose:
 * "what shall this student watch?" and "what was that press worth?" are the
 * only two questions a player surface can ask, and keeping the port at two
 * methods is what stops a future door from growing its own private path into
 * the engine.
 */
export interface HazardEngine {
  /**
   * Free-form version tag, recorded on the run so a later scoring change is
   * visible in the data rather than silently rewriting history (same reason
   * SimSelfPrediction copies its actuals instead of joining them).
   */
  readonly version: string;
  /** Deal an ordered run. Fewer items than asked for is allowed; zero is too. */
  deal(request: HazardDealRequest): Promise<HazardDealtItem[]>;
  /** Judge ONE reaction against the item's window. Server-only, always. */
  judge(request: HazardJudgeRequest): Promise<HazardJudgement>;
}

// ---------------------------------------------------------------------------
// The stored run
// ---------------------------------------------------------------------------

/**
 * One item inside a stored run — the served card plus its judged result.
 *
 * The card is STORED rather than re-dealt on every request. Re-dealing would
 * mean asking a bank that may shuffle, exclude seen items or change size for
 * the same answer twice, which is how the exam ended up with audit H-7
 * (a resumed attempt graded against a different paper). What was served is
 * what gets served again; the card is client-safe by construction, so keeping
 * it costs nothing in exposure.
 */
export interface HazardRunItemRecord {
  itemId: string;
  card: Omit<HazardItemCard, "index" | "total">;
  titleBg: string;
  durationSec: number;
  /**
   * When this item's clip was handed to the browser. The plausibility check
   * in attempts.ts is the only reader: a press at media second 9 cannot have
   * happened 2 seconds after the clip was served.
   */
  servedAt: Date | null;
  /** null until judged. Frozen once written — a re-submit is refused. */
  result: HazardRunItemLine | null;
}

export interface HazardRunRecord {
  id: string;
  userId: string;
  door: HazardDoor;
  engineVersion: string;
  startedAt: Date;
  finishedAt: Date | null;
  /** Index of the item currently in play. Equals items.length when done. */
  cursor: number;
  items: HazardRunItemRecord[];
}

export type HazardPlayErrorCode =
  | "RUN_NOT_FOUND"
  | "OUT_OF_ORDER"
  | "IMPLAUSIBLE"
  | "NO_ITEMS"
  | "ENGINE_UNAVAILABLE";

export class HazardPlayError extends Error {
  constructor(
    readonly code: HazardPlayErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HazardPlayError";
  }
}
