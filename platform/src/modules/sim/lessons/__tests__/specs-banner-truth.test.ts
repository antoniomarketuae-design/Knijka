/**
 * BANNER TRUTH FOR THE CURRICULUM — `lessons/specs.ts` (L0–L8, полигон, the
 * A13 exam), the one lesson file the title-truth waves never reached.
 *
 * THE FRAME that routed the class here is `sc-turn-left-oncoming/pc-right/
 * 04-t043s.png`: five briefing steps describe an unsignalised left turn whose
 * graded skill is counting a gap in SECONDS, the world shows a red light, and
 * the coach card congratulates the student for waiting on it. A banner naming
 * a skill nothing in the drive exercises. The four rows the sweep routed to
 * `specs.ts` are all scenario TEMPLATES (templates-junctions*.ts) and none of
 * them is authored in this file — that half is routed, not fixed here, and the
 * lane report names it. What IS in this file is the same crime, unfound:
 *
 *   l6-night-route   «Измини нощния маршрут СЪС СВЕТЛИНИ»   kind driveDistance
 *
 * `stepObjective`'s driveDistance arm (objectives.ts:1251) sums position
 * deltas between frames and reads nothing else — not `tick.headlights`, not
 * `tick.isNight`. So the ONE curriculum lesson whose entire subject is the
 * light switch ticked «със светлини» green for a student who drove all 400 m
 * of it dark, in the dark. It is the same class objectives.ts already lists
 * from this sweep for reachZone gates («Мини контролната зона осветен» ✓ over
 * a dim СВЕТЛИНИ telltale, ИЗДЪРЖАН, 0 т.) — the mechanism that closed those
 * (`deriveLampDemand` / `deriveGearDemand`, a demand read off the banner and
 * enforced by `stepReachZone`) reaches no other objective kind.
 *
 * WHY A CLASS GUARD AND NOT A PIN ON THAT ROW. The row is one edit; the reason
 * it survived every earlier wave is that nothing stopped it being written. So
 * this file states the invariant instead:
 *
 *   A CURRICULUM BANNER MAY PROMISE A LAMP OR A DIRECTION ONLY ON A GATE THAT
 *   CAN WITNESS ONE.
 *
 * BOTH DIRECTIONS ARE ASSERTED, because a guard that flagged every promise
 * would be as bad as the one that flagged none: §3 requires that the four
 * shipped rows which DO promise a direction — `l7-park`, `l8-park`, `ex-park`
 * («Паркирай НА ЗАДЕН ХОД …») — keep their promise and stay unflagged, since
 * `stepParkInBay` really does refuse a bay entered nose-first
 * (objectives.ts:2134 `entryOk = params.entry === "forward" ? enteredForward :
 * usedReverse`). Stripping a true promise is a lie in the other direction.
 *
 * §4 IS THE TEETH TEST. The classifier is run against the exact string this
 * lane deleted and against the three neighbours it must NOT flag, so a matcher
 * that quietly stopped matching fails the build instead of silently emptying
 * the census — every "0 defects" report in this project was an instrument bug
 * and all of them lied in the reassuring direction.
 */

import { describe, expect, it } from "vitest";
import { EXAM_LESSON, LESSONS, POLIGON_LESSONS } from "../specs";
import { deriveGearDemand, deriveLampDemand } from "../objectives";
import type { LessonObjective, LessonSpec } from "../../contracts";

/**
 * THE PROMISE VOCABULARY, deliberately WIDER than the enforcement matcher.
 *
 * `deriveLampDemand` exists to bind a demand, so it is narrow on purpose: it
 * matches only the four phrasings `stepReachZone` can act on, and its
 * lookbehind/lookahead throw away «неосветен…» and every attributive ending so
 * that a title describing an unlit ROAD never demands a lit CAR. That
 * narrowness is right for enforcement and wrong for detection — «със
 * светлини», the string this file was written for, matches none of its four
 * regexes. A guard must cover the whole space a banner can promise in, so it
 * asks the enforcement matcher FIRST and then adds the bare lamp nouns.
 *
 * The negative lookbehind on «фар» is load-bearing: «светоФАР» is a traffic
 * light, it appears in two shipped L2 banners («Премини първото кръстовище със
 * светофар»), and a matcher that flagged it would refuse two correct rows.
 * Pinned in §4.
 */
const LAMP_NOUN = /(?<![\p{L}])(?:светлин|фар)/u;

function promisesLamp(titleBg: string): boolean {
  return deriveLampDemand(titleBg) !== undefined || LAMP_NOUN.test(titleBg);
}

/** The banner promises the car went through BACKWARDS. Reuses the production
 *  matcher verbatim — it already excludes «ЗА заден ход» (the setup pose that
 *  is reached facing forward), and a second copy of that ruling would rot. */
function promisesReverse(titleBg: string): boolean {
  return deriveGearDemand(titleBg) === "reverse";
}

/**
 * Can this gate witness a LAMP? Only `reachZone`, and only through the
 * mechanism objectives.ts built for it (a demand derived from the banner or
 * authored as `requireLamps`). Every other kind is handed `tick.headlights` and
 * throws it away.
 */
function witnessesLamp(o: LessonObjective): boolean {
  if (o.kind !== "reachZone") return false;
  const p = o.params as { requireLamps?: unknown };
  return p.requireLamps !== undefined || deriveLampDemand(o.titleBg) !== undefined;
}

