/**
 * „Твоят дубъл" — the read model of the student's OWN recorded drive
 * (doc 82 §5.3 I2).
 *
 * Until this file existed the trace subsystem was write-only in the product
 * sense: `getAttemptTraceStore()` had exactly two call sites and both were
 * `.save(...)`. Every drive a student made was compressed, retention-managed
 * and stored — and then never shown to anyone. The codec, the ownership-scoped
 * read, the ghost renderer and the timeline were all already written and
 * tested; what was missing was the thing that turns a blob back into a lesson.
 *
 * This module is that thing, and it is deliberately PURE: it takes a decoded
 * trace plus the session's ALREADY-GRADED event log and produces the model a
 * replay surface renders. No I/O, no React, no Prisma — so the whole join is
 * node-testable, and the route layer is left with nothing but two awaits.
 *
 * The point of the screen it feeds (north star): error confrontation. The
 * student watches the exact second the engine convicted them, from outside the
 * car, at quarter speed, with the catalog's authored `correctiveBg` attached —
 * „какво трябваше да направя" beside the moment it should have been done.
 * Every word is authored (ADR-002): the rule catalog wrote it, not a model.
 *
 * NOT on the ./index.ts barrel, and not by accident: that barrel rides the
 * THEORY bundle (audit M-26) and this file reaches the rule catalog. Its
 * consumers are server components and the replay client, which import it by
 * path — exactly as clipReplay and attemptStore do.
 */

import { VIOLATIONS, type SeverityClass, type ViolationCode } from "../rules";
import { sampleAt } from "./sample";
import { createTracePoint, type ScenarioTrace } from "./types";

// ---------------------------------------------------------------------------
// Inputs (structural, so this file never depends on how they were stored)
// ---------------------------------------------------------------------------

/**
 * One event as the SESSION row stores it. Structural rather than the sim
 * module's `ScorableEvent`, because the source is a Json column: the builder
 * must survive a row written by an older format, a renamed code or a partially
 * hand-edited payload without throwing on a screen the student opened.
 */
export interface StoredReelEvent {
  kind?: unknown;
  code?: unknown;
  t?: unknown;
  titleBg?: unknown;
  explanationBg?: unknown;
  lawRef?: unknown;
  severityClass?: unknown;
}

/** One stored event position, paired back to its event by (kind, code, t) —
 *  the scheme the lessons engine recorded them with. */
