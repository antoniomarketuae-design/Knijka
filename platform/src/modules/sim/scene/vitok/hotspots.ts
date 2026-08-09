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
  /**
   * ON-CAR NAME — one or two words, pinned to the control ITSELF while the
   * step that uses it is pending (VitokCockpit → CockpitHotspots).
   *
   * THIS IS THE FOUNDER'S SENTENCE, ANSWERED IN THE PLACE HE MEANT IT. „We
   * should re-work the whole engine with the buttons, BECAUSE WE READ ON LEFT"
   * is not a complaint about which keys are bound: the left edge of the play
   * area is where the „⌨ Клавиши" legend lives, and his objection is that the
   * screen hands you a LIST OF KEYS TO READ instead of showing you the control.
   * A pending control has been pulsing since A2 — but a pulse is a nameless
   * blue box, and in the two poses that need a head turn (the seat-belt buckle
   * at 66° down, the right door mirror across the cabin) it is a nameless blue
   * box in an almost black frame. Measured on a rendered 1440×900 frame of
   * step 4: the ONLY legible thing in the picture was the proxy glow.
   *
   * So the control says its own name, on the car, in the frame the student is
   * already looking at. `labelBg` is the hover tooltip's full sentence; this is
   * the short form that fits on the control without covering it.
   */
  shortBg: string;
  /** Proxy box, chassis-local (m). */
  pos: readonly [number, number, number];
  size: readonly [number, number, number];
  action: HotspotAction;
}

/**
 * The mouse GESTURE a control takes, in Bulgarian — „Задръж" for the two held
 * controls (the horn and every mirror glance, whose contract is press-and-hold
 * exactly like the H/Q/E/F keys), „Щракни" for everything else.
 *
 * Derived from the action rather than authored per hotspot, so a control can
 * never be labelled with a gesture its handler does not implement.
 */
export function hotspotMouseVerbBg(action: HotspotAction): string {
  return action.type === "hornHold" || action.type === "glance" ? "Задръж" : "Щракни";
}

// ---------------------------------------------------------------------------
// The thirteen doc-69 hotspots (positions = A3 GLB controls, chassis-local)
// ---------------------------------------------------------------------------

