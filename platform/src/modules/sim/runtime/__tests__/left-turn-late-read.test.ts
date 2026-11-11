/**
 * THE LATE READ — lane slowturn2 (sc-turn-left-oncoming:1613ef2c; integrator rulings ST-LATE, ST-LATE-READ,
 * ST-LATE-END (d), ST-RESPAWN-SCOPE and ST-CHAIN, 2026-11-09; runtime/worldRuntime.ts LEFT_TURN_FORCED_SHED_MPS,
 * runtime/leftTurnGiveWay.ts «THE LATE READ»).
 *
 * At base, ruling R13''' (3) was read on the ADDED commit's own tick only, so braking a car's OWN account took for
 * him AFTER the commit, while his body still lay on its route ahead of it, billed nothing (rig w4b S12: car 1001
 * shed 0.61 / 2.33 m/s for him after the commit, both drives passed with 0 points). Now an added commit that is not
 * adjudicated on its tick opens a window on the vehicles that meet (1), (2) and (4) ON THE COMMIT TICK with his body
 * on their route ahead; on each later grid point the first of them whose in-way account reaches
 * LEFT_TURN_FORCED_SHED_MPS is billed, once. Each cell below holds one clause of that, on the reference junction
 * left-turn-forced-braking.test.ts uses (same scripted probe, rows and planned-route query).
 *
 * THE GEOMETRY (measured on this harness, tmp probe, then pinned by the precondition cell): the slow sweep's ADDED
 * commit lands on frame 129 (heading ≈ 125°); his body lies on the oncoming line x = J.x + 3 from frame 38 to 191.
 */
import { describe, expect, it } from "vitest";
import { createWorldRuntime, type OncomingConflict } from "..";
import { LEFT_TURN_FORCED_SHED_MPS, LEFT_TURN_ONCOMING_RADIUS_M } from "../worldRuntime";
import { LeftTurnGiveWayEvidence, type PlannedRouteRow } from "../leftTurnGiveWay";
import { loadDistrict, mkVehicle, type PathPose } from "./helpers";
import type { SimTick } from "../../rules/types";
import type { ShedAccountRow } from "../reverseBrakedFor";

const J = { x: 448.94, y: -250.42 };
const APPROACH_DEG = 178;
const DT = 0.05;

function approach(n: number, fromM = 26, toM = 8): PathPose[] {
  const poses: PathPose[] = [];
  for (let i = 0; i < n; i++) {
    const d = fromM + ((toM - fromM) * i) / Math.max(1, n - 1);
    poses.push({ x: J.x, y: J.y + d, headingDeg: APPROACH_DEG });
  }
  return poses;
}
/** A sweep about J on a 6 m circle from heading 178° to `endDeg` over `n` frames, then `hold` frames straight on along `endDeg`. */
function leftSweep(n: number, hold = 0, endDeg = 88): PathPose[] {
  const poses: PathPose[] = [];
  for (let i = 0; i < n; i++) {
    const heading = APPROACH_DEG + ((endDeg - APPROACH_DEG) * i) / (n - 1);
    const rad = (heading * Math.PI) / 180;
    poses.push({ x: J.x + 6 * Math.sin(rad), y: J.y + 6 * Math.cos(rad), headingDeg: heading });
  }
  const last = poses[poses.length - 1];
  const r = (endDeg * Math.PI) / 180;
  for (let i = 1; i <= hold; i++) poses.push({ x: last.x + 0.15 * i * Math.sin(r), y: last.y + 0.15 * i * Math.cos(r), headingDeg: endDeg });
  return poses;
}

interface Plan {
  movement: PlannedRouteRow["movement"];
  arriveDeg: number;
  /** Its centre-line AFTER its present centre, as (dx, dy) about J. */
  pts: Array<[number, number]>;
  jr?: number;
}
interface Row {
  id: number;
  dx?: number | ((f: number) => number);
  dy: number | ((f: number) => number);
  headingDeg: number | ((f: number) => number);
  mps: number | ((f: number) => number);
  shed: (f: number) => number;
  plan?: (f: number) => Plan | null;
}
const at = <T,>(v: T | ((f: number) => T), f: number): T => (typeof v === "function" ? (v as (f: number) => T)(f) : v);
const STRAIGHT_NORTH = (dx: number): Plan => ({ movement: "straight", arriveDeg: 0, pts: [[dx, 36]] });

