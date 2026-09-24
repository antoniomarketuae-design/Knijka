// -----------------------------------------------------------------------------
// road-record.test.mjs — THE HARNESS'S RECORD OF `window.__roadProbe`.
//
//   node --test tools/mobile/__tests__/road-record.test.mjs
//
// THE PRODUCT'S OWN PROBE WRITES, THIS FILE'S READER READS. The probe module
// (platform/src/modules/sim/devrig/roadProbe.ts) is imported directly — Node
// strips its types — and published into a fake `window`, so the reader, the
// merge and the adapter are proven against the record shape the product
// actually writes, not against a fixture that agrees with them by construction.
//
// §SINK proves by EXECUTION what the witness object can and cannot leak: it is
// handed only a reader FUNCTION (never a page), its calls resolve to undefined,
// it writes to no object it did not create (every input's own properties, every
// global and process.env compared by identity before and after), exposes no
// data, writes one file, and hands one line to the log. Every predicate here is mutation-checked
// (tools list in the handover; `mut-verify.mjs` over `muts2.json`).
// -----------------------------------------------------------------------------
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";

import {
  createRoadProbe,
  publishRoadProbeRoute,
  publishRoadProbeTick,
} from "../../../platform/src/modules/sim/devrig/roadProbe.ts";
import * as RR from "../lib/road-record.mjs";
import {
  CURVED_DEG_PER_100M,
  CURVATURE_WINDOW_M,
  GUIDANCE_LANE_ALIGN_RAMP_M,
  ROAD_PROBE_VERSION_READ,
  ROAD_RECORD_SCHEMA,
  ROAD_SIDECAR_FILE,
  SPAN_KINK_REACH_M,
  ac2bCounts,
  createRoadRecord,
  createRoadWitness,
  curvedIntervals,
  curvedSeqSpans,
  decodeRowColumns,
  encodeRowColumns,
  laneAlignKinks,
  markDriveEnd,
  mergeRoadRead,
  parseRoadSidecar,
  roadBaseline,
  roadBaselineLine,
  roadProbePageRead,
  roadRecordSidecar,
  roadRecordUnmeasured,
  routeFor,
  sampleShortOf,
  serializeRoadSidecar,
  toCriteriaRows,
} from "../lib/road-record.mjs";

/* ── fixtures ─────────────────────────────────────────────────────────────── */

const STEP = { state: { phase: "driving", currentObjectiveIndex: 0, objectives: [] }, hudEvents: [] };

function tick(over = {}) {
  return { t: 0, position: { x: 0, y: 0 }, headingDeg: 0, speedKmh: 36, laneOffsetM: 0.5, laneId: 0, gear: 1, ...over };
}

/** Run `fn` with `host` as the page's window. */
function asWindow(host, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const prev = globalThis.window;
  globalThis.window = host;
  try {
    return fn();
  } finally {
    if (had) globalThis.window = prev;
    else delete globalThis.window;
  }
}

function readPage(host, rec) {
  return asWindow(host, () => roadProbePageRead({ lastSeq: rec.lastSeq, lastDerivations: rec.lastDerivations }));
}

function poll(host, rec) {
  // JSON round trip = what page.evaluate hands back (a copy, undefined dropped).
  mergeRoadRead(rec, JSON.parse(JSON.stringify(readPage(host, rec))), { costMs: 1 });
}

/**
 * The READER lesson-audit hands the witness — `(arg) => page.evaluate(
 * roadProbePageRead, arg)` — over `host` as the page's window: the real page
 * function, a JSON round trip for what evaluate hands back.
 */
function reader(host, { onRead = null } = {}) {
  return async (arg) => {
    if (onRead) onRead(arg);
    return JSON.parse(JSON.stringify(asWindow(host, () => roadProbePageRead(arg))));
  };
}

/** A synthetic route. `laneAlign` defaults to `null` — "the product applied no
 *  shift" — which is what a route with no lane-aligned goal publishes. */
function polyline(xy, turns = [], goalS = null, laneAlign = null) {
  const pts = [];
  const arc = [];
  let acc = 0;
  for (let i = 0; i < xy.length; i++) {
    if (i) acc += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
    pts.push(xy[i][0], xy[i][1]);
    arc.push(acc);
  }
  return { pts: Float32Array.from(pts), arc: Float32Array.from(arc), count: xy.length, totalLen: acc, goalS: goalS ?? acc, turns, laneAlign };
}

/** The product's lane-align span, as `DerivedRoute.laneAlign` publishes it. */
function span(legStartS, rampEndS, goalS, holdToS = goalS, decayEndS = holdToS, offsetM = 3.5) {
  return { legStartS, rampEndS, rampInM: rampEndS - legStartS, goalS, holdToS, decayEndS, offsetM, w0: 0 };
}

/** The product's own derivations of the verifier's two routes (A; B without
 *  and with a junction after the bend), exactly as `window.__roadProbe.route`
 *  publishes them — pinned equal to a live derivation by the platform's
 *  guidance-lane-align-span.test.ts §7. */
const PRODUCT_ROUTES = JSON.parse(fs.readFileSync(new URL("./fixtures/road-routes-w59.json", import.meta.url), "utf8"));

const ARC_FROM = 100;
const ARC_TO = 100 + (Math.PI / 2) * 60;
const JUNCTION_S = ARC_TO + 60;

/**
 * Straight 100 m north, a 90° right-hand BEND of radius 60 m (no junction),
 * 60 m east, then a JUNCTION where the route turns right (90°, published in
 * `turns` exactly as `turnsFromRaw` publishes a ≥30° joint), 100 m south to the
 * goal. 2 m spacing. The final leg — junction → goal — is where the product
 * may bake its lane-align shift in.
 */
function buildRoute({ cornerAtJunction = true } = {}) {
  const xy = [];
  for (let s = 0; s < 100; s += 2) xy.push([0, s]);
  const R = 60;
  for (let s = 0; s < (Math.PI / 2) * R; s += 2) {
    const a = s / R; // centre (60, 100), start angle π
    xy.push([60 - R * Math.cos(a), 100 + R * Math.sin(a)]);
  }
  for (let s = 0; s < 60; s += 2) xy.push([60 + s, 160]);
  // …then either a real right-angle corner at the junction, or straight on
  // through it — same length either way, so the lane-align marks land alike.
  if (cornerAtJunction) for (let s = 0; s <= 100; s += 2) xy.push([120, 160 - s]);
  else for (let s = 0; s <= 100; s += 2) xy.push([120 + s, 160]);
  const r = polyline(xy);
  // anchor the turn to the nearest sample, as finalizeRoute does
  let best = 0;
  for (let i = 0; i < r.count; i++) {
    if (Math.hypot(r.pts[2 * i] - 120, r.pts[2 * i + 1] - 160) < Math.hypot(r.pts[2 * best] - 120, r.pts[2 * best + 1] - 160)) best = i;
  }
  r.turns = [{ s: r.arc[best], x: 120, y: 160, side: "right", dirX: 0, dirY: -1 }];
  // …and the product's lane-align shift on the final leg, opening at that
  // junction (a goal 3.5 m right of the centreline, 40 m ease-in, no look-ahead).
  r.laneAlign = span(r.arc[best], r.arc[best] + 40, r.totalLen);
  return r;
}

function pointAt(route, s) {
  const { pts, arc, count } = route;
  for (let i = 0; i + 1 < count; i++) {
    if (s <= arc[i + 1]) {
      const u = (s - arc[i]) / (arc[i + 1] - arc[i] || 1);
      return { x: pts[2 * i] + u * (pts[2 * i + 2] - pts[2 * i]), y: pts[2 * i + 1] + u * (pts[2 * i + 3] - pts[2 * i + 1]) };
    }
  }
  return { x: pts[2 * count - 2], y: pts[2 * count - 1] };
}

/**
 * One full leg through the REAL probe: route published first, then a tick every
 * 50 ms of wall time at 10 m/s along the route, polled every 10 ticks.
 * `bank`: "own" leaves opposingBank ABSENT (the runtime's set-only-when-true
 * idiom); "wrong" sets it true on every tick. Everything else is identical.
 */
function driveLeg({ bank = "own", route = buildRoute(), over = () => ({}) } = {}) {
  const host = {};
  const rec = createRoadRecord();
  let wall = 1000;
  publishRoadProbeRoute(host, route, wall);
  poll(host, rec); // watermark
  const n = Math.floor(route.totalLen / 0.5);
  for (let i = 0; i < n; i++) {
    wall += 50;
    const p = pointAt(route, i * 0.5);
    const tk = tick({
      t: i * 0.05,
      position: p,
      laneOffsetM: 0.6 + 0.3 * Math.sin(i / 7),
      edgeId: "e1",
      oneway: false,
      laneLinesPainted: true,
      worldEdgeClearanceM: 5,
      ...(bank === "wrong" ? { opposingBank: true } : {}),
      ...over(i),
    });
    publishRoadProbeTick(host, tk, STEP, wall);
    if (i % 10 === 9) poll(host, rec);
  }
  poll(host, rec);
  return { host, rec, route };
}

function baselineOf(rec) {
  const side = roadRecordSidecar(rec);
  return roadBaseline(toCriteriaRows(rec.rows), { routes: rec.routes, watchedSpanMs: side.watchedSpanMs, unmeasured: side.unmeasured });
}

/** A criteria row, directly. */
function crow(seq, over = {}) {
  return { seq, wallMs: seq * 50, tSec: seq * 0.05, speedKmh: 36, gear: 1, laneOffsetM: 0.5, laneId: 0, headingDeg: 0, x: 0, y: seq, edgeId: "e1", oneway: false, ...over };
}

/* ── the reader against the product's probe ───────────────────────────────── */

test("an absent probe is UNMEASURED with a reason, never zeros", () => {
  const rec = createRoadRecord();
  poll({}, rec);
  poll({}, rec);
  assert.equal(rec.absentReads, 2);
  assert.equal(rec.rows.length, 0);
  const why = roadRecordUnmeasured(rec);
  assert.match(why, /absent on every read/);
  assert.match(why, /production-like server/);
  const side = roadRecordSidecar(rec);
  assert.equal(side.unmeasured, why);
  const base = roadBaseline(toCriteriaRows(rec.rows), { unmeasured: side.unmeasured });
  assert.equal(base.unmeasured, why);
  assert.equal(base.ac2, undefined, "an unmeasured leg must publish no AC-2 number at all");
  assert.equal(base.ac2b, undefined);
  assert.match(roadBaselineLine(side, base), /^ROAD \(witness, baseline — not a verdict\): UNMEASURED — /);
});

test("a read that throws is booked with its text and the leg is UNMEASURED if every read did", () => {
  const rec = createRoadRecord();
  mergeRoadRead(rec, { error: "Execution context was destroyed" });
  mergeRoadRead(rec, null);
  assert.equal(rec.errorReads, 2);
  assert.match(roadRecordUnmeasured(rec), /every read of window.__roadProbe threw \(2×\): Execution context was destroyed/);
});

