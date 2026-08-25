// Cabin controls — the vehicle "electrics" the physics core deliberately does
// not know about: indicators, headlights, seatbelt, mirror-glance requests and
// the night-preview toggle — PLUS ownership of the A1 driveline state machine
// (ignition, selector, clutch, parking brake, hazards, wipers, fog, horn):
// CabinControls binds the keys, DrivelineState (modules/sim/vehicle) holds the
// truth. The R3F visual layer reads this state per frame, the HUD polls it,
// and the VehicleSample builder serializes it for the rule engine
// (contracts.ts); VehicleRig feeds `driveline.physicsInput` into VehicleSim.
//
// Key handling mirrors the SimInput pattern (engine/input.ts) but lives here
// because these are cabin/vehicle-operation concerns, not driving-axis inputs.
//
// A2: the cockpit hotspots (vitok/hotspots.ts) call the SAME public methods
// the key handlers use — clicking the starter and pressing I are literally
// one code path, so the procedure observer cannot tell them apart (doc 69).

import { DrivelineState, type VehicleStartState } from "@/modules/sim/vehicle";
import { SCENARIO_TEMPLATES, scenarioById } from "@/modules/sim/lessons";

export type IndicatorSetting = "off" | "left" | "right";
export type HeadlightSetting = "off" | "low" | "high";
export type MirrorGlanceKind = "left" | "right" | "rear";

/** Indicator blink period (s): 600 ms full cycle => 300 ms on / 300 ms off. */
export const BLINK_PERIOD_S = 0.6;
/** Mirror-glance head-turn ease time (s): key-down ramps the view IN over
 *  this, key-up ramps it back OUT. Founder contract (2026-07-10): a glance
 *  HOLDS at full deflection while the key/pointer is held — it is no longer
 *  a momentary out-and-back flash. */
export const GLANCE_EASE_S = 0.18;
/** Tap fallback: sources without a release edge (the touch overlay's round
 *  buttons call glance() once) hold the view this long, then auto-release. */
export const GLANCE_TAP_HOLD_S = 0.9;
/** While a glance stays HELD, its graded freshness re-latches every this many
 *  seconds (founder R3 #13, doc 62 — QA-13: the founder pressed/held the look
 *  buttons at the second Б1 mouth and was still graded „no scan"). A driver
 *  whose head is ON the mirror is looking at it the whole hold, not only at
 *  the press instant — so the rule engine's lastGlanceAt must track the
 *  ongoing hold. Must sit well inside junctionScanLookbackSec (5 s) so a held
 *  look can never expire mid-hold; 1 s also keeps the attempt-trace glance
 *  events sparse. */
export const GLANCE_REFRESH_S = 1.0;

// ---------------------------------------------------------------------------
// SPAWN LAMP STATE (doc 86 L10, founder items 24 + 41).
//
// The cabin used to initialise `headlights: "off"` unconditionally, and
// `LessonScene` spawns most scenarios `vehicleStart: "ready"` without touching
// the lamps. Meanwhile `rules/engine.ts:857-866` arms HEADLIGHTS_OFF_AT_NIGHT
// (**основна**) and HEADLIGHTS_OFF_IN_RAIN with no config gate. Net effect:
// **34 of 154 scenarios compile a night / rain / fog condition and hand the
// student a car that is already in violation at t = 0** — the same shape as
// T2's centre-line spawn, and just as unteachable.
//
// The worst case is a lesson that ASSERTS the state it does not create:
// `sc-ac-night-overdrive` instruction 1 reads «Късите светлини са включени» —
// a false claim about the cockpit — and the student then collects an основна
// fault that at L4 can end the exam. A simulator that lies about its own
// switches is the exact failure mode the north-star test exists to catch.
//
// THE RULE. A car handed over "ready to drive" is handed over the way an
// instructor hands one over: correctly set up for the conditions outside. So
// when the compiled environment carries night, rain or fog AND the lesson
// spawns `ready`, the low beams start ON.
//
// THE EXCEPTION: a lesson whose SUBJECT is reaching for the switch. Pre-arming
// one of those deletes the drill — the same reasoning that keeps
// `preDriveMode: "assess"` on a cold start. Which lessons those are is DERIVED
// from their own authored briefing; see the block below for why it used to be
// a hand-typed list of three and what that cost.
// A second, structural exception is any lesson that actually runs the 13-step
// pre-drive procedure, because `headlights-on` is a coached/graded step there
// (procedures/steps.ts) and a pre-lit car would auto-satisfy it.
// ---------------------------------------------------------------------------

