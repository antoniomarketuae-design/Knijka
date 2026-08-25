/**
 * ONE TASK, ONE NUMBER — the НАУЧИ card that contradicted the toast above it.
 *
 * THE FRAME. `.audit-frames/w10-1/frames/sc-ac-crosswind__pc-right/04-t084s.png`:
 * instruction 3 reads «тук около 34 км/ч, таванът е 40», the objective toast in
 * the same 200 px band reads «дръж под 40 км/ч», the cockpit strip on the mobile
 * leg reads «задачата иска ≤40» — and the coach card fires «Задачата иска да си
 * тук с не повече от 45 км/ч». Four surfaces, one waypoint, two numbers; and the
 * odd one out is the GRADER'S, so the student who obeyed the figure he was told
 * to obey read a card telling him a different one.
 *
 * WHERE THE 45 CAME FROM. `sc-acx-open` authors 40. The L1 rung is tolerance
 * 1.5 and `scenario/params.ts widenSpeedCap` folds
 * SPEED_CAP_GRACE_KMH_PER_TOLERANCE × 0.5 = 5 km/h into the compiled
 * `maxSpeedKmh`, bounded by the posted 50. Three of the four surfaces already
 * spoke the author's figure — they read `advisor.ts advisorPromptForObjective`,
 * directly or by parsing its sentence back out (`LessonPlayShell
 * taskCapKmhFromPrompt`) — and `lessons/engine.ts objectiveNotice` was the one
 * surface still printing the compiled number raw.
 *
 * THE SIBLING, so this is a class and not an anecdote: `sc-acs-approach`
 * (sc-ac-snow) authors 25 and compiles to 30 on the same arithmetic, and its own
 * row was closed twice on «the three LABELS were reconciled» and overturned
 * twice because the fourth surface was not.
 *
 * WHAT THIS FILE PINS, and why the third one is the one that matters: the
 * behaviour on a driven session, the fallback for lessons that never went
 * through `scenario/compile.ts`, and THE GENERAL FORM over the whole catalogue —
 * every capped card in the product, not the two the frames happened to catch.
 * A rule with one enforced instance is a convention.
 */

import { describe, expect, it } from "vitest";
import type { HudEvent, LessonObjective, LessonSpec } from "../../contracts";
import type { SimTick } from "../../rules";
import { advisorPromptForObjective, shownObjectiveCapKmh } from "../advisor";
import { applyTick, createLessonSession } from "../engine";
// Section 4 needs the RESOLVED arrival contract, not the authored param record:
// `requireLamps` / `requireGear` are derived from the objective's own banner, so
// only the parse can say which gates carry one (see `deriveLampDemand`).
import { parseObjectiveParams } from "../objectives";
import { AUTHORED_MAX_SPEED_PARAM_KEY, compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioLevel } from "../scenario/types";
import { makeTick } from "./fixtures";

const NOTICE_TITLE = "Стигна точката, но твърде бързо";

/** Mirrors REACH_ZONE_HALT_CAP_KMH / ADVISOR_HALT_CAP_KMH — stated locally so
 *  this file names the band it reasons about rather than inheriting it. */
const HALT_CAP_KMH = 8;

const KMH = (s: string) =>
  [...s.matchAll(/(\d+(?:[.,]\d+)?)\s*км\/ч/g)].map((m) => Number(m[1].replace(",", ".")));

/** One compiled objective, with the lesson it was compiled into. */
function objectiveOf(
  scenarioId: string,
  objectiveId: string,
  level: ScenarioLevel = 1,
): { lesson: LessonSpec; o: LessonObjective } {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === scenarioId);
  if (spec === undefined) throw new Error(`no such template: ${scenarioId}`);
  const lesson = compileScenario(spec, level);
  const o = lesson.objectives.find((x) => x.id === objectiveId);
  if (o === undefined) throw new Error(`no such objective: ${scenarioId}/${objectiveId}`);
  return { lesson, o };
}

