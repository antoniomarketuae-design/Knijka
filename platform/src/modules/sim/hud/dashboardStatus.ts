/**
 * Dashboard status — the per-frame channel between the scene and the DOM
 * StatusDashboard bar (the founder's „табло като на кола", 2026-07-17).
 *
 * Perf grammar: the SCENE mutates one shared DashboardStatus object per frame
 * (zero allocation, zero React state — the hazardActiveRef pattern); the bar
 * samples it on a low-Hz interval and re-renders only when `dashboardHash`
 * changes — the cluster-canvas 10 Hz redraw precedent (vitok/cluster.ts).
 * That is what makes the blinker arrows follow the REAL 600 ms blink clock
 * (CabinControls.blinkOn / hazardBlinkOn) instead of a free-running CSS
 * animation that drifts out of phase with the in-car cluster.
 */

// TYPE-ONLY, and deliberately: `telltaleWarnings.ts` imports `DashboardStatus`
// from here, so a value import would be a cycle. `import type` is erased, so
// the two files can name each other's shapes without one existing at runtime.
import type { TelltaleConditions } from "./telltaleWarnings";

export type DashboardHeadlights = "off" | "low" | "high";
export type DashboardIndicator = "off" | "left" | "right";

export interface DashboardStatus {
  /** Real lamp levels THIS frame — the cabin blink clock + hazard relay
   *  (the same truth the 3D cluster draws), not an approximation. */
  leftLampLit: boolean;
  rightLampLit: boolean;
  /** Stalk setting (aria/labels — the lamps above carry the visuals). */
  indicator: DashboardIndicator;
  hazardsOn: boolean;
  engineOn: boolean;
  stalled: boolean;
  /** Selector display label: "P" "R" "N" "D" or "M2" (DrivelineState). */
  gearLabel: string;
  parkingBrakeOn: boolean;
  seatbeltOn: boolean;
  headlights: DashboardHeadlights;
  fogLightsOn: boolean;
  wipersOn: boolean;
  speedKmh: number;
  /** Do the CONDITIONS require the headlights right now (night, or rain by
   *  day)? Written by the scene from the same weather/time flags the rule
   *  engine grades on. Consumed by telltaleWarnings.ts — the bar itself still
   *  only shows the lamp state. */
  headlightsRequired: boolean;
  /** …and the fog-lamp twin (чл. 74 — significantly reduced visibility). */
  fogLightsRequired: boolean;
  /**
   * THE FOUR FLAGS THEMSELVES, so the lights row stops being a single bit.
   *
   * `headlightsRequired` above is that bit, and it was written `isNight || rain`
   * — which could never see SNOW, because compile makes the three weathers
   * EXCLUSIVE (a snow lesson has rain === false and fog === false). So a lesson
   * whose instruction is «включи късите светлини» had no lights row on the
   * dashboard at all, and the same hole was found twice from two directions: in
   * the GRADER (O28, round 6, which had no snow lamp detector) and here in the
   * DISPLAY (O35, round 8). A channel with no single owner drifts on both sides.
   *
   * Carrying the conditions rather than the conclusion is what stops the third
   * drift: `telltaleWarnings.headlightDutyCode` derives the duty AND its
   * citation from these, off the same precedence `reduceTick` grades on.
   * Optional so no legacy or headless mount breaks — absent falls back to the
   * single bit, which is still wrong in snow and is why nothing may rely on it.
   *
   * WRITTEN ONLY BY `writeDashboardStatus` BELOW, where the parameter is
   * REQUIRED. It stayed optional here (a headless mount that never publishes
   * has to be representable) and that optionality is exactly what let the O35
   * revert type-check; moving the publication behind one required parameter is
   * what closes that, without breaking the fallback branch other files still
   * document.
   */
  conditions?: TelltaleConditions;
  /**
   * THE DIFFICULTY TIER'S SPEED CEILING (km/h), or null when the tier has none
   * („Напреднал"). 2026-08-11, the „silent refusal" sweep.
   *
   * `vehicle/difficulty.ts` has governed the throttle since the first tier
   * shipped and NOTHING has ever printed the number: on Начинаещ in a 50 km/h
   * city the car stops accelerating at 40 and the student is told nothing at
   * all. It rides this channel rather than a prop because the cap is a fact
   * about the same car this object already describes, it changes only when the
   * tier picker is clicked, and the bar that must print it already samples this
   * object — a prop would have had to cross the scene→shell boundary the
   * dashboard channel exists to avoid.
   *
   * Written by the SCENE (it owns the tier, the map's speed domain and the
   * lesson's declared required speed — the three inputs to `governorCapKmh`).
   */
  governorCapKmh: number | null;
  /** The tier's own Bulgarian name, so the readout can say WHO is holding the
   *  car back („Начинаещ"), not merely that something is. Empty when there is
   *  no cap to attribute. */
  governorTierBg: string;
}

