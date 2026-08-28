/**
 * Reversing POV (founder report 2026-07-17: „когато потребителят започне да
 * кара назад, изгледът да се обръща от отпред назад") — the VIEW half of the
 * reverse story whose INPUT half is reverseAssist.ts. Same complaint as the L2
 * reverse-park one from the other side: reversing while the camera looks
 * forward is what makes reverse parking blind. Real drivers turn their head
 * and look over their shoulder — that is the behaviour modelled here.
 *
 * Pure decision logic — no DOM, no three.js, no React, fully unit-testable in
 * Node. CameraRig is a dumb consumer: once per frame it asks
 * reverseViewTarget() what the view SHOULD want, damps its 0..1 swing toward
 * that with stepReverseSwing(), and renders the swing through
 * reverseSwingEnvelope(). Nothing here allocates.
 *
 * THE SWING IS A VIEW ASPECT, NOT A FOURTH CAMERA MODE. Each POV keeps its own
 * reverse aspect (chase orbits to the car's rear-facing side; the cockpit does
 * the shoulder check; top-down already sees everything and does nothing), so
 * C keeps cycling exactly the modes it always did and the student is never
 * moved out of the view they chose.
 *
 * EXAM HONESTY: a POV is not an aid — the swing stays available on exam rungs,
 * consistent with the top-down ruling (LessonScene `topdownInCycle`). Grading
 * never reads the camera. The one hard gate is the PRE-DRIVE gate: a held
 * brake there is a procedure step, not a reverse.
 *
 * ── WHY SWEEP 161 FILED TWO „THERE IS NO SHOULDER CHECK" DEFECTS HERE, AND
 *    WHAT HAS TO CHANGE BEFORE THEY CAN BE RE-FILED (2026-08-19) ────────────
 *
 * Two standing BROKEN findings name this file:
 *   sc-park-bay-exit-rev/mobile-right/03-ready.png — „no over-shoulder view
 *     control anywhere in the mobile control set … the lesson cannot be
 *     performed as taught" («Двете огледала, после поглед през ДЯСНОТО рамо и
 *     през задното стъкло»);
 *   sc-ed-reverse-line/pc-right/04-t108s.png — „no reverse camera, no
 *     over-the-shoulder view and no rear proximity read-out on screen"
 *     («обърни се и гледай през рамо назад … чл. 40»).
 *
 * NEITHER IS REPRODUCIBLE FROM THOSE FRAMES, and the reason is measurable
 * rather than arguable. `reverseViewTarget` returns 1 only on selector R, and
 * across the WHOLE catalogue sweep — 653 drives, 161 lessons, both platforms —
 * the only negative speed any run log ever printed is the harness's own −1
 * sentinel at `07-end`/`08-debrief`. Not one drive went backwards; the two
 * reversing lessons above logged 0…55 km/h and their reverse objectives
 * („Дръж права линия по средата на заден ход", „Спри след 25 метра заден ход")
 * never ticked on the DEBRIEF. `tools/mobile/lesson-audit.mjs` emits exactly
 * three keys — Escape, KeyW, KeyS — and never presses Л/З/Д either, so the
 * glance path into `glanceHeld` was never exercised on any frame in the corpus.
 *
 * So the swing this module decides was rendered in ZERO of the 16,649 frames
 * the judges read. What they photographed is the forward view of a car that
 * never selected R — which looks identical whether this feature works or does
 * not exist, and that is precisely why a fix written against those frames
 * would be a guess.
 *
 * The half of the complaint that survives without any of this is a CONTROL-SET
 * fact and it does not live here: Л/З/Д are the three MIRROR glances (Q/E/F),
 * so a student who wants to look over his shoulder on demand has no button for
 * it — the shoulder check is automatic-on-R only, and «през задното стъкло» is
 * deliberately not offered (see COCKPIT_SHOULDER_YAW's second reason). Route
 * that to the control set, not to this decision module.
 *
 * TO RE-OPEN EITHER FINDING: drive a lesson whose logged speed actually goes
 * negative, and read the frames from that. Nothing else settles it.
 *
 * ── THAT DRIVE HAPPENED, AND THE FRAME ACQUITS THIS MODULE (2026-08-28) ─────
 *
 * `w10-4` re-drove sc-ed-reverse-line with the selector actually in R and
 * captured `frames/sc-ed-reverse-line__pc-right/05r-reverse-R.png` — the first
 * frame in the corpus in which anything this file decides was ever rendered.
 * It shows the shoulder check: the cockpit camera is looking back over the
 * right shoulder past the head restraint and out the rear side glass, which is
 * `COCKPIT_SHOULDER_YAW` −1.85 rad + `COCKPIT_SHOULDER_PITCH` applied through
 * the swing, i.e. the exact behaviour instruction 4 asks for («обърни се и
 * гледай през рамо назад … чл. 40»). The prediction above was that the two
 * rows could not be settled from a forward-view frame; settled from a reverse
 * one, the shoulder-check half is simply not a defect.
 *
 * TWO CHILDREN OF THAT ROW CAME BACK ON THAT FRAME AND NEITHER LANDS HERE:
 *
 *  · `sc-ed-reverse-line:e05f2cee` „no rear proximity read-out at any point of
 *    the reverse". True of the frame and correct of the product. The badge
 *    exists (`hud/RearProximityCue.tsx`, mounted at `LessonScene.tsx`:2553)
 *    and its honesty contract is that it renders ONLY for a real body behind:
 *    `hud/rearProximity.ts` `stepRearCue` opens with
 *    `if (!Number.isFinite(gapM)) return null`. This drill runs on poligon-v1
 *    because that ground has NOTHING staged on it — the scenario's own header
 *    (`lessons/scenario/templates-exam.ts`, sc-ed-reverse-line) says „no
 *    signals, no crossings, no other actors … that emptiness IS the drill". So
 *    there is nothing behind the car to measure, and a distance to nothing is
 *    the false-warning class (doc 62 #39/#48) that burned the founder's trust.
 *    What this lesson could honestly show is DISTANCE TRAVELLED — its third
 *    gate is „спри след 25 метра" and nothing on the glass counts them — and
 *    that is an objective/RouteGuidance surface, not a reverse-view decision.
 *
 *  · `sc-ed-reverse-line:1f812456` „there is no rear-facing camera image". Also
 *    true, and it is the shape of the lesson rather than a gap in it. The
 *    instruction the drill grades is «обърни се и гледай през рамо назад, не
 *    разчитай само на огледалото (чл. 40)»; a reverse camera would perform
 *    that duty FOR the student, on an exam manoeuvre (Наредба-38) whose
 *    category-B examination car does not have one. The row's own splitWhy asks
 *    for a ruling rather than an implementation, and this is it: the absence is
 *    the lesson. Overturnable by the founder, and if it is ever overturned the
 *    camera belongs behind an explicit setting, never as the default view of a
 *    manoeuvre the state examines by shoulder check.
 */

