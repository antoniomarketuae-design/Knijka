/**
 * RING DRIVES — the path kit the roundabout family's demos are authored with
 * (catalogue-demo-curvature:dae908c7, family curvring).
 *
 * WHY IT EXISTS. The recorder is kinematic: the ghost stands on the authored
 * point, headed along the polyline's tangent. Until 2026-10-11 the six
 * roundabout lessons typed their paths in as a handful of waypoints — the ring
 * as a polygon of 10° chords, the entry and the exit as three or four corners.
 * Every corner was a pivot on the spot (23°–60° in one frame: 1.1–2.5 m of
 * «radius» over a metre of travel, against a car whose tightest body-centre
 * circle is 3.955 m), and wherever two drive steps met «one stride apart» the
 * ghost simply skipped 1.5–3.2 m of ring between two frames. A student copying
 * that drive was shown a line no car can follow, and an instrument cut from it
 * inherited a target it could not track.
 *
 * WHAT IT IS — the sc-park-bay-exit-rev recipe (traces/scParkBayExitRev.ts,
 * 8579f1d), shaped for a ring. A path is ONE continuous line from the spawn to
 * the last metre, built from three kinds of stretch only:
 *
 *   · a STRAIGHT;
 *   · a CURVATURE PROGRAMME — the body-centre path's curvature ramps linearly
 *     from k0 to k1 over a length (a wheel turned, never snapped), integrated
 *     at RING_PATH_DS_M;
 *   · the RING itself — the exact circle, or a lane change on it: the radius
 *     eased from one circle to another over an arc with a quintic smoothstep,
 *     whose first and second derivatives vanish at both ends, so the heading
 *     AND the curvature run on unbroken into the circles either side.
 *
 * Two closed-form constructions join an arm to a ring and a ring to an arm
 * (`ringEntryProgramme`, `ringExitProgramme`): the author names the turn's
 * radius, its ramps and the azimuth at which the car is on the circle, and the
 * straight lengths that make the pieces meet are SOLVED (they enter the end
 * point linearly), never typed. A construction that does not fit throws.
 *
 * The drive script then cuts the one path at named marks (`RingPath.between`):
 * consecutive steps share their joint vertex, so the recorder's pose runs on
 * across every change of pace; a piece that ends in a stop carries the
 * recorder's 5 cm run-out so the car rests ON the authored point.
 *
 * CONVENTIONS (the district's, and the recorder's). Heading 0 = north (+y),
 * clockwise-positive. Curvature is clockwise-positive per metre travelled:
 * k > 0 turns right. Ring azimuth φ is measured from the SOUTH point of the
 * ring, counter-clockwise through east (φ 90 = east, 180 = north, 270 = west):
 * a car circulating a ring of radius r about (0, 0) is at (r sin φ, −r cos φ),
 * headed 90° − φ, on curvature −1 / r.
 *
 * Pure and deterministic: same calls → same points.
 */

/** One stretch of a curvature programme: k ramps linearly k0 → k1 over lenM. */
export interface CurvatureStretch {
  lenM: number;
  k0: number;
  k1: number;
}

/** A body-centre pose (heading = the nose; 0 = north, clockwise-positive). */
export interface RingPose {
  x: number;
  y: number;
  headingDeg: number;
}

/**
 * Integration step, m — and the spacing of the polyline handed to the recorder
 * on every curved stretch (a straight is its two end points).
 *
 * TWO MILLIMETRES, and the reason is the ghost's front wheels. The recorder
 * estimates the wheel angle from the heading change between two 1/60 s frames,
 * and the heading it reads is the chord's. The slowest any ring demo is driven
 * through a curve is 7.5 км/ч — 35 mm a frame — so every frame crosses 17 or
 * 18 vertices and the estimate is within 6 % of the turn it shows; on 20 mm
 * chords the same frame crosses one or two and the wheel flickers by half its
 * angle. (The parking drills creep at 2.5 км/ч and need 1 mm; a ring does
 * not, and its paths are ten times as long.)
 */
export const RING_PATH_DS_M = 0.002;

/** The recorder brings a drive to rest 5 cm short of its last point
 *  (recordScriptedDrive: `while (s < path.length − 0.05)`). */
export const RECORDER_STOP_SHORT_M = 0.05;