/** Cold-car defaults (engine off, P, parking brake on — the A1 spawn policy):
 *  what the bar shows for the frame or two before the scene first writes. */
export function createDashboardStatus(): DashboardStatus {
  return {
    leftLampLit: false,
    rightLampLit: false,
    indicator: "off",
    hazardsOn: false,
    engineOn: false,
    stalled: false,
    gearLabel: "P",
    parkingBrakeOn: true,
    seatbeltOn: false,
    headlights: "off",
    fogLightsOn: false,
    wipersOn: false,
    speedKmh: 0,
    headlightsRequired: false,
    fogLightsRequired: false,
    // No cap until the scene says otherwise: a headless/legacy mount must not
    // invent a ceiling the physics is not applying.
    governorCapKmh: null,
    governorTierBg: "",
  };
}

/**
 * THE CABIN FACTS THIS CHANNEL READS — declared as a SHAPE, not as
 * `CabinControls`.
 *
 * Structural on purpose. `CabinControls` owns a key map, a 600 ms blink clock
 * and a Rapier-backed `DrivelineState`, so a test that wanted to check what
 * reaches the bar would first have to build a car. The publication is not about
 * a car; it is about which twelve cabin facts survive the trip to the DOM.
 * Naming them as a shape is what lets the SAME function run inside the scene's
 * `useFrame` and inside a unit test — `CabinControls` satisfies this
 * structurally, so the scene hands over its real cabin with no adapter and
 * `tsc` checks the match on every build.
 */
export interface DashboardCabinSource {
  /** The cabin's REAL blink phase, so the DOM arrows flash in step with the
   *  3D cluster instead of on a free-running CSS animation. */
  blinkOn: boolean;
  /** Hazards relay — lights BOTH arrows regardless of the stalk. */
  hazardBlinkOn: boolean;
  indicator: DashboardIndicator;
  seatbeltOn: boolean;
  headlights: DashboardHeadlights;
  driveline: {
    hazardsOn: boolean;
    engineOn: boolean;
    stalled: boolean;
    gearLabel: string;
    parkingBrakeOn: boolean;
    fogLightsOn: boolean;
    wipersOn: boolean;
  };
}

/**
 * THE WHOLE PER-FRAME PUBLICATION, IN ONE PLACE A TEST CAN CALL — 2026-08-19.
 *
 * This body used to be inlined in `LessonScene.tsx`'s `useFrame`, and that is
 * the entire reason O35 was able to happen and then able to survive its own
 * fix. Measured, not argued: with the scene's line reverted to
 * `dash.conditions = undefined` — O35 exactly, the state in which a snow lesson
 * shows the student no lights row at all — 1,982 tests across 118 files passed
 * and `tsc --noEmit` exited 0. Nothing in the repo could see it, because no
 * unit test loads a `.tsx` scene that needs an R3F canvas and a wasm physics
 * world to render, and the vitest environment here is `node` with no DOM.
 *
 * So the derivation moved to where it can be driven. The scene now hands over
 * the four facts it owns and CONCLUDES NOTHING — which is the same correction
 * `armedTelltaleWarnings` took: stop shipping a verdict between files and ship
 * the conditions. `conditions` is a REQUIRED positional parameter, so a future
 * revert that stops publishing them is not a silent regression but a compile
 * error (proved by mutation: dropping the argument at the call site fails
 * `tsc` with TS2554).
 *
 * Positional rather than one options object because the scene calls this at
 * 60 Hz and an object literal per call would reintroduce the per-frame
 * allocation this refactor removed — the module header's „zero allocation"
 * promise was already being broken by `dash.conditions = { … }` building a
 * fresh object every frame. The types are distinct enough that a transposed
 * argument is a type error, not a silent swap.
 *
 * Returns the same object it was given, so the caller's publish step reads as
 * one statement.
 */
