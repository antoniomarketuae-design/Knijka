#!/usr/bin/env node
/**
 * THE THREE ERROR-CLASS COUNTS, RECOVERED FROM SWEEPS ALREADY TAKEN.
 *
 *   node tools/audit/severity-from-debrief.mjs [sweepFramesDir] [lessonFilter]
 *
 * `SessionEndScreen.tsx` now carries `data-sev` and the harness writes a
 * `severity` block into every new `_audit-debrief.json` (a2fa487). That does
 * nothing for the sweeps already on disk — and `sc-vp-readiness:b3c922d5`, a
 * row entirely about those three numbers, has come back UNJUDGED eight times
 * because reading them cost twenty-four screenshot opens.
 *
 * It need not have. Every sidecar since 2026-08-21 carries the debrief's own
 * TEXT, and the class table is in it verbatim:
 *
 *   «Разбивка на наказателните точки по класове грешки КЛАС ГРЕШКА БРОЙ ТОЧКИ
 *    Опасни грешки (по 10 изпитни т.) 2 20 Основни грешки (по 3 изпитни т.) 0 0
 *    Второстепенни грешки (по 1 изпитна т.) 0 0 Общо (допустими 9) 2 20»
 *
 * So the numbers were recorded all along, inside a string nobody parsed.
 *
 * IT PARSES A FIELD, IT DOES NOT GREP FOR A COUNT. The label is matched whole,
 * the parenthesised rate is skipped explicitly, and exactly two integers are
 * taken after it. A regex that merely looked for digits near «Опасни» would
 * find the 10 in «по 10 изпитни т.» — the rate, not the count — which is the
 * shape of error that has produced three wrong numbers in this programme.
 *
 * A lane that cannot be parsed is reported as `null`, never as zero: "no table"
 * and "a table of zeroes" are opposite findings, and the second is the entire
 * content of b3c922d5.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";

const SWEEP = process.argv[2] || ".audit-frames/w43/frames";
const FILTER = process.argv[3] || null;

const CLASSES = [
  ["opasna", "Опасни грешки"],
  ["osnovna", "Основни грешки"],
  ["vtorostepenna", "Второстепенни грешки"],
];

/** `{count, points}` for one class, or null when the label is not in the text. */
export function classFromDebriefText(text, labelBg) {
  if (typeof text !== "string") return null;
  const at = text.indexOf(labelBg);
  if (at < 0) return null;
  let rest = text.slice(at + labelBg.length);
  // Skip the parenthesised rate — «(по 10 изпитни т.)» — WITHOUT letting its
  // digits become the answer. This is the whole reason the function exists.
  const paren = /^\s*\([^)]*\)/.exec(rest);
  if (paren) rest = rest.slice(paren[0].length);
  const m = /^\s*(-?[0-9]+)\s+(-?[0-9]+)\b/.exec(rest);
  if (!m) return null;
  return { count: Number(m[1]), points: Number(m[2]) };
}

/** All three classes, or null if the table is not present at all. */
export function severityFromDebriefText(text) {
  const out = {};
  let any = false;
  for (const [key, label] of CLASSES) {
    const v = classFromDebriefText(text, label);
    out[key] = v;
    if (v) any = true;
  }
  return any ? out : null;
}

function debriefTextOf(dir) {
  const f = `${dir}/_audit-debrief.json`;
  if (!existsSync(f)) return null;
  let j;
  try { j = JSON.parse(readFileSync(f, "utf8")); } catch { return null; }
  // Prefer the harness's own structured read where a newer sweep has one.
  if (j.severity) return { structured: j.severity, text: null, verdict: j.verdict, score: j.score };
  return { structured: null, text: JSON.stringify(j.debrief ?? ""), verdict: j.verdict, score: j.score };
}

if (process.argv[1] && process.argv[1].endsWith("severity-from-debrief.mjs")) {
  const rows = [];
  for (const d of readdirSync(SWEEP)) {
    if (FILTER && !d.includes(FILTER)) continue;
    const got = debriefTextOf(`${SWEEP}/${d}`);
    if (!got) { rows.push({ leg: d, sev: null, why: "no sidecar" }); continue; }
    const sev = got.structured
      ? { via: "harness", ...got.structured }
      : (() => { const s = severityFromDebriefText(got.text); return s ? { via: "text", ...s } : null; })();
    rows.push({ leg: d, sev, verdict: got.verdict, score: got.score });
  }
  const n = (v) => (v ? `${v.count} ${v.points}` : "  —  ");
  console.log(`sweep: ${SWEEP}${FILTER ? `   filter: ${FILTER}` : ""}   legs: ${rows.length}\n`);
  console.log("  опасни  основни  второст.  verdict        score  lane");
  let parsed = 0, anyNonZero = 0, allZero = 0;
  for (const r of rows.sort((a, b) => a.leg.localeCompare(b.leg))) {
    if (!r.sev) { console.log(`   NOT PARSED                              ${r.leg}`); continue; }
    parsed++;
    const tot = ["opasna", "osnovna", "vtorostepenna"].reduce((a, k) => a + (r.sev[k]?.count ?? 0), 0);
    if (tot > 0) anyNonZero++; else allZero++;
    console.log(
      `  ${n(r.sev.opasna).padStart(6)}  ${n(r.sev.osnovna).padStart(7)}  ${n(r.sev.vtorostepenna).padStart(8)}  ` +
        `${String(r.verdict ?? "-").padEnd(13)} ${String(r.score ?? "-").padStart(5)}  ${r.leg}`,
    );
  }
  console.log(`\nparsed ${parsed} of ${rows.length}   ·  at least one class non-zero: ${anyNonZero}   ·  every class zero: ${allZero}`);
}
