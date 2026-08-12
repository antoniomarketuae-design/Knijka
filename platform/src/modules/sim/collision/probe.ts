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
 */

import {
  CONTACT_TOLERANCE_M,
  obbDiscSeparationM,
  obbSeparationM,
  sweptObbDiscSeparationM,
  sweptObbSeparationM,
  type Obb2D,
  type SweepPose,
} from "./obb";

interface PosePair {
  player: SweepPose;
  actor: SweepPose;
}

/** Does this signed separation count as contact? (Real contact is overlap.) */
export function isContact(separationM: number): boolean {
  return separationM <= CONTACT_TOLERANCE_M;
}

export class ContactProbe {
  private readonly prev = new Map<string, PosePair>();

  /** Forget every remembered pose (call on (re-)stage — a reset TELEPORTS). */
  reset(): void {
    this.prev.clear();
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
        : sweptObbSeparationM(last.player, player, last.actor, actor);
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
        : sweptObbDiscSeparationM(last.player, player, last.actor, discX, discY, radiusM);
    this.remember(key, last, player.x, player.y, player.headingDeg, discX, discY, 0);
    return sep;
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
