/**
 * PE2 — the sweep161 COPY-TRUTH battery for `templates-pe2.ts`.
 *
 * Three BROKEN rows of `.audit-frames/sweep161` land on this file, and all
 * three are the same species: a sentence the product SHOWS the student that is
 * not true of the run he is in. None of them is a grading bug, which is
 * precisely why nothing in the suite caught them — every gate, detector and bot
 * drive was green while the glass said something else.
 *
 *   C1  RUNG LEAK      sc-pe-parked-row-scan/pc-right/01-arrival and
 *                      sc-pe-school-patrol — «(ниво 5)» inside a step of
 *                      `instructionsBg`, a field compileScenario copies BYTE FOR
 *                      BYTE onto all five rungs. False on four of them; on the
 *                      fifth the compiler has already printed the rung itself.
 *   C2  DAYLIGHT LIE   the same step graded «в здрач и нощем» on a Ниво 1 run
 *                      photographed under a blue sky — a condition the world
 *                      cannot exercise.
 *   C3  PRESENT FACT   sc-pe-zone-living/pc-right/04-t090s..t100s — ЗАДАЧА 2/5
 *                      «Спри пред ХОРАТА на платното» over three frames with
 *                      both walkers still behind the railing on the far
 *                      footway; they stepped onto the tarmac at t105s.
 *
 * TWO MORE OF THE SAME SPECIES landed in the wave-c re-drive, and both are
 * settled by MEASURING THE BUILT WORLD rather than by reading the sentence:
 *
 *   C4  DENIED FEATURE sc-pe-zone-living/mobile-right/04-t102s (wave-c) —
 *                      briefing step 3 read «Вътре няма пешеходни пътеки»
 *                      while an А18 „Пешеходна пътека" triangle stood on its
 *                      own post inside the zone, plainly in frame.
 *                      `buildWorldGeometry` says pe-zone-v1 posts TWO of them
 *                      (props.ts places А18 for every authored crossing on a
 *                      scenario map and never consults `crossing.kind`, so the
 *                      deliberately `unmarked` pz-x-1 gets a triangle anyway).
 *                      The copy half is: чл. 62 grants the pedestrian the
 *                      WHOLE carriageway, it does not abolish crossings, so the
 *                      absolute was never the law either.
 *                      THE WORLD HALF LANDED 2026-09-02 (it read „reported, not
 *                      this lane's file" until then): the А18 loop now asks
 *                      `paintsZebra`, so pe-zone-v1 posts none — and the зона it
 *                      never stated is stated, Д15 at each entry and Д16 at each
 *                      exit (ЗДвП чл. 61). C4's two measurements moved with it;
 *                      see the comments at each expectation.
 *   C5  PHANTOM PLATE  sc-pe-night-unlit — briefing step 2 read «Знакът
 *                      разрешава 50» on pe-dart-v1, a district whose built sign
 *                      set is {pedestrianCrossing 1, noOvertaking 1}: ZERO speed
 *                      plates. The 50 is the built-up-area default, not a plate,
 *                      and the step told the student to read one that is not
 *                      there — the sc-pe-zone-living/39d7ae90 complaint («the
 *                      interface says the sign is in force») in briefing form.
 *
 * AND ONE RULE POINTS THE OTHER WAY, because measuring the world refuted a row
 * instead of confirming it:
 *
 *   C6  TRUE CLAUSE    the same re-drive says «Nothing anywhere narrows, so
 *                      „стеснението между жилищните блокове" has no referent».
 *                      `edgeHalfWidth` says pe-zone-v1 goes 24.25 m → 16.25 m →
 *                      24.25 m kerb-to-kerb across the two zone boundaries: the
 *                      arterial parking band exists on `tertiary` and not on
 *                      `residential`. The clause is a measurement, and this lane
 *                      came within one edit of deleting it. C6 pins the 8 m so
 *                      the next repair has to go red before it can drop it.
 *
 * EVERY RULE HERE HAS TEETH IN BOTH DIRECTIONS, because a matcher that quietly
 * stops matching turns a census vacuously green (the lesson `stop-claim-gates`
 * paid for). Each matcher is asserted against the exact string it retired AND
 * against the string that replaced it, and each rule is asserted to SPARE a
 * shipped row that legitimately uses the same words. C4 and C5 go further: the
 * retired sentence is fed back through the SAME predicate against the SAME
 * built district and must come out an offender, so neither census can be green
 * because it stopped looking.
 *
 * SCOPE. `SCENARIO_TEMPLATES_PE2` only. `templates-vru2.ts` carries three more
 * «(ниво 5)» steps (sc-vu-blindspot-moto, sc-vu-door-zone, sc-vu-bikelane-turn)
 * and is another lane's file — reported, not touched, and deliberately outside
 * this census so this battery cannot turn that lane red.
 *
 * C4/C5 SCOPE IS `instructionsBg`, the live briefing — the array
 * `LessonPlayShell` puts on the glass beside the drive, which is what every
 * frame in the two rows photographs. `teach.whenBg` deliberately stays out:
 * «Няма тротоар, няма пътеки, коли са паркирани от двете страни» there is
 * reportage about Студентски град and „Дружба", introduced as such, not a claim
 * about the street under the wheels.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PedestrianDartOutSpec } from "../../../contracts";
import { buildWorldGeometry } from "../../../world/builders/buildWorldGeometry";
import { edgeHalfWidth } from "../../../world/builders/network";
import { assertDistrict, type SignKind } from "../../../world/types";
import { parseObjectiveParams } from "../../objectives";
import { compileScenario } from "../compile";
import { SC_PE_ZONE_LIVING, SCENARIO_TEMPLATES_PE2 } from "../templates-pe2";
import type { ScenarioLevel, ScenarioSpec } from "../types";

const RUNGS: readonly ScenarioLevel[] = [1, 2, 3, 4, 5];

// ---------------------------------------------------------------------------
// The built world — the only witness that can settle a claim about signs
// ---------------------------------------------------------------------------

const REPO = path.resolve(process.cwd(), "..");

/** Signs the shipped builders actually PUT IN THE SCENE for a district, by
 *  kind. Built once per district — `buildWorldGeometry` is the same call
 *  `LessonScene` makes, so this is what the student's frame contains. */
