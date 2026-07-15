"use client";

/**
 * Lesson select screen (/simulator v2): one hero card per lesson with
 * locked-until-previous-passed progression, plus the quality preset selector.
 * Pure presentation — progression is computed server-side (page.tsx).
 */

import { EXAM_BANK_SIZE } from "@/modules/sim/lessons";
import { QualityPresetSelector } from "./QualityPresetSelector";
import { LessonCard } from "./LessonCard";
import type { LessonEntryView, QualityPreset } from "./types";

export function LessonSelectScreen({
  entries,
  quality,
  onQualityChange,
  onStart,
}: {
  entries: LessonEntryView[];
  quality: QualityPreset;
  onQualityChange: (q: QualityPreset) => void;
  onStart: (lessonId: string) => void;
}) {
  // Name the prerequisite on locked cards ("Издържи „Свободно каране“…"):
  // полигон/exam-style specs carry an explicit unlockAfterLessonId; curriculum
  // lessons unlock after the previous integer order (computeProgression).
  const titleById = new Map(entries.map((e) => [e.lesson.id, e.lesson.titleBg]));
  const prerequisiteTitleFor = (entry: LessonEntryView): string | null => {
    const explicit = entry.lesson.unlockAfterLessonId;
    if (explicit !== undefined) return titleById.get(explicit) ?? null;
    const prev = entries.find((e) => e.lesson.order === entry.lesson.order - 1);
    return prev?.lesson.titleBg ?? null;
  };

  // The big picture — computed from the live entries so the numbers can
  // never drift from what is actually playable (landing-page honesty rule).
  const lessonCount = entries.length;
  const objectiveTotal = entries.reduce(
    (n, e) => n + e.lesson.objectives.length,
    0,
  );
  const conceptTotal = new Set(entries.flatMap((e) => e.lesson.conceptIds)).size;
  const examVariantsLabel = `над ${(Math.floor(EXAM_BANK_SIZE / 100) * 100).toLocaleString("bg-BG")}`;
  const totals = [
    { value: `${lessonCount}`, label: "урока и площадки" },
    { value: `${objectiveTotal}`, label: "оценявани задачи" },
    { value: `${conceptTotal}`, label: "покрити понятия" },
    { value: examVariantsLabel, label: "изпитни варианта" },
    { value: "2", label: "карти" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black sm:text-3xl">Симулатор</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Учебни маршрути по истинската улична мрежа на Студентски град.
            Инструкторът оценява в реално време по официалната изпитна система.
          </p>
        </div>
        <QualityPresetSelector value={quality} onChange={onQualityChange} />
      </header>

      <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-hair bg-surface px-4 py-3">
        {totals.map((t) => (
          <div key={t.label} className="flex items-baseline gap-1.5">
            <dd className="text-base font-black tabular-nums text-foreground">
              {t.value}
            </dd>
            <dt className="text-xs font-semibold text-muted">{t.label}</dt>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => (
          <LessonCard
            key={entry.lesson.id}
            entry={entry}
            prerequisiteTitleBg={
              entry.unlocked ? null : prerequisiteTitleFor(entry)
            }
            onStart={onStart}
          />
        ))}
      </div>

      <p className="text-xs text-muted">
        Световните данни: © OpenStreetMap contributors (ODbL). Автомобилите са
        измислени модели.
      </p>
    </div>
  );
}
