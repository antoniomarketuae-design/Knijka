/**
 * THE TASK CEILING, ROUND 12 — the generated programmes that BUILD ACT STRUCTURE (not a test file).
 *
 * The integrator's ruling for round 12, F-JOIN: the verifier's N8 (the kept owner's `surfaceTask` carried into the act
 * it JOINS) surfaced a free TASK card on its own generator's programme 774 and survived everything, because round 11's
 * generator never built a join. Chance alone rarely builds one: a join needs an act kept with its latch (the latch's
 * arrival billed into an act that then ENDS — every task, weather and bend episode over — while the latch is still
 * current), a DIFFERENT act open later, and the same latch taking the car over its task line inside it. So these
 * programmes are composed of SCENES, each a short script of phases whose speeds sit on the lines that matter (the
 * task's figure and bill line, the weather envelope, the bend's advisory and its grace, the sign, its grace band and
 * its опасна line) and whose lengths straddle the clocks that matter (the bend's 1.5 s, the 3 s first bills, the 4 s
 * held corrections, the 9 s re-grades), drawn from a seeded stream — so the SAME seed is the SAME drive — and chained:
 *
 *  · KEEP → RESTORE / JOIN — an arrival's act ended by a held correction or by the stamp going missing, then the same
 *    latch over its line with no act open (a restore) or inside a weather or bend act opened meanwhile (a join); the
 *    kept act's owner may have lapsed and a new breach may have begun after the lapse first (the C3 flags N8 carries);
 *  · ESCALATE — the bend inside an act the task or the weather owns;
 *  · TAKEOVER — a sign-bound blow inside a live weather or bend act, or waiting when a weather or bend bill lands;
 *  · REPEAT — a second mark inside an act (graded, or sign-bound while the first arrival waits), and a latch replaced
 *    while an act is live;
 *  · LAPSED OWNER — a sign-bound blow inside an act whose TASK owner has lapsed (the verifier's N30 shape);
 *  · STRETCH — a sign-bound blow and then the sign raised past its cap with the latch stamping (round 12's F-STRETCH);
 *  · MULTI-WAIT — two or three blows waiting together, taken by a weather, bend or speeding bill whose own act ends inside
 *    the M-16 act, then the newest latch's stretch (round 10's absorbed latch; W11's shape);
 *  · FREE — phases drawn at random over the same lines and clocks, a quarter of them EXACTLY on a line (the sign, its
 *    grace and опасна edges, the envelope, the bend's advisory and bill line, the task's figure and bill line), so every
 *    strict and non-strict comparison the ledger makes is met at its equality too.
 *
 * What the lesson guarantees, and every programme keeps: a latch stamps only after its blow and only where the sign is
 * above its cap; a newer latch is never followed by an older one's stamp; an arrival rides only its blow frame, over
 * its cap plus the slack. `myProgramme` is the round-11 verifier's own generator (`scratchpad/cap/verify11/probes/
 * zz-v11-gen.ts`), ported verbatim — its programmes 633 and 774 are the ones that found N16 and N8.
 */
import type { SimTick } from "..";
import { tick } from "./fixtures";
import { rng } from "./taskCapProgrammes";

const GRACE = 5;

interface Latch {
  id: number;
  /** The compiled GATE (`capKmh`): the mark is blown, and the stretch bills, above it plus the slack. */
  cap: number;
  /** The GLASS figure (`shownKmh`): what the strip printed. Equal to the gate unless the domain is widened (round 13). */
  glass: number;
}

/**
 * ROUND 13 — THE WIDENED DOMAIN (the integrator's ruling C1: «the census generators hold four product dimensions
 * constant: shown == cap, no reversing, no night/snow, never off the carriageway (0 frames each). WIDEN THE DOMAIN
 * from the committed content»). Absent (every family of rounds 11–12): the programme is byte for byte what it was.
 */
export interface Widen {
  /**
   * THE PAIR: the differences gate − glass a blow may draw. The census hands in the differences the committed capped
   * objectives actually use (`taskCapCommittedPairs.ts`, derived from the compiled lessons) and a few beyond them.
   * With it a graded blow is also drawn, now and then, with its gate AT OR ABOVE the sign and its glass figure under it
   * (the regime of three committed L1 objectives), and the raised sign of a stretch sometimes sits between the two.
   */
  pairs: readonly number[];
  /**
   * FAMILY R — MARKS BLOWN IN REVERSE. The lesson's evaluator judges a mark on |speed| (`lessons/objectives.ts`), so a
   * car backing through a mark over its cap blows it — the reverse exit of `sc-park-bay-exit-rev` is a committed
   * sign-bound objective (gate 20, glass 20, posted 20). The reducer's speeding lines and its M-16 correction read the
   * SIGNED speed: backing, the car is at or under the sign, so a sign-bound blow can find the correction already HELD
   * on its own frame (the round-12 verifier's N4: the verdict skipped on the blow frame bills one frame late there).
   * With this flag ONE more scene joins the table (`blownBacking`); without it nothing changes.
   */
  reverseBlows?: boolean;
}

