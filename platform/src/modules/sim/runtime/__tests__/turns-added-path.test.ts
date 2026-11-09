/**
 * THE ADDED, ROAD-REFERENCED TURN PATH — runtime/turns.ts (lane slowturn, row
 * sc-turn-left-oncoming:1613ef2c). Synthetic grid drives through the detector
 * alone, with a fake road port, at the runtime's 60 Hz grid.
 *
 * What is pinned, cell by cell (each named after the rule it holds):
 *  - a slow (10 km/h) junction turn and a turn interrupted by a 20 s stop are
 *    seen — once, flagged `addedPath`, where the 3 s window sees nothing;
 *  - a base event keeps its step, the added path never fires on a visit the
 *    base already reported, a base event that is the tail of an added event's
 *    manoeuvre is suppressed only until the window re-arms (a second
 *    manoeuvre in the same visit survives);
 *  - nothing is added for a yaw at rest, a reverse arc, two small swings at
 *    two nodes, the ring, a lane change or a car following a bending road.
 */
import { describe, expect, it } from "vitest";
import type { SimTickEvent } from "../../rules/types";
import { TURN_THRESHOLD_DEG, TURN_WINDOW_SEC, TurnDetector, type TurnRoadPort, type TurnRoadSample } from "../turns";

const DT = 1 / 60;

/**
 * The fake network. Edge 0: the approach, heading north (0°) into node "N".
 * Its through edge is 1 (straight on, 0°). Edge 2: a westbound side road
 * (270°) — leaving onto it is a left turn. Edge 3: an approach into node "B"
 * whose through edge 4 bends steadily from 0° to 65° over its first 25 m — a
 * road that bends 65° inside the junction area and is never turned off.
 */
const port: TurnRoadPort = {
  bearingDeg(e, sM, sign) {
    let b: number;
    if (e === 0 || e === 1 || e === 3) b = 0;
    else if (e === 2) b = 270;
    else if (e === 4) b = 65 * Math.min(1, Math.max(0, sM) / 25);
    else b = 0;
    return sign > 0 ? b : (b + 180) % 360;
  },
  through(e, sign) {
    if (sign < 0) return null;
    if (e === 0) return { edgeIdx: 1, sign: 1 };
    if (e === 3) return { edgeIdx: 4, sign: 1 };
    return null;
  },
};

interface Step {
  h: number;
  v: number;
  node: string | null;
  edge: number;
  sM: number;
  ring?: boolean;
}

interface Fired {
  k: number;
  dir: "left" | "right";
  added: boolean;
}

function feed(steps: readonly Step[], det = new TurnDetector()): Fired[] {
  const out: Fired[] = [];
  const ev: SimTickEvent[] = [];
  const sample: TurnRoadSample = { nodeId: null, ring: false, edgeIdx: -1, sM: 0, port };
  steps.forEach((s, i) => {
    const k = i + 1;
    ev.length = 0;
    sample.nodeId = s.node;
    sample.ring = s.ring === true;
    sample.edgeIdx = s.edge;
    sample.sM = s.sM;
    det.update(k * DT, s.h, s.node !== null, ev, s.v, sample);
    for (const e of ev) {
      if (e.kind === "turnStarted") out.push({ k, dir: e.direction, added: e.addedPath === true });
    }
  });
  return out;
}

/** The same drive through a detector given NO road sample — the base window alone. */
function feedBase(steps: readonly Step[]): Fired[] {
  const det = new TurnDetector();
  const out: Fired[] = [];
  const ev: SimTickEvent[] = [];
  steps.forEach((s, i) => {
    const k = i + 1;
    ev.length = 0;
    det.update(k * DT, s.h, s.node !== null, ev, s.v);
    for (const e of ev) if (e.kind === "turnStarted") out.push({ k, dir: e.direction, added: false });
  });
  return out;
}

/** A drive builder: segments of constant speed and constant yaw rate. */
class Drive {
  readonly steps: Step[] = [];
  h = 0;
  sM = 0;
  constructor(
    public node: string | null,
    public edge: number,
    public ring = false,
  ) {}
  /** `sec` seconds at `kmh`, yawing `degPerSec` (CW +). */
  go(sec: number, kmh: number, degPerSec = 0): this {
    const n = Math.round(sec / DT);
    for (let i = 0; i < n; i++) {
      this.h += degPerSec * DT;
      this.sM += (kmh / 3.6) * DT;
      this.steps.push({ h: this.h, v: kmh, node: this.node, edge: this.edge, sM: this.sM, ring: this.ring });
    }
    return this;
  }
  /** Turn `deg` (signed) at `kmh` on radius `radiusM`. */
  turn(deg: number, kmh: number, radiusM: number): this {
    const rate = (((kmh / 3.6) / radiusM) * 180) / Math.PI; // deg/s
    return this.go(Math.abs(deg) / rate, kmh, Math.sign(deg) * rate);
  }
  stop(sec: number): this {
    return this.go(sec, 0);
  }
  at(node: string | null, edge: number, ring = this.ring): this {
    this.node = node;
    this.edge = edge;
    this.ring = ring;
    this.sM = 0;
    return this;
  }
}

