// road-baseline.test.mjs — the round tabulator over a SYNTHETIC round.
//
//   node --test tools/audit/road-baseline.test.mjs
//
// Current sidecars are produced by the real pipeline — the product's
// roadProbe.ts writes, lib/road-record.mjs's witness reads, merges, measures
// and gzips — then laid out as lanes on disk the way lesson-audit.mjs leaves
// them. The OLD-SCHEMA sidecars are real too: `__fixtures__/road-sidecar-v1.json`
// was written by the increment-2 v1 code (lesson-audit's own finish, plain
// JSON, rows as objects) and `road-sidecar-v2.json.gz` by the v2 witness, both
// over the same product probe.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { publishRoadProbeRoute, publishRoadProbeTick } from "../../platform/src/modules/sim/devrig/roadProbe.ts";
import { EXCLUDED_FRACTION_CEILING, PRODUCT } from "../mobile/lib/road-criteria.mjs";
import {
  ROAD_RECORD_SCHEMA,
  ROAD_SIDECAR_FILE,
  ROAD_SIDECAR_FILE_V1,
  createRoadWitness,
  parseRoadSidecar,
  roadProbePageRead,
} from "../mobile/lib/road-record.mjs";
import {
  FREEZE_PROJECTION_CAP_M,
  FREEZE_REQUIRED,
  freezeCandidate,
  freezeEligibility,
  freezeReasons,
  formatRound,
  laneRow,
  schemaRefusal,
  tabulateRound,
} from "./road-baseline.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STEP = { state: { phase: "driving", currentObjectiveIndex: 0, objectives: [] }, hudEvents: [] };
const V1_BYTES = fs.readFileSync(path.join(HERE, "__fixtures__", "road-sidecar-v1.json"));
const V2_BYTES = fs.readFileSync(path.join(HERE, "__fixtures__", "road-sidecar-v2.json.gz"));

/** 100 m N, a 90° bend (R 60), 60 m E, a junction TURN (published), 100 m S to
 *  the goal — with the product's lane-align span opening at that junction. */
function route() {
  const xy = [];
  for (let s = 0; s < 100; s += 2) xy.push([0, s]);
  for (let s = 0; s < (Math.PI / 2) * 60; s += 2) xy.push([60 - 60 * Math.cos(s / 60), 100 + 60 * Math.sin(s / 60)]);
  for (let s = 0; s < 60; s += 2) xy.push([60 + s, 160]);
  for (let s = 0; s <= 100; s += 2) xy.push([120, 160 - s]);
  const pts = [];
  const arc = [];
  let acc = 0;
  let jS = 0;
  xy.forEach((p, i) => {
    if (i) acc += Math.hypot(p[0] - xy[i - 1][0], p[1] - xy[i - 1][1]);
    pts.push(p[0], p[1]);
    arc.push(acc);
    if (p[0] === 120 && p[1] === 160) jS = acc;
  });
  return {
    pts, arc, count: xy.length, totalLen: acc, goalS: acc,
    turns: [{ s: jS, x: 120, y: 160, side: "right", dirX: 0, dirY: -1 }],
    laneAlign: { legStartS: jS, rampEndS: jS + 40, rampInM: 40, goalS: acc, holdToS: acc, decayEndS: acc, offsetM: 3.5, w0: 0 },
  };
}

function at(r, s) {
  for (let i = 0; i + 1 < r.count; i++) {
    if (s <= r.arc[i + 1]) {
      const u = (s - r.arc[i]) / (r.arc[i + 1] - r.arc[i] || 1);
      return { x: r.pts[2 * i] + u * (r.pts[2 * i + 2] - r.pts[2 * i]), y: r.pts[2 * i + 1] + u * (r.pts[2 * i + 3] - r.pts[2 * i + 1]) };
    }
  }
  return { x: r.pts[2 * r.count - 2], y: r.pts[2 * r.count - 1] };
}

