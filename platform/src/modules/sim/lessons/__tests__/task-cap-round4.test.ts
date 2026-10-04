/**
 * THE TASK CEILING, ROUND 4 — the founder's three rulings of 2026-09-25.
 *
 *   1. «Bill it» (register item 17): a lesson's task speed cap is graded as a
 *      real ceiling under ЗДвП чл. 20, ал. 2, with the universal first-fault
 *      grace, which is PER TOPIC (ruling 16). Kept exactly as round 3 built it.
 *   2. «Only the named stretch»: a breached task cap binds ONLY through the
 *      feature the task names — the bend, the spray curtain, the zone — and
 *      stops where that feature ends; after it only the posted limit grades.
 *      Round 3 bound it to the NEXT ROUTE GOAL, and the round-3 verifier
 *      measured the harm (COND-B): a driver who blew `sc-sp-curve`'s mid-curve
 *      ≤50 mark at 70 and corrected to 45 through the rest of the bend was taught
 *      and charged for 60–80 km/h on the straight posted 90 afterwards.
 *   3. «Yes, same as speeding»: on drives with NO task cap, a taught weather or
 *      bend overspeed still running when the drive ends is SETTLED, as
 *      SPEEDING_OVER_LIMIT is since 0e58070, and a taught weather or bend
 *      overspeed rules out unscoped CLEAN_DRIVING praise.
 *
 * Every case below was run RED on round 3 before any product code moved
 * (`scratchpad/cap/r4/red-r3-*.txt`), except the ones marked GUARD, which pin
 * what the rulings keep.
 *
 * The feature table itself (which feature each capped objective names, and the
 * authored geometry it ends at) is `task-cap-features.test.ts`; the strip and
 * the banner are `components/sim/lesson-ui/__tests__/task-cap-strip-release
 * .test.ts`; the reducer half of ruling 3 is `rules/__tests__/task-cap-round4
 * .test.ts`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LessonSpec } from "../../contracts";
import type { SimTick } from "../../rules";
import { buildDebrief } from "../debrief";
import { abortSession, applyTick, buildLessonResult, createLessonSession, finishSession } from "../engine";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioLevel } from "../scenario/types";
import type { LessonSessionState } from "../types";
import { makeTick } from "./fixtures";

const TASK = "TASK_SPEED_CAP_EXCEEDED";
const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
const CURVE = "SPEED_TOO_FAST_FOR_CURVE";
const CLEAN_TITLE = "Чисто и спокойно каране";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

// ---------------------------------------------------------------------------
// The round-3 verifier's drive harness (zz-v3-attack4), ported.
// ---------------------------------------------------------------------------

type Edge = { maxspeed: number; geometry: number[][] };
const edgeCache = new Map<string, Edge[]>();
function postedFn(districtId: string): (x: number, y: number) => number {
  if (!edgeCache.has(districtId)) {
    const d = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${districtId}.json`), "utf-8"));
    edgeCache.set(districtId, d.roads.edges);
  }
  const edges = edgeCache.get(districtId)!;
  return (x, y) => {
    let best = Infinity;
    let sp = 50;
    for (const e of edges)
      for (let i = 0; i + 1 < e.geometry.length; i++) {
        const a = e.geometry[i];
        const b = e.geometry[i + 1];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const L2 = dx * dx + dy * dy;
        const u = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
        const dd = Math.hypot(x - (a[0] + u * dx), y - (a[1] + u * dy));
        if (dd < best) {
          best = dd;
          sp = e.maxspeed;
        }
      }
    return sp;
  };
}

interface Ctx {
  d: number;
  x: number;
  y: number;
  t: number;
  v: number;
  s: LessonSessionState;
}
interface Opts {
  pts: Array<[number, number]>;
  speed: (c: Ctx) => number;
  posted: number | ((x: number, y: number) => number);
  flags?: Partial<SimTick> | ((c: { x: number; y: number; d: number }) => Partial<SimTick>);
  accel?: number;
  decel?: number;
  handEnd?: (c: Ctx) => boolean;
  endKind?: "finish" | "abort";
  maxT?: number;
}
interface Bill {
  code: string;
  t: number;
}
interface Frame {
  t: number;
  x: number;
  y: number;
  stamped: boolean;
}
interface Out {
  naturally: boolean;
  endedAt: number;
  score: number;
  charged: Bill[];
  coached: Bill[];
  positions: Array<{ code: string; t: number; x: number; y: number }>;
  frames: Frame[];
  breaches: number;
  commendations: number;
  debrief: string;
  ended: LessonSessionState;
}

function drive(lesson: LessonSpec, o: Opts): Out {
  let s = createLessonSession(lesson);
  const cum = [0];
  for (let i = 1; i < o.pts.length; i++)
    cum.push(cum[i - 1] + Math.hypot(o.pts[i][0] - o.pts[i - 1][0], o.pts[i][1] - o.pts[i - 1][1]));
  const total = cum[cum.length - 1];
  const at = (d: number): [number, number, number] => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const f = (d - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    const x = o.pts[i - 1][0] + f * (o.pts[i][0] - o.pts[i - 1][0]);
    const y = o.pts[i - 1][1] + f * (o.pts[i][1] - o.pts[i - 1][1]);
    const h = (Math.atan2(o.pts[i][0] - o.pts[i - 1][0], o.pts[i][1] - o.pts[i - 1][1]) * 180) / Math.PI;
    return [x, y, h];
  };
  let d = 0;
  let v = 0;
  let t = 0;
  const frames: Frame[] = [];
  while (d < total && t < (o.maxT ?? 400) && s.phase === "driving") {
    t = Math.round((t + 0.1) * 10) / 10;
    const [x0, y0] = at(d);
    const target = o.speed({ d, x: x0, y: y0, t, v: v * 3.6, s }) / 3.6;
    v = v < target ? Math.min(target, v + (o.accel ?? 3) * 0.1) : Math.max(target, v - (o.decel ?? 5) * 0.1);
    d = Math.min(total, d + v * 0.1);
    const [x, y, h] = at(d);
    const posted = typeof o.posted === "number" ? o.posted : o.posted(x, y);
    const flags = typeof o.flags === "function" ? o.flags({ x, y, d }) : (o.flags ?? {});
    const r = applyTick(
      s,
      makeTick({ t, speedKmh: v * 3.6, maxSpeedKmh: posted, position: { x, y }, headingDeg: h, ...flags }),
    );
    s = r.state;
    const lt = (s as unknown as { lastTick?: { taskSpeedCap?: unknown } }).lastTick;
    frames.push({ t, x, y, stamped: lt?.taskSpeedCap !== undefined });
    if (o.handEnd && o.handEnd({ d, x, y, t, v: v * 3.6, s })) break;
  }
  const naturally = s.phase !== "driving";
  const ended = naturally ? s : o.endKind === "abort" ? abortSession(s, t) : finishSession(s, t);
  const result = buildLessonResult(ended);
  const debrief = buildDebrief(ended.lesson, result, { coachedMistakes: result.coachedMistakes }).text;
  return {
    naturally,
    endedAt: t,
    score: result.score,
    charged: ended.events.filter((e) => e.kind === "violation").map((e) => ({ code: e.code as string, t: e.t })),
    coached: (ended.coachedMistakes ?? []).map((c) => ({ code: c.code, t: c.t })),
    positions: (ended.eventPositions ?? []).map((p) => ({ code: p.code as string, t: p.t, x: p.x, y: p.y })),
    frames,
    breaches: (result.taskCapBreaches ?? []).length,
    commendations: ended.events.filter((e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING").length,
    debrief,
    ended,
  };
}

const shadowPts = (id: string): Array<[number, number]> => {
  const samples = JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "traces", id, "shadow-correct.trace.json"), "utf-8"),
  ).samples as Array<{ x: number; y: number }>;
  const out: Array<[number, number]> = [];
  for (const p of samples) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last[0], p.y - last[1]) > 0.3) out.push([p.x, p.y]);
  }
  return out;
};
/** The shadow route, carried on in its last direction so a hand-end is never the road's own end. */
const shadowOn = (id: string, extraM: number): Array<[number, number]> => {
  const base = shadowPts(id);
  const last = base[base.length - 1];
  const prev = base[base.length - 6];
  const n = Math.hypot(last[0] - prev[0], last[1] - prev[1]);
  return [...base, [last[0] + ((last[0] - prev[0]) / n) * extraM, last[1] + ((last[1] - prev[1]) / n) * extraM]];
};
const spec = (id: string) => SCENARIO_TEMPLATES.find((x) => x.id === id)!;
const taskBills = (o: Out) => [...o.charged, ...o.coached].filter((b) => b.code === TASK);
const stamped = (o: Out) => o.frames.filter((f) => f.stamped);

