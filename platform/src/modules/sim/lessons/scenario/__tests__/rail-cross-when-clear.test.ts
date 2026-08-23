/**
 * RAIL — „ПРЕМИНИ ПРЕЛЕЗА" IS PUBLISHED OVER AN OCCUPIED CROSSING.
 *
 * THE FRAMES.
 *   `.audit-frames/sweep161/sc-rx-unguarded/mobile-right/04-t088s.png` — the car
 *   stands at 0 км/ч on the СТОП line with «✓ Спри напълно на стоп-линията
 *   преди релсите» on the banner and a 34 m teal consist filling the windscreen.
 *   Five seconds later, `04-t093s.png` — the banner reads «Премини прелеза и
 *   стигни края на отсечката», the car is on the sleepers at 16 км/ч and the
 *   train's wheel is a car's width away. The steered re-drive
 *   (`.audit-frames/rebase/frames/sc-rx-unguarded__mobile-right/run.log`) is the
 *   same beat verbatim: `[04-t073s] ✓ Спри напълно…` → `[04-t078s] Задача 2/2
 *   Премини прелеза и стигни края на отсечката` → `[04-t089s] −10 изпитни т.
 *   Спиране върху железопътните релси`.
 *   `.audit-frames/wave-c/frames/sc-rx-guarded__pc-right/04-t076s.png` is the
 *   same defect through a boom instead of a train, and its steered re-drive
 *   banks «✓ Изчакай зад стоп-линията пред бариерата» at 1:50 and is billed
 *   «Влизане на прелез при спусната бариера» at 1:56.
 *
 * THE ROOT CAUSE, AND IT IS ONE BUG. Both drills GRADE A PLACE where the law
 * grades a MOMENT. Every rung is a `reachZone` disc: „be here, stopped" then „be
 * there". On the UNGUARDED map `stepReachZone` has nothing to read: an
 * unguarded span never sets `railGuarded`/`railBarred` (world/__tests__/
 * rail-districts.test.ts) and the TrainPassRunner emits ZERO events by
 * construction (orchestrator/runners.ts). CORRECTED 2026-08-23 — an earlier
 * draft of this header said „`SimTick` has no such field at all", which is
 * false: `SimTick` declares `railBarred` and this evaluator is handed the
 * whole tick, so on the two GUARDED drills the channel EXISTS and those discs
 * are owed a demand (see the note on `sc-rxg-finish`); §3 below is the honest
 * remedy for the unguarded row and only a partial one for those two. So on the
 * unguarded map the chain advances on
 * geometry alone: the ✓ lands the instant the wheels stop at the line, and the
 * banner it promotes is an UNCONDITIONAL IMPERATIVE TO ENTER, published into
 * precisely the seconds in which entering is the thing that kills.
 *
 * WHAT THIS FILE PINS, AND WHY IN THIS SHAPE.
 *   §1 proves the conflict is DESIGNED IN, from the template's own numbers: the
 *      consist covers the carriageway for ~3 s, and the drilled ritual (stop at
 *      the line, look left, look right, go) puts the car on the band inside that
 *      window. The train is not a bug — it is the reason the stop exists — so
 *      the remedy may never be „remove the hazard", and §1 fails if anyone does.
 *   §2 requires the AUTHORED LADDER to state the decision: no step may order the
 *      crossing without the clearance condition, and the wait duty must be
 *      stated BEFORE the order. This is the only channel the template owns that
 *      can speak before the banner does.
 *   §3 bans the entry order from the SUCCESS TITLES. A title is a ✓-able
 *      certificate, so it may not carry a condition it cannot verify
 *      (`rail-stop-gate-truth.test.ts` §2b retired «след вдигането» for exactly
 *      that) — which leaves it one honest option: not to command the entry at
 *      all, and to name the destination the disc really proves.
 *   §4 is the other direction — the hazard, the graded duty and the discs
 *      themselves are untouched, so this is authoring honesty and not an
 *      amnesty.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TrainPassSpec } from "../../../contracts";
import { TRAIN_LENGTH_M } from "../../../traffic/vehicleFleet";
import { compileScenario } from "../compile";
import {
  SC_RX_BARRIER_DROP,
  SC_RX_GUARDED,
  SC_RX_UNGUARDED,
  SCENARIO_TEMPLATES_RAIL,
} from "../templates-rail";
import type { ScenarioSpec } from "../types";

/** The three LEVEL-CROSSING drills — the ones whose map carries a railCrossing
 *  band and whose ladder therefore has a „may I enter?" moment in it. The two
 *  tram drills are junction/stop lessons and are covered by §3's sweep only. */
const CROSSING_DRILLS: readonly ScenarioSpec[] = [
  SC_RX_UNGUARDED,
  SC_RX_GUARDED,
  SC_RX_BARRIER_DROP,
];

interface RailMapPins {
  laneX: number;
  bandFromM: number;
  stopLineY: number;
  bandCenterY: number;
  maxspeedKmh: number;
  spawnY: number;
}

