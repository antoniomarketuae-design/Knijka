/**
 * =============================================================================
 * „ДИСТАНЦИЯТА, КОЯТО УРОКЪТ УЧИ, НО НЕ ПОКАЗВА" — sc-fo-motorway-gap:76cde422,
 * CRITICAL, re-verified on the w11 re-drive:
 *
 *   „the two-second following distance the lesson exists to teach is never
 *    measured — no frame reports a gap in metres or seconds"
 *
 * across all 74 frames of two fresh legs. The verifier's note names what the
 * cockpit showed at the moment of the rear-end instead: «140 · РЕЖИМ Нормален
 * ≤150 · знакът важи · задачата иска ≤8» and a fault card — a speed, a
 * governor cap, and no gap.
 *
 * THE NUMBER WAS ALREADY IN THE PRODUCT. `traffic.leadGapMeters` has fed
 * `SimTick.leadGapM` for the whole life of the rule engine, and
 * `rules/engine.ts` convicts on it three separate ways. This badge shows the
 * student the quantity he is billed against.
 *
 * WHAT THIS FILE IS FOR. The one way a gauge like this can do harm is by
 * DISAGREEING with the grader — a pill that reads calm while
 * FOLLOWING_TOO_CLOSE arms, or scolds while nothing is measuring. So the ramp
 * is pinned against `rules/engine.ts`'s own predicate, recomputed here from
 * `DEFAULT_RULE_CONFIG` rather than from numbers retyped into the assertions:
 *
 *   safeGapM  = max(followMinGapM, (speed / 3.6) × followSafeSeconds)
 *   tailgating = speed ≥ followMinSpeedKmh  &&  gap < safeGapM × followFireRatio
 *
 * Block „agrees with the grader" walks a speed × gap lattice and fails on any
 * cell where the badge is calm and the engine would bill, or red where the
 * engine is structurally silent. That is the assertion that has to survive a
 * later tuning pass; the copy tests below it are the THEO-4 half.
 * =============================================================================
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG } from "../../rules";
import { FollowGapBadge, FollowGapCue } from "../FollowGapCue";
import {
  followCueLabelBg,
  followGapTarget,
  FOLLOW_CUE_EXIT_SEC,
  FOLLOW_CUE_MIN_SPEED_KMH,
  FOLLOW_CUE_RANGE_M,
  FOLLOW_CUE_RANGE_SEC,
  stepFollowCue,
  type FollowCue,
} from "../followGap";

const DRY = followGapTarget(DEFAULT_RULE_CONFIG, false);

/** The rule engine's own arithmetic, re-derived rather than retyped. */
function engineWouldBill(gapM: number, speedKmh: number): boolean {
  const safe = Math.max(
    DEFAULT_RULE_CONFIG.followMinGapM,
    (speedKmh / 3.6) * DEFAULT_RULE_CONFIG.followSafeSeconds,
  );
  return (
    speedKmh >= DEFAULT_RULE_CONFIG.followMinSpeedKmh &&
    gapM < safe * DEFAULT_RULE_CONFIG.followFireRatio
  );
}

describe("the honesty contract — inherited verbatim from the rear cue", () => {
  it("an empty road raises no badge, from any state", () => {
    expect(stepFollowCue(null, Infinity, 90, DRY)).toBeNull();
    const held = stepFollowCue(null, 20, 90, DRY);
    expect(held).not.toBeNull();
    // …and it cannot linger once the lead is gone.
    expect(stepFollowCue(held, Infinity, 90, DRY)).toBeNull();
  });

  it("a lead beyond the following band raises nothing", () => {
    // 4 s at 100 km/h is 111 m; 130 m is somebody else's problem.
    expect(stepFollowCue(null, 130, 100, DRY)).toBeNull();
    // …but the same 130 m at 140 km/h is 3.3 s and IS following.
    expect(stepFollowCue(null, 130, 140, DRY)).not.toBeNull();
  });

  it("hysteresis: a raised badge holds past the entry band, then drops", () => {
    const at = (secs: number, speed: number) => (secs * speed) / 3.6;
    const up = stepFollowCue(null, at(FOLLOW_CUE_RANGE_SEC - 0.2, 100), 100, DRY);
    expect(up).not.toBeNull();
    expect(stepFollowCue(up, at(FOLLOW_CUE_RANGE_SEC + 0.2, 100), 100, DRY)).not.toBeNull();
    expect(stepFollowCue(up, at(FOLLOW_CUE_EXIT_SEC + 0.3, 100), 100, DRY)).toBeNull();
  });

  it("a crawling queue keeps the METRE reading the time-gap cannot give", () => {
    // 12 m at 6 km/h is 7.2 s — outside the time band, inside the metre floor.
    const cue = stepFollowCue(null, 12, 6, DRY);
    expect(cue).not.toBeNull();
    expect(cue!.meters).toBe(12);
    expect(cue!.deciSeconds).toBeNull();
    expect(followCueLabelBg(cue!)).toBe("Дистанция · 12 м");
    expect(FOLLOW_CUE_RANGE_M).toBeGreaterThan(12);
  });

  it("never divides by a standstill, and never prints a fabricated second", () => {
    const cue = stepFollowCue(null, 2, 0, DRY);
    expect(cue).not.toBeNull();
    expect(cue!.deciSeconds).toBeNull();
    // …and the label carries no time at all. (Written as an equality, not as
    // a „does not contain «с»": «Дистанция» has one in it, and the looser
    // assertion passed for the wrong reason on the first draft of this file.)
    expect(followCueLabelBg(cue!)).toBe("Дистанция · 2 м");
    // Reversing is not following: the sign is thrown away, not the badge.
    expect(stepFollowCue(null, 2, -3, DRY)!.deciSeconds).toBeNull();
  });
});