// THE EXCEPTION WAS A HAND-LIST, AND THAT WAS THE DEFECT (sweep 161,
// `sc-park-night/mobile-right/01-arrival.png`). The frame shows the car at
// 0 км/ч, before any input, with a full dipped-beam cone on the asphalt —
// while briefing step 1 orders «Включи късите светлини ПРЕДИ да тръгнеш» and
// the template authors a `mistake-no-lights` variant citing
// HEADLIGHTS_OFF_AT_NIGHT. The lesson's headline act was already done for the
// student: it could not be performed, could not be failed, and the authored
// mistake demo had nothing left to demonstrate.
//
// `sc-park-night` was not forgotten by accident — a set of three literal ids
// cannot track 154 templates' authored text, and it fails OPEN (hands the car
// over lit), so every miss is a green tick for an act nobody measured. Worse,
// the sweep test derived its expectation from the SAME constant: it excluded
// the set from its offender scan and then iterated the set. A tautology
// cannot report a missing member, which is why this sat still for seven
// rounds while the coverage counts looked clean.
//
// SO THE LIST IS GONE AND THE RULE IS DERIVED, from one invariant:
//
//   THE HAND-OVER STATE MUST NOT FALSIFY THE LESSON'S OWN LAMP SENTENCE.
//
// The catalogue already draws that line itself, in two authoring conventions
// this file now simply obeys:
//   - «Включи късите светлини …» — an ORDER. The car must start DARK, or the
//     order is pre-performed. 12 templates.
//   - «Провери, че късите светлини са включени» — a VERIFY. The car must
//     start LIT, or the sentence is a false claim about the cockpit — the
//     exact doc-86 L10 defect. 4 templates (sc-crossing-rain-sprint,
//     sc-pe-night-unlit, sc-ln-obstacle-meeting, sc-pe-parked-row-scan).
// A CONDITIONAL step («Ако е тъмно, включи…», «Вали ли, включи…») is the
// template hedging about a rung the level-ladder complication created; the
// lamp is not that lesson's subject, so those keep the doc-86 default. 42
// templates, and reading them as orders is what would re-open L10 at scale.
//
// The derivation is calibrated by agreeing with the humans where they looked:
// it reproduces all three hand-listed ids and then finds the nine they missed.
// `spawnHeadlights.test.ts` pins the whole partition by name, so authored text
// that drifts out of one class fails a test that says which template moved.

/** Lamp nouns. «фаров» also catches «фаровете за мъгла» (sc-ac-fog). */
const LAMP_NOUN_RE = /(светлин|фаров)/iu;
/** …but the HAZARDS are a different switch on a different stalk. Without this,
 *  `sc-accident-own-conduct`'s «Включи аварийни светлини, обезопаси мястото»
 *  reads as a headlight order. It has no night/rain/fog rung so the verdict
 *  never reached the cabin, which is precisely why it would have gone unseen. */
const HAZARD_LAMP_RE = /аварийн/iu;
/** The imperative to switch them on. NOTE: `\b` is ASCII-only and never
 *  matches a Cyrillic boundary — a first cut of this predicate used it,
 *  matched nothing, and read as a clean catalogue. Unicode boundaries only.
 *  «включи» is not a substring of «изключи» or «включени», but IS a prefix of
 *  «включително», which the trailing guard excludes. */
const SWITCH_ON_RE = /(?:^|[^\p{L}])(включи|запали)(?![\p{L}])/iu;
/** Hedges that make the imperative contingent on a complication's weather. */
const CONDITIONAL_RE =
  /(?:^|[^\p{L}])(ако|щом|вали\s+ли|по\s+тъмно|в\s+дъжд|вечер|или\s+вали|ниво\s+5|в\s+гараж)(?![\p{L}])/iu;

/** Clause split. The hedge binds to its own clause: «Влез в паркинга … Ако е
 *  тъмно, включи късите светлини: линиите …» is conditional, while
 *  «Включи къси светлини — в дъжд са задължителни» is a flat order whose
 *  second clause merely explains. Reading either whole step as one string
 *  misclassifies both. */
function lampClauses(text: string): string[] {
  return text
    .split(/[.!?:;]\s+|\s[—–-]\s/u)
    .filter((c) => LAMP_NOUN_RE.test(c) && !HAZARD_LAMP_RE.test(c));
}

/**
 * Does this lesson's own authored briefing ORDER the student to switch the
 * headlights on, unconditionally? Pure over the authored step texts — no
 * catalogue, no DOM — so it is unit-testable by mutation on the sentences
 * themselves.
 */
export function briefingOrdersLampsOn(instructionTexts: readonly string[]): boolean {
  for (const text of instructionTexts) {
    for (const clause of lampClauses(text)) {
      if (SWITCH_ON_RE.test(clause) && !CONDITIONAL_RE.test(clause)) return true;
    }
  }
  return false;
}

/** Memoised so the catalogue scan runs once per template, not per spawn. */
const drillCache = new Map<string, boolean>();

/**
 * True when switching the lamps ON is an act THIS lesson asks for — read off
 * the template's hand-authored `instructionsBg`, which is the only place the
 * duty is ever stated to the student. Unknown ids (curriculum lessons, tests)
 * are not drills: they keep the doc-86 default.
 */
export function isHeadlightDrillLesson(lessonId: string): boolean {
  const templateId = templateIdOfLessonId(lessonId);
  const hit = drillCache.get(templateId);
  if (hit !== undefined) return hit;
  // `parseScenarioLessonId` rejects a bare template id, so resolve by template.
  const spec = scenarioById(templateId);
  const drill =
    spec !== undefined && briefingOrdersLampsOn(spec.instructionsBg.map((s) => s.textBg));
  drillCache.set(templateId, drill);
  return drill;
}

