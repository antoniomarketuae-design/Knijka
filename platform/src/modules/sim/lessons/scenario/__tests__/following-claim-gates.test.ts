/**
 * THE FOLLOWING FAMILY'S CLAIM GATES — sweep 161, lane `templates-following.ts`.
 *
 * WHAT THE SWEEP FOUND, in the auditors' own frames. Seven drills, four legs
 * each, and three defect classes that all reduce to the same sentence: THE TASK
 * LIST SAID SOMETHING THE ENGINE NEVER CHECKED.
 *
 *  1. FIVE objective titles named a following DISTANCE over a gate that reads a
 *     coordinate and, at most, a speedometer. The worst frame is
 *     `sc-follow-cutin/pc-wrong/04-t017s.png`: a green tick against «Възстанови
 *     дистанцията след вклиняването» three centimetres above the engine's own
 *     card reading «Дистанция в момента: 0,0 с (0 м) — дръж поне 2 с.»
 *  2. TWO drills gated their own staged event behind a minimum player speed the
 *     cautious beginner never reaches (`minSlamSpeedKmh` 25, `minCutSpeedKmh`
 *     25). `sc-follow-brake/pc-right` ran 11 км/ч for its whole 205 s and the
 *     brake-slam never fired; `sc-follow-cutin/pc-right` watched the staged car
 *     hold station in the left lane at t = 34, 87, 130 and 189 s — and was
 *     awarded ИЗДЪРЖАН, three stars and +150 XP for it.
 *  3. TWO dry-authored drills carried RAIN copy in their base briefings, and
 *     `sc-follow-standstill` staged a «колона» that was geometrically invisible
 *     from the cockpit.
 *
 * WHY THESE ASSERTIONS AND NOT A SNAPSHOT. Every check below is derived from
 * the template's own numbers (or from a committed recording), so it fails on
 * the shipped-before behaviour AND on the lazy over-correction in the other
 * direction — a floor dropped to 5 км/ч stages a theft that did not happen, and
 * a cap tightened onto the shadow refuses the demonstrated-correct drive. Both
 * halves are asserted; a test that only pushes one way is how a false pass gets
 * replaced by a false refusal.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { BrakingLeadCarSpec, CutInLeadCarSpec } from "../../../contracts";
import { VEHICLE_PROFILE_LENGTH_M } from "../../../traffic/types";
import {
  createEvalState,
  parseObjectiveParams,
  REACH_ZONE_HALT_CAP_KMH,
  stepObjective,
} from "../../objectives";
import type { ObjectiveEvalState } from "../../types";
import { makeTick } from "../../__tests__/fixtures";
import { compileScenario } from "../compile";
import {
  SC_FOLLOW_BRAKE,
  SC_FOLLOW_CUTIN,
  SC_FOLLOW_DISTANCE,
  SC_FOLLOW_RAIN_GAP,
  SC_FOLLOW_STANDSTILL,
  SC_FOLLOW_TAILGATER,
  SC_FOLLOW_TRUCK,
  SCENARIO_TEMPLATES_FOLLOWING,
} from "../templates-following";
import type { ScenarioSpec } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

/** The player car's own length — the bumper subtrahend on a car-to-car gap. */
const CAR_LENGTH_M = VEHICLE_PROFILE_LENGTH_M.car;
/** The rule this whole family teaches, in seconds (ЗДвП чл. 23, dry). */
const TAUGHT_GAP_SEC = 2;

interface TraceSample {
  tSec: number;
  x: number;
  y: number;
  speedKmh: number;
}

function samplesOf(scenarioId: string, name: string): TraceSample[] {
  const file = path.join(REPO_ROOT, "content", "traces", scenarioId, `${name}.trace.json`);
  const j = JSON.parse(readFileSync(file, "utf-8")) as { samples: TraceSample[] };
  expect(j.samples.length, `${scenarioId}/${name} has samples`).toBeGreaterThan(50);
  return j.samples;
}

/**
 * Replay a committed recording through ONE compiled objective and report
 * whether it completes. This is the production evaluator (`stepObjective`) on
 * the production params (`compileScenario` → `parseObjectiveParams`), fed the
 * positions and speeds of a drive the repo already ships — so a green here is
 * the same green the student's banner shows.
 */