export const COCKPIT_HOTSPOTS: readonly CockpitHotspotSpec[] = [
  {
    name: "hotspot_engine_start",
    // C2 glass fix (2026-07-12): the v2-dropped centre screen fully occluded
    // the button; the glass bottom was raised to y 0.36 and the button moved
    // into the opened band, base flush on the raycast stack wall — was
    // [0.095, 0.34, 0.757]. Kept in the same commit as the hero_interior.glb
    // swap (node moved identically in tools/blender/hero_interior_v3.py).
    labelBg: "Стартер — двигател",
    keyHint: "I",
    shortBg: "Стартер",
    pos: [0.095, 0.316, 0.725],
    size: [0.08, 0.08, 0.07],
    action: { type: "engineToggle" },
  },
  {
    name: "hotspot_belt",
    labelBg: "Предпазен колан",
    keyHint: "B",
    shortBg: "Предпазен колан",
    pos: [0.135, 0.05, -0.22],
    size: [0.09, 0.13, 0.15],
    action: { type: "seatbeltToggle" },
  },
  {
    name: "hotspot_gear_selector",
    // v3 console bridge (doc 73 §4 P2-1): the selector rides the RAISED
    // floating deck (top y 0.31) so the control is visible instead of below
    // the frame bottom in every pose — was [0, 0.178, 0.43]. Kept in the
    // same commit as the hero_interior.glb v3 swap (node moved identically).
    labelBg: "Скоростен лост (десен бутон: назад към P)",
    keyHint: "[ ]",
    shortBg: "Скоростен лост",
    pos: [0, 0.32, 0.43],
    size: [0.13, 0.14, 0.16],
    action: { type: "gearStep" },
  },
  {
    name: "hotspot_parking_brake",
    // v3 console bridge (doc 73 §4 P2-1) — was [0.093, 0.144, 0.35]. C2 fix
    // (2026-07-12): moved FORWARD to z 0.50 — projection through the shipped
    // CameraRig quats proved right-glance visibility is impossible at this x
    // (horizontal-in needs z ≤ 0.27, vertical-in needs z ≥ 0.49), so the
    // switch crest (y 0.334) now breaks the REST frame bottom instead, the
    // pose the pre-drive handbrake step is graded in. Same commit as the
    // GLB swap (node moved identically).
    labelBg: "Ръчна спирачка",
    keyHint: "Space",
    shortBg: "Ръчна спирачка",
    pos: [0.093, 0.315, 0.5],
    size: [0.1, 0.08, 0.12],
    action: { type: "parkingBrakeToggle" },
  },
  {
    name: "hotspot_indicator_stalk",
    labelBg: "Лост за мигачи",
    keyHint: ", .",
    shortBg: "Мигачи",
    pos: [0.48, 0.327, 0.587],
    size: [0.17, 0.08, 0.12],
    action: { type: "indicatorCycle" },
  },
  {
    name: "hotspot_wiper_stalk",
    labelBg: "Лост за чистачки",
    keyHint: "T",
    shortBg: "Чистачки",
    pos: [0.2, 0.327, 0.587],
    size: [0.17, 0.08, 0.12],
    action: { type: "wipersToggle" },
  },
  {
    name: "hotspot_headlights",
    labelBg: "Ключ за светлини",
    keyHint: "L",
    shortBg: "Светлини",
    pos: [0.655, 0.342, 0.71],
    size: [0.09, 0.09, 0.08],
    action: { type: "headlightsCycle" },
  },
  {
    name: "hotspot_hazard",
    // C2 glass fix (2026-07-12): moved with the start button so the
    // red-triangle cap clears the reshaped centre glass, base flush on the
    // raycast stack wall — was [0, 0.338, 0.752]. Same commit as the GLB swap.
    labelBg: "Аварийни светлини",
    keyHint: "J",
    shortBg: "Аварийни",
    pos: [0, 0.316, 0.725],
    size: [0.08, 0.06, 0.07],
    action: { type: "hazardsToggle" },
  },
  {
    name: "hotspot_horn",
    labelBg: "Клаксон — задръж",
    keyHint: "H",
    shortBg: "Клаксон",
    pos: [0.34, 0.281, 0.5],
    size: [0.15, 0.1, 0.12],
    action: { type: "hornHold" },
  },
  {
    name: "hotspot_mirror_left",
    labelBg: "Ляво огледало — задръж за поглед",
    keyHint: "Q",
    shortBg: "Ляво огледало",
    pos: [0.905, 0.455, 0.592],
    size: [0.18, 0.14, 0.1],
    action: { type: "glance", mirror: "left" },
  },
  {
    name: "hotspot_mirror_right",
    labelBg: "Дясно огледало — задръж за поглед",
    keyHint: "E",
    shortBg: "Дясно огледало",
    pos: [-0.905, 0.455, 0.592],
    size: [0.18, 0.14, 0.1],
    action: { type: "glance", mirror: "right" },
  },
  {
    name: "hotspot_mirror_rear",
    // Raised to the header-mounted housing in the 2026-07-11 black-mass fix
    // (was [0, 0.687, 0.575]) so the glance click-target tracks the relocated
    // glass, and raised again by B58's 105 mm mirror-station move (the В26 «50»
    // the speed lessons tell the student to read was behind the mirror at every
    // distance on the approach). The GLB node is the authority: chassis
    // (0, 0.803 + 0.105, 0.50). If the asset is ever re-exported without
    // `tools/glb/raise_interior_mirror.mjs`, this number moves back with it —
    // a proxy left behind makes the mirror unclickable, not merely misplaced.
    labelBg: "Вътрешно огледало — задръж за поглед",
    keyHint: "F",
    shortBg: "Вътрешно огледало",
    pos: [0, 0.908, 0.5],
    size: [0.3, 0.13, 0.09],
    action: { type: "glance", mirror: "rear" },
  },
  {
    name: "hotspot_fog",
    labelBg: "Фарове за мъгла",
    keyHint: "V",
    shortBg: "Фарове за мъгла",
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
