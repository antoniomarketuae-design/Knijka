"use client";

/**
 * Pre-drive checklist panel — READ-ONLY progress over the 13-step procedure
 * (A2, doc 68). Steps tick as the student PERFORMS them on real controls
 * (keyboard or cockpit hotspot — the scene observes the state transitions and
 * drives the machine); there is no click-to-complete for performable steps.
 *
 * The only interactive rows are the walkaround-style INFO steps (seat /
 * surroundings / dashboard — no underlying system yet, doc 68 3.1): they keep
 * a confirm button and are visually marked „инфо стъпка".
 *
 * Mode presentation (Instruction→Practice→Assess, doc 68 §5):
 *  - instruction: the canonical next step is highlighted with its full
 *    instruction text + the real key hint (honesty rule: hints only promise
 *    working controls); its cockpit hotspot pulses in the 3D scene.
 *  - practice: bare list, no hints — recall training; the shell surfaces a
 *    gentle toast hint after ~20 s of idling.
 *  - assess: bare list + exam framing; wrong order is graded by the machine.
 */

import {
  PRE_DRIVE_STEP_CONTROLS,
  PRE_DRIVE_STEP_ORDER,
  PRE_DRIVE_STEPS,
  preDriveStepKind,
  type PreDriveMode,
  type PreDriveStepId,
} from "../procedures";

const MODE_SUBTITLE: Record<PreDriveMode, string> = {
  instruction:
    "Изпълни всяка стъпка с истинските контроли — списъкът се отмята сам, докато работиш.",
  practice: "Изпълни подготовката по памет. Подсказка ще се появи само ако спреш задълго.",
  assess: "Изпитен режим: изпълни стъпките в правилния ред — редът се оценява.",
};

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
          return (
            <li
              key={id}
              aria-label={`Стъпка ${i + 1}: ${spec.titleBg}`}
              className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 ${
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
              </span>
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
              {!isInfo && !isDone && showGuidance && keys ? (
                <kbd className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-bold text-accent">
                  {keys}
                </kbd>
              ) : null}
            </li>
          );
        })}
      </ol>

      {showGuidance && nextId ? (
        <p className="mt-2 rounded-xl bg-surface-2 p-2.5 text-xs leading-relaxed text-muted">
          <strong className="font-bold text-foreground">
            {PRE_DRIVE_STEPS[nextId].titleBg}:
          </strong>{" "}
          {PRE_DRIVE_STEPS[nextId].instructionBg}
        </p>
      ) : null}
    </section>
  );
}