const signCensusCache = new Map<string, Record<string, number>>();
function signsBuiltFor(districtId: string): Record<string, number> {
  const hit = signCensusCache.get(districtId);
  if (hit) return hit;
  const district = assertDistrict(
    JSON.parse(readFileSync(path.join(REPO, "content", "world", `${districtId}.json`), "utf-8")),
  );
  const world = buildWorldGeometry(district, { seed: 7 });
  const by: Record<string, number> = {};
  for (const s of world.signs) by[s.kind] = (by[s.kind] ?? 0) + 1;
  // `zebraCrossings` is markings.ts's own count of PAINTED crossings — the
  // other half of "is there a пешеходна пътека here", and the half `kind:
  // "unmarked"` actually governs.
  by.__zebraPaint = world.stats.zebraCrossings;
  signCensusCache.set(districtId, by);
  return by;
}

/** Every В26 face the kit can post, i.e. "a plate stating a number". */
function speedPlatesBuilt(districtId: string): number {
  const by = signsBuiltFor(districtId);
  return Object.entries(by)
    .filter(([kind]) => /^limit\d+$/.test(kind))
    .reduce((n, [, count]) => n + count, 0);
}

function crossingSignsBuilt(districtId: string): number {
  const by = signsBuiltFor(districtId);
  return (by["pedestrianCrossing" satisfies SignKind] ?? 0) + by.__zebraPaint;
}

/** The offenders a rule finds, given the steps it is applied to. Both C4 and
 *  C5 call THIS, and both re-run it on the retired sentence — a predicate that
 *  is only ever asked about the shipped copy cannot be shown to work. */
