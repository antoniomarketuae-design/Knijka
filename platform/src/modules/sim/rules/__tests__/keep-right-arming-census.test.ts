/**
 * FOUNDER RULING 2026-10-01 «KEEP-RIGHT FOLLOWS THE LAW» — round 4, CLASS A:
 * THE GENERATED ARMING CENSUS (rule-engine level).
 *
 * WHY A CENSUS. Rounds 1–3 pinned the arming of NOT_KEEPING_RIGHT at sampled
 * points — limits 40/50/80, two-lane banks, dial speeds 45/81/95/140 — and each
 * verifier then sampled elsewhere: `speedKmh > 80 && maxSpeedKmh >= 60 &&
 * maxSpeedKmh < 80` billed a student speeding on a street posted 70 (d2-v1 has
 * twenty of them), `speedKmh > 80 && laneCount > 2` billed him on every
 * three-lane bank, and nothing turned red. A sampled point cannot answer a
 * class. This file does not sample: it GENERATES the whole grid
 *
 *   posted limit   every 10 from 20 to 140, plus 79, 80, 81
 *   dial speed     every 5 from 0 to 220, plus the moving boundary and 79/81
 *   lanes one way  2, 3, 4, 5 — and EVERY lane of each bank
 *   settlement     outside / not published
 *   motorway       yes / not published
 *   lane paint     painted / unpainted
 *   indicator      off / left / right
 *   gear           reverse / neutral / forward
 *
 * holds each state long enough to bill, and compares the engine with an
 * INDEPENDENT ORACLE written here from the retrieved text of ЗДвП чл. 15,
 * ал. 1 and ал. 2, т. 2 (content/law/acts/zdvp.json — ADR-002: retrieval, never
 * recall). The oracle does not import the engine's arming expression, its
 * ceiling constant or its sustain: the 80 is parsed out of the bank's т. 2.
 *
 * THE ORACLE, in the law's own terms
 *   ал. 1          the duty: «използва най-дясната свободна лента» where «пътните
 *                  ленти са очертани с пътна маркировка».
 *   ал. 2, т. 2    switched off «в населените места, на пътно платно с две и
 *                  повече пътни ленти за движение в една посока, обозначени с
 *                  пътна маркировка …, по които е разрешено движението … със
 *                  скорост не по-голяма от 80 кm/h».
 *   So THE ROAD binds iff it is outside a settlement, or the PERMITTED speed on
 *   it is above the retrieved ceiling; the founder ruling names the motorway as
 *   the third road. Nothing about the CAR's speed appears in either paragraph:
 *   the dial never decides.
 *   The remaining arming facts are what «being out of the rightmost lane» means
 *   to the engine and predate the ruling: a painted bank of two or more lanes,
 *   a lane left of the rightmost lane the car may use (the kerb lane is not one
 *   when it is a bus lane or an emergency lane), travelling (above the engine's
 *   5 km/h standstill line), not in reverse, no declared move to the left — and
 *   the 12 s stay.
 *
 * WHAT IS CHECKED, for every one of the generated states: the list of
 * NOT_KEEPING_RIGHT bill times equals the oracle's — `[12]` or `[]` — exactly.
 * Then the same oracle is run as a state machine over generated DRIVES in which
 * the dial, the road and the lane change under the car, and over the explicit
 * `false` spellings of every optional flag. And because a grid only answers the
 * dimensions it varies, §4 reads `interface SimTick` itself and perturbs EVERY
 * OTHER field of the tick — night, rain, lights, pedals, zones, the next stop
 * line… — one at a time and all at once: none of them may move a bill either.
 *
 * ROUND 5 — THE LATTICE MADE WHOLE WHERE IT WAS WALKED THROUGH. The round-4
 * verifier armed a town street for a car at 82–84 km/h (grid 1 holds 80, 81,
 * 85), in 4th and 5th gear (grid 1 holds −1, 0, 1; the box has five), only on
 * ticks shorter than 0.04 s and only after t = 120 s — and every grid stayed
 * green. §1b is the dense grid: EVERY integer dial speed 0–220 × EVERY gear of
 * the product's gearbox × every indicator, on every limit, in town, outside a
 * settlement and on a motorway. §1c holds
 * the stay at the tick lengths the product really produces (a 120 / 60 / 30 fps
 * frame, the 20 Hz trace sample, 0.1 s, the 0.25 s sweep fixture) and from
 * start times deep into a drive. §4 gains the two shapes it was walked through
 * with: every other tick field ACROSS the declared inputs (504 bases that vary
 * limit, road kind, lane position, indicator, dial and gear), and every PAIR of
 * other fields. What stays a lattice, said plainly: three or more other fields
 * together are not combined; a pair is not crossed with the declared inputs; a
 * numeric field takes nine values, not a range; and `events` is perturbed with
 * the empty list and ONE benign event, not with every event kind.
 *
 * The built-world half — the same property over every multi-lane edge of every
 * committed district at its real posted limit — is
 * `runtime/__tests__/keep-right-arming-built.test.ts`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { createRuleEngine, reduceTick } from "../engine";
import { DEFAULT_RULE_CONFIG, type IndicatorState, type SimTick } from "../types";
import { TRACE_SAMPLE_HZ } from "../../traces/types";
import { MANUAL_GEAR_COUNT } from "../../vehicle/driveline";
import { FIXED_DT } from "../../vehicle/tuning";
import { tick } from "./fixtures";

// ───────────────────── the law, retrieved (never recalled) ─────────────────────

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const zdvp = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "law", "acts", "zdvp.json"), "utf-8")) as {
  units: { ref: string; textBg: string }[];
};
const ART_15 = zdvp.units.filter((u) => u.ref === "чл. 15");
const art15 = ART_15[0]?.textBg ?? "";
/** ал. N of the article: from «(N) » to the next paragraph. */
function paragraph(n: number): string {
  const from = art15.indexOf(`(${n}) `);
  const to = art15.indexOf(`\n(${n + 1}) `);
  return from < 0 ? "" : art15.slice(from, to < 0 ? undefined : to);
}
const AL1 = paragraph(1);
const AL2 = paragraph(2);
/** т. K of ал. 2: the line that starts «K. ». */
const point = (k: number): string => AL2.split("\n").find((l) => l.startsWith(`${k}. `)) ?? "";
const T2 = point(2);
/** The ceiling of т. 2, read out of the bank's sentence. */
const CEILING_KMH = Number(/със скорост не по-голяма от (\d+) [кk]m\/h/u.exec(T2)?.[1] ?? Number.NaN);