describe("the added path sees a slow junction turn (D1–D3)", () => {
  it("SLOW-TURN: a 90° left turn at 10 km/h on R15 — no base event, exactly one ADDED left event", () => {
    const d = new Drive("N", 0).go(2, 10).turn(-30, 10, 15).at("N", 2).turn(-60, 10, 15).go(2, 10);
    const fired = feed(d.steps);
    expect(fired.map((f) => `${f.dir}:${f.added ? "added" : "base"}`)).toEqual(["left:added"]);
  });

  it("SLOW-TURN-RIGHT: a 90° right turn at 10 km/h on R15 — exactly one ADDED right event", () => {
    const d = new Drive("N", 0).go(2, 10).turn(30, 10, 15).at("N", 2).turn(60, 10, 15).go(2, 10);
    const fired = feed(d.steps);
    expect(fired.map((f) => `${f.dir}:${f.added ? "added" : "base"}`)).toEqual(["right:added"]);
  });

  it("STOP-PAUSES: a 12 km/h left turn stopped for 20 s after 30° of swing is still ONE added event (no time window)", () => {
    const d = new Drive("N", 0).go(2, 12).turn(-30, 12, 15).stop(20).at("N", 2).turn(-60, 12, 15).go(2, 12);
    const fired = feed(d.steps);
    expect(fired.map((f) => `${f.dir}:${f.added ? "added" : "base"}`)).toEqual(["left:added"]);
    // It lands after the stop, i.e. the 30° before it were not forgotten: the
    // car needs only ~25° more after restarting.
    const restartK = Math.round((2 + (30 / ((12 / 3.6 / 15) * (180 / Math.PI))) + 20) / DT);
    expect(fired[0].k).toBeGreaterThan(restartK);
  });

  it("BASE-KEEPS-ITS-STEP: a fast 90° turn fires the base event at the window's own step, never an added one", () => {
    const d = new Drive("N", 0).go(2, 25).turn(-90, 25, 12).go(2, 25);
    const fired = feed(d.steps);
    expect(fired).toEqual(feedBase(d.steps));
    expect(fired.map((f) => `${f.dir}:${f.added ? "added" : "base"}`)).toEqual(["left:base"]);
  });
});

describe("suppression — one manoeuvre, one event; a second manoeuvre survives (rule iii)", () => {
  it("NEVER-ON-A-BASE-VISIT: after a base event, a slow continuation in the same visit adds nothing", () => {
    // Fast 70° (base fires), then 60° more at a crawl in the same visit.
    const d = new Drive("N", 0).go(2, 25).turn(-70, 25, 12).turn(-60, 8, 15).go(2, 8);
    const fired = feed(d.steps);
    expect(fired.map((f) => `${f.dir}:${f.added ? "added" : "base"}`)).toEqual(["left:base"]);
  });

  it("SECOND-MANOEUVRE-SURVIVES: a slow left (added), straighten until the window re-arms, then a fast right (base) — both", () => {
    const d = new Drive("N", 0)
      .go(2, 10)
      .turn(-90, 10, 15)
      .go(4, 10) // straight: the window falls under 15°
      .turn(90, 25, 12)
      .go(2, 25);
    const fired = feed(d.steps);
    expect(fired.map((f) => `${f.dir}:${f.added ? "added" : "base"}`)).toEqual(["left:added", "right:base"]);
  });

  it("TAIL-SUPPRESSED: an added event's own manoeuvre speeding up past 55°/3 s does not report a second turn", () => {
    // 10 km/h until the added path fires, then the SAME left turn tightens to
    // 30 km/h-on-R12 pace without the window ever falling under 15°.
    const d = new Drive("N", 0).go(2, 10).turn(-80, 10, 15).turn(-80, 30, 12).go(2, 30);
    const fired = feed(d.steps);
    expect(fired.map((f) => `${f.dir}:${f.added ? "added" : "base"}`)).toEqual(["left:added"]);
  });
});

