/**
 * THE TASK CEILING, ROUND 11 — shared programme builders for the reducer-level
 * tests (not a test file itself).
 *
 *  · `prog` / `arr` / `stamp` — the verifiers' segment form (verify9/10), so a
 *    witness ported from a verifier probe reads frame for frame as it did there.
 *  · `staleSurfaceGrid()` — the round-10 verifier's 288-programme grid
 *    (`scratchpad/cap/verify10b/probes/zz-v10b-grid.test.ts`), with its controls.
 *  · `generateProgramme(seed, opts)` — THE GENERATED PROGRAMMES of the property census
 *    (integrator's ruling for round 11, «answer the class»): seeded random drives
 *    of speed, posted sign, task marks and caps, weather windows, bends and dips.
 *    Reproducible: the same seed is the same drive, byte for byte.
 *  · `watchFlags(frames)` — folds the real reducer and checks, after EVERY frame,
 *    the owner- and latch-scoped flags of the kin act (round-11 F1): each one
 *    describes the CURRENT owner and the CURRENT latch, or it is down.
 */
import { createRuleEngine, reduceTick, type RuleEvent, type SimTick, type ViolationEvent } from "..";
import { tick } from "./fixtures";

export const TASK = "TASK_SPEED_CAP_EXCEEDED";
export const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
export const CURVE = "SPEED_TOO_FAST_FOR_CURVE";

export type Seg = { from: number; to: number; v: number; o?: Record<string, unknown> };
export function prog(segs: Seg[], base: Record<string, unknown>): SimTick[] {
  const out: SimTick[] = [];
  for (const s of segs) for (let i = Math.round(s.from * 10); i < Math.round(s.to * 10); i++) out.push(tick(i / 10, { maxSpeedKmh: 50, ...base, speedKmh: s.v, ...(s.o ?? {}) } as Partial<SimTick>));
  return out;
}
export const arr = (cap: number, b: number, v: number) => ({ taskCapArrival: { capKmh: cap, shownKmh: cap, graceKmh: 5, blownAtSec: b, arrivalKmh: v } });
export const stamp = (cap: number, b: number) => ({ taskSpeedCap: { capKmh: cap, shownKmh: cap, graceKmh: 5, blownAtSec: b } });

const viol = (events: readonly RuleEvent[]) => events.filter((e): e is ViolationEvent => e.kind === "violation");
/** Every bill with the kin ledger's marks — the verifiers' notation. */
export const label = (e: ViolationEvent): string =>
  `${e.code}${e.regrade === true ? ":rg" : ""}${(e as unknown as { kinSurface?: string }).kinSurface !== undefined ? ":surf" : ""}${(e as unknown as { kinOwner?: string }).kinOwner !== undefined ? ":ko=" + (e as unknown as { kinOwner?: string }).kinOwner : ""}${e.absorbedBy !== undefined ? ">" + e.absorbedBy : ""}@${e.t}`;
export const labels = (events: readonly RuleEvent[]) => viol(events).map(label);

// ---------------------------------------------------------------------------
// The round-10 verifier's 288-programme grid (zz-v10b-grid.test.ts), verbatim
// ---------------------------------------------------------------------------

