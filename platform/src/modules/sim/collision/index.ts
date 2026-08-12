/**
 * sim/collision — public API (module barrel, docs/architecture/05).
 *
 * Exact 2D body geometry for contact adjudication: oriented-bounding-box SAT
 * with a SIGNED separation (positive = metres of air, negative = penetration
 * depth), a box-vs-disc test for pedestrians, and a swept variant that closes
 * the between-frames tunnelling hole. See obb.ts for the defect this replaces
 * and bodies.ts for where every dimension is measured from.
 */

export {
  CONTACT_TOLERANCE_M,
  obbDiscSeparationM,
  obbOverlap,
  obbSeparationM,
  SWEEP_MAX_STEPS,
  SWEEP_RESOLUTION_M,
  SWEEP_TELEPORT_M,
  sweptObbDiscSeparationM,
  sweptObbSeparationM,
  type Obb2D,
  type SweepPose,
} from "./obb";

export {
  actorObb,
  headingOfDir,
  NPC_VEHICLE_SHELL_HALF_LENGTH_M,
  NPC_VEHICLE_SHELL_HALF_WIDTH_M,
  PEDESTRIAN_BODY_RADIUS_M,
  playerObb,
  PLAYER_HALF_LENGTH_M,
  PLAYER_HALF_WIDTH_M,
  type ActorPose,
} from "./bodies";

export { ContactProbe, isContact } from "./probe";
