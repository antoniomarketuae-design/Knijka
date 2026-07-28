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
/**
 * The measured verdict about this device, kept SEPARATE from the state above.
 * `aidrive.sim.quality.v1` holds a preference; this holds evidence, it survives
 * a preference reset, and it is what turns the cold-start guess into something
 * that improves with use. ADR-004: two enum fields about a GPU, no identifier,
 * never transmitted.
 */
const LEDGER_KEY = "aidrive.sim.quality.ledger.v1";

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

const LEVELS: readonly QualityLevel[] = ["low", "med", "high"];

function isLevel(v: unknown): v is QualityLevel {
  return typeof v === "string" && (LEVELS as readonly string[]).includes(v);
}

/**
 * The device signals for THIS page load. Memoized for the same reason the seed
 * is: `seedQualityLevel()` runs inside a `useSyncExternalStore` snapshot, and
 * `matchMedia` is deterministic for a given device anyway.
 */
let deviceSignals: DeviceSignals | null = null;

function signals(): DeviceSignals {
  if (deviceSignals === null) deviceSignals = readDeviceSignals();
  return deviceSignals;
}

/** The persisted measured verdict, or null when nothing has been measured. */
export function readQualityLedger(): QualityLedger | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LEDGER_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const p = parsed as Partial<QualityLedger>;
    if (!isLevel(p.earned)) return null;
    return { earned: p.earned, failedAt: isLevel(p.failedAt) ? p.failedAt : null };
  } catch {
    return null;
  }
}

function writeQualityLedger(ledger: QualityLedger): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
  } catch {
    // Private mode / quota. The device just re-measures next session.
  }
}

/**
 * The cold-start tier for THIS device, computed once per page load.
 *
 * Two inputs, in order of authority:
 *  1. `readQualityLedger()` — what this device has actually been MEASURED
 *     doing, from a previous session (`useAutoQualityProbe` writes it).
 *  2. `seedQualityFromSignals()` — the synchronous guess, used on a first visit
 *     and overruled in both directions by (1).
 * …clamped by `autoQualityCeiling()`, which keeps handsets out of `high`.
 *
 * This is where promotion lands, and landing it here is the whole design: it is
 * the one moment in a session when changing tier costs nothing. Doc 82 §8 left
 * the probe unmounted because *"wiring the probe would change render tier
 * mid-drive"* — at cold start there is no drive to disturb, no scene to pop, and
 * (critically) the download plan has not been chosen yet, so the promoted tier
 * gets the 5,950,303 B map set instead of `low`'s 725,950 B rather than
 * re-fetching mid-lesson.
 *
 * Memoized so the value cannot change under a live canvas even if the probe
 * writes a new ledger while the student is driving.
 */
let seededLevel: QualityLevel | null = null;

export function seedQualityLevel(): QualityLevel {
  if (seededLevel === null) {
    const s = signals();
    seededLevel = levelFromLedger(
      seedQualityFromSignals(s),
      readQualityLedger(),
      autoQualityCeiling(s),
    );
  }
  return seededLevel;
}