interface Cell {
  ticks: SimTick[];
  /** Per frame: the late windows open after that frame's sample. */
  open: number[][];
  rt: ReturnType<typeof createWorldRuntime>;
}
function runCell(
  poses: PathPose[],
  speedKmh: number,
  rowsIn: Row[],
  opts: { probe?: (f: number) => OncomingConflict; respawnAt?: number; poseAt?: (f: number, p: PathPose) => PathPose } = {},
): Cell {
  const rt = createWorldRuntime(loadDistrict());
  let frame = 0;
  rt.setOncomingQuery(() => (opts.probe ? opts.probe(frame) : { distM: 15, closingMps: 5 }));
  const rows: ShedAccountRow[] = rowsIn.map((r) => ({ id: r.id, kind: "vehicle", x: J.x, y: J.y, playerShedMps: 0, speedMps: 0, dirX: 0, dirY: 1 }));
  rt.setPlayerShedAccountsQuery(() => {
    rowsIn.forEach((r, i) => {
      const h = (at(r.headingDeg, frame) * Math.PI) / 180;
      Object.assign(rows[i], { x: J.x + at(r.dx ?? 0, frame), y: J.y + at(r.dy, frame), dirX: Math.sin(h), dirY: Math.cos(h), speedMps: at(r.mps, frame), playerShedMps: r.shed(frame) });
    });
    return rows;
  });
  const px: number[] = [];
  const py: number[] = [];
  const out: PlannedRouteRow = { id: 0, movement: "straight", approachDirX: 0, approachDirY: 0, halfWidthM: 0.92, px, py, n: 0, junctionRadiusM: 10 };
  rt.setPlannedRouteQuery((id, _nodeId, reachM) => {
    const i = rowsIn.findIndex((r) => r.id === id);
    if (i < 0) return null;
    const r = rowsIn[i];
    const p = r.plan ? r.plan(frame) : STRAIGHT_NORTH(at(r.dx ?? 0, frame));
    if (p === null) return null;
    expect(reachM).toBe(LEFT_TURN_ONCOMING_RADIUS_M);
    const a = (p.arriveDeg * Math.PI) / 180;
    out.id = id;
    out.movement = p.movement;
    out.approachDirX = Math.sin(a);
    out.approachDirY = Math.cos(a);
    out.junctionRadiusM = p.jr ?? 10;
    px[0] = rows[i].x;
    py[0] = rows[i].y;
    out.n = 1;
    for (const [dx, dy] of p.pts) {
      px[out.n] = J.x + dx;
      py[out.n] = J.y + dy;
      out.n++;
    }
    return out;
  });
  // the tracker instance, for the window diagnostic only (never read by a rule)
  let inst: LeftTurnGiveWayEvidence | null = null;
  const proto = LeftTurnGiveWayEvidence.prototype as unknown as { track: (...a: unknown[]) => void };
  const orig = proto.track;
  proto.track = function (this: LeftTurnGiveWayEvidence, ...a: unknown[]) {
    inst = this;
    return orig.apply(this, a);
  };
  const ticks: SimTick[] = [];
  const open: number[][] = [];
  let t = 0;
  try {
    for (const pose0 of poses) {
      const pose = opts.poseAt ? opts.poseAt(frame, pose0) : pose0;
      if (opts.respawnAt === frame) rt.noteRespawn?.(); // optional: the base runtime has none (red-on-base recording)
      t += DT;
      rt.update(DT);
      ticks.push(rt.sample(mkVehicle(pose, { speedKmh }), t, false));
      open.push((inst as LeftTurnGiveWayEvidence | null)?.lateOpenIds?.() ?? []);
      frame++;
    }
  } finally {
    proto.track = orig;
  }
  return { ticks, open, rt };
}

const APPROACH = 24;
const SLOW = [...approach(APPROACH), ...leftSweep(180, 60)];
const FAST = [...approach(APPROACH), ...leftSweep(30, 30)];
const COMMIT = 129;
const prio = (ticks: SimTick[]) =>
  ticks.flatMap((tk, k) => tk.events.filter((e) => e.kind === "prioritySituation").map((e) => ({ k, ...(e as object) })));
const BILL = (k: number, id: number) => ({ k, kind: "prioritySituation", situation: "left-turn-oncoming", violated: true, addedPath: true, forcedById: id });
/** Flat until frame `from`, then +`step` per frame up to `cap`. */
const ramp = (from: number, step: number, cap = 2) => (f: number) => Math.min(cap, Math.max(0, f - from) * step);
/** One jump of `size` on frame `from`. */
const jump = (from: number, size: number) => (f: number) => (f >= from ? size : 0);
const ONCOMING: Omit<Row, "shed"> = { id: 7, dx: 3, dy: -15, headingDeg: 0, mps: 5 };

