"use client";

/**
 * „Позна ли се?" — the self-assessment calibration gate (doc 82 §5.3 I1).
 *
 * Stands between the finished drive and the result screen: the student says
 * how many penalty points they think they just made and whether they passed,
 * and only then does the engine's answer appear. The prediction is stored
 * paired with the actual, so the calibration ERROR becomes its own trend
 * (/review/self-calibration).
 *
 * Why this screen exists at all (doc 82 §5.1): realism has a null
 * crash-reduction evidence base; self-assessment calibration has a positive
 * one, and only 25–50% of licence candidates self-assess realistically. This
 * product can measure it because it owns an objective official-format score
 * for the student to be wrong about — a video course has nothing to calibrate
 * against.
 *
 * Design rules this screen obeys:
 *  - NOTHING about the result may leak before the answer. The owner renders
 *    only this component while `answered` is false — the score, the mistake
 *    list, the map and the debrief all stay unmounted. A student who has
 *    already seen "0 точки" is not predicting anything.
 *  - SKIPPABLE, always. It is a learning mechanic, not a paywall, and a
 *    student who does not want to play must still reach their debrief.
 *    Skipping stores nothing: a coerced guess is worse data than no data.
 *  - No bare verdict (requirement-zero, doc 64 THEO-4). Every reveal line says
 *    what the gap MEANS for driving; the copy is authored in
 *    modules/learning/calibration and never generated.
 *
 * The pure classification + copy is deep-imported from
 * `@/modules/learning/calibration` — a leaf file with no imports of its own,
 * so this client bundle never sees the learning module's server half (the
 * same reasoning that keeps clips/replay/* off the clips/view barrel).
 */

import Link from "next/link";
import { useState } from "react";
import {
  CALIBRATION_PENDING_BODY_BG,
  CALIBRATION_PENDING_TITLE_BG,
  MAX_PREDICTED_POINTS,
  formatCalibrationError,
  isBeyondPredictableScale,
  type CalibrationVerdict,
} from "@/modules/learning/calibration";
import {
  EXAM_POINTS_SHORT_NOTE_BG,
  EXAM_SCALE_SOURCE_BG,
  examPointsForClassBg,
  pointsBg,
} from "@/modules/sim/rules";

/** What the owner gets back once the gate resolves — enough to render the
 *  reveal without re-deriving anything the server already decided. */
export interface CalibrationReveal {
  predictedPoints: number;
  predictedPass: boolean;
  actualPoints: number;
  actualPass: boolean;
  errorPoints: number;
  verdict: CalibrationVerdict;
  verdictAgreed: boolean;
  titleBg: string;
  bodyBg: string;
}

/** Tone per verdict — overconfidence is the dangerous direction and is the
 *  only one that reads as a warning. Being harsh on yourself is a smaller
 *  problem than not noticing your own mistakes, and the colour says so. */
const VERDICT_TONE: Record<CalibrationVerdict, string> = {
  overconfident: "var(--danger)",
  accurate: "var(--success)",
  underconfident: "var(--warning)",
};

/**
 * The two things the student is asked for, in one place.
 *
 * EXTRACTED (sweep161, `sc-speed-transition/pc-wrong/04-t024s.png`) so the
 * waiting card can show the REAL question instead of describing one. See
 * `CalibrationPendingCard`. Rendering the same markup twice is what makes the
 * preview honest — a second, hand-written „looks like the form" block would
 * drift away from the form within one edit.
 */
