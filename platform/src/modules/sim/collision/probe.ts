/**
 * sim/collision/probe — the per-encounter memory the swept test needs.
 *
 * `sweptObbSeparationM` is pure and needs the PREVIOUS pose pair. A staged-event
 * runner is the natural owner of that memory: one probe per runner instance,
 * keyed by actor id (an oncoming stream watches several cars at once), cleared
 * whenever the encounter re-stages so a teleported actor never sweeps across
 * the player on the retry frame.
 *
 * Deterministic: no clock, no RNG, no module state — same frames in, same
 * numbers out, which is what the replay gates depend on.
 *
 * ---------------------------------------------------------------------------
 * THE SWEEP USED TO SWITCH ITSELF OFF ON EXACTLY THE FRAMES THAT NEEDED IT
 * (sweep161, part F — «same lesson, same scripted drive, opposite verdicts by
 * platform»; sc-hz-accident-scene, sc-signal-response, sc-turn-left-oncoming).
 *
 * `sweptObbSeparationM` refuses to sweep an interval whose RELATIVE travel
 * exceeds `SWEEP_TELEPORT_M` (12 m) and returns the current pose pair alone
 * instead — the right call, because such a jump used to be impossible for real
 * motion and could therefore only be a re-stage. 12 m was derived from the
 * lesson clock's own ceiling: 82.8 m/s of closing speed × the director's
 * `Math.min(delta, 0.1)` clamp = 8.28 m, rounded up.
 *
 * THAT CLAMP NO LONGER EXISTS. On 2026-08-16 the lesson clock stopped guessing
 * and started advancing by the world time the physics actually integrated —
 * `sessionClockAdvance`, capped by @react-three/rapier's own
 * `clamp(dt, 0, 0.5)`. One render frame may now hand the director HALF A SECOND
 * (lesson-ui/sessionClock.ts, measured: the PC render graph costs 2.33 s/frame
 * at dsf1 and 3.57 s/frame at dsf2 on staging). The same 82.8 m/s — player
 * terminal 46.8 m/s (tuning.ts: 168.4 km/h) plus the fastest authored
 * `cruiseSpeedMps` of 36 — is now worth 41.4 m per tick, not 8.28 m. The
 * teleport branch went from unreachable to ROUTINE on a slow PC frame, and
 * every time it fires the exact geometry silently degrades to a single-pose
 * sample.
 *
 * MEASURED here, driving two cars nose-to-nose down one lane through this
 * probe until they pass through each other (`__tests__/probe.test.ts`):
 *
 *   tick     each car   relative travel   min separation   crash reported
 *   1/60 s    50 km/h        0.46 m          −1.770 m           YES
 *   0.100 s   50 km/h        2.78 m          −1.770 m           YES
 *   0.250 s   50 km/h        6.94 m          −1.770 m           YES
 *   0.500 s   50 km/h       13.89 m          +0.930 m           NO   ← over 12
 *   0.500 s   90 km/h       25.00 m          +0.930 m           NO
 *   0.500 s  168 km/h       46.67 m         +15.930 m           NO
 *
 * A head-on collision, reported as sixteen metres of clear air, on the machines
 * least able to afford the frame time. Same drive, same geometry, verdict
 * decided by the frame rate — which is the founder's complaint verbatim.
 *
 * THE FIX IS NOT A BIGGER THRESHOLD. Loosening `SWEEP_TELEPORT_M` would sweep
 * genuine teleports too, and inventing a crash out of a re-stage is the same
 * crime in the other direction. What the geometry needs is simply to be ASKED
 * about the whole interval, and this file — which owns the two poses — is the
 * only place that can ask. A long interval is SUBDIVIDED into chunks small
 * enough that each one is real motion by `obb.ts`'s own rule, and the answer is
 * the minimum over them. `obb.ts` is untouched, its teleport guard still holds
 * on every call it receives, and a frame short enough to sweep in one call —
 * anything under 12 m of relative travel, which at the sim's worst-case
 * 82.8 m/s closing means every frame above 7 fps and at 50 km/h street speeds
 * every frame above about 2 — takes the identical code path and returns the
 * identical number, bit for bit, that it always did.
 *
 * THOSE TWO FRAME RATES ARE FLOORS, NOT THRESHOLDS, and for the reason the
 * `SWEEP_FRAME_TRAVEL_M` note below is about: they convert 12 m at closing
 * speed and ignore the ROTATION term `relativeTravelM` adds on top, so a
 * spinning body crosses 12 m of relative travel at a higher frame rate than
 * either number suggests. Nothing above is wrong — subdivision is what happens
 * past the line, and it returns the same answer more expensively — but do not
 * read „7 fps" as the rate at which the cheap path stops being taken.
 */

