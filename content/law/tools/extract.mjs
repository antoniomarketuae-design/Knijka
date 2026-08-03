// Extract plain text paragraphs from a WordprocessingML document.xml.
// No interpretation: <w:p> -> one line, <w:t> concatenated, <w:tab> -> space.
import { readFileSync, writeFileSync } from "node:fs";

const xml = readFileSync(process.argv[2], "utf8");
const out = [];
// split on paragraph boundaries
const paras = xml.split(/<w:p[ >]/);
for (const p of paras) {
  const chunks = [];
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g;
  let m;
  while ((m = re.exec(p)) !== null) {
    if (m[1] === undefined) chunks.push(" ");
    else chunks.push(m[1]);
  }
  let text = chunks.join("");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (text) out.push(text);
}
writeFileSync(process.argv[3], out.join("\n"), "utf8");
console.log(`paragraphs: ${out.length}`);
