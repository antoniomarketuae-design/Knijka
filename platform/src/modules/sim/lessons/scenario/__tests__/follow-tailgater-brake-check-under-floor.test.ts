/**
 * sc-follow-tailgater — THE BRAKE CHECK FROM THE SPEED THE LESSON ASKS FOR
 * (`sc-follow-tailgater:63c0c28c` clauses C1 / C2a, critical — rig-w2, 43b4109).
 *
 * WHAT THE JUDGE PHOTOGRAPHED. A full-pedal brake check at the tailgater
 * (strongest 0.3 s window −9.3 … −9.6 m/s², the лепка 8.5–8.9 m behind, the
 * chip «Кола отзад · 5 м») from 32.3–34.9 км/ч escaped ENTIRELY on four drives
 * at L1 and L3: no card, no rule event, «ИЗДЪРЖАН» ★★★ and «Чисто и спокойно
 * каране». From 38.4 and 45.5 км/ч the same pedal is HARSH_BRAKING_NO_CAUSE as
 * the lesson mistake. The line is the engine's `harshBrakeMinSpeedKmh` (35) —
 * and the lesson's own task 1 asks for under 36 (`sc-ftg-ease`, maxSpeedKmh
 * 36), so a student who obeys it and THEN brake-checks is under the floor by
 * the lesson's own instruction.
 *
 * WHAT IS BILLED NOW, AND ON WHAT. The founder's principle, ruled twice
 * (2026-09-30, 2026-10-05: «bill the forced braking» — a conviction rests on
 * what the other car ACTUALLY had to do): under the floor, a causeless
 * emergency-grade brake is billed when the close follower the lesson stages
 * (the лепка, glued behind him in his lane) itself had to brake HARD because
 * of it — its own speed through the product's own harsh-brake gates
 * (`rules/harshBrakeEpisode.ts`, ≥ 7 m/s² held 0.4 s, mean over the line).
 * The 35 км/ч floor stands for every other brake.
 *
 * THE CHAIN IS THE PRODUCT'S: `liveChainReplay` (the stack LessonScene builds
 * for a live lesson, graded on the fixed 1/60 s session grid, ADR-014) over
 * the committed ln-v1, at every rung, the drive written as an open-loop tape
 * (`tailgaterTape.ts`) of the rig's own mode-T drive. THE ORACLE for «the
 * follower had to brake hard» is computed HERE, from the follower's speed as
 * the traffic system publishes it — not from anything the repair publishes.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileScenario } from "../compile";
import { SC_FOLLOW_TAILGATER } from "../templates-following";
import type { ScenarioLevel } from "../types";
import { liveChainReplay, type LiveReplayOutcome } from "./liveChainReplay";
import {
  LANE_X,
  tailgaterTape,
  type TailgaterTapeOptions,
} from "./tailgaterTape";
import {
  newHarshBrakeTrack,
  stepHarshBrakeTrack,
} from "../../../rules/harshBrakeEpisode";
import { DEFAULT_RULE_CONFIG } from "../../../rules";
import { parseScenarioTrace } from "../../../traces/parse";

const REPO_ROOT = path.join(process.cwd(), "..");
const LN = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "ln-v1.json"), "utf-8"),
);
const TAIL_ID = "sc-ftg-tail";
const LEAD_ID = "sc-ftg-lead";
/** FTG_LEAD's authored cruise (its maxMatchSpeedMps), m/s. */
const FTG_LEAD_CRUISE_MPS = 11.5;
const LEVELS: ScenarioLevel[] = [1, 2, 3, 4, 5];
const CLEAN = "Чисто и спокойно каране";
/** The лепка's glued pose: centre gap ≤ followBehindM 9 + the runner's latch slack 4 m, in the student's lane. */
const GLUED_GAP_M = 13;
const TIMEOUT = 600_000;

interface Drive {
  out: LiveReplayOutcome;
  onsetSec: number | null;
  onsetKmh: number | null;
  /** The follower at the student's brake onset. */
  glued: boolean;
  gapAtOnsetM: number | null;
  /** ORACLE: the follower's own speed through the harsh-brake gates while still glued behind him. */
  followerHard: { t: number; meanDecelMps2: number; shedMps: number } | null;
  harsh: Array<{ t: number; charged: boolean }>;
  /** The front lead (FTG_LEAD): its lowest speed from 2 s before his pedal to 3 s after it, m/s — the span in
   *  which the engine's far-lead ledger could read a lead deceleration as a cause for his brake. */
  leadMinAroundPedalMps: number | null;
  /** The лепка began its pass (left its lane centre) this long after the pedal, s; null = not within 3 s. */
  passAfterPedalSec: number | null;
}

