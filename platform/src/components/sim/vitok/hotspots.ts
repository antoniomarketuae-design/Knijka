// Cockpit hotspots (A2, doc 69 — the naming contract is LOAD-BEARING).
//
// Data + context only; the meshes live in VitokCockpit (CockpitHotspots).
// Each hotspot is an invisible raycast proxy box named EXACTLY per the doc-69
// contract, positioned AT the matching control of the authored GT-E interior
// (A3, hero_interior.glb) and slightly larger than it for fat-finger
// tolerance — the P1 touch layer inherits them. The GLB carries the same
// hotspot_* node names on the visible control meshes; the proxies remain the
// raycast layer (doc 69 explicitly allows "a slightly larger invisible proxy
// box parented to it") so touch targets stay big and hover glow reads as a
// halo around the real control.
//
// Positions below are the GLB node transforms converted to chassis-local
// metres through the interior mount (yaw π: (x,z) → (−x,−z); y − 0.55).
//
// Actions map 1:1 onto CabinControls' public methods / DrivelineState
// commands — the SAME transitions the keyboard drives, so the procedure
// observer (modules/sim/procedures/performedSteps.ts) cannot tell a click
// from a keypress. Mirror hotspots fire cabin.glance(...): the already-graded
// mirror path (rule-engine sample + camera head-turn).
//
// Frame reminder (tuning.ts): chassis-local metres, +X = car LEFT,
// +Z = forward; the driver (LHD) sits at x +0.34, eye at COCKPIT_DEP
// (0.34, 0.66, 0.12) — the camera itself sits aft of it, see COCKPIT_EYE.

import { createContext } from "react";
import type {
  CockpitHotspotName,
  PreDriveStepId,
} from "@/modules/sim/procedures";
import type { MirrorGlanceKind } from "../cabin";

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
  /** Held: pointer down = glance view in (graded once), pointer up/leave =
   *  eyes back on the road — same hold semantics as the Q/E/F keys. */
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
// The thirteen doc-69 hotspots (positions = A3 GLB controls, chassis-local)
// ---------------------------------------------------------------------------

export const COCKPIT_HOTSPOTS: readonly CockpitHotspotSpec[] = [
  {
    name: "hotspot_engine_start",
    labelBg: "Стартер — двигател",
    keyHint: "I",
    pos: [0.095, 0.34, 0.757],
    size: [0.08, 0.08, 0.07],
    action: { type: "engineToggle" },
  },
  {
    name: "hotspot_belt",
    labelBg: "Предпазен колан",
    keyHint: "B",
    pos: [0.135, 0.05, -0.22],
    size: [0.09, 0.13, 0.15],
    action: { type: "seatbeltToggle" },
  },
  {
    name: "hotspot_gear_selector",
    labelBg: "Скоростен лост (десен бутон: назад към P)",
    keyHint: "[ ]",
    pos: [0, 0.178, 0.43],
    size: [0.13, 0.14, 0.16],
    action: { type: "gearStep" },
  },
  {
    name: "hotspot_parking_brake",
    labelBg: "Ръчна спирачка",
    keyHint: "Space",
    pos: [0.093, 0.144, 0.35],
    size: [0.1, 0.08, 0.12],
    action: { type: "parkingBrakeToggle" },
  },
  {
    name: "hotspot_indicator_stalk",
    labelBg: "Лост за мигачи",
    keyHint: ", .",
    pos: [0.48, 0.327, 0.587],
    size: [0.17, 0.08, 0.12],
    action: { type: "indicatorCycle" },
  },
  {
    name: "hotspot_wiper_stalk",
    labelBg: "Лост за чистачки",
    keyHint: "T",
    pos: [0.2, 0.327, 0.587],
    size: [0.17, 0.08, 0.12],
    action: { type: "wipersToggle" },
  },
  {
    name: "hotspot_headlights",
    labelBg: "Ключ за светлини",
    keyHint: "L",
    pos: [0.655, 0.342, 0.71],
    size: [0.09, 0.09, 0.08],
    action: { type: "headlightsCycle" },
  },
  {
    name: "hotspot_hazard",
    labelBg: "Аварийни светлини",
    keyHint: "J",
    pos: [0, 0.338, 0.752],
    size: [0.08, 0.06, 0.07],
    action: { type: "hazardsToggle" },
  },
  {
    name: "hotspot_horn",
    labelBg: "Клаксон — задръж",
    keyHint: "H",
    pos: [0.34, 0.281, 0.5],
    size: [0.15, 0.1, 0.12],
    action: { type: "hornHold" },
  },
  {
    name: "hotspot_mirror_left",
    labelBg: "Ляво огледало — задръж за поглед",
    keyHint: "Q",
    pos: [0.905, 0.455, 0.592],
    size: [0.18, 0.14, 0.1],
    action: { type: "glance", mirror: "left" },
  },
  {
    name: "hotspot_mirror_right",
    labelBg: "Дясно огледало — задръж за поглед",
    keyHint: "E",
    pos: [-0.905, 0.455, 0.592],
    size: [0.18, 0.14, 0.1],
    action: { type: "glance", mirror: "right" },
  },
  {
    name: "hotspot_mirror_rear",
    labelBg: "Вътрешно огледало — задръж за поглед",
    keyHint: "F",
    pos: [0, 0.687, 0.575],
    size: [0.3, 0.13, 0.09],
    action: { type: "glance", mirror: "rear" },
  },
  {
    name: "hotspot_fog",
    labelBg: "Фарове за мъгла",
    keyHint: "V",
    pos: [0.585, 0.328, 0.723],
    size: [0.08, 0.06, 0.07],
    action: { type: "fogToggle" },
  },
];

// ---------------------------------------------------------------------------
// Interaction context (provided by LessonScene, consumed by VitokCockpit)
// ---------------------------------------------------------------------------

export interface CockpitInteraction {
  /** Cockpit camera view: hotspots are pointer-active, the interior GLB and
   *  the A4 mirror RTT render, the exterior shell hides. */
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
