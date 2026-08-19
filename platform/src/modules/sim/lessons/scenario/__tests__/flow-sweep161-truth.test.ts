/**
 * SWEEP 161 · the last never-edited criticals routed to the FLOW / PK /
 * JUNCTIONS2 template files — turned into rules rather than into edits.
 *
 * Seven BROKEN findings were filed against these five paths. THREE of them were
 * unopenable as filed and are recorded as such at the bottom of the lane report,
 * not here. Of the four that survived contact with the frames, two are closed by
 * this file and two are refutations — a briefing is not rewritten because a
 * frame looked empty, and a lesson is not "fixed" because a harness could not
 * drive it.
 *
 * ── 1. THE CERTIFICATE THE DISC CANNOT SIGN, ON THE ROW PE's WAVE MISSED ────
 *
 * `sc-za-clear` read «Премини пътеката, СЛЕД КАТО е свободна» over a bare
 * radius-12 disc at (4.06, 130) with no contract of any kind. `stepReachZone`
 * is handed (params, prev, tick) and no ObjectiveContext, so „was the crossing
 * empty of a person" is not a question it can be asked.
 *
 * This row is one of the seven the catalogue rule's own VOCABULARY let through.
 * `ACTOR_CLAIM` (lessons/__tests__/stop-claim-gates.test.ts) carries «когато е
 * свободна»; the flow and PE families write «след като е свободна»; the
 * alternation never met them. `pe-sweep161-truth.test.ts` closed its six and
 * named the gap in its own header — this is the flow row that stayed behind.
 *
 * MEASURED, not argued: the committed «Непропускане на пешеходец» recording,
 * driven through the production session (compileScenario → createLessonSession
 * → applyTick every frame), reported at L1 and at L3
 *
 *     ✓ Премини пътеката, след като е свободна   0:14.4  /  0:15.4
 *     ✗ PEDESTRIAN_NOT_YIELDED                   −10, опасна
 *
 * on ONE debrief. The car went over the zebra at a steady 27.9 км/ч with the
 * woman still on the carriageway. §1 holds the retitle in place with a matcher
 * that is self-tested against the wordings this family actually shipped.
 *
 * ── 2. THE NUMBER ON THE CARD THAT THE SAME DRILL BILLS ─────────────────────
 *
 * `sc-za-approach` was authored at 40 and the L1 ladder widened it to 45, so
 * `.audit-frames/sweep161/sc-zebra-approach/pc-right/01-arrival.png` carries
 * «Приближи пътеката с готовност за спиране — дръж под 45 км/ч» beside a
 * briefing that said «под 40 км/ч» — while `rules/engine.ts` bills
 * PEDESTRIAN_CROSSING_TOO_FAST above `crossingApproachMaxKmh` = 30 on an
 * occupied crossing. Four numbers, three of them wrong, and the one the student
 * was told to obey was the one that earned him ten points.
 *
 * §2 closes the half that is closable from here and books the half that is not.
 * CLOSED: the card. advisor.ts's authored-cap source already stopped the
 * ladder's grace reaching the glass, but nothing pinned it for this row, so §2
 * pins all five rungs to ONE number and pins the briefing to the same one —
 * because a card and a briefing that disagree mean one of them fails a student
 * who obeyed it. BOOKED: the cap itself. 40 → 30 was applied and measured
 * green — no committed drive changes verdict, since the too-fast demo brakes to
 * rest inside the disc and re-earns the latch either way — and then reverted,
 * because it turns five stale literals red in two files this lane does not own.
 * `CAP_ABOVE_LAW_KNOWN_OPEN` carries it with its measurements and the exact
 * file:line list, in the same debt-with-a-name mold PE uses for its five, and a
 * paid debt is forced to lose its entry.
 *
 * ── 3. THE DUTY THAT IS NOT ON THE SIGN ─────────────────────────────────────
 *
 * `sc-roundabout-entry`'s instruction 3 read «СПРИ на линията и пропусни всяка
 * кола, която вече е в кръга» — an unconditional halt, on an approach that
 * cannot carry the sign which demands one. §3 asks the DISTRICT rather than
 * taste: `builders/network.ts junctionPriorityControls` short-circuits on a
 * roundabout node and can only ever return "giveWay" for a non-ring arm, so a
 * Б2 at a roundabout entry is unconstructible in this product. The same
 * sentence stays legal on a Б2 map, which is what makes this a rule.
 *
 * ── 4. AND TWO REFUSALS TO REWRITE ──────────────────────────────────────────
 *
 * The sweep filed `sc-pk-driveway` and `sc-junction-blind` as „the lesson's own
 * CORRECT line is not survivable — 20 наказателни точки, НЕИЗДЪРЖАН on both
 * platforms". Both debriefs are real (08-debrief.png), and neither is the
 * lesson's correct line. `tools/mobile/lesson-audit.mjs`'s `right` drive is a
 * forward-only control law — hold throttle, cap at CRUISE_KMH, creep-and-stop —
 * that never selects reverse and never completes a turn:
 *   · sc-pk-driveway's task 2 chip says «Премести лоста на R и паркирай на
 *     заден ход» (04-t028s.png) and the drive was still in D; by 04-t028s the
 *     car is nose-first into a building wall.
 *   · sc-junction-blind needs a LEFT turn out of a T; frames 04-t101s through
 *     04-t209s show the car standing in an empty green field off the network.
 * §4 measures the real correct line instead — every committed shadow through
 * the production session — so the refutation is a number and not an opinion,
 * and so a future regression in these two files fails HERE rather than being
 * rediscovered by a phone.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertDistrict } from "../../../world";
import { junctionPriorityControls } from "../../../world/builders/network";
import { DEFAULT_RULE_CONFIG } from "../../../rules";
import { recordScZebraApproachDrive } from "../../../traces/scZebraApproach";
import { recordScRoundaboutEntryDrive } from "../../../traces/scRoundaboutEntry";
import { recordScLaneChangeDrive } from "../../../traces/scLaneChange";
import { recordScPkDrivewayDrive } from "../../../traces/scPkDriveway";
import { recordScJunction2Drive } from "../../../traces/scJunctions2";
import { advisorPromptForObjective } from "../../advisor";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { compileScenario } from "../compile";
import {
  SCENARIO_TEMPLATES_FLOW,
  SC_LANE_CHANGE,
  SC_ROUNDABOUT_ENTRY,
  SC_ZEBRA_APPROACH,
} from "../templates-flow";
import { SCENARIO_TEMPLATES_JUNCTIONS2, SC_JUNCTION_BLIND } from "../templates-junctions2";
import { SCENARIO_TEMPLATES_PK, SC_PK_DRIVEWAY } from "../templates-pk";
import type { RecordedDrive } from "../../../traces/recorder";
import type { ScenarioLevel, ScenarioSpec } from "../types";

const REPO = path.resolve(process.cwd(), "..");
const district = (id: string): unknown =>
  JSON.parse(readFileSync(path.join(REPO, "content", "world", `${id}.json`), "utf-8")) as unknown;

/** The three files this lane owns, as one corpus — every rule below is a
 *  catalogue rule over it, never a restatement of one row's new value. */
