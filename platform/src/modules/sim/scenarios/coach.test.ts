import { describe, expect, it } from "vitest";
import { COLLISION_CONTACT_COPY, VIOLATIONS, actCopy } from "../rules";
import { recordEncounter } from "./policy";
import type { ViolationSeverity } from "./policy";
import { coachStep, type CoachDecision, type CoachInput } from "./coach";
import { repeatFamilyForCode, scenarioForCode } from "./mapping";

/**
 * THE SESSION FOLD, WHICH LIVES HERE BECAUSE ONLY THIS FILE EVER WANTED IT.
 *
 * It was `coachSession` in `coach.ts`, exported through `scenarios/index.ts`,
 * with zero non-test callers for its whole life. The production fold is
 * `lessons/engine.ts:713` and it cannot be this one — it does real work between
 * the steps (explanation text, HUD event, pause decision, scoring), which a
 * fold returning only decisions has nowhere to carry.
 *
 * Kept byte-for-byte so every case below still reads the same, and kept in TEST
 * SCOPE so nobody greps it years from now and takes it for a shipped API.
 */
function coachSession(violations: readonly CoachInput[]): CoachDecision[] {
  let encounters: Record<string, number> = {};
  const out: CoachDecision[] = [];
  for (const v of violations) {
    const r = coachStep(encounters, v);
    encounters = r.encounters;
    out.push(r.decision);
  }
  return out;
}

/** One coach input at the code's OWN catalogue severity — no invented numbers. */
function asDriven(code: string, detail?: string): CoachInput {
  const spec = VIOLATIONS[code as keyof typeof VIOLATIONS];
  const v: CoachInput = { code, severityClass: spec.severityClass as ViolationSeverity };
  if (spec.terminateSession === true) v.terminateSession = true;
  if (detail !== undefined) v.detail = detail;
  return v;
}

/** Every mapped code, grouped by the scenario event that teaches it. */
function codesByScenario(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const code of Object.keys(VIOLATIONS)) {
    const ev = scenarioForCode(code);
    if (ev === null) continue;
    const list = out.get(ev);
    if (list) list.push(code);
    else out.set(ev, [code]);
  }
  return out;
}

describe("catalog → scenario mapping", () => {
  it("maps driving codes to scenario events", () => {
    expect(scenarioForCode("SPEEDING_OVER_LIMIT")).toBe("ev-speed-limit");
    expect(scenarioForCode("RED_LIGHT_CROSSED")).toBe("ev-junction-signalized");
    expect(scenarioForCode("POOR_LANE_KEEPING")).toBe("ev-lane-discipline");
    expect(scenarioForCode("PREDRIVE_STEP_SKIPPED")).toBeNull();
  });

  it("the lesson map is many-to-one — which is why it cannot answer „is this a repeat“", () => {
    // The premise of the whole split, asserted rather than assumed: if this
    // ever became one-to-one, `CODE_TO_REPEAT_FAMILY` would be dead weight and
    // somebody should be told. Measured 2026-08-19: 8 events carry more than
    // one code, and 25 of the 37 mapped codes live in one of them.
    const buckets = codesByScenario();
    const shared = [...buckets.values()].filter((codes) => codes.length > 1);
    expect(shared.length).toBeGreaterThanOrEqual(8);
    expect(shared.flat().length).toBeGreaterThanOrEqual(25);
  });

  it("a repeat family never spans two lessons", () => {
    // The invariant that keeps the two tables honest in the other direction:
    // pooling says „this is the same fault", and the same fault cannot be
    // taught by two different mini-lessons. A family row added across
    // scenarios would silently make one lesson's fault a repeat of another's.
    const byFamily = new Map<string, Set<string | null>>();
    for (const code of Object.keys(VIOLATIONS)) {
      const fam = repeatFamilyForCode(code);
      const set = byFamily.get(fam) ?? new Set<string | null>();
      set.add(scenarioForCode(code));
      byFamily.set(fam, set);
    }
    for (const [fam, scenarios] of byFamily) {
      expect(scenarios.size, `family ${fam} spans ${[...scenarios].join(" + ")}`).toBe(1);
    }
  });

  it("every code has a family, and it is the code itself unless declared otherwise", () => {
    expect(repeatFamilyForCode("PEDESTRIAN_NOT_YIELDED")).toBe("PEDESTRIAN_NOT_YIELDED");
    expect(repeatFamilyForCode("HANDBRAKE_LEFT_ON")).toBe("HANDBRAKE_LEFT_ON");
    expect(repeatFamilyForCode("SPEEDING_OVER_LIMIT")).toBe(repeatFamilyForCode("SPEEDING_DANGEROUS"));
    expect(repeatFamilyForCode("FOLLOWING_TOO_CLOSE")).toBe(
      repeatFamilyForCode("FOLLOWING_TOO_CLOSE_FOR_RAIN"),
    );
  });
});