describe("the late read: preconditions on the reference junction", () => {
  it(`the slow sweep is ONE added left commit on frame ${COMMIT}, the oncoming car's window opens there, and nothing is billed while its account stays 0`, () => {
    const c = runCell(SLOW, 10, [{ ...ONCOMING, shed: () => 0 }]);
    const turns = c.ticks.flatMap((tk, k) => tk.events.filter((e) => e.kind === "turnStarted").map((e) => ({ k, ...(e as object) })));
    expect(turns).toEqual([{ k: COMMIT, kind: "turnStarted", direction: "left", addedPath: true }]);
    expect(c.open[COMMIT - 1]).toEqual([]);
    expect(c.open[COMMIT]).toEqual([7]);
    expect(prio(c.ticks)).toEqual([]);
    // it closes when his body leaves its route (frame 192: off the line x = J.x + 3), never re-opening
    expect(c.open[191]).toEqual([7]);
    expect(c.open[192]).toEqual([]);
    expect(c.open.slice(192).every((o) => o.length === 0)).toBe(true);
  });
});

describe("T-LATE-1 — the account is 0 at the added commit and grows ≥ the line after it, while he is on the car's route", () => {
  it("exactly ONE prioritySituation {left-turn-oncoming, violated, addedPath, forcedById}, on the line tick, none at the commit", () => {
    // 0 through frame 135, then +0.1 per frame: 0.1 / 0.2 / 0.30… on frames 136 / 137 / 138
    const c = runCell(SLOW, 10, [{ ...ONCOMING, shed: ramp(135, 0.1) }]);
    expect(prio(c.ticks)).toEqual([BILL(138, 7)]);
    expect(c.open[138]).toEqual([]); // every window closes with the bill
  });
});

describe("T-LATE-2 — a window that closed never re-opens", () => {
  it("(i) RE-ENTRY: he leaves its route after the commit (the car and its line shift 17 m east for frames 140–145), comes back onto it, and its account then grows ≥ the line — no bill", () => {
    const dx = (f: number) => (f >= 140 && f <= 145 ? 20 : 3);
    const c = runCell(SLOW, 10, [{ ...ONCOMING, dx, shed: ramp(150, 0.1) }]);
    expect(c.open[139]).toEqual([7]);
    expect(c.open[140]).toEqual([]);
    expect(c.open[150]).toEqual([]);
    expect(prio(c.ticks)).toEqual([]);
  });
  it("(i) …the twin with no excursion bills the same growth (so the cell above is about the close)", () => {
    expect(prio(runCell(SLOW, 10, [{ ...ONCOMING, shed: ramp(150, 0.1) }]).ticks)).toEqual([BILL(153, 7)]);
  });
  it("(ii) VISIT RESET: a window open at the node; he is lifted out of every junction area for frames 140–142 (the visit resets); the same car's account grows ≥ the line on the next visit, with no commit there — no bill", () => {
    const away = { x: J.x + 30, y: J.y - 60, headingDeg: 125 };
    const c = runCell(SLOW, 10, [{ ...ONCOMING, shed: ramp(150, 0.1) }], { poseAt: (f, p) => (f >= 140 && f <= 142 ? away : p) });
    expect(c.open[139]).toEqual([7]);
    expect(c.open[143]).toEqual([]);
    expect(c.ticks.slice(COMMIT + 1).some((tk) => tk.events.some((e) => e.kind === "turnStarted"))).toBe(false);
    expect(prio(c.ticks)).toEqual([]);
  });
  it("(documentary) THE CAR PASSED HIM: its route starts at its own position, so once it is past his body he is off its route ahead and the window closes (subsumed by the on-route close — F17)", () => {
    // it rolls north past his body from frame 140 (dy −15 → +10 over 20 frames) while its account grows
    const dy = (f: number) => (f < 140 ? -15 : Math.min(10, -15 + (f - 140) * 1.25));
    const c = runCell(SLOW, 10, [{ ...ONCOMING, dy, shed: ramp(160, 0.1) }]);
    expect(prio(c.ticks)).toEqual([]);
  });
});

describe("T-LATE-3 — the line is LEFT_TURN_FORCED_SHED_MPS, read with ≥", () => {
  it(`0.29 m/s in one step after the commit bills nothing; exactly ${LEFT_TURN_FORCED_SHED_MPS} (one growth step of 0.30) bills`, () => {
    expect(LEFT_TURN_FORCED_SHED_MPS).toBe(0.3);
    expect(prio(runCell(SLOW, 10, [{ ...ONCOMING, shed: jump(140, 0.29) }]).ticks)).toEqual([]);
    expect(prio(runCell(SLOW, 10, [{ ...ONCOMING, shed: jump(140, 0.3) }]).ticks)).toEqual([BILL(140, 7)]);
  });
});

