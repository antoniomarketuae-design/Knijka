/**
 * webmDuration — the pure decision behind the MediaRecorder-webm scrubber fix.
 *
 * Battery: the Infinity/NaN/0 "not indexed yet" case issues ONE far seek (and
 * never a second while a probe is in flight); a finite duration that arrived
 * after a probe seeks home; a naturally-finite duration is left alone.
 */
import { describe, expect, it } from "vitest";
import {
  DURATION_PROBE_SEEK_SEC,
  durationFixStep,
} from "./webmDuration";

describe("durationFixStep", () => {
  it("probes once when the duration is Infinity (the raw MediaRecorder case)", () => {
    expect(durationFixStep(Infinity, false)).toEqual({
      action: "probe",
      seekToSec: DURATION_PROBE_SEEK_SEC,
    });
  });

  it("treats NaN and 0 as not-yet-indexed and probes", () => {
    expect(durationFixStep(Number.NaN, false)).toEqual({
      action: "probe",
      seekToSec: DURATION_PROBE_SEEK_SEC,
    });
    expect(durationFixStep(0, false)).toEqual({
      action: "probe",
      seekToSec: DURATION_PROBE_SEEK_SEC,
    });
  });

  it("does NOT probe again while a probe is already in flight", () => {
    expect(durationFixStep(Infinity, true)).toEqual({ action: "none" });
    expect(durationFixStep(Number.NaN, true)).toEqual({ action: "none" });
  });

  it("seeks home when a finite duration arrives after a probe", () => {
    expect(durationFixStep(14.38, true)).toEqual({ action: "reset", seekToSec: 0 });
    expect(durationFixStep(10, true)).toEqual({ action: "reset", seekToSec: 0 });
  });

  it("leaves a naturally-finite duration alone (never probed)", () => {
    expect(durationFixStep(10, false)).toEqual({ action: "none" });
    expect(durationFixStep(14.38, false)).toEqual({ action: "none" });
  });

  it("rejects a negative reported duration as unusable", () => {
    expect(durationFixStep(-1, false)).toEqual({
      action: "probe",
      seekToSec: DURATION_PROBE_SEEK_SEC,
    });
  });
});
