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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO SWEEP-161 FINDINGS WERE ROUTED HERE. THIS MODULE IS THE INSTRUMENT
 * CLUSTER, AND NEITHER FINDING IS ABOUT AN INSTRUMENT — 2026-08-20.
 *
 * „cockpit" names two different things in this repo and the routing collapsed
 * them. `modules/sim/cockpit` is the 3D „Виток" CLUSTER — dial, atlas, needle,
 * lamp bank, readout — and every export below is one of those five files. The
 * CABIN (windscreen, pillars, mirrors, dashboard shell) is
 * `modules/sim/scene/vitok/*` + `components/sim/vitok/VitokCockpit.tsx`.
 * Both findings are about the cabin. Both were opened, and both frames read.
 *
 * ── 1 · sc-ac-wind-truck-pass/mobile-wrong/04-t034s.png — REAL, NOT HERE ────
 *   „A large untextured translucent grey quad hangs across the upper half of
 *    the view, starting at the A-pillar and extending far into the sky over the
 *    fields — the windscreen glass plane is not clipped to the screen aperture."
 *
 *   Confirmed on the frame: a hard-edged translucent sheet from the A-pillar
 *   across roughly 1600 px of a 2556 px landscape frame, over sky and field
 *   alike, with the pillar frame visibly INSIDE it. It is the cabin's
 *   windscreen glass, so it belongs to the GLB and its material in
 *   `components/sim/vitok/VitokCockpit.tsx` (the traverse that retargets the
 *   cabin's meshes), not to any cluster export. Same artifact in truck-spray
 *   and city-run mobile, as the finding says — i.e. cabin-wide, which is
 *   itself evidence it is not cluster geometry.
 *
 * ── 2 · sc-vu-cyclist-hook/pc-right/01-arrival.png — REFUTED ────────────────
 *   „Instruction 2 tells the student to check the right-hand mirror before
 *    turning, but the cockpit renders no right door mirror in the forward view
 *    … The lesson asks for a control the cockpit does not show."
 *
 *   The right door mirror EXISTS and is deliberately off the forward frame:
 *   `scene/vitok/cabinLook.test.ts` has pinned „the right door mirror is off
 *   the RIGHT of the driving frame" (`hotspotIsReachable("hotspot_mirror_right",
 *   "forward") === false`) since that reach table shipped, and at the reference
 *   16:9 window SIX controls need a head turn, both door mirrors among them.
 *   Looking right is a POSE (`mirrorRight`), not a glance at the glass.
 *
 *   And the control for it is on the cited frame. Bottom-left of that very
 *   stage sit «Л Q · З F · Д E» — `GlanceEdgePings`' `data-hud="glance-buttons"`
 *   hold-to-glance cluster, whose Д button is `mirror="right"` driving the same
 *   graded `CabinControls.glanceStart` the E key drives. The lesson asks for a
 *   control the product renders, in shot, at the moment of the complaint.
 *
 *   WHAT SURVIVES is a copy question, not a geometry one: instruction 2 says
 *   „провери дясното огледало" without saying that on this screen that is a
 *   head turn. If that is worth fixing it is fixed in the lesson text
 *   (`lessons/scenario/templates-vu*.ts`), never by moving a mirror into a
 *   forward view a real driver does not have one in.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export {
  ATLAS_H,
  ATLAS_W,
  BEZEL_W,
  CHAR_INK_H_FRACTION,
  CHAR_INK_W_FRACTION,
  CLUSTER_PALETTE,
  DIAL_CX,
  DIAL_CY,
  DIAL_MAX_KMH,
  DIAL_NUM_R,
  DIAL_NUMERALS_MIN_FACE_CSS_PX,
  FACE_H,
  FACE_W,
  GLANCE_FLOOR_CSS_PX,
  LAMP_KEYS,
  NEEDLE_Z,
  TICK_COUNT,
  cellUv,
  charCell,
  dialAngleRad,
  dialNumeralsLegibleAt,
  inkHeightCssPx,
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
  type ClusterFaceOptions,
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