const OWNED: readonly ScenarioSpec[] = [
  ...SCENARIO_TEMPLATES_FLOW,
  ...SCENARIO_TEMPLATES_PK,
  ...SCENARIO_TEMPLATES_JUNCTIONS2,
];

interface ZoneRow {
  specId: string;
  objectiveId: string;
  titleBg: string;
  maxSpeedKmh?: number;
}

function reachZones(specs: readonly ScenarioSpec[]): ZoneRow[] {
  const out: ZoneRow[] = [];
  for (const spec of specs) {
    for (const o of spec.success) {
      const p = o.params as { kind: string; maxSpeedKmh?: number };
      if (p.kind !== "reachZone") continue;
      out.push({
        specId: spec.id,
        objectiveId: o.id,
        titleBg: o.titleBg,
        maxSpeedKmh: p.maxSpeedKmh,
      });
    }
  }
  return out;
}

// ===========================================================================
// 1 · no gate in these files certifies another road user
// ===========================================================================

/**
 * Byte-identical to `pe-sweep161-truth.test.ts`'s `CLEAR_CLAIM` plus the
 * catalogue's «пропусни / изчакай …» stems, because the class is one class and
 * two matchers that drift are how this row survived seven rounds. A title may
 * NAME an actor or a crossing as scenery — «Приближи пътеката с готовност за
 * спиране» promises a SPEED, and the speed is exactly what the cap measures.
 * What it may not do is certify that the other party was let through, waited
 * out, or off the road.
 */
