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
 * AND A pc-path LEG IS A DIFFERENT KIND OF LEG (DESIGN-v2 §8.4). It was steered
 * along the lesson's own authored line on the dev-only pose probe, so its route
 * fidelity is the HARNESS's competence, never product route-keeping. For such a
 * leg this tool prints STEERED BY first, never «stayed within 8 m of» or «ribbon
 * seen», and RECOMPUTES the independent evidence from the raw sidecars through
 * `path-evidence.mjs` rather than trusting what the drive stored — flagging
 * STORED ≠ RECOMPUTED when the two differ.
 *
 * NOTHING HERE IS A VERDICT. It is the evidence a verdict has to survive, and
 * every absent measurement prints as absent rather than as a zero.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { authoredLinePolyline, routeDeviation } from "../mobile/lib/guidance.mjs";
import { computePathEvidence, SAME_PROBE } from "../mobile/lib/path-evidence.mjs";
import { severityFromDebriefText } from "./severity-from-debrief.mjs";

const SWEEP_DEFAULT = ".audit-frames/w43/frames";

const readJson = (f) => {
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; }
};

/** The one-direction self-report object, built from the STORED runner books (§8.3.12). */
export function selfReportFromStored(pathFollow) {
  if (!pathFollow || typeof pathFollow !== "object") return null;
  const segs = Array.isArray(pathFollow.segments) ? pathFollow.segments : [];
  return {
    blindGapM: Array.isArray(pathFollow.cadence?.blindGapNearStop) ? pathFollow.cadence.blindGapNearStop : [],
    stopErrM: segs.map((s) => s?.stopErrM).filter((v) => Number.isFinite(v)),
    arrivalLagWorldS: [],
    stopLate: segs.map((s) => s?.stopLate).filter(Boolean),
  };
}

const COMPARED = ["routeBySegment", "arms", "stops", "speed", "arrivals", "productPark"];
const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

/** Every fact this programme has learned to ask for, about one leg. */
export function legEvidence(dir) {
  const st = readJson(`${dir}/_audit-status.json`);
  const db = readJson(`${dir}/_audit-debrief.json`);
  if (!st && !db) return null;
  const scenario = st?.scenario ?? db?.scenario ?? null;
  const legMode = st?.mode ?? db?.mode ?? null;

  let trace = null;
  let poly = null;
  if (scenario) {
    try {
      trace = JSON.parse(readFileSync(`content/traces/${scenario}/shadow-correct.trace.json`, "utf8"));
      poly = authoredLinePolyline(trace);
    } catch { trace = null; poly = null; }
  }
  // A pc-path leg is on its line BY CONSTRUCTION: it has NO route witness, so `route` is
  // null for it however the sidecar was written (CODE-REVIEW-2 M5) — never recomputed from
  // its samples, which would hand any reader of this object onRoute / droveIt it never earned.
  const route = legMode === "path" ? null : db?.route ?? (poly ? routeDeviation(st?.guidance?.samples ?? [], poly) : null);
  const severity = db?.severity ?? severityFromDebriefText(JSON.stringify(db?.debrief ?? ""));

  let path = null;
  if (legMode === "path") {
    const stored = st?.pathEvidence ?? db?.pathEvidence ?? null;
    const recomputed = trace
      ? computePathEvidence({
          samples: st?.guidance?.samples ?? [],
          trace,
          lesson: scenario,
          debrief: db?.debrief ?? null,
          mistakes: db?.debrief?.sections?.['section[aria-label="Грешки"]']?.items ?? [],
          rubric: db?.debrief?.sections?.['section[aria-label="Оценка на маневрата"]']?.items ?? [],
          routeHold: db?.routeHold ?? st?.guidance?.routeHold ?? null,
          routeHoldBySegment: st?.pathFollow?.routeHoldBySegment ?? null,
          selfReportMayOnlyBlame: selfReportFromStored(st?.pathFollow),
        })
      : null;
    const differs = stored && recomputed ? COMPARED.filter((k) => stable(stored[k] ?? null) !== stable(recomputed[k] ?? null)) : [];
    path = {
      steeredBy: st?.steeredBy ?? db?.steeredBy ?? null,
      evidence: recomputed ?? stored,
      evidenceSource: recomputed ? "recomputed from raw sidecars" : stored ? "stored (no trace to recompute from)" : "none",
      storedDiffers: differs,
      pathFollow: st?.pathFollow ?? null,
      trackingWord: st?.guidance?.tracking?.verdict ?? null,
    };
  }

  return {
    leg: dir.split(/[\\/]/).pop(),
    scenario,
    mode: legMode,
    legMode,
    path,
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
    route: route
      ? {
          maxM: route.maxM,
          medianM: route.medianM,
          p90M: route.p90M,
          onRoute: route.onRoute,
          droveIt: route.droveIt,
          coveredFrac: route.coveredFrac,
          routeLengthM: route.routeLengthM,
          n: route.n,
        }
      : null,
    routeHold: db?.routeHold ?? null,
    recovery: db?.recovery ?? null,
    overCap: st?.overCap ?? null,
    severity,
    objectives: (db?.debrief?.objectives ?? st?.debrief?.objectives ?? null),
  };
}

