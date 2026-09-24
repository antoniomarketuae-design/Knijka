// -----------------------------------------------------------------------------
// road-record.mjs — THE HARNESS'S RECORD OF `window.__roadProbe`, AND THE
// BASELINE MEASUREMENT OVER IT (W59 steering spec §5, §6, §7 increment 2).
//
//   node --test tools/mobile/__tests__/road-record.test.mjs
//
// WHAT IT IS. One SINK and the pure pieces it is made of:
//
//   · `createRoadWitness(readProbe, opts)` — THE ONLY THING lesson-audit.mjs
//                            holds. It is handed a NARROW READER — one function,
//                            `(arg) => page.evaluate(roadProbePageRead, arg)` —
//                            and never the page, the browser context or any
//                            object lesson-audit reads, so there is nothing of
//                            lesson-audit's it could write to. It returns a
//                            frozen `{ poll, finish }`; both resolve to
//                            `undefined`, neither throws, and the record lives
//                            in their closure. `finish(dir)` writes ONE file
//                            (`_audit-road.json.gz`) and hands ONE string (the
//                            ROAD line) to `opts.log`. There is no getter, no
//                            return value and no module-level state — proven by
//                            executing it (road-record.test.mjs §SINK), not by
//                            an allowlist of call sites.
//   · `roadProbePageRead`  — the function `page.evaluate` runs. Rows with
//                            `seq > lastSeq`, the route when its derivation
//                            count moved, and the page's own clock
//                            (`performance.now()`, `performance.timeOrigin`).
//                            It never reads `step` (spec §2.4) and writes
//                            nothing to the page. Self-contained on purpose —
//                            Playwright serialises its source.
//   · `mergeRoadRead`      — folds one read into the record: dedupe by seq,
//                            count GAPS and ring OVERRUNS, detect a RELOAD by the
//                            page's clock (a new `timeOrigin`, or `now` going
//                            backwards) as well as by `seq`, keep every route
//                            derivation, and after the drive-end watermark book
//                            everything to `postDrive` instead of the leg.
//   · `toCriteriaRows`     — RoadProbeRecord → `road-criteria.mjs` rows.
//                            Absent stays absent; `edgeId: null` stays null.
//   · `roadBaseline`       — AC-2 / AC-2B / AC-6 (+ record, referent) as
//                            MEASUREMENTS. No verdict, no reason strings.
//
// THE WITNESS RULE. The poll sits at the tick BOUNDARY in lesson-audit — after
// this tick's last actuation and before the next tick's pose probe — and INSIDE
// the tick's own idle budget: lesson-audit runs it concurrently with the idle
// wait and awaits it after, so the read spends idle time instead of adding to
// it and the control period stays TICK_MS with the witness on or off. A poll longer than the budget is BOOKED here (`pollBudget.overBudget`),
// never absorbed silently, and a leg with one cannot inform the freeze. One
// more poll stamps the drive's end before the keys are released. The witness
// is NOT CONSTRUCTED on an authored-path (pc-path) leg, so the ratified
// parking instrument runs exactly as before, and the pc-path RULING-1
// exception is not widened to this probe. All of it, and the kill switch
// (`KNIJKA_ROAD_WITNESS=0`), is pinned by `__tests__/road-witness-wiring.test.mjs`.
//
// UNMEASURED IS NOT ZERO. A page with no probe, a switched-off witness or a
// probe of another version yields `{ unmeasured }` with its reason and every
// metric ABSENT — never a p90 of 0 and never a wrong-bank fraction of 0.
//
// I/O: only `finish` does any — one gzip file in the directory it is handed.
// Everything else here is pure.
// -----------------------------------------------------------------------------

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import {
  LANE_HOLD_P90_CEILING_M,
  PRODUCT,
  SURFACE,
  assessFlow,
  assessLaneHolding,
  assessRecordCompleteness,
  assessReferentLiveness,
  declaredSpansHash,
  engineForwardGear,
  engineMoving,
  medianWallPeriodSec,
  percentile,
  surfaceOf,
} from "./road-criteria.mjs";

/**
 * 3: the curved bucket excludes the lane-align span the PRODUCT published
 * (`route.laneAlign`, probe version 2) instead of a bound guessed from the turn
 * markers, and the sink's poll budget is booked. 2 (the guess) and 1 (the
 * refuted exclusion and reset logic) are read, listed, and never eligible for
 * a freeze (tools/audit/road-baseline.mjs).
 */
export const ROAD_RECORD_SCHEMA = "road-record/3";
/** The probe version this reader was written against (`ROAD_PROBE_VERSION`,
 *  platform/src/modules/sim/devrig/roadProbe.ts). Another version is recorded
 *  and makes the leg UNMEASURED — its row shape is not this file's to guess. */
export const ROAD_PROBE_VERSION_READ = 3;

/** The sidecar lesson-audit writes per leg (gzip of JSON, rows as columns). */
export const ROAD_SIDECAR_FILE = "_audit-road.json.gz";
/** The increment-2 v1 sidecar (plain JSON, rows as objects) — still readable. */
export const ROAD_SIDECAR_FILE_V1 = "_audit-road.json";
/** The env switch that turns the witness off, so a drive can be A/B'd. */
export const ROAD_WITNESS_ENV = "KNIJKA_ROAD_WITNESS";

/**
 * guidanceRoute.ts `const DENSIFY_STEP_M = 2.5;` — the product's route sample
 * pitch. Mirrored; the wiring test re-reads it from source.
 */
export const GUIDANCE_DENSIFY_STEP_M = 2.5;
/**
 * How far a kink the lane-align shift makes at one of its published marks can
 * show up in the route's vertex headings: TWO route pitches, and each is a
 * product step, not a margin of safety —
 *   1. `finalizeRoute` densifies at DENSIFY_STEP_M, so a kink between two
 *      samples straddles both (and each mark is carried to the NEAREST sample,
 *      the way `goalS` is);
 *   2. its one 3-tap pass (0.25 / 0.5 / 0.25) spreads each vertex's
 *      displacement one sample further either side.
 * Both are re-read from guidanceRoute.ts by road-witness-wiring.test.mjs, and
 * the product's guidance-lane-align-span.test.ts proves every manufactured
 * heading change lies within this reach of the published span.
 */
export const SPAN_KINK_REACH_M = 2 * GUIDANCE_DENSIFY_STEP_M;
/**
 * guidanceRoute.ts `export const LANE_ALIGN_RAMP_M = 40;` — the length the
 * lane-align weight DECAYS over past `holdToS`. Mirrored (the wiring test
 * re-reads it from source) because it is the decay kink's own denominator and
 * the probe does not publish it: `decayEndS − holdToS` is NOT a substitute,
 * since that mark is the first SAMPLE at or after `holdToS + LANE_ALIGN_RAMP_M`
 * in the route's stretched arclength, and it is clamped to the last sample when
 * the route ends inside the decay.
 */
