/**
 * `SimTick.edgeAlignment` — WHICH WAY THE CAR FACED, AS A REFERENT.
 *
 * THE DEFECT THIS FIELD CLOSES. `tick.wrongWay === false` is published under
 * three gates, and only the OFFENCE arms them, so `false` means EITHER „he
 * faced the right way" OR „nobody asked". A reader outside the rule engine —
 * the audit harness — can therefore convict a drive on that channel and can
 * never clear one. All 34 roundabout ring edges in `content/world/*.json` are
 * `oneway`, so the ring is exactly where the ambiguity costs the most.
 *
 * THESE TESTS DRIVE THE REAL RUNTIME OVER THE REAL `district-v1.json`. No
 * geometry is re-implemented here: every number asserted comes out of
 * `createWorldRuntime(...).sample(...)`, and the one threshold the invariant
 * needs is imported from the product rather than restated. A test that
 * restates a product constant stops testing the product the first time the
 * constant moves.
 *
 * EACH TEST NAMES THE MUTATION IT KILLS. The whole existing suite is a null
 * control for this field — nothing else in the tree constructs it — so a sign
 * flip, a collapsed null or deleted wiring stays green everywhere but here.
 *
 * AND THE FIXTURES HAVE TO REACH EVERY MEMBER, which the first cut of this
 * file did not. Every drive in it was a one-way, on the asphalt, in forward
 * gear — so `travelDir` was +1 on every tick of every run, `offCarriageway`
 * false on every tick of every run, and `edgeAlignment.edgeId` never once
 * differed from `SimTick.edgeId`. Hardcoding all three (`travelDir: 1`,
 * `offCarriageway: false`, `edgeId: offCarriageway ? null : …`) left the file
 * GREEN. Sections 4, 5 and 7 are the fixtures that enter those states — a
 * two-way road, the far side of the kerb, and reverse gear — and section 8
 * asserts that the run set keeps entering them.
 */
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "..";
import { WRONG_WAY_ANGLE_DEG } from "../worldRuntime";
import { drive, edgeById, edgeDrivePath, loadDistrict, mkVehicle } from "./helpers";
import type { VehicleSample } from "../../contracts";
import type { EdgeAlignment, SimTick } from "../../rules/types";

/**
 * A ONE-WAY STREET on district-v1 — `oneway: true`, `roundabout: false`.
 * Segment 4 runs 240.53 m on a constant bearing of 254.09°, so a drive between
 * s = 170 and s = 340 never crosses a vertex and the edge's geometry direction
 * is a single, unambiguous number for the whole run.
 */
const STREET_EDGE = "e432951179.0";
const STREET_S0 = 170;
const STREET_S1 = 340;

/**
 * A ROUNDABOUT RING edge on the same district — `oneway: true`,
 * `roundabout: true`, five ~6.46 m chords. This is the family the steering
 * instrument exists for.
 */
const RING_EDGE = "e925166131.0";

/**
 * A TWO-WAY road on the same district — `oneway: false`, `lanes: 5`; segment 2
 * runs 129.06 m from s = 37.51, so a drive between s = 40 and s = 160 never
 * crosses a vertex either.
 *
 * WHY THE FILE NEEDS ONE. `travelDir` can only ever be −1 here: on a one-way
 * the locator returns +1 UNCONDITIONALLY (`runtime/locator.ts computeLane`,
 * the `if (oneway)` branch), so a one-way-only fixture set cannot tell
 * `fix.travelDir` from the constant `1` — and `travelDir` is the record's only
 * bank discriminator, because `laneOffsetM` is „+ = left of travel" on BOTH
 * banks and so carries no bank. Without it every opposing-bank car reads as
 * facing the right way.
 */
const TWO_WAY_EDGE = "e672186635.0";
const TWO_WAY_S0 = 40;
const TWO_WAY_S1 = 160;

/**
 * Metres to the RIGHT of the street centreline that put the car PAST THE DRAWN
 * KERB — `worldRuntime.ts` calls a car off the carriageway when `surfaceAt`
 * reports it more than OFF_CARRIAGEWAY_M (0.97 m) outside drawn asphalt —
 * while staying well inside the locator's 30 m lock radius, so the lane fix,
 * and therefore the angle, still refers to a real edge.
 *
 * MEASURED on this fixture: all 86 ticks come back `offCarriageway: true` and
 * `tick.edgeId === null` while `edgeAlignment.edgeId` stays `STREET_EDGE` and
 * `deg` stays measured. That is the exact state the two members' docblocks
 * advertise as the record's discriminators.
 */