const RAD = Math.PI / 180;
/** Snap a heading that is within a billionth of a degree of a whole degree. */
const tidyDeg = (deg: number): number => {
  const whole = Math.round(deg);
  return Math.abs(deg - whole) < 1e-9 ? whole : deg;
};
/** Unit vector of a heading — exact on the four cardinal headings, so a road
 *  that runs north stays on its x to the last bit. */
const unit = (headingDeg: number): [number, number] => {
  const h = ((tidyDeg(headingDeg) % 360) + 360) % 360;
  if (h === 0) return [0, 1];
  if (h === 90) return [1, 0];
  if (h === 180) return [0, -1];
  if (h === 270) return [-1, 0];
  return [Math.sin(h * RAD), Math.cos(h * RAD)];
};

/** The pose of a car circulating a ring of radius `r` about (0, 0) at azimuth φ. */
export function ringPose(phiDeg: number, r: number): RingPose {
  return { x: r * Math.sin(phiDeg * RAD), y: -r * Math.cos(phiDeg * RAD), headingDeg: 90 - phiDeg };
}

/**
 * Integrate a curvature programme from `start`. Midpoint curvature per step:
 * exact for a linear ramp, so a stretch turns the heading by exactly its mean
 * curvature × length. A straight stretch is returned as its end point alone.
 */
export function integrateProgramme(
  start: RingPose,
  programme: readonly CurvatureStretch[],
): { points: Array<[number, number]>; end: RingPose; lengthM: number } {
  let psi = start.headingDeg * RAD;
  let x = start.x;
  let y = start.y;
  let lengthM = 0;
  const points: Array<[number, number]> = [[x, y]];
  for (const seg of programme) {
    if (!(seg.lenM > 0)) continue;
    if (seg.k0 === 0 && seg.k1 === 0) {
      const [ux, uy] = unit(psi / RAD);
      x += seg.lenM * ux;
      y += seg.lenM * uy;
      lengthM += seg.lenM;
      points.push([x, y]);
      continue;
    }
    const steps = Math.max(1, Math.round(seg.lenM / RING_PATH_DS_M));
    const ds = seg.lenM / steps;
    for (let i = 0; i < steps; i++) {
      const k = seg.k0 + ((seg.k1 - seg.k0) * (i + 0.5)) / steps;
      // Half the step's turn before the move, half after: second-order in ds.
      psi += (k * ds) / 2;
      x += ds * Math.sin(psi);
      y += ds * Math.cos(psi);
      psi += (k * ds) / 2;
      points.push([x, y]);
    }
    lengthM += seg.lenM;
  }
  return { points, end: { x, y, headingDeg: tidyDeg(psi / RAD) }, lengthM };
}

/** A turn of exactly `turnRad` (> 0) at signed curvature `k`: ramp, hold, ramp. */
function turnStretches(turnRad: number, k: number, rampInM: number, rampOutM: number, what: string): CurvatureStretch[] {
  const ak = Math.abs(k);
  const holdM = turnRad / ak - (rampInM + rampOutM) / 2;
  if (!(holdM >= -1e-9)) {
    throw new Error(`${what}: a turn of ${(turnRad / RAD).toFixed(1)}° at radius ${(1 / ak).toFixed(2)} m is less than its own ramps turn`);
  }
  return [
    { lenM: rampInM, k0: 0, k1: k },
    { lenM: Math.max(0, holdM), k0: k, k1: k },
    { lenM: rampOutM, k0: k, k1: 0 },
  ];
}

export interface RingEntryOptions {
  /** Where the entry begins: on the arm's lane, headed along it. */
  from: RingPose;
  /** Radius of the circle the car joins, about (0, 0). */
  ringR: number;
  /** Azimuth at which the car is ON that circle, tangent to it, on its curvature. */
  landPhiDeg: number;
  /** The entry's right turn: its body-centre radius and its two ramps, m. */
  turnRadiusM: number;
  rampInM: number;
  rampOutM: number;
  /** The ramp that winds the wheel from straight onto the ring's curvature, m. */
  joinRampM: number;
}