/** The drive being built, at 10 Hz. */
class Drive {
  frames: SimTick[] = [];
  i = 0;
  S: number;
  rain = false;
  fog = false;
  adv: number | undefined = undefined;
  latch: Latch | null = null;
  /** The current latch stamps (only honoured where the sign is above its glass figure). */
  stamping = false;
  // The widened domain's states (never set without `w`): snowfall, night, the fog lamps, and the car past the kerb.
  snow = false;
  night = false;
  fogLamps = false;
  offKerb = false;
  constructor(
    readonly r: () => number,
    S0: number,
    readonly w?: Widen,
  ) {
    this.S = S0;
  }
  get t(): number {
    return this.i / 10;
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.r() * xs.length)];
  }
  get E(): number | null {
    return this.snow ? this.S * 0.5 : this.fog ? this.S * 0.6 : this.rain ? this.S * 0.85 : null;
  }
  private frame(v: number, extra: Record<string, unknown> = {}, reverse = false): void {
    const o: Record<string, unknown> = { maxSpeedKmh: this.S, speedKmh: Math.max(0, Math.round(v * 10) / 10) };
    if (this.rain) o.rain = true;
    if (this.fog) o.fog = true;
    if (this.adv !== undefined) o.curveAdvisoryKmh = this.adv;
    if (this.stamping && this.latch !== null && this.S > this.latch.glass) o.taskSpeedCap = { capKmh: this.latch.cap, shownKmh: this.latch.glass, graceKmh: GRACE, blownAtSec: this.latch.id };
    if (this.w !== undefined) {
      // The widened domain: the envelope's other inputs, the lamp the fog duty reads, the runtime's own word on whether
      // the car is on a carriageway (a string edge, or null past the kerb — never «cannot answer»), and a pose that is
      // not the placeholder origin (the off-carriageway detector ignores a car standing at 0,0).
      if (this.snow) o.snow = true;
      if (this.night) o.isNight = true;
      if (this.fogLamps) o.fogLightsOn = true;
      o.edgeId = this.offKerb ? null : "e1";
      o.position = { x: 5, y: 5 };
      if (reverse) {
        o.speedKmh = -(o.speedKmh as number);
        o.gear = -1;
      }
    }
    Object.assign(o, extra);
    this.frames.push(tick(this.t, o as Partial<SimTick>));
    this.i++;
  }
  /** `sec` seconds at `v`. */
  hold(sec: number, v: number): void {
    const n = Math.max(1, Math.round(sec * 10));
    for (let j = 0; j < n; j++) this.frame(v);
  }
  /** `sec` seconds REVERSING at `v` (reverse gear, the speed signed negative) — the widened domain only. */
  reverse(sec: number, v: number): void {
    const n = Math.max(1, Math.round(sec * 10));
    for (let j = 0; j < n; j++) this.frame(v, {}, true);
  }
  /** A mark passed over its cap: GRADED (the glass figure under the sign — stamped from the blow frame) or SIGN-BOUND (the glass figure at or above it). */
  blow(kind: "graded" | "sign", backing = false): void {
    let glass = kind === "graded" ? Math.max(20, this.S - this.pick([10, 15, 20])) : this.S + this.pick([0, 0, 0, 3]);
    let cap = glass;
    if (this.w !== undefined) {
      // THE PAIR (round 13): the gate is the glass figure plus a difference the committed lessons use (or one beyond).
      const d = this.pick(this.w.pairs);
      // …and, now and then, a graded mark whose gate is AT OR ABOVE the sign while its glass figure is under it.
      if (kind === "graded" && d > 0 && this.r() < 0.25) glass = this.S - this.pick([d, d / 2, 1].filter((x) => x <= d));
      cap = glass + d;
    }
    const av = Math.round((cap + GRACE + 0.3 + this.r() * 6) * 100) / 100;
    const id = this.t;
    this.latch = { id, cap, glass };
    this.stamping = kind === "graded";
    // (a sign-bound blow carries no stamp: `frame` stamps only a stamping latch, and only where the sign is above its glass figure)
    // (`backing`, family R: the blow frame itself is a reversing frame — the arrival still quotes the speed's magnitude, as the lesson's does)
    this.frame(av, { taskCapArrival: { capKmh: cap, shownKmh: glass, graceKmh: GRACE, blownAtSec: id, arrivalKmh: av } }, backing);
  }
  /** The sign raised past the current latch on its named stretch: `x` over its gate — or, on the widened domain, sometimes only past its GLASS figure (at or under the gate). */
  raised(x: number): number {
    const l = this.latch!;
    if (this.w !== undefined && l.glass < l.cap && this.r() < 0.3) return l.glass + this.pick([1, 2, l.cap - l.glass].filter((y) => y <= l.cap - l.glass));
    return l.cap + x;
  }
  // the lines
  task(off: number): number {
    return this.latch === null ? this.S + off : (off > 0 ? this.latch.cap + GRACE : this.latch.glass) + off;
  }
  wx(off: number): number {
    return (this.E ?? this.S) + off;
  }
  bend(off: number): number {
    return this.adv === undefined ? this.S + off : this.adv + (off > 0 ? GRACE : 0) + off;
  }
  sign(off: number): number {
    return this.S + off;
  }
  signBand(off: number): number {
    return this.S + Math.min(this.S * 0.1, 5) + off;
  }
  danger(off: number): number {
    return this.S + 10 + off;
  }
  /** A length that straddles one of the clocks (1.5 s, 3 s, 4 s, 6 s, 9 s) or is plainly short or long. */
  len(): number {
    return this.pick([0.2, 0.5, 1, 1.4, 1.6, 2, 2.9, 3.1, 3.5, 3.9, 4.1, 5, 6, 8.9, 9.1, 10, 12, 15]);
  }
  off(): number {
    return this.pick([-3, -0.6, 0.6, 1, 3, 6, 12]);
  }
  /** Speeds EXACTLY on a line (every `>` / `<=` the ledger reads is crossed at its equality too): the sign, its grace
   *  band's edge, its опасна edge, the weather envelope, the bend's advisory and bill line, the task's figure and bill line. */
  exactLines(): number[] {
    const xs = [this.S, this.S + Math.min(this.S * 0.1, 5), this.S + 10];
    if (this.E !== null) xs.push(this.E);
    if (this.adv !== undefined) xs.push(this.adv, this.adv + GRACE);
    if (this.latch !== null) xs.push(this.latch.cap, this.latch.cap + GRACE);
    // The lines of the pair (widened domain): the glass figure, the WRONG bill line (glass + slack), and between the two.
    if (this.latch !== null && this.latch.glass !== this.latch.cap) xs.push(this.latch.glass, this.latch.glass + GRACE, (this.latch.glass + this.latch.cap + GRACE) / 2);
    return xs;
  }
}