const PAST_THE_KERB_M = 25;

/** Far outside the district (bounds are x ∈ [-852.8, 785.0], y ∈ [-610.8, 622.7]),
 *  so no centreline is within the locator's 30 m lock radius. */
const OFF_NETWORK = { x: 2000, y: 2000, headingDeg: 45 };

function driveEdge(opts: {
  edgeId: string;
  s0: number;
  s1: number;
  stepM?: number;
  rightOffsetM?: number;
  headingOffsetDeg?: number;
  /** Passed straight to `helpers.drive` — the reverse fixtures need `gear: -1`,
   *  which `mkVehicle` otherwise fixes at 1. */
  vehicle?: Partial<VehicleSample>;
}): SimTick[] {
  const district = loadDistrict();
  const rt = createWorldRuntime(district);
  const edge = edgeById(district, opts.edgeId);
  const poses = edgeDrivePath(edge, opts.s0, opts.s1, opts.stepM ?? 2, opts.rightOffsetM ?? 1.6).map(
    (p) => ({ ...p, headingDeg: (p.headingDeg + (opts.headingOffsetDeg ?? 0) + 720) % 360 }),
  );
  return drive(rt, poses, { speedKmh: 25, vehicle: opts.vehicle }).ticks;
}

/** Read the record, FAILING LOUDLY if the runtime did not publish one. Every
 *  test goes through this, so deleting the wiring reds all of them. */
function alignment(tick: SimTick): EdgeAlignment {
  const ea = tick.edgeAlignment;
  if (ea === undefined) throw new Error("the runtime published no edgeAlignment on this tick");
  return ea;
}

// ---------------------------------------------------------------------------
// 0 · the fixtures are what the rest of this file claims
// ---------------------------------------------------------------------------

describe("fixtures", () => {
  it("the street edge is a one-way that is NOT a ring", () => {
    const e = edgeById(loadDistrict(), STREET_EDGE);
    expect({ oneway: e.oneway, roundabout: e.roundabout }).toEqual({ oneway: true, roundabout: false });
  });

  it("the ring edge is a one-way ring", () => {
    const e = edgeById(loadDistrict(), RING_EDGE);
    expect({ oneway: e.oneway, roundabout: e.roundabout }).toEqual({ oneway: true, roundabout: true });
  });

  it("every ring edge in the shipped district is one-way (the census this field exists for)", () => {
    const rings = loadDistrict().roads.edges.filter((e) => e.roundabout);
    expect(rings.length).toBeGreaterThan(0);
    expect(rings.filter((e) => !e.oneway)).toEqual([]);
  });

  it("the two-way edge really is two-way, which is the only place travelDir can be -1", () => {
    const e = edgeById(loadDistrict(), TWO_WAY_EDGE);
    expect({ oneway: e.oneway, roundabout: e.roundabout }).toEqual({ oneway: false, roundabout: false });
  });
});

// ---------------------------------------------------------------------------
// 1 · THE SIGN · kills the argument swap
// ---------------------------------------------------------------------------

describe("the published angle is SIGNED, from the edge to the car", () => {
  it("a heading 30° clockwise of the edge direction reads +30, not -30", () => {
    const ticks = driveEdge({
      edgeId: STREET_EDGE,
      s0: STREET_S0,
      s1: STREET_S1,
      headingOffsetDeg: 30,
    });
    expect(ticks.length).toBeGreaterThan(50);

    // Pin the fixture: the locator must have committed to THIS edge, or the
    // angle below is measured against a road this test knows nothing about.
    expect(new Set(ticks.map((t) => alignment(t).edgeId))).toEqual(new Set([STREET_EDGE]));

    for (const t of ticks) {
      const deg = alignment(t).deg;
      expect(deg).not.toBeNull();
      // `toBeCloseTo(30, 2)` — |deg - 30| < 0.005. A swapped argument order
      // publishes -30 and reds every frame of this loop; a magnitude-only
      // assertion (|deg| ≈ 30) would not notice.
      expect(deg as number).toBeCloseTo(30, 2);
    }
  });

  it("…and 30° anticlockwise reads -30", () => {
    const ticks = driveEdge({
      edgeId: STREET_EDGE,
      s0: STREET_S0,
      s1: STREET_S1,
      headingOffsetDeg: -30,
    });
    for (const t of ticks) expect(alignment(t).deg as number).toBeCloseTo(-30, 2);
  });
});

