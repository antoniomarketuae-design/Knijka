"use client";

/**
 * Quality preset selector — segmented control persisted in localStorage
 * (QUALITY_STORAGE_KEY). The value flows into <SceneSlot quality=…/>; what
 * each preset means is the environment workstream's business.
 */

import { useEffect, useState } from "react";
import { QUALITY_PRESETS, QUALITY_STORAGE_KEY, type QualityPreset } from "./types";

function isPreset(v: unknown): v is QualityPreset {
  return v === "low" || v === "medium" || v === "high";
}

/** Read the persisted preset (client only); defaults to "medium". */
export function loadQualityPreset(): QualityPreset {
  try {
    const stored = window.localStorage.getItem(QUALITY_STORAGE_KEY);
    return isPreset(stored) ? stored : "medium";
  } catch {
    return "medium";
  }
}

export function useQualityPreset(): [QualityPreset, (q: QualityPreset) => void] {
  // "medium" for the SSR pass; the effect syncs the persisted value on mount.
  const [quality, setQuality] = useState<QualityPreset>("medium");

  useEffect(() => {
    setQuality(loadQualityPreset());
  }, []);

  const update = (q: QualityPreset) => {
    setQuality(q);
    try {
      window.localStorage.setItem(QUALITY_STORAGE_KEY, q);
    } catch {
      // Private mode etc. — the in-memory value still applies this session.
    }
  };
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
