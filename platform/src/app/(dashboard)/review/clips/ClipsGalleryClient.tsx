"use client";

/**
 * The clip-review gallery (admin-only page body): a grid over the manifest
 * contract — thumbnail (the <video> first frame via preload="metadata"),
 * click to play inline, stored titleBg + templateId + duration under each,
 * family-prefix filter chips, a copy-id button, and a per-clip „бележки"
 * textarea kept in localStorage ONLY (pilot rule: no approval persistence —
 * the founder reports verbally).
 *
 * Fetches /clips/manifest.json fresh (no-store) — the founder re-reviews
 * right after a capture batch re-runs. A missing/empty manifest degrades to
 * the empty state; a 404-ing .webm (binaries deploy by scp, not git) shows a
 * quiet per-card note instead of a broken player.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CLIP_MANIFEST_URL,
  familyPrefixOf,
  formatClipDuration,
  parseClipManifest,
  type MistakeClip,
} from "@/components/theory/clipManifest";

const NOTES_KEY_PREFIX = "clip-notes:";

function CopyIdButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          .writeText(id)
          .then(() => {
            setCopied(true);
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {});
      }}
      className="btn-ghost shrink-0 px-2.5 py-1 text-[11px]"
    >
      {copied ? "Копирано ✓" : "Копирай ID"}
    </button>
  );
}

/** Pilot notes: this device only (localStorage), founder reports verbally.
 *  Uncontrolled — the stored text seeds the DOM after mount (no SSR value,
 *  so no hydration mismatch), every edit writes straight through. */
function ClipNotes({ clipId }: { clipId: string }) {
  const key = `${NOTES_KEY_PREFIX}${clipId}`;
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null && areaRef.current) areaRef.current.value = stored;
    } catch {
      // Storage blocked — the textarea still works, just does not persist.
    }
  }, [key]);

  return (
    <textarea
      ref={areaRef}
      defaultValue=""
      onChange={(e) => {
        const v = e.target.value;
        try {
          if (v.trim().length === 0) window.localStorage.removeItem(key);
          else window.localStorage.setItem(key, v);
        } catch {
          // Same quiet degradation.
        }
      }}
      rows={2}
      placeholder="Бележки (пазят се само на това устройство)"
      aria-label={`Бележки за ${clipId}`}
      className="w-full resize-y rounded-xl border border-border bg-surface px-2.5 py-1.5 text-xs leading-snug text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
    />
  );
}

function ClipCard({ clip }: { clip: MistakeClip }) {
  // The .webm 404s until the binaries are scp'd — note it, keep the card.
  const [fileMissing, setFileMissing] = useState(false);

  return (
    <li className="card flex flex-col gap-2 p-3">
      {fileMissing ? (
        <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-border bg-surface-2/50 p-3">
          <p className="text-center text-xs leading-snug text-muted">
            Файлът липсва ({clip.src}). Клиповете се качват с scp — виж
            public/clips/README.md.
          </p>
        </div>
      ) : (
        // preload="metadata" = the first frame is the thumbnail; play stays
        // a click away (native controls), nothing heavier loads up front.
        <video
          src={clip.src}
          preload="metadata"
          controls
          playsInline
          onError={() => setFileMissing(true)}
          aria-label={`Клип: ${clip.titleBg}`}
          className="aspect-video w-full rounded-xl border border-border bg-surface-2/60 object-contain"
        />
      )}

      <div className="min-w-0">
        {/* STORED mistake title (ADR-002 — copied by the rig, never generated). */}
        <p className="truncate text-sm font-bold" title={clip.titleBg}>
          {clip.titleBg}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-muted">
          <span className="truncate" title={clip.id}>
            {clip.templateId} · m{clip.mistakeIndex}
          </span>
          <span className="tabular-nums">{formatClipDuration(clip.durationSec)}</span>
          {clip.recordedAt !== "" ? (
            <span className="tabular-nums">{clip.recordedAt.slice(0, 10)}</span>
          ) : null}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <CopyIdButton id={clip.id} />
      </div>

      <ClipNotes clipId={clip.id} />
    </li>
  );
}

export function ClipsGalleryClient() {
  // null = loading; [] = loaded and empty (or manifest missing/malformed).
  const [clips, setClips] = useState<MistakeClip[] | null>(null);
  const [family, setFamily] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(CLIP_MANIFEST_URL, { cache: "no-store" });
        if (!res.ok) throw new Error("manifest fetch failed");
        const parsed = parseClipManifest((await res.json()) as unknown) ?? [];
        if (alive) setClips(parsed);
      } catch {
        // Missing manifest reads as "no clips yet" — the empty state below.
        if (alive) setClips([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const families = useMemo(() => {
    const set = new Set<string>();
    for (const clip of clips ?? []) set.add(familyPrefixOf(clip.templateId));
    return [...set].sort();
  }, [clips]);

  const shown = useMemo(() => {
    if (clips === null) return [];
    if (family === null) return clips;
    return clips.filter((c) => familyPrefixOf(c.templateId) === family);
  }, [clips, family]);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="hud-label">Пилот · вътрешен преглед</p>
        <h1 className="mt-1 font-display text-2xl font-black tracking-tight sm:text-3xl">
          Клипове от симулатора
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
          Всяка грешка от манифеста, преиграна в истинския 3D двигател. Прегледай
          вида, запиши си бележки — масовото производство тръгва след одобрение.
        </p>
      </header>

      {clips === null ? (
        <div
          aria-hidden
          className="h-40 w-full animate-pulse rounded-2xl border border-border bg-surface-2/50 motion-reduce:animate-none"
        />
      ) : clips.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-6">
          <p className="text-sm font-bold">Още няма клипове</p>
          <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-muted">
            Манифестът (/clips/manifest.json) е празен или липсва. Пусни батерията
            за запис, качи .webm файловете (scp — public/clips/README.md) и
            презареди страницата.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Филтър по семейство">
            <button
              type="button"
              onClick={() => setFamily(null)}
              aria-pressed={family === null}
              className={`rounded-full border px-3 py-1 text-xs font-bold transition motion-reduce:transition-none ${
                family === null
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border bg-surface text-muted hover:text-foreground"
              }`}
            >
              Всички ({clips.length})
            </button>
            {families.map((f) => {
              const count = clips.filter((c) => familyPrefixOf(c.templateId) === f).length;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFamily(f)}
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

          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((clip) => (
              <ClipCard key={clip.id} clip={clip} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
