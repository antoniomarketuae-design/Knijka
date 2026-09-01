/**
 * Defensive parse of a stored ScenarioTrace — the store.ts law: NEVER trust
 * stored JSON. Traces live as versioned JSON next to their maps (and later in
 * DB rows for attempts); a foreign/corrupt/hand-edited payload must degrade
 * to `null` (caller hides the ghost), never to NaN positions in the world.
 *
 * Manual field-by-field validation (the parseSimSessionEvents pattern) —
 * rebuilds CLEAN objects so extra/unknown fields are dropped and the returned
 * value is exactly the declared shape.
 */

import {
  TRACE_VERSION,
  type ScenarioTrace,
  type TraceEvent,
  type TraceEventKind,
  type TraceIndicator,
  type TraceKind,
  type TraceMeta,
  type TraceSample,
} from "./types";

const TRACE_KINDS: readonly TraceKind[] = ["shadow", "mistake", "attempt"];
const INDICATORS: readonly TraceIndicator[] = ["off", "left", "right"];
const EVENT_KINDS: readonly TraceEventKind[] = [
  "glance-left",
  "glance-right",
  "glance-rear",
  "glance-shoulder",
  "signal-on",
  "signal-off",
  "driveline",
  "annotation",
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function finiteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function parseMeta(v: unknown): TraceMeta | null {
  if (!isRecord(v)) return null;
  if (v.version !== TRACE_VERSION) return null;
  if (typeof v.scenarioId !== "string" || v.scenarioId.length === 0) return null;
  if (typeof v.kind !== "string" || !TRACE_KINDS.includes(v.kind as TraceKind)) return null;
  if (!finiteNumber(v.durationSec) || v.durationSec < 0) return null;
  return {
    scenarioId: v.scenarioId,
    kind: v.kind as TraceKind,
    version: TRACE_VERSION,
    durationSec: v.durationSec,
  };
}

function parseSample(v: unknown): TraceSample | null {
  if (!isRecord(v)) return null;
  if (
    !finiteNumber(v.tSec) ||
    !finiteNumber(v.x) ||
    !finiteNumber(v.y) ||
    !finiteNumber(v.headingDeg) ||
    !finiteNumber(v.steerRad) ||
    !finiteNumber(v.speedKmh) ||
    !finiteNumber(v.gear)
  ) {
    return null;
  }
  if (typeof v.indicator !== "string" || !INDICATORS.includes(v.indicator as TraceIndicator)) {
    return null;
  }
  if (typeof v.brakeOn !== "boolean" || typeof v.throttleOn !== "boolean") return null;
  return {
    tSec: v.tSec,
    x: v.x,
    y: v.y,
    headingDeg: v.headingDeg,
    steerRad: v.steerRad,
    speedKmh: v.speedKmh,
    gear: v.gear,
    indicator: v.indicator as TraceIndicator,
    brakeOn: v.brakeOn,
    throttleOn: v.throttleOn,
  };
}

function parseEvent(v: unknown): TraceEvent | null {
  if (!isRecord(v)) return null;
  if (!finiteNumber(v.tSec) || v.tSec < 0) return null;
  if (typeof v.kind !== "string" || !EVENT_KINDS.includes(v.kind as TraceEventKind)) {
    return null;
  }
  const out: TraceEvent = { tSec: v.tSec, kind: v.kind as TraceEventKind };
  if (typeof v.textBg === "string") out.textBg = v.textBg;
  if (typeof v.detail === "string") out.detail = v.detail;
  return out;
}

/**
 * Parse an unknown value into a ScenarioTrace, or null when anything about it
 * is off: wrong version, missing/NaN fields, unordered timestamps, unknown
 * enum members. At least TWO samples are required (playback interpolates).
 */
export function parseScenarioTrace(value: unknown): ScenarioTrace | null {
  if (!isRecord(value)) return null;
  const meta = parseMeta(value.meta);
  if (!meta) return null;
  if (!Array.isArray(value.samples) || value.samples.length < 2) return null;
  if (!Array.isArray(value.events)) return null;

  const samples: TraceSample[] = [];
  let prevT = -Infinity;
  for (const raw of value.samples) {
    const s = parseSample(raw);
    if (!s) return null;
    if (s.tSec <= prevT) return null; // strictly ascending
    prevT = s.tSec;
    samples.push(s);
  }
  if (samples[0].tSec < 0) return null;

  const events: TraceEvent[] = [];
  let prevE = -Infinity;
  for (const raw of value.events) {
    const e = parseEvent(raw);
    if (!e) return null;
    if (e.tSec < prevE) return null; // ascending (ties allowed)
    prevE = e.tSec;
    events.push(e);
  }

  return { meta, samples, events };
}

/** JSON string for storage — the inverse of parseScenarioTrace. */
export function serializeScenarioTrace(trace: ScenarioTrace): string {
  return JSON.stringify(trace);
}