const rainO = { rain: true };
const r70 = (o: Record<string, unknown> = {}) => ({ rain: true, maxSpeedKmh: 70, ...o });
function progPlain(segs: Seg[]): SimTick[] {
  const out: SimTick[] = [];
  for (const s of segs) for (let i = Math.round(s.from * 10); i < Math.round(s.to * 10); i++) out.push(tick(i / 10, { maxSpeedKmh: 50, speedKmh: s.v, ...(s.o ?? {}) } as Partial<SimTick>));
  return out;
}
export function staleSurfaceProgramme(dip: number, b: number, s: number, c: number, m: number, stampEnd: number): SimTick[] {
  const segs: Seg[] = [
    { from: 0, to: 3.1, v: 46, o: rainO },
    { from: 3.1, to: 3.2, v: 46, o: { ...rainO, ...arr(35, 3.1, 46), ...stamp(35, 3.1) } },
    { from: 3.2, to: b - dip, v: 46, o: { ...rainO, ...stamp(35, 3.1) } },
    { from: b - dip, to: b, v: 41, o: { ...rainO, ...stamp(35, 3.1) } },
    { from: b, to: b + 0.1, v: 58, o: { ...rainO, ...arr(50, b, 58) } },
  ];
  const edges = [...new Set([b + 0.1, s, stampEnd, c, m, m + 0.1, m + 2, m + 10])].filter((x) => x >= b + 0.1).sort((x, y) => x - y);
  for (let i = 0; i + 1 < edges.length; i++) {
    const a = edges[i];
    const z = edges[i + 1];
    const st = a >= s && a < stampEnd ? stamp(50, b) : {};
    const bend = a >= c && a < m + 2 ? { curveAdvisoryKmh: 40 } : {};
    const mark = a >= m && a < m + 2 ? (a < m + 0.1 ? { ...arr(40, m, 60), ...stamp(40, m) } : stamp(40, m)) : {};
    const v = a >= m + 2 ? 25 : 60;
    segs.push({ from: a, to: z, v, o: a >= m + 2 ? { maxSpeedKmh: 70 } : r70({ ...st, ...bend, ...mark }) });
  }
  return progPlain(segs);
}
export interface GridProgramme {
  tag: string;
  m: number;
  frames: SimTick[];
  /** The verifier's control: the ≤50 stamp starts one frame after the weather's absorbing bill. */
  control: SimTick[];
}
/** The verifier's grid: dip 0.3/0.5/0.8 × blow 4.6/5.0 × stamp +0.5..+2.0 × bend 9/12/15 × mark +2..+18 = 288. */
export function staleSurfaceGrid(): GridProgramme[] {
  const out: GridProgramme[] = [];
  for (const dip of [0.3, 0.5, 0.8])
    for (const b of [4.6, 5.0])
      for (const sOff of [0.5, 0.9, 1.4, 2.0])
        for (const c of [9, 12, 15])
          for (const mOff of [2, 6, 12, 18]) {
            const s = b + sOff;
            const m = c + mOff;
            const stampEnd = c + 7;
            const frames = staleSurfaceProgramme(dip, b, s, c, m, stampEnd);
            // The verifier's control: the weather's absorbing bill on the live programme, then one frame later.
            let st = createRuleEngine();
            let condBill: number | null = null;
            for (const x of frames) {
              const r = reduceTick(st, x);
              st = r.state;
              for (const e of viol(r.events)) if (e.code === COND && condBill === null && e.t > 4) condBill = e.t;
            }
            const s2 = condBill !== null ? Math.round((condBill + 0.2) * 10) / 10 : s;
            out.push({ tag: `dip ${dip} blow ${b} stamp ${s} bend ${c} mark ${m}`, m, frames, control: staleSurfaceProgramme(dip, b, Math.max(s, s2), c, m, stampEnd) });
          }
  return out;
}

// ---------------------------------------------------------------------------
// THE GENERATED PROGRAMMES (property census, round 11)
// ---------------------------------------------------------------------------

