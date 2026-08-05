/**
 * The ONE definition of "the text of this source" for content/sources.
 *
 * Everything registered here so far is a PDF, so extraction is pdftotext plus
 * one normalisation that the medical register learned the hard way: pdftotext
 * on Windows emits CRLF and on Linux LF, so a raw hash over its output is not
 * reproducible across machines. Line endings are normalised to \n BEFORE the
 * hash, which makes `textSha256` an invariant anyone can reproduce.
 *
 *   node extract.mjs <in.pdf> <out.txt>
 *
 * Nothing is rewritten, reordered or removed. If pdftotext is unavailable the
 * script says so and exits 1 rather than silently emitting a different text.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) throw new Error("usage: node extract.mjs <in.pdf> <out.txt>");

try {
  execFileSync("pdftotext", ["-enc", "UTF-8", "-nopgbrk", inPath, outPath], { stdio: "pipe" });
} catch (err) {
  console.error(`pdftotext failed for ${inPath}: ${err.message}`);
  console.error("Install poppler-utils; the extraction must not vary by tool.");
  process.exit(1);
}

const text = readFileSync(outPath, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
writeFileSync(outPath, text, "utf8");
console.log(`${outPath}: ${Buffer.byteLength(text, "utf8")} bytes, ${text.split("\n").length} lines`);
