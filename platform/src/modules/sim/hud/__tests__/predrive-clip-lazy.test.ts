/**
 * =============================================================================
 * FR-19 — „A CLIP COSTS NOTHING UNTIL THE STUDENT ASKS FOR IT."
 *
 * The founder's own words, 2026-08-10:
 *
 *   „each video loads and then disappears, and the next loads when the user
 *    clicks — so he only loads 8.99 MB on this one, and when he presses next,
 *    close that one automatically and load the new one"
 *
 * What was actually shipped when he wrote that: `<video autoPlay muted>`, on a
 * card that OPENS BY ITSELF for the pending step in instruction mode. A
 * seventeen-year-old on a prepaid plan opened Урок 1 and paid for a 2 MB clip
 * he had not asked to watch. That is the defect; everything below is a guard
 * on the four things that fix it.
 *
 * ── WHY THIS IS A SOURCE SCAN AND NOT A RENDER ───────────────────────────────
 * `vitest.config.ts` sets `environment: "node"` — there is no DOM in this
 * suite, and the two existing component tests (`fault-card`,
 * `sim-overlay-dismiss`) use `react-dom/server`. That door is closed here for a
 * specific reason: `PreDriveTutorial` renders through `createPortal` behind a
 * `portalReady` effect, so on the server it renders exactly nothing. A
 * server-markup assertion would pass against an empty string forever.
 *
 * So this file pins the SHAPE OF THE SOURCE, and it is honest about what that
 * is worth: it cannot prove the browser fetched zero bytes. THAT was measured
 * in WebKit on `/dev/predrive-rig` with the network panel open — no request for
 * `adjust-seat.mp4` until the button is pressed — and this file's job is to
 * make sure the code that was measured is still the code that ships.
 * =============================================================================
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const HUD_DIR = resolve(__dirname, "..");
const SOURCE = readFileSync(resolve(HUD_DIR, "PreDriveTutorial.tsx"), "utf8");

/** Comments blanked, line numbering kept — this file's own subject matter is
 *  `autoPlay`, and the header above must never be mistaken for shipped code. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

/** The `<video …>` element as written, attributes only. */
const VIDEO_TAG = /<video\b([\s\S]*?)>/.exec(CODE)?.[1] ?? "";

describe("1 — the card opens at ZERO video bytes", () => {
  it("the element exists to be measured at all", () => {
    expect(VIDEO_TAG, "no <video> in PreDriveTutorial — this file is aimed at nothing").not.toBe(
      "",
    );
  });

  it("`autoPlay` is gone and may never come back", () => {
    // THE DEFECT ITSELF. One word, ~2 MB per card, on a card that auto-opens.
    expect(CODE).not.toMatch(/\bautoPlay\b/);
  });

  it("carries `preload=\"none\"` — not even metadata moves unasked", () => {
    expect(VIDEO_TAG).toMatch(/preload="none"/);
  });

  it("has NO `src` prop: the source is attached by hand, on the tap", () => {
    // `src={…}` rendered as a prop would make React set it on mount, and
    // `preload="none"` only downgrades a fetch — it does not forbid one. The
    // guarantee is that there is no source on the element at all until
    // `playClip` runs.
    expect(VIDEO_TAG).not.toMatch(/\bsrc=/);
    expect(CODE).toMatch(/setAttribute\("src", clip\.src\)/);
    // …and no <source> child, which removeAttribute("src") could never undo.
    expect(CODE).not.toMatch(/<source\b/);
  });

  it("keeps `controls`, `muted` and `playsInline`", () => {
    expect(VIDEO_TAG).toMatch(/\bcontrols=/); // gated on „playing" — see below
    expect(VIDEO_TAG).toMatch(/\bmuted\b/);
    expect(VIDEO_TAG).toMatch(/\bplaysInline\b/);
  });

  it("shows the native control bar only once there IS something to control", () => {
    // A `controls` bar painted over a poster is a dead tap target lying on top
    // of the live one — the overlap class of defect this HUD closed six of on
    // the founder's phone this week.
    expect(VIDEO_TAG).toMatch(/controls=\{clipPhase === "playing"\}/);
  });
});