function drive(level: ScenarioLevel, tape: TailgaterTapeOptions): Drive {
  const tr = tailgaterTape(tape);
  const lesson = compileScenario(SC_FOLLOW_TAILGATER, level);
  const track = newHarshBrakeTrack();
  let ref: number | null = null;
  let glued = false;
  let gapAtOnsetM: number | null = null;
  let followerHard: Drive["followerHard"] = null;
  let stillGlued = true;
  let leadMinAroundPedalMps: number | null = null;
  let passAfterPedalSec: number | null = null;
  const out = liveChainReplay({
    lesson,
    districtRaw: LN,
    trace: tr,
    afterApply: ({ t, tick, traffic }) => {
      const lead = traffic.staged(LEAD_ID);
      if (
        lead &&
        tr.brakeOnsetSec !== null &&
        t >= tr.brakeOnsetSec - 2 &&
        t <= tr.brakeOnsetSec + 3
      )
        leadMinAroundPedalMps = Math.min(leadMinAroundPedalMps ?? Infinity, lead.speedMps);
      const a = traffic.staged(TAIL_ID);
      if (
        a &&
        tr.brakeOnsetSec !== null &&
        passAfterPedalSec === null &&
        t >= tr.brakeOnsetSec - 1e-9 &&
        t <= tr.brakeOnsetSec + 3 &&
        Math.abs(a.x - LANE_X) > 0.05
      )
        passAfterPedalSec = t - tr.brakeOnsetSec;
      if (!a || tr.brakeOnsetSec === null || t < tr.brakeOnsetSec - 1e-9)
        return;
      const gap = tick.position.y - a.y;
      const inLane =
        Math.abs(a.x - LANE_X) < 0.05 && gap > 0 && gap <= GLUED_GAP_M;
      if (ref === null) {
        ref = a.speedMps;
        glued = inLane;
        gapAtOnsetM = gap;
      }
      if (!inLane) stillGlued = false;
      if (!stillGlued || followerHard !== null || t > tr.brakeOnsetSec + 3)
        return;
      const v = stepHarshBrakeTrack(
        track,
        t,
        ref - a.speedMps,
        DEFAULT_RULE_CONFIG,
      );
      if (v !== null)
        followerHard = {
          t,
          meanDecelMps2: v.meanDecelMps2,
          shedMps: v.shedMps,
        };
    },
  });
  const harsh = [
    ...(out.result.coachedMistakes ?? [])
      .filter((c) => c.code === "HARSH_BRAKING_NO_CAUSE")
      .map((c) => ({ t: c.t, charged: false })),
    ...out.session.events
      .filter(
        (e) => e.kind === "violation" && e.code === "HARSH_BRAKING_NO_CAUSE",
      )
      .map((e) => ({ t: (e as { t: number }).t, charged: true })),
  ];
  return {
    out,
    onsetSec: tr.brakeOnsetSec,
    onsetKmh: tr.brakeOnsetKmh,
    glued,
    gapAtOnsetM,
    followerHard,
    harsh,
    leadMinAroundPedalMps,
    passAfterPedalSec,
  };
}

/** The verdict a student reads about the lesson's own mistake, without the times. */
function lessonMistakeForm(d: Drive) {
  return {
    lm: (d.out.result.lessonMistakes ?? []).map((m) => ({
      code: m.code,
      charged: m.charged,
    })),
    passed: d.out.result.passed,
    charged: d.harsh.map((h) => h.charged),
  };
}

// The judge's onsets (32.3 and 34.9 км/ч — the rig's «hold 33» and «hold 35.5»
// as the dial read them at the pedal), braked at four places along the glued
// stretch, the ease begun at y 120 so the hold is reached before the first.
const HOLDS = [32.3, 34.9] as const;
const BRAKE_YS = [165, 175, 185, 195] as const;