import {
  CONTACT_TOLERANCE_M,
  obbDiscSeparationM,
  obbSeparationM,
  SWEEP_TELEPORT_M,
  sweptObbDiscSeparationM,
  sweptObbSeparationM,
  type Obb2D,
  type SweepPose,
} from "./obb";

interface PosePair {
  player: SweepPose;
  actor: SweepPose;
}

const DEG = Math.PI / 180;

/**
 * Relative travel per SUBDIVIDED chunk, m — half `obb.ts`'s per-call teleport
 * cap, for two reasons that happen to give the same number:
 *
 *   · a chunk must never be rejected as a teleport by the call it is handed to,
 *     and a factor of two keeps it clear of the boundary rather than resting a
 *     verdict on the last bit of a float;
 *   · 6 m / `SWEEP_RESOLUTION_M` = 40 sub-samples, under the `SWEEP_MAX_STEPS`
 *     ceiling of 48 — so every chunk is sampled at the FULL 0.15 m resolution
 *     and a subdivided hitch frame is exactly as fine-grained as a 60 fps one.
 *     Above the cap the sampling would coarsen with the frame rate, which is
 *     the very dependence this subdivision exists to remove.
 */
export const SWEEP_CHUNK_TRAVEL_M = SWEEP_TELEPORT_M / 2;

/**
 * The most relative travel ONE observed interval may contain and still be
 * treated as motion, m. Past this the remembered pose is not the previous
 * frame — it is a re-stage, a respawn, or a gap in observation — and the
 * fallback is the current pose alone, exactly as `obb.ts` has always done.
 *
 * This is `SWEEP_TELEPORT_M` re-derived under the clock that ships today and
 * nothing more: 12 m answered a 0.1 s director tick, the tick is now capped at
 * rapier's 0.5 s, 12 × (0.5 / 0.1) = 60.
 *
 * HOW MUCH ROOM THAT LEAVES — stated HERE and nowhere else, because it used to
 * be stated in two files and the two disagreed. This comment read „the physical
 * worst case it has to cover is 82.8 m/s × 0.5 s = 41.4 m, so the margin over
 * reality is the same ~45 % the 12 was chosen with", and 41.4 m is not the
 * quantity `sweepChunks` compares against this constant. `relativeTravelM`,
 * thirty lines below, adds to that translation a ROTATION term PER BODY —
 * headingSpanDeg × DEG × hypot(halfLengthM, halfWidthM) — and headingSpanDeg is
 * a shortest arc, so it saturates at 180° and the term is bounded exactly by
 * π × hypot(half-extents): 6.885 m for the player before the other body is
 * counted at all, 22.286 m for a tram.
 *
 * MEASURED 2026-08-19 over every (fleet profile × its own fastest authored
 * `cruiseSpeedMps`) pair the scenario bank can stage, the binding case is the
 * TRAM at 57.810 m against this 60 — a true margin of 3.8 %, where the
 * translation-only arithmetic said 45 %. The overstatement was twelvefold, and
 * a margin overstated twelvefold is worse than none, because the next reader
 * budgets against it: a tram authored at 12 m/s (43 km/h, an ordinary number)
 * already lands on 58.81 m and eats the rest.
 *
 * `__tests__/index.test.ts` recomputes that figure on every run from the files
 * that own its two live inputs — `PHYSICS_MAX_FRAME_DT` out of
 * lesson-ui/sessionClock.ts and the speeds out of the scenario bank — and pins
 * the sentence above against the result, so the number cannot go stale behind
 * the clock or the content; the same test forbids the barrel to publish a
 * second one. Agreement is by construction, not by remembering to edit both.
 */
export const SWEEP_FRAME_TRAVEL_M = SWEEP_TELEPORT_M * 5;

/** Does this signed separation count as contact? (Real contact is overlap.) */
export function isContact(separationM: number): boolean {
  return separationM <= CONTACT_TOLERANCE_M;
}

// ---------------------------------------------------------------------------
// Interpolation, mirroring obb.ts's own private helpers verbatim so a chunk
// boundary lands on precisely the pose obb.ts would have sub-sampled there.
// They are duplicated rather than imported because obb.ts belongs to another
// lane this wave; when the two files next meet, export them and delete these.
// ---------------------------------------------------------------------------

