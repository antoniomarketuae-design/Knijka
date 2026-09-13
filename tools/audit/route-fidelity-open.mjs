#!/usr/bin/env node
/**
 * WHICH OPEN ROWS REST ON A LEG THAT WAS ACTUALLY ON THE ROAD.
 *
 *   node tools/audit/route-fidelity-open.mjs [sweepFramesDir]
 *
 * WHY. A row about what the product did ALONG a route — «the task never
 * ticked», «the offence never fired», «route credit never came» — is only
 * answerable by a drive that was on that route. Until `routeDeviation` landed
 * nobody could tell which legs those were, so every row was read as if its
 * evidence were equally good, and waves were spent on rows whose car had been
 * 100 m away in a field.
 *
 * This crosses the open list against the sweep's per-leg deviation from each
 * lesson's own authored zero-violation line, and partitions the rows into the
 * ones a judge can settle from frames already on disk and the ones that need a
 * better DRIVE before anything else is spent on them.
 *
 * FIRST RUN, against w43: 65 of 101 rows (32 critical) had at least one leg
 * that stayed on its route; 34 (7 critical) had none.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { authoredLinePolyline, routeDeviation } from "../mobile/lib/guidance.mjs";
import { corpusCounts } from "./finding-reader.mjs";

const SWEEP = process.argv[2] || ".audit-frames/w43/frames";

// 1 · route fidelity of every leg in the sweep, keyed by lesson.
const byLesson = new Map();
for (const dir of readdirSync(SWEEP)) {
  const st = `${SWEEP}/${dir}/_audit-status.json`;
  if (!existsSync(st)) continue;
  let j;
  try { j = JSON.parse(readFileSync(st, "utf8")); } catch { continue; }
  const scen = j.scenario;
  if (!scen) continue;
  let poly = null;
  try {
    poly = authoredLinePolyline(JSON.parse(readFileSync(`content/traces/${scen}/shadow-correct.trace.json`, "utf8")));
  } catch { poly = null; }
  const dev = poly ? routeDeviation(j.guidance?.samples ?? [], poly) : null;
  if (!byLesson.has(scen)) byLesson.set(scen, []);
  byLesson.get(scen).push({ leg: dir.split("__")[1] ?? dir, dev, hasLine: !!poly, mode: j.mode });
}

// 2 · the open rows.
const open = corpusCounts().open;
const rows = open.map((f) => {
  const legs = byLesson.get(f.scenario) ?? [];
  const measured = legs.filter((l) => l.dev);
  const onRoute = measured.filter((l) => l.dev.onRoute);
  const best = measured.length ? measured.reduce((a, b) => (a.dev.maxM <= b.dev.maxM ? a : b)) : null;
  return {
    id: f.findingId, scenario: f.scenario, sev: f.severity,
    legs: legs.length, measured: measured.length, onRoute: onRoute.length,
    bestLeg: best ? best.leg : null,
    bestMaxM: best ? best.dev.maxM : null,
    noLine: legs.length > 0 && legs.every((l) => !l.hasLine),
  };
});

const cat = (r) =>
  r.legs === 0 ? "NOT DRIVEN IN THIS SWEEP"
  : r.noLine ? "NO AUTHORED LINE FOR THIS LESSON"
  : r.measured === 0 ? "DRIVEN BUT NO MOVING POSE SAMPLES"
  : r.onRoute > 0 ? "HAS AT LEAST ONE ON-ROUTE LEG"
  : "EVERY LEG LEFT THE ROUTE";

const groups = new Map();
for (const r of rows) {
  const k = cat(r);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

console.log(`open rows: ${rows.length}   sweep: ${SWEEP}\n`);
const order = [
  "HAS AT LEAST ONE ON-ROUTE LEG",
  "EVERY LEG LEFT THE ROUTE",
  "DRIVEN BUT NO MOVING POSE SAMPLES",
  "NO AUTHORED LINE FOR THIS LESSON",
  "NOT DRIVEN IN THIS SWEEP",
];
for (const k of order) {
  const g = groups.get(k) ?? [];
  const crit = g.filter((r) => r.sev === "critical").length;
  console.log(`${String(g.length).padStart(3)}  (${String(crit).padStart(2)} crit)  ${k}`);
}
console.log("\n--- rows whose every leg left the route (the ones a re-drive cannot settle as-is) ---");
for (const r of (groups.get("EVERY LEG LEFT THE ROUTE") ?? []).sort((a, b) => (b.bestMaxM ?? 0) - (a.bestMaxM ?? 0))) {
  console.log(`  [${(r.sev ?? "?").slice(0, 4).toUpperCase().padEnd(4)}] ${r.id}  best leg ${r.bestLeg} at ${r.bestMaxM} m off`);
}
console.log("\n--- rows with a leg that stayed on its route (these are judgeable NOW) ---");
for (const r of (groups.get("HAS AT LEAST ONE ON-ROUTE LEG") ?? []).sort((a, b) => (a.bestMaxM ?? 0) - (b.bestMaxM ?? 0))) {
  console.log(`  [${(r.sev ?? "?").slice(0, 4).toUpperCase().padEnd(4)}] ${r.id}  ${r.onRoute}/${r.measured} legs on route, best ${r.bestLeg} at ${r.bestMaxM} m`);
}
