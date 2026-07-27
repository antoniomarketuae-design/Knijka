"use client";

/**
 * Client island for /outcome — the „как мина изпитът?" form plus the list of
 * what this student has already told us.
 *
 * It receives PRE-FORMATTED strings from the server page and imports nothing
 * from @/modules/outcomes: that keeps the module (and its lazy Prisma import)
 * out of the browser bundle entirely, the same way the dashboard components
 * only `import type` from data.ts.
 *
 * Two deliberate interaction choices:
 *  - the submit button stays disabled until the consent box is ticked, so the
 *    tick is a real decision rather than something discovered in an error
 *    message after the fact;
 *  - withdrawal is a plain button on the row. Consent that is harder to take
 *    back than to give is not consent (GDPR Art. 7(3)).
 */

import { useActionState, useState } from "react";
import { IconCheck, IconShield, IconX } from "@/components/icons";
import { CheckControl } from "@/components/ui/CheckControl";
import { reportOutcome, withdrawOutcome } from "./actions";
import {
  CONSENT_FIELD,
  CONSENT_LABEL_BG,
  initialReportOutcomeState,
  initialWithdrawOutcomeState,
} from "./outcome-contract";

/** One already-reported outcome, formatted server-side (no Date crosses over). */
export interface OutcomeView {
  id: string;
  kindLabelBg: string;
  passed: boolean;
  examOnLabelBg: string;
  readinessScore: number;
  mockAttempts: number;
  bestMockScore: number | null;
}

const inputClass =
  "w-full rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent focus:shadow-glow-sm motion-reduce:transition-none";

const radioClass =
  "flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2.5 text-sm font-semibold transition has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:checked]:text-accent motion-reduce:transition-none";

export function OutcomeClient({
  outcomes,
  todayIso,
}: {
  outcomes: OutcomeView[];
  /** max= on the date field: an exam that has not happened cannot be reported. */
  todayIso: string;
}) {
  return (
    <>
      <ReportForm todayIso={todayIso} />
      <ReportedList outcomes={outcomes} />
    </>
  );
}

function ReportForm({ todayIso }: { todayIso: string }) {
  const [state, formAction, pending] = useActionState(
    reportOutcome,
    initialReportOutcomeState,
  );
  const [consented, setConsented] = useState(false);

  return (
    <form action={formAction} className="card flex flex-col gap-5 p-5 sm:p-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="hud-label mb-2">Кой изпит?</legend>
        {/* The pill around each radio already flips to accent when it is
            picked, but that is the SELECTED state; the box is what says
            "there is a control here" before anything is chosen, and on this
            palette the browser's own was drawing it at 1.66 : 1. */}
        <div className="flex gap-2">
          <label className={radioClass}>
            <CheckControl type="radio" name="kind" value="theory" defaultChecked />
            Теория
          </label>
          <label className={radioClass}>
            <CheckControl type="radio" name="kind" value="practical" />
            Кормуване
          </label>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="hud-label mb-2">Как мина?</legend>
        <div className="flex gap-2">
          <label className={radioClass}>
            <CheckControl type="radio" name="outcome" value="passed" />
            Взех го
          </label>
          <label className={radioClass}>
            <CheckControl type="radio" name="outcome" value="failed" />
            Не го взех
          </label>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Кажи ни честно — падналият изпит е по-полезната за нас информация и
          не влияе по никакъв начин на профила ти тук.
        </p>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="outcome-date" className="hud-label">
          Дата на изпита
        </label>
        <input
          id="outcome-date"
          name="examOn"
          type="date"
          max={todayIso}
          required
          className={`${inputClass} sm:max-w-48`}
        />
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-hair bg-surface-2/30 p-3">
        {/* Appearance only — the field name, the unticked default and the
            button that stays disabled until it is ticked are untouched. */}
        <CheckControl
          type="checkbox"
          name={CONSENT_FIELD}
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-sm leading-relaxed text-muted">
          {CONSENT_LABEL_BG}
        </span>
      </label>

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={pending || !consented}
          className="btn-accent self-start text-sm"
        >
          <IconCheck className="h-4 w-4" />
          {pending ? "Записваме…" : "Изпрати резултата"}
        </button>

        {state.status === "error" ? (
          <p role="alert" className="text-sm font-semibold text-danger">
            {state.messageBg}
          </p>
        ) : null}
        {state.status === "saved" || state.status === "updated" ? (
          <p role="status" className="text-sm font-semibold text-success">
            {state.messageBg}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function ReportedList({ outcomes }: { outcomes: OutcomeView[] }) {
  const [state, formAction, pending] = useActionState(
    withdrawOutcome,
    initialWithdrawOutcomeState,
  );

  if (outcomes.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted">
        Още не си ни казвал за истински изпит. Като се явиш — върни се тук.
      </p>
    );
  }

  return (
    <section aria-labelledby="outcome-list-title" className="flex flex-col gap-3">
      <h2 id="outcome-list-title" className="font-display text-base font-extrabold">
        Какво си ни казал
      </h2>

      <ul className="flex flex-col gap-2">
        {outcomes.map((o) => (
          <li key={o.id} className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                o.passed
                  ? "bg-success/15 text-success"
                  : "bg-warning/15 text-warning"
              }`}
            >
              {o.passed ? <IconCheck className="h-3.5 w-3.5" /> : <IconX className="h-3.5 w-3.5" />}
              {o.passed ? "Взет" : "Невзет"}
            </span>

            <div className="flex flex-col">
              <span className="text-sm font-semibold">{o.kindLabelBg}</span>
              <span className="text-xs text-muted">{o.examOnLabelBg}</span>
            </div>

            <span className="text-xs text-muted">
              Нашата прогноза тогава:{" "}
              <span className="font-mono font-bold tabular-nums text-foreground">
                {o.readinessScore}
              </span>
              /100
              {o.bestMockScore !== null ? (
                <>
                  {" · най-добър пробен изпит "}
                  <span className="font-mono font-bold tabular-nums text-foreground">
                    {o.bestMockScore}
                  </span>
                  /97
                </>
              ) : null}
            </span>

            <form action={formAction} className="ml-auto">
              <input type="hidden" name="outcomeId" value={o.id} />
              <button type="submit" disabled={pending} className="btn-ghost text-xs text-danger">
                <IconX className="h-3.5 w-3.5" />
                Изтрий
              </button>
            </form>
          </li>
        ))}
      </ul>

      {state.status === "error" ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {state.messageBg}
        </p>
      ) : null}
      {state.status === "withdrawn" ? (
        <p role="status" className="text-sm font-semibold text-muted">
          {state.messageBg}
        </p>
      ) : null}

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
        <IconShield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Пазим само това, което виждаш тук — изпит, дата и нашата собствена
        прогноза. Без имена на изпитващи, без учебен център, без бележки.
        „Изтрий“ го маха завинаги.
      </p>
    </section>
  );
}
