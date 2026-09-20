/**
 * `SimTick.edgeAlignment` GRADES NOTHING — proved by EXECUTION, not by grep.
 *
 * THE CONSTRAINT. The field was added as an OBSERVATION so the audit harness
 * can tell a correct drive from an unmeasured one. It must not change what the
 * product does to a student: no rule, no objective, no card, no score, no
 * teach moment may read it, now or later. `wrongWay` remains the only
 * conviction channel and keeps its exact prior meaning.
 *
 * WHY A SOURCE GREP WOULD NOT DO. This programme has measured, twice, what a
 * grep-shaped defence is worth: 127 green tests once survived four deliberate
 * sabotages of the code they named, and six of six wiring mutations survived a
 * green 152/152 elsewhere. A grep refuses the shape its author imagined and
 * nothing else. So this file drives the REAL runtime over the REAL district,
 * takes the tick stream it publishes, and folds it through the REAL reducers
 * three times:
 *
 *   · AS PUBLISHED
 *   · STRIPPED     — `edgeAlignment` deleted from every tick
 *   · CORRUPTED    — EVERY member lied about, on every tick
 *
 * and requires the three results to be deep-equal, event for event and state
 * for state.
 *
 * AND A FOLD IS ONLY AS GOOD AS ITS MATERIAL. The first cut of this file drove
 * two legs that were measured, on the carriageway, one-way and `travelDir: +1`
 * on every single tick, and perturbed three of the record's seven members. So
 * a detector gated on any of the other four — or on a state the drives never
 * entered — produced identical folds and shipped GREEN. Three mutations of
 * `rules/engine.ts` did exactly that and survived: grading
 * `edgeAlignment.offCarriageway === true` (which reintroduces, one kerb over,
 * the WRONG_WAY-on-grass defect the runtime documents removing), grading
 * `reason === "no-edge-fix"`, and grading `deg === null`. The streams now
 * cover every state of the record and `corrupted()` lies about every member,
 * and both of those properties are asserted rather than assumed.
 *
 * HOW THIS TEST FAILS. Wire the field into any detector — one
 * `tick.edgeAlignment` read that changes an emitted event or any byte of the
 * resulting state — and the CORRUPTED fold diverges from the published one
 * (and usually the STRIPPED one too), which reds the named assertion below. A
 * read that is genuinely inert (logging it, copying it to a dev record) does
 * not red it, which is correct: that is not grading.
 */
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "..";
import { drive, edgeById, edgeDrivePath, loadDistrict } from "./helpers";
import { createRuleEngine, reduceTick, type RuleEngineState } from "../../rules/engine";
import type { EdgeAlignment, SimTick } from "../../rules/types";
import { applyTick, createLessonSession } from "../../lessons/engine";
import type { LessonSpec } from "../../contracts";

// ---------------------------------------------------------------------------
// the material: real ticks off the real world, including convicted ones
// ---------------------------------------------------------------------------

function driveEdge(edgeId: string, s0: number, s1: number, stepM: number, rightOffsetM: number): SimTick[] {
  const district = loadDistrict();
  const rt = createWorldRuntime(district);
  return drive(rt, edgeDrivePath(edgeById(district, edgeId), s0, s1, stepM, rightOffsetM), {
    speedKmh: 25,
  }).ticks;
}

/** A straight run far outside the district (bounds x ∈ [-852.8, 785.0],
 *  y ∈ [-610.8, 622.7]), so nothing is within the locator's 30 m lock radius
 *  and every tick carries the NOT-MEASURABLE record: `deg: null` + `reason`. */
function driveOffNetwork(frames: number): SimTick[] {
  const rt = createWorldRuntime(loadDistrict());
  return drive(
    rt,
    Array.from({ length: frames }, (_, i) => ({ x: 2000 + i * 0.35, y: 2000, headingDeg: 45 })),
    { speedKmh: 25 },
  ).ticks;
}

