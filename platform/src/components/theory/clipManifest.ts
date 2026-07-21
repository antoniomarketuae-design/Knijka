/**
 * Clip manifest — the reader half of the shared pilot contract (docs 62..64
 * follow-up): the capture rig replays each template mistake in the REAL 3D
 * engine and WRITES public/clips/manifest.json; the why-panel, the
 * consequence overlay and the /review/clips gallery READ it. Pure logic +
 * one tiny cached fetch — no React, node-testable.
 *
 * Contract (version 1):
 *   { version: 1, clips: [ { id: "<templateId>__m<mistakeIndex>", templateId,
 *     mistakeIndex, tracePath, src: "/clips/<id>.webm", durationSec,
 *     recordedAt, titleBg } ] }
 *
 * `tracePath` is the content/traces/… repo path EXACTLY as
 * ScenarioSpec.mistakes[i].traceRef.path — matching normalizes both sides
 * through traceUrlForRepoPath, so callers may hold either the repo path or
 * the public /traces/… URL.
 *
 * Degradation is the law here: the .webm binaries live OUTSIDE git (scp'd to
 * staging — public/clips/README.md), so a fresh clone has none. A missing or
 * malformed manifest reads as "no clips" and every reader falls back to the
 * 2D canvas replay (the founder-chosen placeholder).
 */

import { traceUrlForRepoPath } from "./whyPanelModel";

/** One row of the R1 actor checklist the rig recorded with the clip (doc 66
 *  — writer twin: lib/clips/manifest.ClipActorCheck). `present` is the HONEST
 *  in-frame-at-the-fault verdict (capturePlan.actorSpawned), so the gallery
 *  can flag „ЛИПСВА" before the founder ever presses play. */
export interface MistakeClipActorCheck {
  kind: string;
  label: string;
  present: boolean;
}

/** One pre-produced mistake clip, as the capture rig recorded it. */
export interface MistakeClip {
  /** "<templateId>__m<mistakeIndex>" — also the .webm basename. */
  id: string;
  templateId: string;
  mistakeIndex: number;
  /** content/traces/… exactly as ScenarioSpec.mistakes[i].traceRef.path. */
  tracePath: string;
  /** Public video URL, "/clips/<id>.webm". */
  src: string;
  durationSec: number;
  /** ISO timestamp of the recording. */
  recordedAt: string;
  /** STORED mistake titleBg (ADR-002 — copied, never generated). */
  titleBg: string;
  /**
   * Keyframe still URLs the rig saved alongside the clip (doc 66 R0 — the
   * vision-inspection strip). OPTIONAL and lenient: absent/malformed reads as
   * "no keyframes" so pre-R0 manifests keep parsing; the gallery degrades to
   * video-only.
   */
  keyframes?: string[];
  /**
   * R1 actor checklist the rig logged for this recording (doc 66). OPTIONAL
   * and lenient like keyframes: absent/malformed reads as "no checklist"
   * (pre-v2 recordings), a malformed ROW is dropped, and an EMPTY valid list
   * is kept — it means "the card requires no actors", which is information.
   */
  actors?: MistakeClipActorCheck[];
  /** Doc 66 R4 camera the clip used. OPTIONAL (pre-v2 rigs never wrote it). */
  view?: string;
}