const ACTOR_OR_CLEAR_CLAIM =
  /(?:когато|след\s+като|щом)\s+(?:\p{L}+\s+)?(?:е\s+)?(?:свободн|освободи)|слязъл\s+от|освободи\p{L}*\s+(?:цялото\s+)?платно|пропусни|изчакай\s+(?:колата|детето|пешеходеца|пешеходците|велосипедиста|камиона)/iu;

describe("1 · an owned gate claims only what its disc measures", () => {
  it("the matcher has teeth — every wording these three files shipped, and the honest neighbours", () => {
    // The row this lane retired, verbatim off the pre-fix file…
    expect(ACTOR_OR_CLEAR_CLAIM.test("Премини пътеката, след като е свободна")).toBe(true);
    // …and the sibling wordings the same class wears elsewhere, so a future
    // edit cannot slip back in through a synonym.
    expect(ACTOR_OR_CLEAR_CLAIM.test("Премини пътеката, когато е свободна")).toBe(true);
    expect(ACTOR_OR_CLEAR_CLAIM.test("Потегли чак когато е слязъл от цялото платно")).toBe(true);
    expect(ACTOR_OR_CLEAR_CLAIM.test("Пропусни колата с предимство и завий")).toBe(true);
    expect(ACTOR_OR_CLEAR_CLAIM.test("Изчакай колата в съседната лента")).toBe(true);
    // A matcher that caught everything would be just as useless as one that
    // caught nothing. These are the honest rows these files actually carry.
    expect(ACTOR_OR_CLEAR_CLAIM.test("Подмини пътеката и продължи по улицата")).toBe(false);
    expect(ACTOR_OR_CLEAR_CLAIM.test("Приближи пътеката с готовност за спиране")).toBe(false);
    expect(ACTOR_OR_CLEAR_CLAIM.test("Приближи кръга с готовност за спиране")).toBe(false);
    expect(ACTOR_OR_CLEAR_CLAIM.test("Завий наляво и излез от кръстовището на запад")).toBe(false);
    expect(
      ACTOR_OR_CLEAR_CLAIM.test("Задача 1: спри в изходната позиция покрай входа на алеята"),
    ).toBe(false);
  });

  it("no reachZone row in flow / pk / junctions2 certifies another road user", () => {
    const offenders = reachZones(OWNED)
      .filter((z) => ACTOR_OR_CLEAR_CLAIM.test(z.titleBg))
      .map((z) => `${z.specId}/${z.objectiveId} — "${z.titleBg}"`);
    expect(
      offenders,
      `${offenders.length} disc(s) certify a fact no field of SimTick carries into stepReachZone`,
    ).toEqual([]);
  });

  it("the retitle moved no params — sc-za-clear is still the same plain disc", () => {
    // The whole remedy is that `done` stays bit-identical on every committed
    // drive. A later pass that „strengthens" this row by bolting a cap on would
    // be inventing a speed contract nobody was told about, in the same breath
    // as this rule — the mistake pe-sweep161-truth.test.ts spells out for its
    // own seven.
    const row = SC_ZEBRA_APPROACH.success.find((o) => o.id === "sc-za-clear")!;
    expect(row.titleBg).toBe("Подмини пътеката и продължи по улицата");
    expect(row.params).toEqual({ kind: "reachZone", x: 4.06, y: 130, radiusM: 12 });
  });

  it("…and the duty it stopped certifying is still TAUGHT and still GRADED", () => {
    // Stop certifying is not stop teaching. The briefing keeps the real duty,
    // the mistake demo keeps its name, and the rule engine keeps the code — so
    // this is a narrowed claim, never a dropped one.
    expect(SC_ZEBRA_APPROACH.instructionsBg.some((s) => /щом пътеката е свободна/.test(s.textBg))).toBe(
      true,
    );
    expect(SC_ZEBRA_APPROACH.mistakes.some((m) => m.codeRefs.includes("PEDESTRIAN_NOT_YIELDED"))).toBe(
      true,
    );
    const drive = recordScZebraApproachDrive(district("zb-v1"), "mistake-not-yielded");
    const codes = drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toContain("PEDESTRIAN_NOT_YIELDED");
  });
});

