#!/usr/bin/env node
/**
 * WHICH OPEN ROWS ASSERT A NUMBER THE LATEST SWEEP CONTRADICTS.
 *
 *   node tools/audit/stale-claims.mjs [sweepFramesDir]
 *
 * WHY. A finding is a REPORT, and a report is as stale as the day it was
 * written — this programme has been caught by that at least four times, once
 * spending a 53-agent workflow on rows that were not even open. Many rows carry
 * a literal, checkable assertion inside their prose: a verdict, a star count,
 * «0 наказателни точки», «0 опасни / 0 основни / 0 второстепенни». Those can be
 * compared against the newest drive of the same lesson by machine, in seconds.
 *
 * WHAT A HIT IS AND IS NOT. A hit means THE SENTENCE AS FILED no longer
 * describes the newest drive. It is NOT a closure and never a REFUTE on its
 * own: most of these rows have a substance that survives their arithmetic — a
 * row that says «the wrong drive scores 0 наказателни точки» and now reads 6 is
 * still asking why the lesson's own fault code never fired. The output is a
 * queue for a judge, ordered so nobody spends a repair lane on a sentence that
 * is simply out of date.
 *
 * IT REPORTS ONLY WHAT IT CAN CHECK. Rows with no numeric assertion are counted
 * and skipped, not guessed at.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { corpusCounts, openListLine, workedLine } from "./finding-reader.mjs";
import { severityFromDebriefText } from "./severity-from-debrief.mjs";
import { normaliseVerdict } from "./verdict-surface.mjs";

/**
 * ADR-009's word, as `verdict-surface.mjs PILL_WORDS` carries it. Imported as a
 * literal rather than by index so a rename shows up here as a failing test and
 * not as a check that quietly stops recognising the verdict.
 */
const NOT_TAKEN = "НЕ Е ВЗЕТ";

const SWEEP = process.argv[2] || ".audit-frames/w43/frames";

const readJson = (f) => {
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; }
};

/** Every leg of a lesson in this sweep, with the facts a claim can be checked against. */
function legsOf(scenario) {
  const out = [];
  for (const d of readdirSync(SWEEP)) {
    if (!d.startsWith(`${scenario}__`)) continue;
    const db = readJson(`${SWEEP}/${d}/_audit-debrief.json`);
    if (!db) continue;
    out.push({
      leg: d.split("__")[1] ?? d,
      mode: db.mode,
      verdict: db.verdict ?? null,
      score: db.score ?? null,
      severity: db.severity ?? severityFromDebriefText(JSON.stringify(db.debrief ?? "")),
      objectives: db.debrief?.objectives ?? [],
      text: JSON.stringify(db.debrief ?? ""),
    });
  }
  return out;
}