/**
 * Arm → ring. Straight on along the arm (`leadInM`, solved), a right turn of
 * the named radius, a straight chord (`chordM`, solved), and the wheel wound
 * left onto the ring's own curvature, arriving ON the circle at `landPhiDeg`.
 *
 * The two straights are the only unknowns and the end point is linear in them
 * (each slides everything after it along its own heading), so they are the
 * solution of a 2 × 2 system — not a search. Throws when either comes out
 * negative: the named turn does not fit between this pose and that azimuth.
 */
export function ringEntryProgramme(o: RingEntryOptions): {
  stretches: CurvatureStretch[];
  leadInM: number;
  chordM: number;
  end: RingPose;
} {
  const land = ringPose(o.landPhiDeg, o.ringR);
  // The join ramp turns left by joinRampM / (2 r); the chord is headed that
  // much to the right of the ring's tangent at the landing.
  const chordHeadingDeg = land.headingDeg + o.joinRampM / (2 * o.ringR) / RAD;
  const turnRad = (chordHeadingDeg - o.from.headingDeg) * RAD;
  if (!(turnRad > 0)) throw new Error("ringEntryProgramme: the landing is not to the right of the arm");
  const turn = turnStretches(turnRad, 1 / o.turnRadiusM, o.rampInM, o.rampOutM, "ringEntryProgramme");
  const join: CurvatureStretch = { lenM: o.joinRampM, k0: 0, k1: -1 / o.ringR };
  const bare = integrateProgramme(o.from, [...turn, join]).end;
  const [ux, uy] = unit(o.from.headingDeg);
  const [vx, vy] = unit(chordHeadingDeg);
  const dx = land.x - bare.x;
  const dy = land.y - bare.y;
  const det = ux * vy - uy * vx;
  const leadInM = (dx * vy - dy * vx) / det;
  const chordM = (ux * dy - uy * dx) / det;
  if (!(leadInM >= -1e-6) || !(chordM >= -1e-6)) {
    throw new Error(
      `ringEntryProgramme: does not fit (lead-in ${leadInM.toFixed(2)} m, chord ${chordM.toFixed(2)} m) — ` +
        `radius ${o.turnRadiusM} m to φ ${o.landPhiDeg}° on r ${o.ringR}`,
    );
  }
  const stretches: CurvatureStretch[] = [
    { lenM: Math.max(0, leadInM), k0: 0, k1: 0 },
    ...turn,
    { lenM: Math.max(0, chordM), k0: 0, k1: 0 },
    join,
  ];
  return { stretches, leadInM, chordM, end: integrateProgramme(o.from, stretches).end };
}

export interface RingExitOptions {
  /** Radius of the circle the car leaves, about (0, 0). */
  ringR: number;
  /** Azimuth at which the wheel starts to come off the ring's curvature. */
  peelPhiDeg: number;
  /** Heading of the exit road, outbound (north arm 0, west arm 270, east 90). */
  exitHeadingDeg: number;
  /** The outbound lane's centre, metres to the RIGHT of the arm's axis. */
  laneOffsetM: number;
  /** The exit's right turn: its body-centre radius and its two ramps, m. */
  turnRadiusM: number;
  rampInM: number;
  rampOutM: number;
  /** The ramp that unwinds the wheel from the ring's curvature to straight, m. */
  joinRampM: number;
}

/**
 * Ring → arm. The wheel comes off the ring's curvature, a straight chord
 * (`chordM`, solved), and a right turn of the named radius that ends ON the
 * outbound lane's centre line, headed along it. Throws when the chord comes
 * out negative — peel earlier, or turn tighter.
 */
