/**
 * sim/runtime — turn detector.
 *
 * Emits `turnStarted` when the accumulated signed heading change over a
 * sliding 3 s window exceeds 55° while the vehicle is inside a junction area
 * (≤ 40 m from an intersection node — the runtime supplies that flag).
 * Heading is CW-positive, so a positive window sum = right turn.
 *
 * One event per maneuver: after firing, the detector re-arms only once the
 * window sum falls back under 15° (turn finished / straightened out).
 * Ring buffer is fixed-size Float64Arrays — zero steady-state allocation.
 */

import type { SimTickEvent } from "../rules/types";
import { signedDeltaDeg } from "./geometry";

export const TURN_THRESHOLD_DEG = 55;
export const TURN_WINDOW_SEC = 3;
export const TURN_REARM_DEG = 15;
/** "On junction area" radius used by the runtime when calling update().
 * Covers the scaled junction patches (open radii reach ~36 m on arterials —
 * perceptual road scale); turns start at the mouth, not at the node. */
export const JUNCTION_AREA_RADIUS_M = 40;

/** 3 s at ~340 Hz — beyond any realistic frame rate. */
const CAPACITY = 1024;

export class TurnDetector {
  private readonly times = new Float64Array(CAPACITY);
  private readonly deltas = new Float64Array(CAPACITY);
  private head = 0; // next write
  private tail = 0; // oldest
  private count = 0;
  private sumDeg = 0;
  private lastHeading: number | null = null;
  private armed = true;

  reset(): void {
    this.head = 0;
    this.tail = 0;
    this.count = 0;
    this.sumDeg = 0;
    this.lastHeading = null;
    this.armed = true;
  }

  /** Feed one frame. Appends a turnStarted event when a turn begins. */
  update(tSec: number, headingDeg: number, inJunctionArea: boolean, events: SimTickEvent[]): void {
    const delta = this.lastHeading === null ? 0 : signedDeltaDeg(this.lastHeading, headingDeg);
    this.lastHeading = headingDeg;

    // Evict entries older than the window (and make room when full).
    const cutoff = tSec - TURN_WINDOW_SEC;
    while (this.count > 0 && (this.times[this.tail] < cutoff || this.count >= CAPACITY)) {
      this.sumDeg -= this.deltas[this.tail];
      this.tail = (this.tail + 1) % CAPACITY;
      this.count--;
    }

    this.times[this.head] = tSec;
    this.deltas[this.head] = delta;
    this.head = (this.head + 1) % CAPACITY;
    this.count++;
    this.sumDeg += delta;

    const mag = Math.abs(this.sumDeg);
    if (this.armed && mag > TURN_THRESHOLD_DEG && inJunctionArea) {
      this.armed = false;
      events.push({ kind: "turnStarted", direction: this.sumDeg > 0 ? "right" : "left" });
    } else if (!this.armed && mag < TURN_REARM_DEG) {
      this.armed = true;
    }
  }
}
