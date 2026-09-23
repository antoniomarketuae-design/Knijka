#!/usr/bin/env node
/**
 * road-baseline.mjs — THE W59 INCREMENT-2 BASELINE ACROSS A SWEEP ROUND.
 *
 *   node tools/audit/road-baseline.mjs <roundDir> [--json]
 *
 * Reads every lane under <roundDir> (found by `_audit-status.json`, the same
 * walk route-fidelity.mjs uses) and its road-probe witness — the sidecar
 * lesson-audit.mjs writes on every leg (`_audit-road.json.gz`; the v1 plain
 * `_audit-road.json` is still read) — and tabulates, per lesson × leg:
 * AC-2B's headline (the SPEC numerator: moving AND forward-gear wrong-bank
 * ticks on two-way edges, with its fraction; standstill, reverse and all-ticks
 * beside it), AC-2's curved p90 |laneOffsetM| with its sample, AC-6's excluded
 * fraction and longest excluded run, tick counts, the record's books, and every
 * UNMEASURED reason — and, for each measured leg, whether it may inform the
 * freeze and EVERY reason it may not.
 *
 * Then the corpus distribution AC-2's operative threshold is to be FROZEN
 * against (spec §7 increment 2: at or below the 2.40 m ceiling). It PRINTS a
 * candidate and the rule that produced it. It freezes nothing: freezing is a
 * decision with a commit, not a side effect of a report.
 *
 * WHAT IT IS NOT. Nothing here is a verdict on the product or on a leg, and it
 * closes no finding. A lane with no sidecar is listed as such — never as a zero.
 *
 * MISSING IS INELIGIBLE. Every field a freeze gate reads must be PRESENT and
 * finite (booleans: a boolean; steerBy: a string) or the leg is out with the
 * reason «<field> missing» — a book the sidecar does not carry is never read as
 * a zero or a false. And the sidecar must be the CURRENT schema: a
 * road-record/1 or /2 sidecar is listed, with why, and never informs a freeze.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { findStatusFiles } from "./route-fidelity.mjs";
import { EXCLUDED_FRACTION_CEILING, LANE_HOLD_P90_CEILING_M, PRODUCT, percentile } from "../mobile/lib/road-criteria.mjs";
import { ROAD_RECORD_SCHEMA, ROAD_SIDECAR_FILE, ROAD_SIDECAR_FILE_V1, parseRoadSidecar } from "../mobile/lib/road-record.mjs";

/**
 * THE PROJECTION CAP. A curved tick whose nearest point on the live route is
 * further than this was not driving that route's road: 2 × LANE_WIDTH_M =
 * 16.25 m is guidanceRoute.ts `LANE_ALIGN_MAX_M` — the product's own bound past
 * which an offset "is not lane choice", two lane pitches from the centreline
 * the route runs on before its final leg. The BUCKET keeps such a tick (a
 * distance gate is the cheat AC-2 names); the FREEZE refuses the leg.
 */
export const FREEZE_PROJECTION_CAP_M = 2 * PRODUCT.LANE_WIDTH_M;

const num = (v) => (Number.isFinite(v) ? v : null);
const bool = (v) => (typeof v === "boolean" ? v : null);

/**
 * WHY A SIDECAR'S SCHEMA IS NOT THE CURRENT ONE, or null when it is. Stated per
 * version so the table says what is wrong with the old measurement, not only
 * that it is old.
 */
export function schemaRefusal(schema) {
  if (schema === ROAD_RECORD_SCHEMA) return null;
  if (schema === undefined || schema === null) return "schema missing — the sidecar does not say which road-record it is; not eligible";
  if (schema === "road-record/1") return "schema v1 — refuted exclusion/reset logic, not eligible";
  if (schema === "road-record/2") {
    return "schema v2 — its curved bucket excluded a lane-align span GUESSED from the turn markers, not the one the product applied; not eligible";
  }
  return `schema ${String(schema)} — not the ${ROAD_RECORD_SCHEMA} this table reads; not eligible`;
}