export function ringExitProgramme(o: RingExitOptions): {
  stretches: CurvatureStretch[];
  chordM: number;
  start: RingPose;
  end: RingPose;
} {
  const start = ringPose(o.peelPhiDeg, o.ringR);
  const join: CurvatureStretch = { lenM: o.joinRampM, k0: -1 / o.ringR, k1: 0 };
  const chordHeadingDeg = start.headingDeg - o.joinRampM / (2 * o.ringR) / RAD;
  let turnDeg = (o.exitHeadingDeg - chordHeadingDeg) % 360;
  if (turnDeg < 0) turnDeg += 360;
  if (!(turnDeg > 0 && turnDeg < 180)) throw new Error("ringExitProgramme: the exit is not a right turn from here");
  const turn = turnStretches(turnDeg * RAD, 1 / o.turnRadiusM, o.rampInM, o.rampOutM, "ringExitProgramme");
  const bare = integrateProgramme(start, [join, ...turn]).end;
  // Right of the exit heading H is (cos H, −sin H); the lane is where that
  // coordinate equals laneOffsetM. The chord slides the end along its heading.
  const rx = Math.cos(o.exitHeadingDeg * RAD);
  const ry = -Math.sin(o.exitHeadingDeg * RAD);
  const [vx, vy] = unit(chordHeadingDeg);
  const chordM = (o.laneOffsetM - (bare.x * rx + bare.y * ry)) / (vx * rx + vy * ry);
  if (!(chordM >= -1e-6)) {
    throw new Error(
      `ringExitProgramme: does not fit (chord ${chordM.toFixed(2)} m) — radius ${o.turnRadiusM} m from φ ${o.peelPhiDeg}° on r ${o.ringR}`,
    );
  }
  const stretches: CurvatureStretch[] = [join, { lenM: Math.max(0, chordM), k0: 0, k1: 0 }, ...turn];
  return { stretches, chordM, start, end: integrateProgramme(start, stretches).end };
}

/**
 * A side-step: an S that moves the path `lateralM` sideways (+ = to the right
 * of travel) and leaves the heading where it was — a turn one way and its
 * mirror back, with one continuous ramp through the middle. The holds are
 * solved (bisection on the integrated programme; the shift grows with them).
 */
export function sideStepProgramme(lateralM: number, radiusM: number, rampM: number): CurvatureStretch[] {
  const k = (lateralM >= 0 ? 1 : -1) / radiusM;
  const target = Math.abs(lateralM);
  const build = (holdM: number): CurvatureStretch[] => [
    { lenM: rampM, k0: 0, k1: k },
    { lenM: holdM, k0: k, k1: k },
    { lenM: 2 * rampM, k0: k, k1: -k },
    { lenM: holdM, k0: -k, k1: -k },
    { lenM: rampM, k0: -k, k1: 0 },
  ];
  const shiftOf = (holdM: number): number =>
    Math.abs(integrateProgramme({ x: 0, y: 0, headingDeg: 0 }, build(holdM)).end.x);
  if (shiftOf(0) > target) {
    throw new Error(`sideStepProgramme: ${lateralM} m is less than the ramps alone shift at radius ${radiusM} m`);
  }
  let lo = 0;
  let hi = radiusM; // a hold of one radius swings a full radian each way
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (shiftOf(mid) < target) lo = mid;
    else hi = mid;
  }
  return build((lo + hi) / 2);
}

/** Quintic smoothstep: 0 → 1 with zero first AND second derivative at both ends. */
const smooth5 = (u: number): number => u * u * u * (10 - 15 * u + 6 * u * u);

/** The one continuous authored line of a drive, and the marks it is cut at. */
export interface RingPath {
  readonly points: ReadonlyArray<readonly [number, number]>;
  readonly lengthM: number;
  /** The pose at a mark. */
  poseAt(mark: string): RingPose;
  /** Path distance from the start to a mark, m. */
  distanceAt(mark: string): number;
  /**
   * The polyline between two marks, for one drive step. `stop: true` adds the
   * recorder's 5 cm run-out along the final tangent, so a step that ends at
   * rest ends ON the mark.
   */
  between(fromMark: string, toMark: string, opts?: { stop?: boolean }): Array<[number, number]>;
}

/**
 * Builds a `RingPath` stretch by stretch. The builder carries the pose; every
 * stretch starts exactly where the last one ended.
 */
export class RingPathBuilder {
  private readonly pts: Array<[number, number]>;
  private readonly marks = new Map<string, { index: number; pose: RingPose; distM: number }>();
  private pose: RingPose;
  private lengthM = 0;

  constructor(start: RingPose, startMark = "start") {
    this.pose = { ...start };
    this.pts = [[start.x, start.y]];
    this.mark(startMark);
  }

  /** The pose the next stretch starts from. */
  get at(): RingPose {
    return { ...this.pose };
  }

