/**
 * =============================================================================
 * THE TWO NUMBERS, MEASURED OFF DISK — NOT INHERITED FROM A BRIEF.
 *
 * The pre-drive tutorial card now asks the student before it spends his data:
 * a poster frame paints first and a button says «▶ Пусни видеото · 2,0 MB».
 * That sentence is a PROMISE ABOUT A FILE, and the only way it stays true is
 * if something stats the file. This is that something.
 *
 *   SESSION DOWNLOAD — what one student's phone pulls. Poster (tens of KB) for
 *     a card he only reads; poster + `clip.bytes` for a card he chose to play.
 *     This is the number tap-to-play moves, and the number on the button.
 *   DEPLOY SIZE — what sits in platform/public/, in git and on the VPS. It is
 *     the SUM of every clip and poster, it is unaffected by lazy playback, and
 *     it is reported below so nobody confuses the two again. (The hard ceiling
 *     on it belongs to tools/assets/publicBudget.test.mjs, not here.)
 *
 * WHY A DECLARED BYTE COUNT AT ALL, rather than a HEAD request at runtime: the
 * button must be honest before the network is touched — asking the server how
 * big the file is would itself be a request, on the connection we are trying
 * not to spend. So the number is authored, and this test is the thing that
 * keeps an authored number honest after a re-render swaps the mp4.
 * =============================================================================
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRE_DRIVE_TUTORIAL_CLIPS, preDriveClipWeightBg } from "../tutorial";

/** platform/public — the deploy root every `src` is resolved against. */
const PUBLIC_DIR = resolve(__dirname, "../../../../../public");

const CLIPS = Object.entries(PRE_DRIVE_TUTORIAL_CLIPS).filter(
  (entry): entry is [string, NonNullable<(typeof entry)[1]>] => entry[1] !== undefined,
);

const publicPath = (src: string) => resolve(PUBLIC_DIR, src.replace(/^\//, ""));

describe("every authored clip is a file that really exists", () => {
  it("the seam is empty ON PURPOSE, and cannot fill up by accident", () => {
    // THE GUARD IS INVERTED, NOT REMOVED. It was written to stop the suite below
    // going vacuously green if the registry emptied — the exact shape of green
    // this project has been burned by. On 2026-08-11 the registry emptied FOR A
    // REASON, so the same guard now protects the decision instead of the count:
    // it fails the moment a clip appears, forcing whoever adds one to come here
    // and say so deliberately.
    //
    // WHY IT IS EMPTY. `adjust-seat.mp4` shipped for one day and was pulled: at
    // t = 7.5 s of 10 the driver's leg is straight, foot on the dash fascia, no
    // pedal beneath it — under a caption reading «Свит крак на педала». It
    // demonstrated the fault the step exists to prevent, which is a THEO-4
    // breach and strictly worse than the inline-SVG still it replaced.
    //
    // BEFORE RE-ADDING ANY CLIP, read docs/simulation/90_FR19_CLIP_PRODUCTION_SPEC.md:
    // its §7.2 gate (five frames at t = 0, ¼D, ½D, ¾D, D−0.2 s, each read at the
    // real 320 px delivery width AND at ≥2.5× on the body part the caption names
    // and on the wheel boss for ADR-001), and its conclusion that eight of the
    // thirteen steps should be rendered by OUR OWN simulator rather than
    // generated, while five keep the still permanently.
    expect(CLIPS).toHaveLength(0);
  });

  it.each(CLIPS)("%s — the mp4 is on disk", (_stepId, clip) => {
    expect(existsSync(publicPath(clip.src)), clip.src).toBe(true);
  });

  it.each(CLIPS)("%s — the poster is on disk", (_stepId, clip) => {
    expect(existsSync(publicPath(clip.posterSrc)), clip.posterSrc).toBe(true);
  });

  it.each(CLIPS)("%s — the poster really is a WebP, not a renamed PNG", (_stepId, clip) => {
    // RIFF....WEBP. A poster that is secretly a 300 KB PNG would pass a size
    // check by luck and blow the cheap-first-paint promise on the next clip.
    const head = readFileSync(publicPath(clip.posterSrc)).subarray(0, 12);
    expect(head.subarray(0, 4).toString("latin1"), clip.posterSrc).toBe("RIFF");
    expect(head.subarray(8, 12).toString("latin1"), clip.posterSrc).toBe("WEBP");
  });
});

// `it.each([])` leaves a describe with no tests, which vitest fails at the SUITE
// level — a red that says nothing about the product. Skipped while the registry
// is empty by decision; the first test above is what notices if it stops being
// empty, and this block arms itself again on the same day.
describe.skipIf(CLIPS.length === 0)("the price on the button is the price on disk", () => {
  it.each(CLIPS)("%s — declared bytes match the actual file exactly", (_stepId, clip) => {
    // Exact, not a tolerance: the file is right there, and „about right" is how
    // a 2 MB label ends up over a 9 MB download.
    expect(statSync(publicPath(clip.src)).size, clip.src).toBe(clip.bytes);
  });

  it.each(CLIPS)("%s — the poster costs a fraction of the clip", (_stepId, clip) => {
    // The whole argument for tap-to-play is that the cheap thing is CHEAP. 5%
    // is a generous ceiling; adjust-seat measures 1.4%.
    const posterBytes = statSync(publicPath(clip.posterSrc)).size;
    expect(posterBytes, `${clip.posterSrc} is not cheap enough to be a poster`).toBeLessThan(
      clip.bytes * 0.05,
    );
    expect(posterBytes, `${clip.posterSrc} is suspiciously small`).toBeGreaterThan(2_000);
  });
});

describe("the report — deploy size and session download are not the same number", () => {
  it("prints both, so the next brief does not have to guess", () => {
    const deployBytes = CLIPS.reduce(
      (sum, [, c]) => sum + statSync(publicPath(c.src)).size + statSync(publicPath(c.posterSrc)).size,
      0,
    );
    const posterOnlyBytes = CLIPS.reduce(
      (sum, [, c]) => sum + statSync(publicPath(c.posterSrc)).size,
      0,
    );

    // A STUDENT WHO READS EVERY CARD AND PLAYS NOTHING pays the posters only.
    // Before tap-to-play that same student paid the full deploy weight of every
    // card that opened, because the element carried `autoPlay`.
    //
    // Both are 0 while the registry is empty (see the first test), and 0 < 0 is
    // false — so the ratio is only meaningful once a clip is authored. Guarded
    // rather than deleted, because this assertion is what proves tap-to-play is
    // still doing its job the day clips come back.
    if (deployBytes > 0) expect(posterOnlyBytes).toBeLessThan(deployBytes * 0.1);

    // Not an assertion about the world, just the two numbers on the record.
    // eslint-disable-next-line no-console
    console.log(
      `[pre-drive clips] deploy=${preDriveClipWeightBg(deployBytes)} ` +
        `· read-only session=${preDriveClipWeightBg(posterOnlyBytes)} ` +
        `· per clip played=${CLIPS.map(([id, c]) => `${id}:${preDriveClipWeightBg(c.bytes)}`).join(", ")}`,
    );
  });
});
