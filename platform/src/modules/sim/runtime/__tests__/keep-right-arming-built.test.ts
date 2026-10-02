/**
 * FOUNDER RULING 2026-10-01 «KEEP-RIGHT FOLLOWS THE LAW» — round 4, CLASS A:
 * THE ARMING CENSUS ON THE BUILT WORLD.
 *
 * `rules/__tests__/keep-right-arming-census.test.ts` runs the generated grid on
 * hand-built ticks. This file runs the same property on what the product
 * actually ships: EVERY edge with two or more lanes one way, on EVERY committed
 * district, at ITS OWN posted limit, in EVERY lane of the bank, in both
 * directions of a two-way road, with the dial at every speed from 0 to 220.
 *
 * WHY. The round-3 verifier's V02 (`speedKmh > 80` on a street posted 60–79)
 * and V03 (`speedKmh > 80` on a bank of three or more lanes) both changed a
 * bill on a committed map — d2-v1 has boulevards posted 70 with two and three
 * lanes one way — while every test of rounds 1–3 stayed green, because the
 * built-world tests drove three boulevards posted 40 and 50. Nothing here is a
 * chosen boulevard: the edge list is computed from content/world.
 *
 * THE ORACLE is independent of the engine and of the runtime's own flags. The
 * ROAD half is read from the RAW district JSON:
 *     ал. 1 binds  ⇔  edge.motorway === true  ||  edge.maxspeed > 80
 * (80 is parsed out of ЗДвП чл. 15, ал. 2, т. 2 in content/law/acts/zdvp.json;
 * «outside a settlement» is the world builder's AUTHORED limit of ≥ 90, which
 * is above 80 by itself — §0 measures that no committed edge is outside a
 * settlement at ≤ 80, so the two terms above are the whole oracle here).
 * The lane half is what the runtime measured for the pose — lane, lanes one
 * way, paint, kerb lane — because «out of the rightmost lane» is a fact about
 * where the car is. The dial is NOT an argument of the road half.
 *
 * WHAT IS HELD
 *   0. the edge census itself (how many edges, which limits) and that the
 *      oracle's two terms cover the settlement predicate;
 *   1. the runtime's road half does not move with the dial (same pose, dial at
 *      30 / 85 / 150 / 220 by day and — round 5 — at 120 at night → the same
 *      lane, lane count, limit, flags, paint);
 *   2. on every (edge, direction, lane): the engine's NOT_KEEPING_RIGHT bills
 *      equal the oracle's at every dial speed — and a town edge bills NOTHING
 *      at any of them;
 *   3. coverage: how many stays really held a painted non-rightmost lane for
 *      the whole 15 s, per posted limit and per lane count, and WHY each of
 *      the others did not (an edge the junction trim leaves unpainted end to
 *      end; a carriageway lying under a parallel one) — held by floors, so a
 *      census that silently stops reaching the 70-posted or the three-lane
 *      edges is a red, not a green, while a new map needs no edit here.
 *
 * HOW A STAY IS BUILT. For each (edge, direction, lane) the edge is probed at
 * 49 positions and the stay is held inside the longest painted run of that
 * lane: 15 samples one second apart (t = 1 … 15), so an armed stay bills at
 * t = 13. The car does not really cover the metres the dial says — the rule
 * reads the TICK, and the road half of each tick is the built map's own (§1).
 * The whole report: KEEP_RIGHT_BUILT_DUMP=/abs/path.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createWorldRuntime, parseDistrict, type District, type DistrictEdge } from "..";
import { LANE_WIDTH_M } from "../spatial";
import { isExtraUrbanCarriageway } from "../../world/builders/constants";
import { createRuleEngine, reduceTick } from "../../rules/engine";
import type { SimTick } from "../../rules/types";
import { drive, edgeDrivePath } from "./helpers";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const WORLD_DIR = path.join(REPO_ROOT, "content", "world");

// ───────────────────── the law, retrieved (never recalled) ─────────────────────
const zdvp = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "content", "law", "acts", "zdvp.json"), "utf-8")) as {
  units: { ref: string; textBg: string }[];
};
const T2 =
  zdvp.units
    .find((u) => u.ref === "чл. 15")
    ?.textBg.split("\n")
    .find((l) => l.startsWith("2. ") && l.includes("в населените места")) ?? "";
const CEILING_KMH = Number(/със скорост не по-голяма от (\d+) [кk]m\/h/u.exec(T2)?.[1] ?? Number.NaN);

// ─────────────────────────────── the edges ─────────────────────────────────

interface RawEdge {
  id: string;
  lanes: number;
  oneway: boolean;
  maxspeed: number;
  maxspeedSource?: string;
  motorway?: boolean;
  class: string;
  length: number;
}
const perDirection = (e: { lanes: number; oneway: boolean }): number => (e.oneway ? e.lanes : Math.floor(e.lanes / 2));
/** The oracle's road half: does ал. 1 bind on this edge, by the RAW map? */
const rawBinds = (e: RawEdge): boolean => e.motorway === true || e.maxspeed > CEILING_KMH;