// ---------------------------------------------------------------------------
// 2 · THE OLD GATE · kills re-gating the observation behind the conviction
// ---------------------------------------------------------------------------

describe("the observation is published where the conviction is NOT armed", () => {
  it("driving the wrong way up a one-way STREET: deg ≈ ±180 while nobody asked", () => {
    // district-v1 is an OSM extract, not a scenario micro-map, so
    // `worldStatesOneWayStreets` is false and its 251 one-way street edges
    // never arm the conviction — only their ring edges do. Before this field
    // that made the whole drive indistinguishable from a lawful one.
    const ticks = driveEdge({
      edgeId: STREET_EDGE,
      s0: STREET_S1,
      s1: STREET_S0, // s1 < s0 ⇒ against the geometry direction
    });
    expect(ticks.length).toBeGreaterThan(50);

    for (const t of ticks) {
      const ea = alignment(t);
      expect(ea.wrongWayArmed).toBe(false);
      expect(t.wrongWay).toBe(false);
      expect(Math.abs(ea.deg as number)).toBeGreaterThan(175);
    }
  });

  it("…and the SAME false wrongWay on the same edge the right way round is now distinguishable", () => {
    const withFlow = driveEdge({ edgeId: STREET_EDGE, s0: STREET_S0, s1: STREET_S1 });
    const against = driveEdge({ edgeId: STREET_EDGE, s0: STREET_S1, s1: STREET_S0 });

    // The conviction channel says the identical thing about both drives…
    expect(withFlow.map((t) => t.wrongWay)).toEqual(withFlow.map(() => false));
    expect(against.map((t) => t.wrongWay)).toEqual(against.map(() => false));
    // …and the observation separates them. THIS is the whole point of the field.
    expect(Math.abs(alignment(withFlow[10]).deg as number)).toBeLessThan(5);
    expect(Math.abs(alignment(against[10]).deg as number)).toBeGreaterThan(175);
  });
});

// ---------------------------------------------------------------------------
// 3 · THE RING · the founder's question, answered on a roundabout
// ---------------------------------------------------------------------------

