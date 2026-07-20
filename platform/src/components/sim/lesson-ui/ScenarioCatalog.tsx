"use client";

/**
 * S1 — the „Сценарии" zone on /simulator (doc 76 §8, catalog v1): the third
 * category beside the curriculum grid and the exam card. P0 ships ONE card
 * (sc-park-perp-rev); the section is already list-shaped for the 150-template
 * library.
 *
 * Card: family icon · title · level dots (attempted levels light up) ·
 * personal best stars. Clicking opens the LEVEL PICKER sheet inline: one row
 * per authored level with its aids summary, best stars and the soft gate —
 * L1 is ALWAYS open (founder ruling §12: the library is the acquisition
 * hook); L2+ unlock at ≥ 2★ on the previous level (server recomputes the
 * same fold; a locked level's session is refused server-side too).
 */

import { useEffect, useState } from "react";
import { SCENARIO_LEVEL_NAMES_BG, SCENARIO_UNLOCK_MIN_STARS } from "@/modules/sim/lessons";
import type { ScenarioCatalogEntry } from "./types";

/** Stable DOM id per catalog card — the return-from-session scroll anchor. */
function cardDomId(templateId: string): string {
  return `sc-card-${templateId}`;
}

/** Family icon map (doc 76 §2 families; P0 ships parking). */
const FAMILY_ICONS: Record<string, string> = {
  parking: "🅿️",
  junction: "🚦",
  signals: "🚥",
  pedestrians: "🚸",
  lanes: "🛣️",
  roundabout: "🔄",
  merging: "🔀",
  hazards: "⚠️",
  speed: "🚗",
  following: "🚙",
  conditions: "🌧️",
  cockpit: "🧰",
  vru: "🚲",
  rail: "🚂",
  "exam-drills": "🎓",
};

/** Aid one-liner per level (the doc 76 §7 ladder, student-facing). */
const LEVEL_AIDS_BG: Record<number, string> = {
  1: "Кола-сянка + синя линия + пауза при грешка",
  2: "Само синята линия",
  3: "Без помощ — нормално оценяване",
  4: "Изпитен протокол — студен старт, без изглед отгоре",
  5: "Усложнения: трафик и условия",
};