import type { SelectorPosition } from "../vehicle";
import { REVERSE_ASSIST_STANDSTILL_KMH } from "./reverseAssist";

/** The POVs the rig can be in. Structurally identical to (and assignable
 *  from) CameraRig's `CameraMode` — declared here so the module never has to
 *  import a type out of the component layer. */
export type ReverseViewMode = "chase" | "cockpit" | "topdown";

/**
 * Swing damping rate (1/s). Exponential: 1 − e^(−λ·t) settled, so λ = 6
 * reaches 95 % in 0.5 s — the founder's "smooth transition, never a hard cut",
 * at the same order as the rig's own constants (CHASE_STIFFNESS 5,
 * TOPDOWN_UP_DAMPING 4, COCKPIT_LEAN_DAMPING). TUNE HERE: raise for a snappier
 * swing, lower for a lazier one; nothing else needs to change.
 */
export const REVERSE_SWING_LAMBDA = 6;

/** Below this distance from the target the swing snaps — kills the asymptotic
 *  tail so a settled view is exactly settled (and chaseOrbitLock() reaches 0). */
export const REVERSE_SWING_EPSILON = 1e-4;

/**
 * Selector R while still rolling FORWARD faster than this (km/h) does not
 * swing. The gate interlock (SELECTOR_ENGAGE_MAX_KMH = 3) lets R engage while
 * the car still creeps forward; whipping the view backwards while the car
 * moves forward is exactly the disorientation this feature exists to prevent.
 * Same standstill band as the assist's hold rules — one definition of "the car
 * is not going forward any more" across the reverse family.
 */
export const REVERSE_VIEW_FORWARD_HOLD_KMH = REVERSE_ASSIST_STANDSTILL_KMH;

/**
 * Chase reverse aspect: how far the camera orbits around the car, rad. π is
 * the exact mirror of the forward chase — the camera sits off the NOSE looking
 * back down the car, so the car fills the lower frame with the boot at its far
 * edge and the reversing path opens beyond it. Literally the founder's "from
 * front to back".
 *
 * The rig applies it as a rotation about +Y of the car's flat forward vector,
 * so the swing is an ORBIT (the camera passes the car's right side at the
 * halfway point — the same side as the cockpit's shoulder check) instead of a
 * teleport or a lerp straight through the car.
 */
export const CHASE_REVERSE_ORBIT_RAD = Math.PI;

/**
 * Cockpit reverse aspect — the shoulder check, in the same frame as
 * CameraRig's GLANCE_OFFSETS (yaw + = toward car-left, so a look over the
 * RIGHT shoulder is negative; pitch is relative to the pitched base view,
 * − = down) and applied through the same head-rotation machinery.
 *
 * −1.85 rad ≈ −106°: a head-on-neck turn, not a 180° spin. Two reasons it is
 * capped there and not swung to the rear window: (1) it is the real limit —
 * beyond ~90–110° a driver's head stops and the TORSO does the rest, which the
 * cockpit camera (a head at COCKPIT_EYE, not a body) cannot model; (2) it aims
 * out the right rear quarter — where the kerb and the space you reverse into
 * actually are for a right-side park in right-hand traffic. The mirrors stay in
 * frame and Q/E/F still win over it.
 */