  /** Name the current vertex. */
  mark(name: string): this {
    if (this.marks.has(name)) throw new Error(`RingPathBuilder: mark "${name}" placed twice`);
    this.marks.set(name, { index: this.pts.length - 1, pose: { ...this.pose }, distM: this.lengthM });
    return this;
  }

  straight(lenM: number): this {
    return this.programme([{ lenM, k0: 0, k1: 0 }]);
  }

  /** Straight on, along the current heading, until the given district y (north- or southbound only). */
  straightToY(y: number): this {
    const [, uy] = unit(this.pose.headingDeg);
    const lenM = (y - this.pose.y) / uy;
    if (!(lenM > 0)) throw new Error(`RingPathBuilder.straightToY: y ${y} is not ahead`);
    return this.straight(lenM);
  }

  /** Straight on until the given district x (east- or westbound only). */
  straightToX(x: number): this {
    const [ux] = unit(this.pose.headingDeg);
    const lenM = (x - this.pose.x) / ux;
    if (!(lenM > 0)) throw new Error(`RingPathBuilder.straightToX: x ${x} is not ahead`);
    return this.straight(lenM);
  }

  /**
   * Append a curvature programme. `marksAtM` names vertices INSIDE it: each
   * lands on the first vertex at or past that many metres from the programme's
   * start, headed along the chord that reached it.
   */
  programme(stretchesIn: readonly CurvatureStretch[], marksAtM: Readonly<Record<string, number>> = {}): this {
    // A straight is two points, so a mark that falls inside one gets a vertex
    // of its own: the straight is split there.
    let stretches: CurvatureStretch[] = stretchesIn.filter((q) => q.lenM > 0).map((q) => ({ ...q }));
    for (const atM of Object.values(marksAtM)) {
      const next: CurvatureStretch[] = [];
      let from = 0;
      for (const q of stretches) {
        const inside = atM > from + 1e-9 && atM < from + q.lenM - 1e-9;
        if (inside && q.k0 === 0 && q.k1 === 0) {
          next.push({ lenM: atM - from, k0: 0, k1: 0 }, { lenM: from + q.lenM - atM, k0: 0, k1: 0 });
        } else {
          next.push(q);
        }
        from += q.lenM;
      }
      stretches = next;
    }
    const run = integrateProgramme(this.pose, stretches);
    const pending = Object.entries(marksAtM)
      .map(([name, atM]) => ({ name, atM }))
      .sort((a, b) => a.atM - b.atM);
    for (const m of pending) {
      if (!(m.atM > 0 && m.atM < run.lengthM)) throw new Error(`RingPathBuilder.programme: mark "${m.name}" is not inside the programme`);
    }
    const base = this.lengthM;
    let [px, py] = run.points[0];
    let dist = 0;
    for (let i = 1; i < run.points.length; i++) {
      const [x, y] = run.points[i];
      dist += Math.hypot(x - px, y - py);
      this.pts.push([x, y]);
      while (pending.length > 0 && dist >= pending[0].atM - 1e-9) {
        const m = pending.shift()!;
        this.pose = { x, y, headingDeg: Math.atan2(x - px, y - py) / RAD };
        this.lengthM = base + dist;
        this.mark(m.name);
      }
      px = x;
      py = y;
    }
    this.pose = run.end;
    this.lengthM = base + run.lengthM;
    return this;
  }

  /** Radius and azimuth of the current pose about (0, 0) — it must be tangent to that circle. */
  private onCircle(what: string): { r: number; phiDeg: number } {
    const r = Math.hypot(this.pose.x, this.pose.y);
    const phiDeg = Math.atan2(this.pose.x, -this.pose.y) / RAD;
    const off = ((((90 - phiDeg - this.pose.headingDeg + 180) % 360) + 360) % 360) - 180;
    if (Math.abs(off) > 0.01) {
      throw new Error(`RingPathBuilder.${what}: the car is ${off.toFixed(3)}° off the circle's tangent`);
    }
    return { r, phiDeg: (phiDeg + 360) % 360 };
  }

  /** Circulate the circle the car is on, to azimuth `toPhiDeg` (ahead, < 360° on). */
  ringTo(toPhiDeg: number, marksAtPhi: Readonly<Record<string, number>> = {}): this {
    return this.ringShiftTo(toPhiDeg, null, marksAtPhi);
  }