export interface StoredReelPosition {
  kind?: unknown;
  code?: unknown;
  t?: unknown;
  x?: unknown;
  y?: unknown;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** One convicted moment, located on the ground and carrying its teach copy. */
export interface AttemptFault {
  /** Session time of the conviction, seconds — the replay's seek target. */
  tSec: number;
  code: string;
  severityClass: SeverityClass;
  x: number;
  y: number;
  /**
   * false when the position was RECONSTRUCTED by interpolating the trace at
   * `tSec` rather than read from the stored event position. Surfaced rather
   * than hidden: pre-drive events fire with no tick in hand and legacy rows
   * predate positions entirely, and a marker the engine did not place should
   * not claim it did.
   */
  positionExact: boolean;
  titleBg: string;
  explanationBg: string;
  /** „какво трябваше да направя" — the catalog's authored corrective; null
   *  for codes this build no longer knows (never invented). */
  correctiveBg: string | null;
  lawRef: string;
}

export interface AttemptReelModel {
  trace: ScenarioTrace;
  /** tSec-ascending. */
  faults: AttemptFault[];
  /** The single moment the reel opens on: the most severe fault, earliest
   *  first among equals. null when the drive was clean — and a clean drive is
   *  a thing worth watching too, so the reel still plays. */
  openAtSec: number | null;
}

/** Severity order for "which mistake does this reel lead with". Mirrors the
 *  official 10/3/1 hierarchy (doc 32) without importing the points table. */
const SEVERITY_RANK: Record<SeverityClass, number> = {
  opasna: 3,
  osnovna: 2,
  vtorostepenna: 1,
};

function isSeverityClass(v: unknown): v is SeverityClass {
  return v === "opasna" || v === "osnovna" || v === "vtorostepenna";
}

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function text(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

/**
 * Pair stored positions to stored events by (kind, code, t), consuming each
 * position once — two identical violations one second apart must not both
 * claim the first marker. Same pairing rule the session-end mistake map uses.
 */
function positionPool(positions: ReadonlyArray<StoredReelPosition>) {
  const pool = new Map<string, Array<{ x: number; y: number }>>();
  for (const p of positions) {
    if (!finite(p.x) || !finite(p.y) || !finite(p.t)) continue;
    if (typeof p.kind !== "string" || typeof p.code !== "string") continue;
    const key = `${p.kind}:${p.code}@${p.t}`;
    const list = pool.get(key);
    if (list) list.push({ x: p.x, y: p.y });
    else pool.set(key, [{ x: p.x, y: p.y }]);
  }
  return (kind: string, code: string, t: number) =>
    pool.get(`${kind}:${code}@${t}`)?.shift() ?? null;
}

/**
 * Join a decoded attempt trace with its session's stored verdict into the
 * replay model.
 *
 * Only VIOLATIONS become markers. Commendations are real and they are shown on
 * the session-end screen, but this reel exists to be watched at 0.25× at the
 * moment something went wrong; scattering green dots through it would dilute
 * the one thing it is for.
 */
export function buildAttemptReel(
  trace: ScenarioTrace,
  events: ReadonlyArray<StoredReelEvent>,
  positions: ReadonlyArray<StoredReelPosition> = [],
): AttemptReelModel {
  const takePosition = positionPool(positions);
  const point = createTracePoint();
  const faults: AttemptFault[] = [];

  for (const e of events) {
    if (e.kind !== "violation") continue;
    if (typeof e.code !== "string" || e.code.length === 0) continue;
    if (!finite(e.t) || e.t < 0) continue;

    // The catalog is the authority on the teach copy; the stored strings are
    // the fallback for a code this build has since renamed or retired (the row
    // is still evidence — it just loses the corrective it never carried).
    const spec = e.code in VIOLATIONS ? VIOLATIONS[e.code as ViolationCode] : undefined;

    const stored = takePosition("violation", e.code, e.t);
    let x: number;
    let y: number;
    if (stored !== null) {
      x = stored.x;
      y = stored.y;
    } else {
      // No recorded position → interpolate the student's OWN path at that
      // second. The marker is then honest to within one sample interval,
      // which is exactly where the car was.
      sampleAt(trace, e.t, point);
      x = point.x;
      y = point.y;
    }

    faults.push({
      tSec: e.t,
      code: e.code,
      severityClass: isSeverityClass(e.severityClass)
        ? e.severityClass
        : (spec?.severityClass ?? "vtorostepenna"),
      x,
      y,
      positionExact: stored !== null,
      titleBg: text(e.titleBg, spec?.titleBg ?? e.code),
      explanationBg: text(e.explanationBg, spec?.explanationBg ?? ""),
      correctiveBg: spec?.correctiveBg ?? null,
      lawRef: text(e.lawRef, spec?.lawRef ?? ""),
    });
  }

  faults.sort((a, b) => a.tSec - b.tSec);

  let openAt: AttemptFault | null = null;
  for (const f of faults) {
    if (
      openAt === null ||
      SEVERITY_RANK[f.severityClass] > SEVERITY_RANK[openAt.severityClass]
    ) {
      openAt = f;
    }
  }

  return { trace, faults, openAtSec: openAt?.tSec ?? null };
}

/**
 * Where the reel should start playing so the student sees the RUN-UP, not the
 * impact. Same window shape the clip trimmer uses (`[fault − 8 s, …]`): the
 * decision that produced the mistake was taken seconds before the engine
 * convicted it, and a replay that opens on the conviction teaches the
 * consequence instead of the cause.
 */
export const REEL_LEAD_IN_SEC = 8;

export function reelStartSec(faultSec: number | null): number {
  if (faultSec === null) return 0;
  return Math.max(0, faultSec - REEL_LEAD_IN_SEC);
}