describe("T-LATE-4 — the FIRST candidate to cross the line is billed, once", () => {
  const A: Omit<Row, "shed"> = { id: 7, dx: 3, dy: -15, headingDeg: 0, mps: 5 };
  const B: Omit<Row, "shed"> = { id: 8, dx: 2.6, dy: -22, headingDeg: 0, mps: 5 };
  it("two candidates crossing on different ticks, the second in row order crossing first: that car is billed, once", () => {
    const c = runCell(SLOW, 10, [
      { ...A, shed: jump(150, 0.5) },
      { ...B, shed: jump(140, 0.5) },
    ]);
    expect(c.open[COMMIT]).toEqual([7, 8]);
    expect(prio(c.ticks)).toEqual([BILL(140, 8)]);
  });
  it("…on the same grid point, row order breaks the tie", () => {
    expect(prio(runCell(SLOW, 10, [{ ...A, shed: jump(140, 0.5) }, { ...B, shed: jump(140, 0.5) }]).ticks)).toEqual([BILL(140, 7)]);
  });
});

describe("T-LATE-5 — the candidate set is frozen at the commit (ST-LATE-READ)", () => {
  it("a car beyond LEFT_TURN_ONCOMING_RADIUS_M at the commit that later comes inside the reach, its account growing while he is on its route, is NEVER billed", () => {
    const dy = (f: number) => (f <= COMMIT + 2 ? -(LEFT_TURN_ONCOMING_RADIUS_M + 6) : -15);
    const c = runCell(SLOW, 10, [{ ...ONCOMING, dy, shed: ramp(140, 0.1) }]);
    expect(c.open[COMMIT]).toEqual([]);
    expect(prio(c.ticks)).toEqual([]);
  });
  it("…the twin inside the reach at the commit is billed", () => {
    expect(prio(runCell(SLOW, 10, [{ ...ONCOMING, shed: ramp(140, 0.1) }]).ticks)).toEqual([BILL(143, 7)]);
  });
  it("a car failing (1) at the commit — an oncoming LEFT-turner — bills nothing, whatever its account does after", () => {
    const left = (): Plan => ({ movement: "left", arriveDeg: 0, pts: [[3, -3], [-40, -3]] });
    expect(prio(runCell(SLOW, 10, [{ ...ONCOMING, plan: left, shed: ramp(140, 0.1) }]).ticks)).toEqual([]);
  });
  it("a DEPARTING car at the commit (radial closing < 0, R13'') is never a candidate, whatever its account does after", () => {
    const c = runCell(SLOW, 10, [{ ...ONCOMING, headingDeg: 180, shed: ramp(140, 0.1) }]);
    expect(c.open[COMMIT]).toEqual([]);
    expect(prio(c.ticks)).toEqual([]);
  });
  // Round-2 verifier F4: the two ruled clauses of the frozen set that no cell pinned (mutants V1 and V9 survived,
  // each near-equivalent because the on-route close fires on the next grid point — so each cell puts him back on the
  // car's route on the point AFTER the commit, where only the frozen set can refuse the bill).
  it("HIS BODY ON ITS ROUTE AT THE COMMIT: on its route before (so (2) met holds) and after, but OFF it on the commit point itself (the car and its line 17 m east for that one frame) — no window, no bill, though its account then grows ≥ the line while he is on its route", () => {
    const dx = (f: number) => (f === COMMIT ? 20 : 3);
    const c = runCell(SLOW, 10, [{ ...ONCOMING, dx, shed: ramp(135, 0.1) }]);
    expect(prio(c.ticks)).toEqual([]); // the sheet first: the clause changes the bill, not only the diagnostic
    expect(c.open[COMMIT - 1]).toEqual([]);
    expect(c.open[COMMIT]).toEqual([]);
    expect(c.open[COMMIT + 1]).toEqual([]);
    // the twin with his body on its route at the commit is T-LATE-1: the same growth bills on frame 138
    expect(prio(runCell(SLOW, 10, [{ ...ONCOMING, shed: ramp(135, 0.1) }]).ticks)).toEqual([BILL(138, 7)]);
  });
  it("(2) MET AT THE COMMIT: his body lies on the car's route ahead of it, but never on its part ACROSS the junction (that part begins 2 m from the node, and the line runs 3 m from it) — no window, no bill, whatever its account does", () => {
    const shallow = (): Plan => ({ movement: "straight", arriveDeg: 0, pts: [[3, 36]], jr: 2 });
    const c = runCell(SLOW, 10, [{ ...ONCOMING, plan: shallow, shed: ramp(135, 0.1) }]);
    expect(prio(c.ticks)).toEqual([]); // the sheet first
    expect(c.open[COMMIT]).toEqual([]);
    // the twin whose across part he does meet (the default 10 m open radius) is billed on frame 138
    const met = (): Plan => ({ movement: "straight", arriveDeg: 0, pts: [[3, 36]], jr: 10 });
    expect(prio(runCell(SLOW, 10, [{ ...ONCOMING, plan: met, shed: ramp(135, 0.1) }]).ticks)).toEqual([BILL(138, 7)]);
  });
});