const DISTRICT_FILES = fs
  .readdirSync(WORLD_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

interface Loaded {
  id: string;
  district: District;
  raw: Map<string, RawEdge>;
  multi: DistrictEdge[];
}
const LOADED: Loaded[] = DISTRICT_FILES.map((f) => {
  const doc = JSON.parse(fs.readFileSync(path.join(WORLD_DIR, f), "utf-8")) as { roads: { edges: RawEdge[] } };
  const district = parseDistrict(doc);
  return {
    id: f.replace(/\.json$/u, ""),
    district,
    raw: new Map(doc.roads.edges.map((e) => [e.id, e])),
    multi: (district.roads.edges as DistrictEdge[]).filter((e) => perDirection(e) >= 2),
  };
});

// ─────────────────────────────── the drives ────────────────────────────────

const range = (from: number, to: number, step: number): number[] =>
  Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step);
/** Every dial speed from 0 to 220 (every 5), plus the standstill line and 79 / 81. */
const SPEEDS = [...new Set([...range(0, 220, 5), 4.9, 5.1, 79, 81])].sort((a, b) => a - b);
/** The dial speeds at which the runtime itself is sampled (§1). */
const SAMPLED_DIALS = [30, 85, 150, 220];
/**
 * The runs each stay is sampled with (§1), a fresh runtime each: the four dials
 * by day, and — round 5 — one more AT NIGHT with the dial at 120. The round-4
 * verifier made the runtime call every edge «outside a settlement» for a car
 * between 100 and 140 km/h (Q09) and at night (Q13); neither was sampled. This
 * is one more sample, not a census of the dial or of the clock: a runtime that
 * moved the road half only at, say, 95–115 by day is still not seen here.
 */
const SAMPLED_RUNS: { dial: number; night: boolean }[] = [...SAMPLED_DIALS.map((dial) => ({ dial, night: false })), { dial: 120, night: true }];
const STAY_SAMPLES = 15; // one per second: t = 1 … 15, three seconds past the 12 s stay
const PROBES = 49; // positions probed along each edge, per lane and direction, to find a painted stretch
const MOVING_ABOVE_KMH = 5;
const STAY_SEC = 12;

/** How far RIGHT of the edge's centreline lane `k` (0 = rightmost) of `n` lanes one way lies. */
function laneRightOffset(edge: DistrictEdge, n: number, k: number): number {
  return edge.oneway ? ((n - 1) / 2 - k) * LANE_WIDTH_M : (n - k - 0.5) * LANE_WIDTH_M;
}

/** The road half of a tick — everything the keep-right detector reads except the car. */
const roadHalf = (t: SimTick) => ({
  edgeId: t.edgeId ?? null,
  laneId: t.laneId,
  laneCount: t.laneCount,
  maxSpeedKmh: t.maxSpeedKmh,
  outsideSettlement: t.outsideSettlement,
  motorway: t.motorway,
  laneLinesPainted: t.laneLinesPainted,
  busLaneRight: t.busLaneRight,
  emergencyLaneRight: t.emergencyLaneRight,
});

