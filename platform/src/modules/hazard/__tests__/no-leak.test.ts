/**
 * The security test.
 *
 * A hazard score is only worth something if the student could not have known
 * where the window was. Everything the browser holds while the clip plays goes
 * through `hazardCardFor`, so this file serialises exactly that and asserts the
 * answer is not in it — the same guarantee exam/ gets from never sending
 * `correct` flags.
 *
 * It asserts on the SERIALISED card rather than on named fields on purpose: a
 * future field called `meta` or `debug` carrying the fault time would pass a
 * field-by-field check and fail this one.
 */

import { describe, expect, it } from "vitest";
import { hazardCardFor } from "../engine";
import { makeBank, makeItemSource } from "./fixtures";

const item = makeBank([
  makeItemSource("hz-a", {
    // A cut strictly before the fault, so "the clip is N seconds long" and
    // "the fault lands at N seconds" are different numbers and the assertions
    // below cannot pass by coincidence.
    cutSec: 7,
    hazardBg: "Пешеходка стъпва на пътеката.",
    developingBg: "Човекът на бордюра е първият признак.",
    notesBg: "R0: провери кадъра.",
  }),
]).byId("hz-a")!;

describe("the served card", () => {
  const card = hazardCardFor(item);
  const wire = JSON.stringify(card);

  it("carries only what the player needs to paint the shell", () => {
    expect(Object.keys(card).sort()).toEqual([
      "briefBg",
      "clipSrc",
      "durationSec",
      "itemId",
      "posterSrc",
      "titleBg",
    ]);
  });

  it("does not leak the window, the fault or the review notes", () => {
    for (const secret of [
      item.hazardBg,
      item.developingBg,
      item.notesBg,
      item.violationCode,
      item.lawRefEcho,
      String(item.hazardAtSec),
      String(item.faultSec),
      String(item.windowOpenSec),
    ]) {
      expect(wire).not.toContain(secret);
    }
  });

  it("does not name a window field under any spelling", () => {
    expect(wire).not.toMatch(/window|fault|hazardAt|violation|lawRef|band/i);
  });

  it("exposes the cut as a plain duration, which the student can see anyway", () => {
    // `durationSec` IS derived from the cut — but a player has to know when to
    // stop, and "the clip is 8 seconds long" is visible from the progress bar
    // on the first play. What must stay secret is where inside those 8 seconds
    // the window sits.
    expect(card.durationSec).toBe(item.playableSec);
    expect(card.durationSec).not.toBe(item.window.openSec);
  });
});
