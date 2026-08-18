/**
 * THE FIRST-RUN HINT'S TWO EXITS, AND THE ASYMMETRY BETWEEN THEM.
 *
 * The defect these guard, measured by the catalogue sweep on the deployed
 * build: `[data-hud="touch-hint"]` had exactly ONE exit — a press of «РАЗБРАХ»
 * — and that press was itself unreachable with a thumb on a pedal pad. On
 * sc-park-night the result was the card printed across ~70 % of the interior
 * rear-view mirror in 43 of 43 driving frames, 3 min 39 s, in the lesson whose
 * briefing grades mirror use. On sc-rx-unguarded and sc-sig-controller-live the
 * same card printed across roadside speed-limit signs.
 *
 * Both halves below FAIL on the old code: there was no `touchHintStandsDown`
 * to call, and `LessonScene.tsx`'s button carried `onClick` alone. The
 * OTHER-DIRECTION rows are the point of the file, though — an exit that fires
 * too eagerly deletes the instruction instead of an obstruction, and that is
 * the same crime pointing the other way.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TOUCH_HINT_MAX_SHOWN_MS,
  TOUCH_HINT_MOVING_KMH,
  TOUCH_HINT_POLL_MS,
  touchHintOutstayed,
  touchHintShouldHide,
  touchHintStandsDown,
} from "../touchHintLifetime";

describe("the hint stands down when the car is actually driving", () => {
  it("a car at rest KEEPS it — this is the direction that must not regress", () => {
    // The state the frames call `03-ready`: briefing acknowledged, engine
    // running, nothing rolling. The hint is legible, it occludes nothing that
    // is moving, and it is the only place the thumb layout is written down.
    // An exit that fired here would be a fix that deleted the lesson.
    expect(touchHintStandsDown(0)).toBe(false);
  });

  it("…and so does a car creeping below the grader's own „moving“ floor", () => {
    // Idle creep in D, a nudge off the pad, the roll-back on a slope. None of
    // these is a student demonstrating that the words landed.
    expect(touchHintStandsDown(TOUCH_HINT_MOVING_KMH)).toBe(false);
    expect(touchHintStandsDown(TOUCH_HINT_MOVING_KMH - 0.01)).toBe(false);
    expect(touchHintStandsDown(1)).toBe(false);
  });

  it("a car under way clears it — including the SLOWEST lesson complained of", () => {
    expect(touchHintStandsDown(TOUCH_HINT_MOVING_KMH + 0.01)).toBe(true);
    // THE ROW THAT DECIDED THE FLOOR. A parking drill is where a threshold
    // chosen for street driving could plausibly never be reached, and
    // sc-park-night is the lesson whose rear-view mirror this card was sitting
    // on for 3 min 39 s. Re-driven on the deployed build via
    // `tools/mobile/lesson-audit.mjs sc-park-night mobile right`:
    //   drive: top 29 км/ч · 25 full stops · final -1 км/ч
    // So the manoeuvre clears 5 km/h with 24 km/h to spare, and the twenty-five
    // standstills after it cannot bring the card back (the exit is one-way).
    expect(touchHintStandsDown(29)).toBe(true);
    // …and the sc-ac-night-lights wrong drive, same harness: top 59 км/ч.
    expect(touchHintStandsDown(59)).toBe(true);
  });

  it("REVERSING is driving — the card teaches the reverse gesture itself", () => {
    // «Спряла кола: пусни палеца и натисни пак надолу — минава на заден ход» is
    // one of the three lines on this card. A student performing it has
    // demonstrated the card more completely than one who merely rolled forward,
    // so a signed reading must never make the hint immortal in R.
    expect(touchHintStandsDown(-12)).toBe(true);
    expect(touchHintStandsDown(-1)).toBe(false);
  });

  it("an UNREADABLE speed keeps it — a bad number may not remove teaching", () => {
    // The failing direction is chosen deliberately. NaN/±Infinity are not
    // evidence that the student is driving; leaving the hint up costs one card
    // on a stationary screen, and the button still clears it.
    expect(touchHintStandsDown(Number.NaN)).toBe(false);
    expect(touchHintStandsDown(Number.POSITIVE_INFINITY)).toBe(false);
    expect(touchHintStandsDown(Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it("the floor IS the rule engine's, read out of the config it belongs to", () => {
    // The number is copied by value so this stays a Node-testable leaf, so the
    // copy is checked against its source on every run rather than trusted. If
    // `movingSpeedKmh` ever moves, this fails here instead of the hint quietly
    // disagreeing with the grader about whether the student is driving.
    const types = readFileSync(
      join(__dirname, "../../../../modules/sim/rules/types.ts"),
      "utf8",
    );
    const m = types.match(/\n\s*movingSpeedKmh:\s*([\d.]+),/);
    expect(m, "movingSpeedKmh literal in rules/types.ts").not.toBeNull();
    expect(Number(m?.[1])).toBe(TOUCH_HINT_MOVING_KMH);
  });

  it("the poll is cheap enough to be honest about", () => {
    // It runs only while the hint is up. Fast enough that the card is gone
    // within a tenth of a second of the car rolling, slow enough that it is not
    // a frame-loop cost by another name.
    expect(TOUCH_HINT_POLL_MS).toBeGreaterThanOrEqual(50);
    expect(TOUCH_HINT_POLL_MS).toBeLessThanOrEqual(250);
  });
});

/**
 * …AND THE EXIT FOR THE DRIVES WHERE THE CAR NEVER MOVES.
 *
 * The speed exit above cannot end a card on a car that never rolls, and sweep
 * 161 counted that class instead of assuming it away: of the 224 mobile runs in
 * `.audit-frames/sweep161` that log a cluster readout, 11 never read above
 * 5 км/ч in any sample. The photographed one is sc-park-parallel-exit/mobile-
 * right — „POSITIVE CONTROL: 0 км/ч after 5 s of throttle" in its run.log, and
 * 04-t006s showing this card across the interior mirror with the cluster at 0.
 *
 * Every row below has its opposite in the block after it, and the opposites are
 * the point. This ceiling fires at a STANDSTILL, which is the moment the card
 * costs least and teaching costs most, so a number chosen anywhere near a
 * reader's pace would be the same crime as the sticker pointing the other way.
 * The rows that pin it to 8× the worst measured first-move and 13.8× the
 * product's own reading budget are what keep it a guarantee rather than a timer.
 */