/**
 * THE TWO HALVES OF THE AMBIGUITY, PLUS EVERY OTHER STATE THE RECORD HAS.
 *
 *  · the ring the wrong way round — the conviction channel is ARMED and fires;
 *  · a one-way street the wrong way round — the channel is NOT armed, publishes
 *    `wrongWay: false`, and the drive is exactly the one a detector wired to
 *    the new field would start convicting;
 *  · past the kerb — `offCarriageway: true` while `deg` is still measured and
 *    the record still names an edge that `SimTick.edgeId` has nulled;
 *  · off the network — `deg: null` with a `reason`;
 *  · a two-way road's opposing bank — `travelDir: -1`.
 *
 * They are kept as SEPARATE streams, each folded from a fresh engine, on
 * purpose. Concatenating two `drive()` runs restarts the session clock at the
 * join, and a reducer handed time that runs backwards quietly stops accruing —
 * which made the unarmed half of an earlier version of this file inert, and
 * inert material cannot kill anything. Every leg is long enough to outlast the
 * engine's own `wrongWaySustainSec` (1.5 s) and its entry-travel floor
 * (WRONG_WAY_ENTRY_TRAVEL_M = 15 m), so a grading read books a real violation
 * rather than merely tilting a counter — and because both floors are counted
 * per FRAME (the tick's speed × dt), what buys that is the frame count, which
 * is why the first two legs need a 0.25 m step and the longer ones do not.
 */
function streams(): { name: string; ticks: SimTick[] }[] {
  return [
    { name: "ring, against the flow (wrongWay ARMED)", ticks: driveEdge("e925166131.0", 29, 3, 0.25, 0) },
    { name: "one-way street, against the flow (NOT armed)", ticks: driveEdge("e432951179.0", 340, 240, 0.25, 1.6) },
    // ── AND THE STATES THE TWO LEGS ABOVE NEVER ENTER ──────────────────────
    // Both of those drives are measured, on the carriageway, one-way and
    // travelDir +1 on EVERY tick, so a detector gated on any other state was
    // invisible to both folds and shipped green. Three mutations of
    // `rules/engine.ts` did exactly that — grading `offCarriageway === true`,
    // grading `reason === "no-edge-fix"`, grading `deg === null` — and all
    // three survived a full green run of this file. Each leg below is the
    // material one of them needed; all of them are long enough to clear the
    // detector's own floors (WRONG_WAY_ENTRY_TRAVEL_M = 15 m and
    // `wrongWaySustainSec` = 1.5 s), so a grading read books a real violation
    // rather than merely tilting a counter.
    //
    // The floors are counted in FRAMES, not metres of road — `contactTravelM`
    // accrues from the tick's own speed (25 км/ч × 0.05 s = 0.347 m per frame)
    // — so these legs carry a coarser spatial step than the two above and
    // still run 86 / 120 / 121 frames, i.e. 4.3 s / 6.0 s / 6.1 s and
    // 29.9 m / 41.7 m / 42.0 m of accrued travel.
    { name: "street, past the kerb (offCarriageway, still measured)", ticks: driveEdge("e432951179.0", 170, 340, 2, 25) },
    { name: "off the network entirely (deg null + reason)", ticks: driveOffNetwork(120) },
    { name: "two-way road, opposing bank (travelDir -1)", ticks: driveEdge("e672186635.0", 40, 160, 1, -1.6) },
  ];
}

function stripped(ticks: readonly SimTick[]): SimTick[] {
  return ticks.map((t) => {
    const copy = { ...t };
    delete copy.edgeAlignment;
    return copy;
  });
}

/**
 * EVERY MEMBER LIES, ON EVERY TICK. Not „the members I thought a grader would
 * read": a perturbation that leaves a member alone is a member a detector can
 * be gated on invisibly, and three engine mutations proved that is not
 * theoretical — grading `offCarriageway`, grading `reason` and grading
 * `deg === null` each survived a green run of an earlier version of this file
 * that perturbed only `deg`, `wrongWayArmed` and `roundabout`.
 *
 * Each lie is also chosen to cross the boundary a grader would test on, not
 * merely to change a value: the angle is rotated a HALF TURN (so both its sign
 * and its magnitude move — a grader reading `|deg|` is caught as surely as one
 * reading `deg`), `null` becomes 0 (the strongest possible „aligned"), the two
 * booleans and `travelDir` are negated, `reason` is added where it was absent
 * and removed where it was present, and `edgeId` swaps `null` for a real id
 * and a real id for `null`.
 *
 * The result is a DELIBERATELY INCONSISTENT record — `reason` present beside a
 * numeric `deg`, an `edgeId` beside a null one. That is the point: the claim
 * under test is that no reader exists, and a reader of a nonsense record
 * diverges just as loudly as a reader of a truthful one.
 */