/**
 * A DRIVABLE ROUTE CARRYING A REAL CATALOGUE OBJECTIVE'S NUMBERS.
 *
 * The compiled scenario's own waypoint sits hundreds of metres down an authored
 * street; driving to it here would be a world test, not an engine one. So the
 * three numbers that decide this card — the compiled gate, the author's figure
 * and the street's posted limit — are lifted OFF the catalogue and grafted onto
 * a straight route north of the spawn. If a template re-authors its cap the
 * numbers move with it and this test keeps measuring the product rather than a
 * copy of it.
 */
function routeCarrying(scenarioId: string, objectiveId: string): {
  lesson: LessonSpec;
  cap: number;
  authored: number;
} {
  const { lesson: compiled, o } = objectiveOf(scenarioId, objectiveId);
  const cap = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh;
  const authored = o.params[AUTHORED_MAX_SPEED_PARAM_KEY];
  if (typeof cap !== "number" || typeof authored !== "number") {
    throw new Error(`${scenarioId}/${objectiveId} is not a capped compiled reachZone`);
  }
  const lesson: LessonSpec = {
    id: `t-shown-cap-${objectiveId}`,
    order: 99,
    titleBg: "Тестов маршрут",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
    preDrive: false,
    postedLimitKmh: compiled.postedLimitKmh,
    objectives: [
      {
        id: objectiveId,
        titleBg: o.titleBg,
        kind: "reachZone",
        params: { x: 0, y: 100, radiusM: 6, maxSpeedKmh: cap, [AUTHORED_MAX_SPEED_PARAM_KEY]: authored },
      },
      {
        id: "t-finish",
        titleBg: "Спри в края на маршрута",
        kind: "reachZone",
        params: { x: 0, y: 300, radiusM: 15 },
      },
    ],
  };
  return { lesson, cap, authored };
}

/** Drive straight north through the capped zone, comfortably over the gate. */
function driveOverTheCap(lesson: LessonSpec, speedKmh: number): HudEvent[] {
  let s = createLessonSession(lesson);
  const hud: HudEvent[] = [];
  const ticks: SimTick[] = [];
  for (let y = 0; y <= 140; y++) {
    ticks.push(makeTick({ t: y, speedKmh, position: { x: 0, y }, maxSpeedKmh: 50 }));
  }
  for (const tick of ticks) {
    const r = applyTick(s, tick);
    s = r.state;
    hud.push(...r.hudEvents);
  }
  return hud;
}

function noticeText(hud: HudEvent[]): string {
  const card = hud.find(
    (e): e is Extract<HudEvent, { kind: "lesson" }> =>
      e.kind === "lesson" && e.titleBg === NOTICE_TITLE,
  );
  if (card === undefined) throw new Error("the over-cap card never fired");
  return card.explanationBg;
}

// ---------------------------------------------------------------------------
// 0. THE DEFECT IS REAL IN THE SHIPPED CATALOGUE, before anything is asserted
//    about the repair
// ---------------------------------------------------------------------------