describe("on a roundabout ring the record says which way the car circulated", () => {
  it("with the ring's direction: armed, not convicted, and aligned", () => {
    const ticks = driveEdge({ edgeId: RING_EDGE, s0: 3, s1: 29, stepM: 1, rightOffsetM: 0 });
    const onRing = ticks.filter((t) => alignment(t).edgeId === RING_EDGE);
    expect(onRing.length).toBeGreaterThan(10);

    for (const t of onRing) {
      const ea = alignment(t);
      expect(ea.roundabout).toBe(true);
      expect(ea.wrongWayArmed).toBe(true);
      expect(t.wrongWay).toBe(false);
      expect(Math.abs(ea.deg as number)).toBeLessThan(WRONG_WAY_ANGLE_DEG);
    }
  });

  it("against the ring's direction: armed, convicted, and opposed", () => {
    const ticks = driveEdge({ edgeId: RING_EDGE, s0: 29, s1: 3, stepM: 1, rightOffsetM: 0 });
    const onRing = ticks.filter((t) => alignment(t).edgeId === RING_EDGE);
    expect(onRing.length).toBeGreaterThan(10);

    const convicted = onRing.filter((t) => t.wrongWay === true);
    expect(convicted.length).toBeGreaterThan(10);
    for (const t of convicted) {
      expect(Math.abs(alignment(t).deg as number)).toBeGreaterThan(WRONG_WAY_ANGLE_DEG);
    }
  });

  it("a WITH-FLOW ring tick and an UNARMED street tick both read wrongWay:false — and are no longer the same tick", () => {
    const ring = driveEdge({ edgeId: RING_EDGE, s0: 3, s1: 29, stepM: 1, rightOffsetM: 0 }).filter(
      (t) => alignment(t).edgeId === RING_EDGE,
    );
    const street = driveEdge({ edgeId: STREET_EDGE, s0: STREET_S1, s1: STREET_S0 });

    expect(ring[5].wrongWay).toBe(false);
    expect(street[5].wrongWay).toBe(false);
    expect(alignment(ring[5]).wrongWayArmed).toBe(true);
    expect(alignment(street[5]).wrongWayArmed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4 · THE BANK · kills `travelDir: 1`
// ---------------------------------------------------------------------------

describe("on a two-way road the record says WHICH BANK the car occupies", () => {
  /** Nose pointing along the geometry, on the bank whose lawful direction is
   *  the geometry direction. The lawful case. */
  const geometryBank = () =>
    driveEdge({ edgeId: TWO_WAY_EDGE, s0: TWO_WAY_S0, s1: TWO_WAY_S1, stepM: 1, rightOffsetM: 1.6 });
  /** Same nose, same direction of travel — but on the OTHER bank, whose lawful
   *  direction is the opposite one. The offence. */
  const opposingBank = () =>
    driveEdge({ edgeId: TWO_WAY_EDGE, s0: TWO_WAY_S0, s1: TWO_WAY_S1, stepM: 1, rightOffsetM: -1.6 });
  /** The other lawful drive: the opposing bank, taken the way it is meant to be
   *  taken. `deg` is ±180 and the car is doing nothing wrong — which is the
   *  whole reason `deg` alone cannot judge a two-way road. */
  const otherWayLawful = () =>
    driveEdge({ edgeId: TWO_WAY_EDGE, s0: TWO_WAY_S1, s1: TWO_WAY_S0, stepM: 1, rightOffsetM: 1.6 });

  it("the geometry bank reads travelDir +1", () => {
    const ticks = geometryBank();
    expect(ticks.length).toBeGreaterThan(50);
    for (const t of ticks) {
      const ea = alignment(t);
      expect(ea.edgeId).toBe(TWO_WAY_EDGE);
      expect(ea.travelDir).toBe(1);
      expect(Math.abs(ea.deg as number)).toBeLessThan(5);
    }
  });

  it("the opposing bank reads travelDir -1 — the value a hardcoded 1 can never produce", () => {
    const ticks = opposingBank();
    expect(ticks.length).toBeGreaterThan(50);
    for (const t of ticks) {
      const ea = alignment(t);
      expect(ea.edgeId).toBe(TWO_WAY_EDGE);
      // `travelDir: 1` in worldRuntime.ts reds THIS line and nothing else in
      // the tree: every other fixture in this file is a one-way, where the
      // locator returns +1 by construction.
      expect(ea.travelDir).toBe(-1);
      // …and the angle is ~0 while the car faces the wrong way down its bank.
      // deg ALONE says „aligned" here. Only deg-with-travelDir says otherwise.
      expect(Math.abs(ea.deg as number)).toBeLessThan(5);
    }
  });

  it("the bank-relative angle is the one a flow criterion must read, and it separates the two", () => {
    // The consumer rule the type's docblock states: rotate `deg` by 180° when
    // `travelDir` is −1. Asserted here so the guidance cannot quietly stop
    // being true.
    const bankRelative = (ea: EdgeAlignment): number => {
      const raw = (ea.deg as number) + (ea.travelDir === -1 ? 180 : 0);
      return Math.abs(((raw + 540) % 360) - 180);
    };
    expect(bankRelative(alignment(geometryBank()[40]))).toBeLessThan(5);
    expect(bankRelative(alignment(opposingBank()[40]))).toBeGreaterThan(175);
    expect(bankRelative(alignment(otherWayLawful()[40]))).toBeLessThan(5);
  });

  it("…and the raw angle does NOT separate them, which is why travelDir has to be real", () => {
    // Both of these are lawful; one of them reads ±180. A criterion written on
    // `deg` alone convicts the second, and a `travelDir` pinned to 1 makes that
    // unavoidable.
    expect(Math.abs(alignment(geometryBank()[40]).deg as number)).toBeLessThan(5);
    expect(Math.abs(alignment(otherWayLawful()[40]).deg as number)).toBeGreaterThan(175);
  });

  it("neither two-way drive is convicted, because the channel is not armed on a two-way", () => {
    for (const ticks of [geometryBank(), opposingBank(), otherWayLawful()]) {
      for (const t of ticks) {
        expect(alignment(t).wrongWayArmed).toBe(false);
        expect(t.wrongWay).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 5 · PAST THE KERB · kills `edgeId: offCarriageway ? null : …` and
//     `offCarriageway: false`
// ---------------------------------------------------------------------------

describe("off the carriageway the record still names the road the car points along", () => {
  const pastTheKerb = () =>
    driveEdge({
      edgeId: STREET_EDGE,
      s0: STREET_S0,
      s1: STREET_S1,
      rightOffsetM: PAST_THE_KERB_M,
    });

  it("the fixture really is past the kerb: the TICK says the car is nowhere", () => {
    const ticks = pastTheKerb();
    expect(ticks.length).toBeGreaterThan(50);
    // `SimTick.edgeId` is nulled past the kerb by its own contract — „this car
    // is nowhere". If this stops holding the two assertions below stop testing
    // anything, so it is pinned rather than assumed.
    expect(new Set(ticks.map((t) => t.edgeId))).toEqual(new Set([null]));
  });

  it("…while the RECORD keeps the edge, which is the difference the docblock claims", () => {
    for (const t of pastTheKerb()) {
      const ea = alignment(t);
      // Collapsing this into `SimTick.edgeId` (`offCarriageway ? null : id`)
      // reds this line — and destroys the one comparison the docblock offers:
      // a car off the carriageway that is still pointed along a road.
      expect(ea.edgeId).toBe(STREET_EDGE);
      expect(ea.deg).not.toBeNull();
      expect(ea.reason).toBeUndefined();
    }
  });

  it("…and says so: offCarriageway is TRUE on every tick of the leg", () => {
    // Hardcoding `offCarriageway: false` on the measured branch reds this, and
    // takes with it the only filter a road-referenced consumer has.
    for (const t of pastTheKerb()) expect(alignment(t).offCarriageway).toBe(true);
  });

  it("on the carriageway the same leg says the opposite, so the flag is not a constant either way", () => {
    for (const t of driveEdge({ edgeId: STREET_EDGE, s0: STREET_S0, s1: STREET_S1 })) {
      expect(alignment(t).offCarriageway).toBe(false);
      expect(t.edgeId).toBe(STREET_EDGE);
    }
  });

  it("past the kerb the conviction stands down — and the observation does not", () => {
    // This is the carve-out the runtime documents (the mw-v1 verge run: a
    // 10-point ОПАСНА for driving on grass). The angle is published anyway,
    // because suppressing it would recreate the same ambiguity one kerb over.
    for (const t of pastTheKerb()) {
      expect(alignment(t).wrongWayArmed).toBe(false);
      expect(t.wrongWay).toBe(false);
      expect(typeof alignment(t).deg).toBe("number");
    }
  });
});

// ---------------------------------------------------------------------------
// 6 · NULL IS NOT ZERO · kills a null→0 collapse
// ---------------------------------------------------------------------------

describe("not measurable here is its own state", () => {
  it("off the network the record says null with a reason, never 0", () => {
    const rt = createWorldRuntime(loadDistrict());
    // Pin the fixture: the locator really has nothing here.
    expect(rt.locate({ x: OFF_NETWORK.x, y: OFF_NETWORK.y }).edgeId).toBeNull();

    rt.update(0.05);
    const tick = rt.sample(mkVehicle(OFF_NETWORK, { speedKmh: 10 }), 0.05, false);
    const ea = alignment(tick);

    expect(ea.deg).toBeNull();
    expect(ea.deg).not.toBe(0); // the collapse this shape exists to refuse
    expect(ea.reason).toBe("no-edge-fix");
    expect(ea.edgeId).toBeNull();
    expect(ea.wrongWayArmed).toBe(false);
    // The optional members assert nothing about a car that is nowhere.
    expect(ea.travelDir).toBeUndefined();
    expect(ea.roundabout).toBeUndefined();
  });

  it("…and a measured tick carries no reason", () => {
    const ticks = driveEdge({ edgeId: STREET_EDGE, s0: STREET_S0, s1: STREET_S1 });
    for (const t of ticks) {
      const ea = alignment(t);
      expect(ea.deg).not.toBeNull();
      expect(ea.reason).toBeUndefined();
      expect(ea.edgeId).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 7 · REVERSE · `deg` measures the NOSE, not the direction of travel
// ---------------------------------------------------------------------------

describe("deg is a HEADING referent, so a reverse manoeuvre reads ±180", () => {
  /** Travelling ALONG the flow (s rises) with the nose pointing back down it —
   *  a car reversing in the lawful direction of its own lane. `gear: -1` is the
   *  only channel that can say so: `SimTick.speedKmh` is unsigned. */
  const reversingWithTheFlow = () =>
    driveEdge({
      edgeId: STREET_EDGE,
      s0: 190,
      s1: 230,
      stepM: 1,
      headingOffsetDeg: 180,
      vehicle: { gear: -1, speedKmh: 6 },
    });

  it("the fixture is a reverse: the tick says gear -1 and an unsigned speed", () => {
    const ticks = reversingWithTheFlow();
    expect(ticks.length).toBeGreaterThan(20);
    for (const t of ticks) {
      expect(t.gear).toBe(-1);
      expect(t.speedKmh).toBeGreaterThan(0); // unsigned by contract — see types.ts
    }
  });

  it("the car travels WITH the flow and the record reads ±180 all the same", () => {
    // The consequence a reverse/park criterion has to be written around: this
    // drive is going the right way down the street. Read `deg` as a direction
    // of travel and it is a 10-point offence on every frame.
    for (const t of reversingWithTheFlow()) {
      const ea = alignment(t);
      expect(ea.edgeId).toBe(STREET_EDGE);
      expect(Math.abs(ea.deg as number)).toBeGreaterThan(175);
    }
  });

  it("and the CONVICTION channel reads the nose the same way where it is armed", () => {
    // Same manoeuvre on the ring, where the channel IS armed: `wrongWay` fires.
    // Asserted not because the conviction is being endorsed — it is the
    // product's present behaviour and this change does not touch it — but
    // because it is the evidence for the consumer rule in the docblock:
    // `deg` and `wrongWay` are both HEADING referents, so a consumer that
    // wants a direction of TRAVEL must read `gear` alongside them.
    const ring = driveEdge({
      edgeId: RING_EDGE,
      s0: 3,
      s1: 29,
      stepM: 1,
      rightOffsetM: 0,
      headingOffsetDeg: 180,
      vehicle: { gear: -1, speedKmh: 6 },
    }).filter((t) => alignment(t).edgeId === RING_EDGE);
    expect(ring.length).toBeGreaterThan(10);
    expect(ring.some((t) => t.wrongWay === true)).toBe(true);
    for (const t of ring.filter((t) => t.wrongWay === true)) {
      expect(Math.abs(alignment(t).deg as number)).toBeGreaterThan(WRONG_WAY_ANGLE_DEG);
      expect(t.gear).toBe(-1);
    }
  });
});

// ---------------------------------------------------------------------------
// 8 · THE INVARIANT · kills deleted wiring, and any future drift from wrongWay
// ---------------------------------------------------------------------------

describe("the observation can never disagree with the verdict", () => {
  const runs: Array<{ name: string; ticks: SimTick[] }> = [
    { name: "street, with flow", ticks: driveEdge({ edgeId: STREET_EDGE, s0: STREET_S0, s1: STREET_S1 }) },
    { name: "street, against flow", ticks: driveEdge({ edgeId: STREET_EDGE, s0: STREET_S1, s1: STREET_S0 }) },
    { name: "street, 30° off", ticks: driveEdge({ edgeId: STREET_EDGE, s0: STREET_S0, s1: STREET_S1, headingOffsetDeg: 30 }) },
    { name: "ring, with flow", ticks: driveEdge({ edgeId: RING_EDGE, s0: 3, s1: 29, stepM: 1, rightOffsetM: 0 }) },
    { name: "ring, against flow", ticks: driveEdge({ edgeId: RING_EDGE, s0: 29, s1: 3, stepM: 1, rightOffsetM: 0 }) },
    // The states the one-way legs above cannot enter — each one a branch of the
    // publishing expression, so „deleted wiring" cannot hide in any of them.
    {
      name: "street, past the kerb",
      ticks: driveEdge({ edgeId: STREET_EDGE, s0: STREET_S0, s1: STREET_S1, rightOffsetM: PAST_THE_KERB_M }),
    },
    {
      name: "two-way, opposing bank",
      ticks: driveEdge({ edgeId: TWO_WAY_EDGE, s0: TWO_WAY_S0, s1: TWO_WAY_S1, stepM: 1, rightOffsetM: -1.6 }),
    },
    {
      name: "street, reversing with the flow",
      ticks: driveEdge({
        edgeId: STREET_EDGE,
        s0: 190,
        s1: 230,
        stepM: 1,
        headingOffsetDeg: 180,
        vehicle: { gear: -1, speedKmh: 6 },
      }),
    },
    {
      name: "ring, reversing with the flow",
      ticks: driveEdge({
        edgeId: RING_EDGE,
        s0: 3,
        s1: 29,
        stepM: 1,
        rightOffsetM: 0,
        headingOffsetDeg: 180,
        vehicle: { gear: -1, speedKmh: 6 },
      }),
    },
  ];

  it("the runs between them enter EVERY state the record can be in", () => {
    // Without this the invariant degrades silently: a fixture set that only
    // ever produces measured, on-carriageway, travelDir +1 ticks proves the
    // invariant on a third of the record's state space and says nothing about
    // the rest. (That is exactly how `travelDir: 1`, `offCarriageway: false`
    // and an `edgeId` collapsed into `SimTick.edgeId` all survived a green run
    // of this file.)
    const all = runs.flatMap((r) => r.ticks);
    const eas = all.map((t) => alignment(t));
    expect(eas.some((ea) => ea.travelDir === 1)).toBe(true);
    expect(eas.some((ea) => ea.travelDir === -1)).toBe(true);
    expect(eas.some((ea) => ea.offCarriageway)).toBe(true);
    expect(eas.some((ea) => !ea.offCarriageway)).toBe(true);
    expect(eas.some((ea) => ea.roundabout === true)).toBe(true);
    expect(eas.some((ea) => ea.roundabout === false)).toBe(true);
    expect(eas.some((ea) => ea.wrongWayArmed)).toBe(true);
    expect(eas.some((ea) => !ea.wrongWayArmed)).toBe(true);
    // A tick whose RECORD names an edge while the TICK says the car is nowhere.
    expect(all.some((t) => t.edgeId === null && alignment(t).edgeId !== null)).toBe(true);
    // Reverse, and forward.
    expect(all.some((t) => t.gear === -1)).toBe(true);
    expect(all.some((t) => t.gear === 1)).toBe(true);
    // Aligned, opposed, and in between.
    expect(eas.some((ea) => Math.abs(ea.deg as number) < 5)).toBe(true);
    expect(eas.some((ea) => Math.abs(ea.deg as number) > 175)).toBe(true);
    expect(eas.some((ea) => Math.abs(ea.deg as number) > 20 && Math.abs(ea.deg as number) < 40)).toBe(true);
  });

  it("every tick of every drive carries the record", () => {
    for (const run of runs) {
      expect(run.ticks.length).toBeGreaterThan(10);
      const missing = run.ticks.filter((t) => t.edgeAlignment === undefined);
      expect({ run: run.name, missing: missing.length }).toEqual({ run: run.name, missing: 0 });
    }
  });

  it("wrongWay === (armed && deg !== null && |deg| > WRONG_WAY_ANGLE_DEG), on every tick", () => {
    for (const run of runs) {
      const disagreements = run.ticks.filter((t) => {
        const ea = alignment(t);
        const reconstructed =
          ea.wrongWayArmed && ea.deg !== null && Math.abs(ea.deg) > WRONG_WAY_ANGLE_DEG;
        return (t.wrongWay === true) !== reconstructed;
      });
      expect({ run: run.name, disagreements: disagreements.length }).toEqual({
        run: run.name,
        disagreements: 0,
      });
    }
  });

  it("the armed flag reports the gate, not the verdict: armed ticks exist with wrongWay false", () => {
    // A `wrongWayArmed` that was quietly aliased to `wrongWay` would pass the
    // invariant above only when nothing is ever armed-and-innocent. It is.
    const ring = runs.find((r) => r.name === "ring, with flow")!.ticks;
    const armedInnocent = ring.filter((t) => alignment(t).wrongWayArmed && t.wrongWay === false);
    expect(armedInnocent.length).toBeGreaterThan(10);
  });
});