// ---------------------------------------------------------------------------
// THE SCENES
// ---------------------------------------------------------------------------

type Scene = (d: Drive) => void;

/** An arrival's act kept with its latch, then resumed: restored with no act open, or joined to a weather/bend act. */
const keepThenResume: Scene = (d) => {
  const wetFirst = d.r() < 0.5;
  if (wetFirst) {
    d.rain = true;
    d.hold(d.pick([3.1, 3.5, 5]), d.wx(d.pick([1, 3])));
    if (d.r() < 0.6) d.hold(d.pick([0.2, 0.5, 1]), d.wx(-0.6)); // the weather owner lapses
  }
  d.blow("graded");
  // over the task line on the stamp: the arrival's act, maybe its first bill, maybe its re-grade
  d.hold(d.pick([0.5, 1, 2.9, 3.1, 5, 9.1]), d.task(d.pick([0.6, 1, 3])));
  if (wetFirst && d.r() < 0.6) {
    // a second lapse of the weather owner, then a NEW task breach that never reaches its first bill (the C3 flag stays up)
    d.hold(d.pick([0.2, 0.5]), Math.min(d.wx(-0.6), d.task(0.6)));
    d.hold(d.pick([0.5, 1, 2]), d.task(d.pick([0.6, 1])));
  }
  // the act ends: under the figure on the glass for a held correction, or the stamp missing for as long
  if (d.r() < 0.5) d.hold(d.pick([4.1, 5, 6]), Math.min(d.task(-0.6), d.wx(-0.6), d.bend(-3), d.sign(-3)));
  else {
    d.stamping = false;
    d.hold(d.pick([4.1, 5, 6]), Math.min(d.wx(-0.6), d.bend(-3), d.sign(-3)));
  }
  if (d.r() < 0.5) d.rain = false;
  const mode = d.pick(["restore", "joinWx", "joinBend", "joinWx", "joinBend"] as const);
  if (mode === "joinWx") {
    d.rain = true;
    d.hold(d.pick([3.1, 3.5, 4]), d.wx(d.pick([1, 3])));
    if (d.r() < 0.4) d.hold(d.pick([0.2, 0.5]), d.wx(-0.6));
  } else if (mode === "joinBend") {
    d.adv = Math.max(20, d.S - d.pick([15, 20, 25]));
    d.hold(d.pick([1.6, 2, 3]), d.bend(d.pick([1, 3])));
  }
  d.stamping = true;
  d.hold(d.pick([0.5, 2.9, 3.1, 4, 9.1, 12]), d.task(d.pick([0.6, 1, 3, 6])));
  if (d.r() < 0.5) d.adv = undefined;
};

/** The bend inside an act the task or the weather owns. */
const escalate: Scene = (d) => {
  if (d.r() < 0.5) {
    d.blow("graded");
    d.hold(d.pick([0.5, 3.1, 5]), d.task(d.pick([1, 3])));
  } else {
    d.rain = true;
    d.hold(d.pick([3.1, 4]), d.wx(d.pick([1, 3])));
    if (d.r() < 0.5) d.blow("graded");
  }
  if (d.r() < 0.5) d.hold(d.pick([0.2, 0.5, 1]), Math.min(d.task(-0.6), d.wx(-0.6))); // the owner lapses first
  if (d.r() < 0.4) d.hold(d.pick([0.5, 1]), d.task(1)); // a new task breach after the lapse
  d.adv = Math.max(20, d.S - d.pick([15, 20]));
  d.hold(d.pick([1.6, 2, 4, 10]), d.bend(d.pick([1, 3, 6])));
  if (d.r() < 0.5) d.blow(d.pick(["graded", "sign"] as const));
  d.hold(d.len(), d.pick([d.bend(1), d.task(1), d.wx(1), d.bend(-3)]));
  d.adv = undefined;
};

