"use client";

/**
 * HalfASection — the verdict board's „Half A" tab: every picture-bearing
 * theory question rendered as the founder would see its why-panel (the media
 * + the correct answer highlighted), with a ✓/✗ verdict toggle. Reuses the
 * production QuestionMediaView so the board can never diverge from what the
 * app actually shows. Verdicts persist device-local (`halfa-verdict:<id>`).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { QuestionMediaView } from "@/components/theory/QuestionMedia";
import type { HalfAItem } from "./halfAData";

type Verdict = "ok" | "problem";
const KEY_PREFIX = "halfa-verdict:";

function read(id: string): Verdict | null {
  try {
    const v = window.localStorage.getItem(`${KEY_PREFIX}${id}`);
    return v === "ok" || v === "problem" ? v : null;
  } catch {
    return null;
  }
}
function write(id: string, v: Verdict | null): void {
  try {
    if (v === null) window.localStorage.removeItem(`${KEY_PREFIX}${id}`);
    else window.localStorage.setItem(`${KEY_PREFIX}${id}`, v);
  } catch {
    /* storage blocked — session-only */
  }
}

function VerdictButtons({
  value,
  onChange,
}: {
  value: Verdict | null;
  onChange: (v: Verdict | null) => void;
}) {
  return (
    <div className="flex gap-2" role="group" aria-label="Присъда">
      <button
        type="button"
        onClick={() => onChange(value === "ok" ? null : "ok")}
        aria-pressed={value === "ok"}
        className={`flex-1 rounded-xl border px-3 py-1.5 text-sm font-bold transition motion-reduce:transition-none ${
          value === "ok"
            ? "border-success bg-success/15 text-success"
            : "border-border bg-surface text-muted hover:text-foreground"
        }`}
      >
        ✓ Добър
      </button>
      <button
        type="button"
        onClick={() => onChange(value === "problem" ? null : "problem")}
        aria-pressed={value === "problem"}
        className={`flex-1 rounded-xl border px-3 py-1.5 text-sm font-bold transition motion-reduce:transition-none ${
          value === "problem"
            ? "border-danger bg-danger/15 text-danger"
            : "border-border bg-surface text-muted hover:text-foreground"
        }`}
      >
        ✗ Проблем
      </button>
    </div>
  );
}

function HalfACard({
  item,
  verdict,
  onVerdict,
}: {
  item: HalfAItem;
  verdict: Verdict | null;
  onVerdict: (id: string, v: Verdict | null) => void;
}) {
  const ring =
    verdict === "ok"
      ? "ring-2 ring-success/60"
      : verdict === "problem"
        ? "ring-2 ring-danger/60"
        : "";
  return (
    <li className={`card flex flex-col gap-2.5 p-3 ${ring}`}>
      <QuestionMediaView media={item.media} />

      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-muted">
          <span>{item.id}</span>
          <span>{item.type}</span>
          {item.needsReview ? (
            <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 font-bold text-amber-600">
              чака преглед
            </span>
          ) : null}
        </p>
        <p className="mt-1 text-sm font-bold leading-snug">{item.textBg}</p>
      </div>

      {/* Options — the correct one(s) highlighted (the why-RIGHT view). */}
      <ul className="flex flex-col gap-1">
        {item.options.map((o) => (
          <li
            key={o.id}
            className={`rounded-lg border px-2.5 py-1.5 text-xs leading-snug ${
              o.correct
                ? "border-success/50 bg-success/10 font-bold text-success"
                : "border-border bg-surface text-muted"
            }`}
          >
            {o.correct ? "✓ " : ""}
            {o.textBg}
          </li>
        ))}
      </ul>

      <div className="mt-auto">
        <VerdictButtons value={verdict} onChange={(v) => onVerdict(item.id, v)} />
      </div>
    </li>
  );
}

export function HalfASection({ items }: { items: readonly HalfAItem[] }) {
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [group, setGroup] = useState<string | null>(null);

  useEffect(() => {
    const seed: Record<string, Verdict> = {};
    for (const it of items) {
      const v = read(it.id);
      if (v) seed[it.id] = v;
    }
    setVerdicts(seed);
  }, [items]);

  const onVerdict = useCallback((id: string, v: Verdict | null) => {
    write(id, v);
    setVerdicts((prev) => {
      const next = { ...prev };
      if (v === null) delete next[id];
      else next[id] = v;
      return next;
    });
  }, []);

  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) set.add(it.group);
    return [...set].sort();
  }, [items]);

  const shown = useMemo(
    () => (group === null ? items : items.filter((it) => it.group === group)),
    [items, group],
  );

  const tally = useMemo(() => {
    let ok = 0;
    let problem = 0;
    for (const v of Object.values(verdicts)) {
      if (v === "ok") ok += 1;
      else if (v === "problem") problem += 1;
    }
    return { ok, problem, unset: items.length - ok - problem };
  }, [verdicts, items.length]);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6">
        <p className="text-sm font-bold">Няма картинкови въпроси с медия</p>
        <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-muted">
          Нито един въпрос в content/questions/*.json няма поле „media" (signRef / sceneStill).
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface-2/40 p-3 text-sm">
        <span className="font-bold">Присъди:</span>
        <span className="rounded-full border border-success/50 bg-success/10 px-2.5 py-0.5 font-bold text-success">
          ✓ {tally.ok} добри
        </span>
        <span className="rounded-full border border-danger/50 bg-danger/10 px-2.5 py-0.5 font-bold text-danger">
          ✗ {tally.problem} проблемни
        </span>
        <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 font-bold text-muted">
          {tally.unset} без оценка
        </span>
        <span className="ml-auto text-xs text-muted">
          Картинков въпрос = знак/схема + правилният отговор осветен (0 нова графика).
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Групи">
        <button
          type="button"
          onClick={() => setGroup(null)}
          aria-pressed={group === null}
          className={`rounded-full border px-3 py-1 text-xs font-bold transition motion-reduce:transition-none ${
            group === null
              ? "border-accent bg-accent/15 text-accent"
              : "border-border bg-surface text-muted hover:text-foreground"
          }`}
        >
          Всички ({items.length})
        </button>
        {groups.map((g) => {
          const count = items.filter((it) => it.group === g).length;
          return (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g)}
              aria-pressed={group === g}
              className={`rounded-full border px-3 py-1 font-mono text-xs font-bold transition motion-reduce:transition-none ${
                group === g
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border bg-surface text-muted hover:text-foreground"
              }`}
            >
              {g} ({count})
            </button>
          );
        })}
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((item) => (
          <HalfACard
            key={item.id}
            item={item}
            verdict={verdicts[item.id] ?? null}
            onVerdict={onVerdict}
          />
        ))}
      </ul>
    </div>
  );
}