/** mulberry32 — the verifiers' seeded generator. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Latch {
  id: number;
  cap: number;
  graded: boolean;
}

/**
 * One seeded drive at 10 Hz. It is built from PHASES — cruises, dips under one
 * line, blows (a task mark passed over its cap: the arrival, on one frame), and
 * named stretches (the current latch stamping the car, the sign raised past a
 * sign-bound cap) — over a posted sign, weather windows (rain, sometimes fog) and
 * bend windows. The speeds are drawn around the lines that matter on each phase
 * (the sign and its grace band, the weather envelope, the bend's advisory, the
 * task's shown figure and bill line), so every comparison the ledger makes is
 * crossed from both sides, and short dips cross them for a frame or a few. Two shapes are placed on
 * purpose, because chance alone rarely builds them: a HELD stretch (the sign raised just above a sign-bound
 * cap, the car over both inside the sign's grace band, so the M-16 act — and a waiting arrival — runs on for
 * as long as the latch stamps), and a later blow on the very frame a weather or bend episode first bills. A third is
 * placed only in the SPEED-BLOW family (`opts.speedBlow`, the resumed round 11's SF4 class): a sign-bound blow whose
 * arrival waits while the car holds the speeding band from the blow on, and a SECOND sign-bound blow on the frame the
 * SPEEDING_* bill lands, the frame before it or the frame after it — the frame a drive may END on. Without the option
 * the random stream is untouched, so seed N is the same drive it was.
 *
 * What the lesson guarantees and the programme keeps (so no programme is one the
 * product cannot produce): a latch stamps only after its blow and only until the
 * next blow (a newer latch is never followed by an older one's stamp), a stamp
 * appears only where the sign is above its cap, and the arrival rides only the
 * blow frame, at a speed over the cap plus its slack.
 */
