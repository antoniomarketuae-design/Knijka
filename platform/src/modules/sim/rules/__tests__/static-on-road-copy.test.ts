/**
 * A BODY ON THE ROAD GETS A SENTENCE THAT IS TRUE OF IT — lane staticcardcopy,
 * sc-hz-brake-dont-swerve:b7297cb7 (integrator rulings C1–C3, S1–S10,
 * 2026-10-18; S2(a), the centre rule and the T3 replacement, 2026-11-04).
 *
 * THE DEFECT. A strike on the fallen-load block that stands IN the student's
 * own lane was billed COLLISION/"staticObject" and explained as «…колата е
 * стигнала до него, защото пътят ѝ е излязъл извън платното за движение.
 * Излизането от платното е самото произшествие…» with the peek «Не се появи
 * внезапно.» — false of a car braking in its lane, and the opposite of the
 * drill's own lesson («спирай силно В лентата»). The same clauses printed on
 * the roadworks cones. Base printed them because the reporter's `withWhat`
 * was the only discriminator; nothing on the contact said where the struck
 * body stands.
 *
 * WHAT IS ASSERTED HERE, through the real reducer (`reduceTick`):
 *  · the sentence is selected by A FACT ABOUT THE STRUCK BODY — the contact's
 *    `onCarriageway`, measured once at scene build — NEVER by the car's pose
 *    (the T3 replacement: T3(1) cannot be driven in the built world, because
 *    no off-carriageway car reaches an hz or roadworks body — the first taper
 *    cone stands 4.47 m inside the built kerb; so the two poses are fed
 *    synthetically to the real selection path);
 *  · the new row's budgets, its law (no article: ADR-002) and its cause
 *    (THEO-4), and that it never says any of the three false things;
 *  · the bill itself — code, class, points, termination, citation — does not
 *    move: the split reaches copy only.
 *
 * Red on base: `staticObjectOnRoad` does not exist there and the reducer
 * ignores `onCarriageway`, so every on-road row below fails on its assertion.
 */
import { describe, expect, it } from "vitest";
import {
  COLLISION_CONTACT_COPY,
  VIOLATIONS,
  foldActDetail,
  makeViolation,
  violationCorrectiveBg,
  violationPeekBg,
} from "../catalog";
import type { EdgeAlignment, RuleEvent, SimTick, SimTickEvent, ViolationEvent } from "../types";
import { drive, tick } from "./fixtures";

const ROW = VIOLATIONS.COLLISION;
const ON_ROAD = COLLISION_CONTACT_COPY.staticObjectOnRoad;
const OFF_ROAD = COLLISION_CONTACT_COPY.staticObject;

/** The three clauses that were false of a body standing on the road. */
const FALSE_OF_A_BODY_ON_THE_ROAD = [
  "пътят ѝ е излязъл извън платното",
  "Излизането от платното е самото произшествие",
  "Не се появи внезапно.",
] as const;

function collisions(events: RuleEvent[]): ViolationEvent[] {
  return events.filter((e): e is ViolationEvent => e.kind === "violation" && e.code === "COLLISION");
}

/** The car's pose as the runtime publishes it: on the carriageway (an edge
 *  fix, `edgeAlignment.offCarriageway` false) or past the kerb (`edgeId`
 *  nulled by the surface consult, `offCarriageway` true). */
function carPose(onCarriageway: boolean): Partial<SimTick> {
  const alignment: EdgeAlignment = {
    deg: 0,
    wrongWayArmed: false,
    edgeId: "hzr-e-approach",
    offCarriageway: !onCarriageway,
    travelDir: 1,
  };
  return onCarriageway
    ? { position: { x: 4.06, y: 186.8 }, edgeId: "hzr-e-approach", laneId: 0, edgeAlignment: alignment }
    : { position: { x: 12.6, y: 214.0 }, edgeId: null, edgeAlignment: alignment };
}

/** One static contact through the real reducer, from a car at `pose`. */
function strike(contact: Extract<SimTickEvent, { kind: "collision" }>, pose: Partial<SimTick>): ViolationEvent[] {
  return collisions(
    drive([
      tick(0, { speedKmh: 30, ...pose, events: [contact] }),
      tick(1, { speedKmh: 5, ...pose }),
    ]).events,
  );
}