/** The assertions this tool knows how to check, each with how to test it. */
export const CHECKS = [
  {
    id: "zero-penalty-points",
    // «scores 0 наказателни точки», «0 наказателни точки», «Общо 0»
    claims: (w) => /\b0 наказателни точки\b|\bОбщо 0\b|scores 0 наказателни/iu.test(w),
    // The claim is about a leg scoring nothing. A hit needs EVERY leg of the
    // relevant kind to score something — one leg still at 0 leaves the row
    // standing, and saying otherwise would retire a row on a partial reading.
    test: (legs) => {
      const scored = legs.filter((l) => typeof l.score === "number");
      if (!scored.length) return null;
      return scored.every((l) => l.score > 0)
        ? `every leg now scores > 0: ${scored.map((l) => `${l.leg} ${l.score}т.`).join(", ")}`
        : null;
    },
  },
  {
    id: "all-three-classes-zero",
    claims: (w) => /0 опасни|0 dangerous|нито една опасна/iu.test(w) && /второстепенн|secondary/iu.test(w),
    test: (legs) => {
      const withSev = legs.filter((l) => l.severity);
      if (!withSev.length) return null;
      const nonZero = withSev.filter((l) =>
        ["opasna", "osnovna", "vtorostepenna"].some((k) => (l.severity[k]?.count ?? 0) > 0),
      );
      if (!nonZero.length) return null;
      return `a class is now non-zero on ${nonZero.length}/${withSev.length} leg(s): ${nonZero
        .map((l) => `${l.leg} [${["opasna", "osnovna", "vtorostepenna"].map((k) => l.severity[k]?.count ?? "?").join("/")}]`)
        .join(", ")}`;
    },
  },
  {
    id: "credited-izdarzhan",
    /* «НЕИЗДЪРЖАН» CONTAINS «ИЗДЪРЖАН», AND THIS TOOL SHIPPED THE BUG ONCE.
     * The first cut matched `ИЗДЪРЖАН with` and duly flagged
     * sc-park-gap-short:b1024483 — a row whose complaint IS that both legs end
     * НЕИЗДЪРЖАН — as contradicted, on the grounds that no leg is credited
     * ИЗДЪРЖАН. That is the row agreeing with itself.
     *
     * `lesson-audit.mjs` already carries this warning in terms, about its own
     * verdict matcher, and it was not enough to stop me repeating it. So the
     * test is anchored: the word must not be preceded by «НЕ». */
    claims: (w) => /(^|[^Н])(^|[^Е])credited ИЗДЪРЖАН|(?<!НЕ)ИЗДЪРЖАН with/u.test(w) && !/НЕИЗДЪРЖАН/u.test(w),
    /* ── ADR-009: «НЕ Е ВЗЕТ» IS ITS OWN WORD HERE, NOT A KIND OF «НЕИЗДЪРЖАН».
     *
     * Founder Ruling A gave the result screen a fourth pill, and doc 92 §12 R3
     * expects about TEN right legs that pass today to start reading it on the
     * next sweep — five of them on legs the harness never steered. Folding it
     * into «no longer credited ИЗДЪРЖАН» and stopping there would hand a judge
     * a contradiction that is, on half those legs, this harness drifting into
     * the lesson's own fault rather than the product changing its mind.
     *
     * So the word is REPORTED BY NAME with the one instruction that keeps the
     * next verdict honest: read the leg's own inputs first. The hit still
     * fires — the filed sentence «credited ИЗДЪРЖАН» genuinely no longer
     * describes the drive — but it can no longer be read as «the product now
     * penalises this», which is a different claim about a different ledger. */
    test: (legs) => {
      const right = legs.filter((l) => l.mode === "right" && l.verdict);
      if (!right.length) return null;
      const said = (l) => normaliseVerdict(l.verdict);
      if (!right.every((l) => said(l) !== "ИЗДЪРЖАН")) return null;
      const notTaken = right.filter((l) => said(l) === NOT_TAKEN);
      const base = `no right leg is credited ИЗДЪРЖАН any more: ${right
        .map((l) => `${l.leg} ${l.verdict}`)
        .join(", ")}`;
      if (notTaken.length === 0) return base;
      return (
        `${base}. ${notTaken.length} of them read «${NOT_TAKEN}» (ADR-009): the изпитен лист is ` +
        "within tolerance and the LESSON was refused because its own taught mistake happened — " +
        "not a наказателна точка more than before. Before filing a regression, check that leg's " +
        "own inputs (run.log STEERING, route/droveIt): doc 92 §12 R3 expects ~10 right legs to " +
        "move for harness reasons"
      );
    },
  },
  {
    id: "zero-errors",
    claims: (w) => /\b0 errors\b|без нито едно нарушение|\bMISTAKES \(0\)/iu.test(w),
    test: (legs) => {
      const withSev = legs.filter((l) => l.severity);
      if (!withSev.length) return null;
      const nz = withSev.filter((l) =>
        ["opasna", "osnovna", "vtorostepenna"].some((k) => (l.severity[k]?.count ?? 0) > 0),
      );
      return nz.length === withSev.length && withSev.length > 0
        ? `every leg now books at least one error: ${nz.map((l) => l.leg).join(", ")}`
        : null;
    },
  },
];

/**
 * The report. WRAPPED IN A FUNCTION SO THE TABLE ABOVE CAN BE TESTED WITHOUT
 * READING THE CORPUS — and, more to the point, without PRINTING it. At import
 * time this file used to call `corpusCounts()` and log the whole queue, so any
 * test that wanted to look at one regex dragged the corpus and a page of output
 * in with it. That is how this file reached 2026-09-18 with four checks, one
 * shipped bug (the «НЕИЗДЪРЖАН» substring) and no test at all.
 *
 * THE COST, MEASURED RATHER THAN GUESSED (E:, 7200 rpm, 2026-09-18):
 * `corpusCounts()` takes **14.4 s on a cold page cache and 0.21 s warm** over
 * 99 open rows, and an unguarded import prints **2,375 bytes**. An earlier
 * revision of this comment justified the refactor with «~100 s on this disk» —
 * a number nobody measured, wrong by two orders of magnitude warm, and a claim
 * all the same. The guard earns its place on the printing, not on the clock.
 */
export function report() {
  const c = corpusCounts();
  // THE STAMP — this reads the corpus, so count-agreement.mjs requires it.
  console.log(openListLine(c));
  console.log(workedLine("open", c.open));
  const hits = [];
  let checkable = 0;
  for (const f of c.open) {
    const w = String(f.what ?? "");
    const applicable = CHECKS.filter((k) => k.claims(w));
    if (!applicable.length) continue;
    checkable++;
    const legs = legsOf(f.scenario);
    if (!legs.length) continue;
    for (const k of applicable) {
      const why = k.test(legs);
      if (why) hits.push({ id: f.findingId, sev: f.severity, check: k.id, why, what: w.slice(0, 150) });
    }
  }

  console.log(`open rows: ${c.open.length}   ·  rows carrying a checkable numeric claim: ${checkable}   ·  sweep: ${SWEEP}\n`);
  if (!hits.length) {
    console.log("No open row's filed arithmetic is contradicted by this sweep.");
  } else {
    console.log(`${hits.length} row(s) assert something this sweep contradicts.`);
    console.log("A hit is NOT a closure: the substance of a row usually survives its arithmetic.\n");
    for (const h of hits) {
      console.log(`  [${String(h.sev ?? "?").slice(0, 4).toUpperCase().padEnd(4)}] ${h.id}   (${h.check})`);
      console.log(`      FILED : ${h.what}…`);
      console.log(`      NOW   : ${h.why}`);
      console.log("");
    }
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) report();
