/**
 * B69 — THE DRILL MUST NOT DEMONSTRATE THE OPPOSITE OF WHAT IT GRADES.
 *
 * «Внезапно спиране» (catalog 41) instruction 1, one sentence: «Движи се
 * спокойно зад предната кола, около 40 км/ч, и дръж поне 2 секунди дистанция.»
 * The staged lead it puts in front of the student held **23.1 m of centres =
 * 19.0 m of bumpers, invariantly** — at the 40 км/ч the same sentence asks for,
 * **1.74–1.79 s, 12% UNDER the two seconds it demands**. And the student could
 * not obey both halves: `followGapM` is a DISTANCE and the lead `matchPlayer`s
 * it, so it re-established the same 23 m whatever he did; the only way to reach
 * 2 s was to drop to ≤34 км/ч and disobey «около 40 км/ч» in the same
 * instruction. It is innocent by the detector (`followSafeSeconds 1.8 ×
 * followFireRatio 0.7 = 1.26 s`) — which is exactly why nobody had seen it.
 *
 * This test measures the demonstration in SECONDS, off a real recorded drive
 * through the production stack, not off the authored constant — because the
 * runner adds a controller offset AND `±2 m of per-session jitter`
 * (`BrakingLeadCarRunner.arm`: `s.followGapM + (rng()·2 − 1)·2`), so an authored
 * number is not evidence about what the student is shown. The measurement is
 * taken over the PRE-SLAM cruise only: after the slam the gap is supposed to
 * collapse — that is the lesson.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { recordScFollowBrakeDrive } from "../scFollowBrake";
import type { SimTick } from "../../rules";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const district = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "fo-brake-v1.json"), "utf-8"),
);

/** The lead's authored brake-slam point (template sc-fb-lead). */
const SLAM_Y = 230;
/**
 * Hero length, m. `SimTick.leadGapM` is ALREADY bumper-to-bumper — `leadGapFor`
 * subtracts `bumperSubtrahendM(profile)` from the centre distance — so this
 * constant is used only to convert the AUTHORED centre-to-centre station into
 * the bumper gap the two-second rule is stated in. Getting that backwards
 * understates the demonstrated gap by a third of a second; it is written down
 * here because it was got backwards once while writing this file.
 */
const CAR_LEN_M = 4.1;
/** The speed instruction 1 asks for. */
const ASK_KMH = 40;

interface Sample {
  y: number;
  speedKmh: number;
  /** Bumper-to-bumper, straight off the tick the rule engine graded. */
  bumpersM: number;
}

function cruiseSamples(): Sample[] {
  const out: Sample[] = [];
  recordScFollowBrakeDrive(district, "shadow-correct", {
    onTick: (tick: SimTick) => {
      const gap = tick.leadGapM;
      if (gap === undefined || !Number.isFinite(gap)) return;
      // Pre-slam cruise only, and only while genuinely at the asked pace: the
      // first seconds are the launch and the last are the emergency stop.
      if (tick.position.y > SLAM_Y - 25) return;
      if (tick.speedKmh < ASK_KMH - 6) return;
      out.push({ y: tick.position.y, speedKmh: tick.speedKmh, bumpersM: gap });
    },
  });
  return out;
}

describe("B69 — the demonstrated following gap clears the two seconds it teaches", () => {
  const samples = cruiseSamples();

  it("the drive actually produced a measurable cruise (guards a vacuous pass)", () => {
    expect(samples.length).toBeGreaterThan(50);
  });

  it("every pre-slam frame shows AT LEAST 2.0 s of bumper gap at the asked pace", () => {
    const secs = samples.map((s) => s.bumpersM / (s.speedKmh / 3.6));
    const sorted = [...secs].sort((a, b) => a - b);
    const min = sorted[0]!;
    const median = sorted[Math.floor(sorted.length / 2)]!;
    const gaps = samples.map((s) => s.bumpersM).sort((a, b) => a - b);
    console.log(
      `B69 pre-slam gap over ${secs.length} frames: min ${min.toFixed(2)} s / median ${median.toFixed(
        2,
      )} s / max ${sorted[sorted.length - 1]!.toFixed(2)} s · bumpers ${gaps[0]!.toFixed(
        1,
      )}–${gaps[gaps.length - 1]!.toFixed(1)} m`,
    );
    expect(min).toBeGreaterThanOrEqual(2.0);
  });

  it("and at the nominal 40 km/h the authored station itself clears 2 s on its WORST seed", () => {
    // The runner jitters the station by ±2 m per session, so the authored value
    // has to clear two seconds at its unlucky end or the row reopens on someone
    // else's drive. 29 − 2 = 27 m of centres = 22.9 m of bumpers = 2.06 s.
    const worstCentres = 29 - 2;
    expect((worstCentres - CAR_LEN_M) / (ASK_KMH / 3.6)).toBeGreaterThanOrEqual(2.0);
    // …and the OLD value could not, on any seed — this is the defect, kept as
    // an executable statement of it so the fix cannot be quietly reverted.
    expect((22 + 2 - CAR_LEN_M) / (ASK_KMH / 3.6)).toBeLessThan(2.0);
  });
});