/** Shortest-arc angular span between two headings, degrees (0..180). */
function headingSpanDeg(from: number, to: number): number {
  return Math.abs(((((to - from) % 360) + 540) % 360) - 180);
}

function lerpHeadingDeg(from: number, to: number, t: number): number {
  const d = ((((to - from) % 360) + 540) % 360) - 180;
  return from + d * t;
}

/**
 * Relative travel between the remembered pose pair and the current one, m —
 * `obb.ts`'s `relativeTravelM`: centre displacement of one body relative to the
 * other, plus the arc each body's far corner swept while rotating. The probe
 * has to compute it here too, because the number decides HOW MANY chunks the
 * interval is worth before `obb.ts` is called at all.
 */
function relativeTravelM(
  last: PosePair,
  player: Obb2D,
  ax: number,
  ay: number,
  ah: number,
  aHalfLengthM: number,
  aHalfWidthM: number,
): number {
  const rx = player.x - last.player.x - (ax - last.actor.x);
  const ry = player.y - last.player.y - (ay - last.actor.y);
  const spinP =
    headingSpanDeg(last.player.headingDeg, player.headingDeg) *
    DEG *
    Math.hypot(player.halfLengthM, player.halfWidthM);
  const spinA =
    headingSpanDeg(last.actor.headingDeg, ah) * DEG * Math.hypot(aHalfLengthM, aHalfWidthM);
  return Math.hypot(rx, ry) + spinP + spinA;
}

/**
 * Chunks this interval is worth: 1 when it is short enough for `obb.ts` to
 * sweep in one call (the overwhelmingly common case, and byte-identical to the
 * behaviour before subdivision existed), 0 when it is too long to be motion at
 * all and the caller must fall back to the current pose alone.
 */
function sweepChunks(travelM: number): number {
  if (!(travelM > SWEEP_TELEPORT_M)) return 1;
  if (travelM > SWEEP_FRAME_TRAVEL_M) return 0;
  return Math.ceil(travelM / SWEEP_CHUNK_TRAVEL_M);
}

export class ContactProbe {
  private readonly prev = new Map<string, PosePair>();
  // Scratch for the subdivided sweep. Allocated once per probe, never per
  // frame: the subdivided path only runs on a hitch frame, but a hitch frame is
  // the last place to be handing the collector work.
  private readonly chunkPrevA: SweepPose = { x: 0, y: 0, headingDeg: 0 };
  private readonly chunkPrevB: SweepPose = { x: 0, y: 0, headingDeg: 0 };
  private readonly chunkA: Obb2D = { x: 0, y: 0, headingDeg: 0, halfLengthM: 0, halfWidthM: 0 };
  private readonly chunkB: Obb2D = { x: 0, y: 0, headingDeg: 0, halfLengthM: 0, halfWidthM: 0 };

  /** Forget every remembered pose (call on (re-)stage — a reset TELEPORTS). */
  reset(): void {
    this.prev.clear();
  }

  /**
   * Forget ONE actor's remembered pose — for the caller that stops watching a
   * body for a while (an actor that leaves the world, an encounter skipped for
   * a few frames) and then resumes. Without it the next call sweeps across the
   * whole unobserved interval as though it were one frame, which drags the two
   * bodies through each other and INVENTS the contact: measured here, a walker
   * standing on the centreline that the caller skipped for 12 m of the player's
   * approach comes back reporting −0.070 m of penetration where the two bodies
   * are in fact 3.680 m apart.
   */
  forget(key: string): void {
    this.prev.delete(key);
  }

  /**
   * Signed separation, m, between the player box and one actor box, swept from
   * last frame's pose pair (< 0 = penetration; see obbSeparationM).
   */
  vehicleSeparationM(key: string, player: Obb2D, actor: Obb2D): number {
    const last = this.prev.get(key);
    const sep =
      last === undefined
        ? obbSeparationM(player, actor)
        : this.sweepVehicle(last, player, actor);
    this.remember(key, last, player.x, player.y, player.headingDeg, actor.x, actor.y, actor.headingDeg);
    return sep;
  }

  /**
   * Signed separation, m, between the player box and a DISC actor (pedestrian),
   * swept from last frame's pose pair.
   */
  discSeparationM(
    key: string,
    player: Obb2D,
    discX: number,
    discY: number,
    radiusM: number,
  ): number {
    const last = this.prev.get(key);
    const sep =
      last === undefined
        ? obbDiscSeparationM(player, discX, discY, radiusM)
        : this.sweepDisc(last, player, discX, discY, radiusM);
    this.remember(key, last, player.x, player.y, player.headingDeg, discX, discY, 0);
    return sep;
  }