describe("the ceiling ends a card the car can never end", () => {
  it("a fresh card is NOT outstayed — this is the direction that deletes teaching", () => {
    expect(touchHintOutstayed(0)).toBe(false);
    expect(touchHintOutstayed(TOUCH_HINT_POLL_MS)).toBe(false);
  });

  it("…and neither is one that has only had a reader's worth of time", () => {
    // 130 landscape characters at the product's own „~15 chars/s at driving
    // load" (hud/HudToasts.tsx) is 8.7 s, and TEACHING_TOAST_TTL_MS spends
    // 8 s on 1–3 sentences. A ceiling that fired anywhere near there would be
    // the countdown this file's header refuses.
    expect(touchHintOutstayed(8_700)).toBe(false);
    expect(touchHintOutstayed(TOUCH_HINT_MAX_SHOWN_MS - 1)).toBe(false);
  });

  it("at the ceiling and past it, the card comes off the glass", () => {
    expect(touchHintOutstayed(TOUCH_HINT_MAX_SHOWN_MS)).toBe(true);
    // The longest exposure the sweep photographed anywhere: sc-park-night, the
    // card over ~70 % of the interior mirror for 3 min 39 s, 43 of 43 driving
    // frames. Whatever the car is doing, that number can no longer happen.
    expect(touchHintOutstayed(219_000)).toBe(true);
  });

  it("an UNREADABLE clock keeps it — the same rule as an unreadable speed", () => {
    // A broken number may leave teaching on the screen; it may never take it
    // off. Both inputs of this pair fail in that one direction.
    expect(touchHintOutstayed(Number.NaN)).toBe(false);
    expect(touchHintOutstayed(Number.POSITIVE_INFINITY)).toBe(false);
    expect(touchHintOutstayed(Number.NEGATIVE_INFINITY)).toBe(false);
    expect(touchHintOutstayed(-1_000)).toBe(false);
  });

  it("the ceiling CANNOT pre-empt the speed exit, with 8× to spare", () => {
    // THE ROW THAT DECIDED THE NUMBER, and the one that keeps this from being a
    // check that credits everybody. Measured over every mobile run in sweep 161
    // that logs speeds (224 runs; 213 of them cross 5 км/ч): first crossing p50
    // 1 s, p90 2 s, and the WORST in the whole 174-lesson catalogue is 15 s —
    // sc-lane-control-signal/mobile-right, then 12 s sc-rx-tram-stop-doors/
    // mobile-right, then 7 s. Reproduce from the run logs with:
    //   grep -hoE '\[04-t[0-9]+s\] +-?[0-9]+ км/ч' \
    //     .audit-frames/sweep161/*/mobile-*/{run.log,log.txt}
    // The 8× is not padding. Those first-move times are a ROBOT's:
    // tools/mobile/lesson-audit.mjs opens the throttle the instant the drive
    // stage begins, and nothing in the sweep measures how long a seventeen-year-
    // old takes to find the pads. A ceiling near the measurement would fire on
    // slow beginners; at 8× it, a student eight times slower off the mark still
    // leaves by the evidenced exit and not by the clock.
    const WORST_FIRST_MOVE_MS = 15_000;
    expect(touchHintOutstayed(WORST_FIRST_MOVE_MS)).toBe(false);
    expect(TOUCH_HINT_MAX_SHOWN_MS).toBeGreaterThanOrEqual(8 * WORST_FIRST_MOVE_MS);
  });

  it("the ceiling dwarfs the longest teaching surface the product ships", () => {
    // The floor of the derivation, read out of the file it belongs to rather
    // than trusted. HudToasts spends 8 s on 1–3 sentences at its own „~15
    // chars/s at driving load"; this card is 130 characters, i.e. 8.7 s of the
    // same budget. If TEACHING_TOAST_TTL_MS ever grows past a tenth of the
    // ceiling the two have stopped agreeing about how long Bulgarian takes to
    // read, and that argument surfaces here instead of on a student's mirror.
    const toasts = readFileSync(
      join(__dirname, "../../../../modules/sim/hud/HudToasts.tsx"),
      "utf8",
    );
    const m = toasts.match(/\n\s*const TEACHING_TOAST_TTL_MS = (\d+);/);
    expect(m, "TEACHING_TOAST_TTL_MS literal in hud/HudToasts.tsx").not.toBeNull();
    const teachingTtl = Number(m?.[1]);
    expect(teachingTtl).toBeGreaterThan(0);
    expect(TOUCH_HINT_MAX_SHOWN_MS).toBeGreaterThanOrEqual(10 * teachingTtl);
  });

  it("the ceiling is reachable by whole polls, not stranded between two", () => {
    // The scene accumulates TOUCH_HINT_POLL_MS per delivered tick, so the
    // ceiling has to land ON a tick boundary or the comparison would only ever
    // be crossed by overshoot. 120 000 / 100 = 1200 exactly.
    expect(TOUCH_HINT_MAX_SHOWN_MS % TOUCH_HINT_POLL_MS).toBe(0);
    const ticks = TOUCH_HINT_MAX_SHOWN_MS / TOUCH_HINT_POLL_MS;
    expect(touchHintOutstayed(ticks * TOUCH_HINT_POLL_MS)).toBe(true);
    expect(touchHintOutstayed((ticks - 1) * TOUCH_HINT_POLL_MS)).toBe(false);
  });
});