describe("no added event without a turn off the road (T4, negative)", () => {
  const added = (steps: Step[]) => feed(steps).filter((f) => f.added);

  it("YAW-AT-REST: 5 m in, then 70° of yaw at 0 km/h — nothing (moving gate)", () => {
    // A slow 40° first, so the deferral's window is open: only the rest yaw
    // could take the measure past 55°.
    const d = new Drive("N", 0).go(2, 10).turn(-40, 10, 15).stop(1);
    for (let i = 0; i < 300; i++) {
      d.h -= 70 / 300;
      d.steps.push({ h: d.h, v: 0, node: "N", edge: 0, sM: d.sM });
    }
    d.stop(4);
    expect(added(d.steps)).toEqual([]);
  });

  it("REVERSE-ARC: 40° forward, then a 40° arc at −5 km/h — nothing (forward-only)", () => {
    const d = new Drive("N", 0).go(2, 10).turn(-40, 10, 15).stop(1).go(40 / (((5 / 3.6 / 6) * 180) / Math.PI), -5, -((5 / 3.6 / 6) * 180) / Math.PI).stop(4);
    expect(added(d.steps)).toEqual([]);
  });

  it("TWO-NODES: 35° at node A, then 30° at node B — nothing (the visit resets on a node change)", () => {
    const d = new Drive("A", 0).go(1, 10).turn(-35, 10, 15).go(1, 10).at("B", 2).turn(-30, 10, 15).go(3, 10);
    expect(added(d.steps)).toEqual([]);
  });

  it("RING: a 120° slow sweep on a roundabout node — nothing (the ring is excluded)", () => {
    const d = new Drive("R", 0, true).go(1, 10).turn(-120, 10, 15).go(2, 10);
    expect(added(d.steps)).toEqual([]);
  });

  it("LANE-CHANGE: 12° out and 12° back along the road — nothing", () => {
    const d = new Drive("N", 0).go(1, 12).go(1, 12, -12).go(1, 12).go(1, 12, 12).go(2, 12);
    expect(added(d.steps)).toEqual([]);
  });

  it.each([8, 12, 15])("BEND-FOLLOW at %i km/h: following a road that bends 65° through the node — nothing (road reference)", (kmh) => {
    // The car's heading IS the road's: 0° on the approach, then the through
    // edge's 0° → 65° bend, metre by metre (the base window never sees 55° in
    // 3 s at these speeds, so only a reference that is not the road could).
    const steps: Step[] = [];
    let sM = 0;
    for (let i = 0; i < Math.round(3 / DT); i++) {
      sM += (kmh / 3.6) * DT;
      steps.push({ h: 0, v: kmh, node: "B", edge: 3, sM });
    }
    sM = 0;
    while (sM < 38) {
      sM += (kmh / 3.6) * DT;
      steps.push({ h: port.bearingDeg(4, sM, 1), v: kmh, node: "B", edge: 4, sM });
    }
    expect(added(steps)).toEqual([]);
  });
});

/**
 * RULING R12 — THE DEFERRAL MAY DELAY, NEVER STARVE. A turn so gentle that the
 * base window never holds a turn (4°/s: the window never exceeds 12°, under
 * TURN_REARM_DEG, so the window-held release (a) never opens) is still seen,
 * once, ONE WINDOW after its road measure went past 55° (the deadline (a')),
 * and the deadline counts from the crossing that STAYS past 55°: a swing that
 * went past and fell back is not the turn the deadline waits on.
 */
describe("R12 — the deferral may delay, never starve", () => {
  /** First grid step (1-based) at which the visit's heading change exceeds 55°. */
  const crossK = (steps: readonly Step[], from = 0) => {
    const h0 = steps[0].h;
    for (let i = from; i < steps.length; i++) if (Math.abs(steps[i].h - h0) > TURN_THRESHOLD_DEG) return i + 1;
    return -1;
  };
  const W = Math.round(TURN_WINDOW_SEC / DT);

  it("DEADLINE-NEVER-STARVES: a 4°/s left turn the window never holds is ONE added event, one window after the 55° crossing", () => {
    const d = new Drive("N", 0).go(1, 10).go(25, 10, -4).go(3, 10);
    const fired = feed(d.steps);
    const kc = crossK(d.steps);
    expect(fired.map((f) => `${f.dir}:${f.added ? "added" : "base"}`)).toEqual(["left:added"]);
    expect(fired[0].k - kc).toBeGreaterThan(W);
    expect(fired[0].k - kc).toBeLessThanOrEqual(W + 3);
    expect(feedBase(d.steps)).toEqual([]);
  });

  it("DEADLINE-RESTARTS: past 55° for 1.5 s and back, then past again — the deadline counts from the crossing that stays", () => {
    const d = new Drive("N", 0)
      .go(1, 10)
      .go(14.5, 10, -4) // to −58°: past 55° …
      .go(2, 10, 4) // … and back to −50° inside 1.5 s
      .go(4, 10) // straight on at −50°
      .go(5, 10, -4) // past 55° again, for good (−70°)
      .go(5, 10);
    const fired = feed(d.steps);
    const firstPast = crossK(d.steps);
    const secondFrom = Math.round((1 + 14.5 + 2 + 4) / DT);
    const kc = crossK(d.steps, secondFrom);
    expect(kc - firstPast).toBeGreaterThan(W); // the two crossings are far apart
    expect(fired.map((f) => `${f.dir}:${f.added ? "added" : "base"}`)).toEqual(["left:added"]);
    expect(fired[0].k - kc).toBeGreaterThan(W);
    expect(fired[0].k - kc).toBeLessThanOrEqual(W + 3);
  });
});