/** The committed district file is the source of truth for the geometry the
 *  template only mirrors (the L7 discipline) — read it, do not re-declare it. */
function railMapPins(districtId: string): RailMapPins {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "..", "content", "world", `${districtId}.json`), "utf8"),
  ) as {
    meta: {
      scenario: {
        laneCenterRightM: number;
        params: { maxspeedKmh: number };
        railCrossing: { fromM: number; stopLineY: number; bandCenterY: number };
      };
    };
    spawnPoints: Array<{ id: string; y: number }>;
  };
  const sc = raw.meta.scenario;
  const spawn = raw.spawnPoints[0];
  return {
    laneX: sc.laneCenterRightM,
    bandFromM: sc.railCrossing.fromM,
    stopLineY: sc.railCrossing.stopLineY,
    bandCenterY: sc.railCrossing.bandCenterY,
    maxspeedKmh: sc.params.maxspeedKmh,
    spawnY: spawn.y,
  };
}

function trainOf(spec: ScenarioSpec): TrainPassSpec {
  const staged = (spec.staged ?? []).find((e): e is TrainPassSpec => e.kind === "trainPass");
  if (!staged) throw new Error(`${spec.id} stages no trainPass — see §1`);
  return staged;
}

// ---------------------------------------------------------------------------
// §1 THE CONFLICT IS DESIGNED IN — arithmetic on the template's own constants
// ---------------------------------------------------------------------------

/** Seconds to cover `d` metres from rest at `a` m/s², capped at `v` m/s. */
function timeToCover(d: number, a: number, v: number): number {
  const dAccel = (v * v) / (2 * a);
  return d <= dAccel ? Math.sqrt((2 * d) / a) : v / a + (d - dAccel) / v;
}

/**
 * HALF-WIDTH of the conflict, m: the strip of the rail line the player's own
 * body occupies, centred on his lane. A learner car is ~1.8 m wide; 1.0 m each
 * side is that plus a hand's margin. Deliberately SMALLER than the lane, so the
 * window this computes is the narrowest honest one — widening it would only
 * make the overlap §1 asserts easier to find.
 */
const CONFLICT_HALF_WIDTH_M = 1.0;

/**
 * When (seconds after release) the consist COVERS the player's strip of the
 * rail line. The hold arc is measured along `railPath` from its first node, the
 * staged anchor is the consist CENTRE, and the nose/tail sit ±TRAIN_LENGTH_M/2
 * from it (traffic/vehicleFleet + orchestrator/runners TrainPassRunner.stage).
 */
function consistOccupancy(train: TrainPassSpec, laneX: number): { from: number; to: number } {
  const head = train.railPath[0];
  const holdX = head.x + train.holdOffsetM; // the rx-*-v1 line runs due east
  const half = TRAIN_LENGTH_M / 2;
  const nearEdge = laneX - CONFLICT_HALF_WIDTH_M;
  const farEdge = laneX + CONFLICT_HALF_WIDTH_M;
  // `accelMps2` is optional on the contract (staged.ts falls back to 2.6). Every
  // rail template authors it; rather than copy that fallback into a test — a
  // second place for it to drift — this refuses, so the day a template stops
  // authoring it the arithmetic below stops silently guessing.
  const accel = train.accelMps2;
  if (accel === undefined) throw new Error(`${train.id} authors no accelMps2`);
  return {
    from: timeToCover(nearEdge - (holdX + half), accel, train.cruiseSpeedMps),
    to: timeToCover(farEdge - (holdX - half), accel, train.cruiseSpeedMps),
  };
}

/**
 * When (seconds after the train's release ring is crossed) a driver performing
 * the DRILLED RITUAL puts his bonnet on the band, as a function of how long he
 * holds at the line. ORDINARY LAWFUL VALUES, not tuned ones: he is doing the
 * posted limit at the ring, brakes at 3.0 m/s² (comfortable), stands still for
 * `holdSec`, then pulls away at 2.0 m/s². The only thing §1 needs from this is
 * that a real approach takes SECONDS, not that it takes exactly these.
 */
const RITUAL_BRAKE_MPS2 = 3.0;
const RITUAL_PULLAWAY_MPS2 = 2.0;

function ritualBandEntrySec(pins: RailMapPins, train: TrainPassSpec, holdSec: number): number {
  const v = pins.maxspeedKmh / 3.6;
  // The ring is a radius around the band centre; on this straight street the
  // player meets it this far short of the line.
  const ringY = pins.bandCenterY - train.triggerPlayerDistM;
  const toLine = pins.stopLineY - ringY;
  const brakeDist = (v * v) / (2 * RITUAL_BRAKE_MPS2);
  if (brakeDist > toLine) throw new Error("the release ring is inside the braking distance");
  const cruiseSec = (toLine - brakeDist) / v;
  const brakeSec = v / RITUAL_BRAKE_MPS2;
  const lineToBand = pins.bandFromM - pins.stopLineY;
  const pullAwaySec = Math.sqrt((2 * lineToBand) / RITUAL_PULLAWAY_MPS2);
  return cruiseSec + brakeSec + holdSec + pullAwaySec;
}

