/**
 * Capture-batch selection math (pure, node-testable).
 *
 * The unattended batch (dev/clip-capture ?auto=1) can die part-way — the
 * pilot-v2 recording stalled at ~13/20 and left the founder with silently
 * STALE clips: old .webm files that looked "recorded" but predated the run.
 * This helper answers „which pilot clips still need (re-)recording?" so the
 * „запиши само липсващите" flow re-runs exactly those and nothing else.
 *
 * A clip needs (re-)recording when its .webm is MISSING or STALE:
 *   - no manifest entry at all → never recorded;
 *   - a manifest entry whose recordedAt is older than this batch began → the
 *     last run failed to refresh it (the silently-stale case);
 *   - a manifest entry with an unparseable recordedAt → treat as stale.
 *
 * When no batch baseline is known (`since === null` — a fresh page load that
 * never ran a full batch), a PRESENT entry counts as fresh: without a baseline
 * there is nothing to call it stale against, so only entirely-absent clips are
 * selected.
 */

/** The subset of a manifest clip this math needs. */
export interface RecordedClipLike {
  recordedAt: string;
}

/**
 * Pilot ids still missing a fresh recording, in pilot order.
 *
 * @param pilot          the full pilot list (each carries its manifest id).
 * @param manifestById   id → the clip currently in the manifest (absent = not
 *                       yet recorded).
 * @param since          ISO timestamp the batch began, or null when unknown.
 */
export function missingFreshClips(
  pilot: readonly { id: string }[],
  manifestById: ReadonlyMap<string, RecordedClipLike>,
  since: string | null,
): string[] {
  const startedMs = since === null ? null : Date.parse(since);
  const haveBaseline = startedMs !== null && Number.isFinite(startedMs);
  const out: string[] = [];
  for (const entry of pilot) {
    const clip = manifestById.get(entry.id);
    if (clip === undefined) {
      out.push(entry.id); // never recorded
      continue;
    }
    if (!haveBaseline) continue; // present + no baseline → counts as fresh
    const recordedMs = Date.parse(clip.recordedAt);
    if (!Number.isFinite(recordedMs) || recordedMs < startedMs) {
      out.push(entry.id); // older than this batch (or unparseable) → stale
    }
  }
  return out;
}
