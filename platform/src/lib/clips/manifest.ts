/**
 * THE SHARED CLIP-MANIFEST CONTRACT — platform/public/clips/manifest.json.
 *
 * The /dev/clip-capture rig WRITES it (via /api/dev/clips); the clip gallery
 * and the theory why-panel READ it. Both sides build against exactly this
 * shape — change it only in lockstep with the readers.
 *
 * manifest.json is COMMITTED; the binary .webm clips beside it are
 * gitignored and reach staging by scp into the VPS public dir (see
 * platform/public/clips/README.md).
 */

export const CLIPS_MANIFEST_VERSION = 1;

/** Public URL of the manifest (served from platform/public). */
export const CLIPS_MANIFEST_URL = "/clips/manifest.json";

export interface ClipManifestEntry {
  /** `<templateId>__m<mistakeIndex>` (learning clipIdFor). */
  id: string;
  templateId: string;
  mistakeIndex: number;
  /** Repo-relative trace path, EXACTLY ScenarioSpec.mistakes[i].traceRef.path. */
  tracePath: string;
  /** Public clip URL: `/clips/<id>.webm`. */
  src: string;
  durationSec: number;
  /** ISO timestamp of the recording. */
  recordedAt: string;
  /** STORED mistake title (ADR-002 — never invented). */
  titleBg: string;
}

export interface ClipManifest {
  version: typeof CLIPS_MANIFEST_VERSION;
  clips: ClipManifestEntry[];
}

/** Public clip URL for a manifest id. */
export function clipSrcFor(id: string): string {
  return `/clips/${id}.webm`;
}

/** Strict manifest id shape — also the API route's path-traversal guard. */
export const CLIP_ID_RE = /^[a-z0-9][a-z0-9-]*__m\d+$/;
