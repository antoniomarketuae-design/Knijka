/**
 * The COMMITTED manifest's poster weight (audit 80, H-10).
 *
 * clipManifest.test.ts pins the parser; this pins the shipped artifact. The
 * fault still `posterFrameFor` returns is fetched eagerly by every browser
 * that renders a wrong-answer why-panel — `preload="none"` does not hold it
 * back — so it is the most-downloaded student-facing asset in the product. It
 * used to be a 1.1 MB full-res PNG painted into a box clamped to 140–240 px
 * tall; 42 of them = 47.2 MB.
 *
 * Two guards, and both must be cheap to keep green:
 *  1. format — every keyframe URL in public/clips/manifest.json is `.webp`.
 *     The headless renderer writes WebP now; the /dev/clip-capture browser rig
 *     still writes PNG (see its HANDOFF), so this is the tripwire that stops a
 *     capture through the old path from quietly re-inflating the posters.
 *     Fix a red here by running `node tools/clips/headless/keyframes-to-webp.mjs`.
 *  2. bytes — a poster stays under the budget. The binaries are gitignored
 *     (public/clips/README.md), so this half only asserts on a machine that
 *     actually HAS them: a fresh clone and CI skip it rather than fail on an
 *     absent file, exactly like every other clip reader degrades.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseClipManifest, posterFrameFor, type MistakeClip } from "./clipManifest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIPS_DIR = path.resolve(HERE, "../../../../public/clips");
const MANIFEST = path.join(CLIPS_DIR, "manifest.json");

/** Generous ceiling over the measured worst case (27.8 KB) — this catches a
 *  1.1 MB regression, it does not police the encoder's fine tuning. */
const MAX_POSTER_BYTES = 120 * 1024;

/** "/clips/x__m0.k2.webp" → the file beside the manifest. */
function fileFor(url: string): string {
  return path.join(CLIPS_DIR, url.replace(/^\/clips\//, ""));
}

describe("public/clips/manifest.json — poster weight", () => {
  const parsed = parseClipManifest(JSON.parse(readFileSync(MANIFEST, "utf8")) as unknown);

  it("is the contract the readers parse", () => {
    expect(parsed).not.toBeNull();
    expect(parsed?.length ?? 0).toBeGreaterThan(0);
  });

  const clips: MistakeClip[] = parsed ?? [];

  it("names every keyframe still in the light format, never PNG", () => {
    for (const clip of clips) {
      const frames = clip.keyframes ?? [];
      expect(frames.length, clip.id).toBe(5);
      for (const url of frames) {
        expect(url, `${clip.id} keyframe`).toMatch(/^\/clips\/[a-z0-9-]+__m\d+\.k[0-4]\.webp$/);
      }
    }
  });

  it("hands the why-panel the FAULT still as its poster", () => {
    for (const clip of clips) {
      expect(posterFrameFor(clip), clip.id).toBe(`/clips/${clip.id}.k2.webp`);
    }
  });

  it("keeps every poster present on this box under the byte budget", () => {
    // Only the stills this machine actually received — the binaries travel by
    // scp, not git, so absence is normal and must not be a failure.
    for (const clip of clips) {
      const poster = posterFrameFor(clip);
      if (poster === undefined) continue;
      const file = fileFor(poster);
      if (!existsSync(file)) continue;
      expect(statSync(file).size, clip.id).toBeLessThan(MAX_POSTER_BYTES);
    }
  });
});
