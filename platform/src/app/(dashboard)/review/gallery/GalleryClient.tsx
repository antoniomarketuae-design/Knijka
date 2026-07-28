"use client";

/**
 * GalleryClient — the founder's visual review surface.
 *
 * The problem it solves, in his words: „to answer the rest I need
 * visualisations… I have to review all our 150 questions visually to have a
 * good verdict." The verdict board already lists the work; this shows it.
 *
 * Design constraints that actually shaped the layout:
 *
 *  - PHONE FIRST. He reviews on his phone. One column, full-bleed image, both
 *    verdict buttons inside thumb reach at the bottom of every card, filters on
 *    a single horizontally-scrolling row, no hover-only affordance anywhere.
 *  - LOOK, THEN RULE. The still is the largest thing on the card; ids and
 *    metadata are secondary. Tapping the still opens it full-screen, because a
 *    390 px-wide phone cannot resolve a lane marking at card size.
 *  - HONEST GAPS. Anything not rendered says so on the card AND is counted in
 *    its own tab. Nothing is quietly omitted — a review of a filtered subset
 *    would produce a false verdict, which is worse than no verdict.
 *  - NOTHING IS LOST. Verdicts and notes save to localStorage on every change
 *    (verdictStore), import what the old board collected, and the ✗ list
 *    exports as copyable Markdown / a downloadable .md + a JSON backup.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import dynamic from "next/dynamic";
import type { GalleryIndex, GalleryQuestion, GalleryReel, GalleryScenario } from "./galleryData";
import {
  getVerdictsServerSnapshot,
  getVerdictsSnapshot,
  KEY_CLIP,
  KEY_QUESTION,
  KEY_SCENARIO,
  subscribeVerdicts,
  updateVerdicts,
  type Verdict,
  type VerdictMap,
} from "./verdictStore";

/** The 2D canvas fallback for a question whose 3D still was never rendered.
 *  Dynamic: it reaches the replay core, which no card should pay for unless a
 *  render is genuinely missing. */
const SceneStill = dynamic(
  () => import("@/components/theory/SceneStill").then((m) => ({ default: m.SceneStill })),
  { ssr: false, loading: () => <StillPlaceholder label="Зарежда схемата…" /> },
);

type Tab = "scenarios" | "questions" | "gaps" | "export";

/** Cards mounted per "покажи още" step (see `limit` in GalleryClient). */
const PAGE = 30;

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

function StillPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-border bg-surface-2/40 px-4 text-center text-xs font-bold text-muted">
      {label}
    </div>
  );
}

