/**
 * «ПРЕМИНИ ПРЕЗ КРЪГОВОТО» — the passage half of the roundabout objective,
 * driven on the SHIPPED geometry rather than on hand-drawn ticks.
 *
 * THE FALSE PASS THIS FILE REFUTES, measured on the fixed code (commit 5366c8b
 * had just closed the sibling route, the one that needed a deliberate R):
 *
 *   a car rolls up to the give-way line — d = 25 against an enterRadiusM of 26
 *   — decides against the roundabout, and turns RIGHT down the near side road
 *   with its right stalk lit, because that turn genuinely needs the stalk. It
 *   drives away FORWARDS, crosses exitRadiusM, and collects
 *   «✓ Премини през кръговото и излез с десен мигач».
 *
 * No cheating, no reverse gear, nothing exotic: `entered` latched at
 * d ≤ enterRadiusM, and enterRadiusM is authored 6–11 m OUTSIDE the circulatory
 * carriageway on every shipped ring, so „entered the roundabout" was satisfied
 * by approaching one.
 *
 * WHY THE FIX IS AN ARC AND NOT A TIGHTER ENTRY. The founder's standing ruling
 * is that credit withheld from correct driving is the worst failure this engine
 * can have, so a fix that shrinks `enterRadiusM` (or demands a minimum depth)
 * is only allowed if no legitimate entry stops counting — and none survives
 * that test: on rb-2lane the OUTER ring lane rides 28.5 m against enterRadiusM
 * 33, i.e. 0.86 of it, while the false pass above sits at 0.96. There is no
 * depth threshold that fits between them on every geometry at once. Arc has no
 * such conflict, and it is what the objective's own title promises.
 *
 * BOTH DIRECTIONS ARE PROVEN BELOW, and both drives are walked off the
 * registered polylines of the maps the lessons actually load — the district-v1
 * ring the L3 lesson and the exam bank use, and rb-mini, which is
 * `sc-roundabout-entry`'s own map:
 *
 *   · a real traversal with a right exit signal is still credited, including
 *     the case where the exit turn auto-cancels the stalk before the boundary
 *     (B21-RB), and including the shortest passage each ring allows;
 *   · the turn-away down the side road is not.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ROUNDABOUT_MIN_TRAVERSAL_ARC_DEG,
  createEvalState,
  parseObjectiveParams,
  stepObjective,
} from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SC_ROUNDABOUT_ENTRY } from "../scenario/templates-flow";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import { LESSONS } from "../specs";
import type { ObjectiveEvalState, ObjectiveParams } from "../types";
import { makeTick } from "./fixtures";

// ---------------------------------------------------------------------------
// The shipped maps
// ---------------------------------------------------------------------------

type Pt = [number, number];
interface RawDistrict {
  roads: { edges: { id: string; geometry: [number, number][] }[] };
  roundabouts: { id: string; x: number; y: number; radius: number }[];
}

function loadDistrict(file: string): RawDistrict {
  const candidates = [
    path.join(process.cwd(), "content", "world", file),
    path.resolve(process.cwd(), "..", "content", "world", file),
  ];
  for (const f of candidates) {
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")) as RawDistrict;
  }
  throw new Error(`${file} not found in: ${candidates.join(", ")}`);
}

const D1 = loadDistrict("district-v1.json");
const RB1 = D1.roundabouts[0]!; // rb-1, r = 19.83 at (−38.03, −342.96)

const edgeGeom = (id: string): Pt[] => {
  const e = D1.roads.edges.find((x) => x.id === id);
  if (!e) throw new Error(`edge ${id} missing from district-v1`);
  return e.geometry.map((p) => [p[0], p[1]] as Pt);
};

// ---------------------------------------------------------------------------
// Path plumbing — polyline → the ticks a drive would produce
// ---------------------------------------------------------------------------

/** Every `stepM` along the polyline (a 15 km/h drive samples far finer). */
function resample(poly: Pt[], stepM = 0.3): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < poly.length; i++) {
    const [x0, y0] = poly[i]!;
    const [x1, y1] = poly[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / stepM));
    for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  out.push(poly[poly.length - 1]!);
  return out;
}