/** The reader lesson-audit hands the witness, over `host` as the page's window. */
function reader(host) {
  return async (arg) => {
    const prev = globalThis.window;
    globalThis.window = host;
    try {
      return JSON.parse(JSON.stringify(roadProbePageRead(arg)));
    } finally {
      if (prev === undefined) delete globalThis.window;
      else globalThis.window = prev;
    }
  };
}

/** A lane's sidecar bytes from a leg held at `offset` m (± 0.1) with `ticks` ticks, through the witness. */
async function sidecarBytes({ offset = 0.8, ticks = null, mode = "right", steerBy = "ribbon", scenario = "sc-a", absent = false, over = () => ({}), routeOver = {} } = {}) {
  const host = {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "road-lane-"));
  const w = createRoadWitness(reader(host), { meta: { scenario, platform: "pc", mode, steerBy }, tickBudgetMs: 500 });
  if (absent) {
    await w.poll();
  } else {
    const r = { ...route(), ...routeOver };
    let wall = 0;
    publishRoadProbeRoute(host, r, wall);
    await w.poll();
    const n = ticks ?? Math.floor(r.totalLen / 0.5);
    for (let i = 0; i < n; i++) {
      wall += 50;
      publishRoadProbeTick(
        host,
        { t: i * 0.05, position: at(r, i * 0.5), headingDeg: 0, speedKmh: 36, laneOffsetM: offset + 0.1 * Math.sin(i), laneId: 0, gear: 1, edgeId: "e", oneway: false, ...over(i) },
        STEP,
        wall,
      );
      if (i % 10 === 9) await w.poll();
    }
    await w.poll();
  }
  await w.finish(dir);
  const bytes = fs.readFileSync(path.join(dir, ROAD_SIDECAR_FILE));
  fs.rmSync(dir, { recursive: true, force: true });
  return bytes;
}

function lane(root, name, { status = {}, gz = undefined, v1 = undefined, raw = undefined } = {}) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "_audit-status.json"), JSON.stringify(status));
  if (gz !== undefined) fs.writeFileSync(path.join(dir, ROAD_SIDECAR_FILE), gz);
  if (v1 !== undefined) fs.writeFileSync(path.join(dir, ROAD_SIDECAR_FILE_V1), v1);
  if (raw !== undefined) fs.writeFileSync(path.join(dir, ROAD_SIDECAR_FILE), raw);
}

async function round() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "road-baseline-"));
  lane(root, "sc-a__pc-right", { gz: await sidecarBytes({ offset: 0.8, scenario: "sc-a" }) });
  lane(root, "sc-h__pc-right", { gz: await sidecarBytes({ offset: 1.6, scenario: "sc-h" }) });
  // sc-b: a REAL v1 plain sidecar, as the v1 harness left it on disk.
  lane(root, "sc-v1__pc-right", { v1: V1_BYTES });
  // sc-i: a REAL v2 gzip sidecar, as the v2 witness left it.
  lane(root, "sc-v2__pc-right", { gz: V2_BYTES });
  lane(root, "sc-c__pc-right", { gz: await sidecarBytes({ offset: 0.8, scenario: "sc-c", ticks: 150 }) }); // stops before the curve
  lane(root, "sc-a__pc-wrong", { gz: await sidecarBytes({ offset: 0.8, scenario: "sc-a", mode: "wrong", steerBy: "none" }) });
  lane(root, "sc-d__pc-right", { status: { scenario: "sc-d" } });
  lane(root, "sc-e__pc-right", { gz: await sidecarBytes({ absent: true, scenario: "sc-e" }) });
  lane(root, "sc-f__pc-right", { raw: "{not json" });
  // sc-g: moving wrong-bank ticks on the approach, standstill wrong-bank ticks later
  lane(root, "sc-g__pc-right", {
    gz: await sidecarBytes({ scenario: "sc-g", over: (i) => (i >= 20 && i < 25 ? { opposingBank: true } : i >= 30 && i < 42 ? { opposingBank: true, speedKmh: 0 } : {}) }),
  });
  return root;
}

