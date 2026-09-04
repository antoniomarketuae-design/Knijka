"use client";

/**
 * LessonScene — THE integrated 3D world (client-only; mounted by SceneSlot via
 * next/dynamic ssr:false so rapier wasm never runs during SSR/build).
 *
 * Fuses every P5 subsystem into one canvas:
 *   SimEnvironment (sky/light/rain) · DistrictWorld (real Sofia) ·
 *   VehicleRig („Виток" physics car) · TrafficLayer (cars + pedestrians) ·
 *   CameraRig (chase/cockpit) · WorldRuntime (signals + SimTick emission).
 *
 * Per frame: runtime.update → traffic.update → runtime.sample → onTick, which
 * feeds the lesson engine (rules + objectives + HUD) owned by LessonPlayShell.
 */

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { Euler, type Group } from "three";
import {
  createTelemetry,
  hasTouchScreen,
  isTouchOnlyDevice,
  ReverseAssist,
  ReversePedalMapper,
  ReverseStuckWatch,
  shouldRemapReversePedals,
  SimInput,
  StuckStartWatch,
  TouchInputSource,
  useReverseViewEnabled,
  type ReverseShiftSource,
  type ReverseStuckDirection,
  type StuckStartReason,
} from "@/modules/sim/engine";
import {
  CROSSWIND_BRIDGE_N,
  CROSSWIND_GUST_AMPLITUDE_N,
  CROSSWIND_GUST_PERIOD_SEC,
  FIXED_DT,
  GRAVITY,
  SPAWN,
  CHASE_FOV,
  DIFFICULTY_ORDER,
  DIFFICULTY_PRESETS,
  DEFAULT_DIFFICULTY,
  // The tier's speed ceiling, so the cluster can print it (2026-08-11: the
  // governor has clamped the throttle in silence since the first tier shipped).
  governorCapKmh,
  storeDifficulty,
  // WHICH GEARBOX THE STUDENT WAS HANDED — „Напреднал" is a manual with a
  // clutch, every other tier an automatic (vehicle/driveline.ts). The key
  // legend has to know: the same two caps mean different things on the two
  // boxes, and until 2026-08-30 it described only one of them.
  transmissionModeFor,
  SNOW_GRIP_FACTOR,
  WET_GRIP_FACTOR,
  type DifficultyMode,
  type DrivelineEvent,
  type DrivelineRejection,
  type DrivelineSnapshot,
  type SelectorPosition,
  type TransmissionMode,
  type VehicleInput,
  type VehicleSim,
} from "@/modules/sim/vehicle";
import {
  DEFAULT_LESSON_TRAFFIC,
  lessonDistrictId,
  type NearMissEvent,
  type NearMissStats,
  type StagedEventOutcome,
  type VehicleSample,
} from "@/modules/sim/contracts";
import {
  isScenarioLessonId,
  parseScenarioLessonId,
  scenarioById,
  type LessonSpec,
} from "@/modules/sim/lessons";
import {
  createScenarioDirector,
  directorContactCast,
  lessonSeed,
  vruAheadMeters,
  type ScenarioDirector,
} from "@/modules/sim/orchestrator";
// Exact body geometry for naming a live contact — the SAME module the
// director's contact sentinel grades with, so the two live reporters can never
// disagree about what the player is inside of. See the block above ReadyScene.
import {
  actorObb,
  isContact,
  obbDiscSeparationM,
  obbSeparationM,
  PEDESTRIAN_BODY_RADIUS_M,
  playerObb,
  type ActorPose,
  type Obb2D,
} from "@/modules/sim/collision";
import {
  createPreDriveSignalTracker,
  observeControlSignal,
  readyToMoveOff,
  type PreDriveSignalTracker,
  type PreDriveStepId,
} from "@/modules/sim/procedures";
import { DEFAULT_RULE_CONFIG, type SimTick } from "@/modules/sim/rules";
import {
  createDashboardStatus,
  FollowGapCue,
  followGapTarget,
  PEEK_SCRIM_ALPHA,
  PEEK_SCRIM_FEATHER_PX,
  PEEK_SCRIM_RGB,
  peekScrimBackgroundCss,
  peekScrimMaskCss,
  RearProximityCue,
  TelltaleEdgePings,
  useTapActivation,
  type DashboardStatus,
  type MinimapFrame,
} from "@/modules/sim/hud";
// D11 (founder 2026-07-30, ledger 86): the „Поглед отгоре" discoverability
// cue. Imported from its own modules rather than through the hud barrel —
// the barrel belongs to the HUD/UX lane this wave, so this file does not add
// a line to it.
import { CameraAidHint } from "@/modules/sim/hud/CameraAidHint";
import { cameraAidHintEligible } from "@/modules/sim/hud/overheadHint";
// The per-frame dashboard write, extracted out of this file so a unit test can
// drive it (O35, 2026-08-19 — see the useFrame block). Same barrel reasoning as
// the two lines above.
import { writeDashboardStatus } from "@/modules/sim/hud/dashboardStatus";
import {
  SimEnvironment,
  WindshieldDroplets,
  mapKindHasSkyline,
  QUALITY_PRESETS,
  RAIN_IBL_DIM,
  PerfProbe,
  GlContextGuard,
  canvasMaxDpr,
} from "@/modules/sim/environment";
import {
  DistrictWorld,
  LaneSignalGantry,
  TEXTURE_BUDGETS,
  assertDistrict,
  type WorldGeometry,
} from "@/modules/sim/world";
import { createWorldRuntime, type SurfaceGripPatch } from "@/modules/sim/runtime";
import {
  ambientSidewalkBudget,
  controllerCaptionDetailForLevel,
  createTrafficSystem,
  DEFAULT_TRAFFIC_CONFIG,
  SCENARIO_TRAFFIC_DRAW_DISTANCE_M,
  TrafficLayer,
  type TrafficDistrict,
  type VehicleProfile,
} from "@/modules/sim/traffic";
import {
  buildPoligonGhostDemo,
  createTraceClock,
  parseScenarioTrace,
  tracePathForRibbon,
  type LiveTraceRecorder,
  type RecordedDrive,
  type ScenarioTrace,
  type TraceClock,
} from "@/modules/sim/traces";
import {
  CabinControls,
  initialHeadlightsFor,
  initialParkingBrakeOnFor,
  type MirrorGlanceKind,
} from "@/modules/sim/scene/cabin";
import {
  lessonRequiredSpeedKmh,
  lessonSpeedConflict,
} from "@/modules/sim/scene/lessonSpeedContract";
import { TouchControls } from "./TouchControls";
// The lesson clock's ceiling. Imported from `lesson-ui/` rather than declared
// here because it has to be unit-testable in Node: this file drags in R3F,
// rapier wasm and the district loader, and the ONE number that decides how much
// world time a frame is worth cannot sit behind that. See the file's header.
import { sessionClockAdvance } from "./lesson-ui/sessionClock";
// The first-run touch hint's LIFETIME, next door for the same reason and in the
// same words: it had none, so it printed itself over the rear-view mirror for a
// whole 3 min 39 s lesson. See that file's header for the four frames.
import {
  TOUCH_HINT_POLL_MS,
  touchHintAccrue,
  touchHintOnGlass,
  touchHintShouldHide,
} from "./lesson-ui/touchHintLifetime";
// …and the SAME missing lifetime on the desktop twin of that card: the «⌨
// Клавиши» legend opened itself on every mouse lesson and then printed key caps
// over the left third of the windscreen for the whole drive. See that file's
// header for the three frames.
import {
  CONTROLS_LEGEND_POLL_MS,
  controlsLegendStandsDown,
} from "./lesson-ui/controlsLegendLifetime";
import { CockpitInteractionContext } from "@/modules/sim/scene/vitok/hotspots";
import { HUD_LEFT_PANEL_MAX_HEIGHT_FRACTION } from "@/modules/sim/scene/vitok/cabinLook";
import { SimAudio } from "@/modules/sim/scene/simAudio";
import { AudioLessonPrompt } from "./AudioLessonPrompt";
import { CameraRig, type CameraMode, type TopdownAidHandle } from "./CameraRig";
import { ImpactCut, type ImpactCutHandle } from "./ImpactCut";
import { VehicleRig, type CollisionWithWhat, type VehicleSpawn } from "./VehicleRig";
import { NpcColliders } from "./NpcColliders";
import { createVehicleSample } from "@/modules/sim/scene/vehicleSample";
import { buildMinimapPolylines } from "@/modules/sim/scene/lessonMinimap";
import {
  applySignalModes,
  buildLessonWorldCore,
  districtUrlFor,
  wireTrafficQueries,
  type LessonWorldCore,
} from "@/modules/sim/scene/lessonWorldRecipe";
import { RouteGuidance } from "./RouteGuidance";
import {
  ScenarioObstacles,
  type ObstacleColliderFootprint,
  type ScenarioObstacleSpec,
} from "./ScenarioObstacles";
import { ShadowCar } from "./ShadowCar";
// [glance-pings] the look-left/right teaching overlay (see the wiring block).
import { GlanceEdgePings, type GlancePingTap } from "./lesson-ui/GlanceEdgePings";
// The mouse's pedals (founder 2026-07-30) — see the mount below.
import { MousePedals } from "./lesson-ui/MousePedals";
import { TraceTimeline } from "./lesson-ui/TraceTimeline";
import {
  DEMO_DECK_POLL_MS,
  demoDeckAtRest,
  demoDeckStandsDown,
} from "./lesson-ui/demoDeckLifetime";
import { worldNameBg } from "@/modules/sim/scene/worldNames";
import type { QualityPreset } from "./lesson-ui/types";

// Minimal structural mirrors of the district shapes we read here — the runtime
// and world modules each validate the full document.
interface SpawnPointLike {
  id: string;
  x: number;
  y: number;
  heading: number;
}

const MINIMAP_MS = 200;
const MINIMAP_PX_PER_M = 0.5;

/**
 * S1: public URL of a committed trace (content/traces/… is published to
 * platform/public/traces/… byte-identically — the world-JSON pattern).
 */
function traceUrlFor(repoPath: string): string {
  return `/${repoPath.replace(/^content\//, "")}`;
}

/** S1 followHints tuning: sustained lateral deviation → „Следвай синята линия". */
const FOLLOW_HINT_DEVIATION_M = 1.2;
const FOLLOW_HINT_SUSTAIN_S = 2;
const FOLLOW_HINT_POLL_S = 0.25;

/**
 * Day IBL: Poly Haven `shanghai_riverside` (CC0) — a true-unclipped-sun (25 EV)
 * golden-hour riverside, so paint/glass/wet-asphalt speculars come free from
 * the env map (doc 71 §4.2). Its baked sun sits at equirect u=0.600, elevation
 * ≈20° (measured from the 1k pixels), which lands at in-scene compass azimuth
 * 126°; the preset sun is at azimuth 245°, so rotate the environment by
 * 245° − 126° = +119° around Y — otherwise glass towers show a double sun.
 */
const DAY_ENV_ROTATION = new Euler(0, (119 * Math.PI) / 180, 0);
const NIGHT_ENV_ROTATION = new Euler(0, 0, 0);

/** P1: localStorage key marking the one-time touch orientation hint as seen. */
const TOUCH_HINT_STORAGE_KEY = "sim.touchHintSeen";

/* ═══════════════════════════════════════════════════════════════════════════
   THE ACK CHIP'S OWN GROUND — sweep w11, 2026-08-27.

   FILED EIGHT TIMES, ONE SENTENCE, EIGHT LESSONS: „the hint's «РАЗБРАХ» button
   floats detached below the text with no visual tie to it"
   (sc-crossing-child-ball:a846ca99, sc-crossing-white-cane:90a1ced1,
   sc-rb-ped-exit:5fa0ff2e, sc-park-zebra:85de2236, sc-park-wall:30a41030,
   sc-crossing-bus-shadow:4515fc5e, sc-park-45-rev:95119078,
   sc-speed-dangerous:a284d02c, and the second half of
   sc-ov-solid-return:6c0e0f12).

   ── FIRST, THE HALF OF THOSE NOTES THAT IS STALE, because a repair aimed at it
      would move no pixel and the next sweep deserves the numbers. Every one of
      the eight says some version of „the scrim behind the hint text ENDS ABOVE
      the button", and nine SEPARATE rows on the same card say the copy itself
      has „no panel … only a ~20 % wash … the parked cars and the sky read
      straight through". Neither is true on this build.

      MEASURED off the w11 frames themselves (iPhone 16 landscape, 852 × 393 at
      dpr 3), reading the shade's own alpha down the card's column against a
      matched strip of bare world beside it —

        sc-speed-dangerous 03-ready   bare sky rgb(166,171,174) at device x<1620
          device y 430, card interior      rgb( 38, 43, 51)  ⇒ α = 0.80
          device y 580, card interior      rgb( 74, 74, 73)  ⇒ α = 0.17  (ramp)
          device y 610, card interior      = the world              α ≈ 0
        sc-crossing-child-ball 03-ready
          device y 250 (sky 154) ⇒ α 0.87 · y 500 (world 118) ⇒ α 0.88
          device y 560 ⇒ α 0.57 (ramp) · y 600 ⇒ α ≈ 0

      0.80 is `PEEK_SCRIM_ALPHA` exactly, the ramp is 48 device px = the
      published `PEEK_SCRIM_FEATHER_PX.bottom` (16 CSS px) exactly, and it ends
      at CSS 200 ≈ the card's own box. So the shade is dense, it is the
      published one, and it covers the WHOLE card — prose and control alike.
      „No panel" and „it stops above the button" are both refuted.

   ── WHAT IS NOT STALE IS WHERE THAT RAMP LANDS. The card measures ~127 CSS px
      and the ack chip is its last ~46. The bottom feather is 16. So the ramp
      runs ENTIRELY INSIDE THE ONE CONTROL THE CARD OWNS: at the chip's top the
      ground is 0.80 and at its bottom edge it is 0. The chip's own box is
      `color-mix(in srgb, var(--accent) 18%, transparent)` — a TINT with no
      ground — so the bottom third of a 44 px touch target stands on live road,
      which is why eight readers of eight different frames all called it loose.

      The shade's own site claimed the opposite in writing („the «Разбрах» ack …
      a control that paints its own box and does not depend on this ground").
      That sentence is corrected at the shade, below.

      ── AND THE RAMP MOVED OUT FROM UNDER THE CHIP ON 2026-08-27 (sweep w12,
         the same sentence filed six more times). The paragraph above stays as
         written because it is why THIS constant exists, but its last clause is
         history now: the card carries `PEEK_SCRIM_FEATHER_PX` as PADDING under
         `box-sizing: content-box`, so `inset: 0` and the mask's
         `calc(100% - 16px)` resolve against a box that is 16 px taller than the
         ink and the ramp runs BELOW the button, not through it.

         WHICH IS WHAT THIS NUMBER WAS ALWAYS FOR. β = 0.50 is derived from the
         card's own 0.80 being present underneath; until that repair it was
         present for the chip's top edge only, so the composite the frames
         actually show is 0.90 → 0.50 down a 44 px control rather than the flat
         0.90 the identity below computes. Nothing here changes: the arithmetic
         was right and the ground it assumed is now there.

   ── THE FIX IS SimOverlay'S, NOT A NEW ONE. The peek's three chips were filed
      with the identical sentence four times („the «ЗАЩО ↓10» and «✕» pills are
      unfilled outlines sitting directly on the parked cars") and that module
      answered it on 2026-08-27: a chip is not a window onto the road the way a
      paragraph's ground is, so the pair of layers may reach 0.90 where the card
      alone may not exceed 0.80 — 1.13 : 1, „dimmed, not erased", the world
      still legible inside the control.

   ── AND IT IS DERIVED, NOT TYPED, for the reason that module states: an edit to
      `PEEK_SCRIM_ALPHA` must re-pick this instead of leaving a paragraph to rot.
      Two alpha layers leave (1 − a)(1 − b) of the world, so
      1 − (1 − 0.80)(1 − β) = 0.90 ⇒ β = 0.50.

      ⚠ THE ARITHMETIC IS RE-STATED HERE AND THAT IS A CONCESSION, NOT A CHOICE.
        `chipGroundAlphaFor` / `peekChipGroundCss` / `PEEK_CHIP_TOTAL_ALPHA` all
        exist in `modules/sim/hud/SimOverlay.tsx` and NONE of them is re-exported
        from `modules/sim/hud/index.ts`, and doc-05 forbids a component reaching
        past a module's barrel. What travels through the barrel today is
        `PEEK_SCRIM_ALPHA` and `PEEK_SCRIM_RGB`, so the CARD's alpha — the one
        number that can move — is read and only the 0.90 rung is written down.
        When the hud lane publishes those three names this block collapses to an
        import, and `unpanelInkExemption.test.ts` already owns the pattern for
        asserting a barrel name rather than an import line.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The total the card's ground and the ack chip's own ground reach together —
 * SimOverlay's `PEEK_CHIP_TOTAL_ALPHA`, the rung 0.80 was measured at and
 * rejected FOR THE CARD (a card is a window onto the road) and adopted for a
 * 44 px control (it is not).
 */
const ACK_CHIP_TOTAL_ALPHA = 0.9;

/**
 * …and the chip's own layer, derived from the published card alpha. 0.50.
 *
 * Clamped to [0, 1] for the reason `chipGroundAlphaFor` states — a total below
 * the card's own ground is not a lighter chip, it is a request this compositor
 * cannot honour and must not silently invert — and ROUNDED because the naive
 * expression is 0.5000000000000001 in binary floating point and that number
 * would ship into the DOM as the chip's alpha.
 */
const ACK_CHIP_GROUND_ALPHA =
  PEEK_SCRIM_ALPHA >= 1
    ? 0
    : Math.min(
        1,
        Math.max(0, Math.round((1 - (1 - ACK_CHIP_TOTAL_ALPHA) / (1 - PEEK_SCRIM_ALPHA)) * 1000) / 1000),
      );

/**
 * The ack chip's ground: the CARD's own near-black, at that alpha.
 *
 * It is painted as `background-color` with the unchanged 18 % tint above it in
 * `background-image`, and the ORDER is the correctness point rather than a
 * tidiness one — CSS paints `background-image` above `background-color`, and a
 * tint UNDER its own ground is a tone halved to buy the ground. Composited, the
 * pair is arithmetically identical to SimOverlay's single
 * `color-mix(in srgb, var(--accent) 18%, <ground>)` (that function's own proof:
 * `color-mix` premultiplies, so mixing an opaque tone at p % with a ground at
 * (100 − p) % is the same expression as painting the tone at p % source-over
 * that ground), and it keeps the 18 % register on the page as one literal,
 * which is what `hud-off-the-road.test.ts` reads to prove this is still the
 * chip the founder signed off and not the „SOLID BRAND-BLUE «Разбрах»" the
 * 2026-08-03 review deleted.
 */
const ACK_CHIP_GROUND_CSS = `rgba(${PEEK_SCRIM_RGB.join(", ")}, ${ACK_CHIP_GROUND_ALPHA})`;

/**
 * Perf readout opt-in: `?simPerf=1` on the URL, or `localStorage["sim.perfLog"]
 * ="1"` in a dev build. Read once at scene mount.
 *
 * THE URL FLAG WORKS IN PRODUCTION, ON PURPOSE (doc 82 §6.2). The A16
 * measurement that gates every later phase has to be taken on a PRODUCTION
 * build — a dev build runs unminified React with no chunk splitting, so it
 * would report a load time and a parse cost that describe no student's
 * session. Refusing to instrument production would mean the gate could only
 * ever be closed with a number that is wrong in the pessimistic direction,
 * which is not honest either.
 *
 * What it costs a real user who never types the flag: nothing — the probe is
 * not mounted. What it costs one who does: console output only. Nothing is
 * transmitted (ADR-004); see PerfProbe's header. The localStorage path stays
 * dev-only so a stray key cannot make a student's session log forever.
 */
function shouldLogPerf(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has("simPerf")) return true;
    if (process.env.NODE_ENV === "production") return false;
    return window.localStorage.getItem("sim.perfLog") === "1";
  } catch {
    return false;
  }
}

/**
 * S0-View demo flag (doc 76 §10 P0 proof-of-form; never in production
 * builds): `?ghost=demo` on полигон FREE DRIVE mounts the Shadow Car demo —
 * a scripted correct drive recorded at load through the production stack
 * (traces/demo.ts), played back as the translucent ghost + path ribbon +
 * scrub timeline, for the founder to judge the form factor.
 */
function isGhostDemoEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  try {
    return new URLSearchParams(window.location.search).get("ghost") === "demo";
  } catch {
    return false;
  }
}

/** The hint replaces the old refusal GateCard: touch-only devices get ONE
 *  orientation/expectation card, then drive. Fail-open on storage errors. */
function shouldShowTouchHint(): boolean {
  if (!isTouchOnlyDevice()) return false;
  try {
    return window.localStorage.getItem(TOUCH_HINT_STORAGE_KEY) === null;
  } catch {
    return true;
  }
}

/**
 * QW10 (doc 68 Phase 0): SimInput with a pre-drive gate. While `driveLocked`
 * (lesson phase === "preDrive") the drive axes read zero — throttle, brake
 * (whose standstill overload is reverse) and handbrake — so the physics can
 * never move the car mid-checklist; steering stays live (harmless while
 * stationary, keeps the wheel responsive). A throttle press while locked is
 * latched so the scene can surface the "завърши подготовката" explanation
 * exactly once per attempt. Interim seam until real ignition/handbrake state
 * lands (Phase 1 A1) — the physics core and VehicleRig stay untouched.
 */
class GatedSimInput extends SimInput {
  driveLocked = false;
  /** Auto-reverse assist rule b (engine/reverseAssist.ts): while true —
   *  selector R × automatic box × non-exam lesson, kept current by the
   *  driveline subscription in the input lifecycle effect — read() swaps the
   *  pedals so S/↓ accelerates backward and W/↑ brakes ("down = backwards"
   *  is literally true in R). Applied BEFORE the raw capture below, so the
   *  A2 observer, the scenario director and the recorder all see the
   *  FUNCTIONAL pedals. */
  reversePedalRemap = false;
  /**
   * WHICH ROUTE last CHANGED `reversePedalRemap` — written by the driveline
   * subscription at the moment of the change, because that is the only moment
   * at which it is known. `read()` runs several times per frame and in no fixed
   * order relative to the assist's own gate step, so a flag the mapper had to
   * consume "soon" would be a race; a value bound to the state change is not.
   */
  reversePedalRemapSource: ReverseShiftSource = "manual";
  /** LAW 2 (engine/reverseAssist.ts): the swap above is applied THROUGH this
   *  mapper, never raw, so a pedal held across a HAND-WORKED flip keeps braking
   *  instead of becoming the reverse accelerator — the [ / ] keys, the touch
   *  gear sheet and the cockpit lever. The assist's own armed press is exempt
   *  (LAW 1 already proved it was never a brake); see the source above. */
  private readonly reverseMapper = new ReversePedalMapper();
  /** LAW 2's own verdict on the last read: is a pedal being held THROUGH a
   *  flip, i.e. contributing zero throttle and going on braking? The frame
   *  loop feeds it to ReverseStuckWatch so a driver who is standing on a
   *  disowned pedal is told why the car will not move (engine/reverseStuck.ts
   *  — founder 2026-08-09 „did it break or ?"). */
  get reversePedalDisowned(): boolean {
    return this.reverseMapper.isDisowned;
  }
  /** Raw (pre-gate) pedal values from the last read — the A2 procedure
   *  observer edge-detects these: a real brake press performs "press-brake",
   *  a throttle press on a ready driveline performs "move-off". */
  rawThrottle = 0;
  rawBrake = 0;
  private blockedThrottleAttempt = false;

  override read(): VehicleInput {
    const out = super.read();
    this.reverseMapper.apply(out, this.reversePedalRemap, this.reversePedalRemapSource);
    this.rawThrottle = out.throttle;
    this.rawBrake = out.brake;
    if (this.driveLocked) {
      if (out.throttle > 0) this.blockedThrottleAttempt = true;
      out.throttle = 0;
      out.brake = 0;
      out.handbrake = false;
    }
    return out;
  }

  /** True once after a throttle press while locked (one-shot latch). */
  consumeBlockedDriveAttempt(): boolean {
    const b = this.blockedThrottleAttempt;
    this.blockedThrottleAttempt = false;
    return b;
  }
}

/** lesson-ui preset ("medium") → world/environment level ("med"). */
function toLevel(q: QualityPreset): "low" | "med" | "high" {
  return q === "medium" ? "med" : q;
}

/** Convert a district spawn (x east, y north, heading cw-from-north) to a
 *  three.js chassis pose. Vertical drop reuses the tested SPAWN.y. */
function spawnPose(
  lesson: LessonSpec,
  spawnPoints: SpawnPointLike[],
): VehicleSpawn {
  const explicit = lesson.spawn.position;
  let x: number;
  let yNorth: number;
  let headingDeg: number;
  if (lesson.spawn.pointId) {
    const p = spawnPoints.find((s) => s.id === lesson.spawn.pointId);
    x = p?.x ?? explicit?.x ?? 0;
    yNorth = p?.y ?? explicit?.y ?? 0;
    headingDeg = p?.heading ?? lesson.spawn.headingDeg ?? 0;
  } else {
    x = explicit?.x ?? 0;
    yNorth = explicit?.y ?? 0;
    headingDeg = lesson.spawn.headingDeg ?? 0;
  }
  // district (x, yNorth) → three.js (x, _, −yNorth); yaw = π − heading.
  return {
    x,
    y: SPAWN.y,
    z: -yNorth,
    yawRad: Math.PI - (headingDeg * Math.PI) / 180,
  };
}

interface Built {
  runtime: ReturnType<typeof createWorldRuntime>;
  geometry: WorldGeometry;
  district: ReturnType<typeof assertDistrict>;
  traffic: ReturnType<typeof createTrafficSystem>;
  /** A8 scenario director — null when the lesson stages no events. */
  director: ScenarioDirector | null;
  minimapPolylines: MinimapFrame["polylines"];
  spawnPoints: SpawnPointLike[];
  /** S0-View: raw district doc for the ?ghost=demo recorder — null unless
   *  the dev flag is on AND this is полигон free drive. */
  ghostDemoRaw: unknown | null;
  /** S1: precise hittable parked cars from the district's meta.scenario
   *  occupancy (scenario lessons only; [] everywhere else). */
  scenarioObstacles: ScenarioObstacleSpec[];
  /** Authored clear zones for the parked-car curb decoration (doc 66 R5,
   *  founder v1 №9 — recipe-supplied, template-scoped, visual-only). */
  parkedClearZones: LessonWorldCore["parkedClearZones"];
  /** SURFACE-PATCH slice: waterPatch/icePatch rects resolved from the
   *  district's zone spans — [] on every pre-slice map, so VehicleRig's
   *  patch branch (and VehicleSim's grip setter) never runs there. */
  gripPatches: SurfaceGripPatch[];
  /** S1: the template's recorded shadow trace — fetched only when the
   *  lesson's aids ask for the ghost or the ribbon; null otherwise. */
  shadowTrace: ScenarioTrace | null;
  /** SPD (founder review R3 #37): the lesson's speed DOMAIN — max edge
   *  maxspeed of the loaded map, km/h — scales the difficulty governor
   *  (VehicleRig → applyDifficulty). undefined = no edges (never in
   *  practice) → the legacy static caps. */
  lessonMaxLegalKmh: number | undefined;
  /** doc 86 B7: a speed the LESSON declares the student must hold
   *  (`meta.scenario.wave.speedKmh`) — floors the tier governor so a rung can
   *  never be structurally unwinnable. undefined on every map that declares
   *  none, which today is 89 of 90. */
  lessonRequiredKmh: number | undefined;
}

/** Max legal speed anywhere on the loaded map (km/h); undefined = unknown. */
function maxLegalSpeedOf(district: ReturnType<typeof assertDistrict>): number | undefined {
  let max = 0;
  for (const e of district.roads.edges) {
    if (Number.isFinite(e.maxspeed) && e.maxspeed > max) max = e.maxspeed;
  }
  return max > 0 ? max : undefined;
}

export interface LessonSceneProps {
  lesson: LessonSpec;
  quality: QualityPreset;
  paused: boolean;
  /** QW10: pre-drive phase — zero the drive inputs, the car must not move. */
  driveLocked: boolean;
  /** A2 instruction mode: pending step whose cockpit hotspot(s) pulse. */
  preDriveHighlightStepId: PreDriveStepId | null;
  /** A7 route guidance: 0-based index of the active objective (from the
   *  lesson engine); ≥ objectives.length once all are done. Drives the
   *  in-world ghost route / turn arrow / objective marker. */
  activeObjectiveIndex: number;
  onTick: (tick: SimTick) => void;
  /** A2: a step was PERFORMED on a real control (observer-resolved). */
  onPreDriveStep: (stepId: PreDriveStepId, tSec: number) => void;
  /** QW10: throttle pressed while driveLocked (shell rate-limits the toast). */
  onBlockedDriveAttempt: () => void;
  onMinimapFrame: (frame: MinimapFrame) => void;
  /** A1: low-frequency driveline state (selector/ignition/parking brake/…)
   *  → HUD telltales. Emitted on the minimap cadence, not per frame. */
  onDriveline?: (snap: DrivelineSnapshot) => void;
  /** A rejected driveline action (start interlock / selector gate) — the
   *  shell turns it into a visible HUD hint + gear-telltale flash. Carries a
   *  fresh snapshot so the message can name the blocking state (founder bug
   *  2026-07-10: refusals must never be silent). */
  onDrivelineRejection?: (rejection: DrivelineRejection, snap: DrivelineSnapshot) => void;
  /** LAW 2 refused the pedal for long enough to be confusion rather than an
   *  ordinary shift (engine/reverseStuck.ts) — the shell explains WHY the car
   *  will not move and how to free it. Same contract as the rejection hint
   *  above: a refusal the student cannot see is a bare verdict (THEO-4). */
  onReversePedalStuck?: (direction: ReverseStuckDirection) => void;
  /** The throttle is down, the car is standing still, and the CAR is what is
   *  refusing — engine off, selector P/N, parking brake on (engine/
   *  stuckStart.ts). The QW10 „Колата още не е готова" hint says this already
   *  but only in the pre-drive phase, which no scenario rung has. */
  onStuckStart?: (reason: StuckStartReason) => void;
  /** The tier pill moved the student's own gear lever (vehicle/driveline.ts
   *  `switchTransmission` — a standing car goes D → N on the way into
   *  „Напреднал", because first gear with the clutch up is a stall). Fired
   *  ONLY when the lever actually moved; the shell says what the box did. */
  onTransmissionChanged?: (
    transmission: TransmissionMode,
    movedSelectorTo: SelectorPosition,
  ) => void;
  /** The mouse pedals just yielded to the keyboard and took themselves off
   *  screen, on a student who had been HOLDING them (lesson-ui/MousePedals.tsx
   *  — measured 12.4 s hidden, unclickable, silent). Fires at most once per
   *  session; the shell says it and how to get them back. */
  onMousePedalsYielded?: () => void;
  /** A8 (additive): a staged encounter resolved — carries the measurement
   *  record (reaction time, stop gap, …). The graded consequences already
   *  arrived through onTick; the shell folds this via applyStagedOutcome. */
  onStagedOutcome?: (outcome: StagedEventOutcome) => void;
  /** A11 (additive): a near-miss encounter resolved — the player squeezed
   *  past a moving NPC with almost no clearance. Session STAT only (A15's
   *  feedback map); nothing is graded. Carries the running aggregate. */
  onNearMiss?: (event: NearMissEvent, stats: NearMissStats) => void;
  /** P1: shell-owned fullscreen toggle (QW1 — the shell root is the
   *  fullscreen element) so the touch overlay can offer the ⛶ button. */
  onToggleFullscreen?: () => void;
  /**
   * S0-View (additive, doc 76 §5 attempt recording): a live trace recorder
   * created via traces.createTraceRecorder — when provided, the frame loop
   * streams the STUDENT's drive into it (20 Hz kinematics + glance/signal/
   * driveline events). OFF by default (prop absent); the owner calls
   * finish() at session end for compare-vs-shadow / replay.
   */
  attemptRecorderRef?: React.RefObject<LiveTraceRecorder | null>;
  /** Status-dashboard channel (additive): mutated once per frame with the
   *  live cabin/driveline/sample state — the shell's StatusDashboard bar
   *  samples it low-Hz (hud/dashboardStatus.ts). Absent = no writes. */
  dashboardStatusRef?: React.RefObject<DashboardStatus>;
}

