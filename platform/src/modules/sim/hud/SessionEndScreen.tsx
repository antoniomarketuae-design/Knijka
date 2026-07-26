"use client";

/**
 * Session-end screen — the official-style verdict after a lesson: score
 * breakdown table by severity class (опасни / основни / второстепенни, the
 * exact taxonomy of the practical exam — doc 32), pass/fail styled like the
 * mock-exam results, the mistake list with law-ref chips, the debrief text
 * and the follow-up actions.
 *
 * A15 (feedback v2): learning consolidates where the student sees WHERE it
 * happened and WHAT the right action was —
 *  - mistake map: a static MistakeMap panel (same polyline machinery as the
 *    live minimap) plotting every positioned violation severity-colored,
 *    near-misses as hollow rings, commendations as subtle dots (toggle);
 *    tapping a marker scrolls to + flashes the matching row below;
 *  - per-mistake corrective: the catalog's authored `correctiveBg` line
 *    („какво трябваше да направя") under every mistake row — ADR-002 copy,
 *    and the grounding input for the post-Alpha LLM debrief;
 *  - objective measurements: A10's ObjectiveOutcome.detail rendered on the
 *    objective rows (reaction time + band, park attempts/alignment, met red,
 *    signaled roundabout exit).
 *
 * XP chip: renders only when `xpEarned` is a number — sim lessons award no XP
 * until the gamification event union accepts sim_lesson (see lessons/types.ts).
 */

import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { VIOLATIONS, type FailReason, type ViolationCode } from "../rules";
import {
  REACTION_BAND_LABELS_BG,
  type LessonResult,
  type ObjectiveDetail,
  type ParkAlignment,
  type RubricScore,
} from "../lessons";
import {
  MistakeMap,
  type MinimapPolyline,
  type MistakeMapMarker,
} from "./Minimap";
import {
  retryCtaClass,
  scenarioCtaRow,
  type SessionEndScenarioTarget,
} from "./sessionEndCtas";

export interface SessionEndConcept {
  id: string;
  titleBg: string;
  /** Theory deep link, e.g. /theory/practice?topic=… */
  href: string;
}

const FAIL_REASON_TEXT: Record<FailReason, string> = {
  "dangerous-mistake": "допусната е опасна грешка — директно неиздържан",
  "total-points-exceeded": "повече от 9 наказателни точки общо",
  "osnovni-points-exceeded": "повече от 6 точки от основни грешки",
};

const PARK_ALIGNMENT_LABELS: Record<ParkAlignment, string> = {
  centered: "центрирано",
  acceptable: "приемливо",
  sloppy: "неточно",
};

const NEAR_MISS_KIND_LABELS: Record<"vehicle" | "pedestrian" | "cyclist", string> = {
  vehicle: "автомобил",
  pedestrian: "пешеходец",
  cyclist: "велосипедист",
};

