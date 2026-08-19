import { describe, expect, it } from "vitest";
import { COLLISION_CONTACT_COPY, VIOLATIONS, actCopy } from "../rules";
import { coachSession, coachStep } from "./coach";
import { scenarioForCode } from "./mapping";

describe("catalog → scenario mapping", () => {
  it("maps driving codes to scenario events", () => {
    expect(scenarioForCode("SPEEDING_OVER_LIMIT")).toBe("ev-speed-limit");
    expect(scenarioForCode("RED_LIGHT_CROSSED")).toBe("ev-junction-signalized");
    expect(scenarioForCode("POOR_LANE_KEEPING")).toBe("ev-lane-discipline");
    expect(scenarioForCode("PREDRIVE_STEP_SKIPPED")).toBeNull();
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

  it("keys encounters by scenario, so both speeding codes share a counter", () => {
    // First minor speeding teaches; a later dangerous speeding still grades
    // (safety floor) and belongs to the same ev-speed-limit scenario.
    const seq = coachSession([
      { code: "SPEEDING_OVER_LIMIT", severityClass: "vtorostepenna" },
      { code: "SPEEDING_DANGEROUS", severityClass: "opasna" },
    ]);
    expect(seq[0].mode).toBe("teach");
    expect(seq[1]).toMatchObject({ mode: "grade", scored: true }); // опасна always grades
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