/** The pc-path block, printed FIRST (§8.4). Pure: takes the object `legEvidence` returns. */
export function renderPathEvidence(e) {
  const L = [];
  const sb = e.path?.steeredBy;
  const ev = e.path?.evidence ?? {};
  const d7 = String(sb?.samplesDigest ?? "").replace(/^sha256:/, "").slice(0, 7);
  L.push(`      STEERED BY: AUTHORED PATH (pc-path) — shadow-correct @${d7 || "?"} via pathref; DEV-ONLY pose probe; NOT the ribbon.`);
  L.push(`            GRADING EVIDENCE ONLY — never a guidance, legibility, lane-choice or route-keeping witness.`);
  const segs = ev.routeBySegment ?? [];
  const seg = (s) => `${s.gear === -1 ? "R" : "F"}${s.k} ${s.measured === false ? "unmeasured" : `max ${s.maxM}/corr ${s.corridorM}`}`;
  // UNMEASURED IS NOT «BY CONSTRUCTION» (CODE-REVIEW-2 M2): a driven segment nobody measured is inside nothing.
  const unmeasuredSegs = segs.filter((s) => s.measured !== true && !s.micro);
  L.push(
    `      ROUTE ${SAME_PROBE.replace(/[()]/g, "")}; per segment: ${segs.map(seg).join(" · ") || "none"} — ` +
      (!segs.length || unmeasuredSegs.length
        ? `UNMEASURED (${segs.length ? unmeasuredSegs.map((s) => `${s.gear === -1 ? "R" : "F"}${s.k}`).join(", ") : "no segment evidence"}): rows resting on ${segs.length ? "those segments" : "this leg's route"} are UNJUDGED.`
        : "BY CONSTRUCTION; harness competence, not product route-keeping."),
  );
  for (const a of ev.arms ?? []) {
    if (a.measured === false) { L.push(`      ARM R${a.k}: UNMEASURED — ${a.why}`); continue; }
    L.push(
      `      ARM ${SAME_PROBE.replace(/[()]/g, "")}: R${a.k} stopped ${a.restAlongM ?? "?"} m, reverse began ${a.startAlongM} m along ` +
        `(roll ${a.armRollM ?? "?"} m, allowance ${a.armRollAllowM}) / ${a.startLatM} m right of the authored gear-change pose ` +
        `(band ${a.band ? `${a.band.alongM.join("…")} / ${a.band.latM.join("…")}` : "?"})${a.startInBand === false ? " — OUT OF BAND" : ""} · chord yaw ${a.chordYawDeg ?? "?"}°.`,
    );
  }
  const stops = (ev.stops ?? []).map((s) => (s.measured === false ? `${s.tag} UNMEASURED` : `${s.tag} rest ${s.restLoS}–${s.restHiS} s (dwell ${s.dwellS}) err ${s.stopErrM > 0 ? "+" : ""}${s.stopErrM} m`));
  const over = Math.max(0, ...(ev.speed ?? []).filter((s) => s.measured !== false).map((s) => s.overshootKmh ?? 0));
  L.push(`      STOPS (independent): ${stops.join(" · ") || "none"} · overshoot max ${over} km/h.`);
  const pp = ev.productPark ?? {};
  const camYaw = Object.values(e.path?.pathFollow?.endPoses ?? {}).map((p) => p?.camYawDeg).filter((v) => Number.isFinite(v));
  L.push(`      END POSE (product): ${pp.credited === true ? "✓" : pp.credited === false ? "–" : "?"} «подравняване: ${pp.alignment ?? "not read"}» · «ъгъл ${pp.headingOffsetDeg ?? "?"}°» (magnitude only) · SELF-REPORT cam yaw ${camYaw.join("/") || "UNMEASURED"}°.`);
  const rh = (ev.routeHoldBySegment ?? []).map((b) => `${b.gear === -1 ? "R" : "F"}${b.k} ${b.offRoad ? `off-road ${b.offRoad}${b.bay ? " (bay — exempt)" : ""}` : "clear"}`);
  L.push(`      ROUTE HOLD by segment: ${rh.join(" · ") || "not recorded"}.`);
  const at = ev.attribution;
  if (at) {
    L.push(
      `      ATTRIBUTION: omitted by harness [${at.proceduralOmission.map((x) => x.code).join("; ")}] · timing/actuation [${at.timingActuation.map((x) => x.code).join("; ")}${at.timingActuation.length ? ` — ${at.release?.label}` : ""}] · collision candidates [${at.collisionCandidates.map((x) => x.code).join("; ")}].`,
    );
  }
  L.push(`      CAVEATS: empty world · dev build only${(ev.caveats ?? []).length ? ` · ${ev.caveats.join(" · ")}` : ""}.`);
  const pf = e.path?.pathFollow;
  if (pf) {
    L.push(
      `      SELF-REPORT (not evidence): state ${pf.state} · runner p50 ${pf.cadence?.runnerPeriodMs?.p50 ?? "?"} ms · PM p10 ${pf.stability?.pmP10Deg ?? "?"}° · ` +
        `blind p90 ${pf.cadence?.blindMs?.p90 ?? "?"} ms · beats deferred ${pf.cadence?.beatsDeferred ?? "?"} · stall returns ${pf.stall?.returns ?? "?"} (${pf.stall?.pauseLayerReturns ?? "?"} pause layer) · arms ${(pf.arms ?? []).length}` +
        `${(pf.refusals ?? []).length ? ` · REFUSED ${pf.refusals.map((r) => r.code).join(", ")}` : ""}.`,
    );
  }
  if ((e.path?.storedDiffers ?? []).length) L.push(`      !! STORED ≠ RECOMPUTED for ${e.path.storedDiffers.join(", ")} — the leg's stored pathEvidence disagrees with the raw sidecars; trust the recomputation.`);
  return L;
}

