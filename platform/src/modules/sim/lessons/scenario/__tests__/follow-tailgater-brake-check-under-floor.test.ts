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
 * ROUNDS 2–4 (lane tailbrake3, integrator decisions 2026-10-11/12) — THE PASS DOES NOT
 * BEGIN IN THE MIDDLE OF THE ЛЕПКА'S OWN HARD BRAKE. Its pass was a pure timer
 * (`pressureSec` after the latch). When the timer came due a fraction of a
 * second after his pedal, the car — glued behind him and braking at about
 * 10 m/s² — was handed to its cruise law, accelerated toward him at 3.5 m/s²
 * and never held the harsh line for the 0.4 s sustain: no report, and the
 * floor acquitted the brake check (the rig's TTF25 drive, «ИЗДЪРЖАН» ★★★). The
 * pass now waits while the car is still in a hard brake it has not been
 * reported for: from its first reading at the harsh line until the product's
 * own harsh step reports that brake, or the brake is over (its reading has
 * stayed under 2 m/s² for the product's own 0.4 s sustain) — a later reading
 * under the harsh line does not end it, nor does that step's re-anchor, nor
 * one reading under the braking line
 * (`RearTailgaterRunner.ownHardBrakeHoldsThePass`; the uneven emergency stops
 * that distinguish this from «while its reading is at the line» (round 2),
 * from «while the step's window is open» (round 3) and from «until its first
 * reading under the braking line» (round 4) are pinned in
 * follow-tailgater-uneven-brake-check.test.ts). What stays unbilled is what
 * integrator decision F2 was written for: a pedal when the car is ALREADY
 * PULLING OUT, or has not braked hard at all when its pass comes due. The last
 * `describe` names the six F2 cells and what each does now.
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
  /** The лепка began its pass (the first grid point it is off its lane line — the published
   *  `lateralOffsetM`) this long after the pedal, s; null = not within 3 s of it (a pass that had
   *  begun BEFORE the pedal reads 0 — and `glued` false). */
  passAfterPedalSec: number | null;
  /** When the product's own account reported the лепка's hard brake (`followerBraked`), s. */
  reportsAt: number[];
  /** The лепка's deceleration over its last grid step still glued behind him, m/s² (null: never glued after the pedal). */
  lastGluedDecelMps2: number | null;
}

/** The oracle's reading window is warm at his pedal: the лепка's speed is stepped from this long before it, s
 *  (the product's own account has read it since it glued; a track begun cold AT the pedal reads its first
 *  frames over a shorter span and can call the same brake a grid step late). */
const ORACLE_LEAD_SEC = 1;

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
  let seenPedal = false;
  let prevTail: { t: number; v: number } | null = null;
  let lastGluedDecelMps2: number | null = null;
  const reportsAt: number[] = [];
  const out = liveChainReplay({
    lesson,
    districtRaw: LN,
    trace: tr,
    afterApply: ({ t, tick, traffic }) => {
      for (const e of tick.events) if (e.kind === "followerBraked") reportsAt.push(t);
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
        Math.abs(a.lateralOffsetM ?? 0) > 1e-6
      )
        passAfterPedalSec = t - tr.brakeOnsetSec;
      if (
        !a ||
        tr.brakeOnsetSec === null ||
        t < tr.brakeOnsetSec - ORACLE_LEAD_SEC
      )
        return;
      const decel =
        prevTail === null ? 0 : (prevTail.v - a.speedMps) / (t - prevTail.t);
      prevTail = { t, v: a.speedMps };
      const atPedal = t >= tr.brakeOnsetSec - 1e-9;
      const gap = tick.position.y - a.y;
      const inLane =
        Math.abs(a.x - LANE_X) < 0.05 && gap > 0 && gap <= GLUED_GAP_M;
      if (ref === null) ref = a.speedMps;
      if (atPedal && !seenPedal) {
        seenPedal = true;
        glued = inLane;
        gapAtOnsetM = gap;
      }
      if (atPedal && !inLane) stillGlued = false;
      if (!stillGlued || followerHard !== null || t > tr.brakeOnsetSec + 3)
        return;
      const v = stepHarshBrakeTrack(
        track,
        t,
        ref - a.speedMps,
        DEFAULT_RULE_CONFIG,
      );
      if (!atPedal) return;
      lastGluedDecelMps2 = decel;
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
    reportsAt,
    lastGluedDecelMps2,
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
    "where the лепка did NOT have to brake hard, its pass was ALREADY UNDER WAY at his pedal — it had left his lane line — and the same pedal under the floor is not billed; every drive that found it glued behind him is billed (round 3)",
    () => {
      const unforced = cells.filter(
        (x) => !(x.d.glued && x.d.followerHard !== null),
      );
      // The pass begins inside the stretch on some rungs (the runner's seeded pressureSec).
      expect(unforced.length).toBeGreaterThan(0);
      for (const c of unforced) {
        const label = `L${c.level} ${c.hold} y${c.by}`;
        // «Already pulling out»: off his lane line on the grid point of the pedal — never «glued, but its
        // brake was cut short», which is what three of these cells were on base (below).
        expect(c.d.glued, label).toBe(false);
        expect(c.d.reportsAt, label).toEqual([]);
        expect(c.d.harsh, label).toEqual([]);
      }
      // …and the product's own account agrees with the oracle on every cell of the grid.
      for (const c of cells)
        expect(
          c.d.reportsAt.length > 0,
          `L${c.level} ${c.hold} y${c.by}`,
        ).toBe(c.d.glued && c.d.followerHard !== null);
      // ROUND 3. On base 2e9268f three more cells of this grid were acquitted, and none of them was
      // «already pulling out»: the лепка was glued behind him at the pedal and braking at 10 m/s² when
      // its pass TIMER came due 0.13 / 0.27 / 0.33 s later, which handed it to the cruise law short of
      // the 0.4 s sustain («ИЗДЪРЖАН» with «Чисто и спокойно каране» on all three). Its pass now
      // waits for its own hard brake, so it holds the line for the sustain, reports, and the brake
      // check is the lesson's own mistake.
      for (const [level, hold, by] of [
        [1, 32.3, 175],
        [1, 34.9, 175],
        [2, 32.3, 185],
      ] as const) {
        const c = cells.find(
          (x) => x.level === level && x.hold === hold && x.by === by,
        )!;
        const label = `L${level} ${hold} y${by}`;
        expect(c.d.glued, label).toBe(true);
        expect(c.d.passAfterPedalSec!, label).toBeGreaterThanOrEqual(
          DEFAULT_RULE_CONFIG.harshBrakeSustainSec,
        );
        expect(c.d.followerHard, label).not.toBeNull();
        expect(c.d.reportsAt, label).toHaveLength(1);
        expect(c.d.harsh.map((h) => h.charged), label).toEqual([false]);
        expect(c.d.out.result.passed, label).toBe(false);
        expect(c.d.out.commendationCodes, label).not.toContain("CLEAN_DRIVING");
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
 * THE SIX F2 CELLS, BY NAME (integrator decision E2 of 2026-10-11, which
 * re-reads the 2026-10-09 decision F2 on what was measured; the rule as
 * restated on 2026-10-12).
 *
 * WHAT F2 SAID (round 2, 2026-10-09): a brake check while the лепка's own pass
 * is ALREADY under way — «it is pulling out, not braking» — stays unbilled; the
 * conviction rests on what the other car actually had to do. Six cells were
 * pinned as that class: glued in his lane at the pedal, the pass inside the
 * next half-second, the car's speed never through the harsh gates behind him.
 *
 * WHAT WAS MEASURED (lane tailbrake3, 2e9268f). In five of the six the лепка
 * was NOT pulling out: it was braking at about 10 m/s² for him when its pass
 * TIMER (`pressureSec` after the latch — a pure timer) came due 0.13–0.25 s
 * after his pedal. The timer handed it to the cruise law mid-brake; it
 * accelerated at 3.5 m/s² toward a car stopping 4.3–5.1 m ahead, and its hard
 * brake — 0.12–0.22 s at the harsh line — was cut short of the 0.4 s sustain.
 * «Never through the harsh gates» was the timer's doing, not the car's. The
 * rig's TTF25 drive (24.5 км/ч, «ИЗДЪРЖАН» ★★★) is the same drive as the cell
 * L5 25 км/ч y120 to within two grid steps.
 *
 * THE RULE NOW. A due pass waits from the car's first reading at the harsh
 * line until the product's own harsh step reports that brake, or the brake is
 * over (its reading under the braking line for the sustain). So (these six
 * are steady full pedals: the car's reading stays at the line from its first
 * such grid point to the report, and the numbers below are the same under the
 * narrower rules rounds 2, 3 and 4 built):
 *
 *   cell            base 2e9268f                      now
 *   L1 28 y130      pass +0.136 s, 0.117 s at line    pass +0.42 s, reported → coached (the lesson's mistake)
 *   L3 28 y140      pass +0.134 s, 0.117 s            pass +0.42 s, reported → coached
 *   L4 28 y140      pass +0.217 s, 0.200 s            pass +0.42 s, reported → CHARGED (the rung that charges)
 *   L5 25 y120      pass +0.249 s, 0.217 s            pass +0.43 s, reported → coached
 *   L5 30 y140      pass +0.163 s, 0.133 s            pass +0.43 s, reported → coached
 *   L4 30 y150      pass +0.030 s, not braking hard   UNCHANGED — pass +0.030 s, no report, unbilled
 *
 * L4 30 км/ч y150 is what F2 protects, and it stays: the timer came due two
 * grid points after his pedal, before the matchPlayer law had braked the car
 * hard at all (its last reading behind him 2.4 m/s²). It pulls out on time and
 * its later speed is its pass's, not his. (The other F2 form — a pass that
 * began BEFORE the pedal — is the rig's tasks-first drive, pinned in
 * follow-tailgater-rig-w3b-ttf25.test.ts, and the fourteen such cells of the
 * first grid above.)
 */
describe("sc-follow-tailgater · the six F2 cells — the pass does not begin in the middle of the лепка's own hard brake", () => {
  const SUSTAIN = DEFAULT_RULE_CONFIG.harshBrakeSustainSec;
  const HARSH = DEFAULT_RULE_CONFIG.harshBrakeDecelMps2;
  const F2: Array<{
    level: ScenarioLevel;
    hold: number;
    by: number;
    /** When its pass began after his pedal on base 2e9268f, s (measured there; stated, not re-run). */
    basePassSec: number;
    now: "billed" | "unbilled";
  }> = [
    { level: 1, hold: 28, by: 130, basePassSec: 0.136, now: "billed" },
    { level: 3, hold: 28, by: 140, basePassSec: 0.134, now: "billed" },
    { level: 4, hold: 28, by: 140, basePassSec: 0.217, now: "billed" },
    { level: 4, hold: 30, by: 150, basePassSec: 0.03, now: "unbilled" },
    { level: 5, hold: 25, by: 120, basePassSec: 0.249, now: "billed" },
    { level: 5, hold: 30, by: 140, basePassSec: 0.163, now: "billed" },
  ];
  const cells = F2.map((c) => ({
    ...c,
    label: `L${c.level} ${c.hold} км/ч y${c.by}`,
    d: drive(c.level, {
      cruiseKmh: c.hold,
      holdKmh: c.hold,
      easeFromY: 2000,
      brakeAtY: c.by,
      act: "slam",
    }),
  }));
  const over = new Map(
    [1, 3, 4, 5].map((level) => [
      level,
      drive(level as ScenarioLevel, {
        holdKmh: 45.9,
        easeFromY: 400,
        brakeAtY: 186,
        act: "slam",
      }),
    ]),
  );

  it(
    "the antecedent is F2's on all six: a full pedal under the 35 км/ч floor with the лепка glued in his lane, and its pass due within a quarter-second",
    () => {
      for (const c of cells) {
        expect(c.d.onsetKmh!, c.label).toBeLessThan(
          DEFAULT_RULE_CONFIG.harshBrakeMinSpeedKmh,
        );
        expect(c.d.glued, c.label).toBe(true);
        expect(c.basePassSec, c.label).toBeLessThan(0.25);
      }
    },
    TIMEOUT,
  );

  it(
    "L1 28 y130, L3 28 y140, L4 28 y140, L5 25 y120, L5 30 y140 — braking hard when the timer came due: the pass waits out the sustain, the лепка reports its hard brake, and the brake check is the lesson's own mistake in its rung's over-the-floor form",
    () => {
      const billed = cells.filter((c) => c.now === "billed");
      expect(billed.map((c) => c.label)).toEqual([
        "L1 28 км/ч y130",
        "L3 28 км/ч y140",
        "L4 28 км/ч y140",
        "L5 25 км/ч y120",
        "L5 30 км/ч y140",
      ]);
      for (const c of billed) {
        // The pass: no longer 0.13–0.25 s after the pedal, but after the sustain — and not long after.
        expect(c.d.passAfterPedalSec, c.label).not.toBeNull();
        expect(c.d.passAfterPedalSec!, c.label).toBeGreaterThan(
          c.basePassSec + 0.15,
        );
        expect(c.d.passAfterPedalSec!, c.label).toBeGreaterThanOrEqual(SUSTAIN);
        expect(c.d.passAfterPedalSec!, c.label).toBeLessThan(SUSTAIN + 0.05);
        // What the car had to do, by the oracle and by the product's own account — once, before its pass.
        expect(c.d.followerHard, c.label).not.toBeNull();
        expect(c.d.followerHard!.meanDecelMps2, c.label).toBeGreaterThan(HARSH);
        expect(c.d.followerHard!.shedMps, c.label).toBeGreaterThanOrEqual(
          HARSH * SUSTAIN,
        );
        expect(c.d.reportsAt, c.label).toHaveLength(1);
        expect(c.d.reportsAt[0]!, c.label).toBeLessThanOrEqual(
          c.d.onsetSec! + c.d.passAfterPedalSec!,
        );
        // The bill: one, at the stop, in the form the over-the-floor brake check gets on that rung
        // (coached and named as the lesson's mistake on L1/L3/L5, charged on L4 — Ruling A / 16).
        expect(c.d.harsh, c.label).toHaveLength(1);
        expect(c.d.harsh[0].t, c.label).toBeGreaterThan(c.d.onsetSec!);
        expect(c.d.harsh[0].t, c.label).toBeLessThan(c.d.onsetSec! + 2);
        expect(c.d.harsh[0].charged, c.label).toBe(c.level === 4);
        expect(lessonMistakeForm(c.d), c.label).toEqual(
          lessonMistakeForm(over.get(c.level)!),
        );
        expect(c.d.out.result.passed, c.label).toBe(false);
        // THEO-4: named and explained by the catalogue's own copy; never called clean.
        expect(c.d.out.debrief, c.label).toContain("Рязко спиране без причина");
        expect(c.d.out.commendationCodes, c.label).not.toContain("CLEAN_DRIVING");
        for (const rest of c.d.out.debrief.split(CLEAN).slice(1))
          expect(
            rest.startsWith(" — но само на отделни отсечки"),
            c.label,
          ).toBe(true);
      }
    },
    TIMEOUT,
  );

  it(
    "the WIDER C1 cells ADR-016 decided but never pinned (L3 25 y125, L4 32 y155, L2 20 y170 — the pass 0.40–0.41 s after the pedal, the лепка one grid step short of the sustain when the timer cut it): each is now billed",
    () => {
      // Base 2e9268f, measured: L3 25 y125 pass +0.412 s, 0.383 s at the line, 3.78 m/s shed behind him;
      // L4 32 y155 pass +0.403 s, 0.383 s, 3.75 m/s; L2 20 y170 (the drive eased from y 100 to its
      // hold) pass +0.406 s, 0.383 s, 3.69 m/s — ADR-016's own three numbers. A car that has braked at
      // 10 m/s² for 0.38 s and shed over half its speed was «not forced» only because the timer took it
      // one grid step before the product's line; L2 20 y170 was «ИЗДЪРЖАН» with the unscoped «Чисто и
      // спокойно каране».
      const WIDE: Array<[ScenarioLevel, number, number, TailgaterTapeOptions]> = [
        [3, 25, 125, { cruiseKmh: 25, holdKmh: 25, easeFromY: 2000, brakeAtY: 125, act: "slam" }],
        [4, 32, 155, { cruiseKmh: 32, holdKmh: 32, easeFromY: 2000, brakeAtY: 155, act: "slam" }],
        [2, 20, 170, { holdKmh: 20, easeFromY: 100, brakeAtY: 170, act: "slam" }],
      ];
      for (const [level, hold, by, tape] of WIDE) {
        const label = `L${level} ${hold} км/ч y${by}`;
        const d = drive(level, tape);
        expect(d.onsetKmh!, label).toBeLessThan(
          DEFAULT_RULE_CONFIG.harshBrakeMinSpeedKmh,
        );
        expect(d.glued, label).toBe(true);
        expect(d.passAfterPedalSec!, label).toBeGreaterThanOrEqual(SUSTAIN);
        expect(d.passAfterPedalSec!, label).toBeLessThan(SUSTAIN + 0.05);
        expect(d.followerHard, label).not.toBeNull();
        expect(d.followerHard!.shedMps, label).toBeGreaterThanOrEqual(
          HARSH * SUSTAIN,
        );
        expect(d.reportsAt, label).toHaveLength(1);
        expect(d.harsh, label).toHaveLength(1);
        expect(d.harsh[0].charged, label).toBe(level === 4);
        expect(d.out.result.passed, label).toBe(false);
        expect(d.out.commendationCodes, label).not.toContain("CLEAN_DRIVING");
        expect(d.out.debrief, label).toContain("Рязко спиране без причина");
      }
    },
    TIMEOUT,
  );

  it(
    "L4 30 км/ч y150 — what F2 protects: its pass came due two grid points after his pedal, before it had braked hard at all; it pulls out on time, is never reported, and nothing is billed",
    () => {
      const c = cells.find((x) => x.now === "unbilled")!;
      expect(c.label).toBe("L4 30 км/ч y150");
      // On time: where base began it (the timer), to the grid point.
      expect(c.d.passAfterPedalSec!, c.label).toBeGreaterThan(0);
      expect(c.d.passAfterPedalSec!, c.label).toBeLessThan(3 / 60);
      expect(Math.abs(c.d.passAfterPedalSec! - c.basePassSec), c.label).toBeLessThan(
        0.5 / 60,
      );
      // Not braking hard on its last grid point behind him: nothing of its own to wait for.
      expect(c.d.lastGluedDecelMps2, c.label).not.toBeNull();
      expect(c.d.lastGluedDecelMps2!, c.label).toBeLessThan(HARSH);
      expect(c.d.followerHard, c.label).toBeNull();
      expect(c.d.reportsAt, c.label).toEqual([]);
      expect(c.d.harsh, c.label).toEqual([]);
      expect(c.d.out.result.lessonMistakes ?? [], c.label).toEqual([]);
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