describe("the split this file closes exists in the product", () => {
  it("the two photographed lessons compile a gate above the figure they show", () => {
    // Read off the catalogue, not typed in: if a template re-authors its cap
    // these move, and the assertion below still describes the same defect.
    const crosswind = objectiveOf("sc-ac-crosswind", "sc-acx-open");
    const snow = objectiveOf("sc-ac-snow", "sc-acs-approach");
    for (const { lesson, o } of [crosswind, snow]) {
      const cap = (o.params as { maxSpeedKmh: number }).maxSpeedKmh;
      const authored = o.params[AUTHORED_MAX_SPEED_PARAM_KEY] as number;
      expect(authored).toBeLessThan(cap);
      // And the figure the world shows is the AUTHORED one — this is what the
      // toast, the gate bar and the cockpit strip all read.
      expect(
        shownObjectiveCapKmh(o, cap, lesson.postedLimitKmh),
      ).toBe(authored);
    }
  });

  it("it is a class, not two lessons: many compiled rungs grade above what they say", () => {
    let split = 0;
    let capped = 0;
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        const lesson = compileScenario(spec, rung.level as ScenarioLevel);
        for (const o of lesson.objectives) {
          if (o.kind !== "reachZone") continue;
          const cap = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh;
          if (cap === undefined || cap <= HALT_CAP_KMH) continue;
          capped += 1;
          if (shownObjectiveCapKmh(o, cap, lesson.postedLimitKmh) < cap) split += 1;
        }
      }
    }
    // Measured 2026-08-24 on this tree: 953 capped reachZone gates, 644 of them
    // above the halt band, of which 329 are graded on a looser number than the
    // one the student is shown — this card's old figure, 329 times over. The
    // floors are deliberately far below those figures — this assertion exists to
    // fail if the class ever becomes EMPTY (which would mean the sweep is
    // measuring nothing), not to pin a census that authoring will move.
    expect(capped).toBeGreaterThan(200);
    expect(split).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------------------
// 1. THE CARD ON A DRIVEN SESSION
// ---------------------------------------------------------------------------

describe("the over-cap coach card says the number the world showed", () => {
  it("sc-ac-crosswind: the card names the authored cap, never the rung's grace", () => {
    const { lesson, cap, authored } = routeCarrying("sc-ac-crosswind", "sc-acx-open");
    const text = noticeText(driveOverTheCap(lesson, 59));
    // The frame's own numbers: the card said 45 beside a toast saying 40.
    expect(text).toContain(`не повече от ${authored} км/ч`);
    expect(text).not.toContain(`${cap} км/ч`);
    // And the measured speed is still reported — THEO-4 wants both figures and
    // the corrective, never a bare refusal.
    expect(text).toContain("59 км/ч");
    expect(text).toContain("Намали");
  });

  it("sc-ac-snow: the sibling row, on the same arithmetic", () => {
    const { lesson, cap, authored } = routeCarrying("sc-ac-snow", "sc-acs-approach");
    const text = noticeText(driveOverTheCap(lesson, 44));
    expect(text).toContain(`не повече от ${authored} км/ч`);
    expect(text).not.toContain(`${cap} км/ч`);
  });

  it("a lesson that never went through the scenario compiler is untouched", () => {
    // Curriculum specs, the exam bank and hand-built doubles carry no authored
    // key because no rung was ever applied — there `maxSpeedKmh` IS the author's
    // own figure, and the card must go on printing it. This is the case
    // route-finish.test.ts's `t-route-capped` drives; if this goes red the
    // fallback has started inventing numbers.
    const lesson: LessonSpec = {
      id: "t-shown-cap-uncompiled",
      order: 99,
      titleBg: "Тестов маршрут",
      descriptionBg: "тест",
      conceptIds: [],
      spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
      preDrive: false,
      objectives: [
        {
          id: "t-slow",
          titleBg: "Мини бавно през стеснението",
          kind: "reachZone",
          params: { x: 0, y: 100, radiusM: 6, maxSpeedKmh: 20 },
        },
        { id: "t-finish", titleBg: "Спри в края", kind: "reachZone", params: { x: 0, y: 300, radiusM: 15 } },
      ],
    };
    expect(noticeText(driveOverTheCap(lesson, 34))).toContain("не повече от 20 км/ч");
  });
});

// ---------------------------------------------------------------------------
// 2. THE GENERAL FORM — every capped card in the catalogue, not the two above
// ---------------------------------------------------------------------------

describe("across the whole catalogue the coach card and the advisor speak one number", () => {
  it("the card's figure is the advisor's figure wherever the advisor speaks one", () => {
    const divergent: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        const lesson = compileScenario(spec, rung.level as ScenarioLevel);
        for (const o of lesson.objectives) {
          if (o.kind !== "reachZone") continue;
          const cap = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh;
          if (cap === undefined) continue;
          const authored = o.params[AUTHORED_MAX_SPEED_PARAM_KEY];
          const textBg = advisorPromptForObjective(
            o.titleBg,
            { kind: "reachZone", ...(o.params as object) } as never,
            undefined,
            lesson.postedLimitKmh,
            typeof authored === "number" ? authored : undefined,
          ).textBg;
          if (!textBg.includes("дръж под")) continue;
          const spoken = KMH(textBg).at(-1);
          const shown = shownObjectiveCapKmh(o, cap, lesson.postedLimitKmh);
          if (spoken !== shown) divergent.push(`${lesson.id}/${o.id}: card ${shown} vs toast ${spoken}`);
        }
      }
    }
    expect(divergent).toEqual([]);
  });

  it("the card can only ever be STRICTER than the gate, never looser", () => {
    // The half that must not be dropped, and the reason this repair is allowed
    // to ship at all: a card naming a number ABOVE the gate would coach a
    // student straight into failing the task he is being coached through. The
    // `Math.min` at the end of `spokenCapKmh` is what holds it.
    const looser: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        const lesson = compileScenario(spec, rung.level as ScenarioLevel);
        for (const o of lesson.objectives) {
          if (o.kind !== "reachZone") continue;
          const cap = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh;
          if (cap === undefined) continue;
          const shown = shownObjectiveCapKmh(o, cap, lesson.postedLimitKmh);
          if (shown > cap) looser.push(`${lesson.id}/${o.id}: ${shown} > ${cap}`);
        }
      }
    }
    expect(looser).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. ONE CARD, ONE TENSE — the claim this card's own instruction falsified
// ---------------------------------------------------------------------------

/**
 * The same card as section 1, and the OTHER thing it got wrong about its own
 * numbers: not which figure, but WHEN.
 *
 * It fires once, on the rising edge of `overCapNoted`, and is then owned by the
 * toast column for up to the `lesson` card's 8 s teaching TTL. So anything it
 * says in the PRESENT tense about the car is a claim about an instant that has
 * already gone — and this card's next clause is «Намали СЕГА», which means the
 * student who does as he is told is the one who makes it false. The faster he
 * obeys, the more false it gets.
 *
 * THE FRAMES, and the second is the re-drive of the first, which is what makes
 * this a mechanism rather than a sample:
 *   · `.audit-frames/w10-1/frames/sc-merge-from-property__mobile-right/
 *     05-stopped.png` — «…а в момента караш 16 км/ч», cluster «0 км/ч»;
 *   · `.audit-frames/w10-3/frames/sc-merge-from-property__pc-right/
 *     05-stopped.png` — «…а в момента караш 8 км/ч», cluster «0 км/ч D».
 * The number moved between the two drives. The contradiction did not.
 *
 * WHY THE FIX IS THE TENSE AND NOT A RE-SAMPLE: `objectiveNotice` returns one
 * HudEvent at one instant; nothing recomposes it per tick, and making it live
 * would mean a card that rewrites itself while it is being read. `hud/
 * HudToasts.tsx` already took the half that belongs to the column (the card
 * prints its age, so the claim is dated on the glass) and named `lessons/
 * engine.ts` as the owner of this half. An aorist cannot rot: the arrival
 * happened, and it goes on having happened.
 */
const PRESENT_TENSE_SPEED_CLAIM = /в\s+момента\s+кара/u;

/** The compiled gate's own numbers, grafted onto a short straight route with
 *  the zone at y = 100 — same trick as `routeCarrying`, sized for a sweep. */
function graftedRoute(lesson: LessonSpec, o: LessonObjective): LessonSpec {
  return {
    id: `t-tense-${lesson.id}-${o.id}`,
    order: 99,
    titleBg: "Тестов маршрут",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
    preDrive: false,
    postedLimitKmh: lesson.postedLimitKmh,
    objectives: [
      {
        id: o.id,
        titleBg: o.titleBg,
        kind: "reachZone",
        params: { ...o.params, x: 0, y: 100, radiusM: 6 },
      },
    ],
  };
}

/** Drive north through the zone at a fixed speed, collecting the HUD. */
function hudThrough(lesson: LessonSpec, speedKmh: number, fromY: number, toY: number): HudEvent[] {
  let s = createLessonSession(lesson);
  const hud: HudEvent[] = [];
  let t = 0;
  for (let y = fromY; y <= toY; y++) {
    const r = applyTick(s, makeTick({ t: t++, speedKmh, position: { x: 0, y }, maxSpeedKmh: 50 }));
    s = r.state;
    hud.push(...r.hudEvents);
  }
  return hud;
}

/**
 * Arrive on the mark hot, then DO WHAT THE CARD SAYS — brake to a standstill
 * while still standing on it. Returns the card as the student still has it in
 * front of him, and the speed his cluster reads by then.
 */
function obeyTheCard(lesson: LessonSpec, entryKmh: number): { text: string; clusterKmh: number } {
  let s = createLessonSession(lesson);
  const hud: HudEvent[] = [];
  let t = 0;
  const tick = (y: number, speedKmh: number) => {
    const r = applyTick(s, makeTick({ t: t++, speedKmh, position: { x: 0, y }, maxSpeedKmh: 50 }));
    s = r.state;
    hud.push(...r.hudEvents);
  };
  for (let y = 0; y <= 100; y++) tick(y, entryKmh);
  let kmh = entryKmh;
  while (kmh > 0) {
    kmh = Math.max(0, kmh - 8);
    tick(100, kmh); // «Намали СЕГА, докато си върху точката.»
  }
  return { text: noticeText(hud), clusterKmh: kmh };
}

describe("the over-cap coach card is still true after the student obeys it", () => {
  it("sc-ac-crosswind: the measured speed is an arrival, not a present", () => {
    const { lesson } = routeCarrying("sc-ac-crosswind", "sc-acx-open");
    const { text, clusterKmh } = obeyTheCard(lesson, 59);
    // The observation is still on the card — THEO-4 wants what was seen, what
    // is wanted and what to do, never a bare refusal; section 1 pins that the
    // number is the MEASURED one and section 2 that the cap is the SHOWN one.
    expect(text).toContain("59 км/ч");
    // …and by the last tick the instrument says 0 while the card is still up.
    // That is the exact pairing both frames photographed.
    expect(clusterKmh).toBe(0);
    expect(text).toContain("стигна дотук с 59 км/ч");
    expect(text).not.toMatch(PRESENT_TENSE_SPEED_CLAIM);
  });

  it("sc-ac-snow: the sibling row, same card, same tense", () => {
    const { lesson } = routeCarrying("sc-ac-snow", "sc-acs-approach");
    const { text } = obeyTheCard(lesson, 44);
    expect(text).toContain("стигна дотук с 44 км/ч");
    expect(text).not.toMatch(PRESENT_TENSE_SPEED_CLAIM);
  });

  it("THE GENERAL FORM: no coach card the engine emits anywhere speaks that tense", () => {
    // Every capped reachZone in the catalogue, driven hot through its own gate.
    // A rule with one enforced instance is a convention — and the two frames
    // above are one lesson out of the several hundred rungs swept here.
    const offenders: string[] = [];
    let swept = 0;
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        const lesson = compileScenario(spec, rung.level as ScenarioLevel);
        for (const o of lesson.objectives) {
          if (o.kind !== "reachZone") continue;
          const cap = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh;
          if (typeof cap !== "number") continue;
          swept += 1;
          for (const e of hudThrough(graftedRoute(lesson, o), Math.round(cap) + 25, 90, 110)) {
            if (e.kind !== "lesson") continue;
            if (PRESENT_TENSE_SPEED_CLAIM.test(e.explanationBg ?? "")) {
              offenders.push(`${lesson.id}/${o.id}: ${e.explanationBg}`);
            }
          }
        }
      }
    }
    expect(offenders).toEqual([]);
    // The floor exists so a sweep that stops finding gates cannot report clean:
    // this file's own section 0 measures ~950 capped gates on this tree.
    expect(swept).toBeGreaterThan(200);
  });
});