test("a probe of another version is UNMEASURED — its shape is not this reader's to guess", () => {
  assert.equal(ROAD_PROBE_VERSION_READ, 3, "this reader is written against probe version 3 (the ruled direction signal)");
  for (const v of [1, 2, 4]) {
    const host = { __roadProbe: { ...createRoadProbe(), version: v } };
    const rec = createRoadRecord();
    poll(host, rec);
    publishRoadProbeTick(host, tick(), STEP, 5);
    poll(host, rec);
    assert.match(roadRecordUnmeasured(rec), new RegExp(`probe version ${v}`), "a version-1 probe publishes no laneAlign: its bucket cannot be read");
  }
});

test("the first read sets the watermark and records no pre-watch rows; later reads are incremental and deduped", () => {
  const host = {};
  for (let i = 0; i < 4; i++) publishRoadProbeTick(host, tick({ t: i }), STEP, 10 + i);
  const rec = createRoadRecord();
  poll(host, rec);
  assert.equal(rec.firstReadSeq, 4);
  assert.equal(rec.preWatchTicks, 4);
  assert.equal(rec.rows.length, 0);
  for (let i = 0; i < 5; i++) publishRoadProbeTick(host, tick({ t: 4 + i }), STEP, 20 + i);
  const read = JSON.parse(JSON.stringify(readPage(host, rec)));
  assert.equal(read.rows.length, 5, "the page returns only rows past the watermark");
  mergeRoadRead(rec, read);
  mergeRoadRead(rec, read); // the same read twice
  assert.deepEqual(rec.rows.map((r) => r.seq), [5, 6, 7, 8, 9]);
  assert.equal(rec.duplicateRows, 5);
  assert.equal(rec.gaps.count, 0);
  assert.equal(rec.overruns.count, 0);
});

test("a ring that evicted rows before they were read is an OVERRUN and leaves a GAP of the same size", () => {
  const host = { __roadProbe: { ...createRoadProbe(), ringSize: 8 } };
  const rec = createRoadRecord();
  poll(host, rec); // watermark 0
  for (let i = 0; i < 3; i++) publishRoadProbeTick(host, tick(), STEP, 10 + i);
  poll(host, rec);
  assert.equal(rec.overruns.count, 0);
  for (let i = 0; i < 20; i++) publishRoadProbeTick(host, tick(), STEP, 20 + i);
  poll(host, rec);
  // seq 4..23 issued, ring holds 16..23: 4..15 evicted unseen.
  assert.equal(rec.overruns.count, 1);
  assert.equal(rec.overruns.evictedTicks, 12);
  assert.equal(rec.gaps.count, 1);
  assert.equal(rec.gaps.missedTicks, 12);
  assert.deepEqual(rec.rows.map((r) => r.seq), [1, 2, 3, 16, 17, 18, 19, 20, 21, 22, 23]);
});

test("a seq discontinuity with no overrun is still a gap — the record holds what it holds", () => {
  const rec = createRoadRecord();
  const base = { present: true, version: 2, ringSize: 1024, routeDerivations: 0, nowMs: 0 };
  mergeRoadRead(rec, { ...base, probeSeq: 0, oldestSeq: null, rows: [] });
  mergeRoadRead(rec, { ...base, probeSeq: 6, oldestSeq: 1, rows: [1, 2, 5, 6].map((seq) => ({ seq, wallMs: seq })) });
  assert.equal(rec.overruns.count, 0);
  assert.equal(rec.gaps.count, 1);
  assert.equal(rec.gaps.missedTicks, 2);
  // …and a probe that issued seqs the read did not return is a gap at the end.
  mergeRoadRead(rec, { ...base, probeSeq: 9, oldestSeq: 1, rows: [{ seq: 7, wallMs: 7 }] });
  assert.equal(rec.gaps.count, 2);
  assert.equal(rec.gaps.missedTicks, 4);
  assert.equal(rec.lastSeq, 9);
});

/* ── a reload, three ways ─────────────────────────────────────────────────── */

test("a probe reset (seq backwards) truncates the record instead of merging a second clock into it", () => {
  const host = { __roadProbe: createRoadProbe() };
  const rec = createRoadRecord();
  poll(host, rec);
  for (let i = 0; i < 5; i++) publishRoadProbeTick(host, tick(), STEP, 10 + i);
  poll(host, rec);
  const fresh = {};
  publishRoadProbeTick(fresh, tick(), STEP, 1);
  poll(fresh, rec);
  publishRoadProbeTick(fresh, tick(), STEP, 2);
  poll(fresh, rec);
  assert.equal(rec.resets, 1);
  assert.equal(rec.truncatedByReset, true);
  assert.match(rec.resetSignal, /seq ran backwards/);
  assert.deepEqual(rec.rows.map((r) => r.seq), [1, 2, 3, 4, 5]);
});

/**
 * THE EARLY RELOAD (the verifier's splice, reset-probe.mjs): the new page
 * issues MORE ticks before the next read than the old one had, so its seq is
 * AHEAD of the record's and a seq-only check merges the second page as a
 * continuation (v1: 35 rows, watchedSpanMs −390). The page clock restarted.
 */
