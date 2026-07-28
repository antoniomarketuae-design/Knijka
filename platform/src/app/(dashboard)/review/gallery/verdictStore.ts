"use client";

/**
 * verdictStore — device-local persistence for the founder's gallery verdicts.
 *
 * The brief was blunt: „persist his verdicts somewhere he will not lose them on
 * a page reload". So: one localStorage blob, written on every keystroke/toggle,
 * plus a one-file export. No server, no account, no PII (ADR-004 — this tool is
 * internal, but the rule that we do not ship a new personal-data store stands).
 *
 * TWO THINGS MATTER BEYOND "it saves":
 *
 *  1. IMPORT. The founder has already ruled on some reels and picture questions
 *     on the existing verdict board, which writes `clip-verdict:<id>` and
 *     `halfa-verdict:<id>`. Those answers are imported on first read, so this
 *     gallery starts where he left off instead of asking him twice.
 *  2. WRITE-THROUGH. A verdict on a reel or a picture question is also written
 *     back to the legacy key, so the old board keeps agreeing with this one.
 *     The gallery's own item kinds (scenarios, notes) live only in the blob.
 *
 * It is exposed as a `useSyncExternalStore` source rather than "read it in an
 * effect": localStorage IS an external store, the server snapshot is honestly
 * empty (there is no such thing as a server-side verdict), and subscribing to
 * the `storage` event means a second tab — the phone next to the laptop — stays
 * in step instead of silently overwriting the first one's work.
 */

export type Verdict = "ok" | "problem";

export interface VerdictEntry {
  v: Verdict;
  /** Free-text note — the "what exactly is wrong" the ✗ list has to carry. */
  note?: string;
  at: number;
}

export type VerdictMap = Record<string, VerdictEntry>;

/** Item key namespaces. `clip:` and `q:` mirror to the legacy per-item keys. */
export const KEY_SCENARIO = (id: string) => `sc:${id}`;
export const KEY_CLIP = (id: string) => `clip:${id}`;
export const KEY_QUESTION = (id: string) => `q:${id}`;

const STORE_KEY = "knijka.gallery.verdicts.v1";
const LEGACY_CLIP = "clip-verdict:";
const LEGACY_HALFA = "halfa-verdict:";

function isVerdict(v: unknown): v is Verdict {
  return v === "ok" || v === "problem";
}

/** Read the blob, then fold in any legacy verdict the blob does not have. */
function loadVerdicts(): VerdictMap {
  const out: VerdictMap = {};
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          const e = v as { v?: unknown; note?: unknown; at?: unknown };
          if (!isVerdict(e?.v)) continue;
          out[k] = {
            v: e.v,
            note: typeof e.note === "string" && e.note !== "" ? e.note : undefined,
            at: typeof e.at === "number" ? e.at : 0,
          };
        }
      }
    }
  } catch {
    // Blocked/corrupt storage — start empty rather than crash the review.
  }

  // Import what the existing verdict board already collected.
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      let mapped: string | null = null;
      if (k.startsWith(LEGACY_CLIP)) mapped = KEY_CLIP(k.slice(LEGACY_CLIP.length));
      else if (k.startsWith(LEGACY_HALFA)) mapped = KEY_QUESTION(k.slice(LEGACY_HALFA.length));
      if (!mapped || out[mapped]) continue;
      const v = window.localStorage.getItem(k);
      if (isVerdict(v)) out[mapped] = { v, at: 0 };
    }
  } catch {
    // No legacy import available — not fatal.
  }

  return out;
}

/** Persist the whole map, and mirror clip/question rulings to the old keys. */
function saveVerdicts(map: VerdictMap): void {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(map));
  } catch {
    return; // Storage full/blocked: the UI still holds the session's state.
  }
  try {
    // Clearing a verdict here must clear it there too, or the old board would
    // keep showing a ruling the founder just withdrew.
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(LEGACY_CLIP) && !map[KEY_CLIP(k.slice(LEGACY_CLIP.length))]) stale.push(k);
      else if (k.startsWith(LEGACY_HALFA) && !map[KEY_QUESTION(k.slice(LEGACY_HALFA.length))]) {
        stale.push(k);
      }
    }
    for (const k of stale) window.localStorage.removeItem(k);

    for (const [k, e] of Object.entries(map)) {
      if (k.startsWith("clip:")) {
        window.localStorage.setItem(`${LEGACY_CLIP}${k.slice(5)}`, e.v);
      } else if (k.startsWith("q:")) {
        window.localStorage.setItem(`${LEGACY_HALFA}${k.slice(2)}`, e.v);
      }
    }
  } catch {
    // Mirror is a convenience; the blob above is the source of truth.
  }
}

// ---------------------------------------------------------------------------
// The external-store surface React subscribes to
// ---------------------------------------------------------------------------

/** Stable empty snapshot — what a SERVER render of a device-local store is. */
const EMPTY: VerdictMap = Object.freeze({}) as VerdictMap;

let cache: VerdictMap | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Subscribe React — and pick up writes from another tab while we are at it. */
export function subscribeVerdicts(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    // Another tab (or the old verdict board) touched storage: drop the cache
    // so the next snapshot re-reads, then let React re-render.
    if (e.key === null || e.key === STORE_KEY || e.key.startsWith("clip-verdict:") ||
        e.key.startsWith("halfa-verdict:")) {
      cache = null;
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Current verdicts. Identity is stable until something actually changes. */
export function getVerdictsSnapshot(): VerdictMap {
  if (cache === null) cache = loadVerdicts();
  return cache;
}

/** Hydration snapshot: no verdict exists server-side, and none is invented. */
export function getVerdictsServerSnapshot(): VerdictMap {
  return EMPTY;
}

/** Apply a change, persist it immediately, and notify every subscriber. */
export function updateVerdicts(next: (prev: VerdictMap) => VerdictMap): void {
  const prev = getVerdictsSnapshot();
  const value = next(prev);
  if (value === prev) return;
  cache = value;
  saveVerdicts(value);
  emit();
}