/** Kept as an EXPORT because the sweep test enumerates it, but it is now
 *  derived from the authored text rather than typed by hand — the whole point
 *  of the change above. Lazily built: module-init order must not depend on the
 *  catalogue having finished loading. */
export function headlightDrillTemplateIds(): ReadonlySet<string> {
  return new Set(SCENARIO_TEMPLATES.filter((s) => isHeadlightDrillLesson(s.id)).map((s) => s.id));
}

/** The inputs the spawn-lamp decision reads. Deliberately primitives: this is
 *  a pure rule, unit-tested without a DOM or a compiled lesson. */
export interface SpawnHeadlightContext {
  /** LessonSpec.vehicleStart as resolved by the caller ("cold" | "ready"). */
  vehicleStart: VehicleStartState;
  /** Compiled environment: timeOfDay === "night". */
  night: boolean;
  /** Compiled environment: rain. */
  rain: boolean;
  /** Compiled environment: dense fog (ЗДвП чл. 74 — lamps regardless of hour). */
  fog: boolean;
  /** True when this lesson runs the 13-step pre-drive procedure. */
  preDrive: boolean;
  /** Compiled lesson id, e.g. `sc-ac-fog@L2`, or the raw template id. */
  lessonId: string;
  /** Override for the "is the switch itself the lesson?" question. Omitted in
   *  production — it is derived from `lessonId` via the authored briefing.
   *  Present so the pure rule can still be exercised without the catalogue. */
  lampDrill?: boolean;
}

/** The template id inside a compiled scenario lesson id (`sc-x@L2` → `sc-x`). */
export function templateIdOfLessonId(lessonId: string): string {
  const at = lessonId.indexOf("@");
  return at === -1 ? lessonId : lessonId.slice(0, at);
}

/**
 * The headlight setting a lesson's car should be handed over in.
 * `"low"` only when the conditions demand lights AND the car is handed over
 * ready AND the lesson's own briefing does not ORDER the student to switch
 * them on. Everything else is `"off"`.
 */
export function initialHeadlightsFor(ctx: SpawnHeadlightContext): HeadlightSetting {
  if (ctx.vehicleStart !== "ready") return "off"; // a cold start is a pre-drive
  if (ctx.preDrive) return "off"; // `headlights-on` is a graded step there
  // The lesson's own briefing orders the act → it must be the student's to do.
  if (ctx.lampDrill ?? isHeadlightDrillLesson(ctx.lessonId)) return "off";
  return ctx.night || ctx.rain || ctx.fog ? "low" : "off";
}

