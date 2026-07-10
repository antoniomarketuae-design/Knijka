"use client";

/**
 * Pre-drive checklist panel — the 13-step procedure (sim/procedures) as a
 * checkable list. The student may click steps in ANY order: wrong order is a
 * learning moment the machine scores, not something the UI prevents. The
 * canonical next step is highlighted with its instruction.
 *
 * HONESTY CONTRACT (QW5, doc 68 Phase 0): clicking a step is the ONLY way to
 * complete it today — there are NO keyboard bindings for checklist steps, so
 * this panel shows no key hints (the old 1…9/0/F/S/Space badges promised keys
 * that did nothing and collided with live driving keys). Steps with a real
 * cabin state (belt / lights / indicator) actually SET it on completion via
 * the shell (procedures/cabinEffects.ts). Phase 1 A2 replaces this list with
 * performed cockpit controls and turns it read-only.
 */

import {
  PRE_DRIVE_STEP_ORDER,
  PRE_DRIVE_STEPS,
  type PreDriveStepId,
} from "../procedures";

export function PreDriveChecklist({
  completedStepIds,
  wrongOrderStepIds,
  onStep,
}: {
  completedStepIds: ReadonlyArray<PreDriveStepId>;
  wrongOrderStepIds: ReadonlyArray<PreDriveStepId>;
  onStep: (stepId: PreDriveStepId) => void;
}) {
  const done = new Set(completedStepIds);
  const wrong = new Set(wrongOrderStepIds);
  const nextId = PRE_DRIVE_STEP_ORDER.find((id) => !done.has(id)) ?? null;

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
      <p className="mb-1 text-[11px] leading-snug text-muted">
        Натисни стъпка, за да я отбележиш като изпълнена.
      </p>

      <ol className="flex flex-col gap-0.5">
        {PRE_DRIVE_STEP_ORDER.map((id, i) => {
          const spec = PRE_DRIVE_STEPS[id];
          const isDone = done.has(id);
          const isWrong = wrong.has(id);
          const isNext = id === nextId;
          return (
            <li key={id}>
              <button
                type="button"
                disabled={isDone}
                onClick={() => onStep(id)}
                aria-label={`Стъпка ${i + 1}: ${spec.titleBg}`}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition motion-reduce:transition-none ${
                  isNext ? "bg-accent/10" : "hover:bg-surface-2"
                } ${isDone ? "cursor-default" : ""}`}
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
                          borderColor: isNext ? "var(--accent)" : "var(--border-strong)",
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
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {nextId ? (
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