// ─────────────────────────────── the oracle ────────────────────────────────

/** The engine's standstill line and the keep-right stay, typed here on purpose
 *  and held against the shipped config below — not read from it. */
const MOVING_ABOVE_KMH = 5;
const STAY_SEC = 12;

interface Road {
  limit: number;
  outside: boolean | undefined;
  motorway: boolean | undefined;
  painted: boolean | undefined;
  laneCount: number | undefined;
  /** The kerb lane is not a travel lane for the car (bus / emergency lane). */
  kerb: "none" | "bus" | "emergency";
}
interface Car {
  speed: number;
  laneId: number;
  indicator: IndicatorState;
  gear: number;
}

/** Does чл. 15, ал. 1 bind on this ROAD? The car is not an argument. */
function roadBinds(r: Road): boolean {
  const inSettlement = r.outside !== true; // not shown to be outside = in a settlement (the acquitting default)
  const permittedAtMostCeiling = r.limit <= CEILING_KMH; // «със скорост не по-голяма от 80»
  const townChoice = inSettlement && permittedAtMostCeiling; // ал. 2, т. 2 (its lane conditions are arming facts below)
  return r.motorway === true || !townChoice;
}
/** Is the car, this instant, out of the rightmost lane it may use on a road where the duty binds? */
function armed(r: Road, c: Car): boolean {
  const marked = r.painted !== false; // «очертани с пътна маркировка»
  const lanes = r.laneCount ?? 1; // unknown = one lane
  const rightmostUsable = r.kerb === "none" ? 0 : 1;
  return (
    roadBinds(r) &&
    marked &&
    lanes >= 2 &&
    c.laneId > rightmostUsable &&
    c.speed > MOVING_ABOVE_KMH &&
    c.gear >= 0 &&
    c.indicator !== "left"
  );
}
/** The stay, as a state machine of its own: one bill once the car has been
 *  armed for STAY_SEC without a break; any break ends the stay. */
function oracleBills(frames: { t: number; road: Road; car: Car }[]): number[] {
  const out: number[] = [];
  let since: number | null = null;
  let billed = false;
  for (const f of frames) {
    if (!armed(f.road, f.car)) {
      since = null;
      billed = false;
      continue;
    }
    since ??= f.t;
    if (!billed && f.t - since >= STAY_SEC) {
      billed = true;
      out.push(f.t);
    }
  }
  return out;
}

// ─────────────────────────────── the engine ────────────────────────────────

function toTick(t: number, r: Road, c: Car): SimTick {
  const over: Partial<SimTick> = {
    speedKmh: c.speed,
    maxSpeedKmh: r.limit,
    laneId: c.laneId,
    indicator: c.indicator,
    gear: c.gear,
  };
  // Optional fields are OMITTED when undefined, exactly as the runtime omits them.
  if (r.laneCount !== undefined) over.laneCount = r.laneCount;
  if (r.outside !== undefined) over.outsideSettlement = r.outside;
  if (r.motorway !== undefined) over.motorway = r.motorway;
  if (r.painted !== undefined) over.laneLinesPainted = r.painted;
  if (r.kerb === "bus") over.busLaneRight = true;
  if (r.kerb === "emergency") over.emergencyLaneRight = true;
  return tick(t, over);
}
function engineBills(frames: { t: number; road: Road; car: Car }[]): number[] {
  let s = createRuleEngine();
  const out: number[] = [];
  for (const f of frames) {
    const r = reduceTick(s, toTick(f.t, f.road, f.car));
    s = r.state;
    for (const e of r.events) if (e.kind === "violation" && e.code === "NOT_KEEPING_RIGHT") out.push(e.t);
  }
  return out;
}

// ─────────────────────────────── the grid ──────────────────────────────────

const range = (from: number, to: number, step: number): number[] =>
  Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step);
const uniqSorted = (xs: number[]): number[] => [...new Set(xs)].sort((a, b) => a - b);

/** Every posted limit from 20 to 140 (every 10), plus the boundary 79 / 80 / 81. */
const LIMITS = uniqSorted([...range(20, 140, 10), 79, 80, 81]);
/** Every dial speed from 0 to 220 (every 5), plus the standstill line and 79 / 81. */
const SPEEDS = uniqSorted([...range(0, 220, 5), 4.9, 5.1, 79, 81]);
/** Every lane of every bank of 2–5 lanes one way. */
const LANES: { laneCount: number; laneId: number }[] = [2, 3, 4, 5].flatMap((laneCount) =>
  range(0, laneCount - 1, 1).map((laneId) => ({ laneCount, laneId })),
);
const INDICATORS: IndicatorState[] = ["off", "left", "right"];
const GEARS = [-1, 0, 1];
/** A hold long enough to bill, with the instants around the 12 s line: a bill
 *  must land AT 12.0 — not at 11.9, and not later. */
const HOLD_T = [0, 6, 11.9, 12, 13];
/** ROUND 5 — every dial speed the speedometer can show: each integer 0 … 220, plus the standstill line. */
const DIALS_DENSE = uniqSorted([...range(0, 220, 1), 4.9, 5.1]);
/** ROUND 5 — every gear the product's gearbox has (reverse, neutral, 1 … MANUAL_GEAR_COUNT) and one past the top. */
const GEARS_ALL = [-1, 0, ...range(1, MANUAL_GEAR_COUNT + 1, 1)];
/** The dense grid's hold: no bill at 11.9 s, the bill at 12.0. */
const DENSE_HOLD_T = [0, 11.9, 12];
/** ROUND 5 — the tick lengths the product really produces: a 120 / 60 / 30 fps frame (60 = one physics step), the trace sample, 0.1 s, the sweep fixtures' 0.25 s. */
const RUNTIME_DT_SEC = [1 / 120, FIXED_DT, 1 / 30, 1 / TRACE_SAMPLE_HZ, 0.1, 0.25];
/** …and where in a drive the stay starts: at the start, two minutes in (off any tick lattice), an hour in. */
const START_T_SEC = [0, 137.3, 3600];
/** The grids are ~1.6 million held states; allow for a loaded machine. */
const GRID_TIMEOUT_MS = 900_000;

const describeCase = (r: Road, c: Car): string =>
  `limit ${r.limit} · dial ${c.speed} · lane ${c.laneId}/${r.laneCount ?? "?"} · outside ${r.outside} · motorway ${r.motorway} · painted ${r.painted} · kerb ${r.kerb} · indicator ${c.indicator} · gear ${c.gear}`;

