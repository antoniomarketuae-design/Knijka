/**
 * OFF_CARRIAGEWAY — the behavioural pins for the detector in `engine.ts`
 * (чл. 15, ал. 1; § 6, т. 3 and т. 4).
 *
 * WHY THIS FILE EXISTS, and it is a process fault as much as a coverage one.
 * The detector was measured on the production rig while it was being written —
 * every number in its comment block is a real reading — and then the
 * measurements were DELETED. A live three-conjunct predicate with zero
 * behavioural tests is exactly how a live predicate becomes a dead one at the
 * next edit to `stepEpisode`, `POSE_PLACEHOLDER_KMH` or
 * `OFF_CARRIAGEWAY_BODY_ALLOWANCE_M`, and in a tree whose measured pathology is
 * „51 of 82 repairs shipped a predicate nothing reads" that is not a nicety.
 * Everything below is a restored measurement, not a new invention.
 *
 * THE SHAPE OF THE SUITE — each convicting pin is paired with the acquittal it
 * must not swallow, because a detector can satisfy „no false convictions" by
 * never firing and „it fires" by firing on everything:
 *
 *   1. ONE ACT, ONE BILL          a real departure bills at 2 s, and once more
 *                                 at 8 s as the `regrade` the teach consumed
 *   2. THE OWN LANE               a string edgeId bills nothing, ever
 *   3. THE POLARITY TRAP          `undefined` ≠ `null`; only `null` convicts
 *   4. THE FRAME-ZERO POSE        the placeholder at the district origin
 *   5. ONE PHYSICAL EVENT         a crash swallows the departure it caused,
 *                                 in BOTH orders — and does NOT swallow the
 *                                 excursion the student chose afterwards
 *   6. THE COMMITTED CORPUS       all 503 recorded traces, replayed through the
 *                                 production world runtime: 167 of 167 correct
 *                                 drives clean, exactly one mistake demo billed
 *   7. THE CHARGE REACHES HIM     the row's own compiled lesson driven off the
 *                                 road through the real runtime and the real
 *                                 `applyTick`: the основна lands in the debrief,
 *                                 and the same drive kept in lane does not
 *
 * §6 is the strongest acquitting result in the change and it was missing from
 * the report the change shipped with. Silence is demanded of the SHADOW-CORRECT
 * set only: the deleted probe demanded it of all 503, mistake demos included,
 * and went red — the expectation was wrong, not the product. A demo that drives
 * into a field SHOULD book this row, and the mistake set is used for the
 * opposite claim instead: that the predicate fires on committed content at all.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { codes, drive, tick } from "./fixtures";
import { createRuleEngine, reduceTick } from "../engine";
import { createWorldRuntime } from "../../runtime/worldRuntime";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";
import { compileScenario } from "../../lessons/scenario/compile";
import { applyTick, buildLessonResult, createLessonSession } from "../../lessons/engine";
import { parseScenarioTrace } from "../../traces/parse";
import type { VehicleSample } from "../../contracts";
import type { SimTick, ViolationEvent } from "../types";

const CODE = "OFF_CARRIAGEWAY";
/** `engine.ts OFF_CARRIAGEWAY_SUSTAIN_SEC` — module-private by design (no drill
 *  may dial „stay on the road"), so the number is pinned here by hand. Change
 *  it there and this suite goes red, which is the entire point. */
const SUSTAIN_SEC = 2;
/** `engine.ts OFF_CARRIAGEWAY_REGRADE_SEC` — pinned by hand for the same
 *  reason. The SECOND bill lands at `SUSTAIN_SEC + REGRADE_SEC` and exists only
 *  to reach the charge the teach-first free lesson consumed. */
const REGRADE_SEC = 6;
/** Frame spacing: fine enough that „one bill per frame" and „one bill per
 *  excursion" are 200 apart rather than 5. */
const DT = 0.05;

const billsOf = (ticks: SimTick[]): number => codes(drive(ticks).events).filter((c) => c === CODE).length;
const billTimes = (ticks: SimTick[]): number[] =>
  drive(ticks)
    .events.filter((e) => e.code === CODE)
    .map((e) => e.t);
/** `true` for the re-grade bill, `false` for the graded one. */
const billRegradeFlags = (ticks: SimTick[]): boolean[] =>
  drive(ticks)
    .events.filter((e): e is ViolationEvent => e.kind === "violation" && e.code === CODE)
    .map((e) => e.regrade === true);

