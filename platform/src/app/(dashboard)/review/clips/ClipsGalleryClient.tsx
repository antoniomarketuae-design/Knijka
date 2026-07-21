"use client";

/**
 * The clip-review gallery (admin-only page body): a grid over the manifest
 * contract — thumbnail (the <video> first frame via preload="metadata"),
 * click to play inline, stored titleBg + templateId + duration under each,
 * family-prefix filter chips, a copy-id button, and a per-clip „бележки"
 * textarea kept in localStorage ONLY (pilot rule: no approval persistence —
 * the founder reports verbally).
 *
 * Doc 66 additions: under each video the REQUIREMENTS CARD from the generated
 * clip plan (изисквани участници / управляващ елемент / изглед / момент на
 * грешката — the R0 checklist, passed in server-side so the learning barrel
 * never bundles) and the keyframe strip the rig saved (manifest `keyframes`).
 * Both degrade quietly when absent.
 *
 * Fetches /clips/manifest.json fresh (no-store) — the founder re-reviews
 * right after a capture batch re-runs. A missing/empty manifest degrades to
 * the empty state; a 404-ing .webm (binaries deploy by scp, not git) shows a
 * quiet per-card note instead of a broken player.
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
import type { ClipPlanEntry } from "@/modules/learning";

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

const VIEW_BG: Record<ClipPlanEntry["view"], string> = {
  exterior: "Отвън",
  cockpit: "Кокпит",
  "exterior+dashboard": "Отвън + табло",
};

/** One row of the requirements card. */
function PlanRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-xs leading-snug">
      <dt className="w-24 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

/** The doc-66 requirements card — WHAT this clip was required to show
 *  (the same card Claude's R0 inspection checks against). */
function RequirementsCard({ plan }: { plan: ClipPlanEntry }) {
  const control = plan.governingControl;
  return (
    <dl className="flex flex-col gap-1 rounded-xl border border-border bg-surface-2/40 p-2.5">
      <PlanRow label="Участници">
        {plan.requiredActors.length === 0
          ? "—"
          : plan.requiredActors.map((a) => a.label).join("; ")}
      </PlanRow>
      <PlanRow label="Управляващ">
        {control.kind === "none" ? "Няма" : control.label}
        {control.approxPos ? (
          <span className="ml-1 font-mono text-[10px] text-muted">
            ({control.approxPos.x}; {control.approxPos.y})
          </span>
        ) : null}
      </PlanRow>
      <PlanRow label="Изглед">{VIEW_BG[plan.view]}</PlanRow>
      <PlanRow label="Грешката при">
        <span className="font-mono tabular-nums">{plan.faultTimeSec.toFixed(1)} с</span>
        <span className="ml-1 text-muted">от записа (изчислено от двигателя)</span>
      </PlanRow>
      {plan.notes !== "" ? (
        <p className="mt-0.5 text-[11px] leading-snug text-muted">{plan.notes}</p>
      ) : null}
    </dl>
  );
}

/** Keyframe strip (doc 66 R0) — the stills the rig saved for inspection.
 *  A 404-ing frame hides itself; an empty list renders nothing. */
function KeyframeStrip({ clip }: { clip: MistakeClip }) {
  const frames = clip.keyframes ?? [];
  if (frames.length === 0) return null;
  return (
    <ul className="flex gap-1.5 overflow-x-auto" aria-label={`Ключови кадри: ${clip.titleBg}`}>
      {frames.map((src) => (
        <li key={src} className="shrink-0">
          {/* Static rig-saved stills next to the .webm — plain <img> on purpose. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={`Кадър от ${clip.id}`}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            className="h-14 w-auto rounded-lg border border-border bg-surface-2/60 object-cover"
          />
        </li>
      ))}
    </ul>
  );
}

/** The rig's HONEST R1 checklist (manifest `actors`) — presence measured in
 *  the planned frame AT the fault (capturePlan.actorSpawned), so a „ЛИПСВА"
 *  here is a doc-66 R1 fail before anyone presses play. Absent on pre-v2
 *  recordings; an empty list = the card requires no actors. */
function ActorChecklistStrip({ clip }: { clip: MistakeClip }) {
  const actors = clip.actors;
  if (actors === undefined || actors.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={`Участници в кадър: ${clip.titleBg}`}>
      {actors.map((a) => (
        <li
          key={`${a.kind}:${a.label}`}
          title={a.label}
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
  );
}

function ClipCard({
  clip,
  plan,
  activeId,
  onActivate,
}: {
  clip: MistakeClip;
  plan: ClipPlanEntry | null;
  /** The clip whose video is currently playing (only one at a time). */
  activeId: string | null;
  /** This card's video started — pause every other one. */
  onActivate: (id: string) => void;
}) {
  // The .webm 404s until the binaries are scp'd — note it, keep the card.
  const [fileMissing, setFileMissing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  // webm-duration probe in flight (see fixDuration) — MediaRecorder clips
  // report duration=Infinity until seeked, which kills the scrubber.
  const probingRef = useRef(false);

  // One active <video> at a time: when another card starts, pause this one.
  // With preload="none" nothing decodes until played, so the gallery never
  // holds 20 live decoders (the cap that silently blanked clips 14–20).
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
        // Not seekable yet — durationchange retries.
      }
    } else if (step.action === "reset") {
      probingRef.current = false;
      try {
        video.currentTime = step.seekToSec;
      } catch {
        // ignore — next timeupdate lands at 0 anyway
      }
    }
  }, []);

  const poster = posterFrameFor(clip);

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
        // poster = the fault keyframe (instant, no decode) + preload="none":
        // the still IS the teaching moment; only the clip the founder clicks
        // ever loads its webm, and starting it pauses the others.
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

      <KeyframeStrip clip={clip} />

      {/* R1 honesty first: what the capture actually framed at the fault. */}
      <ActorChecklistStrip clip={clip} />

      {/* The requirements card (doc 66) — degrades quietly when the clip is
          outside the generated plan (e.g. a stale manifest entry). */}
      {plan !== null ? <RequirementsCard plan={plan} /> : null}

      <div className="flex items-center gap-2">
        <CopyIdButton id={clip.id} />
      </div>

      <ClipNotes clipId={clip.id} />
    </li>
  );
}

export function ClipsGalleryClient({ plan }: { plan: readonly ClipPlanEntry[] }) {
  // null = loading; [] = loaded and empty (or manifest missing/malformed).
  const [clips, setClips] = useState<MistakeClip[] | null>(null);
  const [family, setFamily] = useState<string | null>(null);
  // The one clip whose video is playing (only one decoder alive at a time).
  const [activeId, setActiveId] = useState<string | null>(null);
  const onActivate = useCallback((id: string) => setActiveId(id), []);

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

  const planById = useMemo(() => {
    const map = new Map<string, ClipPlanEntry>();
    for (const entry of plan) map.set(entry.id, entry);
    return map;
  }, [plan]);

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
              <ClipCard
                key={clip.id}
                clip={clip}
                plan={planById.get(clip.id) ?? null}
                activeId={activeId}
                onActivate={onActivate}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
