/**
 * THE PRODUCT-WIDE REVIEWED-TEXT MANIFEST (founder ruling 2026-10-01
 * «KEEP-RIGHT FOLLOWS THE LAW», round 4, CLASS B).
 *
 * WHY THIS EXISTS. Three rounds guarded the keep-right claim by RECOGNISING it:
 * first five slogans, then a verbatim pin of «every card the three lessons can
 * show», then a product-wide census of every sentence with left/right-lane
 * vocabulary. Each round's verifier wrote the same false sentence somewhere the
 * guard did not look, or in words it did not read:
 *   · «В бързата лента не се пътува — и в града тя е само докато изпреварваш.»
 *     on the SPEEDING_DANGEROUS card — a card any lesson can bill, outside the
 *     «cards the three lessons show», in words with no left/right in them;
 *   · «Лявата е за по-бързите.» — a sentence the census already knew — pasted
 *     into a debrief literal shown on every road.
 * A vocabulary can never close this: there is no list of the ways to say a
 * false thing, and no list of the places it can be said. So this file does not
 * recognise anything. It holds ONE RECORDED FINGERPRINT PER SURFACE over EVERY
 * student-facing string the product ships (`studentText.ts` says exactly what
 * is read and what is not), and ANY added, removed or changed string, anywhere,
 * is a red that prints the surface, the unit, the field and the old and new
 * sentence — until a person re-records the manifest on purpose.
 *
 * THE THREAT MODEL — stated, because a gate that claims more than it holds is
 * how the last three rounds were refuted:
 *   IN MODEL    any edit that adds, removes, changes or moves a student-facing
 *               string on any surface the enumeration reads, and leaves the
 *               files under `reviewed-text-manifest/` untouched. It must die
 *               here, in whatever words it is written, whether or not any other
 *               test recognises it.
 *   IN MODEL    an edit to the manifest's own files without the matching text
 *               (a fingerprint, a unit line, a stored sentence): red (§1).
 *   IN MODEL    the machinery going blind — the enumeration skipping a source,
 *               the reporter or the gate's decision saying «nothing changed»:
 *               the recorded ledger pins what is enumerated, and §5 runs the
 *               reporter, the gate's decision (`gateVerdict`) and the parity
 *               comparison on synthetic input where each must say NO.
 *   OUT OF MODEL deleting an assertion of this file. No test survives that.
 *   OUT OF MODEL a text edit that ALSO re-records the manifest. Those are two
 *               coordinated edits, and the second one is the reviewer's
 *               signature: the commit that re-records shows, as its own diff
 *               of `strings.*.txt`, every sentence that was signed. Whether the
 *               signed sentence is TRUE is the reviewer's job and, for the
 *               keep-right vocabulary, `keep-right-claim-census.test.ts`'s.
 *   OUT OF MODEL a string built at run time from parts (its literal parts are
 *               held; the composition is not), text on a surface listed under
 *               «NOT READ» in studentText.ts, and a deliberate 48-bit digest
 *               collision.
 *   ONE SURFACE IS FINGERPRINTED WITHOUT ITS TEXT: the law bank (`law`). An
 *   edit to any provision is a red that names the provision and prints its new
 *   text; the OLD text is not in this manifest (the bank is the reference, and
 *   is not copied) — read it from the bank's own history.
 *
 * THE COST, said plainly: this couples to every lane that touches text. A
 * rebase onto a tree with other text changes turns this red until the manifest
 * is re-recorded THERE; the generator prints exactly which sentences differ.
 *
 * ROUND 5 — WHAT THE ROUND-4 VERIFIER WALKED THROUGH, NOW READ (its R4-2 list):
 *   · text painted in the sign artwork the theory side serves (content/signs/
 *     svg: «СОФИЯ» on Д11, the «90» on Е22, a `<title>`) — the new `artwork`
 *     surface: every `<title>`/`<desc>`/`<text>`/`aria-label` of every SVG,
 *     digits included (T01, T08, T09);
 *   · a string with no Cyrillic letter in a field that is text by schema — the
 *     answer option «39.» — is read like any other (T03);
 *   · a script that is not .ts/.tsx (tsconfig has `allowJs`) is parsed like the
 *     rest of the source (T10).
 *   · content/sources — the register the tutor grounds its figures on — joins
 *     the `concept` surface (the verifier's T05 edited a figure there; it died
 *     only on the register's own test).
 *   STILL NOT READ: text baked into raster images, and content/review and
 *   content/audits (see studentText.ts).
 *
 * RE-RECORD — after READING every sentence it prints:
 *   RECORD_REVIEWED_TEXT_MANIFEST=1 npx vitest run --maxWorkers=1 src/modules/sim/lessons/scenario/__tests__/reviewed-text-manifest.test.ts
 * It prints every changed sentence (old −, new +) by surface, unit and field,
 * writes the same list to REVIEWED_TEXT_MANIFEST_REPORT (a path; default: the
 * OS temp dir) and rewrites the files under `reviewed-text-manifest/`.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripStaffAnnotations } from "@/lib/content/sanitize";
import { runCensus, sentencesOf, type Surface } from "./keepRightCensus";
import {
  RECORD_COMMAND,
  UNSTORED,
  copyParity,
  diffSurface,
  gateVerdict,
  fingerprintOf,
  formatChanges,
  ledgerOf,
  loadLedger,
  loadManifest,
  loadStrings,
  record,
  recordOf,
  type UnitLedger,
} from "./reviewedTextManifest";
import * as ts from "typescript";
import {
  SURFACES,
  TEXT_KEY,
  artworkUnreadable,
  cyrillicLiterals,
  cyrillicStrings,
  enumerateStudentText,
  hashOf,
  jsonStrings,
  scriptKindOf,
  svgTexts,
  traceFiles,
  traceStrings,
  worldFiles,
  type SurfaceId,
  type TextUnit,
} from "./studentText";

const all = enumerateStudentText();

if (process.env.RECORD_REVIEWED_TEXT_MANIFEST === "1") {
  const changes = record(all);
  const report =
    changes.length === 0
      ? "reviewed-text manifest: nothing changed against the previous recording.\n"
      : `reviewed-text manifest: ${changes.length} string(s) differ from the previous recording — READ EACH before committing:\n${formatChanges(changes, Number.MAX_SAFE_INTEGER)}\n`;
  const file = process.env.REVIEWED_TEXT_MANIFEST_REPORT ?? path.join(os.tmpdir(), "reviewed-text-manifest-changes.txt");
  fs.writeFileSync(file, report);
  console.log(`${report}\n(the same list is in ${file})`);
}

const manifest = loadManifest();
const reviewed = loadStrings();
const ledgers = Object.fromEntries(SURFACES.map((s) => [s, loadLedger(s)])) as Record<SurfaceId, UnitLedger>;

describe("0. the enumeration is not blind — every surface read its source", () => {
  it("each surface holds at least what it holds today (floors at ≈ 70 %, not pins)", () => {
    const floors: Record<SurfaceId, { units: number; strings: number }> = {
      catalog: { units: 8, strings: 390 },
      consequences: { units: 11, strings: 640 },
      n38: { units: 7, strings: 95 },
      template: { units: 167, strings: 2900 },
      compiled: { units: 560, strings: 6300 },
      caption: { units: 350, strings: 1300 },
      theory: { units: 37, strings: 3100 },
      question: { units: 760, strings: 7300 },
      concept: { units: 5, strings: 1000 },
      source: { units: 340, strings: 9100 },
      world: { units: 106, strings: 950 },
      public: { units: 10, strings: 70 },
      law: { units: 500, strings: 1400 },
      artwork: { units: 85, strings: 100 },
    };
    for (const s of SURFACES) {
      const strings = all[s].reduce((n, u) => n + u.entries.length, 0);
      expect(all[s].length, `${s}: units`).toBeGreaterThanOrEqual(floors[s].units);
      expect(strings, `${s}: strings`).toBeGreaterThanOrEqual(floors[s].strings);
    }
  });

  it("the surfaces are the ones the header names: the three rules tables, templates raw and compiled, captions, theory, the question bank, concepts, code", () => {
    expect([...SURFACES]).toEqual([
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
    ]);
    // the cards the round-3 survivors were written on are IN the read set
    const cat = new Map(all.catalog.map((u) => [u.unit, u]));
    const violations = cat.get("VIOLATIONS")?.entries ?? [];
    for (const code of ["SPEEDING_DANGEROUS", "SPEEDING_OVER_LIMIT", "NOT_KEEPING_RIGHT", "HARSH_BRAKING_NO_CAUSE"]) {
      expect(violations.some((e) => e.path.startsWith(`${code}.`)), code).toBe(true);
    }
    expect(all.consequences.some((u) => u.entries.some((e) => e.path.startsWith("SPEEDING_DANGEROUS.")))).toBe(true);
    expect(all.n38.some((u) => u.entries.some((e) => e.path.startsWith("SPEEDING_DANGEROUS")))).toBe(true);
    // every template at EVERY authored rung
    expect(all.compiled.length).toBeGreaterThan(all.template.length * 3);
    for (const id of ["sc-ov-keep-right", "sc-ln-boulevard-discipline", "sc-vp-police-stop", "sc-ed-d2-city-run", "sc-lane-change"]) {
      expect(all.template.some((u) => u.unit === id), id).toBe(true);
      expect(all.compiled.some((u) => u.unit.startsWith(`${id}@L`)), id).toBe(true);
    }
    // theory: whole lessons, every beat — not the lane beats only
    const theory = new Map(all.theory.map((u) => [u.unit, u]));
    for (const id of ["l-basics-obligations", "l-maneuvers-lanes", "l-maneuvers-overtaking", "l-admin-newdriver-police"]) {
      expect(theory.get(id)?.entries.some((e) => /^beats\[\d+\]\.narrationBg$/u.test(e.path)), id).toBe(true);
    }
    // the maps, the offline page and the law bank's own чл. 15 are in it too
    expect(all.world.some((u) => u.unit === "d2-v1" && u.entries.some((e) => /^roads\.edges\[\d+\]\.name$/u.test(e.path)))).toBe(true);
    expect(all.public.some((u) => u.unit === "platform/public/offline.html")).toBe(true);
    expect(all.public.some((u) => u.unit === "platform/public/clips/manifest.json")).toBe(true);
    const art15 = all.law.filter((u) => u.unit.startsWith("content/law/acts/zdvp.json · чл. 15 ["));
    expect(art15).toHaveLength(1);
    expect(art15[0].entries.some((e) => e.text.includes("използва най-дясната свободна лента"))).toBe(true);
    // code-built text: the debrief and the lesson engine's coach lines
    for (const f of ["platform/src/modules/sim/lessons/debrief.ts", "platform/src/modules/sim/lessons/engine.ts", "platform/src/modules/sim/rules/catalog.ts"]) {
      expect(all.source.some((u) => u.unit === f), f).toBe(true);
    }
  });
});

describe("0b. ROUND 5 — the surfaces the round-4 verifier walked through are read", () => {
  it("SIGN ARTWORK: every SVG's title and painted text is held, digits included — Д11's «СОФИЯ», Е22's 50 / 90 / 120 / 140", () => {
    const art = new Map(all.artwork.map((u) => [u.unit, u.entries]));
    expect(art.get("content/signs/svg/d11.svg")).toEqual([
      { path: "title[0]", text: "Д11 — Начало на населено място" },
      { path: "text[0]", text: "СОФИЯ" },
    ]);
    expect(art.get("content/signs/svg/e22.svg")?.map((e) => e.text)).toEqual([
      "Е22 — Допустими максимални скорости на движение",
      "БЪЛГАРИЯ",
      "50",
      "90",
      "120",
      "140",
    ]);
    // every sign face of both sets carries at least its title, and the two sets are both walked
    expect(all.artwork.filter((u) => u.unit.startsWith("content/signs/svg/")).length).toBeGreaterThanOrEqual(77);
    expect(all.artwork.filter((u) => u.unit.startsWith("platform/public/sim/signs/faces/")).length).toBeGreaterThanOrEqual(11);
    // digit-only painted text is in the read set (no Cyrillic filter on this surface)
    expect(all.artwork.flatMap((u) => u.entries).filter((e) => /^\d+$/u.test(e.text)).length).toBeGreaterThanOrEqual(8);
  });

  it("the tutor's grounding register (content/sources) is held: its claims and its sources", () => {
    const units = all.concept.map((x) => x.unit);
    expect(units).toContain("content/sources/claims.json");
    expect(units).toContain("content/sources/sources.json");
    expect(all.concept.find((x) => x.unit === "content/sources/claims.json")?.entries.some((e) => /figureBg$/u.test(e.path))).toBe(true);
  });

  it("no SVG has a text element the reader could not read (a blind reader is a red, never «no text»)", () => {
    expect(artworkUnreadable()).toEqual([]);
  });

  it("the SVG reader, on synthetic artwork: title, desc, text with tspans, entities, aria-label, digits — and it REPORTS what it cannot pair", () => {
    const svg =
      '<svg aria-label="Знак 80"><!-- <text>коментар</text> --><title id="t">В26 — &quot;80&quot;</title><desc>Описание</desc>' +
      '<text x="1">80</text><text><tspan>ДРЪЖ</tspan> <tspan>ВДЯСНО</tspan></text><text>  </text><textPath>не е текстов елемент</textPath></svg>';
    expect(svgTexts(svg)).toEqual({
      entries: [
        { path: "title[0]", text: 'В26 — "80"' },
        { path: "desc[0]", text: "Описание" },
        { path: "text[0]", text: "80" },
        { path: "text[1]", text: "ДРЪЖ ВДЯСНО" },
        { path: "aria-label[0]", text: "Знак 80" },
      ],
      unreadable: [],
    });
    // a painted number CHANGED is a different entry; the same number on another plate position is another path
    expect(svgTexts("<svg><text>90</text></svg>").entries).not.toEqual(svgTexts("<svg><text>80</text></svg>").entries);
    // an unterminated or self-closed text element is reported, not skipped
    expect(svgTexts("<svg><text>50</svg>").unreadable).toHaveLength(1);
    expect(svgTexts('<svg><text x="1"/><text>50</text></svg>').unreadable).toHaveLength(1);
    expect(svgTexts("<svg><title>А</title><text>50</text></svg>").unreadable).toEqual([]);
  });

  it("TEXT BY SCHEMA: a non-empty value under a «…Bg» key or a citation key is read with no Cyrillic letter in it — the answer option «39.»", () => {
    expect(TEXT_KEY.test("textBg")).toBe(true);
    expect(TEXT_KEY.test("explanationBg")).toBe(true);
    expect(TEXT_KEY.test("ref")).toBe(true);
    expect(TEXT_KEY.test("id")).toBe(false);
    expect(TEXT_KEY.test("status")).toBe(false);
    expect(
      cyrillicStrings({
        id: "q-x-001",
        type: "single",
        points: 3,
        textBg: "Колко точки?",
        options: [
          { id: "a", textBg: "39.", correct: true },
          { id: "b", textBg: "", correct: false },
        ],
        stepsBg: ["50", "Спри."],
        lawRefs: [{ act: "ЗДвП", ref: "§ 6" }],
        media: { file: "signs/svg/b2.svg" },
      }),
    ).toEqual([
      { path: "textBg", text: "Колко точки?" },
      { path: "options[0].textBg", text: "39." },
      { path: "stepsBg[0]", text: "50" },
      { path: "stepsBg[1]", text: "Спри." },
      { path: "lawRefs[0].act", text: "ЗДвП" },
      { path: "lawRefs[0].ref", text: "§ 6" },
    ]);
    // …and the bank's own digit-only options are in the question surface
    const q17 = all.question.find((u) => u.unit === "q-dokumenti-i-sanktsii-017");
    expect(q17?.entries.filter((e) => /^options\[\d\]\.textBg$/u.test(e.path)).map((e) => e.text).sort()).toEqual(["100.", "26.", "39.", "50."]);
  });

  it("EVERY SCRIPT under platform/src is source: .js / .jsx / .mjs / .cjs / .mts / .cts are parsed like .ts and .tsx; tests and declarations are not", () => {
    for (const [name, kind] of [
      ["whyExtra.js", ts.ScriptKind.JS],
      ["a.mjs", ts.ScriptKind.JS],
      ["a.cjs", ts.ScriptKind.JS],
      ["a.jsx", ts.ScriptKind.JSX],
      ["a.ts", ts.ScriptKind.TS],
      ["a.mts", ts.ScriptKind.TS],
      ["a.cts", ts.ScriptKind.TS],
      ["a.tsx", ts.ScriptKind.TSX],
    ] as const) {
      expect(scriptKindOf(name), name).toBe(kind);
    }
    for (const name of ["a.test.ts", "a.test.tsx", "a.test.js", "a.test.mjs", "a.d.ts", "a.json", "a.css", "a.txt", "a.md"]) expect(scriptKindOf(name), name).toBeNull();
    // the round-4 verifier's T10 module, verbatim, is read
    expect(cyrillicLiterals("whyExtra.js", 'export const WHY_EXTRA = "В бързата лента не се пътува — и в града тя е само докато изпреварваш.";\n')).toEqual([
      "В бързата лента не се пътува — и в града тя е само докато изпреварваш.",
    ]);
    expect(cyrillicLiterals("a.jsx", "export const A = () => <p>Дръж вдясно</p>;")).toEqual(["Дръж вдясно"]);
  });
});

describe("1. the recorded manifest is whole and agrees with itself", () => {
  it("manifest.json exists, names the generator command and has every surface", () => {
    expect(manifest, `no manifest — record it: ${RECORD_COMMAND}`).not.toBeNull();
    expect(manifest!.command).toBe(RECORD_COMMAND);
    expect(Object.keys(manifest!.surfaces).sort()).toEqual([...SURFACES].sort());
  });

  it.each([...SURFACES])("%s: the fingerprint and the counts in manifest.json are those of units.<surface>.txt", (s) => {
    expect(recordOf(ledgers[s])).toEqual(manifest!.surfaces[s]);
  });

  it("strings.*.txt holds exactly the strings the unit lines name — each once, each under its own digest", () => {
    expect(reviewed.corrupt, "a stored sentence that does not hash to its id (edited by hand?)").toEqual([]);
    expect(reviewed.misfiled).toEqual([]);
    expect(reviewed.duplicate).toEqual([]);
    // …of every STORED surface. The law bank is fingerprinted only (UNSTORED).
    expect([...UNSTORED]).toEqual(["law"]);
    const named = new Set<string>();
    for (const s of SURFACES) {
      if (UNSTORED.has(s)) continue;
      for (const tokens of ledgers[s].values()) for (const id of tokens.slice(1)) named.add(id);
    }
    const missing = [...named].filter((id) => !reviewed.byId.has(id));
    const stale = [...reviewed.byId.keys()].filter((id) => !named.has(id));
    expect(missing.slice(0, 20), "ids a unit line names with no stored text").toEqual([]);
    expect(stale.slice(0, 20), "stored text no unit line names").toEqual([]);
  });
});

describe("2. THE GATE — every student-facing string on every surface is the reviewed one", () => {
  // The decision is `gateVerdict` (reviewedTextManifest.ts) — §5 proves on
  // synthetic input that it says NO. The message it carries lists every
  // difference: surface, unit, field, the old sentence (−) and the new one (+).
  it.each([...SURFACES])("%s", (s) => {
    const verdict = gateVerdict(s, ledgers[s], manifest?.surfaces[s], all[s], reviewed.byId);
    expect(verdict.ok, verdict.message).toBe(true);
  });
});

describe("3. the copy of each recording the PLAYER fetches (platform/public/traces) says what the reviewed one says", () => {
  it("every committed recording has a public copy whose student-facing strings are identical", () => {
    const files = traceFiles();
    const { missing, different } = copyParity(
      files.map((t) => ({ unit: t.unit, reviewed: traceStrings(t.abs), copy: fs.existsSync(t.publicAbs) ? traceStrings(t.publicAbs) : null })),
    );
    expect(files.length).toBeGreaterThan(350);
    expect(missing).toEqual([]);
    expect(different).toEqual([]);
  });
});

describe("3b. the copy of each map the PLAYER fetches (platform/public/world) says what the reviewed one says", () => {
  it("every committed district has a public copy whose strings are identical", () => {
    const files = worldFiles();
    const { missing, different } = copyParity(
      files.map((w) => ({ unit: w.unit, reviewed: jsonStrings(w.abs), copy: fs.existsSync(w.publicAbs) ? jsonStrings(w.publicAbs) : null })),
    );
    expect(files.length).toBeGreaterThanOrEqual(106);
    expect(missing).toEqual([]);
    expect(different).toEqual([]);
  });
});

describe("4. the keep-right census reads nothing this manifest does not hold", () => {
  it("every sentence the census classifies is a sentence of a manifest string on the same surface", () => {
    const census = runCensus();
    const held = new Map<Surface, Set<string>>();
    // The census reads the question bank AS SERVED (round 5): the loader strips
    // the staff `[REVIEW: …]` note in front of an explanation, so a sentence that
    // follows a note starts where the student sees it start. The manifest holds
    // the FILE's string (note included — a note edit is a red here too), so the
    // sentences of its served form are the ones to compare with.
    const add = (surface: Surface, units: TextUnit[]) => {
      const set = held.get(surface) ?? new Set<string>();
      for (const u of units) {
        for (const e of u.entries) {
          for (const snt of sentencesOf(e.text)) set.add(snt);
          if (surface === "question") for (const snt of sentencesOf(stripStaffAnnotations(e.text))) set.add(snt);
        }
      }
      held.set(surface, set);
    };
    for (const s of ["catalog", "consequences", "n38", "template", "caption", "theory", "question", "concept", "source"] as const) add(s, all[s]);
    const unheld: string[] = [];
    for (const [sentence, occ] of census.sentences) {
      for (const o of occ) if (!held.get(o.surface)?.has(sentence)) unheld.push(`${o.surface} | ${o.where} | ${sentence}`);
    }
    expect(unheld.slice(0, 20)).toEqual([]);
    expect(census.sentences.size).toBeGreaterThan(400);
  });
});

describe("5. the reporter says what changed — on a synthetic unit, so the red above can be trusted to explain itself", () => {
  const unit = (entries: [string, string][]): TextUnit[] => [{ unit: "sc-x", entries: entries.map(([p, text]) => ({ path: p, text })) }];
  const A = "Първо изречение. Второ изречение.";
  const B = "Трето.";
  const recorded = ledgerOf(unit([["a", A], ["b", B]]));
  const store = new Map([A, B].map((t) => [hashOf(t), t]));

  it("an unchanged unit reports nothing", () => {
    expect(diffSurface("template", recorded, unit([["a", A], ["b", B]]), store)).toEqual([]);
  });

  it("a CHANGED string reports its field, the sentence that left and the sentence that came — and not the sentence that stayed", () => {
    const changes = diffSurface("template", recorded, unit([["a", "Първо изречение. В бързата лента не се пътува."], ["b", B]]), store);
    expect(changes).toEqual([
      { surface: "template", unit: "sc-x", path: "a", kind: "changed", oldSentences: ["Второ изречение."], newSentences: ["В бързата лента не се пътува."] },
    ]);
    const text = formatChanges(changes);
    expect(text).toContain("[template] sc-x · a — CHANGED");
    expect(text).toContain("− Второ изречение.");
    expect(text).toContain("+ В бързата лента не се пътува.");
  });

  it("an ADDED string, a REMOVED string, a new unit and a removed unit are each reported with their sentences", () => {
    expect(diffSurface("template", recorded, unit([["a", A], ["b", B], ["c", "Ново."]]), store)).toEqual([
      { surface: "template", unit: "sc-x", path: "c", kind: "added", oldSentences: [], newSentences: ["Ново."] },
    ]);
    expect(diffSurface("template", recorded, unit([["a", A]]), store)).toEqual([
      { surface: "template", unit: "sc-x", path: "(removed)", kind: "removed", oldSentences: ["Трето."], newSentences: [] },
    ]);
    expect(diffSurface("template", new Map(), unit([["a", B]]), store)).toEqual([
      { surface: "template", unit: "sc-x", path: "a", kind: "added", oldSentences: [], newSentences: ["Трето."] },
    ]);
    expect(diffSurface("template", recorded, [], store).map((c) => [c.kind, c.path, c.oldSentences])).toEqual([
      ["removed", "(unit removed)", ["Първо изречение.", "Второ изречение."]],
      ["removed", "(unit removed)", ["Трето."]],
    ]);
  });

  it("the same strings under ANOTHER field are a red too (a text moved to where it is shown differently)", () => {
    const changes = diffSurface("template", recorded, unit([["a", A], ["teach.whyBg", B]]), store);
    expect(changes.map((c) => c.kind)).toEqual(["moved"]);
  });

  it("a known sentence shown in a NEW place changes that place's fingerprint (the round-3 V30 / V31 shape)", () => {
    const before = fingerprintOf(recorded);
    const after = fingerprintOf(ledgerOf(unit([["a", A], ["b", B], ["c", B]])));
    expect(after).not.toBe(before);
    expect(diffSurface("template", recorded, unit([["a", A], ["b", B], ["c", B]]), store)).toHaveLength(1);
  });

  it("THE GATE says NO: a changed string, a manifest whose fingerprint or counts are not the tree's, a surface never recorded — and says YES only to the recorded tree", () => {
    const tree = unit([["a", A], ["b", B]]);
    const good = recordOf(recorded);
    expect(gateVerdict("template", recorded, good, tree, store)).toEqual({ ok: true, changes: [], message: "" });
    // a changed string: not ok, and the message carries the surface, the unit, the field and both sentences
    const changed = gateVerdict("template", recorded, good, unit([["a", "Първо изречение. В бързата лента не се пътува."], ["b", B]]), store);
    expect(changed.ok).toBe(false);
    expect(changed.changes).toHaveLength(1);
    for (const part of ["surface «template»", "[template] sc-x · a — CHANGED", "− Второ изречение.", "+ В бързата лента не се пътува.", "RECORD_REVIEWED_TEXT_MANIFEST=1"]) {
      expect(changed.message, part).toContain(part);
    }
    // the same strings, the recorded fingerprint edited by hand: the reporter sees no change, the gate still says no
    expect(gateVerdict("template", recorded, { ...good, fingerprint: `00${good.fingerprint.slice(2)}` }, tree, store).ok).toBe(false);
    expect(gateVerdict("template", recorded, { ...good, strings: good.strings + 1 }, tree, store).ok).toBe(false);
    expect(gateVerdict("template", recorded, { ...good, units: good.units + 1 }, tree, store).ok).toBe(false);
    // a surface with no record at all
    expect(gateVerdict("template", recorded, undefined, tree, store).ok).toBe(false);
  });

  it("PARITY says NO: a copy that is missing, and a copy that says something else", () => {
    const e = (text: string) => [{ path: "events[0].textBg", text }];
    expect(copyParity([{ unit: "l/a", reviewed: e(A), copy: e(A) }])).toEqual({ missing: [], different: [] });
    expect(
      copyParity([
        { unit: "l/a", reviewed: e(A), copy: e(A) },
        { unit: "l/b", reviewed: e(A), copy: null },
        { unit: "l/c", reviewed: e(A), copy: e(B) },
        { unit: "l/d", reviewed: e(A), copy: [] },
        { unit: "l/e", reviewed: e(A), copy: [{ path: "events[1].textBg", text: A }] },
      ]),
    ).toEqual({ missing: ["l/b"], different: ["l/c", "l/d", "l/e"] });
  });

  it("a reviewed sentence missing from the store is named as missing, never printed as empty", () => {
    const changes = diffSurface("template", recorded, unit([["a", A], ["b", "Друго."]]), new Map());
    expect(changes[0].oldSentences.join(" ")).toContain("is not held in strings.");
  });
});