describe("2 — hard teardown, because `key=` is not a cancelled fetch", () => {
  const teardown = /function tearDownVideo[\s\S]*?\n}/.exec(CODE)?.[0] ?? "";

  it("the three calls are all there, in the order that aborts the fetch", () => {
    expect(teardown).not.toBe("");
    const pause = teardown.indexOf(".pause()");
    const remove = teardown.indexOf('.removeAttribute("src")');
    const load = teardown.indexOf(".load()");
    expect(pause, "pause()").toBeGreaterThan(-1);
    expect(remove, 'removeAttribute("src")').toBeGreaterThan(-1);
    expect(load, "load()").toBeGreaterThan(-1);
    // load() LAST: it is the call that re-runs resource selection, which is
    // what actually abandons the in-flight response. Before removeAttribute it
    // would merely restart the same download.
    expect(pause).toBeLessThan(remove);
    expect(remove).toBeLessThan(load);
  });

  it("is called from the ref detach — the earliest moment there is", () => {
    expect(CODE).toMatch(/if \(node === null\) tearDownVideo\(videoRef\.current\)/);
    expect(CODE).toMatch(/ref=\{attachVideo\}/);
  });

  it("is called on unmount, on a step change, and from every exit control", () => {
    // Five call sites, and each one is a way the student „moves on":
    //   ref detach · unmount effect · stepId effect · close() · stopClip()
    const calls = CODE.match(/tearDownVideo\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(5);
    expect(CODE, "unmount net").toMatch(
      /useEffect\(\(\) => \(\) => tearDownVideo\(videoRef\.current\), \[\]\)/,
    );
    expect(CODE, "step change").toMatch(/tearDownVideo\(videoRef\.current\);\s*\n\s*setClipPhase\("idle"\)/);
    expect(CODE, "✕ / Escape / Разбрах").toMatch(
      /const close = useCallback\(\(\) => \{\s*\n\s*tearDownVideo/,
    );
  });

  it("still recreates the element on a step change (belt as well as braces)", () => {
    // The `key` was already right; it is kept because a fresh element is a
    // second, independent reason the previous clip cannot still be streaming.
    expect(VIDEO_TAG).toMatch(/key=\{clip\.src\}/);
  });
});

describe("3 — something cheap is on screen first", () => {
  it("the poster is rendered as an <img>, so a 404 is DETECTABLE", () => {
    // `<video poster>` gives no error event. An <img> does, and that is the
    // only reason the still can come back instead of a black rectangle.
    expect(CODE).toMatch(/src=\{clip\.posterSrc\}/);
    expect(CODE).toMatch(/onError=\{\(\) => setPosterFailed\(true\)\}/);
  });

  it("the same frame is on the video too, so the swap does not flash", () => {
    expect(VIDEO_TAG).toMatch(/poster=\{posterFailed \? undefined : clip\.posterSrc\}/);
  });

  it("the media box is a FIXED aspect, so nothing on the card ever reflows", () => {
    // Poster arriving, video replacing it, either one failing — all four states
    // occupy the same rectangle, and it is the still's own 320:170 so a clip
    // step and a still step are the same height.
    expect(CODE).toMatch(/aspectRatio: "320 \/ 170"/);
  });
});

describe("4 — the still stays the floor", () => {
  it("the clip branch still renders the inline SVG, it did not replace it", () => {
    // Two sites: the step that has no clip at all, and — the point — the FLOOR
    // layer inside the clip branch, which covers both ways a network can let
    // the student down.
    expect((CODE.match(/<PreDriveStill\b/g) ?? []).length).toBe(2);
    expect(CODE, "the floor must cover a dead poster AND a dead clip").toMatch(
      /const stillIsFloor =\s*\(clipPhase === "idle" && posterFailed\) \|\| clipPhase === "failed";/,
    );
  });

  it("…and the control gets OUT OF THE WAY of the diagram when it is showing", () => {
    // Found by looking at the rendered failure state: a pill centred on the
    // 320×170 schematic covered the driver's shoulder and the «китка върху
    // волана» label — in the one state where that drawing IS the lesson.
    expect(CODE).toMatch(/\{stillIsFloor \? null : clipControl\}/); // over the photo
    expect(CODE).toMatch(/\{stillIsFloor \? clipControl : null\}/); // below the diagram
    expect(CODE).toMatch(/stillIsFloor\s*\n?\s*\?\s*"self-center"/);
  });

  it("a failed clip falls back to the diagram and SAYS the lesson continues", () => {
    expect(CODE).toMatch(/setClipPhase\("failed"\)/);
    expect(CODE).toContain("рисунката показва същото, можеш да продължиш");
  });

  it("…but a cancel is never reported to the student as a failure", () => {
    // The teardown ends in `load()` on a sourceless element. If a browser ever
    // fires `error` for that, «Спри зареждането» would print „видеото не се
    // зареди" at a student who deliberately stopped it.
    expect(CODE).toMatch(
      /onError=\{\(\) => \{\s*\n\s*if \(videoRef\.current\?\.getAttribute\("src"\)\) setClipPhase\("failed"\);/,
    );
  });

  it("the student can abandon a download that is taking too long", () => {
    // On a bad connection this is worth more than the video: one control,
    // three labels, and the middle one is „stop".
    expect(CODE).toMatch(/case "loading":\s*\n\s*return "⏹ Спри зареждането"/);
    expect(CODE).toMatch(/onClick=\{clipPhase === "loading" \? stopClip : playClip\}/);
  });

  it("«Разбрах» is never gated on the video — the card is always dismissible", () => {
    // The clip phase must not appear anywhere near the continue button, or a
    // stalled download becomes a trapped student.
    const footer = CODE.slice(CODE.indexOf("ref={continueRef}"));
    expect(footer).not.toMatch(/clipPhase/);
  });
});

describe("5 — the new control obeys the phone rules", () => {
  const playButton =
    /<button\b[\s\S]*?data-predrive-clip-play[\s\S]*?>/.exec(CODE)?.[0] ?? "";

  it("there is exactly ONE new touch target on this card", () => {
    // Play, cancel and retry share a box: one geometry to measure on four
    // device profiles instead of three that can drift apart.
    expect((CODE.match(/data-predrive-clip-play/g) ?? []).length).toBe(1);
  });

  it("is at least 44 px in BOTH axes — a wide, short pill is the C2 defect", () => {
    expect(playButton).toMatch(/\bmin-h-11\b/); // 11 × 0.25rem = 44 px
    expect(playButton).toMatch(/\bmin-w-11\b/);
  });

  it("leaves the screen while the clip plays, so it cannot sit on the control bar", () => {
    expect(CODE).toMatch(/clip === null \|\| clipPhase === "playing" \? null : \(/);
  });

  it("states the price of the tap before the tap, on its own line", () => {
    expect(CODE).toMatch(/return "▶ Пусни видеото"/);
    expect(CODE).toMatch(/preDriveClipWeightBg\(clip\.bytes\)\} · \{clip\.durationSec\} с/);
    // The price line must be idle-only: „⏹ Спри зареждането · 2,0 MB" would be
    // telling a student who is trying to STOP paying what he is paying.
    expect(CODE).toMatch(/\{clipPhase === "idle" \? \(\s*\n\s*<span className="text-\[10px\]/);
  });

  it("announces the download to a screen reader, not only to the eye", () => {
    expect(CODE).toMatch(/role="status" aria-live="polite"/);
  });
});