// ---------------------------------------------------------------------------
// SPAWN PARKING-BRAKE STATE — the same invariant, on the other red lamp.
// ---------------------------------------------------------------------------
//
// MEASURED, `.audit-frames/w10-3/frames/sc-vp-handbrake__pc-wrong/`. The
// lesson is „Потегляне с вдигната ръчна" and briefing step 2 reads «Свали
// ръчната докрай и погледни таблото: червената лампа за ръчна спирачка ТРЯБВА
// да угасне. Свети ли още — ръчната не е долу.» On 01-arrival.png the cluster
// is at 0 км/ч in D with the student's hands still off the controls, and the
// cabin telltale block shows exactly ONE lit lamp — the belt. Slot 3 of the
// rail (`brake`, LAMP_KEYS order) is dark, and it is dark on 04-t011s.png too,
// at 59 км/ч, in the lane whose entire premise is that the handbrake was never
// lowered. The same is true of the РЪЧНА glyph in the PC control strip.
//
// TWO CRITICAL ROWS BLAMED THE INSTRUMENT AND THE INSTRUMENT IS INNOCENT.
// `clusterReadout.lampBank` already does `set(out.brake, input.parkingBrakeOn
// ? "warn" : "off")`, VitokCockpit's sampler already feeds
// `driveline.parkingBrakeOn`, TouchControls' РЪЧНА pill already takes
// `active={snap.parkingBrakeOn}` and StatusDashboard already paints it
// `var(--danger)`. FOUR shipped surfaces render the state. The state is false:
// `start.vehicleStart: "ready"` → `DrivelineState("ready")` →
// `parkingBrakeOn = false` (vehicle/driveline.ts). The lesson about setting off
// with the handbrake up hands the student a car whose handbrake is already
// down, so the lamp the briefing calls the sole verification instrument has
// nothing to verify, and step 2's order arrives pre-performed.
//
// That is doc 86 L10's defect exactly — «THE HAND-OVER STATE MUST NOT FALSIFY
// THE LESSON'S OWN LAMP SENTENCE» — pointing at the other lamp, so it is
// answered the same way: DERIVED from the template's own authored briefing,
// never a hand-typed list of ids. The headlight list failed OPEN and cost
// `sc-park-night` seven quiet rounds; a handbrake list would fail open the
// same way, on the same catalogue, for the same reason.
//
// WHY THIS IS SAFE TO HAND OVER. A parking brake at spawn is not a new state
// for the product: 31 templates and 130 exam rungs already spawn `cold`, which
// is engine off, selector P AND parking brake on. `stuckStart.ts` watches the
// functional throttle and names the first blocker in fix order — engine →
// selector → parking brake — so a student who presses the pedal is told «свали
// ръчната» rather than left guessing, and `PARKING_BRAKE_FORCE_N` is untouched.
// Nothing new can be refused either: HANDBRAKE_LEFT_ON needs `moving &&
// parkingBrakeOn` (rules/catalog.ts), and a student who obeys step 2 before
// moving is clean by construction. Cold spawns keep their own brake-on state —
// this rule only ever moves a `ready` hand-over, and only ever toward ON.
//
// ---------------------------------------------------------------------------
// AND THE OTHER DIRECTION, WHICH THE FIRST WRITE-UP OF THIS BLOCK DID NOT COST.
// ---------------------------------------------------------------------------
// „No false refusal is possible" is true and is only half the question. The
// half it skipped: `PARKING_BRAKE_FORCE_N` does not make the car drag, it
// makes the car STOP. Measured on the drive rig and recorded on
// `engine/stuckStart.ts`'s standstill constant — eight seconds of full
// throttle against the lever reached a maximum of 0.32 км/ч — while
// HANDBRAKE_LEFT_ON needs `speed > cfg.movingSpeedKmh` = 5 км/ч, sustained
// `handbrakeSustainSec` = 1.5 s (rules/types.ts:1406-1408). The car reaches
// under a fifteenth of that threshold and stays there. So on the lesson TITLED
// „Потегляне с вдигната ръчна" the fault it is named after cannot be booked
// from a standstill, and the catalogue's own «Колата се влачи, спирачките
// прегряват» describes a drag the force model does not produce.
//
// THAT PATH WAS ALREADY CLOSED AT HEAD, and it is closed by the force model
// rather than by this rule: before this change the lever was DOWN at hand-over,
// so on `sc-vp-handbrake` there was nothing to leave up in the first place —
// which is exactly what `sc-vp-handbrake:1f2f7463` («потеглянето с вдигната
// ръчна не струва нищо на ученика») photographed at 59 км/ч with the РЪЧНА pill
// grey. This rule neither opens that path nor shuts it. It STAYS OPEN, and it
// is a conviction question — whether a lever a student never releases should
// cost points at all when the car does not move — not a hand-over question.
// HANDBRAKE_LEFT_ON does remain reachable the other way round, by pulling the
// lever while already above 5 км/ч; it is not globally dead.
//
// WHAT DOES CHANGE IS WHAT THE STUDENT IS TOLD. With the lever pulled, a
// floored throttle at a standstill resolves through `stuckStartReason` to
// `parkingBrake`, and `LessonPlayShell.handleStuckStart` prints «Ръчната
// спирачка е вдигната — колата е задържана … свалянето на ръчната е последната
// стъпка преди потегляне». Doc 64 THEO-4 is what makes that the condition of
// shipping this at all: a car that refuses to move in silence is a bare
// verdict, so an immobilising hand-over may only ship with that channel armed.
// `components/sim/__tests__/spawnParkingBrakeSeam.test.tsx` pins it on the
// driveline this rule actually produces, beside the mount that produces it.
//
// TWO KNOCK-ON EFFECTS ON THE CORPUS, named so the next sweep is not surprised:
// the wrong-lane audit drive of this lesson will no longer reach 59 км/ч and
// will fail on route incompleteness instead, and `sc-vp-readiness`'s authored
// mistake card `mistake-handbrake.trace.json` («влачи се») is a recorded demo
// of a drag the live car cannot reproduce from rest. Neither is a reason to
// hand a student a lesson whose first order is already carried out.
// ---------------------------------------------------------------------------

/** The control's noun. «ръчна» alone is the way every briefing in the
 *  catalogue says it; «спирачка» on its own is the FOOT brake and must not
 *  arm this (sc-hz-brake-fade's «натисни спирачката» is a pedal sentence). */
const PARKING_BRAKE_NOUN_RE = /(?:^|[^\p{L}])ръчна(?:та)?(?![\p{L}])/iu;
/** The imperative to let it off. Imperatives ONLY: the participle «свалена»
 *  («Продължи с поставен колан и свалена ръчна…») describes the state the
 *  student is already in and orders nothing, so it must not arm the spawn.
 *  Unicode boundaries only — `\b` is ASCII and never matches a Cyrillic edge,
 *  which is the trap the lamp predicate above records paying for. */
const RELEASE_RE = /(?:^|[^\p{L}])(свали|освободи|отпусни|пусни)(?![\p{L}])/iu;

/** Clauses that mention the parking brake at all (the lamp rule's split, and
 *  the same reason: a hedge or an explanation binds to its own clause). */
function parkingBrakeClauses(text: string): string[] {
  return text
    .split(/[.!?:;]\s+|\s[—–-]\s/u)
    .filter((c) => PARKING_BRAKE_NOUN_RE.test(c));
}

/**
 * Does this lesson's own authored briefing ORDER the student to release the
 * parking brake, unconditionally? Pure over the authored step texts — no
 * catalogue, no DOM — so it is unit-testable by mutation on the sentences
 * themselves, exactly like `briefingOrdersLampsOn`.
 */
