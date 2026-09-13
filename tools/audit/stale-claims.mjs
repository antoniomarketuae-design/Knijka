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
import { corpusCounts } from "./finding-reader.mjs";
import { severityFromDebriefText } from "./severity-from-debrief.mjs";

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
const CHECKS = [
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
    test: (legs) => {
      const right = legs.filter((l) => l.mode === "right" && l.verdict);
      if (!right.length) return null;
      return right.every((l) => l.verdict !== "ИЗДЪРЖАН")
        ? `no right leg is credited ИЗДЪРЖАН any more: ${right.map((l) => `${l.leg} ${l.verdict}`).join(", ")}`
        : null;
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

const c = corpusCounts();
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