describe("the struck BODY's fact chooses the sentence — never the car's pose (T3, as replaced 2026-11-04)", () => {
  it("(1) a body ON the carriageway struck by a car whose own centre is OFF it prints the on-road copy", () => {
    const v = strike({ kind: "collision", withWhat: "staticObject", onCarriageway: true }, carPose(false));
    expect(v).toHaveLength(1);
    expect(v[0].detail, "the body stands on the road: the car's kerb-side pose does not decide").toBe("staticObjectOnRoad");
    expect(v[0].explanationBg).toBe(ON_ROAD.explanationBg);
  });

  it("(2) a body OFF the carriageway struck by a car whose own centre is ON it prints today's copy, byte for byte", () => {
    const v = strike({ kind: "collision", withWhat: "staticObject" }, carPose(true));
    expect(v).toHaveLength(1);
    expect(v[0].detail, "an island or a kerb struck from the road: the car's on-road pose does not decide").toBe("staticObject");
    expect(v[0].explanationBg).toBe(OFF_ROAD.explanationBg);
    expect(v[0].titleBg).toBe(OFF_ROAD.titleBg);
  });

  it("the other two crossings of body × pose agree: the body alone decides", () => {
    expect(strike({ kind: "collision", withWhat: "staticObject", onCarriageway: true }, carPose(true))[0].detail).toBe(
      "staticObjectOnRoad",
    );
    expect(strike({ kind: "collision", withWhat: "staticObject" }, carPose(false))[0].detail).toBe("staticObject");
  });

  it("the fact is read only off a STATIC contact: a vehicle, a person or a cyclist keeps its own row", () => {
    for (const withWhat of ["vehicle", "pedestrian", "cyclist"] as const) {
      const v = strike({ kind: "collision", withWhat, onCarriageway: true }, carPose(true));
      expect(v.map((e) => e.detail), withWhat).toEqual([withWhat]);
    }
  });
});

describe("the split reaches copy only — the bill does not move", () => {
  it("same code, class, points, termination, concept and citation as the off-road row", () => {
    const [on] = strike({ kind: "collision", withWhat: "staticObject", onCarriageway: true }, carPose(true));
    const [off] = strike({ kind: "collision", withWhat: "staticObject" }, carPose(true));
    for (const key of ["code", "t", "severityClass", "points", "terminateSession", "conceptId", "lawRef"] as const) {
      expect(on[key], key).toEqual(off[key]);
    }
    expect(on.lawRef).toBe(ROW.lawRef);
    // The title is the off-road row's, UNCHANGED (C3).
    expect(on.titleBg).toBe("Удар в неподвижно препятствие");
    expect(ON_ROAD.titleBg).toBe(OFF_ROAD.titleBg);
  });

  it("no lawRef and no correctiveBg of its own (S8): the pooled corrective serves it", () => {
    expect(ON_ROAD).not.toHaveProperty("lawRef");
    expect(ON_ROAD).not.toHaveProperty("correctiveBg");
    expect(violationCorrectiveBg("COLLISION", "staticObjectOnRoad")).toBe(ROW.correctiveBg);
    // …and the pooled corrective's off-road clause is CONDITIONAL, so it is
    // true of a car that never left the road («А тръгне ли колата извън…»).
    expect(ROW.correctiveBg).toContain("А тръгне ли колата извън платното");
  });
});