/** The stop, the look left and the look right — the beat instruction 3–4 asks
 *  for, in seconds a human takes. Not a threshold: the band it spans is what
 *  makes §1's overlap a statement about STUDENTS rather than about one drive. */
const RITUAL_HOLD_RANGE_SEC = [1, 4] as const;

describe("§1 the unguarded drill stages a consist the drilled ritual drives into", () => {
  it("the consist really covers the carriageway — for seconds, not an instant", () => {
    const pins = railMapPins(SC_RX_UNGUARDED.map.districtId);
    const occ = consistOccupancy(trainOf(SC_RX_UNGUARDED), pins.laneX);
    expect(occ.to).toBeGreaterThan(occ.from);
    // A crossing hazard that blinks past in under two seconds is not a hazard a
    // student can be taught to wait for — and a train that never reaches the
    // carriageway at all is the „empty rails" this drill was built to retire.
    expect(
      occ.to - occ.from,
      `sc-rxu-train covers the lane for only ${(occ.to - occ.from).toFixed(2)}s`,
    ).toBeGreaterThanOrEqual(2);
  });

  it("…and the stop-look-go ritual lands the bonnet on the band while it is there", () => {
    const pins = railMapPins(SC_RX_UNGUARDED.map.districtId);
    const train = trainOf(SC_RX_UNGUARDED);
    const occ = consistOccupancy(train, pins.laneX);
    const [holdLo, holdHi] = RITUAL_HOLD_RANGE_SEC;
    const entryLo = ritualBandEntrySec(pins, train, holdLo);
    const entryHi = ritualBandEntrySec(pins, train, holdHi);
    // The overlap IS the defect: for some ordinary length of the drilled pause,
    // the product's second banner is published over a moving train. That is why
    // §2 exists — the ladder, not the disc, has to carry the „not yet".
    expect(
      entryLo < occ.to && entryHi > occ.from,
      `ritual band entry ${entryLo.toFixed(2)}–${entryHi.toFixed(2)}s vs consist on the lane ` +
        `${occ.from.toFixed(2)}–${occ.to.toFixed(2)}s`,
    ).toBe(true);
  });

  it("every crossing drill still stages its train (the hazard is not the bug)", () => {
    for (const spec of CROSSING_DRILLS) {
      expect(() => trainOf(spec), `${spec.id} lost its staged consist`).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// §2 THE LADDER HAS TO STATE THE DECISION
// ---------------------------------------------------------------------------

/**
 * An order to the STUDENT to enter the crossing. Second-person imperative only:
 * «премине»/«преминава» is the TRAIN or the tram doing the passing (sc-rx-tram-
 * left's «Изчакай го да премине ИЗЦЯЛО»), and a net that cannot tell those apart
 * would flag the very sentence it exists to require.
 */
const ENTRY_ORDER = /(?:^|[^а-я])(премини|преминавай|преминаваш|навлизай|навлез)(?![а-я])/iu;

/** The clause that makes an order conditional on the line being free. */
const CLEARANCE_CONDITION: readonly string[] = [
  "чак когато",
  "чак след",
  "едва след",
  "едва когато",
  "след като",
];

/** A step that says what to do when it is NOT clear — the half instruction 4
 *  of the unguarded drill was missing entirely: it said „look" and never said
 *  what looking is FOR. */
const WAIT_DUTY: readonly string[] = [
  "изчакай",
  "не се навлиза",
  "оставаш зад стоп-линията",
  "докато не отмине",
  "докато не се вдигн",
  "не влизай",
];

const hasAny = (textBg: string, markers: readonly string[]) =>
  markers.some((m) => textBg.toLowerCase().includes(m));

describe("§2b the matchers have teeth", () => {
  it("the sentence the frames caught is flagged, and the fixed one is not", () => {
    // sc-rx-unguarded instruction 5, verbatim as it shipped through sweep 161.
    const was = "Премини решително и без колебание — върху релсите не се спира никога — и продължи до края.";
    expect(ENTRY_ORDER.test(was)).toBe(true);
    expect(hasAny(was, CLEARANCE_CONDITION)).toBe(false);

    // …and the guarded drill's step 4, which always carried its condition.
    const ok = "Едва след ПЪЛНОТО вдигане на бариерите се огледай и премини решително, без спиране върху коловоза.";
    expect(ENTRY_ORDER.test(ok)).toBe(true);
    expect(hasAny(ok, CLEARANCE_CONDITION)).toBe(true);
  });

  it("a third party's passing is not an order to the student", () => {
    const tram = "Изчакай пред устието, без да навлизаш върху релсите — трамваят трябва да премине ИЗЦЯЛО, всичките му 14 метра.";
    expect(ENTRY_ORDER.test(tram)).toBe(false);
    expect(hasAny(tram, WAIT_DUTY)).toBe(true);
  });
});

describe("§2 no crossing drill orders the entry without the condition", () => {
  for (const spec of CROSSING_DRILLS) {
    it(`${spec.id}: every «премини» step carries a clearance condition`, () => {
      const offenders = spec.instructionsBg
        .filter((s) => ENTRY_ORDER.test(s.textBg) && !hasAny(s.textBg, CLEARANCE_CONDITION))
        .map((s) => `${spec.id} step ${s.n}: «${s.textBg}»`);
      expect(offenders).toEqual([]);
    });

    it(`${spec.id}: the wait duty is stated BEFORE the entry is ordered`, () => {
      const orderAt = spec.instructionsBg.findIndex((s) => ENTRY_ORDER.test(s.textBg));
      expect(orderAt, `${spec.id} never tells the student to cross at all`).toBeGreaterThanOrEqual(0);
      const waitAt = spec.instructionsBg.findIndex((s) => hasAny(s.textBg, WAIT_DUTY));
      expect(
        waitAt,
        `${spec.id} orders the crossing at step ${spec.instructionsBg[orderAt].n} and never ` +
          `states what to do when the line is not free`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        waitAt,
        `${spec.id} states the wait duty at step ${spec.instructionsBg[waitAt]?.n} — AFTER the ` +
          `order at step ${spec.instructionsBg[orderAt].n}`,
      ).toBeLessThan(orderAt);
    });

    it(`${spec.id}: the examiner card names the wait, not only the ritual`, () => {
      expect(
        hasAny(spec.teach.examinerBg, WAIT_DUTY) || hasAny(spec.teach.examinerBg, ["изчакван"]),
        `${spec.id} teach.examinerBg never names the wait`,
      ).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// §3 A ✓-ABLE BANNER MAY NOT ORDER THE ENTRY
// ---------------------------------------------------------------------------

// NOT SWEPT, AND SAID SO OUT LOUD: this loop reads SCENARIO_TEMPLATES_RAIL, so
// the sibling pack is outside it — `templates-rail2.ts` still ships
// `sc-rxq-cross` titled «Премини прелеза и излез отвъд релсите», the same
// imperative on the same kind of drill. Widening the corpus here would turn this
// file red for a lane that does not own it; the row is reported instead.
describe("§3 no rail success title commands the crossing", () => {
  it("the retired string is caught and the destination wording is not", () => {
    expect(ENTRY_ORDER.test("Премини прелеза и стигни края на отсечката")).toBe(true);
    expect(ENTRY_ORDER.test("Стигни края на отсечката отвъд прелеза")).toBe(false);
    // The two shipped titles that merely LOOK like they contain the verb.
    expect(ENTRY_ORDER.test("Приближи кръстовището с ляв мигач и премерена скорост")).toBe(false);
    expect(ENTRY_ORDER.test("Подмини спирката с острова и продължи до края на отсечката")).toBe(false);
  });

  it("no authored row, and no compiled rung, carries one", () => {
    const offenders: string[] = [];
    for (const spec of SCENARIO_TEMPLATES_RAIL) {
      for (const row of spec.success) {
        if (ENTRY_ORDER.test(row.titleBg)) {
          offenders.push(`${spec.id}/${row.id} — «${row.titleBg}»`);
        }
      }
      for (const rung of spec.levels) {
        for (const obj of compileScenario(spec, rung.level).objectives) {
          if (ENTRY_ORDER.test(obj.titleBg)) {
            offenders.push(`${spec.id} L${rung.level} ${obj.id} — «${obj.titleBg}»`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §4 NOTHING WAS TAKEN AWAY
// ---------------------------------------------------------------------------

/** The finish disc of each crossing drill, as it shipped — the retitle must be
 *  copy and only copy, so `done` stays bit-identical on every recorded drive. */
const FINISH_DISCS: ReadonlyArray<{ spec: ScenarioSpec; id: string }> = [
  { spec: SC_RX_UNGUARDED, id: "sc-rxu-finish" },
  { spec: SC_RX_GUARDED, id: "sc-rxg-finish" },
  { spec: SC_RX_BARRIER_DROP, id: "sc-rxd-finish" },
];

describe("§4 the discs, the demos and the graded duty are untouched", () => {
  it("every finish disc is still the same circle at the end of the section", () => {
    for (const row of FINISH_DISCS) {
      const authored = row.spec.success.find((o) => o.id === row.id);
      expect(authored, `${row.spec.id} lost ${row.id}`).toBeDefined();
      expect(authored!.params).toEqual({ kind: "reachZone", x: 4.06, y: 285, radiusM: 6 });
    }
  });

  it("both crossing faults are still demonstrated and still cite the rail code", () => {
    for (const spec of CROSSING_DRILLS) {
      expect(spec.mistakes.length, `${spec.id} lost a counter-demo`).toBeGreaterThanOrEqual(2);
      for (const demo of spec.mistakes) {
        expect(demo.codeRefs, `${spec.id}/${demo.titleBg}`).toContain("RAIL_CROSSING_VIOLATION");
      }
    }
  });

  it("the ladder still ORDERS the crossing — the fix is a condition, not a silence", () => {
    for (const spec of CROSSING_DRILLS) {
      expect(
        spec.instructionsBg.some((s) => ENTRY_ORDER.test(s.textBg)),
        `${spec.id} no longer tells the student to cross at all`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// §5 THE COPY AND THE ARM ARE READ FROM ONE SOURCE
// ---------------------------------------------------------------------------

/**
 * THE FRAME THIS SECTION EXISTS FOR.
 * `.audit-frames/wave-c/frames/sc-rx-guarded__pc-right/04-t076s.png` — a
 * red-and-white boom lies HORIZONTALLY ACROSS the carriageway at bonnet height,
 * and six seconds later the same drive is billed −10 «Влизане на прелез при
 * спусната бариера» (`04-t082s`) and −10 «Спиране върху железопътните релси»
 * (`04-t088s`): 20 наказателни точки · НЕИЗДЪРЖАН · 2 опасни грешки on the
 * CORRECT leg. The boom and the card agree. What did not agree was the WORDS.
 *
 * WHY THE WORDS COULD NOT AGREE, from the committed data rather than from the
 * frame. `worldRuntime` bars the span when `tSec % cycleSec` lands in
 * [downFromSec, downToSec), and `railBarrierDownAt` draws the arm off the same
 * sample — so the arm is right by construction and the only thing that can be
 * wrong is a sentence that names a phase. rx-guarded-v1 is down 40 s of every
 * 90, inside a 95 s par time; rx-drop-v1 is down [20, 60) of every 90 inside
 * 110 s. Two things follow, and both are asserted below rather than asserted
 * about:
 *   (a) THE ARM RE-CLOSES INSIDE ONE ATTEMPT — so a ladder that narrates one
 *       lift and falls silent has left the student to meet the second descent
 *       with nothing. That is the −10 above.
 *   (b) THE PHASE THE STUDENT FIRST SEES IS NOT AUTHORED — tSec runs through
 *       arrival and the briefing (the run.log opens with the demo playhead at
 *       0:23 on `01-arrival`, 0:40 on `04-t001s`), so «Бариерите са спуснати»
 *       as an opening line is a coin toss.
 *
 * THE LAW, THEREFORE: a rail sentence may NAME the arm, may teach what each
 * phase MEANS, and may condition the crossing on the lift — none of which a
 * frame can refute — but it may not state which way the arm is pointing NOW.
 *
 * WHAT THIS SECTION DOES NOT CLAIM. It does not make the guarded finish disc
 * refuse a barred entry: `tick.railBarred` IS on the tick and `stepReachZone`
 * IS handed it, but the demand that would spend it lives in `lessons/
 * objectives.ts` (see the note on `sc-rxg-finish`), which this lane does not
 * own. This is the authoring half, and it is the half that speaks first.
 */

interface RailBarrier {
  cycleSec: number;
  downFromSec: number;
  downToSec: number;
}

/** The committed timetable — the same file the runtime loads, never a copy. */
function railBarrierOf(districtId: string): RailBarrier {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "..", "content", "world", `${districtId}.json`), "utf8"),
  ) as { meta: { scenario: { railCrossing: { barrier?: RailBarrier } } } };
  const b = raw.meta.scenario.railCrossing.barrier;
  if (!b) throw new Error(`${districtId} carries no barrier timetable`);
  return b;
}

/** The two drills whose map HAS an arm (the unguarded one has none to lie about). */
const GUARDED_DRILLS: readonly ScenarioSpec[] = [SC_RX_GUARDED, SC_RX_BARRIER_DROP];

/**
 * TWO SHAPES, BECAUSE THE TWO SHIPPED SENTENCES USED BOTH — and the first draft
 * of this matcher caught only one, which is exactly what §5b exists to stop.
 *
 *   COPULA        «Бариерите СА спуснати: линията не е свободна»  ← guarded step 1
 *   ARRIVAL       «Пристигаш пред жп прелез С ВДИГНАТА бариера»   ← drop objectiveBg
 *
 * Both name the phase of THIS crossing at THIS moment, and a frame settles both.
 * Cyrillic, so substrings and explicit endings — JS `\b` is ASCII-only.
 */
// VERIFIER 2026-08-24 — THE ADJACENT FORM WAS ONE WORD WIDE. The shipped
// matcher was `бариерата\s+е` / `бариерите\s+са` / `лостът\s+е`, i.e. subject
// and copula touching. MEASURED against this file: putting «Бариерите ПРЕД ТЕБ
// са спуснати.» into guarded step 1 left all 35 tests GREEN — the same class of
// too-narrow instrument the §5b header says it exists to stop, one round later.
// Up to two words may now stand between, which covers «пред теб», «вече»,
// «сега», «в момента» and «отново». The subject/number pairing is deliberately
// dropped: this is a BAN, so matching an ungrammatical «бариерите е» costs
// nothing, while missing a grammatical assertion costs a frame.
const ARM_STATE_COPULA = /(?:бариерата|бариерите|лостът)(?:\s+\p{L}+){0,2}\s+(?:е|са)\s+(?:спуснат|вдигнат)/iu;
// `\w` is ASCII-only even under /u — the adjective ending «вдигнатА» has to be
// spelled as a letter class or the matcher silently stops matching, which is the
// instrument bug this programme has shipped four times.
const ARM_STATE_ARRIVAL = /(?:^|[^\p{L}])с(?:ъс)?\s+(?:вдигнат|спуснат)\p{L}*\s+бариер/iu;

/**
 * WHERE EACH SHAPE IS BANNED, and the split is a real distinction rather than a
 * convenience. `titleBg` / `objectiveBg` / `instructionsBg` / the success titles
 * describe THIS ATTEMPT — they are printed on the catalogue card, the briefing
 * and the banner while the arm is on screen, so a phase claim in them is a claim
 * a frame can refute, in either shape.
 *
 * `teach.*` describes THE WORLD. Its whole job is to generalise, and
 * sc-rx-barrier-drop's whenBg legitimately opens «На всеки охраняем жп прелез,
 * КЪМ КОЙТО ПРИБЛИЖАВАШ С ВДИГНАТА БАРИЕРА — тя може да тръгне надолу всеки
 * момент»: that is „whenever you meet one raised", not „this one is raised now".
 * Banning the ARRIVAL shape there would delete a correct lesson, which is the
 * failure this programme ranks worst. The COPULA shape stays banned everywhere —
 * no teach card has any business asserting the state of the arm in front of you.
 */
const ATTEMPT_COPY_BANS: readonly RegExp[] = [ARM_STATE_COPULA, ARM_STATE_ARRIVAL];
const TEACH_COPY_BANS: readonly RegExp[] = [ARM_STATE_COPULA];

/** The EVENT the second descent needs named: the arm can go back down on you. */
const RECLOSE_DUTY: readonly string[] = [
  "пак надолу",
  "отново надолу",
  "пак се спуска",
  "отново се спуска",
];

/**
 * …AND THE ACT THAT MUST TRAVEL WITH IT — verifier 2026-08-24.
 *
 * `RECLOSE_DUTY` alone matches the EVENT, not the duty, and a marker is not a
 * rule. MEASURED: replacing the new step with «Тръгне ли лостът ПАК НАДОЛУ,
 * докато чакаш — МИНАВАЙ БЪРЗО, преди да е легнал.» left all 35 tests green —
 * a gate named „the ladder states the duty" passing an instruction to race a
 * descending boom, which is the fatal act both mistake demos on these two maps
 * exist to convict. §2's `ENTRY_ORDER` does not catch it either: its
 * alternation is «премини|преминавай|преминаваш|навлизай|навлез», and «минавай»
 * / «мини» are not in it (REPORTED to §2's owner rather than widened here — that
 * regex also sweeps the compiled objectives of five templates).
 *
 * So the step that raises the re-closure must also state the STOP. «чакаш» and
 * «изчакай» are deliberately NOT on this list: the refuted sentence above
 * contains «чакаш» incidentally, in a subordinate clause, while ordering the
 * opposite.
 */
const RECLOSE_STOP: readonly string[] = [
  "спираш",
  "спри",
  "спирай",
  "не влизай",
  "не навлизай",
  "оставаш зад",
];

/** The sentences that speak about the drive in progress. */
function attemptCopy(spec: ScenarioSpec): ReadonlyArray<{ where: string; text: string }> {
  return [
    { where: "titleBg", text: spec.titleBg },
    { where: "objectiveBg", text: spec.objectiveBg },
    ...spec.instructionsBg.map((s) => ({ where: `instruction ${s.n}`, text: s.textBg })),
    ...spec.success.map((o) => ({ where: `success ${o.id}`, text: o.titleBg })),
  ];
}

/** The sentences that speak about the world. */
function teachCopy(spec: ScenarioSpec): ReadonlyArray<{ where: string; text: string }> {
  return [
    { where: "teach.whenBg", text: spec.teach.whenBg },
    { where: "teach.whyBg", text: spec.teach.whyBg },
    { where: "teach.examinerBg", text: spec.teach.examinerBg },
  ];
}

describe("§5b the matchers have teeth", () => {
  it("both shipped shapes are flagged, and neither string survives in the file", () => {
    // sc-rx-guarded step 1 and sc-rx-barrier-drop's objectiveBg, verbatim as
    // they shipped through the wave-c drive that produced the frames above.
    const wasGuarded =
      "Потегли по улицата — напред има охраняем жп прелез (знак А34). Бариерите са спуснати: линията не е свободна.";
    const wasDrop =
      "Пристигаш пред жп прелез с вдигната бариера — но тя тръгва надолу пред теб. Спри зад стоп-линията и изчакай пълното ѝ вдигане; не се гмуркай под спускащата се бариера и никога не спирай върху релсите.";
    expect(ARM_STATE_COPULA.test(wasGuarded)).toBe(true);
    expect(ARM_STATE_ARRIVAL.test(wasDrop)).toBe(true);
    // …and each shape is caught by the ban list its channel carries.
    expect(ATTEMPT_COPY_BANS.some((re) => re.test(wasGuarded))).toBe(true);
    expect(ATTEMPT_COPY_BANS.some((re) => re.test(wasDrop))).toBe(true);
    // …and neither string is what the file holds today.
    for (const spec of GUARDED_DRILLS) {
      for (const row of [...attemptCopy(spec), ...teachCopy(spec)]) {
        expect(row.text, `${spec.id} ${row.where}`).not.toBe(wasGuarded);
        expect(row.text, `${spec.id} ${row.where}`).not.toBe(wasDrop);
      }
    }
  });

  it("the two mutations that walked THROUGH this section are flagged now", () => {
    // Verifier 2026-08-24. Both were applied to the shipping file and left all
    // 35 tests green; both are here so the holes cannot reopen silently.
    const spacedCopula = "Потегли по улицата — напред има охраняем жп прелез (знак А34). Бариерите пред теб са спуснати.";
    expect(ARM_STATE_COPULA.test(spacedCopula)).toBe(true);
    expect(ATTEMPT_COPY_BANS.some((re) => re.test(spacedCopula))).toBe(true);
    expect(TEACH_COPY_BANS.some((re) => re.test(spacedCopula))).toBe(true);
    for (const alsoSpaced of [
      "Бариерата вече е спусната.",
      "Лостът в момента е вдигнат.",
      "Бариерите сега са вдигнати.",
    ]) {
      expect(ARM_STATE_COPULA.test(alsoSpaced), alsoSpaced).toBe(true);
    }

    const raceTheBoom = "Тръгне ли лостът пак надолу, докато чакаш — минавай бързо, преди да е легнал.";
    expect(RECLOSE_DUTY.some((m) => raceTheBoom.toLowerCase().includes(m))).toBe(true); // event named…
    expect(hasAny(raceTheBoom, RECLOSE_STOP)).toBe(false); // …duty absent → red
    const shippedStep = "Тръгне ли лостът пак надолу, докато чакаш или приближаваш — спираш пак зад стоп-линията.";
    expect(hasAny(shippedStep, RECLOSE_STOP)).toBe(true);
  });

  it("naming the phase as a CONDITION, a MEANING or a clause is not an assertion", () => {
    for (const legitimate of [
      "Едва след ПЪЛНОТО вдигане на бариерите се огледай и премини решително, без спиране върху коловоза.",
      "Спуснати или СПУСКАЩИ СЕ бариери значат едно: влак в участъка.",
      "На охраняем прелез лостът решава: докато е спуснат или се спуска, чакаш зад стоп-линията.",
      "Тръгне ли лостът пак надолу, докато чакаш или приближаваш — спираш пак зад стоп-линията.",
      "Изчакай търпеливо: лостът се вдига чак когато линията е чиста.",
      "При вдигнати бариери преминаваш без спиране — но винаги с готовност.",
    ]) {
      expect(ATTEMPT_COPY_BANS.some((re) => re.test(legitimate)), legitimate).toBe(false);
    }
  });

  it("the teach card may still generalise about a raised arm — and may not assert one", () => {
    const generalisation =
      "На всеки охраняем жп прелез, към който приближаваш с вдигната бариера — тя може да тръгне надолу всеки момент.";
    expect(ARM_STATE_ARRIVAL.test(generalisation)).toBe(true); // the shape is there…
    expect(TEACH_COPY_BANS.some((re) => re.test(generalisation))).toBe(false); // …and allowed here
    expect(TEACH_COPY_BANS.some((re) => re.test("Бариерите са спуснати пред теб."))).toBe(true);
  });

  it("the re-close marker catches the new step and not the old ladder", () => {
    expect(
      RECLOSE_DUTY.some((m) =>
        "Тръгне ли лостът пак надолу, докато чакаш или приближаваш — спираш пак зад стоп-линията."
          .toLowerCase()
          .includes(m),
      ),
    ).toBe(true);
    // The ladder as it shipped: five steps, one lift, nothing after it.
    const shippedLadder = [
      "Потегли по улицата — напред има охраняем жп прелез (знак А34). Бариерите са спуснати: линията не е свободна.",
      "Намали отрано и спри зад стоп-линията — не плътно до бариерата и никога върху релсите.",
      "Изчакай търпеливо: бариерата се вдига чак когато линията е чиста. Не се промъквай и не криволичи покрай нея — никога.",
      "Едва след ПЪЛНОТО вдигане на бариерите се огледай и премини решително, без спиране върху коловоза.",
      "Продължи спокойно до края на отсечката.",
    ].join(" ");
    expect(RECLOSE_DUTY.some((m) => shippedLadder.toLowerCase().includes(m))).toBe(false);
  });
});

describe("§5 the arm re-closes inside one attempt, and the copy says so", () => {
  for (const spec of GUARDED_DRILLS) {
    it(`${spec.id}: the template's timetable is the district's, to the second`, () => {
      const b = railBarrierOf(spec.map.districtId);
      // The L7 mirror, and the guard on this file's own constants: zero the
      // cycle or widen the window here and the copy law below stops describing
      // the world, so it has to fail out loud rather than drift.
      expect({
        barrierCycleSec: spec.map.params.barrierCycleSec,
        barrierDownFromSec: spec.map.params.barrierDownFromSec,
        barrierDownToSec: spec.map.params.barrierDownToSec,
      }).toEqual({
        barrierCycleSec: b.cycleSec,
        barrierDownFromSec: b.downFromSec,
        barrierDownToSec: b.downToSec,
      });
      expect(b.downToSec, `${spec.map.districtId} is barred forever`).toBeLessThan(b.cycleSec);
      expect(b.downToSec).toBeGreaterThan(b.downFromSec);
    });

    it(`${spec.id}: a whole down→up→down fits inside the drill's own par time`, () => {
      const b = railBarrierOf(spec.map.districtId);
      const par = spec.rubric?.parTimeSec;
      expect(par, `${spec.id} authors no parTimeSec`).toBeDefined();
      // THE PREMISE OF THE COPY LAW, measured rather than assumed. One full
      // period inside par means no student — however he starts, whatever the
      // session clock had already burnt on the briefing — can complete this
      // drill without the arm changing state at least twice.
      expect(
        b.cycleSec,
        `${spec.id}: cycle ${b.cycleSec}s vs par ${String(par)}s — if the arm was DELIBERATELY ` +
          `made one-shot, relax this premise and the re-close duty below together, in one edit`,
      ).toBeLessThanOrEqual(par!);
    });

    it(`${spec.id}: no sentence about THIS attempt states which way the arm points`, () => {
      const offenders = attemptCopy(spec)
        .filter((row) => ATTEMPT_COPY_BANS.some((re) => re.test(row.text)))
        .map((row) => `${spec.id} ${row.where}: «${row.text}»`);
      expect(offenders, offenders.join("\n")).toEqual([]);
    });

    it(`${spec.id}: no teach card asserts the arm's state either`, () => {
      const offenders = teachCopy(spec)
        .filter((row) => TEACH_COPY_BANS.some((re) => re.test(row.text)))
        .map((row) => `${spec.id} ${row.where}: «${row.text}»`);
      expect(offenders, offenders.join("\n")).toEqual([]);
    });

    it(`${spec.id}: the ladder states the duty for the arm coming back DOWN`, () => {
      const stated = spec.instructionsBg.filter((s) =>
        RECLOSE_DUTY.some((m) => s.textBg.toLowerCase().includes(m)),
      );
      expect(
        stated.length,
        `${spec.id} narrates one lift and stops — the arm returns every ` +
          `${railBarrierOf(spec.map.districtId).cycleSec}s and the student is told nothing`,
      ).toBeGreaterThan(0);
      // …and at least one of those steps says what to DO, not merely that it
      // happens (see RECLOSE_STOP — a marker-only gate passed «минавай бързо»).
      const withDuty = stated.filter((s) => hasAny(s.textBg, RECLOSE_STOP));
      expect(
        withDuty.map((s) => s.n),
        `${spec.id} names the second descent but never orders the stop:\n` +
          stated.map((s) => `  step ${s.n}: «${s.textBg}»`).join("\n"),
      ).not.toEqual([]);
    });
  }

  it("the lesson CARD carries the condition too, not only the briefing", () => {
    // `compile.ts` puts `objectiveBg` on `LessonSpec.descriptionBg` — the
    // paragraph `LessonCard` prints in the catalogue, read before the briefing
    // card exists. §2 swept `instructionsBg` alone, so this sentence kept the
    // unconditional „stop, look, cross" the frames caught.
    const was =
      "Премини неохраняемия жп прелез по желязното правило: пълно спиране преди релсите, оглеждане наляво и надясно по линията и решително преминаване — без да спираш върху коловоза.";
    expect(ENTRY_ORDER.test(was)).toBe(true);
    expect(hasAny(was, CLEARANCE_CONDITION)).toBe(false);

    const offenders = CROSSING_DRILLS.filter(
      (spec) => ENTRY_ORDER.test(spec.objectiveBg) && !hasAny(spec.objectiveBg, CLEARANCE_CONDITION),
    ).map((spec) => `${spec.id}: «${spec.objectiveBg}»`);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("nothing was taken away: the wait duty still precedes the order on every ladder", () => {
    for (const spec of CROSSING_DRILLS) {
      const orderAt = spec.instructionsBg.findIndex((s) => ENTRY_ORDER.test(s.textBg));
      const waitAt = spec.instructionsBg.findIndex((s) => hasAny(s.textBg, WAIT_DUTY));
      expect(orderAt, spec.id).toBeGreaterThanOrEqual(0);
      expect(waitAt, spec.id).toBeGreaterThanOrEqual(0);
      expect(waitAt, spec.id).toBeLessThan(orderAt);
      // …and the numbering the compiler validates is still contiguous.
      expect(spec.instructionsBg.map((s) => s.n)).toEqual(
        spec.instructionsBg.map((_, i) => i + 1),
      );
    }
  });
});