// ===========================================================================
// 2 · the approach card, the number it speaks, and the debt it still carries
// ===========================================================================

/**
 * Crossing gates in these three files that still sit ABOVE the rule engine's
 * own `crossingApproachMaxKmh`. Same contract as `pe-sweep161-truth.test.ts`'s
 * `CAP_ABOVE_LAW_KNOWN_OPEN`, which carries five of these for the PE family:
 * A DEBT WITH A NAME, NEVER A PERMISSION. The entry carries what the next lane
 * needs so its afternoon starts from measurements — including, for this one,
 * the reason the fix was applied, measured green, and then taken back out.
 */
const CAP_ABOVE_LAW_KNOWN_OPEN: ReadonlyArray<{
  specId: string;
  objectiveId: string;
  capKmh: number;
  why: string;
}> = [
  {
    specId: "sc-zebra-approach",
    objectiveId: "sc-za-approach",
    capKmh: 40,
    why:
      "40 (45 after the L1 ladder) over чл. 119's 30. MEASURED: 40 → 30 is safe on every " +
      "committed drive — shadow-correct peaks 27.9 км/ч inside the disc and still passes, " +
      "mistake-not-yielded peaks 27.9 and still passes (its fault is the crossing, not the " +
      "approach), and mistake-too-fast peaks 44.9 and TICKS THIS ROW AT 30 EXACTLY AS AT 40 " +
      "(it brakes to rest inside the disc and re-earns the latch — objectives.ts " +
      "REACH_ZONE_CAP_SLACK_KMH, deliberate). So the move changes no verdict on any drive, " +
      "only the card. It was applied, measured green, and REVERTED because it turns five " +
      "stale literals red in two files this lane does not own, both using this row as their " +
      "fixture: lessons/__tests__/advisor-authored-cap.test.ts:325,326,348,361,362 and " +
      "scenario/__tests__/briefing-card-budget.test.ts:167. Pay all three together.",
  },
];

