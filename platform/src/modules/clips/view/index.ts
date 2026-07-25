/**
 * clips/view — the BROWSER-side public surface of the clip pipeline.
 *
 * Everything re-exported here is pure logic over plain data: the manifest
 * reader, the why-panel fold and the webm-duration workaround. Nothing here
 * imports the simulator, and that is a load-bearing property, not an accident —
 * `@/modules/clips` (the server/build barrel) reaches the scenario catalogue
 * through the why-panel resolver, so a client component that imported the wrong
 * barrel would ship ~737 KB of scenario templates to draw a card. That is
 * exactly the regression audit M-26 measured on /theory/practice and the exam
 * runner.
 *
 * `__tests__/view-barrel-weight.test.ts` walks this barrel's static module
 * graph and fails if the simulator ever becomes reachable from it. Add nothing
 * here that would trip it — the 2D canvas cores under `../replay/` intentionally
 * live outside this barrel for that reason and are imported by path.
 */

// The manifest — the reader half of the capture rig's contract (writer twin:
// ../capture/manifest.ts). Missing/malformed manifest reads as "no clips" and
// every reader falls back to the 2D canvas replay.
export {
  CLIP_MANIFEST_URL,
  CLIP_MANIFEST_VERSION,
  FAULT_KEYFRAME_INDEX,
  clipForTracePath,
  familyPrefixOf,
  fetchClipManifest,
  formatClipDuration,
  parseClipManifest,
  posterFrameFor,
  resetClipManifestCache,
} from "./clipManifest";
export type { MistakeClip, MistakeClipActorCheck } from "./clipManifest";

// The why-panel fold (THEO-2 Stage 1, doc 64) — submitted answer → everything
// <WhyPanel> renders. ADR-002: stored text verbatim, never generated.
export {
  AVOIDED_MISTAKE_TOGGLE_BG,
  CORRECT_LEAD_IN_BG,
  WHY_NOT_HEADER_BG,
  WHY_YES_HEADER_BG,
  buildWhyPanelModel,
  mistakeExperienceHref,
  simulatorDrillHref,
  traceUrlForRepoPath,
} from "./whyPanelModel";
export type {
  WhyPanelModel,
  WhyPanelOptionSource,
  WhyPanelPictureModel,
  WhyPanelPictureSign,
  WhyPanelReplayModel,
  WhyPanelSource,
} from "./whyPanelModel";

// The MediaRecorder duration workaround — a <video> over a rig-recorded .webm
// reports `Infinity` until the demuxer is forced to index the file.
export { DURATION_PROBE_SEEK_SEC, durationFixStep } from "./webmDuration";
export type { DurationFixStep } from "./webmDuration";