describe("teach-first-then-grade coach", () => {
  it("teaches a first minor mistake, then grades repeats", () => {
    const seq = coachSession([
      { code: "SPEEDING_OVER_LIMIT", severityClass: "vtorostepenna" },
      { code: "SPEEDING_OVER_LIMIT", severityClass: "vtorostepenna" },
      { code: "SPEEDING_OVER_LIMIT", severityClass: "vtorostepenna" },
    ]);
    expect(seq[0]).toMatchObject({ mode: "teach", scored: false, showLesson: true });
    expect(seq[1]).toMatchObject({ mode: "grade", scored: true });
    expect(seq[2]).toMatchObject({ mode: "grade", scored: true });
  });

  it("keys encounters by fault family, so both speeding codes share a counter", () => {
    // First minor speeding teaches; a later dangerous speeding still grades
    // (safety floor) and is the SAME fault one bar higher — mapping.ts
    // `CODE_TO_REPEAT_FAMILY`, not the ev-speed-limit lesson they share.
    const seq = coachSession([
      { code: "SPEEDING_OVER_LIMIT", severityClass: "vtorostepenna" },
      { code: "SPEEDING_DANGEROUS", severityClass: "opasna" },
    ]);
    expect(seq[0].mode).toBe("teach");
    expect(seq[1]).toMatchObject({ mode: "grade", scored: true }); // опасна always grades
    // The shared counter, stated where it can actually fail: the dangerous
    // overspeed lands on the taught encounter's counter and is priced ×1.5.
    // Unpool the pair and it becomes a first encounter at ×1.0 — handing back
    // an escalation the driver earned by speeding, being taught, and then
    // speeding harder. That is the false-acquittal direction of this fix.
    expect(seq[1].penaltyMultiplier).toBe(1.5);
  });

  it("always grades dangerous mistakes from the first encounter (safety floor)", () => {
    const { decision } = coachStep({}, { code: "RED_LIGHT_CROSSED", severityClass: "opasna" });
    expect(decision).toMatchObject({ mode: "grade", scored: true, showLesson: true });
  });

  it("always grades a terminating collision even though it is not опасна-mapped", () => {
    const { decision } = coachStep(
      {},
      { code: "COLLISION", severityClass: "opasna", terminateSession: true },
    );
    expect(decision.scored).toBe(true);
  });

  it("teaches an unmapped minor code by its own key", () => {
    const first = coachStep({}, { code: "HANDBRAKE_LEFT_ON", severityClass: "vtorostepenna" });
    expect(first.decision).toMatchObject({ scenarioId: null, mode: "teach", scored: false });
    const second = coachStep(first.encounters, {
      code: "HANDBRAKE_LEFT_ON",
      severityClass: "vtorostepenna",
    });
    expect(second.decision.mode).toBe("grade");
  });

  it("C3: a Wave-1 code walks the full ladder — teach, ×1.0, ×1.5, ×2.0 (capped)", () => {
    // ENGINE_STALLED is unmapped (keyed by its own code) and второстепенна:
    // the first stall is a free warning; repeats grade and escalate on the
    // training layer while official points stay catalog-fixed.
    const seq = coachSession([
      { code: "ENGINE_STALLED", severityClass: "vtorostepenna" },
      { code: "ENGINE_STALLED", severityClass: "vtorostepenna" },
      { code: "ENGINE_STALLED", severityClass: "vtorostepenna" },
      { code: "ENGINE_STALLED", severityClass: "vtorostepenna" },
      { code: "ENGINE_STALLED", severityClass: "vtorostepenna" },
    ]);
    expect(seq[0]).toMatchObject({ scenarioId: null, mode: "teach", penaltyMultiplier: 0 });
    expect(seq[1]).toMatchObject({ mode: "grade", penaltyMultiplier: 1 });
    expect(seq[2]).toMatchObject({ mode: "grade", penaltyMultiplier: 1.5 });
    expect(seq[3]).toMatchObject({ mode: "grade", penaltyMultiplier: 2 });
    expect(seq[4]).toMatchObject({ mode: "grade", penaltyMultiplier: 2 }); // capped
  });

  it("C3: an unmapped Wave-1 основна teaches first, then grades (library default)", () => {
    const seq = coachSession([
      { code: "HARSH_BRAKING_NO_CAUSE", severityClass: "osnovna" },
      { code: "HARSH_BRAKING_NO_CAUSE", severityClass: "osnovna" },
    ]);
    expect(seq[0]).toMatchObject({ scenarioId: null, mode: "teach", scored: false });
    expect(seq[1]).toMatchObject({ mode: "grade", scored: true, penaltyMultiplier: 1 });
  });
});

