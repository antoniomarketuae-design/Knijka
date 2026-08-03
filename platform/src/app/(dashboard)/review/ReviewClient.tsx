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
import { IconCheck, IconLock, IconShield, IconX } from "@/components/icons";
import { CheckControl } from "@/components/ui/CheckControl";
import type {
  FlaggedListResult,
  FlaggedQuestionDto,
  LawRefEvidence,
  QuestionPatch,
  QuotedClaim,
  ReviewRisk,
  RiskTally,
} from "@/modules/content-admin/types";

/**
 * DEV-ONLY review console — the only place a question becomes human-approved.
 *
 * The screen is built around one number the founder has to make a launch
 * decision on: how many questions a student may be dealt on a flag A HUMAN
 * ACTUALLY SET. Every other element exists to move that number honestly and
 * fast: the row, what changed since the last commit, and the verbatim text of
 * every article it cites, retrieved from content/law — so the check is "does
 * the statute in front of me say what we say it says", not "does this feel
 * right".
 *
 * Keyboard (physical keys, layout-independent) for fast throughput:
 *   j / ↓  next     k / ↑  previous
 *   a  approve+sign      e  edit      r  send back
 */
export function ReviewClient({ result }: { result: FlaggedListResult }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const { flagged, census, queue, page, pageCount, total, risk } = result;

  const [resolved, setResolved] = useState<ReadonlySet<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signedThisSession, setSignedThisSession] = useState(0);

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
        setSignedThisSession((n) => n + 1);
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
      if (editingId !== null) return;
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

  /**
   * Grouped by RISK BAND, not by topic. The server now hands the queue back
   * ranked by what a wrong decision costs a student, and grouping by topic on
   * top of that would re-scatter the six moved answer keys back through the
   * syllabus — which is the exact problem the ranking exists to fix. The topic
   * still travels with each card, and ties inside a band keep curriculum order.
   */
  const groups = useMemo(() => {
    const map = new Map<ReviewRisk, { risk: ReviewRisk; items: FlaggedQuestionDto[] }>();
    for (const q of visible) {
      let group = map.get(q.diff.risk);
      if (!group) map.set(q.diff.risk, (group = { risk: q.diff.risk, items: [] }));
      group.items.push(q);
    }
    return [...map.values()];
  }, [visible]);

  const href = (nextQueue: string, nextPage: number) =>
    `/review?queue=${nextQueue}&page=${nextPage}`;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-warning">
          Вътрешен инструмент · само за разработка
        </p>
        <h1 className="mt-1 text-2xl font-black sm:text-3xl">Преглед на въпроси</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Одобряването тук е <strong className="text-foreground">подпис</strong>: записва
          се кой си, кога и върху кой точно текст. Пипне ли се въпросът после,
          подписът пада и редът се връща тук. „status: approved“ в самия файл вече
          не значи нищо само по себе си — генератор го е писал.
        </p>
      </header>

      <Census census={census} signedThisSession={signedThisSession} risk={risk} />

      {/* Queue switch */}
      <nav aria-label="Опашки" className="flex flex-wrap gap-2">
        <QueueTab
          href={href("needs-review", 1)}
          active={queue === "needs-review"}
          label="За поправка"
          count={census.needsReview + census.staleSignatures}
          hintBg="Одиторът или вълната поправки е намерила нещо конкретно."
        />
        <QueueTab
          href={href("unsigned", 1)}
          active={queue === "unsigned"}
          label="Неподписани"
          count={census.unsignedApproved}
          hintBg="Пише „approved“, но никой човек не го е задавал. Стигат до ученик още днес."
        />
      </nav>

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
          <h2 className="text-lg font-extrabold">Тази страница е изчистена</h2>
          <p className="max-w-md text-sm text-muted">
            {pageCount > page
              ? "Мини на следващата страница отдолу."
              : "Няма повече редове в тази опашка. Рестартирай сървъра, за да опресниш съдържанието в приложението."}
          </p>
        </section>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <section
              key={group.risk}
              aria-labelledby={`risk-${group.risk}`}
              className="flex flex-col gap-3"
            >
              <div
                className={`flex flex-wrap items-baseline justify-between gap-3 border-b-2 pb-2 ${RISK[group.risk].border}`}
              >
                <h2 id={`risk-${group.risk}`} className="text-lg font-extrabold">
                  <span className={RISK[group.risk].text}>{RISK[group.risk].titleBg}</span>{" "}
                  <span className="text-sm font-bold text-muted">
                    ({group.items.length} на тази страница · {risk[group.risk]} в опашката)
                  </span>
                </h2>
                <p className="max-w-xl text-xs leading-relaxed text-muted">
                  {RISK[group.risk].whyBg}
                </p>
              </div>

              <ul className="flex flex-col gap-4">
                {group.items.map((q) => (
                  <li key={q.id}>
                    <QuestionCard
                      q={q}
                      focused={effectiveFocusId === q.id}
                      busy={busyId === q.id}
                      editing={editingId === q.id}
                      disabled={busyId !== null}
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

      <Pager queue={queue} page={page} pageCount={pageCount} total={total} href={href} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk bands — the order the queue is worked in
// ---------------------------------------------------------------------------

/**
 * One entry per band, in the order the server ranks them. `whyBg` is the
 * reviewer's instruction for the band, not a description of it: what he is
 * being asked to decide changes completely between „the graded answer moved"
 * and „an article number was tidied".
 */
const RISK: Record<
  ReviewRisk,
  { titleBg: string; chipBg: string; whyBg: string; text: string; border: string; chip: string }
> = {
  "key-flip": {
    titleBg: "Сменен ключ",
    chipBg: "СМЕНЕН КЛЮЧ",
    whyBg:
      "Верният отговор е друг спрямо предишния коммит. Одобриш ли го грешно, ученикът губи точки за верен отговор. Виж ключа преди обяснението.",
    text: "text-danger",
    border: "border-danger/60",
    chip: "bg-danger/20 text-danger",
  },
  "answer-text": {
    titleBg: "Променен отговор",
    chipBg: "ПРОМЕНЕН ОТГОВОР",
    whyBg:
      "Ключът е същата буква, но текстът ѝ, типът или точките са различни — възможно е буквата вече да не значи същото.",
    text: "text-warning",
    border: "border-warning/60",
    chip: "bg-warning/20 text-warning",
  },
  stem: {
    titleBg: "Променен въпрос",
    chipBg: "ПРОМЕНЕН ВЪПРОС",
    whyBg: "Самата задача е преформулирана. Провери дали отговорите ѝ още пасват.",
    text: "text-warning",
    border: "border-warning/40",
    chip: "bg-warning/15 text-warning",
  },
  explanation: {
    titleBg: "Само обяснение",
    chipBg: "САМО ОБЯСНЕНИЕ",
    whyBg:
      "Ключът не е пипан. Проверява се THEO-4: обяснява ли решението като инструктор, и стои ли написаното в цитирания член.",
    text: "text-accent",
    border: "border-accent/40",
    chip: "bg-accent/15 text-accent",
  },
  citation: {
    titleBg: "Само цитати",
    chipBg: "САМО ЦИТАТИ",
    whyBg: "Само правните основания са пипани. Няма изпитен риск — сравни номерата с текста отдясно.",
    text: "text-muted",
    border: "border-border",
    chip: "bg-surface-2 text-muted",
  },
  untouched: {
    titleBg: "Без промяна от вълната",
    chipBg: "БЕЗ ПРОМЯНА",
    whyBg:
      "Чакаше в опашката още преди тази вълна и нищо не е пипано. Прочети го както си е.",
    text: "text-muted",
    border: "border-border",
    chip: "bg-surface-2 text-muted",
  },
};

/** Band order for the header tally — must match the server's ranking. */
const RISK_ORDER: ReviewRisk[] = [
  "key-flip",
  "answer-text",
  "stem",
  "explanation",
  "citation",
  "untouched",
];

// ---------------------------------------------------------------------------
// Header: the honest census
// ---------------------------------------------------------------------------

function Census({
  census,
  signedThisSession,
  risk,
}: {
  census: FlaggedListResult["census"];
  signedThisSession: number;
  risk: RiskTally;
}) {
  const reachable = census.humanApproved;
  const pct = census.total > 0 ? Math.round((reachable / census.total) * 1000) / 10 : 0;

  return (
    <section
      aria-label="Състояние на банката"
      className="card sticky top-2 z-20 flex flex-col gap-4 p-4 backdrop-blur sm:p-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-muted">
            Подписани от човек — единственото, което може да стигне до ученик
          </p>
          <p className="text-3xl font-black tabular-nums">
            <span className={reachable > 0 ? "text-success" : "text-danger"}>{reachable}</span>{" "}
            <span className="text-base font-bold text-muted">
              от {census.total} ({pct}%)
            </span>
          </p>
          {signedThisSession > 0 ? (
            <p className="mt-1 text-xs font-bold text-accent">
              +{signedThisSession} в тази сесия
            </p>
          ) : null}
        </div>
        <p className="hidden text-xs text-muted md:block">
          Клавиши: <Kbd>a</Kbd> одобри и подпиши · <Kbd>e</Kbd> редактирай ·{" "}
          <Kbd>r</Kbd> върни · <Kbd>j</Kbd>/<Kbd>k</Kbd> навигация
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={census.total}
        aria-valuenow={reachable}
        aria-label="Дял подписани от човек"
        className="h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className="h-full rounded-full bg-success transition-all motion-reduce:transition-none"
          style={{ width: `${census.total > 0 ? (reachable / census.total) * 100 : 0}%` }}
        />
      </div>

      <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-5">
        <Stat labelBg="Подписани" value={census.humanApproved} tone="success" />
        <Stat
          labelBg="Пише „approved“, без подпис"
          value={census.unsignedApproved}
          tone="danger"
        />
        <Stat labelBg="За поправка" value={census.needsReview} tone="warning" />
        <Stat labelBg="Само машинно проверени" value={census.machineChecked} tone="muted" />
        <Stat labelBg="Подпис след промяна" value={census.staleSignatures} tone="warning" />
      </dl>

      <RiskStrip risk={risk} />

      {census.unsignedApproved > 0 ? (
        <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs leading-relaxed text-foreground">
          <strong>{census.unsignedApproved}</strong> въпроса се раздават на ученици с
          етикет „одобрен“, който никой човек не е слагал. Таванът е замразен на{" "}
          <strong>{census.unsignedApprovedBaseline}</strong> —{" "}
          <code className="font-mono">validate:content</code> отказва да мине, ако
          числото порасне. Може само да пада, и то само от тази страница.
        </p>
      ) : null}
    </section>
  );
}

/**
 * The queue's risk profile, over the WHOLE backlog rather than the page.
 *
 * This is the line that decides how the founder spends the next hour: „6 сменени
 * ключа" is a twenty-minute job with real consequences, and it is a different
 * job from the 130 rows where only the teaching text moved.
 */
function RiskStrip({ risk }: { risk: RiskTally }) {
  const bands = RISK_ORDER.filter((band) => risk[band] > 0);
  if (bands.length === 0) return null;
  const total = bands.reduce((sum, band) => sum + risk[band], 0);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
        Опашката, подредена по риск за ученика — отгоре е това, което може да отреже
        верен отговор
      </p>
      <ul className="flex flex-wrap gap-2">
        {bands.map((band) => (
          <li
            key={band}
            className={`flex items-baseline gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold ${RISK[band].chip}`}
          >
            <span className="text-sm tabular-nums">{risk[band]}</span>
            <span>{RISK[band].titleBg}</span>
          </li>
        ))}
        <li className="flex items-baseline gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-muted">
          <span className="text-sm tabular-nums">{total}</span>
          <span>общо</span>
        </li>
      </ul>
    </div>
  );
}

const TONE: Record<string, string> = {
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  muted: "text-muted",
};

function Stat({ labelBg, value, tone }: { labelBg: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 px-3 py-2">
      <dt className="text-[11px] font-bold leading-tight text-muted">{labelBg}</dt>
      <dd className={`text-xl font-black tabular-nums ${TONE[tone] ?? ""}`}>{value}</dd>
    </div>
  );
}

function QueueTab({
  href,
  active,
  label,
  count,
  hintBg,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  hintBg: string;
}) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      title={hintBg}
      className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border text-muted hover:border-border-strong hover:text-foreground"
      }`}
    >
      {label} <span className="tabular-nums">({count})</span>
    </a>
  );
}

function Pager({
  queue,
  page,
  pageCount,
  total,
  href,
}: {
  queue: string;
  page: number;
  pageCount: number;
  total: number;
  href: (queue: string, page: number) => string;
}) {
  if (total === 0) return null;
  return (
    <nav
      aria-label="Страници"
      className="card flex flex-wrap items-center justify-between gap-3 p-4"
    >
      <p className="text-sm font-bold text-muted">
        Страница <span className="text-foreground tabular-nums">{page}</span> от{" "}
        <span className="tabular-nums">{pageCount}</span> ·{" "}
        <span className="tabular-nums">{total}</span> реда в тази опашка
      </p>
      <div className="flex gap-2">
        <a
          href={href(queue, Math.max(1, page - 1))}
          aria-disabled={page <= 1}
          className={`btn-ghost px-4 py-2 text-sm ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
        >
          ← Предишна
        </a>
        <a
          href={href(queue, Math.min(pageCount, page + 1))}
          aria-disabled={page >= pageCount}
          className={`btn-accent px-4 py-2 text-sm ${page >= pageCount ? "pointer-events-none opacity-40" : ""}`}
        >
          Следваща →
        </a>
      </div>
    </nav>
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
        <span className={`rounded-full px-2.5 py-1 ${RISK[q.diff.risk].chip}`}>
          {RISK[q.diff.risk].chipBg}
        </span>
        <ApprovalBadge approval={q.approval} status={q.status} />
        <span className="rounded-full bg-accent/15 px-2.5 py-1 text-accent">
          {q.type === "single" ? "Един верен" : "Няколко верни"}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-muted">
          {q.points} т.
        </span>
        {/* The queue is no longer grouped by topic, so the topic rides here. */}
        <span className="rounded-full border border-border px-2.5 py-1 text-muted">
          {q.topicTitleBg}
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

      {editing ? (
        <EditForm q={q} busy={busy} onCancel={onCancelEdit} onSave={onSaveEdit} />
      ) : (
        <>
          {/* THE ONE THING THAT CANNOT BE MISSED. Before this the moved key was
              a ✔ that had shifted one line inside a six-field diff blob. */}
          <KeyFlipBanner q={q} />

          <p className="mt-3 text-base font-extrabold leading-snug">{q.textBg}</p>

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

          <ChangeSummary q={q} />
          <AuditorNote note={q.reviewNote} openByDefault={q.diff.risk === "key-flip"} />

          <div className="mt-3 rounded-xl bg-surface-2/50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
              Обяснение
            </p>
            <p className="mt-1 text-sm leading-relaxed">{q.explanationClean}</p>
          </div>

          <QuoteCheck claims={q.quotedClaims} />
          <LawEvidence evidence={q.lawEvidence} />

          {/* STICKY, and that is the point. A card runs 2,000–3,500px because
              the statute is on it (ADR-002) — measured 3,480px for the first
              key-flip row — which put „Одобри и подпиши" 3.4 screens below the
              question. The reviewer still has to scroll the evidence, but the
              decision is never further away than the bottom of the screen. */}
          <div className="sticky bottom-0 -mx-4 mt-4 flex flex-wrap items-center gap-2 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5">
            <button
              type="button"
              onClick={() => onApprove(q.id)}
              disabled={disabled}
              className="btn-accent px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
            >
              {busy ? "Записвам…" : "Одобри и подпиши"}
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
              Върни за преправяне
            </button>
            {/* Which row these buttons belong to — with a sticky bar the
                question that owns them is usually scrolled off the top. */}
            <span className="ml-auto hidden font-mono text-[11px] font-bold text-muted sm:block">
              {q.id}
            </span>
          </div>
        </>
      )}
    </article>
  );
};

