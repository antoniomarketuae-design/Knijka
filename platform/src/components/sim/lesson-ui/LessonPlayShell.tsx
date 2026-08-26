"use client";

/**
 * Lesson play shell — owns one lesson session end to end:
 *
 *   SceneSlot (3D, integrator) ──onTick──▶ lesson engine (pure, in a ref)
 *        │                                        │
 *        └─onPreDriveStep──▶ pre-drive machine    ├─▶ HUD events → toasts/banner
 *                                                 └─▶ phase → end screen → server action
 *
 * Perf model (same as the old SimHud): the engine state lives in a ref and
 * advances at frame rate with ZERO re-renders; React snapshots it on a 150 ms
 * interval for the HUD readouts. Toasts/flashes re-render only when events
 * actually fire.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  armedTelltaleWarnings,
  briefingBodyBg,
  briefingLineBg,
  briefingLineOrdinal,
  capBg,
  clutchHeldObjBg,
  clutchObjBg,
  createDashboardStatus,
  endLineDemandsAnswer,
  foldMaskCss,
  foldWindowPx,
  gearDownWithBg,
  gearUpActBg,
  gearUpWithBg,
  hintInputFor,
  HudStyles,
  HudToasts,
  Minimap,
  NOTIFY_COLUMN_RIGHT_CSS,
  NOTIFY_COLUMN_TOP_CSS_ROOMY,
  NOTIFY_COLUMN_WIDTH_CSS_ROOMY,
  leverActBg,
  ObjectiveBanner,
  parkingBrakeActBg,
  PreDriveChecklist,
  readStoredFlag,
  selectOverlay,
  SessionEndScreen,
  SESSION_END_AUTO_DEFAULT,
  SESSION_END_AUTO_STORAGE_KEY,
  shouldShowDebrief,
  shouldShowEndBar,
  SimOverlay,
  starterActBg,
  starterWithBg,
  StatusDashboard,
  telltaleWarningsKey,
  TOAST_QUIET_DEFAULT,
  TOAST_QUIET_STORAGE_KEY,
  TOUCH_SHEET_LOCATOR_BG,
  useHudToastQueue,
  useTapActivation,
  withSheetLocatorBg,
  writeStoredFlag,
  type DashboardStatus,
  type HintInput,
  type MinimapFrame,
  type ObjectiveFlash,
  type FoldRow,
  type SimOverlayItem,
  type TelltaleWarning,
} from "@/modules/sim/hud";
import {
  abortSession,
  ADVISOR_STORAGE_KEY,
  advisorPromptForSession,
  applyNearMiss,
  applyPreDriveStep,
  applyStagedOutcome,
  applyTick,
  buildDebrief,
  buildLessonResult,
  createLessonSession,
  createQuizTriggerState,
  defaultAdvisorEnabled,
  EXAM_TERMINATION_TEXT_BG,
  finishSession,
  isDriveLocked,
  MISTAKE_EXPERIENCE_DEMO_OFFER_SEC,
  observeQuizTick,
  parkingObservationFromTrace,
  parseMistakeExperienceLessonId,
  parseScenarioLessonId,
  parseStoredAdvisorSetting,
  resolveScenarioNextSteps,
  scenarioById,
  scoreRubric,
  serializeAdvisorSetting,
  serializeCoachedMistakes,
  serializeNearMisses,
  serializeRuleEvents,
  type AdvisorPrompt,
  type LessonResult,
  type LessonSessionState,
  type LessonSpec,
  type LessonStepResult,
  type MicroQuizQuestion,
  type MistakeDemo,
  type NearMissEvent,
  type QuizFrequency,
  type QuizTriggerState,
  type RubricObservationInput,
  type RubricScore,
  type ScenarioLevel,
  type ScenarioSpec,
  type StagedEventOutcome,
  type TeachMoment,
  type TriggeredQuiz,
} from "@/modules/sim/lessons";
import {
  compactTraceForStorage,
  createTraceRecorder,
  type LiveTraceRecorder,
} from "@/modules/sim/traces";
import {
  PRE_DRIVE_STEP_ORDER,
  PRE_DRIVE_STEPS,
  preDriveStepKind,
  type PreDriveMode,
  type PreDriveStepId,
} from "@/modules/sim/procedures";
import { HUD_LEFT_PANEL_MAX_HEIGHT_FRACTION } from "@/modules/sim/scene/vitok/cabinLook";

/** How long the completed pre-drive checklist stays on screen after the
 *  thirteenth step rolls the car away — see the state that uses it. */
const PRE_DRIVE_DONE_HOLD_MS = 7000;
import {
  accumulateScore,
  EXAM_POINTS_SHORT_NOTE_BG,
  examMarkCitationBg,
  minusPointsBg,
  pointsBg,
  VIOLATIONS,
  type SimTick,
} from "@/modules/sim/rules";
import {
  hasTouchScreen,
  type ReverseStuckDirection,
  type StuckStartReason,
} from "@/modules/sim/engine";
import { worldEdgeWarning } from "@/modules/sim/runtime";
import type {
  DrivelineRejection,
  DrivelineSnapshot,
  SelectorPosition,
  TransmissionMode,
} from "@/modules/sim/vehicle";
import { finishLessonAction } from "@/app/(dashboard)/simulator/actions";
import {
  loadMicroQuizBank,
  submitMicroQuizAnswer,
} from "@/app/(dashboard)/simulator/micro-quiz-actions";
import { recordSelfPredictionAction } from "@/app/(dashboard)/simulator/calibration-actions";
// Deep import, like CalibrationGate's: the learning barrel carries the module's
// server half, and this is a client bundle (audit M-26).
import { isResultScreenHeld } from "@/modules/learning/calibration";
import { AdvisorCard } from "./AdvisorCard";
import {
  nextQualitySelection,
  qualityAriaLabelBg,
  qualityTradeBg,
  qualityValueBg,
  type QualitySelection,
} from "./qualityChoice";
import { soundAriaLabelBg, soundHintBg, soundValueBg } from "./soundChoice";
// The ⚙ sheet's «Звук» row writes this and `SimAudio` reads it — the store is
// the one owner of the bit (scene/simAudioMuteStore.ts has the nine w10 frames
// and the reason it is not a prop). Deep import for CalibrationGate's reason:
// the scene barrel would pull the R3F half into this client bundle.
import { toggleSimAudioMuted, useSimAudioMuted } from "@/modules/sim/scene/simAudioMuteStore";
import { useQualitySelection } from "./QualityPresetSelector";
import { CalibrationGate, CalibrationPendingCard } from "./CalibrationGate";
import { HudCloseButton } from "./HudCloseButton";
import {
  exitFullscreen,
  FULLSCREEN_CHANGE_EVENTS,
  fullscreenElementOf,
  requestFullscreen,
  supportsFullscreen,
} from "./fullscreen";
// The top of the whole thumb-control band, as a CSS length. Doc 91 §I10: the
// minimap column stands on THIS and not on `--sim-hud-floor` (the instrument
// band, 48 px), which is what put the map under the throttle thumb.
// …and «МЕНЮ»'s own corner, which is NOT a literal here any more (2026-08-18):
// the steering band's fourth station lands in this button's lane on every
// 360-tall landscape profile, so the offset that keeps them disjoint is stated
// once, beside the band it has to clear. See TouchControls' PLAY_MENU_LEFT_CSS.
import {
  PLAY_MENU_LEFT_CSS,
  PLAY_MENU_TOP_CSS,
  TOUCH_CONTROLS_FLOOR,
  touchControlsFloorCss,
} from "../TouchControls";
import {
  COMPACT_DASH_HEIGHT_PX,
  isCompactViewport,
  MINIMAP_TOGGLE_SIZE_PX,
  minimapClearancePx,
  ROOMY_HUD_FLOOR_PX,
  shouldGoImmersive,
} from "./immersive";
import { MicroQuizOverlay } from "./MicroQuizOverlay";
import { MistakeConsequenceOverlay } from "./MistakeConsequenceOverlay";
import {
  OVERLAY_SCRIM_CLASS,
  PLAY_ASPECT,
  PLAY_BOTTOM_GUTTER_PX,
  PLAY_CHROME_FALLBACK_PX,
  playMaxWidthPx,
} from "./playArea";
import { PlayAreaStyles } from "./PlayAreaStyles";
import { SceneSlot } from "./SceneSlot";
import { TeachMomentOverlay } from "./TeachMomentOverlay";
import {
  MICRO_QUIZ_FREQUENCIES,
  MICRO_QUIZ_STORAGE_KEY,
  type FinishLessonActionResult,
  type QualityPreset,
} from "./types";

const HUD_POLL_MS = 150;

/** QW10: min seconds between two "завърши подготовката" toasts. */
const BLOCKED_DRIVE_TOAST_COOLDOWN_S = 10;

/** Driveline-rejection hints: short control feedback, not an 8 s lesson. */
const REJECTION_TOAST_TTL_MS = 3500;
/** Min seconds between two hints for the SAME rejection (mashing [ or I
 *  keeps one toast on screen instead of stacking four). */
const REJECTION_TOAST_COOLDOWN_S = 3;

/**
 * Why the car refused a control action, in HUD grammar (founder bug
 * 2026-07-10: the start interlock and selector gate rejected SILENTLY — „I
 * doesn't start", „] doesn't go up"). The snapshot names the blocking state;
 * endOfGate needs it to tell "already in D" (the founder expecting numbered
 * gears on the automatic) from "already in P" / "top manual gear". No lawRef
 * — this is vehicle operation, not a graded rule.
 */
export function rejectionHint(
  rejection: DrivelineRejection,
  snap: DrivelineSnapshot,
  input: HintInput,
): { key: string; titleBg: string; explanationBg: string } {
  const clutch = clutchObjBg(input);
  const gearDown = gearDownWithBg(input);
  const gearUp = gearUpWithBg(input, snap.transmission);
  if (rejection.kind === "startRejected") {
    return rejection.reason === "clutch"
      ? {
          key: "start-clutch",
          titleBg: "Двигателят не запали",
          explanationBg: withSheetLocatorBg(
            input,
            `Натисни и задръж ${clutch} — или премести лоста в P или N ${gearDown} — и опитай пак ${starterWithBg(input)}.`,
          ),
        }
      : {
          key: "start-selector",
          titleBg: "Двигателят не запали",
          explanationBg: withSheetLocatorBg(
            input,
            `Постави скоростния лост в P или N ${gearDown}, за да запалиш ${starterWithBg(input)}.`,
          ),
        };
  }
  switch (rejection.reason) {
    case "speed":
      // No control named, so nothing to translate: the instruction is „stop".
      return {
        key: "shift-speed",
        titleBg: "Скоростта е твърде висока",
        explanationBg: "Спри напълно, за да включиш R или P.",
      };
    case "clutch":
      return {
        key: "shift-clutch",
        titleBg: "Предавката не влезе",
        explanationBg: withSheetLocatorBg(
          input,
          `Натисни и задръж ${clutch}, докато местиш лоста.`,
        ),
      };
    case "endOfGate":
      if (snap.selector === "D") {
        return {
          key: "gate-d",
          titleBg: "Лостът вече е в D",
          explanationBg: withSheetLocatorBg(
            input,
            `Автоматичната кутия сменя предавките сама — напред няма ръчни степени. Към N се връщаш ${gearDown}.`,
          ),
        };
      }
      if (snap.selector === "M") {
        return {
          key: "gate-m",
          titleBg: `Това е последната предавка (M${snap.manualGear})`,
          explanationBg: "Нагоре няма повече предавки.",
        };
      }
      return {
        key: "gate-p",
        titleBg: "Лостът вече е в P",
        // …AND THE GATE IS NOT THE SAME IN BOTH BOXES. „към R, N и D" was
        // false on „Напреднал", whose gate is P—R—N—M1…M5 — the same class of
        // stale sentence as the drivetrain pad's reverse promise, and it had
        // to be fixed here anyway: the touch face this clause names is «M►»
        // on that tier, so naming D beside it would have been a NEW lie.
        explanationBg: withSheetLocatorBg(
          input,
          snap.transmission === "manual"
            ? `Назад няма повече позиции — ${gearUp} тръгваш към R, N и първа предавка.`
            : `Назад няма повече позиции — ${gearUp} тръгваш към R, N и D.`,
        ),
      };
  }
}

/**
 * THE PEDAL THE CAR REFUSED, IN WORDS — engine/reverseStuck.ts.
 *
 * The founder, 2026-08-09: „it turns to R (reverse) but the car does not move
 * did it break or ?". It did not break. He was holding the pedal he had just
 * braked with, and LAW 2 (engine/reverseAssist.ts) will not let a pedal that
 * meant STOP one frame ago mean GO — it keeps braking with it until the foot
 * genuinely lifts. The guard is right; the silence was the defect.
 *
 * TWO JOBS, and the second is the one that matters.
 *
 *  1. UNBLOCK. The instruction, and nothing else, is on the LINE — where a
 *     phone shows it without anything being tapped. A student must not have to
 *     open a panel to get out of a car that will not move.
 *
 *     ITS LENGTH IS MEASURED, and the first draft failed. The compact card
 *     clamps the line to THREE lines of 13.75 px at 11 px (`line-clamp-3`,
 *     SimOverlay) in a column that is 141.5 px on an iPhone 16 in portrait and
 *     129.6 px on a 360-wide Android. „Лостът е на R, но педалът още спира —
 *     вдигни крак и натисни пак" is 63 characters, which lays out at 55 px
 *     against a 41 px clamp on BOTH portrait profiles — photographed, not
 *     inferred — and the words it cut off were „натисни пак". The one job that
 *     may never be lost was the one the truncation ate.
 *
 *     Measured in the shipped card at all four profiles: 45 chars = exactly 3
 *     lines (41/41, no slack), 37 = 3 lines on the 360, 34 = TWO lines on both
 *     portraits and one in landscape. So the line is 34 characters, it leads
 *     with the verb, and it has a whole clamp line of headroom. Everything the
 *     line no longer says moved into the first sentence of the WHY, which is
 *     one tap away, never truncated, and always present (THEO-4).
 *
 *  2. TEACH. This is a real property of a real car and of the one habit that
 *     makes it safe: you come off the brake BEFORE you go for the accelerator,
 *     and until you do, the car is braked. A product that swallowed that and
 *     printed nothing would be throwing away the exact moment the lesson lands
 *     — which is the bare verdict THEO-4 forbids.
 *
 * NO lawRef, on purpose and for the same reason `rejectionHint` above carries
 * none: this is vehicle operation, not a graded rule of ЗДвП. Nothing here is
 * scored — the toast is kind „lesson", the coached, unscored channel.
 *
 * BOTH DIRECTIONS, because LAW 2 guards both flips: ↓/S inherits the throttle
 * role going INTO R, ↑/W inherits it coming back OUT into D. Same refusal and
 * the same habit, opposite direction of travel — so the LINE is identical (the
 * instruction does not change) and only the WHY names R or D and назад or
 * напред. The R case is driven and photographed; the D case is covered by
 * `reverseStuck.test.ts`.
 *
 * DEVICE-NEUTRAL WORDING. No key names: the cockpit is worked with a finger on
 * a pedal, a mouse on the lever, or the keyboard, and the QW10 hint below
 * already had to be rewritten once for teaching the keyboard inside a lesson
 * whose whole premise is the cockpit. „педалът" is true on all three.
 */
function reverseStuckHint(direction: ReverseStuckDirection): {
  titleBg: string;
  explanationBg: string;
} {
  const backward = direction === "backward";
  return {
    // 34 characters. See the measurement above before lengthening it.
    titleBg: "Вдигни крак от педала, натисни пак",
    explanationBg:
      `Лостът е на ${backward ? "R" : "D"}, но колата не тръгва: педалът, който държиш, допреди миг беше спирачката — с него спря. Затова не става на газ под крака ти. Докато не го отпуснеш, той продължава да спира. В истинска кола е същото — първо вдигаш крак от спирачката, чак после даваш газ. Вдигни крак, натисни пак и тръгваш ` +
      (backward ? "назад." : "напред."),
  };
}

/**
 * THE CAR THAT WILL NOT MOVE, IN WORDS — engine/stuckStart.ts.
 *
 * `handleBlockedDriveAttempt` below has said the right thing since QW10 —
 * «Колата още не е готова за потегляне» — and it can only be reached through
 * the pre-drive phase. Every compiled scenario rung has `preDrive: false`, and
 * 130 of them (`{ level: 4, vehicleStart: "cold" }`) plus 31 whole templates
 * hand the student a cold car anyway. Measured on `sc-junction-stop@L4`: ten
 * seconds of floored throttle, 0.00 km/h, nothing said. Same class as the two
 * hints above it, so it gets the same channel and the same grammar.
 *
 * ONE BLOCKER PER MESSAGE, IN FIX ORDER — the machine names the first thing in
 * the way and re-speaks the moment the student clears it, so this reads like an
 * instructor walking someone out of a dead car rather than a checklist. The
 * QW10 hint is a list because there the checklist IS the lesson; here there is
 * no checklist on screen at all.
 *
 * MOUSE-FIRST, then the key — the wording rule the QW10 hint had to be
 * rewritten for (B7/B20): the cockpit is worked with the mouse, and the key cap
 * is the footnote for the advanced. No lawRef: this is vehicle operation, not a
 * graded rule, and nothing here is scored — kind „lesson", the coached channel.
 *
 * TIER-AWARE, because the gate really is different. „Напреднал" is a manual box
 * (vehicle/driveline.ts `transmissionModeFor`): its forward position is a
 * numbered gear rather than D, engaging one needs the clutch, and its „ready"
 * spawn is NEUTRAL by design — so the automatic's crisp «щракни лоста към D»
 * would be a false instruction on exactly the tier that spawns needing it.
 * The transmission comes from the live driveline snapshot, not from a guess
 * about the lesson, because the student can switch tiers mid-drive.
 */
export function stuckStartHint(
  reason: StuckStartReason,
  transmission: TransmissionMode,
  input: HintInput,
): {
  titleBg: string;
  explanationBg: string;
} {
  const manual = transmission === "manual";
  const gearUp = gearUpWithBg(input, transmission);
  switch (reason) {
    case "engineOff":
      return {
        titleBg: "Двигателят е изключен — затова газта не движи колата",
        explanationBg: withSheetLocatorBg(
          input,
          `Педалът работи, но няма двигател, който да върти колелата. ${capBg(starterActBg(input))}, за да запалиш. След това провери скоростния лост и ръчната спирачка — колата тръгва само когато и трите са наред.`,
        ),
      };
    case "stalled":
      return {
        titleBg: "Двигателят угасна — газта няма какво да задвижи",
        // A STALL CAN OUTLIVE THE GEARBOX IT HAPPENED IN, and the old sentence
        // did not know that: `stalled` latches until the next successful start
        // (vehicle/driveline.ts) while the tier pill can switch the box under
        // it, so a student who stalled on „Напреднал" and then went back to
        // «Нормален» was told to hold a clutch his car no longer has. Found by
        // the touch corpus in `controlPhrases.test.ts` — the automatic branch
        // had nothing to name, which is exactly how a false sentence shows up.
        explanationBg: withSheetLocatorBg(
          input,
          manual
            ? `Колата е останала в предавка без достатъчно обороти и моторът спря. Задръж ${clutchObjBg(input)}, ${starterActBg(input)} отново и потегли по-плавно — малко повече газ и по-бавно отпускане на съединителя.`
            : `Моторът угасна, докато кутията беше ръчна, и остана изключен. ${capBg(starterActBg(input))} отново — на автоматична кутия съединител няма, така че оттук нататък газта е достатъчна.`,
        ),
      };
    case "parked":
      return {
        titleBg: "Лостът е на P — колата е паркирана",
        explanationBg: withSheetLocatorBg(
          input,
          manual
            ? `В позиция P трансмисията е заключена и газта не стига до колелата. ${capBg(leverActBg(input))} към първа предавка — ${gearUp} минаваш P → R → N → 1 една позиция наведнъж, а за да влезе предавка, дръж ${clutchHeldObjBg(input)}.`
            : `В позиция P трансмисията е заключена и газта не стига до колелата. ${capBg(leverActBg(input))} към D (или към R за назад) — ${gearUp} минаваш P → R → N → D една позиция наведнъж.`,
        ),
      };
    case "neutral":
      return {
        titleBg: "Лостът е на N — двигателят работи, но не е свързан с колелата",
        explanationBg: withSheetLocatorBg(
          input,
          manual
            ? `Неутрално положение означава точно това: моторът се върти на празен ход. Задръж ${clutchObjBg(input)} и включи първа предавка ${gearUp}, после потегли, като отпускаш съединителя плавно и добавяш газ. В „Напреднал“ колата ти се подава именно на N — гумата тръгва чак когато ти избереш предавка.`
            : `Неутрално положение означава точно това: моторът се върти на празен ход. ${capBg(leverActBg(input))} към D ${gearUp}, за да тръгнеш напред. N се използва само при кратък престой — за паркиране е P, а за движение назад R.`,
        ),
      };
    case "parkingBrake":
      return {
        titleBg: "Ръчната спирачка е вдигната — колата е задържана",
        explanationBg: withSheetLocatorBg(
          input,
          `Задните колела са застопорени и двигателят не може да ги издърпа. ${capBg(parkingBrakeActBg(input))}, за да я свалиш. Свалянето на ръчната е последната стъпка преди потегляне — ако колата тегли или мирише на спирачки, първо провери нея.`,
        ),
      };
  }
}

/**
 * THE TIER PILL MOVED YOUR GEAR LEVER — vehicle/driveline.ts
 * `switchTransmission`.
 *
 * The move itself is right and doc 87 A4 argued it properly: „Напреднал" is a
 * MANUAL box, and dropping a standing car into first gear with the clutch up is
 * a stall by definition, so the switch parks it in neutral instead. A4 even
 * wrote down the thing it did not then fix — „the student gets the engine back
 * but sits in neutral with nothing on screen saying so, which is the same
 * complaint wearing a different hat" — and closed only the round trip.
 *
 * Measured on /dev/drive-rig (`sc-junction-stop@L1`, real shell, a real click on
 * the pill, 2026-08-11): the selector went D → N and the product said NOTHING,
 * and holding ↓ for the next 12.5 seconds said nothing either, because on that
 * tier ↓ is the brake and the car is in neutral. The car was never a dead end —
 * Z + [ walks the gate to R exactly as it should — but the only way out is a
 * control the student has no reason to reach for, because nothing told him his
 * lever had moved. Under THEO-4 that is the same bare verdict as a silent
 * refusal: the product changed the car under his hand and withheld the why.
 *
 * SAME CHANNEL, SAME GRAMMAR. kind „lesson", no lawRef (this is vehicle
 * operation, not a graded rule of ЗДвП), no new overlay convention — exactly
 * what `reverseStuckHint` and `stuckStartHint` above established. It fires ONCE
 * per lever move, on a deliberate click, so it can never become the popping
 * warning the founder's standing note is about.
 *
 * THE LINE IS THE STATE, NOT THE INSTRUCTION, and that is the one difference
 * from `reverseStuckHint`. There the student was stuck and the line had to be
 * the way out; here nothing is stuck yet — he has just been handed a different
 * car — so the line names what changed («Скоростният лост е на N»), which is
 * the fact he cannot otherwise see, and the WHY carries the gesture. It is 30
 * characters, under the 34 measured as safe for two lines on both portrait
 * profiles.
 */
export function transmissionSwitchHint(
  transmission: TransmissionMode,
  movedSelectorTo: SelectorPosition,
  input: HintInput,
): { titleBg: string; explanationBg: string } {
  if (transmission === "manual") {
    // THE CARD THE WHOLE TIER OPENS WITH, so it is the one that had to stop
    // naming keys: on a phone «Напреднал» begins here, and „Z + ]" was a dead
    // end on the very first sentence of it.
    const gearUp = gearUpWithBg(input, "manual");
    return movedSelectorTo === "N"
      ? {
          titleBg: "Скоростният лост е на N",
          explanationBg: withSheetLocatorBg(
            input,
            `„Напреднал“ е с ръчна скоростна кутия, затова колата ти се подава на неутрална: първа предавка с вдигнат съединител при спряла кола означава угасване. За да тръгнеш, задръж ${clutchObjBg(input)} и включи първа ${gearUp}, после отпускай съединителя плавно и добавяй газ. Стрелката надолу тук е спирачка — за движение назад е R, също със съединител.`,
          ),
        }
      : {
          titleBg: "Скоростният лост е на ръчна кутия",
          explanationBg: withSheetLocatorBg(
            input,
            `„Напреднал“ е с ръчна скоростна кутия и лостът влезе в предавката, която отговаря на скоростта ти. Оттук нататък предавките се сменят от теб: задръж ${clutchObjBg(input)} и мини на следващата ${gearUp} или на по-ниска ${gearDownWithBg(input)}. Стрелката надолу е спирачка — за движение назад е R.`,
          ),
        };
  }
  // Back to an automatic. The round trip (our own D → N undone) never reaches
  // here — the driveline reports no move for it — so this is the M → D/N case:
  // the box the student was working by hand is now working itself.
  return movedSelectorTo === "D"
    ? {
        titleBg: "Скоростният лост е на D",
        explanationBg: withSheetLocatorBg(
          input,
          `Върна се на автоматична кутия: предавките се сменят сами и съединител няма. Просто натисни газта, за да тръгнеш напред. За движение назад спри напълно, вдигни крак от спирачката и я натисни отново — или мини на R ${gearDownWithBg(input)}.`,
        ),
      }
    : {
        titleBg: "Скоростният лост е на N",
        explanationBg: withSheetLocatorBg(
          input,
          `Върна се на автоматична кутия, а двигателят е угаснал, затова лостът е на неутрална — оттам стартерът може да запали. ${capBg(starterActBg(input))}, после премести лоста на D ${gearUpWithBg(input, "automatic")} и потегли.`,
        ),
      };
}

// -- Minimap visibility (founder review 2026-07-28) ---------------------------
// Verbatim: „this minimap of the town is not needed to be on all the time it
// can be used or turned on by pressing a button because currently its eating
// space of the whole view that is not needed."
//
// DEFAULT: OFF. Measured on the founder's device profile (390×844, the review
// device): the 168 px disc is 45 % of the scene's width and sits bottom-right —
// over the road corridor in chase view and over the instrument cluster in
// cockpit view, i.e. exactly on top of the speedometer whose legibility cost
// four review rounds. Nothing depends on it: route guidance is IN THE WORLD
// (ghost ribbon, turn chevrons, objective marker — LessonScene RouteGuidance)
// and the top-down camera (key C) is the real map when one is wanted. So the
// map becomes an on-demand instrument, and the choice is remembered per
// browser: a student who wants it never has to ask twice.
const MINIMAP_STORAGE_KEY = "aidrive.sim.minimap.v1";

function readStoredMinimapOn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MINIMAP_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

// -- The overlay budget (founder review 2026-07-29) ---------------------------
// „not acceptable it is not playable at all" — his screenshots show a „ЗАДАЧА"
// card, a teach card and a red belt warning stacked down the screen before the
// road gets a pixel. modules/sim/hud/overlayQueue.ts holds the rules; these are
// the clocks this shell runs them on.
//
// ANNOUNCE, THEN GET OUT OF THE WAY. The task line is the clearest case: the
// route is already drawn IN THE WORLD (ghost ribbon, turn chevrons, objective
// marker — LessonScene RouteGuidance), so a banner restating it forever is
// furniture. It speaks when the objective changes and retires; „Задача" in the
// micro menu brings it back on demand, for free, whenever the student wants it.
export const TASK_ANNOUNCE_MS = 7000;
/** The advisor's next-action prompt — long enough to read and act on. */
const ADVISOR_ANNOUNCE_MS = 6000;
/** „✓ Задача 2 изпълнена" — a beat of praise, not a panel. */
const PRAISE_ANNOUNCE_MS = 2600;
/** An armed cabin fault gets ONE full line with its WHY when it arms; after
 *  that it is the quiet edge chip again (founder: a warning that keeps popping
 *  „only makes the user nervous"). */
const WARNING_ANNOUNCE_MS = 5000;
/** The two-ribbon colour legend: said once at the start of a guided rung. */
export const LEGEND_ANNOUNCE_MS = 8000;

/**
 * Is `key` still within its announcement window?
 *
 * The KEY is the identity of what is being said (objective index + title,
 * warning set, prompt text). A new key restarts the clock; the same key
 * re-rendered fifty times by the 150 ms HUD poll does not. That is the whole
 * mechanism behind „one line, then the road" — no timers scattered through the
 * component, and nothing that can leave a line stuck on screen.
 */
function useFreshKey(key: string | null, ttlMs: number): boolean {
  const [freshKey, setFreshKey] = useState<string | null>(null);
  useEffect(() => {
    if (key === null) {
      setFreshKey(null);
      return;
    }
    setFreshKey(key);
    const id = window.setTimeout(() => setFreshKey(null), ttlMs);
    return () => window.clearTimeout(id);
  }, [key, ttlMs]);
  return key !== null && freshKey === key;
}

/** A2 practice mode: seconds of pre-drive idling before a gentle hint. */
const PRACTICE_HINT_IDLE_S = 20;
/** How often the practice-idle watchdog checks (ms). */
const PRACTICE_HINT_POLL_MS = 2000;

export interface HudSnapshot {
  phase: LessonSessionState["phase"];
  /** QW10: pre-drive phase — the scene keeps the vehicle stationary. */
  driveLocked: boolean;
  speedKmh: number;
  limitKmh: number;
  gear: number;
  indicator: SimTick["indicator"];
  headlights: SimTick["headlights"];
  seatbeltOn: boolean;
  /** A1: driveline telltales (ignition/selector/parking brake/hazards/fog/
   *  stall) — null until the scene emits the first snapshot. */
  driveline: DrivelineSnapshot | null;
  objectiveTitle: string | null;
  objectiveIndex: number;
  objectiveTotal: number;
  objectiveProgress: number | null;
  preDriveCompleted: PreDriveStepId[];
  preDriveWrongOrder: PreDriveStepId[];
  /** Canonical next pending step while in the pre-drive phase, else null. */
  preDriveNextStepId: PreDriveStepId | null;
  /** „Съветник": the next expected action (pure advisor.ts derivation). */
  advisorPrompt: AdvisorPrompt | null;
  /** Compiled id of the ACTIVE objective, null on the run-out. Carried only so
   *  `heldTaskCapKmh` can tell „the same drill, a different sentence" from „a
   *  different drill" — see `taskCapKmh` below. */
  objectiveId: string | null;
  /** The drill's own speed ceiling for the ACTIVE objective, in km/h, as the
   *  student has been told it — see `taskCapKmhFromPrompt`. `undefined` when
   *  the objective carries no cap, or when nothing is being said (exam mode,
   *  a lawful wait), and the bar then prints the two-number reading it always
   *  printed. */
  taskCapKmh: number | undefined;
  vehicle: { x: number; y: number; headingDeg: number } | null;
  /** A13: live official tally (exam sessions only, null otherwise). */
  examTally: { totalPoints: number; osnovniPoints: number; opasniCount: number } | null;
}

/**
 * ── O51 · THE DRILL'S OWN CEILING, AND WHOSE NUMBER THE BAR MAY PRINT ──────
 *
 * `hud/StatusDashboard.tsx` published `taskCapKmh` and routed the thread here:
 * *„LessonPlayShell.tsx mounts this bar twice … with `limitKmh={snap.limitKmh}`
 * and nothing else, so this arrives `undefined` … one prop at each of those two
 * mounts, from the same `reachZone.maxSpeedKmh` `RouteGuidance.capLineBg`
 * already reads."* This is that thread, and it does NOT pass
 * `params.maxSpeedKmh`, for a reason that was measured rather than argued.
 *
 * THE FRAME O51 WAS FILED ON (`sc-zebra-approach/mobile-right/04-t087s.png`):
 * the instruction says «под 40 км/ч», the В26 disc says 50, the bar said
 * «РЕЖИМ Нормален ≤60 · знакът важи». Three numbers, ascending, and the one the
 * student is billed against is the smallest and the only one with nothing
 * beside it saying so. `sc-vp-stall/pc-wrong/04-t012s.png` is the same reading
 * one lesson over — *„Three different speed targets are on screen … The student
 * has no way to know which number is being graded."*
 *
 * SO A FOURTH NUMBER WOULD HAVE BEEN THE DEFECT, NOT THE FIX. `maxSpeedKmh` on
 * a compiled objective is the GRADER'S TOLERANCE — the author's figure after
 * `scenario/params.ts widenSpeedCap` folded the rung's grace in — and
 * `lessons/advisor.ts spokenCapKmh` exists precisely because that figure may
 * not be spoken to a student. MEASURED over every compiled rung of every
 * template, on this date, by driving `advisorPromptForObjective` and comparing
 * its sentence against `Math.min(maxSpeedKmh, postedLimitKmh)`:
 *
 *   953  capped reachZone objectives in the catalogue
 *   597  where the raw gate and the spoken number agree
 *   144  where the gate is at or above the street's own limit, so the bar stays
 *        silent either way (B58 slack — never printed, doc 87)
 *   212  where the RAW gate is HIGHER than the sentence the student is reading,
 *        by up to 8 km/h — sc-zebra-approach@L1 is bar 45 against card 40, the
 *        very lesson the row was filed on
 *     0  where the raw gate is lower
 *
 * Threading the raw number would therefore have put «Задачата иска ≤45» on the
 * glass beside a card reading «дръж под 40 км/ч» on a quarter of the catalogue:
 * one more unexplained ceiling on the surface whose finding IS unexplained
 * ceilings.
 *
 * WHAT IS THREADED INSTEAD is the number the advisor is speaking right now, so
 * the bar and the card cannot disagree by construction — the bar prints the
 * figure out of the advisor's own sentence, or nothing. Both directions hold
 * and both were measured:
 * the spoken figure is never above the gate (`spokenCapKmh` ends on
 * `Math.min(visible, capKmh)`, and 0 of 953 disagree), so a student who obeys
 * the bar can never be refused by the gate; and it is never below what he was
 * told, so the bar cannot invent a stricter demand than the lesson made.
 *
 * WHY IT IS READ OFF THE SENTENCE. `spokenCapKmh` is module-private in
 * `lessons/advisor.ts` and its fourth source — the template's own pre-grace
 * `maxSpeedKmh` — rides on `AUTHORED_MAX_SPEED_PARAM_KEY`, which
 * `parseObjectiveParams` deliberately drops and `@/modules/sim/lessons` does
 * not export. The advisor's own sentence is the only public carrier of the
 * resolved figure, and its shape is already pinned card-for-card across all 953
 * by `lessons/__tests__/advisor-authored-cap.test.ts`. `__tests__/taskCapThread.test.ts`
 * drives the real catalogue through this function and fails if either the
 * wording or the resolution moves — so the coupling is loud rather than silent.
 * ⚠ ROUTED, so this can stop being a read of prose: export `spokenCapKmh` (or a
 * `advisorCapKmh(session)`) from `lessons/advisor.ts` and call it here instead.
 *
 * THE TAIL, not „a number somewhere". The objective title may itself carry
 * «км/ч» — 40 of 1 575 do (`ObjectiveBanner`'s own census) — and on
 * «Подмини авариралата кола в лентата за движение — под 110 км/ч» a reader that
 * took the first figure would publish the title's number as the gate's.
 *
 * ── TWO RESIDUALS ON THIS ROW, BOTH RAISED AGAINST THE WORDING ABOVE, AND
 *    WHAT WAS DONE ABOUT EACH (2026-08-20) ─────────────────────────────────
 *
 * (1) „THE BAR PRINTS WHAT THE CARD PRINTS" WAS THE WRONG SENTENCE, and the
 *     row it describes is right. `taskCapKmh` is not gated on `advisorOn`,
 *     `advisorDismissed`, `activeQuiz` or `teachQueue`, so with «Съветник»
 *     switched off the roomy card prints nothing and the bar still prints
 *     «задачата иска ≤40». THE CODE IS KEPT AND THE INVARIANT IS RESTATED:
 *     the bar prints the figure out of THE SENTENCE THE ADVISOR IS SAYING, or
 *     nothing — it is not gated on whether that sentence is on the glass.
 *     Decided rather than defaulted, and here is the reason. «Съветник»'s own
 *     control says what it governs: „показва следващото действие и клавиша за
 *     него" — advice about WHAT TO DO NEXT. The drill's ceiling is not advice;
 *     it is the figure the student is being billed against, and O51 was filed
 *     precisely because it was on the glass unlabelled. Hiding it for everyone
 *     who turns coaching off would re-create the filed defect for exactly the
 *     students most likely to be driving unaided, and would fail one of them
 *     for a number nothing on the screen ever named — a false refusal, which
 *     this project weighs the same as a false certificate. The four unlisted
 *     conditions are about the CARD'S OWN SLOT (a modal is over it, the trim
 *     left it empty, this particular card was closed) and none of them is a
 *     statement about what the drill demands. What must NOT happen is the bar
 *     printing a number no sentence contains, and that is what the reader above
 *     makes impossible.
 *
 * (2) THE NUMBER USED TO VANISH AT EVERY GIVE-WAY STOP. `advisorPromptForSession`
 *     lets a live yield OUTRANK the objective (B15-VOICE, correctly: „what am I
 *     supposed to be doing" has a different answer while standing still), and
 *     the wait copy carries no cap tail — so the third number blinked out for
 *     the length of every lawful stop and came back when the car moved off. On
 *     the one surface whose finding was ALREADY „three unstable numbers", that
 *     is a defect even though it needs a full standstill to see. Closed by
 *     `heldTaskCapKmh` below: the ceiling is a property of the ACTIVE
 *     OBJECTIVE, not of whatever the advisor happens to be saying this frame,
 *     so it is held across a prompt that is not speaking about speed and
 *     dropped the instant the objective changes. It is NOT recomputed from
 *     `maxSpeedKmh` — that is the 212-card disagreement above.
 */