// ---------------------------------------------------------------------------
// 4. …AND IT IS THE RIGHT AORIST — the frame the latch fires on is not always
//    the frame the car arrived on
// ---------------------------------------------------------------------------

/**
 * Section 3 replaced a claim that ROTS with one that cannot. This section is
 * the other direction of the same repair, and it is the one that was nearly
 * paid for: an unconditional «стигна дотук с M км/ч» does not rot, it LIES,
 * on every gate whose latch frame is not its arrival frame.
 *
 * `overCapNoted` latches on the first frame that is `!done && inAcceptance &&
 * speedKmh > cap` (`objectives.ts`). On a cap-ONLY gate that is necessarily the
 * arrival: entering under the cap makes `done` true and there is no card. But a
 * gate whose contract ALSO demands a cockpit state at the mark stays `!done`
 * while the state is unmet, so a student can enter legally, sit on the mark,
 * and only then go over the cap — and the card would say he arrived at a speed
 * he did not arrive at.
 *
 * MEASURED, BECAUSE „no template authors `requireLamps`" IS TRUE AND IRRELEVANT
 * (2026-08-25). The demand is DERIVED FROM THE BANNER — `objectives.ts
 * deriveLampDemand` / `deriveGearDemand`, „the gate measures what the banner
 * promises" — so it arrives with nobody having authored a key. A sweep of all
 * 167 templates × rungs finds 953 capped `reachZone` gates and 29 of them
 * already carry an at-mark demand beside the cap, across six scenarios:
 * sc-ac-night-lights, sc-ac-rain-lights, sc-ac-highbeam-lead, sc-ac-fog,
 * sc-ac-snow (lamps) and sc-park-bay-exit-rev (gear=reverse).
 *
 * AND THE BRANCH IS THEIR MISTAKE LANE, not a corner of it. «Мини контролната
 * зона осветен» withholds `done` exactly when the student drives it UNLIT —
 * the drive the lesson exists to teach — so this is the card that lesson shows
 * on the run it was built for.
 */
