"use client";

/**
 * Pre-drive checklist panel — the 13-step procedure (sim/procedures) as a
 * checkable list. The student may click steps in ANY order: wrong order is a
 * learning moment the machine scores, not something the UI prevents. The
 * canonical next step is highlighted with its instruction and key hint.
 *
 * Key hints are DISPLAY ONLY — the input layer (SceneSlot integrator) owns
 * actual key bindings and calls `onStep` exactly like a click does.
 */

import {
  PRE_DRIVE_STEP_ORDER,
  PRE_DRIVE_STEPS,
  type PreDriveStepId,
} from "../procedures";

/** Default display hints, aligned with PRE_DRIVE_STEP_ORDER (1…9, 0, F, S, Space). */
export const DEFAULT_PRE_DRIVE_KEY_HINTS: Readonly<Record<PreDriveStepId, string>> = {
  "adjust-seat": "1",
  "adjust-mirrors": "2",
  "check-surroundings": "3",
  "fasten-seatbelt": "4",
  "check-dashboard": "5",
  "headlights-on": "6",
  "start-engine": "7",
  "press-brake": "8",
  "select-gear": "9",
  "release-handbrake": "0",
  "final-mirror-check": "F",
  signal: "S",
  "move-off": "Интервал",
};

export function PreDriveChecklist({
  completedStepIds,
  wrongOrderStepIds,
  onStep,
  keyHints = DEFAULT_PRE_DRIVE_KEY_HINTS,
}: {
  completedStepIds: ReadonlyArray<PreDriveStepId>;
  wrongOrderStepIds: ReadonlyArray<PreDriveStepId>;
  onStep: (stepId: PreDriveStepId) => void;
  keyHints?: Partial<Record<PreDriveStepId, string>>;
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
                {keyHints[id] ? (
                  <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted">
                    {keyHints[id]}
                  </kbd>
                ) : null}
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