describe("agrees with the grader — the whole reason it may exist", () => {
  it("is red exactly where FOLLOWING_TOO_CLOSE arms, over a speed × gap lattice", () => {
    let redCells = 0;
    let billCells = 0;
    for (let speed = 0; speed <= 150; speed += 5) {
      for (let gap = 1; gap <= 120; gap += 1) {
        const cue = stepFollowCue(null, gap, speed, DRY);
        const red = cue !== null && cue.level === "danger";
        const bill = engineWouldBill(gap, speed);
        if (red) redCells += 1;
        if (bill) billCells += 1;
        if (bill && cue !== null && !red) {
          throw new Error(`calm badge where the engine bills: ${gap} m @ ${speed} km/h`);
        }
        if (red && !bill) {
          throw new Error(`red badge where the engine is silent: ${gap} m @ ${speed} km/h`);
        }
      }
    }
    // Both sides non-trivial — a lattice that never lit would pass vacuously.
    expect(redCells).toBeGreaterThan(50);
    expect(billCells).toBeGreaterThan(50);
  });

  it("every gap the engine bills is IN the display band — no silent conviction", () => {
    for (let speed = DEFAULT_RULE_CONFIG.followMinSpeedKmh; speed <= 150; speed += 5) {
      for (let gap = 1; gap <= 120; gap += 1) {
        if (!engineWouldBill(gap, speed)) continue;
        expect(stepFollowCue(null, gap, speed, DRY), `${gap} m @ ${speed}`).not.toBeNull();
      }
    }
  });

  it("stays neutral under the engine's own speed mute — a queue is not a fault", () => {
    const slow = DEFAULT_RULE_CONFIG.followMinSpeedKmh - 5;
    const cue = stepFollowCue(null, 2, slow, DRY);
    expect(cue).not.toBeNull();
    expect(cue!.level).toBe("info");
    expect(engineWouldBill(2, slow)).toBe(false);
  });

  it("takes the RAIN target only when the lesson armed the rain detector", () => {
    const off = followGapTarget({ ...DEFAULT_RULE_CONFIG, followRainAwareEnabled: false }, true);
    expect(off.safeSeconds).toBe(DEFAULT_RULE_CONFIG.followSafeSeconds);
    const on = followGapTarget({ ...DEFAULT_RULE_CONFIG, followRainAwareEnabled: true }, true);
    expect(on.safeSeconds).toBeCloseTo(
      DEFAULT_RULE_CONFIG.followSafeSeconds * DEFAULT_RULE_CONFIG.followRainSecondsFactor,
      6,
    );
    // …and the ask the student reads moves with it.
    const wet = stepFollowCue(null, 30, 100, on)!;
    expect(followCueLabelBg(wet)).toContain("нужни 2,9 с");
  });
});

describe("THEO-4 — a short reading names the number that would be right", () => {
  it("carries the target whenever it is not calm, and not when it is", () => {
    const short = stepFollowCue(null, 20, 100, DRY)!;
    expect(short.level).not.toBe("info");
    expect(followCueLabelBg(short)).toContain("нужни 1,8 с");
    const ok = stepFollowCue(null, 90, 100, DRY)!;
    expect(ok.level).toBe("info");
    expect(followCueLabelBg(ok)).not.toContain("нужни");
  });

  it("writes seconds the Bulgarian way, with a comma", () => {
    const cue: FollowCue = { level: "warn", meters: 31, deciSeconds: 11, targetDeciSeconds: 18 };
    expect(followCueLabelBg(cue)).toBe("Дистанция · 31 м · 1,1 с · нужни 1,8 с");
  });

  it("shows a real motorway reading rather than the briefing's prose", () => {
    // The lesson's own sentence is «при 130 км/ч двете секунди са 72 метра».
    const cue = stepFollowCue(null, 72, 130, DRY)!;
    expect(cue.meters).toBe(72);
    expect(cue.deciSeconds).toBe(20);
    expect(FOLLOW_CUE_MIN_SPEED_KMH).toBeLessThan(130);
  });
});

describe("perf grammar and the rendered surface", () => {
  it("returns the previous identity when nothing visible changed", () => {
    // 41.0 m and 41.2 m at 100 km/h are both 41 whole metres and both 1,5 s,
    // so nothing the student can see has changed and the setState must bail.
    const a = stepFollowCue(null, 41.0, 100, DRY)!;
    expect(a.meters).toBe(41);
    expect(a.deciSeconds).toBe(15);
    expect(stepFollowCue(a, 41.2, 100, DRY)).toBe(a);
    // …and a real edge is a new object.
    const c = stepFollowCue(a, 30, 100, DRY);
    expect(c).not.toBe(a);
    expect(c!.level).toBe("danger");
  });

  it("the badge is named, labelled and reads in Bulgarian", () => {
    const html = renderToStaticMarkup(
      <FollowGapBadge cue={{ level: "danger", meters: 18, deciSeconds: 6, targetDeciSeconds: 18 }} />,
    );
    expect(html).toContain('data-hud="follow-gap"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Дистанция · 18 м · 0,6 с · нужни 1,8 с");
    expect(html).toContain("hud-ghost");
  });

  it("the container paints nothing on the server — which is why the badge is split out", () => {
    const html = renderToStaticMarkup(
      <FollowGapCue
        traffic={{ leadGapMeters: () => 10 }}
        sampleRef={{ current: { position: { x: 0, y: 0 }, headingDeg: 0, speedKmh: 90 } }}
        target={DRY}
      />,
    );
    expect(html).toBe("");
  });
});
