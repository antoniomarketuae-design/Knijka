// Cockpit hotspots (A2, doc 69 — the naming contract is LOAD-BEARING).
//
// Data + context only; the meshes live in VitokCockpit (CockpitHotspots).
// Each hotspot is an invisible raycast proxy box (slightly larger than its
// control for fat-finger tolerance — the P1 touch layer inherits them) named
// EXACTLY per the doc-69 contract, plus a small VISIBLE control body so the
// dash isn't a bare slab (stalks, starter, hazard triangle, door-mirror
// housings). When the authored GT-E interior lands (A3) it must expose the
// same node names and this file's geometry disappears.
//
// Actions map 1:1 onto CabinControls' public methods / DrivelineState
// commands — the SAME transitions the keyboard drives, so the procedure
// observer (modules/sim/procedures/performedSteps.ts) cannot tell a click
// from a keypress. Mirror hotspots fire cabin.glance(...): the already-graded
// mirror path (rule-engine sample + camera head-turn).
//
// Frame reminder (tuning.ts / parts.ts): chassis-local metres, +X = car LEFT,
// +Z = forward; the driver (LHD) sits at x +0.34, eye at COCKPIT_EYE
// (0.34, 0.66, 0.12). The dash front face toward the driver is z ≈ 0.51.

import { createContext } from "react";
import type {
  CockpitHotspotName,
  PreDriveStepId,
} from "@/modules/sim/procedures";
import type { MirrorGlanceKind } from "../cabin";
import type { BoxSpec } from "./parts";

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type HotspotAction =
  | { type: "engineToggle" }
  | { type: "seatbeltToggle" }
  /** Click = one gate step toward D (doc 69); right-click = one step toward P. */
  | { type: "gearStep" }
  | { type: "parkingBrakeToggle" }
  | { type: "indicatorCycle" }
  | { type: "wipersToggle" }
  | { type: "headlightsCycle" }
  | { type: "hazardsToggle" }
  | { type: "fogToggle" }
  /** Momentary: pointer down = horn on, pointer up/leave = off. */
  | { type: "hornHold" }
  | { type: "glance"; mirror: MirrorGlanceKind };

export interface CockpitHotspotSpec {
  /** doc-69 contract node name — resolves the raycast hit. */
  name: CockpitHotspotName;
  /** Bulgarian tooltip: control name + the equivalent key (keys are REAL). */
  labelBg: string;
  keyHint: string;
  /** Proxy box, chassis-local (m). */
  pos: readonly [number, number, number];
  size: readonly [number, number, number];
  action: HotspotAction;
}

// ---------------------------------------------------------------------------
// The thirteen doc-69 hotspots
// ---------------------------------------------------------------------------

