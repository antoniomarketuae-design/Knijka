/**
 * SWEEP 161 — the four LANES2 rows that were NOT repairable from a template,
 * MEASURED instead of accepted.
 *
 * `lanes2-sweep161.test.ts` defends the two rows a template could repair. This
 * file answers the other four, because „not repairable here" is only an honest
 * answer once someone has checked WHY, and on all four the stated why turned
 * out to be wrong. The audit's «correct» driver is not a student: it is
 * `tools/mobile/lesson-audit.mjs`, which holds `CRUISE_KMH = 12`, alternates a
 * roll phase with a scheduled full stop, and presses NO steering key anywhere
 * in the file. In 210 s that program covers roughly 150 m of road and cannot
 * change lane on any map in the catalogue — which is enough, on its own, to
 * explain every dark gate in these four rows.
 *
 *   §1 sc-ov-night-gap — «a lesson graded on judging distance by headlights has
 *      no lit lamps». REFUTED off the audit's own frame (the pixel counts live
 *      in templates-lanes2.ts at the site). What this file can hold is the
 *      TEMPLATE end of the chain that lights them: `conditions.night` →
 *      `environment.timeOfDay` → LessonScene's `isNight` → `<TrafficLayer
 *      night>`. Break the first link and every lamp in the scene goes out.
 *
 *   §2 sc-ln-boulevard-discipline — «tasks 2 and 3 never tick in any leg», read
 *      by the audit as the crawler being uncatchable. Neither gate reads the
 *      crawler. The template's own shadow LINE at 30 % speed — ~12 km/h, the
 *      audit's own cruise — completes all three; the same line pinned to the
 *      curb lane completes 1 and 3 and NOT 2. So the blocker was the steering
 *      wheel, not the speed. Both directions, because a gate that a curb-lane
 *      drive also satisfied would be the opposite crime.
 *
 *   §3 sc-ov-crest-curve — «0 of 3 objectives», read as the paced truck. Same
 *      measurement: the shadow line at 30 % speed completes all three, and the
 *      demo that carries speed into the arc is still refused by the patience
 *      gate. Slowness is not what this drill grades; the arc and the lane are.
 *
 *   §4 sc-ov-being-overtaken — «the world contradicts the briefing… tops out at
 *      21 км/ч». 21 km/h is the FASTEST correct drive in the whole 161-lesson
 *      sweep; both gates here sit 370 m and 505 m down the road. At 30 % of the
 *      shadow's speed both complete, and the throttling demo is still refused.
 *
 * THE SHARED METHOD, and why it is not a rigged test. Every §2–§4 drive is the
 * template's OWN committed recording with its speeds multiplied by 0.3 and its
 * clock divided by 0.3 — the same LINE, driven slowly. No sample is moved, so
 * nothing is nudged toward a mark; the only variable changed is the one the
 * audit's finding blamed. Where a claim needs the opposite direction to mean
 * anything, the opposite direction is a real drive too (the curb-lane pin, the
 * committed curve-speed and accelerating demos), never a hand-built miss.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEvalState, parseObjectiveParams, stepObjective } from "../../objectives";
import type { ObjectiveParams } from "../../types";
import { makeTick } from "../../__tests__/fixtures";
import type { ScenarioTrace, TraceSample } from "@/modules/sim/traces/types";
import { compileScenario } from "../compile";
import {
  SC_LN_BOULEVARD_DISCIPLINE,
  SC_OV_BEING_OVERTAKEN,
  SC_OV_CREST_CURVE,
  SC_OV_NIGHT_GAP,
} from "../templates-lanes2";
import type { ScenarioLevel, ScenarioSpec } from "../types";

/**
 * The audit program's cruise target, `tools/mobile/lesson-audit.mjs`. Every
 * slowed drive below is scaled to peak at exactly this, which is at or under
 * the top speed the sweep actually recorded on each of these four lessons
 * (21 / 21 / 17 / 25 km/h). So the claim being tested is the strongest form of
 * the audit's own: not „a slow student", but THAT program's pace.
 */
const AUDIT_CRUISE_KMH = 12;