function lessonOf(id: string, objectives: LessonSpec["objectives"], posted: number, extra: Partial<LessonSpec> = {}): LessonSpec {
  return {
    id,
    order: 1,
    titleBg: "Проба",
    descriptionBg: "",
    conceptIds: [],
    postedLimitKmh: posted,
    spawn: { position: { x: 0, y: 15 }, headingDeg: 0 },
    preDrive: false,
    vehicleStart: "ready",
    objectives,
    ...extra,
  };
}
const wp = (id: string, y: number, r = 12): LessonSpec["objectives"][number] => ({
  id,
  titleBg: `Точка ${id}`,
  kind: "reachZone",
  params: { x: 0, y, radiusM: r },
});
const line = (y1: number): Array<[number, number]> => [
  [0, 15],
  [0, y1],
];

// ===========================================================================
// RULING 2 — «ONLY THE NAMED STRETCH»
// ===========================================================================

describe("ruling 2 · COND-B, ported — the bend's cap stops at the bend's exit (sc-sp-curve)", () => {
  const sp = spec("sc-sp-curve");
  const posted = postedFn(sp.map.districtId);
  const pts = shadowPts("sc-sp-curve");
  // The bend is the authored curveAdvisory span spc-z-curve, arclength 220 →
  // 487.02 on spc-e-road; it ends at (170, 390), where the exit straight (posted
  // 90) runs east. The mid-curve mark is (52.66, 337.34).
  const BEND_EXIT_X = 170;
  for (const lv of [1, 3] as ScenarioLevel[]) {
    for (const straightKmh of [80, 65, 60]) {
      it(`L${lv}: 70 through the mid-curve ≤50 mark, 45 to the curve exit, then ${straightKmh} on the straight → the arrival only, 0 points`, () => {
        let passedMark = false;
        const o = drive(compileScenario(sp, lv), {
          pts,
          posted: (x, y) => posted(x, y),
          accel: 2.5,
          decel: 4,
          maxT: 200,
          speed: (c) => {
            if (!passedMark && Math.hypot(c.x - 52.66, c.y - 337.34) < 4) passedMark = true;
            if (!passedMark) return c.y < 200 ? 50 : 70;
            if (c.x < 175) return 45;
            return straightKmh;
          },
        });
        // ROUND 6 (ruling 4, the integrator's reading): the blow at 70 through
        // the ≤50 mark IS the offence — ONE taught TASK card at the blow (round
        // 4 pinned none) — and nothing on the straight after the bend bills it
        // again. Taught, so still 0 points.
        expect(taskBills(o)).toHaveLength(1);
        expect(o.score).toBe(0);
        // The mark WAS blown and the ceiling DID bind inside the bend…
        expect(o.breaches).toBe(1);
        expect(stamped(o).length).toBeGreaterThan(0);
        // …and never on the straight after it.
        expect(stamped(o).filter((f) => f.x > BEND_EXIT_X + 0.5)).toEqual([]);
      });
    }
  }
  it("GUARD — L3: 70 held through the whole bend is still TAUGHT the task code INSIDE the bend", () => {
    const o = drive(compileScenario(sp, 3), {
      pts,
      posted: (x, y) => posted(x, y),
      accel: 2.5,
      decel: 4,
      maxT: 200,
      speed: (c) => (c.y < 200 ? 50 : 70),
    });
    const taught = o.coached.filter((b) => b.code === TASK);
    expect(taught.length).toBe(1);
    const where = o.frames.find((f) => f.t === taught[0].t)!;
    expect(where.x).toBeLessThan(BEND_EXIT_X);
    expect(stamped(o).filter((f) => f.x > BEND_EXIT_X + 0.5)).toEqual([]);
  });
  it("L3: 70 held through the whole bend and the straight — the bend is 133 m past the mark, so the act is taught and NOT charged on the straight", () => {
    const o = drive(compileScenario(sp, 3), {
      pts,
      posted: (x, y) => posted(x, y),
      accel: 2.5,
      decel: 4,
      maxT: 200,
      speed: (c) => (c.y < 200 ? 50 : 70),
    });
    expect(o.charged.filter((b) => b.code === TASK)).toEqual([]);
  });
});