function engineBills(ticks: SimTick[]): number[] {
  let s = createRuleEngine();
  const out: number[] = [];
  for (const t of ticks) {
    const r = reduceTick(s, t);
    s = r.state;
    for (const e of r.events) if (e.kind === "violation" && e.code === "NOT_KEEPING_RIGHT") out.push(e.t);
  }
  return out;
}
/** The stay as its own state machine, over the RAW map's road half. */
function oracleBills(ticks: SimTick[], raw: Map<string, RawEdge>, dial: number): number[] {
  const out: number[] = [];
  let since: number | null = null;
  let billed = false;
  for (const t of ticks) {
    const edge = t.edgeId ? raw.get(t.edgeId) : undefined;
    const kerb = t.busLaneRight === true || t.emergencyLaneRight === true ? 1 : 0;
    const armed =
      edge !== undefined &&
      rawBinds(edge) &&
      t.laneLinesPainted !== false &&
      (t.laneCount ?? 1) >= 2 &&
      t.laneId > kerb &&
      dial > MOVING_ABOVE_KMH &&
      t.gear >= 0 &&
      t.indicator !== "left";
    if (!armed) {
      since = null;
      billed = false;
      continue;
    }
    since ??= t.t;
    if (!billed && t.t - since >= STAY_SEC) {
      billed = true;
      out.push(t.t);
    }
  }
  return out;
}

interface Stay {
  key: string;
  district: string;
  edge: RawEdge;
  lanesOneWay: number;
  lane: number;
  /** Every one of the 15 samples sat on this edge, in this lane of this bank, on painted lines. */
  clean: boolean;
  /** Why not, when not — the FIRST reason met along the stay. */
  why: "clean" | "another-edge" | "off-network" | "another-lane" | "another-lane-count" | "unpainted" | "short";
  ticks: SimTick[];
}

/** All stays, computed once: (district, multi-lane edge, direction, lane). */
let memo: { stays: Stay[]; dialDrift: string[]; limitDrift: string[] } | null = null;
function allStays() {
  if (memo) return memo;
  const stays: Stay[] = [];
  const dialDrift: string[] = [];
  const limitDrift: string[] = [];
  for (const d of LOADED) {
    if (d.multi.length === 0) continue;
    for (const edge of d.multi) {
      const n = perDirection(edge);
      const dirs: (1 | -1)[] = edge.oneway ? [1] : [1, -1];
      for (const dir of dirs) {
        for (let lane = 0; lane < n; lane++) {
          const offset = laneRightOffset(edge, n, lane);
          // WHERE on the edge to hold. A real map trims the lane lines at its
          // junctions and runs carriageways side by side, so «the middle of the
          // edge» is often not a painted stretch of this lane. Probe the whole
          // edge in travel order and hold the stay inside the LONGEST run of
          // probes that sit on this edge, in this lane of this bank, on painted
          // lines; with no such run, hold the middle and let §3 count it.
          const along = (f: number) => (dir === 1 ? f : 1 - f) * edge.length;
          const probeF = range(0, PROBES - 1, 1).map((i) => 0.02 + (0.96 * i) / (PROBES - 1));
          const probePoses = probeF.map((f) => edgeDrivePath(edge, along(f), along(Math.min(f + 0.001, 1)), 1, offset)[0]);
          const probed = drive(createWorldRuntime(d.district), probePoses, { dtSec: 1, speedKmh: 30 }).ticks;
          const ok = probed.map((t) => t.edgeId === edge.id && t.laneId === lane && t.laneCount === n && t.laneLinesPainted !== false);
          let best: [number, number] | null = null;
          for (let i = 0; i < ok.length; i++) {
            if (!ok[i]) continue;
            let j = i;
            while (j + 1 < ok.length && ok[j + 1]) j++;
            if (best === null || j - i > best[1] - best[0]) best = [i, j];
            i = j;
          }
          // Stay strictly inside the run (a probe's width from each end) when it is long enough.
          const [f0, f1] =
            best === null
              ? [0.3, 0.7]
              : best[1] - best[0] >= 4
                ? [probeF[best[0] + 1], probeF[best[1] - 1]]
                : [probeF[best[0]], probeF[best[1]]];
          const s0 = along(f0);
          const s1 = along(f1);
          const stepM = Math.max(Math.abs(s1 - s0) / (STAY_SAMPLES - 1), 1e-6);
          const poses =
            Math.abs(s1 - s0) < 1e-3
              ? Array.from({ length: STAY_SAMPLES }, () => probePoses[best![0]])
              : edgeDrivePath(edge, s0, s1, stepM, offset).slice(0, STAY_SAMPLES);
          const key = `${d.id}:${edge.id}:${dir === 1 ? "fwd" : "back"}:lane${lane}/${n}`;
          // A FRESH runtime per drive: the runtime commits to a lane and an edge
          // with hysteresis, so a reused one would carry the previous stay into
          // the first samples of this one and be read here as «the dial moved it».
          const runs = SAMPLED_RUNS.map((r) => drive(createWorldRuntime(d.district), poses, { dtSec: 1, speedKmh: r.dial, isNight: r.night }).ticks);
          const base = runs[0];
          for (let i = 1; i < runs.length; i++) {
            if (JSON.stringify(runs[i].map(roadHalf)) !== JSON.stringify(base.map(roadHalf))) {
              dialDrift.push(`${key} @ dial ${SAMPLED_RUNS[i].dial}${SAMPLED_RUNS[i].night ? " at night" : ""}`);
            }
          }
          const raw = d.raw.get(edge.id)!;
          for (const t of base) {
            const e = t.edgeId ? d.raw.get(t.edgeId) : undefined;
            if (e && t.maxSpeedKmh !== e.maxspeed) limitDrift.push(`${key}: tick ${t.maxSpeedKmh} vs map ${e.maxspeed}`);
          }
          const clean =
            base.length === STAY_SAMPLES &&
            base.every((t) => t.edgeId === edge.id && t.laneId === lane && t.laneCount === n && t.laneLinesPainted !== false);
          let why: Stay["why"] = "clean";
          if (base.length !== STAY_SAMPLES) why = "short";
          else
            for (const t of base) {
              if (t.edgeId === null || t.edgeId === undefined) why = "off-network";
              else if (t.edgeId !== edge.id) why = "another-edge";
              else if (t.laneCount !== n) why = "another-lane-count";
              else if (t.laneId !== lane) why = "another-lane";
              else if (t.laneLinesPainted === false) why = "unpainted";
              if (why !== "clean") break;
            }
          stays.push({ key, district: d.id, edge: raw, lanesOneWay: n, lane, clean, why, ticks: base });
        }
      }
    }
  }
  memo = { stays, dialDrift, limitDrift };
  return memo;
}
const rawOf = new Map(LOADED.map((d) => [d.id, d.raw]));
const TIMEOUT_MS = 900_000;

