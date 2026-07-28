"use client";

// Quality preset store — module-level (no new deps), persisted to
// localStorage, consumed via useSyncExternalStore.
//
//   setting        — what the user chose: "auto" (default) | "low"|"med"|"high"
//   recommendation — what the auto heuristic currently believes this device
//                    can hold (SEEDED SYNCHRONOUSLY from device signals on a
//                    cold start — doc 82 §2.3 — refined by the 2 s FPS probe,
//                    persisted so the next visit starts from evidence).
//   effective      — setting, unless "auto", then recommendation.
//
// The page hosting the sim runs useAutoQualityProbe() once the canvas is
// live; a settings UI calls setQualitySetting().

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  MIN_PROBE_SAMPLES,
  autoQualityCeiling,
  ledgerFromSample,
  levelFromLedger,
  medianFpsFromDeltas,
  recommendQuality,
  seedQualityFromSignals,
  unknownDeviceSignals,
  type DeviceSignals,
  type QualityLedger,
  type QualityLevel,
  type QualitySetting,
} from "./quality";

export interface QualityState {
  setting: QualitySetting;
  recommendation: QualityLevel;
}

const STORAGE_KEY = "aidrive.sim.quality.v1";

/** The SSR snapshot — no device to read, so the shipped neutral guess. */
const DEFAULT_STATE: QualityState = { setting: "auto", recommendation: "med" };

/**
 * The device facts `seedQualityFromSignals` rules on, read straight off the
 * browser. Synchronous and side-effect-free by design (doc 82 §2.3): the whole
 * point is to answer "which tier?" before the first texture request, so this
 * cannot wait for a frame, a fetch or an effect.
 *
 * Every read is individually guarded. `deviceMemory` is Chromium-only and
 * `matchMedia` is absent in jsdom/SSR; an absent signal must stay `null`
 * (unknown) rather than collapse to a default, or a Firefox desktop would be
 * graded on the same evidence as a phone.
 *
 * ADR-004: nothing here is stored, transmitted or joined to a user — these are
 * capability bits read and discarded inside one render.
 */
export function readDeviceSignals(): DeviceSignals {
  // SSR / jsdom: nothing is knowable, and "unknown" must not read as "phone".
  if (typeof window === "undefined") return unknownDeviceSignals(1);
  const mq = (query: string): boolean | null => {
    try {
      return typeof window.matchMedia === "function" ? window.matchMedia(query).matches : null;
    } catch {
      return null;
    }
  };
  const nav = navigator as Navigator & { deviceMemory?: number };
  const memory = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null;
  const cores =
    typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency > 0
      ? nav.hardwareConcurrency
      : null;
  return {
    coarsePointer: mq("(pointer: coarse)"),
    anyFinePointer: mq("(any-pointer: fine)"),
    deviceMemoryGb: memory,
    hardwareConcurrency: cores,
    dpr: window.devicePixelRatio || 1,
  };
}

/**
 * The cold-start tier for THIS device, computed once per page load.
 *
 * Memoized because it is read on every `loadQualityPreset()` call — and that
 * runs inside `useSyncExternalStore`'s snapshot, which React may call several
 * times per render. `matchMedia` is deterministic for a given device, so a
 * cached answer is also what keeps the snapshot referentially stable.
 */
let seededLevel: QualityLevel | null = null;

export function seedQualityLevel(): QualityLevel {
  if (seededLevel === null) seededLevel = seedQualityFromSignals(readDeviceSignals());
  return seededLevel;
}

const LEVELS: readonly QualityLevel[] = ["low", "med", "high"];

function isLevel(v: unknown): v is QualityLevel {
  return typeof v === "string" && (LEVELS as readonly string[]).includes(v);
}

function loadStored(): QualityState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  // No stored evidence yet → seed from the device rather than cold-starting on
  // "med" and letting the med FETCH plan go out before the probe ever runs
  // (doc 82 §2.3). A stored recommendation always wins: it is measured.
  const cold: QualityState = { setting: "auto", recommendation: seedQualityLevel() };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cold;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return cold;
    const p = parsed as Partial<QualityState>;
    return {
      setting: p.setting === "auto" || isLevel(p.setting) ? p.setting : cold.setting,
      recommendation: isLevel(p.recommendation) ? p.recommendation : cold.recommendation,
    };
  } catch {
    return cold;
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
      const signals = readDeviceSignals();
      setQualityRecommendation(
        recommendQuality({
          dpr: signals.dpr,
          fpsMedian,
          currentLevel: levelAtStart,
          signals,
        }),
      );
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, durationMs, warmupMs]);
}