describe("T-LATE-6 — ST-CHAIN: only the car's own attributed account counts", () => {
  it("a raw speed fall (5 → 1 m/s after the commit) with an account of 0 bills nothing", () => {
    const mps = (f: number) => (f < 135 ? 5 : Math.max(1, 5 - (f - 135) * 0.2));
    expect(prio(runCell(SLOW, 10, [{ ...ONCOMING, mps, shed: () => 0 }]).ticks)).toEqual([]);
  });
});

describe("T-LATE-7 — a BASE commit opens no window", () => {
  it("a base (3 s window) left commit with the oncoming car's account growing after it bills nothing", () => {
    const c = runCell(FAST, 30, [{ ...ONCOMING, shed: ramp(APPROACH + 40, 0.1) }]);
    const turns = c.ticks.flatMap((tk) => tk.events.filter((e) => e.kind === "turnStarted"));
    expect(turns).toEqual([{ kind: "turnStarted", direction: "left" }]);
    expect(c.open.every((o) => o.length === 0)).toBe(true);
    expect(prio(c.ticks)).toEqual([]);
  });
});

describe("T-LATE-8 — a commit-tick R13''' bill stands, and the late read adds nothing after it", () => {
  it("braked ≥ the line for him BEFORE the commit: billed on the commit tick, once; growth after it bills nothing more", () => {
    const c = runCell(SLOW, 10, [{ ...ONCOMING, shed: ramp(APPROACH + 40, 0.1, 4) }]);
    expect(prio(c.ticks)).toEqual([BILL(COMMIT, 7)]);
    expect(c.open.every((o) => o.length === 0)).toBe(true);
  });
});

describe("T-LATE-9 — ST-LATE-END (d): the window closes once his turn is complete", () => {
  // He finishes the sweep on the heading of the exit edge that leaves J east-north-east (e519275131.0, 74°), on its
  // line, and drives on along it. The car is an oncoming RIGHT-turner whose route runs down that same exit arm, so his
  // body stays on its route as he drives away — only the turn-end close can end its window.
  const EXIT = [...approach(APPROACH), ...leftSweep(180, 200, 74)];
  const right = (): Plan => ({ movement: "right", arriveDeg: 0, pts: [[3, -3], [5.77, 1.65], [5.77 + 40 * 0.9613, 1.65 + 40 * 0.2756]] });
  const turnEnd = (c: Cell) => c.open.findIndex((o, k) => k > COMMIT && o.length === 0);
  it("the window is open after the commit while he is still turning, and closes on a grid point on which his body is still on its route", () => {
    const c = runCell(EXIT, 10, [{ ...ONCOMING, plan: right, shed: () => 0 }]);
    expect(c.open[COMMIT]).toEqual([7]);
    const k = turnEnd(c);
    expect(k).toBeGreaterThan(COMMIT);
    expect(k).toBeLessThan(EXIT.length - 1);
  });
  it("a right-turner whose account grows for him only AFTER his turn is complete — following him down the exit arm — bills nothing", () => {
    const k = turnEnd(runCell(EXIT, 10, [{ ...ONCOMING, plan: right, shed: () => 0 }]));
    const c = runCell(EXIT, 10, [{ ...ONCOMING, plan: right, shed: ramp(k + 2, 0.1) }]);
    expect(prio(c.ticks)).toEqual([]);
  });
  it("…the same growth BEFORE the turn is complete is billed (the twin)", () => {
    const k = turnEnd(runCell(EXIT, 10, [{ ...ONCOMING, plan: right, shed: () => 0 }]));
    const c = runCell(EXIT, 10, [{ ...ONCOMING, plan: right, shed: jump(k - 5, 0.5) }]);
    expect(prio(c.ticks)).toEqual([BILL(k - 5, 7)]);
  });
});