function corrupted(ticks: readonly SimTick[]): SimTick[] {
  return ticks.map((t) => {
    const ea = t.edgeAlignment;
    if (ea === undefined) return { ...t };
    return {
      ...t,
      edgeAlignment: {
        ...ea,
        deg: ea.deg === null ? 0 : ea.deg > 0 ? ea.deg - 180 : ea.deg + 180,
        reason: ea.reason === undefined ? ("no-edge-fix" as const) : undefined,
        wrongWayArmed: !ea.wrongWayArmed,
        edgeId: ea.edgeId === null ? "e000000000.0" : null,
        offCarriageway: !ea.offCarriageway,
        travelDir: ea.travelDir === undefined ? 1 : ea.travelDir === 1 ? -1 : 1,
        roundabout: ea.roundabout === undefined ? true : !ea.roundabout,
      },
    };
  });
}

/** Every member of the record, as a comparable tuple — so the test below can
 *  assert that `corrupted()` really moved each one on real material rather
 *  than trusting the expression above to be exhaustive. */
function members(ea: EdgeAlignment): unknown[] {
  return [ea.deg, ea.reason, ea.wrongWayArmed, ea.edgeId, ea.offCarriageway, ea.travelDir, ea.roundabout];
}

// ---------------------------------------------------------------------------
// the rule engine
// ---------------------------------------------------------------------------

interface RuleFrame {
  events: unknown;
  state: RuleEngineState;
}

function foldRules(ticks: readonly SimTick[]): RuleFrame[] {
  let state = createRuleEngine();
  const frames: RuleFrame[] = [];
  for (const tick of ticks) {
    const r = reduceTick(state, tick);
    state = r.state;
    frames.push({ events: r.events, state: r.state });
  }
  return frames;
}

describe("nothing in the rule engine reads edgeAlignment", () => {
  const all = streams();

  it("the material is real, and it covers BOTH the armed and the unarmed branch", () => {
    // If this ever stops holding, the folds below stop covering the branch the
    // field exists for and the proof degrades silently.
    const [ring, street] = all;
    expect(ring.ticks.length).toBeGreaterThan(80);
    expect(street.ticks.length).toBeGreaterThan(80);
    for (const s of all) expect(s.ticks.every((t) => t.edgeAlignment !== undefined)).toBe(true);
    expect(ring.ticks.some((t) => t.edgeAlignment!.wrongWayArmed)).toBe(true);
    expect(street.ticks.every((t) => !t.edgeAlignment!.wrongWayArmed)).toBe(true);
    // Both drives face the wrong way down the road they are on; only one of
    // them is ever asked about it. That asymmetry IS the defect this field
    // closes, and it is what makes the street leg able to kill a mutation.
    expect(ring.ticks.some((t) => t.wrongWay === true)).toBe(true);
    expect(street.ticks.every((t) => t.wrongWay === false)).toBe(true);
    expect(street.ticks.every((t) => Math.abs(t.edgeAlignment!.deg ?? 0) > 150)).toBe(true);
  });

  it("…and it enters EVERY state of the record, so no member can be graded invisibly", () => {
    // The hole this closes: a detector gated on a state the material never
    // reaches produces the same fold in all three passes and ships green.
    const eas = all.flatMap((s) => s.ticks).map((t) => t.edgeAlignment!);
    const ticks = all.flatMap((s) => s.ticks);
    expect(eas.some((ea) => ea.deg === null)).toBe(true); // not measurable
    expect(eas.some((ea) => ea.deg !== null)).toBe(true);
    expect(eas.some((ea) => ea.reason === "no-edge-fix")).toBe(true);
    expect(eas.some((ea) => ea.reason === undefined)).toBe(true);
    expect(eas.some((ea) => ea.offCarriageway)).toBe(true); // past the kerb
    expect(eas.some((ea) => !ea.offCarriageway)).toBe(true);
    expect(eas.some((ea) => ea.travelDir === -1)).toBe(true); // opposing bank
    expect(eas.some((ea) => ea.travelDir === 1)).toBe(true);
    expect(eas.some((ea) => ea.edgeId === null)).toBe(true);
    expect(eas.some((ea) => ea.edgeId !== null)).toBe(true);
    // The record naming an edge while the TICK says the car is nowhere.
    expect(ticks.some((t) => t.edgeId === null && t.edgeAlignment!.edgeId !== null)).toBe(true);
  });

  it("…and CORRUPTING it really moves every member on that material", () => {
    // `corrupted()` claims to lie about all seven members. Asserted, because a
    // member it silently left alone is a member a detector could be gated on
    // without either fold noticing — which is how three engine mutations came
    // through green.
    const unmoved = [0, 1, 2, 3, 4, 5, 6].filter((i) =>
      all.every((s) => {
        const lies = corrupted(s.ticks);
        return s.ticks.every(
          (t, k) => members(t.edgeAlignment!)[i] === members(lies[k].edgeAlignment!)[i],
        );
      }),
    );
    expect({ membersNeverPerturbed: unmoved }).toEqual({ membersNeverPerturbed: [] });
  });

  it("the ARMED fold really reaches the detector, so a divergence would be visible", () => {
    const codes = foldRules(all[0].ticks)
      .flatMap((f) => f.events as { kind: string; code?: string }[])
      .filter((e) => e.kind === "violation")
      .map((e) => e.code);
    expect(codes).toContain("WRONG_WAY");
  });

  it("the UNARMED fold books no WRONG_WAY today — the state a new reader would change", () => {
    const codes = foldRules(all[1].ticks)
      .flatMap((f) => f.events as { kind: string; code?: string }[])
      .filter((e) => e.kind === "violation")
      .map((e) => e.code);
    expect(codes).not.toContain("WRONG_WAY");
  });

  it("STRIPPING the field changes not one event and not one byte of state", () => {
    for (const s of all) {
      expect({ run: s.name, frames: foldRules(stripped(s.ticks)) }).toEqual({
        run: s.name,
        frames: foldRules(s.ticks),
      });
    }
  });

  it("CORRUPTING the field — all seven members lied about — changes nothing either", () => {
    for (const s of all) {
      expect({ run: s.name, frames: foldRules(corrupted(s.ticks)) }).toEqual({
        run: s.name,
        frames: foldRules(s.ticks),
      });
    }
  });
});