function Stars({ stars }: { stars: 1 | 2 | 3 | null }) {
  return (
    <span aria-label={stars !== null ? `${stars} от 3 звезди` : "без опит"} className="text-sm">
      {[1, 2, 3].map((s) => (
        <span
          key={s}
          aria-hidden
          style={{
            color: stars !== null && s <= stars ? "var(--warning)" : "var(--border-strong)",
          }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

export function ScenarioCatalogSection({
  scenarios,
  focusTemplateId = null,
  onStart,
}: {
  scenarios: ScenarioCatalogEntry[];
  /**
   * R3 #5/#23: the just-played template — this section mounts back after a
   * session with that card's level picker OPEN and scrolls it into view, so
   * „Назад към таблото" returns the founder to his position in the catalog
   * (not to the page top, and never off /simulator).
   */
  focusTemplateId?: string | null;
  /** Start one compiled rung — the client compiles + mounts the play shell. */
  onStart: (templateId: string, level: 1 | 2 | 3 | 4 | 5) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(focusTemplateId);

  // Scroll AFTER first paint (the section mounts fresh when the play shell
  // unmounts, so this runs exactly once per return-from-session).
  useEffect(() => {
    if (focusTemplateId === null) return;
    document
      .getElementById(cardDomId(focusTemplateId))
      ?.scrollIntoView({ block: "center", behavior: "auto" });
    // Mount-only by design: a LATER prop change must not yank the scroll
    // while the founder is browsing the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (scenarios.length === 0) return null;

  return (
    <section aria-labelledby="scenario-zone-title" className="flex flex-col gap-3">
      <div>
        <h2 id="scenario-zone-title" className="text-lg font-black">
          Сценарии
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          Отделни маневри от реалния живот — учиш се, като караш: първо гледаш
          и следваш сянката, после сам, накрая при изпитни условия. Ниво 1 е
          винаги отворено; следващото ниво се отключва с ≥ {SCENARIO_UNLOCK_MIN_STARS}★.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {scenarios.map((sc, i) => {
          const taskNo = i + 1;
          const open = openId === sc.templateId;
          const bestOverall = sc.levels.reduce<1 | 2 | 3 | null>(
            (best, l) =>
              l.bestStars !== null && (best === null || l.bestStars > best) ? l.bestStars : best,
            null,
          );
          const attempted = sc.levels.some((l) => l.attempts > 0);
          return (
            <article
              key={sc.templateId}
              id={cardDomId(sc.templateId)}
              aria-label={sc.titleBg}
              className="card relative flex flex-col gap-3 p-5 transition hover:border-accent hover:shadow-glow-sm motion-reduce:transition-none"
            >
              <header className="flex items-start gap-3">
                <span
                  aria-label={`Задача ${taskNo}`}
                  className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface px-1.5 text-sm font-black tabular-nums text-foreground"
                >
                  {taskNo}
                </span>
                <span aria-hidden className="text-2xl">
                  {FAMILY_ICONS[sc.family] ?? "🚗"}
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-extrabold leading-tight">{sc.titleBg}</h3>
                  {/* Level dots: one per authored level, lit when attempted. */}
                  <div className="mt-1 flex items-center gap-1.5" aria-label="Нива">
                    {sc.levels.map((l) => (
                      <span
                        key={l.level}
                        title={`Ниво ${l.level} — ${SCENARIO_LEVEL_NAMES_BG[l.level]}`}
                        className="inline-block h-2 w-2 rounded-full"
                        style={{
                          background:
                            l.attempts > 0
                              ? "var(--accent)"
                              : l.unlocked
                                ? "var(--border-strong)"
                                : "var(--border)",
                        }}
                      />
                    ))}
                    <span className="ml-1 text-[10px] font-bold uppercase tracking-wide text-muted">
                      L1–L{sc.levels[sc.levels.length - 1]?.level ?? 1}
                    </span>
                  </div>
                </div>
                <span className="ml-auto flex shrink-0 flex-col items-end gap-0.5">
                  <Stars stars={bestOverall} />
                  {attempted ? (
                    <span className="text-[10px] font-semibold text-muted">лично най-добро</span>
                  ) : null}
                </span>
              </header>

              <p className="text-sm leading-relaxed text-muted">{sc.objectiveBg}</p>

              <div className="flex flex-wrap gap-1.5">
                {sc.tagsBg.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted"
                  >
                    {tag}
                  </span>
                ))}
                <span className="rounded-full border border-accent/50 px-2 py-0.5 text-[10px] font-bold text-accent">
                  с кола-сянка
                </span>
              </div>

              <button
                type="button"
                className={open ? "btn-ghost w-full" : "btn-accent w-full"}
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : sc.templateId)}
              >
                {open ? "Скрий нивата" : "Избери ниво"}
              </button>

              {/* The level-picker sheet */}
              {open ? (
                <ul className="flex flex-col gap-1.5" aria-label="Избор на ниво">
                  {sc.levels.map((l) => (
                    <li key={l.level}>
                      <button
                        type="button"
                        disabled={!l.unlocked}
                        onClick={() => onStart(sc.templateId, l.level)}
                        className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition motion-reduce:transition-none ${
                          l.unlocked
                            ? "border-border hover:border-accent"
                            : "cursor-not-allowed border-border opacity-55"
                        }`}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-black">
                          L{l.level}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold leading-tight">
                            {SCENARIO_LEVEL_NAMES_BG[l.level]}
                          </span>
                          <span className="block truncate text-[11px] text-muted">
                            {l.unlocked
                              ? LEVEL_AIDS_BG[l.level] ?? ""
                              : `Отключва се с ≥ ${SCENARIO_UNLOCK_MIN_STARS}★ на предишното ниво`}
                          </span>
                        </span>
                        <span className="shrink-0">
                          {l.unlocked ? (
                            <Stars stars={l.bestStars} />
                          ) : (
                            <span aria-label="Заключено ниво" className="text-sm text-muted">
                              🔒
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
