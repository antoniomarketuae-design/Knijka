/**
 * Cockpit instrument cluster — the public API of the 3D „Виток" cluster.
 *
 * The cluster is a PRESENTATION module: it reads vehicle state that already
 * exists (speed, selector, seatbelt, parking brake, ignition, the cabin blink
 * clock, the director's staged telltale) and turns it into geometry. It grades
 * nothing and it is read by nothing that grades — the rule-engine verdicts are
 * outside this boundary entirely.
 *
 * Consumers: components/sim/cockpit/InstrumentCluster.tsx (the R3F mount) and
 * its tests. Everything else imports through this file, per doc 05.
 */

export {
  ATLAS_H,
  ATLAS_W,
  BEZEL_W,
  CLUSTER_PALETTE,
  DIAL_CX,
  DIAL_CY,
  DIAL_MAX_KMH,
  DIAL_NUM_R,
  FACE_H,
  FACE_W,
  LAMP_KEYS,
  NEEDLE_Z,
  TICK_COUNT,
  cellUv,
  charCell,
  dialAngleRad,
  tickIsMajor,
  tickNumeral,
  tickSpeedKmh,
  type AtlasCell,
  type LampKey,
} from "./clusterLayout";

export {
  buildClusterFaceMesh,
  buildClusterHousingMesh,
  buildClusterNeedleMesh,
  hexRgba,
  writeQuadColor,
  writeQuadUv,
  type ClusterFaceMesh,
  type ClusterHousingMesh,
  type ClusterNeedleMesh,
  type Rgba,
} from "./clusterGeometry";

export {
  clusterReadout,
  clusterReadoutHash,
  createClusterInputs,
  createClusterReadout,
  gearGlyph,
  lampBank,
  litTickCount,
  speedDigits,
  type ClusterInputs,
  type ClusterReadout,
  type LampBank,
  type LampState,
  type LampTone,
} from "./clusterReadout";

export { drawClusterAtlas } from "./clusterAtlas";

export {
  applyClusterDevSeed,
  parseClusterDevSeed,
  readClusterDevSeed,
  type ClusterDevSeed,
} from "./clusterDevSeed";
