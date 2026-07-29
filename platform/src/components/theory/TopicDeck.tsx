"use client";

import { useMemo, useState } from "react";
import type { SectionOverview, TopicOverview } from "@/modules/learning";
import {
  type DeckLens,
  LENSES,
  LENS_LABELS,
  lensCounts,
  matchesLens,
} from "./deck";
import { TopicGauge } from "./TopicGauge";
import { TopicSheet } from "./TopicSheet";

/**
 * The board: sixteen topic instruments, a lens row that queries them, and the
 * sheet that opens over them.
 *
 * WHY THE LENS ROW IS THE REAL NAVIGATION. Sixteen is a bad number for a list —
 * too many to take in, too few to justify search. What makes it tractable is
 * that every topic already carries a STATE (untouched / in progress / mastered,
 * plus "has reviews waiting"), and that state is exactly what a student is
 * asking about when they open this page. „За преговор" collapses the board to
 * the four or five tiles that are actually urgent, which no amount of
 * scrolling through an accordion ever did.
 *
 * Filtering hides; it never reorders. The numbers 01–16 are the exam syllabus
 * and students learn the board by position — a grid that rearranged itself
 * under a filter would throw that away to save a row of scrolling.
 *
 * This is the only client component on the hub. The page stays a server
 * component and hands down plain data.
 */
export function TopicDeck({
  topics,
  sectionsByTopic,
  descriptions,
}: {
  topics: TopicOverview[];
  sectionsByTopic: Record<string, SectionOverview[]>;
  descriptions: Record<string, string>;
}) {
  const [lens, setLens] = useState<DeckLens>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(() => lensCounts(topics), [topics]);
  const visible = useMemo(
    () => topics.filter((t) => matchesLens(t, lens)),
    [topics, lens],
  );
  const open = openId ? (topics.find((t) => t.topicId === openId) ?? null) : null;

  return (
    <section aria-labelledby="deck-title" className="flex flex-col gap-4">
      <h2 id="deck-title" className="visually-hidden">
        Всички теми
      </h2>

      {/* Wrapping, never scrolling sideways: a chip that has to be swiped into
          view is a filter the student never learns exists. */}
      <div
        role="group"
        aria-label="Покажи темите по състояние"
        className="flex flex-wrap gap-1.5"
      >
        {LENSES.map((option) => {
          const active = option === lens;
          const n = counts[option];
          return (
            <button
              key={option}
              type="button"
              onClick={() => setLens(option)}
              aria-pressed={active}
              disabled={n === 0 && option !== "all"}
              className={[
                // 38px tall, not the 30px the type alone would give: these are
                // the board's navigation on a touch screen, and a filter a
                // thumb misses is a filter that does not exist.
                "inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
                active
                  ? "border-accent/60 bg-accent/15 text-accent"
                  : "border-hair bg-surface text-muted hover:border-border-strong hover:text-foreground",
              ].join(" ")}
            >
              {LENS_LABELS[option]}
              <span
                className={[
                  "font-mono text-[11px] tabular-nums",
                  active ? "text-accent" : "text-muted",
                ].join(" ")}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* The bottom padding is the point, not slack: it is the strip of FLOOR
          the board hovers above. Without somewhere for the plane to be seen,
          the perspective is a claim nobody can check — the grid would be
          entirely behind opaque tiles. */}
      {/* `isolate` is not decoration: without a stacking context of its own, the
          floor's `-z-10` drops it behind the app shell's own background and it
          renders — correctly, invisibly — underneath the page. */}
      <div className="relative isolate pb-16 sm:pb-24">
        {/* The floor itself. Decorative, text-free, and the only element on
            this page that is rotated in 3D. */}
        <div aria-hidden className="deck-floor -z-10 rounded-2xl" />

        {/* `topic-deck`, not `deck`: the 3D backdrop component owns the generic
            name in globals.css and its rule starts with `pointer-events: none`,
            which made every tile on this grid untappable in WebKit. */}
        <ul className="topic-deck grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
          {visible.map((topic, i) => (
            <li key={topic.topicId} className="flex">
              <TopicGauge topic={topic} index={i} onOpen={setOpenId} />
            </li>
          ))}
        </ul>

        {visible.length === 0 ? (
          <p className="panel-inset p-5 text-center text-sm leading-relaxed text-muted">
            {`Няма теми в „${LENS_LABELS[lens]}“ точно сега. Върни се на „${LENS_LABELS.all}“, за да видиш целия материал.`}
          </p>
        ) : null}
      </div>

      <TopicSheet
        topic={open}
        sections={open ? (sectionsByTopic[open.topicId] ?? []) : []}
        description={open ? descriptions[open.topicId] : undefined}
        onClose={() => setOpenId(null)}
      />
    </section>
  );
}