/** A sign-bound blow inside a live weather or bend act, or waiting when a weather or bend bill lands. */
const takeover: Scene = (d) => {
  const live = d.r() < 0.5;
  if (d.r() < 0.5) d.rain = true;
  else d.adv = Math.max(20, d.S - d.pick([10, 15]));
  if (live) d.hold(d.pick([1.6, 3.1, 4]), d.adv !== undefined ? d.bend(3) : d.wx(3));
  else d.hold(d.pick([0.5, 1, 2]), Math.min(d.sign(-2), d.adv !== undefined ? d.bend(-3) : d.wx(-0.6)));
  d.blow("sign");
  d.hold(d.pick([0.5, 1, 1.6, 2.9, 3.1, 5]), d.pick([d.sign(1), d.signBand(-0.5), d.sign(-1), d.signBand(1)]));
  if (d.r() < 0.4) d.blow("sign"); // a later blow while it waits
  d.hold(d.pick([2, 4.1, 6]), d.pick([d.sign(-3), d.sign(1), d.wx(1)]));
  d.rain = false;
  d.adv = undefined;
};

/** A second mark inside an act; a latch replaced while an act is live. */
const repeat: Scene = (d) => {
  if (d.r() < 0.5) d.rain = true;
  d.blow(d.pick(["graded", "sign"] as const));
  d.hold(d.pick([0.5, 1, 3.1, 5]), d.pick([d.task(1), d.wx(1), d.signBand(1), d.sign(1)]));
  d.blow(d.pick(["graded", "sign", "graded"] as const));
  d.hold(d.pick([1, 3.1, 5, 9.1]), d.pick([d.task(1), d.task(3), d.wx(1)]));
  if (d.r() < 0.5) {
    d.blow(d.pick(["graded", "sign"] as const));
    d.hold(d.len(), d.pick([d.task(1), d.sign(-3)]));
  }
  d.rain = false;
};

/** A sign-bound blow inside an act whose TASK owner has lapsed (the verifier's N30 shape). */
const lapsedTaskOwner: Scene = (d) => {
  d.blow("graded");
  d.hold(d.pick([0.5, 3.1, 5]), d.task(d.pick([1, 3])));
  d.hold(d.pick([0.2, 0.5, 1, 2]), d.task(-0.6)); // grace band / under: the task owner lapses, its episode still open
  if (d.r() < 0.4) {
    d.rain = true;
    d.hold(d.pick([0.5, 1]), d.wx(1));
  }
  d.blow("sign");
  d.hold(d.pick([0.5, 2, 3.1, 5]), d.pick([d.sign(1), d.signBand(1), d.sign(-1), d.danger(1)]));
  d.hold(d.pick([4.1, 6]), d.sign(-3));
  d.rain = false;
};

/** Round 12's F-STRETCH: a sign-bound blow, then the sign raised past its cap with the latch stamping. */
const stretch: Scene = (d) => {
  const S0 = d.S;
  if (d.r() < 0.3) d.rain = true;
  d.blow("sign");
  if (d.r() < 0.3) d.hold(d.pick([0.2, 1, 2]), d.pick([d.sign(1), d.sign(-1)]));
  const cap = d.latch!.cap;
  d.S = d.raised(d.pick([3, 5, 10, 20]));
  d.stamping = true;
  d.hold(d.pick([3.1, 6, 9.1, 12, 20]), d.pick([cap + GRACE + 1, d.sign(1), d.signBand(-0.5), d.signBand(1), cap + GRACE + 12]));
  if (d.r() < 0.4) {
    d.S = S0;
    d.hold(d.pick([1, 2.1, 3]), d.pick([d.signBand(1), d.danger(1), d.sign(-1)]));
  }
  d.stamping = false;
  d.S = S0;
  d.rain = false;
  d.hold(d.pick([4.1, 6]), d.sign(-5));
};

/**
 * A WAIT THAT HOLDS SEVERAL BLOWS, TAKEN BY AN ABSORBER WHOSE OWN ACT THEN ENDS INSIDE THE M-16 ACT, AND THE NEWEST LATCH'S
 * STRETCH AFTER IT (round 10's absorbed latch; the shapes of the round-10 verifier's W11 — the kin-while-waiting path must
 * record EVERY waiting latch — and of a surface flag raised for an absorbed latch). Two or three sign-bound blows held in
 * the sign's grace band (each waits with the first); a weather or bend first bill, or a speeding bill, takes them all; the
 * weather stops or the bend ends while the car is still over the sign (the M-16 act runs on); sometimes the car first dips
 * under the envelope (the weather owner lapses); then the sign rises past the newest latch's cap and that latch stamps the
 * car over its line — the absorbed act carrying on, never a new naming.
 */