interface GridResult {
  cases: number;
  expectedBilled: number;
  mismatches: string[];
  /** How many cases the oracle bills per posted limit / per dial speed. */
  billedByLimit: Map<number, number>;
  billedBySpeed: Map<number, number>;
  /** Cases on a PLAIN TOWN STREET (no settlement flag, no motorway flag, painted, limit ≤ the ceiling). */
  townCases: number;
  /** …and every one of them the ENGINE billed (the oracle is not consulted). */
  townBilledByEngine: string[];
}
function runGrid(roads: Road[], cars: (r: Road) => Car[], holdT: number[] = HOLD_T): GridResult {
  const res: GridResult = {
    cases: 0,
    expectedBilled: 0,
    mismatches: [],
    billedByLimit: new Map(),
    billedBySpeed: new Map(),
    townCases: 0,
    townBilledByEngine: [],
  };
  for (const road of roads) {
    for (const car of cars(road)) {
      const frames = holdT.map((t) => ({ t, road, car }));
      const want = oracleBills(frames);
      const got = engineBills(frames);
      res.cases++;
      if (road.outside !== true && road.motorway !== true && road.painted === true && road.limit <= 80) {
        res.townCases++;
        if (got.length > 0 && res.townBilledByEngine.length < 40) res.townBilledByEngine.push(describeCase(road, car));
      }
      if (want.length > 0) {
        res.expectedBilled++;
        res.billedByLimit.set(road.limit, (res.billedByLimit.get(road.limit) ?? 0) + 1);
        res.billedBySpeed.set(car.speed, (res.billedBySpeed.get(car.speed) ?? 0) + 1);
      }
      if (want.length !== got.length || want.some((t, i) => t !== got[i])) {
        if (res.mismatches.length < 40) res.mismatches.push(`${describeCase(road, car)} → engine ${JSON.stringify(got)}, law ${JSON.stringify(want)}`);
        else if (res.mismatches.length === 40) res.mismatches.push("… (more)");
      }
    }
  }
  return res;
}

// ─────────────────────────────── the tests ─────────────────────────────────