describe("2 · the approach card, the number it speaks, and the debt it carries", () => {
  const LAW = DEFAULT_RULE_CONFIG.crossingApproachMaxKmh;
  const approach = SC_ZEBRA_APPROACH.success.find((o) => o.id === "sc-za-approach")!;
  const cap = (approach.params as { maxSpeedKmh: number }).maxSpeedKmh;

  it("THE CLOSURE: the card speaks ONE number, at every rung, and it is the author's", () => {
    // This is the finding as filed, and the whole of it. pc-right/01-arrival.png
    // shows the briefing saying «под 40 км/ч» and the task card beside it saying
    // «— дръж под 45 км/ч», because the L1 ladder's grace was being printed at
    // the student as an instruction. advisor.ts's authored-cap source fixed the
    // mechanism; nothing pinned it FOR THIS ROW, and an unpinned fix is one
    // rung's edit from coming back. advisorPromptForObjective is fed here
    // exactly as the HUD feeds it.
    const spoken = new Set<number>();
    for (const rung of SC_ZEBRA_APPROACH.levels) {
      const lesson = compileScenario(SC_ZEBRA_APPROACH, rung.level as ScenarioLevel);
      const o = lesson.objectives.find((x) => x.id === "sc-za-approach")!;
      const p = o.params as { maxSpeedKmh: number; authoredMaxSpeedKmh?: number };
      const textBg = advisorPromptForObjective(
        o.titleBg,
        { kind: "reachZone", x: 0, y: 0, radiusM: 1, maxSpeedKmh: p.maxSpeedKmh },
        undefined,
        lesson.postedLimitKmh,
        p.authoredMaxSpeedKmh,
      ).textBg;
      const m = /дръж под (\d+(?:[.,]\d+)?) км\/ч/.exec(textBg);
      expect(m, `${lesson.id} card says no number: "${textBg}"`).not.toBeNull();
      spoken.add(Number(m![1].replace(",", ".")));
    }
    // One number across all five rungs — the ladder's grace never reaches the
    // glass — and it is the figure the template authored, not the widened gate.
    expect([...spoken], "the card varies with the rung's grace again").toEqual([cap]);
  });

  it("…and the BRIEFING states that same number, so obeying the card cannot fail the task", () => {
    // The counter-direction, and the one the founder actually lived: a card and
    // a briefing that disagree mean one of them fails a student who obeyed it.
    const numbered = SC_ZEBRA_APPROACH.instructionsBg
      .map((s) => /под (\d+) км\/ч/.exec(s.textBg))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => Number(m[1]));
    expect(numbered, "instruction 1 must state the approach speed").not.toEqual([]);
    for (const n of numbered) expect(n).toBeLessThanOrEqual(cap);
  });

  it("the TAUGHT line clears the LAW with room — so paying the debt stays safe", () => {
    // Measured off the committed recording rather than assumed: peak |speed|
    // anywhere inside the authored disc. Held against the LAW and not against
    // the cap, because it is the number the debt will move to — the day this
    // stops being true, paying the debt would become a false refusal and the
    // ledger entry above must be re-argued rather than executed.
    const { x, y, radiusM } = approach.params as { x: number; y: number; radiusM: number };
    const drive = recordScZebraApproachDrive(district("zb-v1"), "shadow-correct");
    const inside = drive.trace.samples.filter((s) => Math.hypot(s.x - x, s.y - y) <= radiusM);
    expect(inside.length).toBeGreaterThan(0);
    const peak = Math.max(...inside.map((s) => Math.abs(s.speedKmh)));
    expect(peak).toBeLessThan(28); // 27.9 measured
    expect(peak, "the taught drive no longer clears чл. 119's own threshold").toBeLessThan(LAW);
    // And it stays a SLOW-DOWN gate, not a disguised halt: at or below the halt
    // band the evaluator's grace capsule changes character entirely.
    expect(cap).toBeGreaterThan(10);
  });

  it("every over-the-law crossing cap in these three files is a NAMED debt", () => {
    // The catalogue form, so a NEW crossing gate cannot land above the law
    // quietly. Scoped by the concept the template itself declares, never by a
    // hand-kept id list.
    expect(LAW).toBe(30);
    const open = new Set(CAP_ABOVE_LAW_KNOWN_OPEN.map((k) => `${k.specId}/${k.objectiveId}`));
    const crossing = OWNED.filter((s) => s.conceptIds.includes("c-crosswalk-yield"));
    const offenders = reachZones(crossing)
      .filter((z) => z.maxSpeedKmh !== undefined && z.maxSpeedKmh > LAW)
      .filter((z) => !open.has(`${z.specId}/${z.objectiveId}`))
      .map((z) => `${z.specId}/${z.objectiveId} caps ${z.maxSpeedKmh} over чл. 119's ${LAW}`);
    expect(offenders).toEqual([]);
  });

  it("…and a PAID debt must lose its entry — the ledger cannot go stale quietly", () => {
    // The half that keeps the list from becoming a permission: the day the cap
    // moves to 30, this is what makes deleting the entry compulsory.
    const rows = reachZones(OWNED);
    const stale = CAP_ABOVE_LAW_KNOWN_OPEN.filter((k) => {
      const row = rows.find((z) => z.specId === k.specId && z.objectiveId === k.objectiveId);
      return row === undefined || row.maxSpeedKmh === undefined || row.maxSpeedKmh <= LAW;
    }).map((k) => `${k.specId}/${k.objectiveId} is paid — delete its entry`);
    expect(stale).toEqual([]);
    // And the entry's own figure may not drift from the file it names.
    for (const k of CAP_ABOVE_LAW_KNOWN_OPEN) {
      const row = rows.find((z) => z.specId === k.specId && z.objectiveId === k.objectiveId)!;
      expect(row.maxSpeedKmh, `${k.objectiveId}'s ledger figure is stale`).toBe(k.capKmh);
    }
  });
});

