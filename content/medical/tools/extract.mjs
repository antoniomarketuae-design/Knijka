/**
 * Deterministic text extraction for the medical source register.
 *
 * HTML guideline pages are not statutes in .docx/.pdf: they carry per-request
 * tokens, so the raw bytes of two identical fetches differ. The invariant we
 * can pin is the *rendered text*. This script is the single definition of that
 * extraction, so `textSha256` in sources.json is reproducible by anyone.
 *
 *   node extract.mjs <in.html> <out.txt> [--charset windows-1251]
 *
 * No interpretation: block-level tags become line breaks, entities are decoded,
 * runs of spaces collapse. Nothing is rewritten, reordered or removed beyond
 * <script>/<style>, which carry no reader-visible text.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, outPath, ...rest] = process.argv;
if (!inPath || !outPath) throw new Error("usage: node extract.mjs <in.html> <out.txt> [--charset cs]");
const csIdx = rest.indexOf("--charset");
const charset = csIdx === -1 ? "utf-8" : rest[csIdx + 1];

let html = new TextDecoder(charset).decode(readFileSync(inPath));

html = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
html = html.replace(/<\/(p|div|li|h[1-6]|tr|td|th|section|article|header|footer|blockquote)>/gi, "\n");
html = html.replace(/<br\s*\/?>/gi, "\n");
html = html.replace(/<[^>]+>/g, "");

const NAMED = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  ndash: "\u2013", mdash: "\u2014", rsquo: "\u2019", lsquo: "\u2018",
  ldquo: "\u201C", rdquo: "\u201D", bdquo: "\u201E", laquo: "\u00AB",
  raquo: "\u00BB", hellip: "\u2026", deg: "\u00B0", copy: "\u00A9",
};
html = html
  .replace(/&([a-zA-Z]+);/g, (m, n) => (n in NAMED ? NAMED[n] : m))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));

const text = html
  .split("\n")
  .map((l) => l.replace(/[\s\u00A0\u200B]+/g, " ").trim())
  .filter(Boolean)
  .join("\n");

writeFileSync(outPath, text, "utf8");
console.log(`${outPath}: ${text.length} chars, ${text.split("\n").length} lines`);