describe("ruling 2 · the zone — a cap whose task names nothing beyond its own mark binds across that zone only", () => {
  // sc-ov-night-gap «Дръж своята лента под 45 км/ч» — a mark at (4.06, 124) of
  // radius 2.7 (4.05 at L1) on a 90 road; its own header says the title «says
  // only the two things the evaluator reads». Round 3 stamped ≤45 for 425 m, to
  // the finish.
  const sp = spec("sc-ov-night-gap");
  const posted = postedFn(sp.map.districtId);
  const pts = shadowOn("sc-ov-night-gap", 100);
  for (const lv of [1, 3] as ScenarioLevel[]) {
    // ROUND 5 (2026-09-26, founder ruling «Bill the arrival»): this mark names
    // nothing beyond itself, so it is an ARRIVAL cap and passing it at 60 over
    // ≤45 is itself billed — ONE TASK event at the blow, taught (the topic's
    // first encounter here), never charged. The stamp still never leaves the zone.
    it(`L${lv}: 60 through the ≤45 mark and on — the breach is recorded, the stamp never leaves the zone, ONE TASK event (the arrival), taught`, () => {
      const lesson = compileScenario(sp, lv);
      const mark = lesson.objectives.find((x) => x.id === "sc-ovn-wait")!;
      const r = mark.params.radiusM as number;
      const o = drive(lesson, {
        pts,
        posted: (x, y) => posted(x, y),
        flags: { isNight: true, headlights: "low" },
        maxT: 120,
        speed: () => 60,
      });
      expect(o.breaches).toBe(1);
      expect(o.charged.filter((b) => b.code === TASK)).toEqual([]);
      const taught = o.coached.filter((b) => b.code === TASK);
      expect(taught.length).toBe(1);
      const at = o.frames.find((f) => f.t === taught[0].t)!;
      expect(Math.hypot(at.x - 4.06, at.y - 124)).toBeLessThan(r + 1);
      const off = stamped(o).filter((f) => Math.hypot(f.x - 4.06, f.y - 124) > r + 0.05);
      expect(off).toEqual([]);
    });
  }
});

