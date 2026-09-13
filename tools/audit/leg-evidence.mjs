#!/usr/bin/env node
/**
 * THE FACTS ABOUT ONE DRIVE, IN A BLOCK A JUDGE CAN ACT ON.
 *
 *   node tools/audit/leg-evidence.mjs <lesson> [sweepFramesDir]
 *
 * WHY. Judging briefs in this programme have been prose: a filed symptom, a
 * prior judge's paragraph, and a folder of screenshots. What was missing was the
 * short list of MEASURED facts that decide most rows, and their absence is why
 * the same rows come back UNJUDGED sweep after sweep — the reader could not
 * cheaply establish whether the drive was even capable of witnessing the claim.
 *
 * Three of the four facts below did not exist as fields until 2026-09-14:
 *
 *   · ROUTE FIDELITY — how far the car got from the lesson's own authored
 *     zero-violation line. A leg whose car was 176 m away cannot witness what
 *     the product credits along that route, and 34 of the 101 open rows rest
 *     only on legs like that.
 *   · THE THREE ERROR CLASSES — recovered from the debrief text
 *     (`severity-from-debrief.mjs`). Several open rows make a literal numeric
 *     claim about these and are simply stale.
 *   · THE PRODUCT'S OWN ROUTE HOLD — «Колата е извън пътя», where the sweep is
 *     new enough to carry it.
 *
 * NOTHING HERE IS A VERDICT. It is the evidence a verdict has to survive, and
 * every absent measurement prints as absent rather than as a zero.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { authoredLinePolyline, routeDeviation } from "../mobile/lib/guidance.mjs";
import { severityFromDebriefText } from "./severity-from-debrief.mjs";

const SWEEP_DEFAULT = ".audit-frames/w43/frames";

const readJson = (f) => {
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; }
};

/** Every fact this programme has learned to ask for, about one leg. */
export function legEvidence(dir) {
  const st = readJson(`${dir}/_audit-status.json`);
  const db = readJson(`${dir}/_audit-debrief.json`);
  if (!st && !db) return null;
  const scenario = st?.scenario ?? db?.scenario ?? null;

  let poly = null;
  if (scenario) {
    try {
      poly = authoredLinePolyline(JSON.parse(readFileSync(`content/traces/${scenario}/shadow-correct.trace.json`, "utf8")));
    } catch { poly = null; }
  }
  const route = db?.route ?? (poly ? routeDeviation(st?.guidance?.samples ?? [], poly) : null);
  const severity = db?.severity ?? severityFromDebriefText(JSON.stringify(db?.debrief ?? ""));

  return {
    leg: dir.split(/[\\/]/).pop(),
    scenario,
    mode: st?.mode ?? db?.mode ?? null,
    verdict: db?.verdict ?? st?.verdict ?? null,
    score: db?.score ?? st?.score ?? null,
    reachedVerdictCard: db?.reachedVerdictCard ?? null,
    exit: st?.exit ?? null,
    treeMoved: st?.treeMovedDuringRun ?? null,
    tracking: st?.guidance?.tracking
      ? {
          verdict: st.guidance.tracking.verdict,
          seen: `${st.guidance.tracking.seenSamples}/${st.guidance.tracking.movingSamples}`,
          medianAbsDeg: st.guidance.tracking.medianAbsDeg,
        }
      : null,
    route: route ? { maxM: route.maxM, medianM: route.medianM, p90M: route.p90M, onRoute: route.onRoute, n: route.n } : null,
    routeHold: db?.routeHold ?? null,
    recovery: db?.recovery ?? null,
    severity,
    objectives: (db?.debrief?.objectives ?? st?.debrief?.objectives ?? null),
  };
}

/** The one-screen block, ready to paste into a judging brief. */
export function renderEvidence(e) {
  const L = [];
  L.push(`  ${e.leg}  —  ${e.verdict ?? "NO VERDICT"}${e.score === null ? "" : ` · ${e.score} наказателни т.`}${e.exit === 0 || e.exit === null ? "" : ` · EXIT ${e.exit}`}`);
  if (e.treeMoved) L.push(`      !! TREE MOVED DURING THIS RUN — it certifies nothing.`);
  if (e.route) {
    L.push(
      `      ROUTE: ${e.route.onRoute ? "stayed on" : "LEFT"} the lesson's own authored line — worst ${e.route.maxM} m, median ${e.route.medianM} m over ${e.route.n} moving samples.` +
        (e.route.onRoute
          ? ""
          : ` NO finding about what the product did ALONG this route may rest on this leg.`),
    );
  } else {
    L.push(`      ROUTE: NOT MEASURED (no authored line, or too few moving poses). UNKNOWN, not zero.`);
  }
  if (e.routeHold && (e.routeHold.offRoadTicks || e.routeHold.crashPinnedTicks)) {
    L.push(`      THE PRODUCT SAID OFF-ROAD: ${e.routeHold.kinds?.join(" + ")} on ${e.routeHold.offRoadTicks + e.routeHold.crashPinnedTicks} tick(s), t=${e.routeHold.firstSec}s..${e.routeHold.lastSec}s.`);
  }
  if (e.recovery?.everLeft) {
    L.push(`      REJOINED: ${e.recovery.episodes} departure(s), ${Math.round(e.recovery.metres)} m steered back by the HARNESS — those metres are not the student's.`);
  }
  if (e.tracking) {
    L.push(`      TRACKING: ${String(e.tracking.verdict).toUpperCase()} · ribbon seen ${e.tracking.seen}${e.tracking.medianAbsDeg === null ? "" : ` · |err| median ${e.tracking.medianAbsDeg}°`}`);
  }
  if (e.severity) {
    const f = (k) => (e.severity[k] ? `${e.severity[k].count} err / ${e.severity[k].points} т.` : "not read");
    L.push(`      CLASSES: Опасни ${f("opasna")} · Основни ${f("osnovna")} · Второстепенни ${f("vtorostepenna")}`);
  } else {
    L.push(`      CLASSES: NOT READ from this debrief — absent, not zero.`);
  }
  if (Array.isArray(e.objectives) && e.objectives.length) {
    for (const o of e.objectives.slice(0, 6)) {
      L.push(`      ${o.done ? "✓" : "–"} ${String(o.titleBg ?? "").slice(0, 92)}`);
    }
  }
  return L.join("\n");
}

if (process.argv[1] && process.argv[1].endsWith("leg-evidence.mjs")) {
  const lesson = process.argv[2];
  const sweep = process.argv[3] || SWEEP_DEFAULT;
  if (!lesson) {
    console.error("usage: node tools/audit/leg-evidence.mjs <lesson> [sweepFramesDir]");
    process.exit(2);
  }
  const dirs = readdirSync(sweep).filter((d) => d.startsWith(`${lesson}__`));
  if (!dirs.length) {
    console.log(`no legs for ${lesson} in ${sweep}`);
    process.exit(0);
  }
  console.log(`${lesson}  ·  ${dirs.length} leg(s) in ${sweep}\n`);
  for (const d of dirs) {
    const e = legEvidence(`${sweep}/${d}`);
    console.log(e ? renderEvidence(e) : `  ${d} — no sidecars`);
    console.log("");
  }
}
