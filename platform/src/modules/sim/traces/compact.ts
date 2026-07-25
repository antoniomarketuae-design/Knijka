/**
 * Storage reduction for the student's OWN recorded drive (audit 2026-07-24
 * I-2 „Твоят дубъл").
 *
 * The live ring recorder (recorder.ts) captures 20 Hz float64 kinematics —
 * the right cadence to GRADE against and the wrong one to keep forever. A 60 s
 * drill serializes to 250 KB of JSON and a 300 s one to 1.25 MB (measured),
 * and every scenario session a teenager ever drives would want a row. This
 * module is the reduction that makes keeping one honest:
 *
 *   • decimate to STORED_TRACE_HZ (10 Hz — playback interpolates, so the
 *     ghost and the reel look identical; sampleAt never assumes spacing),
 *   • round every channel to the precision the RENDERER can actually show
 *     (1 cm of position, 0.1° of heading — below one pixel at any framing),
 *   • cap the sample count, decimating harder rather than truncating, so a
 *     long drive is stored WHOLE at a coarser cadence instead of cut short.
 *
 * Measured: 60 s 250 KB → 87 KB, 300 s 1.25 MB → 146 KB. The store gzips on
 * top of that (attemptStore.ts) and lands at ~11 KB and ~19 KB respectively.
 *
 * The output is still a plain `ScenarioTrace`: it parses through
 * parseScenarioTrace and feeds the ghost player, the 2D replay and the
 * headless reel renderer unchanged. That is the entire point — the reduction
 * must never become a second format.
 *
 * What is deliberately LOST: sub-centimetre position and 20 Hz detail. The
 * stored trace is a DISPLAY artifact, never grading evidence — the official
 * verdict stays the server-rebuilt catalog event log (wire.ts), which is why
 * losing precision here costs nothing that matters.
 *
 * Pure TS, browser-safe (the client reduces before it uploads) — no node
 * built-ins, so this can sit on the sim/traces barrel.
 */

import { TRACE_VERSION, type ScenarioTrace, type TraceEvent, type TraceSample } from "./types";

/** Stored cadence, Hz. Half the recording cadence: the difference is
 *  invisible once sampleAt interpolates, and it halves the bytes. */
export const STORED_TRACE_HZ = 10;

/** Hard sample ceiling — 120 s at STORED_TRACE_HZ. Longer drives are
 *  decimated further (never truncated: a reel of the first two minutes of a
 *  five-minute drive would cut the mistake out). */
export const MAX_STORED_SAMPLES = 1200;

/** Sparse-event ceiling. Scenario drills author a handful; a client sending
 *  more is either broken or probing. */
export const MAX_STORED_EVENTS = 128;

/** Annotation copy is authored, not free text — cap it anyway (the wire
 *  accepts this shape from a browser). */
export const MAX_STORED_EVENT_TEXT = 200;

// Per-channel storage precision. Chosen against what the renderer can SHOW at
// clip framing (1280×720, car ~2 m wide): 1 cm of position and 0.1° of yaw are
// both far below one pixel, and 0.001 rad of steer is below one degree of
// wheel rotation.
const T_DP = 2; // 10 ms — finer than one stored frame
const POS_DP = 2; // 1 cm
const HEADING_DP = 1; // 0.1°
const STEER_DP = 3; // ~0.06°
const SPEED_DP = 1; // 0.1 km/h

function round(v: number, dp: number): number {
  const f = 10 ** dp;
  // +0 normalises -0 → 0: JSON keeps the sign otherwise, and a stored "-0"
  // is a gratuitous diff between two identical drives.
  return Math.round(v * f) / f + 0;
}

function compactSample(s: TraceSample, tSec: number): TraceSample {
  return {
    tSec,
    x: round(s.x, POS_DP),
    y: round(s.y, POS_DP),
    headingDeg: round(s.headingDeg, HEADING_DP),
    steerRad: round(s.steerRad, STEER_DP),
    speedKmh: round(s.speedKmh, SPEED_DP),
    gear: s.gear,
    indicator: s.indicator,
    brakeOn: s.brakeOn,
    throttleOn: s.throttleOn,
  };
}

function compactEvent(e: TraceEvent): TraceEvent {
  const out: TraceEvent = { tSec: round(e.tSec, T_DP), kind: e.kind };
  if (e.textBg !== undefined) out.textBg = e.textBg.slice(0, MAX_STORED_EVENT_TEXT);
  if (e.detail !== undefined) out.detail = e.detail.slice(0, MAX_STORED_EVENT_TEXT);
  return out;
}

/**
 * Reduce a freshly recorded attempt to its stored form, or null when there is
 * nothing worth storing (playback interpolates, so fewer than two samples is
 * not a trace — the parse.ts rule).
 *
 * Deterministic: the same input always reduces to the same bytes, so a
 * re-upload of the same drive can never produce a different row.
 */
export function compactTraceForStorage(trace: ScenarioTrace): ScenarioTrace | null {
  const src = trace.samples;
  if (src.length < 2) return null;

  const span = src[src.length - 1].tSec - src[0].tSec;
  if (!(span > 0)) return null;
  // Two floors on the sampling period: the nominal stored cadence, and
  // whatever a drive this long needs to fit the ceiling. MAX-1 intervals span
  // the whole drive, so the march below can pick at most MAX samples.
  const period = Math.max(1 / STORED_TRACE_HZ, span / (MAX_STORED_SAMPLES - 1));

  // Scheduled decimation — the recorder's own rule (push when the clock has
  // reached the next slot, then march the slot forward from the sample that
  // was actually taken), so an irregular feed re-anchors instead of drifting.
  const samples: TraceSample[] = [];
  let nextT = -Infinity;
  let prevT = -Infinity;
  for (const s of src) {
    if (s.tSec + 1e-9 < nextT) continue;
    nextT = s.tSec + period;
    const t = round(s.tSec, T_DP);
    // Rounding can collapse two kept samples onto the same centisecond when
    // the source feed stutters; parse.ts demands STRICTLY ascending tSec, so
    // the collision drops rather than poisoning the whole trace.
    if (t <= prevT) continue;
    prevT = t;
    samples.push(compactSample(s, t));
  }
  if (samples.length < 2) return null;

  // Pin the tail to the real end of the drive: durationSec is what every
  // consumer (timeline, clip window, reel length) reads, and a decimated tail
  // would quietly shorten the student's own drive. Replacing the last kept
  // sample rather than appending keeps the ceiling above exact.
  const last = src[src.length - 1];
  const lastT = round(last.tSec, T_DP);
  if (lastT > samples[samples.length - 2].tSec && lastT !== samples[samples.length - 1].tSec) {
    samples[samples.length - 1] = compactSample(last, lastT);
  }

  const events: TraceEvent[] = [];
  let prevE = -Infinity;
  for (const e of trace.events) {
    if (events.length >= MAX_STORED_EVENTS) break;
    const c = compactEvent(e);
    // parse.ts allows ties but not going backwards; rounding can only pull an
    // event earlier, so re-clamp instead of dropping the teach copy.
    if (c.tSec < prevE) c.tSec = prevE;
    prevE = c.tSec;
    events.push(c);
  }

  return {
    meta: {
      scenarioId: trace.meta.scenarioId,
      kind: trace.meta.kind,
      version: TRACE_VERSION,
      durationSec: samples[samples.length - 1].tSec,
    },
    samples,
    events,
  };
}