const multiWait: Scene = (d) => {
  const S0 = d.S;
  d.blow("sign");
  d.hold(d.pick([0.5, 1, 1.4]), d.signBand(-0.5));
  d.blow("sign");
  d.hold(d.pick([0.5, 1]), d.signBand(-0.5));
  if (d.r() < 0.4) {
    d.blow("sign");
    d.hold(d.pick([0.5, 1]), d.signBand(-0.5));
  }
  const how = d.pick(["wx", "wx", "bend", "speed"] as const);
  if (how === "wx") {
    d.rain = true;
    d.hold(d.pick([3.1, 3.5, 4]), d.signBand(-0.5));
    if (d.r() < 0.4) d.hold(d.pick([0.2, 0.5]), d.wx(-0.6)); // the weather owner lapses (under the sign: the hold starts)
  } else if (how === "bend") {
    d.adv = Math.max(20, d.S - d.pick([10, 15]));
    d.hold(d.pick([1.6, 2, 3]), d.signBand(-0.5));
  } else d.hold(d.pick([2.1, 2.5, 3.1]), d.signBand(1)); // over the band: the speeding bills and takes the act
  // the absorber's own act ends while the car is still over the sign (unless it just dipped)
  if (d.r() < 0.7) {
    d.rain = false;
    d.adv = undefined;
  }
  if (d.r() < 0.5) d.hold(d.pick([0.5, 1, 2]), d.sign(1));
  const cap = d.latch!.cap;
  d.S = d.raised(d.pick([3, 5, 10]));
  d.stamping = true;
  d.hold(d.pick([2, 3.5, 6, 9.5]), d.pick([cap + GRACE + 1, cap + GRACE + 3, d.sign(1)]));
  d.stamping = false;
  d.S = S0;
  d.rain = false;
  d.adv = undefined;
  d.hold(d.pick([4.1, 6]), d.sign(-5));
};

/** Phases at random over the same lines and clocks. */
const free: Scene = (d) => {
  const n = 2 + Math.floor(d.r() * 5);
  for (let k = 0; k < n; k++) {
    if (d.r() < 0.2) d.rain = !d.rain;
    if (d.r() < 0.07) d.fog = !d.fog;
    if (d.r() < 0.2) d.adv = d.adv === undefined ? Math.max(20, d.S - d.pick([10, 15, 20, 25])) : undefined;
    if (d.r() < 0.15) d.stamping = !d.stamping;
    if (d.r() < 0.12) d.blow(d.pick(["graded", "sign"] as const));
    const line = d.pick(["task", "wx", "bend", "sign", "signBand", "danger"] as const);
    d.hold(d.len(), d.r() < 0.25 ? d.pick(d.exactLines()) : d[line](d.off()));
  }
};

// ---------------------------------------------------------------------------
// THE WIDENED DOMAIN'S SCENES (round 13)
// ---------------------------------------------------------------------------

/**
 * REVERSING over a stamped stretch, over the weather's line and through a bend: the three чл. 20, ал. 2 lines read
 * forward motion (`moving` is the signed speed over 5 km/h; the bend arms in a forward gear), so nothing of theirs
 * bills however fast the car backs — and a speed at or under a line, as a negative one is, is that line's correction.
 */
const reversing: Scene = (d) => {
  if (d.latch === null || d.r() < 0.5) d.blow("graded");
  d.stamping = true;
  d.hold(d.pick([0.5, 1, 3.1]), d.task(d.pick([1, 3])));
  if (d.r() < 0.4) d.rain = true;
  if (d.r() < 0.3) d.adv = Math.max(20, d.S - d.pick([15, 20]));
  d.reverse(d.pick([0.5, 2, 3.5, 4.1, 6, 10]), d.pick([d.task(3), d.task(12), d.signBand(1), d.danger(2), 8]));
  d.hold(d.len(), d.pick([d.task(1), d.task(-1), d.sign(-3)]));
  if (d.r() < 0.3) d.reverse(d.pick([1, 3.1]), d.task(1));
  d.rain = false;
  d.adv = undefined;
};
/** SNOW and NIGHT windows (the other inputs of the envelope: snow leaves half the sign, the night all of it), with the fog lamps on or off in fog. */
const weatherAndLight: Scene = (d) => {
  if (d.r() < 0.6) d.snow = true;
  else d.night = true;
  if (d.r() < 0.3) {
    d.fog = true;
    d.fogLamps = d.r() < 0.5;
  }
  if (d.r() < 0.5) d.blow(d.pick(["graded", "sign"] as const));
  d.hold(d.pick([3.1, 3.5, 6, 9.5]), d.pick([d.wx(1), d.wx(3), d.wx(-0.6), d.task(1), d.sign(1)]));
  if (d.r() < 0.5) d.night = !d.night;
  if (d.r() < 0.3) d.snow = !d.snow;
  d.hold(d.len(), d.pick([d.wx(1), d.task(1), d.sign(-3)]));
  d.snow = false;
  d.night = false;
  d.fog = false;
  d.fogLamps = false;
};
/**
 * OFF THE CARRIAGEWAY: a bend met past the kerb (no FRESH bend episode opens there — «the asphalt gates the arm, not
 * the fire»), a bend episode opened on the road and carried on past the kerb (it still fires there), and the excursion
 * itself, billed by its own code after 2 s and once more 6 s later (чл. 15, ал. 1).
 */