export default function LessonScene(props: LessonSceneProps) {
  const { paused, onTick, onMinimapFrame } = props;

  const [built, setBuilt] = useState<Built | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [menuPaused, setMenuPaused] = useState(false);

  // Load the district once, build runtime + geometry + traffic client-side.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // THE multi-map seam (doc 74 §5.2): the lesson spec names its world;
        // everything below is parameterized by the parsed document.
        const districtId = lessonDistrictId(props.lesson);
        // THE URL IS THE RECIPE'S, NOT A SECOND COPY OF IT. `districtUrlFor`
        // has existed beside `lessonDistrictId` since 46947ce and this line
        // spelled the same template out again — so the address of a committed
        // district lived in two places, one of which nothing read. The audit
        // census that found it is the reason it is called here: a helper the
        // scene re-derives inline is a helper that will drift the first time
        // the world route moves.
        const res = await fetch(districtUrlFor(props.lesson));
        if (!res.ok) throw new Error(`district ${districtId} ${res.status}`);
        const raw: unknown = await res.json();
        // THE drill's world recipe — extracted verbatim to lessonWorldRecipe
        // (doc 66 R5: the clip-capture rig mounts the SAME core, so the two
        // scenes cannot drift apart): runtime, validated district, bay paint,
        // buildWorldGeometry, occupied-bay obstacles + held scenery, grip
        // patches, spawn points.
        const core = buildLessonWorldCore(props.lesson, raw);
        const { runtime, district, geometry, scenarioObstacles, gripPatches } = core;
        // S1: the shadow/ribbon aids need the template's recorded trace.
        let shadowTrace: ScenarioTrace | null = null;
        if (props.lesson.aids?.shadowCar || props.lesson.aids?.pathRibbon) {
          const parsedId = parseScenarioLessonId(props.lesson.id);
          const template = parsedId ? scenarioById(parsedId.templateId) : undefined;
          if (template && template.shadow.pending !== true) {
            try {
              const traceRes = await fetch(traceUrlFor(template.shadow.path));
              if (traceRes.ok) {
                shadowTrace = parseScenarioTrace(await traceRes.json());
              }
            } catch {
              // Trace unavailable — the drill still plays, just without the
              // ghost/ribbon (never block the lesson on an aid).
            }
          }
        }
        const spawnPoints = core.spawnPoints;
        // Anchor traffic at the lesson spawn so cars + pedestrians are where the
        // driver actually is — routes otherwise scatter across the ~1.6 km map
        // and every agent gets distance-culled (nearest car was ~340 m away).
        // Counts are per-lesson data since the полигон (doc 74 §5.5); the
        // defaults are the pre-seam city values.
        const anchorPose = spawnPose(props.lesson, spawnPoints);
        // SIGNAL-PLAN (founder bug 2026-07-17: wall-clock phases made the
        // arrival phase arbitrary after the 20–40 s pre-drive): arm the
        // lesson's approach-relative ONE-SHOT pin — the runtime rebases the
        // cluster's cycle when the player first comes within triggerM, so
        // the taught arrival phase is deterministic. LIVE sessions only:
        // the trace recorder never arms a plan (recorded traces pin via
        // authored signalOffsets — the byte-identity contract). The spawn
        // anchor resolves the default cluster (nearest) when the plan
        // names none; district y = −world z (the traffic-anchor convention).
        if (props.lesson.signalPlan) {
          runtime.armSignalPlan(props.lesson.signalPlan, {
            x: anchorPose.x,
            y: -anchorPose.z,
          });
        }
        // SIGNAL MODES (doc 62 S1 — the live half of the recorder's
        // signalModes dial): a „загаснал светофар"/„мигащо жълто" lesson
        // dials its cluster DARK / FLASHING AMBER at session start, so LIVE
        // play matches the recorded traces — grading falls back to the
        // uncontrolled-junction rules AND the lamps render unlit/blinking
        // from the same mode state (signalLampState). A staged
        // trafficController armed later overrides the mode (its own law).
        applySignalModes(runtime, props.lesson);
        const trafficSpec = props.lesson.traffic;
        const traffic = createTrafficSystem(
          raw as Parameters<typeof createTrafficSystem>[0],
          {
            anchor: { x: anchorPose.x, y: -anchorPose.z },
            anchorRadiusM: trafficSpec?.anchorRadiusM ?? DEFAULT_LESSON_TRAFFIC.anchorRadiusM,
            // …AND THE REST OF THE ROAD THE STUDENT IS ABOUT TO DRIVE.
            //
            // The anchor above is the SPAWN, and loops are seeded once. On a
            // micro-map that is the whole world; on a 927 m exam cut of Лозенец
            // it means the ambient cars stay at the kerb the student left, so
            // the drill's own „пропусни движещите се по пътя с предимство"
            // plays out on an empty street (sc-ed-d2-priority-run:76d2e929).
            // A lesson that travels names its corridor and the loops are dealt
            // along it. Absent ⇒ unchanged.
            anchorPath: trafficSpec?.anchorPath,
            vehicleCount: trafficSpec?.vehicleCount ?? DEFAULT_LESSON_TRAFFIC.vehicleCount,
            pedestrianCount:
              trafficSpec?.pedestrianCount ?? DEFAULT_LESSON_TRAFFIC.pedestrianCount,
            // …AND THE PEOPLE ON THE PAVEMENT, which no lesson had.
            //
            // Four major w11 rows say one sentence — sc-sp-limit-end,
            // sc-vu-emergency, sc-sp-eco-coast, sc-vu-cyclist-hook: a city
            // street, tower blocks, parked cars, railings, and „not one
            // pedestrian on either pavement in any frame of either drive on
            // either platform". The last of those is a lesson built ENTIRELY
            // around vulnerable road users.
            //
            // Raising `pedestrianCount` does not fix it and that is the real
            // finding: every walker this project has ever built is anchored on
            // a `DistrictCrossing`, and 84 of the 105 committed districts —
            // including all four of those maps — declare none. So the traffic
            // module grew a pavement walker that needs no crossing, arms no
            // crossing duty and is sized HERE from the district's own walkable
            // kerb length, because an empty pavement is a property of the
            // street rather than a lesson-design decision. A lesson that wants
            // a genuinely deserted road authors `sidewalkPedestrianCount: 0`.
            //
            // Live sessions only: `DEFAULT_TRAFFIC_CONFIG` keeps this at 0, so
            // the recorded traces, the clip feeds and every unit fixture that
            // builds a traffic system are byte-identical to before.
            sidewalkPedestrianCount:
              trafficSpec?.sidewalkPedestrianCount ??
              ambientSidewalkBudget(
                raw as Parameters<typeof createTrafficSystem>[0],
                DEFAULT_TRAFFIC_CONFIG.footwaylessRoadClasses,
                DEFAULT_TRAFFIC_CONFIG.laneWidthM,
              ),
          },
        );
        // Telemetry queries (pedestrian/junction/oncoming/right/circulating/
        // cyclist/overtaken) — the shared seven-hookup set (lessonWorldRecipe).
        wireTrafficQueries(runtime, traffic);
        // A8: stage the lesson's scripted encounters NOW — before TrafficLayer
        // mounts — so staged actors land inside the instanced buffers. The
        // director is deterministic per (lesson seed, attempt).
        const stagedEvents = props.lesson.stagedEvents ?? [];
        const director =
          stagedEvents.length > 0
            ? createScenarioDirector(stagedEvents, traffic, {
                seed: lessonSeed(props.lesson.id),
                // B1a N2 / JU-18: the runtime IS the SignalDirectorPort — the
                // same production wiring the recorder and the orchestrator
                // harness use, so phase-driven runners (amberDilemma pins,
                // trafficController mode + timetable) work in LIVE play too.
                signals: runtime,
              })
            : null;
        // S0-View: the ghost demo needs the raw doc for its headless recorder.
        const ghostDemoRaw =
          isGhostDemoEnabled() &&
          districtId === "poligon-v1" &&
          props.lesson.objectives.length === 0
            ? raw
            : null;
        if (alive) {
          setBuilt({
            runtime,
            geometry,
            district,
            traffic,
            director,
            minimapPolylines: buildMinimapPolylines(district),
            spawnPoints,
            ghostDemoRaw,
            scenarioObstacles,
            parkedClearZones: core.parkedClearZones,
            gripPatches,
            shadowTrace,
            // #37: the map's own speed domain drives the governor cap — the
            // АМ-140 map lets Нормален reach the flow, the 50-city keeps
            // governing just above the limit.
            lessonMaxLegalKmh: maxLegalSpeedOf(district),
            // B7: и скоростта, която самият урок ИЗИСКВА (зелената вълна).
            lessonRequiredKmh: lessonRequiredSpeedKmh(district),
          });
          // …AND THE BOUND SAYS SO WHEN IT BITES — wired 2026-08-26.
          //
          // `lessonRequiredSpeedKmh` silently clamps a district that asks the
          // governor for a speed its own streets forbid. That clamp is right:
          // it is what stops «РЕЖИМ Начинаещ ≤146» standing six pixels from a
          // 50 disc. But a silent clamp turns a MIS-AUTHORED MAP into a lesson
          // that merely feels wrong to drive — the declared speed is gone and
          // nothing anywhere names the two numbers that fought.
          //
          // `lessonSpeedConflict` is that report, and until now it had no
          // reader outside its own test: the contradiction was detected, proved
          // to five cases, and never once said out loud on the surface where a
          // district is actually loaded. One line, at the one place the bound
          // is applied, so the next mis-authored district announces itself on
          // the first drive instead of on the next audit sweep.
          const speedConflict = lessonSpeedConflict(district);
          if (speedConflict !== null) {
            console.warn(
              `LessonScene: ${lessonDistrictId(props.lesson)} declares` +
                ` ${speedConflict.declaredKmh} km/h (${speedConflict.source}) but its own roads` +
                ` allow at most ${speedConflict.maxLegalKmh} km/h — the lesson speed was bound` +
                ` DOWN to the legal maximum. This lesson cannot be driven both as authored and` +
                ` lawfully; the map or the declaration is wrong, not the student.`,
            );
          }
        }
      } catch (err) {
        console.error("LessonScene: failed to build world", err);
        if (alive) setLoadError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [props.lesson]);

  // P1: the old touch refusal GateCard is GONE — touch-only devices now get
  // the TouchControls overlay (ReadyScene) and a one-time orientation hint.
  const worldName = worldNameBg(lessonDistrictId(props.lesson));
  if (loadError) {
    return (
      <GateCard
        icon="⚠️"
        title="Светът не се зареди"
        body={`Данните за ${worldName} не успяха да се заредят. Провери връзката и опитай пак.`}
      />
    );
  }
  if (!built) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3 text-muted">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-sm">Зареждане на {worldName}…</p>
        </div>
      </div>
    );
  }

  return (
    <ReadyScene
      {...props}
      built={built}
      menuPaused={menuPaused}
      setMenuPaused={setMenuPaused}
      physicsPaused={paused || menuPaused}
      onMinimap={onMinimapFrame}
      onTickCb={onTick}
    />
  );
}

// ───────────────────────────────────────────────────────────────────────────
// THE NAME OF THE BODY THE PHYSICS LAYER JUST HIT
//
// The rule engine collapses a contact STREAM into accidents, and since
// 2026-08-18 it does that per BODY rather than per body-KIND — because a
// per-kind latch gives the second of two victims away free. That fix arrived
// INERT ON THE CHANNEL A STUDENT ACTUALLY DRIVES: the rapier contact handler
// reached `runtime.pushCollision(withWhat)` with no id at all, so every live
// contact was anonymous and the per-body key had nothing to key on.
//
// MEASURED on the shipped reducer (fixtures at 45.9 км/ч, «Пътнотранспортно
// произшествие» rows counted off the debrief):
//
//   two ANONYMOUS vehicle reports 1.0 s apart ……………… 1 bill  ← the defect
//   the same two, NAMED wreck-a / wreck-b ………………………… 2 bills
//   thirteen NAMED reports on ONE body over 6 s ……………… 1 bill ← one accident
//   a clean drive …………………………………………………………………………… 0
//
// So the whole of the live fix is: NAME THE BODY. Both halves of the contract
// stay load-bearing — one contact with one body bills once however long the
// shunt lasts, two separate victims bill twice.
//
// AND THE NAME MUST BE THE SENTINEL'S NAME, NOT A NEW ONE. A browser drive has
// TWO reporters pointed at the same bodies: the director's ContactSentinel,
// which names every staged body it is inside of, and this handler. Measured on
// the same reducer, two DIFFERENT names for one body bill TWICE — so minting an
// independent id here (the shell tag's numeric `npcId`, say) would charge one
// crash as two, which is the 130-точки catastrophe the per-body key was written
// to end. Hence `directorContactCast`: the staged bodies below are the sentinel's
// own cast, resolved through the traffic port, carrying its own `actorId`.
//
// WHAT AN UNNAMED REPORT MEANS HERE, and why the refusals are refusals:
//  · `staticObject` — walls, kerbs, world meshes. No identity exists for these
//    anywhere in the product, so there is nothing to name. They keep the
//    per-category latch, which is what holds the wall-scrape and guardrail pins
//    at one bill for one scrape;
//  · TWO candidate bodies of the reported kind overlapping at once — a car
//    wedged between two others. Naming one of them would be a guess, and a
//    guess that flickers between two names during ONE contact bills it twice.
//    Refusing falls back byte-identically to today's behaviour, which errs
//    toward one bill (A12);
//  · a body no list here covers — an AMBIENT traffic agent. An ambient agent
//    and a staged one are both `traffic.vehicles` entries and this file cannot
//    tell them apart through the traffic module's public API, so a name minted
//    for an ambient agent could collide with the sentinel's name for a staged
//    one and double-bill a single crash. Unnamed is the innocent direction and
//    is exactly what shipped before. See the report: routing the shell tag's
//    `npcId` out of `VehicleRig.onCollisionEnter` closes it, but ONLY together
//    with reconciling that id against the sentinel's `actorId`.
//
// TWO RESIDUES, STATED RATHER THAN HIDDEN, and neither is a regression on what
// shipped:
//  · a contact with an UNCOVERED body (an ambient car) while the player also
//    overlaps a COVERED one (a pile-up) is named for the covered body and
//    merges into its episode. It merged before too — an anonymous report is a
//    continuation of ANY open episode of its kind — so the bill is the same;
//  · the pose read here is the shared `VehicleSample`, which the rig writes
//    once per render frame, while rapier's contact fires inside the physics
//    step. At 46 км/ч that is at most 0.21 m of staleness against touch windows
//    metres wide, and a stale pose can only cost a NAME (→ unnamed → the
//    shipped behaviour), never invent a contact.
//
// ── 2026-08-19 · THE CHANNEL COULD NOT NAME A BODY IT HIT ──────────────────
//
// All of the above shipped INERT, for a reason no test could see: the block
// asked whether the player OVERLAPS a candidate, using `isContact` — tolerance
// exactly ZERO, the sentinel's own ruling — against a grading box sized from a
// DIFFERENT SOURCE than the collider that reported the contact. A naming
// function was written as if it were a detection function.
//
// MEASURED, at the time. Every `traffic.vehicles` entry, whatever its profile,
// was followed by ONE kinematic shell of 0.92 × 2.10 m — NpcColliders sized
// colliders once and never per model. Against the player's 0.85 × 2.02 chassis:
//
//   body            grading box was     rapier fires at   grading fired at
//   staged car      actorObb "car"        4.12 m rear        4.07 m  (−0.05)
//   cyclist proxy   actorObb "cyclist"    4.12 m rear        2.92 m  (−1.20)
//   cyclist proxy   ,, flank              1.77 m             1.08 m  (−0.69)
//   kargo_v obstacle  shell box           5.37 m rear        4.12 m  (−0.57)
//   tram            actorObb "tram"       4.12 m rear        9.02 m  (+4.90)
//
// A CYCLIST COULD THEREFORE NEVER BE NAMED. Its shell was 2.10 m long and its
// grading box 0.90 m, so naming it needed 1.20 m of penetration PAST the
// collider's own face — and the solver's whole job is to keep the chassis out
// of that shell, so the required pose is not reachable. Same for the child
// cyclist (1.35 m) and, from the other end, the tram, whose oversized box
// makes phantom candidates that trip the two-candidates refusal.
//
// And the deferral this file offered — "with no anonymous vehicle report in
// the live stream there is no stepping stone to lay" — was FALSE. The first
// report of a rear-end contact is resolved AT THE ENTER EDGE, where a box that
// is even 5 cm short has not touched yet, so an anonymous stepping stone was
// laid at the start of essentially every contact.
//
// THE FIX, in the two halves the two residues need:
//  (a) SIZE EVERY CANDIDATE FROM THE COLLIDER. Agents get the shell rapier
//      binds; pedestrians keep the disc, which already matched exactly
//      (PEDESTRIAN_BODY_RADIUS_M 0.3 === NpcColliders PED_CAPSULE_RADIUS);
//      scenario obstacles read the per-model tight cuboid ScenarioObstacles
//      measures off the loaded rig and now publishes
//      (`ObstacleColliderFootprint`), because no static table can state a GLB's
//      extents. All three disagreements go to ZERO.
//  (b) …and because ONE disagreement survives (a) — the pose read here is a
//      render frame behind the physics step, priced above at 0.21 m at 46 км/ч
//      and 60 fps, i.e. 0.85 m for two bodies closing at that speed on the
//      30 fps mobile floor — resolve within a REACH rather than on overlap.
//
// WHY A TOLERANCE IS SAFE HERE AND WRONG IN `isContact`. This function never
// runs unless rapier has already declared a contact, so no value of the reach
// can invent one: it decides WHICH body, never WHETHER. `isContact` decides
// whether, and there a tolerance is a band of clear air billed as a crash —
// the founder's own false-failure complaint. Same number, opposite meaning.
//
// A THIRD RESIDUE, WHICH THE REACH WIDENS AND WHICH IS STATED RATHER THAN
// HIDDEN. The ambient-agent case above (a body no list here covers) used to
// borrow a covered body's name only while the player OVERLAPPED that covered
// body; it can now do so while merely within the reach of one. The window grew
// by 0.9 m, and what it costs is the same thing it cost before — one report
// joining the wrong episode, i.e. a possible UNDER-bill. It is bounded by the
// geometry: a staged body within 0.9 m of the chassis at the instant an ambient
// car is struck is a body the chassis is very nearly inside of already. Closing
// it properly needs the shell tag's `npcId` routed out of
// `VehicleRig.onCollisionEnter` and reconciled against the sentinel's
// `actorId`, which is the same fix the ambient residue has always needed.
//
// ── 2026-08-19 · …AND THEN THE COLLIDER MOVED AND THIS DID NOT ─────────────
//
// Half (a) above was implemented as `npcShellObb(pose)` — the 0.92 × 2.10
// constants, which were then a true statement about the shell. The SAME DAY,
// audit O31 gave staged actors real colliders sized per profile
// (`NpcColliders.npcShellHalfExtents` → `actorObb`), which is right and is why
// a truck now stops the player instead of being driven through. The naming side
// stayed on the constants, and the identical defect came back pointing the
// other way — the THIRD time this project has shipped it.
//
// MEASURED at the rear enter edge, against the 0.90 m reach below:
//
//   profile   collider halfL   fires at   2.10-box touches at    gap   named?
//   car            2.05           4.07           4.12          −0.05   yes
//   truck          3.75           5.77           4.12           1.65   NO
//   tram           7.00           9.02           4.12           4.90   NO
//   train         17.20          19.22           4.12          15.10   NO
//
// So a student who rear-ended the staged truck in „Зад камион", or the 14 m
// tram in `sc-rx-tram-left`, was billed for an accident with NO BODY NAMED —
// and TWO tram bodies touched in one pass billed ONE «ПТП» instead of two,
// because an anonymous report keys on `kind:vehicle` and both fell under one
// latch. The per-body episode round 4 built was silently undone for every body
// larger than a hatchback.
//
// THE PHYSICS BODY AND THE GRADING BODY ARE NOW ONE FACT, NOT TWO: both sides
// call `actorObb(pose, profile)`, `npcShellObb` and the two constants are
// deleted, and the cast already carried the `profile` this needs. There is no
// second function left for a rig resize to leave behind — which is the only
// form of this fix that has not already failed twice.
// ───────────────────────────────────────────────────────────────────────────

/** The three collision categories a body can be named for (`staticObject` is
 *  by definition nameless — see the block above). */
type NamedContactKind = "vehicle" | "pedestrian" | "cyclist";

/** One rapier-tagged body this contact could have been with. Vehicles and the
 *  cyclist proxy are BOXES; a pedestrian is a DISC (no body heading) — the
 *  sim/collision split, reused rather than re-derived. */
export interface LiveContactBody {
  readonly id: string;
  readonly withWhat: NamedContactKind;
  readonly box?: Obb2D;
  readonly disc?: { readonly x: number; readonly y: number; readonly radiusM: number };
}

/** The slice of the director's `ContactCastMember` this file reads (structural
 *  — the orchestrator keeps its own type).
 *
 *  `profile` IS READ, and the comment here used to say the opposite — „the
 *  sentinel is a geometric detector and wants the body's real size; this file
 *  wants the shell". That was two answers to one question, and the second one
 *  went stale within the day. The shell IS the profile box now (NpcColliders
 *  sizes it through `actorObb`), so both readers want the same thing and the
 *  cast is the one place that holds it. Absent = "car", exactly as every other
 *  reader of that table treats an ambient agent. */
interface StagedContactBody {
  readonly actorId: string;
  readonly withWhat: NamedContactKind;
  readonly body: "box" | "disc";
  /** Fleet profile that sizes the box (absent = car). Unused for discs. */
  readonly profile?: VehicleProfile;
}

/**
 * The HITTABLE scenario obstacle vehicles, as bodies — built once per lesson
 * (they never move).
 *
 * `visual: true` renders through the same instanced pass but mounts NO
 * collider (ScenarioObstacles' own convention: a purely visual body must not
 * add a crash surface the grading never authored), so it can never be the body
 * rapier reported and is not a candidate. The index still counts it, so these
 * ids line up with the shell tags ScenarioObstacles writes
 * (`SCENARIO_OBSTACLE_NPC_ID_BASE + i` over the same vehicle-filtered list).
 *
 * `footprints` ARE THE COLLIDERS THEMSELVES — the per-model tight cuboids
 * ScenarioObstacles measures off each loaded rig and publishes upward. They
 * matter because the models differ from one another by more than rounding:
 * `kargo_v`, a hittable obstacle in the shipped reversing bay, measures
 * halfLength 2.67 against a hatchback's 2.05, and a `box_truck` would be 3.75.
 *
 * NO FOOTPRINT ⇒ NO CANDIDATE, and that is a refusal rather than an oversight.
 * This used to fall back to a car-sized box, which is the exact shape of the
 * defect the rest of this block is about: a guess is wrong in one of two ways
 * and there is no third. Guess too small for a `box_truck` (1.65 m out, past
 * any reach it is safe to grant) and every frame of that crash is anonymous;
 * guess too large and the phantom overlaps the player, trips the
 * two-candidates refusal, and steals the name of a body that really was hit.
 * There is also nothing to lose by refusing: `footprints` is derived from the
 * very `resolved` array ScenarioObstacles mounts its `CuboidCollider` from, so
 * an obstacle with no published footprint has no collider either and cannot be
 * the body rapier reported. The index still counts it, so the surviving ids
 * stay aligned with the shell tags the renderer writes.
 */
export function hittableObstacleBodies(
  obstacles: readonly ScenarioObstacleSpec[],
  footprints: readonly ObstacleColliderFootprint[] = [],
): LiveContactBody[] {
  const out: LiveContactBody[] = [];
  let index = 0;
  for (const o of obstacles) {
    if (o.kind !== "vehicle") continue;
    const i = index++;
    if (o.visual === true) continue;
    const fp = footprints.find((f) => f.index === i);
    if (fp === undefined) continue;
    out.push({
      id: `obstacle:${i}`,
      withWhat: "vehicle",
      box: {
        x: o.x,
        y: o.y,
        headingDeg: o.headingDeg,
        halfLengthM: fp.halfLengthM,
        halfWidthM: fp.halfWidthM,
      },
    });
  }
  return out;
}

/**
 * O62 — THE SAME MOUNTED BODIES, HANDED TO THE REAR-PROXIMITY CUE.
 *
 * `traffic.rearGapMeters` is what the PROX badge polls at 5 Hz, and its static
 * half was built from the DISTRICT (`traffic/occupiedBayBodies` reads
 * `meta.scenario.bays[].occupied`). The district is not the whole world. Held
 * scenery — the panel van of `sc-park-van`, the garage wall of `sc-park-wall` —
 * is added by lesson id in `scene/scenarioSceneryProps.heldSceneryFor`, lands
 * in the very `built.scenarioObstacles` array two lines up, gets a real
 * collider from `ScenarioObstacles`, and was invisible to the cue. This closes
 * that by handing the traffic system what the scene actually mounted.
 *
 * MEASURED on the shipped traces of `sc-park-van` (lot-van-v1, one hittable
 * `kargo_v` held at 5.03, −2.7), replaying each recorded drive through the
 * source before and after: `shadow-correct` 44 → 73 finite reads and
 * `mistake-early-turn` 97 → 169, and on EVERY one of those samples the held
 * van is the NEAREST body behind the student — so it is not a nuance on top of
 * the bays, it is the body the badge should have been reporting. The third
 * drive, `mistake-blind-reverse`, stays at 0 before and after: its hazard is a
 * pedestrian, and the rear channel must let the right instrument speak.
 *
 * WHAT IT DELIBERATELY DOES NOT FEED, because the badge can only say one
 * sentence. The copy is „Кола отзад · X м" — *a car* behind — so a body that is
 * not a car cannot be reported through it without the badge stating something
 * false, which is the failure this whole channel exists to avoid. That
 * excludes `kind: "wall"` (one in the product: `sc-park-wall`'s garage end
 * wall), `kind: "prop"` cones and poles, and animals. Feeding walls needs a
 * gap query that carries the body KIND and a second, human-signed Bulgarian
 * string; both must land together — routed, not smuggled.
 *
 * AND THE WALL IS NOT THE URGENT HALF, which was worth measuring before
 * assuming. `sc-park-wall/mistake-into-wall` was filed as „the badge is silent
 * for the entire drive". It is — 0 finite reads of 681 samples — but the wall
 * is never BEHIND the car on any of that lesson's three recorded drives (0
 * samples in the rear corridor on all three). That drive is a FORWARD contact:
 * the trace ends at +6 km/h with the debrief «Предницата опря в стената в края
 * на реда». A rear cue that fired there would be reporting a body in front.
 *
 * WHY IT DOES NOT REFUSE ON A MISSING FOOTPRINT, where `hittableObstacleBodies`
 * above does. That function names a body that was ALREADY hit, and a guessed
 * box there steals the name of a real one — silence is the safe answer. This
 * one warns BEFORE contact, where silence is the dangerous answer and reads to
 * a student as „clear behind"; and the fallback is not a guess but exactly the
 * fleet-profile box `occupiedBayBodies` has been shipping since O59. Footprints
 * only exist once the GLBs resolve, so refusing would also make the badge dark
 * for the first seconds of every scenario lesson and dark forever in any
 * headless replay.
 */
export function rearStaticBodiesFrom(
  obstacles: readonly ScenarioObstacleSpec[],
  footprints: readonly ObstacleColliderFootprint[] = [],
): Obb2D[] {
  const out: Obb2D[] = [];
  let index = 0;
  for (const o of obstacles) {
    if (o.kind !== "vehicle") continue;
    // Index over the VEHICLE-FILTERED list, `visual` counted but skipped —
    // ObstacleColliderFootprint's own convention, mirrored from the function
    // above so the two never disagree about which obstacle `i` names.
    const i = index++;
    if (o.visual === true) continue;
    const rad = (o.headingDeg * Math.PI) / 180;
    const fp = footprints.find((f) => f.index === i);
    const box = actorObb({ x: o.x, y: o.y, dirX: Math.sin(rad), dirY: Math.cos(rad) });
    if (fp !== undefined) {
      box.halfLengthM = fp.halfLengthM;
      box.halfWidthM = fp.halfWidthM;
    }
    out.push(box);
  }
  return out;
}

/**
 * Every body the live contact could have been with, at this instant: the
 * director's staged cast at its live poses, plus the static obstacle list.
 * Allocates — a real contact is rare (the same reasoning NpcColliders' near-miss
 * emitters carry), and the frame loop never calls this.
 */
export function liveContactBodies(
  cast: readonly StagedContactBody[],
  stagedPose: (actorId: string) => ActorPose | null,
  obstacles: readonly LiveContactBody[],
): LiveContactBody[] {
  const out: LiveContactBody[] = obstacles.slice();
  for (const m of cast) {
    const pose = stagedPose(m.actorId);
    // No body in the world = nothing to have been inside of (the sentinel's
    // own rule for a missing actor).
    if (pose === null) continue;
    out.push(
      m.body === "disc"
        ? {
            id: m.actorId,
            withWhat: m.withWhat,
            disc: { x: pose.x, y: pose.y, radiusM: PEDESTRIAN_BODY_RADIUS_M },
          }
        : // …the actor's OWN profile box, which IS the shell rapier bound to it
          // (NpcColliders sizes the collider through this same `actorObb` call
          // and pushes it through `setHalfExtents` on rebind). One function, one
          // source: a rig resize moves the collider and this box together, and
          // there is no constant in between for it to leave behind. Reading a
          // fixed 0.92 × 2.10 here is what made a truck, a tram and a train
          // unnameable — see the round-8 block above.
          { id: m.actorId, withWhat: m.withWhat, box: actorObb(pose, m.profile) },
    );
  }
  return out;
}

/**
 * How far OUTSIDE a candidate's collider box a rapier contact may still be
 * resolved onto it, m.
 *
 * DERIVED, not chosen. After the candidate boxes are sized from the colliders
 * themselves, ONE disagreement survives and it is an instrument gap, not a
 * geometry gap: the pose tested here is `VehicleSample`, which the rig writes
 * once per RENDER frame, while rapier's contact fires inside the PHYSICS step.
 * This file already prices that at 0.21 m for a 46 км/ч closing at 60 fps; the
 * mobile floor the audit measured is 30 fps (×2) and two bodies closing at
 * 46 км/ч each doubles it again — 0.85 m. Rounded up: 0.90.
 *
 * IT CANNOT INVENT A CRASH. Nothing calls this except a contact rapier has
 * already declared; the reach decides WHICH body, never WHETHER — which is why
 * the identical number inside `isContact` would be a defect and here is not.
 * Its failure mode is `undefined` (a staler pose than the reach covers), which
 * is byte-identically what shipped.
 */