export const CLIP_MANIFEST_URL = "/clips/manifest.json";
export const CLIP_MANIFEST_VERSION = 1;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** One manifest entry, or null when it does not honor the contract. */
function parseClip(raw: unknown): MistakeClip | null {
  if (!isRecord(raw)) return null;
  const { id, templateId, mistakeIndex, tracePath, src, durationSec, recordedAt, titleBg } = raw;
  if (typeof id !== "string" || id.length === 0) return null;
  if (typeof templateId !== "string" || templateId.length === 0) return null;
  if (typeof tracePath !== "string" || tracePath.length === 0) return null;
  if (typeof src !== "string" || src.length === 0) return null;
  if (typeof titleBg !== "string") return null;
  if (typeof mistakeIndex !== "number" || !Number.isInteger(mistakeIndex) || mistakeIndex < 0) {
    return null;
  }
  if (typeof durationSec !== "number" || !Number.isFinite(durationSec) || durationSec < 0) {
    return null;
  }
  const clip: MistakeClip = {
    id,
    templateId,
    mistakeIndex,
    tracePath,
    src,
    durationSec,
    recordedAt: typeof recordedAt === "string" ? recordedAt : "",
    titleBg,
  };
  // Keyframes (doc 66 R0): keep only non-empty string URLs; anything else
  // degrades to "no keyframes" without dropping the clip.
  if (Array.isArray(raw.keyframes)) {
    const frames = raw.keyframes.filter((k): k is string => typeof k === "string" && k.length > 0);
    if (frames.length > 0) clip.keyframes = frames;
  }
  // R1 actor checklist (doc 66): valid rows only; a malformed row is dropped,
  // a non-array degrades to "no checklist" — never blanks the clip. A valid
  // EMPTY list is kept (= the card requires no actors).
  if (Array.isArray(raw.actors)) {
    const rows: MistakeClipActorCheck[] = [];
    for (const row of raw.actors) {
      if (!isRecord(row)) continue;
      const { kind, label, present } = row;
      if (typeof kind !== "string" || kind.length === 0) continue;
      if (typeof label !== "string") continue;
      if (typeof present !== "boolean") continue;
      rows.push({ kind, label, present });
    }
    clip.actors = rows;
  }
  // Doc 66 R4 camera (lenient string — the writer validates strictly).
  if (typeof raw.view === "string" && raw.view.length > 0) clip.view = raw.view;
  return clip;
}

/**
 * Manifest payload → its clips. Null when the payload as a whole is not the
 * contract (wrong shape/version); individual malformed entries are SKIPPED so
 * one bad row never blanks the panel or the gallery.
 */
export function parseClipManifest(raw: unknown): MistakeClip[] | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== CLIP_MANIFEST_VERSION) return null;
  if (!Array.isArray(raw.clips)) return null;
  const out: MistakeClip[] = [];
  for (const entry of raw.clips) {
    const clip = parseClip(entry);
    if (clip !== null) out.push(clip);
  }
  return out;
}

/**
 * The matcher the why-panel/overlay run: trace path → its clip, or null.
 * Both sides normalize through traceUrlForRepoPath, so "content/traces/…"
 * and "/traces/…" spellings match each other.
 */
export function clipForTracePath(
  clips: readonly MistakeClip[],
  tracePath: string,
): MistakeClip | null {
  const want = traceUrlForRepoPath(tracePath);
  for (const clip of clips) {
    if (traceUrlForRepoPath(clip.tracePath) === want) return clip;
  }
  return null;
}

/** "sc-jx-giveway-b1" → "sc-jx" — the gallery's family filter key. */
export function familyPrefixOf(templateId: string): string {
  const parts = templateId.split("-");
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : templateId;
}

/** Seconds → "m:ss" for the gallery cards. */
export function formatClipDuration(durationSec: number): string {
  const total = Math.max(0, Math.round(durationSec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// The one cached fetch (client side). The manifest is tiny — fetch it once
// per page lifetime and share the promise across every panel mount. Any
// failure (404 on a fresh clone, network, parse) resolves to [] — readers
// fall back to the canvas replay, today's behavior exactly.
// ---------------------------------------------------------------------------

let manifestPromise: Promise<MistakeClip[]> | null = null;

export function fetchClipManifest(): Promise<MistakeClip[]> {
  if (manifestPromise === null) {
    manifestPromise = (async () => {
      try {
        const res = await fetch(CLIP_MANIFEST_URL);
        if (!res.ok) return [];
        return parseClipManifest((await res.json()) as unknown) ?? [];
      } catch {
        return [];
      }
    })();
  }
  return manifestPromise;
}

/** Test seam: forget the cached promise. */
export function resetClipManifestCache(): void {
  manifestPromise = null;
}
