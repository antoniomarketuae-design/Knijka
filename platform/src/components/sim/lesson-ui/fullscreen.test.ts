import { describe, expect, it, vi } from "vitest";
import {
  exitFullscreen,
  FULLSCREEN_CHANGE_EVENTS,
  fullscreenElementOf,
  requestFullscreen,
  supportsFullscreen,
  type FullscreenDocument,
  type FullscreenTarget,
} from "./fullscreen";

/**
 * The regression these tests exist for: on iPhone Safari
 * `Element.requestFullscreen` is simply absent, and the shell used to call it
 * unguarded inside a mount effect. That threw a synchronous TypeError, React
 * unwound to the (dashboard) error boundary, and the simulator was
 * unreachable on every iPhone. So the contract under test is blunt: with an
 * EMPTY element and an EMPTY document, nothing here may throw.
 */
const iphone = (): { el: FullscreenTarget; doc: FullscreenDocument } => ({
  el: {},
  doc: {},
});

describe("fullscreen — iPhone Safari (no API at all)", () => {
  it("reports no support", () => {
    expect(supportsFullscreen(iphone().el)).toBe(false);
    expect(supportsFullscreen(null)).toBe(false);
  });

  it("never throws and reports the request was not made", () => {
    const { el, doc } = iphone();
    expect(() => requestFullscreen(el, doc)).not.toThrow();
    expect(requestFullscreen(el, doc)).toBe(false);
  });

  it("never throws on exit", () => {
    const { doc } = iphone();
    expect(() => exitFullscreen(doc)).not.toThrow();
    expect(exitFullscreen(doc)).toBe(false);
  });

  it("has no fullscreen element", () => {
    expect(fullscreenElementOf(iphone().doc)).toBe(null);
    expect(fullscreenElementOf(null)).toBe(null);
  });
});

describe("fullscreen — standard (Chrome/Firefox/Android)", () => {
  it("requests with navigationUI hidden", () => {
    const requestSpy = vi.fn(() => Promise.resolve());
    const el: FullscreenTarget = { requestFullscreen: requestSpy };
    expect(requestFullscreen(el, {})).toBe(true);
    expect(requestSpy).toHaveBeenCalledWith({ navigationUI: "hide" });
  });

  it("swallows a rejected request promise", async () => {
    const el: FullscreenTarget = {
      requestFullscreen: () => Promise.reject(new Error("denied")),
    };
    expect(requestFullscreen(el, {})).toBe(true);
    await Promise.resolve();
  });

  it("does not re-request while already fullscreen", () => {
    const requestSpy = vi.fn(() => Promise.resolve());
    const el: FullscreenTarget = { requestFullscreen: requestSpy };
    expect(requestFullscreen(el, { fullscreenElement: el })).toBe(true);
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it("exits only when something is fullscreen", () => {
    const exitSpy = vi.fn(() => Promise.resolve());
    expect(exitFullscreen({ exitFullscreen: exitSpy })).toBe(false);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(exitFullscreen({ fullscreenElement: {}, exitFullscreen: exitSpy })).toBe(true);
    expect(exitSpy).toHaveBeenCalledTimes(1);
  });

  it("treats a synchronous throw as no support, not a crash", () => {
    const el: FullscreenTarget = {
      requestFullscreen: () => {
        throw new TypeError("permissions policy");
      },
    };
    expect(() => requestFullscreen(el, {})).not.toThrow();
    expect(requestFullscreen(el, {})).toBe(false);
  });
});

describe("fullscreen — webkit-prefixed (iPadOS / older Safari)", () => {
  it("is supported through the prefixed spelling", () => {
    expect(supportsFullscreen({ webkitRequestFullscreen: () => undefined })).toBe(true);
  });

  it("requests and exits through the prefixed spelling", () => {
    const req = vi.fn();
    const exit = vi.fn();
    expect(requestFullscreen({ webkitRequestFullscreen: req }, {})).toBe(true);
    expect(req).toHaveBeenCalledTimes(1);
    expect(exitFullscreen({ webkitFullscreenElement: {}, webkitExitFullscreen: exit })).toBe(true);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("reads the prefixed fullscreen element", () => {
    const node = {};
    expect(fullscreenElementOf({ webkitFullscreenElement: node })).toBe(node);
  });

  it("subscribes to both change-event spellings", () => {
    expect([...FULLSCREEN_CHANGE_EVENTS]).toEqual([
      "fullscreenchange",
      "webkitfullscreenchange",
    ]);
  });
});
