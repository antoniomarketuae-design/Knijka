"use client";

/**
 * Pre-drive checklist panel — progress over the 13-step procedure (A2, doc 68)
 * and, since the 2026-07-30 founder review, the MOUSE-FIRST face of it.
 *
 * FIRST PASS (ledger 86 D9) made every row lead with the DASHBOARD CLICK, put
 * a „?" tutorial on every row and demoted the key caps behind „за напреднали".
 * That was right and is untouched below.
 *
 * SECOND PASS — THIS ONE — is the founder's re-measure of that work, and it is
 * blunt: „first and upmost it must be with the mouse". Clicking every clickable
 * control in the cabin moved the checklist 0/13 → 1/13 AND STOPPED. Three
 * causes, all fixed here or by this file's collaborators:
 *
 *  1. THREE CONTROLS HAD NO TARGET ON SCREEN. The seat-belt buckle projects
 *     0.66 m below the eye (frame-y −8.8) and the right door mirror a third of
 *     a screen off the right edge. The pending-step card now offers the head
 *     turn that brings them into the picture — „Погледни надолу към колана" /
 *     „Погледни към дясното огледало" — and in instruction mode performs it by
 *     itself, because a student should not have to discover a button to be
 *     shown where a control is. Geometry and proof: scene/vitok/cabinLook.ts.
 *  2. THIS PANEL COVERED THE LIGHT SWITCH IT WAS NAMING. Thirteen permanent
 *     rows ran down the left column, straight over hotspot_headlights. So the
 *     list is now COLLAPSED by default behind „Всички стъпки", the panel is
 *     capped at HUD_LEFT_PANEL_MAX_HEIGHT_FRACTION of the canvas — a height
 *     derived from where the highest control in this column actually is — and
 *     the open list scrolls inside that cap instead of growing past it. The
 *     list re-opens by itself at 13/13, when there is no control left to hide.
 *  3. THE PEDAL STEPS SAID THEY WERE UNCLICKABLE. Steps 8 and 13 now name the
 *     on-screen pedal pads (components/sim/lesson-ui/MousePedals.tsx).
 *
 * Unchanged and load-bearing: performable steps still complete ONLY via the
 * real control (keyboard, cockpit hotspot or pedal pad — all three drive the
 * same vehicle transitions, and performedSteps.ts cannot tell them apart). The
 * tutorial card is teaching, not a completion path; the only click-to-complete
 * rows are the walkaround INFO steps that have no underlying system yet
 * (doc 68 3.1). Mode presentation (Instruction→Practice→Assess, doc 68 §5) is
 * preserved: instruction guides and auto-opens, practice is a bare recall list,
 * assess adds exam framing and never auto-opens.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PRE_DRIVE_STEP_CONTROLS,
  PRE_DRIVE_STEP_ORDER,
  PRE_DRIVE_STEPS,
  hotspotsForStep,
  preDriveMouseActionBg,
  preDrivePrimaryInput,
  preDriveStepKind,
  type CockpitHotspotName,
  type PreDriveMode,
  type PreDriveStepId,
} from "../procedures";
import {
  CABIN_LOOK_POSES,
  cabinLookForHotspot,
  hotspotIsReachable,
  type CabinLookPoseId,
} from "../scene/vitok/cabinLook";
import { setCabinLook, useCabinLook } from "../scene/vitok/cabinLookStore";
import { PreDriveTutorial, readTutorialAutoOpen } from "./PreDriveTutorial";

const MODE_SUBTITLE: Record<PreDriveMode, string> = {
  instruction:
    "Всяка стъпка се прави с МИШКАТА — върху контролите в кабината или върху педалите долу вдясно. Списъкът се отмята сам.",
  practice: "Изпълни подготовката по памет. Подсказка ще се появи само ако спреш задълго.",
  assess: "Изпитен режим: изпълни стъпките в правилния ред — редът се оценява.",
};

/** Short mouse label for a row (the pending card shows the full sentence). */
function rowActionBg(stepId: PreDriveStepId): string | null {
  switch (preDrivePrimaryInput(stepId)) {
    case "click":
      return "щракни в кабината";
    case "pedal":
      return "задръж педала";
    case "confirm":
      return null;
  }
}