export function writeDashboardStatus(
  dash: DashboardStatus,
  cabin: DashboardCabinSource,
  speedKmh: number,
  conditions: TelltaleConditions,
  governorCapKmh: number | null,
  governorTierBg: string,
): DashboardStatus {
  const dl = cabin.driveline;
  dash.leftLampLit = (cabin.blinkOn && cabin.indicator === "left") || cabin.hazardBlinkOn;
  dash.rightLampLit = (cabin.blinkOn && cabin.indicator === "right") || cabin.hazardBlinkOn;
  dash.indicator = cabin.indicator;
  dash.hazardsOn = dl.hazardsOn;
  dash.engineOn = dl.engineOn;
  dash.stalled = dl.stalled;
  dash.gearLabel = dl.gearLabel;
  dash.parkingBrakeOn = dl.parkingBrakeOn;
  dash.seatbeltOn = cabin.seatbeltOn;
  dash.headlights = cabin.headlights;
  dash.fogLightsOn = dl.fogLightsOn;
  dash.wipersOn = dl.wipersOn;
  dash.speedKmh = speedKmh;
  // THE CONDITIONS THEMSELVES, BY REFERENCE. Not copied: the caller's object is
  // lesson-static (the weather cannot change mid-drive) and nothing downstream
  // writes to it, so aliasing costs nothing and a per-frame `{ ...conditions }`
  // would cost one allocation every frame for no reader's benefit.
  // `armedTelltaleWarnings` defaults its second argument to this field, so this
  // one line is what makes the lights row see SNOW at all.
  dash.conditions = conditions;
  // THE LEGACY SINGLE BIT, LEFT WRONG ON PURPOSE — do not "fix" it here.
  // `isNight || rain` cannot see snow (compile makes the three weathers
  // exclusive, so a snow lesson has rain === false), and that is precisely what
  // O35 was. It is preserved byte-for-byte because `telltaleWarnings.ts` still
  // carries a fallback branch for callers that pass no conditions, and both
  // that branch and the tests pinning it as WRONG belong to another lane; the
  // branch is what has to be deleted, and deleting it is that lane's call.
  // Correcting the bit here instead would turn a deliberate red flag green and
  // leave the dead branch behind — a symptom fixed, the cause left standing.
  //
  // ⚠ MOVING THIS LINE OFF `LessonScene.tsx` TURNED A GATE RED, AND THE GATE IS
  //   RIGHT. `world/__tests__/referent-evidence-reachable.test.ts` requires every
  //   symbol in a referent's evidence channel to appear in one of its
  //   `renderedBy` components; `referents.ts lightsTelltale` lists
  //   `headlightsRequired` with LessonScene.tsx / TelltaleEdgePings.tsx /
  //   StatusDashboard.tsx. It only ever passed because THIS ASSIGNMENT lived in
  //   the scene — a WRITE being read as proof that a student can see the field.
  //   Nothing renders `headlightsRequired`; nothing ever did. Measured: with
  //   HEAD's scene the gate is 10/10 green, with the extraction it fails on this
  //   symbol alone. The repair is in `world/referents.ts` (not this lane): point
  //   `lightsTelltale` at what the student actually perceives — the row
  //   `armedTelltaleWarnings` raises and the lamp on the bar — and read
  //   `DashboardStatus.conditions`, not this bit. Do NOT re-introduce the
  //   identifier into a component to quiet the grep; that is the false
  //   certificate this whole audit exists to remove.
  dash.headlightsRequired = conditions.isNight || conditions.rain;
  dash.fogLightsRequired = conditions.fog;
  // The tier's ceiling and whose it is. Constant between tier clicks, so
  // writing it every frame costs one assignment and removes the only other
  // option — a second subscription — from a scene that already has enough.
  dash.governorCapKmh = governorCapKmh;
  dash.governorTierBg = governorTierBg;
  return dash;
}

/** Rounded non-negative display speed (dial grammar — reverse shows its
 *  magnitude, and near-zero drift never renders as „-0"). */
export function displaySpeedKmh(speedKmh: number): number {
  return Math.max(0, Math.round(Math.abs(speedKmh)));
}

/** Headlight state label (BG) — off stays a dash like the old telltale. */
export const HEADLIGHT_LABEL_BG: Record<DashboardHeadlights, string> = {
  off: "—",
  low: "Къси",
  high: "Дълги",
};

export type SpeedTone = "ok" | "over" | "danger";

/** Speed legality tone against the limit — the SpeedCard bands (doc 32):
 *  accent under the limit, amber over it, red beyond +10 km/h. Compares the
 *  ROUNDED display speed so the number and its color never disagree. */
export function speedTone(speedKmh: number, limitKmh: number): SpeedTone {
  const s = displaySpeedKmh(speedKmh);
  const limit = Math.max(1, Math.round(limitKmh));
  if (s > limit + 10) return "danger";
  if (s > limit) return "over";
  return "ok";
}

/** Cheap change detector for the low-Hz poll — every field the bar renders,
 *  with the speed pre-rounded so sub-km/h jitter never causes a re-render. */
export function dashboardHash(s: DashboardStatus): string {
  return (
    `${s.leftLampLit ? 1 : 0}${s.rightLampLit ? 1 : 0}${s.indicator}|` +
    `${s.hazardsOn ? 1 : 0}${s.engineOn ? 1 : 0}${s.stalled ? 1 : 0}|` +
    `${s.gearLabel}|${s.parkingBrakeOn ? 1 : 0}${s.seatbeltOn ? 1 : 0}|` +
    `${s.headlights}|${s.fogLightsOn ? 1 : 0}${s.wipersOn ? 1 : 0}|` +
    `${s.headlightsRequired ? 1 : 0}${s.fogLightsRequired ? 1 : 0}|` +
    // The cap and its tier: they change only on a tier click, but they are
    // RENDERED, and a field the bar draws and the hash ignores is a readout
    // that silently keeps the previous tier's number on screen.
    `${s.governorCapKmh ?? "-"}${s.governorTierBg}|` +
    `${displaySpeedKmh(s.speedKmh)}`
  );
}