describe("THE COPY (C3, S8, S9): true of every body the fact flags, budgets, law and cause (T8)", () => {
  it("never prints any of the three false clauses — not in the explanation, not in the peek", () => {
    for (const s of FALSE_OF_A_BODY_ON_THE_ROAD) {
      expect(ON_ROAD.explanationBg).not.toContain(s);
      expect(ON_ROAD.peekBg).not.toBe(s);
    }
    // …while the off-road row keeps them (it is true of a kerb, a façade, an island).
    expect(OFF_ROAD.explanationBg).toContain(FALSE_OF_A_BODY_ON_THE_ROAD[0]);
    expect(OFF_ROAD.peekBg).toBe(FALSE_OF_A_BODY_ON_THE_ROAD[2]);
  });

  it("says nothing a body on the road, in a car park or on the training ground would falsify", () => {
    // Every body the fact flags today: a load fallen into the lane, a cone of
    // a lane closure (knocked over, or brushed ALONGSIDE on the boundary
    // line), a wall at the end of a car-park bay, a poligon cone touched in
    // reverse. So: no claim the car left anything; no claim about how
    // suddenly the body appeared; no street, lane or carriageway the car park
    // or the poligon would contradict; no «ahead» that a reverse or a brush
    // alongside would contradict; no article (ADR-002, retrieval only).
    const text = `${ON_ROAD.explanationBg} ${ON_ROAD.peekBg}`;
    for (const banned of [/внезапн/i, /излез/i, /излиз/i, /чл\./i, /пред колата/i, /улиц/i, /лент/i, /платн/i, /напред/i]) {
      expect(text, String(banned)).not.toMatch(banned);
    }
  });

  it("explains WHY (THEO-4): the room it needed, what decides it, and what to do the moment it shows", () => {
    expect(ON_ROAD.explanationBg).toMatch(/без да оставиш място за него/);
    expect(ON_ROAD.explanationBg).toMatch(/да спреш или безопасно да го заобиколиш/);
    expect(ON_ROAD.explanationBg).toMatch(/скоростта се избира/);
    expect(ON_ROAD.explanationBg).toMatch(/намаляваш веднага/);
  });

  it("the explanation fits the measured card budget: at most 323 characters", () => {
    expect([...ON_ROAD.explanationBg].length).toBeLessThanOrEqual(323);
  });

  it("the peek states a CAUSE, from the explanation's first clause, in one line at 25–27 characters a line", () => {
    expect(ON_ROAD.peekBg).toBe("Не остави място за него.");
    for (const perLine of [25, 26, 27]) expect(ON_ROAD.peekBg.length, `@${perLine}`).toBeLessThanOrEqual(perLine);
    // From the first clause: «…без да оставиш място за него».
    const firstClause = ON_ROAD.explanationBg.split(" — ")[0];
    expect(firstClause).toContain("място за него");
    // Distinct from every other peek of the code, and not the title.
    const others = Object.entries(COLLISION_CONTACT_COPY)
      .filter(([k]) => k !== "staticObjectOnRoad")
      .map(([, c]) => c.peekBg);
    expect(others).not.toContain(ON_ROAD.peekBg);
    expect(ON_ROAD.peekBg).not.toBe(ON_ROAD.titleBg);
    // Not the pooled phone fallback (S9).
    expect(ON_ROAD.peekBg).not.toBe(ROW.peekBg);
    expect(ROW.peekBg).toBe("Спирачният път не стигна.");
    expect(violationPeekBg("COLLISION", "staticObjectOnRoad")).toBe(ON_ROAD.peekBg);
  });

  it("makeViolation stamps the act's own copy for the on-road detail", () => {
    const e = makeViolation("COLLISION", 3, { detail: "staticObjectOnRoad" });
    expect(e.titleBg).toBe(ON_ROAD.titleBg);
    expect(e.explanationBg).toBe(ON_ROAD.explanationBg);
  });
});

describe("the one fold (S3, S10)", () => {
  it("maps «staticObjectOnRoad» to «staticObject» and is the identity on everything else", () => {
    expect(foldActDetail("staticObjectOnRoad")).toBe("staticObject");
    for (const d of [...Object.keys(COLLISION_CONTACT_COPY).filter((k) => k !== "staticObjectOnRoad"), undefined, "", "62 в 50", "no-stop"]) {
      expect(foldActDetail(d), String(d)).toBe(d);
    }
  });
});

describe("the contact contract (S6): the key is absent on every other contact", () => {
  it("a static contact without the fact bills exactly as base, and its event shape has no key", () => {
    const ev: Extract<SimTickEvent, { kind: "collision" }> = { kind: "collision", withWhat: "staticObject" };
    expect(Object.keys(ev)).toEqual(["kind", "withWhat"]);
    const v = strike(ev, carPose(true));
    expect(v.map((e) => [e.detail, e.explanationBg])).toEqual([["staticObject", OFF_ROAD.explanationBg]]);
  });
});
