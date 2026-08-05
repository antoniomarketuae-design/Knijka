/**
 * Re-verify content/medical/ against freshly fetched sources.
 *
 * This is the tool the previous grounding attempt could not offer. It answers,
 * mechanically: "is every medical figure we ship still the words the guideline
 * actually uses?" Run it after fetch.sh; it needs no network of its own.
 *
 *   1. Re-extracts each source and compares textSha256 with sources.json.
 *      A mismatch means the page changed — not necessarily wrong, but no
 *      longer the text we read on retrievedAt.
 *   2. Checks every quote in claims.json occurs VERBATIM in its source text.
 *   3. Re-checks that each figureQuote still states its figure's digits.
 *   4. Re-checks the ЗДвП quotes against content/law/acts/zdvp.json.
 *
 * Exit code 1 on any failure, so CI can gate on it.
 *
 * Usage, from content/medical/tools/:
 *   bash fetch.sh && node verify-claims.mjs ..
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRATCH = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.argv[2];
if (!DIR) throw new Error("usage: node verify-claims.mjs <content/medical dir>");

const sources = JSON.parse(readFileSync(path.join(DIR, "sources.json"), "utf8"));
const claims = JSON.parse(readFileSync(path.join(DIR, "claims.json"), "utf8"));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const failures = [];
const warnings = [];
const textOf = new Map();

// 1 + prep: re-extract and compare the text hash.
for (const s of sources.sources) {
  // The extraction command is stored verbatim; pick the input and output out of
  // it by extension rather than by position, so flags like --charset cannot
  // shift the indices.
  const [cmd, ...args] = s.extraction.split(" ");
  const outFile = args.find((a) => a.endsWith(".txt"));
  const local = args.find((a) => /\.(pdf|html|docx)$/i.test(a));
  if (!outFile) {
    warnings.push(`${s.id}: extraction command names no .txt output; skipping`);
    continue;
  }
  if (!local || !existsSync(path.join(SCRATCH, local))) {
    warnings.push(`${s.id}: original "${local}" not present — run fetch.sh; skipping`);
    continue;
  }
  execFileSync(cmd, args, { cwd: SCRATCH, stdio: "pipe" });
  const buf = readFileSync(path.join(SCRATCH, outFile));
  textOf.set(s.id, buf.toString("utf8"));
  const got = sha256(buf);
  if (got !== s.textSha256) {
    failures.push(
      `${s.id}: textSha256 changed since ${sources.retrievedAt}\n` +
        `      expected ${s.textSha256}\n      got      ${got}\n` +
        `      ${s.url}\n      RE-READ THE SOURCE before touching any figure it grounds.`,
    );
  }
}

// ЗДвП rides along from the law corpus.
const zdvpPath = path.join(DIR, "..", "law", "acts", "zdvp.json");
const zdvpText = existsSync(zdvpPath)
  ? JSON.parse(readFileSync(zdvpPath, "utf8"))
      .units.map((u) => u.textBg)
      .join("\n")
  : null;
if (zdvpText === null) warnings.push("content/law/acts/zdvp.json missing — law: quotes unchecked");

const norm = (s) => s.replace(/[\s ­]+/g, " ").trim();

function check(claimId, label, ref) {
  if (!ref) return;
  const hay = ref.sourceId === "law:zdvp" ? zdvpText : textOf.get(ref.sourceId);
  if (hay === null || hay === undefined) {
    warnings.push(`${claimId}.${label}: source ${ref.sourceId} not available; unchecked`);
    return;
  }
  if (!norm(hay).includes(norm(ref.quoteBg))) {
    failures.push(
      `${claimId}.${label}: quote NOT FOUND in ${ref.sourceId}\n      "${ref.quoteBg.slice(0, 120)}…"`,
    );
  }
}

// 2 + 3 + 4
let quoteCount = 0;
for (const c of claims.claims) {
  const refs = [
    ["authoritative", c.authoritative],
    ["figureQuote", c.figureQuote],
    ...c.corroborating.map((r, i) => [`corroborating[${i}]`, r]),
    ...c.conflicts.map((r, i) => [`conflicts[${i}]`, r]),
  ];
  for (const [label, ref] of refs) {
    if (!ref) continue;
    quoteCount += 1;
    check(c.id, label, ref);
  }
  if (c.figureBg) {
    if (!c.figureQuote) {
      failures.push(`${c.id}: figure "${c.figureBg}" with no figureQuote`);
    } else {
      const missing = [...new Set(c.figureBg.match(/\d+/g) ?? [])].filter((d) => !c.figureQuote.quoteBg.includes(d));
      if (missing.length) {
        failures.push(`${c.id}: figureQuote does not state ${missing.join(", ")} of "${c.figureBg}"`);
      }
    }
  }
}

for (const w of warnings) console.warn(`  ~~ ${w}`);
for (const f of failures) console.error(`  !! ${f}`);
console.log(
  `verify-claims: ${claims.claims.length} claims / ${quoteCount} quotes across ${sources.sources.length} sources — ` +
    `${failures.length} failure(s), ${warnings.length} warning(s)`,
);
if (failures.length) process.exit(1);
