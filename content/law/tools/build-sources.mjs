/**
 * Emit content/law/sources.json — the source register.
 * Every entry is HEAD-verified live; nothing is recorded from memory.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The fetched originals sit next to this script (see .gitignore).
 *
 * `fileURLToPath`, not `new URL(...).pathname` — the pathname is percent-encoded
 * and does not survive this repo's own checkout path: the space in "E:\AI driver"
 * comes back as "%20" and every read fails with ENOENT on
 * "E:\AI%20driver\content\law\tools\…". Matches build-speed-acts.mjs.
 */
const SCRATCH = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2];
const RETRIEVED = "2026-08-03";

const sha256 = (f) => createHash("sha256").update(readFileSync(path.join(SCRATCH, f))).digest("hex");
const bytesOf = (f) => readFileSync(path.join(SCRATCH, f)).length;

async function head(url) {
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow" });
    return { httpStatus: r.status, contentType: r.headers.get("content-type") };
  } catch {
    return { httpStatus: 0, contentType: null };
  }
}

const ingested = [
  {
    id: "src-zdvp-mtc-16062026",
    actId: "zdvp",
    titleBg: "ЗАКОН за движението по пътищата",
    kind: "zakon",
    publisherBg: "Министерство на транспорта и съобщенията",
    url: "https://www.mtc.government.bg/sites/default/files/documents/2026-06/ZAKON_za_dvijenieto_po_pytisata16062026.docx",
    format: "docx",
    bytes: bytesOf("zdvp_16062026.docx"),
    sha256: sha256("zdvp_16062026.docx"),
    versionBg: "консолидиран текст, изм. ДВ, бр. 55 от 16.06.2026 г.",
    coverage: "full-text",
    extraction: "OOXML w:t extraction (verbatim, one paragraph per line)",
  },
  {
    id: "src-naredba-iz-2539-sars",
    actId: "naredba-iz-2539",
    titleBg:
      "НАРЕДБА № Із-2539 от 17 декември 2012 г. за определяне максималния размер на контролните точки, условията и реда за отнемането и възстановяването им…",
    kind: "naredba",
    publisherBg: "Държавна агенция „Безопасност на движението по пътищата“ (нормативна база)",
    url: "https://www.sars.gov.bg/wp-content/uploads/2025/01/NAREDBA-%D0%86z-2539-OT-17-DEKEMVRI-2012.pdf",
    format: "pdf",
    bytes: bytesOf("iz2539.pdf"),
    sha256: sha256("iz2539.pdf"),
    versionBg: null,
    coverage: "full-text",
    extraction: "pdftotext -enc UTF-8 -nopgbrk",
  },
  {
    id: "src-naredba-38-sars",
    actId: "naredba-38",
    titleBg:
      "НАРЕДБА № 38 от 16 април 2004 г. за условията и реда за провеждането на изпитите на кандидати за придобиване на правоспособност за управление на моторно превозно средство…",
    kind: "naredba",
    publisherBg: "Държавна агенция „Безопасност на движението по пътищата“ (нормативна база)",
    url: "https://www.sars.gov.bg/wp-content/uploads/2025/01/NAREDBA-38-OT-16-%D0%90PRIL-2004.pdf",
    format: "pdf",
    bytes: bytesOf("naredba38.pdf"),
    sha256: sha256("naredba38.pdf"),
    versionBg: null,
    coverage: "full-text",
    extraction: "pdftotext -enc UTF-8 -nopgbrk",
  },
];

// Ids must be ASCII kebab-case (the schema enforces it), so transliterate.
const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s",
  т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sht",
  ъ: "a", ь: "y", ю: "yu", я: "ya",
};
const slug = (s) =>
  [...s.toLowerCase()]
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 7)
    .join("-");

const index = JSON.parse(readFileSync(path.join(SCRATCH, "sars-index.json"), "utf8"));
const catalogued = [];
let n = 0;
for (const [titleBg, kind, url] of index) {
  if (ingested.some((s) => s.url === url)) continue;
  const h = await head(url);
  n += 1;
  process.stderr.write(`  [${n}] ${h.httpStatus} ${titleBg.slice(0, 60)}\n`);
  catalogued.push({
    id: `src-sars-${slug(titleBg)}`.slice(0, 72),
    actId: null,
    titleBg,
    kind,
    publisherBg: "Държавна агенция „Безопасност на движението по пътищата“ (нормативна база)",
    url,
    format: url.endsWith(".doc") ? "doc" : "pdf",
    bytes: null,
    sha256: null,
    versionBg: null,
    coverage: "index-only",
    extraction: null,
    httpStatus: h.httpStatus,
  });
}

for (const s of ingested) s.httpStatus = 200;

const doc = {
  version: 1,
  retrievedAt: RETRIEVED,
  registerUrl: "https://www.sars.gov.bg/normativna-uredba/bg-zakonodatelstvo/",
  sources: [...ingested, ...catalogued],
};

writeFileSync(path.join(OUT, "sources.json"), JSON.stringify(doc, null, 1) + "\n", "utf8");
const bad = catalogued.filter((c) => c.httpStatus !== 200);
console.log(
  `sources.json: ${doc.sources.length} entries (${ingested.length} full-text, ${catalogued.length} index-only); non-200: ${bad.length}`,
);
for (const b of bad) console.log(`  !! ${b.httpStatus} ${b.url}`);