describe("T-LATE-10 — a later turn in the same visit closes the window: one prioritySituation per visit, never a praise and a bill", () => {
  // The slow sweep (added commit, window open), a 2 s straight hold (the base window drains below
  // TURN_REARM_DEG and re-arms), then a brisk 90° swing left — a BASE left commit in the same visit.
  // The hold runs on 100° — 26° off the exit edge's 74°, so the turn-end close (d) cannot end the window before the
  // second turn — and the car is an oncoming right-turner whose route runs down that same hold line.
  const HOLD_DEG = 100;
  const hr = (HOLD_DEG * Math.PI) / 180;
  const SX = J.x + 6 * Math.sin(hr);
  const SY = J.y + 6 * Math.cos(hr);
  /** The slow sweep to HOLD_DEG, 40 frames straight on, then a brisk 90° swing (sign −1 left, +1 right). */
  const twoTurns = (sign: -1 | 1): PathPose[] => [...approach(APPROACH), ...leftSweep(180, 0, HOLD_DEG), ...((): PathPose[] => {
    const p: PathPose[] = [];
    for (let i = 1; i <= 40; i++) p.push({ x: SX + 0.15 * i * Math.sin(hr), y: SY + 0.15 * i * Math.cos(hr), headingDeg: HOLD_DEG });
    // the swing, integrated: 20 steps of 0.3 m, 4.5° each
    for (let i = 1; i <= 20; i++) {
      const prev = p[p.length - 1];
      const h = HOLD_DEG + (sign * 90 * i) / 20;
      const r = (h * Math.PI) / 180;
      p.push({ x: prev.x + 0.3 * Math.sin(r), y: prev.y + 0.3 * Math.cos(r), headingDeg: h });
    }
    for (let i = 1; i <= 40; i++) p.push({ ...p[p.length - 1] });
    return p;
  })()];
  const TWO = twoTurns(-1);
  const TWO_R = twoTurns(1);
  const right = (): Plan => ({ movement: "right", arriveDeg: 0, pts: [[3, -3], [SX - J.x, SY - J.y], [SX - J.x + 60 * Math.sin(hr), SY - J.y + 60 * Math.cos(hr)]] });
  const commits = (c: Cell) => c.ticks.flatMap((tk, k) => (tk.events.some((e) => e.kind === "turnStarted") ? [k] : []));
  const baseCommit = (c: Cell) => commits(c)[1] ?? -1;
  it("a later BASE RIGHT turn in the same visit closes the window: open on the point before it, closed on it, and the account growing ≥ the line after it bills nothing", () => {
    const c0 = runCell(TWO_R, 10, [{ ...ONCOMING, plan: right, shed: () => 0 }]);
    const [kA, k] = commits(c0);
    expect(commits(c0)).toHaveLength(2);
    expect(c0.ticks[kA].events.filter((e) => e.kind === "turnStarted")).toEqual([{ kind: "turnStarted", direction: "left", addedPath: true }]);
    expect(c0.ticks[k].events.filter((e) => e.kind === "turnStarted")).toEqual([{ kind: "turnStarted", direction: "right" }]);
    expect(c0.open[kA]).toEqual([7]);
    expect(c0.open[k - 1]).toEqual([7]);
    expect(c0.open[k]).toEqual([]);
    const c = runCell(TWO_R, 10, [{ ...ONCOMING, plan: right, shed: ramp(k + 1, 0.1) }]);
    expect(prio(c.ticks)).toEqual([]);
  });
  it("precondition for the two cells below: an added left commit (window opened), then a BASE left commit in the same visit", () => {
    const c = runCell(TWO, 10, [{ ...ONCOMING, plan: right, shed: () => 0 }]);
    const [kA, k] = commits(c);
    expect(commits(c)).toHaveLength(2);
    expect(c.ticks[kA].events.filter((e) => e.kind === "turnStarted")).toEqual([{ kind: "turnStarted", direction: "left", addedPath: true }]);
    expect(c.open[kA]).toEqual([7]);
    expect(c.ticks[k].events.filter((e) => e.kind === "turnStarted")).toEqual([{ kind: "turnStarted", direction: "left" }]);
    expect(c.open[k]).toEqual([]);
  });
  it("the base commit is convicted on a tight gap: that is the visit's one prioritySituation, and the account growing ≥ the line after it adds nothing", () => {
    const k0 = baseCommit(runCell(TWO, 10, [{ ...ONCOMING, plan: right, shed: () => 0 }]));
    const probe = (f: number): OncomingConflict => (f >= k0 - 20 ? { distM: 5, closingMps: 5 } : { distM: 15, closingMps: 5 });
    const c = runCell(TWO, 10, [{ ...ONCOMING, plan: right, shed: ramp(k0 + 2, 0.1) }], { probe });
    const p = prio(c.ticks);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ k: k0, situation: "left-turn-oncoming", violated: true });
  });
  it("the base commit earns the yield praise (5 km/h, a 3 s gap): the praise is the visit's one prioritySituation, and the account growing ≥ the line after it adds no bill", () => {
    const c0 = runCell(TWO, 5, [{ ...ONCOMING, plan: right, shed: () => 0 }]);
    const k0 = baseCommit(c0);
    expect(commits(c0)).toHaveLength(2);
    const c = runCell(TWO, 5, [{ ...ONCOMING, plan: right, shed: ramp(k0 + 2, 0.1) }]);
    const p = prio(c.ticks);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ k: k0, situation: "left-turn-oncoming", violated: false, yielded: true });
  });
});