/** Shift a centreline to the RIGHT of travel — cars drive on the right. */
function offsetRight(poly: Pt[], offM: number): Pt[] {
  return poly.map((p, i) => {
    const a = poly[Math.max(0, i - 1)]!;
    const b = poly[Math.min(poly.length - 1, i + 1)]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    return [p[0] + (dy / L) * offM, p[1] + (-dx / L) * offM] as Pt;
  });
}

const distTo = (p: Pt, cx: number, cy: number): number => Math.hypot(p[0] - cx, p[1] - cy);
const azAbout = (p: Pt, cx: number, cy: number): number =>
  (Math.atan2(p[0] - cx, -(p[1] - cy)) * 180) / Math.PI;

/** Net degrees of arc the path sweeps about the island while inside `R` — the
 *  quantity the evaluator accumulates, recomputed here so the tests can state
 *  the margin they are relying on instead of asserting a bare boolean. */
function netArcInside(pts: Pt[], cx: number, cy: number, R: number): number {
  let net = 0;
  let prev: number | null = null;
  for (const p of pts) {
    if (distTo(p, cx, cy) <= R) {
      const a = azAbout(p, cx, cy);
      if (prev !== null) {
        const raw = (((a - prev) % 360) + 360) % 360;
        net += raw > 180 ? raw - 360 : raw;
      }
      prev = a;
    } else prev = null;
  }
  return net;
}

interface DriveResult {
  done: boolean;
  evalState: ObjectiveEvalState;
  /** Distance from the island at which `done` first fired, m (null if never). */
  doneAtM: number | null;
}

/**
 * Drive a path through one objective at 15 km/h — the lesson speed the ring
 * geometries were measured at — with `indicatorAt` deciding the stalk per
 * sample, exactly as a student's hand (and CabinControls' auto-cancel) would.
 */
function drive(
  params: ObjectiveParams,
  pts: Pt[],
  cx: number,
  cy: number,
  indicatorAt: (p: Pt, d: number) => "off" | "left" | "right" = () => "off",
  gear = 1,
): DriveResult {
  let evalState: ObjectiveEvalState = createEvalState(params);
  let done = false;
  let doneAtM: number | null = null;
  let t = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    if (i > 0) t += Math.hypot(p[0] - pts[i - 1]![0], p[1] - pts[i - 1]![1]) / (15 / 3.6);
    const d = distTo(p, cx, cy);
    const r = stepObjective(
      params,
      evalState,
      makeTick({
        t,
        position: { x: p[0], y: p[1] },
        speedKmh: 15,
        gear,
        indicator: indicatorAt(p, d),
      }),
    );
    evalState = r.evalState;
    if (r.done && !done) {
      done = true;
      doneAtM = d;
    }
  }
  return { done, evalState, doneAtM };
}

// ---------------------------------------------------------------------------
// The objectives, taken from the shipped specs (not re-authored here)
// ---------------------------------------------------------------------------

/** L3 «Премини през кръговото и излез от него» — district-v1 rb-1, 26 / 45. */
const L3_RING: ObjectiveParams = (() => {
  for (const lesson of LESSONS) {
    for (const o of lesson.objectives) {
      if (o.id === "l3-pass") return parseObjectiveParams(o);
    }
  }
  throw new Error("l3-pass objective missing from specs.ts");
})();

/** `sc-roundabout-entry`'s ring objective on rb-mini — 24 / 34. */
const SC_RING: ObjectiveParams = (() => {
  const compiled = compileScenario(SC_ROUNDABOUT_ENTRY, 3);
  for (const o of compiled.objectives) {
    const p = parseObjectiveParams(o);
    if (p.kind === "completeManeuver" && p.maneuver === "roundabout") return p;
  }
  throw new Error("sc-roundabout-entry has no roundabout objective");
})();

const ringOf = (p: ObjectiveParams) => {
  if (p.kind !== "completeManeuver" || p.maneuver !== "roundabout") throw new Error("shape");
  return { x: p.x, y: p.y, enterRadiusM: p.enterRadiusM, exitRadiusM: p.exitRadiusM };
};