export function generateProgramme(seed: number, opts: { speedBlow?: boolean } = {}): SimTick[] {
  const r = rng(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const S0 = pick([50, 50, 50, 60, 70, 90]);
  const fogProgramme = r() < 0.15;
  const T10 = (28 + Math.floor(r() * 28)) * 10;
  const frames: SimTick[] = [];
  let i = 0;
  let latch: Latch | null = null;
  let stampPhases = 0; // how many phases the current latch still stamps (graded)
  let wet = r() < 0.4;
  let bendAdv: number | undefined = undefined;
  let blows = 0;
  const maxBlows = pick([1, 1, 2, 2, 3, 4]);
  let lastSpeed = S0 - 5;
  let lastBlowI = -100;
  while (i < T10) {
    // weather and bend windows persist across phases and toggle now and then
    if (r() < 0.22) wet = !wet;
    if (r() < 0.28) bendAdv = bendAdv === undefined ? Math.max(20, pick([S0 - 12, S0 - 20, 30, 40, S0 - 8])) : undefined;
    const kindRoll = r();
    const canBlow = blows < maxBlows && i > 5 && i - lastBlowI >= 10;
    const kind: "blow" | "stretch" | "dip" | "recover" | "cruise" | "kinBlow" | "speedBlow" =
      opts.speedBlow === true && canBlow && kindRoll < 0.12
        ? "speedBlow"
        : canBlow && (wet || bendAdv !== undefined) && kindRoll < 0.06
        ? "kinBlow"
        : canBlow && kindRoll < 0.16
          ? "blow"
          : latch !== null && kindRoll < 0.36
            ? "stretch"
            : kindRoll < 0.56
              ? "dip"
              : kindRoll < 0.68
                ? "recover"
                : "cruise";
    let S = S0;
    let raiseSign = false;
    // A HELD stretch: the sign raised just above a sign-bound cap, so the car over the cap's line is over the sign too
    // (inside its grace band — no speeding bill) and the M-16 act runs on while the latch stamps it.
    const held = kind === "stretch" && latch !== null && !latch.graded && r() < 0.4;
    if (kind === "stretch" && latch !== null && !latch.graded) raiseSign = r() < 0.85;
    else if (r() < 0.1) raiseSign = true;
    if (raiseSign) S = S0 + pick([20, 20, 30]);
    if (held && latch !== null) S = latch.cap + pick([2, 3, 4]);
    const weather = wet ? (fogProgramme && r() < 0.5 ? { fog: true } : { rain: true }) : {};
    const factor = "fog" in weather ? 0.6 : "rain" in weather ? 0.85 : 1;
    const E = factor < 1 ? S * factor : null;
    const g = Math.min(S * 0.1, 5);
    const adv = bendAdv;
    const stamping = latch !== null && S > latch.cap && (kind === "stretch" || (latch.graded && stampPhases > 0));
    const lines: number[] = [S - 4, S - 1.5, S, S + 1, S + g - 0.5, S + g + 1.5, S + 9, S + 15];
    if (E !== null) lines.push(E - 2, E - 0.5, E + 0.7, E + 3, E + 6);
    if (adv !== undefined) lines.push(adv - 1, adv + 2, adv + 5.5, adv + 9, adv + 14);
    if (stamping && latch !== null) lines.push(latch.cap - 2, latch.cap + 2, latch.cap + 5.7, latch.cap + 9, latch.cap + 13);
    const speeds = lines.filter((v) => v >= 12).map((v) => Math.round(v * 10) / 10);
    const over = (extra: Record<string, unknown>): Record<string, unknown> => ({
      maxSpeedKmh: S,
      ...weather,
      ...(adv !== undefined ? { curveAdvisoryKmh: adv } : {}),
      ...(stamping && latch !== null ? { taskSpeedCap: { capKmh: latch.cap, shownKmh: latch.cap, graceKmh: 5, blownAtSec: latch.id } } : {}),
      ...extra,
    });
    if (kind === "speedBlow") {
      // Dry and straight: 4.1 s at the sign's figure less 5 (the M-16 act closed, the speeding re-armed), a sign-bound
      // blow at `av` — over the cap plus its slack and over the speeding band, so the speeding's sustain starts on the
      // blow frame and the arrival WAITS — held for 18, 19 or 20 frames, then a second sign-bound blow on the next frame:
      // the speeding's 2 s bill frame, the one before it, or the one after it.
      for (let j = 0; j < 41 && i < T10; j++, i++) frames.push(tick(i / 10, { maxSpeedKmh: S, speedKmh: S - 5 } as Partial<SimTick>));
      if (i + 22 >= T10) continue;
      const cap = S;
      const av = Math.round((cap + Math.max(g, 5) + 0.6 + r() * 3) * 100) / 100;
      const nHold = pick([18, 19, 20]);
      const t1 = i / 10;
      frames.push(tick(t1, { maxSpeedKmh: S, speedKmh: av, taskCapArrival: { capKmh: cap, shownKmh: cap, graceKmh: 5, blownAtSec: t1, arrivalKmh: av } } as Partial<SimTick>));
      i++;
      for (let j = 0; j < nHold; j++, i++) frames.push(tick(i / 10, { maxSpeedKmh: S, speedKmh: av } as Partial<SimTick>));
      const t2 = i / 10;
      const av2 = Math.round((av + 0.5) * 100) / 100;
      frames.push(tick(t2, { maxSpeedKmh: S, speedKmh: av2, taskCapArrival: { capKmh: cap, shownKmh: cap, graceKmh: 5, blownAtSec: t2, arrivalKmh: av } } as Partial<SimTick>));
      i++;
      latch = { id: t2, cap, graded: false };
      stampPhases = 0;
      blows += 2;
      lastBlowI = i - 1;
      continue;
    }
    if (kind === "kinBlow") {
      // A weather (or bend) episode started from under its line and held over it to its first bill; the blow — a
      // sign-bound mark, a later one if an arrival already waits — on the frame after the last held frame, which is the
      // bill's frame or the one before it (the sustain's float edge).
      const useBend = adv !== undefined && (E === null || r() < 0.5);
      const kinLine = useBend && adv !== undefined ? adv + 5 : (E ?? S);
      const vHold = Math.round(Math.max(kinLine + 3, S + 1) * 10) / 10;
      const nHold = useBend ? pick([14, 15, 16]) : pick([29, 30, 31]);
      frames.push(tick(i / 10, { ...over({}), speedKmh: Math.max(12, Math.round((kinLine - (useBend ? 6 : 2)) * 10) / 10) } as Partial<SimTick>));
      i++;
      for (let j = 0; j < nHold && i < T10; j++, i++) frames.push(tick(i / 10, { ...over({}), speedKmh: vHold } as Partial<SimTick>));
      if (i >= T10) continue;
      const t = i / 10;
      const cap = S;
      const av = Math.round(Math.max(cap + 5 + 0.3 + r() * 6, vHold) * 100) / 100;
      const blowFrame: Record<string, unknown> = { ...over({}), speedKmh: av, taskCapArrival: { capKmh: cap, shownKmh: cap, graceKmh: 5, blownAtSec: t, arrivalKmh: av } };
      delete blowFrame.taskSpeedCap;
      latch = { id: t, cap, graded: false };
      stampPhases = 0;
      blows++;
      lastBlowI = i;
      frames.push(tick(t, blowFrame as Partial<SimTick>));
      i++;
      continue;
    }
    if (kind === "blow") {
      // A task mark passed over its cap: sign-bound (the cap at or above the sign) or graded (under it).
      const t = i / 10;
      const type = pick(["sign", "sign", "above", "graded", "graded"] as const);
      const cap = type === "sign" ? S : type === "above" ? S + 3 : Math.max(20, S - pick([10, 15, 20]));
      const av = Math.round((cap + 5 + 0.3 + r() * 6) * 100) / 100;
      // The blow frame carries the NEW latch only: its stamp if graded (the sign above its cap), none otherwise.
      const blowFrame: Record<string, unknown> = { ...over({}), speedKmh: av, taskCapArrival: { capKmh: cap, shownKmh: cap, graceKmh: 5, blownAtSec: t, arrivalKmh: av } };
      delete blowFrame.taskSpeedCap;
      if (cap < S) blowFrame.taskSpeedCap = { capKmh: cap, shownKmh: cap, graceKmh: 5, blownAtSec: t };
      latch = { id: t, cap, graded: cap < S };
      stampPhases = latch.graded ? 1 + Math.floor(r() * 4) : 0;
      blows++;
      lastBlowI = i;
      frames.push(tick(t, blowFrame as Partial<SimTick>));
      i++;
      lastSpeed = av;
      continue;
    }
    let n: number;
    let v: number;
    if (kind === "dip") {
      n = 1 + Math.floor(r() * 8);
      const ref = pick([S, E ?? S, adv ?? S, latch !== null ? latch.cap : S]);
      v = Math.max(12, Math.round((ref - 0.5 - r() * 2.5) * 10) / 10);
    } else if (kind === "recover") {
      n = 40 + Math.floor(r() * 30);
      v = Math.max(12, S - pick([3, 6, 10]));
    } else if (held && latch !== null) {
      n = pick([40, 60, 90, 120]);
      v = Math.round(pick([latch.cap + 5.7, S + 1, S + g - 0.5].filter((x) => x > S && x > latch!.cap + 5)) * 10) / 10;
    } else {
      n = pick([3, 5, 10, 15, 20, 30, 31, 40, 41, 60, 80]);
      v = pick(speeds);
    }
    for (let j = 0; j < n && i < T10; j++, i++) frames.push(tick(i / 10, { ...over({}), speedKmh: v } as Partial<SimTick>));
    lastSpeed = v;
    if (stamping && latch !== null && latch.graded) stampPhases--;
  }
  void lastSpeed;
  // A dry, straight, slow tail: every act can end inside the drive.
  for (let j = 0; j < 80; j++, i++) frames.push(tick(i / 10, { maxSpeedKmh: S0, speedKmh: Math.max(12, S0 - 10) } as Partial<SimTick>));
  return frames;
}

// (THE FLAG WATCH of rounds 11–13 — `watchFlags`, every owner- or latch-scoped flag of the kin act — was removed in
// round 14 with the kin ledger itself: founder ruling 2026-10-03, «Cap adds, never removes». The cap ledger has no
// owners, lapses or surface flags to go stale.)
