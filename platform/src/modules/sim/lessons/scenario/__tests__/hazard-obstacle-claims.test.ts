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
import type { ScenarioObjectiveSpec } from "../types";

/**
 * Copy that promises the student was, or was not, in CONTACT with something.
 * Stems only — Bulgarian inflects, and `\b` is ASCII-only so it silently never
 * matches Cyrillic (learned the hard way on `controller-bubble.test.ts` in this
 * same wave).
 */
const CLAIMS_CONTACT =
  /(закач|удар|бутн|докосн|блъсн|застърж|остърж)[а-я]*/i;

/**
 * CAN THESE PARAMS ACTUALLY DECIDE A CONTACT QUESTION?
 *
 * This used to be a set of KINDS and the set was deliberately empty, with the
 * note „the day such a term exists, add its kind here and the rule relaxes
 * itself". The term now exists — `ReachZoneParams.requireNoContact`
 * (lessons/types.ts), read by `objectives.ts stepReachZone` off
 * `ObjectiveContext.struckABodyInRun` — but relaxing BY KIND would have been
 * the wrong relaxation, and a wide one: every bare `reachZone` in the family
 * would have been free to promise a contact test again, which is the exact
 * defect this file was written for.
 *
 * So the question is asked per OBJECTIVE, of the params themselves. A title may
 * claim contact when its own gate carries the key and never otherwise, and the
 * rule bites HARDER than the version it replaces rather than less: adding a
 * contact promise to any other objective in the family still fails the build,
 * and so does removing the key from the one objective that earns its promise.
 */
function canTestContact(params: ScenarioObjectiveSpec["params"]): boolean {
  return params.kind === "reachZone" && params.requireNoContact === true;
}

const allObjectives = () =>
  SCENARIO_TEMPLATES_HAZARDS.flatMap((spec) =>
    spec.success.map((o) => ({
      lesson: spec.id,
      id: o.id,
      titleBg: o.titleBg,
      kind: o.params.kind,
      canTestContact: canTestContact(o.params),
    })),
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
      (o) => CLAIMS_CONTACT.test(o.titleBg) && !o.canTestContact,
    );
    expect(
      offenders.map((o) => `${o.lesson}/${o.id} (${o.kind}): "${o.titleBg}"`),
      "a green tick would certify a skill nothing measured",
    ).toEqual([]);
  });

  it("THE RELAXATION IS NOT A HOLE — the key, not the kind, is what licenses the claim", () => {
    // Both directions of the per-objective rule, so the round that widened it
    // to „kind" (which would have re-opened the family) fails here instead.
    expect(canTestContact({ kind: "reachZone", x: 0, y: 0, radiusM: 12 })).toBe(false);
    expect(
      canTestContact({ kind: "reachZone", x: 0, y: 0, radiusM: 12, requireNoContact: true }),
    ).toBe(true);
    // …and the one objective that makes the promise really does carry the gate,
    // so „the title came back" and „the gate came back" cannot drift apart.
    const cleared = allObjectives().find((o) => o.id === "sc-obs-cleared");
    expect(cleared, "sc-obs-cleared is gone — this file no longer guards anything").toBeDefined();
    expect(cleared!.titleBg).toMatch(CLAIMS_CONTACT);
    expect(cleared!.canTestContact, "the promise is back without the gate").toBe(true);
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