export function taskCapKmhFromPrompt(prompt: AdvisorPrompt | null): number | undefined {
  if (prompt === null) return undefined;
  // The exact tail `advisorPromptForObjective` writes for a capped reachZone:
  // `${titleBg} — дръж под ${shown} км/ч`, and nothing else in the advisor's
  // vocabulary ends this way. `[.,]` because Bulgarian copy uses the comma
  // decimal; no shipped card is fractional today (the advisor's own census
  // records 0 of 953) and this is here so one would not be silently dropped.
  const m = /дръж под (\d+(?:[.,]\d+)?) км\/ч$/u.exec(prompt.textBg.trim());
  if (m === null) return undefined;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * O51 residual (2) — THE CEILING BELONGS TO THE OBJECTIVE, NOT TO THE FRAME.
 *
 * `spoken` is what `taskCapKmhFromPrompt` recovered from the sentence the
 * advisor is saying THIS poll. It is `undefined` for a whole family of prompts
 * that are not about speed at all — above everything else the B15-VOICE wait
 * («Изчакай колата отдясно — тя има предимство (чл. 50)»), which OUTRANKS the
 * objective for as long as the student is lawfully standing still. The drill's
 * demand has not changed while he waits; only the sentence has. So the last
 * figure the objective spoke is held until the OBJECTIVE changes, and never
 * across one.
 *
 * BOTH DIRECTIONS, because a hold is a memory and a stale memory prints a
 * number for a drill that no longer asks for it:
 *   · a fresh figure always wins outright — this never smooths a real change;
 *   · a different objective drops it, even to `undefined` — the next rung's
 *     silence is not the previous rung's ceiling;
 *   · the run-out (`activeObjectiveId === null`, every objective done) drops it;
 *   · and an objective that never spoke a cap never acquires one, because
 *     there was nothing to remember in the first place.
 */
export function heldTaskCapKmh(
  spoken: number | undefined,
  activeObjectiveId: string | null,
  prev: { objectiveId: string | null; taskCapKmh: number | undefined } | null,
): number | undefined {
  if (spoken !== undefined) return spoken;
  if (activeObjectiveId === null || prev === null) return undefined;
  return prev.objectiveId === activeObjectiveId ? prev.taskCapKmh : undefined;
}

export function snapshotOf(
  s: LessonSessionState,
  lastTick: SimTick | null,
  driveline: DrivelineSnapshot | null = null,
  /** The snapshot this one replaces — `heldTaskCapKmh`'s only input. */
  prev: HudSnapshot | null = null,
): HudSnapshot {
  const active =
    s.currentObjectiveIndex < s.objectives.length
      ? s.objectives[s.currentObjectiveIndex]
      : null;
  const preDrive = s.preDrive;
  // Derived once: the card and the bar are then two renderings of one string,
  // which is the whole of O51 (see `taskCapKmhFromPrompt`).
  const advisorPrompt = advisorPromptForSession(s);
  return {
    phase: s.phase,
    driveLocked: isDriveLocked(s),
    speedKmh: lastTick?.speedKmh ?? 0,
    limitKmh: lastTick?.maxSpeedKmh ?? 50,
    gear: lastTick?.gear ?? 0,
    indicator: lastTick?.indicator ?? "off",
    headlights: lastTick?.headlights ?? "off",
    seatbeltOn: lastTick?.seatbeltOn ?? false,
    driveline,
    objectiveTitle: s.phase === "driving" && active ? active.spec.titleBg : null,
    objectiveIndex: s.currentObjectiveIndex + 1,
    objectiveTotal: s.objectives.length,
    objectiveProgress:
      active && (active.params.kind === "driveDistance" || active.params.kind === "completeManeuver")
        ? active.progress
        : null,
    preDriveCompleted: preDrive ? [...preDrive.completedStepIds] : [],
    preDriveWrongOrder: preDrive ? [...preDrive.wrongOrderStepIds] : [],
    preDriveNextStepId:
      s.phase === "preDrive" && preDrive
        ? PRE_DRIVE_STEP_ORDER.find((id) => !preDrive.completedStepIds.includes(id)) ?? null
        : null,
    advisorPrompt,
    objectiveId: active?.spec.id ?? null,
    // O51: the sentence's own figure, held across a prompt that is not talking
    // about speed (a lawful wait) and dropped at the objective boundary. The
    // join itself is what a refuter neutralised with a single `undefined` while
    // 1,036 tests stayed green — `__tests__/taskCapThread.test.ts` now drives a
    // real compiled session through `snapshotOf` for exactly that reason.
    taskCapKmh: heldTaskCapKmh(
      taskCapKmhFromPrompt(advisorPrompt),
      active?.spec.id ?? null,
      prev,
    ),
    vehicle: lastTick
      ? {
          x: lastTick.position.x,
          y: lastTick.position.y,
          headingDeg: lastTick.headingDeg,
        }
      : null,
    // A13: the live protocol tally — folded from the session's scored events
    // per the official taxonomy (rules/scoring.ts). Exam sessions only.
    examTally:
      s.lesson.examMode === true
        ? (() => {
            const score = accumulateScore(s.events);
            return {
              totalPoints: score.totalPoints,
              osnovniPoints: score.osnovniPoints,
              opasniCount: score.opasniCount,
            };
          })()
        : null,
  };
}

/**
 * ── THE POLL'S UPDATER, AND WHY IT IS A VALUE RATHER THAN A CLOSURE ────────
 *
 * `snapshotOf`'s fourth argument is the snapshot being replaced, and it is the
 * only thing that carries the drill's ceiling across a lawful stop (see
 * `heldTaskCapKmh`). It used to reach that argument through a closure written
 * at each of the two poll sites — `setSnap((prev) => snapshotOf(…, prev))` —
 * and a closure written inside a component is a thing no `node`-environment
 * test can execute.
 *
 * MEASURED on 2026-08-20, on the tree as it stood, by an adversarial refuter
 * and then again here before this function was written: rewrite BOTH sites as
 * `setSnap(() => snapshotOf(…, null))` and `tsc --noEmit` exits 0 while
 * `queueTaskEcho` + `taskCapThread` + `overlay-queue-moment` + `notify-column`
 * stay green — 4 files, 88 tests — with the hold disabled and the blinking
 * third number back on every give-way stop. Nothing was DELETED: the argument
 * was PINNED to a constant, which satisfies both the type checker and any
 * substring written over the source.
 *
 * So the updater is built HERE and handed to `setSnap` whole. There is no
 * `(prev) =>` left at either site to neutralise, the thread is a pure function
 * `__tests__/taskCapThread.test.ts` drives directly, and what the component
 * passes is checked by that file's AST guard rather than by a `toContain`.
 */
export function hudPollUpdate(
  s: LessonSessionState,
  lastTick: SimTick | null,
  driveline: DrivelineSnapshot | null,
): (prev: HudSnapshot) => HudSnapshot {
  return (prev) => snapshotOf(s, lastTick, driveline, prev);
}

const DEFAULT_QUIZ_FREQUENCY: QuizFrequency = "occasional";

function isQuizFrequency(v: unknown): v is QuizFrequency {
  return v === "off" || v === "occasional" || v === "frequent";
}

function readStoredQuizFrequency(): QuizFrequency {
  // Safe as a lazy useState initializer: this shell mounts client-side only
  // (after the student picks a lesson), so there is no SSR/hydration pass to
  // mismatch — no effect + setState dance needed.
  if (typeof window === "undefined") return DEFAULT_QUIZ_FREQUENCY;
  try {
    const stored = window.localStorage.getItem(MICRO_QUIZ_STORAGE_KEY);
    return isQuizFrequency(stored) ? stored : DEFAULT_QUIZ_FREQUENCY;
  } catch {
    return DEFAULT_QUIZ_FREQUENCY;
  }
}

/** Persisted micro-quiz difficulty (localStorage). */
function useQuizFrequency(): [QuizFrequency, (f: QuizFrequency) => void] {
  const [freq, setFreq] = useState<QuizFrequency>(readStoredQuizFrequency);
  const update = (f: QuizFrequency) => {
    setFreq(f);
    try {
      window.localStorage.setItem(MICRO_QUIZ_STORAGE_KEY, f);
    } catch {
      // Private mode etc. — the in-memory value still applies this session.
    }
  };
  return [freq, update];
}

/**
 * Persisted „Съветник" preference; nothing stored → the lesson-level default
 * (ON for beginner rungs, OFF for level 3+ — advisor.ts). Same lazy-init
 * safety as readStoredQuizFrequency: this shell mounts client-side only.
 */
function readStoredAdvisorOn(lesson: LessonSpec): boolean {
  if (typeof window === "undefined") return defaultAdvisorEnabled(lesson);
  try {
    const stored = parseStoredAdvisorSetting(window.localStorage.getItem(ADVISOR_STORAGE_KEY));
    return stored ?? defaultAdvisorEnabled(lesson);
  } catch {
    return defaultAdvisorEnabled(lesson);
  }
}

// ---------------------------------------------------------------------------
// Viewport hooks — all effect-resolved, never guessed during render.
//
// Every one of these is a browser fact the server cannot know. Guessing one in
// render would be a hydration mismatch; this shell mounts client-side only
// (after a start click), so an effect is both correct and immediate.
// ---------------------------------------------------------------------------

/** Phone-shaped viewport with a thumb on it → the compact, in-canvas HUD. */
function useCompactHud(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const read = () => {
      // The VISIBLE box, not the layout one — same reason as the shell's own
      // geometry (see `useVisualViewportBox`). A zoomed phone reports an
      // `innerWidth` the student cannot see all of, and deciding "is this a
      // phone-shaped screen" from it answers a question nobody asked.
      // `coarsePointer` still gates the whole thing, so a desktop user zooming
      // a page in cannot fall into the thumb layout.
      const vv = window.visualViewport;
      setCompact(
        isCompactViewport(
          vv?.width ?? window.innerWidth,
          vv?.height ?? window.innerHeight,
          window.matchMedia?.("(pointer: coarse)").matches === true,
        ),
      );
    };
    read();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", read);
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    return () => {
      vv?.removeEventListener("resize", read);
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
    };
  }, []);
  return compact;
}

/**
 * Installed-app mode. Both spellings on purpose: `display-mode: standalone` is
 * the standard one, `navigator.standalone` is the ONLY one iOS Safari has
 * reported truthfully for a Home-Screen launch for a decade. The parallel
 * installability lane is what removes the founder's ~19 % of Safari chrome;
 * this is how this screen finds out that it happened.
 */
function useStandaloneDisplay(): boolean {
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(display-mode: standalone)") ?? null;
    const legacy = (window.navigator as { standalone?: boolean }).standalone === true;
    const read = () => setStandalone((mq?.matches ?? false) || legacy);
    read();
    mq?.addEventListener?.("change", read);
    return () => mq?.removeEventListener?.("change", read);
  }, []);
  return standalone;
}

/**
 * The height the shell may actually use, in px — and why `100dvh` is not it.
 *
 * FOUNDER FRAME #3, verbatim reading of the pixels: something is cut off BELOW
 * the fold — the gear/pedal UI runs past the visible area. That is the classic
 * iOS Safari trap. A `position: fixed; inset: 0` element resolves against the
 * LAYOUT viewport, which on iOS is the *large* viewport (toolbars retracted);
 * with the toolbars actually on screen, the bottom of that element is behind
 * them. `dvh` is better but still a resolved-at-layout-time number that lags
 * the toolbar animation, and Safari has shipped several versions where it
 * simply disagrees with what the user can see.
 *
 * `visualViewport.height` is the one number that is always exactly what the
 * student can see, updated during the toolbar animation itself. The shell
 * publishes it as `--sim-vh` and uses it for its own height, so nothing it
 * lays out can ever be under browser chrome. `null` until measured (and on
 * engines without the API) → the CSS `100dvh` fallback stands.
 *
 * ── 2026-08-14: THE OTHER THREE AXES, AND WHY HEIGHT ALONE WAS NOT ENOUGH ───
 *
 * The founder photographed the simulator on his own iPhone 16 Pro with the
 * interface CUT ON BOTH EDGES AT ONCE — «ЕНЮ» sliced on the left and «Л ЛЯВО»
 * sliced on the right in the same frame, and «Завърти телефона хоризонтално»
 * broken into «авърт / елефон / изонта». Content clipped on BOTH sides is
 * never overflow; it is a box wider than the window, centred in it.
 *
 * This hook read `height` and nothing else. So the shell was:
 *      height ← visualViewport      (correct, and it is why nothing was ever
 *                                    cut at the TOP or BOTTOM)
 *      width  ← `w-full`            }  the LAYOUT viewport, which under zoom
 *      left   ← `left-0`            }  is the box the student CANNOT fully see
 *
 * Under a pinch the visible window is [offsetLeft, offsetLeft + width] while
 * the shell still spans [0, layoutWidth]. Both ends hang off the screen. §I6
 * already suppresses new pinches on the canvas and was right to, but Safari
 * stores zoom PER SITE: one accidental pinch anywhere in the product — the
 * lesson list, the dashboard, a theory screen where pinch is deliberately
 * allowed for minors reading legal text — and every later simulator session
 * opens already zoomed. That is why his frames looked wrong "from the start"
 * and why suppression alone could never have fixed them.
 *
 * There is no API to reset browser zoom, and Safari has ignored
 * `user-scalable` / `maximum-scale` since iOS 10 — so the shell cannot undo
 * it. What it CAN do is follow the window: track all four numbers and the
 * scale, and the HUD stays on screen at 80 %, at 115 %, under iOS Display
 * Zoom, under Dynamic Type and mid-pinch. Adapting to the student's chosen
 * zoom is also the only accessible answer; overriding it would take the
 * setting away from the person who needs it most.
 */
type VisualViewportBox = {
  /** Visible height in CSS px. */
  h: number;
  /** Visible WIDTH in CSS px — under zoom this is < `window.innerWidth`. */
  w: number;
  /** Left edge of the visible window within the layout viewport. */
  left: number;
  /** Top edge of the visible window within the layout viewport. */
  top: number;
  /** 1 when unzoomed. > 1 means the student is looking at part of the page. */
  scale: number;
};

function useVisualViewportBox(active: boolean): VisualViewportBox | null {
  const [box, setBox] = useState<VisualViewportBox | null>(null);
  useEffect(() => {
    if (!active) return;
    const read = () => {
      const vv = window.visualViewport;
      // Round DOWN on the sizes: half a pixel of overshoot is a scrollbar or a
      // 1 px sliver of the page showing under the shell. Round the OFFSETS to
      // nearest — they are a position, not an extent, and flooring a pan makes
      // the shell trail the window by a pixel on every scroll event.
      setBox({
        h: Math.floor(vv?.height ?? window.innerHeight),
        w: Math.floor(vv?.width ?? window.innerWidth),
        left: Math.round(vv?.offsetLeft ?? 0),
        top: Math.round(vv?.offsetTop ?? 0),
        scale: vv?.scale ?? 1,
      });
    };
    read();
    const vv = window.visualViewport;
    // `scroll` matters as much as `resize` here: a pinch changes the size, but
    // PANNING the zoomed page changes only the offsets, and that is the half
    // that decides whether the left rail is on the screen.
    vv?.addEventListener("resize", read);
    vv?.addEventListener("scroll", read);
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    return () => {
      vv?.removeEventListener("resize", read);
      vv?.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
    };
  }, [active]);
  return box;
}

