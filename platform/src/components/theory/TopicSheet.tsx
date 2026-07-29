"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IconArrowRight, IconX } from "@/components/icons";
import { masteryInkColor } from "@/components/ui/mastery";
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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE SHEET IS NOW A LIST AND ALMOST NOTHING ELSE (phase 6).
 *
 * The founder opened this sheet on his iPhone and said „In theory ... only 20%
 * visible to choose the topic". He was right, and the order was the reason: a
 * 54px progress ring, the title, a three-line description and a full-width
 * primary button all came BEFORE the first thing a student can pick. The one
 * action the sheet exists for was the last thing reachable.
 *
 * So the sheet is inverted. The CHOICES ARE THE CONTENT:
 *
 *   • The header is one 44px line — number, title, mastery figure, two 44px
 *     controls. The ring is gone; its number survives, in the ink token that
 *     clears 7.25 : 1 (components/ui/mastery).
 *   • The description is SUPPORTING material, so it is behind the „i" toggle,
 *     collapsed by default. Nothing is lost — doc 64 THEO-4 asks the product to
 *     explain, not to explain before it is asked — and a student who wants the
 *     blurb is one tap away from it.
 *   • „Цялата тема" stopped being a button above the list and became the FIRST
 *     ROW OF IT. It is a choice like the others: broadest first, then the
 *     sections. That also moved the topic's counts (concepts seen, reviews due)
 *     out of the header and into the row they belong to, which is what let the
 *     header collapse to a single line.
 *   • Everything below the header is the list, edge to edge, rows touching.
 *
 * The result measured in WebKit at 393x852 is in the task report: the sheet is
 * now between 61% and 88% selectable choice, and — because the chrome collapsed
 * — every one of the sixteen topics fits its whole list on the screen with no
 * scrolling at all, which is the other thing he asked for.
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
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (topic && !el.open) el.showModal();
    if (!topic && el.open) el.close();
  }, [topic]);

  // Every topic gets its own first impression: the blurb a student expanded on
  // topic 03 must not be open on topic 04, where it would push a different set
  // of choices down the screen.
  const topicId = topic?.topicId ?? null;
  useEffect(() => {
    setShowAbout(false);
  }, [topicId]);

  const pct = topic ? Math.round(topic.avgMastery * 100) : 0;
  const started = (topic?.seenConceptCount ?? 0) > 0;
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
          <div aria-hidden className="flex justify-center pt-2 sm:hidden">
            <span className="h-1 w-9 rounded-full bg-border-strong" />
          </div>

          {/* ONE LINE. Everything that used to live here that is not the
              topic's identity now lives inside a choice. */}
          <header
            data-sheet-block="header"
            className="flex items-center gap-2 py-1 pl-3 pr-1 sm:pl-5 sm:pr-2"
          >
            <span
              aria-hidden
              className="font-mono text-[11px] font-bold leading-none text-muted"
            >
              {String(topic.order).padStart(2, "0")}
            </span>
            <h2 className="min-w-0 flex-1 truncate font-display text-[15px] font-extrabold leading-tight sm:text-lg">
              {topic.titleBg}
            </h2>

            <span
              data-mastery-ink
              className="shrink-0 font-mono text-[13px] font-bold leading-none tabular-nums"
              style={{ color: ink }}
            >
              <span className="visually-hidden">
                {started ? "Усвояване " : "Още не е започната"}
              </span>
              {started ? `${pct}%` : <span aria-hidden>—</span>}
            </span>

            {description ? (
              <button
                type="button"
                onClick={() => setShowAbout((v) => !v)}
                aria-expanded={showAbout}
                aria-controls="sheet-about"
                aria-label="За темата"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground motion-reduce:transition-none"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-[18px] w-[18px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 16v-5" />
                  <path d="M12 8h.01" />
                </svg>
              </button>
            ) : null}

            <button
              type="button"
              onClick={onClose}
              aria-label="Затвори темата"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground motion-reduce:transition-none"
            >
              <IconX className="h-[18px] w-[18px]" />
            </button>
          </header>

          {/* Supporting material, on request. Collapsed it costs nothing; the
              student who wants to know what a topic covers taps „i".
              RENDERED ALWAYS, hidden with `hidden`: `aria-controls` on the
              toggle must point at an element that EXISTS, and a `hidden`
              element has no box at all — zero pixels, no layout, but a real
              referent for assistive tech. */}
          <p
            id="sheet-about"
            data-sheet-block="about"
            hidden={!showAbout}
            className="border-t border-hair px-4 py-2.5 text-[13px] leading-relaxed text-muted sm:px-5"
          >
            {description}
          </p>

          {/* THE LIST. Edge to edge, rows touching, hairline-separated: every
              pixel below the header is a choice. */}
          <ul
            data-sheet-block="choices"
            data-sheet-scroller
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            <li>
              <Link
                href={`/theory/practice?topic=${topic.slug}`}
                data-sheet-choice="topic"
                className="group relative flex min-h-[72px] items-center gap-3 border-t border-accent/25 bg-accent/10 px-4 py-3.5 transition-colors duration-150 ease-out hover:bg-accent/15 active:bg-accent/15 motion-reduce:transition-none"
              >
                <div className="min-w-0 flex-1">
                  {/* Foreground ink, not accent ink. `text-accent` on this
                      accent-tinted ground measures 4.44 : 1 in the LIGHT
                      palette (#1b6bd6 on 10% accent over white) — under AA for
                      14px bold, which is not large text. The row is already
                      unmistakably the primary choice from its tint and its
                      arrow chip; it does not need to spend contrast on it. */}
                  <h3 className="truncate font-display text-sm font-bold leading-snug">
                    {topic.dueCount > 0
                      ? `Преговори ${topic.dueCount} ${
                          topic.dueCount === 1 ? "понятие" : "понятия"
                        }`
                      : "Тренирай цялата тема"}
                  </h3>
                  <p className="mt-1 text-[11px] leading-none text-muted">
                    <span className="font-mono font-bold tabular-nums">
                      {topic.seenConceptCount}/{topic.conceptCount}
                    </span>{" "}
                    понятия
                    <span aria-hidden> · </span>
                    <span className="font-mono font-bold tabular-nums">
                      {sections.length}
                    </span>{" "}
                    {sections.length === 1 ? "раздел" : "раздела"}
                  </p>
                </div>
                <span
                  aria-hidden
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-accent/40 bg-accent/15 text-accent transition group-hover:border-accent/60 motion-reduce:transition-none"
                >
                  <IconArrowRight className="h-4 w-4" />
                </span>
              </Link>
            </li>

            {sections.map((section, i) => (
              <li key={section.sectionId}>
                <SectionCard section={section} last={i === sections.length - 1} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </dialog>
  );
}