export const NAMING_REACH_M = 0.9;

/**
 * Name the body a live contact was with, or `undefined` when naming would be a
 * guess — UNIQUE or nothing (see the block above for every refusal).
 *
 * The candidate boxes are the COLLIDERS rapier reports through: the profile
 * shell for an agent (one `actorObb` call, the same one NpcColliders sizes the
 * body with), the published tight cuboid for a scenario obstacle, the capsule
 * radius for a walker. Two bands follow from that:
 *
 *   · OVERLAP (separation ≤ 0) — the shipped rule, verbatim. One overlapping
 *     body of the reported kind is the name; two at once is a coin toss and a
 *     name that flickers during ONE contact bills it twice, so refuse.
 *   · THE REACH — no candidate overlaps, because the pose is a render frame
 *     behind the step that fired. The nearest body within `NAMING_REACH_M` is
 *     the name, and only if it is alone in that band: two candidates inside a
 *     window this coarse are not distinguishable by it.
 *
 * The bands are ordered, not merged: a body the player is genuinely inside of
 * always wins over one merely within reach, so nothing that resolves today
 * resolves differently.
 */
export function nameLiveContact(
  withWhat: CollisionWithWhat,
  player: Obb2D,
  bodies: readonly LiveContactBody[],
): string | undefined {
  if (withWhat === "staticObject") return undefined;
  let overlapped: string | undefined;
  let overlapCount = 0;
  // Nearest candidate strictly outside its box but inside the reach, and how
  // many share that band (the reach's own coin-toss guard).
  let nearestId: string | undefined;
  let nearestSepM = Infinity;
  let withinReach = 0;
  for (const b of bodies) {
    if (b.withWhat !== withWhat) continue;
    const sepM =
      b.disc !== undefined
        ? obbDiscSeparationM(player, b.disc.x, b.disc.y, b.disc.radiusM)
        : obbSeparationM(player, b.box as Obb2D);
    if (isContact(sepM)) {
      overlapCount++;
      overlapped = b.id;
      continue;
    }
    if (sepM > NAMING_REACH_M) continue;
    withinReach++;
    if (sepM < nearestSepM) {
      nearestSepM = sepM;
      nearestId = b.id;
    }
  }
  if (overlapCount > 0) return overlapCount === 1 ? overlapped : undefined;
  return withinReach === 1 ? nearestId : undefined;
}

/**
 * THE SCENE ITSELF, EXPORTED — because a delivery nothing renders is a delivery
 * nothing can see (O62, 2026-08-20).
 *
 * An adversarial refuter deleted BOTH publishers of `traffic.setRearStaticBodies`
 * from this component — the mount effect and the line inside
 * `handleObstacleFootprints` — and 11,696 tests stayed GREEN. Nothing in the
 * repo renders this file, and `__tests__/rearStaticBodies.test.ts` calls the
 * setter itself, so between them they exercise the RECIPE and the RECEIVER and
 * never the SEAM. With the wiring gone `sc-park-van` falls from 242 finite rear
 * reads across its three recorded drives to 141, and the van a student is
 * reversing at goes invisible again — the exact defect O62 closed.
 *
 * A source-text assertion would not catch it. A substring catches DELETION and
 * not NEUTRALISATION, and this audit has already watched a required field
 * pinned with a constant (`advisorOn: true`) satisfy both `tsc` and the grep.
 * The only instrument that cannot be walked past is one that RUNS the
 * component, so `__tests__/rearStaticBodiesSeam.test.tsx` mounts this function
 * through the harness `modules/sim/hud/__tests__/hookHarness` already provides,
 * reads the footprint callback off the RENDERED TREE (matched by component
 * IDENTITY, not by name or by source text), and measures what reaches
 * `traffic.rearGapMeters` on the shipped traces. Deleting either publisher
 * turns that file red; both mutations are recorded in its header.
 *
 * That is the only reason this export exists — `LessonScene` above is still the
 * public component and the only thing any route mounts. It is a component, not
 * an API: nothing outside the test may import it, and a second importer means
 * the split this file has resisted has happened by accident.
 */