export function briefingOrdersParkingBrakeOff(instructionTexts: readonly string[]): boolean {
  for (const text of instructionTexts) {
    for (const clause of parkingBrakeClauses(text)) {
      if (RELEASE_RE.test(clause) && !CONDITIONAL_RE.test(clause)) return true;
    }
  }
  return false;
}

/** Memoised per template, like the lamp drill — the catalogue scan runs once. */
const brakeDrillCache = new Map<string, boolean>();

/**
 * True when RELEASING the parking brake is an act THIS lesson asks for, read
 * off the template's hand-authored `instructionsBg`. Unknown ids (curriculum
 * lessons, tests) are not drills and keep the pre-existing hand-over.
 */
export function isParkingBrakeDrillLesson(lessonId: string): boolean {
  const templateId = templateIdOfLessonId(lessonId);
  const hit = brakeDrillCache.get(templateId);
  if (hit !== undefined) return hit;
  const spec = scenarioById(templateId);
  const drill =
    spec !== undefined && briefingOrdersParkingBrakeOff(spec.instructionsBg.map((s) => s.textBg));
  brakeDrillCache.set(templateId, drill);
  return drill;
}

/** Derived, not typed — the partition the gate beside this file pins by name. */
export function parkingBrakeDrillTemplateIds(): ReadonlySet<string> {
  return new Set(SCENARIO_TEMPLATES.filter((s) => isParkingBrakeDrillLesson(s.id)).map((s) => s.id));
}

/** The inputs the spawn parking-brake decision reads — primitives, so the rule
 *  is unit-tested without a DOM or a compiled lesson. */
export interface SpawnParkingBrakeContext {
  /** LessonSpec.vehicleStart as resolved by the caller ("cold" | "ready"). */
  vehicleStart: VehicleStartState;
  /** True when this lesson runs the 13-step pre-drive procedure — the release
   *  is a coached/graded step there and the cold car already supplies it. */
  preDrive: boolean;
  /** Compiled lesson id, e.g. `sc-vp-handbrake@L2`, or the raw template id. */
  lessonId: string;
  /** Override for "is the lever itself the lesson?". Omitted in production —
   *  derived from `lessonId` via the authored briefing. */
  brakeDrill?: boolean;
}

/**
 * Is the parking brake ON when this lesson hands the car over?
 * `true` only when the lesson's own briefing ORDERS the release and the car
 * would otherwise arrive with it already down. A cold start is already brake-on
 * and says so through `vehicleStart`, so this returns false there and lets
 * `DrivelineState` keep owning that case — one truth, not two.
 */
export function initialParkingBrakeOnFor(ctx: SpawnParkingBrakeContext): boolean {
  if (ctx.vehicleStart !== "ready") return false; // DrivelineState("cold") already pulls it
  if (ctx.preDrive) return false; // `parking-brake-off` is a graded step there
  return ctx.brakeDrill ?? isParkingBrakeDrillLesson(ctx.lessonId);
}

/**
 * Pure hold-to-glance state machine (extracted so it is unit-testable in
 * Node — CabinControls binds window listeners and cannot be constructed
 * headless). Semantics:
 *   - start(mirror)  → head turns toward the mirror over GLANCE_EASE_S and
 *     HOLDS there until end()/release(); returns true only when the press
 *     begins a NEW glance (the grading latch — once per hold, on press).
 *   - end(mirror)    → releases only when it matches the held mirror, so
 *     releasing Q never cancels an E-hold that replaced it mid-press.
 *   - start(mirror, tap=true) → same, but auto-releases after
 *     GLANCE_TAP_HOLD_S (touch buttons have no keyup).
 *   - update(dt)     → advances the 0..1 envelope; `mirror` clears only after
 *     the head has eased fully back (the camera reads mirror+strength).
 *     Returns the mirror to RE-LATCH for grading when the hold has lasted
 *     another GLANCE_REFRESH_S (founder R3 #13 — a held look stays fresh),
 *     null otherwise. Mashing the same button re-arms the hold (and the tap
 *     timer) without a second latch — the refresh stream carries freshness.
 */
export class GlanceHold {
  /** Mirror the head is turned toward (stays set through the ease-out). */
  mirror: MirrorGlanceKind | null = null;
  private held = false;
  private env = 0;
  private tapRemainingS = -1;
  private sinceLatchS = 0;

  /** Head-turn envelope 0..1 (0 = forward, 1 = full mirror deflection). */
  get strength(): number {
    return this.mirror ? this.env : 0;
  }

  start(mirror: MirrorGlanceKind, tap = false): boolean {
    // Already actively holding this mirror (e.g. key held + hotspot press):
    // one hold = one graded glance, so the second source does not re-latch.
    const isNewGlance = !(this.held && this.mirror === mirror);
    this.mirror = mirror;
    this.held = true;
    this.tapRemainingS = tap ? GLANCE_TAP_HOLD_S : -1;
    if (isNewGlance) this.sinceLatchS = 0; // refresh clock restarts per hold
    return isNewGlance;
  }

