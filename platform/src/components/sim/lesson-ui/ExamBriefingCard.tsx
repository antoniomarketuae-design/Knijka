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
import { PRE_DRIVE_STEP_ORDER } from "@/modules/sim/procedures";
import {
  EXAM_PASS_RULE_BG,
  EXAM_POINTS_SHORT_NOTE_BG,
  EXAM_SCALE_SOURCE_BG,
  EXAM_TERMINATION_CITATION_BG,
  EXAM_TERMINATION_RULE_BG,
  examPointsForClassBg,
  examPointsWordBg,
  PASS_MAX_OSNOVNI_POINTS,
  PASS_MAX_TOTAL_POINTS,
} from "@/modules/sim/rules";

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
            {/* The step count is DERIVED, not typed. `PRE_DRIVE_STEP_ORDER` is
                the same array the in-drive checklist counts against
                (`hud/PreDriveChecklist.tsx` renders `{done}/{ORDER.length}`), so
                the number promised here and the number on the checklist cannot
                drift apart — a 14th step would move both or neither. The old
                literal „13" was a second copy with nothing pinning it.

                CHECKED, NOT ASSUMED: „строг ред … се отбелязва в протокола" is
                true of the exam specifically — `examBank.ts` sets
                `preDriveMode: "assess"`, which is the mode that bills
                PREDRIVE_WRONG_ORDER; ordinary lessons run "instruction" and
                coach instead of charging. */}
            <p className="mt-1">
              Колата е студена: изпитът започва с пълната подготовка преди потегляне
              ({PRE_DRIVE_STEP_ORDER.length}-те стъпки) в <strong>строг ред</strong> —
              всяка разместена или пропусната стъпка се отбелязва в протокола.
            </p>
          </div>

          <div className="rounded-xl border border-border p-3">
            <h3 className="text-xs font-black uppercase tracking-wide text-muted">
              Как се оценява
            </h3>
            <p className="mt-1">
              По официалната система, от първата секунда: опасна грешка{" "}
              <strong>{examPointsForClassBg("opasna")}</strong>, основна{" "}
              <strong>{examPointsForClassBg("osnovna")}</strong>, второстепенна{" "}
              <strong>{examPointsForClassBg("vtorostepenna")}</strong> Няма
              предупреждения, няма учебни паузи и няма въпроси по време на карането —
              всяка грешка се пише веднага.
            </p>
            {/* THE SCALE, NAMED BEFORE HE EVER SEES A NUMBER. This card is the
                briefing: if the unit is established here, the toast mid-drive and
                the protocol at the end are reading off a scale he already knows. */}
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              {EXAM_POINTS_SHORT_NOTE_BG} Тарифата е по {EXAM_SCALE_SOURCE_BG}.
            </p>
          </div>

          {/* ═════════════════════════════════════════════════════════════════
              TWO DIFFERENT FACTS, AND THIS CARD USED TO PRINT THEM AS ONE.

              WHAT WAS HERE, VERBATIM, under a single heading „Кога се
              прекратява": „опасна грешка — незабавно; пътнотранспортно
              произшествие — незабавно; повече от 9 наказателни точки общо;
              повече от 6 наказателни точки от основни грешки."

              Three of those four are false, and the one real terminator was
              missing. This is not a wording preference — the engine that grades
              the drive says so in its own header (`rules/scoring.ts`): „Наредба
              № 38, чл. 48, ал. 3 … ends a practical exam in exactly two cases:
              повторна намеса на комисията, and допускане на ПТП. It is NOT
              „any опасна" … a red light or a missed Б2 costs 10, and 10 > 9
              makes the exam НЕИЗДЪРЖАН by приложение № 5, т. 11, but the
              candidate keeps driving and the examiner keeps ticking."

                · «опасна грешка — незабавно» is the exact sentence `n38.ts`
                  records the product once shipped and then withdrew as wrong.
                  It survived here because THIS FILE WAS NEVER OPENED in that
                  pass (0 commits since the sweep baseline `ec1f56f`), so the
                  correction landed in the catalogue and left the briefing that
                  sets the student's expectations still teaching the old rule.
                · The 9 and the 6 are приложение № 5, т. 11 — a PASS rule. They
                  decide whether the exam is издържан, they never stop the car.
                  Filing them under „прекратява" is the same category error as
                  conflating наказателни with контролни точки, which is the one
                  misreading this whole vocabulary exists to prevent.
                · повторна намеса на комисията — one of the act's own two — was
                  not on the list at all.

              WHY IT MATTERS MORE THAN THE WORDING. A student briefed that one
              опасна ends the exam and then billed 10 points while the drive
              continues has been taught that the engine is broken. The founder's
              own complaint is the mirror of it: a rule stated one way and
              applied another. Both directions teach the same wrong thing.

              The two headings below are the two facts, each quoting its own
              provision through the shared constants rather than a hand-typed
              copy — `scales.ts` names hand-typing as how the over-claim reached
              four surfaces in the first place.

              ROUTING NOTE, NOT FIXED HERE: `modules/sim/lessons/examBank.ts`
              lines 191-193 build every variant's `descriptionBg` ending
              „…опасна грешка, произшествие или превишени лимити прекратяват
              изпита." That string is passed straight into this card as
              `variantDescriptionBg` and renders ~40 px above this block, so the
              withdrawn claim is still on this screen once. That file belongs to
              another lane.
              ═════════════════════════════════════════════════════════════ */}
          <div className="rounded-xl border border-danger/40 p-3">
            <h3 className="text-xs font-black uppercase tracking-wide text-danger">
              Кога изпитващият спира изпита
            </h3>
            <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5">
              <li>повторна намеса на комисията в управлението;</li>
              <li>допускане на пътнотранспортно произшествие.</li>
            </ul>
            <p className="mt-1.5">
              Само тези две. И двете са един и същ момент по същество: колата вече не е
              под твое сигурно управление, затова изпитващият поема. Всяка друга грешка —
              включително опасна — се записва и{" "}
              <strong>карането продължава</strong>.
            </p>
            {/* The act's own sentence, verbatim, so the „only two" above has a
                source on screen instead of asking to be believed. */}
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              {EXAM_TERMINATION_CITATION_BG}: „{EXAM_TERMINATION_RULE_BG}“
            </p>
            <p className="mt-1.5 text-xs text-muted">
              Прекратен или прекъснат изпит не се продължава — започва се нов опит. В
              симулатора не спираме колата: возенето върви нататък, за да се учиш, но
              сесията се оценява като прекратена.
            </p>
          </div>

          <div className="rounded-xl border border-border p-3">
            <h3 className="text-xs font-black uppercase tracking-wide text-muted">
              Кога изпитът е неиздържан
            </h3>
            {/* `examPointsWordBg` RETURNS THE NUMBER TOO — „9 наказателни
                точки", not „наказателни точки". Prefixing the constant as well
                rendered «повече от 9 9 наказателни точки», and the four
                assertions guarding this block were all green while it did:
                every one of them asked `toContain("9")`, which a doubled 9
                satisfies twice over. It was caught by printing the card and
                reading it, and the regression assertion is now a NEGATIVE one
                („не 9 9"), because that is the only shape that fails.

                THIS COMMENT LIVES OUTSIDE THE <p> FOR A SECOND REASON FOUND THE
                SAME WAY. Inside, between two lines of prose, a JSX expression
                container splits one text child into two and the newline that
                would have joined them as a space is dropped: the card rendered
                «…оценката накрая.Неиздържан е при…». Also caught by reading the
                render, not by any assertion — a missing space is invisible to
                every `toContain` in the suite. */}
            <p className="mt-1">
              Друг въпрос, друг момент: това не спира карането, а решава оценката накрая.
              Неиздържан е при повече от <strong>{examPointsWordBg(PASS_MAX_TOTAL_POINTS)}</strong>{" "}
              общо или повече от{" "}
              <strong>{examPointsWordBg(PASS_MAX_OSNOVNI_POINTS)}</strong> от основни грешки.
            </p>
            {/* THE ARITHMETIC SAID OUT LOUD, because it is the thing that makes
                the two headings click together: една опасна е 10, а таванът е 9.
                Written as the sum rather than asserted, and both numbers are the
                same constants the scorer uses. */}
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Затова една-единствена опасна грешка стига: {examPointsForClassBg("opasna")}{" "}
              са повече от допустимите {PASS_MAX_TOTAL_POINTS}. Изпитът е загубен още там —
              но пак караш до края на маршрута, а изпитващият пак пише.
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
        {/* The pass rule VERBATIM (ADR-002 — the paraphrase above is ours, this
            sentence is the наредба's own), so the „9" has a source on screen. */}
        <p className="text-[11px] leading-relaxed text-muted">
          Наредба № 38, приложение № 5: „{EXAM_PASS_RULE_BG}“
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