  /**
   * The swept minimum over the whole remembered interval, subdivided if it is
   * longer than one `obb.ts` call will sweep. One chunk is the ordinary frame
   * and calls straight through; zero chunks is a jump too long to be motion.
   */
  private sweepVehicle(last: PosePair, player: Obb2D, actor: Obb2D): number {
    const travel = relativeTravelM(
      last,
      player,
      actor.x,
      actor.y,
      actor.headingDeg,
      actor.halfLengthM,
      actor.halfWidthM,
    );
    const chunks = sweepChunks(travel);
    if (chunks === 0) return obbSeparationM(player, actor);
    if (chunks === 1) return sweptObbSeparationM(last.player, player, last.actor, actor);
    let best = Infinity;
    for (let i = 0; i < chunks; i++) {
      this.lerpPose(this.chunkPrevA, last.player, player.x, player.y, player.headingDeg, i / chunks);
      this.lerpPose(this.chunkPrevB, last.actor, actor.x, actor.y, actor.headingDeg, i / chunks);
      const t1 = (i + 1) / chunks;
      this.lerpObb(this.chunkA, last.player, player, t1);
      this.lerpObb(this.chunkB, last.actor, actor, t1);
      const sep = sweptObbSeparationM(this.chunkPrevA, this.chunkA, this.chunkPrevB, this.chunkB);
      if (sep < best) best = sep;
      if (best <= CONTACT_TOLERANCE_M) return best; // already contact
    }
    return best;
  }

  /** `sweepVehicle` for a box against a DISC (pedestrian). */
  private sweepDisc(
    last: PosePair,
    player: Obb2D,
    discX: number,
    discY: number,
    radiusM: number,
  ): number {
    const travel = relativeTravelM(last, player, discX, discY, 0, radiusM, radiusM);
    const chunks = sweepChunks(travel);
    if (chunks === 0) return obbDiscSeparationM(player, discX, discY, radiusM);
    if (chunks === 1) {
      return sweptObbDiscSeparationM(last.player, player, last.actor, discX, discY, radiusM);
    }
    let best = Infinity;
    for (let i = 0; i < chunks; i++) {
      const t0 = i / chunks;
      const t1 = (i + 1) / chunks;
      this.lerpPose(this.chunkPrevA, last.player, player.x, player.y, player.headingDeg, t0);
      this.lerpPose(this.chunkPrevB, last.actor, discX, discY, 0, t0);
      this.lerpObb(this.chunkA, last.player, player, t1);
      const sep = sweptObbDiscSeparationM(
        this.chunkPrevA,
        this.chunkA,
        this.chunkPrevB,
        last.actor.x + (discX - last.actor.x) * t1,
        last.actor.y + (discY - last.actor.y) * t1,
        radiusM,
      );
      if (sep < best) best = sep;
      if (best <= CONTACT_TOLERANCE_M) return best;
    }
    return best;
  }

  /** Pose at fraction `t` of the interval, into `out`. */
  private lerpPose(
    out: SweepPose,
    from: SweepPose,
    toX: number,
    toY: number,
    toH: number,
    t: number,
  ): void {
    out.x = from.x + (toX - from.x) * t;
    out.y = from.y + (toY - from.y) * t;
    out.headingDeg = lerpHeadingDeg(from.headingDeg, toH, t);
  }

  /** Same, keeping the body's dimensions — the chunk's END pose. */
  private lerpObb(out: Obb2D, from: SweepPose, to: Obb2D, t: number): void {
    out.x = from.x + (to.x - from.x) * t;
    out.y = from.y + (to.y - from.y) * t;
    out.headingDeg = lerpHeadingDeg(from.headingDeg, to.headingDeg, t);
    out.halfLengthM = to.halfLengthM;
    out.halfWidthM = to.halfWidthM;
  }

  private remember(
    key: string,
    last: PosePair | undefined,
    px: number,
    py: number,
    ph: number,
    ax: number,
    ay: number,
    ah: number,
  ): void {
    if (last === undefined) {
      this.prev.set(key, {
        player: { x: px, y: py, headingDeg: ph },
        actor: { x: ax, y: ay, headingDeg: ah },
      });
      return;
    }
    last.player.x = px;
    last.player.y = py;
    last.player.headingDeg = ph;
    last.actor.x = ax;
    last.actor.y = ay;
    last.actor.headingDeg = ah;
  }
}