describe("ruling 2 · the zone — a mark swept faster than its zone is still a recorded breach", () => {
  // sc-ov-night-gap at L3: the ≤45 mark is a disc of radius 2.7. At 95 km/h a
  // 0.1 s frame is 2.64 m, so the frame after the blow (where the latch is
  // created, off the previous frame's verdict) is already outside the zone: the
  // stretch is spent on its first frame and nothing is ever stamped. The cap was
  // still blown at a graded mark (posted 90 > the 45 shown), so the drive keeps
  // its breach row — the debrief's evidence against unscoped praise.
  // ROUND 5 (2026-09-26, founder ruling «Bill the arrival»): …and it is BILLED,
  // on the latch's own first frame, from the arrival — the one frame a zone
  // swept faster than itself ever gives the reducer.
  it("L3: 95 through the ≤45 mark — no stamped frame, one breach row, ONE TASK event (the arrival)", () => {
    const sp = spec("sc-ov-night-gap");
    const posted = postedFn(sp.map.districtId);
    const o = drive(compileScenario(sp, 3), {
      pts: shadowOn("sc-ov-night-gap", 100),
      posted: (x, y) => posted(x, y),
      flags: { isNight: true, headlights: "low" },
      accel: 6,
      maxT: 60,
      speed: () => 95,
    });
    // ROUND 15: the latch is created on the frame the car CROSSES the mark (not, as through round 14, on the frame
    // after the evaluator's verdict), so that crossing frame — still inside the 2.7 m disc — may carry the one stamp;
    // nothing after it does.
    expect(stamped(o).length).toBeLessThanOrEqual(1);
    expect(o.breaches).toBe(1);
    expect(taskBills(o).length).toBe(1);
    expect(o.charged.filter((b) => b.code === TASK)).toEqual([]);
  });
});

