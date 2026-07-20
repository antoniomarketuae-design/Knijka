/**
 * clipManifest — the reader half of the clip-pilot contract.
 *
 * Battery: contract parsing (shape, version, per-entry skip), the
 * tracePath→clip matcher with both path spellings (repo "content/traces/…"
 * and public "/traces/…"), the empty-manifest degradation (the capture batch
 * runs AFTER this lands — everything must read as "no clips"), and the small
 * gallery helpers. 404/network tolerance lives in fetchClipManifest, which
 * resolves [] on any failure — noted here, exercised via parse fallbacks.
 */
import { describe, expect, it } from "vitest";
import {
  clipForTracePath,
  familyPrefixOf,
  formatClipDuration,
  parseClipManifest,
  type MistakeClip,
} from "./clipManifest";

const CLIP: MistakeClip = {
  id: "sc-jx-giveway-b1__m0",
  templateId: "sc-jx-giveway-b1",
  mistakeIndex: 0,
  tracePath: "content/traces/sc-jx-giveway-b1/mistake-no-yield.trace.json",
  src: "/clips/sc-jx-giveway-b1__m0.webm",
  durationSec: 8.4,
  recordedAt: "2026-07-20T10:00:00.000Z",
  titleBg: "Не пропусна идващия отдясно",
};

function manifest(clips: unknown[]): unknown {
  return { version: 1, clips };
}

describe("parseClipManifest", () => {
  it("parses the contract shape and keeps every field", () => {
    const clips = parseClipManifest(manifest([CLIP]));
    expect(clips).toEqual([CLIP]);
  });

  it("parses the empty manifest to an empty list (pre-batch state)", () => {
    expect(parseClipManifest(manifest([]))).toEqual([]);
  });

  it("rejects non-contract payloads wholesale", () => {
    expect(parseClipManifest(null)).toBeNull();
    expect(parseClipManifest([])).toBeNull();
    expect(parseClipManifest("clips")).toBeNull();
    expect(parseClipManifest({ clips: [CLIP] })).toBeNull(); // no version
    expect(parseClipManifest({ version: 2, clips: [CLIP] })).toBeNull();
    expect(parseClipManifest({ version: 1, clips: "none" })).toBeNull();
  });

  it("skips malformed entries but keeps the valid ones", () => {
    const clips = parseClipManifest(
      manifest([
        { ...CLIP, id: "" }, // blank id
        { ...CLIP, durationSec: Number.NaN }, // non-finite duration
        { ...CLIP, mistakeIndex: 1.5 }, // non-integer index
        "junk",
        CLIP,
      ]),
    );
    expect(clips).toEqual([CLIP]);
  });

  it("tolerates a missing recordedAt (degrades to blank, entry kept)", () => {
    const entry: Record<string, unknown> = { ...CLIP };
    delete entry.recordedAt;
    const clips = parseClipManifest(manifest([entry]));
    expect(clips).toEqual([{ ...CLIP, recordedAt: "" }]);
  });

  it("keeps the keyframe strip when present (doc 66 R0)", () => {
    const frames = ["/clips/keyframes/x__m0-01.jpg", "/clips/keyframes/x__m0-02.jpg"];
    const clips = parseClipManifest(manifest([{ ...CLIP, keyframes: frames }]));
    expect(clips).toEqual([{ ...CLIP, keyframes: frames }]);
  });

  it("degrades malformed/empty keyframes to none without dropping the clip", () => {
    for (const keyframes of [[], [3, null], "nope", { a: 1 }]) {
      const clips = parseClipManifest(manifest([{ ...CLIP, keyframes }]));
      expect(clips, JSON.stringify(keyframes)).toEqual([CLIP]);
    }
    // Junk entries are filtered, string URLs survive.
    const clips = parseClipManifest(manifest([{ ...CLIP, keyframes: ["", "/k1.jpg", 7] }]));
    expect(clips).toEqual([{ ...CLIP, keyframes: ["/k1.jpg"] }]);
  });
});

describe("clipForTracePath", () => {
  it("matches the exact repo-path spelling", () => {
    expect(clipForTracePath([CLIP], CLIP.tracePath)).toEqual(CLIP);
  });

  it("matches across spellings: public /traces/… URL vs repo content/traces/…", () => {
    // The why-panel model holds the PUBLIC URL (traceUrlForRepoPath output);
    // the manifest holds the repo path — both must resolve to the same clip.
    expect(
      clipForTracePath([CLIP], "/traces/sc-jx-giveway-b1/mistake-no-yield.trace.json"),
    ).toEqual(CLIP);
  });

  it("returns null on no match and on the empty manifest", () => {
    expect(clipForTracePath([CLIP], "content/traces/sc-other/mistake-x.trace.json")).toBeNull();
    expect(clipForTracePath([], CLIP.tracePath)).toBeNull();
  });

  it("picks the right clip among several mistakes of one template", () => {
    const second: MistakeClip = {
      ...CLIP,
      id: "sc-jx-giveway-b1__m1",
      mistakeIndex: 1,
      tracePath: "content/traces/sc-jx-giveway-b1/mistake-late-brake.trace.json",
      src: "/clips/sc-jx-giveway-b1__m1.webm",
    };
    expect(clipForTracePath([CLIP, second], second.tracePath)).toEqual(second);
  });
});

describe("gallery helpers", () => {
  it("familyPrefixOf takes the first two id segments", () => {
    expect(familyPrefixOf("sc-jx-giveway-b1")).toBe("sc-jx");
    expect(familyPrefixOf("sc-ac-aquaplane")).toBe("sc-ac");
    expect(familyPrefixOf("solo")).toBe("solo");
  });

  it("formatClipDuration renders m:ss", () => {
    expect(formatClipDuration(7.3)).toBe("0:07");
    expect(formatClipDuration(62)).toBe("1:02");
    expect(formatClipDuration(0)).toBe("0:00");
    expect(formatClipDuration(-3)).toBe("0:00");
  });
});