// ─────────────────────────────── the tests ─────────────────────────────────

describe("0. the edge census: what «every multi-lane edge of every committed district» is today", () => {
  it("the ceiling is the bank's 80", () => {
    expect(CEILING_KMH).toBe(80);
  });

  it("the edges the census walks are computed from content/world — today 223 with two or more lanes one way, on 20 districts", () => {
    // Floors, not pins: a new map or a new boulevard must not need this file
    // edited — it is walked automatically. What may NOT happen silently is the
    // census losing the edges the round-3 survivors lived on: town banks of two
    // AND of three or more lanes, posted 60–79, and the motorway carriageways.
    const withMulti = LOADED.filter((d) => d.multi.length > 0);
    expect(DISTRICT_FILES.length).toBeGreaterThanOrEqual(106);
    expect(withMulti.length).toBeGreaterThanOrEqual(20);
    const by: Record<string, number> = {};
    for (const d of withMulti) {
      for (const e of d.multi) {
        const k = `${perDirection(e)} lanes @ ${e.maxspeed}${d.raw.get(e.id)!.motorway === true ? " motorway" : ""}`;
        by[k] = (by[k] ?? 0) + 1;
      }
    }
    if (process.env.KEEP_RIGHT_BUILT_DUMP) fs.writeFileSync(`${process.env.KEEP_RIGHT_BUILT_DUMP}.edges.json`, JSON.stringify(by, null, 1));
    const total = Object.values(by).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(223);
    expect(by["2 lanes @ 70"] ?? 0).toBeGreaterThanOrEqual(17);
    expect(by["3 lanes @ 70"] ?? 0).toBeGreaterThanOrEqual(3);
    expect(by["3 lanes @ 50"] ?? 0).toBeGreaterThanOrEqual(28);
    expect(by["4 lanes @ 50"] ?? 0).toBeGreaterThanOrEqual(4);
    expect(by["3 lanes @ 140 motorway"] ?? 0).toBeGreaterThanOrEqual(10);
    // The three boulevards the re-scoped lessons run on, and the exam district, are in it.
    for (const id of ["ov-keepright-v1", "ln-v1", "wb-boulevard-v1", "d2-v1", "district-v1", "mw-v1"]) {
      expect(withMulti.map((d) => d.id), id).toContain(id);
    }
  });

  it("the oracle's two terms are the whole of «where ал. 1 binds» on the committed maps: no edge is outside a settlement at ≤ 80", () => {
    const outsideAtTownLimit: string[] = [];
    for (const d of LOADED) {
      for (const e of d.district.roads.edges as DistrictEdge[]) {
        if (isExtraUrbanCarriageway(e) && !(e.maxspeed > CEILING_KMH)) outsideAtTownLimit.push(`${d.id}:${e.id}`);
      }
    }
    expect(outsideAtTownLimit).toEqual([]);
  });

  it("where ал. 1 binds on a multi-lane edge today: the ten motorway carriageways, and nothing else", () => {
    const binding = LOADED.flatMap((d) => d.multi.filter((e) => rawBinds(d.raw.get(e.id)!)).map(() => d.id));
    expect([...new Set(binding)]).toEqual(["mw-entry-v1", "mw-exit-v1", "mw-v1"]);
    expect(binding).toHaveLength(10);
  });
});