function offendersOf(
  specs: readonly ScenarioSpec[],
  matches: (text: string) => boolean,
  worldContradicts: (districtId: string) => boolean,
  stepsOf: (spec: ScenarioSpec) => readonly { n: number; textBg: string }[] = (s) =>
    s.instructionsBg,
): string[] {
  return specs.flatMap((spec) =>
    stepsOf(spec)
      .filter((s) => matches(s.textBg) && worldContradicts(spec.map.districtId))
      .map((s) => `${spec.id} step ${s.n} — "${s.textBg}"`),
  );
}

// ---------------------------------------------------------------------------
// C1 — the rung number is the COMPILER's to say, never a step's
// ---------------------------------------------------------------------------

/** «ниво 5», «Ниво 1 — …» — a rung named in words. */
const RUNG_LEAK = /ниво\s*\d/iu;

describe("C1 — no instruction step names a level rung", () => {
  it("the matcher has teeth: it catches the retired parentheticals and spares their replacements", () => {
    expect(RUNG_LEAK.test("в здрач и нощем (ниво 5) късите светлини се включват ПРЕДИ")).toBe(true);
    expect(RUNG_LEAK.test("Вали ли (ниво 5), включи късите светлини още преди да тръгнеш")).toBe(
      true,
    );
    expect(RUNG_LEAK.test("стъмни ли се, късите се включват ПРЕДИ да ти потрябват")).toBe(false);
    expect(RUNG_LEAK.test("Вали ли, включи късите светлини още преди да тръгнеш")).toBe(false);
  });

  it("THE REASON THE RULE EXISTS: instructionsBg is rung-invariant by construction", () => {
    // If the compiler swapped copy per rung, «(ниво 5)» would merely be
    // redundant on one rung instead of false on four — so this is the fact the
    // whole guard rests on, and it is asserted rather than assumed.
    for (const spec of SCENARIO_TEMPLATES_PE2) {
      const authored = spec.instructionsBg.map((s) => s.textBg);
      for (const level of RUNGS) {
        const shown = (compileScenario(spec, level).briefingBg ?? []).map((s) => s.textBg);
        // The only rung-varying line is the complication step the compiler
        // PREPENDS, so the authored steps are always the tail, unchanged.
        expect(shown.slice(shown.length - authored.length), `${spec.id}@L${level}`).toEqual(
          authored,
        );
      }
    }
  });

  it("…and the compiler already owns the job — some rung of this family says «Ниво N» itself", () => {
    // The load-bearing half of C1: the parenthetical was not just wrong on four
    // rungs, it was REDUNDANT on the fifth. If this ever goes false the
    // complication kit has stopped announcing the rung and the guard above
    // would be forbidding the only place the rung is ever named.
    const compilerSaysRung = SCENARIO_TEMPLATES_PE2.some((spec) =>
      RUNGS.some((level) =>
        (compileScenario(spec, level).briefingBg ?? []).some((s) => RUNG_LEAK.test(s.textBg)),
      ),
    );
    expect(compilerSaysRung).toBe(true);
  });

  it("the census: not one authored step in templates-pe2.ts names a rung", () => {
    const offenders = SCENARIO_TEMPLATES_PE2.flatMap((spec) =>
      spec.instructionsBg
        .filter((s) => RUNG_LEAK.test(s.textBg))
        .map((s) => `${spec.id} step ${s.n} — "${s.textBg}"`),
    );
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// C2 — darkness may be ASSERTED only by a template that is dark on every rung
// ---------------------------------------------------------------------------

/**
 * Darkness stated as a fact about THIS run. The conditional forms («стъмни ли
 * се», «вали ли») are deliberately outside it: they are true whatever the rung
 * serves, which is exactly why they are the repair.
 */
const DARK_ASSERTION = /в здрач|нощем|по тъмно|нощ е|тъмно е/iu;

describe("C2 — a step asserts darkness only where the world is dark on every rung", () => {
  it("the matcher has teeth in both directions", () => {
    expect(DARK_ASSERTION.test("в здрач и нощем късите светлини се включват ПРЕДИ")).toBe(true);
    expect(DARK_ASSERTION.test("Нощ е и улицата е неосветена.")).toBe(true);
    expect(DARK_ASSERTION.test("стъмни ли се, късите се включват ПРЕДИ да ти потрябват")).toBe(
      false,
    );
    expect(DARK_ASSERTION.test("Вали ли, включи късите светлини още преди да тръгнеш")).toBe(false);
  });

  it("the census: a daylight L1 never carries a darkness assertion", () => {
    const offenders: string[] = [];
    for (const spec of SCENARIO_TEMPLATES_PE2) {
      const l1 = compileScenario(spec, 1);
      if (l1.environment?.timeOfDay === "night") continue;
      for (const s of spec.instructionsBg) {
        if (DARK_ASSERTION.test(s.textBg)) offenders.push(`${spec.id} step ${s.n} — "${s.textBg}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("…and the rule SPARES the drill that really is dark — it is not a word ban", () => {
    // sc-pe-night-unlit is `conditions.night` template-wide, so «Нощ е и улицата
    // е неосветена» is a true sentence on all five rungs and must survive.
    const night = SCENARIO_TEMPLATES_PE2.find((s) => s.id === "sc-pe-night-unlit")!;
    expect(compileScenario(night, 1).environment?.timeOfDay).toBe("night");
    expect(night.instructionsBg.some((s) => DARK_ASSERTION.test(s.textBg))).toBe(true);
  });

  it("the repair kept the duty — the beams step is still a step, not a deletion", () => {
    // The other way this row could be "fixed": drop the sentence. That would
    // also silence lane10's G5 (no dark rung without a lights step), so this
    // states the intent locally too.
    const row = SCENARIO_TEMPLATES_PE2.find((s) => s.id === "sc-pe-parked-row-scan")!;
    const lit = row.instructionsBg.filter(
      (s) => /светлин/u.test(s.textBg) && /включ|провери/u.test(s.textBg),
    );
    expect(lit.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// C3 — sc-pzl-halt: a STANDING duty, not a present fact
// ---------------------------------------------------------------------------

/**
 * People named as ALREADY BEING on the carriageway. The distinction is the
 * definite noun + the location, exactly the shape the frame caught: «хората на
 * платното» asserts they are there NOW. A conditional («всеки, стъпил на
 * платното») names the same duty without asserting the moment, and a title that
 * names a PLACE («мястото на изскачане») asserts nothing at all.
 */
const PRESENT_ACTOR =
  /(?:^|[^\p{L}])(?:хората|децата|детето|пешеходеца|пешеходците)\s+(?:на|върху)\s+(?:платното|пътеката|лентата)(?![\p{L}])/iu;

describe("C3 — the жилищна-зона halt chip is issued long before anyone is on the road", () => {
  const lesson = compileScenario(SC_PE_ZONE_LIVING, 1);
  const zone = lesson.objectives.find((o) => o.id === "sc-pzl-zone")!;
  const halt = lesson.objectives.find((o) => o.id === "sc-pzl-halt")!;
  const zoneP = parseObjectiveParams(zone);
  const haltP = parseObjectiveParams(halt);
  const walker = SC_PE_ZONE_LIVING.staged!.find(
    (s) => s.id === "sc-pzl-walker-w",
  ) as PedestrianDartOutSpec;
  /** orchestrator/runners.ts `stage()`: triggerDistM ± 3 m, seeded. */
  const TRIGGER_JITTER_M = 3;

  it("THE MEASUREMENT: ~46 m of road in which a definite «хората» names nobody", () => {
    if (zoneP.kind !== "reachZone" || haltP.kind !== "reachZone") throw new Error("shape");
    // Objectives are strictly sequential, so the halt chip goes live the instant
    // the zone gate ticks — at the EARLIEST that is the near edge of its disc.
    const chipLiveFromY = zoneP.y - zoneP.radiusM;
    // The walkers cannot be moving before the player is inside the trigger, and
    // the director's jitter can only make it EARLIER by 3 m.
    const walkersMoveFromY = walker.crossing.y - (walker.triggerDistM + TRIGGER_JITTER_M);
    expect(walkersMoveFromY - chipLiveFromY).toBeGreaterThan(40);
    // …and the halt mark itself sits BEYOND the release line, which is why the
    // objective's completion moment is honest even though its issue moment is
    // not: only the title can carry the gap.
    expect(haltP.y).toBeGreaterThan(walkersMoveFromY);
  });

  it("the matcher has teeth: it catches the retired title and spares the replacement", () => {
    expect(PRESENT_ACTOR.test("Спри пред хората на платното")).toBe(true);
    expect(PRESENT_ACTOR.test("Изчакай детето на пътеката")).toBe(true);
    expect(PRESENT_ACTOR.test("Спри пред всеки, стъпил на платното")).toBe(false);
    expect(PRESENT_ACTOR.test("Приближи мястото на изскачане с готовност за спиране")).toBe(false);
  });

  it("no PE2 gate asserts that another road user is ALREADY on the road", () => {
    const offenders = SCENARIO_TEMPLATES_PE2.flatMap((spec) =>
      spec.success
        .filter((o) => PRESENT_ACTOR.test(o.titleBg))
        .map((o) => `${spec.id}/${o.id} — "${o.titleBg}"`),
    );
    expect(offenders).toEqual([]);
  });

  it("…and the duty was rewritten, not dropped: it still DEMANDS a stop, with a halt cap", () => {
    // The failure mode of every title repair: soften the sentence until it
    // certifies nothing. `REACH_ZONE_HALT_CAP_KMH` is 8 (objectives.ts) — a cap
    // at or under it is what makes «спри» a demand rather than a description.
    if (haltP.kind !== "reachZone") throw new Error("shape");
    expect(/(?:^|[^\p{L}])[Сс]при(?![\p{L}])/u.test(halt.titleBg)).toBe(true);
    expect(haltP.maxSpeedKmh).toBeLessThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------
// C4 — a briefing step may not DENY a road feature the district builds
// ---------------------------------------------------------------------------

/**
 * A step asserting that a class of road feature is ABSENT from the street the
 * student is on. The distinction that matters is «няма X» stated about HERE —
 * a step that says what the law grants («предимството не е само върху пътека»)
 * asserts nothing about the furniture and is deliberately outside it.
 */
const DENIES_CROSSING =
  /(?:^|[^\p{L}])н[яе]ма\s+(?:никакви\s+)?(?:пешеходн[иа]\s+(?:пътек[иа]|пътека)|зебр[аи])(?![\p{L}])/iu;

describe("C4 — the жилищна-зона briefing denied a crossing the world builds", () => {
  const ZONE_DISTRICT = "pe-zone-v1";
  const RETIRED_STEP3 =
    "Вътре няма пешеходни пътеки и никой не е длъжен да върви по тротоара — цялото платно е на хората. " +
    "Хора върху платното тук не нарушават нищо: ти си гостът.";

  it("THE MEASUREMENT: pe-zone-v1 now shows the ZONE and no пешеходна пътека", () => {
    const by = signsBuiltFor(ZONE_DISTRICT);
    // The PAINT half of the design held, and this also settles the wave-c
    // wording: that note says the zone „contains a marked zebra", and it does
    // not — markings.ts lays nothing for `kind: "unmarked"`, the frame it cites
    // (04-t102s) shows bare asphalt, and the count here is zero. What the frame
    // really shows is the TRIANGLE, which is the half below.
    expect(by.__zebraPaint, "painted zebras on pe-zone-v1").toBe(0);
    // THE EXPECTATION FLIPPED, AND THIS COMMENT IS WHY (it read
    // `.toBeGreaterThan(0)` until 2026-09-02, with a note saying „if it is ever
    // fixed this expectation reds: that is the signal"). It was fixed. props.ts
    // iterated `district.crossings` and never read `crossing.kind`, so the
    // deliberately `unmarked` pz-x-1 earned an А18 per direction over bare
    // asphalt; the А18 loop now asks `paintsZebra(crossing)` — the painter's own
    // predicate — so the sign pass and the paint pass answer the same question.
    // Measured over the whole corpus, pe-zone-v1 is the only district that
    // changes: the two OSM cuts carrying `unmarked` nodes are not scenario maps
    // and never reach that loop.
    expect(
      by.pedestrianCrossing ?? 0,
      "А18 posts inside the жилищна зона — none, there is no пътека to warn of",
    ).toBe(0);
    // …and the zone is not merely un-contradicted, it is now STATED. ЗДвП чл. 61
    // defines a жилищна зона as one „обозначена като такава на входовете и
    // изходите й с пътни знаци", and until this wave the street carried no such
    // plate at all — the зона changed the student's duties behind an invisible
    // trigger while the teach card promised him „синия правоъгълен знак Д15 …
    // до знака Д16". One Д15 and one Д16 per boundary, per direction of travel.
    expect(by.livingZoneStart ?? 0, "Д15 „Начало на жилищна зона“").toBe(2);
    expect(by.livingZoneEnd ?? 0, "Д16 „Край на жилищната зона“").toBe(2);
  });

  it("the matcher has teeth: it catches the retired step and spares the replacement", () => {
    expect(DENIES_CROSSING.test(RETIRED_STEP3)).toBe(true);
    expect(DENIES_CROSSING.test("Тук няма зебра — платното е на хората")).toBe(true);
    const shipped = SC_PE_ZONE_LIVING.instructionsBg.find((s) => s.n === 3)!;
    expect(DENIES_CROSSING.test(shipped.textBg)).toBe(false);
    // …and it is not a ban on the WORDS: the replacement still teaches that the
    // priority is not confined to a crossing, and must survive.
    expect(/пътека/iu.test(shipped.textBg)).toBe(true);
  });

  it("NOT VACUOUS: the retired step is still an offender on a street that HAS a пътека", () => {
    // This fixture used to run on pe-zone-v1, where the world contradicted the
    // sentence because props.ts posted А18 over an unmarked crossing. That is
    // repaired, so «Вътре няма пешеходни пътеки» is no longer false of THAT
    // street — and a test that went on asserting it was would be pinning the
    // defect in place. What has to survive is the PREDICATE's teeth, so the
    // fixture moves to a district that really does build one: pe-dart-v1's
    // pe-x-1 is `marked`, so it carries both the paint and its А18.
    const elsewhere: ScenarioSpec = {
      ...SC_PE_ZONE_LIVING,
      map: { ...SC_PE_ZONE_LIVING.map, districtId: "pe-dart-v1" },
      instructionsBg: [{ n: 3, textBg: RETIRED_STEP3 }],
    };
    expect(crossingSignsBuilt("pe-dart-v1")).toBeGreaterThan(0);
    expect(
      offendersOf([elsewhere], (t) => DENIES_CROSSING.test(t), (d) => crossingSignsBuilt(d) > 0),
    ).toHaveLength(1);
    // …and on the repaired zone street the SAME sentence is now spared, which is
    // the repair stated as a measurement rather than as a claim.
    const onZone: ScenarioSpec = {
      ...SC_PE_ZONE_LIVING,
      instructionsBg: [{ n: 3, textBg: RETIRED_STEP3 }],
    };
    expect(crossingSignsBuilt(ZONE_DISTRICT)).toBe(0);
    expect(
      offendersOf([onZone], (t) => DENIES_CROSSING.test(t), (d) => crossingSignsBuilt(d) > 0),
    ).toEqual([]);
  });

  it("the census: no PE2 briefing step denies a crossing its own district builds", () => {
    expect(
      offendersOf(
        SCENARIO_TEMPLATES_PE2,
        (t) => DENIES_CROSSING.test(t),
        (d) => crossingSignsBuilt(d) > 0,
      ),
    ).toEqual([]);
  });

  it("…and the duty was sharpened, not dropped: step 3 still hands the whole road to the pedestrian", () => {
    // The failure mode of a "just delete the sentence" repair. чл. 62, т. 1 is
    // the entire reason this drill exists; the step has to still say it, and it
    // has to still say the student is the guest.
    const shipped = SC_PE_ZONE_LIVING.instructionsBg.find((s) => s.n === 3)!.textBg;
    expect(/цял[аоя]т?[ао]?\s+(?:му\s+)?(?:широчина|платно)/iu.test(shipped)).toBe(true);
    expect(/гост/iu.test(shipped)).toBe(true);
    expect(/чл\.\s*62/u.test(shipped)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C5 — a step may not attribute the posted limit to a plate the world lacks
// ---------------------------------------------------------------------------

/** The limit credited to a SIGN: «Знакът разрешава 50», «знакът позволява 30». */
const SIGN_STATES_LIMIT = /знак\p{L}*\s+(?:разрешава|позволява|показва|дава|качва|сваля)\s+\d+/iu;

describe("C5 — the night briefing read a speed plate pe-dart-v1 does not build", () => {
  const NIGHT = SCENARIO_TEMPLATES_PE2.find((s) => s.id === "sc-pe-night-unlit")!;
  const RETIRED_STEP2 =
    "Знакът разрешава 50, но ти виждаш докъдето стигат фаровете. Ограничението е таван, не цел — " +
    "карай със скорост, с която спираш в осветеното.";

  it("THE MEASUREMENT: pe-dart-v1 builds ZERO В26 faces, pe-zone-v1 builds some", () => {
    // The night street's 50 is чл. 21's built-up-area default — there is no
    // plate to read, and the step told the student to read one.
    expect(speedPlatesBuilt("pe-dart-v1"), "В26 faces built on pe-dart-v1").toBe(0);
    // The SPARE side of the rule: where a plate really stands, naming it is
    // correct signing and the rule must not forbid it. pe-zone-v1's mouth
    // carries the В26 «20» the wave-c 04-t044s crop reads.
    expect(speedPlatesBuilt("pe-zone-v1"), "В26 faces built on pe-zone-v1").toBeGreaterThan(0);
  });

  it("the matcher has teeth: it catches the retired step and spares the replacement", () => {
    expect(SIGN_STATES_LIMIT.test(RETIRED_STEP2)).toBe(true);
    expect(SIGN_STATES_LIMIT.test("знакът позволява 30 в зоната")).toBe(true);
    const shipped = NIGHT.instructionsBg.find((s) => s.n === 2)!;
    expect(SIGN_STATES_LIMIT.test(shipped.textBg)).toBe(false);
    // …and it is not a ban on the word «знак»: sc-pe-zone-living step 6 points
    // at the Б1 on the exit mouth, which `buildWorldGeometry` really posts.
    const exitStep = SC_PE_ZONE_LIVING.instructionsBg.find((s) => /Б1/u.test(s.textBg))!;
    expect(SIGN_STATES_LIMIT.test(exitStep.textBg)).toBe(false);
    expect(signsBuiltFor("pe-zone-v1").giveWay ?? 0, "Б1 posts on pe-zone-v1").toBeGreaterThan(0);
  });

  it("NOT VACUOUS: the retired step, run through the same predicate, is an offender", () => {
    const fixture: ScenarioSpec = { ...NIGHT, instructionsBg: [{ n: 2, textBg: RETIRED_STEP2 }] };
    expect(
      offendersOf([fixture], (t) => SIGN_STATES_LIMIT.test(t), (d) => speedPlatesBuilt(d) === 0),
    ).toHaveLength(1);
  });

  it("the census: no PE2 briefing step credits the limit to a plate its district lacks", () => {
    expect(
      offendersOf(
        SCENARIO_TEMPLATES_PE2,
        (t) => SIGN_STATES_LIMIT.test(t),
        (d) => speedPlatesBuilt(d) === 0,
      ),
    ).toEqual([]);
  });

  it("…and the чл. 20 lesson survived the repair: the step still says the limit is a ceiling", () => {
    // The whole point of PE-09's step 2 — «карай със скорост, с която спираш в
    // осветеното». A repair that only deleted the false clause would leave the
    // student with the number and none of the reasoning; the number without the
    // ceiling is the misconception the lesson exists to break.
    const shipped = NIGHT.instructionsBg.find((s) => s.n === 2)!.textBg;
    expect(/таван/iu.test(shipped)).toBe(true);
    expect(/фаров|осветено/iu.test(shipped)).toBe(true);
    expect(/50/u.test(shipped)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C6 — «стеснението между жилищните блокове» is a MEASUREMENT, not a flourish
// ---------------------------------------------------------------------------

/**
 * THE COUNTER-ROW, written down because this lane nearly deleted a true
 * sentence. The wave-c note on sc-pe-zone-living/37bbb618 reads „Nothing
 * anywhere narrows, so «стеснението между жилищните блокове» has no referent" —
 * and the district disagrees, by 8 metres.
 *
 * `edgeHalfWidth` is the builders' OWN function: travel lanes plus a 4 m
 * kerbside parking band on the arterial classes. pz-e-approach and pz-e-out are
 * `tertiary` (band) and pz-e-zone is `residential` (no band), so the kerbs step
 * IN by 4 m per side at the Д15 boundary and OUT again at the Д16 one:
 * 24.25 m → 16.25 m → 24.25 m. Step 2 is describing a real cross-section.
 *
 * The founder-review reading is still worth something — it is about LEGIBILITY,
 * not geometry: the narrowing is the parked band vanishing, and the flanking
 * 12 m blocks render as grey office slabs, so a third of the road disappears
 * without reading as a residential squeeze. That is a world/scene row and it is
 * reported. What this file must not do is answer it by deleting a measured
 * fact, so the number is pinned here: anyone who removes the clause has to make
 * this test go red first, and read why.
 */
describe("C6 — the zone entry really is a narrowing (the clause a repair must not delete)", () => {
  it("THE MEASUREMENT: pe-zone-v1 loses 8 m of kerb-to-kerb across the Д15 boundary", () => {
    const district = JSON.parse(
      readFileSync(path.join(REPO, "content", "world", "pe-zone-v1.json"), "utf-8"),
    ) as { roads: { edges: { id: string; class: string; lanes: number; roundabout: boolean }[] } };
    const width = (id: string) => {
      const e = district.roads.edges.find((x) => x.id === id);
      if (!e) throw new Error(`pe-zone-v1 has no edge ${id}`);
      return 2 * edgeHalfWidth(e);
    };
    const approach = width("pz-e-approach");
    const zone = width("pz-e-zone");
    const out = width("pz-e-out");
    expect(approach - zone, "kerb-to-kerb lost at the zone entry, m").toBeCloseTo(8, 3);
    expect(out - zone, "kerb-to-kerb regained at the zone exit, m").toBeCloseTo(8, 3);
    expect(zone).toBeLessThan(approach);
  });

  it("…and step 2 still says so — the copy is the reason the measurement matters", () => {
    const step2 = SC_PE_ZONE_LIVING.instructionsBg.find((s) => s.n === 2)!.textBg;
    expect(/стеснени/iu.test(step2)).toBe(true);
    // The teaching the clause carries: slow down BEFORE the boundary, and 20 is
    // a walking pace rather than "driving slowly".
    expect(/ПРЕДИ/u.test(step2)).toBe(true);
    expect(/20/u.test(step2)).toBe(true);
  });
});