describe("the two exits together — and the four corners between them", () => {
  it("driving before the ceiling hides it: the ordinary lesson, 213 of 224 runs", () => {
    expect(touchHintShouldHide(29, 1_000)).toBe(true);
    expect(touchHintShouldHide(96, 200)).toBe(true);
  });

  it("stopped before the ceiling KEEPS it — the card at 03-ready is not a bug", () => {
    // The failure that costs nothing, and the one an over-eager ceiling would
    // turn into a lost lesson: engine running, nothing rolling, the student
    // still reading the only place the thumb layout is written down. The last
    // row is a beginner a full minute slower off the mark than the worst run in
    // the catalogue — he still gets the words, and he still leaves by driving.
    expect(touchHintShouldHide(0, 0)).toBe(false);
    expect(touchHintShouldHide(0, 8_700)).toBe(false);
    expect(touchHintShouldHide(TOUCH_HINT_MOVING_KMH, 15_000)).toBe(false);
    expect(touchHintShouldHide(0, 75_000)).toBe(false);
  });

  it("stopped PAST the ceiling hides it — the case the speed exit cannot reach", () => {
    // sc-park-parallel-exit/mobile-right: „POSITIVE CONTROL: 0 км/ч after 5 s of
    // throttle", the card on the mirror at 04-t006s. Under the speed exit alone
    // touchHintStandsDown(0) is false at every poll for as long as that lasts,
    // which is the definition of immortal.
    expect(touchHintStandsDown(0)).toBe(false);
    expect(touchHintShouldHide(0, 219_000)).toBe(true);
    expect(touchHintShouldHide(0, TOUCH_HINT_MAX_SHOWN_MS)).toBe(true);
  });

  it("an unreadable speed past the ceiling still hides it", () => {
    // NaN may not REMOVE the teaching by itself — that stays false — but it
    // must not be able to make the card immortal either. The clock is what
    // fires here, and it is readable.
    expect(touchHintStandsDown(Number.NaN)).toBe(false);
    expect(touchHintShouldHide(Number.NaN, 1_000)).toBe(false);
    expect(touchHintShouldHide(Number.NaN, 219_000)).toBe(true);
  });

  it("both numbers unreadable KEEPS it — nothing may be inferred from nothing", () => {
    expect(touchHintShouldHide(Number.NaN, Number.NaN)).toBe(false);
    expect(touchHintShouldHide(Number.POSITIVE_INFINITY, Number.NaN)).toBe(false);
  });

  it("reversing past the ceiling is still driving, not a timeout", () => {
    // Direction-independence survives the second exit: a student backing into a
    // bay is demonstrating the card's third line, and the reason the card left
    // must stay „he drove", not „45 s elapsed".
    expect(touchHintShouldHide(-12, 0)).toBe(true);
    expect(touchHintStandsDown(-12)).toBe(true);
  });
});

