/**
 * EVERY STUDENT-FACING STRING THE PRODUCT SHIPS, ENUMERATED (test-only helper).
 *
 * Two consumers:
 *   · `reviewed-text-manifest.test.ts` fingerprints every surface, so ANY added,
 *     removed or changed string anywhere is a red until someone re-records the
 *     manifest on purpose (round 4, CLASS B of «KEEP-RIGHT FOLLOWS THE LAW»);
 *   · `keep-right-claim-census.test.ts` proves its own reading is a SUBSET of
 *     this one (a census sentence that the manifest does not hold would be a
 *     sentence the manifest cannot guard).
 *
 * A «string» is one text value as the product holds it — a card field, a step,
 * a caption, a beat's narration, a question option, a literal in code — with at
 * least one Cyrillic letter (the product speaks Bulgarian; ids, enum values and
 * numbers are not text a student reads), OR, since round 5, any non-empty value
 * of a field that is TEXT BY SCHEMA whatever it is written in (`TEXT_KEY`: a
 * key ending in «Bg», and the `act` / `ref` / `lawRef` of a citation): the
 * answer option «39.» has no letter in it and is as much the student's text as
 * a sentence is (round-4 verifier T03). Each string has a SURFACE, a UNIT
 * inside it and a PATH inside the unit; the three together are its address.
 *
 * SURFACES (what is read, and how)
 *   catalog       rules/catalog.ts       every exported value that is not a
 *   consequences  rules/consequences.ts  function: every string at any depth.
 *   n38           rules/n38.ts           Unit = the export's name.
 *   template      every ScenarioSpec of SCENARIO_TEMPLATES — every string at
 *                 any depth. Unit = the lesson id.
 *   compiled      `compileScenario(spec, level)` at EVERY authored rung — the
 *                 briefing, description, objective titles and rung texts the
 *                 player actually renders. Unit = «lesson@L<level>».
 *   caption       every committed recording under content/traces: every string
 *                 of the trace except its `samples`. Unit = «lesson/tape».
 *   theory        every content/lessons lesson: every string, `grounds`
 *                 included (a ground's `ref` becomes the beat's shown lawRef in
 *                 lesson/narration.ts). Unit = the lesson id.
 *   question      content/questions: every string of every question — stem,
 *                 EVERY option (a distractor is shown too), explanation,
 *                 lawRefs. Unit = the question id.
 *   concept       content/concepts.json, topics.json, sections.json,
 *                 content/hazard, content/signs, content/medical and — since
 *                 round 5 — content/sources, the register the tutor grounds its
 *                 figures on (JSON only). Unit = the file.
 *   source        every string literal, template-literal chunk and JSX text
 *                 holding a Cyrillic letter in every non-test SCRIPT under
 *                 platform/src — .ts/.tsx and, since round 5, .mts/.cts/.js/
 *                 .jsx/.mjs/.cjs too (tsconfig has `allowJs`: a sentence in a
 *                 new .js module the why-panel imports was unread — round-4
 *                 verifier T10) — parsed with the TypeScript compiler, and
 *                 every string of every non-test .json under platform/src.
 *                 Unit = the file; path = the literal's ordinal in the file.
 *   world         every committed map under content/world: every string — the
 *                 street and spawn names the referents speak, the lane-arrow
 *                 labels, the law and sign references of the authored zones,
 *                 the notes. Unit = the district id.
 *   public        every text file the browser can fetch from platform/public
 *                 except the two parity-checked copies (`traces/`, `world/`):
 *                 every string of a .json (the clip manifest's titles), and
 *                 every LINE holding a Cyrillic letter of a .html / .js / .svg /
 *                 .webmanifest / .txt / .xml (the offline page, the service
 *                 worker's «Няма връзка…», the sign faces' titles). Unit = the
 *                 file.
 *   law           the law bank, content/law/**.json — FINGERPRINTED, NOT STORED
 *                 (`reviewedTextManifest.ts` UNSTORED): one unit per provision
 *                 of each act («file · чл. N [index]»), one for the act's own
 *                 header, one per other file. A changed provision is a red that
 *                 names the provision and prints its new text; the old text is
 *                 the bank's own history. The bank is 1.5 MB of text that is
 *                 the reference everything else is checked against — a second
 *                 copy of it in a fixture would be a second bank.
 *
 *   artwork       (round 5) the text PAINTED IN or attached to every SVG under
 *                 content/, platform/public/ and platform/src/ — today the 77
 *                 sign faces the theory side serves (/api/signs/[code] reads
 *                 content/signs/svg) and the simulator's own faces: every
 *                 `<title>`, `<desc>` and `<text>` (nested `<tspan>`s
 *                 flattened) and every `aria-label` — DIGITS INCLUDED, no
 *                 Cyrillic filter: the «90» on the national-limits plate Е22 and
 *                 the «СОФИЯ» on Д11 are what the student is shown (round-4
 *                 verifier T01, T08, T09). An SVG whose text elements cannot all
 *                 be read is reported (`artworkUnreadable`) and is a red, never
 *                 a silent skip. Unit = the file.
 *
 * NOT READ, and why — said here so nobody takes the manifest for more than it is:
 *   content/review, content/audits, every README/Markdown and build script —
 *                        reviewer / build material, not shown to a student.
 *   platform/public      `traces/` and `world/` are checked for PARITY with
 *                        content/ by the manifest test (the public copy is what
 *                        the player fetches); RASTER images, models, fonts, wasm
 *                        (text baked into pixels is not readable here).
 *   CSS                  `globals.css` holds Cyrillic in comments only.
 *   test files, `__tests__` directories, `.d.ts`.
 *   Text that exists only at RUN TIME (an LLM reply, a string concatenated from
 *   numbers) — its literal PARTS are in `source`; the composition is not.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

/** Source and artwork text as the LF tree holds it: a checkout with CRLF line endings (229 files in the main
 *  worktree on 2026-10-02) must fingerprint exactly as the lanes and CI do, or the gate is red on line endings. */