export const COCKPIT_SHOULDER_YAW = -1.85;
/** Shoulder-check pitch (rad, − = down): eyes drop toward the kerb/boot line. */
export const COCKPIT_SHOULDER_PITCH = -0.12;

export interface ReverseViewFrame {
  /** Live selector (DrivelineState.selector) — the canonical reverse signal. */
  selector: SelectorPosition;
  /** SIGNED speed, km/h (+ forward) — VehicleSim.speedKmh. */
  speedKmh: number;
  /** The POV the student is in right now. */
  mode: ReverseViewMode;
  /** A mirror glance (Q/E/F or a cockpit hotspot) is held or easing. */
  glanceHeld: boolean;
  /** The reverse-view setting (reverseViewStore) — false = student opted out. */
  enabled: boolean;
  /** The pre-drive gate is up (LessonScene `driveLocked`). */
  driveLocked: boolean;
}

/**
 * What the view should want this frame: 1 = look back, 0 = look forward.
 *
 * Deliberately binary. The swing between the two is the RIG's job (damping),
 * not this function's — which keeps the decision honest, cheap and testable,
 * and means every override below takes effect as a smooth swing home rather
 * than a cut.
 *
 * Override order (first match wins):
 *  1. setting off        — the student opted out; never impose a POV.
 *  2. pre-drive gate up  — a held brake there is a procedure step, not a
 *                          reverse (and the car cannot move at all).
 *  3. top-down           — it already sees everything; nothing to swing.
 *  4. cockpit + glance   — an EXPLICIT glance wins over the automatic head
 *                          turn. Chase is exempt: Q/E/F move no camera there,
 *                          so there is no head for the glance to claim.
 *  5. not in R           — rolling backwards down a hill in D/N is not
 *                          reversing; only the selector states intent.
 *  6. still rolling forward — see REVERSE_VIEW_FORWARD_HOLD_KMH.
 */
export function reverseViewTarget(f: ReverseViewFrame): 0 | 1 {
  if (!f.enabled) return 0;
  if (f.driveLocked) return 0;
  if (f.mode === "topdown") return 0;
  if (f.mode === "cockpit" && f.glanceHeld) return 0;
  if (f.selector !== "R") return 0;
  if (f.speedKmh > REVERSE_VIEW_FORWARD_HOLD_KMH) return 0;
  return 1;
}

/**
 * One frame of exponential damping of the 0..1 swing toward `target`.
 * Frame-rate independent (the rig's own `1 − exp(−k·dt)` form); snaps inside
 * REVERSE_SWING_EPSILON. A non-positive dt (paused tab, first frame) is a
 * no-op rather than a NaN.
 */
export function stepReverseSwing(
  current: number,
  target: 0 | 1,
  dtSec: number,
  lambda: number = REVERSE_SWING_LAMBDA,
): number {
  if (!(dtSec > 0)) return current;
  const next = current + (target - current) * (1 - Math.exp(-lambda * dtSec));
  return Math.abs(target - next) < REVERSE_SWING_EPSILON ? target : next;
}

/**
 * Smoothstep envelope of the raw swing — the exact easing the mirror glance
 * already uses (`s*s*(3-2*s)` in CameraRig), reused so the head/orbit eases IN
 * as well as out. Raw exponential damping is fastest at t=0, which reads as a
 * whip off the mark; this makes the start and the arrival both gentle.
 */
export function reverseSwingEnvelope(swing: number): number {
  const s = swing < 0 ? 0 : swing > 1 ? 1 : swing;
  return s * s * (3 - 2 * s);
}

/**
 * How rigidly the CHASE camera must ride the orbit arc this frame (0 = the
 * normal trailing chase lerp, 1 = glued to the arc).
 *
 * WHY THIS EXISTS: the chase camera follows its desired position with an
 * exponential lerp whose steady-state lag is v/rate (CHASE_STIFFNESS = 5/s —
 * the same maths as the cockpit's back-seat-POV fix). A π orbit in ~0.5 s
 * sweeps the desired along a 6 m-radius arc at tens of m/s, i.e. an order of
 * magnitude past what that lerp can track: it would not orbit at all, it would
 * be dragged in a straight line ACROSS the car. So while the swing is in
 * motion the follow rate is locked to the arc, easing back into the normal
 * trailing feel over the last quarter (|Δ| < 1/CHASE_ORBIT_LOCK_GAIN). At rest
 * (current === target) this is 0 and the chase behaves exactly as it always
 * has — forwards or reversed.
 */
export const CHASE_ORBIT_LOCK_GAIN = 4;

export function chaseOrbitLock(current: number, target: 0 | 1): number {
  const lock = CHASE_ORBIT_LOCK_GAIN * Math.abs(target - current);
  return lock > 1 ? 1 : lock;
}