  end(mirror: MirrorGlanceKind): void {
    if (this.mirror !== mirror) return;
    this.held = false;
    this.tapRemainingS = -1;
  }

  /** Focus loss / dispose: nothing may stay held down. */
  release(): void {
    this.held = false;
    this.tapRemainingS = -1;
  }

  update(dtSec: number): MirrorGlanceKind | null {
    if (!this.mirror) return null;
    if (this.held && this.tapRemainingS >= 0) {
      this.tapRemainingS -= dtSec;
      if (this.tapRemainingS <= 0) this.release();
    }
    const step = dtSec / GLANCE_EASE_S;
    if (this.held) {
      this.env = Math.min(1, this.env + step);
      // Founder R3 #13: an ONGOING hold periodically re-latches the graded
      // sample so the rule engine's freshness tracks the look, not the press.
      this.sinceLatchS += dtSec;
      if (this.sinceLatchS >= GLANCE_REFRESH_S) {
        this.sinceLatchS -= GLANCE_REFRESH_S;
        return this.mirror;
      }
    } else {
      this.env = Math.max(0, this.env - step);
      if (this.env <= 0) this.mirror = null;
    }
    return null;
  }
}

/**
 * Single place that defines the cabin key bindings (KeyboardEvent.code, so
 * they are keyboard-layout independent). Q/E/R was the design sketch for the
 * glances, but R is already "reset" (engine/input.ts) — rear glance sits on F.
 */
export const CABIN_KEYS = {
  indicatorLeft: "Comma",
  indicatorRight: "Period",
  headlights: "KeyL",
  seatbelt: "KeyB",
  glanceLeft: "KeyQ",
  glanceRight: "KeyE",
  glanceRear: "KeyF",
  nightPreview: "KeyN",
  muteAudio: "KeyM",
} as const;

/**
 * A1 driveline key bindings — chosen against the FULL existing map (WASD/
 * arrows drive, Space, C camera, R reset, Esc pause, X fullscreen, ,/. L B
 * Q/E/F N M cabin) so nothing collides:
 *
 *  - I  = ignition (E is the right-mirror glance; W/S are pedals),
 *  - Space = stateful parking-brake TOGGLE — it replaces the old momentary
 *    drift handbrake on the keyboard (that stays on gamepad A only),
 *  - [ / ] = selector gate one step toward P / toward D (and manual gear
 *    down/up). Shift/Ctrl were rejected: Ctrl+W closes the browser tab and
 *    five discrete Shift presses trip Windows Sticky Keys mid-lesson,
 *  - Z (HOLD) = clutch — left pinky, held while W throttles (manual mode),
 *  - J = hazards, T = wipers, V = fog lights (W and F are taken),
 *  - H (HOLD) = horn (the genre convention; B is the seatbelt).
 */
export const DRIVELINE_KEYS = {
  engine: "KeyI",
  parkingBrake: "Space",
  gearUp: "BracketRight",
  gearDown: "BracketLeft",
  clutch: "KeyZ",
  hazards: "KeyJ",
  wipers: "KeyT",
  fogLights: "KeyV",
  horn: "KeyH",
} as const;

export interface CabinCallbacks {
  /** B — seatbelt buckled/unbuckled (audio plays the click). */
  onSeatbeltToggle?: (on: boolean) => void;
  /** Q/E/F — a mirror glance started (camera + rule-engine sample react). */
  onGlance?: (mirror: MirrorGlanceKind) => void;
  /** M — mute toggle request (audio layer owns the actual state). */
  onToggleMute?: () => void;
  /** Space — parking brake engaged/released (audio plays the lever click). */
  onParkingBrakeToggle?: (on: boolean) => void;
}

/** Steer angle (rad) that arms the indicator auto-cancel... */
const AUTOCANCEL_ARM_RAD = 0.22;
/** ...and the return-to-centre angle that releases it (like a real stalk). */
const AUTOCANCEL_RELEASE_RAD = 0.05;

export class CabinControls {
  indicator: IndicatorSetting = "off";
  /** Set from the constructor's `initialHeadlights` — "low" when the lesson
   *  hands over a ready car into night/rain/fog (doc 86 L10). */
  headlights: HeadlightSetting;
  seatbeltOn = false;
  nightPreview = false;

  /** A1 vehicle state machine — ignition/selector/clutch/parking brake/
   *  hazards/wipers/fog/horn. ONE source: physics, HUD, cluster, sample
   *  builder and (A2) the procedure machine all read from here. */
  readonly driveline: DrivelineState;

  /** Hold-to-glance state (keys Q/E/F down/up, hotspot pointer down/up). */
  private readonly glances = new GlanceHold();

  private clock = 0;
  private indicatorChangedAt = 0;
  /** Latch QUEUE consumed by the VehicleSample builder, ONE per frame.
   *  A queue, not a single slot (founder R3 #13): left+right pressed inside
   *  one render frame (easy at low FPS on the 16 GB box) must BOTH reach the
   *  rule engine — the second drains one frame later instead of silently
   *  overwriting the first. Bounded (drop past 4) so a stalled consumer can
   *  never grow it. */
  private readonly pendingGlanceSamples: MirrorGlanceKind[] = [];
  private autocancelArmed = false;
  private disposed = false;