const readTextLf = (p: string): string => fs.readFileSync(p, "utf-8").replace(/\r\n/gu, "\n");

import { SCENARIO_TEMPLATES } from "../templates";
import { compileScenario } from "../compile";
import * as catalogModule from "../../../rules/catalog";
import * as consequencesModule from "../../../rules/consequences";
import * as n38Module from "../../../rules/n38";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const SRC_ROOT = path.join(REPO_ROOT, "platform", "src");
const CONTENT = path.join(REPO_ROOT, "content");

export const SURFACES = [
  "catalog",
  "consequences",
  "n38",
  "template",
  "compiled",
  "caption",
  "theory",
  "question",
  "concept",
  "source",
  "world",
  "public",
  "law",
  "artwork",
] as const;
export type SurfaceId = (typeof SURFACES)[number];

export interface TextEntry {
  /** Where inside the unit (a JSON path, or «#n» for the n-th literal of a file). */
  path: string;
  text: string;
}
export interface TextUnit {
  unit: string;
  entries: TextEntry[];
}
export type StudentText = Record<SurfaceId, TextUnit[]>;

export const CYRILLIC = /\p{Script=Cyrillic}/u;
/**
 * A field that is student text BY SCHEMA, whatever it is written in: the house
 * convention «…Bg» (textBg, explanationBg, titleBg, lineBg, stepsBg…) and the
 * parts of a citation printed beside the text. A value under such a key is
 * read even when it holds no Cyrillic letter — «39.», «50», «§ 6».
 */
export const TEXT_KEY = /Bg$|^(?:act|ref|lawRef)$/u;

/**
 * Every student string under `root`, depth-first in key order, with its path:
 * a string holding a Cyrillic letter, or any non-empty string under a
 * text-by-schema key (an array's items stand under the array's key).
 */
export function cyrillicStrings(root: unknown, skipKeys: ReadonlySet<string> = new Set()): TextEntry[] {
  const out: TextEntry[] = [];
  const seen = new Set<unknown>();
  const walk = (o: unknown, p: string, key: string) => {
    if (typeof o === "string") {
      if (CYRILLIC.test(o) || (TEXT_KEY.test(key) && o.trim() !== "")) out.push({ path: p, text: o });
      return;
    }
    if (o === null || typeof o !== "object" || seen.has(o)) return;
    seen.add(o);
    if (Array.isArray(o)) {
      o.forEach((v, i) => walk(v, `${p}[${i}]`, key));
      return;
    }
    for (const [k, v] of Object.entries(o)) {
      if (skipKeys.has(k)) continue;
      walk(v, p ? `${p}.${k}` : k, k);
    }
  };
  walk(root, "", "");
  return out;
}

/** The scripts the source surface parses, and how: null = not a script it reads. */
export function scriptKindOf(fileName: string): ts.ScriptKind | null {
  if (/\.test\.[cm]?[jt]sx?$/u.test(fileName) || /\.d\.[cm]?ts$/u.test(fileName)) return null;
  if (/\.tsx$/u.test(fileName)) return ts.ScriptKind.TSX;
  if (/\.jsx$/u.test(fileName)) return ts.ScriptKind.JSX;
  if (/\.[cm]?ts$/u.test(fileName)) return ts.ScriptKind.TS;
  if (/\.[cm]?js$/u.test(fileName)) return ts.ScriptKind.JS;
  return null;
}