describe("1. the road half of the tick is the map's, not the dial's", () => {
  it(
    "the same poses sampled with the dial at 30, 85, 150 and 220 by day, and at 120 at night, give the same lane, lane count, limit, flags and paint — on every stay",
    () => {
      expect(allStays().dialDrift).toEqual([]);
      expect(SAMPLED_RUNS.map((r) => `${r.dial}${r.night ? "n" : ""}`)).toEqual(["30", "85", "150", "220", "120n"]);
    },
    TIMEOUT_MS,
  );

  it(
    "the limit on the tick is the edge's own posted limit, on every sample",
    () => {
      expect(allStays().limitDrift).toEqual([]);
    },
    TIMEOUT_MS,
  );
});

describe("2. THE PROPERTY — on every multi-lane edge at its real posted limit, in every lane, at every dial speed", () => {
  it(
    "the engine's NOT_KEEPING_RIGHT bills equal the oracle's (the RAW map's road, the measured lane, never the dial)",
    () => {
      const { stays } = allStays();
      const bad: string[] = [];
      let drives = 0;
      for (const s of stays) {
        const raw = rawOf.get(s.district)!;
        for (const dial of SPEEDS) {
          const ticks = s.ticks.map((t) => ({ ...t, speedKmh: dial }));
          const got = engineBills(ticks);
          const want = oracleBills(ticks, raw, dial);
          drives++;
          if (JSON.stringify(got) !== JSON.stringify(want) && bad.length < 40) {
            bad.push(`${s.key} posted ${s.edge.maxspeed} · dial ${dial} → engine ${JSON.stringify(got)}, law ${JSON.stringify(want)}`);
          }
        }
      }
      expect(bad).toEqual([]);
      expect(drives).toBe(stays.length * SPEEDS.length);
      expect(drives).toBeGreaterThan(30000);
    },
    TIMEOUT_MS,
  );

  it(
    "a TOWN edge — not a motorway, posted ≤ 80 — bills NOTHING, in any lane, at any dial speed from 0 to 220 (read off the engine alone)",
    () => {
      const { stays } = allStays();
      const billed: string[] = [];
      let drives = 0;
      for (const s of stays) {
        if (rawBinds(s.edge)) continue;
        for (const dial of SPEEDS) {
          drives++;
          if (engineBills(s.ticks.map((t) => ({ ...t, speedKmh: dial }))).length > 0 && billed.length < 40) {
            billed.push(`${s.key} posted ${s.edge.maxspeed} · dial ${dial}`);
          }
        }
      }
      expect(billed).toEqual([]);
      expect(drives).toBeGreaterThan(25000);
    },
    TIMEOUT_MS,
  );

  it(
    "a MOTORWAY edge bills a clean stay in a non-rightmost travel lane at 12 s at EVERY moving dial speed, and never the rightmost travel lane",
    () => {
      const { stays } = allStays();
      const mw = stays.filter((s) => rawBinds(s.edge) && s.clean);
      expect(mw.length).toBeGreaterThan(0);
      let billedStays = 0;
      for (const s of mw) {
        const kerb = s.ticks[0].busLaneRight === true || s.ticks[0].emergencyLaneRight === true ? 1 : 0;
        const perDial = SPEEDS.map((dial) => engineBills(s.ticks.map((t) => ({ ...t, speedKmh: dial }))));
        const want = s.lane > kerb;
        if (want) billedStays++;
        SPEEDS.forEach((dial, i) => {
          expect(perDial[i], `${s.key} dial ${dial}`).toEqual(want && dial > MOVING_ABOVE_KMH ? [STAY_SEC + 1] : []);
        });
      }
      expect(billedStays).toBeGreaterThan(0);
    },
    TIMEOUT_MS,
  );
});