function readTrace(path: string): ScenarioTrace {
  return JSON.parse(readFileSync(join(process.cwd(), "..", path), "utf8")) as ScenarioTrace;
}

function demoTrace(spec: ScenarioSpec, basename: string): ScenarioTrace {
  const demo = spec.mistakes.find((m) => m.traceRef.path.endsWith(`${basename}.trace.json`));
  expect(demo, `${spec.id} lost its ${basename} demo`).toBeDefined();
  return readTrace(demo!.traceRef.path);
}

/** Replay samples through the SHIPPED evaluator exactly as a session would. */
function replay(params: ObjectiveParams, samples: readonly TraceSample[]): boolean {
  let state = createEvalState(params);
  let done = false;
  for (const s of samples) {
    const r = stepObjective(
      params,
      state,
      makeTick({
        t: s.tSec,
        speedKmh: s.speedKmh,
        position: { x: s.x, y: s.y },
        headingDeg: s.headingDeg,
        gear: s.gear,
        indicator: s.indicator,
      }),
    );
    state = r.evalState;
    done = done || r.done;
  }
  return done;
}

/** Peak speed of a drive, for the „this really is slow" receipts below. */
const peakKmh = (samples: readonly TraceSample[]): number =>
  Math.max(...samples.map((s) => Math.abs(s.speedKmh)));

/**
 * The same LINE, re-timed to peak at `targetKmh`. Every x/y is untouched — no
 * sample is nudged toward a mark — so the ONLY variable that changes is the one
 * the audit's rows blamed. The clock is divided by the same factor, so the
 * drive stays continuous and `stepReachZone`'s swept segment test reads the
 * identical path it read at full speed.
 */
function slowedTo(trace: ScenarioTrace, targetKmh: number): TraceSample[] {
  const factor = targetKmh / peakKmh(trace.samples);
  return trace.samples.map((s) => ({
    ...s,
    tSec: s.tSec / factor,
    speedKmh: s.speedKmh * factor,
  }));
}

function compiledParams(
  spec: ScenarioSpec,
  level: ScenarioLevel,
  objectiveId: string,
): ObjectiveParams {
  const obj = compileScenario(spec, level).objectives.find((o) => o.id === objectiveId);
  expect(obj, `${spec.id}/${objectiveId} missing at L${level}`).toBeDefined();
  return parseObjectiveParams(obj!);
}

const rungsOf = (spec: ScenarioSpec): ScenarioLevel[] => spec.levels.map((r) => r.level);

// ---------------------------------------------------------------------------
// §1 sc-ov-night-gap — the template end of the chain that lights the lamps
// ---------------------------------------------------------------------------

