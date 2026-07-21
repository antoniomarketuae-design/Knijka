/**
 * THE SHARED CLIP-MANIFEST CONTRACT — platform/public/clips/manifest.json.
 *
 * The /dev/clip-capture rig WRITES it (via /api/dev/clips); the clip gallery
 * and the theory why-panel READ it. Both sides build against exactly this
 * shape — change it only in lockstep with the readers.
 *
 * Doc 66 (CaptureScene v2) ADDITIVE fields — version stays 1 so every reader
 * keeps parsing; readers that predate them simply ignore them:
 *   keyframes — the five R0 stills saved beside the .webm (Claude inspects
 *               these with vision before the founder sees anything);
 *   actors    — the per-clip R1 checklist (PLAN requiredActors × what the
 *               capture actually staged);
 *   view      — which doc-66 R4 camera the clip was recorded with;
 *   quality   — the environment quality level the recording browser actually
 *               rendered (loadQualityPreset of THAT browser — doc 66 R5:
 *               "the founder's own preset" only holds when the founder's
 *               browser records; recording the level makes a preset mismatch
 *               machine-visible in R0 instead of a founder taste surprise).
 *
 * manifest.json is COMMITTED; the binary .webm clips and .k*.png stills
 * beside it are gitignored and reach staging by scp into the VPS public dir
 * (see platform/public/clips/README.md).
 */

export const CLIPS_MANIFEST_VERSION = 1;

/** Public URL of the manifest (served from platform/public). */
export const CLIPS_MANIFEST_URL = "/clips/manifest.json";

/** The five R0 stills per clip: window start, fault−2, fault, fault+2, end. */
export const CLIP_KEYFRAME_COUNT = 5;

/** One row of the R1 actor checklist (capturePlan.buildActorChecklist). */
export interface ClipActorCheck {
  kind: string;
  label: string;
  present: boolean;
}

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
  /** R0 keyframe still URLs (`/clips/<id>.k0..k4.png`), in playback order. */
  keyframes?: string[];
  /** R1 actor checklist the rig logged for this recording. */
  actors?: ClipActorCheck[];
  /** Doc 66 R4 camera the clip used. */
  view?: "exterior" | "cockpit" | "exterior+dashboard";
  /** Environment quality level the recording actually rendered (R5 audit). */
  quality?: "low" | "med" | "high";
}

export interface ClipManifest {
  version: typeof CLIPS_MANIFEST_VERSION;
  clips: ClipManifestEntry[];
}

/** Public clip URL for a manifest id. */
export function clipSrcFor(id: string): string {
  return `/clips/${id}.webm`;
}

/** Public keyframe-still URL for a manifest id + still index (0..4). */
export function clipKeyframeSrc(id: string, index: number): string {
  return `/clips/${id}.k${index}.png`;
}

/** Strict manifest id shape — also the API route's path-traversal guard. */
export const CLIP_ID_RE = /^[a-z0-9][a-z0-9-]*__m\d+$/;