function CalibrationFields({
  points,
  onPoints,
  pass,
  onPass,
  disabled = false,
  lessonHasTargets = false,
}: {
  points: string;
  onPoints: (v: string) => void;
  pass: boolean | null;
  onPass: (v: boolean) => void;
  disabled?: boolean;
  /** ADR-009 §5.9 — see the same prop on `CalibrationGate`. */
  lessonHasTargets?: boolean;
}) {
  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-extrabold">Моите наказателни точки</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_PREDICTED_POINTS}
          step={1}
          value={points}
          disabled={disabled}
          onChange={(e) => onPoints(e.target.value)}
          // A number this large is a fat finger, not a belief — say so before
          // the server refuses it.
          aria-describedby="sim-calibration-hint"
          className="w-32 rounded-xl border border-border bg-surface-2/50 px-3 py-2 font-mono text-lg font-black tabular-nums disabled:opacity-50"
        />
        <span id="sim-calibration-hint" className="text-[11px] text-muted">
          Цяло число от 0 до {MAX_PREDICTED_POINTS}. Опасна грешка ={" "}
          {examPointsForClassBg("opasna")}, основна = {examPointsForClassBg("osnovna")},
          второстепенна = {examPointsForClassBg("vtorostepenna")} ({EXAM_SCALE_SOURCE_BG}).{" "}
          {/* THE CAP IS ON THE FIELD, NOT ON THE PROTOCOL, and saying so is the
              half of sc-junction-rhr:c6d88f3f that belongs on the ASKING screen.
              A student read «от 0 до 30» as the range of the thing being
              measured; the engine scored 394 on a sibling drive in the same
              chunk, and 7 of 151 drives in the newest sweep are still over 30.
              Naming the limit as a limit on the ANSWER leaks nothing about this
              drive — it is a property of the input box — and it is what keeps
              the number the student meets next from looking like a broken
              scale. The withheld-verdict branch is at
              `calibration.ts:isBeyondPredictableScale`. */}
          Таванът е на полето, не на изпита: едно каране може да събере и повече
          от {MAX_PREDICTED_POINTS} — тогава вместо преценка ти казваме точно
          това.
        </span>
      </label>

      <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
        <legend className="text-xs font-extrabold">Издържах ли?</legend>
        {/* ADR-009 §5.9 — THE QUESTION HAS TO SAY WHICH VERDICT IT MEANS.
            On a practice rung the student now has two answers coming: the
            изпитен лист, and whether the lesson counted. This gate measures the
            first (`readSessionPassed` reads `sheetRoutePassed`), so a rung that
            can end «Не е взет» says so BEFORE the answer — otherwise a student
            who reads their own clean sheet correctly, then meets «Не е взет» on
            the next screen, is told he got a call wrong that he actually made
            right. It is a LESSON-level fact and reveals nothing about this
            drive. */}
        {lessonHasTargets ? (
          <p className="text-[11px] leading-relaxed text-muted">
            Отговори за изпитния лист — дали урокът се зачита, ще видиш веднага
            след това.
          </p>
        ) : null}
        <div className="flex gap-2">
          {[
            { value: true, labelBg: "Да, издържах" },
            { value: false, labelBg: "Не, неиздържан" },
          ].map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              aria-pressed={pass === opt.value}
              onClick={() => onPass(opt.value)}
              className={
                (pass === opt.value
                  ? "btn-primary px-4 py-2 text-sm"
                  : "btn-ghost px-4 py-2 text-sm") + " disabled:opacity-50"
              }
            >
              {opt.labelBg}
            </button>
          ))}
        </div>
      </fieldset>
    </>
  );
}