// ---------------------------------------------------------------------------
// the lesson engine (objectives, teach moments, the advisor, the off-network
// clock — everything applyTick fans out to)
// ---------------------------------------------------------------------------

/** Minimal always-driving lesson: an odometer objective and a zone the drive
 *  never reaches, so the session stays in `driving` for the whole stream and
 *  every per-tick branch runs. */
const microLesson: LessonSpec = {
  id: "t-edge-alignment",
  order: 99,
  titleBg: "Тест",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 90 },
  preDrive: false,
  objectives: [
    { id: "o-dist", titleBg: "Измини 20 метра", kind: "driveDistance", params: { meters: 20 } },
    { id: "o-zone", titleBg: "Стигни зоната", kind: "reachZone", params: { x: 99999, y: 99999, radiusM: 10 } },
  ],
};

function foldLesson(ticks: readonly SimTick[]): unknown[] {
  let state = createLessonSession(microLesson);
  const frames: unknown[] = [];
  for (const tick of ticks) {
    const r = applyTick(state, tick);
    state = r.state;
    frames.push({
      hudEvents: r.hudEvents,
      teachMoments: r.teachMoments,
      mistakeMoment: r.mistakeMoment,
      state: r.state,
    });
  }
  return frames;
}

describe("nothing in the lesson engine reads edgeAlignment", () => {
  const all = streams();

  it("the fold produces HUD output, so a divergence would be visible", () => {
    const hud = all.flatMap((s) => foldLesson(s.ticks)).flatMap((f) => (f as { hudEvents: unknown[] }).hudEvents);
    expect(hud.length).toBeGreaterThan(0);
  });

  it("STRIPPING the field changes not one card and not one byte of session state", () => {
    for (const s of all) {
      expect({ run: s.name, frames: foldLesson(stripped(s.ticks)) }).toEqual({
        run: s.name,
        frames: foldLesson(s.ticks),
      });
    }
  });

  it("CORRUPTING the field changes nothing either", () => {
    for (const s of all) {
      expect({ run: s.name, frames: foldLesson(corrupted(s.ticks)) }).toEqual({
        run: s.name,
        frames: foldLesson(s.ticks),
      });
    }
  });
});
