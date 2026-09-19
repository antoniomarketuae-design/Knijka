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
    // THE ROAD'S NUMBER, WHICH IS NOT THE TASK'S. This projection is EXPLICIT
    // and not a spread, so a field the harness publishes and this line does not
    // name is a field no judge ever sees — `overLimit` was exactly that for its
    // first cut: written into `_audit-status.json`, claimed to be read here, and
    // matched by zero hits in `grep -rn overLimit tools/audit`. The
    // dead-predicate class, in the one file whose whole job is to carry
    // measurements to a reader.
    overLimit: st?.overLimit ?? null,
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
  /* ── AND THE POSTED DISC, WHICH ANSWERS A DIFFERENT QUESTION ENTIRELY ──────
   * WITHOUT THIS BLOCK A JUDGE READING A SUSTAINED-OVERSPEED ROW SEES ONLY THE
   * OVER-CAP PARAGRAPH ABOVE, and that paragraph is about the wrong number. The
   * task cap reaches the glass and the objective gate and never the изпитен
   * лист (`rules/engine.ts:1298-1310`); SPEEDING_OVER_LIMIT is graded against
   * `tick.maxSpeedKmh`, the POSTED disc (`engine.ts:3242-3244`). On
   * sc-follow-tailgater those two numbers are 36 and 50, so «the leg BEAT its
   * task cap … the antecedent of an above-the-cap row HAPPENED on this leg»
   * would have been read as settling a row it says nothing about.
   *
   * AND TOUCHING IS NOT SUSTAINING. `speedingMinor` is an episode with a
   * ledger, so the fact that decides these rows is not the top speed but
   * whether the dial HELD. The FOUR branches below are the four different
   * things a leg can be, and only one of them is „this leg can carry the row".
   *
   * THE FOURTH WAS ADDED BECAUSE IT RENDERED AS THE SECOND. A drive that ends
   * while the no-disc search is still looking leaves `done:null` and
   * `postedKmh:null`, and it fell through to the „did not hold the posted
   * limit" arm, which printed «В26 disc null км/ч … only 0.0 s accrued above
   * null». A collapsed state is how a missing instrument reads as a refuted
   * row, which is the one thing this block exists to prevent.
   *
   * …AND IT IS A DEFENSIVE PATH, NOT „THE ORDINARY SHORT-FLAT STATE". That
   * phrase stood here until 2026-09-19 and it was false, measured off the
   * product the same session: `LessonPlayShell.tsx:1272` derives the disc as
   * `limitKmh: lastTick?.maxSpeedKmh ?? 50` — it FALLS BACK to 50 rather than
   * to nothing — and `hud/StatusDashboard.tsx:917/:746` then compute
   * `const limit = Math.max(1, Math.round(limitKmh))` and paint
   * `aria-label={`Ограничение ${limit} км/ч`}` UNCONDITIONALLY in both the
   * compact (:982) and roomy (:1098) variants, with no `null` branch and no
   * gate. So once the dashboard has mounted the disc is always on the glass
   * and this arm cannot be the common case; what it catches is a probe that
   * ran before the first paint, a dashboard that never mounted, or a drive
   * that died early. Calling a defensive path ordinary is how a missing
   * instrument stops being investigated.
   *
   * THE FIFTH ARM IS THE ONE UNDER ALL OF THEM: a hold that never ran a flat
   * tick at all. See `everRan` below. */
  /* THE GATE IS `on === true` AND NOT TRUTHINESS, because `{on:false}` is an
   * object. The harness publishes `null` for a lane outside
   * SUSTAINED_OVER_LIMIT_LANES, but a sidecar written by any build that did
   * not must not be rendered either: the only thing this block could say about
   * such a leg is a sentence about a 45 m rest cadence it never measured
   * there — on a reverse or standstill lane, a claim about a flat that does
   * not exist. Silence is what the field said before it existed. */
  if (e.overLimit && e.overLimit.on === true) {
    const o = e.overLimit;
    /* NO NUMBER A SIDECAR DID NOT CARRY MAY REACH A SENTENCE — AND A SENTINEL
     * IS SUCH A NUMBER. `null`/`undefined` were already refused, badly, by
     * branch order alone; the two a reader cannot tell from a measurement were
     * not refused at all. `topKmh` is initialised to **-1**, so an unrun hold
     * rendered «top -1 км/ч» — a dial reading, as far as any judge can see.
     * `noDiscTicks ?? "?"` put a QUESTION MARK in a judging brief. And
     * `Number(o.overSec ?? 0).toFixed(1)` was the worst of the three: a
     * sidecar carrying no ledger at all rendered «0.0 s accrued», which is not
     * „absent" — it is the REFUTING number, invented. Every number below goes
     * through this, and the one thing it will never do is substitute a
     * plausible default for a measurement nobody took. (The test over this
     * file additionally refuses any `??` whose right-hand side is a number,
     * anywhere in this block, for the same reason §2b of lib/driveline.mjs
     * refuses a band that silently becomes one.) */
    const measured = (v, min = 0) =>
      typeof v === "number" && Number.isFinite(v) && v >= min ? `${v}` : "NOT RECORDED";
    const secsPhrase =
      typeof o.overSec === "number" && Number.isFinite(o.overSec) && o.overSec >= 0
        ? `${o.overSec.toFixed(1)} s`
        : "a span of time this sidecar does not record";
    /* A SPEED IS POSITIVE OR IT IS NOT A SPEED. `> 0`, not `Number.isFinite`:
     * the sweep over this file drove every field to -1 one at a time and found
     * that a `needKmh` of -1 rendered «accrued strictly above -1 км/ч» and a
     * `postedKmh` of -1 rendered «В26 disc -1 км/ч» — both through guards that
     * asked only whether the value was a number. `postedLimitKmh` will never
     * produce one, which is exactly why nothing caught it. */
    const speed = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
    /* `done` IS A WORD, AND A NUMBER THERE IS NOT ONE. Found by the same sweep:
     * `done: -1` rendered «ended «-1»» — a sentinel quoted as the reason a hold
     * ended. The `??` it used to go through only catches null/undefined, which
     * is the narrower half of "this sidecar does not carry a reason". */
    const reason = typeof o.done === "string" && o.done !== "" ? o.done : "still open when the drive ended";
    const need = speed(o.needKmh) ? `${o.needKmh} км/ч` : "the harness's margin over the disc (NOT RECORDED)";
    const band =
      speed(o.gradedAboveKmh) && speed(o.dangerousAboveKmh)
        ? `the engine's own minor band for that disc is (${o.gradedAboveKmh}, ${o.dangerousAboveKmh}] км/ч`
        : `the engine's own minor band for that disc was NOT RECORDED on this leg`;
    /* DID THIS HOLD EVER RUN? `flatTicks` is the harness's own answer and is
     * read first; a sidecar written before that field existed is answered from
     * the three things only a tick can produce. A hold that never ran has an
     * object full of legitimate-looking zeroes and one -1, and it rendered as
     * the no-disc arm: «(0 looked, top -1 км/ч)» — a search reported as having
     * looked and found nothing when it never looked once. */
    const ranTicks = typeof o.flatTicks === "number" && Number.isFinite(o.flatTicks) ? o.flatTicks : null;
    const everRan =
      ranTicks !== null
        ? ranTicks > 0
        : (typeof o.noDiscTicks === "number" && Number.isFinite(o.noDiscTicks) && o.noDiscTicks > 0) ||
          speed(o.postedKmh) ||
          (typeof o.topKmh === "number" && Number.isFinite(o.topKmh) && o.topKmh >= 0);
    const discKnown = speed(o.postedKmh);
    /* ── THE ORDER OF THESE FIVE ARMS IS LOAD-BEARING, AND IT WAS WRONG ─────
     * `sustained === true` used to be FIRST, ahead of the two arms that exist
     * to keep a missing number out of a sentence. So a sidecar carrying
     * `{on:true, sustained:true, postedKmh:null}` went straight into the HELD
     * arm and rendered «В26 disc null км/ч» — the literal word, in the one
     * sentence of this block a judge is most likely to quote, under a comment
     * asserting that no null ever reaches a sentence. The invariant was false
     * as written. The two absence arms are now BOTH above the HELD arm, so the
     * HELD arm is reached only when the disc is a finite number, and the
     * direct `${o.postedKmh}` interpolation inside it is safe BY THE ROUTING
     * rather than by hope. */
    if (!everRan) {
      L.push(
        `      OVER-LIMIT: THE DRIVE ENDED BEFORE ITS FIRST FLAT TICK — this lane is on the harness's ` +
          `SUSTAINED_OVER_LIMIT_LANES list, but the hold never ran once (${measured(ranTicks)} flat tick(s)). No В26 disc was ` +
          `looked for, no second was accrued and none was refused: every number in the sidecar is its INITIAL state and ` +
          `NOTHING HERE WAS MEASURED. A sustained-overspeed row is UNJUDGED from this leg and is NOT refuted by it.`,
      );
    } else if (o.done === "no-disc") {
      // ITS OWN SENTENCE, because the leading clause is the quotable one and
      // „did not hold the limit" is not what happened: nothing was ever held.
      L.push(
        `      OVER-LIMIT: THE HOLD WAS NEVER ATTEMPTED — the В26 disc was never on the glass ` +
          `(${measured(o.noDiscTicks)} flat tick(s) looked, top ${measured(o.topKmh)} км/ч). A MISSING INSTRUMENT, not a leg ` +
          `that failed to speed: a sustained-overspeed row is UNJUDGED from this leg and is NOT refuted by it.`,
      );
    } else if (!discKnown) {
      /* THE FOURTH STATE. The search does not latch — it keeps looking until
       * the В26 disc appears or its clock ceiling wins (the only one it has) —
       * so a drive that ENDED first leaves `done:null` with no posted number
       * ever read. That fell through to the „did not hold" arm below and
       * rendered as «the dial did NOT hold the posted limit (В26 disc null
       * км/ч … above null)»: two literal nulls in a judging brief, and a
       * positive claim about a leg where no disc was ever on the glass. This
       * arm, with the one above it, is what guarantees the two arms BELOW
       * never see a posted number that is not a number. */
      L.push(
        `      OVER-LIMIT: THE SEARCH WAS STILL RUNNING WHEN THE DRIVE ENDED — the В26 disc had not been on the glass on any ` +
          `flat tick (${measured(o.noDiscTicks)} looked, top ${measured(o.topKmh)} км/ч)` +
          (o.done === null || o.done === undefined
            ? ` and the search's clock ceiling had not been reached either`
            : ` and yet the sidecar ended «${reason}», which no leg without a disc can reach — read the sidecar and not this ` +
              `sentence, because one of the two is wrong`) +
          `, so nothing was ever held over anything. A MISSING INSTRUMENT exactly as a latched no-disc is: a ` +
          `sustained-overspeed row is UNJUDGED from this leg and is NOT refuted by it.`,
      );
    } else if (o.sustained === true) {
      /* AND THE TOP OF THE LEG IS CHECKED AGAINST THE BAND IT CLAIMS TO HAVE
       * ACCRUED IN. The ledger cannot accrue above `dangerousAboveKmh` — that
       * is the whole point of the upper bound — but `topKmh` is the highest
       * dial reading of the WHOLE flat phase and is not bounded by anything.
       * A leg that touched 65 over a posted 50 and then held 58 satisfies the
       * ledger honestly while this sentence said, flatly, that the seconds
       * „were accrued INSIDE" the minor band and nothing more: true of the
       * seconds, and silent about a reading the engine books under
       * SPEEDING_DANGEROUS (`rules/engine.ts:3375`). A judge quoting the line
       * would carry the first fact and lose the second. */
      const toppedHere =
        typeof o.topKmh === "number" &&
        Number.isFinite(o.topKmh) &&
        typeof o.dangerousAboveKmh === "number" &&
        Number.isFinite(o.dangerousAboveKmh) &&
        o.topKmh > o.dangerousAboveKmh;
      /* THE HARNESS NOW COMPUTES THIS FACT AT THE SOURCE TOO (`topAboveBand`,
       * off `overLimitScanStep`), and two copies of one predicate is how the
       * `metres`/`ms` feeds drifted. The recomputation STAYS — a sidecar
       * written before the field existed carries no flag and must still render
       * the warning — but where both exist they are CROSS-CHECKED, because a
       * disagreement means the published `topKmh` and the published flag are
       * not about the same drive, and that is worth more to a judge than
       * either number. Silence on a disagreement is the reassuring direction. */
      const toppedFlag = typeof o.topAboveBand === "boolean" ? o.topAboveBand : null;
      const toppedOut = toppedFlag === null ? toppedHere : toppedFlag || toppedHere;
      const toppedSplit = toppedFlag !== null && toppedFlag !== toppedHere;
      L.push(
        `      OVER-LIMIT: the dial HELD — ${secsPhrase} accrued strictly above ${need} (В26 disc ${o.postedKmh} + the ` +
          `harness's own margin), top ${measured(o.topKmh)} км/ч, at t=${measured(o.sustainedAtSec)}s, after ` +
          `${measured(o.restsHeld)} rest(s) were held back` +
          `${o.resets ? ` and ${measured(o.resets)} ledger reset(s) on dips to the posted number` : ""}. ${band}, and the ` +
          `seconds above were accrued INSIDE it — above its top the engine books SPEEDING_DANGEROUS, a different code.` +
          (toppedOut
            ? ` !! BUT THIS LEG'S TOP WENT ABOVE THAT BAND: ${measured(o.topKmh)} км/ч against an опасна line of ` +
              `${measured(o.dangerousAboveKmh)} км/ч. The accrued seconds are still inside the minor band — the ledger ` +
              `refuses to accrue above it — but part of what this leg DROVE is billed under SPEEDING_DANGEROUS ` +
              `(rules/engine.ts:3375) and not under the code the row is about. Do not read «accrued INSIDE it» as „the whole ` +
              `over-speed was minor".`
            : ``) +
          (toppedSplit
            ? ` !! AND THIS SIDECAR CONTRADICTS ITSELF: the harness recorded topAboveBand=${String(toppedFlag)} while its own ` +
              `published top (${measured(o.topKmh)} км/ч) against its own published опасна line ` +
              `(${measured(o.dangerousAboveKmh)} км/ч) says ${String(toppedHere)}. The two are not about the same drive; ` +
              `treat every number in this block as UNVERIFIED and re-drive the leg.`
            : ``) +
          /* THE MATERIAL ONE, AND IT LANDS IN THE SENTENCE THAT CLAIMS THE
           * ANTECEDENT. `needBelowGraded` is the harness's own `needKmh`
           * sitting under the engine's `gradedAbove` — it accrues seconds in a
           * band the изпитен лист bills NOTHING for, so „the antecedent was
           * DRIVEN" below would be this harness's claim and not the engine's.
           * The final clause is REPLACED rather than appended to, because a
           * contradiction two sentences apart is a contradiction a judge
           * quotes half of. */
          (o.needBelowGraded === true
            ? ` !! BUT THE ANTECEDENT IS NOT ESTABLISHED. This harness's own need (${measured(o.needKmh)} км/ч) sits BELOW the ` +
              `engine's graded band (${measured(o.gradedAboveKmh)} км/ч): the seconds above were accrued in a range the ` +
              `изпитен лист bills nothing for, so „held" here is this harness's verdict and not the engine's. A row about ` +
              `what the engine books for a SUSTAINED over-speed is UNJUDGED from this leg — do NOT read it as driven.`
            : ` THAT IS STILL THIS ` +
              `HARNESS'S CLOCK AND NOT A BILL: the engine's own sustain window, re-arm and repeat ceiling decide whether it became ` +
              `«Превишена скорост», and only the debrief on THIS leg answers that — read the CLASSES line and the objectives ` +
              `below before crediting or faulting the product. What this line establishes is that the antecedent was DRIVEN.`),
      );
    } else {
      L.push(
        `      OVER-LIMIT: the dial did NOT hold the posted limit (В26 disc ${o.postedKmh} км/ч, top ` +
          `${measured(o.topKmh)} км/ч, only ${secsPhrase} accrued above ${need}, ended ` +
          `«${reason}»` +
          `${o.resets ? `, ledger reset ${measured(o.resets)}× on dips to the posted number` : ""}). NO row about what the ` +
          `engine books for a SUSTAINED over-speed may rest on this leg. A dial that merely TOUCHED the number is a blip ` +
          `and not an episode, and the engine bills the episode.`,
      );
    }
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