  constructor(
    private readonly callbacks: CabinCallbacks = {},
    /** Lesson spawn policy (LessonSpec.vehicleStart) — default cold start:
     *  engine OFF, selector P, parking brake ON (the pre-drive reality). */
    vehicleStart: VehicleStartState = "cold",
    /** Lamp state at hand-over (doc 86 L10) — resolve it with
     *  `initialHeadlightsFor()`. Default "off" = the pre-doc-86 behaviour, so
     *  every headless/legacy construction is byte-identical. */
    initialHeadlights: HeadlightSetting = "off",
    /** Parking brake at hand-over — resolve it with `initialParkingBrakeOnFor()`.
     *  Default false = the pre-existing behaviour, so every headless/legacy
     *  construction is byte-identical; a `cold` start pulls it in the driveline
     *  constructor regardless and this can only ever ADD the brake, never
     *  release one the spawn policy asked for. */
    initialParkingBrakeOn = false,
  ) {
    this.headlights = initialHeadlights;
    this.driveline = new DrivelineState(vehicleStart);
    // Written straight onto the field rather than through `toggleParkingBrake`:
    // the toggle emits `parkingBrakeChanged`, which the A2 procedure observer
    // reads as a performed step, and nobody performed anything at t = 0.
    if (initialParkingBrakeOn) this.driveline.parkingBrakeOn = true;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }

  /**
   * Advance the blink/glance clocks; call once per render frame.
   * `steerRad` (+ = left, from VehicleSim) drives the indicator auto-cancel:
   * once the wheel has clearly turned toward the signalled side and then
   * returned to centre, the stalk clicks off — like a real car.
   */
  update(dtSec: number, steerRad: number): void {
    this.clock += dtSec;
    // Held-glance refresh (founder R3 #13): sample-only — the driver's head is
    // still on the mirror, not a new act, so no onGlance callback re-fires
    // (the pre-drive observer and audio react to presses, not to holding).
    const refresh = this.glances.update(dtSec);
    if (refresh) this.enqueueGlanceSample(refresh);

    if (this.indicator !== "off") {
      const toward = this.indicator === "left" ? steerRad : -steerRad;
      if (toward > AUTOCANCEL_ARM_RAD) this.autocancelArmed = true;
      else if (this.autocancelArmed && toward < AUTOCANCEL_RELEASE_RAD) {
        this.indicator = "off";
        this.autocancelArmed = false;
      }
    }
  }

  /** True during the "on" half of the 600 ms blink cycle (starts on). */
  get blinkOn(): boolean {
    if (this.indicator === "off") return false;
    return ((this.clock - this.indicatorChangedAt) % BLINK_PERIOD_S) < BLINK_PERIOD_S / 2;
  }

  /** Hazard-lamp blink (A1): free-running on the same 600 ms relay period —
   *  lights BOTH indicator lamps in the cluster/exterior while hazards are on. */
  get hazardBlinkOn(): boolean {
    if (!this.driveline.hazardsOn) return false;
    return (this.clock % BLINK_PERIOD_S) < BLINK_PERIOD_S / 2;
  }

  /** Mirror currently glanced at (camera + HUD read), or null. Stays set
   *  through the ease-out so the head turns BACK smoothly after release. */
  get glanceMirror(): MirrorGlanceKind | null {
    return this.glances.mirror;
  }

  /** Head-turn envelope 0..1 (0 = eyes forward, 1 = holding on the mirror). */
  glanceStrength(): number {
    return this.glances.strength;
  }

  /**
   * The next queued glance, exactly once (VehicleSample.mirrorGlance is a
   * one-frame event for the rule engine's mirror-check detector); glances
   * queued in the same frame drain over consecutive frames.
   */
  consumeGlanceSample(): MirrorGlanceKind | null {
    return this.pendingGlanceSamples.shift() ?? null;
  }

  // -- public control actions (A2) ---------------------------------------------
  // ONE code path per control: the keyboard handlers below and the cockpit
  // hotspots both call these, so audio callbacks, blink phase and the A2
  // procedure observer see identical transitions regardless of input device.
  // (The old QW5 applyPreDriveStep checklist-forcing path is GONE — steps now
  // complete FROM these transitions, never the other way around.)

  /** Seatbelt buckle (key B / hotspot_belt). */
  toggleSeatbelt(): void {
    this.seatbeltOn = !this.seatbeltOn;
    this.callbacks.onSeatbeltToggle?.(this.seatbeltOn); // audio click
  }

  /** Headlight rotary: off → low → high → off (key L / hotspot_headlights). */
  cycleHeadlights(): void {
    this.headlights =
      this.headlights === "off" ? "low" : this.headlights === "low" ? "high" : "off";
  }

  /** Stalk single-click cycle for the hotspot: off → left → right → off.
   *  (Keys , and . keep their direct toggle-side semantics.) */
  cycleIndicator(): void {
    this.indicator =
      this.indicator === "off" ? "left" : this.indicator === "left" ? "right" : "off";
    this.indicatorChangedAt = this.clock; // first blink always starts "on"
    this.autocancelArmed = false;
  }