const ARRIVAL_SPEED_CLAIM = /стигна\s+дотук\s+с/u;

/**
 * Enter the disc UNDER the cap with the gate's state demand unmet (the tick
 * fixture carries no lamps and forward gear, which is what leaves a derived
 * `requireLamps`/`requireGear` unhonoured), stand on the mark, and only then
 * go over. Returns the card as it is composed on that later frame.
 */
function overCapAfterArriving(
  lesson: LessonSpec,
  enterKmh: number,
  thenKmh: number,
): { text: string; cardCount: number } {
  let s = createLessonSession(lesson);
  const hud: HudEvent[] = [];
  let t = 0;
  const tick = (y: number, speedKmh: number) => {
    const r = applyTick(s, makeTick({ t: t++, speedKmh, position: { x: 0, y }, maxSpeedKmh: 50 }));
    s = r.state;
    hud.push(...r.hudEvents);
  };
  // In through the disc at a legal speed…
  for (let y = 0; y <= 100; y++) tick(y, enterKmh);
  const onArrival = hud.filter((e) => e.kind === "lesson" && e.titleBg === NOTICE_TITLE).length;
  // …then over the cap, still standing on the mark.
  for (let i = 0; i < 6; i++) tick(100, thenKmh);
  // "" rather than a throw: the sweep below drives gates whose geometry may
  // never latch at all, and „this gate said nothing" is not the defect this
  // section measures. The named cases assert on the text, so a silent gate
  // still fails there — loudly and with the empty string in the message.
  const card = hud.find(
    (e): e is Extract<HudEvent, { kind: "lesson" }> =>
      e.kind === "lesson" && e.titleBg === NOTICE_TITLE,
  );
  return { text: card?.explanationBg ?? "", cardCount: onArrival };
}