/**
 * What stands in front of the result screen while the save is still in flight.
 *
 * The end screen mounts the instant the drive ends, but the number the gate is
 * about is the SERVER's — so for the length of one POST there is a window in
 * which the score would otherwise be readable, and a prediction made after
 * reading the score measures nothing. This card holds that window.
 *
 * It carries its own escape hatch for the same reason the gate does: a hung
 * request must not cost the student their debrief. Skipping here skips the
 * gate for good — the answer would arrive already read.
 *
 * THE CARD USED TO BE A SENTENCE AND A SKIP BUTTON, AND IT READ AS BROKEN
 * (sweep161, `sc-speed-transition/pc-wrong/04-t024s.png`): *„The post-drive
 * self-assessment screen asks the student to state what result they expect,
 * then offers no way to answer — the only control on the card is Пропусни и
 * покажи резултата."* The frame is exactly that — the body copy
 * („искаме първо ти да кажеш какъв мислиш, че е") is a request in the present
 * tense, and the one thing you could press skipped the mechanic entirely.
 *
 * THE COPY WAS NOT THE MISTAKE — the ABSENCE was. `CALIBRATION_PENDING_BODY_BG`
 * carries a deliberate note that it must not read as „Зареждане…", because the
 * pause is the mechanic starting rather than a spinner. That intent is right
 * and is kept. What it could not do on its own was show that something is
 * still coming: `aria-busy` was the only signal on the card and `aria-busy` is
 * invisible, so a sighted student got a static card that asked a question and
 * offered no way to answer it. Two things fix that without turning it into a
 * loading screen:
 *
 *  - the REAL fields render here, disabled — the student reads the question
 *    they are about to answer instead of a description of it, and „disabled"
 *    is the affordance that says not yet rather than never;
 *  - a moving indicator gives `aria-busy` a visible counterpart, so the pause
 *    is legibly a pause.
 *
 * The escape hatch keeps its own line and its old label; a student who does not
 * want to wait still leaves in one press.
 */
export function CalibrationPendingCard({ onSkip }: { onSkip: () => void }) {
  const noop = (): void => undefined;
  return (
    <section
      aria-labelledby="sim-calibration-title"
      aria-busy
      className="card flex w-full max-w-2xl flex-col gap-4 p-6"
    >
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-black uppercase tracking-wider text-muted">
          Позна ли се?
        </span>
        <h2 id="sim-calibration-title" className="font-display text-xl font-black">
          {CALIBRATION_PENDING_TITLE_BG}
        </h2>
      </div>
      <p className="text-sm leading-relaxed text-muted">{CALIBRATION_PENDING_BODY_BG}</p>

      {/* The question itself, inert until the protocol lands. */}
      <CalibrationFields points="" onPoints={noop} pass={null} onPass={noop} disabled />

      {/* The visible half of aria-busy. Three dots on a stagger — enough to
          say „still working", not enough to read as a progress bar for
          something the student is waiting on. */}
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-muted"
              style={{ animationDelay: `${i * 160}ms` }}
            />
          ))}
        </span>
        <span className="text-[11px] font-semibold text-muted">
          Въпросът се отключва, щом протоколът е готов.
        </span>
      </div>

      <div>
        <button type="button" className="btn-ghost text-sm" onClick={onSkip}>
          Пропусни и покажи резултата
        </button>
      </div>
    </section>
  );
}