/**
 * …AND THE WIRING, because a rule nobody bound is the bug `tapActivation.ts`
 * exists to fix. `LessonScene.tsx` cannot be imported into a Node test (R3F,
 * rapier wasm, the district loader), so it is read as source — the same device
 * `hud/__tests__/hud-off-the-road.test.ts` uses on the same block.
 */
describe("LessonScene binds both exits, and they are not the same exit", () => {
  const SCENE = readFileSync(join(__dirname, "../../LessonScene.tsx"), "utf8");

  it("the automatic exit is wired to the vehicle sample's speed", () => {
    // NOTE FOR WHOEVER WIRES THE CEILING. This asserts the CURRENT call, which
    // is the speed exit alone; `touchHintShouldHide` exists and is proved but
    // nothing calls it yet (see the ⚠ block in `touchHintLifetime.ts`). That is
    // on purpose — this row goes red the moment the scene changes, so the
    // ceiling cannot land half-wired and unnoticed. Replace the expected string
    // with `touchHintShouldHide(sampleRef.current.speedKmh, shownMs)` in the
    // same commit that adds the accumulator.
    expect(SCENE).toContain("touchHintStandsDown(sampleRef.current.speedKmh)");
    expect(SCENE).toContain("TOUCH_HINT_POLL_MS");
  });

  it("…and it does NOT persist — only an acknowledged press may do that", () => {
    // THE ROW THAT MATTERS. `dismissTouchHint` writes `sim.touchHintSeen`, so
    // routing the automatic exit through it would mean a student who mashed the
    // pad without reading a word never sees the instruction again. The
    // automatic exit therefore calls the setter directly, and the storage write
    // stays inside the acknowledged path.
    const auto = SCENE.slice(
      SCENE.indexOf("if (!showTouchHint) return;"),
      SCENE.indexOf("}, [showTouchHint]);"),
    );
    expect(auto.length).toBeGreaterThan(0);
    expect(auto).toContain("setShowTouchHint(false)");
    expect(auto).not.toContain("dismissTouchHint");
    expect(auto).not.toContain("TOUCH_HINT_STORAGE_KEY");
    // …and the acknowledged path is still the one that remembers.
    const ack = SCENE.slice(
      SCENE.indexOf("const dismissTouchHint = useCallback"),
      SCENE.indexOf("const tapDismissTouchHint"),
    );
    expect(ack).toContain("TOUCH_HINT_STORAGE_KEY");
  });

  it("«РАЗБРАХ» has a pointer path AND keeps onClick", () => {
    // Both halves are load-bearing and they fail in opposite directions:
    // without the spread the button is dead under a second finger (§C2);
    // without `onClick` it is dead to the keyboard, to assistive activation and
    // to `element.click()`, none of which produce a pointer event.
    const btn = SCENE.slice(
      SCENE.indexOf("{showTouchHint ? ("),
      SCENE.indexOf("</button>", SCENE.indexOf("{showTouchHint ? (")),
    );
    expect(btn).toContain("{...tapDismissTouchHint}");
    expect(btn).toContain("onClick={dismissTouchHint}");
  });
});