// ===========================================================================
// 3 · the roundabout entry may not command a halt its sign cannot demand
// ===========================================================================

describe("3 · the Б1 duty, asked of the district and not of taste", () => {
  /** The imperative «спри», as a whole word — the catalogue's own matcher
   *  (stop-claim-gates.test.ts HALT_CLAIM). JS `\b` is ASCII-only, so the
   *  boundaries are spelled in Unicode classes: «готовност за спиране» and
   *  «пълно спиране» talk ABOUT stopping without demanding one. */
  const HALT_ORDER = /(?:^|[^\p{L}])[Сс]при(?![\p{L}])/u;

  it("the matcher separates an order from a description", () => {
    expect(HALT_ORDER.test("Спри на линията и пропусни всяка кола")).toBe(true);
    expect(HALT_ORDER.test("Пропусни всяка кола — спри на линията, ако няма пролука")).toBe(true);
    expect(HALT_ORDER.test("Приближи кръга с готовност за спиране")).toBe(false);
    expect(HALT_ORDER.test("дори това да значи пълно спиране на входа")).toBe(false);
  });

  it("no roundabout arm in this product can wear a Б2 — so no map can make «спри» true", () => {
    // The rule, read off the builder both the painted sign and the graded
    // obligation share. A roundabout node short-circuits before the rank test
    // that is the ONLY path to "stopSign".
    const arms = [
      { edgeId: "arm", class: "residential", roundabout: false, incoming: true },
      { edgeId: "ring-in", class: "unclassified", roundabout: true, incoming: true },
      { edgeId: "ring-out", class: "unclassified", roundabout: true, incoming: false },
    ];
    expect(junctionPriorityControls(arms).get("arm")).toBe("giveWay");
    // MUTATION: the same three arms with the roundabout flag cleared and the
    // arm outranked by a primary DO produce a Б2 — so the assertion above is
    // about roundabouts and not about a function that only ever says one thing.
    const plainT = [
      { edgeId: "arm", class: "residential", roundabout: false, incoming: true },
      { edgeId: "main-in", class: "primary", roundabout: false, incoming: true },
      { edgeId: "main-out", class: "primary", roundabout: false, incoming: false },
    ];
    expect(junctionPriorityControls(plainT).get("arm")).toBe("stopSign");
  });

  it("…and the shipped roundabout district agrees — its own arms are give-way", () => {
    const raw = assertDistrict(district(SC_ROUNDABOUT_ENTRY.map.districtId));
    const d = raw as unknown as {
      roads: { edges: { id: string; from: string; to: string; class: string; roundabout: boolean }[] };
      intersections: { id: string }[];
    };
    const nodes = new Set(d.intersections.map((n) => n.id));
    let armsChecked = 0;
    for (const node of nodes) {
      const at = d.roads.edges
        .filter((e) => e.from === node || e.to === node)
        .map((e) => ({
          edgeId: e.id,
          class: e.class,
          roundabout: e.roundabout,
          incoming: e.to === node,
        }));
      for (const [edgeId, control] of junctionPriorityControls(at)) {
        expect(control, `${edgeId} at ${node}`).toBe("giveWay");
        armsChecked++;
      }
    }
    expect(armsChecked, "the mini roundabout has four give-way arms").toBe(4);
  });

  it("the briefing orders a halt only as a CONDITION, never as the rule", () => {
    const step = SC_ROUNDABOUT_ENTRY.instructionsBg.find((s) => HALT_ORDER.test(s.textBg));
    expect(step, "the entry drill must still tell him when a stop IS required").toBeDefined();
    expect(
      /ако|когато|щом|при нужда/.test(step!.textBg),
      `unconditional halt order on a Б1 approach: "${step!.textBg}"`,
    ).toBe(true);
  });

  it("…and the YIELD it is built on is untouched and still convicted", () => {
    // Never answer a false duty by deleting the true one. The obligation stays
    // verbatim in the copy AND keeps its grader in the roundabout tracker.
    expect(
      SC_ROUNDABOUT_ENTRY.instructionsBg.some((s) =>
        /пропусни всяка кола, която вече е в кръга/i.test(s.textBg),
      ),
    ).toBe(true);
    const barge = recordScRoundaboutEntryDrive(
      district(SC_ROUNDABOUT_ENTRY.map.districtId),
      "mistake-barge-entry",
    );
    expect(
      barge.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code),
    ).toContain("FAILED_TO_YIELD");
  });

  it("the sign the briefing NAMES is the sign the world builds", () => {
    // Instruction 1 says „знака „Пропусни движението"" — Б1. It stays only
    // because the world really posts one; this is the same claim/world question
    // `lane-world-claims.test.ts` §5 refuted the sweep's „no such sign" with,
    // asked here from the copy's side so the two cannot drift.
    expect(
      SC_ROUNDABOUT_ENTRY.instructionsBg.some((s) => /Пропусни движението/.test(s.textBg)),
    ).toBe(true);
    expect(
      SC_ROUNDABOUT_ENTRY.instructionsBg.some((s) => /„Стоп|Б2/.test(s.textBg)),
      "a Б2 named on an approach that cannot carry one",
    ).toBe(false);
  });
});

