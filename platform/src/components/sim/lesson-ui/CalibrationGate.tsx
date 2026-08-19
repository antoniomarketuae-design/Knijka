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
}: {
  points: string;
  onPoints: (v: string) => void;
  pass: boolean | null;
  onPass: (v: boolean) => void;
  disabled?: boolean;
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
          второстепенна = {examPointsForClassBg("vtorostepenna")} ({EXAM_SCALE_SOURCE_BG}).
        </span>
      </label>

      <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
        <legend className="text-xs font-extrabold">Издържах ли?</legend>
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
}) {
  const [points, setPoints] = useState("");
  const [pass, setPass] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<CalibrationReveal | null>(null);

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
    const tone = VERDICT_TONE[reveal.verdict];
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

        <p className="text-sm leading-relaxed">{reveal.bodyBg}</p>

        <p className="text-xs font-semibold text-muted">
          Разлика в преценката:{" "}
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
      <CalibrationFields points={points} onPoints={setPoints} pass={pass} onPass={setPass} />

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