describe("§1 the night lamps are rendered, and this template still asks for night", () => {
  const rungs = rungsOf(SC_OV_NIGHT_GAP);

  it("every rung compiles to environment.timeOfDay 'night' — the whole lamp chain", () => {
    // `isNight = timeOfDay === "night"` (LessonScene) is the single boolean that
    // reaches `<TrafficLayer night>` (tail glow + headlight bar), the streetlight
    // emissive and the ego's own beam. It is the ONE end of the night rig a
    // template owns, so it is the one this file guards: drop `night: true` from
    // `conditions` and every lamp in the scene goes out at once.
    for (const level of rungs) {
      const lesson = compileScenario(SC_OV_NIGHT_GAP, level);
      expect(lesson.environment?.timeOfDay, `L${level}`).toBe("night");
    }
  });

  it("AND THE OPPOSITE DIRECTION: the drill still names the cue it renders", () => {
    // The row was closed by measuring, not by deleting the premise — so the
    // premise has to still be there. If a later wave „repairs" this lesson by
    // striking the headlights out of the student's copy, that is the cue going
    // dark in the only place it was ever true, and this fails.
    const studentCopy = SC_OV_NIGHT_GAP.instructionsBg.map((s) => s.textBg).join(" ").toLowerCase();
    expect(studentCopy).toContain("фарове");
    expect(studentCopy).toContain("къси светлини");
    expect(SC_OV_NIGHT_GAP.teach.whyBg).toContain("фар");
  });

  it("the two staged events are ordinary fleet vehicles, i.e. lamps apply to them", () => {
    // TrafficLayer lights the fleet globally off `night`; nothing here opts out
    // (no profile that would render a non-vehicle rig, no per-actor lamp field).
    const staged = SC_OV_NIGHT_GAP.staged ?? [];
    expect(staged.map((s) => s.id)).toEqual(["sc-ovn-lead", "sc-ovn-stream"]);
    for (const ev of staged) {
      const actor = (ev as unknown as { actor?: Record<string, unknown> }).actor;
      expect(actor, `${ev.id} lost its path actor`).toBeDefined();
      const profile = actor!["profile"];
      expect(profile === undefined || profile === "car" || profile === "van", ev.id).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// §2 sc-ln-boulevard-discipline — the lane was the blocker, not the speed
// ---------------------------------------------------------------------------

describe("§2 the boulevard's gates are reachable at the audit's own crawl", () => {
  const spec = SC_LN_BOULEVARD_DISCIPLINE;
  const rungs = rungsOf(spec);
  const ids = ["sc-lnbd-right", "sc-lnbd-pass", "sc-lnbd-home"] as const;
  const shadow = readTrace(spec.shadow!.path);
  const slow = slowedTo(shadow, AUDIT_CRUISE_KMH);
  /** The same line, never leaving the curb lane — the drive the audit actually
   *  performed, minus its stops. 12.19 is LNBD_RIGHT, the curb-lane centre. */
  const curbOnly = slow.map((s) => ({ ...s, x: 12.19 }));

  it("the slow drive really is at the audit's cruise, so the claim is tested at its extreme", () => {
    expect(peakKmh(shadow.samples)).toBeGreaterThan(35); // the authored pace: 39.86
    expect(peakKmh(slow)).toBeCloseTo(AUDIT_CRUISE_KMH, 6);
  });

  it("FAILS ON THE OLD DIAGNOSIS: at ~12 km/h all three gates still complete", () => {
    // The sweep read „tasks 2 and 3 never tick" as the crawler being
    // uncatchable below its 20 km/h ceiling. If that were the cause, this drive
    // — slower than the crawler by a factor of two — could not finish either.
    for (const level of rungs) {
      for (const id of ids) {
        expect(replay(compiledParams(spec, level, id), slow), `L${level} ${id}`).toBe(true);
      }
    }
  });

  it("AND THE OPPOSITE DIRECTION: a curb-lane drive is refused by the PASS gate", () => {
    // The half that must never soften. „Изпревари бавната кола през лявата
    // лента" is the drill; a driver who never leaves lane 0 has not done it and
    // must not be credited, however far he drives. Gates 1 and 3 are his by
    // right — he did establish himself right and he did finish right — and the
    // reason the sweep saw them BOTH dark is the sequential chain in
    // lessons/engine.ts, which never steps gate 3 while gate 2 is open.
    for (const level of rungs) {
      expect(replay(compiledParams(spec, level, "sc-lnbd-right"), curbOnly), `L${level}`).toBe(true);
      expect(replay(compiledParams(spec, level, "sc-lnbd-pass"), curbOnly), `L${level}`).toBe(false);
      expect(replay(compiledParams(spec, level, "sc-lnbd-home"), curbOnly), `L${level}`).toBe(true);
    }
  });

  it("and the refusal is structural: no rung's disc reaches the curb lane's CENTRE", () => {
    // What the refusal above rests on, stated as a number so a later widening
    // cannot quietly turn this section into an amnesty. 8.125 m is the
    // wb-boulevard-v1 lane pitch, so a disc on the left-lane centre reaches the
    // curb-lane centre exactly at radius 8.125.
    //
    // HONEST LIMIT, and it is a TRACKED one. This is weaker than the half-pitch
    // contract of objective-title-truth-lanes-following2-rail2 §5: authored r4
    // widens to 6.00 at L1, whose edge sits at x = 10.06, i.e. 1.94 m past the
    // 8.125 m lane boundary. A curb-lane driver HUGGING that boundary at y = 115
    // is therefore creditable at L1 with «изпревари… през лявата лента». All
    // three rows of this template are on that file's LANE_CLAIM_BACKLOG
    // (sc-lnbd-right / -pass / -home) precisely for it; the fix is the r ≤ 2.7
    // re-sizing that backlog describes, and it must delete the rows from that
    // shrink-only list in the same change, which is why it is not done here.
    for (const level of rungs) {
      const p = compiledParams(spec, level, "sc-lnbd-pass");
      expect(p.kind).toBe("reachZone");
      if (p.kind !== "reachZone") continue;
      expect(p.radiusM, `L${level}`).toBeLessThan(8.125);
    }
  });
});

// ---------------------------------------------------------------------------
// §3 sc-ov-crest-curve — the arc and the lane are graded, never the pace
// ---------------------------------------------------------------------------

describe("§3 the crest drill completes at a crawl and still refuses the fast arc", () => {
  const spec = SC_OV_CREST_CURVE;
  const rungs = rungsOf(spec);
  const ids = ["sc-ovcc-patience", "sc-ovcc-pass", "sc-ovcc-finish"] as const;
  const slow = slowedTo(readTrace(spec.shadow!.path), AUDIT_CRUISE_KMH);

  it("FAILS ON THE OLD DIAGNOSIS: at 12 km/h all three gates still complete", () => {
    // «0 of 3 objectives» was read as the 57 km/h truck pacing down to a
    // standstill with the student. The gates never look at the truck: this is
    // the shadow's own 85 km/h line re-timed to peak at the audit's cruise —
    // slower than the 21 km/h the sweep actually managed here — and it lands
    // the patience gate inside the arc, the pass gate on the straight and the
    // finish, all three.
    expect(peakKmh(slow)).toBeCloseTo(AUDIT_CRUISE_KMH, 6);
    for (const level of rungs) {
      for (const id of ids) {
        expect(replay(compiledParams(spec, level, id), slow), `L${level} ${id}`).toBe(true);
      }
    }
  });

  it("AND THE OPPOSITE DIRECTION: the arc gate still refuses the drive that carries speed", () => {
    // Slowness must not become a free pass. The committed curve-speed demo runs
    // the А1-advisory bend at ~54 km/h against a 46 km/h ceiling and is refused
    // at every rung — the same gate, the same drive, the taught fault intact.
    const curveSpeed = demoTrace(spec, "mistake-curve-speed");
    for (const level of rungs) {
      expect(replay(compiledParams(spec, level, "sc-ovcc-patience"), curveSpeed.samples), `L${level}`).toBe(
        false,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// §4 sc-ov-being-overtaken — 370 m and 505 m of road, not a contradiction
// ---------------------------------------------------------------------------

describe("§4 the being-overtaken gates are reachable at a crawl, and still bite", () => {
  const spec = SC_OV_BEING_OVERTAKEN;
  const rungs = rungsOf(spec);
  const slow = slowedTo(readTrace(spec.shadow!.path), AUDIT_CRUISE_KMH);

  it("FAILS ON THE OLD DIAGNOSIS: at 12 km/h both gates still complete", () => {
    // 21 km/h is the fastest «correct» drive in the whole 161-lesson sweep, and
    // the row called that a contradiction of the briefing. It is a distance
    // problem: 505 m of road against a 210 s budget at 12 km/h with scheduled
    // stops buys ~150 m. Give the same line the road and it finishes.
    expect(peakKmh(slow)).toBeCloseTo(AUDIT_CRUISE_KMH, 6);
    for (const level of rungs) {
      for (const id of ["sc-ovbo-hold", "sc-ovbo-finish"] as const) {
        expect(replay(compiledParams(spec, level, id), slow), `L${level} ${id}`).toBe(true);
      }
    }
  });

  it("AND THE OPPOSITE DIRECTION: the 75 km/h ceiling still refuses the throttler", () => {
    // The чл. 42, ал. 2 duty is the only thing this gate can measure, and a
    // slow-student amnesty must not have loosened it.
    const throttler = demoTrace(spec, "mistake-accelerating");
    for (const level of rungs) {
      expect(replay(compiledParams(spec, level, "sc-ovbo-hold"), throttler.samples), `L${level}`).toBe(
        false,
      );
    }
  });
});