/**
 * Can this gate witness a REVERSE? Two can:
 *  · `reachZone`, through `deriveGearDemand` → the disc refuses a car that
 *    crossed it in a forward gear;
 *  · `completeManeuver`/`parkInBay`, whose `entryOk` is `usedReverse` unless
 *    the spec asks for `entry: "forward"` (objectives.ts:2134).
 */
function witnessesReverse(o: LessonObjective): boolean {
  if (o.kind === "reachZone") return deriveGearDemand(o.titleBg) === "reverse";
  if (o.kind !== "completeManeuver") return false;
  const p = o.params as { maneuver?: unknown; entry?: unknown };
  return p.maneuver === "parkInBay" && p.entry !== "forward";
}

interface Row {
  lessonId: string;
  objectiveId: string;
  kind: string;
  titleBg: string;
  lamp: boolean;
  reverse: boolean;
}

const ALL: readonly LessonSpec[] = [...LESSONS, ...POLIGON_LESSONS, EXAM_LESSON];

const CENSUS: Row[] = ALL.flatMap((l) =>
  l.objectives.map((o) => ({
    lessonId: l.id,
    objectiveId: o.id,
    kind: o.kind,
    titleBg: o.titleBg,
    lamp: promisesLamp(o.titleBg),
    reverse: promisesReverse(o.titleBg),
  })),
);

describe("curriculum banner truth (lessons/specs.ts)", () => {
  it("§1 the census is real — the file still holds the lessons this guards", () => {
    // A sweep that silently found nothing would pass §2 and §3 alike.
    expect(CENSUS.length, "no objectives censused").toBeGreaterThanOrEqual(30);
    expect(ALL.map((l) => l.id)).toContain("l6-night-driving");
    expect(CENSUS.some((r) => r.objectiveId === "l6-night-route")).toBe(true);
    // …and the promise space is genuinely populated, so §3's "unflagged" half
    // is a statement about rows that exist rather than about an empty set.
    expect(CENSUS.filter((r) => r.reverse).map((r) => r.objectiveId)).toEqual([
      "l7-park",
      "l8-park",
      "ex-park",
    ]);
  });

  it("§2 no banner promises a lamp on a gate that cannot see one", () => {
    const liars = CENSUS.filter((r) => r.lamp && !ALL_WITNESS.lamp.has(r.objectiveId));
    expect(
      liars.map((r) => `${r.lessonId}/${r.objectiveId} (${r.kind}): «${r.titleBg}»`),
    ).toEqual([]);
  });

  it("§3 every banner that promises a reverse is on a gate that refuses a forward entry", () => {
    // The other direction. `l7-park` / `l8-park` / `ex-park` say «на заден ход»
    // and MUST keep saying it: `stepParkInBay` withholds the bay from a car
    // that noses in. Deleting a true promise would be the same crime pointing
    // the other way, so this fails if any of them is quietly softened.
    const unbacked = CENSUS.filter((r) => r.reverse && !ALL_WITNESS.reverse.has(r.objectiveId));
    expect(
      unbacked.map((r) => `${r.lessonId}/${r.objectiveId} (${r.kind}): «${r.titleBg}»`),
    ).toEqual([]);
    expect(CENSUS.filter((r) => r.reverse).length).toBe(3);
  });

  it("§4 the classifier has teeth — it convicts the deleted string and spares its neighbours", () => {
    // THE ROW THIS FILE WAS WRITTEN FOR, verbatim as it shipped. If this ever
    // stops being detected the guard above is decorative.
    expect(promisesLamp("Измини нощния маршрут със светлини")).toBe(true);
    // …and it is only a lie BECAUSE driveDistance cannot witness it:
    expect(
      witnessesLamp({
        id: "l6-night-route",
        titleBg: "Измини нощния маршрут със светлини",
        kind: "driveDistance",
        params: { meters: 400 },
      } as LessonObjective),
    ).toBe(false);

    // The three neighbours a wider matcher would have wrongly convicted.
    // «светоФАР» is a traffic light, not a lamp on the car:
    expect(promisesLamp("Премини първото кръстовище със светофар")).toBe(false);
    expect(promisesLamp("Премини кръстовището със знак „Стоп“")).toBe(false);
    // …and an attributive «осветено» describes the ROAD (objectives.ts's own
    // four-string ruling), so L6's second banner keeps its wording:
    expect(promisesLamp("Спри плавно на слабо осветено място")).toBe(false);

    // The reverse matcher's own exclusion, so §3 cannot start refusing setup
    // poses that are reached facing forward.
    expect(promisesReverse("Паркирай на заден ход и спри напълно")).toBe(true);
    expect(promisesReverse("Заеми изходната позиция за заден ход по права")).toBe(false);
  });
});

/** Objective ids whose gate really can witness the promise their banner makes
 *  — computed from the specs, never hand-listed, so a spec that loses its
 *  constraint drops out of here and fails §2/§3 rather than staying exempt. */
const ALL_WITNESS = {
  lamp: new Set(
    ALL.flatMap((l) => l.objectives.filter(witnessesLamp).map((o) => o.id)),
  ),
  reverse: new Set(
    ALL.flatMap((l) => l.objectives.filter(witnessesReverse).map((o) => o.id)),
  ),
};