describe("sc-follow-tailgater · a brake check from the speed the lesson asks for (63c0c28c C1/C2a)", () => {
  const cells = LEVELS.flatMap((level) =>
    HOLDS.flatMap((hold) =>
      BRAKE_YS.map((by) => ({
        level,
        hold,
        by,
        d: drive(level, {
          holdKmh: hold,
          easeFromY: 120,
          brakeAtY: by,
          act: "slam",
        }),
      })),
    ),
  );
  // The same pedal from over the floor, on each rung: the form the lesson already gives its own mistake.
  const over = new Map(
    LEVELS.map((level) => [
      level,
      drive(level, {
        holdKmh: 45.9,
        easeFromY: 400,
        brakeAtY: 186,
        act: "slam",
      }),
    ]),
  );

  it(
    "the antecedent is the judge's act: under 35 км/ч at the pedal, a 9.5 m/s² stop, and on every rung at least one drive per speed where the лепка was glued behind him and had to brake hard",
    () => {
      for (const c of cells) {
        expect(c.d.onsetKmh!, `L${c.level} ${c.hold} y${c.by}`).toBeLessThan(
          35,
        );
        expect(c.d.onsetKmh!, `L${c.level} ${c.hold} y${c.by}`).toBeGreaterThan(
          32,
        );
      }
      for (const level of LEVELS) {
        for (const hold of HOLDS) {
          const forced = cells.filter(
            (c) =>
              c.level === level &&
              c.hold === hold &&
              c.d.glued &&
              c.d.followerHard !== null,
          );
          expect(forced.length, `L${level} hold ${hold}`).toBeGreaterThan(0);
          for (const c of forced) {
            expect(c.d.gapAtOnsetM!, `L${level} y${c.by}`).toBeLessThan(
              GLUED_GAP_M,
            );
            expect(c.d.followerHard!.meanDecelMps2).toBeGreaterThan(
              DEFAULT_RULE_CONFIG.harshBrakeDecelMps2,
            );
          }
        }
      }
      // …and over the floor the same pedal is the lesson's mistake on every rung (the form compared against).
      for (const [level, d] of over) {
        expect(d.onsetKmh!, `L${level}`).toBeGreaterThan(40);
        expect(d.harsh.length, `L${level}`).toBe(1);
        // L1–L3 and L5: coached and named as the lesson mistake (Ruling A / 16); L4 is the rung
        // that charges it (the authored demo reads the same there — see BASE_DEMO_SHEETS).
        const lm = lessonMistakeForm(d).lm;
        expect(lm, `L${level}`).toEqual(
          level === 4
            ? []
            : [{ code: "HARSH_BRAKING_NO_CAUSE", charged: false }],
        );
        expect(d.harsh[0].charged, `L${level}`).toBe(level === 4);
      }
    },
    TIMEOUT,
  );

  it(
    "where the лепка had to brake hard, the brake check is HARSH_BRAKING_NO_CAUSE — the lesson's own mistake, in the very form the over-the-floor brake check gets on that rung (Ruling A / 16)",
    () => {
      const wrong: string[] = [];
      for (const c of cells.filter(
        (x) => x.d.glued && x.d.followerHard !== null,
      )) {
        const label = `L${c.level} ${c.hold} км/ч y${c.by}`;
        const h = c.d.harsh;
        if (h.length !== 1) {
          wrong.push(`${label}: ${h.length} bills`);
          continue;
        }
        // At the stop: after the pedal, within the follower's own answer.
        expect(h[0].t, label).toBeGreaterThan(c.d.onsetSec!);
        expect(h[0].t, label).toBeLessThan(c.d.onsetSec! + 2);
        expect(lessonMistakeForm(c.d), label).toEqual(
          lessonMistakeForm(over.get(c.level)!),
        );
        expect(c.d.out.result.passed, label).toBe(false);
        // THEO-4: named and explained by the catalogue's own copy.
        expect(c.d.out.debrief, label).toContain("Рязко спиране без причина");
        if (
          /Грешк(ата|ите) на този урок/.test(over.get(c.level)!.out.debrief)
        ) {
          expect(c.d.out.debrief, label).toMatch(/Грешк(ата|ите) на този урок/);
        }
      }
      expect(wrong).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    "…and no «Чисто и спокойно каране» is awarded on such a drive",
    () => {
      for (const c of cells.filter(
        (x) => x.d.glued && x.d.followerHard !== null,
      )) {
        const label = `L${c.level} ${c.hold} км/ч y${c.by}`;
        expect(c.d.out.commendationCodes, label).not.toContain("CLEAN_DRIVING");
        expect(c.d.out.debrief, label).not.toContain(CLEAN);
      }
    },
    TIMEOUT,
  );

  it(
    "where the лепка did NOT have to brake hard (its pass was already under way), the same pedal under the floor is not billed — the conviction rests on what the other car had to do",
    () => {
      const unforced = cells.filter(
        (x) => !(x.d.glued && x.d.followerHard !== null),
      );
      // The pass begins inside the stretch on some rungs (the runner's seeded pressureSec).
      expect(unforced.length).toBeGreaterThan(0);
      for (const c of unforced) {
        expect(c.d.harsh, `L${c.level} ${c.hold} y${c.by}`).toEqual([]);
      }
    },
    TIMEOUT,
  );

  it(
    "the lesson's own task — a gentle ease-off to under 36 — is never billed, and the лепка never has to brake hard for it",
    () => {
      for (const level of LEVELS) {
        for (const [mps2, to] of [
          [1, 28],
          [2, 30],
          [3, 25],
        ] as const) {
          const d = drive(level, {
            holdKmh: 45.9,
            easeFromY: 400,
            brakeAtY: 170,
            act: "gentle",
            gentleMps2: mps2,
            gentleToKmh: to,
          });
          const label = `L${level} ease ${mps2} m/s² to ${to}`;
          expect(d.glued, label).toBe(true);
          expect(d.followerHard, label).toBeNull();
          expect(d.harsh, label).toEqual([]);
          expect(d.out.result.lessonMistakes ?? [], label).toEqual([]);
        }
      }
    },
    TIMEOUT,
  );
});

/**
 * ROUND 2 — THE SPEEDS THE LESSON ASKS FOR, ALL THE WAY DOWN (the round-1
 * verifier's F1, refuted at c38086a + round 1). A student who obeys task 1
 * («Успокой темпото», under 36 км/ч) at 20–25 км/ч and then brake-checks the
 * лепка glued 8.7–9.4 m behind him escaped on every rung: the front lead
 * (`FTG_LEAD`, matchPlayer at followGapM 150) had drifted to ~142–150 m and
 * started MIRRORING him, so his own brake check made it slow 9.0 → 1.9 m/s and
 * the engine's far-lead ledger booked that as a forward cause
 * (`leadMemory.farBrakingAt` → `harshBrake.causeSeen`): the brake check was
 * acquitted by a cause it had itself created. FTG_LEAD now holds the constant
 * 11.5 m/s cruise its own doc, instruction 4 and the `sc-ftg-ease` note state
 * (`minMatchSpeedMps` = its `maxMatchSpeedMps`), so there is no such cause.
 * The cells are the verifier's escapes: the open-loop tape cruising AT the
 * hold (no ease before it), braked where the лепка is glued.
 */
describe("sc-follow-tailgater · round 2: a brake check from 20–25 км/ч, and the front lead that must not answer it", () => {
  const LOW: Array<{ hold: number; ys: number[] }> = [
    { hold: 20, ys: [75, 80, 85, 90] },
    { hold: 22, ys: [85, 90, 95, 100] },
    { hold: 25, ys: [105, 110] },
  ];
  const cells = LEVELS.flatMap((level) =>
    LOW.flatMap(({ hold, ys }) =>
      ys.map((by) => ({
        level,
        hold,
        by,
        d: drive(level, {
          cruiseKmh: hold,
          holdKmh: hold,
          easeFromY: 2000,
          brakeAtY: by,
          act: "slam",
        }),
      })),
    ),
  );
  const over = new Map(
    LEVELS.map((level) => [
      level,
      drive(level, {
        holdKmh: 45.9,
        easeFromY: 400,
        brakeAtY: 186,
        act: "slam",
      }),
    ]),
  );
  const forced = cells.filter((c) => c.d.glued && c.d.followerHard !== null);

  it(
    "the antecedent: on every rung, at each of 20 / 22 / 25 км/ч, drives where the лепка was glued 8–10 m behind in his lane and itself had to brake hard",
    () => {
      for (const level of LEVELS) {
        for (const { hold } of LOW) {
          const f = forced.filter((c) => c.level === level && c.hold === hold);
          expect(f.length, `L${level} ${hold} км/ч`).toBeGreaterThan(0);
          for (const c of f) {
            expect(c.d.onsetKmh!).toBeCloseTo(hold, 0);
            expect(c.d.gapAtOnsetM!).toBeGreaterThan(8);
            expect(c.d.gapAtOnsetM!).toBeLessThan(10);
            expect(c.d.followerHard!.meanDecelMps2).toBeGreaterThan(
              DEFAULT_RULE_CONFIG.harshBrakeDecelMps2,
            );
          }
        }
      }
      // Most of the 50-cell grid (10 per rung), the verifier's escapes among them.
      expect(forced.length).toBeGreaterThanOrEqual(40);
    },
    TIMEOUT,
  );

  it(
    "the front lead holds its 11.5 m/s cruise from 2 s before his pedal to 3 s after it on every one of these drives — it never slows because he did, so it is never a cause he made",
    () => {
      for (const c of cells) {
        const label = `L${c.level} ${c.hold} км/ч y${c.by}`;
        expect(c.d.leadMinAroundPedalMps, label).not.toBeNull();
        expect(c.d.leadMinAroundPedalMps!, label).toBeGreaterThanOrEqual(
          FTG_LEAD_CRUISE_MPS - 1e-6,
        );
      }
    },
    TIMEOUT,
  );

  it(
    "every such brake check is HARSH_BRAKING_NO_CAUSE once, in the form the over-the-floor brake check gets on that rung (Ruling A / 16), named and explained",
    () => {
      const wrong: string[] = [];
      for (const c of forced) {
        const label = `L${c.level} ${c.hold} км/ч y${c.by}`;
        if (c.d.harsh.length !== 1) {
          wrong.push(`${label}: ${c.d.harsh.length} bills`);
          continue;
        }
        expect(c.d.harsh[0].t, label).toBeGreaterThan(c.d.onsetSec!);
        expect(c.d.harsh[0].t, label).toBeLessThan(c.d.onsetSec! + 2);
        expect(lessonMistakeForm(c.d), label).toEqual(
          lessonMistakeForm(over.get(c.level)!),
        );
        expect(c.d.out.result.passed, label).toBe(false);
        expect(c.d.out.debrief, label).toContain("Рязко спиране без причина");
      }
      expect(wrong).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    "…and the debrief never calls such a drive clean: «Чисто и спокойно каране» appears, if at all, only in its scoped form (the metres after the bill, «само на отделни отсечки»)",
    () => {
      for (const c of forced) {
        const label = `L${c.level} ${c.hold} км/ч y${c.by}`;
        const parts = c.d.out.debrief.split(CLEAN).slice(1);
        for (const rest of parts)
          expect(rest.startsWith(" — но само на отделни отсечки"), label).toBe(
            true,
          );
      }
    },
    TIMEOUT,
  );
});

/**
 * INTEGRATOR DECISION (round 2, binding — the verifier's F2): a brake check
 * while the лепка's own pass is ALREADY under way — it is pulling out, not
 * braking — stays unbilled. The conviction rests on what the other car
 * actually had to do (the tailbrake principle the founder was told on
 * 2026-10-08). These are the verifier's cells: glued in his lane at the pedal,
 * its pass commanded inside the next half-second, and its own speed never
 * through the harsh gates while still behind him.
 */
describe("sc-follow-tailgater · round 2: a brake check as the лепка is already pulling out stays unbilled", () => {
  const F2: Array<[ScenarioLevel, number, number]> = [
    [1, 28, 130],
    [3, 28, 140],
    [4, 28, 140],
    [4, 30, 150],
    [5, 25, 120],
    [5, 30, 140],
  ];
  it(
    "its pass begins within 0.5 s of the pedal, it never has to brake hard behind him, and nothing is billed",
    () => {
      for (const [level, hold, by] of F2) {
        const label = `L${level} ${hold} км/ч y${by}`;
        const d = drive(level, {
          cruiseKmh: hold,
          holdKmh: hold,
          easeFromY: 2000,
          brakeAtY: by,
          act: "slam",
        });
        expect(d.onsetKmh!, label).toBeLessThan(
          DEFAULT_RULE_CONFIG.harshBrakeMinSpeedKmh,
        );
        expect(d.glued, label).toBe(true);
        expect(d.passAfterPedalSec, label).not.toBeNull();
        expect(d.passAfterPedalSec!, label).toBeLessThan(0.5);
        expect(d.followerHard, label).toBeNull();
        expect(d.harsh, label).toEqual([]);
      }
    },
    TIMEOUT,
  );
});

describe("sc-follow-tailgater · the as-authored demos keep their sheets", () => {
  const DEMOS = [
    "shadow-correct",
    "mistake-brake-check",
    "mistake-speed-up",
  ] as const;
  const sheet = (o: LiveReplayOutcome) => ({
    violations: o.violationCodes,
    coached: (o.result.coachedMistakes ?? []).map((c) => c.code),
    lm: (o.result.lessonMistakes ?? []).map((m) => `${m.code}:${m.charged}`),
    praise: o.commendationCodes,
    passed: o.result.passed,
  });
  it(
    "every demo × rung grades exactly as on base c38086a (pinned below, measured through this same chain before the repair)",
    () => {
      const got: Record<string, ReturnType<typeof sheet>> = {};
      for (const demo of DEMOS) {
        const trace = parseScenarioTrace(
          JSON.parse(
            readFileSync(
              path.join(
                REPO_ROOT,
                "content",
                "traces",
                "sc-follow-tailgater",
                `${demo}.trace.json`,
              ),
              "utf-8",
            ),
          ),
        )!;
        for (const level of LEVELS) {
          got[`${demo}/L${level}`] = sheet(
            liveChainReplay({
              lesson: compileScenario(SC_FOLLOW_TAILGATER, level),
              districtRaw: LN,
              trace,
            }),
          );
        }
      }
      if (process.env.PRINT_DEMO_SHEETS === "1")
        console.log(JSON.stringify(got));
      expect(got).toEqual(BASE_DEMO_SHEETS);
    },
    TIMEOUT,
  );
});

const BASE_DEMO_SHEETS: Record<string, unknown> = {
  "shadow-correct/L1": {
    violations: [],
    coached: [],
    lm: [],
    praise: ["CLEAN_DRIVING"],
    passed: true,
  },
  "shadow-correct/L2": {
    violations: [],
    coached: [],
    lm: [],
    praise: ["CLEAN_DRIVING"],
    passed: true,
  },
  "shadow-correct/L3": {
    violations: [],
    coached: [],
    lm: [],
    praise: ["CLEAN_DRIVING"],
    passed: true,
  },
  "shadow-correct/L4": {
    violations: [],
    coached: [],
    lm: [],
    praise: ["CLEAN_DRIVING"],
    passed: true,
  },
  "shadow-correct/L5": {
    violations: [],
    coached: [],
    lm: [],
    praise: ["CLEAN_DRIVING"],
    passed: true,
  },
  "mistake-brake-check/L1": {
    violations: [],
    coached: ["HARSH_BRAKING_NO_CAUSE"],
    lm: ["HARSH_BRAKING_NO_CAUSE:false"],
    praise: [],
    passed: false,
  },
  "mistake-brake-check/L2": {
    violations: [],
    coached: ["HARSH_BRAKING_NO_CAUSE"],
    lm: ["HARSH_BRAKING_NO_CAUSE:false"],
    praise: [],
    passed: false,
  },
  "mistake-brake-check/L3": {
    violations: [],
    coached: ["HARSH_BRAKING_NO_CAUSE"],
    lm: ["HARSH_BRAKING_NO_CAUSE:false"],
    praise: [],
    passed: false,
  },
  "mistake-brake-check/L4": {
    violations: ["HARSH_BRAKING_NO_CAUSE"],
    coached: [],
    lm: [],
    praise: [],
    passed: false,
  },
  "mistake-brake-check/L5": {
    violations: [],
    coached: ["HARSH_BRAKING_NO_CAUSE"],
    lm: ["HARSH_BRAKING_NO_CAUSE:false"],
    praise: [],
    passed: false,
  },
  "mistake-speed-up/L1": {
    violations: [],
    coached: ["SPEEDING_OVER_LIMIT", "TASK_SPEED_CAP_EXCEEDED"],
    lm: ["SPEEDING_OVER_LIMIT:false"],
    praise: [],
    passed: false,
  },
  "mistake-speed-up/L2": {
    violations: [],
    coached: ["SPEEDING_OVER_LIMIT", "TASK_SPEED_CAP_EXCEEDED"],
    lm: ["SPEEDING_OVER_LIMIT:false"],
    praise: [],
    passed: false,
  },
  "mistake-speed-up/L3": {
    violations: [],
    coached: ["SPEEDING_OVER_LIMIT", "TASK_SPEED_CAP_EXCEEDED"],
    lm: ["SPEEDING_OVER_LIMIT:false"],
    praise: [],
    passed: false,
  },
  "mistake-speed-up/L4": {
    violations: ["SPEEDING_OVER_LIMIT"],
    coached: [],
    lm: [],
    praise: [],
    passed: false,
  },
  "mistake-speed-up/L5": {
    violations: [],
    coached: ["SPEEDING_OVER_LIMIT", "TASK_SPEED_CAP_EXCEEDED"],
    lm: ["SPEEDING_OVER_LIMIT:false"],
    praise: [],
    passed: false,
  },
};