function objectiveCompletes(
  spec: ScenarioSpec,
  level: 1 | 2 | 3 | 4 | 5,
  objectiveId: string,
  samples: readonly TraceSample[],
): boolean {
  const lesson = compileScenario(spec, level);
  const objective = lesson.objectives.find((o) => o.id === objectiveId);
  expect(objective, `${spec.id}@L${level} has objective ${objectiveId}`).toBeDefined();
  const params = parseObjectiveParams(objective!);
  let state: ObjectiveEvalState = createEvalState(params);
  let done = false;
  for (const s of samples) {
    const r = stepObjective(
      params,
      state,
      makeTick({ t: s.tSec, speedKmh: s.speedKmh, position: { x: s.x, y: s.y } }),
    );
    state = r.evalState;
    done = done || r.done;
  }
  return done;
}

// ---------------------------------------------------------------------------
// 1. Title truth — no green tick may name a gap the gate cannot see
// ---------------------------------------------------------------------------

/** Words that promise the student a FOLLOWING DISTANCE was measured. */
const GAP_CLAIM = /дистанци|разстояни/i;

describe("no following objective titles a gap its evaluator cannot read", () => {
  it("has a corpus at all (a sweep over nothing proves nothing)", () => {
    expect(SCENARIO_TEMPLATES_FOLLOWING.length).toBe(7);
    const objectives = SCENARIO_TEMPLATES_FOLLOWING.reduce((n, t) => n + t.success.length, 0);
    expect(objectives).toBeGreaterThanOrEqual(15);
  });

  it("a title claiming дистанция/разстояние carries a boundary that bounds it", () => {
    const unbacked: string[] = [];
    for (const spec of SCENARIO_TEMPLATES_FOLLOWING) {
      for (const o of spec.success) {
        if (!GAP_CLAIM.test(o.titleBg)) continue;
        // `acceptBeforeMarkM` is the ONLY shipped instrument that can turn a
        // waypoint into a distance-to-the-car-in-front check, and it needs a
        // lead with a deterministic resting place to measure against. One drill
        // in this family has one (`sc-follow-standstill`, tail at rest at
        // y = 290); the others pace a moving lead and cannot, which is why
        // their titles stopped claiming it rather than acquiring a fake check.
        if (o.params.kind === "reachZone" && o.params.acceptBeforeMarkM !== undefined) continue;
        unbacked.push(`${spec.id} / ${o.id}: «${o.titleBg}» over ${o.params.kind}`);
      }
    }
    expect(unbacked, unbacked.join("\n")).toEqual([]);
  });

  it("the five renamed titles are the renamed ones (the frames name each row)", () => {
    const byId = new Map<string, string>();
    for (const spec of SCENARIO_TEMPLATES_FOLLOWING) {
      for (const o of spec.success) byId.set(o.id, o.titleBg);
    }
    // Each of these five was photographed either printing its unmeasured claim
    // on the objective card or ticked green beside the number that refuted it.
    expect(byId.get("sc-fd-follow")).toBe("Следвай предната кола спокойно");
    expect(byId.get("sc-fr-follow")).toBe("Следвай спокойно в дъжда");
    expect(byId.get("sc-ft-follow")).toBe("Следвай камиона спокойно");
    expect(byId.get("sc-fc-rebuild")).toBe("Продължи спокойно след вклиняването");
    expect(byId.get("sc-ftg-ease")).toBe("Успокой темпото");
    // …and the two that asserted an EVENT rather than a distance.
    expect(byId.get("sc-fb-approach")).toBe("Стигни ориентира преди спирането");
    expect(byId.get("sc-fb-finish")).toBe("Стигни края на отсечката");
  });
});

// ---------------------------------------------------------------------------
// 2. The caps that replaced the claims must REFUSE the recorded mistakes and
//    CREDIT the recorded shadow — both directions, on the committed tapes
// ---------------------------------------------------------------------------

describe("sc-fd-follow: the new cap is a check, not decoration", () => {
  // Before this lane the gate was `{ reachZone, y: 175, radiusM: 10 }` with no
  // cap at all — arriving was the whole test, so all three recordings passed it
  // and «Следвай на съобразена дистанция» ticked for the drive convicted of
  // «Несъобразена дистанция» seconds earlier (pc-wrong/04-t038s.png).
  const shadow = samplesOf("sc-follow-distance", "shadow-correct");
  const tailgate = samplesOf("sc-follow-distance", "mistake-tailgate");
  const meltingGap = samplesOf("sc-follow-distance", "mistake-gap-melts");

  it("credits the demonstrated-correct drive at every rung", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(
        objectiveCompletes(SC_FOLLOW_DISTANCE, level, "sc-fd-follow", shadow),
        `shadow at L${level}`,
      ).toBe(true);
    }
  });

  it("REFUSES both recorded tailgaters — the case that used to tick green", () => {
    // Measured at this circle: the shadow holds 25.9 км/ч for all 56 of its
    // in-zone frames; both mistakes hold 47.9 for all 30 of theirs. The refusal
    // must survive the L1/L2 tolerance ladder, which is where a cap authored
    // too close to the mistake would quietly stop refusing it.
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(
        objectiveCompletes(SC_FOLLOW_DISTANCE, level, "sc-fd-follow", tailgate),
        `mistake-tailgate at L${level}`,
      ).toBe(false);
      expect(
        objectiveCompletes(SC_FOLLOW_DISTANCE, level, "sc-fd-follow", meltingGap),
        `mistake-gap-melts at L${level}`,
      ).toBe(false);
    }
  });
});