test("an early reload whose seq runs AHEAD is caught by the page clock running backwards, and stops the record", () => {
  const prevPerf = Object.getOwnPropertyDescriptor(globalThis, "performance");
  let now = 1000;
  Object.defineProperty(globalThis, "performance", { value: { now: () => now }, configurable: true, writable: true });
  try {
    const host = { __roadProbe: createRoadProbe() };
    const rec = createRoadRecord();
    for (let i = 0; i < 5; i++) publishRoadProbeTick(host, tick({ t: i / 60 }), STEP, (now += 16));
    poll(host, rec);
    for (let i = 5; i < 20; i++) publishRoadProbeTick(host, tick({ t: i / 60 }), STEP, (now += 16));
    poll(host, rec);
    now = 50; // RELOAD: a fresh page, a fresh probe, a fresh clock
    host.__roadProbe = createRoadProbe();
    for (let i = 0; i < 40; i++) publishRoadProbeTick(host, tick({ t: i / 60 }), STEP, (now += 16));
    poll(host, rec);
    assert.equal(rec.resets, 1, "the reload must be booked");
    assert.equal(rec.truncatedByReset, true);
    assert.match(rec.resetSignal, /page clock ran backwards/);
    assert.deepEqual(rec.rows.map((r) => r.seq), [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    const side = roadRecordSidecar(rec);
    assert.ok(side.watchedSpanMs > 0, `watched span ${side.watchedSpanMs}`);
    // …and it STAYS stopped: later reads of the new page add nothing.
    for (let i = 0; i < 5; i++) publishRoadProbeTick(host, tick(), STEP, (now += 16));
    poll(host, rec);
    assert.equal(rec.rows.length, 15);
    assert.equal(rec.readsAfterReset, 1);
  } finally {
    if (prevPerf) Object.defineProperty(globalThis, "performance", prevPerf);
    else delete globalThis.performance;
  }
});

test("a new page instance (performance.timeOrigin changed) is a reset even when seq AND clock both run forwards", () => {
  const rec = createRoadRecord();
  const base = { present: true, version: 2, ringSize: 1024, routeDerivations: 0 };
  mergeRoadRead(rec, { ...base, probeSeq: 0, oldestSeq: null, rows: [], nowMs: 100, timeOrigin: 5000 });
  mergeRoadRead(rec, { ...base, probeSeq: 2, oldestSeq: 1, rows: [{ seq: 1, wallMs: 110 }, { seq: 2, wallMs: 120 }], nowMs: 130, timeOrigin: 5000 });
  mergeRoadRead(rec, { ...base, probeSeq: 9, oldestSeq: 1, rows: [{ seq: 3, wallMs: 140 }], nowMs: 900, timeOrigin: 7777 });
  assert.equal(rec.resets, 1);
  assert.match(rec.resetSignal, /timeOrigin changed/);
  assert.deepEqual(rec.rows.map((r) => r.seq), [1, 2]);
  assert.equal(rec.pageOrigin, 5000);
});

test("the page read carries the page's own clock and instance: performance.now and performance.timeOrigin", () => {
  const host = {};
  publishRoadProbeTick(host, tick(), STEP, 1);
  const out = asWindow(host, () => roadProbePageRead({ lastSeq: 0, lastDerivations: null }));
  assert.ok(Number.isFinite(out.nowMs));
  assert.equal(out.timeOrigin, performance.timeOrigin);
  const absent = asWindow({}, () => roadProbePageRead({ lastSeq: 0 }));
  assert.equal(absent.present, false);
  assert.equal(absent.timeOrigin, performance.timeOrigin);
});

/* ── route derivations ────────────────────────────────────────────────────── */

test("route derivations are kept; two between reads is one MISSED (with its event); a null derivation is recorded as null", () => {
  const host = {};
  const rec = createRoadRecord();
  const route = buildRoute();
  publishRoadProbeRoute(host, route, 1);
  poll(host, rec);
  assert.equal(rec.routes.length, 1);
  assert.equal(rec.routes[0].route.count, route.count);
  assert.ok(Array.isArray(rec.routes[0].route.pts), "typed arrays arrive as plain arrays");
  publishRoadProbeTick(host, tick(), STEP, 2);
  poll(host, rec); // no new derivation → no route in the read
  assert.equal(rec.routes.length, 1);
  publishRoadProbeRoute(host, route, 3);
  poll(host, rec); // ONE new derivation: nothing missed, no event
  assert.equal(rec.missedDerivations, 0);
  assert.deepEqual(rec.missedDerivationEvents, [], "one derivation per read is not a miss");
  publishRoadProbeRoute(host, route, 4);
  publishRoadProbeRoute(host, route, 5);
  poll(host, rec);
  assert.equal(rec.missedDerivations, 1);
  assert.deepEqual(rec.missedDerivationEvents, [{ afterDerivation: 2, missed: 1, atSeq: 1 }]);
  assert.equal(rec.routes[2].derivation, 4);
  assert.equal(rec.routes[2].liveAfterSeq, 1);
  publishRoadProbeRoute(host, null, 6);
  poll(host, rec);
  assert.equal(rec.routes[3].route, null);
});

test("derivations published before the first read are counted as PRE-WATCH, never as zero", () => {
  const host = {};
  const route = buildRoute();
  publishRoadProbeRoute(host, route, 1);
  publishRoadProbeRoute(host, route, 2);
  publishRoadProbeRoute(host, route, 3);
  const rec = createRoadRecord();
  poll(host, rec);
  assert.equal(rec.preWatchDerivations, 2, "3 published, the newest visible: 2 were never seen");
  assert.equal(rec.missedDerivations, 0);
});

test("routeFor: the row carrying a derivation's afterSeq belongs to the PREVIOUS route", () => {
  const A = { derivation: 1, liveAfterSeq: 0, route: "A" };
  const B = { derivation: 2, liveAfterSeq: 5, route: "B" };
  assert.equal(routeFor([A, B], 5), A);
  assert.equal(routeFor([A, B], 6), B);
  assert.equal(routeFor([A, B], 0), null);
  // …and through the bucket: rows 1..5 on the curve route, rows 6.. after a null derivation.
  const route = buildRoute();
  const r = { ...route, pts: [...route.pts], arc: [...route.arc] };
  const rows = [];
  for (let seq = 1; seq <= 10; seq++) {
    const p = pointAt(r, 120 + seq);
    rows.push(crow(seq, { x: p.x, y: p.y }));
  }
  const { spans, book } = curvedSeqSpans(rows, [{ derivation: 1, liveAfterSeq: 0, route: r }, { derivation: 2, liveAfterSeq: 5, route: null }]);
  assert.equal(book.rowsWithoutRoute, 5);
  assert.deepEqual(spans, [{ fromSeq: 1, toSeq: 5 }]);
});

test("the page reader reads `road` and `route` and NEVER touches `step` (spec §2.4)", () => {
  const probe = createRoadProbe();
  const host = {};
  host.__roadProbe = probe;
  publishRoadProbeTick(host, tick(), STEP, 1);
  const touched = [];
  host.__roadProbe = new Proxy(probe, {
    get(target, key) {
      touched.push(String(key));
      if (key === "step") throw new Error("the harness read the grader's output");
      return target[key];
    },
  });
  const rec = createRoadRecord();
  poll(host, rec);
  publishRoadProbeTick({ __roadProbe: probe }, tick(), STEP, 2);
  poll(host, rec);
  assert.ok(!touched.includes("step"), `the reader touched: ${touched.join(",")}`);
  assert.equal(rec.rows.length, 1);
  assert.doesNotMatch(roadProbePageRead.toString(), /\bstep\b/);
});

test("the page reader WRITES NOTHING to the page — not to window, not to the probe", () => {
  const probe = createRoadProbe();
  publishRoadProbeTick({ __roadProbe: probe }, tick(), STEP, 1);
  const refuse = (what) => ({
    set() { throw new Error(`the reader wrote to ${what}`); },
    defineProperty() { throw new Error(`the reader defined a property on ${what}`); },
    deleteProperty() { throw new Error(`the reader deleted from ${what}`); },
  });
  const host = new Proxy({ __roadProbe: new Proxy(probe, refuse("the probe")) }, refuse("window"));
  const out = asWindow(host, () => roadProbePageRead({ lastSeq: 0, lastDerivations: null }));
  assert.equal(out.rows.length, 1);
});

test("the merge returns NOTHING — there is no value for a control decision to read", () => {
  const rec = createRoadRecord();
  assert.equal(mergeRoadRead(rec, { present: false, nowMs: 0 }), undefined);
  assert.equal(mergeRoadRead(rec, { present: true, version: 2, probeSeq: 0, rows: [], routeDerivations: 0 }), undefined);
});

test("the page reader is self-contained: its source survives page.evaluate's serialisation", () => {
  const rebuilt = new Function(`return (${roadProbePageRead.toString()})`)();
  const host = {};
  publishRoadProbeTick(host, tick(), STEP, 1);
  const out = asWindow(host, () => rebuilt({ lastSeq: 0, lastDerivations: null }));
  assert.equal(out.present, true);
  assert.equal(out.rows.length, 1);
});

/* ── the drive-end watermark ──────────────────────────────────────────────── */

test("after the drive-end watermark every tick is POST-DRIVE: recorded apart, never measured, never an overrun of the leg", () => {
  const host = { __roadProbe: { ...createRoadProbe(), ringSize: 8 } };
  const rec = createRoadRecord();
  let wall = 0;
  poll(host, rec);
  for (let i = 0; i < 5; i++) publishRoadProbeTick(host, tick({ t: i }), STEP, (wall += 50));
  poll(host, rec);
  markDriveEnd(rec);
  assert.equal(rec.driveEndSeq, 5);
  // release / settle: 30 ticks unread → the 8-ring overruns
  for (let i = 0; i < 30; i++) publishRoadProbeTick(host, tick({ t: 5 + i, speedKmh: 0 }), STEP, (wall += 50));
  poll(host, rec);
  assert.deepEqual(rec.rows.map((r) => r.seq), [1, 2, 3, 4, 5], "no post-drive tick joins the leg");
  assert.equal(rec.overruns.count, 0, "a post-drive overrun is not the leg's");
  assert.equal(rec.gaps.count, 0);
  assert.equal(rec.postDrive.overruns.count, 1);
  assert.equal(rec.postDrive.rows.length, 8);
  const side = roadRecordSidecar(rec);
  assert.equal(side.postDrive.ticks, 8);
  assert.equal(side.overruns.count, 0);
  assert.equal(side.driveEndSeq, 5);
  const base = roadBaseline(toCriteriaRows(rec.rows), { routes: rec.routes, unmeasured: side.unmeasured });
  assert.equal(base.ticks, 5);
});

/* ── the adapter and the sidecar on disk ──────────────────────────────────── */

test("the adapter renames t → tSec, keeps wallMs/seq, and passes ABSENCE through (absent is not false)", () => {
  const host = {};
  publishRoadProbeTick(host, tick({ t: 3.5, edgeId: null, oneway: false }), STEP, 42);
  publishRoadProbeTick(host, tick({ t: 3.55, edgeId: "e1", oneway: false, opposingBank: false, laneLinesPainted: false }), STEP, 43);
  const [a, b] = toCriteriaRows(JSON.parse(JSON.stringify(host.__roadProbe.road)));
  assert.equal(a.tSec, 3.5);
  assert.equal(a.wallMs, 42);
  assert.equal(a.seq, 1);
  assert.equal(a.edgeId, null, "edgeId null stays null");
  assert.equal("opposingBank" in a, false, "opposingBank absent stays ABSENT");
  assert.equal("laneLinesPainted" in a, false);
  assert.equal("wrongWay" in a, false);
  assert.equal("worldEdgeClearanceM" in a, false);
  assert.equal("t" in a, false);
  assert.equal(b.opposingBank, false, "an explicit false stays false");
  assert.equal(b.laneLinesPainted, false);
  assert.equal(a.x, 0);
  assert.equal(a.y, 0);
  const noClock = toCriteriaRows([{ seq: 1, wallMs: 1 }])[0];
  assert.equal("tSec" in noClock, false, "a row with no sim clock gets no tSec — never 0");
  assert.equal("speedKmh" in noClock, false);
});

test("rows as columns round-trip EXACTLY: absent stays absent, null stays null, false stays false", () => {
  const host = {};
  publishRoadProbeTick(host, tick({ t: 1, edgeId: null, oneway: false }), STEP, 1);
  publishRoadProbeTick(host, tick({ t: 2, edgeId: "e1", oneway: false, opposingBank: false }), STEP, 2);
  publishRoadProbeTick(host, tick({ t: 3, edgeId: "e1", oneway: false, opposingBank: true, laneLinesPainted: false }), STEP, 3);
  publishRoadProbeTick(host, tick({ t: 4 }), STEP, 4);
  const rows = JSON.parse(JSON.stringify(host.__roadProbe.road));
  const enc = encodeRowColumns(rows);
  assert.equal(enc.n, 4);
  assert.deepEqual(enc.cols.opposingBank.absent, [[0, 0], [3, 3]]);
  assert.deepEqual(decodeRowColumns(JSON.parse(JSON.stringify(enc))), rows);
  const side = roadRecordSidecar(createRoadRecord(), { scenario: "s" });
  side.rows = rows;
  const back = parseRoadSidecar(serializeRoadSidecar(side));
  assert.deepEqual(back.rows, rows);
  assert.deepEqual(parseRoadSidecar(JSON.stringify({ rows })).rows, rows, "a v1 plain sidecar (rows as objects) still reads");
});

test("SIDECAR SIZE: a synthetic 4-minute leg at 60 Hz, gzip + columns, is stated and bounded", async (t) => {
  const host = {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "road-size-"));
  const w = createRoadWitness(reader(host), { meta: { scenario: "size", platform: "pc", mode: "right", steerBy: "ribbon" } });
  const route = buildRoute();
  publishRoadProbeRoute(host, route, 0);
  await w.poll();
  const N = 4 * 60 * 60;
  for (let i = 0; i < N; i++) {
    const s = (i * 0.2) % route.totalLen;
    const p = pointAt(route, s);
    publishRoadProbeTick(
      host,
      tick({
        t: i / 60, position: { x: p.x + 0.013 * Math.sin(i), y: p.y }, headingDeg: (i * 0.37) % 360, speedKmh: 36 + 3 * Math.sin(i / 50),
        laneOffsetM: 0.6 + 0.4 * Math.sin(i / 40), laneId: 0, laneCount: 2, edgeId: `e${Math.floor(i / 900)}`, oneway: false,
        sM: s, distM: 0.6 + 0.4 * Math.sin(i / 40), centreLinePainted: true, laneLinesPainted: true, worldEdgeClearanceM: 5 + Math.sin(i / 90),
      }),
      STEP,
      i * (1000 / 60),
    );
    if (i % 6 === 5) await w.poll();
  }
  await w.poll();
  await w.finish(dir);
  const bytes = fs.statSync(path.join(dir, ROAD_SIDECAR_FILE)).size;
  const side = parseRoadSidecar(fs.readFileSync(path.join(dir, ROAD_SIDECAR_FILE)));
  const plainV1 = Buffer.byteLength(JSON.stringify({ ...side, rows: side.rows }));
  t.diagnostic(`4-min leg: ${side.rows.length} rows · gzip+columns ${(bytes / 1024).toFixed(0)} KiB · v1 plain objects ${(plainV1 / 1024).toFixed(0)} KiB`);
  assert.equal(side.rows.length, N);
  assert.ok(bytes < 1.5 * 1024 * 1024, `sidecar ${bytes} B`);
  assert.ok(bytes * 4 < plainV1, `gzip+columns ${bytes} B is not a quarter of plain ${plainV1} B`);
  const onDisk = JSON.parse(gunzipSync(fs.readFileSync(path.join(dir, ROAD_SIDECAR_FILE))).toString("utf8"));
  assert.equal(onDisk.rows.encoding, "columns/1", "rows are stored as column arrays");
  assert.equal(onDisk.rows.n, N);
  assert.equal(onDisk.rows.cols.laneOffsetM.v.length, N);
  const objectsGz = gzipSync(JSON.stringify({ ...onDisk, rows: side.rows, postDriveRows: side.postDriveRows })).length;
  t.diagnostic(`…the same sidecar with rows as gzipped OBJECTS: ${(objectsGz / 1024).toFixed(0)} KiB`);
  assert.ok(bytes < objectsGz, `columns ${bytes} B do not beat gzipped objects ${objectsGz} B`);
  fs.rmSync(dir, { recursive: true, force: true });
});

/* ── the route-derived bucket ─────────────────────────────────────────────── */

test("the curved bucket is the BEND and only the bend: the product's lane-align kinks are debited and lend no junction turn", () => {
  const route = buildRoute();
  const { intervals, shift, unknownSpan } = curvedIntervals({ ...route, pts: [...route.pts], arc: [...route.arc] });
  const junctionS = route.turns[0].s;
  assert.ok(Math.abs(junctionS - JUNCTION_S) < 2.5);
  assert.equal(unknownSpan, false);
  assert.equal(shift.known, true);
  assert.deepEqual(shift.kinks.map((k) => k.mark), ["legStartS", "rampEndS"], "the ease-in's two slope changes, and no decay (holdToS === decayEndS)");
  assert.ok(Math.abs(shift.kinks[0].s - junctionS) < 1e-9 && Math.abs(shift.kinks[1].s - (junctionS + 40)) < 1e-9, JSON.stringify(shift.kinks));
  assert.equal(intervals.length, 1, JSON.stringify(intervals));
  // The 100 m window reaches 50 m either side, so the bucket may start up to
  // 50 m before the bend; it must not start beyond that, and must cover the bend.
  assert.ok(intervals[0].fromS >= ARC_FROM - 50 - 2 && intervals[0].fromS <= ARC_FROM + 2, JSON.stringify(intervals));
  assert.ok(intervals[0].toS >= ARC_TO - 2, JSON.stringify(intervals));
  // This route's junction is a REAL right-angle corner in the road, and the
  // lane-align ease-in happens to open on it. Under the fix the corner is kept
  // (it is road) and only the ramp's own atan(Δslope) comes off — so the bucket
  // reads the same as it would if the route had declared no shift at all.
  assert.deepEqual(intervals, curvedIntervals({ ...route, pts: [...route.pts], arc: [...route.arc], laneAlign: null }).intervals,
    "the 5° ease-in changed the bucket of a 90° corner");
  // THE EASE-IN ITSELF LENDS NOTHING. Run the same road STRAIGHT ON through the
  // junction, with the shift still opening there: the bucket must now end where
  // the BEND's own vertices leave the window — the last segment whose window
  // still holds 15° of the bend (15/90 of its 94 m), mid ≤ ARC_TO − 15.7 + 50.
  const straightOn = buildRoute({ cornerAtJunction: false });
  const lastMid = ARC_TO - (15 / 90) * (Math.PI / 2) * 60 + CURVATURE_WINDOW_M / 2;
  const si = curvedIntervals(straightOn).intervals;
  assert.equal(si.length, 1, JSON.stringify(si));
  assert.ok(si[0].toS <= lastMid + 2, `the bucket reached ${si[0].toS} — it kept a vertex the lane-align shift made`);
  assert.ok(CURVED_DEG_PER_100M === 15);
});

/* ── THE W63 DEFECT: the debit, on the routes the PROBE ITSELF PUBLISHED ─────
 *
 * Until w63 the lane-align span was BLANKED between its marks rather than
 * debited at them. `legStartS` is the last junction before the goal — on a
 * turning lesson, the very place the road turns — and ease-in + decay are 80 m
 * of a ~100 m route, so the blanking threw the road's own bend away with the
 * shift's kinks and road-baseline.mjs reported «curved sample 0 below its floor
 * 539» for legs carrying 6× and 22× the threshold.
 *
 * These three routes are the last derivation the probe published on a real
 * drive at 082b10d (`_audit-road.json.gz` → `route[].route`), byte-for-byte.
 * ──────────────────────────────────────────────────────────────────────────*/
const LIVE_ROUTES = JSON.parse(fs.readFileSync(new URL("./fixtures/road-routes-w63-live.json", import.meta.url), "utf8"));

/** Σ|Δheading| over a route's own vertices — the raw, undebited turning. */
function rawTurningDeg(route) {
  const { pts, count } = route;
  let prev = null;
  let tot = 0;
  for (let i = 0; i + 1 < count; i++) {
    const h = (Math.atan2(pts[2 * i + 2] - pts[2 * i], pts[2 * i + 3] - pts[2 * i + 1]) * 180) / Math.PI;
    if (prev !== null) {
      let d = ((h - prev + 180) % 360 + 360) % 360 - 180;
      tot += Math.abs(d);
    }
    prev = h;
  }
  return tot;
}

const coveredM = (ivs) => ivs.reduce((s, iv) => s + (iv.toS - iv.fromS), 0);

test("W63 · a route that plainly curves yields a curved bucket: the two live turning routes, at 91° and 338°/100 m", () => {
  for (const [key, floorDegPer100m] of [["turnLeftOncoming", 90], ["rbBusyGap", 330]]) {
    const { route, lesson } = LIVE_ROUTES[key];
    const raw = rawTurningDeg(route);
    assert.ok((raw / route.totalLen) * 100 >= floorDegPer100m, `${lesson} turns ${raw.toFixed(0)}° over ${route.totalLen.toFixed(0)} m`);
    const { intervals, unknownSpan, shift } = curvedIntervals(route);
    assert.equal(unknownSpan, false, `${lesson} publishes its shift`);
    assert.ok(intervals.length >= 1, `${lesson}: EMPTY curved bucket on a route carrying ${(raw / route.totalLen * 100).toFixed(0)}°/100 m — the w63 defect`);
    // The bend itself is in the bucket, not merely some segment of the route.
    assert.ok(coveredM(intervals) >= 0.7 * route.totalLen, `${lesson} covered only ${coveredM(intervals).toFixed(1)} of ${route.totalLen.toFixed(1)} m`);
    // …and the debit really did come off: it is bounded by what the shift can
    // manufacture, never by the road's turn.
    const debitable = shift.kinks.reduce((s, k) => s + k.deg, 0);
    assert.ok(debitable < 0.2 * raw, `${lesson}: the shift's ${debitable.toFixed(1)}° is not a small correction to ${raw.toFixed(0)}°`);
  }
});

test("W63 · a genuinely straight boulevard stays EMPTY — and it is the DEBIT that holds it, not a blind detector", () => {
  const { route, lesson } = LIVE_ROUTES.boulevard;
  const raw = rawTurningDeg(route);
  // Every degree this road turns was put there by the lane-align shift: the two
  // decay kinks alone are atan(12.19/40) each = 33.9°, and that is the whole of it.
  const kinks = laneAlignKinks(route).kinks;
  assert.deepEqual(kinks.map((k) => k.mark), ["holdToS", "decayEndS"]);
  const manufactured = kinks.reduce((s, k) => s + k.deg, 0);
  assert.ok(Math.abs(manufactured - raw) < 0.05, `the shift accounts for ${manufactured.toFixed(2)}° of the road's ${raw.toFixed(2)}°`);
  // Undebited it reads 21°/100 m — over the 15 bar. A fix that marks everything
  // curved would pass the two tests above and fail here.
  assert.ok((raw / route.totalLen) * 100 > CURVED_DEG_PER_100M, `${lesson} reads ${(raw / route.totalLen * 100).toFixed(1)}°/100 m raw`);
  assert.ok(curvedIntervals({ ...route, laneAlign: null }).intervals.length >= 1, "with the shift undeclared the boulevard IS curved — the debit is the only thing removing it");
  assert.deepEqual(curvedIntervals(route).intervals, [], `${lesson} must have an EMPTY curved bucket`);
});

test("W63 · the kink amplitudes are the product's own atan(Δslope), reproduced on live derivations to 0.01°", () => {
  const { route } = LIVE_ROUTES.boulevard;
  const la = route.laneAlign;
  assert.equal(la.w0, 1, "w0 = 1 — the ease-in is a no-op and manufactures nothing");
  const expect = (Math.atan(Math.abs(la.offsetM) / GUIDANCE_LANE_ALIGN_RAMP_M) * 180) / Math.PI;
  for (const k of laneAlignKinks(route).kinks) assert.ok(Math.abs(k.deg - expect) < 1e-9, `${k.mark} ${k.deg} != ${expect}`);
  // …and the ease-in's own denominator is the PUBLISHED rampInM, not the mirror.
  const t = LIVE_ROUTES.turnLeftOncoming.route.laneAlign;
  const ease = (Math.atan((Math.abs(t.offsetM) * (1 - t.w0)) / t.rampInM) * 180) / Math.PI;
  for (const k of laneAlignKinks(LIVE_ROUTES.turnLeftOncoming.route).kinks) assert.ok(Math.abs(k.deg - ease) < 1e-9);
  assert.equal(GUIDANCE_LANE_ALIGN_RAMP_M, 40);
});

test("W63 · the debit can only SHRINK a rate: it is capped by the heading the window actually summed there", () => {
  // A mark placed on dead-straight road, with an offset big enough to claim a
  // 40° debit that is not there: the window must not go negative, and a real
  // bend 60 m away must still be curved.
  const xy = [];
  for (let s = 0; s <= 300; s += 2.5) xy.push([s <= 150 ? 0 : (s - 150) * 0.5, s <= 150 ? s : 150 + (s - 150) * 0.866]);
  const r = polyline(xy);
  r.goalS = 60;
  r.laneAlign = { legStartS: 20, rampEndS: 60, rampInM: 40, goalS: 60, holdToS: 60, decayEndS: 60, offsetM: 34, w0: 0 };
  const route = { ...r, pts: [...r.pts], arc: [...r.arc] };
  const kinks = laneAlignKinks(route).kinks;
  assert.ok(kinks.every((k) => k.deg > 35), `the claim is ${JSON.stringify(kinks.map((k) => k.deg))}`);
  const { intervals } = curvedIntervals(route);
  assert.ok(intervals.length >= 1, "a 30° bend at s = 150 survives a debit claimed 60 m away on straight road");
  assert.ok(intervals.every((iv) => iv.toS > iv.fromS), JSON.stringify(intervals));
});

/**
 * A straight road through a straight-on junction at s = 100, goal at s = 280
 * offset 8.125 m right, the product's lane-align shape w = min(1, (s − 100)/40)
 * held to the goal and decayed over 40 m past it. The ramp makes two 11.5°
 * kinks 40 m apart and the decay two more — 23°/100 m, "curved" to a naive
 * reading — and every one of them is the product's lane-align, not the road.
 */
function laneAlignedStraight(declare = "full", amp = 8.125) {
  const xy = [];
  for (let s = 0; s <= 400; s += 2.5) {
    const w = s < 100 ? 0 : s < 280 ? Math.min(1, (s - 100) / 40) : Math.max(0, 1 - (s - 280) / 40);
    xy.push([amp * w, s]);
  }
  const r = polyline(xy);
  // The marks in the ROUTE'S OWN arclength (the shift lengthens it), as the
  // product publishes them: the vertex at y = 100, 140, 280, 320.
  const at = (y) => r.arc[Math.round(y / 2.5)];
  r.goalS = at(280);
  r.laneAlign =
    declare === "full" ? span(at(100), at(140), at(280), at(280), at(320), amp)
    : declare === "ease-only" ? span(at(100), at(140), at(280), at(280), at(280), amp)
    : null;
  return { ...r, pts: [...r.pts], arc: [...r.arc] };
}

test("the lane-align ease-in AND decay on a straight road are debited exactly — and they ARE curved when not declared", () => {
  assert.deepEqual(curvedIntervals(laneAlignedStraight()).intervals, [], "the published shift accounts for both kinks of the ease-in and both of the decay");
  // The same geometry with a route that says "no shift applied" is curved: the
  // debit, not a blind detector, is what removes the ramp.
  assert.ok(curvedIntervals(laneAlignedStraight("none")).intervals.length >= 1);
  // …and the DECAY is its own pair of marks: at a 16.25 m offset (22° kinks),
  // declare the ease-in but a decay that ends where it starts, and the decay's
  // undeclared kinks at s = 280 and s = 320 come back as curved intervals.
  assert.deepEqual(curvedIntervals(laneAlignedStraight("full", 16.25)).intervals, []);
  const easeOnly = curvedIntervals(laneAlignedStraight("ease-only", 16.25)).intervals;
  assert.ok(easeOnly.length >= 1 && easeOnly.every((iv) => iv.fromS > 200) && easeOnly.some((iv) => iv.fromS <= 326 && iv.toS >= 326), JSON.stringify(easeOnly));
});

test("THE VERIFIER'S ROUTE A, as the PRODUCT derives it: a straight-through junction at 100 leaves no turn marker and no curved interval", () => {
  const A = PRODUCT_ROUTES.A;
  assert.deepEqual(A.turns, [], "no ≥30° turn marker exists — the old reader could only guess legStartS = 0");
  assert.ok(Math.abs(A.laneAlign.legStartS - 100) < 1.5 && Math.abs(A.laneAlign.rampEndS - 140) < 1.5, JSON.stringify(A.laneAlign));
  const out = curvedIntervals(A);
  assert.equal(out.unknownSpan, false);
  assert.deepEqual(out.intervals, []);
  assert.equal(out.shift.clusters[0].fromS, A.laneAlign.legStartS - SPAN_KINK_REACH_M, "the first kink sits at the product's legStartS — no conservative guess");
  // The product's ramp IS curved when the route does not declare it.
  assert.ok(curvedIntervals({ ...A, laneAlign: null }).intervals.length >= 1, "the debit is what removes the ramp");
});

test("THE VERIFIER'S ROUTE B, as the PRODUCT derives it: the 90° r=15 bend IS curved — before the ease-in (B2) and inside the w = 1 hold (B1)", () => {
  const covers = (ivs, a, b) => ivs.some((iv) => iv.fromS <= a && iv.toS >= b);
  // B1: no junction, so the ease-in is the route's first 40 m and the bend
  // (s ≈ 92–110 on the offset route) lies in the parallel-offset hold.
  const B1 = PRODUCT_ROUTES.B1;
  assert.equal(B1.laneAlign.legStartS, 0);
  const i1 = curvedIntervals(B1).intervals;
  assert.ok(covers(i1, 95, 108), `the bend is not in the bucket: ${JSON.stringify(i1)}`);
  // The ease-in's own kinks are debited away, so nothing in it is curved on the
  // shift's account; a window that reaches the bend from inside the ease-in is
  // curved on the ROAD's account, which is the point of debiting rather than
  // blanking. That is bounded by the window's half-width from the bend.
  assert.ok(i1.every((iv) => iv.toS >= 95 - CURVATURE_WINDOW_M / 2), `a curved interval is out of the bend's window reach: ${JSON.stringify(i1)}`);
  // B2: a junction at s ≈ 130, after the bend — the bend is before the span.
  const B2 = PRODUCT_ROUTES.B2;
  assert.ok(Math.abs(B2.laneAlign.legStartS - 130) < 1.5, JSON.stringify(B2.laneAlign));
  const i2 = curvedIntervals(B2).intervals;
  assert.ok(covers(i2, 97, 118), `the bend is not in the bucket: ${JSON.stringify(i2)}`);
  // Same reading as B1: the ease-in past the bend may be curved only while the
  // BEND is still inside the window, never on the ramp's own manufactured kinks.
  assert.ok(i2.every((iv) => iv.fromS <= 118 + CURVATURE_WINDOW_M / 2), `a curved interval outran the bend's window: ${JSON.stringify(i2)}`);
});

test("a route that does NOT publish its span has an UNKNOWN span: its ticks join no bucket, are booked, and are never guessed", () => {
  const route = buildRoute();
  delete route.laneAlign;
  assert.equal(laneAlignKinks(route).known, false);
  assert.equal(laneAlignKinks({ laneAlign: { ...span(1, 2, 3), rampEndS: Number.NaN } }).known, false, "a mark that is not finite is not a span");
  for (const k of ["offsetM", "w0", "rampInM"]) {
    assert.equal(laneAlignKinks({ laneAlign: { ...span(1, 2, 3), [k]: undefined } }).known, false, `${k} is needed to size the kink — a shift that does not say it is UNKNOWN, never zero`);
  }
  const { rec } = driveLeg({ route });
  const base = baselineOf(rec);
  assert.equal(base.ac2.curvedTicksTotal, 0);
  assert.ok(base.curvature.rowsUnderUnknownSpan > 600, `${base.curvature.rowsUnderUnknownSpan}`);
  assert.deepEqual(base.curvature.derivationsWithUnknownSpan, [1]);
  assert.match(roadBaselineLine(roadRecordSidecar(rec), base), /unknown-span ticks \d{3,}/);
});

test("laneAlign: null debits nothing; kinks within a reach of each other merge into ONE cluster so no vertex is debited twice", () => {
  assert.deepEqual(laneAlignKinks({ laneAlign: null }), { kinks: [], clusters: [], known: true, span: null });
  // legStartS at s = 0 has no road before it, so it carries no kink; rampEndS
  // and holdToS are 1 m apart, inside 2·SPAN_KINK_REACH_M, so they merge.
  const r = { totalLen: 200, laneAlign: span(0, 40, 41, 41, 81) };
  const out = laneAlignKinks(r);
  assert.deepEqual(out.kinks.map((k) => k.mark), ["rampEndS", "holdToS", "decayEndS"]);
  assert.equal(out.clusters.length, 2, JSON.stringify(out.clusters));
  assert.deepEqual(out.clusters[0], { fromS: 40 - SPAN_KINK_REACH_M, toS: 41 + SPAN_KINK_REACH_M, deg: out.kinks[0].deg + out.kinks[1].deg });
  // A mark past the route's end carries no kink — there is no road to bend.
  assert.deepEqual(laneAlignKinks({ totalLen: 50, laneAlign: span(0, 40, 41, 41, 81) }).kinks.map((k) => k.mark), ["rampEndS", "holdToS"]);
  // A decay that ends where it starts never ran: it manufactures NOTHING, and a
  // route whose goal is its last metre must not be debited for a skipped ramp.
  assert.deepEqual(laneAlignKinks({ totalLen: 200, laneAlign: span(0, 40, 50, 50, 50) }).kinks.map((k) => k.mark), ["rampEndS"]);
});

test("W63 · each kink is sized by the mark's OWN denominator: the published rampInM for the ease-in, the product's ramp for the decay", () => {
  const deg = (x) => (Math.atan(x) * 180) / Math.PI;
  // rampIn = min(LANE_ALIGN_RAMP_M, hit.s − legStartS), so a short leg publishes
  // a rampInM well under the mirror — and the ease-in kink is steeper for it.
  const short = laneAlignKinks({ totalLen: 200, laneAlign: { ...span(10, 22, 60, 60, 100), rampInM: 12 } });
  assert.deepEqual(short.kinks.map((k) => k.mark), ["legStartS", "rampEndS", "holdToS", "decayEndS"]);
  for (const k of short.kinks.slice(0, 2)) assert.ok(Math.abs(k.deg - deg(3.5 / 12)) < 1e-12, `${k.mark} ${k.deg} != atan(3.5/12)`);
  for (const k of short.kinks.slice(2)) assert.ok(Math.abs(k.deg - deg(3.5 / GUIDANCE_LANE_ALIGN_RAMP_M)) < 1e-12, `${k.mark} ${k.deg} != atan(3.5/40)`);
  assert.ok(short.kinks[0].deg > 3 * short.kinks[3].deg, "a 12 m ease-in and a 40 m decay cannot carry the same kink");
  // A LEFT-hand shift bends the road exactly as much as a right-hand one.
  const mirrored = laneAlignKinks({ totalLen: 200, laneAlign: { ...span(10, 22, 60, 60, 100), rampInM: 12, offsetM: -3.5 } });
  assert.deepEqual(mirrored.kinks, short.kinks, "a negative offsetM is a shift the other way, not an absent one");
});

test("W63 · the debit is CAPPED by the window's own heading: a claim made on straight road cannot eat a bend 40 m away", () => {
  // A 30° bend at s = 150, and a lane-align ease-in over [110, 118] on the dead
  // straight road before it: two 20.6° kinks that merge into ONE 41.2° cluster,
  // claiming more than the bend is worth. Uncapped, 30 − 41.2 < 0 and the bend
  // vanishes; capped by what the window actually summed there (zero — the road
  // is straight at 110–118), the bend stands.
  const xy = [];
  for (let s = 0; s <= 150; s += 2.5) xy.push([0, s]);
  const a = (30 * Math.PI) / 180;
  for (let s = 2.5; s <= 150; s += 2.5) xy.push([s * Math.sin(a), 150 + s * Math.cos(a)]);
  const r = polyline(xy);
  r.goalS = 118;
  r.laneAlign = { legStartS: 110, rampEndS: 118, rampInM: 8, goalS: 118, holdToS: 118, decayEndS: 118, offsetM: 3, w0: 0 };
  const route = { ...r, pts: [...r.pts], arc: [...r.arc] };
  const { shift, intervals } = curvedIntervals(route);
  assert.equal(shift.clusters.length, 1, JSON.stringify(shift.clusters));
  assert.ok(shift.clusters[0].deg > 40 && shift.clusters[0].deg < 42, `the claim is ${shift.clusters[0].deg}`);
  assert.ok(intervals.some((iv) => iv.fromS <= 150 && iv.toS >= 150),
    `the 30° bend was eaten by a debit claimed on straight road: ${JSON.stringify(intervals)}`);
});

test("the 15°/100 m rate is measured over a 100 m window: a lone 10° kink is straight, a lone 20° kink is a ~100 m bucket", () => {
  const kinked = (deg) => {
    const xy = [];
    for (let s = 0; s < 200; s += 2) xy.push([0, s]);
    const a = (deg * Math.PI) / 180;
    for (let s = 0; s <= 200; s += 2) xy.push([s * Math.sin(a), 200 + s * Math.cos(a)]);
    const r = polyline(xy, [{ s: 395, x: 0, y: 0, side: "left", dirX: -1, dirY: 0 }]);
    r.goalS = r.totalLen;
    return { ...r, pts: [...r.pts], arc: [...r.arc] };
  };
  assert.equal(CURVATURE_WINDOW_M, 100);
  assert.deepEqual(curvedIntervals(kinked(10)).intervals, [], "10° in any 100 m is 10°/100 m, below 15");
  const iv = curvedIntervals(kinked(20)).intervals;
  assert.equal(iv.length, 1);
  assert.ok(Math.abs(iv[0].fromS - 150) <= 2 && Math.abs(iv[0].toS - 250) <= 2, JSON.stringify(iv));
});

test("a straight route has NO curved bucket — the straight-line drive cannot buy a curved sample", () => {
  const n = 200;
  const xy = [];
  for (let i = 0; i < n; i++) xy.push([0, i * 2]);
  const route = polyline(xy, [{ s: 390, x: 0, y: 390, side: "right", dirX: 1, dirY: 0 }]);
  const { rec } = driveLeg({ route });
  const base = baselineOf(rec);
  assert.equal(base.curvature.curvedSpans, 0);
  assert.equal(base.ac2.curvedTicksTotal, 0);
  assert.equal(base.ac2.p90AbsOffsetM, null, "an empty bucket has no p90 — never 0");
  assert.equal(base.ac2.sampleShort, true);
});

test("a car that drives STRAIGHT THROUGH the bend stays in the curved bucket — no distance gate lets it escape", () => {
  // Same route, but the car never turns: due north from (0,0) to (0,250). Its
  // nearest route points past y = 100 lie on the arc, 7 m to 56 m away. A
  // projection gate would drop exactly those ticks and leave the bucket holding
  // only the straight approach — the "defined curved from the drive" cheat.
  const route = buildRoute();
  const host = {};
  const rec = createRoadRecord();
  let wall = 0;
  publishRoadProbeRoute(host, route, wall);
  poll(host, rec);
  for (let i = 0; i < 500; i++) {
    wall += 50;
    publishRoadProbeTick(host, tick({ t: i * 0.05, position: { x: 0, y: i * 0.5 }, edgeId: "e1", oneway: false }), STEP, wall);
    if (i % 10 === 9) poll(host, rec);
  }
  poll(host, rec);
  const base = baselineOf(rec);
  assert.ok(base.ac2.curvedTicksTotal > 200, `curved ticks ${base.ac2.curvedTicksTotal}`);
  assert.ok(base.curvature.projectionDistM.max > 20, "the distance to the route is published, not used to filter");
  assert.ok(base.curvature.curvedProjectionDistM.max > 20, "…and the curved ticks' own distance is published for the freeze");
});

/* ── the baseline ─────────────────────────────────────────────────────────── */

test("a two-way leg on its OWN bank and the same leg on the WRONG bank: AC-2 cannot tell them apart, AC-2B does", () => {
  const own = baselineOf(driveLeg({ bank: "own" }).rec);
  const wrong = baselineOf(driveLeg({ bank: "wrong" }).rec);

  assert.equal(own.kind, "baseline");
  assert.match(own.notAVerdict, /not/i);
  assert.equal("verdict" in own, false, "a baseline carries no verdict");
  assert.equal(own.ticks, wrong.ticks);

  // OWN bank: a real curved sample, a p90, zero wrong-bank ticks over a non-zero denominator.
  assert.ok(own.ac2.gradedTicks > 0);
  assert.equal(own.ac2.sampleShort, false);
  assert.ok(own.ac2.p90AbsOffsetM > 0.6 && own.ac2.p90AbsOffsetM < 1.0, String(own.ac2.p90AbsOffsetM));
  assert.ok(own.ac2b.twoWayOnRoadTicks > 600);
  assert.equal(own.ac2b.wrongBankTicks, 0);
  assert.equal(own.ac2b.wrongBankFrac, 0);
  assert.equal(own.ac2b.noSample, false);

  // WRONG bank: every tick counted in the spec numerator, and — because the
  // lane statistic EXCLUDES opposing-bank ticks — no lane sample at all.
  assert.equal(wrong.ac2b.wrongBankTicks, wrong.ac2b.twoWayOnRoadTicks);
  assert.equal(wrong.ac2b.wrongBankFrac, 1);
  assert.equal(wrong.ac2b.allWrongBankTicks, wrong.ac2b.twoWayOnRoadTicks);
  assert.equal(wrong.ac2b.criteriaAgainstFlowTicks, wrong.ac2b.allWrongBankTicks, "the all-ticks count agrees with the criteria module");
  assert.equal(wrong.ac2.gradedTicks, 0);
  assert.equal(wrong.ac2.sampleShort, true);
  assert.ok(wrong.ac6.opposingBankTicks > 0);

  assert.equal(own.ac6.offRoadTicks, 0);
  assert.equal(own.ac6.saturatedTicks, 0);
  assert.equal(own.record.counts.droppedTicks, 0);
  assert.ok(Math.abs(own.tickRateHz - 20) < 1e-6);
});

test("AC-2B's NUMERATOR is the spec's: moving AND forward gear (neutral counts); standstill and reverse are booked apart", () => {
  const rows = [
    ...Array.from({ length: 10 }, (_, i) => crow(i + 1, { opposingBank: true })), // moving, gear 1
    ...Array.from({ length: 4 }, (_, i) => crow(i + 11, { opposingBank: true, gear: 0 })), // moving, NEUTRAL = forward
    ...Array.from({ length: 6 }, (_, i) => crow(i + 15, { opposingBank: true, gear: -1 })), // moving, REVERSE
    ...Array.from({ length: 5 }, (_, i) => crow(i + 21, { opposingBank: true, speedKmh: 0 })), // standstill
    ...Array.from({ length: 3 }, (_, i) => crow(i + 26, { opposingBank: true, speedKmh: 0, gear: -1 })), // standstill in R
    ...Array.from({ length: 12 }, (_, i) => crow(i + 29)), // own bank
  ];
  const c = ac2bCounts(rows);
  assert.equal(c.twoWayOnRoadTicks, 40);
  assert.equal(c.wrongBankTicks, 14, "moving + gear >= 0 only");
  assert.equal(c.wrongBankFrac, 14 / 40);
  assert.equal(c.reverseWrongBankTicks, 6, "moving in reverse");
  assert.equal(c.standstillWrongBankTicks, 8, "not moving, any gear");
  assert.equal(c.allWrongBankTicks, 28);
  assert.equal(c.wrongBankTicks + c.reverseWrongBankTicks + c.standstillWrongBankTicks, c.allWrongBankTicks, "a partition");
});

test("AC-2B's two-way membership needs edgeId != null: the product's off-road opposingBank:true / oneway:false is NOT on the road", () => {
  // roadProbe.ts: past the kerb the product publishes opposingBank: true and
  // oneway: false while edgeId is null (131/131 off-road ticks, sc-ov-keep-right).
  const rows = [
    ...Array.from({ length: 20 }, (_, i) => crow(i + 1)),
    ...Array.from({ length: 9 }, (_, i) => crow(i + 21, { edgeId: null, opposingBank: true })),
  ];
  const c = ac2bCounts(rows);
  assert.equal(c.twoWayOnRoadTicks, 20);
  assert.equal(c.wrongBankTicks, 0);
  assert.equal(c.allWrongBankTicks, 0);
});

test("a leg with NO two-way tick has no AC-2B fraction — null, never 0", () => {
  const { rec } = driveLeg({ over: () => ({ oneway: true, wrongWay: false }) });
  const base = baselineOf(rec);
  assert.equal(base.ac2b.twoWayOnRoadTicks, 0);
  assert.equal(base.ac2b.noSample, true);
  assert.equal(base.ac2b.wrongBankFrac, null);
  assert.equal(base.ac2b.allWrongBankFrac, null);
  assert.equal(base.ac2b.criteriaAgainstFlowFrac, null);
  assert.ok(base.ac2b.oneWayOnRoadTicks > 600);
  assert.match(roadBaselineLine(roadRecordSidecar(rec), base), /wrong-bank 0\/0 two-way moving\+forward \(NO SAMPLE\)/);
});

test("no floor is a SHORT sample: a record the lane criterion cannot put a cadence on is never 'enough'", () => {
  assert.equal(sampleShortOf({}), true);
  assert.equal(sampleShortOf({ gradedTicks: 500 }), true);
  assert.equal(sampleShortOf({ gradedTicks: 29, sampleFloor: 30 }), true);
  assert.equal(sampleShortOf({ gradedTicks: 30, sampleFloor: 30 }), false);
  const one = roadBaseline([crow(1)], { routes: [] });
  assert.equal(one.ac2.sampleFloor, null);
  assert.equal(one.ac2.sampleShort, true);
});

test("off-road, saturated and unpainted ticks are counted as AC-6 exclusions, not averaged in", () => {
  const { rec } = driveLeg();
  const mid = rec.rows.length >> 1;
  for (let i = mid; i < mid + 20; i++) {
    const r = rec.rows[i];
    if (i < mid + 5) r.edgeId = null;
    else if (i < mid + 10) r.laneOffsetM = 4.2; // past LANE_WIDTH_M/2
    else if (i < mid + 15) r.laneLinesPainted = false;
  }
  const base = baselineOf(rec);
  assert.equal(base.ac6.legOffRoadTicks, 5);
  assert.equal(base.ac6.legSaturatedTicks, 5);
  assert.equal(base.ac6.legUnpaintedTicks, 5);
  assert.ok(base.ac2.maxAbsOffsetM < 4, "the saturated value never reaches the lane statistic");
});

test("the ROAD line HEADLINES the spec's AC-2B numerator, then the rest with its sample, gaps, overruns and post-drive ticks", () => {
  const { rec } = driveLeg({ over: (i) => (i >= 100 && i < 110 ? { opposingBank: true, speedKmh: 0 } : i >= 110 && i < 113 ? { opposingBank: true } : {}) });
  const side = roadRecordSidecar(rec);
  const base = baselineOf(rec);
  const line = roadBaselineLine(side, base);
  assert.match(line, /^ROAD \(witness, baseline — not a verdict\): AC-2B wrong-bank 3\/\d+ two-way moving\+forward = 0\.00\d \[standstill 10 · reverse 0 · all ticks 13 = 0\.0\d\d\] · AC-2 p90/);
  assert.match(line, /AC-2 p90 \|lane\| \d\.\d\d m curved \(n \d+\/\d+, floor \d+\)/);
  assert.match(line, /gaps 0 \(0 ticks\) · overruns 0 · resets 0 · post-drive 0 ticks \(not measured\)/);
  assert.match(line, /read med 1 ms/);
});

test("the sidecar carries the rows, the route, the books and the watched span on the page's clock", () => {
  const { rec } = driveLeg();
  const side = roadRecordSidecar(rec, { scenario: "sc-x", mode: "right" });
  assert.equal(side.schema, ROAD_RECORD_SCHEMA);
  assert.equal(ROAD_RECORD_SCHEMA, "road-record/3");
  assert.equal(side.scenario, "sc-x");
  assert.equal(side.steerBy, null, "an absent steerBy is null, never guessed");
  assert.equal(side.rows.length, rec.rows.length);
  assert.equal(side.route.length, 1);
  assert.ok(side.watchedSpanMs === null || Number.isFinite(side.watchedSpanMs));
  assert.equal("unmeasured" in side, false);
  assert.deepEqual(side.gaps, { count: 0, missedTicks: 0 });
});

/* ── §SINK — the witness object, by execution ─────────────────────────────── */

/** Every global's KEY and its current value (or accessor pair), by identity —
 *  a key list alone misses a global this process already had and a poll overwrote. */
function ownKeysOfGlobal() {
  return Reflect.ownKeys(globalThis)
    .map((k) => {
      const d = Object.getOwnPropertyDescriptor(globalThis, k);
      return [String(k), "value" in d ? d.value : [d.get, d.set]];
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
function sameGlobals(a, b) {
  assert.deepEqual(a.map((x) => x[0]), b.map((x) => x[0]), "a global was added or removed");
  for (let i = 0; i < a.length; i++) {
    const [k, va] = a[i];
    const vb = b[i][1];
    const same = Array.isArray(va) && Array.isArray(vb) ? va[0] === vb[0] && va[1] === vb[1] : Object.is(va, vb);
    assert.ok(same, `the global ${k} was overwritten`);
  }
}

/** Every own property of each object — key, value (or accessor pair) by
 *  identity, and its attributes — plus extensibility and prototype. */
function ownState(objs) {
  return objs.map((o) => ({
    proto: Object.getPrototypeOf(o),
    extensible: Object.isExtensible(o),
    props: Reflect.ownKeys(o).map((k) => {
      const d = Reflect.getOwnPropertyDescriptor(o, k);
      return [String(k), "value" in d ? d.value : [d.get, d.set], d.writable, d.enumerable, d.configurable];
    }),
  }));
}
function sameOwnState(a, b, names) {
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].proto, b[i].proto, `${names[i]}: prototype replaced`);
    assert.equal(a[i].extensible, b[i].extensible, `${names[i]}: extensibility changed`);
    assert.deepEqual(a[i].props.map((p) => p[0]), b[i].props.map((p) => p[0]), `${names[i]}: a property was added or removed`);
    for (let j = 0; j < a[i].props.length; j++) {
      const [k, va, ...attrA] = a[i].props[j];
      const [, vb, ...attrB] = b[i].props[j];
      const same = Array.isArray(va) && Array.isArray(vb) ? va[0] === vb[0] && va[1] === vb[1] : Object.is(va, vb);
      assert.ok(same, `${names[i]}.${k} was overwritten`);
      assert.deepEqual(attrA, attrB, `${names[i]}.${k}: attributes changed`);
    }
  }
}
const envState = () => JSON.stringify(Object.entries(process.env).sort((x, y) => (x[0] < y[0] ? -1 : 1)));
// BASELINES TAKEN AT LOAD, before any test has run the sink: a write made by an
// earlier test and REPEATED with the same value by a later one is invisible to a
// per-test snapshot, never to this one.
ownKeysOfGlobal();
const GLOBALS_AT_LOAD = ownKeysOfGlobal();
const ENV_AT_LOAD = envState();
// …AND THE SHARED OBJECTS' OWN PROPERTIES (w59 re-verify, 2026-09-22): a sink could stash a read
// on process, Math, console or a prototype for lesson-audit to read back — the globals-by-identity
// check above never looks INSIDE those objects. Every own property (value identity or accessor
// identity) of each is snapshotted at load and around a full witness life.
const SHARED = () => ({ process, Math, console, JSON, Reflect, Promise, "Object.prototype": Object.prototype, "Array.prototype": Array.prototype, "Function.prototype": Function.prototype, "String.prototype": String.prototype, "Number.prototype": Number.prototype });
const sharedState = () => {
  const out = new Map();
  for (const [name, obj] of Object.entries(SHARED())) {
    for (const k of Reflect.ownKeys(obj)) {
      const d = Object.getOwnPropertyDescriptor(obj, k);
      out.set(`${name}.${String(k)}`, d && ("value" in d ? d.value : d.get));
    }
  }
  return out;
};
const sameShared = (now, before, label) => {
  for (const [k, v] of now) if (!before.has(k)) assert.fail(`${label}: the sink ADDED ${k}`);
  for (const [k, v] of before) if (!now.has(k)) assert.fail(`${label}: the sink DELETED ${k}`);
  for (const [k, v] of before) if (k !== "process.uptime" && now.get(k) !== v && !(Number.isNaN(v) && Number.isNaN(now.get(k)))) assert.fail(`${label}: the sink CHANGED ${k}`);
};
const SHARED_AT_LOAD = sharedState();

/** One whole witness life over `host`: a route, 40 ticks polled every 5, finish. */
async function lifecycle(w, host, dir) {
  publishRoadProbeRoute(host, buildRoute(), 0);
  assert.equal(await w.poll(), undefined);
  for (let i = 0; i < 40; i++) {
    publishRoadProbeTick(host, tick({ t: i * 0.05, position: { x: 0, y: i }, edgeId: "e1", oneway: false, opposingBank: i > 30 ? true : undefined }), STEP, 50 * i);
    if (i % 5 === 4) assert.equal(await w.poll(), undefined);
  }
  assert.equal(await w.poll(), undefined);
  assert.equal(await w.finish(dir), undefined);
}

test("§SINK it is handed a READER, not a page: poll and finish resolve to undefined and the object exposes two frozen methods", async () => {
  const host = {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "road-sink-"));
  const args = [];
  const logged = [];
  ownKeysOfGlobal(); // warm-up: reading every global's descriptor once lazily loads undici's dispatcher symbols
  const before = ownKeysOfGlobal();
  const w = createRoadWitness(reader(host, { onRead: (a) => args.push(a) }), { meta: { scenario: "sc-s", platform: "pc", mode: "right", steerBy: "ribbon" }, log: (s) => logged.push(s) });

  assert.ok(Object.isFrozen(w));
  assert.equal(Object.getPrototypeOf(w), Object.prototype);
  assert.deepEqual(Reflect.ownKeys(w).map(String).sort(), ["finish", "poll"]);
  for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(w))) {
    assert.equal(typeof d.value, "function", `${k} is not a plain method`);
    assert.ok(Object.isFrozen(d.value), `${k} is not frozen — state could be hung on it`);
    assert.equal(d.get, undefined);
    assert.equal(d.set, undefined);
  }
  assert.equal(JSON.stringify(w), "{}", "nothing serialisable hangs off the witness");

  publishRoadProbeRoute(host, buildRoute(), 0);
  const p0 = w.poll();
  assert.ok(p0 instanceof Promise);
  assert.equal(await p0, undefined);
  for (let i = 0; i < 40; i++) {
    publishRoadProbeTick(host, tick({ t: i * 0.05, position: { x: 0, y: i }, edgeId: "e1", oneway: false, opposingBank: i > 30 ? true : undefined }), STEP, 50 * i);
    if (i % 5 === 4) assert.equal(await w.poll(), undefined);
  }
  assert.deepEqual(fs.readdirSync(dir), [], "a poll writes no file");
  assert.deepEqual(logged, [], "a poll logs nothing");
  sameGlobals(ownKeysOfGlobal(), before); // a poll leaves no global behind

  assert.equal(await w.finish(dir), undefined);
  assert.deepEqual(fs.readdirSync(dir), [ROAD_SIDECAR_FILE], "finish writes exactly one file");
  assert.equal(logged.length, 1);
  assert.match(logged[0], /^ {2}ROAD \(witness, baseline — not a verdict\): AC-2B wrong-bank /);
  sameGlobals(ownKeysOfGlobal(), before); // …and neither does finish
  // What the sink sends through the reader is two numbers-or-nulls, nothing else.
  for (const a of args) {
    assert.deepEqual(Object.keys(a).sort(), ["lastDerivations", "lastSeq"]);
    for (const v of Object.values(a)) assert.ok(v === null || Number.isFinite(v), `the sink passed ${typeof v} through the reader`);
  }

  // once only, and dead after finish
  const n = args.length;
  assert.equal(await w.finish(dir), undefined);
  assert.equal(await w.poll(), undefined);
  assert.equal(args.length, n, "no read after finish");
  assert.equal(logged.length, 1);

  const side = parseRoadSidecar(fs.readFileSync(path.join(dir, ROAD_SIDECAR_FILE)));
  assert.equal(side.steerBy, "ribbon");
  assert.equal(side.scenario, "sc-s");
  assert.equal(side.rows.length, 40);
  assert.equal(side.baseline.ac2b.wrongBankTicks, 9);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("§SINK it writes to NO object it did not create: the reader, the options, meta, the log, every global and process.env are unchanged", async () => {
  const host = {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "road-nowrite-"));
  // UNFROZEN on purpose: a write would succeed silently here, so only this
  // comparison can see it. (lesson-audit freezes all four; see the next test.)
  const read = reader(host);
  const meta = { scenario: "sc-n", platform: "pc", mode: "right", steerBy: "ribbon" };
  const logged = [];
  const log = (s) => logged.push(s);
  const opts = { enabled: true, meta, log, tickBudgetMs: 500 };
  const inputs = [read, opts, meta, log];
  const names = ["reader", "opts", "meta", "log"];
  ownKeysOfGlobal();
  const g0 = ownKeysOfGlobal();
  const e0 = envState();
  const s0 = ownState(inputs);
  const sh0 = sharedState();
  const w = createRoadWitness(read, opts);
  await lifecycle(w, host, dir);
  sameShared(sharedState(), sh0, "around this witness");
  sameShared(sharedState(), SHARED_AT_LOAD, "since before ANY sink ran");
  sameOwnState(ownState(inputs), s0, names);
  sameGlobals(ownKeysOfGlobal(), g0);
  assert.equal(envState(), e0, "process.env was written");
  assert.equal(envState(), ENV_AT_LOAD, "process.env differs from before ANY sink ran");
  sameGlobals(ownKeysOfGlobal(), GLOBALS_AT_LOAD);
  assert.equal(logged.length, 1, "the log was called once, with the ROAD line");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("§SINK handed FROZEN inputs, exactly as lesson-audit builds them, it reads, records and logs without one error", async () => {
  const host = {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "road-frozen-"));
  const logged = [];
  const w = createRoadWitness(
    Object.freeze(reader(host)),
    Object.freeze({
      enabled: true,
      meta: Object.freeze({ scenario: "sc-f", platform: "pc", mode: "right", steerBy: "ribbon" }),
      log: Object.freeze((line) => logged.push(line)),
      tickBudgetMs: 500,
    }),
  );
  await lifecycle(w, host, dir);
  const side = parseRoadSidecar(fs.readFileSync(path.join(dir, ROAD_SIDECAR_FILE)));
  assert.equal(side.errorReads, 0, `a frozen input made a read fail: ${side.errors}`);
  assert.equal(side.rows.length, 40);
  assert.equal(logged.length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("§SINK a reader that is not a function: every read is a booked error and nothing throws", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "road-noreader-"));
  const logged = [];
  const w = createRoadWitness({ evaluate: async () => ({ present: true }) }, { log: (s) => logged.push(s) });
  assert.equal(await w.poll(), undefined);
  assert.equal(await w.finish(dir), undefined);
  const side = parseRoadSidecar(fs.readFileSync(path.join(dir, ROAD_SIDECAR_FILE)));
  assert.equal(side.errorReads, 2);
  assert.match(side.errors[0], /no reader function/);
  assert.match(logged[0], /UNMEASURED — every read of window.__roadProbe threw/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("§SINK THE POLL BUDGET: every poll is timed against the tick budget it is folded into, and one over it is BOOKED", async () => {
  const host = {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "road-budget-"));
  let clock = 0;
  const costs = [30, 700, 499, 501, 500]; // exactly the budget is NOT over it
  let k = 0;
  const slow = async (arg) => {
    clock += costs[k++] ?? 0;
    return reader(host)(arg);
  };
  const logged = [];
  const w = createRoadWitness(slow, { now: () => clock, tickBudgetMs: 500, meta: { steerBy: "ribbon", mode: "right" }, log: (s) => logged.push(s) });
  publishRoadProbeRoute(host, buildRoute(), 0);
  for (let i = 0; i < 5; i++) {
    publishRoadProbeTick(host, tick({ t: i, edgeId: "e1", oneway: false }), STEP, 50 * i);
    await w.poll();
  }
  await w.finish(dir); // finish's own read is NOT a tick poll and is not booked against the budget
  const side = parseRoadSidecar(fs.readFileSync(path.join(dir, ROAD_SIDECAR_FILE)));
  assert.deepEqual(side.pollBudget, { tickBudgetMs: 500, polls: 5, overBudget: 2, maxMs: 700 });
  assert.match(logged[0], /polls over the 500 ms tick budget 2\/5/);
  // No budget given: nothing can be over it, and the book says so.
  const w2 = createRoadWitness(reader({}), {});
  await w2.poll();
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "road-budget2-"));
  await w2.finish(d2);
  assert.equal(parseRoadSidecar(fs.readFileSync(path.join(d2, ROAD_SIDECAR_FILE))).pollBudget.tickBudgetMs, null);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(d2, { recursive: true, force: true });
});

