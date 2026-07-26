/**
 * contextLoss — doc 82 §2.3 fix 4. Before this there was no
 * `webglcontextlost` listener anywhere in src/, so an OOM on a 4 GB phone
 * presented as a silent black canvas with no diagnostic at all.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  formatContextLossEvent,
  getContextLossLog,
  recordContextLoss,
  resetContextLossLog,
  type ContextLossEvent,
} from "../contextLoss";

function event(over: Partial<ContextLossEvent> = {}): ContextLossEvent {
  return {
    kind: "lost",
    atMs: 41_200,
    level: "low",
    statusMessage: null,
    drawingBufferSize: "891×411",
    ...over,
  };
}

beforeEach(() => {
  resetContextLossLog();
});

describe("the session log", () => {
  it("records losses and restores in order", () => {
    recordContextLoss(event({ atMs: 1000 }));
    recordContextLoss(event({ kind: "restored", atMs: 1400 }));
    const log = getContextLossLog();
    expect(log.map((e) => e.kind)).toEqual(["lost", "restored"]);
    expect(log[0].atMs).toBe(1000);
  });

  it("caps a flapping context instead of growing without bound", () => {
    // A dying phone can lose/restore indefinitely while the page is left open;
    // the first events are the informative ones anyway.
    for (let i = 0; i < 200; i++) recordContextLoss(event({ atMs: i }));
    expect(getContextLossLog().length).toBeLessThanOrEqual(20);
    expect(getContextLossLog()[0].atMs).toBe(0); // oldest kept, newest dropped
  });
});

describe("formatContextLossEvent", () => {
  it("leads with the tier and the time — the two things that name the cause", () => {
    const line = formatContextLossEvent(event({ level: "med", atMs: 41_200 }));
    expect(line).toContain("[sim-gl] context lost");
    expect(line).toContain("tier=med");
    expect(line).toContain("t=41.2s");
    expect(line).toContain("buffer=891×411");
  });

  it("omits the driver status message when there isn't one", () => {
    // Most implementations send an empty string; printing `status=""` would
    // read as evidence the driver said something.
    expect(formatContextLossEvent(event({ statusMessage: null }))).not.toContain("status=");
    expect(formatContextLossEvent(event({ statusMessage: "GPU reset" }))).toContain(
      'status="GPU reset"',
    );
  });
});