// ---------------------------------------------------------------------------
// district-v1 rb-1 — the real Sofia ring
// ---------------------------------------------------------------------------

describe("district-v1 rb-1 — the L3 / exam-bank ring, walked off its own polylines", () => {
  const ring = ringOf(L3_RING);

  /**
   * The SHORTEST passage this ring allows: in at the 290° mouth („Баку"
   * inbound), one exit round, out at the 351° mouth. Its mouths are 61° apart —
   * the tightest adjacent pair of the six — so this is the legitimate drive
   * with the least arc to give, and therefore the one the threshold has to
   * clear.
   */
  const shortestPassage = resample(
    offsetRight(
      [
        ...edgeGeom("e25653914.0"), // approach, 49 m → the ring at az 290°
        ...edgeGeom("e925166132.0").slice(1), // the ring, 290° → 351°
        ...edgeGeom("e89604105.0").slice(1), // away up the 351° arm
      ],
      1.6,
    ),
  );

  /** The refuted drive: to the give-way line at d = 25, then RIGHT down the
   *  side road and away. The road LEADS AWAY, as a side road does — after the
   *  junction the car never comes closer to the island again — and the turn is
   *  an ordinary 8 m right-hander at give-way speed. */
  const turnAwayAtTheLine = (() => {
    const perigee = 25;
    const arm = offsetRight(edgeGeom("e25653914.0"), 1.6);
    const pts: Pt[] = [];
    for (const p of resample(arm)) {
      if (distTo(p, ring.x, ring.y) <= perigee) break;
      pts.push(p);
    }
    // …the right-hander onto the side road, kept outside the give-way circle.
    const last = pts[pts.length - 1]!;
    const prev = pts[pts.length - 6] ?? pts[0]!;
    let hx = last[0] - prev[0];
    let hy = last[1] - prev[1];
    const hl = Math.hypot(hx, hy) || 1;
    hx /= hl;
    hy /= hl;
    const turnR = 8;
    let cur: Pt = last;
    for (let k = 1; k <= 90; k++) {
      const a = (-k * Math.PI) / 180; // clockwise = a right turn
      const dx = hx * Math.cos(a) - hy * Math.sin(a);
      const dy = hx * Math.sin(a) + hy * Math.cos(a);
      const step = (turnR * Math.PI) / 180;
      let p: Pt = [cur[0] + dx * step, cur[1] + dy * step];
      const d = distTo(p, ring.x, ring.y);
      if (d < perigee) {
        p = [ring.x + ((p[0] - ring.x) * perigee) / d, ring.y + ((p[1] - ring.y) * perigee) / d];
      }
      pts.push(p);
      cur = p;
    }
    // …and 80 m of side road, straight away from the roundabout.
    const tail = pts[pts.length - 1]!;
    const before = pts[pts.length - 4]!;
    const tl = Math.hypot(tail[0] - before[0], tail[1] - before[1]) || 1;
    for (let s = 0.3; s <= 80; s += 0.3) {
      pts.push([
        tail[0] + ((tail[0] - before[0]) / tl) * s,
        tail[1] + ((tail[1] - before[1]) / tl) * s,
      ]);
    }
    return pts;
  })();

  it("the geometry is the shipped one — enterRadiusM sits OUTSIDE the carriageway, which is the whole hole", () => {
    expect([ring.x, ring.y]).toEqual([RB1.x, RB1.y]);
    expect(ring.enterRadiusM).toBe(26);
    expect(ring.exitRadiusM).toBe(45);
    // 6.2 m of it: everything between the ring and 26 m is „entered" already.
    expect(ring.enterRadiusM - RB1.radius).toBeGreaterThan(6);
    // …and the refuted drive never gets past the give-way line.
    const deepest = Math.min(...turnAwayAtTheLine.map((p) => distTo(p, ring.x, ring.y)));
    expect(deepest).toBeGreaterThan(RB1.radius + 4);
    expect(deepest).toBeLessThan(ring.enterRadiusM);
  });

  it("CREDIT: the shortest real passage, right stalk on the ring, still completes", () => {
    // The textbook signal — lit once he is round past the mouth before his own,
    // and dark again from the moment the exit turn straightens the wheel, which
    // is 4 m INSIDE enterRadiusM on this geometry (B21-RB's auto-cancel case).
    let signalled = false;
    const r = drive(L3_RING, shortestPassage, ring.x, ring.y, (p, d) => {
      const az = (azAbout(p, ring.x, ring.y) + 360) % 360;
      if (d <= ring.enterRadiusM && az >= 320 && az <= 345) {
        signalled = true;
        return "right";
      }
      return "off";
    });
    expect(signalled).toBe(true);
    expect(r.done).toBe(true);
  });

  it("…and it clears the arc threshold with room — 87° of island against the 45° it must show", () => {
    const arc = netArcInside(shortestPassage, ring.x, ring.y, ring.enterRadiusM);
    expect(Math.abs(arc)).toBeGreaterThan(80);
    expect(Math.abs(arc)).toBeGreaterThan(ROUNDABOUT_MIN_TRAVERSAL_ARC_DEG * 1.7);
  });

  it("…and NOTHING about the signal rules moved: the same passage driven silent still voids", () => {
    const r = drive(L3_RING, shortestPassage, ring.x, ring.y);
    expect(r.done).toBe(false);
    expect(r.evalState).toMatchObject({ type: "roundabout", voidedExits: 1, entered: false });
  });

  it("REFUSAL: the give-way line, right stalk, right turn down the side road — no tick", () => {
    // The stalk is lit for the turn he actually makes, and it is lit honestly:
    // that turn needs it. Nothing here is a cheat — which is exactly why the
    // objective may not read it as a roundabout.
    const r = drive(L3_RING, turnAwayAtTheLine, ring.x, ring.y, (_p, d) =>
      d < ring.enterRadiusM + 12 ? "right" : "off",
    );
    expect(r.done).toBe(false);
    expect(r.doneAtM).toBeNull();
  });

  it("…and it is ABANDONED, not voided — the card would accuse him of the wrong thing", () => {
    // „Излезе от кръговото без десен мигач" aimed at a student who never
    // entered one, with his stalk lit for a turn that needed it, is the same
    // lie the reversing case refuses to tell. Silence, and the bar back to 0 %.
    const r = drive(L3_RING, turnAwayAtTheLine, ring.x, ring.y, (_p, d) =>
      d < ring.enterRadiusM + 12 ? "right" : "off",
    );
    expect(r.evalState).toMatchObject({
      type: "roundabout",
      entered: false,
      exitSignaled: false,
      voidedExits: 0,
      traversalArcDeg: 0,
    });
  });

  it("…and the refusal is not deferred by a frame: the whole 80 m of side road stays empty", () => {
    // The gear fix had to clear the latches rather than merely withhold `done`,
    // or the tick arrived one frame later. Same requirement here: the drive
    // above already runs past exitRadiusM (45 m) to ~100 m out, and `doneAtM`
    // stays null for every one of those samples.
    const last = turnAwayAtTheLine[turnAwayAtTheLine.length - 1]!;
    expect(distTo(last, ring.x, ring.y)).toBeGreaterThan(ring.exitRadiusM * 2);
  });

  it("…because the turn sweeps 18° of island where a passage sweeps 87°", () => {
    // The number the refusal actually turns on, stated so that a future edit
    // moving the threshold can see what it is walking into. 18° is what THIS
    // ring gives, because „Баку" comes in tangentially and the give-way line is
    // already most of the way round the entry curve; the most adversarial
    // turn-away shapes measured on the four shipped rings — a car that hugs the
    // give-way circle through the whole 90° of its turn — reach 34–46°, which
    // is why the threshold is 45 and not 25.
    const arc = Math.abs(netArcInside(turnAwayAtTheLine, ring.x, ring.y, ring.enterRadiusM));
    expect(arc).toBeGreaterThan(10);
    expect(arc).toBeLessThan(ROUNDABOUT_MIN_TRAVERSAL_ARC_DEG / 2);
  });
});