  /** P1 touch buttons: direct side toggles with the EXACT semantics of keys
   *  , and . — same private setIndicator path, so blink phase, auto-cancel
   *  and the A2 observer cannot tell a touch tap from a keypress. */
  indicateLeft(): void {
    this.setIndicator("left");
  }

  indicateRight(): void {
    this.setIndicator("right");
  }

  /** Parking brake toggle (key Space / hotspot_parking_brake) — routes the
   *  audio callback exactly like the key path. */
  toggleParkingBrake(): void {
    this.driveline.toggleParkingBrake();
    this.callbacks.onParkingBrakeToggle?.(this.driveline.parkingBrakeOn);
  }

  /** Mirror glance HOLD begin (key down Q/E/F / hotspot pointer down) — the
   *  GRADED path: latches the one-frame sample for the rule engine ONCE per
   *  hold (on press) and turns the head toward the mirror until the matching
   *  glanceEnd(). */
  glanceStart(mirror: MirrorGlanceKind): void {
    if (this.glances.start(mirror)) this.latchGlance(mirror);
  }

  /** Mirror glance HOLD end (key up / hotspot pointer up or leave). */
  glanceEnd(mirror: MirrorGlanceKind): void {
    this.glances.end(mirror);
  }

  /** Tap glance (touch overlay buttons — no release edge): same graded path,
   *  holds the view for GLANCE_TAP_HOLD_S and then eases back on its own. */
  glance(mirror: MirrorGlanceKind): void {
    if (this.glances.start(mirror, true)) this.latchGlance(mirror);
  }

  private setIndicator(side: Exclude<IndicatorSetting, "off">): void {
    this.indicator = this.indicator === side ? "off" : side;
    this.indicatorChangedAt = this.clock; // first blink always starts "on"
    this.autocancelArmed = false;
  }

  /** The graded once-per-hold press: rule-engine sample + observer callback. */
  private latchGlance(mirror: MirrorGlanceKind): void {
    this.enqueueGlanceSample(mirror);
    this.callbacks.onGlance?.(mirror);
  }

  /** Bounded push into the sample queue (press latches and hold refreshes). */
  private enqueueGlanceSample(mirror: MirrorGlanceKind): void {
    if (this.pendingGlanceSamples.length < 4) this.pendingGlanceSamples.push(mirror);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.disposed || e.repeat) return;
    // Don't fight text inputs (e.g. the HUD volume slider has focus).
    const t = e.target;
    if (t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;

    switch (e.code) {
      case CABIN_KEYS.indicatorLeft:
        this.setIndicator("left");
        break;
      case CABIN_KEYS.indicatorRight:
        this.setIndicator("right");
        break;
      case CABIN_KEYS.headlights:
        this.cycleHeadlights();
        break;
      case CABIN_KEYS.seatbelt:
        this.toggleSeatbelt();
        break;
      case CABIN_KEYS.glanceLeft:
        this.glanceStart("left");
        break;
      case CABIN_KEYS.glanceRight:
        this.glanceStart("right");
        break;
      case CABIN_KEYS.glanceRear:
        this.glanceStart("rear");
        break;
      case CABIN_KEYS.nightPreview:
        this.nightPreview = !this.nightPreview;
        break;
      case CABIN_KEYS.muteAudio:
        this.callbacks.onToggleMute?.();
        break;

      // --- A1 driveline controls (state lives in DrivelineState) ------------
      case DRIVELINE_KEYS.engine:
        this.driveline.toggleEngine();
        break;
      case DRIVELINE_KEYS.parkingBrake:
        this.toggleParkingBrake();
        break;
      case DRIVELINE_KEYS.gearUp:
        this.driveline.gearUp();
        break;
      case DRIVELINE_KEYS.gearDown:
        this.driveline.gearDown();
        break;
      case DRIVELINE_KEYS.clutch:
        this.driveline.setClutch(true);
        break;
      case DRIVELINE_KEYS.hazards:
        this.driveline.toggleHazards();
        break;
      case DRIVELINE_KEYS.wipers:
        this.driveline.toggleWipers();
        break;
      case DRIVELINE_KEYS.fogLights:
        this.driveline.toggleFogLights();
        break;
      case DRIVELINE_KEYS.horn:
        this.driveline.setHorn(true);
        break;
    }
  };

  /** Held controls (clutch, horn, mirror glances) release on keyup. */
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (this.disposed) return;
    if (e.code === DRIVELINE_KEYS.clutch) this.driveline.setClutch(false);
    if (e.code === DRIVELINE_KEYS.horn) this.driveline.setHorn(false);
    if (e.code === CABIN_KEYS.glanceLeft) this.glanceEnd("left");
    if (e.code === CABIN_KEYS.glanceRight) this.glanceEnd("right");
    if (e.code === CABIN_KEYS.glanceRear) this.glanceEnd("rear");
  };

  /** Focus loss must never leave a held control stuck down. */
  private readonly onBlur = (): void => {
    this.driveline.setClutch(false);
    this.driveline.setHorn(false);
    this.glances.release();
  };
}
