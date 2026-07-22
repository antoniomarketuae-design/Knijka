"use client";

/**
 * Verdict board (founder tool) — the „преглед и присъда" page the founder
 * asked for: every Half-B reel clip laid out to WATCH and mark ✓ добър / ✗
 * проблем, plus Claude's own R0 badge (r0Status.ts) so my flags are visible
 * before the founder spends eyes. Verdicts persist in localStorage ONLY
 * (`clip-verdict:<id>`), device-local, no server — the same pilot rule the
 * review gallery uses for notes.
 *
 * This is a DEV route (page 404s in production). It plays the local
 * public/clips/*.webm the headless renderer just produced, so it works in the
 * browser preview without staging. Reuses the shared manifest reader
 * (components/theory/clipManifest) — the SAME contract the app why-panel reads.
 *
 * Deliberately a separate client from the admin ClipsGalleryClient: that one
 * is the neutral review grid; this one is opinionated (verdict + my R0 flags +
 * a running tally) and purpose-built for the founder's approval pass.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CLIP_MANIFEST_URL,
  familyPrefixOf,
  formatClipDuration,
  parseClipManifest,
  posterFrameFor,
  type MistakeClip,
} from "@/components/theory/clipManifest";
import { durationFixStep } from "@/components/theory/webmDuration";
import { r0StatusFor, type R0Level } from "./r0Status";
import type { HalfAItem } from "./halfAData";
import { HalfASection } from "./HalfASection";
import type { CoverageSummary } from "./coverageData";
import { CoverageTab } from "./CoverageTab";

type Verdict = "ok" | "problem";
const VERDICT_KEY_PREFIX = "clip-verdict:";

// --- localStorage verdict store (device-local, no server) -------------------

function readVerdict(id: string): Verdict | null {
  try {
    const v = window.localStorage.getItem(`${VERDICT_KEY_PREFIX}${id}`);
    return v === "ok" || v === "problem" ? v : null;
  } catch {
    return null;
  }
}
function writeVerdict(id: string, v: Verdict | null): void {
  try {
    if (v === null) window.localStorage.removeItem(`${VERDICT_KEY_PREFIX}${id}`);
    else window.localStorage.setItem(`${VERDICT_KEY_PREFIX}${id}`, v);
  } catch {
    // Storage blocked — the UI still toggles for the session, just no persist.
  }
}

// --- R0 badge ---------------------------------------------------------------

const R0_BADGE: Record<R0Level, { label: string; cls: string }> = {
  ok: { label: "R0 ✓ прегледан", cls: "border-success/50 bg-success/10 text-success" },
  amber: { label: "R0 ⚠ слаб", cls: "border-amber-500/50 bg-amber-500/10 text-amber-600" },
  red: { label: "R0 ✗ дефект", cls: "border-danger/50 bg-danger/10 text-danger" },
};

function R0Badge({ clipId }: { clipId: string }) {
  const r0 = r0StatusFor(clipId);
  if (!r0) return null;
  const b = R0_BADGE[r0.level];
  return (
    <div className={`rounded-xl border px-2.5 py-1.5 text-[11px] leading-snug ${b.cls}`}>
      <span className="font-bold">{b.label}</span>
      <span className="ml-1 opacity-90">— {r0.noteBg}</span>
    </div>
  );
}

// --- verdict buttons --------------------------------------------------------

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
        className={`flex-1 rounded-xl border px-3 py-2 text-sm font-bold transition motion-reduce:transition-none ${
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
        className={`flex-1 rounded-xl border px-3 py-2 text-sm font-bold transition motion-reduce:transition-none ${
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

// --- one reel card ----------------------------------------------------------

function ReelCard({
  clip,
  verdict,
  onVerdict,
  activeId,
  onActivate,
}: {
  clip: MistakeClip;
  verdict: Verdict | null;
  onVerdict: (id: string, v: Verdict | null) => void;
  activeId: string | null;
  onActivate: (id: string) => void;
}) {
  const [fileMissing, setFileMissing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const probingRef = useRef(false);

  useEffect(() => {
    if (activeId !== null && activeId !== clip.id) videoRef.current?.pause();
  }, [activeId, clip.id]);

  const fixDuration = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const step = durationFixStep(video.duration, probingRef.current);
    if (step.action === "probe") {
      probingRef.current = true;
      try {
        video.currentTime = step.seekToSec;
      } catch {
        // not seekable yet — durationchange retries
      }
    } else if (step.action === "reset") {
      probingRef.current = false;
      try {
        video.currentTime = step.seekToSec;
      } catch {
        // next timeupdate lands at 0 anyway
      }
    }
  }, []);

  const poster = posterFrameFor(clip);
  const ring =
    verdict === "ok"
      ? "ring-2 ring-success/60"
      : verdict === "problem"
        ? "ring-2 ring-danger/60"
        : "";

  return (
    <li className={`card flex flex-col gap-2.5 p-3 ${ring}`}>
      {fileMissing ? (
        <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-border bg-surface-2/50 p-3">
          <p className="text-center text-xs leading-snug text-muted">
            Файлът липсва ({clip.src}). Пусни рендера локално или качи .webm на staging.
          </p>
        </div>
      ) : (
        <video
          ref={videoRef}
          src={clip.src}
          poster={poster}
          preload="none"
          controls
          playsInline
          onPlay={() => onActivate(clip.id)}
          onLoadedMetadata={fixDuration}
          onDurationChange={fixDuration}
          onError={() => setFileMissing(true)}
          aria-label={`Клип: ${clip.titleBg}`}
          className="aspect-video w-full rounded-xl border border-border bg-surface-2/60 object-contain"
        />
      )}

      <div className="min-w-0">
        <p className="text-sm font-bold leading-snug" title={clip.titleBg}>
          {clip.titleBg}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-muted">
          <span className="truncate" title={clip.id}>
            {clip.templateId} · m{clip.mistakeIndex}
          </span>
          <span className="tabular-nums">{formatClipDuration(clip.durationSec)}</span>
          {clip.view ? <span>{clip.view}</span> : null}
        </p>
      </div>

      {/* Claude's R0 flag (only shown for clips with a known status). */}
      <R0Badge clipId={clip.id} />

      {/* R1 honesty: what the rig measured in-frame at the fault. */}
      {clip.actors && clip.actors.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Участници в кадър">
          {clip.actors.map((a, i) => (
            <li
              key={`${a.kind}:${a.label}:${i}`}
              className={`max-w-full truncate rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                a.present
                  ? "border-success/50 bg-success/10 text-success"
                  : "border-danger/50 bg-danger/10 text-danger"
              }`}
            >
              {a.present ? "✓ " : "✗ ЛИПСВА: "}
              {a.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-auto">
        <VerdictButtons value={verdict} onChange={(v) => onVerdict(clip.id, v)} />
      </div>
    </li>
  );
}

// --- board -------------------------------------------------------------------

export function VerdictBoardClient({
  halfA,
  coverage,
}: {
  halfA: readonly HalfAItem[];
  coverage: CoverageSummary;
}) {
  const [clips, setClips] = useState<MistakeClip[] | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [family, setFamily] = useState<string | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<"reels" | "signs" | "coverage">("reels");
  const onActivate = useCallback((id: string) => setActiveId(id), []);

  // Load the manifest + hydrate stored verdicts once.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(CLIP_MANIFEST_URL, { cache: "no-store" });
        if (!res.ok) throw new Error("manifest fetch failed");
        const parsed = parseClipManifest((await res.json()) as unknown) ?? [];
        if (!alive) return;
        setClips(parsed);
        const seed: Record<string, Verdict> = {};
        for (const c of parsed) {
          const v = readVerdict(c.id);
          if (v) seed[c.id] = v;
        }
        setVerdicts(seed);
      } catch {
        if (alive) setClips([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const onVerdict = useCallback((id: string, v: Verdict | null) => {
    writeVerdict(id, v);
    setVerdicts((prev) => {
      const next = { ...prev };
      if (v === null) delete next[id];
      else next[id] = v;
      return next;
    });
  }, []);

  const families = useMemo(() => {
    const set = new Set<string>();
    for (const clip of clips ?? []) set.add(familyPrefixOf(clip.templateId));
    return [...set].sort();
  }, [clips]);

  const shown = useMemo(() => {
    let list = clips ?? [];
    if (family !== null) list = list.filter((c) => familyPrefixOf(c.templateId) === family);
    if (onlyFlagged) list = list.filter((c) => r0StatusFor(c.id) !== null);
    // Sort: R0-flagged first (red, amber), then the rest — so problems surface.
    const rank = (id: string) => {
      const r = r0StatusFor(id);
      return r === null ? 3 : r.level === "red" ? 0 : r.level === "amber" ? 1 : 2;
    };
    return [...list].sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
  }, [clips, family, onlyFlagged]);

  const tally = useMemo(() => {
    const total = clips?.length ?? 0;
    let ok = 0;
    let problem = 0;
    for (const v of Object.values(verdicts)) {
      if (v === "ok") ok += 1;
      else if (v === "problem") problem += 1;
    }
    let red = 0;
    let amber = 0;
    for (const c of clips ?? []) {
      const r = r0StatusFor(c.id);
      if (r?.level === "red") red += 1;
      else if (r?.level === "amber") amber += 1;
    }
    return { total, ok, problem, unset: total - ok - problem, red, amber };
  }, [clips, verdicts]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <header>
        <p className="hud-label">Вътрешно · преглед и присъда</p>
        <h1 className="mt-1 font-display text-2xl font-black tracking-tight sm:text-3xl">
          Табло за присъда — Half A + Half B
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
          Гледай всеки клип/картинка и маркирай ✓ добър или ✗ проблем. Присъдите
          се пазят само на това устройство. Оранжев/червен знак „R0" = вече съм
          го отбелязал като слаб/дефектен (виж бележката).
        </p>
      </header>

      {/* Tabs */}
      <div className="flex gap-2" role="tablist" aria-label="Раздели">
        {(
          [
            ["reels", `Half B — клипове (${clips?.length ?? 0})`],
            ["signs", `Half A — картинки (${halfA.length})`],
            [
              "coverage",
              `Покритие (${coverage.totalQuestions === 0 ? 0 : Math.round((coverage.reelQuestions / coverage.totalQuestions) * 100)}%)`,
            ],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-xl border px-4 py-2 text-sm font-bold transition motion-reduce:transition-none ${
              tab === id
                ? "border-accent bg-accent/15 text-accent"
                : "border-border bg-surface text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "reels" ? (
        <>
          {/* Tally strip */}
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
              Мои R0 флагове: <b className="text-danger">{tally.red} дефект</b> ·{" "}
              <b className="text-amber-600">{tally.amber} слаб</b>
            </span>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Филтри">
            <button
              type="button"
              onClick={() => {
                setFamily(null);
                setOnlyFlagged(false);
              }}
              aria-pressed={family === null && !onlyFlagged}
              className={`rounded-full border px-3 py-1 text-xs font-bold transition motion-reduce:transition-none ${
                family === null && !onlyFlagged
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border bg-surface text-muted hover:text-foreground"
              }`}
            >
              Всички ({clips?.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => {
                setOnlyFlagged((v) => !v);
                setFamily(null);
              }}
              aria-pressed={onlyFlagged}
              className={`rounded-full border px-3 py-1 text-xs font-bold transition motion-reduce:transition-none ${
                onlyFlagged
                  ? "border-danger bg-danger/15 text-danger"
                  : "border-border bg-surface text-muted hover:text-foreground"
              }`}
            >
              ⚠ Само маркирани ({tally.red + tally.amber})
            </button>
            {families.map((f) => {
              const count = (clips ?? []).filter((c) => familyPrefixOf(c.templateId) === f).length;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setFamily(f);
                    setOnlyFlagged(false);
                  }}
                  aria-pressed={family === f}
                  className={`rounded-full border px-3 py-1 font-mono text-xs font-bold transition motion-reduce:transition-none ${
                    family === f
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-border bg-surface text-muted hover:text-foreground"
                  }`}
                >
                  {f} ({count})
                </button>
              );
            })}
          </div>

          {clips === null ? (
            <div
              aria-hidden
              className="h-40 w-full animate-pulse rounded-2xl border border-border bg-surface-2/50 motion-reduce:animate-none"
            />
          ) : clips.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-6">
              <p className="text-sm font-bold">Няма клипове в манифеста</p>
              <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-muted">
                Пусни рендера (tools/clips/headless) — той пише public/clips/manifest.json — и презареди.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((clip) => (
                <ReelCard
                  key={clip.id}
                  clip={clip}
                  verdict={verdicts[clip.id] ?? null}
                  onVerdict={onVerdict}
                  activeId={activeId}
                  onActivate={onActivate}
                />
              ))}
            </ul>
          )}
        </>
      ) : tab === "signs" ? (
        <HalfASection items={halfA} />
      ) : (
        <CoverageTab coverage={coverage} />
      )}
    </div>
  );
}
