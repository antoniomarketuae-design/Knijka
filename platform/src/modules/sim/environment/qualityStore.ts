"use client";

// Quality preset store — module-level (no new deps), persisted to
// localStorage, consumed via useSyncExternalStore.
//
//   setting        — what the user chose: "auto" (default) | "low"|"med"|"high"
//   recommendation — what the auto heuristic currently believes this device
//                    can hold (seeded "med", refined by the 2 s FPS probe,
//                    persisted so the next visit starts from evidence).
//   effective      — setting, unless "auto", then recommendation.
//
// The page hosting the sim runs useAutoQualityProbe() once the canvas is
// live; a settings UI calls setQualitySetting().

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  MIN_PROBE_SAMPLES,
  medianFpsFromDeltas,
  recommendQuality,
  type QualityLevel,
  type QualitySetting,
} from "./quality";

export interface QualityState {
  setting: QualitySetting;
  recommendation: QualityLevel;
}

const STORAGE_KEY = "aidrive.sim.quality.v1";

const DEFAULT_STATE: QualityState = { setting: "auto", recommendation: "med" };

const LEVELS: readonly QualityLevel[] = ["low", "med", "high"];

function isLevel(v: unknown): v is QualityLevel {
  return typeof v === "string" && (LEVELS as readonly string[]).includes(v);
}

function loadStored(): QualityState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_STATE;
    const p = parsed as Partial<QualityState>;
    return {
      setting: p.setting === "auto" || isLevel(p.setting) ? p.setting : DEFAULT_STATE.setting,
      recommendation: isLevel(p.recommendation) ? p.recommendation : DEFAULT_STATE.recommendation,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

let state: QualityState = loadStored();

const listeners = new Set<() => void>();

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be unavailable (private mode, quota) — quality still works
    // for the session, it just won't be remembered.
  }
}

function setState(next: QualityState): void {
  if (next.setting === state.setting && next.recommendation === state.recommendation) return;
  state = next;
  persist();
  for (const fn of listeners) fn();
}

/** The effective render quality for a given state snapshot. */
export function effectiveQuality(s: QualityState = state): QualityLevel {
  return s.setting === "auto" ? s.recommendation : s.setting;
}

export function getQualityState(): QualityState {
  return state;
}

/** User override from a settings UI ("auto" hands control back to the probe). */
export function setQualitySetting(setting: QualitySetting): void {
  setState({ ...state, setting });
}

/** Probe result. Only changes rendering while setting === "auto". */
export function setQualityRecommendation(recommendation: QualityLevel): void {
  setState({ ...state, recommendation });
}

export function subscribeQuality(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Current quality state + resolved effective level, as a React hook. */
export function useQuality(): QualityState & { level: QualityLevel } {
  const snap = useSyncExternalStore(subscribeQuality, getQualityState, () => DEFAULT_STATE);
  return { ...snap, level: effectiveQuality(snap) };
}

/**
 * The 2-second FPS probe. Mount on the page WHILE the sim canvas is
 * rendering (R3F renders inside the main-thread rAF, so page rAF cadence
 * reflects true frame cost). After a short warmup it collects frame deltas,
 * takes the median, and updates the auto recommendation — one step up or
 * down per probe, so it cannot oscillate wildly.
 *
 * Runs once per mount; remount (key change) to re-probe. Stall frames
 * (hidden tab, GC) are discarded; with too few clean samples the probe
 * leaves the recommendation untouched.
 */
export function useAutoQualityProbe(options?: {
  enabled?: boolean;
  durationMs?: number;
  warmupMs?: number;
}): void {
  const enabled = options?.enabled ?? true;
  const durationMs = options?.durationMs ?? 2000;
  const warmupMs = options?.warmupMs ?? 500;
  const ran = useRef(false);

  useEffect(() => {
    if (!enabled || ran.current) return;
    ran.current = true;

    const deltas: number[] = [];
    const levelAtStart = effectiveQuality(getQualityState());
    const t0 = performance.now();
    let last = -1;
    let raf = 0;

    const tick = (now: number) => {
      if (last >= 0 && now - t0 > warmupMs) deltas.push(now - last);
      last = now;
      if (now - t0 < warmupMs + durationMs) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const fpsMedian = deltas.length >= MIN_PROBE_SAMPLES ? medianFpsFromDeltas(deltas) : null;
      setQualityRecommendation(
        recommendQuality({
          dpr: window.devicePixelRatio || 1,
          fpsMedian,
          currentLevel: levelAtStart,
        }),
      );
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, durationMs, warmupMs]);
}
