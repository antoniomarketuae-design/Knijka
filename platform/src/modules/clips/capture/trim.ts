/**
 * Clip trim-window math (pure, node-testable) — clips must be short and
 * CENTERED ON THE FAULT, not the whole demo drive.
 *
 * Fault moment: mistake traces carry no violation events (the rule engine
 * grades live sessions, not recordings) — but the authored annotations follow
 * a strict convention across all 300 committed mistake traces: t=0 narrates
 * the setup („Грешката: …"), MID-RUN annotations narrate the fault as it
 * lands, the final annotation (at/near the end) is the moral or the crash.
 * So the fault timestamp is:
 *   1. the FIRST mid-run annotation (0.5 s < t < duration − 0.5 s), else
 *   2. the LAST annotation after t=0 (the crash/conviction), else
 *   3. the trace end.
 *
 * Window: [max(0, t−8), min(end, t+4)], then grown backward (and forward on
 * very short traces) to the 10 s minimum where the trace allows. A trace
 * shorter than 10 s yields the whole trace — never padded, never looped.
 */

/** Structural slice of ScenarioTrace the math needs (keeps tests tiny). */
export interface TrimTraceLike {
  meta: { durationSec: number };
  events: ReadonlyArray<{ tSec: number; kind: string }>;
}

export const CLIP_PRE_FAULT_S = 8;
export const CLIP_POST_FAULT_S = 4;
export const CLIP_MIN_S = 10;
/** Margin that separates a "mid-run" annotation from the t=0 setup / the
 *  end-of-trace moral. */
const EDGE_MARGIN_S = 0.5;

export interface RecordingWindow {
  startSec: number;
  endSec: number;
}

/** The fault timestamp of a mistake trace (see the header convention). */
export function faultTimeSec(trace: TrimTraceLike): number {
  const duration = trace.meta.durationSec;
  let last: number | null = null;
  for (const e of trace.events) {
    if (e.kind !== "annotation") continue;
    if (e.tSec > EDGE_MARGIN_S && e.tSec < duration - EDGE_MARGIN_S) return e.tSec;
    if (e.tSec > 0) last = e.tSec;
  }
  return last ?? duration;
}

/** [max(0, t−8), min(end, t+4)] grown to the 10 s floor where possible. */
export function recordingWindow(durationSec: number, faultSec: number): RecordingWindow {
  const t = Math.min(Math.max(faultSec, 0), durationSec);
  let startSec = Math.max(0, t - CLIP_PRE_FAULT_S);
  let endSec = Math.min(durationSec, t + CLIP_POST_FAULT_S);
  if (endSec - startSec < CLIP_MIN_S) {
    startSec = Math.max(0, endSec - CLIP_MIN_S);
  }
  if (endSec - startSec < CLIP_MIN_S) {
    endSec = Math.min(durationSec, startSec + CLIP_MIN_S);
  }
  return { startSec, endSec };
}

/** Fault detection + window in one step (what the capture rig calls). */
export function clipWindowFor(trace: TrimTraceLike): RecordingWindow {
  return recordingWindow(trace.meta.durationSec, faultTimeSec(trace));
}