/** One lane → one tabulated row. Pure over the two parsed files. */
export function laneRow(laneDir, status, road) {
  const base = road?.baseline ?? null;
  // The lane directory is `<lesson>__<platform>-<leg>` in every round this tool
  // was written against; the sidecar's own fields win when present.
  const named = path.basename(laneDir).match(/^(.*)__(mobile|pc)-(.+)$/);
  const row = {
    lane: path.basename(laneDir),
    lesson: road?.scenario ?? status?.scenario ?? (named ? named[1] : path.basename(laneDir)),
    platform: road?.platform ?? status?.platform ?? (named ? named[2] : null),
    leg: road?.mode ?? status?.mode ?? (named ? named[3] : null),
    steerBy: road?.steerBy ?? null,
  };
  if (road === null) {
    return { ...row, unmeasured: "no _audit-road.json.gz (a harness before W59 increment 2, or the leg ended before the drive loop did)" };
  }
  row.schema = road.schema ?? null;
  // An old schema's numbers mean something else (v1's `wrongBankTicks` was the
  // criteria numerator, v2's curved bucket a guess): LISTED, never tabulated.
  const refused = schemaRefusal(road.schema);
  if (refused) return { ...row, schemaRefused: refused };
  if (road.unmeasured || base === null || base.unmeasured) {
    return { ...row, unmeasured: road.unmeasured ?? base?.unmeasured ?? "the sidecar carries no baseline" };
  }
  return {
    ...row,
    ticks: base.ticks,
    tickRateHz: base.tickRateHz,
    // AC-2B — the spec numerator is the headline
    twoWay: base.ac2b.twoWayOnRoadTicks,
    wrongBank: base.ac2b.wrongBankTicks,
    wrongBankFrac: base.ac2b.wrongBankFrac,
    standstillWrongBank: base.ac2b.standstillWrongBankTicks ?? null,
    reverseWrongBank: base.ac2b.reverseWrongBankTicks ?? null,
    allWrongBank: base.ac2b.allWrongBankTicks ?? null,
    allWrongBankFrac: base.ac2b.allWrongBankFrac ?? null,
    // AC-2
    p90: num(base.ac2?.p90AbsOffsetM),
    legP90: num(base.ac2?.legP90AbsOffsetM),
    maxAbs: num(base.ac2?.maxAbsOffsetM),
    graded: num(base.ac2?.gradedTicks),
    curved: num(base.ac2?.curvedTicksTotal),
    floor: num(base.ac2?.sampleFloor),
    sampleShort: bool(base.ac2?.sampleShort),
    // AC-6
    excludedFrac: num(base.ac6?.excludedFrac),
    longestExcludedRunSec: num(base.ac6?.longestExcludedRunSec),
    legExcludedFrac: num(base.ac6?.legExcludedFrac),
    // the record's books — ABSENT STAYS null, never 0 or false
    gaps: num(road.gaps?.count),
    missedTicks: num(road.gaps?.missedTicks),
    overruns: num(road.overruns?.count),
    truncatedByReset: bool(road.truncatedByReset),
    resets: num(road.resets),
    missedDerivations: num(road.missedDerivations),
    wallNonMonotonic: num(base.record?.counts?.nonMonotonicWallSteps),
    absentReads: num(road.absentReads),
    errorReads: num(road.errorReads),
    curvedProjMaxM: num(base.curvature?.curvedProjectionDistM?.max),
    unknownSpanTicks: num(base.curvature?.rowsUnderUnknownSpan),
    overBudgetPolls: num(road.pollBudget?.overBudget),
    tickBudgetMs: num(road.pollBudget?.tickBudgetMs),
    postDriveTicks: num(road.postDrive?.ticks),
  };
}

/**
 * EVERY FIELD A FREEZE GATE READS, and the shape it must have. A field that is
 * absent, null, NaN or the wrong type makes the leg ineligible as «<field>
 * missing» — whatever the other fields say.
 */
export const FREEZE_REQUIRED = Object.freeze({
  steerBy: "string",
  p90: "number",
  graded: "number",
  floor: "number",
  sampleShort: "boolean",
  excludedFrac: "number",
  longestExcludedRunSec: "number",
  curvedProjMaxM: "number",
  gaps: "number",
  missedTicks: "number",
  overruns: "number",
  resets: "number",
  truncatedByReset: "boolean",
  missedDerivations: "number",
  wallNonMonotonic: "number",
  absentReads: "number",
  errorReads: "number",
  unknownSpanTicks: "number",
  overBudgetPolls: "number",
  // a poll budget of null means overBudgetPolls 0 was never MEASURED against anything (w59 re-verify)
  tickBudgetMs: "number",
});

const present = (v, kind) => (kind === "number" ? Number.isFinite(v) : kind === "string" ? typeof v === "string" && v.length > 0 : typeof v === kind);