export function ReadyScene({
  lesson,
  quality,
  built,
  menuPaused,
  setMenuPaused,
  physicsPaused,
  driveLocked,
  preDriveHighlightStepId,
  activeObjectiveIndex,
  onBlockedDriveAttempt,
  onPreDriveStep,
  onMinimap,
  onTickCb,
  onDriveline,
  onDrivelineRejection,
  onReversePedalStuck,
  onStuckStart,
  onTransmissionChanged,
  onMousePedalsYielded,
  onStagedOutcome,
  onNearMiss,
  onToggleFullscreen,
  attemptRecorderRef,
  dashboardStatusRef,
}: LessonSceneProps & {
  built: Built;
  menuPaused: boolean;
  setMenuPaused: (v: boolean) => void;
  physicsPaused: boolean;
  onMinimap: (f: MinimapFrame) => void;
  onTickCb: (t: SimTick) => void;
}) {
  const { runtime, geometry, district, traffic, director, minimapPolylines, spawnPoints } =
    built;

  // ── DOC 91 §R · W1 — «ПРОДЪЛЖИ» WAS DEAD WITH A THUMB ON THE PEDAL ────────
  //
  // The pause card's resume button was a bare `onClick`, and the second-finger
  // census in `__tests__/tap-activation.test.ts` already named it as one of the
  // two honest residues of the §I2 wave („the first-run touch hint's «Разбрах»
  // and the menu-pause resume"). Wave 7 priced that residue on the product: on
  // SIX OF SIX profiles, with a thumb resting on the drive pad, pressing
  // «Пауза» and then «Продължи» does nothing — the browser does not synthesise
  // a `click` while a second touch point is down — and lifting the pedal thumb
  // makes the identical press work.
  //
  // That is not a cosmetic gap. It is the one card a student raises WHILE
  // DRIVING, i.e. exactly when a thumb is on the glass, so the failure mode is
  // „I paused and now I am stuck". The house idiom fixes it and keeps `onClick`
  // for mouse, keyboard and assistive activation, which is §I2's own rule.
  const tapResume = useTapActivation(() => setMenuPaused(false));

  // S0-View ?ghost=demo: record the scripted shadow drive ONCE per scene
  // (deterministic, <100 ms — the same recorder the vitest suite gates) and
  // play it through ShadowCar + TraceTimeline via a shared clock ref.
  const ghostDemo = useMemo<RecordedDrive | null>(() => {
    if (!built.ghostDemoRaw) return null;
    try {
      return buildPoligonGhostDemo(built.ghostDemoRaw);
    } catch (err) {
      console.warn("LessonScene: ghost demo recording failed", err);
      return null;
    }
  }, [built.ghostDemoRaw]);
  const ghostClockRef = useRef<TraceClock>(createTraceClock());

  // S1 scenario aids (doc 76 §7): the compiled lesson's aids drive the
  // consumers below. Absent aids (every curriculum lesson) = everything
  // inert, byte-identical behavior.
  const aids = lesson.aids;
  const shadowTrace = built.shadowTrace;
  // PARKED AT 0:00, NOT PLAYING — `demoDeckAtRest` carries the two arrival
  // frames and the reasoning. `createTraceClock()` keeps its own `playing: true`
  // default for the dev clip routes that drive it deliberately; what changes is
  // the ONE clock a student's lesson mounts.
  const aidClockRef = useRef<TraceClock>(demoDeckAtRest(createTraceClock()));
  // followHints: sustained deviation from the shadow path → one hint chip.
  const [followHintOn, setFollowHintOn] = useState(false);

  const timeOfDay = lesson.environment?.timeOfDay ?? "day";
  const rain = lesson.environment?.rain ?? false;
  // FOG weather (doc 72 AC-03): dense FogExp2 + dimmed rig in SimEnvironment,
  // and tick.fog through RuntimeDriver → runtime.sample (the rain seam).
  const fogWeather = lesson.environment?.fog ?? false;
  // SNOW weather (doc 72 AC-08): the lighter cold haze + tick.snow — the
  // same seam as fog; the snow-grip PHYSICS rides lesson.physics, never this.
  const snowWeather = lesson.environment?.snow ?? false;
  // WINTER — the SEASON (sc-ac-ice / sc-ac-bridge-ice). One flag, two readers,
  // and it has to be both or neither: <SimEnvironment> grades the light rig and
  // the sky dome cold (presets.ts winterGrade) while <DistrictWorld> browns off
  // the canopies and the verge. A cold key over full-leaf green trees still
  // photographs as July, which is the whole of what those two rows convicted.
  // NOT a weather and NOT a time of day: it feeds no tick channel, arms no
  // conditions envelope and touches no grip — the ice is the district's own
  // icePatch data, exactly as those templates author it.
  const winter = lesson.environment?.winter ?? false;
  const isNight = timeOfDay === "night";
  // The FOLLOWING-GAP badge's thresholds, taken from the LESSON'S OWN rule
  // config so the gauge and the grader can never print different numbers —
  // `hud/followGap.ts` spends a paragraph on why that is the one rule this
  // instrument has. `lesson.ruleConfig` is the same Partial the runtime merges
  // over `DEFAULT_RULE_CONFIG` before `rules/engine.ts` reads it.
  const followTarget = useMemo(
    () => followGapTarget({ ...DEFAULT_RULE_CONFIG, ...(lesson.ruleConfig ?? {}) }, rain),
    [lesson.ruleConfig, rain],
  );
  const level = toLevel(quality);
  // HOW MUCH OF THE РЕГУЛИРОВЧИК'S CAPTION THIS RUNG GETS — the §7 aid ladder
  // reaching the gesture card (`traffic/controllerGestures.ts` carries the
  // derivation and the two sweep-161 rows that forced it). Memoised on the id
  // alone: it is mount-constant, and TrafficLayer repaints the canvas when it
  // changes, so handing it a fresh parse each render would be work for nothing.
  const controllerCaption = useMemo(
    () => controllerCaptionDetailForLevel(parseScenarioLessonId(lesson.id)?.level),
    [lesson.id],
  );
  const spawn = useMemo(() => spawnPose(lesson, spawnPoints), [lesson, spawnPoints]);
  // A7: district-space spawn pose — the start of the FIRST guidance route
  // (before the physics sample goes live). Inverse of the spawnPose mapping.
  const guidanceSpawnStart = useMemo(
    () => ({
      x: spawn.x,
      y: -spawn.z,
      headingDeg: 180 - (spawn.yawRad * 180) / Math.PI,
    }),
    [spawn],
  );

  // Shared mutable channels (refs → zero re-renders at frame rate).
  const telemetryRef = useRef(createTelemetry());
  const simRef = useRef<VehicleSim | null>(null);
  const chassisGroupRef = useRef<Group | null>(null);
  const cameraModeRef = useRef<CameraMode>("cockpit");
  const inputRef = useRef<GatedSimInput | null>(null);
  const cabinRef = useRef<CabinControls | null>(null);
  const audioRef = useRef<SimAudio | null>(null);
  const sampleRef = useRef<VehicleSample>(createVehicleSample());
  /** The crash response (flash + exterior cut) — filled by `ImpactCut`. */
  const impactCutRef = useRef<ImpactCutHandle | null>(null);
  const [cockpit, setCockpit] = useState(true);
  // Difficulty: EVERY SCENE OPENS AT DEFAULT_DIFFICULTY ("normal" since the
  // 2026-07-19 founder ruling — beginner's 40 km/h governor made speeding
  // mistakes impossible to commit; see vehicle/difficulty.ts).
  //
  // It used to restore the last persisted click, which meant one press of
  // „Напреднал" silently pinned every subsequent scenario to the manual tier —
  // the founder hit that reviewing the 150 and could not tell why every scene
  // behaved differently from the one before. A tier is a choice about THIS
  // drive, not a setting that follows you around; the picker still switches it
  // mid-scene, and storeDifficulty still records the click for anything that
  // wants to know the preference.
  //
  // …AND A LESSON MAY NAME THE TIER IT OPENS ON — sc-vp-stall:e4dfb43f
  // (critical), 2026-08-25. The clutch drill commands «Съединител докрай», a
  // first gear and a bite point in four of its five steps, and
  // `transmissionModeFor` gives a clutch only on „Напреднал". Round 10 asked
  // the STUDENT to switch first; the next sweep read gear D on all 80 sampled
  // frames of all three legs, so the drill never once ran on a car it could be
  // performed in. `openingTier` (contracts.ts) is the same kind of statement as
  // `vehicleStart` — which car is handed over — and it SEEDS this state rather
  // than pinning it, so the picker below still switches tiers mid-drive.
  const [difficulty, setDifficultyState] = useState<DifficultyMode>(
    lesson.openingTier ?? DEFAULT_DIFFICULTY,
  );
  const difficultyRef = useRef<DifficultyMode>(difficulty);
  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);
  // Selector click path ONLY — never called with the default (the storage
  // contract: absent key = no explicit choice, follows future default flips).
  const setDifficulty = useCallback((mode: DifficultyMode) => {
    setDifficultyState(mode);
    storeDifficulty(mode);
  }, []);
  /**
   * THE TIER'S SPEED CEILING, for the instrument readout to PRINT.
   *
   * The same three inputs `VehicleRig` hands `applyDifficulty` — tier, the
   * map's speed domain (#37) and the speed the lesson itself requires (B7) —
   * so the number on screen is the number the physics is enforcing and cannot
   * drift from it. It changes only on a tier click, hence a memo and not a
   * per-frame read; it rides the dashboard channel from here (see the write in
   * RuntimeDriver's frame block).
   */
  const tierCapKmh = useMemo(
    () => governorCapKmh(difficulty, built.lessonMaxLegalKmh, built.lessonRequiredKmh),
    [difficulty, built.lessonMaxLegalKmh, built.lessonRequiredKmh],
  );

  // P1 touch layer: capability decides the overlay mount (touch laptops
  // included — the overlay auto-hides while the keyboard is in use, so
  // keyboard devices see zero change); touch-ONLY devices additionally get
  // the one-time orientation hint and a collapsed keyboard legend.
  const [touchCapable] = useState(() => hasTouchScreen());
  const [touchOnly] = useState(() => isTouchOnlyDevice());
  // Dev-only renderer stats logger (draws/tris/fps per frame, all passes).
  const [perfLog] = useState(() => shouldLogPerf());
  const [touchSource] = useState(() => new TouchInputSource());
  const [showTouchHint, setShowTouchHint] = useState(shouldShowTouchHint);
  /** The touch hint card's own element, read by the ceiling's painted clock.
   *  `touchHintOnGlass` needs the NODE, not the flag: `showTouchHint` is true
   *  for the whole ~18 s the briefing covers the card, and that is precisely
   *  the stretch that must not be charged to the student's attention. */
  const hintRef = useRef<HTMLDivElement | null>(null);
  // Auto-reverse assist (founder 2026-07-17: „стрелката надолу не кара
  // назад"): the pure timing machine (engine/reverseAssist.ts) plus the flag
  // that marks assist-driven selector steps, so the driveline subscription
  // below can tell them from MANUAL shifts ([ / ], touch gear sheet, cockpit
  // hotspots) — manual shifts silence the assist for 2 s (never fight
  // explicit input). DISABLED for the whole session on examMode lessons:
  // the exam grades the real selector procedure (D↔R via the gate).
  const [reverseAssist] = useState(() => new ReverseAssist());
  const assistShiftingRef = useRef(false);
  const reverseAssistEnabled = lesson.examMode !== true;
  // …and the watcher that gives LAW 2 a voice (engine/reverseStuck.ts).
  // Deliberately NOT gated again on reverseAssistEnabled or on the box: it
  // reads the MAPPER, and the mapper can only disown a channel it actually
  // flipped (`input.reversePedalRemap` below already carries the exam gate,
  // the automatic-only rule and the live selector). So this speaks wherever a
  // pedal is actually refused — the [ / ] keys, the touch gear sheet, the
  // cockpit lever — and stays silent everywhere else, which since 2026-08-11
  // includes the ASSIST route: an armed press is no longer disowned, so there
  // is nothing to explain and a card explaining a refusal that did not happen
  // would be worse than silence.
  const [reverseStuck] = useState(() => new ReverseStuckWatch());
  // …and its neighbour for the OTHER silence: not a guard refusing the pedal,
  // but the car itself — engine off / P / N / parking brake on, on a rung with
  // no pre-drive phase and therefore no QW10 explanation (engine/stuckStart.ts
  // carries the drive-rig measurement that found it).
  const [stuckStart] = useState(() => new StuckStartWatch());
  /** THE ACKNOWLEDGED exit: read, understood, gone for good on this device. */
  const dismissTouchHint = useCallback(() => {
    setShowTouchHint(false);
    try {
      window.localStorage.setItem(TOUCH_HINT_STORAGE_KEY, "1");
    } catch {
      // Private mode — the hint just shows again next session.
    }
  }, []);
  // …and §C2's pointer path beside it, because `onClick` is the one activation
  // a driver cannot reach. A touch-borne `click` is a COMPATIBILITY MOUSE EVENT
  // and the spec dispatches those only for the PRIMARY touch point, so with a
  // thumb already on a pedal pad this button produced `pointerdown → pointerup`
  // and nothing else — the card's only exit, dead in exactly the posture the
  // card is read in. `tapActivation.ts`'s own census had this button pinned as
  // „the single honest residue"; this is it coming off the list. `onClick`
  // STAYS: keyboard Enter/Space, assistive activation and `element.click()`
  // arrive as a click and produce no pointer event to hang off, and the shared
  // idiom de-duplicates so a mouse press cannot fire twice.
  const tapDismissTouchHint = useTapActivation(dismissTouchHint);

  // ── AND THE AUTOMATIC EXIT — THE HINT USED TO HAVE NO LIFETIME AT ALL ──────
  //
  // Measured on sc-park-night: present in 43 of 43 driving frames, 03-ready
  // → 07-end, 3 min 39 s, printed across ~70 % of the interior rear-view mirror
  // in the one lesson whose briefing grades mirror use. It is a ghost surface —
  // bare type on the world — so every second it is up is a second of the world
  // deleted, and nothing but a press could end it.
  //
  // The hint teaches where the thumbs go; a rolling car is the proof they
  // landed. So it stands down at the rule engine's own „moving" floor (5 km/h,
  // `touchHintLifetime.ts`) — and it stands down WITHOUT persisting, unlike the
  // button above: an automatic exit may get the words out of the way, but it may
  // never decide on the student's behalf that they were read. A student who
  // drove off without reading meets the card again next lesson, at a standstill,
  // where it is legible and covers nothing that moves.
  //
  // The poll runs only while the hint is up (a few seconds, once per device) and
  // reads one number off the sample the frame loop already writes — the frame
  // loop that grades gains no line for a piece of disappearing type.
  //
  // ── AND THE SECOND EXIT, wired 2026-08-26 ─────────────────────────────────
  //
  // The speed exit fires in 213 of the 224 measured mobile runs. The residue is
  // the 11 where the car never once read above the moving floor — a lesson that
  // is graded standing still, or a student who never pressed anything — and for
  // those the card had no lifetime at all: bare white type across ~70 % of the
  // interior rear-view mirror until the drive ended. `touchHintShouldHide` ORs
  // the two, so the ceiling only ever ends a card the speed exit did not.
  //
  // THE CLOCK MUST BE A PAINTED CLOCK. Adding the poll interval to `shownMs`
  // unconditionally is the wrong inlining, and it is wrong in the direction
  // that costs a lesson (the test next door refuses that literal outright):
  // this interval is born with the scene, and the card spends the first 17.1–21.8 s
  // of every mobile lesson mounted and `display: none` behind the briefing. That
  // would spend ~18 s of the ceiling before the card's first painted frame and
  // then delete the words early, on a student who never saw them. So the tick
  // goes through `touchHintAccrue(shownMs, touchHintOnGlass(hintRef.current))`,
  // which advances only on a tick it can prove was painted — and a tick it
  // cannot judge (null ref, detached node, backgrounded tab) advances nothing,
  // pushing the ceiling LATER rather than earlier.
  //
  // Like the speed exit, this one calls the setter directly and never touches
  // `sim.touchHintSeen`: an automatic exit may get the words out of the way, but
  // only «РАЗБРАХ» may decide on the student's behalf that they were read.
  useEffect(() => {
    if (!showTouchHint) return;
    let shownMs = 0;
    const id = window.setInterval(() => {
      shownMs = touchHintAccrue(shownMs, touchHintOnGlass(hintRef.current));
      if (touchHintShouldHide(sampleRef.current.speedKmh, shownMs)) setShowTouchHint(false);
    }, TOUCH_HINT_POLL_MS);
    return () => window.clearInterval(id);
  }, [showTouchHint]);

  // Camera toggle + car reset, shared by the key callbacks (C/R) and the
  // touch overlay buttons — one code path per action. S0-View: C CYCLES three
  // views — cockpit → chase → top-down (doc 76 §4, view-only concern: grading
  // never reads the camera). Curriculum lessons and the exam bank always carry
  // the full cycle. SCENARIO rungs read their compiled aids — which since the
  // 2026-07-17 founder ruling grant top-down on EVERY level (compile.ts
  // DEFAULT_LEVEL_AIDS): a POV is not an aid, and reverse-park is unreadable
  // without G. The read stays instead of collapsing to `true` because a rung
  // may still opt OUT explicitly (aids: { topdownAllowed: false }) — that rung
  // must really lose G.
  const topdownInCycle = !isScenarioLessonId(lesson.id) || aids?.topdownAllowed === true;
  /**
   * THE SAME VIEW, AS A VALUE THE HUD CAN READ — doc 91 §I23.
   *
   * `cameraModeRef` stays the per-frame source of truth (CameraRig reads it
   * once a frame; a camera tick must never cost a render). This mirrors it for
   * the ONE consumer that has to draw which view is live: the touch view rail,
   * which is a three-cell popover and not a blind cycle button. It changes only
   * on an explicit view change — the same edge that already calls `setCockpit`,
   * so this adds no render that was not happening anyway.
   */
  const [cameraMode, setCameraModeState] = useState<CameraMode>("cockpit");
  /** ONE writer for the view, so the ref, the cockpit flag and the HUD's copy
   *  cannot drift. Every path below goes through it. */
  const applyCameraMode = useCallback((next: CameraMode) => {
    cameraModeRef.current = next;
    setCockpit(next === "cockpit");
    setCameraModeState(next);
  }, []);
  const toggleCamera = useCallback(() => {
    const order: CameraMode[] = topdownInCycle
      ? ["cockpit", "chase", "topdown"]
      : ["cockpit", "chase"];
    const idx = order.indexOf(cameraModeRef.current);
    const next = order[(idx + 1) % order.length]; // idx −1 (stale topdown) → cockpit
    applyCameraMode(next);
  }, [topdownInCycle, applyCameraMode]);
  /** Pick a view outright (the touch rail's three cells). Top-down is refused
   *  where the lesson refuses it, exactly as the C cycle already skips it. */
  const selectCameraMode = useCallback(
    (mode: CameraMode) => {
      if (mode === "topdown" && !topdownInCycle) return;
      applyCameraMode(mode);
    },
    [topdownInCycle, applyCameraMode],
  );
  /** CameraRig fills this on mount — the touch rail's door to G and N. */
  const topdownAidRef = useRef<TopdownAidHandle | null>(null);

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * THE DECK IS HIDDEN WHILE THE ⚙ SHEET IS UP — SO IT MUST ALSO STOP.
   * Doc 91 §D4/§I11 — J-WAVE-2. THIS IS THE HALF CSS CANNOT DO.
   *
   * The arbitration itself is written twice already and neither copy is here:
   * `TouchControls` publishes `html[data-sim-car-sheet]` and `PlayAreaStyles`
   * turns the deck off against it, because the two surfaces are bottom-anchored
   * to the SAME `TOUCH_CONTROLS_FLOOR` and measured 5 590–20 064 px² of surface
   * on top of each other with 7–9 dead controls. Those files carry the numbers.
   *
   * WHAT THEY CANNOT CARRY IS THE PLAYHEAD. `display: none` stops a panel being
   * seen; it does not stop a demonstration RUNNING. The deck auto-plays
   * (`playing: true` is TraceTimeline's seed), so a student who opened the car
   * controls mid-demonstration came back to a replay that had gone on without
   * them — which is exactly the cost this wave was told to answer: "someone
   * mid-demonstration needs to get back to where they were."
   *
   * So the scene, which owns the clock, pauses it for as long as the deck is
   * off screen and puts it back exactly as it was found. Nothing else about the
   * deck is touched — its `open` state is its own, the playhead is a ref — so
   * the way back is the same frame, the same caption and the same position, and
   * the way back is the same ⚙ that sent it away, which stays on screen and
   * stays lit the whole time.
   *
   * WHAT THE STUDENT STILL LOSES, STATED PLAINLY: while the sheet is open the
   * demonstration's caption is not readable, and a demonstration cannot be
   * STARTED from that state — the toggle is off screen with the rest of the
   * deck. Both are one tap from being back. Neither was true before in any
   * useful sense: with both surfaces up, the deck's own «🎬 Демонстрация ▸»
   * answered a sheet cell at its own centre, so the control that opens a
   * demonstration was already dead — it just looked alive.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const [touchSheetOpen, setTouchSheetOpen] = useState(false);

  // Enter top-down directly (used by the G/N top-down hotkeys so they work
  // from any view instead of silently no-op'ing outside top-down). Guarded by
  // topdownInCycle at the call site — exam rungs, where top-down is disallowed,
  // never enter it.
  const enterTopdown = useCallback(() => {
    if (cameraModeRef.current === "topdown") return;
    applyCameraMode("topdown");
  }, [applyCameraMode]);

  // D11: is the „виж мястото отгоре" cue allowed on this lesson at all? Pure
  // spec read (bay/turn maneuver + beginner rung + top-down reachable + not an
  // exam) — the cue's own state machine decides the MOMENT.
  const cameraHintEligible = useMemo(
    () => cameraAidHintEligible(lesson, topdownInCycle),
    [lesson, topdownInCycle],
  );
  const readIsTopdown = useCallback(() => cameraModeRef.current === "topdown", []);

  // Mirror of the driveLocked prop so the input lifecycle effect (which runs
  // once) can seed a freshly created input with the current gate state.
  const driveLockedRef = useRef(driveLocked);

  // A8: the scenario director rides in a ref (created in the load path, used
  // by the frame loop + the R-key reset) and drives the L5 hazard visual via
  // this render-free flag ref (TrafficLayer reads it per frame).
  const directorRef = useRef<ScenarioDirector | null>(director);
  useEffect(() => {
    directorRef.current = director;
  }, [director]);
  const hazardActiveRef = useRef(false);
  // N11 (VP-06): the cockpit-lamp twin of hazardActiveRef — RuntimeDriver
  // copies director.telltaleLit here each frame; VitokCockpit's cluster lights
  // the red temperature telltale off it (render-free). The edge additionally
  // flips the L1/L2 HUD cue state below (state changes only on edges).
  const telltaleLitRef = useRef(false);
  const [telltaleCueOn, setTelltaleCueOn] = useState(false);
  // …and its AMBER twin (lamp "checkEngine"): the OTHER half of the VP-06
  // triage. Its own ref and its own cue, because the two colours ask for
  // opposite things and a lesson stages both on one route.
  const telltaleCautionLitRef = useRef(false);
  const [telltaleCautionCueOn, setTelltaleCautionCueOn] = useState(false);
  // #24 wiper visual channel: VehicleRig writes the live blade sweep +
  // wiped-arc clearing level per frame; WindshieldDroplets reads it (render-
  // free ref, the hazardActiveRef pattern).
  const wiperVisualRef = useRef({ sweep01: 0, clearing: 0 });

  /** Respawn (key R and the touch sheet's „Рестарт") — same code path. */
  const resetCar = useCallback(() => {
    simRef.current?.reset();
    // A8: retry re-stages every staged encounter (fresh attempt seed).
    directorRef.current?.reset();
  }, []);

  // A2 performed pre-drive: raw transition queues, drained by RuntimeDriver's
  // frame loop and resolved to procedure steps (performedSteps.ts). Driveline
  // events arrive via subscribe (below); glances via the cabin callback (both
  // Q/E/F keys AND mirror-hotspot clicks land there — one graded path).
  const drivelineEventsRef = useRef<DrivelineEvent[]>([]);
  const glanceQueueRef = useRef<MirrorGlanceKind[]>([]);

  // -- [glance-pings] look-left/right teaching affordances (founder
  // 2026-07-20) — ISOLATED ADDITIVE WIRING, nothing else in this file.
  // GlanceEdgePings (mounted in the overlay below) installs a read-only
  // observer into this ref; the wrapper feeds every tick through it BEFORE
  // the shell's handler. No new engine channel, grading untouched — the
  // overlay only consumes the junction-proximity + mirrorGlance data the
  // HUD tick stream already carries.
  const glancePingTapRef = useRef<GlancePingTap | null>(null);
  const onTickWithGlancePings = useCallback(
    (t: SimTick) => {
      glancePingTapRef.current?.(t);
      onTickCb(t);
    },
    [onTickCb],
  );

  // Input + cabin + audio lifecycle.
  useEffect(() => {
    const input = new GatedSimInput({
      onToggleCamera: toggleCamera,
      onReset: resetCar,
      onTogglePause: () => setMenuPaused(!menuPaused),
    });
    input.driveLocked = driveLockedRef.current;
    // P1: the touch overlay's axis source joins the SAME read() pipeline
    // (merged before the QW10 gate + difficulty shaping).
    //
    // ATTACHED UNCONDITIONALLY since the 2026-07-30 mouse-first review: on a
    // non-touch device the SAME source now carries the MousePedals pads, which
    // is what makes pre-drive steps 8 (натисни спирачката) and 13 (потегли)
    // reachable without a keyboard. The merge is a no-op while no axis is
    // active, so a keyboard-only session is byte-identical to before.
    input.attachTouch(touchSource);
    inputRef.current = input;
    const audio = new SimAudio();
    audioRef.current = audio;
    // Spawn policy, resolved once — the lamp rule below needs the same answer.
    //
    // 2026-07-31, THE ROOT CAUSE OF „0/13 → 1/13 AND STOPS". The rule below
    // used to read `preDriveMode === "assess" ? "cold" : "ready"`, i.e. only
    // the EXAM kept a cold car. Урок 1 „Подготовка и потегляне", whose entire
    // subject is the thirteen steps, therefore opened with the engine already
    // running, the selector already in D and the parking brake already off —
    // and three of its own steps became unperformable, because a performed step
    // needs a real TRANSITION: `engineStarted`, `selectorChanged→D`,
    // `parkingBrakeChanged→off`. Clicking the starter on a running engine stops
    // it. Clicking the selector in D is rejected at the end of the gate.
    // Clicking the parking brake PULLS it. That is precisely the founder's
    // measurement — every clickable control clicked, one step ticked.
    //
    // So the marker is `preDrive`, not `preDriveMode`: a lesson that TEACHES
    // the procedure needs the cold car just as much as the one that GRADES it.
    // Handing Урок 1 a running engine deletes Урок 1. The 150 scenarios — his
    // „the seatbelt is the only item left" ruling, commit 265629d — declare no
    // pre-drive at all and are untouched by this: they still spawn ready.
    const vehicleStart = lesson.vehicleStart ?? (lesson.preDrive ? "cold" : "ready");
    const cabin = new CabinControls(
      {
        onSeatbeltToggle: () => audio.click(),
        onToggleMute: () => audio.toggleMute(),
        onParkingBrakeToggle: () => audio.click(),
        // A2: every glance (keys Q/E/F or a mirror hotspot click) feeds the
        // procedure observer — the same event the rule engine already grades.
        onGlance: (mirror) => glanceQueueRef.current.push(mirror),
      },
      // Spawn policy. An explicit `vehicleStart` always wins. Otherwise the
      // question is whether THIS lesson is teaching the pre-drive or merely
      // requiring it before the real lesson can begin.
      //
      // It used to default to "cold" everywhere (A1 policy), which meant every
      // one of the 150 scenarios opened with the engine off in P. The founder
      // reviewing them hit ignition + selector on all 150 before reaching the
      // thing he wanted to look at, and asked for exactly one item left
      // outstanding at spawn: the seatbelt. That is the right call — an unbelted
      // start still teaches the habit that matters, because the belt is the one
      // pre-drive step whose omission the rule engine goes on grading for the
      // whole session.
      //
      // `preDriveMode: "assess"` is the marker for a lesson that is GRADING the
      // pre-drive — the exams. Those keep the cold start, because performing it
      // is the thing being measured; handing them a running engine would delete
      // the assessment. Everything else spawns ready-to-drive.
      vehicleStart,
      // doc 86 L10: a car handed over „ready" into night/rain/fog is handed
      // over with the low beams ON — otherwise the student collects an
      // основна HEADLIGHTS_OFF_AT_NIGHT before touching a control, on 34 of
      // 154 scenarios. The three lessons whose subject IS the switch are
      // excluded inside initialHeadlightsFor().
      initialHeadlightsFor({
        vehicleStart,
        night: isNight,
        rain,
        fog: fogWeather,
        preDrive: lesson.preDrive,
        lessonId: lesson.id,
      }),
      // The same invariant on the other red lamp (cabin.ts's spawn block, and
      // .audit-frames/w10-3/frames/sc-vp-handbrake__pc-wrong/01-arrival.png:
      // 0 км/ч, no input yet, the `brake` telltale dark on the lesson whose
      // premise is that the handbrake is UP). A lesson whose briefing ORDERS
      // «Свали ръчната» must hand the car over with it pulled, or the order is
      // pre-performed and the lamp it tells the student to watch never lights.
      initialParkingBrakeOnFor({
        vehicleStart,
        preDrive: lesson.preDrive,
        lessonId: lesson.id,
      }),
    );
    cabinRef.current = cabin;
    // A2: observe every driveline transition (ignition/selector/parking
    // brake/…) — RuntimeDriver drains the queue and resolves steps from it.
    const unsubscribeDriveline = cabin.driveline.subscribe((event) => {
      drivelineEventsRef.current.push(event);
      // Auto-reverse assist bookkeeping: a selector change NOT initiated by
      // the assist itself is an explicit driver shift → 2 s of silence; and
      // the rule-b pedal remap tracks the live selector × transmission on
      // every event (selectorChanged, transmissionChanged — recomputing on
      // the rest is a cheap no-op).
      if (event.kind === "selectorChanged" && !assistShiftingRef.current) {
        reverseAssist.noteManualShift();
      }
      const remap =
        reverseAssistEnabled &&
        shouldRemapReversePedals(cabin.driveline.selector, cabin.driveline.transmission);
      // LAW 2's scope (engine/reverseAssist.ts, 2026-08-11). The mapper disowns
      // the channel that INHERITS the throttle role at a flip, because on a
      // hand-worked selector the foot on it was braking. The assist's own step
      // is the one flip where that is known to be false — LAW 1 will not arm a
      // press unless the car was already stopped with the pedal lifted — and
      // disowning it is what made the founder press ↓ twice to reverse once.
      // Recorded HERE, on the transition, because `read()` cannot ask later.
      if (remap !== input.reversePedalRemap) {
        input.reversePedalRemapSource = assistShiftingRef.current ? "assist" : "manual";
      }
      input.reversePedalRemap = remap;
    });
    const unlock = () => audio.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      unsubscribeDriveline();
      touchSource.releaseAll();
      input.dispose();
      inputRef.current = null;
      cabin.dispose();
      cabinRef.current = null;
      audio.dispose();
      audioRef.current = null;
    };
    // menuPaused intentionally excluded — the handler reads it via closure at
    // toggle time; re-subscribing every toggle would drop key state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMenuPaused]);

  // QW10: keep the input gate in lockstep with the lesson phase.
  useEffect(() => {
    driveLockedRef.current = driveLocked;
    if (inputRef.current) inputRef.current.driveLocked = driveLocked;
  }, [driveLocked]);

  // A2: cockpit hotspot interaction — pointer-active only in the cockpit
  // camera view; instruction mode pulses the pending step's hotspot(s).
  // (The old QW5 "checklist click forces cabin state" effect is gone: state
  // transitions now COMPLETE steps, never the reverse.)
  const cockpitInteraction = useMemo(
    () => ({ enabled: cockpit, highlightStepId: preDriveHighlightStepId }),
    [cockpit, preDriveHighlightStepId],
  );

  // S1 (doc 62): the lamp render callback consumes the GRADED signal state —
  // runtime.signalLampState is mode-aware (dark → unlit, flashingAmber → the
  // blink pair on the runtime clock) and approach-aware (each head lights its
  // own arm's axis-group, including any signalPlan/staged pin rebase). Never
  // wire runtime.signalPhase here: it ignores cluster modes by contract.
  const getSignalPhase = useCallback(
    (id: string, approachBearingDeg: number) => runtime.signalLampState(id, approachBearingDeg),
    [runtime],
  );

  // Rail-barrier arm sync (agent R): the guarded-crossing arm follows the
  // SAME validated timetable runtime.sample() grades, at the last graded
  // clock — one truth, never a render-side second clock (rx-guarded/rx-drop).
  const getRailBarrierDown = useCallback(
    (x: number, y: number) => runtime.railBarrierDownAt(x, y),
    [runtime],
  );

  // The hittable obstacle bodies never move, but their SIZES are not known
  // until the rigs load: each obstacle's collider is a per-model tight cuboid
  // measured off the GLB, and ScenarioObstacles publishes those extents here as
  // it mounts them. A ref rather than state — this feeds a rapier callback, not
  // a render, and re-rendering the whole scene when a footprint arrives would
  // buy nothing. Empty until the models resolve, which is also exactly when
  // there is no obstacle collider for rapier to report.
  const obstacleFootprintsRef = useRef<readonly ObstacleColliderFootprint[]>([]);
  const handleObstacleFootprints = useCallback(
    (footprints: readonly ObstacleColliderFootprint[]) => {
      obstacleFootprintsRef.current = footprints;
      // O62: the rear cue's static bodies get RE-published here, because this
      // is the moment their real extents stop being the fleet-profile guess.
      // `kargo_v`, the held van of sc-park-van, measures halfLength 2.67
      // against a hatchback's 2.05 (the figure `hittableObstacleBodies` above
      // records) — 0.62 m the badge would otherwise report as clear air behind
      // a student who is reversing.
      //
      // THIS LINE IS UNDER TEST — `__tests__/rearStaticBodiesSeam.test.tsx`
      // mounts this component, takes this very callback off the RENDERED TREE
      // (`ScenarioObstacles.onColliderFootprints`, matched by component
      // identity) and fires it. Deleting the line, or leaving it computing and
      // not delivering, turns that file red at 73 vs 103 finite reads and
      // 0.401 vs 0.271 m on `sc-park-van/shadow-correct` (M2 and M4 in its
      // header). Before that file existed both publishers here could be DELETED
      // with 11,696 tests green.
      //
      // ── THE OPEN QUESTION FROM 2026-08-20, NARROWED ────────────────────────
      //
      // What the previous round wrote down: instrumented live against a local
      // server, the effect below fired on mount on every lesson tried, and THIS
      // callback produced no log within ~3 minutes on `/dev/ghost-demo` for
      // either `sc-park-van` or `sc-park-bay-exit-rev`, though the fleet GLBs
      // and the DRACO decoder all answered 200.
      //
      // What is now established, by reading the publisher rather than by
      // watching for it: `ScenarioObstacles` calls this from a bare
      // `useEffect(() => { onColliderFootprints?.(footprints) }, [footprints,
      // onColliderFootprints])` inside `ObstacleVehicles` — the SAME component
      // that mounts the `CuboidCollider`s and the instanced rigs, derived from
      // the same `resolved` array. There is no branch in which the parked cars
      // render and this does not fire. So the non-observation is either an
      // instrumentation artifact or the whole subtree never mounting, and those
      // two are distinguishable BY EYE IN ONE FRAME: if it never mounted, the
      // bay beside the student is EMPTY. The previous round recorded that the
      // parked bodies rendered on the same drive that produced no log, which
      // settles it as instrumentation.
      //
      // WHAT IS STILL NOT PROVEN ANYWHERE, and it is the other side of this
      // seam rather than this one: nothing in the repo asserts that
      // `ScenarioObstacles` calls `onColliderFootprints` at all —
      // `scenarioObstacles.test.ts` tests the helpers only. That belongs to
      // that file's lane, not this one. It matters beyond the badge because
      // `hittableObstacleBodies` REFUSES without these footprints, so wherever
      // they truly never arrive, every obstacle contact is billed anonymous.
      traffic.setRearStaticBodies(rearStaticBodiesFrom(built.scenarioObstacles, footprints));
    },
    [traffic, built.scenarioObstacles],
  );

  // …and the same bodies published ONCE UP FRONT, from the spec alone.
  //
  // The callback above cannot be the only publisher: `ScenarioObstacles` is
  // Suspense-mounted and reports only after its GLBs resolve, and it is not
  // mounted at all when the list is empty — so between them the traffic system
  // would keep the district-derived default for the first seconds of every
  // scenario lesson, and keep it FOREVER on a lesson that mounts nothing.
  //
  // THE SECOND CASE IS A GUARD, NOT A LIVE DEFECT, and the sentence here used
  // to overstate it. `buildLessonWorldCore` builds obstacles only for a
  // SCENARIO lesson id, so a hand-authored lesson on one of the bay-carrying
  // districts would show PAINTED bays with no cars in them while the district
  // default warned about bodies that are not there. MEASURED 2026-08-20: NONE
  // of the 8 lessons in `lessons/specs.LESSONS` loads a `lot-*` district, so
  // no shipped lesson is in that state today — it is one authoring decision
  // away, which is the argument for the guard rather than for a bug report.
  // `rearStaticBodiesSeam.test.tsx` §3 holds it by mounting this component for
  // a lesson whose id the recipe does not recognise: no `ScenarioObstacles` in
  // the tree at all, and `lot-narrow-v1`'s 66 district warnings become 0.
  //
  // THE FIRST CASE IS LIVE ON EVERY SCENARIO PARKING LESSON, and it is why the
  // publish must happen before the badge's first 200 ms poll.
  //
  // THIS EFFECT IS UNDER TEST — same file, §1: deleting it drops
  // `sc-park-van/shadow-correct` from 73 finite reads to 44 and
  // `mistake-early-turn` from 169 to 97 (M1), and neutralising it to
  // `setRearStaticBodies([])` drops both to 0 (M3).
  useEffect(() => {
    traffic.setRearStaticBodies(
      rearStaticBodiesFrom(built.scenarioObstacles, obstacleFootprintsRef.current),
    );
  }, [traffic, built.scenarioObstacles]);

  // A real impact (VehicleRig gates by relative speed) → queue a collision for
  // the rule engine, which grades it опасна and terminates the session. A11:
  // `withWhat` now reflects what was actually hit — NPC shells classify as
  // vehicle/pedestrian/cyclist; untagged world geometry stays staticObject.
  //
  // …AND WHICH BODY, which is the half that was missing and the half the
  // engine's per-body episode key keys on: two different bodies struck inside
  // `collisionSeparationSec` billed ONE accident while every live report
  // arrived anonymous. `nameLiveContact` resolves it off the same
  // sim/collision geometry the director's sentinel grades with, using the
  // sentinel's OWN cast ids — see the block above ReadyScene for the
  // measurements, and for what an unnamed report means.
  // AC-12 — the wind's DEPICTION channel (sc-ac-wind-truck-pass:6a076479,
  // sc-ac-crosswind:e0b9507e). The same `currentWindN()` the chassis is being
  // pushed with below (windLateralN/windGustAmplitudeN/windGustPeriodSec) is
  // what the air is drawn with, read per FRAME out of the live sim rather than
  // recomputed on a render clock: `VehicleSim` advances its wind clock by
  // FIXED_DT per physics step and `reset()` rewinds it, so a second clock would
  // drift out of phase exactly where the lesson asks the student to read the
  // gust. Identity-stable so the environment never remounts its mote field.
  const readWindLateralN = useCallback(() => simRef.current?.windLateralNow ?? 0, []);

  const handleCollision = useCallback(
    (impactKmh: number, withWhat: CollisionWithWhat) => {
      const sample = sampleRef.current;
      // f0023997: the crash has to be VISIBLE. Presentation only — it reads no
      // grading state and writes none, so a refused cut can never change a
      // verdict (`ImpactCut`'s header carries the measurement).
      impactCutRef.current?.impact(impactKmh);
      runtime.pushCollision(
        withWhat,
        nameLiveContact(
          withWhat,
          playerObb(sample.position.x, sample.position.y, sample.headingDeg),
          liveContactBodies(
            directorContactCast(director),
            (actorId) => traffic.staged(actorId),
            // Built per contact, not per lesson: the footprints arrive with the
            // rigs. A real contact is rare (NpcColliders' own reasoning for its
            // near-miss emitters) and the frame loop never reaches this.
            hittableObstacleBodies(built.scenarioObstacles, obstacleFootprintsRef.current),
          ),
        ),
      );
    },
    [runtime, director, traffic, built.scenarioObstacles],
  );

  return (
    <div className="relative h-full w-full">
      <Canvas
        // "percentage" = PCFShadowMap. Bare `shadows` requests PCFSoftShadowMap,
        // which three r185 deprecated — it falls back to PCFShadowMap anyway but
        // logs a deprecation warning on every shadow render (hundreds/session).
        // Explicit type: identical output, silent console.
        shadows="percentage"
        // THE ONE THING THE PAUSE NEVER STOPPED — measured, doc 91 §I19.
        //
        // `physicsPaused` already stops the world for every card the product
        // puts on screen (teach moment, micro-quiz, consequence, the lesson
        // menu, the debrief). The Canvas carried no `frameloop`, which means
        // R3F's default "always": a scene the student cannot interact with kept
        // being redrawn at the panel's full rate underneath the card he was
        // reading. Measured on the production build, `l0-free-drive`,
        // iPhone-16-landscape viewport at tier low: 233.8 draws/frame while
        // driving and 233.7 draws/frame with the lesson menu open and the world
        // paused — 13,805 draw calls a second for a picture that cannot change.
        // On a phone that is the cheapest saving in the whole audit, and it is
        // paid at exactly the moment a student is stationary and reading.
        //
        // "demand" does NOT mean frozen: R3F re-renders on every commit of this
        // tree, so anything driven by React state still paints. What stops is
        // the free-running rAF draw. Nothing in the sim calls `invalidate()`
        // today, and nothing needs to — every in-canvas animation under a card
        // is either hidden by it or is the world itself, which is paused.
        frameloop={physicsPaused ? "demand" : "always"}
        dpr={[1, canvasMaxDpr(level)]}
        camera={{
          fov: CHASE_FOV,
          near: 0.1,
          far: 900,
          position: [spawn.x - 6, spawn.y + 2.4, spawn.z],
        }}
        gl={{
          // Canvas MSAA only on `low` (no composer). At med/high the composer
          // renders offscreen and antialiases with SMAA, so a multisampled
          // backbuffer here is wasted VRAM/fill — turn it off, SMAA owns AA.
          antialias: !QUALITY_PRESETS[level].postprocessing,
          powerPreference: "high-performance",
          stencil: false,
        }}
      >
        {perfLog ? <PerfProbe level={level} /> : null}
        {/* Always on (doc 82 §2.3 fix 4): on a 4 GB phone an OOM presents as a
            silent black canvas. Costs two DOM listeners and renders nothing;
            everything it records stays on the device (ADR-004). */}
        <GlContextGuard level={level} />
        {/* `skyline` comes from the MAP, not from this component: the fenced
            полигон and the parking lots have no far horizon, so the Vitosha
            ridge is gated off there (doc 82 §3.2 V3). Everything else is a
            Sofia street and keeps it. */}
        <SimEnvironment
          timeOfDay={timeOfDay}
          rain={rain}
          fog={fogWeather}
          snow={snowWeather}
          winter={winter}
          skyline={mapKindHasSkyline(district.meta.mapKind)}
          // The AC-12 opt-in, read from the AUTHORED physics field only — the
          // same law the grip/wind props below obey. Absent on every lesson
          // that authors no crosswind, so the drift layer is not mounted and
          // no calm scene renders a mote.
          readWindLateralN={lesson.physics?.crosswind ? readWindLateralN : undefined}
          quality={level}
        />
        {/* HDRI image-based lighting — real sky reflections/ambient for PBR
            materials, glass, mirrors and car paint. background=false keeps
            SimEnvironment's animated sky dome. Day uses the golden-hour
            shanghai_riverside (rotated so its baked sun matches the preset
            sun azimuth — see DAY_ENV_ROTATION); night uses a dim dusk/urban
            PMREM so metal/glass/mirrors sample a faint skyline instead of
            black (a graded mirror feature needs *something* to reflect at
            night). Intensities stay modest so the IBL complements the
            sun/hemisphere rig rather than flattening it.

            NOT MOUNTED AT `low` (audit H-11): one 1.5 MB HDR is more than twice
            the entire low-tier texture budget, and the tier it serves already
            has no composer, no shadows and no clearcoat — the reflections it
            feeds are the least visible they will ever be. The ruling lives in
            TEXTURE_BUDGETS (sim/world), which the texture loaders read too, so
            the download tier cannot drift from the render tier again. */}
        {TEXTURE_BUDGETS[level].hdrEnvironment ? (
          <Suspense fallback={null}>
            <Environment
              files={
                isNight ? "/sim/env/sky_urban_1k.hdr" : "/sim/env/shanghai_riverside_1k.hdr"
              }
              background={false}
              environmentIntensity={isNight ? 0.12 : rain ? 0.5 * (1 - RAIN_IBL_DIM) : 0.5}
              environmentRotation={isNight ? NIGHT_ENV_ROTATION : DAY_ENV_ROTATION}
            />
          </Suspense>
        ) : null}
        <Suspense fallback={null}>
          <Physics
            gravity={[0, GRAVITY, 0]}
            timeStep={FIXED_DT}
            interpolate
            paused={physicsPaused}
            updateLoop="follow"
          >
            <DistrictWorld
              district={district}
              prebuilt={geometry}
              quality={level}
              night={isNight}
              winter={winter}
              getSignalPhase={getSignalPhase}
              getRailBarrierDown={getRailBarrierDown}
              signSvgBaseUrl={null}
            />
            {/* LC gantry — render-only, inert unless the district authors
                meta.scenario.laneGantry (the WRONG_WAY lane-control drill). */}
            <LaneSignalGantry district={district} />
            {/* A2: the provider gives VitokCockpit's hotspot layer its
                enable/highlight state without threading props through
                VehicleRig (context crosses the R3F tree). */}
            <CockpitInteractionContext.Provider value={cockpitInteraction}>
              <VehicleRig
                simRef={simRef}
                chassisGroupRef={chassisGroupRef}
                inputRef={inputRef}
                cabinRef={cabinRef}
                audioRef={audioRef}
                sampleRef={sampleRef}
                paused={physicsPaused}
                spawn={spawn}
                difficultyRef={difficultyRef}
                // #37: the loaded map's speed domain scales the governor.
                lessonMaxLegalKmh={built.lessonMaxLegalKmh}
                // B7: the lesson's own required speed floors the tier cap.
                lessonRequiredKmh={built.lessonRequiredKmh}
                onCollision={handleCollision}
                // S1: scenario drills grade ANY contact (compile writes 0);
                // absent = the street nudge tolerance (default 10).
                collisionMinKmh={lesson.collisionMinKmh}
                night={isNight}
                // #41: rain lessons mount the (dimmed) beam throw + tail glow
                // so switching the lights on is VISIBLE. Render-only — the
                // graded headlight state still flows cabin → sample → tick.
                rain={rain}
                // #24: the rig writes the live wiper sweep/clearing here; the
                // cockpit droplet layer below reads it to clear the wiped arc.
                wiperVisualRef={wiperVisualRef}
                // 4a + snow: the OPT-IN reduced-grip physics. Read from the
                // AUTHORED physics field only — never derived from
                // environment.rain/snow (shipped weather lessons were tuned
                // against dry physics). Both authored = the MOST RESTRICTIVE
                // factor wins (min — the condition-factor discipline).
                gripFactor={Math.min(
                  lesson.physics?.wetGrip ? WET_GRIP_FACTOR : 1,
                  lesson.physics?.snowGrip ? SNOW_GRIP_FACTOR : 1,
                )}
                // SURFACE-PATCH slice: waterPatch/icePatch rects from the
                // DISTRICT's authored zone spans (the map is the opt-in) —
                // VehicleRig modulates the live grip as the chassis crosses
                // them, MIN-composed with the base gripFactor above. [] on
                // every pre-slice map.
                gripPatches={built.gripPatches}
                // AC-12: the OPT-IN crosswind, same authored-field-only law.
                // NEGATIVE = the wind blows WEST (world −X = district west,
                // vehicleSample.ts axis map): on the northbound drill street
                // it shoves the car toward the center line — the taught
                // danger. Constants stay in tuning.ts (the single truth the
                // authored ghost story is written against).
                windLateralN={lesson.physics?.crosswind ? -CROSSWIND_BRIDGE_N : 0}
                windGustAmplitudeN={lesson.physics?.crosswind ? -CROSSWIND_GUST_AMPLITUDE_N : 0}
                windGustPeriodSec={lesson.physics?.crosswind ? CROSSWIND_GUST_PERIOD_SEC : 0}
                // N11 (VP-06): director→cluster warning-lamp channels (red +
                // amber — the triage needs both to be visible).
                telltaleLitRef={telltaleLitRef}
                telltaleCautionLitRef={telltaleCautionLitRef}
              />
            </CockpitInteractionContext.Provider>
            {/* S1: precise hittable parked cars from the lot's occupancy —
                fixed tight cuboids tagged "vehicle" (doc 76 §0). Mounted
                only on scenario lessons (empty list everywhere else). */}
            {built.scenarioObstacles.length > 0 ? (
              <Suspense fallback={null}>
                <ScenarioObstacles
                  obstacles={built.scenarioObstacles}
                  clearcoat={level === "high"}
                  onColliderFootprints={handleObstacleFootprints}
                />
              </Suspense>
            ) : null}
            <RuntimeDriver
              runtime={runtime}
              traffic={traffic}
              director={director}
              hazardActiveRef={hazardActiveRef}
              telltaleLitRef={telltaleLitRef}
              telltaleCautionLitRef={telltaleCautionLitRef}
              onTelltale={setTelltaleCueOn}
              onTelltaleCaution={setTelltaleCautionCueOn}
              sampleRef={sampleRef}
              simRef={simRef}
              inputRef={inputRef}
              cabinRef={cabinRef}
              audioRef={audioRef}
              attemptRecorderRef={attemptRecorderRef}
              dashboardStatusRef={dashboardStatusRef}
              // …and the two numbers that make the governor speakable: the
              // ceiling the tier is enforcing on THIS map, and whose ceiling
              // it is. Written onto the same per-frame channel the bar polls.
              tierCapKmh={tierCapKmh}
              tierNameBg={DIFFICULTY_PRESETS[difficulty].labelBg}
              reverseAssist={reverseAssist}
              reverseAssistEnabled={reverseAssistEnabled}
              reverseStuck={reverseStuck}
              stuckStart={stuckStart}
              assistShiftingRef={assistShiftingRef}
              driveLocked={driveLocked}
              drivelineEventsRef={drivelineEventsRef}
              glanceQueueRef={glanceQueueRef}
              onPreDriveStep={onPreDriveStep}
              onBlockedDriveAttempt={onBlockedDriveAttempt}
              onTick={onTickWithGlancePings} // [glance-pings] read-only tap → shell
              onMinimap={onMinimap}
              onDriveline={onDriveline}
              onDrivelineRejection={onDrivelineRejection}
              onReversePedalStuck={onReversePedalStuck}
              onStuckStart={onStuckStart}
              onTransmissionChanged={onTransmissionChanged}
              onStagedOutcome={onStagedOutcome}
              minimapPolylines={minimapPolylines}
              isNight={isNight}
              rain={rain}
              fog={fogWeather}
              snow={snowWeather}
              paused={physicsPaused}
            />
            {/* A11 hittable traffic: a fixed pool of kinematic collider
                shells (8 vehicles + 4 pedestrians) follows the NPCs nearest
                the player, so driving into traffic is a real contact the
                rule engine grades by kind. Mounted AFTER RuntimeDriver —
                its frame callback then reads this frame's fresh traffic
                poses. Also runs the near-miss session stat (no grading). */}
            <NpcColliders
              traffic={traffic}
              sampleRef={sampleRef}
              paused={physicsPaused}
              onNearMiss={onNearMiss}
            />
            {/* Ambient life — cars + pedestrians. Render-only: RuntimeDriver
                already steps traffic.update each frame (so it stays in lockstep
                with the rule engine), so we do NOT pass `runtime` here. Draw
                distance covers the anchored cluster (fog fades the far edge).
                A8: the lesson hazard (L5 ball dart-out) renders here too — the
                scenario director owns hazardActiveRef (A5's prepared seam). */}
            <TrafficLayer
              system={traffic}
              maxDrawDistanceM={SCENARIO_TRAFFIC_DRAW_DISTANCE_M}
              night={isNight}
              // world `District` ⊇ `TrafficDistrict` (only differs on a field
              // TrafficLayer doesn't read — crossings.edgeId nullability).
              district={district as TrafficDistrict}
              // Doc 66 R5 (founder v1 №9): recipe-authored junction-corner
              // clear zones for the curb decoration — same list capture mounts.
              parkedClearZones={built.parkedClearZones}
              hazard={lesson.hazard ?? null}
              hazardActiveRef={hazardActiveRef}
              // B40(a): the caption over a staged actor whose whole teaching
              // job is to be RECOGNISED at range («Спане на зелено»). Null on
              // every other lesson, so it costs one check per frame.
              actorLabels={lesson.actorLabels ?? null}
              // Perf tier (doc 71): SUV clearcoat on the high tier only.
              clearcoat={level === "high"}
              // Perf tier (doc 82 §2.3): at `low` the 22,672-tri / 16-material
              // hero SUV leaves the pool entirely — ~54k triangles and 16 draw
              // calls against a ≤250k / ≤70 phone budget. The picks fall back
              // to the kolos, so the traffic population is unchanged.
              dropHeavyFleetModels={level === "low"}
              // JU-18: the officer FIGURE reads the controller schedule
              // through the runtime — the same channel + clock the stop-line
              // adjudication uses — so the posture turns exactly when the
              // grading flips (render-only; inert without a posted controller).
              controllerFigure={runtime}
              // …and how much of his CAPTION this rung gets. Sweep 161 filed
              // two rows on that card at L1 — `sc-sig-controller-postures`
              // :ef0e821c („five lines of tiny multi-coloured text, unreadable
              // at native phone size") and :3936550e („the billboard states the
              // answer outright, removing the reading-the-posture exercise the
              // task asks for") — and they are one repair, because the only
              // lever that makes this type bigger is fewer lines. The §7 ladder
              // decides how many: «Пълна помощ» keeps the founder's six-line
              // card, «Частична помощ» names the pose and lets the student
              // apply the rule, and the two rungs above that read the man.
              // Curriculum lessons parse to no rung and get "full".
              controllerCaption={controllerCaption}
            />
            {/* THE CAMERA LIVES INSIDE <Physics>, AND THAT IS THE FIX FOR THE
                BACK-SEAT POV (doc 87 B67 — „no instrument cluster in frame at
                all" above ~68 km/h).

                CameraRig places the cockpit eye by reading the interpolated
                chassis group's world pose in a useFrame. R3F runs equal-priority
                useFrame subscribers in SUBSCRIPTION order, and rapier's own
                stepper — the thing that writes that pose — is the first child of
                <Physics>. So the camera is only guaranteed to read a FRESH pose
                if it subscribes after the stepper. As a SIBLING of the
                <Suspense> above it did the opposite: the whole Physics subtree
                suspends on the district/GLB load, so CameraRig committed (and
                subscribed) FIRST, and every frame it aimed the eye at where the
                car had been on the PREVIOUS frame. The camera then rendered one
                frame of travel behind the car it is supposed to be sitting in —
                0.20 m at 44 км/ч (invisible), 0.30 m at 69 (the eye is level
                with the seat back and the whole dash goes black), 0.57 m at 128
                (the driver's headrest fills the lower-left quadrant and there is
                no cluster and no steering wheel in frame at all). Speed-
                proportional, surviving a throttle-shut coast and surviving a
                C×3 view cycle — which is exactly the founder-reported symptom,
                and exactly why the previous fix, a feed-forward INSIDE the lerp,
                could not touch it: the lerp was already converged. Measured at
                138.7 км/ч with the dev camera probe: the camera sat at
                car-local (0.240, 0.710, −0.255) against a COCKPIT_EYE of
                (0.24, 0.71, −0.255) — a residual of 8·10⁻¹⁴ m. The camera was
                never in the wrong place relative to what it read. It was
                reading last frame's car.

                Mounted last, so it subscribes after the stepper AND after
                VehicleRig, in the same Suspense boundary, on every mount. */}
            <CameraRig
              chassisGroupRef={chassisGroupRef}
              simRef={simRef}
              cameraModeRef={cameraModeRef}
              cabinRef={cabinRef}
              telemetryRef={telemetryRef}
              topdownAllowed={topdownInCycle}
              enterTopdown={enterTopdown}
              topdownAidRef={topdownAidRef}
              driveLocked={driveLocked}
            />
          </Physics>
        </Suspense>
        {/* A7 in-world route guidance: ghost route ribbon + turn chevron +
            objective marker. Free drive (no objectives) has nothing to
            follow, so the layer never mounts there (doc 68 A7 / audit B9). */}
        {lesson.objectives.length > 0 ? (
          <RouteGuidance
            district={district}
            lesson={lesson}
            activeObjectiveIndex={activeObjectiveIndex}
            sampleRef={sampleRef}
            spawnStart={guidanceSpawnStart}
          />
        ) : null}
        {/* S0-View ?ghost=demo: the Shadow Car (translucent ghost + blue path
            ribbon) plays the recorded trace kinematically — no physics. */}
        {ghostDemo ? (
          <Suspense fallback={null}>
            <ShadowCar trace={ghostDemo.trace} clockRef={ghostClockRef} district={district} />
          </Suspense>
        ) : null}
        {/* S1 aids (doc 76 §7): L1 shadowCar = ghost + ribbon + timeline;
            L2 pathRibbon = the correct-path ribbon ALONE. */}
        {shadowTrace && (aids?.shadowCar || aids?.pathRibbon) ? (
          <Suspense fallback={null}>
            <ShadowCar
              trace={shadowTrace}
              clockRef={aidClockRef}
              showGhost={aids?.shadowCar === true}
              // The blue demonstration ribbon goes quiet over the painted
              // crossings and the junction paint, exactly as RouteGuidance's
              // does — sc-crossing-dart:f0bf371d, `06-waited.png`, where it ran
              // unbroken across the zebra the lesson exists to teach. The
              // district is the same object that layer is handed.
              district={district}
            />
          </Suspense>
        ) : null}
        {/* S1 followHints: sustained lateral deviation from the shadow path
            flips the hint chip below (probe runs in-canvas, ~4 Hz). */}
        {shadowTrace && aids?.followHints ? (
          <FollowHintProbe
            trace={shadowTrace}
            sampleRef={sampleRef}
            paused={physicsPaused}
            onChange={setFollowHintOn}
          />
        ) : null}
        {cockpit && rain ? <WindshieldDroplets wiperRef={wiperVisualRef} /> : null}
      </Canvas>

      {/* The crash response (sweep161 f0023997: „no impact effect … just a
          blank orange wall with the coach still talking over it"). Isolated
          additive block in the RearProximityCue/FollowGapCue shape: it renders
          nothing until a graded contact lands, reads only `sampleRef` to know
          when to give the view back, and touches no grading path. */}
      <ImpactCut
        handleRef={impactCutRef}
        sampleRef={sampleRef}
        cameraModeRef={cameraModeRef}
        applyCameraMode={applyCameraMode}
        // sc-turn-left-oncoming:e91c1e01 — the bay carve-out, said as the thing
        // it is. A graded bay IS the manoeuvring drill (`compile.ts` writes
        // `parkingBay` from the parking objective's own rect); everywhere else
        // a graded contact is a street crash however slow it was, and must be
        // seen. See the GATE note in ImpactCut.tsx.
        manoeuvring={lesson.parkingBay !== undefined}
      />

      {/* Controls legend — top-left of the canvas, and it now OPENS AS ITS
          PILL. The «⌨ Клавиши · за напреднали ▸» button is always on the glass;
          one click still unfolds the whole sheet, and `controlsLegendLifetime`
          still folds it back once the car is genuinely moving.

          ── WHY THE DEFAULT FLIPPED (sc-junction-blind:f02ac308, and the
             fourteen rows of the same sentence before it). Two earlier lanes
             left this open as „the founder's question, not a lane's", on a
             founder-facing reason stated on the component itself:
             „collapsing it outright would hide the keyboard from a first-time
             student who has no other way to discover the controls." That
             sentence is no longer true of this screen, and the evidence is
             retrieved rather than argued:

               · the cockpit control strip PRINTS the key caps under the
                 controls themselves — «СПИРАЧКА S», «ГАЗ W», «Л Q / З F / Д E»
                 — visible in the very frame this row was filed on
                 (`.audit-frames/w10-1/frames/sc-junction-blind__pc-right/
                 03-ready.png`), so the keyboard is discoverable with the sheet
                 shut;
               · the collapsed state is a LABELLED pill, not a mystery glyph;
               · doc 87 B7's owner line names „`LessonScene.tsx` (ControlsHelp
                 default …)" for the founder's own „the «Клавиши» legend still
                 opens by default over the tutorial card", and doc 88 carries
                 the same complaint on fifteen lessons — sc-junction-blind,
                 sc-junction-rhr, sc-jx-giveway-b1, sc-follow-distance,
                 sc-ac-aquaplane, sc-speed-transition among them.

             On the filed frame the open sheet is ghost type over the sky AND
             it is drawn across the guidance ribbon's own legend, so two text
             layers overlap on the world before the student has touched
             anything. `touchOnly` / `driveLockedAtMount` are gone from the
             expression because the sheet no longer opens itself anywhere. */}
      <ControlsHelp
        defaultOpen={false}
        topdownAllowed={topdownInCycle}
        reverseAssistEnabled={reverseAssistEnabled}
        // …AND WHICH CAR THE LEGEND IS DESCRIBING — sc-vp-stall:95754650
        // (critical). Every other flag on this mount is about the LESSON; this
        // one is about the CAR, and until it existed the sheet printed
        // «скорости: към P / към D» on a lesson whose own objective says
        // «колата тук е с ръчни скорости и съединител». LIVE STATE, not a
        // lesson constant: `difficulty` is seeded by `lesson.openingTier` and
        // then moved by the tier picker mid-drive, so a student who switches
        // to „Напреднал" watches the gear, reverse and clutch rows re-word
        // themselves on the same render the gearbox changes on.
        transmission={transmissionModeFor(difficulty)}
        // …AND THE LIFETIME THE DEFAULT ABOVE NEVER HAD. `defaultOpen` decides
        // how the lesson OPENS; nothing decided how it ends, so on every desktop
        // scenario rung the sheet was still open — as ghost type on the
        // buildings — at 12 s and 11 км/ч (sc-follow-distance/pc-right).
        // `controlsLegendLifetime.ts` carries the three frames and the rule.
        sampleRef={sampleRef}
      />

      {/* PROX rear-proximity cue (isolated additive block): „Кола отзад · X м"
          above the dashboard while a REAL vehicle is within ~15 m behind —
          the every-POV/every-preset rear-awareness fallback. Self-contained:
          polls traffic.rearGapMeters off sampleRef at ~5 Hz internally (no
          frame-loop wiring, no grading read/write). hidden while any pause/
          quiz/teach/end overlay is up (physicsPaused ∪ shell paused). */}
      <RearProximityCue traffic={traffic} sampleRef={sampleRef} hidden={physicsPaused} />

      {/* …AND THE SAME INSTRUMENT POINTING FORWARD — «Дистанция · 34 м · 1,2 с»
          (sc-fo-motorway-gap, CRITICAL: „the two-second following distance the
          lesson exists to teach is never measured — no frame reports a gap in
          metres or seconds", across all 74 frames of two fresh legs). The
          number was already in the product: `traffic.leadGapMeters` feeds
          `SimTick.leadGapM` and `rules/engine.ts` grades three faults off it.
          What was missing was showing the student the quantity he is billed
          against. Same isolated-additive shape as the rear cue above: polls
          `leadGapMeters` off `sampleRef` at ~5 Hz internally, no frame-loop
          wiring, no grading read or write. `followTarget` carries the LESSON'S
          own thresholds so the badge cannot disagree with the engine. */}
      <FollowGapCue
        traffic={traffic}
        sampleRef={sampleRef}
        target={followTarget}
        hidden={physicsPaused}
      />

      {/* „Звукът е част от урока" (doc 82 §4.4, isolated additive block).
          A muted session teaches a systematically FASTER car than the student
          will really drive (~3.2 km/h over-production without audio, ~10% in
          visual-only sims) — so audio is stated as pedagogy, once, at the
          same gesture that unlocks the AudioContext above. Self-polling off
          audioRef; dismissible and then permanently silent. */}
      <AudioLessonPrompt audioRef={audioRef} hidden={physicsPaused} />

      {/* S0-View ?ghost=demo: playback deck for the Shadow Car — scrub bar,
          speeds, annotation ticks, step-by-step, loop-section. */}
      {ghostDemo ? (
        <DemoDeck
          trace={ghostDemo.trace}
          clockRef={ghostClockRef}
          suppressed={touchSheetOpen}
          sampleRef={sampleRef}
        />
      ) : null}

      {/* S1 L1 aid: the same playback deck for the scenario's shadow demo. */}
      {shadowTrace && aids?.shadowCar ? (
        <DemoDeck
          trace={shadowTrace}
          clockRef={aidClockRef}
          suppressed={touchSheetOpen}
          sampleRef={sampleRef}
        />
      ) : null}

      {/* S1 followHints chip — „you are off the demonstrated line".
          `data-hud` because `top-16` is inside the chase view's rear-view
          mirror band (rows B74/B76) — PlayAreaStyles steps it below the glass,
          the same way it steps the objective stack. */}
      {followHintOn && aids?.followHints ? (
        <div
          data-hud="follow-hint"
          className="pointer-events-none absolute left-1/2 top-16 z-10 -translate-x-1/2"
        >
          {/* ── THE ROUTE PILL HAD NO GROUND EITHER — sc-ac-crosswind:4607edf0,
              major: „The objective chip and the route pill have no opaque
              plate — world geometry reads straight through their text."

              The objective chip's half of that row closed at 2706813
              (`ObjectiveScrim`). This half survived because the pill LOOKS
              like it has a plate and does not: `bg-background/85` +
              `backdrop-blur` are written right here, and
              `[data-hud="follow-hint"]` is on PlayAreaStyles' `GHOST_SURFACES`
              list, so the UNPANEL sweep answers with `background-color:
              transparent !important; background-image: none !important;
              backdrop-filter: none !important` and what ships is an accent
              ring around bare world. The two frames the row was filed on show
              it over six-storey facades and over the sky.

              THE RECIPE IS THE PUBLISHED ONE, TAKEN NOT RE-DECIDED — the same
              `peekScrimBackgroundCss` the objective banner, the touch hint,
              the keyboard legend and the audio prompt all stand on, and
              `data-hud-ink` is what exempts it from the sweep that erased the
              class-based fill above (`unpanelInkExemption.test.ts` holds that
              contract, mutation-proved). `inset: 0` and not SimOverlay's
              negative bleed: this pill is `-translate-x-1/2` inside a stage
              that clips, and every prior repair met the same wall.

              AND NO VERTICAL MASK, for the reason the keyboard legend and the
              audio prompt both state at their own shades: this chip HAS an
              edge — a hairline `border-accent/60` and a full radius — so there
              is no hard 80 %-alpha band for a ramp to soften, and a 16 px
              bottom ramp under a 27 px pill would run through the only line of
              text it has. `borderRadius: "inherit"` is what keeps the shade
              inside that border instead of painting its shoulders outside it.
              If the border ever goes, `peekScrimMaskCss` arrives in the same
              commit.

              THE FEATHER IS THE PUBLISHED `.right`, 12 px, ON BOTH SIDES —
              the audio prompt's choice, made for this exact reason: the
              invariant is `feather[side] <= padding[side]` (the card's padding
              IS the shade's overhang once the bleed is unavailable), this pill
              is `px-3.5` = 14 px, and the published `.left` of 26 would put
              the first four characters of the sentence on a ground still
              ramping 0 → 0.8. */}
          <div className="relative isolate rounded-full border border-accent/60 bg-background/85 px-3.5 py-1.5 text-xs font-bold text-accent shadow-glow-sm backdrop-blur">
            <div
              data-hud="follow-hint-scrim"
              data-hud-ink=""
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "inherit",
                zIndex: -1,
                pointerEvents: "none",
                backgroundImage: peekScrimBackgroundCss({
                  left: PEEK_SCRIM_FEATHER_PX.right,
                  right: PEEK_SCRIM_FEATHER_PX.right,
                }),
              }}
            />
            Следвай синята линия
          </div>
        </div>
      ) : null}

      {/* N11 (VP-06) telltale cue — the L1/L2 aid twin of the followHints
          chip: while the staged dashboard lamp is lit, name it and the taught
          response. L3+ strips it — noticing the CLUSTER is the drill. */}
      {telltaleCueOn && aids?.pathRibbon ? (
        // `data-hud` for the same reason its twin above has one: row C1 moves
        // every centred text panel into the right-edge notification column, and
        // the cascade in PlayAreaStyles is the only vocabulary the scene tree
        // and the shell tree share. Without a name this chip stayed dead centre
        // over the road while everything around it moved.
        <div
          data-hud="telltale-cue"
          className="pointer-events-none absolute left-1/2 top-24 z-10 -translate-x-1/2"
        >
          <div className="rounded-full border border-danger/60 bg-background/85 px-3.5 py-1.5 text-xs font-bold text-danger shadow-glow-sm backdrop-blur">
            Контролна лампа: температура! Спри спокойно вдясно
          </div>
        </div>
      ) : null}

      {/* …and the AMBER cue, which teaches the OPPOSITE action. Same aid gate
          and the same `data-hud` name (row C1's column), because it is the
          same chip in the other colour — a student who sees one line for both
          lamps has not learned the triage. Rendered only while the red one is
          dark: once red is lit it owns the glass. */}
      {telltaleCautionCueOn && !telltaleCueOn && aids?.pathRibbon ? (
        <div
          data-hud="telltale-cue"
          className="pointer-events-none absolute left-1/2 top-24 z-10 -translate-x-1/2"
        >
          <div className="rounded-full border border-warning/60 bg-background/85 px-3.5 py-1.5 text-xs font-bold text-warning shadow-glow-sm backdrop-blur">
            Жълта лампа: двигател — продължи плавно до сервиз
          </div>
        </div>
      ) : null}

      {/* [glance-pings] edge pings („◄ огледай") + the desktop glance-button
          cluster. Gating lives in the component (glancePingsEligible: JU-23
          drills, L1–L2, „Съветник" ON, never exams); on touch devices the
          buttons stay with TouchControls' mirror row, so only the pings show. */}
      <GlanceEdgePings
        lesson={lesson}
        cabinRef={cabinRef}
        tapRef={glancePingTapRef}
        hidden={physicsPaused}
        showButtons={!touchCapable}
      />

      {/* [telltale-pings] founder 2026-07-28: „from the POV behind the car …
          Belt is not on and for example if needed Lights are not on, a ping
          where the user can see what is missing, currently he only sees in the
          dashboard." Outside the cockpit the 3D cluster is not in frame at
          all, so the armed cabin faults get quiet chips on the left/right
          rails. Cockpit view is exempt — the real cluster lights them there.
          Purely a consumer of the status channel the bar already polls. */}
      {dashboardStatusRef ? (
        <TelltaleEdgePings
          statusRef={dashboardStatusRef}
          active={!cockpit && !physicsPaused}
          showKeyHints={!touchCapable}
        />
      ) : null}

      {/* [camera-aid] founder 2026-07-30 (Тясно гнездо): „we can Ping
          somewhere on the screen with low brightness/contrast Press G for
          Eagle View, because the user may not know of existing G option".
          Fires the moment reverse is engaged on a bay/turn drill and the
          student is NOT already looking from above; one appearance per
          session, self-retiring. Isolated additive block — polls the same
          DashboardStatus channel the bar reads, touches no grading. */}
      {dashboardStatusRef ? (
        <CameraAidHint
          statusRef={dashboardStatusRef}
          eligible={cameraHintEligible}
          readIsTopdown={readIsTopdown}
          hidden={physicsPaused}
          onEnterTopdown={enterTopdown}
          showKeyHint={!touchOnly}
        />
      ) : null}

      {/* MOUSE PEDALS (founder 2026-07-30, „first and upmost it must be with
          the mouse"). Non-touch devices only — a phone already has the
          drivetrain pad under its thumb. Two press-and-hold pads writing into
          the SAME TouchInputSource, so pre-drive steps 8 and 13 — the two the
          tutorial used to describe as „с педал — няма контрола … да щракнеш" —
          are performable without a keyboard. Pinned open while the pre-drive
          gate is on; afterwards they yield to a student who drives on W/S. */}
      {!touchCapable ? (
        <MousePedals
          touch={touchSource}
          hidden={physicsPaused}
          pinned={driveLocked}
          onYieldedToKeyboard={onMousePedalsYielded}
        />
      ) : null}

      {/* P1: touch input overlay — mounts on any touch-capable device, hides
          itself during keyboard use and while paused/quiz/teach/end overlays
          are up (physicsPaused covers menu pause; props.paused covers the
          shell's quiz/teach/end states). */}
      {touchCapable ? (
        <TouchControls
          touch={touchSource}
          cabinRef={cabinRef}
          hidden={physicsPaused}
          // …the same flag ControlsHelp already takes, for the same reason:
          // the drivetrain pad's label promised the reverse gesture on exam
          // rungs, where the assist and the pedal swap are both off.
          reverseAssistEnabled={reverseAssistEnabled}
          onToggleCamera={toggleCamera}
          // §I23 — the camera stops being two taps deep inside a settings
          // sheet and becomes the reference's opaque, word-labelled top-left
          // button. The rail additionally carries the FIRST touch home G and
          // N have ever had (top-down zoom + north-up/heading-up).
          cameraMode={cameraMode}
          onSelectCameraMode={selectCameraMode}
          topdownAllowed={topdownInCycle}
          topdownAidRef={topdownAidRef}
          // The deck/sheet arbitration — see `touchSheetOpen` above.
          onSheetOpenChange={setTouchSheetOpen}
          onPause={() => setMenuPaused(true)}
          onReset={resetCar}
          onToggleFullscreen={onToggleFullscreen ?? null}
          // …AND THE TIER, because on a phone the pill below has nowhere to
          // stand: 255 px of segmented control against a 167.5 px rail lane and
          // a 141.5 px column lane (J-WAVE-3 — the arithmetic is on the prop).
          // The pill is hidden on a compact stage by PlayAreaStyles; this cell
          // is what the student reaches instead, and it is one tap behind the
          // «Кола» button the rail already labels.
          difficulty={difficulty}
          onSelectDifficulty={setDifficulty}
        />
      ) : null}

      {/* Difficulty selector — top right. `data-hud` so the play shell's
          compact layout can move it clear of a landscape notch without this
          file knowing anything about phones (PlayAreaStyles). */}
      <div
        data-hud="difficulty"
        className="absolute right-3 top-3 flex items-center gap-1 rounded-full border border-border bg-background/70 p-1 backdrop-blur"
      >
        {DIFFICULTY_ORDER.map((mode) => {
          const active = mode === difficulty;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setDifficulty(mode)}
              aria-pressed={active}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                active
                  ? "bg-accent text-background"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {DIFFICULTY_PRESETS[mode].labelBg}
            </button>
          );
        })}
      </div>

      {/* P1: one-time touch expectation hint — the refusal GateCard's
          replacement. Landscape + slider guidance, then never again.

          ── ROW C1, 2026-07-30. THE FIRST FRAME OF A LESSON. ────────────────
          This block used to be `absolute inset-0 z-30 … bg-background/80
          backdrop-blur-sm` with a `max-w-sm` card on it, and the harness put a
          number on what that meant: on the state a lesson OPENS in, iPhone 16
          in both orientations, content 0.0 %, chrome 100.0 %. Not one pixel of
          road. Behind it sat a redesign measured at 93.9 % road that the
          founder could not see, because he never got past the popup — his own
          words are „the popups continue to eat almost the full screen and must
          be completely redesigned".

          So it is not a popup any more. It is what an instructor in the
          passenger seat is: a voice over the scene. No scrim (the road is
          visible the whole time — that IS the reassurance that there is a game
          here), no card, no border, no backdrop-filter — every one of those is
          a painted rectangle and the screen budget charges each one. What is
          left is type with a shadow, the same technique the compact instrument
          readout already uses over a bright road, plus ONE real button.

          The copy is cut to what cannot be discovered by touching the screen.
          The reverse gesture stays, verbatim in intent, because it is the
          founder's own complaint („very hard to switch to reverse") and because
          holding the brake at a standstill is invisible by design. The „⚙"
          sentence is gone: that button is on screen, it has a label, and a
          student who taps it learns more than a student who reads about it.

          ── 2026-08-16 · IT WAS STILL PROSE ACROSS THE MIDDLE OF THE ROAD. ────
          This block was authored `inset-x-0 top-1/2 -translate-y-1/2` — dead
          centre, full width — and stayed that way for a year of reviews because
          a 2026-08-12 rule in `PlayAreaStyles` moved it on a compact stage and
          the row was called closed. The rule moved it DOWN, not OFF. Measured
          on the deployed build (WebKit, real insets, iPhone 16 landscape
          852 × 393, sc-zebra-approach@L1, immediately after «РАЗБРАХ»):

            [data-hud="touch-hint"]  [275, 202, 334 × 143]

          x 275→609 of 852 is the middle 39 % of the width, centred 16 px off
          the vanishing point; y 202→345 CROSSES the cockpit horizon (0.58 of
          the stage = 228 px, `cabinLook.test.ts`). 47 762 px² — 14.3 % of the
          picture — of teal type over the road the student is about to drive
          down. That is the founder's row 3, and his own frame shows the
          «Кола отзад · 12 м» proximity chip (which is `bottom-[6.75rem]
          left-1/2`, i.e. also dead centre) inserted between two lines of it.

          TWO THINGS CHANGE AND THE SECOND IS WHY THE FIRST STICKS.

          1. THE HINT JOINS THE RIGHT-EDGE CORRIDOR — the founder's own drawing,
             and the lane every other front-of-screen text panel was moved into
             on 2026-08-03 and 2026-08-09 (the audio card, the follow chip, the
             telltale cue, the objective line). The geometry is written ONCE in
             `PlayAreaStyles` from `notifyColumn.ts`, exactly as those four are,
             so this file no longer holds a copy of where the corridor is.
             The C1 priority ladder already guarantees the lane is never shared:
             the hint stands down while the overlay column speaks, and the audio
             chip, the follow chip, the telltale cue and the deck all stand down
             while the hint is up.

          2. THE AUTHORED CLASSES STOP SAYING „CENTRE". A cascade rule that
             relocates a centred box is one runtime condition away from not
             applying — `[data-sim-compact="on"]` is decided by a coarse-pointer
             check and a size check, and a touch laptop, a tablet or a phone
             that reports a fine pointer lands back on `top-1/2`. The default
             here is now the top-right corner, so the worst case is a hint in a
             slightly wrong corner rather than a paragraph on the vanishing
             point.

          THE TYPE DROPS 14 px → 11 px WITH THE LANE, because the lane is
          180 px wide sideways and 141.5 upright. That is the notification
          column's own register — the instruction card beside it has been 11 px
          since the column shipped — so the two read as one surface rather than
          as a poster and a card. Measured at 180 px: the two thumb sentences
          lay out 2 and 3 lines, and the whole hint is ~135 px against the
          corridor's 161 px hazard-band ceiling. */}
      {showTouchHint ? (
        <div
          ref={hintRef}
          data-hud="touch-hint"
          // Position and width come from PlayAreaStyles (one definition of the
          // corridor, from notifyColumn.ts). What is authored here is the SHAPE
          // — a right-aligned column of small type with a real button under it
          // — and a corner that is not the road, so the degradation when the
          // cascade rule does not match is a misplaced card and never a
          // paragraph over the vanishing point.
          // `isolate` is new, and the honest account of it is smaller than the
          // one first written here. A `z-index: -1` child needs a stacking
          // context on this element or it paints behind the stage and the whole
          // shade is invisible — but `absolute` + `z-30` ALREADY establishes
          // one, so the token is not what makes the shade appear today. It is
          // here so that removing `z-30` (a plausible layout edit, since
          // PlayAreaStyles owns this card's position) cannot silently delete
          // the ground. The load-bearing pair on THIS card is `absolute z-30`;
          // on the keyboard legend below it is `relative isolate`, where the
          // element genuinely has neither without them — and the case in
          // `unpanelInkExemption.test.ts` now asserts each surface's own.
          //
          // ── `content-box` + THE PADDING BELOW ARE THE FEATHER'S ROOM, AND
          //    THEY ARE THE WHOLE OF THE w12 REPAIR. sweep w12, 2026-08-27,
          //    nine „no panel" rows and six „«РАЗБРАХ» floats detached" rows.
          //    The mechanism is at the shade itself; what this element has to
          //    provide is a box that is BIGGER THAN THE INK by exactly the
          //    published feather, so the ramps have somewhere to be that is not
          //    on top of a glyph.
          //
          //    `box-sizing: content-box` is what makes that possible without
          //    touching PlayAreaStyles: `width` and `max-height` there then
          //    size the CONTENT box, so the prose keeps its 180 px measure and
          //    its ceiling to the pixel — no line re-wraps, no copy is clipped
          //    that was not clipped before — while the padding box (which is
          //    what an `inset: 0` child sizes to, and what `overflow: hidden`
          //    clips to) grows to 180 + 26 + 12 and 16 px taller.
          //
          //    WHAT IT COSTS, stated rather than discovered later: the card's
          //    outer box grows 38 px to the road side and 16 px down, and the
          //    prose sits 12 px further from the mirror column than it did.
          //    None of that is ink — it is where the shade fades from 0.80 to
          //    0 — and the hint is touch-only, once per device
          //    (`shouldShowTouchHint`), so it is the first lesson of a phone's
          //    life and never again.
          className="pointer-events-none absolute right-3 top-3 z-30 isolate flex min-h-0 max-w-full flex-col items-end gap-1.5 overflow-hidden text-right"
          role="note"
          aria-label="Съвети за игра на телефон"
          style={{
            textShadow: "0 1px 4px rgba(0,0,0,0.96), 0 0 14px rgba(0,0,0,0.8)",
            // INLINE AND NOT A UTILITY CLASS. Tailwind's preflight sets
            // `box-sizing: border-box` on `*`, and this declaration is the one
            // thing in the pair that must not be losable to a cascade or to a
            // utility being renamed: without it the padding below comes OUT of
            // the 180 px measure instead of being added around it, which
            // re-wraps the copy and clips the reverse-gear sentence — the
            // repair inverted into the defect it replaces. An inline style
            // cannot be outranked by a stylesheet, so the two travel together.
            boxSizing: "content-box",
            // Derived from the published feather, never re-typed — the shade
            // below hands the SAME three numbers to the gradient and the mask,
            // and if they ever stop agreeing the flat core stops coinciding
            // with the ink, which is the defect this pair exists to close.
            // `top` is 0 by that constant (above this card is the mirror's
            // lane), so there is no `paddingTop` here and the card's top edge
            // does not move.
            paddingLeft: `${PEEK_SCRIM_FEATHER_PX.left}px`,
            paddingRight: `${PEEK_SCRIM_FEATHER_PX.right}px`,
            paddingBottom: `${PEEK_SCRIM_FEATHER_PX.bottom}px`,
          }}
        >
          {/* ── THE GROUND THIS CARD NEVER HAD — sweep w10, 2026-08-24 ────────
              `sc-ac-wet-braking/mobile-right/03-ready.png`, iPhone 16 sideways,
              cropped and looked at: «Ляв палец — волан. Десен палец — нагоре
              газ, надолу спирачка.» is white 11 px type over a tower-block
              facade with a lit orange window showing through the middle of the
              second «палец», and the cyan reverse sentence below it — the one
              that teaches how to select R — is over the same facade with
              nothing behind it at all. Filed twice in the same sweep
              (`sc-ac-crosswind/mobile-right/03-ready.png` is the same card over
              sky and the minimap).

              THE DARK RECTANGLE BEHIND THE FIRST TWO LINES IS NOT THIS CARD'S
              PANEL. It is the interior rear-view mirror this corner sits over
              — the identical misreading `PlayAreaStyles` records for the three
              ИНСТРУКЦИИ criticals, whose frames looked plated and were not.
              Below the mirror's bottom edge the type continues onto the street.

              `textShadow` on the root was the whole of the compensation, and a
              halo is a defence against a BUSY ground, not against a BRIGHT
              one: it darkens the pixels immediately around a glyph and does
              nothing to the 60 % grey concrete two glyph-widths away.

              WHY A SHADE AND NOT A PANEL. `[data-hud="touch-hint"]` is on
              `GHOST_SURFACES` because the 2026-08-03 review named this corner's
              furniture by name („it reads as a cookie banner"), and that ruling
              stands — no fill on the chips, no card edge, no radius, no blur.
              The shade is the answer `SimOverlay` already found for exactly
              this conflict: ground for the PROSE, nothing for the instrument.
              Same function, same numbers, imported rather than re-typed.

              `data-hud-ink` IS THE FIX and not decoration: the UNPANEL sweep's
              second selector hands `background-image: none !important` to every
              child of a ghost that lacks it, so without the attribute this
              element paints nothing and the diff changes no pixel — which is
              how the tier picker's fill survived a whole unpanel pass.

              INSET, AND THE BOX IS WHAT WAS MADE BIGGER. SimOverlay hangs its
              shade outside the card by `PEEK_SCRIM_FEATHER_PX`; this root is
              `overflow-hidden` (the scroll-window fix above depends on it, and
              PlayAreaStyles declares it again), so an overhang would be clipped
              to nothing. The geometry stays `inset: 0` — but `inset: 0` and
              `overflow: hidden` both resolve against the PADDING box, so the
              card now carries the feather as padding (with `box-sizing:
              content-box` on the root, so PlayAreaStyles' `width` and
              `max-height` still size the INK) and the flat core lands exactly
              on the ink.

              ⚠ WHAT STOOD HERE UNTIL 2026-08-27 WAS FALSE, and fifteen rows of
                sweep w12 are what it cost. It read: „The cost is that the flat
                core is 38 px narrower than the card rather than 38 px wider,
                and the two sentences are `text-right` in a right-aligned
                column, so the side that loses ground is the empty one."

                A RIGHT-ALIGNED COLUMN HAS NO EMPTY SIDE. Every line is flush
                RIGHT, so every line's last glyphs stand in the 12 px right
                ramp; and text wraps to fill the measure, so the longest line of
                each paragraph reaches the LEFT edge too and starts inside the
                26 px one. MEASURED off the w12 frames the rows were judged on
                (iPhone 16 landscape, 852 × 393 at dpr 3, glyph extents read in
                device px and divided by 3):

                  card box                     x 1624 → 2164 device (180 CSS)
                  «натисни пак надолу — минава на»  x 1626 → 2164  (181 CSS)
                  «Ляв палец — волан. Десен палец»  x 1644 → 2164  (173 CSS)

                — i.e. the cyan line that teaches how to select R begins 0.7 CSS
                px inside a ramp that is at alpha ≈ 0 there and does not reach
                0.4 for another 13 px. Its first word is the one every reader of
                every frame described as „painted straight onto the building";
                `sc-speed-dangerous`, `sc-crossing-white-cane` and
                `sc-park-wall` all show the same two words standing on the ramp.
                That is `PEEK_SCRIM_FEATHER_PX`'s own „a glyph standing on a
                partial ground is the defect this shade exists to close, not a
                milder version of it", and this card had it on three sides.

                THE MEASURE IS UNTOUCHED BY THE REPAIR, which is the reason the
                fix is padding and not a narrower column. `width` and
                `max-height` in PlayAreaStyles size the CONTENT box under
                `box-sizing: content-box`, so the prose still lays out at 180 px
                and still stops at the corridor's ceiling: no line re-wraps and
                nothing is clipped that was not clipped before. Padding the
                PROSE instead would have cost a line — «Ляв палец … Десен палец»
                measures 173 of 180 px, so any inset at all pushes «палец» down
                — and the card has 2.26 px of slack on this stage, so that line
                would have come off the bottom of the reverse-gear sentence.

              ── AND THE VERTICAL FEATHER TRAVELS WITH IT, which the first draft
                 of this element dropped. `SimOverlay` paints its shade with
                 TWO functions and says why at the second: „two background
                 layers do not intersect … which puts a hard edge back on the
                 two sides this is here to remove." Background alone here is a
                 rectangle with a hard 80 %-alpha edge along its bottom, across
                 the middle of the windscreen, on a ghost that has no border and
                 no radius to end it — a plate edge by another name, i.e. the
                 2026-08-03 register through the back door.

                 THE MASK RAMPS IN THE PADDING, WHICH IS THE ONLY PLACE IT MAY
                 BE. `PEEK_SCRIM_FEATHER_PX` records the judgement for its own
                 bottom („right and bottom face the stage's own edge and the
                 instrument band, where a shorter ramp is invisible anyway"),
                 and the same constant's site records why the ramp may NOT be
                 under the key list two components down: „a 16 px ramp would run
                 under the LAST ROW OF KEYS, prose on a partial ground."

                 ⚠ AND IT RAN UNDER THIS CARD'S ONE CONTROL UNTIL 2026-08-27 —
                   eight rows of sweep w11 („the «РАЗБРАХ» button floats
                   detached below the text with no visual tie to it") and six
                   more of w12. With the mask measured over a box that STOPPED
                   at the ink, `calc(100% - 16px)` fell inside the chip: the
                   card measures ~127 CSS px, the chip is its last ~46, so the
                   ground under a 44 px touch target ran 0.80 → 0 from its top
                   edge to its bottom and the last third of it was live road.
                   That is why eight readers of eight different frames all
                   called the chip loose — the prose stood on 0.80 and the
                   control did not, so nothing on the glass said they were one
                   surface.

                   `ACK_CHIP_GROUND_ALPHA` is the other half and it is now the
                   half it was DERIVED to be. Its arithmetic assumes the card's
                   own 0.80 is under the chip („1 − (1 − 0.80)(1 − β) = 0.90");
                   with the ramp there, the shipped composite was 0.90 at the
                   chip's top and 0.50 at its bottom, i.e. the number was right
                   and the ground it was computed against was absent. The
                   padding moves the ramp BELOW the chip, so the pair reaches
                   0.90 across the whole control, as written — and the prose and
                   the button now share one uninterrupted flat core, which is
                   the tie those fourteen rows ask for and the only kind this
                   surface may have (a plate, a border and a radius are what the
                   2026-08-03 register took off it).

                 THE TOP EDGE STAYS HARD, on purpose and not by omission:
                 `PEEK_SCRIM_FEATHER_PX.top` is 0 because above this card is the
                 interior mirror's lane, and the published constant is taken
                 rather than re-decided. Its ends dissolve over the 26 px and
                 12 px horizontal ramps, so what remains is a stroke with no
                 corners — SimOverlay's own reading of the identical edge.

              ── ✅ RE-MEASURED ON THE POST-REPAIR FRAMES — sweep w6, 2026-08-27.
                 THE SHADE SHIPS. Three rows came back saying it does not
                 (sc-crossing-white-cane:452ab297 „no panel … a vignette at one
                 edge", sc-ov-solid-return:6c0e0f12 part (a), and
                 sc-crossing-white-cane:90a1ced1 „the «РАЗБРАХ» pill stands on
                 its own tint"). They do not reproduce on `.audit-frames/w13`,
                 which is this commit. Written down because FOUR sweeps have now
                 mis-measured this one surface the same way and the next one
                 deserves the method rather than another paragraph.

                 WHY THE MEAN SAYS „NO PANEL" AND IS WRONG. Every refutation
                 quotes a mean luma over a ~1000 × 400 block („38.4 → 38.1"). On
                 every mobile leg in the corpus the world inside this card's box
                 is a PARKED LORRY at luma 15–35 — already darker than the shade
                 would make it — so the mean cannot move and the statistic is
                 blind by construction. The only columns that CAN move are the
                 ones over bright world, and on these legs those sit at the
                 card's left edge — which is why every note describes „a ~160 px
                 left-edge feather and nothing else". That feather IS the shade;
                 it is `PEEK_SCRIM_FEATHER_PX.left`.

                 THE MEASUREMENT THAT ANSWERS IT: 01-arrival is the same camera
                 pose with the hint NOT painted (run.log: „✗ NOT ON THE GLASS")
                 and 03-ready is it painted, so per pixel solve the compositing
                 equation instead of averaging —
                 α = (L_arrival − L_ready) / (L_arrival − L_shade), L_shade =
                 luma(PEEK_SCRIM_RGB) = 10.0 — over the pixels whose ARRIVAL
                 luma is > 100, and take percentiles. Eight legs, iPhone 16
                 landscape 852 × 393 at dpr 3 (sc-ac-snow, sc-ac-crosswind,
                 sc-ac-wet-braking, sc-crossing-white-cane, sc-crossing-child-
                 ball, sc-junction-rhr, sc-junction-blind, sc-ov-oncoming-gap,
                 sc-rb-ped-exit), median α:

                   above the card (device y 120–212)   0.00   ← control
                   left of the padding box (x ≤ 1490)  0.00   ← control
                   the 26 px left ramp (x 1520–1590)   0.32 – 0.42
                   the flat core under the prose       0.87 – 0.94  (p25 ≥ 0.78)
                   inside «РАЗБРАХ» (y 482–502)        0.82, p95 0.90

                 — i.e. `PEEK_SCRIM_ALPHA` 0.80 under every glyph, the ramps at
                 half alpha where they belong, and 0.00 where there is no card.
                 `ACK_CHIP_GROUND_ALPHA`'s „1 − (1 − 0.80)(1 − 0.50) = 0.90"
                 lands on the pill to the second decimal, so the pill's ground
                 is DEEPER than the prose's, not absent. That it also reads
                 BRIGHTER than the road is the 18 % accent tint doing its
                 identity job on top — the refutations compared the pill to the
                 bare world instead of to the ground beside it.

                 AND THE GEOMETRY THE `content-box` PAIR ABOVE EXISTS FOR: on
                 this stage `right` resolves to 12 + 59 (notch) + 60 (flank) =
                 131 CSS, so the border box is x 503 → 721 CSS and the INK box
                 x 529 → 709 (device 1587 → 2127). Leftmost glyph pixel on the
                 binding line («натисни пак надолу — минава на»), measured on
                 four legs: device x 1591 — 4 px inside the ink edge, i.e. clear
                 of the ramp, which is what the w12 repair claimed and nothing
                 had checked. Bottom: the ramp fits α 0.80 → 0 across device
                 y 589 → 643 and the button's box ends at 594, so the ramp is
                 BELOW the control, also as claimed.
                 ────────────────────────────────────────────────────────────*/}
          <div
            data-hud="touch-hint-scrim"
            data-hud-ink=""
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              zIndex: -1,
              pointerEvents: "none",
              backgroundImage: peekScrimBackgroundCss({
                left: PEEK_SCRIM_FEATHER_PX.left,
                right: PEEK_SCRIM_FEATHER_PX.right,
              }),
              // Both spellings — WebKit is the engine these two frames were
              // photographed on, and an unprefixed-only mask there is no mask.
              WebkitMaskImage: peekScrimMaskCss({
                top: PEEK_SCRIM_FEATHER_PX.top,
                bottom: PEEK_SCRIM_FEATHER_PX.bottom,
              }),
              maskImage: peekScrimMaskCss({
                top: PEEK_SCRIM_FEATHER_PX.top,
                bottom: PEEK_SCRIM_FEATHER_PX.bottom,
              }),
            }}
          />
          {/* ── THE WORDS SCROLL, THE BUTTON DOES NOT. ────────────────────────
              The corridor's ceiling is the hazard band's (notifyColumn.ts), and
              measured on the deployed build with everything else in place the
              hint wanted 172 px of a 161 px box on an iPhone 16 sideways and of
              a 147 px box on the 780 × 360 profile. With the whole card as the
              scroller that overflow lands on «РАЗБРАХ» — the one control that
              clears it — 10.9 px below its own fold, which is the trap this
              screen has already been caught in twice (the deck's toggle off the
              top of the stage, the read sheet's «Разбрах» clipped by its own
              height).
              So the shape is SimOverlay's, which solved exactly this: a
              `min-h-0 shrink` window that owns the overflow, and a `shrink-0`
              control under it that is laid out at its natural 44 px whatever
              the ceiling is. The card itself is `overflow-hidden`, so its box
              is the honest one and a probe can measure it. */}
          <div className="flex min-h-0 w-full shrink flex-col gap-1.5 overflow-y-auto">
            {/* PORTRAIT SAYS ONE THING. Measured on iPhone 16: the two thumb
                lines below wrap to four in portrait and the whole hint costs
                16.6 % of the screen — on an orientation where the thumb layout
                cannot be used yet anyway. So portrait carries the one
                instruction that is actionable right now, and the gesture
                teaching arrives in landscape, where the thumbs are.

                ⚠ AND IT IS READ AS A CLIPPED HEADING EVERY SWEEP. Filed
                  2026-08-27 as sc-ov-oncoming-gap:e8b1bae7 — „the teach card's
                  own heading «Завърти телефона хоризонтално» is cut off above
                  the top of the viewport, so the card starts mid-text at «Ляв
                  палец»" — against three lessons at once (sc-rb-ped-exit,
                  sc-junction-blind). It is not clipped and there is nothing
                  above the viewport: this line is `display: none` in LANDSCAPE,
                  which is the only orientation the corpus photographs, and the
                  card's own top edge sits 73.3 CSS px BELOW y = 0 (device 220,
                  measured as the shade's hard top edge on the w13 frames —
                  `NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN`). What produces the row
                  is the probe: run.log prints `textContent`, which includes
                  `display: none` subtrees, so the harness reads a string the
                  glass never carried and every reader then hunts for it. The
                  markup is correct as it stands — the fix, if one is wanted,
                  belongs to the probe (tools/) and would be `innerText` or a
                  visibility filter. Do not delete or unhide this line to make
                  the row go away; portrait needs it and landscape must not
                  have it. */}
            <p className="hidden shrink-0 text-xs font-black [@media(orientation:portrait)]:block">
              Завърти телефона хоризонтално
            </p>
            {/* `w-full`, not `max-w-2xl`: the width is the corridor's now, and a
                cap of 672 px inside a 180 px lane is a number that describes a
                layout this hint has not had since it left the middle of the
                screen. `leading-tight` is the notification column's own leading
                — the peek's two text rows have been 11 px at `leading-tight`
                since the column shipped, and this card is now beside them. */}
            <p className="w-full shrink-0 text-[11px] font-bold leading-tight [@media(orientation:portrait)]:hidden">
              Ляв палец — волан. Десен палец — нагоре газ, надолу спирачка.
            </p>
            {/* The sentence used to read „задръж надолу" — hold down. That was
                the instruction that made a Б2 stop select reverse, so it is now
                what it always should have been: STOP first, LIFT the thumb,
                then press down again. Two acts of the foot, exactly like
                selecting R with the lever in a real automatic. */}
            <p className="w-full shrink-0 text-[11px] font-bold leading-tight text-accent-2 [@media(orientation:portrait)]:hidden">
              Спряла кола: пусни палеца и натисни пак надолу — минава на заден ход.
            </p>
          </div>
          <button
            type="button"
            autoFocus
            // §C2 — the pointer path FIRST, `onClick` kept beside it (the
            // «Продължи» order, and for the same reason: both are live and the
            // shared idiom de-duplicates). Without this the card's ONLY exit is
            // unreachable while a thumb rests on a pedal pad, which is the exact
            // posture a driver reads it in — see the wiring block above.
            {...tapDismissTouchHint}
            onClick={dismissTouchHint}
            // ── IT PAINTED 0 % OF ITS OWN BOX, AND NOBODY HAD LOOKED AT IT.
            //
            // The line that stood here said „44 px of thumb, and the only thing
            // here that paints a box". Photographed on the deployed build
            // (WebKit, iPhone 16 landscape, sc-zebra-approach@L1, the frame
            // straight after the briefing is acknowledged): «Разбрах» is bare
            // DARK type on a bright road, with no box at all. `bg-accent` never
            // reached the screen — `[data-hud="touch-hint"]` is on
            // `GHOST_SURFACES`, and the UNPANEL sweep sets
            // `background-color: transparent !important` on every child of a
            // ghost that is not marked `data-hud-ink`. So the one control that
            // clears this card had been stripped to `text-background` (#04070e)
            // over tarmac since the sweep landed — the same „0 % of its own box
            // is not quiet, it is absent" finding the control census made about
            // the peek's ✕, on the surface directly beside it.
            //
            // `data-hud-ink` is the sweep's own opt-out for the handful of fills
            // that ARE the information, and this is the case row A6 and row C2
            // are both literally about („«Разбрах» was not tappable").
            //
            // NOT THE SOLID PILL IT USED TO ASK FOR, though: the 2026-08-03
            // review named a „SOLID BRAND-BLUE «Разбрах» button" as the thing
            // that made this screen read as a cookie banner. This is the
            // register that replaced it and that he signed off — SimOverlay's
            // ack chip, 18 % tint on a 55 % hairline, light ink — so the two
            // acknowledgements on this screen are one object rather than two.
            //
            // ── …AND A TINT IS NOT A GROUND. sweep w11, 2026-08-27, filed eight
            //    times in one sentence — „the «РАЗБРАХ» button floats detached
            //    below the text with no visual tie to it". TWO THINGS were true
            //    of it and neither was the mechanism those notes name (the card's
            //    shade does NOT stop above this button; measured at
            //    ACK_CHIP_GROUND_ALPHA's site, it covers the whole card):
            //
            //    1. THE SHADE'S BOTTOM RAMP IS SPENT ENTIRELY ON THIS CONTROL.
            //       Card ~127 CSS px, chip the last ~46, feather 16 — so the
            //       ground under a 44 px touch target runs 0.80 → 0 top to
            //       bottom and the last third of it is live road. The `18%,
            //       transparent` mix has no ground of its own to carry it, which
            //       is the peek's «ЗАЩО» defect on the surface beside it. It now
            //       stands on the CARD'S OWN near-black at 0.50, so the two
            //       layers read 0.90 where the shade is up and 0.50 where the
            //       ramp has gone — never nothing. The 18 % tint is unchanged
            //       and, because `background-image` paints above
            //       `background-color`, still on top where it belongs.
            //
            //    2. IT WAS NOT THE PROSE'S COLUMN. `items-end` on the card left
            //       this chip at its natural ~120 px inside a 180 px lane, so it
            //       shared no edge with the two sentences and every reader
            //       described it as sitting beside/below them rather than as
            //       their footer. `w-full` makes its left and right edges the
            //       prose's own — the tie those eight rows ask for is the shared
            //       column, not another rectangle — and it hands a thumb the
            //       whole lane instead of two thirds of it. `justify-center`
            //       keeps the label where it already read.
            //
            //    NOT A PANEL AND NOT THE COOKIE BANNER: 180 × 44 is 2.4 % of an
            //    852 × 393 stage, the world stays legible inside it at 1.13 : 1
            //    (SimOverlay's measurement of the same pair), and there is still
            //    no blur, no shadow and no radius but the pill's own.
            data-hud-ink=""
            className="pointer-events-auto flex min-h-11 shrink-0 w-full items-center justify-center rounded-full border px-4 text-[11px] font-black uppercase tracking-wider text-foreground"
            style={{
              backgroundColor: ACK_CHIP_GROUND_CSS,
              backgroundImage:
                "linear-gradient(color-mix(in srgb, var(--accent) 18%, transparent), " +
                "color-mix(in srgb, var(--accent) 18%, transparent))",
              borderColor: "color-mix(in srgb, var(--accent) 55%, transparent)",
            }}
          >
            Разбрах
          </button>
        </div>
      ) : null}

      {menuPaused ? (
        <div
          // §I20 COMPANION. §I20 named four full-viewport scrims; this is a
          // FIFTH, and it is on the one pause §N7 says the product actually
          // uses besides a teach card — the «ПАУЗА» rail control. Same
          // mechanism, same cost: a viewport-sized `backdrop-filter: blur()`
          // composited over a live WebGL canvas. Opaque, for the reasons on
          // OVERLAY_SCRIM_CLASS. (Not the shared constant: this one centres
          // its card and does not scroll, so only the paint is shared.)
          className="absolute inset-0 z-20 flex items-center justify-center bg-background"
          role="dialog"
          aria-modal="true"
          aria-label="Пауза"
        >
          <div className="card flex w-64 flex-col gap-3 p-6 text-center">
            <h2 className="text-xl font-bold">Пауза</h2>
            <button
              type="button"
              autoFocus
              className="btn-accent"
              // §R · W1 — the pointer path FIRST, `onClick` kept beside it.
              // Order matters only for readability; both are live, and the
              // shared idiom de-duplicates so a mouse click cannot fire twice.
              {...tapResume}
              onClick={() => setMenuPaused(false)}
            >
              Продължи
            </button>
            <Link href="/dashboard" className="btn-ghost">
              Изход
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * S1 followHints probe (doc 76 §7 L1): watches the student's lateral
 * deviation from the shadow trace's ground path and flips `onChange(true)`
 * after FOLLOW_HINT_DEVIATION_M is exceeded for FOLLOW_HINT_SUSTAIN_S
 * continuous seconds (back within → immediately off). In-canvas because it
 * needs the frame clock; work is a ~4 Hz nearest-point scan over the
 * decimated path (≤ 2048 points — trivial), state changes only on edges.
 */
function FollowHintProbe({
  trace,
  sampleRef,
  paused,
  onChange,
}: {
  trace: ScenarioTrace;
  sampleRef: React.RefObject<VehicleSample>;
  paused: boolean;
  onChange: (on: boolean) => void;
}) {
  const path = useMemo(() => tracePathForRibbon(trace, 1.0, 2048), [trace]);
  const stateRef = useRef({ t: 0, nextPollT: 0, offSince: null as number | null, on: false });
  useFrame((_, delta) => {
    if (paused) return;
    const s = stateRef.current;
    // DRIVING seconds, not wall seconds — the same ceiling the graded clock
    // uses (sessionClock.ts), for the same measured reason. `clock.elapsedTime`
    // was wall time: on the PC trace's 2.33 s frames a SINGLE deviated frame
    // cleared the 2 s sustain, so the chip fired after 0.5 s of road instead of
    // 2 s of it — and because that clock also ran through every teach-moment
    // pause, a student who was off the line when the card appeared came back to
    // an instant hint. Above 10 fps this is the raw delta and nothing moves.
    s.t += sessionClockAdvance(delta);
    const now = s.t;
    if (now < s.nextPollT) return;
    s.nextPollT = now + FOLLOW_HINT_POLL_S;
    const pos = sampleRef.current.position;
    let best = Infinity;
    for (let i = 0; i < path.count; i++) {
      const dx = pos.x - path.pts[i * 2];
      const dy = pos.y - path.pts[i * 2 + 1];
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    const deviated = Math.sqrt(best) > FOLLOW_HINT_DEVIATION_M;
    if (!deviated) {
      s.offSince = null;
      if (s.on) {
        s.on = false;
        onChange(false);
      }
      return;
    }
    if (s.offSince === null) s.offSince = now;
    if (!s.on && now - s.offSince >= FOLLOW_HINT_SUSTAIN_S) {
      s.on = true;
      onChange(true);
    }
  });
  return null;
}

// A2 pedal-edge thresholds on the RAW (pre-gate) ramped keyboard/gamepad
// pedals: crossing PRESS upward performs the step; re-arms below RELEASE.
const BRAKE_PRESS_THRESHOLD = 0.4;
const BRAKE_REARM_THRESHOLD = 0.1;

/** Poll baseline for the cabin-electrics edge detection (A2 observer). */
interface CabinPollState {
  seatbeltOn: boolean;
  headlights: "off" | "low" | "high";
  indicator: "off" | "left" | "right";
  brakeArmed: boolean;
}

function cabinPollBaseline(cabin: CabinControls | null, rawBrake: number): CabinPollState {
  return {
    seatbeltOn: cabin?.seatbeltOn ?? false,
    headlights: cabin?.headlights ?? "off",
    indicator: cabin?.indicator ?? "off",
    brakeArmed: rawBrake > BRAKE_PRESS_THRESHOLD,
  };
}

/**
 * Demonstration playback deck wrapper — founder ruling 2026-07-17: the demo
 * deck must not dominate the frame; the car STATUS dashboard (the shell's
 * bottom-center bar) is the visual anchor. So the deck is ~40 % smaller
 * (26 rem vs 36 rem width + TraceTimeline `compact` controls), sits ABOVE
 * the status bar (bottom-[6.75rem] clears the bar's ~100 px strip), and
 * collapses to a small pill via the toggle.
 *
 * ON A PHONE IT STARTS COLLAPSED (2026-07-29, measured). The same ruling read
 * on the founder's own device: open, this deck laid out 21.5 % of an 852 × 393
 * landscape iPhone — a caption card, a scrub bar and a transport row parked
 * dead centre, on the screen where he said „approximately half … is occupied by
 * controls, information panels, popups". After the touch controls and the
 * instrument band were cut to 1.7 % and 0.9 %, this ONE panel was over half of
 * all remaining chrome, and twelve of the nineteen sub-44 px touch targets on
 * the screen were its 20 × 28 annotation ticks and 32 × 32 transport buttons.
 *
 * Nothing is removed: the pill is still there, one tap opens it, the shadow
 * car's blue ribbon still draws in the world, and on any roomy screen the deck
 * opens exactly as it always did. What changes is which one the phone starts
 * on — and on a phone the demonstration is the thing happening on the ROAD, not
 * the scrub bar in front of it.
 *
 * The threshold is immersive.ts's compact test, inlined rather than imported:
 * this file is the scene, that one belongs to the play shell, and the number is
 * a device fact (every phone in landscape is under 560 px tall; every tablet is
 * over) rather than a shared decision.
 *
 * ── AND ON A PHONE IT IS A DIFFERENT DECK WHEN IT IS OPEN — 2026-08-10.
 *
 * The measurement that forced this, WebKit, real insets, sc-zebra-approach@L1:
 * hanging a 231.5 px panel from the control band on a 393 px-tall stage lays it
 * out at y = −96. Its first child is this toggle, so the toggle went off the
 * top of the screen with it and there was no other way to dismiss the panel —
 * on all four device profiles the deck could be opened and not closed. Its
 * pause button landed on «Меню на урока» (1 024 px² at 852 × 393, 864 px² at
 * 780 × 360, and `elementFromPoint` at the button's own centre returned the
 * menu), and 13 of its controls were under 44 px.
 *
 * So the OPEN deck stops being a desktop panel that has been shoved upward:
 *
 *   • `data-deck-open` lets PlayAreaStyles give it a landscape-phone geometry
 *     (top-anchored beside the lesson menu, as wide as the strip that is left)
 *     without this file learning about orientation — the same attribute
 *     grammar `data-sim-compact` already uses for every other phone rule;
 *   • the toggle is handed to the timeline as its row's first control, because
 *     a 393 px-tall stage has 127.5 px of clear corridor and a toggle on its
 *     own line costs 48 of them;
 *   • `touch` puts every control in that row at 44 px (TraceTimeline).
 */
function useCompactStage(): boolean {
  // SSR and the first paint answer „roomy", which is what the deck's own
  // `open` default has always assumed; the effect corrects it before the
  // student can reach for anything.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const read = () => setCompact(window.innerHeight <= 560 || window.innerWidth <= 640);
    read();
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    return () => {
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
    };
  }, []);
  return compact;
}

function DemoDeck({
  trace,
  clockRef,
  suppressed = false,
  sampleRef,
}: {
  trace: ScenarioTrace;
  clockRef: React.RefObject<TraceClock>;
  /**
   * The live car, read to decide when this demonstration stands down. Optional
   * so the dev clip routes can mount a deck with no vehicle behind it; absent,
   * the deck keeps its pre-2026-08-24 behaviour of narrating forever, which is
   * the failure that costs a caption rather than a lesson.
   */
  sampleRef?: React.RefObject<VehicleSample>;
  /**
   * The ⚙ driveline sheet is open, so `PlayAreaStyles` has this deck
   * `display: none` (the two stand on the same floor — see `touchSheetOpen` in
   * LessonScene and the rule keyed on `html[data-sim-car-sheet]`).
   *
   * THIS PROP DOES NOT HIDE ANYTHING — the stylesheet already did. It exists
   * because a hidden transport is still a RUNNING one, and it does exactly one
   * thing: stop the clock while the panel is off screen and start it again if
   * it was running. `open` below is untouched and the playhead is the parent's
   * ref, so the way back is the frame the student left.
   */
  suppressed?: boolean;
}) {
  const [open, setOpen] = useState(
    () =>
      typeof window === "undefined" ||
      !(window.innerHeight <= 560 || window.innerWidth <= 640),
  );
  const compact = useCompactStage();
  /**
   * Declared before the two effects that both read it: the stand-down latch is
   * the senior fact about this deck, and the suppression effect below has to be
   * able to ask whether the demonstration is finished with.
   */
  const stoodDownRef = useRef(false);
  const [stoodDown, setStoodDown] = useState(false);
  // A DEMONSTRATION MAY NOT ADVANCE WHILE IT IS OFF SCREEN. `display: none`
  // hides a panel; it does not stop a replay. The pause is a ref write, not
  // state: nothing re-renders, and the transport picks it up on its own next
  // poll — so this cannot cost a frame on a screen that is not even visible.
  //
  // The condition is deliberately the same one the stylesheet uses and NOT
  // `compact && …`: the rule that hides this deck is not compact-scoped, so a
  // compact-only pause would leave a roomy touch device running a hidden
  // replay — a different bug wearing the same fix.
  useEffect(() => {
    if (!suppressed) return;
    // Captured, not re-read in the cleanup: the clock this effect paused is the
    // one it must un-pause, and `clockRef.current` at teardown could be a
    // different lesson's. (It is also what react-hooks/exhaustive-deps asks
    // for, and the rule is right here rather than merely satisfied.)
    const clock = clockRef.current;
    if (!clock) return;
    const wasPlaying = clock.playing;
    clock.playing = false;
    return () => {
      // Only give back what was taken: a demonstration the student had already
      // paused stays paused — AND one that stood down while the sheet was open
      // stays down. Without the second half, a student who opens the ⚙ sheet,
      // pulls away, and closes it again restarts a replay behind their own
      // moving car: `wasPlaying` was captured true before they set off.
      if (wasPlaying && !stoodDownRef.current) clock.playing = true;
    };
  }, [suppressed, clockRef]);
  /**
   * THE DEMONSTRATION STANDS DOWN WHEN THE STUDENT STARTS DRIVING.
   *
   * A ONE-WAY LATCH, for the reason spelled out at the controls legend: written
   * as a condition ("the car is moving") it would come back every time the
   * student stopped at a junction, and a demonstration that resumes narrating
   * mid-lesson is worse than one that never stopped. Once this trips, the poll
   * is gone for this lesson and the transport is the only authority left — the
   * student can still replay the demonstration deliberately.
   *
   * It is a ref, not state, so latching costs no render; the paired `useState`
   * exists only because the CAPTION has to disappear, and that is a render.
   *
   * …AND THE PANEL GOES WITH THE VOICE — sc-follow-distance:407a976c and
   * sc-follow-brake:62b67c75, 2026-08-24.
   *
   * The latch above silenced the caption and stopped the clock and left the
   * TRANSPORT standing, on the reasoning that „the transport is the only
   * authority left". That leaves ~420 × 105 px of scrub track, four buttons and
   * three speed chips parked in the lower-left of the play area for the whole
   * lesson: measured by the judge at x ≈ 278–890, y ≈ 540–645 of a 1440 × 900
   * shot, and visible on every drive frame of
   * `.audit-frames/w10-3/frames/sc-follow-distance__pc-right/` from 01-arrival
   * to 04-t179s. On the cockpit view that band is the top of the dashboard and
   * the near carriageway — the two things a following-distance drill is about.
   *
   * SO IT COLLAPSES TO ITS OWN BUTTON, which is not a new idea: the controls
   * legend two components down does exactly this on exactly this trigger
   * (`autoCollapsedRef` / `controlsLegendStandsDown`), and the corpus already
   * accepted the result — the keys panel's row was closed on the frames where
   * it had shrunk to a «Клавиши · за напреднали ▸» button. The deck's own
   * «🎬 Демонстрация ▾» button stays exactly where it was, so nothing is taken
   * away: a student who wants the demonstration back reopens it, deliberately,
   * which is the same sentence the paragraph above already ends on.
   *
   * ONE-WAY, like everything else here, and only ONCE — `setOpen(false)` runs
   * inside the same latch, so a student who reopens the deck at a junction
   * keeps it open for the rest of the lesson.
   */
  useEffect(() => {
    if (!sampleRef || stoodDownRef.current) return;
    const id = window.setInterval(() => {
      if (!demoDeckStandsDown(sampleRef.current.speedKmh)) return;
      stoodDownRef.current = true;
      setStoodDown(true);
      setOpen(false);
      // Stop the replay as well as its voice. The caption is what the corpus
      // photographed, but a demonstration still running behind a silent deck
      // would put the shadow car through a junction the student is negotiating.
      const clock = clockRef.current;
      if (clock) clock.playing = false;
    }, DEMO_DECK_POLL_MS);
    return () => window.clearInterval(id);
  }, [sampleRef, clockRef]);
  /**
   * DOC 91 · C2 — THE BUTTON THAT OPENS AND CLOSES THE DEMONSTRATION.
   *
   * Its five transport controls got the pointer path in J-WAVE-4
   * (`TraceTimeline`), and leaving this one on `onClick` alone would be the
   * worse half of a half-fix: on a phone the student could pause the
   * demonstration with a thumb on the throttle and then not be able to shut it,
   * which is a control that traps rather than one that is merely missing. A
   * touch-borne `click` is a compatibility mouse event and is dispatched only
   * for the PRIMARY touch point — measured on this build, six profiles: with
   * one finger planted, all 40 controls on the driving screen receive
   * `pointerdown`/`pointerup` and NOT ONE receives a `click`.
   *
   * `onClick` stays underneath it, and so do `tabIndex={-1}` and the
   * `onMouseDown` preventDefault — this button must not take focus off the
   * canvas, and neither of those is what C2 is about.
   */
  const tapToggle = useTapActivation(() => setOpen((o) => !o));
  const toggle = (
    <button
      type="button"
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      {...tapToggle}
      aria-expanded={open}
      // ONLY in the row, where the glyph is the whole button and there is no
      // word to read. Everywhere else the visible label IS the accessible name
      // — overriding it with a different wording is the „label in name" trap
      // (WCAG 2.5.3) for anyone driving this by voice.
      aria-label={compact && open ? "Затвори демонстрацията" : undefined}
      className={
        compact && open
          ? // In the row, and a real 44 px control rather than a 26.5 px pill
            // wearing row C2's invisible hit pad — it is the CLOSE control of a
            // panel that covers the road, and this is the one the founder has
            // to be able to hit.
            "pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-background/80 text-base text-muted backdrop-blur transition hover:text-foreground"
          : // DOC 91 · L9/§I14 — measured 134×**27** closed, 17 px short of the
            // thumb minimum. The BOX is not grown (a 44 px-tall pill with an
            // 11 px label reads as a button bar on the road, which is the
            // furniture the whole UNPANEL pass exists to remove): the TAP AREA
            // is, with the absolutely-positioned invisible `::before` that
            // `QualityPresetSelector` already uses and that the mobile probe
            // explicitly unions into the hit rect (tools/mobile/lib/probe.mjs).
            // 27 + 2×10 = 47. Safe here because the pill is horizontally
            // isolated: closed, it is the only child of its column; open, the
            // compact arm above replaces it with a real 44 px round control.
            "pointer-events-auto relative flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2.5 py-1 text-[11px] font-semibold text-muted backdrop-blur transition before:absolute before:-inset-y-2.5 before:left-0 before:right-0 before:content-[''] hover:text-foreground"
      }
    >
      {compact && open ? (
        <span aria-hidden>🎬▾</span>
      ) : (
        <>
          <span aria-hidden>🎬</span>
          Демонстрация {open ? "▾" : "▸"}
        </>
      )}
    </button>
  );
  return (
    // `bottom-[6.75rem]` is ROOMY_HUD_FLOOR_PX and it is the ROOMY number. On a
    // phone this deck has to clear the touch pads instead, which reach 68px
    // higher — PlayAreaStyles moves it, keyed on the shell's own compact
    // attribute, for the same reason it moves the difficulty picker: one
    // definition of "compact" in the codebase, and the scene keeps its desktop
    // layout in its own file. `data-hud` is the stable handle that rule needs.
    <div
      data-hud="demo-deck"
      data-deck-open={open ? "true" : "false"}
      className="absolute bottom-[6.75rem] left-1/2 z-10 flex min-h-0 w-[min(88%,26rem)] -translate-x-1/2 flex-col items-center gap-1"
    >
      {compact && open ? null : toggle}
      {open ? (
        <TraceTimeline
          trace={trace}
          clockRef={clockRef}
          compact
          touch={compact}
          leading={compact ? toggle : null}
          standDown={stoodDown}
          // …AND THE SAME LIFETIME AT THE OTHER END. `aidClockRef` is created by
          // `demoDeckAtRest(createTraceClock())` — parked at 0:00, not playing —
          // and `tSec = 0` is inside the window of every annotation authored at
          // 0, so this deck captioned a demonstration nobody had started, in a
          // solid card over the middle of the windscreen, from the lesson's
          // first frame (`w21/…/sc-ov-keep-right__pc-right/01-arrival.png`).
          // The clock waited for its audience; the voice did not.
          // `demoDeckNarrates` in `demoDeckLifetime.ts` carries the frame.
          awaitsAudience
        />
      ) : null}
    </div>
  );
}

/** In-canvas per-frame driver: signals → traffic → sample → onTick + minimap
 *  + the A2 pre-drive transition observer. */
function RuntimeDriver({
  runtime,
  traffic,
  director,
  hazardActiveRef,
  telltaleLitRef,
  telltaleCautionLitRef,
  onTelltale,
  onTelltaleCaution,
  sampleRef,
  simRef,
  inputRef,
  cabinRef,
  audioRef,
  attemptRecorderRef,
  dashboardStatusRef,
  tierCapKmh,
  tierNameBg,
  reverseAssist,
  reverseAssistEnabled,
  reverseStuck,
  stuckStart,
  assistShiftingRef,
  driveLocked,
  drivelineEventsRef,
  glanceQueueRef,
  onPreDriveStep,
  onBlockedDriveAttempt,
  onTick,
  onMinimap,
  onDriveline,
  onDrivelineRejection,
  onReversePedalStuck,
  onStuckStart,
  onTransmissionChanged,
  onStagedOutcome,
  minimapPolylines,
  isNight,
  rain,
  fog,
  snow,
  paused,
}: {
  runtime: ReturnType<typeof createWorldRuntime>;
  traffic: ReturnType<typeof createTrafficSystem>;
  /** A8 scenario director (null = lesson stages nothing). */
  director: ScenarioDirector | null;
  /** A8 → TrafficLayer: animate the lesson hazard visual while true. */
  hazardActiveRef: React.RefObject<boolean>;
  /** N11 (VP-06) → VitokCockpit: the staged dashboard lamp is lit while true
   *  (the hazardActiveRef twin for the cockpit cluster). */
  telltaleLitRef: React.RefObject<boolean>;
  /** N11 (VP-06) → VitokCockpit: the AMBER twin ("checkEngine"). */
  telltaleCautionLitRef: React.RefObject<boolean>;
  /** Edge callback for the L1/L2 HUD cue (state flips only on lamp edges). */
  onTelltale?: (on: boolean) => void;
  /** The amber lamp's own edge callback — its cue teaches the OPPOSITE
   *  response, so it can never share the red one's line. */
  onTelltaleCaution?: (on: boolean) => void;
  sampleRef: React.RefObject<VehicleSample>;
  /** S0-View: live steer angle for the attempt recorder (visual channel). */
  simRef: React.RefObject<VehicleSim | null>;
  inputRef: React.RefObject<GatedSimInput | null>;
  cabinRef: React.RefObject<CabinControls | null>;
  audioRef: React.RefObject<SimAudio | null>;
  /** S0-View attempt recording — absent/null = off (default). */
  attemptRecorderRef?: React.RefObject<LiveTraceRecorder | null>;
  /** Status-dashboard channel — mutated in place per frame (no allocation);
   *  the shell's bar polls it low-Hz. Absent = no writes. */
  dashboardStatusRef?: React.RefObject<DashboardStatus>;
  /**
   * The active tier's governor cap (km/h) on THIS map, or null when the tier
   * has none („Напреднал"). Passed rather than recomputed here so exactly one
   * `governorCapKmh` call decides both the number the physics enforces and the
   * number the cluster prints (2026-08-11 — before this the number was printed
   * nowhere at all and a clamped throttle read as a broken car).
   */
  tierCapKmh: number | null;
  /** …and the tier's own name, so the readout can say WHOSE ceiling it is. */
  tierNameBg: string;
  /** Auto-reverse assist machine (engine/reverseAssist.ts) — stepped once
   *  per live frame; emitted commands are executed through the SAME
   *  DrivelineState gear gate as the [ / ] keys. */
  reverseAssist: ReverseAssist;
  /** Lesson-static gate: false on examMode lessons (the exam grades the
   *  real selector procedure — the assist stays completely silent). */
  reverseAssistEnabled: boolean;
  /** LAW 2's voice (engine/reverseStuck.ts) — stepped on the same live frames
   *  as the assist, off the mapper's own `isDisowned`. */
  reverseStuck: ReverseStuckWatch;
  /** „The car itself is refusing" (engine/stuckStart.ts) — stepped on the same
   *  live frames, off the driveline and the functional throttle. */
  stuckStart: StuckStartWatch;
  /** True only for the microtask of executing an assist shift, so the
   *  driveline subscription can tell assist steps from MANUAL ones. */
  assistShiftingRef: React.RefObject<boolean>;
  /** True while the procedure runs — the observer only listens then. */
  driveLocked: boolean;
  drivelineEventsRef: React.RefObject<DrivelineEvent[]>;
  glanceQueueRef: React.RefObject<MirrorGlanceKind[]>;
  onPreDriveStep: (stepId: PreDriveStepId, tSec: number) => void;
  onBlockedDriveAttempt: () => void;
  onTick: (t: SimTick) => void;
  onMinimap: (f: MinimapFrame) => void;
  onDriveline?: (snap: DrivelineSnapshot) => void;
  onDrivelineRejection?: (rejection: DrivelineRejection, snap: DrivelineSnapshot) => void;
  onReversePedalStuck?: (direction: ReverseStuckDirection) => void;
  onStuckStart?: (reason: StuckStartReason) => void;
  onTransmissionChanged?: (
    transmission: TransmissionMode,
    movedSelectorTo: SelectorPosition,
  ) => void;
  onStagedOutcome?: (outcome: StagedEventOutcome) => void;
  minimapPolylines: MinimapFrame["polylines"];
  isNight: boolean;
  rain: boolean;
  /** FOG weather flag — reaches every tick via runtime.sample (the rain seam). */
  fog: boolean;
  /** SNOW weather flag — the same seam (tick.snow, doc 72 AC-08). */
  snow: boolean;
  paused: boolean;
}) {
  const tRef = useRef(0);
  const lastMinimapRef = useRef(0);
  // Scene-owned status-dashboard scratch (created on the first frame; the
  // shell's dashboardStatusRef is pointed at it — see the useFrame block).
  const dashScratchRef = useRef<DashboardStatus | null>(null);

  // ONE weather/time object, read by BOTH channels this component drives: the
  // dashboard publication in the useFrame block below, and `runtime.sample`
  // further down, which is what the RULE ENGINE grades. They used to name the
  // four flags separately, and that is how the SAME hole got dug twice — O28 in
  // the grader (no snow arm on the low-beam duty) and O35 here in the display
  // (`isNight || rain`, which compile makes blind to snow). A flag can no longer
  // reach one side and miss the other, because there is only one side.
  //
  // It is also the only per-frame allocation this block ever had: the old
  // `dash.conditions = { isNight, rain, fog, snow }` built a fresh object 60
  // times a second inside a channel whose header promises zero allocation.
  // These four are LESSON-STATIC props, so the memo rebuilds when the lesson
  // does and never during a drive.
  const conditions = useMemo(
    () => ({ isNight, rain, fog, snow }),
    [isNight, rain, fog, snow],
  );

  // A2 observer state: the signal tracker + polled-edge baseline reset on
  // every RISING edge of driveLocked (lesson start AND retry), re-baselined
  // to the cabin's CURRENT state so a car left belted/running by a previous
  // run never auto-completes steps — the student re-performs transitions.
  const trackerRef = useRef<PreDriveSignalTracker>(createPreDriveSignalTracker());
  const pollRef = useRef<CabinPollState>(cabinPollBaseline(null, 0));
  const prevLockedRef = useRef(false);
  // S0-View attempt recorder: last indicator setting → signal-on/off edges.
  const recIndicatorRef = useRef<"off" | "left" | "right">("off");

  useFrame((_, delta) => {
    // QW10: consume the throttle-while-locked latch every frame (so attempts
    // during a pause never queue up), surface it only on live frames.
    const blockedAttempt = inputRef.current?.consumeBlockedDriveAttempt() ?? false;

    // Status-dashboard channel: fill a scene-owned scratch object (local-ref
    // contents — the pollRef mutation grammar) from the REAL cabin state each
    // frame — including the live blink-lamp levels off CabinControls' 600 ms
    // clock, so the DOM bar flashes in phase with the 3D cluster — then
    // publish it by pointing the shell's ref at it (the hazardActiveRef write
    // grammar). Zero allocation. Runs BEFORE the paused early-out: cabin keys
    // still work during a pause and the dashboard must mirror them.
    //
    // THE FIELD WRITES THEMSELVES LIVE IN `hud/dashboardStatus.ts` — 2026-08-19.
    // They were inlined here, and being inlined in a `.tsx` scene is why the
    // O35 fix was unprovable: reverting this block's one weather line to
    // `undefined` left 1,982 tests across 118 files green and `tsc` at 0,
    // because no unit test can mount a component that needs an R3F canvas and
    // a wasm physics world (the vitest environment here is `node`, no DOM).
    // `hud/__tests__/dashboard-publication.test.ts` now drives the extracted
    // function directly, and `conditions` is a REQUIRED parameter of it, so
    // dropping the hand-over below is a compile error rather than a silent
    // winter lesson with no lights row.
    //
    // Imported from `@/modules/sim/hud/dashboardStatus` rather than the hud
    // barrel for the same reason the D11 imports above are — the barrel is
    // another lane's file this wave. Re-exporting it there later changes
    // nothing here.
    const dashCabin = cabinRef.current;
    if (dashboardStatusRef && dashCabin) {
      // The scene hands over the facts it owns and concludes nothing: which
      // duty the weather creates, and which law states it, is derived once —
      // downstream, off the same precedence `reduceTick` grades on.
      dashboardStatusRef.current = writeDashboardStatus(
        (dashScratchRef.current ??= createDashboardStatus()),
        dashCabin,
        sampleRef.current.speedKmh,
        conditions,
        tierCapKmh,
        tierNameBg,
      );
    }

    if (paused) return;

    // ---- A2: performed pre-drive — real transitions drive the machine ----
    const cabin = cabinRef.current;
    const input = inputRef.current;
    const drivelineEvents = drivelineEventsRef.current;
    const glances = glanceQueueRef.current;
    if (driveLocked && !prevLockedRef.current) {
      trackerRef.current = createPreDriveSignalTracker();
      pollRef.current = cabinPollBaseline(cabin, input?.rawBrake ?? 0);
      drivelineEvents.length = 0;
      glances.length = 0;
    }
    prevLockedRef.current = driveLocked;

    if (driveLocked && cabin) {
      const tracker = trackerRef.current;
      const emit = (stepId: PreDriveStepId | null) => {
        if (stepId) onPreDriveStep(stepId, tRef.current);
      };
      // 1. Driveline transitions (ignition / selector / parking brake).
      for (const event of drivelineEvents) {
        emit(observeControlSignal(tracker, { kind: "driveline", event }));
      }
      // 2. Mirror glances (keys Q/E/F and mirror hotspots — one graded path).
      for (const mirror of glances) {
        emit(observeControlSignal(tracker, { kind: "glance", mirror }));
      }
      // 3. Cabin electrics — polled edges (belt / lights / indicator).
      const poll = pollRef.current;
      if (cabin.seatbeltOn !== poll.seatbeltOn) {
        poll.seatbeltOn = cabin.seatbeltOn;
        emit(observeControlSignal(tracker, { kind: "seatbelt", on: cabin.seatbeltOn }));
      }
      if (cabin.headlights !== poll.headlights) {
        poll.headlights = cabin.headlights;
        emit(observeControlSignal(tracker, { kind: "headlights", setting: cabin.headlights }));
      }
      if (cabin.indicator !== poll.indicator) {
        poll.indicator = cabin.indicator;
        emit(observeControlSignal(tracker, { kind: "indicator", setting: cabin.indicator }));
      }
      // 4. Brake pedal — raw (pre-gate) press edge performs "press-brake".
      const rawBrake = input?.rawBrake ?? 0;
      if (!poll.brakeArmed && rawBrake > BRAKE_PRESS_THRESHOLD) {
        poll.brakeArmed = true;
        emit(observeControlSignal(tracker, { kind: "brakePressed" }));
      } else if (poll.brakeArmed && rawBrake < BRAKE_REARM_THRESHOLD) {
        poll.brakeArmed = false;
      }
      // 5. Throttle — on a genuinely ready driveline it IS "move-off"
      //    (completes the procedure → shell unlocks the QW10 gate → the same
      //    held pedal rolls the car); earlier it stays the teaching moment.
      if (blockedAttempt) {
        if (readyToMoveOff(cabin.driveline.physicsInput)) {
          emit(observeControlSignal(tracker, { kind: "moveOffAttempt" }));
        } else {
          onBlockedDriveAttempt();
        }
      }
    } else if (blockedAttempt) {
      onBlockedDriveAttempt();
    }
    // Rejected driveline actions must be VISIBLE (founder bug 2026-07-10:
    // start interlock + selector gate refused silently). Forward them with a
    // fresh snapshot — the selector cannot have changed by the rejection
    // itself, so the snapshot names the state that blocked the action.
    if (onDrivelineRejection && cabin) {
      for (const event of drivelineEvents) {
        if (event.kind === "startRejected" || event.kind === "shiftRejected") {
          onDrivelineRejection(event, cabin.driveline.snapshot());
        }
      }
    }
    // …and the state change nothing REFUSED, which is why it had no voice: the
    // tier pill moving the student's own lever. `switchTransmission` puts a
    // standing car into N on the way into „Напреднал" (first gear with the
    // clutch up is a stall — vehicle/driveline.ts), and until now it did it in
    // total silence. Same loop, same channel, same grammar as the refusals
    // above; the event only carries `movedSelectorTo` when the lever actually
    // moved, so a tier click that changes nothing says nothing.
    if (onTransmissionChanged && cabin) {
      for (const event of drivelineEvents) {
        if (event.kind === "transmissionChanged" && event.movedSelectorTo !== undefined) {
          onTransmissionChanged(event.transmission, event.movedSelectorTo);
        }
      }
    }
    // S0-View: stream driveline transitions into the attempt trace before
    // the queues drain (sparse events — allocation is allowed there).
    const recorder = attemptRecorderRef?.current;
    if (recorder) {
      for (const event of drivelineEvents) {
        recorder.addEvent("driveline", tRef.current, undefined, event.kind);
      }
    }
    // Drain both queues even outside the pre-drive phase (driveline events
    // keep flowing while driving — wipers, gears, stalls — and must not pile).
    drivelineEvents.length = 0;
    glances.length = 0;

    // ══ THE LESSON'S CLOCK IS THE WORLD'S CLOCK — 2026-08-16, measured on PC ══
    //
    // This line used to read `Math.min(delta, 0.1)`, and that 0.1 was a second,
    // independent guess at a ceiling the physics had already chosen. rapier
    // clamps a frame at 0.5 s before its accumulator sees it, so on any frame
    // longer than 0.1 s the car's body advanced up to FIVE TIMES further than
    // the clock the same frame handed the rule engine.
    //
    // Measured, staging, Chromium 1440×900 @2, sc-zebra-approach L1: the PC
    // render graph (three mirror RTT passes + the chase rear-view camera + the
    // N8AO/SMAA composer) costs 2.33 s/frame at dsf1 and 3.57 s/frame at dsf2.
    // At 3.57 s the world gained 0.5 s and `tRef` gained 0.1 s, so 700 m of
    // road driven at 42 km/h was booked as 140 m — engine.ts integrates
    // `cleanDistanceM` as `(speed / 3.6) * (t - prevT)`, and 250 m buys a
    // CLEAN_DRIVING commendation. Two earned, none awarded.
    //
    // AND THE SAME FIFTH WAS BEING CHARGED TO EVERY DUTY MEASURED IN SECONDS.
    // The give-way witness gate is the one a student feels: runners.ts does
    // `this.stoppedForSec += input.dtSec` and asks for
    // WITNESS_STOPPED_HOLD_SEC = 2.0 — so a genuine two-second standstill at a
    // Б2 was credited as 0.4 s and the objective refused. That is a FALSE
    // FAILURE manufactured by the frame rate, and the fix is the clock, not the
    // gate: the duty is still two seconds, it is now two seconds of the world
    // the car is driving in. `accelMps2`, every sustain/lookback window, the
    // director's `tSec` and the attempt trace's timestamps were all paying it.
    //
    // Above 10 fps this is bit-identical to what it replaced: both ceilings are
    // inert and the advance is the raw delta. See lesson-ui/sessionClock.ts —
    // its test re-reads rapier's literal out of node_modules so the two cannot
    // drift apart again.
    //
    // AND THE WORLD NOW KEEPS UP — O13/O19, closed 2026-08-19 in
    // `traffic/system.ts`. That row read „NOT FIXED HERE" through two rounds:
    // traffic clamped its own step at MAX_DT_SEC = 0.1, so the `dt` handed to
    // `traffic.update()` below was truncated and NPC cars and staged
    // pedestrians walked at a FIFTH of this car's pace on a sub-10-fps frame.
    // MEASURED on the real district at seed 7, one 0.5 s frame: 8.825 m of
    // ambient travel against 44.109 m for the same half-second at 60 Hz, and
    // `update(0.5)` was bit-identical to `update(0.1)` — the ceiling was not
    // slowing the world, it was discarding 0.4 s of it while this line handed
    // the car all 0.5. `traffic.update()` now SUBDIVIDES the frame into five
    // 0.1 s steps instead of truncating it, so no body integrates over a longer
    // interval than it ever did and the world the car is graded against is the
    // world the car is driving in. Above 10 fps that path is byte-for-byte the
    // one that shipped (traffic/__tests__/substep.test.ts pins the pre-fix
    // playback as a golden).
    //
    // STILL SPLIT, and not this lane's file: `VehicleRig`'s
    // `cabin.update(delta, …)` runs the blink/wiper/stall timers on the raw,
    // unclamped delta — so on a 3.57 s frame the indicator still blinks seven
    // times what the clock says.
    const dt = sessionClockAdvance(delta);
    tRef.current += dt;
    const sample = sampleRef.current;

    // Auto-reverse assist (founder 2026-07-17): press the brake at a
    // standstill in D → the assist works the SAME selector gate as the
    // [ / ] keys (two gearDown steps, D→N→R); in R the pedals are already
    // remapped by GatedSimInput (S/↓ = reverse throttle, W/↑ = brake), so
    // pressing the remapped brake at a standstill walks the gate back up
    // (R→N→D). Interlocks, DrivelineEvents, HUD telltales and the recorder
    // all see canonical transitions. Hard gates: never on examMode lessons
    // (prop), never during the pre-drive procedure (a held brake there IS a
    // step), automatic box only (the manual tier keeps the real gearbox),
    // engine running only.
    //
    // The word is PRESS, not hold, and it is load-bearing: since 2026-08-05
    // the assist only reads a press that begins after the car is stopped and
    // the pedal has been lifted (reverseAssist.ts LAW 1). A brake carried in
    // from motion and held — the Б2 stop line, a red light, a give-way wait —
    // shifts nothing, because that pedal drove the car backwards into traffic
    // for as long as this assist has existed.
    //
    // …and BECAUSE the press had to be lifted first, it also carries through as
    // the reverse accelerator: the flip it causes is labelled "assist" for the
    // mapper (see the driveline subscription), so ↓ at a standstill takes R and
    // moves the car on that one press — founder ruling 2026-08-11, „thats
    // automatic transmition". Every hand-worked route stays guarded.
    if (reverseAssistEnabled && !driveLocked && cabin) {
      const dl = cabin.driveline;
      if (dl.transmission === "automatic" && dl.engineOn) {
        const cmd = reverseAssist.update({
          speedKmh: sample.speedKmh,
          selector: dl.selector,
          brakePedal: input?.rawBrake ?? 0,
          throttlePedal: input?.rawThrottle ?? 0,
          dtSec: dt,
        });
        if (cmd) {
          // Mark the steps assist-driven so the driveline subscription does
          // not count them as manual (which would self-suppress for 2 s) and
          // so the mapper knows this flip was an ARMED press (LAW 2's scope).
          assistShiftingRef.current = true;
          try {
            const step = cmd === "shiftToR" ? () => dl.gearDown() : () => dl.gearUp();
            if (step()) step(); // second gate step only if the first engaged
          } finally {
            assistShiftingRef.current = false;
          }
        }
      }
    }

    // LAW 2's VOICE (engine/reverseStuck.ts). The guard above is only half of
    // the founder's „it turns to R (reverse) but the car does not move did it
    // break or ?": the other half is that nothing told him. This reads the
    // mapper's own `isDisowned` — no second opinion about the pedals, no
    // reimplementation of the rule — and fires only once the state has lasted
    // long enough to be confusion (REVERSE_STUCK_HINT_S) rather than the
    // ordinary held-brake shift a hand-worked reverse begins with.
    //
    // Stepped OUTSIDE the assist's own gates on purpose: the flip that disowns
    // a channel is reachable from [ / ], the touch gear sheet and the cockpit
    // lever with the assist suppressed (REVERSE_ASSIST_SUPPRESS_S) or with no
    // assist involved at all, and a student stuck behind it there is stuck in
    // exactly the same way. The narrower gates it does NOT need are already
    // inside `input.reversePedalRemap` — exam lessons and the manual box never
    // swap the pedals, so no channel is ever disowned on them. Since 2026-08-11
    // an ASSIST flip is not disowned either, so this stays silent there by the
    // same mechanism rather than by a second gate: nothing was refused, so
    // nothing is explained. It is reset while the drive is locked: a held brake
    // during the pre-drive procedure IS a step, and the input gate zeroes the
    // pedals there anyway.
    if (driveLocked || !cabin || input === null) {
      reverseStuck.reset();
    } else {
      const stuck = reverseStuck.update({
        disowned: input.reversePedalDisowned,
        selector: cabin.driveline.selector,
        speedKmh: sample.speedKmh,
        dtSec: dt,
      });
      if (stuck !== null) onReversePedalStuck?.(stuck);
    }

    // …AND THE SILENCE ONE LAYER UP (engine/stuckStart.ts). Nothing has
    // refused the pedal here — the CAR cannot move: engine off, selector in
    // P or N, parking brake on. `LessonPlayShell.handleBlockedDriveAttempt`
    // has said exactly this since QW10, but only through `driveLocked`, i.e.
    // only in the pre-drive phase — and every compiled scenario rung sets
    // `preDrive: false` while 130 of them (`{ level: 4, vehicleStart: "cold" }`)
    // plus 31 whole templates hand over a cold car. Measured on the drive rig:
    // ten seconds of held throttle on `sc-junction-stop@L4` = 0.00 km/h, no
    // toast, no event. Same gates as its neighbour above: never while the
    // drive is locked (QW10 owns that), and the functional throttle it reads
    // is already zero on a LAW-2-disowned channel, so the two never speak over
    // each other.
    if (driveLocked || !cabin || input === null) {
      stuckStart.reset();
    } else {
      const blocked = stuckStart.update({
        throttlePedal: input.rawThrottle,
        // …and the OTHER pedal, which nothing in this engine listened to
        // until 2026-08-11. On the manual tier („Напреднал") ↓/S is the brake,
        // not the reverse accelerator — `shouldRemapReversePedals` returns
        // false there by design — so a student who holds ↓ in the neutral the
        // tier switch itself put him in was answered by nothing at all
        // (measured: 12.5 s, 0.00 km/h, zero toasts). The watch reads it only
        // in P/N with the engine running and only as an ARMED press, so a held
        // brake in D/M/R — the Б2 line, a red light, a give-way wait — is
        // still not read at all. See the three gates in engine/stuckStart.ts.
        brakePedal: input.rawBrake,
        speedKmh: sample.speedKmh,
        driveline: cabin.driveline.physicsInput,
        stalled: cabin.driveline.stalled,
        dtSec: dt,
      });
      if (blocked !== null) onStuckStart?.(blocked);
    }

    runtime.update(dt);
    traffic.update(dt, {
      signalPhase: (id) => runtime.signalPhase(id),
      playerPos: { x: sample.position.x, y: sample.position.y },
      playerSpeedKmh: sample.speedKmh,
      playerHeadingDeg: sample.headingDeg,
    });
    const leadGap = traffic.leadGapMeters(
      sample.position.x,
      sample.position.y,
      sample.headingDeg,
    );
    // A6 audio pass: sticky scene state for the audio layer (rain patter +
    // NPC proximity hum) — consumed by VehicleRig's per-frame audio update.
    // Siren channel (VU-09): nearest ACTIVE (moving) emergency actor off the
    // published traffic state — render-only scan, Infinity = no siren. A
    // guard-stalled actor (speed 0) fades out; honest limit for now.
    let sirenM = Infinity;
    const tvs = traffic.vehicles;
    for (let i = 0; i < tvs.length; i++) {
      const tv = tvs[i];
      if (tv.profile !== "emergency" || tv.speedMps < 0.5) continue;
      const d = Math.hypot(tv.x - sample.position.x, tv.y - sample.position.y);
      if (d < sirenM) sirenM = d;
    }
    audioRef.current?.setEnvironment({ rain, nearestNpcM: leadGap, sirenM });
    // Weather/time read off the SAME object the dashboard publishes (see the
    // `conditions` memo). That is the point of the memo: the grader and the
    // display cannot disagree about whether it is snowing, which is the one
    // thing they have already disagreed about twice (O28, O35).
    // THE PERSON IN THE PATH, on the same frame the law is applied to.
    // `leadGap` above answers „is a CAR standing on top of me"; this answers the
    // same question for the road user чл. 5, ал. 2 puts first, and the rule
    // engine's В27 block has been waiting for it since 2026-08-23 with the
    // acquittal wired and nothing writing the field. Measured in the module
    // (`orchestrator/contact.ts`), off the director's own cast and the same
    // traffic port `handleCollision` names bodies through — one question, one
    // answer. A lesson with no director, or with no staged people, yields the
    // empty cast and therefore Infinity — which is what every caller that
    // cannot answer says, and leaves its tick byte-identical to before.
    const vruAhead = vruAheadMeters(
      directorContactCast(director),
      traffic,
      sample.position.x,
      sample.position.y,
      sample.headingDeg,
    );
    const tick = runtime.sample(
      sample,
      tRef.current,
      conditions.isNight,
      conditions.rain,
      leadGap,
      conditions.fog,
      conditions.snow,
      vruAhead,
    );

    // A8: the scenario director steps AFTER traffic.update + runtime.sample —
    // it watches the player, commands staged actors (effective next frame)
    // and appends its outcome events into the SAME tick the rule engine
    // grades. The hazard flag drives TrafficLayer's L5 ball animation.
    if (director) {
      const staged = director.step({
        tSec: tRef.current,
        dtSec: dt,
        x: sample.position.x,
        y: sample.position.y,
        speedKmh: sample.speedKmh,
        headingDeg: sample.headingDeg,
        brakePedal: inputRef.current?.rawBrake ?? 0,
        tickEvents: tick.events,
      });
      for (const e of staged.events) tick.events.push(e);
      hazardActiveRef.current = director.hazardActive;
      // N11 (VP-06): the cockpit-lamp channel — the cluster reads the ref per
      // frame; the HUD cue + the attempt trace react on EDGES only. The
      // rising-edge annotation marks the stimulus moment for the ghost story
      // of the student's own attempt (the recorder never renders).
      const lit = director.telltaleLit;
      if (lit !== telltaleLitRef.current) {
        telltaleLitRef.current = lit;
        onTelltale?.(lit);
        if (lit) {
          recorder?.addEvent(
            "annotation",
            tRef.current,
            "Светна ЧЕРВЕНА контролна лампа — температура на двигателя. Спри спокойно вдясно.",
          );
        }
      }
      const cautionLit = director.telltaleCautionLit;
      if (cautionLit !== telltaleCautionLitRef.current) {
        telltaleCautionLitRef.current = cautionLit;
        onTelltaleCaution?.(cautionLit);
        if (cautionLit) {
          recorder?.addEvent(
            "annotation",
            tRef.current,
            "Светна ЖЪЛТА контролна лампа — двигател. Жълто значи „внимателно, до сервиз“ — продължи плавно.",
          );
        }
      }
      if (onStagedOutcome) {
        for (const o of staged.outcomes) onStagedOutcome(o);
      }
    }
    onTick(tick);

    // S0-View attempt recording (doc 76 §5): the ring recorder decimates the
    // frame feed to ~20 Hz itself — push() is zero-alloc, so this stays free
    // when the prop is absent and cheap when it isn't.
    if (recorder) {
      recorder.push({
        tSec: tRef.current,
        x: sample.position.x,
        y: sample.position.y,
        headingDeg: sample.headingDeg,
        steerRad: simRef.current?.steerRad ?? 0,
        speedKmh: sample.speedKmh,
        gear: sample.gear,
        indicator: sample.indicator,
        brakeOn: (inputRef.current?.rawBrake ?? 0) > 0.15,
        throttleOn: (inputRef.current?.rawThrottle ?? 0) > 0.15,
      });
      // Sparse events: glances arrive as one-frame sample values; indicator
      // edges become signal-on/off.
      if (sample.mirrorGlance) {
        recorder.addEvent(`glance-${sample.mirrorGlance}`, tRef.current);
      }
      if (sample.indicator !== recIndicatorRef.current) {
        recIndicatorRef.current = sample.indicator;
        if (sample.indicator === "off") recorder.addEvent("signal-off", tRef.current);
        else recorder.addEvent("signal-on", tRef.current, undefined, sample.indicator);
      }
    }

    const nowMs = tRef.current * 1000;
    if (nowMs - lastMinimapRef.current >= MINIMAP_MS) {
      lastMinimapRef.current = nowMs;
      onMinimap({
        polylines: minimapPolylines,
        transform: {
          centerX: sample.position.x,
          centerY: sample.position.y,
          pxPerMeter: MINIMAP_PX_PER_M,
        },
      });
      // A1: driveline telltales share the low-frequency cadence — the shell
      // stores the snapshot in a ref and folds it into its own HUD poll.
      const cabin = cabinRef.current;
      if (cabin) onDriveline?.(cabin.driveline.snapshot());
    }
  });

  return null;
}

/**
 * One row of the key legend. `essential` marks the short default set — the
 * keys a student needs to get the car moving and look around; everything else
 * is reference material behind „Всички клавиши".
 */
export interface ControlsHelpRow {
  /**
   * THE ROW'S IDENTITY, AND IT IS NOT THE KEY CAP — 2026-08-18.
   *
   * The list used to be keyed `key={row.keys}` and that is a duplicate on every
   * exam rung. `reverseAssistEnabled` is `lesson.examMode !== true`, and when it
   * is false the reverse row stops being «S / ↓» and becomes a SECOND «[ ]» row
   * beside the gear row — two children of one list with the identical React key,
   * on every exam rung in the catalogue.
   *
   * MEASURED, not quoted — the neighbouring comment's „158 of the 169" is from
   * an older catalogue. Walking `SCENARIO_TEMPLATES` × levels 1–5 through
   * `scenarioLessonById` today (2026-08-18):
   *
   *   808 compiled rungs · 162 carry `examMode` · all 162 of them are level 4
   *
   * so the collision is present on one rung in five, and on EVERY rung a
   * student sits as an exam.
   *
   * What that costs is not the console warning. React's keyed diff builds a map
   * from key → old fiber, so the second «[ ]» overwrites the first: the next
   * time this list re-renders with a changed row set — pressing K (the
   * reversing-POV row prints its LIVE state), or «Всички клавиши», which is the
   * only view where both «[ ]» rows are on screen at once — the reconciler can
   * match the gear row's element to the exam row's fiber and print the wrong
   * sentence against «[ ]». A legend that lies about which key does what is the
   * one failure this panel cannot have; its own header says so.
   *
   * So identity is a slot name, chosen so the two spellings of the reverse row
   * are ONE row that says different things on an exam and off it — which is
   * what they are — while the gear row keeps its own.
   */
  id: string;
  keys: string;
  what: string;
  essential?: boolean;
}

/**
 * The legend's rows, as data.
 *
 * Pulled out of the component so the table can be driven exhaustively without a
 * DOM (`__tests__/controlsHelpRows.test.tsx` sweeps all eight flag combinations):
 * the two flags below each rewrite rows rather than merely hiding them, and the
 * sweep's own frames are about rows that were WRONG rather than rows that were
 * missing — an orphaned «D» in ghost type over a building, and a gesture row
 * printed on a rung where the gesture does nothing.
 *
 * ── AND A THIRD INPUT, BECAUSE THE LEGEND DESCRIBED A CAR THE STUDENT WAS NOT
 *    DRIVING — sc-vp-stall:95754650 (CRITICAL), re-judged on the attested w18
 *    re-drive (`w18/frames/sc-vp-stall__pc-right/01-arrival.png`, 63507e2).
 *
 *    That lesson ships `openingTier: "advanced"` (templates-cockpit.ts) and
 *    says so in its own objective: «колата тук е с ръчни скорости и
 *    съединител». `transmissionModeFor("advanced")` is `"manual"`, and on the
 *    manual box the gate is P — R — N — M1…M5 (driveline.ts): THERE IS NO D.
 *    The panel on that frame nevertheless printed «скорости: към P / към D»,
 *    i.e. it named a selector position the car does not have, on the one
 *    lesson in the catalogue whose entire subject is the gearbox.
 *
 *    THREE ROWS WERE WRONG THERE, NOT ONE, and they are wrong for the same
 *    reason — every flag this function took was about the LESSON and none was
 *    about the CAR:
 *
 *      gears    «към P / към D» — no D on this box, and `trySelect` refuses
 *               R and M with the clutch up (`rejectShift("clutch")`), which
 *               is the refusal the student actually meets when he presses ].
 *      reverse  «на място: пусни и натисни пак → задна / напред» describes
 *               `ReverseAssist`, and the scene gates that machine on
 *               `dl.transmission === "automatic"` (see the assist block in
 *               RuntimeDriver's frame loop). On „Напреднал" the gesture is
 *               not merely different — it is not running at all. This is the
 *               row's own exam clause reproduced one tier over: „a product
 *               that prints a control it has disabled is refusing an input in
 *               silence with extra steps." The exam spelling was false here
 *               too, for a third reason: it walks the student «D → N → R».
 *      clutch   was reference material behind «Всички клавиши». On a manual
 *               it is not advanced trivia, it is the only way the car moves —
 *               so on that box it joins the short list the sheet opens with.
 *
 *    The flag DEFAULTS TO `"automatic"` so the eight-combination sweep next
 *    door keeps describing the box it was written against.
 */
export function controlsHelpRows({
  topdownAllowed,
  reverseAssistEnabled,
  reverseViewOn,
  transmission = "automatic",
}: {
  topdownAllowed: boolean;
  reverseAssistEnabled: boolean;
  /** Live state of the K setting — the row prints it, so the legend never
   *  describes a view the student will not get. */
  reverseViewOn: boolean;
  /**
   * The gearbox the tier picker has actually handed over —
   * `transmissionModeFor(difficulty)`, the same call `VehicleRig` syncs the
   * driveline with, so the legend cannot disagree with the car. Optional and
   * `"automatic"` by default: three of the four tiers are automatics, and the
   * default keeps every existing caller (and every test written before the
   * manual box was described here) on the sentences they were written for.
   */
  transmission?: TransmissionMode;
}): ControlsHelpRow[] {
  const manual = transmission === "manual";
  return [
    // FIRST ROW, AND THE FIRST THING READ IN THIS COLUMN — „we read on left".
    // The founder's sentence about this panel is „We should re-work the whole
    // engine with the buttons, BECAUSE WE READ ON LEFT": the top-left corner is
    // where the eye lands, and what stood there was twenty-two keyboard rows,
    // with the mouse buried at row fifteen. The keys are all still here and all
    // still real — but the sheet now OPENS with the fact that the whole cabin
    // is clickable, and the pill above says this list is the advanced path.
    {
      id: "click",
      keys: "Клик",
      what: "всичко в кабината се прави с мишката",
      essential: true,
    },
    // …AND THE SAME U+00A0 AS THE GEAR ROW BELOW, for the same reason and off
    // the same two frames: at 11 px in a ~152 px column this row breaks as
    // «кормуване (или» / «стрелки)», leaving the closing half of a parenthesis
    // alone on a line. The sans face this column now uses (see the <p> at the
    // row's render) buys most of it back; binding the parenthetical is what
    // makes the row unable to break there at any width.
    { id: "steer", keys: "W A S D", what: "кормуване (или\u00a0стрелки)", essential: true },
    { id: "ignition", keys: "I", what: "двигател: старт / стоп", essential: true },
    // NON-BREAKING SPACES BEFORE THE TWO GEAR LETTERS. This column is
    // `w-[min(15rem,45%)]` minus a 3.75 rem key cap, and the sweep photographed
    // what that leaves: on sc-follow-distance/pc-right the row wrapped as
    // «скорости: към P / към» with an orphaned «D» alone on the next line, i.e.
    // the one character that carries the meaning separated from the word that
    // introduces it, in ghost type over a building. U+00A0 binds each letter to
    // its «към»; the row still wraps, it just cannot wrap THERE. Written as the
    // escape and not the literal glyph, so a reader of this file can SEE it.
    // …AND ON THE MANUAL BOX BOTH HALVES OF THAT SENTENCE ARE FALSE. The gate
    // there is P — R — N — M1…M5, so «към D» names a position the car does
    // not have; and `trySelect` refuses R and M with the engine on and the
    // clutch up, so the press a student makes after reading this row produces
    // a `shiftRejected: "clutch"` and nothing else. The ladder is printed
    // whole — it is the answer to „where am I in the gate", which
    // «към P / към D» never was — and the refusal is named BEFORE he meets
    // it, because a legend that waits to be disproved by the car is exactly
    // the THEO-4 failure this panel exists to avoid. The U+00A0 discipline
    // carries over: «със» is bound to «съединител», the word that carries
    // the meaning, so this row cannot orphan its tail the way «D» once did.
    manual
      ? {
          id: "gears",
          keys: "[ ]",
          what: "скорости: P–R–N–1…5; в предавка само със\u00a0съединител",
          essential: true,
        }
      : {
          id: "gears",
          keys: "[ ]",
          what: "скорости: към\u00a0P / към\u00a0D",
          essential: true,
        },
    // NOT „задръж" (hold). Holding the brake is how you stop; it is not how
    // you ask for reverse — see the two laws in engine/reverseAssist.ts. On an
    // exam rung neither the assist nor the pedal swap exists, so the row says
    // what is actually true there: reverse is the lever, and the pedals keep
    // their real meanings. ONE slot, two sentences — see `id` on the interface
    // for why the exam spelling must not borrow the gear row's identity.
    // …AND THE MANUAL BOX ANSWERS BEFORE EITHER OF THEM, because on that box
    // the machine BOTH sentences describe is switched off. The scene gates the
    // assist on `dl.transmission === "automatic"` (the assist block in
    // RuntimeDriver's frame loop, three screens down), so on „Напреднал“ the
    // gesture row is not a different truth — it is a control the product has
    // disabled, printed as if it worked, which is the row's own exam clause
    // reproduced one tier over. The exam spelling is false here for a third
    // reason: it walks the student «D → N → R» down a gate with no D in it.
    // What IS true on a manual is the real procedure — clutch, then one step
    // down the gate — and it is the same procedure the exam demands, so one
    // sentence serves both rungs.
    manual
      ? {
          id: "reverse",
          keys: "Z + [",
          what: "заден ход: задръж съединителя и избери\u00a0R",
        }
      : reverseAssistEnabled
        ? {
            id: "reverse",
            keys: "S / ↓",
            what: "на място: пусни и натисни пак → задна / напред",
          }
        : {
            id: "reverse",
            keys: "[ ]",
            // …and the SEQUENCE is one token, bound the same way. The general
            // form of the gear row rule found this the moment it was written:
            // «R)» alone on a line, on every exam rung.
            what: "на изпит заден ход се избира само с лоста (D\u00a0→\u00a0N\u00a0→\u00a0R)",
          },
    { id: "handbrake", keys: "Space", what: "ръчна спирачка", essential: true },
    // ON THE AUTOMATIC TIERS THIS IS REFERENCE MATERIAL and it says so — the
    // key exists, it does nothing until you switch tier. ON THE MANUAL BOX IT
    // IS THE CAR: `hasDriveTraction` and `trySelect` both consult it, and
    // sc-vp-stall's whole drill is the bite point. A student on that lesson
    // was being shown a five-row sheet with no clutch on it — the control the
    // objective names in its first sentence, filed behind «Всички клавиши».
    manual
      ? {
          id: "clutch",
          keys: "Z",
          what: "съединител — задръж при потегляне и\u00a0смяна",
          essential: true,
        }
      : { id: "clutch", keys: "Z", what: "съединител — задръж („Напреднал“)" },
    { id: "belt", keys: "B", what: "предпазен колан", essential: true },
    { id: "indicators", keys: ", .", what: "мигач ляво / дясно", essential: true },
    { id: "lights", keys: "L", what: "светлини" },
    { id: "fog", keys: "V", what: "фарове за мъгла" },
    { id: "hazards", keys: "J", what: "аварийни светлини" },
    { id: "wipers", keys: "T", what: "чистачки" },
    { id: "horn", keys: "H", what: "клаксон — задръж" },
    {
      id: "mirrors",
      keys: "Q E F",
      what: "огледала — задръж (ляво / дясно / назад)",
      essential: true,
    },
    // THE BLIND SPOT IS ITS OWN ROW, not a fourth letter on the mirrors' row,
    // and the separation is the teaching: the whole point of the check is that
    // no mirror shows it. Marked `essential` because it is a GRADED act —
    // MOVE_OFF_WITHOUT_OBSERVATION (основна) wants it beside the mirror before
    // the wheels turn — and a graded act filed behind «Всички клавиши» is the
    // defect the clutch row one screen up already records.
    {
      id: "blind-spot",
      keys: "O",
      what: "поглед през ляво рамо — мъртвата зона (задръж)",
      essential: true,
    },
    {
      id: "view",
      keys: "C",
      what: topdownAllowed ? "изглед: кокпит / отвън / отгоре" : "изглед: кокпит / отвън",
      essential: true,
    },
    {
      id: "reverse-view",
      keys: "K",
      what: `автоматичен поглед назад при заден ход: ${reverseViewOn ? "вкл." : "изкл."}`,
    },
    // Founder 2026-07-28: the minimap is off by default and comes back on
    // demand — the key has to be discoverable or the map is simply gone.
    { id: "minimap", keys: "P", what: "мини карта (вкл./изкл.)", essential: true },
    ...(topdownAllowed
      ? [
          {
            id: "topdown-zoom",
            keys: "G",
            what: "мащаб отгоре: 20 / 40 / 80 м (влиза в изглед отгоре)",
          },
          { id: "topdown-north", keys: "N", what: "отгоре: север горе / посока горе" },
        ]
      : []),
    { id: "fullscreen", keys: "X", what: "цял екран" },
    { id: "reset-pause", keys: "R  ·  Esc", what: "рестарт · пауза", essential: true },
  ];
}

/**
 * Bottom inset the legend must never cross: the glance-button cluster
 * (GlanceEdgePings) is pinned at `bottom-3` and stands 50 px tall, so the
 * legend's scroll box stops 4.5 rem above the scene floor. Anything shorter
 * and the two overlap — which is exactly what happened before: in the shell
 * the scene box is `aspect-video`, so at a 1100 px column it is only ~619 px
 * tall and the 20-row sheet ran straight through the Л / З / Д chips and off
 * the bottom edge.
 */
const CONTROLS_HELP_BOTTOM_INSET = "4.5rem";

/**
 * Collapsible key legend, top-left of the canvas.
 *
 * Layout law (do not regress): the root is a bounded flex column pinned
 * top-3 → bottom-[4.5rem], and the row list is a `min-h-0 overflow-y-auto`
 * flex child. The default flex-shrink then clamps the list to whatever height
 * the scene box actually has, at EVERY viewport — a short scene scrolls the
 * list instead of spilling it over the HUD below. The root is
 * pointer-events-none so the reserved column never swallows canvas drags.
 *
 * Default state (considered, founder-facing): open, but showing the ~10
 * ESSENTIAL rows only. Collapsing it outright would hide the keyboard from a
 * first-time student who has no other way to discover the controls; showing
 * all 20 rows ate ~22 % of the windscreen. The full sheet is one click away
 * and stays open for the rest of the session. Touch-only devices still start
 * fully collapsed — the touch overlay is the primary input there.
 *
 * …AND IT NOW HAS AN END AS WELL AS A BEGINNING (2026-08-18). The paragraph
 * above is about how the lesson OPENS and it is unchanged; what was missing is
 * that nothing ever closed the sheet, so the sweep photographed it open — as
 * ghost type on the buildings, and capped by the deck rule to four of eleven
 * rows — at 12 s and 11 км/ч of a graded drive. It collapses to its pill the
 * first time the car is genuinely moving, once per lesson, and a student who
 * re-opens it mid-drive keeps it open (`controlsLegendLifetime.ts` — the three
 * frames, the floor, and why the latch is one-way).
 *
 * EXPORTED FOR ITS TEST, and that is the whole reason. The two guards this
 * panel had were `expect(SCENE).toContain(…)` over this file's own source —
 * which is the failure mode this repo has been bitten by before, because a
 * string that is present proves nothing about a component that renders. It is
 * a leaf with no canvas, no physics and no world, so a server render is enough
 * to assert what the sweep actually photographed
 * (`__tests__/controlsHelpRows.test.tsx`).
 */
export function ControlsHelp({
  defaultOpen = true,
  topdownAllowed = true,
  reverseAssistEnabled = true,
  transmission = "automatic",
  sampleRef,
}: {
  defaultOpen?: boolean;
  /** Only advertise the top-down view + its G/N controls when it's reachable
   *  (curriculum lessons + scenario L1; exam rungs lock it out). */
  topdownAllowed?: boolean;
  /**
   * False on examMode lessons, where `ReverseAssist` and the rule-b pedal swap
   * are both switched off for the whole session (LessonScene:
   * `reverseAssistEnabled = lesson.examMode !== true`).
   *
   * The legend has to know, because the S / ↓ row was written for the assist
   * and is FALSE without it — twice over: „пусни и натисни пак" selects
   * nothing on an exam, and once R is selected by hand the pedals do NOT swap
   * there, so ↓ is the brake and ↑ is the reverse accelerator, exactly as in a
   * real automatic. Driven on `sc-junction-stop@L4` (2026-08-11): the row is on
   * screen, the gesture does nothing, and nothing says why. A product that
   * prints a control it has disabled is refusing an input in silence with extra
   * steps — the same THEO-4 failure as the two hints in LessonPlayShell, and
   * 162 of the 808 compiled rungs are exam rungs — every one of them a level-4
   * rung, re-measured 2026-08-18 (the arithmetic is on `ControlsHelpRow.id`,
   * which needed the same population).
   */
  reverseAssistEnabled?: boolean;
  /**
   * WHICH GEARBOX THE TIER PICKER HAS HANDED OVER — sc-vp-stall:95754650.
   *
   * `transmissionModeFor(difficulty)`, threaded from the scene so the sheet
   * cannot describe a car the student is not in. It rewrites three rows rather
   * than hiding any (`controlsHelpRows` carries the reasoning row by row), and
   * it defaults to `"automatic"` because three of the four tiers are — and
   * because a default of anything else would silently re-word the panel for
   * every caller that does not know about the box yet.
   */
  transmission?: TransmissionMode;
  /**
   * The per-frame vehicle sample the scene already writes — read for ONE
   * number, `speedKmh`, and only while the sheet is open and the one-time
   * collapse has not fired yet. Optional so the component stays renderable on
   * its own (the storybook-less way this file's sub-components are exercised);
   * absent, the sheet keeps the pre-2026-08-18 behaviour of never closing
   * itself, which is the failure that costs a panel rather than a lesson.
   */
  sampleRef?: React.RefObject<VehicleSample>;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);
  /**
   * THE ONE-WAY LATCH, and it is the half of this that is easy to get wrong.
   *
   * The collapse below is an EVENT ("the car started moving"), not a condition
   * ("the car is moving"). Written as a condition it would re-fire every 250 ms,
   * so a student who reached up at 40 км/ч to check which key is the horn would
   * watch the sheet shut again a quarter of a second later and conclude the pill
   * is broken. An auto-hide that will not let you look is the same crime as a
   * panel that will not go away, pointing the other way — so once this is set
   * the poll never runs again for this lesson and the pill is the only authority
   * left. It is a ref rather than state: latching it must not cost a render.
   */
  const autoCollapsedRef = useRef(false);
  /**
   * …and the poll that trips it. Guarded on `open` so it does not exist on a
   * touch-only device or a pre-drive lesson (both start collapsed), and on the
   * latch so it does not come back when the student re-opens the sheet.
   *
   * Deliberately NOT routed through some shared "is driving" state: this is a
   * piece of furniture folding itself away, and it must not be able to add a
   * render — or a line in the frame loop that grades — for anything else.
   */
  useEffect(() => {
    if (!open || !sampleRef || autoCollapsedRef.current) return;
    const id = window.setInterval(() => {
      if (!controlsLegendStandsDown(sampleRef.current.speedKmh)) return;
      autoCollapsedRef.current = true;
      setOpen(false);
    }, CONTROLS_LEGEND_POLL_MS);
    return () => window.clearInterval(id);
  }, [open, sampleRef]);
  // The reversing-POV setting is persisted and toggled by K inside the canvas
  // (CameraRig owns the key, with G/N) — the row shows its live state so the
  // legend never lies about which way the view will turn.
  const reverseViewOn = useReverseViewEnabled();
  const rows = controlsHelpRows({
    topdownAllowed,
    reverseAssistEnabled,
    reverseViewOn,
    transmission,
  });
  const essentials = rows.filter((r) => r.essential);
  const visible = showAll ? rows : essentials;
  const hiddenCount = rows.length - essentials.length;
  return (
    <div
      data-hud="controls-help"
      className="pointer-events-none absolute left-3 top-3 z-10 flex w-[min(15rem,45%)] flex-col items-start"
      style={{
        bottom: CONTROLS_HELP_BOTTOM_INSET,
        // CONTROL-CLEARANCE CAP (founder 2026-07-30, „the light switch falls
        // under the panel"). The highest cockpit control that reaches into
        // this left column is the left door mirror, whose visible top edge
        // projects at 0.65 of the canvas; a top-left panel that ends above
        // HUD_LEFT_PANEL_MAX_HEIGHT_FRACTION can therefore never cover a
        // control the student is being told to click. The row list is a
        // `min-h-0 overflow-y-auto` child, so the cap scrolls it instead of
        // hiding rows. Derived, not eyeballed — scene/vitok/cabinLook.ts owns
        // the number and cabin-look.test.ts fails if a hotspot moves above it.
        maxHeight: `calc(${HUD_LEFT_PANEL_MAX_HEIGHT_FRACTION * 100}% - 0.75rem)`,
      }}
    >
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="pointer-events-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2.5 py-1 text-[11px] font-semibold text-muted backdrop-blur transition hover:text-foreground"
      >
        <span aria-hidden>⌨</span>
        {/* „за напреднали" is not decoration: this pill sits in the corner the
            founder reads first, and an unqualified „Клавиши" there is the
            screen telling a beginner that keys are how the car is operated.
            They are the alternative. The mouse is the taught path, and the
            cabin says so on the controls themselves (VitokCockpit). */}
        Клавиши · за напреднали {open ? "▾" : "▸"}
      </button>
      {open ? (
        // ⚠ `relative isolate` IS THE LOAD-BEARING TOKEN ON THIS SURFACE, and
        //   it was measured by deleting it. This <div> had NO `position` at
        //   all, so the shade's `inset: 0` resolved against the nearest
        //   positioned ancestor — `[data-hud="controls-help"]`, which is
        //   `absolute left-3 top-3 … bottom: CONTROLS_HELP_BOTTOM_INSET`, i.e.
        //   the FULL-HEIGHT LEFT RAIL. Deleted, the shade paints an 80 %-alpha
        //   band down the whole left side of the windscreen; run that way, the
        //   ink-exemption and legend-lifetime suites reported `24 passed` and
        //   nothing red. `isolate` is the second half: `position: relative`
        //   with `z-index: auto` does NOT open a stacking context, so a
        //   `z-index: -1` child would still search upwards for one and paint
        //   behind the stage. The geometry case in `unpanelInkExemption`
        //   asserts both tokens off the class STRING (not the comment).
        <div className="pointer-events-auto relative isolate mt-1 flex min-h-0 w-full flex-col rounded-xl border border-border bg-background/80 backdrop-blur">
          {/* ── THE GROUND THIS PANEL ASKS FOR AND NEVER GETS ─────────────────
              sweep w10, `sc-junction-blind/pc-right/01-arrival.png`, 1440×900,
              cropped at x240-1000 / y80-640 and looked at: the open key list is
              drawn straight onto the sky, the overhead power lines and the road
              — «всичко в кабината се прави с мишката», «кормуване (или
              стрелки)», «двигател: старт / стоп» all legible only where a dark
              building happens to be behind them.

              THE CLASS LIST ABOVE ALREADY ASKS FOR A PLATE — `bg-background/80
              backdrop-blur`, written here in good faith — AND THE STYLESHEET
              TAKES IT AWAY. `[data-hud="controls-help"]` is its own entry on
              `GHOST_SURFACES` („⌨ Клавиши — 7.8 % of the frame, measured"), and
              the UNPANEL sweep hands every child of a ghost that lacks
              `data-hud-ink` both `background-color: transparent !important` and
              `backdrop-filter: none !important`. So this panel has been asking
              for a ground and painting none since the sweep landed — the same
              „a diff that changes no pixel" the tier picker's fill produced,
              running in the other direction.

              The remedy is the register's own opt-out and not a cancellation
              rule: a shade child, `data-hud-ink`, the SAME published gradient
              the peek card and the touch hint use. The panel keeps its
              hairline and its radius; what comes back is ground under prose,
              which is the line `BriefingCard` drew for the whole product („a
              numbered briefing is prose, not an instrument").

              NO VERTICAL MASK HERE, AND THAT IS A DECISION. The touch hint two
              components up takes `peekScrimMaskCss` as well as the background,
              because it is a ghost with no border and a bare 80 %-alpha bottom
              edge across the windscreen is a plate edge by another name. This
              panel has `rounded-xl border border-border`: the hairline IS the
              edge, so there is nothing for a ramp to soften — and a 16 px ramp
              would run under the LAST ROW OF KEYS, prose on a partial ground,
              which `PEEK_SCRIM_FEATHER_PX` calls „the defect this shade exists
              to close, not a milder version of it".

              WHAT THIS DOES NOT CLOSE, said plainly because an adversarial
              pass raised it: `sc-junction-blind:d2587f64` has three limbs —
              expanded by default, no ground, up for the whole drive. The
              auto-collapse latch above closed the third; this closes the
              second; THE FIRST IS UNTOUCHED and lives at `defaultOpen = true`
              on this component's signature. The shade does not enlarge the
              obstruction — this <div> is a content-height flex item and the
              shade is `inset: 0` OF IT, so what is now opaque is exactly the
              box `bg-background/80` has been asking for since the panel was
              written — but a legible panel over the top-left of the windscreen
              is still a panel over the top-left of the windscreen, and that row
              stays open until the default is decided on a real frame. ──────*/}
          <div
            data-hud="controls-help-scrim"
            data-hud-ink=""
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              zIndex: -1,
              pointerEvents: "none",
              borderRadius: "inherit",
              backgroundImage: peekScrimBackgroundCss({
                // Mirrored: this panel is at the LEFT rail, so the long ramp
                // belongs on its RIGHT edge — the side that faces the road.
                // `peekScrimBackgroundCss` ramps `to left`, so the two numbers
                // swap rather than the function growing a direction argument.
                left: PEEK_SCRIM_FEATHER_PX.right,
                right: PEEK_SCRIM_FEATHER_PX.left,
              }),
            }}
          />
          {/* Only the ROW LIST scrolls; the expander below stays pinned, so
              the way back to the short list is never scrolled out of reach.
              `scrollbar-width: thin` matters: on a short scene box a classic
              17 px Windows scrollbar would eat 7 % of the 15 rem panel and
              reflow every row. */}
          <div className="flex min-h-0 flex-col gap-1 overflow-y-auto p-2.5 pb-1 [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin]">
            {visible.map((row) => (
              // `row.id`, not `row.keys` — the two «[ ]» rows on an exam rung
              // are a duplicate React key, and a duplicate key here is a legend
              // that can print the wrong sentence against a key cap. The
              // reasoning is on `ControlsHelpRow.id`.
              <div
                key={row.id}
                // …and the SAME identity on the node, because until now no
                // probe in this project could name a row of this panel. The
                // sweep's sc-follow-distance finding is „the gear row wrapped
                // as «скорости: към P / към» with an orphaned «D»" and it had
                // to be read off a screenshot by eye: the rows were eleven
                // anonymous divs. `data-row` is the same vocabulary
                // `data-hud` already is, and it is what lets
                // `__tests__/controlsHelpRows.test.tsx` assert on the RENDERED
                // list rather than on this file's source text.
                data-row={row.id}
                className="flex shrink-0 items-center gap-2 text-[11px]"
              >
                <kbd className="min-w-[3.75rem] shrink-0 rounded bg-surface px-1.5 py-0.5 text-center font-mono text-[10px] font-bold text-accent">
                  {row.keys}
                </kbd>
                {/* ── A `<p>`, AND THE ELEMENT IS THE WHOLE FIX — sc-ac-night-
                    lights:6cc71728, w10-2.
                    THE FRAME: `sc-ac-night-lights/pc-right/01-arrival.png` and
                    `sc-ed-d2-priority-run/pc-right/01-arrival.png`, side by
                    side with the ИНСТРУКЦИИ panel on the same picture. This
                    column is set in a FIXED-WIDTH face — «всичко в кабината се
                    / прави с мишката», every glyph the same advance — while
                    the numbered briefing 900 px to its right is the rounded
                    sans. Same screen, two reading faces, and the mono one is
                    the fifteen Bulgarian SENTENCES.
                    IT IS NOT AUTHORED HERE AND IT IS NOT A BUG IN THE REGISTER.
                    `[data-hud="controls-help"]` is on `GHOST_SURFACES`, and the
                    2026-08-03 register sets `font-family: var(--font-mono)` on
                    every ghost — the founder's own „low-contrast monospace text
                    anchored to the edge". That ruling stands. What it also
                    carries is the carve-out, and the carve-out's own sentence
                    is the bug report: „every instrument value in this HUD is a
                    span/div/kbd and every authored sentence is a <p>." This one
                    was a <span>, so a sentence was read as a value.
                    AND IT PAID TWICE. The register measured the cost of mono on
                    prose at „about 24 characters per line against about 35 in
                    the body face". This column is ~152 px wide, so the same
                    arithmetic turns three of the four essential rows into two
                    lines with an orphan on the second — «кормуване (или /
                    стрелки)» is on both frames, and it is the row's third
                    clause. One element, both clauses, no new CSS: the split
                    „falls out of the existing markup" exactly as written.
                    The key cap stays a <kbd> in mono, because a key cap IS an
                    instrument value and the register is right about it.
                    AND THE ROW IS NOT CLOSED BY THIS, which is the half a
                    repair report is likeliest to swallow. 6cc71728 has FOUR
                    clauses. Clause 2 (the orphaned gear letter «D») closed at
                    `ec1f56f`; clauses 1 and 3 are the two above. Clause 4 —
                    „the world's overhead power cables are drawn straight across
                    the panel text" — is untouched here and is still on the very
                    frame this block cites: four white catenary lines run
                    diagonally through «двигател: старт / стоп» and «скорости:
                    към P / към D». That is a world-geometry-versus-HUD
                    occlusion, the same class as `sc-turn-left-oncoming:2a784463`
                    and `sc-ov-keep-right:6751402d`. The row stays OPEN on it.
                    ⚠ AND THE ADDRESS THIS BLOCK GAVE FOR IT WAS WRONG — corrected
                      2026-08-30 by opening the file it named. `hud/overheadHint.ts`
                      has nothing to do with overhead WIRES: it is the CAMERA-AID
                      hint for lessons carrying an overhead (top-down) manoeuvre —
                      `lessonHasOverheadManeuver`, `cameraAidHintEligible`,
                      `CameraAidHint.tsx`. A lane sent there would have found no
                      cable and no projection, which is the wrong-address failure
                      this programme spends its rounds on. The wires are built in
                      `modules/sim/world/components/WorldProps.tsx` — the
                      `UTILITY_WIRE_SAG_M` parabolic-sag ribbon.
                      AND THE MECHANISM IS THE ALPHA, NOT THE Z-ORDER, measured on
                      the attested re-drive (`.audit-frames/w17/frames/
                      sc-ac-night-lights__pc-right/01-arrival.png`, LessonScene.tsx
                      byte-identical to HEAD): the wires read at roughly a fifth of
                      their free-sky contrast INSIDE this panel, i.e. they are
                      behind the shade and the shade is doing exactly what
                      `PEEK_SCRIM_ALPHA` = 0.8 promises. Closing the clause means
                      raising a ghost's ground above the published 0.8
                      (SimOverlay.tsx:883) — a ruling on the 2026-08-03 „no plate"
                      register, which is a founder's call and not a lane's. */}
                <p className="text-muted">{row.what}</p>
              </div>
            ))}
          </div>
          {/* Reversible on purpose: the full sheet has to scroll on a short
              scene box, and a student who opened it must be able to get the
              short list back without collapsing the whole legend. */}
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="shrink-0 self-start rounded px-2.5 pb-2 pt-1 text-[11px] font-semibold text-accent transition hover:text-foreground"
          >
            {showAll ? "Само основните ▴" : `Всички клавиши (+${hiddenCount}) ▾`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function GateCard({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface p-6">
      <div className="max-w-md text-center">
        <p className="text-4xl" aria-hidden>
          {icon}
        </p>
        <h2 className="mt-4 text-xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-muted">{body}</p>
        <Link href="/dashboard" className="btn-ghost mt-6">
          Обратно към началото
        </Link>
      </div>
    </div>
  );
}