describe("T-RESPAWN — ST-RESPAWN-SCOPE: a respawn closes the late window and clears the tracker's maps", () => {
  it("a window open, then the runtime's respawn (noteRespawn), then the account grows ≥ the line while he is on its route — no bill; the maps are empty after it", () => {
    let inst: LeftTurnGiveWayEvidence | null = null;
    const proto = LeftTurnGiveWayEvidence.prototype as unknown as { reset: () => void };
    const orig = proto.reset;
    let resetsAt140 = 0;
    const c = (() => {
      proto.reset = function (this: LeftTurnGiveWayEvidence) {
        inst = this;
        resetsAt140++;
        return orig.call(this);
      };
      try {
        return runCell(SLOW, 10, [{ ...ONCOMING, shed: ramp(141, 0.1) }], { respawnAt: 140 });
      } finally {
        proto.reset = orig;
      }
    })();
    expect(resetsAt140).toBeGreaterThanOrEqual(1);
    expect(inst).not.toBeNull();
    expect(c.open[139]).toEqual([7]);
    expect(c.open[140]).toEqual([]);
    expect(prio(c.ticks)).toEqual([]);
  });
  it("…the twin with no respawn bills the same growth", () => {
    expect(prio(runCell(SLOW, 10, [{ ...ONCOMING, shed: ramp(141, 0.1) }]).ticks)).toEqual([BILL(144, 7)]);
  });
  it("noteRespawn clears the maps the visit had (the account map survived a same-node respawn at base, STEP 0(e))", () => {
    const ev = new LeftTurnGiveWayEvidence(0.3, 1.0, 130);
    const row: PlannedRouteRow = { id: 7, movement: "straight", approachDirX: 0, approachDirY: 1, halfWidthM: 0.92, px: [3, 3], py: [-15, 36], n: 2, junctionRadiusM: 10 };
    ev.track([{ id: 7, x: 3, y: -15, speedMps: 5, playerShedMps: 0.2, dirX: 0, dirY: 1 }], (id) => (id === 7 ? row : null), "J", 0, 0, 36, { x: 3, y: -5, headingDeg: 90, halfLengthM: 2.02, halfWidthM: 0.85 });
    expect((ev as unknown as { lastShed: Map<number, number> }).lastShed.size).toBe(1);
    ev.reset();
    expect((ev as unknown as { lastShed: Map<number, number> }).lastShed.size).toBe(0);
    expect(ev.lateOpenIds()).toEqual([]);
  });
});


/**
 * ST-VERDICT-HOLD (integrator ruling 2026-11-10, round 3): what the runtime tells the instructor's voice about this
 * visit's left turn — `SimTick.leftTurnOncomingOpen` (it can still be billed: no left commit read yet, or a late
 * window open) and `SimTick.leftTurnOncomingBilled` (it was billed; latched to the visit's end). Measurement only:
 * nothing graded reads either; lessons/advisor.ts holds «Пропусна насрещните» on the first and drops it on the second.
 */
