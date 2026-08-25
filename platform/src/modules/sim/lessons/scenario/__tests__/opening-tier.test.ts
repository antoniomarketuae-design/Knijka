/**
 * THE CAR THE LESSON HANDS OVER — sc-vp-stall:e4dfb43f (critical), 2026-08-25.
 *
 * „Загасване при потегляне" enumerates clutch technique in four of its five
 * steps: «Съединител докрай („СЪЕД“ / Z), включи първа предавка (]) и дай лек
 * газ», «Отпускай съединителя ПЛАВНО до точката на зацепване», «Загасне ли
 * двигателят: съединител докрай, запали отново». `transmissionModeFor`
 * (vehicle/driveline.ts) gives a clutch on ONE tier — „Напреднал" — and the
 * scene opened every lesson at `DEFAULT_DIFFICULTY` ("normal"), which is an
 * automatic. Round 10 answered this by asking the student to switch tiers in
 * instruction 1; the sweep that followed read gear D on all 80 sampled frames
 * of pc-right, pc-wrong and mobile-right
 * (`.audit-frames/w10-3/frames/sc-vp-stall__pc-right/01-arrival.png` shows the
 * tier strip on the glass with „Нормален" underlined, beside the line telling
 * the student to leave it). The drill has never once run on a car it can be
 * performed in.
 *
 * So the tier moved from the briefing to the hand-over, where `vehicleStart`
 * already lives. This file pins the whole chain, because a channel that stops
 * one link short of the scene is this programme's most expensive habit:
 * template → validate → compile → the tier the scene seeds → the gearbox
 * `transmissionModeFor` derives from it.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_DIFFICULTY, transmissionModeFor } from "../../../vehicle";
import { compileScenario, SCENARIO_TEMPLATES, validateScenarioSpec } from "..";
import type { ScenarioLevel } from "..";

const LEVELS: ScenarioLevel[] = [1, 2, 3, 4, 5];

describe("the clutch drill is handed a car with a clutch", () => {
  const stall = SCENARIO_TEMPLATES.find((s) => s.id === "sc-vp-stall");

  it("the template asks for the manual tier", () => {
    expect(stall?.start.openingTier).toBe("advanced");
  });

  it("and that tier is the one that has a clutch at all", () => {
    // The link the round-10 note could not make: the tier IS the gearbox.
    expect(transmissionModeFor("advanced")).toBe("manual");
    expect(transmissionModeFor(DEFAULT_DIFFICULTY)).toBe("automatic");
  });

  it("every rung of it compiles with the tier attached", () => {
    for (const level of LEVELS) {
      const lesson = compileScenario(stall!, level);
      expect({ level, tier: lesson.openingTier }).toEqual({ level, tier: "advanced" });
    }
  });

  it("its briefing no longer orders an act the hand-over already performed", () => {
    // The doc-86 L10 rule, on a third switch: a car handed over already
    // configured must not carry a briefing telling the student to configure it.
    const steps = stall!.instructionsBg.map((s) => s.textBg).join(" ");
    expect(steps).not.toContain("превключи на");
    // …and the FACT stays, because the student still has to read a cockpit
    // that is not the one the other 166 templates gave them.
    expect(stall!.instructionsBg[0]!.textBg).toContain("съединител");
  });

  it("the step-2 fold budget did not narrow to buy it", () => {
    // Wave 1's measured cost of moving briefing text: 29 rungs to a worse fold
    // band and 1,190 body characters lost. Step 1 is the line; a LONGER line
    // eats step 2's body budget. This one got shorter.
    expect(stall!.instructionsBg[0]!.textBg.length).toBeLessThanOrEqual(76);
  });
});

describe("the channel is opt-in and validated", () => {
  it("no other template opens anywhere but the default", () => {
    const declared = SCENARIO_TEMPLATES.filter((s) => s.start.openingTier !== undefined).map(
      (s) => s.id,
    );
    expect(declared).toEqual(["sc-vp-stall"]);
  });

  it("every other compiled lesson carries no tier at all", () => {
    // Byte-identical for the rest of the catalogue: the field is spread in
    // only when authored, so `lesson.openingTier ?? DEFAULT_DIFFICULTY` in the
    // scene resolves exactly as the scene resolved before this existed.
    const withTier = SCENARIO_TEMPLATES.filter(
      (s) => compileScenario(s, 1).openingTier !== undefined,
    ).map((s) => s.id);
    expect(withTier).toEqual(["sc-vp-stall"]);
  });

  it("rejects a tier that is not one of the three", () => {
    const bad = {
      ...stallLike(),
      start: { ...stallLike().start, openingTier: "expert" as never },
    };
    expect(validateScenarioSpec(bad)).toContain(
      `start.openingTier must be "beginner" | "normal" | "advanced"`,
    );
  });

  it("accepts the three, and absence", () => {
    for (const tier of ["beginner", "normal", "advanced"] as const) {
      const spec = { ...stallLike(), start: { ...stallLike().start, openingTier: tier } };
      expect(validateScenarioSpec(spec)).not.toContain(
        `start.openingTier must be "beginner" | "normal" | "advanced"`,
      );
    }
    expect(validateScenarioSpec(stallLike())).toEqual([]);
  });
});

describe("the scene really seeds its picker from it", () => {
  // The source walk, for the reason the demo-deck gates beside LessonScene
  // carry: that file's import closure reaches @react-three/drei and cannot
  // LOAD here. It proves the last link — a compiled field nothing reads is
  // the failure this programme has paid for more than any other.
  //
  // WHOLE-LINE COMMENTS DROPPED FIRST, the same discipline the demo-deck walk
  // records: the realistic way this seam comes undone is not a deletion but a
  // note left above the reverted line («// was: … lesson.openingTier ?? …»),
  // and `indexOf` would find the sentence about the rule before the rule.
  const SCENE = readFileSync(
    path.join(process.cwd(), "src", "components", "sim", "LessonScene.tsx"),
    "utf-8",
  )
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

  it("the walk is looking at the real state", () => {
    expect(SCENE).toContain("const [difficulty, setDifficultyState] = useState<DifficultyMode>(");
    expect(SCENE).toContain("difficultyRef.current = difficulty;");
  });

  it("the tier state opens on the lesson's own tier when it has one", () => {
    const from = SCENE.indexOf(
      "const [difficulty, setDifficultyState] = useState<DifficultyMode>(",
    );
    const to = SCENE.indexOf(");", from);
    expect(from).toBeGreaterThan(0);
    const seed = SCENE.slice(from, to);
    expect(seed).toContain("lesson.openingTier ?? DEFAULT_DIFFICULTY");
  });

  it("the tier pill still moves it — this seeds, it does not pin", () => {
    // The guard rail. Making the tier immutable would answer the finding by
    // taking a control away from every other lesson in the catalogue.
    expect(SCENE).toContain("const setDifficulty = useCallback((mode: DifficultyMode) => {");
    expect(SCENE).toContain("setDifficultyState(mode);");
  });
});

/** A minimal valid spec to hang the validator cases on — the real one. */
function stallLike() {
  return SCENARIO_TEMPLATES.find((s) => s.id === "sc-vp-stall")!;
}