/**
 * EVERY reason a measured row may not inform the AC-2 freeze, in order; [] =
 * eligible. The threshold is for the forward RIGHT leg steered by the ribbon, on
 * a record that lost nothing, came from one page, saw every route derivation,
 * ran its clock forwards, and whose curved sample AC-6 itself would resolve.
 * A book the record does not carry is a reason too — never read as zero.
 * Post-drive ticks (after the drive-end watermark) are NOT a reason: they are
 * not the leg, and their overruns are booked apart from the leg's.
 */
export function freezeReasons(r) {
  if (r.schemaRefused) return [{ code: "schema", why: r.schemaRefused }];
  if (r.unmeasured) return [{ code: "unmeasured", why: `unmeasured: ${r.unmeasured}` }];
  const out = [];
  const add = (code, why) => out.push({ code, why });
  const schemaWhy = schemaRefusal(r.schema);
  if (schemaWhy) add("schema", schemaWhy);
  if (r.leg !== "right") add("not a right leg", `leg ${r.leg ?? "unknown"}, not right`);
  if (r.steerBy !== "ribbon") add("not ribbon-steered", `steered by ${r.steerBy ?? "unknown"}, not the ribbon`);
  // MISSING IS INELIGIBLE — one reason per absent field, before any value gate.
  for (const [k, kind] of Object.entries(FREEZE_REQUIRED)) {
    if (!present(r[k], kind)) add("field missing", `${k} missing`);
  }
  if (r.truncatedByReset === true || r.resets > 0) add("probe reset", "record truncated by a page reload / probe reset");
  if (r.overruns > 0) add("ring overrun", `ring overrun ×${r.overruns} (ticks evicted unseen)`);
  if (r.gaps > 0) add("seq gaps", `${r.gaps} seq gap(s), ${r.missedTicks ?? "?"} tick(s) the record does not hold`);
  if (r.missedDerivations > 0) add("missed route derivations", `${r.missedDerivations} route derivation(s) published and overwritten unseen`);
  if (r.wallNonMonotonic > 0) add("non-monotonic wall time", `wallMs not strictly increasing at ${r.wallNonMonotonic} step(s)`);
  if (r.absentReads > 0) add("partial probe absence", `the probe was absent on ${r.absentReads} read(s) of a leg it was present on`);
  if (r.errorReads > 0) add("read errors", `${r.errorReads} read(s) of the probe threw`);
  if (r.sampleShort === true) {
    add("curved sample below its floor", `curved sample ${r.graded ?? "?"} below its floor ${r.floor ?? "—"}`);
  }
  if (r.unknownSpanTicks > 0) {
    add("lane-align span unknown", `${r.unknownSpanTicks} tick(s) under a route that did not publish its lane-align span`);
  }
  if (r.overBudgetPolls > 0) {
    add("poll over tick budget", `${r.overBudgetPolls} witness poll(s) outlasted the tick's idle budget — the control period was stretched`);
  }
  if (Number.isFinite(r.excludedFrac) && r.excludedFrac > EXCLUDED_FRACTION_CEILING) {
    add("AC-6 excluded fraction", `AC-6 unresolved: (curved − graded)/curved ${r.excludedFrac.toFixed(3)} > ${EXCLUDED_FRACTION_CEILING}`);
  }
  if (Number.isFinite(r.longestExcludedRunSec) && r.longestExcludedRunSec >= PRODUCT.LANE_KEEP_SUSTAIN_SEC) {
    add(
      "AC-6 excluded run",
      `AC-6 unresolved: longest excluded run ${r.longestExcludedRunSec.toFixed(2)} s >= laneKeepSustainSec ${PRODUCT.LANE_KEEP_SUSTAIN_SEC} s`,
    );
  }
  if (Number.isFinite(r.curvedProjMaxM) && r.curvedProjMaxM > FREEZE_PROJECTION_CAP_M) {
    add("projection beyond cap", `a curved tick lies ${r.curvedProjMaxM.toFixed(2)} m from its route (cap ${FREEZE_PROJECTION_CAP_M.toFixed(2)} m)`);
  }
  return out;
}

/** null when eligible, else every reason joined. */
export function freezeEligibility(r) {
  const rs = freezeReasons(r);
  return rs.length ? rs.map((x) => x.why).join("; ") : null;
}

/**
 * THE CANDIDATE, AND THE RULE — stated so it can be argued with:
 *   candidate = min(ceiling 2.40 m, p90 over eligible legs of their curved p90)
 * i.e. the value nine in ten of today's eligible ribbon legs already meet,
 * never above the derived ceiling. With no eligible leg there is no candidate.
 * `excluded` tallies each ineligible leg ONCE, by its first reason; `reasons`
 * tallies every reason every leg holds.
 */
