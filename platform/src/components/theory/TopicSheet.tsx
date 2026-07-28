"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { IconX } from "@/components/icons";
import { masteryBarColor, masteryInkColor } from "@/components/ui/mastery";
import type { SectionOverview, TopicOverview } from "@/modules/learning";
import { SectionCard } from "./SectionCard";

/**
 * The topic's sections, over the board rather than inside it.
 *
 * WHY A NATIVE <dialog>. The thing being replaced is an inline
 * `<details>` expansion, and the specific defect was that opening one moved
 * everything below it — on a 390px screen that is the entire rest of the page.
 * A modal in the top layer cannot do that. It also arrives with Esc, a real
 * focus trap, `inert` on the background and correct AT semantics already
 * implemented, none of which a hand-rolled overlay gets right for free.
 *
 * The element is kept MOUNTED and driven by open/close rather than conditionally
 * rendered: `showModal()` on a node React inserted in the same commit is the
 * classic way to lose the opening frame, and re-mounting throws away the sheet's
 * scroll position every time the student peeks at a topic and comes back.
 */
export function TopicSheet({
  topic,
  sections,
  description,
  onClose,
}: {
  /** `null` closes the sheet — the deck owns the selection. */
  topic: TopicOverview | null;
  sections: SectionOverview[];
  description?: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (topic && !el.open) el.showModal();
    if (!topic && el.open) el.close();
  }, [topic]);

  const pct = topic ? Math.round(topic.avgMastery * 100) : 0;
  const started = (topic?.seenConceptCount ?? 0) > 0;
  const ring = masteryBarColor(topic?.avgMastery ?? 0);
  const ink = masteryInkColor(topic?.avgMastery ?? 0, started);

  return (
    <dialog
      ref={ref}
      className="deck-sheet"
      aria-label={topic ? `Тема ${topic.order}: ${topic.titleBg}` : undefined}
      // `cancel` covers Esc and the platform dismiss gesture; `close` covers
      // everything else that can shut a dialog. Both must reach the deck or its
      // state and the DOM drift apart and the sheet cannot be reopened.
      onClose={onClose}
      onCancel={onClose}
      // A click that lands on the dialog element itself is a click on the
      // backdrop — the content sits in children, so it never matches.
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {topic ? (
        <div className="flex max-h-[inherit] flex-col">
          {/* grab handle — the affordance that says "this came up from the
              bottom and goes back down"; phone only, decorative. */}
          <div aria-hidden className="flex justify-center pt-2.5 sm:hidden">
            <span className="h-1 w-9 rounded-full bg-border-strong" />
          </div>

          <header className="flex items-start gap-3 px-4 pb-3 pt-3 sm:px-6 sm:pt-5">
            <div
              className="gauge h-[54px] w-[54px]"
              style={
                {
                  "--gauge-arc": `${started ? Math.max(pct, 2) : 0}%`,
                  "--gauge-color": ring,
                  "--gauge-track": "var(--border-strong)",
                  "--gauge-thickness": "4px",
                } as React.CSSProperties
              }
            >
              <span aria-hidden className="gauge-ring" />
              <span
                aria-hidden
                className="font-mono text-[13px] font-bold leading-none tabular-nums"
                style={{ color: ink }}
              >
                {started ? `${pct}%` : "—"}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <p className="hud-label">Тема {String(topic.order).padStart(2, "0")}</p>
              <h2 className="mt-0.5 font-display text-base font-extrabold leading-snug sm:text-lg">
                {topic.titleBg}
              </h2>
              <p className="mt-1 text-[11px] leading-none text-muted">
                <span className="font-mono font-bold tabular-nums">
                  {topic.seenConceptCount}/{topic.conceptCount}
                </span>{" "}
                понятия
                {topic.dueCount > 0 ? (
                  <>
                    <span aria-hidden> · </span>
                    <span className="font-bold text-warning">
                      {topic.dueCount} за преговор
                    </span>
                  </>
                ) : null}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Затвори темата"
              className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-hair text-muted transition hover:bg-surface-2 hover:text-foreground motion-reduce:transition-none"
            >
              <IconX className="h-4 w-4" />
            </button>
          </header>

          {/* The topic explains itself before it asks to be practised — doc 64
              THEO-4 applied to navigation: the student should know what they
              are walking into, not just that it is item five. */}
          {description ? (
            <p className="px-4 pb-3 text-[13px] leading-relaxed text-muted sm:px-6">
              {description}
            </p>
          ) : null}

          <div className="px-4 sm:px-6">
            <Link
              href={`/theory/practice?topic=${topic.slug}`}
              className="btn-accent w-full"
            >
              {topic.dueCount > 0
                ? `Преговори ${topic.dueCount} ${
                    topic.dueCount === 1 ? "понятие" : "понятия"
                  }`
                : "Тренирай цялата тема"}
            </Link>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-hair px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            <p className="hud-label mb-2">
              {sections.length} {sections.length === 1 ? "раздел" : "раздела"}
            </p>
            <ul className="flex flex-col gap-2.5">
              {sections.map((section) => (
                <li key={section.sectionId}>
                  <SectionCard section={section} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
