/**
 * AN OBJECTIVE MAY NOT CLAIM A TEST IT DOES NOT RUN — the hazards family.
 *
 * sweep161, `sc-hazard-obstacle/pc-right/04-t092s.png`: *„The objective
 * «Задмини обекта, без да го закачиш» is authored as a pure reachZone at
 * x=4.06, y=178, radius 12 m with no contact test of any kind, so it ticks on
 * arrival whether or not anything was touched."*
 *
 * The obstacle itself is real — the stalled car is in frame at t060s with the
 * shadow easing past it — and contact does grade, as `COLLISION`. But
 * `COLLISION` is `terminateSession`, which closes the exam SHEET and leaves the
 * car rolling (Наредба № 38 чл. 48), so a student who clips the obstacle drives
 * the remaining 48 m and collects a green tick reading „without touching it".
 *
 * That is the tick-for-an-unmeasured-skill this whole audit exists to find, and
 * the reason it survived is that nothing in the suite compares what a title
 * SAYS against what its params can DECIDE. This does, for the one family where
 * the frame proved it matters.
 *
 * Both directions are pinned. The rule must fire on the sentence that was
 * photographed (or it guards nothing), and it must not fire on the titles the
 * family legitimately ships (or it is unsatisfiable and someone will delete it).
 */
import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES_HAZARDS } from "../templates-hazards";

/**
 * Copy that promises the student was, or was not, in CONTACT with something.
 * Stems only — Bulgarian inflects, and `\b` is ASCII-only so it silently never
 * matches Cyrillic (learned the hard way on `controller-bubble.test.ts` in this
 * same wave).
 */
const CLAIMS_CONTACT =
  /(закач|удар|бутн|докосн|блъсн|застърж|остърж)[а-я]*/i;

/** Objective kinds whose params can actually decide a contact question. */
const KINDS_THAT_CAN_TEST_CONTACT: ReadonlySet<string> = new Set<string>([
  // Deliberately EMPTY. `ObjectiveParams` (lessons/types.ts) is reachZone /
  // passSignal / driveDistance / completeManeuver, and not one of them carries
  // a contact term — the parking and three-point-turn maneuvers lean on the
  // rule engine's obstacle rects, which is a DETECTOR, not an objective gate.
  // The day such a term exists, add its kind here and the rule relaxes itself.
]);

const allObjectives = () =>
  SCENARIO_TEMPLATES_HAZARDS.flatMap((spec) =>
    spec.success.map((o) => ({ lesson: spec.id, id: o.id, titleBg: o.titleBg, kind: o.params.kind })),
  );

describe("hazards objectives claim only what they measure", () => {
  it("NON-VACUITY: the detector fires on the exact sentence that was photographed", () => {
    // Without this the rule below can rot into a regex that matches nothing and
    // reports every title clean — the failure mode every „0 defects" instrument
    // in this project had.
    expect("Задмини обекта, без да го закачиш").toMatch(CLAIMS_CONTACT);
    expect("Мини, без да удариш конуса").toMatch(CLAIMS_CONTACT);
    // …and stays quiet on copy that promises only geometry.
    expect("Задмини обекта и продължи напред").not.toMatch(CLAIMS_CONTACT);
    expect("Приближи обекта с контролирана скорост").not.toMatch(CLAIMS_CONTACT);
  });

  it("the family really does ship objectives for this to judge", () => {
    // Guards against the whole battery passing because the catalogue is empty.
    const objectives = allObjectives();
    expect(objectives.length).toBeGreaterThanOrEqual(3);
    expect(objectives.map((o) => o.lesson)).toContain("sc-hazard-obstacle");
  });

  it("no objective title promises a contact test its params cannot run", () => {
    const offenders = allObjectives().filter(
      (o) => CLAIMS_CONTACT.test(o.titleBg) && !KINDS_THAT_CAN_TEST_CONTACT.has(o.kind),
    );
    expect(
      offenders.map((o) => `${o.lesson}/${o.id} (${o.kind}): "${o.titleBg}"`),
      "a green tick would certify a skill nothing measured",
    ).toEqual([]);
  });

  it("the contact LESSON is still taught — it just lives where it is enforced", () => {
    // The other direction: stripping the claim off the tick must not strip it
    // out of the drill. If this goes red the retitle became a deletion.
    const spec = SCENARIO_TEMPLATES_HAZARDS.find((s) => s.id === "sc-hazard-obstacle");
    expect(spec).toBeDefined();
    const prose = [
      spec!.objectiveBg,
      ...spec!.instructionsBg.map((i) => i.textBg),
      spec!.teach?.examinerBg ?? "",
    ].join(" | ");
    expect(prose, "the drill no longer tells him not to touch it").toMatch(CLAIMS_CONTACT);
    // And the fault is still graded by the code that genuinely detects it.
    const codes = (spec!.mistakes ?? []).flatMap((m) => m.codeRefs ?? []);
    expect(codes, "contact is no longer graded anywhere").toContain("COLLISION");
  });
});
