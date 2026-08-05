/**
 * The gate. Re-extract every original, re-hash it, and re-check every quote in
 * claims.json against the text it claims to come from. Exit 1 on any drift.
 *
 *   cd content/sources/tools && bash fetch.sh && node verify.mjs ..
 *
 * This is the difference between grounding that is DOCUMENTED and grounding
 * that is RE-VERIFIABLE — the exact gap docs/education/90 §14 recorded against
 * the previous first-aid wave, whose ERC citations carried no URL, no byte
 * count and no hash and could not be re-fetched at all.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCES, normaliseForMatch } from "./build.mjs";

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(toolsDir, process.argv[2] ?? "..");

const sources = JSON.parse(fs.readFileSync(path.join(dir, "sources.json"), "utf8"));
const claims = JSON.parse(fs.readFileSync(path.join(dir, "claims.json"), "utf8"));

const fileById = new Map(SOURCES.map((s) => [s.id, s.file]));
const failures = [];
const warnings = [];
const texts = new Map();

for (const row of sources.sources) {
  const file = fileById.get(row.id);
  if (!file) {
    failures.push(`${row.id}: no fetch entry in build.mjs SOURCES — cannot re-verify`);
    continue;
  }
  const pdf = path.join(toolsDir, file);
  if (!fs.existsSync(pdf)) {
    failures.push(`${row.id}: original ${file} is missing — run fetch.sh`);
    continue;
  }
  const raw = fs.readFileSync(pdf);
  const rawSha = createHash("sha256").update(raw).digest("hex");
  if (row.rawHashStable && rawSha !== row.rawSha256) {
    failures.push(`${row.id}: rawSha256 changed (${row.rawSha256} → ${rawSha})`);
  }

  const txt = pdf.replace(/\.pdf$/, ".txt");
  execFileSync("node", [path.join(toolsDir, "extract.mjs"), pdf, txt], { stdio: "pipe" });
  const text = fs.readFileSync(txt, "utf8");
  texts.set(row.id, normaliseForMatch(text));
  const textSha = createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
  if (textSha !== row.textSha256) {
    failures.push(`${row.id}: textSha256 changed (${row.textSha256} → ${textSha}) — the source moved under our quotes`);
  }
}

let quoteCount = 0;
for (const claim of claims.claims) {
  const all = [claim.authoritative, claim.figureQuote, ...claim.corroborating].filter(Boolean);
  for (const q of all) {
    quoteCount += 1;
    const hay = texts.get(q.sourceId);
    if (hay === undefined) {
      failures.push(`${claim.id}: quote cites ${q.sourceId}, which is not in sources.json`);
      continue;
    }
    if (!hay.includes(normaliseForMatch(q.quoteBg))) {
      failures.push(`${claim.id} → ${q.sourceId}: QUOTE NOT FOUND — "${q.quoteBg.slice(0, 70)}…"`);
    }
  }
  if (claim.figureBg) {
    const figureQuote = claim.figureQuote ?? claim.authoritative;
    for (const d of claim.figureBg.match(/\d+/g) ?? []) {
      if (!figureQuote || !figureQuote.quoteBg.includes(d)) {
        failures.push(`${claim.id}: figureBg "${claim.figureBg}" — quote never states "${d}"`);
      }
    }
  }
  if (claim.questionIds.length === 0) warnings.push(`${claim.id}: grounds no question`);
}

console.log(
  `verify: ${claims.claims.length} claim(s) / ${quoteCount} quote(s) across ` +
    `${sources.sources.length} source(s) — ${failures.length} failure(s), ${warnings.length} warning(s)`,
);
for (const w of warnings) console.warn(`  WARN  ${w}`);
for (const f of failures) console.error(`  FAIL  ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