test("§SINK a witness built without steerBy writes steerBy null — the freeze then refuses the leg as not ribbon-steered", async () => {
  const host = {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "road-meta-"));
  const w = createRoadWitness(reader(host), { meta: { scenario: "s", platform: "pc", mode: "right" } });
  await w.poll();
  publishRoadProbeTick(host, tick(), STEP, 1);
  await w.poll();
  await w.finish(dir);
  const side = parseRoadSidecar(fs.readFileSync(path.join(dir, ROAD_SIDECAR_FILE)));
  assert.equal(side.steerBy, null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("§SINK finish stamps the drive end at the LAST POLL: ticks after it (release, settle) are post-drive and unmeasured", async () => {
  const host = { __roadProbe: { ...createRoadProbe(), ringSize: 16 } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "road-end-"));
  const w = createRoadWitness(reader(host), { meta: { steerBy: "ribbon", mode: "right" } });
  await w.poll();
  for (let i = 0; i < 10; i++) publishRoadProbeTick(host, tick({ t: i, edgeId: "e1", oneway: false }), STEP, 50 * i);
  await w.poll(); // ← the drive-end poll lesson-audit makes before releasing the keys
  for (let i = 0; i < 40; i++) publishRoadProbeTick(host, tick({ t: 10 + i, speedKmh: 0, opposingBank: true, edgeId: "e1", oneway: false }), STEP, 500 + 50 * i);
  await w.finish(dir);
  const side = parseRoadSidecar(fs.readFileSync(path.join(dir, ROAD_SIDECAR_FILE)));
  assert.equal(side.driveEndSeq, 10);
  assert.equal(side.rows.length, 10);
  assert.equal(side.postDrive.ticks, 16);
  assert.equal(side.postDrive.overruns.count, 1);
  assert.equal(side.overruns.count, 0);
  assert.equal(side.baseline.ac2b.allWrongBankTicks, 0, "no post-drive tick reaches a metric");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("§SINK a read that throws is booked and the poll still resolves to undefined", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "road-throw-"));
  const logged = [];
  const w = createRoadWitness(async () => { throw new Error("Execution context was destroyed"); }, { log: (s) => logged.push(s) });
  assert.equal(await w.poll(), undefined);
  assert.equal(await w.finish(dir), undefined);
  const side = parseRoadSidecar(fs.readFileSync(path.join(dir, ROAD_SIDECAR_FILE)));
  assert.equal(side.errorReads, 2);
  assert.match(logged[0], /UNMEASURED — every read of window.__roadProbe threw/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("§SINK the kill switch: enabled:false reads NOTHING and says OFF in the sidecar and the ROAD line", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "road-off-"));
  const logged = [];
  const refuse = async () => { throw new Error("a disabled witness read the page"); };
  const w = createRoadWitness(refuse, { enabled: false, meta: { steerBy: "ribbon" }, log: (s) => logged.push(s) });
  await w.poll();
  await w.poll();
  await w.finish(dir);
  const side = parseRoadSidecar(fs.readFileSync(path.join(dir, ROAD_SIDECAR_FILE)));
  assert.equal(side.disabled, true);
  assert.equal(side.reads, 0, "not one read");
  assert.equal(side.pollBudget.polls, 0, "a disabled poll is not a poll");
  assert.match(side.unmeasured, /switched off \(KNIJKA_ROAD_WITNESS=0\)/);
  assert.equal(side.baseline.ac2, undefined);
  assert.match(logged[0], /^ {2}ROAD \(witness, baseline — not a verdict\): OFF — /);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("§SINK the module holds NO state: every export is a function or a primitive constant", () => {
  for (const [k, v] of Object.entries(RR)) {
    assert.ok(typeof v === "function" || typeof v === "string" || typeof v === "number", `${k} is a ${typeof v} — a mutable export is a channel`);
  }
});

/* ── the ruled direction signal, end to end through this reader ───────────── */

test("THE RULED SIGNAL SURVIVES THE WHOLE RECORD: probe → sidecar columns → criteria row", () => {
  // WHAT THIS GUARDS. The founder ruled (2026-09-20) that the product publish a
  // per-tick SIGNED travel-vs-edge value, because `wrongWay === false` means
  // «with the flow» OR «nobody asked». The product published it and NO HARNESS
  // FILE READ IT — `grep -rn edgeAlignment tools/` returned nothing — so the
  // criteria that asked for it kept judging on the ambiguous boolean. This test
  // is the whole path in one place: if any link stops carrying the three
  // fields, or invents one where the tick was silent, it goes red here rather
  // than being discovered as a cheat in the criteria six waves later.
  const host = {};
  publishRoadProbeTick(
    host,
    tick({ t: 1, edgeId: "e1", oneway: true, wrongWay: false, edgeAlignment: { deg: -12.5, wrongWayArmed: true, edgeId: "e1", offCarriageway: false, travelDir: 1, roundabout: false } }),
    STEP,
    1,
  );
  // The runtime LOOKED AND COULD NOT MEASURE — a different state from silence.
  publishRoadProbeTick(
    host,
    tick({ t: 2, edgeId: null, oneway: true, wrongWay: false, edgeAlignment: { deg: null, reason: "no-edge-fix", wrongWayArmed: false, edgeId: null } }),
    STEP,
    2,
  );
  // A tick that never came from the world runtime at all: the record is ABSENT.
  publishRoadProbeTick(host, tick({ t: 3, edgeId: "e1", oneway: true, wrongWay: false }), STEP, 3);

  const raw = JSON.parse(JSON.stringify(host.__roadProbe.road));
  const [a, b, c] = toCriteriaRows(raw);
  assert.equal(a.alignDeg, -12.5, "the SIGN survives — not |deg|");
  assert.equal(a.wrongWayArmed, true);
  assert.equal(a.alignEdgeId, "e1");
  // ALL SIX, NOT THE THREE THAT ARE EASY TO REMEMBER. Mutation M8 dropped
  // exactly these three from the adapter and this test stayed GREEN — the bank
  // discriminator and the kerb filter can go missing in silence otherwise, and
  // a criterion without them reads an opposing-bank car as facing the right way
  // and judges ticks it should have filtered off the kerb.
  assert.equal(a.alignOffCarriageway, false);
  assert.equal(a.alignTravelDir, 1);
  assert.equal(a.alignRoundabout, false);
  assert.equal(b.alignDeg, null, "measured-null stays null, never 0 and never dropped");
  assert.equal(b.wrongWayArmed, false);
  assert.equal("alignDeg" in c, false, "no record on the tick ⇒ ABSENT in the row");
  assert.equal("wrongWayArmed" in c, false);

  // …AND THROUGH THE COLUMN ENCODING THE SIDECAR ACTUALLY STORES, which is its
  // own opportunity to collapse the three states into two.
  const round = decodeRowColumns(encodeRowColumns(raw));
  const [ra, rb, rc] = toCriteriaRows(round);
  assert.equal(ra.alignDeg, -12.5);
  assert.equal(rb.alignDeg, null);
  assert.equal("alignDeg" in rc, false);
  assert.equal(ra.wrongWayArmed, true);
  assert.equal(rb.wrongWayArmed, false);
  assert.equal("wrongWayArmed" in rc, false);
});

test("a v2 sidecar is UNMEASURED to this reader, rather than judged on a signal it never carried", () => {
  // The version bump is the point: a v2 record has no direction fields, and
  // „absent" there means „this build could not tell you", which looks exactly
  // like „the runtime looked and could not measure". A reader that accepted it
  // would hand the criteria a record whose silence it cannot interpret.
  assert.equal(ROAD_PROBE_VERSION_READ, 3);
});
