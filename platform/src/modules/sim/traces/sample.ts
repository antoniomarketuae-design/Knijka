/**
 * Trace playback queries — the allocation-free hot path (doc 76 §5).
 *
 * sampleAt() is called once per rendered frame by the ghost renderer, so it
 * follows the RouteGuidance per-frame law: binary search + lerp into a
 * caller-owned out object, ZERO allocation, no closures.
 */

import type { ScenarioTrace, TraceEvent, TracePoint } from "./types";

/** Shortest-arc interpolation between two headings (deg, any range). */
function lerpHeadingDeg(a: number, b: number, t: number): number {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  else if (d < -180) d += 360;
  const h = (a + d * t) % 360;
  return h < 0 ? h + 360 : h;
}

/**
 * Write the trace state at `tSec` into `out` (clamped to the trace span).
 * Continuous channels (position, heading, steer, speed) interpolate between
 * the bracketing samples — heading via shortest arc so 350°→10° passes
 * through 0°, never spins the long way. Discrete channels (gear, indicator,
 * brake/throttle flags) snap to the NEAREST sample.
 */
export function sampleAt(trace: ScenarioTrace, tSec: number, out: TracePoint): TracePoint {
  const samples = trace.samples;
  const n = samples.length;
  const first = samples[0];
  const last = samples[n - 1];

  if (tSec <= first.tSec || n === 1) {
    copySample(first, out);
    return out;
  }
  if (tSec >= last.tSec) {
    copySample(last, out);
    return out;
  }

  // Binary search: greatest index lo with samples[lo].tSec <= tSec.
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].tSec <= tSec) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const span = b.tSec - a.tSec;
  const t = span > 0 ? (tSec - a.tSec) / span : 0;

  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.headingDeg = lerpHeadingDeg(a.headingDeg, b.headingDeg, t);
  out.steerRad = a.steerRad + (b.steerRad - a.steerRad) * t;
  out.speedKmh = a.speedKmh + (b.speedKmh - a.speedKmh) * t;

  const nearest = t < 0.5 ? a : b;
  out.gear = nearest.gear;
  out.indicator = nearest.indicator;
  out.brakeOn = nearest.brakeOn;
  out.throttleOn = nearest.throttleOn;
  return out;
}

function copySample(s: ScenarioTrace["samples"][number], out: TracePoint): void {
  out.x = s.x;
  out.y = s.y;
  out.headingDeg = s.headingDeg;
  out.steerRad = s.steerRad;
  out.speedKmh = s.speedKmh;
  out.gear = s.gear;
  out.indicator = s.indicator;
  out.brakeOn = s.brakeOn;
  out.throttleOn = s.throttleOn;
  return;
}

/** The annotation events of a trace (allocates — call once, not per frame). */
export function traceAnnotations(trace: ScenarioTrace): TraceEvent[] {
  return trace.events.filter((e) => e.kind === "annotation");
}

/**
 * Index into `annotations` of the annotation ACTIVE at tSec — the last one
 * whose tSec ≤ tSec + `graceSec` and within `windowSec` behind the playhead
 * (annotation cards linger a moment, then clear). -1 = none. Zero-alloc.
 */
export function activeAnnotationIndex(
  annotations: readonly TraceEvent[],
  tSec: number,
  windowSec = 4,
  graceSec = 0.05,
): number {
  let active = -1;
  for (let i = 0; i < annotations.length; i++) {
    if (annotations[i].tSec > tSec + graceSec) break;
    if (tSec - annotations[i].tSec <= windowSec) active = i;
  }
  return active;
}

/**
 * Decimated ground-path polyline of a trace for ribbon rendering: flat
 * district-space points + cumulative arclength (the DerivedRoute layout the
 * shared ribbon mesh builder consumes). Build-time only — allocates.
 */
export function tracePathForRibbon(
  trace: ScenarioTrace,
  minSpacingM = 1.25,
  maxSamples = 1024,
): { pts: Float32Array; arc: Float32Array; count: number } {
  const samples = trace.samples;
  const pts = new Float32Array(maxSamples * 2);
  const arc = new Float32Array(maxSamples);
  let count = 0;
  let lastX = 0;
  let lastY = 0;
  let acc = 0;
  for (let i = 0; i < samples.length && count < maxSamples; i++) {
    const s = samples[i];
    if (count > 0) {
      const d = Math.hypot(s.x - lastX, s.y - lastY);
      if (d < minSpacingM && i < samples.length - 1) continue;
      acc += d;
    }
    pts[count * 2] = s.x;
    pts[count * 2 + 1] = s.y;
    arc[count] = acc;
    lastX = s.x;
    lastY = s.y;
    count++;
  }
  return { pts, arc, count };
}