describe("the over-cap card names the arrival only when the arrival is what it measured", () => {
  it("sc-ac-fog: entering under the cap unlit says nothing, and the later card does not invent an arrival", () => {
    // sc-acf-adapted derives `requireLamps: "fog"` from its own banner
    // («…с къси светлини, фарове за мъгла и съобразена скорост») and compiles a
    // 35 км/ч cap at L1. 20 in is legal; the lamps are what is missing.
    const { lesson } = routeCarrying("sc-ac-fog", "sc-acf-adapted");
    const { text, cardCount } = overCapAfterArriving(lesson, 20, 48);
    // Nothing was said on the way in — the speed was never the problem there.
    expect(cardCount).toBe(0);
    // The card that DOES fire still teaches (THEO-4: the measured number, the
    // wanted number, the instruction) …
    expect(text).toContain("48 км/ч");
    expect(text).toContain("Намали СЕГА");
    // …and it does not claim he arrived at 48, because he arrived at 20.
    expect(text).not.toMatch(ARRIVAL_SPEED_CLAIM);
    expect(text).toContain("върху точката вдигна скоростта до 48 км/ч");
    // Still no present tense: this is a second aorist, not a relapse.
    expect(text).not.toMatch(PRESENT_TENSE_SPEED_CLAIM);
  });

  it("…while the hot arrival on the SAME gate still says «стигна дотук»", () => {
    // The counter-proof that the discriminator discriminates rather than simply
    // suppressing the arrival form everywhere.
    const { lesson } = routeCarrying("sc-ac-fog", "sc-acf-adapted");
    const { text } = obeyTheCard(lesson, 48);
    expect(text).toContain("стигна дотук с 48 км/ч");
    expect(text).not.toMatch(PRESENT_TENSE_SPEED_CLAIM);
  });

  it("sc-park-bay-exit-rev: the gear demand does the same thing to an 8 км/ч gate", () => {
    // The one non-lamp member of the 29 — `requireGear: "reverse"`, derived
    // from «Задача 1: излез от мястото на заден ход, с пешеходна скорост». The
    // fixture drives FORWARD, so the demand is unmet and `done` stays false.
    const { lesson } = routeCarrying("sc-park-bay-exit-rev", "sc-pbe-out");
    const { text } = overCapAfterArriving(lesson, 4, 22);
    expect(text).toContain("22 км/ч");
    expect(text).not.toMatch(ARRIVAL_SPEED_CLAIM);
    expect(text).not.toMatch(PRESENT_TENSE_SPEED_CLAIM);
  });

  it("THE GENERAL FORM: every gate that can latch off its arrival frame is swept", () => {
    // The census and the behaviour in one walk, so the two cannot drift: any
    // capped gate carrying an at-mark demand is driven the legal-entry path and
    // its card is read. A gate that acquires such a demand later — by an
    // authored key, or by a banner rewritten to promise lamps — joins the sweep
    // on its own, which is the property a hand-listed set of six would not have.
    const offenders: string[] = [];
    const swept: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        const lesson = compileScenario(spec, rung.level as ScenarioLevel);
        for (const o of lesson.objectives) {
          if (o.kind !== "reachZone") continue;
          const p = parseObjectiveParams(o) as {
            maxSpeedKmh?: number;
            requireLamps?: string;
            requireGear?: string;
          };
          if (typeof p.maxSpeedKmh !== "number") continue;
          if (p.requireLamps === undefined && p.requireGear === undefined) continue;
          swept.push(`${lesson.id}/${o.id}`);
          const cap = p.maxSpeedKmh;
          // In at half the cap (legal, demand unmet), then well over it.
          const { text } = overCapAfterArriving(
            graftedRoute(lesson, o),
            Math.max(1, Math.floor(cap / 2)),
            Math.round(cap) + 13,
          );
          if (text !== "" && ARRIVAL_SPEED_CLAIM.test(text)) {
            offenders.push(`${lesson.id}/${o.id}: ${text}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
    // The floor is the census measured above. A sweep that stops finding these
    // gates must not be able to report clean — that is how a rule quietly stops
    // being enforced while its test stays green.
    expect(swept.length).toBeGreaterThanOrEqual(29);
  });
});