const offRoad: Scene = (d) => {
  const openedOnTheRoad = d.r() < 0.5;
  d.adv = Math.max(20, d.S - d.pick([10, 15, 20]));
  if (openedOnTheRoad) d.hold(d.pick([0.5, 1, 1.4]), d.bend(3));
  d.offKerb = true;
  d.hold(d.pick([0.5, 1.9, 2.1, 5, 8.5]), d.pick([d.bend(3), d.bend(1), d.sign(1)]));
  d.offKerb = false;
  if (d.r() < 0.5) d.blow(d.pick(["graded", "sign"] as const));
  d.hold(d.len(), d.pick([d.bend(3), d.task(1), d.bend(-3)]));
  if (d.r() < 0.3) {
    d.offKerb = true;
    d.hold(d.pick([1, 2.5, 9]), d.pick([d.task(1), d.sign(-3)]));
    d.offKerb = false;
  }
  d.adv = undefined;
};
/** A graded stretch driven BETWEEN the lines of the pair: over the glass figure, at or under the gate plus its slack — the grace band of the task, neither a bill nor a correction — then over the line, then corrected. */
const betweenTheLines: Scene = (d) => {
  d.blow("graded");
  const l = d.latch!;
  d.hold(d.pick([0.5, 3.1, 5, 9.5]), d.pick([l.glass + 0.6, l.glass + GRACE + 0.5, l.cap + GRACE, (l.glass + l.cap + GRACE) / 2, l.cap + GRACE + 0.6]));
  d.hold(d.pick([0.5, 3.1, 4.1, 9.5]), d.pick([l.cap + GRACE + 1, l.glass + 0.6, l.cap, l.glass]));
  d.hold(d.pick([2, 4.1, 6]), d.pick([l.glass - 0.6, l.glass, l.cap, l.cap + GRACE + 1]));
};
/**
 * ROUND 13's ORDER SHAPES (the integrator's ruling C2): a sign-bound blow, its STAMP, and a weather or bend first bill
 * AFTER the stamp inside the M-16 act — with the stamp's own act still OPEN (the car over the task's line), or already
 * ENDED and kept with its latch (the car over the sign it was blown on, not over the line), or CHARGED and then ended
 * (9.5 s over the line: the act's one re-grade; the sign back and the stamp gone for 4 s and more, the car still over
 * the sign) — or the weather and the bend first-billing on ONE frame (the weather's 3 s and the bend's 1.5 s ending
 * together). The weather's window is sometimes held past its own re-grade (9 s): the act's one charge must still be one.
 * One time in four the task bill that takes the waiting act's one bill is not the stamp but a NEW graded MARK blown
 * while the first arrival still waits (round 7), the sign unmoved and the car on in its grace band.
 */
const afterTheStamp: Scene = (d) => {
  const S0 = d.S;
  d.blow("sign");
  const newMark = d.r() < 0.25;
  if (newMark || d.r() < 0.4) d.hold(d.pick([0.2, 1, 2]), d.signBand(-0.5));
  if (newMark) d.blow("graded");
  const l = d.latch!;
  if (!newMark) d.S = d.raised(d.pick([3, 5, 10]));
  d.stamping = true;
  const mode = newMark ? "open" : d.pick(["open", "ended", "charged", "open", "ended"] as const);
  let v = newMark ? Math.max(d.signBand(-0.5), l.cap + GRACE + 1) : mode === "ended" ? Math.min(l.cap + GRACE, Math.max(l.glass + 0.5, S0 + 1)) : l.cap + GRACE + d.pick([1, 3]);
  if (mode === "charged") {
    // the act's one re-grade lands; then the sign is back (no stamp: the glass figure is not under it) with the car in
    // its grace band — over the sign, so the M-16 act runs on — until the task's episode has ended and the act is kept
    d.hold(9.5, v);
    d.S = S0;
    v = d.signBand(-0.5);
    d.hold(d.pick([4.1, 5]), v);
  } else d.hold(d.pick([0.2, 0.5, 1]), v);
  const how = d.pick(["wx", "bend", "tie", "wx", "bend", "wxLong", "tie"] as const);
  if (how === "wx" || how === "wxLong") {
    d.rain = true;
    d.hold(how === "wxLong" ? d.pick([9.1, 9.5, 12]) : d.pick([3.1, 3.5]), v);
  } else if (how === "bend") {
    d.adv = Math.max(15, Math.round(v) - d.pick([8, 12]));
    d.hold(d.pick([1.6, 2]), v);
  } else {
    d.rain = true;
    d.hold(1.5, v);
    d.adv = Math.max(15, Math.round(v) - 10);
    d.hold(d.pick([1.5, 1.6, 2]), v);
  }
  d.hold(d.pick([0.5, 2, 6, 9.5]), d.pick([v, l.cap + GRACE + 1, d.sign(-3)]));
  d.stamping = false;
  d.S = S0;
  d.rain = false;
  d.adv = undefined;
  d.hold(d.pick([4.1, 6]), d.sign(-5));
};
/**
 * ROUND 13's ONE BILL OF THE LAW PER ACT (the integrator's ruling C2, read to its end): a sign-bound blow and a LONG
 * M-16 act — the car held over the sign, inside its grace band: never a speeding bill, never a correction — with
 * several events of the three чл. 20, ал. 2 codes inside it, in a drawn order: weather windows (short, or held past the
 * weather's own re-grade), a bend's, a second mark (a later sign-bound blow; a graded one once the sign has risen),
 * the stamp, the stamp gone again, and gaps in which every act of the ledger ends while the M-16 act runs on — so a
 * later bill names a NEW act of the ledger inside the same sign-bound act (round 11's C1 shape), the bend bills after
 * the weather and before it, and two acts of the ledger are each held past a re-grade (the sign-bound act has ONE).
 * One time in four the act is exactly that last shape: a long weather window, a gap, and a second long one.
 */
