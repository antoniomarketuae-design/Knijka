"use client";

/**
 * A13 — pre-exam briefing („протоколът на изпитващия"). Shown between the
 * exam card and the session mount: states what is graded, what terminates,
 * how the route is communicated and how long it runs — in the examiner's
 * voice, so the student walks in knowing the rules, exactly like at ДАИ.
 *
 * B1b — the exam bank: the briefing now carries the drawn VARIANT — its
 * shareable code (EX-…), a one-line route/conditions summary, a „Нов изпит"
 * redraw and a paste-a-code replay. The code is the whole exam: same code =
 * same route, same conditions, same staged encounters, every time.
 *
 * The „Започни изпита" click is what mounts LessonPlayShell — deliberately,
 * so the shell's fullscreen request still rides this click's transient user
 * activation (same pattern as the lesson select screen).
 */

import { useState } from "react";

export function ExamBriefingCard({
  variantId = null,
  variantDescriptionBg = null,
  onRedraw,
  onReplayCode,
  onStart,
  onBack,
}: {
  /** Drawn exam-bank variant code (EX-…); null = legacy fixed route. */
  variantId?: string | null;
  /** Generated variant summary (shell + conditions), shown под кода. */
  variantDescriptionBg?: string | null;
  /** Draw a fresh variant (B1b „Нов изпит"). */
  onRedraw?: () => void;
  /** Try a pasted variant code; false = not a valid code (show error). */
  onReplayCode?: (code: string) => boolean;
  onStart: () => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);

  const applyCode = () => {
    if (onReplayCode === undefined || code.trim() === "") return;
    const ok = onReplayCode(code);
    setCodeError(!ok);
    if (ok) setCode("");
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <section aria-labelledby="exam-briefing-title" className="card flex flex-col gap-4 p-6">
        <header>
          <span className="text-[10px] font-black uppercase tracking-wider text-accent">
            Пробен практически изпит · инструктаж
          </span>
          <h2 id="exam-briefing-title" className="mt-1 text-xl font-black">
            Преди да потеглиш
          </h2>
        </header>

        {variantId !== null ? (
          <div className="rounded-xl border border-accent/40 bg-accent/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wide text-muted">
                  Твоят вариант
                </h3>
                <p className="mt-0.5 font-mono text-lg font-black tracking-wide">{variantId}</p>
              </div>
              {onRedraw !== undefined ? (
                <button type="button" className="btn-ghost text-sm" onClick={onRedraw}>
                  ↻ Нов изпит
                </button>
              ) : null}
            </div>
            {variantDescriptionBg !== null ? (
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{variantDescriptionBg}</p>
            ) : null}
            <p className="mt-1.5 text-xs text-muted">
              Запази кода: същият код повтаря точно същия изпит — маршрут, условия и
              ситуации.
            </p>
            {onReplayCode !== undefined ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setCodeError(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyCode();
                  }}
                  placeholder="Имаш код? EX-…"
                  aria-label="Код на изпитен вариант"
                  className={`w-44 rounded-lg border bg-surface px-2 py-1 font-mono text-sm ${
                    codeError ? "border-danger" : "border-border"
                  }`}
                />
                <button type="button" className="btn-ghost text-sm" onClick={applyCode}>
                  Зареди
                </button>
                {codeError ? (
                  <span className="text-xs text-danger">Невалиден код на вариант.</span>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 text-sm leading-relaxed">
          <div className="rounded-xl border border-border p-3">
            <h3 className="text-xs font-black uppercase tracking-wide text-muted">
              Как започва
            </h3>
            <p className="mt-1">
              Колата е студена: изпитът започва с пълната подготовка преди потегляне
              (13-те стъпки) в <strong>строг ред</strong> — всяка разместена или пропусната
              стъпка се отбелязва в протокола.
            </p>
          </div>

          <div className="rounded-xl border border-border p-3">
            <h3 className="text-xs font-black uppercase tracking-wide text-muted">
              Как се оценява
            </h3>
            <p className="mt-1">
              По официалната система, от първата секунда: опасна грешка{" "}
              <strong>10 т.</strong>, основна <strong>3 т.</strong>, второстепенна{" "}
              <strong>1 т.</strong> Няма предупреждения, няма учебни паузи и няма
              въпроси по време на карането — всяка грешка се пише веднага.
            </p>
          </div>

          <div className="rounded-xl border border-danger/40 p-3">
            <h3 className="text-xs font-black uppercase tracking-wide text-danger">
              Кога се прекратява
            </h3>
            <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5">
              <li>опасна грешка — незабавно;</li>
              <li>пътнотранспортно произшествие — незабавно;</li>
              <li>повече от 9 наказателни точки общо;</li>
              <li>повече от 6 точки от основни грешки.</li>
            </ul>
            <p className="mt-1.5 text-xs text-muted">
              Прекратен или прекъснат изпит не се продължава — започва се нов опит.
            </p>
          </div>

          <div className="rounded-xl border border-border p-3">
            <h3 className="text-xs font-black uppercase tracking-wide text-muted">
              Маршрутът
            </h3>
            <p className="mt-1">
              Всеки вариант е различен: около <strong>2–4 км</strong> градски маршрут със
              светофари, обръщане на посоката и паркиране на заден ход в очертано място.{" "}
              <strong>Няма насочваща линия</strong> — карай по инструкциите в горната
              лента, както ги дава изпитващият: „На следващото кръстовище завий надясно“.
            </p>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-muted">
          Изпитът е издържан при завършен маршрут с не повече от 9 наказателни точки,
          не повече от 6 от основни грешки и нито една опасна. След протокола получаваш
          пълния разбор — карта на грешките и какво да упражниш.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-accent" onClick={onStart}>
            Започни изпита
          </button>
          <button type="button" className="btn-ghost" onClick={onBack}>
            ← Назад към уроците
          </button>
        </div>
      </section>
    </div>
  );
}