test("every lane is tabulated; the unmeasured ones say why and carry no number", async () => {
  const root = await round();
  const t = tabulateRound(root);
  assert.equal(t.lanes, 10);
  const by = Object.fromEntries(t.rows.map((r) => [r.lane, r]));
  assert.ok(by["sc-a__pc-right"].p90 > 0.8 && by["sc-a__pc-right"].p90 < 1.0);
  assert.ok(by["sc-h__pc-right"].p90 > 1.6 && by["sc-h__pc-right"].p90 < 1.8);
  assert.equal(by["sc-a__pc-right"].schema, ROAD_RECORD_SCHEMA);
  assert.equal(by["sc-a__pc-right"].wrongBank, 0);
  assert.ok(by["sc-a__pc-right"].twoWay > 600);
  assert.equal(by["sc-c__pc-right"].sampleShort, true);
  assert.match(by["sc-d__pc-right"].unmeasured, /no _audit-road\.json\.gz/);
  assert.match(by["sc-e__pc-right"].unmeasured, /absent on every read/);
  assert.match(by["sc-f__pc-right"].unmeasured, /_audit-road\.json\.gz is present but does not parse/);
  for (const k of ["sc-d__pc-right", "sc-e__pc-right", "sc-f__pc-right"]) {
    assert.equal(by[k].p90, undefined, `${k} must carry no p90`);
    assert.equal(by[k].wrongBankFrac, undefined);
  }
  fs.rmSync(root, { recursive: true, force: true });
});

