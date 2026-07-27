/**
 * The engine — two questions and no more: "what shall this student watch?" and
 * "what was that press worth?".
 *
 * SERVER AUTHORITY. This is the hazard twin of what the exam module already
 * does (modules/exam/index.ts): the server deals, the server remembers what it
 * dealt, the client sends back only what a human could have produced, and the
 * server grades. Concretely, three properties live in THIS file:
 *
 *  1. THE WINDOW NEVER CROSSES THE WIRE BEFORE THE ANSWER. `deal()` returns a
 *     card; a card has no window field, no fault timestamp and no hazard text
 *     (@/components/hazard/types is split in half for precisely this). The
 *     window is read out of the bank inside `judge()` and appears for the first
 *     time in the reveal. `__tests__/no-leak.test.ts` serialises a dealt card
 *     and asserts none of the secrets survive.
 *  2. THE CLIENT NEVER SENDS A SCORE. It sends media timestamps.
 *     `scoreHazardItem` is the only place points are produced, and it is pure.
 *  3. THE PLAYABLE LENGTH IS THE CUT, NOT THE FILE. `durationSec` on the card
 *     is `item.playableSec` — the capture rig records four seconds PAST the
 *     fault, and those four seconds are the answer. The player stops at the
 *     number it was given; the tail belongs to the reveal.
 *
 * WHAT IS DELIBERATELY NOT HERE: run state. Ordering, one-shot-per-item and the
 * media-time-vs-wall-clock plausibility check belong to the delivery layer
 * (@/modules/hazard-play attempts.ts), which owns the run row. A second opinion
 * about run state would be worse than none — and keeping the engine stateless
 * is what lets all three doors share it without a fork.
 *
 * THE PORT. The shapes below are structural twins of @/modules/hazard-play's
 * `HazardEngine`. They are re-declared rather than imported because the
 * dependency is INVERTED on purpose: the delivery layer owns the port and
 * registers an implementation (setHazardEngine), so the engine must not depend
 * on its own consumer — that is what lets the engine be swapped in tests and
 * what keeps a fourth door from growing a private path into it.
 * `__tests__/port-conformance.test.ts` imports the real type from that module's
 * barrel and asserts assignability, so a change on either side is a red test
 * rather than a silent drift.
 */

import type { HazardDoor, HazardItemCard, HazardItemFeedback } from "@/components/hazard/types";
import { getHazardBank, selectHazardItems } from "./bank";
import { buildHazardFeedback } from "./feedback";
import { scoreHazardItem } from "./scoring";
import { HazardError, type HazardItem } from "./types";

/** Version tag recorded on every run, so a scoring change is visible in the data. */
export const HAZARD_ENGINE_VERSION = "hz-1";

export interface HazardDealRequest {
  userId: string;
  door: HazardDoor;
  length: number;
  seed?: number;
}

export interface HazardDealtItem {
  itemId: string;
  card: Omit<HazardItemCard, "index" | "total">;
}

export interface HazardJudgeRequest {
  itemId: string;
  pressesMediaSec: number[];
  watchedToSec: number;
}

/** The card as the browser receives it — the client-safe half of an item. */
export function hazardCardFor(item: HazardItem): Omit<HazardItemCard, "index" | "total"> {
  return {
    itemId: item.id,
    clipSrc: item.clipSrc,
    posterSrc: item.posterSrc,
    // The CUT, not the file length. See property 3 in the header.
    durationSec: item.playableSec,
    titleBg: item.titleBg,
    briefBg: item.briefBg,
  };
}

/** Fresh 32-bit seed. Call-time only — never at module load (see exam/rng). */
function randomSeed(): number {
  return (Math.floor(Math.random() * 0x100000000) ^ Date.now()) >>> 0;
}

export const hazardEngine = {
  version: HAZARD_ENGINE_VERSION,

  /**
   * Deal a run.
   *
   * `door` is accepted and IGNORED, and that is the design, not an omission:
   * the free simulator interstitial, the paid section and the theory lesson
   * must be the same measurement or the data cannot be pooled and the safety
   * claim cannot be argued. Length and entitlement are the delivery layer's
   * business; the engine is one engine.
   *
   * `userId` is likewise unused today. When a "don't repeat what they have
   * already seen" filter lands it goes here — but it must never become
   * something that makes two students' runs incomparable.
   *
   * Fewer items than asked for (including zero) is a legal answer: the bank
   * serves APPROVED items only, and while the clip batch is still being
   * produced the honest surface is „готви се", not a fabricated run.
   */
  async deal(request: HazardDealRequest): Promise<HazardDealtItem[]> {
    const bank = getHazardBank();
    const picked = selectHazardItems(
      bank.servable,
      request.length,
      request.seed ?? randomSeed(),
    );
    return picked.map((item) => ({ itemId: item.id, card: hazardCardFor(item) }));
  },

  /**
   * Judge ONE reaction. The only path from timestamps to points.
   *
   * Looks the item up in the full bank rather than in `servable`: a run dealt
   * before someone edited the bank must still be gradeable, and refusing to
   * grade a clip the student already watched would lose their work over a
   * content edit (the exam learned this as audit H-7).
   *
   * `watchedToSec` is not scored. It cannot improve a result — a shorter watch
   * only means fewer presses — and the delivery layer has already refused the
   * one thing it could be abused for (media time running ahead of the wall
   * clock). It stays on the request because "watched it and never pressed" and
   * "closed the tab" are worth telling apart in the data.
   */
  async judge(request: HazardJudgeRequest): Promise<Omit<HazardItemFeedback, "itemId">> {
    const item = getHazardBank().byId(request.itemId);
    if (item === undefined) {
      throw new HazardError("ITEM_NOT_FOUND", `hazard: no item ${request.itemId} in the bank`);
    }
    const score = scoreHazardItem(item.id, item.window, request.pressesMediaSec);
    return buildHazardFeedback(item, score);
  },
};