const SVG_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
const decodeXml = (text: string): string =>
  text
    .replace(/&#x([0-9a-f]+);/giu, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/gu, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/giu, (m, name: string) => SVG_ENTITIES[name.toLowerCase()] ?? m);
/**
 * The text an SVG carries: every `<title>`, `<desc>` and `<text>` (inner tags
 * such as `<tspan>` removed, whitespace collapsed, entities decoded) and every
 * `aria-label`. NO Cyrillic filter — the digits painted on a plate are text.
 * `unreadable` names every text element this reader could not pair with its
 * closing tag (a self-closed or unterminated one): the caller must treat a
 * non-empty list as a red, not as «no text».
 */
export function svgTexts(svg: string): { entries: TextEntry[]; unreadable: string[] } {
  const entries: TextEntry[] = [];
  const count: Record<string, number> = {};
  const push = (kind: string, raw: string) => {
    const text = decodeXml(raw.replace(/<[^>]*>/gu, " ")).replace(/\s+/gu, " ").trim();
    const i = (count[kind] = (count[kind] ?? -1) + 1);
    if (text !== "") entries.push({ path: `${kind}[${i}]`, text });
  };
  const body = svg.replace(/<!--[\s\S]*?-->/gu, "");
  let paired = 0;
  for (const m of body.matchAll(/<(title|desc|text)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gu)) {
    // a self-closed opening tag («<text x="1"/>») is not an opening tag of this element
    if (/\/\s*>$/u.test(m[0].slice(0, m[0].indexOf(">") + 1))) continue;
    paired++;
    push(m[1], m[2]);
  }
  for (const m of body.matchAll(/\saria-label\s*=\s*(?:"([^"]*)"|'([^']*)')/gu)) push("aria-label", m[1] ?? m[2] ?? "");
  const opened = [...body.matchAll(/<(title|desc|text)(?=[\s>/])/gu)];
  const unreadable = opened.length === paired ? [] : [`${opened.length} <title>/<desc>/<text> opening tag(s), ${paired} read`];
  return { entries, unreadable };
}

/** The Cyrillic literals of one TypeScript source, in source order. */
export function cyrillicLiterals(fileName: string, text: string): string[] {
  const out: string[] = [];
  if (!CYRILLIC.test(text)) return out;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, scriptKindOf(fileName) ?? (fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
  const push = (s: string) => {
    if (CYRILLIC.test(s)) out.push(s);
  };
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) push(node.text);
    else if (ts.isTemplateExpression(node)) {
      push(node.head.text);
      for (const span of node.templateSpans) push(span.literal.text);
    } else if (ts.isJsxText(node)) push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const SKIP_SAMPLES: ReadonlySet<string> = new Set(["samples"]);
const rel = (abs: string) => path.relative(REPO_ROOT, abs).split(path.sep).join("/");
const jsonFilesUnder = (abs: string): string[] => {
  if (!fs.existsSync(abs)) return [];
  const st = fs.statSync(abs);
  if (!st.isDirectory()) return abs.endsWith(".json") ? [abs] : [];
  return fs
    .readdirSync(abs)
    .sort()
    .flatMap((f) => jsonFilesUnder(path.join(abs, f)));
};

/** Every committed recording: «lesson/tape» → absolute path of the content copy. */
export function traceFiles(): { unit: string; abs: string; publicAbs: string }[] {
  const dir = path.join(CONTENT, "traces");
  const out: { unit: string; abs: string; publicAbs: string }[] = [];
  for (const lesson of fs.readdirSync(dir).sort()) {
    const sub = path.join(dir, lesson);
    if (!fs.statSync(sub).isDirectory()) continue;
    for (const f of fs.readdirSync(sub).sort()) {
      if (!f.endsWith(".trace.json")) continue;
      out.push({
        unit: `${lesson}/${f.replace(/\.trace\.json$/u, "")}`,
        abs: path.join(sub, f),
        publicAbs: path.join(REPO_ROOT, "platform", "public", "traces", lesson, f),
      });
    }
  }
  return out;
}
/** Every committed map: district id → the content copy and the copy the player fetches. */
export function worldFiles(): { unit: string; abs: string; publicAbs: string }[] {
  const dir = path.join(CONTENT, "world");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({
      unit: f.replace(/\.json$/u, ""),
      abs: path.join(dir, f),
      publicAbs: path.join(REPO_ROOT, "platform", "public", "world", f),
    }));
}
/** Every Cyrillic string of one JSON file. */
export function jsonStrings(abs: string): TextEntry[] {
  return cyrillicStrings(JSON.parse(fs.readFileSync(abs, "utf-8")));
}
/** The student-facing strings of one recording file (everything but `samples`). */
export function traceStrings(abs: string): TextEntry[] {
  return cyrillicStrings(JSON.parse(fs.readFileSync(abs, "utf-8")), SKIP_SAMPLES);
}

let memo: StudentText | null = null;
let unreadableArtwork: string[] = [];
/** Enumerate everything. Deterministic; reads the worktree; memoised per process. */
export function enumerateStudentText(): StudentText {
  if (memo) return memo;
  const out = Object.fromEntries(SURFACES.map((s) => [s, [] as TextUnit[]])) as StudentText;

  // 1–3. the rules tables
  const tables: [SurfaceId, Record<string, unknown>][] = [
    ["catalog", catalogModule as unknown as Record<string, unknown>],
    ["consequences", consequencesModule as unknown as Record<string, unknown>],
    ["n38", n38Module as unknown as Record<string, unknown>],
  ];
  for (const [surface, mod] of tables) {
    for (const name of Object.keys(mod).sort()) {
      const value = mod[name];
      if (typeof value === "function") continue;
      const entries = cyrillicStrings(value);
      if (entries.length > 0) out[surface].push({ unit: name, entries });
    }
  }

  // 4–5. every lesson template, raw and compiled at every authored rung
  for (const spec of SCENARIO_TEMPLATES) {
    out.template.push({ unit: spec.id, entries: cyrillicStrings(spec) });
    for (const level of [1, 2, 3, 4, 5] as const) {
      if (!spec.levels.some((l) => l.level === level)) continue;
      out.compiled.push({ unit: `${spec.id}@L${level}`, entries: cyrillicStrings(compileScenario(spec, level)) });
    }
  }

  // 6. every committed recording
  for (const t of traceFiles()) out.caption.push({ unit: t.unit, entries: traceStrings(t.abs) });

  // 7. every theory lesson
  const lessonsDir = path.join(CONTENT, "lessons");
  for (const f of fs.readdirSync(lessonsDir).sort()) {
    if (!f.endsWith(".json")) continue;
    const doc = JSON.parse(fs.readFileSync(path.join(lessonsDir, f), "utf-8")) as { id?: string };
    out.theory.push({ unit: doc.id ?? f.replace(/\.json$/u, ""), entries: cyrillicStrings(doc) });
  }

  // 8. the question bank
  const questionsDir = path.join(CONTENT, "questions");
  for (const f of fs.readdirSync(questionsDir).sort()) {
    if (!f.endsWith(".json")) continue;
    const bank = JSON.parse(fs.readFileSync(path.join(questionsDir, f), "utf-8")) as unknown;
    const list = Array.isArray(bank) ? (bank as { id?: string }[]) : [bank as { id?: string }];
    list.forEach((q, i) => out.question.push({ unit: q.id ?? `${f}[${i}]`, entries: cyrillicStrings(q) }));
  }

  // 9. the rest of the theory content
  for (const name of ["concepts.json", "topics.json", "sections.json", "hazard", "signs", "medical", "sources"]) {
    for (const abs of jsonFilesUnder(path.join(CONTENT, name))) {
      let doc: unknown;
      try {
        doc = JSON.parse(fs.readFileSync(abs, "utf-8"));
      } catch {
        continue;
      }
      const entries = cyrillicStrings(doc);
      if (entries.length > 0) out.concept.push({ unit: rel(abs), entries });
    }
  }

  // 10. every Cyrillic literal in every non-test source file (and non-test JSON) under platform/src
  const scan = (abs: string) => {
    for (const ent of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const p = path.join(abs, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "__tests__" || ent.name === "__snapshots__" || ent.name === "node_modules") continue;
        // `src/generated/` is the Prisma client — gitignored (platform/.gitignore), built by `prisma generate`, absent
        // from a fresh checkout and from every lane. Machine output is not reviewed text, and reading it made the gate
        // red in the one tree that had run the generator.
        if (ent.name === "generated" && path.basename(abs) === "src") continue;
        scan(p);
        continue;
      }
      if (/\.test\.[cm]?[jt]sx?$/u.test(ent.name) || /\.d\.[cm]?ts$/u.test(ent.name)) continue;
      if (scriptKindOf(ent.name) !== null) {
        const lits = cyrillicLiterals(p, readTextLf(p));
        if (lits.length > 0) out.source.push({ unit: rel(p), entries: lits.map((text, i) => ({ path: `#${i}`, text })) });
      } else if (ent.name.endsWith(".json")) {
        let doc: unknown;
        try {
          doc = JSON.parse(fs.readFileSync(p, "utf-8"));
        } catch {
          continue;
        }
        const entries = cyrillicStrings(doc);
        if (entries.length > 0) out.source.push({ unit: rel(p), entries });
      }
    }
  };
  scan(SRC_ROOT);

  // 11. every committed map
  for (const w of worldFiles()) {
    const entries = jsonStrings(w.abs);
    if (entries.length > 0) out.world.push({ unit: w.unit, entries });
  }

  // 12. platform/public — everything textual but the two parity-checked copies
  const PUBLIC = path.join(REPO_ROOT, "platform", "public");
  const scanPublic = (abs: string, top: boolean) => {
    for (const ent of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const p = path.join(abs, ent.name);
      if (ent.isDirectory()) {
        if (top && (ent.name === "traces" || ent.name === "world")) continue;
        scanPublic(p, false);
        continue;
      }
      if (ent.name.endsWith(".json")) {
        let entries: TextEntry[];
        try {
          entries = jsonStrings(p);
        } catch {
          continue;
        }
        if (entries.length > 0) out.public.push({ unit: rel(p), entries });
      } else if (/\.(?:html|js|svg|webmanifest|txt|xml)$/u.test(ent.name)) {
        const entries = fs
          .readFileSync(p, "utf-8")
          .split(/\r?\n/u)
          .map((line) => line.trim())
          .filter((line) => CYRILLIC.test(line))
          .map((text, i) => ({ path: `#${i}`, text }));
        if (entries.length > 0) out.public.push({ unit: rel(p), entries });
      }
    }
  };
  if (fs.existsSync(PUBLIC)) scanPublic(PUBLIC, true);

  // 13. the law bank — one unit per provision (fingerprinted, not stored)
  for (const abs of jsonFilesUnder(path.join(CONTENT, "law"))) {
    let doc: unknown;
    try {
      doc = JSON.parse(fs.readFileSync(abs, "utf-8"));
    } catch {
      continue;
    }
    const units = (doc as { units?: unknown }).units;
    if (doc !== null && typeof doc === "object" && Array.isArray(units)) {
      const head = cyrillicStrings(doc, new Set(["units"]));
      if (head.length > 0) out.law.push({ unit: rel(abs), entries: head });
      units.forEach((u, i) => {
        const entries = cyrillicStrings(u);
        const ref = (u as { ref?: unknown }).ref;
        if (entries.length > 0) out.law.push({ unit: `${rel(abs)} · ${typeof ref === "string" ? ref : "?"} [${i}]`, entries });
      });
    } else {
      const entries = cyrillicStrings(doc);
      if (entries.length > 0) out.law.push({ unit: rel(abs), entries });
    }
  }

  // 14. the artwork — the text painted in / attached to every SVG the product ships
  unreadableArtwork = [];
  const scanSvg = (abs: string) => {
    if (!fs.existsSync(abs)) return;
    for (const ent of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const p = path.join(abs, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === "__tests__" || ent.name === "__snapshots__") continue;
        scanSvg(p);
        continue;
      }
      if (!/\.svg$/iu.test(ent.name)) continue;
      const { entries, unreadable } = svgTexts(readTextLf(p));
      for (const why of unreadable) unreadableArtwork.push(`${rel(p)}: ${why}`);
      if (entries.length > 0) out.artwork.push({ unit: rel(p), entries });
    }
  };
  scanSvg(CONTENT);
  scanSvg(PUBLIC);
  scanSvg(SRC_ROOT);

  for (const s of SURFACES) out[s].sort((a, b) => (a.unit < b.unit ? -1 : a.unit > b.unit ? 1 : 0));
  memo = out;
  return out;
}

/** Every SVG whose text elements the artwork reader could not all read (after `enumerateStudentText()`). */
export function artworkUnreadable(): string[] {
  enumerateStudentText();
  return [...unreadableArtwork];
}

/** 12 hex digits (48 bits) of a string's sha256 — the id a string is held by in the manifest. */
export const hashOf = (text: string): string => crypto.createHash("sha256").update(text, "utf8").digest("hex").slice(0, 12);
