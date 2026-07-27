/**
 * The item-engine seam.
 *
 * WHY A REGISTRATION PORT AND NOT A PLAIN IMPORT. The item engine (item bank,
 * scoring windows, the law-cited reveal) is built and owned separately from
 * this delivery layer, and the two land in different changes. A hard
 * `import { … } from "@/modules/hazard"` here would make the player, the
 * /hazard section and their tests uncompilable until the engine exists, and
 * would make the engine impossible to swap in tests. So the dependency is
 * inverted, exactly like setPaymentsStore / setExamStore / setStripeClient
 * already do it elsewhere in this repo: the engine registers itself, this
 * module only holds the interface.
 *
 * WIRING (one line, one file — see index.ts, "WIRING THE ENGINE"):
 *
 *     import { setHazardEngine } from "@/modules/hazard-play";
 *     import { hazardEngine } from "@/modules/hazard";
 *     setHazardEngine(hazardEngine);
 *
 * UNTIL THEN THE SURFACE DEGRADES HONESTLY. There is deliberately no fallback
 * engine and no sample data: a placeholder that invented a scoring window
 * would be inventing the one measurement the whole safety claim rests on, and
 * a placeholder that invented a corrective would be free-recalling law
 * (ADR-002). `hasHazardEngine()` is false, the section renders its „подготвя
 * се" state, and nothing is ever scored against a number nobody authored.
 */

import { HazardPlayError, type HazardEngine } from "./types";

let engine: HazardEngine | null = null;

/**
 * Install the item engine. Called once at wiring time; called by tests with a
 * fake. Pass null to reset (test teardown).
 */
export function setHazardEngine(next: HazardEngine | null): void {
  engine = next;
}

/** True when a run can actually be dealt. The page asks this before it sells. */
export function hasHazardEngine(): boolean {
  return engine !== null;
}

/** The installed engine, or a typed refusal — never a fabricated one. */
export function getHazardEngine(): HazardEngine {
  if (engine === null) {
    throw new HazardPlayError(
      "ENGINE_UNAVAILABLE",
      "hazard-play: no item engine registered (see engine.ts — setHazardEngine)",
    );
  }
  return engine;
}