describe("ruling 2 · the speed zone — «още в зоната» stops where the 40 zone ends (sc-sp-limit-end)", () => {
  // sp-signs-v1: 40 from y 100 to the junction at 340, 50 to 460, 40 to the end
  // sign at 700, 50 after. «Стигни кръстовището, още в зоната и под 40 км/ч» is
  // a mark at 310; its zone ends at the junction. Round 3 stamped ≤40 over the
  // posted-50 stretch 340 → 460 and billed a driver doing 50 there.
  const sp = spec("sc-sp-limit-end");
  const posted = postedFn(sp.map.districtId);
  it("L3: 50 through the junction mark and on at 50 — never stamped past the junction; ONE TASK event, the blown mark's own (round 14)", () => {
    const o = drive(compileScenario(sp, 3), {
      pts: line(800),
      posted: (x, y) => posted(x, y),
      maxT: 120,
      speed: () => 50,
    });
    // ROUND 14 (founder ruling 2026-10-03, «Cap adds, never removes … Its bill stands on its own»): the ≤40 mark at the
    // sign's 40, passed at 50, is the cap's own offence — one event, taught on the cap's own grace — where rounds 7–13
    // let the speeding's bill absorb it. Ruling 2 is unchanged: nothing is stamped past the junction.
    expect(taskBills(o)).toHaveLength(1);
    expect(o.charged.filter((b) => b.code === TASK)).toEqual([]);
    expect(stamped(o).filter((f) => f.y > 340.5)).toEqual([]);
  });
});

describe("ruling 2 · the ring — «остани в кръга» stops where the car leaves the ring (sc-rb-ped-exit)", () => {
  // rb-ped-v1: ring radius 18, one lane — its outer edge is 18 + 4.0625. The
  // «past east» ≤30 mark is on the ring; round 3 kept stamping on the exit arm
  // (posted 40) to the pocket before the crossing.
  const sp = spec("sc-rb-ped-exit");
  const posted = postedFn(sp.map.districtId);
  const pts = shadowPts("sc-rb-ped-exit");
  it("L3: 38 through the mark and out onto the exit arm — never stamped off the ring; ONE TASK event, the blown mark's own (round 14)", () => {
    const o = drive(compileScenario(sp, 3), {
      pts,
      posted: (x, y) => posted(x, y),
      maxT: 120,
      speed: (c) => (Math.hypot(c.x, c.y) < 40 ? 38 : 20),
    });
    // The mark WAS blown (the latch formed and is spent)…
    expect(o.ended.taskCapLatch?.progress.spent).toBe(true);
    // …but the ring is posted 30, the cap it shows: the sign is the stricter
    // ceiling there (B58), so inside the ring the task stamps nothing, and off
    // the ring — where round 3 stamped it on the posted-40 arm — nothing either.
    expect(stamped(o).filter((f) => Math.hypot(f.x, f.y) > 18 + 4.0625 + 0.05)).toEqual([]);
    expect(stamped(o)).toEqual([]);
    expect(o.breaches).toBe(0);
    // ROUND 14 (founder ruling 2026-10-03, «Cap adds, never removes … Its bill stands on its own»): the ≤30 mark at the
    // ring's 30, passed at 38, is the cap's own offence — ONE event, its arrival, taught on the cap's own grace — where
    // rounds 7–13 let the speeding's bill absorb it. Ruling 2 is unchanged: nothing stamped, on the ring or off it.
    expect(taskBills(o)).toHaveLength(1);
    expect(o.charged.filter((b) => b.code === TASK)).toEqual([]);
  });
});

describe("ruling 2 · the works — «през участъка» stops where the roadworks end (sc-merge-roadworks-shift)", () => {
  // hz-roadworks-v1: the works edge (30) runs 240 → 276, then 50. The mark is at
  // (-4.06, 258). Round 3 stamped ≤33 on the posted-50 exit to the finish.
  const sp = spec("sc-merge-roadworks-shift");
  const posted = postedFn(sp.map.districtId);
  const pts = shadowOn("sc-merge-roadworks-shift", 60);
  it("L3: 45 through the ≤33 mark and on — never stamped past the end of the works", () => {
    const o = drive(compileScenario(sp, 3), {
      pts,
      posted: (x, y) => posted(x, y),
      maxT: 120,
      speed: () => 45,
    });
    expect(stamped(o).filter((f) => f.y > 276.5)).toEqual([]);
  });
});

