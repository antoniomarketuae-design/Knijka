"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { IconCheck, IconX } from "@/components/icons";
import type { FlaggedQuestionDto, QuestionPatch } from "@/modules/content-admin/types";

/**
 * DEV-ONLY review console. Renders every needs-review question grouped by
 * topic and lets the founder Approve / Edit+approve / Reject to draft. Writes
 * go through POST /api/review; after each success we optimistically hide the
 * item and router.refresh() to re-read the on-disk truth.
 *
 * Keyboard (physical keys, layout-independent) for fast throughput:
 *   j / ↓  next     k / ↑  previous
 *   a  approve      e  edit      r  reject to draft
 */
export function ReviewClient({ flagged }: { flagged: FlaggedQuestionDto[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Captured once: the count when this review session began (usually 188).
  const [baseline] = useState(() => flagged.length);
  const [resolved, setResolved] = useState<ReadonlySet<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(
    () => flagged.filter((q) => !resolved.has(q.id)),
    [flagged, resolved],
  );

  // Effective focus: the user's chosen card while it is still visible,
  // otherwise fall back to the first — derived, so no setState-in-effect.
  const effectiveFocusId = useMemo(() => {
    if (visible.length === 0) return null;
    if (focusId !== null && visible.some((q) => q.id === focusId)) return focusId;
    return visible[0].id;
  }, [visible, focusId]);

  const cardRefs = useRef(new Map<string, HTMLElement>());
  const registerRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  }, []);

  const advanceFocusAfter = useCallback(
    (questionId: string) => {
      const idx = visible.findIndex((q) => q.id === questionId);
      if (idx < 0) return;
      const next = visible[idx + 1] ?? visible[idx - 1] ?? null;
      setFocusId(next ? next.id : null);
    },
    [visible],
  );

  const submitDecision = useCallback(
    async (questionId: string, payload: Record<string, unknown>): Promise<boolean> => {
      setBusyId(questionId);
      setError(null);
      try {
        const res = await fetch("/api/review", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Операцията не беше успешна.");
          return false;
        }
        advanceFocusAfter(questionId);
        setResolved((prev) => new Set(prev).add(questionId));
        setEditingId((cur) => (cur === questionId ? null : cur));
        startTransition(() => router.refresh());
        return true;
      } catch {
        setError("Връзката пропадна. Опитай отново.");
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [advanceFocusAfter, router, startTransition],
  );

  const approve = useCallback(
    (id: string) => void submitDecision(id, { questionId: id, action: "approve" }),
    [submitDecision],
  );
  const reject = useCallback(
    (id: string) => void submitDecision(id, { questionId: id, action: "reject" }),
    [submitDecision],
  );
  const saveEdit = useCallback(
    (id: string, patch: QuestionPatch) =>
      submitDecision(id, { questionId: id, action: "edit", patch }),
    [submitDecision],
  );
  const startEdit = useCallback((id: string) => {
    setError(null);
    setEditingId(id);
  }, []);
  const cancelEdit = useCallback(() => setEditingId(null), []);

  const bulkApprove = useCallback(
    async (slug: string, titleBg: string) => {
      const count = visible.filter((q) => q.topicSlug === slug).length;
      if (
        !window.confirm(
          `Да одобря ли всички останали ${count} въпроса в „${titleBg}“? Това ги пуска директно в пробните изпити.`,
        )
      ) {
        return;
      }
      setBulkBusy(slug);
      setError(null);
      try {
        const res = await fetch("/api/review/bulk", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ topicSlug: slug }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Масовото одобрение не беше успешно.");
          return;
        }
        setResolved((prev) => {
          const next = new Set(prev);
          for (const q of flagged) if (q.topicSlug === slug) next.add(q.id);
          return next;
        });
        startTransition(() => router.refresh());
      } catch {
        setError("Връзката пропадна. Опитай отново.");
      } finally {
        setBulkBusy(null);
      }
    },
    [flagged, visible, router, startTransition],
  );

  // Scroll + focus the active card (skip while an edit form owns the keyboard).
  useEffect(() => {
    if (effectiveFocusId === null || editingId !== null) return;
    const el = cardRefs.current.get(effectiveFocusId);
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const active = document.activeElement;
    const inField =
      active instanceof HTMLElement &&
      (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT");
    if (!inField) el.focus({ preventScroll: true });
  }, [effectiveFocusId, editingId]);

  // Global keyboard shortcuts. Registered every render so the handler always
  // closes over current state (buttons/inputs keep native behaviour).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingId !== null || bulkBusy !== null) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }
      const list = visible;
      if (list.length === 0) return;
      const idx =
        effectiveFocusId === null ? -1 : list.findIndex((q) => q.id === effectiveFocusId);

      if (e.code === "ArrowDown" || e.code === "KeyJ") {
        e.preventDefault();
        setFocusId(list[idx < 0 ? 0 : Math.min(idx + 1, list.length - 1)].id);
        return;
      }
      if (e.code === "ArrowUp" || e.code === "KeyK") {
        e.preventDefault();
        setFocusId(list[idx < 0 ? 0 : Math.max(idx - 1, 0)].id);
        return;
      }

      const focused = idx >= 0 ? list[idx] : null;
      if (!focused || busyId !== null) return;
      if (e.code === "KeyA") {
        e.preventDefault();
        approve(focused.id);
      } else if (e.code === "KeyR") {
        e.preventDefault();
        reject(focused.id);
      } else if (e.code === "KeyE") {
        e.preventDefault();
        startEdit(focused.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const remaining = visible.length;
  const reviewed = Math.max(0, baseline - remaining);
  const pct = baseline > 0 ? Math.round((reviewed / baseline) * 100) : 100;

  const groups = useMemo(() => {
    const map = new Map<string, { slug: string; titleBg: string; items: FlaggedQuestionDto[] }>();
    for (const q of visible) {
      let group = map.get(q.topicSlug);
      if (!group) {
        map.set(q.topicSlug, (group = { slug: q.topicSlug, titleBg: q.topicTitleBg, items: [] }));
      }
      group.items.push(q);
    }
    return [...map.values()];
  }, [visible]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-warning">
          Вътрешен инструмент · само за разработка
        </p>
        <h1 className="mt-1 text-2xl font-black sm:text-3xl">Преглед на въпроси</h1>
        <p className="mt-1 text-sm text-muted">
          Одобрените въпроси влизат в пробните изпити. Прегледай бележките на
          одиторите, поправи при нужда и одобри.
        </p>
      </header>

      {/* Progress */}
      <section
        aria-label="Напредък"
        className="card sticky top-2 z-20 flex flex-col gap-3 p-4 backdrop-blur sm:p-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-muted">
              Прегледани{" "}
              <span className="text-foreground">{reviewed}</span> от {baseline}
            </p>
            <p className="text-3xl font-black tabular-nums">
              {remaining > 0 ? (
                <>
                  <span className="text-accent">{remaining}</span>{" "}
                  <span className="text-base font-bold text-muted">остават</span>
                </>
              ) : (
                <span className="text-success">Готово!</span>
              )}
            </p>
          </div>
          <p className="hidden text-xs text-muted md:block">
            Клавиши:{" "}
            <Kbd>a</Kbd> одобри · <Kbd>e</Kbd> редактирай · <Kbd>r</Kbd> върни ·{" "}
            <Kbd>j</Kbd>/<Kbd>k</Kbd> навигация
          </p>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={baseline}
          aria-valuenow={reviewed}
          className="h-2 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="h-full rounded-full bg-accent transition-all motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>
      </section>

      {error !== null ? (
        <p
          role="alert"
          className="card border-danger/50 px-4 py-3 text-sm font-semibold text-danger"
        >
          {error}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <section className="card flex flex-col items-center gap-3 p-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success/15 text-success">
            <IconCheck className="h-7 w-7" />
          </span>
          <h2 className="text-lg font-extrabold">Няма въпроси за преглед</h2>
          <p className="max-w-md text-sm text-muted">
            Всички въпроси със статус „за преглед“ са обработени. Рестартирай
            сървъра, за да опресни съдържанието в приложението.
          </p>
        </section>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.slug} aria-labelledby={`topic-${group.slug}`} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
                <h2 id={`topic-${group.slug}`} className="text-lg font-extrabold">
                  {group.titleBg}{" "}
                  <span className="text-sm font-bold text-muted">
                    ({group.items.length})
                  </span>
                </h2>
                <button
                  type="button"
                  onClick={() => void bulkApprove(group.slug, group.titleBg)}
                  disabled={bulkBusy !== null || busyId !== null}
                  className="btn-ghost px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkBusy === group.slug
                    ? "Одобрявам…"
                    : `Одобри всички (${group.items.length})`}
                </button>
              </div>

              <ul className="flex flex-col gap-4">
                {group.items.map((q, i) => (
                  <li key={q.id}>
                    <QuestionCard
                      q={q}
                      number={i + 1}
                      focused={effectiveFocusId === q.id}
                      busy={busyId === q.id}
                      editing={editingId === q.id}
                      disabled={busyId !== null || bulkBusy !== null}
                      onApprove={approve}
                      onReject={reject}
                      onStartEdit={startEdit}
                      onCancelEdit={cancelEdit}
                      onSaveEdit={saveEdit}
                      registerRef={registerRef}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-bold text-foreground">
      {children}
    </kbd>
  );
}

// ---------------------------------------------------------------------------
// Question card (read view + inline edit)
// ---------------------------------------------------------------------------

interface CardProps {
  q: FlaggedQuestionDto;
  number: number;
  focused: boolean;
  busy: boolean;
  editing: boolean;
  disabled: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, patch: QuestionPatch) => Promise<boolean>;
  registerRef: (id: string, el: HTMLElement | null) => void;
}

const QuestionCard = function QuestionCard({
  q,
  number,
  focused,
  busy,
  editing,
  disabled,
  onApprove,
  onReject,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  registerRef,
}: CardProps) {
  return (
    <article
      ref={(el) => registerRef(q.id, el)}
      tabIndex={-1}
      aria-label={`Въпрос ${q.id}`}
      className={`card scroll-mt-28 p-4 outline-none transition sm:p-5 motion-reduce:transition-none ${
        focused ? "border-accent shadow-glow-sm" : ""
      } ${busy ? "opacity-60" : ""}`}
    >
      {/* Meta */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
        <span className="rounded-full bg-accent/15 px-2.5 py-1 text-accent">
          {q.type === "single" ? "Един верен" : "Няколко верни"}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-muted">
          {q.points} т.
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 font-mono text-muted">
          {q.id}
        </span>
        {q.conceptIds.map((c) => (
          <span key={c} className="rounded-full bg-surface-2 px-2.5 py-1 text-muted">
            {c}
          </span>
        ))}
      </div>

      {/* Auditor note */}
      {q.reviewNote !== null ? (
        <div className="mt-3 rounded-xl border border-warning/50 bg-warning/10 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-warning">
            Бележка от одитор
          </p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">{q.reviewNote}</p>
        </div>
      ) : null}

      {editing ? (
        <EditForm q={q} busy={busy} onCancel={onCancelEdit} onSave={onSaveEdit} />
      ) : (
        <>
          <p className="mt-3 text-base font-extrabold leading-snug">
            {number}. {q.textBg}
          </p>

          <ul className="mt-3 flex flex-col gap-2">
            {q.options.map((o) => (
              <li
                key={o.id}
                className={`flex items-start gap-3 rounded-xl border px-4 py-2.5 text-sm ${
                  o.correct
                    ? "border-success/50 bg-success/10"
                    : "border-border bg-surface-2/50 text-muted"
                }`}
              >
                <span
                  aria-hidden
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border bg-surface font-mono text-[10px] font-bold text-muted"
                >
                  {o.id}
                </span>
                <span className="min-w-0 flex-1 leading-relaxed">{o.textBg}</span>
                {o.correct ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-success">
                    <IconCheck className="h-4 w-4" />
                    верен
                  </span>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="mt-3 rounded-xl bg-surface-2/50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
              Обяснение
            </p>
            <p className="mt-1 text-sm leading-relaxed">{q.explanationClean}</p>
          </div>

          {q.lawRefs.length > 0 ? (
            <ul aria-label="Правни основания" className="mt-3 flex flex-wrap gap-1.5">
              {q.lawRefs.map((law, i) => (
                <li
                  key={`${law.act}-${law.ref}-${i}`}
                  className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-bold text-muted"
                >
                  {law.act} {law.ref}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onApprove(q.id)}
              disabled={disabled}
              className="btn-accent px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
            >
              {busy ? "Записвам…" : "Одобри"}
            </button>
            <button
              type="button"
              onClick={() => onStartEdit(q.id)}
              disabled={disabled}
              className="btn-ghost px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Редактирай
            </button>
            <button
              type="button"
              onClick={() => onReject(q.id)}
              disabled={disabled}
              className="btn-ghost px-4 py-2 text-sm text-danger hover:border-danger/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Върни в чернова
            </button>
          </div>
        </>
      )}
    </article>
  );
};

// ---------------------------------------------------------------------------
// Inline edit form
// ---------------------------------------------------------------------------

interface DraftOption {
  id: string;
  textBg: string;
  correct: boolean;
}

function nextOptionId(existing: string[]): string {
  for (let i = 0; i < 26; i++) {
    const id = String.fromCharCode(97 + i);
    if (!existing.includes(id)) return id;
  }
  let n = 1;
  while (existing.includes(`o${n}`)) n += 1;
  return `o${n}`;
}

function EditForm({
  q,
  busy,
  onCancel,
  onSave,
}: {
  q: FlaggedQuestionDto;
  busy: boolean;
  onCancel: () => void;
  onSave: (id: string, patch: QuestionPatch) => Promise<boolean>;
}) {
  const [textBg, setTextBg] = useState(q.textBg);
  const [type, setType] = useState(q.type);
  const [options, setOptions] = useState<DraftOption[]>(() =>
    q.options.map((o) => ({ ...o })),
  );
  const [explanationBg, setExplanationBg] = useState(q.explanationClean);
  const [lawRefs, setLawRefs] = useState(() => q.lawRefs.map((l) => ({ ...l })));
  const [formError, setFormError] = useState<string | null>(null);

  const changeType = (nextType: "single" | "multi") => {
    setType(nextType);
    if (nextType === "single") {
      const firstCorrect = options.findIndex((o) => o.correct);
      const keep = firstCorrect >= 0 ? firstCorrect : 0;
      setOptions((prev) => prev.map((o, i) => ({ ...o, correct: i === keep })));
    }
  };

  const setOptionText = (id: string, value: string) =>
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, textBg: value } : o)));

  const toggleCorrect = (id: string) =>
    setOptions((prev) =>
      type === "single"
        ? prev.map((o) => ({ ...o, correct: o.id === id }))
        : prev.map((o) => (o.id === id ? { ...o, correct: !o.correct } : o)),
    );

  const removeOption = (id: string) =>
    setOptions((prev) => (prev.length > 2 ? prev.filter((o) => o.id !== id) : prev));

  const addOption = () =>
    setOptions((prev) => [
      ...prev,
      { id: nextOptionId(prev.map((o) => o.id)), textBg: "", correct: false },
    ]);

  const setLawRef = (index: number, key: "act" | "ref", value: string) =>
    setLawRefs((prev) => prev.map((l, i) => (i === index ? { ...l, [key]: value } : l)));

  const removeLawRef = (index: number) =>
    setLawRefs((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const addLawRef = () => setLawRefs((prev) => [...prev, { act: "ЗДвП", ref: "" }]);

  const validate = (): string | null => {
    if (textBg.trim().length === 0) return "Текстът на въпроса е задължителен.";
    if (options.length < 2) return "Нужни са поне 2 отговора.";
    if (options.some((o) => o.textBg.trim().length === 0)) return "Всеки отговор трябва да има текст.";
    const correct = options.filter((o) => o.correct).length;
    if (type === "single" && correct !== 1) return "Въпрос с един верен трябва да има точно 1 верен отговор.";
    if (type === "multi" && correct < 2) return "Въпрос с няколко верни трябва да има поне 2 верни отговора.";
    if (explanationBg.trim().length === 0) return "Обяснението е задължително.";
    if (lawRefs.length < 1) return "Нужно е поне едно правно основание.";
    if (lawRefs.some((l) => l.act.trim().length === 0 || l.ref.trim().length === 0)) {
      return "Всяко правно основание трябва да има акт и член.";
    }
    return null;
  };

  const handleSave = async () => {
    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError(null);
    await onSave(q.id, {
      textBg: textBg.trim(),
      type,
      explanationBg: explanationBg.trim(),
      options: options.map((o) => ({ id: o.id, textBg: o.textBg.trim(), correct: o.correct })),
      lawRefs: lawRefs.map((l) => ({ act: l.act.trim(), ref: l.ref.trim() })),
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSave();
    }
  };

  const fieldClass =
    "w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <div
      className="mt-3 flex flex-col gap-4 rounded-xl border border-accent/40 bg-surface-2/30 p-3 sm:p-4"
      onKeyDown={onKeyDown}
    >
      <p className="text-[11px] font-bold uppercase tracking-wide text-accent">
        Редакция — записва и одобрява
      </p>

      {/* Question text */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-muted">Текст на въпроса</span>
        <textarea
          value={textBg}
          onChange={(e) => setTextBg(e.target.value)}
          rows={2}
          className={`${fieldClass} resize-y`}
        />
      </label>

      {/* Type */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-muted">Тип</span>
        <select
          value={type}
          onChange={(e) => changeType(e.target.value as "single" | "multi")}
          className={`${fieldClass} sm:w-64`}
        >
          <option value="single">Един верен отговор</option>
          <option value="multi">Няколко верни отговора</option>
        </select>
      </label>

      {/* Options */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold text-muted">
          Отговори ({type === "single" ? "избери един верен" : "избери всички верни"})
        </span>
        {options.map((o) => (
          <div key={o.id} className="flex items-center gap-2">
            <label className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-2 py-2">
              <input
                type={type === "single" ? "radio" : "checkbox"}
                name={`correct-${q.id}`}
                checked={o.correct}
                onChange={() => toggleCorrect(o.id)}
                className="h-4 w-4 accent-accent"
              />
              <span className="font-mono text-[11px] font-bold text-muted">{o.id}</span>
            </label>
            <input
              type="text"
              value={o.textBg}
              onChange={(e) => setOptionText(o.id, e.target.value)}
              className={fieldClass}
            />
            <button
              type="button"
              onClick={() => removeOption(o.id)}
              disabled={options.length <= 2}
              aria-label="Премахни отговора"
              className="shrink-0 rounded-lg border border-border p-2 text-muted transition hover:border-danger/50 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addOption}
          className="self-start rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-border-strong hover:text-foreground"
        >
          + Добави отговор
        </button>
      </div>

      {/* Explanation */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-muted">Обяснение (без бележката [REVIEW])</span>
        <textarea
          value={explanationBg}
          onChange={(e) => setExplanationBg(e.target.value)}
          rows={3}
          className={`${fieldClass} resize-y`}
        />
      </label>

      {/* Law refs */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold text-muted">Правни основания</span>
        {lawRefs.map((law, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={law.act}
              onChange={(e) => setLawRef(i, "act", e.target.value)}
              placeholder="акт (напр. ЗДвП)"
              className={`${fieldClass} sm:w-48`}
            />
            <input
              type="text"
              value={law.ref}
              onChange={(e) => setLawRef(i, "ref", e.target.value)}
              placeholder="член (напр. чл. 5)"
              className={fieldClass}
            />
            <button
              type="button"
              onClick={() => removeLawRef(i)}
              disabled={lawRefs.length <= 1}
              aria-label="Премахни основанието"
              className="shrink-0 rounded-lg border border-border p-2 text-muted transition hover:border-danger/50 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addLawRef}
          className="self-start rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-border-strong hover:text-foreground"
        >
          + Добави основание
        </button>
      </div>

      {formError !== null ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={busy}
          className="btn-accent px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
        >
          {busy ? "Записвам…" : "Запази и одобри"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="btn-ghost px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Отказ
        </button>
        <span className="ml-auto hidden text-xs text-muted sm:block">
          <Kbd>Esc</Kbd> отказ · <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> запази
        </span>
      </div>
    </div>
  );
}