export const GUIDANCE_LANE_ALIGN_RAMP_M = 40;
/** Spec AC-2: "curved = route segments carrying ≥ 15°/100 m of heading change". */
export const CURVED_DEG_PER_100M = 15;
/**
 * The window the 15°/100 m rate is measured over, centred on each route
 * segment's midpoint. The spec names the RATE and not the window; 100 m is the
 * rate's own denominator, which is the least-chosen value available. It is an
 * open question, not a frozen number.
 */
export const CURVATURE_WINDOW_M = 100;

const ERRORS_KEPT = 5;
const COST_KEPT = 4096;
const EVENTS_KEPT = 32;

/* ────────────────────────────────────────────────────────────────────────────
 * THE PAGE SIDE
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * Runs IN THE PAGE via `page.evaluate(roadProbePageRead, arg)`.
 * `arg = { lastSeq: number | null, lastDerivations: number | null }`.
 * Reads `road`, `route` and the page clock only — never `step`, and writes
 * nothing.
 */
export function roadProbePageRead(arg) {
  const perf = typeof performance !== "undefined" ? performance : undefined;
  const nowMs = perf && typeof perf.now === "function" ? perf.now() : Date.now();
  // A per-PAGE constant: a reload (or a new document) gets a new one.
  const timeOrigin = perf && Number.isFinite(perf.timeOrigin) ? perf.timeOrigin : null;
  const w = typeof window !== "undefined" ? window : undefined;
  const p = w === undefined ? undefined : w.__roadProbe;
  if (p === undefined || p === null || typeof p !== "object") return { present: false, nowMs, timeOrigin };
  const ring = Array.isArray(p.road) ? p.road : [];
  const lastSeq = arg && typeof arg.lastSeq === "number" ? arg.lastSeq : null;
  const rows = [];
  if (lastSeq !== null) {
    // The ring is seq-ascending; walk back from the newest to the first unseen.
    let i = ring.length - 1;
    while (i >= 0 && ring[i] && ring[i].seq > lastSeq) i--;
    for (let k = i + 1; k < ring.length; k++) rows.push(ring[k]);
  }
  const out = {
    present: true,
    version: p.version,
    ringSize: p.ringSize,
    probeSeq: p.seq,
    oldestSeq: ring.length ? ring[0].seq : null,
    ringLength: ring.length,
    routeDerivations: p.routeDerivations,
    rows,
    nowMs,
    timeOrigin,
  };
  const lastDerivations = arg && typeof arg.lastDerivations === "number" ? arg.lastDerivations : null;
  if (p.routeDerivations !== lastDerivations) out.route = p.route === undefined ? null : p.route;
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE RECORD
 * ──────────────────────────────────────────────────────────────────────────*/

function seqBook() {
  return { gaps: { count: 0, missedTicks: 0 }, overruns: { count: 0, evictedTicks: 0 } };
}

export function createRoadRecord() {
  return {
    schema: ROAD_RECORD_SCHEMA,
    reads: 0,
    presentReads: 0,
    absentReads: 0,
    errorReads: 0,
    errors: [],
    /** probe versions seen, by count — anything but ROAD_PROBE_VERSION_READ is UNMEASURED */
    versions: {},
    ringSize: null,
    /** seq of the probe at the FIRST read. Rows up to it were produced before
     *  the harness began polling and are NOT recorded (only counted). */
    firstReadSeq: null,
    preWatchTicks: null,
    lastSeq: null,
    rows: [],
    duplicateRows: 0,
    rowsWithoutSeq: 0,
    /** discontinuities in `seq` inside the record — ticks the record does not hold */
    ...seqBook(),
    /** A RELOAD: the page's timeOrigin changed, its clock ran backwards, or the
     *  probe's seq did. Nothing after it is merged under this leg's name. */
    resets: 0,
    resetSignal: null,
    truncatedByReset: false,
    readsAfterReset: 0,
    routes: [],
    lastDerivations: null,
    /** derivations published between two reads and overwritten unseen */
    missedDerivations: 0,
    /** each read that found derivations missing: { afterDerivation, missed, atSeq } */
    missedDerivationEvents: [],
    /** derivations published before the first read (only the newest is visible) */
    preWatchDerivations: null,
    /** the page (performance.timeOrigin) and its clock (performance.now) */
    pageOrigin: null,
    firstNowMs: null,
    lastNowMs: null,
    /** THE DRIVE-END WATERMARK: the last drive tick's seq, stamped when the drive
     *  ends. Rows after it are the release / settle, not the leg. */
    driveEndSeq: null,
    driveEndNowMs: null,
    postDrive: { rows: [], ...seqBook(), routes: 0, missedDerivations: 0 },
    /** harness-side cost of each read, ms */
    costMs: [],
    /** THE POLL BUDGET — each tick-boundary poll, timed against the tick's idle
     *  budget it is folded into. `overBudget` polls stretched a control period. */
    pollBudget: { tickBudgetMs: null, polls: 0, overBudget: 0, maxMs: null },
  };
}

/** Stamp the drive's end: every tick after the record's current seq is booked
 *  to `postDrive`, never to the leg's metrics or to its overrun count. */
export function markDriveEnd(rec) {
  if (rec.driveEndSeq !== null) return;
  rec.driveEndSeq = rec.lastSeq ?? 0;
  rec.driveEndNowMs = rec.lastNowMs;
}

/** Why this read is a different page from the record's, or null. */
function resetSignalOf(rec, read) {
  if (rec.pageOrigin !== null && Number.isFinite(read.timeOrigin) && read.timeOrigin !== rec.pageOrigin) {
    return `the page's performance.timeOrigin changed (${rec.pageOrigin} → ${read.timeOrigin}): a new document`;
  }
  if (rec.lastNowMs !== null && Number.isFinite(read.nowMs) && read.nowMs < rec.lastNowMs) {
    return `the page clock ran backwards (performance.now ${rec.lastNowMs} → ${read.nowMs}): a reload`;
  }
  if (rec.lastSeq !== null && Number.isFinite(read.probeSeq) && read.probeSeq < rec.lastSeq) {
    return `the probe's seq ran backwards (${rec.lastSeq} → ${read.probeSeq}): a fresh probe`;
  }
  return null;
}

/**
 * Fold one read into the record. `read` is `roadProbePageRead`'s return, or
 * `{ error: string }` when the evaluate threw. `costMs` is what the harness
 * measured around the evaluate. RETURNS NOTHING.
 */
export function mergeRoadRead(rec, read, { costMs } = {}) {
  rec.reads += 1;
  if (Number.isFinite(costMs) && rec.costMs.length < COST_KEPT) rec.costMs.push(costMs);
  if (read === null || read === undefined || typeof read !== "object" || typeof read.error === "string") {
    rec.errorReads += 1;
    if (rec.errors.length < ERRORS_KEPT) {
      rec.errors.push(String(read && typeof read === "object" ? read.error : "read returned nothing"));
    }
    return;
  }
  if (read.present !== true) {
    rec.absentReads += 1;
    return;
  }
  rec.presentReads += 1;
  const vKey = String(read.version);
  rec.versions[vKey] = (rec.versions[vKey] ?? 0) + 1;
  if (Number.isFinite(read.ringSize)) rec.ringSize = read.ringSize;
  if (rec.truncatedByReset) {
    rec.readsAfterReset += 1;
    return;
  }

  // A RELOAD restarts the page's clock (and a fresh probe its seq). Merging
  // across it would publish a second page's ticks under this leg's name — and
  // an early reload does NOT always run seq backwards (the new page can issue
  // more ticks before the next read than the old one had), so the page clock
  // is checked FIRST, before a single row of this read is booked.
  const reset = resetSignalOf(rec, read);
  if (reset !== null) {
    rec.resets += 1;
    rec.resetSignal = reset;
    rec.truncatedByReset = true;
    return;
  }
  if (Number.isFinite(read.timeOrigin) && rec.pageOrigin === null) rec.pageOrigin = read.timeOrigin;
  if (Number.isFinite(read.nowMs)) {
    if (rec.firstNowMs === null) rec.firstNowMs = read.nowMs;
    rec.lastNowMs = read.nowMs;
  }

  const post = rec.driveEndSeq !== null;
  const book = post ? rec.postDrive : rec;
  const sink = post ? rec.postDrive.rows : rec.rows;

  // THE FIRST READ SETS THE WATERMARK and records no rows (see firstReadSeq).
  if (rec.firstReadSeq === null) {
    const seq0 = Number.isFinite(read.probeSeq) ? read.probeSeq : 0;
    rec.firstReadSeq = seq0;
    rec.preWatchTicks = seq0;
    rec.lastSeq = seq0;
  } else if (Number.isFinite(read.oldestSeq) && read.oldestSeq > rec.lastSeq + 1) {
    book.overruns.count += 1;
    book.overruns.evictedTicks += read.oldestSeq - rec.lastSeq - 1;
  }

  const seqBefore = rec.lastSeq;
  const rows = Array.isArray(read.rows) ? read.rows : [];
  const withSeq = [];
  for (const r of rows) {
    if (r === null || typeof r !== "object" || !Number.isFinite(r.seq)) rec.rowsWithoutSeq += 1;
    else withSeq.push(r);
  }
  withSeq.sort((a, b) => a.seq - b.seq);
  for (const r of withSeq) {
    if (r.seq <= rec.lastSeq) {
      rec.duplicateRows += 1;
      continue;
    }
    if (r.seq > rec.lastSeq + 1) {
      book.gaps.count += 1;
      book.gaps.missedTicks += r.seq - rec.lastSeq - 1;
    }
    sink.push(r);
    rec.lastSeq = r.seq;
  }
  // A probe that issued seqs this read did not hand back is a gap too — at the
  // END of the record, where the loop above cannot see it until a later row.
  if (Number.isFinite(read.probeSeq) && read.probeSeq > rec.lastSeq) {
    book.gaps.count += 1;
    book.gaps.missedTicks += read.probeSeq - rec.lastSeq;
    rec.lastSeq = read.probeSeq;
  }

  if ("route" in read && Number.isFinite(read.routeDerivations)) {
    const n = read.routeDerivations;
    if (rec.lastDerivations === null) {
      rec.preWatchDerivations = Math.max(0, n - (read.route ? 1 : 0));
    } else if (n - rec.lastDerivations > 1) {
      const missed = n - rec.lastDerivations - 1;
      if (post) rec.postDrive.missedDerivations += missed;
      else {
        rec.missedDerivations += missed;
        if (rec.missedDerivationEvents.length < EVENTS_KEPT) {
          rec.missedDerivationEvents.push({ afterDerivation: rec.lastDerivations, missed, atSeq: seqBefore });
        }
      }
    }
    if (post) rec.postDrive.routes += 1;
    else if (n > 0) {
      rec.routes.push(
        read.route
          ? { derivation: n, liveAfterSeq: read.route.afterSeq, route: read.route }
          : // A derivation that returned no route publishes `null` and no afterSeq.
            // It happened after the watermark this read began from, so the rows
            // after that watermark are booked to NO route — conservative: they
            // leave the curved bucket rather than join a stale one.
            { derivation: n, liveAfterSeq: seqBefore, route: null },
      );
    }
    rec.lastDerivations = n;
  }
}

/** Why this record cannot be measured, or null when it can. */
export function roadRecordUnmeasured(rec) {
  if (rec.reads === 0) return "the probe was never read (the drive loop did not run a tick)";
  if (rec.errorReads === rec.reads) {
    return `every read of window.__roadProbe threw (${rec.errorReads}×): ${rec.errors[0] ?? "no message"}`;
  }
  if (rec.absentReads + rec.errorReads === rec.reads) {
    return (
      `window.__roadProbe was absent on every read (${rec.absentReads} absent, ${rec.errorReads} errored) — ` +
      "a production-like server, or a build older than W59 increment 1"
    );
  }
  const bad = Object.keys(rec.versions).filter((v) => v !== String(ROAD_PROBE_VERSION_READ));
  if (bad.length) {
    return `probe version ${bad.join(", ")} is not the version this reader was written against (${ROAD_PROBE_VERSION_READ})`;
  }
  if (rec.rows.length === 0) return "the probe was present but published no tick while the harness watched the drive";
  return null;
}

/** The sidecar, in memory (rows as objects). `serializeRoadSidecar` packs it. */
export function roadRecordSidecar(rec, extra = {}) {
  const unmeasured = roadRecordUnmeasured(rec);
  const rows = toCriteriaRows(rec.rows);
  const periodSec = rows.length ? medianWallPeriodSec(rows) : null;
  const sorted = [...rec.costMs].sort((a, b) => a - b);
  return {
    schema: ROAD_RECORD_SCHEMA,
    witness: "window.__roadProbe (devrig/roadProbe.ts, DEV BUILDS ONLY) — read as a witness, never as an input",
    scenario: null,
    platform: null,
    mode: null,
    steerBy: null,
    ...extra,
    ...(unmeasured ? { unmeasured } : {}),
    tickRateHz: periodSec ? 1 / periodSec : null,
    reads: rec.reads,
    presentReads: rec.presentReads,
    absentReads: rec.absentReads,
    errorReads: rec.errorReads,
    errors: rec.errors,
    versions: rec.versions,
    ringSize: rec.ringSize,
    firstReadSeq: rec.firstReadSeq,
    preWatchTicks: rec.preWatchTicks,
    pageOrigin: rec.pageOrigin,
    watchedSpanMs:
      rec.firstNowMs !== null && (rec.driveEndNowMs ?? rec.lastNowMs) !== null
        ? (rec.driveEndNowMs ?? rec.lastNowMs) - rec.firstNowMs
        : null,
    gaps: rec.gaps,
    overruns: rec.overruns,
    duplicateRows: rec.duplicateRows,
    rowsWithoutSeq: rec.rowsWithoutSeq,
    resets: rec.resets,
    resetSignal: rec.resetSignal,
    truncatedByReset: rec.truncatedByReset,
    readsAfterReset: rec.readsAfterReset,
    missedDerivations: rec.missedDerivations,
    missedDerivationEvents: rec.missedDerivationEvents,
    preWatchDerivations: rec.preWatchDerivations,
    driveEndSeq: rec.driveEndSeq,
    postDrive: {
      ticks: rec.postDrive.rows.length,
      gaps: rec.postDrive.gaps,
      overruns: rec.postDrive.overruns,
      routes: rec.postDrive.routes,
      missedDerivations: rec.postDrive.missedDerivations,
    },
    pollBudget: { ...rec.pollBudget },
    readCostMs: sorted.length
      ? {
          n: sorted.length,
          median: percentile(sorted, 0.5),
          p90: percentile(sorted, 0.9),
          max: sorted[sorted.length - 1],
          totalMs: sorted.reduce((a, b) => a + b, 0),
        }
      : null,
    route: rec.routes,
    rows: rec.rows,
    postDriveRows: rec.postDrive.rows,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE SIDECAR ON DISK — rows as columns, gzip.
 *
 * A column holds one value per row; a row where the field was ABSENT is listed
 * in the column's `absent` ranges (its slot in `v` is a placeholder null), so
 * absent and `null` survive the round trip as the two different things they
 * are. `position` is split into the `x` and `y` columns.
 * ──────────────────────────────────────────────────────────────────────────*/

const LEAD_COLUMNS = ["seq", "wallMs", "t", "x", "y", "headingDeg", "speedKmh", "laneOffsetM", "laneId", "gear"];

function flatRow(r) {
  const o = {};
  for (const [k, v] of Object.entries(r ?? {})) {
    if (k === "position" && v && typeof v === "object") {
      if (v.x !== undefined) o.x = v.x;
      if (v.y !== undefined) o.y = v.y;
    } else if (v !== undefined) o[k] = v;
  }
  return o;
}

export function encodeRowColumns(rows) {
  const flat = (rows ?? []).map(flatRow);
  const keys = new Set();
  for (const r of flat) for (const k of Object.keys(r)) keys.add(k);
  const order = [...LEAD_COLUMNS.filter((k) => keys.has(k)), ...[...keys].filter((k) => !LEAD_COLUMNS.includes(k)).sort()];
  const cols = {};
  for (const k of order) {
    const v = [];
    const absent = [];
    let open = null;
    flat.forEach((r, i) => {
      const has = Object.prototype.hasOwnProperty.call(r, k);
      v.push(has ? r[k] : null);
      if (!has) {
        if (open && open[1] === i - 1) open[1] = i;
        else absent.push((open = [i, i]));
      }
    });
    cols[k] = absent.length ? { v, absent } : { v };
  }
  return { encoding: "columns/1", n: flat.length, cols };
}

export function decodeRowColumns(enc) {
  if (Array.isArray(enc)) return enc; // a v1 sidecar: rows as objects already
  if (!enc || typeof enc !== "object" || !Number.isInteger(enc.n)) return [];
  const out = Array.from({ length: enc.n }, () => ({}));
  for (const [k, c] of Object.entries(enc.cols ?? {})) {
    const absent = new Set();
    for (const [a, b] of c.absent ?? []) for (let i = a; i <= b; i++) absent.add(i);
    for (let i = 0; i < enc.n; i++) if (!absent.has(i)) out[i][k] = c.v[i];
  }
  for (const r of out) {
    if ("x" in r || "y" in r) {
      r.position = { x: r.x, y: r.y };
      delete r.x;
      delete r.y;
    }
  }
  return out;
}

/** In-memory sidecar → the gzip bytes written as `_audit-road.json.gz`. */
export function serializeRoadSidecar(side) {
  const packed = { ...side, rows: encodeRowColumns(side.rows), postDriveRows: encodeRowColumns(side.postDriveRows) };
  return gzipSync(Buffer.from(`${JSON.stringify(packed)}\n`, "utf8"));
}

/** Bytes (gzip or plain JSON, v1 or v2) → the sidecar with its rows as objects. */
export function parseRoadSidecar(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes), "utf8");
  const text = buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf).toString("utf8") : buf.toString("utf8");
  const side = JSON.parse(text);
  if (side && typeof side === "object") {
    side.rows = decodeRowColumns(side.rows);
    if (side.postDriveRows !== undefined) side.postDriveRows = decodeRowColumns(side.postDriveRows);
  }
  return side;
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE ADAPTER
 * ──────────────────────────────────────────────────────────────────────────*/

const OPTIONAL = [
  "laneCount",
  "edgeId",
  "opposingBank",
  "oneway",
  "wrongWay",
  // THE FOUNDER-RULED DIRECTION SIGNAL (2026-09-20). `wrongWay` alone is
  // ambiguous by construction — «with the flow» and «nobody asked» share the
  // value `false` — and every defence the criteria built against that ambiguity
  // (the liveness gate, the witness floor) could only be armed by the offence
  // itself. These three carry the unambiguous form: the SIGNED nose-vs-edge
  // angle, whether the conviction channel was asked, and the edge it was
  // measured against. Absent stays absent, and `alignDeg: null` WITH the record
  // present means «the runtime looked and could not measure» — a third state
  // that must not collapse into either of the others.
  "alignDeg",
  "wrongWayArmed",
  "alignEdgeId",
  "alignOffCarriageway",
  "alignTravelDir",
  "alignRoundabout",
  "sM",
  "distM",
  "centreLinePainted",
  "laneLinesPainted",
  "worldEdgeClearanceM",
];

/** RoadProbeRecord → road-criteria row. Absent stays absent; null stays null. */
export function toCriteriaRows(probeRows) {
  const out = [];
  for (const r of probeRows ?? []) {
    const row = { seq: r.seq, wallMs: r.wallMs };
    if (r.t !== undefined) row.tSec = r.t;
    for (const k of ["speedKmh", "gear", "laneOffsetM", "laneId", "headingDeg"]) {
      if (r[k] !== undefined) row[k] = r[k];
    }
    if (r.position && Number.isFinite(r.position.x) && Number.isFinite(r.position.y)) {
      row.x = r.position.x;
      row.y = r.position.y;
    }
    for (const k of OPTIONAL) if (r[k] !== undefined) row[k] = r[k];
    out.push(row);
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE ROUTE-DERIVED CURVED BUCKET (spec AC-2)
 *
 * The bucket is a property of the ROUTE, computed from `probe.route` alone: a
 * route segment is curved when the absolute heading change of the route's
 * vertices inside the CURVATURE_WINDOW_M centred on its midpoint reaches
 * CURVED_DEG_PER_100M per 100 m.
 *
 * THE LANE-ALIGN SHIFT IS DEBITED AT ITS KINKS, NOT BLANKED OVER ITS SPAN.
 * guidanceRoute.ts `alignRawToGoalLane` slides the route sideways into the
 * goal's lane with a weight that eases in over [legStartS, rampEndS], holds 1
 * to holdToS and decays over [holdToS, decayEndS]; the probe publishes those
 * marks per derivation (`route.laneAlign`, in the route's own arclength).
 *
 * THE RAMPS ARE LINEAR, so each one adds a CONSTANT lateral slope, not
 * curvature: the shift manufactures |Δheading| only where that slope CHANGES,
 * which is at the four published marks and nowhere else. Measured on a straight
 * road driven through the product's own shift, 100.0% of the manufactured
 * heading lands within SPAN_KINK_REACH_M of a mark, and each mark carries
 * exactly `atan(Δslope)`:
 *   ease-in  |offsetM| · (1 − w0) / rampInM              at legStartS, rampEndS
 *   decay    |offsetM| / GUIDANCE_LANE_ALIGN_RAMP_M      at holdToS,   decayEndS
 * A mark with no route on one side of it (legStartS at s = 0, a mark past the
 * route's end) carries no kink, and a zero-length ease-in or decay carries none.
 *
 * So each window SUMS EVERY VERTEX and then DEBITS what the shift put there:
 * per kink cluster, `min(atan(Δslope), the heading this window actually summed
 * inside that cluster's reach)`. The cap is what makes the debit safe — it can
 * only ever SHRINK a window's rate, so it cannot manufacture a curved verdict,
 * and on a straight road it cancels the shift to within 0.01°.
 *
 * EXCLUDING THE STRETCH INSTEAD WAS THE DEFECT (fixed w63). `legStartS` is the
 * last junction before the goal — which on a turning lesson is the very place
 * the ROAD turns — and ease-in + decay are 80 m of a ~100 m route, so blanking
 * both stretches threw the road's own bend away with the shift's kinks:
 * sc-turn-left-oncoming (90° of turn) and sc-rb-busy-gap (364°) both produced
 * an EMPTY curved bucket and could never be eligible for the AC-2 freeze.
 *
 * A route that does NOT SAY (`laneAlign` absent, or a mark or shift parameter
 * not finite — a contract breach, since probe version 2 always sets it) has an
 * UNKNOWN shift: its ticks are booked `rowsUnderUnknownSpan`, join no bucket,
 * and the freeze refuses the leg. Never a guess.
 *
 * A TICK joins the bucket when its nearest point on the route live for it lies
 * in a curved interval. There is NO distance gate on that projection, on
 * purpose (a car that drove straight past a bend must not leave the bucket by
 * being far from it); the distance is published, and the freeze refuses a leg
 * whose curved ticks lie beyond a stated cap from the route.
 * ──────────────────────────────────────────────────────────────────────────*/

function wrap180(d) {
  let x = ((d + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

const SPAN_FIELDS = ["legStartS", "rampEndS", "holdToS", "decayEndS", "rampInM", "offsetM", "w0"];

const MARK_EPS = 1e-6;
const atanDeg = (slope) => (Math.atan(slope) * 180) / Math.PI;

/**
 * The kinks this derivation's lane-align shift manufactured, from the product's
 * own `route.laneAlign` alone: `{ known, kinks, clusters, span }`, where a kink
 * is `{ s, deg, mark }` and a cluster is `{ fromS, toS, deg }` — kinks whose
 * SPAN_KINK_REACH_M neighbourhoods touch, merged so no vertex is debited twice.
 * `known: false` (with `why`) when the route does not say.
 *
 * `totalLen` bounds which marks can carry a kink: a slope change needs route on
 * BOTH sides of it. Verified against four live derivations of
 * sc-ln-boulevard-discipline, where the amplitudes below reproduce every
 * vertex of a perfectly straight road's heading change to within 0.01°.
 */
export function laneAlignKinks(route) {
  const la = route?.laneAlign;
  const none = (extra) => ({ kinks: [], clusters: [], ...extra });
  if (la === undefined) return none({ known: false, why: "route.laneAlign absent", span: undefined });
  if (la === null) return none({ known: true, span: null });
  if (typeof la !== "object") return none({ known: false, why: "route.laneAlign is not an object", span: undefined });
  const bad = SPAN_FIELDS.filter((k) => !Number.isFinite(la[k]));
  if (bad.length) return none({ known: false, why: `route.laneAlign.${bad.join(", ")} not finite`, span: la });
  const end = Number.isFinite(route?.totalLen) ? route.totalLen : Infinity;
  const inside = (s) => s > MARK_EPS && s < end - MARK_EPS;
  const kinks = [];
  const add = (s, deg, mark) => {
    if (deg > MARK_EPS && inside(s)) kinks.push({ s, deg, mark });
  };
  if (la.rampInM > MARK_EPS && la.rampEndS > la.legStartS + MARK_EPS) {
    const deg = atanDeg((Math.abs(la.offsetM) * Math.max(0, 1 - la.w0)) / la.rampInM);
    add(la.legStartS, deg, "legStartS");
    add(la.rampEndS, deg, "rampEndS");
  }
  if (la.decayEndS > la.holdToS + MARK_EPS) {
    const deg = atanDeg(Math.abs(la.offsetM) / GUIDANCE_LANE_ALIGN_RAMP_M);
    add(la.holdToS, deg, "holdToS");
    add(la.decayEndS, deg, "decayEndS");
  }
  kinks.sort((a, b) => a.s - b.s);
  const R = SPAN_KINK_REACH_M;
  const clusters = [];
  for (const k of kinks) {
    const last = clusters[clusters.length - 1];
    if (last && k.s - R <= last.toS) {
      last.toS = Math.max(last.toS, k.s + R);
      last.deg += k.deg;
    } else clusters.push({ fromS: Math.max(0, k.s - R), toS: k.s + R, deg: k.deg });
  }
  return { known: true, kinks, clusters, span: la };
}

/** [{ fromS, toS }] curved intervals of one route, net of its lane-align kinks. */
export function curvedIntervals(route, opts = {}) {
  const degPer100m = opts.degPer100m ?? CURVED_DEG_PER_100M;
  const windowM = opts.windowM ?? CURVATURE_WINDOW_M;
  const n = route?.count ?? 0;
  const pts = route?.pts ?? [];
  const arc = route?.arc ?? [];
  const shift = laneAlignKinks(route);
  if (!shift.known) return { intervals: [], unknownSpan: true, shift };
  if (n < 3) return { intervals: [], unknownSpan: false, shift };
  const clusters = shift.clusters;
  const hdg = [];
  for (let i = 0; i + 1 < n; i++) {
    const dx = pts[2 * (i + 1)] - pts[2 * i];
    const dy = pts[2 * (i + 1) + 1] - pts[2 * i + 1];
    hdg.push(Math.hypot(dx, dy) > 1e-9 ? (Math.atan2(dx, dy) * 180) / Math.PI : null);
  }
  // turn at vertex i (between segment i-1 and i), located at arc[i]. EVERY
  // vertex is summed; what the shift manufactured comes off as a debit below.
  const turns = [];
  let prev = null;
  for (let i = 0; i < hdg.length; i++) {
    if (hdg[i] === null) continue;
    if (prev !== null) turns.push({ s: arc[i], deg: Math.abs(wrap180(hdg[i] - prev)) });
    prev = hdg[i];
  }
  const intervals = [];
  const push = (a, b) => {
    if (!(b > a)) return;
    const last = intervals[intervals.length - 1];
    if (last && Math.abs(last.toS - a) < 1e-9) last.toS = b;
    else intervals.push({ fromS: a, toS: b });
  };
  for (let i = 0; i + 1 < n; i++) {
    const mid = (arc[i] + arc[i + 1]) / 2;
    const lo = mid - windowM / 2;
    const hi = mid + windowM / 2;
    let sum = 0;
    for (const t of turns) if (t.s >= lo && t.s <= hi) sum += t.deg;
    // THE DEBIT. Clusters are disjoint, so their `local` sums are disjoint
    // subsets of `sum` and the total debit can never exceed it.
    let debit = 0;
    for (const c of clusters) {
      if (c.toS < lo || c.fromS > hi) continue;
      let local = 0;
      for (const t of turns) if (t.s >= Math.max(lo, c.fromS) && t.s <= Math.min(hi, c.toS)) local += t.deg;
      debit += Math.min(c.deg, local);
    }
    if (((sum - debit) / windowM) * 100 < degPer100m) continue;
    push(arc[i], arc[i + 1]);
  }
  return { intervals, unknownSpan: false, shift };
}

/** Nearest point on the route polyline: { s, distM }. */
export function projectOnRoute(route, x, y) {
  const n = route?.count ?? 0;
  const pts = route.pts;
  const arc = route.arc;
  let best = null;
  for (let i = 0; i + 1 < n; i++) {
    const ax = pts[2 * i];
    const ay = pts[2 * i + 1];
    const dx = pts[2 * i + 2] - ax;
    const dy = pts[2 * i + 3] - ay;
    const L2 = dx * dx + dy * dy;
    const u = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
    const px = ax + u * dx;
    const py = ay + u * dy;
    const d = Math.hypot(x - px, y - py);
    if (best === null || d < best.distM) best = { s: arc[i] + u * (arc[i + 1] - arc[i]), distM: d };
  }
  return best;
}

/** The route entry live for a row: the newest derivation published before it.
 *  `afterSeq` is the last seq published BEFORE the derivation, so the row
 *  carrying that seq belongs to the previous route. */
export function routeFor(routes, seq) {
  let live = null;
  for (const r of routes) if (Number.isFinite(r.liveAfterSeq) && r.liveAfterSeq < seq) live = r;
  return live;
}

function distBook(ds) {
  const sd = [...ds].sort((a, b) => a - b);
  return sd.length ? { p50: percentile(sd, 0.5), p90: percentile(sd, 0.9), max: sd[sd.length - 1] } : null;
}

/**
 * Seq spans of rows whose projection falls in a curved interval of the route
 * live for them. Returns the spans and the projection book.
 */
export function curvedSeqSpans(rows, routes, opts = {}) {
  const byDerivation = new Map();
  const spans = [];
  const dists = [];
  const curvedDists = [];
  let rowsWithoutRoute = 0;
  let rowsWithoutPosition = 0;
  let rowsUnderUnknownSpan = 0;
  let curvedRows = 0;
  let open = null;
  for (const r of rows) {
    const live = routeFor(routes ?? [], r.seq);
    let curved = false;
    if (live === null || live.route === null) rowsWithoutRoute += 1;
    else if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) rowsWithoutPosition += 1;
    else {
      if (!byDerivation.has(live.derivation)) byDerivation.set(live.derivation, curvedIntervals(live.route, opts));
      const { intervals, unknownSpan } = byDerivation.get(live.derivation);
      const pr = unknownSpan ? null : projectOnRoute(live.route, r.x, r.y);
      if (unknownSpan) rowsUnderUnknownSpan += 1;
      else if (pr) {
        dists.push(pr.distM);
        curved = intervals.some((iv) => pr.s >= iv.fromS && pr.s <= iv.toS);
        if (curved) curvedDists.push(pr.distM);
      }
    }
    if (curved) {
      curvedRows += 1;
      if (open) open.toSeq = r.seq;
      else open = { fromSeq: r.seq, toSeq: r.seq };
    } else if (open) {
      spans.push(open);
      open = null;
    }
  }
  if (open) spans.push(open);
  return {
    spans,
    book: {
      curvedRows,
      rowsWithoutRoute,
      rowsWithoutPosition,
      rowsUnderUnknownSpan,
      derivationsUsed: [...byDerivation.keys()],
      derivationsWithUnknownSpan: [...byDerivation.entries()].filter(([, v]) => v.unknownSpan).map(([k]) => k),
      curvedIntervals: Object.fromEntries(
        [...byDerivation.entries()].map(([k, v]) => [k, { unknownSpan: v.unknownSpan, shift: v.shift, intervals: v.intervals }]),
      ),
      projectionDistM: distBook(dists),
      curvedProjectionDistM: distBook(curvedDists),
      method:
        `route-derived, pre-drive: a route segment is curved when |Δheading| of the route vertices inside the ` +
        `${opts.windowM ?? CURVATURE_WINDOW_M} m centred on it reaches ${opts.degPer100m ?? CURVED_DEG_PER_100M}°/100 m; ` +
        "every vertex is summed and the product's own lane-align shift (route.laneAlign) is then DEBITED at the four " +
        `marks where its linear ramps change slope — atan(|offsetM|·(1−w0)/rampInM) at legStartS and rampEndS, ` +
        `atan(|offsetM|/${GUIDANCE_LANE_ALIGN_RAMP_M}) at holdToS and decayEndS, each capped by the heading the window ` +
        `actually summed within ${SPAN_KINK_REACH_M} m of it, so the debit can only shrink a rate and never raise one; ` +
        "a route that does not publish its shift joins no bucket; a tick joins by its nearest route point, with no distance gate",
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE BASELINE
 * ──────────────────────────────────────────────────────────────────────────*/

const NOT_A_VERDICT =
  "BASELINE (W59 increment 2) — measurements only. No threshold here is frozen and nothing here judges the product or the harness.";

/** A curved sample is SHORT unless a floor was computed AND met. No floor is short. */
export function sampleShortOf(counts) {
  if (!Number.isFinite(counts?.sampleFloor)) return true;
  return (counts.gradedTicks ?? 0) < counts.sampleFloor;
}

/**
 * Spec AC-2B, on criteria rows. The NUMERATOR is the spec's: a wrong-bank tick
 * on a two-way edge (`surfaceOf` — `edgeId != null && oneway === false`, by
 * reference) that is MOVING and in a FORWARD gear (the engine's own two
 * predicates, by reference). Standstill and reverse wrong-bank ticks, and the
 * all-ticks count, are published beside it and never folded in.
 */
export function ac2bCounts(rows) {
  const twoWay = rows.filter((r) => surfaceOf(r) === SURFACE.TWO_WAY);
  const wrong = twoWay.filter((r) => r.opposingBank === true);
  const spec = wrong.filter((r) => engineMoving(r) && engineForwardGear(r)).length;
  const standstill = wrong.filter((r) => !engineMoving(r)).length;
  const reverse = wrong.filter((r) => engineMoving(r) && !engineForwardGear(r)).length;
  const den = twoWay.length;
  return {
    twoWayOnRoadTicks: den,
    wrongBankTicks: spec,
    wrongBankFrac: den ? spec / den : null,
    standstillWrongBankTicks: standstill,
    reverseWrongBankTicks: reverse,
    allWrongBankTicks: wrong.length,
    allWrongBankFrac: den ? wrong.length / den : null,
  };
}

/**
 * AC-2 / AC-2B / AC-6 (+ record, referent) over one leg, as measurements.
 * `rows` are CRITERIA rows (`toCriteriaRows`). `opts.routes` are the record's
 * route derivations; `opts.watchedSpanMs` is the page clock over the watched
 * window — the one duration the rows did not author.
 */
export function roadBaseline(rows, opts = {}) {
  if (opts.unmeasured) return { kind: "baseline", notAVerdict: NOT_A_VERDICT, unmeasured: opts.unmeasured };
  if (!Array.isArray(rows) || rows.length === 0) {
    return { kind: "baseline", notAVerdict: NOT_A_VERDICT, unmeasured: "no probe rows" };
  }
  const { spans, book } = curvedSeqSpans(rows, opts.routes ?? [], opts.curvature ?? {});
  const declared = {
    curvedSpans: spans,
    ...(Number.isFinite(opts.watchedSpanMs) ? { expectedSpanMs: opts.watchedSpanMs } : {}),
    // roadProbe.ts `roadRecordOf` copies both discriminators when the tick carries them.
    channels: ["opposingBank", "wrongWay"],
  };
  // PINNED AT ANALYSIS TIME. The spans are route-derived, but their seq
  // membership needs the drive, so this pin certifies nothing about pre-drive
  // authorship. It exists only so the criteria module will compute at all.
  declared.spansHash = declaredSpansHash(declared);

  const rec = assessRecordCompleteness(rows, declared);
  const ref = assessReferentLiveness(rows, declared);
  const flow = assessFlow(rows, declared);
  const lane = assessLaneHolding(rows, declared);
  const two = flow.surfaces?.twoWay ?? { counts: {}, metrics: {} };
  const one = flow.surfaces?.oneWay ?? { counts: {}, metrics: {} };
  const L = lane.counts ?? {};
  const M = lane.metrics ?? {};
  const b = ac2bCounts(rows);

  return {
    kind: "baseline",
    notAVerdict: NOT_A_VERDICT,
    tickRateHz: M.tickRateHz ?? null,
    ac2: {
      p90AbsOffsetM: M.p90AbsOffsetM ?? null,
      maxAbsOffsetM: M.maxAbsOffsetM ?? null,
      legP90AbsOffsetM: M.legP90AbsOffsetM ?? null,
      gradedTicks: L.gradedTicks ?? 0,
      curvedTicksTotal: L.curvedTicksTotal ?? 0,
      legGradedTicks: L.legGradedTicks ?? 0,
      sampleFloor: L.sampleFloor ?? null,
      sampleShort: sampleShortOf(L),
      longestExcursionSec: M.longestExcursionSec ?? null,
      cumulativeExcursionSec: M.cumulativeExcursionSec ?? null,
      excursionTicks: L.excursionTicks ?? null,
      ceilingM: LANE_HOLD_P90_CEILING_M,
    },
    ac2b: {
      ...b,
      numerator: "moving (speed > movingSpeedKmh) AND forward gear (gear >= 0) AND opposingBank on edgeId != null && oneway === false",
      criteriaAgainstFlowTicks: two.counts.againstFlowTicks ?? 0,
      criteriaAgainstFlowFrac: two.metrics.againstFlowFrac ?? null,
      longestWrongBankRunSec: two.metrics.longestUndeclaredRunSec ?? null,
      contradictoryRows: two.counts.contradictoryRows ?? 0,
      oneWayOnRoadTicks: one.counts.denominator ?? 0,
      wrongWayTrueTicks: one.counts.discriminatorTrueTicks ?? 0,
      wrongWayUnknownTicks: one.counts.discriminatorUnknownTicks ?? 0,
      unclassifiedTicks: flow.counts?.unclassifiedTicks ?? null,
      noSample: b.twoWayOnRoadTicks === 0,
    },
    ac6: {
      offRoadTicks: L.offRoadTicks ?? 0,
      saturatedTicks: L.saturatedTicks ?? 0,
      unpaintedTicks: L.unpaintedTicks ?? 0,
      opposingBankTicks: L.opposingBankTicks ?? 0,
      notMovingTicks: L.notMovingTicks ?? 0,
      reverseTicks: L.reverseTicks ?? 0,
      excludedFrac: M.excludedFrac ?? null,
      longestExcludedRunSec: M.longestExcludedRunSec ?? null,
      legOffRoadTicks: L.legOffRoadTicks ?? 0,
      legSaturatedTicks: L.legSaturatedTicks ?? 0,
      legUnpaintedTicks: L.legUnpaintedTicks ?? 0,
      legExcludedFrac: M.legExcludedFrac ?? null,
      offWorldTicks: L.offWorldTicks ?? 0,
      saturationBoundM: PRODUCT.LANE_WIDTH_M / 2,
    },
    record: { counts: rec.counts, metrics: rec.metrics },
    referent: {
      onRoadRows: ref.counts?.onRoadRows ?? 0,
      distinctOffsets: ref.counts?.distinctOffsets ?? null,
      spreadM: ref.metrics?.spreadM ?? null,
    },
    curvature: { ...book, curvedSpans: spans.length, spansPinnedAt: "analysis time (post-drive); certifies no pre-drive authorship" },
    ticks: rows.length,
  };
}

const f = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(d));

export const ROAD_LINE_HEAD = "ROAD (witness, baseline — not a verdict): ";

/** The ONE run.log line. */
export function roadBaselineLine(sidecar, base) {
  const head = ROAD_LINE_HEAD;
  if (sidecar?.disabled) return `${head}OFF — ${sidecar.unmeasured}`;
  if (base.unmeasured) return `${head}UNMEASURED — ${base.unmeasured}`;
  const a = base.ac2;
  const b = base.ac2b;
  const c = base.ac6;
  const pd = sidecar.postDrive ?? { ticks: 0 };
  return (
    head +
    `AC-2B wrong-bank ${b.wrongBankTicks}/${b.twoWayOnRoadTicks} two-way moving+forward` +
    `${b.noSample ? " (NO SAMPLE)" : ` = ${f(b.wrongBankFrac, 3)}`} ` +
    `[standstill ${b.standstillWrongBankTicks} · reverse ${b.reverseWrongBankTicks} · all ticks ${b.allWrongBankTicks}` +
    `${b.noSample ? "" : ` = ${f(b.allWrongBankFrac, 3)}`}] · ` +
    `AC-2 p90 |lane| ${f(a.p90AbsOffsetM)} m curved (n ${a.gradedTicks}/${a.curvedTicksTotal}, floor ${a.sampleFloor ?? "—"}${a.sampleShort ? " SHORT" : ""}) · ` +
    `leg p90 ${f(a.legP90AbsOffsetM)} m (n ${a.legGradedTicks}) · max ${f(a.maxAbsOffsetM)} m · ` +
    `AC-6 excluded ${f(c.excludedFrac, 3)} curved (run ${f(c.longestExcludedRunSec, 1)} s) / ${f(c.legExcludedFrac, 3)} leg ` +
    `(off-road ${c.legOffRoadTicks}, saturated ${c.legSaturatedTicks}, unpainted ${c.legUnpaintedTicks}) · ` +
    `${base.ticks} ticks @ ${f(base.tickRateHz, 1)} Hz · gaps ${sidecar.gaps.count} (${sidecar.gaps.missedTicks} ticks) · ` +
    `overruns ${sidecar.overruns.count} · resets ${sidecar.resets} · post-drive ${pd.ticks} tick${pd.ticks === 1 ? "" : "s"} (not measured) · ` +
    `unknown-span ticks ${base.curvature?.rowsUnderUnknownSpan ?? "—"} · ` +
    `polls over the ${sidecar.pollBudget?.tickBudgetMs ?? "—"} ms tick budget ${sidecar.pollBudget?.overBudget ?? "—"}/${sidecar.pollBudget?.polls ?? "—"} · ` +
    `read ${sidecar.readCostMs ? `med ${sidecar.readCostMs.median} ms max ${sidecar.readCostMs.max} ms` : "—"}`
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE SINK — the one object lesson-audit.mjs holds.
 * ──────────────────────────────────────────────────────────────────────────*/

const clip = (e, n = 240) => String(e?.message ?? e).slice(0, n);

/**
 * `createRoadWitness(readProbe, { enabled, meta, log, now, tickBudgetMs })` →
 * frozen `{ poll, finish }`.
 *
 * `readProbe(arg)` is the ONLY way this sink touches the page: lesson-audit
 * passes `(arg) => page.evaluate(roadProbePageRead, arg)`, frozen. The sink
 * holds that function, `log`, and copies of `meta`'s strings — nothing else of
 * the caller's — and writes to none of them (road-record.test.mjs §SINK
 * executes it against unfrozen inputs and compares every own property).
 *
 *   · `poll()`      — one incremental read of `window.__roadProbe`, folded into
 *                     the record in this closure, and timed against
 *                     `tickBudgetMs` (a poll over it is booked). Resolves to
 *                     `undefined`; never throws; a no-op when disabled or after
 *                     `finish`.
 *   · `finish(dir)` — stamps the DRIVE-END watermark at the last poll's seq,
 *                     reads once more (the release / settle ticks, booked to
 *                     `postDrive` and never measured), writes
 *                     `<dir>/_audit-road.json.gz`, and hands the ROAD line to
 *                     `log`. Resolves to `undefined`; never throws; once only.
 *
 * `enabled: false` (lesson-audit: `KNIJKA_ROAD_WITNESS=0`) reads nothing and
 * writes a sidecar that says the witness was off. `meta` is copied, not held.
 */
export function createRoadWitness(readProbe, opts = {}) {
  const enabled = opts.enabled !== false;
  const str = (v) => (typeof v === "string" ? v : v === null || v === undefined ? null : String(v));
  const meta = {
    scenario: str(opts.meta?.scenario),
    platform: str(opts.meta?.platform),
    mode: str(opts.meta?.mode),
    steerBy: str(opts.meta?.steerBy),
  };
  const reader = typeof readProbe === "function" ? readProbe : null;
  const log = typeof opts.log === "function" ? opts.log : () => {};
  const now = typeof opts.now === "function" ? opts.now : Date.now;
  const tickBudgetMs = Number.isFinite(opts.tickBudgetMs) ? opts.tickBudgetMs : null;
  const rec = createRoadRecord();
  rec.pollBudget.tickBudgetMs = tickBudgetMs;
  let finished = false;

  async function readOnce() {
    const startedAt = now();
    let got;
    try {
      if (reader === null) throw new Error("the witness was given no reader function");
      got = await reader({ lastSeq: rec.lastSeq, lastDerivations: rec.lastDerivations });
    } catch (error) {
      got = { error: clip(error) };
    }
    try {
      mergeRoadRead(rec, got, { costMs: now() - startedAt });
    } catch (error) {
      try {
        mergeRoadRead(rec, { error: `merge threw: ${clip(error, 200)}` });
      } catch {
        /* the record is a witness; the drive goes on */
      }
    }
  }

  async function poll() {
    if (!enabled || finished) return;
    const startedAt = now();
    try {
      await readOnce();
    } catch {
      /* unreachable: readOnce catches its own */
    }
    // THE BUDGET: this poll is folded into the tick's idle wait; one longer
    // than the whole budget stretched the control period, and is booked.
    const ms = now() - startedAt;
    const b = rec.pollBudget;
    b.polls += 1;
    if (Number.isFinite(ms)) {
      if (b.maxMs === null || ms > b.maxMs) b.maxMs = ms;
      if (tickBudgetMs !== null && ms > tickBudgetMs) b.overBudget += 1;
    }
  }

  async function finish(dir) {
    if (finished) return;
    finished = true;
    let line;
    try {
      let side;
      if (!enabled) {
        side = {
          ...roadRecordSidecar(createRoadRecord(), meta),
          disabled: true,
          unmeasured: `the witness was switched off (${ROAD_WITNESS_ENV}=0); the probe was not read`,
        };
        side.baseline = roadBaseline([], { unmeasured: side.unmeasured });
      } else {
        markDriveEnd(rec);
        await readOnce();
        side = roadRecordSidecar(rec, meta);
        side.baseline = roadBaseline(toCriteriaRows(rec.rows), {
          routes: rec.routes,
          watchedSpanMs: side.watchedSpanMs,
          unmeasured: side.unmeasured,
        });
      }
      line = roadBaselineLine(side, side.baseline);
      writeFileSync(join(String(dir), ROAD_SIDECAR_FILE), serializeRoadSidecar(side));
    } catch (error) {
      line = `${ROAD_LINE_HEAD}UNMEASURED — the record could not be measured or written (${clip(error, 200)})`;
    }
    try {
      log(`  ${line}`);
    } catch {
      /* a log that throws is the log's problem, not the drive's */
    }
  }

  return Object.freeze({ poll: Object.freeze(poll), finish: Object.freeze(finish) });
}