describe("ruling 2 · GUARDS — the curtain, a lead the task says to follow, and a section keep round 3's stretch", () => {
  it("GUARD — sc-ac-truck-spray L3: 116 through the ≤80 mark and held — TASK taught, then charged (the curtain runs to the finish)", () => {
    const sp = spec("sc-ac-truck-spray");
    const o = drive(compileScenario(sp, 3), {
      pts: line(1000),
      posted: 140,
      flags: { rain: true, headlights: "low" },
      maxT: 120,
      speed: () => 116,
    });
    expect(o.coached.filter((b) => b.code === TASK).length).toBe(1);
    expect(o.charged.filter((b) => b.code === TASK).length).toBe(1);
  });
  it("GUARD — sc-follow-distance L3: 45 through the ≤32 mark and held behind the lead — TASK taught", () => {
    const sp = spec("sc-follow-distance");
    const o = drive(compileScenario(sp, 3), {
      pts: line(360),
      posted: 50,
      maxT: 120,
      speed: () => 45,
    });
    expect(o.coached.filter((b) => b.code === TASK).length).toBe(1);
  });
  it("GUARD — sc-ac-crosswind L3: 50 through the ≤40 mark and held across the windy section — TASK taught", () => {
    const sp = spec("sc-ac-crosswind");
    const o = drive(compileScenario(sp, 3), {
      pts: line(360),
      posted: 50,
      maxT: 120,
      speed: () => 50,
    });
    expect(o.coached.filter((b) => b.code === TASK).length).toBe(1);
  });
});

// ===========================================================================
// RULING 3 — «YES, SAME AS SPEEDING» (drives with NO task cap)
// ===========================================================================

/** A synthetic no-cap lesson: two plain waypoints, the second far away (or at `endY`). */
function nocap(endY: number, extra: Partial<LessonSpec> = {}): LessonSpec {
  return lessonOf("t-nocap4", [wp("o-a", 400), wp("o-b", endY)], 50, extra);
}
/** When the conditions teach falls on a rainy 55 in a 50 (envelope 42.5). */
function condTeachAt(): { t: number; y: number } {
  const o = drive(nocap(5000), { pts: line(5000), posted: 50, flags: { rain: true }, maxT: 30, speed: () => 55 });
  const row = o.coached.find((b) => b.code === COND)!;
  const f = o.frames.find((x) => x.t === row.t)!;
  return { t: row.t, y: f.y };
}

describe("ruling 3 · a taught weather overspeed still running when a no-cap drive ends is SETTLED", () => {
  const teach = condTeachAt();
  it("finishSession 2 s after the conditions teach, still at 55 → one conditions charge", () => {
    const o = drive(nocap(5000), {
      pts: line(5000),
      posted: 50,
      flags: { rain: true },
      speed: () => 55,
      handEnd: (c) => c.t >= teach.t + 2,
    });
    expect(o.coached.map((b) => b.code)).toEqual([COND]);
    expect(o.charged.map((b) => b.code)).toEqual([COND]);
    expect(o.score).toBe(1);
  });
  it("abortSession 2 s after the conditions teach, still at 55 → one conditions charge", () => {
    const o = drive(nocap(5000), {
      pts: line(5000),
      posted: 50,
      flags: { rain: true },
      speed: () => 55,
      endKind: "abort",
      handEnd: (c) => c.t >= teach.t + 2,
    });
    expect(o.charged.map((b) => b.code)).toEqual([COND]);
  });
  it("the ROUTE ends ~1.5 s after the conditions teach, still at 55 → one conditions charge", () => {
    // o-b's disc (r 12) is entered ~22 m after the teach point at ~15 m/s.
    const o = drive(nocap(teach.y + 34), { pts: line(teach.y + 200), posted: 50, flags: { rain: true }, speed: () => 55 });
    expect(o.naturally).toBe(true);
    expect(o.endedAt).toBeLessThan(teach.t + 6);
    expect(o.charged.map((b) => b.code)).toEqual([COND]);
  });
  it("GUARD — back under the envelope for the last 2 s → acquitted, exactly as mid-drive", () => {
    const o = drive(nocap(5000), {
      pts: line(5000),
      posted: 50,
      flags: { rain: true },
      decel: 6,
      speed: (c) => (c.t < teach.t + 1 ? 55 : 38),
      handEnd: (c) => c.t >= teach.t + 3.5,
    });
    expect(o.charged).toEqual([]);
  });
  it("GUARD — ended before the conditions code was ever shown → nothing withheld, nothing settled", () => {
    const o = drive(nocap(5000), {
      pts: line(5000),
      posted: 50,
      flags: { rain: true },
      speed: () => 55,
      handEnd: (c) => c.t >= teach.t - 1,
    });
    expect(o.coached).toEqual([]);
    expect(o.charged).toEqual([]);
  });
  it("GUARD — the re-grade already landed → still exactly one charge", () => {
    const o = drive(nocap(5000), {
      pts: line(5000),
      posted: 50,
      flags: { rain: true },
      speed: () => 55,
      handEnd: (c) => c.t >= teach.t + 12,
    });
    expect(o.charged.map((b) => b.code)).toEqual([COND]);
  });
  it("GUARD — the lesson's own ADR-009 target is never settled", () => {
    const o = drive(nocap(5000, { lessonMistakeTargets: [{ code: COND, source: "demo" }] }), {
      pts: line(5000),
      posted: 50,
      flags: { rain: true },
      speed: () => 55,
      handEnd: (c) => c.t >= teach.t + 2,
    });
    expect(o.charged).toEqual([]);
  });
  it("GUARD — a LAWFUL rainy drive (40 in a 50) is never touched", () => {
    const o = drive(nocap(5000), {
      pts: line(5000),
      posted: 50,
      flags: { rain: true },
      speed: () => 40,
      handEnd: (c) => c.t >= 30,
    });
    expect(o.charged).toEqual([]);
    expect(o.coached).toEqual([]);
  });
});