describe("ST-VERDICT-HOLD — the runtime's «this left turn can still be billed» and «…was billed»", () => {
  const openKs = (c: Cell) => c.ticks.flatMap((tk, k) => (tk.leftTurnOncomingOpen === true ? [k] : []));
  const billedKs = (c: Cell) => c.ticks.flatMap((tk, k) => (tk.leftTurnOncomingBilled === true ? [k] : []));
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  it("open from the visit's first point through the added commit and for as long as the late window stays open (its on-route close at 192), absent after; never billed", () => {
    const c = runCell(SLOW, 10, [{ ...ONCOMING, shed: () => 0 }]);
    expect(prio(c.ticks)).toEqual([]);
    expect(openKs(c)).toEqual(range(0, 191));
    expect(billedKs(c)).toEqual([]);
  });
  it("a late bill (T-LATE-1, k138): open through 137, absent from the bill on; billed from 138 to the end of the visit", () => {
    const c = runCell(SLOW, 10, [{ ...ONCOMING, shed: ramp(135, 0.1) }]);
    expect(prio(c.ticks)).toEqual([BILL(138, 7)]);
    expect(openKs(c)).toEqual(range(0, 137));
    expect(billedKs(c)).toEqual(range(138, SLOW.length - 1));
  });
  it("a commit-tick R13''' bill (T-LATE-8): open up to the commit, absent on it; billed from the commit on", () => {
    const c = runCell(SLOW, 10, [{ ...ONCOMING, shed: ramp(APPROACH + 40, 0.1, 4) }]);
    expect(prio(c.ticks)).toEqual([BILL(COMMIT, 7)]);
    expect(openKs(c)).toEqual(range(0, COMMIT - 1));
    expect(billedKs(c)).toEqual(range(COMMIT, SLOW.length - 1));
  });
  it("a BASE commit that bills nothing and opens no window (T-LATE-7): open up to the commit, absent from it on", () => {
    const c = runCell(FAST, 30, [{ ...ONCOMING, shed: ramp(APPROACH + 40, 0.1) }]);
    const k = c.ticks.findIndex((tk) => tk.events.some((e) => e.kind === "turnStarted"));
    expect(k).toBeGreaterThan(0);
    expect(prio(c.ticks)).toEqual([]);
    expect(openKs(c)).toEqual(range(0, k - 1));
    expect(billedKs(c)).toEqual([]);
  });
  it("a respawn in the visit releases it (window open at 139, noteRespawn at 140): absent from 140 on, and nothing billed", () => {
    const c = runCell(SLOW, 10, [{ ...ONCOMING, shed: ramp(141, 0.1) }], { respawnAt: 140 });
    expect(prio(c.ticks)).toEqual([]);
    expect(openKs(c)).toEqual(range(0, 139));
    expect(billedKs(c)).toEqual([]);
  });
  it("…and a respawn BEFORE the commit releases it too, for the rest of the visit (noteRespawn at 60; the commit at 129 still opens its window)", () => {
    const c = runCell(SLOW, 10, [{ ...ONCOMING, shed: () => 0 }], { respawnAt: 60 });
    expect(c.open[COMMIT]).toEqual([7]);
    expect(openKs(c)).toEqual(range(0, 59));
  });
  // Integration condition r3 C1 (integrator, 2026-11-10): the respawn's release lasts for THIS visit only. A
  // direct A→B node change (no point outside every junction area between them) is a new visit, so the release is
  // reset at its start and B's left turn can be billed again. The next node of the district to J is n348207502
  // (63.5 m away, inside JUNCTION_AREA_RADIUS_M = 40 of its own centre only), so a lift from J's area onto B's
  // centre is a direct node change.
  it("…but only for the visit: a respawn at J (60), then a DIRECT node change onto the next node n348207502 (61 on) — open again from the new visit's first point", () => {
    const B = { x: 389.21, y: -271.99, headingDeg: APPROACH_DEG };
    const c = runCell(SLOW, 10, [{ ...ONCOMING, shed: () => 0 }], { respawnAt: 60, poseAt: (f, p) => (f >= 61 ? B : p) });
    expect(c.ticks[59].leftTurnOncomingOpen).toBe(true);
    expect(c.ticks[60].leftTurnOncomingOpen).toBeUndefined();
    expect(prio(c.ticks)).toEqual([]);
    expect(openKs(c)).toEqual([...range(0, 59), ...range(61, SLOW.length - 1)]);
  });
  it("the visit reset releases it and the bill latch (lifted out of every junction area for 140–142 after a bill at 138)", () => {
    const away = { x: J.x + 30, y: J.y - 60, headingDeg: 125 };
    const c = runCell(SLOW, 10, [{ ...ONCOMING, shed: ramp(135, 0.1) }], { poseAt: (f, p) => (f >= 140 && f <= 142 ? away : p) });
    expect(prio(c.ticks)).toEqual([BILL(138, 7)]);
    expect(billedKs(c)).toEqual([138, 139]);
    expect(c.ticks[140].leftTurnOncomingOpen).toBeUndefined();
  });
});