const oneBillPerAct: Scene = (d) => {
  const S0 = d.S;
  d.blow("sign");
  // over the sign, inside its grace band (re-read on every step: the sign may have been raised)
  const band = () => d.signBand(-0.5);
  d.hold(d.pick([0.2, 0.5, 1]), band());
  const long = () => {
    d.rain = true;
    d.hold(d.pick([9.1, 9.5, 12]), band());
    d.rain = false;
  };
  if (d.r() < 0.25) {
    long();
    d.hold(d.pick([0.5, 1, 2]), band());
    if (d.r() < 0.5) {
      d.adv = Math.max(15, Math.round(band()) - d.pick([8, 12]));
      d.hold(d.pick([1.6, 2]), band());
      d.adv = undefined;
      d.hold(d.pick([0.5, 1]), band());
    }
    long();
  } else {
    const steps = 2 + Math.floor(d.r() * 4);
    for (let k = 0; k < steps; k++) {
      const what = d.pick(["wx", "wxLong", "bend", "mark", "stamp", "stampOff", "gap", "wx", "bend"] as const);
      if (what === "wx") {
        d.rain = true;
        d.hold(d.pick([3.1, 3.5, 5]), band());
        if (d.r() < 0.7) d.rain = false;
      } else if (what === "wxLong") long();
      else if (what === "bend") {
        d.adv = Math.max(15, Math.round(band()) - d.pick([8, 12, 20]));
        d.hold(d.pick([1.6, 2, 4]), band());
        if (d.r() < 0.7) d.adv = undefined;
      } else if (what === "mark") {
        // a second mark: sign-bound while the sign binds; once the sign has risen past the first, sometimes a graded one
        const kind = d.S > S0 && d.r() < 0.6 ? "graded" : "sign";
        d.blow(kind);
        d.hold(d.pick([0.2, 1, 3.1]), band());
      } else if (what === "stamp") {
        d.S = d.raised(d.pick([3, 5, 10]));
        d.stamping = true;
        d.hold(d.pick([0.5, 3.1, 9.5]), band());
      } else if (what === "stampOff") {
        // the stamp gone for a held correction's length: the task's episode ends, the car still over the sign
        d.stamping = false;
        d.hold(d.pick([4.1, 5]), band());
      } else d.hold(d.pick([0.5, 1, 2]), band()); // a gap
    }
  }
  d.stamping = false;
  d.S = S0;
  d.rain = false;
  d.adv = undefined;
  d.hold(d.pick([4.1, 6]), d.sign(-5));
};
/**
 * FAMILY R — A MARK BLOWN WHILE BACKING. Forward first (under the sign for a held correction's length, in its grace
 * band, or over it — so the blow finds the M-16 correction held, running, or the car in a speeding act), then backing
 * (the signed speed is under every line: the correction accrues), the mark blown IN REVERSE — sign-bound or graded —
 * and the car backing on over the task's line (nothing of the stretch bills in reverse) before it drives forward
 * again, over the line or under it. Sometimes in the rain, sometimes with a second mark blown backing in the same act.
 */
const blownBacking: Scene = (d) => {
  if (d.r() < 0.35) d.rain = true;
  d.hold(d.pick([0.5, 2, 4.1, 6]), d.pick([d.sign(-5), d.sign(-5), d.signBand(-1), d.sign(7), d.danger(2)]));
  d.reverse(d.pick([0.2, 1, 3.9, 4.1, 6]), d.pick([8, d.sign(2), d.sign(12)]));
  d.blow(d.r() < 0.65 ? "sign" : "graded", true);
  d.reverse(d.pick([0.2, 1, 3.1, 5]), d.task(d.pick([1, 3, 8])));
  if (d.r() < 0.3) {
    d.blow(d.r() < 0.5 ? "sign" : "graded", true);
    d.reverse(d.pick([0.5, 2]), d.task(2));
  }
  d.hold(d.len(), d.pick([d.task(1), d.task(-1), d.sign(-3), d.signBand(-1)]));
  d.rain = false;
};
const WIDE_SCENES: ReadonlyArray<readonly [Scene, number]> = [
  [reversing, 2],
  [weatherAndLight, 2],
  [offRoad, 2],
  [betweenTheLines, 2],
  [afterTheStamp, 3],
  [oneBillPerAct, 3],
];

const SCENES: ReadonlyArray<readonly [Scene, number]> = [
  [keepThenResume, 5],
  [escalate, 2],
  [takeover, 2],
  [repeat, 2],
  [lapsedTaskOwner, 2],
  [stretch, 2],
  [multiWait, 2],
  [free, 3],
];

/**
 * One seeded drive of chained scenes. Reproducible: the same seed is the same drive. With `widen` (round 13, family P)
 * the same scenes run over the WIDENED domain — every blow draws its pair, and the reversing, weather-and-light,
 * off-carriageway and between-the-lines scenes join the table; without it the drive is what it was in round 12.
 */
