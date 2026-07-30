"use client";

/**
 * Pre-drive checklist panel — progress over the 13-step procedure (A2, doc 68)
 * and, since the 2026-07-30 founder review (ledger 86 D9), the MOUSE-FIRST
 * face of that procedure.
 *
 * What changed and why. The panel used to render one `<kbd>` per row and
 * nothing else, so the lesson presented itself as thirteen keyboard shortcuts
 * to memorise. The founder's reaction — „my first instinct was to skip the
 * lesson entirely" — is the strongest single reaction in his whole review.
 * The doc-69 cockpit hotspots have been clickable since A2; they were simply
 * never the TAUGHT path. So now:
 *
 *   1. every row leads with the DASHBOARD CLICK that performs it
 *      (PRE_DRIVE_STEP_CONTROLS.clickBg — authored only where a real hotspot
 *      exists), and the pending row says it in full;
 *   2. every row carries a „?" that opens the step's tutorial card — the
 *      illustration + why/how/remember + law citation the founder asked for;
 *   3. in INSTRUCTION mode that card OPENS BY ITSELF for each new pending
 *      step, and the student clicks „Разбрах — продължи" with the mouse
 *      (his exact flow), unless he has ticked „не отваряй сами";
 *   4. the keyboard is demoted to a collapsed „за напреднали" column — real,
 *      one click away, never the headline.
 *
 * Unchanged and load-bearing: performable steps still complete ONLY via the
 * real control (keyboard OR cockpit hotspot — the scene observes the vehicle
 * transitions and drives the machine, performedSteps.ts). The tutorial card is
 * teaching, not a completion path; the only click-to-complete rows are the
 * walkaround INFO steps that have no underlying system yet (doc 68 3.1).
 *
 * Mode presentation (Instruction→Practice→Assess, doc 68 §5) is preserved:
 * instruction guides and auto-opens, practice is a bare recall list (the card
 * still opens on demand), assess adds exam framing and never auto-opens.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PRE_DRIVE_STEP_CONTROLS,
  PRE_DRIVE_STEP_ORDER,
  PRE_DRIVE_STEPS,
  preDrivePrimaryInput,
  preDriveStepKind,
  type PreDriveMode,
  type PreDriveStepId,
} from "../procedures";
import { PreDriveTutorial, readTutorialAutoOpen } from "./PreDriveTutorial";

const MODE_SUBTITLE: Record<PreDriveMode, string> = {
  instruction:
    "Всяка стъпка се прави с МИШКАТА върху контролите в кабината — списъкът се отмята сам. „?“ отваря обяснението.",
  practice: "Изпълни подготовката по памет. Подсказка ще се появи само ако спреш задълго.",
  assess: "Изпитен режим: изпълни стъпките в правилния ред — редът се оценява.",
};

/** Short mouse label for a row (the pending row shows the full sentence). */
function rowActionBg(stepId: PreDriveStepId): string | null {
  switch (preDrivePrimaryInput(stepId)) {
    case "click":
      return "щракни в кабината";
    case "pedal":
      return "с педал";
    case "confirm":
      return null;
  }
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

  // Tutorial card: which step is open, and which ones have already been shown
  // automatically this session (so a card never re-opens behind the student).
  const [openStepId, setOpenStepId] = useState<PreDriveStepId | null>(null);
  const autoShownRef = useRef<Set<PreDriveStepId>>(new Set());
  const [showKeys, setShowKeys] = useState(false);

  useEffect(() => {
    if (!showGuidance || nextId === null) return;
    if (autoShownRef.current.has(nextId)) return;
    autoShownRef.current.add(nextId);
    if (!readTutorialAutoOpen()) return;
    setOpenStepId(nextId);
  }, [showGuidance, nextId]);

  const closeTutorial = useCallback(() => setOpenStepId(null), []);
  const confirmFromTutorial = useCallback(() => {
    if (openStepId !== null) onConfirmStep(openStepId);
    setOpenStepId(null);
  }, [openStepId, onConfirmStep]);

  return (
    <section
      aria-label="Подготовка преди потегляне"
      className="flex w-80 flex-col gap-1 rounded-2xl border border-border bg-surface/85 p-4 backdrop-blur-md"
    >
      <header className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-extrabold">Подготовка преди потегляне</h2>
        <span className="text-xs font-bold tabular-nums text-muted">
          {done.size}/{PRE_DRIVE_STEP_ORDER.length}
        </span>
      </header>
      <p className="mb-1 text-[11px] leading-snug text-muted">{MODE_SUBTITLE[mode]}</p>

      <ol className="flex flex-col gap-0.5">
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
              className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 ${
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

      {showGuidance && nextId ? (
        <div className="mt-2 flex flex-col gap-1.5 rounded-xl bg-surface-2 p-2.5 text-xs leading-relaxed text-muted">
          <p>
            <strong className="font-bold text-foreground">
              {PRE_DRIVE_STEPS[nextId].titleBg}:
            </strong>{" "}
            {PRE_DRIVE_STEPS[nextId].instructionBg}
          </p>
          {PRE_DRIVE_STEP_CONTROLS[nextId]?.clickBg !== undefined ? (
            <p className="font-bold text-accent">
              <span aria-hidden className="mr-1">
                🖱
              </span>
              {PRE_DRIVE_STEP_CONTROLS[nextId]?.clickBg}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setOpenStepId(nextId)}
            className="self-start rounded-lg border border-accent/50 px-2 py-0.5 text-[11px] font-bold text-accent transition hover:bg-accent/10 motion-reduce:transition-none"
          >
            Покажи ми как
          </button>
        </div>
      ) : null}

      {/* The keyboard is real and stays reachable — but it is now the advanced
          alternative, not the headline (D9). */}
      <button
        type="button"
        onClick={() => setShowKeys((v) => !v)}
        aria-expanded={showKeys}
        className="mt-1.5 self-start text-[10px] font-bold uppercase tracking-wide text-muted transition hover:text-foreground motion-reduce:transition-none"
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