function ApprovalBadge({
  approval,
  status,
}: {
  approval: FlaggedQuestionDto["approval"];
  status: FlaggedQuestionDto["status"];
}) {
  if (approval.kind === "human-approved") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-success">
        <IconShield className="h-3.5 w-3.5" />
        подписан от {approval.entry.by}
      </span>
    );
  }
  if (approval.kind === "signature-stale") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-warning">
        <IconLock className="h-3.5 w-3.5" />
        подписът падна — редът е променян след {approval.entry.at.slice(0, 10)}
      </span>
    );
  }
  if (approval.kind === "human-rejected") {
    return (
      <span className="rounded-full bg-danger/15 px-2.5 py-1 text-danger">
        върнат от {approval.entry.by}
      </span>
    );
  }
  if (approval.kind === "unsigned-claim") {
    return (
      <span className="rounded-full bg-danger/15 px-2.5 py-1 text-danger">
        пише „approved“ — никой не го е подписвал
      </span>
    );
  }
  return (
    <span className="rounded-full border border-border px-2.5 py-1 text-muted">
      {status} · без подпис
    </span>
  );
}

/**
 * The moved answer key, stated as letters, above everything else on the card.
 *
 * Six of the 252 queued rows have one. In the six-field before/after blob a key
 * flip looked exactly like a reworded option: a ✔ that had moved one line
 * inside a paragraph of struck-through text. This says it in the two things
 * that decide the grade — which letters were correct, which are now.
 */