describe("ruling 3 · a taught bend overspeed still running when a no-cap drive ends is SETTLED", () => {
  // A synthetic bend: every tick after y 100 is inside an authored curveAdvisory
  // span advising 50 (the reducer reads it off the tick, as it does from a
  // district). 70 > 50 + the 5 km/h grace, so the curve code is taught 1.5 s in.
  const bend = (c: { y: number }) => (c.y > 100 ? { curveAdvisoryKmh: 50, edgeId: "e-bend" } : { edgeId: "e-bend" });
  function curveTeach(): number {
    const o = drive(nocap(5000), { pts: line(5000), posted: 90, flags: bend, maxT: 30, speed: () => 70 });
    return o.coached.find((b) => b.code === CURVE)!.t;
  }
  const teachT = curveTeach();
  it("finishSession 1 s after the bend teach, still at 70 in the bend → one bend charge", () => {
    const o = drive(nocap(5000), { pts: line(5000), posted: 90, flags: bend, speed: () => 70, handEnd: (c) => c.t >= teachT + 1 });
    expect(o.coached.map((b) => b.code)).toEqual([CURVE]);
    expect(o.charged.map((b) => b.code)).toEqual([CURVE]);
  });
  it("abortSession 1 s after the bend teach → one bend charge", () => {
    const o = drive(nocap(5000), {
      pts: line(5000),
      posted: 90,
      flags: bend,
      speed: () => 70,
      endKind: "abort",
      handEnd: (c) => c.t >= teachT + 1,
    });
    expect(o.charged.map((b) => b.code)).toEqual([CURVE]);
  });
it("the ROUTE ends inside the bend ~1 s after the bend teach, still at 70 → one bend charge", () => {
    const probe = drive(nocap(5000), { pts: line(5000), posted: 90, flags: bend, maxT: 30, speed: () => 70 });
    const row = probe.coached.find((b) => b.code === CURVE)!;
    const y0 = probe.frames.find((f) => f.t === row.t)!.y;
    // o-b's disc (r 12) is entered ~8 m after the teach point at ~19 m/s, inside the bend.
    const o = drive(nocap(y0 + 20), { pts: line(y0 + 200), posted: 90, flags: bend, speed: () => 70 });
    expect(o.naturally).toBe(true);
    expect(o.endedAt).toBeLessThan(teachT + 3);
    expect(o.charged.map((b) => b.code)).toEqual([CURVE]);
  });
  it("GUARD — back at the advisory before the end → acquitted", () => {
    const o = drive(nocap(5000), {
      pts: line(5000),
      posted: 90,
      flags: bend,
      decel: 8,
      speed: (c) => (c.t < teachT + 0.5 ? 70 : 45),
      handEnd: (c) => c.t >= teachT + 4,
    });
    expect(o.charged).toEqual([]);
  });
  it("GUARD — out of the bend at the end (no advisory on the last tick) → nothing to settle", () => {
    const o = drive(nocap(5000), {
      pts: line(5000),
      posted: 90,
      flags: (c) => (c.y > 100 && c.y < 150 ? { curveAdvisoryKmh: 50, edgeId: "e-bend" } : { edgeId: "e-bend" }),
      speed: () => 70,
      handEnd: (c) => c.y > 170,
    });
    expect(o.charged).toEqual([]);
  });
});