export const COCKPIT_HOTSPOTS: readonly CockpitHotspotSpec[] = [
  {
    name: "hotspot_engine_start",
    labelBg: "Стартер — двигател",
    keyHint: "I",
    pos: [0.16, 0.4, 0.5],
    size: [0.08, 0.08, 0.07],
    action: { type: "engineToggle" },
  },
  {
    name: "hotspot_belt",
    labelBg: "Предпазен колан",
    keyHint: "B",
    pos: [0.13, 0.04, -0.1],
    size: [0.09, 0.13, 0.15],
    action: { type: "seatbeltToggle" },
  },
  {
    name: "hotspot_gear_selector",
    labelBg: "Скоростен лост (десен бутон: назад към P)",
    keyHint: "[ ]",
    pos: [0, 0.24, 0.24],
    size: [0.13, 0.15, 0.13],
    action: { type: "gearStep" },
  },
  {
    name: "hotspot_parking_brake",
    labelBg: "Ръчна спирачка",
    keyHint: "Space",
    pos: [0, 0.16, 0.0],
    size: [0.11, 0.08, 0.13],
    action: { type: "parkingBrakeToggle" },
  },
  {
    name: "hotspot_indicator_stalk",
    labelBg: "Лост за мигачи",
    keyHint: ", .",
    pos: [0.5, 0.28, 0.46],
    size: [0.17, 0.07, 0.12],
    action: { type: "indicatorCycle" },
  },
  {
    name: "hotspot_wiper_stalk",
    labelBg: "Лост за чистачки",
    keyHint: "T",
    pos: [0.18, 0.28, 0.46],
    size: [0.17, 0.07, 0.12],
    action: { type: "wipersToggle" },
  },
  {
    name: "hotspot_headlights",
    labelBg: "Ключ за светлини",
    keyHint: "L",
    pos: [0.55, 0.38, 0.5],
    size: [0.09, 0.09, 0.07],
    action: { type: "headlightsCycle" },
  },
  {
    name: "hotspot_hazard",
    labelBg: "Аварийни светлини",
    keyHint: "J",
    pos: [0, 0.435, 0.49],
    size: [0.08, 0.06, 0.06],
    action: { type: "hazardsToggle" },
  },
  {
    name: "hotspot_horn",
    labelBg: "Клаксон — задръж",
    keyHint: "H",
    pos: [0.34, 0.3, 0.5],
    size: [0.12, 0.12, 0.08],
    action: { type: "hornHold" },
  },
  {
    name: "hotspot_mirror_left",
    labelBg: "Ляво огледало — поглед",
    keyHint: "Q",
    pos: [0.88, 0.32, 0.55],
    size: [0.17, 0.15, 0.11],
    action: { type: "glance", mirror: "left" },
  },
  {
    name: "hotspot_mirror_right",
    labelBg: "Дясно огледало — поглед",
    keyHint: "E",
    pos: [-0.88, 0.32, 0.55],
    size: [0.17, 0.15, 0.11],
    action: { type: "glance", mirror: "right" },
  },
  {
    name: "hotspot_mirror_rear",
    labelBg: "Вътрешно огледало — поглед",
    keyHint: "F",
    pos: [0, 0.68, 0.545],
    size: [0.42, 0.15, 0.09],
    action: { type: "glance", mirror: "rear" },
  },
  {
    name: "hotspot_fog",
    labelBg: "Фарове за мъгла",
    keyHint: "V",
    pos: [0.55, 0.29, 0.5],
    size: [0.08, 0.06, 0.07],
    action: { type: "fogToggle" },
  },
];

// ---------------------------------------------------------------------------
// Visible control bodies (merged into one draw call by VitokCockpit)
// ---------------------------------------------------------------------------

/** Small visible geometry anchoring each control so hover targets are
 *  discoverable — stalks, starter, rotary, hazard, buckle, mirror housings. */
export const CONTROL_BODY_SPECS: readonly BoxSpec[] = [
  { size: [0.045, 0.045, 0.03], pos: [0.16, 0.4, 0.505] }, // starter button
  { size: [0.06, 0.06, 0.03], pos: [0.55, 0.38, 0.505] }, // headlight rotary
  { size: [0.05, 0.035, 0.025], pos: [0.55, 0.29, 0.505] }, // fog switch
  { size: [0.05, 0.04, 0.025], pos: [0, 0.435, 0.497] }, // hazard button
  { size: [0.13, 0.028, 0.028], pos: [0.485, 0.28, 0.46] }, // indicator stalk
  { size: [0.13, 0.028, 0.028], pos: [0.205, 0.28, 0.46] }, // wiper stalk
  { size: [0.05, 0.028, 0.065], pos: [0, 0.145, 0.0] }, // parking-brake switch
  { size: [0.035, 0.07, 0.045], pos: [0.13, 0.03, -0.1] }, // belt buckle
  { size: [0.13, 0.1, 0.05], pos: [0.88, 0.32, 0.56] }, // door mirror L (housing)
  { size: [0.13, 0.1, 0.05], pos: [-0.88, 0.32, 0.56] }, // door mirror R (housing)
];

// ---------------------------------------------------------------------------
// Interaction context (provided by LessonScene, consumed by VitokCockpit)
// ---------------------------------------------------------------------------

export interface CockpitInteraction {
  /** Hotspots are pointer-active only in the cockpit camera view. */
  enabled: boolean;
  /** Instruction mode: the pending procedure step whose hotspot(s) pulse, or
   *  null (practice/assess/driving — no hand-holding). */
  highlightStepId: PreDriveStepId | null;
}

/** Default = inert: a cockpit mounted outside LessonScene (legacy stacks,
 *  test track) renders no interactive layer until a provider opts in. */
export const CockpitInteractionContext = createContext<CockpitInteraction>({
  enabled: false,
  highlightStepId: null,
});