describe("0. the oracle is written from the bank, and its two engine numbers are the shipped ones", () => {
  it("content/law/acts/zdvp.json has ONE чл. 15; ал. 1 is the duty and ал. 2, т. 2 the town choice, in the words the oracle reads", () => {
    expect(ART_15).toHaveLength(1);
    expect(AL1).toContain("използва най-дясната свободна лента");
    expect(AL1).toContain("когато пътните ленти са очертани с пътна маркировка");
    expect(AL2).toContain("Разпоредбите на ал. 1 не се прилагат");
    expect(AL2).toContain("може да използва за движение най-удобната за него пътна лента");
    expect(T2).toContain("в населените места");
    expect(T2).toContain("с две и повече пътни ленти за движение в една посока");
    expect(T2).toContain("обозначени с пътна маркировка");
    expect(T2).toContain("по които е разрешено движението на пътни превозни средства със скорост не по-голяма от");
    // т. 1 is repealed: it is not a third exemption the oracle forgot.
    expect(point(1)).toMatch(/^1\. \(отм\./u);
  });

  it("the ceiling the oracle uses is the number in the retrieved т. 2 — 80, permitted («разрешено»), not driven", () => {
    expect(CEILING_KMH).toBe(80);
    // Neither paragraph says anything about the speed of the vehicle itself.
    expect(AL1).not.toMatch(/скорост/u);
    expect([...T2.matchAll(/скорост/gu)]).toHaveLength(1);
    expect(T2).toMatch(/разрешено движението[^;]*със скорост/u);
  });

  it("the standstill line and the stay the oracle types are the shipped config's", () => {
    expect(DEFAULT_RULE_CONFIG.movingSpeedKmh).toBe(MOVING_ABOVE_KMH);
    expect(DEFAULT_RULE_CONFIG.keepRightSustainSec).toBe(STAY_SEC);
  });

  it("the grid is the one the header states", () => {
    expect(LIMITS).toEqual([20, 30, 40, 50, 60, 70, 79, 80, 81, 90, 100, 110, 120, 130, 140]);
    expect(SPEEDS).toHaveLength(49);
    expect(SPEEDS[0]).toBe(0);
    expect(SPEEDS[SPEEDS.length - 1]).toBe(220);
    for (const v of [4.9, 5, 5.1, 79, 80, 81]) expect(SPEEDS).toContain(v);
    expect(LANES).toHaveLength(14);
  });
});

describe("1. THE GRID — every limit × every dial speed × every lane of every bank × settlement × motorway × paint × indicator × gear", () => {
  const roads: Road[] = [];
  for (const limit of LIMITS)
    for (const outside of [undefined, true] as const)
      for (const motorway of [undefined, true] as const)
        for (const painted of [true, false])
          for (const laneCount of [2, 3, 4, 5]) roads.push({ limit, outside, motorway, painted, laneCount, kerb: "none" });
  const cars = (r: Road): Car[] => {
    const out: Car[] = [];
    for (const speed of SPEEDS)
      for (let laneId = 0; laneId < (r.laneCount ?? 1); laneId++)
        for (const indicator of INDICATORS) for (const gear of GEARS) out.push({ speed, laneId, indicator, gear });
    return out;
  };
  // Run once, inside the first test that needs it (not at collection time).
  let memo: GridResult | null = null;
  const run = (): GridResult => (memo ??= runGrid(roads, cars));

  it(
    "the engine bills NOT_KEEPING_RIGHT in exactly the states the law's oracle bills, at exactly 12.0 s — and nowhere else",
    () => {
      expect(run().mismatches).toEqual([]);
    },
    GRID_TIMEOUT_MS,
  );

  it("the grid is not blind: its size, and how much of it bills", () => {
    const grid = run();
    // 15 limits × 2 × 2 × 2 roads × 14 (bank, lane) × 49 speeds × 3 indicators × 3 gears
    expect(grid.cases).toBe(15 * 2 * 2 * 2 * 14 * 49 * 3 * 3);
    // Billed: a binding road (limit > 80, or outside, or motorway), painted, a
    // non-rightmost lane (10 of the 14), a moving dial (46 of 49), indicator
    // off or right (2 of 3), neutral or forward (2 of 3).
    const bindingRoads = LIMITS.filter((l) => l > 80).length * 4 + LIMITS.filter((l) => l <= 80).length * 3;
    expect(grid.expectedBilled).toBe(bindingRoads * 10 * 46 * 2 * 2);
    expect(grid.expectedBilled).toBeGreaterThan(80000);
  });

  it("THE DIAL NEVER DECIDES: every moving dial speed bills the same number of states, and no standing one bills any", () => {
    const grid = run();
    const moving = SPEEDS.filter((v) => v > MOVING_ABOVE_KMH);
    const per = new Set(moving.map((v) => grid.billedBySpeed.get(v) ?? 0));
    expect(per.size).toBe(1);
    expect([...per][0]).toBeGreaterThan(0);
    for (const v of SPEEDS.filter((x) => x <= MOVING_ABOVE_KMH)) expect(grid.billedBySpeed.get(v) ?? 0, `dial ${v}`).toBe(0);
  });

  it("THE LIMIT DECIDES, at the retrieved ceiling: every limit ≤ 80 bills only out of town / on a motorway; every limit above it bills on every road", () => {
    const grid = run();
    const town = LIMITS.filter((l) => l <= CEILING_KMH).map((l) => grid.billedByLimit.get(l) ?? 0);
    const fast = LIMITS.filter((l) => l > CEILING_KMH).map((l) => grid.billedByLimit.get(l) ?? 0);
    expect(new Set(town).size).toBe(1);
    expect(new Set(fast).size).toBe(1);
    // 3 of the 4 (settlement × motorway) roads bind at a town limit; all 4 above it.
    expect(town[0] * 4).toBe(fast[0] * 3);
  });

  describe("the TOWN STREET, said out loud — no flag, painted, the dial anywhere from 0 to 220", () => {
    // This is the sentence of the ruling, and the one the round-3 survivors
    // broke: a town street with two or more marked lanes one way at ≤ 80 bills
    // nothing — not at 85 on a street posted 70, not on a three-lane bank, not
    // at 2.5× the limit, not 61 over it. Read off the ENGINE's bills of the same
    // run; the oracle is not consulted.
    it("limits 20–80, lanes 2–5, every lane, every dial speed, indicator and gear: NO bill", () => {
      const grid = run();
      expect(grid.townBilledByEngine).toEqual([]);
      // 8 limits ≤ 80 × 14 (bank, lane) × 49 speeds × 3 indicators × 3 gears
      expect(grid.townCases).toBe(8 * 14 * 49 * 9);
    });

    it("…and one km/h on the SIGN above the ceiling bills every moving dial speed alike, from 5.1 to 220", () => {
      const road: Road = { limit: CEILING_KMH + 1, outside: undefined, motorway: undefined, painted: true, laneCount: 2, kerb: "none" };
      for (const speed of SPEEDS) {
        const car: Car = { speed, laneId: 1, indicator: "off", gear: 1 };
        expect(engineBills(HOLD_T.map((t) => ({ t, road, car }))), `dial ${speed}`).toEqual(speed > MOVING_ABOVE_KMH ? [12] : []);
      }
    });
  });
});

describe("1b. THE DENSE GRID (round 5) — EVERY integer dial speed 0–220 × EVERY gear of the gearbox × every indicator, on every limit, in town, out of town and on a motorway", () => {
  // Grid 1 is a lattice in two dimensions the round-4 verifier walked between:
  // the dial every 5 km/h (its Q01 armed a town street for a car at 82–84; its
  // Q11 let a motorway hog go at 132–134) and gears −1 / 0 / 1 (its Q02 armed
  // 4th and 5th). Here both are WHOLE: every integer the speedometer can show
  // from 0 to 220, and every gear the product's gearbox has — reverse, neutral,
  // 1 … MANUAL_GEAR_COUNT, read from vehicle/driveline.ts, plus one past the
  // top so a gear the box does not have cannot arm either. Crossed with every
  // posted limit, three roads (a town street, a road outside a settlement, a
  // motorway), every indicator and three lane positions (the left lane of a
  // two-lane bank; the middle and the left lane of a three-lane one). Paint,
  // the wider banks and «outside AND motorway» stay grid 1's, on its lattice —
  // the price of keeping this grid to about the size of grid 1.
  const roads: Road[] = [];
  for (const limit of LIMITS)
    for (const [outside, motorway] of [
      [undefined, undefined],
      [true, undefined],
      [undefined, true],
    ] as const)
      for (const laneCount of [2, 3]) roads.push({ limit, outside, motorway, painted: true, laneCount, kerb: "none" });
  const lanesOf = (r: Road): number[] => (r.laneCount === 3 ? [1, 2] : [1]);
  const cars = (r: Road): Car[] => {
    const out: Car[] = [];
    for (const speed of DIALS_DENSE)
      for (const laneId of lanesOf(r)) for (const indicator of INDICATORS) for (const gear of GEARS_ALL) out.push({ speed, laneId, indicator, gear });
    return out;
  };
  let memo: GridResult | null = null;
  const run = (): GridResult => (memo ??= runGrid(roads, cars, DENSE_HOLD_T));

  it(
    "engine = oracle on every one: no dial value and no gear arms a town street, and none disarms a road where the duty binds",
    () => {
      expect(run().mismatches).toEqual([]);
    },
    GRID_TIMEOUT_MS,
  );

  it("the dense grid is the one stated: 223 dial speeds, every gear, its size and how much of it bills", () => {
    const grid = run();
    expect(DIALS_DENSE).toHaveLength(223);
    for (let v = 0; v <= 220; v++) expect(DIALS_DENSE).toContain(v);
    expect(GEARS_ALL).toEqual([-1, 0, ...range(1, MANUAL_GEAR_COUNT + 1, 1)]);
    expect(MANUAL_GEAR_COUNT).toBeGreaterThanOrEqual(5);
    // 15 limits × 3 roads × 3 lane positions × 223 dials × 3 indicators × (2 + MANUAL_GEAR_COUNT + 1) gears
    expect(grid.cases).toBe(15 * 3 * 3 * 223 * 3 * GEARS_ALL.length);
    // Billed: a binding road (all three above the ceiling; outside and motorway at or below it), a moving dial
    // (216 of the 223: 6 … 220 and 5.1), indicator off or right, any gear but reverse.
    const bindingRoads = LIMITS.filter((l) => l > 80).length * 3 + LIMITS.filter((l) => l <= 80).length * 2;
    expect(grid.expectedBilled).toBe(bindingRoads * 3 * 216 * 2 * (GEARS_ALL.length - 1));
    // the town street: nothing, at any integer dial, in any gear
    expect(grid.townBilledByEngine).toEqual([]);
    expect(grid.townCases).toBe(8 * 3 * 223 * 3 * GEARS_ALL.length);
  });

  it("every moving integer dial speed bills the same number of states, in every forward gear and in neutral alike", () => {
    const grid = run();
    const moving = DIALS_DENSE.filter((v) => v > MOVING_ABOVE_KMH);
    const per = new Set(moving.map((v) => grid.billedBySpeed.get(v) ?? 0));
    expect(per.size).toBe(1);
    expect([...per][0]).toBeGreaterThan(0);
    for (const v of DIALS_DENSE.filter((x) => x <= MOVING_ABOVE_KMH)) expect(grid.billedBySpeed.get(v) ?? 0, `dial ${v}`).toBe(0);
  });
});

describe("1c. THE TICKS THE PRODUCT REALLY PRODUCES (round 5) — frame-rate holds, and holds that start late in a drive", () => {
  // Every grid above ticks five times in 13 s, from t = 0. The product does
  // neither: the live scene samples once per rendered frame (120, 60 or 30 a
  // second — LessonScene's useFrame; the physics step and the scripted recorder
  // are FIXED_DT = 1/60), a recording is replayed at TRACE_SAMPLE_HZ = 20 and
  // the sweep fixtures at 0.25 s; and a lesson is minutes long. The round-4
  // verifier's Q12 armed a town street only for ticks shorter than 0.04 s, its
  // Q03 only after t = 120. So the same stay is held here tick by tick at each
  // of those lengths, starting at the beginning of a drive, two minutes in and
  // an hour in — on town roads and on binding ones, at dials on and off the
  // lattice. A bill lands on the first tick at or past 12.0 s of stay.
  const ROADS: Road[] = [
    { limit: 50, outside: undefined, motorway: undefined, painted: true, laneCount: 2, kerb: "none" },
    { limit: 70, outside: undefined, motorway: undefined, painted: true, laneCount: 3, kerb: "none" },
    { limit: 80, outside: undefined, motorway: undefined, painted: true, laneCount: 4, kerb: "none" },
    { limit: 81, outside: undefined, motorway: undefined, painted: true, laneCount: 2, kerb: "none" },
    { limit: 60, outside: true, motorway: undefined, painted: true, laneCount: 2, kerb: "none" },
    { limit: 140, outside: true, motorway: true, painted: true, laneCount: 3, kerb: "none" },
  ];
  const DIALS = [45, 83, 85, 133, 150];

  it("the tick lengths are the product's own: one physics step, and the trace sampling period", () => {
    expect(RUNTIME_DT_SEC).toContain(FIXED_DT);
    expect(RUNTIME_DT_SEC).toContain(1 / TRACE_SAMPLE_HZ);
    expect(Math.min(...RUNTIME_DT_SEC)).toBeLessThan(0.01);
    expect(Math.max(...START_T_SEC)).toBeGreaterThanOrEqual(3600);
  });

  it("at every tick length and every start time the engine's bills are the oracle's — one bill at 12 s of stay where the road binds, none on a town street", () => {
    const bad: string[] = [];
    let holds = 0;
    let billed = 0;
    for (const road of ROADS) {
      for (const speed of DIALS) {
        const car: Car = { speed, laneId: (road.laneCount ?? 2) - 1, indicator: "off", gear: 1 };
        for (const dt of RUNTIME_DT_SEC) {
          for (const start of START_T_SEC) {
            const n = Math.ceil(12.5 / dt);
            const frames = Array.from({ length: n + 1 }, (_, i) => ({ t: start + i * dt, road, car }));
            const want = oracleBills(frames);
            const got = engineBills(frames);
            holds++;
            if (want.length > 0) billed++;
            // the oracle itself: exactly one bill where the road binds, on the first tick at or past the 12 s stay
            const expected = roadBinds(road) ? [frames.find((f) => f.t - start >= STAY_SEC)!.t] : [];
            if (JSON.stringify(want) !== JSON.stringify(expected) || JSON.stringify(got) !== JSON.stringify(want)) {
              if (bad.length < 40) bad.push(`dt ${dt} · start ${start} · ${describeCase(road, car)} → engine ${JSON.stringify(got)}, law ${JSON.stringify(want)}, expected ${JSON.stringify(expected)}`);
            }
          }
        }
      }
    }
    expect(bad).toEqual([]);
    expect(holds).toBe(ROADS.length * DIALS.length * RUNTIME_DT_SEC.length * START_T_SEC.length);
    // three of the six roads bind (posted 81, outside a settlement, the motorway)
    expect(billed).toBe(holds / 2);
  });
});

describe("2. the explicit `false` spellings, an unknown lane count, the kerb lanes and a higher gear — the same oracle", () => {
  // Kept out of grid 1 only for its size. Every limit and every dial speed again.
  const roads: Road[] = [];
  for (const limit of LIMITS) {
    // explicit false flags (a caller that publishes both directions)
    roads.push({ limit, outside: false, motorway: false, painted: true, laneCount: 2, kerb: "none" });
    roads.push({ limit, outside: false, motorway: true, painted: true, laneCount: 3, kerb: "none" });
    roads.push({ limit, outside: true, motorway: false, painted: true, laneCount: 2, kerb: "none" });
    // paint not published = painted (the detector stays armed exactly as shipped)
    roads.push({ limit, outside: undefined, motorway: undefined, painted: undefined, laneCount: 2, kerb: "none" });
    roads.push({ limit, outside: true, motorway: undefined, painted: undefined, laneCount: 4, kerb: "none" });
    // lane count not published = one lane: never armed, on any road
    roads.push({ limit, outside: true, motorway: true, painted: true, laneCount: undefined, kerb: "none" });
    roads.push({ limit, outside: undefined, motorway: undefined, painted: true, laneCount: 1, kerb: "none" });
    // a bus lane / an emergency lane at the kerb: the rightmost USABLE lane is lane 1
    for (const kerb of ["bus", "emergency"] as const) {
      roads.push({ limit, outside: undefined, motorway: undefined, painted: true, laneCount: 3, kerb });
      roads.push({ limit, outside: true, motorway: undefined, painted: true, laneCount: 3, kerb });
      roads.push({ limit, outside: undefined, motorway: true, painted: true, laneCount: 4, kerb });
    }
  }
  const cars = (r: Road): Car[] => {
    const out: Car[] = [];
    for (const speed of SPEEDS)
      for (let laneId = 0; laneId < Math.max(r.laneCount ?? 2, 2); laneId++)
        for (const indicator of INDICATORS) for (const gear of [-1, 3]) out.push({ speed, laneId, indicator, gear });
    return out;
  };

  it(
    "engine = oracle on every one",
    () => {
      const grid = runGrid(roads, cars);
      expect(grid.mismatches).toEqual([]);
      expect(grid.cases).toBeGreaterThan(150000);
      expect(grid.expectedBilled).toBeGreaterThan(10000);
    },
    GRID_TIMEOUT_MS,
  );
});

describe("3. generated DRIVES — the dial, the road and the lane change under the car; the oracle is run as a state machine", () => {
  /** A small deterministic generator (mulberry32) — the drives are the same on every run. */
  function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

  it("2,000 drives of 60 s whose DIAL jumps anywhere in 5.1–220 every second on a fixed road: the bill is where a constant dial puts it", () => {
    const r = rng(20261001);
    const moving = SPEEDS.filter((v) => v > MOVING_ABOVE_KMH);
    const bad: string[] = [];
    let billedDrives = 0;
    for (let i = 0; i < 2000; i++) {
      const lanes = pick(r, LANES.filter((l) => l.laneId > 0));
      const road: Road = {
        limit: pick(r, LIMITS),
        outside: pick(r, [undefined, undefined, true] as const),
        motorway: pick(r, [undefined, undefined, undefined, true] as const),
        painted: true,
        laneCount: lanes.laneCount,
        kerb: "none",
      };
      const frames = range(0, 59, 1).map((t) => ({ t, road, car: { speed: pick(r, moving), laneId: lanes.laneId, indicator: "off" as const, gear: 1 } }));
      const got = engineBills(frames);
      const want = roadBinds(road) ? [12] : [];
      if (JSON.stringify(got) !== JSON.stringify(want) || JSON.stringify(oracleBills(frames)) !== JSON.stringify(want)) {
        bad.push(`${describeCase(road, frames[0].car)} → ${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
      }
      if (want.length > 0) billedDrives++;
    }
    expect(bad.slice(0, 20)).toEqual([]);
    // Both outcomes are well represented — the property is not vacuous.
    expect(billedDrives).toBeGreaterThan(500);
    expect(2000 - billedDrives).toBeGreaterThan(500);
  });

  it("3,000 drives of 90 s in which everything changes in stretches of 1–20 s — road, lane, paint, dial, indicator, gear: every bill time equals the oracle's", () => {
    const r = rng(15_01_02);
    const bad: string[] = [];
    let bills = 0;
    let drivesWithTwoBills = 0;
    for (let i = 0; i < 3000; i++) {
      const frames: { t: number; road: Road; car: Car }[] = [];
      let t = 0;
      let road: Road = { limit: 50, outside: undefined, motorway: undefined, painted: true, laneCount: 2, kerb: "none" };
      let car: Car = { speed: 45, laneId: 1, indicator: "off", gear: 1 };
      while (t < 90) {
        // change ONE or TWO things, keep the rest: stays survive what the law says they survive
        for (let k = 0; k < 1 + Math.floor(r() * 2); k++) {
          const what = Math.floor(r() * 8);
          if (what === 0) road = { ...road, limit: pick(r, LIMITS) };
          else if (what === 1) road = { ...road, outside: pick(r, [undefined, false, true] as const) };
          else if (what === 2) road = { ...road, motorway: pick(r, [undefined, false, true] as const) };
          else if (what === 3) road = { ...road, painted: pick(r, [true, true, true, false, undefined] as const) };
          else if (what === 4) {
            const l = pick(r, LANES);
            road = { ...road, laneCount: l.laneCount, kerb: pick(r, ["none", "none", "none", "bus", "emergency"] as const) };
            car = { ...car, laneId: l.laneId };
          } else if (what === 5) car = { ...car, speed: pick(r, SPEEDS) };
          else if (what === 6) car = { ...car, indicator: pick(r, ["off", "off", "off", "left", "right"] as const) };
          else car = { ...car, gear: pick(r, [1, 1, 1, 1, 2, 3, 0, -1]) };
        }
        const len = 1 + Math.floor(r() * 20);
        for (let k = 0; k < len && t < 90; k++, t++) {
          // the dial also wanders inside a stretch — it must not matter while moving
          const speed = car.speed > MOVING_ABOVE_KMH && r() < 0.5 ? pick(r, SPEEDS.filter((v) => v > MOVING_ABOVE_KMH)) : car.speed;
          frames.push({ t, road, car: { ...car, speed } });
        }
      }
      const want = oracleBills(frames);
      const got = engineBills(frames);
      bills += want.length;
      if (want.length >= 2) drivesWithTwoBills++;
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        bad.push(`drive ${i}: engine ${JSON.stringify(got)}, law ${JSON.stringify(want)}`);
      }
    }
    expect(bad.slice(0, 20)).toEqual([]);
    expect(bills).toBeGreaterThan(1000);
    expect(drivesWithTwoBills).toBeGreaterThan(50);
  });
});

describe("4. NOTHING ELSE ON THE TICK DECIDES — every other SimTick field, read off the interface itself, perturbed", () => {
  // Grids 1–3 vary the inputs the oracle names. A mutant can still write
  // `speedKmh > 80 && tick.isNight`, or `&& tick.rain`, or `&& tick.headlights
  // === "off"` — a dimension no grid varied, which is exactly how V02 and V03
  // survived round 3. So the list of «other fields» is not typed here: it is
  // READ from `interface SimTick` in rules/types.ts with the TypeScript parser,
  // and every member that is not one of the oracle's declared inputs is set to
  // every value its type allows (each literal of a union, both booleans, a
  // spread of numbers, a synthesized object) — one field at a time, and all of
  // them at once — over a spread of roads and dial speeds; since round 5 also
  // across the declared inputs, and two at a time. The engine's bills must
  // still be the oracle's.
  const TYPES_FILE = path.join(HERE, "..", "types.ts");
  const source = ts.createSourceFile(TYPES_FILE, readFileSync(TYPES_FILE, "utf-8"), ts.ScriptTarget.Latest, true);
  const aliases = new Map<string, ts.TypeNode>();
  const interfaces = new Map<string, ts.InterfaceDeclaration>();
  source.forEachChild((n) => {
    if (ts.isTypeAliasDeclaration(n)) aliases.set(n.name.text, n.type);
    if (ts.isInterfaceDeclaration(n)) interfaces.set(n.name.text, n);
  });
  // Round 5: 25, 40 and 150 joined — the round-4 verifier armed the rule for a
  // lead «20–60 m ahead» (Q06), a band the six earlier numbers never landed in.
  // Still a list: a band that holds none of these nine is not seen.
  const NUMBERS = [0, 1, 12.5, 25, 40, 80.5, 150, 500, -3];
  /**
   * Round 5: `events` is perturbed with the empty list AND with one benign world
   * event on every tick (the car enters a crossing's approach with nobody on
   * it) — the verifier's Q14 broke the stay on any tick that carried an event.
   * One event kind, hand-typed; not «every event».
   */
  const EVENT_SETS: SimTick["events"][] = [[], [{ kind: "crossingZoneEntered", crossingId: "c-1", pedestrianOnCrossing: false }]];

  /** Every value a type allows that this file can synthesize; null when it cannot. */
  function valuesFor(type: ts.TypeNode, depth = 0): unknown[] | null {
    if (type.kind === ts.SyntaxKind.BooleanKeyword) return [true, false];
    if (type.kind === ts.SyntaxKind.NumberKeyword) return NUMBERS;
    if (type.kind === ts.SyntaxKind.StringKeyword) return ["x", "edge-17"];
    if (ts.isParenthesizedTypeNode(type)) return valuesFor(type.type, depth);
    if (ts.isLiteralTypeNode(type)) {
      const l = type.literal;
      if (ts.isStringLiteral(l)) return [l.text];
      if (ts.isNumericLiteral(l)) return [Number(l.text)];
      if (ts.isPrefixUnaryExpression(l) && l.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(l.operand)) return [-Number(l.operand.text)];
      if (l.kind === ts.SyntaxKind.TrueKeyword) return [true];
      if (l.kind === ts.SyntaxKind.FalseKeyword) return [false];
      if (l.kind === ts.SyntaxKind.NullKeyword) return [null];
      return null;
    }
    if (ts.isUnionTypeNode(type)) {
      const parts = type.types.map((t) => valuesFor(t, depth));
      return parts.some((p) => p === null) ? null : parts.flatMap((p) => p as unknown[]);
    }
    if (ts.isArrayTypeNode(type)) return [[]];
    const members =
      ts.isTypeLiteralNode(type) ? type.members : ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) ? interfaces.get(type.typeName.text)?.members : undefined;
    if (members) {
      if (depth >= 2) return null;
      // Two objects: every member at its first value, and every member at its last.
      const first: Record<string, unknown> = {};
      const last: Record<string, unknown> = {};
      for (const m of members) {
        if (!ts.isPropertySignature(m) || !m.type) return null;
        const v = valuesFor(m.type, depth + 1);
        if (v === null) return null;
        first[m.name.getText(source)] = v[0];
        last[m.name.getText(source)] = v[v.length - 1];
      }
      return [first, last];
    }
    if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
      const alias = aliases.get(type.typeName.text);
      return alias ? valuesFor(alias, depth) : null;
    }
    return null;
  }

  /** What the oracle reads. `t` is the clock; the rest are its arguments. */
  const DECLARED = new Set([
    "t",
    "speedKmh",
    "maxSpeedKmh",
    "laneId",
    "laneCount",
    "indicator",
    "gear",
    "outsideSettlement",
    "motorway",
    "laneLinesPainted",
    "busLaneRight",
    "emergencyLaneRight",
  ]);
  const simTick = interfaces.get("SimTick");
  const props: ts.PropertySignature[] = [];
  for (const m of simTick?.members ?? []) if (ts.isPropertySignature(m)) props.push(m);
  const members = props.map((m) => {
    const name = m.name.getText(source);
    const values = m.type ? valuesFor(m.type) : null;
    return { name, values: name === "events" && values !== null ? (EVENT_SETS as unknown[]) : values };
  });
  const others = members.filter((m) => !DECLARED.has(m.name));
  const unreadable = others.filter((m) => m.values === null).map((m) => m.name);

  it("the interface is read: SimTick has the oracle's twelve inputs, and every other member can be perturbed", () => {
    expect(simTick).toBeDefined();
    expect(simTick?.heritageClauses ?? []).toEqual([]);
    for (const d of DECLARED) expect(members.some((m) => m.name === d), d).toBe(true);
    // A new SimTick field is perturbed automatically. One this file cannot
    // synthesize a value for is a RED, never a silent skip.
    expect(unreadable).toEqual([]);
    expect(others.length).toBeGreaterThanOrEqual(45);
    // `events` is perturbed with the empty list and with ONE benign event (round
    // 5). Said, so it is not mistaken for «every event».
    expect(members.find((m) => m.name === "events")?.values).toEqual(EVENT_SETS);
    expect(EVENT_SETS.map((e) => e.length)).toEqual([0, 1]);
  });

  /** A spread of roads (town, the round-3 survivors' roads, binding ones) × dial speeds, left lane, held to a bill. */
  const BASES: { road: Road; car: Car }[] = [];
  for (const road of [
    { limit: 50, outside: undefined, motorway: undefined, painted: true, laneCount: 2, kerb: "none" },
    { limit: 70, outside: undefined, motorway: undefined, painted: true, laneCount: 3, kerb: "none" },
    { limit: 80, outside: undefined, motorway: undefined, painted: true, laneCount: 4, kerb: "none" },
    { limit: 30, outside: undefined, motorway: undefined, painted: true, laneCount: 5, kerb: "none" },
    { limit: 81, outside: undefined, motorway: undefined, painted: true, laneCount: 2, kerb: "none" },
    { limit: 60, outside: true, motorway: undefined, painted: true, laneCount: 2, kerb: "none" },
    { limit: 50, outside: undefined, motorway: true, painted: true, laneCount: 3, kerb: "none" },
    { limit: 140, outside: true, motorway: true, painted: false, laneCount: 3, kerb: "none" },
  ] as Road[]) {
    for (const speed of [45, 85, 150, 220]) BASES.push({ road, car: { speed, laneId: (road.laneCount ?? 2) - 1, indicator: "off", gear: 1 } });
  }
  const billsWith = (base: { road: Road; car: Car }, over: Record<string, unknown>): number[] => {
    let s = createRuleEngine();
    const out: number[] = [];
    for (const t of HOLD_T) {
      const r = reduceTick(s, { ...toTick(t, base.road, base.car), ...over } as SimTick);
      s = r.state;
      for (const e of r.events) if (e.kind === "violation" && e.code === "NOT_KEEPING_RIGHT") out.push(e.t);
    }
    return out;
  };

  it("one field at a time: no value of any other field changes a keep-right bill, on any of the roads, at any of the dial speeds", () => {
    const bad: string[] = [];
    let runs = 0;
    for (const base of BASES) {
      const want = oracleBills(HOLD_T.map((t) => ({ t, ...base })));
      for (const m of others) {
        for (const v of m.values ?? []) {
          runs++;
          const got = billsWith(base, { [m.name]: v });
          if (JSON.stringify(got) !== JSON.stringify(want) && bad.length < 40) {
            bad.push(`${m.name} = ${JSON.stringify(v)} on ${describeCase(base.road, base.car)} → engine ${JSON.stringify(got)}, law ${JSON.stringify(want)}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
    expect(runs).toBeGreaterThan(3000);
  });

  it("all of them at once — every other field at its first value, and every one at its last: still the oracle's bills", () => {
    const first = Object.fromEntries(others.map((m) => [m.name, (m.values as unknown[])[0]]));
    const last = Object.fromEntries(others.map((m) => [m.name, (m.values as unknown[])[(m.values as unknown[]).length - 1]]));
    const bad: string[] = [];
    for (const base of BASES) {
      const want = oracleBills(HOLD_T.map((t) => ({ t, ...base })));
      for (const [label, over] of [
        ["first", first],
        ["last", last],
      ] as const) {
        const got = billsWith(base, over);
        if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`all others at their ${label} value on ${describeCase(base.road, base.car)} → engine ${JSON.stringify(got)}, law ${JSON.stringify(want)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("the property is not vacuous: the bases bill where the road binds and nowhere else", () => {
    const billed = BASES.filter((b) => oracleBills(HOLD_T.map((t) => ({ t, ...b }))).length > 0).length;
    // limit 81, outside@60 and motorway@50 bind (3 roads × 4 dials); the unpainted motorway and the four town roads do not.
    expect(billed).toBe(12);
    expect(BASES).toHaveLength(32);
  });

  // ── ROUND 5 ─ the two shapes the round-4 verifier walked through §4 with ──────
  // «One field at a time on 32 bases» left two gaps. (a) An other field crossed
  // with a DECLARED one the bases hold at a single value: rain × the right
  // indicator (its Q05), night × a street posted 40 (Q07), snow × the middle
  // lane of a three-lane bank (Q08). (b) Two OTHER fields together: night × high
  // beams (Q04), rain × high beams (Q10). Both are closed here by the same
  // perturbation, widened — not by a new mechanism.

  /** (a) Bases that vary the declared inputs too: limits × road kinds × lane positions × indicator × dial × gear. */
  const WIDE: { road: Road; car: Car }[] = [];
  for (const limit of [30, 40, 50, 70, 80, 81, 120])
    for (const [outside, motorway] of [
      [undefined, undefined],
      [true, undefined],
      [undefined, true],
    ] as const)
      for (const [laneCount, laneId] of [
        [2, 1],
        [3, 1],
        [3, 2],
      ] as const)
        for (const indicator of ["off", "right"] as const)
          for (const speed of [45, 133])
            for (const gear of [1, 4]) WIDE.push({ road: { limit, outside, motorway, painted: true, laneCount, kerb: "none" }, car: { speed, laneId, indicator, gear } });

  it(
    "one other field at a time, ACROSS the declared inputs: on every limit, road kind, lane position, indicator, dial and gear of 504 bases, no value of any other field changes a bill",
    () => {
      const bad: string[] = [];
      let runs = 0;
      for (const base of WIDE) {
        const want = oracleBills(HOLD_T.map((t) => ({ t, ...base })));
        for (const m of others) {
          for (const v of m.values ?? []) {
            runs++;
            const got = billsWith(base, { [m.name]: v });
            if (JSON.stringify(got) !== JSON.stringify(want) && bad.length < 40) {
              bad.push(`${m.name} = ${JSON.stringify(v)} on ${describeCase(base.road, base.car)} → engine ${JSON.stringify(got)}, law ${JSON.stringify(want)}`);
            }
          }
        }
      }
      expect(bad).toEqual([]);
      expect(WIDE).toHaveLength(7 * 3 * 3 * 2 * 2 * 2);
      expect(runs).toBeGreaterThan(50000);
      // both outcomes are in the bases
      const billed = WIDE.filter((b) => oracleBills(HOLD_T.map((t) => ({ t, ...b }))).length > 0).length;
      // town binds only above 80 (limits 81 and 120: 2 of 7); outside and motorway always (7 of 7 each)
      expect(billed).toBe((2 + 7 + 7) * 3 * 2 * 2 * 2);
    },
    GRID_TIMEOUT_MS,
  );

  /** (b) The values a field takes in a PAIR: all of them when it has at most four, else its first, middle and last. */
  const pairValues = (m: { values: unknown[] | null }): unknown[] => {
    const v = m.values ?? [];
    return v.length <= 4 ? v : [v[0], v[Math.floor(v.length / 2)], v[v.length - 1]];
  };
  /** One base per road of BASES (dial 85): four town roads, three binding ones, the unpainted motorway. */
  const PAIR_BASES = BASES.filter((b) => b.car.speed === 85);

  it(
    "EVERY PAIR of other fields, at every combination of their values, on each of the eight roads: still the oracle's bills",
    () => {
      const bad: string[] = [];
      let runs = 0;
      const wants = PAIR_BASES.map((base) => oracleBills(HOLD_T.map((t) => ({ t, ...base }))));
      for (let i = 0; i < others.length; i++) {
        for (let j = i + 1; j < others.length; j++) {
          for (const a of pairValues(others[i])) {
            for (const b of pairValues(others[j])) {
              PAIR_BASES.forEach((base, k) => {
                runs++;
                const got = billsWith(base, { [others[i].name]: a, [others[j].name]: b });
                if (JSON.stringify(got) !== JSON.stringify(wants[k]) && bad.length < 40) {
                  bad.push(
                    `${others[i].name} = ${JSON.stringify(a)} & ${others[j].name} = ${JSON.stringify(b)} on ${describeCase(base.road, base.car)} → engine ${JSON.stringify(got)}, law ${JSON.stringify(wants[k])}`,
                  );
                }
              });
            }
          }
        }
      }
      expect(bad).toEqual([]);
      expect(PAIR_BASES).toHaveLength(8);
      expect(wants.filter((w) => w.length > 0)).toHaveLength(3);
      // every pair of the others was run: C(n, 2) pairs, each at one combination at least, on eight roads
      expect(runs).toBeGreaterThanOrEqual(((others.length * (others.length - 1)) / 2) * 8);
    },
    GRID_TIMEOUT_MS,
  );
});