describe("ruling 3 · a taught weather or bend overspeed rules out unscoped CLEAN_DRIVING praise", () => {
  it("rain, 40 for 1 km (commendations earned), 55 for ~6 s (taught, corrected), 40 again: every «Чисто» bullet is scoped and names the weather", () => {
    const o = drive(nocap(5000), {
      pts: line(5000),
      posted: 50,
      flags: { rain: true },
      decel: 6,
      speed: (c) => (c.y > 1000 && c.y < 1085 ? 55 : 40),
      handEnd: (c) => c.y > 2000,
    });
    expect(o.coached.map((b) => b.code)).toEqual([COND]);
    expect(o.charged).toEqual([]);
    expect(o.commendations).toBeGreaterThan(0);
    const bullets = o.debrief.split("\n").filter((l) => l.includes(CLEAN_TITLE));
    expect(bullets.length).toBeGreaterThan(0);
    for (const l of bullets) {
      expect(l).toContain("но само на отделни отсечки");
      expect(l).toContain("по-бързо, отколкото позволяват условията");
    }
    expect(o.debrief).not.toMatch(/чисто каране без нито едно нарушение|задръж това ниво/u);
  });
  it("a bend overspeed taught and corrected, commendations on either side: the bullets are scoped and name the bend", () => {
    const o = drive(nocap(5000), {
      pts: line(5000),
      posted: 90,
      decel: 4,
      flags: (c) => (c.y > 1000 && c.y < 1100 ? { curveAdvisoryKmh: 50, edgeId: "e" } : { edgeId: "e" }),
      speed: (c) => (c.y > 990 && c.y < 1060 ? 70 : 50),
      handEnd: (c) => c.y > 2000,
    });
    expect(o.coached.map((b) => b.code)).toEqual([CURVE]);
    const bullets = o.debrief.split("\n").filter((l) => l.includes(CLEAN_TITLE));
    expect(bullets.length).toBeGreaterThan(0);
    for (const l of bullets) expect(l).toContain("по-бързо от табелата");
  });
  it("no commendation at all: the «Какво се получи добре» sheet sentence is withheld after a taught weather breach", () => {
    // The route ends at 400 (o-b, r 12): fewer than 250 clean metres after the
    // breach closes, and 85 before it — no commendation can fall due.
    const o = drive(nocap(400), {
      pts: line(600),
      posted: 50,
      flags: { rain: true },
      decel: 6,
      speed: (c) => (c.y > 100 && c.y < 185 ? 55 : 40),
    });
    expect(o.coached.map((b) => b.code)).toEqual([COND]);
    expect(o.charged).toEqual([]);
    expect(o.commendations).toBe(0);
    expect(o.debrief).not.toContain("Какво се получи добре: чисто каране");
  });
  it("GUARD — a lawful drive keeps its unqualified praise", () => {
    const o = drive(nocap(5000), { pts: line(5000), posted: 50, flags: { rain: true }, speed: () => 40, handEnd: (c) => c.y > 2000 });
    const bullets = o.debrief.split("\n").filter((l) => l.includes(CLEAN_TITLE));
    expect(bullets.length).toBeGreaterThan(0);
    for (const l of bullets) expect(l).not.toContain("но само на отделни отсечки");
  });
});

describe("ruling 3 · the hand-ended settlement's record — lastTick carries the weather and the bend only while a taught episode is open", () => {
  it("a lawful rainy drive keeps exactly base's four fields", () => {
    const o = drive(nocap(5000), { pts: line(5000), posted: 50, flags: { rain: true, fog: false }, speed: () => 40, handEnd: (c) => c.t > 20 });
    expect(Object.keys(o.ended.lastTick ?? {}).sort()).toEqual(["maxSpeedKmh", "position", "speedKmh", "t"]);
  });
  it("a taught weather overspeed still running carries the flag the envelope is derived from", () => {
    const teach = condTeachAt();
    const o = drive(nocap(5000), { pts: line(5000), posted: 50, flags: { rain: true }, speed: () => 55, handEnd: (c) => c.t >= teach.t + 1 });
    expect(o.ended.lastTick?.rain).toBe(true);
  });
});
