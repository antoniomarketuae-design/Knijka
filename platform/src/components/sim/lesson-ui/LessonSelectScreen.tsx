"use client";

/**
 * Lesson select screen (/simulator v2): one hero card per lesson with
 * locked-until-previous-passed progression, plus the quality preset selector.
 * Pure presentation — progression is computed server-side (page.tsx).
 */

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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => (
          <LessonCard key={entry.lesson.id} entry={entry} onStart={onStart} />
        ))}
      </div>

      <p className="text-xs text-muted">
        Световните данни: © OpenStreetMap contributors (ODbL). Автомобилите са
        измислени модели.
      </p>
    </div>
  );
}
