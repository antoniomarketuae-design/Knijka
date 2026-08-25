/**
 * THE DEMONSTRATION WAITS FOR ITS AUDIENCE — sc-ed-poligon-chain:746682ab
 * (critical) and sc-merge-lane-end:16d2fa64, 2026-08-25.
 *
 * The stand-down gate next door closed the half of the defect that happens at
 * speed. This is the half that happens at ZERO, and it is the one the corpus
 * kept re-filing against `scenarios/coach.ts` — a file whose comment-stripped
 * source holds no Cyrillic at all and can emit no caption.
 *
 * `.audit-frames/w10-1/frames/sc-ed-poligon-chain__pc-right/01-arrival.png`:
 * cluster 0 км/ч in D, no control touched, ЗАДАЧА 1/5 unstarted — and the deck
 * already reads «ДЕМОНСТРАЦИЯ — СЛЕДВАЙ СЯНКАТА 0:22 / 2:44» under the caption
 * «Центрирано в мястото. Излез напред и продължи по правата към втората
 * станция.» The replay had spent twenty-two seconds of itself while the student
 * read the ИНСТРУКЦИИ panel, and the first sentence the product says to them
 * congratulates them for parking a car they have not moved.
 * `.audit-frames/w10-3/frames/sc-merge-lane-end__pc-right/01-arrival.png` is
 * the same picture with «Вписахме се в пролуката с едно движение…».
 *
 * The cure is the transport that was always there: the deck opens parked at
 * 0:00 and the student presses ▶. This file pins the rule and pins the ONE
 * mount that has to obey it — a rule nothing calls is the failure this
 * programme has paid for more than any other.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTraceClock } from "@/modules/sim/traces";
import { demoDeckAtRest } from "../demoDeckLifetime";

describe("the clock a lesson's demonstration opens on", () => {
  it("is parked at the beginning, not running from mount", () => {
    const clock = demoDeckAtRest(createTraceClock());
    expect({ playing: clock.playing, tSec: clock.tSec }).toEqual({ playing: false, tSec: 0 });
  });

  it("rewinds a clock that has already run", () => {
    // Belt and braces on the one property the frames are about: a deck handed a
    // clock mid-trace must not open on a mid-trace caption.
    const clock = createTraceClock();
    clock.tSec = 22;
    clock.playing = true;
    demoDeckAtRest(clock);
    expect({ playing: clock.playing, tSec: clock.tSec }).toEqual({ playing: false, tSec: 0 });
  });

  it("returns the SAME object, so a ref keeps its identity", () => {
    const clock = createTraceClock();
    expect(demoDeckAtRest(clock)).toBe(clock);
  });

  it("leaves the shared factory's own default alone", () => {
    // The dev clip routes (`app/dev/clip-capture`) drive `createTraceClock()`
    // deliberately and set `playing` themselves at four call sites. Moving the
    // factory's default would have reached all of them; the lesson's mount is
    // the only thing that changed.
    expect(createTraceClock().playing).toBe(true);
  });
});

describe("the lesson's aid deck really mounts it", () => {
  // Same reasoning as the stand-down walk beside this file: `LessonScene.tsx`'s
  // import closure reaches @react-three/drei and cannot LOAD in this
  // environment, so the seam is read off the source. A walk cannot prove the
  // deck looks right; it can prove the clock the student's deck is handed is
  // the one this file just tested.
  //
  // AND THE WALK IS OVER CODE, NOT OVER PROSE. The wave-2 sweep found two gates
  // a COMMENTED-OUT line satisfied — one of them a regex over raw file text
  // that a commented-out `setInterval` still matched, 43 tests green while the
  // card froze. The realistic edit here is not a deletion but a note:
  //
  //     // was: const aidClockRef = useRef<TraceClock>(demoDeckAtRest(createTraceClock()));
  //     const aidClockRef = useRef<TraceClock>(createTraceClock());
  //
  // `indexOf` finds the COMMENT first, and every assertion below would read the
  // sentence about the rule instead of the rule. Whole-line comments are
  // therefore dropped before anything is searched — line-based rather than a
  // general comment stripper, because a commented-out statement always starts
  // its own line and a mid-line `//` can live inside a string.
  const SCENE = readFileSync(
    path.join(process.cwd(), "src", "components", "sim", "LessonScene.tsx"),
    "utf-8",
  )
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

  it("the walk is looking at the real ref", () => {
    // The self-check. A renamed ref must make this vacuous-proof assertion
    // fail rather than quietly turn the next one into a tautology.
    expect(SCENE).toContain("const aidClockRef = useRef<TraceClock>(");
    expect(SCENE).toContain("clockRef={aidClockRef}");
  });

  it("the S1 aid clock is created at rest", () => {
    const from = SCENE.indexOf("const aidClockRef = useRef<TraceClock>(");
    const to = SCENE.indexOf(";", from);
    expect(from).toBeGreaterThan(0);
    expect(SCENE.slice(from, to)).toContain("demoDeckAtRest(createTraceClock())");
  });

  it("does not answer the finding by deleting the demonstration", () => {
    // The guard rail the stand-down test carries too. Parking the playhead is
    // not the same as removing the aid: the ghost, the deck and the L1 aid flag
    // must all still be mounted, or this "fix" is a feature deletion wearing a
    // lifetime rule's clothes.
    expect(SCENE).toContain("<ShadowCar");
    expect(SCENE).toContain("<DemoDeck");
    expect(SCENE).toContain("aids?.shadowCar");
  });
});