  /**
   * Circulate to `toPhiDeg` while the radius eases from the circle the car is
   * on to `toR` — a lane change on a ring (`toR` null: stay on this circle).
   * The easing is the quintic smoothstep in azimuth, so the car leaves the one
   * circle and joins the other with heading and curvature both continuous.
   */
  ringShiftTo(toPhiDeg: number, toR: number | null, marksAtPhi: Readonly<Record<string, number>> = {}): this {
    const { r: r0, phiDeg: phi0 } = this.onCircle("ringShiftTo");
    let span = (toPhiDeg - phi0) % 360;
    if (span < 0) span += 360;
    if (!(span > 1e-9)) throw new Error(`RingPathBuilder.ringShiftTo: φ ${toPhiDeg}° is not ahead of φ ${phi0.toFixed(3)}°`);
    const r1 = toR ?? r0;
    const steps = Math.max(1, Math.round((Math.max(r0, r1) * span * RAD) / RING_PATH_DS_M));
    // Marks named inside the stretch land on the first vertex at or past
    // their azimuth, headed along the chord that reached it.
    const pending = Object.entries(marksAtPhi)
      .map(([name, phiDeg]) => ({ name, at: (((phiDeg - phi0) % 360) + 360) % 360 }))
      .sort((a, b) => a.at - b.at);
    for (const m of pending) {
      if (!(m.at > 0 && m.at < span)) throw new Error(`RingPathBuilder.ringShiftTo: mark "${m.name}" is not inside the stretch`);
    }
    let [px, py] = this.pts[this.pts.length - 1];
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const phi = (phi0 + span * u) * RAD;
      const r = r0 + (r1 - r0) * smooth5(u);
      const x = r * Math.sin(phi);
      const y = -r * Math.cos(phi);
      this.lengthM += Math.hypot(x - px, y - py);
      this.pts.push([x, y]);
      while (pending.length > 0 && span * u >= pending[0].at) {
        const m = pending.shift()!;
        this.pose = { x, y, headingDeg: Math.atan2(x - px, y - py) / RAD };
        this.mark(m.name);
      }
      px = x;
      py = y;
    }
    const end = ringPose(phi0 + span, r1);
    this.pose = { x: px, y: py, headingDeg: end.headingDeg };
    return this;
  }

  /** `ringEntryProgramme` from the current pose (`marksAtM`: see `programme`). */
  enterRing(o: Omit<RingEntryOptions, "from">, marksAtM: Readonly<Record<string, number>> = {}): this {
    return this.programme(ringEntryProgramme({ ...o, from: this.pose }).stretches, marksAtM);
  }

  /** Circulate to the peel azimuth, then `ringExitProgramme` onto the outbound lane. */
  exitRing(o: Omit<RingExitOptions, "ringR">, peelMark?: string): this {
    const { r, phiDeg } = this.onCircle("exitRing");
    if (Math.abs((((o.peelPhiDeg - phiDeg) % 360) + 360) % 360) > 1e-6) this.ringTo(o.peelPhiDeg);
    if (peelMark !== undefined) this.mark(peelMark);
    return this.programme(ringExitProgramme({ ...o, ringR: r }).stretches);
  }

  build(): RingPath {
    const pts = this.pts;
    const marks = this.marks;
    const need = (name: string) => {
      const m = marks.get(name);
      if (m === undefined) throw new Error(`RingPath: no mark "${name}"`);
      return m;
    };
    return {
      points: pts,
      lengthM: this.lengthM,
      poseAt: (name) => ({ ...need(name).pose }),
      distanceAt: (name) => need(name).distM,
      between: (fromMark, toMark, opts) => {
        const a = need(fromMark).index;
        const b = need(toMark).index;
        if (!(b > a)) throw new Error(`RingPath.between: "${toMark}" is not after "${fromMark}"`);
        const out = pts.slice(a, b + 1).map(([x, y]) => [x, y] as [number, number]);
        if (opts?.stop === true) {
          const [ux, uy] = unit(need(toMark).pose.headingDeg);
          const [ex, ey] = out[out.length - 1];
          out.push([ex + ux * RECORDER_STOP_SHORT_M, ey + uy * RECORDER_STOP_SHORT_M]);
        }
        return out;
      },
    };
  }
}