/**
 * A car AWAY from the district origin — (0, 0) is the placeholder pose and is
 * acquitted on purpose (§4), so every convicting fixture has to stand
 * somewhere real. Same speed on every frame: this row has no `moving`
 * conjunct, but a moving car is the ordinary case and keeps the fixture honest.
 */
function frames(
  from: number,
  to: number,
  edgeId: string | null | undefined,
  over: Partial<SimTick> = {},
): SimTick[] {
  const out: SimTick[] = [];
  for (let t = from; t <= to + 1e-9; t += DT) {
    out.push(
      tick(Number(t.toFixed(3)), {
        speedKmh: 30,
        position: { x: 120, y: -45 },
        ...(edgeId === undefined ? {} : { edgeId }),
        ...over,
      }),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. ONE ACT, ONE BILL — and it lands at the sustain, not before or per frame
// ---------------------------------------------------------------------------

describe("a sustained departure books exactly one основна", () => {
  it("bills TWICE across a 10 s excursion — the episodes spend themselves", () => {
    // 200 frames off the carriageway. A per-frame detector books 160 of them.
    //
    // EXPECTATION CHANGED 2026-09-01 (`sc-ov-oncoming-gap:83420a40`), and the
    // claim this case makes is the same one: the episode model spends itself
    // instead of billing per frame. What changed under it is the product — a
    // second, `regrade`-marked bill at `SUSTAIN_SEC + REGRADE_SEC` now exists
    // because the FIRST one was being consumed by the teach-first free lesson
    // (OFF_CARRIAGEWAY is основна ⇒ teach-first-then-grade), which left a
    // student who drove off the road and never came back charged NOTHING for
    // it. `lessons/engine.ts` drops the marked bill wherever the code was
    // already charged, so this is one charge, not two. Two bills out of 201
    // frames is still the pin against a per-frame detector.
    const ticks = frames(0, 10, null);
    expect(ticks.length).toBe(201);
    expect(billsOf(ticks)).toBe(2);
    expect(billRegradeFlags(ticks)).toEqual([false, true]);
  });

  it("the RE-GRADE lands at 2 + 6 s and only after the graded bill", () => {
    const at = billTimes(frames(0, 20, null));
    expect(at.length).toBe(2);
    expect(at[0]).toBeGreaterThanOrEqual(SUSTAIN_SEC);
    expect(at[0]).toBeLessThan(SUSTAIN_SEC + DT * 2);
    expect(at[1]).toBeGreaterThanOrEqual(SUSTAIN_SEC + REGRADE_SEC);
    expect(at[1]).toBeLessThan(SUSTAIN_SEC + REGRADE_SEC + DT * 2);
  });

  it("a student who steers back inside the re-grade window pays the teach only", () => {
    // The acquitting half of the re-grade, and the reason its window is the
    // widest in the family: the corrective here is a STEERING recovery. Off at
    // t = 0, billed at 2 s, back on the asphalt at 5 s — one bill, unmarked, so
    // the teach card is all he gets.
    const ticks = [...frames(0, 5, null), ...frames(5.05, 20, "e-road")];
    expect(billRegradeFlags(ticks)).toEqual([false]);
  });

  it("…and the re-grade is not banked across a recovery", () => {
    // Two excursions of 5 s each with a real return between them never reach
    // the 8 s bar, so they cost the SAME as `two SEPARATE excursions` below —
    // the second episode re-arms on the same reset as the first and cannot add
    // its seconds together.
    const ticks = [
      ...frames(0, 5, null),
      ...frames(5.05, 10, "e-road"),
      ...frames(10.05, 15, null),
    ];
    expect(billRegradeFlags(ticks)).toEqual([false, false]);
  });

  it("two LONG excursions are two acts, each with its own re-grade — never four charges", () => {
    // The shape a reader will question. The reducer emits four events, but they
    // are two ACTS: `lessons/engine.ts` teaches the first bill, charges its
    // re-grade, charges the second excursion's bill on the prior encounter, and
    // drops the second re-grade through `alreadyCharged`. Two departures, two
    // основни. What is pinned here is the reducer's half of that arithmetic.
    const ticks = [
      ...frames(0, 10, null),
      ...frames(10.05, 20, "e-road"),
      ...frames(20.05, 30, null),
    ];
    expect(billRegradeFlags(ticks)).toEqual([false, true, false, true]);
  });

  it("bills at the 2 s sustain and not one frame earlier", () => {
    const [at] = billTimes(frames(0, 10, null));
    expect(at).toBeGreaterThanOrEqual(SUSTAIN_SEC);
    expect(at).toBeLessThan(SUSTAIN_SEC + DT * 2);
  });

  it("a departure CORRECTED inside the sustain costs nothing", () => {
    // 1.5 s out, then back on the road: the excursion the sustain exists to
    // forgive (0.97 m out and back is ~1.6 s at this file's own drift premise).
    const ticks = [...frames(0, 1.5, null), ...frames(1.55, 10, "e-road")];
    expect(billsOf(ticks)).toBe(0);
  });

  it("two SEPARATE excursions are two acts", () => {
    // The paired opposite of „one act, one bill": the episode re-arms on the
    // runtime SAYING the car is back on a road, so a student who leaves twice
    // is billed twice. Without this, „bills once" could be satisfied by a
    // latch that never re-arms.
    const ticks = [
      ...frames(0, 5, null),
      ...frames(5.05, 10, "e-road"),
      ...frames(10.05, 15, null),
    ];
    expect(billsOf(ticks)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 2. THE OWN LANE — the control that keeps §1 from being a machine that
//    convicts everyone
// ---------------------------------------------------------------------------

describe("a car on a road books nothing", () => {
  it("30 s in its own lane, edge named on every frame: zero", () => {
    expect(billsOf(frames(0, 30, "e-road"))).toBe(0);
  });

  it("a lane CHANGE (a different edge id) is still on a road: zero", () => {
    const ticks = [...frames(0, 15, "e-road-a"), ...frames(15.05, 30, "e-road-b")];
    expect(billsOf(ticks)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. THE POLARITY TRAP — `undefined` is „cannot answer", not „off the road"
// ---------------------------------------------------------------------------

describe("an absent edge channel never convicts", () => {
  it("30 s of ticks with NO edgeId at all: zero", () => {
    // Replays, recorded traces, hand-built fixtures and the dev rigs all look
    // like this. Written as `!tick.edgeId` the detector would convict every
    // one of them of driving in a field.
    const ticks = frames(0, 30, undefined);
    expect(ticks.every((t) => t.edgeId === undefined)).toBe(true);
    expect(billsOf(ticks)).toBe(0);
  });

  it("an undefined frame mid-departure RESTARTS the sustain — it does not bank it", () => {
    // What `stepEpisode` actually does with (cond=false, reset=false): the
    // `!cond` arm clears `activeSince` and leaves `emitted` alone. So 1.5 s
    // off + one silent frame + 1.5 s off is not 3 s of departure — the clock
    // starts again, and the student is not billed. The comment beside the
    // detector used to claim the frame „leaves the episode exactly as it was";
    // it does not, and this is the measurement that says so.
    const ticks = [...frames(0, 1.5, null), ...frames(1.55, 1.55, undefined), ...frames(1.6, 3.0, null)];
    expect(billsOf(ticks)).toBe(0);
    // …and the same span with the quiet frame REMOVED does bill, so the pin
    // above is about the silent frame and not about the span being short.
    expect(billsOf([...frames(0, 1.5, null), ...frames(1.6, 3.0, null)])).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4. THE FRAME-ZERO POSE — the untouched session that must cost nothing
// ---------------------------------------------------------------------------

describe("the placeholder pose at the district origin is not an excursion", () => {
  it("a session nobody touched books nothing, even though the origin is off the road", () => {
    // `scene/vehicleSample.ts` parks the car at the district ORIGIN until the
    // chassis publishes, and `applyTick` runs this reducer on those frames
    // („the law applies from second zero"). On 7 of the 105 shipped districts
    // that origin reads `edgeId === null` — d2-v1, district-v1, lc-gantry-v1,
    // rb-2lane-v1, rb-mini-v1, rb-ped-v1, rb-single-v1 — so without the guard
    // an untouched session on district-v1 bills −3 for a car never placed.
    const ticks: SimTick[] = [];
    for (let t = 0; t <= 40; t += DT) {
      ticks.push(tick(Number(t.toFixed(3)), { speedKmh: 0, position: { x: 0, y: 0 }, edgeId: null }));
    }
    expect(billsOf(ticks)).toBe(0);
  });

  it("but a car that DRIVES off the carriageway near the origin is still billed", () => {
    // The guard is float-exact on both coordinates AND requires a standstill,
    // so it cannot be widened into an amnesty. One metre from the origin, or
    // moving at the origin, convicts normally — the graded bill at 2 s and the
    // `regrade` at 8 s, because these spans are 10 s long (§1).
    expect(billsOf(frames(0, 10, null, { position: { x: 1, y: 0 }, speedKmh: 0 }))).toBe(2);
    expect(billsOf(frames(0, 10, null, { position: { x: 0, y: 0 }, speedKmh: 30 }))).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 5. ONE PHYSICAL EVENT, ONE PRICE — the crash swallows the departure it caused
// ---------------------------------------------------------------------------

/** One contact REPORT at `atSec`, on an otherwise unbroken stream. */
function withContact(ticks: SimTick[], atSec: number): SimTick[] {
  let stamped = false;
  return ticks.map((t) => {
    if (!stamped && t.t >= atSec - 1e-9) {
      stamped = true;
      return { ...t, events: [{ kind: "collision", withWhat: "staticObject" } as const] };
    }
    return t;
  });
}

describe("a slide off the road is one act, not two", () => {
  it("DEPARTURE THEN IMPACT: the car left the road and hit a body already off it", () => {
    // `sc-sign-warning/mistake-hold-speed`: departure at t ≈ 21.18 s, impact at
    // t = 21.43 s, and this detector fired at t = 23.18 s — the sheet read
    // SPEED_TOO_FAST_FOR_CONDITIONS + COLLISION + OFF_CARRIAGEWAY for ONE slide
    // off an icy road.
    const ticks = withContact([...frames(0, 1, "e-road"), ...frames(1.05, 10, null)], 1.3);
    expect(codes(drive(ticks).events)).toContain("COLLISION");
    expect(billsOf(ticks)).toBe(0);
  });

  it("IMPACT THEN DEPARTURE: a spin after a mid-carriageway hit is the same event", () => {
    // The order is not fixed, so the guard compares the episode ONSET against
    // the last contact REPORT within one sustain EITHER way.
    const ticks = withContact([...frames(0, 2, "e-road"), ...frames(2.05, 12, null)], 1.5);
    expect(codes(drive(ticks).events)).toContain("COLLISION");
    expect(billsOf(ticks)).toBe(0);
  });

  it("but a departure the student CHOSE after recovering is billed", () => {
    // The paired opposite, and the reason the guard is a window and not a
    // latch: hit something, recover, drive on, and then leave the road on your
    // own — that is a second act and it costs.
    const ticks = withContact(
      [...frames(0, 20, "e-road"), ...frames(20.05, 30, null)],
      1.5,
    );
    expect(codes(drive(ticks).events)).toContain("COLLISION");
    // Ten seconds in the field, so both bills land (§1) — the graded one and
    // its `regrade`.
    expect(billRegradeFlags(ticks)).toEqual([false, true]);
  });

  it("and the crash swallows the RE-GRADE too, not only the first bill", () => {
    // The half a second episode object could quietly break: the departure is
    // acquitted at 2 s as crash-caused and then, eight seconds later, billed
    // anyway — one physical event charged after all, just late. Both thresholds
    // read the same `crashCausedDeparture` for exactly this reason. The span is
    // 12 s, long enough that the re-grade would certainly have fired.
    const ticks = withContact([...frames(0, 1, "e-road"), ...frames(1.05, 13, null)], 1.3);
    expect(codes(drive(ticks).events)).toContain("COLLISION");
    expect(billsOf(ticks)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. THE ACQUITTING CORPUS — 167 committed correct drives, none of them billed
// ---------------------------------------------------------------------------

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const TRACES = path.join(REPO, "content", "traces");
const WORLD = path.join(REPO, "content", "world");

const DISTRICT_OF = new Map(SCENARIO_TEMPLATES.map((s) => [s.id, s.map.districtId]));
const districtCache = new Map<string, unknown>();
function district(id: string): unknown {
  let d = districtCache.get(id);
  if (d === undefined) {
    d = JSON.parse(readFileSync(path.join(WORLD, `${id}.json`), "utf-8"));
    districtCache.set(id, d);
  }
  return d;
}

function vehicleFrom(s: {
  x: number;
  y: number;
  headingDeg: number;
  speedKmh: number;
  gear: number;
  indicator: "off" | "left" | "right";
}): VehicleSample {
  return {
    position: { x: s.x, y: s.y },
    headingDeg: s.headingDeg,
    speedKmh: s.speedKmh,
    indicator: s.indicator,
    headlights: "low",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: s.gear,
    mirrorGlance: null,
  };
}

describe("the committed corpus, driven through the production runtime", () => {
  it("503 traces: every correct drive is acquitted, and the row is not dead", () => {
    // THE MEASUREMENT THE REPORT OMITTED, restored whole. Every committed
    // recording is replayed pose-by-pose through the real
    // `createWorldRuntime().sample()` — the same call the live session makes —
    // and the resulting SimTicks are folded through the real reducer. Nothing
    // is stubbed: `edgeId` is whatever the district geometry says.
    //
    // THE TRAP THE DELETED PROBE FELL INTO, so it is not walked into again: it
    // asserted zero across ALL 503, mistake demos included, and went red. The
    // expectation was wrong, not the product — a demo that drives into a field
    // is SUPPOSED to book this row. So the silence is demanded of the
    // shadow-correct set, and the mistake set is used for the opposite claim:
    // that the predicate fires on real committed content at all.
    const scenarios = readdirSync(TRACES, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    let driven = 0;
    let shadowDriven = 0;
    let sampledFrames = 0;
    let undefinedEdgeFrames = 0;
    let shadowNullEdgeFrames = 0;
    const shadowBilled: string[] = [];
    const mistakeBilled: string[] = [];
    const unmapped: string[] = [];

    for (const id of scenarios) {
      const districtId = DISTRICT_OF.get(id);
      if (districtId === undefined) {
        unmapped.push(id);
        continue;
      }
      const files = readdirSync(path.join(TRACES, id))
        .filter((f) => f.endsWith(".trace.json"))
        .sort();

      for (const file of files) {
        const trace = parseScenarioTrace(JSON.parse(readFileSync(path.join(TRACES, id, file), "utf-8")));
        expect(trace, `unparseable trace ${id}/${file}`).not.toBeNull();
        const isShadow = trace!.meta.kind === "shadow";

        const rt = createWorldRuntime(district(districtId));
        let state = createRuleEngine();
        let bills = 0;
        for (const s of trace!.samples) {
          const tickOut = rt.sample(vehicleFrom(s), s.tSec, false);
          sampledFrames++;
          if (tickOut.edgeId === undefined) undefinedEdgeFrames++;
          else if (tickOut.edgeId === null && isShadow) shadowNullEdgeFrames++;
          const r = reduceTick(state, tickOut);
          state = r.state;
          for (const e of r.events) if (e.code === CODE) bills++;
        }
        if (bills > 0) (isShadow ? shadowBilled : mistakeBilled).push(`${id}/${file} (${bills})`);
        driven++;
        if (isShadow) shadowDriven++;
      }
    }

    // The sweep must actually have run on everything — a corpus check that
    // silently skipped its corpus is the dead-predicate class wearing a test's
    // clothes.
    expect(unmapped).toEqual([]);
    expect(driven).toBe(503);
    expect(shadowDriven).toBe(167);
    // …and actually drove them. The floor is deliberately loose so a
    // re-recording cannot turn a green gate red for no reason.
    expect(sampledFrames).toBeGreaterThan(300_000);

    // ACQUITTING HALF. Every frame got a REAL answer from the runtime, so the
    // zeros below are an acquittal and not an absent channel (§3 is what an
    // absent channel does): 167 of 167 correct drives never once read as off
    // the carriageway, let alone long enough to be billed.
    expect(undefinedEdgeFrames).toBe(0);
    expect(shadowNullEdgeFrames).toBe(0);
    expect(shadowBilled).toEqual([]);

    // CONVICTING HALF — the guard against everything above being true because
    // the detector never fires. Exactly one committed demo leaves the road, and
    // it is the one the engine's own comment cites: `sc-sign-warning/
    // mistake-hold-speed`, the slide off an icy road.
    //
    // READ THIS BEFORE „FIXING" A RED HERE. The replay above carries KINEMATICS
    // ONLY — a committed trace has no contact stream — so the crash
    // de-duplication conjunct cannot engage in this sweep, and the bill stands
    // where the fully staged drive suppresses it (§5 is where that guard is
    // pinned, on ticks that do carry the contact report). This line is
    // therefore a statement about the geometry-and-episode half of the
    // detector, which is exactly the half a corpus of recorded poses can speak
    // to. If a re-recording moves it, the question to answer is „does any
    // committed demo still leave the road?" — not „how do I make this green?".
    expect(mistakeBilled).toEqual(["sc-sign-warning/mistake-hold-speed.trace.json (1)"]);
  }, 600_000);
});

// ---------------------------------------------------------------------------
// 7. THE CHARGE REACHES THE STUDENT — end to end, through the shipped stack
// ---------------------------------------------------------------------------
//
// Sections 1–6 are about the reducer. This one is about the finding
// (`sc-ov-oncoming-gap:83420a40`, critical — „no off-route stop, no reset, NO
// PENALTY"), which is about a DEBRIEF. The stop had already landed
// (`lessons/finish.ts`, 75 s) and so had the code; what had not was the charge,
// because OFF_CARRIAGEWAY is основна and its ONE bill per excursion was spent on
// the teach-first free mini-lesson. Measured on this rig before the re-grade:
// «Второстепенни 5», all five SPEEDING_OVER_LIMIT, the excursion worth 0.
//
// Nothing here is hand-built: the row's own compiled lesson, the real
// `createWorldRuntime().sample()`, the real `applyTick` and the real
// `buildLessonResult` the debrief screen reads.

describe("the excursion is CHARGED in the debrief, not only announced", () => {
  const DT_DRIVE = 0.25;

  /**
   * Up the corridor at 97 км/ч. `leave` steers off the asphalt at t = 10 s and
   * never comes back; otherwise the car stays in its own lane the whole way.
   */
  function drive97(leave: boolean): {
    scored: string[];
    coached: string[];
    offCarriagewayPoints: number;
  } {
    const template = SCENARIO_TEMPLATES.find((s) => s.id === "sc-ov-oncoming-gap");
    expect(template, "sc-ov-oncoming-gap must still be in the catalogue").toBeDefined();
    const lesson = compileScenario(template!, 1);
    expect(lesson.world?.districtId).toBe("ov-oncoming-v1");

    const rt = createWorldRuntime(district("ov-oncoming-v1"));
    let state = createLessonSession(lesson);
    const MPS = 97 / 3.6;
    for (let t = 0; t <= 200; t = Number((t + DT_DRIVE).toFixed(6))) {
      const turned = leave && t > 10;
      const y = 15 + (leave ? Math.min(t, 10) : t) * MPS;
      const x = turned ? (t - 10) * MPS : 4.06;
      state = applyTick(
        state,
        rt.sample(
          vehicleFrom({
            x,
            y,
            headingDeg: turned ? 90 : 0,
            speedKmh: 97,
            gear: 1,
            indicator: "off",
          }),
          t,
          false,
        ),
      ).state;
      if (state.phase !== "driving") break;
    }
    const result = buildLessonResult(state);
    return {
      scored: result.summary.mistakes.map((m) => m.code as string),
      coached: (result.coachedMistakes ?? []).map((c) => c.code),
      offCarriagewayPoints: result.summary.mistakes
        .filter((m) => m.code === CODE)
        .reduce((sum, m) => sum + m.points, 0),
    };
  }

  it("a drive that leaves the road and stays off it books the основна", () => {
    const { scored, coached, offCarriagewayPoints } = drive97(true);
    // The teach card still fires first — requirement-zero (doc 64 THEO-4) is
    // untouched: the student is TAUGHT and then charged, never charged bare.
    expect(coached).toContain(CODE);
    // …and the charge the teach consumed now lands. Before the re-grade this
    // array held only SPEEDING_OVER_LIMIT.
    expect(scored).toContain(CODE);
    // Charged ONCE, not twice — `lessons/engine.ts`'s `alreadyCharged` guard
    // plus one re-grade per excursion. 3 = SEVERITY_POINTS.osnovna.
    expect(offCarriagewayPoints).toBe(3);
  });

  it("THE CONTROL: the same drive kept in its own lane is never charged", () => {
    // Without this the case above is worthless — „the row appears" is equally
    // true of a rig that charges everything. Same lesson, same rig, same
    // reckless 97 км/ч (so the sheet is NOT empty: the speeding rows still
    // land); only the lateral position differs, and the car is on the asphalt
    // for every frame of it.
    const { scored, coached, offCarriagewayPoints } = drive97(false);
    expect(scored).toContain("SPEEDING_OVER_LIMIT");
    expect(scored).not.toContain(CODE);
    expect(coached).not.toContain(CODE);
    expect(offCarriagewayPoints).toBe(0);
  });
});