function KeyFlipBanner({ q }: { q: FlaggedQuestionDto }) {
  const { keyChange } = q.diff;
  if (keyChange === null) return null;
  const letters = (key: string) => (key.length === 0 ? "нищо" : key.split(",").join(" + "));

  return (
    <div className="mt-3 rounded-xl border-2 border-danger/60 bg-danger/10 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-danger">
        Верният отговор е сменен спрямо {q.diff.baseRef}
      </p>
      <p className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-sm font-black">
        <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-muted line-through decoration-danger/70">
          {letters(keyChange.before)}
        </span>
        <span aria-hidden className="text-danger">
          →
        </span>
        <span className="rounded-lg bg-success/15 px-2.5 py-1 text-success">
          {letters(keyChange.after)}
        </span>
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-foreground">
        Одобриш ли това, всеки ученик, който отговори по стария ключ, губи точките.
        Провери отговорите срещу текста на закона отдолу, преди да подпишеш.
      </p>
    </div>
  );
}

/**
 * The auditor's note, collapsed by default.
 *
 * These notes are the fix wave's working record — 600 to 1,000 characters of
 * „БЕШЕ … СЕГА … ИЗТОЧНИК …". Rendered open they pushed the question itself
 * ~700px down the card, so the founder met the agent's reasoning before he met
 * the row he is judging. It stays one click away, and opens by itself where it
 * matters most: a moved key.
 */