/** The one-screen block, ready to paste into a judging brief. */
export function renderEvidence(e) {
  const L = [];
  L.push(`  ${e.leg}  —  ${e.verdict ?? "NO VERDICT"}${e.score === null ? "" : ` · ${e.score} наказателни т.`}${e.exit === 0 || e.exit === null ? "" : ` · EXIT ${e.exit}`}`);
  if (e.treeMoved) L.push(`      !! TREE MOVED DURING THIS RUN — it certifies nothing.`);
  const isPath = e.legMode === "path" || e.mode === "path";
  if (isPath) {
    for (const line of renderPathEvidence(e)) L.push(line);
  } else if (e.route) {
    // BOTH HALVES, ALWAYS TOGETHER. Lateral fidelity on its own says a car did
    // not wander from where it was parked; six w43 legs sat ON their authored
    // line having covered 4–47 % of it, four of them roundabouts that stop
    // halfway. Printing one without the other is how «1 cm of lateral spread
    // over 289 m» once read as proof a car held its lane.
    const cov =
      e.route.coveredFrac === null || e.route.coveredFrac === undefined
        ? ""
        : `, and covered ${Math.round(e.route.coveredFrac * 100)}% of its ${e.route.routeLengthM} m`;
    L.push(
      `      ROUTE: ${e.route.onRoute ? "stayed within 8 m of" : "LEFT"} the lesson's own authored line — worst ${e.route.maxM} m, median ${e.route.medianM} m over ${e.route.n} moving samples${cov}.` +
        (e.route.droveIt
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
  // THE ANTECEDENT OF EVERY «what does the engine book ABOVE the task cap» ROW,
  // as a fact rather than a sentence in run.log. Before w46 the hold armed only
  // on «дръж под N км/ч», so a strip-only cap (sc-ac-truck-spray) read „no cap"
  // and no wrong leg ever beat it; and w46's run.log quotes «дръж под N км/ч»
  // even where the strip carried the cap. `capPhrase` is the phrase actually
  // read (from the sweep after w46); absent means that run predates it.
  if (e.overCap && e.overCap.capKmh !== null && e.overCap.capKmh !== undefined) {
    const phrase = e.overCap.capPhrase ? `«${e.overCap.capPhrase}»` : "(phrase not recorded — do NOT trust run.log's «дръж под …» wording for which surface showed it)";
    L.push(
      e.overCap.proven
        ? `      OVER-CAP: the leg BEAT its task cap — ${e.overCap.provenAtKmh} км/ч against ${e.overCap.capKmh} at t=${e.overCap.provenAtSec}s, cap printed as ${phrase}. The antecedent of an above-the-cap row HAPPENED on this leg; where on the route is for the frames to say.`
        : `      OVER-CAP: the leg did NOT beat its task cap of ${e.overCap.capKmh} (top ${e.overCap.topKmh} км/ч, ${e.overCap.done}). No row about what the engine books above that cap may rest on this leg.`,
    );
  }
  if (e.tracking && !isPath) {
    L.push(`      TRACKING: ${String(e.tracking.verdict).toUpperCase()} · ribbon seen ${e.tracking.seen}${e.tracking.medianAbsDeg === null ? "" : ` · |err| median ${e.tracking.medianAbsDeg}°`}`);
  } else if (isPath) {
    L.push(`      TRACKING (harness, not guidance): ${e.path?.trackingWord ?? "?"}`);
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
