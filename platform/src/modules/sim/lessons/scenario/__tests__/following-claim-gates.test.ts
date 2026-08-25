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

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { BrakingLeadCarSpec, CutInLeadCarSpec } from "../../../contracts";
import { VEHICLE_PROFILE_LENGTH_M } from "../../../traffic/types";
import { TRUCK_DIMENSIONS } from "../../../traffic/vehicleFleet";
import {
  createEvalState,
  parseObjectiveParams,
  REACH_ZONE_CAP_SLACK_KMH,
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

// ---------------------------------------------------------------------------
// 7–10. THE NUMBERS THE PROSE ARGUES HARDEST FOR, WHICH NOTHING HELD
//
// Doc 88 §3 item 6, re-verified here BEFORE a line of this was written. Four
// numbers in `templates-following.ts` carry paragraphs of measured reasoning
// and no test. Each was mutated on its own and the 30-file observer set of this
// template — every test file in the gate that imports the family or names an
// `sc-follow-*` id — was re-run against it:
//
//   sc-fd-follow   maxSpeedKmh        32 → 26            30/30 files green
//   sc-fs-stopped  maxSpeedKmh         1 → 3             30/30 files green
//   sc-fs-stopped  acceptBeforeMarkM  −2.9 → −0.01       30/30 files green
//   FS_QUEUE_AHEAD deepest profile    truck → van        30/30 files green
//
// (The first was also run against the WHOLE gate: 639 files, 9 850 tests,
// exit 0. Sections 1–6 above are not the hole — they assert PASS/REFUSE on the
// three committed recordings, and all three recordings survive all four
// mutations unchanged. A recording can only ever say which side of a boundary
// it fell; it cannot say where the boundary is.)
//
// Every one of the four is a defect the template argues against in writing.
// 26 leaves the demonstrated-correct drive 0.1 км/ч of margin — T18 / founder
// item 48 („I received an error I have been tailing him too close and in fact I
// wasn't"), one decimal smaller. 3 credits a car that never stopped under a
// title that says «Спри», which is the sweep-161 finding verbatim. −0.01
// refuses the student who stops exactly where instruction 5 sends him. And a
// van's roofline is a GLB height no module in this repo states, so swapping it
// in deletes the proof and keeps the sentence.
//
// Each section below therefore fails on the mutation AND on the lazy
// over-correction in the other direction, because a cap loosened until it
// credits everybody is the same crime as one tightened until it refuses the
// shadow.
// ---------------------------------------------------------------------------

/** Samples of a committed recording named the way the templates name them
 *  (`spec.shadow.path`, `spec.mistakes[].traceRef.path`). */
function samplesAtPath(relPath: string): TraceSample[] {
  const j = JSON.parse(readFileSync(path.join(REPO_ROOT, relPath), "utf-8")) as {
    samples: TraceSample[];
  };
  expect(j.samples.length, `${relPath} has samples`).toBeGreaterThan(50);
  return j.samples;
}

interface Disc {
  x: number;
  y: number;
  radiusM: number;
}

/** What a recording's speedometer read while it was inside an authored disc —
 *  the exact measurement every cap in this file was chosen from, recomputed
 *  rather than quoted. */
function inZoneSpeeds(samples: readonly TraceSample[], disc: Disc): number[] {
  return samples
    .filter((s) => Math.hypot(s.x - disc.x, s.y - disc.y) <= disc.radiusM)
    .map((s) => s.speedKmh);
}

interface FlowGate {
  specId: string;
  objectiveId: string;
  capKmh: number;
  disc: Disc;
  shadowPath: string;
  mistakePaths: string[];
}

/** Every gate in the family that grades a PACE — a reachZone cap ABOVE the halt
 *  band. `sc-fs-stopped`'s 1 is a halt demand, a different instrument with a
 *  different failure mode, and §8/§9 grade it. */
function flowCappedGates(): FlowGate[] {
  const out: FlowGate[] = [];
  for (const spec of SCENARIO_TEMPLATES_FOLLOWING) {
    for (const o of spec.success) {
      if (o.params.kind !== "reachZone") continue;
      const cap = o.params.maxSpeedKmh;
      if (cap === undefined || cap <= REACH_ZONE_HALT_CAP_KMH) continue;
      out.push({
        specId: spec.id,
        objectiveId: o.id,
        capKmh: cap,
        disc: { x: o.params.x, y: o.params.y, radiusM: o.params.radiusM },
        shadowPath: spec.shadow.path,
        mistakePaths: (spec.mistakes ?? []).map((m) => m.traceRef.path),
      });
    }
  }
  return out;
}

describe("a following cap is a measurement, and a measurement has two edges", () => {
  const gates = flowCappedGates();

  it("the sweep sees every pace cap in the family — and only those", () => {
    // A cap added here without a shadow to clear and a mistake to refuse is the
    // defect this census was opened for; landing one now costs a line in this
    // list and an answer to both assertions below.
    expect(gates.map((g) => g.objectiveId).sort()).toEqual([
      "sc-fc-rebuild",
      "sc-fd-follow",
      "sc-fr-follow",
      "sc-ft-follow",
      "sc-ftg-ease",
    ]);
  });

  it("no cap sits inside a speedometer's error of the drive it must CREDIT", () => {
    /**
     * MEASURED HERE, at each gate's own authored disc (the same circles the
     * template comments quote, recomputed from the committed tapes):
     *
     *   gate           cap   shadow holds   margin
     *   sc-fd-follow    32     25.9 (×56)     6.1
     *   sc-fr-follow    30     24.9 (×58)     5.1   ← 0.1 км/ч inside the rule
     *   sc-ft-follow    30     20.8 (×70)     9.2
     *   sc-fc-rebuild   34     28.0 (×52)     6.0
     *   sc-ftg-ease     36     28.0 (×51)     8.0
     *
     * The floor is REACH_ZONE_CAP_SLACK_KMH — this product's own number for
     * „speedometer/physics slack, which does not grow because the road is
     * faster" (objectives.ts, borrowed from the rule engine's
     * speedingGraceMaxKmh). A cap closer than that to the pace the lesson
     * DEMONSTRATES is decided by needle wobble, and the hardest rung gets no
     * ladder grace to hide it: L5 compiles the authored number unchanged.
     */
    const tight: string[] = [];
    for (const g of gates) {
      const shadow = inZoneSpeeds(samplesAtPath(g.shadowPath), g.disc);
      expect(shadow.length, `${g.objectiveId}: the shadow crosses its own circle`).toBeGreaterThan(
        20,
      );
      const ceilKmh = Math.max(...shadow);
      if (g.capKmh - ceilKmh < REACH_ZONE_CAP_SLACK_KMH) {
        tight.push(
          `${g.specId}/${g.objectiveId}: cap ${g.capKmh} over a shadow holding ${ceilKmh.toFixed(
            1,
          )} км/ч — ${(g.capKmh - ceilKmh).toFixed(1)} км/ч of margin`,
        );
      }
    }
    expect(tight, tight.join("\n")).toEqual([]);
  });

  it("…and every refusal it makes is by more than that error, with one to make", () => {
    /**
     * The other edge. Same discs, the mistake demos each template ships:
     *
     *   sc-fd-follow   47.9 / 47.9   → refuses both by 15.9
     *   sc-fr-follow   38.5 / 39.9   → refuses both by ≥ 8.5
     *   sc-ft-follow   47.9 / 47.9   → refuses both by 17.9
     *   sc-fc-rebuild  39.9 / 40.1   → refuses both by ≥ 5.9
     *   sc-ftg-ease    57.9          → refuses one by 21.9
     *
     * `mistake-brake-check` is deliberately not among them: it stands still in
     * its zone (0–33.4 км/ч over 118 frames) and a cap cannot see a brake check.
     * Its fault is HARSH_BRAKING_NO_CAUSE and the rule engine bills it — which
     * is why the requirement is „at least one" rather than „all". A cap that
     * refuses NONE of its drill's own recorded mistakes is not a check.
     */
    const bad: string[] = [];
    for (const g of gates) {
      const seen = g.mistakePaths
        .map((p) => ({ p, speeds: inZoneSpeeds(samplesAtPath(p), g.disc) }))
        .filter((m) => m.speeds.length > 0)
        .map((m) => ({ p: m.p, floorKmh: Math.min(...m.speeds) }));
      const refused = seen.filter((m) => m.floorKmh > g.capKmh);
      if (refused.length === 0) {
        bad.push(
          `${g.specId}/${g.objectiveId}: cap ${g.capKmh} refuses none of its own ${seen.length} mistake demo(s)`,
        );
        continue;
      }
      for (const m of refused) {
        if (m.floorKmh - g.capKmh < REACH_ZONE_CAP_SLACK_KMH) {
          bad.push(
            `${g.specId}/${g.objectiveId}: cap ${g.capKmh} refuses ${m.p} by only ${(
              m.floorKmh - g.capKmh
            ).toFixed(1)} км/ч`,
          );
        }
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 8. «СПРИ» means stopped — which is only a claim if a car that never stopped
//    is refused, and only honest if one that did is still credited
// ---------------------------------------------------------------------------

/** The graded standstill gate, and the lane metre it is authored on. */
const FS_STOP_PARAMS = SC_FOLLOW_STANDSTILL.success.find((o) => o.id === "sc-fs-stopped")!
  .params as {
  kind: "reachZone";
  x: number;
  y: number;
  radiusM: number;
  maxSpeedKmh?: number;
  acceptBeforeMarkM?: number;
};

/**
 * A straight run up this drill's own lane, one sample every 0.25 m, optionally
 * ending at rest for `restSec`.
 *
 * SYNTHETIC ON PURPOSE, and this is the whole lesson of §3 item 6: the three
 * committed recordings come to rest in exactly TWO places (y = 280.95 and
 * y = 284.66) and roll the approach at one speed, so between them they can only
 * ever report which side of a boundary they fell on. They cannot report where
 * the boundary is — which is why all four mutations left them, and every test
 * built on them, green.
 */
function laneRun(opts: {
  fromY: number;
  toY: number;
  speedKmh: number;
  restSec?: number;
}): TraceSample[] {
  const { fromY, toY, speedKmh, restSec = 0 } = opts;
  const stepM = 0.25;
  const mps = speedKmh / 3.6;
  const out: TraceSample[] = [];
  let t = 0;
  for (let y = fromY; y <= toY + 1e-9; y += stepM) {
    out.push({ tSec: t, x: FS_STOP_PARAMS.x, y: Math.min(y, toY), speedKmh });
    t += stepM / mps;
  }
  for (let i = 0; i < Math.round(restSec * 10); i++) {
    t += 0.1;
    out.push({ tSec: t, x: FS_STOP_PARAMS.x, y: toY, speedKmh: 0 });
  }
  return out;
}

describe("sc-fs-stopped: «Спри» refuses the car that never stopped", () => {
  it("no roll past the mark earns it, at any speed inside the halt band", () => {
    // The measurement that opened this row: at the shipped `maxSpeedKmh: 6` all
    // three recordings ticked this objective AT 6.0 км/ч, because `capMet` asks
    // `speedKmh <= cap` and a car rolling AT the cap satisfies it. Every speed
    // below is one a HALT demand may not accept — 2 and 3 because the title
    // says «Спри» and they are not stopping, 6 because that is the number this
    // row was opened against, and REACH_ZONE_HALT_CAP_KMH (8) because it is the
    // top of the band inside which a cap still means „come to rest here". The
    // drive never once drops under the standstill line; it simply drives past.
    for (const rollKmh of [2, 3, 6, REACH_ZONE_HALT_CAP_KMH]) {
      const rollThrough = laneRun({ fromY: 250, toY: 300, speedKmh: rollKmh });
      for (const level of [1, 2, 3, 4, 5] as const) {
        expect(
          objectiveCompletes(SC_FOLLOW_STANDSTILL, level, "sc-fs-stopped", rollThrough),
          `${rollKmh} км/ч roll-through at L${level}`,
        ).toBe(false);
      }
    }
  });

  it("…and the student who really stops, short of the mark, still gets it", () => {
    // The opposite direction, and the reason the answer is not „demand zero and
    // be done with it": B4/B5 is the founder's own rescue — a halt gate credits
    // a car that comes to REST before the mark, inside the approach capsule
    // (radius 8 + REACH_ZONE_GRACE_M, far end cut at the paint). This drive
    // never enters the disc at all: it stops at y = 272, nine metres out, and
    // is credited at every rung because it stopped. Push the cap out of the
    // halt band to make the assertion above pass and this credit vanishes with
    // it — the capsule only opens for a halt demand.
    const stopsShort = laneRun({ fromY: 250, toY: 272, speedKmh: 6, restSec: 3 });
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(
        objectiveCompletes(SC_FOLLOW_STANDSTILL, level, "sc-fs-stopped", stopsShort),
        `stops short at L${level}`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. «НА РАЗУМНО РАЗСТОЯНИЕ» — the boundary is the taught two metres, and it is
//    bounded from BOTH sides or it is a number nobody is holding
// ---------------------------------------------------------------------------

describe("sc-fs-stopped: the acceptance ends where the briefing says it does", () => {
  /** Instruction 5: «Спри зад него на около два метра». */
  const TAUGHT_STANDSTILL_GAP_M = 2;
  /** The tail's measured rest pose — the metre every graded number here hangs
   *  off (the standstill gap is `290 − playerY − 4.1`). */
  const TAIL_REST_Y = 290;
  /** Bumper-to-bumper: tail rear at 290 − 2.05 = 287.95, hero front at y + 2.05,
   *  so the closest lawful rest pose is 287.95 − 2 − 2.05 = 283.9. */
  const CLOSEST_LAWFUL_REST_Y =
    TAIL_REST_Y - CAR_LENGTH_M / 2 - TAUGHT_STANDSTILL_GAP_M - CAR_LENGTH_M / 2;

  it("the tail still parks where that arithmetic starts", () => {
    // If the last leg moves, every number in this describe is stale — so it is
    // asserted rather than assumed. 289.5 + the 2.2²/(2×4.5) = 0.54 m the ramp
    // overshoots is the measured rest at y = 290.0.
    const tail = SC_FOLLOW_STANDSTILL.staged![0] as unknown as BrakingLeadCarSpec;
    const legs = tail.paceProfile ?? [];
    const last = legs[legs.length - 1];
    expect(last?.speedMps, "the tail comes to rest").toBe(0);
    expect(last?.atS, "the arc metre it rests at").toBe(289.5);
    expect(CLOSEST_LAWFUL_REST_Y).toBeCloseTo(283.9, 6);
  });

  it("credits the student who stops exactly where instruction 5 sends him", () => {
    // THE MUTATION THIS EXISTS FOR: `acceptBeforeMarkM −2.9 → −0.01` cuts the
    // acceptance at the mark itself (y = 281.01) instead of at the taught pose
    // (y = 283.9), and all three committed recordings survive it — the two that
    // pass come to rest at y = 280.95, BEHIND the cut, and the one that fails
    // fails on the far side of both. The student who does exactly as he is told
    // is the only drive that can tell −2.9 from −0.01, and nothing in the repo
    // was driving him. He rolls in at the 6 км/ч the gate used to accept and
    // stops 2.05 m off the tail's bumper — five centimetres inside the taught
    // two, so the assertion is about the boundary and not about float noise.
    const atTaughtGap = laneRun({
      fromY: 250,
      toY: CLOSEST_LAWFUL_REST_Y - 0.05,
      speedKmh: 6,
      restSec: 3,
    });
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(
        objectiveCompletes(SC_FOLLOW_STANDSTILL, level, "sc-fs-stopped", atTaughtGap),
        `stops at the taught two metres, L${level}`,
      ).toBe(true);
    }
  });

  it("…and refuses the recorded bumper-hugger's own resting pose", () => {
    // The other side of the same boundary, read off the committed tape rather
    // than typed: `mistake-bumper-kiss` comes to rest at y = 284.66 — 1.24 m of
    // clear air, which its own `whatWentWrongBg` calls «под метър и половина
    // разстояние». Loosen the cut past that and the drill certifies the pose it
    // ships as a mistake. Together with the assertion above the boundary is
    // pinned into a 0.81 m window, each end held by a drive rather than by a
    // preference.
    const kiss = samplesOf("sc-follow-standstill", "mistake-bumper-kiss");
    const kissRestY = kiss[kiss.length - 1].y;
    expect(kissRestY, "the recorded bumper-kiss rest pose").toBeCloseTo(284.66, 2);
    const atKissPose = laneRun({ fromY: 250, toY: kissRestY, speedKmh: 6, restSec: 3 });
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(
        objectiveCompletes(SC_FOLLOW_STANDSTILL, level, "sc-fs-stopped", atKissPose),
        `stops at the bumper-kiss pose, L${level}`,
      ).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 10. The column is only a column if the deepest car in it has a roofline this
//     repository can actually prove
// ---------------------------------------------------------------------------

describe("sc-follow-standstill: the queue's depth is proven, not asserted", () => {
  /**
   * The vehicle heights this repository HOLDS, in metres. `truck` is the
   * procedural box-truck rig's own body plan (`TRUCK_DIMENSIONS.boxHeightM`,
   * traffic/vehicleFleet.ts) — a number the renderer builds geometry from. The
   * van is the kargo_v GLB and no module in this repo states its height, so it
   * is deliberately ABSENT: the template's own block declines to claim it
   * («The van's rig height is a GLB this lane did not measure, so it is not
   * being claimed here»), and a roofline nobody measured cannot be the thing
   * that clears a sight line.
   */
  const PROVEN_ROOF_M = new Map<string, number>([["truck", TRUCK_DIMENSIONS.boxHeightM]]);

  /**
   * The sight line over the stopped tail's roof, at the deepest queue member,
   * from the credited rest pose: 1.59 m — the arithmetic in the template's own
   * SWEEP 161 block, and the reason the audit read „a single vehicle roughly
   * 40 m ahead, with nothing behind it" off two separate frames
   * (`sc-follow-standstill/pc-right/05-stopped.png`, and again at t = 156 s).
   * Three 1.45 m cars nose-to-tail were all under it.
   */
  const SIGHT_LINE_OVER_TAIL_M = 1.59;

  it("the last vehicle in the queue stands above that line", () => {
    // THE MUTATION THIS EXISTS FOR: `truck → van` on the deepest member leaves
    // the sibling assertion in §5 green — it counts profiles that are „van or
    // truck" and two vans still count two — while deleting the only measured
    // height in the column. The word «колона» would again be a claim the
    // cockpit does not keep, which is the exact defect B70 fixed one layer up.
    const queue = (SC_FOLLOW_STANDSTILL.levels[0].stagedAdd ?? []) as BrakingLeadCarSpec[];
    expect(queue.length, "a queue to be deep at all").toBeGreaterThanOrEqual(2);
    const deepest = [...queue].sort(
      (a, b) => b.actor.hold.offsetM - a.actor.hold.offsetM,
    )[0];
    const profile = deepest.actor.profile ?? "car";
    const roofM = PROVEN_ROOF_M.get(profile);
    expect(
      roofM,
      `${deepest.id} is a «${profile}» — this repo states no height for it, so its roofline proves nothing`,
    ).toBeDefined();
    expect(roofM!, `${deepest.id} roofline vs the sight line over the tail`).toBeGreaterThan(
      SIGHT_LINE_OVER_TAIL_M,
    );
  });

  it("…and the proof is not bought by making the GRADED lead tall", () => {
    // The opposite direction. Every graded number on this drill is computed
    // from a CAR's 4.1 m — the standstill gap `290 − playerY − 4.1`, the
    // credited rest pose of §9, the two convictions at y = 284.7 — and all
    // three committed recordings depict a car in front of them. Clearing the
    // roofline by promoting the tail instead of the queue would move every one
    // of those silently, and this file's whole subject is numbers that move
    // without anything going red.
    const tail = SC_FOLLOW_STANDSTILL.staged![0] as unknown as BrakingLeadCarSpec;
    expect(tail.id).toBe("sc-fs-lead");
    expect(tail.actor.profile, "the graded lead is a plain car").toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 11. A harder rung may ADD to the world. It may never delete from it.
//     (Round 2 — sc-follow-standstill:a9f2bb6b, the half nobody had driven)
// ---------------------------------------------------------------------------

/**
 * THE FRAME SAID «one lead vehicle, nothing queued behind it». THE FIX B70
 * SHIPPED WAS REAL — AND ONE RUNG OUT OF FIVE STILL LOOKED EXACTLY LIKE THE
 * FRAME.
 *
 * `LevelSpec.stagedAdd` has no inheritance: `compileScenario` builds a rung's
 * world as `[...spec.staged, ...rung.stagedAdd]`, reading ONLY that rung. The
 * complication kit (`scenario/complications.ts`) authors a WHOLE LevelSpec, so
 * `l5Wet()` written as a bare rung replaces the rung it stands in — and
 * `sc-follow-standstill`, whose L1–L4 each carry `stagedAdd: FS_QUEUE_AHEAD`,
 * compiled its L5 with the two column members gone:
 *
 *   L1 3 · L2 3 · L3 3 · L4 3 · **L5 1**
 *
 * Nothing goes red when that happens. The rung still compiles, the
 * complication card is still correct (it adds weather and grip, and it says
 * so), the graded numbers are all computed against the TAIL, and every
 * existing assertion about the queue in this file reads `levels[0]` — which is
 * exactly the rung that was still right. The only thing that changed was that
 * a lesson called «Дистанция при спиране в КОЛОНА», whose instruction 4
 * promises «там стои спряла колона», staged one car on the rung where the road
 * is wet and the stopping distance is ~1.4× longer.
 *
 * SO THE ASSERTION IS NOT ABOUT THAT LINE. It is the invariant the line broke,
 * swept over every authored rung of all seven templates: the set of staged
 * actors may grow as the ladder climbs and may never shrink. A rung that is
 * harder to FINISH because the world got emptier is not difficulty — it is the
 * lesson quietly withdrawing its own subject.
 *
 * WATCHED RED: restoring the bare `l5Wet()` on `sc-follow-standstill` fails
 * this with «sc-follow-standstill L4→L5 drops sc-fs-queue-1, sc-fs-queue-2».
 */
describe("a harder rung adds to the world and never deletes from it", () => {
  /** The staged-actor ids the student actually meets on a compiled rung. */
  function stagedIdsAt(spec: ScenarioSpec, level: 1 | 2 | 3 | 4 | 5): string[] {
    const lesson = compileScenario(spec, level);
    const staged = (lesson as unknown as { stagedEvents?: { id: string }[] }).stagedEvents ?? [];
    return staged.map((s) => s.id).sort();
  }

  it("has rungs to sweep at all (a sweep over nothing proves nothing)", () => {
    const rungs = SCENARIO_TEMPLATES_FOLLOWING.flatMap((s) => s.levels);
    expect(SCENARIO_TEMPLATES_FOLLOWING.length).toBe(7);
    expect(rungs.length, "authored rungs across the family").toBeGreaterThanOrEqual(30);
    // …and at least one of them really does stage something per-rung, or the
    // invariant below is vacuous on this file forever.
    expect(
      SCENARIO_TEMPLATES_FOLLOWING.some((s) => s.levels.some((l) => (l.stagedAdd ?? []).length > 0)),
      "some rung in this family carries stagedAdd",
    ).toBe(true);
  });

  it("no rung stages fewer actors than the rung below it", () => {
    const dropped: string[] = [];
    for (const spec of SCENARIO_TEMPLATES_FOLLOWING) {
      for (let i = 1; i < spec.levels.length; i++) {
        const lo = spec.levels[i - 1].level;
        const hi = spec.levels[i].level;
        const below = stagedIdsAt(spec, lo);
        const above = stagedIdsAt(spec, hi);
        const gone = below.filter((id) => !above.includes(id));
        if (gone.length > 0) dropped.push(`${spec.id} L${lo}→L${hi} drops ${gone.join(", ")}`);
      }
    }
    expect(dropped, "rungs that delete a staged actor the rung below staged").toEqual([]);
  });

  it("sc-follow-standstill keeps a column at EVERY rung, not just the one L1 authors", () => {
    // The named case, stated in the lesson's own terms so the reason survives
    // a refactor of the sweep above: «колона» is the title, the objective and
    // instruction 4, and a column is at minimum the tail plus one more.
    //
    // The GEOMETRY is compared too, not just the ids — §9 and §10 above prove
    // the spacing and the roofline off `levels[0]`, so a rung that kept the
    // names and moved the metres would satisfy every other assertion in this
    // file while putting the column somewhere the student never looks.
    const queueAt = (level: 1 | 2 | 3 | 4 | 5): string =>
      (
        (compileScenario(SC_FOLLOW_STANDSTILL, level) as unknown as {
          stagedEvents?: { id: string; actor: { hold: { offsetM: number }; profile?: string } }[];
        }).stagedEvents ?? []
      )
        .filter((s) => s.id.startsWith("sc-fs-queue-"))
        .map((s) => `${s.id}@${s.actor.hold.offsetM}/${s.actor.profile ?? "car"}`)
        .sort()
        .join(" · ");

    for (const level of [1, 2, 3, 4, 5] as const) {
      const ids = stagedIdsAt(SC_FOLLOW_STANDSTILL, level);
      expect(ids, `sc-follow-standstill L${level} stages the graded tail`).toContain("sc-fs-lead");
      const queue = ids.filter((id) => id.startsWith("sc-fs-queue-"));
      expect(
        queue.length,
        `sc-follow-standstill L${level} stages a column, not one car — got [${ids.join(", ")}]`,
      ).toBeGreaterThanOrEqual(2);
      expect(
        queueAt(level),
        `sc-follow-standstill L${level} parks the column where L1 parks it`,
      ).toBe(queueAt(1));
    }
  });
});

// ---------------------------------------------------------------------------
// 12. THE EXPOSURE LEDGER — a pace cap has an upper edge and no lower one, so
//     every «Следвай/Продължи … спокойно» gate in this family credits a car
//     that has STOPPED. This is NOT a fix. It is the measurement that says
//     what a fix would have to change, and where. (Round 2 — sc-follow-cutin
//     :996fd693, which is not closed by anything in this file.)
// ---------------------------------------------------------------------------

/**
 * THE FRAME. `sc-follow-cutin/pc-wrong/04-t017s.png` carries a green ✓ against
 * «Продължи спокойно след вклиняването» while the speedometer reads **0 км/ч**,
 * the lead car's brake bar is lit two metres from the bonnet, and the fault
 * card beside it reads «ОПАСНА ГРЕШКА −10 изпитни т. · Удар в друго превозно
 * средство … преди 3 с». The student is credited with continuing calmly three
 * seconds after rear-ending the car he was told to follow.
 *
 * THE MECHANISM, read out of `lessons/objectives.ts` rather than guessed. The
 * arrival contract is `speedKmh <= cap && (inAcceptance || graceArmed)`, and
 * `capMet` is `(st.capMet && !spent) || contractEarned`. `capSpent` fires while
 * the car is over `cap + REACH_ZONE_CAP_SLACK_KMH` on the approach — so the
 * barge really does spend the latch — but the latch is then RE-EARNED the
 * moment the car is slow enough inside the disc, and 0 км/ч is slow enough.
 * There is no floor anywhere in `ReachZoneParams`; `minSpeedKmh` does not
 * exist in `lessons/types.ts` at all.
 *
 * SO THIS FILE CANNOT FIX IT. Every remedy available to a TEMPLATE is a
 * different sentence in the title, and the sweep in §1 already made these
 * titles claim no more than a place and a pace. What is left is that the pace
 * itself is only half-measured, and that lives one module up.
 *
 * WHAT WOULD FIX IT, stated so the next lane does not have to re-derive it:
 * a `minSpeedKmh` on `ReachZoneParams`, ANDed into `contractEarned` and spent
 * by the same `capSpent` rule, would let «Следвай … спокойно» mean „was
 * following, calmly" instead of „was at most this fast, possibly because he
 * had stopped". Four of the five rows below would then author one; the fifth
 * (`sc-fs-stopped`) must not, because its cap IS the halt demand.
 *
 * THE LEDGER GOES RED WHEN THE EXPOSURE CLOSES, and that is the point: the day
 * a floor lands and this family adopts it, this test fails and is deleted with
 * the row it was standing in for. A silent exposure is how «0,0 с» ended up
 * three centimetres under a green tick in the first place.
 */
describe("EXPOSURE (not a fix): a pace cap credits the car that stopped inside it", () => {
  /** Enter the disc well over the cap, then come to rest in it — the frame. */
  function bargesThenStops(spec: ScenarioSpec, objectiveId: string, cap: number): boolean {
    const lesson = compileScenario(spec, 1);
    const objective = lesson.objectives.find((o) => o.id === objectiveId)!;
    const params = parseObjectiveParams(objective);
    const zx = (params as unknown as { x: number }).x;
    const zy = (params as unknown as { y: number }).y;
    let state: ObjectiveEvalState = createEvalState(params);
    let done = false;
    let t = 0;
    const feed = (y: number, speedKmh: number): void => {
      t += 0.2;
      const r = stepObjective(params, state, makeTick({ t, speedKmh, position: { x: zx, y } }));
      state = r.evalState;
      done = done || r.done;
    };
    for (let y = zy - 60; y < zy - 2; y += 2) feed(y, cap + 20); // the barge
    for (let i = 0; i < 40; i++) feed(zy - 1, 0); // …and the crash-stop
    return done;
  }

  it("every flow-capped following gate in the family does it — all five, measured", () => {
    const credited: string[] = [];
    const refused: string[] = [];
    for (const spec of SCENARIO_TEMPLATES_FOLLOWING) {
      for (const o of compileScenario(spec, 1).objectives) {
        const p = parseObjectiveParams(o) as unknown as { kind: string; maxSpeedKmh?: number };
        if (p.kind !== "reachZone" || p.maxSpeedKmh === undefined) continue;
        // A HALT demand is excluded on purpose and not for convenience: on
        // `sc-fs-stopped` the cap IS «спри», so crediting the car at rest is
        // the row working. Everything else here is a FLOW cap, where at rest
        // is the one state the title cannot mean.
        if (p.maxSpeedKmh <= REACH_ZONE_HALT_CAP_KMH) continue;
        const row = `${spec.id}/${o.id} «${o.titleBg}» cap ${p.maxSpeedKmh}`;
        (bargesThenStops(spec, o.id, p.maxSpeedKmh) ? credited : refused).push(row);
      }
    }
    expect(credited.length + refused.length, "flow-capped gates in this family").toBe(5);
    // If this ever fails with rows in `refused`, a speed FLOOR has landed:
    // delete this whole section and author the floor on the rows that need it.
    expect(
      refused,
      "a gate started refusing the stopped car — the floor has landed; retire this ledger",
    ).toEqual([]);
    expect(credited.length, "the exposure, measured").toBe(5);
  });

  it("…and the cut-in row is the one that was photographed doing it", () => {
    const objective = compileScenario(SC_FOLLOW_CUTIN, 1).objectives.find(
      (o) => o.id === "sc-fc-rebuild",
    )!;
    const cap = (parseObjectiveParams(objective) as unknown as { maxSpeedKmh: number }).maxSpeedKmh;
    expect(cap).toBeGreaterThan(REACH_ZONE_HALT_CAP_KMH);
    expect(
      bargesThenStops(SC_FOLLOW_CUTIN, "sc-fc-rebuild", cap),
      "pc-wrong/04-t017s.png: ✓ «Продължи спокойно след вклиняването» at 0 км/ч, 3 s after the collision",
    ).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   4 · A DEMONSTRATION CAPTION MAY NOT QUOTE A SPEED WITH NO SPEAKER
   ═══════════════════════════════════════════════════════════════════════════

   THE FRAME, w10-3 · `sc-follow-distance__pc-right/04-t179s.png`: the caption
   «На 26 км/ч тези двайсетина метра са близо 3 секунди — има време за реакция»
   on the glass, and the student's own instrument cluster under it reading
   **11 км/ч D**. The row was filed against `components/sim/lesson-ui/
   AdvisorCard.tsx` — „the advisor bubble quotes a speed the car is not doing" —
   and it is not the advisor: it is a `kind: "annotation"` step of the committed
   recording, painted by `TraceTimeline`'s caption box.

   AN EARLIER ROUND ALREADY REPAIRED THE ADJACENCY (`TraceTimeline`'s `mt-auto`,
   which drops the card onto the «ДЕМОНСТРАЦИЯ — СЛЕДВАЙ СЯНКАТА» panel that
   names the speaker) AND THE ROW REPRODUCED ANYWAY, one digit different: 0 км/ч
   on the old frame, 11 км/ч on the new one. Proximity is not attribution. What
   was left is the sentence's own grammar — a bare prepositional speed with no
   subject reads as a statement about the reader's car, and on THIS drill that
   is the exact misconception it exists to remove (the same twenty metres is a
   different amount of time at a different speed).

   THE CENSUS, over all 503 committed traces at the time of writing: 1 870
   annotations, 101 of which quote a км/ч figure, and exactly TWO opened with a
   bare speed — both in this family, both repaired in the same change. One
   enforced instance is a convention, so the shape is SWEPT rather than asserted
   twice: the other 99 already name their actor («Грешката: 72 км/ч», «колата
   задържа 38 км/ч») or state a conditional («при 50 км/ч …»), which is why this
   gate can be catalogue-wide without becoming an alarm nobody reads.

   IT READS THE COMMITTED TRACE AND NOT THE `.ts` SCRIPT, because the committed
   file is what the browser plays: a script edited without a re-record would
   otherwise pass a gate on copy nobody sees.                                */

/** Every committed recording in the repo, as `<lesson>/<name>`. */
function everyCommittedTrace(): Array<{ id: string; textsBg: string[] }> {
  const root = path.join(REPO_ROOT, "content", "traces");
  const out: Array<{ id: string; textsBg: string[] }> = [];
  for (const dir of readdirSync(root)) {
    const lessonDir = path.join(root, dir);
    if (!statSync(lessonDir).isDirectory()) continue;
    for (const file of readdirSync(lessonDir)) {
      if (!file.endsWith(".trace.json")) continue;
      const doc = JSON.parse(readFileSync(path.join(lessonDir, file), "utf-8")) as {
        events?: Array<{ kind?: string; textBg?: string }>;
      };
      const textsBg = (doc.events ?? [])
        .filter((e) => e.kind === "annotation" && typeof e.textBg === "string")
        .map((e) => e.textBg as string);
      out.push({ id: `${dir}/${file.replace(/\.trace\.json$/, "")}`, textsBg });
    }
  }
  return out;
}

/**
 * A caption that OPENS with a speed CLAUSE and names nobody: «На 26 км/ч …».
 *
 * Anchored at the start on purpose, and that anchor is the false-refusal half.
 * Mid-sentence figures are how the other 99 captions in the bank correctly say
 * «Грешката: 72 км/ч …» and «при 50 км/ч е около 14 метра»; a predicate that
 * flagged those would be switched off inside a round and this row would come
 * straight back. What is banned is the ONE shape that has no subject at all.
 *
 * ── WIDENED 2026-08-25, AND ONE PROPOSED BRANCH WAS MEASURED AND REJECTED ──
 * An adversarial pass probed the first version and found it narrower than this
 * block's own title: it missed «Сега на 26 км/ч …» (an adverb in front of the
 * identical clause) and «На около 30 км/ч …» (a qualifier in front of the
 * identical figure). Both carry the defect whole, so the leading adverb and the
 * qualifier are now optional parts of the shape, and the preposition is matched
 * in either case because after an adverb it is lower-case.
 *
 * THE BRANCH THAT WAS REJECTED, and it is rejected on a MEASUREMENT rather than
 * on taste: the same pass proposed banning a caption that opens with a bare
 * figure and no preposition at all («26 км/ч и …»). Swept over the catalogue,
 * that branch refuses SIX live captions, every one of them correct — «130 км/ч
 * не оправдава лентата: без изпреварване мястото ти е вдясно.»
 * (`sc-mw-discipline/mistake-left-hog`), «48 км/ч в зона 30 е над +10 км/ч —
 * опасна грешка, отпадане на изпита.» (`sc-speed-transition/mistake-carry-
 * speed`) and four siblings. A bare figure that is the sentence's TOPIC («48
 * км/ч в зона 30 е …» — this speed, in this zone, is this fault) attributes
 * nothing to anybody; the defect is the ADVERBIAL clause («на 48 км/ч …» — at
 * this speed, [the thing you are watching] …), which is the one a reader
 * silently completes with his own car. Six false refusals is how a gate becomes
 * an alarm nobody reads, and this file has said so since it was written.
 * «При 26 км/ч …» stays permitted for the same reason: it is explicitly a
 * conditional and reads as one.
 */
const BARE_SPEED_OPENING =
  /^\s*(?:(?:Сега|Тук|Там|Вече|Ето)\s+)?(?:[Нн]а|[Сс]ъс|[Сс])\s+(?:около\s+|близо\s+|над\s+|под\s+)?\d{1,3}\s*км\/ч/;

describe("no demonstration caption states a speed the student may read as his own", () => {
  const traces = everyCommittedTrace();
  const captions = traces.flatMap((t) => t.textsBg);

  it("has a corpus at all — a sweep over nothing proves nothing", () => {
    // Non-vacuity in BOTH dimensions: a reader that found no files, or found
    // files and no annotations inside them, would pass the rule below while
    // measuring nothing. These are the numbers measured on 2026-08-25 and they
    // are FLOORS, so adding lessons cannot turn the gate off.
    expect(traces.length, "committed trace files").toBeGreaterThanOrEqual(500);
    expect(captions.length, "annotations in the bank").toBeGreaterThanOrEqual(1800);
    expect(
      captions.filter((c) => c.includes("км/ч")).length,
      "captions that quote a speed at all — the population this rule is about",
    ).toBeGreaterThanOrEqual(95);
  });

  it("the predicate catches the shipped sentence and clears the 99 that are fine", () => {
    // The instrument before the measurement, as a MUTATION pair: a regex that
    // matched nothing and one that matched every км/ч figure each fail exactly
    // one of these lines, so neither can be mistaken for this one.
    expect(
      BARE_SPEED_OPENING.test("На 26 км/ч тези двайсетина метра са близо 3 секунди."),
      "the sentence photographed at 04-t179s",
    ).toBe(true);
    // The two shapes the first version of this predicate missed — same clause,
    // one adverb / one qualifier in front of it.
    expect(
      BARE_SPEED_OPENING.test("Сега на 26 км/ч тези двайсетина метра са близо 3 секунди."),
      "an adverb in front does not change whose speed the reader hears",
    ).toBe(true);
    expect(BARE_SPEED_OPENING.test("На около 30 км/ч спирачният път е двойно по-дълъг.")).toBe(true);
    expect(BARE_SPEED_OPENING.test("Грешката: 72 км/ч — уж съобразено с дъжда…")).toBe(false);
    expect(BARE_SPEED_OPENING.test("Един поглед встрани при 50 км/ч е около 14 метра.")).toBe(false);
    expect(
      BARE_SPEED_OPENING.test("Следвай спокойно на около 40 км/ч и дръж поне 2 секунди дистанция."),
    ).toBe(false);
    // …and the false-refusal half of the WIDENING, quoted from the live bank:
    // a bare figure that is the sentence's topic states a fact about a speed and
    // attributes it to nobody. Six such captions ship today; a predicate that
    // flagged them would be switched off inside a round.
    expect(
      BARE_SPEED_OPENING.test("130 км/ч не оправдава лентата: без изпреварване мястото ти е вдясно."),
      "sc-mw-discipline/mistake-left-hog, live and correct",
    ).toBe(false);
    expect(
      BARE_SPEED_OPENING.test("48 км/ч в зона 30 е над +10 км/ч — опасна грешка, отпадане на изпита."),
      "sc-speed-transition/mistake-carry-speed, live and correct",
    ).toBe(false);
    // The conditional form this drill deliberately permits.
    expect(BARE_SPEED_OPENING.test("При 26 км/ч двайсет метра са близо 3 секунди.")).toBe(false);
    // …and both repaired captions, which must be clear or the repair is circular.
    expect(
      BARE_SPEED_OPENING.test(
        "Сянката кара с 26 км/ч: при тази скорост двайсетина метра са близо 3 секунди — има време за реакция.",
      ),
    ).toBe(false);
  });

  it("NO committed caption in the catalogue opens with a bare speed", () => {
    const offenders = traces.flatMap((t) =>
      t.textsBg.filter((c) => BARE_SPEED_OPENING.test(c)).map((c) => `${t.id} :: ${c}`),
    );
    expect(offenders).toEqual([]);
  });

  it("…and this drill's two captions name the shadow, with the figures unmoved", () => {
    // The figures do NOT move — 26 and 48 are the recording's own — so nothing
    // downstream that quotes them has to move with them. Only the subject
    // arrives. Asserted verbatim so a re-record that drops the attribution is a
    // red line rather than a silent regression.
    const shadow = traces.find((t) => t.id === "sc-follow-distance/shadow-correct");
    const tailgate = traces.find((t) => t.id === "sc-follow-distance/mistake-tailgate");
    expect(shadow, "the committed shadow recording").toBeDefined();
    expect(tailgate, "the committed tailgate recording").toBeDefined();
    expect(shadow!.textsBg).toContain(
      "Сянката кара с 26 км/ч: при тази скорост двайсетина метра са близо 3 секунди — има време за реакция.",
    );
    expect(tailgate!.textsBg).toContain(
      "Сянката ще залепи на 48 км/ч: при тази скорост половин дължина кола е под две десети от секундата — няма никакво време за реакция.",
    );
  });

  it("every speed either caption quotes is one its OWN recording reaches", () => {
    // The half a grammar rule cannot see: naming the shadow is worthless if the
    // number is not the shadow's. Measured against the samples rather than the
    // script — `mistake-tailgate` says 48 and the recorded car is at 29,8 км/ч
    // when that caption fires, which is why that one is phrased as a conditional
    // about the leg it announces instead of as a claim about the instant.
    // THE FIGURE IS PARSED OUT OF THE COMMITTED CAPTION, not repeated here.
    // A list of expected numbers in this file would be a second copy of the
    // bank: a re-record that moved 26 to 60 would satisfy it and this gate
    // would be checking its own memory instead of the product.
    for (const id of [
      "sc-follow-distance/shadow-correct",
      "sc-follow-distance/mistake-tailgate",
    ] as const) {
      const [scenarioId, name] = id.split("/") as [string, string];
      const top = Math.max(...samplesOf(scenarioId, name).map((s) => s.speedKmh));
      const quoted = (traces.find((t) => t.id === id)?.textsBg ?? [])
        .flatMap((c) => Array.from(c.matchAll(/(\d{1,3})\s*км\/ч/g)))
        .map((m) => Number(m[1]));
      expect(quoted.length, `${id} quotes a speed at all`).toBeGreaterThan(0);
      for (const kmh of quoted) {
        expect(
          Math.abs(top - kmh),
          `${id} tops ${top.toFixed(1)} км/ч but its caption quotes ${kmh}`,
        ).toBeLessThanOrEqual(1.5);
      }
    }
  });
});
