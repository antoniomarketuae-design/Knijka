// The «втори замах» read (AC-12) — sc-ac-crosswind:a9db1738's surviving clause,
// „the briefing's «втора корекция» warning has no observable trigger".
//
// TWO HALVES, AND THE SECOND ONE IS THE POINT. The first describes the
// detector: what fires it, what may never fire it, and that it is silent on
// every lesson that authors no wind. The second is the ROUTING GUARD — the half
// that stops this being one more predicate nothing reads. Measured on this
// corpus, 51 of 82 audited repairs shipped a measurement wired to no consumer;
// `windDrift.test.ts` answered that for the wind picture and this answers it for
// the wind's coaching line, in the same shape and with the same mutation proof:
// cutting any leg out of the REAL source has to turn the guard red.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createSecondSwingState,
  SECOND_SWING,
  stepSecondSwing,
  type SecondSwingRead,
  type SecondSwingState,
} from "./secondSwing";
import {
  CHASSIS_MASS,
  CROSSWIND_BRIDGE_N,
  CROSSWIND_GUST_AMPLITUDE_N,
  STEER_FULL_SPEED_KMH,
  STEER_MAX_ANGLE,
} from "./tuning";

const DT = 1 / 60;

/** The shipped wind, in the frame the detector reads: −X on the drill street,
 *  so the shove is toward the car's RIGHT and the correction is to the LEFT. */
const WIND_MS2 = -CROSSWIND_BRIDGE_N / CHASSIS_MASS;
/** The taught transit speed of sc-ac-crosswind (instruction 3: ~34, cap 40). */
const DRILL_KMH = 34;

interface Rig {
  state: SecondSwingState;
  tSec: number;
  last: SecondSwingRead;
}

function rig(): Rig {
  return { state: createSecondSwingState(), tSec: 0, last: { fired: false, cue: false } };
}

/** Hold `steerRad` for `sec` seconds at `kmh` in `windMs2`. Returns whether the
 *  swing fired at any point during those seconds. */
function hold(
  r: Rig,
  steerRad: number,
  sec: number,
  opts?: { kmh?: number; windMs2?: number },
): boolean {
  let fired = false;
  const steps = Math.round(sec / DT);
  for (let i = 0; i < steps; i++) {
    r.tSec += DT;
    r.last = stepSecondSwing(
      r.state,
      {
        tSec: r.tSec,
        steerRad,
        speedKmh: opts?.kmh ?? DRILL_KMH,
        windLatAccelMs2: opts?.windMs2 ?? WIND_MS2,
      },
      DT,
    );
    if (r.last.fired) fired = true;
  }
  return fired;
}

// ---------------------------------------------------------------------------
// 1. THE MOVEMENT INSTRUCTION 7 NAMES — and only that movement
// ---------------------------------------------------------------------------

describe("secondSwing — the whip that instruction 7 warns about", () => {
  it("a held upwind correction whipped through centre to the downwind side FIRES", () => {
    const r = rig();
    // The wind pushes right (negative), so the correction is a LEFT hold.
    expect(hold(r, 0.2, 1.0)).toBe(false); // holding is not the mistake
    // …and then the reflex: hard the other way, inside the window.
    expect(hold(r, -0.2, 0.2)).toBe(true);
    expect(r.last.cue).toBe(true);
  });

  it("the SMOOTH release the lesson asks for never fires it", () => {
    // Instruction 6: «отслабне ли [поривът], отпусни плавно корекцията». A
    // release ramps the wheel to ~0 and leaves it there — it never travels to
    // a fifth of full lock on the far side, which is what firing requires.
    const r = rig();
    hold(r, 0.2, 1.0);
    let fired = false;
    for (let s = 0.2; s >= -0.01; s -= 0.005) fired = hold(r, s, DT) || fired;
    fired = hold(r, 0, 3) || fired;
    expect(fired).toBe(false);
    expect(r.last.cue).toBe(false);
  });

  it("a flick with no HELD correction behind it is not a SECOND swing", () => {
    // Two movements make it the second one. A single jab either way is a
    // beginner sawing, which the lane detectors already grade on outcome.
    const r = rig();
    expect(hold(r, 0.2, SECOND_SWING.HOLD_SEC / 2)).toBe(false);
    expect(hold(r, -0.2, 0.3)).toBe(false);
  });

  it("the reversal must arrive INSIDE the window — a later turn is a later turn", () => {
    const r = rig();
    hold(r, 0.2, 1.0);
    hold(r, 0, SECOND_SWING.WINDOW_SEC + 0.5); // wheel released, seconds pass
    expect(hold(r, -0.3, 0.5)).toBe(false);
  });

  it("holding DOWNWIND and coming back is not it either — the sides are ordered", () => {
    // Steering WITH the wind and then correcting is the student catching
    // himself, not the second swing. Only upwind-then-downwind is the fault.
    const r = rig();
    expect(hold(r, -0.2, 1.0)).toBe(false); // held downwind
    expect(hold(r, 0.2, 0.3)).toBe(false); // corrected back upwind
  });
});