function AuditorNote({ note, openByDefault }: { note: string | null; openByDefault: boolean }) {
  if (note === null) return null;
  const gist = note.length > 110 ? `${note.slice(0, 110).trimEnd()}…` : note;
  return (
    <details open={openByDefault} className="group mt-3 rounded-xl border border-warning/50 bg-warning/10">
      <summary className="cursor-pointer list-none p-3 text-xs leading-relaxed text-foreground marker:content-none">
        <span className="text-[11px] font-bold uppercase tracking-wide text-warning">
          Бележка от одитор
        </span>{" "}
        <span className="text-muted group-open:hidden">{gist}</span>
        <span className="hidden text-muted group-open:inline">(скрий)</span>
      </summary>
      <p className="whitespace-pre-wrap px-3 pb-3 text-sm leading-relaxed text-foreground">
        {note}
      </p>
    </details>
  );
}

/**
 * What changed since the baseline commit. The fix waves rewrite explanations
 * and swap article numbers wholesale; re-reading a 700-character explanation
 * from scratch is what turns ten seconds into two minutes.
 */
function ChangeSummary({ q }: { q: FlaggedQuestionDto }) {
  const { diff } = q;

  if (diff.kind === "unavailable") {
    return (
      <p className="mt-3 rounded-xl border border-border bg-surface-2/40 px-3 py-2 text-xs text-muted">
        {diff.unavailableReasonBg}
      </p>
    );
  }
  if (diff.kind === "new") {
    return (
      <p className="mt-3 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-bold text-accent">
        Нов въпрос — не съществува в {diff.baseRef}.
      </p>
    );
  }
  if (diff.kind === "unchanged") {
    return (
      <p className="mt-3 rounded-xl border border-border bg-surface-2/40 px-3 py-2 text-xs text-muted">
        Без промяна спрямо {diff.baseRef}
        {diff.beforeStatus !== null ? ` · статус там: ${diff.beforeStatus}` : ""}.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-accent/40 bg-accent/5 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-accent">
        Какво се промени спрямо {diff.baseRef}
        {diff.beforeStatus !== null ? ` (там беше „${diff.beforeStatus}“)` : ""}
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {diff.changes.map((change) => (
          <li key={change.field}>
            <p className="text-[11px] font-bold text-muted">{change.labelBg}</p>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted line-through decoration-danger/60">
              {change.before}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
              {change.after}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Every „…“ span in the explanation, tested verbatim against the retrieved text
 * of the articles this row cites. A span that matches nothing is how you catch
 * a number nobody can find in the law — the fabricated 50-metre level-crossing
 * rule was exactly that shape (docs/education/90 §4.3).
 */
function QuoteCheck({ claims }: { claims: QuotedClaim[] }) {
  if (claims.length === 0) return null;
  // Matches first: a wall of green above the one amber line is what makes the
  // amber line worth looking at. A miss is a PROMPT, not a verdict — plenty of
  // quoted spans are our own turns of phrase, not statute.
  const ordered = [...claims].sort(
    (a, b) => Number(b.foundInRef !== null) - Number(a.foundInRef !== null),
  );
  return (
    <ul aria-label="Проверка на цитатите" className="mt-3 flex flex-col gap-1.5">
      {ordered.map((claim) => (
        <li
          key={claim.quote}
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed ${
            claim.foundInRef !== null
              ? "border-success/40 bg-success/5"
              : "border-warning/50 bg-warning/10"
          }`}
        >
          <span className="mt-0.5 shrink-0 font-bold">
            {claim.foundInRef !== null ? (
              <IconCheck className="h-4 w-4 text-success" />
            ) : (
              <IconX className="h-4 w-4 text-warning" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="italic">„{claim.quote}“</span>{" "}
            {claim.foundInRef !== null ? (
              <span className="text-muted">— дословно в {claim.foundInRef}</span>
            ) : (
              <span className="font-bold text-warning">
                — не се среща в текста на цитираните членове. Ако е цитат от закона,
                нещо не е наред; ако е наш израз, всичко е наред.
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The verbatim source line: retrieved statute text, never restated (ADR-002). */
function LawEvidence({ evidence }: { evidence: LawRefEvidence[] }) {
  if (evidence.length === 0) return null;
  return (
    <section aria-label="Източникът, дословно" className="mt-3 flex flex-col gap-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
        Източникът, дословно
      </p>
      {evidence.map((law, i) => (
        <article
          key={`${law.act}-${law.ref}-${i}`}
          className={`rounded-xl border p-3 ${
            law.found ? "border-border bg-surface-2/40" : "border-warning/50 bg-warning/10"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
            <span className="text-foreground">
              {law.act} {law.ref}
            </span>
            {law.unverified ? (
              <span className="rounded-full bg-warning/20 px-2 py-0.5 text-warning">
                „?“ — авторът не е бил сигурен
              </span>
            ) : null}
            {law.contextBg !== null ? (
              <span className="text-muted">{law.contextBg}</span>
            ) : null}
          </div>

          {law.found ? (
            <>
              <p className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-surface px-3 py-2 font-serif text-xs leading-relaxed text-foreground">
                {law.textBg}
                {law.truncated ? (
                  <span className="text-muted"> (съкратено за екрана)</span>
                ) : null}
              </p>
              <p className="mt-1.5 text-[11px] text-muted">
                {law.citationBg}
                {law.sourceUrl !== null ? (
                  <>
                    {" · "}
                    <a
                      href={law.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline hover:text-foreground"
                    >
                      източник
                    </a>
                  </>
                ) : null}
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-foreground">{law.missReasonBg}</p>
          )}
        </article>
      ))}
    </section>
  );
}

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
        Редакция — записва, подписва и одобрява
      </p>

      {/* The statute stays on screen while editing — the point of the edit is
          usually to make the text match what the article actually says. */}
      <LawEvidence evidence={q.lawEvidence} />

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
              {/* Marks which option is the CORRECT one — the reviewer's most
                  consequential click on this screen, and the one that most
                  needs a box you can see is empty. Shape still carries arity,
                  so flipping the question type visibly reshapes these. */}
              <CheckControl
                type={type === "single" ? "radio" : "checkbox"}
                name={`correct-${q.id}`}
                checked={o.correct}
                onChange={() => toggleCorrect(o.id)}
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
          {busy ? "Записвам…" : "Запази и подпиши"}
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
