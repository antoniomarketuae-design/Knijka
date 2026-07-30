/**
 * sim/runtime — turn detector.
 *
 * Emits `turnStarted` when the accumulated signed heading change over a
 * sliding 3 s window exceeds 55° while the vehicle is inside a junction area
 * (≤ 40 m from an intersection node — the runtime supplies that flag).
 * Heading is CW-positive, so a positive window sum = right turn.
 *
 * A TURN IS A CHANGE IN THE DIRECTION OF TRAVEL (doc 87 B8/B9). It is not a
 * change in the direction the body happens to point: a car standing still that
 * yaws — a chassis settling onto its springs at spawn, a wheel turned against
 * the kerb — has rotated, not turned, and there is nothing there to signal or
 * to observe. The founder opened „Полигон — начални маневри", pressed nothing,
 * and was billed «Завиване без мигач» (ЗДвП чл. 25, основна) at 0 км/ч with the
 * checklist still on 0/13. The window therefore carries DISTANCE alongside the
 * heading: a frame that did not move contributes no heading, and a window that
 * did not cover `TURN_MIN_TRAVEL_M` cannot fire at all. A real turn is
 * untouched — the tightest junction mouth in the catalog still sweeps 55° over
 * ~5 m of asphalt.
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
/**
 * Below this the vehicle is not travelling, so its heading change is body
 * rotation, not a turn. 2 km/h = 0.56 m/s — under a slow walk, and an order of
 * magnitude under the ~20 km/h a junction turn is actually taken at.
 */
export const TURN_MIN_SPEED_KMH = 2;
/**
 * Ground covered inside the window before 55° may be called a turn. The
 * geometric floor: 55° swept on the tightest mouth the world builds
 * (JUNCTION_CORNER_RADIUS_MINOR_M = 9 m) is 8.6 m of arc, and even a 4 m
 * three-point-turn radius covers 3.8 m. 3 m keeps every real manoeuvre and
 * rejects everything a parked car can do.
 */
export const TURN_MIN_TRAVEL_M = 3;

/** 3 s at ~340 Hz — beyond any realistic frame rate. */
const CAPACITY = 1024;

export class TurnDetector {
  private readonly times = new Float64Array(CAPACITY);
  private readonly deltas = new Float64Array(CAPACITY);
  private readonly dists = new Float64Array(CAPACITY);
  private head = 0; // next write
  private tail = 0; // oldest
  private count = 0;
  private sumDeg = 0;
  private sumDistM = 0;
  private lastHeading: number | null = null;
  private lastT: number | null = null;
  private armed = true;

  reset(): void {
    this.head = 0;
    this.tail = 0;
    this.count = 0;
    this.sumDeg = 0;
    this.sumDistM = 0;
    this.lastHeading = null;
    this.lastT = null;
    this.armed = true;
  }

  /**
   * Feed one frame. Appends a turnStarted event when a turn begins.
   *
   * `speedKmh` is the travel gate (doc 87 B8/B9). A caller that cannot answer
   * — there is none in-tree, but the parameter is optional so a fixture does
   * not have to lie — is treated as "moving at the reference pace", i.e. the
   * pre-gate behaviour, because inventing a stop is worse than not knowing.
   */
  update(
    tSec: number,
    headingDeg: number,
    inJunctionArea: boolean,
    events: SimTickEvent[],
    speedKmh?: number,
  ): void {
    const dtSec = this.lastT === null ? 0 : Math.max(0, tSec - this.lastT);
    this.lastT = tSec;
    // Unknown speed = the old behaviour: assume the window fills with travel.
    const speed = speedKmh ?? Number.POSITIVE_INFINITY;
    const moving = speed >= TURN_MIN_SPEED_KMH;
    const frameDistM = Number.isFinite(speed)
      ? (speed / 3.6) * dtSec
      : (TURN_MIN_TRAVEL_M * dtSec) / TURN_WINDOW_SEC;

    // A frame the car did not travel contributes no heading: a body rotating
    // in place is not changing its direction of travel.
    const raw = this.lastHeading === null ? 0 : signedDeltaDeg(this.lastHeading, headingDeg);
    this.lastHeading = headingDeg;
    const delta = moving ? raw : 0;

    // Evict entries older than the window (and make room when full).
    const cutoff = tSec - TURN_WINDOW_SEC;
    while (this.count > 0 && (this.times[this.tail] < cutoff || this.count >= CAPACITY)) {
      this.sumDeg -= this.deltas[this.tail];
      this.sumDistM -= this.dists[this.tail];
      this.tail = (this.tail + 1) % CAPACITY;
      this.count--;
    }

    this.times[this.head] = tSec;
    this.deltas[this.head] = delta;
    this.dists[this.head] = moving ? frameDistM : 0;
    this.head = (this.head + 1) % CAPACITY;
    this.count++;
    this.sumDeg += delta;
    this.sumDistM += moving ? frameDistM : 0;

    const mag = Math.abs(this.sumDeg);
    const travelled = this.sumDistM >= TURN_MIN_TRAVEL_M;
    if (this.armed && mag > TURN_THRESHOLD_DEG && inJunctionArea && travelled) {
      this.armed = false;
      events.push({ kind: "turnStarted", direction: this.sumDeg > 0 ? "right" : "left" });
    } else if (!this.armed && mag < TURN_REARM_DEG) {
      this.armed = true;
    }
  }
}
