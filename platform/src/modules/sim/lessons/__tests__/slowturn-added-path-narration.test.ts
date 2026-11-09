/**
 * THE NARRATING CONSUMERS SKIP AN ADDED-PATH TURN (lane slowturn, ruling R11).
 *
 * runtime/turns.ts reports a slow or stop-interrupted junction turn with
 * `addedPath: true`. The bill consumers read it as any turn; the two lesson
 * surfaces here must not narrate it, because what they would say was built
 * for a fast turn and is not yet true of a slow one:
 *
 *  - the Интервал row (`oncomingGapDetail`): measured on the round-1 probes,
 *    a slow commit would have printed «лентата беше чиста» with a car 9.5 s
 *    out, «над нормата» under a conviction for a car the guard had already
 *    stopped, and «под нормата» beside a praise. An outcome whose commit came
 *    from the added path is not narrated — except an impact, which is a fact;
 *  - the micro-quiz trigger: the added turn and the conviction made at it
 *    land inside the junction while the encounter they adjudicate is live
 *    (measured: sc-junction-rhr's correct demo would have opened
 *    c-driver-signals at 32.33 s with the priority-from-right car triggered).
 */
import { describe, expect, it } from "vitest";
import type { StagedEventOutcome } from "../../contracts";
import type { SimTickEvent } from "../../rules/types";
import { objectiveDetailText } from "../../hud/SessionEndScreen";
import { oncomingGapDetail } from "../objectives";
import type { ObjectiveParams } from "../types";
import { conceptForEvent } from "../quiz-trigger";

const GATE = { kind: "reachZone", x: -4.06, y: -50, radiusM: 9, reportOncomingGapSec: 4 } as unknown as ObjectiveParams;

const out = (o: Partial<StagedEventOutcome>): StagedEventOutcome =>
  ({ eventId: "sc-ltap-tight", kind: "oncomingLeftTurn", success: true, detail: "clear", tSec: 30, ...o }) as StagedEventOutcome;

const row = (outcomes: StagedEventOutcome[]): string | null => {
  const d = oncomingGapDetail(GATE, outcomes);
  return d === undefined ? null : objectiveDetailText(d);
};

describe("the Интервал row does not narrate an added-path commit", () => {
  it("CLEAR-BASE (control): a base commit into an empty lane prints «лентата беше чиста»", () => {
    expect(row([out({ committed: true })])).toMatch(/лентата беше чиста/);
  });
  it("CLEAR-ADDED: the same outcome from an ADDED commit prints no row at all", () => {
    expect(row([out({ committed: true, addedPathCommit: true })])).toBeNull();
  });
  it("CUT-ADDED: a conviction at an ADDED commit (tight + follow runners) prints no row", () => {
    expect(
      row([
        out({ detail: "violation", success: false, committed: true, addedPathCommit: true }),
        out({ eventId: "sc-ltap-follow", detail: "violation", success: false, committed: true, addedPathCommit: true }),
      ]),
    ).toBeNull();
  });
  it("IMPACT-ADDED: an impact is still an impact — the collision sentence the base printed", () => {
    const r = row([out({ detail: "collision", success: false, committed: true, addedPathCommit: true })]);
    expect(r).toMatch(/^Интервал: не беше преценен — стигна до удар/);
  });
  it("MIXED: a base runner's figure still prints beside an added-path one (the base account is untouched)", () => {
    const r = row([out({ committed: true, addedPathCommit: true }), out({ eventId: "sc-ltap-follow", committed: true, acceptedGapSec: 7.2 })]);
    expect(r).toMatch(/7\.2 с — над нормата/);
  });
});

describe("the micro-quiz opens on no added-path event", () => {
  it("QUIZ-BASE (control): a base turn maps to c-driver-signals, a base adjudication to c-priority-concept", () => {
    expect(conceptForEvent({ kind: "turnStarted", direction: "left" })).toBe("c-driver-signals");
    expect(conceptForEvent({ kind: "prioritySituation", situation: "left-turn-oncoming", violated: true })).toBe("c-priority-concept");
  });
  it("QUIZ-ADDED: an ADDED turn and the conviction made at it map to no concept", () => {
    const turn: SimTickEvent = { kind: "turnStarted", direction: "left", addedPath: true };
    const conv: SimTickEvent = { kind: "prioritySituation", situation: "left-turn-oncoming", violated: true, addedPath: true };
    expect(conceptForEvent(turn)).toBeNull();
    expect(conceptForEvent(conv)).toBeNull();
  });
});