export function freezeCandidate(rows) {
  const excluded = {};
  const reasons = {};
  const eligible = [];
  for (const r of rows) {
    const rs = freezeReasons(r);
    if (rs.length) {
      excluded[rs[0].code] = (excluded[rs[0].code] ?? 0) + 1;
      for (const x of rs) reasons[x.code] = (reasons[x.code] ?? 0) + 1;
    } else eligible.push(r.p90);
  }
  const s = eligible.sort((a, b) => a - b);
  const dist = s.length
    ? { n: s.length, min: s[0], p50: percentile(s, 0.5), p90: percentile(s, 0.9), max: s[s.length - 1] }
    : { n: 0 };
  const candidate = s.length ? Math.min(LANE_HOLD_P90_CEILING_M, dist.p90) : null;
  return {
    ceilingM: LANE_HOLD_P90_CEILING_M,
    distribution: dist,
    excluded,
    reasons,
    candidateM: candidate,
    rule:
      "candidate = min(2.40 m ceiling, nearest-rank p90 over eligible legs of each leg's curved p90 |laneOffsetM|); " +
      `eligible = ${ROAD_RECORD_SCHEMA} · measured · every gated field present · right leg · ribbon-steered · no probe reset · no ring overrun · ` +
      "no seq gap · no missed route derivation · wall clock strictly increasing · probe present and readable on every read · " +
      "every route published its lane-align span · no witness poll over the tick budget · curved sample ≥ its floor · " +
      `AC-6 resolved (curved excluded fraction ≤ ${EXCLUDED_FRACTION_CEILING}, longest excluded run < ${PRODUCT.LANE_KEEP_SUSTAIN_SEC} s) · ` +
      `every curved tick within ${FREEZE_PROJECTION_CAP_M.toFixed(2)} m of its route; post-drive ticks are not the leg`,
    bindingTerm: candidate === null ? null : candidate === LANE_HOLD_P90_CEILING_M ? "ceiling" : "corpus p90",
    frozen: false,
  };
}

/** A lane's sidecar: the gzip (v2) first, then the plain v1 JSON. */
export function readRoadSidecar(dir) {
  for (const name of [ROAD_SIDECAR_FILE, ROAD_SIDECAR_FILE_V1]) {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) continue;
    try {
      return { file: name, road: parseRoadSidecar(fs.readFileSync(p)) };
    } catch {
      return { file: name, road: null, unparsable: true };
    }
  }
  return { file: null, road: null };
}

export function tabulateRound(roundDir) {
  const rows = [];
  for (const statusPath of findStatusFiles(roundDir)) {
    const dir = path.dirname(statusPath);
    let status = null;
    try {
      status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
    } catch {
      status = null;
    }
    const got = readRoadSidecar(dir);
    const row = laneRow(dir, status, got.road);
    if (got.unparsable) {
      row.unmeasured = `${got.file} is present but does not parse`;
      delete row.schemaRefused;
    }
    if (!row.unmeasured && !row.schemaRefused) {
      const rs = freezeReasons(row);
      row.freezeEligible = rs.length === 0;
      row.freezeReasons = rs.map((x) => x.why);
    }
    rows.push(row);
  }
  rows.sort((a, b) => (a.lesson + a.platform + a.leg).localeCompare(b.lesson + b.platform + b.leg));
  const unmeasured = {};
  for (const r of rows) if (r.unmeasured) unmeasured[r.unmeasured] = (unmeasured[r.unmeasured] ?? 0) + 1;
  const schemaRefused = {};
  for (const r of rows) if (r.schemaRefused) schemaRefused[r.schemaRefused] = (schemaRefused[r.schemaRefused] ?? 0) + 1;
  return { roundDir, lanes: rows.length, rows, unmeasured, schemaRefused, freeze: freezeCandidate(rows) };
}

const f = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(d));