function loadStored(): QualityState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  // Only `setting` is read back from storage — it is the student's choice, and
  // storage is the only place it exists.
  //
  // `recommendation` is RECOMPUTED every load, deliberately. It used to be
  // restored from this key on the grounds that "a stored recommendation always
  // wins: it is measured" — which stopped being true the moment the probe that
  // was supposed to write it turned out never to be mounted (doc 82 §8). What
  // the key actually held was a frozen copy of whatever the seed rule said on
  // the day it was first persisted, so a device seeded `low` by the old
  // `dpr >= 3` rule would keep answering `low` even after that rule was fixed.
  // `seedQualityLevel()` now folds in the measured ledger itself, so it is
  // strictly better evidence than anything this key could carry.
  const cold: QualityState = { setting: "auto", recommendation: seedQualityLevel() };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cold;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return cold;
    const p = parsed as Partial<QualityState>;
    return {
      setting: p.setting === "auto" || isLevel(p.setting) ? p.setting : cold.setting,
      recommendation: cold.recommendation,
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

/**
 * Current quality state + resolved effective level, as a React hook.
 *
 * It also ARMS the FPS probe. That is the fix for doc 82 §8's dead export: the
 * probe used to need a mount site nobody ever added, and "a wrong tier never
 * self-corrects" was the direct consequence. Every consumer of `useQuality()`
 * is inside the sim canvas (SimEnvironment, WindshieldDroplets), so arming here
 * means "measure whenever the simulator is actually rendering" — the exact
 * contract the probe documents — with no second place to keep in sync. The
 * module-level `measured` latch keeps it to one window per page load however
 * many components call this, and the probe writes only the persisted ledger, so
 * arming it cannot change what is currently on screen.
 */
export function useQuality(): QualityState & { level: QualityLevel } {
  const snap = useSyncExternalStore(subscribeQuality, getQualityState, () => DEFAULT_STATE);
  useAutoQualityProbe();
  return { ...snap, level: effectiveQuality(snap) };
}

/**
 * Whether this page load is allowed to write a measurement.
 *
 * Two exclusions, both about the same thing — a sample is only meaningful if
 * BOTH halves are true, the frame time and the tier it is attributed to.
 *
 *  - `navigator.webdriver`: the clip and scene-still rigs
 *    (`tools/clips/headless/*.mjs`) drive Chromium with
 *    `--use-angle=swiftshader`, a SOFTWARE rasteriser. Those frame times
 *    describe a CI box, not a device.
 *  - `/dev/*`: every one of these harnesses hard-codes the tier it mounts —
 *    verified, not assumed: `ghost-demo` passes `quality="medium"`,
 *    `scene-still` `quality={LEVEL}`, `clip-capture` `quality={level}`,
 *    `hud-ux` reads it off the query string. The store meanwhile still believes
 *    the seeded tier, so a sample taken here would carry a real frame time
 *    under the WRONG label. These routes `notFound()` in production, so the
 *    rule costs a student nothing.
 */
function measurementAllowed(): boolean {
  if (typeof window === "undefined") return false;
  if (navigator.webdriver === true) return false;
  return !window.location.pathname.startsWith("/dev/");
}

/** One measurement per page load, however many components arm the probe. */
let measured = false;

/**
 * The FPS probe — the promotion path doc 82 §8 recorded as missing.
 *
 * Mounted WHILE the sim canvas renders (R3F draws inside the main-thread rAF,
 * so page rAF cadence is true frame cost). `useQuality()` arms it, which means
 * it runs exactly when SimEnvironment is on screen and never on a marketing
 * page — no extra mount site to forget, which is how the previous version ended
 * up exported and never called.
 *
 * WHAT IT DOES NOT DO: change the tier. It writes `QualityLedger` and nothing
 * else; `seedQualityLevel()` applies it at the next cold start. See
 * `ledgerFromSample` for why (mid-drive `low`→`med` is a 5.2 MB fetch under the
 * student's wheels, not a visual pop).
 *
 * WHY THE WINDOW IS LATE. The default 500 ms warmup measured shader compilation,
 * texture upload and the first physics steps — the most expensive frames of the
 * session, which would have read as "this device is struggling" on hardware that
 * is fine. The window now opens at 6 s and runs 4 s, by which point the scene
 * has settled and a phone has begun its thermal ramp. A student who leaves
 * before 10 s simply produces no evidence, and nothing changes.
 *
 * Stall frames (hidden tab, GC) are discarded; below `MIN_PROBE_SAMPLES` clean
 * frames the window is thrown away rather than acted on.
 */
export function useAutoQualityProbe(options?: {
  enabled?: boolean;
  durationMs?: number;
  warmupMs?: number;
}): void {
  const enabled = options?.enabled ?? true;
  const durationMs = options?.durationMs ?? 4000;
  const warmupMs = options?.warmupMs ?? 6000;
  const ran = useRef(false);

  useEffect(() => {
    if (!enabled || ran.current || measured || !measurementAllowed()) return;
    ran.current = true;
    measured = true;

    const deltas: number[] = [];
    // The tier the samples are paid at. Read at the START: `seedQualityLevel()`
    // is memoized for the page load, so this is stable for the whole window.
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
      if (deltas.length < MIN_PROBE_SAMPLES) return;
      const fpsMedian = medianFpsFromDeltas(deltas);
      if (fpsMedian === null) return;
      writeQualityLedger(
        ledgerFromSample(
          readQualityLedger(),
          { level: levelAtStart, fpsMedian, samples: deltas.length },
          autoQualityCeiling(signals()),
        ),
      );
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, durationMs, warmupMs]);
}
