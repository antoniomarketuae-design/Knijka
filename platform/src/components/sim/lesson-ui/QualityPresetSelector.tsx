"use client";

/**
 * Quality preset selector — segmented control persisted in localStorage
 * (QUALITY_STORAGE_KEY). The value flows into <SceneSlot quality=…/>; what
 * each preset means is the environment workstream's business.
 */

import { useCallback, useSyncExternalStore } from "react";
import { QUALITY_PRESETS, QUALITY_STORAGE_KEY, type QualityPreset } from "./types";

function isPreset(v: unknown): v is QualityPreset {
  return v === "low" || v === "medium" || v === "high";
}

const DEFAULT_PRESET: QualityPreset = "medium";

/** Read the persisted preset (client only); defaults to "medium". */
export function loadQualityPreset(): QualityPreset {
  try {
    const stored = window.localStorage.getItem(QUALITY_STORAGE_KEY);
    return isPreset(stored) ? stored : DEFAULT_PRESET;
  } catch {
    return DEFAULT_PRESET;
  }
}

/**
 * Same-tab subscribers. The `storage` event only fires in OTHER tabs, so a
 * write here has to tell its own tab; without this the selector and any other
 * reader of the preset would disagree until a remount.
 */
const listeners = new Set<() => void>();

/**
 * Last value chosen this session. It wins over the stored one so that a browser
 * that refuses to persist (Safari private mode, quota) still applies the choice
 * for the rest of the session — the behaviour the previous useState carried.
 */
let sessionPreset: QualityPreset | null = null;

function qualitySnapshot(): QualityPreset {
  return sessionPreset ?? loadQualityPreset();
}

function subscribeQuality(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The persisted graphics preset.
 *
 * localStorage IS an external store, so it is read through
 * `useSyncExternalStore` (audit M-21) rather than seeded by a setState inside a
 * mount effect. That effect cost every simulator mount an extra commit of the
 * whole R3F tree — on the one surface in the product where render performance
 * is a feature — and it is the pattern React Compiler miscompiles. The snapshot
 * is a string, so React's Object.is check is stable without any caching.
 */
export function useQualityPreset(): [QualityPreset, (q: QualityPreset) => void] {
  const quality = useSyncExternalStore(
    subscribeQuality,
    qualitySnapshot,
    // Server snapshot: "medium" is what SSR renders, and what a client with no
    // stored preference resolves to anyway.
    () => DEFAULT_PRESET,
  );

  const update = useCallback((q: QualityPreset) => {
    sessionPreset = q;
    try {
      window.localStorage.setItem(QUALITY_STORAGE_KEY, q);
    } catch {
      // Private mode etc. — the in-memory value still applies this session.
    }
    for (const notify of listeners) notify();
  }, []);

  return [quality, update];
}

export function QualityPresetSelector({
  value,
  onChange,
}: {
  value: QualityPreset;
  onChange: (q: QualityPreset) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Качество на графиката"
      className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1"
    >
      {QUALITY_PRESETS.map((p) => {
        const active = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(p.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition motion-reduce:transition-none ${
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            {p.labelBg}
          </button>
        );
      })}
    </div>
  );
}
