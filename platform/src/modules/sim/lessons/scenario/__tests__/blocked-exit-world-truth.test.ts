/**
 * THE DRILL MAY NOT DESCRIBE MORE TRAFFIC THAN IT STAGES — `sc-jx-blocked-exit`.
 *
 * sweep161, `sc-jx-blocked-exit/pc-right/05-stopped.png`: *„The hazard the
 * lesson is named after is not in the world. The briefing describes a queue
 * standing a metre past the far mouth with no half-car of room ('колоната след
 * него стои и опашката ѝ е спряла на метър след отсрещното устие'), but the
 * carriageway beyond the junction is clear."*
 *
 * The hazard IS staged — `JXB_QUEUE_TAIL`, one stationary actor at y = 31,
 * 1.23 m past the painted far mouth — and the file's own HONEST LIMIT block
 * explains at length why it is one car and not a column: on a 54 m junction
 * square no single queue car can be both past the mouth and leave a follower
 * straddling the cross carriageway. That reasoning was done carefully and the
 * sentence the student reads was never brought back in line with it, so the
 * briefing sent him looking for a queue with a tail and the world had one car.
 *
 * A test can hold that join, and nothing did. `templates.test.ts` and the
 * district batteries check ids, coordinates and geometry; no test in the
 * catalogue has ever compared a lesson's PROSE against the actors it stages.
 * This one does, for the drill the frame convicted.
 */
import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../templates";

const LESSON = "sc-jx-blocked-exit";

/** Copy claiming a QUEUE of vehicles rather than a vehicle. */
const CLAIMS_A_QUEUE = /(колон|опашк|върволиц|редиц)[а-я]*/i;

const spec = () => {
  const s = SCENARIO_TEMPLATES.find((t) => t.id === LESSON);
  if (s === undefined) throw new Error(`${LESSON} is not in the catalogue`);
  return s;
};

/**
 * The copy that describes THIS DRIVE — what the student is told to look for
 * and what he is told happened. Deliberately excludes `objectiveBg` and
 * `teach.whenBg`, which generalise to real Sofia junctions and are allowed to
 * speak of columns; the exclusion is named here rather than hidden in a regex
 * so that widening it is a visible decision.
 */
function driveReferringCopy(): { where: string; text: string }[] {
  const s = spec();
  return [
    ...s.instructionsBg.map((i) => ({ where: `instruction ${i.n}`, text: i.textBg })),
    ...s.success.map((o) => ({ where: `objective ${o.id}`, text: o.titleBg })),
    ...(s.mistakes ?? []).map((m, i) => ({
      where: `mistake ${i} title`,
      text: m.titleBg,
    })),
    ...(s.mistakes ?? []).map((m, i) => ({
      where: `mistake ${i} debrief`,
      text: m.whatWentWrongBg,
    })),
  ];
}

describe("sc-jx-blocked-exit describes the world it stages", () => {
  it("NON-VACUITY: the detector fires on the exact sentence that was filed", () => {
    // Without this the rule below is one bad regex away from reporting every
    // lesson clean — the failure every „0 defects" instrument here had, and the
    // `\b`-on-Cyrillic trap this same wave hit in controller-bubble.test.ts.
    expect(
      "колоната след него стои и опашката ѝ е спряла на метър след отсрещното устие",
    ).toMatch(CLAIMS_A_QUEUE);
    expect("Влез в кръстовището едва след като колоната се е отлепила").toMatch(CLAIMS_A_QUEUE);
    // …and stays quiet on copy that names a single car.
    expect("колата пред теб е спряла на метър след отсрещното устие и не мърда").not.toMatch(
      CLAIMS_A_QUEUE,
    );
  });

  it("stages exactly the one stationary actor the copy may describe", () => {
    // The premise. If the drill ever DOES stage a column, the rule below must
    // relax with it rather than be deleted.
    const staged = spec().staged ?? [];
    expect(staged, "the block-the-box drill stages nothing to be blocked by").toHaveLength(1);
    expect(staged[0]!.kind).toBe("brakingLeadCar");
  });

  it("no drive-referring line promises a queue", () => {
    const offenders = driveReferringCopy().filter((c) => CLAIMS_A_QUEUE.test(c.text));
    expect(
      offenders.map((o) => `${o.where}: ${o.text.slice(0, 80)}…`),
      "the student is sent looking for traffic that is not staged",
    ).toEqual([]);
  });

  it("but the hazard is still NAMED — the fix must not have deleted it", () => {
    // The other direction. Silence about the stopped car would pass the test
    // above perfectly and leave the student with no reason to wait at a green.
    const brief = spec().instructionsBg.map((i) => i.textBg).join(" | ");
    expect(brief, "nothing tells him to look past the junction").toMatch(/ОТВЪД кръстовището/);
    expect(brief, "the stopped car is no longer described").toMatch(/спряла|не мърда/);
    expect(brief, "the missing room is no longer the reason").toMatch(/половин кола/);
  });
});
