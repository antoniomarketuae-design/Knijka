/**
 * webm-duration workaround (pure, node-testable).
 *
 * MediaRecorder writes .webm files with NO duration index: a fresh <video>
 * element reports `duration === Infinity` (occasionally `NaN`, or `0` before
 * any metadata has loaded) and its scrubber is dead — the founder cannot drag
 * a mistake clip to the fault. The long-standing browser fix is to force the
 * demuxer to index the file by seeking PAST the end once; the element then
 * reports the real duration, and we seek back to the start.
 *
 * This helper is the pure decision at the centre of that dance: given what the
 * element reports right now and whether we already issued the probe seek, it
 * returns the next step. The component wires it to `loadedmetadata` +
 * `durationchange` and does nothing else — no branching in the view.
 */

/** A time no real clip reaches — seeking here forces the demuxer to index. */
export const DURATION_PROBE_SEEK_SEC = 1e101;

export type DurationFixStep =
  /** duration is Infinity/NaN/0 — seek far to force the browser to index it. */
  | { action: "probe"; seekToSec: number }
  /** a finite duration arrived AFTER our probe — seek home to 0. */
  | { action: "reset"; seekToSec: number }
  /** nothing to do: already usable, or already probing and still waiting. */
  | { action: "none" };

/**
 * One step of the webm-duration workaround.
 *
 * @param reportedDurationSec  `video.duration` right now — Infinity/NaN/0
 *                             before the file is indexed, finite after.
 * @param probing              whether we already issued the far seek and are
 *                             waiting for the real duration to settle.
 */
export function durationFixStep(
  reportedDurationSec: number,
  probing: boolean,
): DurationFixStep {
  const usable = Number.isFinite(reportedDurationSec) && reportedDurationSec > 0;
  if (!usable) {
    // Not indexed yet. Issue the far seek exactly once; if we already did,
    // wait for the duration to arrive rather than seeking again in a loop.
    return probing
      ? { action: "none" }
      : { action: "probe", seekToSec: DURATION_PROBE_SEEK_SEC };
  }
  // A finite, usable duration is in hand. If it only arrived because we
  // probed, seek back to the start; a naturally-finite duration (never
  // probed — e.g. a real mp4) needs nothing.
  return probing ? { action: "reset", seekToSec: 0 } : { action: "none" };
}