function clock(tSec: number): string {
  const m = Math.floor(tSec / 60);
  const s = Math.floor(tSec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** A15: the catalog's authored corrective action; null for unknown codes. */
function correctiveFor(code: string): string | null {
  if (!(code in VIOLATIONS)) return null;
  return VIOLATIONS[code as ViolationCode].correctiveBg;
}

/** A10 measurement channel → one human line on the objective row. */
function objectiveDetailText(detail: ObjectiveDetail | undefined): string | null {
  if (detail === undefined) return null;
  switch (detail.kind) {
    case "emergencyStop": {
      if (detail.reactionTimeSec !== null && detail.band !== null) {
        const gap =
          detail.stopGapM !== null ? ` · спря на ${detail.stopGapM.toFixed(1)} м` : "";
        return `Реакция: ${detail.reactionTimeSec.toFixed(2)} с — ${REACTION_BAND_LABELS_BG[detail.band]}${gap}`;
      }
      if (detail.outcome === "passedWithoutStopping") return "Подмина опасността, без да спре";
      if (detail.outcome === "hitLeadCar") return "Удар в спиращата кола отпред";
      return null;
    }
    case "parkInBay": {
      if (detail.attempts === 0) return null;
      const parts = [`${detail.attempts} ${detail.attempts === 1 ? "опит" : "опита"}`];
      if (detail.alignment !== null) {
        parts.push(`подравняване: ${PARK_ALIGNMENT_LABELS[detail.alignment]}`);
      }
      return `Паркиране: ${parts.join(" · ")}`;
    }
    case "passSignal":
      return detail.redMetHere ? "Изчака червения сигнал и потегли на зелено" : null;
    case "roundabout":
      return detail.exitSignaled ? "Излезе от кръговото с десен мигач" : null;
    case "threePointTurn": {
      if (detail.movements === 0) return null;
      return `Обратен завой: ${detail.movements} ${detail.movements === 1 ? "движение" : "движения"}`;
    }
  }
}

/**
 * Everything the map + row-linking needs, derived once from the result:
 * markers carry row keys (`v:i` mistakes, `n:i` near-misses, `c:i`
 * commendations); positions pair to events by (kind, code, t), consumed once
 * each — the exact scheme the lessons engine recorded them with.
 */
function buildMapModel(result: LessonResult) {
  const pool = new Map<string, Array<{ x: number; y: number }>>();
  for (const p of result.eventPositions ?? []) {
    const key = `${p.kind}:${p.code}@${p.t}`;
    const list = pool.get(key);
    if (list) list.push({ x: p.x, y: p.y });
    else pool.set(key, [{ x: p.x, y: p.y }]);
  }
  const take = (kind: string, code: string, t: number) =>
    pool.get(`${kind}:${code}@${t}`)?.shift() ?? null;

  const mistakeMarkers: MistakeMapMarker[] = [];
  result.summary.mistakes.forEach((m, i) => {
    const pos = take("violation", m.code, m.t);
    if (pos !== null) {
      mistakeMarkers.push({ id: `v:${i}`, x: pos.x, y: pos.y, kind: m.severityClass });
    }
  });

  const nearMissMarkers: MistakeMapMarker[] = [];
  (result.nearMisses ?? []).forEach((n, i) => {
    if (n.x !== null && n.y !== null) {
      nearMissMarkers.push({ id: `n:${i}`, x: n.x, y: n.y, kind: "nearMiss" });
    }
  });

  const commendationMarkers: MistakeMapMarker[] = [];
  result.summary.commendations.forEach((c, i) => {
    const pos = take("commendation", c.code, c.t);
    if (pos !== null) {
      commendationMarkers.push({ id: `c:${i}`, x: pos.x, y: pos.y, kind: "commendation" });
    }
  });

  return { mistakeMarkers, nearMissMarkers, commendationMarkers };
}

export function SessionEndScreen({
  lessonTitleBg,
  result,
  debriefText,
  concepts,
  xpEarned,
  onRetry,
  onExit,
  nextLessonTitleBg,
  onNextLesson,
  mapPolylines = null,
  rubric = null,
  nextScenarioLevel = null,
  nextScenarioTemplate = null,
  catalogCompleteBg = null,
  calibrationGate = null,
  calibrationLocked = false,
  myDriveHref = null,
}: {
  lessonTitleBg: string;
  result: LessonResult;
  /** null while the session is still being saved server-side. */
  debriefText: string | null;
  concepts: SessionEndConcept[];
  xpEarned: number | null;
  onRetry: () => void;
  /**
   * „Назад към таблото" (founder R3 #5/#23): leave the session back to the
   * simulator select screen — a CLIENT-SIDE exit through the shell's own
   * owner, never a route hop. The old <Link href="/dashboard"> left the
   * /simulator page entirely: any hiccup on the dashboard route (its data
   * layer has no DB fallback, unlike /simulator's) surfaced the (dashboard)
   * error boundary, and its recovery links walked the founder to the landing
   * page. The owner (simulator-client) restores the catalog anchored at the
   * just-played template instead.
   */
  onExit: () => void;
  /** Next lesson in the curriculum; null on the last lesson. */
  nextLessonTitleBg: string | null;
  /** null = next lesson locked (this attempt did not pass). */
  onNextLesson: (() => void) | null;
  /**
   * A15: district/route polylines for the static mistake map (the shell
   * hands over its last live-minimap frame — the polylines are the full
   * district, so no live vehicle is needed). null → no map panel.
   */
  mapPolylines?: MinimapPolyline[] | null;
  /**
   * S1 (doc 76 §6): the scenario rubric — stars + breakdown, rendered as an
   * ADDITIVE quality section right under the verdict (official points stay
   * the primary result). null (every curriculum lesson) = no section.
   */
  rubric?: RubricScore | null;
  /**
   * S1 (founder 2026-07-17): the two forward targets of a green scenario run
   * — one rung harder on the SAME maneuver („Следващо ниво"), and the next
   * card in the library („Следващ сценарий"). Either may be null on its own:
   * a star-locked rung (doc 76 §8) leaves `nextScenarioLevel` null while the
   * ungated next card still shows. Whenever any of them renders, „Повтори"
   * steps back to secondary. Both null on every curriculum lesson.
   */
  nextScenarioLevel?: SessionEndScenarioTarget | null;
  /** null = topped out on the last card, or the run was not green. */
  nextScenarioTemplate?: SessionEndScenarioTarget | null;
  /** End of the scenario library: a closing line instead of a dead button. */
  catalogCompleteBg?: string | null;
  /**
   * I1 „Позна ли се?" (doc 82 §5.3): the self-assessment calibration gate,
   * passed in as an opaque slot. A SLOT and not a prop bundle on purpose —
   * the gate talks to the learning module and a server action, and this screen
   * is the sim module's; keeping it a ReactNode means no new cross-module edge
   * for a widget the owner already renders.
   */
  calibrationGate?: ReactNode;
  /**
   * While true this screen renders ONLY the gate. The score, the mistake map,
   * the mistake list and the debrief must all stay UNMOUNTED — a student who
   * can already read „0 точки" is not predicting anything, and the calibration
   * error would measure nothing at all.
   */
  calibrationLocked?: boolean;
  /**
   * I2 „Твоят дубъл" (doc 82 §5.3): deep link to the replay of THIS drive.
   * null when the session did not persist a trace — there is nothing to watch,
   * and a dead link on the result screen is worse than no link.
   */
  myDriveHref?: string | null;
}) {
  const { summary } = result;
  const score = summary.score;
  const nearMisses = result.nearMisses ?? [];

  // S1: which forward buttons exist and which one carries the accent is the
  // pure builder's call (sessionEndCtas.ts) — 0, 1 or 2 of them.
  const scenarioCtas = scenarioCtaRow({
    level: nextScenarioLevel,
    template: nextScenarioTemplate,
  });

  // -- A15 mistake map state ---------------------------------------------------
  const [showGood, setShowGood] = useState(false);
  const [selected, setSelected] = useState<{ key: string; pulse: number } | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const registerRow = (key: string) => (el: HTMLLIElement | null) => {
    if (el) rowRefs.current.set(key, el);
    else rowRefs.current.delete(key);
  };

  const { mistakeMarkers, nearMissMarkers, commendationMarkers } = useMemo(
    () => buildMapModel(result),
    [result],
  );
  const markers = useMemo(
    () => [
      ...mistakeMarkers,
      ...nearMissMarkers,
      ...(showGood ? commendationMarkers : []),
    ],
    [mistakeMarkers, nearMissMarkers, commendationMarkers, showGood],
  );
  const hasMap = mapPolylines !== null && mapPolylines.length > 0 && markers.length > 0;

  const selectMarker = (key: string) => {
    setSelected((prev) => ({ key, pulse: (prev?.pulse ?? 0) + 1 }));
    const row = rowRefs.current.get(key);
    if (row) row.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  /** Row classes + remount key so re-selecting restarts the flash. */
  const rowFlash = (key: string) =>
    selected?.key === key
      ? { className: "sim-end-row-flash", key: `${key}:${selected.pulse}` }
      : { className: "", key };

  const rows = [
    { label: "Опасни грешки", per: "10 т.", count: score.opasniCount, points: score.opasniPoints, tone: "var(--danger)" },
    { label: "Основни грешки", per: "3 т.", count: score.osnovniCount, points: score.osnovniPoints, tone: "var(--warning)" },
    { label: "Второстепенни грешки", per: "1 т.", count: score.vtorostepenniCount, points: score.vtorostepenniPoints, tone: "var(--accent-soft)" },
  ];

  // I1: the gate holds the whole screen back. Nothing below this line renders
  // until the student has predicted (or skipped) — see calibrationLocked.
  if (calibrationLocked && calibrationGate !== null) {
    return (
      <div className="flex max-h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto p-1">
        {calibrationGate}
      </div>
    );
  }

  return (
    <div className="flex max-h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto p-1">
      {/* Row-flash animation (scoped to this screen; motion-reduce = no flash). */}
      <style>{`
        @keyframes sim-end-row-flash {
          0% { background-color: color-mix(in srgb, var(--accent) 28%, transparent); }
          100% { background-color: transparent; }
        }
        .sim-end-row-flash {
          animation: sim-end-row-flash 1.4s ease-out;
          border-color: var(--accent) !important;
        }
        @media (prefers-reduced-motion: reduce) {
          .sim-end-row-flash { animation: none; }
        }
      `}</style>

      {/* Verdict card */}
      <section
        aria-labelledby="sim-result-title"
        className="card flex flex-col items-center gap-3 p-6"
      >
        <h2 id="sim-result-title" className="text-base font-extrabold text-muted">
          {lessonTitleBg} · резултат
        </h2>

        <p className="flex items-baseline gap-2">
          <span
            className={`text-6xl font-black tabular-nums ${
              result.passed ? "text-success" : "text-danger"
            }`}
          >
            {result.score}
          </span>
          <span className="text-xl font-bold text-muted">наказателни точки</span>
        </p>

        <p
          className={`rounded-full px-4 py-1.5 text-sm font-black uppercase tracking-wide ${
            result.passed ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
          }`}
        >
          {result.passed ? "Издържан" : "Неиздържан"}
        </p>

        {xpEarned !== null ? (
          <p className="rounded-full bg-accent/15 px-3 py-1 text-xs font-black text-accent">
            +{xpEarned} XP
          </p>
        ) : null}

        {result.aborted ? (
          <p className="text-center text-sm font-semibold text-warning">
            Урокът беше прекъснат преди края.
          </p>
        ) : null}
        {summary.terminated ? (
          <p className="text-center text-sm font-semibold text-danger">
            Настъпи сблъсък — реалният изпит се прекратява незабавно.
          </p>
        ) : null}
        {!result.completedAll && !result.aborted ? (
          <p className="text-center text-sm font-semibold text-warning">
            Не всички задачи от маршрута бяха изпълнени.
          </p>
        ) : null}
        {!summary.passed && summary.failReasons.length > 0 ? (
          <ul className="text-center text-xs font-semibold text-muted">
            {summary.failReasons.map((r) => (
              <li key={r}>• {FAIL_REASON_TEXT[r]}</li>
            ))}
          </ul>
        ) : null}

        {/* Official-style breakdown table */}
        <table className="mt-2 w-full text-sm">
          <caption className="visually-hidden">
            Разбивка на наказателните точки по класове грешки
          </caption>
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-wide text-muted">
              <th scope="col" className="py-1.5 font-bold">Клас грешка</th>
              <th scope="col" className="py-1.5 text-right font-bold">Брой</th>
              <th scope="col" className="py-1.5 text-right font-bold">Точки</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border">
                <td className="py-2 font-semibold">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: r.tone }} aria-hidden />
                  {r.label} <span className="text-xs text-muted">({r.per})</span>
                </td>
                <td className="py-2 text-right font-black tabular-nums">{r.count}</td>
                <td className="py-2 text-right font-black tabular-nums">{r.points}</td>
              </tr>
            ))}
            <tr className="border-t border-border-strong">
              <td className="py-2 font-extrabold">Общо (допустими 9)</td>
              <td className="py-2 text-right font-black tabular-nums">
                {score.opasniCount + score.osnovniCount + score.vtorostepenniCount}
              </td>
              <td className={`py-2 text-right font-black tabular-nums ${result.passed ? "text-success" : "text-danger"}`}>
                {score.totalPoints}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* S1: scenario rubric — the maneuver-quality layer (doc 76 §6).
          Official points above remain the verdict; stars grade HOW WELL. */}
      {rubric !== null ? (
        <section aria-label="Оценка на маневрата" className="card flex flex-col gap-2 p-5">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-extrabold">Оценка на маневрата</h3>
            <span
              aria-label={`${rubric.stars} от 3 звезди`}
              className="ml-auto text-lg tracking-wide"
            >
              {[1, 2, 3].map((s) => (
                <span
                  key={s}
                  aria-hidden
                  style={{ color: s <= rubric.stars ? "var(--warning)" : "var(--border-strong)" }}
                >
                  ★
                </span>
              ))}
            </span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {rubric.breakdownBg.map((line) => (
              <li key={line.id} className="flex flex-col gap-0.5 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold">{line.labelBg}</span>
                  <span className="ml-auto shrink-0 text-xs font-black tabular-nums text-muted">
                    {line.points !== null ? `${line.points} / 2 т.` : line.measured ? "—" : "не се измерва"}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted">{line.detailBg}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* A15: mistake map — WHERE it happened */}
      {hasMap ? (
        <section aria-label="Карта на грешките" className="card flex flex-col gap-2 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-extrabold">Къде се случи</h3>
            {commendationMarkers.length > 0 ? (
              <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-muted">
                <input
                  type="checkbox"
                  checked={showGood}
                  onChange={(e) => setShowGood(e.target.checked)}
                />
                Покажи и похвалите
              </label>
            ) : null}
          </div>
          <MistakeMap
            polylines={mapPolylines}
            markers={markers}
            selectedId={selected?.key ?? null}
            onSelect={selectMarker}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-muted">
            <span><span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--danger)" }} />опасна</span>
            <span><span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--warning)" }} />основна</span>
            <span><span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent-soft)" }} />второстепенна</span>
            {nearMissMarkers.length > 0 ? (
              <span><span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: "var(--warning)" }} />на косъм</span>
            ) : null}
            {showGood ? (
              <span><span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "var(--success)" }} />похвала</span>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Objectives outcome */}
      {result.objectives.length > 0 ? (
        <section aria-label="Задачи от маршрута" className="card flex flex-col gap-2 p-5">
          <h3 className="text-sm font-extrabold">Задачи от маршрута</h3>
          <ul className="flex flex-col gap-1.5">
            {result.objectives.map((o) => {
              const detailText = objectiveDetailText(o.detail);
              return (
                <li key={o.id} className="flex flex-col gap-0.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black"
                      style={
                        o.done
                          ? { background: "var(--success)", color: "var(--accent-foreground)" }
                          : { border: "1px solid var(--border-strong)", color: "var(--muted)" }
                      }
                    >
                      {o.done ? "✓" : "–"}
                    </span>
                    <span className={o.done ? "font-semibold" : "font-semibold text-muted"}>
                      {o.titleBg}
                    </span>
                    {o.done && o.completedAtSec !== null ? (
                      <span className="ml-auto text-xs tabular-nums text-muted">{clock(o.completedAtSec)}</span>
                    ) : null}
                  </div>
                  {/* A10 measurement channel — „Реакция: 0.68 с — отличен" */}
                  {detailText !== null ? (
                    <p className="pl-7 text-xs font-semibold text-muted">{detailText}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Mistakes */}
      {summary.mistakes.length > 0 ? (
        <section aria-label="Грешки" className="card flex flex-col gap-2 p-5">
          <h3 className="text-sm font-extrabold">Грешки ({summary.mistakes.length})</h3>
          <ul className="flex flex-col gap-2">
            {summary.mistakes.map((m, i) => {
              const key = `v:${i}`;
              const flash = rowFlash(key);
              const corrective = correctiveFor(m.code);
              return (
                <li
                  key={flash.key}
                  ref={registerRow(key)}
                  className={`flex flex-col gap-1 rounded-xl border border-border p-3 ${flash.className}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-bold">{m.titleBg}</span>
                    <span
                      className="shrink-0 text-xs font-black tabular-nums"
                      style={{
                        color:
                          m.severityClass === "opasna"
                            ? "var(--danger)"
                            : m.severityClass === "osnovna"
                              ? "var(--warning)"
                              : "var(--accent-soft)",
                      }}
                    >
                      −{m.points} т.
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted">{m.explanationBg}</p>
                  {/* A15: the authored corrective — WHAT the right action was. */}
                  {corrective !== null ? (
                    <p className="text-xs font-semibold leading-relaxed">
                      <span className="text-success">✔ Правилното действие:</span>{" "}
                      {corrective}
                    </p>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted">
                      {m.lawRef}
                    </span>
                    <span className="text-[10px] tabular-nums text-muted">в {clock(m.t)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* A15: near misses — nothing graded, honestly surfaced */}
      {nearMisses.length > 0 ? (
        <section aria-label="Разминавания на косъм" className="card flex flex-col gap-2 p-5">
          <h3 className="text-sm font-extrabold text-warning">
            Разминавания на косъм ({nearMisses.length})
          </h3>
          <p className="text-xs leading-relaxed text-muted">
            Не се броят като грешки — нищо не се удари. Но „мина ми“ не е умение:
            виж къде беше на косъм и мини оттам по-бавно и по-широко.
          </p>
          <ul className="flex flex-col gap-1.5">
            {nearMisses.map((n, i) => {
              const key = `n:${i}`;
              const flash = rowFlash(key);
              return (
                <li
                  key={flash.key}
                  ref={registerRow(key)}
                  className={`flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm ${flash.className}`}
                >
                  <span
                    aria-hidden
                    className="inline-block h-3 w-3 shrink-0 rounded-full border-2"
                    style={{ borderColor: "var(--warning)" }}
                  />
                  <span className="font-semibold">
                    {NEAR_MISS_KIND_LABELS[n.kind]} — на {n.clearanceM.toFixed(1)} м
                  </span>
                  <span className="ml-auto text-xs tabular-nums text-muted">{clock(n.tSec)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Commendations */}
      {summary.commendations.length > 0 ? (
        <section aria-label="Похвали" className="card flex flex-col gap-2 p-5">
          <h3 className="text-sm font-extrabold text-success">Похвали</h3>
          <ul className="flex flex-col gap-1">
            {summary.commendations.map((c, i) => {
              const key = `c:${i}`;
              const flash = rowFlash(key);
              return (
                <li
                  key={flash.key}
                  ref={registerRow(key)}
                  className={`flex items-center gap-2 rounded-lg px-1 text-sm ${flash.className}`}
                >
                  <span aria-hidden className="text-success">✓</span>
                  <span className="font-semibold">{c.titleBg}</span>
                  <span className="ml-auto text-xs tabular-nums text-muted">{clock(c.t)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Debrief */}
      <section aria-label="Разбор" className="card flex flex-col gap-2 p-5">
        <h3 className="text-sm font-extrabold">Разбор от инструктора</h3>
        {debriefText === null ? (
          <p className="text-sm text-muted">Записване на сесията…</p>
        ) : (
          <p className="whitespace-pre-line text-sm leading-relaxed">{debriefText}</p>
        )}
        {concepts.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {concepts.map((c) => (
              <Link
                key={c.id}
                href={c.href}
                className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-accent transition hover:border-accent motion-reduce:transition-none"
              >
                {c.titleBg}
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      {/* S1: the library is finished — say so instead of offering nothing. */}
      {catalogCompleteBg !== null ? (
        <p
          aria-label="Край на библиотеката със сценарии"
          className="rounded-xl border border-success/50 bg-success/10 px-4 py-3 text-sm font-semibold text-success"
        >
          {catalogCompleteBg}
        </p>
      ) : null}

      {/* S1: the forward actions — a green rung leads on, and (founder
          2026-07-17) it leads TWO ways: one rung harder on this maneuver, or
          out to the next card. Own row, side by side from `sm` up: each label
          names its destination, so they are far too long to sit in the
          wrapping utility row below without breaking into ragged lines at
          laptop width. The grid gives them equal halves; the accent/ghost
          pair (never two accents) says which one is the default. */}
      {scenarioCtas.length > 0 ? (
        <div className={`grid gap-3 ${scenarioCtas.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {scenarioCtas.map((cta) => (
            <button
              key={cta.id}
              type="button"
              className={`${cta.className} w-full min-w-0 flex-col items-start gap-0.5 px-4 py-2.5 text-left`}
              onClick={cta.onStart}
            >
              <span className="text-[10px] font-black uppercase tracking-wider opacity-70">
                {cta.leadBg}
              </span>
              {/* Long template titles ellipsis rather than reflow the row —
                  the full name stays in the DOM for the accessible name. The
                  arrow sits outside the truncation so it never gets eaten. */}
              <span className="flex w-full items-baseline gap-1 text-sm font-bold">
                <span className="min-w-0 truncate">{cta.labelBg}</span>
                <span aria-hidden className="shrink-0">
                  →
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        {/* „Повтори" keeps its weight only while nothing leads forward — and
            it is the way back to the stars when a rung is locked. */}
        <button type="button" className={retryCtaClass(scenarioCtas)} onClick={onRetry}>
          Повтори
        </button>
        {nextLessonTitleBg !== null ? (
          onNextLesson !== null ? (
            <button type="button" className="btn-ghost" onClick={onNextLesson}>
              Следващ урок: {nextLessonTitleBg}
            </button>
          ) : (
            <span className="btn-ghost cursor-not-allowed opacity-50" aria-disabled>
              Следващ урок: заключен
            </span>
          )
        ) : null}
        {/* I2: the drive is already recorded and stored — this is the only
            place a student would think to look for it. */}
        {myDriveHref !== null ? (
          <Link href={myDriveHref} className="btn-ghost">
            Виж своя дубъл
          </Link>
        ) : null}
        <button type="button" className="btn-ghost ml-auto" onClick={onExit}>
          Назад към таблото
        </button>
      </div>
    </div>
  );
}