/**
 * Canvas aspect the reach table is evaluated at — measured off the SCENE
 * CANVAS itself, because that is the rectangle the cockpit camera projects
 * into. A 21:9 monitor and a 16:10 laptop get different answers, and they need
 * to: the cockpit holds its horizontal FOV across window shapes, so a wide
 * window really does push the lower console off the bottom edge (see the
 * `console` pose in cabinLook.ts). Falls back to null until the canvas exists.
 */
function useSceneAspect(): number | null {
  const [aspect, setAspect] = useState<number | null>(null);
  useEffect(() => {
    const measure = () => {
      const rect = document.querySelector("canvas")?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      setAspect((prev) => {
        const next = rect.width / rect.height;
        return prev !== null && Math.abs(prev - next) < 0.01 ? prev : next;
      });
    };
    measure();
    // The canvas mounts through a dynamic import, so the first measure can
    // land before it exists — retry on a short low-Hz beat until it does, then
    // follow the window.
    const id = window.setInterval(measure, 500);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, []);
  return aspect;
}

/**
 * The head turns this step needs, in order: for every control the step is
 * performed on, the pose that puts it on screen — deduplicated, and only where
 * the control is NOT already reachable from where the student is looking now.
 */
function looksNeededFor(
  stepId: PreDriveStepId,
  currentPose: CabinLookPoseId,
  aspect: number,
): CabinLookPoseId[] {
  const out: CabinLookPoseId[] = [];
  for (const name of hotspotsForStep(stepId)) {
    if (hotspotIsReachable(name, currentPose, aspect)) continue;
    const pose = cabinLookForHotspot(name);
    // „forward" is never listed here: the way back to the driving pose is its
    // own permanent „↩ Погледни напред" control below, and during the mirrors
    // step (where the LEFT mirror is behind you while you look right) listing
    // it produced two buttons that said the same thing.
    if (pose === "forward" || pose === currentPose || out.includes(pose)) continue;
    out.push(pose);
  }
  return out;
}

/** True when NOTHING this step is performed on is on screen right now — the
 *  case that justifies turning the student's head for him. */
function stepIsUnreachable(
  stepId: PreDriveStepId,
  pose: CabinLookPoseId,
  aspect: number,
): boolean {
  const names: readonly CockpitHotspotName[] = hotspotsForStep(stepId);
  if (names.length === 0) return false; // pedal / info steps: nothing to look at
  return names.every((n) => !hotspotIsReachable(n, pose, aspect));
}

export function PreDriveChecklist({
  completedStepIds,
  wrongOrderStepIds,
  mode,
  onConfirmStep,
}: {
  completedStepIds: ReadonlyArray<PreDriveStepId>;
  wrongOrderStepIds: ReadonlyArray<PreDriveStepId>;
  /** Presentation mode; the machine applies the matching scoring rules. */
  mode: PreDriveMode;
  /** Confirm an INFO step (the only click path left — performable steps
   *  complete via their real control). */
  onConfirmStep: (stepId: PreDriveStepId) => void;
}) {
  const done = new Set(completedStepIds);
  const wrong = new Set(wrongOrderStepIds);
  const nextId = PRE_DRIVE_STEP_ORDER.find((id) => !done.has(id)) ?? null;
  const showGuidance = mode === "instruction";
  const complete = nextId === null;

  // Tutorial card: which step is open, and which ones have already been shown
  // automatically this session (so a card never re-opens behind the student).
  const [openStepId, setOpenStepId] = useState<PreDriveStepId | null>(null);
  const autoShownRef = useRef<Set<PreDriveStepId>>(new Set());
  const [showKeys, setShowKeys] = useState(false);
  // The step list follows COMPLETION by default — collapsed while the student
  // is working (so it cannot stand on the control the panel is naming), open
  // at 13/13 when there is nothing left to hide and the finished procedure is
  // the thing worth reading. `null` = follow that default; an explicit toggle
  // wins from then on. Derived rather than an effect: a setState-in-effect
  // here would be a cascading render for something a render can just compute.
  const [listOpenChoice, setListOpenChoice] = useState<boolean | null>(null);
  const measuredAspect = useSceneAspect();
  const aspect = measuredAspect ?? 16 / 9;
  const pose = useCabinLook();

  useEffect(() => {
    if (!showGuidance || nextId === null) return;
    if (autoShownRef.current.has(nextId)) return;
    autoShownRef.current.add(nextId);
    if (!readTutorialAutoOpen()) return;
    setOpenStepId(nextId);
  }, [showGuidance, nextId]);

  // AUTOMATIC HEAD TURN (instruction mode only). When the step that is now
  // pending is performed on a control that is nowhere on screen, look at it —
  // the thing a real instructor does with the words „погледни надолу". When the
  // pending step's control IS in the windscreen frame, look forward again, so
  // a pose never outlives the step that needed it. Manual clicks below still
  // win afterwards: this runs on a step change, not continuously.
  useEffect(() => {
    if (!showGuidance) return;
    if (nextId === null) {
      setCabinLook("forward");
      return;
    }
    if (!stepIsUnreachable(nextId, "forward", aspect)) {
      setCabinLook("forward");
      return;
    }
    const first = hotspotsForStep(nextId)[0];
    if (first !== undefined) setCabinLook(cabinLookForHotspot(first));
  }, [showGuidance, nextId, aspect]);

  const listOpen = listOpenChoice ?? complete;

  const closeTutorial = useCallback(() => setOpenStepId(null), []);
  const confirmFromTutorial = useCallback(() => {
    if (openStepId !== null) onConfirmStep(openStepId);
    setOpenStepId(null);
  }, [openStepId, onConfirmStep]);

  const looks = useMemo(
    () => (nextId === null ? [] : looksNeededFor(nextId, pose, aspect)),
    [nextId, pose, aspect],
  );

  return (
    // CONTROL-CLEARANCE CAP: the height limit that keeps this panel off the
    // controls it names lives on the MOUNT (LessonPlayShell's wrapper), not
    // here — a percentage max-height needs a containing block with a definite
    // height, and only the play area has one. This section is a shrinkable
    // flex child of that wrapper, so the cap reaches it and the list below
    // scrolls inside it. The compact bottom-sheet mount has no cap and needs
    // none: nothing is behind a sheet.
    <section
      aria-label="Подготовка преди потегляне"
      data-hud="predrive-checklist"
      className="flex min-h-0 w-80 flex-col gap-1 overflow-hidden rounded-2xl border border-border bg-surface/85 p-3 backdrop-blur-md"
    >
      <header className="flex shrink-0 items-baseline justify-between">
        <h2 className="text-sm font-extrabold">Подготовка преди потегляне</h2>
        <span
          className="text-xs font-bold tabular-nums"
          style={{ color: complete ? "var(--success)" : "var(--muted)" }}
        >
          {done.size}/{PRE_DRIVE_STEP_ORDER.length}
        </span>
      </header>

      {/* Progress at a glance — thirteen dots instead of thirteen rows. This is
          what makes the collapsed panel honest: the student can still see how
          much is left, and which steps went in out of order. */}
      <ol
        aria-hidden
        className="flex shrink-0 flex-wrap items-center gap-1 pb-0.5"
      >
        {PRE_DRIVE_STEP_ORDER.map((id) => {
          const isDone = done.has(id);
          const isWrong = wrong.has(id);
          return (
            <li
              key={id}
              className="h-1.5 flex-1 rounded-full"
              style={{
                background: isDone
                  ? isWrong
                    ? "var(--warning)"
                    : "var(--success)"
                  : id === nextId && showGuidance
                    ? "var(--accent)"
                    : "var(--border-strong)",
                opacity: isDone || id === nextId ? 1 : 0.5,
              }}
            />
          );
        })}
      </ol>

      <p className="shrink-0 text-[11px] leading-snug text-muted">{MODE_SUBTITLE[mode]}</p>

      {/* THE PENDING STEP — the whole panel in one card, so the thirteen rows
          no longer have to be on screen for the student to know what to do. */}
      {nextId !== null ? (
        <div className="flex shrink-0 flex-col gap-1.5 rounded-xl bg-surface-2 p-2.5 text-xs leading-relaxed text-muted">
          <p>
            <span className="mr-1 font-black tabular-nums text-accent">
              {PRE_DRIVE_STEP_ORDER.indexOf(nextId) + 1}.
            </span>
            <strong className="font-bold text-foreground">
              {PRE_DRIVE_STEPS[nextId].titleBg}
            </strong>
            {preDriveStepKind(nextId) === "info" ? (
              <span className="ml-1.5 rounded border border-dashed border-border-strong px-1 py-px align-middle text-[9px] font-bold uppercase tracking-wide text-muted">
                инфо
              </span>
            ) : null}
          </p>
          {/* WHAT to do and HOW to do it are INSTRUCTION-MODE ONLY. Practice
              is „по памет" and assess is the exam: naming the control there
              would hand the student the answer to the thing being measured.
              Both modes keep the step title, the look controls and the „?"
              tutorial, which are camera and reference, not answers. */}
          {showGuidance ? (
            <>
              <p>{PRE_DRIVE_STEPS[nextId].instructionBg}</p>
              {/* The mouse sentence — never empty, for any of the thirteen. */}
              <p className="font-bold text-accent">
                <span aria-hidden className="mr-1">
                  🖱
                </span>
                {preDriveMouseActionBg(nextId)}
              </p>
            </>
          ) : null}

          {/* Head turns: offered when the control is off the picture, and
              (instruction mode) already performed by the effect above. */}
          {looks.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {looks.map((poseId) => (
                <button
                  key={poseId}
                  type="button"
                  onClick={() => setCabinLook(poseId)}
                  title={CABIN_LOOK_POSES[poseId].hintBg}
                  className="rounded-lg border border-accent-2/60 px-2 py-0.5 text-[11px] font-bold text-accent-2 transition hover:bg-accent-2/10 motion-reduce:transition-none"
                >
                  👁 {CABIN_LOOK_POSES[poseId].labelBg}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setOpenStepId(nextId)}
              className="rounded-lg border border-accent/50 px-2 py-0.5 text-[11px] font-bold text-accent transition hover:bg-accent/10 motion-reduce:transition-none"
            >
              Покажи ми как
            </button>
            {preDriveStepKind(nextId) === "info" ? (
              <button
                type="button"
                onClick={() => onConfirmStep(nextId)}
                className="rounded-lg border border-dashed border-border-strong px-2 py-0.5 text-[11px] font-bold text-muted transition hover:border-accent hover:text-foreground motion-reduce:transition-none"
              >
                Потвърди
              </button>
            ) : null}
            {pose !== "forward" ? (
              <button
                type="button"
                onClick={() => setCabinLook("forward")}
                title={CABIN_LOOK_POSES.forward.hintBg}
                className="rounded-lg border border-border px-2 py-0.5 text-[11px] font-bold text-muted transition hover:text-foreground motion-reduce:transition-none"
              >
                ↩ Погледни напред
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="shrink-0 rounded-xl bg-surface-2 p-2.5 text-xs font-bold leading-relaxed text-success">
          Готово — всичките 13 стъпки са изпълнени. Може да потегляш.
        </p>
      )}

      {/* THE FULL LIST — one click away, and scrolling INSIDE the cap so it can
          never grow down over a cockpit control (header point 2). */}
      <button
        type="button"
        onClick={() => setListOpenChoice(!listOpen)}
        aria-expanded={listOpen}
        className="mt-0.5 shrink-0 self-start text-[10px] font-bold uppercase tracking-wide text-muted transition hover:text-foreground motion-reduce:transition-none"
      >
        Всички стъпки ({done.size}/{PRE_DRIVE_STEP_ORDER.length}) {listOpen ? "▾" : "▸"}
      </button>

      {listOpen ? (
        <ol className="flex min-h-0 flex-col gap-0.5 overflow-y-auto [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin]">
          {PRE_DRIVE_STEP_ORDER.map((id, i) => {
            const spec = PRE_DRIVE_STEPS[id];
            const isDone = done.has(id);
            const isWrong = wrong.has(id);
            const isNext = id === nextId;
            const isInfo = preDriveStepKind(id) === "info";
            const keys = PRE_DRIVE_STEP_CONTROLS[id]?.keys;
            const action = rowActionBg(id);
            return (
              <li
                key={id}
                aria-label={`Стъпка ${i + 1}: ${spec.titleBg}`}
                className={`flex w-full shrink-0 items-center gap-2 rounded-xl px-1.5 py-1 ${
                  isNext && showGuidance ? "bg-accent/10" : ""
                }`}
              >
                <span
                  aria-hidden
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-black"
                  style={
                    isDone
                      ? {
                          background: isWrong ? "var(--warning)" : "var(--success)",
                          borderColor: "transparent",
                          color: "var(--accent-foreground)",
                        }
                      : {
                          borderColor:
                            isNext && showGuidance ? "var(--accent)" : "var(--border-strong)",
                          color: "var(--muted)",
                        }
                  }
                >
                  {isDone ? "✓" : i + 1}
                </span>
                <span
                  className={`flex-1 text-xs font-semibold ${
                    isDone ? "text-muted line-through decoration-border-strong" : "text-foreground"
                  }`}
                >
                  {spec.titleBg}
                  {isInfo && !isDone ? (
                    <span className="ml-1.5 rounded border border-dashed border-border-strong px-1 py-px align-middle text-[9px] font-bold uppercase tracking-wide text-muted">
                      инфо
                    </span>
                  ) : null}
                  {/* Mouse-first: the row states its real gesture, not a key. */}
                  {!isDone && action !== null ? (
                    <span className="ml-1.5 align-middle text-[10px] font-bold text-muted">
                      · {action}
                    </span>
                  ) : null}
                </span>

                {/* „?“ — the tutorial, one mouse click away on EVERY row and in
                    every mode (practice and assess never auto-open it, but a
                    student may always ask why a step exists). */}
                <button
                  type="button"
                  onClick={() => setOpenStepId(id)}
                  aria-label={`Обяснение: ${spec.titleBg}`}
                  title={`Обяснение: ${spec.titleBg}`}
                  className="shrink-0 rounded-full border border-border px-1.5 text-[10px] font-black text-muted transition hover:border-accent hover:text-accent motion-reduce:transition-none"
                >
                  ?
                </button>

                {isInfo && !isDone ? (
                  // Info step: no real control exists yet — confirm by click,
                  // visually distinct from the performed rows.
                  <button
                    type="button"
                    onClick={() => onConfirmStep(id)}
                    className="shrink-0 rounded-lg border border-dashed border-border-strong px-2 py-0.5 text-[10px] font-bold text-muted transition hover:border-accent hover:text-foreground motion-reduce:transition-none"
                  >
                    Потвърди
                  </button>
                ) : null}
                {!isInfo && !isDone && showKeys && keys ? (
                  <kbd className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-bold text-accent">
                    {keys}
                  </kbd>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {/* The keyboard is real and stays reachable — but it is now the advanced
          alternative, not the headline (D9). */}
      <button
        type="button"
        onClick={() => {
          setShowKeys((v) => !v);
          setListOpenChoice(true);
        }}
        aria-expanded={showKeys}
        className="mt-0.5 shrink-0 self-start text-[10px] font-bold uppercase tracking-wide text-muted transition hover:text-foreground motion-reduce:transition-none"
      >
        ⌨ Клавиши за напреднали {showKeys ? "▾" : "▸"}
      </button>

      {openStepId !== null ? (
        <PreDriveTutorial
          stepId={openStepId}
          stepNumber={PRE_DRIVE_STEP_ORDER.indexOf(openStepId) + 1}
          stepTotal={PRE_DRIVE_STEP_ORDER.length}
          isInfoStep={preDriveStepKind(openStepId) === "info"}
          onContinue={confirmFromTutorial}
          onClose={closeTutorial}
        />
      ) : null}
    </section>
  );
}