export function formatRound(t) {
  const out = [];
  out.push(`ROAD BASELINE (witness — not a verdict) · ${t.roundDir} · ${t.lanes} lane(s)`);
  out.push(
    "lesson × platform-leg                     AC-2B wrong-bank moving+fwd    [standstill/reverse/all]  p90c   p90leg  max    n/curved/floor     excl c/run/leg      ticks  Hz    gaps ovr  post",
  );
  for (const r of t.rows) {
    const name = `${r.lesson} × ${r.platform ?? "?"}-${r.leg ?? "?"}`.padEnd(40).slice(0, 40);
    if (r.schemaRefused) {
      out.push(`${name}  NOT CURRENT — ${r.schemaRefused}`);
      continue;
    }
    if (r.unmeasured) {
      out.push(`${name}  UNMEASURED — ${r.unmeasured}`);
      continue;
    }
    out.push(
      `${name}  ${`${r.wrongBank}/${r.twoWay}${r.twoWay ? ` = ${f(r.wrongBankFrac, 3)}` : " NO-SAMPLE"}`.padEnd(29)}  ` +
        `${`[${r.standstillWrongBank ?? "?"}/${r.reverseWrongBank ?? "?"}/${r.allWrongBank ?? "?"}${r.twoWay ? ` = ${f(r.allWrongBankFrac, 3)}` : ""}]`.padEnd(24)}  ` +
        `${f(r.p90).padStart(5)}  ${f(r.legP90).padStart(5)}  ${f(r.maxAbs).padStart(5)}  ` +
        `${`${r.graded}/${r.curved}/${r.floor ?? "—"}${r.sampleShort ? "!" : ""}`.padEnd(17)}  ` +
        `${`${f(r.excludedFrac, 3)}/${f(r.longestExcludedRunSec, 1)}s/${f(r.legExcludedFrac, 3)}`.padEnd(18)}  ` +
        `${String(r.ticks).padStart(6)}  ${f(r.tickRateHz, 1).padStart(4)}  ` +
        `${String(r.gaps)}${r.missedTicks ? `(${r.missedTicks})` : ""} ${r.overruns}${r.truncatedByReset ? " RESET" : ""}  ${r.postDriveTicks ?? "—"}`,
    );
    out.push(`    freeze: ${r.freezeEligible ? "ELIGIBLE" : `ineligible — ${(r.freezeReasons ?? []).join("; ")}`}`);
  }
  out.push("");
  out.push("UNMEASURED reasons:");
  const um = Object.entries(t.unmeasured);
  if (!um.length) out.push("  (none)");
  for (const [why, n] of um) out.push(`  ${n} × ${why}`);
  out.push("");
  out.push(`NOT THE CURRENT SCHEMA (${ROAD_RECORD_SCHEMA}) — listed, never tabulated, never eligible:`);
  const sr = Object.entries(t.schemaRefused ?? {});
  if (!sr.length) out.push("  (none)");
  for (const [why, n] of sr) out.push(`  ${n} × ${why}`);
  const z = t.freeze;
  out.push("");
  out.push(`AC-2 FREEZE CANDIDATE (printed, NOT frozen): ${z.candidateM === null ? "none — no eligible leg" : `${z.candidateM.toFixed(3)} m (binding: ${z.bindingTerm})`}`);
  out.push(`  rule: ${z.rule}`);
  out.push(
    `  eligible curved p90 distribution: n ${z.distribution.n}` +
      (z.distribution.n ? ` · min ${f(z.distribution.min, 3)} · p50 ${f(z.distribution.p50, 3)} · p90 ${f(z.distribution.p90, 3)} · max ${f(z.distribution.max, 3)} m` : ""),
  );
  out.push(`  excluded from the distribution (first reason): ${Object.entries(z.excluded).map(([k, v]) => `${v} ${k}`).join(" · ") || "none"}`);
  out.push(`  every reason held (a leg may hold several): ${Object.entries(z.reasons).map(([k, v]) => `${v} ${k}`).join(" · ") || "none"}`);
  out.push(`  ceiling ${z.ceilingM.toFixed(2)} m (laneKeepMaxOffsetM 3.25 − chassis half-width 0.85) — the threshold may never be raised above it`);
  return out.join("\n");
}

function main(argv) {
  const args = argv.slice(2);
  const roundDir = args.find((a) => !a.startsWith("--"));
  if (!roundDir) {
    process.stderr.write("usage: node tools/audit/road-baseline.mjs <roundDir> [--json]\n");
    return 2;
  }
  if (!fs.existsSync(roundDir)) {
    process.stderr.write(`no such round directory: ${roundDir}\n`);
    return 2;
  }
  const t = tabulateRound(roundDir);
  process.stdout.write(args.includes("--json") ? `${JSON.stringify(t, null, 2)}\n` : `${formatRound(t)}\n`);
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main(process.argv);
}