function Chip({ children, tone = "n" }: { children: React.ReactNode; tone?: "n" | "warn" }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
        tone === "warn"
          ? "border-amber-500/50 bg-amber-500/10 text-amber-600"
          : "border-border bg-surface text-muted"
      }`}
    >
      {children}
    </span>
  );
}

/** ✓ / ✗ pair. Deliberately 48 px tall and full width — this is the one control
 *  the founder taps 200+ times, on a phone, probably one-handed. */
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
        className={`min-h-12 flex-1 rounded-xl border px-3 text-sm font-bold transition motion-reduce:transition-none ${
          value === "ok"
            ? "border-success bg-success/15 text-success"
            : "border-border bg-surface text-muted"
        }`}
      >
        ✓ Добър
      </button>
      <button
        type="button"
        onClick={() => onChange(value === "problem" ? null : "problem")}
        aria-pressed={value === "problem"}
        className={`min-h-12 flex-1 rounded-xl border px-3 text-sm font-bold transition motion-reduce:transition-none ${
          value === "problem"
            ? "border-danger bg-danger/15 text-danger"
            : "border-border bg-surface text-muted"
        }`}
      >
        ✗ Проблем
      </button>
    </div>
  );
}

/** The note box, shown only after a ✗ — that is when there is something to say. */
function NoteBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="hud-label">Какво не е наред</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder="напр. колата е извън платното / знакът не се вижда"
        className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/70"
      />
    </label>
  );
}

/** Tail of a paged list. Silent once everything filtered in is on screen. */
function ShowMore({
  shown,
  total,
  onMore,
}: {
  shown: number;
  total: number;
  onMore: () => void;
}) {
  if (shown >= total) return null;
  return (
    <button
      type="button"
      onClick={onMore}
      className="min-h-12 w-full rounded-xl border border-accent bg-accent/10 px-4 text-sm font-bold text-accent"
    >
      Покажи още ({total - shown} остават)
    </button>
  );
}

// ---------------------------------------------------------------------------
// Lightbox — a phone cannot judge a lane marking at card width
// ---------------------------------------------------------------------------

function Lightbox({
  src,
  caption,
  onClose,
}: {
  src: string;
  caption: string;
  onClose: () => void;
}) {
  const [big, setBig] = useState(false);
  const panRef = useRef<HTMLDivElement>(null);

  // Zooming in from the top-left corner lands on grass; the situation is in
  // the middle of the frame, so recentre the pan box whenever the scale flips.
  useEffect(() => {
    const el = panRef.current;
    if (!el) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  }, [big, src]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={caption}
      className="fixed inset-0 z-50 flex flex-col bg-black"
    >
      {/*
        A 16:9 still shown "full width" on a 390 px phone is the same size it
        already was on the card — useless. So the frame lives in a pannable
        box and the button below blows it up to 2.6×, which is what it takes to
        read a lane marking or a sign face on a phone.
      */}
      <div ref={panRef} className="flex flex-1 items-center overflow-auto p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={caption}
          className={`rounded-xl ${big ? "w-[260%] max-w-none sm:w-[150%]" : "w-full"}`}
        />
      </div>
      <p className="px-3 pb-1 text-center text-xs text-white/80">{caption}</p>
      <div className="flex gap-2 p-3 pt-1">
        <button
          type="button"
          onClick={() => setBig((v) => !v)}
          aria-pressed={big}
          className="min-h-12 flex-1 rounded-xl border border-white/40 px-4 text-sm font-bold text-white"
        >
          {big ? "Намали" : "Уголеми"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-12 flex-1 rounded-xl border border-white/40 bg-white/10 px-4 text-sm font-bold text-white"
        >
          Затвори
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reels (only where one was actually produced)
// ---------------------------------------------------------------------------

function ReelBlock({
  reel,
  verdict,
  onVerdict,
  onZoom,
}: {
  reel: GalleryReel;
  verdict: Verdict | null;
  onVerdict: (v: Verdict | null) => void;
  onZoom: (src: string, caption: string) => void;
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-surface-2/30 p-2.5">
      <p className="text-xs font-bold text-foreground">🎬 {reel.titleBg}</p>
      {!reel.fileOnDisk ? (
        <p className="mt-1 text-[11px] text-amber-600">
          Манифестът го описва, но файлът липсва на този сървър — качи клиповете
          (scp) и презареди.
        </p>
      ) : playing ? (
        <video
          src={reel.src}
          poster={reel.posterUrl ?? undefined}
          controls
          autoPlay
          playsInline
          preload="metadata"
          className="mt-1.5 aspect-video w-full rounded-lg bg-black"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="relative mt-1.5 block w-full overflow-hidden rounded-lg"
          aria-label={`Пусни клипа: ${reel.titleBg}`}
        >
          {reel.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={reel.posterUrl}
              alt=""
              loading="lazy"
              className="aspect-video w-full bg-black object-cover"
            />
          ) : (
            <div className="aspect-video w-full bg-black" />
          )}
          <span className="absolute inset-0 flex items-center justify-center text-4xl text-white drop-shadow-lg">
            ▶
          </span>
        </button>
      )}

      {reel.keyframes.length > 0 ? (
        <div className="mt-1.5 flex gap-1 overflow-x-auto">
          {reel.keyframes.map((k, i) => (
            <button
              key={k}
              type="button"
              onClick={() => onZoom(k, `${reel.titleBg} · кадър ${i + 1}/${reel.keyframes.length}`)}
              className="shrink-0"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={k}
                alt={`кадър ${i + 1}`}
                loading="lazy"
                className={`h-12 w-20 rounded object-cover ${i === 2 ? "ring-2 ring-danger" : ""}`}
              />
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-2">
        <VerdictButtons value={verdict} onChange={onVerdict} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scenario card
// ---------------------------------------------------------------------------

function ScenarioCard({
  item,
  verdicts,
  setVerdict,
  setNote,
  onZoom,
}: {
  item: GalleryScenario;
  verdicts: VerdictMap;
  setVerdict: (key: string, v: Verdict | null) => void;
  setNote: (key: string, note: string) => void;
  onZoom: (src: string, caption: string) => void;
}) {
  const [openReels, setOpenReels] = useState(false);
  const key = KEY_SCENARIO(item.id);
  const entry = verdicts[key] ?? null;
  const reels = item.mistakes.filter((m) => m.reel !== null);

  return (
    <article
      id={item.id}
      className={`flex flex-col gap-2.5 rounded-2xl border bg-surface p-3 ${
        entry?.v === "problem"
          ? "border-danger/60"
          : entry?.v === "ok"
            ? "border-success/50"
            : "border-border"
      }`}
    >
      {item.stillUrl ? (
        <button
          type="button"
          onClick={() => onZoom(item.stillUrl!, `${item.id} — ${item.titleBg}`)}
          className="block w-full overflow-hidden rounded-xl"
          aria-label={`Уголеми кадъра на ${item.titleBg}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.stillUrl}
            alt={`Сцена: ${item.titleBg}`}
            loading="lazy"
            decoding="async"
            className="aspect-video w-full bg-surface-2 object-cover"
          />
        </button>
      ) : (
        <StillPlaceholder label="Кадърът не е рендиран още" />
      )}

      <div>
        <h3 className="font-display text-base font-black leading-tight">{item.titleBg}</h3>
        <p className="mt-0.5 font-mono text-[11px] text-muted">{item.id}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">{item.objectiveBg}</p>
      </div>

      <div className="flex flex-wrap gap-1">
        <Chip>{item.family}</Chip>
        <Chip>карта: {item.districtId}</Chip>
        {item.archetypeIds.map((a) => (
          <Chip key={a}>{a}</Chip>
        ))}
        <Chip>{item.lawRefBg}</Chip>
        {item.reelGaps > 0 ? <Chip tone="warn">{item.reelGaps} без клип</Chip> : null}
      </div>

      {item.mistakes.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setOpenReels((v) => !v)}
            aria-expanded={openReels}
            className="min-h-11 w-full rounded-xl border border-border bg-surface-2/40 px-3 text-xs font-bold text-muted"
          >
            {openReels ? "▾" : "▸"} Грешки: {item.mistakes.length} · клипове:{" "}
            {reels.length}/{item.mistakes.length}
          </button>

          {openReels ? (
            <div className="mt-2 flex flex-col gap-2">
              {item.mistakes.map((m) =>
                m.reel ? (
                  <ReelBlock
                    key={m.index}
                    reel={m.reel}
                    verdict={verdicts[KEY_CLIP(m.reel.id)]?.v ?? null}
                    onVerdict={(v) => setVerdict(KEY_CLIP(m.reel!.id), v)}
                    onZoom={onZoom}
                  />
                ) : (
                  <div
                    key={m.index}
                    className="rounded-xl border border-dashed border-border bg-surface-2/20 p-2.5"
                  >
                    <p className="text-xs font-bold text-foreground">{m.titleBg}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                      {m.whatWentWrongBg}
                    </p>
                    <p className="mt-1 text-[11px] font-bold text-amber-600">
                      Клипът не е рендиран още
                    </p>
                  </div>
                ),
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <VerdictButtons value={entry?.v ?? null} onChange={(v) => setVerdict(key, v)} />
      {entry?.v === "problem" ? (
        <NoteBox value={entry.note ?? ""} onChange={(n) => setNote(key, n)} />
      ) : null}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Question card
// ---------------------------------------------------------------------------

function QuestionCard({
  item,
  verdicts,
  setVerdict,
  setNote,
  onZoom,
}: {
  item: GalleryQuestion;
  verdicts: VerdictMap;
  setVerdict: (key: string, v: Verdict | null) => void;
  setNote: (key: string, note: string) => void;
  onZoom: (src: string, caption: string) => void;
}) {
  const key = KEY_QUESTION(item.id);
  const entry = verdicts[key] ?? null;
  const signSrc = item.signRef ? `/api/signs/${encodeURIComponent(item.signRef)}` : null;

  return (
    <article
      id={item.id}
      className={`flex flex-col gap-2.5 rounded-2xl border bg-surface p-3 ${
        entry?.v === "problem"
          ? "border-danger/60"
          : entry?.v === "ok"
            ? "border-success/50"
            : "border-border"
      }`}
    >
      {signSrc ? (
        <button
          type="button"
          onClick={() => onZoom(signSrc, `${item.id} — ${item.textBg}`)}
          className="flex items-center justify-center rounded-xl border border-border bg-white p-4"
          aria-label="Уголеми знака"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={signSrc} alt="Пътен знак" loading="lazy" className="h-32 w-32" />
        </button>
      ) : item.stillUrl ? (
        <button
          type="button"
          onClick={() => onZoom(item.stillUrl!, `${item.id} — ${item.textBg}`)}
          className="block w-full overflow-hidden rounded-xl"
          aria-label="Уголеми кадъра"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.stillUrl}
            alt="Сцена към въпроса"
            loading="lazy"
            decoding="async"
            className="aspect-video w-full bg-surface-2 object-cover"
          />
        </button>
      ) : item.sceneStill ? (
        <div>
          <SceneStill media={item.sceneStill} />
          <p className="mt-1 text-[11px] font-bold text-amber-600">
            3D кадърът не е рендиран — това е 2D схемата от приложението
          </p>
        </div>
      ) : (
        <StillPlaceholder label="Няма картинка" />
      )}

      <div>
        <p className="text-sm font-bold leading-snug">{item.textBg}</p>
        <p className="mt-0.5 font-mono text-[11px] text-muted">{item.id}</p>
      </div>

      {item.correctBg.length > 0 ? (
        <p className="rounded-xl border border-success/40 bg-success/10 px-2.5 py-1.5 text-xs leading-relaxed text-success">
          Верен отговор: {item.correctBg.join(" · ")}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1">
        <Chip>{item.group}</Chip>
        <Chip>{item.mediaKind === "sign" ? "знак" : "сцена"}</Chip>
        {item.needsReview ? <Chip tone="warn">чака преглед</Chip> : null}
      </div>

      <VerdictButtons value={entry?.v ?? null} onChange={(v) => setVerdict(key, v)} />
      {entry?.v === "problem" ? (
        <NoteBox value={entry.note ?? ""} onChange={(n) => setNote(key, n)} />
      ) : null}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Export — the ✗ list he hands back
// ---------------------------------------------------------------------------

function buildProblemReport(index: GalleryIndex, verdicts: VerdictMap): string {
  const lines: string[] = [];
  const at = new Date().toISOString().slice(0, 16).replace("T", " ");
  lines.push(`# Присъда на основателя — ✗ списък (${at})`, "");

  const scen = index.scenarios.filter((s) => verdicts[KEY_SCENARIO(s.id)]?.v === "problem");
  lines.push(`## Сценарии (${scen.length})`, "");
  if (scen.length === 0) lines.push("_няма_", "");
  for (const s of scen) {
    const note = verdicts[KEY_SCENARIO(s.id)]?.note;
    lines.push(`- \`${s.id}\` — ${s.titleBg} (карта: ${s.districtId})${note ? ` — ${note}` : ""}`);
  }
  lines.push("");

  const reels: string[] = [];
  for (const s of index.scenarios) {
    for (const m of s.mistakes) {
      if (m.reel && verdicts[KEY_CLIP(m.reel.id)]?.v === "problem") {
        const note = verdicts[KEY_CLIP(m.reel.id)]?.note;
        reels.push(`- \`${m.reel.id}\` — ${m.titleBg}${note ? ` — ${note}` : ""}`);
      }
    }
  }
  lines.push(`## Клипове (${reels.length})`, "", ...(reels.length ? reels : ["_няма_"]), "");

  const qs = index.questions.filter((q) => verdicts[KEY_QUESTION(q.id)]?.v === "problem");
  lines.push(`## Въпроси с картинка (${qs.length})`, "");
  if (qs.length === 0) lines.push("_няма_", "");
  for (const q of qs) {
    const note = verdicts[KEY_QUESTION(q.id)]?.note;
    lines.push(`- \`${q.id}\` — ${q.textBg.slice(0, 90)}${note ? ` — ${note}` : ""}`);
  }
  lines.push("");

  const missingStills = index.scenarios.filter((s) => s.stillUrl === null);
  const missingReels = index.scenarios.reduce((n, s) => n + s.reelGaps, 0);
  lines.push(
    "## Още нерендирано (не е присъда — състояние)",
    "",
    `- сценарии без кадър: ${missingStills.length}`,
    `- грешки без клип: ${missingReels}`,
    "",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// The page body
// ---------------------------------------------------------------------------

export function GalleryClient({ index }: { index: GalleryIndex }) {
  const [tab, setTab] = useState<Tab>("scenarios");
  // localStorage is an external store, not derived state — see verdictStore.
  const verdicts = useSyncExternalStore(
    subscribeVerdicts,
    getVerdictsSnapshot,
    getVerdictsServerSnapshot,
  );
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<string | null>(null);
  const [onlyUnjudged, setOnlyUnjudged] = useState(false);
  const [zoom, setZoom] = useState<{ src: string; caption: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const listTop = useRef<HTMLDivElement>(null);
  /**
   * How many cards are mounted. 155 scenario cards at once is ~3 000 DOM nodes
   * and 155 image requests on a phone; the founder only ever looks at the top
   * of the list anyway, and the family filters cut it to ~10–20 each.
   */
  const [limit, setLimit] = useState(PAGE);

  const setVerdict = useCallback((key: string, v: Verdict | null) => {
    updateVerdicts((prev) => {
      const next = { ...prev };
      if (v === null) delete next[key];
      else next[key] = { ...next[key], v, at: Date.now() };
      return next;
    });
  }, []);

  const setNote = useCallback((key: string, note: string) => {
    updateVerdicts((prev) => {
      const cur = prev[key];
      if (!cur) return prev;
      return { ...prev, [key]: { ...cur, note: note === "" ? undefined : note } };
    });
  }, []);

  const onZoom = useCallback((src: string, caption: string) => setZoom({ src, caption }), []);

  // --- tallies -------------------------------------------------------------
  const tally = useMemo(() => {
    const count = (keys: string[]) => {
      let ok = 0;
      let problem = 0;
      for (const k of keys) {
        const v = verdicts[k]?.v;
        if (v === "ok") ok += 1;
        else if (v === "problem") problem += 1;
      }
      return { ok, problem, total: keys.length, left: keys.length - ok - problem };
    };
    const clipKeys: string[] = [];
    for (const s of index.scenarios) {
      for (const m of s.mistakes) if (m.reel) clipKeys.push(KEY_CLIP(m.reel.id));
    }
    return {
      scenarios: count(index.scenarios.map((s) => KEY_SCENARIO(s.id))),
      questions: count(index.questions.map((q) => KEY_QUESTION(q.id))),
      clips: count(clipKeys),
    };
  }, [index, verdicts]);

  const families = useMemo(
    () => [...new Set(index.scenarios.map((s) => s.family))].sort(),
    [index.scenarios],
  );

  const shownScenarios = useMemo(() => {
    const q = query.trim().toLowerCase();
    return index.scenarios.filter((s) => {
      if (family && s.family !== family) return false;
      if (onlyUnjudged && verdicts[KEY_SCENARIO(s.id)]) return false;
      if (q === "") return true;
      return (
        s.id.toLowerCase().includes(q) ||
        s.titleBg.toLowerCase().includes(q) ||
        s.tagsBg.some((t) => t.toLowerCase().includes(q)) ||
        s.districtId.toLowerCase().includes(q)
      );
    });
  }, [index.scenarios, family, onlyUnjudged, query, verdicts]);

  const shownQuestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return index.questions.filter((it) => {
      if (onlyUnjudged && verdicts[KEY_QUESTION(it.id)]) return false;
      if (q === "") return true;
      return it.id.toLowerCase().includes(q) || it.textBg.toLowerCase().includes(q);
    });
  }, [index.questions, onlyUnjudged, query, verdicts]);

  const report = useMemo(() => buildProblemReport(index, verdicts), [index, verdicts]);

  const copyReport = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [report]);

  const download = useCallback((name: string, text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const done = tally.scenarios.ok + tally.scenarios.problem;
  const pct = tally.scenarios.total === 0 ? 0 : Math.round((done / tally.scenarios.total) * 100);

  const missingStills = index.scenarios.filter((s) => s.stillUrl === null);
  const missingReelRows = index.scenarios.flatMap((s) =>
    s.mistakes.filter((m) => m.reel === null).map((m) => ({ s, m })),
  );
  const missingClipFiles = index.scenarios.flatMap((s) =>
    s.mistakes.filter((m) => m.reel && !m.reel.fileOnDisk).map((m) => ({ s, m })),
  );
  const missingQuestionStills = index.questions.filter(
    (q) => q.mediaKind === "sceneStill" && q.stillUrl === null,
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-3 pb-24 sm:p-5">
      <header>
        <p className="hud-label">Вътрешно · визуален преглед</p>
        <h1 className="mt-1 font-display text-xl font-black tracking-tight sm:text-3xl">
          Галерия за присъда
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Всеки сценарий и всяка картинка — с реалния кадър, за да има какво да
          гледаш. Присъдите се пазят на това устройство и се сливат с тези от
          старото табло. Накрая свали ✗ списъка от раздел „Износ&quot;.
        </p>
      </header>

      {/* Progress — the founder's own „докъде съм" */}
      <div className="rounded-2xl border border-border bg-surface-2/40 p-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-bold">Сценарии: {done}/{tally.scenarios.total}</span>
          <span className="text-muted">{pct}%</span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface">
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded-full border border-success/50 bg-success/10 px-2 py-0.5 font-bold text-success">
            ✓ {tally.scenarios.ok + tally.questions.ok + tally.clips.ok}
          </span>
          <span className="rounded-full border border-danger/50 bg-danger/10 px-2 py-0.5 font-bold text-danger">
            ✗ {tally.scenarios.problem + tally.questions.problem + tally.clips.problem}
          </span>
          <span className="rounded-full border border-border bg-surface px-2 py-0.5 font-bold text-muted">
            {tally.scenarios.left + tally.questions.left + tally.clips.left} без присъда
          </span>
        </div>
      </div>

      {/* Tabs — scrollable so four labels never wrap on a 390 px phone */}
      <div
        className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0"
        role="tablist"
        aria-label="Раздели"
      >
        {(
          [
            ["scenarios", `Сценарии (${index.stats.scenarioCount})`],
            ["questions", `Картинки (${index.stats.questionCount})`],
            ["gaps", `Липсва (${missingStills.length + missingReelRows.length})`],
            ["export", "Износ"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
              setLimit(PAGE);
              listTop.current?.scrollIntoView({ block: "start" });
            }}
            className={`min-h-11 shrink-0 rounded-xl border px-3.5 text-sm font-bold ${
              tab === id
                ? "border-accent bg-accent/15 text-accent"
                : "border-border bg-surface text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div ref={listTop} />

      {tab === "scenarios" || tab === "questions" ? (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Търси по id, заглавие, карта…"
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted/70"
          />
          <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
            <button
              type="button"
              onClick={() => {
                setOnlyUnjudged((v) => !v);
                setLimit(PAGE);
              }}
              aria-pressed={onlyUnjudged}
              className={`min-h-9 shrink-0 rounded-full border px-3 text-xs font-bold ${
                onlyUnjudged
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border bg-surface text-muted"
              }`}
            >
              Само без присъда
            </button>
            {tab === "scenarios" ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setFamily(null);
                    setLimit(PAGE);
                  }}
                  aria-pressed={family === null}
                  className={`min-h-9 shrink-0 rounded-full border px-3 text-xs font-bold ${
                    family === null
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-border bg-surface text-muted"
                  }`}
                >
                  Всички
                </button>
                {families.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      setFamily(family === f ? null : f);
                      setLimit(PAGE);
                    }}
                    aria-pressed={family === f}
                    className={`min-h-9 shrink-0 rounded-full border px-3 text-xs font-bold ${
                      family === f
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-border bg-surface text-muted"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </>
            ) : null}
          </div>
        </>
      ) : null}

      {tab === "scenarios" ? (
        <>
          <p className="text-xs text-muted">
            Показани {Math.min(limit, shownScenarios.length)} от {shownScenarios.length}{" "}
            (общо {index.stats.scenarioCount} · с кадър {index.stats.scenariosWithStill})
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shownScenarios.slice(0, limit).map((s) => (
              <ScenarioCard
                key={s.id}
                item={s}
                verdicts={verdicts}
                setVerdict={setVerdict}
                setNote={setNote}
                onZoom={onZoom}
              />
            ))}
          </div>
          <ShowMore shown={limit} total={shownScenarios.length} onMore={() => setLimit((n) => n + PAGE)} />
        </>
      ) : null}

      {tab === "questions" ? (
        <>
          <p className="text-xs text-muted">
            Показани {Math.min(limit, shownQuestions.length)} от {shownQuestions.length} (общо{" "}
            {index.stats.questionCount})
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shownQuestions.slice(0, limit).map((q) => (
              <QuestionCard
                key={q.id}
                item={q}
                verdicts={verdicts}
                setVerdict={setVerdict}
                setNote={setNote}
                onZoom={onZoom}
              />
            ))}
          </div>
          <ShowMore shown={limit} total={shownQuestions.length} onMore={() => setLimit((n) => n + PAGE)} />
        </>
      ) : null}

      {tab === "gaps" ? (
        <section className="flex flex-col gap-3">
          <p className="rounded-2xl border border-border bg-surface-2/40 p-3 text-sm leading-relaxed text-muted">
            Това НЕ е присъда — това е честният списък какво още не съществува,
            за да не преценяваш галерията като пълна. Клиповете са минути рендер
            всеки, затова са само {index.stats.reelCount} от{" "}
            {index.stats.mistakeCount} грешки.
          </p>

          <div className="rounded-2xl border border-border bg-surface p-3">
            <h2 className="font-display text-base font-black">
              Сценарии без кадър ({missingStills.length})
            </h2>
            {missingStills.length === 0 ? (
              <p className="mt-1 text-sm text-muted">Всички {index.stats.scenarioCount} са рендирани.</p>
            ) : (
              <ul className="mt-1.5 flex flex-col gap-1 text-xs">
                {missingStills.map((s) => (
                  <li key={s.id} className="font-mono text-muted">
                    {s.id}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {missingQuestionStills.length > 0 ? (
            <div className="rounded-2xl border border-border bg-surface p-3">
              <h2 className="font-display text-base font-black">
                Въпроси без 3D кадър ({missingQuestionStills.length})
              </h2>
              <p className="mt-1 text-xs text-muted">
                Показват се с 2D схемата от приложението. Рендирай ги с{" "}
                <code>tools/clips/headless/render-scene-still.mjs</code>.
              </p>
              <ul className="mt-1.5 flex flex-col gap-1 text-xs">
                {missingQuestionStills.map((q) => (
                  <li key={q.id} className="font-mono text-muted">
                    {q.id}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-surface p-3">
            <h2 className="font-display text-base font-black">
              Грешки без клип ({missingReelRows.length})
            </h2>
            <ul className="mt-1.5 flex flex-col gap-1.5 text-xs">
              {missingReelRows.map(({ s, m }) => (
                <li key={`${s.id}-${m.index}`}>
                  <span className="font-mono text-muted">
                    {s.id}__m{m.index}
                  </span>{" "}
                  — {m.titleBg}
                </li>
              ))}
            </ul>
          </div>

          {missingClipFiles.length > 0 ? (
            <div className="rounded-2xl border border-amber-500/50 bg-amber-500/5 p-3">
              <h2 className="font-display text-base font-black text-amber-600">
                Клипове в манифеста, но липсващи на този сървър ({missingClipFiles.length})
              </h2>
              <p className="mt-1 text-xs text-muted">
                .webm файловете не пътуват през git — качи ги със scp към
                public/clips/ (виж public/clips/README.md).
              </p>
              <ul className="mt-1.5 flex flex-col gap-1 text-xs">
                {missingClipFiles.map(({ s, m }) => (
                  <li key={`${s.id}-${m.index}`} className="font-mono text-muted">
                    {m.reel?.id}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "export" ? (
        <section className="flex flex-col gap-3">
          <p className="rounded-2xl border border-border bg-surface-2/40 p-3 text-sm leading-relaxed text-muted">
            Копирай това и ми го върни — това е ✗ списъкът с бележките ти.
            Свали и резервното копие (JSON), ако ще сменяш устройство: присъдите
            живеят само в този браузър.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyReport}
              className="min-h-12 flex-1 rounded-xl border border-accent bg-accent/15 px-4 text-sm font-bold text-accent"
            >
              {copied ? "✓ Копирано" : "Копирай ✗ списъка"}
            </button>
            <button
              type="button"
              onClick={() => download("verdict-problems.md", report, "text/markdown")}
              className="min-h-12 flex-1 rounded-xl border border-border bg-surface px-4 text-sm font-bold text-muted"
            >
              Свали .md
            </button>
            <button
              type="button"
              onClick={() =>
                download(
                  "verdict-backup.json",
                  JSON.stringify(verdicts, null, 2),
                  "application/json",
                )
              }
              className="min-h-12 flex-1 rounded-xl border border-border bg-surface px-4 text-sm font-bold text-muted"
            >
              Резервно копие (JSON)
            </button>
          </div>
          <textarea
            readOnly
            value={report}
            rows={20}
            className="w-full rounded-xl border border-border bg-surface p-3 font-mono text-[11px] leading-relaxed text-foreground"
          />
        </section>
      ) : null}

      {zoom ? (
        <Lightbox src={zoom.src} caption={zoom.caption} onClose={() => setZoom(null)} />
      ) : null}
    </div>
  );
}