test("SCHEMA-CHECKED: a REAL v1 plain sidecar and a REAL v2 gzip are READ, LISTED with why, never tabulated, never eligible", async () => {
  // The fixtures really are what the old code wrote.
  const v1 = JSON.parse(V1_BYTES.toString("utf8"));
  assert.equal(v1.schema, "road-record/1");
  assert.ok(Array.isArray(v1.rows) && v1.rows.length > 100 && typeof v1.rows[0].seq === "number", "v1 rows are objects");
  assert.ok("movingForwardWrongBankTicks" in v1.baseline.ac2b, "v1's AC-2B headline was the criteria numerator — a different number under the same name");
  assert.ok(Number.isFinite(v1.baseline.ac2.p90AbsOffsetM), "v1 carries a p90 — which must NOT reach the freeze");
  assert.equal(V2_BYTES[0], 0x1f);
  assert.equal(parseRoadSidecar(V2_BYTES).schema, "road-record/2");

  const root = await round();
  const t = tabulateRound(root);
  const r1 = t.rows.find((r) => r.lane === "sc-v1__pc-right");
  const r2 = t.rows.find((r) => r.lane === "sc-v2__pc-right");
  assert.equal(r1.schemaRefused, "schema v1 — refuted exclusion/reset logic, not eligible");
  assert.match(r2.schemaRefused, /^schema v2 — its curved bucket excluded a lane-align span GUESSED from the turn markers/);
  for (const r of [r1, r2]) {
    assert.equal(r.p90, undefined, "an old schema's numbers are not tabulated under the current names");
    assert.equal(r.wrongBank, undefined);
    assert.equal(r.freezeEligible, undefined);
    assert.equal(freezeEligibility(r), r.schemaRefused);
  }
  assert.equal(r1.lesson, "sc-v1");
  assert.equal(t.freeze.excluded.schema, 2);
  const text = formatRound(t);
  assert.match(text, /sc-v1 × pc-right\s+NOT CURRENT — schema v1 — refuted exclusion\/reset logic, not eligible/);
  assert.match(text, /NOT THE CURRENT SCHEMA \(road-record\/3\) — listed, never tabulated, never eligible:\n {2}1 × schema v1/);
  // …and the rule is per version, and absence is a refusal of its own.
  assert.equal(schemaRefusal(ROAD_RECORD_SCHEMA), null);
  assert.match(schemaRefusal(undefined), /^schema missing/);
  assert.match(schemaRefusal("road-record/9"), /^schema road-record\/9 — not the road-record\/3/);
  assert.match(laneRow("/r/sc__pc-right", {}, { scenario: "sc", mode: "right", steerBy: "ribbon", baseline: {} }).schemaRefused, /^schema missing/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("the table HEADLINES the spec's AC-2B numerator (moving + forward) and books standstill and all-ticks apart", async () => {
  const root = await round();
  const t = tabulateRound(root);
  const g = t.rows.find((r) => r.lane === "sc-g__pc-right");
  assert.equal(g.wrongBank, 5, "only the moving, forward-gear wrong-bank ticks");
  assert.equal(g.standstillWrongBank, 12);
  assert.equal(g.reverseWrongBank, 0);
  assert.equal(g.allWrongBank, 17);
  assert.equal(g.wrongBankFrac, 5 / g.twoWay);
  const text = formatRound(t);
  const line = text.split("\n").find((l) => l.startsWith("sc-g × pc-right"));
  assert.match(line, new RegExp(`^sc-g × pc-right\\s+5/${g.twoWay} = 0\\.00\\d\\s+\\[12/0/17 = 0\\.0\\d\\d\\]`));
  fs.rmSync(root, { recursive: true, force: true });
});

test("the freeze candidate is min(ceiling, corpus p90 of eligible legs), says which term bound, and prints why each leg is out", async () => {
  const root = await round();
  const t = tabulateRound(root);
  const z = t.freeze;
  assert.equal(z.frozen, false);
  assert.equal(z.distribution.n, 3, "the measured, sampled, clean, ribbon-steered, current-schema right legs: sc-a, sc-h, sc-g");
  assert.equal(z.excluded["not a right leg"], 1);
  assert.equal(z.excluded["curved sample below its floor"], 1);
  assert.equal(z.excluded.unmeasured, 3);
  assert.equal(z.excluded.schema, 2);
  assert.equal(z.reasons["not ribbon-steered"], 1, "every reason is tallied, not only the first");
  // nearest-rank p90 of three values is the largest.
  assert.equal(z.candidateM, t.rows.find((r) => r.lane === "sc-h__pc-right").p90);
  assert.equal(z.bindingTerm, "corpus p90");
  const text = formatRound(t);
  assert.match(text, /AC-2 FREEZE CANDIDATE \(printed, NOT frozen\): 1\.\d{3} m \(binding: corpus p90\)/);
  assert.match(text, /UNMEASURED — no _audit-road\.json\.gz/);
  assert.match(text, /freeze: ineligible — leg wrong, not right; steered by none, not the ribbon/);
  assert.match(text, /freeze: ineligible — curved sample \d+ below its floor \d+/);
  assert.match(text, /freeze: ELIGIBLE/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("the ceiling binds when today's legs are worse than it, and it is never exceeded", () => {
  const rows = [3.1, 2.9, 3.5].map((p90) => ({ ...OK, p90 }));
  const z = freezeCandidate(rows);
  assert.equal(z.candidateM, 2.4);
  assert.equal(z.bindingTerm, "ceiling");
  assert.equal(freezeCandidate([]).candidateM, null);
});

/** A clean eligible row. Every gated field present, every book zero. */
const OK = Object.freeze({
  schema: ROAD_RECORD_SCHEMA, leg: "right", steerBy: "ribbon", p90: 1, sampleShort: false, graded: 400, floor: 180,
  gaps: 0, missedTicks: 0, overruns: 0, resets: 0, truncatedByReset: false, missedDerivations: 0,
  wallNonMonotonic: 0, absentReads: 0, errorReads: 0, excludedFrac: 0.02, longestExcludedRunSec: 0.4, curvedProjMaxM: 3.1,
  unknownSpanTicks: 0, overBudgetPolls: 0, tickBudgetMs: 500, postDriveTicks: 0,
});

test("HONEST ELIGIBILITY: every way the record or AC-6 falls short keeps a leg out of the freeze, and says so", () => {
  assert.equal(freezeEligibility(OK), null);
  const out = (over) => freezeEligibility({ ...OK, ...over });
  assert.match(out({ overruns: 1 }), /ring overrun/);
  assert.match(out({ truncatedByReset: true }), /reset/);
  assert.match(out({ resets: 1 }), /reset/);
  assert.match(out({ steerBy: "authored-path" }), /not the ribbon/);
  assert.match(out({ steerBy: null }), /steered by unknown/);
  assert.match(out({ gaps: 2, missedTicks: 7 }), /2 seq gap\(s\), 7 tick/, "a gap WITHOUT an overrun still disqualifies");
  assert.match(out({ missedDerivations: 1 }), /route derivation/);
  assert.match(out({ wallNonMonotonic: 1 }), /wallMs not strictly increasing/);
  assert.match(out({ absentReads: 1 }), /absent on 1 read/);
  assert.match(out({ errorReads: 3 }), /3 read\(s\) of the probe threw/);
  assert.match(out({ sampleShort: true }), /below its floor/);
  assert.match(out({ unknownSpanTicks: 4 }), /4 tick\(s\) under a route that did not publish its lane-align span/);
  assert.match(out({ overBudgetPolls: 2 }), /2 witness poll\(s\) outlasted the tick's idle budget/);
  assert.match(out({ schema: "road-record/2" }), /^schema v2/);
  // AC-6, on road-criteria's own constants and at their boundaries
  assert.equal(out({ excludedFrac: EXCLUDED_FRACTION_CEILING }), null, "the ceiling is `>`, as road-criteria has it");
  assert.match(out({ excludedFrac: EXCLUDED_FRACTION_CEILING + 1e-9 }), /AC-6 unresolved: \(curved − graded\)\/curved/);
  assert.match(out({ longestExcludedRunSec: PRODUCT.LANE_KEEP_SUSTAIN_SEC }), /AC-6 unresolved: longest excluded run 3\.00 s/);
  assert.equal(out({ longestExcludedRunSec: PRODUCT.LANE_KEEP_SUSTAIN_SEC - 1e-9 }), null);
  // the projection cap
  assert.equal(FREEZE_PROJECTION_CAP_M, 2 * PRODUCT.LANE_WIDTH_M);
  assert.equal(out({ curvedProjMaxM: FREEZE_PROJECTION_CAP_M }), null);
  assert.match(out({ curvedProjMaxM: FREEZE_PROJECTION_CAP_M + 0.01 }), /from its route \(cap 16\.25 m\)/);
  // several reasons are ALL reported
  const many = freezeReasons({ ...OK, gaps: 1, overruns: 1, missedDerivations: 2 }).map((x) => x.code);
  assert.deepEqual(many, ["ring overrun", "seq gaps", "missed route derivations"]);
});

test("MISSING IS INELIGIBLE: every field a gate reads, absent / null / NaN / wrong type, is «<field> missing» — never a zero, never a false", () => {
  assert.deepEqual(
    Object.keys(FREEZE_REQUIRED).sort(),
    [
      "absentReads", "curvedProjMaxM", "errorReads", "excludedFrac", "floor", "gaps", "graded", "longestExcludedRunSec",
      "missedDerivations", "missedTicks", "overBudgetPolls", "overruns", "p90", "resets", "sampleShort", "steerBy", "tickBudgetMs",
      "truncatedByReset", "unknownSpanTicks", "wallNonMonotonic",
    ],
  );
  for (const k of Object.keys(FREEZE_REQUIRED)) {
    for (const bad of [undefined, null, Number.NaN, "0"]) {
      const row = { ...OK };
      if (bad === undefined) delete row[k];
      else row[k] = bad;
      if (k === "steerBy" && bad === "0") continue; // a string is a steerBy (and not "ribbon")
      const why = freezeEligibility(row);
      assert.ok(why !== null && why.includes(`${k} missing`), `${k} = ${String(bad)} passed as present: ${why}`);
    }
  }
  assert.match(freezeEligibility({ ...OK, truncatedByReset: 0 }), /truncatedByReset missing/, "0 is not a boolean");
  assert.match(freezeEligibility({ ...OK, schema: undefined }), /^schema missing/);
});

/** A current sidecar as the witness writes it (in memory), every book clean. */
function cleanRoad(over = {}) {
  return {
    schema: ROAD_RECORD_SCHEMA, scenario: "sc", platform: "pc", mode: "right", steerBy: "ribbon",
    gaps: { count: 0, missedTicks: 0 }, overruns: { count: 0 }, resets: 0, missedDerivations: 0, absentReads: 0, errorReads: 0,
    truncatedByReset: false, pollBudget: { tickBudgetMs: 500, polls: 90, overBudget: 0, maxMs: 40 },
    postDrive: { ticks: 900, gaps: { count: 1, missedTicks: 400 }, overruns: { count: 1, evictedTicks: 400 } },
    baseline: {
      ticks: 800, tickRateHz: 20,
      ac2b: { twoWayOnRoadTicks: 800, wrongBankTicks: 0, wrongBankFrac: 0, standstillWrongBankTicks: 0, reverseWrongBankTicks: 0, allWrongBankTicks: 0, allWrongBankFrac: 0 },
      ac2: { p90AbsOffsetM: 0.9, legP90AbsOffsetM: 0.9, maxAbsOffsetM: 1.1, gradedTicks: 300, curvedTicksTotal: 300, sampleFloor: 180, sampleShort: false },
      ac6: { excludedFrac: 0, longestExcludedRunSec: 0, legExcludedFrac: 0 },
      record: { counts: { nonMonotonicWallSteps: 0 } },
      curvature: { curvedProjectionDistM: { max: 2 }, rowsUnderUnknownSpan: 0 },
    },
    ...over,
  };
}
const withBase = (road, part, value) => ({ ...road, baseline: { ...road.baseline, [part]: value } });

test("MISSING IS INELIGIBLE, read off a SIDECAR: a nested book the sidecar does not carry never becomes 0 in the row", () => {
  const road = cleanRoad();
  assert.equal(freezeEligibility(laneRow("/r/sc__pc-right", {}, road)), null);
  const row = (r) => freezeEligibility(laneRow("/r/sc__pc-right", {}, r));
  // OWN4: `nonMonotonicWallSteps` absent must not read as 0.
  assert.match(row(withBase(road, "record", { counts: {} })), /wallNonMonotonic missing/);
  assert.match(row(withBase(road, "record", {})), /wallNonMonotonic missing/);
  // the AC-6 fields null / absent
  assert.match(row(withBase(road, "ac6", { excludedFrac: null, longestExcludedRunSec: null, legExcludedFrac: null })), /excludedFrac missing; longestExcludedRunSec missing/);
  assert.match(row(withBase(road, "ac6", {})), /excludedFrac missing/);
  assert.match(row(withBase(road, "curvature", {})), /curvedProjMaxM missing; unknownSpanTicks missing/);
  assert.match(row(withBase(road, "ac2", { ...road.baseline.ac2, sampleShort: undefined, sampleFloor: null })), /floor missing; sampleShort missing/);
  // the record's books
  const drop = (k) => {
    const r = cleanRoad();
    delete r[k];
    return r;
  };
  assert.match(row(drop("gaps")), /gaps missing; missedTicks missing/);
  assert.match(row(drop("overruns")), /overruns missing/);
  assert.match(row(drop("resets")), /resets missing/);
  assert.match(row(drop("truncatedByReset")), /truncatedByReset missing/, "an absent reset flag is not `false`");
  assert.match(row(drop("missedDerivations")), /missedDerivations missing/);
  assert.match(row(drop("absentReads")), /absentReads missing/);
  assert.match(row(drop("errorReads")), /errorReads missing/);
  assert.match(row(drop("pollBudget")), /overBudgetPolls missing/);
  // a witness built without a budget: overBudget 0 was never measured against anything
  assert.match(freezeEligibility(laneRow("/r/sc__pc-right", {}, { ...road, pollBudget: { ...road.pollBudget, tickBudgetMs: null } })), /tickBudgetMs missing/);
  assert.match(row(drop("steerBy")), /steerBy missing/);
  assert.match(row(drop("schema")), /^schema missing/);
});

test("post-drive ticks — even a post-drive OVERRUN — do not make a leg ineligible", () => {
  const road = cleanRoad();
  const row = laneRow("/r/sc__pc-right", {}, road);
  assert.equal(row.postDriveTicks, 900);
  assert.equal(freezeEligibility(row), null);
  // …and the books the row carries are the LEG's, read from the sidecar:
  assert.match(freezeEligibility(laneRow("/r/sc__pc-right", {}, { ...road, overruns: { count: 2 } })), /ring overrun ×2/);
  assert.match(freezeEligibility(laneRow("/r/sc__pc-right", {}, { ...road, missedDerivations: 1 })), /route derivation/);
  assert.match(freezeEligibility(laneRow("/r/sc__pc-right", {}, { ...road, absentReads: 2 })), /absent on 2/);
  assert.match(freezeEligibility(laneRow("/r/sc__pc-right", {}, withBase(road, "record", { counts: { nonMonotonicWallSteps: 4 } }))), /at 4 step/);
  assert.match(freezeEligibility(laneRow("/r/sc__pc-right", {}, withBase(road, "curvature", { curvedProjectionDistM: { max: 40 }, rowsUnderUnknownSpan: 0 }))), /40\.00 m from its route/);
  assert.match(freezeEligibility(laneRow("/r/sc__pc-right", {}, { ...road, pollBudget: { ...road.pollBudget, overBudget: 1 } })), /1 witness poll\(s\) outlasted/);
});

test("the witness's own sidecar carries every gated field — a clean leg through the real pipeline is ELIGIBLE, a route without its span is not", async () => {
  const good = laneRow("/r/sc-a__pc-right", {}, parseRoadSidecar(await sidecarBytes({ scenario: "sc-a" })));
  assert.equal(freezeEligibility(good), null);
  for (const k of Object.keys(FREEZE_REQUIRED)) assert.ok(good[k] !== null && good[k] !== undefined, `${k} is not produced by the pipeline`);
  const blind = laneRow("/r/sc-z__pc-right", {}, parseRoadSidecar(await sidecarBytes({ scenario: "sc-z", routeOver: { laneAlign: undefined } })));
  assert.match(freezeEligibility(blind), /tick\(s\) under a route that did not publish its lane-align span/);
});

test("a sidecar whose BASELINE says unmeasured is unmeasured, even when the record-level field is absent", () => {
  const row = laneRow("/r/sc__pc-right", {}, { schema: ROAD_RECORD_SCHEMA, scenario: "sc", mode: "right", steerBy: "ribbon", baseline: { kind: "baseline", unmeasured: "no probe rows" } });
  assert.equal(row.unmeasured, "no probe rows");
  assert.equal(row.p90, undefined);
  assert.match(freezeEligibility(row), /^unmeasured: no probe rows$/);
  assert.match(laneRow("/r/sc__pc-right", {}, { schema: ROAD_RECORD_SCHEMA, scenario: "sc" }).unmeasured, /carries no baseline/);
});

test("the CLI prints the table and exits 0; a missing round exits 2", async () => {
  const root = await round();
  const cli = path.join(HERE, "road-baseline.mjs");
  const r = spawnSync(process.execPath, [cli, root], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^ROAD BASELINE \(witness — not a verdict\)/);
  const j = spawnSync(process.execPath, [cli, root, "--json"], { encoding: "utf8" });
  assert.equal(JSON.parse(j.stdout).lanes, 10);
  assert.equal(spawnSync(process.execPath, [cli, path.join(root, "nope")], { encoding: "utf8" }).status, 2);
  fs.rmSync(root, { recursive: true, force: true });
});