describe("3. coverage — the census reached the lanes it claims", () => {
  it(
    "clean 15 s holds of a painted NON-RIGHTMOST lane, by posted limit and lanes one way",
    () => {
      const { stays } = allStays();
      const by: Record<string, number> = {};
      const edgesReached = new Set<string>();
      for (const s of stays) {
        if (!s.clean || s.lane === 0) continue;
        const k = `${s.lanesOneWay} lanes @ ${s.edge.maxspeed}`;
        by[k] = (by[k] ?? 0) + 1;
        edgesReached.add(`${s.district}:${s.edge.id}`);
      }
      const why: Record<string, number> = {};
      for (const s of stays) why[s.why] = (why[s.why] ?? 0) + 1;
      if (process.env.KEEP_RIGHT_BUILT_DUMP) {
        fs.writeFileSync(
          process.env.KEEP_RIGHT_BUILT_DUMP,
          JSON.stringify({ why, by, notClean: stays.filter((s) => !s.clean).map((s) => `${s.key} posted ${s.edge.maxspeed} len ${s.edge.length.toFixed(0)}: ${s.why} ${JSON.stringify(s.ticks.map((t) => [t.edgeId === s.edge.id ? "=" : t.edgeId, t.laneId, t.laneCount, t.laneLinesPainted === false ? "u" : "p"].join("/")))}`) }, null, 1),
        );
      }
      // Floors measured on today's maps (420 clean holds of 630 stays; the rest
      // sit on edges the junction trim leaves unpainted end to end, or under a
      // parallel carriageway — `why` says which). What the round-3 survivors
      // needed is REACHED, not merely listed: painted non-rightmost holds on the
      // boulevards posted 70 and on the three- and four-lane banks.
      expect(stays.length).toBeGreaterThanOrEqual(630);
      expect(why.clean ?? 0).toBeGreaterThanOrEqual(400);
      expect(by["2 lanes @ 70"] ?? 0).toBeGreaterThanOrEqual(15);
      expect(by["3 lanes @ 70"] ?? 0).toBeGreaterThanOrEqual(4);
      expect(by["3 lanes @ 50"] ?? 0).toBeGreaterThanOrEqual(28);
      expect(by["4 lanes @ 50"] ?? 0).toBeGreaterThanOrEqual(2);
      expect(by["2 lanes @ 50"] ?? 0).toBeGreaterThanOrEqual(120);
      expect(by["2 lanes @ 40"] ?? 0).toBeGreaterThanOrEqual(18);
      expect(by["2 lanes @ 30"] ?? 0).toBeGreaterThanOrEqual(10);
      expect(by["3 lanes @ 140"] ?? 0).toBeGreaterThanOrEqual(20);
      expect(edgesReached.size).toBeGreaterThanOrEqual(150);
      // Every stay is accounted for by a reason this file knows.
      expect(Object.keys(why).sort().every((k) => ["another-edge", "another-lane", "another-lane-count", "clean", "off-network", "short", "unpainted"].includes(k))).toBe(true);
      expect(Object.values(why).reduce((a, b) => a + b, 0)).toBe(stays.length);
    },
    TIMEOUT_MS,
  );
});