export function generateActProgramme(seed: number, widen?: Widen): SimTick[] {
  const r = rng(seed * 104729 + 7);
  const d = new Drive(r, [50, 50, 60, 70, 80, 90][Math.floor(r() * 6)], widen);
  d.hold(1, d.S - 8);
  const scenes = 2 + Math.floor(r() * 4);
  const table: ReadonlyArray<readonly [Scene, number]> =
    widen === undefined ? SCENES : widen.reverseBlows === true ? [...SCENES, ...WIDE_SCENES, [blownBacking, 8]] : [...SCENES, ...WIDE_SCENES];
  const total = table.reduce((a, [, w]) => a + w, 0);
  for (let k = 0; k < scenes; k++) {
    let x = r() * total;
    let chosen: Scene = free;
    for (const [s, w] of table) {
      if (x < w) {
        chosen = s;
        break;
      }
      x -= w;
    }
    chosen(d);
    // between scenes: often a quiet stretch (every act can end), sometimes straight on (acts carry across)
    if (r() < 0.6) {
      const quiet = r() < 0.5;
      if (quiet) d.stamping = false;
      d.hold(d.pick([0.5, 2, 4.1, 6]), Math.min(d.sign(-4), d.wx(-1), d.bend(-3), d.latch !== null && d.stamping ? d.task(-1) : d.sign(-4)));
    }
  }
  d.stamping = false;
  d.rain = false;
  d.fog = false;
  d.adv = undefined;
  d.snow = false;
  d.night = false;
  d.fogLamps = false;
  d.offKerb = false;
  d.hold(8, d.S - 10);
  return d.frames;
}

// ---------------------------------------------------------------------------
// THE ROUND-11 VERIFIER'S GENERATOR (verbatim)
// ---------------------------------------------------------------------------

/** The round-11 verifier's generator: graded-heavy, weather and bend windows, dips, the sign moving; 10 Hz. */
export function myProgramme(seed: number): SimTick[] {
  const r = rng(seed * 7919 + 13);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const S0 = pick([50, 50, 60, 70, 80, 90]);
  const frames: SimTick[] = [];
  let i = 0;
  const N = (30 + Math.floor(r() * 40)) * 10;
  let latch: { id: number; cap: number; graded: boolean } | null = null;
  let wet = r() < 0.5;
  let fog = false;
  let adv: number | undefined = undefined;
  let blows = 0;
  while (i < N) {
    if (r() < 0.2) wet = !wet;
    if (r() < 0.1) fog = !fog;
    if (r() < 0.25) adv = adv === undefined ? Math.max(20, S0 - pick([10, 15, 20, 30])) : undefined;
    const S = r() < 0.15 ? S0 + pick([10, 20]) : S0;
    const E = wet ? S * (fog ? 0.6 : 0.85) : null;
    const base: Partial<SimTick> = { maxSpeedKmh: S, ...(wet ? (fog ? { fog: true } : { rain: true }) : {}), ...(adv !== undefined ? { curveAdvisoryKmh: adv } : {}) };
    const roll = r();
    if (roll < 0.1 && blows < 5 && i > 20) {
      // a blow: graded (cap under the sign) mostly, sometimes sign-bound
      const graded = r() < 0.75;
      const cap = graded ? Math.max(20, S - pick([10, 15, 20, 25])) : S;
      const av = Math.round((cap + 5 + 0.2 + r() * 8) * 10) / 10;
      const t = i / 10;
      frames.push(tick(t, { ...base, speedKmh: av, taskCapArrival: { capKmh: cap, shownKmh: cap, graceKmh: 5, blownAtSec: t, arrivalKmh: av }, ...(graded ? { taskSpeedCap: { capKmh: cap, shownKmh: cap, graceKmh: 5, blownAtSec: t } } : {}) }));
      latch = { id: t, cap, graded };
      blows++;
      i++;
      continue;
    }
    const lines: number[] = [S - 3, S + 1, S + 6, S + 12];
    if (E !== null) lines.push(E - 1.5, E + 1, E + 4);
    if (adv !== undefined) lines.push(adv - 2, adv + 3, adv + 7, adv + 12);
    const stamping = latch !== null && latch.graded && S > latch.cap && r() < 0.8;
    if (stamping && latch !== null) lines.push(latch.cap - 1, latch.cap + 2, latch.cap + 6, latch.cap + 10);
    const v = Math.max(12, Math.round(pick(lines) * 10) / 10);
    const n = pick([2, 4, 8, 15, 25, 35, 45, 60]);
    for (let j = 0; j < n && i < N; j++, i++) {
      frames.push(tick(i / 10, { ...base, speedKmh: v, ...(stamping && latch !== null ? { taskSpeedCap: { capKmh: latch.cap, shownKmh: latch.cap, graceKmh: 5, blownAtSec: latch.id } } : {}) }));
    }
    if (r() < 0.2) latch = latch !== null && latch.graded ? latch : null;
  }
  for (let j = 0; j < 60; j++, i++) frames.push(tick(i / 10, { maxSpeedKmh: S0, speedKmh: Math.max(12, S0 - 10) }));
  return frames;
}