describe("what counts as a repeat — the fault, not the lesson that teaches it", () => {
  it("THE REFERENCE DRIVE: the zebra's two faults are not repeats of each other", () => {
    // MEASURED 2026-08-18, `sc-zebra-approach` driven wrong at 59 км/ч — the
    // lesson the whole audit uses as ground truth. The debrief printed
    // «Твърде бързо приближаване към пешеходна пътека» (опасна, 10 т.) and
    // «Непропускане на пешеходец» (опасна, 10 т.) — two different faults, both
    // taught by `ev-ped-crossing-marked` — and priced the second «ПОВТОРНА
    // ГРЕШКА ×1.5», «Тренировъчен резултат: 25 наказателни т.» against an
    // official 20. Approaching too fast and failing to give way are different
    // mistakes: you can approach slowly and still not yield.
    const seq = coachSession([
      asDriven("PEDESTRIAN_CROSSING_TOO_FAST"),
      asDriven("PEDESTRIAN_NOT_YIELDED"),
    ]);
    expect(seq[0]).toMatchObject({ mode: "grade", scored: true, penaltyMultiplier: 1 });
    expect(seq[1]).toMatchObject({ mode: "grade", scored: true, penaltyMultiplier: 1 });
    // Both still point at the marked-crossing lesson — the scenario is the
    // right key for WHICH lesson, and that half must not move.
    expect(seq[0].scenarioId).toBe("ev-ped-crossing-marked");
    expect(seq[1].scenarioId).toBe("ev-ped-crossing-marked");
  });

  it("…and the same zebra fault twice IS a repeat", () => {
    // The false-acquittal direction on the same lesson: splitting by fault
    // must not become a way for a driver to never escalate.
    const seq = coachSession([
      asDriven("PEDESTRIAN_NOT_YIELDED"),
      asDriven("PEDESTRIAN_NOT_YIELDED"),
      asDriven("PEDESTRIAN_NOT_YIELDED"),
    ]);
    expect(seq.map((d) => d.penaltyMultiplier)).toEqual([1, 1.5, 2]);
  });

  it("one unannounced lane change: the topic teaches ONCE, and neither fault is a repeat of the other", () => {
    // MEASURED 2026-08-19 through the full lesson pipeline,
    // `sc-ln-turn-lane-arrows` L3 / „mistake-late-two-lanes": the indicator and
    // the mirror fault fire on the SAME TICK (t=8.23) at the first boundary and
    // again at the second (t=9.72).
    //
    // THIS ROW HAS BEEN WRONG IN BOTH DIRECTIONS AND THE HISTORY IS THE POINT.
    //
    //   Originally, one counter keyed by TOPIC: the mirror fault was graded on
    //   the first tick as a REPEAT OF THE INDICATOR FAULT, and the second pair
    //   escalated ×1.5/×2.0 — official 9, training 13.5. The student was told he
    //   had repeated a mistake he had not made. FALSE CONVICTION.
    //
    //   Then one counter keyed by CODE: both faults taught at the first
    //   boundary, both at ×1.0 at the second — official 6 against an allowance
    //   of 9, so the drive PASSED. A late two-lane swerve, unsignalled AND
    //   unobserved, certified. FALSE CERTIFICATE, and the graver of the two.
    //
    // Two counters answer both. The TOPIC grants one lesson per drive; the
    // LADDER counts only this exact fault. So the signal fault is taught, the
    // mirror fault grades at BASE (the topic's lesson is spent, but its own
    // ladder is at zero — it is NOT a repeat), and the second mirror fault is
    // the only thing on this drive that escalates, because it is the only
    // mistake genuinely made twice after being graded.
    const seq = coachSession([
      asDriven("LANE_CHANGE_WITHOUT_INDICATOR"),
      asDriven("LANE_CHANGE_WITHOUT_MIRROR_CHECK"),
      asDriven("LANE_CHANGE_WITHOUT_INDICATOR"),
      asDriven("LANE_CHANGE_WITHOUT_MIRROR_CHECK"),
    ]);
    expect(seq[0]).toMatchObject({ mode: "teach", scored: false });
    expect(seq[1]).toMatchObject({ mode: "grade", scored: true, penaltyMultiplier: 1 });
    expect(seq[2]).toMatchObject({ mode: "grade", scored: true, penaltyMultiplier: 1 });
    expect(seq[3]).toMatchObject({ mode: "grade", scored: true, penaltyMultiplier: 1.5 });
    // THE FALSE-CERTIFICATE GUARD, stated as a count so it cannot be satisfied
    // by relabelling: three of the four faults must cost points. Hand the teach
    // budget back to each code and this drops to two, which is the drive that
    // passed.
    expect(seq.filter((d) => d.scored)).toHaveLength(3);
    // THE FALSE-CONVICTION GUARD, the other direction: no fault is priced as a
    // repeat of a DIFFERENT fault. Only the mistake made twice escalates.
    expect(seq.filter((d) => d.penaltyMultiplier > 1)).toHaveLength(1);
  });

  it("SWEEP: no code is ever a repeat of a DIFFERENT code that shares its lesson", () => {
    // The class-level guard, and the reason this is not a one-row fix. Every
    // ordered pair of distinct codes under one scenario event, minus the pairs
    // the catalogue declares one fault at two bars.
    //
    // WHAT MUST BE IDENTICAL IS THE PRICE, NOT THE WHOLE DECISION. `b` after `a`
    // legitimately differs from `b` alone in ONE field: `mode`, because `a`
    // already spent the topic's single lesson. That is the teach budget doing
    // its job. What may never differ is the LADDER — `b` must be priced as a
    // first offence of `b`, never as a second helping of `a`. Asserting the
    // whole object conflated the two and would force the teach budget back to
    // per-code, which is the drive that passed while unsignalled and unobserved.
    let pairs = 0;
    for (const [ev, codes] of codesByScenario()) {
      for (const a of codes) {
        for (const b of codes) {
          if (a === b || repeatFamilyForCode(a) === repeatFamilyForCode(b)) continue;
          pairs++;
          const after = coachSession([asDriven(a), asDriven(b)])[1];
          const alone = coachStep({}, asDriven(b)).decision;
          // THE ANTI-REPEAT PROPERTY, stated so it cannot be confused with the
          // teach budget. `b` has never been graded, so whatever it costs must
          // be a FIRST offence: 0 if the topic still had its lesson to give, or
          // BASE (×1.0) if `a` spent it. An escalated 1.5 or 2.0 here is the
          // false conviction — `b` inheriting `a`'s ladder — and is the only
          // value this loop exists to catch.
          expect(
            after.penaltyMultiplier,
            `${b} after ${a} (both ${ev}) must not be priced as a repeat`,
          ).toBeLessThanOrEqual(1);
          // Cross-check against the fresh decision wherever the mode agrees, so
          // the bound above cannot be satisfied by a mode that never grades.
          if (after.mode === alone.mode) {
            expect(after.penaltyMultiplier).toBe(alone.penaltyMultiplier);
          }
          // …and it stays the same fault, with the same lesson attached.
          expect(after.code).toBe(alone.code);
          expect(after.scenarioId).toBe(alone.scenarioId);
          // The ONE permitted difference, pinned so it cannot widen unnoticed:
          // when the two decisions differ at all, it is `mode`/`scored` only,
          // and only ever in the direction of grading MORE.
          if (after.mode !== alone.mode) {
            expect(alone.mode, `${b} after ${a}: only a spent teach may differ`).toBe("teach");
            expect(after.mode).toBe("grade");
          }
        }
      }
    }
    // Guards the sweep itself: a mapping table that lost its collisions, or a
    // family table that swallowed them all, would make this loop vacuous.
    expect(pairs, "the sweep checked no pairs at all").toBeGreaterThanOrEqual(40);
  });

  it("SWEEP: the other direction — every mapped code repeated IS a repeat", () => {
    // The false-acquittal half of the same sweep. Splitting the key must never
    // become „nothing ever escalates": each code, twice, must move up the
    // ladder — grading where it taught, or escalating where it already graded.
    let checked = 0;
    for (const codes of codesByScenario().values()) {
      for (const code of codes) {
        const seq = coachSession([asDriven(code), asDriven(code)]);
        expect(seq[1].mode, `${code} repeated must grade`).toBe("grade");
        expect(seq[1].scored, `${code} repeated must score`).toBe(true);
        if (seq[0].mode === "grade") {
          // Already graded first time (опасна floor) → the repeat escalates.
          expect(seq[1].penaltyMultiplier, `${code} repeated must escalate`).toBe(1.5);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(30);
  });

  it("an act-carrying code keeps its scenario's policy — the key is not an event id", () => {
    // THE LATENT HOLE, made reachable on purpose. `encounterKey` returns a
    // COUNTER key; it used to be handed to `resolveEncounter`, which looks a
    // `policyDefault` up by it — so `ev-collision#vehicle` matched no event and
    // silently dropped `ev-collision`'s "learn-only" default. Nothing reached
    // it, because both act-carrying codes are опасна and `policyForViolation`
    // always overrides them. Drive COLLISION at основна severity — the exact
    // shape of the next act-carrying code somebody adds — and the drop becomes
    // visible: at HEAD this teaches once and then GRADES; now it rides the
    // scenario's learn-only channel and never scores.
    expect(actCopy("COLLISION", "vehicle")).not.toBeNull();
    const first = coachStep({}, { code: "COLLISION", severityClass: "osnovna", detail: "vehicle" });
    expect(first.decision).toMatchObject({ mode: "learn", scored: false });
    const second = coachStep(first.encounters, {
      code: "COLLISION",
      severityClass: "osnovna",
      detail: "vehicle",
    });
    expect(second.decision).toMatchObject({ mode: "learn", scored: false });
    // And the pooled (no-act) form of the same code answers identically — the
    // act may move the counter, never the policy.
    const pooled = coachStep({}, { code: "COLLISION", severityClass: "osnovna" });
    expect(pooled.decision.mode).toBe("learn");
  });
});

describe("what counts as a repeat — the act, not just the code", () => {
  const RAIL_ACTS = ["no-stop", "entered-barred", "stopped-on-track"] as const;

  it("SELF-CHECK: the act names this file hardcodes are still acts in the catalogue", () => {
    // Without this, renaming an act in catalog.ts would turn every assertion
    // below into a test of the pooled (no-act) path — it would go on passing
    // while measuring nothing. Named details must be non-null; an invented one
    // must be null, or `actCopy` is not the discriminator this suite thinks.
    for (const act of RAIL_ACTS) {
      expect(actCopy("RAIL_CROSSING_VIOLATION", act), `${act} must be a catalogue act`).not.toBeNull();
    }
    for (const body of Object.keys(COLLISION_CONTACT_COPY)) {
      expect(actCopy("COLLISION", body), `${body} must be a catalogue act`).not.toBeNull();
    }
    expect(actCopy("COLLISION", "not-a-body")).toBeNull();
    expect(actCopy("SPEEDING_OVER_LIMIT", "62 в 50")).toBeNull();
  });

  it("two victims in one crash are not a repeat of anything", () => {
    // sc-hz-accident-scene, 2026-08-18: a wrecked car at t=13.13 and a
    // bystander at t=13.43. One act of driving, two struck bodies — the
    // second must be priced as a first encounter, not «повторна грешка ×1.5».
    const seq = coachSession([
      { code: "COLLISION", severityClass: "opasna", terminateSession: true, detail: "vehicle" },
      { code: "COLLISION", severityClass: "opasna", terminateSession: true, detail: "pedestrian" },
    ]);
    expect(seq[0]).toMatchObject({ mode: "grade", scored: true, penaltyMultiplier: 1 });
    expect(seq[1]).toMatchObject({ mode: "grade", scored: true, penaltyMultiplier: 1 });
    // And the pedestrian act carries its own lesson rather than arriving
    // silently behind the vehicle's — the per-body copy exists to say
    // something the first row did not (catalog.ts COLLISION_CONTACT_COPY).
    expect(seq[1].showLesson).toBe(true);
  });

  it("the SAME body struck twice IS a repeat — the ladder still fires", () => {
    // The false-acquittal direction. Splitting by act must not become a way
    // for a driver to never escalate: hit two cars, and the second is a
    // repeat of the first.
    const seq = coachSession([
      { code: "COLLISION", severityClass: "opasna", terminateSession: true, detail: "vehicle" },
      { code: "COLLISION", severityClass: "opasna", terminateSession: true, detail: "vehicle" },
      { code: "COLLISION", severityClass: "opasna", terminateSession: true, detail: "vehicle" },
    ]);
    expect(seq[1].penaltyMultiplier).toBe(1.5);
    expect(seq[2].penaltyMultiplier).toBe(2);
  });

  it("three rail acts are three mistakes, not one repeated three times", () => {
    // RAIL_CROSSING_VIOLATION is опасна and deliberately NOT terminating, so
    // no ledger closure hides this downstream: all three rows bill, and any
    // multiplier here reaches the debrief as «повторна грешка».
    const seq = coachSession(
      RAIL_ACTS.map((detail) => ({
        code: "RAIL_CROSSING_VIOLATION",
        severityClass: "opasna" as const,
        detail,
      })),
    );
    for (const [i, d] of seq.entries()) {
      expect(d.penaltyMultiplier, `${RAIL_ACTS[i]} is its own mistake`).toBe(1);
    }
  });

  it("the same rail act twice IS a repeat", () => {
    const seq = coachSession([
      { code: "RAIL_CROSSING_VIOLATION", severityClass: "opasna", detail: "entered-barred" },
      { code: "RAIL_CROSSING_VIOLATION", severityClass: "opasna", detail: "entered-barred" },
    ]);
    expect(seq[1].penaltyMultiplier).toBe(1.5);
  });

  it("a detail that is NOT an act never splits the counter — speeding still escalates", () => {
    // SPEEDING_OVER_LIMIT stamps the measured speed on `detail`, so it differs
    // on every event. Keying on the field rather than on the catalogue would
    // give each one a fresh counter: taught five times, graded never.
    const seq = coachSession([
      { code: "SPEEDING_OVER_LIMIT", severityClass: "vtorostepenna", detail: "62 в 50" },
      { code: "SPEEDING_OVER_LIMIT", severityClass: "vtorostepenna", detail: "71 в 50" },
      { code: "SPEEDING_OVER_LIMIT", severityClass: "vtorostepenna", detail: "80 в 50" },
      { code: "SPEEDING_DANGEROUS", severityClass: "opasna", detail: "96 в 50" },
    ]);
    expect(seq[0]).toMatchObject({ mode: "teach", penaltyMultiplier: 0 });
    expect(seq[1]).toMatchObject({ mode: "grade", penaltyMultiplier: 1 });
    expect(seq[2]).toMatchObject({ mode: "grade", penaltyMultiplier: 1.5 });
    // Still the same scenario counter across the two speeding codes.
    expect(seq[3]).toMatchObject({ mode: "grade", penaltyMultiplier: 2 });
  });

  it("every struck body in the catalogue gets its own counter", () => {
    // The sweep: if a fifth body kind lands in COLLISION_CONTACT_COPY, this is
    // what guarantees it is not billed as a repeat of the four before it.
    const bodies = Object.keys(COLLISION_CONTACT_COPY);
    expect(bodies.length).toBeGreaterThanOrEqual(4);
    const seq = coachSession(
      bodies.map((detail) => ({
        code: "COLLISION",
        severityClass: "opasna" as const,
        terminateSession: true,
        detail,
      })),
    );
    for (const [i, d] of seq.entries()) {
      expect(d.penaltyMultiplier, `${bodies[i]} is its own mistake`).toBe(1);
    }
  });

  it("an absent detail behaves exactly as before (every caller that stamps none)", () => {
    const seq = coachSession([
      { code: "COLLISION", severityClass: "opasna", terminateSession: true },
      { code: "COLLISION", severityClass: "opasna", terminateSession: true },
    ]);
    expect(seq[0].penaltyMultiplier).toBe(1);
    expect(seq[1].penaltyMultiplier).toBe(1.5);
  });
});

describe("A12 warn-once floor for второстепенни", () => {
  it("EVERY второстепенна catalog code teaches exactly once, then grades — mapped or not", () => {
    // The whole-catalog sweep: if a new 1-point detector lands without a
    // scenario mapping (or mapped to a stricter scenario), this test is what
    // guarantees the driver still gets one warning toast before losing points.
    const secondDegree = Object.entries(VIOLATIONS)
      .filter(([, spec]) => spec.severityClass === "vtorostepenna")
      .map(([code]) => code);
    expect(secondDegree.length).toBeGreaterThanOrEqual(7);
    for (const code of secondDegree) {
      const first = coachStep({}, { code, severityClass: "vtorostepenna" });
      expect(first.decision.mode, `${code}: first encounter must warn, not grade`).toBe("teach");
      expect(first.decision.scored, `${code}: first encounter must not score`).toBe(false);
      expect(first.decision.showLesson, `${code}: the warning carries the lesson`).toBe(true);
      const second = coachStep(first.encounters, { code, severityClass: "vtorostepenna" });
      expect(second.decision.mode, `${code}: repeat must grade`).toBe("grade");
      expect(second.decision.scored, `${code}: repeat must score`).toBe(true);
    }
  });

  it("основна and опасна behaviour is unchanged by the floor", () => {
    // основна: still teach-first via its scenario mapping.
    const osnovna = coachStep({}, { code: "TURN_WITHOUT_INDICATOR", severityClass: "osnovna" });
    expect(osnovna.decision.mode).toBe("teach");
    // опасна: still graded from the very first encounter.
    const opasna = coachStep({}, { code: "WRONG_WAY", severityClass: "opasna" });
    expect(opasna.decision).toMatchObject({ mode: "grade", scored: true });
  });
});

describe("A13 exam mode — coach OFF, always-grade", () => {
  it("EVERY catalog code, EVERY severity grades from the first encounter at ×1.0", () => {
    // The whole-catalog sweep, exam edition: no teach, no warn-once, no
    // lesson card, official base points only — if a new detector lands, this
    // is what guarantees the exam still grades it from tick one.
    for (const [code, spec] of Object.entries(VIOLATIONS)) {
      const first = coachStep(
        {},
        {
          code,
          severityClass: spec.severityClass,
          terminateSession: spec.terminateSession === true,
        },
        { examMode: true },
      );
      expect(first.decision.mode, `${code}: exam must grade the first encounter`).toBe("grade");
      expect(first.decision.scored, `${code}: exam must score`).toBe(true);
      expect(first.decision.penaltyMultiplier, `${code}: no multiplier on exams`).toBe(1);
      expect(first.decision.showLesson, `${code}: no mini-lesson mid-exam`).toBe(false);

      // Repeats stay at ×1.0 — the escalation ladder is training-only.
      const second = coachStep(
        first.encounters,
        { code, severityClass: spec.severityClass },
        { examMode: true },
      );
      expect(second.decision.mode, `${code}: repeat grades`).toBe("grade");
      expect(second.decision.penaltyMultiplier, `${code}: repeat stays ×1.0`).toBe(1);
    }
  });

  it("without the flag the coach is untouched (teach-first survives)", () => {
    const first = coachStep({}, { code: "SPEEDING_OVER_LIMIT", severityClass: "vtorostepenna" });
    expect(first.decision.mode).toBe("teach");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   THE COUNTER IS THE MODULE'S, NOT THIS FILE'S — 2026-08-26.

   `policy.recordEncounter` is the one place that says what „one more encounter"
   means, and policy.ts's header says so in as many words: „the caller owns the
   per-driver encounter counts … this module just decides teach-vs-grade". It
   had NO caller anywhere in the tree. `coachStep` spelled the same spread out by
   hand in three places, and every row above stayed green regardless — they read
   DECISIONS, not the shape of the record.

   WHAT THESE ROWS ACTUALLY GUARD — measured at integration, not asserted.
   They do NOT bind the call site, and the first draft of this paragraph claimed
   they did. Inlining both spreads back into `coachStep` leaves all 31 rows in
   this file green, because the two spellings produce identical counts today.
   What they DO catch is the change that would hurt: a key moved by something
   other than one, or the input record mutated instead of copied — counting
   `teachKey` twice turns this block red. Keep them for that, and do not read
   them as a pin on `recordEncounter` being the caller.
   ═══════════════════════════════════════════════════════════════════════════ */
describe("coachStep counts through policy.recordEncounter", () => {
  it("every key the step touches moved by exactly one, and nothing else moved", () => {
    const before: Record<string, number> = { "teach:ev-speed-limit": 4, noise: 9 };
    const frozen = { ...before };
    const step = coachStep(before, asDriven("SPEEDING_OVER_LIMIT"));

    // IMMUTABLE — the whole point of the helper's signature. A reducer that
    // mutated its input would replay a session differently on the second run.
    expect(before, "the input record may not be touched").toEqual(frozen);

    for (const [key, value] of Object.entries(step.encounters)) {
      if (key === "noise") continue;
      expect(value, `${key}: a step may only ever add one`).toBe(recordEncounter(before, key)[key]);
    }
    // …and the untouched key came through unchanged rather than being dropped.
    expect(step.encounters.noise).toBe(9);
  });

  it("the graded key is the third increment, and only when a grading happened", () => {
    // Teach first: no `graded:` key exists at all, so the ladder needs no
    // offset. This is the row that goes red if the third call site is inlined
    // back and drifts to „+1 always".
    const taught = coachStep({}, asDriven("SPEEDING_OVER_LIMIT"));
    expect(taught.decision.mode).toBe("teach");
    expect(Object.keys(taught.encounters).filter((k) => k.startsWith("graded:"))).toEqual([]);

    const graded = coachStep(taught.encounters, asDriven("SPEEDING_OVER_LIMIT"));
    expect(graded.decision.mode).toBe("grade");
    const key = Object.keys(graded.encounters).find((k) => k.startsWith("graded:"));
    expect(key).toBeDefined();
    expect(graded.encounters[key as string]).toBe(
      recordEncounter(taught.encounters, key as string)[key as string],
    );
  });
});