export function CalibrationGate({
  lessonTitleBg,
  onSubmit,
  onResolved,
  lessonHasTargets = false,
  lessonMistake = null,
  initialReveal = null,
}: {
  lessonTitleBg: string;
  /**
   * Sends the prediction and returns the paired reveal, or null when the
   * server could not pair it (an unscored/foreign session). Null resolves the
   * gate exactly like a skip — the student is never trapped behind a
   * mechanic's plumbing.
   */
  onSubmit: (predictedPoints: number, predictedPass: boolean) => Promise<CalibrationReveal | null>;
  /** Called once the student may proceed; carries the reveal when there is
   *  one so the result screen can show „ти каза / изпитът каза". */
  onResolved: (reveal: CalibrationReveal | null) => void;
  /**
   * ADR-009 §5.9 — this rung CAN end «Не е взет» (`lesson.lessonMistakeTargets`
   * is non-empty and the rung is not an exam rung). A fact about the LESSON,
   * known before the drive, so printing it leaks nothing about this attempt.
   *
   * Default false, so every existing call site — `app/dev/popup-rig` included,
   * which builds its props by hand — renders exactly today's card.
   */
  lessonHasTargets?: boolean;
  /**
   * ADR-009 §5.9 — the lesson's own mistakes this drive committed, for the
   * REVEAL half only. `namesBg` is `lessonMistakeNamesBg(hits)` (retrieved
   * catalogue titles — this component composes no copy about the acts) and
   * `one` says whether the sentence speaks of one or several.
   *
   * Null/absent = today's reveal. It must stay null until the answer is in:
   * this card is the one screen in the product that is only worth anything
   * because nothing about the result reached it early.
   */
  lessonMistake?: { namesBg: string; one: boolean } | null;
  /**
   * Start on the REVEAL half instead of the question. Null in the product — the
   * reveal is what `onSubmit` answers with — and it exists for the two readers
   * that cannot press a button:
   *  - `app/dev/popup-rig`, which photographs this card at 360 px (doc 92 §7,
   *    lane P) and could otherwise only reach the reveal by hand;
   *  - this repo's tests, which run with vitest `environment: "node"` and no DOM
   *    (vitest.config.ts), so a test can render markup but cannot click.
   * Passing it changes nothing about how a submitted answer is revealed.
   */
  initialReveal?: CalibrationReveal | null;
}) {
  const [points, setPoints] = useState("");
  const [pass, setPass] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<CalibrationReveal | null>(initialReveal);

  const parsed = Number(points);
  const pointsValid =
    points.trim() !== "" &&
    Number.isInteger(parsed) &&
    parsed >= 0 &&
    parsed <= MAX_PREDICTED_POINTS;
  const ready = pointsValid && pass !== null && !busy;

  const submit = async (): Promise<void> => {
    if (!ready || pass === null) return;
    setBusy(true);
    try {
      const answer = await onSubmit(parsed, pass);
      // A failure to STORE must not cost the student their debrief; it just
      // means this drive contributes nothing to the trend.
      if (answer === null) onResolved(null);
      else setReveal(answer);
    } catch {
      onResolved(null);
    } finally {
      setBusy(false);
    }
  };

  if (reveal !== null) {
    // ── THE TONE FOLLOWS THE COPY, AND PAST THE CEILING THERE IS NO VERDICT ──
    // Derived from the number already on this screen rather than carried as a
    // new field: `app/dev/popup-rig` builds a `CalibrationReveal` literal by
    // hand, and a required prop would only teach the rig to invent one (the
    // ruling `HudToast.raisedAtMs` writes down). The server has already sent the
    // matching wording via `calibrationRevealCopy`; what this decides is
    // whether the headline is painted in the overconfidence RED, and it must
    // not be — the student was not overconfident, the question was too small.
    const beyondScale = isBeyondPredictableScale(reveal.actualPoints);
    const tone = beyondScale ? "var(--muted)" : VERDICT_TONE[reveal.verdict];
    return (
      <section
        aria-labelledby="sim-calibration-title"
        className="card flex w-full max-w-2xl flex-col gap-4 p-6"
      >
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-muted">
            Позна ли се?
          </span>
          <h2
            id="sim-calibration-title"
            className="font-display text-xl font-black"
            style={{ color: tone }}
          >
            {reveal.titleBg}
          </h2>
        </div>

        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border p-3">
            <dt className="text-[10px] font-black uppercase tracking-wider text-muted">
              Ти каза
            </dt>
            <dd className="mt-1 text-2xl font-black tabular-nums">
              {pointsBg("exam", reveal.predictedPoints)}
              <span className="ml-2 align-middle text-xs font-bold text-muted">
                {reveal.predictedPass ? "издържан" : "неиздържан"}
              </span>
            </dd>
          </div>
          <div className="rounded-xl border border-border p-3">
            <dt className="text-[10px] font-black uppercase tracking-wider text-muted">
              Изпитът каза
            </dt>
            <dd className="mt-1 text-2xl font-black tabular-nums" style={{ color: tone }}>
              {pointsBg("exam", reveal.actualPoints)}
              <span className="ml-2 align-middle text-xs font-bold text-muted">
                {reveal.actualPass ? "издържан" : "неиздържан"}
              </span>
            </dd>
          </div>
        </dl>

        {/* This gate stands in FRONT of the result screen, so it is the first
            place a student meets their own number — and it showed it as a bare
            „20 т." on both tiles. Same repair as the screen behind it. */}
        <p className="text-[11px] leading-relaxed text-muted">{EXAM_POINTS_SHORT_NOTE_BG}</p>

        {/* ADR-009 §5.9 — THE SECOND ANSWER, after the exam's one.
            The tiles above stay exactly as they were, and they are now
            literally true: «Изпитът каза … издържан» is the изпитен лист, and
            the lesson rule is a separate sentence rather than a number folded
            into the one the student was asked to predict. The «сгреши и самата
            присъда» clause below is deliberately NOT suppressed — agreement is
            computed on the verdict the tile shows. */}
        {lessonMistake !== null ? (
          <p className="text-sm font-semibold leading-relaxed text-warning">
            {reveal.actualPass
              ? "По изпитния лист: издържан. Урокът обаче не е взет"
              : "Урокът също не е взет"}{" "}
            — {lessonMistake.namesBg}{" "}
            {lessonMistake.one
              ? "е грешката, която той учи"
              : "са грешките, които той учи"}
            .
          </p>
        ) : null}

        <p className="text-sm leading-relaxed">{reveal.bodyBg}</p>

        {/* …AND THE ROW UNDERNEATH STOPS CALLING IT „преценка". Past the
            ceiling the number is the distance from the biggest answer the form
            accepts to the protocol, which is a fact about the form. The
            pass/fail clause survives in both branches, because «издържан /
            неиздържан» is a call the student could always make truthfully. */}
        <p className="text-xs font-semibold text-muted">
          {beyondScale ? "Разлика до тавана на въпроса: " : "Разлика в преценката: "}
          <span className="font-mono font-black tabular-nums" style={{ color: tone }}>
            {formatCalibrationError(reveal.errorPoints)}
          </span>
          {reveal.verdictAgreed ? null : " · сгреши и самата присъда издържан/неиздържан"}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" onClick={() => onResolved(reveal)}>
            Виж пълния резултат
          </button>
          {/* The single drive is a data point; the curve is the lesson. */}
          <Link href="/review/self-calibration" className="text-xs font-semibold text-accent">
            Как се справяш с оценяването на себе си →
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="sim-calibration-title"
      className="card flex w-full max-w-2xl flex-col gap-4 p-6"
    >
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-black uppercase tracking-wider text-muted">
          {lessonTitleBg} · преди резултата
        </span>
        <h2 id="sim-calibration-title" className="font-display text-xl font-black">
          Позна ли се?
        </h2>
        <p className="text-sm leading-relaxed text-muted">
          Преди да видиш протокола: колко наказателни точки мислиш, че направи в
          това каране? Инструкторът на изпита пита същото — и разликата между
          твоя отговор и неговия е това, което ще те издаде на пътя.
        </p>
      </div>

      {/* Shared with CalibrationPendingCard, which renders these disabled so
          the waiting student sees the question rather than a promise of it. */}
      <CalibrationFields
        points={points}
        onPoints={setPoints}
        pass={pass}
        onPass={setPass}
        lessonHasTargets={lessonHasTargets}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={!ready} onClick={submit}>
          {busy ? "Проверявам…" : "Провери се"}
        </button>
        {/* Never a trap: the debrief is the lesson, this is a mechanic on top
            of it. A skip stores nothing — a coerced guess is worse than none. */}
        <button
          type="button"
          className="btn-ghost text-sm"
          disabled={busy}
          onClick={() => onResolved(null)}
        >
          Пропусни
        </button>
      </div>
    </section>
  );
}

export default CalibrationGate;