// ---------------------------------------------------------------------------
// rb-mini — sc-roundabout-entry's own map, the drill the founder drove
// ---------------------------------------------------------------------------

describe("rb-mini — the drill's own ring (enter 24 / exit 34)", () => {
  const ring = ringOf(SC_RING);
  /** The shipped approach lane on rb-mini (spawnPoints[0].x, and b15's LANE_X). */
  const LANE_X = 4.06;
  const RING_R = 18;

  /** In at the south mouth, round to the east mouth, out — the first exit, the
   *  shortest passage a four-arm ring allows, driven in the shipped lane. */
  const firstExit = resample(
    [
      ...Array.from({ length: 120 }, (_, i): Pt => [LANE_X, -(RING_R + 30) + i * 0.25]),
      ...Array.from({ length: 105 }, (_, i): Pt => {
        const a = ((i - 5) * Math.PI) / 180;
        return [RING_R * Math.sin(a), -RING_R * Math.cos(a)];
      }),
      ...Array.from({ length: 120 }, (_, i): Pt => [RING_R + i * 0.25, -LANE_X]),
    ],
    0.3,
  );

  it("CREDIT: the first exit, signalled on the ring, completes — this is the drill passing", () => {
    const r = drive(SC_RING, firstExit, ring.x, ring.y, (p, d) => {
      const az = (azAbout(p, ring.x, ring.y) + 360) % 360;
      // Signalled from halfway round, and the exit turn kills it at d ≈ 21 m,
      // inside enterRadiusM — the auto-cancel that B21-RB exists for.
      return d <= ring.enterRadiusM && az >= 45 && az <= 70 ? "right" : "off";
    });
    expect(r.done).toBe(true);
  });

  it("…the passage measures 70° of island — the least any shipped geometry gives", () => {
    const arc = Math.abs(netArcInside(firstExit, ring.x, ring.y, ring.enterRadiusM));
    expect(arc).toBeGreaterThan(65);
    expect(arc).toBeGreaterThan(ROUNDABOUT_MIN_TRAVERSAL_ARC_DEG * 1.4);
  });

  it("REFUSAL: up to the give-way line at d = 23, right stalk, right turn away — no tick", () => {
    const pts: Pt[] = [];
    for (let y = -(ring.enterRadiusM + 30); y <= -23; y += 0.3) pts.push([LANE_X, y]);
    // The right-hander onto the side road and 60 m away, never coming closer to
    // the island than the junction did.
    const start = pts[pts.length - 1]!;
    for (let k = 1; k <= 90; k++) {
      const a = (k * Math.PI) / 180;
      const p: Pt = [start[0] + 8 * Math.sin(a), start[1] + 8 * (1 - Math.cos(a))];
      const d = Math.hypot(p[0], p[1]);
      pts.push(d < 23 ? [(p[0] * 23) / d, (p[1] * 23) / d] : p);
    }
    const tail = pts[pts.length - 1]!;
    for (let s = 0.3; s <= 60; s += 0.3) pts.push([tail[0] + s, tail[1]]);

    const r = drive(SC_RING, pts, ring.x, ring.y, () => "right");
    expect(r.done).toBe(false);
    expect(r.evalState).toMatchObject({ type: "roundabout", entered: false, voidedExits: 0 });
  });
});