// ---------------------------------------------------------------------------
// 2. THE GATES — the opt-in, the speed floor, and the no-nag rule
// ---------------------------------------------------------------------------

describe("secondSwing — silent everywhere it has no business speaking", () => {
  it("is inert with NO WIND, which is every lesson but the two that author it", () => {
    // `VehicleSim.windLatAccelMs2` returns the literal 0 without
    // `physics.crosswind`, so the whole catalogue drives past this module.
    const r = rig();
    expect(hold(r, 0.4, 1.0, { windMs2: 0 })).toBe(false);
    expect(hold(r, -0.4, 1.0, { windMs2: 0 })).toBe(false);
    expect(r.last.cue).toBe(false);
  });

  it("is inert at manoeuvring speed — opposite lock is how you park", () => {
    const r = rig();
    expect(hold(r, 0.4, 1.0, { kmh: STEER_FULL_SPEED_KMH - 5 })).toBe(false);
    expect(hold(r, -0.4, 1.0, { kmh: STEER_FULL_SPEED_KMH - 5 })).toBe(false);
  });

  it("is inert in REVERSE (negative speed fails the same floor)", () => {
    const r = rig();
    expect(hold(r, 0.4, 1.0, { kmh: -12 })).toBe(false);
    expect(hold(r, -0.4, 1.0, { kmh: -12 })).toBe(false);
  });

  it("says it ONCE — a student sawing at the wheel gets one line, not sixty", () => {
    const r = rig();
    expect(hold(r, 0.2, 1.0)).toBe(false); // arm only
    expect(hold(r, -0.2, 0.2)).toBe(true);
    // Immediately saw back and forth again: the cooldown must swallow it.
    let again = false;
    for (let i = 0; i < 5; i++) {
      again = hold(r, 0.2, 0.5) || again;
      again = hold(r, -0.2, 0.3) || again;
    }
    expect(again).toBe(false);
    // …and after the silence it can teach again, because the mistake repeated.
    hold(r, 0, SECOND_SWING.COOLDOWN_SEC);
    hold(r, 0.2, 1.0);
    expect(hold(r, -0.2, 0.2)).toBe(true);
  });

  it("the cue is a LEVEL that clears itself — CUE_SEC of reading, then gone", () => {
    const r = rig();
    hold(r, 0.2, 1.0);
    hold(r, -0.2, 0.2);
    expect(r.last.cue).toBe(true);
    hold(r, 0, SECOND_SWING.CUE_SEC - 0.5);
    expect(r.last.cue).toBe(true);
    hold(r, 0, 1);
    expect(r.last.cue).toBe(false);
  });

  it("the cue survives a lift-off — he still gets to read why", () => {
    // Coasting to a stop after the swing zeroes the wind/speed gates, which
    // reset the state machine. The sentence is not part of that state.
    const r = rig();
    hold(r, 0.2, 1.0);
    hold(r, -0.2, 0.2);
    hold(r, 0, 1, { kmh: 0 });
    expect(r.last.cue).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. THE THRESHOLDS ARE GROUNDED, not picked
// ---------------------------------------------------------------------------

describe("secondSwing — the constants answer to the shipped car", () => {
  it("a swing is a large fraction of the lock the car will actually give", () => {
    // At the drill speed the limit leaves ~0.5 rad; the steady counter-steer
    // that out-pulls this wind in crosswind.test.ts is ~0.025 rad. The
    // threshold has to sit far above the correction and well below full lock.
    expect(SECOND_SWING.SWING_RAD).toBeGreaterThan(0.05);
    expect(SECOND_SWING.SWING_RAD).toBeLessThan(STEER_MAX_ANGLE / 2);
    expect(SECOND_SWING.HOLD_RAD).toBe(SECOND_SWING.SWING_RAD);
  });

  it("the whole shipped gust cycle is above the wind floor, and calm is below it", () => {
    const lull = (CROSSWIND_BRIDGE_N - CROSSWIND_GUST_AMPLITUDE_N) / CHASSIS_MASS;
    const peak = (CROSSWIND_BRIDGE_N + CROSSWIND_GUST_AMPLITUDE_N) / CHASSIS_MASS;
    expect(lull).toBeGreaterThan(SECOND_SWING.MIN_WIND_MS2);
    expect(peak).toBeGreaterThan(lull);
    expect(SECOND_SWING.MIN_WIND_MS2).toBeGreaterThan(0);
  });

  it("the speed floor is above full-lock parking and below the taught transit", () => {
    expect(SECOND_SWING.MIN_SPEED_KMH).toBeGreaterThan(STEER_FULL_SPEED_KMH);
    expect(SECOND_SWING.MIN_SPEED_KMH).toBeLessThan(DRILL_KMH);
  });

  it("it never nags: the silence is longer than the sentence is up", () => {
    expect(SECOND_SWING.COOLDOWN_SEC).toBeGreaterThan(SECOND_SWING.CUE_SEC);
  });
});

// ---------------------------------------------------------------------------
// 4. THE ROUTING GUARD — the student is the consumer, not a unit test
// ---------------------------------------------------------------------------

const SCENE_SRC = readFileSync(
  path.resolve(__dirname, "../../../components/sim/LessonScene.tsx"),
  "utf8",
);
const STYLES_SRC = readFileSync(
  path.resolve(__dirname, "../../../components/sim/lesson-ui/PlayAreaStyles.tsx"),
  "utf8",
);

const sceneStepsItPerFrame = (src: string) =>
  /const swing = stepSecondSwing\([\s\S]{0,600}?windLatAccelMs2: simRef\.current\?\.windLatAccelMs2 \?\? 0/.test(
    src,
  );
const scenePublishesOnEdges = (src: string) =>
  /if \(swing\.cue !== swingCueRef\.current\) \{[\s\S]{0,200}?onSecondSwing\(swing\.cue\)/.test(src);
const sceneRendersTheChip = (src: string) =>
  /\{windSwingCueOn && !telltaleCueOn \?[\s\S]{0,600}?data-hud="wind-swing-cue"/.test(src);

describe("routing: the line reaches the student, and the sim is what raises it", () => {
  it("LessonScene steps the detector on the LIVE frame, off the sim's own wind", () => {
    expect(sceneStepsItPerFrame(SCENE_SRC)).toBe(true);
    // The steer is the driver's, read from the same getter the cockpit wheel
    // and the head lean are driven from — one number, no second estimate.
    expect(SCENE_SRC).toContain("steerRad: simRef.current?.steerRad ?? 0,");
    expect(scenePublishesOnEdges(SCENE_SRC)).toBe(true);
  });

  it("…and the chip is actually rendered, with the explanation in it", () => {
    expect(sceneRendersTheChip(SCENE_SRC)).toBe(true);
    // THEO-4: never a bare verdict. The line names the act AND the remedy.
    expect(SCENE_SRC).toContain("Втори замах! Отпускай корекцията плавно");
  });

  it("the attempt replay carries the same moment, so the debrief can show it", () => {
    // Line-ending-agnostic on purpose: this worktree is CRLF and the tree is
    // LF, so a multi-line `toContain` is a test that fails on one checkout and
    // passes on the other. The regex spans whatever the newline happens to be.
    expect(
      /if \(swing\.fired\) \{[\s\S]{0,200}?recorder\?\.addEvent\([\s\S]{0,80}?"annotation"/.test(
        SCENE_SRC,
      ),
    ).toBe(true);
    expect(SCENE_SRC).toContain("Втори замах: воланът се върна рязко срещу порива");
  });

  it("it is gated on exam mode, never on an aid tier", () => {
    expect(SCENE_SRC).toContain(
      "onSecondSwing={lesson.examMode === true ? undefined : setWindSwingCueOn}",
    );
    // The chip must NOT be behind `aids?.` — a student owed an explanation at
    // L1 is owed the same one at L4 (THEO-4).
    expect(/\{windSwingCueOn && !telltaleCueOn \?/.test(SCENE_SRC)).toBe(true);
  });

  it("C1 owns its geometry — the chip joins the corridor instead of the road", () => {
    expect(STYLES_SRC).toContain('[data-hud="wind-swing-cue"] {');
    expect(STYLES_SRC).toContain(
      '[data-sim-compact="on"] [data-hud="wind-swing-cue"] {',
    );
    expect(STYLES_SRC).toContain('[data-hud="wind-swing-cue"] > div {');
    // …and it stands down behind the overlay column and the touch hint, the
    // rank the other two chips in this lane already keep.
    expect(STYLES_SRC).toContain(
      '[data-sim-compact="on"][data-sim-overlay-active="on"] [data-hud="wind-swing-cue"] {',
    );
    expect(STYLES_SRC).toContain(
      '[data-sim-compact="on"]:has([data-hud="touch-hint"]) [data-hud="wind-swing-cue"] {',
    );
    // …and it steps below the chase rear window and a held rear glance, which
    // is the duty that comes with standing in the follow chip's slot (B74/B76
    // — a HUD card painted over the mirror quad is the mirror's whole defect).
    expect(STYLES_SRC).toContain(
      'html[data-sim-camera="chase"] [data-hud="wind-swing-cue"] {',
    );
    expect(STYLES_SRC).toContain(
      'html[data-sim-glance="rear"] [data-hud="wind-swing-cue"] {',
    );
  });

  it("the chip keeps a REAL plate — it is not on the UNPANEL ghost register", () => {
    // sc-ac-crosswind:4607edf0 and :8f42504c are both „no opaque plate" rows on
    // this same lesson. This surface is born with one: `telltale-cue`'s
    // treatment, not `follow-hint`'s, so the sweep never strips its fill.
    expect(STYLES_SRC).not.toContain("'[data-hud=\"wind-swing-cue\"]',");
    // Its own fill and blur, written on the element and never stripped.
    expect(
      /data-hud="wind-swing-cue"[\s\S]{0,400}?bg-background\/85[\s\S]{0,60}?backdrop-blur/.test(
        SCENE_SRC,
      ),
    ).toBe(true);
    // …and it shares the follow chip's slot rather than opening a fourth lane
    // 12 px from its neighbour (the two are rendered mutually exclusively).
    expect(SCENE_SRC).toContain("followHintOn && aids?.followHints && !windSwingCueOn");
  });

  it("cutting any leg out of the REAL source turns this guard red", () => {
    expect(
      sceneStepsItPerFrame(
        SCENE_SRC.replace(/windLatAccelMs2: simRef\.current\?\.windLatAccelMs2 \?\? 0/, "0"),
      ),
    ).toBe(false);
    expect(
      scenePublishesOnEdges(SCENE_SRC.replace(/onSecondSwing\(swing\.cue\)/, "void 0")),
    ).toBe(false);
    expect(
      sceneRendersTheChip(SCENE_SRC.replace(/data-hud="wind-swing-cue"/, 'data-hud="x"')),
    ).toBe(false);
    // A detector nobody renders is the dead-predicate class this suite exists
    // to refuse: deleting the render condition alone must fail the guard.
    expect(
      sceneRendersTheChip(SCENE_SRC.replace(/\{windSwingCueOn && !telltaleCueOn \?/, "{false ?")),
    ).toBe(false);
  });
});
