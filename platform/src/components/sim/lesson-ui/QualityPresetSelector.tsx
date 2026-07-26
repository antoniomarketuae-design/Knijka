"use client";

/**
 * Quality preset selector — segmented control persisted in localStorage
 * (QUALITY_STORAGE_KEY). The value flows into <SceneSlot quality=…/>; what
 * each preset means is the environment workstream's business.
 */

import { useCallback, useSyncExternalStore } from "react";
import { seedQualityLevel } from "@/modules/sim/environment";
import { QUALITY_PRESETS, QUALITY_STORAGE_KEY, type QualityPreset } from "./types";

function isPreset(v: unknown): v is QualityPreset {
  return v === "low" || v === "medium" || v === "high";
}

const DEFAULT_PRESET: QualityPreset = "medium";

/**
 * The cold start when nothing is stored — doc 82 §2.3 fix 2, "seed the quality
 * tier from device signals BEFORE the first fetch".
 *
 * This function is the simulator's ONLY tier decision. `useQualityPreset`
 * feeds it into <SceneSlot quality>, and HeroCarBody / VehicleRig / MirrorRig
 * each call `loadQualityPreset()` directly to gate their own cost, so all four
 * must resolve identically or the hero car renders clearcoat inside a `low`
 * environment. LessonScene then derives the DOWNLOAD plan from the same value
 * (`TEXTURE_BUDGETS[level]`, sim/world) — which is why the seed has to happen
 * here, synchronously, rather than in a probe that runs 2.5 s after the med
 * plan's 5.9 MB (incl. a 1.5 MB HDR) has already been requested.
 *
 * `seedQualityLevel()` returns the environment module's "low" | "med" | never
 * "high"; this store speaks "low" | "medium" | "high".
 */
function seededPreset(): QualityPreset {
  return seedQualityLevel() === "low" ? "low" : DEFAULT_PRESET;
}

/**
 * Read the persisted preset (client only). With nothing stored, falls back to
 * the device seed rather than a flat "medium" — see `seededPreset`. An
 * explicit stored choice always wins; the seed is a guess, the storage key is
 * a decision.
 */
export function loadQualityPreset(): QualityPreset {
  try {
    const stored = window.localStorage.getItem(QUALITY_STORAGE_KEY);
    return isPreset(stored) ? stored : seededPreset();
  } catch {
    return seededPreset();
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
    // Server snapshot: "medium". There is no device to read on the server, and
    // React re-renders with the client snapshot right after hydration — which
    // is where the device seed lands. The canvas itself mounts ssr:false, so it
    // only ever sees the seeded value.
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