// ---------------------------------------------------------------------------
// The exemption — objectives are SEQUENTIAL, so this one is usually handed a
// car that is already on the ring
// ---------------------------------------------------------------------------

describe("a passage is demanded only of a car this objective watched arrive", () => {
  it("sc-rb-ped-exit's shape: the evaluator starts in the pocket, past the ring — and still credits the exit", () => {
    // The shipped case, and the reason this exemption exists rather than being
    // a kindness. sc-rb-ped-exit orders its rungs past-east → pocket → exit, and
    // engine.ts steps only the current objective, so the roundabout evaluator's
    // FIRST frame is the car stopped in the pocket at r ≈ 27.3 against an
    // enterRadiusM of 29 — 164° of island already behind it, none of it seen.
    // Demanding arc there refuses the template's own authored shadow drive.
    const pocketRing = parseObjectiveParams({
      id: "t",
      titleBg: "T",
      kind: "completeManeuver",
      params: { maneuver: "roundabout", x: 0, y: 0, enterRadiusM: 29, exitRadiusM: 34 },
    });
    const pts: Pt[] = [];
    for (let y = 27; y <= 40; y += 0.3) pts.push([4.06, y]); // pocket → out the north arm
    const r = drive(pocketRing, pts, 0, 0, () => "right");
    expect(r.done).toBe(true);
    expect(pts[0]![1]).toBeLessThan(29); // …and it really did start inside
  });

  it("…but the exemption belongs to the ATTEMPT, not to the objective — the next one is measured", () => {
    // The pardon has to expire, or one exempt attempt would licence every
    // later one. Here the first exit is taken silently from the pocket: that
    // attempt is unmeasurable, so it is not refused for want of arc — it VOIDS
    // for want of a signal, which is the honest verdict. The student then comes
    // back, dips into the circle from the north arm and leaves again with the
    // stalk lit — and THAT attempt was watched from outside, has no passage in
    // it, and earns nothing.
    const pocketRing = parseObjectiveParams({
      id: "t",
      titleBg: "T",
      kind: "completeManeuver",
      params: { maneuver: "roundabout", x: 0, y: 0, enterRadiusM: 29, exitRadiusM: 34 },
    });
    const pts: Pt[] = [];
    for (let y = 27; y <= 40; y += 0.3) pts.push([4.06, y]); // out of the pocket, silent
    for (let y = 40; y >= 28; y -= 0.3) pts.push([4.06, y]); // back in for another go
    for (let y = 28; y <= 40; y += 0.3) pts.push([4.06, y]); // …and straight out again
    let ticksIn = 0;
    const r = drive(pocketRing, pts, 0, 0, (_p, d) => {
      ticksIn += d <= 29 ? 1 : 0;
      return ticksIn > 60 ? "right" : "off"; // silent first exit, signalled second
    });
    expect(r.done).toBe(false);
    expect(r.evalState).toMatchObject({ type: "roundabout", voidedExits: 1, entered: false });
  });

  it("and on the lesson where the false pass was found, the gate IS armed: L3 hands it the ring from 60 m out", () => {
    // The exemption would matter for the refuted drive only if the objective
    // began evaluating without ever seeing the car out of the roundabout. It
    // does not: l3-pass is preceded by l3-approach, a 60 m zone centred on the
    // same island, and a car coming from the district satisfies it at its outer
    // edge — 60 m, well past exitRadiusM 45 — so the ring objective goes active
    // watching every metre of the approach the false pass is made of.
    const l3 = LESSONS.find((l) => l.objectives.some((o) => o.id === "l3-pass"))!;
    const ids = l3.objectives.map((o) => o.id);
    const before = parseObjectiveParams(l3.objectives[ids.indexOf("l3-pass") - 1]!);
    expect(before.kind).toBe("reachZone");
    if (before.kind !== "reachZone") return;
    const l3ring = ringOf(L3_RING);
    expect(Math.hypot(before.x - l3ring.x, before.y - l3ring.y) + before.radiusM).toBeGreaterThan(
      l3ring.exitRadiusM,
    );
  });

  it("the census: every shipped roundabout rung either watches the approach, or has an earlier ON-RING gate", () => {
    // The exemption is only safe if, wherever it fires, something else has
    // already proved the passage. Every shipped roundabout rung is therefore
    // one of two shapes:
    //   ARMED  — the objective before it can only be satisfied out beyond
    //     exitRadiusM, so the evaluator watches the whole approach and the arc
    //     gate is live (sc-roundabout-entry's give-way zone, L3's 60 m
    //     approach — the lesson the false pass was found on);
    //   GATED  — the objective is handed a car already at the ring, the arc
    //     gate stands down, and an EARLIER rung is a zone lying wholly inside
    //     the entry circle, i.e. on the ring, which is the traversal's proof
    //     (sc-rb-ped-exit's east mouth at (18, 0) before its pocket; the three
    //     „past the spokes" zones of the sibling drills).
    // A template with NEITHER would fail here, which is the point: that is the
    // shape where nothing at all proves the student went round.
    const rungs: { id: string; objectives: readonly { id: string }[] }[] = [];
    for (const t of SCENARIO_TEMPLATES) {
      for (const level of [3] as const) {
        if (!t.levels.some((l) => l.level === level)) continue;
        const compiled = compileScenario(t, level);
        if (
          compiled.objectives.some((o) => {
            const p = parseObjectiveParams(o);
            return p.kind === "completeManeuver" && p.maneuver === "roundabout";
          })
        ) {
          rungs.push({ id: compiled.id, objectives: compiled.objectives });
        }
      }
    }
    for (const lesson of LESSONS) rungs.push({ id: lesson.id, objectives: lesson.objectives });
    let seen = 0;
    for (const rung of rungs) {
      const specs = rung.objectives as readonly Parameters<typeof parseObjectiveParams>[0][];
      specs.forEach((o, i) => {
        const p = parseObjectiveParams(o);
        if (p.kind !== "completeManeuver" || p.maneuver !== "roundabout") return;
        seen += 1;
        expect(i, `${rung.id}/${o.id} has nothing before it`).toBeGreaterThan(0);
        const before = parseObjectiveParams(specs[i - 1]!);
        expect(before.kind, `${rung.id}/${o.id}`).toBe("reachZone");
        if (before.kind !== "reachZone") return;
        // ARMED: a car arriving from the district satisfies the preceding zone
        // at its OUTER edge, so the gate arms if that edge is past exitRadiusM.
        const armed =
          Math.hypot(before.x - p.x, before.y - p.y) + before.radiusM > p.exitRadiusM;
        // GATED: some earlier rung is a zone that lies wholly on the ring.
        const gated = specs.slice(0, i).some((earlier) => {
          const e = parseObjectiveParams(earlier);
          return (
            e.kind === "reachZone" &&
            Math.hypot(e.x - p.x, e.y - p.y) + e.radiusM <= p.enterRadiusM
          );
        });
        expect(armed || gated, `${rung.id}/${o.id}: neither armed nor ring-gated`).toBe(true);
      });
    }
    expect(seen).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// The threshold itself
// ---------------------------------------------------------------------------

describe("ROUNDABOUT_MIN_TRAVERSAL_ARC_DEG sits between the two measured populations", () => {
  it("under every legitimate first-exit passage, and over the turn-away", () => {
    // Measured on the shipped rings, sampled at 0.2–0.3 m (see the constant's
    // own header for the full table):
    //   legitimate first exits   70.5 – 99.1°   ← must all be credited
    //   turn-away at the line    33.8 – 45.7°   ← must not be
    // The gap is not symmetric on purpose. Refusing a correct drive is the
    // failure the founder ranks worst, so the threshold is parked near the
    // bottom of the window rather than in the middle of it.
    expect(ROUNDABOUT_MIN_TRAVERSAL_ARC_DEG).toBeLessThan(59);
    expect(ROUNDABOUT_MIN_TRAVERSAL_ARC_DEG).toBeGreaterThan(33);
  });

  it("and the 59° ceiling is not arbitrary — it is the kerb-hugging legitimate passage", () => {
    // A student who hugs the right kerb of rb-mini's 2-lane arm (offset ≈ 6.5 m
    // instead of the lane's 4.06) crosses the entry circle 15.4° short of each
    // mouth radial, so his perfectly correct first exit sweeps only
    // 90 − 2 × 15.4 ≈ 59°. That drive must keep its tick, which is what caps
    // the threshold from above.
    const crossingOffsetDeg = (Math.atan2(6.5, Math.sqrt(24 * 24 - 6.5 * 6.5)) * 180) / Math.PI;
    expect(90 - 2 * crossingOffsetDeg).toBeGreaterThan(ROUNDABOUT_MIN_TRAVERSAL_ARC_DEG);
  });
});