// ===========================================================================
// 4 · the two „unsurvivable" lessons, driven on their own correct line
// ===========================================================================

/** The recorder feeds every production frame straight into the session — the
 *  same shape s2-flow-bot-completion.test.ts uses, so a drive that passes here
 *  passed the pipeline a phone runs. */
type OnTick = (tick: Parameters<typeof applyTick>[1]) => void;

interface Outcome {
  passed: boolean;
  score: number;
  objectives: { id: string; done: boolean }[];
  violations: string[];
}

function driveThrough(
  spec: ScenarioSpec,
  level: ScenarioLevel,
  record: (onTick: OnTick) => RecordedDrive,
): Outcome {
  const lesson = compileScenario(spec, level);
  let session = createLessonSession(lesson);
  const drive = record((tick) => {
    session = applyTick(session, tick).state;
  });
  const result = buildLessonResult(session);
  return {
    passed: result.passed,
    score: result.score,
    objectives: result.objectives.map((o) => ({ id: o.id, done: o.done })),
    violations: drive.ruleEvents
      .filter((e) => e.kind === "violation")
      .map((e) => e.code as string),
  };
}

describe("4 · the model line of every owned template survives, on every rung", () => {
  const CASES: Array<{
    spec: ScenarioSpec;
    record: (onTick: OnTick) => RecordedDrive;
  }> = [
    {
      spec: SC_ZEBRA_APPROACH,
      record: (onTick) =>
        recordScZebraApproachDrive(district("zb-v1"), "shadow-correct", { onTick }),
    },
    {
      spec: SC_ROUNDABOUT_ENTRY,
      record: (onTick) =>
        recordScRoundaboutEntryDrive(district("rb-mini-v1"), "shadow-correct", { onTick }),
    },
    {
      spec: SC_LANE_CHANGE,
      record: (onTick) =>
        recordScLaneChangeDrive(district("ln-v1"), "shadow-correct", { onTick }),
    },
    {
      // sweep161 filed this one CRITICAL: «20 наказателни точки · НЕИЗДЪРЖАН,
      // Опасни грешки 2» on the RIGHT column, both platforms. The debrief is
      // real; the drive behind it is not the model line — the harness held D
      // through a task whose own chip reads «Премести лоста на R».
      spec: SC_PK_DRIVEWAY,
      record: (onTick) =>
        recordScPkDrivewayDrive(district("pk-drive-v1"), "shadow-correct", { onTick }),
    },
    {
      // …and this one for «Непропускане на ППС с предимство» + «ПТП» on the
      // right column. Frames 04-t101s…04-t209s show the car parked in an empty
      // field: the forward-only control law never took the T's left turn.
      spec: SC_JUNCTION_BLIND,
      record: (onTick) =>
        recordScJunction2Drive(district("tj-occluded-v1"), "sc-junction-blind", "shadow-correct", {
          onTick,
        }),
    },
  ];

  for (const { spec, record } of CASES) {
    for (const rung of spec.levels) {
      it(`${spec.id}@L${rung.level}: zero violations, every objective ticked, ИЗДЪРЖАН`, () => {
        const out = driveThrough(spec, rung.level as ScenarioLevel, record);
        expect(out.violations, `${spec.id}@L${rung.level} convicted its own model line`).toEqual([]);
        expect(out.objectives.filter((o) => !o.done).map((o) => o.id)).toEqual([]);
        expect(out.score).toBe(0);
        expect(out.passed).toBe(true);
      });
    }
  }

  it("the pass is not vacuous — the mistake demos are still convicted and still refused", () => {
    // A suite that only ever drives the good line would go green if grading
    // stopped altogether. Each counter-proof rides the identical pipeline.
    const tooFast = driveThrough(
      SC_ZEBRA_APPROACH,
      3,
      (onTick) => recordScZebraApproachDrive(district("zb-v1"), "mistake-too-fast", { onTick }),
    );
    expect(tooFast.violations).toContain("PEDESTRIAN_CROSSING_TOO_FAST");
    expect(tooFast.passed).toBe(false);

    const notYielded = driveThrough(
      SC_ZEBRA_APPROACH,
      3,
      (onTick) =>
        recordScZebraApproachDrive(district("zb-v1"), "mistake-not-yielded", { onTick }),
    );
    expect(notYielded.violations).toContain("PEDESTRIAN_NOT_YIELDED");
    expect(notYielded.passed).toBe(false);

    const noSignal = driveThrough(
      SC_ROUNDABOUT_ENTRY,
      3,
      (onTick) =>
        recordScRoundaboutEntryDrive(district("rb-mini-v1"), "mistake-exit-no-signal", {
          onTick,
        }),
    );
    expect(noSignal.violations).toContain("TURN_WITHOUT_INDICATOR");
    expect(noSignal.objectives.find((o) => o.id === "sc-rb-ring")!.done).toBe(false);

    const blindNoLook = driveThrough(
      SC_JUNCTION_BLIND,
      3,
      (onTick) =>
        recordScJunction2Drive(district("tj-occluded-v1"), "sc-junction-blind", "mistake-no-look", {
          onTick,
        }),
    );
    expect(blindNoLook.violations).toContain("COLLISION");
    expect(blindNoLook.passed).toBe(false);

    const pkDeep = driveThrough(
      SC_PK_DRIVEWAY,
      3,
      (onTick) => recordScPkDrivewayDrive(district("pk-drive-v1"), "mistake-deep", { onTick }),
    );
    expect(pkDeep.violations).toContain("COLLISION");
    expect(pkDeep.passed).toBe(false);
  });
});
