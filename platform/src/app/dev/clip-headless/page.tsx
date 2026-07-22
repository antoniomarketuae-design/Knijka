import { notFound } from "next/navigation";
import { CLIP_PLAN, clipPilotList } from "@/modules/learning";
import { HeadlessClipClient } from "./headless-client";

/**
 * Headless clip renderer (doc 66 · doc 69) — DEV BUILDS ONLY.
 *
 * The OFFLINE twin of /dev/clip-capture. Where clip-capture screen-records the
 * scene in real time (needs a visible, GPU-backed, foreground tab — the founder's
 * machine), this route mounts the SAME CaptureScene but exposes a deterministic
 * `window.__clipHeadless` control surface (seek one clock value, read the fresh-
 * frame count, read the R1 checklist). A Node/Playwright driver
 * (tools/clips/headless/render-clip.mjs) then steps the shared clock frame by
 * frame in HEADLESS Chromium (SwiftShader — no GPU needed), screenshots each
 * frame, and stitches them with ffmpeg. No real-time recording, no human, no
 * memory pile-up: Claude produces every clip himself.
 *
 * The run is built through the exported loadRun — byte-identical window /
 * keyframe times / framing / cabin channels to the real-time rig. In production
 * this route 404s (the dev-surface convention).
 */
export default function ClipHeadlessDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <HeadlessClipClient pilot={clipPilotList()} plan={CLIP_PLAN} />;
}
