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
  createDashboardStatus,
  HudStyles,
  HudToasts,
  Minimap,
  ObjectiveBanner,
  PreDriveChecklist,
  readStoredFlag,
  selectOverlay,
  SessionEndScreen,
  SESSION_END_AUTO_DEFAULT,
  SESSION_END_AUTO_STORAGE_KEY,
  shouldShowDebrief,
  shouldShowEndBar,
  SimOverlay,
  StatusDashboard,
  telltaleWarningsKey,
  TOAST_QUIET_DEFAULT,
  TOAST_QUIET_STORAGE_KEY,
  useHudToastQueue,
  writeStoredFlag,
  type DashboardStatus,
  type MinimapFrame,
  type ObjectiveFlash,
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
  serializeNearMisses,
  serializeRuleEvents,
  type AdvisorPrompt,
  type LessonResult,
  type LessonSessionState,
  type LessonSpec,
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
import { accumulateScore, VIOLATIONS, type SimTick } from "@/modules/sim/rules";
import type { DrivelineRejection, DrivelineSnapshot } from "@/modules/sim/vehicle";
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
import { CalibrationGate, CalibrationPendingCard } from "./CalibrationGate";
import {
  exitFullscreen,
  FULLSCREEN_CHANGE_EVENTS,
  fullscreenElementOf,
  requestFullscreen,
  supportsFullscreen,
} from "./fullscreen";
import {
  COMPACT_DASH_HEIGHT_PX,
  isCompactViewport,
  minimapClearancePx,
  ROOMY_HUD_FLOOR_PX,
  shouldGoImmersive,
} from "./immersive";
import { MicroQuizOverlay } from "./MicroQuizOverlay";
import { MistakeConsequenceOverlay } from "./MistakeConsequenceOverlay";
import {
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
function rejectionHint(
  rejection: DrivelineRejection,
  snap: DrivelineSnapshot,
): { key: string; titleBg: string; explanationBg: string } {
  if (rejection.kind === "startRejected") {
    return rejection.reason === "clutch"
      ? {
          key: "start-clutch",
          titleBg: "Двигателят не запали",
          explanationBg:
            "Натисни и задръж съединителя (Z) — или премести лоста в P или N — и опитай пак с I.",
        }
      : {
          key: "start-selector",
          titleBg: "Двигателят не запали",
          explanationBg: "Постави скоростния лост в P или N (клавиш [), за да запалиш с I.",
        };
  }
  switch (rejection.reason) {
    case "speed":
      return {
        key: "shift-speed",
        titleBg: "Скоростта е твърде висока",
        explanationBg: "Спри напълно, за да включиш R или P.",
      };
    case "clutch":
      return {
        key: "shift-clutch",
        titleBg: "Предавката не влезе",
        explanationBg: "Натисни и задръж съединителя (Z), докато местиш лоста.",
      };
    case "endOfGate":
      if (snap.selector === "D") {
        return {
          key: "gate-d",
          titleBg: "Лостът вече е в D",
          explanationBg:
            "Автоматичната кутия сменя предавките сама — напред няма ръчни степени. С [ връщаш към N.",
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
        explanationBg: "Назад няма повече позиции — с ] тръгваш към R, N и D.",
      };
  }
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
const TASK_ANNOUNCE_MS = 7000;
/** The advisor's next-action prompt — long enough to read and act on. */
const ADVISOR_ANNOUNCE_MS = 6000;
/** „✓ Задача 2 изпълнена" — a beat of praise, not a panel. */
const PRAISE_ANNOUNCE_MS = 2600;
/** An armed cabin fault gets ONE full line with its WHY when it arms; after
 *  that it is the quiet edge chip again (founder: a warning that keeps popping
 *  „only makes the user nervous"). */
const WARNING_ANNOUNCE_MS = 5000;
/** The two-ribbon colour legend: said once at the start of a guided rung. */
const LEGEND_ANNOUNCE_MS = 8000;

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

interface HudSnapshot {
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
  vehicle: { x: number; y: number; headingDeg: number } | null;
  /** A13: live official tally (exam sessions only, null otherwise). */
  examTally: { totalPoints: number; osnovniPoints: number; opasniCount: number } | null;
}

function snapshotOf(
  s: LessonSessionState,
  lastTick: SimTick | null,
  driveline: DrivelineSnapshot | null = null,
): HudSnapshot {
  const active =
    s.currentObjectiveIndex < s.objectives.length
      ? s.objectives[s.currentObjectiveIndex]
      : null;
  const preDrive = s.preDrive;
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
    advisorPrompt: advisorPromptForSession(s),
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
    const read = () =>
      setCompact(
        isCompactViewport(
          window.innerWidth,
          window.innerHeight,
          window.matchMedia?.("(pointer: coarse)").matches === true,
        ),
      );
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
 */
function useVisualViewportHeight(active: boolean): number | null {
  const [px, setPx] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const read = () => {
      const vv = window.visualViewport;
      // Round DOWN: half a pixel of overshoot is a scrollbar or a 1 px sliver
      // of the page showing under the shell.
      setPx(Math.floor(vv?.height ?? window.innerHeight));
    };
    read();
    const vv = window.visualViewport;
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
  return px;
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
function PlayMenu({
  titleBg,
  badgeBg,
  items,
}: {
  titleBg: string;
  /** „Изпит" / „Пясъчник" framing, or null. */
  badgeBg: { textBg: string } | null;
  items: {
    key: string;
    labelBg: string;
    /** Right-hand state word („вкл." / „Често"), or null for a plain action. */
    valueBg?: string | null;
    tone?: "default" | "danger";
    onSelect: () => void;
    /** Keep the sheet open (a toggle the student may flip twice). */
    keepOpen?: boolean;
  }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="pointer-events-none absolute z-20 flex flex-col items-start gap-1.5"
      style={{
        left: "calc(0.5rem + env(safe-area-inset-left, 0px))",
        top: "calc(0.5rem + env(safe-area-inset-top, 0px))",
        maxHeight: "calc(100% - 1rem)",
      }}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Затвори менюто на урока" : "Меню на урока"}
          title={titleBg}
          className={`pointer-events-auto flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border text-lg backdrop-blur transition motion-reduce:transition-none ${
            open
              ? "border-accent bg-accent/25 text-foreground"
              : "border-border bg-background/60 text-muted active:bg-surface"
          }`}
        >
          <span aria-hidden>{open ? "✕" : "☰"}</span>
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
          className="pointer-events-auto flex min-h-0 w-60 max-w-[70vw] flex-col overflow-y-auto rounded-2xl border border-border bg-background/95 p-1.5 backdrop-blur"
        >
          <p className="truncate px-2 py-1 text-[11px] font-bold text-muted">{titleBg}</p>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => {
                item.onSelect();
                if (item.keepOpen !== true) setOpen(false);
              }}
              className={`flex items-center gap-2 rounded-xl px-2.5 py-2.5 text-left text-[13px] font-bold transition active:bg-surface ${
                item.tone === "danger" ? "text-danger" : "text-foreground"
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{item.labelBg}</span>
              {item.valueBg ? (
                <span className="shrink-0 text-[11px] font-bold text-accent">{item.valueBg}</span>
              ) : null}
            </button>
          ))}
          {/* ODbL. The shell's attribution footer is hidden in every immersive
              layout, and compact is now ALWAYS immersive — so on a phone this
              menu is the only place the district's source can be credited. It
              is required (district-v1.json meta), so it goes where the student
              can actually reach it rather than nowhere. */}
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
  nextLesson,
  onExitToSelect,
  onStartLesson,
  onStartScenario,
}: {
  lesson: LessonSpec;
  quality: QualityPreset;
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
}) {
  // Engine state: ref-resident, frame-rate mutations, zero re-renders.
  const [initialSession] = useState(() => createLessonSession(lesson));
  const sessionRef = useRef<LessonSessionState>(initialSession);
  const finalizedRef = useRef(false);
  const lastTickRef = useRef<SimTick | null>(null);
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
  const standalone = useStandaloneDisplay();
  const immersive = shouldGoImmersive({
    isFullscreen,
    fullscreenAvailable,
    compact,
    standalone,
  });
  const viewportH = useVisualViewportHeight(immersive && !isFullscreen);

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
  // Armed cabin faults, sampled at the status bar's own cadence. Only the
  // ARMED SET matters, so the key comparison keeps this from re-rendering the
  // shell every 150 ms (the TelltaleEdgePings precedent).
  const [warnings, setWarnings] = useState<TelltaleWarning[]>([]);
  useEffect(() => {
    if (!compact) return;
    const id = window.setInterval(() => {
      const next = armedTelltaleWarnings(dashboardStatusRef.current ?? createDashboardStatus());
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
      (bank) => {
        if (cancelled) return;
        quizBankRef.current = bank;
        quizTriggerRef.current = createQuizTriggerState(quizFreqRef.current, bank);
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
      const hint = rejectionHint(rejection, snap);
      const t = nowSec();
      const last = rejectionToastAtRef.current[hint.key] ?? Number.NEGATIVE_INFINITY;
      if (t - last < REJECTION_TOAST_COOLDOWN_S) return;
      rejectionToastAtRef.current[hint.key] = t;
      push(
        [{ kind: "lesson", titleBg: hint.titleBg, explanationBg: hint.explanationBg }],
        REJECTION_TOAST_TTL_MS,
      );
    },
    [nowSec, push],
  );

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
      const { state, hudEvents, teachMoments, mistakeMoment } = applyTick(prev, tick);
      sessionRef.current = state;
      lastTickRef.current = tick;

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
    [push, finalize, activeQuiz, teachQueue, mistakeMode],
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
      setSnap(snapshotOf(sessionRef.current, lastTickRef.current, drivelineRef.current));
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
        explanationBg:
          "Работи с истинските контроли: запали двигателя (I), включи предавка с ], освободи ръчната спирачка (Space). Списъкът вляво се отмята сам, докато го правиш — потегляш с газта, когато колата наистина може да тръгне.",
      },
    ]);
  }, [nowSec, push]);

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
      setSnap(snapshotOf(sessionRef.current, lastTickRef.current, drivelineRef.current));
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
      : buildDebrief(lesson, result).text
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

  // The task line, as the student would say it: what to do, and where in the
  // route. `taskPing` is the micro-menu recall.
  const taskLineBg = mistakeMode ? lesson.descriptionBg : snap.objectiveTitle;
  const taskKey =
    compact && !ended && taskLineBg !== null && taskLineBg !== ""
      ? `task:${snap.objectiveIndex}/${snap.objectiveTotal}:${taskLineBg}:${taskPing}`
      : null;
  const taskFresh = useFreshKey(taskKey, TASK_ANNOUNCE_MS);

  const advisorVisible =
    compact && advisorOn && !examMode && !mistakeMode && !ended && snap.advisorPrompt !== null;
  const advisorKey = advisorVisible ? `advisor:${snap.advisorPrompt?.textBg ?? ""}` : null;
  const advisorFresh = useFreshKey(advisorKey, ADVISOR_ANNOUNCE_MS);

  const praiseKey = compact && flash !== null && !ended ? `praise:${flash.key}` : null;
  const praiseFresh = useFreshKey(praiseKey, PRAISE_ANNOUNCE_MS);

  const warningKey =
    compact && !ended && warnings.length > 0 ? `warn:${telltaleWarningsKey(warnings)}` : null;
  const warningFresh = useFreshKey(warningKey, WARNING_ANNOUNCE_MS);

  const legendApplies =
    compact &&
    !ended &&
    (lesson.aids?.shadowCar === true || lesson.aids?.pathRibbon === true) &&
    lesson.objectives.length > 0;
  const legendKey = legendApplies ? `legend:${sceneEpoch}` : null;
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
              chipBg: resultHeld ? null : `${result.score} т.`,
              lineBg: resultHeld
                ? "Сесията завърши — първо се самооцени"
                : result.aborted
                  ? "Прекратена сесия"
                  : result.passed
                    ? "Издържан — виж разбора"
                    : "Неиздържан — виж разбора",
              blocking: true,
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
              detailBg: `${teachQueue[0].explanationBg}\n\nПърва среща — не се брои в резултата. При повторение: −${teachQueue[0].points} т., а повторните грешки тежат още повече (×1.5 / ×2.0).`,
              lawRef: teachQueue[0].lawRef ?? null,
              blocking: true,
              onAck: handleTeachAcknowledged,
            }
          : null,

        // 3. Graded mistakes, coached hints and praise — the toast column,
        //    single file. Newest first (the queue unshifts), so the priority
        //    tie-break inside selectOverlay keeps the most recent one talking.
        ...(!ended
          ? toasts.map((t): SimOverlayItem | null => {
              if (t.event.kind === "violation") {
                return {
                  id: `toast:${t.id}`,
                  kind: "violation",
                  tone: t.event.severity === "vtorostepenna" ? "warn" : "danger",
                  chipBg: `−${t.event.points} т.`,
                  lineBg: t.event.titleBg,
                  detailBg: t.event.explanationBg,
                  lawRef: t.event.lawRef ?? null,
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
            }
          : null,

        // 6. „Съветник" — the next expected action, when it changes.
        advisorFresh && snap.advisorPrompt !== null
          ? {
              id: `advisor:${snap.advisorPrompt.textBg}`,
              kind: "advisor" as const,
              tone: "neutral" as const,
              lineBg:
                snap.advisorPrompt.keys.length > 0
                  ? `${snap.advisorPrompt.textBg} (${snap.advisorPrompt.keys.join(" ")})`
                  : snap.advisorPrompt.textBg,
            }
          : null,

        // 7. The objective, announced and then retired to the micro menu.
        praiseFresh && flash !== null
          ? {
              id: `praise:${flash.key}`,
              kind: "praise" as const,
              tone: "good" as const,
              lineBg: flash.titleBg,
            }
          : taskFresh && taskLineBg !== null
            ? {
                id: taskKey ?? "task",
                kind: "task" as const,
                tone: mistakeMode ? ("danger" as const) : ("neutral" as const),
                chipBg: mistakeMode
                  ? "Преживей грешката"
                  : `Задача ${Math.min(snap.objectiveIndex, Math.max(1, snap.objectiveTotal))}/${snap.objectiveTotal}`,
                lineBg: taskLineBg,
              }
            : null,

        // 8. Which coloured line is which — said once, at the start.
        legendFresh
          ? {
              id: "legend",
              kind: "legend" as const,
              tone: "neutral" as const,
              lineBg: "Синя линия — колата-сянка · зелена — маршрутът до целта",
            }
          : null,
      ];

  const overlay = selectOverlay(overlayCandidates);

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
  const skipDebrief = useCallback(() => {
    setEndExpanded(false);
    setEndSkipped(true);
  }, []);
  const openDebrief = useCallback(() => {
    setEndExpanded(true);
    setEndSkipped(false);
  }, []);

  const menuItems = ended
    ? [{ key: "exit", labelBg: "← Всички уроци", onSelect: onExitToSelect }]
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
        {
          key: "minimap",
          labelBg: "Карта",
          valueBg: minimapOn ? "вкл." : "изкл.",
          onSelect: toggleMinimap,
          keepOpen: true,
        },
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
          ? "flex h-full flex-col gap-2 overflow-hidden bg-background p-2"
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
          ? { height: viewportH !== null ? `${viewportH}px` : "100dvh" }
          : null),
        // Published for the whole subtree (incl. the scene's TouchControls).
        ["--sim-vh" as string]: viewportH !== null ? `${viewportH}px` : "100dvh",
        ["--sim-dash-h" as string]: `${dashHeightPx}px`,
        ["--sim-hud-floor" as string]: `${hudFloorPx}px`,
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
        <div className="h-full w-full">
          <SceneSlot
            key={sceneEpoch}
            lesson={lesson}
            quality={quality}
            paused={
              ended || activeQuiz !== null || teachQueue.length > 0 || consequence !== null
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
            renderDetail={(item) =>
              item.kind === "predrive" ? (
                <PreDriveChecklist
                  completedStepIds={snap.preDriveCompleted}
                  wrongOrderStepIds={snap.preDriveWrongOrder}
                  mode={preDriveMode}
                  onConfirmStep={(stepId) => {
                    if (preDriveStepKind(stepId) === "info") handlePreDriveStep(stepId);
                  }}
                />
              ) : null
            }
          />
        ) : null}

        {/* Objective banner — top center; the advisor prompt stacks under it
            (during pre-drive the banner is empty, so the advisor card stands
            alone). The advisor hides while a pause overlay (quiz/teach) is up
            — it must never compete with a modal card.
            ROOMY ONLY: on a phone this stack is the founder's „ЗАДАЧА" card
            plus the card under it — two of the three panels in his screenshot.
            Compact renders them through the queue above. */}
        {/* `data-hud` because this stack shares the top rail with the chase
            view's rear-view mirror (rows B74/B76). The mirror is a quad inside
            the canvas and can never paint over a DOM card, so the card steps
            below it instead — PlayAreaStyles owns that rule and this attribute
            is the handle it needs. */}
        <div
          data-hud="objective-stack"
          className={`absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center gap-1.5 ${
            compact ? "hidden" : ""
          }`}
        >
          {mistakeMode ? (
            // THEO-3: the sandbox's ONE instruction replaces the objective
            // banner — the assignment is the mistake (fixed lead-in + the
            // STORED mistake title, compiled into descriptionBg).
            !ended ? (
              <div className="max-w-md rounded-2xl border border-danger/60 bg-background/85 px-4 py-2.5 text-center backdrop-blur">
                <p className="text-[10px] font-black uppercase tracking-wider text-danger">
                  Преживей грешката
                </p>
                <p className="mt-0.5 text-xs font-bold leading-snug">{lesson.descriptionBg}</p>
                {demoOffered && consequence === null ? (
                  <button
                    type="button"
                    onClick={() => setConsequence({ moment: null })}
                    className="btn-ghost mt-1.5 px-3 py-1 text-[11px]"
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
          snap.advisorPrompt !== null ? (
            <AdvisorCard prompt={snap.advisorPrompt} />
          ) : null}
        </div>

        {/* Toasts — right side. ROOMY ONLY; compact feeds the same events into
            the queue, one line at a time.

            Doc 86 L14: what used to stand here was four stacked 288 px cards
            that no click could touch — „much much annoying". Now: at most two
            240 px cards (one in „по-тихи известия"), each a button that removes
            itself, plus a „изчисти" control once there is more than one. The
            authored explanation and the law chip ride in every card in every
            mode — that is the whole product (THEO-4), and it is praise, never
            teaching, that quiet mode drops. */}
        {compact ? null : (
          <div className="absolute right-3 top-3">
            <HudToasts
              toasts={toasts}
              quiet={toastsQuiet}
              onDismiss={dismiss}
              onDismissAll={clear}
            />
          </div>
        )}

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
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center"
              style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            >
              <StatusDashboard
                statusRef={dashboardStatusRef}
                limitKmh={snap.limitKmh}
                rejectFlashKey={gearRejectFlash}
                compact
              />
            </div>
          ) : (
            <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 flex w-max max-w-[calc(100%-1rem)] -translate-x-1/2 justify-center">
              <StatusDashboard
                statusRef={dashboardStatusRef}
                limitKmh={snap.limitKmh}
                rejectFlashKey={gearRejectFlash}
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
        {!compact &&
        !ended &&
        (lesson.aids?.shadowCar === true || lesson.aids?.pathRibbon === true) &&
        lesson.objectives.length > 0 ? (
          <div
            className="absolute left-3 flex flex-col gap-0.5 rounded-lg border border-border bg-surface/80 px-2 py-1.5 text-[10px] font-semibold leading-tight text-muted backdrop-blur"
            // …and not `bottom-[6.75rem]`: 108 px was the floating pill's band,
            // hard-coded here and in the minimap column. Both now read the
            // shell's published floor, so shrinking the band moves them.
            style={{ bottom: "var(--sim-hud-floor, 6.75rem)" }}
          >
            <span>
              <span
                aria-hidden
                className="mr-1 inline-block h-1.5 w-3.5 rounded-full align-middle"
                style={{ background: "#3f8cff" }}
              />
              синя — пътят на колата-сянка
            </span>
            <span>
              <span
                aria-hidden
                className="mr-1 inline-block h-1.5 w-3.5 rounded-full align-middle"
                style={{ background: "var(--accent-2)" }}
              />
              зелена — маршрутът до целта
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
            className="absolute flex flex-col items-end gap-1.5"
            style={{
              bottom: "var(--sim-hud-floor, 6.75rem)",
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
                className={`pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border text-[15px] backdrop-blur transition motion-reduce:transition-none ${
                  minimapOn
                    ? "border-accent/60 bg-accent/20 text-accent"
                    : "border-border bg-background/60 text-muted opacity-70 hover:opacity-100"
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
              className="rounded-xl border border-border bg-surface/90 px-3 py-2 text-xs backdrop-blur"
            >
              <p className="text-[10px] font-black uppercase tracking-wider text-muted">
                Протокол
              </p>
              <p className="mt-0.5 flex items-baseline gap-1 font-black tabular-nums">
                <span
                  className={
                    snap.examTally.totalPoints > 9 ? "text-danger" : "text-foreground"
                  }
                >
                  {snap.examTally.totalPoints}
                </span>
                <span className="font-semibold text-muted">/ 9 т.</span>
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
            className="absolute left-3 top-12 flex flex-col"
            style={{
              maxHeight: `calc(${HUD_LEFT_PANEL_MAX_HEIGHT_FRACTION * 100}% - 3.75rem)`,
            }}
          >
            <PreDriveChecklist
              completedStepIds={snap.preDriveCompleted}
              wrongOrderStepIds={snap.preDriveWrongOrder}
              mode={preDriveMode}
              onConfirmStep={(stepId) => {
                // Defense in depth: performable steps NEVER complete by click.
                if (preDriveStepKind(stepId) === "info") handlePreDriveStep(stepId);
              }}
            />
          </div>
        ) : null}

        {/* Micro-quiz — overlay (pauses the drive). Hidden once the session
            ends so the end screen never competes with it. */}
        {activeQuiz && !ended ? (
          <MicroQuizOverlay
            quiz={activeQuiz}
            onSubmit={submitMicroQuizAnswer}
            onDone={handleQuizDone}
          />
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
          <TeachMomentOverlay
            moment={teachQueue[0]}
            remaining={teachQueue.length - 1}
            onAcknowledge={handleTeachAcknowledged}
            compact={false}
          />
        ) : null}

        {/* THEO-3 consequence — pause + the „Какво направи" card: stored
            what-went-wrong copy + lawRef + the recorded red-ghost replay,
            then „Сега опитай правилно" restarts the SAME rung graded (the
            onStartScenario seam — the same remount path as „Следващ
            сценарий"). Sandbox sessions never queue teach moments or
            quizzes, so this pause never competes with them. */}
        {mistakeMode && mistakeDemo !== null && consequence !== null && !ended ? (
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
          <div className="absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-background/85 p-4 backdrop-blur-sm sm:p-6">
            <div className="flex w-full max-w-2xl flex-col gap-3">
              {compact ? (
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
                      Изпитът се прекратява:{" "}
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
                // L15: Space skips, the note says so, and the setting in that
                // note stops the popup opening itself from the next lesson on.
                // Roomy only — compact already reaches this screen by an
                // explicit tap, so there is nothing there to skip (the „▾ Скрий
                // разбора" button above IS its close control) — and never while
                // the calibration gate holds the result.
                onSkip={!compact && !resultHeld ? skipDebrief : null}
                autoOpen={endAutoOpen}
                onAutoOpenChange={
                  !compact && !resultHeld ? setEndAutoOpenPersisted : null
                }
              />
            </div>
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
          remains visible in every letterboxed state around the session. */}
      <div
        className={`flex flex-wrap items-center gap-3 text-xs text-muted ${
          immersive && !(ended && saveResult && !saveResult.ok) ? "hidden" : ""
        }`}
      >
        {ended && saveResult && !saveResult.ok ? (
          <span className="font-semibold text-warning">
            Сесията не се записа ({saveResult.code}) — резултатът е само локален.
          </span>
        ) : null}
        {/* The CC-BY roadster is gone — all vehicles are now self-authored
            (ADR-001). OSM attribution stays: the district IS OSM-derived. */}
        <span className="ml-auto">© OpenStreetMap contributors</span>
      </div>
    </div>
  );
}