function QuizFrequencySelector({
  value,
  onChange,
}: {
  value: QuizFrequency;
  onChange: (f: QuizFrequency) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Въпроси по време на карането"
      className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1"
      title="Колко често изникват учебни въпроси по време на карането"
    >
      <span className="px-1.5 text-[10px] font-bold uppercase tracking-wide text-muted">
        Въпроси
      </span>
      {MICRO_QUIZ_FREQUENCIES.map((f) => {
        const active = f.id === value;
        return (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(f.id)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition motion-reduce:transition-none ${
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            {f.labelBg}
          </button>
        );
      })}
    </div>
  );
}

/**
 * HOW MANY OF THESE ROWS ARE BELOW THE FOLD — pure arithmetic, like
 * `playArea.ts`: the card measures, this decides.
 *
 * It is a function and not four lines inside a `useEffect` for one reason —
 * jsdom has no layout, so every offset it could read is 0, and a counter tested
 * through the DOM would pass whatever it did. The geometry comes from the
 * browser; the RULE is testable here with real numbers.
 *
 * @param rows  each row's `offsetTop` and `offsetHeight`, in list coordinates.
 * @param scrollTop / clientHeight  the list's own scroll viewport.
 *
 * A row counts when its BOTTOM is past the fold — that is, when it cannot be
 * read to the end without scrolling. A half-visible step IS counted, and
 * deliberately: on the frame this fix was built from, step 9 was sliced through
 * its x-height and step 10 was absent, and «↓ още 2» is the true statement
 * there. Counting only fully-hidden rows would have said «още 1» while the
 * student was staring at the severed half of a sentence — the original defect
 * with a number next to it.
 *
 * The 1 px slack is for fractional line boxes — at a `leading-tight` 11 px face
 * the bottoms land on .5 px, and an exact `>` reported a phantom extra step on
 * every second resize.
 */
export function rowsBelowFold(
  rows: ReadonlyArray<{ top: number; height: number }>,
  scrollTop: number,
  clientHeight: number,
): number {
  // The rows must be in the LIST's own scroll coordinates. `listRowsInScrollCoords`
  // is the only supported way to produce them — see the defect at its header.
  // A list that has not been laid out yet (clientHeight 0) is not a list that
  // is overflowing — it is one nothing is known about, and guessing „everything
  // is hidden" would flash «още 10» on every mount.
  if (clientHeight <= 0) return 0;
  const fold = scrollTop + clientHeight;
  return rows.filter((r) => r.top + r.height > fold + 1).length;
}

/**
 * …AND HOW MANY OF THEM THE STUDENT HAS NOT SEEN A PIXEL OF — the other
 * question, and the one that decides which SENTENCE the fold row says.
 *
 * WHY IT EXISTS. `rowsBelowFold` counts a row the moment its bottom crosses the
 * fold, which for the briefing's STEPS is exactly right: a step you cannot read
 * to the end is a step you have not read. Said about the toast column it turns
 * into a different claim. „↓ още 1 известие" over a single graded fault whose
 * body is cut in half reads as „there is a SECOND notification below" — and
 * there is not; what is below is the rest of the sentence on the glass. Before
 * the shrink-weight repair at `data-hud-toast-scroller` that case produced no
 * row at all, so the wording never had to answer for it; the repair makes it
 * the COMMON case, and a counter that arrives lying is worse than the silence
 * it replaced.
 *
 * THE BIAS IS DELIBERATE AND IT IS TOWARD COUNTING. A row that starts within
 * 1 px above the fold is called fully hidden. Getting it wrong that way costs
 * „още 1 известие" where „обяснението продължава" would have been kinder;
 * getting it wrong the other way would announce a continuation while a WHOLE
 * second graded fault sits under the cut unmentioned, which is the one direction
 * a fault column may never round in.
 */
export function rowsFullyBelowFold(
  rows: ReadonlyArray<{ top: number; height: number }>,
  scrollTop: number,
  clientHeight: number,
): number {
  if (clientHeight <= 0) return 0;
  const fold = scrollTop + clientHeight;
  return rows.filter((r) => r.top > fold - 1).length;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * …AND THE ROWS HAVE TO BE IN THE LIST'S COORDINATES — 2026-08-18.
 *
 * `rowsBelowFold` was fed `li.offsetTop`, against `scrollTop` and
 * `clientHeight` read off the `<ol>`. Those are two different origins.
 *
 * `offsetTop` is measured from the element's OFFSET PARENT, and the `<ol>` is
 * not one: it is statically positioned, so the walk continues up to the
 * BriefingCard root — an element with `backdrop-blur`, which both engines treat
 * as an offset parent. So every row arrived carrying the card's own header band
 * on top of it: `py-1.5` (6 px) + the «ИНСТРУКЦИИ» / ✕ row + the list's `mt-1`
 * (4 px) ≈ 25 px at the shipped classes, against a 30 px step.
 *
 * WHAT THAT DOES, AND IT IS NOT A ROUNDING. The offset is added to every row's
 * top and to nothing else, so the fold appears ~25 px earlier than it is:
 *
 *   · on the frame this row was built from (sc-ac-bridge-ice, ten steps, fold
 *     at 250) the counter said «↓ още 3» where two steps are hidden;
 *   · and on a briefing that FITS — the state the sibling test calls „the
 *     affordance is not permanent chrome" — the true count is 0 while this
 *     returns the number of rows whose bottom lies within 25 px of the end,
 *     i.e. ONE, on every briefing in the catalogue. The badge the sweep filed
 *     twice for covering the sentence it was counting was therefore on the
 *     whole time, and the test that guards against exactly that passed, because
 *     it tests the RULE with numbers the component never actually hands it.
 *
 * So the reading stops depending on what an offset parent happens to be.
 * `getBoundingClientRect` is in viewport coordinates for both the rows and the
 * list, so their difference is the row's offset inside the list's viewport, and
 * `+ scrollTop` puts it back into the scroll content the fold is measured in.
 * Pure, and therefore held by a test rather than by this paragraph.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function listRowsInScrollCoords(
  listTop: number,
  scrollTop: number,
  rowRects: ReadonlyArray<{ top: number; height: number }>,
): Array<{ top: number; height: number }> {
  return rowRects.map((r) => ({ top: r.top - listTop + scrollTop, height: r.height }));
}

/** The 3.5 rem the notification column keeps clear ABOVE the instrument band,
 *  so the last card in it never sits on the band's own top edge. */
const NOTIFY_COLUMN_BAND_GUTTER_PX = 56;

/**
 * How tall the right-edge notification column may be, given where it starts.
 *
 * The arithmetic behind the right-edge column's `max-height`, pulled out of the
 * style object because a `calc()` string cannot be asserted about.
 *
 * ⚠ THE COLUMN'S OWN `data-hud` NAME MAY NOT BE WRITTEN IN THIS COMMENT, and
 * the first draft of it was: `thumb-band-clearance.test.ts` (N4) finds that
 * name with `indexOf` and reads 260 characters forward looking for the stacking
 * order, so a paragraph up here that merely QUOTES it becomes the anchor. The
 * first draft turned N4 red; a draft that ALSO quoted what N4 searches for
 * would have turned it green while the real declaration went unguarded, which
 * is the worse of the two. The same rule is written beside the JSX, and
 * `shellClipAffordances.test.ts` now checks that the anchor is inside the
 * component rather than in a module-level paragraph.
 *
 * See the block at that declaration for the measurement; the short version is
 * that `max-height` counts from the element's TOP, so a cap written as
 * „the stage minus the band" only stops above the band for a column anchored
 * at 0 — and this one is anchored at the interior mirror's lane.
 *
 * @param stageHeightPx  the `[data-sim-stage]` box the column is positioned in
 * @param columnTopPx    the resolved `top` — 164 px on the 1165 × 650 stage
 */
export function notifyColumnCapPx(stageHeightPx: number, columnTopPx: number): number {
  return Math.max(
    0,
    stageHeightPx - columnTopPx - ROOMY_HUD_FLOOR_PX - NOTIFY_COLUMN_BAND_GUTTER_PX,
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HOW MANY PIXELS OF THE GRADED FAULT THE COLUMN CUTS — „the separate defect,
 * routed below" that the cap's own comment names and nothing ever routed.
 *
 * SEVEN BROKEN FINDINGS, ONE SENTENCE. sweep 161, roomy leg, every one of them
 * about the LAST card in the notification column:
 *
 *   sc-pk-ban-stop/pc-wrong/04-t023s   — «the ОПАСНА ГРЕШКА card is cut off by
 *     the bottom edge of the simulator viewport IN MID-SENTENCE … The student is
 *     shown half a sentence about a 10-point dangerous error.»
 *   sc-sp-limit-end/pc-wrong/04-t017s  — «the violation card that explains the
 *     dangerous error is cut off … The one card that carries the „why" is the
 *     one that cannot be read to the end.» (Verified by eye: the last visible
 *     line is «означава директно неиздържан» with the glyph tops of «изпит»
 *     sliced through, on a −10 ОПАСНА ГРЕШКА.)
 *   plus sc-sp-eco-coast, sc-sp-wet-limit-plate, sc-vu-emergency,
 *   sc-merge-from-property and sc-ln-obstacle-meeting, in the same words.
 *
 * THE MECHANISM IS FLEXBOX, AND IT IS DELIBERATE UP TO THE LAST STEP. The
 * column is `overflow-hidden` under `notifyColumnCapPx`. Of its children only
 * `BriefingCard` carries `min-h-0`, so it is the only one that CAN shrink — and
 * that yield order is correct and argued for at the card („a graded fault, or the
 * task itself, must never be the thing that yields to a briefing the student has
 * already read"). What was never written is what happens AFTER the briefing has
 * given up everything it has: flexbox freezes every remaining item at its content
 * height, the column overflows, and `overflow-hidden` takes the difference out of
 * the LAST child — the toast stack. Silently. Mid-word.
 *
 * MEASURED ON THE SWEEP'S OWN STAGE (1165 × 650 at 1440 × 900 `?chrome=dashboard`,
 * column top 164 ⇒ cap 322): objective banner 52 + two 240 px fault cards +
 * 2 × 6 px of `gap-1.5` = 544, against 322. **222 px cut** — the whole of the
 * second card and a third of the first. `visibleToasts` shows two cards by
 * design (one in „по-тихи известия"), so this is not an edge case, it is the
 * ordinary state of a lesson where two things went wrong.
 *
 * THE FIX IS NOT „SHOW FEWER CARDS" — dropping a graded fault to make the box
 * fit is the false certificate this audit exists to find. The toast stack becomes
 * the column's LAST-RESORT yielder: it scrolls, with the painted bar the product's
 * other three HUD scrollers use and a counted „↓ още N" row outside it, so nothing
 * is ever cut and nothing is ever hidden in silence. This function is the
 * measurement, kept as arithmetic so the test can watch both directions.
 *
 * @param capPx           `notifyColumnCapPx` for the stage
 * @param unshrinkablePx  the children that keep `min-height: auto` — the
 *                        objective banner and the advisor card
 * @param toastStackPx    natural height of the toast stack
 * @param gapsPx          the column's own `gap-1.5` between the children present
 * ═══════════════════════════════════════════════════════════════════════════
 */
// …AND THE ARITHMETIC ITSELF IS GONE — 2026-08-26.
//
// `notifyColumnCutPx(capPx, unshrinkablePx, toastStackPx, gapsPx)` returned the
// overflow in pixels, and it was never called by anything: declaration, two
// mentions in comments, one describe block in `shellClipAffordances.test.ts`.
// Everything above this line is worth keeping and none of it needs the
// function, because THE FIX IS NOT A MEASUREMENT — it is the CSS four hundred
// lines down: `min-h-0` on the toast scroller plus a shrink weight of 1, which
// makes the stack the column's last-resort yielder so the deficit is absorbed
// by SCROLLING instead of by `overflow-hidden` guillotining the last card. That
// shipped, it is live on every lesson, and it is what the seven findings above
// were closed against.
//
// A runtime consumer would also have been the wrong shape. The deficit this
// computed is exactly what flexbox already resolves during layout, so a React
// re-implementation of it could only ever be a second opinion about a number
// the engine had already acted on — and the affordance the student needs
// («↓ още N») is counted in CARDS off the painted DOM by `measureToastFold`,
// not in pixels off an arithmetic model of it.

/**
 * Sub-pixel slack for `scrollRemainingPx`, px. Fractional line boxes stack, so
 * a scroller the student HAS read to the end reports 1–3 px left over on both
 * engines; 4 px is past that and still well under one 11 px line, which is the
 * smallest thing that could be a lost sentence.
 */
export const SCROLL_REMAINING_SLACK_PX = 4;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE DEBRIEF SCROLLED IN SILENCE — sweep 161, sc-vu-emergency-junction and
 * sc-vu-pass-clearance, both platforms.
 *
 * «The debrief card is clipped by the play-area viewport with no visible
 * scroll affordance. On PC the protocol table is cut immediately below «Общо
 * (допустими 9)», so the per-objective list — the only honest statement of
 * what was and was not credited — is off-screen.» And on the other lesson the
 * sentence explaining what the stars measure is severed mid-word.
 *
 * THIS IS THE ONE SURFACE WHERE CREDIT IS READ. The task chip goes 2/2 → null
 * on session end whether or not anything ticked; the toast is gone in eight
 * seconds. The debrief is the statement of record, and a student who does not
 * know it continues below the fold has been shown a number and nothing else —
 * which is the bare verdict doc 64 THEO-4 forbids, on the screen that matters
 * most.
 *
 * WHY A SCROLLBAR IS NOT THE ANSWER ON ITS OWN. `OVERLAY_SCRIM_CLASS` has
 * carried `overflow-y-auto` since §I20 and carried it on the frames above, so
 * the content was always REACHABLE. What it was not is ANNOUNCED: WebKit — the
 * founder's engine — paints an overlay bar that exists only during a scroll,
 * and the sweep's own harness runs Chromium with `--hide-scrollbars`, so
 * neither the student nor the instrument could see one. A measured sentence is
 * true on every engine and in every screenshot.
 *
 * Same shape as `rowsBelowFold`: `clientHeight <= 0` is „not laid out yet",
 * not „everything is hidden" — otherwise the pill flashes on every mount.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function scrollRemainingPx(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
): number {
  if (clientHeight <= 0) return 0;
  const left = scrollHeight - clientHeight - scrollTop;
  return left <= SCROLL_REMAINING_SLACK_PX ? 0 : Math.round(left);
}

/**
 * THE ADVISOR MAY NOT RE-READ THE TASK CHIP ALOUD — 2026-08-17.
 *
 * The same rule `hud/overlayQueue.ts` states for the briefing card („THE CARD
 * MAY NEVER PRINT THE SAME SENTENCE TWICE"), applied to the other pair that
 * was doing it. The sweep filed it five times — vp-telltale-red, ac-highbeam-
 * lead, ac-fog, ov-solid-line, rx-barrier-drop — and the frames are identical
 * in shape. Read off `sc-ac-bridge-ice/pc-right/01-arrival.png`, the two cards
 * are 30 px apart in the same column:
 *
 *   ObjectiveBanner  «ЗАДАЧА 1/3  Вдигни крака от газта ПРЕДИ близките устой»
 *   AdvisorCard      «Вдигни крака от газта ПРЕДИ близките устой — дръж под
 *                     35 км/ч»
 *
 * WHY IT IS A RENDER BUG AND NOT A CONTENT BUG. `advisor.ts` is right to build
 * the sentence it builds: `advisorPromptForObjective` is a PURE function with
 * one job — say what to do now — and for a `reachZone` the answer genuinely is
 * the objective plus its cap (and for a capless one it is the objective,
 * verbatim: `{ textBg: titleBg }`). It has no idea a banner is already printing
 * the title 30 px above. Only the shell knows both, so only the shell can
 * decide, and it decides here rather than in JSX so a test can hold it.
 *
 * WHAT SURVIVES THE TRIM IS THE PART THAT WAS NEW. The cap is the coachable
 * half — it is the number the student is being graded against and it appears
 * nowhere else on the glass — so the card keeps it and drops the echo. When
 * nothing is left, there is no card: a panel whose entire content is a sentence
 * already on screen is not a quieter duplicate, it is a duplicate.
 *
 * Returns null → render no advisor card at all.
 */
export function advisorEchoTrim(
  promptTextBg: string,
  objectiveTitleBg: string | null,
): string | null {
  const prompt = promptTextBg.trim().replace(/\s+/g, " ");
  if (prompt === "") return null;
  const title = (objectiveTitleBg ?? "").trim().replace(/\s+/g, " ");
  // No objective on the banner → nothing is being echoed, so nothing is trimmed.
  if (title === "" || !prompt.startsWith(title)) return promptTextBg;
  const rest = prompt.slice(title.length);
  // ── THE PREFIX MUST END ON A BOUNDARY, AND THIS COST A SHIPPED FRAGMENT ───
  //
  // Caught by `briefingOverflow.test.tsx` before it left the branch, on the
  // pair («Спринтирай до края», «Спри»): a bare `startsWith` is true there, and
  // the card rendered «нтирай до края» — a sentence cut through a word, in the
  // instructor's voice, which is a worse defect than the duplicate this
  // function exists to remove. An echo is the WHOLE title followed by the end
  // of the string or by a separator; anything else is a different sentence that
  // merely begins with the same letters.
  if (rest !== "" && !/^[\s—–·,:;.!?-]/.test(rest)) return promptTextBg;
  // The separator `advisor.ts` writes is " — " (U+2014). The others are here
  // because a prefix match that leaves punctuation stranded («— дръж под…»
  // with the dash still attached) reads as a fragment too.
  const trimmed = rest.replace(/^[\s—–·,:;.!?-]+/, "");
  return trimmed === "" ? null : trimmed;
}

/**
 * ── O54 · WHICH OF THE TWO QUEUE ROWS OWNS THE OBJECTIVE'S SENTENCE ────────
 *
 * `advisorEchoTrim` above settled the ROOMY pair (banner keeps the sentence,
 * the advisor card keeps what was new). This settles the same question for the
 * phone, where there is no banner and the queue is the only voice — see the
 * `advisorCoachesTask` block in the component for the frames and for what the
 * old arrangement actually cost.
 *
 * IT IS A FUNCTION AND NOT THREE LINES IN THE RENDER, for the reason
 * `advisorEchoTrim` gives one screen up: „only the shell knows both, so only the
 * shell can decide, and it decides here rather than in JSX so a test can hold
 * it." A source-text assertion over a JSX ternary is the shape this repo has
 * been burned by (§2.1 C5 — eight tests asserting over comment-stripped source,
 * and killing the code they guarded left 867 green). `__tests__/queueTaskEcho.test.ts`
 * drives THIS function.
 *
 * `promptTextBg` is null when the advisor has nothing to say OR is not allowed
 * to. That gate is `advisorTaskFold` below, and this function does not apply
 * it — the split is deliberate: the ECHO decision is about two strings and
 * nothing else, and the permission decision is about the student's settings.
 *
 * ⚠ CORRECTION, 2026-08-20. This paragraph used to read „it is the same gate
 * the roomy card is mounted behind". IT IS NOT, and the claim was measured
 * before it was removed: the `AdvisorCard` mount below carries NINE conditions
 * (`advisorOn`, `!examMode`, `!mistakeMode`, `!ended`, `activeQuiz === null`,
 * `teachQueue.length === 0`, `advisorPrompt !== null`, `advisorTextBg !== null`,
 * `textBg !== advisorDismissed`) and the fold uses the first four. The last five
 * are all about the ROOMY CARD'S OWN SLOT — a modal is over it, the trim left it
 * empty, the student closed this particular card — and none of them is a reason
 * to withhold the coaching from the task row on a phone, which has no such slot
 * and no such ✕. Two readings on purpose, then, and this is the note that says
 * so; what must never be two readings is `advisorOn`/exam/sandbox/ended, and
 * `advisorTaskFold` is the one place those four are read.
 */
export function foldAdvisorIntoTask(
  promptTextBg: string | null,
  objectiveTitleBg: string | null,
): { advisorSpeaks: boolean; taskDetailBg: string | null } {
  if (promptTextBg === null) return { advisorSpeaks: false, taskDetailBg: null };
  const trimmed = advisorEchoTrim(promptTextBg, objectiveTitleBg);
  // `advisorEchoTrim` returns the prompt UNCHANGED when the banner's sentence
  // is not in it, so identity is exactly „this is a different sentence" — and
  // then the advisor keeps its own row, at its own priority. A wait, a
  // roundabout phase and a pre-drive step all land here.
  if (trimmed === promptTextBg) return { advisorSpeaks: true, taskDetailBg: null };
  // Otherwise the sentence is the task's. The advisor does not get a row at all
  // (not built — not built and out-ranked, not built and hidden), and whatever
  // survived the title being stripped off rides with the task as its detail.
  // `null` here is the pure-duplicate case: there was nothing but the echo.
  return { advisorSpeaks: false, taskDetailBg: trimmed };
}

/**
 * ── O54 · THE GATE, WHICH USED TO LIVE IN A TERNARY NOBODY COULD TEST ──────
 *
 * WHAT IT DECIDES, and it is not what the comment it replaces said it decided.
 * MEASURED on 2026-08-20 by reverting each half and reading what moved:
 *
 *   · the ADVISOR ROW (queue row 6) does not change. It is already gated on
 *     `advisorFresh`, and `advisorKey` is null unless
 *     `compact && advisorOn && !examMode && !mistakeMode && !ended`, so
 *     `useFreshKey` returns false and the row was never built. Deleting these
 *     four conditions moves nothing on that row, and a refuter who read the
 *     comment as „this is what suppresses the compact advisor row" would be
 *     reading a claim that was never true.
 *   · the TASK ROW'S DETAIL does change, and that IS the side door the comment
 *     names. `taskDetailBg` is the advisor's remainder printed under the task
 *     line by `SimOverlay` (THEO-4 row 2b). Without this gate a student who
 *     turned «Съветник» off still reads «дръж под 40 км/ч» under every task
 *     line, on a control whose own tooltip promises to stop „следващото
 *     действие и клавиша за него" — coaching arriving under a different roof.
 *
 * SO EACH OF THE FOUR, and what it is actually worth, because three of them
 * would otherwise look like decoration:
 *
 *   advisorOn     LIVE. The only one a student can operate, and the only one
 *                 with an observable effect today.
 *   examMode      Belt-and-braces ACROSS A MODULE BOUNDARY.
 *                 `advisorPromptForSession` already opens with
 *                 `if (s.lesson.examMode === true) return null`, so the prompt
 *                 is null on an exam and this changes nothing TODAY. It is kept
 *                 because it is a candidate reading the answer key: the cost of
 *                 the redundancy is one `&&`, and the cost of relying on
 *                 another module's first line is a coached exam.
 *   mistakeMode   LIVE, and it guards a real mismatch: in the THEO-3 sandbox
 *                 `taskLineBg` is `lesson.descriptionBg`, while the fold trims
 *                 against `snap.objectiveTitle`. Ungated, the detail would be
 *                 the remainder of a DIFFERENT sentence from the one on the
 *                 line above it — and `itemEchoesLine` cannot see that, because
 *                 both halves would be honest strings that simply do not belong
 *                 together. (`advisorTaskRows` re-states this as an invariant.)
 *   ended         Redundant today by the same route as `examMode`: `taskKey` is
 *                 null when `ended`, so row 7 is not built and there is nothing
 *                 to carry a detail. Kept for the same reason.
 *
 * `__tests__/queueTaskEcho.test.ts` drives THIS function, one assertion per
 * condition, each with the negative control that fails if the condition is
 * simply always-false.
 */
export interface AdvisorTaskGate {
  /** The session's own next-action prompt — `snap.advisorPrompt`. */
  advisorPrompt: AdvisorPrompt | null;
  /** What the banner/task line is already saying — `snap.objectiveTitle`. */
  objectiveTitleBg: string | null;
  /** «Съветник» вкл./изкл. */
  advisorOn: boolean;
  examMode: boolean;
  /** THEO-3 „направи грешката" sandbox. */
  mistakeMode: boolean;
  ended: boolean;
}

export function advisorTaskFold(gate: AdvisorTaskGate): {
  advisorSpeaks: boolean;
  taskDetailBg: string | null;
} {
  const mayCoach =
    gate.advisorOn && !gate.examMode && !gate.mistakeMode && !gate.ended;
  return foldAdvisorIntoTask(
    mayCoach ? (gate.advisorPrompt?.textBg ?? null) : null,
    gate.objectiveTitleBg,
  );
}

/**
 * ── O54 · THE TWO QUEUE ROWS, BUILT WHERE A TEST CAN HOLD THEM ─────────────
 *
 * WHY THIS IS A FUNCTION AND NOT THE TERNARY IT REPLACES. The ternary was
 * `advisorFresh && snap.advisorPrompt !== null && advisorFold.advisorSpeaks`
 * inside the candidate array, and the only thing guarding it was a `toContain`
 * over the component's source text. MEASURED on 2026-08-20, before this
 * function existed: appending `|| true` to that expression left **all four**
 * neighbouring suites green — including the block titled „the render is wired
 * to `foldAdvisorIntoTask` and to nothing else" — because the required
 * substring is still there with `|| true` after it. A grep catches DELETION and
 * not NEUTRALISATION, and the neutralisation restores O54 exactly: the advisor
 * row is rebuilt for the task's own sentence, out-ranks it 30 > 20 at equal
 * AMBIENT rank, and the «Задача N/M» counter is dropped uncounted.
 *
 * So the decision moved out of JSX, which is this file's own standing answer
 * (`advisorEchoTrim`: „only the shell knows both … and it decides here rather
 * than in JSX so a test can hold it") and the shape that closed the same defect
 * for `hud/dashboardStatus.ts` two rounds ago. What is left at the call site is
 * a spread with no boolean in it.
 *
 * THE INVARIANT THE PAIR EXISTS FOR, and it is stronger than „no echo":
 * `taskDetailBg` is the remainder of `lineBg`. `itemEchoesLine` can only see
 * the case where the two are the SAME sentence; it cannot see the case where
 * they are two DIFFERENT sentences (the mistake-mode mismatch named in
 * `advisorTaskFold`). So the caller passes `objectiveTitleBg` to the fold and
 * `taskLineBg` to this builder, and when they disagree the fold's gate has
 * already made the detail null. Asserted from the outside in
 * `__tests__/queueTaskEcho.test.ts` („the detail is a remainder of the line it
 * is printed under").
 */
/**
 * THE BINDING HALF — every field of it derived by `lessonQueueBinding` below,
 * and NONE of it written at the call site.
 *
 * It was one interface with the freshness flags mixed in, and the render built
 * the whole thing field by field. That is the shape the 2026-08-20 refuter went
 * through: `fold: advisorFold` → `fold: { advisorSpeaks: true, … }` restores O54
 * verbatim, type-checks, and matches every substring written over the source.
 * The two halves are separated so the derived half can arrive as ONE value the
 * component does not get to re-type.
 */
export interface AdvisorTaskRowsInput {
  /** The answer from `advisorTaskFold` — not re-derived here. */
  fold: { advisorSpeaks: boolean; taskDetailBg: string | null };
  advisorPrompt: AdvisorPrompt | null;
  /** `useFreshKey`'s key, reused as the item id so a change re-announces. */
  taskKey: string | null;
  taskLineBg: string | null;
  objectiveIndex: number;
  objectiveTotal: number;
  mistakeMode: boolean;
}

/**
 * THE HOOK HALF — the four values that only exist once React has run, and the
 * only thing the render still hands over itself. Each is a TTL/animation fact
 * (`useFreshKey`, the praise flash), never a decision about who may coach.
 */
export interface AdvisorTaskFreshness {
  /** `useFreshKey(advisorKey)` — false whenever the advisor may not speak. */
  advisorFresh: boolean;
  praiseFresh: boolean;
  taskFresh: boolean;
  flash: ObjectiveFlash | null;
}

/**
 * THE TASK ROW'S ANNOUNCE KEY — and why the COACHING is part of it.
 *
 * `useFreshKey` re-announces when this string changes and only then. The detail
 * is in it because a coaching change under an UNCHANGED objective (a wait ends,
 * a roundabout phase turns over) would otherwise be printed silently into a
 * card that is already past its TTL — and the only other producer that could
 * say it is the advisor row O54 deleted. That is the second producer growing
 * back, so the key is the thing that stops it.
 *
 * Extracted for the same reason as its two neighbours: what stood here was a
 * template literal in the component, and the only assertion on it was a
 * `toContain` over the file's own source text.
 */
export function taskAnnounceKey(input: {
  compact: boolean;
  ended: boolean;
  taskLineBg: string | null;
  objectiveIndex: number;
  objectiveTotal: number;
  taskDetailBg: string | null;
  /** The micro-menu recall counter — a re-tap re-announces the same line. */
  taskPing: number;
}): string | null {
  if (input.compact !== true || input.ended) return null;
  if (input.taskLineBg === null || input.taskLineBg === "") return null;
  return `task:${input.objectiveIndex}/${input.objectiveTotal}:${input.taskLineBg}:${input.taskDetailBg ?? ""}:${input.taskPing}`;
}

export function advisorTaskRows(
  input: AdvisorTaskRowsInput,
  fresh: AdvisorTaskFreshness,
): [SimOverlayItem | null, SimOverlayItem | null] {
  const { advisorPrompt } = input;
  // 6. „Съветник" — the next expected action, when it changes.
  //    O54: …and never the TASK'S OWN SENTENCE. `advisorSpeaks` is false
  //    exactly when this row would repeat the line row 7 carries, and the
  //    coaching has already been handed to that row as its detail. The row is
  //    not built, rather than built and out-ranked or built and hidden — see
  //    `foldAdvisorIntoTask`.
  const advisorRow: SimOverlayItem | null =
    fresh.advisorFresh && advisorPrompt !== null && input.fold.advisorSpeaks
      ? {
          id: `advisor:${advisorPrompt.textBg}`,
          kind: "advisor",
          tone: "neutral",
          lineBg:
            advisorPrompt.keys.length > 0
              ? `${advisorPrompt.textBg} (${advisorPrompt.keys.join(" ")})`
              : advisorPrompt.textBg,
        }
      : null;

  // 7. The objective, announced and then retired to the micro menu.
  const taskRow: SimOverlayItem | null =
    fresh.praiseFresh && fresh.flash !== null
      ? {
          id: `praise:${fresh.flash.key}`,
          kind: "praise",
          tone: "good",
          lineBg: fresh.flash.titleBg,
        }
      : fresh.taskFresh && input.taskLineBg !== null
        ? {
            id: input.taskKey ?? "task",
            kind: "task",
            tone: input.mistakeMode ? "danger" : "neutral",
            chipBg: input.mistakeMode
              ? "Преживей грешката"
              : `Задача ${Math.min(input.objectiveIndex, Math.max(1, input.objectiveTotal))}/${input.objectiveTotal}`,
            lineBg: input.taskLineBg,
            // O54: the advisor's half, on the row that carries the counter.
            // `itemEchoesLine` over this pair must stay false — the line is the
            // title and the detail is what is left once the title has been
            // stripped off it (`advisorEchoTrim`), so the two cannot be the same
            // sentence unless somebody re-attaches the prefix.
            detailBg: input.fold.taskDetailBg,
          }
        : null;

  return [advisorRow, taskRow];
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O54/O51 · THE BOUNDARY A SUBSTRING CANNOT GUARD — THE ARGUMENT LIST ITSELF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE ROUND BEFORE THIS ONE DID THE RECOMMENDED THING and it worked as far as
 * it went: the decisions moved out of JSX into `advisorTaskFold`,
 * `advisorTaskRows`, `taskAnnounceKey` and `heldTaskCapKmh`, and twelve
 * mutations INSIDE those functions now go red — including partial deletions of
 * the coaching gate one condition at a time.
 *
 * IT DID NOT CLOSE THE HOLE, IT MOVED IT ONE LINE UP. The neutralisation went
 * into the ARGUMENT LIST at the call site, where the only guard was again three
 * `toContain` substrings. An adversarial refuter measured EIGHT surviving
 * mutations there; every one was re-measured here, on this tree, before a line
 * of this function was written — each is `tsc --noEmit` clean AND leaves
 * `queueTaskEcho` + `taskCapThread` + `overlay-queue-moment` + `notify-column`
 * green at 4 files / 88 tests:
 *
 *   advisorOn,            → advisorOn: true,           the coaching gate, for the
 *                                                      one condition with a live
 *                                                      effect today
 *   examMode,             → examMode: false,
 *   mistakeMode,          → mistakeMode: false,
 *   ended,                → ended: false,
 *   objectiveTitleBg: snap.objectiveTitle,
 *                         → objectiveTitleBg: null,    nothing to echo ⇒ the
 *                                                      advisor keeps its row
 *   taskDetailBg,         → taskDetailBg: null,        coaching changes stop
 *                                                      re-announcing the card
 *   fold: advisorFold,    → fold: { advisorSpeaks: true, … }   O54 verbatim
 *   setSnap((prev) => …)  → setSnap(() => … null)      the held cap, at
 *                                                      `hudPollUpdate` above
 *
 * WHY THE GUARD COULD NOT SEE THEM: you do not DROP the field, you PIN it. A
 * required field supplied with a constant satisfies the type checker and
 * satisfies the substring. „Dropping a field is a compile error" was true and
 * was the wrong sentence.
 *
 * SO THE CALL-SITE BINDING IS A FUNCTION TOO. This is the shape that closed the
 * identical hole for `hud/dashboardStatus.ts` (the write moved out of a
 * `useFrame` nobody could execute, and `__tests__/dashboard-publication.test.ts`
 * drives the same function the scene calls). Six of the eight mutations above
 * now have NO call site to live at: `objectiveTitleBg`, `taskDetailBg`, `fold`,
 * `taskLineBg`, `taskKey` and the four gate conditions are derived HERE, from
 * one state object, and `__tests__/queueTaskEcho.test.ts` drives this function
 * with snapshots taken off real compiled sessions.
 *
 * WHAT IS LEFT, STATED HONESTLY, because the last round's failure was a
 * paragraph that claimed more than it held: what the component hands THIS
 * function is still a written argument list, and no test running in a `node`
 * environment can watch a React component execute — there is no DOM in this
 * suite and `useFreshKey`/`useCompactHud` both resolve in effects, so an SSR
 * pass never reaches the queue at all. That last hop is held by an AST guard in
 * `__tests__/queueTaskEcho.test.ts` which parses this file and requires each
 * property of these two calls to be EXACTLY the identifier it must be — so
 * `advisorOn: true` and `advisorOn: advisorOn || true` are both rejected, where
 * a substring accepted both. That guard self-checks by re-applying all eight
 * mutations above to this file's own text and failing if any is accepted.
 */
export interface LessonQueueState {
  /** The HUD snapshot this frame — `snapshotOf`'s output, nothing re-read. */
  snap: HudSnapshot;
  /** «Съветник» вкл./изкл. */
  advisorOn: boolean;
  examMode: boolean;
  /** THEO-3 „направи грешката" sandbox. */
  mistakeMode: boolean;
  ended: boolean;
  /** Phone-shaped viewport — there is no queue at all on a roomy stage. */
  compact: boolean;
  /** The micro-menu recall counter: a re-tap re-announces the same line. */
  taskPing: number;
  /** `lesson.descriptionBg` — the sandbox's own line, see `taskLineBg` below. */
  lessonDescriptionBg: string;
}

export interface LessonQueueBinding {
  /** The line the task row carries, and the micro-menu's recall row. */
  taskLineBg: string | null;
  fold: { advisorSpeaks: boolean; taskDetailBg: string | null };
  taskKey: string | null;
  advisorKey: string | null;
  /** Everything `advisorTaskRows` needs that is not a React freshness fact. */
  rows: AdvisorTaskRowsInput;
}

export function lessonQueueBinding(s: LessonQueueState): LessonQueueBinding {
  // The task line, as the student would say it: what to do, and where in the
  // route. In the THEO-3 sandbox it is the LESSON'S description and not the
  // objective's title — which is the whole reason the fold's `mistakeMode`
  // condition is load-bearing rather than decoration (`advisorTaskFold`): the
  // detail would otherwise be the remainder of a different sentence from the
  // one printed above it, and `itemEchoesLine` cannot see that.
  const taskLineBg = s.mistakeMode ? s.lessonDescriptionBg : s.snap.objectiveTitle;

  // The gate and the fold — one place, and a pure one, so the four conditions
  // can be driven one at a time. It is NOT the gate the roomy `AdvisorCard` is
  // mounted behind (that one has nine); the correction and the per-condition
  // measurement are at `advisorTaskFold`.
  const fold = advisorTaskFold({
    advisorPrompt: s.snap.advisorPrompt,
    objectiveTitleBg: s.snap.objectiveTitle,
    advisorOn: s.advisorOn,
    examMode: s.examMode,
    mistakeMode: s.mistakeMode,
    ended: s.ended,
  });

  const taskKey = taskAnnounceKey({
    compact: s.compact,
    ended: s.ended,
    taskLineBg,
    objectiveIndex: s.snap.objectiveIndex,
    objectiveTotal: s.snap.objectiveTotal,
    taskDetailBg: fold.taskDetailBg,
    taskPing: s.taskPing,
  });

  // The compact advisor row's own key. It reads the SAME four conditions as the
  // fold plus `compact` — which is why it is derived here beside it rather than
  // in the render: two readings of one gate is the defect `advisorTaskFold`'s
  // header spends a screen refusing, and a state object handed to one function
  // cannot be pinned for one of them and not the other.
  const advisorVisible =
    s.compact &&
    s.advisorOn &&
    !s.examMode &&
    !s.mistakeMode &&
    !s.ended &&
    s.snap.advisorPrompt !== null;

  return {
    taskLineBg,
    fold,
    taskKey,
    advisorKey: advisorVisible ? `advisor:${s.snap.advisorPrompt?.textBg ?? ""}` : null,
    rows: {
      fold,
      advisorPrompt: s.snap.advisorPrompt,
      taskKey,
      taskLineBg,
      objectiveIndex: s.snap.objectiveIndex,
      objectiveTotal: s.snap.objectiveTotal,
      mistakeMode: s.mistakeMode,
    },
  };
}

/**
 * THE BRIEFING CARD — `LessonSpec.briefingBg`, on the glass.
 *
 * The numbered steps every scenario template authors. They were compiled away
 * for the whole life of the scenario layer, which is how „Включи фаровете —
 * вече е тъмно" came to exist on sixteen templates and be spoken to nobody.
 *
 * Deliberately small and deliberately IN THE RIGHT-EDGE COLUMN, under the
 * objective banner and the advisor: the overlay budget (hud/overlayQueue.ts)
 * owns the phone, and on a roomy screen the rule is „the centre of the screen
 * is road". It is dismissible in one tap and does not come back — a briefing is
 * read once.
 *
 * 2026-08-03 — it was 448 px of prose starting at x = 416 on a 1280 px screen,
 * i.e. 12.6 % of the frame laid straight over the vanishing point, and the
 * founder named it by name («the instructions too»). `max-w-md` is gone: the
 * card is `w-full` of the column, which is where its width now comes from.
 */
/**
 * The briefing list's bottom fade, px, and the gradient built from it.
 *
 * 10 px is `SimOverlay`'s `TEXT_FADE_PX`, taken rather than chosen: it is the
 * number measured against an 11 px `leading-tight` line box on the phone, and
 * this list is the same 11 px at the same leading. Exported so
 * `briefingOverflow.test.tsx` can assert the pair (mask + padding) without
 * restating the value — a fade whose padding drifts is a permanently greyed
 * last step, which is a worse defect than the slice it replaced.
 */
export const BRIEFING_FADE_PX = 10;
export const BRIEFING_FADE_MASK_CSS = `linear-gradient(to bottom, #000 calc(100% - ${BRIEFING_FADE_PX}px), transparent)`;

export function BriefingCard({
  steps,
  onClose,
}: {
  steps: ReadonlyArray<{ n: number; textBg: string }>;
  onClose: () => void;
}) {
  // ── HOW MANY STEPS ARE BELOW THE FOLD RIGHT NOW ────────────────────────────
  //
  // Not decoration, and not a duplicate of the scrollbar: the sweep's finding
  // on `sc-ac-bridge-ice/pc-right` is „no scrollbar, no «още», no affordance of
  // any kind" — the panel printed steps 1–8, sliced 9 through its x-height and
  // never mentioned 10, which is the step that says where the ice ends. A
  // scroll container that overflows in silence is indistinguishable from a
  // finished list, and the student has no reason to reach for a wheel.
  //
  // Counted in STEPS rather than lines: a step is the unit the briefing is
  // authored in and the unit the student is looking for. The count is read off
  // real layout (`offsetTop + offsetHeight` against the viewport of the list),
  // so it cannot drift from what is actually painted the way a character
  // estimate does.
  const listRef = useRef<HTMLOListElement | null>(null);
  const [below, setBelow] = useState(0);
  /**
   * ── THE CUT IS ON THE LINE GRID NOW, WHICH IS THE ROUTED HALF ─────────────
   * The paragraph at the `<ol>` ends „Both rows stay open on the snap", and
   * the sweep re-filed the difference twice more on the DESKTOP panel:
   *
   *   sc-pe-night-unlit/pc-right/01-arrival.png   step 3's last line cut
   *     horizontally by the card's bottom edge, half-height letterforms
   *   sc-pe-zone-living/pc-right/04-t017s.png     the same, one step further
   *     down — „sliced through the x-height", on every pc frame of both lanes
   *
   * A 10 px band under an 11 px `leading-tight` (13.75 px) line box cannot end
   * anywhere but inside a line: `SimOverlay`'s own block has the arithmetic and
   * the conclusion — „any band that ends inside a line box ends inside its
   * letters. The only cut that is not through a letter is a cut BETWEEN LINE
   * BOXES." That snap is `foldWindowPx`, it is published now, and this is the
   * consumer its routing note named. Nothing about the counter's rule moves;
   * what moves is which pixel the mask goes transparent at.
   *
   * `null` until the first measurement, and `hardEdge: false` whenever nothing
   * is overflowing — both resolve to `BRIEFING_FADE_MASK_CSS` character for
   * character, so a server render, an engine with no ResizeObserver and a
   * briefing that fits are all exactly what they were.
   */
  const [foldWin, setFoldWin] = useState<{
    topPx: number;
    bottomPx: number;
    hardEdge: boolean;
  } | null>(null);
  const measure = useCallback(() => {
    const ol = listRef.current;
    if (ol === null) return;
    // MEASURED AGAINST THE LIST AND NOT AGAINST WHATEVER `offsetParent` IS.
    // This read `li.offsetTop`, which is relative to the nearest positioned
    // ancestor — never the `<ol>` (static), always the card root (backdrop-blur
    // makes it one in both engines). The full derivation and what the wrong
    // number actually said is at `listRowsInScrollCoords`.
    const listTop = ol.getBoundingClientRect().top;
    const rects = Array.from(ol.children).map((li) => {
      const el = li as HTMLElement;
      const r = el.getBoundingClientRect();
      return { top: r.top, height: r.height, el };
    });
    const rows = listRowsInScrollCoords(listTop, ol.scrollTop, rects);
    // The snap needs one thing the counter never did: each row's own leading,
    // because a step that wraps to three lines offers two interior edges the
    // cut may land on. `NaN` (jsdom, `line-height: normal`) makes that row a
    // single indivisible block — `foldWindowPx`'s documented behaviour, not a
    // silent degradation.
    //
    // AND IT IS ONE STYLE RESOLUTION, NOT ONE PER ROW — raised by the round-11
    // verifier, because this is `onScroll` on the one surface a student drags
    // and the R3F loop is running behind it. The rect loop above already forced
    // layout, nothing between the two loops writes to the DOM, so style is
    // clean when the first `getComputedStyle` read arrives and the remaining
    // ~9 are served from it. Per row rather than hoisted off the first `<li>`
    // deliberately: every step carries `leading-tight` today, and a row that
    // one day does not must snap to its OWN grid rather than to its sibling's.
    const foldRows: FoldRow[] = rows.map((r, i) => ({
      offsetTop: r.top,
      heightPx: r.height,
      lineHeightPx: Number.parseFloat(getComputedStyle(rects[i]!.el).lineHeight),
    }));
    const win = foldWindowPx(foldRows, {
      scrollTop: ol.scrollTop,
      clientHeight: ol.clientHeight,
    });
    setFoldWin(win);
    // THE COUNTER STILL READS THE BOX, AND THAT IS A PROOF, NOT AN OVERSIGHT.
    // `SimOverlay`'s own counter is recounted against the cut, because it
    // counts LINES and the snap moves the cut inside a line. This one counts
    // STEPS, and `rowsBelowFold` already counts a step whose bottom is past
    // the fold — i.e. a half-visible step is counted. The snapped edge is the
    // LARGEST row/line edge at or under `clientHeight + slack`, and every row
    // bottom is one of those edges, so no step's bottom can lie between the
    // snap and the box: the two arguments cannot give different numbers here.
    // Threading `win.bottomPx` would look like a guard and guard nothing.
    setBelow(rowsBelowFold(rows, ol.scrollTop, ol.clientHeight));
  }, []);
  useEffect(() => {
    const ol = listRef.current;
    if (ol === null) return;
    // The column's height changes when a toast arrives or the advisor card
    // dismisses — the fold moves without the list being touched, so observing
    // the element is the only reading that stays true.
    //
    // AND THE FIRST COUNT COMES FROM THE OBSERVER TOO, not from a `measure()`
    // call in this effect's body. `ResizeObserver` fires once on `observe()`
    // with the element's current box, so the mount reading and every later one
    // travel the same path — and the effect subscribes to an external system
    // instead of setting state synchronously, which is the shape
    // `react-hooks/set-state-in-effect` is asking for and one fewer cascading
    // render on a shell that already re-renders every 150 ms.
    if (typeof ResizeObserver === "undefined") {
      // No observer (jsdom, ancient Safari): count once and accept that a
      // later resize will not be noticed. A stale count is still better than
      // the silence this row exists to end.
      measure();
      return;
    }
    const ro = new ResizeObserver(measure);
    ro.observe(ol);
    return () => ro.disconnect();
  }, [measure, steps]);
  return (
    // NOT `hud-ghost`, deliberately, and this is the one place in this wave
    // where the UNPANEL sweep is declined. Rendered ghosted at 1280×800 the
    // five-step briefing landed on white parked cars and a lit building and was
    // simply unreadable — and the founder's sentence is „it must be small text
    // so the user can JUST READ IT". The sweep's own header already draws this
    // line for prose («a look is not worth costing a student the rule they just
    // broke»); a numbered briefing is prose, not an instrument. It keeps its
    // readable ground and it is at the EDGE, which is what he asked for.
    <div
      aria-label="Инструкции за упражнението"
      // `flex min-h-0 flex-col` is the whole of the truncation fix — see the
      // <ol> below. Without `min-h-0` this card is a flex item with the default
      // `min-height: auto`, which means it REFUSES to shrink, and the column's
      // `overflow-hidden` then cuts it wherever it happens to end.
      //
      // `[flex-shrink:20]` is where the yield order now LIVES. It used to live
      // on the toast scroller as a sub-1 weight, which CSS Flexbox § 9.7 turns
      // into a cap on how much that box may absorb at all (the derivation, and
      // the frame it guillotined, are at `data-hud-toast-scroller` below). The
      // ratio is the same one that comment always claimed — 230 × 20 against
      // 490 × 1 is nine pixels of briefing for every one of graded fault — it
      // is simply written on the side that is allowed to carry a big number.
      className="pointer-events-auto flex w-full min-h-0 min-w-0 flex-col [flex-shrink:20] rounded-2xl border border-border bg-background/85 px-3 py-1.5 backdrop-blur"
    >
      <div className="flex shrink-0 items-center gap-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-accent">Инструкции</p>
        {/* A6, 2026-08-04. This control existed — it just could not be hit. It
            was `px-1.5 text-xs` with no height of its own: a ~24 × 18 px target
            on the screen row C2 was closed on the rule that nothing may be
            under 44 px. It is now the column's ONE close control
            (HudCloseButton), which paints an 18 px ring and carries a 44 px hit
            rect it does not paint. */}
        <HudCloseButton onClick={onClose} labelBg="Скрий инструкциите" />
      </div>
      {/* ── THE LIST TAKES THE HEIGHT THE COLUMN ACTUALLY HAS ────────────────
          A five-step briefing on a 390 px-tall landscape window is tall enough
          to reach the instrument band, and a card that runs into the dashboard
          is the stacked-panel bug the overlay budget exists to end
          (hud/overlayQueue.ts). So it scrolls — that part was always right.

          WHAT WAS WRONG WAS THE CAP, AND IT WAS WRONG BY 92 px. This was
          `max-h-[28vh]`: twenty-eight per cent of the WINDOW, inside a column
          whose height comes from the STAGE. Measured on the shipped desktop
          layout (1440 × 900, `?chrome=dashboard`, the frame this fix was
          reproduced on — sc-ac-bridge-ice/pc-right/01-arrival.png):

            window                 900 px  →  28vh = 252 px   ← what the list took
            stage (16:9 letterbox) 648 px
            column top             52 px   (NOTIFY_COLUMN_TOP_CSS_ROOMY)
            column maxHeight       648 − 108 − 56 = 484 px
            column left for list   484 − 52 (banner) − 28 (header) ≈ 344 px

          So the list stopped 92 px short of the room it had been given, on a
          panel that was already truncating: ten authored steps rendered as
          „1–8, half of 9, and no 10" while ~4 lines of column sat empty under
          it. A viewport-relative cap inside a stage-relative box is not a
          conservative choice, it is an unrelated number.

          `min-h-0` + no cap hands the decision to the flex box that actually
          knows: the list grows to its content, and when the column runs out —
          because a teach toast arrived, or the deck opened and took 6.75rem of
          the corridor (PlayAreaStyles' deck-reserve rule) — it is the LIST that
          gives way and scrolls, not the card that gets guillotined.

          AND THE YIELD ORDER IS NOT AN ACCIDENT EITHER. This card is the only
          child of the column carrying `min-h-0`, so under the flex algorithm it
          is the only one that CAN shrink: the objective banner and the toast
          stack keep the default `min-height: auto` and hold their size. That is
          the right priority and it is the reason no `shrink-0` is written on
          them — a graded fault, or the task itself, must never be the thing
          that yields to a briefing the student has already read. ────────────*/}
      {/* ── …AND THE SCROLLER IS PAINTED, NOT JUST PRESENT ───────────────────
          The sweep filed this panel five times in words that all name the same
          missing thing — «no scrollbar or overflow affordance» (turn-lane-
          arrows), «no item 5 and no scroll affordance» (jx-priority-
          confidence), «cuts off after item 4 with no scrollbar» (ov-crest-
          curve), and twice more on jx-blocked-exit and sp-wet-limit-plate.
          The «↓ още N стъпки» row below answers the „did I know something was
          hidden" half; this answers „is there anything to grab".

          `overflow-y-auto` alone does not paint one here. Chromium's default
          classic bar is 15 px — 5 % of a 320 px column — and WebKit's is an
          OVERLAY bar that exists only during a scroll, which is the engine the
          founder is actually on. `scrollbar-width: thin` + an explicit
          `scrollbar-color` is what the two other HUD scrollers in this product
          already use for exactly this reason (`LessonScene.tsx`'s key table,
          `PreDriveChecklist.tsx`'s step list) and it costs 6 px, not 15.

          NOTE ON THE FRAMES: they were driven at 7e2fd21, where this list still
          carried `max-h-[28vh]` and no counter at all — `sc-ov-crest-curve/
          pc-right/01-arrival.png` is that cap exactly (a 900 px window → 252 px
          of list → four of six steps, ending on the card's own rounded border
          with ~100 px of column unused below it). ec1f56f removed the cap and
          added the counter. This is the third piece, and the one none of the
          five findings would have been satisfied without. ──────────────────*/}
      {/* ── …AND THE CUT LINE IS FADED, NOT GUILLOTINED — sweep w10 ──────────
          `sc-ov-crest-curve/pc-right/01-arrival.png`, 1440 × 900, cropped at
          x893 / y0-648 and opened. The counter added by the previous round IS
          on the frame — «↓ ОЩЕ 5 СТЪПКИ» — so the „scrolled in silence" half
          of that row is genuinely closed. What is still there is the row's
          other clause, and `sc-jx-blocked-exit/pc-right/05-stopped.png` states
          it in words: „the glyph bottoms of that last line are themselves
          clipped by the panel edge."

          A scroll container ends where it ends and its own bottom edge cuts
          the next line through the glyphs. `SimOverlay` measured what that
          does on the phone — «6.» with its ascenders sliced flat, „61 % of the
          line inside the fade" — and recorded the reason it matters: a
          horizontally sliced line reads as a RENDERING FAULT, not as „there is
          more", so the student does not scroll and the counter above is
          arguing with the picture.

          THE SAME TWO DECLARATIONS, AND THEY ARE A PAIR. The mask dims the
          last 10 px; the `pb-2.5` under it is what keeps a list that FITS from
          being dimmed at all — padding joins the scrollable overflow in every
          engine this ships on, so at the end of the scroll the last step's box
          bottom sits on the fade's opaque edge. One without the other is
          either a permanently greyed final step or no fade at all.

          NOT THE LINE-GRID SNAP. `SimOverlay.foldMaskCss` has a second branch
          that moves the cut onto a line boundary so no glyph is ever partly
          painted; it needs a live measurement of the row edges against the
          scrollport, which this card already takes for `rowsBelowFold` but does
          not keep. That is the stronger repair and it is NOT done here —
          faded-through is better than sliced-through and is not the same as
          uncut. Routed with the measurement it needs: `listRowsInScrollCoords`
          already returns the edges; what is missing is a `snappedBottomPx`
          beside `rowsBelowFold` and a `maskImage` fed from it.

          AND IT CLOSES NEITHER ROW IT WAS FILED UNDER, which is worth writing
          down beside the change rather than in a report. `sc-ov-crest-curve`
          asks for items 5 and 6, „which carry the whole decision rule" — a
          fade does not show them, and the counter that answers the other half
          of that row landed in an earlier round, not this one.
          `sc-sp-wet-limit-plate` says the last step „cannot be read … is
          unreachable"; read literally, dimming the fragment makes it less
          legible, not more. What this change actually buys is the SIGNAL: a
          horizontally guillotined line reads as a rendering fault and a faded
          one reads as „there is more", so the counter above stops arguing with
          the picture and the student has a reason to scroll. Both rows stay
          open on the snap. ────────────────────────────────────────────────*/}
      <ol
        ref={listRef}
        onScroll={measure}
        className="mt-1 flex min-h-0 flex-col gap-0.5 overflow-y-auto pb-2.5 [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin]"
        style={
          // ── THE FADE IS BOUND TO THE COUNTER'S OWN PREDICATE, `below > 0`,
          //    and that is the row directly under this list stating the rule:
          //    „It exists only while something is genuinely below the fold, so
          //    a briefing that fits carries no chrome."
          //
          //    An unconditional mask relies on `pb-2.5` joining the scrollable
          //    overflow to keep a list that FITS from being permanently
          //    greyed — true in every engine this ships on, and still a fade
          //    painted over a list with nothing below it. Worse, it stayed on
          //    at the END of a scroll, where the last step is fully reachable
          //    and dimming it is the one thing an adversarial read of
          //    `sc-sp-wet-limit-plate:fa722389` („the last step cannot be
          //    read") is entitled to call a regression.
          //
          //    `below` is recomputed by `measure` on every scroll and on every
          //    resize, so the fade appears exactly while there is something
          //    under the cut and vanishes the moment the student reaches it.
          //    The padding stays either way: it is what puts the last step's
          //    box bottom on the fade's opaque edge instead of inside it.
          //
          //    ── AND WHICH MASK, of the two. `foldWin.hardEdge` is the snap's
          //    own answer to „is a line being cut in half, and can the cut be
          //    moved onto the grid". When it can, the window is opaque between
          //    two line-box edges and transparent outside them, so no glyph is
          //    ever partly painted — the routed repair. When it cannot (the
          //    snap's two documented refusals: nothing overflowing, or a cut
          //    that would swallow more than one line box), the 2026-08-14 band
          //    is emitted exactly as before. Faded-through remains the floor;
          //    it is no longer the ceiling.
          below > 0 || foldWin?.hardEdge === true
            ? {
                // Both spellings: unprefixed in current WebKit, prefixed in the
                // engine the founder reads this on. Same pair `SimOverlay`'s two
                // text windows carry, and the same 10 px.
                WebkitMaskImage:
                  foldWin !== null && foldWin.hardEdge
                    ? foldMaskCss(foldWin, BRIEFING_FADE_PX)
                    : BRIEFING_FADE_MASK_CSS,
                maskImage:
                  foldWin !== null && foldWin.hardEdge
                    ? foldMaskCss(foldWin, BRIEFING_FADE_PX)
                    : BRIEFING_FADE_MASK_CSS,
              }
            : undefined
        }
      >
        {steps.map((s) => (
          <li
            key={s.n}
            className="flex gap-1.5 break-words text-left text-[11px] leading-tight"
          >
            <span className="shrink-0 font-black tabular-nums text-muted">{s.n}.</span>
            <span className="min-w-0">{s.textBg}</span>
          </li>
        ))}
      </ol>
      {/* The affordance, and it is OUTSIDE the scroll area on purpose: the
          phone's «↓ ОЩЕ 7 РЕДА» counter was filed twice in the same sweep for
          covering the sentence it was counting. This row occupies its own
          12 px of the card and hides nothing. It exists only while something is
          genuinely below the fold, so a briefing that fits carries no chrome. */}
      {below > 0 ? (
        <p
          aria-live="polite"
          className="mt-0.5 shrink-0 text-[9px] font-black uppercase tracking-wider text-muted"
        >
          ↓ още {below} {below === 1 ? "стъпка" : "стъпки"}
        </p>
      ) : null}
    </div>
  );
}

/**
 * THE „MICRO MAJOR BUTTON WITH SUB MENU" (founder's own words, 2026-07-28).
 *
 * It replaces two full-width chrome rows — „← Всички уроци" + the lesson title,
 * and „Съветник / ВЪПРОСИ / Завърши сесията" — which together measured 93 px of
 * a 390 px landscape viewport. Twenty-four per cent of the screen, spent before
 * the simulator started, on a back link and a heading the student had just read
 * on the card they tapped.
 *
 * Everything those rows carried is here, plus the lesson title as the sheet's
 * own header, plus the map toggle that used to be a floating chip. Nothing was
 * dropped; it stopped being permanently on screen.
 *
 * It sits at the TOP-LEFT rail and it is 44 px — Apple's own minimum touch
 * target — because in landscape that corner is under a thumb and not under the
 * road. The insets are real `env(safe-area-inset-*)` values: with the app now
 * shipping `viewport-fit=cover`, that corner is exactly where the notch is.
 */
type PlayMenuItem = {
  key: string;
  labelBg: string;
  /** Right-hand state word („вкл." / „Често"), or null for a plain action. */
  valueBg?: string | null;
  /**
   * THE TRADE, under the label — doc 91 §I26(c) / THEO-4.
   *
   * The quality row and the «Звук» row carry one, and it is the reason neither
   * is just a switch: a setting that changes the experience without saying what
   * it costs is the bare verdict requirement zero forbids, one layer out from
   * the theory module. Kept to two lines of 10 px type at 208 px (see
   * `qualityChoice.ts` for the measurement) — a third line costs menu height
   * the sheet does not have on the tightest profile in the ladder. Both files
   * pin the same 70-character ceiling and both are held to it by their own
   * test; a third row that wants a hint inherits the same budget.
   */
  hintBg?: string | null;
  /** Full accessible name when label+value+hint would otherwise read as three
   *  unlabelled spans. */
  ariaLabelBg?: string | null;
  tone?: "default" | "danger";
  onSelect: () => void;
  /** Keep the sheet open (a toggle the student may flip twice). */
  keepOpen?: boolean;
};

/**
 * One row, extracted for one reason: doc 91 · C2 needs a hook per row and a
 * hook cannot be called inside `items.map`. Nothing else about the row moved.
 */
function PlayMenuRow({ item, onChosen }: { item: PlayMenuItem; onChosen: () => void }) {
  const tap = useTapActivation(() => {
    item.onSelect();
    if (item.keepOpen !== true) onChosen();
  });
  const hint = item.hintBg ?? null;
  return (
    <button
      type="button"
      role="menuitem"
      aria-label={item.ariaLabelBg ?? undefined}
      {...tap}
      // DOC 91 · L9/§I14: measured 226×**39.5** — 4.5 px short of the 44 px a
      // thumb needs, on every row of the sheet that holds «Пауза», the quality
      // preset and «Завърши сесията».
      //
      // §I14 SAYS `py-2.5` → `py-3`, AND ON THIS BUILD THAT LANDS ON 43.5.
      // Measured, iPhone 16 landscape, production build, authenticated
      // /simulator: 226×**43.5** on all seven rows — the 13 px type gives a
      // 19.5 px line box, and 19.5 + 24 is half a pixel short of the rule the
      // row exists to satisfy. „Half a pixel" is how a 44 px audit passes while
      // the number in the report still starts with a 4 and a 3. So the floor is
      // stated as a floor (`min-h-11` = 44 px) and the padding keeps the shape:
      // a rule that has to be re-derived from a font metric will be wrong again
      // the next time the type changes.
      //
      // A ROW WITH A TRADE LINE KEEPS THE SAME FLOOR AND SPENDS LESS PADDING:
      // 19.5 (label) + 12.5×2 (two lines of 10 px) + 12 (`py-1.5`) = 56.5, and
      // the floor still holds it at ≥ 44 if the hint ever renders on one line.
      // The one-line rows are byte-identical to what §I14 measured.
      className={`flex min-h-11 flex-col justify-center rounded-xl px-2.5 text-left text-[13px] font-bold transition active:bg-surface ${
        hint === null ? "py-3" : "gap-0.5 py-1.5"
      } ${item.tone === "danger" ? "text-danger" : "text-foreground"}`}
    >
      <span className="flex w-full items-center gap-2">
        <span data-menu-label className="min-w-0 flex-1 truncate">
          {item.labelBg}
        </span>
        {item.valueBg ? (
          <span data-menu-value className="shrink-0 text-[11px] font-bold text-accent">
            {item.valueBg}
          </span>
        ) : null}
      </span>
      {hint !== null ? (
        <span
          data-menu-hint
          className="text-[10px] font-medium leading-tight text-muted"
        >
          {hint}
        </span>
      ) : null}
    </button>
  );
}

function PlayMenu({
  titleBg,
  badgeBg,
  items,
  compact,
  onOpenChange,
}: {
  titleBg: string;
  /** „Изпит" / „Пясъчник" framing, or null. */
  badgeBg: { textBg: string } | null;
  items: PlayMenuItem[];
  /** Phone-shaped stage — the sheet has to pay for every pixel it takes. */
  compact: boolean;
  /** ══ THE MENU IS A PAUSED-STATE OBJECT — 2026-08-13, doc 91 §W3 ══
   *
   *  Published so the shell can stop the car, exactly as it already does for
   *  the read mode. This is not a nicety: measured on the deployed build
   *  (f85f49a, six profiles, WebKit, car MOVING) this sheet buried 2–3 LIVE
   *  controls on 6 of 6 with `paused false` — both indicator stations in
   *  landscape, «Клаксон» / «Кола» / «Колан» in portrait, and on the Samsung
   *  gesture-bar landscape THE STEERING PAD ITSELF (208 × 160, 24 602 px²).
   *
   *  The geometric fix does not exist. The sheet is 8 rows; landscape already
   *  went two-column to stop the seventh falling below the fold; the flanks
   *  own both outer edges from the corner down. There is no corridor left on a
   *  360 px stage that holds a menu and clears the arc.
   *
   *  So the answer is the one this screen already gives, one surface over:
   *  nothing in here is needed while the car moves. «Пауза», the quality
   *  preset, the advisor toggle, the map, «Прекрати урока», „← Всички уроци" —
   *  every row is a between-attempts decision. A 17-year-old opening a menu
   *  mid-drive should have the car stopped anyway, and once it IS stopped the
   *  covering is legitimate rather than a defect: `paused` reaches
   *  `TouchControls` as `hidden`, which releases both axes and both pads'
   *  pointer ownership and renders every station inert. There is nothing live
   *  underneath to bury.
   */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  // Doc 91 · C2 — this menu is where «Пауза», the quality preset and «Завърши
  // сесията» live, and every row of it was `onClick`-only: dead under a second
  // finger, which on a driving screen is most of the time. `useTapActivation`
  // adds the pointer path and keeps the click path for mouse and keyboard.
  const tapToggle = useTapActivation(() => setOpen((o) => !o));
  // One effect, not a callback at every call site: the sheet closes from the
  // trigger, from `onChosen` on every row, and on unmount — and a `paused` seam
  // that misses ONE of those paths is a car that stays frozen after the menu
  // has gone, which is a worse defect than the one being fixed.
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  useEffect(() => () => onOpenChange?.(false), [onOpenChange]);
  return (
    <div
      // NAMED, 2026-08-13, because it is the ONE live control the read mode's
      // pause cannot reach: `paused` makes every TouchControls button inert, and
      // this button is shell chrome in a different tree. Measured buried by the
      // expanded panel on both 852 and 780 landscape profiles. `data-hud` is the
      // vocabulary the two trees share; the arbitration is in PlayAreaStyles.
      data-hud="play-menu"
      className="pointer-events-none absolute z-20 flex flex-col items-start gap-1.5"
      style={{
        // ── THIS BUTTON PAYS THE STEERING BAND'S LANE — 2026-08-18 ──────────
        //
        // It used to read `calc(0.5rem + env(safe-area-inset-left, 0px))`, i.e.
        // the same 8 px the flank's own stations start at, and for as long as
        // the left band carried three stations that cost nothing. The ⚙ dock
        // took a fourth on 2026-08-17 and this button landed ON it: 28 of its
        // 44 px on the Samsung gesture-bar landscape profile, 4 px on the
        // 780×360 Android, and this element is `z-20`, so `elementFromPoint` at
        // the dock's centre answers «Меню». The measurement, the profiles and
        // the reason the MENU is the one that moves are at PLAY_MENU_LEFT_CSS.
        //
        // The lane is a VARIABLE and it is read HERE, in an inline style, on
        // purpose: an inline style outranks every selector in every stylesheet,
        // so a media query in PlayAreaStyles could not have moved this box no
        // matter how it was written — the same cascade that cost the flank
        // wave a deploy. Upright the variable is 0 and this is byte-for-byte
        // the corner it has always been in.
        left: PLAY_MENU_LEFT_CSS,
        top: PLAY_MENU_TOP_CSS,
        maxHeight: "calc(100% - 1rem)",
      }}
    >
      <div className="flex items-center gap-1.5">
        {/* ── THE TOP-LEFT CORNER, 2026-08-03. The review named this one on
            sight: „the white circular hamburger, top-left — a mobile-web menu
            affordance." Measured on the drive screen before the change, it was
            exactly that: a 44 px disc filled `oklab(0.96 …/0.6)` — near-white
            at 60 % — with a `rgb(211,224,240)` ring and a `backdrop-blur`, i.e.
            three separate web-app tells stacked on a photograph of a road.

            A hamburger is also the wrong SIGN for this product. It says „there
            is a site behind this screen"; the reference's edge furniture says
            what it does, in words, in a mono face, with nothing behind it. So
            the disc goes and the word arrives: МЕНЮ / ЗАТВОРИ, on the ghost
            register (`hud-ghost` — fill, blur and shadow are swept by
            PlayAreaStyles, the ink is pinned light for a road background and
            the halo is what holds it legible over bright tarmac).

            WHAT DELIBERATELY DOES NOT CHANGE: the 44 px minimum in both axes
            (row C2 counted nineteen touch-target violations in this app and
            this is the control that opens everything else), the accent ring in
            the open state, and the sheet behind it, which is a reading surface
            and keeps its panel. ────────────────────────────────────────────── */}
        <button
          type="button"
          {...tapToggle}
          aria-expanded={open}
          aria-label={open ? "Затвори менюто на урока" : "Меню на урока"}
          title={titleBg}
          className={`hud-ghost pointer-events-auto flex h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border px-2 text-[10px] font-black uppercase tracking-[0.14em] transition motion-reduce:transition-none ${
            open ? "border-accent text-foreground" : "border-border text-foreground"
          }`}
        >
          <span aria-hidden>{open ? "Затвори" : "Меню"}</span>
        </button>
        {/* A13 / THEO-3: the framing badge is a product requirement — it stays
            on screen, at chip size, because „this is an exam" must never be
            something a student has to open a menu to find out. */}
        {badgeBg !== null ? (
          <span className="rounded-full border border-danger/60 bg-danger/15 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-danger backdrop-blur">
            {badgeBg.textBg}
          </span>
        ) : null}
      </div>

      {open ? (
        <div
          role="menu"
          aria-label="Меню на урока"
          // ── THE SHEET'S FOOTPRINT, RE-MEASURED FOR §I26(c)'s EXTRA ROW ──────
          //
          // Adding a row to this sheet is not free and the ladder says so.
          // Measured on the deployed build (726d7ef, six profiles,
          // authenticated /simulator, menu OPEN):
          //
          //   portrait   sheet 240×370 at y 58 (117 with the emulated notch);
          //              the first thumb control above it — «Мигач надясно» —
          //              has its centre at y 466-490. **3 px of clearance on
          //              iPhone-16 portrait.**
          //   landscape  sheet 240×294 in a 360-tall stage: the seventh row
          //              («← Всички уроци») already falls BELOW the fold and
          //              `elementFromPoint` at its centre answers the steering
          //              pad. 4 of 19 controls dead with the menu open.
          //
          // So the row is paid for rather than simply added:
          //
          //  · LANDSCAPE GOES TWO COLUMNS. Eight rows in four, and the sheet
          //    gets SHORTER (≈224 px against 294) — nothing falls below the
          //    fold any more and the steering pad comes back out from under it.
          //    Width 23rem = 368 px, which stays clear of the notification
          //    column (x ≥ 528 on the 780 stage, ≥ 541 on the iPhone): that
          //    column is `z-30` against this sheet's `z-20`, so a menu row
          //    under a notification card would be a dead row — the exact §I11
          //    mechanism, and the reason this does not simply go full-width.
          //  · COMPACT DROPS THE TITLE LINE. 26 px, and on a phone it is pure
          //    repetition: the student tapped this lesson's card one screen
          //    ago, and the trigger button still carries `title={titleBg}` for
          //    a pointer. It stays on a roomy stage, where the sheet is not
          //    competing with the road for height.
          //
          // ── AND AGAIN FOR THE «ЗВУК» ROW (sweep w10) ────────────────────────
          //
          // The block above is why adding a row here is not free, so the row
          // added below it is priced against the same ladder. ⚠ THIS IS
          // ARITHMETIC ON THE MEASUREMENT ABOVE, NOT A FRESH PHOTOGRAPH — a
          // browser re-measure of portrait is what the next round owes this
          // block, and the number below is what it should expect to find.
          //
          //   portrait   `grid-cols-1`, no two-column relief. The row carries a
          //              hint, so it costs 56.5 px, not 43.5 (the arithmetic is
          //              on PlayMenuRow). 370 → ~426.5, so the sheet's foot goes
          //              from y 428 to ~y 484 and the 3 px of clearance over
          //              «Мигач надясно» is spent: the sheet now lands ON that
          //              station rather than above it.
          //   landscape  two columns, row-major. On the 8-row set the six
          //              `07b-menu.png` frames photograph, «Звук» and «Качество»
          //              share one grid row and their hints share its height —
          //              the sheet does not grow at all. On the 10-row set
          //              (pre-drive + fullscreen both live) they fall in
          //              different rows and it grows by one 12.5 px hint line,
          //              still far under the 294 px that forced two columns.
          //
          // WHY THAT IS A PRICE AND NOT A REGRESSION — two mechanisms, both on
          // this element, and neither of them was invented for this row:
          //
          //  · COVERING A THUMB STATION IS NO LONGER A DEAD CONTROL. §W3: this
          //    sheet PAUSES the scene (`onOpenChange` → `playMenuOpen` → the
          //    scene's `paused`), every TouchControls button is inert while it
          //    is up, and that seam is gated in `shellViewportContract.test.ts`.
          //    It is the whole reason the eighth row was affordable in the first
          //    place.
          //  · A ROW CANNOT FALL BELOW THE FOLD, because the wrapper caps at
          //    `maxHeight: calc(100% - 1rem)` and this element is `min-h-0
          //    overflow-y-auto`: past the cap the sheet SCROLLS instead of
          //    growing off the stage. That pair was ungated — a verifier noted
          //    that 724 tests pass with it deleted — and `soundChoice.test.ts`
          //    now pins both, because it is what makes the ninth row safe too.
          className={`pointer-events-auto flex min-h-0 flex-col overflow-y-auto rounded-2xl border border-border bg-background/95 p-1.5 backdrop-blur ${
            compact ? "w-60 max-w-[70vw] [@media(orientation:landscape)]:w-[23rem]" : "w-60 max-w-[70vw]"
          }`}
        >
          {compact ? null : (
            <p className="truncate px-2 py-1 text-[11px] font-bold text-muted">{titleBg}</p>
          )}
          <div
            role="none"
            className={
              compact
                ? "grid grid-cols-1 [@media(orientation:landscape)]:grid-cols-2 [@media(orientation:landscape)]:gap-x-1"
                : "flex flex-col"
            }
          >
            {items.map((item) => (
              <PlayMenuRow key={item.key} item={item} onChosen={() => setOpen(false)} />
            ))}
          </div>
          {/* ODbL. The shell's attribution footer is hidden in every immersive
              layout, and compact is now ALWAYS immersive — so on a phone this
              menu is the only place the district's source can be credited. It
              is required (district-v1.json meta), so it goes where the student
              can actually reach it rather than nowhere. It is NOT merged into
              the title line above: that line truncates on a long lesson name,
              and a truncated attribution is a missing attribution. */}
          <p className="px-2 pb-0.5 pt-1.5 text-[10px] text-muted">
            © OpenStreetMap contributors
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function LessonPlayShell({
  lesson,
  quality,
  onQualityChange,
  nextLesson,
  onExitToSelect,
  onStartLesson,
  onStartScenario,
  onDevTelemetry,
}: {
  lesson: LessonSpec;
  quality: QualityPreset;
  /**
   * §I26(c) — THE QUALITY CONTROL, MID-LESSON.
   *
   * His filed complaint, verbatim: *"if the frame rate is bad he still has to
   * leave the session to change anything."* The preset existed and lived on the
   * lesson-SELECT screen only, so acting on a bad frame rate cost the whole
   * session. Passing this makes the row appear in the lesson menu; the owner
   * (`simulator-client.tsx`) hands over the same `setQuality` the select screen
   * uses, so the two controls are one setting and cannot disagree.
   *
   * NOTHING REMOUNTS WHEN IT FIRES. `SceneSlot`'s `key` is `sceneEpoch` (the
   * restart counter), not the tier, so the Canvas, the physics world and the
   * lesson session all survive: what changes is `dpr={[1, canvasMaxDpr(level)]}`
   * on the live renderer, the preset the environment reads, and the texture
   * budget — and the PBR loaders resolve to `null` and keep the procedural
   * fallback rather than suspending, so the world never blanks mid-drive.
   *
   * Absent (the /dev rigs) ⇒ no row, exactly as before.
   */
  onQualityChange?: (q: QualitySelection) => void;
  /** The following lesson in the curriculum (for „Следващ урок“); null on L4. */
  nextLesson: { id: string; titleBg: string } | null;
  onExitToSelect: () => void;
  onStartLesson: (lessonId: string) => void;
  /**
   * S1 „Следващ сценарий": launch another scenario rung. Same (templateId,
   * level) shape the catalog's own picker uses (ScenarioCatalog onStart) —
   * the owner compiles and remounts. Absent on curriculum sessions ⇒ no CTA.
   */
  onStartScenario?: (templateId: string, level: ScenarioLevel) => void;
  /**
   * DEV DRIVE RIG ONLY (/dev/drive-rig — 404s in production). Read-only tap on
   * the tick path: the SAME tick the rules saw, plus the step result they
   * produced, handed to the rig so it can publish per-frame telemetry ALONGSIDE
   * the fault cards this shell renders.
   *
   * WHY IT EXISTS. /dev/gw-shell mounts this shell and shows the cards but
   * publishes no position and no speed; /dev/ghost-demo publishes telemetry but
   * mounts a bare LessonScene with no cards. So „was that conviction correct?"
   * had no answer — you could photograph the CARD or read the car's STATE,
   * never both (register rows B15, B29). The rule events, the objective chain
   * and the HUD cards only exist in THIS component, so the tap has to be here.
   *
   * Never passed by /simulator: absent ⇒ the tick path is byte-identical.
   */
  onDevTelemetry?: (tick: SimTick, step: LessonStepResult) => void;
}) {
  /**
   * WHICH CONTROLS THIS SESSION'S HINTS MAY NAME — doc 91 §J-WAVE-4 item 2.
   *
   * `hasTouchScreen()` is the SAME predicate `LessonScene` mounts
   * `TouchControls` on, so the copy names on-screen cells exactly when those
   * cells exist — including on a touch laptop, where both are true and both
   * are right. Read once, in a lazy initializer: this shell is client-only
   * (the whole play route is), so there is no SSR pass to mismatch, and a card
   * whose wording changed mid-lesson because a matchMedia flipped would be a
   * worse defect than the one being fixed.
   */
  const [hintInput] = useState<HintInput>(() => hintInputFor(hasTouchScreen()));
  // Engine state: ref-resident, frame-rate mutations, zero re-renders.
  const [initialSession] = useState(() => createLessonSession(lesson));
  const sessionRef = useRef<LessonSessionState>(initialSession);
  const finalizedRef = useRef(false);
  const lastTickRef = useRef<SimTick | null>(null);
  /**
   * THE RIM — the latch and the card it raises.
   *
   * A learner reaches the end of the authored world 60–78 m past the last road
   * on EVERY map in the product (the census in runtime/district.ts, measured
   * over all 105 committed districts). Until 2026-08-24 nothing said so: the
   * measure existed, was gated by its own test, and had no consumer anywhere —
   * so a student who drove straight on simply arrived in a featureless void,
   * with the lesson still asking for a turn that was now behind them.
   *
   * The latch starts ARMED and the trigger is edge-based with hysteresis
   * (`worldEdgeWarning`): one card on the way out, and no second card until the
   * student has demonstrably come back. A warning that repeats is a warning
   * that gets ignored.
   */
  const worldEdgeArmedRef = useRef(true);
  const [worldEdgeNear, setWorldEdgeNear] = useState(false);
  // A1: latest driveline snapshot from the scene (a few Hz) — ref-resident,
  // folded into the HUD snapshot by the regular poll below.
  const drivelineRef = useRef<DrivelineSnapshot | null>(null);
  const handleDriveline = useCallback((snap: DrivelineSnapshot) => {
    drivelineRef.current = snap;
  }, []);
  // Status dashboard channel: the scene MUTATES this shared object per frame
  // (real blink clock, driveline, speed); the StatusDashboard bar samples it
  // on its own low-Hz interval (hud/dashboardStatus.ts perf grammar).
  const dashboardStatusRef = useRef<DashboardStatus>(createDashboardStatus());
  // Rejected driveline actions (start interlock / selector gate) → visible
  // feedback: gear-telltale flash + a short hint toast (handler below, after
  // nowSec/push exist). The counter keys the one-shot CSS flash.
  const [gearRejectFlash, setGearRejectFlash] = useState(0);
  const rejectionToastAtRef = useRef<Record<string, number>>({});
  // Clocks are set in a mount effect (render must stay pure per lint rules).
  const startedAtMsRef = useRef<number | null>(null);
  const mountedAtRef = useRef<number | null>(null);
  useEffect(() => {
    startedAtMsRef.current ??= Date.now();
    mountedAtRef.current ??= performance.now();
  }, []);

  const [snap, setSnap] = useState<HudSnapshot>(() => snapshotOf(initialSession, null));
  // THE 13/13 MOMENT (founder acceptance, 2026-07-31). The thirteenth step IS
  // pulling away, so the instant it completes the phase flips to „driving" and
  // the checklist unmounted mid-gesture — the student never saw the list he had
  // just finished, and „photograph the checklist at 13/13" was literally
  // impossible. The panel now holds for a beat afterwards, showing every row
  // ticked and „Готово — всичките 13 стъпки са изпълнени", then leaves. It is
  // capped in height (see the mount below) so it cannot cover a control while
  // it lingers.
  const [preDriveJustDone, setPreDriveJustDone] = useState(false);
  const prevPhaseRef = useRef(snap.phase);
  useEffect(() => {
    const was = prevPhaseRef.current;
    prevPhaseRef.current = snap.phase;
    if (was !== "preDrive" || snap.phase === "preDrive") return;
    setPreDriveJustDone(true);
    const id = window.setTimeout(() => setPreDriveJustDone(false), PRE_DRIVE_DONE_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [snap.phase]);
  // R3 #22: the scene's remount key — „Повтори" bumps it so the 3D world
  // restarts from spawn (fresh physics, re-armed staged encounters) exactly
  // like a first mount. The shell itself stays mounted (its owner keys it on
  // the lesson id, which does not change on a retry).
  const [sceneEpoch, setSceneEpoch] = useState(0);
  const [flash, setFlash] = useState<ObjectiveFlash | null>(null);
  const flashKey = useRef(0);
  const [minimapFrame, setMinimapFrame] = useState<MinimapFrame | null>(null);
  const [result, setResult] = useState<LessonResult | null>(null);
  const [saveResult, setSaveResult] = useState<FinishLessonActionResult | null>(null);
  // I1 „Позна ли се?" (doc 82 §5.3): null = the gate has not resolved yet and
  // the end screen stays hidden behind it. Reset on every retry with the rest
  // of the end-screen state, so a second run asks again.
  const [calibrationDone, setCalibrationDone] = useState(false);
  // I2 „Твоят дубъл": did this attempt actually upload a trace? Only then does
  // the replay route have something to load.
  const [traceUploaded, setTraceUploaded] = useState(false);
  const { toasts, push, dismiss, clear } = useHudToastQueue();

  // -- S1: scenario sessions (<templateId>@L<n>) --------------------------------
  // The template (rubric + teach copy), a live ATTEMPT recorder the scene
  // streams into (glances feed the observation stars), and the rubric result
  // for the end screen. All null/inert on curriculum lessons.
  const scenarioRef = useMemo(() => parseScenarioLessonId(lesson.id), [lesson.id]);
  const scenarioSpec: ScenarioSpec | null = useMemo(
    () => (scenarioRef ? scenarioById(scenarioRef.templateId) : undefined) ?? null,
    [scenarioRef],
  );
  const [attemptRecorder] = useState<LiveTraceRecorder | null>(() =>
    parseScenarioLessonId(lesson.id) !== null
      ? createTraceRecorder({ scenarioId: lesson.id, kind: "attempt" })
      : null,
  );
  const attemptRecorderRef = useRef<LiveTraceRecorder | null>(attemptRecorder);
  const [rubric, setRubric] = useState<RubricScore | null>(null);

  // -- THEO-3: mistake-experience sessions (<templateId>@L<n>~m<i>) -------------
  // The sandbox where the student performs the wrong action ON PURPOSE.
  // Resolution mirrors the scenarioRef block (scenarioRef itself stays null —
  // the `~m` id is foreign to the rung namespace, so no rubric, no recorder,
  // no next-scenario CTAs). The engine's suppression + one-shot moment are
  // driven by lesson.mistakeExperience; the shell only presents.
  const mistakeRef = useMemo(() => parseMistakeExperienceLessonId(lesson.id), [lesson.id]);
  const mistakeSpec: ScenarioSpec | null = useMemo(
    () => (mistakeRef !== null ? scenarioById(mistakeRef.templateId) ?? null : null),
    [mistakeRef],
  );
  const mistakeDemo: MistakeDemo | null =
    lesson.mistakeExperience !== undefined && mistakeRef !== null && mistakeSpec !== null
      ? mistakeSpec.mistakes[mistakeRef.mistakeIndex] ?? null
      : null;
  const mistakeMode = mistakeDemo !== null;
  // The consequence pause: the live moment, or null-moment = „Виж
  // демонстрацията" (the fallback after the generous no-mistake window).
  const [consequence, setConsequence] = useState<{ moment: TeachMoment | null } | null>(null);
  const [demoOffered, setDemoOffered] = useState(false);

  // -- QW1: fullscreen (immersive) mode ----------------------------------------
  // The fullscreen ELEMENT is the shell root (not just the canvas): the
  // browser then hides all surrounding dashboard chrome for free, while the
  // slim top bar (abort/finish, quiz frequency) stays reachable inside.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Does this browser have the Fullscreen API for a non-<video> element?
  // iPhone Safari does NOT (see fullscreen.ts) — there the shell has to make
  // itself immersive with CSS instead. Resolved in an effect, never during
  // render: the server cannot know, and a guessed class here would be a
  // hydration mismatch.
  const [fullscreenAvailable, setFullscreenAvailable] = useState(true);

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(fullscreenElementOf(document) === rootRef.current);
    };
    for (const name of FULLSCREEN_CHANGE_EVENTS) {
      document.addEventListener(name, onChange);
    }
    return () => {
      for (const name of FULLSCREEN_CHANGE_EVENTS) {
        document.removeEventListener(name, onChange);
      }
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (fullscreenElementOf(document) !== null) {
      exitFullscreen(document);
    } else {
      // Denied (permissions policy / lost activation) — letterboxed play
      // still works; the ⛶ button and X remain available.
      requestFullscreen(el, document);
    }
  }, []);

  // Enter fullscreen on lesson start: this shell mounts synchronously from
  // the start click on the select screen, so the transient user-activation
  // window of that gesture is still open when this mount effect runs
  // (Chrome/Firefox). Stricter browsers reject → we stay letterboxed,
  // no error surfaced (Esc always exits; fullscreenchange syncs state).
  // A browser with NO Fullscreen API at all (iPhone Safari) is not an error
  // either — it switches the shell to the CSS immersive layout below.
  useEffect(() => {
    const el = rootRef.current;
    const available = supportsFullscreen(el);
    setFullscreenAvailable(available);
    if (!available || fullscreenElementOf(document) !== null) return;
    requestFullscreen(el, document);
  }, []);

  // CSS stand-in for fullscreen: pin the shell to the dynamic viewport so the
  // scene still gets the whole screen on a browser that will not grant a real
  // fullscreen element. Without it an iPhone plays a 16:9 letterbox inside a
  // padded dashboard column — about 200 px of 3D on a 390 px-wide phone.
  //
  // COMPACT is the 2026-07-28 second-pass addition (see immersive.ts for the
  // measured why): a phone-shaped viewport is immersive whether or not the
  // Fullscreen API exists, and it also switches the HUD to its in-canvas
  // grammar — no chrome rows, an edge-to-edge instrument band, a teach sheet
  // instead of a teach modal.
  const compact = useCompactHud();
  // WHAT THE STUDENT CHOSE, as opposed to what is rendering (`quality`). The
  // quality row has to be able to show „Авто · Ниско" — the state where the
  // auto-quality probe is still the one deciding — and tell it apart from a
  // deliberate «Ниско». Reading the store rather than threading a second prop
  // keeps the select screen and this menu on one source of truth.
  const qualitySelection = useQualitySelection();
  const standalone = useStandaloneDisplay();
  const immersive = shouldGoImmersive({
    isFullscreen,
    fullscreenAvailable,
    compact,
    standalone,
  });
  /**
   * ── DOC 91 · C6/§I7 — THE ARGUMENT, NOT THE BODY ─────────────────────────
   *
   * This read `immersive && !isFullscreen`. The hook returns early when its
   * argument is false and KEEPS ITS LAST VALUE, so entering fullscreen froze
   * `--sim-vh` at the pre-fullscreen height and the two sheets that size
   * themselves from it (`TeachMomentOverlay:214`, `SimOverlay`'s open sheet)
   * were then allowed 0.62 of a viewport that no longer existed. §C6 measured
   * it across a full rotation: `--sim-vh` read `852px` at every sample while
   * the viewport went 393×852 → 852×393 → 852×453 → 852×393.
   *
   * WHAT MUST STAND DOWN IN FULLSCREEN IS THE INLINE HEIGHT, NOT THE
   * MEASUREMENT, and the height is guarded separately in the `style` prop
   * below (`immersive && !isFullscreen`). Widening this argument therefore
   * changes no element's height; it only makes the published variable true.
   *
   * AND IT DOES NOT MOVE THE ARC. The ledger warned that widening this makes
   * §D6's thumb-arc track the URL bar MORE. Read against the tree, it cannot:
   * `--sim-vh` has exactly three consumers in the whole app — the two
   * `maxHeight` calcs above and this element's own `style` — and the arc's
   * `ARC_RISE` clamp resolves `100%` against its containing block's HEIGHT,
   * which is the inline height on the line below. That height's condition is
   * unchanged by this edit. The only state this widens is `isFullscreen`, and
   * in fullscreen there is no URL bar to track.
   *
   * Confirmed on the deployed product before the change (tools/mobile/wave6-edges.mjs,
   * WebKit, iPhone 16 landscape, authenticated /simulator, live canvas):
   * after a −44 px viewport change and back, `--sim-vh` read `349px` while
   * `visualViewport.height` was 393 — 44 px of published lie.
   */
  const viewportBox = useVisualViewportBox(immersive || isFullscreen);
  const viewportH = viewportBox?.h ?? null;

  // -- The single overlay layer (compact only) ---------------------------------
  // ROOMY LAYOUTS ARE UNTOUCHED. A 1440 px window has room for a banner, a
  // toast column and a teach modal, the desktop Space-to-acknowledge is already
  // wired through TeachMomentOverlay, and the founder's complaint is about a
  // 393 px phone. So the queue replaces the racing panels on `compact` and
  // nowhere else — one grammar per device class, neither one a shrunken copy
  // of the other („Everything cant be like the web version").
  //
  // `taskPing` re-announces the task line from the micro menu: the price of
  // making the banner transient is that it must be recallable in one tap.
  const [taskPing, setTaskPing] = useState(0);
  // The end-of-session verdict opens as a LINE, not as a full-frame modal
  // („the crash debrief covers the entire frame including the controls").
  // Tapping it is the explicit pause that earns the whole screen.
  const [endExpanded, setEndExpanded] = useState(false);
  // A detail sheet is open → the scene's own corner chrome stands down too.
  const [overlaySheetOpen, setOverlaySheetOpen] = useState(false);
  // …and «Меню на урока», for the same reason and by the same seam. See the
  // block on PlayMenu's `onOpenChange`.
  const [playMenuOpen, setPlayMenuOpen] = useState(false);

  // -- Doc 86 L14/L15: the ROOMY notification settings -------------------------
  //
  // The comment above ("ROOMY LAYOUTS ARE UNTOUCHED") described the mobile
  // wave's scope, and doc 86 L14 is what that scope cost: desktop is the
  // surface the founder actually reviewed on, and there the four-card,
  // click-proof toast column and the self-opening debrief were still exactly as
  // he found them. These two settings are the roomy answer — the queue grammar
  // stays a phone thing, but „dismissible", „fewer", „smaller" and „let me turn
  // it off" now apply to both device classes.
  //
  // Both are lazy `useState` initializers reading localStorage, which is safe
  // for the same reason `readStoredQuizFrequency` is: this shell only ever
  // mounts client-side, after the student picks a lesson.
  const [toastsQuiet, setToastsQuiet] = useState<boolean>(() =>
    readStoredFlag(TOAST_QUIET_STORAGE_KEY, TOAST_QUIET_DEFAULT),
  );
  const toggleToastsQuiet = useCallback(() => {
    setToastsQuiet((on) => {
      const next = !on;
      writeStoredFlag(TOAST_QUIET_STORAGE_KEY, next);
      return next;
    });
  }, []);
  const [endAutoOpen, setEndAutoOpen] = useState<boolean>(() =>
    readStoredFlag(SESSION_END_AUTO_STORAGE_KEY, SESSION_END_AUTO_DEFAULT),
  );
  const setEndAutoOpenPersisted = useCallback((next: boolean) => {
    setEndAutoOpen(next);
    writeStoredFlag(SESSION_END_AUTO_STORAGE_KEY, next);
  }, []);
  // Session-local: „I skipped the debrief for THIS run." Distinct from the
  // persisted setting on purpose — skipping once must not silently rewrite a
  // preference, and re-opening once must not silently restore one.
  const [endSkipped, setEndSkipped] = useState(false);
  // A6: the ids of overlay lines the student has sent away with the ✕. A Set in
  // state and not a ref, because the filter below has to re-run on the render
  // that follows the tap — a card that comes back on the next 150 ms HUD poll
  // has not been dismissed, it has blinked. Ids carry their content (the task
  // id is `task:2/3:<title>:<ping>`), so dismissing one line never silences the
  // next one.
  const [dismissedOverlayIds, setDismissedOverlayIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const dismissOverlayItem = useCallback((it: SimOverlayItem) => {
    setDismissedOverlayIds((prev) => {
      if (prev.has(it.id)) return prev;
      const next = new Set(prev);
      next.add(it.id);
      return next;
    });
  }, []);
  /**
   * ── DOC 91 · C5/§I5(b) — THE WAY BACK, AND THE GENERAL RULE BEHIND IT ─────
   *
   * §D9's one-sentence diagnosis of the dead end was „an unbounded dismiss
   * set": added to at exactly one place, cleared at none. `noDismiss` (§I5(a))
   * stops the pre-drive line from entering that set in the first place; this is
   * the SECOND writer, and the two are deliberately independent, because the
   * rule §I5 draws is general and outlives this one card:
   *
   *     ANY LINE THE STUDENT CAN SEND AWAY NEEDS A WAY BACK.
   *
   * It is the same recall grammar «Задача» has had since the task line became
   * transient (three lines further down the menu list) and «Виж разбора» has on
   * the end screen. A student who lands in a session started before this
   * shipped, or who reaches the set by any path added later, has a labelled
   * control that returns the checklist instead of „abort or reload".
   */
  const recallPreDriveOverlay = useCallback(() => {
    setDismissedOverlayIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const id of prev) if (!id.startsWith("predrive:")) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, []);
  // -- THE BRIEFING (2026-08-02) -----------------------------------------------
  //
  // `lesson.briefingBg` is the numbered „какво ще правиш" list every scenario
  // template hand-authors. Until this wave `compileScenario` dropped it and no
  // component read it, so a drill whose step 1 says „Включи фаровете — вече е
  // тъмно" never said it to anybody, while the world-referent gate read that
  // same unrendered field as proof the duty had been stated. The card below is
  // the delivery half of that fix; `world/referents.ts` reads THIS field, and
  // `referent-evidence-reachable.test.ts` fails if it ever stops rendering.
  //
  // Grammar: it is up when the session starts and the student closes it. It is
  // never up in the THEO-3 sandbox (the assignment there IS the mistake) and it
  // stands down the moment a pause overlay owns the glass.
  const briefing = lesson.briefingBg ?? [];
  const [briefingOpen, setBriefingOpen] = useState(true);
  const closeBriefing = useCallback(() => setBriefingOpen(false), []);

  // -- A6: DISMISSING THE ADVISOR PROMPT ---------------------------------------
  //
  // Founder: „those pop ups … need to be able to be removed when clicked with
  // the mouse". The advisor card had no control at all — the nearest thing was
  // „Съветник: изкл." in the ⚙ sheet, which is a different intention (stop
  // advising me AT ALL) wearing this one's clothes.
  //
  // Dismiss is therefore scoped to the PROMPT, not to the mode: the text that
  // was on screen when he clicked is remembered, and the card returns the
  // moment the engine has something DIFFERENT to say. That is what makes it
  // safe against requirement zero — the advisor is a teaching surface, and a
  // click meaning „I have read this one" must not silently become „never
  // explain anything to me again". Cleared on every retry with the rest of the
  // per-run state (`sceneEpoch`), so a fresh run always starts advised.
  const [advisorDismissed, setAdvisorDismissed] = useState<string | null>(null);

  // What the advisor card has left to say once the objective banner's own
  // sentence is taken out of it — `advisorEchoTrim`, above, which is where the
  // reasoning and the measured frame live. `null` means „nothing but the echo",
  // and the card then does not render at all.
  //
  // Memoised on the two strings it reads rather than computed in the JSX: this
  // shell re-renders on a 150 ms HUD poll for the whole drive, and the prompt
  // changes only when the objective does.
  const advisorTextBg = useMemo(
    () =>
      snap.advisorPrompt === null
        ? null
        : advisorEchoTrim(snap.advisorPrompt.textBg, snap.objectiveTitle),
    [snap.advisorPrompt, snap.objectiveTitle],
  );

  // Armed cabin faults, sampled at the status bar's own cadence. Only the
  // ARMED SET matters, so the key comparison keeps this from re-rendering the
  // shell every 150 ms (the TelltaleEdgePings precedent).
  const [warnings, setWarnings] = useState<TelltaleWarning[]>([]);
  useEffect(() => {
    if (!compact) return;
    const id = window.setInterval(() => {
      const st = dashboardStatusRef.current ?? createDashboardStatus();
      const next = armedTelltaleWarnings(st);
      setWarnings((prev) =>
        telltaleWarningsKey(prev) === telltaleWarningsKey(next) ? prev : next,
      );
    }, HUD_POLL_MS);
    return () => {
      window.clearInterval(id);
      setWarnings((prev) => (prev.length === 0 ? prev : []));
    };
  }, [compact]);

  // -- The LETTERBOXED play area (founder 2026-07-28) --------------------------
  // „when not full screen in simulator mode … there is alot of dark space that
  // we can use to make the screen bigger, thats before pushing full screen."
  //
  // The scene box used to be `aspect-video w-full`, which consults exactly one
  // axis: it took the reading column's width and derived a height, so the
  // window's HEIGHT was never spent. Measured at 1920×1080 (dev harness
  // `?chrome=dashboard`, the real dashboard column): 1088×612 = 32 % of the
  // window, ~390 px of dead height under the picture.
  //
  // Two halves, and neither touches the aspect ratio — see playArea.ts for why
  // 16:9 is a measured constraint (below ~1.75 the headliner enters the frame
  // and the cockpit-camera contract's header band breaks):
  //   1. WIDTH — PlayAreaStyles lifts the prose `max-w-6xl` off the <main> that
  //      contains a letterboxed session, so the picture may use the whole
  //      content column instead of a 72 rem reading measure.
  //   2. HEIGHT — this measurement caps the picture's width at
  //      (height left under it) × 16/9, so growing sideways can never push the
  //      dashboard or the attribution footer off the bottom of the window.
  // `topInDocument` is the box's absolute document offset (rect + scrollY), so
  // a scrolled page measures the same as an unscrolled one.
  const sceneBoxRef = useRef<HTMLDivElement | null>(null);
  const [playMaxWidth, setPlayMaxWidth] = useState<number | null>(null);
  useEffect(() => {
    // Immersive sizes itself from the viewport and ignores this value — no need
    // to clear it, and KEEPING the last measurement means leaving fullscreen
    // paints the right size immediately instead of flashing the CSS fallback.
    if (immersive) return;
    const measure = () => {
      const box = sceneBoxRef.current;
      if (box === null) return;
      const topInDocument = box.getBoundingClientRect().top + window.scrollY;
      setPlayMaxWidth(
        playMaxWidthPx(window.innerHeight - topInDocument - PLAY_BOTTOM_GUTTER_PX),
      );
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    // The top bar rewraps (narrow window, exam badge, a font landing) and moves
    // the box's top without any window resize. The measurement does not depend
    // on the box's own size, so re-running it on our own reflow converges
    // instead of looping.
    const observer = new ResizeObserver(measure);
    if (rootRef.current !== null) observer.observe(rootRef.current);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      observer.disconnect();
    };
  }, [immersive]);

  // -- Minimap: on demand, not always-on (founder 2026-07-28) ------------------
  const [minimapOn, setMinimapOn] = useState<boolean>(readStoredMinimapOn);
  const toggleMinimap = useCallback(() => {
    setMinimapOn((on) => {
      const next = !on;
      try {
        window.localStorage.setItem(MINIMAP_STORAGE_KEY, next ? "on" : "off");
      } catch {
        // Private mode etc. — the in-memory value still applies this session.
      }
      return next;
    });
  }, []);

  // -- Sound: the ⚙ sheet's «Звук» row (sweep w10, nine rows) -----------------
  //
  // Read-only here. The bit is owned by `scene/simAudioMuteStore`, because the
  // thing that has to obey it is a `SimAudio` built inside `LessonScene`'s
  // mount effect and there is no prop path from this sheet to it. Note what
  // this row is NOT: it is not a new feature. The mix has always been there and
  // has always been mutable — from the M key, and from nothing else, which on a
  // phone is nowhere at all. Six mobile `07b-menu.png` frames photograph this
  // exact sheet with no sound row in it.
  const soundMuted = useSimAudioMuted();

  // X toggles fullscreen (F is taken by the rear-mirror glance), P toggles the
  // minimap. Both are listed in the controls legend (LessonScene ControlsHelp).
  // P and not M: M is already the audio-mute key (scene/cabin.ts CABIN_KEYS),
  // and every other map-ish letter is taken too (K = auto rear view, G/N =
  // top-down zoom/orientation, C = camera cycle).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "KeyX") toggleFullscreen();
      else if (e.code === "KeyP") toggleMinimap();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen, toggleMinimap]);

  // A13: exam session — teach/quiz/guidance machinery OFF, examiner framing
  // ON. The always-grade + termination behavior lives in the engine (it reads
  // lesson.examMode itself); the shell only adapts the presentation.
  const examMode = lesson.examMode === true;

  // „Съветник" (advisor) toggle: persisted preference wins; otherwise ON for
  // the beginner rungs, OFF from level 3 up. Hidden & inert entirely on exam
  // sessions (the pure module also returns null there — defense in depth).
  const [advisorOn, setAdvisorOn] = useState<boolean>(() => readStoredAdvisorOn(lesson));
  const toggleAdvisor = useCallback(() => {
    setAdvisorOn((on) => {
      const next = !on;
      try {
        window.localStorage.setItem(ADVISOR_STORAGE_KEY, serializeAdvisorSetting(next));
      } catch {
        // Private mode etc. — the in-memory value still applies this session.
      }
      return next;
    });
  }, []);

  // A2: pre-drive mode (Instruction→Practice→Assess). The machine applies the
  // matching order-scoring; the shell derives the presentation from it.
  const preDriveMode: PreDriveMode = lesson.preDriveMode ?? "instruction";
  // Session time of the last completed step — the practice-idle hint reads it.
  const lastPreDriveStepAtRef = useRef(0);

  // -- micro-quiz: the theory↔driving closed loop ------------------------------
  // The pure trigger lives in a ref (frame-rate, zero re-renders); an active
  // quiz is React state (it pauses the drive + renders the overlay).
  const [quizFreq, setQuizFreq] = useQuizFrequency();
  const quizFreqRef = useRef<QuizFrequency>(quizFreq);
  const quizBankRef = useRef<MicroQuizQuestion[]>([]);
  // The capability that came with the bank (audit M-10, closed on this door
  // 2026-08-04). It is a session token, not an answer — nothing about which
  // option is correct is in it — so holding it client-side is exactly what the
  // theory practice page already does with its own. "" until a bank arrives;
  // the server refuses a submission it does not cover.
  const quizTicketRef = useRef<string>("");
  const quizTriggerRef = useRef<QuizTriggerState | null>(null);
  const quizStatsRef = useRef<{ total: number; correct: number }>({ total: 0, correct: 0 });
  const [activeQuiz, setActiveQuiz] = useState<TriggeredQuiz | null>(null);

  // Load the concept-linked question bank once per lesson (server-sanitized),
  // then build the pure trigger from it. No bank ⇒ no quizzes (graceful).
  // A13: exam sessions never quiz — the bank is not even fetched, so the
  // trigger stays null and observeQuizTick is never armed.
  // THEO-3: the mistake-experience sandbox never quizzes either — the one
  // assignment is the mistake; a quiz pause would fight the consequence pause.
  useEffect(() => {
    if (examMode || lesson.mistakeExperience !== undefined) return;
    let cancelled = false;
    void loadMicroQuizBank(lesson.id).then(
      ({ questions, ticket }) => {
        if (cancelled) return;
        quizBankRef.current = questions;
        quizTicketRef.current = ticket;
        quizTriggerRef.current = createQuizTriggerState(quizFreqRef.current, questions);
      },
      () => {
        /* bank load failed — leave the trigger null */
      },
    );
    return () => {
      cancelled = true;
    };
  }, [lesson.id, lesson.mistakeExperience, examMode]);

  // Frequency changes apply immediately, keeping the session's counters.
  useEffect(() => {
    quizFreqRef.current = quizFreq;
    if (quizTriggerRef.current) {
      quizTriggerRef.current = { ...quizTriggerRef.current, frequency: quizFreq };
    }
  }, [quizFreq]);

  // The overlay knows nothing about tickets — it asks a question and reports an
  // answer. This closure carries the drive's capability so the server can bind
  // the submission to the bank it actually dealt.
  const handleQuizSubmit = useCallback(
    (questionId: string, selectedOptionIds: string[]) =>
      submitMicroQuizAnswer(questionId, selectedOptionIds, quizTicketRef.current),
    [],
  );

  const handleQuizDone = useCallback((correct: boolean) => {
    quizStatsRef.current = {
      total: quizStatsRef.current.total + 1,
      correct: quizStatsRef.current.correct + (correct ? 1 : 0),
    };
    setActiveQuiz(null); // resume the drive
  }, []);

  // -- A9: teach-moment pause queue ---------------------------------------------
  // First-encounter teachable mistakes PAUSE the sim with a mini-lesson card
  // (doc 65 §5). The engine rate-limits pauses (TEACH_PAUSE_MIN_GAP_S) and a
  // same-batch cluster lands here as several moments at once — they merge
  // into ONE pause: the overlay pages through the queue, and the drive
  // resumes only when the last card is acknowledged. Physics freezing uses
  // the same `paused` mechanism as the micro-quiz overlay.
  const [teachQueue, setTeachQueue] = useState<TeachMoment[]>([]);
  const handleTeachAcknowledged = useCallback(() => {
    setTeachQueue((q) => q.slice(1));
  }, []);

  /** Session clock: prefer the runtime's tick time; wall clock before ticks flow. */
  const nowSec = useCallback((): number => {
    const t = lastTickRef.current?.t ?? 0;
    const mountedAt = mountedAtRef.current ?? performance.now();
    return Math.max(t, (performance.now() - mountedAt) / 1000);
  }, []);

  // A rejected driveline action must never be silent (founder bug
  // 2026-07-10): flash the gear telltale on every refused shift and show the
  // WHY as a short hint toast (kind "lesson" body, 3.5 s TTL, no law-ref),
  // rate-limited per reason so key-mashing keeps one toast, not four.
  const handleDrivelineRejection = useCallback(
    (rejection: DrivelineRejection, snap: DrivelineSnapshot) => {
      if (finalizedRef.current) return;
      if (rejection.kind === "shiftRejected") setGearRejectFlash((k) => k + 1);
      const hint = rejectionHint(rejection, snap, hintInput);
      const t = nowSec();
      const last = rejectionToastAtRef.current[hint.key] ?? Number.NEGATIVE_INFINITY;
      if (t - last < REJECTION_TOAST_COOLDOWN_S) return;
      rejectionToastAtRef.current[hint.key] = t;
      push(
        [{ kind: "lesson", titleBg: hint.titleBg, explanationBg: hint.explanationBg }],
        REJECTION_TOAST_TTL_MS,
      );
    },
    [hintInput, nowSec, push],
  );

  // …and the refusal that has no DrivelineEvent at all, because nothing was
  // rejected: the selector really did move to R, and the PEDAL is what the car
  // is declining to read as throttle (engine/reverseAssist.ts LAW 2). It is
  // the same class of defect as the one above — an input refused for a reason
  // the student cannot see — so it gets the same treatment and the same
  // channel. NOT the 3.5 s rejection TTL: this one carries three sentences of
  // explanation, so it keeps the kind's own 8 s teaching TTL (HudToasts.ts,
  // TEACHING_TOAST_TTL_MS ≈ 15 chars/s at driving load). The machine's own
  // REVERSE_STUCK_REPEAT_S rate-limits it upstream, on the STATE rather than
  // on a clock here — a driver who lifts is never told twice.
  const handleReversePedalStuck = useCallback(
    (direction: ReverseStuckDirection) => {
      if (finalizedRef.current) return;
      const hint = reverseStuckHint(direction);
      push([{ kind: "lesson", titleBg: hint.titleBg, explanationBg: hint.explanationBg }]);
    },
    [push],
  );

  // …and the same defect with no guard behind it at all: the throttle is down
  // and the CAR cannot move (engine off / P / N / parking brake on) on a rung
  // that has no pre-drive phase, so the QW10 hint below can never reach it.
  // Rate-limited upstream on the STATE (engine/stuckStart.ts), so clearing one
  // blocker is answered with the next one immediately instead of after a
  // cooldown — an instructor does not make you wait to be told the next thing.
  const handleStuckStart = useCallback(
    (reason: StuckStartReason) => {
      if (finalizedRef.current) return;
      // The LIVE tier, not the lesson's — the picker switches it mid-drive.
      const hint = stuckStartHint(
        reason,
        drivelineRef.current?.transmission ?? "automatic",
        hintInput,
      );
      push([{ kind: "lesson", titleBg: hint.titleBg, explanationBg: hint.explanationBg }]);
    },
    [hintInput, push],
  );

  // …and the one that is not a refusal at all: the tier pill moved the
  // student's own gear lever (see transmissionSwitchHint). No rate limit and
  // none needed — the driveline reports a move only when the lever really
  // moved, which takes a deliberate click on the pill, and the round trip that
  // puts a lever back where it was found reports nothing.
  const handleTransmissionChanged = useCallback(
    (transmission: TransmissionMode, movedSelectorTo: SelectorPosition) => {
      if (finalizedRef.current) return;
      const hint = transmissionSwitchHint(transmission, movedSelectorTo, hintInput);
      push([{ kind: "lesson", titleBg: hint.titleBg, explanationBg: hint.explanationBg }]);
    },
    [hintInput, push],
  );

  // THE PEDALS THAT LEFT THE SCREEN — lesson-ui/MousePedals.tsx.
  //
  // Not a refusal by a guard and not a car that cannot move: a CONTROL removed
  // itself. The pads yield to a student who has started driving on W/S, which
  // is the right behaviour and the founder's own screen budget — but measured
  // on the drive rig 2026-08-11, ONE 120 ms tap of ↓ took them for 12.4 s, no
  // click brought them back (the hidden branch renders nothing to click) and
  // nothing was said. On the lane that exists because „first and upmost it must
  // be with the mouse", a mouse-first student losing his only pedals in silence
  // is the same bare verdict THEO-4 forbids.
  //
  // The way back is now the pointer itself and it is instant, so this sentence
  // is not the fix — it is the reason, which is the half THEO-4 is about. It
  // fires at most ONCE per session and only for a student who had actually been
  // holding a pad, so a keyboard driver who never touched them never sees it.
  const handleMousePedalsYielded = useCallback(() => {
    if (finalizedRef.current) return;
    push([
      {
        kind: "lesson",
        titleBg: "Педалите се скриха — движи мишката",
        explanationBg:
          "Натисна клавиш за газ или спирачка, затова екранните педали се отдръпнаха: щом караш от клавиатурата, те само заемат от пътя. Не си ги загубил — върни ги веднага, като помръднеш мишката или щракнеш някъде в картината. Газ и спирачка работят еднакво и от двете места, включително W и S.",
      },
    ]);
  }, [push]);

  // -- finalize: fold + persist ------------------------------------------------
  const finalize = useCallback(
    (state: LessonSessionState) => {
      if (finalizedRef.current) return; // exactly one grade + one save per session
      finalizedRef.current = true;
      sessionRef.current = state;
      const r = buildLessonResult(state);
      setResult(r);

      // The recorded attempt, closed ONCE here: finish() rebases and allocates
      // the whole sample array, and both consumers below (the rubric's glance
      // mapping and the persisted trace) must read the SAME drive.
      const trace = attemptRecorderRef.current?.finish() ?? null;

      // S1 scenario rubric (doc 76 §6): observation from the recorded
      // attempt's glance events (honest measured:false when no trace), the
      // stars from the pure scorer. Display here; the SERVER recomputes the
      // persisted stars from the same validated wire channels.
      let observedMomentIds: string[] | undefined;
      if (scenarioSpec?.rubric !== undefined) {
        let observation: RubricObservationInput | undefined;
        const moments = scenarioSpec.rubric.observation?.moments;
        if (trace !== null && moments !== undefined && moments.length > 0) {
          const mapped = parkingObservationFromTrace(trace, moments);
          if (mapped !== null) {
            observation = mapped;
            observedMomentIds = [...mapped.observedMomentIds];
          }
        }
        setRubric(scoreRubric(r, scenarioSpec.rubric, observation));
      }

      // THEO-3: a mistake-experience session is a SANDBOX — never persisted
      // (no attempt rows, no stars, no XP; the wire refuses the foreign `~m`
      // id anyway). The graded retry that follows persists normally.
      if (lesson.mistakeExperience !== undefined) return;

      // I-2 „Твоят дубъл": the drive itself rides along, REDUCED here rather
      // than server-side so a 4G phone uploads ~87 KB of 10 Hz kinematics for a
      // 60 s drill instead of the 250 KB of raw float64 it recorded. Display
      // data — the server validates it and drops it silently if it is anything
      // but this session's own attempt.
      const storedTrace = trace !== null ? compactTraceForStorage(trace) : null;
      // …and whether it did decides whether the result screen may offer
      // „Виж своя дубъл". A curriculum lesson records no attempt trace, so the
      // link must not appear there — a dead link on the result screen is worse
      // than no link.
      setTraceUploaded(storedTrace !== null);

      void finishLessonAction({
        lessonId: lesson.id,
        startedAtMs: startedAtMsRef.current ?? Date.now(),
        finishedAtMs: Date.now(),
        aborted: r.aborted,
        // A9: escalation multipliers ride along so the authoritative server
        // grade/debrief carries the same „повторна грешка ×1.5" annotations
        // (validated server-side; official score stays catalog-rebuilt).
        // A15: event positions ride the same refs (validated server-side,
        // display metadata only); near-misses go as the additive session stat.
        ruleEvents: serializeRuleEvents(
          state.events,
          state.penaltyEscalations,
          state.eventPositions ?? [],
        ),
        // S1: the A10 measurement detail rides along (validated server-side;
        // rubric/display metadata — never the official score).
        objectives: r.objectives.map((o) => ({
          id: o.id,
          done: o.done,
          completedAtSec: o.completedAtSec,
          ...(o.detail !== undefined ? { detail: o.detail } : {}),
        })),
        microQuiz: { ...quizStatsRef.current },
        nearMisses: serializeNearMisses(state.nearMisses ?? []),
        // The shown-but-not-charged violations (teach / learn-only arms), so
        // the SERVER debrief — the text the student actually reads — can stop
        // calling such a drive «чисто каране». Codes + times only; the server
        // re-titles from its own catalog (ADR-002).
        ...(r.coachedMistakes !== undefined && r.coachedMistakes.length > 0
          ? { coachedMistakes: serializeCoachedMistakes(r.coachedMistakes) }
          : {}),
        ...(observedMomentIds !== undefined ? { observedMomentIds } : {}),
        ...(storedTrace !== null ? { attemptTrace: storedTrace } : {}),
      }).then(setSaveResult, () => setSaveResult({ ok: false, code: "SAVE_FAILED" }));
    },
    [lesson.id, lesson.mistakeExperience, scenarioSpec],
  );

  // -- SceneSlot callbacks -------------------------------------------------------
  const handleTick = useCallback(
    (tick: SimTick) => {
      const prev = sessionRef.current;
      if (prev.phase === "completed" || prev.phase === "aborted") return;
      const step = applyTick(prev, tick);
      const { state, hudEvents, teachMoments, mistakeMoment } = step;
      sessionRef.current = state;
      lastTickRef.current = tick;
      // Dev drive rig: read-only, undefined everywhere but /dev/drive-rig.
      onDevTelemetry?.(tick, step);

      // THE RIM. Absent on a tick from a source with no district (replays,
      // fixtures, the dev rigs) — and absent means UNKNOWN, never "outside",
      // so a tick that cannot say leaves the latch exactly where it was.
      if (tick.worldEdgeClearanceM !== undefined) {
        const rim = worldEdgeWarning(tick.worldEdgeClearanceM, worldEdgeArmedRef.current);
        worldEdgeArmedRef.current = rim.armed;
        if (rim.speak) setWorldEdgeNear(true);
      }

      // THEO-3: the targeted wrong action fired — pause into the consequence
      // overlay (one-shot; the functional update keeps an already-open card).
      if (mistakeMoment !== undefined) {
        setConsequence((c) => c ?? { moment: mistakeMoment });
      }
      // THEO-3 fallback: a generous window without the mistake → offer the
      // recorded demonstration instead (never a dead end). Idempotent set.
      if (
        mistakeMode &&
        state.mistakeExperienceHitAtSec === undefined &&
        state.phase === "driving" &&
        tick.t >= MISTAKE_EXPERIENCE_DEMO_OFFER_SEC
      ) {
        setDemoOffered(true);
      }

      if (hudEvents.length > 0) {
        push(
          hudEvents.filter(
            (e) => e.kind === "violation" || e.kind === "commendation" || e.kind === "lesson",
          ),
        );
        const completed = hudEvents.find((e) => e.kind === "objectiveComplete");
        if (completed) {
          setFlash({ titleBg: completed.titleBg, key: ++flashKey.current });
        }
      }

      // A9 teach moments → pause + card. Appending (not replacing) merges a
      // cluster — and the odd frame that slips in before `paused` propagates
      // to the scene — into the one already-open pause session.
      if (teachMoments !== undefined && teachMoments.length > 0) {
        setTeachQueue((q) => [...q, ...teachMoments]);
      }

      // Contextual micro-quiz: feed the SAME tick the rules saw to the pure
      // trigger. Only while driving and not already quizzing or teaching; the
      // rate limit + the pause (which stops onTick) prevent stacking. When
      // one fires we surface it as React state → overlay + pause.
      if (
        state.phase === "driving" &&
        activeQuiz === null &&
        teachQueue.length === 0 &&
        quizTriggerRef.current
      ) {
        const q = observeQuizTick(quizTriggerRef.current, tick);
        quizTriggerRef.current = q.state;
        if (q.quiz) setActiveQuiz(q.quiz);
      }

      // prev was live (guard above), so "completed" here means: the route
      // finished on this very frame → grade and persist (finalize is guarded).
      if (state.phase === "completed") finalize(state);
    },
    [push, finalize, activeQuiz, teachQueue, mistakeMode, onDevTelemetry],
  );

  // A8/A15 measurement channels — ref-resident like the tick path (no
  // re-render): staged-encounter outcomes feed A10's objective locks +
  // the end-screen reaction readout; near-misses feed the mistake map
  // (session stat, never graded). The player's last-tick position stands in
  // for the near-miss location (clearance is sub-meter).
  const handleStagedOutcome = useCallback((outcome: StagedEventOutcome) => {
    if (finalizedRef.current) return;
    sessionRef.current = applyStagedOutcome(sessionRef.current, outcome);
  }, []);
  const handleNearMiss = useCallback((event: NearMissEvent) => {
    if (finalizedRef.current) return;
    sessionRef.current = applyNearMiss(
      sessionRef.current,
      event,
      lastTickRef.current?.position ?? null,
    );
  }, []);

  // A2: the ONLY sink for pre-drive completions. Performed steps arrive from
  // the scene's transition observer (keyboard or cockpit hotspot — same
  // path); info steps arrive from the read-only checklist's confirm button.
  const handlePreDriveStep = useCallback(
    (stepId: PreDriveStepId, tSec?: number) => {
      const t = tSec ?? nowSec();
      const prev = sessionRef.current;
      const { state, hudEvents } = applyPreDriveStep(prev, stepId, t);
      sessionRef.current = state;
      lastPreDriveStepAtRef.current = Math.max(lastPreDriveStepAtRef.current, t);

      // A13: an exam can terminate DURING the pre-drive (assess mode scores
      // live; crossing the official limits before even moving off ends the
      // exam on the spot). Training lessons never complete from this path.
      if (state.phase === "completed") finalize(state);

      if (hudEvents.length > 0) {
        push(
          hudEvents.filter(
            (e) => e.kind === "violation" || e.kind === "commendation" || e.kind === "lesson",
          ),
        );
        const completed = hudEvents.find((e) => e.kind === "objectiveComplete");
        if (completed) {
          setFlash({ titleBg: completed.titleBg, key: ++flashKey.current });
        }
      }
      setSnap(hudPollUpdate(sessionRef.current, lastTickRef.current, drivelineRef.current));
    },
    [push, nowSec, finalize],
  );

  // -- QW10: blocked-drive explanation ------------------------------------------
  // Throttle attempt during the pre-drive phase while the car is NOT yet
  // genuinely ready (engine off / P / parking brake on) → one teaching toast
  // explaining WHY it stays put; a cooldown keeps repeat presses silent. Once
  // the driveline IS ready, the same press performs "move-off" instead.
  const blockedToastAtSecRef = useRef(Number.NEGATIVE_INFINITY);
  const handleBlockedDriveAttempt = useCallback(() => {
    const t = nowSec();
    if (t - blockedToastAtSecRef.current < BLOCKED_DRIVE_TOAST_COOLDOWN_S) return;
    blockedToastAtSecRef.current = t;
    push([
      {
        kind: "lesson",
        titleBg: "Колата още не е готова за потегляне",
        // B7/B20 residual: this toast used to read „запали двигателя (I),
        // включи предавка с ], освободи ръчната спирачка (Space)" — i.e. it
        // taught the KEYBOARD, inside the lesson whose whole premise is that
        // the cockpit is worked with the mouse. It is the first thing a stuck
        // beginner reads, so it was teaching the opposite of the contract.
        // Wording matches advisor.ts's own mouse-first step copy verbatim, so
        // the toast and the checklist can never say two different things; the
        // keys stay, demoted to the footnote they are for the advanced.
        //
        // …AND THE SAME SENTENCE WAS A DEAD END ON A PHONE (J-WAVE-4). „с
        // мишката, в кабината" is false there twice over — no mouse, and the
        // controls a thumb reaches are the ⚙ strip's, not the 3-D console's —
        // so the touch reader now gets the three cells by name. One sentence,
        // one set of steps, named in whichever controls are actually on screen.
        explanationBg:
          hintInput === "touch"
            ? `Работи с истинските контроли на екрана: ${starterActBg("touch")}, ${gearUpActBg("touch", drivelineRef.current?.transmission ?? "automatic")}, ${parkingBrakeActBg("touch")}. ${TOUCH_SHEET_LOCATOR_BG} Списъкът се отмята сам, докато го правиш — потегляш с газта, когато колата наистина може да тръгне.`
            : "Работи с истинските контроли — с мишката, в кабината: щракни стартера на конзолата, щракни скоростния лост към D, щракни ключа на ръчната спирачка. Списъкът вляво се отмята сам, докато го правиш — потегляш с газта, когато колата наистина може да тръгне. (За напреднали: същото става с I, ] и Space.)",
      },
    ]);
  }, [hintInput, nowSec, push]);

  // -- A2 practice mode: gentle hint after ~20 s of pre-drive idling ------------
  useEffect(() => {
    if (preDriveMode !== "practice") return;
    const id = window.setInterval(() => {
      const s = sessionRef.current;
      const preDrive = s.preDrive;
      if (s.phase !== "preDrive" || preDrive === null || finalizedRef.current) return;
      const now = nowSec();
      if (now - lastPreDriveStepAtRef.current < PRACTICE_HINT_IDLE_S) return;
      lastPreDriveStepAtRef.current = now; // re-arm — next hint in another 20 s
      const nextId = PRE_DRIVE_STEP_ORDER.find((id) => !preDrive.completedStepIds.includes(id));
      if (!nextId) return;
      push([
        {
          kind: "lesson",
          titleBg: `Подсказка: ${PRE_DRIVE_STEPS[nextId].titleBg.toLowerCase()}`,
          explanationBg: PRE_DRIVE_STEPS[nextId].instructionBg,
        },
      ]);
    }, PRACTICE_HINT_POLL_MS);
    return () => window.clearInterval(id);
  }, [preDriveMode, nowSec, push]);

  // -- HUD poll ------------------------------------------------------------------
  useEffect(() => {
    const id = window.setInterval(() => {
      setSnap(hudPollUpdate(sessionRef.current, lastTickRef.current, drivelineRef.current));
    }, HUD_POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  // -- manual endings --------------------------------------------------------------
  const ended = result !== null;
  const finishNow = () => finalize(finishSession(sessionRef.current, nowSec()));
  const abortNow = () => finalize(abortSession(sessionRef.current, nowSec()));

  const retry = () => {
    sessionRef.current = createLessonSession(lesson);
    finalizedRef.current = false;
    lastTickRef.current = null;
    startedAtMsRef.current = Date.now();
    mountedAtRef.current = performance.now();
    setResult(null);
    setSaveResult(null);
    // A fresh run starts with a clean rail: no end line, no debrief left open
    // from the previous attempt.
    setEndExpanded(false);
    // …and no skip carried over from it either (L15): the next result is a new
    // result, and the persisted setting is the only thing allowed to outlive a
    // run.
    setEndSkipped(false);
    // A6: „скрий съвета" was about ONE prompt in ONE run. A fresh run starts
    // advised — otherwise the first thing a student loses on a retry is the
    // coaching they retried in order to get right.
    setAdvisorDismissed(null);
    // I1: a fresh attempt is a fresh prediction — the gate asks again.
    setCalibrationDone(false);
    setTraceUploaded(false);
    setFlash(null);
    clear();
    // S1: a fresh attempt records a fresh trace + rubric.
    attemptRecorderRef.current?.reset();
    setRubric(null);
    // Fresh pre-drive: the scene's observer re-baselines on the driveLocked
    // rising edge (a car left running/belted by the previous run never
    // auto-completes steps — the student re-performs the transitions); the
    // idle-hint clock and the blocked-drive toast cooldown restart here.
    lastPreDriveStepAtRef.current = 0;
    blockedToastAtSecRef.current = Number.NEGATIVE_INFINITY;
    // Rejection-hint cooldowns are keyed by the session clock, which resets
    // with the retry — clear them so the first refusal explains again.
    rejectionToastAtRef.current = {};
    // Fresh micro-quiz session: reset the tally + rebuild the trigger from the
    // already-loaded bank. Teach-moment queue starts empty too (the fresh
    // engine state re-teaches first encounters from scratch).
    quizStatsRef.current = { total: 0, correct: 0 };
    setActiveQuiz(null);
    setTeachQueue([]);
    // THEO-3: a fresh sandbox pass re-arms the one-shot moment (the fresh
    // engine state above dropped the latch) and the demo offer window.
    setConsequence(null);
    setDemoOffered(false);
    quizTriggerRef.current =
      quizBankRef.current.length > 0
        ? createQuizTriggerState(quizFreqRef.current, quizBankRef.current)
        : null;
    // Founder R3 #22 („Повтори" does not restart): the engine state above is
    // fresh, but the SCENE used to survive the retry — the car stayed parked
    // at the END of the route with the staged encounters already consumed, so
    // the "restarted" drill was undrivable. The scene mounts on `sceneEpoch`;
    // bumping it remounts SceneSlot exactly like entering the drill from the
    // catalog: car at lesson.spawn, staged events re-armed, shadow clock at 0.
    // The per-scene channels reset with it so no stale frame data leaks in.
    setSceneEpoch((e) => e + 1);
    drivelineRef.current = null;
    dashboardStatusRef.current = createDashboardStatus();
    setMinimapFrame(null);
    // A RESTART FORGETS: `prev` is deliberately not passed, so the held
    // ceiling of the run that just ended cannot print over the first frames of
    // the new one (see `heldTaskCapKmh`).
    setSnap(snapshotOf(sessionRef.current, null, null));
  };

  // Debrief: the template is deterministic — render it instantly client-side;
  // the server recomputes + stores the same text and adds the concept links.
  // Client-side fallback debrief (shown only until the server's richer text
  // arrives, or if the save fails). The authoritative server debrief carries
  // the micro-quiz tally, prior-best comparison and concept titles; this
  // transient fallback stays deterministic and reads no refs during render.
  const debriefText = ended
    ? saveResult?.ok
      ? saveResult.debriefText
      : // The coached channel rides the RESULT (deterministic, no ref read in
        // render): without it this fallback still printed «чисто каране без
        // нито едно нарушение» on drives whose HUD had shown teach cards —
        // the same hole the server path had (findings ef1eb9cf · a448e5f0).
        buildDebrief(lesson, result, { coachedMistakes: result.coachedMistakes }).text
    : null;

  // I1 „Позна ли се?" (doc 82 §5.3) — the self-assessment calibration gate.
  //
  // It exists only when there is something to be wrong ABOUT: a session that
  // actually persisted (so the SERVER owns the official score it will reveal —
  // the client's own number is never the one being predicted) and that was not
  // aborted (guessing the points of a drive you quit measures nothing). On a
  // failed save the student goes straight to the result, because the trend has
  // nowhere to be written anyway.
  const savedSessionId = ended && saveResult?.ok ? saveResult.sessionId : null;
  const calibrationGate =
    savedSessionId !== null && result !== null && !result.aborted ? (
      <CalibrationGate
        lessonTitleBg={lesson.titleBg}
        onSubmit={async (predictedPoints, predictedPass) => {
          const answer = await recordSelfPredictionAction(savedSessionId, {
            predictedPoints,
            predictedPass,
          });
          return answer.ok ? answer : null;
        }}
        onResolved={() => setCalibrationDone(true)}
      />
    ) : null;

  // …and it has to be up BEFORE the score is. `result` lands synchronously
  // when the drive ends; `saveResult` lands one POST later. Rendering the end
  // screen in between would show the student „7 точки" and then ask them to
  // predict it — the mechanic would measure reading, not judgement. So the
  // hold starts with the drive and ends with the answer (isResultScreenHeld),
  // and the waiting card carries its own skip so a hung save cannot trap
  // anyone behind a mechanic.
  const resultHeld = isResultScreenHeld({
    ended,
    aborted: result?.aborted ?? false,
    // THEO-3 sandbox runs never persist, so they would wait for a save that
    // is never made.
    persists: lesson.mistakeExperience === undefined,
    saved: saveResult === null ? null : saveResult.ok,
    resolved: calibrationDone,
  });
  const calibrationSlot =
    calibrationGate ??
    (resultHeld ? (
      <CalibrationPendingCard onSkip={() => setCalibrationDone(true)} />
    ) : null);

  // S1 (founder 2026-07-17: „the button for next lesson goes to stage 2 of
  // the same lesson — we also have to add a button that switches to the NEXT
  // LESSON"). GREEN = the official verdict passed AND every objective done.
  // BOTH targets — one rung up this ladder, and the next card in catalog
  // order — plus the doc 76 §8 star gate that can withhold the rung, are the
  // pure resolver's call; this component only renders the answer.
  const scenarioGreen =
    scenarioRef !== null && result !== null && result.passed && result.completedAll;
  // FR-06 („continue to next question although you made mistake and come back
  // to this later"): the resolver is asked on EVERY finished attempt now, not
  // only on green ones. It answers differently for the two cases — a failed
  // run gets the next CARD and never the next RUNG (nextStep.ts) — so the
  // green pre-gate that used to sit here was doing nothing except making the
  // failed run's answer unreachable, which is precisely the wall he hit.
  const nextScenario = useMemo(
    () =>
      scenarioRef !== null && result !== null
        ? resolveScenarioNextSteps({
            templateId: scenarioRef.templateId,
            level: scenarioRef.level,
            passed: result.passed,
            allObjectivesPassed: result.completedAll,
            // The client's rubric mirrors the server's recompute; unknown
            // (no rubric yet) leaves the gate to the server.
            stars: rubric?.stars ?? null,
          })
        : { level: null, template: null },
    [scenarioRef, result, rubric],
  );

  // Each target → a labelled launcher, or null. Same (templateId, level) seam
  // the catalog's own picker uses; absent onStartScenario (curriculum
  // sessions) means nothing to launch into, so no button.
  const scenarioTarget = useCallback(
    (step: { templateId: string; level: ScenarioLevel; titleBg: string } | null) =>
      step !== null && onStartScenario !== undefined
        ? {
            labelBg: `${step.titleBg} · Ниво ${step.level}`,
            onStart: () => onStartScenario(step.templateId, step.level),
          }
        : null,
    [onStartScenario],
  );

  // The bottom instrument band's height, and the floor every other in-canvas
  // overlay measures from. Published as CSS custom properties on the root so
  // the teach sheet, the ribbon legend, the minimap column and the TOUCH
  // CONTROLS (a different component tree entirely — TouchControls lives inside
  // the scene) all read ONE number instead of each hard-coding a guess. That
  // is what made the dashboard and the teach card overlap in the first place.
  const dashHeightPx = ended ? 0 : compact ? COMPACT_DASH_HEIGHT_PX : 0;
  const hudFloorPx = compact ? dashHeightPx + 8 : ROOMY_HUD_FLOOR_PX;

  // ===========================================================================
  // THE OVERLAY QUEUE — compact only. One item speaks; the rest are counted.
  //
  // Everything below used to be an independently positioned panel: the
  // objective banner, the advisor card, the toast column, the pre-drive
  // checklist, the ribbon legend, the teach modal, the exam tally and the
  // end-of-session screen. They are now CANDIDATES. `selectOverlay` picks one
  // by priority; the rest wait, and the „+N" badge is the honest statement that
  // they exist. Nothing here changes when a mistake is graded, what it costs,
  // or when a teach moment fires — only how many of them may be on the glass
  // at once.
  // ===========================================================================

  /**
   * ── O54 · TWO PRODUCERS, ONE INSTRUCTION — THE PHONE HALF ─────────────────
   *
   * `hud/overlayQueue.ts` closed the one-item half with `itemEchoesLine` and
   * routed the cross-producer half here: *„the two producers must be handed one
   * string, which is a change in `LessonPlayShell.tsx` (where both are mounted)
   * … This predicate is what that change would then be checkable against."*
   *
   * THE ROOMY HALF WAS ALREADY OWNED and is not this. `ObjectiveBanner` keeps
   * the sentence and `advisorEchoTrim` (above) leaves the advisor card only the
   * half that was new — landed 2026-08-17, which is why the two frames the note
   * cites (`sc-vp-readiness/pc-right/01-arrival.png`,
   * `sc-park-bay-exit-rev/pc-wrong/04-t028s.png`) show a duplicate the shipped
   * tree no longer prints. On a roomy stage there is no queue at all to collide
   * with it either: `overlayCandidates` below is `[]` whenever `!compact`.
   *
   * THE PHONE HALF IS REAL AND IT IS WORSE THAN A DUPLICATE. There is no banner
   * on compact — the column is `hidden` — so the queue is the only voice, and it
   * offered the same sentence from two rows: row 6 `advisor`
   * («Мини контролната зона с готов кокпит — дръж под 50 км/ч») and row 7 `task`
   * («Мини контролната зона с готов кокпит», with the «Задача 1/2» chip).
   * `PRIORITY` has advisor 30 over task 20 and BOTH are `AMBIENT`, so the queue
   * did not print the sentence twice — it printed the advisor's copy, silently
   * dropped the task's, and counted nothing in the „+N" badge. The student on a
   * phone therefore lost the chip that says WHICH of the objectives he is on,
   * for the whole of every capped rung, to a row that was saying the same words.
   *
   * SO ONE PRODUCER OWNS IT, AND THE OTHER'S COPY IS DELETED RATHER THAN HIDDEN.
   * The objective's sentence belongs to the `task` item, which is the row that
   * carries the counter; the advisor's remainder rides with it as `detailBg`,
   * where `SimOverlay` prints it inline under the line (THEO-4 row 2b). The
   * `advisor` row is not emitted for a prompt that is the task's own sentence —
   * not suppressed at the render, not re-ranked: it is not built. A prompt that
   * says something else (a lawful wait, a roundabout phase, a pre-drive step) is
   * untouched and still outranks the task, which is the whole reason its
   * priority is 30.
   *
   * `itemEchoesLine(taskItem)` is the predicate the note left for this, and it
   * is false by construction here: the line is the title, the detail is what
   * survived the title being stripped off. `__tests__/queueTaskEcho.test.ts`
   * drives it in both directions.
   */
  // THE WHOLE DECISION, INCLUDING THE ARGUMENT LISTS THAT FEED IT, is
  // `lessonQueueBinding` — see its header for the eight mutations that lived in
  // those argument lists and for what a `node`-environment suite can and cannot
  // hold. Nothing below re-derives any of it: the render spends the binding.
  const queue = lessonQueueBinding({
    snap,
    advisorOn,
    examMode,
    mistakeMode,
    ended,
    compact,
    taskPing,
    lessonDescriptionBg: lesson.descriptionBg,
  });
  const taskLineBg = queue.taskLineBg;
  const taskFresh = useFreshKey(queue.taskKey, TASK_ANNOUNCE_MS);
  const advisorFresh = useFreshKey(queue.advisorKey, ADVISOR_ANNOUNCE_MS);

  const praiseKey = compact && flash !== null && !ended ? `praise:${flash.key}` : null;
  const praiseFresh = useFreshKey(praiseKey, PRAISE_ANNOUNCE_MS);

  const warningKey =
    compact && !ended && warnings.length > 0 ? `warn:${telltaleWarningsKey(warnings)}` : null;
  const warningFresh = useFreshKey(warningKey, WARNING_ANNOUNCE_MS);

  /**
   * ── WHAT THE LEGEND HAS TO NAME, AND WHY ITS OLD GATE WAS THE WRONG ONE ────
   *
   * Two more sweep-161 findings on the same layer, both on the phone:
   *
   *   `sc-junction-blind/mobile-right/04-t065s.png` — „a huge white chevron «◀»
   *     floats in the middle of the sky above the road … with no label or
   *     legend. It appears in every mid-drive frame of this lesson and in
   *     sc-jx-equal-left too."
   *   `sc-jx-equal-left/mobile-right/04-t039s.png` — „a vertical cyan beam of
   *     light rises out of the middle of the carriageway into the sky at the
   *     junction, with no legend anywhere. Next to it the giant white «◀»
   *     chevron floats in mid-air. Two unexplained symbols dominating the view a
   *     learner is supposed to be reading for traffic."
   *
   * The chevron and the beam are RouteGuidance's turn arrow and objective
   * marker, and `LessonScene` mounts that layer on `objectives.length > 0` and
   * nothing else. The legend was gated on `aids.shadowCar || aids.pathRibbon`,
   * which is the gate for the BLUE shadow ribbon — so on any rung where the
   * aids are withdrawn (L3/L4, and the exam), the teal ribbon, the floating
   * arrow and the eleven-metre beam were all on the glass with nothing naming
   * them, on BOTH platforms. The blue row still needs the aids; nothing else
   * does.
   */
  const shadowRibbonShown =
    lesson.aids?.shadowCar === true || lesson.aids?.pathRibbon === true;
  const guidanceShown = lesson.objectives.length > 0;
  const legendApplies = compact && !ended && guidanceShown;
  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * THE LEGEND HAD NEVER BEEN ON A PHONE — sweep 161, sc-ln-obstacle-meeting.
   *
   * «The two glowing road ribbons are explained on PC by a legend (синя — пътят
   * на колата-сянка / зелена — маршрутът до целта) but that legend does not
   * exist anywhere on mobile. A phone student sees a green and a blue river of
   * light on the tarmac with nothing telling him which to follow.»
   *
   * The reviewer is right, and the panel below says why in as many words: „ROOMY
   * ONLY: compact says this once, as a line, at the start of the rung (the
   * `legend` overlay candidate)". The candidate exists. It had simply never won.
   *
   * THE ARITHMETIC, off `overlayQueue.ts`'s own table: `legend` is priority 10,
   * the lowest of ten kinds, and `LEGEND_ANNOUNCE_MS` is 8 000 ms measured from
   * `sceneEpoch` — i.e. from the frame the scene mounts. On that frame the
   * BRIEFING is up (`hint`, priority 60) and it is `blocking`, so it stays until
   * «Разбрах»; the pre-drive checklist behind it is `predrive`, priority 40, and
   * it stays until the thirteenth step; and the task line that follows is
   * `task`, priority 20, fresh for 7 000 of the legend's own 8 000 ms. There is
   * no order of events in which a phone student sees this line. Not „rarely" —
   * never, on any lesson, at any tier.
   *
   * So the window may not start at the mount. It starts on the first frame the
   * queue is otherwise SILENT — nothing blocking, nothing fresh, no teach
   * moment, no toast — which is the only moment a priority-10 line was ever
   * going to be heard, and is also exactly when the two ribbons are the loudest
   * unexplained thing on the glass. `useFreshKey` then does the rest: the key
   * goes non-null on that frame, it gets its 8 000 ms, and it does not re-open
   * for a key that has not changed.
   *
   * IT CAN COME BACK ONCE, AND THAT IS THE CHOICE, not an oversight. If a fault
   * card arrives at second three the key goes null, the timer is cleared, and the
   * next silent stretch opens the window again. A latch would have made it „said
   * once" literally — and „once" would then mean „three seconds, interrupted, and
   * never again", on the one sentence that says what the two rivers of light on
   * the road are. Re-opening costs a `legend`-priority line that yields to
   * everything, and it requires a full noisy→silent transition to happen at all.
   * (It is also the shape that keeps this out of a `useRef` read during render,
   * which `react-hooks/refs` is right to refuse: a latch read at render time is a
   * value React is not tracking, on a surface that repaints every 150 ms.)
   * ═══════════════════════════════════════════════════════════════════════════
   */
  const legendQueueSilent =
    legendApplies &&
    !briefingOpen &&
    snap.phase === "driving" &&
    !taskFresh &&
    !advisorFresh &&
    !warningFresh &&
    !praiseFresh &&
    teachQueue.length === 0 &&
    toasts.length === 0 &&
    activeQuiz === null &&
    consequence === null;
  const legendKey = legendQueueSilent ? `legend:${sceneEpoch}` : null;
  const legendFresh = useFreshKey(legendKey, LEGEND_ANNOUNCE_MS);

  // A micro-quiz and the THEO-3 consequence card are INTERACTIVE PAUSES: they
  // ask a question and wait for the answer, so they are modals by nature and
  // they are the „explicit pause" the budget carves out. While one is up the
  // queue says nothing at all — „one overlay at a time" has to mean across the
  // whole layer, not just within it.
  const pauseModalUp = activeQuiz !== null || (mistakeMode && consequence !== null);

  const overlayCandidates: (SimOverlayItem | null)[] = !compact || pauseModalUp
    ? []
    : [
        // 1. The session is over. A LINE with the verdict; the whole debrief is
        //    one tap behind it, and that tap is the explicit pause that earns
        //    the full frame. I1: while the calibration gate holds the result,
        //    the line must not leak the score it is about to ask you to predict.
        ended && result !== null
          ? {
              id: "end",
              kind: "end" as const,
              tone: resultHeld
                ? ("neutral" as const)
                : result.aborted
                  ? ("warn" as const)
                  : result.passed
                    ? ("good" as const)
                    : ("warn" as const),
              chipBg: resultHeld ? null : pointsBg("exam", result.score),
              lineBg: resultHeld
                ? "Сесията завърши — първо се самооцени"
                : result.aborted
                  ? "Прекратена сесия"
                  : result.passed
                    ? "Издържан — виж разбора"
                    : "Неиздържан — виж разбора",
              // A2 — WHAT „НЕ ПОКАЗВАЙ АВТОМАТИЧНО" TURNS OFF ON A PHONE.
              //
              // On a roomy screen the end-of-lesson popup opens itself and the
              // setting stops it. Compact never had a popup to stop — the
              // debrief has always been tap-to-open here — so rendering that
              // setting on a phone would have been a control that does nothing,
              // which is worse than not offering it.
              //
              // What DOES pop up by itself on the phone is THIS line, blocking:
              // it freezes the layer and the only way past it is „Резултат",
              // which opens the very debrief the student is trying to skip. So
              // that is what the preference governs here. Switched off (or once
              // the student has skipped this run) the line stays — the verdict
              // is not a thing to hide — but it stops demanding an answer: it
              // becomes an ordinary notification with a ✕ (row A6) beside a
              // „Резултат" chip that still opens the full, law-cited debrief.
              //
              // THEO-4 survives the dismissal: „Виж разбора" is added to the
              // micro menu for the whole ended session (see `menuItems`), which
              // is the same recall the task line has had since 2026-07-29.
              // I1 outranks both — while the calibration gate holds the result
              // the line blocks, because self-assessment is a required step.
              // The rule is `endLineDemandsAnswer` in hud/hudPreferences.ts,
              // beside `shouldShowDebrief`, so the phone's answer and the
              // desktop's answer are stated in one file and tested together.
              blocking: endLineDemandsAnswer({
                held: resultHeld,
                autoOpen: endAutoOpen,
                skipped: endSkipped,
              }),
              ackLabelBg: "Резултат",
              onAck: () => setEndExpanded(true),
            }
          : null,

        // 2. A teach moment freezes the drive (doc 65 §5 — unchanged). What
        //    changed is the size: the title on the line, the authored law-cited
        //    WHY plus the repeat-cost stake behind „Защо". THEO-4 intact.
        teachQueue.length > 0 && activeQuiz === null && !ended
          ? {
              id: `teach:${teachQueue[0].code}:${teachQueue[0].t}`,
              kind: "teach" as const,
              tone: "teach" as const,
              chipBg: "Учебен момент",
              lineBg: teachQueue[0].titleBg,
              // The SAME sentence the teach card carries, and it had the SAME
              // bare „т.". Both now name the scale and the clause the number
              // comes out of — а chip reading „ЗДвП чл. 21" beside a 10-point
              // mark is what the founder read as his licence being docked.
              detailBg: `${teachQueue[0].explanationBg}\n\nПърва среща — не се брои в резултата. При повторение: ${minusPointsBg("exam", teachQueue[0].points)} по ${examMarkCitationBg(teachQueue[0].severity)}, а повторните грешки тежат още повече (×1.5 / ×2.0).\n\n${EXAM_POINTS_SHORT_NOTE_BG}`,
              lawRef: teachQueue[0].lawRef ?? null,
              blocking: true,
              onAck: handleTeachAcknowledged,
            }
          : null,

        // 3. Graded mistakes, coached hints and praise — the toast column,
        //    single file. Newest first (the queue unshifts), so the priority
        //    tie-break inside selectOverlay keeps the most recent one talking.
        //
        //    ── §2.6 O33 · THE MOMENT SURVIVES THIS BOUNDARY NOW ──────────────
        //
        //    `HudToasts` stamps `raisedAtMs` on every toast and prints «сега» /
        //    «преди 8 с» on the card's last row. On a phone the shell does not
        //    render `HudToasts` at all — it re-maps each toast into a
        //    `SimOverlayItem`, and the stamp was dropped right here. The frame
        //    (`sc-sp-curve/mobile-wrong/04-t030s.png`, iPhone 16 landscape): a
        //    card reading «Превишена скорост» over a cluster showing 18 км/ч
        //    beside a В26 disc reading 90. The card is telling the truth about a
        //    moment six seconds gone and nothing on the glass says which moment,
        //    so the only conclusion available to a seventeen-year-old is that
        //    the grader is broken. `overlayQueue.ts` added the field and named
        //    this line: „add `raisedAtMs: t.raisedAtMs`".
        //
        //    ⚠ THE GLASS DOES NOT MOVE UNTIL `hud/SimOverlay.tsx` RENDERS IT —
        //    one row, `overlayMomentBg(item, now)`, the other half of the pair
        //    O33 named and NOT this lane's file. This is the half that was
        //    routed here; it is landed rather than held so that half is one line
        //    against a field that is already fed, and `hud-toast-moment.test.tsx`
        //    is updated in the same commit to say exactly which half is live.
        //    Only `violation` and `hint` are stamped — `overlayCarriesMoment`
        //    is the authority on which kinds carry one, and a commendation does
        //    not (an unstamped card must print no age rather than invent one).
        ...(!ended
          ? toasts.map((t): SimOverlayItem | null => {
              if (t.event.kind === "violation") {
                return {
                  id: `toast:${t.id}`,
                  kind: "violation",
                  tone: t.event.severity === "vtorostepenna" ? "warn" : "danger",
                  chipBg: minusPointsBg("exam", t.event.points),
                  lineBg: t.event.titleBg,
                  detailBg: t.event.explanationBg,
                  lawRef: t.event.lawRef ?? null,
                  raisedAtMs: t.raisedAtMs,
                };
              }
              if (t.event.kind === "lesson") {
                return {
                  id: `toast:${t.id}`,
                  kind: "hint",
                  tone: "teach",
                  lineBg: t.event.titleBg,
                  detailBg: t.event.explanationBg,
                  lawRef: t.event.lawRef ?? null,
                  raisedAtMs: t.raisedAtMs,
                };
              }
              if (t.event.kind === "commendation") {
                return {
                  id: `toast:${t.id}`,
                  kind: "praise",
                  tone: "good",
                  chipBg: "Браво",
                  lineBg: t.event.titleBg,
                };
              }
              return null;
            })
          : []),

        // 4. An armed cabin fault, once, with its rule's own words. „Everytime a
        //    mistake … pops up that the belt is not on … it only makes the user
        //    nervous" — so this speaks on the rising edge and then hands back to
        //    the quiet edge chip, which SimOverlay stands down while it talks.
        warningFresh && warnings.length > 0
          ? (() => {
              const w = warnings[0];
              const spec = w.code !== null ? VIOLATIONS[w.code] : null;
              return {
                id: `warning:${w.id}`,
                kind: "warning" as const,
                tone: w.tone === "danger" ? ("danger" as const) : ("warn" as const),
                lineBg: w.labelBg,
                // THEO-4: never a bare „коланът не е поставен". The catalog's
                // authored explanation and its citation, one tap away.
                detailBg:
                  spec !== null
                    ? `${spec.explanationBg}\n\n${spec.correctiveBg}`
                    : "Аварийните светлини казват на другите, че си опасност на пътя. При нормално движение ги изключи — иначе подвеждаш всички зад теб.",
                lawRef: spec?.lawRef ?? null,
              };
            })()
          : null,

        // 4b. THEO-3 sandbox: „Не се получава? Виж демонстрацията" lived inside
        //     the objective banner, which compact no longer renders — a dead
        //     end on a phone is worse than a panel. It rides the line instead.
        mistakeMode && demoOffered && consequence === null && !ended
          ? {
              id: "mistake-demo",
              kind: "hint" as const,
              tone: "teach" as const,
              lineBg: "Не се получава? Виж демонстрацията",
              detailBg: lesson.descriptionBg,
              blocking: true,
              ackLabelBg: "Покажи",
              onAck: () => setConsequence({ moment: null }),
            }
          : null,

        // 4b-rim. THE END OF THE AUTHORED WORLD, announced before it arrives.
        //
        // Measured over all 105 committed districts (runtime/district.ts): the
        // learner reaches the rim 60–78 m past the last road on EVERY map, and
        // nothing marked that line because until this card no module read the
        // measure. tj-rhr-v1 is the cheapest case — its graded T-junction sits
        // at (0, 0) and the box's maxY IS 0, so the junction is 60 m from the
        // rim IN THE DIRECTION A STUDENT WHO DOES NOT TURN DRIVES.
        //
        // NOT BLOCKING, and that is the whole care of it. This fires while the
        // car is moving; freezing the drive to say "you are near the edge"
        // would be a worse thing than the edge. It is a line with a WHY behind
        // one tap — THEO-4 — and the student dismisses it and drives on.
        //
        // It cannot fire on the taught route: WORLD_EDGE_WARN_M is 35 m against
        // a 60 m minimum margin, so the car is at least 25 m beyond the last
        // road on the tightest map in the product before this speaks.
        worldEdgeNear && !ended
          ? {
              id: "world-edge",
              kind: "hint" as const,
              tone: "warn" as const,
              lineBg: "Наближаваш края на учебната зона",
              detailBg:
                "Оттук нататък няма нито път, нито сграда — теренът просто свършва. " +
                "Това не е част от упражнението и нищо отвъд ръба не се оценява. " +
                "Върни се към синята линия и продължи по маршрута на урока.",
              blocking: false,
              ackLabelBg: "Разбрах",
              onAck: () => setWorldEdgeNear(false),
            }
          : null,

        // 4c. THE BRIEFING (`lesson.briefingBg`) — step 1 on the line, the REST
        //     of the numbered list under it. Blocking: a briefing that scrolls
        //     past is the compiled-away field all over again, so it waits for
        //     „Разбрах" (Space on a keyboard) and then never returns. Not in the
        //     sandbox — there the assignment is the mistake.
        //
        // ══ THE SAME SENTENCE WAS PRINTED TWICE — 2026-08-14, THE FOUNDER'S
        //    OWN FRAMES, BOTH ORIENTATIONS, ALL SIX PROFILES. ══════════════════
        //
        // HIS WORDS: „there are TWO copies of it on screen, in different
        // styling, both cut." He was reading ONE card. `detailBg` used to be
        // `briefing.map(...)`, i.e. the WHOLE list — and `lineBg` is
        // `briefing[0]`, i.e. its first item. So `SimOverlay`'s row 2 printed
        // step 1 in bold and row 2b re-printed it two millimetres lower, in the
        // reading face, prefixed „1. ". Verbatim, character for character:
        //
        //   row 2   «Потегли по улицата и се движи спокойно в своята лента. По…»
        //   row 2b  «1. Потегли по улицата и се движи спокойно в своята лента.
        //            По тъмно първо провери късите светлини (чл. 70): пред
        //            пешеходна пътека…»
        //
        // IT IS A REGRESSION OF THE THEO-4 FIX, not an old bug. Until row 2b
        // landed, `detailBg` rendered ONLY inside the read sheet — a different
        // surface, one tap away, where a header and its list may repeat. The
        // moment the body came onto the CARD to stop the phone hiding the
        // reasoning, the card started saying everything twice, and nobody
        // re-read this line. The sheet inherited it too (see the 2026-08-13
        // «ЗАЩО» frame: its <h2> and its first body line are the same 219
        // characters).
        //
        // WHAT IT COSTS, MEASURED ON THE SHIPPED CORPUS (probe over all 167
        // scenario templates, compiled): the duplicate is 219 of the 556
        // characters the card must hold on `sc-zebra-approach@L1` — 39 % — and
        // 412 of 972 on the same scenario at L4, where step 1 is the exam
        // complication. Deleting it is the single largest reduction available
        // in what the card has to fit, and it loses NOTHING: every character
        // still ships, once.
        //
        // STEP 1 STAYS ON THE LINE and the body starts at step 2. That ordering
        // is a contract, not a preference — `compile.ts` puts the rung's
        // complication at `briefingBg[0]` precisely so „the one sentence that
        // says WHY the rung is harder is the one sentence nobody can skip", and
        // the line is the row that cannot be scrolled away from. The numbering
        // is preserved (2., 3., …) so the list still reads as a sequence whose
        // first item is the bold sentence above it.
        //
        // `null` when a briefing has a single step: there is then no second
        // surface to offer and «ПРОЧЕТИ» correctly does not render. No shipped
        // template is in that case — the step-count histogram over all 167 is
        // {4:5, 5:118, 6:30, 7:12, 8:2} — but a curriculum LessonSpec may be,
        // and a sheet that opens onto nothing is worse than no sheet.
        briefingOpen && briefing.length > 0 && !mistakeMode && !ended
          ? {
              id: "briefing",
              kind: "hint" as const,
              tone: "neutral" as const,
              chipBg: "Инструкции",
              // Both halves come from `hud/overlayQueue.ts` and not from an
              // expression written here, so `briefing-no-echo.test.ts` can put
              // every compiled rung of all 167 templates through the SAME code
              // the card renders. A rule that lives only in a component is a
              // rule six waves of measurement can walk past — this one did.
              lineBg: briefingLineBg(briefing),
              // …AND THE NUMBER THAT SAYS THE LINE IS ITEM 1. The paragraph
              // above ends „the numbering is preserved (2., 3., …) so the list
              // still reads as a sequence whose first item is the bold sentence
              // above it" — which was true of the DATA and never of the glass.
              // Twenty-one round-10 mobile `02-briefing.png` frames show the
              // sheet painting an unnumbered lead over a list that opens at
              // «2.», against a pc panel numbering the same steps 1–5. The
              // ordinal travels as DATA, so the surface decides whether to
              // paint it and the authored string stays byte-identical for the
              // corpus gates that read it (the field's own declaration carries
              // the frames, and the cost argument that was withdrawn).
              //
              // THIS LINE IS THE WHOLE WIRE, and it was ungated for one round:
              // a verifier deleted it alone and `briefing-no-echo` +
              // `sim-overlay-fold` + `overlay-queue` stayed 56/56 green while
              // every phone lost the number. The two mutations that WERE run
              // guarded the ends — a function that still returns 1, a `<span>`
              // that still reads a field. `briefing-no-echo.test.ts`'s last
              // describe now source-pins this property inside this item.
              lineOrdinal: briefingLineOrdinal(briefing),
              detailBg: briefingBodyBg(briefing),
              // …and the control that reaches them says what it opens. «ЗАЩО» is
              // the right word over a graded fault — „why was that wrong" — and
              // the wrong word over an instruction the card could not finish
              // printing. The student is not asking for a justification, he is
              // asking for the rest of the sentence, and a control that names
              // the wrong thing is why six waves of truncation went unreported.
              openLabelBg: "Прочети",
              blocking: true,
              ackLabelBg: "Разбрах",
              onAck: closeBriefing,
            }
          : null,

        // 5. Pre-drive: the next step on the line, the whole checklist behind
        //    one tap. It stays up because during the pre-drive it IS the task.
        snap.phase === "preDrive" && !ended && snap.preDriveNextStepId !== null
          ? {
              id: `predrive:${snap.preDriveNextStepId}`,
              kind: "predrive" as const,
              tone: "neutral" as const,
              chipBg: "Подготовка",
              lineBg: PRE_DRIVE_STEPS[snap.preDriveNextStepId].titleBg,
              detailBg: PRE_DRIVE_STEPS[snap.preDriveNextStepId].instructionBg,
              hasRichDetail: true,
              openLabelBg: "Списък",
              // C5/§I5(a). «СПИСЪК» [664,51 61×44] and the ✕ [729,51 44×44] are
              // 4 px apart, and one miss used to remove this line for the rest
              // of the session — on the three INFO steps, whose only completion
              // path is «Потвърди» inside the checklist behind it, that made
              // the lesson unwinnable. Step 1 is an info step, so tap #1 could
              // do it. This item is not a notification ABOUT the task, it IS
              // the task; see `noDismiss` in overlayQueue.ts.
              noDismiss: true,
            }
          : null,

        // 6 + 7. „Съветник" and the objective — ONE decision, in
        // `advisorTaskRows`, because which of the two owns the sentence is the
        // whole of O54 and the pair cannot be decided a row at a time. Nothing
        // boolean is left here on purpose: the ternary that used to stand in
        // this slot could be neutralised with `|| true` and every suite stayed
        // green (measured; see the function's header).
        ...advisorTaskRows(queue.rows, { advisorFresh, praiseFresh, taskFresh, flash }),

        // 8. Which coloured line is which, and what the arrow and the beam of
        //    light are — said once, on the first quiet frame (see `legendKey`).
        legendFresh
          ? {
              id: "legend",
              kind: "legend" as const,
              tone: "neutral" as const,
              // „целта", never „точката": `rules/__tests__/point-scales.test.ts`
              // is right to refuse the second one — a bare „точка" on a driving
              // surface reads as КОНТРОЛНИ точки, the licence budget, which is
              // the one misreading this whole vocabulary exists to prevent.
              lineBg: `${
                shadowRibbonShown ? "Синя линия — колата-сянка · зелена" : "Зелената линия"
              }, стрелката и светлинният стълб — маршрутът и целта, до която караш`,
            }
          : null,
      ];

  // A6: a line the student sent away is no longer a candidate. Filtered HERE
  // and not inside SimOverlay, because `overlay.active` is what tells the rest
  // of the shell that the overlay layer is speaking (`data-sim-overlay-active`,
  // which hides the difficulty chip and the telltale pings) — hiding the card
  // without clearing that flag would leave the scene chrome suppressed by a
  // notification that is not on the screen any more.
  const overlay = selectOverlay(
    dismissedOverlayIds.size === 0
      ? overlayCandidates
      : overlayCandidates.filter((c) => c === null || !dismissedOverlayIds.has(c.id)),
  );

  // -- L15: is the full-frame debrief on screen? --------------------------------
  //
  // One pure predicate, two call sites, and a complement that guarantees the
  // student always has a route back to the explanation. `resultHeld` is folded
  // in deliberately: the I1 calibration gate is a REQUIRED step, so it outranks
  // „не показвай автоматично" — without that, a student who once turned the
  // popup off would silently never be asked to self-assess again, and the end
  // bar would summarise a verdict the gate exists to hide.
  const debriefVisibility = {
    ended: ended && result !== null,
    compact,
    expanded: endExpanded,
    skipped: endSkipped,
    autoOpen: endAutoOpen,
    held: resultHeld,
  };
  const debriefOpen = shouldShowDebrief(debriefVisibility);
  const endBarVisible = shouldShowEndBar(debriefVisibility);

  // -- THE DEBRIEF SAYS WHEN IT CONTINUES BELOW THE FOLD -----------------------
  //
  // The measuring half of `scrollRemainingPx` (see its header for the two
  // frames and why a scrollbar could not have answered them). The scroller is
  // the §I20 scrim itself, so this reads the element the browser is actually
  // clipping against rather than any card inside it.
  const endScrollRef = useRef<HTMLDivElement | null>(null);
  // The MEASUREMENT is in px and the STATE is a boolean, deliberately. This
  // handler runs on every scroll event, and the number changes on every one of
  // them — storing it would re-render the whole shell per event, on a phone,
  // for a pill whose text never changes. React bails out on an identical
  // value, so a boolean re-renders exactly twice per debrief: when the fold
  // appears and when the student reaches the end.
  const [endHasMore, setEndHasMore] = useState(false);
  const measureEndScroll = useCallback(() => {
    const el = endScrollRef.current;
    if (el === null) return;
    setEndHasMore(scrollRemainingPx(el.scrollTop, el.clientHeight, el.scrollHeight) > 0);
  }, []);
  useEffect(() => {
    if (!debriefOpen) return;
    const el = endScrollRef.current;
    if (el === null) return;
    if (typeof ResizeObserver === "undefined") {
      // jsdom / ancient Safari: one reading, and a later growth goes unnoticed.
      // A stale sentence still beats the silence this exists to end.
      measureEndScroll();
      return;
    }
    const ro = new ResizeObserver(measureEndScroll);
    ro.observe(el);
    // ── AND THE CONTENT, NOT ONLY THE BOX ────────────────────────────
    // The trap `BriefingCard`'s observer sits one step away from: a
    // ResizeObserver on a scroller fires for changes to the SCROLLER's size,
    // never to what is inside it. This debrief grows twice AFTER it opens and
    // neither growth touches the scrim's box — the I1 calibration gate resolves
    // and releases the whole result, and `finishLessonAction` returns and adds
    // the concepts row and the XP line. Observing the scrim alone would have
    // measured the card as it was before the two things a student most wants to
    // read arrived. `firstElementChild` is the `max-w-2xl` column, i.e. the
    // whole of the content.
    const content = el.firstElementChild;
    if (content !== null) ro.observe(content);
    return () => ro.disconnect();
  }, [debriefOpen, measureEndScroll]);
  // -- …AND THE TOAST STACK SAYS THE SAME THING ---------------------------------
  //
  // The affordance half of `notifyColumnCutPx`. Counted in CARDS rather than
  // pixels, for the reason `BriefingCard` counts steps: a card is the unit the
  // student is looking for, and „one more fault is down there" is a sentence,
  // where „82 px remain" is not.
  //
  // The rows are read off `[data-hud="toasts"]`'s children — `HudToasts` owns
  // that box, so this measures what is actually painted rather than a shape
  // guessed at from here. The two helpers are the ones the briefing already
  // uses, including `listRowsInScrollCoords`, which exists because
  // `li.offsetTop` is measured against the nearest POSITIONED ancestor and this
  // scroller is not one.
  const toastScrollRef = useRef<HTMLDivElement | null>(null);
  const [toastsBelowFold, setToastsBelowFold] = useState(0);
  // …and how many of those the student has seen NOTHING of — the number that
  // picks the sentence. See `rowsFullyBelowFold` for why one count cannot do
  // both jobs on a column of faults.
  const [toastsUnseenBelowFold, setToastsUnseenBelowFold] = useState(0);
  const measureToastFold = useCallback(() => {
    const el = toastScrollRef.current;
    if (el === null) return;
    const stack = el.querySelector('[data-hud="toasts"]');
    if (stack === null) {
      setToastsBelowFold(0);
      setToastsUnseenBelowFold(0);
      return;
    }
    const listTop = el.getBoundingClientRect().top;
    const rows = listRowsInScrollCoords(
      listTop,
      el.scrollTop,
      Array.from(stack.children).map((card) => {
        const r = (card as HTMLElement).getBoundingClientRect();
        return { top: r.top, height: r.height };
      }),
    );
    setToastsBelowFold(rowsBelowFold(rows, el.scrollTop, el.clientHeight));
    setToastsUnseenBelowFold(rowsFullyBelowFold(rows, el.scrollTop, el.clientHeight));
  }, []);
  useEffect(() => {
    const el = toastScrollRef.current;
    if (el === null) return;
    if (typeof ResizeObserver === "undefined") {
      measureToastFold();
      return;
    }
    const ro = new ResizeObserver(measureToastFold);
    ro.observe(el);
    // THE BOX AND THE CONTENT, both — the same trap the debrief's observer
    // names. This scroller's own height changes when the briefing yields, and
    // its CONTENT changes when a second fault arrives; only one of those two
    // resizes the scroller.
    const stack = el.querySelector('[data-hud="toasts"]');
    if (stack !== null) ro.observe(stack);
    return () => ro.disconnect();
    // `toasts` is in the deps because a new card mounts a new `[data-hud=…]`
    // box: `HudToasts` returns null with nothing to show, so the element the
    // observer needs does not exist until the first fault.
  }, [measureToastFold, toasts, toastsQuiet, compact]);

  const skipDebrief = useCallback(() => {
    setEndExpanded(false);
    setEndSkipped(true);
  }, []);
  const openDebrief = useCallback(() => {
    setEndExpanded(true);
    setEndSkipped(false);
  }, []);

  const menuItems = ended
    ? [
        // A2/A6, THEO-4: once the end line can be sent away with a ✕, the
        // explanation must still be one tap from anywhere. Same recall grammar
        // as „Задача" during the drive — the price of a dismissible notification
        // is a permanent way to bring it back, and a verdict without its
        // law-cited WHY is exactly what requirement zero forbids.
        ...(compact && result !== null
          ? [{ key: "debrief", labelBg: "Виж разбора", onSelect: openDebrief }]
          : []),
        { key: "exit", labelBg: "← Всички уроци", onSelect: onExitToSelect },
      ]
    : [
        ...(!examMode && !mistakeMode
          ? [
              {
                key: "advisor",
                labelBg: "Съветник",
                valueBg: advisorOn ? "вкл." : "изкл.",
                onSelect: toggleAdvisor,
                keepOpen: true,
              },
              {
                key: "quiz",
                labelBg: "Въпроси",
                valueBg: MICRO_QUIZ_FREQUENCIES.find((f) => f.id === quizFreq)?.labelBg ?? "",
                // Cycles the three frequencies: a radio group is four controls
                // wide, and this sheet is 240 px on a phone.
                onSelect: () => {
                  const i = MICRO_QUIZ_FREQUENCIES.findIndex((f) => f.id === quizFreq);
                  setQuizFreq(MICRO_QUIZ_FREQUENCIES[(i + 1) % MICRO_QUIZ_FREQUENCIES.length].id);
                },
                keepOpen: true,
              },
            ]
          : []),
        // The price of a task line that retires after seven seconds is that it
        // must come back in one tap. This is that tap — and it is why making the
        // banner transient is a redesign rather than a deletion.
        ...(compact && taskLineBg !== null && taskLineBg !== ""
          ? [
              {
                key: "task",
                labelBg: "Задача",
                valueBg: mistakeMode ? null : `${snap.objectiveIndex}/${snap.objectiveTotal}`,
                onSelect: () => setTaskPing((n) => n + 1),
              },
            ]
          : []),
        // …AND THE SAME PRICE FOR THE PRE-DRIVE LINE (C5/§I5(b)). The measured
        // dead end was „no way back to the checklist" — the menu offered
        // Съветник / Въпроси / Карта / Изход от цял екран / Прекрати урока /
        // ← Всички уроци and nothing else, so a 4 px miss cost the lesson. The
        // row is present exactly while the pre-drive is the live task, and it
        // carries n/13 for the same reason «Задача» carries 2/3: a recall the
        // student can see the state of is a recall he will use.
        ...(compact && !ended && snap.phase === "preDrive"
          ? [
              {
                key: "predrive",
                labelBg: "Подготовка",
                valueBg: `${snap.preDriveCompleted.length}/${PRE_DRIVE_STEP_ORDER.length}`,
                onSelect: recallPreDriveOverlay,
              },
            ]
          : []),
        {
          key: "minimap",
          labelBg: "Карта",
          valueBg: minimapOn ? "вкл." : "изкл.",
          onSelect: toggleMinimap,
          keepOpen: true,
        },
        // ── «ЗВУК» · THE MIX THE PRODUCT ALWAYS HAD AND COULD NOT BE TOLD ABOUT
        //
        // Nine w10 rows over seven lessons: „no evidence of audio anywhere, and
        // no way to control it". Six of them photograph THIS sheet — «Съветник ·
        // Въпроси · Задача · Карта · Качество · Прекрати · ← Всички уроци» and
        // nothing else. The rows conclude the product has no audio; it has a
        // full procedural mix, live on every lesson (built at LessonScene 1589,
        // fed per frame by VehicleRig 620). What it had no route to was this
        // row: mute was reachable ONLY from the M key, so on a phone the sound
        // was not merely uncontrolled but uncontrollABLE.
        //
        // AND IT CLOSES ONE NOUN OF THREE. Every one of those rows says „no
        // volume control, no mute, no audio indicator"; this is mute. The rows
        // stay OPEN, and `soundChoice.ts` says which clause each one keeps —
        // including the чл. 91 siren, whose oscillators exist and whose cue
        // never fires because no emergency actor is ever on the road (still-open
        // critical sc-vu-emergency:180ed5bc; the trace is in the store header).
        //
        // BESIDE «Карта» AND «Качество», with the other controls that change
        // what the session PRESENTS rather than what the car does.
        //
        // IN THE EXAM TOO, for «Качество»'s reason and one of its own. It is not
        // coaching, so it is no advantage — and it is the one row here a student
        // may need in the opposite direction: an exam whose stimulus is a siren
        // (чл. 91) is unpassable to a student who muted the sim three lessons
        // ago and has no way to find out, let alone undo it.
        //
        // `keepOpen` and a `hintBg` for the same reason the quality row has
        // both: the student watches the word change under his thumb, and under
        // THEO-4 a setting that changes what he LEARNS may not announce itself
        // as a bare state word. Silence teaches a systematically faster car
        // (doc 82 §4.4) — `soundChoice.ts` carries the sentence and its budget.
        {
          key: "sound",
          labelBg: "Звук",
          valueBg: soundValueBg(soundMuted),
          hintBg: soundHintBg(soundMuted),
          ariaLabelBg: soundAriaLabelBg(soundMuted),
          onSelect: toggleSimAudioMuted,
          keepOpen: true,
        },
        // ── §I26(c) · THE QUALITY CONTROL, WHERE AN FPS COMPLAINT CAN REACH IT
        //
        // „if the frame rate is bad he still has to leave the session to change
        // anything." It is HERE — beside «Карта» and «Цял екран», the other two
        // controls that change what the screen shows rather than what the car
        // does — and it applies to the running lesson.
        //
        // IT IS PRESENT IN THE EXAM TOO, deliberately, and it is the one row in
        // this group that is: «Съветник» and «Въпроси» are coaching and would be
        // an unfair advantage, but a phone that is drowning during the official
        // 45-question drive is the worst moment in the product to be told to
        // abandon the session. Nothing here changes what is scored.
        //
        // `keepOpen` because it cycles: Авто → Ниско → Средно → Високо. The
        // student watches the value AND the trade line change under their thumb,
        // which is the whole THEO-4 argument for the row having a second line at
        // all — a setting that changes the experience silently is a bare verdict
        // one layer out from the theory module.
        ...(onQualityChange
          ? [
              {
                key: "quality",
                labelBg: "Качество",
                valueBg: qualityValueBg(qualitySelection, quality),
                hintBg: qualityTradeBg(qualitySelection, quality),
                ariaLabelBg: qualityAriaLabelBg(qualitySelection, quality),
                onSelect: () => onQualityChange(nextQualitySelection(qualitySelection)),
                keepOpen: true,
              },
            ]
          : []),
        ...(fullscreenAvailable
          ? [
              {
                key: "fullscreen",
                labelBg: isFullscreen ? "Изход от цял екран" : "Цял екран",
                onSelect: toggleFullscreen,
              },
            ]
          : []),
        lesson.objectives.length === 0
          ? { key: "finish", labelBg: "Завърши сесията", onSelect: finishNow }
          : {
              key: "abort",
              labelBg: examMode ? "Прекрати изпита" : "Прекрати урока",
              tone: "danger" as const,
              onSelect: abortNow,
            },
        { key: "exit", labelBg: "← Всички уроци", onSelect: onExitToSelect },
      ];

  return (
    <div
      ref={rootRef}
      // The hook PlayAreaStyles' `main:has(…)` rule keys off: present ONLY in
      // the letterboxed state, so the prose width cap is lifted exactly while a
      // session is on screen and nowhere else.
      // THE PORTAL HOST for modal cards owned by panels inside the scene
      // (today: the pre-drive tutorial). Two constraints made a plain
      // `document.body` portal wrong, both measured rather than reasoned:
      //   · this element is the FULLSCREEN element, and the browser paints the
      //     fullscreen element in the TOP LAYER — a card portalled to <body>
      //     lands underneath the canvas and cannot be clicked at all;
      //   · but the card cannot stay where it was rendered either, because the
      //     checklist panel that owns it has `backdrop-blur`, which makes it a
      //     containing block for `position: fixed` — the card was resolving
      //     `inset-0` against a 320 px panel in the top-left corner.
      // This element is inside the fullscreen tree and carries no transform,
      // filter or backdrop-filter, so `fixed inset-0` means the screen here.
      data-sim-shell=""
      data-sim-play={immersive ? undefined : "letterbox"}
      // …and this one is what PlayAreaStyles uses to fold the scene's own
      // desktop chrome away on a phone.
      data-sim-compact={compact ? "on" : undefined}
      // ONE OVERLAY AT A TIME, ENFORCED ACROSS COMPONENT TREES. While the
      // queue is speaking, the two scene-owned corner widgets (difficulty
      // picker, telltale edge chips) stand down — otherwise the „one line"
      // system would put a second panel back on the glass the instant it
      // appeared, which is exactly the stacking being fixed. The rule lives in
      // SimOverlay's style block; this attribute is its switch.
      data-sim-overlay-active={
        compact && (overlay.active !== null || overlaySheetOpen) ? "on" : undefined
      }
      className={
        // Fullscreen: the UA sizes this element to the viewport — become a
        // padded column so the scene (flex-1) absorbs all remaining height.
        // No Fullscreen API (iPhone Safari) or a phone-shaped viewport: do the
        // UA's job ourselves. NOT `inset-0` — see useVisualViewportHeight for
        // why a fixed `bottom: 0` is exactly how the founder's third frame ended
        // up with its pedal UI below the fold. Top-anchored + an explicit
        // measured height cannot do that.
        isFullscreen
          ? // DOC 91 · L12/§I8 — THE FULLSCREEN ARM HAD TO LEARN THE SAME RULE.
            // It hard-coded `gap-2 p-2`, and it is tested FIRST, so a phone that
            // GRANTS the Fullscreen API never reached the `compact ? "" :` rule
            // six lines below — the one whose comment is „eight pixels of page
            // gutter on each side of a driving simulator is eight pixels of
            // road". Measured on the DEPLOYED product, Chromium (which grants
            // fullscreen for a <div>; iOS Safari does not), authenticated
            // /simulator, live canvas: 836×377 inside an 852×393 viewport in
            // landscape AND 377×836 inside 393×852 in portrait — 16 px of width
            // and 16 px of height, in both orientations, on every Android phone
            // in the market. tools/mobile/wave6-edges.mjs, row I8.
            `flex h-full flex-col overflow-hidden bg-background ${compact ? "" : "gap-2 p-2"}`
          : immersive
            ? `fixed left-0 top-0 z-40 flex w-full flex-col overflow-hidden bg-background ${
                // Compact: no padding at all. Eight pixels of page gutter on
                // each side of a driving simulator is eight pixels of road.
                compact ? "" : "gap-2 p-2"
              }`
            : "flex flex-col gap-3"
      }
      style={{
        ...(immersive && !isFullscreen
          ? {
              height: viewportH !== null ? `${viewportH}px` : "100dvh",
              // THE OTHER THREE AXES — see `useVisualViewportBox`. The class
              // list says `fixed left-0 top-0 w-full`, i.e. the LAYOUT
              // viewport; under zoom that is a box wider than the window, so
              // the shell hung off BOTH edges and the founder's rails were
              // sliced on the left and the right in the same frame. Inline
              // styles outrank the utility classes, so these three simply
              // retarget the same element at the window the student can
              // actually see — and when the API is absent (`null`) the classes
              // stand exactly as they shipped.
              ...(viewportBox !== null
                ? {
                    left: `${viewportBox.left}px`,
                    top: `${viewportBox.top}px`,
                    width: `${viewportBox.w}px`,
                  }
                : null),
            }
          : null),
        // ── DOC 91 · T1/§I6, SECOND HALF — «IT MOVES LEFT AND RIGHT» ────────
        //
        // §I6 shipped `touch-action: none` on the wrapper whose only child is
        // the scene, and it was right to scope it: the stage contains the
        // pre-drive tutorial's scroller, whose «Разбрах» is 300–423 px below the
        // fold on 13 of 13 landscape steps, and `touch-action` resolves up the
        // ancestor chain — `none` on the shell would have traded a nuisance for
        // an unwinnable lesson.
        //
        // BUT EVERY CARD IS A SIBLING OF THAT WRAPPER, NOT A DESCENDANT, and
        // `touch-action` is intersected across the elements the touch points
        // are over. So a pinch that starts on the road was suppressed and a
        // pinch that starts ON A CARD — which is where his thumbs are the whole
        // time a card is up — was not. Measured on the DEPLOYED product with a
        // real two-point CDP `Input.dispatchTouchEvent`, Chromium put on his own
        // code path (the Fullscreen API refused, exactly as iOS Safari refuses
        // it), authenticated /simulator, live canvas:
        //
        //     pinch on the road   scale 1 → 1      offsetLeft 0 → 0
        //     pinch on the CARD   scale 1 → 1.28   offsetLeft 0 → 145
        //
        // 145 px of leftward pan on an 852 px screen is „the screen is eating
        // the right side… it is not stabilized, it moves left and right", and
        // it is also why his «РАЗБРА[Х]» runs off the edge: nothing is clipped
        // at scale 1 (the same run measured ONE painted thing 2 px outside the
        // safe-area box on the whole screen) — the card is clipped because the
        // VISUAL VIEWPORT is zoomed and panned. One gesture, both complaints.
        //
        // WHY `pan-y` AND NOT `none`. `none` here would kill the tutorial
        // card's scroller, the ⚙ sheet's scroller and the hint's, for the reason
        // §I6 gives above. `pan-y` keeps every one of them scrolling and removes
        // exactly two behaviours: pinch-zoom and horizontal pan — and the app
        // has no horizontal scroller inside this shell (one `overflow-x-auto`
        // exists in the whole sim tree, `FaultCard.tsx:348`, which lives on the
        // debrief and not under this root). The scene wrapper keeps its `none`;
        // an ancestor can only narrow a descendant, never widen it.
        //
        // AND IT IS SCOPED TO THE DRIVING SHELL, WHICH IS THE POINT. This is an
        // inline style on ONE element that exists only while a session is on
        // screen. It is NOT the viewport meta: that export is global, Safari has
        // ignored `user-scalable`/`maximum-scale` since iOS 10 so it would not
        // even work on his phone, and it would disable pinch on the theory and
        // exam screens where minors read dense Bulgarian legal text. The same
        // run proves those screens still zoom — /theory went scale 1 → 3.568,
        // which is also the positive control that makes the two zeros above mean
        // anything at all.
        ...(immersive || isFullscreen ? { touchAction: "pan-y" } : null),
        // Published for the whole subtree (incl. the scene's TouchControls).
        ["--sim-vh" as string]: viewportH !== null ? `${viewportH}px` : "100dvh",
        ["--sim-dash-h" as string]: `${dashHeightPx}px`,
        ["--sim-hud-floor" as string]: `${hudFloorPx}px`,
        // ── DOC 91 · D4/§I11 — WHERE THE THUMB BAND ENDS, PUBLISHED AS A LENGTH.
        //
        // ⚠ ITS FIRST CONSUMER HAS GIVEN IT BACK, ON PURPOSE — 2026-08-13.
        // §D4's diagnosis was „`TouchControls` already publishes the number that
        // would have prevented it — and `SimOverlay` does not read it", and the
        // overlay sheet duly stood on this floor. That fix is superseded: the
        // sheet is now a READ MODE that stops the car, so there is no live thumb
        // band for it to clear and standing on one only clipped its own
        // «Разбрах» (see `data-sim-overlay-read` in SimOverlay.tsx). The
        // property is KEPT rather than deleted because it is still true and
        // still read: `tools/mobile/wave6-edges.mjs` asserts clearances against
        // it, `tools/mobile/lib/insets.mjs` documents it by name, and it is the
        // one place any future surface that must clear the controls WHILE THE
        // CLOCK IS RUNNING can get the number without re-deriving the arc.
        //
        // `TOUCH_CONTROLS_FLOOR` is a CSS length, not a pixel count, so it is
        // republished AS a length: it keeps its `env(safe-area-inset-bottom)`
        // and its `ARC_RISE` clamp, both of which have to be resolved by the
        // engine against the live box rather than frozen into a number here
        // (and keeping it authored CSS is also what lets the notch harness
        // substitute a real inset into it — tools/mobile/lib/insets.mjs
        // rewrites declarations, it cannot reach a number computed in JS).
        //
        // `0px` when there is no thumb band to clear: no touch screen, or a
        // roomy layout, where the sheet standing on the dash was always right.
        //
        // Published against `var(--sim-vh)` and NOT as the percentage form: the
        // sheet needs it in a `max-height`, where a percentage resolves against
        // a `bottom:`-anchored box of auto height — an indefinite reference the
        // engine answers by dropping the declaration. That cost one deploy:
        // the cap did nothing and the sheet's «Затвори» stood 123.5 px above
        // the top of the screen. Same arithmetic, one definition, in
        // `touchControlsFloorCss`.
        ["--sim-touch-floor" as string]:
          compact && hintInput === "touch" && !ended
            ? touchControlsFloorCss("var(--sim-vh, 100dvh)")
            : "0px",
        ["--sim-minimap-clearance" as string]: `${minimapClearancePx(minimapOn)}px`,
      }}
    >
      <HudStyles />
      <PlayAreaStyles />

      {/* Top bar — ROOMY LAYOUTS ONLY.
          On a phone these two rows measured 93 px of a 390 px viewport (24 %)
          and the founder's ruling on them was „absolutely no needed". Compact
          renders <PlayMenu/> inside the canvas instead: same actions, 44 px,
          one corner. */}
      {compact ? null : (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={onExitToSelect}>
          ← Всички уроци
        </button>
        <h1 className="text-lg font-extrabold">{lesson.titleBg}</h1>
        {/* A13: unmistakable exam framing — this is a protocol, not a lesson. */}
        {examMode ? (
          <span className="rounded-full bg-danger/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-danger">
            Изпит
          </span>
        ) : null}
        {/* THEO-3: unmistakable sandbox framing — nothing here is graded. */}
        {mistakeMode ? (
          <span className="rounded-full bg-danger/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-danger">
            Пясъчник — не се оценява
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!ended ? (
            <>
              {/* „Съветник": show/hide the next-action prompt card. Hidden on
                  exams — the advisor is a training aid, not the car — and in
                  the THEO-3 sandbox, where prompting the CORRECT next action
                  would fight the „направи грешката" assignment. */}
              {!examMode && !mistakeMode ? (
                <button
                  type="button"
                  aria-pressed={advisorOn}
                  onClick={toggleAdvisor}
                  title="Съветник: показва следващото действие и клавиша за него"
                  className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition motion-reduce:transition-none ${
                    advisorOn
                      ? "border-accent-2/60 bg-accent-2/15 text-accent-2"
                      : "border-border bg-surface text-muted hover:text-foreground"
                  }`}
                >
                  Съветник {advisorOn ? "вкл." : "изкл."}
                </button>
              ) : null}
              {/* A13: no micro-quizzes on an exam — the selector disappears.
                  THEO-3: none in the sandbox either (the bank never loads). */}
              {!examMode && !mistakeMode ? (
                <QuizFrequencySelector value={quizFreq} onChange={setQuizFreq} />
              ) : null}
              {/* Doc 86 L14 — „По-тихи известия". Not gated on examMode or the
                  sandbox: the toast column runs in both, and the founder's
                  complaint („much much annoying") was about the column, not
                  about a mode. Quiet drops the „Браво" cards and shows one at a
                  time; a graded mistake keeps its title, its authored WHY and
                  its law chip in every mode, which is why this is a noise
                  control and not a teaching control. */}
              <button
                type="button"
                aria-pressed={toastsQuiet}
                onClick={toggleToastsQuiet}
                title="По-тихи известия: едно по едно, без похвалите. Грешките и обясненията към тях остават."
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition motion-reduce:transition-none ${
                  toastsQuiet
                    ? "border-accent/60 bg-accent/15 text-accent"
                    : "border-border bg-surface text-muted hover:text-foreground"
                }`}
              >
                Известия {toastsQuiet ? "тихо" : "нормално"}
              </button>
              {lesson.objectives.length === 0 ? (
                <button type="button" className="btn-accent px-4 py-1.5 text-xs" onClick={finishNow}>
                  Завърши сесията
                </button>
              ) : (
                <button type="button" className="btn-ghost px-4 py-1.5 text-xs" onClick={abortNow}>
                  {/* A13: no mid-exam restart — leaving = abort, next try is a
                      fresh attempt from the briefing. */}
                  {examMode ? "Прекрати изпита" : "Прекрати урока"}
                </button>
              )}
            </>
          ) : null}
          {/* ── «КАЧЕСТВО» — THE ONE ROW THE PHONE HAD AND THE DESKTOP DID NOT
              — sweep 161, sc-sp-curve/pc: „On PC the in-drive menu never opens.
              07b-menu.png is captured at the same step that produces a full
              settings sheet on mobile, but on PC it is the ordinary drive
              frame."

              HALF OF THAT IS BY DESIGN AND HALF WAS A HOLE. There is no «МЕНЮ»
              on a roomy screen on purpose — every row of the compact sheet is
              already a button on this bar, which is what the micro-menu block
              says in as many words. Checked row by row against the sheet:
              «Съветник», «Въпроси», «Известия», «Прекрати», «Цял екран» are all
              here, and «Карта» is the chip on the minimap column below. One was
              not: `nextQualitySelection` had exactly one call site in this file
              and it was inside the compact-only items array, so a desktop
              student whose frame rate collapsed had no route to the setting at
              all — which is the founder's own sentence about why the row exists
              („if the frame rate is bad he still has to leave the session to
              change anything"), left true on the platform he reported it from.

              Same cycler, same labels, same THEO-4 second line — the trade is
              in `title` here rather than under the label, because a top bar has
              no room for a second row and a setting that changes the experience
              without saying what it costs is the bare verdict requirement zero
              forbids. Present during the exam for the reason the sheet's row
              is: nothing here changes what is scored. */}
          {!ended && onQualityChange ? (
            <button
              type="button"
              className="btn-ghost px-3 py-1.5 text-xs"
              onClick={() => onQualityChange(nextQualitySelection(qualitySelection))}
              title={qualityTradeBg(qualitySelection, quality) ?? undefined}
              aria-label={qualityAriaLabelBg(qualitySelection, quality) ?? undefined}
            >
              Качество: {qualityValueBg(qualitySelection, quality)}
            </button>
          ) : null}
          {/* QW1: fullscreen toggle — the same control exits (Esc works too).
              Hidden where the API does not exist: a button that cannot do its
              one job is worse than no button, and the CSS immersive layout has
              already given the scene the whole screen there. */}
          {fullscreenAvailable ? (
            <button
              type="button"
              className="btn-ghost px-3 py-1.5 text-xs"
              onClick={toggleFullscreen}
              aria-pressed={isFullscreen}
              title={isFullscreen ? "Изход от цял екран (X или Esc)" : "Цял екран (X)"}
            >
              <span aria-hidden>⛶</span> {isFullscreen ? "Изход" : "Цял екран"}
            </button>
          ) : null}
        </div>
      </div>
      )}

      {/* Scene + HUD overlays.
          Letterboxed: 16:9 (the frame the cockpit-camera contract is authored
          at — playArea.ts), centred, and never wider than the height left under
          it allows. The inline max-width is the MEASURED cap; the calc() is the
          server-rendered fallback so the first paint is already close instead
          of flashing full-width and snapping back.
          Compact: no rounding and no border — the picture IS the screen, and a
          12 px radius on a full-bleed frame is a 12 px hole in the road. */}
      <div
        ref={sceneBoxRef}
        // THE STAGE. Everything painted over the road lives inside this box,
        // and PlayAreaStyles' UNPANEL layer is scoped to it — so the „no
        // panels" register applies to the driving HUD and to nothing else in
        // the app. It is a separate handle from `data-sim-play` on purpose:
        // that one is absent in the immersive/fullscreen layout, which is
        // precisely the layout the founder's reference frames are of.
        data-sim-stage=""
        className={`relative mx-auto w-full overflow-hidden bg-surface ${
          immersive
            ? compact
              ? "min-h-0 flex-1"
              : "min-h-0 flex-1 rounded-lg"
            : "aspect-video rounded-xl border border-border"
        }`}
        style={
          immersive
            ? undefined
            : {
                maxWidth:
                  playMaxWidth !== null
                    ? `${playMaxWidth}px`
                    : `calc((100dvh - ${PLAY_CHROME_FALLBACK_PX}px) * ${PLAY_ASPECT})`,
              }
        }
      >
        {/* ═══ THE ROAD TAKES NO BROWSER GESTURES — doc 91 §I6/§T1 ═════════════
            The founder: „the interface can move left/right and portions of the
            platform can effectively slide outside the visible screen."

            It is NOT overflow and it is NOT the document scrolling. Measured
            again on this branch (Chromium, 852×393, dpr 3, real insets,
            `matchMedia("(pointer: coarse)")` verified true, `data-sim-compact`
            = "on"): `scrollWidth === clientWidth === 852`, and a walk of every
            rendered element found ZERO nodes crossing 100vw or with a negative
            left edge. A one-finger drag left `scrollX` and
            `visualViewport.offsetLeft` at 0. So `overflow-x: hidden` would hide
            nothing, and the founder was right to forbid it.

            What DOES move is the VISUAL VIEWPORT. A real two-finger pinch,
            fired through CDP `Input.dispatchTouchEvent` with an explicit
            two-point `touchPoints` array (Playwright's touchscreen is
            single-tap and cannot express this, which is why no earlier wave
            caught it), took the road to `visualViewport.scale` 5 — and one
            finger then panned it to `offsetLeft` 247, `offsetTop` 24. That is
            his sentence, reproduced: the picture slides and the edges of the
            platform go off-screen. The instrument was proved honest first — the
            same code zooms a known-zoomable positive control 1 → 5, which is
            the check the audit's own gesture lane failed and had to discard.

            `touch-action: none` is the only mechanism that stops it in EVERY
            engine: Safari has ignored `user-scalable` / `maximum-scale` since
            iOS 10, so the viewport meta cannot do this job — and that meta is a
            GLOBAL export in app/layout.tsx, so reaching for it would disable
            pinch-zoom on the theory and exam screens, where minors read dense
            Bulgarian legal text. That is an accessibility regression this
            product will not pay for a driving-screen bug.

            SCOPED TO THE CANVAS WRAPPER, NOT THE SHELL AND NOT THE STAGE, and
            the scope is the whole care here. `touch-action` is resolved up the
            DOM ancestor chain, so `none` on an ancestor silently disables
            touch scrolling in every descendant. The stage box (`data-sim-stage`,
            just above) runs to the end of this component and contains the
            full-screen overlay scroller below, and the pre-drive tutorial card
            is 743–821 px tall in a 393 px viewport — its «Разбрах» is 300–423 px
            below the fold on 13 of 13 landscape steps (doc 91 §L8), so scrolling
            it is the ONLY way to finish a step. Killing that to stop a zoom
            would trade a nuisance for an unwinnable lesson. This div's only
            child is the scene, every HUD overlay is a sibling of it, so exactly
            the road stops taking gestures and nothing else changes. */}
        <div className="h-full w-full" style={{ touchAction: "none" }}>
          <SceneSlot
            key={sceneEpoch}
            lesson={lesson}
            quality={quality}
            paused={
              ended ||
              activeQuiz !== null ||
              teachQueue.length > 0 ||
              consequence !== null ||
              // ══ THE READ MODE STOPS THE CAR — 2026-08-13, doc 91 §I11/§W2 ══
              //
              // `overlaySheetOpen` is the compact overlay's OPEN state: the
              // student pressed «Защо» / «Инструкции» / «СПИСЪК» and is now
              // reading the authored WHY, the law citation or the pre-drive
              // checklist. Until today that surface tried to share a 393 px-tall
              // screen with the driving controls and lost: measured on the
              // deployed build, six profiles, it buried 7 controls in landscape
              // (5 of 5 in the top rail, «Закопчай предпазния колан» among them)
              // and 3 in portrait, and clipped its own «Разбрах».
              //
              // Adding it here is the OTHER HALF of `SimOverlay`'s read mode and
              // the two may not be separated: this is what makes covering the
              // controls legitimate rather than a defect. `paused` reaches
              // `LessonScene` as `physicsPaused` and `TouchControls` as
              // `hidden`, which releases both axes and both pads' pointer
              // ownership (the §C1 fix) and renders every button inert — so
              // there is nothing under the panel to bury, the car cannot creep
              // while a minor reads a paragraph of law, and the thumb that was
              // on the throttle picks the pedal straight back up on the first
              // `pointermove` after «Затвори» (the §I3 „inert, not gone" path,
              // which this reuses rather than inventing around).
              //
              // IT IS ALSO THE PEDAGOGY. Doc 64 THEO-4 asks this product to
              // behave like a driving instructor; an instructor pulls over to
              // explain the hard thing. The alternative shipping today is an
              // 88 px strip over a moving car with its own button cut off.
              overlaySheetOpen ||
              // ══ …AND «МЕНЮ НА УРОКА», 2026-08-13, doc 91 §W3 ══
              //
              // The same seam, the same argument, and the defect the wave-9
              // sweep left open behind the one it closed: measured on f85f49a
              // with the car MOVING, this sheet buried 2–3 LIVE controls on 6
              // of 6 profiles — the steering pad itself on the Samsung
              // landscape. Every row of it is a between-attempts decision, so
              // the car stops while it is up and the covering stops being a
              // defect. The full derivation is on PlayMenu's `onOpenChange`.
              playMenuOpen
            }
            driveLocked={snap.driveLocked && !ended}
            preDriveHighlightStepId={
              // Instruction mode only: pulse the pending step's hotspot(s).
              preDriveMode === "instruction" && !ended ? snap.preDriveNextStepId : null
            }
            // A7: snapshotOf stores currentObjectiveIndex + 1 — undo the +1 so
            // the scene's in-world route guidance gets the engine's 0-based
            // index (=== objectives.length once all are done → guidance hides).
            // A13: exam sessions pass the all-done index UNCONDITIONALLY — the
            // ghost route / turn arrows / markers never render; the student
            // navigates by the objective banner's examiner instructions.
            activeObjectiveIndex={
              examMode ? lesson.objectives.length : snap.objectiveIndex - 1
            }
            onTick={handleTick}
            onPreDriveStep={handlePreDriveStep}
            onBlockedDriveAttempt={handleBlockedDriveAttempt}
            onMinimapFrame={setMinimapFrame}
            onDriveline={handleDriveline}
            onDrivelineRejection={handleDrivelineRejection}
            onReversePedalStuck={handleReversePedalStuck}
            onStuckStart={handleStuckStart}
            onTransmissionChanged={handleTransmissionChanged}
            onMousePedalsYielded={handleMousePedalsYielded}
            // P1: the touch overlay's ⛶ button — same QW1 toggle as key X.
            // Omitted where the API does not exist (iPhone Safari): the
            // overlay drops the button rather than offering a no-op.
            onToggleFullscreen={fullscreenAvailable ? toggleFullscreen : undefined}
            // A8/A15: measurement channels (staged outcomes + near-misses).
            onStagedOutcome={handleStagedOutcome}
            onNearMiss={handleNearMiss}
            // S1: scenario sessions record the student's attempt (glances →
            // observation stars; the future compare-vs-shadow view).
            attemptRecorderRef={attemptRecorderRef}
            // Car status dashboard: the scene writes the live cabin state
            // (blink clock included) into this shared per-frame channel.
            dashboardStatusRef={dashboardStatusRef}
          />
        </div>

        {/* THE ONE OVERLAY — compact layouts. Task, advisor, teach moment,
            violation, cabin warning, pre-drive step, ribbon legend and the
            end-of-session verdict all arrive through here, one at a time, as a
            single line in the top rail with their authored WHY one tap behind
            it (THEO-4). The roomy renderings below are unchanged and still
            carry the desktop Space-to-acknowledge. */}
        {compact ? (
          <SimOverlay
            item={overlay.active}
            queued={overlay.queued}
            frozen={teachQueue.length > 0 || activeQuiz !== null || ended}
            onOpenChange={setOverlaySheetOpen}
            // A6 — „those pop ups need to be able to be removed when clicked."
            onDismiss={dismissOverlayItem}
            renderDetail={(item) =>
              item.kind === "predrive" ? (
                <PreDriveChecklist
                  completedStepIds={snap.preDriveCompleted}
                  wrongOrderStepIds={snap.preDriveWrongOrder}
                  mode={preDriveMode}
                  // §I12 — the copy speaks to the device in his hands, from the
                  // same `hasTouchScreen()` reading the touch controls mount on.
                  pointer={hintInput === "touch" ? "touch" : "mouse"}
                  // §I4(b) — this mount IS the compact one (it is the bottom
                  // sheet's body), so no tutorial modal opens by itself here.
                  compact
                  onConfirmStep={(stepId) => {
                    if (preDriveStepKind(stepId) === "info") handlePreDriveStep(stepId);
                  }}
                />
              ) : null
            }
          />
        ) : null}

        {/* ══ THE RIGHT-EDGE NOTIFICATION COLUMN ═════════════════════════════
            FOUNDER, 2026-08-03, THIRD ASKING, with a drawing: „you see all this
            text in the middle yes, and we said we have to move it from there so
            it doesnt bother the view … it must be like a popup notifications
            going below, it must be small text so the user can just read it —
            all the texts that are in the front: the task, the demonstration
            window, and the guidance what to do, the instructions too."

            WHAT WAS HERE, AND WHY „SMALLER" WAS NEVER THE ANSWER. This was
            `absolute left-1/2 top-3 … -translate-x-1/2` — the objective banner,
            the advisor prompt and the briefing, stacked DEAD CENTRE at the top
            of the picture. Measured at 1280×800 before the change: the stack
            laid out 573.7 px starting at x = 353, and the briefing card 448 px
            starting at x = 416, i.e. 16.2 % and 12.6 % of the frame INSIDE the
            centre band that `overlayQueue.ts` defines as the road. The pass
            before this one made those boxes transparent and reported the chrome
            budget going 70 % → 85 %; his view stayed blocked, because a
            transparent box in front of the vanishing point is still in front of
            the vanishing point. THE ACCEPTANCE TEST IS POSITION.

            So the three of them and the toast column become ONE column hard
            against the RIGHT edge, stacking downward, at
            `notifyColumn.ts`'s geometry — whose whole contract is that the
            column's left edge never comes left of 60 % of the width on any
            device in the ladder.

            The old `max-w-[calc(100vw-1.5rem)]` clamp is not lost, it is
            subsumed: the column's width is a `min(20rem, 30vw)`, which cannot
            exceed the viewport by construction, and every child is `w-full`
            inside it rather than shrink-to-fit against half the stage.

            ROOMY ONLY. On a phone the same four things arrive through the queue
            (`SimOverlay`), which renders into the SAME column from the same
            constants. `data-hud` is the handle PlayAreaStyles needs to step the
            column clear of the chase view's rear-view window during a glance
            (rows B74/B76). ══════════════════════════════════════════════════ */}
        <div
          // `min-h-0`: the column is itself a flex item in nothing, but every
          // CHILD of it is one, and a flex item's default `min-height: auto`
          // means it will not shrink below its content. That is what turned
          // „anything longer scrolls inside its own card" (below) into a lie —
          // the cards could not shrink, so `overflow-hidden` cut them instead,
          // and the sweep filed the same slice-through-the-x-height four times
          // (bridge-ice steps 9–10, turn-lane-arrows rule 6, obstacle-meeting
          // step 6, and the «НАУЧИ» toast on ov-narrow). The scroll now happens
          // where the comment always claimed it did.
          //
          // THIS COMMENT SITS ABOVE `data-hud` AND NOT UNDER IT, ON PURPOSE.
          // `thumb-band-clearance.test.ts` (N4) reads 260 characters forward
          // from the `data-hud="notify-column"` anchor to check this column is
          // still `z-30` — the number its own `z-index: 40` rule is beating.
          // Nine lines of prose between the anchor and the class list pushed
          // `z-30` out of that window and turned a live guard red. The guard is
          // right and the comment moved.
          data-hud="notify-column"
          className={`pointer-events-none absolute z-30 flex min-h-0 flex-col items-stretch gap-1.5 overflow-hidden ${
            compact ? "hidden" : ""
          }`}
          style={{
            top: NOTIFY_COLUMN_TOP_CSS_ROOMY,
            right: NOTIFY_COLUMN_RIGHT_CSS,
            width: NOTIFY_COLUMN_WIDTH_CSS_ROOMY,
            // Never past the instrument band: a column that runs to the floor
            // is a sidebar, and a sidebar is the web page this HUD stopped
            // being. Anything longer scrolls inside its own card.
            //
            // ══ …AND THE CAP HAS TO SUBTRACT THE COLUMN'S OWN TOP ═══════════════
            //
            // `max-height` is measured from the element's top edge, so
            // `100% - floor - gutter` only means „stops above the band" for a
            // column that starts at 0. This one starts at `top`, and on
            // 2026-08-17 that top moved: `NOTIFY_COLUMN_TOP_CSS_ROOMY` stopped
            // being 3.25 rem and became the interior mirror's lane
            // (`max(3.25rem, 24% + 0.5rem)`), which is 164 px on the stage the
            // sweep drove. The cap did not follow it, so the sentence three
            // lines above became false by exactly that 164.
            //
            // MEASURED, Chromium, a 1165 × 650 stage — the `?chrome=dashboard`
            // box at the sweep's 1440 × 900 window:
            //
            //   top        164.00        (the number notifyColumn.ts records
            //                             from both engines, so the reading is
            //                             of the shipped CSS and not of a
            //                             lookalike)
            //   shipped    height 486 → bottom 650  = the stage's own floor,
            //              i.e. 108 px INSIDE the instrument band, over the
            //              pedal column and the wiper/lights icons
            //   this cap   height 322 → bottom 486  = 100% − 108 − 3.5rem,
            //              which is what the comment always claimed
            //
            // It is latent rather than photographed — the sweep's frames were
            // driven at the 52 px top, where 52 + 486 = 538 landed just above
            // the band, and `sc-sp-limit-end/pc-wrong/04-t017s.png` shows the
            // ОПАСНА ГРЕШКА card guillotined on exactly that 538. With the top
            // at 164 the same content is 112 px further down and the clip edge
            // is inside the controls. Fixing the cap is what keeps the
            // guillotine (which is a separate defect, routed below) from
            // happening ON TOP of the pedals.
            //
            // Nested `calc()` is valid CSS Values 3 and resolves in both
            // engines — a dropped `calc()` would leave the box at `auto`
            // height, which is the whole stage, so the failure mode of getting
            // this wrong is the bug it fixes. `notifyColumnCapPx` below is the
            // arithmetic, held by a test that watches both directions.
            maxHeight: `calc(100% - ${NOTIFY_COLUMN_TOP_CSS_ROOMY} - ${ROOMY_HUD_FLOOR_PX}px - ${NOTIFY_COLUMN_BAND_GUTTER_PX}px)`,
          }}
        >
          {mistakeMode ? (
            // THEO-3: the sandbox's ONE instruction replaces the objective
            // banner — the assignment is the mistake (fixed lead-in + the
            // STORED mistake title, compiled into descriptionBg).
            !ended ? (
              <div className="hud-ghost rounded-2xl border border-danger/60 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-danger">
                  Преживей грешката
                </p>
                <p className="mt-0.5 break-words text-[11px] font-bold leading-tight">
                  {lesson.descriptionBg}
                </p>
                {demoOffered && consequence === null ? (
                  <button
                    type="button"
                    onClick={() => setConsequence({ moment: null })}
                    className="btn-ghost pointer-events-auto mt-1.5 px-3 py-1 text-[11px]"
                  >
                    Не се получава? Виж демонстрацията
                  </button>
                ) : null}
              </div>
            ) : null
          ) : (
            <ObjectiveBanner
              titleBg={snap.objectiveTitle}
              index={Math.min(snap.objectiveIndex, Math.max(1, snap.objectiveTotal))}
              total={snap.objectiveTotal}
              progress={snap.objectiveProgress}
              flash={flash}
            />
          )}
          {advisorOn &&
          !examMode &&
          !mistakeMode &&
          !ended &&
          activeQuiz === null &&
          teachQueue.length === 0 &&
          snap.advisorPrompt !== null &&
          // …and it has something the banner above it is not already saying.
          advisorTextBg !== null &&
          snap.advisorPrompt.textBg !== advisorDismissed ? (
            <AdvisorCard
              // The TRIMMED sentence; `keys` and everything else ride along
              // untouched. Dismissal is still keyed on the ORIGINAL text (see
              // `onDismiss`) — that string is the prompt's identity, and keying
              // it on the trimmed half would make two different objectives that
              // share a cap look like the same already-dismissed card.
              prompt={{ ...snap.advisorPrompt, textBg: advisorTextBg }}
              // A6: the mouse-sized ✕. Scoped to this prompt — see
              // `advisorDismissed`.
              onDismiss={() => setAdvisorDismissed(snap.advisorPrompt?.textBg ?? null)}
            />
          ) : null}
          {/* THE BRIEFING — the authored numbered steps, finally on the glass.
              Roomy only; compact feeds the same list through the queue below,
              one line with the whole thing a tap behind it. */}
          {briefingOpen &&
          briefing.length > 0 &&
          !mistakeMode &&
          !ended &&
          activeQuiz === null &&
          teachQueue.length === 0 ? (
            <BriefingCard steps={briefing} onClose={closeBriefing} />
          ) : null}

          {/* Toasts — the bottom of the same column, so a graded fault arrives
              UNDER the task it interrupted instead of in a second stack that
              nothing coordinates. ROOMY ONLY; compact feeds the same events
              into the queue, one line at a time.

              Doc 86 L14: what used to stand here was four stacked 288 px cards
              that no click could touch — „much much annoying". Now: at most two
              240 px cards (one in „по-тихи известия"), each a button that
              removes itself, plus a „изчисти" control once there is more than
              one. The authored explanation and the law chip ride in every card
              in every mode — that is the whole product (THEO-4), and it is
              praise, never teaching, that quiet mode drops. */}
          {compact ? null : (
            <>
              {/* ── THE LAST-RESORT YIELDER, AND IT SCROLLS RATHER THAN BEING
                  CUT — `notifyColumnCutPx` carries the seven findings and the
                  222 px it measured on the sweep's own stage.

                  `min-h-0` is what lets this box shrink at all; the shrink
                  WEIGHTS are what keep the YIELD ORDER the briefing card argues
                  for. Flexbox distributes a deficit in proportion to (base size
                  × shrink factor), so with the briefing at 20 on ~230 px and
                  this stack at 1 on ~490 px the briefing absorbs 90 % of the
                  first pixel of pressure — nine pixels of briefing for every one
                  of fault — and only once the briefing has frozen at zero does
                  the remainder come here. A graded fault still never yields to a
                  briefing; it simply stops being guillotined once there is
                  nothing else left to give.

                  ══ AND THE WEIGHT MUST NOT BE UNDER 1, WHICH IS WHAT SHIPPED ══

                  This box carried `[flex-shrink:0.05]`, chosen for the ratio
                  above and gated by a test that asserted `w < 1`. The ratio was
                  right and the number was a CAP, because CSS Flexbox § 9.7
                  step 4b has a clause the ratio argument does not:

                    „If the sum of the unfrozen flex items' flex factors is less
                     than one, multiply the initial free space by this sum. If
                     the magnitude of this value is less than the magnitude of
                     the remaining free space, use this as the remaining free
                     space."

                  On the pass where the briefing has already frozen at zero this
                  scroller is the ONLY unfrozen item, so that sum is 0.05, and
                  the box absorbed five per cent of the deficit and then stopped.
                  The rest overflowed the column — which is `overflow-hidden` —
                  and was cut. And because the scroller itself never overflowed,
                  `measureToastFold` read `scrollHeight === clientHeight`,
                  `rowsBelowFold` returned 0, and the «↓ още N» row never
                  mounted: the guillotine came WITH the silence, not despite it.

                  THE FRAME, and the path is the one that RESOLVES — w10 stores
                  frames as `<wave>/frames/<lesson>__<variant>/`, not in the
                  `sweep161` shape the first draft of this comment cited:
                  `.audit-frames/w10-1/frames/sc-ac-highbeam-lead__pc-wrong/04-t018s.png`,
                  cropped x1180–1440 / y370–650 at 3×: the ОПАСНА ГРЕШКА card's
                  last line — «нищо.» — is sliced through its x-height at the
                  column's bottom edge, and under the cut there is world, the
                  round mirror button, and no counter. Nine more rows in this
                  wave say the same sentence about the same column, on both
                  platforms (highbeam-lead, junction-rhr, ac-aquaplane,
                  follow-distance on PC; ov-abort, ov-return-gap, ov-oncoming-gap,
                  roundabout-entry, hz-emergency-stop, ov-night-gap on the phone,
                  where `SimOverlay`'s peek owns the same cut).

                  So the ratio is now written the way it survives § 9.7: this
                  stack at 1 — the floor at which the clause stops biting — and
                  the briefing at 20, which is what holds 230 × 20 ≥ 9 × 490 × 1.
                  `shellClipAffordances.test.ts` gates BOTH halves, and the
                  general form: no `[flex-shrink:<1]` anywhere under the sim
                  trees, because a sub-1 weight is never a priority, it is a cap.

                  AND THE ARBITRARY PROPERTY WAS VERIFIED TO COMPILE, not assumed
                  to: a Tailwind class that the scanner declines to emit would
                  leave a green wiring test over CSS that never shipped, which is
                  this project's signature failure. Compiled with the repo's own
                  tailwindcss v4.3.3 against a fixture holding this exact class
                  and the output carries `.\[flex-shrink\:0\.05\] { flex-shrink:
                  0.05 }`. (The fixture was scratch and is not in the tree.) The
                  form is unchanged — an arbitrary PROPERTY is emitted verbatim,
                  so only the value moved.

                  `pointer-events-none` does not make the scroller unreachable: it
                  suppresses hit-testing on THIS box, while the cards inside are
                  `pointer-events-auto`, and wheel scrolling chains up the
                  containing-block chain regardless. This is the roomy leg only
                  (`compact` hides the whole column), so the input is a mouse
                  wheel. ─────────────────────────────────────────────────────*/}
              <div
                ref={toastScrollRef}
                onScroll={measureToastFold}
                data-hud-toast-scroller=""
                className="pointer-events-none flex min-h-0 flex-col overflow-y-auto [flex-shrink:1] [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin]"
                style={
                  // ── …AND THE CUT LINE IS FADED, NOT GUILLOTINED ──────────
                  // The same mask, the same 10 px and the same predicate the
                  // briefing list carries one card up, for the same reason and
                  // now on the surface that needs it most. Four of this wave's
                  // PC rows do not say „I could not scroll", they say the card
                  // is „truncated mid-sentence … with no ellipsis, no scrollbar
                  // and no expand control" (sc-ac-aquaplane) — a horizontally
                  // guillotined line reads as a rendering fault, a faded one
                  // reads as „there is more". Bound to `toastsBelowFold > 0`
                  // and not left unconditional, so a stack that fits, and a
                  // stack scrolled to its end, carry no chrome at all.
                  toastsBelowFold > 0
                    ? {
                        WebkitMaskImage: BRIEFING_FADE_MASK_CSS,
                        maskImage: BRIEFING_FADE_MASK_CSS,
                      }
                    : undefined
                }
              >
                <HudToasts
                  toasts={toasts}
                  quiet={toastsQuiet}
                  onDismiss={dismiss}
                  onDismissAll={clear}
                />
              </div>
              {/* OUTSIDE the scroller, `shrink-0`, and it exists only while
                  something really is below the fold — the same three properties
                  the briefing's counter has, and for the same reason: a counter
                  that covers the sentence it is counting was filed twice in this
                  sweep. WebKit's overlay bar exists only during a scroll and the
                  harness runs Chromium with `--hide-scrollbars`, so a measured
                  sentence is the only affordance both the student and the
                  instrument can see. */}
              {toastsBelowFold > 0 ? (
                <p
                  aria-live="polite"
                  className="shrink-0 text-right text-[9px] font-black uppercase tracking-wider text-warning"
                >
                  {/* TWO SENTENCES, because the fold answers two different
                      questions and only one of them is a count. When something
                      is entirely under the cut, „още N известия" is the true
                      statement and N is the number of graded faults the student
                      has not seen a pixel of. When NOTHING is entirely under it
                      — one tall card, cut through its own explanation, which is
                      what every PC row in wave w10 photographs — the honest
                      sentence names what continues, in the vocabulary
                      `TeachMomentOverlay` and `MistakeConsequenceOverlay`
                      already use for the same cut. Saying „още 1 известие" there
                      would promise a second notification that does not exist. */}
                  {toastsUnseenBelowFold > 0
                    ? `↓ още ${toastsUnseenBelowFold} ${
                        toastsUnseenBelowFold === 1 ? "известие" : "известия"
                      }`
                    : "↓ обяснението продължава — превърти"}
                </p>
              ) : null}
            </>
          )}
        </div>

        {/* THE MICRO MAJOR BUTTON — compact layouts only; on a roomy screen
            everything it holds is already in the top bar above. */}
        {compact ? (
          <PlayMenu
            titleBg={lesson.titleBg}
            badgeBg={
              examMode
                ? {
                    // A13's live protocol tally used to be its own panel at
                    // top-left, under the menu button. It is three numbers —
                    // it belongs ON the framing chip that is already there,
                    // not in a second box next to it.
                    textBg:
                      snap.examTally !== null && snap.phase === "driving" && !ended
                        ? `Изпит ${snap.examTally.totalPoints}/9${
                            snap.examTally.opasniCount > 0 ? " ⚠" : ""
                          }`
                        : "Изпит",
                  }
                : mistakeMode
                  ? { textBg: "Пясъчник" }
                  : null
            }
            items={menuItems}
            compact={compact}
            onOpenChange={setPlayMenuOpen}
          />
        ) : null}

        {/* Car status dashboard — bottom center, THE visual anchor (founder
            2026-07-17: „табло като на кола"). Replaces the old bottom-left
            SpeedCard + GearIndicatorCard pair; reads the scene's per-frame
            status channel so the ◀ ▶ arrows blink on the real cabin clock.
            Stays up in exam mode — it is the car's own instrument panel,
            not a training aid. */}
        {/* `pointer-events-none` on the WRAPPER, not just on StatusDashboard.
            The bar itself is already inert (StatusDashboard.tsx:222) precisely
            "so the scene stays clickable underneath", but this positioning div
            was not, and on a landscape phone it spans 785 px at the bottom of
            the viewport — straight across the lower 52% of the touch throttle
            and brake (measured 844×390: pedals y 242–370, bar y 304–374). A
            thumb resting where a thumb rests hit the bar and the car did not
            move. It is a readout; nothing inside it is interactive. */}
        {/* COMPACT (2026-07-28 second pass): edge to edge, pinned to the floor,
            40 px. „It is a car instrument binnacle, not a toolbar" — so it has
            no margins to float in and no radius to float with. The bottom
            safe-area inset is padding INSIDE the band, not a gap under it: a
            strip with a black gap beneath it reads as a broken layout, and the
            home indicator would still cross the instruments. */}
        {!ended ? (
          compact ? (
            <div
              // `data-hud` because PORTRAIT moves this dock into the corridor
              // between the two thumb pads (PlayAreaStyles, 2026-08-12): on a
              // phone held upright the two pads are 78 % of the bottom edge, so
              // „bottom-centre" put the speed-limit disc on the steering pad on
              // every portrait profile in the ladder.
              data-hud="dash-dock"
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center"
              style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            >
              <StatusDashboard
                statusRef={dashboardStatusRef}
                limitKmh={snap.limitKmh}
                // O51: the drill's own ceiling, as the student was told it.
                // `readSpeedContract` decides which of the three binds; this
                // mount only says which number the task is asking for. See
                // `taskCapKmhFromPrompt` for why it is not `maxSpeedKmh`.
                taskCapKmh={snap.taskCapKmh}
                rejectFlashKey={gearRejectFlash}
                compact
                // The stall telltale's accessible name was „рестартирай
                // (Z + I)" on every device — see STALL_RESTART_LABEL_BG.
                input={hintInput}
              />
            </div>
          ) : (
            <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 flex w-max max-w-[calc(100%-1rem)] -translate-x-1/2 justify-center">
              <StatusDashboard
                statusRef={dashboardStatusRef}
                limitKmh={snap.limitKmh}
                // O51 — the roomy twin of the compact mount above. Both, or the
                // phone and the desktop grade against different visible numbers.
                taskCapKmh={snap.taskCapKmh}
                rejectFlashKey={gearRejectFlash}
                input={hintInput}
              />
            </div>
          )
        ) : null}

        {/* R3 #15: the two in-world lines finally get names. On L1/L2 scenario
            rungs BOTH ribbons render at once — the BLUE one is the shadow
            car's recorded demonstration (ShadowCar KIND_TINT.shadow #3f8cff)
            and the TEAL one is the live route guidance to the next objective
            (RouteGuidance --accent-2, what the founder read as „зелена"). The
            shadow ribbon ends where the recording ends, so mid-route the
            colors visibly hand over with zero explanation — this small legend
            is the honest fix (unifying the colors would hide WHICH line is
            teachware and which is wayfinding). */}
        {/* ROOMY ONLY: compact says this once, as a line, at the start of the
            rung (the `legend` overlay candidate) instead of parking a panel on
            the left rail for the whole drive. */}
        {/* …AND ITS GATE IS THE GUIDANCE LAYER'S GATE, not the shadow car's —
            see `shadowRibbonShown` above for the two frames that forced it. */}
        {!compact && !ended && guidanceShown ? (
          <div
            // NAMED, 2026-08-10, and the naming is the finding. This legend
            // stands on the same floor and the same 0.75 rem left gutter as the
            // open demonstration deck, and it carried NO `data-hud` — so every
            // overlap probe in this row, all of which iterate `[data-hud]`,
            // reported a clean zero straight through it. Measured the moment a
            // probe stopped keying on the attribute: the deck laid out
            // [20, 304, 416 × 199] over this at [20, 464, 202 × 39], i.e. 7 878
            // px² and a TOTAL occlusion — the legend entirely inside the deck.
            // The handle is what lets PlayAreaStyles give it a lane, and what
            // lets the next probe see it at all.
            data-hud="ribbon-legend"
            className="hud-ghost absolute left-3 flex flex-col gap-0.5 px-2 py-1.5 text-[10px] font-semibold leading-tight text-muted"
            // …and not `bottom-[6.75rem]`: 108 px was the floating pill's band,
            // hard-coded here and in the minimap column. Both now read the
            // shell's published floor, so shrinking the band moves them.
            style={{ bottom: "var(--sim-hud-floor, 6.75rem)" }}
          >
            {/* `data-hud-ink`: the UNPANEL sweep clears fills off everything
                inside a ghost, and these two swatches ARE the information —
                the legend says „the BLUE line is the shadow car", so a
                colourless swatch turns the whole legend into a riddle. */}
            {shadowRibbonShown ? (
              <span>
                <span
                  aria-hidden
                  data-hud-ink=""
                  className="mr-1 inline-block h-1.5 w-3.5 rounded-full align-middle"
                  style={{ background: "#3f8cff" }}
                />
                синя — пътят на колата-сянка
              </span>
            ) : null}
            <span>
              <span
                aria-hidden
                data-hud-ink=""
                className="mr-1 inline-block h-1.5 w-3.5 rounded-full align-middle"
                style={{ background: "var(--accent-2)" }}
              />
              зелена — маршрутът до целта
            </span>
            {/* THE THIRD ROW IS THE FINDING. The arrow and the marker shaft were
                never named anywhere, on either platform — a learner reading the
                junction for traffic had a floating chevron and an eleven-metre
                beam of light in his forward view and no sentence about either.
                They are the SAME teal as the route on purpose, so the swatch is
                the glyph rather than a colour chip. */}
            <span>
              <span
                aria-hidden
                data-hud-ink=""
                className="mr-1 inline-block w-3.5 text-center align-middle text-[10px] leading-none"
                style={{ color: "var(--accent-2)" }}
              >
                ◤
              </span>
              стрелка и стълб светлина — завоят и целта по маршрута
            </span>
          </div>
        ) : null}

        {/* Minimap — bottom right, RAISED above the status-bar strip (the
            centered bar can reach the right edge on laptop widths).
            ON DEMAND since the 2026-07-28 founder review: the disc is hidden by
            default and the small ⛶-style chip under it is the toggle, so the
            control exists on a phone too (key P alone would make this a
            desktop-only feature, and the audience is on phones). The chip is
            the only pointer-events-auto thing in this corner. */}
        {!ended ? (
          <div
            // `data-hud`: the demonstration deck stands on the SAME floor at
            // the SAME right edge, and PlayAreaStyles is where the two are told
            // apart (ROOMY_MINIMAP_LANE_PX). Without a name this column could
            // only be reached by its shape, which is how it ended up under the
            // deck's pill in the first place.
            data-hud="minimap-column"
            className="absolute flex flex-col items-end gap-1.5"
            style={{
              // ═══ DOC 91 §I10 / L3 — „THE MINIMAP IS ON MY THUMB" ═══════════
              //
              // `--sim-hud-floor` IS THE WRONG FLOOR ON A PHONE AND ALWAYS WAS.
              // It is where the INSTRUMENT band ends — `dashHeightPx + 8`, i.e.
              // 48 px on every profile in the ladder — and `TouchControls`
              // says so in its own words at the `TOUCH_CONTROLS_FLOOR` export:
              // „a widget that clears the dash can still land squarely on the
              // steering pad". This column was that widget.
              //
              // MEASURED ON THE DEPLOYED /simulator, 2026-08-12, map turned on
              // the way a student turns it on (micro menu → «Карта»):
              //   iphone16-portrait   column [205,628,168×168]
              //       ∩ drivetrain pad            17 112 px²
              //       ∩ «Поглед в дясното огледало» 1 320 px²
              //   iphone16-landscape  column [605,169,168×168]
              //       ∩ drivetrain pad            20 500 px²
              //       ∩ all three mirror glances   3 950 px²
              // — i.e. with the map on, the throttle thumb rests on the map.
              //
              // `PlayAreaStyles` had already moved the demonstration DECK onto
              // `TOUCH_CONTROLS_FLOOR` for exactly this reason and never
              // touched this column. It does now, from the same constant, so
              // the two cannot drift.
              bottom: compact ? TOUCH_CONTROLS_FLOOR : "var(--sim-hud-floor, 6.75rem)",
              right: "calc(0.75rem + env(safe-area-inset-right, 0px))",
            }}
          >
            {minimapOn ? (
              <Minimap
                polylines={minimapFrame?.polylines ?? []}
                transform={
                  minimapFrame?.transform ?? {
                    centerX: snap.vehicle?.x ?? 0,
                    centerY: snap.vehicle?.y ?? 0,
                    pxPerMeter: 1.1,
                  }
                }
                vehicle={snap.vehicle}
                // …AND THE FLOOR ALONE IS NOT ENOUGH, WHICH IS THE HALF §I10
                // ITSELF FLAGGED („if that leaves no room in landscape").
                // `touchControlsFloorPx()` over the six-profile ladder, stage
                // height (viewport minus the shell's p-2) minus the floor:
                //   iphone16-portrait  836 − 382 = 454   → 168 fits
                //   small-portrait     764 − 348 = 416   → 168 fits
                //   galaxy-portrait    764 − 372 = 392   → 168 fits
                //   iphone16-landscape 377 − 257 = 120   → 168 DOES NOT
                //   small-landscape    344 − 235 = 109   → 168 DOES NOT
                //   galaxy-landscape   344 − 259 =  85   → 168 DOES NOT
                // A phone held sideways has no 168 px hole anywhere: the left
                // corridor §I10 offers as the alternative is 108 px tall and
                // the demonstration deck already stands in it. So the disc
                // takes what the corridor has instead of moving into somebody
                // else's, and 168 px stays the ceiling rather than the size.
                //
                // 1 rem of headroom so it is never flush with the top station,
                // and a 72 px floor so „the student turned the map on and saw
                // nothing" cannot happen on a stage shorter than the band.
                // `sizePx` is untouched: the BACKING STORE stays 168, so a
                // shrunk disc is downsampled, not redrawn coarser.
                displayHeightCss={
                  compact
                    ? `max(72px, min(168px, calc(100% - ${TOUCH_CONTROLS_FLOOR} - 1rem)))`
                    : undefined
                }
              />
            ) : null}
            {/* Compact layouts reach this from „Карта" in the micro menu —
                one floating chip fewer on a screen the founder is measuring in
                percentages. Key P still toggles it everywhere. */}
            {compact ? null : (
              <button
                type="button"
                onClick={toggleMinimap}
                aria-pressed={minimapOn}
                title={minimapOn ? "Скрий картата (P)" : "Покажи картата (P)"}
                // Its size is the number the deck's floor clears (immersive.ts)
                // — stated once, in the place the clearance is derived from,
                // rather than as an `h-10 w-10` the stylesheet has to guess at.
                style={{ width: MINIMAP_TOGGLE_SIZE_PX, height: MINIMAP_TOGGLE_SIZE_PX }}
                className={`hud-ghost pointer-events-auto flex items-center justify-center rounded-full border text-[15px] transition motion-reduce:transition-none ${
                  minimapOn
                    ? "border-accent/60 text-accent"
                    : "border-border text-muted opacity-70 hover:opacity-100"
                }`}
              >
                <span aria-hidden>🗺</span>
                <span className="sr-only">
                  {minimapOn ? "Скрий мини картата" : "Покажи мини картата"}
                </span>
              </button>
            )}
          </div>
        ) : null}

        {/* A13: live protocol tally — the exam's honest scoreboard (official
            taxonomy: total / основни / опасни against the doc-32 limits). */}
        {!compact && examMode && snap.examTally !== null && snap.phase === "driving" && !ended ? (
          <div className="absolute left-3 top-3">
            <div
              aria-label="Протокол — наказателни точки"
              className="hud-ghost rounded-xl border border-border px-3 py-2 text-xs"
            >
              {/* „/ 9 т." named nothing. The tally IS the exam sheet, so the
                  strip says which sheet — the founder read the same unit on the
                  result screen as контролни точки off his licence. */}
              <p className="text-[10px] font-black uppercase tracking-wider text-muted">
                Протокол · Наредба № 38
              </p>
              <p className="mt-0.5 flex items-baseline gap-1 font-black tabular-nums">
                <span
                  className={
                    snap.examTally.totalPoints > 9 ? "text-danger" : "text-foreground"
                  }
                >
                  {snap.examTally.totalPoints}
                </span>
                <span className="font-semibold text-muted">/ {pointsBg("exam", 9)}</span>
              </p>
              <p className="text-[10px] font-semibold tabular-nums text-muted">
                основни {snap.examTally.osnovniPoints} / 6
                {snap.examTally.opasniCount > 0 ? " · опасна!" : ""}
              </p>
            </div>
          </div>
        ) : null}

        {/* Pre-drive progress — READ-ONLY panel (A2): rows tick as the student
            performs the steps on real controls; only info steps confirm here. */}
        {/* ROOMY ONLY: on a phone this panel is a tall list pinned over the
            road for the whole pre-drive. Compact puts the NEXT step on the
            line and the identical checklist inside its detail sheet — the same
            component, rendered on demand instead of permanently. */}
        {!compact && (snap.phase === "preDrive" || preDriveJustDone) && !ended ? (
          // CONTROL-CLEARANCE CAP (founder 2026-07-30: the light switch „falls
          // under the Подготовка преди потегляне panel"). The wrapper is a
          // flex column with a max-height in PERCENT of the play area — the
          // one ancestor with a definite height, which is what makes the
          // percentage resolve at all — so the panel shrinks and its step list
          // scrolls instead of growing down over the cockpit controls. The
          // fraction is DERIVED from where the highest control in this column
          // projects (modules/sim/scene/vitok/cabinLook.ts) and pinned by
          // cabinLook.test.ts; it is not a chosen pixel value.
          // `top-12`, not `top-3`: the scene's own „⌨ Клавиши" legend pill is
          // pinned at left-3 top-3 INSIDE the canvas and was sitting across
          // this panel's title („Подготовка преди потегляне 1/13") — seen in a
          // rendered frame, and the same top-left collision the founder logged
          // about the legend and the tutorial card. The 3 rem drop clears the
          // pill; the height budget below absorbs it so the panel's BOTTOM
          // edge lands in exactly the same place and the clearance proof in
          // cabinLook.test.ts still holds.
          <div
            // `data-hud-keep`: thirteen numbered steps, each with its own
            // explanation and its own control — this is a list to READ while
            // the hands work, not an instrument to glance at, so the UNPANEL
            // register deliberately stops here. It is also the surface another
            // lane is reshaping right now (the mouse-first pre-drive rework);
            // the marker means that work cannot be broken from this side.
            data-hud-keep=""
            className="absolute left-3 top-12 flex flex-col"
            style={{
              maxHeight: `calc(${HUD_LEFT_PANEL_MAX_HEIGHT_FRACTION * 100}% - 3.75rem)`,
            }}
          >
            <PreDriveChecklist
              completedStepIds={snap.preDriveCompleted}
              wrongOrderStepIds={snap.preDriveWrongOrder}
              mode={preDriveMode}
              // §I12. A touch LAPTOP reaches this roomy mount with real
              // on-screen controls mounted beside it, so the vocabulary follows
              // the device rather than the layout — same predicate, one answer.
              pointer={hintInput === "touch" ? "touch" : "mouse"}
              onConfirmStep={(stepId) => {
                // Defense in depth: performable steps NEVER complete by click.
                if (preDriveStepKind(stepId) === "info") handlePreDriveStep(stepId);
              }}
            />
          </div>
        ) : null}

        {/* Micro-quiz — overlay (pauses the drive). Hidden once the session
            ends so the end screen never competes with it. */}
        {/* `data-hud-keep`: THE DRIVE HUD IS A GHOST, A PAUSE IS A PAGE.
            PlayAreaStyles' UNPANEL layer strips fill, blur and shadow off
            everything painted over the road — that is the founder's reference
            and it is right for instruments. It is wrong for a card whose whole
            job is to be read: this one asks a question and then explains the
            answer with its law citation (THEO-4), and „naked text over a
            moving road" is not a reading surface. The marker keeps the panel,
            and carries doc 89 §3's wrap rule with it so a long Bulgarian
            compound can never again be clipped mid-word on a 393 px phone. */}
        {activeQuiz && !ended ? (
          <div data-hud-keep="">
            <MicroQuizOverlay
              quiz={activeQuiz}
              onSubmit={handleQuizSubmit}
              onDone={handleQuizDone}
            />
          </div>
        ) : null}

        {/* A9 teach moment — pause + mini-lesson card. A quiz that fired first
            keeps priority; the teach card shows right after it closes (both
            hold `paused`, so no drive time passes in between). */}
        {/* ROOMY ONLY since 2026-07-29: the compact bottom sheet this card grew
            last review was still a card — a header, a title, two clamped lines,
            a law chip, an expander and a button, ~30 % of a landscape phone,
            and it was the second of the three panels in the founder's frame.
            Compact now routes the SAME TeachMoment through the queue as one
            line with „Защо" behind it. Desktop keeps this card, its pictogram
            and its Space/Enter acknowledgement exactly as they were. */}
        {!compact && teachQueue.length > 0 && !activeQuiz && !ended ? (
          // Same reasoning as the micro-quiz above: an explicit pause is a
          // page, not an instrument. See `data-hud-keep` there.
          <div data-hud-keep="">
            <TeachMomentOverlay
              moment={teachQueue[0]}
              remaining={teachQueue.length - 1}
              onAcknowledge={handleTeachAcknowledged}
              compact={false}
            />
          </div>
        ) : null}

        {/* THEO-3 consequence — pause + the „Какво направи" card: stored
            what-went-wrong copy + lawRef + the recorded red-ghost replay,
            then „Сега опитай правилно" restarts the SAME rung graded (the
            onStartScenario seam — the same remount path as „Следващ
            сценарий"). Sandbox sessions never queue teach moments or
            quizzes, so this pause never competes with them. */}
        {mistakeMode && mistakeDemo !== null && consequence !== null && !ended ? (
          // A pause that exists to be read — see `data-hud-keep` on the
          // micro-quiz above. This is the card doc 89 §3 photographed clipping
          // its own text («...АСНА ГРЕШКА»), so the wrap rule matters here most.
          <div data-hud-keep="">
            <MistakeConsequenceOverlay
              demo={mistakeDemo}
              districtId={mistakeSpec!.map.districtId}
              moment={consequence.moment}
              onRetryCorrect={
                onStartScenario !== undefined && mistakeRef !== null
                  ? () => onStartScenario(mistakeRef.templateId, mistakeRef.level)
                  : null
              }
              onDismiss={() => setConsequence(null)}
            />
          </div>
        ) : null}

        {/* Session end — overlay. A13: exam sessions get the examiner-protocol
            framing ABOVE the official verdict card — „Изпитът се прекратява"
            with the reason when the limits ended it mid-route; the A15
            mistake map + correctives below stay (learning continues after
            the verdict). */}
        {/* COMPACT: this whole screen is behind ONE TAP („Резултат" on the end
            line). Founder 2026-07-29: „the crash debrief covers the entire
            frame including the controls" — it did, the moment the drive ended,
            without being asked. Now the verdict arrives as a line and the
            debrief is an EXPLICIT pause, which is the one thing the budget
            lets be full-bleed. Nothing was removed: the protocol card, the
            calibration gate, the mistake map, the concepts and every CTA are
            all still here, in the same order, one tap in.
            Roomy layouts open it directly, as before. */}
        {/* L15 — ROOMY: the popup is no longer unconditional. `shouldShowDebrief`
            (pure, hud/hudPreferences.ts) folds four facts into one answer:
            ended, compact, „I opened it", „I skipped it", and the persisted
            „Показвай разбора автоматично". Compact behaviour is byte-for-byte
            what it was — tap-to-open only. */}
        {debriefOpen && result ? (
          // `data-hud-keep`: the debrief is the longest reading surface in the
          // product — protocol, verdict, mistake map, correctives, CTAs — and
          // the drive HUD's ghost register would make it unreadable. See the
          // micro-quiz above.
          /* ── THE FOLD LINE STOPPED BEING A PLATE OVER THE SENTENCE ────────
              sweep w10, sc-vu-pass-clearance/pc-right/08-debrief-p3.png.

              THE FRAME, character for character, one line of the instructor's
              debrief with the pill drawn through the middle of it:

                Какво се получи д[↓ РАЗБОРЪТ ПРОДЪЛЖАВА — ПРЕВЪРТИ ЗА
                ОЦЕНКАТА ПО ЗАДАЧИ]дение не влезе в точките.

              The affordance is right and the row it announces (the per-
              objective breakdown — the only honest statement of what WAS and
              was NOT credited) is worth announcing. What was wrong is that it
              was `sticky bottom-0` INSIDE the scroller: a sticky box pins to
              the bottom edge of the scrollport and everything that scrolls past
              that edge passes UNDER it, so an opaque pill blanks whatever line
              happens to be there — four more instances in the same sweep, all
              of them this surface. Under THEO-4 the debrief IS the explanation;
              paying for a scroll hint with the words of the explanation it is
              hinting at is the one price this product may not pay.

              THE ANSWER IS THE ONE `BriefingCard` ALREADY WROTE DOWN, sixty
              lines up in this file: „the affordance … is OUTSIDE the scroll
              area on purpose … This row occupies its own 12 px of the card and
              hides nothing." Same arrangement here: this wrapper is the flex
              column, the scrim is its one shrinkable child (`min-h-0 flex-1`),
              and the line is a `shrink-0` row beneath it. The scrollport is
              SHORTER by the height of the line, which is the only way content
              can stop passing under it — padding on the scroller cannot do it,
              because padding moves where the content ENDS and not where the
              viewport does.

              `bg-background` moves up here with the box that now owns the full
              rectangle: the scrim constant still paints the scroller, and this
              paints the strip the line sits in, so §I20's „opaque, no
              backdrop-filter" holds over the whole overlay and not just the
              part that scrolls. ────────────────────────────────────────── */
          <div data-hud="end-scrim" className="absolute inset-0 z-40 flex flex-col bg-background">
          <div
            // A2: the handle PlayAreaStyles' hit-area rule needs. The skip
            // control and the „не показвай автоматично" pill live inside
            // SessionEndScreen (modules/sim) and measured 28 px and 19 px tall
            // — both under the 44 px minimum row C2 was closed on. The rule
            // that grows them is CSS, so it can be written from this lane
            // against a name this lane owns; naming the element here is the
            // whole of what that costs.
            data-hud="end-screen"
            data-hud-keep=""
            ref={endScrollRef}
            onScroll={measureEndScroll}
            // §I20: opaque scrim, no backdrop-filter — see OVERLAY_SCRIM_CLASS.
            // The scrollbar pair is the desktop half of `scrollRemainingPx`'s
            // defect: `overflow-y-auto` is already in the scrim constant, but
            // Chromium's 15 px classic bar is 2 % of this box and WebKit paints
            // none at rest. Same two declarations the product's other two HUD
            // scrollers carry.
            //
            // `min-h-0 flex-1` REPLACED `absolute inset-0 z-40`, and it is the
            // half of the fold-line fix that this element carries: it is now a
            // flex item, and `min-h-0` is what lets a flex item shrink below
            // its content at all — without it this box refuses to give up the
            // line's height and the line is pushed off the bottom of the
            // overlay, which is the same sentence lost by a different route.
            className={`min-h-0 flex-1 ${OVERLAY_SCRIM_CLASS} [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin]`}
          >
            <div className="flex w-full max-w-2xl flex-col gap-3">
              {/* A2: the compact close control USED to be here, unconditional,
                  and it was the whole of what a phone got — a button with no
                  note beside it and no preference behind it. `SessionEndScreen`
                  now renders the close, the note and the setting as one block
                  on both device classes, so this stays only for the one state
                  that screen does not reach: while the I1 calibration gate
                  holds the result it renders ONLY the gate, and a phone still
                  needs a way back out of it. */}
              {compact && resultHeld ? (
                <button
                  type="button"
                  onClick={() => setEndExpanded(false)}
                  className="btn-ghost h-11 w-full shrink-0 justify-center text-xs"
                >
                  ▾ Скрий разбора
                </button>
              ) : null}
              {/* I1: the protocol card states the verdict in words, so it is
                  part of what the calibration gate holds back — otherwise the
                  student reads „Маршрутът е завършен в допустимите граници"
                  and then „predicts" that they passed. */}
              {examMode && !resultHeld ? (
                <section
                  aria-label="Протокол на изпитващия"
                  className={`card border p-4 ${
                    result.examTermination !== undefined
                      ? "border-danger/60"
                      : result.passed
                        ? "border-success/60"
                        : "border-warning/60"
                  }`}
                >
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted">
                    Пробен практически изпит · протокол
                  </p>
                  {result.examTermination !== undefined ? (
                    <p className="mt-1 text-sm font-bold text-danger">
                      {/* „Прекратява" is the наредба's own verb and belongs to
                          the one case it covers (чл. 48, ал. 3 — ПТП). The
                          other three ends are the VERDICT becoming certain, not
                          the commission stopping the car, and saying otherwise
                          taught a student a rule the act does not contain. */}
                      {result.examTermination.reason === "collision"
                        ? "Изпитът се прекратява: "
                        : "Изпитът приключва тук: "}
                      {EXAM_TERMINATION_TEXT_BG[result.examTermination.reason]}.
                    </p>
                  ) : result.aborted ? (
                    <p className="mt-1 text-sm font-bold text-warning">
                      Изпитът беше прекъснат — опитът не се зачита за издържан.
                    </p>
                  ) : result.passed ? (
                    <p className="mt-1 text-sm font-bold text-success">
                      Маршрутът е завършен в допустимите граници.
                    </p>
                  ) : (
                    <p className="mt-1 text-sm font-bold text-warning">
                      Маршрутът приключи извън изискванията за издържан изпит.
                    </p>
                  )}
                </section>
              ) : null}
              <SessionEndScreen
                lessonTitleBg={lesson.titleBg}
                result={result}
                // S1: scenario rubric stars + breakdown (additive section;
                // official points stay the primary verdict).
                rubric={rubric}
                debriefText={debriefText}
                // I1: while the gate is unresolved the end screen renders ONLY
                // it — the score must not leak into a prediction about itself.
                calibrationGate={calibrationSlot}
                calibrationLocked={resultHeld}
                // I2: the drive is already stored — this is the only place a
                // student would think to look for it.
                myDriveHref={
                  savedSessionId !== null && traceUploaded
                    ? `/review/my-drive/${savedSessionId}`
                    : null
                }
                concepts={saveResult?.ok ? saveResult.concepts : []}
                xpEarned={saveResult?.ok ? saveResult.xpEarned : null}
                onRetry={retry}
                // R3 #5/#23: „Назад към таблото" = the same client-side exit
                // as „← Всички уроци" — back to the catalog (anchored at this
                // template by the owner), never a /dashboard route hop.
                onExit={onExitToSelect}
                nextLessonTitleBg={nextLesson?.titleBg ?? null}
                // FR-06/FR-23: a finished attempt opens the next curriculum
                // lesson whether or not it passed. `nextLesson` is already the
                // progression's answer (progression.ts unlocks on ATTEMPTED),
                // and re-testing `result.passed` here re-imposed the wall the
                // gate had just been opened for — the student read „Следващ
                // урок: заключен" after driving the route to its end.
                onNextLesson={nextLesson ? () => onStartLesson(nextLesson.id) : null}
                // S1: the green-run CTAs — „Следващо ниво" (this maneuver, one
                // rung harder; withheld while star-locked) and „Следващ
                // сценарий" (the next card). At the end of the library, a
                // closing line instead of a dead button. All null on
                // curriculum lessons.
                nextScenarioLevel={scenarioTarget(nextScenario.level)}
                nextScenarioTemplate={scenarioTarget(nextScenario.template)}
                catalogCompleteBg={
                  scenarioGreen &&
                  nextScenario.level === null &&
                  nextScenario.template === null
                    ? "Това беше последният сценарий в библиотеката — премина целия каталог. Браво!"
                    : null
                }
                // A15 mistake map: the last live minimap frame carries the FULL
                // district polylines (LessonScene builds them once) — a static
                // fit-to-route view needs nothing else.
                mapPolylines={minimapFrame?.polylines ?? null}
                // L15/A2: Space skips, the note says so, and the setting in
                // that note stops the popup opening itself from the next lesson
                // on. Withheld only while the calibration gate holds the result
                // — there is nothing to skip yet.
                //
                // `!compact &&` USED TO GUARD ALL THREE, and that single
                // conjunct is the whole of row A2's phone half: the argument
                // was „compact reaches this screen by an explicit tap, so there
                // is nothing to skip". It is wrong twice. The phone had no note
                // saying how to leave, and it had no way at all to stop the
                // end-of-session line demanding an answer — which is the thing
                // that pops up by itself on a phone. Both now render, and
                // `compact` tells the screen to say it in touch words and to
                // give the close control the full width of the phone.
                compact={compact}
                onSkip={!resultHeld ? skipDebrief : null}
                autoOpen={endAutoOpen}
                onAutoOpenChange={!resultHeld ? setEndAutoOpenPersisted : null}
              />
            </div>
          </div>
          {/* ══ END OF THE SCROLL BOX — EVERYTHING BELOW THIS LINE IS OUTSIDE
                 IT. The landmark `shellClipAffordances.test.ts` measures the
                 fold line's position against: a line that goes back inside the
                 scroller lands ABOVE this comment, and the case goes red. ══ */}
          {/* ── «ПРОДЪЛЖАВА ПО-ДОЛУ» ─────────────────────────
              The sentence `scrollRemainingPx` measures. It disappears the
              moment there is nothing left — an affordance that is always on is
              chrome, and this same sweep filed the phone's «↓ ОЩЕ N РЕДА»
              badge twice for sitting on the sentence it was counting.

              It says WHAT is below, not just that something is: on both
              filed frames the hidden part is the per-objective breakdown —
              the only place the student can see which skills were credited
              and which were not — so naming it is the difference between a
              scroll hint and a reason to scroll.

              IT SAT ON THE SENTENCE TOO, WHICH IS WHY IT MOVED. It was
              `sticky bottom-0` inside the scroller and was photographed
              blanking «…получи д[pill]дение не влезе в точките» — see the
              measurement on the wrapper above. It is now its own row of the
              overlay's column, `shrink-0`, below the box that scrolls, so
              there is no longer any content it CAN cover.

              `pointer-events-none` is kept although the row no longer floats
              over a CTA: the pill is narrower than its row, and a transparent
              strip beside it that swallows taps aimed at the scrim is a
              control that does nothing and says nothing about why. */}
          {endHasMore ? (
            <p
              data-hud="end-fold"
              aria-live="polite"
              className="pointer-events-none flex shrink-0 justify-center px-4 pb-2 text-[10px] font-black uppercase tracking-wider text-muted"
            >
              <span className="rounded-full border border-border bg-background px-3 py-1">
                ↓ Разборът продължава — превърти за оценката по задачи
              </span>
            </p>
          ) : null}
          </div>
        ) : null}

        {/* L15 — WHAT REPLACES THE POPUP.
            A roomy student who pressed Space, or who turned the popup off for
            good, still has to be able to (a) see that the session ended and how
            it went, (b) reach the law-cited explanation, and (c) act.
            THEO-4 is why (b) is not optional: „Неиздържан" on its own is a bare
            verdict, which requirement zero forbids anywhere, ever — so „Виж
            разбора" is the accented button on this bar, and it is the same
            screen, unchanged, one click away.

            Bottom-centred, above the instrument band, so it never covers the
            dashboard the founder asked to be the anchor. */}
        {endBarVisible && result ? (
          <div
            data-hud="end-bar"
            className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-4"
            style={{ bottom: "calc(var(--sim-dash-h, 0px) + 0.75rem)" }}
          >
            <div
              className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-2xl border bg-background/90 px-4 py-2.5 backdrop-blur"
              style={{
                borderColor: `color-mix(in srgb, ${
                  result.aborted
                    ? "var(--warning)"
                    : result.passed
                      ? "var(--success)"
                      : "var(--warning)"
                } 55%, transparent)`,
              }}
              role="status"
            >
              <span
                className="text-sm font-black"
                style={{
                  color: result.passed && !result.aborted ? "var(--success)" : "var(--warning)",
                }}
              >
                {result.aborted
                  ? "Прекратена сесия"
                  : result.passed
                    ? "Издържан"
                    : "Неиздържан"}
              </span>
              <span className="text-xs font-bold tabular-nums text-muted">
                {result.score} нак. точки
              </span>
              <button type="button" className="btn-accent px-4 py-1.5 text-xs" onClick={openDebrief}>
                Виж разбора
              </button>
              <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={retry}>
                Повтори
              </button>
              <button
                type="button"
                className="btn-ghost px-3 py-1.5 text-xs"
                onClick={onExitToSelect}
              >
                Всички уроци
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Footer: save state + ODbL attribution (required — district meta).
          Hidden while fullscreen (immersive chrome-free layout, QW1) UNLESS a
          save failed — that warning must never be suppressed. Attribution
          remains visible in every letterboxed state around the session.

          ══ …AND THE ONE STATE THAT SUPPRESSION EXCEPTION CREATES WAS NEVER
             LAID OUT — sweep 161, sc-vp-telltale-red/mobile-right/08-debrief ══

          THE FRAME: «Сесията не се записа (SAVE_FAILED) — оценката и разборът
          са верни…» painted as bare 12 px type on the last row of pixels of a
          2556 × 1179 iPhone landscape screen, running edge to edge with the
          attribution «© OpenStreetMap contributors» crushed against its right
          end on the SAME line. The sweep's word for it is the right one: „the
          most important message on the screen looks like a rendering
          artefact".

          IT IS NOT A STYLING TASTE, IT IS THE EXCEPTION'S OWN GEOMETRY. In
          immersive+compact the shell root is `fixed … overflow-hidden` with NO
          padding at all — deliberately, because „eight pixels of page gutter on
          each side of a driving simulator is eight pixels of road" — and this
          row is its last flex child. Every other consumer of that root either
          lives inside the stage or draws its own plate; this row was written
          for the letterboxed desktop layout, where the dashboard's own padding
          was doing the work, and then made to appear in a layout that has none.
          So it inherits zero gutter, zero safe area (`viewport-fit=cover`
          ships, so on a landscape iPhone the bottom inset is real), and shares
          its line with the attribution because `flex-wrap` had no reason to
          break.

          Three things, each answering one clause of the finding: the row takes
          real insets while immersive; the warning takes `basis-full` so the
          attribution can never sit on its line again; and it gets a bordered
          plate, because a sentence that says the student's drive was not saved
          may not be the only thing on this screen with no box around it. */}
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted ${
          immersive && !(ended && saveResult && !saveResult.ok) ? "hidden" : ""
        }`}
        style={
          immersive
            ? {
                paddingLeft: "calc(0.75rem + env(safe-area-inset-left, 0px))",
                paddingRight: "calc(0.75rem + env(safe-area-inset-right, 0px))",
                paddingBottom: "calc(0.375rem + env(safe-area-inset-bottom, 0px))",
              }
            : undefined
        }
      >
        {ended && saveResult && !saveResult.ok ? (
          <span
            role="status"
            className="basis-full rounded-xl border border-warning/60 bg-background/95 px-3 py-2 font-semibold text-warning"
          >
            {saveResult.code === "NOT_SIGNED_IN"
              ? // B39: this used to be a redirect, so the student never read a
                // sentence — the drive screen simply became /login and the
                // debrief was gone. Now it stays, and it says which half failed:
                // the DRIVING and the grading are done and correct, only the
                // saving is not.
                "Не си вписан, затова карането не влезе в профила ти — разборът на този екран е пълен и верен, но няма да го намериш в историята. Впиши се и покарай пак, за да се брои."
              : saveResult.code === "RATE_LIMITED"
                ? // Doc 91 S4. This one is TEMPORARY and it is the student's own
                  // pace that caused it, so it must not read as a fault: nothing
                  // is broken, nothing is lost that a wait does not recover, and
                  // the number is named so „изчакай малко" is not a guess. The
                  // generic sentence below said „не се записа", which is a false
                  // statement about their data and would send them straight back
                  // out to drive it again — the one action that keeps the budget
                  // spent.
                  "Записа твърде много карания за кратко време (над 20 за десет минути), затова това не влезе в историята ти. Нищо не е повредено: оценката и разборът на този екран са верни, а след няколко минути същият урок се записва нормално."
                : `Сесията не се записа (${saveResult.code}) — оценката и разборът са верни, но остават само на този екран.`}
          </span>
        ) : null}
        {/* The CC-BY roadster is gone — all vehicles are now self-authored
            (ADR-001). OSM attribution stays: the district IS OSM-derived. */}
        <span className="ml-auto">© OpenStreetMap contributors</span>
      </div>
    </div>
  );
}
