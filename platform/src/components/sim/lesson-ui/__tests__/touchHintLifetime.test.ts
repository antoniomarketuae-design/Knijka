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
  TOUCH_HINT_MOVING_KMH,
  TOUCH_HINT_POLL_MS,
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
 * …AND THE WIRING, because a rule nobody bound is the bug `tapActivation.ts`
 * exists to fix. `LessonScene.tsx` cannot be imported into a Node test (R3F,
 * rapier wasm, the district loader), so it is read as source — the same device
 * `hud/__tests__/hud-off-the-road.test.ts` uses on the same block.
 */
describe("LessonScene binds both exits, and they are not the same exit", () => {
  const SCENE = readFileSync(join(__dirname, "../../LessonScene.tsx"), "utf8");

  it("the automatic exit is wired to the vehicle sample's speed", () => {
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