describe("sc-fs-stopped: «Спри … на разумно разстояние» now measures both words", () => {
  // Measured before this lane, at `maxSpeedKmh: 6`: ALL THREE recordings ticked
  // this objective at 6.0 км/ч — the shadow at y = 273.0, seventeen metres short
  // of a queue nobody had stopped behind yet. `capMet` asks `speedKmh <= cap`,
  // and a car rolling AT the cap satisfies it. «Спри» meant nothing, and the
  // radius-8 disc reached y = 289 — 1.05 m PAST the tail's own rear bumper at
  // 287.95 — so «на разумно разстояние» meant nothing either.
  const shadow = samplesOf("sc-follow-standstill", "shadow-correct");
  const bumperKiss = samplesOf("sc-follow-standstill", "mistake-bumper-kiss");
  const creepUp = samplesOf("sc-follow-standstill", "mistake-creep-up");

  it("credits the shadow — AT REST, at the mark, not rolling 17 m short of it", () => {
    expect(shadow[shadow.length - 1].y).toBeCloseTo(280.95, 1);
    expect(shadow[shadow.length - 1].speedKmh).toBe(0);
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(
        objectiveCompletes(SC_FOLLOW_STANDSTILL, level, "sc-fs-stopped", shadow),
        `shadow at L${level}`,
      ).toBe(true);
    }
  });

  it("REFUSES the recorded bumper-hugger, which never stops at a lawful distance", () => {
    // It rolls the whole approach at 6.0 км/ч and comes to rest at y = 284.66 —
    // 1.24 m of clear air from the tail's bumper, which its own
    // `whatWentWrongBg` calls «под метър и половина разстояние».
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(
        objectiveCompletes(SC_FOLLOW_STANDSTILL, level, "sc-fs-stopped", bumperKiss),
        `mistake-bumper-kiss at L${level}`,
      ).toBe(false);
    }
  });

  it("…and still CREDITS the creeper, which really did stop where it was told", () => {
    // The other direction, and the reason the cut alone is not the fix: this
    // demo halts at y ≈ 281 and holds it for 2.5 s before creeping to the
    // bumper. The objective it earned there is «Спри зад колоната на разумно
    // разстояние» and it earned it; a latched waypoint cannot un-tick and does
    // not have to — STANDSTILL_GAP_TOO_CLOSE bills the creep at y = 284.7.
    // Refusing it here would be a false failure dressed as rigour.
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(
        objectiveCompletes(SC_FOLLOW_STANDSTILL, level, "sc-fs-stopped", creepUp),
        `mistake-creep-up at L${level}`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The staged event a drill is NAMED after must be reachable by the student
//    the drill is written for — and must stay honest when it fires
// ---------------------------------------------------------------------------

describe("a lesson's own event is not gated behind a speed its learner never reaches", () => {
  const lead = SC_FOLLOW_BRAKE.staged!.find(
    (s) => s.id === "sc-fb-lead",
  ) as unknown as BrakingLeadCarSpec;
  const cutter = SC_FOLLOW_CUTIN.staged!.find(
    (s) => s.id === "sc-fc-cutter",
  ) as unknown as CutInLeadCarSpec;

  it("the brake-slam arms at or below the product's own „this car is stopped“ line", () => {
    // `runners.ts` fires on `reachedSlamPoint && speedKmh >= minSlamSpeedKmh`.
    // At 25 the pc-right drive (11 км/ч, 205 s) never saw the sudden stop the
    // lesson is named after. REACH_ZONE_HALT_CAP_KMH is where this product
    // stops calling a car moving; a slam is owed to every drive above it.
    expect(lead.minSlamSpeedKmh).toBeLessThanOrEqual(REACH_ZONE_HALT_CAP_KMH);
    // …and NOT to a car standing still: a stimulus with no drive to interrupt
    // is noise, and `proximityFallbackM` already covers the bumper case.
    expect(lead.minSlamSpeedKmh).toBeGreaterThan(1);
  });

  it("the slam stays survivable at that floor — the taught gap, not a trap", () => {
    // The lead paces `followGapM` of CENTRES, so the student's usable room is
    // that minus one car length. At the arming floor it must still be more than
    // the two seconds this family teaches, or the drill would fire an
    // unavoidable collision at exactly the pace it just started accepting.
    const bumperGapM = lead.followGapM - CAR_LENGTH_M;
    const headwaySec = bumperGapM / (lead.minSlamSpeedKmh / 3.6);
    expect(headwaySec).toBeGreaterThan(TAUGHT_GAP_SEC);
  });

  it("the cut-in arms exactly where it becomes a real theft — neither higher nor lower", () => {
    // The manoeuvre lands the actor `paceAheadM` of centres ahead. The cushion
    // it steals is only stolen if what is left is UNDER the taught two seconds:
    //   bumper gap = paceAheadM − 4.1;  honest floor = 3.6 × gap / 2 km/h
    // Below that line the student is handed MORE than the rule asks and the
    // teach card would name a theft the geometry did not commit; far above it
    // (the shipped 25) the cautious beginner is locked out of his own lesson —
    // the pc-right drive ran 6–12 км/ч and watched the car never move.
    const honestFloorKmh = (3.6 * (cutter.paceAheadM - CAR_LENGTH_M)) / TAUGHT_GAP_SEC;
    expect(honestFloorKmh).toBeCloseTo(14.22, 1);
    expect(cutter.minCutSpeedKmh).toBeGreaterThanOrEqual(honestFloorKmh);
    expect(cutter.minCutSpeedKmh).toBeLessThanOrEqual(honestFloorKmh + 1);
  });
});

// ---------------------------------------------------------------------------
// 4. The briefing may not describe weather the rung does not have
// ---------------------------------------------------------------------------

/** Rain, wet road and spray — the words the two dry drills were photographed
 *  printing over a dry carriageway in bright daylight. */
const WET_COPY = /дъжд|вали|мокр|пръск/i;

describe("a dry-authored drill's base briefing describes a dry road", () => {
  it("no step promises weather the template's own conditions do not author", () => {
    const wrong: string[] = [];
    for (const spec of SCENARIO_TEMPLATES_FOLLOWING) {
      if (spec.conditions?.weather === "rain") continue; // sc-follow-rain-gap, honestly wet
      for (const step of spec.instructionsBg) {
        if (WET_COPY.test(step.textBg)) {
          wrong.push(`${spec.id} step ${step.n}: «${step.textBg}»`);
        }
      }
    }
    expect(wrong, wrong.join("\n")).toEqual([]);
  });

  it("the rain rung says it instead — the duty moves, it is not deleted", () => {
    // Both repairs depend on this: the lamp duty is real, but it belongs to the
    // rung where rain is real. `l5Wet()` carries rain + wet grip + a coachBg
    // that names светлини (complications.ts; level-complication.test.ts fails
    // the build if a rain recipe omits it). Before this lane both templates
    // authored a bare `{ level: 5, conditions: { weather: "rain" } }`: rain on
    // the picture, dry tyres under the car, no card, no line.
    for (const spec of [SC_FOLLOW_DISTANCE, SC_FOLLOW_TRUCK]) {
      const l5 = spec.levels.find((l) => l.level === 5);
      expect(l5, `${spec.id} authors an L5`).toBeDefined();
      expect(l5!.conditions?.weather, `${spec.id} L5 weather`).toBe("rain");
      expect(l5!.physics?.wetGrip, `${spec.id} L5 grip`).toBe(true);
      expect(l5!.complication?.coachBg ?? "", `${spec.id} L5 names светлини`).toMatch(/светлин/i);
    }
  });

  it("the two honestly-wet drills keep their wet copy", () => {
    // The opposite direction: this sweep must not scrub rain out of the drill
    // whose entire subject is rain. sc-follow-rain-gap is authored wet at every
    // rung and its lamp step is instruction 1.
    expect(SC_FOLLOW_RAIN_GAP.conditions?.weather).toBe("rain");
    expect(SC_FOLLOW_RAIN_GAP.instructionsBg.some((s) => WET_COPY.test(s.textBg))).toBe(true);
    expect(SC_FOLLOW_RAIN_GAP.instructionsBg[0].textBg).toMatch(/светлин/i);
  });
});

// ---------------------------------------------------------------------------
// 5. The «колона» the briefing promises has to be visible from the cockpit
// ---------------------------------------------------------------------------

describe("sc-follow-standstill stages a column the driver can actually see", () => {
  it("at least one queue member clears the tail's roofline", () => {
    // Three 1.45 m cars nose-to-tail on one lane, eye ~1.2 m, tail at rest 25 m
    // out: the sight line over its roof is at 1.52 m by the second car and
    // 1.59 m by the third, so both were FULLY occluded — the audit read „a
    // single vehicle roughly 40 m ahead, with nothing behind it" off two
    // separate frames. Height is the only axis that clears a roofline; a
    // lateral stagger of 0.45 m at 32 m is 0.35° of sliver.
    const queue = (SC_FOLLOW_STANDSTILL.levels[0].stagedAdd ?? []) as BrakingLeadCarSpec[];
    expect(queue.length, "the queue ahead of the tail").toBeGreaterThanOrEqual(2);
    const tall = queue.filter(
      (q) => q.actor.profile === "van" || q.actor.profile === "truck",
    );
    expect(tall.length, "queue members taller than a car").toBeGreaterThanOrEqual(2);
  });

  it("…without parking them inside one another", () => {
    // The opposite direction: a van is 5.2 m and a box truck 7.5 m, so the old
    // 7 m centres that suited three cars would leave 0.65 m of clear air
    // between the van and the truck. A stopped queue keeps ≈ 3 m.
    const tail = SC_FOLLOW_STANDSTILL.staged![0] as unknown as BrakingLeadCarSpec;
    const queue = (SC_FOLLOW_STANDSTILL.levels[0].stagedAdd ?? []) as BrakingLeadCarSpec[];
    const line = [
      { y: 290, len: CAR_LENGTH_M }, // the tail's authored rest pose (paceProfile)
      ...queue.map((q) => ({
        y: q.actor.hold.offsetM,
        len: VEHICLE_PROFILE_LENGTH_M[q.actor.profile ?? "car"],
      })),
    ].sort((a, b) => a.y - b.y);
    expect(tail.id).toBe("sc-fs-lead");
    for (let i = 1; i < line.length; i++) {
      const clearM = line[i].y - line[i - 1].y - line[i].len / 2 - line[i - 1].len / 2;
      expect(clearM, `clear tarmac between queue member ${i - 1} and ${i}`).toBeGreaterThan(2);
      expect(clearM, `clear tarmac between queue member ${i - 1} and ${i}`).toBeLessThan(5);
    }
  });

  it("the props still never arm — this is scenery, not a second graded lead", () => {
    const queue = (SC_FOLLOW_STANDSTILL.levels[0].stagedAdd ?? []) as BrakingLeadCarSpec[];
    for (const q of queue) {
      expect(q.armDistM, `${q.id} armDistM`).toBe(3);
      expect(q.minSlamSpeedKmh, `${q.id} slam tier`).toBeGreaterThanOrEqual(100);
    }
    // …and the trace recorder's view of the world (`spec.staged`) is untouched.
    expect(SC_FOLLOW_STANDSTILL.staged!.map((s) => s.id)).toEqual(["sc-fs-lead"]);
  });
});

// ---------------------------------------------------------------------------
// 6. The caps this lane added or kept may never out-run the sign (B58)
// ---------------------------------------------------------------------------

describe("every following gate stays under its own street's posted limit", () => {
  it("compiled cap ≤ posted, at every rung", () => {
    const over: string[] = [];
    for (const spec of [
      SC_FOLLOW_DISTANCE,
      SC_FOLLOW_BRAKE,
      SC_FOLLOW_STANDSTILL,
      SC_FOLLOW_RAIN_GAP,
      SC_FOLLOW_TRUCK,
      SC_FOLLOW_CUTIN,
      SC_FOLLOW_TAILGATER,
    ]) {
      const posted = spec.map.params?.maxspeedKmh as number | undefined;
      expect(posted, `${spec.id} declares a posted limit`).toBeGreaterThan(0);
      for (const level of [1, 2, 3, 4, 5] as const) {
        for (const o of compileScenario(spec, level).objectives) {
          const cap = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh;
          if (cap !== undefined && cap > posted!) {
            over.push(`${spec.id}@L${level} ${o.id}: cap ${cap} > posted ${posted}`);
          }
        }
      }
    }
    expect(over, over.join("\n")).toEqual([]);
  });
});
